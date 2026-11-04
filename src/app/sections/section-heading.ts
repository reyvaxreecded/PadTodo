import {
  Component,
  input,
  output,
  signal,
  computed,
  effect,
  inject,
  afterNextRender,
  DestroyRef,
  ElementRef,
  ViewChild,
} from '@angular/core';
import { TextFieldModule } from '@angular/cdk/text-field';
import { Api } from '../core/api';
import type { Section } from '../shared/models';
import { headingSize, parseHeading } from '../tasks/note-text';
@Component({
  selector: 'app-section-heading',
  imports: [TextFieldModule],
  template: `
    @if (editing()) {
      <textarea
        #editor
        cdkTextareaAutosize
        class="heading-input"
        aria-label="Nouveau titre de la section"
        [style.font-size.px]="size()"
        [style.--mobile-size]="mobileSize() + 'px'"
        [value]="text()"
        (input)="write($event)"
        (keydown)="key($event)"
        (blur)="leave($event)"
        rows="1"
        maxlength="167"
      ></textarea>
    } @else {
      <span
        role="heading"
        [attr.aria-level]="base()?.level ?? section().level"
        [attr.aria-label]="base()?.title ?? section().title"
        [style.font-size.px]="size()"
        [style.--mobile-size]="mobileSize() + 'px'"
        ><button
          class="heading-button"
          (click)="edit()"
          title="Cliquer pour modifier le titre · # pour changer le niveau"
        >
          {{ base()?.title ?? section().title }}
        </button></span
      >
    }
    @if (editing() && saving()) {
      <small role="status">Enregistrement…</small>
    }
    @if (error()) {
      <div class="heading-error" role="status">
        {{ error() }}
        @if (conflict()) {
          <button (mousedown)="$event.preventDefault()" (click)="resolve(true)">
            Conserver mon titre</button
          ><button (mousedown)="$event.preventDefault()" (click)="resolve(false)">
            Utiliser le titre partagé
          </button>
        } @else {
          <button (mousedown)="$event.preventDefault()" (click)="save()">Réessayer</button>
        }
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
        flex: 1;
      }
      span,
      .heading-input {
        display: block;
        font-weight: 700;
        line-height: 1.35;
        letter-spacing: -0.3px;
        overflow-wrap: anywhere;
        margin: 0;
        text-align: left;
      }
      .heading-button {
        display: block;
        width: 100%;
        text-align: left;
        font: inherit;
        line-height: inherit;
        letter-spacing: inherit;
        color: inherit;
        background: none;
        border: 0;
        border-radius: 4px;
        padding: 0;
        cursor: text;
        overflow-wrap: anywhere;
      }
      .heading-button:hover {
        background: var(--hover);
      }
      .heading-button:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 4px;
      }
      .heading-input {
        width: 100%;
        padding: 0;
        resize: none;
        border: 0;
        border-radius: 3px;
        background: var(--hover);
        outline: none;
        overflow: hidden !important;
        box-shadow: 0 2px 0 var(--brand);
      }
      .heading-input:focus-visible {
        outline: none;
      }
      small {
        font-size: 11px;
        font-weight: 400;
        color: var(--muted);
        display: block;
        margin-top: 4px;
      }
      .heading-error {
        font-size: 11px;
        color: var(--red);
        line-height: 1.5;
        margin-top: 7px;
      }
      .heading-error button {
        background: none;
        border: 0;
        color: inherit;
        text-decoration: underline;
        font-size: inherit;
        padding: 4px 5px 4px 0;
      }
      @media (max-width: 600px) {
        span,
        .heading-input {
          font-size: var(--mobile-size) !important;
          line-height: 1.4;
          letter-spacing: -0.2px;
        }
      }
    `,
  ],
})
export class SectionHeading {
  section = input.required<Section>();
  changed = output<Section>();
  continueWriting = output();
  base = signal<Section | null>(null);
  text = signal('');
  editing = signal(false);
  saving = signal(false);
  error = signal('');
  conflict = signal(false);
  private api = inject(Api);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private destroy = inject(DestroyRef);
  @ViewChild('editor') editor?: ElementRef<HTMLTextAreaElement>;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pending: Promise<boolean> | undefined;
  private ready = false;
  fields = computed(() => {
    const heading = parseHeading(this.text());
    return {
      title: heading ? heading.title : this.text().trim(),
      level: heading?.level ?? this.base()?.level ?? this.section().level,
    };
  });
  dirty = computed(
    () =>
      !!this.base() &&
      (this.fields().title !== this.base()!.title || this.fields().level !== this.base()!.level),
  );
  size = () =>
    headingSize(
      this.editing() ? this.fields().level : (this.base()?.level ?? this.section().level),
    );
  mobileSize = () => Math.max(13, this.size() - 3);
  constructor() {
    effect(() => {
      const incoming = this.section();
      const old = this.base();
      if (old && incoming.updatedAt <= old.updatedAt) return;
      const same = !!old && incoming.title === old.title && incoming.level === old.level;
      const dirty = this.dirty();
      if (!old || (!this.saving() && (!dirty || same))) {
        const replace = !old || !this.editing() || (!dirty && !same);
        this.base.set(incoming);
        if (replace) this.text.set(incoming.title);
      }
    });
    afterNextRender(() => {
      this.ready = true;
      try {
        const raw = localStorage.getItem(this.storageKey());
        if (raw) {
          const draft = JSON.parse(raw) as {
            text: string;
            updatedAt: string;
            title?: string;
            level?: number;
          };
          if (typeof draft.text === 'string') {
            this.text.set(draft.text);
            this.base.update((b) =>
              b
                ? {
                    ...b,
                    updatedAt: draft.updatedAt,
                    title: draft.title ?? b.title,
                    level: draft.level ?? b.level,
                  }
                : b,
            );
            this.editing.set(true);
            this.schedule();
          }
        }
      } catch {}
      const retry = () => void this.save();
      window.addEventListener('online', retry);
      this.destroy.onDestroy(() => window.removeEventListener('online', retry));
    });
    this.destroy.onDestroy(() => {
      clearTimeout(this.timer);
      if (this.dirty()) void this.save();
    });
  }
  edit() {
    if (!this.editing()) {
      this.text.set(this.base()?.title ?? this.section().title);
      this.editing.set(true);
    }
    setTimeout(() => {
      const el = this.editor?.nativeElement;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    }, 0);
  }
  write(event: Event) {
    this.text.set((event.target as HTMLTextAreaElement).value);
    if (!this.conflict()) this.error.set('');
    this.backup();
    this.schedule();
  }
  private schedule() {
    clearTimeout(this.timer);
    if (!this.conflict()) this.timer = setTimeout(() => void this.save(), 650);
  }
  async save(): Promise<boolean> {
    clearTimeout(this.timer);
    if (this.pending) {
      const ok = await this.pending;
      return ok && this.dirty() ? this.save() : ok;
    }
    if (!this.dirty()) return true;
    const fields = this.fields();
    if (!fields.title) return false;
    if (fields.title.length > 160) {
      this.error.set('Le titre peut contenir 160 caractères maximum.');
      return false;
    }
    if (this.conflict()) return false;
    const reference = this.base()!;
    this.saving.set(true);
    this.pending = (async () => {
      try {
        let updated: Section | undefined;
        let version = reference;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            updated = await this.api.send<Section>('PATCH', '/sections/' + reference.id, {
              ...fields,
              expectedUpdatedAt: version.updatedAt,
            });
            break;
          } catch (error) {
            if ((error as { status?: number }).status !== 409 || attempt === 2) throw error;
            const list = await this.api.list(reference.listId);
            const latest = list.sections.find((s) => s.id === reference.id);
            if (!latest || latest.title !== version.title || latest.level !== version.level)
              throw error;
            version = latest;
          }
        }
        if (!updated) return false;
        const saved = { ...reference, ...updated };
        this.base.set(saved);
        if (!this.editing()) this.text.set(saved.title);
        this.error.set('');
        if (!this.dirty()) this.clearBackup();
        else this.backup();
        if (!this.destroy.destroyed) this.changed.emit(saved);
        return true;
      } catch (error) {
        this.conflict.set((error as { status?: number }).status === 409);
        this.error.set(
          this.conflict()
            ? 'Ce titre a changé ailleurs. Votre saisie est conservée.'
            : 'Enregistrement impossible. Votre titre est conservé ici.',
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
  key(event: KeyboardEvent) {
    if (event.isComposing) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      void this.finish(true);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.cancel();
    } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void this.save();
    }
  }
  async finish(next = false) {
    if (!this.text().trim()) {
      this.cancel();
      return;
    }
    if (await this.save()) {
      this.editing.set(false);
      if (next) this.continueWriting.emit();
    }
  }
  leave(event: FocusEvent) {
    if (this.host.nativeElement.contains(event.relatedTarget as Node | null)) return;
    void this.save().then((ok) => {
      if (!this.text().trim()) this.cancel();
      else if (
        ok &&
        !this.host.nativeElement.contains(this.host.nativeElement.ownerDocument.activeElement)
      )
        this.editing.set(false);
    });
  }
  cancel() {
    clearTimeout(this.timer);
    this.text.set(this.base()?.title ?? this.section().title);
    this.editing.set(false);
    this.error.set('');
    this.conflict.set(false);
    this.clearBackup();
  }
  async resolve(keepMine: boolean) {
    try {
      const list = await this.api.list(this.section().listId);
      const latest = list.sections.find((s) => s.id === this.section().id);
      if (!latest) return;
      this.base.set(latest);
      this.conflict.set(false);
      this.error.set('');
      if (keepMine) await this.save();
      else {
        this.text.set(latest.title);
        this.clearBackup();
      }
    } catch {
      this.error.set('Impossible de récupérer le titre partagé.');
    }
  }
  private storageKey() {
    return 'padtodo.heading-draft.' + this.section().id;
  }
  private backup() {
    if (!this.ready) return;
    try {
      localStorage.setItem(
        this.storageKey(),
        JSON.stringify({
          text: this.text(),
          updatedAt: this.base()?.updatedAt,
          title: this.base()?.title,
          level: this.base()?.level,
        }),
      );
    } catch {}
  }
  private clearBackup() {
    if (!this.ready) return;
    try {
      localStorage.removeItem(this.storageKey());
    } catch {}
  }
}
