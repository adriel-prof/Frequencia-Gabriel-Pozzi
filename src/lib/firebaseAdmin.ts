import * as admin from 'firebase-admin';

function getAdminDb() {
  if (!admin.apps.length) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (projectId && clientEmail && privateKey) {
      try {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId,
            clientEmail,
            privateKey: privateKey.replace(/\\n/g, '\n'),
          }),
        });
      } catch (error) {
        console.error("Erro ao inicializar Firebase Admin:", error);
      }
    }
  }
  return admin.firestore();
}

export const adminDb = (() => {
  if (admin.apps.length) return admin.firestore();
  
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (projectId && clientEmail && privateKey) {
    return getAdminDb();
  }
  
  console.error("Firebase Admin falhou: Variáveis faltando:", {
    projectId: !!projectId,
    clientEmail: !!clientEmail,
    privateKey: !!privateKey
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return null as any;
})();

export { admin };
