import 'dotenv/config';
import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';
import { hostname, networkInterfaces } from 'node:os';
import { api } from './server/routes/api';
import { events } from './server/events';
import { db } from './server/data/database';
const app = express();
app.disable('x-powered-by');
app.use('/api', api);
app.use(
  express.static(join(import.meta.dirname, '../browser'), {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);
const allowedHosts = [
  'localhost',
  '127.0.0.1',
  '[::1]',
  hostname(),
  ...Object.values(networkInterfaces()).flatMap(
    (interfaces) => interfaces?.map((i) => i.address) ?? [],
  ),
  ...(process.env['ALLOWED_HOSTS']
    ?.split(',')
    .map((h) => h.trim())
    .filter(Boolean) ?? []),
];
const angularApp = new AngularNodeAppEngine({ allowedHosts });
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) => (response ? writeResponseToNodeResponse(response, res) : next()))
    .catch(next);
});
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const host = process.env['HOST'] || '0.0.0.0';
  const port = Number(process.env['PORT'] || 4000);
  const server = app.listen(port, host, () =>
    console.log(`PadTodo : http://localhost:${port} (écoute ${host})`),
  );
  const shutdown = () => {
    events.close();
    server.close(() => {
      void db.$disconnect().then(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
export const reqHandler = createNodeRequestHandler(app);
