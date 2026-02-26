#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { Command } from "commander";
import { runStdioServer } from "@qontoctl/mcp/stdio";

const program = new Command();

program
  .name("qontoctl")
  .description("The complete CLI & MCP for Qonto")
  .version("0.0.0");

program
  .command("mcp")
  .description("Start MCP server on stdio (for Claude Desktop, Cursor, etc.)")
  .action(async () => {
    await runStdioServer();
  });

program.parse();
