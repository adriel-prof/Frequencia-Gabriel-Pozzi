"use client";

import { DashboardNav } from "@/components/DashboardNav";
import { UserMenu } from "@/components/UserMenu";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const { user, role, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!loading) {
            if (!user) {
                router.push("/login");
            } else if (role !== "admin") {
                router.push("/chamada");
            }
        }
    }, [user, role, loading, router]);

    if (loading || role !== "admin") {
        return (
            <div className="flex h-screen items-center justify-center">
                <div className="w-10 h-10 border-4 border-green-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col pb-20">
            <header className="bg-white sticky top-0 z-20">
                <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between border-b border-gray-100">
                    <div className="flex items-center gap-3">
                        <div className="relative w-9 h-9 rounded-full bg-white border border-gray-100 overflow-hidden flex-shrink-0">
                            <Image src="/logo.png" alt="Logo" fill sizes="36px" className="object-contain p-1" />
                        </div>
                        <h1 className="font-extrabold text-xl tracking-tight text-gray-900">Configurações Gestão</h1>
                    </div>
                    <div className="flex items-center gap-3">
                        <Link href="/chamada" className="text-sm font-bold text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 px-3 py-1.5 rounded-full transition-colors hidden sm:block">
                            ➔ Fazer Chamada
                        </Link>
                        <UserMenu />
                    </div>
                </div>
                <DashboardNav />
            </header>
            <main className="flex-1 p-4 pt-6 max-w-5xl mx-auto w-full">
                {children}
            </main>
        </div>
    );
}
