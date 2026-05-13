// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { apiKeyHealthCheck } from "./checks/api-key-health.js";
import { authCredentialsCheck } from "./checks/auth-credentials.js";
import { bankAccountsCountCheck } from "./checks/bank-accounts-count.js";
import { configResolutionCheck } from "./checks/config-resolution.js";
import { einvoicingSettingsCheck } from "./checks/einvoicing-settings.js";
import { hostRoutingCheck } from "./checks/host-routing.js";
import { oauthHealthCheck } from "./checks/oauth-health.js";
import { orgMetadataCheck } from "./checks/org-metadata.js";
import { scopesCheck } from "./checks/scopes.js";
import type { DiagnosticCheck } from "./types.js";

/**
 * Default registry — order matters:
 *
 * 1. `config.resolution` and `auth.credentials-present` come first
 *    because both carry `cascadeOnFail: true` and a fatal failure in
 *    either short-circuits all live checks.
 * 2. `auth.api-key-health` and `auth.oauth-health` follow — they probe
 *    each credential mode in isolation so a fall-back-masking failure
 *    cannot hide an unhealthy credential.
 * 3. `auth.scopes` reports static config-mirrored OAuth scopes
 *    (per ADR-DIAG-3).
 * 4. `org.*` checks fetch organization-level data once (via cache) so
 *    `org.bank-accounts-count` reuses the response from `org.metadata`.
 * 5. `routing.host-target` is last so the user sees endpoint diagnostics
 *    even when authentication is broken.
 *
 * Adding a new check is append-only; the runner needs no orchestration
 * change.
 */
export const diagnosticRegistry: readonly DiagnosticCheck[] = [
  configResolutionCheck,
  authCredentialsCheck,
  apiKeyHealthCheck,
  oauthHealthCheck,
  scopesCheck,
  orgMetadataCheck,
  bankAccountsCountCheck,
  einvoicingSettingsCheck,
  hostRoutingCheck,
];
