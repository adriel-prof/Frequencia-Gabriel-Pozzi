"use client";

import { useState, useEffect } from "react";
import { collection, writeBatch, doc, getDoc, setDoc, serverTimestamp, deleteDoc, addDoc, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebaseConfig";
import { useAuth } from "@/context/AuthContext";

type Student = {
    firestoreId: string;
    id: number;
    name: string;
    class: string;
    dispensed?: boolean;
};

type AttendanceStatus = "P" | "F" | "D" | "A";

const LOCK_DATE = "2026-04-06";


export function AttendanceList({ students, onSuccess }: { students: Student[], onSuccess?: () => void }) {
    const { user, role } = useAuth();
    const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({});
    const [dispensedStudents, setDispensedStudents] = useState<Set<string>>(new Set());
    const [isAllowed, setIsAllowed] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [isUpdateMode, setIsUpdateMode] = useState(false);

    // States for Modals
    const [deleteCandidate, setDeleteCandidate] = useState<{ id: string, name: string } | null>(null);
    const [isDeletingStudent, setIsDeletingStudent] = useState(false);
    const [showAddStudentModal, setShowAddStudentModal] = useState(false);
    const [newStudentId, setNewStudentId] = useState("");
    const [newStudentName, setNewStudentName] = useState("");
    const [isAddingStudent, setIsAddingStudent] = useState(false);

    // States for Transfer Modal
    const [transferCandidate, setTransferCandidate] = useState<Student | null>(null);
    const [transferTargetClass, setTransferTargetClass] = useState("");
    const [isTransferNewClass, setIsTransferNewClass] = useState(false);
    const [transferCustomClass, setTransferCustomClass] = useState("");
    const [transferNewNumber, setTransferNewNumber] = useState<number>(1);
    const [isTransferSaving, setIsTransferSaving] = useState(false);
    const [allStudentsList, setAllStudentsList] = useState<Student[]>([]);

    const [timeSettings, setTimeSettings] = useState({ start: "08:40", end: "23:59" });

    // Fetch all students to support transfer/remanejamento suggestions
    useEffect(() => {
        if (role !== "admin") return;
        async function fetchAllStudents() {
            try {
                if (typeof window !== "undefined" && window.location.hostname === "localhost") {
                    const { mockDb } = await import("@/lib/mockDatabase");
                    setAllStudentsList(mockDb.getStudents());
                    return;
                }
                const snap = await getDocs(collection(db, "students"));
                const list = snap.docs.map(d => ({
                    firestoreId: d.id,
                    name: d.data().name as string,
                    class: d.data().class as string,
                    id: Number(d.data().id)
                })) as Student[];
                setAllStudentsList(list);
            } catch (err) {
                console.error("Erro ao buscar lista de alunos no painel de chamada:", err);
            }
        }
        fetchAllStudents();
    }, [role]);

    // Recalcular número sugerido para transferência
    useEffect(() => {
        if (!transferCandidate) return;
        
        const finalTargetClass = isTransferNewClass ? transferCustomClass.trim().toUpperCase() : transferTargetClass;
        if (!finalTargetClass) {
            setTransferNewNumber(transferCandidate.id);
            return;
        }

        const targetStudents = allStudentsList.filter(
            s => s.class.trim().toUpperCase().replace(/°/g, 'º') === finalTargetClass.replace(/°/g, 'º')
        );
        
        if (targetStudents.length > 0) {
            const maxId = Math.max(...targetStudents.map(s => s.id));
            setTransferNewNumber(maxId + 1);
        } else {
            setTransferNewNumber(1);
        }
    }, [transferTargetClass, isTransferNewClass, transferCustomClass, transferCandidate, allStudentsList]);

    const handleTransferStudent = async () => {
        if (!transferCandidate) return;
        const finalTargetClass = (isTransferNewClass ? transferCustomClass.trim() : transferTargetClass).toUpperCase().replace(/°/g, 'º');
        
        if (!finalTargetClass) {
            alert("Por favor, especifique a turma de destino.");
            return;
        }

        if (finalTargetClass === transferCandidate.class.trim().toUpperCase().replace(/°/g, 'º')) {
            alert("A turma de destino é a mesma da turma de origem.");
            return;
        }

        setIsTransferSaving(true);
        try {
            if (typeof window !== "undefined" && window.location.hostname === "localhost") {
                const { mockDb } = await import("@/lib/mockDatabase");
                mockDb.saveStudent({
                    firestoreId: transferCandidate.firestoreId,
                    id: Number(transferNewNumber),
                    name: transferCandidate.name,
                    class: finalTargetClass
                });
                
                alert(`Estudante transferido com sucesso para a turma ${finalTargetClass}!`);
                window.location.reload();
                return;
            }

            const studentRef = doc(db, "students", transferCandidate.firestoreId);
            await setDoc(studentRef, {
                class: finalTargetClass,
                id: Number(transferNewNumber)
            }, { merge: true });

            alert(`Estudante transferido com sucesso para a turma ${finalTargetClass}!`);
            window.location.reload();
        } catch (err) {
            console.error("Erro ao transferir aluno:", err);
            alert("Erro ao transferir o aluno.");
        } finally {
            setIsTransferSaving(false);
            setTransferCandidate(null);
        }
    };

    const uniqueClasses = Array.from(
        new Set(allStudentsList.map(s => s.class.trim().toUpperCase().replace(/°/g, 'º')))
    ).sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" }));

    // Busca os horários dinâmicos do Firebase
    useEffect(() => {
        async function fetchSettings() {
            try {
                if (typeof window !== "undefined" && window.location.hostname === "localhost") {
                    setTimeSettings({
                        start: "00:00", // Permite chamadas a qualquer hora no localhost
                        end: "23:59"
                    });
                    return;
                }
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

    const normalizeClassName = (name: string) => name ? name.trim().toUpperCase().replace(/°/g, 'º') : "";
    // Define padrão das presenças e valida regras de horário
    useEffect(() => {
        async function fetchCurrentStatus() {
            if (students.length === 0) {
                return;
            }
            try {
                const today = new Date().toISOString().split("T")[0];

                if (typeof window !== "undefined" && window.location.hostname === "localhost") {
                    const { mockDb } = await import("@/lib/mockDatabase");
                    const localRecords = mockDb.getAttendance(today);
                    const localDispensed = mockDb.getDispensedStudents();
                    
                    const initialAttendance: Record<string, AttendanceStatus> = {};
                    const initialDispensed = new Set<string>();
                    
                    const existingMap: Record<string, AttendanceStatus> = {};
                    localRecords.forEach(r => {
                        if (normalizeClassName(r.studentClass) === normalizeClassName(students[0].class)) {
                            existingMap[r.studentFirestoreId] = r.status;
                        }
                    });
                    
                    students.forEach((s) => {
                        const isDispensed = localDispensed.has(s.firestoreId);
                        const hasExistingRecord = s.firestoreId in existingMap;
                        if (hasExistingRecord) {
                            initialAttendance[s.firestoreId] = existingMap[s.firestoreId];
                            if (existingMap[s.firestoreId] === "D") {
                                initialDispensed.add(s.firestoreId);
                            }
                        } else if (isDispensed) {
                            initialAttendance[s.firestoreId] = "D";
                            initialDispensed.add(s.firestoreId);
                        } else {
                            initialAttendance[s.firestoreId] = "P";
                        }
                    });
                    
                    setAttendance(initialAttendance);
                    setDispensedStudents(initialDispensed);
                    if (Object.keys(existingMap).length > 0) {
                        setIsUpdateMode(true);
                    }
                    return;
                }

                const q = query(
                    collection(db, "attendance"),
                    where("date", "==", today),
                    where("studentClass", "==", normalizeClassName(students[0].class))
                );
                const snap = await getDocs(q);

                const initialAttendance: Record<string, AttendanceStatus> = {};
                const initialDispensed = new Set<string>();

                // 1. Mapear as presenças existentes no banco hoje
                const existingMap: Record<string, AttendanceStatus> = {};
                snap.docs.forEach(d => {
                    const data = d.data();
                    let fId = data.studentFirestoreId;
                    if (!fId) {
                        // Extrai o firestoreId do ID do documento: att_${firestoreId}_${dateKey}
                        const match = d.id.match(/^att_(.+?)_\d{8}$/);
                        if (match) {
                            fId = match[1];
                        }
                    }
                    if (fId) {
                        existingMap[fId] = data.status;
                    } else {
                        // Busca pelo studentId ou nome na lista de estudantes passada via props
                        const found = students.find(s => s.id === data.studentId || s.name === data.studentName);
                        if (found) {
                            existingMap[found.firestoreId] = data.status;
                        }
                    }
                });

                // 2. Preencher o estado inicial
                students.forEach((s) => {
                    const hasExistingRecord = s.firestoreId in existingMap;
                    if (hasExistingRecord) {
                        initialAttendance[s.firestoreId] = existingMap[s.firestoreId];
                        if (existingMap[s.firestoreId] === "D") {
                            initialDispensed.add(s.firestoreId);
                        }
                    } else if (s.dispensed) {
                        initialAttendance[s.firestoreId] = "D";
                        initialDispensed.add(s.firestoreId);
                    } else {
                        initialAttendance[s.firestoreId] = "P";
                    }
                });

                setAttendance(initialAttendance);
                setDispensedStudents(initialDispensed);
                if (Object.keys(existingMap).length > 0) {
                    setIsUpdateMode(true);
                }
            } catch (err) {
                console.error("Erro ao buscar presença do dia", err);
            } finally {
                // Done
            }
        }
        fetchCurrentStatus();
    }, [students]);

    useEffect(() => {
        const checkTimeAndDate = () => {
            const now = new Date();
            const today = now.toISOString().split("T")[0];
            const hh = String(now.getHours()).padStart(2, '0');
            const mm = String(now.getMinutes()).padStart(2, '0');
            const currentStr = `${hh}:${mm}`;

            const isTimeAllowed = currentStr >= timeSettings.start && currentStr <= timeSettings.end;
            const isDateAllowed = today >= LOCK_DATE;

            setIsAllowed(isTimeAllowed && isDateAllowed);
        };

        checkTimeAndDate();
        const interval = setInterval(checkTimeAndDate, 60000); // Check every minute
        return () => clearInterval(interval);
    }, [timeSettings]);

    const handleStatusChange = (firestoreId: string, status: AttendanceStatus) => {
        if (!isAllowed) return;
        setAttendance((prev) => ({ ...prev, [firestoreId]: status }));
    };

    const toggleDispensa = async (student: Student) => {
        const newDispensed = !dispensedStudents.has(student.firestoreId);
        try {
            if (typeof window !== "undefined" && window.location.hostname === "localhost") {
                const { mockDb } = await import("@/lib/mockDatabase");
                if (newDispensed) {
                    mockDb.addDispensation(student.firestoreId);
                } else {
                    mockDb.removeDispensation(student.firestoreId);
                }
                student.dispensed = newDispensed;
                setDispensedStudents(prev => {
                    const next = new Set(prev);
                    if (newDispensed) {
                        next.add(student.firestoreId);
                    } else {
                        next.delete(student.firestoreId);
                    }
                    return next;
                });
                setAttendance(prev => ({
                    ...prev,
                    [student.firestoreId]: newDispensed ? "D" : "P"
                }));
                return;
            }

            // Persiste no Firestore
            await setDoc(doc(db, "students", student.firestoreId), { dispensed: newDispensed }, { merge: true });
            student.dispensed = newDispensed;

            setDispensedStudents(prev => {
                const next = new Set(prev);
                if (newDispensed) {
                    next.add(student.firestoreId);
                } else {
                    next.delete(student.firestoreId);
                }
                return next;
            });

            setAttendance(prev => ({
                ...prev,
                [student.firestoreId]: newDispensed ? "D" : "P"
            }));
        } catch (err) {
            console.error("Erro ao alterar dispensa:", err);
            alert("Erro ao alterar dispensa médica.");
        }
    };

    const confirmDeleteStudent = async () => {
        if (!deleteCandidate) return;
        setIsDeletingStudent(true);
        try {
            if (typeof window !== "undefined" && window.location.hostname === "localhost") {
                const { mockDb } = await import("@/lib/mockDatabase");
                mockDb.deleteStudent(deleteCandidate.id);
                window.location.reload();
                return;
            }

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

            if (typeof window !== "undefined" && window.location.hostname === "localhost") {
                const { mockDb } = await import("@/lib/mockDatabase");
                mockDb.saveStudent({
                    id: Number(newStudentId),
                    name: newStudentName.trim().toUpperCase(),
                    class: studentClass
                });
                window.location.reload();
                return;
            }

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
            const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
            
            if (typeof window !== "undefined" && window.location.hostname === "localhost") {
                const { mockDb } = await import("@/lib/mockDatabase");
                const batchRecords = students.map(s => {
                    const currentStatus = attendance[s.firestoreId];
                    if (currentStatus !== "D" && s.dispensed) {
                        mockDb.removeDispensation(s.firestoreId);
                        s.dispensed = false;
                    }
                    return {
                        studentId: s.id,
                        studentName: s.name,
                        studentClass: normalizeClassName(s.class),
                        studentFirestoreId: s.firestoreId,
                        date: today,
                        status: currentStatus,
                        teacher: user?.email || "adrielsilva@prof.educacao.sp.gov.br"
                    };
                });
                mockDb.saveAttendanceBatch(batchRecords);
                setShowSuccessModal(true);
                setFeedback(null);
                return;
            }

            const batch = writeBatch(db);
            const dateKey = today.replace(/-/g, ""); // YYYYMMDD

            students.forEach((s) => {
                // Ao criar um ID com base na data + aluno, garantimos a sobrescrita (merge)
                const docId = `att_${s.firestoreId}_${dateKey}`;
                const docRef = doc(db, "attendance", docId);
                const currentStatus = attendance[s.firestoreId];

                batch.set(docRef, {
                    studentId: s.id,
                    studentName: s.name,
                    studentClass: normalizeClassName(s.class),
                    studentFirestoreId: s.firestoreId,
                    date: today,
                    status: currentStatus,
                    teacher: user?.email,
                    timestamp: serverTimestamp(),
                });

                if (currentStatus !== "D" && s.dispensed) {
                    const studentRef = doc(db, "students", s.firestoreId);
                    batch.update(studentRef, { dispensed: false });
                    s.dispensed = false;
                }
            });

            // Registrar Log de Auditoria no Histórico Principal
            const historyRef = collection(db, "attendance_history");
            await addDoc(historyRef, {
                action: isUpdateMode ? "UPDATE" : "CREATE",
                date: today,
                studentClass: normalizeClassName(students[0]?.class),
                teacher: user?.email,
                timestamp: serverTimestamp(),
                snapshot: attendance 
            });

            await batch.commit();

            // Dispara os e-mails em segundo plano (sem travar a tela)
            const queryParams = user?.email ? `loggedUserEmail=${encodeURIComponent(user.email)}` : '';
            
            // 1. Relatório de Faltas (Busca Ativa)
            fetch(`/api/cron/send-report?${queryParams}`).catch(console.error);


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
            {(() => {
                const now = new Date();
                const today = now.toISOString().split("T")[0];
                if (today < LOCK_DATE) {
                    return (
                        <div className="bg-amber-50 text-amber-700 p-4 rounded-xl border border-amber-200 mb-6 font-medium text-center shadow-sm">
                            Registros bloqueados para datas anteriores a 06/04/2026.
                        </div>
                    );
                }
                if (!isAllowed) {
                    return (
                        <div className="bg-red-50 text-red-700 p-4 rounded-xl border border-red-200 mb-6 font-medium text-center shadow-sm">
                            Horário de chamada não permitido. Acessível entre {timeSettings.start} e {timeSettings.end}.
                        </div>
                    );
                }
                return null;
            })()}

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
                {students.map((student) => {
                    const isDispensed = dispensedStudents.has(student.firestoreId);
                    return (
                        <div key={student.firestoreId} className={`p-4 rounded-2xl shadow-sm border flex items-center justify-between gap-4 transition-all ${isDispensed ? 'bg-gray-50 border-gray-200 opacity-70' : 'bg-white border-gray-100'}`}>
                            <div className="flex-1 truncate">
                                <p className={`font-semibold truncate ${isDispensed ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{student.name}</p>
                                <p className="text-xs text-gray-400 flex items-center gap-2 flex-wrap">
                                    Nº {student.id} &bull; {student.class}
                                    {isDispensed && (
                                        <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded text-[10px] font-bold">DISPENSA MÉDICA</span>
                                    )}
                                    {role === "admin" && (
                                        <>
                                            &bull;
                                            <button
                                                onClick={() => toggleDispensa(student)}
                                                className={`font-medium cursor-pointer ${isDispensed ? 'text-amber-600 hover:text-amber-800' : 'text-amber-500 hover:text-amber-700'}`}
                                            >
                                                {isDispensed ? 'Remover Dispensa' : 'Dispensa Médica'}
                                            </button>
                                            &bull;
                                            <button
                                                onClick={() => {
                                                    setTransferCandidate(student);
                                                    setIsTransferNewClass(false);
                                                    setTransferCustomClass("");
                                                    const defaultTarget = uniqueClasses.find(c => c !== student.class.trim().toUpperCase().replace(/°/g, 'º')) || "";
                                                    setTransferTargetClass(defaultTarget);
                                                }}
                                                className="text-blue-500 hover:text-blue-700 font-medium cursor-pointer"
                                            >
                                                Transferir
                                            </button>
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
                                    onClick={() => handleStatusChange(student.firestoreId, "P")}
                                    className={`w-14 h-14 rounded-xl flex items-center justify-center font-bold text-lg transition-all ${attendance[student.firestoreId] === "P"
                                        ? "bg-green-500 text-white shadow-md shadow-green-500/30 scale-105 ring-2 ring-green-600 ring-offset-2"
                                        : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                                        } ${!isAllowed ? "opacity-50 cursor-not-allowed" : ""}`}
                                >
                                    P
                                </button>
                                <button
                                    disabled={!isAllowed || isSubmitting}
                                    onClick={() => handleStatusChange(student.firestoreId, "F")}
                                    className={`w-14 h-14 rounded-xl flex items-center justify-center font-bold text-lg transition-all ${attendance[student.firestoreId] === "F"
                                        ? "bg-red-500 text-white shadow-md shadow-red-500/30 scale-105 ring-2 ring-red-600 ring-offset-2"
                                        : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                                        } ${!isAllowed ? "opacity-50 cursor-not-allowed" : ""}`}
                                >
                                    F
                                </button>
                                <button
                                    disabled={!isAllowed || isSubmitting}
                                    onClick={() => handleStatusChange(student.firestoreId, "A")}
                                    className={`w-14 h-14 rounded-xl flex items-center justify-center font-bold text-lg transition-all ${attendance[student.firestoreId] === "A"
                                        ? "bg-amber-500 text-white shadow-md shadow-amber-500/30 scale-105 ring-2 ring-amber-600 ring-offset-2"
                                        : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                                        } ${!isAllowed ? "opacity-50 cursor-not-allowed" : ""}`}
                                >
                                    A
                                </button>
                                {isDispensed && (
                                    <button
                                        disabled={!isAllowed || isSubmitting}
                                        onClick={() => handleStatusChange(student.firestoreId, "D")}
                                        className={`w-14 h-14 rounded-xl flex items-center justify-center font-bold text-lg transition-all ${attendance[student.firestoreId] === "D"
                                            ? "bg-blue-500 text-white shadow-md shadow-blue-500/30 scale-105 ring-2 ring-blue-600 ring-offset-2"
                                            : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                                            } ${!isAllowed ? "opacity-50 cursor-not-allowed" : ""}`}
                                    >
                                        D
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
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
                        ) : isUpdateMode ? "Atualizar Chamada" : "Finalizar Chamada"}
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
            {/* Modal de Transferência (Pop-up) */}
            {transferCandidate && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl space-y-6 text-left">
                        <div className="text-center">
                            <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mx-auto border-4 border-blue-50 mb-4 shadow-inner">
                                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                                </svg>
                            </div>
                            <h3 className="text-2xl font-extrabold text-gray-900 tracking-tight">Transferir Estudante</h3>
                            <p className="text-gray-500 mt-1 text-sm">Selecione a turma de destino para <strong className="text-gray-900 uppercase font-black">{transferCandidate.name}</strong></p>
                        </div>
                        <div className="space-y-4">
                            <div className="space-y-1">
                                <div className="flex justify-between items-center mb-1">
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Turma de Destino</label>
                                    <button 
                                        type="button"
                                        onClick={() => {
                                            setIsTransferNewClass(!isTransferNewClass);
                                            setTransferTargetClass("");
                                            setTransferCustomClass("");
                                        }}
                                        className="text-xs text-blue-600 hover:text-blue-800 font-bold"
                                    >
                                        {isTransferNewClass ? "Escolher existente" : "Nova turma..."}
                                    </button>
                                </div>
                                {isTransferNewClass ? (
                                    <input
                                        type="text"
                                        value={transferCustomClass}
                                        onChange={e => setTransferCustomClass(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-gray-50 uppercase font-bold"
                                        placeholder="Ex: 2ºB"
                                        autoFocus
                                    />
                                ) : (
                                    <select
                                        value={transferTargetClass}
                                        onChange={e => setTransferTargetClass(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white font-bold"
                                    >
                                        <option value="">Selecione...</option>
                                        {uniqueClasses.map(cls => (
                                            <option key={cls} value={cls}>Turma {cls}</option>
                                        ))}
                                    </select>
                                )}
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                                    Novo Número de Chamada (Nº)
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    value={transferNewNumber}
                                    onChange={e => setTransferNewNumber(Number(e.target.value))}
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-gray-50 font-bold text-gray-900"
                                />
                                <p className="text-[11px] text-gray-400 mt-1">
                                    Preenchido automaticamente com o próximo número disponível na turma de destino.
                                </p>
                            </div>
                        </div>
                        <div className="bg-amber-50 rounded-xl p-3 border border-amber-200/60">
                            <p className="text-[11px] text-amber-700 leading-relaxed font-semibold">
                                * As chamadas realizadas anteriormente não serão afetadas. O estudante constará na nova turma a partir das próximas chamadas.
                            </p>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setTransferCandidate(null)}
                                className="flex-1 bg-gray-100 text-gray-700 font-bold py-3.5 px-4 rounded-xl hover:bg-gray-200 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleTransferStudent}
                                disabled={isTransferSaving}
                                className="flex-1 bg-blue-600 text-white font-bold py-3.5 px-4 rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/30 disabled:opacity-50 flex justify-center items-center gap-2"
                            >
                                {isTransferSaving ? (
                                    <>
                                        <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
                                        <span>Salvando...</span>
                                    </>
                                ) : (
                                    "Confirmar"
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
