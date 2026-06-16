#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import {
  addInheritableOptions,
  buildClientFromGlobalOptions,
  buildResolveOptions,
  createAttachmentCommand,
  createClientCommand,
  createClientInvoiceCommand,
  createCreditNoteCommand,
  createInternalTransferCommand,
  createProgram,
  createLabelCommand,
  createMembershipCommand,
  createProductCommand,
  createQuoteCommand,
  createTerminalCommand,
  createWebhookCommand,
  handleCliError,
  registerRequestCommands,
  registerStatementCommands,
  registerTransferCommands,
  resolveGlobalOptions,
  type GlobalOptions,
} from "@qontoctl/cli";
import { runStdioServer } from "@qontoctl/mcp/stdio";

const program = createProgram();

program.addCommand(createAttachmentCommand());
program.addCommand(createClientCommand());
program.addCommand(createClientInvoiceCommand());
program.addCommand(createCreditNoteCommand());
program.addCommand(createInternalTransferCommand());
program.addCommand(createLabelCommand());
program.addCommand(createMembershipCommand());
program.addCommand(createProductCommand());
program.addCommand(createQuoteCommand());
program.addCommand(createTerminalCommand());
program.addCommand(createWebhookCommand());
registerRequestCommands(program);
registerStatementCommands(program);
registerTransferCommands(program);

const mcpCommand = program.command("mcp").description("Start MCP server on stdio (for Claude Desktop, Cursor, etc.)");
addInheritableOptions(mcpCommand);
mcpCommand.action(async () => {
  // Capture the launch options once. The server (createServer) builds ONE
  // config resolver from `resolveOptions` that BOTH the data-tool client and
  // the diagnose tool resolve through, so they cannot diverge on which config
  // file to load (#663 — retiring the #658→#661 bug-class). `buildClient`
  // receives that resolver's freshly-resolved config and turns it into an
  // HttpClient via the CLI's `buildClientFromGlobalOptions` — honouring the
  // launch `--profile` / `--config` / `--auth` / `--sca-method` flags, the same
  // mapping `createClient` uses for CLI commands.
  const launchOptions = resolveGlobalOptions<GlobalOptions>(mcpCommand);
  await runStdioServer({
    buildClient: (result) => buildClientFromGlobalOptions(result, launchOptions),
    resolveOptions: buildResolveOptions(launchOptions),
  });
});

try {
  await program.parseAsync();
} catch (error: unknown) {
  handleCliError(error, program.opts()["debug"] === true);
}
