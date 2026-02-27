// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import {
  type HttpClientLogger,
  HttpClient,
  resolveConfig,
  buildApiKeyAuthorization,
} from "@qontoctl/core";
import type { GlobalOptions } from "./options.js";

const PRODUCTION_BASE_URL = "https://thirdparty.qonto.com";
const SANDBOX_BASE_URL =
  "https://thirdparty-sandbox.staging.qonto.co";

/**
 * Create an authenticated HttpClient from global CLI options.
 *
 * Resolves configuration (profile, env), builds the authorization
 * header, and picks the correct base URL (production or sandbox).
 */
export async function createClient(
  options: GlobalOptions,
): Promise<HttpClient> {
  const { config, warnings } = await resolveConfig({
    profile: options.profile,
  });

  for (const warning of warnings) {
    process.stderr.write(`Warning: ${warning}\n`);
  }

  if (config.apiKey === undefined) {
    throw new Error("No API key credentials found in configuration");
  }
  const authorization = buildApiKeyAuthorization(config.apiKey);
  const baseUrl =
    options.sandbox === true ? SANDBOX_BASE_URL : PRODUCTION_BASE_URL;

  let logger: HttpClientLogger | undefined;
  if (options.debug === true) {
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
    baseUrl,
    authorization,
    stagingToken: options.sandbox === true ? authorization : undefined,
    logger,
  });
}
