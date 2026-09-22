"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { collection, query, where, getDocs, doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebaseConfig";
import { Suspense } from "react";

import { useStudents } from "@/context/StudentsContext";
import { useAuth } from "@/context/AuthContext";

type AttendanceRecord = {
    studentId: number;
    studentName: string;
    studentClass: string;
    status: "P" | "F" | "D" | "A" | "TR";
    studentFirestoreId?: string;
};

type AbsentStudentInfo = {
    name: string;
    id: number;
    presenceRate: number;
    studentFirestoreId?: string;
};

type AbsenceJustification = {
    reasonCategory: string;
    notes: string;
    statusBuscaAtiva: string;
    saving?: boolean;
};

const PRESET_REASONS = [
    "❓ Sem Justificativa (Injustificada)",
    "🏥 Atestado Médico / Saúde",
    "🚌 Problema de Transporte / Escolar",
    "🌧️ Motivo Climático / Chuva",
    "👨‍👩‍👧 Assunto Familiar (Informado pelos pais)",
    "☎️ Busca Ativa: Ligação Efetuada (Sem Resposta)",
    "✏️ Outros (Observação em texto)"
];

const STATUS_OPTIONS = [
    { label: "Sem Contato", color: "bg-red-100 text-red-700 border-red-200" },
    { label: "Ligação Efetuada", color: "bg-green-100 text-green-700 border-green-200" },
    { label: "Acompanhamento", color: "bg-amber-100 text-amber-700 border-amber-200" },
    { label: "Atestado Entregue", color: "bg-blue-100 text-blue-700 border-blue-200" },
    { label: "Visita Agendada", color: "bg-purple-100 text-purple-700 border-purple-200" }
];

function PrintAbsencesContent() {
    const searchParams = useSearchParams();
    const date = searchParams.get("date");
    const { students: globalStudents, loading: studentsLoading } = useStudents();
    const { user } = useAuth();
    
    const [absencesByClass, setAbsencesByClass] = useState<Record<string, AbsentStudentInfo[]>>({});
    const [justifications, setJustifications] = useState<Record<string, AbsenceJustification>>({});
    const [missingClasses, setMissingClasses] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    useEffect(() => {
        if (!date) return;

        async function fetchData() {
            if (studentsLoading) return;
            setLoading(true);
            setErrorMsg(null);
            try {
                const normalizeClassName = (name: string) => name ? name.trim().toUpperCase().replace(/°/g, 'º') : "";

                if (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) {
                    const { mockDb } = await import("@/lib/mockDatabase");
                    const recordsData = mockDb.getAttendance(date || undefined) as unknown as AttendanceRecord[];
                    const completedClassesToday = new Set<string>();
                    const LOCK_DATE = "2026-04-06";
                    
                    const absences: Record<string, AbsentStudentInfo[]> = {};
                    
                    recordsData.forEach(data => {
                        const clsNorm = normalizeClassName(data.studentClass);
                        completedClassesToday.add(clsNorm);
                        
                        if (data.status === "F") {
                            if (!absences[clsNorm]) {
                                absences[clsNorm] = [];
                            }
                            
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
                            absences[clsNorm].push({ name: data.studentName, id: data.studentId, presenceRate, studentFirestoreId: data.studentFirestoreId });
                        }
                    });
                    
                    Object.keys(absences).forEach(cls => {
                        absences[cls].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
                    });
                    
                    const studentsList = mockDb.getStudents().filter(s => s.status !== "TR");
                    const allClasses = Array.from(new Set(studentsList.map(s => normalizeClassName(s.class))));
                    const missing = allClasses
                        .filter(cls => !completedClassesToday.has(cls))
                        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
                        
                    // Load mock justifications
                    const mockJustifMap: Record<string, AbsenceJustification> = {};
                    Object.values(absences).flat().forEach(s => {
                        if (s.studentFirestoreId) {
                            const saved = localStorage.getItem(`mock_justif_${date}_${s.studentFirestoreId}`);
                            if (saved) {
                                try { mockJustifMap[s.studentFirestoreId] = JSON.parse(saved); } catch(e) { console.warn(e); }
                            }
                        }
                    });

                    setJustifications(mockJustifMap);
                    setAbsencesByClass(absences);
                    setMissingClasses(missing);
                    setLoading(false);
                    return;
                }

                // Fetch attendance records for the date
                const q = query(collection(db, "attendance"), where("date", "==", date));
                const snapshot = await getDocs(q);
                
                const completedClassesToday = new Set<string>();
                const absencesPromises: Promise<void>[] = [];
                const absences: Record<string, AbsentStudentInfo[]> = {};

                snapshot.docs.forEach(docSnap => {
                    const data = docSnap.data() as AttendanceRecord;
                    const clsNorm = normalizeClassName(data.studentClass);
                    completedClassesToday.add(clsNorm);

                    if (data.status === "F") {
                        if (!absences[clsNorm]) {
                            absences[clsNorm] = [];
                        }
                        
                        const fetchStudentData = async () => {
                            let presenceRate = 0;
                            if (data.studentFirestoreId) {
                                const statsRef = doc(db, "student_stats", data.studentFirestoreId);
                                const statsSnap = await getDoc(statsRef);
                                if (statsSnap.exists()) {
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    const statsData = statsSnap.data() as any;
                                    const totalDays = Number(statsData?.totalDays || 0);
                                    const absencesCount = Number(statsData?.absences || 0);
                                    presenceRate = totalDays > 0 ? Math.round(((totalDays - absencesCount) / totalDays) * 100) : 0;
                                }
                            }

                            absences[clsNorm].push({ name: data.studentName, id: data.studentId, presenceRate, studentFirestoreId: data.studentFirestoreId });
                        };
                        absencesPromises.push(fetchStudentData());
                    }
                });

                await Promise.all(absencesPromises);

                Object.keys(absences).forEach(cls => {
                    absences[cls].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
                });

                // Fetch justifications for current date
                const justifQuery = query(collection(db, "absence_justifications"), where("date", "==", date));
                const justifSnap = await getDocs(justifQuery);
                const justifMap: Record<string, AbsenceJustification> = {};
                justifSnap.docs.forEach(dSnap => {
                    const d = dSnap.data();
                    if (d.studentFirestoreId) {
                        justifMap[d.studentFirestoreId] = {
                            reasonCategory: d.reasonCategory || "❓ Sem Justificativa (Injustificada)",
                            notes: d.notes || "",
                            statusBuscaAtiva: d.statusBuscaAtiva || "Sem Contato"
                        };
                    }
                });
                setJustifications(justifMap);

                // Fetch missing classes from StudentsContext
                const allClasses = Array.from(new Set(globalStudents.filter(d => d.status !== "TR").map(d => normalizeClassName(d.class as string))));
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
    }, [date, globalStudents, studentsLoading]);

    const handleSaveJustification = async (
        studentFirestoreId: string,
        studentId: number,
        studentName: string,
        studentClass: string,
        fields: Partial<AbsenceJustification>
    ) => {
        if (!date || !studentFirestoreId) return;

        const current = justifications[studentFirestoreId] || {
            reasonCategory: "❓ Sem Justificativa (Injustificada)",
            notes: "",
            statusBuscaAtiva: "Sem Contato"
        };

        const updated: AbsenceJustification = {
            ...current,
            ...fields,
            saving: true
        };

        setJustifications(prev => ({ ...prev, [studentFirestoreId]: updated }));

        try {
            if (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) {
                const key = `mock_justif_${date}_${studentFirestoreId}`;
                localStorage.setItem(key, JSON.stringify(updated));
                setTimeout(() => {
                    setJustifications(prev => ({ ...prev, [studentFirestoreId]: { ...updated, saving: false } }));
                }, 300);
                return;
            }

            const docRef = doc(db, "absence_justifications", `${date}_${studentFirestoreId}`);
            await setDoc(docRef, {
                date,
                studentFirestoreId,
                studentId,
                studentName,
                studentClass,
                reasonCategory: updated.reasonCategory,
                notes: updated.notes,
                statusBuscaAtiva: updated.statusBuscaAtiva,
                contactedBy: user?.email || "gestor",
                updatedAt: serverTimestamp()
            }, { merge: true });

            setJustifications(prev => ({ ...prev, [studentFirestoreId]: { ...updated, saving: false } }));
        } catch (err) {
            console.error("Erro ao salvar justificativa de falta:", err);
            setJustifications(prev => ({ ...prev, [studentFirestoreId]: { ...current, saving: false } }));
        }
    };

    if (!date) {
        return <div className="p-8 text-center text-red-500 font-bold">Data não especificada na URL.</div>;
    }

    if (loading) {
        return <div className="p-8 text-center h-screen flex items-center justify-center text-xl font-bold text-gray-500">Gerando relatório de faltas...</div>;
    }

    const sortedClasses = Object.keys(absencesByClass).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    return (
        <div className="bg-white min-h-screen text-black p-4 sm:p-8 max-w-5xl mx-auto">
            {errorMsg && (
                <div className="mb-6 p-4 bg-red-100 border border-red-300 text-red-800 rounded-xl font-medium text-center">
                    {errorMsg}
                </div>
            )}
            
            {/* Header de Ações no Navegador (Oculto ao Imprimir) */}
            <div className="print:hidden mb-8 text-center flex flex-col items-center gap-3">
                <button
                    onClick={() => window.print()}
                    className="bg-blue-600 text-white font-bold py-3.5 px-8 rounded-xl shadow-lg hover:bg-blue-700 transition flex items-center gap-3 text-base"
                >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2-2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                    Imprimir Relatório com Motivos
                </button>
                <p className="text-gray-500 text-xs max-w-md">
                    💡 Preencha o <strong>Motivo da Falta</strong> e <strong>Status da Busca Ativa</strong> diretamente na tela. As justificativas são salvas automaticamente e incluídas no documento impresso.
                </p>
            </div>

            <div className="text-center mb-8 border-b-2 border-gray-200 pb-6">
                <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-widest text-gray-900 mb-2">Relatório Consolidado de Faltas & Busca Ativa</h1>
                <p className="text-base sm:text-lg text-gray-600 font-bold">
                    Referência: {new Date(date + "T00:00:00").toLocaleDateString("pt-BR")}
                </p>
            </div>

            {missingClasses.length > 0 && (
                <div className="mb-8 p-5 bg-red-50 border-l-4 border-red-500 rounded-r-xl break-inside-avoid">
                    <h2 className="text-lg font-bold text-red-800 mb-2 flex items-center gap-2">
                        <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Chamadas Pendentes (Aguardando Professor)
                    </h2>
                    <p className="text-xs text-red-700 mb-3">
                        Atenção: As turmas abaixo ainda não tiveram suas chamadas registradas hoje.
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {missingClasses.map(cls => (
                            <span key={cls} className="px-3 py-1 bg-white border border-red-200 text-red-700 font-bold rounded-lg text-xs shadow-sm">
                                Turma {cls}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {missingClasses.length === 0 && (
                <div className="mb-8 p-4 bg-green-50 border-l-4 border-green-500 rounded-r-xl break-inside-avoid flex items-center gap-3">
                    <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="font-bold text-green-800 text-sm">Todas as chamadas previstas para hoje foram concluídas.</span>
                </div>
            )}

            <div className="space-y-8">
                <h2 className="text-xl font-extrabold text-gray-800 border-b pb-2 flex justify-between items-center">
                    <span>Alunos Faltosos (Busca Ativa)</span>
                    <span className="text-xs font-normal text-gray-500 print:hidden">Clique nos campos para alterar justificativas</span>
                </h2>
                
                {sortedClasses.length === 0 ? (
                    <div className="p-8 text-center bg-gray-50 rounded-xl border border-gray-200 break-inside-avoid">
                        <p className="text-gray-500 font-bold text-lg">Nenhuma falta foi registrada nas turmas que já realizaram chamada hoje.</p>
                    </div>
                ) : (
                    sortedClasses.map(cls => (
                        <div key={cls} className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden break-inside-avoid">
                            <div className="bg-gray-100 px-5 py-3 border-b border-gray-200 flex justify-between items-center">
                                <h3 className="font-black text-lg text-gray-800">Turma {cls}</h3>
                                <span className="bg-red-100 text-red-700 py-1 px-3 rounded-full text-xs font-bold border border-red-200">
                                    {absencesByClass[cls].length} {absencesByClass[cls].length === 1 ? 'falta' : 'faltas'}
                                </span>
                            </div>
                            <div className="px-5 py-4">
                                <div className="space-y-4">
                                    {absencesByClass[cls].map(student => {
                                        const isLowPresence = student.presenceRate <= 85;
                                        const sId = student.studentFirestoreId || `id_${student.id}`;
                                        const justif = justifications[sId] || {
                                            reasonCategory: "❓ Sem Justificativa (Injustificada)",
                                            notes: "",
                                            statusBuscaAtiva: "Sem Contato"
                                        };

                                        const selectedStatus = STATUS_OPTIONS.find(o => o.label === justif.statusBuscaAtiva) || STATUS_OPTIONS[0];

                                        return (
                                            <div key={student.id} className="p-3 bg-gray-50/70 rounded-xl border border-gray-100 hover:border-gray-200 transition-colors">
                                                
                                                {/* Linha Superior: Dados do Aluno */}
                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                                        <span className="text-gray-400 font-mono text-xs w-6 text-right flex-shrink-0">#{student.id}</span>
                                                        <span className="font-bold text-gray-900 text-sm truncate">{student.name}</span>
                                                        <span className={`text-xs font-extrabold px-2 py-0.5 rounded-full ${isLowPresence ? 'bg-red-100 text-red-700' : 'bg-gray-200 text-gray-700'}`}>
                                                            {student.presenceRate}% freq.
                                                        </span>
                                                    </div>

                                                    {/* Status da Busca Ativa (Interativo na tela) */}
                                                    <div className="flex items-center gap-2 print:hidden">
                                                        <select
                                                            value={justif.statusBuscaAtiva}
                                                            onChange={(e) => handleSaveJustification(sId, student.id, student.name, cls, { statusBuscaAtiva: e.target.value })}
                                                            className={`text-xs font-bold px-2.5 py-1 rounded-lg border outline-none cursor-pointer ${selectedStatus.color}`}
                                                        >
                                                            {STATUS_OPTIONS.map(opt => (
                                                                <option key={opt.label} value={opt.label}>{opt.label}</option>
                                                            ))}
                                                        </select>
                                                        {justif.saving && (
                                                            <span className="text-[10px] text-gray-400 font-semibold animate-pulse">Salvando...</span>
                                                        )}
                                                    </div>

                                                    {/* Status da Busca Ativa (Formatado para Impressão no papel) */}
                                                    <div className="hidden print:block text-xs font-bold text-gray-700">
                                                        Status: [{justif.statusBuscaAtiva}]
                                                    </div>
                                                </div>

                                                {/* Linha Inferior: Controles de Motivo e Observação (Modo Tela) */}
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 print:hidden">
                                                    <div>
                                                        <label className="block text-[11px] font-bold text-gray-500 mb-1">Motivo da Falta:</label>
                                                        <select
                                                            value={justif.reasonCategory}
                                                            onChange={(e) => handleSaveJustification(sId, student.id, student.name, cls, { reasonCategory: e.target.value })}
                                                            className="w-full text-xs font-semibold p-2 border border-gray-300 rounded-lg bg-white text-gray-800 outline-none focus:ring-2 focus:ring-blue-500"
                                                        >
                                                            {PRESET_REASONS.map(r => (
                                                                <option key={r} value={r}>{r}</option>
                                                            ))}
                                                        </select>
                                                    </div>

                                                    <div>
                                                        <label className="block text-[11px] font-bold text-gray-500 mb-1">Observação / Detalhes do Contato:</label>
                                                        <input
                                                            type="text"
                                                            placeholder="Ex: Mãe avisou que o aluno levará atestado amanhã..."
                                                            value={justif.notes}
                                                            onChange={(e) => setJustifications(prev => ({
                                                                ...prev,
                                                                [sId]: { ...(prev[sId] || justif), notes: e.target.value }
                                                            }))}
                                                            onBlur={(e) => handleSaveJustification(sId, student.id, student.name, cls, { notes: e.target.value })}
                                                            className="w-full text-xs p-2 border border-gray-300 rounded-lg bg-white text-gray-800 outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400 font-medium"
                                                        />
                                                    </div>
                                                </div>

                                                {/* Exibição Formatada na Impressão Papel / PDF */}
                                                <div className="hidden print:block pt-1 border-t border-gray-200 mt-2 text-xs">
                                                    <p className="font-bold text-gray-800">
                                                        Motivo: <span className="font-semibold text-gray-700">{justif.reasonCategory}</span>
                                                    </p>
                                                    {justif.notes && (
                                                        <p className="text-gray-600 font-medium italic mt-0.5">
                                                            Obs: &quot;{justif.notes}&quot;
                                                        </p>
                                                    )}
                                                </div>

                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <div className="mt-16 text-center text-gray-400 text-sm print:block hidden">
                <p>Relatório Consolidado de Faltas & Busca Ativa — Gerado em {new Date().toLocaleString("pt-BR")}</p>
                <p>App de Chamada Escolar</p>
            </div>
        </div>
    );
}

export default function PrintAbsencesPage() {
    return (
        <Suspense fallback={<div className="p-8 text-center text-xl font-bold">Carregando Relatório de Faltas...</div>}>
            <PrintAbsencesContent />
        </Suspense>
    );
}
