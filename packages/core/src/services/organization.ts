// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";

import type { Organization } from "../api-types.js";
import { OrganizationSchema } from "../api-types.schema.js";
import type { HttpClient } from "../http-client.js";
import { parseResponse } from "../response.js";

const OrganizationResponseSchema = z.object({ organization: OrganizationSchema }).strip();

/**
 * Fetch the authenticated organization details, including its bank accounts.
 *
 * @param client - The HTTP client to use for the request.
 * @returns The organization object with nested bank accounts.
 */
export async function getOrganization(client: HttpClient): Promise<Organization> {
  const endpointPath = "/v2/organization";
  const response = await client.get(endpointPath);
  return parseResponse(OrganizationResponseSchema, response, endpointPath).organization;
}
