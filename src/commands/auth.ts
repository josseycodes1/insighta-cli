// src/commands/auth.ts
import http from "http";
import crypto from "crypto";
import { Command } from "commander";
import ora from "ora";
import chalk from "chalk";
import open from "open";
import {
  saveCredentials,
  loadCredentials,
  clearCredentials,
} from "../utils/credentials.js";
import { API_BASE } from "../utils/apiClient.js";
import {
  printSuccess,
  printError,
  printInfo,
  printAuthTable,
} from "../utils/display.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const CALLBACK_PORT = 9876;
const CALLBACK_PATH = "/callback";
const CALLBACK_URL = `http://localhost:${CALLBACK_PORT}/callback`;

// The CLI's own GitHub OAuth App (separate from the web app)
const GITHUB_CLI_CLIENT_ID = "Ov23libepnEZjtjAHTZO";

// ── PKCE helpers ──────────────────────────────────────────────────────────────

function generateState(): string {
  return crypto.randomBytes(16).toString("hex");
}

function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

// ── Browser callback page HTML ────────────────────────────────────────────────

function htmlPage(title: string, message: string, success: boolean): string {
  const color = success ? "#00FF88" : "#f85149";
  const icon = success ? "✅" : "❌";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', monospace;
      background: #080A0F; color: #c9d1d9;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh;
    }
    .card {
      background: #161b22;
      border: 1px solid ${color};
      border-radius: 12px;
      padding: 40px 48px;
      text-align: center;
      max-width: 420px;
    }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 22px; font-weight: 700; margin-bottom: 8px;
         color: ${color}; letter-spacing: 0.05em; }
    p { color: #8b949e; font-size: 14px; line-height: 1.6; }
    .brand { font-size: 11px; color: #484f58; margin-top: 24px;
             letter-spacing: 0.3em; text-transform: uppercase; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <p class="brand">Insighta<span style="color:#00FF88">+</span> Labs</p>
  </div>
</body>
</html>`;
}

// ── Local callback server ─────────────────────────────────────────────────────
// Waits for GitHub to redirect back with `code` + `state`, then POSTs
// the code to the backend's GitHubCLIExchangeView which handles
// the GitHub token exchange, user creation, and JWT generation.

function startCallbackServer(
  expectedState: string,
  codeVerifier: string,
  codeChallenge: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => {
        server.close();
        reject(new Error("Authentication timed out (2 minutes). Try again."));
      },
      2 * 60 * 1000,
    );

    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url || "/", `http://localhost:${CALLBACK_PORT}`);

      // Ignore favicon / other browser requests
      if (url.pathname !== CALLBACK_PATH) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");

      const send = (
        statusCode: number,
        title: string,
        msg: string,
        ok: boolean,
      ) => {
        res.writeHead(statusCode, { "Content-Type": "text/html" });
        res.end(htmlPage(title, msg, ok));
        clearTimeout(timeout);
        server.close();
      };

      // ── Error from GitHub ──
      if (error) {
        send(
          200,
          "Authentication Failed",
          `GitHub returned: ${error}. Close this tab and try again.`,
          false,
        );
        reject(new Error(`GitHub OAuth error: ${error}`));
        return;
      }

      // ── Missing params ──
      if (!code || !state) {
        send(
          400,
          "Bad Request",
          "Missing code or state. Close this tab.",
          false,
        );
        reject(new Error("Missing code or state in OAuth callback"));
        return;
      }

      // ── CSRF / state check ──
      if (state !== expectedState) {
        send(
          400,
          "Security Error",
          "State mismatch. Possible CSRF attack. Close this tab.",
          false,
        );
        reject(new Error("State mismatch — possible CSRF attack"));
        return;
      }

      // ── POST code to backend GitHubCLIExchangeView ──
      try {
        const backendRes = await fetch(`${API_BASE}/api/v1/auth/github/cli/`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            code,
            redirect_uri: CALLBACK_URL,
            code_verifier: codeVerifier,
            code_challenge: codeChallenge,
          }),
        });

        const data = (await backendRes.json()) as Record<string, unknown>;

        if (!backendRes.ok) {
          const errMsg =
            (data.error as string) ||
            (data.detail as string) ||
            `HTTP ${backendRes.status}`;
          throw new Error(errMsg);
        }

        const access = data.access as string;
        const refresh = data.refresh as string;
        const role = (data.role as string) || "analyst";
        const email = (data.email as string) || "";

        if (!access || !refresh) {
          throw new Error("Backend returned no tokens");
        }

        // Persist credentials
        saveCredentials({
          access_token: access,
          refresh_token: refresh,
          role,
          email,
          saved_at: new Date().toISOString(),
        });

        send(
          200,
          "Login Successful!",
          "You are now logged in to Insighta Labs+. Return to your terminal.",
          true,
        );
        resolve();
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : "Unknown backend error";
        send(
          200,
          "Authentication Failed",
          `${msg}. Close this tab and try again.`,
          false,
        );
        reject(err);
      }
    });

    server.listen(CALLBACK_PORT, "127.0.0.1", () => {});

    server.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timeout);
      if (err.code === "EADDRINUSE") {
        reject(
          new Error(
            `Port ${CALLBACK_PORT} is already in use. Free it and try again.`,
          ),
        );
      } else {
        reject(err);
      }
    });
  });
}

// ── login (GitHub OAuth) ──────────────────────────────────────────────────────

export async function loginGitHubCommand(): Promise<void> {
  const existing = loadCredentials();
  if (existing) {
    printInfo(
      `Already logged in as ${chalk.bold(existing.email)}. ` +
        `Run ${chalk.cyan("insighta logout")} first to switch accounts.`,
    );
    return;
  }

  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  // codeChallenge is generated and sent to the backend for server-side PKCE
  // verification. It is NOT sent to GitHub — standard GitHub OAuth Apps do
  // not support code_verifier in the token exchange (only GitHub Apps do).
  // Sending code_challenge to GitHub causes invalid_grant on token exchange.
  const codeChallenge = generateCodeChallenge(codeVerifier);

  // Build GitHub OAuth URL — NO code_challenge or code_challenge_method
  const githubAuthUrl = new URL("https://github.com/login/oauth/authorize");
  githubAuthUrl.searchParams.set("client_id", GITHUB_CLI_CLIENT_ID);
  githubAuthUrl.searchParams.set("redirect_uri", CALLBACK_URL);
  githubAuthUrl.searchParams.set("scope", "user:email");
  githubAuthUrl.searchParams.set("state", state);
  // ✅ PKCE enforced server-side by Django — not advertised to GitHub

  console.log(
    chalk.cyan("\n  Opening GitHub in your browser to authenticate…\n"),
  );
  console.log(
    chalk.dim(
      `  If the browser doesn't open, visit:\n  ${chalk.white(githubAuthUrl.toString())}\n`,
    ),
  );

  const waitSpinner = ora("Waiting for GitHub callback…").start();

  try {
    // Open the GitHub OAuth consent page
    await open(githubAuthUrl.toString());

    // Pass codeVerifier to the local server so it can forward it to Django
    // for server-side PKCE verification
    await startCallbackServer(state, codeVerifier, codeChallenge);

    waitSpinner.succeed("GitHub authentication complete");

    const creds = loadCredentials();
    if (creds) {
      printSuccess(
        `Logged in as ${chalk.bold.green(creds.email)} ${chalk.dim(`(${creds.role})`)}`,
      );
      printAuthTable(creds.email, creds.role);
    }
  } catch (err: unknown) {
    waitSpinner.fail("Authentication failed");
    printError(err instanceof Error ? err.message : "Unknown error");
    process.exitCode = 1;
  }
}

// ── login-email (password fallback) ──────────────────────────────────────────

export async function loginEmailCommand(
  email: string,
  password: string,
): Promise<void> {
  const existing = loadCredentials();
  if (existing) {
    printInfo(
      `Already logged in as ${chalk.bold(existing.email)}. ` +
        `Run ${chalk.cyan("insighta logout")} first.`,
    );
    return;
  }

  const spinner = ora("Authenticating…").start();

  try {
    // simplejwt token endpoint — returns access + refresh tokens directly
    const tokenRes = await fetch(`${API_BASE}/api/v1/auth/token/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const tokenData = (await tokenRes.json()) as Record<string, unknown>;

    if (!tokenRes.ok) {
      const msg =
        (tokenData.detail as string) ||
        (tokenData.non_field_errors as string[])?.join(", ") ||
        "Invalid credentials";
      throw new Error(msg);
    }

    const access = tokenData.access as string;
    const refresh = tokenData.refresh as string;

    // Decode role + email from JWT payload
    let role = "analyst";
    let decodedEmail = email;
    try {
      const payload = JSON.parse(
        Buffer.from(access.split(".")[1], "base64url").toString(),
      ) as Record<string, unknown>;
      role = (payload.role as string) || "analyst";
      decodedEmail = (payload.email as string) || email;
    } catch {}

    saveCredentials({
      access_token: access,
      refresh_token: refresh,
      role,
      email: decodedEmail,
      saved_at: new Date().toISOString(),
    });

    spinner.succeed("Login successful");
    printSuccess(
      `Logged in as ${chalk.bold.green(decodedEmail)} ${chalk.dim(`(${role})`)}`,
    );
    printAuthTable(decodedEmail, role);
  } catch (err: unknown) {
    spinner.fail("Login failed");
    printError(err instanceof Error ? err.message : "Unknown error");
    process.exitCode = 1;
  }
}

// ── logout ────────────────────────────────────────────────────────────────────

export async function logoutCommand(): Promise<void> {
  const creds = loadCredentials();
  if (!creds) {
    printInfo("You are not logged in.");
    return;
  }

  const spinner = ora("Logging out…").start();

  // Best-effort server-side session cleanup
  try {
    await fetch(`${API_BASE}/auth/logout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${creds.access_token}`,
      },
      body: JSON.stringify({ refresh_token: creds.refresh_token }),
    });
  } catch {
    // Unreachable backend — still clear local creds
  }

  clearCredentials();
  spinner.succeed(
    `Logged out. Credentials cleared from ${chalk.dim("~/.insighta/credentials.json")}`,
  );
}

// ── whoami ────────────────────────────────────────────────────────────────────

export async function whoamiCommand(): Promise<void> {
  const creds = loadCredentials();
  if (!creds) {
    printError("Not authenticated. Run `insighta login` first.");
    process.exitCode = 1;
    return;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(creds.access_token.split(".")[1], "base64url").toString(),
    ) as Record<string, unknown>;

    const exp = payload.exp as number | undefined;
    const expiresAt = exp ? new Date(exp * 1000).toLocaleString() : "unknown";
    const isExpired = exp ? Date.now() >= exp * 1000 : true;

    // @ts-ignore
    const Table = (await import("cli-table3")).default;
    const table = new Table({
      style: { border: ["grey"] },
      colWidths: [20, 44],
    });

    table.push(
      [chalk.cyan("Email"), chalk.bold(creds.email)],
      [
        chalk.cyan("Role"),
        creds.role === "admin"
          ? chalk.red.bold("admin")
          : chalk.blue("analyst"),
      ],
      [
        chalk.cyan("Token"),
        isExpired ? chalk.red("expired") : chalk.green("valid"),
      ],
      [chalk.cyan("Expires"), chalk.dim(expiresAt)],
      [
        chalk.cyan("Saved At"),
        chalk.dim(new Date(creds.saved_at).toLocaleString()),
      ],
    );

    console.log();
    console.log(table.toString());
    console.log();
  } catch {
    // Fallback if JWT decode fails
    printAuthTable(creds.email, creds.role);
  }
}

// ── refresh ───────────────────────────────────────────────────────────────────

export async function refreshCommand(): Promise<void> {
  const creds = loadCredentials();
  if (!creds) {
    printError("Not authenticated. Run `insighta login` first.");
    process.exitCode = 1;
    return;
  }

  const spinner = ora("Refreshing access token…").start();

  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: creds.refresh_token }),
    });

    const data = (await res.json()) as Record<string, unknown>;

    if (!res.ok) {
      clearCredentials();
      throw new Error(
        (data.detail as string) ||
          "Refresh token expired. Please log in again.",
      );
    }

    saveCredentials({
      ...creds,
      access_token: (data.access_token || data.access) as string,
      refresh_token: (data.refresh_token || data.refresh || creds.refresh_token) as string,
      saved_at: new Date().toISOString(),
    });

    spinner.succeed("Access token refreshed");
    printSuccess("New token saved to ~/.insighta/credentials.json");
  } catch (err: unknown) {
    spinner.fail("Token refresh failed");
    printError(err instanceof Error ? err.message : "Unknown error");
    process.exitCode = 1;
  }
}

// ── Register all auth commands ────────────────────────────────────────────────

export function registerAuthCommands(program: Command): void {
  program
    .command("login")
    .description("Authenticate via GitHub OAuth (opens browser)")
    .action(loginGitHubCommand);

  program
    .command("login-email")
    .description("Authenticate with email and password")
    .requiredOption("-e, --email <email>", "Your email address")
    .requiredOption("-p, --password <password>", "Your password")
    .action((opts) => loginEmailCommand(opts.email, opts.password));

  program
    .command("logout")
    .description("Clear local credentials and end session")
    .action(logoutCommand);

  program
    .command("whoami")
    .description("Show currently authenticated user")
    .action(whoamiCommand);

  program
    .command("refresh")
    .description("Manually refresh your access token")
    .action(refreshCommand);
}
