use std::process::Command;
use std::time::Duration;
use std::sync::{mpsc, Arc, Mutex};

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

    let mut child = Command::new(shell)
        .arg(flag)
        .arg(&command)
        .current_dir(&cwd)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn command: {}", e))?;

    let timeout = Duration::from_millis(timeout_ms);

    // Save the PID so we can kill the process on timeout even after the thread
    // takes ownership of the Child handle via take().
    let pid = child.id();

    // Keep the child handle in Option so the spawned thread can take() ownership
    // and release the mutex before blocking on wait_with_output().
    let child_handle = Arc::new(Mutex::new(Some(child)));
    let child_for_thread = Arc::clone(&child_handle);

    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        // Take ownership of the child from the mutex, then release the lock
        let owned_child = child_for_thread.lock().unwrap().take();
        if let Some(mut c) = owned_child {
            let result = c.wait_with_output();
            let _ = tx.send(result);
        }
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
            // Timed out — kill by PID since the Child handle was taken by the thread
            kill_by_pid(pid);
            Ok(CommandResult {
                stdout: String::new(),
                stderr: format!("Command timed out after {}ms and was killed", timeout_ms),
                exit_code: -1,
                killed: true,
            })
        }
        Err(mpsc::RecvTimeoutError::Disconnected) => {
            // Thread panicked — try to clean up
            kill_by_pid(pid);
            Err("Command process terminated unexpectedly".into())
        }
    }
}

/// Kill a process by its PID. Cross-platform: uses taskkill on Windows, SIGKILL on Unix.
fn kill_by_pid(pid: Option<u32>) {
    let Some(pid) = pid else { return };
    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("taskkill")
            .args(["/F", "/PID", &pid.to_string()])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn();
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = Command::new("kill")
            .args(["-9", &pid.to_string()])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn();
    }
}
