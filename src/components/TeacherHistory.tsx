"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, orderBy, where } from "firebase/firestore";
import { db } from "@/lib/firebaseConfig";

type AttendanceRecord = {
    id: string;
    studentId: number;
    studentName: string;
    studentClass: string;
    date: string;
    status: "P" | "F" | "D";
    teacher: string;
};

const LOCK_DATE = "2026-04-06";


export function TeacherHistory() {
    const [records, setRecords] = useState<AttendanceRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filterDate, setFilterDate] = useState(new Date().toISOString().split("T")[0]);
    const [selectedClass, setSelectedClass] = useState<string | null>(null);

    useEffect(() => {
        async function fetchRecords() {
            setIsLoading(true);
            try {
                // OTIMIZAÇÃO: Filtra por data no servidor para evitar carregar todo o histórico
                const q = query(
                    collection(db, "attendance"), 
                    where("date", "==", filterDate),
                    orderBy("studentName", "asc")
                );
                const snapshot = await getDocs(q);
                const data = snapshot.docs
                    .map(doc => ({
                        id: doc.id,
                        ...doc.data()
                    })) as AttendanceRecord[];

                setRecords(data);
            } catch (err) {
                console.error("Erro ao buscar registros:", err);
            } finally {
                setIsLoading(false);
            }
        }
        fetchRecords();
    }, [filterDate]);

    if (isLoading) {
        return (
            <div className="flex justify-center p-8">
                <div className="w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    const normalizeClassName = (name: string) => name ? name.trim().toUpperCase().replace(/°/g, 'º') : "";
    const filteredRecords = records;
    const classes = Array.from(new Set(filteredRecords.map(r => normalizeClassName(r.studentClass))));

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-white p-4 rounded-xl shadow-sm border border-gray-100 gap-4">
                <div className="flex items-center gap-4 w-full">
                    <h2 className="font-bold text-gray-800">Filtrar Data:</h2>
                    <input
                        type="date"
                        value={filterDate}
                        min={LOCK_DATE}
                        onChange={(e) => {
                            setFilterDate(e.target.value);
                            setSelectedClass(null);
                        }}
                        className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-green-500 focus:outline-none flex-1 max-w-[200px]"
                    />
                </div>
            </div>

            {classes.length === 0 ? (
                <div className="text-center py-10 bg-white rounded-2xl border border-gray-100 shadow-sm">
                    <p className="text-gray-500 font-medium p-8">Nenhuma chamada registrada para esta data.</p>
                </div>
            ) : !selectedClass ? (
                <div className="space-y-6 animate-fade-in">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {classes.sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: 'base' })).map(cls => {
                            const classRecords = filteredRecords.filter(r => normalizeClassName(r.studentClass) === cls);
                            const totalPresences = classRecords.filter(r => r.status === "P").length;
                            const totalAbsences = classRecords.filter(r => r.status === "F").length;
                            const totalDispensed = classRecords.filter(r => r.status === "D").length;
                            const teacher = classRecords[0]?.teacher || "Desconhecido";

                            return (
                                <button
                                    key={cls}
                                    onClick={() => setSelectedClass(cls)}
                                    className="bg-white hover:bg-gray-50 border-2 border-gray-100 rounded-2xl p-6 flex flex-col items-start justify-between shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-green-500 w-full text-left"
                                >
                                    <div className="w-full flex justify-between items-center mb-4">
                                        <span className="text-xl font-black text-gray-800">
                                            Turma {cls}
                                        </span>
                                        <span className="text-xs font-bold bg-gray-100 text-gray-500 px-2 py-1 rounded-md">
                                            {classRecords.length} Alunos
                                        </span>
                                    </div>
                                    <div className="w-full text-sm font-medium text-gray-500 mb-2 truncate">
                                        <span className="font-bold text-gray-700">Professor:</span> {teacher}
                                    </div>
                                    <div className="w-full flex gap-3 text-sm font-medium border-t border-gray-100 pt-3 mt-1">
                                        <span className="text-green-600 font-bold">{totalPresences} P</span>
                                        <span className="text-red-600 font-bold">{totalAbsences} F</span>
                                        {totalDispensed > 0 && <span className="text-amber-600 font-bold">{totalDispensed} D</span>}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            ) : (
                <div className="animate-fade-in space-y-4">
                    <div className="flex items-center justify-between">
                        <button
                            onClick={() => setSelectedClass(null)}
                            className="flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-gray-800 bg-white border border-gray-200 px-4 py-2 rounded-xl shadow-sm transition-all"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                            </svg>
                            Voltar
                        </button>
                    </div>

                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                            <h2 className="font-bold text-gray-900 text-lg">Turma {selectedClass}</h2>
                        </div>
                        
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="text-gray-500 border-b border-gray-100">
                                    <tr>
                                        <th className="px-6 py-3 font-medium">Nº</th>
                                        <th className="px-6 py-3 font-medium">Aluno</th>
                                        <th className="px-6 py-3 font-medium">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {filteredRecords.filter(r => normalizeClassName(r.studentClass) === selectedClass).map(record => (
                                        <tr key={record.id} className="hover:bg-gray-50/50">
                                            <td className="px-6 py-3 text-gray-500">{record.studentId}</td>
                                            <td className="px-6 py-3 font-medium text-gray-900">{record.studentName}</td>
                                            <td className="px-6 py-3">
                                                <span className={`inline-flex items-center justify-center w-6 h-6 rounded-md font-bold text-xs ${
                                                    record.status === "P" ? "bg-green-100 text-green-700" : 
                                                    record.status === "F" ? "bg-red-100 text-red-700" :
                                                    "bg-amber-100 text-amber-700"
                                                }`}>
                                                    {record.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
