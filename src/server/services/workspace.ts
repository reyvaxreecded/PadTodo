import { randomUUID } from 'node:crypto';
import { db } from '../data/database';
import { ApiError } from '../errors';
import { events, type Change } from '../events';
import type { Prisma } from '../../generated/prisma/client';
import * as v from '../validation';
import type { z } from 'zod';
type Tx = Prisma.TransactionClient;
type TaskRecord = Awaited<ReturnType<typeof db.task.findUniqueOrThrow>>;
const undoTasks = new Map<string, { task: TaskRecord; expiresAt: number }>();
function pruneUndo() {
  for (const [token, record] of undoTasks)
    if (record.expiresAt < Date.now()) undoTasks.delete(token);
  while (undoTasks.size >= 1000) undoTasks.delete(undoTasks.keys().next().value!);
}
const ordered = { orderBy: [{ position: 'asc' as const }, { id: 'asc' as const }] };
const sectionInclude = { ...ordered, include: { tasks: ordered } };
function checkRevision(current: { updatedAt: Date }, expected?: string) {
  if (expected && current.updatedAt.toISOString() !== expected)
    throw new ApiError(
      409,
      'Cette donnée a été modifiée par un collègue. Vos champs restent ouverts ; actualisez avant de réessayer.',
    );
}
async function mutate<T>(run: (tx: Tx) => Promise<{ data: T; change: Change }>): Promise<T> {
  // One process, one shared workspace: serialize writes in PostgreSQL, including across connections.
  const result = await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(726341)`;
      return run(tx);
    },
    { timeout: 15000, maxWait: 15000 },
  );
  events.publish(result.change); // Never broadcast before COMMIT.
  return result.data;
}
async function section(tx: Tx, id: string) {
  return tx.taskSection.findUniqueOrThrow({ where: { id } });
}
async function categoryValid(tx: Tx, categoryId: string | null | undefined, listId: string) {
  if (categoryId && !(await tx.category.findFirst({ where: { id: categoryId, listId } })))
    throw new ApiError(400, 'La catégorie doit appartenir à cette liste.');
}
async function normalizeTasks(tx: Tx, sectionId: string) {
  const tasks = await tx.task.findMany({ where: { sectionId }, ...ordered });
  for (const [position, task] of tasks.entries())
    if (task.position !== position)
      await tx.task.update({ where: { id: task.id }, data: { position } });
}
export const workspace = {
  lists: () =>
    db.$transaction(
      async (tx) => {
        const lists = await tx.taskList.findMany(ordered);
        const counts = await tx.task.groupBy({ by: ['sectionId', 'status'], _count: true });
        const sections = await tx.taskSection.findMany({ select: { id: true, listId: true } });
        return lists.map((list) => ({
          ...list,
          openTasks: counts
            .filter(
              (c) =>
                c.status !== 'DONE' &&
                sections.some((s) => s.id === c.sectionId && s.listId === list.id),
            )
            .reduce((n, c) => n + c._count, 0),
        }));
      },
      { isolationLevel: 'RepeatableRead' },
    ),
  detail: (id: string) =>
    db.$transaction(
      (tx) =>
        tx.taskList.findUniqueOrThrow({
          where: { id },
          include: { sections: sectionInclude, categories: { orderBy: { name: 'asc' } } },
        }),
      { isolationLevel: 'RepeatableRead' },
    ),
  createList: (input: z.infer<typeof v.listCreate>) =>
    mutate(async (tx) => {
      const data = await tx.taskList.create({
        data: { ...input, position: await tx.taskList.count() },
      });
      return { data, change: { type: 'list.created', resourceId: data.id, listId: data.id } };
    }),
  patchList: (id: string, input: z.infer<typeof v.listPatch>) =>
    mutate(async (tx) => {
      const { expectedUpdatedAt, ...values } = input;
      checkRevision(await tx.taskList.findUniqueOrThrow({ where: { id } }), expectedUpdatedAt);
      const data = await tx.taskList.update({ where: { id }, data: values });
      return { data, change: { type: 'list.updated', resourceId: id, listId: id } };
    }),
  deleteList: (id: string) =>
    mutate(async (tx) => {
      await tx.taskList.delete({ where: { id } });
      const remaining = await tx.taskList.findMany(ordered);
      for (const [position, item] of remaining.entries())
        await tx.taskList.update({ where: { id: item.id }, data: { position } });
      return { data: null, change: { type: 'list.deleted', resourceId: id, listId: id } };
    }),
  createSection: (listId: string, input: z.infer<typeof v.sectionCreate>) =>
    mutate(async (tx) => {
      await tx.taskList.findUniqueOrThrow({ where: { id: listId } });
      const data = await tx.taskSection.create({
        data: { ...input, listId, position: await tx.taskSection.count({ where: { listId } }) },
      });
      return { data, change: { type: 'section.created', resourceId: data.id, listId } };
    }),
  createHeading: (sectionId: string, input: z.infer<typeof v.headingCreate>) =>
    mutate(async (tx) => {
      const existing = await tx.taskSection.findUnique({ where: { id: input.clientId } });
      if (existing) {
        if (existing.listId !== input.listId)
          throw new ApiError(409, 'Ce titre appartient à une autre liste.');
        const list = await tx.taskList.findUniqueOrThrow({
          where: { id: input.listId },
          include: { sections: sectionInclude, categories: { orderBy: { name: 'asc' } } },
        });
        return {
          data: { sectionId: existing.id, list },
          change: { type: 'section.created', resourceId: existing.id, listId: input.listId },
        };
      }
      const parent = await section(tx, sectionId);
      if (parent.listId !== input.listId)
        throw new ApiError(400, 'La section doit appartenir à cette liste.');
      let boundary = await tx.task.count({ where: { sectionId } });
      let source: TaskRecord | null = null;
      const anchorId = input.sourceTaskId ?? input.afterTaskId ?? input.beforeTaskId;
      if (anchorId) {
        const anchor = await tx.task.findFirst({ where: { id: anchorId, sectionId } });
        if (!anchor)
          throw new ApiError(409, 'La ligne de référence a changé. Votre titre est conservé.');
        boundary = anchor.position + (input.afterTaskId ? 1 : 0);
        if (input.sourceTaskId) {
          source = anchor;
          checkRevision(anchor, input.expectedUpdatedAt);
        }
      }
      const following = await tx.task.findMany({
        where: {
          sectionId,
          position: { gte: boundary },
          ...(source ? { id: { not: source.id } } : {}),
        },
        ...ordered,
      });
      await tx.taskSection.updateMany({
        where: { listId: parent.listId, position: { gt: parent.position } },
        data: { position: { increment: 1 } },
      });
      const created = await tx.taskSection.create({
        data: {
          id: input.clientId,
          title: input.title,
          level: input.level ?? 1,
          listId: parent.listId,
          position: parent.position + 1,
        },
      });
      let offset = 0;
      if (source) {
        const text = (input.description ?? source.description).trimStart();
        if (text) {
          const split = text.indexOf('\n');
          const first = split < 0 ? text : text.slice(0, split);
          const title = first.slice(0, 300);
          const description =
            first.slice(300) +
            (split < 0 ? '' : (first.length > 300 ? '\n' : '') + text.slice(split + 1));
          await tx.task.update({
            where: { id: source.id },
            data: { sectionId: created.id, position: 0, title, description },
          });
          offset = 1;
        } else await tx.task.delete({ where: { id: source.id } });
      } else if (input.description?.trim()) {
        const text = input.description.trimStart();
        const split = text.indexOf('\n');
        const first = split < 0 ? text : text.slice(0, split);
        await tx.task.create({
          data: {
            sectionId: created.id,
            position: 0,
            title: first.slice(0, 300),
            description:
              first.slice(300) +
              (split < 0 ? '' : (first.length > 300 ? '\n' : '') + text.slice(split + 1)),
          },
        });
        offset = 1;
      }
      for (const [position, task] of following.entries())
        await tx.task.update({
          where: { id: task.id },
          data: { sectionId: created.id, position: position + offset },
        });
      await normalizeTasks(tx, parent.id);
      const list = await tx.taskList.findUniqueOrThrow({
        where: { id: parent.listId },
        include: { sections: sectionInclude, categories: { orderBy: { name: 'asc' } } },
      });
      return {
        data: { sectionId: created.id, list },
        change: { type: 'section.created', resourceId: created.id, listId: parent.listId },
      };
    }),
  patchSection: (id: string, input: z.infer<typeof v.sectionPatch>) =>
    mutate(async (tx) => {
      const old = await section(tx, id);
      checkRevision(old, input.expectedUpdatedAt);
      const data = await tx.taskSection.update({
        where: { id },
        data: { title: input.title, level: input.level },
      });
      return { data, change: { type: 'section.updated', resourceId: id, listId: old.listId } };
    }),
  deleteSection: (id: string) =>
    mutate(async (tx) => {
      const old = await tx.taskSection.delete({ where: { id } });
      const remaining = await tx.taskSection.findMany({
        where: { listId: old.listId },
        ...ordered,
      });
      for (const [position, item] of remaining.entries())
        await tx.taskSection.update({ where: { id: item.id }, data: { position } });
      return {
        data: null,
        change: { type: 'section.deleted', resourceId: id, listId: old.listId },
      };
    }),
  reorder: (kind: 'lists' | 'sections', input: z.infer<typeof v.reorder>) =>
    mutate(async (tx) => {
      if (kind === 'sections' && !input.listId) throw new ApiError(400, 'Liste requise.');
      const existing =
        kind === 'lists'
          ? await tx.taskList.findMany({ select: { id: true } })
          : await tx.taskSection.findMany({
              where: { listId: input.listId },
              select: { id: true },
            });
      if (
        new Set(input.ids).size !== input.ids.length ||
        existing.length !== input.ids.length ||
        existing.some((x) => !input.ids.includes(x.id))
      )
        throw new ApiError(409, 'L’ordre a changé. Actualisez puis réessayez.');
      for (const [position, id] of input.ids.entries()) {
        if (kind === 'lists') await tx.taskList.update({ where: { id }, data: { position } });
        else await tx.taskSection.update({ where: { id }, data: { position } });
      }
      return {
        data: null,
        change: {
          type: kind + '.reordered',
          resourceId: input.listId ?? 'workspace',
          listId: input.listId,
        },
      };
    }),
  createTask: (sectionId: string, input: z.infer<typeof v.taskInsert>) =>
    mutate(async (tx) => {
      const parent = await section(tx, sectionId);
      await categoryValid(tx, input.categoryId, parent.listId);
      const { afterTaskId, beforeTaskId, clientId, ...values } = input;
      if (clientId) {
        const existing = await tx.task.findUnique({ where: { id: clientId } });
        if (existing) {
          if (existing.sectionId !== sectionId)
            throw new ApiError(409, 'Cette ligne existe dans une autre section.');
          return {
            data: existing,
            change: { type: 'task.created', resourceId: existing.id, listId: parent.listId },
          };
        }
      }
      let position = await tx.task.count({ where: { sectionId } });
      const anchorId = afterTaskId ?? beforeTaskId;
      if (anchorId) {
        const anchor = await tx.task.findFirst({ where: { id: anchorId, sectionId } });
        if (!anchor)
          throw new ApiError(
            409,
            'La ligne de référence a été déplacée ou supprimée. Votre saisie est conservée.',
          );
        position = anchor.position + (afterTaskId ? 1 : 0);
        await tx.task.updateMany({
          where: { sectionId, position: { gte: position } },
          data: { position: { increment: 1 } },
        });
      }
      const data = await tx.task.create({
        data: {
          ...values,
          ...(clientId ? { id: clientId } : {}),
          sectionId,
          position,
          completedAt: input.status === 'DONE' ? new Date() : null,
        },
      });
      return { data, change: { type: 'task.created', resourceId: data.id, listId: parent.listId } };
    }),
  patchTask: (id: string, input: z.infer<typeof v.taskPatch>) =>
    mutate(async (tx) => {
      const old = await tx.task.findUniqueOrThrow({ where: { id } });
      checkRevision(old, input.expectedUpdatedAt);
      const source = await section(tx, old.sectionId);
      const destination = await section(tx, input.sectionId ?? old.sectionId);
      if (source.listId !== destination.listId)
        throw new ApiError(400, 'Déplacement limité aux sections de la même liste.');
      await categoryValid(tx, input.categoryId ?? old.categoryId, source.listId);
      const { expectedUpdatedAt: _, ...values } = input;
      const data = await tx.task.update({
        where: { id },
        data: {
          ...values,
          ...(input.status
            ? { completedAt: input.status === 'DONE' ? (old.completedAt ?? new Date()) : null }
            : {}),
          ...(destination.id !== source.id
            ? { position: await tx.task.count({ where: { sectionId: destination.id } }) }
            : {}),
        },
      });
      if (destination.id !== source.id) await normalizeTasks(tx, source.id);
      return { data, change: { type: 'task.updated', resourceId: id, listId: source.listId } };
    }),
  deleteTask: (id: string) =>
    mutate(async (tx) => {
      const old = await tx.task.delete({ where: { id } });
      const parent = await section(tx, old.sectionId);
      await normalizeTasks(tx, parent.id);
      return {
        data: null,
        change: { type: 'task.deleted', resourceId: id, listId: parent.listId },
      };
    }),
  trashTask: async (id: string, expectedUpdatedAt?: string) => {
    const task = await mutate(async (tx) => {
      const old = await tx.task.findUniqueOrThrow({ where: { id } });
      checkRevision(old, expectedUpdatedAt);
      const parent = await section(tx, old.sectionId);
      await tx.task.delete({ where: { id } });
      await normalizeTasks(tx, parent.id);
      return { data: old, change: { type: 'task.deleted', resourceId: id, listId: parent.listId } };
    });
    pruneUndo();
    const token = randomUUID();
    const expiresAt = Date.now() + 90000;
    undoTasks.set(token, { task, expiresAt });
    return { token, expiresAt: new Date(expiresAt).toISOString(), task };
  },
  restoreTask: (token: string) =>
    mutate(async (tx) => {
      const record = undoTasks.get(token);
      if (!record || record.expiresAt < Date.now())
        throw new ApiError(410, 'Le délai d’annulation est écoulé.');
      const old = record.task;
      if (await tx.task.findUnique({ where: { id: old.id } }))
        throw new ApiError(410, 'Cette suppression a déjà été annulée.');
      const parent = await tx.taskSection.findUnique({ where: { id: old.sectionId } });
      if (!parent)
        throw new ApiError(
          409,
          'La section a été supprimée ; cette ligne ne peut plus être restaurée.',
        );
      const position = Math.min(
        old.position,
        await tx.task.count({ where: { sectionId: parent.id } }),
      );
      await tx.task.updateMany({
        where: { sectionId: parent.id, position: { gte: position } },
        data: { position: { increment: 1 } },
      });
      const categoryId =
        old.categoryId &&
        (await tx.category.findFirst({ where: { id: old.categoryId, listId: parent.listId } }))
          ? old.categoryId
          : null;
      const data = await tx.task.create({
        data: { ...old, position, categoryId, updatedAt: new Date() },
      });
      // A consumed receipt remains unusable even if a concurrent restore was waiting on the lock.
      // Cleanup happens only after this transaction commits (see the route adapter).
      return {
        data,
        change: { type: 'task.restored', resourceId: data.id, listId: parent.listId },
      };
    }).then((task) => {
      undoTasks.delete(token);
      return task;
    }),
  duplicateTask: (id: string) =>
    mutate(async (tx) => {
      const old = await tx.task.findUniqueOrThrow({ where: { id } });
      const parent = await section(tx, old.sectionId);
      const data = await tx.task.create({
        data: {
          title: old.title.slice(0, 290) + ' (copie)',
          description: old.description,
          priority: old.priority,
          categoryId: old.categoryId,
          sectionId: old.sectionId,
          position: await tx.task.count({ where: { sectionId: old.sectionId } }),
        },
      });
      return { data, change: { type: 'task.created', resourceId: data.id, listId: parent.listId } };
    }),
  moveTask: (input: z.infer<typeof v.taskReorder>) =>
    mutate(async (tx) => {
      const task = await tx.task.findUniqueOrThrow({ where: { id: input.taskId } });
      const source = await section(tx, task.sectionId);
      const target = await section(tx, input.sectionId);
      if (source.listId !== target.listId)
        throw new ApiError(400, 'Déplacement entre listes interdit.');
      const tasks = await tx.task.findMany({
        where: { sectionId: target.id, id: { not: task.id } },
        ...ordered,
      });
      tasks.splice(Math.min(input.position, tasks.length), 0, task);
      for (const [position, item] of tasks.entries())
        await tx.task.update({ where: { id: item.id }, data: { sectionId: target.id, position } });
      if (source.id !== target.id) await normalizeTasks(tx, source.id);
      return {
        data: null,
        change: { type: 'task.moved', resourceId: task.id, listId: source.listId },
      };
    }),
  createCategory: (listId: string, input: z.infer<typeof v.categoryCreate>) =>
    mutate(async (tx) => {
      await tx.taskList.findUniqueOrThrow({ where: { id: listId } });
      const data = await tx.category.create({ data: { ...input, listId } });
      return { data, change: { type: 'category.created', resourceId: data.id, listId } };
    }),
  patchCategory: (id: string, input: z.infer<typeof v.categoryPatch>) =>
    mutate(async (tx) => {
      const data = await tx.category.update({ where: { id }, data: input });
      return { data, change: { type: 'category.updated', resourceId: id, listId: data.listId } };
    }),
  deleteCategory: (id: string) =>
    mutate(async (tx) => {
      const data = await tx.category.delete({ where: { id } });
      return {
        data: null,
        change: { type: 'category.deleted', resourceId: id, listId: data.listId },
      };
    }),
};
