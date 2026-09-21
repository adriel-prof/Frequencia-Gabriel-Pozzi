import { NextResponse } from 'next/server';
import { adminDb, admin } from '@/lib/firebaseAdmin';

export const dynamic = 'force-dynamic';

const LOCK_DATE = "2026-04-06";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const secret = searchParams.get('secret');

        // Opcional: proteção básica por secret se configurado no .env
        const expectedSecret = process.env.CRON_SECRET;
        if (expectedSecret && secret !== expectedSecret) {
            return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
        }

        if (!adminDb) {
            return NextResponse.json({ error: 'Firebase Admin não inicializado.' }, { status: 500 });
        }

        // 1. Buscar todos os alunos
        const studentsSnap = await adminDb.collection("students").get();
        const studentsMap = new Map<string, { id: number; name: string; class: string; status?: string }>();
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        studentsSnap.docs.forEach((doc: any) => {
            const data = doc.data();
            studentsMap.set(doc.id, {
                id: Number(data.id || 0),
                name: data.name || "",
                class: data.class || "",
                status: data.status
            });
        });

        // 2. Buscar todas as chamadas a partir da LOCK_DATE
        const attendanceSnap = await adminDb.collection("attendance")
            .where("date", ">=", LOCK_DATE)
            .get();

        // 3. Agrupar estáticas por aluno
        const statsPerStudent: Record<string, {
            studentId: number;
            studentName: string;
            studentClass: string;
            totalDays: number;
            absences: number;
            presences: number;
            dispensed: number;
        }> = {};

        // Inicializar com todos os alunos do banco
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

        // Processar cada registro de presença
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        attendanceSnap.docs.forEach((doc: any) => {
            const data = doc.data();
            let fId = data.studentFirestoreId;

            if (!fId) {
                // Tenta mapear pelo ID numérico / nome
                for (const [sId, sData] of Array.from(studentsMap.entries())) {
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

        // 4. Salvar os resumos na coleção student_stats em lote (batches de até 500)
        const entries = Object.entries(statsPerStudent);
        let updatedCount = 0;
        
        for (let i = 0; i < entries.length; i += 400) {
            const batch = adminDb.batch();
            const chunk = entries.slice(i, i + 400);

            chunk.forEach(([fId, stats]) => {
                const presenceRate = stats.totalDays > 0
                    ? Math.round(((stats.totalDays - stats.absences) / stats.totalDays) * 100)
                    : 0;

                const docRef = adminDb.collection("student_stats").doc(fId);
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

        return NextResponse.json({
            message: "Reconciliação de estatísticas dos alunos concluída com sucesso!",
            totalStudentsProcessed: studentsMap.size,
            documentsUpdated: updatedCount,
            totalAttendanceRecordsAnalyzed: attendanceSnap.docs.length
        });
    } catch (error) {
        console.error("ERRO na reconciliação de estatísticas:", error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
