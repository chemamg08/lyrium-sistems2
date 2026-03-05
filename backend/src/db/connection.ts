import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || '';

export async function connectDB(): Promise<void> {
  if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI no está configurada en las variables de entorno');
    process.exit(1);
  }

  try {
    await mongoose.connect(MONGODB_URI, {
      dbName: 'lyrium',
    });
    console.log('✅ Conectado a MongoDB Atlas');
  } catch (error) {
    console.error('❌ Error al conectar con MongoDB:', error);
    process.exit(1);
  }

  mongoose.connection.on('error', (err) => {
    console.error('❌ Error de conexión MongoDB:', err);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('⚠️ Desconectado de MongoDB');
  });
}

export default mongoose;
