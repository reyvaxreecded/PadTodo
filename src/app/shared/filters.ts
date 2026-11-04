import type { Task, Status, Priority } from './models';
export interface Filters {
  search: string;
  statuses: Status[];
  priorities: Priority[];
  categories: string[];
  hideDone: boolean;
}
export const emptyFilters = (): Filters => ({
  search: '',
  statuses: [],
  priorities: [],
  categories: [],
  hideDone: false,
});
export function matches(task: Task, filter: Filters): boolean {
  const text = (task.title + ' ' + task.description).toLocaleLowerCase('fr');
  return (
    (!filter.search.trim() || text.includes(filter.search.trim().toLocaleLowerCase('fr'))) &&
    (!filter.hideDone || task.status !== 'DONE') &&
    (!filter.statuses.length || filter.statuses.includes(task.status)) &&
    (!filter.priorities.length || filter.priorities.includes(task.priority)) &&
    (!filter.categories.length || filter.categories.includes(task.categoryId ?? 'none'))
  );
}
export function isFiltered(f: Filters) {
  return !!(
    f.search.trim() ||
    f.statuses.length ||
    f.priorities.length ||
    f.categories.length ||
    f.hideDone
  );
}
