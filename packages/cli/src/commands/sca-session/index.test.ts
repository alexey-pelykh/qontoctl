// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect } from "vitest";
import { Command } from "commander";
import { registerScaSessionCommands } from "./index.js";

describe("registerScaSessionCommands", () => {
  it("registers the sca-session command group with show and mock-decision subcommands", () => {
    const program = new Command();
    registerScaSessionCommands(program);

    const scaSession = program.commands.find((c) => c.name() === "sca-session");
    expect(scaSession).toBeDefined();

    const subcommands = scaSession?.commands.map((c) => c.name());
    expect(subcommands).toContain("show");
    expect(subcommands).toContain("mock-decision");
  });

  it("show subcommand has token argument and SCA-related description", () => {
    const program = new Command();
    registerScaSessionCommands(program);

    const scaSession = program.commands.find((c) => c.name() === "sca-session");
    const show = scaSession?.commands.find((c) => c.name() === "show");
    expect(show).toBeDefined();
    expect(show?.description()).toMatch(/SCA session/i);

    const usage = show?.usage() ?? "";
    expect(usage).toContain("<token>");
  });

  it("mock-decision subcommand documents sandbox-only restriction in help", () => {
    const program = new Command();
    registerScaSessionCommands(program);

    const scaSession = program.commands.find((c) => c.name() === "sca-session");
    const mockDecision = scaSession?.commands.find((c) => c.name() === "mock-decision");
    expect(mockDecision).toBeDefined();
    expect(mockDecision?.description()).toMatch(/sandbox/i);

    const usage = mockDecision?.usage() ?? "";
    expect(usage).toContain("<token>");
    expect(usage).toContain("<decision>");

    // The configured "after" help text references the staging-token requirement.
    // Capture rendered help output (which includes addHelpText) via a Help instance.
    let helpOutput = "";
    mockDecision?.configureOutput({
      writeOut: (str) => {
        helpOutput += str;
      },
      writeErr: (str) => {
        helpOutput += str;
      },
    });
    mockDecision?.outputHelp();
    expect(helpOutput).toMatch(/staging-token|QONTOCTL_STAGING_TOKEN/);
  });
});
