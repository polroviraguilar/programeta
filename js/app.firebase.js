import {
  addActivity,
  createOccurrenceException,
  deleteActivity,
  ensureUserProfile,
  exportUserBackup,
  getUserProfile,
  getUserSettings,
  loginWithEmail,
  logout,
  registerWithEmail,
  resetPassword,
  restoreUserBackup,
  saveUserSettings,
  subscribeActivities,
  subscribeAuth,
  updateActivity
} from './firebase.js';

import {
  addDays,
  addYears,
  capitalize,
  compareTimeSlots,
  createCsv,
  debounce,
  downloadBlob,
  eachWeekBetween,
  escapeHtml,
  formatDate,
  formatDateRange,
  formatLongDate,
  formatShortDate,
  formatTimeSlot,
  getAcademicYearForDate,
  getAcademicYearLabel,
  getDateFromISOWeek,
  getDayIndex,
  getDayKey,
  getISOWeekInfo,
  isDateInside,
  normalizeText,
  parseISODate,
  safeJsonParse,
  startOfISOWeek,
  toISODate,
  uniqueSorted
} from './utils.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

const DAY_KEYS = ['dilluns', 'dimarts', 'dimecres', 'dijous', 'divendres'];
const DAY_LABELS = {
  dilluns: 'Dilluns',
  dimarts: 'Dimarts',
  dimecres: 'Dimecres',
  dijous: 'Dijous',
  divendres: 'Divendres'
};

const DEFAULT_TIME_SLOTS = [
  { id: 'slot-0900', start: '09:00', end: '10:00' },
  { id: 'slot-1000', start: '10:00', end: '11:00' },
  { id: 'slot-1130', start: '11:30', end: '12:30' },
  { id: 'slot-1230', start: '12:30', end: '13:30' },
  { id: 'slot-1500', start: '15:00', end: '16:00' },
  { id: 'slot-1600', start: '16:00', end: '17:00' }
];

function buildDefaultSettings() {
  const academicYear = getAcademicYearForDate(new Date());
  return {
    academicStart: toISODate(academicYear.start),
    academicEnd: toISODate(academicYear.end),
    timeSlots: structuredClone(DEFAULT_TIME_SLOTS),
    courses: [],
    subjects: [],
    theme: localStorage.getItem('programeta-theme-preference') || 'system',
    schemaVersion: 2
  };
}

const initialWeek = getISOWeekInfo(new Date());

const state = {
  user: null,
  profile: null,
  settings: buildDefaultSettings(),
  settingsDraft: null,
  settingsDirty: false,
  activities: [],
  selectedWeek: { year: initialWeek.year, week: initialWeek.week },
  academicViewStart: null,
  academicViewEnd: null,
  currentSection: 'schedule',
  scheduleView: 'week',
  weekMode: window.matchMedia('(max-width: 680px)').matches ? 'agenda' : 'grid',
  editingContext: null,
  currentLibraryRows: [],
  unsubscribeActivities: null,
  confirmResolver: null,
  firstRun: false
};

const dom = {
  authView: $('#authView'),
  appView: $('#appView'),
  authMessage: $('#authMessage'),
  loginForm: $('#loginForm'),
  registerForm: $('#registerForm'),
  resetForm: $('#resetForm'),
  globalLoader: $('#globalLoader'),
  syncStatus: $('#syncStatus'),
  syncLabel: $('#syncStatus .sync-label'),
  userMenu: $('#userMenu'),
  userMenuToggle: $('#userMenuToggle'),
  sidebar: $('#sidebar'),
  sidebarBackdrop: $('#sidebarBackdrop'),
  activityDrawer: $('#activityDrawer'),
  activityBackdrop: $('#activityBackdrop'),
  activityForm: $('#activityForm'),
  confirmDialog: $('#confirmDialog'),
  toastRegion: $('#toastRegion')
};

/* ==========================================================
   TEMA
   ========================================================== */

function resolveTheme(preference) {
  if (preference === 'dark' || preference === 'light') return preference;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(preference, persist = true) {
  const normalizedPreference = ['light', 'dark', 'system'].includes(preference) ? preference : 'system';
  const resolvedTheme = resolveTheme(normalizedPreference);

  document.documentElement.dataset.theme = resolvedTheme;
  localStorage.setItem('programeta-theme', resolvedTheme);
  localStorage.setItem('programeta-theme-preference', normalizedPreference);

  const lightLogo = 'assets/logo-tipo-umbra.png';
  const darkLogo = 'assets/logo-tipo-yellow.png';
  const source = resolvedTheme === 'dark' ? darkLogo : lightLogo;

  const authLogo = $('#authBrandLogo');
  const appLogo = $('#appBrandLogo');
  if (authLogo) authLogo.src = lightLogo;
  if (appLogo) appLogo.src = source;

  const themeSelect = $('#settingsTheme');
  if (themeSelect) themeSelect.value = normalizedPreference;

  if (persist && state.settings) {
    state.settings.theme = normalizedPreference;
  }
}

function toggleTheme() {
  const current = document.documentElement.dataset.theme;
  const next = current === 'dark' ? 'light' : 'dark';
  if (state.settingsDraft) state.settingsDraft.theme = next;
  applyTheme(next);
  if (state.user) markSettingsDirty();
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if ((state.settings?.theme || 'system') === 'system') applyTheme('system', false);
});

['#authThemeToggle', '#themeToggle', '#sidebarThemeToggle'].forEach(selector => {
  $(selector)?.addEventListener('click', toggleTheme);
});

/* ==========================================================
   MISSATGES I ESTATS
   ========================================================== */

function setLoading(loading) {
  dom.globalLoader?.classList.toggle('hidden', !loading);
}

function setSyncState(syncState, label) {
  if (!dom.syncStatus) return;
  dom.syncStatus.dataset.state = syncState;
  if (dom.syncLabel) dom.syncLabel.textContent = label;
}

function showAuthMessage(message, type = 'error') {
  if (!dom.authMessage) return;
  dom.authMessage.textContent = message;
  dom.authMessage.classList.remove('hidden', 'success');
  if (type === 'success') dom.authMessage.classList.add('success');
}

function clearAuthMessage() {
  dom.authMessage?.classList.add('hidden');
  if (dom.authMessage) dom.authMessage.textContent = '';
}

function showToast(title, message = '', type = 'info', duration = 4200) {
  const icon = type === 'success'
    ? '<path d="m5 12 4 4L19 6"/>'
    : type === 'error'
      ? '<path d="M12 8v5M12 17h.01"/><circle cx="12" cy="12" r="9"/>'
      : type === 'warning'
        ? '<path d="M12 8v5M12 17h.01"/><path d="M10.3 3.8 2.6 17.1A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.9L13.7 3.8a2 2 0 0 0-3.4 0Z"/>'
        : '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>';

  const toast = document.createElement('article');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon" aria-hidden="true"><svg viewBox="0 0 24 24">${icon}</svg></span>
    <span class="toast-copy"><strong>${escapeHtml(title)}</strong>${message ? `<span>${escapeHtml(message)}</span>` : ''}</span>
    <button class="toast-close" type="button" aria-label="Tanca la notificació"><svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
  `;

  dom.toastRegion?.append(toast);
  const close = () => toast.remove();
  toast.querySelector('.toast-close')?.addEventListener('click', close);
  window.setTimeout(close, duration);
}

function translateAuthError(error) {
  const code = error?.code || '';
  const messages = {
    'auth/invalid-credential': 'El correu o la contrasenya no són correctes.',
    'auth/invalid-email': 'El correu electrònic no és vàlid.',
    'auth/email-already-in-use': 'Ja existeix un compte amb aquest correu.',
    'auth/weak-password': 'La contrasenya ha de tenir com a mínim 6 caràcters.',
    'auth/too-many-requests': 'S’han fet massa intents. Torna-ho a provar més tard.',
    'auth/network-request-failed': 'No s’ha pogut connectar amb el servidor. Revisa la connexió.',
    'auth/user-disabled': 'Aquest compte està desactivat.'
  };
  return messages[code] || error?.message || 'S’ha produït un error inesperat.';
}

function confirmAction({ title, message, acceptLabel = 'Confirma', danger = true }) {
  $('#confirmTitle').textContent = title;
  $('#confirmMessage').textContent = message;
  const acceptButton = $('#confirmAcceptButton');
  acceptButton.textContent = acceptLabel;
  acceptButton.classList.toggle('button-danger', danger);
  acceptButton.classList.toggle('button-primary', !danger);

  dom.confirmDialog.showModal();
  return new Promise(resolve => {
    state.confirmResolver = resolve;
  });
}

$('#confirmCancelButton')?.addEventListener('click', () => {
  dom.confirmDialog.close();
  state.confirmResolver?.(false);
  state.confirmResolver = null;
});

$('#confirmAcceptButton')?.addEventListener('click', () => {
  dom.confirmDialog.close();
  state.confirmResolver?.(true);
  state.confirmResolver = null;
});

/* ==========================================================
   AUTENTICACIÓ
   ========================================================== */

function showAuthPanel(panel) {
  clearAuthMessage();
  [dom.loginForm, dom.registerForm, dom.resetForm].forEach(form => form?.classList.add('hidden'));
  panel?.classList.remove('hidden');
}

$('#showRegister')?.addEventListener('click', () => showAuthPanel(dom.registerForm));
$('#showReset')?.addEventListener('click', () => {
  $('#resetEmail').value = $('#loginEmail').value;
  showAuthPanel(dom.resetForm);
});
$('#backToLoginFromRegister')?.addEventListener('click', () => showAuthPanel(dom.loginForm));
$('#backToLoginFromReset')?.addEventListener('click', () => showAuthPanel(dom.loginForm));

$$('[data-password-target]').forEach(button => {
  button.addEventListener('click', () => {
    const input = document.getElementById(button.dataset.passwordTarget);
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
  });
});

dom.loginForm?.addEventListener('submit', async event => {
  event.preventDefault();
  clearAuthMessage();

  if (!dom.loginForm.reportValidity()) return;
  const submit = $('#loginSubmit');
  submit.disabled = true;

  try {
    await loginWithEmail($('#loginEmail').value, $('#loginPassword').value);
  } catch (error) {
    showAuthMessage(translateAuthError(error));
  } finally {
    submit.disabled = false;
  }
});

dom.registerForm?.addEventListener('submit', async event => {
  event.preventDefault();
  clearAuthMessage();

  if (!dom.registerForm.reportValidity()) return;
  const password = $('#registerPassword').value;
  if (password !== $('#registerPasswordConfirm').value) {
    showAuthMessage('Les contrasenyes no coincideixen.');
    return;
  }

  const submit = $('#registerSubmit');
  submit.disabled = true;

  try {
    await registerWithEmail($('#registerName').value, $('#registerEmail').value, password);
  } catch (error) {
    showAuthMessage(translateAuthError(error));
  } finally {
    submit.disabled = false;
  }
});

dom.resetForm?.addEventListener('submit', async event => {
  event.preventDefault();
  clearAuthMessage();

  if (!dom.resetForm.reportValidity()) return;
  const submit = $('#resetSubmit');
  submit.disabled = true;

  try {
    await resetPassword($('#resetEmail').value);
    showAuthMessage('T’hem enviat l’enllaç de recuperació. Revisa el correu.', 'success');
  } catch (error) {
    showAuthMessage(translateAuthError(error));
  } finally {
    submit.disabled = false;
  }
});

async function enterApplication(user) {
  setLoading(true);
  state.user = user;

  try {
    await ensureUserProfile(user);
    const [profile, storedSettings] = await Promise.all([
      getUserProfile(user.uid),
      getUserSettings(user.uid)
    ]);

    state.profile = profile || {
      displayName: user.displayName || '',
      email: user.email || ''
    };

    state.firstRun = !storedSettings;
    state.settings = normalizeSettings(storedSettings || buildDefaultSettings());
    state.settingsDraft = structuredClone(state.settings);
    state.academicViewStart = parseISODate(state.settings.academicStart);
    state.academicViewEnd = parseISODate(state.settings.academicEnd);

    applyTheme(state.settings.theme || 'system', false);
    updateUserInterface();
    populateSettingsForm();
    populateActivityOptions();

    dom.authView.classList.add('hidden');
    dom.appView.classList.remove('hidden');

    if (state.unsubscribeActivities) state.unsubscribeActivities();
    setSyncState('saving', 'Sincronitzant');
    state.unsubscribeActivities = subscribeActivities(
      user.uid,
      rows => {
        state.activities = rows.map(normalizeActivity);
        setSyncState('saved', 'Desat');
        renderAllDataViews();
      },
      error => {
        console.error(error);
        setSyncState('error', 'Error de sincronització');
        showToast('No s’han pogut carregar les dades', 'Comprova la connexió i les regles de Firestore.', 'error');
      }
    );

    if (state.firstRun) {
      navigateTo('settings');
      showToast('Configura Programeta', 'Comença indicant el curs, les franges, els cursos i les assignatures.', 'info', 6500);
    } else {
      navigateTo('schedule');
    }
  } catch (error) {
    console.error(error);
    showToast('No s’ha pogut obrir Programeta', error.message, 'error');
  } finally {
    setLoading(false);
  }
}

function leaveApplication() {
  state.user = null;
  state.profile = null;
  state.activities = [];
  state.unsubscribeActivities?.();
  state.unsubscribeActivities = null;

  dom.appView.classList.add('hidden');
  dom.authView.classList.remove('hidden');
  showAuthPanel(dom.loginForm);
  closeUserMenu();
  closeSidebarOnMobile();
  closeActivityDrawer();
  setSyncState('idle', 'Preparat');
}

subscribeAuth(user => {
  if (user) enterApplication(user);
  else leaveApplication();
});

$('#logoutButton')?.addEventListener('click', async () => {
  closeUserMenu();
  await logout();
});

/* ==========================================================
   NORMALITZACIÓ I MODEL D'ACTIVITATS
   ========================================================== */

function normalizeSettings(settings) {
  const defaults = buildDefaultSettings();
  const merged = { ...defaults, ...(settings || {}) };
  merged.timeSlots = Array.isArray(merged.timeSlots) && merged.timeSlots.length
    ? merged.timeSlots.map((slot, index) => ({
        id: slot.id || `slot-${index}-${String(slot.start || '').replace(':', '')}`,
        start: slot.start || String(slot).split(/[-–]/)[0]?.trim() || '09:00',
        end: slot.end || String(slot).split(/[-–]/)[1]?.trim() || '10:00'
      })).sort(compareTimeSlots)
    : structuredClone(DEFAULT_TIME_SLOTS);
  merged.courses = uniqueSorted(merged.courses || []);
  merged.subjects = uniqueSorted(merged.subjects || []);
  return merged;
}

function normalizeTimeKey(value = '') {
  return String(value).replace(/\s/g, '').replace('–', '-');
}

function getSlotKey(slot) {
  return normalizeTimeKey(`${slot.start}-${slot.end}`);
}

function normalizeActivity(raw) {
  const year = Number(raw.any ?? raw.year ?? 0);
  const week = Number(raw.setmana ?? raw.week ?? 0);
  const type = raw.tipus || raw.type || (week === 0 ? 'permanent' : 'ocasional');

  return {
    ...raw,
    id: raw.id,
    tipus: type,
    any: year,
    setmana: week,
    dia: normalizeText(raw.dia || raw.day || ''),
    hora: normalizeTimeKey(raw.hora || raw.time || ''),
    curs: String(raw.curs || raw.course || '').trim(),
    assignatura: String(raw.assignatura || raw.subject || '').trim(),
    activitat: String(raw.activitat || raw.title || raw.titol || '').trim(),
    notes: String(raw.notes || raw.descripcio || raw.description || '').trim(),
    data: raw.data || raw.date || '',
    recurrenceStart: raw.recurrenceStart || raw.dataInici || '',
    recurrenceEnd: raw.recurrenceEnd || raw.dataFi || '',
    referenciaPermanentId: raw.referenciaPermanentId || raw.permanentReferenceId || ''
  };
}

function getActivityOccurrenceDate(activity, year, week) {
  if (activity.data && activity.tipus !== 'permanent') return parseISODate(activity.data);
  return getDateFromISOWeek(year, week, getDayIndex(activity.dia));
}

function permanentIsActive(activity, occurrenceDate) {
  const start = parseISODate(activity.recurrenceStart || state.settings.academicStart);
  const end = parseISODate(activity.recurrenceEnd || state.settings.academicEnd);
  return isDateInside(occurrenceDate, start, end);
}

function resolveWeek(year, week) {
  const resolvedMap = new Map();
  const monday = getDateFromISOWeek(year, week, 0);
  const currentWeekActivities = state.activities.filter(activity => activity.any === year && activity.setmana === week);
  const exceptions = new Set(
    currentWeekActivities
      .filter(activity => activity.tipus === 'excepcio' && activity.referenciaPermanentId)
      .map(activity => activity.referenciaPermanentId)
  );

  state.activities
    .filter(activity => activity.tipus === 'permanent')
    .forEach(activity => {
      const occurrenceDate = addDays(monday, getDayIndex(activity.dia));
      if (!DAY_KEYS.includes(activity.dia)) return;
      if (exceptions.has(activity.id)) return;
      if (!permanentIsActive(activity, occurrenceDate)) return;

      resolvedMap.set(`${activity.dia}|${activity.hora}`, {
        activity,
        occurrenceDate,
        isOverride: false
      });
    });

  currentWeekActivities
    .filter(activity => activity.tipus === 'ocasional')
    .forEach(activity => {
      const occurrenceDate = getActivityOccurrenceDate(activity, year, week);
      const key = `${activity.dia}|${activity.hora}`;
      resolvedMap.set(key, {
        activity,
        occurrenceDate,
        isOverride: resolvedMap.has(key)
      });
    });

  return {
    map: resolvedMap,
    rows: [...resolvedMap.values()].sort((a, b) => {
      const dateDifference = a.occurrenceDate - b.occurrenceDate;
      return dateDifference || a.activity.hora.localeCompare(b.activity.hora);
    })
  };
}

/* ==========================================================
   NAVEGACIÓ I SIDEBAR
   ========================================================== */

function isMobileNavigation() {
  return window.matchMedia('(max-width: 900px)').matches;
}

function updateSidebarExpandedState() {
  const expanded = isMobileNavigation()
    ? document.body.classList.contains('sidebar-mobile-open')
    : !document.body.classList.contains('sidebar-collapsed');
  $('#sidebarToggle')?.setAttribute('aria-expanded', String(expanded));
}

function toggleSidebar() {
  if (isMobileNavigation()) {
    const opening = !document.body.classList.contains('sidebar-mobile-open');
    document.body.classList.toggle('sidebar-mobile-open', opening);
    dom.sidebarBackdrop.classList.toggle('hidden', !opening);
  } else {
    document.body.classList.toggle('sidebar-collapsed');
    localStorage.setItem('programeta-sidebar-collapsed', String(document.body.classList.contains('sidebar-collapsed')));
  }
  updateSidebarExpandedState();
}

function closeSidebarOnMobile() {
  document.body.classList.remove('sidebar-mobile-open');
  dom.sidebarBackdrop?.classList.add('hidden');
  updateSidebarExpandedState();
}

$('#sidebarToggle')?.addEventListener('click', toggleSidebar);
dom.sidebarBackdrop?.addEventListener('click', closeSidebarOnMobile);

if (localStorage.getItem('programeta-sidebar-collapsed') === 'true' && !isMobileNavigation()) {
  document.body.classList.add('sidebar-collapsed');
}
updateSidebarExpandedState();

window.addEventListener('resize', debounce(() => {
  if (!isMobileNavigation()) closeSidebarOnMobile();
  updateSidebarExpandedState();
}, 120));

function navigateTo(section) {
  const pages = {
    schedule: $('#pageSchedule'),
    library: $('#pageLibrary'),
    settings: $('#pageSettings')
  };

  Object.entries(pages).forEach(([key, page]) => page?.classList.toggle('hidden', key !== section));
  state.currentSection = section;

  $$('[data-section]').forEach(button => {
    button.classList.toggle('active', button.dataset.section === section);
  });

  const titleMap = { schedule: 'Horari', library: 'Lliçonari', settings: 'Configuració' };
  $('#currentSectionTitle').textContent = titleMap[section] || 'Programeta';

  if (section === 'library') renderLibrary();
  if (section === 'settings') populateSettingsForm();

  closeSidebarOnMobile();
  closeUserMenu();
  $('#mainContent')?.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

$$('[data-section]').forEach(button => {
  button.addEventListener('click', () => navigateTo(button.dataset.section));
});

function closeUserMenu() {
  dom.userMenu?.classList.add('hidden');
  dom.userMenuToggle?.setAttribute('aria-expanded', 'false');
}

dom.userMenuToggle?.addEventListener('click', event => {
  event.stopPropagation();
  const opening = dom.userMenu.classList.contains('hidden');
  dom.userMenu.classList.toggle('hidden', !opening);
  dom.userMenuToggle.setAttribute('aria-expanded', String(opening));
});

document.addEventListener('click', event => {
  if (!event.target.closest('.user-menu-wrap')) closeUserMenu();
});

$$('[data-user-action]').forEach(button => {
  button.addEventListener('click', async () => {
    const action = button.dataset.userAction;
    closeUserMenu();
    if (action === 'settings') navigateTo('settings');
    if (action === 'backup') await exportBackup();
    if (action === 'help') $('#helpDialog')?.showModal();
  });
});

$('#sidebarHelpButton')?.addEventListener('click', () => {
  closeSidebarOnMobile();
  $('#helpDialog')?.showModal();
});

$$('[data-dialog-close]').forEach(button => {
  button.addEventListener('click', () => document.getElementById(button.dataset.dialogClose)?.close());
});

/* ==========================================================
   INTERFÍCIE D'USUARI
   ========================================================== */

function updateUserInterface() {
  const displayName = state.profile?.displayName || state.user?.displayName || state.user?.email?.split('@')[0] || 'Usuari';
  const email = state.user?.email || state.profile?.email || '';
  const initial = displayName.trim().charAt(0).toLocaleUpperCase('ca-ES') || 'P';

  $('#userAvatar').textContent = initial;
  $('#userDisplayName').textContent = displayName;
  $('#userEmail').textContent = email;
  $('#userMenuName').textContent = displayName;
  $('#userMenuEmail').textContent = email;
}

function renderAllDataViews() {
  renderWeek();
  renderYear();
  populateActivityOptions();
  populateLibraryFilters();
  if (state.currentSection === 'library') renderLibrary();
}

/* ==========================================================
   HORARI SETMANAL
   ========================================================== */

function setScheduleView(view) {
  state.scheduleView = view;
  $('#weekView').classList.toggle('hidden', view !== 'week');
  $('#yearView').classList.toggle('hidden', view !== 'year');

  $$('[data-schedule-view]').forEach(button => {
    const active = button.dataset.scheduleView === view;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });

  if (view === 'week') renderWeek();
  else renderYear();
}

$$('[data-schedule-view]').forEach(button => {
  button.addEventListener('click', () => setScheduleView(button.dataset.scheduleView));
});

function setWeekMode(mode) {
  state.weekMode = mode;
  const isAgenda = mode === 'agenda';
  $('#weekGridCard').classList.toggle('hidden', isAgenda);
  $('#agendaView').classList.toggle('hidden', !isAgenda);
  $$('[data-week-mode]').forEach(button => button.classList.toggle('active', button.dataset.weekMode === mode));
  localStorage.setItem('programeta-week-mode', mode);
}

const storedWeekMode = localStorage.getItem('programeta-week-mode');
if (storedWeekMode && !window.matchMedia('(max-width: 680px)').matches) state.weekMode = storedWeekMode;
$$('[data-week-mode]').forEach(button => button.addEventListener('click', () => setWeekMode(button.dataset.weekMode)));

function changeWeek(offset) {
  const currentMonday = getDateFromISOWeek(state.selectedWeek.year, state.selectedWeek.week, 0);
  const nextInfo = getISOWeekInfo(addDays(currentMonday, offset * 7));
  state.selectedWeek = { year: nextInfo.year, week: nextInfo.week };
  renderWeek();
}

$('#previousWeekButton')?.addEventListener('click', () => changeWeek(-1));
$('#nextWeekButton')?.addEventListener('click', () => changeWeek(1));
$('#todayButton')?.addEventListener('click', () => {
  const current = getISOWeekInfo(new Date());
  state.selectedWeek = { year: current.year, week: current.week };
  renderWeek();
});

function renderWeek() {
  const { year, week } = state.selectedWeek;
  const monday = getDateFromISOWeek(year, week, 0);
  const friday = addDays(monday, 4);
  const resolved = resolveWeek(year, week);
  const today = toISODate(new Date());

  $('#weekLabel').textContent = `Setmana ${week}`;
  $('#weekRange').textContent = formatDateRange(monday, friday);
  $('#weekActivityCount').textContent = `${resolved.rows.length} ${resolved.rows.length === 1 ? 'activitat' : 'activitats'}`;

  const slots = state.settings.timeSlots;
  let html = '<thead><tr><th>Hora</th>';

  DAY_KEYS.forEach((day, index) => {
    const date = addDays(monday, index);
    const isToday = toISODate(date) === today;
    html += `<th><span class="day-heading ${isToday ? 'today' : ''}"><strong>${DAY_LABELS[day]}</strong><span>${escapeHtml(formatShortDate(date))}</span></span></th>`;
  });
  html += '</tr></thead><tbody>';

  slots.forEach(slot => {
    const slotKey = getSlotKey(slot);
    html += `<tr><th>${escapeHtml(formatTimeSlot(slot))}</th>`;

    DAY_KEYS.forEach((day, index) => {
      const date = addDays(monday, index);
      const dateString = toISODate(date);
      const resolvedEntry = resolved.map.get(`${day}|${slotKey}`);
      const isToday = dateString === today;

      html += `<td class="schedule-cell ${isToday ? 'is-today' : ''}"><div class="schedule-cell-content">`;
      if (resolvedEntry) html += renderActivityCard(resolvedEntry);
      else html += renderAddCellButton(dateString, slotKey);
      html += '</div></td>';
    });

    html += '</tr>';
  });

  html += '</tbody>';
  $('#weekGrid').innerHTML = html;
  renderAgenda(resolved, monday);
  setWeekMode(window.matchMedia('(max-width: 680px)').matches ? 'agenda' : state.weekMode);
}

function renderActivityCard(resolvedEntry) {
  const { activity, occurrenceDate, isOverride } = resolvedEntry;
  const typeLabel = activity.tipus === 'permanent' ? 'Recurrent' : isOverride ? 'Substitució' : 'Ocasional';
  const classes = [
    'activity-card',
    activity.tipus === 'ocasional' ? 'is-occasional' : '',
    isOverride ? 'is-override' : ''
  ].filter(Boolean).join(' ');

  return `
    <button class="${classes}" type="button" data-edit-activity="${escapeHtml(activity.id)}" data-occurrence-date="${toISODate(occurrenceDate)}">
      <span class="activity-meta">${escapeHtml(activity.curs)} · ${escapeHtml(activity.assignatura)}</span>
      <span class="activity-title">${escapeHtml(activity.activitat || 'Activitat sense títol')}</span>
      <span class="activity-type">${typeLabel}</span>
      <span class="edit-indicator" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z"/><path d="m14.5 7.5 3 3"/></svg></span>
    </button>
  `;
}

function renderAddCellButton(date, slotKey) {
  return `
    <button class="add-cell-button" type="button" data-add-date="${date}" data-add-slot="${escapeHtml(slotKey)}">
      <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
      Afegeix
    </button>
  `;
}

function renderAgenda(resolved, monday) {
  const byDay = new Map(DAY_KEYS.map(day => [day, []]));
  resolved.rows.forEach(entry => byDay.get(entry.activity.dia)?.push(entry));

  $('#agendaView').innerHTML = DAY_KEYS.map((day, index) => {
    const date = addDays(monday, index);
    const rows = byDay.get(day) || [];
    const items = rows.length
      ? rows.map(({ activity, occurrenceDate }) => `
          <button class="agenda-item" type="button" data-edit-activity="${escapeHtml(activity.id)}" data-occurrence-date="${toISODate(occurrenceDate)}">
            <span class="agenda-time">${escapeHtml(activity.hora.replace('-', '–'))}</span>
            <span class="agenda-copy"><strong>${escapeHtml(activity.activitat || 'Activitat sense títol')}</strong><small>${escapeHtml(activity.curs)} · ${escapeHtml(activity.assignatura)}</small></span>
            <span class="agenda-type">${activity.tipus === 'permanent' ? 'Recurrent' : 'Ocasional'}</span>
          </button>
        `).join('')
      : `<div class="agenda-empty">Cap activitat. <button class="text-button" type="button" data-add-date="${toISODate(date)}" data-add-slot="${getSlotKey(state.settings.timeSlots[0])}">Afegeix-ne una</button></div>`;

    return `
      <section class="agenda-day">
        <header class="agenda-day-header"><h3>${DAY_LABELS[day]}</h3><span>${escapeHtml(formatLongDate(date))}</span></header>
        <div class="agenda-list">${items}</div>
      </section>
    `;
  }).join('');
}

$('#weekGrid')?.addEventListener('click', handleScheduleInteraction);
$('#agendaView')?.addEventListener('click', handleScheduleInteraction);

function handleScheduleInteraction(event) {
  const editButton = event.target.closest('[data-edit-activity]');
  if (editButton) {
    const activity = state.activities.find(item => item.id === editButton.dataset.editActivity);
    if (activity) openActivityDrawer({ activity, occurrenceDate: parseISODate(editButton.dataset.occurrenceDate) });
    return;
  }

  const addButton = event.target.closest('[data-add-date]');
  if (addButton) openActivityDrawer({ date: parseISODate(addButton.dataset.addDate), slotKey: addButton.dataset.addSlot });
}

$('#newActivityButton')?.addEventListener('click', () => {
  const today = new Date();
  const currentInfo = getISOWeekInfo(today);
  const selectedMonday = getDateFromISOWeek(state.selectedWeek.year, state.selectedWeek.week, 0);
  const date = currentInfo.year === state.selectedWeek.year && currentInfo.week === state.selectedWeek.week && today.getDay() >= 1 && today.getDay() <= 5
    ? today
    : selectedMonday;
  openActivityDrawer({ date, slotKey: getSlotKey(state.settings.timeSlots[0]) });
});

/* ==========================================================
   DRAWER I CRUD D'ACTIVITATS
   ========================================================== */

function populateActivityOptions() {
  const slotSelect = $('#activityTimeSlot');
  slotSelect.innerHTML = state.settings.timeSlots.map(slot => `<option value="${getSlotKey(slot)}">${escapeHtml(formatTimeSlot(slot))}</option>`).join('');

  const activityCourses = uniqueSorted([
    ...state.settings.courses,
    ...state.activities.map(activity => activity.curs)
  ]);
  const activitySubjects = uniqueSorted([
    ...state.settings.subjects,
    ...state.activities.map(activity => activity.assignatura)
  ]);

  $('#courseSuggestions').innerHTML = activityCourses.map(value => `<option value="${escapeHtml(value)}"></option>`).join('');
  $('#subjectSuggestions').innerHTML = activitySubjects.map(value => `<option value="${escapeHtml(value)}"></option>`).join('');
}

function openActivityDrawer({ activity = null, occurrenceDate = null, date = null, slotKey = null } = {}) {
  state.editingContext = activity ? { activity, occurrenceDate } : null;
  dom.activityForm.reset();

  $('#activityId').value = activity?.id || '';
  $('#activityOriginalType').value = activity?.tipus || '';
  $('#activityDrawerTitle').textContent = activity ? 'Edita l’activitat' : 'Nova activitat';

  const selectedDate = occurrenceDate || date || getDateFromISOWeek(state.selectedWeek.year, state.selectedWeek.week, 0);
  $('#activityDate').value = toISODate(selectedDate);
  $('#activityTimeSlot').value = activity?.hora || slotKey || getSlotKey(state.settings.timeSlots[0]);
  $('#activityCourse').value = activity?.curs || '';
  $('#activitySubject').value = activity?.assignatura || '';
  $('#activityTitle').value = activity?.activitat || '';
  $('#activityNotes').value = activity?.notes || '';
  $('#activityType').value = activity?.tipus === 'permanent' ? 'permanent' : 'ocasional';
  $('#recurrenceStart').value = activity?.recurrenceStart || state.settings.academicStart;
  $('#recurrenceEnd').value = activity?.recurrenceEnd || state.settings.academicEnd;

  updateRecurrenceFields();
  $('#deleteActivityButton').classList.toggle('hidden', !activity);
  $('#skipOccurrenceButton').classList.toggle('hidden', activity?.tipus !== 'permanent');

  dom.activityBackdrop.classList.remove('hidden');
  dom.activityDrawer.classList.add('open');
  dom.activityDrawer.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';

  window.setTimeout(() => $('#activityCourse')?.focus(), 220);
}

function closeActivityDrawer() {
  dom.activityDrawer?.classList.remove('open');
  dom.activityDrawer?.setAttribute('aria-hidden', 'true');
  dom.activityBackdrop?.classList.add('hidden');
  document.body.style.overflow = '';
  state.editingContext = null;
}

$('#closeActivityDrawerButton')?.addEventListener('click', closeActivityDrawer);
$('#cancelActivityButton')?.addEventListener('click', closeActivityDrawer);
dom.activityBackdrop?.addEventListener('click', closeActivityDrawer);

function updateRecurrenceFields() {
  $('#recurrenceFields').classList.toggle('hidden', $('#activityType').value !== 'permanent');
}
$('#activityType')?.addEventListener('change', updateRecurrenceFields);

function buildActivityPayload() {
  const date = parseISODate($('#activityDate').value);
  const iso = getISOWeekInfo(date);
  const type = $('#activityType').value;

  return {
    dia: getDayKey(date),
    hora: normalizeTimeKey($('#activityTimeSlot').value),
    curs: $('#activityCourse').value.trim(),
    assignatura: $('#activitySubject').value.trim(),
    activitat: $('#activityTitle').value.trim(),
    notes: $('#activityNotes').value.trim(),
    tipus: type,
    any: type === 'permanent' ? 0 : iso.year,
    setmana: type === 'permanent' ? 0 : iso.week,
    data: type === 'permanent' ? '' : toISODate(date),
    recurrenceStart: type === 'permanent' ? $('#recurrenceStart').value : '',
    recurrenceEnd: type === 'permanent' ? $('#recurrenceEnd').value : ''
  };
}

function validateActivityPayload(payload) {
  if (!DAY_KEYS.includes(payload.dia)) return 'Programeta està configurada de dilluns a divendres. Escull un dia lectiu.';
  if (!payload.curs || !payload.assignatura || !payload.activitat) return 'Omple el curs, l’assignatura i l’activitat.';
  if (payload.tipus === 'permanent') {
    const start = parseISODate(payload.recurrenceStart);
    const end = parseISODate(payload.recurrenceEnd);
    if (!start || !end || start > end) return 'Les dates de repetició no són correctes.';
  }
  return '';
}

dom.activityForm?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!dom.activityForm.reportValidity()) return;

  const payload = buildActivityPayload();
  const error = validateActivityPayload(payload);
  if (error) {
    showToast('Revisa l’activitat', error, 'warning');
    return;
  }

  const current = state.editingContext?.activity || null;
  const selectedDateInfo = getISOWeekInfo(parseISODate($('#activityDate').value));
  const existing = resolveWeek(selectedDateInfo.year, selectedDateInfo.week).map.get(`${payload.dia}|${payload.hora}`);

  if (!current && existing) {
    showToast('Aquesta franja ja està ocupada', 'Edita l’activitat existent des del calendari.', 'warning');
    return;
  }

  setSyncState('saving', 'Desant');
  $('#saveActivityButton').disabled = true;

  try {
    if (!current) {
      await addActivity(state.user.uid, payload);
      showToast('Activitat creada', 'Ja apareix a l’horari i al lliçonari.', 'success');
    } else if (current.tipus === 'permanent' && payload.tipus === 'ocasional') {
      await addActivity(state.user.uid, payload);
      showToast('Substitució creada', 'La recurrent es manté a les altres setmanes.', 'success');
    } else {
      await updateActivity(state.user.uid, current.id, payload);
      showToast('Activitat actualitzada', '', 'success');
    }
    closeActivityDrawer();
  } catch (saveError) {
    console.error(saveError);
    setSyncState('error', 'No s’ha pogut desar');
    showToast('No s’ha pogut desar', saveError.message, 'error');
  } finally {
    $('#saveActivityButton').disabled = false;
  }
});

$('#deleteActivityButton')?.addEventListener('click', async () => {
  const activity = state.editingContext?.activity;
  if (!activity) return;

  const confirmed = await confirmAction({
    title: 'Elimina l’activitat?',
    message: activity.tipus === 'permanent'
      ? 'S’eliminarà de totes les setmanes del període.'
      : 'S’eliminarà aquesta activitat de la setmana.',
    acceptLabel: 'Elimina'
  });

  if (!confirmed) return;
  setSyncState('saving', 'Eliminant');

  try {
    await deleteActivity(state.user.uid, activity.id);
    closeActivityDrawer();
    showToast('Activitat eliminada', '', 'success');
  } catch (deleteError) {
    console.error(deleteError);
    setSyncState('error', 'No s’ha pogut eliminar');
    showToast('No s’ha pogut eliminar', deleteError.message, 'error');
  }
});

$('#skipOccurrenceButton')?.addEventListener('click', async () => {
  const context = state.editingContext;
  if (!context?.activity || context.activity.tipus !== 'permanent') return;

  const confirmed = await confirmAction({
    title: 'Omet aquesta setmana?',
    message: 'L’activitat recurrent continuarà apareixent a les altres setmanes.',
    acceptLabel: 'Omet-la',
    danger: false
  });

  if (!confirmed) return;
  const info = getISOWeekInfo(context.occurrenceDate);

  try {
    setSyncState('saving', 'Desant');
    await createOccurrenceException(
      state.user.uid,
      context.activity,
      info.year,
      info.week,
      toISODate(context.occurrenceDate)
    );
    closeActivityDrawer();
    showToast('Activitat omesa', 'No apareixerà aquesta setmana.', 'success');
  } catch (skipError) {
    console.error(skipError);
    setSyncState('error', 'No s’ha pogut desar');
    showToast('No s’ha pogut ometre', skipError.message, 'error');
  }
});

/* ==========================================================
   VISTA ANUAL
   ========================================================== */

function resetAcademicView() {
  state.academicViewStart = parseISODate(state.settings.academicStart);
  state.academicViewEnd = parseISODate(state.settings.academicEnd);
}

function shiftAcademicView(offset) {
  state.academicViewStart = addYears(state.academicViewStart, offset);
  state.academicViewEnd = addYears(state.academicViewEnd, offset);
  renderYear();
}

$('#previousAcademicYearButton')?.addEventListener('click', () => shiftAcademicView(-1));
$('#nextAcademicYearButton')?.addEventListener('click', () => shiftAcademicView(1));
$('#currentAcademicYearButton')?.addEventListener('click', () => {
  resetAcademicView();
  renderYear();
});

function renderYear() {
  if (!state.academicViewStart || !state.academicViewEnd) resetAcademicView();

  $('#academicYearLabel').textContent = `Curs ${getAcademicYearLabel(state.academicViewStart, state.academicViewEnd)}`;
  $('#academicYearRange').textContent = formatDateRange(state.academicViewStart, state.academicViewEnd);

  const weeks = eachWeekBetween(state.academicViewStart, state.academicViewEnd);
  const groups = new Map();

  weeks.forEach(weekInfo => {
    const monthKey = `${weekInfo.start.getFullYear()}-${weekInfo.start.getMonth()}`;
    if (!groups.has(monthKey)) groups.set(monthKey, { date: weekInfo.start, weeks: [] });
    groups.get(monthKey).weeks.push(weekInfo);
  });

  const currentWeek = getISOWeekInfo(new Date());

  $('#yearCalendar').innerHTML = [...groups.values()].map(group => {
    const monthLabel = capitalize(formatDate(group.date, { month: 'long', year: 'numeric' }));
    const monthCount = group.weeks.reduce((total, weekInfo) => total + resolveWeek(weekInfo.year, weekInfo.week).rows.length, 0);

    return `
      <section class="month-block">
        <header class="month-header"><h2>${escapeHtml(monthLabel)}</h2><span>${monthCount} ${monthCount === 1 ? 'activitat' : 'activitats'}</span></header>
        <div class="month-weeks">
          ${group.weeks.map(weekInfo => {
            const count = resolveWeek(weekInfo.year, weekInfo.week).rows.length;
            const isCurrent = weekInfo.year === currentWeek.year && weekInfo.week === currentWeek.week;
            const isSelected = weekInfo.year === state.selectedWeek.year && weekInfo.week === state.selectedWeek.week;
            return `
              <button class="week-card ${isCurrent ? 'is-current' : ''} ${isSelected ? 'is-selected' : ''}" type="button" data-year-week="${weekInfo.year}|${weekInfo.week}">
                <span class="week-card-top"><strong>Setmana ${weekInfo.week}</strong><span>${escapeHtml(formatShortDate(weekInfo.start))}–${escapeHtml(formatShortDate(weekInfo.end))}</span></span>
                <span class="week-card-bottom"><span>${isCurrent ? 'Setmana actual' : 'Obre la setmana'}</span><span class="week-count">${count}</span></span>
              </button>
            `;
          }).join('')}
        </div>
      </section>
    `;
  }).join('');
}

$('#yearCalendar')?.addEventListener('click', event => {
  const card = event.target.closest('[data-year-week]');
  if (!card) return;
  const [year, week] = card.dataset.yearWeek.split('|').map(Number);
  state.selectedWeek = { year, week };
  setScheduleView('week');
  renderWeek();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

/* ==========================================================
   LLIÇONARI
   ========================================================== */

function populateLibraryFilters() {
  const courses = uniqueSorted([...state.settings.courses, ...state.activities.map(activity => activity.curs)]);
  const subjects = uniqueSorted([...state.settings.subjects, ...state.activities.map(activity => activity.assignatura)]);

  const courseValue = $('#filterCourse').value;
  const subjectValue = $('#filterSubject').value;

  $('#filterCourse').innerHTML = '<option value="">Tots els cursos</option>' + courses.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
  $('#filterSubject').innerHTML = '<option value="">Totes les assignatures</option>' + subjects.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');

  if (courses.includes(courseValue)) $('#filterCourse').value = courseValue;
  if (subjects.includes(subjectValue)) $('#filterSubject').value = subjectValue;

  if (!$('#filterStartDate').value) $('#filterStartDate').value = state.settings.academicStart;
  if (!$('#filterEndDate').value) $('#filterEndDate').value = state.settings.academicEnd;
}

function expandActivitiesToOccurrences(startDate, endDate) {
  const rows = [];
  const exceptions = new Set(
    state.activities
      .filter(activity => activity.tipus === 'excepcio' && activity.referenciaPermanentId)
      .map(activity => `${activity.referenciaPermanentId}|${activity.any}|${activity.setmana}`)
  );

  state.activities.forEach(activity => {
    if (activity.tipus === 'excepcio') return;

    if (activity.tipus === 'ocasional') {
      const date = getActivityOccurrenceDate(activity, activity.any, activity.setmana);
      if (!date || !isDateInside(date, startDate, endDate)) return;
      rows.push(buildLibraryRow(activity, date));
      return;
    }

    if (activity.tipus === 'permanent') {
      const recurrenceStart = parseISODate(activity.recurrenceStart || state.settings.academicStart);
      const recurrenceEnd = parseISODate(activity.recurrenceEnd || state.settings.academicEnd);
      const effectiveStart = recurrenceStart > startDate ? recurrenceStart : startDate;
      const effectiveEnd = recurrenceEnd < endDate ? recurrenceEnd : endDate;
      if (effectiveStart > effectiveEnd) return;

      eachWeekBetween(effectiveStart, effectiveEnd).forEach(weekInfo => {
        const occurrenceDate = getDateFromISOWeek(weekInfo.year, weekInfo.week, getDayIndex(activity.dia));
        const exceptionKey = `${activity.id}|${weekInfo.year}|${weekInfo.week}`;
        if (exceptions.has(exceptionKey)) return;
        if (!isDateInside(occurrenceDate, effectiveStart, effectiveEnd)) return;
        rows.push(buildLibraryRow(activity, occurrenceDate));
      });
    }
  });

  return rows.sort((a, b) => (a.date - b.date) || a.time.localeCompare(b.time));
}

function buildLibraryRow(activity, date) {
  return {
    id: `${activity.id}-${toISODate(date)}`,
    activityId: activity.id,
    date,
    dateString: toISODate(date),
    course: activity.curs,
    subject: activity.assignatura,
    title: activity.activitat,
    notes: activity.notes,
    type: activity.tipus,
    time: activity.hora,
    day: activity.dia
  };
}

function getLibraryFilters() {
  return {
    course: $('#filterCourse').value,
    subject: $('#filterSubject').value,
    search: normalizeText($('#filterSearch').value),
    startDate: parseISODate($('#filterStartDate').value || state.settings.academicStart),
    endDate: parseISODate($('#filterEndDate').value || state.settings.academicEnd),
    type: $('#filterType').value
  };
}

function getFilteredLibraryRows() {
  const filters = getLibraryFilters();
  const allRows = expandActivitiesToOccurrences(filters.startDate, filters.endDate);

  return allRows.filter(row => {
    if (filters.course && row.course !== filters.course) return false;
    if (filters.subject && row.subject !== filters.subject) return false;
    if (filters.type && row.type !== filters.type) return false;
    if (filters.search) {
      const searchable = normalizeText(`${row.title} ${row.notes} ${row.course} ${row.subject}`);
      if (!searchable.includes(filters.search)) return false;
    }
    return true;
  });
}

function renderLibrary() {
  if (!state.user) return;
  const rows = getFilteredLibraryRows();
  state.currentLibraryRows = rows;

  $('#libraryResultCount').textContent = `${rows.length} ${rows.length === 1 ? 'activitat' : 'activitats'}`;
  renderFilterChips();

  const empty = rows.length === 0;
  $('#libraryEmptyState').classList.toggle('hidden', !empty);
  $('#libraryTableWrap').classList.toggle('hidden', empty);
  $('#libraryCards').classList.toggle('hidden', empty);

  if (empty) return;

  $('#libraryTableBody').innerHTML = rows.map(row => `
    <tr>
      <td>${escapeHtml(formatDate(row.date, { day: '2-digit', month: '2-digit', year: 'numeric' }))}</td>
      <td>${escapeHtml(row.course)}</td>
      <td>${escapeHtml(row.subject)}</td>
      <td class="library-activity">${escapeHtml(row.title)}${row.notes ? `<small>${escapeHtml(row.notes)}</small>` : ''}</td>
      <td>${escapeHtml(row.time.replace('-', '–'))}</td>
      <td><span class="type-pill">${row.type === 'permanent' ? 'Recurrent' : 'Ocasional'}</span></td>
    </tr>
  `).join('');

  $('#libraryCards').innerHTML = rows.map(row => `
    <article class="library-card">
      <h3>${escapeHtml(row.title)}</h3>
      <div class="library-card-meta">
        <span>${escapeHtml(row.course)} · ${escapeHtml(row.subject)}</span>
        <span>${escapeHtml(formatLongDate(row.date))}</span>
        <span>${escapeHtml(row.time.replace('-', '–'))}</span>
        <span class="type-pill">${row.type === 'permanent' ? 'Recurrent' : 'Ocasional'}</span>
      </div>
      ${row.notes ? `<p class="library-card-notes">${escapeHtml(row.notes)}</p>` : ''}
    </article>
  `).join('');
}

function renderFilterChips() {
  const filters = getLibraryFilters();
  const chips = [];
  if (filters.course) chips.push({ key: 'course', label: `Curs: ${filters.course}` });
  if (filters.subject) chips.push({ key: 'subject', label: `Assignatura: ${filters.subject}` });
  if (filters.search) chips.push({ key: 'search', label: `Cerca: ${$('#filterSearch').value}` });
  if (filters.type) chips.push({ key: 'type', label: filters.type === 'permanent' ? 'Recurrent' : 'Ocasional' });

  $('#activeFilterChips').innerHTML = chips.map(chip => `
    <span class="filter-chip">${escapeHtml(chip.label)}<button type="button" data-clear-filter="${chip.key}" aria-label="Elimina el filtre"><svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg></button></span>
  `).join('');
}

const debouncedLibraryRender = debounce(renderLibrary, 220);
['#filterCourse', '#filterSubject', '#filterStartDate', '#filterEndDate', '#filterType'].forEach(selector => {
  $(selector)?.addEventListener('change', renderLibrary);
});
$('#filterSearch')?.addEventListener('input', debouncedLibraryRender);

$('#activeFilterChips')?.addEventListener('click', event => {
  const button = event.target.closest('[data-clear-filter]');
  if (!button) return;
  const map = {
    course: '#filterCourse',
    subject: '#filterSubject',
    search: '#filterSearch',
    type: '#filterType'
  };
  const input = $(map[button.dataset.clearFilter]);
  if (input) input.value = '';
  renderLibrary();
});

$('#clearFiltersButton')?.addEventListener('click', () => {
  $('#filterCourse').value = '';
  $('#filterSubject').value = '';
  $('#filterSearch').value = '';
  $('#filterType').value = '';
  $('#filterStartDate').value = state.settings.academicStart;
  $('#filterEndDate').value = state.settings.academicEnd;
  renderLibrary();
});

$('#printLibraryButton')?.addEventListener('click', () => window.print());
$('#exportLibraryButton')?.addEventListener('click', () => {
  const csv = createCsv(state.currentLibraryRows, [
    { label: 'Data', value: row => formatDate(row.date, { day: '2-digit', month: '2-digit', year: 'numeric' }) },
    { label: 'Curs', value: 'course' },
    { label: 'Assignatura', value: 'subject' },
    { label: 'Activitat', value: 'title' },
    { label: 'Notes', value: 'notes' },
    { label: 'Hora', value: row => row.time.replace('-', '–') },
    { label: 'Tipus', value: row => row.type === 'permanent' ? 'Recurrent' : 'Ocasional' }
  ]);
  downloadBlob(csv, `programeta-lliçonari-${toISODate(new Date())}.csv`, 'text/csv;charset=utf-8');
});

/* ==========================================================
   CONFIGURACIÓ
   ========================================================== */

function populateSettingsForm() {
  state.settingsDraft = structuredClone(state.settings);
  state.settingsDirty = false;

  $('#settingsAcademicStart').value = state.settingsDraft.academicStart;
  $('#settingsAcademicEnd').value = state.settingsDraft.academicEnd;
  $('#settingsTheme').value = state.settingsDraft.theme || 'system';
  renderTimeSlotsSettings();
  renderCourseTags();
  renderSubjectTags();
  updateSettingsSaveStatus();
}

function renderTimeSlotsSettings() {
  $('#timeSlotList').innerHTML = state.settingsDraft.timeSlots.map((slot, index) => `
    <div class="time-slot-row" data-slot-index="${index}">
      <input class="slot-start" type="time" value="${escapeHtml(slot.start)}" aria-label="Hora d'inici" />
      <input class="slot-end" type="time" value="${escapeHtml(slot.end)}" aria-label="Hora de finalització" />
      <button type="button" data-remove-slot="${index}" aria-label="Elimina la franja"><svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg></button>
    </div>
  `).join('');
}

function renderCourseTags() {
  $('#courseTagList').innerHTML = state.settingsDraft.courses.map(value => `
    <span class="tag">${escapeHtml(value)}<button type="button" data-remove-course="${escapeHtml(value)}" aria-label="Elimina ${escapeHtml(value)}"><svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg></button></span>
  `).join('');
}

function renderSubjectTags() {
  $('#subjectTagList').innerHTML = state.settingsDraft.subjects.map(value => `
    <span class="tag">${escapeHtml(value)}<button type="button" data-remove-subject="${escapeHtml(value)}" aria-label="Elimina ${escapeHtml(value)}"><svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg></button></span>
  `).join('');
}

function markSettingsDirty() {
  state.settingsDirty = true;
  updateSettingsSaveStatus();
}

function updateSettingsSaveStatus() {
  $('#settingsSaveStatus').textContent = state.settingsDirty ? 'Hi ha canvis pendents' : 'Sense canvis pendents';
}

$('#settingsAcademicStart')?.addEventListener('change', event => {
  state.settingsDraft.academicStart = event.target.value;
  markSettingsDirty();
});
$('#settingsAcademicEnd')?.addEventListener('change', event => {
  state.settingsDraft.academicEnd = event.target.value;
  markSettingsDirty();
});
$('#settingsTheme')?.addEventListener('change', event => {
  state.settingsDraft.theme = event.target.value;
  applyTheme(event.target.value);
  markSettingsDirty();
});

$('#addTimeSlotButton')?.addEventListener('click', () => {
  state.settingsDraft.timeSlots.push({ id: `slot-${Date.now()}`, start: '17:00', end: '18:00' });
  state.settingsDraft.timeSlots.sort(compareTimeSlots);
  renderTimeSlotsSettings();
  markSettingsDirty();
});

$('#timeSlotList')?.addEventListener('input', event => {
  const row = event.target.closest('[data-slot-index]');
  if (!row) return;
  const index = Number(row.dataset.slotIndex);
  state.settingsDraft.timeSlots[index].start = row.querySelector('.slot-start').value;
  state.settingsDraft.timeSlots[index].end = row.querySelector('.slot-end').value;
  markSettingsDirty();
});

$('#timeSlotList')?.addEventListener('click', event => {
  const button = event.target.closest('[data-remove-slot]');
  if (!button) return;
  if (state.settingsDraft.timeSlots.length <= 1) {
    showToast('Cal mantenir una franja', 'Programeta necessita almenys una franja horària.', 'warning');
    return;
  }
  state.settingsDraft.timeSlots.splice(Number(button.dataset.removeSlot), 1);
  renderTimeSlotsSettings();
  markSettingsDirty();
});

function addTag(kind) {
  const isCourse = kind === 'course';
  const input = $(isCourse ? '#newCourseInput' : '#newSubjectInput');
  const value = input.value.trim();
  if (!value) return;

  const key = isCourse ? 'courses' : 'subjects';
  if (!state.settingsDraft[key].some(existing => normalizeText(existing) === normalizeText(value))) {
    state.settingsDraft[key] = uniqueSorted([...state.settingsDraft[key], value]);
    isCourse ? renderCourseTags() : renderSubjectTags();
    markSettingsDirty();
  }
  input.value = '';
}

$('#addCourseButton')?.addEventListener('click', () => addTag('course'));
$('#addSubjectButton')?.addEventListener('click', () => addTag('subject'));
$('#newCourseInput')?.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); addTag('course'); } });
$('#newSubjectInput')?.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); addTag('subject'); } });

$('#courseTagList')?.addEventListener('click', event => {
  const button = event.target.closest('[data-remove-course]');
  if (!button) return;
  state.settingsDraft.courses = state.settingsDraft.courses.filter(value => value !== button.dataset.removeCourse);
  renderCourseTags();
  markSettingsDirty();
});

$('#subjectTagList')?.addEventListener('click', event => {
  const button = event.target.closest('[data-remove-subject]');
  if (!button) return;
  state.settingsDraft.subjects = state.settingsDraft.subjects.filter(value => value !== button.dataset.removeSubject);
  renderSubjectTags();
  markSettingsDirty();
});

$('#saveSettingsButton')?.addEventListener('click', async () => {
  const start = parseISODate(state.settingsDraft.academicStart);
  const end = parseISODate(state.settingsDraft.academicEnd);
  if (!start || !end || start >= end) {
    showToast('Revisa el curs acadèmic', 'La data final ha de ser posterior a la inicial.', 'warning');
    return;
  }

  const invalidSlot = state.settingsDraft.timeSlots.some(slot => !slot.start || !slot.end || slot.start >= slot.end);
  if (invalidSlot) {
    showToast('Revisa les franges', 'Cada franja ha de tenir una hora final posterior a la inicial.', 'warning');
    return;
  }

  state.settingsDraft.timeSlots.sort(compareTimeSlots);
  setSyncState('saving', 'Desant configuració');
  $('#saveSettingsButton').disabled = true;

  try {
    await saveUserSettings(state.user.uid, state.settingsDraft);
    state.settings = normalizeSettings(state.settingsDraft);
    state.settingsDraft = structuredClone(state.settings);
    state.settingsDirty = false;
    resetAcademicView();
    applyTheme(state.settings.theme, false);
    populateActivityOptions();
    populateLibraryFilters();
    renderAllDataViews();
    updateSettingsSaveStatus();
    setSyncState('saved', 'Desat');
    showToast('Configuració desada', '', 'success');
  } catch (error) {
    console.error(error);
    setSyncState('error', 'No s’ha pogut desar');
    showToast('No s’ha pogut desar', error.message, 'error');
  } finally {
    $('#saveSettingsButton').disabled = false;
  }
});

/* ==========================================================
   CÒPIES DE SEGURETAT
   ========================================================== */

async function exportBackup() {
  if (!state.user) return;
  setLoading(true);
  try {
    const backup = await exportUserBackup(state.user.uid);
    downloadBlob(JSON.stringify(backup, null, 2), `programeta-copia-${toISODate(new Date())}.json`, 'application/json;charset=utf-8');
    showToast('Còpia descarregada', 'Guarda el fitxer en un lloc segur.', 'success');
  } catch (error) {
    console.error(error);
    showToast('No s’ha pogut crear la còpia', error.message, 'error');
  } finally {
    setLoading(false);
  }
}

$('#exportBackupButton')?.addEventListener('click', exportBackup);

$('#importBackupInput')?.addEventListener('change', async event => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;

  const confirmed = await confirmAction({
    title: 'Restaura aquesta còpia?',
    message: 'Les activitats actuals se substituiran per les del fitxer.',
    acceptLabel: 'Restaura'
  });
  if (!confirmed) return;

  setLoading(true);
  try {
    const text = await file.text();
    const backup = safeJsonParse(text);
    await restoreUserBackup(state.user.uid, backup);
    const restoredSettings = await getUserSettings(state.user.uid);
    state.settings = normalizeSettings(restoredSettings || buildDefaultSettings());
    populateSettingsForm();
    resetAcademicView();
    showToast('Còpia restaurada', 'Les dades ja tornen a estar disponibles.', 'success');
  } catch (error) {
    console.error(error);
    showToast('No s’ha pogut restaurar', error.message, 'error');
  } finally {
    setLoading(false);
  }
});

/* ==========================================================
   CONNECTIVITAT I PWA
   ========================================================== */

window.addEventListener('offline', () => setSyncState('offline', 'Sense connexió'));
window.addEventListener('online', () => setSyncState('saved', 'Connectat'));

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(error => {
      console.warn('No s’ha pogut registrar el service worker.', error);
    });
  });
}

/* ==========================================================
   INICIALITZACIÓ VISUAL
   ========================================================== */

applyTheme(localStorage.getItem('programeta-theme-preference') || 'system', false);
setScheduleView('week');
