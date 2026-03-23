"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebaseConfig";

type RoleDoc = {
    email: string;
    role: "admin" | "teacher";
    name?: string;
};

export default function UsersPage() {
    const [users, setUsers] = useState<RoleDoc[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [formEmail, setFormEmail] = useState("");
    const [formRole, setFormRole] = useState<"admin" | "teacher">("teacher");
    const [feedback, setFeedback] = useState<{ type: "success" | "error", msg: string } | null>(null);
    const [isSaving, setIsSaving] = useState(false);

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

    const handleAddUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setFeedback(null);
        if (!formEmail.endsWith("@prof.educacao.sp.gov.br")) {
            setFeedback({ type: "error", msg: "O e-mail deve terminar com @prof.educacao.sp.gov.br" });
            return;
        }

        setIsSaving(true);
        try {
            const docRef = doc(db, "roles", formEmail.trim().toLowerCase());
            await setDoc(docRef, {
                email: formEmail.trim().toLowerCase(),
                role: formRole
            });
            setFeedback({ type: "success", msg: "Usuário cadastrado/atualizado com sucesso!" });
            setFormEmail("");
            fetchUsers();
        } catch (error) {
            console.error(error);
            setFeedback({ type: "error", msg: "Falha ao salvar usuário." });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-8 animate-fade-in">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Conceder Acesso</h2>
                <p className="text-gray-500 text-sm mb-6">Cadastre os e-mails institucionais dos professores e demais coordenadores para liberar as permissões adequadas no aplicativo.</p>

                <form onSubmit={handleAddUser} className="space-y-4">
                    {feedback && (
                        <div className={`p-4 rounded-xl text-sm font-medium \${feedback.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                            {feedback.msg}
                        </div>
                    )}

                    <div className="flex flex-col sm:flex-row gap-4">
                        <div className="flex-1">
                            <label className="block text-sm font-medium text-gray-700 mb-1">E-mail Institucional</label>
                            <input
                                type="email"
                                required
                                value={formEmail}
                                onChange={e => setFormEmail(e.target.value)}
                                placeholder="nome@prof.educacao.sp.gov.br"
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:outline-none transition-all"
                            />
                        </div>
                        <div className="sm:w-48">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Nível de Acesso</label>
                            <select
                                value={formRole}
                                onChange={e => setFormRole(e.target.value as "admin" | "teacher")}
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:outline-none transition-all"
                            >
                                <option value="teacher">Professor</option>
                                <option value="admin">Administrador</option>
                            </select>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isSaving}
                        className="w-full sm:w-auto px-6 py-3 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center mt-2"
                    >
                        {isSaving ? "Salvando..." : "Salvar Permissão"}
                    </button>
                </form>
            </div>

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
                            <li key={u.email} className="p-4 sm:px-6 flex items-center justify-between hover:bg-gray-50 transition-colors">
                                <div className="truncate pr-4">
                                    <p className="font-semibold text-gray-900 truncate">{u.name || "Usuário"}</p>
                                    <p className="text-sm text-gray-500 truncate">{u.email}</p>
                                </div>
                                <span className={`shrink-0 px-3 py-1 rounded-full text-xs font-bold \${
                                    u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                                }`}>
                                    {u.role === 'admin' ? 'Admin' : 'Prof'}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
