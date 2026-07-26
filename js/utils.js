export const CA_LOCALE = 'ca-ES';

export function pad(value) {
  return String(value).padStart(2, '0');
}

export function parseISODate(value) {
  if (!value) return null;
  const [year, month, day] = String(value).split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function toISODate(date) {
  const safeDate = date instanceof Date ? date : new Date(date);
  return `${safeDate.getFullYear()}-${pad(safeDate.getMonth() + 1)}-${pad(safeDate.getDate())}`;
}

export function addDays(date, amount) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

export function addYears(date, amount) {
  const result = new Date(date);
  result.setFullYear(result.getFullYear() + amount);
  return result;
}

export function startOfISOWeek(date) {
  const result = new Date(date);
  const day = result.getDay() || 7;
  result.setDate(result.getDate() - day + 1);
  result.setHours(12, 0, 0, 0);
  return result;
}

export function getISOWeekInfo(date) {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNumber);

  const isoYear = target.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil((((target - yearStart) / 86400000) + 1) / 7);

  return {
    year: isoYear,
    week,
    monday: startOfISOWeek(date)
  };
}

export function getDateFromISOWeek(year, week, dayIndex = 0) {
  const januaryFourth = new Date(year, 0, 4, 12, 0, 0, 0);
  const firstMonday = startOfISOWeek(januaryFourth);
  return addDays(firstMonday, (week - 1) * 7 + dayIndex);
}

export function weeksInISOYear(year) {
  return getISOWeekInfo(new Date(year, 11, 28, 12, 0, 0, 0)).week;
}

export function formatDate(date, options = {}) {
  return new Intl.DateTimeFormat(CA_LOCALE, options).format(date);
}

export function formatShortDate(date) {
  return formatDate(date, { day: 'numeric', month: 'short' }).replace('.', '');
}

export function formatLongDate(date) {
  return formatDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatDateRange(start, end) {
  if (!start || !end) return '—';

  const sameYear = start.getFullYear() === end.getFullYear();
  const sameMonth = sameYear && start.getMonth() === end.getMonth();

  if (sameMonth) {
    return `${start.getDate()}–${end.getDate()} ${formatDate(end, { month: 'long', year: 'numeric' })}`;
  }

  if (sameYear) {
    return `${formatDate(start, { day: 'numeric', month: 'short' })} – ${formatDate(end, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }

  return `${formatDate(start, { day: 'numeric', month: 'short', year: 'numeric' })} – ${formatDate(end, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

export function getAcademicYearLabel(start, end) {
  if (!start || !end) return 'Curs acadèmic';
  return `${start.getFullYear()}–${end.getFullYear()}`;
}

export function getAcademicYearForDate(date) {
  const year = date.getFullYear();
  const startYear = date.getMonth() >= 7 ? year : year - 1;
  return {
    start: new Date(startYear, 8, 1, 12, 0, 0, 0),
    end: new Date(startYear + 1, 5, 30, 12, 0, 0, 0)
  };
}

export function eachWeekBetween(start, end) {
  const weeks = [];
  let cursor = startOfISOWeek(start);
  const last = startOfISOWeek(end);

  while (cursor <= last) {
    const info = getISOWeekInfo(cursor);
    weeks.push({
      year: info.year,
      week: info.week,
      start: new Date(cursor),
      end: addDays(cursor, 4)
    });
    cursor = addDays(cursor, 7);
  }

  return weeks;
}

export function isDateInside(date, start, end) {
  const value = parseISODate(toISODate(date));
  const startValue = start ? parseISODate(toISODate(start)) : null;
  const endValue = end ? parseISODate(toISODate(end)) : null;

  if (startValue && value < startValue) return false;
  if (endValue && value > endValue) return false;
  return true;
}

export function normalizeText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase(CA_LOCALE);
}

export function uniqueSorted(values = []) {
  return [...new Set(values.map(value => String(value).trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, CA_LOCALE, { sensitivity: 'base', numeric: true }));
}

export function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  })[character]);
}

export function csvEscape(value = '') {
  return `"${String(value).replace(/"/g, '""')}"`;
}

export function createCsv(rows, columns) {
  const header = columns.map(column => csvEscape(column.label)).join(';');
  const body = rows.map(row => columns.map(column => csvEscape(
    typeof column.value === 'function' ? column.value(row) : row[column.value]
  )).join(';'));
  return `\uFEFF${[header, ...body].join('\n')}`;
}

export function downloadBlob(content, filename, type = 'text/plain;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function debounce(callback, delay = 250) {
  let timer;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => callback(...args), delay);
  };
}

export function capitalize(value = '') {
  if (!value) return '';
  return value.charAt(0).toLocaleUpperCase(CA_LOCALE) + value.slice(1);
}

export function slugify(value = '') {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function getDayKey(date) {
  const keys = ['diumenge', 'dilluns', 'dimarts', 'dimecres', 'dijous', 'divendres', 'dissabte'];
  return keys[date.getDay()];
}

export function getDayIndex(dayKey) {
  const map = {
    dilluns: 0,
    dimarts: 1,
    dimecres: 2,
    dijous: 3,
    divendres: 4,
    dissabte: 5,
    diumenge: 6
  };
  return map[dayKey] ?? 0;
}

export function formatTimeSlot(slot) {
  if (!slot) return '';
  if (typeof slot === 'string') return slot;
  return `${slot.start}–${slot.end}`;
}

export function compareTimeSlots(a, b) {
  return String(a.start || a).localeCompare(String(b.start || b));
}

export function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
