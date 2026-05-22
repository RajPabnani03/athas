use serde::Serialize;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MobilePairingSession {
   pairing_code: String,
   expires_at: String,
   deeplink_url: String,
}

#[tauri::command]
pub async fn mobile_link_create_pairing_session() -> Result<MobilePairingSession, String> {
   let now = SystemTime::now();
   let now_secs = now
      .duration_since(UNIX_EPOCH)
      .map_err(|e| format!("Failed to create pairing session: {e}"))?
      .as_secs();

   let expires_at = now
      .checked_add(Duration::from_secs(300))
      .ok_or_else(|| "Failed to calculate pairing session expiration".to_string())?
      .duration_since(UNIX_EPOCH)
      .map_err(|e| format!("Failed to create pairing session: {e}"))?
      .as_secs();

   let pairing_code = format!("{:06}", now_secs % 1_000_000);

   Ok(MobilePairingSession {
      pairing_code: pairing_code.clone(),
      expires_at: expires_at.to_string(),
      deeplink_url: format!("athas://mobile-link?code={pairing_code}"),
   })
}
