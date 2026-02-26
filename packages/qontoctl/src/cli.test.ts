// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, expect, it } from "vitest";
import { createProgram } from "@qontoctl/cli";

describe("qontoctl CLI", () => {
  it("creates program with correct name", () => {
    const program = createProgram();
    expect(program.name()).toBe("qontoctl");
  });

  it("registers mcp subcommand", () => {
    const program = createProgram();

    program
      .command("mcp")
      .description(
        "Start MCP server on stdio (for Claude Desktop, Cursor, etc.)",
      );

    const commandNames = program.commands.map((c) => c.name());
    expect(commandNames).toContain("mcp");
  });
});
