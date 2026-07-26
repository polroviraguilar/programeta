export const DAYS = [
  { key: 'dilluns', label: 'Dilluns', short: 'Dl.', index: 1 },
  { key: 'dimarts', label: 'Dimarts', short: 'Dt.', index: 2 },
  { key: 'dimecres', label: 'Dimecres', short: 'Dc.', index: 3 },
  { key: 'dijous', label: 'Dijous', short: 'Dj.', index: 4 },
  { key: 'divendres', label: 'Divendres', short: 'Dv.', index: 5 }
];

export const DEFAULT_TIME_SLOTS = [
  '09:00-10:00',
  '10:00-11:00',
  '11:30-12:30',
  '12:30-13:30',
  '15:00-16:00',
  '16:00-17:00'
];

export function pad(value) {
  return String(value).padStart(2, '0');
}

export function toDateKey(date) {
  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  return `${year}-${month}-${day}`;
}

export function fromDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function dateToISO(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNumber = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

export function currentISO() {
  const now = new Date();
  return dateToISO(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}

export function isoWeekStart(year, week) {
  const januaryFourth = new Date(Date.UTC(year, 0, 4));
  const day = januaryFourth.getUTCDay() || 7;
  const firstMonday = addDays(januaryFourth, 1 - day);
  return addDays(firstMonday, (week - 1) * 7);
}

export function isoWeekRange(year, week) {
  const start = isoWeekStart(year, week);
  return { start, end: addDays(start, 4) };
}

export function dateForISOWeekDay(year, week, dayIndex) {
  return addDays(isoWeekStart(year, week), dayIndex - 1);
}

export function weeksInYear(year) {
  return dateToISO(new Date(Date.UTC(year, 11, 28))).week;
}

export function formatDate(date, options = {}) {
  return new Intl.DateTimeFormat('ca-ES', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
    year: options.year === false ? undefined : 'numeric',
    ...options
  }).format(date);
}

export function formatDateLong(date) {
  return new Intl.DateTimeFormat('ca-ES', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(date);
}

export function formatDateShort(date) {
  return new Intl.DateTimeFormat('ca-ES', {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit'
  }).format(date);
}

export function getAcademicYearDefaults(reference = new Date()) {
  const year = reference.getFullYear();
  const startYear = reference.getMonth() >= 7 ? year : year - 1;
  return {
    academicYearStart: `${startYear}-09-01`,
    academicYearEnd: `${startYear + 1}-06-30`
  };
}

export function splitTimeSlot(slot) {
  const [startTime = '', endTime = ''] = String(slot || '').split('-').map(value => value.trim());
  return { startTime, endTime };
}

export function normalizeTimeSlot(slot) {
  const { startTime, endTime } = splitTimeSlot(slot);
  if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) return null;
  return `${startTime}-${endTime}`;
}

export function parseTimeSlots(text) {
  const seen = new Set();
  return String(text || '')
    .split(/\r?\n|,/)
    .map(value => normalizeTimeSlot(value))
    .filter(Boolean)
    .filter(value => {
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    })
    .sort((a, b) => a.localeCompare(b));
}

export function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('ca');
}

export function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

export function nl2br(value = '') {
  return escapeHtml(value).replace(/\n/g, '<br>');
}

export function timestampToMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function chooseLatest(entries) {
  return [...entries].sort((a, b) => {
    const aTime = timestampToMillis(a.updatedAt) || timestampToMillis(a.createdAt);
    const bTime = timestampToMillis(b.updatedAt) || timestampToMillis(b.createdAt);
    return bTime - aTime;
  })[0] || null;
}

export function downloadTextFile(filename, content, mimeType = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function csvCell(value = '') {
  return `"${String(value).replace(/"/g, '""')}"`;
}

export function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean).map(value => String(value).trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'ca', { sensitivity: 'base' }));
}
