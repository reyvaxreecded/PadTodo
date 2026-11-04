import { test } from 'node:test';
import assert from 'node:assert/strict';
import { noteFields } from '../src/app/tasks/note-text';
test('les notes collées conservent le texte au-delà du titre et les retours à la ligne', () => {
  assert.deepEqual(noteFields('  Décision\r\nContexte\rAction  '), {
    title: 'Décision',
    description: 'Contexte\nAction  ',
  });
  const long = 'a'.repeat(450) + '\nSuite';
  const fields = noteFields(long);
  assert.equal(fields.title.length, 300);
  assert.equal(fields.title + fields.description, long);
});

test('titres Markdown : niveaux 1 à 6, espace obligatoire et absence de faux positifs', async () => {
  const { parseHeading } = await import('../src/app/tasks/note-text');
  for (let level = 1; level <= 6; level++)
    assert.deepEqual(parseHeading('#'.repeat(level) + ' Titre\nContexte'), {
      level,
      title: 'Titre',
      description: 'Contexte',
    });
  assert.deepEqual(parseHeading('## '), { level: 2, title: '', description: '' });
  for (const text of ['#bug', 'C#', '####### Trop profond', '\\# Littéral', 'Texte # titre'])
    assert.equal(parseHeading(text), null);
});
