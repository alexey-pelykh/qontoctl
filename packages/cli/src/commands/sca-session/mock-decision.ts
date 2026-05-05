// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { mockScaDecision, resolveConfig } from "@qontoctl/core";
import { createClient } from "../../client.js";
import { formatOutput } from "../../formatters/index.js";
import { addInheritableOptions, resolveGlobalOptions } from "../../inherited-options.js";
import type { GlobalOptions } from "../../options.js";

const VALID_DECISIONS = ["allow", "deny"] as const;
type ScaMockDecision = (typeof VALID_DECISIONS)[number];

function isScaMockDecision(value: string): value is ScaMockDecision {
  return (VALID_DECISIONS as readonly string[]).includes(value);
}

export function registerScaSessionMockDecisionCommand(parent: Command): void {
  const cmd = parent
    .command("mock-decision <token> <decision>")
    .description("Simulate an SCA decision (sandbox only)")
    .addHelpText(
      "after",
      "\nDecision must be one of: allow, deny.\n" +
        "Only available in the sandbox environment. Configure a staging token via\n" +
        "`oauth.staging-token` in your config or the `QONTOCTL_STAGING_TOKEN` env var.",
    );
  addInheritableOptions(cmd);
  cmd.action(async (token: string, decision: string, _opts: unknown, action: Command) => {
    if (!isScaMockDecision(decision)) {
      throw new Error(`Invalid decision "${decision}". Must be one of: ${VALID_DECISIONS.join(", ")}.`);
    }

    const opts = resolveGlobalOptions<GlobalOptions>(action);

    const { config } = await resolveConfig({ profile: opts.profile });
    if (config.oauth?.stagingToken === undefined) {
      throw new Error(
        "sca-session mock-decision is only available in the sandbox environment. " +
          "Configure `oauth.staging-token` in your config or set `QONTOCTL_STAGING_TOKEN`.",
      );
    }

    const client = await createClient(opts);
    await mockScaDecision(client, token, decision);

    if (opts.output === "json" || opts.output === "yaml") {
      process.stdout.write(formatOutput({ token, decision, applied: true }, opts.output) + "\n");
    } else {
      process.stdout.write(`SCA mock decision "${decision}" applied to session ${token}.\n`);
    }
  });
}
