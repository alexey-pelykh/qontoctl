// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { type HttpClientLogger, HttpClient, resolveConfig, buildApiKeyAuthorization } from "@qontoctl/core";
import type { GlobalOptions } from "./options.js";

/**
 * Create an authenticated HttpClient from global CLI options.
 *
 * Resolves configuration (profile, env), builds the authorization
 * header, and uses the resolved endpoint.
 */
export async function createClient(options: GlobalOptions): Promise<HttpClient> {
  const { config, endpoint, warnings } = await resolveConfig({
    profile: options.profile,
  });

  for (const warning of warnings) {
    process.stderr.write(`Warning: ${warning}\n`);
  }

  if (config.apiKey === undefined) {
    throw new Error("No API key credentials found in configuration");
  }
  const authorization = buildApiKeyAuthorization(config.apiKey);

  let logger: HttpClientLogger | undefined;
  if (options.debug === true) {
    process.stderr.write(
      "Warning: Debug mode logs full API responses which may include financial data (IBANs, balances). " +
        "Do not use in shared environments.\n",
    );
    logger = {
      verbose: (msg) => process.stderr.write(`${msg}\n`),
      debug: (msg) => process.stderr.write(`${msg}\n`),
    };
  } else if (options.verbose === true) {
    logger = {
      verbose: (msg) => process.stderr.write(`${msg}\n`),
      debug: () => {},
    };
  }

  return new HttpClient({
    baseUrl: endpoint,
    authorization,
    logger,
  });
}
