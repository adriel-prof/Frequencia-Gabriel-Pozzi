"use client";

import { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebaseConfig";

export default function SettingsPage() {
    const [startTime, setStartTime] = useState("08:40");
    const [endTime, setEndTime] = useState("23:59");
    const [isSaving, setIsSaving] = useState(false);
    const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

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
    }, []);

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
        </div>
    );
}
