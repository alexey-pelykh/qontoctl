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

| Tool                                            | Description                                                       |
| ----------------------------------------------- | ----------------------------------------------------------------- |
| **Organization**                                |                                                                   |
| `org_show`                                      | Show organization details including name, slug, and bank accounts |
| **Accounts**                                    |                                                                   |
| `account_list`                                  | List all bank accounts for the organization                       |
| `account_show`                                  | Show details of a specific bank account                           |
| `account_iban_certificate`                      | Download IBAN certificate PDF for a bank account                  |
| `account_create`                                | Create a new bank account                                         |
| `account_update`                                | Update an existing bank account                                   |
| `account_close`                                 | Close a bank account                                              |
| **Transactions**                                |                                                                   |
| `transaction_list`                              | List transactions for a bank account with optional filters        |
| `transaction_show`                              | Show details of a specific transaction                            |
| `transaction_attachment_list`                   | List attachments for a transaction                                |
| `transaction_attachment_add`                    | Attach a file to a transaction                                    |
| `transaction_attachment_remove`                 | Remove attachment(s) from a transaction                           |
| **Statements**                                  |                                                                   |
| `statement_list`                                | List bank statements with optional filters                        |
| `statement_show`                                | Show details of a specific bank statement                         |
| **Labels**                                      |                                                                   |
| `label_list`                                    | List all labels in the organization                               |
| `label_show`                                    | Show details of a specific label                                  |
| **Memberships**                                 |                                                                   |
| `membership_list`                               | List all memberships in the organization                          |
| `membership_show`                               | Show the current authenticated user's membership                  |
| `membership_invite`                             | Invite a new member to the organization                           |
| **SEPA Beneficiaries**                          |                                                                   |
| `beneficiary_list`                              | List SEPA beneficiaries in the organization                       |
| `beneficiary_show`                              | Show details of a specific SEPA beneficiary                       |
| `beneficiary_add`                               | Create a new SEPA beneficiary                                     |
| `beneficiary_update`                            | Update an existing SEPA beneficiary                               |
| `beneficiary_trust`                             | Trust one or more SEPA beneficiaries                              |
| `beneficiary_untrust`                           | Untrust one or more SEPA beneficiaries                            |
| **SEPA Transfers**                              |                                                                   |
| `transfer_list`                                 | List SEPA transfers with optional filters                         |
| `transfer_show`                                 | Show details of a specific SEPA transfer                          |
| `transfer_create`                               | Create a SEPA transfer                                            |
| `transfer_cancel`                               | Cancel a pending SEPA transfer                                    |
| `transfer_proof`                                | Download SEPA transfer proof PDF                                  |
| `transfer_verify_payee`                         | Verify a payee (Verification of Payee / VoP)                      |
| `transfer_bulk_verify_payee`                    | Bulk verify payees (VoP)                                          |
| **Internal Transfers**                          |                                                                   |
| `internal_transfer_create`                      | Create an internal transfer between two bank accounts             |
| **Bulk Transfers**                              |                                                                   |
| `bulk_transfer_list`                            | List bulk transfers                                               |
| `bulk_transfer_show`                            | Show details of a specific bulk transfer                          |
| `bulk_transfer_create`                          | Create a bulk transfer (SCA-gated)                                |
| **Recurring Transfers**                         |                                                                   |
| `recurring_transfer_list`                       | List recurring transfers                                          |
| `recurring_transfer_show`                       | Show details of a specific recurring transfer                     |
| `recurring_transfer_create`                     | Create a recurring transfer (SCA-gated)                           |
| `recurring_transfer_cancel`                     | Cancel a recurring transfer (SCA-gated)                           |
| **International Transfers (SWIFT, OAuth-only)** |                                                                   |
| `intl_transfer_create`                          | Create an international (SWIFT) transfer (SCA-gated)              |
| `intl_transfer_requirements`                    | Get international transfer requirements                           |
| `intl_quote_create`                             | Create an international transfer quote                            |
| `intl_currencies`                               | List supported international currencies                           |
| `intl_eligibility`                              | Check international transfer eligibility                          |
| `intl_beneficiary_list`                         | List international beneficiaries                                  |
| `intl_beneficiary_add`                          | Add an international beneficiary (SCA-gated)                      |
| `intl_beneficiary_update`                       | Update an international beneficiary (SCA-gated)                   |
| `intl_beneficiary_remove`                       | Remove an international beneficiary (SCA-gated)                   |
| `intl_beneficiary_requirements`                 | Get international beneficiary requirements                        |
| **Cards (OAuth-only)**                          |                                                                   |
| `card_list`                                     | List cards                                                        |
| `card_show`                                     | Show details of a specific card                                   |
| `card_create`                                   | Create a new card (SCA-gated)                                     |
| `card_bulk_create`                              | Bulk-create cards (SCA-gated)                                     |
| `card_update_nickname`                          | Update card nickname (SCA-gated)                                  |
| `card_update_limits`                            | Update card spending limits (SCA-gated)                           |
| `card_update_options`                           | Update card options (SCA-gated)                                   |
| `card_update_restrictions`                      | Update card restrictions (SCA-gated)                              |
| `card_lock` / `card_unlock`                     | Lock or unlock a card (SCA-gated)                                 |
| `card_iframe_url`                               | Get a secure iframe URL to view card details                      |
| `card_report_lost`                              | Report a card lost                                                |
| `card_report_stolen`                            | Report a card stolen                                              |
| `card_discard`                                  | Discard a card                                                    |
| `card_appearances`                              | List available card appearances                                   |
| **Terminals & Products**                        |                                                                   |
| `terminal_list`                                 | List Qonto Terminals (POS)                                        |
| `terminal_payment_create`                       | Create a Qonto Terminal payment                                   |
| `product_list`                                  | List Qonto Products (catalogue)                                   |
| **Teams (OAuth-only)**                          |                                                                   |
| `team_list`                                     | List teams                                                        |
| `team_create`                                   | Create a new team                                                 |
| **Webhooks (OAuth-only)**                       |                                                                   |
| `webhook_list`                                  | List webhook subscriptions                                        |
| `webhook_show`                                  | Show details of a specific webhook                                |
| `webhook_create`                                | Create a new webhook subscription                                 |
| `webhook_update`                                | Update a webhook subscription                                     |
| `webhook_delete`                                | Delete a webhook subscription                                     |
| **Payment Links (OAuth-only)**                  |                                                                   |
| `payment_link_list`                             | List payment links                                                |
| `payment_link_show`                             | Show details of a specific payment link                           |
| `payment_link_create`                           | Create a new payment link                                         |
| `payment_link_deactivate`                       | Deactivate a payment link                                         |
| `payment_link_connect`                          | Connect a Stripe account for payment links                        |
| `payment_link_connection_status`                | Show Stripe connection status                                     |
| `payment_link_methods`                          | List enabled payment methods                                      |
| `payment_link_payments`                         | List payments received via payment links                          |
| **Insurance (OAuth-only)**                      |                                                                   |
| `insurance_show`                                | Show insurance contract details                                   |
| `insurance_create`                              | Create an insurance contract                                      |
| `insurance_update`                              | Update an insurance contract                                      |
| `insurance_upload_document`                     | Upload a document to an insurance contract                        |
| `insurance_remove_document`                     | Remove a document from an insurance contract                      |
| **Clients**                                     |                                                                   |
| `client_list`                                   | List clients with optional pagination                             |
| `client_show`                                   | Show details of a specific client                                 |
| `client_create`                                 | Create a new client                                               |
| `client_update`                                 | Update an existing client                                         |
| `client_delete`                                 | Delete a client                                                   |
| **Client Invoices**                             |                                                                   |
| `client_invoice_list`                           | List client invoices with optional filters                        |
| `client_invoice_show`                           | Show details of a specific client invoice                         |
| `client_invoice_create`                         | Create a draft client invoice with client and line items          |
| `client_invoice_update`                         | Update a draft client invoice                                     |
| `client_invoice_delete`                         | Delete a draft client invoice                                     |
| `client_invoice_finalize`                       | Finalize a client invoice (assign number)                         |
| `client_invoice_send`                           | Send a client invoice to the client via email                     |
| `client_invoice_mark_paid`                      | Mark a client invoice as paid                                     |
| `client_invoice_unmark_paid`                    | Unmark a client invoice paid status                               |
| `client_invoice_cancel`                         | Cancel a finalized client invoice                                 |
| `client_invoice_upload`                         | Upload a file to a client invoice                                 |
| `client_invoice_upload_show`                    | Show upload details for a client invoice                          |
| **Quotes**                                      |                                                                   |
| `quote_list`                                    | List quotes with optional filters                                 |
| `quote_show`                                    | Show details of a specific quote                                  |
| `quote_create`                                  | Create a new quote with client and line items                     |
| `quote_update`                                  | Update an existing quote                                          |
| `quote_delete`                                  | Delete a quote                                                    |
| `quote_send`                                    | Send a quote to the client via email                              |
| **Credit Notes**                                |                                                                   |
| `credit_note_list`                              | List credit notes in the organization                             |
| `credit_note_show`                              | Show details of a specific credit note                            |
| **Supplier Invoices**                           |                                                                   |
| `supplier_invoice_list`                         | List supplier invoices with optional filters                      |
| `supplier_invoice_show`                         | Show details of a specific supplier invoice                       |
| `supplier_invoice_bulk_create`                  | Create supplier invoices by uploading files                       |
| **Requests (OAuth-only)**                       |                                                                   |
| `request_list`                                  | List all requests in the organization                             |
| `request_approve`                               | Approve a request (SCA-gated)                                     |
| `request_decline`                               | Decline a request                                                 |
| `request_create_flash_card`                     | Create a flash-card request                                       |
| `request_create_virtual_card`                   | Create a virtual-card request                                     |
| `request_create_multi_transfer`                 | Create a multi-transfer request                                   |
| **Attachments**                                 |                                                                   |
| `attachment_upload`                             | Upload an attachment file (PDF, JPEG, PNG)                        |
| `attachment_show`                               | Show details of a specific attachment                             |
| **E-Invoicing**                                 |                                                                   |
| `einvoicing_settings`                           | Retrieve e-invoicing settings for the organization                |
| **SCA Sessions**                                |                                                                   |
| `sca_session_show`                              | Inspect an SCA session by token                                   |
| `sca_session_mock_decision`                     | Inject a mock SCA decision (sandbox only)                         |
| **Diagnostics**                                 |                                                                   |
| `diagnose`                                      | Report current configuration, auth status, and connectivity       |

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
