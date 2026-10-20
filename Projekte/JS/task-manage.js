/* =====================================================================
   Plan B - Task verwalten (task-manage.html?id=...)
   KI-Log Nr. 36
   Nur fuer die Projektleitung: Tasks bearbeiten (inkl. Teilaufgaben) und loeschen.
   Backend-Aufrufe: getProject, getTasks, updateTask, deleteTask (siehe api.js)
   ===================================================================== */
(function () {
  'use strict';

  const api = window.PlanBApi;
  const ui = window.PlanBUI;
  const { $, esc } = ui;

  const projectId = ui.getParam('id');
  const state = { me: null, project: null, tasks: [], editingId: null, picker: null, subtasks: null };

  init();

  async function init() {
    bindEvents();
    state.me = await ui.initTopbar(api);
    if (!state.me) {
      try { state.me = await api.getCurrentUser(); } catch (error) { /* page guard below renders any useful error */ }
    }
    if (!projectId) { showPageError('Kein Projekt ausgewählt.'); return; }
    $('#backToProject').href = 'project.html?id=' + encodeURIComponent(projectId);
    try {
      await loadData();
      if (state.project.myRole !== 'PROJEKTLEITUNG') {
        showPageError('Nur die Projektleitung kann Tasks verwalten.');
        return;
      }
      render();
      $('#manageView').hidden = false;
    } catch (error) {
      showPageError(error.message);
    }
  }

  async function loadData() {
    // BACKEND: GET /projects/{projectId}  und  GET /projects/{projectId}/tasks
    const [project, tasks] = await Promise.all([api.getProject(projectId), api.getTasks(projectId)]);
    state.project = project;
    state.tasks = tasks;
  }

  function showPageError(message) {
    $('#pageMessage').textContent = message;
    $('#pageMessage').hidden = false;
    $('#manageView').hidden = true;
  }

  function memberName(id) {
    const m = state.project.members.find(x => x.userId === id);
    return m ? m.name : 'ehemaliges Mitglied';
  }
  function participantsText(task) {
    if (task.allParticipants) return 'Alle';
    return task.participantIds.length ? task.participantIds.map(memberName).join(', ') : '–';
  }

  /* ---------- Tabelle ---------- */

  function render() {
    const p = state.project;
    document.title = 'Task verwalten · ' + p.title + ' · Plan B';
    $('#backToProject').textContent = '← ' + p.title;
    $('#manageTitle').textContent = 'Task verwalten · ' + p.title;

    const open = state.tasks.filter(t => !t.done);
    if (!open.length) {
      $('#manageBody').innerHTML = '<tr class="empty-row"><td colspan="8">Keine offenen Aufgaben. Neue Aufgaben legst du in der Projektansicht an.</td></tr>';
      return;
    }
    $('#manageBody').innerHTML = open.map(task => {
      const isLong = task.type === 'LANGES_TODO';
      const prog = ui.progressOf(task);
      return `
        <tr>
          <td><strong>${esc(task.title)}</strong></td>
          <td>${esc(ui.TYPE[task.type])}</td>
          <td><span class="pill">${esc(ui.PRIO[task.priority])}</span></td>
          <td>${esc(participantsText(task))}</td>
          <td>${task.start ? esc(ui.fmtShort(task.start)) : '–'}</td>
          <td>${isLong ? 'Frist ' : ''}${esc(ui.fmtShort(task.end))}</td>
          <td>${isLong && prog.total ? `${prog.done}/${prog.total} erledigt` : '–'}</td>
          <td>
            <div class="actions">
              <button type="button" class="icon-btn" data-action="edit" data-task="${esc(task.id)}" aria-label="${esc(task.title)} bearbeiten" title="Bearbeiten">${ui.ICON.pencil}</button>
              <button type="button" class="icon-btn" data-action="delete" data-task="${esc(task.id)}" aria-label="${esc(task.title)} löschen" title="Löschen">${ui.ICON.trash}</button>
            </div>
          </td>
        </tr>`;
    }).join('');
  }

  /* ---------- Task bearbeiten (S. 10) ---------- */

  function openEditor(taskId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;
    state.editingId = taskId;
    const form = $('#editTaskForm');
    ui.clearFormError(form);
    form.elements.title.value = task.title;
    form.elements.type.value = task.type;
    form.elements.priority.value = task.priority;
    form.elements.start.value = ui.fmtInput(task.start);
    form.elements.end.value = ui.fmtInput(task.end);
    form.elements.description.value = task.description || '';

    state.subtasks = null;
    state.picker = ui.participantPicker($('#editTaskParticipants'), {
      members: state.project.members,
      allParticipants: task.allParticipants,
      selectedIds: task.participantIds,
      onChange: () => {
        if (state.subtasks) state.subtasks.setParticipants(state.picker.getValue().participantIds);
      }
    });
    state.subtasks = ui.subtaskEditor($('#editSubtasks'), {
      members: state.project.members, subtasks: task.subtasks, currentUserId: state.me && state.me.id,
      getAssignableIds: () => state.picker ? state.picker.getValue().participantIds : []
    });
    applyType(task.type);
    ui.openModal('editTaskModal');
  }

  function applyType(type) {
    const isLong = type === 'LANGES_TODO';
    $('#editSubtaskSection').hidden = !isLong;
    $('#editTaskStartLabel').textContent = isLong ? 'Start' : 'Start *';
    $('#editTaskEndLabel').textContent = isLong ? 'Ende / Frist *' : 'Ende *';
  }

  async function saveTask(event) {
    event.preventDefault();
    const form = event.currentTarget;
    ui.clearFormError(form);
    const type = form.elements.type.value;
    const title = form.elements.title.value.trim();
    const start = ui.parseInput(form.elements.start.value);
    const end = ui.parseInput(form.elements.end.value);
    const participants = state.picker.getValue();
    const subtasks = type === 'LANGES_TODO' ? state.subtasks.getValue() : [];

    let error = null;
    if (!title) error = 'Bitte einen Titel eingeben.';
    else if (start === null || end === null) error = 'Bitte Datum und Uhrzeit im Format TT.MM.JJJJ hh:mm eingeben.';
    else if (type === 'MEETING' && !start) error = 'Bitte einen Start angeben.';
    else if (!end) error = 'Bitte Ende / Frist angeben.';
    else if (start && end <= start) error = 'Ende / Frist muss nach dem Start liegen.';
    else if (state.picker.isEmpty()) error = 'Bitte mindestens einen Teilnehmer auswählen.';
    else if (subtasks.some(s => !s.title)) error = 'Bitte allen Teilaufgaben einen Titel geben oder leere Teilaufgaben löschen.';
    if (error) { ui.showFormError(form, error); return; }

    const original = state.tasks.find(t => t.id === state.editingId);
    if (original && original.type === 'LANGES_TODO' && type === 'MEETING' && original.subtasks.length
      && !window.confirm('Beim Wechsel zu „Meeting“ werden alle Teilaufgaben gelöscht. Fortfahren?')) return;

    const data = {
      type,
      title,
      description: form.elements.description.value.trim(),
      start: start || null,
      end,
      priority: form.elements.priority.value,
      allParticipants: participants.allParticipants,
      participantIds: participants.participantIds,
      subtasks
    };

    await ui.withBusy($('#saveTaskButton'), async () => {
      try {
        // BACKEND: PUT /tasks/{taskId}  (kompletter Task inkl. Teilaufgaben; neue Teilaufgaben mit id = null)
        await api.updateTask(state.editingId, data);
        ui.closeModal('editTaskModal');
        ui.toast('Task gespeichert.');
        await reload();
      } catch (err) {
        ui.showFormError(form, err.message);
      }
    });
  }

  async function deleteTask(taskId, button) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;
    if (!window.confirm(`Task „${task.title}“ wirklich löschen? Das kann nicht rückgängig gemacht werden.`)) return;
    await ui.withBusy(button, async () => {
      try {
        // BACKEND: DELETE /tasks/{taskId}
        await api.deleteTask(taskId);
        ui.closeModal('editTaskModal');
        ui.toast('Task gelöscht.');
        await reload();
      } catch (error) {
        ui.toast(error.message, true);
      }
    });
  }

  async function reload() {
    try {
      await loadData();
      render();
    } catch (error) {
      ui.toast(error.message, true);
    }
  }

  /* ---------- Events ---------- */

  function bindEvents() {
    $('#manageBody').addEventListener('click', event => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      if (button.dataset.action === 'edit') openEditor(button.dataset.task);
      if (button.dataset.action === 'delete') deleteTask(button.dataset.task, button);
    });
    $('#editTaskForm').addEventListener('submit', saveTask);
    $('#editTaskType').addEventListener('change', event => applyType(event.target.value));
    $('#addSubtaskButton').addEventListener('click', () => state.subtasks && state.subtasks.add());
    $('#deleteTaskButton').addEventListener('click', event => deleteTask(state.editingId, event.currentTarget));
  }
})();
