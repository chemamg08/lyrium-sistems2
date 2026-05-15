import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || '';
const DB_NAME = 'lyrium';

const USER_DATA_COLLECTIONS = [
  'accounts',
  'subaccounts',
  'subscriptions',
  'clients',
  'chats',
  'assistantchats',
  'fiscalchats',
  'contractchats',
  'defensechats',
  'documentsummarieschats',
  'defenseevidences',
  'automations',
  'jobs',
  'calculations',
  'fiscalprofiles',
  'fiscalalerts',
  'calendarevents',
  'clientreminders',
  'contracts',
  'generatedcontracts',
  'writingtexts',
  'sharedfiles',
  'emailconfigs',
  'specialtiessettings',
  'apikeys',
  'signaturerequests',
  'invoices',
  'invoicesettings',
  'taxobligations',
  'improveaifiles',
  'improveaifolders',
  'improveaifragments',
  'webhooks',
  'dailyiausages',
  'stats',
  'cases',
  'stripewebhookevents',
] as const;

type CollectionSummary = {
  name: string;
  before: number;
  deleted: number;
  after: number;
};

async function purgeCollection(name: string): Promise<CollectionSummary> {
  const collection = mongoose.connection.db.collection(name);
  const before = await collection.countDocuments();
  const result = await collection.deleteMany({});
  const after = await collection.countDocuments();

  return {
    name,
    before,
    deleted: result.deletedCount ?? 0,
    after,
  };
}

async function main() {
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI no está configurada');
  }

  await mongoose.connect(MONGODB_URI, { dbName: DB_NAME });

  try {
    const summaries: CollectionSummary[] = [];

    for (const collectionName of USER_DATA_COLLECTIONS) {
      summaries.push(await purgeCollection(collectionName));
    }

    const deletedTotal = summaries.reduce((acc, item) => acc + item.deleted, 0);

    console.log(`Base de datos: ${DB_NAME}`);
    console.log(`Colecciones limpiadas: ${USER_DATA_COLLECTIONS.length}`);
    console.log(`Documentos eliminados: ${deletedTotal}`);

    for (const summary of summaries) {
      console.log(`${summary.name}: ${summary.before} -> ${summary.after} (eliminados: ${summary.deleted})`);
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error('Error al purgar datos de usuario:', error);
  process.exit(1);
});
