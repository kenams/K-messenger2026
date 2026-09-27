/** `22:35` — 24h, never seconds. */
export function formatClock(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** "Aujourd'hui" / "Hier" / "12 sept." (year added only when it differs). */
export function formatDayLabel(value: string | number | Date | null | undefined, now: Date = new Date()): string {
  if (value === null || value === undefined) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (diffDays === 0) return 'Aujourd’hui';
  if (diffDays === 1) return 'Hier';
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString('fr-FR', sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Conversation-list stamp: `22:35` today, then "Hier", then a short date. */
export function formatListStamp(value: string | number | Date | null | undefined, now: Date = new Date()): string {
  const day = formatDayLabel(value, now);
  if (!day) return '';
  return day === 'Aujourd’hui' ? formatClock(value) : day;
}

/** "il y a 5 min" / "il y a 2 h" / day label — for "last listened" hints. */
export function formatAgo(value: string | number | Date | null | undefined, now: Date = new Date()): string {
  if (value === null || value === undefined) return '';
  const date = value instanceof Date ? value : new Date(value);
  const ms = now.getTime() - date.getTime();
  if (Number.isNaN(ms)) return '';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  return formatDayLabel(date, now).toLowerCase();
}
