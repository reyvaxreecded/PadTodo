import {
  Component,
  input,
  output,
  signal,
  inject,
  effect,
  afterNextRender,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { TextFieldModule } from '@angular/cdk/text-field';
import { TaskDraft } from './task-draft';
import {
  noteFields,
  editingFields,
  parseHeading,
  headingSize,
  type ContinueLine,
} from './note-text';
import { FormsModule } from '@angular/forms';
import { CdkDragHandle } from '@angular/cdk/drag-drop';
import { Icon } from '../shared/icon';
import {
  type Task,
  type Category,
  type HeadingIntent,
  STATUS,
  PRIORITY,
  STATUSES,
  PRIORITIES,
} from '../shared/models';
@Component({
  selector: 'app-task-row',
  standalone: true,
  host: { '[class.is-complete]': "task().status === 'DONE'", '[attr.data-task-id]': 'task().id' },
  imports: [Icon, FormsModule, CdkDragHandle, TextFieldModule],
  providers: [TaskDraft],
  template: `
    <button
      class="drag-handle icon-button"
      cdkDragHandle
      aria-label="Déplacer la tâche"
      [disabled]="disabled()"
    >
      <app-icon name="grip" />
    </button>
    <button
      class="status-control"
      [class]="'status-control ' + task().status"
      [attr.aria-label]="'Statut : ' + STATUS[task().status] + '. Passer au statut suivant'"
      [disabled]="disabled()"
      [title]="STATUS[task().status] + ' · Cliquer pour changer de statut'"
      (click)="cycle()"
    >
      @if (task().status === 'DONE') {
        <app-icon name="check" />
      } @else if (task().status === 'IN_PROGRESS') {
        <span></span>
      }
    </button>
    <div class="note-content" (focusout)="leave($event)">
      @if (editing()) {
        <textarea
          #titleInput
          cdkTextareaAutosize
          class="task-title title-input"
          aria-label="Titre de la tâche"
          [attr.id]="'edit-' + task().id"
          [value]="draft.title()"
          [style.font-size.px]="heading() ? headingSize(heading()!.level) : null"
          [style.font-weight]="heading() ? 700 : null"
          (input)="editTitle($event)"
          (keydown)="titleKey($event)"
          rows="1"
        ></textarea>
      } @else {
        <button
          class="task-title"
          [class.completed]="task().status === 'DONE'"
          title="Cliquer pour écrire · Entrée pour continuer"
          (click)="focusTitle()"
        >
          {{ draft.title() }}
        </button>
      }
      @if (editing() && (bodyOpen() || draft.description())) {
        <textarea
          #bodyInput
          cdkTextareaAutosize
          class="note-body"
          aria-label="Texte de la note"
          [value]="draft.description()"
          (input)="editBody($event)"
          (keydown)="bodyKey($event)"
          placeholder="Contexte, décisions, notes de réunion…"
          rows="2"
          maxlength="50000"
        ></textarea>
      } @else if (draft.description()) {
        <button
          class="note-preview"
          title="Modifier la note"
          (click)="focusBody()"
          [textContent]="draft.description()"
        ></button>
      }
      @if (editing() && draft.saving()) {
        <span class="write-status" role="status">Enregistrement…</span>
      }
      @if (draft.error()) {
        <div class="write-error" role="status">
          {{ draft.error() }}
          @if (draft.conflict()) {
            <button (mousedown)="$event.preventDefault()" (click)="draft.resolve(true)">
              Conserver mon texte
            </button>
            <button (mousedown)="$event.preventDefault()" (click)="draft.resolve(false)">
              Utiliser la version partagée
            </button>
          } @else {
            <button (mousedown)="$event.preventDefault()" (click)="draft.flush()">Réessayer</button>
          }
        </div>
      }
    </div>
    <button
      class="icon-button rename-button"
      aria-label="Renommer la tâche"
      [disabled]="disabled()"
      (click)="focusTitle()"
    >
      <app-icon name="pencil" />
    </button>
    <select
      class="row-category"
      aria-label="Catégorie"
      [disabled]="disabled()"
      [ngModel]="task().categoryId ?? ''"
      (ngModelChange)="taskChange.emit({ categoryId: $event || null })"
      [style.--category-color]="category()?.color"
    >
      <option value="">Sans catégorie</option>
      @for (c of categories(); track c.id) {
        <option [value]="c.id">{{ c.name }}</option>
      }
    </select>
    <select
      class="row-priority"
      [class]="'row-priority ' + task().priority"
      aria-label="Priorité"
      [disabled]="disabled()"
      [ngModel]="task().priority"
      (ngModelChange)="taskChange.emit({ priority: $event })"
    >
      @for (p of PRIORITIES; track p) {
        <option [value]="p">{{ PRIORITY[p] }}</option>
      }
    </select>
    <button
      class="icon-button row-open"
      aria-label="Ouvrir les détails de la tâche"
      (click)="openDetails()"
    >
      <app-icon name="more" />
    </button>
  `,
  styles: [
    `
      .note-content {
        flex: 1;
        min-width: 0;
        padding: 1px 0;
      }
      .note-content .task-title {
        width: 100%;
        display: block;
        line-height: 1.6;
        text-align: left;
        white-space: normal;
        overflow-wrap: anywhere;
        text-overflow: initial;
        cursor: text;
        padding: 12px 0;
      }
      .title-input {
        resize: none;
        outline: 0;
        border: 0;
        border-radius: 0;
        min-width: 0;
        overflow: hidden !important;
        font-family: inherit;
      }
      .title-input:focus-visible {
        outline: none;
      }
      .note-content:focus-within {
        background: var(--hover);
      }
      .note-body,
      .note-preview {
        display: block;
        width: 100%;
        resize: none;
        border: 0;
        background: transparent;
        border-radius: 0;
        text-align: left;
        padding: 0 0 12px;
        color: var(--secondary);
        font-size: 13px;
        line-height: 1.65;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        font-weight: 400;
        cursor: text;
      }
      .note-body:focus-visible {
        outline: none;
      }
      .note-preview {
        max-height: 170px;
        overflow: auto;
      }
      .write-status {
        display: block;
        color: var(--muted);
        font-size: 11px;
        padding: 0 0 9px;
      }
      .write-error {
        font-size: 12px;
        line-height: 1.6;
        color: var(--red);
        padding: 0 0 10px;
      }
      .write-error button {
        background: none;
        border: 0;
        text-decoration: underline;
        font-size: 11px;
        color: inherit;
        padding: 4px 6px 4px 0;
      }
      :host:focus-within {
        box-shadow: inset 3px 0 var(--brand);
      }
      @media (max-width: 600px) {
        .note-content {
          grid-column: 2;
          grid-row: 1;
        }
        .note-content .task-title {
          padding: 0;
          font-size: 13px;
        }
        .note-body,
        .note-preview {
          font-size: 12px;
          padding-top: 5px;
        }
        .note-body:focus-visible {
          outline: none;
        }
      }
    `,
    `
      :host {
        display: flex;
        align-items: center;
        gap: 12px;
        min-height: 51px;
        padding: 0 12px 0 0;
        border-bottom: 1px solid var(--line);
        position: relative;
        background: var(--surface);
      }
      .status-control,
      .drag-handle,
      .row-category,
      .row-priority,
      .rename-button,
      .row-open {
        align-self: flex-start;
        margin-top: 13px;
      }
      :host:hover {
        background: var(--hover);
      }
      .drag-handle {
        opacity: 0;
        width: 20px !important;
        cursor: grab;
      }
      :host:hover .drag-handle,
      :host:focus-within .drag-handle {
        opacity: 1;
      }
      .task-title {
        flex: 1;
        text-align: left;
        min-width: 60px;
        font-size: 14px;
        font-weight: 500;
        border: 0;
        background: none;
        padding: 13px 0;
        color: var(--text);
        cursor: text;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .completed {
        text-decoration: line-through;
        color: var(--muted);
      }
      .rename-button {
        opacity: 0;
        width: 24px !important;
        height: 24px !important;
      }
      :host:hover .rename-button,
      :host:focus-within .rename-button {
        opacity: 1;
      }
      .rename-button app-icon {
        width: 12px;
        height: 12px;
      }
      .description-hint {
        color: var(--muted);
        width: 14px;
      }
      .row-category,
      .row-priority {
        border: 1px solid var(--line);
        border-radius: 5px;
        background: transparent;
        font-size: 12px;
        padding: 4px 7px;
        max-width: 120px;
        color: var(--secondary);
      }
      .row-category {
        border-left: 3px solid var(--category-color, var(--line));
        background: var(--page);
      }
      .row-priority {
        width: 96px;
        border-color: transparent;
      }
      .HIGH {
        color: var(--orange);
        background: color-mix(in srgb, var(--orange) 9%, var(--surface));
      }
      .CRITICAL {
        color: var(--red);
        background: color-mix(in srgb, var(--red) 10%, var(--surface));
        font-weight: 600;
      }
      .LOW {
        color: var(--muted);
      }
      .inline-edit {
        position: absolute;
        left: 65px;
        width: 45%;
        z-index: 2;
      }
      .row-open {
        color: var(--muted);
      }
      @media (max-width: 650px) {
        .row-category {
          max-width: 90px;
        }
        .description-hint,
        .drag-handle {
          display: none;
        }
        .row-priority {
          width: 70px;
        }
        :host {
          gap: 7px;
        }
      }
    `,
    `
      @media (max-width: 600px) {
        :host {
          display: grid;
          grid-template-columns: 19px minmax(0, 1fr) 24px;
          grid-template-rows: auto 24px;
          gap: 6px 8px;
          padding: 8px 8px 8px 0;
          min-height: 67px;
        }
        .status-control {
          grid-column: 1;
          grid-row: 1;
          align-self: start;
          margin-top: 3px;
        }
        .task-title {
          grid-column: 2;
          grid-row: 1;
          min-width: 0;
          padding: 0;
          font-size: 13px;
          white-space: normal;
          line-height: 1.5;
          overflow-wrap: anywhere;
          text-overflow: initial;
        }
        .rename-button {
          display: none;
        }
        .row-open {
          grid-column: 3;
          grid-row: 1;
          align-self: start;
          width: 24px;
          height: 24px;
        }
        .row-category,
        .row-priority,
        .row-open {
          margin-top: 0;
        }
        .row-category {
          grid-column: 2;
          grid-row: 2;
          justify-self: start;
          max-width: 110px;
          font-size: 11px;
        }
        .row-priority {
          grid-column: 2;
          grid-row: 2;
          justify-self: end;
          width: 90px;
          font-size: 11px;
        }
        .inline-edit {
          left: 25px;
          width: 70%;
          top: 7px;
        }
      }
      @media (max-width: 600px) {
        @container section (max-width: 280px) {
          :host {
            grid-template-rows: auto 24px 24px;
          }
          .row-priority {
            grid-row: 3;
            justify-self: start;
          }
        }
      }
    `,
  ],
})
export class TaskRow {
  task = input.required<Task>();
  categories = input<Category[]>([]);
  disabled = input(false);
  open = output<Task>();
  taskChange = output<Record<string, unknown>>();
  deleteLine = input.required<(task: Task) => Promise<boolean>>();
  makeHeading = input.required<(intent: HeadingIntent) => Promise<boolean>>();
  private headingPending: Promise<void> | undefined;
  heading = () => parseHeading(this.draft.title());
  headingSize = headingSize;
  editing = signal(false);
  bodyOpen = signal(false);
  draft = inject(TaskDraft);
  continueLine = output<ContinueLine>();
  navigate = output<'previous' | 'next'>();
  remove = output<Task>();
  @ViewChild('titleInput') titleInput?: ElementRef<HTMLTextAreaElement>;
  @ViewChild('bodyInput') bodyInput?: ElementRef<HTMLTextAreaElement>;
  constructor() {
    this.draft.onEmpty = (task) => this.deleteLine()(task);
    effect(() => this.draft.receive(this.task()));
    afterNextRender(() => this.draft.recover());
  }
  clickTitle(event: MouseEvent) {
    const button = event.currentTarget as HTMLElement;
    let offset = this.draft.title().length;
    const caret = button.ownerDocument.caretPositionFromPoint?.(event.clientX, event.clientY);
    if (event.detail && caret && button.contains(caret.offsetNode)) {
      const range = button.ownerDocument.createRange();
      range.selectNodeContents(button);
      range.setEnd(caret.offsetNode, caret.offset);
      offset = range.toString().length - (button.textContent?.indexOf(this.draft.title()) ?? 0);
    }
    this.focusNote(
      this.draft.title() + (this.draft.description() ? '\n' + this.draft.description() : ''),
      offset,
    );
  }
  focusNote(text: string, caret: number) {
    const fields = editingFields(text);
    this.draft.edit(fields.title, fields.description);
    this.editing.set(true);
    const newline = text.indexOf('\n');
    const bodyStart = newline >= 0 && newline < 300 ? newline + 1 : 300;
    const inBody = !!fields.description && caret > fields.title.length;
    if (inBody) this.bodyOpen.set(true);
    setTimeout(() => {
      const el = inBody ? this.bodyInput?.nativeElement : this.titleInput?.nativeElement;
      if (el) {
        el.focus();
        const pos = Math.max(0, Math.min(el.value.length, inBody ? caret - bodyStart : caret));
        el.setSelectionRange(pos, pos);
        el.scrollIntoView({ block: 'nearest' });
      }
    }, 0);
  }
  focusTitle(position: 'start' | 'end' = 'end', text?: string) {
    if (text !== undefined) {
      const f = noteFields(text);
      this.draft.edit(f.title, f.description);
      if (f.description) this.bodyOpen.set(true);
    }
    this.editing.set(true);
    setTimeout(() => {
      const el = this.titleInput?.nativeElement;
      if (el) {
        el.focus();
        const pos = position === 'start' ? 0 : el.value.length;
        el.setSelectionRange(pos, pos);
        el.scrollIntoView({ block: 'nearest' });
      }
    }, 0);
  }
  focusBody() {
    this.editing.set(true);
    this.bodyOpen.set(true);
    setTimeout(() => {
      const el = this.bodyInput?.nativeElement;
      el?.focus();
      if (el) el.setSelectionRange(el.value.length, el.value.length);
    }, 0);
  }
  editTitle(event: Event) {
    const value = (event.target as HTMLTextAreaElement).value;
    const fields = noteFields(value);
    if (value.includes('\n') || value.length > 300) {
      this.draft.edit(
        fields.title,
        fields.description + (this.draft.description() ? '\n' + this.draft.description() : ''),
      );
      this.focusBody();
    } else this.draft.edit(value);
  }
  editBody(event: Event) {
    this.draft.edit(this.draft.title(), (event.target as HTMLTextAreaElement).value);
  }
  titleKey(event: KeyboardEvent) {
    if (event.isComposing) return;
    if (
      this.heading() &&
      ((event.key === 'Enter' && !event.shiftKey) ||
        ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's'))
    ) {
      event.preventDefault();
      void this.submitHeading(event.key === 'Enter', true);
      return;
    }
    const el = event.target as HTMLTextAreaElement;
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key === 'Enter') {
      event.preventDefault();
      void this.toggleDone();
      return;
    }
    if (mod && event.shiftKey && event.key === 'Backspace') {
      event.preventDefault();
      void this.removeLine();
      return;
    }
    if (mod && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void this.draft.flush();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (event.shiftKey) {
        this.focusBody();
        return;
      }
      if (!this.draft.title().trim() && !this.draft.description().trim()) {
        void this.removeLine();
        return;
      }
      void this.draft.flush();
      this.continueLine.emit({ side: el.selectionStart === 0 ? 'before' : 'after', text: '' });
    } else if (event.key === 'Backspace' && !el.value && !this.draft.description().trim()) {
      event.preventDefault();
      void this.removeLine();
    } else if (event.key === 'ArrowUp' && el.selectionStart === 0 && el.selectionEnd === 0) {
      event.preventDefault();
      this.navigate.emit('previous');
    } else if (
      event.key === 'ArrowDown' &&
      el.selectionStart === el.value.length &&
      el.selectionEnd === el.value.length
    ) {
      event.preventDefault();
      this.navigate.emit('next');
    } else if (event.key === 'Escape') {
      event.preventDefault();
      void this.finish();
    }
  }
  bodyKey(event: KeyboardEvent) {
    if (event.isComposing) return;
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key === 'Enter') {
      event.preventDefault();
      void this.toggleDone();
    } else if (mod && event.shiftKey && event.key === 'Backspace') {
      event.preventDefault();
      void this.removeLine();
    } else if (mod && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void this.draft.flush();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.focusTitle();
    }
  }
  async submitHeading(next: boolean, focused: boolean) {
    if (this.headingPending) return this.headingPending;
    this.headingPending = (async () => {
      const heading = this.heading();
      if (!heading?.title) return;
      await this.draft.waitForSave();
      const task = this.draft.base() ?? this.task();
      const ok = await this.makeHeading()({
        sectionId: task.sectionId,
        sourceTaskId: task.id,
        expectedUpdatedAt: task.updatedAt,
        text:
          this.draft.title() + (this.draft.description() ? '\n' + this.draft.description() : ''),
        next,
        focused,
      });
      if (ok) this.draft.discard();
    })().finally(() => (this.headingPending = undefined));
    return this.headingPending;
  }
  async removeLine() {
    const empty = !this.draft.title().trim() && !this.draft.description().trim();
    if (empty) {
      await this.draft.flush();
      return;
    }
    if (await this.draft.flush()) this.remove.emit(this.draft.base() ?? this.task());
  }
  async toggleDone() {
    if (await this.draft.flush())
      this.taskChange.emit({ status: this.task().status === 'DONE' ? 'TODO' : 'DONE' });
  }
  async openDetails() {
    if (await this.draft.flush()) this.open.emit(this.draft.base() ?? this.task());
  }
  async finish() {
    if (await this.draft.flush()) {
      this.editing.set(false);
      this.bodyOpen.set(false);
    }
  }
  leave(event: FocusEvent) {
    const root = event.currentTarget as HTMLElement;
    if (root.contains(event.relatedTarget as Node | null)) return;
    if (this.heading()?.title) void this.submitHeading(false, false);
    else void this.draft.flush();
  }
  STATUS = STATUS;
  PRIORITY = PRIORITY;
  PRIORITIES = PRIORITIES;
  category() {
    return this.categories().find((c) => c.id === this.task().categoryId);
  }
  cycle() {
    this.taskChange.emit({ status: STATUSES[(STATUSES.indexOf(this.task().status) + 1) % 3] });
  }
}
