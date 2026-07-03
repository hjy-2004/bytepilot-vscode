use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::State;
use serde::Serialize;

/// Shared workspace root state (thread-safe)
pub struct WorkspaceState {
    pub root: Mutex<PathBuf>,
}

impl WorkspaceState {
    pub fn new() -> Self {
        Self {
            root: Mutex::new(std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))),
        }
    }
}

#[derive(Serialize)]
pub struct ProjectEntry {
    name: String,
    path: String,
    is_dir: bool,
}

#[derive(Serialize)]
pub struct ProjectStructure {
    root: String,
    files: Vec<ProjectEntry>,
}

#[tauri::command]
pub fn cmd_get_workspace(state: State<WorkspaceState>) -> Result<String, String> {
    let root = state.root.lock().map_err(|e| format!("{}", e))?;
    Ok(root.to_string_lossy().to_string())
}

#[tauri::command]
pub fn cmd_set_workspace(state: State<WorkspaceState>, path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err(format!("Path does not exist: {}", path));
    }
    if !p.is_dir() {
        return Err(format!("Path is not a directory: {}", path));
    }
    let mut root = state.root.lock().map_err(|e| format!("{}", e))?;
    *root = p;
    Ok(())
}

#[tauri::command]
pub fn cmd_scan_project(state: State<WorkspaceState>) -> Result<ProjectStructure, String> {
    let root = state.root.lock().map_err(|e| format!("{}", e))?;
    let root_str = root.to_string_lossy().to_string();
    let mut entries = Vec::new();

    fn walk(dir: &PathBuf, base: &PathBuf, entries: &mut Vec<ProjectEntry>, depth: usize) {
        if depth > 4 || entries.len() >= 500 { return; }
        if let Ok(read_dir) = fs::read_dir(dir) {
            for entry in read_dir.flatten() {
                if entries.len() >= 500 { break; }
                let name = entry.file_name().to_string_lossy().to_string();
                // Skip hidden, node_modules, target, etc.
                if name.starts_with('.') || name == "node_modules" || name == "target"
                    || name == "dist" || name == ".git" || name == "__pycache__" {
                    continue;
                }
                let path = entry.path();
                let rel = path.strip_prefix(base).unwrap_or(&path).to_string_lossy().replace('\\', "/");
                let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
                entries.push(ProjectEntry { name, path: rel, is_dir });
                if is_dir && depth < 4 {
                    walk(&path, base, entries, depth + 1);
                }
            }
        }
    }

    walk(&root, &root, &mut entries, 0);
    Ok(ProjectStructure { root: root_str, files: entries })
}

#[tauri::command]
pub fn cmd_read_rules(state: State<WorkspaceState>) -> Result<Option<String>, String> {
    let root = state.root.lock().map_err(|e| format!("{}", e))?;
    let rules_path = root.join(".bytepilotrules");
    if rules_path.exists() {
        fs::read_to_string(&rules_path)
            .map(Some)
            .map_err(|e| format!("{}", e))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub fn cmd_read_file_workspace(state: State<WorkspaceState>, relative_path: String) -> Result<String, String> {
    let root = state.root.lock().map_err(|e| format!("{}", e))?;
    let full = root.join(&relative_path);
    // Security: ensure the path is within workspace
    if !full.starts_with(&*root) {
        return Err("Access denied: path outside workspace".into());
    }
    fs::read_to_string(&full).map_err(|e| format!("{}", e))
}

#[tauri::command]
pub fn cmd_write_file_workspace(state: State<WorkspaceState>, relative_path: String, content: String) -> Result<(), String> {
    let root = state.root.lock().map_err(|e| format!("{}", e))?;
    let full = root.join(&relative_path);
    if !full.starts_with(&*root) {
        return Err("Access denied: path outside workspace".into());
    }
    if let Some(parent) = full.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("{}", e))?;
    }
    fs::write(&full, &content).map_err(|e| format!("{}", e))
}

#[tauri::command]
pub fn cmd_list_dir_workspace(state: State<WorkspaceState>, relative_path: Option<String>) -> Result<Vec<(String, bool)>, String> {
    let root = state.root.lock().map_err(|e| format!("{}", e))?;
    let dir = if let Some(rel) = relative_path {
        root.join(&rel)
    } else {
        root.clone()
    };
    if !dir.starts_with(&*root) {
        return Err("Access denied: path outside workspace".into());
    }
    let entries = fs::read_dir(&dir).map_err(|e| format!("{}", e))?;
    let mut result = Vec::new();
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        if !name.starts_with('.') {
            result.push((name, is_dir));
        }
    }
    result.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0))); // dirs first
    Ok(result)
}

#[tauri::command]
pub fn cmd_search_content(
    state: State<WorkspaceState>,
    pattern: String,
    max_results: Option<usize>,
) -> Result<Vec<String>, String> {
    let root = state.root.lock().map_err(|e| format!("{}", e))?;
    let max = max_results.unwrap_or(20);
    let mut results: Vec<String> = Vec::new();

    let exts: Vec<&str> = vec![
        ".ts", ".tsx", ".js", ".jsx", ".py", ".rs", ".go", ".java",
        ".c", ".cpp", ".h", ".hpp", ".cs", ".rb", ".php", ".swift",
        ".kt", ".scala", ".vue", ".svelte", ".css", ".scss", ".less",
        ".html", ".json", ".yaml", ".yml", ".toml", ".md", ".txt",
        ".toml", ".sh", ".bat", ".ps1",
    ];

    fn walk(dir: &PathBuf, root: &PathBuf, pattern: &str, max: usize,
            results: &mut Vec<String>, exts: &[&str]) {
        if results.len() >= max { return; }
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                if results.len() >= max { break; }
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with('.') || name == "node_modules" || name == "target"
                    || name == "dist" || name == ".git" { continue; }
                let path = entry.path();
                let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
                if is_dir {
                    walk(&path, root, pattern, max, results, exts);
                } else {
                    let ext = path.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
                    if !exts.contains(&ext.as_str()) { continue; }
                    if let Ok(content) = fs::read_to_string(&path) {
                        if content.len() > 256_000 { continue; }
                        let _lower = content.to_lowercase();
                        let lower_pat = pattern.to_lowercase();
                        for (i, line) in content.lines().enumerate() {
                            if line.to_lowercase().contains(&lower_pat) {
                                let rel = path.strip_prefix(root).unwrap_or(&path).to_string_lossy().replace('\\', "/");
                                let snippet = line.trim().chars().take(200).collect::<String>();
                                results.push(format!("{}:{} | {}", rel, i + 1, snippet));
                                if results.len() >= max { break; }
                            }
                        }
                    }
                }
            }
        }
    }

    walk(&root, &root, &pattern, max, &mut results, &exts);

    if results.is_empty() {
        Ok(vec![format!("No matches found for \"{}\"", pattern)])
    } else {
        Ok(results)
    }
}

/// Open native folder picker dialog
#[tauri::command]
pub async fn cmd_pick_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    Ok(app.dialog().file().blocking_pick_folder().map(|p| p.to_string()))
}
