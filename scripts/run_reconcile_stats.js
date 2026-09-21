const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

// Carregar .env.local manualmente
const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, "utf8");
  envConfig.split("\n").forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let val = match[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      val = val.replace(/\\n/g, "\n");
      process.env[key] = val;
    }
  });
}

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY;

if (!projectId || !clientEmail || !privateKey) {
  console.error("Erro: Credenciais do Firebase Admin ausentes no .env.local!");
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey: privateKey.replace(/\\n/g, "\n")
    })
  });
}

const db = admin.firestore();
const LOCK_DATE = "2026-04-06";

async function runReconcile() {
  console.log("Iniciando reconciliação da coleção student_stats desde " + LOCK_DATE + "...");

  // 1. Buscar todos os alunos
  const studentsSnap = await db.collection("students").get();
  const studentsMap = new Map();
  
  studentsSnap.docs.forEach((doc) => {
    const data = doc.data();
    studentsMap.set(doc.id, {
      id: Number(data.id || 0),
      name: data.name || "",
      class: data.class || "",
      status: data.status
    });
  });

  console.log(`Encontrados ${studentsMap.size} alunos cadastrados.`);

  // 2. Buscar chamadas desde LOCK_DATE
  const attendanceSnap = await db.collection("attendance")
    .where("date", ">=", LOCK_DATE)
    .get();

  console.log(`Encontradas ${attendanceSnap.docs.length} chamadas individuais registradas desde ${LOCK_DATE}.`);

  const statsPerStudent = {};

  studentsMap.forEach((student, firestoreId) => {
    statsPerStudent[firestoreId] = {
      studentId: student.id,
      studentName: student.name,
      studentClass: student.class,
      totalDays: 0,
      absences: 0,
      presences: 0,
      dispensed: 0
    };
  });

  attendanceSnap.docs.forEach((doc) => {
    const data = doc.data();
    let fId = data.studentFirestoreId;

    if (!fId) {
      for (const [sId, sData] of studentsMap.entries()) {
        if (sData.id === data.studentId || sData.name === data.studentName) {
          fId = sId;
          break;
        }
      }
    }

    if (fId && statsPerStudent[fId]) {
      const target = statsPerStudent[fId];
      const status = data.status;

      if (status !== "TR") {
        target.totalDays += 1;
        if (status === "F") {
          target.absences += 1;
        } else if (status === "P" || status === "A") {
          target.presences += 1;
        } else if (status === "D") {
          target.dispensed += 1;
        }
      }
    }
  });

  const entries = Object.entries(statsPerStudent);
  let updatedCount = 0;

  for (let i = 0; i < entries.length; i += 400) {
    const batch = db.batch();
    const chunk = entries.slice(i, i + 400);

    chunk.forEach(([fId, stats]) => {
      const presenceRate = stats.totalDays > 0
        ? Math.round(((stats.totalDays - stats.absences) / stats.totalDays) * 100)
        : 0;

      const docRef = db.collection("student_stats").doc(fId);
      batch.set(docRef, {
        studentFirestoreId: fId,
        studentId: stats.studentId,
        studentName: stats.studentName,
        studentClass: stats.studentClass,
        totalDays: stats.totalDays,
        absences: stats.absences,
        presences: stats.presences,
        dispensed: stats.dispensed,
        presenceRate: Math.max(0, Math.min(100, presenceRate)),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    });

    await batch.commit();
    updatedCount += chunk.length;
  }

  console.log(`✅ Reconciliação concluída com SUCESSO! ${updatedCount} documentos populados/atualizados na coleção student_stats.`);
  process.exit(0);
}

runReconcile().catch(err => {
  console.error("ERRO na reconciliação:", err);
  process.exit(1);
});
