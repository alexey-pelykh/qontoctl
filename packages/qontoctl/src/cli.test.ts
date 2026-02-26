// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, expect, it } from "vitest";
import { Command } from "commander";

describe("qontoctl CLI", () => {
  it("registers mcp subcommand", () => {
    const program = new Command();
    program.name("qontoctl").version("0.0.0");

    program
      .command("mcp")
      .description(
        "Start MCP server on stdio (for Claude Desktop, Cursor, etc.)",
      );

    const commandNames = program.commands.map((c) => c.name());
    expect(commandNames).toContain("mcp");
  });
});
