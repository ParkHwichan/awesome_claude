use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use parking_lot::Mutex;
use portable_pty::{native_pty_system, CommandBuilder, PtyPair, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use sysinfo::{ProcessRefreshKind, System, UpdateKind};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct ChildProcessInfo {
    pub pid: u32,
    pub name: String,
    pub cmd: String,  // Full command line
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalCreateResult {
    pub session_id: String,
    pub shell_pid: u32,
}

struct TerminalInner {
    #[allow(dead_code)]
    pty_pair: PtyPair,
    writer: Box<dyn Write + Send>,
}

pub struct TerminalSession {
    inner: Mutex<TerminalInner>,
    attached: AtomicBool,
    is_alive: AtomicBool,
    pub working_dir: String,
    cols: Mutex<u16>,
    rows: Mutex<u16>,
    shell_pid: AtomicU32,
    child_processes: Mutex<Vec<ChildProcessInfo>>,
    // User-configurable metadata (source of truth)
    title: Mutex<String>,
    color: Mutex<Option<String>>,
}

impl TerminalSession {
    fn write(&self, data: &[u8]) -> Result<(), String> {
        let mut inner = self.inner.lock();
        inner
            .writer
            .write_all(data)
            .map_err(|e| format!("Write failed: {}", e))?;
        inner
            .writer
            .flush()
            .map_err(|e| format!("Flush failed: {}", e))
    }

    fn resize(&self, cols: u16, rows: u16) -> Result<(), String> {
        {
            let inner = self.inner.lock();
            inner
                .pty_pair
                .master
                .resize(PtySize {
                    rows,
                    cols,
                    pixel_width: 0,
                    pixel_height: 0,
                })
                .map_err(|e| format!("Resize failed: {}", e))?;
        }
        *self.cols.lock() = cols;
        *self.rows.lock() = rows;
        Ok(())
    }
}

pub struct TerminalManager {
    sessions: Mutex<HashMap<String, Arc<TerminalSession>>>,
}

impl Default for TerminalManager {
    fn default() -> Self {
        Self::new()
    }
}

impl TerminalManager {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }

    /// Create new session, returns session_id and shell_pid
    pub fn create(
        &self,
        working_dir: &str,
        cols: u16,
        rows: u16,
        app_handle: AppHandle,
    ) -> Result<TerminalCreateResult, String> {
        let session_id = Uuid::new_v4().to_string();
        println!(
            "[Terminal] Creating session {} in {} ({}x{})",
            session_id, working_dir, cols, rows
        );

        let pty_system = native_pty_system();
        let pty_pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to open PTY: {}", e))?;

        let cmd = {
            #[cfg(target_os = "windows")]
            {
                // Use PowerShell
                let mut c = CommandBuilder::new("powershell.exe");
                c.args(["-NoLogo", "-NoExit"]);
                c.cwd(working_dir);
                c.env("TERM", "xterm-256color");
                c.env("COLORTERM", "truecolor");
                c.env("FORCE_COLOR", "1");
                c.env("VIRTUAL_TERMINAL_LEVEL", "1");
                if let Ok(path) = std::env::var("PATH") {
                    c.env("PATH", path);
                }
                if let Ok(home) = std::env::var("USERPROFILE") {
                    c.env("USERPROFILE", &home);
                    c.env("HOME", &home);
                }
                if let Ok(appdata) = std::env::var("APPDATA") {
                    c.env("APPDATA", appdata);
                }
                if let Ok(localappdata) = std::env::var("LOCALAPPDATA") {
                    c.env("LOCALAPPDATA", localappdata);
                }
                c
            }
            #[cfg(not(target_os = "windows"))]
            {
                let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
                let mut c = CommandBuilder::new(&shell);
                c.cwd(working_dir);
                c.env("TERM", "xterm-256color");
                c.env("COLORTERM", "truecolor");
                c.env("FORCE_COLOR", "1");
                c
            }
        };

        let mut child = pty_pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("Failed to spawn: {}", e))?;

        // Get shell PID for child process tracking
        let shell_pid = child.process_id().unwrap_or(0);
        println!("[Terminal] Shell PID: {}", shell_pid);

        let writer = pty_pair
            .master
            .take_writer()
            .map_err(|e| format!("Failed to get writer: {}", e))?;
        let mut reader = pty_pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("Failed to get reader: {}", e))?;

        // Generate default title based on existing session count
        let session_count = self.sessions.lock().len();
        let default_title = format!("Terminal {}", session_count + 1);

        let session = Arc::new(TerminalSession {
            inner: Mutex::new(TerminalInner { pty_pair, writer }),
            attached: AtomicBool::new(false),
            is_alive: AtomicBool::new(true),
            working_dir: working_dir.to_string(),
            cols: Mutex::new(cols),
            rows: Mutex::new(rows),
            shell_pid: AtomicU32::new(shell_pid),
            child_processes: Mutex::new(Vec::new()),
            title: Mutex::new(default_title),
            color: Mutex::new(None),
        });

        // Reader thread - reads from PTY and sends raw bytes as base64
        let session_clone = Arc::clone(&session);
        let sid = session_id.clone();
        let app_handle_clone = app_handle.clone();
        std::thread::spawn(move || {
            let mut buf = [0u8; 4096];

            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        // Send raw bytes as base64 if attached
                        if session_clone.attached.load(Ordering::SeqCst) {
                            let data = &buf[..n];
                            let encoded = BASE64.encode(data);
                            let _ = app_handle_clone
                                .emit(&format!("terminal:data:{}", sid), &encoded);
                        }
                    }
                    Err(_) => break,
                }
            }

            session_clone.is_alive.store(false, Ordering::SeqCst);
            let _ = app_handle_clone.emit(&format!("terminal:exit:{}", sid), ());
        });

        // Child process waiter
        std::thread::spawn(move || {
            let _ = child.wait();
        });

        // Child process monitor - tracks ALL descendant processes of the shell
        let session_monitor = Arc::clone(&session);
        let sid_monitor = session_id.clone();
        let app_handle_monitor = app_handle.clone();
        std::thread::spawn(move || {
            let mut sys = System::new();
            let mut last_children: Vec<ChildProcessInfo> = Vec::new();

            while session_monitor.is_alive.load(Ordering::SeqCst) {
                let shell_pid = session_monitor.shell_pid.load(Ordering::SeqCst);
                if shell_pid == 0 {
                    std::thread::sleep(std::time::Duration::from_millis(500));
                    continue;
                }

                sys.refresh_processes_specifics(
                    sysinfo::ProcessesToUpdate::All,
                    true,
                    ProcessRefreshKind::new().with_cmd(UpdateKind::Always),
                );

                // Find ALL descendant processes (children, grandchildren, etc.)
                let mut descendants: Vec<ChildProcessInfo> = Vec::new();
                let mut pids_to_check: Vec<u32> = vec![shell_pid];
                let mut checked_pids: std::collections::HashSet<u32> = std::collections::HashSet::new();
                checked_pids.insert(shell_pid);

                while let Some(parent_pid) = pids_to_check.pop() {
                    for (pid, process) in sys.processes() {
                        let pid_u32 = pid.as_u32();
                        if checked_pids.contains(&pid_u32) {
                            continue;
                        }
                        if let Some(proc_parent) = process.parent() {
                            if proc_parent.as_u32() == parent_pid {
                                descendants.push(ChildProcessInfo {
                                    pid: pid_u32,
                                    name: process.name().to_string_lossy().to_string(),
                                    cmd: process.cmd().iter().map(|s| s.to_string_lossy().to_string()).collect::<Vec<_>>().join(" "),
                                });
                                pids_to_check.push(pid_u32);
                                checked_pids.insert(pid_u32);
                            }
                        }
                    }
                }

                // Update session and send event if descendants changed
                if descendants != last_children {
                    // Store in session for API access
                    *session_monitor.child_processes.lock() = descendants.clone();
                    // Also emit event for real-time updates
                    let _ = app_handle_monitor.emit(
                        &format!("terminal:children:{}", sid_monitor),
                        &descendants,
                    );
                    last_children = descendants;
                }

                std::thread::sleep(std::time::Duration::from_millis(300));
            }
        });

        self.sessions.lock().insert(session_id.clone(), session);
        Ok(TerminalCreateResult { session_id, shell_pid })
    }

    /// Attach to existing session
    pub fn attach(&self, session_id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let sessions = self.sessions.lock();
        let session = sessions
            .get(session_id)
            .ok_or_else(|| format!("Session not found: {}", session_id))?;

        if !session.is_alive.load(Ordering::SeqCst) {
            return Err("Session is dead".to_string());
        }

        session.attached.store(true, Ordering::SeqCst);
        session.resize(cols, rows)?;
        Ok(())
    }

    pub fn detach(&self, session_id: &str) -> Result<(), String> {
        let sessions = self.sessions.lock();
        if let Some(session) = sessions.get(session_id) {
            session.attached.store(false, Ordering::SeqCst);
        }
        Ok(())
    }

    pub fn write(&self, session_id: &str, data: &str) -> Result<(), String> {
        let sessions = self.sessions.lock();
        let session = sessions
            .get(session_id)
            .ok_or_else(|| format!("Session not found: {}", session_id))?;
        session.write(data.as_bytes())
    }

    pub fn resize(&self, session_id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let sessions = self.sessions.lock();
        let session = sessions
            .get(session_id)
            .ok_or_else(|| format!("Session not found: {}", session_id))?;
        session.resize(cols, rows)
    }

    pub fn kill(&self, session_id: &str) -> Result<(), String> {
        if let Some(session) = self.sessions.lock().remove(session_id) {
            session.is_alive.store(false, Ordering::SeqCst);
        }
        Ok(())
    }

    /// List all sessions (for reconnection)
    pub fn list(&self) -> Vec<TerminalSessionInfo> {
        self.sessions
            .lock()
            .iter()
            .map(|(id, s)| TerminalSessionInfo {
                session_id: id.clone(),
                working_dir: s.working_dir.clone(),
                shell_pid: s.shell_pid.load(Ordering::SeqCst),
                is_alive: s.is_alive.load(Ordering::SeqCst),
                child_processes: s.child_processes.lock().clone(),
                title: s.title.lock().clone(),
                color: s.color.lock().clone(),
            })
            .collect()
    }

    /// Update terminal metadata (title, color)
    pub fn update(&self, session_id: &str, title: Option<String>, color: Option<Option<String>>) -> Result<(), String> {
        let sessions = self.sessions.lock();
        let session = sessions
            .get(session_id)
            .ok_or_else(|| format!("Session not found: {}", session_id))?;

        if let Some(t) = title {
            *session.title.lock() = t;
        }
        if let Some(c) = color {
            *session.color.lock() = c;
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSessionInfo {
    pub session_id: String,
    pub working_dir: String,
    pub shell_pid: u32,
    pub is_alive: bool,
    pub child_processes: Vec<ChildProcessInfo>,
    pub title: String,
    pub color: Option<String>,
}
