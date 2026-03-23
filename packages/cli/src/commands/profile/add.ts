// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { isCancel, text } from "@clack/prompts";
import { stringify as stringifyYaml } from "yaml";
import type { Command } from "commander";
import { CONFIG_DIR, isValidProfileName, loadConfigFile } from "@qontoctl/core";
import { addInheritableOptions } from "../../inherited-options.js";

/**
 * Register the `profile add <name>` subcommand.
 */
export function registerAddCommand(parent: Command): void {
  const add = parent.command("add <name>").description("create a new profile interactively");
  addInheritableOptions(add);
  add.action(async (name: string) => {
    await addProfile(name);
  });
}

async function addProfile(name: string): Promise<void> {
  if (!isValidProfileName(name)) {
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

  const organizationSlug = await text({
    message: "Organization slug",
    validate: (value) => {
      if (!value || value.trim() === "") return "Organization slug cannot be empty.";
    },
  });
  if (isCancel(organizationSlug)) {
    process.exit(0);
  }

  const secretKey = await text({
    message: "Secret key",
    validate: (value) => {
      if (!value || value.trim() === "") return "Secret key cannot be empty.";
    },
  });
  if (isCancel(secretKey)) {
    process.exit(0);
  }

  const config = {
    "api-key": {
      "organization-slug": organizationSlug.trim(),
      "secret-key": secretKey.trim(),
    },
  };

  const dir = join(homedir(), CONFIG_DIR);
  await mkdir(dir, { recursive: true, mode: 0o700 });

  const path = join(dir, `${name}.yaml`);
  await writeFile(path, stringifyYaml(config), { encoding: "utf-8", mode: 0o600 });

  console.log(`Profile "${name}" created at ${path}`);
}
