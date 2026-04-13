"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebaseConfig";
import { Suspense } from "react";

type AttendanceRecord = {
    studentClass: string;
    status: "P" | "F";
};

function PrintContent() {
    const searchParams = useSearchParams();
    const date = searchParams.get("date");
    const [classData, setClassData] = useState<{ className: string; percentage: number }[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!date) return;

        async function fetchData() {
            try {
                const q = query(collection(db, "attendance"), where("date", "==", date));
                const snapshot = await getDocs(q);

                const normalizeClassName = (name: string) => name ? name.trim().toUpperCase().replace(/°/g, 'º') : "";
                const stats: Record<string, { p: number; f: number }> = {};
                snapshot.docs.forEach(doc => {
                    const data = doc.data() as AttendanceRecord;
                    const clsNorm = normalizeClassName(data.studentClass);
                    if (!stats[clsNorm]) {
                        stats[clsNorm] = { p: 0, f: 0 };
                    }
                    if (data.status === "P") {
                        stats[clsNorm].p += 1;
                    } else if (data.status === "F") {
                        stats[clsNorm].f += 1;
                    }
                });

                const result = Object.keys(stats).map(cls => {
                    const total = stats[cls].p + stats[cls].f;
                    const percentage = total === 0 ? 0 : Math.round((stats[cls].p / total) * 100);
                    return { className: cls, percentage };
                });

                // Sort classes
                result.sort((a, b) => a.className.localeCompare(b.className, undefined, { numeric: true, sensitivity: 'base' }));
                setClassData(result);
            } catch (err) {
                console.error("Erro ao buscar dados para impressão:", err);
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
        return <div className="p-8 text-center h-screen flex items-center justify-center text-xl font-bold text-gray-500">Montando os cartazes...</div>;
    }

    const getColorClass = (perc: number) => {
        if (perc >= 90) return "text-green-600";
        if (perc >= 85) return "text-yellow-500";
        return "text-red-600";
    };

    return (
        <div className="bg-white min-h-screen text-black p-4 sm:p-8">
            <div className="print:hidden mb-8 text-center flex flex-col items-center">
                <button
                    onClick={() => window.print()}
                    className="bg-blue-600 text-white font-bold py-3 px-8 rounded-xl shadow hover:bg-blue-700 transition flex items-center gap-3"
                >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2-2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                    Imprimir Cartazes
                </button>
                <p className="text-gray-500 mt-3 text-sm max-w-md">
                    Dica: Nas opções de impressão (Ctrl+P / Cmd+P), desmarque a opção de cabeçalhos/rodapés e ative a impressão de gráficos/cor de fundo para garantir que as cores apareçam.
                </p>
            </div>

            <div className="text-center mb-12">
                <h1 className="text-3xl sm:text-5xl font-extrabold uppercase tracking-widest text-gray-900 border-b-4 border-gray-900 pb-4 inline-block">Placar de Presença</h1>
                <p className="text-xl sm:text-3xl text-gray-600 mt-4 font-bold">Data de Referência: {new Date(date + "T00:00:00").toLocaleDateString("pt-BR")}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 sm:gap-10">
                {classData.map((data) => (
                    <div key={data.className} className="border-4 border-gray-300 rounded-2xl p-6 sm:p-10 flex flex-col items-center justify-center shadow-sm break-inside-avoid">
                        <div className="text-5xl sm:text-7xl font-black text-gray-900 mb-6 truncate max-w-full tracking-tight">
                            {data.className}
                        </div>
                        <div className={`text-7xl sm:text-9xl font-black tracking-tighter ${getColorClass(data.percentage)}`}>
                            {data.percentage}%
                        </div>
                    </div>
                ))}
            </div>

            {classData.length === 0 && (
                <div className="text-center text-gray-400 mt-20 text-2xl font-bold">
                    Nenhuma chamada registrada nesta data.
                </div>
            )}
        </div>
    );
}

export default function PrintPage() {
    return (
        <Suspense fallback={<div className="p-8 text-center text-xl font-bold">Carregando Tela de Impressão...</div>}>
            <PrintContent />
        </Suspense>
    );
}
