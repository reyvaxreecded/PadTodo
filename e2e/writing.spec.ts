import { test, expect } from '@playwright/test';
import type { Task, ListDetail } from '../src/app/shared/models';
async function setup(page: import('@playwright/test').Page) {
  const create = async (path: string, data: unknown) => {
    const r = await page.request.post('/api' + path, { data });
    expect(r.ok()).toBeTruthy();
    return (await r.json()).data;
  };
  const list = await create('/lists', { name: 'Écriture réunion E2E ' + Date.now() });
  const section = await create(`/lists/${list.id}/sections`, { title: 'Réunion' });
  await page.goto('/lists/' + list.id);
  return { list, section, create };
}
async function snapshot(page: import('@playwright/test').Page, id: string): Promise<ListDetail> {
  return (await (await page.request.get('/api/lists/' + id)).json()).data;
}
const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
test('réunion : enchaînement, édition automatique, notes multilignes, insertion et suppression annulée au clavier', async ({
  page,
}) => {
  const { list, section } = await setup(page);
  try {
    const quick = page.getByRole('textbox', { name: 'Ajouter une tâche dans Réunion' });
    await quick.fill('Décision : livrer jeudi');
    await quick.press('Enter');
    const next = page.getByRole('textbox', { name: 'Nouvelle ligne dans Réunion' });
    await expect(next).toBeFocused();
    await next.fill('Préparer la démonstration');
    await next.press('Enter');
    await expect(next).toBeFocused();
    await next.press('Backspace');
    await expect(page.getByRole('textbox', { name: 'Titre de la tâche' })).toBeFocused();
    const secondId = (await snapshot(page, list.id)).sections[0].tasks[1].id;
    const second = page.locator('[data-task-id="' + secondId + '"]');
    const title = second.getByRole('textbox', { name: 'Titre de la tâche' });
    await title.fill('Préparer la démo client');
    await expect
      .poll(async () => (await snapshot(page, list.id)).sections[0].tasks[1]?.title)
      .toBe('Préparer la démo client');
    await title.press('Shift+Enter');
    const body = second.getByRole('textbox', { name: 'Texte de la note' });
    await expect(body).toBeFocused();
    await body.fill('Vérifier le scénario\nPartager les accès');
    await body.press(mod + '+s');
    await expect
      .poll(async () => (await snapshot(page, list.id)).sections[0].tasks[1]?.description)
      .toBe('Vérifier le scénario\nPartager les accès');
    await body.press('Escape');
    await expect(title).toBeFocused();
    await title.press(mod + '+Enter');
    await expect(second.getByRole('button', { name: /Statut : Terminé/ })).toBeVisible();
    await title.press(mod + '+Shift+Backspace');
    await expect(page.getByText('Ligne supprimée', { exact: true })).toBeVisible();
    await expect.poll(async () => (await snapshot(page, list.id)).sections[0].tasks.length).toBe(1);
    await page.keyboard.press(mod + '+z');
    await expect.poll(async () => (await snapshot(page, list.id)).sections[0].tasks.length).toBe(2);
    const firstId = (await snapshot(page, list.id)).sections[0].tasks[0].id;
    const first = page.locator('[data-task-id="' + firstId + '"]');
    if (await first.getByRole('textbox', { name: 'Titre de la tâche' }).isVisible())
      await first.getByRole('textbox', { name: 'Titre de la tâche' }).focus();
    else await first.getByRole('button', { name: 'Décision : livrer jeudi', exact: true }).click();
    const firstTitle = first.getByRole('textbox', { name: 'Titre de la tâche' });
    await firstTitle.press('End');
    await firstTitle.press('Enter');
    await expect(next).toBeFocused();
    await next.fill('Point ajouté au milieu');
    await next.press('Enter');
    await expect(next).toBeFocused();
    await next.press('Backspace');
    await expect
      .poll(async () => (await snapshot(page, list.id)).sections[0].tasks.map((t) => t.title))
      .toEqual(['Décision : livrer jeudi', 'Point ajouté au milieu', 'Préparer la démo client']);
    await page.reload();
    await expect(
      page.getByRole('button', { name: 'Point ajouté au milieu', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Vérifier le scénario\nPartager les accès' }),
    ).toBeVisible();
  } finally {
    await page.request.delete('/api/lists/' + list.id).catch(() => {});
  }
});
test('le brouillon reste éditable pendant une sauvegarde lente et ne perd aucune frappe', async ({
  page,
}) => {
  const { list, section, create } = await setup(page);
  try {
    await create(`/sections/${section.id}/tasks`, { title: 'Texte initial' });
    await page.reload();
    await page.getByRole('button', { name: 'Texte initial', exact: true }).click();
    const title = page.getByRole('textbox', { name: 'Titre de la tâche' });
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    let arrived: () => void = () => {};
    const started = new Promise<void>((r) => (arrived = r));
    await page.route('**/api/tasks/*', async (route) => {
      if (route.request().method() === 'PATCH') {
        arrived();
        await gate;
      }
      await route.continue();
    });
    await title.fill('Pendant la sauvegarde');
    await started;
    await title.fill('Pendant la sauvegarde, je continue à écrire sans perdre le curseur');
    await expect(title).toBeFocused();
    release();
    await expect
      .poll(async () => (await snapshot(page, list.id)).sections[0].tasks[0]?.title)
      .toBe('Pendant la sauvegarde, je continue à écrire sans perdre le curseur');
    await expect(title).toHaveValue(
      'Pendant la sauvegarde, je continue à écrire sans perdre le curseur',
    );
  } finally {
    await page.request.delete('/api/lists/' + list.id).catch(() => {});
  }
});
test('erreur réseau et conflit : texte récupéré après rechargement et choix explicite de la version', async ({
  page,
  context,
}) => {
  const { list, section, create } = await setup(page);
  try {
    const task = await create(`/sections/${section.id}/tasks`, { title: 'Version initiale' });
    await page.reload();
    await page.getByRole('button', { name: 'Version initiale', exact: true }).click();
    const title = page.getByRole('textbox', { name: 'Titre de la tâche' });
    await context.setOffline(true);
    await title.fill('Mes notes hors connexion');
    await expect(
      page.getByText('Enregistrement impossible. Votre brouillon est conservé ici.'),
    ).toBeVisible();
    await context.setOffline(false);
    await page.reload();
    await expect(
      page.getByRole('button', { name: 'Mes notes hors connexion', exact: true }),
    ).toBeVisible();
    await expect
      .poll(async () => (await snapshot(page, list.id)).sections[0].tasks[0]?.title)
      .toBe('Mes notes hors connexion');
    await page.getByRole('button', { name: 'Mes notes hors connexion', exact: true }).click();
    await title.fill('Texte local conservé');
    const current = (await snapshot(page, list.id)).sections[0].tasks[0];
    await page.request.patch('/api/tasks/' + task.id, {
      data: { title: 'Texte du collègue', expectedUpdatedAt: current.updatedAt },
    });
    await expect(page.getByText('Modifié ailleurs. Votre texte est conservé.')).toBeVisible();
    await expect(title).toHaveValue('Texte local conservé');
    await page.getByRole('button', { name: 'Conserver mon texte', exact: true }).click();
    await expect
      .poll(async () => (await snapshot(page, list.id)).sections[0].tasks[0]?.title)
      .toBe('Texte local conservé');
  } finally {
    await context.setOffline(false);
    await page.request.delete('/api/lists/' + list.id).catch(() => {});
  }
});

test('frappe continue : plusieurs Entrées pendant une création lente gardent l’ordre et les espaces', async ({
  page,
}) => {
  const { list, section, create } = await setup(page);
  let release: () => void = () => {};
  try {
    const gate = new Promise<void>((r) => (release = r));
    let arrived: () => void = () => {};
    const started = new Promise<void>((r) => (arrived = r));
    let once = true;
    await page.route('**/api/sections/*/tasks', async (route) => {
      if (once && route.request().method() === 'POST') {
        once = false;
        arrived();
        await gate;
      }
      await route.continue();
    });
    const quick = page.getByRole('textbox', { name: 'Ajouter une tâche dans Réunion' });
    await quick.fill('Première décision');
    await quick.press('Enter');
    await started;
    await expect(quick).toHaveValue('');
    await quick.fill('Deuxième décision');
    await quick.press('Enter');
    await expect(quick).toHaveValue('');
    await quick.fill('Troisième décision');
    await quick.press('Enter');
    release();
    await expect
      .poll(async () => (await snapshot(page, list.id)).sections[0].tasks.map((t) => t.title))
      .toEqual(['Première décision', 'Deuxième décision', 'Troisième décision']);
    const pending = page.getByRole('textbox', { name: 'Nouvelle ligne dans Réunion' });
    await expect(pending).toBeFocused();
    await pending.press('Backspace');
    const title = page.getByRole('textbox', { name: 'Titre de la tâche' });
    await expect(title).toBeFocused();
    await title.fill('Une phrase ');
    await expect
      .poll(async () => (await snapshot(page, list.id)).sections[0].tasks[2].title)
      .toBe('Une phrase');
    await expect(title).toHaveValue('Une phrase ');
    await title.pressSequentially('qui continue');
    await expect
      .poll(async () => (await snapshot(page, list.id)).sections[0].tasks[2].title)
      .toBe('Une phrase qui continue');
  } finally {
    release();
    await page.request.delete('/api/lists/' + list.id).catch(() => {});
  }
});

test('réessayer une création dont la réponse a été perdue ne duplique pas la note', async ({
  page,
}) => {
  const { list, section } = await setup(page);
  try {
    let first = true;
    await page.route('**/api/sections/*/tasks', async (route) => {
      if (first && route.request().method() === 'POST') {
        first = false;
        await route.fetch();
        await route.abort('failed');
      } else await route.continue();
    });
    const quick = page.getByRole('textbox', { name: 'Ajouter une tâche dans Réunion' });
    await quick.fill('Une décision, une seule note');
    await quick.press('Enter');
    await expect(
      page.getByText('Connexion interrompue. Votre saisie est conservée.', { exact: false }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Réessayer', exact: true }).click();
    await expect
      .poll(async () => (await snapshot(page, list.id)).sections[0].tasks.map((t) => t.title))
      .toEqual(['Une décision, une seule note']);
    await expect(
      page.getByRole('button', { name: 'Une décision, une seule note', exact: true }),
    ).toBeVisible();
  } finally {
    await page.request.delete('/api/lists/' + list.id).catch(() => {});
  }
});

test('la première sauvegarde garde le curseur dans le corps d’une note et conserve les espaces', async ({
  page,
}) => {
  const { list } = await setup(page);
  try {
    const quick = page.getByRole('textbox', { name: 'Ajouter une tâche dans Réunion' });
    await quick.fill('Une idée\nÀ préparer ');
    const body = page.getByRole('textbox', { name: 'Texte de la note' });
    await expect(body).toBeFocused();
    await expect(body).toHaveValue('À préparer ');
    await body.pressSequentially('pour demain');
    await body.press(mod + '+s');
    await expect
      .poll(async () => (await snapshot(page, list.id)).sections[0].tasks[0]?.description)
      .toBe('À préparer pour demain');
    await expect(body).toBeFocused();
  } finally {
    await page.request.delete('/api/lists/' + list.id).catch(() => {});
  }
});

test('vider une ligne la supprime automatiquement sans erreur, avec annulation', async ({
  page,
}) => {
  const { list, section, create } = await setup(page);
  try {
    const task = await create(`/sections/${section.id}/tasks`, { title: 'À effacer' });
    await page.reload();
    const row = page.locator('[data-task-id="' + task.id + '"]');
    await row.getByRole('button', { name: 'À effacer', exact: true }).click();
    await row.getByRole('textbox', { name: 'Titre de la tâche' }).fill('   ');
    await expect(row).toHaveCount(0);
    await expect(
      page.getByText('Une ligne vide peut être supprimée avec Retour arrière.'),
    ).toHaveCount(0);
    await expect.poll(async () => (await snapshot(page, list.id)).sections[0].tasks.length).toBe(0);
    await page.getByRole('button', { name: /^Annuler/ }).click();
    await expect(row).toBeVisible();
    const title = row.getByRole('textbox', { name: 'Titre de la tâche' });
    await expect(title).toHaveValue('À effacer');
    await title.fill('');
    await title.press('Tab');
    await expect(row).toHaveCount(0);
    await expect(page.getByText('Suppression impossible.', { exact: false })).toHaveCount(0);
  } finally {
    await page.request.delete('/api/lists/' + list.id).catch(() => {});
  }
});

test('vider le titre conserve le contenu restant de la note', async ({ page }) => {
  const { list, section, create } = await setup(page);
  try {
    const task = await create(`/sections/${section.id}/tasks`, {
      title: 'Ancien titre',
      description: 'Texte à conserver\nDeuxième paragraphe',
    });
    await page.reload();
    const row = page.locator('[data-task-id="' + task.id + '"]');
    await row.getByRole('button', { name: 'Ancien titre', exact: true }).click();
    await row.getByRole('textbox', { name: 'Titre de la tâche' }).fill('');
    await expect
      .poll(async () => {
        const t = (await snapshot(page, list.id)).sections[0].tasks[0];
        return t && { title: t.title, description: t.description };
      })
      .toEqual({ title: 'Texte à conserver', description: 'Deuxième paragraphe' });
    await expect(row).toBeVisible();
  } finally {
    await page.request.delete('/api/lists/' + list.id).catch(() => {});
  }
});
