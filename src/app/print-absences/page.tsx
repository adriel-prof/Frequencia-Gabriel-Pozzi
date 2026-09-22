"use client";

import { useEffect, useState, useMemo } from "react";
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
    accumulatedAbsences: number;
    studentFirestoreId?: string;
    studentClass: string;
};

type AbsenceJustification = {
    reasonCategory: string;
    notes: string;
    statusBuscaAtiva: string;
    saving?: boolean;
};

const PRESET_REASONS = [
    "Sem Justificativa (Injustificada)",
    "Problema de Saúde (Atestado Médico)",
    "Entramos em contato, aguardando resposta",
    "Mudança de Endereço/Transporte",
    "Problema familiar relatado pela mãe",
    "Problema de Transporte / Escolar",
    "Motivo Climático / Chuva",
    "Outros (Observação em texto)"
];

const STATUS_OPTIONS = [
    { label: "Sem Contato", color: "bg-slate-100 text-slate-700 border-slate-200" },
    { label: "Busca Ativa Iniciada", color: "bg-cyan-100 text-cyan-800 border-cyan-200" },
    { label: "Ligação Efetuada", color: "bg-emerald-100 text-emerald-800 border-emerald-200" },
    { label: "Acompanhamento", color: "bg-amber-100 text-amber-800 border-amber-200" },
    { label: "Visita Agendada", color: "bg-purple-100 text-purple-800 border-purple-200" },
    { label: "Atestado Entregue", color: "bg-blue-100 text-blue-800 border-blue-200" }
];

const AVATAR_COLORS = [
    "bg-emerald-100 text-emerald-800 border-emerald-200",
    "bg-blue-100 text-blue-800 border-blue-200",
    "bg-purple-100 text-purple-800 border-purple-200",
    "bg-amber-100 text-amber-800 border-amber-200",
    "bg-rose-100 text-rose-800 border-rose-200",
    "bg-indigo-100 text-indigo-800 border-indigo-200"
];

function getInitials(name: string) {
    const parts = name.trim().split(" ");
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getAvatarColor(name: string) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % AVATAR_COLORS.length;
    return AVATAR_COLORS[index];
}

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

    // Filters and Search
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedClassFilter, setSelectedClassFilter] = useState("ALL");

    // Modal state for "Registrar Atendimento"
    const [modalStudent, setModalStudent] = useState<AbsentStudentInfo | null>(null);
    const [modalReason, setModalReason] = useState("");
    const [modalStatus, setModalStatus] = useState("");
    const [modalNotes, setModalNotes] = useState("");

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
                            absences[clsNorm].push({
                                name: data.studentName,
                                id: data.studentId,
                                presenceRate,
                                accumulatedAbsences: totalAbsences || 1,
                                studentFirestoreId: data.studentFirestoreId,
                                studentClass: clsNorm
                            });
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
                                try { mockJustifMap[s.studentFirestoreId] = JSON.parse(saved); } catch (e) { console.warn(e); }
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
                            let accumulatedAbsences = 1;

                            if (data.studentFirestoreId) {
                                const statsRef = doc(db, "student_stats", data.studentFirestoreId);
                                const statsSnap = await getDoc(statsRef);
                                if (statsSnap.exists()) {
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    const statsData = statsSnap.data() as any;
                                    const totalDays = Number(statsData?.totalDays || 0);
                                    accumulatedAbsences = Number(statsData?.absences || 0);
                                    presenceRate = totalDays > 0 ? Math.round(((totalDays - accumulatedAbsences) / totalDays) * 100) : 0;
                                }
                            }

                            absences[clsNorm].push({
                                name: data.studentName,
                                id: data.studentId,
                                presenceRate,
                                accumulatedAbsences: accumulatedAbsences || 1,
                                studentFirestoreId: data.studentFirestoreId,
                                studentClass: clsNorm
                            });
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
                            reasonCategory: d.reasonCategory || "Sem Justificativa (Injustificada)",
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
            reasonCategory: "Sem Justificativa (Injustificada)",
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

    const handleOpenModal = (student: AbsentStudentInfo) => {
        const sId = student.studentFirestoreId || `id_${student.id}`;
        const justif = justifications[sId] || {
            reasonCategory: "Sem Justificativa (Injustificada)",
            notes: "",
            statusBuscaAtiva: "Sem Contato"
        };
        setModalStudent(student);
        setModalReason(justif.reasonCategory);
        setModalStatus(justif.statusBuscaAtiva);
        setModalNotes(justif.notes);
    };

    const handleSaveModal = async () => {
        if (!modalStudent) return;
        const sId = modalStudent.studentFirestoreId || `id_${modalStudent.id}`;
        await handleSaveJustification(
            sId,
            modalStudent.id,
            modalStudent.name,
            modalStudent.studentClass,
            {
                reasonCategory: modalReason,
                statusBuscaAtiva: modalStatus,
                notes: modalNotes
            }
        );
        setModalStudent(null);
    };

    // Calculate Summary Widgets Values
    const allAbsentStudents = useMemo(() => {
        return Object.values(absencesByClass).flat();
    }, [absencesByClass]);

    const filteredClasses = useMemo(() => {
        const result: Record<string, AbsentStudentInfo[]> = {};
        const term = searchTerm.toLowerCase().trim();

        Object.keys(absencesByClass).forEach(cls => {
            if (selectedClassFilter !== "ALL" && cls !== selectedClassFilter) {
                return;
            }

            const matchingStudents = absencesByClass[cls].filter(student =>
                student.name.toLowerCase().includes(term) ||
                student.id.toString().includes(term)
            );

            if (matchingStudents.length > 0 || (term === "" && selectedClassFilter === cls)) {
                result[cls] = matchingStudents;
            }
        });

        return result;
    }, [absencesByClass, searchTerm, selectedClassFilter]);

    const totalAbsentCount = allAbsentStudents.length;

    const overallFrequency = useMemo(() => {
        if (allAbsentStudents.length === 0) return 100;
        const sumRates = allAbsentStudents.reduce((acc, s) => acc + s.presenceRate, 0);
        return Math.round(sumRates / allAbsentStudents.length);
    }, [allAbsentStudents]);

    const totalBuscasAtivasCount = useMemo(() => {
        return Object.values(justifications).filter(j => j.statusBuscaAtiva && j.statusBuscaAtiva !== "Sem Contato").length;
    }, [justifications]);

    const sortedClassNames = Object.keys(filteredClasses).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    const allAvailableClasses = Object.keys(absencesByClass).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    if (!date) {
        return <div className="p-8 text-center text-red-500 font-bold">Data não especificada na URL.</div>;
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-8 text-slate-600">
                <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                <div className="text-lg font-bold">Carregando Relatório Interativo de Faltas & Busca Ativa...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#F4F6F8] text-slate-800 antialiased font-sans">
            
            {/* TOP NAVIGATION BAR (Screen Only - Hidden on Print) */}
            <header className="print:hidden bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-4">
                    
                    {/* App Brand Logo */}
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-md shadow-emerald-600/20">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 14l9-5-9-5-9 5 9 5z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0112 20.055a11.952 11.952 0 01-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
                            </svg>
                        </div>
                        <div>
                            <div className="flex items-center gap-1.5">
                                <span className="font-black text-slate-900 tracking-tight text-lg leading-none">SABER+</span>
                                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                            </div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Escola Digital</span>
                        </div>
                    </div>

                    {/* Controls: Search, Date Filter, Class Filter */}
                    <div className="flex flex-wrap items-center gap-3 flex-1 max-w-2xl justify-center sm:justify-end">
                        
                        {/* Search Input */}
                        <div className="relative flex-1 min-w-[180px] max-w-xs">
                            <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            <input
                                type="text"
                                placeholder="Buscar aluno por nome..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-100 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition text-slate-800 font-medium"
                            />
                        </div>

                        {/* Date Picker */}
                        <div className="flex items-center gap-2 bg-slate-100 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-700 font-semibold">
                            <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <input
                                type="date"
                                value={date}
                                onChange={(e) => {
                                    if (e.target.value) {
                                        window.location.href = `/print-absences?date=${e.target.value}`;
                                    }
                                }}
                                className="bg-transparent outline-none cursor-pointer text-slate-800 font-bold"
                            />
                        </div>

                        {/* Class Dropdown Filter */}
                        <div className="flex items-center gap-2 bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 font-semibold">
                            <select
                                value={selectedClassFilter}
                                onChange={(e) => setSelectedClassFilter(e.target.value)}
                                className="bg-transparent outline-none cursor-pointer text-slate-800 font-bold"
                            >
                                <option value="ALL">Todas as Turmas</option>
                                {allAvailableClasses.map(cls => (
                                    <option key={cls} value={cls}>Turma {cls}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* User Profile Badge */}
                    <div className="flex items-center gap-3 pl-3 border-l border-slate-200">
                        <div className="relative">
                            <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-extrabold text-xs border-2 border-emerald-300 shadow-sm">
                                ME
                            </div>
                            <span className="w-2.5 h-2.5 bg-emerald-500 border-2 border-white rounded-full absolute bottom-0 right-0"></span>
                        </div>
                        <div className="text-left hidden lg:block">
                            <div className="text-xs font-bold text-slate-900 leading-tight">Maria Eduarda</div>
                            <div className="text-[10px] text-slate-500 font-semibold">Coordenadora</div>
                        </div>
                    </div>

                </div>
            </header>

            {/* MAIN CONTENT WRAPPER */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
                
                {errorMsg && (
                    <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-800 rounded-2xl font-semibold text-center text-sm shadow-sm">
                        {errorMsg}
                    </div>
                )}

                {/* Printable Header Banner (Visible on Screen & Print) */}
                <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
                            Relatório Interativo de Faltas & Busca Ativa
                        </h1>
                        <p className="text-xs sm:text-sm text-slate-500 font-semibold mt-1">
                            Referência: <span className="text-slate-800 font-bold">{new Date(date + "T00:00:00").toLocaleDateString("pt-BR")}</span> — Gestão de Atendimento Telefônico aos Pais
                        </p>
                    </div>

                    {/* Imprimir Relatório Top Button (Screen Only) */}
                    <div className="print:hidden flex items-center gap-3">
                        <button
                            onClick={() => window.print()}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-2.5 px-5 rounded-xl shadow-md hover:shadow-lg transition flex items-center gap-2 text-xs sm:text-sm cursor-pointer border border-emerald-500"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                            </svg>
                            Imprimir Relatório com Motivos
                        </button>
                    </div>
                </div>

                {/* Missing Classes Warning Banner */}
                {missingClasses.length > 0 && (
                    <div className="mb-6 p-4 bg-rose-50 border-l-4 border-rose-500 rounded-r-2xl shadow-sm break-inside-avoid">
                        <div className="flex items-center gap-2 text-rose-800 font-extrabold text-sm mb-1">
                            <svg className="w-5 h-5 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Chamadas Pendentes (Aguardando Professor)
                        </div>
                        <p className="text-xs text-rose-700 mb-2 font-medium">
                            Atenção: As turmas abaixo ainda não tiveram suas chamadas registradas no sistema hoje.
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {missingClasses.map(cls => (
                                <span key={cls} className="px-2.5 py-1 bg-white border border-rose-200 text-rose-700 font-bold rounded-lg text-xs shadow-2xs">
                                    Turma {cls}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {/* Content Layout Grid: Table Area (Left) vs Summary Widget (Right) */}
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
                    
                    {/* LEFT COLUMN: CLASSES & TABLES (3/4 width) */}
                    <div className="lg:col-span-3 space-y-6">
                        
                        {sortedClassNames.length === 0 ? (
                            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
                                <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                                <h3 className="text-lg font-bold text-slate-800 mb-1">Nenhuma falta encontrada</h3>
                                <p className="text-xs text-slate-500 max-w-md mx-auto font-medium">
                                    Não foram encontradas faltas registradas com os filtros atuais para esta data.
                                </p>
                            </div>
                        ) : (
                            sortedClassNames.map(cls => {
                                const students = filteredClasses[cls];
                                return (
                                    <div key={cls} className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden break-inside-avoid">
                                        
                                        {/* Class Header */}
                                        <div className="bg-slate-50 border-b border-slate-200 px-5 py-3.5 flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
                                                <h2 className="font-black text-slate-900 text-base tracking-tight">
                                                    Turma {cls}
                                                </h2>
                                                <span className="text-xs font-semibold text-slate-500">
                                                    ({students.length} {students.length === 1 ? 'Aluno Faltante' : 'Alunos Faltantes'})
                                                </span>
                                            </div>

                                            <span className="px-2.5 py-1 bg-rose-100 border border-rose-200 text-rose-700 font-extrabold rounded-full text-xs">
                                                {students.length} {students.length === 1 ? 'Falta' : 'Faltas'}
                                            </span>
                                        </div>

                                        {/* Responsive Interactive Table */}
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left border-collapse">
                                                <thead>
                                                    <tr className="bg-slate-100/60 border-b border-slate-200 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                                                        <th className="py-3 px-4">Aluno</th>
                                                        <th className="py-3 px-3 text-center">Turma</th>
                                                        <th className="py-3 px-3 text-center">Faltas</th>
                                                        <th className="py-3 px-3 text-center">Taxa Presença</th>
                                                        <th className="py-3 px-4">Motivo da Falta / Justificativa</th>
                                                        <th className="py-3 px-3 text-center">Status Busca Ativa</th>
                                                        <th className="py-3 px-3 text-center print:hidden">Ação</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100 text-xs font-medium">
                                                    {students.map((student, idx) => {
                                                        const sId = student.studentFirestoreId || `id_${student.id}`;
                                                        const justif = justifications[sId] || {
                                                            reasonCategory: "Sem Justificativa (Injustificada)",
                                                            notes: "",
                                                            statusBuscaAtiva: "Sem Contato"
                                                        };

                                                        const statusOpt = STATUS_OPTIONS.find(o => o.label === justif.statusBuscaAtiva) || STATUS_OPTIONS[0];

                                                        // Rate Badge Styling matching design
                                                        let rateBadgeStyle = "bg-emerald-600 text-white font-black";
                                                        if (student.presenceRate < 75) {
                                                            rateBadgeStyle = "bg-rose-500 text-white font-black";
                                                        } else if (student.presenceRate < 85) {
                                                            rateBadgeStyle = "bg-amber-500 text-white font-black";
                                                        }

                                                        return (
                                                            <tr key={student.id} className="hover:bg-slate-50/80 transition-colors">
                                                                
                                                                {/* Column 1: Aluno (Nº, Avatar, Name) */}
                                                                <td className="py-3 px-4">
                                                                    <div className="flex items-center gap-3">
                                                                        <span className="text-slate-400 font-mono text-[11px] font-bold w-4 text-right">
                                                                            {idx + 1}.
                                                                        </span>
                                                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs border ${getAvatarColor(student.name)} shadow-2xs`}>
                                                                            {getInitials(student.name)}
                                                                        </div>
                                                                        <div>
                                                                            <span className="font-bold text-slate-900 text-xs block leading-tight">
                                                                                {student.name}
                                                                            </span>
                                                                            <span className="text-[10px] text-slate-400 font-medium">
                                                                                ID #{student.id}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                </td>

                                                                {/* Column 2: Turma */}
                                                                <td className="py-3 px-3 text-center font-bold text-slate-700">
                                                                    {cls}
                                                                </td>

                                                                {/* Column 3: Faltas Acumuladas */}
                                                                <td className="py-3 px-3 text-center">
                                                                    <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-800 font-bold rounded-md text-xs">
                                                                        {student.accumulatedAbsences}
                                                                    </span>
                                                                </td>

                                                                {/* Column 4: Taxa de Presença Badge */}
                                                                <td className="py-3 px-3 text-center">
                                                                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs ${rateBadgeStyle} shadow-2xs`}>
                                                                        {student.presenceRate}%
                                                                    </span>
                                                                </td>

                                                                {/* Column 5: Motivo da Falta Dropdown / Notes */}
                                                                <td className="py-3 px-4">
                                                                    <div className="print:hidden space-y-1">
                                                                        <select
                                                                            value={justif.reasonCategory}
                                                                            onChange={(e) => handleSaveJustification(sId, student.id, student.name, cls, { reasonCategory: e.target.value })}
                                                                            className="w-full text-xs font-semibold p-1.5 border border-slate-200 rounded-lg bg-white text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                                                                        >
                                                                            {PRESET_REASONS.map(r => (
                                                                                <option key={r} value={r}>{r}</option>
                                                                            ))}
                                                                        </select>
                                                                        {justif.notes && (
                                                                            <p className="text-[11px] text-slate-500 italic truncate max-w-xs pl-1">
                                                                                &quot;{justif.notes}&quot;
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                    <div className="hidden print:block text-xs font-semibold text-slate-800">
                                                                        <div>{justif.reasonCategory}</div>
                                                                        {justif.notes && (
                                                                            <div className="text-slate-500 italic text-[11px]">Obs: {justif.notes}</div>
                                                                        )}
                                                                    </div>
                                                                </td>

                                                                {/* Column 6: Status Busca Ativa Pill */}
                                                                <td className="py-3 px-3 text-center">
                                                                    <div className="print:hidden">
                                                                        <select
                                                                            value={justif.statusBuscaAtiva}
                                                                            onChange={(e) => handleSaveJustification(sId, student.id, student.name, cls, { statusBuscaAtiva: e.target.value })}
                                                                            className={`text-xs font-extrabold px-2.5 py-1 rounded-full border outline-none cursor-pointer shadow-2xs ${statusOpt.color}`}
                                                                        >
                                                                            {STATUS_OPTIONS.map(opt => (
                                                                                <option key={opt.label} value={opt.label}>{opt.label}</option>
                                                                            ))}
                                                                        </select>
                                                                    </div>
                                                                    <div className="hidden print:block text-xs font-bold">
                                                                        <span className={`px-2 py-0.5 rounded-full ${statusOpt.color}`}>
                                                                            {justif.statusBuscaAtiva}
                                                                        </span>
                                                                    </div>
                                                                </td>

                                                                {/* Column 7: Action Button (Registrar Atendimento) */}
                                                                <td className="py-3 px-3 text-center print:hidden">
                                                                    <button
                                                                        onClick={() => handleOpenModal(student)}
                                                                        className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold px-3 py-1.5 rounded-xl text-[11px] transition shadow-2xs flex items-center justify-center gap-1 mx-auto whitespace-nowrap"
                                                                    >
                                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                                        </svg>
                                                                        Registrar Atendimento
                                                                    </button>
                                                                </td>

                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>

                                    </div>
                                );
                            })
                        )}

                    </div>

                    {/* RIGHT COLUMN: SUMMARY SIDEBAR WIDGET ("Resumo do Dia") (1/4 width) */}
                    <div className="lg:col-span-1 print:hidden">
                        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm sticky top-20">
                            
                            <h3 className="font-extrabold text-slate-900 text-sm mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
                                <span>Resumo do Dia</span>
                                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                            </h3>

                            <div className="space-y-4">
                                
                                {/* Stat 1: Alunos Faltantes */}
                                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                                    <div className="text-3xl font-black text-slate-900 tracking-tight">
                                        {totalAbsentCount}
                                    </div>
                                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mt-1">
                                        Alunos Faltantes Hoje
                                    </div>
                                </div>

                                {/* Stat 2: Frequência Geral */}
                                <div className="p-4 bg-emerald-50/60 rounded-xl border border-emerald-100">
                                    <div className="text-3xl font-black text-emerald-700 tracking-tight">
                                        {overallFrequency}%
                                    </div>
                                    <div className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider mt-1">
                                        Frequência Média
                                    </div>
                                </div>

                                {/* Stat 3: Buscas Ativas */}
                                <div className="p-4 bg-purple-50/60 rounded-xl border border-purple-100">
                                    <div className="text-3xl font-black text-purple-700 tracking-tight">
                                        {totalBuscasAtivasCount}
                                    </div>
                                    <div className="text-[11px] font-bold text-purple-800 uppercase tracking-wider mt-1">
                                        Buscas Ativas Registradas
                                    </div>
                                </div>

                            </div>

                            <div className="mt-5 pt-4 border-t border-slate-100 text-[11px] text-slate-400 text-center font-medium">
                                💡 As alterações feitas são salvas automaticamente no banco de dados.
                            </div>

                        </div>
                    </div>

                </div>

            </main>

            {/* MODAL: REGISTRAR ATENDIMENTO (Screen Only) */}
            {modalStudent && (
                <div className="print:hidden fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                        
                        {/* Modal Header */}
                        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
                            <div>
                                <h3 className="font-extrabold text-base">Registrar Atendimento com os Pais</h3>
                                <p className="text-xs text-slate-400 font-medium">Cadastre o motivo da falta e detalhes da ligação</p>
                            </div>
                            <button
                                onClick={() => setModalStudent(null)}
                                className="text-slate-400 hover:text-white transition p-1"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Student Details Banner */}
                        <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 flex items-center justify-between text-xs">
                            <div>
                                <span className="font-black text-slate-900 text-sm block">{modalStudent.name}</span>
                                <span className="text-slate-500 font-semibold">Turma {modalStudent.studentClass} • ID #{modalStudent.id}</span>
                            </div>
                            <div className="text-right">
                                <span className="text-slate-500 font-bold block">Taxa Presença:</span>
                                <span className="font-black text-emerald-700 text-sm">{modalStudent.presenceRate}%</span>
                            </div>
                        </div>

                        {/* Modal Form */}
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-extrabold text-slate-700 mb-1">
                                    Motivo da Falta / Justificativa
                                </label>
                                <select
                                    value={modalReason}
                                    onChange={(e) => setModalReason(e.target.value)}
                                    className="w-full text-xs font-semibold p-2.5 border border-slate-300 rounded-xl bg-white text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                                >
                                    {PRESET_REASONS.map(r => (
                                        <option key={r} value={r}>{r}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-extrabold text-slate-700 mb-1">
                                    Status da Busca Ativa
                                </label>
                                <select
                                    value={modalStatus}
                                    onChange={(e) => setModalStatus(e.target.value)}
                                    className="w-full text-xs font-semibold p-2.5 border border-slate-300 rounded-xl bg-white text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                                >
                                    {STATUS_OPTIONS.map(opt => (
                                        <option key={opt.label} value={opt.label}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-extrabold text-slate-700 mb-1">
                                    Observações / Anotações do Atendimento
                                </label>
                                <textarea
                                    rows={3}
                                    placeholder="Ex: Conversado com a mãe (Dona Maria). O aluno retornará às aulas amanhã..."
                                    value={modalNotes}
                                    onChange={(e) => setModalNotes(e.target.value)}
                                    className="w-full text-xs font-medium p-2.5 border border-slate-300 rounded-xl bg-white text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500 placeholder:text-slate-400"
                                />
                            </div>
                        </div>

                        {/* Modal Actions */}
                        <div className="bg-slate-50 px-6 py-3.5 border-t border-slate-200 flex items-center justify-end gap-3">
                            <button
                                onClick={() => setModalStudent(null)}
                                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 transition"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSaveModal}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold px-5 py-2 rounded-xl text-xs shadow-md transition"
                            >
                                Salvar Atendimento
                            </button>
                        </div>

                    </div>
                </div>
            )}

            {/* Footer Signoff for Print Mode */}
            <footer className="mt-12 text-center text-slate-400 text-xs print:block hidden pb-8 border-t border-slate-200 pt-4">
                <p className="font-bold">Relatório Consolidado de Faltas & Busca Ativa — Gerado em {new Date().toLocaleString("pt-BR")}</p>
                <p>SABER+ Escola Digital</p>
            </footer>

        </div>
    );
}

export default function PrintAbsencesPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8 text-slate-600 font-bold">
                Carregando Relatório...
            </div>
        }>
            <PrintAbsencesContent />
        </Suspense>
    );
}
