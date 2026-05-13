// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

export type {
  CheckAuth,
  CheckKind,
  CheckStatus,
  DiagnoseContext,
  DiagnosticCheck,
  DiagnosticReport,
  DiagnosticResult,
  SummaryCounts,
} from "./types.js";

export {
  CheckStatusSchema,
  DiagnosticReportSchema,
  DiagnosticResultSchema,
  SummaryCountsSchema,
} from "./types.schema.js";

export { runDiagnose, computeSummaryCounts } from "./service.js";
export { runChecks } from "./runner.js";
export { diagnosticRegistry } from "./registry.js";

export { buildDiagnoseClients, buildApiKeyClient, buildOAuthClient } from "./clients.js";
export type { DiagnoseClients } from "./clients.js";

export { applyTripwire, buildRedactionContext, whitelistEvidence } from "./redaction.js";
export type { RedactionContext, TripwireResult } from "./redaction.js";
