import { Component, input, output, effect } from '@angular/core';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { ReactiveFormsModule, FormControl, FormGroup, Validators } from '@angular/forms';
import { Icon } from '../shared/icon';
import {
  type Task,
  type Category,
  type Section,
  STATUS,
  PRIORITY,
  STATUSES,
  PRIORITIES,
} from '../shared/models';
@Component({
  selector: 'app-task-detail',
  imports: [ReactiveFormsModule, Icon, CdkTrapFocus],
  template: `
    <div class="drawer-scrim" (click)="close.emit()"></div>
    <aside
      class="task-drawer"
      cdkTrapFocus
      [cdkTrapFocusAutoCapture]="true"
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-detail-title"
      (keydown.escape)="close.emit()"
    >
      <header>
        <span><app-icon name="layers" /> DÉTAIL DE LA TÂCHE</span
        ><button class="icon-button" aria-label="Fermer les détails" (click)="close.emit()">
          <app-icon name="close" />
        </button>
      </header>
      <form [formGroup]="form" (ngSubmit)="submit()">
        <label class="sr-only" for="task-title">Titre</label
        ><textarea
          id="task-title"
          class="detail-title"
          formControlName="title"
          rows="3"
          maxlength="300"
        ></textarea>
        <div class="detail-fields">
          <label
            >Statut<select formControlName="status">
              @for (s of STATUSES; track s) {
                <option [value]="s">{{ STATUS[s] }}</option>
              }
            </select></label
          >
          <label
            >Priorité<select formControlName="priority">
              @for (p of PRIORITIES; track p) {
                <option [value]="p">{{ PRIORITY[p] }}</option>
              }
            </select></label
          >
          <label
            >Catégorie<select formControlName="categoryId">
              <option value="">Aucune catégorie</option>
              @for (c of categories(); track c.id) {
                <option [value]="c.id">{{ c.name }}</option>
              }
            </select></label
          >
          <label
            >Section<select formControlName="sectionId">
              @for (s of sections(); track s.id) {
                <option [value]="s.id">{{ s.title }}</option>
              }
            </select></label
          >
        </div>
        <label class="description-label" for="task-description">Description</label
        ><textarea
          id="task-description"
          class="detail-description"
          formControlName="description"
          rows="9"
          placeholder="Ajoutez du contexte, une piste technique, un lien…"
          maxlength="50000"
        ></textarea>
        @if (stale()) {
          <p class="notice">
            Cette tâche a changé sur un autre navigateur. Vos saisies sont conservées. Fermez puis
            rouvrez le panneau pour récupérer la dernière version.
          </p>
        }
        <button
          class="button primary full"
          type="submit"
          [disabled]="form.invalid || busy() || stale()"
        >
          {{ busy() ? 'Enregistrement…' : 'Enregistrer les modifications' }}
        </button>
      </form>
      <footer>
        <span>Créée le {{ date(task().createdAt) }}</span>
        <div>
          <button class="button subtle" [disabled]="busy()" (click)="duplicate.emit()">
            <app-icon name="copy" /> Dupliquer</button
          ><button
            class="icon-button danger"
            [disabled]="busy()"
            aria-label="Supprimer la tâche"
            (click)="remove.emit()"
          >
            <app-icon name="trash" />
          </button>
        </div>
      </footer>
    </aside>
  `,
  styles: [
    `
      .drawer-scrim {
        position: fixed;
        inset: 0;
        background: #121b1626;
        z-index: 30;
        backdrop-filter: blur(2px);
      }
      .task-drawer {
        position: fixed;
        right: 0;
        top: 0;
        bottom: 0;
        width: min(510px, 100vw);
        border-left: 3px solid var(--brand);
        animation: drawer-in 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
        background: var(--surface);
        z-index: 31;
        box-shadow: -8px 0 48px #0001;
        display: flex;
        flex-direction: column;
        padding: 24px 30px;
        overflow-y: auto;
      }
      header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 26px;
      }
      header span {
        display: flex;
        gap: 10px;
        align-items: center;
        font-size: 11px;
        letter-spacing: 1.5px;
        color: var(--muted);
      }
      form {
        flex: 1;
      }
      .detail-title {
        width: 100%;
        resize: vertical;
        font-family: inherit;
        font-size: 27px;
        line-height: 1.35;
        font-weight: 750;
        border: none;
        padding: 0;
        background: transparent;
        letter-spacing: -0.6px;
        min-height: 76px;
      }
      .detail-fields {
        display: grid;
        gap: 16px;
        border-top: 1px solid var(--line);
        border-bottom: 1px solid var(--line);
        padding: 24px 0;
        margin: 20px 0 26px;
      }
      .detail-fields label {
        display: grid;
        grid-template-columns: 100px 1fr;
        align-items: center;
        color: var(--muted);
        font-size: 13px;
      }
      .detail-fields select {
        width: 100%;
      }
      .description-label {
        font-size: 13px;
        font-weight: 600;
      }
      .detail-description {
        display: block;
        width: 100%;
        resize: vertical;
        margin: 12px 0 24px;
        line-height: 1.7;
      }
      footer {
        border-top: 1px solid var(--line);
        margin-top: 24px;
        padding-top: 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        color: var(--muted);
        font-size: 11px;
      }
      footer div {
        display: flex;
        gap: 8px;
        align-items: center;
      }
      .notice {
        font-size: 13px;
        color: var(--orange);
        line-height: 1.6;
      }
      @keyframes drawer-in {
        from {
          opacity: 0.5;
          transform: translateX(18px);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }
      @media (max-width: 600px) {
        .task-drawer {
          padding: 22px;
        }
        .detail-fields label {
          grid-template-columns: 85px minmax(0, 1fr);
        }
        footer {
          gap: 10px;
          flex-wrap: wrap;
        }
      }
    `,
  ],
})
export class TaskDetail {
  task = input.required<Task>();
  categories = input<Category[]>([]);
  sections = input<Section[]>([]);
  busy = input(false);
  stale = input(false);
  close = output();
  save = output<Record<string, unknown>>();
  duplicate = output();
  remove = output();
  STATUS = STATUS;
  PRIORITY = PRIORITY;
  STATUSES = STATUSES;
  PRIORITIES = PRIORITIES;
  form = new FormGroup({
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/\S/), Validators.maxLength(300)],
    }),
    description: new FormControl('', { nonNullable: true }),
    status: new FormControl('TODO', { nonNullable: true }),
    priority: new FormControl('MEDIUM', { nonNullable: true }),
    categoryId: new FormControl('', { nonNullable: true }),
    sectionId: new FormControl('', { nonNullable: true }),
  });
  constructor() {
    effect(() => {
      const t = this.task();
      this.form.reset({ ...t, categoryId: t.categoryId ?? '' });
    });
  }
  submit() {
    if (this.form.valid) {
      const v = this.form.getRawValue();
      this.save.emit({ ...v, categoryId: v.categoryId || null });
    }
  }
  date(value: string) {
    return new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(value));
  }
}
