import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { StudentsProvider } from "@/context/StudentsContext";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Chamada Escolar - E.E. Gabriel Pozzi",
  description: "Sistema de controle de presença online",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={`${inter.className} bg-gray-50 text-gray-900 antialiased`}>
        <AuthProvider>
          <StudentsProvider>
            {children}
          </StudentsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
