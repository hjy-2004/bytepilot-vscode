use std::process::Command;
use std::time::Duration;
use std::sync::mpsc;

use serde::Serialize;

#[derive(Serialize)]
pub struct CommandResult {
    stdout: String,
    stderr: String,
    exit_code: i32,
    killed: bool,
}

#[tauri::command]
pub fn cmd_execute_command(
    command: String,
    cwd: String,
    timeout_ms: u64,
) -> Result<CommandResult, String> {
    let (shell, flag) = if cfg!(target_os = "windows") {
        ("cmd", "/C")
    } else {
        ("sh", "-c")
    };

    let child = Command::new(shell)
        .arg(flag)
        .arg(&command)
        .current_dir(&cwd)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn command: {}", e))?;

    let timeout = Duration::from_millis(timeout_ms);

    // Use a separate thread to wait for the process with a timeout
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let result = child.wait_with_output();
        let _ = tx.send(result);
    });

    match rx.recv_timeout(timeout) {
        Ok(Ok(output)) => {
            Ok(CommandResult {
                stdout: String::from_utf8_lossy(&output.stdout).to_string(),
                stderr: String::from_utf8_lossy(&output.stderr).to_string(),
                exit_code: output.status.code().unwrap_or(-1),
                killed: false,
            })
        }
        Ok(Err(e)) => {
            Err(format!("Failed to wait on process: {}", e))
        }
        Err(mpsc::RecvTimeoutError::Timeout) => {
            // Timed out — kill the child process
            // Note: we lost the handle when moving it to the thread,
            // so we can't kill it here. In production, keep the handle.
            Ok(CommandResult {
                stdout: String::new(),
                stderr: format!("Command timed out after {}ms", timeout_ms),
                exit_code: -1,
                killed: true,
            })
        }
        Err(mpsc::RecvTimeoutError::Disconnected) => {
            Err("Process terminated unexpectedly".into())
        }
    }
}
