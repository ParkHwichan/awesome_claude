mod commands;
mod database;
mod macros;
mod orchestrator;
mod terminal;
mod websocket;

use orchestrator::OrchestratorManager;
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
        .manage(OrchestratorManager::new())
        .setup(|app| {
            println!("Awesome Claude started");

            // Run database migrations
            if let Err(e) = database::run_migrations() {
                eprintln!("Failed to run migrations: {}", e);
            }

            // Ensure global ~/.claude/CLAUDE.md has awesome-claude rules
            tauri::async_runtime::spawn(async {
                match commands::ensure_global_claude_md().await {
                    Ok(result) if result.updated => {
                        println!("[awesome-claude] Updated global CLAUDE.md: {}", result.path);
                    }
                    Err(e) => {
                        eprintln!("[awesome-claude] Failed to update global CLAUDE.md: {}", e);
                    }
                    _ => {}
                }
            });

            // Ensure global ~/.claude/settings.json has awesome-claude hooks
            tauri::async_runtime::spawn(async {
                match commands::ensure_global_settings().await {
                    Ok(result) if result.updated => {
                        println!("[awesome-claude] Updated global settings.json (v{}): {}", result.version, result.path);
                    }
                    Err(e) => {
                        eprintln!("[awesome-claude] Failed to update global settings.json: {}", e);
                    }
                    _ => {}
                }
            });

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
            commands::disconnect_session,
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
            commands::terminal_update,
            commands::terminal_reset,
            commands::terminal_soft_reset,
            commands::list_directory,
            commands::read_file,
            commands::write_file,
            commands::create_file,
            commands::create_directory,
            commands::delete_path,
            commands::rename_path,
            commands::search_in_files,
            commands::replace_in_file,
            commands::git_status,
            commands::git_diff,
            commands::git_stage_file,
            commands::git_unstage_file,
            commands::git_discard_changes,
            commands::find_tsconfig,
            commands::resolve_import_path,
            commands::check_skill_file,
            commands::ensure_skill_file,
            commands::check_global_claude_md,
            commands::ensure_global_claude_md,
            commands::ensure_global_settings,
            commands::orchestrator_start,
            commands::orchestrator_stop,
            commands::orchestrator_send,
            commands::orchestrator_is_running,
            commands::orchestrator_list_running,
            commands::get_ticket_events,
            // Macro commands
            macros::macro_list,
            macros::macro_create,
            macros::macro_update,
            macros::macro_delete,
            macros::macro_reorder,
        ])
        .run(tauri::generate_context!())
        .unwrap_or_else(|e| {
            eprintln!("Failed to run Tauri application: {}", e);
            std::process::exit(1);
        });
}
