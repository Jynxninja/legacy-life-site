// Time-zone-safe slot generation. Plain JS-compatible on purpose so it can be unit tested in Node.

// Offset (ms) of `tz` from UTC at the instant utcMs. Positive = ahead of UTC.
export function tzOffsetMs(utcMs, tz) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric", second: "numeric",
  });
  const p = {};
  for (const part of dtf.formatToParts(new Date(utcMs))) p[part.type] = part.value;
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

// The UTC instant when the wall clock in `tz` reads y-m-d h:00.
export function zonedToUtc(y, m, d, h, tz) {
  const guess = Date.UTC(y, m - 1, d, h);
  const off1 = tzOffsetMs(guess, tz);
  let t = guess - off1;
  const off2 = tzOffsetMs(t, tz);
  if (off2 !== off1) t = guess - off2; // crossed a DST change
  return t;
}

// Calendar date (y, m, d) of an instant as seen in `tz`.
export function localDate(utcMs, tz) {
  const dtf = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "numeric", day: "numeric" });
  const p = {};
  for (const part of dtf.formatToParts(new Date(utcMs))) p[part.type] = part.value;
  return { y: +p.year, m: +p.month, d: +p.day };
}

// All bookable slot start times (ms since epoch, ascending) for one agent.
export function generateSlots({ now, tz, availability, days = 14, minNoticeHours = 12, maxAdvanceHours = null }) {
  const out = [];
  const earliest = now + minNoticeHours * 3600 * 1000;
  const latest = maxAdvanceHours == null ? Infinity : now + maxAdvanceHours * 3600 * 1000;
  const base = localDate(now, tz);
  for (let i = 0; i <= days; i++) {
    const day = new Date(Date.UTC(base.y, base.m - 1, base.d + i)); // calendar arithmetic only
    const y = day.getUTCFullYear(), m = day.getUTCMonth() + 1, d = day.getUTCDate();
    const weekday = day.getUTCDay();
    for (const row of availability) {
      if (row.weekday !== weekday) continue;
      for (let h = row.start_hour; h < row.end_hour; h++) {
        const ms = zonedToUtc(y, m, d, h, tz);
        if (ms >= earliest && ms <= latest) out.push(ms);
      }
    }
  }
  return out.sort((a, b) => a - b);
}
