export function fmtTime(sec: number | null | undefined): string {
  if (sec === null || sec === undefined) return "–";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
