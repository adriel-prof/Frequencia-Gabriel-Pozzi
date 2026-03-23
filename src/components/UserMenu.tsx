import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";

export function UserMenu() {
    const { user, role, logout } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // Fechar ao clicar fora
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    if (!user) return null;

    // Pega as iniciais (ex: Adriel Silva -> AS, ou senão tira do email)
    let initials = "U";
    if (user.displayName) {
        const names = user.displayName.split(" ");
        if (names.length >= 2) {
            initials = (names[0][0] + names[names.length - 1][0]).toUpperCase();
        } else {
            initials = names[0].substring(0, 2).toUpperCase();
        }
    } else if (user.email) {
        initials = user.email.substring(0, 2).toUpperCase();
    }

    return (
        <div className="relative" ref={menuRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-green-100 border border-green-200 text-green-800 font-bold hover:ring-2 hover:ring-green-400 transition-all focus:outline-none"
                title={user.displayName || user.email || "Usuário"}
            >
                {initials}
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.12)] border border-gray-100 overflow-hidden z-[100] animate-in fade-in slide-in-from-top-2 origin-top-right">
                    <div className="px-4 py-3 border-b border-gray-50 flex flex-col">
                        <span className="text-sm font-bold text-gray-900 truncate">{user.displayName || "Usuário"}</span>
                        <span className="text-xs text-gray-500 truncate">{user.email}</span>
                    </div>

                    <div className="py-1 border-b border-gray-50">
                        {role === "admin" && (
                            <Link href="/dashboard" onClick={() => setIsOpen(false)} className="w-full text-left px-4 py-2 text-sm text-gray-700 font-bold hover:bg-gray-50 transition-colors flex items-center gap-2">
                                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                                </svg>
                                Painel Admin
                            </Link>
                        )}
                        <Link href="/chamada" onClick={() => setIsOpen(false)} className="w-full text-left px-4 py-2 text-sm text-gray-700 font-bold hover:bg-gray-50 transition-colors flex items-center gap-2">
                            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                            </svg>
                            Fazer Chamada
                        </Link>
                    </div>

                    <button
                        onClick={logout}
                        className="w-full text-left px-4 py-3 text-sm text-red-600 font-bold hover:bg-red-50 transition-colors flex items-center gap-2"
                    >
                        <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        Sair da Conta
                    </button>
                </div>
            )}
        </div>
    );
}
