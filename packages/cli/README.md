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

| Command                   | Description                        |
| ------------------------- | ---------------------------------- |
| `org show`                | Show organization details          |
| `account list`            | List bank accounts                 |
| `account show <id>`       | Show account details               |
| `transaction list`        | List transactions with filters     |
| `transaction show <id>`   | Show transaction details           |
| `label list`              | List all labels                    |
| `label show <id>`         | Show label details                 |
| `membership list`         | List organization memberships      |
| `profile add <name>`      | Create a new profile interactively |
| `profile list`            | List named profiles                |
| `profile show <name>`     | Show profile details               |
| `profile remove <name>`   | Delete a named profile             |
| `profile test`            | Test profile credentials           |
| `statement list`          | List bank statements               |
| `statement show <id>`     | Show statement details             |
| `statement download <id>` | Download statement PDF             |
| `completion`              | Generate shell completion scripts  |

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
