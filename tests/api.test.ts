import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';
import { once } from 'node:events';
import { api } from '../src/server/routes/api';
import { db } from '../src/server/data/database';
import { events } from '../src/server/events';
import type { TaskList, Section, Task, Category, ListDetail } from '../src/app/shared/models';
let server: Server;
let base: string;
const owned: string[] = [];
before(async () => {
  await db.$queryRaw`SELECT 1`;
  const app = express();
  app.use('/api', api);
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = 'http://127.0.0.1:' + (server.address() as { port: number }).port + '/api';
});
after(async () => {
  for (const id of owned) await db.taskList.deleteMany({ where: { id } });
  events.close();
  if (server) await new Promise<void>((r) => server.close(() => r()));
  await db.$disconnect();
});
async function req<T>(path: string, method = 'GET', body?: unknown, status = 200): Promise<T> {
  const response = await fetch(base + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const value = response.status === 204 ? null : await response.json();
  assert.equal(response.status, status, JSON.stringify(value));
  return value?.data as T;
}
async function createList(name = 'Test API') {
  const list = await req<TaskList>('/lists', 'POST', { name }, 201);
  owned.push(list.id);
  return list;
}
async function createSection(listId: string, title = 'Section test') {
  return req<Section>(`/lists/${listId}/sections`, 'POST', { title }, 201);
}
async function createTask(sectionId: string, title = 'Tâche test') {
  return req<Task>(`/sections/${sectionId}/tasks`, 'POST', { title }, 201);
}
test('CRUD complet, statut, priorité, catégorie, duplication et persistance', async () => {
  const l = await createList();
  const s = await createSection(l.id);
  let t = await createTask(s.id);
  assert.equal(t.status, 'TODO');
  assert.equal(t.priority, 'MEDIUM');
  assert.equal(t.completedAt, null);
  t = await req<Task>('/tasks/' + t.id, 'PATCH', {
    status: 'DONE',
    priority: 'CRITICAL',
    expectedUpdatedAt: t.updatedAt,
  });
  assert.ok(t.completedAt);
  assert.equal(t.priority, 'CRITICAL');
  t = await req<Task>('/tasks/' + t.id, 'PATCH', {
    status: 'IN_PROGRESS',
    expectedUpdatedAt: t.updatedAt,
  });
  assert.equal(t.completedAt, null);
  const c = await req<Category>(
    `/lists/${l.id}/categories`,
    'POST',
    { name: 'Backend', color: '#335577' },
    201,
  );
  t = await req<Task>('/tasks/' + t.id, 'PATCH', { categoryId: c.id });
  await req('/categories/' + c.id, 'DELETE', undefined, 204);
  const persisted = await req<Task>('/tasks/' + t.id);
  assert.equal(persisted.categoryId, null);
  assert.equal(persisted.priority, 'CRITICAL');
  const duplicate = await req<Task>('/tasks/' + t.id + '/duplicate', 'POST', {}, 201);
  assert.notEqual(duplicate.id, t.id);
  assert.equal(duplicate.status, 'TODO');
  const detail = await req<ListDetail>('/lists/' + l.id);
  assert.equal(detail.sections[0].tasks.length, 2);
  await req('/lists/' + l.id, 'PATCH', {
    name: 'Projet renommé',
    description: 'Description persistée',
    color: '#225544',
  });
  await req('/sections/' + s.id, 'PATCH', { title: 'Section renommée' });
  assert.equal((await req<ListDetail>('/lists/' + l.id)).sections[0].title, 'Section renommée');
});
test('relations : refus de catégorie ou de déplacement entre listes', async () => {
  const a = await createList('A');
  const b = await createList('B');
  const sa = await createSection(a.id);
  const sb = await createSection(b.id);
  const t = await createTask(sa.id);
  const c = await req<Category>(`/lists/${b.id}/categories`, 'POST', { name: 'Autre liste' }, 201);
  await req('/tasks/' + t.id, 'PATCH', { categoryId: c.id }, 400);
  await req('/tasks/' + t.id, 'PATCH', { sectionId: sb.id }, 400);
  await req('/tasks/reorder', 'PATCH', { taskId: t.id, sectionId: sb.id, position: 0 }, 400);
  await assert.rejects(db.task.update({ where: { id: t.id }, data: { categoryId: c.id } }));
});
test('suppression en cascade et suppression d’une section', async () => {
  const l = await createList();
  const s = await createSection(l.id);
  const t = await createTask(s.id);
  const c = await req<Category>(`/lists/${l.id}/categories`, 'POST', { name: 'Catégorie' }, 201);
  await req('/lists/' + l.id, 'DELETE', undefined, 204);
  assert.equal(await db.task.count({ where: { id: t.id } }), 0);
  assert.equal(await db.taskSection.count({ where: { id: s.id } }), 0);
  assert.equal(await db.category.count({ where: { id: c.id } }), 0);
  const l2 = await createList();
  const s2 = await createSection(l2.id);
  const t2 = await createTask(s2.id);
  await req('/sections/' + s2.id, 'DELETE', undefined, 204);
  assert.equal(await db.task.count({ where: { id: t2.id } }), 0);
});
test('déplacement transactionnel, positions persistées et ordre des sections', async () => {
  const l = await createList();
  const a = await createSection(l.id, 'A');
  const b = await createSection(l.id, 'B');
  const one = await createTask(a.id, '1');
  const two = await createTask(a.id, '2');
  const three = await createTask(b.id, '3');
  await req('/tasks/reorder', 'PATCH', { taskId: two.id, sectionId: b.id, position: 0 });
  let snapshot = await req<ListDetail>('/lists/' + l.id);
  assert.deepEqual(
    snapshot.sections[1].tasks.map((t) => t.id),
    [two.id, three.id],
  );
  assert.deepEqual(
    snapshot.sections[1].tasks.map((t) => t.position),
    [0, 1],
  );
  await req('/tasks/reorder', 'PATCH', { taskId: three.id, sectionId: b.id, position: 0 });
  await req('/sections/reorder', 'PATCH', { listId: l.id, ids: [b.id, a.id] });
  snapshot = await req<ListDetail>('/lists/' + l.id);
  assert.deepEqual(
    snapshot.sections.map((s) => s.id),
    [b.id, a.id],
  );
  assert.deepEqual(
    snapshot.sections[0].tasks.map((t) => t.id),
    [three.id, two.id],
  );
  assert.equal(snapshot.sections[1].tasks[0].id, one.id);
  await req('/sections/reorder', 'PATCH', { listId: l.id, ids: [a.id] }, 409);
});
test('concurrence : édition obsolète refusée et positions d’ajout distinctes', async () => {
  const l = await createList();
  const s = await createSection(l.id);
  const original = await createTask(s.id);
  const result = await Promise.all(
    ['Version A', 'Version B'].map((title) =>
      fetch(base + '/tasks/' + original.id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, expectedUpdatedAt: original.updatedAt }),
      }),
    ),
  );
  assert.deepEqual(result.map((r) => r.status).sort(), [200, 409]);
  await Promise.all(Array.from({ length: 10 }, (_, i) => createTask(s.id, 'Concurrent ' + i)));
  let snapshot = await req<ListDetail>('/lists/' + l.id);
  assert.deepEqual(
    snapshot.sections[0].tasks.map((t) => t.position),
    Array.from({ length: 11 }, (_, i) => i),
  );
  const tasks = snapshot.sections[0].tasks;
  await Promise.all(
    tasks
      .slice(0, 5)
      .map((t) => req('/tasks/reorder', 'PATCH', { taskId: t.id, sectionId: s.id, position: 8 })),
  );
  snapshot = await req<ListDetail>('/lists/' + l.id);
  assert.equal(new Set(snapshot.sections[0].tasks.map((t) => t.id)).size, 11);
  assert.deepEqual(
    snapshot.sections[0].tasks.map((t) => t.position),
    Array.from({ length: 11 }, (_, i) => i),
  );
});
test('validation stricte et protection des écritures cross-origin', async () => {
  await req('/lists', 'POST', { name: '  ' }, 400);
  await req('/lists', 'POST', { name: 'test', injected: true }, 400);
  await req('/lists/not-a-uuid', 'GET', undefined, 400);
  const res = await fetch(base + '/lists', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
    body: JSON.stringify({ name: 'Non' }),
  });
  assert.equal(res.status, 403);
  await req('/inconnu', 'GET', undefined, 404);
  await req('/health');
});
test('SSE : clients multiples, événements après COMMIT, reconnexion et heartbeat', async () => {
  const controllers = [new AbortController(), new AbortController()];
  const decoder = new TextDecoder();
  const responses = await Promise.all(
    controllers.map((c) => fetch(base + '/events', { signal: c.signal })),
  );
  const readers = responses.map((r) => r.body!.getReader());
  for (const reader of readers) {
    const value = decoder.decode((await reader.read()).value);
    assert.match(value, /event: ready/);
    assert.match(value, /retry: 2000/);
  }
  const l = await createList('Événement SSE');
  for (const reader of readers) {
    const value = decoder.decode((await reader.read()).value);
    assert.match(value, /event: change/);
    assert.match(value, new RegExp(l.id));
    assert.match(value, /id: /);
  }
  assert.ok(await db.taskList.findUnique({ where: { id: l.id } }));
  controllers.forEach((c) => c.abort());
  const reconnect = new AbortController();
  const response = await fetch(base + '/events', { signal: reconnect.signal });
  const reader = response.body!.getReader();
  assert.match(decoder.decode((await reader.read()).value), /event: ready/);
  const heartbeat = await reader.read();
  assert.match(decoder.decode(heartbeat.value), /: heartbeat/);
  reconnect.abort();
});

test('ordre des listes, renommage de catégorie, et positions après suppression', async () => {
  const a = await createList('Ordre A');
  const b = await createList('Ordre B');
  const original = await req<TaskList[]>('/lists');
  const ids = original.map((l) => l.id);
  const reversed = [...ids].reverse();
  await req('/lists/reorder', 'PATCH', { ids: reversed });
  assert.deepEqual(
    (await req<TaskList[]>('/lists')).map((l) => l.id),
    reversed,
  );
  await req('/lists/reorder', 'PATCH', { ids });
  const s = await createSection(a.id);
  const s2 = await createSection(a.id);
  await req('/sections/' + s.id, 'DELETE', undefined, 204);
  const s3 = await createSection(a.id);
  const detail = await req<ListDetail>('/lists/' + a.id);
  assert.deepEqual(
    detail.sections.map((s) => s.position),
    [0, 1],
  );
  assert.deepEqual(
    detail.sections.map((s) => s.id),
    [s2.id, s3.id],
  );
  const c = await req<Category>(`/lists/${b.id}/categories`, 'POST', { name: 'Avant' }, 201);
  await req('/categories/' + c.id, 'PATCH', { name: 'Après', color: '#112233' });
  assert.equal((await req<Category[]>(`/lists/${b.id}/categories`))[0].name, 'Après');
});

test('prise de notes : insertion ancrée, suppression annulable et restauration cohérente', async () => {
  const l = await createList('Notes au clavier');
  const s = await createSection(l.id);
  const first = await createTask(s.id, 'Première ligne');
  const last = await createTask(s.id, 'Dernière ligne');
  const middle = await req<Task>(
    `/sections/${s.id}/tasks`,
    'POST',
    { title: 'Ligne insérée', afterTaskId: first.id, description: 'Décision\nAction suivante' },
    201,
  );
  assert.deepEqual(
    (await req<ListDetail>('/lists/' + l.id)).sections[0].tasks.map((t) => t.id),
    [first.id, middle.id, last.id],
  );
  await req(
    `/sections/${s.id}/tasks`,
    'POST',
    { title: 'Incorrect', afterTaskId: first.id, beforeTaskId: last.id },
    400,
  );
  const c = await req<Category>(`/lists/${l.id}/categories`, 'POST', { name: 'Éphémère' }, 201);
  const updated = await req<Task>('/tasks/' + middle.id, 'PATCH', {
    categoryId: c.id,
    status: 'DONE',
  });
  const receipt = await req<{ token: string; task: Task }>(`/tasks/${middle.id}/trash`, 'POST', {
    expectedUpdatedAt: updated.updatedAt,
  });
  assert.equal(await db.task.count({ where: { id: middle.id } }), 0);
  await req('/categories/' + c.id, 'DELETE', undefined, 204);
  const restored = await req<Task>('/tasks/restore', 'POST', { token: receipt.token });
  assert.equal(restored.id, middle.id);
  assert.equal(restored.description, 'Décision\nAction suivante');
  assert.equal(restored.categoryId, null);
  assert.equal(restored.status, 'DONE');
  assert.ok(restored.completedAt);
  const snapshot = await req<ListDetail>('/lists/' + l.id);
  assert.deepEqual(
    snapshot.sections[0].tasks.map((t) => t.id),
    [first.id, middle.id, last.id],
  );
  assert.deepEqual(
    snapshot.sections[0].tasks.map((t) => t.position),
    [0, 1, 2],
  );
  await req('/tasks/restore', 'POST', { token: receipt.token }, 410);
  await req(
    `/tasks/${first.id}/trash`,
    'POST',
    { expectedUpdatedAt: '2000-01-01T00:00:00.000Z' },
    409,
  );
  const other = await createSection(l.id);
  const foreign = await createTask(other.id);
  await req(
    `/sections/${s.id}/tasks`,
    'POST',
    { title: 'Mauvaise section', afterTaskId: foreign.id },
    409,
  );
});

test('création de note idempotente après une réponse réseau perdue', async () => {
  const l = await createList('Idempotence note');
  const s = await createSection(l.id);
  const clientId = crypto.randomUUID();
  const one = await req<Task>(
    `/sections/${s.id}/tasks`,
    'POST',
    { title: 'Une seule fois', clientId },
    201,
  );
  const retry = await req<Task>(
    `/sections/${s.id}/tasks`,
    'POST',
    { title: 'Une seule fois', clientId },
    201,
  );
  assert.equal(one.id, retry.id);
  assert.equal((await req<ListDetail>('/lists/' + l.id)).sections[0].tasks.length, 1);
});

test('titres : niveau persisté, découpage transactionnel, conversion et idempotence', async () => {
  const l = await createList('Titres à la volée');
  const s = await createSection(l.id);
  const first = await createTask(s.id, 'Avant');
  const middle = await createTask(s.id, 'À convertir');
  const last = await createTask(s.id, 'Après');
  const id = crypto.randomUUID();
  const result = await req<{ sectionId: string; list: ListDetail }>(
    `/sections/${s.id}/headings`,
    'POST',
    {
      listId: l.id,
      clientId: id,
      sourceTaskId: middle.id,
      title: 'Décisions',
      level: 3,
      description: 'Contexte conservé\nDeuxième paragraphe',
    },
    201,
  );
  assert.equal(result.sectionId, id);
  assert.equal(result.list.sections[1].level, 3);
  assert.deepEqual(
    result.list.sections[0].tasks.map((t) => t.id),
    [first.id],
  );
  assert.deepEqual(
    result.list.sections[1].tasks.map((t) => t.id),
    [middle.id, last.id],
  );
  assert.equal(result.list.sections[1].tasks[0].title, 'Contexte conservé');
  assert.equal(result.list.sections[1].tasks[0].description, 'Deuxième paragraphe');
  const retry = await req<{ sectionId: string; list: ListDetail }>(
    `/sections/${s.id}/headings`,
    'POST',
    { listId: l.id, clientId: id, sourceTaskId: middle.id, title: 'Décisions', level: 3 },
    201,
  );
  assert.equal(retry.list.sections.length, 2);
  await req(
    `/sections/${s.id}/headings`,
    'POST',
    { listId: l.id, clientId: crypto.randomUUID(), title: 'Niveau invalide', level: 7 },
    400,
  );
  const id2 = crypto.randomUUID();
  await req(
    `/sections/${id}/headings`,
    'POST',
    { listId: l.id, clientId: id2, afterTaskId: middle.id, title: 'Suite', level: 6 },
    201,
  );
  const detail = await req<ListDetail>('/lists/' + l.id);
  assert.deepEqual(
    detail.sections.map((s) => s.position),
    [0, 1, 2],
  );
  assert.deepEqual(
    detail.sections[2].tasks.map((t) => t.id),
    [last.id],
  );
  assert.equal(detail.sections[2].tasks[0].position, 0);
});
