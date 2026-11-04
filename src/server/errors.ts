import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        message: 'Données invalides.',
        details: error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      },
    });
    return;
  }
  if (error instanceof ApiError) {
    res.status(error.status).json({ error: { message: error.message } });
    return;
  }
  if (error?.code === 'P2025') {
    res.status(404).json({ error: { message: 'Cette ressource n’existe plus.' } });
    return;
  }
  if (error?.code === 'P2003') {
    res
      .status(409)
      .json({ error: { message: 'Une ressource liée a été modifiée. Actualisez la page.' } });
    return;
  }
  if (error?.type === 'entity.too.large') {
    res.status(413).json({ error: { message: 'Requête trop volumineuse.' } });
    return;
  }
  if (error instanceof SyntaxError && 'body' in error) {
    res.status(400).json({ error: { message: 'JSON invalide.' } });
    return;
  }
  console.error('[API]', error);
  res.status(500).json({ error: { message: 'Le serveur ne peut pas traiter cette demande.' } });
};
