// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import type { Command } from "commander";
import { formatOutput } from "../../formatters/index.js";
import { addInheritableOptions, resolveGlobalOptions } from "../../inherited-options.js";
import type { GlobalOptions } from "../../options.js";

const CONFIG_DIR = ".qontoctl";
const YAML_EXT = ".yaml";

/**
 * Register the `profile list` subcommand.
 */
export function registerListCommand(parent: Command): void {
  const list = parent.command("list").description("list named profiles from ~/.qontoctl/");
  addInheritableOptions(list);
  list.action(async (_options: unknown, cmd: Command) => {
    const globalOpts = resolveGlobalOptions<GlobalOptions>(cmd);
    await listProfiles(globalOpts);
  });
}

async function listProfiles(options: GlobalOptions): Promise<void> {
  const dir = join(homedir(), CONFIG_DIR);

  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (error: unknown) {
    if (isNodeError(error) && error.code === "ENOENT") {
      entries = [];
    } else {
      throw error;
    }
  }

  const profiles = entries
    .filter((name) => name.endsWith(YAML_EXT))
    .map((name) => name.slice(0, -YAML_EXT.length))
    .sort()
    .map((name) => ({ name }));

  if (profiles.length === 0) {
    console.log("No profiles found.");
    return;
  }

  console.log(formatOutput(profiles, options.output));
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
