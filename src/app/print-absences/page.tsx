"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebaseConfig";
import { Suspense } from "react";

type AttendanceRecord = {
    studentId: number;
    studentName: string;
    studentClass: string;
    status: "P" | "F" | "D" | "A" | "TR";
    studentFirestoreId?: string;
};

function PrintAbsencesContent() {
    const searchParams = useSearchParams();
    const date = searchParams.get("date");
    
    const [absencesByClass, setAbsencesByClass] = useState<Record<string, { name: string; id: number; presenceRate: number }[]>>({});
    const [missingClasses, setMissingClasses] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!date) return;

        async function fetchData() {
            try {
                if (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) {
                    const { mockDb } = await import("@/lib/mockDatabase");
                    
                    const normalizeClassName = (name: string) => name ? name.trim().toUpperCase().replace(/°/g, 'º') : "";
                    
                    const recordsData = mockDb.getAttendance(date || undefined) as unknown as AttendanceRecord[];
                    const completedClassesToday = new Set<string>();
                    const LOCK_DATE = "2026-04-06";
                    
                    const absences: Record<string, { name: string; id: number; presenceRate: number }[]> = {};
                    
                    recordsData.forEach(data => {
                        const clsNorm = normalizeClassName(data.studentClass);
                        completedClassesToday.add(clsNorm);
                        
                        if (data.status === "F") {
                            if (!absences[clsNorm]) {
                                absences[clsNorm] = [];
                            }
                            
                            // Busca histórico deste aluno no banco mock
                            const studentRecords = (mockDb.getAttendance() as unknown as (AttendanceRecord & { date: string })[])
                                .filter(r => data.studentFirestoreId 
                                    ? r.studentFirestoreId === data.studentFirestoreId 
                                    : r.studentId === data.studentId
                                );
                                
                            let total = 0;
                            let totalAbsences = 0;
                            
                            studentRecords.forEach(rec => {
                                if (rec.date >= LOCK_DATE && rec.status !== "TR") {
                                    total++;
                                    if (rec.status === "F") {
                                        totalAbsences++;
                                    }
                                }
                            });
                            
                            const presenceRate = total > 0 ? Math.round(((total - totalAbsences) / total) * 100) : 0;
                            absences[clsNorm].push({ name: data.studentName, id: data.studentId, presenceRate });
                        }
                    });
                    
                    // Ordena
                    Object.keys(absences).forEach(cls => {
                        absences[cls].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
                    });
                    
                    const studentsList = mockDb.getStudents().filter(s => s.status !== "TR");
                    const allClasses = Array.from(new Set(studentsList.map(s => normalizeClassName(s.class))));
                    const missing = allClasses
                        .filter(cls => !completedClassesToday.has(cls))
                        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
                        
                    setAbsencesByClass(absences);
                    setMissingClasses(missing);
                    setLoading(false);
                    return;
                }

                // Fetch attendance records for the date
                const q = query(collection(db, "attendance"), where("date", "==", date));
                const snapshot = await getDocs(q);

                const normalizeClassName = (name: string) => name ? name.trim().toUpperCase().replace(/°/g, 'º') : "";
                
                const completedClassesToday = new Set<string>();
                const LOCK_DATE = "2026-04-06";
                const absencesPromises: Promise<void>[] = [];
                const absences: Record<string, { name: string; id: number; presenceRate: number }[]> = {};

                snapshot.docs.forEach(doc => {
                    const data = doc.data() as AttendanceRecord;
                    const clsNorm = normalizeClassName(data.studentClass);
                    completedClassesToday.add(clsNorm);

                    if (data.status === "F") {
                        if (!absences[clsNorm]) {
                            absences[clsNorm] = [];
                        }
                        
                        const fetchStudentData = async () => {
                            const attendanceRef = collection(db, "attendance");
                            const qStudent = data.studentFirestoreId
                                ? query(attendanceRef, where("studentFirestoreId", "==", data.studentFirestoreId))
                                : query(attendanceRef, where("studentId", "==", data.studentId));
                            const studentAttendanceSnap = await getDocs(qStudent);
                            
                            let total = 0;
                            let totalAbsences = 0;
                            
                            studentAttendanceSnap.docs.forEach(d => {
                                const rec = d.data() as AttendanceRecord & { date: string };
                                if (rec.date >= LOCK_DATE && rec.status !== "TR") {
                                    total++;
                                    if (rec.status === "F") {
                                        totalAbsences++;
                                    }
                                }
                            });
                            
                            const presenceRate = total > 0 ? Math.round(((total - totalAbsences) / total) * 100) : 0;

                            absences[clsNorm].push({ name: data.studentName, id: data.studentId, presenceRate });
                        };
                        absencesPromises.push(fetchStudentData());
                    }
                });

                await Promise.all(absencesPromises);

                // Sort absences within each class
                Object.keys(absences).forEach(cls => {
                    absences[cls].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
                });

                // Fetch all classes to find missing ones
                const studentsSnap = await getDocs(collection(db, "students"));
                const allClasses = Array.from(new Set(studentsSnap.docs.filter(d => d.data().status !== "TR").map(d => normalizeClassName(d.data().class as string))));
                
                const missing = allClasses
                    .filter(cls => !completedClassesToday.has(cls))
                    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

                setAbsencesByClass(absences);
                setMissingClasses(missing);
            } catch (err) {
                console.error("Erro ao buscar dados de faltas para impressão:", err);
            } finally {
                setLoading(false);
            }
        }

        fetchData();
    }, [date]);

    if (!date) {
        return <div className="p-8 text-center text-red-500 font-bold">Data não especificada na URL.</div>;
    }

    if (loading) {
        return <div className="p-8 text-center h-screen flex items-center justify-center text-xl font-bold text-gray-500">Gerando relatório de faltas...</div>;
    }

    const sortedClasses = Object.keys(absencesByClass).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    return (
        <div className="bg-white min-h-screen text-black p-4 sm:p-8 max-w-4xl mx-auto">
            <div className="print:hidden mb-8 text-center flex flex-col items-center">
                <button
                    onClick={() => window.print()}
                    className="bg-blue-600 text-white font-bold py-3 px-8 rounded-xl shadow hover:bg-blue-700 transition flex items-center gap-3"
                >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2-2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                    Imprimir Relatório
                </button>
                <p className="text-gray-500 mt-3 text-sm max-w-md">
                    Dica: Use Ctrl+P ou Cmd+P. Recomendamos marcar a opção &quot;Imprimir gráficos/cores de fundo&quot;.
                </p>
            </div>

            <div className="text-center mb-10 border-b-2 border-gray-200 pb-6">
                <h1 className="text-3xl font-extrabold uppercase tracking-widest text-gray-900 mb-2">Relatório Consolidado de Faltas</h1>
                <p className="text-lg text-gray-600 font-medium">
                    Referência: {new Date(date + "T00:00:00").toLocaleDateString("pt-BR")}
                </p>
            </div>

            {missingClasses.length > 0 && (
                <div className="mb-10 p-6 bg-red-50 border-l-4 border-red-500 rounded-r-xl break-inside-avoid">
                    <h2 className="text-xl font-bold text-red-800 mb-3 flex items-center gap-2">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Chamadas Pendentes (Aguardando Professor)
                    </h2>
                    <p className="text-sm text-red-700 mb-4">
                        Atenção: As turmas abaixo ainda não tiveram suas chamadas registradas hoje.
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {missingClasses.map(cls => (
                            <span key={cls} className="px-3 py-1 bg-white border border-red-200 text-red-700 font-bold rounded-lg shadow-sm">
                                Turma {cls}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {missingClasses.length === 0 && (
                <div className="mb-10 p-4 bg-green-50 border-l-4 border-green-500 rounded-r-xl break-inside-avoid flex items-center gap-3">
                    <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="font-bold text-green-800">Todas as chamadas previstas para hoje foram concluídas.</span>
                </div>
            )}

            <div className="space-y-8">
                <h2 className="text-2xl font-bold text-gray-800 border-b pb-2">Alunos Faltosos (Busca Ativa)</h2>
                
                {sortedClasses.length === 0 ? (
                    <div className="p-8 text-center bg-gray-50 rounded-xl border border-gray-200 break-inside-avoid">
                        <p className="text-gray-500 font-bold text-lg">Nenhuma falta foi registrada nas turmas que já realizaram chamada hoje.</p>
                    </div>
                ) : (
                    sortedClasses.map(cls => (
                        <div key={cls} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden break-inside-avoid">
                            <div className="bg-gray-100 px-5 py-3 border-b border-gray-200 flex justify-between items-center">
                                <h3 className="font-bold text-lg text-gray-800">Turma {cls}</h3>
                                <span className="bg-red-100 text-red-700 py-1 px-3 rounded-full text-sm font-bold">
                                    {absencesByClass[cls].length} {absencesByClass[cls].length === 1 ? 'falta' : 'faltas'}
                                </span>
                            </div>
                            <div className="px-5 py-4">
                                <ul className="space-y-2">
                                    {absencesByClass[cls].map(student => {
                                        const isLowPresence = student.presenceRate <= 85;
                                        return (
                                            <li key={student.id} className="flex gap-4 items-center text-gray-700">
                                                <span className="text-gray-400 font-mono w-6 text-right">#{student.id}</span>
                                                <span className="font-medium flex-1">{student.name}</span>
                                                <span className={`text-sm font-bold ${isLowPresence ? 'text-red-600' : 'text-gray-500'}`}>
                                                    ({student.presenceRate}% freq.)
                                                </span>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <div className="mt-16 text-center text-gray-400 text-sm print:block hidden">
                <p>Relatório gerado em {new Date().toLocaleString("pt-BR")}</p>
                <p>App de Chamada Escolar</p>
            </div>
        </div>
    );
}

export default function PrintAbsencesPage() {
    return (
        <Suspense fallback={<div className="p-8 text-center text-xl font-bold">Carregando Tela de Impressão...</div>}>
            <PrintAbsencesContent />
        </Suspense>
    );
}
