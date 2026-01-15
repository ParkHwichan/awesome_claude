use crate::McpServerState;
use serde::Serialize;
use tauri::State;
use tauri_plugin_shell::ShellExt;

#[derive(Serialize)]
pub struct McpServerStatus {
    pub running: bool,
    pub ws_port: u16,
}

#[tauri::command]
pub async fn get_mcp_server_status(state: State<'_, McpServerState>) -> Result<McpServerStatus, String> {
    let child_guard = state.child.lock().await;
    Ok(McpServerStatus {
        running: child_guard.is_some(),
        ws_port: 3001,
    })
}

#[tauri::command]
pub async fn restart_mcp_server(
    app_handle: tauri::AppHandle,
    state: State<'_, McpServerState>,
) -> Result<(), String> {
    // Kill existing process
    {
        let mut child_guard = state.child.lock().await;
        if let Some(child) = child_guard.take() {
            let _ = child.kill();
        }
    }

    // Start new process
    let shell = app_handle.shell();

    let sidecar = shell
        .sidecar("binaries/awesome-claude-mcp")
        .map_err(|e| format!("Failed to create sidecar command: {}", e))?;

    let (mut rx, child) = sidecar
        .spawn()
        .map_err(|e| format!("Failed to spawn sidecar: {}", e))?;

    // Store the new child process
    let mut child_guard = state.child.lock().await;
    *child_guard = Some(child);

    // Log sidecar output
    tauri::async_runtime::spawn(async move {
        use tauri_plugin_shell::process::CommandEvent;
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    println!("[MCP Server] {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Stderr(line) => {
                    eprintln!("[MCP Server] {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Error(err) => {
                    eprintln!("[MCP Server Error] {}", err);
                }
                CommandEvent::Terminated(payload) => {
                    println!("[MCP Server] Terminated with code: {:?}", payload.code);
                    break;
                }
                _ => {}
            }
        }
    });

    Ok(())
}
