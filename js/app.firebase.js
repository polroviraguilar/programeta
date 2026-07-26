import {
  login,
  logout,
  register,
  removeScheduleEntry,
  replaceScheduleEntries,
  resetPassword,
  savePreferences,
  saveScheduleEntry,
  watchAuth,
  watchPreferences,
  watchScheduleEntries
} from './firebase.js';
import {
  DAYS,
  DEFAULT_TIME_SLOTS,
  addDays,
  chooseLatest,
  csvCell,
  currentISO,
  dateForISOWeekDay,
  dateToISO,
  downloadTextFile,
  escapeHtml,
  formatDate,
  formatDateLong,
  formatDateShort,
  fromDateKey,
  getAcademicYearDefaults,
  isoWeekRange,
  normalizeText,
  parseTimeSlots,
  splitTimeSlot,
  toDateKey,
  uniqueSorted,
  weeksInYear
} from './utils.js';

const academicDefaults = getAcademicYearDefaults();
const DEFAULT_PREFERENCES = {
  ...academicDefaults,
  timeSlots: DEFAULT_TIME_SLOTS
};

const state = {
  user: null,
  entries: [],
  preferences: { ...DEFAULT_PREFERENCES },
  selected: currentISO(),
  selectedYear: currentISO().year,
  currentEntry: null,
  currentCell: null,
  currentLessonResults: [],
  authMode: 'login',
  unsubscribeEntries: null,
  unsubscribePreferences: null,
  confirmResolver: null
};

const dom = Object.fromEntries([
  'loadingScreen', 'appShell', 'appFooter', 'userChip', 'userName', 'userEmail',
  'openLogin', 'btnLogout', 'openSettings', 'mainNavigation', 'viewSchedule',
  'viewLessonbook', 'scheduleTabs', 'weekView', 'yearView', 'weekTitle',
  'weekRange', 'weekBadge', 'weekActivityCount', 'prevWeek', 'todayWeek',
  'nextWeek', 'weekGrid', 'prevYear', 'nextYear', 'yearLabel', 'yearGrid',
  'lessonFilters', 'filterCourse', 'filterSubject', 'filterText', 'filterFrom',
  'filterUntil', 'clearFilters', 'courseOptions', 'subjectOptions', 'resultsCount',
  'resultsDescription', 'printResults', 'exportCsv', 'lessonResults', 'entryDialog',
  'entryForm', 'entryDialogTitle', 'entryContext', 'closeEntryDialog', 'entryCourse',
  'entrySubject', 'entryActivity', 'entryNotes', 'entryType', 'entryTypeHelp',
  'activeFromField', 'activeUntilField', 'entryActiveFrom', 'entryActiveUntil',
  'entryError', 'deleteEntry', 'skipEntry', 'cancelEntry', 'saveEntry', 'authDialog', 'authForm',
  'authTitle', 'authSubtitle', 'authNameField', 'authName', 'authEmail',
  'authPassword', 'togglePassword', 'authError', 'authSuccess', 'authSubmit',
  'resetPassword', 'authSwitchText', 'switchAuthMode', 'settingsDialog',
  'settingsForm', 'closeSettings', 'academicYearStart', 'academicYearEnd',
  'timeSlots', 'exportBackup', 'importBackup', 'settingsError', 'cancelSettings',
  'confirmDialog', 'confirmTitle', 'confirmMessage', 'confirmCancel',
  'confirmAccept', 'toastRegion', 'currentYear'
].map(id => [id, document.getElementById(id)]));

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `
    <span class="toast__icon" aria-hidden="true"></span>
    <span>${escapeHtml(message)}</span>
  `;
  dom.toastRegion.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('is-visible'));
  window.setTimeout(() => {
    toast.classList.remove('is-visible');
    window.setTimeout(() => toast.remove(), 250);
  }, 3600);
}

function setBusy(button, busy, label = 'Desant…') {
  if (!button) return;
  if (busy) {
    button.dataset.originalText = button.textContent;
    button.disabled = true;
    button.textContent = label;
  } else {
    button.disabled = false;
    button.textContent = button.dataset.originalText || button.textContent;
  }
}

function showFormMessage(element, message = '') {
  if (!element) return;
  element.textContent = message;
  element.classList.toggle('hidden', !message);
}

function friendlyAuthError(error) {
  const messages = {
    'auth/invalid-credential': 'El correu o la contrasenya no són correctes.',
    'auth/invalid-email': 'El correu electrònic no té un format vàlid.',
    'auth/email-already-in-use': 'Ja existeix un compte amb aquest correu.',
    'auth/weak-password': 'La contrasenya ha de tenir com a mínim 6 caràcters.',
    'auth/too-many-requests': 'S\'han fet massa intents. Torna-ho a provar més tard.',
    'auth/network-request-failed': 'No s\'ha pogut connectar. Comprova la connexió a Internet.',
    'auth/user-disabled': 'Aquest compte està desactivat.'
  };
  return messages[error?.code] || 'No s\'ha pogut completar l\'operació. Torna-ho a provar.';
}

function showAuthenticatedApp(user) {
  dom.appShell.classList.remove('hidden');
  dom.appFooter.classList.remove('hidden');
  dom.userChip.classList.remove('hidden');
  dom.openSettings.classList.remove('hidden');
  dom.btnLogout.classList.remove('hidden');
  dom.openLogin.classList.add('hidden');
  dom.userName.textContent = user.displayName || 'El meu compte';
  dom.userEmail.textContent = user.email || '';
}

function showSignedOutApp() {
  dom.appShell.classList.add('hidden');
  dom.appFooter.classList.add('hidden');
  dom.userChip.classList.add('hidden');
  dom.openSettings.classList.add('hidden');
  dom.btnLogout.classList.add('hidden');
  dom.openLogin.classList.remove('hidden');
  dom.userName.textContent = '';
  dom.userEmail.textContent = '';
  state.entries = [];
  state.currentLessonResults = [];
}

function setAuthMode(mode) {
  state.authMode = mode;
  const registering = mode === 'register';
  dom.authNameField.classList.toggle('hidden', !registering);
  dom.authTitle.textContent = registering ? 'Crea el teu compte' : 'Inicia sessió';
  dom.authSubtitle.textContent = registering
    ? 'Crea un espai privat per conservar l’horari i el lliçonari.'
    : 'Accedeix al teu horari des de qualsevol dispositiu.';
  dom.authSubmit.textContent = registering ? 'Crea el compte' : 'Entra';
  dom.authSwitchText.textContent = registering ? 'Ja tens un compte?' : 'Encara no tens compte?';
  dom.switchAuthMode.textContent = registering ? 'Inicia sessió' : 'Crea’n un';
  dom.authPassword.autocomplete = registering ? 'new-password' : 'current-password';
  dom.resetPassword.classList.toggle('hidden', registering);
  showFormMessage(dom.authError);
  showFormMessage(dom.authSuccess);
}

function openAuthDialog(mode = 'login') {
  setAuthMode(mode);
  if (!dom.authDialog.open) dom.authDialog.showModal();
  window.setTimeout(() => dom.authEmail.focus(), 50);
}

function cleanupSubscriptions() {
  state.unsubscribeEntries?.();
  state.unsubscribePreferences?.();
  state.unsubscribeEntries = null;
  state.unsubscribePreferences = null;
}

function entryYear(entry) {
  return Number(entry.any ?? entry.year ?? 0);
}

function entryWeek(entry) {
  return Number(entry.setmana ?? entry.week ?? 0);
}

function entrySlot(entry) {
  if (entry.hora) return entry.hora;
  if (entry.startTime && entry.endTime) return `${entry.startTime}-${entry.endTime}`;
  return '';
}

function entryDay(entry) {
  if (entry.dia) return entry.dia;
  const day = DAYS.find(item => item.index === Number(entry.dayIndex));
  return day?.key || '';
}

function entryDayIndex(entry) {
  const direct = Number(entry.dayIndex);
  if (direct >= 1 && direct <= 5) return direct;
  return DAYS.find(item => item.key === entryDay(entry))?.index || 0;
}

function isRecurring(entry) {
  return entry.tipus === 'permanent' || entry.scope === 'recurring' || entryWeek(entry) === 0;
}

function entryDateKey(entry) {
  if (entry.dateKey) return entry.dateKey;
  const year = entryYear(entry);
  const week = entryWeek(entry);
  const dayIndex = entryDayIndex(entry);
  if (!year || !week || !dayIndex) return '';
  return toDateKey(dateForISOWeekDay(year, week, dayIndex));
}

function isRecurringActive(entry, date) {
  const dateKey = toDateKey(date);
  if (entry.activeFrom && dateKey < entry.activeFrom) return false;
  if (entry.activeUntil && dateKey > entry.activeUntil) return false;
  return true;
}

function entriesForCell(date, slot) {
  const iso = dateToISO(date);
  const dayIndex = date.getUTCDay();
  const day = DAYS.find(item => item.index === dayIndex)?.key;
  const dateKey = toDateKey(date);

  const specific = state.entries.filter(entry => {
    if (isRecurring(entry)) return false;
    if (entrySlot(entry) !== slot || entryDay(entry) !== day) return false;
    const storedDate = entryDateKey(entry);
    if (storedDate) return storedDate === dateKey;
    return entryYear(entry) === iso.year && entryWeek(entry) === iso.week;
  });

  const recurring = state.entries.filter(entry => (
    isRecurring(entry) &&
    entrySlot(entry) === slot &&
    entryDay(entry) === day &&
    isRecurringActive(entry, date)
  ));

  return {
    specific: chooseLatest(specific),
    recurring: chooseLatest(recurring)
  };
}

function resolveCell(date, slot) {
  const matches = entriesForCell(date, slot);
  if (matches.specific) {
    return matches.specific.isCancelled ? null : matches.specific;
  }
  return matches.recurring;
}

function allKnownSlots() {
  return uniqueSorted([
    ...state.preferences.timeSlots,
    ...state.entries.map(entrySlot)
  ]);
}

function resolveWeekMap(year, week) {
  const map = new Map();
  const slots = allKnownSlots();
  for (const day of DAYS) {
    const date = dateForISOWeekDay(year, week, day.index);
    for (const slot of slots) {
      const entry = resolveCell(date, slot);
      if (entry) map.set(`${day.key}|${slot}`, { entry, date });
    }
  }
  return map;
}

function renderWeek() {
  const { year, week } = state.selected;
  const { start, end } = isoWeekRange(year, week);
  const resolved = resolveWeekMap(year, week);
  const slots = allKnownSlots();
  const todayKey = toDateKey(new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())));

  dom.weekBadge.textContent = `Setmana ${week} · ${year}`;
  dom.weekRange.textContent = `${formatDateLong(start)} — ${formatDateLong(end)}`;
  dom.weekActivityCount.textContent = `${resolved.size} ${resolved.size === 1 ? 'activitat planificada' : 'activitats planificades'}`;

  const header = DAYS.map(day => {
    const date = dateForISOWeekDay(year, week, day.index);
    const todayClass = toDateKey(date) === todayKey ? ' is-today' : '';
    return `<th scope="col" class="day-heading${todayClass}"><span>${day.label}</span><small>${formatDateShort(date)}</small></th>`;
  }).join('');

  let body = '';
  for (const slot of slots) {
    body += `<tr><th scope="row" class="time-heading">${escapeHtml(slot)}</th>`;
    for (const day of DAYS) {
      const date = dateForISOWeekDay(year, week, day.index);
      const key = `${day.key}|${slot}`;
      const resolvedCell = resolved.get(key);
      const entry = resolvedCell?.entry || null;
      const recurring = entry && isRecurring(entry);
      const cellClasses = [
        'schedule-cell',
        entry ? 'has-entry' : 'is-empty',
        recurring ? 'is-recurring' : '',
        toDateKey(date) === todayKey ? 'is-today' : ''
      ].filter(Boolean).join(' ');

      const content = entry ? `
        <div class="schedule-entry">
          <div class="schedule-entry__meta">
            <span class="entry-scope">${recurring ? 'Cada setmana' : 'Puntual'}</span>
          </div>
          <strong>${escapeHtml(entry.activitat || 'Activitat sense títol')}</strong>
          <span>${escapeHtml(entry.curs || 'Sense curs')} · ${escapeHtml(entry.assignatura || 'Sense assignatura')}</span>
          ${entry.notes ? `<small>${escapeHtml(entry.notes)}</small>` : ''}
        </div>
      ` : '<span class="empty-label">Franja lliure</span>';

      body += `
        <td class="${cellClasses}">
          ${content}
          <button class="cell-action" type="button" data-cell-key="${escapeHtml(key)}" aria-label="${entry ? 'Edita' : 'Afegeix'} l’activitat de ${escapeHtml(day.label)}, ${escapeHtml(slot)}">
            <svg viewBox="0 0 24 24" aria-hidden="true">${entry ? '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/>' : '<path d="M12 5v14M5 12h14"/>'}</svg>
            <span>${entry ? 'Edita' : 'Afegeix'}</span>
          </button>
        </td>
      `;
    }
    body += '</tr>';
  }

  dom.weekGrid.innerHTML = `
    <thead><tr><th scope="col" class="time-heading">Hora</th>${header}</tr></thead>
    <tbody>${body}</tbody>
  `;
}

function renderYear() {
  const year = state.selectedYear;
  const current = currentISO();
  dom.yearLabel.textContent = year;
  const totalWeeks = weeksInYear(year);
  let html = '';

  for (let week = 1; week <= totalWeeks; week += 1) {
    const { start, end } = isoWeekRange(year, week);
    const count = resolveWeekMap(year, week).size;
    const isSelected = state.selected.year === year && state.selected.week === week;
    const isCurrent = current.year === year && current.week === week;
    html += `
      <button class="week-card${isSelected ? ' is-selected' : ''}${isCurrent ? ' is-current' : ''}" type="button" data-year="${year}" data-week="${week}">
        <span class="week-card__number">Setmana ${week}</span>
        <span class="week-card__dates">${formatDateShort(start)} – ${formatDateShort(end)}</span>
        <span class="week-card__count">${count} ${count === 1 ? 'activitat' : 'activitats'}</span>
      </button>
    `;
  }
  dom.yearGrid.innerHTML = html;
}

function renderFilterOptions() {
  const courses = uniqueSorted(state.entries.map(entry => entry.curs));
  const subjects = uniqueSorted(state.entries.map(entry => entry.assignatura));
  dom.courseOptions.innerHTML = courses.map(value => `<option value="${escapeHtml(value)}"></option>`).join('');
  dom.subjectOptions.innerHTML = subjects.map(value => `<option value="${escapeHtml(value)}"></option>`).join('');
}

function buildOccurrences(from, until) {
  const results = [];
  const slots = allKnownSlots();
  let cursor = new Date(from);
  let safety = 0;

  while (cursor <= until && safety < 900) {
    const dayIndex = cursor.getUTCDay();
    if (dayIndex >= 1 && dayIndex <= 5) {
      for (const slot of slots) {
        const entry = resolveCell(cursor, slot);
        if (!entry || !entry.activitat) continue;
        const day = DAYS.find(item => item.index === dayIndex);
        const { startTime, endTime } = splitTimeSlot(slot);
        results.push({
          entryId: entry.id,
          date: new Date(cursor),
          dateKey: toDateKey(cursor),
          day: day?.label || entryDay(entry),
          slot,
          startTime,
          endTime,
          course: entry.curs || '',
          subject: entry.assignatura || '',
          activity: entry.activitat || '',
          notes: entry.notes || '',
          recurring: isRecurring(entry)
        });
      }
    }
    cursor = addDays(cursor, 1);
    safety += 1;
  }

  return results.sort((a, b) => `${a.dateKey}|${a.slot}`.localeCompare(`${b.dateKey}|${b.slot}`));
}

function applyLessonFilters() {
  const from = fromDateKey(dom.filterFrom.value);
  const until = fromDateKey(dom.filterUntil.value);
  if (!from || !until || from > until) {
    showToast('Revisa el rang de dates del lliçonari.', 'error');
    return;
  }

  const course = normalizeText(dom.filterCourse.value);
  const subject = normalizeText(dom.filterSubject.value);
  const text = normalizeText(dom.filterText.value);
  const occurrences = buildOccurrences(from, until);

  state.currentLessonResults = occurrences.filter(item => (
    (!course || normalizeText(item.course).includes(course)) &&
    (!subject || normalizeText(item.subject).includes(subject)) &&
    (!text || normalizeText(`${item.activity} ${item.notes}`).includes(text))
  ));

  renderLessonResults();
}

function renderLessonResults() {
  const rows = state.currentLessonResults;
  dom.resultsCount.textContent = `${rows.length} ${rows.length === 1 ? 'resultat' : 'resultats'}`;
  dom.resultsDescription.textContent = rows.length
    ? `Del ${formatDate(fromDateKey(dom.filterFrom.value))} al ${formatDate(fromDateKey(dom.filterUntil.value))}.`
    : 'No hi ha activitats que coincideixin amb els criteris.';

  if (!rows.length) {
    dom.lessonResults.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14Z"/><path d="m9 10 2 2 4-4"/></svg>
        <h3>Encara no hi ha resultats</h3>
        <p>Modifica els filtres o afegeix activitats a l’horari.</p>
      </div>
    `;
    return;
  }

  dom.lessonResults.innerHTML = rows.map(item => `
    <article class="lesson-card">
      <div class="lesson-card__date">
        <strong>${new Intl.DateTimeFormat('ca-ES', { timeZone: 'UTC', day: '2-digit' }).format(item.date)}</strong>
        <span>${new Intl.DateTimeFormat('ca-ES', { timeZone: 'UTC', month: 'short' }).format(item.date)}</span>
      </div>
      <div class="lesson-card__content">
        <div class="lesson-card__heading">
          <div>
            <h3>${escapeHtml(item.activity)}</h3>
            <p>${escapeHtml(item.course)} · ${escapeHtml(item.subject)}</p>
          </div>
          <span class="entry-scope">${item.recurring ? 'Recurrent' : 'Puntual'}</span>
        </div>
        <div class="lesson-card__meta">${escapeHtml(item.day)} · ${escapeHtml(item.slot)} · ${formatDate(item.date)}</div>
        ${item.notes ? `<p class="lesson-card__notes">${escapeHtml(item.notes)}</p>` : ''}
      </div>
    </article>
  `).join('');
}

function renderAll() {
  renderWeek();
  renderYear();
  renderFilterOptions();
  applyLessonFilters();
}

function openEntryDialog(cellKey) {
  const [dayKey, slot] = cellKey.split('|');
  const day = DAYS.find(item => item.key === dayKey);
  const date = dateForISOWeekDay(state.selected.year, state.selected.week, day.index);
  const matches = entriesForCell(date, slot);
  const effective = matches.specific && !matches.specific.isCancelled ? matches.specific : matches.recurring;

  state.currentCell = { day, slot, date, matches };
  state.currentEntry = effective || null;

  dom.entryDialogTitle.textContent = effective ? 'Edita l’activitat' : 'Afegeix una activitat';
  dom.entryContext.textContent = `${day.label}, ${formatDateLong(date)} · ${slot}`;
  dom.entryCourse.value = effective?.curs || '';
  dom.entrySubject.value = effective?.assignatura || '';
  dom.entryActivity.value = effective?.activitat || '';
  dom.entryNotes.value = effective?.notes || '';
  dom.entryType.value = effective && isRecurring(effective) ? 'permanent' : 'ocasional';
  dom.entryActiveFrom.value = effective?.activeFrom || state.preferences.academicYearStart;
  dom.entryActiveUntil.value = effective?.activeUntil || state.preferences.academicYearEnd;
  dom.deleteEntry.classList.toggle('hidden', !effective);
  dom.skipEntry.classList.toggle('hidden', !(effective && isRecurring(effective) && !matches.specific));
  showFormMessage(dom.entryError);
  updateEntryTypeFields();
  dom.entryDialog.showModal();
  window.setTimeout(() => dom.entryCourse.focus(), 50);
}

function updateEntryTypeFields() {
  const recurring = dom.entryType.value === 'permanent';
  dom.activeFromField.classList.toggle('hidden', !recurring);
  dom.activeUntilField.classList.toggle('hidden', !recurring);
  const editingRecurring = state.currentEntry && isRecurring(state.currentEntry);
  dom.entryTypeHelp.textContent = recurring
    ? 'L’activitat apareixerà cada setmana dins del període indicat.'
    : editingRecurring
      ? 'Es crearà una excepció només per a aquesta setmana; la recurrència es conservarà.'
      : 'L’activitat només apareixerà durant aquesta setmana.';
}

async function saveCurrentEntry(event) {
  event.preventDefault();
  showFormMessage(dom.entryError);

  if (!state.user || !state.currentCell) return;
  const course = dom.entryCourse.value.trim();
  const subject = dom.entrySubject.value.trim();
  const activity = dom.entryActivity.value.trim();
  const notes = dom.entryNotes.value.trim();
  const type = dom.entryType.value;

  if (!course || !subject || !activity) {
    showFormMessage(dom.entryError, 'Cal indicar el curs, l’assignatura i l’activitat.');
    return;
  }

  const { day, slot, date, matches } = state.currentCell;
  const { startTime, endTime } = splitTimeSlot(slot);
  const iso = dateToISO(date);
  const common = {
    dia: day.key,
    dayIndex: day.index,
    hora: slot,
    startTime,
    endTime,
    curs: course,
    assignatura: subject,
    activitat: activity,
    notes,
    tipus: type
  };

  setBusy(dom.saveEntry, true);
  try {
    if (type === 'ocasional') {
      const payload = {
        ...common,
        any: iso.year,
        setmana: iso.week,
        dateKey: toDateKey(date),
        activeFrom: null,
        activeUntil: null,
        isCancelled: false
      };
      const targetId = matches.specific?.id || (state.currentEntry && !isRecurring(state.currentEntry) ? state.currentEntry.id : null);
      await saveScheduleEntry(state.user.uid, payload, targetId);
    } else {
      if (!dom.entryActiveFrom.value || !dom.entryActiveUntil.value || dom.entryActiveFrom.value > dom.entryActiveUntil.value) {
        showFormMessage(dom.entryError, 'Revisa les dates d’inici i finalització de la recurrència.');
        return;
      }
      const payload = {
        ...common,
        any: 0,
        setmana: 0,
        dateKey: null,
        activeFrom: dom.entryActiveFrom.value,
        activeUntil: dom.entryActiveUntil.value,
        isCancelled: false
      };
      const targetId = matches.recurring?.id || (state.currentEntry && isRecurring(state.currentEntry) ? state.currentEntry.id : null);
      await saveScheduleEntry(state.user.uid, payload, targetId);
      if (matches.specific?.id && matches.specific.id !== targetId) {
        await removeScheduleEntry(state.user.uid, matches.specific.id);
      }
    }

    dom.entryDialog.close();
    showToast('Activitat desada correctament.');
  } catch (error) {
    console.error(error);
    showFormMessage(dom.entryError, 'No s’ha pogut desar l’activitat. Torna-ho a provar.');
  } finally {
    setBusy(dom.saveEntry, false);
  }
}

function askConfirmation({ title, message, acceptLabel = 'Confirma' }) {
  dom.confirmTitle.textContent = title;
  dom.confirmMessage.textContent = message;
  dom.confirmAccept.textContent = acceptLabel;
  dom.confirmDialog.showModal();
  return new Promise(resolve => {
    state.confirmResolver = resolve;
  });
}

async function skipCurrentWeek() {
  if (!state.user || !state.currentCell || !state.currentEntry || !isRecurring(state.currentEntry)) return;
  const { day, slot, date } = state.currentCell;
  const iso = dateToISO(date);
  const { startTime, endTime } = splitTimeSlot(slot);
  const recurring = state.currentEntry;
  try {
    await saveScheduleEntry(state.user.uid, {
      dia: day.key,
      dayIndex: day.index,
      hora: slot,
      startTime,
      endTime,
      curs: recurring.curs || '',
      assignatura: recurring.assignatura || '',
      activitat: recurring.activitat || '',
      notes: recurring.notes || '',
      tipus: 'ocasional',
      any: iso.year,
      setmana: iso.week,
      dateKey: toDateKey(date),
      activeFrom: null,
      activeUntil: null,
      isCancelled: true
    }, state.currentCell.matches.specific?.id || null);
    dom.entryDialog.close();
    showToast('Activitat omesa durant aquesta setmana.');
  } catch (error) {
    console.error(error);
    showToast('No s’ha pogut crear l’excepció setmanal.', 'error');
  }
}

async function deleteCurrentEntry() {
  if (!state.user || !state.currentEntry) return;
  const recurring = isRecurring(state.currentEntry);
  const confirmed = await askConfirmation({
    title: recurring ? 'Elimina l’activitat recurrent?' : 'Elimina aquesta activitat?',
    message: recurring
      ? 'S’eliminarà de totes les setmanes del seu període de vigència.'
      : 'Aquesta acció només afecta la setmana seleccionada.',
    acceptLabel: 'Elimina'
  });
  if (!confirmed) return;

  try {
    await removeScheduleEntry(state.user.uid, state.currentEntry.id);
    dom.entryDialog.close();
    showToast('Activitat eliminada.');
  } catch (error) {
    console.error(error);
    showToast('No s’ha pogut eliminar l’activitat.', 'error');
  }
}

function fillSettingsForm() {
  dom.academicYearStart.value = state.preferences.academicYearStart;
  dom.academicYearEnd.value = state.preferences.academicYearEnd;
  dom.timeSlots.value = state.preferences.timeSlots.join('\n');
  showFormMessage(dom.settingsError);
}

async function saveSettings(event) {
  event.preventDefault();
  if (!state.user) return;
  const timeSlots = parseTimeSlots(dom.timeSlots.value);
  const start = dom.academicYearStart.value;
  const end = dom.academicYearEnd.value;

  if (!start || !end || start > end) {
    showFormMessage(dom.settingsError, 'Revisa les dates del curs acadèmic.');
    return;
  }
  if (!timeSlots.length) {
    showFormMessage(dom.settingsError, 'Afegeix com a mínim una franja horària vàlida.');
    return;
  }

  const submit = dom.settingsForm.querySelector('[type="submit"]');
  setBusy(submit, true);
  try {
    await savePreferences(state.user.uid, {
      academicYearStart: start,
      academicYearEnd: end,
      timeSlots
    });
    dom.settingsDialog.close();
    showToast('Configuració desada.');
  } catch (error) {
    console.error(error);
    showFormMessage(dom.settingsError, 'No s’ha pogut desar la configuració.');
  } finally {
    setBusy(submit, false);
  }
}

function exportBackup() {
  const payload = {
    product: 'Programeta',
    version: 2,
    exportedAt: new Date().toISOString(),
    preferences: state.preferences,
    entries: state.entries.map(({ id, ...entry }) => ({ id, ...entry }))
  };
  downloadTextFile(
    `programeta-copia-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify(payload, null, 2),
    'application/json;charset=utf-8'
  );
  showToast('Còpia de seguretat descarregada.');
}

async function importBackup(file) {
  if (!state.user || !file) return;
  try {
    const payload = JSON.parse(await file.text());
    if (!Array.isArray(payload.entries)) throw new Error('invalid-backup');
    const confirmed = await askConfirmation({
      title: 'Restaura la còpia de seguretat?',
      message: 'Les activitats actuals se substituiran per les de la còpia seleccionada.',
      acceptLabel: 'Restaura'
    });
    if (!confirmed) return;

    await replaceScheduleEntries(state.user.uid, payload.entries);
    if (payload.preferences) {
      await savePreferences(state.user.uid, {
        ...DEFAULT_PREFERENCES,
        ...payload.preferences,
        timeSlots: Array.isArray(payload.preferences.timeSlots)
          ? payload.preferences.timeSlots
          : DEFAULT_TIME_SLOTS
      });
    }
    dom.settingsDialog.close();
    showToast('Còpia restaurada correctament.');
  } catch (error) {
    console.error(error);
    showFormMessage(dom.settingsError, 'El fitxer no és una còpia vàlida de Programeta.');
  } finally {
    dom.importBackup.value = '';
  }
}

function exportLessonCsv() {
  if (!state.currentLessonResults.length) {
    showToast('No hi ha resultats per exportar.', 'error');
    return;
  }
  const lines = [
    ['Data', 'Dia', 'Hora', 'Curs', 'Assignatura', 'Activitat', 'Notes', 'Tipus'].join(',')
  ];
  for (const item of state.currentLessonResults) {
    lines.push([
      csvCell(item.dateKey),
      csvCell(item.day),
      csvCell(item.slot),
      csvCell(item.course),
      csvCell(item.subject),
      csvCell(item.activity),
      csvCell(item.notes),
      csvCell(item.recurring ? 'Recurrent' : 'Puntual')
    ].join(','));
  }
  downloadTextFile('programeta-lliconari.csv', `\uFEFF${lines.join('\n')}`, 'text/csv;charset=utf-8');
}

function setMainView(view) {
  dom.mainNavigation.querySelectorAll('.side-link').forEach(button => {
    button.classList.toggle('active', button.dataset.view === view);
  });
  dom.viewSchedule.classList.toggle('hidden', view !== 'schedule');
  dom.viewLessonbook.classList.toggle('hidden', view !== 'lessonbook');
  if (view === 'lessonbook') applyLessonFilters();
}

function setScheduleView(view) {
  dom.scheduleTabs.querySelectorAll('button').forEach(button => {
    button.classList.toggle('active', button.dataset.scheduleView === view);
  });
  dom.weekView.classList.toggle('hidden', view !== 'week');
  dom.yearView.classList.toggle('hidden', view !== 'year');
  if (view === 'year') renderYear();
}

function moveWeek(delta) {
  let { year, week } = state.selected;
  week += delta;
  if (week < 1) {
    year -= 1;
    week = weeksInYear(year);
  } else if (week > weeksInYear(year)) {
    year += 1;
    week = 1;
  }
  state.selected = { year, week };
  state.selectedYear = year;
  renderWeek();
  renderYear();
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  showFormMessage(dom.authError);
  showFormMessage(dom.authSuccess);
  const email = dom.authEmail.value.trim();
  const password = dom.authPassword.value;

  if (!email || !password) {
    showFormMessage(dom.authError, 'Introdueix el correu i la contrasenya.');
    return;
  }

  setBusy(dom.authSubmit, true, state.authMode === 'register' ? 'Creant…' : 'Entrant…');
  try {
    if (state.authMode === 'register') {
      await register(dom.authName.value, email, password);
      showToast('Compte creat correctament.');
    } else {
      await login(email, password);
    }
  } catch (error) {
    console.error(error);
    showFormMessage(dom.authError, friendlyAuthError(error));
  } finally {
    setBusy(dom.authSubmit, false);
  }
}

async function handleResetPassword() {
  showFormMessage(dom.authError);
  showFormMessage(dom.authSuccess);
  const email = dom.authEmail.value.trim();
  if (!email) {
    showFormMessage(dom.authError, 'Escriu el correu electrònic per recuperar la contrasenya.');
    return;
  }
  try {
    await resetPassword(email);
    showFormMessage(dom.authSuccess, 'T’hem enviat un correu per restablir la contrasenya.');
  } catch (error) {
    console.error(error);
    showFormMessage(dom.authError, friendlyAuthError(error));
  }
}

function attachEvents() {
  dom.mainNavigation.addEventListener('click', event => {
    const button = event.target.closest('[data-view]');
    if (button) setMainView(button.dataset.view);
  });

  dom.scheduleTabs.addEventListener('click', event => {
    const button = event.target.closest('[data-schedule-view]');
    if (button) setScheduleView(button.dataset.scheduleView);
  });

  dom.prevWeek.addEventListener('click', () => moveWeek(-1));
  dom.nextWeek.addEventListener('click', () => moveWeek(1));
  dom.todayWeek.addEventListener('click', () => {
    state.selected = currentISO();
    state.selectedYear = state.selected.year;
    renderWeek();
    renderYear();
  });

  dom.prevYear.addEventListener('click', () => {
    state.selectedYear -= 1;
    renderYear();
  });
  dom.nextYear.addEventListener('click', () => {
    state.selectedYear += 1;
    renderYear();
  });
  dom.yearGrid.addEventListener('click', event => {
    const card = event.target.closest('[data-week]');
    if (!card) return;
    state.selected = { year: Number(card.dataset.year), week: Number(card.dataset.week) };
    state.selectedYear = state.selected.year;
    setScheduleView('week');
    renderWeek();
  });

  dom.weekGrid.addEventListener('click', event => {
    const button = event.target.closest('[data-cell-key]');
    if (button) openEntryDialog(button.dataset.cellKey);
  });

  dom.entryType.addEventListener('change', updateEntryTypeFields);
  dom.entryForm.addEventListener('submit', saveCurrentEntry);
  dom.closeEntryDialog.addEventListener('click', () => dom.entryDialog.close());
  dom.cancelEntry.addEventListener('click', () => dom.entryDialog.close());
  dom.deleteEntry.addEventListener('click', deleteCurrentEntry);
  dom.skipEntry.addEventListener('click', skipCurrentWeek);

  dom.lessonFilters.addEventListener('submit', event => {
    event.preventDefault();
    applyLessonFilters();
  });
  dom.clearFilters.addEventListener('click', () => {
    dom.filterCourse.value = '';
    dom.filterSubject.value = '';
    dom.filterText.value = '';
    dom.filterFrom.value = state.preferences.academicYearStart;
    dom.filterUntil.value = state.preferences.academicYearEnd;
    applyLessonFilters();
  });
  dom.printResults.addEventListener('click', () => window.print());
  dom.exportCsv.addEventListener('click', exportLessonCsv);

  dom.openLogin.addEventListener('click', () => openAuthDialog('login'));
  dom.btnLogout.addEventListener('click', async () => {
    const confirmed = await askConfirmation({
      title: 'Vols tancar la sessió?',
      message: 'Les dades ja estan desades al núvol i les podràs recuperar quan tornis a entrar.',
      acceptLabel: 'Tanca la sessió'
    });
    if (confirmed) await logout();
  });

  dom.authForm.addEventListener('submit', handleAuthSubmit);
  dom.switchAuthMode.addEventListener('click', () => setAuthMode(state.authMode === 'login' ? 'register' : 'login'));
  dom.resetPassword.addEventListener('click', handleResetPassword);
  dom.togglePassword.addEventListener('click', () => {
    const visible = dom.authPassword.type === 'text';
    dom.authPassword.type = visible ? 'password' : 'text';
    dom.togglePassword.setAttribute('aria-label', visible ? 'Mostra la contrasenya' : 'Amaga la contrasenya');
  });
  dom.authDialog.addEventListener('cancel', event => {
    if (!state.user) event.preventDefault();
  });

  dom.openSettings.addEventListener('click', () => {
    fillSettingsForm();
    dom.settingsDialog.showModal();
  });
  dom.closeSettings.addEventListener('click', () => dom.settingsDialog.close());
  dom.cancelSettings.addEventListener('click', () => dom.settingsDialog.close());
  dom.settingsForm.addEventListener('submit', saveSettings);
  dom.exportBackup.addEventListener('click', exportBackup);
  dom.importBackup.addEventListener('change', () => importBackup(dom.importBackup.files?.[0]));

  dom.confirmCancel.addEventListener('click', () => {
    dom.confirmDialog.close();
    state.confirmResolver?.(false);
    state.confirmResolver = null;
  });
  dom.confirmAccept.addEventListener('click', () => {
    dom.confirmDialog.close();
    state.confirmResolver?.(true);
    state.confirmResolver = null;
  });
  dom.confirmDialog.addEventListener('cancel', event => {
    event.preventDefault();
    dom.confirmDialog.close();
    state.confirmResolver?.(false);
    state.confirmResolver = null;
  });
}

function subscribeUserData(user) {
  cleanupSubscriptions();
  state.unsubscribeEntries = watchScheduleEntries(user.uid, entries => {
    state.entries = entries;
    renderAll();
  }, error => {
    console.error(error);
    showToast('No s’ha pogut sincronitzar l’horari.', 'error');
  });

  state.unsubscribePreferences = watchPreferences(user.uid, preferences => {
    state.preferences = {
      ...DEFAULT_PREFERENCES,
      ...(preferences || {}),
      timeSlots: Array.isArray(preferences?.timeSlots) && preferences.timeSlots.length
        ? preferences.timeSlots
        : DEFAULT_TIME_SLOTS
    };
    dom.filterFrom.value = state.preferences.academicYearStart;
    dom.filterUntil.value = state.preferences.academicYearEnd;
    renderAll();
  }, error => {
    console.error(error);
    showToast('No s’han pogut carregar les preferències.', 'error');
  });
}

function initialize() {
  dom.currentYear.textContent = new Date().getFullYear();
  dom.filterFrom.value = state.preferences.academicYearStart;
  dom.filterUntil.value = state.preferences.academicYearEnd;
  attachEvents();

  watchAuth(user => {
    dom.loadingScreen.classList.add('hidden');
    state.user = user;
    if (user) {
      showAuthenticatedApp(user);
      if (dom.authDialog.open) dom.authDialog.close();
      subscribeUserData(user);
    } else {
      cleanupSubscriptions();
      showSignedOutApp();
      openAuthDialog('login');
    }
  });

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('./service-worker.js').catch(error => {
      console.warn('No s’ha pogut registrar el service worker.', error);
    });
  }
}

initialize();
