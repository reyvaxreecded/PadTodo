import { Component, input, output } from '@angular/core';
import { Icon } from '../shared/icon';
import type { Category } from '../shared/models';
@Component({
  selector: 'app-category-manager',
  imports: [Icon],
  template: `
    <section class="category-manager" aria-label="Gestion des catégories">
      <div>
        <h2>Catégories du projet</h2>
        <p>Un repère commun pour mieux organiser vos tâches.</p>
      </div>
      <div class="category-chips">
        @for (c of categories(); track c.id) {
          <span class="category-chip" [style.--category-color]="c.color"
            ><button (click)="edit.emit(c)">{{ c.name }}</button
            ><button aria-label="Supprimer la catégorie" (click)="remove.emit(c)">
              <app-icon name="close" /></button
          ></span>
        }
        <button class="button subtle" (click)="create.emit()">
          <app-icon name="plus" /> Créer une catégorie
        </button>
      </div>
    </section>
  `,
  styles: [
    `
      .category-manager {
        background: var(--hover);
        border: 1px solid var(--line);
        padding: 18px;
        border-radius: 7px;
        margin-bottom: 20px;
      }
      .category-manager h2 {
        font-size: 14px;
        margin-bottom: 5px;
      }
      .category-manager p {
        font-size: 12px;
        color: var(--muted);
      }
      .category-chips {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 14px;
        align-items: center;
      }
      .category-chip {
        display: flex;
        align-items: center;
        gap: 6px;
        border: 1px solid var(--line);
        border-radius: 6px;
        border-left: 3px solid var(--category-color);
        padding: 3px 8px;
        background: var(--surface);
      }
      .category-chip button {
        font-size: 12px;
        padding: 3px 0;
        background: none;
        border: none;
        color: inherit;
      }
      .category-chip app-icon {
        height: 12px;
        width: 12px;
      }
      .category-chips > .button {
        font-size: 12px;
      }
    `,
  ],
})
export class CategoryManager {
  categories = input<Category[]>([]);
  edit = output<Category>();
  remove = output<Category>();
  create = output();
}
