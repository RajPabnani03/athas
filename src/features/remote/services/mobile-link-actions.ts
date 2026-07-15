import { invoke } from "@tauri-apps/api/core";

export interface MobilePairingSession {
  pairingCode: string;
  expiresAt: string;
  deeplinkUrl: string;
}

export async function createMobilePairingSession(): Promise<MobilePairingSession> {
  return invoke<MobilePairingSession>("mobile_link_create_pairing_session");
}
