const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = readFileSync(path.join(__dirname, '../Projekte/JS/api.js'), 'utf8');

function setup(handler = () => ({ body: {} }), token = 'test-jwt') {
  const calls = [];
  const storage = new Map(token ? [['token', token]] : []);
  const window = {
    sessionStorage: {
      getItem: key => storage.get(key) ?? null,
      removeItem: key => storage.delete(key),
      setItem: (key, value) => storage.set(key, value)
    },
    location: { href: '', search: '' },
    atob: value => Buffer.from(value, 'base64').toString('binary'),
    setTimeout
  };
  vm.runInNewContext(source, {
    window, URLSearchParams, console, setTimeout,
    fetch: async (url, options) => {
      calls.push({ url, ...options, json: options.body ? JSON.parse(options.body) : undefined });
      const { status = 200, body = {} } = await handler(url, options);
      return { status, ok: status >= 200 && status < 300,
        headers: { get: () => 'application/json' }, text: async () => JSON.stringify(body), json: async () => body };
    }
  });
  return { api: window.PlanBApi, window, calls, storage };
}

test('addMember sends only email and API role, JWT only as Bearer header', async () => {
  const { api, calls } = setup();
  await api.addMember(67, { email: ' TEST@example.test ', role: 'PROJEKTLEITUNG', token: 'must-not-leak' });
  assert.equal(calls[0].url, 'https://plan-b-api-6486e78ed17c.herokuapp.com/projects/67/members');
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].headers.Authorization, 'Bearer test-jwt');
  assert.deepEqual(calls[0].json, { email: 'test@example.test', role: 'leader' });
});

test('normal member addition uses member role', async () => {
  const { api, calls } = setup();
  await api.addMember(67, { email: 'member@example.test', role: 'TEAMMITGLIED' });
  assert.deepEqual(calls[0].json, { email: 'member@example.test', role: 'member' });
});

test('project details fetch separate members and normalize PROJECT_LEADER and names', async () => {
  const { api, calls } = setup(url => ({ body: url.endsWith('/members')
    ? [{ userId: 4, firstName: 'Ada', lastName: 'Test', email: 'ada@example.test', role: 'PROJECT_LEADER' }]
    : { projectId: 67, name: 'Plan B', status: 'ACTIVE', role: 'PROJECT_LEADER' } }));
  const project = await api.getProject(67);
  assert.equal(calls.length, 2);
  assert.equal(project.id, '67');
  assert.equal(project.myRole, 'PROJEKTLEITUNG');
  assert.equal(project.members[0].name, 'Ada Test');
  assert.equal(project.members[0].userId, '4');
  assert.equal(project.members[0].role, 'PROJEKTLEITUNG');
});

test('project list does not invent member counts and uses backend role', async () => {
  const { api } = setup(() => ({ body: [{ projectId: 67, name: 'Plan B', status: 'ACTIVE', role: 'MEMBER' }] }));
  const projects = await api.getProjects();
  assert.equal(projects[0].myRole, 'TEAMMITGLIED');
  assert.equal(projects[0].memberCount, null);
});

test('all legacy invitation helpers avoid any HTTP request', async () => {
  const { api, calls } = setup();
  assert.equal(await api.getOpenInvitationCount(), 0);
  await api.getInvitationOverview();
  await api.getInvitations(67);
  await assert.rejects(api.withdrawInvitation(67, 1), error => error.status === 501);
  await assert.rejects(api.acceptInvitation(1), error => error.status === 501);
  await assert.rejects(api.ignoreInvitation(1), error => error.status === 501);
  assert.equal(calls.length, 0);
});

test('no request expression or template URL contains an invitation path', () => {
  assert.doesNotMatch(source, /return request\([^;\n]*\/invitations/);
  assert.doesNotMatch(source, /fetch\([^;\n]*\/invitations/);
  assert.doesNotMatch(source, /\/projects\/[^;\n]*\/invitations/);
});

test('project update uses PUT and exact backend body without wrapper', async () => {
  const { api, calls } = setup();
  await api.updateProject(67, { title: 'Changed', description: 'Text', status: 'ABGESCHLOSSEN' });
  assert.equal(calls[0].method, 'PUT');
  assert.deepEqual(calls[0].json, { name: 'Changed', description: 'Text', status: 'COMPLETED' });
});

test('member role change and removal use only members paths', async () => {
  const { api, calls } = setup();
  await api.updateMemberRole(67, 4, 'PROJEKTLEITUNG');
  await api.removeMember(67, 4);
  assert.equal(calls[0].method, 'PUT');
  assert.deepEqual(calls[0].json, { role: 'leader' });
  assert.equal(calls[1].method, 'DELETE');
  assert.ok(calls.every(call => call.url.endsWith('/projects/67/members/4')));
});

test('task updates have no update wrapper and normalize numeric IDs', async () => {
  const task = { id: 't1', projectId: 67, type: 'LANGES_TODO', title: 'Test', priority: 'HIGH',
    participantIds: [4], subtasks: [{ id: 8, title: 'Sub', assigneeId: 4 }] };
  const { api, calls } = setup(() => ({ body: task }));
  const result = await api.updateTask(67, 't1', task);
  assert.equal(calls[0].method, 'PUT');
  assert.equal(calls[0].json.update, undefined);
  assert.equal(result.participantIds[0], '4');
  assert.equal(result.subtasks[0].assigneeId, '4');
  assert.equal(result.priority, 'HOCH');
});

test('401 clears token and redirects to real login path', async () => {
  const { api, window, storage } = setup(() => ({ status: 401, body: { message: 'invalid token' } }));
  await assert.rejects(api.getProjects(), error => error.status === 401);
  assert.equal(storage.has('token'), false);
  assert.equal(window.location.href, '../../Login/HTML/login.html');
});

test('missing token never makes a network request', async () => {
  const { api, calls, window } = setup(undefined, null);
  await assert.rejects(api.getProjects(), error => error.status === 401);
  assert.equal(calls.length, 0);
  assert.equal(window.location.href, '../../Login/HTML/login.html');
});

test('403 permission and 409 conflict are preserved, not converted to 401', async () => {
  for (const status of [403, 409]) {
    const { api, storage } = setup(() => ({ status, body: { message: 'expected error' } }));
    await assert.rejects(api.getProjects(), error => error.status === status);
    assert.equal(storage.has('token'), true);
  }
});

test('logout discards session even if backend fails', async () => {
  const { api, storage } = setup(() => ({ status: 500 }));
  await assert.rejects(api.logout());
  assert.equal(storage.has('token'), false);
});
