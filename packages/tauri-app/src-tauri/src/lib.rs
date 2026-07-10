mod commands;

use commands::{chat::*, config::*, fs::*, log::*, secrets::*, shell::*, workspace::*};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppConfig::new())
        .manage(WorkspaceState::new())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
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
            cmd_read_home_file,
            cmd_home_file_exists,
            cmd_read_absolute_file,
            cmd_get_temp_dir,
            cmd_write_file_base64,
            cmd_remove_file_absolute,
            // Config
            cmd_get_config,
            cmd_set_config,
            cmd_sync_provider,
            // Secrets (OS keychain)
            cmd_secret_get,
            cmd_secret_set,
            cmd_secret_delete,
            // Shell
            cmd_execute_command,
            // Logging
            cmd_write_log,
            cmd_get_log_path,
            cmd_read_logs,
            cmd_get_log_stats,
            cmd_clear_logs,
            // Workspace
            cmd_get_workspace,
            cmd_set_workspace,
            cmd_scan_project,
            cmd_read_rules,
            cmd_read_file_workspace,
            cmd_write_file_workspace,
            cmd_list_dir_workspace,
            cmd_search_content,
            cmd_pick_folder,
            cmd_pick_file,
            // Chat persistence
            cmd_save_chat,
            cmd_load_chat,
            cmd_list_sessions,
            cmd_delete_session,
            // Lifecycle
            cmd_get_workspace_root,
        ])
        .run(tauri::generate_context!())
        .expect("error while running BytePilot");
}
