# QontoCtl: The Complete CLI & MCP for Qonto

[![CI](https://github.com/alexey-pelykh/qontoctl/actions/workflows/ci.yml/badge.svg)](https://github.com/alexey-pelykh/qontoctl/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/qontoctl?logo=npm)](https://www.npmjs.com/package/qontoctl)
[![npm downloads](https://img.shields.io/npm/dm/qontoctl?logo=npm)](https://www.npmjs.com/package/qontoctl)
[![GitHub Repo stars](https://img.shields.io/github/stars/alexey-pelykh/qontoctl?style=flat&logo=github)](https://github.com/alexey-pelykh/qontoctl)
[![License](https://img.shields.io/github/license/alexey-pelykh/qontoctl)](LICENSE)

CLI and MCP server for the [Qonto](https://qonto.com) banking API.

This project is brought to you by [Alexey Pelykh](https://github.com/alexey-pelykh).

## What It Does

QontoCtl lets AI assistants (Claude, etc.) interact with Qonto through the [Model Context Protocol](https://modelcontextprotocol.io). It can:

- **Organizations** — retrieve organization details and settings
- **Transactions** — list, search, and filter bank transactions
- **Labels** — manage transaction labels and categories
- **Memberships** — view team members and permissions
- **Invoices** — upload, list, and manage supplier invoices
- **Attachments** — manage transaction attachments and receipts

## Prerequisites

- **Node.js** >= 24
- A **Qonto** business account with API access

## Installation

```sh
npm install -g qontoctl
```

Or run directly with npx:

```sh
npx qontoctl --help
```

Or install via Homebrew:

```sh
brew install qontoctl/tap/qontoctl
```

## MCP Integration

QontoCtl implements the [Model Context Protocol](https://modelcontextprotocol.io) (MCP), letting AI assistants interact with your Qonto account through natural language.

### MCP Client Configuration

<details>
<summary><b>Claude Desktop</b></summary>

Add to your Claude Desktop configuration (`claude_desktop_config.json`):

```json
{
    "mcpServers": {
        "qontoctl": {
            "command": "npx",
            "args": ["qontoctl", "mcp"]
        }
    }
}
```

</details>

<details>
<summary><b>Claude Code</b></summary>

```sh
claude mcp add qontoctl -- npx qontoctl mcp
```

</details>

<details>
<summary><b>Cursor</b></summary>

Add to `.cursor/mcp.json` in your project root:

```json
{
    "mcpServers": {
        "qontoctl": {
            "command": "npx",
            "args": ["qontoctl", "mcp"]
        }
    }
}
```

</details>

<details>
<summary><b>Windsurf</b></summary>

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
    "mcpServers": {
        "qontoctl": {
            "command": "npx",
            "args": ["qontoctl", "mcp"]
        }
    }
}
```

</details>

### Available MCP Tools

| Tool               | Description                                                                                           |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| `org_show`         | Show organization details including name, slug, and bank accounts                                     |
| `account_list`     | List all bank accounts for the organization                                                           |
| `account_show`     | Show details of a specific bank account                                                               |
| `transaction_list` | List transactions for a bank account with optional filters (status, date range, side, operation type) |
| `transaction_show` | Show details of a specific transaction                                                                |
| `label_list`       | List all labels in the organization                                                                   |
| `label_show`       | Show details of a specific label                                                                      |
| `statement_list`   | List bank statements with optional filters (account, period)                                          |
| `statement_show`   | Show details of a specific bank statement                                                             |
| `membership_list`  | List all memberships in the organization                                                              |

### Example Prompts

Once configured, you can ask your AI assistant things like:

- "Show my Qonto account balances"
- "List recent transactions over 1000 EUR"
- "What were last month's card payments?"
- "Show all team members in my organization"
- "List bank statements for January 2026"
- "Create a summary of this week's debits"

## CLI Usage

```sh
qontoctl --help
qontoctl mcp    # Start MCP server on stdio
```

## Configuration

QontoCtl supports two authentication methods: **API Key** and **OAuth 2.0**.

### Profile Format

All configuration files use the same YAML format:

```yaml
api-key:
    organization_slug: acme-corp-4821
    secret_key: your-secret-key

oauth:
    client_id: app-id
    client_secret: app-secret
    access_token: eyJ... # auto-managed
    refresh_token: dGhp... # auto-managed
    expires_at: 2026-02-26T18:30:00Z # auto-managed
```

### Resolution Order

**Without `--profile`:**

1. `QONTOCTL_*` environment variables (highest priority)
2. `.qontoctl.yaml` in current directory
3. `~/.qontoctl.yaml` (home default)

**With `--profile acme`:**

1. `QONTOCTL_ACME_*` environment variables (highest priority)
2. `~/.qontoctl/acme.yaml`

OAuth takes precedence over API Key when tokens are valid. Expired tokens are refreshed automatically and written back to the source file.

## Debug Mode

The `--verbose` and `--debug` flags enable wire-level logging to stderr:

```sh
qontoctl --verbose transactions list   # request/response summaries
qontoctl --debug transactions list     # full headers and response bodies
```

> **Security note:** `--debug` logs full API response bodies. Known sensitive fields
> (IBAN, BIC, balance) are automatically redacted, but responses may still contain
> other financial data. Do not use `--debug` in shared environments or pipe debug
> output to files accessible by others.

## Disclaimer

`qontoctl` is an **independent project** not affiliated with, endorsed by, or officially connected to **Qonto** or Qonto SAS.

Qonto is a trademark of Qonto SAS.

## License

[AGPL-3.0-only](LICENSE) — For commercial licensing, contact the maintainer.
