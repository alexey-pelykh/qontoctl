// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect } from "vitest";
import { Command } from "commander";
import { registerAccountCommands } from "./account.js";

describe("registerAccountCommands", () => {
  it("registers an account command group", () => {
    const program = new Command();
    registerAccountCommands(program);

    const accountCommand = program.commands.find((c) => c.name() === "account");
    expect(accountCommand).toBeDefined();
  });

  it("registers the list subcommand under account", () => {
    const program = new Command();
    registerAccountCommands(program);

    const accountCommand = program.commands.find((c) => c.name() === "account");
    const listCommand = accountCommand?.commands.find((c) => c.name() === "list");
    expect(listCommand).toBeDefined();
    expect(listCommand?.description()).toBe("List bank accounts");
  });

  it("registers the show subcommand under account with id argument", () => {
    const program = new Command();
    registerAccountCommands(program);

    const accountCommand = program.commands.find((c) => c.name() === "account");
    const showCommand = accountCommand?.commands.find((c) => c.name() === "show");
    expect(showCommand).toBeDefined();
    expect(showCommand?.description()).toBe("Show bank account details");

    const args = showCommand?.registeredArguments;
    expect(args).toHaveLength(1);
    expect(args?.[0]?.name()).toBe("id");
    expect(args?.[0]?.required).toBe(true);
  });
});
