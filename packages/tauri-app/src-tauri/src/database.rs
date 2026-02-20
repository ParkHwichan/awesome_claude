use rusqlite::{Connection, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;

fn get_db_path() -> PathBuf {
    // Use config_dir (AppData\Roaming on Windows) to match MCP server location
    let app_data = dirs::config_dir()
        .or_else(|| dirs::data_dir())
        .unwrap_or_else(|| PathBuf::from("."));
    app_data.join("awesome-claude").join("data").join("awesome-claude.db")
}

pub fn get_connection() -> Result<Connection> {
    let db_path = get_db_path();
    Connection::open(db_path)
}

/// Run database migrations to ensure schema is up to date
pub fn run_migrations() -> Result<()> {
    // No migrations needed - MCP server handles schema management
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
    pub project_id: Option<String>,
    pub name: String,
    pub status: String,
    pub current_ticket_id: Option<String>,
    pub last_heartbeat: String,
    pub created_at: String,
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
    // Note: sessions table was removed in migration 14, so active_session_count is always 0
    let mut stmt = conn.prepare(
        "SELECT
            p.id,
            p.name,
            p.working_directory,
            (SELECT COUNT(*) FROM tickets WHERE project_id = p.id) as ticket_count,
            0 as active_session_count,
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
    // Sessions table was removed in migration 14 - return empty list
    Ok(Vec::new())
}

pub fn cleanup_dead_sessions() -> Result<usize> {
    // Sessions table was removed in migration 14 - nothing to clean up
    Ok(0)
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

/// Get project by working directory (returns None if not found)
pub fn get_project_by_directory(working_directory: &str) -> Result<Option<Project>> {
    let conn = get_connection()?;

    let project = conn
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

    Ok(project)
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
    // Cascade delete: tickets first, then project
    // Note: sessions table was removed in migration 14
    conn.execute("DELETE FROM tickets WHERE project_id = ?", [id])?;
    conn.execute("DELETE FROM projects WHERE id = ?", [id])?;
    Ok(())
}

/// Mark a session as disconnected by ID. Returns (project_id,) on success.
/// Note: sessions table was removed in migration 14, so we only release claimed tickets
pub fn mark_session_disconnected(session_id: &str) -> Result<(String,)> {
    let conn = get_connection()?;

    // Release any claimed tickets
    conn.execute(
        "UPDATE tickets SET claimed_by = NULL, claimed_at = NULL, status = 'pending'
         WHERE claimed_by = ? AND status NOT IN ('completed', 'failed', 'archived')",
        [session_id],
    )?;

    println!("[DB] Released tickets for session {}", session_id);

    Ok(("unknown".to_string(),))
}

// ============ Ticket Events ============

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TicketEvent {
    pub id: String,
    pub ticket_id: String,
    pub project_id: String,
    pub event_type: String,
    pub session_id: Option<String>,
    pub previous_value: Option<Value>,
    pub new_value: Option<Value>,
    pub metadata: Option<Value>,
    pub timestamp: String,
}

pub fn list_ticket_events(ticket_id: &str) -> Result<Vec<TicketEvent>> {
    let conn = get_connection()?;
    let mut stmt = conn.prepare(
        "SELECT id, ticket_id, project_id, event_type, session_id,
                previous_value, new_value, metadata, timestamp
         FROM ticket_events
         WHERE ticket_id = ?
         ORDER BY timestamp DESC
         LIMIT 100"
    )?;

    let rows = stmt.query_map([ticket_id], |row| {
        Ok(TicketEvent {
            id: row.get(0)?,
            ticket_id: row.get(1)?,
            project_id: row.get(2)?,
            event_type: row.get(3)?,
            session_id: row.get(4)?,
            previous_value: parse_json(row.get(5)?),
            new_value: parse_json(row.get(6)?),
            metadata: parse_json(row.get(7)?),
            timestamp: row.get(8)?,
        })
    })?;

    rows.collect()
}
