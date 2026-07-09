use std::fs;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};

/// Sanitize a path for use as a directory name.
/// Replace non-alphanumeric with `-`. Matches TS `sanitizePath()` in core.
fn sanitize_path(path: &str) -> String {
    let result: String = path
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect();
    if result.is_empty() || result == "-" {
        "default-workspace".to_string()
    } else {
        result
    }
}

/// Project-scoped session storage: ~/.bytepilot/projects/<sanitized-workspace>/
fn project_dir(workspace: &str) -> PathBuf {
    let base = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| ".".into());
    let dir = PathBuf::from(&base)
        .join(".bytepilot")
        .join("projects")
        .join(sanitize_path(workspace));
    fs::create_dir_all(&dir).ok();
    dir
}

/// Legacy sessions dir for backward compat migration.
fn legacy_dir() -> PathBuf {
    let base = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| ".".into());
    PathBuf::from(&base).join(".bytepilot").join("sessions")
}

/// Migrate legacy <id>.json files from ~/.bytepilot/sessions/ to the project dir as JSONL.
fn migrate_legacy_sessions(workspace: &str) {
    let legacy = legacy_dir();
    if !legacy.exists() { return; }
    let proj = project_dir(workspace);
    if let Ok(entries) = fs::read_dir(&legacy) {
        for entry in entries.flatten() {
            let path = entry.path();
            let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
            if !name.ends_with(".json") { continue; }
            let session_id = name.replace(".json", "");
            // Try to read legacy SessionData format
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(data) = serde_json::from_str::<serde_json::Value>(&content) {
                    // Convert to JSONL format
                    if let Some(messages) = data.get("messages").and_then(|m| m.as_array()) {
                        let mut jsonl = String::new();
                        for msg in messages {
                            jsonl.push_str(&serde_json::to_string(msg).unwrap_or_default());
                            jsonl.push('\n');
                        }
                        let new_path = proj.join(format!("{}.jsonl", session_id));
                        fs::write(&new_path, &jsonl).ok();
                    }
                }
            }
            // Remove legacy file after migration
            fs::remove_file(&path).ok();
        }
    }
    // Remove legacy dir if empty
    fs::remove_dir(&legacy).ok();
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
    workspace: String,
    session_id: String,
    messages: Vec<ChatMessage>,
) -> Result<(), String> {
    migrate_legacy_sessions(&workspace);
    let dir = project_dir(&workspace);
    let path = dir.join(format!("{}.jsonl", session_id));
    let mut jsonl = String::new();
    for msg in &messages {
        let line = serde_json::to_string(msg).map_err(|e| format!("{}", e))?;
        jsonl.push_str(&line);
        jsonl.push('\n');
    }
    fs::write(&path, jsonl).map_err(|e| format!("{}", e))
}

#[tauri::command]
pub fn cmd_load_chat(
    workspace: String,
    session_id: String,
) -> Result<SessionData, String> {
    migrate_legacy_sessions(&workspace);
    let dir = project_dir(&workspace);
    let path = dir.join(format!("{}.jsonl", session_id));
    if path.exists() {
        let content = fs::read_to_string(&path).map_err(|e| format!("{}", e))?;
        let messages: Vec<ChatMessage> = content
            .lines()
            .filter(|l| !l.trim().is_empty())
            .filter_map(|l| serde_json::from_str::<ChatMessage>(l).ok())
            .collect();
        Ok(SessionData { messages })
    } else {
        Ok(SessionData { messages: vec![] })
    }
}

#[tauri::command]
pub fn cmd_list_sessions(
    workspace: String,
) -> Result<Vec<String>, String> {
    migrate_legacy_sessions(&workspace);
    let dir = project_dir(&workspace);
    let mut ids = Vec::new();
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.ends_with(".jsonl") {
                ids.push(name.replace(".jsonl", ""));
            }
        }
    }
    Ok(ids)
}

#[tauri::command]
pub fn cmd_delete_session(
    workspace: String,
    session_id: String,
) -> Result<(), String> {
    let dir = project_dir(&workspace);
    let path = dir.join(format!("{}.jsonl", session_id));
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("{}", e))
    } else {
        Ok(())
    }
}
