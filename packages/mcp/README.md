# @qontoctl/mcp

[Model Context Protocol](https://modelcontextprotocol.io) (MCP) server for [Qonto](https://qonto.com) API integration — lets AI assistants interact with Qonto banking data.

Part of the [QontoCtl](https://github.com/alexey-pelykh/qontoctl) project.

> **Note:** For end-user usage with Claude Desktop or other MCP clients, install the [`qontoctl`](https://www.npmjs.com/package/qontoctl) umbrella package instead. This package is for programmatic access to the MCP server.

## Installation

```sh
npm install @qontoctl/mcp
```

## Usage with Claude Desktop

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

## Available Tools

| Tool               | Description                                     |
| ------------------ | ----------------------------------------------- |
| `org_show`         | Show organization details                       |
| `account_list`     | List all bank accounts                          |
| `account_show`     | Show account details by ID                      |
| `transaction_list` | List transactions with filtering and pagination |
| `transaction_show` | Show transaction details by ID                  |
| `label_list`       | List labels with pagination                     |
| `label_show`       | Show label details by ID                        |
| `membership_list`  | List memberships with pagination                |
| `statement_list`   | List bank statements with filtering             |
| `statement_show`   | Show statement details by ID                    |

## Programmatic Usage

```ts
import { createServer } from "@qontoctl/mcp";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = createServer({
    getClient: async () => {
        // Return a configured HttpClient instance
    },
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

## Requirements

- Node.js >= 24

## License

[AGPL-3.0-only](https://github.com/alexey-pelykh/qontoctl/blob/main/LICENSE) — For commercial licensing, contact the maintainer.
