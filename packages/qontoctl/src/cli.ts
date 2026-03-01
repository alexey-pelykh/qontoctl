#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import {
  addInheritableOptions,
  createClient,
  createCreditNoteCommand,
  createProgram,
  createLabelCommand,
  createMembershipCommand,
  handleCliError,
  registerProfileCommands,
  registerStatementCommands,
  resolveGlobalOptions,
} from "@qontoctl/cli";
import { runStdioServer } from "@qontoctl/mcp/stdio";

const program = createProgram();

program.addCommand(createCreditNoteCommand());
program.addCommand(createLabelCommand());
program.addCommand(createMembershipCommand());
registerProfileCommands(program);
registerStatementCommands(program);

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
