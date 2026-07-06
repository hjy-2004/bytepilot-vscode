use keyring::Entry;

const SERVICE: &str = "com.bytepilot.app";

fn entry(key: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, key).map_err(|e| format!("keyring init failed: {}", e))
}

/// Store a secret (e.g. a provider API key) in the OS keychain.
#[tauri::command]
pub fn cmd_secret_set(key: String, value: String) -> Result<(), String> {
    entry(&key)?
        .set_password(&value)
        .map_err(|e| format!("keyring store failed: {}", e))
}

/// Read a secret from the OS keychain. Returns empty string when not found.
#[tauri::command]
pub fn cmd_secret_get(key: String) -> Result<String, String> {
    match entry(&key)?.get_password() {
        Ok(v) => Ok(v),
        Err(keyring::Error::NoEntry) => Ok(String::new()),
        Err(e) => Err(format!("keyring read failed: {}", e)),
    }
}

/// Delete a secret from the OS keychain. No-op when the entry is absent.
#[tauri::command]
pub fn cmd_secret_delete(key: String) -> Result<(), String> {
    match entry(&key)?.delete_credential() {
        Ok(_) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("keyring delete failed: {}", e)),
    }
}
