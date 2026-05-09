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

export type {
  InsuranceContract,
  InsuranceContractDocumentRef,
  InsuranceContractOrigin,
  InsuranceContractPaymentFrequency,
  InsuranceContractPrice,
  InsuranceContractStatus,
  InsuranceDocument,
} from "./types.js";

export {
  InsuranceContractDocumentRefSchema,
  InsuranceContractOriginSchema,
  InsuranceContractPaymentFrequencySchema,
  InsuranceContractPriceSchema,
  InsuranceContractResponseSchema,
  InsuranceContractSchema,
  InsuranceContractStatusSchema,
  InsuranceDocumentResponseSchema,
  InsuranceDocumentSchema,
} from "./schemas.js";
