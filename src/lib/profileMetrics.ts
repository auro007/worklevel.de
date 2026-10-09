export function hoursWithin(entries: { started_at: string; ended_at: string | null }[], start: Date, now: Date): number {
  return entries.reduce((sum, t) => {
    const from = Math.max(start.getTime(), Date.parse(t.started_at));
    const to = Math.min(now.getTime(), t.ended_at ? Date.parse(t.ended_at) : now.getTime());
    return sum + (Number.isFinite(from) && Number.isFinite(to) ? Math.max(0, to - from) : 0);
  }, 0) / 3600000;
}
