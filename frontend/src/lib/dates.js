import { WEEKDAYS } from "./constants";

export function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Monday of the week containing `base`, shifted by weekOffset weeks
export function mondayOf(weekOffset = 0, base = new Date()) {
  const d = new Date(base);
  const day = (d.getDay() + 6) % 7; // 0 = Monday
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day + weekOffset * 7);
  return d;
}

// default week: on Sundays, automatically show next week
export function defaultWeekOffset(base = new Date()) {
  return base.getDay() === 0 ? 1 : 0;
}

export function weekDates(monday) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d;
  });
}

export function formatLong(d) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${WEEKDAYS[(d.getDay() + 6) % 7]}, ${dd}.${mm}.${d.getFullYear()}`;
}

export function formatShort(d) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.`;
}
