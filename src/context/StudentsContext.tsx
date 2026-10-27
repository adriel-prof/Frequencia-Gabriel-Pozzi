"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebaseConfig";

export type Student = {
    firestoreId: string;
    id: number;
    name: string;
    class: string;
    dispensed?: boolean;
    status?: string;
};

interface StudentsContextType {
    students: Student[];
    loading: boolean;
    error: string | null;
    refreshStudents: () => Promise<void>;
    getStudentsByClass: (className: string) => Student[];
}

const StudentsContext = createContext<StudentsContextType | undefined>(undefined);

const CACHE_KEY = "cached_students_list_v1";

export function StudentsProvider({ children }: { children: React.ReactNode }) {
    const [students, setStudents] = useState<Student[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadFromCache = (): Student[] | null => {
        if (typeof window === "undefined") return null;
        try {
            const cachedData = localStorage.getItem(CACHE_KEY);
            if (cachedData) {
                const parsed = JSON.parse(cachedData);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    return parsed;
                }
            }
        } catch (e) {
            console.warn("Failed to parse cached students:", e);
        }
        return null;
    };

    const fetchFromFirestore = async (): Promise<Student[]> => {
        if (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) {
            const { mockDb } = await import("@/lib/mockDatabase");
            return mockDb.getStudents();
        }

        const snap = await getDocs(collection(db, "students"));
        const list = snap.docs.map(d => ({
            firestoreId: d.id,
            name: (d.data().name as string) || "",
            class: (d.data().class as string) || "",
            id: Number(d.data().id || 0),
            status: d.data().status as string,
            dispensed: d.data().dispensed
        })) as Student[];

        list.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
        return list;
    };

    const fetchStudents = useCallback(async (forceRemote = false) => {
        setLoading(true);
        setError(null);

        // 1. Tentar carregar do cache se não estiver forçando busca remota
        if (!forceRemote) {
            const cached = loadFromCache();
            if (cached) {
                setStudents(cached);
                setLoading(false);
                return;
            }
        }

        // 2. Buscar da rede com até 3 retentativas
        let attempts = 0;
        const maxAttempts = 3;
        let lastError: unknown = null;

        while (attempts < maxAttempts) {
            try {
                attempts++;
                const list = await fetchFromFirestore();
                setStudents(list);
                if (typeof window !== "undefined") {
                    localStorage.setItem(CACHE_KEY, JSON.stringify(list));
                }
                setLoading(false);
                return;
            } catch (err) {
                lastError = err;
                console.warn(`Tentativa ${attempts}/${maxAttempts} de buscar alunos falhou:`, err);
                if (attempts < maxAttempts) {
                    await new Promise(res => setTimeout(res, 1000 * attempts));
                }
            }
        }

        // 3. Em caso de falha após retentativas, usar cache como fallback emergencial se disponível
        console.error("Erro ao carregar lista de alunos após retentativas:", lastError);
        const cachedFallback = loadFromCache();
        if (cachedFallback) {
            setStudents(cachedFallback);
            setError("Instabilidade na conexão. Exibindo dados em cache.");
        } else {
            const msg = lastError instanceof Error ? lastError.message : "Erro ao carregar lista de alunos";
            setError(msg);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchStudents();
    }, [fetchStudents]);

    const getStudentsByClass = useCallback((className: string) => {
        if (!className) return [];
        const normClass = className.trim().toUpperCase().replace(/°/g, 'º');
        return students.filter(s => s.class.trim().toUpperCase().replace(/°/g, 'º') === normClass);
    }, [students]);

    const refreshStudents = useCallback(async () => {
        await fetchStudents(true);
    }, [fetchStudents]);

    return (
        <StudentsContext.Provider value={{ students, loading, error, refreshStudents, getStudentsByClass }}>
            {children}
        </StudentsContext.Provider>
    );
}

export function useStudents() {
    const context = useContext(StudentsContext);
    if (!context) {
        throw new Error("useStudents must be used within a StudentsProvider");
    }
    return context;
}
