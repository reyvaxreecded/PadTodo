import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matches, emptyFilters, isFiltered } from '../src/app/shared/filters';
import type { Task } from '../src/app/shared/models';
const task = {
  title: 'Refactoriser le service',
  description: 'Backend PostgreSQL',
  status: 'IN_PROGRESS',
  priority: 'HIGH',
  categoryId: 'backend',
} as Task;
test('filtres : AND entre groupes, OR dans un groupe, titre et description', () => {
  assert.equal(
    matches(task, {
      ...emptyFilters(),
      statuses: ['TODO', 'IN_PROGRESS'],
      priorities: ['HIGH', 'CRITICAL'],
      categories: ['backend'],
    }),
    true,
  );
  assert.equal(
    matches(task, { ...emptyFilters(), statuses: ['DONE'], priorities: ['HIGH'] }),
    false,
  );
  assert.equal(matches(task, { ...emptyFilters(), search: '  POSTGRESQL ' }), true);
  assert.equal(matches(task, { ...emptyFilters(), search: 'absent' }), false);
  assert.equal(matches({ ...task, status: 'DONE' }, { ...emptyFilters(), hideDone: true }), false);
  assert.equal(
    matches({ ...task, categoryId: null }, { ...emptyFilters(), categories: ['none'] }),
    true,
  );
  assert.equal(isFiltered(emptyFilters()), false);
});
