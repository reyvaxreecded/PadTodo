import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
if (!process.env['DATABASE_URL'])
  throw new Error('DATABASE_URL manquante : configurez le fichier .env avant de démarrer.');
export const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'], max: 10 }),
});
