import { Router, json } from 'express';
import { db } from '../data/database';
import { events } from '../events';
import { workspace as w } from '../services/workspace';
import * as v from '../validation';
import { param, read, write, remove } from '../controllers/workspace';
import { ApiError, errorHandler } from '../errors';
export const api = Router();
api.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Cache-Control', 'no-store');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const origin = req.get('origin');
    // Reject cross-origin writes without depending on a configured LAN hostname.
    if (
      (origin && new URL(origin).host !== req.get('host')) ||
      req.get('sec-fetch-site') === 'cross-site'
    ) {
      next(new ApiError(403, 'Origine non autorisée.'));
      return;
    }
  }
  next();
});
api.use(json({ limit: '128kb' }));
api.get('/health', async (_req, res) => {
  try {
    await db.$queryRaw`SELECT 1`;
    res.json({ data: { status: 'ok' } });
  } catch {
    res.status(503).json({ error: { message: 'PostgreSQL indisponible.' } });
  }
});
api.get('/events', events.connect);
api.get(
  '/lists',
  read(() => w.lists()),
);
api.post(
  '/lists',
  write(v.listCreate, (_r, d) => w.createList(d), 201),
);
api.patch(
  '/lists/reorder',
  write(v.reorder, (_r, d) => w.reorder('lists', d)),
);
api.get(
  '/lists/:id',
  read((r) => w.detail(param(r))),
);
api.patch(
  '/lists/:id',
  write(v.listPatch, (r, d) => w.patchList(param(r), d)),
);
api.delete(
  '/lists/:id',
  remove((r) => w.deleteList(param(r))),
);
api.get(
  '/lists/:listId/sections',
  read(async (r) => (await w.detail(param(r, 'listId'))).sections),
);
api.post(
  '/lists/:listId/sections',
  write(v.sectionCreate, (r, d) => w.createSection(param(r, 'listId'), d), 201),
);
api.post(
  '/sections/:id/headings',
  write(v.headingCreate, (r, d) => w.createHeading(param(r), d), 201),
);
api.patch(
  '/sections/reorder',
  write(v.reorder, (_r, d) => w.reorder('sections', d)),
);
api.patch(
  '/sections/:id',
  write(v.sectionPatch, (r, d) => w.patchSection(param(r), d)),
);
api.delete(
  '/sections/:id',
  remove((r) => w.deleteSection(param(r))),
);
api.get(
  '/lists/:listId/tasks',
  read(async (r) => (await w.detail(param(r, 'listId'))).sections.flatMap((s) => s.tasks)),
);
api.post(
  '/sections/:sectionId/tasks',
  write(v.taskInsert, (r, d) => w.createTask(param(r, 'sectionId'), d), 201),
);
api.patch(
  '/tasks/reorder',
  write(v.taskReorder, (_r, d) => w.moveTask(d)),
);
api.post(
  '/tasks/restore',
  write(v.restoreTask, (_r, d) => w.restoreTask(d.token)),
);
api.post(
  '/tasks/:id/trash',
  write(v.trashTask, (r, d) => w.trashTask(param(r), d.expectedUpdatedAt)),
);
api.get(
  '/tasks/:id',
  read((r) => db.task.findUniqueOrThrow({ where: { id: param(r) } })),
);
api.patch(
  '/tasks/:id',
  write(v.taskPatch, (r, d) => w.patchTask(param(r), d)),
);
api.delete(
  '/tasks/:id',
  remove((r) => w.deleteTask(param(r))),
);
api.post(
  '/tasks/:id/duplicate',
  write(v.taskCreate.pick({}).strict(), (r) => w.duplicateTask(param(r)), 201),
);
api.get(
  '/lists/:listId/categories',
  read(async (r) => (await w.detail(param(r, 'listId'))).categories),
);
api.post(
  '/lists/:listId/categories',
  write(v.categoryCreate, (r, d) => w.createCategory(param(r, 'listId'), d), 201),
);
api.patch(
  '/categories/:id',
  write(v.categoryPatch, (r, d) => w.patchCategory(param(r), d)),
);
api.delete(
  '/categories/:id',
  remove((r) => w.deleteCategory(param(r))),
);
api.use((_req, _res, next) => next(new ApiError(404, 'Route API inconnue.')));
api.use(errorHandler);
