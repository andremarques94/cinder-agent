const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function timeAgo(iso: string, now: number): string {
  const elapsed = now - Date.parse(iso);
  for (const [unit, size] of UNITS) {
    if (elapsed >= size) {
      return relative.format(-Math.floor(elapsed / size), unit);
    }
  }
  return "just now";
}
