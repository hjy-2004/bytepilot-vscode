use std::process::Command;
use std::time::Duration;
use std::sync::{mpsc, Arc, Mutex};

use serde::Serialize;

/// Best-effort blocklist of destructive command patterns, mirroring the VS Code
/// extension's guard. This is defense-in-depth on top of the approval gate — it
/// does NOT replace user review of command output.
fn is_dangerous_command(command: &str) -> bool {
    let c = command.to_lowercase();
    // Recursive deletion from root / system dirs
    let patterns: &[&str] = &[
        "rm -rf /", "rm -fr /", "rm -rf /etc", "rm -rf /home", "rm -rf ~",
        "rmdir /", "deltree", ":(){ :|:& };:", ":|:&",
        "mkfs", "dd if=", "> /dev/sd", "of=/dev/",
        "git reset --hard", "git clean -fd",
        "shutdown", "reboot", "halt", "poweroff",
        "chmod -r 777 /", "chmod 777 /",
    ];
    for p in patterns {
        if c.contains(p) {
            return true;
        }
    }
    // curl/wget piped to a shell
    if (c.contains("curl ") || c.contains("wget ")) && (c.contains("| sh") || c.contains("|sh") || c.contains("| bash") || c.contains("|bash")) {
        return true;
    }
    // Force push to protected branches
    if c.contains("git push") && (c.contains("--force") || c.contains("-f "))
        && (c.contains("main") || c.contains("master") || c.contains("release") || c.contains("prod")) {
        return true;
    }
    // Windows disk format: format C: /q
    if c.contains("format ") && c.contains(":") && c.contains("/q") {
        return true;
    }
    false
}

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
    if is_dangerous_command(&command) {
        return Ok(CommandResult {
            stdout: String::new(),
            stderr: "Blocked: dangerous command pattern detected.".into(),
            exit_code: -1,
            killed: false,
        });
    }
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
        if let Some(c) = owned_child {
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
            kill_by_pid(Some(pid));
            Ok(CommandResult {
                stdout: String::new(),
                stderr: format!("Command timed out after {}ms and was killed", timeout_ms),
                exit_code: -1,
                killed: true,
            })
        }
        Err(mpsc::RecvTimeoutError::Disconnected) => {
            // Thread panicked — try to clean up
            kill_by_pid(Some(pid));
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
