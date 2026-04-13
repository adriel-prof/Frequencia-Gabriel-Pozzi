"use client";

import { useEffect, useState } from "react";
import { doc, getDocs, query, orderBy, writeBatch, collection } from "firebase/firestore";
import { db } from "@/lib/firebaseConfig";


type AttendanceRecord = {
    id: string;
    studentId: number;
    studentName: string;
    studentClass: string;
    date: string;
    status: "P" | "F";
    teacher: string;
};

const LOCK_DATE = "2026-04-06";


export default function DashboardPage() {

    const [records, setRecords] = useState<AttendanceRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filterDate, setFilterDate] = useState(new Date().toISOString().split("T")[0]);

    const [selectedClass, setSelectedClass] = useState<string | null>(null);
    const [allClasses, setAllClasses] = useState<string[]>([]);

    useEffect(() => {
        async function fetchRecords() {
            try {
                const q = query(collection(db, "attendance"), orderBy("studentName", "asc"));
                const snapshot = await getDocs(q);
                const data = snapshot.docs
                    .map(doc => ({
                        id: doc.id,
                        ...doc.data()
                    }))
                    .filter(record => (record as AttendanceRecord).date >= LOCK_DATE) as AttendanceRecord[];

                setRecords(data);

                // Find all existing classes
                const studentsSnap = await getDocs(collection(db, "students"));
                const uniqueClasses = Array.from(new Set(studentsSnap.docs.map(d => d.data().class as string))).sort();
                setAllClasses(uniqueClasses);
            } catch (err) {
                console.error("Erro ao buscar registros:", err);
            } finally {
                setIsLoading(false);
            }
        }
        fetchRecords();
    }, []);

    if (isLoading) {
        return (
            <div className="flex justify-center p-8">
                <div className="w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    const normalizeClassName = (name: string) => name ? name.trim().toUpperCase().replace(/°/g, 'º') : "";
    const filteredRecords = records.filter(r => r.date === filterDate);
    const classes = Array.from(new Set(filteredRecords.map(r => normalizeClassName(r.studentClass))));
    const missingClasses = allClasses.filter(cls => !classes.includes(normalizeClassName(cls)));

    const handleDeleteClassReport = async (cls: string, classRecords: AttendanceRecord[]) => {
        if (!confirm(`Tem certeza que deseja excluir DEFNITIVAMENTE o relatório da Turma ${cls} na data selecionada?`)) return;

        try {
            const batch = writeBatch(db);
            classRecords.forEach(record => {
                const docRef = doc(db, "attendance", record.id);
                batch.delete(docRef);
            });
            await batch.commit();

            // Remove do estado local para não precisar recarregar a página inteira
            setRecords(prev => prev.filter(r => !classRecords.find(cr => cr.id === r.id)));
        } catch (error) {
            console.error("Erro ao excluir relatório:", error);
            alert("Falha ao excluir o relatório. Tente novamente.");
        }
    };



    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex flex-col md:flex-row md:items-center justify-between bg-white p-4 rounded-xl shadow-sm border border-gray-100 gap-4">
                <div className="flex items-center gap-4">
                    <h2 className="font-bold text-gray-800">Filtrar:</h2>
                    <input
                        type="date"
                        value={filterDate}
                        min={LOCK_DATE}
                        onChange={(e) => setFilterDate(e.target.value)}
                        className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-green-500 focus:outline-none"
                    />
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3 border-t md:border-t-0 md:border-l border-gray-100 md:pl-4 pt-4 md:pt-0">
                    <button
                        onClick={() => window.open(`/print?date=${filterDate}`, '_blank')}
                        className="bg-white border-2 border-green-500 text-green-700 font-bold px-4 py-2 rounded-lg hover:bg-green-50 transition-colors flex items-center gap-2 whitespace-nowrap shadow-sm w-full sm:w-auto justify-center"
                    >
                        <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                        </svg>
                        Imprimir Placar
                    </button>


                </div>
            </div>

            {!selectedClass ? (
                <div className="space-y-6 animate-fade-in">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                        <div className="bg-white p-6 rounded-2xl border-l-4 border-green-500 shadow-sm flex items-center justify-between">
                            <div>
                                <p className="text-sm font-bold text-gray-500 uppercase tracking-widest">Chamadas Concluídas</p>
                                <h3 className="text-3xl font-black text-gray-900 mt-1">{classes.length} Turmas</h3>
                            </div>
                            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center text-green-600">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                        </div>
                        <div className="bg-white p-6 rounded-2xl border-l-4 border-red-500 shadow-sm flex items-center justify-between">
                            <div>
                                <p className="text-sm font-bold text-gray-500 uppercase tracking-widest">Chamadas Pendentes</p>
                                <h3 className="text-3xl font-black text-gray-900 mt-1">{missingClasses.length} Turmas</h3>
                            </div>
                            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center text-red-600">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                        </div>
                    </div>

                    {missingClasses.length > 0 && (
                        <div className="mb-8">
                            <h3 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                                Aguardando Professor (Pendentes)
                            </h3>
                            <div className="flex flex-wrap gap-2">
                                {missingClasses.map(cls => (
                                    <span key={cls} className="px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm font-bold shadow-sm">
                                        Turma {cls}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {classes.length > 0 ? (
                        <div>
                            <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                Detalhar Chamadas Concluídas
                            </h3>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        {classes.sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: 'base' })).map(cls => {
                            const classRecords = filteredRecords.filter(r => normalizeClassName(r.studentClass) === cls);
                            const totalPresences = classRecords.filter(r => r.status === "P").length;
                            const totalAbsences = classRecords.filter(r => r.status === "F").length;
                            const percentage = totalPresences + totalAbsences > 0
                                ? Math.round((totalPresences / (totalPresences + totalAbsences)) * 100)
                                : 0;

                            let ringColor = "group-hover:ring-red-500";
                            let textColor = "text-red-600";
                            if (percentage >= 90) { ringColor = "group-hover:ring-green-500"; textColor = "text-green-600"; }
                            else if (percentage >= 85) { ringColor = "group-hover:ring-yellow-500"; textColor = "text-yellow-600"; }

                            return (
                                <button
                                    key={cls}
                                    onClick={() => setSelectedClass(cls)}
                                    className={`bg-white hover:bg-gray-50 border-2 border-gray-100 rounded-2xl py-6 px-4 flex flex-col items-center justify-center shadow-sm transition-all group focus:outline-none focus:ring-2 ${ringColor}`}
                                >
                                    <span className="text-2xl font-black text-gray-800 transition-colors mb-2">
                                        {cls}
                                    </span>
                                    <div className="flex flex-col items-center gap-1 text-sm font-medium">
                                        <span className={textColor}>{percentage}% de Frequência</span>
                                        <span className="text-gray-400 text-xs">{totalPresences} P / {totalAbsences} F</span>
                                    </div>
                                </button>
                            );
                        })}
                            </div>
                        </div>
                    ) : (
                        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 text-center">
                            <p className="text-gray-500 font-medium">Nenhuma chamada registrada para esta data ainda.</p>
                        </div>
                    )}
                </div>
            ) : (
                <div className="animate-fade-in space-y-6">
                    <div className="flex items-center justify-between">
                        <button
                            onClick={() => setSelectedClass(null)}
                            className="flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-gray-800 bg-white border border-gray-200 px-4 py-2 rounded-xl shadow-sm transition-all"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                            </svg>
                            Voltar às Turmas
                        </button>
                    </div>

                    {(() => {
                        const cls = selectedClass;
                        const classRecords = filteredRecords.filter(r => normalizeClassName(r.studentClass) === cls);
                        const totalPresences = classRecords.filter(r => r.status === "P").length;
                        const totalAbsences = classRecords.filter(r => r.status === "F").length;

                        return (
                            <div key={cls} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                                <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                                    <h2 className="font-bold text-gray-900 text-lg">Turma {cls}</h2>
                                    <div className="flex gap-4 items-center text-sm font-medium">
                                        <span className="text-green-600">Presentes: {totalPresences}</span>
                                        <span className="text-red-600">Faltas: {totalAbsences}</span>
                                        <button
                                            onClick={() => handleDeleteClassReport(cls, classRecords)}
                                            className="ml-4 text-xs font-bold text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors"
                                        >
                                            Excluir Relatório
                                        </button>
                                    </div>
                                </div>

                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm">
                                        <thead className="text-gray-500 border-b border-gray-100">
                                            <tr>
                                                <th className="px-6 py-3 font-medium">Nº</th>
                                                <th className="px-6 py-3 font-medium">Aluno</th>
                                                <th className="px-6 py-3 font-medium">Status</th>
                                                <th className="px-6 py-3 font-medium">Professor</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {classRecords.map(record => (
                                                <tr key={record.id} className="hover:bg-gray-50/50">
                                                    <td className="px-6 py-3 text-gray-500">{record.studentId}</td>
                                                    <td className="px-6 py-3 font-medium text-gray-900">{record.studentName}</td>
                                                    <td className="px-6 py-3">
                                                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-md font-bold text-xs ${record.status === "P" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                                                            {record.status}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-3 text-gray-500">{record.teacher}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        );
                    })()}
                </div>
            )}
        </div>
    );
}
