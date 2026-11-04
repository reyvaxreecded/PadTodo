import { Injectable, inject, signal, computed, DestroyRef } from '@angular/core';
import { Api } from '../core/api';
import type { Task } from '../shared/models';
import { noteFields, parseHeading } from './note-text';
interface Backup {
  title: string;
  description: string;
  expectedUpdatedAt: string;
}
@Injectable()
export class TaskDraft {
  private api = inject(Api);
  private destroy = inject(DestroyRef);
  base = signal<Task | null>(null);
  title = signal('');
  description = signal('');
  saving = signal(false);
  error = signal('');
  conflict = signal(false);
  dirty = computed(
    () =>
      !!this.base() &&
      (this.title().trim() !== this.base()!.title ||
        this.description() !== this.base()!.description),
  );
  onEmpty: ((task: Task) => Promise<boolean>) | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pending: Promise<boolean> | undefined;
  private revision = '';
  private hydrated = false;
  private dead = false;
  constructor() {
    this.destroy.onDestroy(() => {
      this.dead = true;
      clearTimeout(this.timer);
      if (this.dirty()) {
        this.backup();
        void this.flush();
      }
    });
  }
  receive(task: Task) {
    const old = this.base();
    if (old && task.updatedAt <= old.updatedAt) return;
    const sameText = !!old && task.title === old.title && task.description === old.description;
    if (!old || (!this.saving() && (!this.dirty() || sameText))) {
      this.base.set(task);
      this.revision = task.updatedAt;
      if (!sameText) {
        this.title.set(task.title);
        this.description.set(task.description);
      }
    }
  }
  recover() {
    this.hydrated = true;
    const retry = () => void this.flush();
    window.addEventListener('online', retry);
    this.destroy.onDestroy(() => window.removeEventListener('online', retry));
    try {
      const raw = localStorage.getItem(this.key());
      if (!raw) return;
      const b = JSON.parse(raw) as Backup;
      if (typeof b.title !== 'string' || typeof b.description !== 'string') return;
      if (b.title === this.base()?.title && b.description === this.base()?.description) {
        this.clearBackup();
        return;
      }
      this.revision = b.expectedUpdatedAt;
      this.title.set(b.title);
      this.description.set(b.description);
      this.error.set('Brouillon récupéré dans ce navigateur.');
      this.schedule();
    } catch {
      /* Storage is optional. */
    }
  }
  edit(title: string, description = this.description()) {
    this.title.set(title);
    this.description.set(description);
    if (!this.conflict()) this.error.set('');
    this.backup();
    this.schedule();
  }
  private schedule() {
    clearTimeout(this.timer);
    if (!this.dead && !this.conflict() && !parseHeading(this.title()))
      this.timer = setTimeout(() => void this.flush(), 650);
  }
  async flush(): Promise<boolean> {
    clearTimeout(this.timer);
    if (this.pending) {
      const ok = await this.pending;
      return ok && this.dirty() ? this.flush() : ok;
    }
    if (!this.dirty()) return true;
    if (parseHeading(this.title())) return false;
    if (!this.title().trim()) {
      if (this.description().trim()) {
        // A note still containing text is kept: its first paragraph becomes its title.
        const fields = noteFields(this.description());
        this.title.set(fields.title);
        this.description.set(fields.description);
        this.backup();
      } else {
        const task = this.base();
        if (this.dead || !task || !this.onEmpty) return false;
        this.error.set('');
        this.saving.set(true);
        this.pending = this.onEmpty(task)
          .then((ok) => {
            if (ok) this.clearBackup();
            else this.error.set('Suppression impossible. Votre ligne est conservée.');
            // The row was removed, so callers must not continue with another mutation.
            return false;
          })
          .finally(() => {
            this.saving.set(false);
            this.pending = undefined;
          });
        return this.pending;
      }
    }
    if (this.conflict()) return false;
    const snapshot = { title: this.title().trim(), description: this.description() };
    const base = this.base();
    if (!base) return false;
    this.saving.set(true);
    this.pending = (async () => {
      try {
        let task: Task | undefined;
        let reference = { ...base, updatedAt: this.revision };
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            task = await this.api.saveTask(reference, snapshot);
            break;
          } catch (error) {
            if ((error as { status?: number }).status !== 409 || attempt === 2) throw error;
            const latest = await this.api.get<Task>('/tasks/' + base.id);
            if (latest.title !== reference.title || latest.description !== reference.description)
              throw error;
            reference = latest;
          }
        }
        if (!task) throw new Error('Enregistrement impossible.');
        this.base.set(task);
        this.revision = task.updatedAt;
        // Only normalize the version actually sent, never newer keystrokes.
        if (this.title().trim() === snapshot.title && this.description() === snapshot.description) {
          // Keep the live textarea value, including a trailing space and its caret.
          this.clearBackup();
        }
        this.error.set('');
        return true;
      } catch (error) {
        const e = error as { status?: number };
        this.conflict.set(e.status === 409);
        this.error.set(
          e.status === 409
            ? 'Modifié ailleurs. Votre texte est conservé.'
            : 'Enregistrement impossible. Votre brouillon est conservé ici.',
        );
        this.backup();
        return false;
      } finally {
        this.saving.set(false);
        this.pending = undefined;
      }
    })();
    return this.pending;
  }
  async waitForSave() {
    if (this.pending) await this.pending;
  }
  async resolve(keepMine: boolean) {
    try {
      const task = await this.api.get<Task>('/tasks/' + this.base()!.id);
      this.base.set(task);
      this.revision = task.updatedAt;
      this.conflict.set(false);
      this.error.set('');
      if (keepMine) await this.flush();
      else {
        this.title.set(task.title);
        this.description.set(task.description);
        this.clearBackup();
      }
    } catch {
      this.error.set('Impossible de récupérer la version partagée. Votre texte est conservé.');
    }
  }
  discard() {
    const task = this.base();
    if (task) {
      this.title.set(task.title);
      this.description.set(task.description);
      this.error.set('');
      this.conflict.set(false);
      this.clearBackup();
    }
  }
  private key() {
    return 'padtodo.draft.' + this.base()?.id;
  }
  private backup() {
    if (!this.hydrated) return;
    try {
      localStorage.setItem(
        this.key(),
        JSON.stringify({
          title: this.title(),
          description: this.description(),
          expectedUpdatedAt: this.revision,
        }),
      );
    } catch {
      /* Editing remains available without local storage. */
    }
  }
  private clearBackup() {
    if (!this.hydrated) return;
    try {
      localStorage.removeItem(this.key());
    } catch {
      /* Optional recovery copy. */
    }
  }
}
