import fs from "fs";
import path from "path";
import os from "os";

const CREDENTIALS_DIR = path.join(os.homedir(), ".insighta");
const CREDENTIALS_FILE = path.join(CREDENTIALS_DIR, "credentials.json");

export interface Credentials {
  access_token: string;
  refresh_token: string;
  role: string;
  email: string;
  saved_at: string;
}

export function saveCredentials(creds: Credentials): void {
  if (!fs.existsSync(CREDENTIALS_DIR)) {
    fs.mkdirSync(CREDENTIALS_DIR, { recursive: true, mode: 0o700 });
  }
  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  });
}

export function loadCredentials(): Credentials | null {
  if (!fs.existsSync(CREDENTIALS_FILE)) return null;
  try {
    const raw = fs.readFileSync(CREDENTIALS_FILE, "utf-8");
    return JSON.parse(raw) as Credentials;
  } catch {
    return null;
  }
}

export function clearCredentials(): void {
  if (fs.existsSync(CREDENTIALS_FILE)) {
    fs.unlinkSync(CREDENTIALS_FILE);
  }
}

export function isTokenExpired(token: string): boolean {
  try {
    const payload = token.split(".")[1];
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf-8"),
    );
    if (!decoded.exp) return false;
    return Date.now() / 1000 >= decoded.exp - 30;
  } catch {
    return true;
  }
}
