// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { createInterface } from "node:readline/promises";
import { stringify as stringifyYaml } from "yaml";
import type { Command } from "commander";
import { loadConfigFile } from "@qontoctl/core";

const CONFIG_DIR = ".qontoctl";

/**
 * Register the `profile add <name>` subcommand.
 */
export function registerAddCommand(parent: Command): void {
  parent
    .command("add <name>")
    .description("create a new profile interactively")
    .action(async (name: string) => {
      await addProfile(name);
    });
}

async function addProfile(name: string): Promise<void> {
  if (/[/\\]/.test(name) || name.includes("..")) {
    console.error("Invalid profile name: must not contain path separators or '..'.");
    process.exitCode = 1;
    return;
  }

  // Check if profile already exists
  const { raw } = await loadConfigFile({ profile: name });
  if (raw !== undefined) {
    console.error(`Profile "${name}" already exists. Remove it first to recreate.`);
    process.exitCode = 1;
    return;
  }

  const rl = createInterface({ input: process.stdin, output: process.stderr });

  try {
    const organizationSlug = await rl.question("Organization slug: ");
    const secretKey = await rl.question("Secret key: ");

    if (organizationSlug.trim() === "") {
      console.error("Organization slug cannot be empty.");
      process.exitCode = 1;
      return;
    }

    if (secretKey.trim() === "") {
      console.error("Secret key cannot be empty.");
      process.exitCode = 1;
      return;
    }

    const config = {
      "api-key": {
        organization_slug: organizationSlug.trim(),
        secret_key: secretKey.trim(),
      },
    };

    const dir = join(homedir(), CONFIG_DIR);
    await mkdir(dir, { recursive: true });

    const path = join(dir, `${name}.yaml`);
    await writeFile(path, stringifyYaml(config), "utf-8");

    console.log(`Profile "${name}" created at ${path}`);
  } finally {
    rl.close();
  }
}
