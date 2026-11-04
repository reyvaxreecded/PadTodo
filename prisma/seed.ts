import { db } from '../src/server/data/database';
// Explicitly opt-in; never seed when the application starts.
async function seed() {
  if (await db.taskList.count()) {
    console.log('Base non vide : aucune donnée de démonstration ajoutée.');
    return;
  }
  await db.$transaction(async (tx) => {
    const list = await tx.taskList.create({
      data: {
        name: 'Refonte frontend',
        description: 'Une interface plus simple, plus rapide et pensée pour nos utilisateurs.',
        color: '#65866b',
        position: 0,
      },
    });
    const frontend = await tx.category.create({
      data: { name: 'Frontend', color: '#65866b', listId: list.id },
    });
    const design = await tx.category.create({
      data: { name: 'Design', color: '#a881b3', listId: list.id },
    });
    const tests = await tx.category.create({
      data: { name: 'Tests', color: '#b58e52', listId: list.id },
    });
    const data = [
      {
        title: 'Architecture & fondations',
        tasks: [
          {
            title: 'Définir la structure des composants',
            status: 'DONE' as const,
            priority: 'HIGH' as const,
            categoryId: frontend.id,
            description: 'Adopter les composants standalone et séparer les domaines fonctionnels.',
          },
          {
            title: 'Mettre à jour les dépendances Angular',
            status: 'DONE' as const,
            priority: 'MEDIUM' as const,
            categoryId: frontend.id,
          },
          {
            title: 'Refactoriser les services de données',
            status: 'IN_PROGRESS' as const,
            priority: 'HIGH' as const,
            categoryId: frontend.id,
            description: 'Centraliser les appels API et uniformiser la gestion des erreurs.',
          },
        ],
      },
      {
        title: 'Interface utilisateur',
        tasks: [
          {
            title: 'Repenser la navigation principale',
            status: 'IN_PROGRESS' as const,
            priority: 'HIGH' as const,
            categoryId: design.id,
          },
          {
            title: 'Créer les composants du design system',
            status: 'TODO' as const,
            priority: 'MEDIUM' as const,
            categoryId: design.id,
            description: 'Boutons, champs, sélecteurs et états de focus.',
          },
          {
            title: 'Ajouter le thème sombre',
            status: 'TODO' as const,
            priority: 'LOW' as const,
            categoryId: frontend.id,
          },
          {
            title: 'Soigner les états vides et les retours d’erreur',
            status: 'TODO' as const,
            priority: 'MEDIUM' as const,
            categoryId: design.id,
          },
        ],
      },
      {
        title: 'Qualité & finitions',
        tasks: [
          {
            title: 'Couvrir les parcours critiques en E2E',
            status: 'TODO' as const,
            priority: 'HIGH' as const,
            categoryId: tests.id,
          },
          {
            title: 'Vérifier l’accessibilité au clavier',
            status: 'TODO' as const,
            priority: 'MEDIUM' as const,
            categoryId: tests.id,
          },
        ],
      },
    ];
    for (const [position, s] of data.entries())
      await tx.taskSection.create({
        data: {
          title: s.title,
          listId: list.id,
          position,
          tasks: {
            create: s.tasks.map((t, p) => ({
              ...t,
              position: p,
              completedAt: t.status === 'DONE' ? new Date() : null,
            })),
          },
        },
      });
    for (const [position, name, color] of [
      [1, 'API backend', '#a68aaf'],
      [2, 'Dette technique', '#be9f68'],
      [3, 'Infrastructure', '#7b9fa8'],
    ] as const)
      await tx.taskList.create({
        data: { name, color, position, description: 'Les prochains chantiers de l’équipe.' },
      });
  });
  console.log('Données de démonstration ajoutées.');
}
seed()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
