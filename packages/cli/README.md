# @qontoctl/cli

[![npm version](https://img.shields.io/npm/v/@qontoctl/cli?logo=npm)](https://www.npmjs.com/package/@qontoctl/cli)

CLI commands for [Qonto](https://qonto.com) API integration — transaction listing, organization details, labels, memberships, statements, and more.

Part of the [QontoCtl](https://github.com/alexey-pelykh/qontoctl) project.

> **Note:** For end-user usage, install the [`qontoctl`](https://www.npmjs.com/package/qontoctl) umbrella package instead. This package is for programmatic access to the CLI command definitions.

## Installation

```sh
npm install @qontoctl/cli
```

## Commands

| Command                                                                                                           | Description                                                  |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `org show`                                                                                                        | Show organization details                                    |
| `account list`                                                                                                    | List bank accounts                                           |
| `account show <id>`                                                                                               | Show bank account details                                    |
| `account iban-certificate <id>`                                                                                   | Download IBAN certificate PDF                                |
| `account create`                                                                                                  | Create a new bank account                                    |
| `account update <id>`                                                                                             | Update a bank account                                        |
| `account close <id>`                                                                                              | Close a bank account                                         |
| `transaction list`                                                                                                | List transactions with filters                               |
| `transaction show <id>`                                                                                           | Show transaction details                                     |
| `transaction attachment list <id>`                                                                                | List attachments for a transaction                           |
| `transaction attachment add <id> <file>`                                                                          | Attach a file to a transaction                               |
| `transaction attachment remove <id> [att-id]`                                                                     | Remove attachment(s) from a transaction                      |
| `statement list`                                                                                                  | List bank statements                                         |
| `statement show <id>`                                                                                             | Show statement details                                       |
| `statement download <id>`                                                                                         | Download statement PDF                                       |
| `label list`                                                                                                      | List all labels                                              |
| `label show <id>`                                                                                                 | Show label details                                           |
| `membership list`                                                                                                 | List organization memberships                                |
| `membership show`                                                                                                 | Show current user's membership                               |
| `membership invite`                                                                                               | Invite a new member                                          |
| `beneficiary list`                                                                                                | List SEPA beneficiaries                                      |
| `beneficiary show <id>`                                                                                           | Show beneficiary details                                     |
| `beneficiary add`                                                                                                 | Create a new beneficiary                                     |
| `beneficiary update <id>`                                                                                         | Update a beneficiary                                         |
| `beneficiary trust <id...>`                                                                                       | Trust one or more beneficiaries                              |
| `beneficiary untrust <id...>`                                                                                     | Untrust one or more beneficiaries                            |
| `transfer list`                                                                                                   | List SEPA transfers                                          |
| `transfer show <id>`                                                                                              | Show SEPA transfer details                                   |
| `transfer create`                                                                                                 | Create a SEPA transfer                                       |
| `transfer cancel <id>`                                                                                            | Cancel a pending SEPA transfer                               |
| `transfer proof <id>`                                                                                             | Download SEPA transfer proof PDF                             |
| `transfer verify-payee`                                                                                           | Verify a payee (VoP)                                         |
| `transfer bulk-verify-payee`                                                                                      | Bulk verify payees from CSV                                  |
| `internal-transfer create`                                                                                        | Create an internal transfer                                  |
| `bulk-transfer list`                                                                                              | List bulk transfers                                          |
| `bulk-transfer show <id>`                                                                                         | Show bulk transfer details                                   |
| `recurring-transfer list`                                                                                         | List recurring transfers                                     |
| `recurring-transfer show <id>`                                                                                    | Show recurring transfer details                              |
| `recurring-transfer create`                                                                                       | Create a recurring transfer (SCA-gated)                      |
| `recurring-transfer cancel <id>`                                                                                  | Cancel a recurring transfer (SCA-gated)                      |
| `bulk-transfer create`                                                                                            | Create a bulk transfer (SCA-gated)                           |
| `card list`                                                                                                       | List cards (OAuth-only)                                      |
| `card show <id>`                                                                                                  | Show card details (OAuth-only)                               |
| `card create`                                                                                                     | Create a new card (SCA-gated, OAuth-only)                    |
| `card update-{nickname,limits,options,restrictions}`                                                              | Update card properties (SCA-gated)                           |
| `card lock <id>` / `card unlock <id>`                                                                             | Lock or unlock a card (SCA-gated)                            |
| `card iframe-url <id>`                                                                                            | Get a secure iframe URL for card details                     |
| `card report <id>`                                                                                                | Report a card lost/stolen                                    |
| `card discard <id>`                                                                                               | Discard a card                                               |
| `card appearances`                                                                                                | List available card appearances                              |
| `terminal list` / `terminal show <id>`                                                                            | Qonto Terminals (POS) listing                                |
| `product list` / `product show <id>`                                                                              | Qonto Products (catalogue) listing                           |
| `team list` / `team create` / `team show`                                                                         | Team management (OAuth-only)                                 |
| `webhook list` / `show` / `create` / `update` / `delete`                                                          | Webhook subscription management (OAuth-only)                 |
| `payment-link list` / `show` / `create` / `deactivate` / `connect` / `connection-status` / `methods` / `payments` | Payment link management (OAuth-only)                         |
| `insurance show` / `create` / `update` / `upload-document` / `remove-document`                                    | Insurance contract management (OAuth-only)                   |
| `intl-transfer create`                                                                                            | International (SWIFT) transfer (SCA-gated, OAuth-only)       |
| `intl-transfer requirements`                                                                                      | International transfer requirements                          |
| `intl-beneficiary list` / `show` / `add` / `update` / `remove`                                                    | International beneficiary management (SCA-gated, OAuth-only) |
| `intl-beneficiary requirements`                                                                                   | International beneficiary requirements                       |
| `intl-quote create`                                                                                               | International transfer quote                                 |
| `intl-currencies`                                                                                                 | List supported international currencies                      |
| `intl-eligibility`                                                                                                | Check international transfer eligibility                     |
| `request approve` / `decline` / `create-flash-card` / `create-virtual-card` / `create-multi-transfer`             | Request management (OAuth-only)                              |
| `sca-session show <token>`                                                                                        | Inspect SCA session status                                   |
| `sca-session mock-decision <token> <allow\|deny>`                                                                 | Inject SCA decision (sandbox only)                           |
| `client list`                                                                                                     | List clients                                                 |
| `client show <id>`                                                                                                | Show client details                                          |
| `client create`                                                                                                   | Create a new client                                          |
| `client update <id>`                                                                                              | Update a client                                              |
| `client delete <id>`                                                                                              | Delete a client                                              |
| `client-invoice list`                                                                                             | List client invoices                                         |
| `client-invoice show <id>`                                                                                        | Show client invoice details                                  |
| `client-invoice create`                                                                                           | Create a draft client invoice                                |
| `client-invoice update <id>`                                                                                      | Update a draft client invoice                                |
| `client-invoice delete <id>`                                                                                      | Delete a draft client invoice                                |
| `client-invoice finalize <id>`                                                                                    | Finalize client invoice and assign number                    |
| `client-invoice send <id>`                                                                                        | Send client invoice to client via email                      |
| `client-invoice mark-paid <id>`                                                                                   | Mark client invoice as paid                                  |
| `client-invoice unmark-paid <id>`                                                                                 | Unmark client invoice paid status                            |
| `client-invoice cancel <id>`                                                                                      | Cancel a finalized client invoice                            |
| `client-invoice upload <id> <file>`                                                                               | Upload a file to a client invoice                            |
| `client-invoice upload-show <id> <upload-id>`                                                                     | Show upload details for a client invoice                     |
| `quote list`                                                                                                      | List quotes                                                  |
| `quote show <id>`                                                                                                 | Show quote details                                           |
| `quote create`                                                                                                    | Create a new quote                                           |
| `quote update <id>`                                                                                               | Update a quote                                               |
| `quote delete <id>`                                                                                               | Delete a quote                                               |
| `quote send <id>`                                                                                                 | Send quote to client via email                               |
| `credit-note list`                                                                                                | List credit notes                                            |
| `credit-note show <id>`                                                                                           | Show credit note details                                     |
| `supplier-invoice list`                                                                                           | List supplier invoices                                       |
| `supplier-invoice show <id>`                                                                                      | Show supplier invoice details                                |
| `supplier-invoice bulk-create`                                                                                    | Create supplier invoices from files                          |
| `einvoicing settings`                                                                                             | Show e-invoicing settings                                    |
| `request list`                                                                                                    | List all requests                                            |
| `attachment upload <file>`                                                                                        | Upload an attachment file                                    |
| `attachment show <id>`                                                                                            | Show attachment details                                      |
| `auth setup`                                                                                                      | Configure OAuth client credentials                           |
| `auth login`                                                                                                      | Start OAuth login flow                                       |
| `auth status`                                                                                                     | Display OAuth token status                                   |
| `auth refresh`                                                                                                    | Refresh the OAuth access token                               |
| `auth revoke`                                                                                                     | Revoke OAuth consent and clear tokens                        |
| `profile add <name>`                                                                                              | Create a named profile                                       |
| `profile list`                                                                                                    | List all profiles                                            |
| `profile show <name>`                                                                                             | Show profile details (secrets redacted)                      |
| `profile remove <name>`                                                                                           | Remove a named profile                                       |
| `profile test`                                                                                                    | Test credentials                                             |
| `completion`                                                                                                      | Generate shell completion scripts                            |

### Global Options

| Option                  | Description                                   |
| ----------------------- | --------------------------------------------- |
| `-p, --profile <name>`  | Configuration profile to use                  |
| `-o, --output <format>` | Output format: `table`, `json`, `yaml`, `csv` |
| `--verbose`             | Enable verbose logging                        |
| `--debug`               | Enable debug logging                          |
| `--page <number>`       | Page number for paginated results             |
| `--per-page <number>`   | Items per page                                |
| `--no-paginate`         | Disable auto-pagination                       |

## Programmatic Usage

```ts
import { createProgram } from "@qontoctl/cli";

const program = createProgram();
await program.parseAsync(process.argv);
```

## Requirements

- Node.js >= 24

## License

[AGPL-3.0-only](https://github.com/alexey-pelykh/qontoctl/blob/main/LICENSE) — For commercial licensing, contact the maintainer.
