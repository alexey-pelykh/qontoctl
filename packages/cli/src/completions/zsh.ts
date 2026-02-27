// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";

/**
 * Generates a zsh completion script for the given Commander program.
 */
export function generateZshCompletion(program: Command): string {
  const name = program.name();
  const lines: string[] = [];

  lines.push(`#compdef ${name}`);
  lines.push("");
  lines.push(`_${name}() {`);

  // Root-level arguments
  const rootArgSpecs = buildArgumentSpecs(program, true);
  lines.push("  _arguments -s -S \\");
  for (let i = 0; i < rootArgSpecs.length; i++) {
    const trailing = i < rootArgSpecs.length - 1 ? " \\" : "";
    lines.push(`    ${rootArgSpecs[i]}${trailing}`);
  }
  lines.push("");

  // Subcommand dispatch
  const subcommands = program.commands;
  if (subcommands.length > 0) {
    lines.push("  case $state in");
    lines.push("    commands)");
    lines.push("      local -a commands=(");
    for (const cmd of subcommands) {
      const desc = escapeZshDescription(cmd.description());
      lines.push(`        '${cmd.name()}:${desc}'`);
    }
    lines.push("      )");
    lines.push("      _describe 'command' commands");
    lines.push("      ;;");
    lines.push("    args)");
    lines.push("      case $words[1] in");

    for (const cmd of subcommands) {
      const subSubs = cmd.commands;
      const cmdOptSpecs = buildOptionSpecs(cmd, false);

      lines.push(`        ${cmd.name()})`);
      if (subSubs.length > 0) {
        const allSpecs = [...cmdOptSpecs, `'1:subcommand:(${subSubs.map((s) => s.name()).join(" ")})'`];
        lines.push("          _arguments -s -S \\");
        for (let i = 0; i < allSpecs.length; i++) {
          const trailing = i < allSpecs.length - 1 ? " \\" : "";
          lines.push(`            ${allSpecs[i]}${trailing}`);
        }
      } else if (cmdOptSpecs.length > 0) {
        lines.push("          _arguments -s -S \\");
        for (let i = 0; i < cmdOptSpecs.length; i++) {
          const trailing = i < cmdOptSpecs.length - 1 ? " \\" : "";
          lines.push(`            ${cmdOptSpecs[i]}${trailing}`);
        }
      }
      lines.push("          ;;");
    }

    lines.push("      esac");
    lines.push("      ;;");
    lines.push("  esac");
  }

  lines.push("}");
  lines.push("");
  lines.push(`compdef _${name} ${name}`);
  lines.push("");

  return lines.join("\n");
}

function buildOptionSpecs(command: Command, isRoot: boolean): string[] {
  const specs: string[] = [];

  for (const opt of command.options) {
    if (opt.hidden) continue;
    specs.push(formatZshOption(opt));
  }

  // Add --help
  const hasHelp = command.options.some((o) => o.long === "--help");
  if (!hasHelp) {
    specs.push("'(- *)'{-h,--help}'[display help]'");
  }

  // Add --version for root only
  if (isRoot) {
    const hasVersion = command.options.some((o) => o.long === "--version");
    if (!hasVersion) {
      specs.push("'(- *)'{-V,--version}'[display version]'");
    }
  }

  return specs;
}

function buildArgumentSpecs(command: Command, isRoot: boolean): string[] {
  const specs = buildOptionSpecs(command, isRoot);

  // Add subcommand argument if command has subcommands
  if (command.commands.length > 0) {
    specs.push("'1:command:->commands'");
    specs.push("'*::arg:->args'");
  }

  return specs;
}

function formatZshOption(opt: {
  short?: string;
  long?: string;
  description: string;
  required: boolean;
  optional: boolean;
  negate: boolean;
  argChoices?: string[];
}): string {
  const desc = escapeZshDescription(opt.description);
  const takesValue = opt.required || opt.optional;

  let valueSuffix = "";
  if (takesValue) {
    const argName = opt.long ? opt.long.replace(/^--/, "") : "value";
    if (opt.argChoices && opt.argChoices.length > 0) {
      valueSuffix = `:${argName}:(${opt.argChoices.join(" ")})`;
    } else {
      valueSuffix = `:${argName}:`;
    }
  }

  if (opt.short && opt.long) {
    const exclusion = `(${opt.short} ${opt.long})`;
    return `'${exclusion}'` + `{${opt.short},${opt.long}}` + `'[${desc}]${valueSuffix}'`;
  }

  const flag = opt.long ?? opt.short ?? "";
  return `'${flag}[${desc}]${valueSuffix}'`;
}

function escapeZshDescription(desc: string): string {
  return desc
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "'\\''")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/:/g, "\\:");
}
