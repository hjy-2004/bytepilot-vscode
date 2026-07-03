use std::fs;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use tauri::State;
use crate::commands::workspace::WorkspaceState;

fn chat_dir(state: &WorkspaceState) -> PathBuf {
    let root = state.root.lock().unwrap_or_else(|e| e.into_inner());
    let dir = root.join(".bytepilot").join("sessions");
    fs::create_dir_all(&dir).ok();
    dir
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct SessionData {
    pub messages: Vec<ChatMessage>,
}

#[tauri::command]
pub fn cmd_save_chat(
    state: State<WorkspaceState>,
    session_id: String,
    messages: Vec<ChatMessage>,
) -> Result<(), String> {
    let dir = chat_dir(&state);
    let path = dir.join(format!("{}.json", session_id));
    let data = SessionData { messages };
    let json = serde_json::to_string_pretty(&data).map_err(|e| format!("{}", e))?;
    fs::write(&path, json).map_err(|e| format!("{}", e))
}

#[tauri::command]
pub fn cmd_load_chat(
    state: State<WorkspaceState>,
    session_id: String,
) -> Result<SessionData, String> {
    let dir = chat_dir(&state);
    let path = dir.join(format!("{}.json", session_id));
    if path.exists() {
        let content = fs::read_to_string(&path).map_err(|e| format!("{}", e))?;
        serde_json::from_str(&content).map_err(|e| format!("{}", e))
    } else {
        Ok(SessionData { messages: vec![] })
    }
}

#[tauri::command]
pub fn cmd_list_sessions(
    state: State<WorkspaceState>,
) -> Result<Vec<String>, String> {
    let dir = chat_dir(&state);
    let mut ids = Vec::new();
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.ends_with(".json") {
                ids.push(name.replace(".json", ""));
            }
        }
    }
    Ok(ids)
}

#[tauri::command]
pub fn cmd_delete_session(
    state: State<WorkspaceState>,
    session_id: String,
) -> Result<(), String> {
    let dir = chat_dir(&state);
    let path = dir.join(format!("{}.json", session_id));
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("{}", e))
    } else {
        Ok(())
    }
}
