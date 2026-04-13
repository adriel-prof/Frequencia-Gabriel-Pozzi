"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, orderBy, where, doc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebaseConfig";
import { AttendanceList } from "@/components/AttendanceList";
import { TeacherHistory } from "@/components/TeacherHistory";
import { UserMenu } from "@/components/UserMenu";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";

type Student = {
    firestoreId: string;
    id: number;
    name: string;
    class: string;
};

export default function ChamadaPage() {
    const { user, role, loading } = useAuth();
    const router = useRouter();
    const [students, setStudents] = useState<Student[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedClass, setSelectedClass] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<"chamada" | "historico">("chamada");

    useEffect(() => {
        if (!loading && !user) {
            router.push("/login");
        }
    }, [user, loading, router]);

    useEffect(() => {
        async function fetchStudents() {
            if (!user) return;
            try {
                const q = query(collection(db, "students"), orderBy("id", "asc"));
                const snapshot = await getDocs(q);
                const fetchedStudents = snapshot.docs.map(docSnap => ({
                    firestoreId: docSnap.id,
                    ...docSnap.data()
                })) as Student[];

                setStudents(fetchedStudents);
            } catch (err) {
                console.error("Erro ao buscar alunos:", err);
            } finally {
                setIsLoading(false);
            }
        }
        fetchStudents();
    }, [user]);

    const handleEditClassName = async (oldClassName: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const newClassName = prompt(`Digite o novo nome para a turma "${oldClassName}":`, oldClassName);
        if (!newClassName || newClassName.trim() === oldClassName || newClassName.trim() === "") return;

        try {
            const batch = writeBatch(db);
            const q = query(collection(db, "students"), where("class", "==", oldClassName));
            const snapshot = await getDocs(q);

            snapshot.docs.forEach(docSnap => {
                batch.update(doc(db, "students", docSnap.id), { class: newClassName.trim() });
            });

            await batch.commit();

            setStudents(prev => prev.map(s => s.class === oldClassName ? { ...s, class: newClassName.trim() } : s));
            alert("Nome da turma atualizado com sucesso!");
        } catch (err) {
            console.error(err);
            alert("Erro ao atualizar o nome da turma.");
        }
    };

    if (loading || isLoading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <div className="w-10 h-10 border-4 border-green-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
                <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="relative w-9 h-9 rounded-full bg-white border border-gray-100 overflow-hidden flex-shrink-0 shadow-sm">
                            <Image src="/logo.png" alt="Logo" fill sizes="36px" className="object-contain p-1" />
                        </div>
                        <h1 className="font-bold text-lg text-gray-900">Diário Escolar</h1>
                    </div>
                    <div className="flex items-center gap-2">
                        {role === "admin" && (
                            <Link href="/dashboard" className="text-sm font-bold text-green-700 bg-green-100 hover:bg-green-200 px-3 py-1.5 rounded-full transition-colors">
                                Painel Admin
                            </Link>
                        )}
                        <UserMenu />
                    </div>
                </div>
                {!selectedClass && (
                    <div className="max-w-3xl mx-auto px-4 pb-3 flex gap-2">
                        <button 
                            onClick={() => setViewMode("chamada")}
                            className={`px-4 py-1.5 rounded-lg font-bold text-sm transition-colors ${viewMode === "chamada" ? "bg-green-100 text-green-700" : "bg-white text-gray-500 border border-gray-100 hover:bg-gray-50"}`}
                        >
                            Nova Chamada
                        </button>
                        <button 
                            onClick={() => setViewMode("historico")}
                            className={`px-4 py-1.5 rounded-lg font-bold text-sm transition-colors ${viewMode === "historico" ? "bg-green-100 text-green-700" : "bg-white text-gray-500 border border-gray-100 hover:bg-gray-50"}`}
                        >
                            Histórico
                        </button>
                    </div>
                )}
            </header>

            <main className="p-4 pt-6 max-w-3xl mx-auto">
                {viewMode === "historico" ? (
                    <TeacherHistory />
                ) : students.length === 0 ? (
                    <div className="text-center py-10 bg-white rounded-2xl border border-gray-100 shadow-sm">
                        <p className="text-gray-500 font-medium p-8">Nenhum aluno encontrado no banco de dados.</p>
                    </div>
                ) : !selectedClass ? (
                    <div className="space-y-6 animate-fade-in">
                        <div className="text-center mb-8">
                            <h2 className="text-2xl font-extrabold text-gray-900">Selecione uma Turma</h2>
                            <p className="text-gray-500 mt-2">Escolha a turma que deseja realizar a chamada agora.</p>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                            {Array.from(new Set(students.map(s => s.class.trim().toUpperCase().replace(/°/g, 'º')))).sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: 'base' })).map(cls => (
                                <div key={cls} className="relative group/card">
                                    <button
                                        onClick={() => setSelectedClass(cls)}
                                        className="w-full bg-white hover:bg-green-50 hover:border-green-300 border-2 border-gray-100 rounded-2xl py-8 px-4 flex flex-col items-center justify-center shadow-sm transition-all group"
                                    >
                                        <span className="text-3xl font-black text-gray-800 group-hover:text-green-700 transition-colors">
                                            {cls}
                                        </span>
                                        <span className="text-xs text-gray-400 mt-2 font-medium">
                                            {students.filter(s => s.class.trim().toUpperCase().replace(/°/g, 'º') === cls).length} alunos
                                        </span>
                                    </button>

                                    {role === "admin" && (
                                        <button
                                            onClick={(e) => handleEditClassName(cls, e)}
                                            className="absolute top-2 right-2 bg-white border border-gray-200 text-gray-400 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50 p-2 rounded-xl shadow-sm transition-all opacity-0 group-hover/card:opacity-100 focus:opacity-100"
                                            title="Editar nome da turma"
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                            </svg>
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="animate-fade-in">
                        <div className="mb-6 flex items-center justify-between">
                            <button
                                onClick={() => setSelectedClass(null)}
                                className="flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-gray-800 bg-white border border-gray-200 px-4 py-2 rounded-xl shadow-sm transition-all"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                                </svg>
                                Voltar às Turmas
                            </button>
                            <h2 className="text-xl font-black text-gray-900 bg-green-100 px-4 py-1.5 rounded-lg text-green-800 border-2 border-green-200">
                                Turma {selectedClass}
                            </h2>
                        </div>
                        <AttendanceList
                            students={students.filter(s => s.class.trim().toUpperCase().replace(/°/g, 'º') === selectedClass)}
                            onSuccess={() => setSelectedClass(null)}
                        />
                    </div>
                )}
            </main>
        </div>
    );
}
