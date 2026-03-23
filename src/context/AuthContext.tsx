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

    return (
        <AuthContext.Provider value={{ user, role, loading, error, signIn, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
