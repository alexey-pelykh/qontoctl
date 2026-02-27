// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect } from "vitest";
import { Command } from "commander";
import { registerOrgCommands } from "./org.js";

describe("registerOrgCommands", () => {
  it("registers an org command group", () => {
    const program = new Command();
    registerOrgCommands(program);

    const orgCommand = program.commands.find((c) => c.name() === "org");
    expect(orgCommand).toBeDefined();
  });

  it("registers the show subcommand under org", () => {
    const program = new Command();
    registerOrgCommands(program);

    const orgCommand = program.commands.find((c) => c.name() === "org");
    const showCommand = orgCommand?.commands.find((c) => c.name() === "show");
    expect(showCommand).toBeDefined();
    expect(showCommand?.description()).toBe("Show organization details");
  });
});
