// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { DiagnosticCheck, DiagnosticResult } from "../types.js";

/**
 * Reports which config file (if any) was loaded and the active profile.
 *
 * Always reports `ok` — the runner only reaches this check when the
 * config has already been resolved successfully (a fatal config error
 * exits the CLI with code 10 before diagnose runs). The check exists
 * so the report explicitly records the source of the configuration.
 *
 * Marked `cascadeOnFail` defensively so future runner invocations that
 * pre-detect a config-load failure (e.g., a future `runDiagnose` mode
 * that accepts a load error) still cascade.
 */
export const configResolutionCheck: DiagnosticCheck = {
  id: "config.resolution",
  name: "Configuration resolution",
  kind: "static",
  requiresAuth: "none",
  requiresStagingToken: false,
  cascadeOnFail: true,
  redactionFields: ["config_path", "profile", "source"],
  run: (ctx): Promise<DiagnosticResult> => {
    const source = ctx.configPath !== undefined ? "file" : "env";
    const detail =
      ctx.configPath !== undefined
        ? `loaded from ${ctx.configPath}`
        : "loaded from environment variables (no config file)";
    return Promise.resolve({
      checkId: "config.resolution",
      status: "ok",
      detail,
      suggestedAction: null,
      evidence: {
        ...(ctx.configPath !== undefined ? { config_path: ctx.configPath } : {}),
        profile: ctx.profile,
        source,
      },
    });
  },
};
