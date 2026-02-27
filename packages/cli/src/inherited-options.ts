// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { Option } from "commander";

/**
 * Adds inheritable global options (--profile, --verbose, --debug) to a command.
 * These mirror the program-level options so users can specify them after the subcommand.
 */
export function addInheritableOptions(cmd: Command): Command {
  return cmd
    .addOption(new Option("-p, --profile <name>", "configuration profile to use"))
    .addOption(new Option("--verbose", "enable verbose output"))
    .addOption(new Option("--debug", "enable debug output (implies --verbose)"));
}

/**
 * Resolve global options from a command, giving child (subcommand) precedence over parent.
 *
 * Walks the command ancestor chain from root to leaf, merging options at each level.
 * Later (child) values overwrite earlier (parent) values, so specifying `--profile`
 * on the subcommand takes precedence over the global position.
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- mirrors Commander's optsWithGlobals<T>() pattern
export function resolveGlobalOptions<T>(cmd: Command): T {
  const chain: Command[] = [];
  for (let current: Command | null = cmd; current; current = current.parent) {
    chain.push(current);
  }
  // reduceRight processes [this, parent, root] as root → parent → this,
  // so leaf options overwrite parent options via Object.assign.
  return chain.reduceRight<Record<string, unknown>>(
    (combined, c) => Object.assign(combined, c.opts()),
    {},
  ) as T;
}
