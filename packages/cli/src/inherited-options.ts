// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { homedir } from "node:os";
import { join, resolve as resolvePath } from "node:path";
import type { Command } from "commander";
import { Option } from "commander";
import { AUTH_PREFERENCES } from "@qontoctl/core";
import type { GlobalOptions } from "./options.js";

/**
 * Adds inheritable global options to a command — currently `--config`, `--profile`,
 * `--verbose`, `--debug`, `--sca-method` (hidden), and `--auth`. These mirror the
 * program-level options so users can specify them after the subcommand.
 */
export function addInheritableOptions(cmd: Command): Command {
  return cmd
    .addOption(
      new Option("--config <path>", "path to configuration file (overrides --profile and QONTOCTL_CONFIG_FILE)"),
    )
    .addOption(new Option("-p, --profile <name>", "configuration profile to use"))
    .addOption(new Option("--verbose", "enable verbose output"))
    .addOption(new Option("--debug", "enable debug output (implies --verbose)"))
    .addOption(new Option("--sca-method <value>", "SCA method preference (advanced; for testing)").hideHelp())
    .addOption(
      new Option(
        "--auth <mode>",
        "authentication precedence: api-key (only), api-key-first, oauth (only), or oauth-first",
      ).choices([...AUTH_PREFERENCES]),
    );
}

/**
 * Adds write operation options (--idempotency-key) to a command.
 */
export function addWriteOptions(cmd: Command): Command {
  return cmd.addOption(new Option("--idempotency-key <key>", "idempotency key (UUID) for the request"));
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
  return chain.reduceRight<Record<string, unknown>>((combined, c) => Object.assign(combined, c.opts()), {}) as T;
}

/**
 * CLI-level config resolver inputs derived from {@link GlobalOptions} — the
 * shape consumed by `@qontoctl/core`'s `resolveConfig({ path, profile })`.
 *
 * Returned object intentionally omits keys instead of setting them to
 * `undefined`, so callers can spread it directly without violating
 * `exactOptionalPropertyTypes`.
 */
export interface ConfigResolveSelection {
  path?: string;
  profile?: string;
}

/**
 * Translates {@link GlobalOptions} into the resolver-input shape and enforces
 * the documented precedence: `--config` > `QONTOCTL_CONFIG_FILE` env > `--profile`
 * derived path > `~/.qontoctl.yaml`.
 *
 * When `--config` is supplied alongside ambient `QONTOCTL_CONFIG_FILE` env
 * or a `--profile` flag, the resolver paths are compared in absolute form:
 * if they disagree, a one-line stderr warning is emitted and `--config` wins
 * for FILE selection. Matching paths produce no warning. This makes the
 * silent-override path visible to users while preserving the conventional
 * CLI > env > profile precedence.
 *
 * **Profile is preserved when supplied alongside `--config`** so that:
 *   - `QONTOCTL_<PROFILE>_*` env-var overrides continue to apply (per README
 *     § Resolution Order — profile controls the env-prefix scope, not just
 *     the file location).
 *   - `isValidProfileName()` runs inside core's resolver, rejecting
 *     malformed profile names early (defense-in-depth — the bad name is
 *     never used to load files because `--config` wins, but the validation
 *     surfaces the typo to the user).
 *
 * The env-var (`QONTOCTL_CONFIG_FILE`) tier is otherwise handled inside core's
 * resolver: when neither `--config` nor `--profile` is supplied, the env var
 * is consulted automatically.
 */
export function buildResolveOptions(
  opts: Pick<GlobalOptions, "config" | "profile">,
  options?: { home?: string; env?: Record<string, string | undefined>; stderr?: NodeJS.WritableStream },
): ConfigResolveSelection {
  const { profile } = opts;
  // Treat `--config ""` (empty string — typically from `--config "$UNSET_VAR"`)
  // as if `--config` were not supplied. Without this guard, `path.resolve("")`
  // returns the CWD, which would silently re-introduce CWD-based config
  // discovery (the exact behavior #479/#480 deliberately removed).
  const config = opts.config !== undefined && opts.config !== "" ? opts.config : undefined;
  if (config === undefined) {
    return profile === undefined ? {} : { profile };
  }
  // `--config` is set. Warn on any silent-override of an ambient source.
  const stream = options?.stderr ?? process.stderr;
  const env = options?.env ?? (process.env as Record<string, string | undefined>);
  const home = options?.home ?? homedir();
  const configResolved = resolvePath(config);

  const envPath = env["QONTOCTL_CONFIG_FILE"];
  if (envPath !== undefined && envPath !== "") {
    const envResolved = resolvePath(envPath);
    if (envResolved !== configResolved) {
      stream.write(
        `warning: --config "${config}" overrides QONTOCTL_CONFIG_FILE="${envPath}" (resolved path differs). ` +
          `To silence: unset QONTOCTL_CONFIG_FILE or omit --config.\n`,
      );
    }
  }

  if (profile !== undefined) {
    const profileDerived = resolvePath(join(home, ".qontoctl", `${profile}.yaml`));
    if (profileDerived !== configResolved) {
      stream.write(
        `warning: --config "${config}" overrides --profile "${profile}" path (resolved path differs from "${profileDerived}"). ` +
          `Profile-scoped env vars (QONTOCTL_${profile.toUpperCase().replaceAll("-", "_")}_*) still apply. ` +
          `To silence: omit --profile or omit --config.\n`,
      );
    }
    // Preserve profile so env overlay continues to use the QONTOCTL_<PROFILE>_*
    // prefix and core's resolver validates the profile name.
    return { path: config, profile };
  }

  return { path: config };
}
