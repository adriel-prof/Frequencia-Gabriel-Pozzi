"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth, isAllowedDomain } from "@/context/AuthContext";
import Image from "next/image";

type AuthMode = "google" | "login" | "signup" | "reset";

export default function LoginPage() {
    const router = useRouter();
    const { user, loading, error: authError, signIn, signInWithEmail, signUpWithEmail, resetPassword } = useAuth();

    const [mode, setMode] = useState<AuthMode>("google");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [localError, setLocalError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Form inputs
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    useEffect(() => {
        if (user && !loading) {
            router.replace("/chamada");
        }
    }, [user, loading, router]);

    useEffect(() => {
        if (authError) {
            setIsSubmitting(false);
        }
    }, [authError]);

    const handleGoogleSignIn = async () => {
        setIsSubmitting(true);
        setLocalError(null);
        setSuccessMessage(null);
        try {
            await signIn();
        } catch {
            setIsSubmitting(false);
        }
    };

    const handleEmailSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setLocalError(null);
        setSuccessMessage(null);

        const emailTrimmed = email.trim().toLowerCase();
        if (!emailTrimmed) {
            setLocalError("Por favor, informe seu e-mail institucional.");
            return;
        }

        if (!isAllowedDomain(emailTrimmed)) {
            setLocalError("Utilize um e-mail institucional válido (@prof, @servidor ou @educacao.sp.gov.br)");
            return;
        }

        setIsSubmitting(true);

        try {
            if (mode === "login") {
                if (!password) {
                    setLocalError("Por favor, digite sua senha.");
                    setIsSubmitting(false);
                    return;
                }
                await signInWithEmail(emailTrimmed, password);
            } else if (mode === "signup") {
                if (!password || password.length < 6) {
                    setLocalError("A senha deve conter no mínimo 6 caracteres.");
                    setIsSubmitting(false);
                    return;
                }
                if (password !== confirmPassword) {
                    setLocalError("As senhas informadas não coincidem.");
                    setIsSubmitting(false);
                    return;
                }
                await signUpWithEmail(emailTrimmed, password);
                setSuccessMessage("Conta criada com sucesso! Você já está autenticado.");
            } else if (mode === "reset") {
                await resetPassword(emailTrimmed);
                setSuccessMessage("Enviamos um e-mail com instruções para redefinir sua senha. Verifique sua caixa de entrada/spam.");
                setIsSubmitting(false);
            }
        } catch (err: unknown) {
            setIsSubmitting(false);
            if (err instanceof Error) {
                setLocalError(err.message);
            }
        }
    };

    const activeError = localError || authError;

    if (loading && !isSubmitting) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-gray-50 flex-col gap-4">
                <div className="w-10 h-10 border-4 border-green-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-gray-500 text-sm font-medium">Carregando diário escolar...</p>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100 p-4">
            <div className="max-w-md w-full bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100 transition-all">
                {/* Header */}
                <div className="p-8 text-center pb-4">
                    <div className="w-20 h-20 rounded-2xl mx-auto mb-4 bg-white shadow-md border border-gray-100 relative flex items-center justify-center">
                        <Image src="/logo.png" alt="Logotipo da Escola" fill sizes="(max-width: 80px) 100vw, 80px" className="object-contain p-2" priority />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 tracking-tight">
                        Chamada Escolar
                    </h2>
                    <p className="text-gray-500 text-xs mt-1">
                        E.E. Gabriel Pozzi • Acesso para Docentes e Servidores
                    </p>
                </div>

                {/* Tabs / Mode Selector */}
                <div className="px-8 flex border-b border-gray-100 gap-2">
                    <button
                        type="button"
                        onClick={() => {
                            setMode("google");
                            setLocalError(null);
                            setSuccessMessage(null);
                        }}
                        className={`flex-1 py-3 text-xs font-semibold rounded-t-xl transition-colors border-b-2 ${
                            mode === "google"
                                ? "border-green-600 text-green-700 bg-green-50/50"
                                : "border-transparent text-gray-400 hover:text-gray-600"
                        }`}
                    >
                        🟢 Google
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setMode("login");
                            setLocalError(null);
                            setSuccessMessage(null);
                        }}
                        className={`flex-1 py-3 text-xs font-semibold rounded-t-xl transition-colors border-b-2 ${
                            mode !== "google"
                                ? "border-blue-600 text-blue-700 bg-blue-50/50"
                                : "border-transparent text-gray-400 hover:text-gray-600"
                        }`}
                    >
                        📧 E-mail & Senha
                    </button>
                </div>

                {/* Form Body */}
                <div className="p-8 space-y-5">
                    {activeError && (
                        <div className="bg-red-50 border border-red-200 text-red-700 p-3.5 rounded-xl text-xs flex items-start gap-2.5 animate-fadeIn">
                            <span className="text-base shrink-0">⚠️</span>
                            <div>{activeError}</div>
                        </div>
                    )}

                    {successMessage && (
                        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3.5 rounded-xl text-xs flex items-start gap-2.5 animate-fadeIn">
                            <span className="text-base shrink-0">✅</span>
                            <div>{successMessage}</div>
                        </div>
                    )}

                    {/* Google Mode */}
                    {mode === "google" && (
                        <div className="space-y-4">
                            <p className="text-xs text-gray-500 text-center leading-relaxed">
                                Recomendado para e-mails <strong className="text-gray-700">@prof.educacao.sp.gov.br</strong> e <strong className="text-gray-700">@servidor.educacao.sp.gov.br</strong>.
                            </p>
                            <button
                                type="button"
                                onClick={handleGoogleSignIn}
                                disabled={isSubmitting}
                                className="w-full flex items-center justify-center gap-3 bg-white border border-gray-300 rounded-xl px-4 py-3.5 text-gray-700 font-semibold hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-all shadow-sm active:scale-[0.99] disabled:opacity-50"
                            >
                                {isSubmitting ? (
                                    <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                                ) : (
                                    <>
                                        <svg className="w-5 h-5" viewBox="0 0 24 24">
                                            <path
                                                fill="currentColor"
                                                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                            />
                                            <path
                                                fill="#34A853"
                                                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                            />
                                            <path
                                                fill="#FBBC05"
                                                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                                            />
                                            <path
                                                fill="#EA4335"
                                                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                            />
                                        </svg>
                                        <span>Entrar com Google</span>
                                    </>
                                )}
                            </button>
                        </div>
                    )}

                    {/* Email & Password Form */}
                    {mode !== "google" && (
                        <form onSubmit={handleEmailSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">
                                    E-mail Institucional
                                </label>
                                <input
                                    type="email"
                                    required
                                    placeholder="seu.nome@educacao.sp.gov.br"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-gray-800"
                                />
                            </div>

                            {mode !== "reset" && (
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                                        Senha
                                    </label>
                                    <input
                                        type="password"
                                        required
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-gray-800"
                                    />
                                </div>
                            )}

                            {mode === "signup" && (
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                                        Confirmar Senha
                                    </label>
                                    <input
                                        type="password"
                                        required
                                        placeholder="••••••••"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-gray-800"
                                    />
                                </div>
                            )}

                            {/* Submit button */}
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-4 py-3 text-sm transition-all shadow-md active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {isSubmitting ? (
                                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                ) : mode === "login" ? (
                                    "Entrar"
                                ) : mode === "signup" ? (
                                    "Criar Minha Senha"
                                ) : (
                                    "Enviar Link de Recuperação"
                                )}
                            </button>

                            {/* Options & Navigation links */}
                            <div className="flex flex-col gap-2 pt-2 text-center text-xs">
                                {mode === "login" && (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setMode("signup");
                                                setLocalError(null);
                                                setSuccessMessage(null);
                                            }}
                                            className="text-blue-600 font-semibold hover:underline"
                                        >
                                            Primeiro Acesso? Clique aqui para criar sua senha
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setMode("reset");
                                                setLocalError(null);
                                                setSuccessMessage(null);
                                            }}
                                            className="text-gray-500 hover:text-gray-700 hover:underline"
                                        >
                                            Esqueceu sua senha?
                                        </button>
                                    </>
                                )}

                                {(mode === "signup" || mode === "reset") && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setMode("login");
                                            setLocalError(null);
                                            setSuccessMessage(null);
                                        }}
                                        className="text-blue-600 font-semibold hover:underline"
                                    >
                                        ← Voltar para o Login
                                    </button>
                                )}
                            </div>
                        </form>
                    )}
                </div>

                {/* Footer */}
                <div className="bg-gray-50 border-t border-gray-100 p-4 text-center">
                    <p className="text-[11px] text-gray-400">
                        Suporta e-mails <strong className="text-gray-500">@prof</strong>, <strong className="text-gray-500">@servidor</strong> e <strong className="text-gray-500">@educacao.sp.gov.br</strong>
                    </p>
                </div>
            </div>
        </div>
    );
}

