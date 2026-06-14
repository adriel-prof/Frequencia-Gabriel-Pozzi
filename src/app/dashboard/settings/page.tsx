"use client";

import { useEffect, useState } from "react";
import { doc, getDoc, setDoc, collection, getDocs, deleteDoc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebaseConfig";
import { useAuth } from "@/context/AuthContext";
import { fetchBrasilAPIHolidays } from "@/lib/calendarUtils";

type BlockedDate = {
    date: string;
    reason: string;
    createdBy: string;
};

export default function SettingsPage() {
    const { user } = useAuth();
    const [startTime, setStartTime] = useState("08:40");
    const [endTime, setEndTime] = useState("23:59");
    const [isSaving, setIsSaving] = useState(false);
    const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

    // States for Calendar Blocking
    const [blockedList, setBlockedList] = useState<BlockedDate[]>([]);
    const [blockDate, setBlockDate] = useState("");
    const [blockEndDate, setBlockEndDate] = useState("");
    const [blockReason, setBlockReason] = useState("");
    const [isSavingBlock, setIsSavingBlock] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [calendarFeedback, setCalendarFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

    useEffect(() => {
        async function loadSettings() {
            try {
                const docRef = doc(db, "settings", "attendance");
                const snap = await getDoc(docRef);
                if (snap.exists()) {
                    const data = snap.data();
                    if (data.startTime) setStartTime(data.startTime);
                    if (data.endTime) setEndTime(data.endTime);
                }
            } catch (err) {
                console.error("Erro ao carregar configurações:", err);
            }
        }
        loadSettings();
        loadBlockedDates();
    }, []);

    async function loadBlockedDates() {
        try {
            if (typeof window !== "undefined" && window.location.hostname === "localhost") {
                const { mockDb } = await import("@/lib/mockDatabase");
                const list = mockDb.getBlockedDates();
                setBlockedList(list);
                return;
            }
            const snap = await getDocs(collection(db, "blocked_dates"));
            const list = snap.docs.map(d => ({
                date: d.id,
                reason: d.data().reason,
                createdBy: d.data().createdBy || "Sistema"
            }));
            setBlockedList(list);
        } catch (err) {
            console.error("Erro ao carregar datas bloqueadas:", err);
        }
    }

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setFeedback(null);
        try {
            await setDoc(doc(db, "settings", "attendance"), {
                startTime,
                endTime,
            }, { merge: true });
            setFeedback({ type: "success", msg: "Configurações salvas com sucesso!" });
        } catch (error) {
            console.error(error);
            setFeedback({ type: "error", msg: "Falha ao salvar as configurações." });
        } finally {
            setIsSaving(false);
        }
    };

    const handleAddBlockedDate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!blockDate || !blockReason) return;
        setIsSavingBlock(true);
        setCalendarFeedback(null);
        try {
            const createdBy = user?.email || "admin@prof.educacao.sp.gov.br";
            const endDate = blockEndDate || blockDate;

            const { getDatesInRange } = await import("@/lib/calendarUtils");
            const datesToBlock = getDatesInRange(blockDate, endDate);
            
            if (typeof window !== "undefined" && window.location.hostname === "localhost") {
                const { mockDb } = await import("@/lib/mockDatabase");
                datesToBlock.forEach(d => {
                    mockDb.addBlockedDate({
                        date: d,
                        reason: blockReason,
                        createdBy,
                        createdAt: new Date().toISOString()
                    });
                });
            } else {
                const batch = writeBatch(db);
                datesToBlock.forEach(d => {
                    const docRef = doc(db, "blocked_dates", d);
                    batch.set(docRef, {
                        reason: blockReason,
                        createdBy,
                        createdAt: new Date().toISOString()
                    });
                });
                await batch.commit();
            }

            setBlockDate("");
            setBlockEndDate("");
            setBlockReason("");
            setCalendarFeedback({ 
                type: "success", 
                msg: datesToBlock.length === 1
                    ? `Data ${formatDateToShow(blockDate)} bloqueada com sucesso!`
                    : `Período de ${formatDateToShow(blockDate)} até ${formatDateToShow(endDate)} bloqueado com sucesso (${datesToBlock.length} dias)!`
            });
            loadBlockedDates();
        } catch (error: unknown) {
            console.error(error);
            const errMsg = error instanceof Error ? error.message : String(error);
            setCalendarFeedback({ type: "error", msg: `Falha ao bloquear o período: ${errMsg}` });
        } finally {
            setIsSavingBlock(false);
        }
    };

    const handleDeleteBlockedDate = async (date: string) => {
        if (!confirm(`Deseja realmente desbloquear a data ${formatDateToShow(date)}?`)) return;
        setCalendarFeedback(null);
        try {
            if (typeof window !== "undefined" && window.location.hostname === "localhost") {
                const { mockDb } = await import("@/lib/mockDatabase");
                mockDb.removeBlockedDate(date);
            } else {
                await deleteDoc(doc(db, "blocked_dates", date));
            }
            setCalendarFeedback({ type: "success", msg: `Data ${formatDateToShow(date)} desbloqueada com sucesso!` });
            loadBlockedDates();
        } catch (error: unknown) {
            console.error(error);
            const errMsg = error instanceof Error ? error.message : String(error);
            setCalendarFeedback({ type: "error", msg: `Falha ao desbloquear a data: ${errMsg}` });
        }
    };

    const handleImportHolidays = async () => {
        setIsImporting(true);
        setCalendarFeedback(null);
        try {
            const currentYear = new Date().getFullYear();
            const holidays = await fetchBrasilAPIHolidays(currentYear);
            const createdBy = user?.email || "admin@prof.educacao.sp.gov.br";

            // Adiciona feriado estadual paulista de 9 de julho (se não estiver na lista nacional)
            const hasJuly9 = holidays.some(h => h.date.endsWith("-07-09"));
            if (!hasJuly9) {
                holidays.push({
                    date: `${currentYear}-07-09`,
                    name: "Revolução Constitucionalista (Feriado Estadual - SP)"
                });
            }

            if (typeof window !== "undefined" && window.location.hostname === "localhost") {
                const { mockDb } = await import("@/lib/mockDatabase");
                holidays.forEach(h => {
                    mockDb.addBlockedDate({
                        date: h.date,
                        reason: h.name,
                        createdBy,
                        createdAt: new Date().toISOString()
                    });
                });
            } else {
                const batch = writeBatch(db);
                holidays.forEach(h => {
                    const docRef = doc(db, "blocked_dates", h.date);
                    batch.set(docRef, {
                        reason: h.name,
                        createdBy,
                        createdAt: new Date().toISOString()
                    });
                });
                await batch.commit();
            }

            setCalendarFeedback({ type: "success", msg: `${holidays.length} feriados importados para o ano de ${currentYear}!` });
            loadBlockedDates();
        } catch (error: unknown) {
            console.error("Erro completo na importação de feriados:", error);
            const errMsg = error instanceof Error ? error.message : String(error);
            setCalendarFeedback({ type: "error", msg: `Falha ao importar feriados da BrasilAPI: ${errMsg}` });
        } finally {
            setIsImporting(false);
        }
    };

    const formatDateToShow = (dateStr: string) => {
        const parts = dateStr.split("-");
        if (parts.length !== 3) return dateStr;
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    };

    return (
        <div className="space-y-6 animate-fade-in max-w-xl">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <div className="mb-6">
                    <h2 className="text-xl font-bold text-gray-900">Horário da Chamada</h2>
                    <p className="text-sm text-gray-500 mt-1">Defina a janela de tempo em que os professores podem registrar as presenças diariamente.</p>
                </div>

                {feedback && (
                    <div className={`p-4 rounded-xl border font-medium mb-6 ${feedback.type === "success" ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                        {feedback.msg}
                    </div>
                )}

                <form onSubmit={handleSave} className="space-y-5">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="block text-sm font-semibold text-gray-700">Horário de Início</label>
                            <input
                                type="time"
                                required
                                value={startTime}
                                onChange={e => setStartTime(e.target.value)}
                                className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-green-500 text-gray-900"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="block text-sm font-semibold text-gray-700">Horário de Término</label>
                            <input
                                type="time"
                                required
                                value={endTime}
                                onChange={e => setEndTime(e.target.value)}
                                className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-green-500 text-gray-900"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isSaving}
                        className="w-full bg-gray-900 hover:bg-gray-800 text-white font-bold py-3 rounded-xl transition-colors disabled:opacity-50"
                    >
                        {isSaving ? "Salvando..." : "Salvar Configurações"}
                    </button>
                </form>
            </div>

            {/* Card 2: Bloqueio de Calendário */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">Bloqueio de Calendário</h2>
                        <p className="text-sm text-gray-500 mt-1">Impeça chamadas em feriados, pontos facultativos ou recessos escolares específicos.</p>
                    </div>
                    <button
                        onClick={handleImportHolidays}
                        disabled={isImporting}
                        className="bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100 hover:border-blue-200 font-bold px-4 py-2 rounded-xl transition-colors text-xs shadow-sm flex items-center gap-1.5 self-start sm:self-auto"
                    >
                        {isImporting ? (
                            <>
                                <span className="animate-spin h-3 w-3 border-2 border-blue-700 border-t-transparent rounded-full"></span>
                                <span>Importando...</span>
                            </>
                        ) : (
                            <span>Importar Feriados (BrasilAPI)</span>
                        )}
                    </button>
                </div>

                {calendarFeedback && (
                    <div className={`p-4 rounded-xl border font-medium mb-6 ${calendarFeedback.type === "success" ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                        {calendarFeedback.msg}
                    </div>
                )}

                {/* Formulário para bloquear período */}
                <form onSubmit={handleAddBlockedDate} className="space-y-4 bg-gray-50 p-4 rounded-2xl border border-gray-100 mb-6">
                    <h3 className="font-bold text-gray-800 text-sm">Bloquear Período ou Data</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="space-y-1">
                            <label className="block text-xs font-bold text-gray-500 uppercase">Data de Início</label>
                            <input
                                type="date"
                                required
                                value={blockDate}
                                onChange={e => {
                                    setBlockDate(e.target.value);
                                    if (!blockEndDate || blockEndDate < e.target.value) {
                                        setBlockEndDate(e.target.value);
                                    }
                                }}
                                className="w-full border border-gray-300 rounded-xl px-4 py-2 text-sm text-gray-900 bg-white"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="block text-xs font-bold text-gray-500 uppercase">Data de Fim (Opcional)</label>
                            <input
                                type="date"
                                value={blockEndDate}
                                onChange={e => setBlockEndDate(e.target.value)}
                                className="w-full border border-gray-300 rounded-xl px-4 py-2 text-sm text-gray-900 bg-white"
                                min={blockDate}
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="block text-xs font-bold text-gray-500 uppercase">Motivo / Descrição</label>
                            <input
                                type="text"
                                required
                                placeholder="Ex: Férias, Recesso, Feriado..."
                                value={blockReason}
                                onChange={e => setBlockReason(e.target.value)}
                                className="w-full border border-gray-300 rounded-xl px-4 py-2 text-sm text-gray-900 bg-white"
                            />
                        </div>
                    </div>
                    <button
                        type="submit"
                        disabled={isSavingBlock}
                        className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-xl text-sm transition-colors disabled:opacity-50"
                    >
                        {isSavingBlock ? "Salvando..." : "Bloquear Datas"}
                    </button>
                </form>

                {/* Lista de datas bloqueadas */}
                <div className="space-y-3">
                    <h3 className="font-bold text-gray-800 text-sm">Datas Bloqueadas Cadastradas</h3>
                    {blockedList.length === 0 ? (
                        <p className="text-sm text-gray-400 font-medium bg-gray-50/50 p-4 rounded-xl text-center border border-dashed border-gray-200">
                            Nenhuma data de bloqueio configurada.
                        </p>
                    ) : (
                        <div className="max-h-60 overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-50">
                            {blockedList
                                .sort((a, b) => a.date.localeCompare(b.date))
                                .map(item => (
                                    <div key={item.date} className="p-3 flex items-center justify-between hover:bg-gray-50 transition-colors gap-4">
                                        <div className="truncate">
                                            <p className="font-bold text-sm text-gray-900">{formatDateToShow(item.date)}</p>
                                            <p className="text-xs text-gray-500 font-medium mt-0.5 truncate">{item.reason}</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteBlockedDate(item.date)}
                                            className="text-red-500 hover:text-red-700 font-bold text-xs bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg border border-red-100 transition-colors flex-shrink-0"
                                        >
                                            Desbloquear
                                        </button>
                                    </div>
                                ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

