/**
 * Why a fixed amount could not be charged or credited. Thrown before
 * anything is written; a balance that cannot cover a charge is not an
 * error but a refusal (`QuotaRefusalCode`).
 */

export type ChargeErrorCode =
  | "invalid_amount"
  | "currency_mismatch"
  | "charge_not_found"
  | "refund_exceeds_charge";

export class ChargeError extends Error {
  readonly code: ChargeErrorCode;

  constructor(code: ChargeErrorCode, message: string) {
    super(message);
    this.name = "ChargeError";
    this.code = code;
  }
}
