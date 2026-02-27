#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import {
  createClient,
  createProgram,
  createLabelCommand,
  createMembershipCommand,
  registerStatementCommands,
} from "@qontoctl/cli";
import { runStdioServer } from "@qontoctl/mcp/stdio";

const program = createProgram();

program.addCommand(createLabelCommand());
program.addCommand(createMembershipCommand());
registerStatementCommands(program);

program
  .command("mcp")
  .description("Start MCP server on stdio (for Claude Desktop, Cursor, etc.)")
  .action(async () => {
    await runStdioServer({
      getClient: () => createClient(program.opts()),
    });
  });

program.parse();
