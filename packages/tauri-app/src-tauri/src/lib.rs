mod commands;
mod database;
mod terminal;
mod websocket;

use terminal::TerminalManager;
use websocket::WebSocketHub;
use std::time::Duration;

const WEBSOCKET_PORT: u16 = 61987;
const CLEANUP_INTERVAL_SECS: u64 = 10;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(TerminalManager::new())
        .setup(|app| {
            println!("Awesome Claude started");

            // Start WebSocket hub server
            let app_handle = app.handle().clone();
            let ws_hub = WebSocketHub::new(WEBSOCKET_PORT);

            tauri::async_runtime::spawn(async move {
                if let Err(e) = ws_hub.start(app_handle).await {
                    eprintln!("Failed to start WebSocket hub: {}", e);
                }
            });

            // Start periodic dead session cleanup
            tauri::async_runtime::spawn(async move {
                loop {
                    tokio::time::sleep(Duration::from_secs(CLEANUP_INTERVAL_SECS)).await;
                    match database::cleanup_dead_sessions() {
                        Ok(count) if count > 0 => {
                            println!("Cleaned up {} dead session(s)", count);
                        }
                        Err(e) => {
                            eprintln!("Failed to cleanup dead sessions: {}", e);
                        }
                        _ => {}
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_initial_data,
            commands::get_projects,
            commands::get_sessions,
            commands::get_tickets,
            commands::cleanup_dead_sessions,
            commands::update_ticket,
            commands::delete_ticket,
            commands::create_project,
            commands::delete_project,
            commands::open_claude_terminal,
            commands::terminal_create,
            commands::terminal_attach,
            commands::terminal_detach,
            commands::terminal_write,
            commands::terminal_resize,
            commands::terminal_kill,
            commands::terminal_list,
            commands::list_directory,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
