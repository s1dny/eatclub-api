export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export const TZ_BY_STATE: Record<string, string> = {
  NSW: "Australia/Sydney",
  ACT: "Australia/Sydney",
  VIC: "Australia/Melbourne",
  TAS: "Australia/Hobart",
  QLD: "Australia/Brisbane",
  SA: "Australia/Adelaide",
  NT: "Australia/Darwin",
  WA: "Australia/Perth",
};

/** YYYY-MM-DD and ISO weekday (1 = Mon) in a time zone. */
export function localDate(tz: string, when = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    when,
  );
}
export function localWeekday(tz: string, when = new Date()): number {
  const d = new Intl.DateTimeFormat("en-AU", { timeZone: tz, weekday: "short" }).format(when).toLowerCase().slice(0, 3);
  return DAYS.indexOf(d) + 1;
}

const started = Date.now();
export const log = (msg: string) => console.error(`[${((Date.now() - started) / 1000).toFixed(0)}s] ${msg}`);

export async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < items.length) await fn(items[next++] as T);
    }),
  );
}
