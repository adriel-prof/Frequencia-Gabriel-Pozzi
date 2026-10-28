"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebaseConfig";
import { Suspense } from "react";

import { useAuth } from "@/context/AuthContext";

type AttendanceRecord = {
    studentId: number;
    studentName: string;
    studentClass: string;
    status: "P" | "F" | "D" | "A" | "TR";
    studentFirestoreId?: string;
};

type ActiveStudentRecord = {
    firestoreId: string;
    id: number;
    name: string;
    class: string;
    status?: string;
    dispensed?: boolean;
};

function PrintAbsencesContent() {
    const searchParams = useSearchParams();
    const date = searchParams.get("date");
    const { loading: authLoading } = useAuth();
    
    const [absencesByClass, setAbsencesByClass] = useState<Record<string, { name: string; id: number; presenceRate: number }[]>>({});
    const [missingClasses, setMissingClasses] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    useEffect(() => {
        if (!date || authLoading) return;

        async function fetchData() {
            setLoading(true);
            setErrorMsg(null);
            try {
                if (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) {
                    const { mockDb } = await import("@/lib/mockDatabase");
                    
                    const normalizeClassName = (name: string) => name ? name.trim().toUpperCase().replace(/°/g, 'º') : "";
                    
                    const allStudents = mockDb.getStudents() as Array<ReturnType<typeof mockDb.getStudents>[number] & { dispensed?: boolean }>;
                    const allStudentsById = new Map(allStudents.map(s => [s.firestoreId, s]));
                    const studentsList = allStudents.filter(s => s.status !== "TR" && !s.dispensed);
                    const activeById = new Map(studentsList.map(s => [s.firestoreId, s]));
                    const activeByName = new Map(studentsList.map(s => [s.name.trim().toUpperCase(), s]));
                    const trNames = new Set(allStudents.filter(s => s.status === "TR").map(s => s.name.trim().toUpperCase()));

                    const dispensedIds = new Set<string>();
                    const dispensedNames = new Set<string>();
                    mockDb.getMedicalDispensations().forEach(d => {
                        const dates = Array.isArray(d.dates) ? d.dates : [];
                        const isCovered = date ? (dates.includes(date) || (d.startDate <= date && d.endDate >= date)) : false;
                        if (isCovered) {
                            dispensedIds.add(d.studentFirestoreId);
                            if (d.studentName) dispensedNames.add(d.studentName.trim().toUpperCase());
                        }
                    });

                    const recordsData = mockDb.getAttendance(date || undefined) as unknown as AttendanceRecord[];
                    const completedClassesToday = new Set<string>();
                    const LOCK_DATE = "2026-04-06";
                    
                    const absences: Record<string, { name: string; id: number; presenceRate: number }[]> = {};
                    
                    recordsData.forEach(data => {
                        const clsNorm = normalizeClassName(data.studentClass);
                        completedClassesToday.add(clsNorm);

                        // No relatório de faltas só devem aparecer os estudantes marcados com falta ("F")
                        if (data.status !== "F") return;

                        const fId = data.studentFirestoreId;
                        const normName = (data.studentName || "").trim().toUpperCase();
                        if (trNames.has(normName)) return;

                        const activeStudent = fId
                            ? (allStudentsById.has(fId) ? activeById.get(fId) : activeByName.get(normName))
                            : activeByName.get(normName);

                        // Ignora alunos excluídos, TR, transferidos de turma ou com dispensa médica ativa na data
                        if (!activeStudent) return;
                        if (activeStudent.status === "TR" || activeStudent.dispensed) return;
                        if (normalizeClassName(activeStudent.class) !== clsNorm) return;
                        if (dispensedIds.has(activeStudent.firestoreId) || (fId && dispensedIds.has(fId)) || dispensedNames.has(activeStudent.name.trim().toUpperCase())) return;
                        
                        if (!absences[clsNorm]) {
                            absences[clsNorm] = [];
                        }
                        
                        // Busca histórico deste aluno no banco mock
                        const studentRecords = (mockDb.getAttendance() as unknown as (AttendanceRecord & { date: string })[])
                            .filter(r => r.studentFirestoreId === activeStudent.firestoreId || r.studentName.trim().toUpperCase() === activeStudent.name.trim().toUpperCase());
                            
                        let total = 0;
                        let totalAbsences = 0;
                        
                        studentRecords.forEach(rec => {
                            if (rec.date >= LOCK_DATE && rec.status !== "TR" && rec.status !== "D") {
                                total++;
                                if (rec.status === "F") {
                                    totalAbsences++;
                                }
                            }
                        });
                        
                        const presenceRate = total > 0 ? Math.round(((total - totalAbsences) / total) * 100) : 0;
                        absences[clsNorm].push({ name: activeStudent.name, id: activeStudent.id, presenceRate });
                    });
                    
                    // Ordena
                    Object.keys(absences).forEach(cls => {
                        absences[cls].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
                    });
                    
                    const allClasses = Array.from(new Set(studentsList.map(s => normalizeClassName(s.class))));
                    const missing = allClasses
                        .filter(cls => !completedClassesToday.has(cls))
                        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
                        
                    setAbsencesByClass(absences);
                    setMissingClasses(missing);
                    setLoading(false);
                    return;
                }

                // Busca diretamente do Firestore (attendance, medical_dispensations e students) para nunca usar cache obsoleto
                const [snapshot, dispSnap, studentsSnap] = await Promise.all([
                    getDocs(query(collection(db, "attendance"), where("date", "==", date))),
                    getDocs(collection(db, "medical_dispensations")),
                    getDocs(collection(db, "students"))
                ]);

                const normalizeClassName = (name: string) => name ? name.trim().toUpperCase().replace(/°/g, 'º') : "";

                const dispensedIds = new Set<string>();
                const dispensedNames = new Set<string>();
                dispSnap.docs.forEach(d => {
                    const dData = d.data();
                    const dates: string[] = Array.isArray(dData.dates) ? dData.dates : [];
                    const isCovered = date ? (dates.includes(date) || (dData.startDate && dData.endDate && dData.startDate <= date && dData.endDate >= date)) : false;
                    if (isCovered) {
                        if (dData.studentFirestoreId) dispensedIds.add(dData.studentFirestoreId);
                        dispensedIds.add(d.id);
                        if (dData.studentName) dispensedNames.add(String(dData.studentName).trim().toUpperCase());
                    }
                });

                const allStudentsById = new Map<string, ActiveStudentRecord>();
                const activeById = new Map<string, ActiveStudentRecord>();
                const activeByName = new Map<string, ActiveStudentRecord>();
                const trNames = new Set<string>();

                studentsSnap.docs.forEach(d => {
                    const sData = d.data();
                    const rec: ActiveStudentRecord = {
                        firestoreId: d.id,
                        id: Number(sData.id || 0),
                        name: (sData.name as string) || "",
                        class: (sData.class as string) || "",
                        status: sData.status as string | undefined,
                        dispensed: Boolean(sData.dispensed)
                    };
                    allStudentsById.set(d.id, rec);
                    const normName = rec.name.trim().toUpperCase();
                    if (rec.status === "TR") {
                        if (normName) trNames.add(normName);
                        return;
                    }
                    if (rec.dispensed) return;
                    activeById.set(d.id, rec);
                    if (normName) {
                        activeByName.set(normName, rec);
                    }
                });
                
                const completedClassesToday = new Set<string>();
                const absencesPromises: Promise<void>[] = [];
                const absences: Record<string, { name: string; id: number; presenceRate: number }[]> = {};
                const addedStudentsPerClass = new Map<string, Set<string>>();

                snapshot.docs.forEach(docSnap => {
                    const data = docSnap.data() as AttendanceRecord;
                    const clsNorm = normalizeClassName(data.studentClass);
                    completedClassesToday.add(clsNorm);

                    // No relatório de faltas só devem aparecer os estudantes marcados com falta ("F")
                    if (data.status !== "F") return;

                    let fId = data.studentFirestoreId;
                    if (!fId) {
                        const match = docSnap.id.match(/^att_(.+?)_\d{8}$/);
                        if (match) fId = match[1];
                    }

                    const normName = (data.studentName || "").trim().toUpperCase();
                    if (trNames.has(normName)) return;

                    const activeStudent = fId
                        ? (allStudentsById.has(fId) ? activeById.get(fId) : activeByName.get(normName))
                        : activeByName.get(normName);

                    // Ignora alunos excluídos, TR, transferidos para outra turma ou com dispensa médica ativa
                    if (!activeStudent) return;
                    if (activeStudent.status === "TR" || activeStudent.dispensed) return;
                    if (normalizeClassName(activeStudent.class) !== clsNorm) return;

                    const resolvedId = activeStudent.firestoreId;
                    if (dispensedIds.has(resolvedId) || (fId && dispensedIds.has(fId)) || dispensedNames.has(activeStudent.name.trim().toUpperCase())) return;

                    if (!addedStudentsPerClass.has(clsNorm)) {
                        addedStudentsPerClass.set(clsNorm, new Set());
                    }
                    if (addedStudentsPerClass.get(clsNorm)!.has(resolvedId)) return;
                    addedStudentsPerClass.get(clsNorm)!.add(resolvedId);

                    if (!absences[clsNorm]) {
                        absences[clsNorm] = [];
                    }
                    
                    const fetchStudentData = async () => {
                        let presenceRate = 0;
                        if (resolvedId) {
                            const statsRef = doc(db, "student_stats", resolvedId);
                            const statsSnap = await getDoc(statsRef);
                            if (statsSnap.exists()) {
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                const statsData = statsSnap.data() as any;
                                const presences = Number(statsData?.presences || 0);
                                const stuAbsences = Number(statsData?.absences || 0);
                                const evalDays = (presences + stuAbsences) > 0
                                    ? (presences + stuAbsences)
                                    : Math.max(0, Number(statsData?.totalDays || 0) - Number(statsData?.dispensed || 0));
                                presenceRate = evalDays > 0 ? Math.round(((evalDays - stuAbsences) / evalDays) * 100) : 0;
                            }
                        }

                        absences[clsNorm].push({
                            name: activeStudent.name,
                            id: activeStudent.id,
                            presenceRate
                        });
                    };
                    absencesPromises.push(fetchStudentData());
                });

                await Promise.all(absencesPromises);

                // Sort absences within each class
                Object.keys(absences).forEach(cls => {
                    absences[cls].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
                });

                // Fetch all classes from live active students
                const allClasses = Array.from(new Set(Array.from(activeById.values()).map(d => normalizeClassName(d.class))));
                
                const missing = allClasses
                    .filter(cls => !completedClassesToday.has(cls))
                    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

                setAbsencesByClass(absences);
                setMissingClasses(missing);
            } catch (err) {
                console.error("Erro ao buscar dados de faltas para impressão:", err);
                const isQuota = String(err).includes("quota") || String(err).includes("RESOURCE_EXHAUSTED");
                setErrorMsg(isQuota
                    ? "🚨 Cota diária gratuita de leituras do Firebase (50 mil) esgotada hoje. Os dados voltarão a ser exibidos automaticamente assim que a cota for renovada à meia-noite (UTC)."
                    : "Erro ao buscar dados de faltas para impressão. Verifique sua conexão e tente novamente."
                );
            } finally {
                setLoading(false);
            }
        }

        fetchData();
    }, [date, authLoading]);

    if (!date) {
        return <div className="p-8 text-center text-red-500 font-bold">Data não especificada na URL.</div>;
    }

    if (loading) {
        return <div className="p-8 text-center h-screen flex items-center justify-center text-xl font-bold text-gray-500">Gerando relatório de faltas...</div>;
    }

    const sortedClasses = Object.keys(absencesByClass).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    return (
        <div className="bg-white min-h-screen text-black p-4 sm:p-8 max-w-4xl mx-auto">
            {errorMsg && (
                <div className="mb-6 p-4 bg-red-100 border border-red-300 text-red-800 rounded-xl font-medium text-center">
                    {errorMsg}
                </div>
            )}
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
