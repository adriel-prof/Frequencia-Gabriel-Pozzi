"use client";

import { useState, useEffect } from "react";
import { collection, writeBatch, doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebaseConfig";
import { useAuth } from "@/context/AuthContext";

type Student = {
    id: number;
    name: string;
    class: string;
};

type AttendanceStatus = "P" | "F";

export function AttendanceList({ students }: { students: Student[] }) {
    const { user } = useAuth();
    const [attendance, setAttendance] = useState<Record<number, AttendanceStatus>>({});
    const [isAllowed, setIsAllowed] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

    // Define padrão das presenças e valida regras de horário
    useEffect(() => {
        const initialAttendance: Record<number, AttendanceStatus> = {};
        students.forEach((s) => {
            initialAttendance[s.id] = "P"; // Padrão
        });
        setAttendance(initialAttendance);

        const checkTime = () => {
            const now = new Date();
            const hours = now.getHours();
            const minutes = now.getMinutes();

            // Libera após 08:40 e talvez travar após um horário limite? (vamos apenas considerar >= 08:40)
            if (hours > 8 || (hours === 8 && minutes >= 40)) {
                setIsAllowed(true);
            } else {
                setIsAllowed(false);
            }
        };

        checkTime();
        const interval = setInterval(checkTime, 60000); // Check every minute
        return () => clearInterval(interval);
    }, [students]);

    const handleStatusChange = (id: number, status: AttendanceStatus) => {
        if (!isAllowed) return; // Ignore input fora do horário
        setAttendance((prev) => ({ ...prev, [id]: status }));
    };

    const handleSubmit = async () => {
        if (!isAllowed) return;
        setIsSubmitting(true);
        setFeedback(null);

        try {
            const batch = writeBatch(db);
            const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

            students.forEach((s) => {
                const docRef = doc(collection(db, "attendance")); // Auto-ID doc
                batch.set(docRef, {
                    studentId: s.id,
                    studentName: s.name,
                    studentClass: s.class,
                    date: today,
                    status: attendance[s.id],
                    teacher: user?.email,
                    timestamp: serverTimestamp(),
                });
            });

            await batch.commit();
            setFeedback({ type: "success", msg: "Chamada finalizada e enviada com sucesso!" });
        } catch (err: unknown) {
            console.error(err);
            setFeedback({ type: "error", msg: "Erro ao enviar a chamada. Tente novamente." });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="max-w-3xl mx-auto pb-24 space-y-4">
            {!isAllowed && (
                <div className="bg-red-50 text-red-700 p-4 rounded-xl border border-red-200 mb-6 font-medium text-center shadow-sm">
                    Horário de chamada encerrado ou não iniciado. Acessível a partir das 08:40.
                </div>
            )}

            {feedback && (
                <div className={`p-4 rounded-xl border font-medium mb-6 ${feedback.type === "success" ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                    {feedback.msg}
                </div>
            )}

            <div className="space-y-3">
                {students.map((student) => (
                    <div key={student.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between gap-4 transition-all">
                        <div className="flex-1 truncate">
                            <p className="font-semibold text-gray-900 truncate">{student.name}</p>
                            <p className="text-xs text-gray-400">Nº {student.id} &bull; {student.class}</p>
                        </div>

                        <div className="flex gap-2">
                            <button
                                disabled={!isAllowed || isSubmitting}
                                onClick={() => handleStatusChange(student.id, "P")}
                                className={`w-14 h-14 rounded-xl flex items-center justify-center font-bold text-lg transition-all ${attendance[student.id] === "P"
                                        ? "bg-green-500 text-white shadow-md shadow-green-500/30 scale-105 ring-2 ring-green-600 ring-offset-2"
                                        : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                                    } ${!isAllowed ? "opacity-50 cursor-not-allowed" : ""}`}
                            >
                                P
                            </button>
                            <button
                                disabled={!isAllowed || isSubmitting}
                                onClick={() => handleStatusChange(student.id, "F")}
                                className={`w-14 h-14 rounded-xl flex items-center justify-center font-bold text-lg transition-all ${attendance[student.id] === "F"
                                        ? "bg-red-500 text-white shadow-md shadow-red-500/30 scale-105 ring-2 ring-red-600 ring-offset-2"
                                        : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                                    } ${!isAllowed ? "opacity-50 cursor-not-allowed" : ""}`}
                            >
                                F
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Footer / Floating Actions */}
            <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t border-gray-200 p-4 flex justify-center shadow-[0_-10px_40px_rgba(0,0,0,0.05)]">
                <div className="w-full max-w-3xl">
                    <button
                        onClick={handleSubmit}
                        disabled={!isAllowed || isSubmitting || !!feedback}
                        className={`w-full h-14 rounded-xl font-bold text-lg flex items-center justify-center transition-all ${isAllowed && !feedback
                                ? "bg-gray-900 text-white hover:bg-gray-800 shadow-lg"
                                : "bg-gray-200 text-gray-400 cursor-not-allowed"
                            }`}
                    >
                        {isSubmitting ? (
                            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        ) : "Finalizar Chamada"}
                    </button>
                </div>
            </div>
        </div>
    );
}
