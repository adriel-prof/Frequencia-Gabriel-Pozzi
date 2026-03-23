"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { auth, googleProvider, db } from "@/lib/firebaseConfig";
import { doc, getDoc, setDoc } from "firebase/firestore";

interface AuthContextType {
    user: User | null;
    role: "admin" | "teacher" | null;
    loading: boolean;
    error: string | null;
    signIn: () => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    role: null,
    loading: true,
    error: null,
    signIn: async () => { },
    logout: async () => { },
});

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [role, setRole] = useState<"admin" | "teacher" | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Se o Firebase não inicializou porque faltam credenciais na Vercel
        if (!auth || Object.keys(auth).length === 0) {
            setLoading(false);
            setError("MISSING_ENV_VARS");
            return;
        }

        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            setLoading(true);
            if (currentUser && currentUser.email) {
                if (currentUser.email.endsWith("@prof.educacao.sp.gov.br")) {
                    try {
                        const roleDocRef = doc(db, "roles", currentUser.email);
                        const roleDoc = await getDoc(roleDocRef);

                        let userRole: "admin" | "teacher" = "teacher";
                        const isEnvAdmin = process.env.NEXT_PUBLIC_ADMIN_EMAIL === currentUser.email;

                        if (roleDoc.exists()) {
                            userRole = roleDoc.data().role as "admin" | "teacher";
                        } else {
                            userRole = isEnvAdmin ? "admin" : "teacher";
                            await setDoc(roleDocRef, {
                                role: userRole,
                                email: currentUser.email,
                                name: currentUser.displayName
                            });
                        }

                        // Fallback em caso de falha de dados mas estar na var de ambiente
                        if (isEnvAdmin) userRole = "admin";

                        setRole(userRole);
                        setUser(currentUser);
                        setError(null);
                    } catch (err) {
                        console.error("Erro ao buscar role:", err);
                        setError("Erro ao carregar permissões do usuário.");
                        await signOut(auth);
                        setUser(null);
                        setRole(null);
                    }
                } else {
                    await signOut(auth);
                    setUser(null);
                    setRole(null);
                    setError("Acesso negado. Utilize um e-mail institucional @prof.educacao.sp.gov.br");
                }
            } else {
                setUser(null);
                setRole(null);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const signIn = async () => {
        setError(null);
        try {
            await signInWithPopup(auth, googleProvider);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Erro ao realizar login");
        }
    };

    const logout = async () => {
        try {
            await signOut(auth);
            setUser(null);
            setRole(null);
        } catch (err) {
            console.error(err);
        }
    };

    if (error === "MISSING_ENV_VARS") {
        return (
            <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50 text-center">
                <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full border border-red-100">
                    <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Faltam as Variáveis de Ambiente!</h2>
                    <p className="text-gray-600 mb-6 text-sm">
                        Este site está rodando, mas não consegue se conectar ao banco de dados porque as chaves de segurança (API Keys) estão faltando.
                    </p>
                    <div className="bg-red-50 text-red-700 text-xs p-3 rounded-lg text-left font-mono break-all mb-6">
                        Vá no painel da Vercel &gt; Settings &gt; Environment Variables. Certifique-se de adicionar todos os itens do arquivo .env.local e marque a caixa &quot;Production&quot;, depois faça um novo Deploy.
                    </div>
                </div>
            </div>
        );
    }

    return (
        <AuthContext.Provider value={{ user, role, loading, error, signIn, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
