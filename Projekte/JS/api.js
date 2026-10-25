/* =====================================================================
   Plan B - API-Schicht fuer den Bereich "Projekte"
   KI-Log Nr. 37
   ---------------------------------------------------------------------
   Alle Projektseiten sprechen NUR ueber diese Datei mit dem Backend.
   Solange USE_MOCK = true ist, laufen die Seiten mit Testdaten aus den
   Wireframes (in sessionStorage, damit Aenderungen beim Seitenwechsel bleiben).

   BACKEND EINBINDEN - an allen Stellen mit "BACKEND:" markiert:
     1. API_BASE auf Eure Server-URL setzen.
     2. TOKEN_KEY an login.js angleichen (dort wird der Token gespeichert).
     3. USE_MOCK = false setzen.
     4. Pro Funktion Pfad, Methode und Feldnamen mit Eurem API-Design abgleichen.
     5. Backend-CORS muss die Frontend-Origin sowie Authorization und Content-Type erlauben.

   Erwartete Feldwerte (Enums):
     role:     'PROJEKTLEITUNG' | 'TEAMMITGLIED'
     status:   'AKTIV' | 'ABGESCHLOSSEN'
     type:     'MEETING' | 'LANGES_TODO'
     priority: 'HOCH' | 'MITTEL' | 'NIEDRIG'
     Datum/Zeit: 'YYYY-MM-DDTHH:mm' (lokale Zeit, ohne Zeitzone)
   ===================================================================== */
(function () {
  'use strict';

  // KI-Log Nr. 41: API-URL wie im vorhandenen Mia-Projekt als Konfiguration.
  // BACKEND: Diese Basis-URL auf den erreichbaren Server setzen.
  const API_BASE = 'https://plan-b-api-6486e78ed17c.herokuapp.com';

  // KI-Log Nr. 43: Echte Requests an den Backend-Port verwenden.
  const USE_MOCK = false;

  // KI-Log Nr. 44: Nur für die lokale Entwicklung ohne Login.
  // Vor dem echten Betrieb unbedingt auf false setzen.
  const DEV_BYPASS_AUTH = false;

  // KI-Log Nr. 42: Login und API verwenden sessionStorage mit demselben Schlüssel.
  const TOKEN_KEY = 'token';

  // Login-Datei liegt im Projekt-Root, zwei Ebenen über Projekte/HTML.
  const LOGIN_PAGE = '../../Login/HTML/login.html';

  let cachedUser = null; // KI-Log Nr. 41: currentUserId fuer Rollen-/Mitglieder-Mapping wiederverwenden.

  class ApiError extends Error {
    constructor(status, message, data) {
      super(message);
      this.status = status;
      this.data = data || null;
    }
  }

  const DEFAULT_MESSAGES = {
    400: 'Die Eingaben sind ungültig.',
    403: 'Dafür fehlt dir die Berechtigung.',
    404: 'Der Eintrag wurde nicht gefunden.',
    409: 'Konflikt: Die Daten wurden inzwischen geändert.'
  };

  /* ------------------------------------------------------------------
     Zentrale fetch-Funktion fuer das echte Backend
     - haengt den Token als Bearer-Header an
     - 401 -> zurueck zur Login-Seite
     - Fehler werden als ApiError(status, message) geworfen
     ------------------------------------------------------------------ */
  // KI-Log Nr. 46: Der Token wird bei geschützten Requests ausschließlich
  // im Authorization-Header übertragen; der JSON-Body enthält nur Fachdaten.
  function readToken() {
    if (DEV_BYPASS_AUTH && USE_MOCK) return 'development-token';
    try { return window.sessionStorage.getItem(TOKEN_KEY); }
    catch (error) { return null; }
  }

  function goToLogin() {
    if (DEV_BYPASS_AUTH && USE_MOCK) return;
    try { window.sessionStorage.removeItem(TOKEN_KEY); } catch (error) { /* Storage kann gesperrt sein */ }
    window.location.href = LOGIN_PAGE;
  }

  async function request(method, path, body) {
    const token = readToken();
    if (!token) {
      goToLogin();
      throw new ApiError(401, 'Bitte melde dich zuerst an.');
    }

    const headers = { Accept: 'application/json', Authorization: 'Bearer ' + token };
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    let response;
    try {
      response = await fetch(API_BASE + path, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined
      });
    } catch (networkError) {
      throw new ApiError(0, 'Der Server ist nicht erreichbar. Bitte Verbindung prüfen und erneut versuchen.');
    }

    if (response.status === 401) {
      goToLogin();
      throw new ApiError(401, 'Deine Anmeldung ist abgelaufen. Bitte melde dich erneut an.');
    }
    if (response.status === 204) return null;

    const text = await response.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); } catch (e) { data = { message: text }; }
    }
    if (!response.ok) {
      const rawMessage = data && (data.message || data.error);
      const knownMessages = {
        'title missing': 'Bitte einen Titel eingeben.',
        'project not found': 'Projekt nicht gefunden. Bitte lade die Projektübersicht neu.',
        'invalid token': 'Deine Anmeldung ist abgelaufen. Bitte melde dich erneut an.'
      };
      const message = knownMessages[rawMessage] || rawMessage || DEFAULT_MESSAGES[response.status]
        || 'Unerwarteter Fehler (' + response.status + ').';
      throw new ApiError(response.status, message, data);
    }
    return data;
  }

  // KI-Log Nr. 41: Fallback-Identitaet aus Standard-JWT-Claims fuer den UI-Namen.
  // Die Berechtigung wird NIE clientseitig aus dem JWT abgeleitet; das Backend prueft jeden Request.
  function tokenClaims() {
    try {
      const token = readToken();
      const payload = token && token.split('.')[1];
      if (!payload) return {};
      const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
      const json = decodeURIComponent(Array.from(window.atob(base64)).map(ch => '%' + ch.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
      return JSON.parse(json);
    } catch (error) { return {}; }
  }

  // KI-Log Nr. 41: Response-Mapper akzeptieren direkte Antworten und gängige Wrapper.
  function normalizeRole(value) {
    const role = String(value || '').toUpperCase();
    if (['PL', 'PROJECT_LEAD', 'PROJECT_MANAGER', 'PROJEKTLEITER', 'PROJEKTLEITUNG'].includes(role)) return 'PROJEKTLEITUNG';
    if (['MEMBER', 'TEAM_MEMBER', 'TEAMMITGLIED'].includes(role)) return 'TEAMMITGLIED';
    return value || 'TEAMMITGLIED';
  }

  function normalizeStatus(value) {
    const status = String(value || '').toLowerCase();
    if (['active', 'aktiv'].includes(status)) return 'AKTIV';
    if (['completed', 'abgeschlossen', 'closed'].includes(status)) return 'ABGESCHLOSSEN';
    return value || 'AKTIV';
  }

  function normalizeProject(raw) {
    const p = raw && (raw.project || (raw.data && raw.data.project)) || raw || {};
    const members = Array.isArray(p.members) ? p.members : [];
    const currentId = String(p.currentUserId || (cachedUser && cachedUser.id) || '');
    const currentEmail = String(p.currentUserEmail || (cachedUser && cachedUser.email) || '').toLowerCase();
    const currentMember = members.find(m => String(m.userId ?? m.id ?? '') === currentId || (currentEmail && String(m.email || '').toLowerCase() === currentEmail));
    return {
      ...p,
      id: String(p.id ?? p.projectId ?? raw.projectId ?? ''),
      title: p.title || p.name || '',
      description: p.description || '',
      status: normalizeStatus(p.status),
      myRole: normalizeRole(p.myRole || p.role || (currentMember || {}).role),
      updatedAt: p.updatedAt || p.lastModifiedAt || p.lastModified || '',
      memberCount: p.memberCount ?? members.length,
      members: members.map(m => ({
        ...m,
        userId: String(m.userId ?? m.id ?? m.memberId ?? ''),
        name: m.name || m.displayName || m.email || '',
        email: m.email || '',
        role: normalizeRole(m.role)
      }))
    };
  }

  function normalizeTask(raw) {
    const t = raw || {};
    const typeRaw = String(t.type || t.taskType || 'MEETING').toUpperCase().replace(/[ -]/g, '_');
    const priorityRaw = String(t.priority || 'MITTEL').toUpperCase();
    return {
      ...t,
      id: String(t.id ?? t.taskId ?? ''),
      projectId: String(t.projectId ?? ''),
      type: ['LONG_TODO', 'LONG_TASK', 'LANGES_TODO'].includes(typeRaw) ? 'LANGES_TODO' : typeRaw,
      title: t.title || t.name || '',
      description: t.description || '',
      start: t.start || t.startAt || t.startDate || null,
      end: t.end || t.endAt || t.dueAt || t.dueDate || null,
      priority: ({ HIGH: 'HOCH', MEDIUM: 'MITTEL', LOW: 'NIEDRIG' })[priorityRaw] || priorityRaw,
      allParticipants: !!t.allParticipants,
      participantIds: t.participantIds || (Array.isArray(t.participants) ? t.participants.map(x => typeof x === 'string' ? x : String(x.userId ?? x.id ?? '')) : []),
      done: !!(t.done ?? t.completed),
      doneBy: t.doneBy || null,
      doneAt: t.doneAt || null,
      subtasks: (Array.isArray(t.subtasks) ? t.subtasks : []).map(sub => ({
        ...sub,
        id: String(sub.id ?? sub.subtaskId ?? ''),
        title: sub.title || sub.name || '',
        description: sub.description || '',
        assigneeId: sub.assigneeId || sub.userId || sub.assignedUserId || null,
        done: !!(sub.done ?? sub.completed),
        schedule: sub.schedule || null
      }))
    };
  }

  /* ==================================================================
     OEFFENTLICHE API - diese Funktionen nutzen die Seiten
     ================================================================== */
  const api = {
    ApiError,

    /* ---------- Benutzer / Sitzung ---------- */

    // BACKEND: GET /users/me -> { id, name, email }
    async getCurrentUser() {
      if (USE_MOCK) return mock.getCurrentUser();
      const claims = tokenClaims();
      try {
        const raw = await request('GET', '/users/me');
        const me = raw.user || raw.data || raw;
        cachedUser = {
          ...me,
          id: String(me.id ?? me.userId ?? claims.sub ?? claims.userId ?? ''),
          name: me.name || me.displayName || claims.name || claims.preferred_username || claims.email || me.email || 'Benutzer',
          email: me.email || claims.email || ''
        };
        return cachedUser;
      } catch (error) {
        // BACKEND: Wenn kein GET /users/me existiert, muss das Login-JWT mindestens sub/userId enthalten.
        if (error.status === 404 && (claims.sub || claims.userId || claims.email)) {
          cachedUser = {
            id: String(claims.sub || claims.userId || claims.email),
            name: claims.name || claims.preferred_username || claims.email || 'Benutzer',
            email: claims.email || ''
          };
          return cachedUser;
        }
        throw error;
      }
    },

    // BACKEND: DELETE /auth (Abmelden, siehe API-Design) -> 204
    async logout() {
      try {
        await request('DELETE', '/auth');
      } finally {
        try { window.sessionStorage.removeItem(TOKEN_KEY); } catch (error) { /* Storage kann gesperrt sein */ }
      }
    },

    // BACKEND: GET /invitations?status=AUSSTEHEND -> [...]  (nur Anzahl fuer Badge im Menue)
    async getOpenInvitationCount() {
      if (USE_MOCK) return mock.getOpenInvitationCount();
      return 0;
    },

    // KI-Log Nr. 40 | BACKEND: GET /invitations/overview -> { received:[...], sent:[...] }
    async getInvitationOverview() {
      if (USE_MOCK) return mock.getInvitationOverview();
      return { received: [], sent: [] };
    },

    // BACKEND: POST /invitations/{invitationId}/accept -> 200 Projektmitgliedschaft
    acceptInvitation(invitationId) {
      if (USE_MOCK) return mock.acceptInvitation(invitationId);
      return request('POST', '/invitations/' + encodeURIComponent(invitationId) + '/accept');
    },

    // BACKEND: DELETE /invitations/{invitationId} -> 204 (ignorieren)
    ignoreInvitation(invitationId) {
      if (USE_MOCK) return mock.ignoreInvitation(invitationId);
      return request('DELETE', '/invitations/' + encodeURIComponent(invitationId));
    },

    /* ---------- Projekte ---------- */

    // BACKEND: GET /projects
    // -> [{ id, title, status, myRole, memberCount, updatedAt:'YYYY-MM-DD' }]
    async getProjects() {
      if (USE_MOCK) return mock.getProjects();
      const raw = await request('GET', '/projects');
      const data = raw && (raw.data || raw);
      const list = Array.isArray(data) ? data : (data.projects || data.items || []);
      return list.map(normalizeProject);
    },

    // BACKEND: POST /projects  Body { title, description } -> 201 { id }
    // Ersteller wird im Backend automatisch PROJEKTLEITUNG.
    async createProject(data) {
      if (USE_MOCK) return mock.createProject(data);
      const raw = await request('POST', '/projects', {
        name: data.name || data.title,
        description: data.description || ''
      });
      const result = (raw && (raw.project || raw.data)) || raw || {};
      return { ...result, id: String(result.id ?? result.projectId ?? raw.projectId ?? '') };
    },

    // BACKEND: GET /projects/{projectId}
    // -> { id, title, description, status, updatedAt, myRole,
    //      members:[{ userId, name, email, role }] }
    async getProject(projectId) {
      if (USE_MOCK) return mock.getProject(projectId);
      const raw = await request('GET', '/projects/' + encodeURIComponent(projectId));
      return normalizeProject(raw);
    },

    // BACKEND: PATCH /projects/{projectId}  Body { title, description, status } -> 200 Projekt
    async updateProject(projectId, data) {
      if (USE_MOCK) return mock.updateProject(projectId, data);
      const raw = await request('PUT', '/projects/' + encodeURIComponent(projectId), { update: data });
      return normalizeProject(raw);
    },

    /* ---------- Mitglieder & Einladungen ---------- */

    // BACKEND: PATCH /projects/{projectId}/members/{userId}  Body { role } -> 200
    // 409, wenn dadurch keine Projektleitung mehr uebrig waere
    updateMemberRole(projectId, userId, role) {
      if (USE_MOCK) return mock.updateMemberRole(projectId, userId, role);
      // BACKEND: Mia-Projekt nutzt PL/member als Rollenwerte; bei abweichendem Enum nur diese Abbildung ändern.
      const apiRole = role === 'PROJEKTLEITUNG' ? 'leader' : 'member';
      return request('PUT', '/projects/' + encodeURIComponent(projectId) + '/members/' + encodeURIComponent(userId), { role: apiRole });
    },

    // BACKEND: DELETE /projects/{projectId}/members/{userId} -> 204
    removeMember(projectId, userId) {
      if (USE_MOCK) return mock.removeMember(projectId, userId);
      return request('DELETE', '/projects/' + encodeURIComponent(projectId) + '/members/' + encodeURIComponent(userId));
    },

    // BACKEND: GET /projects/{projectId}/invitations?status=AUSSTEHEND
    // -> [{ id, email, role, sentAt:'YYYY-MM-DD', status }]
    getInvitations(projectId) {
      if (USE_MOCK) return mock.getInvitations(projectId);
      return Promise.resolve([]);
    },

    // KI-Log Nr. 43: Einladung mit eigenem JSON-Vertrag.
    // BACKEND: POST http://localhost:8080/projects/{projectId}/invitations
    // JSON-Body { email, role } -> 201 Einladung; Token nur im Header.
    // 409, wenn die Person schon Mitglied oder bereits eingeladen ist
    inviteMember(projectId, data) {
      const payload = {
        email: String(data.email || '').trim().toLowerCase(),
        role: data.role === 'PROJEKTLEITUNG' ? 'leader' : 'member'
      };
      if (USE_MOCK) return mock.inviteMember(projectId, data);
      return request('POST', '/projects/' + encodeURIComponent(projectId) + '/members', payload);
    },

    // BACKEND: DELETE /projects/{projectId}/invitations/{invitationId} -> 204 (Zurueckziehen)
    withdrawInvitation(projectId, invitationId) {
      if (USE_MOCK) return mock.withdrawInvitation(projectId, invitationId);
      return Promise.reject(new ApiError(501, 'Ausstehende Einladungen werden vom Backend nicht unterstützt.'));
    },

    /* ---------- Tasks (Meeting / Langes To-Do) ---------- */

    // BACKEND: GET /projects/{projectId}/tasks
    // -> [{ id, projectId, type, title, description, start, end, priority,
    //       allParticipants, participantIds:[], done, doneBy, doneAt,
    //       subtasks:[{ id, title, description, assigneeId|null, done }] }]
    async getTasks(projectId) {
      if (USE_MOCK) return mock.getTasks(projectId);
      const raw = await request('GET', '/projects/' + encodeURIComponent(projectId) + '/tasks');
      const data = raw && (raw.data || raw);
      const list = Array.isArray(data) ? data : (data.tasks || data.items || []);
      return list.map(normalizeTask);
    },

    // KI-Log Nr. 43: Meeting und langes To-do verwenden getrennte JSON-Payloads.
    // BACKEND: POST http://localhost:8080/projects/{projectId}/tasks
    // Meeting: { type, title, description, start, end, priority,
    //            allParticipants, participantIds }
    // Langes To-do: { type, title, description, start, end, priority,
    //                 allParticipants, participantIds, subtasks }
    async createTask(projectId, data) {
      if (USE_MOCK) return mock.createTask(projectId, data);
      const raw = await request('POST', '/projects/' + encodeURIComponent(projectId) + '/tasks', data);
      return normalizeTask((raw && raw.task) || raw);
    },

    // KI-Log Nr. 43: Meeting-Payload ohne Teilaufgaben.
    createMeeting(projectId, data) {
      return api.createTask(projectId, {
        type: 'MEETING',
        title: data.title,
        description: data.description,
        start: data.start,
        end: data.end,
        priority: data.priority,
        allParticipants: data.allParticipants,
        participantIds: data.participantIds
      });
    },

    // KI-Log Nr. 43: Langes-To-do-Payload mit Teilaufgaben und optionalem Start.
    createLongTodo(projectId, data) {
      return api.createTask(projectId, {
        type: 'LANGES_TODO',
        title: data.title,
        description: data.description,
        start: data.start || null,
        end: data.end,
        priority: data.priority,
        allParticipants: data.allParticipants,
        participantIds: data.participantIds,
        subtasks: data.subtasks
      });
    },

    // BACKEND: PUT /tasks/{taskId}  Body = kompletter Task inkl. subtasks -> 200 Task
    // Neue Teilaufgaben haben id = null, das Backend vergibt die IDs.
    async updateTask(projectId, taskId, data) {
      if (USE_MOCK) return mock.updateTask(taskId, data);
      const raw = await request('PUT', '/projects/' + encodeURIComponent(projectId) + '/tasks/' + encodeURIComponent(taskId), { update: data });
      return normalizeTask((raw && raw.task) || raw);
    },

    // BACKEND: DELETE /projects/{projectId}/tasks/{taskId} -> 200
    deleteTask(projectId, taskId) {
      if (USE_MOCK) return mock.deleteTask(taskId);
      return request('DELETE', '/projects/' + encodeURIComponent(projectId) + '/tasks/' + encodeURIComponent(taskId));
    },

    // BACKEND: PUT /projects/{projectId}/tasks/{taskId}/status -> 200
    async setTaskDone(projectId, taskId, done) {
      if (USE_MOCK) return mock.setTaskDone(taskId, done);
      const raw = await request('PUT', '/projects/' + encodeURIComponent(projectId) + '/tasks/' + encodeURIComponent(taskId) + '/status', { status: done ? 'done' : 'open' });
      return normalizeTask((raw && raw.task) || raw);
    },

    /* ---------- Teilaufgaben ---------- */

    // BACKEND: POST /tasks/{taskId}/subtasks/{subtaskId}/claim -> 200 Teilaufgabe
    // 409 Body { assigneeName }, wenn jemand anderes schneller war (Wireframe "Nicht uebernommen")
    claimSubtask(taskId, subtaskId) {
      if (USE_MOCK) return mock.claimSubtask(taskId, subtaskId);
      return request('POST', '/tasks/' + encodeURIComponent(taskId) + '/subtasks/' + encodeURIComponent(subtaskId) + '/claim');
    },

    // BACKEND: PATCH /tasks/{taskId}/subtasks/{subtaskId}  Body { done } -> 200 Task
    // Backend setzt das lange To-Do automatisch auf erledigt, wenn alle Teilaufgaben erledigt sind.
    async setSubtaskDone(taskId, subtaskId, done) {
      if (USE_MOCK) return mock.setSubtaskDone(taskId, subtaskId, done);
      const raw = await request('PATCH', '/tasks/' + encodeURIComponent(taskId) + '/subtasks/' + encodeURIComponent(subtaskId), { done });
      return raw && raw.task ? normalizeTask(raw.task) : (raw || { id: subtaskId, done });
    },

    // KI-Log Nr. 39 | BACKEND: POST /tasks/{taskId}/subtasks/{subtaskId}/schedule  Body { date, from, to } -> 200 Teilaufgabe
    scheduleSubtask(taskId, subtaskId, slot) {
      if (USE_MOCK) return mock.scheduleSubtask(taskId, subtaskId, slot);
      return request('POST', '/tasks/' + encodeURIComponent(taskId) + '/subtasks/' + encodeURIComponent(subtaskId) + '/schedule', slot);
    },

    // KI-Log Nr. 39 | BACKEND: GET /availability/free-slots?userId=...&until=... -> [{ date, from, to }]
    getFreeSlots(userId, until) {
      if (USE_MOCK) return mock.getFreeSlots(userId, until);
      return request('GET', '/availability/free-slots?userId=' + encodeURIComponent(userId) + '&until=' + encodeURIComponent(until));
    },

    /* ---------- Verfuegbarkeit (Kalender) ---------- */

    // BACKEND: POST /availability  Body { userIds, start, end }
    // -> [{ userId, name, free, busyFrom, busyTo }]  (Daten aus dem externen Kalender)
    checkAvailability(data) {
      if (USE_MOCK) return mock.checkAvailability(data);
      return request('POST', '/availability', data);
    },

    // Nur fuer Tests: Testdaten zuruecksetzen
    resetMockData() {
      sessionStorage.removeItem(MOCK_KEY);
    }
  };

  /* ==================================================================
     MOCK - Testdaten aus den Wireframes
     BACKEND: Dieser ganze Block wird nicht mehr benutzt, sobald USE_MOCK = false ist.
     Die Regeln hier (Berechtigungen, 409-Faelle) zeigen, was das Backend pruefen sollte.
     ================================================================== */
  const MOCK_KEY = 'planb-mock-projects-v2';
  const MOCK_DELAY_MS = 120;

  function seed() {
    const sub = (id, title, assigneeId, done, description) => ({ id, title, assigneeId, done, description: description || '' });
    return {
      meId: 'u1',
      nextId: 1000,
      openInvitationCount: 2,
      incomingInvitations: [
        { id: 'inc1', projectId: '4', inviterId: 'u4', role: 'TEAMMITGLIED', sentAt: '2026-10-14' },
        { id: 'inc2', projectId: '5', inviterId: 'u3', role: 'PROJEKTLEITUNG', sentAt: '2026-10-13' }
      ],
      sentHistory: [
        { id: 'sent1', email: 'hicham@test.de', name: 'Hicham W.', projectId: '1', role: 'TEAMMITGLIED', sentAt: '2026-10-01', status: 'ANGENOMMEN' },
        { id: 'sent2', email: 'johannes@test.de', name: 'Johannes B.', projectId: '1', role: 'TEAMMITGLIED', sentAt: '2026-10-01', status: 'ANGENOMMEN' }
      ],
      users: [
        { id: 'u1', name: 'Mia M.', email: 'mia@test.de' },
        { id: 'u2', name: 'Hicham W.', email: 'hicham@test.de' },
        { id: 'u3', name: 'Johannes B.', email: 'johannes@test.de' },
        { id: 'u4', name: 'Christian S.', email: 'christian@test.de' },
        { id: 'u5', name: 'Lena K.', email: 'lena@test.de' }
      ],
      busy: [
        { userId: 'u2', start: '2026-10-15T12:00', end: '2026-10-15T13:30' },
        { userId: 'u1', start: '2026-10-16T08:00', end: '2026-10-16T10:00' },
        { userId: 'u1', start: '2026-10-16T10:00', end: '2026-10-16T12:00' }
      ],
      projects: [
        {
          id: '1', title: 'Projekt 1', status: 'AKTIV', updatedAt: '2026-10-14',
          description: 'Prototyp des To-Do-Planers „Plan B“ für die Fallstudie.',
          members: [
            { userId: 'u1', role: 'PROJEKTLEITUNG' },
            { userId: 'u2', role: 'TEAMMITGLIED' },
            { userId: 'u3', role: 'TEAMMITGLIED' }
          ],
          invitations: [{ id: 'i1', email: 'lena@test.de', role: 'TEAMMITGLIED', sentAt: '2026-10-14', status: 'AUSSTEHEND' }]
        },
        {
          id: '2', title: 'Projekt 2', status: 'AKTIV', updatedAt: '2026-10-13',
          description: 'Kalenderanbindung und Synchronisation der privaten Termine umsetzen.',
          members: [
            { userId: 'u2', role: 'PROJEKTLEITUNG' },
            { userId: 'u1', role: 'TEAMMITGLIED' },
            { userId: 'u3', role: 'TEAMMITGLIED' },
            { userId: 'u4', role: 'TEAMMITGLIED' }
          ],
          invitations: []
        },
        {
          id: '3', title: 'Projekt 3', status: 'ABGESCHLOSSEN', updatedAt: '2026-09-30',
          description: 'Abgeschlossenes Vorprojekt.',
          members: [
            { userId: 'u3', role: 'PROJEKTLEITUNG' },
            { userId: 'u1', role: 'TEAMMITGLIED' }
          ],
          invitations: []
        },
        { id: '4', title: 'Projekt 4 – Messestand planen', status: 'AKTIV', updatedAt: '2026-10-14', description: 'Messestand planen.', members: [{ userId: 'u4', role: 'PROJEKTLEITUNG' }], invitations: [] },
        { id: '5', title: 'Projekt 5 – Semesterplanung', status: 'AKTIV', updatedAt: '2026-10-13', description: 'Semesterplanung.', members: [{ userId: 'u3', role: 'PROJEKTLEITUNG' }], invitations: [] }
      ],
      tasks: [
        // ----- Projekt 1 -----
        { id: 't1', projectId: '1', type: 'MEETING', title: 'Sprint Review', description: 'Ergebnisse des Sprints vorstellen.',
          start: '2026-10-15T13:00', end: '2026-10-15T15:00', priority: 'HOCH', allParticipants: false, participantIds: ['u1', 'u2'],
          done: false, doneBy: null, doneAt: null, subtasks: [] },
        { id: 't2', projectId: '1', type: 'LANGES_TODO', title: 'Wireframes überarbeiten',
          description: 'Skizzen in Graustufen-Wireframes übertragen und mit den Anforderungen abgleichen.',
          start: '2026-10-16T09:00', end: '2026-10-19T17:00', priority: 'HOCH', allParticipants: false, participantIds: ['u1', 'u3'],
          done: false, doneBy: null, doneAt: null,
          subtasks: [
            sub('s1', 'Startseite zeichnen', 'u1', false, 'Startseite mit Projekten und To-Dos skizzieren.'),
            sub('s2', 'Pop-ups ergänzen', 'u1', false, 'Dialoge für Anlegen, Bearbeiten und Einladen ergänzen.'),
            sub('s3', 'Login-Seite entwerfen', 'u3', true, 'Login- und Registrierungsseite entwerfen.')
          ] },
        { id: 't3', projectId: '1', type: 'LANGES_TODO', title: 'Datenbankschema', description: 'Tabellen und Beziehungen für Projekte und Tasks festlegen.',
          start: '2026-10-19T09:00', end: '2026-10-21T17:00', priority: 'MITTEL', allParticipants: false, participantIds: ['u2', 'u3'],
          done: false, doneBy: null, doneAt: null,
          subtasks: [
            sub('s4', 'Entitäten festlegen', 'u2', false),
            sub('s5', 'Beziehungen modellieren', 'u3', false),
            sub('s6', 'Schema dokumentieren', null, false)
          ] },
        { id: 't4', projectId: '1', type: 'LANGES_TODO', title: 'Testkonzept', description: 'Testfälle und Testdaten für den Prototyp planen.',
          start: '2026-10-22T09:00', end: '2026-10-23T16:00', priority: 'MITTEL', allParticipants: false, participantIds: ['u3'],
          done: false, doneBy: null, doneAt: null,
          subtasks: [sub('s7', 'Testfälle ableiten', 'u3', false), sub('s8', 'Testdaten definieren', null, false)] },
        { id: 't5', projectId: '1', type: 'MEETING', title: 'Daily Stand-up', description: '',
          start: '2026-10-20T09:00', end: '2026-10-20T09:15', priority: 'NIEDRIG', allParticipants: true, participantIds: [],
          done: false, doneBy: null, doneAt: null, subtasks: [] },
        { id: 't6', projectId: '1', type: 'MEETING', title: 'Zwischenpräsentation', description: '',
          start: '2026-11-05T10:00', end: '2026-11-05T11:00', priority: 'HOCH', allParticipants: true, participantIds: [],
          done: false, doneBy: null, doneAt: null, subtasks: [] },
        { id: 't7', projectId: '1', type: 'MEETING', title: 'Backlog priorisieren', description: '',
          start: '2026-10-05T09:00', end: '2026-10-05T12:00', priority: 'HOCH', allParticipants: false, participantIds: ['u1'],
          done: true, doneBy: 'u1', doneAt: '2026-10-05', subtasks: [] },

        // ----- Projekt 2 -----
        { id: 't10', projectId: '2', type: 'LANGES_TODO', title: 'API-Endpunkte Tasks', description: 'REST-Endpunkte für Tasks und Teilaufgaben umsetzen.',
          start: '2026-10-19T09:00', end: '2026-10-21T17:00', priority: 'MITTEL', allParticipants: false, participantIds: ['u1', 'u2'],
          done: false, doneBy: null, doneAt: null,
          subtasks: [sub('s10', 'Endpunkte definieren', 'u2', false), sub('s11', 'Fehlercodes dokumentieren', 'u1', false)] },
        { id: 't11', projectId: '2', type: 'MEETING', title: 'Daily Stand-up', description: '',
          start: '2026-10-20T09:00', end: '2026-10-20T09:15', priority: 'NIEDRIG', allParticipants: true, participantIds: [],
          done: false, doneBy: null, doneAt: null, subtasks: [] },
        { id: 't12', projectId: '2', type: 'LANGES_TODO', title: 'Kalender-Sync testen',
          description: 'Synchronisation mit simulierten Kalenderdaten prüfen, inkl. Ausfall des Kalenderdienstes.',
          start: '2026-10-21T09:00', end: '2026-10-23T17:00', priority: 'HOCH', allParticipants: false, participantIds: ['u1', 'u3'],
          done: false, doneBy: null, doneAt: null,
          subtasks: [
            sub('s12', 'Testdaten anlegen', 'u1', true, 'Simulierte Kalendertermine für die Testfälle anlegen.'),
            sub('s13', 'Ausfall des Kalenderdienstes simulieren', null, false,
              'Kalender-API mit simulierten Daten abschalten und prüfen, ob die Aufgabenverwaltung mit Hinweis und letzter Synchronisation weiter nutzbar bleibt.'),
            sub('s14', 'Blocker-Anzeige prüfen', 'u3', false, 'Prüfen, ob private Termine als anonyme Blocker angezeigt werden.')
          ] },
        { id: 't13', projectId: '2', type: 'LANGES_TODO', title: 'Datenschutz-Check Blocker', description: 'Anzeige privater Termine datenschutzkonform gestalten.',
          start: '2026-10-22T10:00', end: '2026-10-23T16:00', priority: 'MITTEL', allParticipants: false, participantIds: ['u3', 'u4'],
          done: false, doneBy: null, doneAt: null,
          subtasks: [sub('s15', 'Blocker anonymisieren', 'u4', false), sub('s16', 'Datenschutzhinweis formulieren', null, false)] },
        { id: 't14', projectId: '2', type: 'LANGES_TODO', title: 'Entwicklungsumgebung einrichten', description: '',
          start: '2026-10-06T09:00', end: '2026-10-07T17:00', priority: 'MITTEL', allParticipants: false, participantIds: ['u1'],
          done: true, doneBy: 'u1', doneAt: '2026-10-07',
          subtasks: [sub('s17', 'IDE und Git einrichten', 'u1', true)] }
      ]
    };
  }

  const mock = (function () {
    function load() {
      const raw = sessionStorage.getItem(MOCK_KEY);
      if (raw) {
        try { return JSON.parse(raw); } catch (e) { /* neu anlegen */ }
      }
      const db = seed();
      save(db);
      return db;
    }
    function save(db) { sessionStorage.setItem(MOCK_KEY, JSON.stringify(db)); }
    function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
    function delay(value) { return new Promise(resolve => setTimeout(() => resolve(clone(value)), MOCK_DELAY_MS)); }
    function fail(status, message, data) {
      return new Promise((resolve, reject) => setTimeout(() => reject(new ApiError(status, message || DEFAULT_MESSAGES[status], data)), MOCK_DELAY_MS));
    }
    function today() {
      const d = new Date();
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    function newId(db, prefix) { db.nextId += 1; return prefix + db.nextId; }
    function user(db, id) { return db.users.find(u => u.id === id) || null; }
    function project(db, id) { return db.projects.find(p => p.id === String(id)) || null; }
    function myRole(db, p) {
      const m = p.members.find(x => x.userId === db.meId);
      return m ? m.role : null;
    }
    function isLead(db, p) { return myRole(db, p) === 'PROJEKTLEITUNG'; }
    function isParticipant(db, task) {
      if (task.allParticipants) {
        const p = project(db, task.projectId);
        return !!p && p.members.some(m => m.userId === db.meId);
      }
      return task.participantIds.includes(db.meId);
    }
    function touch(db, projectId) { const p = project(db, projectId); if (p) p.updatedAt = today(); }
    function validEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }

    function validateTask(data) {
      if (!data.title || !data.title.trim()) return 'Bitte einen Titel eingeben.';
      if (!['MEETING', 'LANGES_TODO'].includes(data.type)) return 'Bitte einen Typ wählen.';
      if (!['HOCH', 'MITTEL', 'NIEDRIG'].includes(data.priority)) return 'Bitte eine Priorität wählen.';
      if (!data.end) return 'Bitte Ende / Frist angeben.';
      if (data.type === 'MEETING' && !data.start) return 'Bitte einen Start angeben.';
      if (data.start && data.end <= data.start) return 'Ende / Frist muss nach dem Start liegen.';
      return null;
    }
    function normalizeSubtasks(db, list) {
      return (list || []).map(s => ({
        id: s.id || newId(db, 's'),
        title: String(s.title || '').trim(),
        description: String(s.description || ''),
        assigneeId: s.assigneeId || null,
        done: !!s.done
      })).filter(s => s.title);
    }
    function refreshAutoDone(db, task) {
      if (task.type !== 'LANGES_TODO') return;
      const allDone = task.subtasks.length > 0 && task.subtasks.every(s => s.done);
      if (allDone && !task.done) { task.done = true; task.doneBy = db.meId; task.doneAt = today(); }
      if (!allDone && task.done) { task.done = false; task.doneBy = null; task.doneAt = null; }
    }

    return {
      getCurrentUser() { const db = load(); return delay(user(db, db.meId)); },
      getOpenInvitationCount() { const db = load(); return delay(db.incomingInvitations.length); },
      getInvitationOverview() {
        const db = load();
        const received = db.incomingInvitations.map(inv => {
          const p = project(db, inv.projectId);
          return { ...inv, projectTitle: p ? p.title : 'Projekt', inviterName: user(db, inv.inviterId)?.name || 'Unbekannt' };
        });
        const sent = db.sentHistory.slice();
        db.projects.forEach(p => {
          if (!isLead(db, p)) return;
          p.invitations.forEach(inv => sent.push({
            ...inv,
            projectId: p.id,
            projectTitle: p.title,
            name: (db.users.find(u => u.email === inv.email) || {}).name || '',
            status: inv.status
          }));
        });
        sent.forEach(inv => { if (!inv.projectTitle) inv.projectTitle = project(db, inv.projectId)?.title || 'Projekt'; });
        return delay({ received, sent });
      },
      acceptInvitation(invitationId) {
        const db = load();
        const index = db.incomingInvitations.findIndex(i => i.id === invitationId);
        if (index < 0) return fail(404, 'Einladung nicht gefunden.');
        const inv = db.incomingInvitations[index];
        const p = project(db, inv.projectId);
        if (!p) return fail(404, 'Projekt nicht gefunden.');
        if (!p.members.some(m => m.userId === db.meId)) p.members.push({ userId: db.meId, role: inv.role });
        p.updatedAt = today();
        db.incomingInvitations.splice(index, 1);
        save(db);
        return delay({ projectId: p.id, role: inv.role });
      },
      ignoreInvitation(invitationId) {
        const db = load();
        const before = db.incomingInvitations.length;
        db.incomingInvitations = db.incomingInvitations.filter(i => i.id !== invitationId);
        if (before === db.incomingInvitations.length) return fail(404, 'Einladung nicht gefunden.');
        save(db);
        return delay(null);
      },

      getProjects() {
        const db = load();
        const list = db.projects
          .filter(p => myRole(db, p))
          .map(p => ({ id: p.id, title: p.title, status: p.status, myRole: myRole(db, p), memberCount: p.members.length, updatedAt: p.updatedAt }));
        return delay(list);
      },

      createProject(data) {
        const db = load();
        const title = String(data.title || '').trim();
        if (!title) return fail(400, 'Bitte einen Titel eingeben.');
        const id = String(db.nextId += 1);
        db.projects.push({ id, title, description: String(data.description || '').trim(), status: 'AKTIV', updatedAt: today(),
          members: [{ userId: db.meId, role: 'PROJEKTLEITUNG' }], invitations: [] });
        save(db);
        return delay({ id });
      },

      getProject(projectId) {
        const db = load();
        const p = project(db, projectId);
        if (!p) return fail(404, 'Dieses Projekt gibt es nicht.');
        if (!myRole(db, p)) return fail(403, 'Du bist kein Mitglied dieses Projekts.');
        return delay({
          id: p.id, title: p.title, description: p.description, status: p.status, updatedAt: p.updatedAt, myRole: myRole(db, p),
          members: p.members.map(m => { const u = user(db, m.userId); return { userId: m.userId, name: u.name, email: u.email, role: m.role }; })
        });
      },

      updateProject(projectId, data) {
        const db = load();
        const p = project(db, projectId);
        if (!p) return fail(404);
        if (!isLead(db, p)) return fail(403);
        const title = String(data.title || '').trim();
        if (!title) return fail(400, 'Bitte einen Titel eingeben.');
        p.title = title;
        p.description = String(data.description || '').trim();
        if (['AKTIV', 'ABGESCHLOSSEN'].includes(data.status)) p.status = data.status;
        p.updatedAt = today();
        save(db);
        return delay(p);
      },

      updateMemberRole(projectId, userId, role) {
        const db = load();
        const p = project(db, projectId);
        if (!p) return fail(404);
        if (!isLead(db, p)) return fail(403);
        const m = p.members.find(x => x.userId === userId);
        if (!m) return fail(404, 'Mitglied nicht gefunden.');
        const leads = p.members.filter(x => x.role === 'PROJEKTLEITUNG').length;
        if (m.role === 'PROJEKTLEITUNG' && role !== 'PROJEKTLEITUNG' && leads <= 1) {
          return fail(409, 'Ein Projekt braucht mindestens eine Projektleitung.');
        }
        m.role = role;
        touch(db, projectId);
        save(db);
        return delay(m);
      },

      removeMember(projectId, userId) {
        const db = load();
        const p = project(db, projectId);
        if (!p) return fail(404);
        if (!isLead(db, p)) return fail(403);
        const m = p.members.find(x => x.userId === userId);
        if (!m) return fail(404, 'Mitglied nicht gefunden.');
        const leads = p.members.filter(x => x.role === 'PROJEKTLEITUNG').length;
        if (m.role === 'PROJEKTLEITUNG' && leads <= 1) return fail(409, 'Die letzte Projektleitung kann nicht entfernt werden.');
        p.members = p.members.filter(x => x.userId !== userId);
        db.tasks.filter(t => t.projectId === p.id).forEach(t => {
          t.participantIds = t.participantIds.filter(id => id !== userId);
          t.subtasks.forEach(s => { if (s.assigneeId === userId) s.assigneeId = null; });
        });
        touch(db, projectId);
        save(db);
        return delay(null);
      },

      getInvitations(projectId) {
        const db = load();
        const p = project(db, projectId);
        if (!p) return fail(404);
        if (!isLead(db, p)) return fail(403);
        return delay(p.invitations.filter(i => i.status === 'AUSSTEHEND'));
      },

      inviteMember(projectId, data) {
        const db = load();
        const p = project(db, projectId);
        if (!p) return fail(404);
        if (!isLead(db, p)) return fail(403, 'Nur die Projektleitung kann einladen.');
        const email = String(data.email || '').trim().toLowerCase();
        if (!validEmail(email)) return fail(400, 'Bitte eine gültige E-Mail-Adresse eingeben.');
        const existing = db.users.find(u => u.email === email);
        if (existing && p.members.some(m => m.userId === existing.id)) return fail(409, 'Diese Person ist bereits Mitglied.');
        if (p.invitations.some(i => i.email === email && i.status === 'AUSSTEHEND')) return fail(409, 'Diese Person ist bereits eingeladen.');
        const invitation = { id: newId(db, 'i'), email, role: data.role === 'PROJEKTLEITUNG' ? 'PROJEKTLEITUNG' : 'TEAMMITGLIED', sentAt: today(), status: 'AUSSTEHEND' };
        p.invitations.push(invitation);
        save(db);
        return delay(invitation);
      },

      withdrawInvitation(projectId, invitationId) {
        const db = load();
        const p = project(db, projectId);
        if (!p) return fail(404);
        if (!isLead(db, p)) return fail(403);
        p.invitations = p.invitations.filter(i => i.id !== invitationId);
        save(db);
        return delay(null);
      },

      getTasks(projectId) {
        const db = load();
        const p = project(db, projectId);
        if (!p) return fail(404);
        if (!myRole(db, p)) return fail(403);
        return delay(db.tasks.filter(t => t.projectId === p.id));
      },

      createTask(projectId, data) {
        const db = load();
        const p = project(db, projectId);
        if (!p) return fail(404);
        if (!isLead(db, p)) return fail(403, 'Nur die Projektleitung kann Tasks anlegen.');
        const error = validateTask(data);
        if (error) return fail(400, error);
        const task = {
          id: newId(db, 't'), projectId: p.id, type: data.type, title: data.title.trim(), description: String(data.description || '').trim(),
          start: data.start || null, end: data.end, priority: data.priority,
          allParticipants: !!data.allParticipants, participantIds: data.allParticipants ? [] : (data.participantIds || []),
          done: false, doneBy: null, doneAt: null,
          subtasks: data.type === 'LANGES_TODO' ? normalizeSubtasks(db, data.subtasks) : []
        };
        db.tasks.push(task);
        touch(db, p.id);
        save(db);
        return delay(task);
      },

      updateTask(taskId, data) {
        const db = load();
        const task = db.tasks.find(t => t.id === taskId);
        if (!task) return fail(404, 'Task nicht gefunden.');
        const p = project(db, task.projectId);
        if (!isLead(db, p)) return fail(403);
        const error = validateTask(data);
        if (error) return fail(400, error);
        Object.assign(task, {
          type: data.type, title: data.title.trim(), description: String(data.description || '').trim(),
          start: data.start || null, end: data.end, priority: data.priority,
          allParticipants: !!data.allParticipants, participantIds: data.allParticipants ? [] : (data.participantIds || []),
          subtasks: data.type === 'LANGES_TODO' ? normalizeSubtasks(db, data.subtasks) : []
        });
        refreshAutoDone(db, task);
        touch(db, p.id);
        save(db);
        return delay(task);
      },

      deleteTask(taskId) {
        const db = load();
        const task = db.tasks.find(t => t.id === taskId);
        if (!task) return fail(404);
        if (!isLead(db, project(db, task.projectId))) return fail(403);
        db.tasks = db.tasks.filter(t => t.id !== taskId);
        touch(db, task.projectId);
        save(db);
        return delay(null);
      },

      setTaskDone(taskId, done) {
        const db = load();
        const task = db.tasks.find(t => t.id === taskId);
        if (!task) return fail(404);
        if (task.type !== 'MEETING') return fail(400, 'Lange To-Dos werden automatisch erledigt.');
        if (!isParticipant(db, task)) return fail(403, 'Nur Teilnehmer können das abhaken.');
        task.done = !!done;
        task.doneBy = done ? db.meId : null;
        task.doneAt = done ? today() : null;
        touch(db, task.projectId);
        save(db);
        return delay(task);
      },

      claimSubtask(taskId, subtaskId) {
        const db = load();
        const task = db.tasks.find(t => t.id === taskId);
        if (!task) return fail(404);
        const s = task.subtasks.find(x => x.id === subtaskId);
        if (!s) return fail(404);
        if (!isParticipant(db, task)) return fail(403, 'Nur Teilnehmer können Teilaufgaben übernehmen.');

        // Demo fuer den Konflikt-Screen: project.html?id=2&konflikt=1
        if (new URLSearchParams(window.location.search).get('konflikt') === '1' && !s.assigneeId) {
          s.assigneeId = 'u2';
          save(db);
        }
        if (s.assigneeId && s.assigneeId !== db.meId) {
          return fail(409, 'Teilaufgabe wurde bereits übernommen.', { assigneeName: user(db, s.assigneeId).name });
        }
        s.assigneeId = db.meId;
        touch(db, task.projectId);
        save(db);
        return delay(s);
      },

      setSubtaskDone(taskId, subtaskId, done) {
        const db = load();
        const task = db.tasks.find(t => t.id === taskId);
        if (!task) return fail(404);
        const s = task.subtasks.find(x => x.id === subtaskId);
        if (!s) return fail(404);
        if (s.assigneeId !== db.meId) return fail(403, 'Nur die zuständige Person kann das abhaken.');
        s.done = !!done;
        refreshAutoDone(db, task);
        touch(db, task.projectId);
        save(db);
        return delay(task);
      },

      scheduleSubtask(taskId, subtaskId, slot) {
        const db = load();
        const task = db.tasks.find(t => t.id === taskId);
        if (!task) return fail(404);
        const s = task.subtasks.find(x => x.id === subtaskId);
        if (!s) return fail(404);
        if (s.assigneeId !== db.meId) return fail(403, 'Nur die zuständige Person kann die Teilaufgabe einplanen.');
        if (!slot.date || !slot.from || !slot.to || slot.to <= slot.from) return fail(400, 'Bitte ein gültiges Zeitfenster auswählen.');
        const dueDate = (task.end || '').slice(0, 10);
        if (dueDate && slot.date > dueDate) return fail(400, 'Das Zeitfenster muss bis zur Frist liegen.');
        s.schedule = { date: slot.date, from: slot.from, to: slot.to };
        touch(db, task.projectId);
        save(db);
        return delay(s);
      },

      getFreeSlots(userId, until) {
        const slots = [
          { date: '2026-10-16', from: '15:00', to: '17:00' },
          { date: '2026-10-19', from: '08:00', to: '09:00' }
        ].filter(slot => !until || slot.date <= until);
        return delay(slots);
      },

      checkAvailability(data) {
        const db = load();
        const result = (data.userIds || []).map(userId => {
          const conflict = db.busy.find(b => b.userId === userId && b.start < data.end && b.end > data.start);
          return {
            userId,
            name: (user(db, userId) || {}).name || userId,
            free: !conflict,
            busyFrom: conflict ? conflict.start : null,
            busyTo: conflict ? conflict.end : null
          };
        });
        return delay(result);
      }
    };
  })();

  window.PlanBApi = api;
})();
