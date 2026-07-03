use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use serde::Serialize;

fn log_dir() -> PathBuf {
    let base = dirs_next().unwrap_or_else(|| PathBuf::from("."));
    let dir = base.join("bytepilot").join("logs");
    fs::create_dir_all(&dir).ok();
    dir
}

fn log_file() -> PathBuf {
    log_dir().join("bytepilot.log")
}

fn dirs_next() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        std::env::var("APPDATA").ok().map(PathBuf::from)
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::env::var("HOME").ok().map(|h| PathBuf::from(h).join(".local").join("share"))
    }
}

fn timestamp() -> String {
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = ts.as_secs();
    let ms = ts.subsec_millis();
    // Simple ISO-like timestamp
    let total_secs = secs % 86400;
    let h = total_secs / 3600;
    let m = (total_secs % 3600) / 60;
    let s = total_secs % 60;
    format!("{:02}:{:02}:{:02}.{:03}", h, m, s, ms)
}

#[derive(Serialize)]
pub struct LogStats {
    path: String,
    size: u64,
}

#[tauri::command]
pub fn cmd_write_log(level: String, message: String, error_detail: Option<String>) -> Result<(), String> {
    let path = log_file();
    let ts = timestamp();
    let mut line = format!("[{}] [{}] {}", ts, level.to_uppercase(), message);
    if let Some(err) = error_detail {
        line.push_str(&format!("\n  Error: {}", err));
    }
    line.push('\n');

    // Append to log file
    let existing = fs::read_to_string(&path).unwrap_or_default();
    let new_line = existing.clone() + &line;

    // Rotate if > 1MB
    if new_line.len() > 1_000_000 {
        let rotated = log_dir().join("bytepilot.1.log");
        fs::write(&rotated, &existing).map_err(|e| format!("{}", e))?;
        fs::write(&path, &line).map_err(|e| format!("{}", e))?;
    } else {
        fs::write(&path, &new_line).map_err(|e| format!("{}", e))?;
    }
    Ok(())
}

#[tauri::command]
pub fn cmd_get_log_path() -> Result<String, String> {
    Ok(log_file().to_string_lossy().to_string())
}

#[tauri::command]
pub fn cmd_read_logs() -> Result<String, String> {
    let path = log_file();
    fs::read_to_string(&path).map_err(|e| format!("{}", e))
}

#[tauri::command]
pub fn cmd_get_log_stats() -> Result<LogStats, String> {
    let path = log_file();
    let size = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
    Ok(LogStats {
        path: path.to_string_lossy().to_string(),
        size,
    })
}

#[tauri::command]
pub fn cmd_clear_logs() -> Result<(), String> {
    let path = log_file();
    fs::write(&path, "").map_err(|e| format!("{}", e))
}
