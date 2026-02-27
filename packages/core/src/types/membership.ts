// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * A Qonto organization membership representing a team member.
 */
export interface Membership {
  readonly id: string;
  readonly first_name: string;
  readonly last_name: string;
  readonly role: "owner" | "admin" | "manager" | "reporting" | "employee";
  readonly team_id: string;
  readonly residence_country: string | null;
  readonly birthdate: string | null;
  readonly nationality: string | null;
  readonly birth_country: string | null;
  readonly ubo: boolean | null;
  readonly status: string;
}
