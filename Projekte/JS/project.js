/* =====================================================================
   Plan B - Projektansicht (project.html?id=...)
   KI-Log Nr. 32 Projektansicht, Nr. 33 Mitglieder, Nr. 34 Neue Aufgabe,
   Nr. 35 Langes To-Do / Teilaufgabe / Uebernehmen-Konflikt
   ---------------------------------------------------------------------
   Rollen-Logik wie in den Wireframes:
   - Projektleitung (S. 4): "Projekt bearbeiten", "Task verwalten",
     "+ Task anlegen", Stift an der Mitglieder-Karte, Fortschritt als Text
   - Teammitglied (S. 3): Teilaufgaben aufklappbar, "Uebernehmen",
     Fortschritt als Balken
   Alle Backend-Aufrufe laufen ueber window.PlanBApi (api.js).
   ===================================================================== */
(function () {
  'use strict';

  const api = window.PlanBApi;
  const ui = window.PlanBUI;
  const { $, esc } = ui;

  const projectId = ui.getParam('id');
  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const state = {
    me: null,
    project: null,
    tasks: [],
    invitations: [],
    expanded: new Set(),
    isLead: false,
    isActive: true,
    detailTaskId: null,
    subtaskRef: null,
    editingMemberId: null,
    newTaskType: 'MEETING',
    picker: null,
    newSubtasks: null,
    scheduling: null
  };

  init();

  /* ================= Laden ================= */

  async function init() {
    bindEvents();
    state.me = await ui.initTopbar(api);
    if (!projectId) {
      showPageError('Kein Projekt ausgewählt. Bitte wähle ein Projekt unter „Meine Projekte“.');
      return;
    }
    try {
      if (!state.me) state.me = await api.getCurrentUser();
      await loadData();
      // Lange To-Dos sind beim ersten Laden aufgeklappt
      state.tasks.filter(t => t.type === 'LANGES_TODO').forEach(t => state.expanded.add(t.id));
      render();
      $('#projectView').hidden = false;
    } catch (error) {
      showPageError(error.message);
    }
  }

  async function loadData() {
    // BACKEND: GET /projects/{projectId}  und  GET /projects/{projectId}/tasks
    const [project, tasks] = await Promise.all([api.getProject(projectId), api.getTasks(projectId)]);
    state.project = project;
    state.tasks = tasks;
    state.isLead = project.myRole === 'PROJEKTLEITUNG';
    state.isActive = project.status === 'AKTIV';
  }

  async function refresh() {
    try {
      await loadData();
      render();
      if (!$('#taskDetailModal').hidden && state.detailTaskId) renderTaskDetail(state.detailTaskId);
    } catch (error) {
      ui.toast(error.message, true);
    }
  }

  function showPageError(message) {
    const box = $('#pageMessage');
    box.textContent = message;
    box.hidden = false;
    $('#projectView').hidden = true;
  }

  /* ================= Hilfsfunktionen ================= */

  const findTask = id => state.tasks.find(t => t.id === id);
  const findSub = (task, id) => (task ? task.subtasks.find(s => s.id === id) : null);

  function member(userId) { return state.project.members.find(m => m.userId === userId) || null; }
  function memberName(userId) { const m = member(userId); return m ? m.name : 'ehemaliges Mitglied'; }
  function nameWithYou(userId) { return memberName(userId) + (state.me && userId === state.me.id ? ' (du)' : ''); }

  function isParticipant(task) {
    return task.allParticipants || task.participantIds.includes(state.me.id);
  }
  function participantsText(task, markYou) {
    if (task.allParticipants) return 'Alle';
    if (!task.participantIds.length) return '–';
    return task.participantIds.map(id => (markYou ? nameWithYou(id) : memberName(id))).join(', ');
  }
  function canTickMeeting(task) { return state.isActive && isParticipant(task); }
  function canTickSub(sub) { return state.isActive && sub.assigneeId === state.me.id; }
  function canClaim(task, sub) { return state.isActive && !task.done && !sub.assigneeId && isParticipant(task); }

  function byStart(a, b) { return (a.start || a.end || '').localeCompare(b.start || b.end || ''); }

  /* ================= Rendern ================= */

  function render() {
    renderHeader();
    renderMemberCard();
    renderTaskTable();
    renderDoneList();
  }

  function renderHeader() {
    const p = state.project;
    document.title = p.title + ' · Plan B';
    $('#projectTitle').textContent = p.title;
    $('#projectStatus').textContent = ui.STATUS[p.status] || p.status;
    $('#projectRole').textContent = 'Deine Rolle: ' + (ui.ROLE[p.myRole] || p.myRole);
    $('#projectDescription').textContent = p.description ? 'Beschreibung: ' + p.description : '';
    $('#projectDescription').hidden = !p.description;
    $('#leadActions').hidden = !state.isLead;
    $('#manageTasksLink').href = 'task-manage.html?id=' + encodeURIComponent(p.id);
    $('#openMembersButton').hidden = !state.isLead;
    $('#newTaskButton').hidden = !(state.isLead && state.isActive);
  }

  function renderMemberCard() {
    const members = state.project.members.slice().sort((a, b) =>
      (a.role === 'PROJEKTLEITUNG' ? 0 : 1) - (b.role === 'PROJEKTLEITUNG' ? 0 : 1));
    $('#memberNames').innerHTML = members.map(m =>
      `<li>${esc(m.name)}${m.role === 'PROJEKTLEITUNG' ? '<span class="pl"> · PL</span>' : ''}</li>`).join('');
  }

  function renderTaskTable() {
    const lead = state.isLead;
    $('#taskHead').innerHTML = `
      <tr>
        <th scope="col">Erledigt</th>
        <th scope="col">Aufgabe</th>
        <th scope="col">Typ</th>
        <th scope="col">${lead ? 'Teilnehmer' : 'Zuständig / Teilnehmer'}</th>
        <th scope="col">Start</th>
        <th scope="col">Ende / Frist</th>
        <th scope="col">Prio</th>
        <th scope="col">Fortschritt</th>
      </tr>`;

    const open = state.tasks.filter(t => !t.done).sort(byStart);
    if (!open.length) {
      $('#taskBody').innerHTML = '<tr class="empty-row"><td colspan="8">Keine offenen To-Do\'s.</td></tr>';
      return;
    }
    $('#taskBody').innerHTML = open.map(task => taskRow(task) + subtaskRows(task)).join('');
  }

  function taskRow(task) {
    const lead = state.isLead;
    const isLong = task.type === 'LANGES_TODO';
    const expanded = state.expanded.has(task.id);
    const p = ui.progressOf(task);

    const doneCell = isLong
      ? '<span class="cell-auto">automatisch</span>'
      : `<input type="checkbox" data-action="task-done" data-task="${esc(task.id)}" aria-label="${esc(task.title)} erledigt" ${canTickMeeting(task) ? '' : 'disabled'}>`;

    const toggle = !lead && isLong && task.subtasks.length
      ? `<button type="button" class="toggle" data-action="expand" data-task="${esc(task.id)}" aria-expanded="${expanded}" aria-label="Teilaufgaben ${expanded ? 'einklappen' : 'ausklappen'}">${expanded ? '▾' : '▸'}</button>`
      : '';

    let progress;
    if (!isLong) progress = lead ? '–' : '';
    else if (!p.total) progress = '–';
    else if (lead) progress = `${p.done}/${p.total} Teilaufgaben · ${p.percent} %`;
    else progress = `<span class="progress">${ui.progressBar(task)} ${p.done}/${p.total} · ${p.percent} %</span>`;

    return `
      <tr>
        <td>${doneCell}</td>
        <td><div class="title-cell">${toggle}<button type="button" class="link-btn" data-action="open-task" data-task="${esc(task.id)}">${esc(task.title)}</button></div></td>
        <td>${esc(ui.TYPE[task.type])}</td>
        <td>${esc(participantsText(task))}</td>
        <td>${task.start ? esc(ui.fmtShort(task.start)) : '–'}</td>
        <td>${isLong ? 'Frist ' : ''}${esc(ui.fmtShort(task.end))}</td>
        <td><span class="pill">${esc(ui.PRIO[task.priority])}</span></td>
        <td>${progress}</td>
      </tr>`;
  }

  // Teilaufgaben-Zeilen nur in der Teammitglied-Ansicht (Wireframe S. 3)
  function subtaskRows(task) {
    if (state.isLead || task.type !== 'LANGES_TODO' || !state.expanded.has(task.id)) return '';
    return task.subtasks.map(sub => {
      let who;
      if (sub.assigneeId) who = esc(memberName(sub.assigneeId));
      else if (canClaim(task, sub)) who = `<button type="button" class="btn btn-strong btn-sm" data-action="claim" data-task="${esc(task.id)}" data-sub="${esc(sub.id)}">Übernehmen</button>`;
      else if (isParticipant(task)) who = 'frei';
      else who = 'frei · nur für Teilnehmer';

      return `
        <tr class="row-sub">
          <td><input type="checkbox" data-action="sub-done" data-task="${esc(task.id)}" data-sub="${esc(sub.id)}" aria-label="${esc(sub.title)} erledigt" ${sub.done ? 'checked' : ''} ${canTickSub(sub) ? '' : 'disabled'}></td>
          <td><div class="sub-title">↳ <button type="button" class="link-btn light" data-action="open-sub" data-task="${esc(task.id)}" data-sub="${esc(sub.id)}">${esc(sub.title)}</button></div></td>
          <td>Teilaufgabe</td>
          <td>${who}</td>
          <td>–</td>
          <td>wie To-Do</td>
          <td>–</td>
          <td>${sub.done ? 'erledigt' : 'offen'}</td>
        </tr>`;
    }).join('');
  }

  function renderDoneList() {
    const done = state.tasks.filter(t => t.done).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));
    $('#doneTitle').textContent = `Erledigt (${done.length})`;
    $('#doneList').hidden = !done.length;
    $('#doneList').innerHTML = done.map(task => {
      const editable = task.type === 'MEETING' && canTickMeeting(task);
      const by = task.doneBy ? ` · ${esc(memberName(task.doneBy))}` : '';
      const at = task.doneAt ? ` · ${esc(ui.fmtDayMonth(task.doneAt))}` : '';
      return `
        <li>
          <input type="checkbox" checked data-action="task-done" data-task="${esc(task.id)}" aria-label="${esc(task.title)} wieder öffnen" ${editable ? '' : 'disabled'}>
          <span><span class="strike">${esc(task.title)}</span>${by}${at}</span>
        </li>`;
    }).join('');
  }

  /* ================= Detail: Langes To-Do / Meeting (S. 9) ================= */

  function openTaskDetail(taskId) {
    state.detailTaskId = taskId;
    renderTaskDetail(taskId);
    ui.openModal('taskDetailModal');
  }

  function renderTaskDetail(taskId) {
    const task = findTask(taskId);
    if (!task) { ui.closeModal('taskDetailModal'); return; }
    const isLong = task.type === 'LANGES_TODO';
    const p = ui.progressOf(task);

    $('#taskDetailHeading').textContent = ui.TYPE[task.type];
    $('#taskDetailHint').textContent = isLong ? 'Wird automatisch erledigt, sobald alle Teilaufgaben erledigt sind.' : '';

    const subtasks = !isLong ? '' : `
      <div class="subtasks-head">
        <h3 style="margin:0;font-size:17px">Teilaufgaben</h3>
        <span class="progress">${ui.progressBar(task, true)} ${p.done}/${p.total} · ${p.percent} %</span>
      </div>
      ${task.subtasks.length ? task.subtasks.map(sub => subtaskItem(task, sub)).join('') : '<p class="empty">Noch keine Teilaufgaben.</p>'}`;

    $('#taskDetailBody').innerHTML = `
      <div class="detail-label">Titel</div>
      <div class="detail-value title">${esc(task.title)}</div>
      <div class="grid-2">
        <div>
          <div class="detail-label">Start</div>
          <div class="detail-value">${task.start ? esc(ui.fmtLong(task.start)) : '–'}</div>
        </div>
        <div>
          <div class="detail-label">${isLong ? 'Frist (gilt für alle Teilaufgaben)' : 'Ende'}</div>
          <div class="detail-value${isLong ? ' strong' : ''}">${esc(ui.fmtLong(task.end))}</div>
        </div>
        <div>
          <div class="detail-label">Priorität</div>
          <div class="detail-value">${esc(ui.PRIO[task.priority])}</div>
        </div>
        <div>
          <div class="detail-label">Projekt</div>
          <div class="detail-value"><a href="project.html?id=${encodeURIComponent(state.project.id)}">${esc(state.project.title)}</a></div>
        </div>
      </div>
      <div class="detail-label">Teilnehmer (von der Projektleitung festgelegt)</div>
      <div class="detail-value">${esc(participantsText(task, true))}</div>
      <div class="detail-label">Beschreibung</div>
      <div class="detail-desc">${task.description ? esc(task.description) : 'Keine Beschreibung.'}</div>
      ${subtasks}`;
  }

  function subtaskItem(task, sub) {
    const mine = sub.assigneeId === state.me.id;
    let checkbox;
    if (mine) checkbox = `<input type="checkbox" data-action="sub-done" data-task="${esc(task.id)}" data-sub="${esc(sub.id)}" aria-label="${esc(sub.title)} erledigt" ${sub.done ? 'checked' : ''} ${canTickSub(sub) ? '' : 'disabled'}>`;
    else if (sub.done) checkbox = `<input type="checkbox" checked disabled aria-label="${esc(sub.title)} erledigt">`;
    else checkbox = '<span class="checkbox-spacer"></span>';

    const who = sub.assigneeId ? nameWithYou(sub.assigneeId) : 'nicht zugewiesen';
    const claim = canClaim(task, sub)
      ? `<button type="button" class="btn btn-strong" data-action="claim" data-task="${esc(task.id)}" data-sub="${esc(sub.id)}">Übernehmen</button>`
      : '';
    const plan = sub.assigneeId === state.me.id && !sub.done
      ? `<button type="button" class="btn btn-sm" data-action="plan-sub" data-task="${esc(task.id)}" data-sub="${esc(sub.id)}">${sub.schedule ? 'Ändern' : 'Einplanen'}</button>`
      : '';
    const scheduled = sub.schedule ? ` · eingeplant ${esc(ui.fmtDate(sub.schedule.date))}, ${esc(sub.schedule.from)}–${esc(sub.schedule.to)}` : '';

    return `
      <div class="subtask-item${sub.done ? ' is-done' : ''}">
        ${checkbox}
        <div class="info">
          <button type="button" class="link-btn${sub.done ? ' strike' : ''}" data-action="open-sub" data-task="${esc(task.id)}" data-sub="${esc(sub.id)}">${esc(sub.title)}</button>
          <small>${esc(who)} · ${sub.done ? 'erledigt' : 'offen'}${scheduled}</small>
        </div>
        ${plan}${claim}
      </div>`;
  }

  /* ================= Detail: Teilaufgabe (S. 13) + Konflikt (S. 14) ================= */

  function openSubtask(taskId, subId, conflictName) {
    state.subtaskRef = { taskId, subId };
    renderSubtask(taskId, subId, conflictName);
    ui.openModal('subtaskModal');
  }

  function renderSubtask(taskId, subId, conflictName) {
    const task = findTask(taskId);
    const sub = findSub(task, subId);
    if (!task || !sub) { ui.closeModal('subtaskModal'); return; }

    if (conflictName) {
      $('#subtaskBody').innerHTML = `
        <div class="notice" role="alert"><strong>Nicht übernommen.</strong> ${esc(conflictName)} hat diese Teilaufgabe inzwischen übernommen.
          Wähle eine andere freie Teilaufgabe oder sprich dich mit ${esc(conflictName)} ab.</div>
        <div class="detail-label">Titel</div>
        <div class="detail-value title">${esc(sub.title)}</div>
        <div class="detail-label">Frist (vom langen To-Do)</div>
        <div class="detail-value strong">${esc(ui.fmtLong(task.end))}</div>
        <div class="detail-label">Zuständigkeit</div>
        <div class="detail-value">${esc(conflictName)}</div>`;
      $('#subtaskFoot').innerHTML = '<button type="button" class="btn btn-primary btn-lg" data-action="back-to-project">Zurück zum Projekt</button>';
      return;
    }

    $('#subtaskBody').innerHTML = `
      <div class="detail-label">Titel</div>
      <div class="detail-value title">${esc(sub.title)}</div>
      <div class="grid-2">
        <div>
          <div class="detail-label">Gehört zu</div>
          <div class="detail-value">${esc(task.title)} (langes To-Do) · ${esc(state.project.title)}</div>
        </div>
        <div>
          <div class="detail-label">Frist (vom langen To-Do)</div>
          <div class="detail-value strong">${esc(ui.fmtLong(task.end))}</div>
        </div>
      </div>
      <div class="detail-label">Zuständigkeit</div>
      <div class="detail-value">${sub.assigneeId ? esc(nameWithYou(sub.assigneeId)) + ' · ' + (sub.done ? 'erledigt' : 'offen') : 'noch nicht zugewiesen'}</div>
      <div class="detail-label">Beschreibung</div>
      <div class="detail-desc">${sub.description ? esc(sub.description) : 'Keine Beschreibung.'}</div>`;

    const scheduleAction = sub.assigneeId === state.me.id && !sub.done
      ? `<button type="button" class="btn btn-lg" data-action="plan-sub" data-task="${esc(task.id)}" data-sub="${esc(sub.id)}">${sub.schedule ? 'Einplanung ändern' : 'Einplanen'}</button>`
      : '';
    $('#subtaskFoot').innerHTML = `
      <button type="button" class="btn btn-lg" data-close>Schließen</button>
      ${scheduleAction}
      ${canClaim(task, sub) ? `<button type="button" class="btn btn-primary btn-lg" data-action="claim" data-task="${esc(task.id)}" data-sub="${esc(sub.id)}">Aufgabe übernehmen</button>` : ''}`;
  }

  /* ================= Aktionen To-Dos ================= */

  async function toggleTaskDone(checkbox) {
    const checked = checkbox.checked;
    checkbox.disabled = true;
    try {
      // BACKEND: PUT /projects/{projectId}/tasks/{taskId}/status
      await api.setTaskDone(projectId, checkbox.dataset.task, checked);
      ui.toast(checked ? 'Als erledigt markiert.' : 'Wieder geöffnet.');
      await refresh();
    } catch (error) {
      checkbox.checked = !checked;
      checkbox.disabled = false;
      ui.toast(error.message, true);
    }
  }

  async function toggleSubtaskDone(checkbox) {
    const checked = checkbox.checked;
    checkbox.disabled = true;
    try {
      // BACKEND: PATCH /tasks/{taskId}/subtasks/{subtaskId}  { done }
      const task = await api.setSubtaskDone(checkbox.dataset.task, checkbox.dataset.sub, checked);
      ui.toast(task && task.done ? 'Alle Teilaufgaben erledigt – das lange To-Do ist automatisch erledigt.' : 'Teilaufgabe aktualisiert.');
      await refresh();
    } catch (error) {
      checkbox.checked = !checked;
      checkbox.disabled = false;
      ui.toast(error.message, true);
    }
  }

  async function claimSubtask(button) {
    const { task: taskId, sub: subId } = button.dataset;
    await ui.withBusy(button, async () => {
      try {
        // BACKEND: POST /tasks/{taskId}/subtasks/{subtaskId}/claim  (409 = schon vergeben)
        await api.claimSubtask(taskId, subId);
        ui.toast('Teilaufgabe übernommen.');
        await refresh();
        if (!$('#subtaskModal').hidden) renderSubtask(taskId, subId);
      } catch (error) {
        if (error.status === 409) {
          const name = (error.data && error.data.assigneeName) || 'Jemand anderes';
          await refresh();
          if ($('#subtaskModal').hidden) openSubtask(taskId, subId, name);
          else renderSubtask(taskId, subId, name);
        } else {
          ui.toast(error.message, true);
        }
      }
    });
  }

  /* ================= Mitglieder (S. 7) ================= */

  async function openMembers() {
    renderMemberItems();
    $('#invitationItems').innerHTML = '<p class="empty">Einladungen werden geladen …</p>';
    ui.openModal('membersModal');
    await loadInvitations();
  }

  async function loadInvitations() {
    try {
      // BACKEND: GET /projects/{projectId}/invitations?status=AUSSTEHEND
      state.invitations = await api.getInvitations(projectId);
      renderInvitationItems();
    } catch (error) {
      $('#invitationItems').innerHTML = `<p class="empty">${esc(error.message)}</p>`;
    }
  }

  function renderMemberItems() {
    $('#membersModalTitle').textContent = 'Mitglieder · ' + state.project.title;
    $('#memberItems').innerHTML = state.project.members.map(m => `
      <div class="member-item">
        <div class="info">
          <strong>${esc(m.name)}</strong>
          <small>${esc(m.email)} · ${esc(ui.ROLE[m.role])}</small>
        </div>
        <button type="button" class="icon-btn" data-action="edit-member" data-user="${esc(m.userId)}" aria-label="Rolle von ${esc(m.name)} ändern" title="Rolle ändern">${ui.ICON.pencil}</button>
        <button type="button" class="icon-btn" data-action="remove-member" data-user="${esc(m.userId)}" aria-label="${esc(m.name)} entfernen" title="Aus Projekt entfernen">${ui.ICON.trash}</button>
      </div>`).join('');
  }

  function renderInvitationItems() {
    if (!state.invitations.length) {
      $('#invitationItems').innerHTML = '<p class="empty">Keine ausstehenden Einladungen.</p>';
      return;
    }
    $('#invitationItems').innerHTML = state.invitations.map(inv => `
      <div class="member-item pending">
        <div class="info">
          <strong>${esc(inv.email)}</strong>
          <small>${esc(ui.ROLE[inv.role])} · eingeladen am ${esc(ui.fmtDayMonth(inv.sentAt))} · ausstehend</small>
        </div>
        <button type="button" class="btn btn-lg" data-action="withdraw" data-invitation="${esc(inv.id)}">Zurückziehen</button>
      </div>`).join('');
  }

  async function removeMember(button) {
    const userId = button.dataset.user;
    const name = memberName(userId);
    const self = userId === state.me.id;
    const question = self
      ? 'Möchtest du dich wirklich selbst aus dem Projekt entfernen? Du verlierst danach den Zugriff.'
      : `${name} wirklich aus dem Projekt entfernen?`;
    if (!window.confirm(question)) return;
    await ui.withBusy(button, async () => {
      try {
        // BACKEND: DELETE /projects/{projectId}/members/{userId}
        await api.removeMember(projectId, userId);
        if (self) { window.location.href = 'projects.html'; return; }
        ui.toast(`${name} wurde entfernt.`);
        await refresh();
        renderMemberItems();
      } catch (error) {
        ui.toast(error.message, true);
      }
    });
  }

  function openRoleEditor(userId) {
    const m = member(userId);
    if (!m) return;
    state.editingMemberId = userId;
    const form = $('#roleForm');
    ui.clearFormError(form);
    $('#roleTitle').textContent = 'Rolle ändern · ' + m.name;
    form.querySelectorAll('input[name="role"]').forEach(r => { r.checked = r.value === m.role; });
    ui.openModal('roleModal');
  }

  async function saveRole(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const role = form.querySelector('input[name="role"]:checked').value;
    await ui.withBusy($('#roleSubmit'), async () => {
      try {
        // BACKEND: PATCH /projects/{projectId}/members/{userId}  { role }
        await api.updateMemberRole(projectId, state.editingMemberId, role);
        ui.closeModal('roleModal');
        ui.toast('Rolle gespeichert.');
        await refresh();
        if (state.isLead) renderMemberItems(); else ui.closeModal('membersModal');
      } catch (error) {
        ui.showFormError(form, error.message);
      }
    });
  }

  async function withdrawInvitation(button) {
    await ui.withBusy(button, async () => {
      try {
        // BACKEND: DELETE /projects/{projectId}/invitations/{invitationId}
        await api.withdrawInvitation(projectId, button.dataset.invitation);
        ui.toast('Einladung zurückgezogen.');
        await loadInvitations();
      } catch (error) {
        ui.toast(error.message, true);
      }
    });
  }

  /* ================= Mitglied einladen (S. 8) ================= */

  function openInvite() {
    const form = $('#inviteForm');
    form.reset();
    ui.clearFormError(form);
    ui.openModal('inviteModal');
  }

  async function sendInvitation(event) {
    event.preventDefault();
    const form = event.currentTarget;
    ui.clearFormError(form);
    const email = form.elements.email.value.trim().toLowerCase();
    const role = form.querySelector('input[name="role"]:checked').value;
    if (!EMAIL_PATTERN.test(email)) {
      ui.showFormError(form, 'Bitte eine gültige E-Mail-Adresse eingeben.');
      form.elements.email.focus();
      return;
    }
    await ui.withBusy($('#inviteSubmit'), async () => {
      try {
        // KI-Log Nr. 46: Einladung sendet JSON { email, role }; Token liegt nur im Header.
        // BACKEND: POST http://localhost:8080/projects/{projectId}/invitations
        await api.inviteMember(projectId, { email, role });
        ui.closeModal('inviteModal');
        ui.toast(`Einladung an ${email} gesendet.`);
        await loadInvitations();
      } catch (error) {
        ui.showFormError(form, error.message);
      }
    });
  }

  /* ================= Projekt bearbeiten ================= */

  function openEditProject() {
    const form = $('#editProjectForm');
    ui.clearFormError(form);
    form.elements.title.value = state.project.title;
    form.elements.description.value = state.project.description || '';
    form.elements.status.value = state.project.status;
    ui.openModal('editProjectModal');
  }

  async function saveProject(event) {
    event.preventDefault();
    const form = event.currentTarget;
    ui.clearFormError(form);
    const data = {
      title: form.elements.title.value.trim(),
      description: form.elements.description.value.trim(),
      status: form.elements.status.value
    };
    if (!data.title) {
      ui.showFormError(form, 'Bitte einen Titel eingeben.');
      form.elements.title.focus();
      return;
    }
    await ui.withBusy($('#editProjectSubmit'), async () => {
      try {
        // BACKEND: PATCH /projects/{projectId}  { title, description, status }
        await api.updateProject(projectId, data);
        ui.closeModal('editProjectModal');
        ui.toast('Projekt gespeichert.');
        await refresh();
      } catch (error) {
        ui.showFormError(form, error.message);
      }
    });
  }

  /* ================= Neue Aufgabe (S. 11) ================= */

  function openNewTask() {
    const form = $('#newTaskForm');
    form.reset();
    ui.clearFormError(form);
    $('#newTaskTitle').textContent = 'Neue Aufgabe · ' + state.project.title;
    state.newSubtasks = null;
    state.picker = ui.participantPicker($('#newTaskParticipants'), {
      members: state.project.members,
      selectedIds: [state.me.id],
      onChange: () => {
        resetAvailability();
        if (state.newSubtasks) state.newSubtasks.setParticipants(state.picker.getValue().participantIds);
      }
    });
    state.newSubtasks = ui.subtaskEditor($('#newSubtasks'), {
      members: state.project.members, subtasks: [], currentUserId: state.me.id,
      getAssignableIds: () => state.picker ? state.picker.getValue().participantIds : []
    });
    setTaskType('MEETING');
    resetAvailability();
    ui.openModal('newTaskModal');
  }

  function setTaskType(type) {
    state.newTaskType = type;
    document.querySelectorAll('#newTaskForm [data-type]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.type === type)));
    const isLong = type === 'LANGES_TODO';
    $('#taskStartLabel').textContent = isLong ? 'Start' : 'Start *';
    $('#taskEndLabel').textContent = isLong ? 'Frist *' : 'Ende *';
    $('#availabilityBox').hidden = isLong;
    $('#newSubtaskSection').hidden = !isLong;
  }

  function resetAvailability() {
    if (!state.picker) return;
    const ids = state.picker.getValue().participantIds;
    $('#availabilityRows').innerHTML = ids.length
      ? ids.map(id => `<div class="availability-row"><span>${esc(memberName(id))}</span><span class="muted">nicht geprüft</span></div>`).join('')
      : '<p class="empty">Noch keine Teilnehmer ausgewählt.</p>';
  }

  function readTimes(form) {
    const start = ui.parseInput(form.elements.start.value);
    const end = ui.parseInput(form.elements.end.value);
    if (start === null || end === null) return { error: 'Bitte Datum und Uhrzeit im Format TT.MM.JJJJ hh:mm eingeben.' };
    return { start, end };
  }

  async function checkAvailability(button) {
    const form = $('#newTaskForm');
    ui.clearFormError(form);
    const times = readTimes(form);
    if (times.error) { ui.showFormError(form, times.error); return; }
    if (!times.start || !times.end) { ui.showFormError(form, 'Bitte zuerst Start und Ende eingeben.'); return; }
    if (times.end <= times.start) { ui.showFormError(form, 'Das Ende muss nach dem Start liegen.'); return; }
    const userIds = state.picker.getValue().participantIds;
    if (!userIds.length) { ui.showFormError(form, 'Bitte mindestens einen Teilnehmer auswählen.'); return; }

    await ui.withBusy(button, async () => {
      try {
        // BACKEND: POST /availability  { userIds, start, end }  (Daten aus dem externen Kalender)
        const result = await api.checkAvailability({ userIds, start: times.start, end: times.end });
        $('#availabilityRows').innerHTML = result.map(r => `
          <div class="availability-row">
            <span>${esc(r.name)}</span>
            ${r.free ? '<span>frei</span>' : `<span class="conflict">Konflikt: belegt ${esc(ui.fmtTime(r.busyFrom))}–${esc(ui.fmtTime(r.busyTo))}</span>`}
          </div>`).join('');
      } catch (error) {
        ui.showFormError(form, error.message);
      }
    });
  }

  async function createTask(event) {
    event.preventDefault();
    const form = event.currentTarget;
    ui.clearFormError(form);
    const type = state.newTaskType;
    const title = form.elements.title.value.trim();
    const times = readTimes(form);
    const participants = state.picker.getValue();
    const subtasks = type === 'LANGES_TODO' ? state.newSubtasks.getValue() : [];

    let error = null;
    if (!title) error = 'Bitte einen Titel eingeben.';
    else if (times.error) error = times.error;
    else if (type === 'MEETING' && !times.start) error = 'Bitte einen Start angeben.';
    else if (!times.end) error = type === 'MEETING' ? 'Bitte ein Ende angeben.' : 'Bitte eine Frist angeben.';
    else if (times.start && times.end <= times.start) error = 'Ende / Frist muss nach dem Start liegen.';
    else if (state.picker.isEmpty()) error = 'Bitte mindestens einen Teilnehmer auswählen.';
    else if (subtasks.some(s => !s.title)) error = 'Bitte allen Teilaufgaben einen Titel geben oder leere Teilaufgaben löschen.';
    if (error) { ui.showFormError(form, error); return; }

    const commonData = {
      title,
      description: form.elements.description.value.trim(),
      start: times.start || null,
      end: times.end,
      priority: form.elements.priority.value,
      allParticipants: participants.allParticipants,
      participantIds: participants.participantIds
    };
    const data = type === 'MEETING' ? commonData : { ...commonData, subtasks };

    await ui.withBusy($('#newTaskSubmit'), async () => {
      try {
        // KI-Log Nr. 43: Je Task-Typ erhält einen eigenen JSON-Payload.
        // BACKEND: POST http://localhost:8080/projects/{projectId}/tasks
        const created = type === 'MEETING'
          ? await api.createMeeting(projectId, data)
          : await api.createLongTodo(projectId, data);
        if (created && created.type === 'LANGES_TODO') state.expanded.add(created.id);
        ui.closeModal('newTaskModal');
        ui.toast('Aufgabe angelegt.');
        await refresh();
      } catch (err) {
        ui.showFormError(form, err.message);
      }
    });
  }

  /* KI-Log Nr. 39 | ================= Teilaufgabe einplanen (S. 15) ================= */

  async function openSchedule(taskId, subId) {
    const task = findTask(taskId);
    const sub = findSub(task, subId);
    if (!task || !sub || sub.assigneeId !== state.me.id || sub.done) return;
    state.scheduling = { taskId, subId };
    const form = $('#scheduleForm');
    ui.clearFormError(form);
    $('#scheduleTaskTitle').textContent = sub.title;
    $('#scheduleTaskMeta').textContent = `${task.title} · ${state.project.title} · Frist ${ui.fmtDate(task.end)}`;
    form.elements.date.value = sub.schedule ? sub.schedule.date : '';
    form.elements.from.value = sub.schedule ? sub.schedule.from : '';
    form.elements.to.value = sub.schedule ? sub.schedule.to : '';
    $('#freeSlotList').innerHTML = '<p class="empty">Freie Zeiten werden geladen …</p>';
    ui.openModal('scheduleModal');
    try {
      // BACKEND: GET /availability/free-slots?userId={me}&until={task.end}
      const slots = await api.getFreeSlots(state.me.id, (task.end || '').slice(0, 10));
      $('#freeSlotList').innerHTML = slots.length ? slots.map((slot, i) => `
        <label class="slot-option"><input type="radio" name="freeSlot" value="${i}" data-date="${esc(slot.date)}" data-from="${esc(slot.from)}" data-to="${esc(slot.to)}">
          <span>${esc(ui.fmtDate(slot.date))} · <strong>${esc(slot.from)}–${esc(slot.to)}</strong></span></label>`).join('') : '<p class="empty">Bis zur Frist wurden keine freien Zeitfenster gefunden.</p>';
      $('#freeSlotList').querySelectorAll('input[name="freeSlot"]').forEach(radio => radio.addEventListener('change', () => {
        form.elements.date.value = radio.dataset.date;
        form.elements.from.value = radio.dataset.from;
        form.elements.to.value = radio.dataset.to;
      }));
    } catch (error) {
      $('#freeSlotList').innerHTML = `<p class="empty">${esc(error.message)}</p>`;
    }
  }

  async function saveSchedule(event) {
    event.preventDefault();
    const form = event.currentTarget;
    ui.clearFormError(form);
    const slot = { date: form.elements.date.value, from: form.elements.from.value, to: form.elements.to.value };
    if (!slot.date || !slot.from || !slot.to) { ui.showFormError(form, 'Bitte Datum, Von und Bis ausfüllen.'); return; }
    if (slot.to <= slot.from) { ui.showFormError(form, 'Die Endzeit muss nach der Startzeit liegen.'); return; }
    const task = findTask(state.scheduling.taskId);
    if (task && task.end && slot.date > task.end.slice(0, 10)) { ui.showFormError(form, 'Das Zeitfenster muss bis zur Frist liegen.'); return; }
    await ui.withBusy($('#scheduleSubmit'), async () => {
      try {
        // BACKEND: POST /tasks/{taskId}/subtasks/{subtaskId}/schedule  { date, from, to }
        await api.scheduleSubtask(state.scheduling.taskId, state.scheduling.subId, slot);
        ui.closeModal('scheduleModal');
        ui.toast('Teilaufgabe wurde eingeplant.');
        await refresh();
      } catch (error) {
        ui.showFormError(form, error.message);
      }
    });
  }

  /* ================= Events ================= */

  function handleClick(event) {
    const el = event.target.closest('[data-action]');
    if (!el || el.tagName === 'INPUT') return;
    const { action, task, sub } = el.dataset;
    if (action === 'expand') {
      if (state.expanded.has(task)) state.expanded.delete(task); else state.expanded.add(task);
      renderTaskTable();
    } else if (action === 'open-task') openTaskDetail(task);
    else if (action === 'open-sub') openSubtask(task, sub);
    else if (action === 'claim') claimSubtask(el);
    else if (action === 'plan-sub') openSchedule(task, sub);
    else if (action === 'edit-member') openRoleEditor(el.dataset.user);
    else if (action === 'remove-member') removeMember(el);
    else if (action === 'withdraw') withdrawInvitation(el);
    else if (action === 'back-to-project') {
      ui.closeModal('subtaskModal');
      ui.closeModal('taskDetailModal');
    }
  }

  function handleChange(event) {
    const el = event.target;
    if (el.dataset.action === 'task-done') toggleTaskDone(el);
    else if (el.dataset.action === 'sub-done') toggleSubtaskDone(el);
  }

  function bindEvents() {
    ['#taskBody', '#doneList', '#taskDetailBody', '#subtaskBody', '#subtaskFoot', '#memberItems', '#invitationItems'].forEach(sel => {
      $(sel).addEventListener('click', handleClick);
      $(sel).addEventListener('change', handleChange);
    });

    $('#openMembersButton').addEventListener('click', openMembers);
    $('#openInviteButton').addEventListener('click', openInvite);
    $('#inviteForm').addEventListener('submit', sendInvitation);
    $('#roleForm').addEventListener('submit', saveRole);
    $('#editProjectButton').addEventListener('click', openEditProject);
    $('#editProjectForm').addEventListener('submit', saveProject);

    $('#newTaskButton').addEventListener('click', openNewTask);
    $('#newTaskForm').addEventListener('submit', createTask);
    $('#scheduleForm').addEventListener('submit', saveSchedule);
    document.querySelectorAll('#newTaskForm [data-type]').forEach(b => b.addEventListener('click', () => setTaskType(b.dataset.type)));
    $('#checkAvailabilityButton').addEventListener('click', event => checkAvailability(event.currentTarget));
    $('#addNewSubtaskButton').addEventListener('click', () => state.newSubtasks && state.newSubtasks.add());
    ['#taskStart', '#taskEnd'].forEach(sel => $(sel).addEventListener('input', resetAvailability));
  }
})();
