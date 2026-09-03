"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebaseConfig";
import Link from "next/link";

type AttendanceRecord = {
    studentClass: string;
    status: "P" | "F" | "D" | "A" | "TR";
    studentName: string;
    studentFirestoreId?: string;
};

type ClassStat = {
    className: string;
    percentage: number;
    rawClass: string;
};

function AlmocoContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const dateParam = searchParams.get("date");
    
    const todayStr = new Date().toISOString().split("T")[0];
    const [selectedDate, setSelectedDate] = useState<string>(dateParam || todayStr);
    
    const [classStats, setClassStats] = useState<ClassStat[]>([]);
    const [missingClasses, setMissingClasses] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    
    // Configurações personalizáveis dos horários
    const [timeSlot1, setTimeSlot1] = useState("12h05");
    const [timeSlot2, setTimeSlot2] = useState("12h10");
    const [timeSlot3, setTimeSlot3] = useState("12h15");
    
    // Limiares de porcentagem
    const [threshSlot1, setThreshSlot1] = useState(90);
    const [threshSlot2, setThreshSlot2] = useState(60);

    const [customMessage, setCustomMessage] = useState<string>("");
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (dateParam) {
            setSelectedDate(dateParam);
        }
    }, [dateParam]);

    useEffect(() => {
        async function fetchData() {
            setLoading(true);
            try {
                const normalizeClassName = (name: string) => name ? name.trim().toUpperCase().replace(/[°º]/g, 'º') : "";
                const formatClassName = (name: string) => name ? name.trim().toUpperCase().replace(/[°º]/g, '') : "";

                if (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) {
                    const { mockDb } = await import("@/lib/mockDatabase");
                    const studentsList = mockDb.getStudents().filter(s => s.status !== "TR");
                    const recordsData = mockDb.getAttendance(selectedDate) as unknown as AttendanceRecord[];
                    
                    const completedClassesToday = new Set<string>();
                    const stats: Record<string, { p: number; f: number }> = {};

                    recordsData.forEach(r => {
                        completedClassesToday.add(normalizeClassName(r.studentClass));
                    });

                    completedClassesToday.forEach(clsNorm => {
                        stats[clsNorm] = { p: 0, f: 0 };
                        const classStudents = studentsList.filter(s => normalizeClassName(s.class) === clsNorm);
                        classStudents.forEach(s => {
                            const record = recordsData.find(r => r.studentFirestoreId === s.firestoreId || r.studentName === s.name);
                            if (record) {
                                if (record.status === "P" || record.status === "A") {
                                    stats[clsNorm].p += 1;
                                } else if (record.status === "F") {
                                    stats[clsNorm].f += 1;
                                }
                            } else {
                                stats[clsNorm].p += 1;
                            }
                        });
                    });

                    const result: ClassStat[] = Object.keys(stats).map(cls => {
                        const total = stats[cls].p + stats[cls].f;
                        const percentage = total === 0 ? 0 : Math.round((stats[cls].p / total) * 100);
                        return { className: formatClassName(cls), percentage, rawClass: cls };
                    });

                    result.sort((a, b) => b.percentage - a.percentage);

                    const allClasses = Array.from(new Set(studentsList.map(s => normalizeClassName(s.class))));
                    const missing = allClasses
                        .filter(cls => !completedClassesToday.has(cls))
                        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

                    setClassStats(result);
                    setMissingClasses(missing);
                    setLoading(false);
                    return;
                }

                // Busca lista oficial de estudantes
                const studentsSnap = await getDocs(collection(db, "students"));
                const studentsList = studentsSnap.docs
                    .filter(doc => doc.data().status !== "TR")
                    .map(doc => ({
                        firestoreId: doc.id,
                        name: doc.data().name as string,
                        class: doc.data().class as string
                    }));

                // Busca registros de chamada da data
                const q = query(collection(db, "attendance"), where("date", "==", selectedDate));
                const snapshot = await getDocs(q);
                const recordsData = snapshot.docs.map(doc => doc.data() as AttendanceRecord);

                const completedClassesToday = new Set<string>();
                const stats: Record<string, { p: number; f: number }> = {};

                recordsData.forEach(r => {
                    completedClassesToday.add(normalizeClassName(r.studentClass));
                });

                completedClassesToday.forEach(clsNorm => {
                    stats[clsNorm] = { p: 0, f: 0 };
                    const classStudents = studentsList.filter(s => normalizeClassName(s.class) === clsNorm);
                    classStudents.forEach(s => {
                        const record = recordsData.find(r => r.studentFirestoreId === s.firestoreId || r.studentName === s.name);
                        if (record) {
                            if (record.status === "P" || record.status === "A") {
                                stats[clsNorm].p += 1;
                            } else if (record.status === "F") {
                                stats[clsNorm].f += 1;
                            }
                        } else {
                            stats[clsNorm].p += 1;
                        }
                    });
                });

                const result: ClassStat[] = Object.keys(stats).map(cls => {
                    const total = stats[cls].p + stats[cls].f;
                    const percentage = total === 0 ? 0 : Math.round((stats[cls].p / total) * 100);
                    return { className: formatClassName(cls), percentage, rawClass: cls };
                });

                result.sort((a, b) => b.percentage - a.percentage);

                const allClasses = Array.from(new Set(studentsList.map(s => normalizeClassName(s.class))));
                const missing = allClasses
                    .filter(cls => !completedClassesToday.has(cls))
                    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

                setClassStats(result);
                setMissingClasses(missing);
            } catch (err) {
                console.error("Erro ao buscar dados do almoço:", err);
            } finally {
                setLoading(false);
            }
        }

        fetchData();
    }, [selectedDate]);

    // Atualiza a mensagem formatada sempre que os dados ou configurações mudam
    useEffect(() => {
        if (classStats.length === 0) {
            setCustomMessage("");
            return;
        }

        // Formatação da data no estilo DD/MM
        const [, month, day] = selectedDate.split("-");
        const formattedDate = `${day}/${month}`;

        // Distribuição das turmas nos horários
        const slot1: ClassStat[] = [];
        const slot2: ClassStat[] = [];
        const slot3: ClassStat[] = [];

        classStats.forEach((item, index) => {
            if (item.percentage >= threshSlot1 || (index === 0 && classStats[0].percentage < threshSlot1)) {
                slot1.push(item);
            } else if (item.percentage >= threshSlot2) {
                slot2.push(item);
            } else {
                slot3.push(item);
            }
        });

        let msg = `🍽️✨ SAÍDA PARA O ALMOÇO – ${formattedDate} ✨🍽️\n\n`;
        msg += `Pessoal, atenção aos horários de saída para o almoço! 💙\n\n`;

        if (slot1.length > 0) {
            msg += `🕛 ${timeSlot1}\n`;
            slot1.forEach(c => {
                msg += `📚 ${c.className} - ${c.percentage}%\n`;
            });
            msg += `\n`;
        }

        if (slot2.length > 0) {
            msg += `🕛 ${timeSlot2}\n`;
            slot2.forEach(c => {
                msg += `📚 ${c.className} - ${c.percentage}%\n`;
            });
            msg += `\n`;
        }

        if (slot3.length > 0) {
            msg += `🕛 ${timeSlot3}\n`;
            slot3.forEach(c => {
                msg += `📚 ${c.className} - ${c.percentage}%\n`;
            });
            msg += `\n`;
        }

        msg += `Professores, por gentileza acompanhem os estudantes até  a fila do refeitório. Obrigada 🌹`;

        setCustomMessage(msg);
    }, [classStats, selectedDate, timeSlot1, timeSlot2, timeSlot3, threshSlot1, threshSlot2]);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(customMessage);
            setCopied(true);
            setTimeout(() => setCopied(false), 3000);
        } catch (err) {
            console.error("Erro ao copiar:", err);
            alert("Não foi possível copiar automaticamente. Selecione o texto e copie manualmente.");
        }
    };

    const handleWhatsAppSend = () => {
        const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(customMessage)}`;
        window.open(url, '_blank');
    };

    return (
        <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
            <div className="max-w-3xl mx-auto space-y-6">
                
                {/* Header Superior */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-white p-5 rounded-2xl shadow-sm border border-gray-100 gap-4">
                    <div className="flex items-center gap-3">
                        <Link
                            href="/dashboard"
                            className="p-2 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                            title="Voltar ao Dashboard"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                            </svg>
                        </Link>
                        <div>
                            <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
                                <span>🍽️</span> Saída para o Almoço
                            </h1>
                            <p className="text-xs font-semibold text-gray-500">
                                Relatório em formato de mensagem para o WhatsApp
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Data:</label>
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={e => {
                                setSelectedDate(e.target.value);
                                router.replace(`/almoco?date=${e.target.value}`);
                            }}
                            className="px-3 py-1.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-800 bg-gray-50 focus:ring-2 focus:ring-amber-500 outline-none"
                        />
                    </div>
                </div>

                {/* Alerta de Chamadas Pendentes */}
                {missingClasses.length > 0 && (
                    <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-2xl shadow-sm text-amber-900">
                        <div className="flex items-center gap-2 font-bold text-sm mb-1">
                            <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <span>Atenção: Chamadas Pendentes</span>
                        </div>
                        <p className="text-xs text-amber-700 leading-relaxed">
                            As seguintes turmas ainda não finalizaram a chamada hoje e não aparecem no cálculo:
                        </p>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                            {missingClasses.map(cls => (
                                <span key={cls} className="bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-md text-xs font-bold border border-amber-200">
                                    Turma {cls}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {loading ? (
                    <div className="bg-white rounded-3xl p-12 text-center shadow-sm border border-gray-100 space-y-4">
                        <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                        <p className="text-gray-500 font-bold">Calculando porcentagens e montando horários...</p>
                    </div>
                ) : classStats.length === 0 ? (
                    <div className="bg-white rounded-3xl p-12 text-center shadow-sm border border-gray-100">
                        <p className="text-gray-500 font-bold text-lg">Nenhuma chamada concluída registrada para esta data.</p>
                        <p className="text-gray-400 text-sm mt-2">Realize as chamadas no menu de professores primeiro.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        
                        {/* Coluna Esquerda: Configurações dos Horários */}
                        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4 lg:col-span-1">
                            <h2 className="font-extrabold text-gray-900 text-base border-b border-gray-100 pb-3 flex items-center gap-2">
                                <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Ajustes de Horários
                            </h2>

                            <div className="space-y-3">
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1">
                                        1º Horário (Ex: 12h05)
                                    </label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={timeSlot1}
                                            onChange={e => setTimeSlot1(e.target.value)}
                                            className="flex-1 px-3 py-2 border border-gray-200 rounded-xl font-bold text-gray-800 text-sm bg-gray-50 outline-none focus:ring-2 focus:ring-amber-500"
                                        />
                                        <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 px-2 rounded-xl text-xs font-bold">
                                            <span>&ge;</span>
                                            <input
                                                type="number"
                                                min="0"
                                                max="100"
                                                value={threshSlot1}
                                                onChange={e => setThreshSlot1(Number(e.target.value))}
                                                className="w-8 bg-transparent text-center font-bold text-amber-700 outline-none"
                                            />
                                            <span>%</span>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1">
                                        2º Horário (Ex: 12h10)
                                    </label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={timeSlot2}
                                            onChange={e => setTimeSlot2(e.target.value)}
                                            className="flex-1 px-3 py-2 border border-gray-200 rounded-xl font-bold text-gray-800 text-sm bg-gray-50 outline-none focus:ring-2 focus:ring-amber-500"
                                        />
                                        <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 px-2 rounded-xl text-xs font-bold">
                                            <span>&ge;</span>
                                            <input
                                                type="number"
                                                min="0"
                                                max="100"
                                                value={threshSlot2}
                                                onChange={e => setThreshSlot2(Number(e.target.value))}
                                                className="w-8 bg-transparent text-center font-bold text-amber-700 outline-none"
                                            />
                                            <span>%</span>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1">
                                        3º Horário (Ex: 12h15)
                                    </label>
                                    <input
                                        type="text"
                                        value={timeSlot3}
                                        onChange={e => setTimeSlot3(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-xl font-bold text-gray-800 text-sm bg-gray-50 outline-none focus:ring-2 focus:ring-amber-500"
                                    />
                                </div>
                            </div>

                            <div className="pt-2 border-t border-gray-100">
                                <h3 className="text-xs font-extrabold text-gray-500 uppercase tracking-wider mb-2">Resumo das Turmas</h3>
                                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                                    {classStats.map(c => (
                                        <div key={c.rawClass} className="flex justify-between items-center text-xs py-1 px-2.5 bg-gray-50 rounded-lg">
                                            <span className="font-bold text-gray-800">Turma {c.className}</span>
                                            <span className={`font-black ${c.percentage >= 90 ? 'text-green-600' : c.percentage >= 75 ? 'text-amber-600' : 'text-red-600'}`}>
                                                {c.percentage}%
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Coluna Direita: Preview e Cópia da Mensagem */}
                        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4 lg:col-span-2">
                            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                                <h2 className="font-extrabold text-gray-900 text-base flex items-center gap-2">
                                    <span className="text-green-600">💬</span> Mensagem Formatada
                                </h2>
                                <span className="text-xs font-bold bg-green-50 text-green-700 px-2.5 py-1 rounded-full border border-green-200">
                                    Pronta para Enviar
                                </span>
                            </div>

                            {/* Bolha de Pré-visualização Estilo WhatsApp */}
                            <div className="bg-[#efeae2] p-4 rounded-2xl border border-gray-200/80 shadow-inner font-sans">
                                <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200/60 max-w-lg space-y-2 relative">
                                    <div className="text-xs font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded inline-block mb-1">
                                        Pré-visualização
                                    </div>
                                    <textarea
                                        value={customMessage}
                                        onChange={e => setCustomMessage(e.target.value)}
                                        rows={14}
                                        className="w-full bg-transparent text-gray-900 text-sm font-sans whitespace-pre-wrap outline-none resize-y leading-relaxed font-medium"
                                    />
                                    <div className="text-[10px] text-gray-400 text-right font-medium">
                                        {new Date().toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                </div>
                            </div>

                            {/* Botões de Ação */}
                            <div className="flex flex-col sm:flex-row gap-3 pt-2">
                                <button
                                    onClick={handleCopy}
                                    className={`flex-1 font-bold py-3.5 px-5 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 text-sm ${
                                        copied
                                            ? "bg-green-600 text-white shadow-green-600/30"
                                            : "bg-gray-900 text-white hover:bg-gray-800 shadow-gray-900/20"
                                    }`}
                                >
                                    {copied ? (
                                        <>
                                            <svg className="w-5 h-5 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                            </svg>
                                            <span>Copiado com Sucesso!</span>
                                        </>
                                    ) : (
                                        <>
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                                            </svg>
                                            <span>Copiar Mensagem</span>
                                        </>
                                    )}
                                </button>

                                <button
                                    onClick={handleWhatsAppSend}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 px-5 rounded-xl transition-all shadow-md shadow-emerald-600/30 flex items-center justify-center gap-2 text-sm"
                                >
                                    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                                        <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
                                    </svg>
                                    <span>Enviar no WhatsApp</span>
                                </button>
                            </div>
                        </div>

                    </div>
                )}
            </div>
        </div>
    );
}

export default function AlmocoPage() {
    return (
        <Suspense fallback={<div className="p-8 text-center text-xl font-bold">Carregando Horários do Almoço...</div>}>
            <AlmocoContent />
        </Suspense>
    );
}
