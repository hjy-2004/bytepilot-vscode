use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use serde::{Deserialize, Serialize};
use tauri::State;

/// Structured settings stored in ~/.bytepilot/settings.json.
/// All fields default to empty — only populated after the user explicitly
/// selects a provider or enters configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    #[serde(default)]
    pub provider: String,
    #[serde(default)]
    pub provider_name: String,
    #[serde(default)]
    pub api_format: String,
    #[serde(default)]
    pub base_url: String,
    #[serde(default)]
    pub chat_model: String,
    #[serde(default)]
    pub completion_model: String,
    #[serde(default)]
    pub env: HashMap<String, String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            provider: String::new(),
            provider_name: String::new(),
            api_format: String::new(),
            base_url: String::new(),
            chat_model: String::new(),
            completion_model: String::new(),
            env: HashMap::new(),
        }
    }
}

fn config_path() -> PathBuf {
    #[cfg(target_os = "windows")]
    let base = std::env::var("USERPROFILE").unwrap_or_else(|_| ".".into());
    #[cfg(not(target_os = "windows"))]
    let base = std::env::var("HOME").unwrap_or_else(|_| ".".into());

    PathBuf::from(&base).join(".bytepilot").join("settings.json")
}

/// Read settings from disk. If the file doesn't exist, create it with
/// empty values as a placeholder — the user can then edit it manually
/// or configure via the UI.
fn load_from_disk() -> Settings {
    let path = config_path();
    if let Ok(content) = fs::read_to_string(&path) {
        if let Ok(settings) = serde_json::from_str::<Settings>(&content) {
            return settings;
        }
    }
    let defaults = Settings::default();
    save_to_disk(&defaults);
    defaults
}

fn save_to_disk(settings: &Settings) {
    let path = config_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).ok();
    }
    if let Ok(json) = serde_json::to_string_pretty(settings) {
        fs::write(&path, json).ok();
    }
}

pub struct AppConfig {
    settings: Mutex<Settings>,
}

impl AppConfig {
    pub fn new() -> Self {
        Self {
            settings: Mutex::new(load_from_disk()),
        }
    }
}

#[tauri::command]
pub fn cmd_get_config(
    config: State<AppConfig>,
    key: String,
) -> Result<String, String> {
    let settings = config.settings.lock().map_err(|e| format!("{}", e))?;
    match key.as_str() {
        "provider" => Ok(settings.provider.clone()),
        "providerName" => Ok(settings.provider_name.clone()),
        "apiFormat" => Ok(settings.api_format.clone()),
        "baseURL" => Ok(settings.base_url.clone()),
        "chatModel" => Ok(settings.chat_model.clone()),
        "completionModel" => Ok(settings.completion_model.clone()),
        "apiKey" => Ok(settings.env.get("OPENAI_API_KEY")
            .or_else(|| settings.env.get("ANTHROPIC_AUTH_TOKEN"))
            .or_else(|| settings.env.get("ANTHROPIC_API_KEY"))
            .or_else(|| settings.env.get("GOOGLE_API_KEY"))
            .cloned()
            .unwrap_or_default()),
        _ => Ok(String::new()),
    }
}

#[tauri::command]
pub fn cmd_set_config(
    config: State<AppConfig>,
    key: String,
    value: String,
) -> Result<(), String> {
    let mut settings = config.settings.lock().map_err(|e| format!("{}", e))?;
    match key.as_str() {
        "provider" => settings.provider = value,
        "providerName" => settings.provider_name = value,
        "apiFormat" => settings.api_format = value,
        "baseURL" => settings.base_url = value,
        "chatModel" => settings.chat_model = value,
        "completionModel" => settings.completion_model = value,
        _ => {}
    }
    save_to_disk(&settings);
    Ok(())
}

/// Write the full provider configuration to settings.json.
/// Called when the user explicitly selects a provider or enters config.
#[tauri::command]
pub fn cmd_sync_provider(
    config: State<AppConfig>,
    provider: String,
    provider_name: String,
    api_format: String,
    base_url: String,
    chat_model: String,
    completion_model: String,
    env: HashMap<String, String>,
) -> Result<(), String> {
    let mut settings = config.settings.lock().map_err(|e| format!("{}", e))?;
    settings.provider = provider;
    settings.provider_name = provider_name;
    settings.api_format = api_format;
    settings.base_url = base_url;
    settings.chat_model = chat_model;
    settings.completion_model = completion_model;
    settings.env = env;
    save_to_disk(&settings);
    Ok(())
}
