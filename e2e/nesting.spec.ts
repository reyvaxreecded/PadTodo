import { test, expect, type Page } from '@playwright/test';
async function create(page: Page, path: string, data: object) {
  const response = await page.request.post('/api' + path, { data });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).data;
}
test('les titres imbriquent leurs sections, le repli masque la branche et les déplacements la conservent', async ({
  page,
}) => {
  const list = await create(page, '/lists', { name: 'Hiérarchie E2E ' + Date.now() });
  try {
    const ids: Record<string, string> = {};
    for (const [title, level] of [
      ['Projet', 1],
      ['Décisions', 2],
      ['Détails', 3],
      ['Actions', 2],
      ['Suite', 1],
    ] as const) {
      const section = await create(page, `/lists/${list.id}/sections`, { title, level });
      ids[title] = section.id;
    }
    await create(page, `/sections/${ids['Détails']}/tasks`, { title: 'Retrouver cette décision' });
    await page.goto('/lists/' + list.id);
    const block = (title: string) => page.locator(`[data-section-id="${ids[title]}"]`);
    await expect(
      block('Projet').locator(':scope > .section-children > .section-branch > .task-section'),
    ).toHaveCount(2);
    await expect(
      block('Décisions').locator(':scope > .section-children > .section-branch > .task-section'),
    ).toHaveCount(1);
    await expect(block('Suite').locator('.task-section')).toHaveCount(0);
    await block('Projet').locator(':scope > .section-heading .section-toggle').click();
    await expect(page.getByRole('heading', { name: 'Détails', exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Suite', exact: true })).toBeVisible();
    await block('Projet').locator(':scope > .section-heading .section-toggle').click();
    await expect(page.getByRole('heading', { name: 'Détails', exact: true })).toBeVisible();
    await block('Projet').locator(':scope > .section-heading summary').click();
    await block('Projet')
      .locator(':scope > .section-heading')
      .getByRole('button', { name: 'Descendre', exact: true })
      .click();
    await expect
      .poll(async () =>
        (await (await page.request.get('/api/lists/' + list.id)).json()).data.sections.map(
          (s: { title: string }) => s.title,
        ),
      )
      .toEqual(['Suite', 'Projet', 'Décisions', 'Détails', 'Actions']);
    await page.reload();
    await expect(block('Projet').locator(`[data-section-id="${ids['Détails']}"]`)).toBeVisible();
    await page.goto('/lists/' + list.id + '?q=Retrouver');
    await expect(page.getByRole('heading', { name: 'Projet', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Décisions', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Détails', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Actions', exact: true })).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const category = await block('Détails')
      .getByRole('combobox', { name: 'Catégorie', exact: true })
      .boundingBox();
    const priority = await block('Détails')
      .getByRole('combobox', { name: 'Priorité', exact: true })
      .boundingBox();
    expect(
      category &&
        priority &&
        (category.y + category.height <= priority.y || category.x + category.width <= priority.x),
    ).toBeTruthy();
  } finally {
    await page.request.delete('/api/lists/' + list.id);
  }
});
test('modifier le niveau réorganise la hiérarchie à la volée sans perdre le curseur', async ({
  page,
}) => {
  const list = await create(page, '/lists', { name: 'Niveau en direct E2E ' + Date.now() });
  try {
    const parent = await create(page, `/lists/${list.id}/sections`, { title: 'Parent', level: 1 });
    const child = await create(page, `/lists/${list.id}/sections`, {
      title: 'À imbriquer',
      level: 1,
    });
    await page.goto('/lists/' + list.id);
    await page
      .locator(`[data-section-id="${parent.id}"] > .section-heading .section-toggle`)
      .click();
    await page.locator(`[data-section-id="${child.id}"] app-section-heading button`).click();
    const input = page.getByRole('textbox', { name: 'Nouveau titre de la section' });
    await input.fill('## Enfant');
    await expect(
      page.locator(`[data-section-id="${parent.id}"] [data-section-id="${child.id}"]`),
    ).toBeVisible();
    await expect(input).toBeFocused();
    await input.press('End');
    await input.pressSequentially(' modifié');
    await input.press('Enter');
    await expect(
      page.getByRole('textbox', { name: 'Ajouter une tâche dans Enfant modifié' }),
    ).toBeFocused();
    await page.locator(`[data-section-id="${child.id}"] app-section-heading button`).click();
    await input.fill('# Enfant racine');
    await input.press('Enter');
    await expect(
      page.getByRole('textbox', { name: 'Ajouter une tâche dans Enfant racine' }),
    ).toBeFocused();
    await expect(
      page.locator(`[data-section-id="${parent.id}"] [data-section-id="${child.id}"]`),
    ).toHaveCount(0);
    await page.locator(`[data-section-id="${child.id}"] app-section-heading button`).click();
    await input.fill('## Enfant modifié');
    await input.press('Enter');
    await expect(
      page.getByRole('textbox', { name: 'Ajouter une tâche dans Enfant modifié' }),
    ).toBeFocused();
    await page.reload();
    await expect(
      page
        .locator(`[data-section-id="${parent.id}"]`)
        .getByRole('heading', { name: 'Enfant modifié', level: 2, exact: true }),
    ).toBeVisible();
  } finally {
    await page.request.delete('/api/lists/' + list.id);
  }
});
