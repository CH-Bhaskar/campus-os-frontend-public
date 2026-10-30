/**
 * Date helpers. The API sends plain dates as YYYY-MM-DD and every timestamp
 * in UTC (ending in Z) — convert to IST for display, never show raw UTC.
 */
const IST = 'Asia/Kolkata';

/** "30 Oct 2026, 2:45 pm IST" */
export function toIST(isoUtc: string): string {
  const d = new Date(isoUtc);
  if (Number.isNaN(d.getTime())) return isoUtc;
  const s = new Intl.DateTimeFormat('en-IN', {
    timeZone: IST,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d);
  return `${s} IST`;
}

/** "30 Oct 2026" */
export function toISTDate(isoUtc: string): string {
  const d = new Date(isoUtc);
  if (Number.isNaN(d.getTime())) return isoUtc;
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

/** Today's date as YYYY-MM-DD in IST — for <input type="date"> defaults and TAT pickers. */
export function todayISODate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: IST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * Convert a datetime-local input value ("2026-11-03T09:00") to an ISO string
 * WITHOUT timezone — the API reads it as IST. Pass through unchanged.
 */
export function localInputToISTNaive(localValue: string): string {
  return localValue;
}
