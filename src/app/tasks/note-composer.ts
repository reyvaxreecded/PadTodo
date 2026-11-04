import {
  Component,
  input,
  output,
  signal,
  computed,
  inject,
  afterNextRender,
  ViewChild,
  ElementRef,
  DestroyRef,
} from '@angular/core';
import { TextFieldModule } from '@angular/cdk/text-field';
import { Icon } from '../shared/icon';
import { Api } from '../core/api';
import type { Task, HeadingResult } from '../shared/models';
import { noteFields, newDraftId, parseHeading, headingSize } from './note-text';
export interface ComposedHeading {
  result: HeadingResult;
  focused: boolean;
  next: boolean;
  carry?: string;
}
export interface ComposedNote {
  task: Task;
  text: string;
  next: boolean;
  focused: boolean;
  caret: number;
  carry?: string;
}
@Component({
  selector: 'app-note-composer',
  imports: [Icon, TextFieldModule],
  template: `
    <div class="composer" [class.has-text]="value().trim()" [class.heading-composer]="heading()">
      @if (heading(); as h) {
        <span class="heading-badge">H{{ h.level }}</span>
      } @else {
        <app-icon name="plus" />
      }
      <textarea
        #input
        cdkTextareaAutosize
        [cdkAutosizeMinRows]="1"
        [cdkAutosizeMaxRows]="14"
        [id]="anchorId() ? 'new-' + anchorId() : 'quick-' + sectionId()"
        [attr.aria-label]="
          (anchorId() ? 'Nouvelle ligne dans ' : 'Ajouter une tâche dans ') + sectionTitle()
        "
        [value]="value()"
        [style.font-size.px]="heading() ? headingSize(heading()!.level) : null"
        (input)="inputText($event)"
        (keydown)="key($event)"
        (blur)="commit(false)"
        placeholder="Écrivez une note ou une tâche…"
        rows="1"
      ></textarea>
      <button
        class="commit icon-button"
        aria-label="Enregistrer la nouvelle ligne"
        [disabled]="!value().trim() || saving()"
        (mousedown)="$event.preventDefault()"
        (click)="commit(true)"
      >
        <app-icon name="arrow" />
      </button>
    </div>
    @if (heading(); as h) {
      <span class="heading-hint">{{
        h.title
          ? 'Entrée pour créer la section · Niveau ' + h.level
          : 'Écrivez le titre après les #'
      }}</span>
    }
    @if (saving()) {
      <span class="composer-state" role="status">Enregistrement…</span>
    }
    @if (error()) {
      <div class="composer-error" role="status">
        {{ error() }} <button (click)="commit(false)">Réessayer</button>
      </div>
    }
  `,
  styles: [
    `
      .heading-badge {
        font:
          600 10px ui-monospace,
          monospace;
        color: var(--accent);
        border: 1px solid var(--line);
        background: var(--accent-soft);
        border-radius: 4px;
        padding: 3px;
        margin-top: 5px;
        flex: none;
      }
      .heading-composer textarea {
        font-weight: 700;
        line-height: 1.35;
      }
      .heading-hint {
        display: block;
        font-size: 11px;
        color: var(--muted);
        padding: 0 10px 9px 57px;
      }
      :host {
        display: block;
      }
      .composer {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 9px 6px 9px 31px;
        border-top: 1px dashed var(--line);
      }
      .composer > app-icon {
        width: 16px;
        height: 16px;
        margin-top: 6px;
        color: var(--accent);
      }
      textarea {
        flex: 1;
        min-width: 0;
        border: 0;
        outline: none;
        background: transparent;
        padding: 4px 0;
        resize: none;
        line-height: 1.6;
        font-size: 14px;
        overflow-wrap: anywhere;
      }
      textarea:focus-visible {
        outline: none;
      }
      textarea::placeholder {
        color: var(--muted);
      }
      .composer:focus-within {
        background: var(--hover);
        border-radius: 5px;
      }
      .commit {
        width: 28px;
        height: 28px;
        color: var(--accent);
      }
      .commit app-icon {
        width: 16px;
        height: 16px;
      }
      .composer-state,
      .composer-error {
        display: block;
        padding: 0 10px 9px 57px;
        font-size: 11px;
        color: var(--muted);
      }
      .composer-error {
        color: var(--red);
        line-height: 1.5;
      }
      .composer-error button {
        border: 0;
        background: none;
        text-decoration: underline;
        color: inherit;
        padding: 3px;
        font-size: inherit;
      }
      @media (max-width: 600px) {
        .composer {
          padding-left: 0;
          gap: 8px;
        }
        textarea {
          font-size: 13px;
        }
        .composer-state,
        .composer-error {
          padding-left: 24px;
        }
      }
    `,
  ],
})
export class NoteComposer {
  listId = input.required<string>();
  sectionId = input.required<string>();
  sectionTitle = input.required<string>();
  anchorId = input<string>();
  side = input<'after' | 'before'>('after');
  autofocus = input(false);
  committed = output<ComposedNote>();
  headingCommitted = output<ComposedHeading>();
  heading = computed(() => parseHeading(this.value()));
  headingSize = headingSize;
  cancel = output();
  value = signal('');
  saving = signal(false);
  error = signal('');
  @ViewChild('input') input?: ElementRef<HTMLTextAreaElement>;
  private api = inject(Api);
  private destroy = inject(DestroyRef);
  private timer: ReturnType<typeof setTimeout> | undefined;
  private job: { id: string; text: string; finish: boolean } | undefined;
  private queue: { id: string; text: string }[] = [];
  private failedId: string | undefined;
  private cancelAfter = false;
  private currentAnchor: string | undefined;
  private currentSection: string | undefined;
  private dead = false;
  private ready = false;
  constructor() {
    afterNextRender(() => {
      this.ready = true;
      try {
        const raw = localStorage.getItem(this.storageKey());
        if (raw) {
          try {
            const b = JSON.parse(raw) as { text: string; id?: string };
            if (typeof b.text === 'string') {
              this.value.set(b.text);
              this.failedId = b.id;
            } else this.value.set(raw);
          } catch {
            this.value.set(raw);
          }
        }
      } catch {}
      const retry = () => void this.commit(false);
      window.addEventListener('online', retry);
      this.destroy.onDestroy(() => window.removeEventListener('online', retry));
      if (this.autofocus()) this.input?.nativeElement.focus();
    });
    this.destroy.onDestroy(() => {
      this.dead = true;
      clearTimeout(this.timer);
      this.backup();
      if (this.value().trim() && !this.saving()) void this.commit(false);
    });
  }
  inputText(event: Event) {
    this.value.set((event.target as HTMLTextAreaElement).value);
    this.error.set('');
    this.backup();
    clearTimeout(this.timer);
    if (!this.heading()) this.timer = setTimeout(() => void this.commit(false), 850);
  }
  key(event: KeyboardEvent) {
    if (event.isComposing) return;
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void this.commit(true);
    } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void this.commit(false);
    } else if (
      (event.key === 'Backspace' && !this.value()) ||
      (event.key === 'Escape' && !this.value())
    ) {
      event.preventDefault();
      if (this.saving()) this.cancelAfter = true;
      else this.cancel.emit();
    }
  }
  private clearInput() {
    this.value.set('');
    if (this.input) this.input.nativeElement.value = '';
  }
  seed(text: string) {
    this.value.set(text);
    if (this.input) this.input.nativeElement.value = text;
    this.backup();
    clearTimeout(this.timer);
    if (text.trim() && !parseHeading(text))
      this.timer = setTimeout(() => void this.commit(false), 850);
  }
  async commit(next: boolean) {
    clearTimeout(this.timer);
    if (this.saving()) {
      if (next && this.value().trim()) {
        if (this.job && !this.job.finish) {
          this.job.text = this.value();
          this.job.finish = true;
        } else this.queue.push({ id: newDraftId(), text: this.value() });
        this.clearInput();
        this.backup();
      }
      return;
    }
    if (!this.value().trim()) return;
    if (this.heading() && !this.heading()!.title) return;
    if (noteFields(this.value()).description.length > 50000) {
      this.error.set('Cette note dépasse 50 000 caractères. Séparez-la en plusieurs lignes.');
      return;
    }
    this.job = { id: this.failedId ?? newDraftId(), text: this.value(), finish: next };
    this.failedId = undefined;
    this.cancelAfter = false;
    if (next) this.clearInput();
    this.saving.set(true);
    this.error.set('');
    this.backup();
    try {
      while (this.job) {
        const job = this.job;
        const fields = noteFields(job.text);
        const initialHeading = parseHeading(job.text);
        const anchor = this.currentAnchor ?? this.anchorId();
        const sectionId = this.currentSection ?? this.sectionId();
        let task: Task | undefined;
        let headingResult: HeadingResult | undefined;
        const placement = anchor
          ? {
              [this.currentAnchor || this.side() === 'after' ? 'afterTaskId' : 'beforeTaskId']:
                anchor,
            }
          : {};
        if (initialHeading) {
          if (!initialHeading.title) throw new Error('Titre manquant.');
          headingResult = await this.api.send<HeadingResult>(
            'POST',
            `/sections/${sectionId}/headings`,
            { ...initialHeading, listId: this.listId(), clientId: job.id, ...placement },
          );
        } else {
          task = await this.api.send<Task>('POST', `/sections/${sectionId}/tasks`, {
            ...fields,
            clientId: job.id,
            ...placement,
          });
          const updatedHeading = parseHeading(job.text);
          if (updatedHeading?.title)
            headingResult = await this.api.send<HeadingResult>(
              'POST',
              `/sections/${sectionId}/headings`,
              {
                ...updatedHeading,
                listId: this.listId(),
                clientId: job.id,
                sourceTaskId: task.id,
                expectedUpdatedAt: task.updatedAt,
              },
            );
        }
        if (headingResult) {
          this.currentSection = headingResult.sectionId;
          this.currentAnchor = undefined;
        } else this.currentAnchor = task!.id;
        const input = this.input?.nativeElement;
        const focused = !!input && input === input.ownerDocument.activeElement;
        const caret = job.finish ? job.text.length : (input?.selectionStart ?? this.value().length);
        const following = this.queue.shift();
        const text = job.finish ? job.text : this.value();
        const final = !following;
        const carry =
          job.finish && final && (focused || headingResult) && !this.cancelAfter
            ? this.value()
            : undefined;
        if (!job.finish || (final && (focused || headingResult))) this.clearInput();
        this.job = following ? { ...following, finish: true } : undefined;
        this.backup();
        if (carry) {
          try {
            const target = headingResult
              ? `padtodo.new.${headingResult.sectionId}.end.after`
              : `padtodo.new.${task!.sectionId}.${task!.id}.after`;
            localStorage.setItem(target, JSON.stringify({ text: carry }));
          } catch {}
        }
        if (!this.dead) {
          if (headingResult)
            this.headingCommitted.emit({
              result: headingResult,
              focused: final && focused,
              next: final && focused && !this.cancelAfter,
              carry,
            });
          else
            this.committed.emit({
              task: task!,
              text,
              next: job.finish && final && focused && !this.cancelAfter,
              focused: final && focused,
              caret,
              carry,
            });
        }
      }
    } catch (error) {
      // Keep both the submitted line and all subsequent keystrokes if a request fails.
      this.value.set(
        [this.job?.text, ...this.queue.map((job) => job.text), this.value()]
          .filter(Boolean)
          .join('\n'),
      );
      this.failedId = this.job?.id;
      this.job = undefined;
      this.queue = [];
      const e = error as { error?: { error?: { message?: string } } };
      this.error.set(
        e.error?.error?.message ?? 'Connexion interrompue. Votre saisie est conservée.',
      );
      this.backup();
    } finally {
      this.saving.set(false);
      if (!this.job && !this.value().trim()) {
        this.currentAnchor = undefined;
        this.currentSection = undefined;
      }
      if (!this.dead && this.value().trim() && !this.error() && !this.heading())
        this.timer = setTimeout(() => void this.commit(false), 850);
    }
  }
  private storageKey() {
    return `padtodo.new.${this.sectionId()}.${this.anchorId() ?? 'end'}.${this.side()}`;
  }
  private backup() {
    if (!this.ready) return;
    try {
      const text = [
        this.job?.finish ? this.job.text : undefined,
        ...this.queue.map((job) => job.text),
        this.value(),
      ]
        .filter(Boolean)
        .join('\n');
      if (text)
        localStorage.setItem(
          this.storageKey(),
          JSON.stringify({ text, id: this.job?.id ?? this.failedId }),
        );
      else localStorage.removeItem(this.storageKey());
    } catch {}
  }
}
