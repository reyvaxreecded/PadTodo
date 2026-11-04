import { Component, output } from '@angular/core';
import { Icon } from '../shared/icon';
@Component({
  selector: 'app-writing-guide',
  imports: [Icon],
  template: `
    <div class="writing-bar">
      <span class="writing-hint"
        >Cliquez pour écrire. <span>La suite se fait au clavier.</span></span
      >
      <div class="writing-actions">
        <details>
          <summary>Raccourcis clavier <span>?</span></summary>
          <div class="shortcuts">
            <strong>Gardez le fil de la réunion</strong>
            <p><kbd># à ######</kbd> Espace + titre + Entrée : créer une section de niveau 1 à 6</p>
            <p><kbd>Entrée</kbd> Continuer sur une nouvelle ligne</p>
            <p><kbd>Maj ↵</kbd> Ajouter du contexte sous le titre</p>
            <p><kbd>⌘ / Ctrl ↵</kbd> Terminer ou rouvrir la tâche</p>
            <p><kbd>↑ / ↓</kbd> Changer de ligne en début / fin de texte</p>
            <p><kbd>⌫</kbd> Supprimer une ligne vide</p>
            <p><kbd>⌘ / Ctrl Maj ⌫</kbd> Supprimer la ligne</p>
            <p><kbd>⌘ / Ctrl Z</kbd> Annuler la dernière suppression, avant de retaper</p>
            <small>Sauvegarde automatique. Échap quitte l’édition.</small>
          </div>
        </details>
        <button class="button primary" (click)="start.emit()">
          <app-icon name="plus" /> Nouvelle note
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .writing-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        margin: 16px 0 4px;
      }
      .writing-hint {
        font-size: 12px;
        color: var(--secondary);
      }
      .writing-hint > span {
        color: var(--muted);
      }
      .writing-actions {
        display: flex;
        align-items: center;
        gap: 14px;
      }
      details {
        position: relative;
      }
      summary {
        list-style: none;
        cursor: pointer;
        font-size: 11px;
        color: var(--secondary);
        display: flex;
        gap: 6px;
        align-items: center;
      }
      summary::-webkit-details-marker {
        display: none;
      }
      summary > span {
        display: grid;
        place-items: center;
        width: 16px;
        height: 16px;
        border: 1px solid var(--line);
        border-radius: 4px;
        font-size: 10px;
      }
      .shortcuts {
        position: absolute;
        z-index: 20;
        right: 0;
        top: 28px;
        width: 365px;
        max-width: calc(100vw - 90px);
        border: 1px solid var(--line);
        border-radius: 10px;
        background: var(--surface);
        box-shadow: var(--shadow);
        padding: 18px;
        color: var(--secondary);
        font-size: 12px;
      }
      .shortcuts strong {
        display: block;
        color: var(--text);
        font-size: 13px;
        margin-bottom: 14px;
      }
      .shortcuts p {
        display: flex;
        align-items: center;
        gap: 10px;
        margin: 9px 0;
        line-height: 1.5;
      }
      .shortcuts kbd {
        font:
          10px ui-monospace,
          monospace;
        background: var(--page);
        border: 1px solid var(--line);
        border-radius: 4px;
        padding: 3px 5px;
        min-width: 85px;
        text-align: center;
        flex: none;
      }
      .shortcuts small {
        display: block;
        padding-top: 12px;
        border-top: 1px solid var(--line);
        font-size: 11px;
        line-height: 1.5;
      }
      .button {
        min-height: 34px;
        font-size: 12px;
      }
      @media (max-width: 850px) {
        .writing-hint > span {
          display: none;
        }
      }
      @media (max-width: 600px) {
        .writing-bar {
          margin-top: 13px;
          align-items: flex-start;
          flex-direction: column;
          gap: 10px;
        }
        .writing-actions {
          width: 100%;
          justify-content: space-between;
        }
        .shortcuts {
          right: auto;
          left: 0;
        }
        .writing-hint {
          font-size: 11px;
        }
        .shortcuts p {
          font-size: 11px;
        }
        .shortcuts kbd {
          min-width: 70px;
          font-size: 9px;
        }
      }
    `,
  ],
})
export class WritingGuide {
  start = output();
}
