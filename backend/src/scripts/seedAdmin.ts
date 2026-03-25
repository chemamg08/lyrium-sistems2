import dotenv from 'dotenv';
import { resolve } from 'path';
dotenv.config({ path: resolve(process.cwd(), '.env') });

import * as readline from 'readline';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { Account } from '../models/Account.js';

const ADMIN_EMAIL = 'paneladministracionchema8@gmail.com';

function askPassword(): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => {
    rl.question('Nueva contraseña para admin: ', (answer) => {
      rl.close();
      res(answer.trim());
    });
  });
}

async function seedAdmin() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌ MONGODB_URI no configurada');
    process.exit(1);
  }

  const password = await askPassword();
  if (!password || password.length < 8) {
    console.error('❌ La contraseña debe tener al menos 8 caracteres');
    process.exit(1);
  }

  await mongoose.connect(uri, { dbName: 'lyrium' });

  const hashedPassword = await bcrypt.hash(password, 10);
  const existing = await Account.findOne({ email: ADMIN_EMAIL });
  if (existing) {
    await existing.updateOne({ $set: { role: 'admin', password: hashedPassword } });
    console.log('✅ Contraseña de admin actualizada');
  } else {
    await Account.create({
      _id: Date.now().toString(),
      name: 'Admin',
      email: ADMIN_EMAIL,
      password: hashedPassword,
      country: 'ES',
      type: 'main',
      role: 'admin',
      emailVerified: true,
      twoFactorEnabled: false,
      createdAt: new Date().toISOString(),
    });
    console.log('✅ Cuenta de admin creada');
  }

  process.exit(0);
}

seedAdmin().catch((err) => {
  console.error('❌ Error al crear cuenta admin:', err);
  process.exit(1);
});
