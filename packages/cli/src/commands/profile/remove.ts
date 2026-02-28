// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { createInterface } from "node:readline/promises";
import type { Command } from "commander";
import { CONFIG_DIR, isValidProfileName, loadConfigFile } from "@qontoctl/core";
import { addInheritableOptions } from "../../inherited-options.js";

/**
 * Register the `profile remove <name>` subcommand.
 */
export function registerRemoveCommand(parent: Command): void {
  const remove = parent.command("remove <name>").description("delete a named profile (with confirmation)");
  addInheritableOptions(remove);
  remove.action(async (name: string) => {
    await removeProfile(name);
  });
}

async function removeProfile(name: string): Promise<void> {
  if (!isValidProfileName(name)) {
    console.error("Invalid profile name: must not contain path separators or '..'.");
    process.exitCode = 1;
    return;
  }

  const { raw } = await loadConfigFile({ profile: name });

  if (raw === undefined) {
    console.error(`Profile "${name}" not found.`);
    process.exitCode = 1;
    return;
  }

  const rl = createInterface({ input: process.stdin, output: process.stderr });

  try {
    const answer = await rl.question(`Remove profile "${name}"? (yes/no): `);

    if (answer.trim().toLowerCase() !== "yes") {
      console.log("Aborted.");
      return;
    }

    const path = join(homedir(), CONFIG_DIR, `${name}.yaml`);
    await unlink(path);

    console.log(`Profile "${name}" removed.`);
  } finally {
    rl.close();
  }
}
