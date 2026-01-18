use crate::database::{self, ProjectSummary, Session, Ticket};
use serde::Serialize;

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
