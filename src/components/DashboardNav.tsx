import Link from "next/link";
import { usePathname } from "next/navigation";

export function DashboardNav() {
    const pathname = usePathname();

    const tabs = [
        { name: "Relatórios", href: "/dashboard" },
        { name: "Professores & Adms", href: "/dashboard/users" },
        { name: "Importar Turmas", href: "/dashboard/import" }
    ];

    return (
        <div className="bg-white border-b border-gray-200 shadow-sm">
            <div className="max-w-5xl mx-auto px-4 flex gap-6 overflow-x-auto hide-scrollbar">
                {tabs.map(tab => (
                    <Link
                        key={tab.href}
                        href={tab.href}
                        className={`whitespace-nowrap py-3 border-b-2 font-semibold text-sm transition-colors ${pathname === tab.href
                                ? "border-green-600 text-green-700"
                                : "border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300"
                            }`}
                    >
                        {tab.name}
                    </Link>
                ))}
            </div>
        </div>
    );
}
