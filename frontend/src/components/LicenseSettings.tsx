import { useState } from 'react';
import { useLicense } from '../context/LicenseContext';

export function LicenseSettings() {
    const { license, updateLicense, isLoading } = useLicense();
    const [key, setKey] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const handleActivate = async () => {
        if (!key) return;
        setSubmitting(true);
        try {
            await updateLicense(key);
            alert("Licencia activada correctamente");
            setKey("");
        } catch (e) {
            alert("Error al activar licencia. Verifique la clave.");
        } finally {
            setSubmitting(false);
        }
    };

    if (isLoading) return <div>Cargando licencia...</div>;

    return (
        <div className="space-y-6 max-w-4xl">
            <h2 className="text-xl font-bold text-[var(--text-primary)] mb-4">Estado de Licencia</h2>

            <div className={`p-6 rounded-xl border ${license?.is_valid ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <div className="text-sm font-medium text-slate-400">Cliente</div>
                        <div className="text-2xl font-bold text-[var(--text-primary)]">{license?.client || "Sin Licencia"}</div>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-sm font-bold ${license?.is_valid ? 'bg-green-500 text-black' : 'bg-red-500 text-[var(--text-primary)]'}`}>
                        {license?.is_valid ? "ACTIVO" : "INACTIVO"}
                    </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                        <div className="text-sm text-slate-500">Válido Hasta</div>
                        <div className="text-[var(--text-primary)] font-medium">{license?.valid_until ? new Date(license.valid_until).toLocaleDateString() : "-"}</div>
                    </div>
                    <div>
                        <div className="text-sm text-slate-500">Días Restantes</div>
                        <div className={`font-medium ${license?.days_remaining && license?.days_remaining < 30 ? 'text-orange-400' : 'text-[var(--text-primary)]'}`}>
                            {license?.days_remaining || 0}
                        </div>
                    </div>
                </div>

                <div className="mt-6 pt-4 border-t border-[var(--border-default)]/50">
                    <div className="text-sm text-slate-500 mb-2">Módulos Habilitados:</div>
                    <div className="flex flex-wrap gap-2">
                        {license?.modules.includes('*') ? (
                            <span className="px-2 py-1 rounded bg-purple-500/20 text-purple-400 text-xs border border-purple-500/30">Todo Desbloqueado (Master)</span>
                        ) : (
                            license?.modules.map(m => (
                                <span key={m} className="px-2 py-1 rounded bg-slate-800 text-[var(--text-secondary)] text-xs border border-[var(--border-default)]">{m}</span>
                            ))
                        )}
                        {(!license?.modules || license.modules.length === 0) && <span className="text-slate-500 italic text-sm">Ninguno</span>}
                    </div>
                </div>
            </div>

            <div className="bg-slate-800/50 p-6 rounded-xl border border-[var(--border-default)]">
                <h3 className="text-lg font-medium text-[var(--text-primary)] mb-4">Activar Nueva Licencia</h3>
                <textarea
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    placeholder="Pegue su clave de licencia aquí (inicia con eyJ...)"
                    className="w-full h-32 bg-slate-900 border border-[var(--border-default)] rounded-lg p-4 text-[var(--text-secondary)] font-mono text-sm focus:border-[var(--border-focus)] focus:border-transparent mb-4"
                />
                <button
                    onClick={handleActivate}
                    disabled={submitting || !key}
                    className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-[var(--text-primary)] px-6 py-2 rounded-lg font-medium transition-colors"
                >
                    {submitting ? "Verificando..." : "Activar Licencia"}
                </button>
            </div>
        </div>
    );
}
