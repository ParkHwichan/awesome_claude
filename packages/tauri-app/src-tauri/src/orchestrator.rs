use std::collections::HashMap;
use std::process::Stdio;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::RwLock;
use tauri::{AppHandle, Emitter};
use serde::{Deserialize, Serialize};

const ORCHESTRATOR_SYSTEM_PROMPT: &str = r#"You are an autonomous ticket orchestrator for a multi-session development project.

Your role:
1. Run ticket_health_check to monitor system health
2. When issues are found, run ticket_orchestrate for details
3. Suggest or automatically fix problems

You have access to these MCP tools:
- ticket_list: List all tickets
- ticket_orchestrate: Analyze ticket graph
- ticket_health_check: Quick health check
- ticket_suggest_next: Get next recommended ticket

Respond concisely. Focus on actions, not explanations."#;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrchestratorOutput {
    pub project_id: String,
    pub output_type: String, // "stdout", "stderr", "status"
    pub content: String,
    pub timestamp: String,
}

#[derive(Debug)]
struct OrchestratorState {
    working_directory: String,
    is_running: bool,
}

pub struct OrchestratorManager {
    states: Arc<RwLock<HashMap<String, OrchestratorState>>>,
}

impl OrchestratorManager {
    pub fn new() -> Self {
        Self {
            states: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn start(
        &self,
        app_handle: AppHandle,
        project_id: String,
        working_directory: String,
    ) -> Result<(), String> {
        // Check if already running
        {
            let states = self.states.read().await;
            if let Some(state) = states.get(&project_id) {
                if state.is_running {
                    return Err("Orchestrator already running for this project".to_string());
                }
            }
        }

        // Store state
        {
            let mut states = self.states.write().await;
            states.insert(project_id.clone(), OrchestratorState {
                working_directory: working_directory.clone(),
                is_running: true,
            });
        }

        // Emit started event
        let _ = app_handle.emit("orchestrator:started", &project_id);

        // Run initial health check
        let app_handle_clone = app_handle.clone();
        let project_id_clone = project_id.clone();
        let working_directory_clone = working_directory.clone();

        tokio::spawn(async move {
            let result = run_claude_command(
                &working_directory_clone,
                "Run ticket_health_check and summarize the results briefly.",
            ).await;

            match result {
                Ok(output) => {
                    let orchestrator_output = OrchestratorOutput {
                        project_id: project_id_clone,
                        output_type: "stdout".to_string(),
                        content: output,
                        timestamp: chrono::Utc::now().to_rfc3339(),
                    };
                    let _ = app_handle_clone.emit("orchestrator:output", &orchestrator_output);
                }
                Err(e) => {
                    let orchestrator_output = OrchestratorOutput {
                        project_id: project_id_clone,
                        output_type: "stderr".to_string(),
                        content: e,
                        timestamp: chrono::Utc::now().to_rfc3339(),
                    };
                    let _ = app_handle_clone.emit("orchestrator:output", &orchestrator_output);
                }
            }
        });

        Ok(())
    }

    pub async fn stop(&self, app_handle: AppHandle, project_id: &str) -> Result<(), String> {
        let mut states = self.states.write().await;

        if let Some(state) = states.get_mut(project_id) {
            state.is_running = false;
            let _ = app_handle.emit("orchestrator:stopped", project_id);
            Ok(())
        } else {
            Err("No orchestrator running for this project".to_string())
        }
    }

    pub async fn send(&self, app_handle: AppHandle, project_id: &str, message: String) -> Result<(), String> {
        let working_directory = {
            let states = self.states.read().await;
            match states.get(project_id) {
                Some(state) if state.is_running => state.working_directory.clone(),
                Some(_) => return Err("Orchestrator not running".to_string()),
                None => return Err("No orchestrator for this project".to_string()),
            }
        };

        // Run command asynchronously
        let app_handle_clone = app_handle.clone();
        let project_id_clone = project_id.to_string();

        tokio::spawn(async move {
            // Emit that we're processing
            let processing_output = OrchestratorOutput {
                project_id: project_id_clone.clone(),
                output_type: "status".to_string(),
                content: "Processing...".to_string(),
                timestamp: chrono::Utc::now().to_rfc3339(),
            };
            let _ = app_handle_clone.emit("orchestrator:output", &processing_output);

            let result = run_claude_command(&working_directory, &message).await;

            match result {
                Ok(output) => {
                    let orchestrator_output = OrchestratorOutput {
                        project_id: project_id_clone,
                        output_type: "stdout".to_string(),
                        content: output,
                        timestamp: chrono::Utc::now().to_rfc3339(),
                    };
                    let _ = app_handle_clone.emit("orchestrator:output", &orchestrator_output);
                }
                Err(e) => {
                    let orchestrator_output = OrchestratorOutput {
                        project_id: project_id_clone,
                        output_type: "stderr".to_string(),
                        content: e,
                        timestamp: chrono::Utc::now().to_rfc3339(),
                    };
                    let _ = app_handle_clone.emit("orchestrator:output", &orchestrator_output);
                }
            }
        });

        Ok(())
    }

    pub async fn is_running(&self, project_id: &str) -> bool {
        let states = self.states.read().await;
        states.get(project_id).map(|s| s.is_running).unwrap_or(false)
    }

    pub async fn list_running(&self) -> Vec<String> {
        let states = self.states.read().await;
        states.iter()
            .filter(|(_, s)| s.is_running)
            .map(|(id, _)| id.clone())
            .collect()
    }
}

/// Run a claude command and return the output
async fn run_claude_command(working_directory: &str, prompt: &str) -> Result<String, String> {
    let full_prompt = format!(
        "{}\n\nUser request: {}",
        ORCHESTRATOR_SYSTEM_PROMPT,
        prompt
    );

    let output = Command::new("claude")
        .args([
            "--dangerously-skip-permissions",
            "--print",
            &full_prompt,
        ])
        .env("AWESOME_CLAUDE_ROLE", "orchestrator")
        .current_dir(working_directory)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to run claude: {}", e))?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        Ok(stdout)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        Err(format!("Claude exited with error: {}", stderr))
    }
}
