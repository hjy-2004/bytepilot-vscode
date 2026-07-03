mod commands;

use commands::{fs::*, config::*, log::*, shell::*};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppConfig::new())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            // File system
            cmd_read_file,
            cmd_write_file,
            cmd_read_dir,
            cmd_stat,
            cmd_exists,
            cmd_find_files,
            cmd_create_dir,
            cmd_resolve_path,
            cmd_is_within_workspace,
            // Config
            cmd_get_config,
            cmd_set_config,
            // Shell
            cmd_execute_command,
            // Logging
            cmd_write_log,
            cmd_get_log_path,
            cmd_read_logs,
            cmd_get_log_stats,
            cmd_clear_logs,
            // Lifecycle
            cmd_get_workspace_root,
        ])
        .run(tauri::generate_context!())
        .expect("error while running BytePilot");
}
