import 'dotenv/config';
import { spawn } from 'node:child_process';
const child = spawn(
  process.execPath,
  [
    'node_modules/@angular/cli/bin/ng.js',
    'serve',
    '--host',
    process.env.HOST || '0.0.0.0',
    '--port',
    process.env.PORT || '4000',
    ...process.argv.slice(2),
  ],
  { stdio: 'inherit', env: process.env },
);
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
child.on('exit', (code) => process.exit(code ?? 0));
