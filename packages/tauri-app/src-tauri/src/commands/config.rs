use std::collections::HashMap;
use std::sync::Mutex;
use tauri::State;

/// In-memory configuration store for the desktop app.
/// In production, this would use tauri-plugin-store for persistence.
pub struct AppConfig {
    values: Mutex<HashMap<String, String>>,
}

impl AppConfig {
    pub fn new() -> Self {
        Self {
            values: Mutex::new(HashMap::new()),
        }
    }
}

fn default_config() -> HashMap<String, String> {
    let mut defaults = HashMap::new();
    defaults.insert("provider".into(), "anthropic".into());
    defaults.insert("chatModel".into(), "claude-sonnet-4-6".into());
    defaults.insert("completionModel".into(), "".into());
    defaults.insert("baseURL".into(), "".into());
    defaults.insert("temperature".into(), "0.7".into());
    defaults.insert("maxTokens".into(), "4096".into());
    defaults.insert("thinkingBudget".into(), "4096".into());
    defaults.insert("completionsEnabled".into(), "true".into());
    defaults.insert("completionDebounceMs".into(), "300".into());
    defaults.insert("completionTemperature".into(), "0.0".into());
    defaults.insert("completionMaxTokens".into(), "256".into());
    defaults.insert("contextLength".into(), "128000".into());
    defaults.insert("toolApprovalLevel".into(), "writeOnly".into());
    defaults.insert("maxAgentSteps".into(), "500".into());
    defaults
}

#[tauri::command]
pub fn cmd_get_config(
    config: State<AppConfig>,
    key: String,
) -> Result<String, String> {
    let defaults = default_config();
    let values = config.values.lock().map_err(|e| format!("{}", e))?;
    // Check stored values first, then defaults
    if let Some(val) = values.get(&key) {
        Ok(val.clone())
    } else if let Some(val) = defaults.get(&key) {
        Ok(val.clone())
    } else {
        Ok(String::new())
    }
}

#[tauri::command]
pub fn cmd_set_config(
    config: State<AppConfig>,
    key: String,
    value: String,
) -> Result<(), String> {
    let mut values = config.values.lock().map_err(|e| format!("{}", e))?;
    values.insert(key, value);
    // In production, persist to disk here via tauri-plugin-store
    Ok(())
}
