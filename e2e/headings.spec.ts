import { test, expect } from '@playwright/test';
import type { ListDetail } from '../src/app/shared/models';
async function create(page: import('@playwright/test').Page, path: string, data: unknown) {
  const response = await page.request.post('/api' + path, { data });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).data;
}
async function detail(page: import('@playwright/test').Page, id: string): Promise<ListDetail> {
  return (await (await page.request.get('/api/lists/' + id)).json()).data;
}
test('écrire #, ## ou ###### crée des titres et poursuit la rédaction dans la nouvelle section', async ({
  page,
}) => {
  const list = await create(page, '/lists', { name: 'Titres Markdown E2E ' + Date.now() });
  const section = await create(page, `/lists/${list.id}/sections`, { title: 'Réunion' });
  try {
    await page.goto('/lists/' + list.id);
    const quick = page.getByRole('textbox', { name: 'Ajouter une tâche dans Réunion' });
    await quick.fill('# ');
    await quick.press('Enter');
    await expect(quick).toHaveValue('# ');
    expect((await detail(page, list.id)).sections.length).toBe(1);
    await quick.fill('# Décisions');
    await quick.press('Enter');
    const h1 = page.getByRole('heading', { name: 'Décisions', level: 1, exact: true });
    await expect(h1).toBeVisible();
    await quick.fill('Note dans la section initiale');
    await quick.press('Enter');
    await expect
      .poll(async () => (await detail(page, list.id)).sections[0].tasks.map((t) => t.title))
      .toEqual(['Note dans la section initiale']);
    const decisions = page.getByRole('textbox', { name: 'Ajouter une tâche dans Décisions' });
    await decisions.focus();
    await decisions.fill('Livrer jeudi');
    await decisions.press('Enter');
    const next = page.getByRole('textbox', { name: 'Nouvelle ligne dans Décisions' });
    await expect(next).toBeFocused();
    await next.fill('## Prochaines étapes');
    await next.press('Enter');
    const h2 = page.getByRole('heading', { name: 'Prochaines étapes', level: 2, exact: true });
    await expect(h2).toBeVisible();
    const steps = page.getByRole('textbox', { name: 'Ajouter une tâche dans Prochaines étapes' });
    await expect(steps).toBeFocused();
    await steps.fill('#bug42');
    await steps.press('Enter');
    const pending = page.getByRole('textbox', { name: 'Nouvelle ligne dans Prochaines étapes' });
    await expect(pending).toBeFocused();
    await pending.fill('###### Détails');
    await pending.press('Enter');
    await expect(
      page.getByRole('heading', { name: 'Détails', level: 6, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('textbox', { name: 'Ajouter une tâche dans Détails' }),
    ).toBeFocused();
    const data = await detail(page, list.id);
    expect(data.sections.map((s) => ({ title: s.title, level: s.level }))).toEqual([
      { title: 'Réunion', level: 2 },
      { title: 'Décisions', level: 1 },
      { title: 'Prochaines étapes', level: 2 },
      { title: 'Détails', level: 6 },
    ]);
    expect(data.sections[2].tasks[0].title).toBe('#bug42');
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Décisions', level: 1, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Détails', level: 6, exact: true }),
    ).toBeVisible();
    const block = page
      .locator('.task-section')
      .filter({ has: page.getByRole('heading', { name: 'Décisions', level: 1, exact: true }) });
    await block.locator('summary').click();
    await block.getByRole('button', { name: 'Renommer', exact: true }).click();
    const renamed = page.getByRole('textbox', { name: 'Nouveau titre de la section' });
    await renamed.fill('## Décisions renommées');
    await renamed.press('Enter');
    await expect(
      page.getByRole('heading', { name: 'Décisions renommées', level: 2, exact: true }),
    ).toBeVisible();
  } finally {
    await page.request.delete('/api/lists/' + list.id).catch(() => {});
  }
});

test('transformer une ligne en titre répartit les notes suivantes et conserve son contexte', async ({
  page,
}) => {
  const list = await create(page, '/lists', { name: 'Conversion titre E2E ' + Date.now() });
  const section = await create(page, `/lists/${list.id}/sections`, { title: 'Réunion' });
  try {
    await create(page, `/sections/${section.id}/tasks`, { title: 'Avant' });
    const middle = await create(page, `/sections/${section.id}/tasks`, {
      title: 'À transformer',
      description: 'Contexte conservé\nAction suivante',
    });
    await create(page, `/sections/${section.id}/tasks`, { title: 'Après' });
    await page.goto('/lists/' + list.id);
    const row = page.locator('[data-task-id="' + middle.id + '"]');
    await row.getByRole('button', { name: 'À transformer', exact: true }).click();
    const input = row.getByRole('textbox', { name: 'Titre de la tâche' });
    await input.fill('### Tests');
    await input.press('Enter');
    await expect(page.getByRole('heading', { name: 'Tests', level: 3, exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Ajouter une tâche dans Tests' })).toBeFocused();
    const data = await detail(page, list.id);
    expect(data.sections[0].tasks.map((t) => t.title)).toEqual(['Avant']);
    expect(data.sections[1].tasks.map((t) => t.title)).toEqual(['Contexte conservé', 'Après']);
    expect(data.sections[1].tasks[0].id).toBe(middle.id);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Tests', level: 3, exact: true })).toBeVisible();
  } finally {
    await page.request.delete('/api/lists/' + list.id).catch(() => {});
  }
});

test('modifier un titre d’un clic, sauvegarder à la volée, changer de niveau et continuer au clavier', async ({
  page,
  browser,
}) => {
  const list = await create(page, '/lists', { name: 'Édition titres E2E ' + Date.now() });
  const section = await create(page, `/lists/${list.id}/sections`, {
    title: 'Titre initial',
    level: 1,
  });
  const second = await browser.newContext();
  try {
    await page.goto('/lists/' + list.id);
    const observer = await second.newPage();
    await observer.goto(page.url());
    const heading = page.locator('app-section-heading');
    await heading.getByRole('button', { name: 'Titre initial', exact: true }).click();
    const input = page.getByRole('textbox', { name: 'Nouveau titre de la section' });
    await expect(input).toBeFocused();
    await input.fill('Titre modifié sans validation');
    await expect
      .poll(async () => (await detail(page, list.id)).sections[0].title)
      .toBe('Titre modifié sans validation');
    await expect(input).toBeFocused();
    await expect(
      observer.getByRole('heading', {
        name: 'Titre modifié sans validation',
        level: 1,
        exact: true,
      }),
    ).toBeVisible();
    await input.fill('### Détails techniques');
    await expect
      .poll(async () => {
        const s = (await detail(page, list.id)).sections[0];
        return { title: s.title, level: s.level };
      })
      .toEqual({ title: 'Détails techniques', level: 3 });
    await input.press('Enter');
    await expect(
      page.getByRole('textbox', { name: 'Ajouter une tâche dans Détails techniques' }),
    ).toBeFocused();
    await expect(
      page.getByRole('heading', { name: 'Détails techniques', level: 3, exact: true }),
    ).toBeVisible();
    await heading.getByRole('button', { name: 'Détails techniques', exact: true }).click();
    await input.fill('À annuler');
    await input.press('Escape');
    await expect(
      page.getByRole('heading', { name: 'Détails techniques', level: 3, exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Détails techniques', level: 3, exact: true }),
    ).toBeVisible();
  } finally {
    await second.close();
    await page.request.delete('/api/lists/' + list.id).catch(() => {});
  }
});

test('l’édition d’un titre conserve les frappes pendant une sauvegarde lente et signale les conflits', async ({
  page,
}) => {
  const list = await create(page, '/lists', { name: 'Conflit titre E2E ' + Date.now() });
  const section = await create(page, `/lists/${list.id}/sections`, { title: 'Titre partagé' });
  let release: () => void = () => {};
  try {
    await page.goto('/lists/' + list.id);
    await page
      .locator('app-section-heading')
      .getByRole('button', { name: 'Titre partagé', exact: true })
      .click();
    const input = page.getByRole('textbox', { name: 'Nouveau titre de la section' });
    let arrived: () => void = () => {};
    const started = new Promise<void>((r) => (arrived = r));
    const gate = new Promise<void>((r) => (release = r));
    let first = true;
    await page.route('**/api/sections/' + section.id, async (route) => {
      if (first && route.request().method() === 'PATCH') {
        first = false;
        arrived();
        await gate;
      }
      await route.continue();
    });
    await input.fill('Première saisie');
    await started;
    await input.fill('Je continue pendant la sauvegarde');
    release();
    await expect
      .poll(async () => (await detail(page, list.id)).sections[0].title)
      .toBe('Je continue pendant la sauvegarde');
    await expect(input).toBeFocused();
    await expect(input).toHaveValue('Je continue pendant la sauvegarde');
    await input.fill('Mon titre local');
    const current = (await detail(page, list.id)).sections[0];
    await page.request.patch('/api/sections/' + section.id, {
      data: { title: 'Titre du collègue', expectedUpdatedAt: current.updatedAt },
    });
    await expect(
      page.getByText('Ce titre a changé ailleurs. Votre saisie est conservée.'),
    ).toBeVisible();
    await expect(input).toHaveValue('Mon titre local');
    await page.getByRole('button', { name: 'Conserver mon titre', exact: true }).click();
    await expect
      .poll(async () => (await detail(page, list.id)).sections[0].title)
      .toBe('Mon titre local');
  } finally {
    release();
    await page.request.delete('/api/lists/' + list.id).catch(() => {});
  }
});
