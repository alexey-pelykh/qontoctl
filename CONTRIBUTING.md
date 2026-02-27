# Contributing to QontoCtl

Thank you for your interest in contributing to QontoCtl!

## Contributor License Agreement (CLA)

By submitting a pull request or otherwise contributing to this project, you agree to the following terms:

1. **Grant of Rights**: You grant the project maintainer(s) a perpetual, worldwide, non-exclusive, royalty-free, irrevocable license to use, reproduce, modify, distribute, sublicense, and otherwise exploit your contribution in any form.

2. **Dual Licensing**: You acknowledge that the maintainer(s) may offer the software under alternative licenses (including commercial licenses) in addition to the AGPL-3.0 license, and your contribution may be included in such offerings.

3. **Original Work**: You represent that your contribution is your original work, or you have the right to submit it under these terms.

4. **No Warranty**: You provide your contribution "as is" without warranty of any kind.

### How to Agree

By submitting a pull request, you indicate agreement with this CLA. No separate signature is required.

For substantial contributions, please include the following sign-off in your commit message:

```
Signed-off-by: Your Name <your.email@example.com>
```

You can add this automatically with `git commit -s`.

## Development

### Prerequisites

- **Node.js** >= 24
- **pnpm** 9.15.4

### Setup

```sh
git clone https://github.com/alexey-pelykh/qontoctl.git
cd qontoctl
pnpm install
pnpm build
```

### Running Tests

```sh
pnpm test          # unit + integration tests
pnpm lint          # lint checks
```

### Project Structure

The repository is a pnpm monorepo with the following packages:

| Package             | Description                                                        |
| ------------------- | ------------------------------------------------------------------ |
| `packages/core`     | Qonto API client, authentication, and service layer                |
| `packages/cli`      | CLI commands and program definition (published as `@qontoctl/cli`) |
| `packages/mcp`      | MCP server exposing Qonto tools (published as `@qontoctl/mcp`)     |
| `packages/qontoctl` | Umbrella package combining CLI and MCP (published as `qontoctl`)   |

### Conventions

Follow the project conventions documented in [CLAUDE.md](CLAUDE.md).

### Submitting Changes

1. Fork and create a feature branch
2. Make changes following project conventions
3. Commit with descriptive message (see CLAUDE.md for format)
4. Open a pull request

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md).
Please read it before participating.

## Questions?

Open an issue for discussion before starting significant work.
