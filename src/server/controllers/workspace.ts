import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { id } from '../validation';
export const param = (req: Parameters<RequestHandler>[0], key = 'id') => id.parse(req.params[key]);
export const read =
  (fn: (req: Parameters<RequestHandler>[0]) => Promise<unknown>): RequestHandler =>
  async (req, res) => {
    res.json({ data: await fn(req) });
  };
export const write =
  <T>(
    schema: ZodType<T>,
    fn: (req: Parameters<RequestHandler>[0], data: T) => Promise<unknown>,
    status = 200,
  ): RequestHandler =>
  async (req, res) => {
    res.status(status).json({ data: await fn(req, schema.parse(req.body)) });
  };
export const remove =
  (fn: (req: Parameters<RequestHandler>[0]) => Promise<unknown>): RequestHandler =>
  async (req, res) => {
    await fn(req);
    res.status(204).end();
  };
