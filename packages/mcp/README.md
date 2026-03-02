# @qontoctl/mcp

[![npm version](https://img.shields.io/npm/v/@qontoctl/mcp?logo=npm)](https://www.npmjs.com/package/@qontoctl/mcp)

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

| Tool                            | Description                                                       |
| ------------------------------- | ----------------------------------------------------------------- |
| **Organization**                |                                                                   |
| `org_show`                      | Show organization details including name, slug, and bank accounts |
| **Accounts**                    |                                                                   |
| `account_list`                  | List all bank accounts for the organization                       |
| `account_show`                  | Show details of a specific bank account                           |
| `account_iban_certificate`      | Download IBAN certificate PDF for a bank account                  |
| `account_create`                | Create a new bank account                                         |
| `account_update`                | Update an existing bank account                                   |
| `account_close`                 | Close a bank account                                              |
| **Transactions**                |                                                                   |
| `transaction_list`              | List transactions for a bank account with optional filters        |
| `transaction_show`              | Show details of a specific transaction                            |
| `transaction_attachment_list`   | List attachments for a transaction                                |
| `transaction_attachment_add`    | Attach a file to a transaction                                    |
| `transaction_attachment_remove` | Remove attachment(s) from a transaction                           |
| **Statements**                  |                                                                   |
| `statement_list`                | List bank statements with optional filters                        |
| `statement_show`                | Show details of a specific bank statement                         |
| **Labels**                      |                                                                   |
| `label_list`                    | List all labels in the organization                               |
| `label_show`                    | Show details of a specific label                                  |
| **Memberships**                 |                                                                   |
| `membership_list`               | List all memberships in the organization                          |
| `membership_show`               | Show the current authenticated user's membership                  |
| `membership_invite`             | Invite a new member to the organization                           |
| **SEPA Beneficiaries**          |                                                                   |
| `beneficiary_list`              | List SEPA beneficiaries in the organization                       |
| `beneficiary_show`              | Show details of a specific SEPA beneficiary                       |
| `beneficiary_add`               | Create a new SEPA beneficiary                                     |
| `beneficiary_update`            | Update an existing SEPA beneficiary                               |
| `beneficiary_trust`             | Trust one or more SEPA beneficiaries                              |
| `beneficiary_untrust`           | Untrust one or more SEPA beneficiaries                            |
| **SEPA Transfers**              |                                                                   |
| `transfer_list`                 | List SEPA transfers with optional filters                         |
| `transfer_show`                 | Show details of a specific SEPA transfer                          |
| `transfer_create`               | Create a SEPA transfer                                            |
| `transfer_cancel`               | Cancel a pending SEPA transfer                                    |
| `transfer_proof`                | Download SEPA transfer proof PDF                                  |
| `transfer_verify_payee`         | Verify a payee (Verification of Payee / VoP)                      |
| `transfer_bulk_verify_payee`    | Bulk verify payees (VoP)                                          |
| **Internal Transfers**          |                                                                   |
| `internal_transfer_create`      | Create an internal transfer between two bank accounts             |
| **Bulk Transfers**              |                                                                   |
| `bulk_transfer_list`            | List bulk transfers                                               |
| `bulk_transfer_show`            | Show details of a specific bulk transfer                          |
| **Recurring Transfers**         |                                                                   |
| `recurring_transfer_list`       | List recurring transfers                                          |
| `recurring_transfer_show`       | Show details of a specific recurring transfer                     |
| **Clients**                     |                                                                   |
| `client_list`                   | List clients with optional pagination                             |
| `client_show`                   | Show details of a specific client                                 |
| `client_create`                 | Create a new client                                               |
| `client_update`                 | Update an existing client                                         |
| `client_delete`                 | Delete a client                                                   |
| **Client Invoices**             |                                                                   |
| `client_invoice_list`           | List client invoices with optional filters                        |
| `client_invoice_show`           | Show details of a specific client invoice                         |
| `client_invoice_create`         | Create a draft client invoice with client and line items          |
| `client_invoice_update`         | Update a draft client invoice                                     |
| `client_invoice_delete`         | Delete a draft client invoice                                     |
| `client_invoice_finalize`       | Finalize a client invoice (assign number)                         |
| `client_invoice_send`           | Send a client invoice to the client via email                     |
| `client_invoice_mark_paid`      | Mark a client invoice as paid                                     |
| `client_invoice_unmark_paid`    | Unmark a client invoice paid status                               |
| `client_invoice_cancel`         | Cancel a finalized client invoice                                 |
| `client_invoice_upload`         | Upload a file to a client invoice                                 |
| `client_invoice_upload_show`    | Show upload details for a client invoice                          |
| **Quotes**                      |                                                                   |
| `quote_list`                    | List quotes with optional filters                                 |
| `quote_show`                    | Show details of a specific quote                                  |
| `quote_create`                  | Create a new quote with client and line items                     |
| `quote_update`                  | Update an existing quote                                          |
| `quote_delete`                  | Delete a quote                                                    |
| `quote_send`                    | Send a quote to the client via email                              |
| **Credit Notes**                |                                                                   |
| `credit_note_list`              | List credit notes in the organization                             |
| `credit_note_show`              | Show details of a specific credit note                            |
| **Supplier Invoices**           |                                                                   |
| `supplier_invoice_list`         | List supplier invoices with optional filters                      |
| `supplier_invoice_show`         | Show details of a specific supplier invoice                       |
| `supplier_invoice_bulk_create`  | Create supplier invoices by uploading files                       |
| **Requests**                    |                                                                   |
| `request_list`                  | List all requests in the organization                             |
| **Attachments**                 |                                                                   |
| `attachment_upload`             | Upload an attachment file (PDF, JPEG, PNG)                        |
| `attachment_show`               | Show details of a specific attachment                             |
| **E-Invoicing**                 |                                                                   |
| `einvoicing_settings`           | Retrieve e-invoicing settings for the organization                |

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
