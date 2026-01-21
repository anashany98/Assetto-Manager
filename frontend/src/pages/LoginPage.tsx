
import React, { useState } from "react";
import { useAuth } from "../context/useAuth";
import { useNavigate, useLocation } from "react-router-dom";
import { Lock, User } from "lucide-react";

export const LoginPage: React.FC = () => {
    const { login, setupAdmin } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [isSetup, setIsSetup] = useState(false); // Toggle for initial setup

    // Rudimentary check if we might need setup? 
    // Ideally, backend tells us. For now, hidden toggle or separate route?
    // Let's just have a "First Time Setup" link.

    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname || "/";

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            if (isSetup) {
                await setupAdmin(username, password);
            } else {
                await login(username, password);
            }
            navigate(from, { replace: true });
        } catch (err) {
            setError((err as Error).message || "Failed to login");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-900 text-gray-100">
            <div className="bg-gray-800 p-8 rounded-lg shadow-xl w-full max-w-md border border-gray-700">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-blue-500 mb-2">Assetto Manager</h1>
                    <p className="text-gray-400">{isSetup ? "Create Admin Account" : "Sign In"}</p>
                </div>

                {error && (
                    <div className="bg-red-500/20 border border-red-500 text-red-100 p-3 rounded mb-4 text-sm">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Username</label>
                        <div className="relative">
                            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500">
                                <User size={18} />
                            </span>
                            <input
                                type="text"
                                required
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full bg-gray-700 border border-gray-600 rounded pl-10 pr-3 py-2 focus:outline-none focus:border-blue-500 transition-colors text-white"
                                placeholder="admin"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Password</label>
                        <div className="relative">
                            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500">
                                <Lock size={18} />
                            </span>
                            <input
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-gray-700 border border-gray-600 rounded pl-10 pr-3 py-2 focus:outline-none focus:border-blue-500 transition-colors text-white"
                                placeholder="••••••••"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors`}
                    >
                        {loading ? "Processing..." : (isSetup ? "Create Account" : "Sign In")}
                    </button>
                </form>

                <div className="mt-6 text-center">
                    <button
                        onClick={() => { setIsSetup(!isSetup); setError(""); }}
                        className="text-xs text-gray-500 hover:text-gray-300 underline"
                    >
                        {isSetup ? "Already have an account? Sign In" : "First time? Setup Admin"}
                    </button>
                </div>
            </div>
        </div>
    );
};
