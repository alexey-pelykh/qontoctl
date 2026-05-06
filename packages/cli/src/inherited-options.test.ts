// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect } from "vitest";
import { Command, Option } from "commander";
import { addInheritableOptions, resolveGlobalOptions } from "./inherited-options.js";

describe("addInheritableOptions", () => {
  it("adds --profile, --verbose, --debug, and --sca-method to a command", () => {
    const cmd = new Command("test");
    addInheritableOptions(cmd);

    const optionNames = cmd.options.map((o) => o.long);
    expect(optionNames).toContain("--profile");
    expect(optionNames).toContain("--verbose");
    expect(optionNames).toContain("--debug");
    expect(optionNames).toContain("--sca-method");
  });

  it("adds -p as shorthand for --profile", () => {
    const cmd = new Command("test");
    addInheritableOptions(cmd);

    const profileOption = cmd.options.find((o) => o.long === "--profile");
    expect(profileOption?.short).toBe("-p");
  });

  it("hides --sca-method from help", () => {
    const cmd = new Command("test");
    addInheritableOptions(cmd);

    const scaOption = cmd.options.find((o) => o.long === "--sca-method");
    expect(scaOption?.hidden).toBe(true);
  });
});

describe("resolveGlobalOptions", () => {
  function createProgram(): Command {
    const program = new Command();
    program
      .addOption(new Option("-p, --profile <name>", "configuration profile"))
      .addOption(new Option("-o, --output <format>", "output format").default("table"))
      .addOption(new Option("--verbose", "verbose output"))
      .addOption(new Option("--debug", "debug output"));
    return program;
  }

  it("resolves profile from global position", async () => {
    const program = createProgram();
    const sub = program.command("sub");
    addInheritableOptions(sub);

    let resolved: Record<string, unknown> = {};
    sub.action((_opts: unknown, cmd: Command) => {
      resolved = resolveGlobalOptions(cmd);
    });

    await program.parseAsync(["node", "test", "--profile", "work", "sub"]);
    expect(resolved["profile"]).toBe("work");
  });

  it("resolves profile from subcommand position", async () => {
    const program = createProgram();
    const sub = program.command("sub");
    addInheritableOptions(sub);

    let resolved: Record<string, unknown> = {};
    sub.action((_opts: unknown, cmd: Command) => {
      resolved = resolveGlobalOptions(cmd);
    });

    await program.parseAsync(["node", "test", "sub", "--profile", "work"]);
    expect(resolved["profile"]).toBe("work");
  });

  it("gives subcommand-level profile precedence over global", async () => {
    const program = createProgram();
    const sub = program.command("sub");
    addInheritableOptions(sub);

    let resolved: Record<string, unknown> = {};
    sub.action((_opts: unknown, cmd: Command) => {
      resolved = resolveGlobalOptions(cmd);
    });

    await program.parseAsync(["node", "test", "--profile", "global", "sub", "--profile", "local"]);
    expect(resolved["profile"]).toBe("local");
  });

  it("inherits output default from parent when not set on subcommand", async () => {
    const program = createProgram();
    const sub = program.command("sub");
    addInheritableOptions(sub);

    let resolved: Record<string, unknown> = {};
    sub.action((_opts: unknown, cmd: Command) => {
      resolved = resolveGlobalOptions(cmd);
    });

    await program.parseAsync(["node", "test", "sub"]);
    expect(resolved["output"]).toBe("table");
  });

  it("resolves verbose from subcommand position", async () => {
    const program = createProgram();
    const sub = program.command("sub");
    addInheritableOptions(sub);

    let resolved: Record<string, unknown> = {};
    sub.action((_opts: unknown, cmd: Command) => {
      resolved = resolveGlobalOptions(cmd);
    });

    await program.parseAsync(["node", "test", "sub", "--verbose"]);
    expect(resolved["verbose"]).toBe(true);
  });

  it("resolves debug from subcommand position", async () => {
    const program = createProgram();
    const sub = program.command("sub");
    addInheritableOptions(sub);

    let resolved: Record<string, unknown> = {};
    sub.action((_opts: unknown, cmd: Command) => {
      resolved = resolveGlobalOptions(cmd);
    });

    await program.parseAsync(["node", "test", "sub", "--debug"]);
    expect(resolved["debug"]).toBe(true);
  });

  it("works with deeply nested commands", async () => {
    const program = createProgram();
    const group = program.command("group");
    const sub = group.command("sub");
    addInheritableOptions(sub);

    let resolved: Record<string, unknown> = {};
    sub.action((_opts: unknown, cmd: Command) => {
      resolved = resolveGlobalOptions(cmd);
    });

    await program.parseAsync(["node", "test", "group", "sub", "--profile", "deep"]);
    expect(resolved["profile"]).toBe("deep");
  });
});
