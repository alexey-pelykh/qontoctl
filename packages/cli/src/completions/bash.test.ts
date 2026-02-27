// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { Command, Option } from "commander";
import { describe, expect, it } from "vitest";

import { generateBashCompletion } from "./bash.js";

function createTestProgram(): Command {
  const program = new Command();
  program.name("testcli").version("1.0.0");
  program.addOption(new Option("-o, --output <format>", "output format").choices(["json", "table"]).default("table"));
  program.addOption(new Option("--verbose", "enable verbose output"));

  const list = program.command("list").description("list items");
  list.command("all").description("list all items");
  list.command("recent").description("list recent items");

  return program;
}

describe("generateBashCompletion", () => {
  it("starts with a comment header", () => {
    const program = createTestProgram();
    const script = generateBashCompletion(program);
    expect(script).toMatch(/^# bash completion for testcli/);
  });

  it("defines the completion function", () => {
    const program = createTestProgram();
    const script = generateBashCompletion(program);
    expect(script).toContain("_testcli()");
  });

  it("registers with the complete builtin", () => {
    const program = createTestProgram();
    const script = generateBashCompletion(program);
    expect(script).toContain("complete -o default -F _testcli testcli");
  });

  it("includes top-level commands", () => {
    const program = createTestProgram();
    const script = generateBashCompletion(program);
    expect(script).toContain("list");
  });

  it("includes global option flags", () => {
    const program = createTestProgram();
    const script = generateBashCompletion(program);
    expect(script).toContain("--output");
    expect(script).toContain("-o");
    expect(script).toContain("--verbose");
  });

  it("includes --help and --version flags", () => {
    const program = createTestProgram();
    const script = generateBashCompletion(program);
    expect(script).toContain("--help");
    expect(script).toContain("-h");
    expect(script).toContain("--version");
    expect(script).toContain("-V");
  });

  it("completes option choices for --output", () => {
    const program = createTestProgram();
    const script = generateBashCompletion(program);
    expect(script).toContain('compgen -W "json table" -- "$cur"');
  });

  it("includes subcommands for list command", () => {
    const program = createTestProgram();
    const script = generateBashCompletion(program);
    expect(script).toContain("all");
    expect(script).toContain("recent");
  });

  it("tracks value-taking options to skip their args", () => {
    const program = createTestProgram();
    const script = generateBashCompletion(program);
    expect(script).toContain("--output|-o)");
    expect(script).toContain("skip_next=true");
  });

  it("generates valid bash syntax", () => {
    const program = createTestProgram();
    const script = generateBashCompletion(program);
    // Basic structural checks
    expect(script).toContain("COMPREPLY=()");
    expect(script).toContain("COMP_WORDS[COMP_CWORD]");
    expect(script).toContain("case");
    expect(script).toContain("esac");
  });
});
