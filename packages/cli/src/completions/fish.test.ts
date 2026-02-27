// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { Command, Option } from "commander";
import { describe, expect, it } from "vitest";

import { generateFishCompletion } from "./fish.js";

function createTestProgram(): Command {
  const program = new Command();
  program.name("testcli").version("1.0.0");
  program.addOption(
    new Option("-o, --output <format>", "output format")
      .choices(["json", "table"])
      .default("table"),
  );
  program.addOption(
    new Option("--verbose", "enable verbose output"),
  );

  const list = program
    .command("list")
    .description("list items");
  list.command("all").description("list all items");
  list.command("recent").description("list recent items");

  return program;
}

describe("generateFishCompletion", () => {
  it("starts with a comment header", () => {
    const program = createTestProgram();
    const script = generateFishCompletion(program);
    expect(script).toMatch(/^# fish completion for testcli/);
  });

  it("disables file completions", () => {
    const program = createTestProgram();
    const script = generateFishCompletion(program);
    expect(script).toContain("complete -c testcli -f");
  });

  it("includes global options with short and long flags", () => {
    const program = createTestProgram();
    const script = generateFishCompletion(program);
    expect(script).toContain("-s o -l output");
  });

  it("includes option choices with -a flag", () => {
    const program = createTestProgram();
    const script = generateFishCompletion(program);
    expect(script).toContain("-a 'json table'");
  });

  it("marks value-taking options with -r", () => {
    const program = createTestProgram();
    const script = generateFishCompletion(program);
    expect(script).toMatch(/-l output.*-r/);
  });

  it("includes boolean options without -r", () => {
    const program = createTestProgram();
    const script = generateFishCompletion(program);
    const verboseLine = script
      .split("\n")
      .find((l) => l.includes("-l verbose"));
    expect(verboseLine).toBeDefined();
    expect(verboseLine).not.toContain("-r");
  });

  it("includes --help and --version", () => {
    const program = createTestProgram();
    const script = generateFishCompletion(program);
    expect(script).toContain("-l help");
    expect(script).toContain("-l version");
  });

  it("lists top-level commands with __fish_use_subcommand", () => {
    const program = createTestProgram();
    const script = generateFishCompletion(program);
    expect(script).toContain(
      "__fish_use_subcommand' -a list",
    );
  });

  it("lists subcommands with __fish_seen_subcommand_from", () => {
    const program = createTestProgram();
    const script = generateFishCompletion(program);
    expect(script).toContain(
      "__fish_seen_subcommand_from list' -a all",
    );
    expect(script).toContain(
      "__fish_seen_subcommand_from list' -a recent",
    );
  });

  it("includes descriptions for commands", () => {
    const program = createTestProgram();
    const script = generateFishCompletion(program);
    expect(script).toContain("-d 'list items'");
    expect(script).toContain("-d 'list all items'");
  });

  it("escapes single quotes in descriptions", () => {
    const program = new Command();
    program.name("testcli");
    program.addOption(
      new Option("--test", "it's a test"),
    );
    const script = generateFishCompletion(program);
    expect(script).toContain("it\\'s a test");
  });
});
