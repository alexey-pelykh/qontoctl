// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";

import { generateBashCompletion } from "./bash.js";
import { generateFishCompletion } from "./fish.js";
import { generateZshCompletion } from "./zsh.js";

/**
 * Registers the `completion` command with bash, zsh, and fish
 * subcommands on the given Commander program.
 */
export function registerCompletionCommand(
  program: Command,
): void {
  const completion = program
    .command("completion")
    .description("generate shell completion scripts");

  completion
    .command("bash")
    .description("generate bash completion script")
    .action(() => {
      process.stdout.write(generateBashCompletion(program));
    });

  completion
    .command("zsh")
    .description("generate zsh completion script")
    .action(() => {
      process.stdout.write(generateZshCompletion(program));
    });

  completion
    .command("fish")
    .description("generate fish completion script")
    .action(() => {
      process.stdout.write(generateFishCompletion(program));
    });
}
