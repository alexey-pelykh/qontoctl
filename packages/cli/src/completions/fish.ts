// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";

/**
 * Generates a fish completion script for the given Commander program.
 */
export function generateFishCompletion(program: Command): string {
  const name = program.name();
  const lines: string[] = [];

  lines.push(`# fish completion for ${name}`);
  lines.push("");

  // Disable file completions by default
  lines.push(`complete -c ${name} -f`);
  lines.push("");

  // Global options
  lines.push("# Global options");
  for (const opt of program.options) {
    if (opt.hidden) continue;
    lines.push(formatFishOption(name, opt));
  }

  // Always add --help and --version if not present
  const hasHelp = program.options.some(
    (o) => o.long === "--help",
  );
  if (!hasHelp) {
    lines.push(
      `complete -c ${name} -s h -l help -d '${escapeFishString("display help")}'`,
    );
  }

  const hasVersion = program.options.some(
    (o) => o.long === "--version",
  );
  if (!hasVersion) {
    lines.push(
      `complete -c ${name} -s V -l version -d '${escapeFishString("display version")}'`,
    );
  }
  lines.push("");

  // Top-level commands
  if (program.commands.length > 0) {
    lines.push("# Commands");
    for (const cmd of program.commands) {
      const desc = escapeFishString(cmd.description());
      lines.push(
        `complete -c ${name}` +
          ` -n '__fish_use_subcommand'` +
          ` -a ${cmd.name()}` +
          ` -d '${desc}'`,
      );
    }
    lines.push("");

    // Subcommand-specific completions
    for (const cmd of program.commands) {
      const subCmds = cmd.commands;
      const cmdOpts = cmd.options.filter((o) => !o.hidden);

      if (subCmds.length === 0 && cmdOpts.length === 0) {
        continue;
      }

      lines.push(`# ${cmd.name()} subcommands`);

      for (const sub of subCmds) {
        const desc = escapeFishString(sub.description());
        lines.push(
          `complete -c ${name}` +
            ` -n '__fish_seen_subcommand_from ${cmd.name()}'` +
            ` -a ${sub.name()}` +
            ` -d '${desc}'`,
        );
      }

      for (const opt of cmdOpts) {
        lines.push(
          formatFishOption(
            name,
            opt,
            `__fish_seen_subcommand_from ${cmd.name()}`,
          ),
        );
      }

      lines.push("");
    }
  }

  return lines.join("\n");
}

function formatFishOption(
  name: string,
  opt: {
    short?: string;
    long?: string;
    description: string;
    required: boolean;
    optional: boolean;
    negate: boolean;
    argChoices?: string[];
  },
  condition?: string,
): string {
  const parts = [`complete -c ${name}`];

  if (condition) {
    parts.push(`-n '${condition}'`);
  }

  if (opt.short) {
    parts.push(`-s ${opt.short.replace(/^-/, "")}`);
  }
  if (opt.long) {
    parts.push(`-l ${opt.long.replace(/^--/, "")}`);
  }

  const desc = escapeFishString(opt.description);
  parts.push(`-d '${desc}'`);

  if (opt.required || opt.optional) {
    parts.push("-r");
    if (opt.argChoices && opt.argChoices.length > 0) {
      parts.push(`-a '${opt.argChoices.join(" ")}'`);
    }
  }

  return parts.join(" ");
}

function escapeFishString(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
