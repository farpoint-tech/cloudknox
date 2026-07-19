// Prevents an extra console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::Command;

/// Run a PowerShell script on the local machine and return its stdout.
///
/// Used only for the Exchange Online / Security & Compliance domains, whose
/// configuration has no CORS-enabled REST API. The scripts run READ cmdlets
/// (Get-AntiPhishPolicy, Get-DlpCompliancePolicy) and the ExchangeOnline /
/// IPPSSession modules perform their own interactive sign-in. Nothing is
/// written; tenant data stays on the local machine.
#[tauri::command]
async fn run_powershell(script: String) -> Result<String, String> {
    // Prefer PowerShell 7 (pwsh); fall back to Windows PowerShell.
    let candidates = if cfg!(windows) {
        vec!["pwsh", "powershell"]
    } else {
        vec!["pwsh"]
    };

    let mut last_err = String::from("no PowerShell executable found");
    for shell in candidates {
        match Command::new(shell)
            .args(["-NoProfile", "-Command", &script])
            .output()
        {
            Ok(output) => {
                if output.status.success() {
                    return Ok(String::from_utf8_lossy(&output.stdout).to_string());
                }
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                return Err(if stderr.is_empty() {
                    format!("{shell} exited with status {}", output.status)
                } else {
                    stderr
                });
            }
            Err(e) => {
                last_err = format!("failed to launch {shell}: {e}");
                continue;
            }
        }
    }
    Err(last_err)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![run_powershell])
        .run(tauri::generate_context!())
        .expect("error while running the M365 Assessment desktop app");
}
