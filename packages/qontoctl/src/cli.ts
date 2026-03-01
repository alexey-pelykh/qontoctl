#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import {
  addInheritableOptions,
  createClient,
  createCreditNoteCommand,
  createInternalTransferCommand,
  createProgram,
  createLabelCommand,
  createMembershipCommand,
  createQuoteCommand,
  createRequestCommand,
  handleCliError,
  registerProfileCommands,
  registerStatementCommands,
  registerTransferCommands,
  resolveGlobalOptions,
} from "@qontoctl/cli";
import { runStdioServer } from "@qontoctl/mcp/stdio";

const program = createProgram();

program.addCommand(createCreditNoteCommand());
program.addCommand(createInternalTransferCommand());
program.addCommand(createLabelCommand());
program.addCommand(createMembershipCommand());
program.addCommand(createQuoteCommand());
program.addCommand(createRequestCommand());
registerProfileCommands(program);
registerStatementCommands(program);
registerTransferCommands(program);

const mcpCommand = program.command("mcp").description("Start MCP server on stdio (for Claude Desktop, Cursor, etc.)");
addInheritableOptions(mcpCommand);
mcpCommand.action(async () => {
  await runStdioServer({
    getClient: () => createClient(resolveGlobalOptions(mcpCommand)),
  });
});

try {
  await program.parseAsync();
} catch (error: unknown) {
  handleCliError(error, program.opts()["debug"] === true);
}
