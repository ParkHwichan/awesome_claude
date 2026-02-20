use crate::database::{self, Project, ProjectSummary, Session, Ticket, TicketEvent};
use crate::orchestrator::OrchestratorManager;
use crate::terminal::{TerminalCreateResult, TerminalManager, TerminalSessionInfo};
use serde::Serialize;
use std::fs;
use std::path::Path;
use std::process::Command;
use tauri::{Emitter, State};

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
    app_handle: tauri::AppHandle,
) -> Result<Ticket, String> {
    let ticket = database::update_ticket(&id, &title, description.as_deref(), &status, &priority)
        .map_err(|e| e.to_string())?;

    // Emit event for real-time sync
    let event = serde_json::json!({
        "type": "ticket:updated",
        "timestamp": chrono_now(),
        "payload": ticket
    });
    let _ = app_handle.emit("mcp-event", event);

    Ok(ticket)
}

#[tauri::command]
pub async fn delete_ticket(id: String, app_handle: tauri::AppHandle) -> Result<(), String> {
    // Get ticket info before deletion for the event
    let tickets = database::list_tickets().map_err(|e| e.to_string())?;
    let ticket = tickets.iter().find(|t| t.id == id);
    let project_id = ticket.map(|t| t.project_id.clone()).unwrap_or_default();

    database::delete_ticket(&id).map_err(|e| e.to_string())?;

    // Emit event for real-time sync
    let event = serde_json::json!({
        "type": "ticket:deleted",
        "timestamp": chrono_now(),
        "payload": {
            "id": id,
            "projectId": project_id
        }
    });
    let _ = app_handle.emit("mcp-event", event);

    Ok(())
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
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    terminal_manager.kill(&session_id, app_handle)
}

/// List all sessions
#[tauri::command]
pub async fn terminal_list(
    terminal_manager: State<'_, TerminalManager>,
) -> Result<Vec<TerminalSessionInfo>, String> {
    Ok(terminal_manager.list())
}

/// Update terminal metadata (title, color)
#[tauri::command]
pub async fn terminal_update(
    session_id: String,
    title: Option<String>,
    color: Option<Option<String>>,
    terminal_manager: State<'_, TerminalManager>,
) -> Result<(), String> {
    terminal_manager.update(&session_id, title, color)
}

/// Hard reset terminal - clears buffer and resets all state
#[tauri::command]
pub async fn terminal_reset(
    session_id: String,
    terminal_manager: State<'_, TerminalManager>,
) -> Result<(), String> {
    terminal_manager.reset(&session_id)
}

/// Soft reset terminal - clears screen and redraws prompt
#[tauri::command]
pub async fn terminal_soft_reset(
    session_id: String,
    terminal_manager: State<'_, TerminalManager>,
) -> Result<(), String> {
    terminal_manager.soft_reset(&session_id)
}

// ============ External Terminal Commands ============

/// Validate and canonicalize a directory path
fn validate_directory(path: &str) -> Result<std::path::PathBuf, String> {
    let dir_path = Path::new(path);

    if !dir_path.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    if !dir_path.is_dir() {
        return Err(format!("Path is not a directory: {}", path));
    }

    // Canonicalize to get absolute path and resolve symlinks
    dir_path.canonicalize()
        .map_err(|e| format!("Failed to resolve path: {}", e))
}

/// Open external terminal with Claude Code at the specified directory
#[tauri::command]
pub async fn open_claude_terminal(working_dir: String) -> Result<(), String> {
    // Validate and canonicalize the path first
    let canonical_path = validate_directory(&working_dir)?;
    let safe_path = canonical_path.to_string_lossy();

    #[cfg(target_os = "windows")]
    {
        // Try Windows Terminal first, fall back to cmd
        let wt_result = Command::new("wt")
            .args(["-d", &*safe_path, "cmd", "/k", "claude"])
            .spawn();

        if wt_result.is_ok() {
            return Ok(());
        }

        // Fallback to cmd - use powershell for safer argument handling
        Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                &format!(
                    "Start-Process cmd -ArgumentList '/k', 'cd /d \"{}\" && claude'",
                    safe_path.replace("'", "''")
                ),
            ])
            .spawn()
            .map_err(|e| format!("Failed to open terminal: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        // Escape single quotes for AppleScript
        let escaped_path = safe_path.replace("'", "'\\''");
        Command::new("osascript")
            .args([
                "-e",
                &format!(
                    r#"tell application "Terminal" to do script "cd '{}' && claude""#,
                    escaped_path
                ),
            ])
            .spawn()
            .map_err(|e| format!("Failed to open terminal: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        // Escape single quotes for shell
        let escaped_path = safe_path.replace("'", "'\\''");

        // Try common terminal emulators
        let terminals = ["gnome-terminal", "konsole", "xterm"];
        let mut success = false;

        for term in &terminals {
            let result = match *term {
                "gnome-terminal" => Command::new(term)
                    .args(["--working-directory", &*safe_path, "--", "bash", "-c", "claude; exec bash"])
                    .spawn(),
                "konsole" => Command::new(term)
                    .args(["--workdir", &*safe_path, "-e", "bash", "-c", "claude; exec bash"])
                    .spawn(),
                _ => Command::new(term)
                    .args(["-e", &format!("cd '{}' && claude && bash", escaped_path)])
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
    // Validate and canonicalize path to prevent traversal attacks
    let canonical_path = validate_directory(&path)?;

    let entries = fs::read_dir(&canonical_path)
        .map_err(|e| format!("Failed to read directory: {}", e))?;

    let mut result: Vec<FileEntry> = Vec::new();

    for entry in entries.flatten() {
        let file_name = entry.file_name().to_string_lossy().to_string();
        let is_dir = entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false);

        // Skip hidden files (starting with .) unless they're common directories or .env* files
        if file_name.starts_with('.')
            && !matches!(file_name.as_str(), ".git" | ".vscode" | ".config" | ".claude" | ".github")
            && !file_name.starts_with(".env")
        {
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

// ============ File Editor Commands ============

/// Read file contents as string
#[tauri::command]
pub async fn read_file(path: String) -> Result<String, String> {
    let file_path = Path::new(&path);

    if !file_path.exists() {
        return Err(format!("File does not exist: {}", path));
    }

    if !file_path.is_file() {
        return Err(format!("Path is not a file: {}", path));
    }

    fs::read_to_string(file_path)
        .map_err(|e| format!("Failed to read file: {}", e))
}

/// Write content to file
#[tauri::command]
pub async fn write_file(path: String, content: String) -> Result<(), String> {
    let file_path = Path::new(&path);

    // Ensure parent directory exists
    if let Some(parent) = file_path.parent() {
        if !parent.exists() {
            return Err(format!("Parent directory does not exist: {}", parent.display()));
        }
    }

    fs::write(file_path, content)
        .map_err(|e| format!("Failed to write file: {}", e))
}

/// Create a new file with optional initial content
#[tauri::command]
pub async fn create_file(path: String, content: Option<String>) -> Result<(), String> {
    let file_path = Path::new(&path);

    if file_path.exists() {
        return Err(format!("File already exists: {}", path));
    }

    // Ensure parent directory exists
    if let Some(parent) = file_path.parent() {
        if !parent.exists() {
            return Err(format!("Parent directory does not exist: {}", parent.display()));
        }
    }

    let content = content.unwrap_or_default();
    fs::write(file_path, content)
        .map_err(|e| format!("Failed to create file: {}", e))
}

/// Create a new directory
#[tauri::command]
pub async fn create_directory(path: String) -> Result<(), String> {
    let dir_path = Path::new(&path);

    if dir_path.exists() {
        return Err(format!("Directory already exists: {}", path));
    }

    fs::create_dir(dir_path)
        .map_err(|e| format!("Failed to create directory: {}", e))
}

/// Delete a file or directory
#[tauri::command]
pub async fn delete_path(path: String) -> Result<(), String> {
    let target_path = Path::new(&path);

    if !target_path.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    if target_path.is_dir() {
        fs::remove_dir_all(target_path)
            .map_err(|e| format!("Failed to delete directory: {}", e))
    } else {
        fs::remove_file(target_path)
            .map_err(|e| format!("Failed to delete file: {}", e))
    }
}

/// Rename/move a file or directory
#[tauri::command]
pub async fn rename_path(old_path: String, new_path: String) -> Result<(), String> {
    let source = Path::new(&old_path);
    let destination = Path::new(&new_path);

    if !source.exists() {
        return Err(format!("Source path does not exist: {}", old_path));
    }

    if destination.exists() {
        return Err(format!("Destination path already exists: {}", new_path));
    }

    fs::rename(source, destination)
        .map_err(|e| format!("Failed to rename: {}", e))
}

// ============ Search Commands ============

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileSearchResult {
    pub path: String,
    pub name: String,
    pub relative_path: String,
}

/// Search for files by name (for Quick Open)
#[tauri::command]
pub async fn search_files_by_name(
    directory: String,
    query: String,
    max_results: Option<usize>,
) -> Result<Vec<FileSearchResult>, String> {
    let dir_path = Path::new(&directory);
    if !dir_path.exists() || !dir_path.is_dir() {
        return Err(format!("Invalid directory: {}", directory));
    }

    let max_results = max_results.unwrap_or(50);
    let query_lower = query.to_lowercase();
    let mut results = Vec::new();

    fn should_skip_dir(name: &str) -> bool {
        matches!(
            name,
            "node_modules" | ".git" | "target" | "dist" | "build" | ".next" | "__pycache__" | ".venv" | "vendor" | ".idea" | ".vscode"
        )
    }

    fn walk_and_search(
        dir: &Path,
        base_dir: &Path,
        query: &str,
        results: &mut Vec<FileSearchResult>,
        max_results: usize,
    ) -> std::io::Result<()> {
        if results.len() >= max_results {
            return Ok(());
        }

        for entry in fs::read_dir(dir)? {
            if results.len() >= max_results {
                break;
            }

            let entry = entry?;
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();

            // Skip hidden files/dirs (except common ones)
            if name.starts_with('.') && !matches!(name.as_str(), ".env" | ".gitignore" | ".dockerignore") {
                continue;
            }

            if path.is_dir() {
                if !should_skip_dir(&name) {
                    walk_and_search(&path, base_dir, query, results, max_results)?;
                }
            } else if path.is_file() {
                let name_lower = name.to_lowercase();

                // Fuzzy match: check if all query chars appear in order
                if fuzzy_match(&name_lower, query) {
                    let relative_path = path.strip_prefix(base_dir)
                        .map(|p| p.to_string_lossy().to_string())
                        .unwrap_or_else(|_| path.to_string_lossy().to_string());

                    results.push(FileSearchResult {
                        path: path.to_string_lossy().to_string(),
                        name,
                        relative_path,
                    });
                }
            }
        }

        Ok(())
    }

    fn fuzzy_match(text: &str, pattern: &str) -> bool {
        if pattern.is_empty() {
            return true;
        }

        let mut pattern_chars = pattern.chars().peekable();
        for c in text.chars() {
            if let Some(&pc) = pattern_chars.peek() {
                if c == pc {
                    pattern_chars.next();
                }
            }
        }
        pattern_chars.peek().is_none()
    }

    walk_and_search(dir_path, dir_path, &query_lower, &mut results, max_results)
        .map_err(|e| format!("Search failed: {}", e))?;

    // Sort by relevance: exact filename match first, then by path length
    results.sort_by(|a, b| {
        let a_exact = a.name.to_lowercase() == query_lower;
        let b_exact = b.name.to_lowercase() == query_lower;

        if a_exact != b_exact {
            return b_exact.cmp(&a_exact);
        }

        let a_starts = a.name.to_lowercase().starts_with(&query_lower);
        let b_starts = b.name.to_lowercase().starts_with(&query_lower);

        if a_starts != b_starts {
            return b_starts.cmp(&a_starts);
        }

        a.relative_path.len().cmp(&b.relative_path.len())
    });

    Ok(results)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchMatch {
    pub file_path: String,
    pub line_number: u32,
    pub line_content: String,
    pub match_start: u32,
    pub match_end: u32,
}

/// Search for text in files within a directory
#[tauri::command]
pub async fn search_in_files(
    directory: String,
    query: String,
    case_sensitive: bool,
    use_regex: bool,
    file_pattern: Option<String>,
) -> Result<Vec<SearchMatch>, String> {
    use std::io::{BufRead, BufReader};

    let dir_path = Path::new(&directory);
    if !dir_path.exists() || !dir_path.is_dir() {
        return Err(format!("Invalid directory: {}", directory));
    }

    let mut results = Vec::new();
    let max_results = 500; // Limit results to prevent UI overload

    // Compile regex pattern if needed
    let pattern = if use_regex {
        if case_sensitive {
            regex::Regex::new(&query).map_err(|e| format!("Invalid regex: {}", e))?
        } else {
            regex::Regex::new(&format!("(?i){}", query)).map_err(|e| format!("Invalid regex: {}", e))?
        }
    } else {
        // Escape special regex characters for literal search
        let escaped = regex::escape(&query);
        if case_sensitive {
            regex::Regex::new(&escaped).unwrap()
        } else {
            regex::Regex::new(&format!("(?i){}", escaped)).unwrap()
        }
    };

    // File extension filter
    let file_extensions: Option<Vec<&str>> = file_pattern.as_ref().map(|p| {
        p.split(',').map(|s| s.trim()).collect()
    });

    fn should_skip_dir(name: &str) -> bool {
        matches!(
            name,
            "node_modules" | ".git" | "target" | "dist" | "build" | ".next" | "__pycache__" | ".venv" | "vendor"
        )
    }

    fn should_skip_file(name: &str, extensions: &Option<Vec<&str>>) -> bool {
        // Skip binary files
        let binary_extensions = [
            "png", "jpg", "jpeg", "gif", "ico", "webp", "svg",
            "woff", "woff2", "ttf", "eot",
            "pdf", "zip", "tar", "gz", "rar",
            "exe", "dll", "so", "dylib",
            "lock", "map",
        ];

        let ext = name.rsplit('.').next().unwrap_or("").to_lowercase();
        if binary_extensions.contains(&ext.as_str()) {
            return true;
        }

        // Check file pattern filter
        if let Some(exts) = extensions {
            !exts.iter().any(|e| {
                let e = e.trim_start_matches('*').trim_start_matches('.');
                ext == e.to_lowercase()
            })
        } else {
            false
        }
    }

    fn search_file(
        file_path: &Path,
        pattern: &regex::Regex,
        results: &mut Vec<SearchMatch>,
        max_results: usize,
    ) -> std::io::Result<()> {
        let file = std::fs::File::open(file_path)?;
        let reader = BufReader::new(file);

        for (line_idx, line_result) in reader.lines().enumerate() {
            if results.len() >= max_results {
                break;
            }

            let line = match line_result {
                Ok(l) => l,
                Err(_) => continue, // Skip lines that can't be read (binary content)
            };

            // Skip very long lines (likely minified code)
            if line.len() > 1000 {
                continue;
            }

            for mat in pattern.find_iter(&line) {
                if results.len() >= max_results {
                    break;
                }

                results.push(SearchMatch {
                    file_path: file_path.to_string_lossy().to_string(),
                    line_number: (line_idx + 1) as u32,
                    line_content: line.clone(),
                    match_start: mat.start() as u32,
                    match_end: mat.end() as u32,
                });
            }
        }

        Ok(())
    }

    fn walk_directory(
        dir: &Path,
        pattern: &regex::Regex,
        extensions: &Option<Vec<&str>>,
        results: &mut Vec<SearchMatch>,
        max_results: usize,
    ) -> std::io::Result<()> {
        if results.len() >= max_results {
            return Ok(());
        }

        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();

            if path.is_dir() {
                if !should_skip_dir(&name) {
                    walk_directory(&path, pattern, extensions, results, max_results)?;
                }
            } else if path.is_file() && !should_skip_file(&name, extensions) {
                let _ = search_file(&path, pattern, results, max_results);
            }
        }

        Ok(())
    }

    walk_directory(dir_path, &pattern, &file_extensions, &mut results, max_results)
        .map_err(|e| format!("Search failed: {}", e))?;

    Ok(results)
}

/// Replace text in a single file
#[tauri::command]
pub async fn replace_in_file(
    file_path: String,
    search: String,
    replacement: String,
    case_sensitive: bool,
    use_regex: bool,
) -> Result<u32, String> {
    let path = Path::new(&file_path);
    if !path.exists() || !path.is_file() {
        return Err(format!("Invalid file: {}", file_path));
    }

    let content = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let pattern = if use_regex {
        if case_sensitive {
            regex::Regex::new(&search).map_err(|e| format!("Invalid regex: {}", e))?
        } else {
            regex::Regex::new(&format!("(?i){}", search)).map_err(|e| format!("Invalid regex: {}", e))?
        }
    } else {
        let escaped = regex::escape(&search);
        if case_sensitive {
            regex::Regex::new(&escaped).unwrap()
        } else {
            regex::Regex::new(&format!("(?i){}", escaped)).unwrap()
        }
    };

    let count = pattern.find_iter(&content).count() as u32;
    let new_content = pattern.replace_all(&content, replacement.as_str());

    fs::write(path, new_content.as_ref())
        .map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(count)
}

// ============ Git Commands ============

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFileStatus {
    pub path: String,
    pub status: String, // "M", "A", "D", "?", "!!" etc
    pub staged: bool,
}

/// Get git status for a directory
#[tauri::command]
pub async fn git_status(directory: String) -> Result<Vec<GitFileStatus>, String> {
    let dir_path = Path::new(&directory);
    if !dir_path.exists() || !dir_path.is_dir() {
        return Err(format!("Invalid directory: {}", directory));
    }

    let output = Command::new("git")
        .args(["status", "--porcelain=v1", "-uall"])
        .current_dir(&directory)
        .output()
        .map_err(|e| format!("Failed to run git status: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("not a git repository") {
            return Ok(Vec::new());
        }
        return Err(format!("Git status failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut files = Vec::new();

    for line in stdout.lines() {
        if line.len() < 4 {
            continue;
        }

        let index_status = line.chars().nth(0).unwrap_or(' ');
        let worktree_status = line.chars().nth(1).unwrap_or(' ');
        let path = line[3..].to_string();

        // Determine status string and staged state
        let (status, staged) = match (index_status, worktree_status) {
            ('?', '?') => ("?", false),
            ('!', '!') => ("!!", false),
            ('M', _) => ("M", true),
            ('A', _) => ("A", true),
            ('D', _) => ("D", true),
            ('R', _) => ("R", true),
            ('C', _) => ("C", true),
            (_, 'M') => ("M", false),
            (_, 'D') => ("D", false),
            _ => continue,
        };

        files.push(GitFileStatus {
            path,
            status: status.to_string(),
            staged,
        });
    }

    Ok(files)
}

/// Get git diff for a file or the entire repository
#[tauri::command]
pub async fn git_diff(directory: String, file_path: Option<String>, staged: bool) -> Result<String, String> {
    let dir_path = Path::new(&directory);
    if !dir_path.exists() || !dir_path.is_dir() {
        return Err(format!("Invalid directory: {}", directory));
    }

    let mut args = vec!["diff"];
    if staged {
        args.push("--cached");
    }

    if let Some(ref path) = file_path {
        args.push("--");
        args.push(path);
    }

    let output = Command::new("git")
        .args(&args)
        .current_dir(&directory)
        .output()
        .map_err(|e| format!("Failed to run git diff: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Git diff failed: {}", stderr));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Stage a file
#[tauri::command]
pub async fn git_stage_file(directory: String, file_path: String) -> Result<(), String> {
    let dir_path = Path::new(&directory);
    if !dir_path.exists() || !dir_path.is_dir() {
        return Err(format!("Invalid directory: {}", directory));
    }

    let output = Command::new("git")
        .args(["add", &file_path])
        .current_dir(&directory)
        .output()
        .map_err(|e| format!("Failed to run git add: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Git add failed: {}", stderr));
    }

    Ok(())
}

/// Unstage a file
#[tauri::command]
pub async fn git_unstage_file(directory: String, file_path: String) -> Result<(), String> {
    let dir_path = Path::new(&directory);
    if !dir_path.exists() || !dir_path.is_dir() {
        return Err(format!("Invalid directory: {}", directory));
    }

    let output = Command::new("git")
        .args(["restore", "--staged", &file_path])
        .current_dir(&directory)
        .output()
        .map_err(|e| format!("Failed to run git restore: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Git restore --staged failed: {}", stderr));
    }

    Ok(())
}

/// Discard changes in a file
#[tauri::command]
pub async fn git_discard_changes(directory: String, file_path: String) -> Result<(), String> {
    let dir_path = Path::new(&directory);
    if !dir_path.exists() || !dir_path.is_dir() {
        return Err(format!("Invalid directory: {}", directory));
    }

    let output = Command::new("git")
        .args(["restore", &file_path])
        .current_dir(&directory)
        .output()
        .map_err(|e| format!("Failed to run git restore: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Git restore failed: {}", stderr));
    }

    Ok(())
}

// ============ TypeScript Config Commands ============

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TsConfigResult {
    pub config_path: String,
    pub compiler_options: serde_json::Value,
    pub paths: Option<serde_json::Value>,
    pub base_url: Option<String>,
}

/// Find and parse tsconfig.json for a given file path
#[tauri::command]
pub async fn find_tsconfig(file_path: String) -> Result<Option<TsConfigResult>, String> {
    let path = Path::new(&file_path);

    // Start from file's directory and walk up
    let mut current_dir = if path.is_file() {
        path.parent().map(|p| p.to_path_buf())
    } else {
        Some(path.to_path_buf())
    };

    while let Some(dir) = current_dir {
        let tsconfig_path = dir.join("tsconfig.json");

        if tsconfig_path.exists() {
            match parse_tsconfig(&tsconfig_path) {
                Ok(result) => return Ok(Some(result)),
                Err(e) => {
                    // Log error but continue searching
                    eprintln!("Failed to parse {}: {}", tsconfig_path.display(), e);
                }
            }
        }

        // Also check for jsconfig.json (for JS projects)
        let jsconfig_path = dir.join("jsconfig.json");
        if jsconfig_path.exists() {
            match parse_tsconfig(&jsconfig_path) {
                Ok(result) => return Ok(Some(result)),
                Err(e) => {
                    eprintln!("Failed to parse {}: {}", jsconfig_path.display(), e);
                }
            }
        }

        current_dir = dir.parent().map(|p| p.to_path_buf());
    }

    Ok(None)
}

fn parse_tsconfig(config_path: &Path) -> Result<TsConfigResult, String> {
    let content = fs::read_to_string(config_path)
        .map_err(|e| format!("Failed to read tsconfig: {}", e))?;

    // Remove comments (tsconfig allows comments)
    let content = remove_json_comments(&content);

    let config: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse tsconfig JSON: {}", e))?;

    let config_dir = config_path.parent().unwrap_or(Path::new("."));

    // Handle extends
    let mut compiler_options = serde_json::json!({});

    if let Some(extends) = config.get("extends").and_then(|v| v.as_str()) {
        if let Ok(base_config) = resolve_extends(extends, config_dir) {
            if let Some(base_opts) = base_config.get("compilerOptions") {
                compiler_options = base_opts.clone();
            }
        }
    }

    // Merge current compilerOptions over base
    if let Some(current_opts) = config.get("compilerOptions") {
        merge_json(&mut compiler_options, current_opts);
    }

    // Extract paths and baseUrl
    let paths = compiler_options.get("paths").cloned();
    let base_url = compiler_options.get("baseUrl").and_then(|v| v.as_str()).map(String::from);

    Ok(TsConfigResult {
        config_path: config_path.to_string_lossy().to_string(),
        compiler_options,
        paths,
        base_url,
    })
}

fn resolve_extends(extends: &str, config_dir: &Path) -> Result<serde_json::Value, String> {
    let extends_path = if extends.starts_with('.') {
        // Relative path
        config_dir.join(extends)
    } else {
        // Could be a package reference like "@tsconfig/node18/tsconfig.json"
        // Try node_modules resolution
        let mut search_dir = config_dir.to_path_buf();
        loop {
            let node_modules = search_dir.join("node_modules").join(extends);
            if node_modules.exists() {
                break node_modules;
            }
            // Also try with .json extension
            let with_ext = search_dir.join("node_modules").join(format!("{}.json", extends));
            if with_ext.exists() {
                break with_ext;
            }
            // Try tsconfig.json in package directory
            let pkg_tsconfig = search_dir.join("node_modules").join(extends).join("tsconfig.json");
            if pkg_tsconfig.exists() {
                break pkg_tsconfig;
            }

            if let Some(parent) = search_dir.parent() {
                search_dir = parent.to_path_buf();
            } else {
                return Err(format!("Could not resolve extends: {}", extends));
            }
        }
    };

    let content = fs::read_to_string(&extends_path)
        .map_err(|e| format!("Failed to read extended config: {}", e))?;
    let content = remove_json_comments(&content);

    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse extended config: {}", e))
}

fn remove_json_comments(content: &str) -> String {
    let mut result = String::with_capacity(content.len());
    let mut in_string = false;
    let mut in_single_comment = false;
    let mut in_multi_comment = false;
    let mut chars = content.chars().peekable();

    while let Some(c) = chars.next() {
        if in_single_comment {
            if c == '\n' {
                in_single_comment = false;
                result.push(c);
            }
            continue;
        }

        if in_multi_comment {
            if c == '*' && chars.peek() == Some(&'/') {
                chars.next();
                in_multi_comment = false;
            }
            continue;
        }

        if c == '"' && !in_string {
            in_string = true;
            result.push(c);
            continue;
        }

        if c == '"' && in_string {
            // Check for escape
            let prev_chars: Vec<char> = result.chars().rev().take(1).collect();
            if prev_chars.first() != Some(&'\\') {
                in_string = false;
            }
            result.push(c);
            continue;
        }

        if in_string {
            result.push(c);
            continue;
        }

        if c == '/' {
            if chars.peek() == Some(&'/') {
                chars.next();
                in_single_comment = true;
                continue;
            }
            if chars.peek() == Some(&'*') {
                chars.next();
                in_multi_comment = true;
                continue;
            }
        }

        result.push(c);
    }

    // Also handle trailing commas which are valid in tsconfig but not JSON
    remove_trailing_commas(&result)
}

fn remove_trailing_commas(content: &str) -> String {
    let mut result = content.to_string();

    // Simple regex-like replacement for trailing commas before } or ]
    loop {
        let new_result = result
            .replace(",\n}", "\n}")
            .replace(",\n]", "\n]")
            .replace(", }", " }")
            .replace(", ]", " ]")
            .replace(",}", "}")
            .replace(",]", "]");

        if new_result == result {
            break;
        }
        result = new_result;
    }

    result
}

fn merge_json(base: &mut serde_json::Value, overlay: &serde_json::Value) {
    if let (serde_json::Value::Object(base_map), serde_json::Value::Object(overlay_map)) = (base, overlay) {
        for (key, value) in overlay_map {
            base_map.insert(key.clone(), value.clone());
        }
    }
}

// ============ Import Resolution Commands ============

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedImport {
    pub file_path: String,
    pub line_number: Option<u32>,
}

/// Resolve an import path to an actual file path
#[tauri::command]
pub async fn resolve_import_path(
    import_path: String,
    from_file: String,
    project_root: String,
) -> Result<Option<ResolvedImport>, String> {
    let from_path = Path::new(&from_file);
    let from_dir = from_path.parent().unwrap_or(Path::new("."));
    let project_dir = Path::new(&project_root);

    // Try to load tsconfig for path aliases
    let tsconfig = find_tsconfig(from_file.clone()).await.ok().flatten();

    // 1. Try relative imports (./foo, ../foo)
    if import_path.starts_with("./") || import_path.starts_with("../") {
        if let Some(resolved) = try_resolve_relative(&import_path, from_dir) {
            return Ok(Some(ResolvedImport {
                file_path: resolved.to_string_lossy().to_string(),
                line_number: None,
            }));
        }
    }

    // 2. Try tsconfig paths aliases (@/foo, ~foo)
    if let Some(ref config) = tsconfig {
        if let Some(resolved) = try_resolve_alias(&import_path, config, project_dir) {
            return Ok(Some(ResolvedImport {
                file_path: resolved.to_string_lossy().to_string(),
                line_number: None,
            }));
        }
    }

    // 3. Try as a package in node_modules (only resolve to main entry)
    if !import_path.starts_with('.') && !import_path.starts_with('/') {
        if let Some(resolved) = try_resolve_node_modules(&import_path, from_dir, project_dir) {
            return Ok(Some(ResolvedImport {
                file_path: resolved.to_string_lossy().to_string(),
                line_number: None,
            }));
        }
    }

    Ok(None)
}

fn try_resolve_relative(import_path: &str, from_dir: &Path) -> Option<std::path::PathBuf> {
    let base_path = from_dir.join(import_path);
    try_resolve_with_extensions(&base_path)
}

fn try_resolve_alias(
    import_path: &str,
    config: &TsConfigResult,
    _project_dir: &Path,
) -> Option<std::path::PathBuf> {
    let paths = config.paths.as_ref()?.as_object()?;
    let base_url = config.base_url.as_deref().unwrap_or(".");

    // Get config directory from config_path
    let config_path = Path::new(&config.config_path);
    let config_dir = config_path.parent().unwrap_or(Path::new("."));
    let base_dir = config_dir.join(base_url);

    for (pattern, targets) in paths {
        let targets = targets.as_array()?;

        // Handle wildcard patterns like "@/*" -> ["./src/*"]
        if pattern.ends_with("/*") {
            let prefix = pattern.trim_end_matches("/*");
            if import_path.starts_with(prefix) {
                let suffix = &import_path[prefix.len()..];
                let suffix = suffix.trim_start_matches('/');

                for target in targets {
                    let target_str = target.as_str()?;
                    let target_base = target_str.trim_end_matches("/*");
                    let resolved_path = base_dir.join(target_base).join(suffix);

                    if let Some(resolved) = try_resolve_with_extensions(&resolved_path) {
                        return Some(resolved);
                    }
                }
            }
        } else if pattern == import_path {
            // Exact match
            for target in targets {
                let target_str = target.as_str()?;
                let resolved_path = base_dir.join(target_str);

                if let Some(resolved) = try_resolve_with_extensions(&resolved_path) {
                    return Some(resolved);
                }
            }
        }
    }

    None
}

fn try_resolve_node_modules(
    import_path: &str,
    from_dir: &Path,
    project_dir: &Path,
) -> Option<std::path::PathBuf> {
    // Split package name from subpath
    let (package_name, subpath) = if import_path.starts_with('@') {
        // Scoped package: @scope/package/subpath
        let parts: Vec<&str> = import_path.splitn(3, '/').collect();
        if parts.len() >= 2 {
            let pkg = format!("{}/{}", parts[0], parts[1]);
            let sub = if parts.len() > 2 { Some(parts[2]) } else { None };
            (pkg, sub)
        } else {
            return None;
        }
    } else {
        // Regular package: package/subpath
        let parts: Vec<&str> = import_path.splitn(2, '/').collect();
        (parts[0].to_string(), parts.get(1).copied())
    };

    // Walk up from from_dir to project_dir looking for node_modules
    let mut search_dir = from_dir.to_path_buf();
    let project_canonical = project_dir.canonicalize().ok()?;

    loop {
        let node_modules = search_dir.join("node_modules").join(&package_name);

        if node_modules.exists() {
            // Found the package, now resolve the import
            if let Some(sub) = subpath {
                // Import with subpath: package/dist/foo
                let subpath_resolved = node_modules.join(sub);
                if let Some(resolved) = try_resolve_with_extensions(&subpath_resolved) {
                    return Some(resolved);
                }
            } else {
                // Import package root - check package.json for entry points
                let pkg_json_path = node_modules.join("package.json");
                if pkg_json_path.exists() {
                    if let Ok(pkg_content) = fs::read_to_string(&pkg_json_path) {
                        if let Ok(pkg_json) = serde_json::from_str::<serde_json::Value>(&pkg_content) {
                            // Try exports, main, module fields
                            for field in ["exports", "main", "module", "types", "typings"] {
                                if let Some(entry) = pkg_json.get(field) {
                                    let entry_path = match entry {
                                        serde_json::Value::String(s) => Some(s.clone()),
                                        serde_json::Value::Object(obj) => {
                                            // Handle exports with conditions
                                            obj.get(".")
                                                .or_else(|| obj.get("import"))
                                                .or_else(|| obj.get("require"))
                                                .or_else(|| obj.get("default"))
                                                .and_then(|v| v.as_str().map(String::from))
                                        }
                                        _ => None,
                                    };

                                    if let Some(entry_path) = entry_path {
                                        let resolved = node_modules.join(&entry_path);
                                        if resolved.exists() {
                                            return Some(resolved);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // Fallback: try index file
                if let Some(resolved) = try_resolve_with_extensions(&node_modules.join("index")) {
                    return Some(resolved);
                }
            }
        }

        // Don't go above project root
        if let Ok(search_canonical) = search_dir.canonicalize() {
            if search_canonical == project_canonical {
                break;
            }
        }

        search_dir = match search_dir.parent() {
            Some(p) => p.to_path_buf(),
            None => break,
        };
    }

    None
}

// ============ Skill File Commands ============

const SKILL_VERSION: &str = "1.1.0";
const GLOBAL_CLAUDE_MD_VERSION: &str = "1.0.0";
const GLOBAL_SETTINGS_VERSION: &str = "1.0.0";
const GLOBAL_CLAUDE_MD_SECTION: &str = r#"
## Awesome Claude - Ticket Coordination (v1.0.0)

When working in a project with `.claude/skills/awesome-claude/`, you MUST:

1. **Before ANY coding task**: Run `ticket_list_available` to see available tickets
2. **Claim before working**: Run `ticket_claim` with a ticket ID before making changes
3. **Never skip claiming**: Do not modify code without claiming a ticket first
4. **Complete when done**: Run `ticket_complete` with a summary after finishing

This ensures multiple Claude sessions don't conflict on the same project.
"#;

const SKILL_CONTENT: &str = r#"---
name: awesome-claude
description: Multi-session ticket-based task coordination for Claude Code. Use when working on any coding task to claim tickets, track progress, and coordinate with other sessions. ALWAYS check for available tickets before starting work.
version: 1.1.0
---

# Awesome Claude - Multi-Session Task Coordination

Ticket-based coordination system for multiple Claude Code sessions working on the same project. Prevents duplicate work and ensures proper task sequencing through dependencies.

## When to Apply

Use this system when:
- Starting any coding task (check for existing tickets first)
- Creating work items for a project
- Coordinating work across multiple Claude Code sessions
- Tracking progress on implementation tasks

## Required Workflow

**ALWAYS follow this sequence:**

1. `ticket_list_available` - Check claimable tickets (blocked tickets are auto-filtered)
2. `ticket_claim` - Claim a ticket (fails if blocked or already claimed)
3. `ticket_start` - Mark as in progress
4. Do the work
5. `ticket_complete` - Complete with summary

## Critical: Dependency Rules

**When creating tickets with dependencies, you MUST use the `blockedBy` parameter.**

### Why This Matters

- Tickets with `blockedBy` cannot be claimed until blocking tickets complete
- System enforces work order automatically
- Multiple sessions can work safely without conflicts

### Correct Pattern

```
# Step 1: Create base ticket
ticket_create:
  title: "Design database schema"
  description: "Define user and session tables with proper indexes..."
  priority: high
  # Returns ID: abc12345

# Step 2: Create dependent ticket with blockedBy
ticket_create:
  title: "Implement user API"
  description: "Create CRUD endpoints for user management..."
  priority: high
  blockedBy: ["abc12345"]  # REQUIRED - references base ticket
  # Returns ID: def67890

# Step 3: Chain dependencies
ticket_create:
  title: "Build user management UI"
  description: "React components for user CRUD operations..."
  priority: medium
  blockedBy: ["def67890"]  # Cannot start until API is complete
```

### Anti-Pattern (DO NOT DO THIS)

```
# WRONG: Dependency only in description - system cannot enforce order
ticket_create:
  title: "Implement user API"
  description: "After DB schema is done, create CRUD endpoints..."
  # Missing blockedBy! Other sessions may work on this prematurely
```

## Tool Reference

### Ticket Management

| Tool | Description |
|------|-------------|
| `ticket_create` | Create ticket (use `blockedBy` for dependencies) |
| `ticket_list_available` | List claimable tickets (unblocked only) |
| `ticket_list` | List all tickets with status filter |
| `ticket_get` | Get ticket details by ID |
| `ticket_claim` | Claim ticket (fails if blocked) |
| `ticket_start` | Mark as in_progress |
| `ticket_complete` | Complete with summary |
| `ticket_fail` | Mark as failed with error |
| `ticket_release` | Release back to pool |

### Session Management

| Tool | Description |
|------|-------------|
| `session_list` | List active sessions |
| `session_status` | Current session info |

## Best Practices

1. **Always claim before working** - Prevents conflicts with other sessions
2. **Use `blockedBy` for dependencies** - Text in description is not enforced
3. **Release if blocked** - Let other sessions take over
4. **Write meaningful summaries** - Helps other sessions understand completed work
5. **Analyze dependencies first** - When creating multiple tickets, map the dependency chain before creating
"#;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillCheckResult {
    pub exists: bool,
    pub path: String,
    pub current_version: Option<String>,
    pub latest_version: String,
    pub needs_update: bool,
}

/// Check if skill file exists and its version
#[tauri::command]
pub async fn check_skill_file(working_dir: String) -> Result<SkillCheckResult, String> {
    let skill_dir = Path::new(&working_dir).join(".claude/skills/awesome-claude");
    let skill_path = skill_dir.join("SKILL.md");

    if !skill_path.exists() {
        return Ok(SkillCheckResult {
            exists: false,
            path: skill_path.to_string_lossy().to_string(),
            current_version: None,
            latest_version: SKILL_VERSION.to_string(),
            needs_update: true,
        });
    }

    // Read and parse version
    let content = fs::read_to_string(&skill_path)
        .map_err(|e| format!("Failed to read skill file: {}", e))?;

    let current_version = parse_skill_version(&content);
    let needs_update = match &current_version {
        Some(v) => compare_versions(v, SKILL_VERSION) < 0,
        None => true,
    };

    Ok(SkillCheckResult {
        exists: true,
        path: skill_path.to_string_lossy().to_string(),
        current_version,
        latest_version: SKILL_VERSION.to_string(),
        needs_update,
    })
}

/// Create or update skill file
#[tauri::command]
pub async fn ensure_skill_file(working_dir: String) -> Result<SkillCheckResult, String> {
    let skill_dir = Path::new(&working_dir).join(".claude/skills/awesome-claude");
    let skill_path = skill_dir.join("SKILL.md");

    // Create directory if needed
    if !skill_dir.exists() {
        fs::create_dir_all(&skill_dir)
            .map_err(|e| format!("Failed to create skill directory: {}", e))?;
    }

    // Write skill file
    fs::write(&skill_path, SKILL_CONTENT)
        .map_err(|e| format!("Failed to write skill file: {}", e))?;

    Ok(SkillCheckResult {
        exists: true,
        path: skill_path.to_string_lossy().to_string(),
        current_version: Some(SKILL_VERSION.to_string()),
        latest_version: SKILL_VERSION.to_string(),
        needs_update: false,
    })
}

fn parse_skill_version(content: &str) -> Option<String> {
    // Look for version: X.Y.Z in frontmatter
    for line in content.lines() {
        if line.starts_with("version:") {
            return Some(line.trim_start_matches("version:").trim().to_string());
        }
        // Stop at end of frontmatter
        if line == "---" && content.starts_with("---") && !line.is_empty() {
            let first_line = content.lines().next()?;
            if first_line == "---" {
                continue;
            }
            break;
        }
    }
    None
}

// ============ Global CLAUDE.md Commands ============

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalClaudeMdResult {
    pub path: String,
    pub had_section: bool,
    pub updated: bool,
}

/// Check and update global ~/.claude/CLAUDE.md with awesome-claude rules
#[tauri::command]
pub async fn ensure_global_claude_md() -> Result<GlobalClaudeMdResult, String> {
    // Get home directory
    let home_dir = dirs::home_dir()
        .ok_or_else(|| "Could not find home directory".to_string())?;

    let claude_dir = home_dir.join(".claude");
    let claude_md_path = claude_dir.join("CLAUDE.md");

    // Create .claude directory if needed
    if !claude_dir.exists() {
        fs::create_dir_all(&claude_dir)
            .map_err(|e| format!("Failed to create .claude directory: {}", e))?;
    }

    // Check if file exists and has our section
    let section_marker = "## Awesome Claude - Ticket Coordination";

    if claude_md_path.exists() {
        let content = fs::read_to_string(&claude_md_path)
            .map_err(|e| format!("Failed to read CLAUDE.md: {}", e))?;

        if content.contains(section_marker) {
            // Section exists - check version
            let current_version = parse_global_claude_md_version(&content);
            let needs_update = match &current_version {
                Some(v) => compare_versions(v, GLOBAL_CLAUDE_MD_VERSION) < 0,
                None => true,
            };

            if needs_update {
                // Remove old section and add new one
                let new_content = remove_awesome_claude_section(&content) + GLOBAL_CLAUDE_MD_SECTION;
                fs::write(&claude_md_path, new_content.trim())
                    .map_err(|e| format!("Failed to update CLAUDE.md: {}", e))?;

                return Ok(GlobalClaudeMdResult {
                    path: claude_md_path.to_string_lossy().to_string(),
                    had_section: true,
                    updated: true,
                });
            }

            return Ok(GlobalClaudeMdResult {
                path: claude_md_path.to_string_lossy().to_string(),
                had_section: true,
                updated: false,
            });
        }

        // Append our section to existing content
        let new_content = format!("{}\n{}", content.trim_end(), GLOBAL_CLAUDE_MD_SECTION);
        fs::write(&claude_md_path, new_content)
            .map_err(|e| format!("Failed to update CLAUDE.md: {}", e))?;

        return Ok(GlobalClaudeMdResult {
            path: claude_md_path.to_string_lossy().to_string(),
            had_section: false,
            updated: true,
        });
    }

    // Create new file with our section
    fs::write(&claude_md_path, GLOBAL_CLAUDE_MD_SECTION.trim_start())
        .map_err(|e| format!("Failed to create CLAUDE.md: {}", e))?;

    Ok(GlobalClaudeMdResult {
        path: claude_md_path.to_string_lossy().to_string(),
        had_section: false,
        updated: true,
    })
}

// ============ Global Settings.json Commands ============

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalSettingsResult {
    pub path: String,
    pub updated: bool,
    pub version: String,
}

/// Ensure global ~/.claude/settings.json has awesome-claude hooks
#[tauri::command]
pub async fn ensure_global_settings() -> Result<GlobalSettingsResult, String> {
    let home_dir = dirs::home_dir()
        .ok_or_else(|| "Could not find home directory".to_string())?;

    let claude_dir = home_dir.join(".claude");
    let settings_path = claude_dir.join("settings.json");

    // Create .claude directory if needed
    if !claude_dir.exists() {
        fs::create_dir_all(&claude_dir)
            .map_err(|e| format!("Failed to create .claude directory: {}", e))?;
    }

    // Build our hooks config
    let awesome_hooks = build_awesome_claude_hooks();

    if settings_path.exists() {
        let content = fs::read_to_string(&settings_path)
            .map_err(|e| format!("Failed to read settings.json: {}", e))?;

        let mut settings: serde_json::Value = serde_json::from_str(&content)
            .unwrap_or_else(|_| serde_json::json!({}));

        // Check version
        let current_version = settings
            .get("awesomeClaudeVersion")
            .and_then(|v| v.as_str())
            .map(String::from);

        let needs_update = match &current_version {
            Some(v) => compare_versions(v, GLOBAL_SETTINGS_VERSION) < 0,
            None => true,
        };

        if !needs_update {
            return Ok(GlobalSettingsResult {
                path: settings_path.to_string_lossy().to_string(),
                updated: false,
                version: current_version.unwrap_or_default(),
            });
        }

        // Merge hooks
        merge_hooks(&mut settings, &awesome_hooks);
        settings["awesomeClaudeVersion"] = serde_json::json!(GLOBAL_SETTINGS_VERSION);

        let new_content = serde_json::to_string_pretty(&settings)
            .map_err(|e| format!("Failed to serialize settings: {}", e))?;

        fs::write(&settings_path, new_content)
            .map_err(|e| format!("Failed to write settings.json: {}", e))?;

        return Ok(GlobalSettingsResult {
            path: settings_path.to_string_lossy().to_string(),
            updated: true,
            version: GLOBAL_SETTINGS_VERSION.to_string(),
        });
    }

    // Create new settings file
    let mut settings = serde_json::json!({
        "awesomeClaudeVersion": GLOBAL_SETTINGS_VERSION
    });
    merge_hooks(&mut settings, &awesome_hooks);

    let content = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;

    fs::write(&settings_path, content)
        .map_err(|e| format!("Failed to create settings.json: {}", e))?;

    Ok(GlobalSettingsResult {
        path: settings_path.to_string_lossy().to_string(),
        updated: true,
        version: GLOBAL_SETTINGS_VERSION.to_string(),
    })
}

fn build_awesome_claude_hooks() -> serde_json::Value {
    serde_json::json!({
        "hooks": {
            "UserPromptSubmit": [
                {
                    "matcher": "*",
                    "hooks": [{
                        "type": "command",
                        "command": "echo '{\"additionalContext\": \"[awesome-claude] If this project has tickets, run ticket_list_available first. Claim a ticket with ticket_claim before making changes.\"}'"
                    }]
                }
            ],
            "Stop": [
                {
                    "hooks": [{
                        "type": "prompt",
                        "prompt": "If you worked on a ticket in this session, did you call ticket_complete with a summary? If not and work was done on a claimed ticket, call it now.",
                        "model": "claude-haiku"
                    }]
                }
            ]
        }
    })
}

fn merge_hooks(settings: &mut serde_json::Value, awesome_hooks: &serde_json::Value) {
    // Get or create hooks object
    if !settings.get("hooks").is_some() {
        settings["hooks"] = serde_json::json!({});
    }

    let hooks = settings.get_mut("hooks").unwrap();

    // Merge each hook type
    if let Some(awesome_hooks_obj) = awesome_hooks.get("hooks").and_then(|h| h.as_object()) {
        for (event_name, event_hooks) in awesome_hooks_obj {
            if let Some(existing) = hooks.get_mut(event_name) {
                // Filter out old awesome-claude hooks and add new ones
                if let Some(arr) = existing.as_array_mut() {
                    arr.retain(|h| {
                        // Remove hooks that contain "awesome-claude" marker
                        let json_str = serde_json::to_string(h).unwrap_or_default();
                        !json_str.contains("awesome-claude")
                    });
                    // Add new hooks
                    if let Some(new_arr) = event_hooks.as_array() {
                        arr.extend(new_arr.clone());
                    }
                }
            } else {
                // No existing hooks for this event, just set it
                hooks[event_name] = event_hooks.clone();
            }
        }
    }
}

fn parse_global_claude_md_version(content: &str) -> Option<String> {
    // Look for "## Awesome Claude - Ticket Coordination (vX.Y.Z)"
    let re = regex::Regex::new(r"## Awesome Claude - Ticket Coordination \(v([0-9.]+)\)").ok()?;
    re.captures(content)
        .and_then(|caps| caps.get(1))
        .map(|m| m.as_str().to_string())
}

fn remove_awesome_claude_section(content: &str) -> String {
    // Remove everything from "## Awesome Claude - Ticket Coordination" to next "## " or end
    let start_marker = "## Awesome Claude - Ticket Coordination";
    if let Some(start_idx) = content.find(start_marker) {
        let before = &content[..start_idx];
        let after_start = &content[start_idx + start_marker.len()..];

        // Find next ## heading or end of file
        let end_idx = after_start.find("\n## ")
            .map(|i| start_idx + start_marker.len() + i)
            .unwrap_or(content.len());

        let after = &content[end_idx..];
        format!("{}{}", before.trim_end(), after)
    } else {
        content.to_string()
    }
}

/// Check if global CLAUDE.md has awesome-claude section
#[tauri::command]
pub async fn check_global_claude_md() -> Result<GlobalClaudeMdResult, String> {
    let home_dir = dirs::home_dir()
        .ok_or_else(|| "Could not find home directory".to_string())?;

    let claude_md_path = home_dir.join(".claude").join("CLAUDE.md");
    let section_marker = "## Awesome Claude - Ticket Coordination";

    if !claude_md_path.exists() {
        return Ok(GlobalClaudeMdResult {
            path: claude_md_path.to_string_lossy().to_string(),
            had_section: false,
            updated: false,
        });
    }

    let content = fs::read_to_string(&claude_md_path)
        .map_err(|e| format!("Failed to read CLAUDE.md: {}", e))?;

    Ok(GlobalClaudeMdResult {
        path: claude_md_path.to_string_lossy().to_string(),
        had_section: content.contains(section_marker),
        updated: false,
    })
}

fn compare_versions(a: &str, b: &str) -> i32 {
    let parts_a: Vec<i32> = a.split('.').filter_map(|s| s.parse().ok()).collect();
    let parts_b: Vec<i32> = b.split('.').filter_map(|s| s.parse().ok()).collect();

    for i in 0..std::cmp::max(parts_a.len(), parts_b.len()) {
        let num_a = parts_a.get(i).copied().unwrap_or(0);
        let num_b = parts_b.get(i).copied().unwrap_or(0);
        if num_a < num_b {
            return -1;
        }
        if num_a > num_b {
            return 1;
        }
    }
    0
}

fn try_resolve_with_extensions(base_path: &Path) -> Option<std::path::PathBuf> {
    // If it already exists as a file, return it
    if base_path.is_file() {
        return Some(base_path.to_path_buf());
    }

    // Try with common extensions
    let extensions = [
        ".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs", ".cts", ".cjs",
        ".d.ts", ".json",
    ];

    for ext in extensions {
        let with_ext = base_path.with_extension(ext.trim_start_matches('.'));
        if with_ext.is_file() {
            return Some(with_ext);
        }

        // Also try appending extension (for paths without extension)
        let appended = std::path::PathBuf::from(format!("{}{}", base_path.display(), ext));
        if appended.is_file() {
            return Some(appended);
        }
    }

    // Try as directory with index file
    if base_path.is_dir() {
        for ext in extensions {
            let index_path = base_path.join(format!("index{}", ext));
            if index_path.is_file() {
                return Some(index_path);
            }
        }
    }

    None
}

// ============ Orchestrator Commands ============

/// Start orchestrator for a project
#[tauri::command]
pub async fn orchestrator_start(
    project_id: String,
    working_directory: String,
    orchestrator_manager: State<'_, OrchestratorManager>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    orchestrator_manager
        .start(app_handle, project_id, working_directory)
        .await
}

/// Stop orchestrator for a project
#[tauri::command]
pub async fn orchestrator_stop(
    project_id: String,
    orchestrator_manager: State<'_, OrchestratorManager>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    orchestrator_manager.stop(app_handle, &project_id).await
}

/// Send message to orchestrator
#[tauri::command]
pub async fn orchestrator_send(
    project_id: String,
    message: String,
    orchestrator_manager: State<'_, OrchestratorManager>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    orchestrator_manager.send(app_handle, &project_id, message).await
}

/// Check if orchestrator is running
#[tauri::command]
pub async fn orchestrator_is_running(
    project_id: String,
    orchestrator_manager: State<'_, OrchestratorManager>,
) -> Result<bool, String> {
    Ok(orchestrator_manager.is_running(&project_id).await)
}

/// List all running orchestrators
#[tauri::command]
pub async fn orchestrator_list_running(
    orchestrator_manager: State<'_, OrchestratorManager>,
) -> Result<Vec<String>, String> {
    Ok(orchestrator_manager.list_running().await)
}

// ============ Ticket Event Commands ============

/// Get events for a ticket
#[tauri::command]
pub async fn get_ticket_events(ticket_id: String) -> Result<Vec<TicketEvent>, String> {
    database::list_ticket_events(&ticket_id).map_err(|e| e.to_string())
}

// ============ Helper Functions ============

fn chrono_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = duration.as_secs();
    let millis = duration.subsec_millis();
    format!(
        "{}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        1970 + secs / 31536000,
        (secs % 31536000) / 2592000 + 1,
        (secs % 2592000) / 86400 + 1,
        (secs % 86400) / 3600,
        (secs % 3600) / 60,
        secs % 60,
        millis
    )
}
