/* =====================================================================
   Plan B - gemeinsame UI-Hilfsfunktionen fuer den Bereich "Projekte"
   KI-Log Nr. 38
   Enthaelt: Escaping, Datumsformate, Modals, Toast, Kopfzeile,
             Teilnehmer-Auswahl (Chips) und Teilaufgaben-Editor.
   Hier gibt es KEINE Backend-Aufrufe ausser in initTopbar() (ueber api.js).
   ===================================================================== */
(function () {
  'use strict';

  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));

  // Schutz vor XSS: alle Texte aus dem Backend vor innerHTML escapen
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  function getParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  /* ---------- Beschriftungen ---------- */
  const PRIO = { HOCH: 'Hoch', MITTEL: 'Mittel', NIEDRIG: 'Niedrig' };
  const ROLE = { PROJEKTLEITUNG: 'Projektleitung', TEAMMITGLIED: 'Teammitglied', PL: 'Projektleitung', member: 'Teammitglied', MEMBER: 'Teammitglied' };
  const TYPE = { MEETING: 'Meeting', LANGES_TODO: 'Langes To-Do' };
  const STATUS = { AKTIV: 'Aktiv', ABGESCHLOSSEN: 'Abgeschlossen' };

  /* ---------- Datum (Format 'YYYY-MM-DDTHH:mm') ---------- */
  function parts(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(iso || '');
    return m ? { y: m[1], mo: m[2], d: m[3], h: m[4], mi: m[5] } : null;
  }
  // 15.10. 13:00
  function fmtShort(iso) { const p = parts(iso); return p ? `${p.d}.${p.mo}. ${p.h}:${p.mi}` : '–'; }
  // 05.10.
  function fmtDayMonth(iso) { const p = parts(iso); return p ? `${p.d}.${p.mo}.` : ''; }
  // 14.10.2026
  function fmtDate(iso) { const p = parts(iso); return p ? `${p.d}.${p.mo}.${p.y}` : ''; }
  // 21.10.2026, 09:00
  function fmtLong(iso) { const p = parts(iso); return p ? `${p.d}.${p.mo}.${p.y}, ${p.h}:${p.mi}` : '–'; }
  // 16.10.2026 09:00 (Eingabefeld)
  function fmtInput(iso) { const p = parts(iso); return p && p.h ? `${p.d}.${p.mo}.${p.y} ${p.h}:${p.mi}` : ''; }
  // HH:mm
  function fmtTime(iso) { const p = parts(iso); return p ? `${p.h}:${p.mi}` : ''; }

  // "16.10.2026 09:00" oder native datetime-local-Werte -> "2026-10-16T09:00".
  function parseInput(text) {
    const value = String(text || '').trim();
    if (!value) return '';
    const native = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
    if (native) {
      const [, y, mo, d, h, mi] = native;
      const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
      if (date.getFullYear() !== Number(y) || date.getMonth() !== Number(mo) - 1
        || date.getDate() !== Number(d) || date.getHours() !== Number(h)
        || date.getMinutes() !== Number(mi)) return null;
      return value;
    }
    const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})$/.exec(value);
    if (!m) return null;
    const [d, mo, y, h, mi] = [m[1], m[2], m[3], m[4], m[5]].map(Number);
    const date = new Date(y, mo - 1, d, h, mi);
    if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d || h > 23 || mi > 59) return null;
    const pad = n => String(n).padStart(2, '0');
    return `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}`;
  }

  /* ---------- Icons ---------- */
  const ICON = {
    pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>'
  };

  /* ---------- Modals ---------- */
  let zIndex = 50;
  const openStack = [];

  function openModal(id) {
    const backdrop = document.getElementById(id);
    if (!backdrop) return;
    backdrop.dataset.returnFocus = document.activeElement && document.activeElement.id ? document.activeElement.id : '';
    backdrop._returnFocus = document.activeElement;
    zIndex += 1;
    backdrop.style.zIndex = zIndex;
    backdrop.hidden = false;
    if (!openStack.includes(id)) openStack.push(id);
    document.body.style.overflow = 'hidden';
    const focusTarget = backdrop.querySelector('[autofocus]') || backdrop.querySelector('input:not([type=hidden]), select, textarea, button');
    if (focusTarget) setTimeout(() => focusTarget.focus(), 30);
  }

  function closeModal(id) {
    const backdrop = document.getElementById(id);
    if (!backdrop || backdrop.hidden) return;
    backdrop.hidden = true;
    const index = openStack.indexOf(id);
    if (index >= 0) openStack.splice(index, 1);
    if (!openStack.length) document.body.style.overflow = '';
    if (backdrop._returnFocus && document.contains(backdrop._returnFocus)) backdrop._returnFocus.focus();
    backdrop.dispatchEvent(new CustomEvent('modal:closed'));
  }

  // Schliessen per X/Abbrechen (data-close), Klick auf Hintergrund und ESC
  document.addEventListener('click', event => {
    const closer = event.target.closest('[data-close]');
    if (closer) {
      const backdrop = closer.closest('.modal-backdrop');
      if (backdrop) closeModal(backdrop.id);
      return;
    }
    if (event.target.classList && event.target.classList.contains('modal-backdrop')) closeModal(event.target.id);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && openStack.length) closeModal(openStack[openStack.length - 1]);
  });

  /* ---------- Formular-Fehler ---------- */
  function showFormError(form, message) {
    let box = form.querySelector('.form-error');
    if (!box) {
      box = document.createElement('div');
      box.className = 'form-error';
      box.setAttribute('role', 'alert');
      const body = form.querySelector('.modal-body') || form;
      body.prepend(box);
    }
    box.textContent = message;
    box.hidden = !message;
  }
  function clearFormError(form) { showFormError(form, ''); }

  // Button waehrend eines Requests sperren
  async function withBusy(button, task) {
    if (!button) return task();
    const label = button.innerHTML;
    button.disabled = true;
    try { return await task(); } finally { button.disabled = false; button.innerHTML = label; }
  }

  /* ---------- Toast ---------- */
  let toastTimer = null;
  function toast(message, isError) {
    let el = $('#toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.className = 'toast';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.toggle('error', !!isError);
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
  }

  /* ---------- Kopfzeile (Name, Einladungs-Badge, Abmelden) ---------- */
  async function initTopbar(api) {
    const logoutButton = $('#logoutButton');
    if (logoutButton) {
      logoutButton.addEventListener('click', async () => {
        if (!window.confirm('Möchtest du dich wirklich abmelden?')) return;
        try { await api.logout(); } catch (e) { /* trotzdem zur Login-Seite */ }
        window.location.href = '../../Login/HTML/login.html';
      });
    }
    try {
      const me = await api.getCurrentUser();
      const nameEl = $('#currentUserName');
      if (nameEl) nameEl.textContent = me.name;
      return me;
    } catch (e) {
      return null;
    }
  }

  /* ---------- Teilnehmer-Auswahl mit Chips (Wireframe "Mia M. x  + hinzufuegen") ---------- */
  function participantPicker(container, options) {
    const members = options.members || [];
    let all = !!options.allParticipants;
    let selected = all ? [] : (options.selectedIds || []).slice();
    const onChange = options.onChange || function () {};

    function render() {
      const chips = all
        ? '<span class="chip">Alle <button type="button" data-remove="ALLE" aria-label="Alle entfernen">×</button></span>'
        : selected.map(id => {
            const m = members.find(x => x.userId === id);
            const name = m ? m.name : id;
            return `<span class="chip">${esc(name)} <button type="button" data-remove="${esc(id)}" aria-label="${esc(name)} entfernen">×</button></span>`;
          }).join('');
      const available = all ? [] : members.filter(m => !selected.includes(m.userId));
      const select = all ? '' : `
        <select class="chip-select" aria-label="Teilnehmer hinzufügen">
          <option value="">+ hinzufügen</option>
          <option value="ALLE">Alle Mitglieder</option>
          ${available.map(m => `<option value="${esc(m.userId)}">${esc(m.name)}</option>`).join('')}
        </select>`;
      container.innerHTML = `<div class="chip-input">${chips}${select}</div>`;
    }

    container.addEventListener('click', event => {
      const button = event.target.closest('[data-remove]');
      if (!button) return;
      const id = button.dataset.remove;
      if (id === 'ALLE') all = false; else selected = selected.filter(x => x !== id);
      render();
      onChange();
    });
    container.addEventListener('change', event => {
      if (!event.target.classList.contains('chip-select')) return;
      const id = event.target.value;
      if (!id) return;
      if (id === 'ALLE') { all = true; selected = []; } else selected.push(id);
      render();
      onChange();
    });

    render();
    return {
      getValue() { return { allParticipants: all, participantIds: all ? members.map(m => m.userId) : selected.slice() }; },
      isEmpty() { return !all && selected.length === 0; }
    };
  }

  /* ---------- Teilaufgaben-Editor (Wireframe "Task bearbeiten") ---------- */
  function subtaskEditor(container, options) {
    const members = options.members || [];
    const getAssignableIds = options.getAssignableIds || (() => members.map(m => m.userId));
    let items = (options.subtasks || []).map(s => Object.assign({}, s));

    let assignableIds = getAssignableIds();

    function render() {
      container.innerHTML = items.map((item, index) => {
        const eligible = members.filter(m => assignableIds.includes(m.userId));
        const optionsHtml = eligible.map(m => `<option value="${esc(m.userId)}" ${m.userId === item.assigneeId ? 'selected' : ''}>${esc(m.name)}${m.userId === options.currentUserId ? ' (du)' : ''}</option>`).join('');
        return `
        <div class="subtask-editor" data-index="${index}">
          <div class="row">
            <input class="input" type="text" data-field="title" value="${esc(item.title)}" placeholder="Titel der Teilaufgabe" aria-label="Titel der Teilaufgabe ${index + 1}" maxlength="120">
            <button type="button" class="icon-btn" data-delete="${index}" aria-label="Teilaufgabe löschen" title="Teilaufgabe löschen">${ICON.trash}</button>
          </div>
          <textarea class="textarea small" data-field="description" placeholder="Beschreibung (optional)" aria-label="Beschreibung der Teilaufgabe ${index + 1}">${esc(item.description)}</textarea>
          <label class="meta">Zuständig
            <select class="select" data-field="assigneeId" aria-label="Zuständigkeit Teilaufgabe ${index + 1}">
              <option value="">Noch nicht zugewiesen</option>${optionsHtml}
            </select>
          </label>
          <div class="meta">${item.done ? 'erledigt' : 'offen'}</div>
        </div>`;
      }).join('');
    }

    function updateParticipants(ids) {
      assignableIds = (ids || []).slice();
      render();
    }

    function updateField(event) {
      const card = event.target.closest('.subtask-editor');
      if (!card || !event.target.dataset.field) return;
      const item = items[Number(card.dataset.index)];
      const field = event.target.dataset.field;
      item[field] = field === 'assigneeId' ? (event.target.value || null) : event.target.value;
    }
    container.addEventListener('input', updateField);
    container.addEventListener('change', updateField);
    container.addEventListener('click', event => {
      const button = event.target.closest('[data-delete]');
      if (!button) return;
      items.splice(Number(button.dataset.delete), 1);
      render();
    });

    render();
    return {
      add() {
        items.push({ id: null, title: '', description: '', assigneeId: null, done: false });
        render();
        const inputs = container.querySelectorAll('[data-field="title"]');
        if (inputs.length) inputs[inputs.length - 1].focus();
      },
      setParticipants: updateParticipants,
      getValue() {
        const allowed = new Set(getAssignableIds());
        return items.map(s => ({ id: s.id, title: String(s.title || '').trim(), description: String(s.description || '').trim(), assigneeId: s.assigneeId && allowed.has(s.assigneeId) ? s.assigneeId : null, done: !!s.done }));
      }
    };
  }

  /* ---------- Fortschritt ---------- */
  function progressOf(task) {
    const total = task.subtasks ? task.subtasks.length : 0;
    const done = total ? task.subtasks.filter(s => s.done).length : 0;
    return { done, total, percent: total ? Math.round((done / total) * 100) : 0 };
  }
  function progressBar(task, wide) {
    const p = progressOf(task);
    return `<span class="bar${wide ? ' wide' : ''}" aria-hidden="true"><span style="width:${p.percent}%"></span></span>`;
  }

  window.PlanBUI = {
    $, $$, esc, getParam, PRIO, ROLE, TYPE, STATUS, ICON,
    fmtShort, fmtDayMonth, fmtDate, fmtLong, fmtInput, fmtTime, parseInput,
    openModal, closeModal, showFormError, clearFormError, withBusy, toast,
    initTopbar, participantPicker, subtaskEditor, progressOf, progressBar
  };
})();
