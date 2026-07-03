use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::State;

fn config_path() -> PathBuf {
    #[cfg(target_os = "windows")]
    let base = std::env::var("APPDATA").unwrap_or_else(|_| ".".into());
    #[cfg(not(target_os = "windows"))]
    let base = std::env::var("HOME").unwrap_or_else(|_| ".".into());

    let dir = PathBuf::from(&base).join("bytepilot");
    fs::create_dir_all(&dir).ok();
    dir.join("config.json")
}

fn load_from_disk() -> HashMap<String, String> {
    let path = config_path();
    if let Ok(content) = fs::read_to_string(&path) {
        if let Ok(map) = serde_json::from_str::<HashMap<String, String>>(&content) {
            return map;
        }
    }
    HashMap::new()
}

fn save_to_disk(values: &HashMap<String, String>) {
    let path = config_path();
    if let Ok(json) = serde_json::to_string_pretty(values) {
        fs::write(&path, json).ok();
    }
}

pub struct AppConfig {
    values: Mutex<HashMap<String, String>>,
}

impl AppConfig {
    pub fn new() -> Self {
        Self {
            values: Mutex::new(load_from_disk()),
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
    save_to_disk(&values);
    Ok(())
}
