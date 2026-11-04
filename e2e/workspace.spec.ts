import { test, expect } from '@playwright/test';
test('parcours réel : création, statut, persistance, collaboration et reconnexion SSE', async ({
  browser,
  page,
}) => {
  const suffix = Date.now();
  const name = 'Parcours E2E ' + suffix;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Créer une liste', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nom', { exact: true }).fill(name);
  await dialog.getByRole('button', { name: 'Créer', exact: true }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Nouvelle section', exact: true }).click();
  await dialog.getByLabel('Titre de la section').fill('Livraison');
  await dialog.getByRole('button', { name: 'Créer', exact: true }).click();
  const quick = page.getByRole('textbox', { name: 'Ajouter une tâche dans Livraison' });
  await quick.fill('Vérifier la persistance');
  await quick.press('Enter');
  await expect(
    page.getByRole('button', { name: 'Vérifier la persistance', exact: true }),
  ).toBeVisible();
  const secondContext = await browser.newContext();
  const second = await secondContext.newPage();
  await second.goto(page.url());
  await expect(
    second.getByRole('button', { name: 'Vérifier la persistance', exact: true }),
  ).toBeVisible();
  const row = page.locator('app-task-row').filter({ hasText: 'Vérifier la persistance' });
  await row.getByRole('button', { name: /Statut : À faire/ }).click();
  await expect(row.getByRole('button', { name: /Statut : En cours/ })).toBeVisible();
  await expect(
    second.locator('app-task-row').getByRole('button', { name: /Statut : En cours/ }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.locator('app-task-row').getByRole('button', { name: /Statut : En cours/ }),
  ).toBeVisible();
  // Interrupt the second browser's stream, change data elsewhere, then reconnect.
  await secondContext.setOffline(true);
  await row.getByRole('button', { name: /Statut : En cours/ }).click();
  await expect(row.getByRole('button', { name: /Statut : Terminé/ })).toBeVisible();
  await secondContext.setOffline(false);
  await expect(
    second.locator('app-task-row').getByRole('button', { name: /Statut : Terminé/ }),
  ).toBeVisible({ timeout: 15000 });
  await page
    .locator('app-task-row')
    .filter({ hasText: 'Vérifier la persistance' })
    .getByRole('button', { name: 'Ouvrir les détails de la tâche' })
    .click();
  await page.getByRole('dialog').getByLabel('Titre', { exact: true }).fill('Titre modifié');
  await page.getByRole('button', { name: 'Enregistrer les modifications' }).click();
  await expect(second.getByRole('button', { name: 'Titre modifié', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Activer le thème sombre' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.getByRole('button', { name: 'Activer le thème clair' }).click();
  await page.getByRole('button', { name: 'Filtres', exact: false }).first().click();
  await page.getByRole('button', { name: 'À faire', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Aucune tâche trouvée' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Aucune tâche trouvée' })).toBeVisible();
  await page.getByRole('button', { name: 'Réinitialiser les filtres', exact: true }).click();
  expect(errors).toEqual([]);
  await secondContext.close();
  // Remove only the list created by this test.
  const id = new URL(page.url()).pathname.split('/').at(-1);
  await page.request.delete('/api/lists/' + id);
});

test('interface : catégories, édition directe, drag & drop, sections repliées et mobile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  const create = async (path: string, data: unknown) => {
    const res = await page.request.post('/api' + path, { data });
    expect(res.ok()).toBeTruthy();
    return (await res.json()).data;
  };
  const list = await create('/lists', { name: 'Interactions E2E ' + Date.now() });
  try {
    const a = await create(`/lists/${list.id}/sections`, { title: 'Architecture' });
    const b = await create(`/lists/${list.id}/sections`, { title: 'Livraison' });
    await create(`/sections/${a.id}/tasks`, { title: 'Tâche à déplacer' });
    await create(`/sections/${a.id}/tasks`, { title: 'Deuxième tâche' });
    await page.goto('/lists/' + list.id);
    await page.getByRole('button', { name: 'Catégories', exact: true }).click();
    await page.getByRole('button', { name: 'Créer une catégorie', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Nom', { exact: true }).fill('Backend');
    await dialog.getByRole('button', { name: 'Créer', exact: true }).click();
    const row = page.locator('app-task-row').filter({ hasText: 'Tâche à déplacer' });
    await row
      .getByRole('combobox', { name: 'Catégorie', exact: true })
      .selectOption({ label: 'Backend' });
    await expect(row.getByRole('combobox', { name: 'Catégorie', exact: true })).toHaveValue(/.+/);
    await expect(page.getByRole('button', { name: 'Nouvelle section', exact: true })).toBeEnabled();
    await row.getByRole('button', { name: 'Renommer la tâche', exact: true }).click();
    const input = page.getByRole('textbox', { name: 'Titre de la tâche' });
    await input.fill('Tâche renommée');
    await input.press('Escape');
    await expect(page.getByRole('button', { name: 'Tâche renommée', exact: true })).toBeVisible();
    const from = await page
      .locator('app-task-row')
      .filter({ hasText: 'Tâche renommée' })
      .getByRole('button', { name: 'Déplacer la tâche', exact: true })
      .boundingBox();
    const to = await page.locator(`[id="${b.id}"]`).boundingBox();
    expect(from).toBeTruthy();
    expect(to).toBeTruthy();
    await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
    await page.mouse.down();
    await page.mouse.move(from!.x + from!.width / 2 + 10, from!.y + from!.height / 2 + 5, {
      steps: 5,
    });
    await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2, { steps: 25 });
    await page.mouse.up();
    await expect(
      page.locator(`[id="${b.id}"]`).getByRole('button', { name: 'Tâche renommée', exact: true }),
    ).toBeVisible();
    await expect
      .poll(async () => {
        const r = await page.request.get('/api/lists/' + list.id);
        return (await r.json()).data.sections[1].tasks.length;
      })
      .toBe(1);
    const sections = page.locator('.task-section');
    const sectionHandle = await sections
      .nth(1)
      .getByRole('button', { name: 'Déplacer la section', exact: true })
      .boundingBox();
    const first = await sections.nth(0).boundingBox();
    await page.mouse.move(
      sectionHandle!.x + sectionHandle!.width / 2,
      sectionHandle!.y + sectionHandle!.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      sectionHandle!.x + sectionHandle!.width / 2 + 10,
      sectionHandle!.y + sectionHandle!.height / 2 + 5,
      { steps: 5 },
    );
    await page.mouse.move(first!.x + first!.width / 2, first!.y + 10, { steps: 25 });
    await page.mouse.up();
    await expect(page.locator('app-section-heading [role=heading]').first()).toHaveText(
      'Livraison',
    );
    await page.getByRole('button', { name: 'Livraison 0 / 1', exact: true }).click();
    await page.reload();
    await expect(page.locator(`[id="${b.id}"]`)).not.toBeVisible();
    await page.getByRole('button', { name: 'Livraison 0 / 1', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('heading', { name: list.name, exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy();
    await page.getByRole('button', { name: 'Afficher les projets', exact: true }).click();
    await expect(
      page.locator('.sidebar').getByRole('link', { name: new RegExp(list.name) }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Fermer les projets', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Afficher les projets', exact: true }),
    ).toBeVisible();
    await page
      .locator('app-task-row')
      .filter({ hasText: 'Tâche renommée' })
      .getByRole('button', { name: 'Ouvrir les détails de la tâche' })
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Fermer les détails' }).click();
  } finally {
    await page.request.delete('/api/lists/' + list.id).catch(() => {});
  }
});

test('SSR : HTML initial hydratable et aucun secret dans les scripts client', async ({ page }) => {
  const listsResponse = await page.request.get('/api/lists');
  const lists = (await listsResponse.json()).data;
  const response = await page.request.get('/lists/' + lists[0].id);
  expect(response.ok()).toBeTruthy();
  const html = await response.text();
  expect(html).toContain('ngh=');
  expect(html).toContain('ng-state');
  expect(html).toContain(lists[0].name);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('/lists/' + lists[0].id);
  await expect(page.getByRole('heading', { name: lists[0].name, exact: true })).toBeVisible();
  await page.screenshot({ path: '.local/padtodo-desktop.png', fullPage: true });
  const scripts = await page
    .locator('script[src]')
    .evaluateAll((elements) => elements.map((e) => (e as HTMLScriptElement).src));
  for (const src of scripts) {
    const body = await (await page.request.get(src)).text();
    expect(body).not.toContain('DATABASE_URL');
    expect(body).not.toContain('PrismaClient');
  }
});
