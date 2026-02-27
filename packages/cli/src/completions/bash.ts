// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";

/**
 * Generates a bash completion script for the given Commander program.
 */
export function generateBashCompletion(program: Command): string {
  const name = program.name();
  const lines: string[] = [];

  lines.push(`# bash completion for ${name}`);
  lines.push("");
  lines.push(`_${name}() {`);
  lines.push("  COMPREPLY=()");
  lines.push('  local cur="${COMP_WORDS[COMP_CWORD]}"');
  lines.push('  local prev="${COMP_WORDS[COMP_CWORD-1]}"');
  lines.push("");

  // Complete option values based on previous word
  const optionChoices = collectOptionChoices(program);
  if (optionChoices.length > 0) {
    lines.push('  case "$prev" in');
    for (const { flags, choices } of optionChoices) {
      lines.push(`    ${flags.join("|")})`);
      lines.push(`      COMPREPLY=($(compgen -W "${choices.join(" ")}" -- "$cur"))`);
      lines.push("      return");
      lines.push("      ;;");
    }
    lines.push("  esac");
    lines.push("");
  }

  // Determine command context by scanning COMP_WORDS
  const valueTakingFlags = collectValueTakingFlags(program);
  lines.push('  local cmd="" subcmd=""');
  lines.push("  local skip_next=false");
  lines.push("  for ((i=1; i < COMP_CWORD; i++)); do");
  lines.push("    if $skip_next; then");
  lines.push("      skip_next=false");
  lines.push("      continue");
  lines.push("    fi");
  lines.push('    case "${COMP_WORDS[i]}" in');
  if (valueTakingFlags.length > 0) {
    lines.push(`      ${valueTakingFlags.join("|")})`);
    lines.push("        skip_next=true");
    lines.push("        ;;");
  }
  lines.push("      -*)");
  lines.push("        ;;");
  lines.push("      *)");
  lines.push('        if [[ -z "$cmd" ]]; then');
  lines.push('          cmd="${COMP_WORDS[i]}"');
  lines.push('        elif [[ -z "$subcmd" ]]; then');
  lines.push('          subcmd="${COMP_WORDS[i]}"');
  lines.push("        fi");
  lines.push("        ;;");
  lines.push("    esac");
  lines.push("  done");
  lines.push("");

  // Root-level completions
  const rootCmds = program.commands.map((c) => c.name());
  const rootFlags = collectFlags(program, true);

  lines.push('  if [[ -z "$cmd" ]]; then');
  lines.push('    if [[ "$cur" == -* ]]; then');
  lines.push(`      COMPREPLY=($(compgen -W "${rootFlags.join(" ")}" -- "$cur"))`);
  lines.push("    else");
  lines.push(`      COMPREPLY=($(compgen -W "${rootCmds.join(" ")}" -- "$cur"))`);
  lines.push("    fi");
  lines.push("    return");
  lines.push("  fi");
  lines.push("");

  // Per-subcommand completions
  if (program.commands.length > 0) {
    lines.push('  case "$cmd" in');
    for (const cmd of program.commands) {
      const subCmds = cmd.commands.map((c) => c.name());
      const cmdFlags = collectFlags(cmd, false);

      lines.push(`    ${cmd.name()})`);
      if (subCmds.length > 0) {
        lines.push('      if [[ -z "$subcmd" ]]; then');
        if (cmdFlags.length > 0) {
          lines.push('        if [[ "$cur" == -* ]]; then');
          lines.push("          COMPREPLY=" + `($(compgen -W "${cmdFlags.join(" ")}" -- "$cur"))`);
          lines.push("        else");
          lines.push("          COMPREPLY=" + `($(compgen -W "${subCmds.join(" ")}" -- "$cur"))`);
          lines.push("        fi");
        } else {
          lines.push("        COMPREPLY=" + `($(compgen -W "${subCmds.join(" ")}" -- "$cur"))`);
        }
        lines.push("      fi");
      } else if (cmdFlags.length > 0) {
        lines.push('      if [[ "$cur" == -* ]]; then');
        lines.push("        COMPREPLY=" + `($(compgen -W "${cmdFlags.join(" ")}" -- "$cur"))`);
        lines.push("      fi");
      }
      lines.push("      ;;");
    }
    lines.push("  esac");
  }

  lines.push("}");
  lines.push("");
  lines.push(`complete -o default -F _${name} ${name}`);
  lines.push("");

  return lines.join("\n");
}

function collectFlags(command: Command, includeVersion: boolean): string[] {
  const flags: string[] = [];
  for (const opt of command.options) {
    if (opt.hidden) continue;
    if (opt.long) flags.push(opt.long);
    if (opt.short) flags.push(opt.short);
  }
  if (!flags.includes("--help")) {
    flags.push("--help");
    flags.push("-h");
  }
  if (includeVersion && !flags.includes("--version")) {
    flags.push("--version");
    flags.push("-V");
  }
  return flags;
}

function collectValueTakingFlags(root: Command): string[] {
  const flags: string[] = [];
  const seen = new Set<string>();

  function walk(cmd: Command): void {
    for (const opt of cmd.options) {
      if (opt.required || opt.optional) {
        for (const flag of [opt.long, opt.short]) {
          if (flag && !seen.has(flag)) {
            flags.push(flag);
            seen.add(flag);
          }
        }
      }
    }
    for (const sub of cmd.commands) {
      walk(sub);
    }
  }

  walk(root);
  return flags;
}

function collectOptionChoices(root: Command): Array<{ flags: string[]; choices: string[] }> {
  const result: Array<{ flags: string[]; choices: string[] }> = [];
  const seen = new Set<string>();

  function walk(cmd: Command): void {
    for (const opt of cmd.options) {
      if (opt.argChoices && opt.argChoices.length > 0) {
        const key = opt.long ?? opt.short ?? "";
        if (!seen.has(key)) {
          const flags: string[] = [];
          if (opt.long) flags.push(opt.long);
          if (opt.short) flags.push(opt.short);
          result.push({ flags, choices: [...opt.argChoices] });
          seen.add(key);
        }
      }
    }
    for (const sub of cmd.commands) {
      walk(sub);
    }
  }

  walk(root);
  return result;
}
