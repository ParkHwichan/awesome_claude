mod commands;

use tauri::Manager;
use tauri_plugin_shell::ShellExt;
use std::sync::Arc;
use tokio::sync::Mutex;

pub struct McpServerState {
    pub child: Arc<Mutex<Option<tauri_plugin_shell::process::CommandChild>>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(McpServerState {
            child: Arc::new(Mutex::new(None)),
        })
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Start MCP server sidecar on app startup
            tauri::async_runtime::spawn(async move {
                if let Err(e) = start_mcp_sidecar(&app_handle).await {
                    eprintln!("Failed to start MCP server sidecar: {}", e);
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let app_handle = window.app_handle().clone();
                tauri::async_runtime::spawn(async move {
                    let state = app_handle.state::<McpServerState>();
                    let mut child_guard = state.child.lock().await;
                    if let Some(child) = child_guard.take() {
                        let _ = child.kill();
                    }
                });
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_mcp_server_status,
            commands::restart_mcp_server,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

async fn start_mcp_sidecar(app_handle: &tauri::AppHandle) -> Result<(), String> {
    let shell = app_handle.shell();

    let sidecar = shell
        .sidecar("binaries/awesome-claude-mcp")
        .map_err(|e| format!("Failed to create sidecar command: {}", e))?;

    let (mut rx, child) = sidecar
        .spawn()
        .map_err(|e| format!("Failed to spawn sidecar: {}", e))?;

    // Store the child process
    let state = app_handle.state::<McpServerState>();
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

    println!("MCP Server sidecar started");
    Ok(())
}
