# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in QontoCtl, please report it
responsibly by emailing **alexey.pelykh@gmail.com**. Do not open a public
issue.

You should receive a response within 48 hours. Please include:

- A description of the vulnerability and its potential impact.
- Steps to reproduce or a proof-of-concept.
- The version of QontoCtl you tested against.

## Security Model

### API Credential Handling

QontoCtl manages Qonto API credentials (API keys) on behalf of the user.
Credentials are stored in YAML configuration files on the local filesystem.

**Credential storage locations:**

| Location                     | Purpose                     |
| ---------------------------- | --------------------------- |
| `~/.qontoctl.yaml`           | Default profile credentials |
| `~/.qontoctl/<profile>.yaml` | Named profile credentials   |
| `.qontoctl.yaml` (CWD)       | Project-scoped credentials  |

**Threat model assumptions:**

| Assumption                   | Rationale                                                                 |
| ---------------------------- | ------------------------------------------------------------------------- |
| The local machine is trusted | Credentials are stored as plaintext YAML files readable by the local user |
| The Qonto API is trusted     | All API calls are made over HTTPS to `thirdparty.qonto.com`               |

### MCP Trust Model

QontoCtl exposes an MCP server (`qontoctl mcp`) that gives AI agents and
other MCP clients programmatic access to Qonto banking operations.

#### Transport

The MCP server uses **stdio transport**. The MCP client (e.g., Claude
Desktop) spawns `qontoctl mcp` as a child process and communicates over
stdin/stdout — no network listener, no authentication token. The trust
boundary is **process-level**: any process that can spawn `qontoctl mcp`
gets full access to every registered tool.

#### Prompt Injection Risk

When the MCP client is an AI agent, the agent processes **untrusted
data** from various sources. An adversarial input could contain
instructions that influence the agent to invoke state-changing tools
(e.g., creating transactions or modifying labels). This is a threat
vector unique to the MCP interface.

### Recommendations

- **Restrict file permissions** on credential files to the owning user.
- **Do not commit** `.qontoctl.yaml` files to version control. Add them
  to `.gitignore`.
- **Do not grant MCP access to untrusted AI agents.** Any MCP client
  that can spawn `qontoctl mcp` receives full access to all registered
  tools.
- **Review agent tool calls** for state-changing operations when using
  an AI agent as the MCP client.
- **Use separate API keys** for different environments (production vs
  sandbox).
- **Keep QontoCtl up to date** to benefit from any security fixes.

## Supported Versions

Security fixes are applied to the latest release only. There is no
long-term support for older versions.
