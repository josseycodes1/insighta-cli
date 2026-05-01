import {
  loadCredentials,
  saveCredentials,
  clearCredentials,
  isTokenExpired,
} from "./credentials.js";

export const API_BASE = process.env.INSIGHTA_API_URL || "http://localhost:8000";

async function refreshAccessToken(): Promise<string | null> {
  const creds = loadCredentials();
  if (!creds?.refresh_token) return null;

  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: creds.refresh_token }),
    });

    if (!res.ok) {
      clearCredentials();
      return null;
    }

    const data = (await res.json()) as {
      access?: string;
      access_token?: string;
      refresh?: string;
      refresh_token?: string;
    };
    const access = data.access_token || data.access;
    const refresh = data.refresh_token || data.refresh || creds.refresh_token;
    if (!access) return null;
    saveCredentials({
      ...creds,
      access_token: access,
      refresh_token: refresh,
      saved_at: new Date().toISOString(),
    });
    return access;
  } catch {
    return null;
  }
}

export interface RequestOptions {
  body?: Record<string, unknown>;
  query?: Record<string, string | number | undefined>;
  requiresAuth?: boolean;
  responseType?: "json" | "text";
}

export interface ApiResponse<T> {
  data: T;
  raw: Record<string, unknown>;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiRequest<T>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  endpoint: string,
  options: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const { body, query, requiresAuth = true, responseType = "json" } = options;

  const url = new URL(`${API_BASE}${endpoint}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") {
        url.searchParams.set(k, String(v));
      }
    }
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-API-Version": "1",
  };

  if (requiresAuth) {
    let creds = loadCredentials();

    if (!creds) {
      throw new ApiError(401, "Not authenticated. Run `insighta login` first.");
    }

    if (isTokenExpired(creds.access_token)) {
      const newToken = await refreshAccessToken();
      if (!newToken) {
        throw new ApiError(
          401,
          "Session expired. Please run `insighta login` again.",
        );
      }
      creds = loadCredentials()!;
    }

    headers["Authorization"] = `Bearer ${creds.access_token}`;
  }

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (responseType === "text") {
    if (!res.ok) {
      const text = await res.text();
      throw new ApiError(res.status, text || `HTTP ${res.status}`);
    }
    const text = await res.text();
    return { data: text as unknown as T, raw: {} };
  }

  let json: Record<string, unknown>;
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    throw new ApiError(
      res.status,
      `Server returned non-JSON (HTTP ${res.status})`,
    );
  }

  if (!res.ok) {
    const msg =
      (json.detail as string) ||
      (json.error as string) ||
      (json.message as string) ||
      (json.non_field_errors as string[])?.join(", ") ||
      `HTTP ${res.status}`;
    throw new ApiError(res.status, msg);
  }

  const payload = (json.data ?? json) as T;
  return { data: payload, raw: json };
}
