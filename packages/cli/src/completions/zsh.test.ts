// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { Command, Option } from "commander";
import { describe, expect, it } from "vitest";

import { generateZshCompletion } from "./zsh.js";

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

describe("generateZshCompletion", () => {
  it("starts with #compdef directive", () => {
    const program = createTestProgram();
    const script = generateZshCompletion(program);
    expect(script).toMatch(/^#compdef testcli/);
  });

  it("defines the completion function", () => {
    const program = createTestProgram();
    const script = generateZshCompletion(program);
    expect(script).toContain("_testcli()");
  });

  it("registers with compdef", () => {
    const program = createTestProgram();
    const script = generateZshCompletion(program);
    expect(script).toContain("compdef _testcli testcli");
  });

  it("includes option specs with _arguments", () => {
    const program = createTestProgram();
    const script = generateZshCompletion(program);
    expect(script).toContain("_arguments -s -S");
  });

  it("formats options with short and long flags", () => {
    const program = createTestProgram();
    const script = generateZshCompletion(program);
    expect(script).toContain("{-o,--output}");
  });

  it("includes option choices in parentheses", () => {
    const program = createTestProgram();
    const script = generateZshCompletion(program);
    expect(script).toContain(":output:(json table)");
  });

  it("includes boolean options without value spec", () => {
    const program = createTestProgram();
    const script = generateZshCompletion(program);
    expect(script).toContain("'--verbose[enable verbose output]'");
  });

  it("includes --help and --version specs", () => {
    const program = createTestProgram();
    const script = generateZshCompletion(program);
    expect(script).toContain("--help");
    expect(script).toContain("-h");
    expect(script).toContain("--version");
    expect(script).toContain("-V");
  });

  it("lists commands with _describe", () => {
    const program = createTestProgram();
    const script = generateZshCompletion(program);
    expect(script).toContain("_describe 'command' commands");
    expect(script).toContain("'list:list items'");
  });

  it("includes subcommand completions", () => {
    const program = createTestProgram();
    const script = generateZshCompletion(program);
    expect(script).toContain("1:subcommand:(all recent)");
  });

  it("escapes special characters in descriptions", () => {
    const program = new Command();
    program.name("testcli");
    program.addOption(new Option("--test", "uses [brackets] and: colons"));
    const script = generateZshCompletion(program);
    expect(script).toContain("\\[brackets\\]");
    expect(script).toContain("and\\: colons");
  });
});
