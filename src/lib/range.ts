import { addDays, businessDateString } from "./time";

export function parseRange(sp: { from?: string; to?: string }, defaultDays = 30): { from: string; to: string } {
  const valid = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const to = valid(sp.to) ? sp.to! : businessDateString(new Date());
  const from = valid(sp.from) ? sp.from! : businessDateString(addDays(new Date(`${to}T00:00:00Z`), -(defaultDays - 1)));
  return from <= to ? { from, to } : { from: to, to: from };
}

/** Fill missing days so time charts have a continuous x axis. */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`) && out.length < 400; d = addDays(d, 1)) out.push(d.toISOString().slice(0, 10));
  return out;
}
