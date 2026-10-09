export function todayIso(now = new Date()) {
  return now.toLocaleDateString("en-CA");
}

/** Inclusive end date. Half a day stays on the start date. */
export function absenceEndDate(start: string, days: number) {
  const span = Math.max(1, Math.ceil(days));
  const date = new Date(`${start}T12:00:00`);
  date.setDate(date.getDate() + span - 1);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function usedAbsenceDays(
  rows: { type: string; startDate: string; days: number }[],
  type: string,
  yearStart: string
) {
  return rows
    .filter((row) => row.type === type && row.startDate >= yearStart)
    .reduce((sum, row) => sum + Number(row.days || 0), 0);
}
