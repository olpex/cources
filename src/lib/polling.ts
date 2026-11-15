// Night mode: 23:00–07:00 Europe/Kyiv polling intervals are 4x longer.
export function isKyivNight(now: Date = new Date()): boolean {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Kyiv", hour: "2-digit", hourCycle: "h23" }).format(now));
  return h >= 23 || h < 7;
}
export function pollDelay(base: number, now: Date = new Date()): number {
  return isKyivNight(now) ? base * 4 : base;
}
/** setInterval replacement whose delay is recomputed each tick. Returns a stop function. */
export function startPolling(fn: () => void, base: number): () => void {
  let t: ReturnType<typeof setTimeout>;
  const tick = () => { fn(); t = setTimeout(tick, pollDelay(base)); };
  t = setTimeout(tick, pollDelay(base));
  return () => clearTimeout(t);
}
