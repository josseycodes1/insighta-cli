# Insighta Labs+ CLI

A globally installable CLI for the **Insighta Labs+ Profile Intelligence System**. Authenticate with email/password or GitHub OAuth, then query and manage profiles from your terminal.

---

## Installation

```bash
# Clone the repo
git clone <your-cli-repo-url>
cd insighta-cli

# Install dependencies
npm install

# Build
npm run build

# Link globally (makes `insighta` available anywhere)
npm link
```

---

## Configuration

By default the CLI talks to `http://localhost:8000`.

Override with an environment variable:

```bash
export INSIGHTA_API_URL=https://your-backend.onrender.com
```

Or pass it inline for a single command:

```bash
INSIGHTA_API_URL=https://your-backend.onrender.com insighta profiles list
```

Credentials are stored at `~/.insighta/credentials.json` with permissions `0600` (owner read/write only).

---

## Authentication

### Email + Password

```bash
insighta login-email -e analyst@company.com -p yourpassword
```

### GitHub OAuth (PKCE)

```bash
insighta login
```

Opens your browser to GitHub. After authorizing, the local callback server (port `9876`) captures the redirect, exchanges the code + PKCE verifier with the backend, and saves tokens automatically.

### Other auth commands

```bash
insighta whoami       # Show current user + token expiry
insighta refresh      # Manually refresh the access token
insighta logout       # Clear credentials from disk
```

---

## Profiles

### List profiles

```bash
insighta profiles list
insighta profiles list --gender male --page 2 --limit 20
```

### Get a profile

```bash
insighta profiles get <id>
```

### Search (natural language)

```bash
insighta profiles search "young females from nigeria"
insighta profiles search "adults" --page 1 --limit 5
```

### Create a profile

```bash
insighta profiles create --name "Adeola Okafor"
```

Fetches demographic data from external APIs automatically.

### Delete a profile *(admin only)*

```bash
insighta profiles delete <id>
```

### Export to CSV *(admin only)*

```bash
insighta profiles export
insighta profiles export --gender female --output ladies.csv
```

---

## Token Handling

- **Access token** lifetime: 15 minutes (configured in backend `SIMPLE_JWT`)
- **Refresh token** lifetime: 7 days
- The API client automatically detects token expiry (with a 30-second buffer) before each request and silently calls `/api/v1/auth/token/refresh/`
- If the refresh token is also expired, credentials are cleared and the user is prompted to log in again

---

## Role Enforcement

| Command | Required Role |
|---|---|
| `profiles list` | analyst or admin |
| `profiles get` | authenticated |
| `profiles search` | analyst or admin |
| `profiles create` | analyst or admin |
| `profiles delete` | admin only |
| `profiles export` | admin only |

The CLI enforces role checks locally for `delete` and `export` before hitting the network. The backend enforces them independently on every request.

---

## Architecture

```
insighta-cli/
├── src/
│   ├── index.ts              # Entry point, Commander setup
│   ├── commands/
│   │   ├── auth.ts           # login, login-email, logout, whoami, refresh
│   │   ├── profiles.ts       # list, get, search, create, delete, export
│   │   └── config.ts         # config show
│   └── utils/
│       ├── apiClient.ts      # fetch wrapper, auto token refresh, error parsing
│       ├── credentials.ts    # ~/.insighta/credentials.json read/write
│       └── display.ts        # chalk tables, profile formatting
├── dist/                     # Compiled output
├── package.json
└── tsconfig.json
```

### GitHub OAuth Flow (PKCE)

```
insighta login
    │
    ├─► Generate state + code_verifier + code_challenge (SHA-256)
    ├─► Start local HTTP server on port 9876
    ├─► Open browser → /accounts/github/login/?state=...&code_challenge=...
    │
    │   [User authorises on GitHub]
    │
    ├─► GitHub redirects → localhost:9876/callback?code=...&state=...
    ├─► Validate state (CSRF check)
    ├─► Forward code + code_verifier to Django backend /github/callback/
    ├─► Backend generates JWT, redirects to frontend URL with tokens
    ├─► CLI intercepts redirect (302), parses tokens from Location header
    └─► Saves to ~/.insighta/credentials.json (mode 0600)
```

### Email Login Flow

```
insighta login-email -e x@y.com -p pass
    │
    ├─► POST /api/v1/auth/login/    (sets HTTP-only cookie, returns role)
    ├─► POST /api/v1/auth/token/    (gets Bearer access + refresh tokens)
    └─► Saves to ~/.insighta/credentials.json
```

---

## Natural Language Parsing

The `profiles search` command sends the raw query string to the backend's `/api/v1/profiles/search/?q=` endpoint. The backend `NaturalLanguageParser` extracts filters like gender, age range, and country from the query and applies them to the `Profile` queryset.

Example queries:
- `"young males from nigeria"` → gender=male, age_group=teenager/adult, country_id=NG  
- `"senior females"` → gender=female, age_group=senior  
- `"adults"` → age_group=adult
