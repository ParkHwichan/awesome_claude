use rusqlite::{Connection, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;

fn get_db_path() -> PathBuf {
    let app_data = dirs::data_dir()
        .or_else(|| dirs::config_dir())
        .unwrap_or_else(|| PathBuf::from("."));
    app_data.join("awesome-claude").join("data").join("awesome-claude.db")
}

pub fn get_connection() -> Result<Connection> {
    let db_path = get_db_path();
    Connection::open(db_path)
}

/// Run database migrations to ensure schema is up to date
pub fn run_migrations() -> Result<()> {
    let conn = get_connection()?;

    // Ensure icon_index column exists in sessions table
    let _ = conn.execute(
        "ALTER TABLE sessions ADD COLUMN icon_index INTEGER",
        [],
    ); // Ignore error if column already exists

    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub working_directory: String,
    pub created_at: String,
    pub updated_at: String,
    pub metadata: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSummary {
    pub id: String,
    pub name: String,
    pub working_directory: String,
    pub ticket_count: i32,
    pub active_session_count: i32,
    pub pending_tickets: i32,
    pub in_progress_tickets: i32,
    pub completed_tickets: i32,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub project_id: String,
    pub ppid: i32,
    pub name: Option<String>,
    pub model: Option<String>,
    pub status: String,
    pub connected_at: String,
    pub last_active_at: String,
    pub disconnected_at: Option<String>,
    pub current_ticket_id: Option<String>,
    pub tickets_completed: i32,
    pub tickets_failed: i32,
    pub icon_index: Option<i32>,
    pub metadata: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Ticket {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub description: Option<String>,
    pub status: String,
    pub priority: String,
    #[serde(rename = "type")]
    pub ticket_type: String,
    pub due_date: Option<String>,
    #[serde(default)]
    pub blocked_by: Option<Value>,
    #[serde(default)]
    pub blocks: Option<Value>,
    #[serde(default)]
    pub checklist: Option<Value>,
    #[serde(default)]
    pub comments: Option<Value>,
    #[serde(default)]
    pub tags: Option<Value>,
    pub category: Option<String>,
    pub claimed_by: Option<String>,
    pub claimed_at: Option<String>,
    pub created_by: String,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
    #[serde(default)]
    pub result: Option<Value>,
    #[serde(default)]
    pub metadata: Option<Value>,
}

pub fn list_projects() -> Result<Vec<ProjectSummary>> {
    let conn = get_connection()?;
    let mut stmt = conn.prepare(
        "SELECT
            p.id,
            p.name,
            p.working_directory,
            (SELECT COUNT(*) FROM tickets WHERE project_id = p.id) as ticket_count,
            (SELECT COUNT(*) FROM sessions WHERE project_id = p.id AND status != 'disconnected') as active_session_count,
            (SELECT COUNT(*) FROM tickets WHERE project_id = p.id AND status = 'pending') as pending_tickets,
            (SELECT COUNT(*) FROM tickets WHERE project_id = p.id AND status IN ('claimed', 'in_progress')) as in_progress_tickets,
            (SELECT COUNT(*) FROM tickets WHERE project_id = p.id AND status = 'completed') as completed_tickets
        FROM projects p
        ORDER BY p.updated_at DESC"
    )?;

    let rows = stmt.query_map([], |row| {
        Ok(ProjectSummary {
            id: row.get(0)?,
            name: row.get(1)?,
            working_directory: row.get(2)?,
            ticket_count: row.get(3)?,
            active_session_count: row.get(4)?,
            pending_tickets: row.get(5)?,
            in_progress_tickets: row.get(6)?,
            completed_tickets: row.get(7)?,
        })
    })?;

    rows.collect()
}

pub fn list_sessions() -> Result<Vec<Session>> {
    let conn = get_connection()?;
    let mut stmt = conn.prepare(
        "SELECT id, project_id, ppid, name, model, status, connected_at, last_active_at,
                disconnected_at, current_ticket_id, tickets_completed, tickets_failed, icon_index, metadata
         FROM sessions
         WHERE status != 'disconnected'
         ORDER BY last_active_at DESC"
    )?;

    let rows = stmt.query_map([], |row| {
        Ok(Session {
            id: row.get(0)?,
            project_id: row.get(1)?,
            ppid: row.get(2)?,
            name: row.get(3)?,
            model: row.get(4)?,
            status: row.get(5)?,
            connected_at: row.get(6)?,
            last_active_at: row.get(7)?,
            disconnected_at: row.get(8)?,
            current_ticket_id: row.get(9)?,
            tickets_completed: row.get(10)?,
            tickets_failed: row.get(11)?,
            icon_index: row.get(12)?,
            metadata: row.get(13)?,
        })
    })?;

    rows.collect()
}

pub fn cleanup_dead_sessions() -> Result<usize> {
    let conn = get_connection()?;

    // Get all active sessions
    let mut stmt = conn.prepare(
        "SELECT id, ppid, name FROM sessions WHERE status != 'disconnected'"
    )?;

    let sessions: Vec<(String, i32, Option<String>)> = stmt.query_map([], |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?))
    })?.filter_map(|r| r.ok()).collect();

    if !sessions.is_empty() {
        println!("[Cleanup] Checking {} active sessions...", sessions.len());
    }

    let mut cleaned = 0;
    for (id, ppid, name) in sessions {
        let alive = ppid > 0 && is_process_alive(ppid as u32);
        if !alive {
            // Release claimed tickets back to pending
            conn.execute(
                "UPDATE tickets SET claimed_by = NULL, claimed_at = NULL, status = 'pending'
                 WHERE claimed_by = ? AND status NOT IN ('completed', 'failed')",
                [&id]
            )?;

            // Mark session as disconnected
            conn.execute(
                "UPDATE sessions SET status = 'disconnected', disconnected_at = datetime('now'), current_ticket_id = NULL WHERE id = ?",
                [&id]
            )?;
            println!("[Cleanup] Dead session: {} '{}' (ppid: {} - process not found)", id, name.unwrap_or_default(), ppid);
            cleaned += 1;
        } else {
            println!("[Cleanup] Session alive: {} '{}' (ppid: {})", id, name.unwrap_or_default(), ppid);
        }
    }

    Ok(cleaned)
}

#[cfg(target_os = "windows")]
fn is_process_alive(pid: u32) -> bool {
    use windows_sys::Win32::Foundation::{CloseHandle, STILL_ACTIVE};
    use windows_sys::Win32::System::Threading::{OpenProcess, GetExitCodeProcess, PROCESS_QUERY_LIMITED_INFORMATION};

    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        // Check if handle is null (invalid)
        if handle.is_null() {
            println!("[ProcessCheck] PID {} - OpenProcess failed (access denied or not found)", pid);
            return false;
        }

        let mut exit_code: u32 = 0;
        let result = GetExitCodeProcess(handle, &mut exit_code);
        CloseHandle(handle);

        if result == 0 {
            println!("[ProcessCheck] PID {} - GetExitCodeProcess failed", pid);
            return false;
        }

        // STILL_ACTIVE = 259
        let is_alive = exit_code == (STILL_ACTIVE as u32);
        if !is_alive {
            println!("[ProcessCheck] PID {} - Process exited with code {}", pid, exit_code);
        }
        is_alive
    }
}

#[cfg(not(target_os = "windows"))]
fn is_process_alive(pid: u32) -> bool {
    use std::process::Command;
    Command::new("kill")
        .args(["-0", &pid.to_string()])
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

fn parse_json(s: Option<String>) -> Option<Value> {
    s.and_then(|v| serde_json::from_str(&v).ok())
}

pub fn list_tickets() -> Result<Vec<Ticket>> {
    let conn = get_connection()?;
    let mut stmt = conn.prepare(
        "SELECT id, project_id, title, description, status, priority,
                COALESCE(type, 'task') as type, due_date, blocked_by, blocks,
                checklist, comments, tags, category,
                claimed_by, claimed_at, created_by, created_at, updated_at,
                completed_at, result, metadata
         FROM tickets
         ORDER BY created_at DESC"
    )?;

    let rows = stmt.query_map([], |row| {
        Ok(Ticket {
            id: row.get(0)?,
            project_id: row.get(1)?,
            title: row.get(2)?,
            description: row.get(3)?,
            status: row.get(4)?,
            priority: row.get(5)?,
            ticket_type: row.get(6)?,
            due_date: row.get(7)?,
            blocked_by: parse_json(row.get(8)?),
            blocks: parse_json(row.get(9)?),
            checklist: parse_json(row.get(10)?),
            comments: parse_json(row.get(11)?),
            tags: parse_json(row.get(12)?),
            category: row.get(13)?,
            claimed_by: row.get(14)?,
            claimed_at: row.get(15)?,
            created_by: row.get(16)?,
            created_at: row.get(17)?,
            updated_at: row.get(18)?,
            completed_at: row.get(19)?,
            result: parse_json(row.get(20)?),
            metadata: parse_json(row.get(21)?),
        })
    })?;

    rows.collect()
}

pub fn update_ticket(
    id: &str,
    title: &str,
    description: Option<&str>,
    status: &str,
    priority: &str,
) -> Result<Ticket> {
    let conn = get_connection()?;

    // If status is changing to pending, clear claimed_by
    let clear_claimed = status == "pending";

    if clear_claimed {
        conn.execute(
            "UPDATE tickets SET title = ?, description = ?, status = ?, priority = ?,
             claimed_by = NULL, claimed_at = NULL, updated_at = datetime('now') WHERE id = ?",
            rusqlite::params![title, description, status, priority, id],
        )?;
    } else {
        conn.execute(
            "UPDATE tickets SET title = ?, description = ?, status = ?, priority = ?,
             updated_at = datetime('now') WHERE id = ?",
            rusqlite::params![title, description, status, priority, id],
        )?;
    }

    // Return updated ticket
    let mut stmt = conn.prepare(
        "SELECT id, project_id, title, description, status, priority,
                COALESCE(type, 'task') as type, due_date, blocked_by, blocks,
                checklist, comments, tags, category,
                claimed_by, claimed_at, created_by, created_at, updated_at,
                completed_at, result, metadata
         FROM tickets WHERE id = ?"
    )?;

    stmt.query_row([id], |row| {
        Ok(Ticket {
            id: row.get(0)?,
            project_id: row.get(1)?,
            title: row.get(2)?,
            description: row.get(3)?,
            status: row.get(4)?,
            priority: row.get(5)?,
            ticket_type: row.get(6)?,
            due_date: row.get(7)?,
            blocked_by: parse_json(row.get(8)?),
            blocks: parse_json(row.get(9)?),
            checklist: parse_json(row.get(10)?),
            comments: parse_json(row.get(11)?),
            tags: parse_json(row.get(12)?),
            category: row.get(13)?,
            claimed_by: row.get(14)?,
            claimed_at: row.get(15)?,
            created_by: row.get(16)?,
            created_at: row.get(17)?,
            updated_at: row.get(18)?,
            completed_at: row.get(19)?,
            result: parse_json(row.get(20)?),
            metadata: parse_json(row.get(21)?),
        })
    })
}

pub fn delete_ticket(id: &str) -> Result<()> {
    let conn = get_connection()?;
    conn.execute("DELETE FROM tickets WHERE id = ?", [id])?;
    Ok(())
}

pub fn create_project(name: &str, working_directory: &str) -> Result<Project> {
    let conn = get_connection()?;

    // Check if project already exists for this working directory
    let existing: Option<Project> = conn
        .query_row(
            "SELECT id, name, description, working_directory, created_at, updated_at, metadata FROM projects WHERE working_directory = ?",
            [working_directory],
            |row| {
                Ok(Project {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    description: row.get(2)?,
                    working_directory: row.get(3)?,
                    created_at: row.get(4)?,
                    updated_at: row.get(5)?,
                    metadata: row.get(6)?,
                })
            },
        )
        .ok();

    if let Some(project) = existing {
        return Ok(project);
    }

    // Create new project
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO projects (id, name, description, working_directory, created_at, updated_at, metadata) VALUES (?, ?, NULL, ?, ?, ?, NULL)",
        [&id, name, working_directory, &now, &now],
    )?;

    Ok(Project {
        id,
        name: name.to_string(),
        description: None,
        working_directory: working_directory.to_string(),
        created_at: now.clone(),
        updated_at: now,
        metadata: None,
    })
}

pub fn delete_project(id: &str) -> Result<()> {
    let conn = get_connection()?;
    // Cascade delete: tickets and sessions first
    conn.execute("DELETE FROM tickets WHERE project_id = ?", [id])?;
    conn.execute("DELETE FROM sessions WHERE project_id = ?", [id])?;
    conn.execute("DELETE FROM projects WHERE id = ?", [id])?;
    Ok(())
}

/// Mark a session as disconnected by ID. Returns (project_id,) on success.
pub fn mark_session_disconnected(session_id: &str) -> Result<(String,)> {
    let conn = get_connection()?;

    // Get project_id first
    let project_id: String = conn.query_row(
        "SELECT project_id FROM sessions WHERE id = ?",
        [session_id],
        |row| row.get(0),
    )?;

    // Release any claimed tickets
    conn.execute(
        "UPDATE tickets SET claimed_by = NULL, claimed_at = NULL, status = 'pending'
         WHERE claimed_by = ? AND status NOT IN ('completed', 'failed', 'archived')",
        [session_id],
    )?;

    // Update session status
    conn.execute(
        "UPDATE sessions SET status = 'disconnected', disconnected_at = datetime('now'), current_ticket_id = NULL WHERE id = ?",
        [session_id],
    )?;

    println!("[DB] Marked session {} as disconnected (project: {})", session_id, project_id);

    Ok((project_id,))
}
