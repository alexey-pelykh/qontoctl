#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import {
  addInheritableOptions,
  buildResolveOptions,
  createAttachmentCommand,
  createClient,
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
  // Capture the launch options once. Both the data-tool client factory and
  // the diagnose tool resolve config through these same options, so diagnose
  // honours the server's `--profile` / `--config` instead of being blind to
  // them (#658). `buildResolveOptions` is the exact resolver-input transform
  // `createClient` applies internally, keeping diagnose in lockstep with the
  // data tools.
  const launchOptions = resolveGlobalOptions<GlobalOptions>(mcpCommand);
  await runStdioServer({
    getClient: () => createClient(launchOptions),
    resolveOptions: buildResolveOptions(launchOptions),
  });
});

try {
  await program.parseAsync();
} catch (error: unknown) {
  handleCliError(error, program.opts()["debug"] === true);
}
