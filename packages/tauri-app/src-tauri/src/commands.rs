use crate::database::{self, Project, ProjectSummary, Session, Ticket};
use crate::terminal::{TerminalCreateResult, TerminalManager, TerminalSessionInfo};
use serde::Serialize;
use std::fs;
use std::path::Path;
use std::process::Command;
use tauri::State;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InitialData {
    pub projects: Vec<ProjectSummary>,
    pub sessions: Vec<Session>,
    pub tickets: Vec<Ticket>,
}

#[tauri::command]
pub async fn get_initial_data() -> Result<InitialData, String> {
    let projects = database::list_projects().map_err(|e| e.to_string())?;
    let sessions = database::list_sessions().map_err(|e| e.to_string())?;
    let tickets = database::list_tickets().map_err(|e| e.to_string())?;

    Ok(InitialData {
        projects,
        sessions,
        tickets,
    })
}

#[tauri::command]
pub async fn get_projects() -> Result<Vec<ProjectSummary>, String> {
    database::list_projects().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_sessions() -> Result<Vec<Session>, String> {
    database::list_sessions().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_tickets() -> Result<Vec<Ticket>, String> {
    database::list_tickets().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cleanup_dead_sessions() -> Result<usize, String> {
    database::cleanup_dead_sessions().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn disconnect_session(session_id: String) -> Result<String, String> {
    let (project_id,) = database::mark_session_disconnected(&session_id)
        .map_err(|e| e.to_string())?;
    Ok(project_id)
}

#[tauri::command]
pub async fn update_ticket(
    id: String,
    title: String,
    description: Option<String>,
    status: String,
    priority: String,
) -> Result<Ticket, String> {
    database::update_ticket(&id, &title, description.as_deref(), &status, &priority)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_ticket(id: String) -> Result<(), String> {
    database::delete_ticket(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_project(name: String, working_directory: String) -> Result<Project, String> {
    database::create_project(&name, &working_directory).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_project(id: String) -> Result<(), String> {
    database::delete_project(&id).map_err(|e| e.to_string())
}

// ============ Terminal Commands ============

/// Create new terminal session, returns session_id and shell_pid
#[tauri::command]
pub async fn terminal_create(
    working_dir: String,
    cols: u16,
    rows: u16,
    terminal_manager: State<'_, TerminalManager>,
    app_handle: tauri::AppHandle,
) -> Result<TerminalCreateResult, String> {
    terminal_manager.create(&working_dir, cols, rows, app_handle)
}

/// Attach to existing session
#[tauri::command]
pub async fn terminal_attach(
    session_id: String,
    cols: u16,
    rows: u16,
    terminal_manager: State<'_, TerminalManager>,
) -> Result<(), String> {
    terminal_manager.attach(&session_id, cols, rows)
}

/// Detach from terminal (session stays alive)
#[tauri::command]
pub async fn terminal_detach(
    session_id: String,
    terminal_manager: State<'_, TerminalManager>,
) -> Result<(), String> {
    terminal_manager.detach(&session_id)
}

/// Write data to terminal
#[tauri::command]
pub async fn terminal_write(
    session_id: String,
    data: String,
    terminal_manager: State<'_, TerminalManager>,
) -> Result<(), String> {
    terminal_manager.write(&session_id, &data)
}

/// Resize terminal
#[tauri::command]
pub async fn terminal_resize(
    session_id: String,
    cols: u16,
    rows: u16,
    terminal_manager: State<'_, TerminalManager>,
) -> Result<(), String> {
    terminal_manager.resize(&session_id, cols, rows)
}

/// Kill terminal session
#[tauri::command]
pub async fn terminal_kill(
    session_id: String,
    terminal_manager: State<'_, TerminalManager>,
) -> Result<(), String> {
    terminal_manager.kill(&session_id)
}

/// List all sessions
#[tauri::command]
pub async fn terminal_list(
    terminal_manager: State<'_, TerminalManager>,
) -> Result<Vec<TerminalSessionInfo>, String> {
    Ok(terminal_manager.list())
}

// ============ External Terminal Commands ============

/// Open external terminal with Claude Code at the specified directory
#[tauri::command]
pub async fn open_claude_terminal(working_dir: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        // Try Windows Terminal first, fall back to cmd
        let wt_result = Command::new("wt")
            .args(["-d", &working_dir, "cmd", "/k", "claude"])
            .spawn();

        if wt_result.is_ok() {
            return Ok(());
        }

        // Fallback to cmd
        Command::new("cmd")
            .args(["/c", "start", "cmd", "/k", &format!("cd /d {} && claude", working_dir)])
            .spawn()
            .map_err(|e| format!("Failed to open terminal: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("osascript")
            .args([
                "-e",
                &format!(
                    r#"tell application "Terminal" to do script "cd '{}' && claude""#,
                    working_dir
                ),
            ])
            .spawn()
            .map_err(|e| format!("Failed to open terminal: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        // Try common terminal emulators
        let terminals = ["gnome-terminal", "konsole", "xterm"];
        let mut success = false;

        for term in &terminals {
            let result = match *term {
                "gnome-terminal" => Command::new(term)
                    .args(["--working-directory", &working_dir, "--", "bash", "-c", "claude; exec bash"])
                    .spawn(),
                "konsole" => Command::new(term)
                    .args(["--workdir", &working_dir, "-e", "bash", "-c", "claude; exec bash"])
                    .spawn(),
                _ => Command::new(term)
                    .args(["-e", &format!("cd '{}' && claude && bash", working_dir)])
                    .spawn(),
            };

            if result.is_ok() {
                success = true;
                break;
            }
        }

        if !success {
            return Err("No supported terminal emulator found".to_string());
        }
    }

    Ok(())
}

// ============ File System Commands ============

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub is_dir: bool,
}

/// List files and directories in the specified path
#[tauri::command]
pub async fn list_directory(path: String) -> Result<Vec<FileEntry>, String> {
    let dir_path = Path::new(&path);

    if !dir_path.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    if !dir_path.is_dir() {
        return Err(format!("Path is not a directory: {}", path));
    }

    let entries = fs::read_dir(dir_path)
        .map_err(|e| format!("Failed to read directory: {}", e))?;

    let mut result: Vec<FileEntry> = Vec::new();

    for entry in entries.flatten() {
        let file_name = entry.file_name().to_string_lossy().to_string();
        let is_dir = entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false);

        // Skip hidden files (starting with .) unless they're common directories
        if file_name.starts_with('.') && !matches!(file_name.as_str(), ".git" | ".vscode" | ".config") {
            continue;
        }

        result.push(FileEntry {
            name: file_name,
            is_dir,
        });
    }

    // Sort: directories first, then alphabetically
    result.sort_by(|a, b| {
        match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    Ok(result)
}
