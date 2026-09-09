"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
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

    const fetchStudents = useCallback(async (forceRemote = false) => {
        setLoading(true);
        setError(null);
        try {
            // Check local storage cache if available and not forcing remote
            if (!forceRemote && typeof window !== "undefined") {
                const cachedData = localStorage.getItem(CACHE_KEY);
                if (cachedData) {
                    try {
                        const parsed = JSON.parse(cachedData);
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            setStudents(parsed);
                            setLoading(false);
                            // Background fetch to update cache silently
                            fetchFromFirestoreSilently();
                            return;
                        }
                    } catch (e) {
                        console.warn("Failed to parse cached students, re-fetching:", e);
                    }
                }
            }

            await fetchFromFirestore();
        } catch (err: unknown) {
            console.error("Error fetching students in context:", err);
            const msg = err instanceof Error ? err.message : "Erro ao carregar lista de alunos";
            setError(msg);
            setLoading(false);
        }
    }, []);

    const fetchFromFirestore = async () => {
        if (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) {
            const { mockDb } = await import("@/lib/mockDatabase");
            const list = mockDb.getStudents();
            setStudents(list);
            localStorage.setItem(CACHE_KEY, JSON.stringify(list));
            setLoading(false);
            return;
        }

        const q = query(collection(db, "students"), orderBy("name", "asc"));
        const snap = await getDocs(q);
        const list = snap.docs.map(d => ({
            firestoreId: d.id,
            name: d.data().name as string,
            class: d.data().class as string,
            id: Number(d.data().id),
            status: d.data().status as string,
            dispensed: d.data().dispensed
        })) as Student[];

        setStudents(list);
        if (typeof window !== "undefined") {
            localStorage.setItem(CACHE_KEY, JSON.stringify(list));
        }
        setLoading(false);
    };

    const fetchFromFirestoreSilently = async () => {
        try {
            if (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) {
                return;
            }
            const q = query(collection(db, "students"), orderBy("name", "asc"));
            const snap = await getDocs(q);
            const list = snap.docs.map(d => ({
                firestoreId: d.id,
                name: d.data().name as string,
                class: d.data().class as string,
                id: Number(d.data().id),
                status: d.data().status as string,
                dispensed: d.data().dispensed
            })) as Student[];

            setStudents(list);
            localStorage.setItem(CACHE_KEY, JSON.stringify(list));
        } catch (e) {
            console.warn("Silent background fetch of students failed:", e);
        }
    };

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
