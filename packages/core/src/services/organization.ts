// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Organization } from "../api-types.js";
import type { HttpClient } from "../http-client.js";

interface OrganizationResponse {
  readonly organization: Organization;
}

/**
 * Fetch the authenticated organization details, including its bank accounts.
 *
 * @param client - The HTTP client to use for the request.
 * @returns The organization object with nested bank accounts.
 */
export async function getOrganization(client: HttpClient): Promise<Organization> {
  const response = await client.get<OrganizationResponse>("/v2/organization");
  return response.organization;
}
