import { moveItemInArray } from '@angular/cdk/drag-drop';
/** Compute a new order without mutating the server snapshot. */
export function reordered<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  moveItemInArray(next, from, to);
  return next;
}
