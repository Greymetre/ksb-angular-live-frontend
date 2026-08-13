export const APP_TIME_ZONE = 'Asia/Kolkata';

const dateTimeOptions: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: 'short',
  year: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: APP_TIME_ZONE
};

const longDateTimeOptions: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: APP_TIME_ZONE
};

const dateOptions: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: APP_TIME_ZONE
};

export function formatKolkataDateTime(value?: string | number | Date | null, fallback = ''): string {
  return formatInKolkata(value, dateTimeOptions, fallback);
}

export function formatKolkataLongDateTime(value?: string | number | Date | null, fallback = '-'): string {
  return formatInKolkata(value, longDateTimeOptions, fallback);
}

export function formatKolkataDate(value?: string | number | Date | null, fallback = '-'): string {
  return formatInKolkata(value, dateOptions, fallback);
}

export function kolkataDateInput(value?: string | number | Date | null): string {
  const date = parseDate(value);
  if (!date) return typeof value === 'string' ? value.slice(0, 10) : '';

  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: APP_TIME_ZONE
  }).formatToParts(date);

  const year = parts.find(part => part.type === 'year')?.value;
  const month = parts.find(part => part.type === 'month')?.value;
  const day = parts.find(part => part.type === 'day')?.value;
  return year && month && day ? `${year}-${month}-${day}` : '';
}

export function kolkataTodayInput(): string {
  return kolkataDateInput(new Date());
}

function formatInKolkata(value: string | number | Date | null | undefined, options: Intl.DateTimeFormatOptions, fallback: string): string {
  const date = parseDate(value);
  if (!date) return value ? String(value) : fallback;
  return date.toLocaleString('en-IN', options);
}

function parseDate(value: string | number | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(normalizeUtcTimestamp(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeUtcTimestamp(value: string | number): string | number {
  if (typeof value !== 'string') return value;
  const text = value.trim();
  if (!text) return text;
  if (!/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(text)) return text;
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(text)) return text;
  return `${text.replace(' ', 'T')}Z`;
}
