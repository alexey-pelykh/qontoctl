// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * SCA authentication methods supported by the Qonto API.
 */
export type ScaMethod = "paired_device" | "passkey" | "sms_otp" | "mock";

/**
 * SCA session status values.
 */
export type ScaSessionStatus = "waiting" | "allow" | "deny";

/**
 * SCA session state returned by the Qonto API.
 */
export interface ScaSession {
  readonly token: string;
  readonly status: ScaSessionStatus;
}
