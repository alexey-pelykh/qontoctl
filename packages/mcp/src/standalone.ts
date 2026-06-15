// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import {
  HttpClient,
  buildApiKeyAuthorization,
  createOAuthAuthorization,
  resolveConfig,
  resolveScaMethod,
  resolveAuthPreference,
  selectAuthChain,
  OAUTH_TOKEN_URL,
  OAUTH_TOKEN_SANDBOX_URL,
  type Authorization,
  type AuthSlot,
} from "@qontoctl/core";
import { buildMcpResolveOptions } from "./config.js";
import type { CreateServerOptions } from "./server.js";

/**
 * Assemble the {@link CreateServerOptions} for the standalone `qontoctl-mcp`
 * binary: the data-tool `getClient` factory **and** the `resolveOptions`
 * threaded into the `diagnose` tool.
 *
 * Both derive from a single config selection captured once here —
 * `buildMcpResolveOptions(env)`. Capturing `QONTOCTL_CONFIG_FILE` at startup
 * (the env var is the only file-selection mechanism for this binary; no CLI
 * flags exist) mirrors the CLI's `--config` codepath (`resolveConfig({ path })`)
 * and freezes the resolution destination — later `process.env` mutations cannot
 * redirect subsequent loads.
 *
 * **Why `resolveOptions` is threaded (#661, sibling of #658).** Without it,
 * `createServer` ran `registerDiagnoseTools(server, undefined)`, so `diagnose`
 * re-derived its config selection via `buildMcpResolveOptions()` *fresh on
 * every call* while the data-tool `getClient` used the frozen capture — the two
 * could resolve different files if `QONTOCTL_CONFIG_FILE` was mutated after
 * startup. Threading the one frozen `mcpResolveOptions` into `diagnose` puts it
 * in lockstep with the data tools. (The umbrella `qontoctl mcp` entry threads
 * its own launch options the same way — `packages/qontoctl/src/cli.ts` — which
 * is the #658 fix; this is the standalone-entry sibling.)
 *
 * **Unset-at-startup case (the deliberate AC decision).** When
 * `QONTOCTL_CONFIG_FILE` is unset at startup, `mcpResolveOptions` is `undefined`
 * and `resolveOptions` is intentionally *omitted*, leaving `diagnose`'s
 * `resolveOptions ?? buildMcpResolveOptions()` fallback to read `process.env`
 * live. This is correct — NOT a gap — because `getClient` is *also* not frozen
 * in this case: `resolveConfig(undefined)` itself live-reads
 * `QONTOCTL_CONFIG_FILE` via core's `path > QONTOCTL_CONFIG_FILE > profile >
 * home` precedence. So both sides live-read together and stay in lockstep. A
 * sentinel that force-froze `diagnose` to the home default here would *break*
 * lockstep (diagnose pinned while `getClient` kept live-reading), so the
 * fallback is kept by design. The freeze is real only when the env var is set
 * at startup (then `path` beats env in core's precedence) — and in that case
 * the frozen `{ path }` is threaded, so both sides are pinned identically.
 *
 * @param env - Override the env source (testing). Defaults to `process.env`.
 *   Affects only the captured `mcpResolveOptions`; the `getClient` factory
 *   resolves through that captured value (and core's own `process.env` overlay)
 *   exactly as in production.
 */
export function buildStandaloneServerOptions(env?: Record<string, string | undefined>): CreateServerOptions {
  const mcpResolveOptions = buildMcpResolveOptions(env);

  const getClient = async (): Promise<HttpClient> => {
    const { config, endpoint, path, oauthAccessTokenFromEnv } = await resolveConfig(mcpResolveOptions);

    // No CLI flag in MCP — auth preference comes from env > config > default.
    // resolveAuthPreference handles the env-overlaid config field.
    const preference = resolveAuthPreference(config);
    const selection = selectAuthChain(preference, {
      apiKey: config.apiKey !== undefined,
      oauth: config.oauth !== undefined,
    });

    if (selection.noCredentials) {
      throw new Error("No credentials found in configuration");
    }

    if (selection.warning !== undefined) {
      process.stderr.write(`Warning: ${selection.warning}\n`);
    }

    const oauthFactory = (): Authorization => {
      if (config.oauth === undefined) {
        throw new Error("Internal error: OAuth slot selected but no OAuth credentials available");
      }
      return createOAuthAuthorization({
        oauth: config.oauth,
        tokenUrl: config.oauth.stagingToken !== undefined ? OAUTH_TOKEN_SANDBOX_URL : OAUTH_TOKEN_URL,
        ...(path !== undefined ? { path } : {}),
        readOnly: oauthAccessTokenFromEnv,
      });
    };

    const apiKeyFactory = (): Authorization => {
      if (config.apiKey === undefined) {
        throw new Error("Internal error: api-key slot selected but no api-key credentials available");
      }
      return buildApiKeyAuthorization(config.apiKey);
    };

    const buildSlot = (slot: AuthSlot): Authorization | undefined => {
      if (slot === "oauth") return oauthFactory();
      if (slot === "api-key") return apiKeyFactory();
      return undefined;
    };

    const authorization = buildSlot(selection.primary);
    if (authorization === undefined) {
      throw new Error("Internal error: auth chain has no primary credential");
    }
    const fallbackAuthorization = buildSlot(selection.fallback);

    // SCA method is resolved from env/config only — never as a tool input —
    // so an LLM client cannot pick the SCA method, only an operator can.
    const scaMethod = resolveScaMethod(config);

    return new HttpClient({
      baseUrl: endpoint,
      authorization,
      fallbackAuthorization,
      onFallback: (method, p) => {
        const label = selection.fallback === "oauth" ? "OAuth" : "api-key";
        process.stderr.write(`Warning: primary authentication failed, falling back to ${label} for ${method} ${p}\n`);
      },
      stagingToken: config.oauth?.stagingToken,
      ...(scaMethod !== undefined ? { scaMethod } : {}),
    });
  };

  return {
    getClient,
    // Thread the one startup-frozen selection into `diagnose` so it resolves in
    // lockstep with `getClient` above. Omitted when unset at startup (both sides
    // then live-read — see the doc comment's unset-at-startup rationale) (#661).
    ...(mcpResolveOptions !== undefined ? { resolveOptions: mcpResolveOptions } : {}),
  };
}
