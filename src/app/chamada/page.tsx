"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebaseConfig";
import { AttendanceList } from "@/components/AttendanceList";
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
                const fetchedStudents = snapshot.docs.map(doc => ({
                    firestoreId: doc.id,
                    ...doc.data()
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
            </header>

            <main className="p-4 pt-6 max-w-3xl mx-auto">
                {students.length === 0 ? (
                    <div className="text-center py-10">
                        <p className="text-gray-500">Nenhum aluno encontrado no banco de dados.</p>
                    </div>
                ) : (
                    <AttendanceList students={students} />
                )}
            </main>
        </div>
    );
}
