import { createAPIClient } from "@tidal-music/api";
import * as auth from "@tidal-music/auth";
import { trueTime } from "@tidal-music/true-time";
import fs from "fs";
import path from "path";
import { expandHome } from "../../lib/paths";
import type { ApiClient, Credentials } from "./types";

// Suppress noisy "TrueTime is not yet synchronized" from SDK internals
const _origWarn = console.warn;
console.warn = (...args: unknown[]) => {
  if (typeof args[0] === "string" && args[0].includes("TrueTime")) return;
  _origWarn.apply(console, args);
};

// --- Singleton State ---

let apiClient: ApiClient | null = null;
let userId: string | null = null;
let initialized = false;

const CREDENTIALS_STORAGE_KEY = "curator-tidal-auth";

// --- Public API ---

export function loadCredentials(): Credentials {
  const configPath = expandHome(
    path.join(process.env.HOME ?? "", ".config", "curator", "credentials.json")
  );
  if (!fs.existsSync(configPath)) {
    throw new Error(`Missing credentials file: ${configPath}`);
  }
  return JSON.parse(fs.readFileSync(configPath, "utf-8")) as Credentials;
}

export async function initTidalClient(): Promise<void> {
  if (apiClient) return;

  const { clientId, clientSecret } = loadCredentials();

  if (!initialized) {
    await trueTime.synchronize();
    await auth.init({
      clientId,
      clientSecret,
      credentialsStorageKey: CREDENTIALS_STORAGE_KEY,
      scopes: [
        "user.read",
        "collection.read",
        "playlists.read",
        "playlists.write",
        "recommendations.read",
      ],
    });
    initialized = true;
  }

  // Verify user session (not just client credentials)
  const creds = await auth.credentialsProvider.getCredentials();
  if (!creds || !("token" in creds) || !creds.token) {
    throw new Error("Not logged in. Run: curator auth login");
  }
  if (!("userId" in creds) || !creds.userId) {
    throw new Error("No user session. Run: curator auth login");
  }

  userId = String(creds.userId);
  apiClient = createAPIClient(auth.credentialsProvider);
}

export function getClient(): ApiClient {
  if (!apiClient) {
    throw new Error(
      "Tidal client not initialized. Call initTidalClient() first."
    );
  }
  return apiClient;
}

export function getUserId(): string {
  if (!userId) {
    throw new Error("No user session. Call initTidalClient() first.");
  }
  return userId;
}
