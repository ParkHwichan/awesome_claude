use futures_util::{SinkExt, StreamExt};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::Mutex;
use tokio_tungstenite::{accept_async, tungstenite::Message};
use uuid::Uuid;
use crate::database;

type ClientMap = Arc<Mutex<HashMap<String, tokio::sync::mpsc::UnboundedSender<Message>>>>;
// Maps WebSocket client ID -> MCP session ID
type SessionMap = Arc<Mutex<HashMap<String, String>>>;

pub struct WebSocketHub {
    clients: ClientMap,
    sessions: SessionMap,
    port: u16,
}

impl WebSocketHub {
    pub fn new(port: u16) -> Self {
        Self {
            clients: Arc::new(Mutex::new(HashMap::new())),
            sessions: Arc::new(Mutex::new(HashMap::new())),
            port,
        }
    }

    pub async fn start(&self, app_handle: AppHandle) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let addr = format!("127.0.0.1:{}", self.port);
        let listener = TcpListener::bind(&addr).await?;
        println!("WebSocket Hub listening on {}", addr);

        let clients = self.clients.clone();
        let sessions = self.sessions.clone();

        tokio::spawn(async move {
            while let Ok((stream, peer_addr)) = listener.accept().await {
                let client_id = Uuid::new_v4().to_string();
                println!("New MCP client connected: {} from {}", client_id, peer_addr);

                let clients_clone = clients.clone();
                let sessions_clone = sessions.clone();
                let app_handle_clone = app_handle.clone();
                let client_id_clone = client_id.clone();

                tokio::spawn(async move {
                    if let Err(e) = handle_connection(
                        stream,
                        client_id_clone,
                        clients_clone,
                        sessions_clone,
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

    pub fn get_port(&self) -> u16 {
        self.port
    }
}

async fn handle_connection(
    stream: TcpStream,
    client_id: String,
    clients: ClientMap,
    sessions: SessionMap,
    app_handle: AppHandle,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let ws_stream = accept_async(stream).await?;
    let (mut write, mut read) = ws_stream.split();

    // Create channel for sending messages to this client
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<Message>();

    // Store client sender
    {
        let mut clients_guard = clients.lock().await;
        clients_guard.insert(client_id.clone(), tx);
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

    // Handle incoming messages from MCP client
    while let Some(msg_result) = read.next().await {
        match msg_result {
            Ok(Message::Text(text)) => {
                println!("[WS] Raw message from {}: {} bytes", client_id, text.len());

                // Parse and forward event to Tauri frontend
                match serde_json::from_str::<Value>(&text) {
                    Ok(event) => {
                        if let Some(event_type) = event.get("type").and_then(|t| t.as_str()) {
                            // Handle mcp:register event - map client ID to session ID
                            if event_type == "mcp:register" {
                                if let Some(session_id) = event.get("payload")
                                    .and_then(|p| p.get("sessionId"))
                                    .and_then(|s| s.as_str())
                                {
                                    let mut sessions_guard = sessions.lock().await;
                                    sessions_guard.insert(client_id.clone(), session_id.to_string());
                                    println!("[WS] Registered session {} for client {}", session_id, client_id);
                                }
                            }

                            // Emit to Tauri frontend
                            let emit_result = app_handle.emit("mcp-event", event.clone());
                            println!("[WS] Received event '{}' from {}, emit result: {:?}", event_type, client_id, emit_result);
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

    // If this client had a registered session, mark it as disconnected
    if let Some(ref sid) = session_id {
        println!("[WS] Marking session {} as disconnected", sid);
        if let Ok(session_info) = database::mark_session_disconnected(sid) {
            // Emit session:disconnected event to frontend
            let disconnect_event = serde_json::json!({
                "type": "session:disconnected",
                "timestamp": chrono_now(),
                "payload": {
                    "id": sid,
                    "projectId": session_info.0
                }
            });
            let _ = app_handle.emit("mcp-event", disconnect_event);
            println!("[WS] Emitted session:disconnected for session {}", sid);
        }
    }

    // Notify frontend about WebSocket client disconnection
    let disconnect_event = serde_json::json!({
        "type": "mcp:client_disconnected",
        "timestamp": chrono_now(),
        "payload": {
            "clientId": client_id,
            "sessionId": session_id
        }
    });
    let _ = app_handle.emit("mcp-event", disconnect_event);

    println!("Client {} cleanup complete", client_id);
    Ok(())
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
