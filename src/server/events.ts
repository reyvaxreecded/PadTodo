import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
export interface Change {
  type: string;
  resourceId: string;
  listId?: string;
}
export class EventHub {
  private clients = new Set<Response>();
  private sequence = 0;
  private epoch = randomUUID();
  connect = (req: Request, res: Response) => {
    res.status(200).set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    res.write(`retry: 2000\nevent: ready\ndata: ${JSON.stringify({ epoch: this.epoch })}\n\n`);
    this.clients.add(res);
    const timer = setInterval(() => res.write(': heartbeat\n\n'), 15000);
    timer.unref();
    const cleanup = () => {
      clearInterval(timer);
      this.clients.delete(res);
    };
    req.on('close', cleanup);
    res.on('error', cleanup);
  };
  publish(change: Change) {
    const payload = `id: ${this.epoch}:${++this.sequence}\nevent: change\ndata: ${JSON.stringify(change)}\n\n`;
    for (const client of this.clients) {
      if (client.destroyed || client.writableLength > 65536) {
        client.end();
        this.clients.delete(client);
      } else client.write(payload);
    }
  }
  close() {
    for (const client of this.clients) client.end();
    this.clients.clear();
  }
}
export const events = new EventHub();
