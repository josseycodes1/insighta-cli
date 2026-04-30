# Insighta Labs+ CLI

Globally installable TypeScript CLI for the Insighta Labs+ Profile Intelligence System. It gives engineers and power users terminal access to the same backend used by the web portal.

## Repository Role

This repository is the CLI interface in the three-repository Stage 3 architecture:

- Backend API: stores users, profiles, roles, tokens, and audit logs.
- Web portal: browser UI for non-technical users.
- CLI: terminal workflow for authenticated profile search and administration.

## Installation

```bash
npm install
npm run build
npm link
```

After linking, this command should work from any directory:

```bash
insighta --help
```

## Configuration

The CLI reads the backend URL from `INSIGHTA_API_URL`.

```bash
set INSIGHTA_API_URL=http://localhost:8000
```

Default backend:

```text
http://localhost:8000
```

Production backend:

```text
https://rofile--ntegration-adewumijosephine3516-kodp7ruz.leapcell.dev
```

## Authentication Flow

```bash
insighta login
```

The login command:

1. Generates a secure OAuth `state`.
2. Generates a PKCE `code_verifier`.
3. Derives a `code_challenge`.
4. Starts a temporary local callback server on port `9876`.
5. Opens the GitHub OAuth URL in the browser.
6. Captures the callback.
7. Validates the returned `state`.
8. Sends the GitHub code and PKCE data to the backend.
9. Stores access and refresh tokens locally.

Credentials are stored at:

```text
~/.insighta/credentials.json
```

## Token Handling

- Access tokens are sent as `Authorization: Bearer <token>`.
- Profile API calls include `X-API-Version: 1`.
- Expired access tokens are refreshed automatically when possible.
- If refresh fails, local credentials are cleared and the user must run `insighta login` again.

## Commands

Auth:

```bash
insighta login
insighta logout
insighta whoami
insighta refresh
```

Profiles:

```bash
insighta profiles list
insighta profiles list --gender male
insighta profiles list --country NG --age-group adult
insighta profiles list --min-age 25 --max-age 40
insighta profiles list --sort-by age --order desc
insighta profiles list --page 2 --limit 20

insighta profiles get <id>
insighta profiles search "young males from nigeria"
insighta profiles create --name "Harriet Tubman"
insighta profiles export --format csv
insighta profiles export --format csv --gender male --country NG
```

## Role Enforcement

The backend is the authority for access control.

| Role | CLI behavior |
| --- | --- |
| `admin` | Can list, get, search, create, delete, and export |
| `analyst` | Can list, get, and search |

The CLI also prevents obvious admin-only actions locally so users get immediate feedback.

## Natural Language Search

`profiles search` sends the raw query to the backend. The backend parser maps plain English to filters.

Examples:

```bash
insighta profiles search "young males from nigeria"
insighta profiles search "females above 30"
insighta profiles search "adult males from kenya"
```

## Development

```bash
npm install
npm run dev -- --help
npm run lint
npm test
npm run build
```

## CI/CD

GitHub Actions workflow: `.github/workflows/ci.yml`

Runs on pull requests and pushes to `main`:

- `npm ci`
- `npm run lint`
- `npm test`
- `npm run build`

## Engineering Standards

- Use conventional commits, for example `fix(cli): handle token refresh`.
- Open pull requests before merging to `main`.
- Keep API URLs in environment variables instead of hardcoding deployment URLs in command logic.
