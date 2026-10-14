export function shiftMonth(
  year: number,
  month: number,
  delta: number,
): [number, number] {
  const d = new Date(year, month + delta, 1);
  return [d.getFullYear(), d.getMonth()];
}
export function monthGrid(year: number, month: number): (number | null)[] {
  const lead = (new Date(year, month, 1).getDay() + 6) % 7;
  return [
    ...Array(lead).fill(null),
    ...Array.from(
      { length: new Date(year, month + 1, 0).getDate() },
      (_, i) => i + 1,
    ),
  ];
}
export function readingDate(value: string): Date {
  return new Date(
    /^\d{4}-\d{2}-\d{2} \d/.test(value) ? value.replace(" ", "T") + "Z" : value,
  );
}
export function localReadingDay(value: string): string {
  const d = readingDate(value);
  return Number.isNaN(d.valueOf())
    ? ""
    : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
