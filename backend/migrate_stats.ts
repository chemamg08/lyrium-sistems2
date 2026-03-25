/**
 * Script de migración: Inicializa contractsCreated y defensesCreated
 * en la colección Stats basándose en los documentos existentes.
 *
 * Ejecutar una sola vez: npx tsx migrate_stats.ts
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || '';
if (!MONGO_URI) { console.error('MONGO_URI no definido en .env'); process.exit(1); }

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('Conectado a MongoDB');

  const db = mongoose.connection.db!;
  const generatedContracts = db.collection('generatedcontracts');
  const contractChats = db.collection('contractchats');
  const contracts = db.collection('contracts');
  const defenseChats = db.collection('defensechats');
  const stats = db.collection('stats');

  // --- Contratos creados (GeneratedContract) ---
  // Cada GeneratedContract tiene chatId -> ContractChat tiene accountId
  const allGenerated = await generatedContracts.find({}).toArray();
  const contractCountByAccount: Record<string, number> = {};

  for (const gc of allGenerated) {
    const chat = await contractChats.findOne({ _id: gc.chatId });
    let accountId = (chat as any)?.accountId;
    if (!accountId && gc.contractBaseId) {
      const base = await contracts.findOne({ _id: gc.contractBaseId });
      accountId = (base as any)?.accountId;
    }
    if (accountId) {
      contractCountByAccount[accountId] = (contractCountByAccount[accountId] || 0) + 1;
    }
  }

  // --- Defensas creadas (exportDefenseChat = savedStrategies exportadas) ---
  // Contamos DefenseChats que tienen savedStrategies con contenido
  const allDefenses = await defenseChats.find({
    savedStrategies: { $exists: true, $ne: [] }
  }).toArray();
  const defenseCountByAccount: Record<string, number> = {};

  for (const dc of allDefenses) {
    const accountId = (dc as any).accountId;
    if (accountId) {
      const count = Array.isArray((dc as any).savedStrategies) ? (dc as any).savedStrategies.length : 0;
      defenseCountByAccount[accountId] = (defenseCountByAccount[accountId] || 0) + count;
    }
  }

  // --- Actualizar Stats ---
  const allAccountIds = new Set([
    ...Object.keys(contractCountByAccount),
    ...Object.keys(defenseCountByAccount),
  ]);

  for (const accountId of allAccountIds) {
    const updates: Record<string, number> = {};
    if (contractCountByAccount[accountId]) updates.contractsCreated = contractCountByAccount[accountId];
    if (defenseCountByAccount[accountId]) updates.defensesCreated = defenseCountByAccount[accountId];

    await stats.updateOne(
      { _id: accountId },
      { $set: updates },
      { upsert: true }
    );
    console.log(`  ${accountId}: contratos=${updates.contractsCreated || 0}, defensas=${updates.defensesCreated || 0}`);
  }

  console.log(`\nMigración completada. ${allAccountIds.size} cuentas actualizadas.`);
  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
