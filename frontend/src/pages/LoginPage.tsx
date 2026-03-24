
import React, { useState } from "react";
import { useAuth } from "../context/useAuth";
import { useNavigate, useLocation } from "react-router-dom";
import { Lock, User, AlertCircle, Loader2 } from "lucide-react";
import { loginSchema, userSetupSchema } from "../lib/schemas";

export const LoginPage: React.FC = () => {
    const { login, setupAdmin } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [isSetup, setIsSetup] = useState(false);

    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname || "/admin";

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        const schema = isSetup ? userSetupSchema : loginSchema;
        const result = schema.safeParse(
            isSetup
                ? { username, password, confirmPassword: password }
                : { username, password }
        );
        if (!result.success) {
            setError(result.error.issues[0]?.message ?? "Datos inválidos");
            return;
        }

        setLoading(true);
        try {
            if (isSetup) {
                await setupAdmin(username, password);
            } else {
                await login(username, password);
            }
            navigate(from, { replace: true });
        } catch (err) {
            setError((err as Error).message || "Error al iniciar sesión");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex bg-[var(--bg-app)]">
            {/* Left panel - Branding */}
            <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden items-center justify-center bg-gradient-to-br from-surface-950 via-surface-900 to-surface-950">
                {/* Decorative elements */}
                <div className="absolute inset-0">
                    <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl animate-pulse" />
                    <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-cyan-500/8 rounded-full blur-3xl" />
                    <div className="absolute top-0 left-0 right-0 bottom-0 bg-[linear-gradient(rgba(148,163,184,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.03)_1px,transparent_1px)] bg-[size:64px_64px]" />
                </div>

                <div className="relative z-10 text-center px-12">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 shadow-2xl shadow-blue-500/30 mb-8">
                        <svg className="w-10 h-10 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                    </div>
                    <h1 className="text-4xl font-black text-white tracking-tight mb-3">
                        <span className="text-blue-400">Assetto</span> Manager
                    </h1>
                    <p className="text-lg text-slate-400 max-w-md mx-auto leading-relaxed">
                        Sistema de gestión integral para centros de simulación racing
                    </p>

                    {/* Feature chips */}
                    <div className="mt-10 flex flex-wrap justify-center gap-3">
                        {['Simuladores', 'Reservas', 'Torneos', 'Telemetría'].map((feat) => (
                            <span
                                key={feat}
                                className="px-4 py-1.5 text-xs font-medium text-blue-300/80 bg-blue-500/8 border border-blue-500/15 rounded-full"
                            >
                                {feat}
                            </span>
                        ))}
                    </div>
                </div>
            </div>

            {/* Right panel - Form */}
            <div className="flex-1 flex items-center justify-center px-4 sm:px-8">
                <div className="w-full max-w-md">
                    {/* Mobile logo */}
                    <div className="lg:hidden text-center mb-8">
                        <h1 className="text-3xl font-black text-[var(--text-primary)]">
                            <span className="text-[var(--accent-primary)]">Assetto</span> Manager
                        </h1>
                    </div>

                    {/* Card */}
                    <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl p-8 shadow-xl">
                        <div className="mb-7">
                            <h2 className="text-xl font-bold text-[var(--text-primary)]">
                                {isSetup ? 'Crear cuenta admin' : 'Iniciar sesión'}
                            </h2>
                            <p className="text-sm text-[var(--text-secondary)] mt-1">
                                {isSetup ? 'Configura tu cuenta de administrador' : 'Introduce tus credenciales para continuar'}
                            </p>
                        </div>

                        {/* Error */}
                        {error && (
                            <div className="flex items-center gap-2.5 p-3.5 mb-5 rounded-xl bg-[var(--accent-danger-muted)] border border-red-500/20">
                                <AlertCircle size={16} className="text-red-500 flex-shrink-0" />
                                <span className="text-sm text-red-500 font-medium">{error}</span>
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-5">
                            {/* Username */}
                            <div>
                                <label htmlFor="login-username" className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wider">
                                    Usuario
                                </label>
                                <div className="relative">
                                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[var(--text-tertiary)]">
                                        <User size={16} />
                                    </span>
                                    <input
                                        type="text"
                                        id="login-username"
                                        required
                                        data-testid="login-username"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        className="ac-input pl-10"
                                        placeholder="admin"
                                        autoComplete="username"
                                    />
                                </div>
                            </div>

                            {/* Password */}
                            <div>
                                <label htmlFor="login-password" className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wider">
                                    Contraseña
                                </label>
                                <div className="relative">
                                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[var(--text-tertiary)]">
                                        <Lock size={16} />
                                    </span>
                                    <input
                                        type="password"
                                        id="login-password"
                                        required
                                        data-testid="login-password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="ac-input pl-10"
                                        placeholder="••••••••"
                                        autoComplete="current-password"
                                    />
                                </div>
                            </div>

                            {/* Submit */}
                            <button
                                type="submit"
                                data-testid="login-submit"
                                disabled={loading}
                                className="ac-btn ac-btn-primary w-full py-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 size={16} className="animate-spin" />
                                        Procesando...
                                    </>
                                ) : (
                                    isSetup ? 'Crear cuenta' : 'Iniciar sesión'
                                )}
                            </button>
                        </form>

                        {/* Toggle setup */}
                        <div className="mt-6 text-center">
                            <button
                                onClick={() => { setIsSetup(!isSetup); setError(""); }}
                                className="text-xs text-[var(--text-tertiary)] hover:text-[var(--accent-primary)] transition-colors"
                            >
                                {isSetup ? '¿Ya tienes una cuenta? Inicia sesión' : '¿Primera vez? Crear admin'}
                            </button>
                        </div>
                    </div>

                    {/* Footer */}
                    <p className="text-center text-[10px] text-[var(--text-tertiary)] mt-6">
                        Assetto Manager © {new Date().getFullYear()}
                    </p>
                </div>
            </div>
        </div>
    );
};
