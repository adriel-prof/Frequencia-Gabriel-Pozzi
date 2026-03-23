"use client";

import { useEffect, useState } from "react";
import { doc, getDocs, query, orderBy, writeBatch, collection } from "firebase/firestore";
import { db } from "@/lib/firebaseConfig";
import { useAuth } from "@/context/AuthContext";

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
    const { user } = useAuth();
    const [records, setRecords] = useState<AttendanceRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filterDate, setFilterDate] = useState(new Date().toISOString().split("T")[0]);
    const [targetEmail, setTargetEmail] = useState("");
    const [isSendingReport, setIsSendingReport] = useState(false);

    useEffect(() => {
        async function fetchRecords() {
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
    }, []);

    if (isLoading) {
        return (
            <div className="flex justify-center p-8">
                <div className="w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    const filteredRecords = records.filter(r => r.date === filterDate);
    const classes = Array.from(new Set(filteredRecords.map(r => r.studentClass)));

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

    const handleSendManualReport = async () => {
        setIsSendingReport(true);
        try {
            const params = new URLSearchParams();
            if (targetEmail) params.append('email', targetEmail);
            if (user?.email) params.append('loggedUserEmail', user.email);

            const url = `/api/cron/send-report${params.toString() ? `?${params.toString()}` : ''}`;
            const res = await fetch(url);
            if (res.ok) {
                alert("Relatório enviado com sucesso!");
                setTargetEmail("");
            } else {
                alert("Erro ao enviar o relatório. Detalhes no console.");
            }
        } catch (err) {
            console.error(err);
            alert("Erro de comunicação ao enviar o relatório.");
        } finally {
            setIsSendingReport(false);
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
                        onChange={(e) => setFilterDate(e.target.value)}
                        className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-green-500 focus:outline-none"
                    />
                </div>

                <div className="flex flex-col sm:flex-row gap-2 border-t md:border-t-0 md:border-l border-gray-100 md:pl-4 pt-4 md:pt-0">
                    <input
                        type="email"
                        placeholder="E-mail destinatário (Opcional)"
                        value={targetEmail}
                        onChange={e => setTargetEmail(e.target.value)}
                        className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 min-w-[220px]"
                    />
                    <button
                        onClick={handleSendManualReport}
                        disabled={isSendingReport}
                        className="bg-gray-900 text-white font-medium text-sm px-4 py-1.5 rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors whitespace-nowrap"
                    >
                        {isSendingReport ? "Enviando..." : "Enviar Relatório de Hoje"}
                    </button>
                </div>
            </div>

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
                    })}
                </div>
            )}
        </div>
    );
}
