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
- **Accounts** — list and inspect bank accounts
- **Transactions** — list, search, and filter bank transactions
- **Bank Statements** — list, view, and download bank statements
- **Labels** — manage transaction labels and categories
- **Memberships** — view team members and permissions

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

## Quick Start

```sh
# 1. Install
npm install -g qontoctl

# 2. Create a profile with your Qonto API credentials
qontoctl profile add mycompany

# 3. Test the connection
qontoctl profile test --profile mycompany

# 4. List your accounts
qontoctl account list --profile mycompany
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

### Commands

| Command                   | Description                             |
| ------------------------- | --------------------------------------- |
| `org show`                | Show organization details               |
| `account list`            | List bank accounts                      |
| `account show <id>`       | Show bank account details               |
| `transaction list`        | List transactions (with filters)        |
| `transaction show <id>`   | Show transaction details                |
| `statement list`          | List bank statements                    |
| `statement show <id>`     | Show bank statement details             |
| `statement download <id>` | Download bank statement PDF             |
| `label list`              | List labels                             |
| `label show <id>`         | Show label details                      |
| `membership list`         | List team memberships                   |
| `profile add <name>`      | Create a named profile                  |
| `profile list`            | List all profiles                       |
| `profile show <name>`     | Show profile details (secrets redacted) |
| `profile remove <name>`   | Remove a named profile                  |
| `profile test`            | Test credentials                        |
| `completion bash`         | Generate bash completions               |
| `completion zsh`          | Generate zsh completions                |
| `completion fish`         | Generate fish completions               |
| `mcp`                     | Start MCP server on stdio               |

### Global Options

| Option                  | Description                                             |
| ----------------------- | ------------------------------------------------------- |
| `-p, --profile <name>`  | Configuration profile to use                            |
| `-o, --output <format>` | Output format: `table` (default), `json`, `yaml`, `csv` |
| `--page <number>`       | Fetch a specific page of results                        |
| `--per-page <number>`   | Results per page                                        |
| `--no-paginate`         | Disable auto-pagination                                 |
| `--verbose`             | Enable verbose output                                   |
| `--debug`               | Enable debug output (implies `--verbose`)               |

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

### Environment Variables

Environment variables override file values. Without `--profile`:

| Variable                     | Description                             |
| ---------------------------- | --------------------------------------- |
| `QONTOCTL_ORGANIZATION_SLUG` | Organization slug                       |
| `QONTOCTL_SECRET_KEY`        | API secret key                          |
| `QONTOCTL_ENDPOINT`          | Custom API endpoint                     |
| `QONTOCTL_SANDBOX`           | Use sandbox (`1`/`true` or `0`/`false`) |

With `--profile <name>`, prefix becomes `QONTOCTL_{NAME}_` (uppercased, hyphens replaced with underscores). For example, `--profile acme` reads `QONTOCTL_ACME_ORGANIZATION_SLUG`.

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

[AGPL-3.0-only](LICENSE)

### What AGPL means for you

- **Using qontoctl as a CLI tool or MCP server** does not make your code AGPL-licensed.
  Running the tool, scripting around it, or connecting it to your applications is normal
  use — no license obligations arise.
- **Using `@qontoctl/core` as a library** (importing it into your code) means your combined
  work is covered by AGPL-3.0. If you distribute that combined work, you must make its
  source available under AGPL-compatible terms.
- **Modifying and distributing qontoctl itself** requires you to share your changes under
  AGPL-3.0.
- **Commercial licensing** is available if AGPL does not fit your use case — contact the
  maintainer.
