"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebaseConfig";

type Student = {
    firestoreId: string;
    id: number;
    name: string;
    class: string;
    status?: string;
};

export default function StudentsTransferPage() {
    const [students, setStudents] = useState<Student[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedClassFilter, setSelectedClassFilter] = useState("");
    
    // Modal states
    const [transferCandidate, setTransferCandidate] = useState<Student | null>(null);
    const [targetClass, setTargetClass] = useState("");
    const [isNewClass, setIsNewClass] = useState(false);
    const [customClassName, setCustomClassName] = useState("");
    const [newNumber, setNewNumber] = useState<number>(1);
    const [isSaving, setIsSaving] = useState(false);
    const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

    useEffect(() => {
        fetchStudents();
    }, []);

    const fetchStudents = async () => {
        setIsLoading(true);
        try {
            if (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) {
                const { mockDb } = await import("@/lib/mockDatabase");
                const list = mockDb.getStudents();
                setStudents(list);
                setIsLoading(false);
                return;
            }

            const snapshot = await getDocs(collection(db, "students"));
            const list = snapshot.docs.map(docSnap => ({
                firestoreId: docSnap.id,
                name: docSnap.data().name as string,
                class: docSnap.data().class as string,
                id: Number(docSnap.data().id),
                status: docSnap.data().status as string
            })) as Student[];
            
            setStudents(list);
        } catch (error) {
            console.error("Erro ao buscar alunos:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleToggleTR = async (student: Student) => {
        const newTR = student.status !== "TR";
        if (!confirm(`Deseja realmente ${newTR ? 'marcar' : 'remover'} o status TR (Intenção de Transferência) para o aluno ${student.name}?`)) {
            return;
        }

        try {
            if (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) {
                const { mockDb } = await import("@/lib/mockDatabase");
                const allStudents = mockDb.getStudents();
                const foundIdx = allStudents.findIndex(s => s.firestoreId === student.firestoreId);
                if (foundIdx >= 0) {
                    allStudents[foundIdx].status = newTR ? "TR" : "";
                    localStorage.setItem("mock_students", JSON.stringify(allStudents));
                }
                
                setStudents(prev => prev.map(s => 
                    s.firestoreId === student.firestoreId 
                        ? { ...s, status: newTR ? "TR" : "" } 
                        : s
                ));
                return;
            }

            const studentRef = doc(db, "students", student.firestoreId);
            await setDoc(studentRef, {
                status: newTR ? "TR" : ""
            }, { merge: true });

            setStudents(prev => prev.map(s => 
                s.firestoreId === student.firestoreId 
                    ? { ...s, status: newTR ? "TR" : "" } 
                    : s
            ));
        } catch (error) {
            console.error("Erro ao alterar status TR:", error);
            alert("Erro ao alterar status TR.");
        }
    };

    // Obter todas as turmas únicas para filtros e seleção
    const uniqueClasses = Array.from(
        new Set(students.map(s => s.class.trim().toUpperCase().replace(/°/g, 'º')))
    ).sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" }));

    // Filtrar estudantes
    const filteredStudents = students.filter(student => {
        const matchesSearch = student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            student.id.toString() === searchQuery;
        
        const normClass = student.class.trim().toUpperCase().replace(/°/g, 'º');
        const matchesClass = selectedClassFilter === "" || normClass === selectedClassFilter;

        return matchesSearch && matchesClass;
    });

    // Quando o candidato de transferência mudar ou a turma de destino mudar, recalcular número sugerido
    useEffect(() => {
        if (!transferCandidate) return;
        
        const finalTargetClass = isNewClass ? customClassName.trim().toUpperCase() : targetClass;
        if (!finalTargetClass) {
            setNewNumber(transferCandidate.id);
            return;
        }

        // Encontrar os alunos da turma de destino e pegar o maior número + 1
        const targetStudents = students.filter(
            s => s.class.trim().toUpperCase().replace(/°/g, 'º') === finalTargetClass.replace(/°/g, 'º')
        );
        
        if (targetStudents.length > 0) {
            const maxId = Math.max(...targetStudents.map(s => s.id));
            setNewNumber(maxId + 1);
        } else {
            // Se for nova turma ou vazia, sugere número 1 ou mantém o atual
            setNewNumber(1);
        }
    }, [targetClass, isNewClass, customClassName, transferCandidate, students]);

    const handleOpenTransferModal = (student: Student) => {
        setTransferCandidate(student);
        setFeedback(null);
        setIsNewClass(false);
        setCustomClassName("");
        // Achar a primeira turma existente diferente da atual como padrão no select
        const defaultTarget = uniqueClasses.find(c => c !== student.class.trim().toUpperCase().replace(/°/g, 'º')) || "";
        setTargetClass(defaultTarget);
    };

    const handleConfirmTransfer = async () => {
        if (!transferCandidate) return;
        
        const finalTargetClass = (isNewClass ? customClassName.trim() : targetClass).toUpperCase().replace(/°/g, 'º');
        
        if (!finalTargetClass) {
            setFeedback({ type: "error", msg: "Por favor, especifique a turma de destino." });
            return;
        }

        if (finalTargetClass === transferCandidate.class.trim().toUpperCase().replace(/°/g, 'º')) {
            setFeedback({ type: "error", msg: "A turma de destino é a mesma da turma de origem." });
            return;
        }

        setIsSaving(true);
        setFeedback(null);

        try {
            if (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) {
                const { mockDb } = await import("@/lib/mockDatabase");
                mockDb.saveStudent({
                    firestoreId: transferCandidate.firestoreId,
                    id: Number(newNumber),
                    name: transferCandidate.name,
                    class: finalTargetClass
                });
                
                setStudents(prev => prev.map(s => 
                    s.firestoreId === transferCandidate.firestoreId 
                        ? { ...s, class: finalTargetClass, id: Number(newNumber) } 
                        : s
                ));

                setFeedback({ type: "success", msg: `Aluno transferido com sucesso para a turma ${finalTargetClass}!` });
                setTimeout(() => setTransferCandidate(null), 1500);
                return;
            }

            // Salvar no Firestore
            const studentRef = doc(db, "students", transferCandidate.firestoreId);
            await setDoc(studentRef, {
                class: finalTargetClass,
                id: Number(newNumber)
            }, { merge: true });

            setStudents(prev => prev.map(s => 
                s.firestoreId === transferCandidate.firestoreId 
                    ? { ...s, class: finalTargetClass, id: Number(newNumber) } 
                    : s
            ));

            setFeedback({ type: "success", msg: `Aluno transferido com sucesso para a turma ${finalTargetClass}!` });
            setTimeout(() => setTransferCandidate(null), 1500);
        } catch (error) {
            console.error("Erro ao transferir aluno:", error);
            setFeedback({ type: "error", msg: "Falha ao salvar a transferência. Tente novamente." });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header explicativo */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <h2 className="text-xl font-bold text-gray-900">Transferência de Estudantes (Remanejamento)</h2>
                <p className="text-gray-500 text-sm mt-2 leading-relaxed">
                    Mova estudantes de uma turma para outra sem corromper relatórios ou chamadas passadas.
                    Apenas a turma atual e o número de chamada do aluno serão alterados para futuras chamadas.
                </p>
            </div>

            {/* Filtros e Busca */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="relative w-full md:max-w-xs">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-gray-400">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </span>
                    <input
                        type="text"
                        placeholder="Buscar aluno por nome ou número..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 pr-4 py-2 border border-gray-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-green-500 focus:outline-none w-full text-gray-900 bg-gray-50/50"
                    />
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto justify-end">
                    <span className="text-sm font-bold text-gray-500 whitespace-nowrap">Filtrar por Turma:</span>
                    <select
                        value={selectedClassFilter}
                        onChange={(e) => setSelectedClassFilter(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-green-500 focus:outline-none text-gray-900 bg-white"
                    >
                        <option value="">Todas</option>
                        {uniqueClasses.map(cls => (
                            <option key={cls} value={cls}>Turma {cls}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Tabela de Estudantes */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="font-bold text-gray-900">Lista de Alunos</h3>
                    <span className="text-sm font-bold text-gray-500">{filteredStudents.length} Alunos</span>
                </div>

                {isLoading ? (
                    <div className="p-8 text-center text-gray-500 flex flex-col items-center gap-2">
                        <div className="w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full animate-spin"></div>
                        <span>Carregando dados dos alunos...</span>
                    </div>
                ) : filteredStudents.length === 0 ? (
                    <div className="p-12 text-center text-gray-500">
                        <p className="font-medium">Nenhum aluno encontrado correspondente aos filtros.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="text-gray-500 border-b border-gray-100">
                                <tr>
                                    <th className="px-6 py-3 font-medium">Turma Atual</th>
                                    <th className="px-6 py-3 font-medium w-20">Nº</th>
                                    <th className="px-6 py-3 font-medium">Nome Completo</th>
                                    <th className="px-6 py-3 font-medium text-right">Ação</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {filteredStudents.sort((a, b) => {
                                    // Ordena primeiro por classe e depois por nome (ordem alfabética)
                                    const classCompare = a.class.localeCompare(b.class, "pt-BR", { numeric: true });
                                    if (classCompare !== 0) return classCompare;
                                    return a.name.localeCompare(b.name, "pt-BR");
                                }).map(student => (
                                    <tr key={student.firestoreId} className={`hover:bg-gray-50/50 transition-colors ${student.status === "TR" ? 'bg-gray-50/30 opacity-70' : ''}`}>
                                        <td className="px-6 py-4">
                                            <span className="px-2.5 py-1 bg-green-50 text-green-700 border border-green-200 rounded-md font-bold text-xs">
                                                {student.class}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 font-semibold text-gray-500">{student.id}</td>
                                        <td className="px-6 py-4 font-bold text-gray-900 uppercase">
                                            {student.name}
                                            {student.status === "TR" && (
                                                <span className="ml-2 bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-[10px] font-bold">TR</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                                            <button
                                                onClick={() => handleOpenTransferModal(student)}
                                                className="bg-blue-50 text-blue-600 font-bold px-3.5 py-1.5 rounded-lg border border-blue-100 hover:bg-blue-100 transition-colors text-xs inline-flex items-center gap-1.5 shadow-sm"
                                            >
                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                                                </svg>
                                                Transferir
                                            </button>
                                            <button
                                                onClick={() => handleToggleTR(student)}
                                                className={`font-bold px-3.5 py-1.5 rounded-lg border transition-colors text-xs inline-flex items-center gap-1.5 shadow-sm ${
                                                    student.status === "TR" 
                                                        ? "bg-purple-100 text-purple-700 border-purple-200 hover:bg-purple-200" 
                                                        : "bg-purple-50 text-purple-600 border-purple-100 hover:bg-purple-100"
                                                }`}
                                            >
                                                {student.status === "TR" ? "Remover TR" : "Marcar TR"}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal de Transferência */}
            {transferCandidate && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/55 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl space-y-6 border border-gray-100">
                        <div>
                            <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mx-auto border-4 border-blue-50 mb-4 shadow-inner">
                                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                                </svg>
                            </div>
                            <h3 className="text-2xl font-extrabold text-gray-900 tracking-tight text-center">Transferir Estudante</h3>
                            <p className="text-gray-500 mt-2 text-sm text-center">
                                Selecione o destino do aluno <strong className="text-gray-900 uppercase font-black">{transferCandidate.name}</strong>.
                            </p>
                        </div>

                        {feedback && (
                            <div className={`p-4 rounded-xl border text-sm font-medium ${feedback.type === "success" ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                                {feedback.msg}
                            </div>
                        )}

                        <div className="space-y-4">
                            {/* Classe de Origem */}
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Turma Atual</label>
                                <input
                                    type="text"
                                    disabled
                                    value={transferCandidate.class}
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-100 text-gray-500 font-bold outline-none"
                                />
                            </div>

                            {/* Classe de Destino */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Turma de Destino</label>
                                    <button 
                                        type="button"
                                        onClick={() => {
                                            setIsNewClass(!isNewClass);
                                            setTargetClass("");
                                            setCustomClassName("");
                                        }}
                                        className="text-xs text-blue-600 hover:text-blue-800 font-bold"
                                    >
                                        {isNewClass ? "Escolher existente" : "Nova turma..."}
                                    </button>
                                </div>
                                
                                {isNewClass ? (
                                    <input
                                        type="text"
                                        value={customClassName}
                                        onChange={e => setCustomClassName(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-gray-50 uppercase font-bold"
                                        placeholder="Ex: 2ºB"
                                        autoFocus
                                    />
                                ) : (
                                    <select
                                        value={targetClass}
                                        onChange={e => setTargetClass(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white font-bold"
                                    >
                                        <option value="">Selecione...</option>
                                        {uniqueClasses.map(cls => (
                                            <option key={cls} value={cls}>Turma {cls}</option>
                                        ))}
                                    </select>
                                )}
                            </div>

                            {/* Novo Número de Chamada */}
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                                    Novo Número de Chamada (Nº)
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    value={newNumber}
                                    onChange={e => setNewNumber(Number(e.target.value))}
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-gray-50 font-bold text-gray-900"
                                    placeholder="Ex: 38"
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
                                disabled={isSaving}
                                className="flex-1 bg-gray-100 text-gray-700 font-bold py-3.5 px-4 rounded-xl hover:bg-gray-200 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleConfirmTransfer}
                                disabled={isSaving}
                                className="flex-1 bg-blue-600 text-white font-bold py-3.5 px-4 rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/30 flex justify-center items-center gap-2"
                            >
                                {isSaving ? (
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
