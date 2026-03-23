// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

export {
  listIntlBeneficiaries,
  getIntlBeneficiaryRequirements,
  createIntlBeneficiary,
  updateIntlBeneficiary,
  removeIntlBeneficiary,
} from "./service.js";

export {
  IntlBeneficiarySchema,
  IntlBeneficiaryResponseSchema,
  IntlBeneficiaryListResponseSchema,
  IntlBeneficiaryRequirementFieldSchema,
  IntlBeneficiaryRequirementsSchema,
  IntlBeneficiaryRequirementsResponseSchema,
} from "./schemas.js";

export type {
  IntlBeneficiary,
  IntlBeneficiaryRequirementField,
  IntlBeneficiaryRequirements,
  CreateIntlBeneficiaryParams,
  UpdateIntlBeneficiaryParams,
} from "./types.js";
