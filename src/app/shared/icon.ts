import { Component, input } from '@angular/core';
const paths: Record<string, string> = {
  pencil: 'm16 3 5 5-12 12-6 1 1-6L16 3M14 5l5 5',
  plus: 'M12 5v14m-7-7h14',
  search: 'm21 21-4.4-4.4M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  chevron: 'm9 5 7 7-7 7',
  close: 'm6 6 12 12M6 18 18 6',
  settings:
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2',
  moon: 'M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1',
  panel: 'M3 4h18v16H3zM9 4v16',
  grip: 'M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01',
  check: 'm5 12 4 4L19 6',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  flag: 'M5 21V3m0 0c5-4 9 4 14 0v10c-5 4-9-4-14 0',
  copy: 'M9 9h12v12H9zM15 5V3H3v12h2',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
  text: 'M5 5h14M5 10h14M5 15h9M5 20h9',
  arrow: 'M5 12h14m-5-5 5 5-5 5',
  layers: 'm12 3 10 5-10 5L2 8l10-5M2 12l10 5 10-5M2 16l10 5 10-5',
  filter: 'M4 5h16M7 12h10m-7 7h4',
  refresh: 'M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 13 3M5 15a8 8 0 0 0 13 3',
  info: 'M12 11v6m0-10h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
};
@Component({
  selector: 'app-icon',
  standalone: true,
  template:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path [attr.d]="path()" /></svg>',
  styles: [
    ':host{display:inline-flex;width:18px;height:18px;flex:none;align-items:center}svg{width:100%;height:100%}',
  ],
})
export class Icon {
  name = input('plus');
  path = () => paths[this.name()] ?? paths['plus'];
}
