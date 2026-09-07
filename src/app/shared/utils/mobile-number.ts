/**
 * A mobile number is ten digits and nothing else.
 *
 * maxlength alone does not stop letters, spaces, +, dashes or a paste, and
 * `type="number"` brings spinners and accepts e/E/+/- besides. Every mobile field
 * runs its input through here, so what reaches the form is always digits and never
 * longer than ten.
 */
export function onlyMobileDigits(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '').slice(0, 10);
}

/** True only for a complete ten-digit number. */
export function isValidMobileNumber(value: unknown): boolean {
  return /^\d{10}$/.test(String(value ?? ''));
}
