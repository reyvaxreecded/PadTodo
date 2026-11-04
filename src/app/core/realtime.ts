import { Injectable, signal, afterNextRender, DestroyRef, inject } from '@angular/core';
interface Change {
  type: string;
  resourceId: string;
  listId?: string;
}
@Injectable({ providedIn: 'root' })
export class Realtime {
  state = signal<'connecting' | 'online' | 'offline'>('connecting');
  private listeners = new Set<(change: Change | null) => void>();
  constructor() {
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      const source = new EventSource('/api/events');
      source.addEventListener('ready', () => {
        this.state.set('online');
        this.emit(null);
      });
      source.addEventListener('change', (event: MessageEvent<string>) => {
        try {
          this.emit(JSON.parse(event.data) as Change);
        } catch {
          this.emit(null);
        }
      });
      source.onerror = () => this.state.set('offline');
      destroy.onDestroy(() => source.close());
    });
  }
  subscribe(callback: (change: Change | null) => void) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }
  private emit(change: Change | null) {
    for (const fn of this.listeners) fn(change);
  }
}
