use crate::secure_storage::{get_secret, remove_secret, store_secret};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, command};

const GITHUB_CLIENT_ID: &str = "Iv1.b507a08c87ecfe98";
const DEVICE_CODE_URL: &str = "https://github.com/login/device/code";
const TOKEN_URL: &str = "https://github.com/login/oauth/access_token";
const COPILOT_TOKEN_URL: &str = "https://api.github.com/copilot_internal/v2/token";
const COPILOT_OAUTH_KEY: &str = "ai_token_copilot";

#[derive(Serialize, Deserialize, Clone)]
pub struct DeviceCodeResponse {
   device_code: String,
   user_code: String,
   verification_uri: String,
   expires_in: u64,
   interval: u64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct CopilotTokenResponse {
   token: String,
   expires_at: i64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct CopilotAuthStatus {
   is_authenticated: bool,
   user_login: Option<String>,
}

struct CopilotTokenCache {
   token: Option<String>,
   expires_at: Option<i64>,
}

pub struct CopilotState {
   cache: Mutex<CopilotTokenCache>,
}

impl CopilotState {
   pub fn new() -> Self {
      Self {
         cache: Mutex::new(CopilotTokenCache {
            token: None,
            expires_at: None,
         }),
      }
   }
}

#[command]
pub async fn copilot_start_device_flow(app: AppHandle) -> Result<DeviceCodeResponse, String> {
   let client = reqwest::Client::new();
   let response = client
      .post(DEVICE_CODE_URL)
      .header("Accept", "application/json")
      .form(&[("client_id", GITHUB_CLIENT_ID), ("scope", "copilot")])
      .send()
      .await
      .map_err(|e| format!("Failed to request device code: {e}"))?;

   let code_response: DeviceCodeResponse = response
      .json()
      .await
      .map_err(|e| format!("Failed to parse device code response: {e}"))?;

   // Store device_code temporarily for polling
   store_secret(&app, "copilot_device_code", &code_response.device_code)
      .map_err(|e| format!("Failed to store device code: {e}"))?;

   Ok(code_response)
}

#[command]
pub async fn copilot_poll_device_token(app: AppHandle) -> Result<Option<String>, String> {
   let device_code = get_secret(&app, "copilot_device_code")?;
   let device_code = device_code.ok_or("No device code found. Start the device flow first.")?;

   let client = reqwest::Client::new();
   let response = client
      .post(TOKEN_URL)
      .header("Accept", "application/json")
      .form(&[
         ("client_id", GITHUB_CLIENT_ID),
         ("device_code", &device_code),
         ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
      ])
      .send()
      .await
      .map_err(|e| format!("Failed to poll for token: {e}"))?;

   let body: serde_json::Value = response
      .json()
      .await
      .map_err(|e| format!("Failed to parse token response: {e}"))?;

   if let Some(error) = body.get("error") {
      let error_str = error.as_str().unwrap_or("unknown_error");
      match error_str {
         "authorization_pending" => Ok(None),
         "slow_down" => Ok(None),
         "expired_token" => {
            let _ = remove_secret(&app, "copilot_device_code");
            Err("Device code expired. Please start the flow again.".to_string())
         }
         _ => Err(format!(
            "Authentication failed: {}",
            body
               .get("error_description")
               .and_then(|v| v.as_str())
               .unwrap_or(error_str)
         )),
      }
   } else if let Some(access_token) = body.get("access_token").and_then(|v| v.as_str()) {
      // Store the OAuth token in keychain
      store_secret(&app, COPILOT_OAUTH_KEY, access_token)
         .map_err(|e| format!("Failed to store Copilot token: {e}"))?;

      // Clean up the device code
      let _ = remove_secret(&app, "copilot_device_code");

      Ok(Some(access_token.to_string()))
   } else {
      Err("Unexpected response from GitHub".to_string())
   }
}

#[command]
pub async fn copilot_get_auth_status(app: AppHandle) -> Result<CopilotAuthStatus, String> {
   let oauth_token = get_secret(&app, COPILOT_OAUTH_KEY)?;

   match oauth_token {
      Some(token) => {
         // Validate by trying to get a Copilot API token
         let client = reqwest::Client::new();
         let response = client
            .get(COPILOT_TOKEN_URL)
            .header("Authorization", format!("token {token}"))
            .header("Accept", "application/json")
            .header("Editor-Version", "athas/0.4.5")
            .header("Editor-Plugin-Version", "copilot/1.0.0")
            .header("Copilot-Integration-Id", "vscode-chat")
            .send()
            .await;

         match response {
            Ok(resp) if resp.status().is_success() => {
               let token_resp: serde_json::Value = resp
                  .json()
                  .await
                  .map_err(|e| format!("Failed to parse Copilot token: {e}"))?;

               let user_login = token_resp
                  .get("login")
                  .and_then(|v| v.as_str())
                  .map(|s| s.to_string());

               Ok(CopilotAuthStatus {
                  is_authenticated: true,
                  user_login,
               })
            }
            Ok(resp) if resp.status().as_u16() == 401 => {
               // Token is invalid/expired — remove it
               let _ = remove_secret(&app, COPILOT_OAUTH_KEY);
               Ok(CopilotAuthStatus {
                  is_authenticated: false,
                  user_login: None,
               })
            }
            _ => {
               // Network error or other issue — still consider authenticated
               // (the OAuth token exists, we just can't verify right now)
               Ok(CopilotAuthStatus {
                  is_authenticated: true,
                  user_login: None,
               })
            }
         }
      }
      None => Ok(CopilotAuthStatus {
         is_authenticated: false,
         user_login: None,
      }),
   }
}

#[command]
pub async fn copilot_get_api_token(app: AppHandle) -> Result<String, String> {
   // Check in-memory cache first
   let copilot_state = app.state::<CopilotState>();
   {
      let cache = copilot_state.cache.lock().map_err(|e| e.to_string())?;
      if let (Some(token), Some(expires_at)) = (&cache.token, cache.expires_at) {
         let now = chrono::Utc::now().timestamp();
         // Use 5-minute buffer before expiry
         if now < expires_at - 300 {
            return Ok(token.clone());
         }
      }
   }

   // Cache miss or expired — fetch from Copilot API
   let oauth_token = get_secret(&app, COPILOT_OAUTH_KEY)?;
   let oauth_token =
      oauth_token.ok_or("Not authenticated with GitHub Copilot. Please sign in first.")?;

   let client = reqwest::Client::new();
   let response = client
      .get(COPILOT_TOKEN_URL)
      .header("Authorization", format!("token {oauth_token}"))
      .header("Accept", "application/json")
      .header("Editor-Version", "athas/0.4.5")
      .header("Editor-Plugin-Version", "copilot/1.0.0")
      .header("Copilot-Integration-Id", "vscode-chat")
      .send()
      .await
      .map_err(|e| format!("Failed to get Copilot API token: {e}"))?;

   if response.status().as_u16() == 401 {
      // OAuth token is invalid — remove it
      let _ = remove_secret(&app, COPILOT_OAUTH_KEY);
      return Err("GitHub Copilot authentication expired. Please sign in again.".to_string());
   }

   if !response.status().is_success() {
      return Err(format!(
         "Failed to get Copilot API token: {}",
         response.status()
      ));
   }

   let token_resp: CopilotTokenResponse = response
      .json()
      .await
      .map_err(|e| format!("Failed to parse Copilot API token: {e}"))?;

   // Update in-memory cache
   {
      let mut cache = copilot_state.cache.lock().map_err(|e| e.to_string())?;
      cache.token = Some(token_resp.token.clone());
      cache.expires_at = Some(token_resp.expires_at);
   }

   Ok(token_resp.token)
}

#[command]
pub async fn copilot_logout(app: AppHandle) -> Result<(), String> {
   // Remove OAuth token from keychain
   remove_secret(&app, COPILOT_OAUTH_KEY)?;

   // Clear in-memory cache
   let copilot_state = app.state::<CopilotState>();
   let mut cache = copilot_state.cache.lock().map_err(|e| e.to_string())?;
   cache.token = None;
   cache.expires_at = None;

   Ok(())
}
