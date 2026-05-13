import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        console.log("Iniciando migração otimizada de IDs...");
        
        const studentsSnap = await adminDb.collection("students").get();
        const attendanceSnap = await adminDb.collection("attendance").get();
        
        console.log(`Dados carregados: ${studentsSnap.size} alunos e ${attendanceSnap.size} registros de presença.`);

        const studentsProcessed = [];
        let attendanceMoved = 0;

        // 1. Mapear presenças por ID de estudante (extraído do docId att_ID_DATA)
        const attendanceByStudentId = new Map<string, any[]>();
        attendanceSnap.docs.forEach(doc => {
            const parts = doc.id.split('_');
            if (parts.length >= 3) {
                const studentId = parts[1];
                if (!attendanceByStudentId.has(studentId)) {
                    attendanceByStudentId.set(studentId, []);
                }
                attendanceByStudentId.get(studentId)!.push({
                    id: doc.id,
                    ref: doc.ref,
                    data: doc.data(),
                    datePart: parts[2]
                });
            }
        });

        // 2. Processar cada estudante
        for (const studentDoc of studentsSnap.docs) {
            const oldId = studentDoc.id;
            const data = studentDoc.data();
            
            // Gerar novo ID estável
            const newStudentRef = adminDb.collection("students").doc();
            const newId = newStudentRef.id;

            console.log(`Processando: ${data.name} (${oldId} -> ${newId})`);

            const batch = adminDb.batch();

            // Salvar novo aluno
            batch.set(newStudentRef, {
                ...data,
                originalId: oldId
            });

            // Mover presenças vinculadas
            const myAttendance = attendanceByStudentId.get(oldId) || [];
            myAttendance.forEach(att => {
                const newAttId = `att_${newId}_${att.datePart}`;
                batch.set(adminDb.collection("attendance").doc(newAttId), {
                    ...att.data,
                    studentFirestoreId: newId
                });
                batch.delete(att.ref);
                attendanceMoved++;
            });

            // Deletar aluno antigo
            batch.delete(studentDoc.ref);

            await batch.commit();
            studentsProcessed.push(data.name);
        }

        return NextResponse.json({
            message: "Migração concluída com sucesso (Otimizada)!",
            totalStudents: studentsProcessed.length,
            attendanceMoved
        });

    } catch (error) {
        console.error("Erro na migração:", error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
