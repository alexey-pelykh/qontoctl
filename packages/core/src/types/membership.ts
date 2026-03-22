// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * A Qonto organization membership representing a team member.
 */
export interface Membership {
  readonly id: string;
  readonly first_name: string;
  readonly last_name: string;
  readonly email?: string | undefined;
  readonly role: "owner" | "admin" | "manager" | "reporting" | "employee" | "accountant";
  readonly team_id: string;
  readonly residence_country?: string | null | undefined;
  readonly birthdate?: string | null | undefined;
  readonly nationality?: string | null | undefined;
  readonly birth_country?: string | null | undefined;
  readonly ubo?: boolean | null | undefined;
  readonly status: string;
}
