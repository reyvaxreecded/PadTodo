import { Routes } from '@angular/router';
const workspace = () => import('./lists/workspace').then((m) => m.Workspace);
export const routes: Routes = [
  { path: '', loadComponent: workspace },
  { path: 'lists/:id', loadComponent: workspace },
  { path: '**', redirectTo: '' },
];
