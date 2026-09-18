/** Bank account type, the same three everywhere - CRM, SFA and VRiDDHi. The value is what is
 *  stored in custom_fields.bank_account_type (upper case, as the field app has always saved
 *  it); the label is what people see. */
export const BANK_ACCOUNT_TYPES: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'SAVINGS', label: 'Savings' },
  { id: 'CURRENT', label: 'Current' },
  { id: 'OD', label: 'OD' }
];

/** Reads any spelling already on record - "Savings", "saving", "Current", "Overdraft" - as one
 *  of the three stored values, so the dropdown shows it selected. Anything else is kept as it
 *  is rather than silently dropped. */
export function normalizeBankAccountType(value: unknown): string {
  const text = String(value ?? '').trim();
  const key = text.toUpperCase().replace(/[^A-Z]/g, '');
  if (!key) return '';
  if (key.startsWith('SAVING')) return 'SAVINGS';
  if (key.startsWith('CURRENT')) return 'CURRENT';
  if (key === 'OD' || key.startsWith('OVERDRAFT')) return 'OD';
  return text;
}

export function bankAccountTypeLabel(value: unknown): string {
  const stored = normalizeBankAccountType(value);
  return BANK_ACCOUNT_TYPES.find(type => type.id === stored)?.label ?? stored;
}
