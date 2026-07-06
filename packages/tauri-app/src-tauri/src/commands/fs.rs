use std::path::{Path, PathBuf};
use tauri::AppHandle;

/// Resolve the workspace root. For desktop app, this is the directory where the
/// app was launched, or a user-configured project directory.
fn get_workspace_root(_app: &AppHandle) -> PathBuf {
    // Default to the current working directory (where the user launched the app)
    // In the future, this could be set from a config file or CLI arg.
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

/// Verify that an absolute path is within the workspace root.
/// Returns Ok(canonicalized absolute path) or Err with a message.
fn check_within_workspace(app: &AppHandle, path: &str, label: &str) -> Result<PathBuf, String> {
    let root = get_workspace_root(app);
    let root_canon = root.canonicalize().unwrap_or_else(|_| root.clone());
    let target = Path::new(path);
    // Resolve the target path (including canonicalization to catch .. traversal)
    let target_canon = target.canonicalize().map_err(|e| {
        format!("Cannot access {}: {}", label, e)
    })?;
    if !target_canon.starts_with(&root_canon) {
        return Err(format!(
            "Access denied: {} is outside workspace",
            label
        ));
    }
    Ok(target_canon)
}

#[tauri::command]
pub fn cmd_get_workspace_root(app: tauri::AppHandle) -> Result<String, String> {
    Ok(get_workspace_root(&app).to_string_lossy().to_string())
}

#[tauri::command]
pub fn cmd_read_file(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let safe = check_within_workspace(&app, &path, "read_file")?;
    std::fs::read_to_string(&safe).map_err(|e| format!("{}", e))
}

#[tauri::command]
pub fn cmd_write_file(app: tauri::AppHandle, path: String, content: String) -> Result<(), String> {
    let safe = check_within_workspace(&app, &path, "write_file")?;
    if let Some(parent) = safe.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("{}", e))?;
    }
    std::fs::write(&safe, content).map_err(|e| format!("{}", e))
}

#[tauri::command]
pub fn cmd_create_dir(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let safe = check_within_workspace(&app, &path, "create_dir")?;
    std::fs::create_dir_all(&safe).map_err(|e| format!("{}", e))
}

#[tauri::command]
pub fn cmd_read_dir(app: tauri::AppHandle, path: String) -> Result<Vec<(String, bool)>, String> {
    let safe = check_within_workspace(&app, &path, "read_dir")?;
    let entries = std::fs::read_dir(&safe).map_err(|e| format!("{}", e))?;
    let mut result = Vec::new();
    for entry in entries {
        if let Ok(entry) = entry {
            let name = entry.file_name().to_string_lossy().to_string();
            let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
            result.push((name, is_dir));
        }
    }
    Ok(result)
}

#[derive(serde::Serialize)]
pub struct FileStat {
    size: u64,
    is_directory: bool,
    is_file: bool,
}

#[tauri::command]
pub fn cmd_stat(app: tauri::AppHandle, path: String) -> Result<FileStat, String> {
    let safe = check_within_workspace(&app, &path, "stat")?;
    let meta = std::fs::metadata(&safe).map_err(|e| format!("{}", e))?;
    Ok(FileStat {
        size: meta.len(),
        is_directory: meta.is_dir(),
        is_file: meta.is_file(),
    })
}

#[tauri::command]
pub fn cmd_exists(app: tauri::AppHandle, path: String) -> Result<bool, String> {
    let safe = check_within_workspace(&app, &path, "exists")?;
    Ok(safe.exists())
}

#[tauri::command]
pub fn cmd_find_files(
    app: tauri::AppHandle,
    base_path: String,
    include: String,
    exclude: String,
    max_results: usize,
) -> Result<Vec<String>, String> {
    let mut results = Vec::new();
    let exclude_patterns: Vec<String> = exclude
        .trim_matches(|c| c == '{' || c == '}')
        .split(',')
        .map(|s| s.trim().to_string())
        .collect();

    // Validate base_path is within workspace, or use workspace root if empty
    let base = if base_path.is_empty() {
        get_workspace_root(&app)
    } else {
        check_within_workspace(&app, &base_path, "find_files base_path")?
    };
    let pattern = include.trim_start_matches("**/").to_string();

    fn walk(
        dir: &Path,
        base: &Path,
        pattern: &str,
        exclude_patterns: &[String],
        max: usize,
        results: &mut Vec<String>,
    ) {
        if results.len() >= max {
            return;
        }
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                if results.len() >= max {
                    break;
                }
                let name = entry.file_name().to_string_lossy().to_string();
                // Skip excluded directories
                if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                    let skip = exclude_patterns.iter().any(|p| {
                        name == *p || p.starts_with("**/") && name.contains(&p[3..])
                    });
                    if !skip {
                        walk(&entry.path(), base, pattern, exclude_patterns, max, results);
                    }
                } else {
                    let full_path = entry.path();
                    let rel = full_path.strip_prefix(base).unwrap_or(&full_path);
                    let rel_str = rel.to_string_lossy().replace('\\', "/");
                    // Simple wildcard matching: * matches anything, ** matches across dirs
                    if pattern == "**/*" || rel_str.contains(pattern.trim_start_matches("**/").trim_end_matches('*')) {
                        results.push(rel_str);
                    }
                }
            }
        }
    }

    walk(&base, &base, &pattern, &exclude_patterns, max_results, &mut results);
    Ok(results)
}

#[tauri::command]
pub fn cmd_resolve_path(app: tauri::AppHandle, relative: String) -> String {
    let root = get_workspace_root(&app);
    root.join(&relative).to_string_lossy().to_string()
}

#[tauri::command]
pub fn cmd_is_within_workspace(app: tauri::AppHandle, absolute: String) -> bool {
    check_within_workspace(&app, &absolute, "path").is_ok()
}
