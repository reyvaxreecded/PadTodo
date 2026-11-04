import { Injectable, afterNextRender, signal, inject, DOCUMENT } from '@angular/core';
@Injectable({ providedIn: 'root' })
export class Preferences {
  dark = signal(false);
  compact = signal(false);
  collapsed = signal<string[]>([]);
  private doc = inject(DOCUMENT);
  constructor() {
    afterNextRender(() => {
      try {
        const data = JSON.parse(localStorage.getItem('padtodo.preferences') || '{}');
        this.dark.set(data.dark ?? matchMedia('(prefers-color-scheme: dark)').matches);
        this.compact.set(data.compact ?? false);
        this.collapsed.set(data.collapsed ?? []);
        this.apply();
      } catch {
        /* Defaults remain usable when storage is disabled. */
      }
    });
  }
  toggleTheme() {
    this.dark.update((v) => !v);
    this.apply();
    this.save();
  }
  toggleSidebar() {
    this.compact.update((v) => !v);
    this.save();
  }
  toggleSection(id: string) {
    this.collapsed.update((ids) => (ids.includes(id) ? ids.filter((v) => v !== id) : [...ids, id]));
    this.save();
  }
  private apply() {
    this.doc.documentElement.classList.toggle('dark', this.dark());
  }
  private save() {
    try {
      localStorage.setItem(
        'padtodo.preferences',
        JSON.stringify({ dark: this.dark(), compact: this.compact(), collapsed: this.collapsed() }),
      );
    } catch {
      /* Nonessential local preference. */
    }
  }
}
