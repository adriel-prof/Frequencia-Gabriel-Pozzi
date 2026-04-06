"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, doc, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebaseConfig";

type RoleDoc = {
    email: string;
    role: "admin" | "teacher";
    name?: string;
};

export default function UsersPage() {
    const [users, setUsers] = useState<RoleDoc[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [deleteCandidate, setDeleteCandidate] = useState<RoleDoc | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            const snapshot = await getDocs(collection(db, "roles"));
            const data = snapshot.docs.map(d => ({ email: d.id, ...d.data() } as RoleDoc));
            setUsers(data);
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };



    const handleRoleChange = async (email: string, newRole: "admin" | "teacher") => {
        try {
            const docRef = doc(db, "roles", email);
            await setDoc(docRef, { role: newRole }, { merge: true });
            setUsers(prev => prev.map(u => u.email === email ? { ...u, role: newRole } : u));
        } catch (error) {
            console.error("Erro ao alterar permissão:", error);
            alert("Erro ao alterar permissão.");
        }
    };

    const confirmDeleteUser = async () => {
        if (!deleteCandidate) return;
        setIsDeleting(true);
        try {
            await deleteDoc(doc(db, "roles", deleteCandidate.email));
            setUsers(prev => prev.filter(u => u.email !== deleteCandidate.email));
            setDeleteCandidate(null);
        } catch (error) {
            console.error("Erro ao excluir usuário:", error);
            alert("Erro ao excluir usuário.");
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="space-y-8 animate-fade-in">


            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
                    <h2 className="text-lg font-bold text-gray-900">Usuários Cadastrados</h2>
                </div>

                {isLoading ? (
                    <div className="p-8 text-center text-gray-500">Carregando lista...</div>
                ) : users.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">Apenas você possui acesso por enquanto.</div>
                ) : (
                    <ul className="divide-y divide-gray-100">
                        {users.map(u => (
                            <li key={u.email} className="p-4 sm:px-6 flex items-center justify-between gap-3 hover:bg-gray-50 transition-colors">
                                <div className="truncate flex-1 min-w-0 pr-2">
                                    <p className="font-semibold text-gray-900 truncate">{u.name || "Usuário"}</p>
                                    <p className="text-sm text-gray-500 truncate">{u.email}</p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <select
                                        value={u.role}
                                        onChange={e => handleRoleChange(u.email, e.target.value as "admin" | "teacher")}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border-0 outline-none cursor-pointer transition-colors ${u.role === 'admin'
                                                ? 'bg-purple-100 text-purple-700'
                                                : 'bg-blue-100 text-blue-700'
                                            }`}
                                    >
                                        <option value="teacher">Prof</option>
                                        <option value="admin">Admin</option>
                                    </select>
                                    <button
                                        onClick={() => setDeleteCandidate(u)}
                                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                        title="Excluir usuário"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {/* Modal de Exclusão */}
            {deleteCandidate && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center space-y-6">
                        <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto border-4 border-red-50 shadow-inner">
                            <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="text-2xl font-extrabold text-gray-900 tracking-tight">Excluir Usuário?</h3>
                            <p className="text-gray-500 mt-2 text-sm leading-relaxed">
                                Tem certeza que deseja remover <b>{deleteCandidate.name || deleteCandidate.email}</b> do sistema?
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
                                onClick={confirmDeleteUser}
                                disabled={isDeleting}
                                className="flex-1 bg-red-500 text-white font-bold py-3.5 px-4 rounded-xl hover:bg-red-600 transition-colors shadow-lg shadow-red-500/30 flex justify-center items-center"
                            >
                                {isDeleting ? "Excluindo..." : "Excluir"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
