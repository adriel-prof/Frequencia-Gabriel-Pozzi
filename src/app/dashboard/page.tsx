"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebaseConfig";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";

type AttendanceRecord = {
    id: string;
    studentId: number;
    studentName: string;
    studentClass: string;
    date: string;
    status: "P" | "F";
    teacher: string;
};

export default function DashboardPage() {
    const { user, role, loading } = useAuth();
    const router = useRouter();
    const [records, setRecords] = useState<AttendanceRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filterDate, setFilterDate] = useState(new Date().toISOString().split("T")[0]);

    useEffect(() => {
        if (!loading) {
            if (!user) {
                router.push("/login");
            } else if (role !== "admin") {
                router.push("/chamada");
            }
        }
    }, [user, role, loading, router]);

    useEffect(() => {
        async function fetchRecords() {
            if (!user) return;
            try {
                const q = query(collection(db, "attendance"), orderBy("studentName", "asc"));
                const snapshot = await getDocs(q);
                const data = snapshot.docs.map(doc => ({
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
    }, [user]);

    if (loading || isLoading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <div className="w-10 h-10 border-4 border-green-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    const filteredRecords = records.filter(r => r.date === filterDate);

    // Agrupar por classe
    const classes = Array.from(new Set(filteredRecords.map(r => r.studentClass)));

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
                <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
                    <h1 className="font-bold text-lg text-gray-900">Painel do Gestor</h1>
                    <div className="flex items-center gap-4">
                        <input
                            type="date"
                            value={filterDate}
                            onChange={(e) => setFilterDate(e.target.value)}
                            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium"
                        />
                    </div>
                </div>
            </header>

            <main className="flex-1 p-4 pt-6 max-w-5xl mx-auto w-full">
                {classes.length === 0 ? (
                    <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 text-center">
                        <p className="text-gray-500 font-medium">Nenhuma chamada registrada para esta data.</p>
                    </div>
                ) : (
                    <div className="space-y-8">
                        {classes.map(cls => {
                            const classRecords = filteredRecords.filter(r => r.studentClass === cls);
                            const totalPresences = classRecords.filter(r => r.status === "P").length;
                            const totalAbsences = classRecords.filter(r => r.status === "F").length;

                            return (
                                <div key={cls} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                                    <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                                        <h2 className="font-bold text-gray-900 text-lg">Turma {cls}</h2>
                                        <div className="flex gap-4 text-sm font-medium">
                                            <span className="text-green-600">Presentes: {totalPresences}</span>
                                            <span className="text-red-600">Faltas: {totalAbsences}</span>
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
                                                            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-md font-bold text-xs ${record.status === "P" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                                                                }`}>
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
                        })}
                    </div>
                )}
            </main>
        </div>
    );
}
