import { z } from 'zod';
export const id = z.uuid();
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const name = z.string().trim().min(1).max(120);
const revision = { expectedUpdatedAt: z.iso.datetime().optional() };
export const listCreate = z
  .object({ name, description: z.string().max(10000).optional(), color: color.optional() })
  .strict();
export const listPatch = listCreate.partial().extend(revision).strict();
export const sectionCreate = z
  .object({
    title: z.string().trim().min(1).max(160),
    level: z.number().int().min(1).max(6).optional(),
  })
  .strict();
export const headingCreate = sectionCreate
  .extend({
    listId: id,
    clientId: id,
    afterTaskId: id.optional(),
    beforeTaskId: id.optional(),
    sourceTaskId: id.optional(),
    description: z.string().max(50000).optional(),
    ...revision,
  })
  .strict()
  .refine((v) => [v.afterTaskId, v.beforeTaskId, v.sourceTaskId].filter(Boolean).length <= 1, {
    message: 'Un seul point d’insertion est autorisé.',
  });
export const sectionPatch = sectionCreate.partial().extend(revision).strict();
export const categoryCreate = z
  .object({ name: z.string().trim().min(1).max(60), color: color.optional() })
  .strict();
export const categoryPatch = categoryCreate.partial().strict();
export const taskCreate = z
  .object({
    title: z.string().trim().min(1).max(300),
    description: z.string().max(50000).optional(),
    status: z.enum(['TODO', 'IN_PROGRESS', 'DONE']).optional(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
    categoryId: id.nullable().optional(),
  })
  .strict();
export const taskInsert = taskCreate
  .extend({ afterTaskId: id.optional(), beforeTaskId: id.optional(), clientId: id.optional() })
  .strict()
  .refine((v) => !(v.afterTaskId && v.beforeTaskId), {
    message: 'Choisissez un seul point d’insertion.',
  });
export const restoreTask = z.object({ token: id }).strict();
export const trashTask = z.object(revision).strict();
export const taskPatch = taskCreate
  .partial()
  .extend({ sectionId: id.optional(), ...revision })
  .strict();
export const reorder = z.object({ ids: z.array(id).max(10000), listId: id.optional() }).strict();
export const taskReorder = z
  .object({ taskId: id, sectionId: id, position: z.number().int().min(0).max(100000) })
  .strict();
