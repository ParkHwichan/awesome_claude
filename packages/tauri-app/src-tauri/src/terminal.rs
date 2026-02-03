use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use parking_lot::Mutex;
use portable_pty::{native_pty_system, CommandBuilder, PtyPair, PtySize};
use serde::Serialize;
use std::collections::{HashMap, VecDeque};
use std::fs;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicUsize, Ordering};
use std::sync::Arc;
use sysinfo::{ProcessRefreshKind, System, UpdateKind};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

// Global counter for terminal numbering (monotonically increasing)
static TERMINAL_COUNTER: AtomicUsize = AtomicUsize::new(0);
const MAX_OUTPUT_BUFFER: usize = 1024 * 1024; // 1MB ring buffer

/// Create a custom bashrc for WSL with shell integration
#[cfg(target_os = "windows")]
fn ensure_wsl_bashrc() -> Option<String> {
    const SHELL_INTEGRATION: &str = include_str!("../../src/assets/shell-integration/awesome-claude.bash");

    // Create custom bashrc content - pure WSL environment
    let bashrc_content = format!(
        r#"# Awesome Claude WSL bashrc
# Source system bashrc first
if [ -f /etc/bash.bashrc ]; then
    . /etc/bash.bashrc
fi

# Source user's bashrc
if [ -f ~/.bashrc ]; then
    . ~/.bashrc
fi

# Ensure Claude paths are in PATH
export PATH="$HOME/.local/bin:$HOME/.claude/bin:$PATH"

# Convert Windows .claude.json for WSL
WINDOWS_CLAUDE_JSON="${{WINDOWS_CLAUDE_JSON:-}}"
if [ -n "$WINDOWS_CLAUDE_JSON" ] && [ -f "$WINDOWS_CLAUDE_JSON" ]; then
    # Simple sed conversion - fix commands for WSL
    sed -e 's/"command": "cmd"/"command": "cmd.exe"/g' \
        -e 's/"command": "node"/"command": "node.exe"/g' \
        -e 's/"command": "npx"/"command": "npx.cmd"/g' \
        "$WINDOWS_CLAUDE_JSON" > "$HOME/.claude.json.tmp"

    if ! cmp -s "$HOME/.claude.json.tmp" "$HOME/.claude.json" 2>/dev/null; then
        mv "$HOME/.claude.json.tmp" "$HOME/.claude.json"
        echo "Configured .claude.json for WSL"
    else
        rm -f "$HOME/.claude.json.tmp"
    fi
fi

# Link .claude directory if exists
WINDOWS_CLAUDE_DIR="${{WINDOWS_CLAUDE_HOME:-}}"
if [ -n "$WINDOWS_CLAUDE_DIR" ] && [ -d "$WINDOWS_CLAUDE_DIR" ]; then
    if [ ! -L "$HOME/.claude" ]; then
        rm -rf "$HOME/.claude"
        ln -s "$WINDOWS_CLAUDE_DIR" "$HOME/.claude"
    fi
fi

# Auto-install Claude Code if not present
if ! command -v claude &> /dev/null; then
    echo "Claude Code not found. Installing..."
    curl -fsSL https://claude.ai/install.sh | bash
fi

# Shell integration
{}
"#,
        SHELL_INTEGRATION.replace("\r\n", "\n")
    );

    let windows_path = std::env::temp_dir().join("awesome-claude-wsl.bashrc");
    if fs::write(&windows_path, &bashrc_content).is_err() {
        return None;
    }

    // Convert to WSL path
    let path_str = windows_path.to_string_lossy();
    if path_str.len() >= 2 && path_str.chars().nth(1) == Some(':') {
        let drive = path_str.chars().next().unwrap().to_ascii_lowercase();
        let rest = path_str[2..].replace('\\', "/");
        return Some(format!("/mnt/{}{}", drive, rest));
    }

    None
}

/// Convert Windows path to WSL path format
#[cfg(target_os = "windows")]
fn windows_to_wsl_path(windows_path: &str) -> String {
    let path_str = windows_path.replace('\\', "/");
    let path_str = path_str.strip_prefix("//?/").unwrap_or(&path_str);

    if path_str.len() >= 2 && path_str.chars().nth(1) == Some(':') {
        let drive = path_str.chars().next().unwrap().to_ascii_lowercase();
        let rest = &path_str[2..];
        format!("/mnt/{}{}", drive, rest)
    } else {
        path_str.to_string()
    }
}

/// Get child processes running inside WSL using `ps` command
/// Tracks the process tree from our shell's descendants
#[cfg(target_os = "windows")]
fn get_wsl_child_processes(_shell_pid: u32) -> Vec<ChildProcessInfo> {
    use std::process::Command;
    use std::collections::{HashMap, HashSet};

    // Run `ps -eo pid,ppid,comm,args --no-headers` inside WSL
    let output = match Command::new("wsl")
        .args(["--", "ps", "-eo", "pid,ppid,comm,args", "--no-headers"])
        .output()
    {
        Ok(o) => o,
        Err(_) => return Vec::new(),
    };

    if !output.status.success() {
        return Vec::new();
    }

    let stdout = String::from_utf8_lossy(&output.stdout);

    // Parse all processes into a map: pid -> (ppid, name, cmd)
    let mut process_map: HashMap<u32, (u32, String, String)> = HashMap::new();
    let mut children_map: HashMap<u32, Vec<u32>> = HashMap::new();

    for line in stdout.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 3 {
            continue;
        }

        let pid: u32 = match parts[0].parse() {
            Ok(p) => p,
            Err(_) => continue,
        };

        let ppid: u32 = match parts[1].parse() {
            Ok(p) => p,
            Err(_) => continue,
        };

        let name = parts[2].to_string();
        let cmd = if parts.len() > 3 { parts[3..].join(" ") } else { name.clone() };

        process_map.insert(pid, (ppid, name, cmd));
        children_map.entry(ppid).or_default().push(pid);
    }

    // Find our shell: look for bash processes that are interactive (have our rcfile pattern)
    // or find the bash that's running our custom bashrc
    let mut shell_pids: Vec<u32> = Vec::new();
    for (pid, (_, name, cmd)) in &process_map {
        if name == "bash" && (cmd.contains("awesome-claude") || cmd.contains("--rcfile")) {
            shell_pids.push(*pid);
        }
    }

    // If no specific shell found, look for any interactive bash that has children
    if shell_pids.is_empty() {
        for (pid, (_, name, _)) in &process_map {
            if name == "bash" && children_map.contains_key(pid) {
                shell_pids.push(*pid);
            }
        }
    }

    // Collect all descendants of our shell(s)
    let mut descendants: HashSet<u32> = HashSet::new();
    let mut to_visit: Vec<u32> = shell_pids.clone();

    while let Some(pid) = to_visit.pop() {
        if let Some(children) = children_map.get(&pid) {
            for &child_pid in children {
                if descendants.insert(child_pid) {
                    to_visit.push(child_pid);
                }
            }
        }
    }

    // Build result, filtering out system/shell processes
    let mut processes: Vec<ChildProcessInfo> = Vec::new();
    let skip_names: HashSet<&str> = ["bash", "ps", "init", "wsl", "sh", "grep", "awk", "sed"].into_iter().collect();

    for pid in descendants {
        if let Some((_, name, cmd)) = process_map.get(&pid) {
            // Skip system and shell processes
            if skip_names.contains(name.as_str()) {
                continue;
            }

            processes.push(ChildProcessInfo {
                pid,
                name: name.clone(),
                cmd: cmd.clone(),
            });
        }
    }

    processes.sort_by_key(|p| p.pid);
    processes
}

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
    last_children_hash: Mutex<u64>,  // Hash for quick change detection
    // User-configurable metadata (source of truth)
    title: Mutex<String>,
    color: Mutex<Option<String>>,
    output_buffer: Mutex<VecDeque<u8>>,
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

    fn buffer_output(&self, data: &[u8]) {
        let mut buf = self.output_buffer.lock();
        buf.extend(data);
        if buf.len() > MAX_OUTPUT_BUFFER {
            let overflow = buf.len() - MAX_OUTPUT_BUFFER;
            for _ in 0..overflow {
                buf.pop_front();
            }
        }
    }

    fn snapshot_output_buffer(&self) -> Vec<u8> {
        let buf = self.output_buffer.lock();
        buf.iter().copied().collect()
    }
}

/// Shared state for the process monitor
struct ProcessMonitorState {
    sessions: Arc<Mutex<HashMap<String, Arc<TerminalSession>>>>,
    app_handle: Mutex<Option<AppHandle>>,
    monitor_running: AtomicBool,
}

pub struct TerminalManager {
    state: Arc<ProcessMonitorState>,
}

impl Default for TerminalManager {
    fn default() -> Self {
        Self::new()
    }
}

impl TerminalManager {
    pub fn new() -> Self {
        Self {
            state: Arc::new(ProcessMonitorState {
                sessions: Arc::new(Mutex::new(HashMap::new())),
                app_handle: Mutex::new(None),
                monitor_running: AtomicBool::new(false),
            }),
        }
    }

    /// Start the shared process monitor if not already running
    fn ensure_process_monitor_running(&self, app_handle: AppHandle) {
        // Store app_handle for later use
        *self.state.app_handle.lock() = Some(app_handle.clone());

        // Only start if not already running
        if self.state.monitor_running.swap(true, Ordering::SeqCst) {
            return;
        }

        let state = Arc::clone(&self.state);
        std::thread::spawn(move || {
            let mut sys = System::new();

            loop {
                // Sleep at the start to allow initial session setup
                std::thread::sleep(std::time::Duration::from_millis(1000));

                // Refresh all processes once per cycle
                sys.refresh_processes_specifics(
                    sysinfo::ProcessesToUpdate::All,
                    true,
                    ProcessRefreshKind::new().with_cmd(UpdateKind::Always),
                );

                // Get app_handle
                let app_handle = match state.app_handle.lock().clone() {
                    Some(h) => h,
                    None => continue,
                };

                // Collect session info to avoid holding lock during processing
                let sessions_snapshot: Vec<(String, u32, bool)> = {
                    let sessions = state.sessions.lock();
                    if sessions.is_empty() {
                        // No sessions, keep monitor alive but idle
                        continue;
                    }
                    sessions.iter()
                        .filter(|(_, s)| s.is_alive.load(Ordering::SeqCst))
                        .map(|(id, s)| (id.clone(), s.shell_pid.load(Ordering::SeqCst), s.is_alive.load(Ordering::SeqCst)))
                        .collect()
                };

                // Process each session using the already-loaded process data
                for (session_id, shell_pid, _) in sessions_snapshot {
                    if shell_pid == 0 {
                        continue;
                    }

                    // For WSL sessions, we need to query processes inside WSL
                    #[cfg(target_os = "windows")]
                    let mut descendants = get_wsl_child_processes(shell_pid);

                    #[cfg(not(target_os = "windows"))]
                    let descendants = {
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
                        descendants
                    };

                    // Sort for consistent comparison
                    descendants.sort_by_key(|p| p.pid);

                    // Calculate hash for quick comparison
                    use std::hash::{Hash, Hasher};
                    let mut hasher = std::collections::hash_map::DefaultHasher::new();
                    for p in &descendants {
                        p.pid.hash(&mut hasher);
                        p.name.hash(&mut hasher);
                    }
                    let new_hash = hasher.finish();

                    // Update session if changed
                    let should_emit = {
                        let sessions = state.sessions.lock();
                        if let Some(session) = sessions.get(&session_id) {
                            let mut last_hash = session.last_children_hash.lock();
                            if *last_hash != new_hash {
                                *last_hash = new_hash;
                                *session.child_processes.lock() = descendants.clone();
                                true
                            } else {
                                false
                            }
                        } else {
                            false
                        }
                    };

                    if should_emit {
                        let _ = app_handle.emit(
                            &format!("terminal:children:{}", session_id),
                            &descendants,
                        );
                    }
                }
            }
        });
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
                // Use WSL bash with custom rcfile that includes Windows PATH
                let mut c = CommandBuilder::new("wsl.exe");

                let wsl_cwd = windows_to_wsl_path(working_dir);

                // Create custom bashrc with Windows PATH and shell integration
                let bash_cmd = if let Some(rcfile) = ensure_wsl_bashrc() {
                    format!(
                        "cd '{}' && exec bash --rcfile '{}' -i",
                        wsl_cwd.replace('\'', "'\\''"),
                        rcfile.replace('\'', "'\\''")
                    )
                } else {
                    format!(
                        "cd '{}' && exec bash -i",
                        wsl_cwd.replace('\'', "'\\''")
                    )
                };

                c.args(["--", "bash", "-c", &bash_cmd]);
                c.env("TERM", "xterm-256color");
                c.env("COLORTERM", "truecolor");

                // Pass Windows Claude config paths to WSL
                if let Ok(userprofile) = std::env::var("USERPROFILE") {
                    let wsl_userprofile = windows_to_wsl_path(&userprofile);
                    let windows_claude_dir = format!("{}/.claude", wsl_userprofile);
                    let windows_claude_json = format!("{}/.claude.json", wsl_userprofile);
                    c.env("WINDOWS_CLAUDE_HOME", &windows_claude_dir);
                    c.env("WINDOWS_CLAUDE_JSON", &windows_claude_json);
                    c.env("WSLENV", "TERM:COLORTERM:WINDOWS_CLAUDE_HOME:WINDOWS_CLAUDE_JSON");
                } else {
                    c.env("WSLENV", "TERM:COLORTERM");
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

        // Generate default title with monotonically increasing counter
        let terminal_number = TERMINAL_COUNTER.fetch_add(1, Ordering::SeqCst) + 1;
        let default_title = format!("Terminal {}", terminal_number);

        let session = Arc::new(TerminalSession {
            inner: Mutex::new(TerminalInner { pty_pair, writer }),
            attached: AtomicBool::new(false),
            is_alive: AtomicBool::new(true),
            working_dir: working_dir.to_string(),
            cols: Mutex::new(cols),
            rows: Mutex::new(rows),
            shell_pid: AtomicU32::new(shell_pid),
            child_processes: Mutex::new(Vec::new()),
            last_children_hash: Mutex::new(0),
            title: Mutex::new(default_title),
            color: Mutex::new(None),
            output_buffer: Mutex::new(VecDeque::new()),
        });

        // Reader thread - reads from PTY and sends raw bytes as base64
        let session_clone = Arc::clone(&session);
        let sid = session_id.clone();
        let app_handle_clone = app_handle.clone();
        std::thread::spawn(move || {
            let mut buf = [0u8; 8192];  // 8KB chunks for reduced syscall overhead

            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let data = &buf[..n];
                        session_clone.buffer_output(data);
                        if session_clone.attached.load(Ordering::SeqCst) {
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

        // Insert session and start shared monitor
        self.state.sessions.lock().insert(session_id.clone(), session);

        // Ensure shared process monitor is running
        self.ensure_process_monitor_running(app_handle.clone());

        // Emit terminal-list-changed event
        let _ = app_handle.emit("terminal-list-changed", ());

        Ok(TerminalCreateResult { session_id, shell_pid })
    }

    /// Attach to existing session
    pub fn attach(&self, session_id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let sessions = self.state.sessions.lock();
        let session = sessions
            .get(session_id)
            .ok_or_else(|| format!("Session not found: {}", session_id))?;

        if !session.is_alive.load(Ordering::SeqCst) {
            return Err("Session is dead".to_string());
        }

        // IMPORTANT: Resize BEFORE setting attached to ensure correct dimensions
        // before data starts flowing
        session.resize(cols, rows)?;
        // Reset screen then replay buffered output so cursor state is realigned.
        if let Some(app_handle) = self.state.app_handle.lock().clone() {
            let reset = b"\x1b[2J\x1b[H";
            let _ = app_handle.emit(
                &format!("terminal:data:{}", session_id),
                &BASE64.encode(reset),
            );
            let backlog = session.snapshot_output_buffer();
            if !backlog.is_empty() {
                let mut offset = 0;
                while offset < backlog.len() {
                    let end = (offset + 8192).min(backlog.len());
                    let encoded = BASE64.encode(&backlog[offset..end]);
                    let _ = app_handle.emit(
                        &format!("terminal:data:{}", session_id),
                        &encoded,
                    );
                    offset = end;
                }
            }
        }
        session.attached.store(true, Ordering::SeqCst);
        Ok(())
    }

    pub fn detach(&self, session_id: &str) -> Result<(), String> {
        let sessions = self.state.sessions.lock();
        if let Some(session) = sessions.get(session_id) {
            session.attached.store(false, Ordering::SeqCst);
        }
        Ok(())
    }

    pub fn write(&self, session_id: &str, data: &str) -> Result<(), String> {
        let sessions = self.state.sessions.lock();
        let session = sessions
            .get(session_id)
            .ok_or_else(|| format!("Session not found: {}", session_id))?;
        session.write(data.as_bytes())
    }

    pub fn resize(&self, session_id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let sessions = self.state.sessions.lock();
        let session = sessions
            .get(session_id)
            .ok_or_else(|| format!("Session not found: {}", session_id))?;
        session.resize(cols, rows)
    }

    /// Reset terminal state and clear buffer - fixes cursor sync issues
    pub fn reset(&self, session_id: &str) -> Result<(), String> {
        let sessions = self.state.sessions.lock();
        let session = sessions
            .get(session_id)
            .ok_or_else(|| format!("Session not found: {}", session_id))?;

        // Clear the output buffer
        {
            let mut buf = session.output_buffer.lock();
            buf.clear();
        }

        // Send RIS (Reset to Initial State) to PTY
        // This resets: cursor position, attributes, modes, tabs, character sets
        let ris = b"\x1bc";
        session.write(ris)?;

        // Also send to frontend to reset xterm state
        if let Some(app_handle) = self.state.app_handle.lock().clone() {
            let _ = app_handle.emit(
                &format!("terminal:data:{}", session_id),
                &BASE64.encode(ris),
            );
        }

        Ok(())
    }

    /// Soft reset - clear screen and redraw prompt without full reset
    pub fn soft_reset(&self, session_id: &str) -> Result<(), String> {
        let sessions = self.state.sessions.lock();
        let session = sessions
            .get(session_id)
            .ok_or_else(|| format!("Session not found: {}", session_id))?;

        // DECSTR (Soft Terminal Reset) + clear screen + home cursor
        // Then send Ctrl+L to redraw prompt
        let reset_seq = b"\x1b[!p\x1b[2J\x1b[H\x0c";
        session.write(reset_seq)?;

        if let Some(app_handle) = self.state.app_handle.lock().clone() {
            // Send clear + home to frontend
            let frontend_reset = b"\x1b[2J\x1b[H";
            let _ = app_handle.emit(
                &format!("terminal:data:{}", session_id),
                &BASE64.encode(frontend_reset),
            );
        }

        Ok(())
    }

    pub fn kill(&self, session_id: &str, app_handle: AppHandle) -> Result<(), String> {
        if let Some(session) = self.state.sessions.lock().remove(session_id) {
            session.is_alive.store(false, Ordering::SeqCst);
            // Emit terminal-list-changed event
            let _ = app_handle.emit("terminal-list-changed", ());
        }
        Ok(())
    }

    /// List all sessions (for reconnection)
    pub fn list(&self) -> Vec<TerminalSessionInfo> {
        self.state.sessions
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
        let sessions = self.state.sessions.lock();
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
