use futures_util::{SinkExt, StreamExt};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::Mutex;
use tokio_tungstenite::{accept_async, tungstenite::Message};
use uuid::Uuid;
use crate::terminal::TerminalManager;
use crate::database;

type ClientMap = Arc<Mutex<HashMap<String, tokio::sync::mpsc::UnboundedSender<Message>>>>;
// Maps WebSocket client ID -> MCP session ID
type SessionMap = Arc<Mutex<HashMap<String, String>>>;

// Terminal session slot - persists across MCP reconnects
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct TerminalSessionSlot {
    pub terminal_session_id: String,  // Terminal's session ID (from TerminalManager)
    pub shell_pid: u32,
    pub animal_name: String,
    pub animal_index: usize,
    pub mcp_session_id: Option<String>,  // Current MCP session ID if connected
}

// Animal names for sessions
const ANIMAL_NAMES: &[&str] = &[
    "Bear", "Fox", "Rabbit", "Wolf", "Deer",
    "Owl", "Eagle", "Hawk", "Falcon", "Raven",
    "Tiger", "Lion", "Panther", "Jaguar", "Leopard",
    "Dolphin", "Whale", "Shark", "Orca", "Seal",
    "Koala", "Panda", "Sloth", "Otter", "Beaver",
];

// Maps terminal session ID -> session slot
type TerminalSlotMap = Arc<Mutex<HashMap<String, TerminalSessionSlot>>>;
// Counter for animal name assignment
type AnimalCounter = Arc<Mutex<usize>>;

pub struct WebSocketHub {
    clients: ClientMap,
    sessions: SessionMap,
    terminal_slots: TerminalSlotMap,
    animal_counter: AnimalCounter,
    port: u16,
}

impl WebSocketHub {
    pub fn new(port: u16) -> Self {
        Self {
            clients: Arc::new(Mutex::new(HashMap::new())),
            sessions: Arc::new(Mutex::new(HashMap::new())),
            terminal_slots: Arc::new(Mutex::new(HashMap::new())),
            animal_counter: Arc::new(Mutex::new(0)),
            port,
        }
    }

    pub async fn start(&self, app_handle: AppHandle) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let addr = format!("127.0.0.1:{}", self.port);
        let listener = TcpListener::bind(&addr).await?;
        println!("WebSocket Hub listening on {}", addr);

        let clients = self.clients.clone();
        let sessions = self.sessions.clone();
        let terminal_slots = self.terminal_slots.clone();
        let animal_counter = self.animal_counter.clone();

        tokio::spawn(async move {
            while let Ok((stream, peer_addr)) = listener.accept().await {
                let client_id = Uuid::new_v4().to_string();
                println!("New MCP client connected: {} from {}", client_id, peer_addr);

                let clients_clone = clients.clone();
                let sessions_clone = sessions.clone();
                let terminal_slots_clone = terminal_slots.clone();
                let animal_counter_clone = animal_counter.clone();
                let app_handle_clone = app_handle.clone();
                let client_id_clone = client_id.clone();

                tokio::spawn(async move {
                    if let Err(e) = handle_connection(
                        stream,
                        client_id_clone,
                        clients_clone,
                        sessions_clone,
                        terminal_slots_clone,
                        animal_counter_clone,
                        app_handle_clone,
                    )
                    .await
                    {
                        eprintln!("Connection error: {}", e);
                    }
                });
            }
        });

        Ok(())
    }

    #[allow(dead_code)]
    pub fn get_port(&self) -> u16 {
        self.port
    }
}

async fn handle_connection(
    stream: TcpStream,
    client_id: String,
    clients: ClientMap,
    sessions: SessionMap,
    terminal_slots: TerminalSlotMap,
    animal_counter: AnimalCounter,
    app_handle: AppHandle,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let ws_stream = accept_async(stream).await?;
    let (mut write, mut read) = ws_stream.split();

    // Create channel for sending messages to this client
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<Message>();

    // Store client sender
    {
        let mut clients_guard = clients.lock().await;
        clients_guard.insert(client_id.clone(), tx.clone());
    }

    // Send connection established event to this client
    let connect_event = serde_json::json!({
        "type": "connection:established",
        "timestamp": chrono_now(),
        "payload": {
            "clientId": client_id,
            "serverVersion": "0.1.0"
        }
    });
    println!("[WS] Sending connection:established to {}", client_id);
    let send_result = write.send(Message::Text(connect_event.to_string().into())).await;
    println!("[WS] Send result: {:?}", send_result);

    // Spawn task to handle outgoing messages
    let write_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if write.send(msg).await.is_err() {
                break;
            }
        }
    });

    // Track assigned session for this connection
    let mut assigned_session_id: Option<String> = None;
    let mut assigned_terminal_id: Option<String> = None;

    // Handle incoming messages from MCP client
    while let Some(msg_result) = read.next().await {
        match msg_result {
            Ok(Message::Text(text)) => {
                println!("[WS] Raw message from {}: {} bytes", client_id, text.len());

                // Parse and forward event to Tauri frontend
                match serde_json::from_str::<Value>(&text) {
                    Ok(event) => {
                        if let Some(event_type) = event.get("type").and_then(|t| t.as_str()) {
                            // Handle mcp:register event with PID chain matching
                            if event_type == "mcp:register" {
                                if let Some(payload) = event.get("payload") {
                                    let pid_chain: Vec<u32> = payload.get("pidChain")
                                        .and_then(|v| v.as_array())
                                        .map(|arr| arr.iter().filter_map(|v| v.as_u64().map(|n| n as u32)).collect())
                                        .unwrap_or_default();

                                    println!("[WS] MCP register with PID chain: {:?}", pid_chain);

                                    // Try to match PID chain to a terminal
                                    let terminal_manager: tauri::State<'_, TerminalManager> = app_handle.state();
                                    let matched_terminal = find_terminal_by_pid_chain(&terminal_manager, &pid_chain);

                                    if let Some((terminal_session_id, shell_pid, working_dir)) = matched_terminal {
                                        println!("[WS] Matched terminal: {} (shell PID: {}, dir: {})", terminal_session_id, shell_pid, working_dir);

                                        // Find project by working directory
                                        let project_id = database::get_project_by_directory(&working_dir)
                                            .ok()
                                            .flatten()
                                            .map(|p| p.id);
                                        println!("[WS] Matched project: {:?}", project_id);

                                        // Check if this terminal already has a session slot
                                        let mut slots = terminal_slots.lock().await;
                                        let slot = if let Some(existing_slot) = slots.get_mut(&terminal_session_id) {
                                            // Reactivate existing slot
                                            println!("[WS] Reactivating session slot: {} ({})", existing_slot.animal_name, existing_slot.mcp_session_id.as_deref().unwrap_or("none"));
                                            existing_slot.mcp_session_id = Some(format!("mcp-{}", pid_chain.first().unwrap_or(&0)));
                                            existing_slot.clone()
                                        } else {
                                            // Create new slot
                                            let mut counter = animal_counter.lock().await;
                                            let animal_index = *counter % ANIMAL_NAMES.len();
                                            *counter += 1;
                                            let animal_name = ANIMAL_NAMES[animal_index].to_string();

                                            let new_slot = TerminalSessionSlot {
                                                terminal_session_id: terminal_session_id.clone(),
                                                shell_pid,
                                                animal_name: animal_name.clone(),
                                                animal_index,
                                                mcp_session_id: Some(format!("mcp-{}", pid_chain.first().unwrap_or(&0))),
                                            };
                                            slots.insert(terminal_session_id.clone(), new_slot.clone());
                                            println!("[WS] Created new session slot: {} ({})", animal_name, terminal_session_id);
                                            new_slot
                                        };

                                        assigned_session_id = slot.mcp_session_id.clone();
                                        assigned_terminal_id = Some(terminal_session_id.clone());

                                        // Update terminal title to animal name
                                        let _ = terminal_manager.update(&terminal_session_id, Some(slot.animal_name.clone()), None);

                                        // Emit terminal:updated event to frontend
                                        let terminal_event = serde_json::json!({
                                            "type": "terminal:updated",
                                            "payload": {
                                                "sessionId": terminal_session_id,
                                                "title": slot.animal_name,
                                            }
                                        });
                                        let _ = app_handle.emit("terminal-event", terminal_event);

                                        // Map client to session
                                        {
                                            let mut sessions_guard = sessions.lock().await;
                                            if let Some(ref sid) = assigned_session_id {
                                                sessions_guard.insert(client_id.clone(), sid.clone());
                                            }
                                        }

                                        // Send session:assigned to MCP
                                        let assign_event = serde_json::json!({
                                            "type": "session:assigned",
                                            "timestamp": chrono_now(),
                                            "payload": {
                                                "sessionId": assigned_session_id,
                                                "terminalSessionId": terminal_session_id,
                                                "shellPid": shell_pid,
                                                "animalName": slot.animal_name,
                                                "animalIndex": slot.animal_index,
                                                "projectId": project_id,
                                            }
                                        });
                                        let _ = tx.send(Message::Text(assign_event.to_string().into()));

                                        // Emit session:registered to frontend with slot info
                                        let now = chrono_now();
                                        let session_event = serde_json::json!({
                                            "type": "session:registered",
                                            "timestamp": now,
                                            "payload": {
                                                "id": assigned_session_id,
                                                "projectId": project_id,
                                                "name": slot.animal_name,
                                                "status": "active",
                                                "lastHeartbeat": now,
                                                "createdAt": now,
                                                "terminalSessionId": terminal_session_id,
                                                "shellPid": shell_pid,
                                            }
                                        });
                                        let _ = app_handle.emit("mcp-event", session_event);
                                    } else {
                                        println!("[WS] No terminal matched for PID chain: {:?}", pid_chain);

                                        // Fallback: Create an "unattached" session slot
                                        // This handles MCP running outside of Tauri terminals
                                        // Use shell PID (last in chain) to identify the terminal
                                        let mcp_pid = *pid_chain.first().unwrap_or(&0);
                                        let shell_pid = *pid_chain.last().unwrap_or(&mcp_pid);
                                        let fallback_session_id = format!("mcp-{}", mcp_pid);
                                        let fallback_terminal_id = format!("external-{}", shell_pid);

                                        // Get workingDirectory from MCP payload to find project
                                        let working_dir = payload.get("workingDirectory")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or("");
                                        let project_id = if !working_dir.is_empty() {
                                            database::get_project_by_directory(working_dir)
                                                .ok()
                                                .flatten()
                                                .map(|p| p.id)
                                        } else {
                                            None
                                        };
                                        println!("[WS] Fallback project: {:?} (from dir: {})", project_id, working_dir);

                                        // Check if this "external terminal" already has a slot
                                        let mut slots = terminal_slots.lock().await;
                                        let slot = if let Some(existing_slot) = slots.get_mut(&fallback_terminal_id) {
                                            // Reactivate existing slot
                                            existing_slot.mcp_session_id = Some(fallback_session_id.clone());
                                            existing_slot.clone()
                                        } else {
                                            // Create new slot
                                            let mut counter = animal_counter.lock().await;
                                            let animal_index = *counter % ANIMAL_NAMES.len();
                                            *counter += 1;
                                            let animal_name = ANIMAL_NAMES[animal_index].to_string();

                                            let new_slot = TerminalSessionSlot {
                                                terminal_session_id: fallback_terminal_id.clone(),
                                                shell_pid,
                                                animal_name: animal_name.clone(),
                                                animal_index,
                                                mcp_session_id: Some(fallback_session_id.clone()),
                                            };
                                            slots.insert(fallback_terminal_id.clone(), new_slot.clone());
                                            println!("[WS] Created fallback session slot: {} ({})", animal_name, fallback_terminal_id);
                                            new_slot
                                        };

                                        assigned_session_id = Some(fallback_session_id.clone());
                                        assigned_terminal_id = Some(fallback_terminal_id.clone());

                                        // Map client to session
                                        {
                                            let mut sessions_guard = sessions.lock().await;
                                            sessions_guard.insert(client_id.clone(), fallback_session_id.clone());
                                        }

                                        // Send session:assigned to MCP
                                        let assign_event = serde_json::json!({
                                            "type": "session:assigned",
                                            "timestamp": chrono_now(),
                                            "payload": {
                                                "sessionId": fallback_session_id,
                                                "terminalSessionId": fallback_terminal_id,
                                                "shellPid": mcp_pid,
                                                "animalName": slot.animal_name,
                                                "animalIndex": slot.animal_index,
                                                "projectId": project_id,
                                            }
                                        });
                                        let _ = tx.send(Message::Text(assign_event.to_string().into()));

                                        // Emit session:registered to frontend
                                        let now = chrono_now();
                                        let session_event = serde_json::json!({
                                            "type": "session:registered",
                                            "timestamp": now,
                                            "payload": {
                                                "id": assigned_session_id,
                                                "projectId": project_id,
                                                "name": slot.animal_name,
                                                "status": "active",
                                                "lastHeartbeat": now,
                                                "createdAt": now,
                                                "terminalSessionId": fallback_terminal_id,
                                                "shellPid": mcp_pid,
                                            }
                                        });
                                        let _ = app_handle.emit("mcp-event", session_event);
                                    }
                                }
                            } else {
                                // Forward other events to frontend
                                let emit_result = app_handle.emit("mcp-event", event.clone());
                                println!("[WS] Received event '{}' from {}, emit result: {:?}", event_type, client_id, emit_result);
                            }
                        } else {
                            println!("[WS] Event has no 'type' field: {}", &text[..text.len().min(100)]);
                        }
                    }
                    Err(e) => {
                        println!("[WS] Failed to parse JSON from {}: {}", client_id, e);
                        println!("[WS] Raw text: {}", &text[..text.len().min(200)]);
                    }
                }
            }
            Ok(Message::Ping(data)) => {
                // Respond to ping with pong
                let clients_guard = clients.lock().await;
                if let Some(tx) = clients_guard.get(&client_id) {
                    let _ = tx.send(Message::Pong(data));
                }
            }
            Ok(Message::Close(_)) => {
                println!("Client {} disconnected", client_id);
                break;
            }
            Err(e) => {
                eprintln!("Error reading from client {}: {}", client_id, e);
                break;
            }
            _ => {}
        }
    }

    // Cleanup - get session ID before removing from sessions map
    let session_id: Option<String>;
    {
        let mut sessions_guard = sessions.lock().await;
        session_id = sessions_guard.remove(&client_id);
    }
    {
        let mut clients_guard = clients.lock().await;
        clients_guard.remove(&client_id);
    }

    write_task.abort();

    // Clear mcp_session_id from terminal slot (but keep the slot for reconnection)
    if let Some(ref terminal_id) = assigned_terminal_id {
        let mut slots = terminal_slots.lock().await;
        if let Some(slot) = slots.get_mut(terminal_id) {
            println!("[WS] Clearing MCP session from slot {} ({})", slot.animal_name, terminal_id);
            slot.mcp_session_id = None;
        }
    }

    // Emit session status change (idle, not disconnected - slot is still there)
    if let Some(ref sid) = assigned_session_id {
        if let Some(ref terminal_id) = assigned_terminal_id {
            let slots = terminal_slots.lock().await;
            if let Some(slot) = slots.get(terminal_id) {
                // Emit session:heartbeat with idle status (not disconnected)
                let update_event = serde_json::json!({
                    "type": "session:heartbeat",
                    "timestamp": chrono_now(),
                    "payload": {
                        "id": sid,
                        "status": "idle",
                        "currentTicketId": null,
                    }
                });
                let _ = app_handle.emit("mcp-event", update_event);
                println!("[WS] Emitted session:heartbeat (idle) for {} ({})", slot.animal_name, sid);
            }
        }
    }

    // Notify frontend about WebSocket client disconnection
    let disconnect_event = serde_json::json!({
        "type": "mcp:client_disconnected",
        "timestamp": chrono_now(),
        "payload": {
            "clientId": client_id,
            "sessionId": session_id,
            "terminalSessionId": assigned_terminal_id,
        }
    });
    let _ = app_handle.emit("mcp-event", disconnect_event);

    println!("Client {} cleanup complete", client_id);
    Ok(())
}

/// Find terminal by matching PID chain to terminal's shell PID or child processes
/// Returns (session_id, shell_pid, working_dir) if a terminal is found
fn find_terminal_by_pid_chain(terminal_manager: &TerminalManager, pid_chain: &[u32]) -> Option<(String, u32, String)> {
    let terminals = terminal_manager.list();

    for terminal in &terminals {
        // Check if shell PID is in the chain
        if pid_chain.contains(&terminal.shell_pid) {
            return Some((terminal.session_id.clone(), terminal.shell_pid, terminal.working_dir.clone()));
        }

        // Check if any child process PID is in the chain
        for child in &terminal.child_processes {
            if pid_chain.contains(&child.pid) {
                return Some((terminal.session_id.clone(), terminal.shell_pid, terminal.working_dir.clone()));
            }
        }
    }

    // Fallback: Check using sysinfo to trace process tree
    // MCP's parent chain should eventually reach the terminal's shell
    use sysinfo::{System, Pid, ProcessesToUpdate, ProcessRefreshKind, UpdateKind};
    let mut sys = System::new();
    sys.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,  // refresh all
        ProcessRefreshKind::new().with_cmd(UpdateKind::Always)
    );

    for &mcp_pid in pid_chain {
        let mut current_pid = mcp_pid;
        let mut visited = std::collections::HashSet::new();

        // Walk up the process tree
        while current_pid > 0 && visited.insert(current_pid) {
            // Check if this PID matches any terminal's shell PID
            for terminal in &terminals {
                if terminal.shell_pid == current_pid {
                    return Some((terminal.session_id.clone(), terminal.shell_pid, terminal.working_dir.clone()));
                }
            }

            // Get parent PID
            if let Some(process) = sys.process(Pid::from_u32(current_pid)) {
                if let Some(parent_pid) = process.parent() {
                    current_pid = parent_pid.as_u32();
                } else {
                    break;
                }
            } else {
                break;
            }
        }
    }

    None
}

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
