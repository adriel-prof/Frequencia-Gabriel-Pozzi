"use client";

import { useState, useEffect } from "react";
import { collection, writeBatch, doc, getDoc, serverTimestamp, deleteDoc, addDoc } from "firebase/firestore";
import { db } from "@/lib/firebaseConfig";
import { useAuth } from "@/context/AuthContext";

type Student = {
    firestoreId: string;
    id: number;
    name: string;
    class: string;
};

type AttendanceStatus = "P" | "F";

export function AttendanceList({ students, onSuccess }: { students: Student[], onSuccess?: () => void }) {
    const { user, role } = useAuth();
    const [attendance, setAttendance] = useState<Record<number, AttendanceStatus>>({});
    const [isAllowed, setIsAllowed] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);
    const [showSuccessModal, setShowSuccessModal] = useState(false);

    // States for Modals
    const [deleteCandidate, setDeleteCandidate] = useState<{ id: string, name: string } | null>(null);
    const [isDeletingStudent, setIsDeletingStudent] = useState(false);
    const [showAddStudentModal, setShowAddStudentModal] = useState(false);
    const [newStudentId, setNewStudentId] = useState("");
    const [newStudentName, setNewStudentName] = useState("");
    const [isAddingStudent, setIsAddingStudent] = useState(false);

    const [timeSettings, setTimeSettings] = useState({ start: "08:40", end: "23:59" });

    // Busca os horários dinâmicos do Firebase
    useEffect(() => {
        async function fetchSettings() {
            try {
                const snap = await getDoc(doc(db, "settings", "attendance"));
                if (snap.exists()) {
                    const data = snap.data();
                    setTimeSettings({
                        start: data.startTime || "08:40",
                        end: data.endTime || "23:59"
                    });
                }
            } catch (err) {
                console.error("Erro ao carregar horários", err);
            }
        }
        fetchSettings();
    }, []);

    // Define padrão das presenças e valida regras de horário
    useEffect(() => {
        const initialAttendance: Record<number, AttendanceStatus> = {};
        students.forEach((s) => {
            initialAttendance[s.id] = "P"; // Padrão
        });
        setAttendance(initialAttendance);

    }, [students]);

    useEffect(() => {
        const checkTime = () => {
            const now = new Date();
            const hh = String(now.getHours()).padStart(2, '0');
            const mm = String(now.getMinutes()).padStart(2, '0');
            const currentStr = `${hh}:${mm}`;

            if (currentStr >= timeSettings.start && currentStr <= timeSettings.end) {
                setIsAllowed(true);
            } else {
                setIsAllowed(false);
            }
        };

        checkTime();
        const interval = setInterval(checkTime, 60000); // Check every minute
        return () => clearInterval(interval);
    }, [timeSettings]);

    const handleStatusChange = (id: number, status: AttendanceStatus) => {
        if (!isAllowed) return; // Ignore input fora do horário
        setAttendance((prev) => ({ ...prev, [id]: status }));
    };

    const confirmDeleteStudent = async () => {
        if (!deleteCandidate) return;
        setIsDeletingStudent(true);
        try {
            await deleteDoc(doc(db, "students", deleteCandidate.id));
            window.location.reload(); // Vai recarregar a tela para puxar dados atualizados do banco
        } catch (err) {
            console.error("Erro ao excluir aluno:", err);
            alert("Falha ao excluir o aluno. Tente novamente.");
        } finally {
            setIsDeletingStudent(false);
            setDeleteCandidate(null);
        }
    };

    const handleAddStudent = async () => {
        if (!newStudentName.trim() || !newStudentId) return;
        setIsAddingStudent(true);
        try {
            const studentClass = students[0]?.class || "Nova Turma";
            await addDoc(collection(db, "students"), {
                id: Number(newStudentId),
                name: newStudentName.trim().toUpperCase(),
                class: studentClass
            });
            window.location.reload(); // Recarrega tela para ver o aluno adicionado
        } catch (err) {
            console.error(err);
            alert("Erro ao adicionar aluno.");
        } finally {
            setIsAddingStudent(false);
            setShowAddStudentModal(false);
            setNewStudentName("");
            setNewStudentId("");
        }
    };

    const handleSubmit = async () => {
        if (!isAllowed) return;
        setIsSubmitting(true);
        setFeedback(null);

        try {
            const batch = writeBatch(db);
            const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
            const dateKey = today.replace(/-/g, ""); // YYYYMMDD

            students.forEach((s) => {
                // Ao criar um ID com base na data + aluno, garantimos a sobrescrita (merge)
                const docId = `att_${s.firestoreId}_${dateKey}`;
                const docRef = doc(db, "attendance", docId);

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

            // Dispara o e-mail de Busca Ativa em segundo plano (sem travar a tela)
            const url = user?.email ? `/api/cron/send-report?loggedUserEmail=${encodeURIComponent(user.email)}` : '/api/cron/send-report';
            fetch(url).catch(console.error);

            setShowSuccessModal(true);
            setFeedback(null);
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
                    Horário de chamada não permitido. Acessível entre {timeSettings.start} e {timeSettings.end}.
                </div>
            )}

            {feedback && (
                <div className={`p-4 rounded-xl border font-medium mb-6 ${feedback.type === "success" ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                    {feedback.msg}
                </div>
            )}

            {role === "admin" && (
                <div className="flex justify-end mb-4 animate-fade-in">
                    <button
                        onClick={() => setShowAddStudentModal(true)}
                        className="bg-blue-50 text-blue-600 font-bold px-4 py-2 rounded-xl border border-blue-100 hover:bg-blue-100 transition-colors flex items-center gap-2 text-sm shadow-sm"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        Adicionar Aluno Manualmente
                    </button>
                </div>
            )}

            <div className="space-y-3">
                {students.map((student) => (
                    <div key={student.firestoreId} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between gap-4 transition-all">
                        <div className="flex-1 truncate">
                            <p className="font-semibold text-gray-900 truncate">{student.name}</p>
                            <p className="text-xs text-gray-400 flex items-center gap-2">
                                Nº {student.id} &bull; {student.class}
                                {role === "admin" && (
                                    <>
                                        &bull;
                                        <button
                                            onClick={() => setDeleteCandidate({ id: student.firestoreId, name: student.name })}
                                            className="text-red-500 hover:text-red-700 font-medium cursor-pointer"
                                        >
                                            Excluir
                                        </button>
                                    </>
                                )}
                            </p>
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

            {/* Modal de Sucesso (Pop-up) */}
            {showSuccessModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center space-y-6">
                        <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto border-4 border-green-50 shadow-inner">
                            <svg className="w-10 h-10 animate-[bounce_1s_infinite]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="text-2xl font-extrabold text-gray-900 tracking-tight">Chamada Finalizada</h3>
                            <p className="text-gray-500 mt-2 text-sm leading-relaxed">
                                Os registros foram salvos no banco de dados e o relatório foi enviado com sucesso à coordenação!
                            </p>
                        </div>
                        <div>
                            <button
                                onClick={() => {
                                    setShowSuccessModal(false);
                                    window.scrollTo(0, 0);
                                    if (onSuccess) onSuccess();
                                }}
                                className="w-full bg-green-600 text-white font-bold py-3.5 px-4 rounded-xl hover:bg-green-700 transition-colors shadow-lg shadow-green-600/30"
                            >
                                Concluir
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Modal de Exclusão (Pop-up) */}
            {deleteCandidate && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center space-y-6">
                        <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto border-4 border-red-50 shadow-inner">
                            <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="text-2xl font-extrabold text-gray-900 tracking-tight">Excluir Aluno?</h3>
                            <p className="text-gray-500 mt-2 text-sm leading-relaxed">
                                Tem certeza que deseja remover <b>{deleteCandidate.name}</b> permanentemente?
                            </p>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setDeleteCandidate(null)}
                                className="flex-1 bg-gray-100 text-gray-700 font-bold py-3.5 px-4 rounded-xl hover:bg-gray-200 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={confirmDeleteStudent}
                                disabled={isDeletingStudent}
                                className="flex-1 bg-red-500 text-white font-bold py-3.5 px-4 rounded-xl hover:bg-red-600 transition-colors shadow-lg shadow-red-500/30 flex justify-center items-center"
                            >
                                {isDeletingStudent ? "Excluindo..." : "Excluir"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Adição (Pop-up) */}
            {showAddStudentModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl space-y-6">
                        <div className="text-center">
                            <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mx-auto border-4 border-blue-50 mb-4 shadow-inner">
                                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                                </svg>
                            </div>
                            <h3 className="text-2xl font-extrabold text-gray-900 tracking-tight">Adicionar Aluno</h3>
                            <p className="text-gray-500 mt-1 text-sm">Insira os dados do novo aluno para a turma {students[0]?.class}</p>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1 flex items-center gap-2">
                                    <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                                    </svg>
                                    Número na Chamada
                                </label>
                                <input
                                    type="number"
                                    value={newStudentId}
                                    onChange={e => setNewStudentId(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-gray-50"
                                    placeholder="Ex: 45"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1 flex items-center gap-2">
                                    <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                    </svg>
                                    Nome Completo
                                </label>
                                <input
                                    type="text"
                                    value={newStudentName}
                                    onChange={e => setNewStudentName(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-gray-50 uppercase"
                                    placeholder="NOME DO ALUNO"
                                />
                            </div>
                        </div>
                        <div className="flex gap-3 pt-2">
                            <button
                                onClick={() => setShowAddStudentModal(false)}
                                className="flex-1 bg-gray-100 text-gray-700 font-bold py-3.5 px-4 rounded-xl hover:bg-gray-200 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleAddStudent}
                                disabled={isAddingStudent || !newStudentName.trim() || !newStudentId}
                                className="flex-1 bg-blue-600 text-white font-bold py-3.5 px-4 rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/30 disabled:opacity-50 flex justify-center items-center"
                            >
                                {isAddingStudent ? "Salvando..." : "Salvar"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
