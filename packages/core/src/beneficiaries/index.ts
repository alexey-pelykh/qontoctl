// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

export {
  buildBeneficiaryQueryParams,
  getBeneficiary,
  createBeneficiary,
  updateBeneficiary,
  trustBeneficiaries,
  untrustBeneficiaries,
} from "./service.js";

export { BeneficiarySchema, BeneficiaryResponseSchema } from "./schemas.js";

export type { CreateBeneficiaryParams, ListBeneficiariesParams, UpdateBeneficiaryParams } from "./types.js";
