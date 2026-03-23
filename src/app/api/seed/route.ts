import { NextResponse } from "next/server";
import { collection, writeBatch, doc } from "firebase/firestore";
import { db } from "@/lib/firebaseConfig";

export const dynamic = 'force-dynamic';

// Dados mockados baseados no cenário descrito para E.E. Gabriel Pozzi
const MOCK_STUDENTS = [
    { "id": 1, "name": "ANTONIO CARLOS FERREIRA NETO", "class": "3ºA D.S." },
    { "id": 2, "name": "AZUMI MIYASHIRO BARTOLOMEU", "class": "3ºA D.S." },
    { "id": 3, "name": "BRUNO LOPES JACINTO", "class": "3ºA D.S." },
    { "id": 4, "name": "CARLOS EDUARDO RODRIGUES DA SILVA", "class": "3ºA D.S." },
    { "id": 5, "name": "DANIEL TELLES MOCHI", "class": "3ºA D.S." },
    { "id": 6, "name": "ENZO GABRIEL QUINTELA DA SILVA", "class": "3ºA D.S." },
    { "id": 7, "name": "ERICK SANTOS FERREIRA", "class": "3ºA D.S." },
    { "id": 8, "name": "FELIPE REIS GALBIATI", "class": "3ºA D.S." },
    { "id": 9, "name": "GABRIELA VITÓRIA MELERO DE LIMA", "class": "3ºA D.S." },
    { "id": 10, "name": "GIOVANA TANAKA TAHIRA", "class": "3ºA D.S." },
    { "id": 11, "name": "GUILHERME DE SOUZA MACHADO", "class": "3ºA D.S." },
    { "id": 12, "name": "HUGO SANTANA SOUZA", "class": "3ºA D.S." },
    { "id": 13, "name": "JEAN PIETRO CAMARGO DA SILVA", "class": "3ºA D.S." },
    { "id": 15, "name": "KAIKY ALVES OLIVEIRA", "class": "3ºA D.S." },
    { "id": 16, "name": "KAROLAINE DE GODOY", "class": "3ºA D.S." },
    { "id": 17, "name": "LETÍCIA SANTOS OLIVEIRA", "class": "3ºA D.S." },
    { "id": 18, "name": "MARCOS GABRIEL PINHEIRO MENDES", "class": "3ºA D.S." },
    { "id": 19, "name": "NATÁLIA MIGUEL BORGES", "class": "3ºA D.S." },
    { "id": 20, "name": "NICOLAS FERREIRA SIQUEIRA", "class": "3ºA D.S." },
    { "id": 21, "name": "PHELIPE HENRIQUE DE SOUZA", "class": "3ºA D.S." },
    { "id": 22, "name": "PHELIPE MARTINS", "class": "3ºA D.S." },
    { "id": 23, "name": "RAKELLY REGINA SANTOS SARTORI", "class": "3ºA D.S." },
    { "id": 24, "name": "RHYANNA VITÓRIA DE OLIVEIRA", "class": "3ºA D.S." },
    { "id": 25, "name": "RICHARD HUPEL SCHIMIDT", "class": "3ºA D.S." },
    { "id": 26, "name": "SARA BARBOSA DA SILVA", "class": "3ºA D.S." },
    { "id": 27, "name": "VITHOR HENRI PEREIRA RIBEIRO", "class": "3ºA D.S." },
    { "id": 28, "name": "VITOR MAFFEI ZAREMBA", "class": "3ºA D.S." },
    { "id": 29, "name": "VITOR RODRIGUES MOREIRA", "class": "3ºA D.S." },
    { "id": 30, "name": "YAN PAULO ALVES SILVA PRATES", "class": "3ºA D.S." },
    { "id": 31, "name": "YURI RODRIGUES DE TOLEDO", "class": "3ºA D.S." }
];

export async function POST(req: Request) {
    try {
        const data = await req.json();

        // Simples proteção via secret via body para não permitir seeding aberto
        if (data.secret !== "gabrielpozzi2026") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const batch = writeBatch(db);

        MOCK_STUDENTS.forEach((student) => {
            // Usar a chave primária baseada na turma + id para evitar sobrescritas caso classes diferentes tenham id '1'
            const docId = student.class.replace(/[^a-zA-Z0-9]/g, '') + "_" + student.id;
            const docRef = doc(collection(db, "students"), docId);

            batch.set(docRef, {
                id: student.id,
                name: student.name,
                class: student.class
            });
        });

        await batch.commit();

        return NextResponse.json({ success: true, message: "Banco populado com sucesso" });
    } catch (error: unknown) {
        console.error("Erro ao rodar o seed:", error);
        return NextResponse.json({ error: error instanceof Error ? error.message : "Erro desconhecido" }, { status: 500 });
    }
}
