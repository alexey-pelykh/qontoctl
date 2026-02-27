// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import {
  type HttpClientLogger,
  HttpClient,
  resolveConfig,
  buildApiKeyAuthorization,
  ConfigError,
  AuthError,
  QontoApiError,
  QontoRateLimitError,
} from "@qontoctl/core";
import { addInheritableOptions, resolveGlobalOptions } from "../../inherited-options.js";
import type { GlobalOptions } from "../../options.js";

interface OrganizationResponse {
  readonly organization: {
    readonly name: string;
    readonly slug: string;
  };
}

/**
 * Register the `profile test` subcommand.
 */
export function registerTestCommand(parent: Command): void {
  const test = parent.command("test").description("test credentials via GET /v2/organization");
  addInheritableOptions(test);
  test.action(async (_options: unknown, cmd: Command) => {
      const globalOpts = resolveGlobalOptions<GlobalOptions>(cmd);
      await testProfile(globalOpts);
    });
}

async function testProfile(options: GlobalOptions): Promise<void> {
  let logger: HttpClientLogger | undefined;
  if (options.debug === true) {
    console.error(
      "Warning: Debug mode logs full API responses which may include financial data (IBANs, balances). " +
        "Do not use in shared environments.",
    );
    logger = {
      verbose: (msg: string) => {
        console.error(`[verbose] ${msg}`);
      },
      debug: (msg: string) => {
        console.error(`[debug] ${msg}`);
      },
    };
  } else if (options.verbose === true) {
    logger = {
      verbose: (msg: string) => {
        console.error(`[verbose] ${msg}`);
      },
      debug: () => {},
    };
  }

  try {
    const { config, endpoint } = await resolveConfig({ profile: options.profile });

    if (config.apiKey === undefined) {
      console.error("Configuration error: no credentials found.");
      process.exitCode = 1;
      return;
    }

    const authorization = buildApiKeyAuthorization(config.apiKey);

    const client = new HttpClient({
      baseUrl: endpoint,
      authorization,
      logger,
    });

    const response = await client.get<OrganizationResponse>("/v2/organization");
    const { name, slug } = response.organization;
    console.log(`Success: connected to organization "${name}" (${slug})`);
  } catch (error: unknown) {
    if (error instanceof ConfigError) {
      console.error(`Configuration error: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    if (error instanceof AuthError) {
      console.error(`Authentication failed: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    if (error instanceof QontoApiError) {
      console.error(`API error (${error.status}): ${error.message}`);
      process.exitCode = 1;
      return;
    }
    if (error instanceof QontoRateLimitError) {
      console.error(`Rate limited: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}
