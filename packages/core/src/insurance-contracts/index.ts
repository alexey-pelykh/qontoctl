// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

export {
  getInsuranceContract,
  createInsuranceContract,
  updateInsuranceContract,
  uploadInsuranceDocument,
  removeInsuranceDocument,
} from "./service.js";

export type { CreateInsuranceContractParams, UpdateInsuranceContractParams } from "./service.js";

export type { InsuranceContract, InsuranceDocument } from "./types.js";

export {
  InsuranceContractSchema,
  InsuranceContractResponseSchema,
  InsuranceDocumentSchema,
  InsuranceDocumentResponseSchema,
} from "./schemas.js";
