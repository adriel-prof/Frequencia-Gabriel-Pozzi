"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, writeBatch, doc, getDoc, serverTimestamp, addDoc, query, where, getDocs, increment } from "firebase/firestore";
import { db } from "@/lib/firebaseConfig";
import { useAuth } from "@/context/AuthContext";
import { useStudents } from "@/context/StudentsContext";
import { isWeekend, getNextSchoolDays } from "@/lib/calendarUtils";

type Student = {
    firestoreId: string;
    id: number;
    name: string;
    class: string;
    dispensed?: boolean;
    status?: string;
};

type AttendanceStatus = "P" | "F" | "D" | "A" | "TR";

type DispensationInfo = {
    startDate: string;
    endDate: string;
    dates: string[];
    days: number;
};

const LOCK_DATE = "2026-04-06";
const MAX_DISPENSA_DAYS = 60;
const DISPENSA_QUICK_OPTIONS = [1, 2, 3, 5, 7, 10, 15];

const formatDateBR = (date: string) => date.split("-").reverse().join("/");

const isLocalhost = () =>
    typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");


export function AttendanceList({ students, onSuccess }: { students: Student[], onSuccess?: () => void }) {
    const { user, role } = useAuth();
    const { students: globalStudents, refreshStudents } = useStudents();
    const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({});
    const [dispensedStudents, setDispensedStudents] = useState<Set<string>>(new Set());
    // Dispensas médicas de múltiplos dias ativas hoje (por firestoreId do aluno)
    const [dispensationInfo, setDispensationInfo] = useState<Record<string, DispensationInfo>>({});
    const [dispensaCandidate, setDispensaCandidate] = useState<Student | null>(null);
    const [dispensaDays, setDispensaDays] = useState<number>(1);
    const [isSavingDispensa, setIsSavingDispensa] = useState(false);
    const [isAllowed, setIsAllowed] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [blockedDates, setBlockedDates] = useState<Record<string, string>>({});
    const [blockReason, setBlockReason] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [isUpdateMode, setIsUpdateMode] = useState(false);
    const [existingTodayStatus, setExistingTodayStatus] = useState<Record<string, AttendanceStatus>>({});

    // States for Modals
    const [deleteCandidate, setDeleteCandidate] = useState<{ id: string, name: string } | null>(null);
    const [isDeletingStudent, setIsDeletingStudent] = useState(false);
    const [showAddStudentModal, setShowAddStudentModal] = useState(false);
    const [newStudentName, setNewStudentName] = useState("");
    const [isAddingStudent, setIsAddingStudent] = useState(false);

    // States for Transfer Modal
    const [transferCandidate, setTransferCandidate] = useState<Student | null>(null);
    const [transferTargetClass, setTransferTargetClass] = useState("");
    const [isTransferNewClass, setIsTransferNewClass] = useState(false);
    const [transferCustomClass, setTransferCustomClass] = useState("");
    const [transferNewNumber, setTransferNewNumber] = useState<number>(1);
    const [isTransferSaving, setIsTransferSaving] = useState(false);

    const [timeSettings, setTimeSettings] = useState({ start: "08:40", end: "23:59" });

    // Reutilizar lista global de estudantes do context sem chamadas redundantes ao banco
    const allStudentsList = useMemo(() => role === "admin" ? globalStudents : [], [role, globalStudents]);

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
            if (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) {
                const { mockDb } = await import("@/lib/mockDatabase");
                mockDb.saveStudent({
                    firestoreId: transferCandidate.firestoreId,
                    id: Number(transferNewNumber),
                    name: transferCandidate.name,
                    class: finalTargetClass
                });
                
                await refreshStudents();
                alert(`Estudante transferido com sucesso para a turma ${finalTargetClass}!`);
                return;
            }

            const today = new Date().toISOString().split("T")[0];
            const dateKey = today.replace(/-/g, "");
            const batch = writeBatch(db);

            const studentRef = doc(db, "students", transferCandidate.firestoreId);
            batch.set(studentRef, {
                class: finalTargetClass,
                id: Number(transferNewNumber)
            }, { merge: true });

            const statsRef = doc(db, "student_stats", transferCandidate.firestoreId);
            const oldStatus = existingTodayStatus[transferCandidate.firestoreId];
            const attRef = doc(db, "attendance", `att_${transferCandidate.firestoreId}_${dateKey}`);

            if (oldStatus) {
                if (oldStatus === "F") {
                    // Remove falta registrada hoje na turma de origem antes da transferência
                    batch.delete(attRef);
                    batch.set(statsRef, {
                        studentClass: finalTargetClass,
                        studentId: Number(transferNewNumber),
                        totalDays: increment(-1),
                        absences: increment(-1),
                        updatedAt: serverTimestamp()
                    }, { merge: true });
                } else {
                    batch.set(attRef, {
                        studentClass: finalTargetClass,
                        studentId: Number(transferNewNumber)
                    }, { merge: true });
                    batch.set(statsRef, {
                        studentClass: finalTargetClass,
                        studentId: Number(transferNewNumber),
                        updatedAt: serverTimestamp()
                    }, { merge: true });
                }
            } else {
                batch.set(statsRef, {
                    studentClass: finalTargetClass,
                    studentId: Number(transferNewNumber),
                    updatedAt: serverTimestamp()
                }, { merge: true });
            }

            await batch.commit();
            await refreshStudents();
            alert(`Estudante transferido com sucesso para a turma ${finalTargetClass}!`);
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
                if (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) {
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

    // Busca as datas bloqueadas do Firebase ou mockDb
    useEffect(() => {
        async function fetchBlockedDates() {
            try {
                if (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) {
                    const { mockDb } = await import("@/lib/mockDatabase");
                    const list = mockDb.getBlockedDates();
                    const map: Record<string, string> = {};
                    list.forEach(item => {
                        map[item.date] = item.reason;
                    });
                    setBlockedDates(map);
                    return;
                }
                const snap = await getDocs(collection(db, "blocked_dates"));
                const map: Record<string, string> = {};
                snap.docs.forEach(docSnap => {
                    map[docSnap.id] = docSnap.data().reason;
                });
                setBlockedDates(map);
            } catch (err) {
                console.error("Erro ao carregar datas bloqueadas:", err);
            }
        }
        fetchBlockedDates();
    }, []);

    const normalizeClassName = (name: string) => name ? name.trim().toUpperCase().replace(/°/g, 'º') : "";

    // Busca as dispensas médicas que cobrem a data de hoje
    const fetchActiveDispensations = async (today: string): Promise<Record<string, DispensationInfo>> => {
        const map: Record<string, DispensationInfo> = {};
        try {
            if (isLocalhost()) {
                const { mockDb } = await import("@/lib/mockDatabase");
                mockDb.getMedicalDispensations().forEach(d => {
                    if (d.dates.includes(today)) {
                        map[d.studentFirestoreId] = { startDate: d.startDate, endDate: d.endDate, dates: d.dates, days: d.days };
                    }
                });
                return map;
            }
            const snap = await getDocs(query(collection(db, "medical_dispensations"), where("endDate", ">=", today)));
            snap.docs.forEach(d => {
                const data = d.data();
                const dates: string[] = Array.isArray(data.dates) ? data.dates : [];
                if (dates.includes(today)) {
                    map[data.studentFirestoreId || d.id] = {
                        startDate: data.startDate,
                        endDate: data.endDate,
                        dates,
                        days: data.days || dates.length
                    };
                }
            });
        } catch (err) {
            console.error("Erro ao carregar dispensas médicas:", err);
        }
        return map;
    };

    // Define padrão das presenças e valida regras de horário
    useEffect(() => {
        async function fetchCurrentStatus() {
            if (students.length === 0) {
                return;
            }
            try {
                const today = new Date().toISOString().split("T")[0];
                const activeDispensations = await fetchActiveDispensations(today);
                setDispensationInfo(activeDispensations);

                if (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) {
                    const { mockDb } = await import("@/lib/mockDatabase");
                    const localRecords = mockDb.getAttendance(today);
                    
                    const initialAttendance: Record<string, AttendanceStatus> = {};
                    const initialDispensed = new Set<string>();
                    
                    const existingMap: Record<string, AttendanceStatus> = {};
                    localRecords.forEach(r => {
                        if (normalizeClassName(r.studentClass) === normalizeClassName(students[0].class)) {
                            existingMap[r.studentFirestoreId] = r.status;
                        }
                    });
                    
                    students.forEach((s) => {
                        const hasExistingRecord = s.firestoreId in existingMap;
                        const hasActiveDispensation = s.firestoreId in activeDispensations;
                        if (s.status === "TR") {
                            initialAttendance[s.firestoreId] = "TR";
                        } else if (hasActiveDispensation) {
                            // Dispensa médica ativa tem prioridade mesmo que já houvesse chamada hoje
                            initialAttendance[s.firestoreId] = "D";
                            initialDispensed.add(s.firestoreId);
                        } else if (hasExistingRecord) {
                            initialAttendance[s.firestoreId] = existingMap[s.firestoreId];
                            if (existingMap[s.firestoreId] === "D") {
                                initialDispensed.add(s.firestoreId);
                            }
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
                    const hasActiveDispensation = s.firestoreId in activeDispensations;
                    if (s.status === "TR") {
                        initialAttendance[s.firestoreId] = "TR";
                    } else if (hasActiveDispensation) {
                        // Dispensa médica ativa tem prioridade mesmo que já houvesse chamada hoje
                        initialAttendance[s.firestoreId] = "D";
                        initialDispensed.add(s.firestoreId);
                    } else if (hasExistingRecord) {
                        initialAttendance[s.firestoreId] = existingMap[s.firestoreId];
                        if (existingMap[s.firestoreId] === "D") {
                            initialDispensed.add(s.firestoreId);
                        }
                    } else {
                        initialAttendance[s.firestoreId] = "P";
                    }
                });

                setAttendance(initialAttendance);
                setExistingTodayStatus(existingMap);
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

            const isDayWeekend = isWeekend(today);
            const customReason = blockedDates[today];
            const isDayBlocked = !!customReason;

            if (isDayWeekend) {
                setBlockReason("Fim de Semana");
                setIsAllowed(false);
            } else if (isDayBlocked) {
                setBlockReason(customReason);
                setIsAllowed(false);
            } else {
                setBlockReason(null);
                setIsAllowed(isTimeAllowed && isDateAllowed);
            }
        };

        checkTimeAndDate();
        const interval = setInterval(checkTimeAndDate, 60000); // Check every minute
        return () => clearInterval(interval);
    }, [timeSettings, blockedDates]);

    const handleStatusChange = (firestoreId: string, status: AttendanceStatus) => {
        if (!isAllowed) return;
        setAttendance((prev) => ({ ...prev, [firestoreId]: status }));
    };

    const applyDispensaState = (firestoreId: string, dispensed: boolean) => {
        setDispensedStudents(prev => {
            const next = new Set(prev);
            if (dispensed) {
                next.add(firestoreId);
            } else {
                next.delete(firestoreId);
            }
            return next;
        });
        setAttendance(prev => ({
            ...prev,
            [firestoreId]: dispensed ? "D" : "P"
        }));
    };

    // Abre o modal perguntando por quantos dias o aluno ficará dispensado
    const openDispensaModal = (student: Student) => {
        setDispensaDays(1);
        setDispensaCandidate(student);
    };

    // Dias letivos que serão cobertos pela dispensa em edição (ignora fins de semana e datas bloqueadas)
    const dispensaDates = useMemo(() => {
        if (!dispensaCandidate) return [];
        const today = new Date().toISOString().split("T")[0];
        const days = Math.min(Math.max(Math.floor(dispensaDays) || 1, 1), MAX_DISPENSA_DAYS);
        return getNextSchoolDays(today, days, blockedDates);
    }, [dispensaCandidate, dispensaDays, blockedDates]);

    const confirmDispensa = async () => {
        if (!dispensaCandidate || dispensaDates.length === 0) return;
        const student = dispensaCandidate;
        const today = new Date().toISOString().split("T")[0];
        const record = {
            studentFirestoreId: student.firestoreId,
            studentName: student.name,
            studentClass: normalizeClassName(student.class),
            startDate: dispensaDates[0],
            endDate: dispensaDates[dispensaDates.length - 1],
            dates: dispensaDates,
            days: dispensaDates.length,
            createdBy: user?.email || "admin"
        };

        setIsSavingDispensa(true);
        try {
            if (isLocalhost()) {
                const { mockDb } = await import("@/lib/mockDatabase");
                mockDb.saveMedicalDispensation(record);
                if (dispensaDates.includes(today) && student.firestoreId in existingTodayStatus) {
                    mockDb.saveAttendanceBatch([{
                        studentId: student.id,
                        studentName: student.name,
                        studentClass: normalizeClassName(student.class),
                        studentFirestoreId: student.firestoreId,
                        date: today,
                        status: "D",
                        teacher: user?.email || "admin"
                    }]);
                }
            } else {
                const batch = writeBatch(db);
                batch.set(doc(db, "medical_dispensations", student.firestoreId), {
                    ...record,
                    createdAt: serverTimestamp()
                });

                // Se já houve chamada hoje para este aluno, converte imediatamente para "D" no banco
                const dateKey = today.replace(/-/g, "");
                const attRef = doc(db, "attendance", `att_${student.firestoreId}_${dateKey}`);
                let oldStatus: string | undefined = existingTodayStatus[student.firestoreId];
                if (!oldStatus && dispensaDates.includes(today)) {
                    const attSnap = await getDoc(attRef);
                    if (attSnap.exists()) {
                        oldStatus = attSnap.data().status as string;
                    }
                }
                if (dispensaDates.includes(today) && oldStatus && oldStatus !== "D") {
                    batch.set(attRef, {
                        studentId: student.id,
                        studentName: student.name,
                        studentClass: normalizeClassName(student.class),
                        studentFirestoreId: student.firestoreId,
                        date: today,
                        status: "D",
                        timestamp: serverTimestamp()
                    }, { merge: true });

                    const oldTotal = (oldStatus !== "TR") ? 1 : 0;
                    const oldAbsence = (oldStatus === "F") ? 1 : 0;
                    const oldPresence = (oldStatus === "P" || oldStatus === "A") ? 1 : 0;

                    const statsRef = doc(db, "student_stats", student.firestoreId);
                    batch.set(statsRef, {
                        studentFirestoreId: student.firestoreId,
                        studentId: student.id,
                        studentName: student.name,
                        studentClass: normalizeClassName(student.class),
                        totalDays: increment(-oldTotal),
                        absences: increment(-oldAbsence),
                        presences: increment(-oldPresence),
                        dispensed: increment(1),
                        updatedAt: serverTimestamp()
                    }, { merge: true });
                }

                await batch.commit();
            }

            if (dispensaDates.includes(today)) {
                setDispensationInfo(prev => ({
                    ...prev,
                    [student.firestoreId]: { startDate: record.startDate, endDate: record.endDate, dates: record.dates, days: record.days }
                }));
                applyDispensaState(student.firestoreId, true);
                if (student.firestoreId in existingTodayStatus) {
                    setExistingTodayStatus(prev => ({ ...prev, [student.firestoreId]: "D" }));
                }
            } else {
                alert(`Dispensa médica registrada de ${formatDateBR(record.startDate)} até ${formatDateBR(record.endDate)}. Hoje não é dia letivo, então ela passará a valer na próxima chamada.`);
            }
            setDispensaCandidate(null);
        } catch (err) {
            console.error("Erro ao salvar dispensa médica:", err);
            alert("Erro ao salvar a dispensa médica. Tente novamente.");
        } finally {
            setIsSavingDispensa(false);
        }
    };

    const removeDispensa = async (student: Student) => {
        const today = new Date().toISOString().split("T")[0];
        const info = dispensationInfo[student.firestoreId];
        const remaining = info ? info.dates.filter(d => d > today).length : 0;
        if (remaining > 0 && !confirm(`${student.name} está dispensado até ${formatDateBR(info.endDate)}. Remover a dispensa cancelará também os ${remaining} dia(s) restante(s). Deseja continuar?`)) {
            return;
        }
        try {
            if (isLocalhost()) {
                const { mockDb } = await import("@/lib/mockDatabase");
                mockDb.removeMedicalDispensation(student.firestoreId);
            } else if (role === "admin") {
                const batch = writeBatch(db);
                batch.delete(doc(db, "medical_dispensations", student.firestoreId));

                const oldStatus = existingTodayStatus[student.firestoreId];
                if (oldStatus === "D") {
                    const dateKey = today.replace(/-/g, "");
                    batch.set(doc(db, "attendance", `att_${student.firestoreId}_${dateKey}`), {
                        status: "P",
                        timestamp: serverTimestamp()
                    }, { merge: true });
                    batch.set(doc(db, "student_stats", student.firestoreId), {
                        totalDays: increment(1),
                        presences: increment(1),
                        dispensed: increment(-1),
                        updatedAt: serverTimestamp()
                    }, { merge: true });
                }
                await batch.commit();
            }
            setDispensationInfo(prev => {
                const next = { ...prev };
                delete next[student.firestoreId];
                return next;
            });
            applyDispensaState(student.firestoreId, false);
            if (existingTodayStatus[student.firestoreId] === "D") {
                setExistingTodayStatus(prev => ({ ...prev, [student.firestoreId]: "P" }));
            }
        } catch (err) {
            console.error("Erro ao remover dispensa médica:", err);
            alert("Erro ao remover a dispensa médica. Tente novamente.");
        }
    };

    const toggleTR = async (student: Student) => {
        const newTR = student.status !== "TR";
        if (!confirm(`Deseja realmente ${newTR ? 'marcar' : 'remover'} o status TR (Intenção de Transferência) para o aluno ${student.name}?`)) {
            return;
        }
        try {
            const today = new Date().toISOString().split("T")[0];
            const nextAttendanceStatus: AttendanceStatus = newTR ? "TR" : (dispensedStudents.has(student.firestoreId) ? "D" : "P");

            if (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) {
                const { mockDb } = await import("@/lib/mockDatabase");
                const allStudents = mockDb.getStudents();
                const foundIdx = allStudents.findIndex(s => s.firestoreId === student.firestoreId);
                if (foundIdx >= 0) {
                    allStudents[foundIdx].status = newTR ? "TR" : "";
                    localStorage.setItem("mock_students", JSON.stringify(allStudents));
                }
                if (student.firestoreId in existingTodayStatus) {
                    mockDb.saveAttendanceBatch([{
                        studentId: student.id,
                        studentName: student.name,
                        studentClass: normalizeClassName(student.class),
                        studentFirestoreId: student.firestoreId,
                        date: today,
                        status: nextAttendanceStatus,
                        teacher: user?.email || "admin"
                    }]);
                }
                student.status = newTR ? "TR" : "";
                setAttendance(prev => ({ ...prev, [student.firestoreId]: nextAttendanceStatus }));
                await refreshStudents();
                return;
            }

            const batch = writeBatch(db);
            batch.set(doc(db, "students", student.firestoreId), { status: newTR ? "TR" : "" }, { merge: true });

            // Se já existe chamada lançada hoje, atualiza imediatamente o registro de hoje e o student_stats
            const dateKey = today.replace(/-/g, "");
            const attRef = doc(db, "attendance", `att_${student.firestoreId}_${dateKey}`);
            let oldStatus: string | undefined = existingTodayStatus[student.firestoreId];
            if (!oldStatus) {
                const attSnap = await getDoc(attRef);
                if (attSnap.exists()) {
                    oldStatus = attSnap.data().status as string;
                }
            }
            if (oldStatus && oldStatus !== nextAttendanceStatus) {
                batch.set(attRef, {
                    studentId: student.id,
                    studentName: student.name,
                    studentClass: normalizeClassName(student.class),
                    studentFirestoreId: student.firestoreId,
                    date: today,
                    status: nextAttendanceStatus,
                    timestamp: serverTimestamp()
                }, { merge: true });

                const oldTotal = (oldStatus !== "TR" && oldStatus !== "D") ? 1 : 0;
                const newTotal = (nextAttendanceStatus === "P") ? 1 : 0;
                const oldAbsence = (oldStatus === "F") ? 1 : 0;
                const oldPresence = (oldStatus === "P" || oldStatus === "A") ? 1 : 0;
                const newPresence = (nextAttendanceStatus === "P") ? 1 : 0;
                const oldDispensed = (oldStatus === "D") ? 1 : 0;
                const newDispensed = (nextAttendanceStatus === "D") ? 1 : 0;

                batch.set(doc(db, "student_stats", student.firestoreId), {
                    studentFirestoreId: student.firestoreId,
                    studentId: student.id,
                    studentName: student.name,
                    studentClass: normalizeClassName(student.class),
                    totalDays: increment(newTotal - oldTotal),
                    absences: increment(-oldAbsence),
                    presences: increment(newPresence - oldPresence),
                    dispensed: increment(newDispensed - oldDispensed),
                    updatedAt: serverTimestamp()
                }, { merge: true });
            }

            await batch.commit();
            student.status = newTR ? "TR" : "";
            setAttendance(prev => ({ ...prev, [student.firestoreId]: nextAttendanceStatus }));
            if (oldStatus) {
                setExistingTodayStatus(prev => ({ ...prev, [student.firestoreId]: nextAttendanceStatus }));
            }
            await refreshStudents();
        } catch (err) {
            console.error("Erro ao alterar status TR:", err);
            alert("Erro ao alterar intenção de transferência.");
        }
    };

    const confirmDeleteStudent = async () => {
        if (!deleteCandidate) return;
        const deletedId = deleteCandidate.id;
        setIsDeletingStudent(true);
        try {
            const remainingStudents = students
                .filter(s => s.firestoreId !== deletedId)
                .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

            if (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) {
                const { mockDb } = await import("@/lib/mockDatabase");
                mockDb.deleteStudent(deletedId);
                mockDb.removeMedicalDispensation(deletedId);
                for (let i = 0; i < remainingStudents.length; i++) {
                    const s = remainingStudents[i];
                    mockDb.saveStudent({
                        firestoreId: s.firestoreId,
                        id: i + 1,
                        name: s.name,
                        class: s.class,
                        status: s.status
                    });
                }
                await refreshStudents();
                return;
            }

            const today = new Date().toISOString().split("T")[0];
            const dateKey = today.replace(/-/g, "");

            const batch = writeBatch(db);
            // 1. Remove o estudante da coleção principal
            batch.delete(doc(db, "students", deletedId));
            // 2. Remove estatísticas agregadas, dispensas médicas e eventual chamada lançada hoje
            batch.delete(doc(db, "student_stats", deletedId));
            batch.delete(doc(db, "medical_dispensations", deletedId));
            batch.delete(doc(db, "attendance", `att_${deletedId}_${dateKey}`));

            // Também remove quaisquer registros de presença vinculados ao aluno excluído
            try {
                const studentAttSnap = await getDocs(
                    query(collection(db, "attendance"), where("studentFirestoreId", "==", deletedId))
                );
                studentAttSnap.docs.forEach(attDoc => {
                    batch.delete(attDoc.ref);
                });
            } catch (e) {
                console.warn("Aviso ao limpar presenças do aluno excluído:", e);
            }

            // 3. Reordena os números de chamada dos alunos restantes da turma
            for (let i = 0; i < remainingStudents.length; i++) {
                const s = remainingStudents[i];
                const targetId = i + 1;
                if (s.id !== targetId) {
                    batch.update(doc(db, "students", s.firestoreId), { id: targetId });
                }
            }

            await batch.commit();

            // Limpa estados locais do aluno excluído
            setAttendance(prev => {
                const next = { ...prev };
                delete next[deletedId];
                return next;
            });
            setExistingTodayStatus(prev => {
                const next = { ...prev };
                delete next[deletedId];
                return next;
            });
            setDispensedStudents(prev => {
                const next = new Set(prev);
                next.delete(deletedId);
                return next;
            });
            setDispensationInfo(prev => {
                const next = { ...prev };
                delete next[deletedId];
                return next;
            });

            await refreshStudents();
        } catch (err) {
            console.error("Erro ao excluir aluno:", err);
            alert("Falha ao excluir o aluno. Tente novamente.");
        } finally {
            setIsDeletingStudent(false);
            setDeleteCandidate(null);
        }
    };

    const handleAddStudent = async () => {
        if (!newStudentName.trim()) return;
        setIsAddingStudent(true);
        try {
            const studentClass = students[0]?.class || "Nova Turma";
            const newName = newStudentName.trim().toUpperCase();

            // 1. Obter a lista de estudantes atuais da mesma turma com o novo estudante incluído
            const updatedStudentsList = [...students, {
                firestoreId: "temp",
                id: 0,
                name: newName,
                class: studentClass
            }].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

            if (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) {
                const { mockDb } = await import("@/lib/mockDatabase");
                
                // No banco local, atualizamos os IDs de todos os alunos da turma
                for (let i = 0; i < updatedStudentsList.length; i++) {
                    const s = updatedStudentsList[i];
                    const targetId = i + 1;
                    if (s.firestoreId === "temp") {
                        mockDb.saveStudent({
                            id: targetId,
                            name: s.name,
                            class: studentClass
                        });
                    } else {
                        mockDb.saveStudent({
                            firestoreId: s.firestoreId,
                            id: targetId,
                            name: s.name,
                            class: s.class
                        });
                    }
                }
                
                await refreshStudents();
                return;
            }

            // No Firestore, usamos um batch para atualizar todos os IDs
            const batch = writeBatch(db);
            
            for (let i = 0; i < updatedStudentsList.length; i++) {
                const s = updatedStudentsList[i];
                const targetId = i + 1;
                if (s.firestoreId === "temp") {
                    const newDocRef = doc(collection(db, "students"));
                    batch.set(newDocRef, {
                        id: targetId,
                        name: s.name,
                        class: studentClass
                    });
                } else {
                    const docRef = doc(db, "students", s.firestoreId);
                    batch.update(docRef, {
                        id: targetId
                    });
                }
            }

            await batch.commit();
            await refreshStudents();
        } catch (err) {
            console.error(err);
            alert("Erro ao adicionar aluno.");
        } finally {
            setIsAddingStudent(false);
            setShowAddStudentModal(false);
            setNewStudentName("");
        }
    };

    const handleSubmit = async () => {
        if (!isAllowed || blockReason) return;
        setIsSubmitting(true);
        setFeedback(null);

        try {
            const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
            
            if (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) {
                const { mockDb } = await import("@/lib/mockDatabase");
                const batchRecords = students.map(s => {
                    const currentStatus: AttendanceStatus = s.status === "TR"
                        ? "TR"
                        : dispensedStudents.has(s.firestoreId)
                            ? "D"
                            : (attendance[s.firestoreId] || "P");
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
                setIsUpdateMode(true);
                setShowSuccessModal(true);
                setFeedback(null);
                return;
            }

            const batch = writeBatch(db);
            const dateKey = today.replace(/-/g, ""); // YYYYMMDD
            const classNameNorm = normalizeClassName(students[0]?.class);

            let presentCount = 0;
            let absentCount = 0;
            let dispensedCount = 0;
            let transferCount = 0;

            const newExistingMap: Record<string, AttendanceStatus> = { ...existingTodayStatus };

            students.forEach((s) => {
                // Ao criar um ID com base na data + aluno, garantimos a sobrescrita (merge)
                const docId = `att_${s.firestoreId}_${dateKey}`;
                const docRef = doc(db, "attendance", docId);
                const currentStatus: AttendanceStatus = s.status === "TR"
                    ? "TR"
                    : dispensedStudents.has(s.firestoreId)
                        ? "D"
                        : (attendance[s.firestoreId] || "P");
                const oldStatus = existingTodayStatus[s.firestoreId];

                if (currentStatus === "P" || currentStatus === "A") presentCount++;
                else if (currentStatus === "F") absentCount++;
                else if (currentStatus === "D") dispensedCount++;
                else if (currentStatus === "TR") transferCount++;

                batch.set(docRef, {
                    studentId: s.id,
                    studentName: s.name,
                    studentClass: classNameNorm,
                    studentFirestoreId: s.firestoreId,
                    date: today,
                    status: currentStatus,
                    teacher: user?.email || "professor",
                    timestamp: serverTimestamp(),
                }, { merge: true });

                // Calcular deltas para a coleção de agregação student_stats
                // Dias de TR e Dispensa Médica (D) não inflam totalDays avaliados para não distorcer a % de frequência
                const oldTotal = (oldStatus && oldStatus !== "TR" && oldStatus !== "D") ? 1 : 0;
                const newTotal = (currentStatus !== "TR" && currentStatus !== "D") ? 1 : 0;
                const totalDelta = newTotal - oldTotal;

                const oldAbsence = (oldStatus === "F") ? 1 : 0;
                const newAbsence = (currentStatus === "F") ? 1 : 0;
                const absenceDelta = newAbsence - oldAbsence;

                const oldPresence = (oldStatus === "P" || oldStatus === "A") ? 1 : 0;
                const newPresence = (currentStatus === "P" || currentStatus === "A") ? 1 : 0;
                const presenceDelta = newPresence - oldPresence;

                const oldDispensed = (oldStatus === "D") ? 1 : 0;
                const newDispensed = (currentStatus === "D") ? 1 : 0;
                const dispensedDelta = newDispensed - oldDispensed;

                const statsRef = doc(db, "student_stats", s.firestoreId);
                batch.set(statsRef, {
                    studentFirestoreId: s.firestoreId,
                    studentId: s.id,
                    studentName: s.name,
                    studentClass: classNameNorm,
                    totalDays: increment(totalDelta),
                    absences: increment(absenceDelta),
                    presences: increment(presenceDelta),
                    dispensed: increment(dispensedDelta),
                    updatedAt: serverTimestamp()
                }, { merge: true });

                newExistingMap[s.firestoreId] = currentStatus;
            });

            // Registrar Resumo Diário para Otimização de Leituras
            // Dispensa médica (D) é ausência justificada/abonada e não reduz a porcentagem de presença da turma
            const totalEvaluated = presentCount + dispensedCount + absentCount;
            const activeStudents = Math.max(0, students.length - transferCount);
            const presentPercentage = totalEvaluated > 0 ? Math.round(((presentCount + dispensedCount) / totalEvaluated) * 100) : 0;
            const summaryDocId = `${today}_${classNameNorm}`;
            const summaryRef = doc(db, "daily_summaries", summaryDocId);
            batch.set(summaryRef, {
                date: today,
                className: classNameNorm,
                totalStudents: students.length,
                presentCount,
                absentCount,
                dispensedCount,
                transferCount,
                activeStudents,
                presentPercentage,
                teacher: user?.email || "professor",
                updatedAt: serverTimestamp()
            }, { merge: true });

            // Clean snapshot for history log to prevent undefined fields
            const sanitizedSnapshot: Record<string, AttendanceStatus> = {};
            students.forEach(s => {
                sanitizedSnapshot[s.firestoreId] = s.status === "TR"
                    ? "TR"
                    : dispensedStudents.has(s.firestoreId)
                        ? "D"
                        : (attendance[s.firestoreId] || "P");
            });

            // Registrar Log de Auditoria no Histórico Principal
            const historyRef = collection(db, "attendance_history");
            await addDoc(historyRef, {
                action: isUpdateMode ? "UPDATE" : "CREATE",
                date: today,
                studentClass: classNameNorm,
                teacher: user?.email || "professor",
                timestamp: serverTimestamp(),
                snapshot: sanitizedSnapshot 
            });

            await batch.commit();
            setExistingTodayStatus(newExistingMap);
            setIsUpdateMode(true);

            setShowSuccessModal(true);
            setFeedback(null);
        } catch (err: unknown) {
            console.error("Erro ao salvar/atualizar chamada:", err);
            const errorMsg = err instanceof Error ? err.message : "Erro desconhecido";
            setFeedback({ type: "error", msg: `Erro ao enviar/atualizar a chamada: ${errorMsg}` });
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
                if (blockReason) {
                    return (
                        <div className="bg-red-50 text-red-700 p-4 rounded-xl border border-red-200 mb-6 font-medium text-center shadow-sm">
                            🚫 Chamada bloqueada hoje devido a: <strong>{blockReason}</strong>.
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
                    const isTR = student.status === "TR";
                    return (
                        <div key={student.firestoreId} className={`p-4 rounded-2xl shadow-sm border flex items-center justify-between gap-4 transition-all ${isTR ? 'bg-gray-100 border-gray-200 opacity-60' : isDispensed ? 'bg-gray-50 border-gray-200 opacity-70' : 'bg-white border-gray-100'}`}>
                            <div className="flex-1 truncate">
                                <p className={`font-semibold truncate ${isTR || isDispensed ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{student.name}</p>
                                <p className="text-xs text-gray-400 flex items-center gap-2 flex-wrap">
                                    Nº {student.id} &bull; {student.class}
                                    {isTR && (
                                        <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-[10px] font-bold">TR - INTENÇÃO DE TRANSFERÊNCIA</span>
                                    )}
                                    {isDispensed && (
                                        <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded text-[10px] font-bold">
                                            DISPENSA MÉDICA
                                            {dispensationInfo[student.firestoreId] && dispensationInfo[student.firestoreId].dates.length > 1 && (
                                                <> &bull; ATÉ {formatDateBR(dispensationInfo[student.firestoreId].endDate)}</>
                                            )}
                                        </span>
                                    )}
                                    {role === "admin" && (
                                        <>
                                            &bull;
                                            <button
                                                disabled={isTR}
                                                onClick={() => isDispensed ? removeDispensa(student) : openDispensaModal(student)}
                                                className={`font-medium cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${isDispensed ? 'text-amber-600 hover:text-amber-800' : 'text-amber-500 hover:text-amber-700'}`}
                                            >
                                                {isDispensed ? 'Remover Dispensa' : 'Dispensa Médica'}
                                            </button>
                                            &bull;
                                            <button
                                                disabled={isTR}
                                                onClick={() => {
                                                    setTransferCandidate(student);
                                                    setIsTransferNewClass(false);
                                                    setTransferCustomClass("");
                                                    const defaultTarget = uniqueClasses.find(c => c !== student.class.trim().toUpperCase().replace(/°/g, 'º')) || "";
                                                    setTransferTargetClass(defaultTarget);
                                                }}
                                                className="text-blue-500 hover:text-blue-700 font-medium cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                            >
                                                Transferir
                                            </button>
                                            &bull;
                                            <button
                                                onClick={() => toggleTR(student)}
                                                className={`font-medium cursor-pointer ${isTR ? 'text-purple-600 hover:text-purple-800 font-bold' : 'text-purple-500 hover:text-purple-700'}`}
                                            >
                                                {isTR ? 'Remover TR' : 'Marcar TR'}
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
 
                            {isTR ? (
                                <div className="w-14 h-14 bg-gray-200 text-gray-500 rounded-xl flex items-center justify-center font-bold text-lg border border-gray-300">
                                    TR
                                </div>
                            ) : isDispensed ? (
                                <div className="w-14 h-14 bg-blue-500 text-white rounded-xl flex items-center justify-center font-bold text-lg shadow-md shadow-blue-500/30 ring-2 ring-blue-600 ring-offset-2">
                                    D
                                </div>
                            ) : (
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
                                </div>
                            )}
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
                            <h3 className="text-2xl font-extrabold text-gray-900 tracking-tight">
                                {isUpdateMode ? "Chamada Atualizada" : "Chamada Finalizada"}
                            </h3>
                            <p className="text-gray-500 mt-2 text-sm leading-relaxed">
                                {isUpdateMode
                                    ? "Os registros de presença foram atualizados com sucesso no banco de dados!"
                                    : "Os registros foram salvos no banco de dados e o relatório foi enviado com sucesso à coordenação!"}
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
            {/* Modal de Dispensa Médica (quantidade de dias) */}
            {dispensaCandidate && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl space-y-6">
                        <div className="text-center">
                            <div className="w-16 h-16 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mx-auto border-4 border-amber-50 mb-4 shadow-inner">
                                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <h3 className="text-2xl font-extrabold text-gray-900 tracking-tight">Dispensa Médica</h3>
                            <p className="text-gray-500 mt-1 text-sm">
                                Por quantos dias <strong className="text-gray-900 uppercase font-black">{dispensaCandidate.name}</strong> ficará dispensado?
                            </p>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                                    Quantidade de dias letivos (incluindo hoje)
                                </label>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setDispensaDays(d => Math.max(1, (Math.floor(d) || 1) - 1))}
                                        className="w-12 h-12 rounded-xl bg-gray-100 text-gray-700 font-bold text-xl hover:bg-gray-200 transition-colors"
                                        aria-label="Diminuir dias"
                                    >
                                        −
                                    </button>
                                    <input
                                        type="number"
                                        min="1"
                                        max={MAX_DISPENSA_DAYS}
                                        value={Number.isNaN(dispensaDays) ? "" : dispensaDays}
                                        onChange={e => setDispensaDays(e.target.value === "" ? NaN : Math.min(Number(e.target.value), MAX_DISPENSA_DAYS))}
                                        className="flex-1 h-12 px-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all bg-gray-50 font-bold text-gray-900 text-center text-lg"
                                        autoFocus
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setDispensaDays(d => Math.min(MAX_DISPENSA_DAYS, (Math.floor(d) || 0) + 1))}
                                        className="w-12 h-12 rounded-xl bg-gray-100 text-gray-700 font-bold text-xl hover:bg-gray-200 transition-colors"
                                        aria-label="Aumentar dias"
                                    >
                                        +
                                    </button>
                                </div>
                                <div className="flex flex-wrap gap-2 mt-3">
                                    {DISPENSA_QUICK_OPTIONS.map(n => (
                                        <button
                                            key={n}
                                            type="button"
                                            onClick={() => setDispensaDays(n)}
                                            className={`px-3 py-1.5 rounded-lg text-sm font-bold border transition-colors ${dispensaDays === n ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-amber-50'}`}
                                        >
                                            {n} {n === 1 ? 'dia' : 'dias'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {dispensaDates.length > 0 && (
                                <div className="bg-amber-50 rounded-xl p-3 border border-amber-200/60">
                                    <p className="text-sm text-amber-800 font-semibold">
                                        {dispensaDates.length === 1
                                            ? `Dispensado em ${formatDateBR(dispensaDates[0])}.`
                                            : `Dispensado de ${formatDateBR(dispensaDates[0])} até ${formatDateBR(dispensaDates[dispensaDates.length - 1])}.`}
                                    </p>
                                    <p className="text-[11px] text-amber-700 leading-relaxed mt-1">
                                        Fins de semana e datas bloqueadas não contam. Nesses dias o aluno já aparecerá como &quot;D&quot; automaticamente na chamada.
                                    </p>
                                </div>
                            )}
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setDispensaCandidate(null)}
                                className="flex-1 bg-gray-100 text-gray-700 font-bold py-3.5 px-4 rounded-xl hover:bg-gray-200 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={confirmDispensa}
                                disabled={isSavingDispensa || dispensaDates.length === 0 || Number.isNaN(dispensaDays) || dispensaDays < 1}
                                className="flex-1 bg-amber-500 text-white font-bold py-3.5 px-4 rounded-xl hover:bg-amber-600 transition-colors shadow-lg shadow-amber-500/30 disabled:opacity-50 flex justify-center items-center"
                            >
                                {isSavingDispensa ? "Salvando..." : "Confirmar"}
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
                            <p className="text-gray-500 mt-1 text-sm">Insira o nome do novo aluno para a turma {students[0]?.class}. O número da chamada será calculado automaticamente.</p>
                        </div>
                        <div className="space-y-4">
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
                                disabled={isAddingStudent || !newStudentName.trim()}
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
