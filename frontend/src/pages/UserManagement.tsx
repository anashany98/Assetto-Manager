import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useAuth } from '../context/useAuth';
import { API_URL } from '../config';
import { Shield, Check, User as UserIcon } from 'lucide-react';

type User = {
    id: number;
    username: string;
    role: string;
    is_active: boolean;
    permissions: string[];
};

type PermissionModule = {
    key: string;
    label: string;
};

const FALLBACK_MODULES: PermissionModule[] = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'settings', label: 'Ajustes' },
    { key: 'stations', label: 'Estaciones' },
    { key: 'users', label: 'Usuarios' },
    { key: 'profiles', label: 'Perfiles' },
    { key: 'editor', label: 'Editor AC' },
    { key: 'drivers', label: 'Pilotos' },
    { key: 'championships', label: 'Campeonatos' },
    { key: 'history', label: 'Historial' },
    { key: 'mods', label: 'Libreria Mods' },
    { key: 'events', label: 'Eventos/Torneos' },
    { key: 'kiosk', label: 'Modo Kiosko' },
    { key: 'bookings', label: 'Reservas Simuladores' },
    { key: 'tables', label: 'Reservas Mesas' },
    { key: 'analytics', label: 'Analitica/Ingresos' },
    { key: 'online_reservations', label: 'Reservas Online' },
    { key: 'lap_comparison', label: 'Comparar Vueltas' },
    { key: 'leaderboard', label: 'Clasificacion en Vivo' },
    { key: 'passport', label: 'Pasaporte Piloto' },
    { key: 'live_map', label: 'Mapa en Vivo' },
    { key: 'tv', label: 'Modo TV' },
    { key: 'hall_of_fame', label: 'Salon de la Fama' },
    { key: 'battle', label: 'Modo Batalla' },
    { key: 'tv_remote', label: 'Mando TV' },
    { key: 'tv_spectator', label: 'Espectador TV' },
];

export default function UserManagement() {
    const { user: currentUser } = useAuth();
    const queryClient = useQueryClient();
    const [editingId, setEditingId] = useState<number | null>(null);

    const { data: users, isLoading } = useQuery({
        queryKey: ['users'],
        queryFn: async () => {
            const res = await axios.get(`${API_URL}/users/`);
            return res.data as User[];
        },
    });

    const { data: modules = FALLBACK_MODULES } = useQuery({
        queryKey: ['user_permission_modules'],
        queryFn: async () => {
            const res = await axios.get(`${API_URL}/users/modules`);
            return res.data as PermissionModule[];
        },
        initialData: FALLBACK_MODULES,
        staleTime: 5 * 60 * 1000,
    });

    const moduleLabelByKey = useMemo(
        () => new Map(modules.map((item) => [item.key, item.label])),
        [modules],
    );

    const updatePermissionsMutation = useMutation({
        mutationFn: async ({ id, permissions }: { id: number; permissions: string[] }) => {
            await axios.put(`${API_URL}/users/${id}/permissions`, { permissions });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
            setEditingId(null);
            alert('Permisos actualizados correctamente');
        },
        onError: (error: any) => {
            const invalid = error?.response?.data?.detail?.invalid_keys;
            if (Array.isArray(invalid) && invalid.length > 0) {
                alert(`Permisos invalidos: ${invalid.join(', ')}`);
                return;
            }
            alert('Error al actualizar permisos');
        },
    });

    if (isLoading) return <div className="p-8 text-[var(--text-primary)]">Cargando usuarios...</div>;

    if (currentUser?.role !== 'admin') {
        return <div className="p-8 text-red-500">Acceso denegado. Requiere permisos de administrador.</div>;
    }

    const editingUser = editingId !== null ? (users?.find((u) => u.id === editingId) ?? null) : null;

    return (
        <div className="p-8 max-w-7xl mx-auto">
            <div className="flex items-center gap-3 mb-8">
                <Shield className="text-blue-500" size={32} />
                <div>
                    <h1 className="text-3xl font-bold text-[var(--text-primary)]">Gestion de Usuarios</h1>
                    <p className="text-slate-400">Configura visibilidad de modulos por usuario</p>
                </div>
            </div>

            <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-[var(--border-default)] overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-slate-900/50 border-b border-[var(--border-default)]">
                        <tr>
                            <th className="p-4 text-slate-400 font-medium">Usuario</th>
                            <th className="p-4 text-slate-400 font-medium">Rol</th>
                            <th className="p-4 text-slate-400 font-medium">Modulos Visibles</th>
                            <th className="p-4 text-slate-400 font-medium text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                        {users?.map((u) => (
                            <tr key={u.id} className="hover:bg-slate-700/30 transition-colors">
                                <td className="p-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">
                                            <UserIcon size={16} className="text-slate-400" />
                                        </div>
                                        <div>
                                            <div className="font-medium text-[var(--text-primary)]">{u.username}</div>
                                            <div className="text-xs text-slate-500">ID: {u.id}</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="p-4">
                                    <span
                                        className={`px-2 py-1 rounded text-xs font-medium border ${u.role === 'admin'
                                            ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                                            : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                            }`}
                                    >
                                        {u.role.toUpperCase()}
                                    </span>
                                </td>
                                <td className="p-4">
                                    {u.role === 'admin' ? (
                                        <span className="text-slate-500 italic">Acceso Total (Admin)</span>
                                    ) : (
                                        <div className="flex flex-wrap gap-1">
                                            {u.permissions?.length === 0 && <span className="text-red-400 text-sm">Sin acceso</span>}
                                            {u.permissions?.map((p) => (
                                                <span key={p} className="px-1.5 py-0.5 rounded bg-slate-800 text-[var(--text-secondary)] text-xs border border-[var(--border-default)]">
                                                    {moduleLabelByKey.get(p) || p}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </td>
                                <td className="p-4 text-right">
                                    {u.role !== 'admin' && (
                                        <button
                                            onClick={() => setEditingId(u.id)}
                                            className="text-blue-400 hover:text-blue-300 text-sm font-medium"
                                        >
                                            Editar Permisos
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {editingUser && (
                <PermissionEditor
                    user={editingUser}
                    modules={modules}
                    onClose={() => setEditingId(null)}
                    onSave={(perms) => updatePermissionsMutation.mutate({ id: editingUser.id, permissions: perms })}
                />
            )}
        </div>
    );
}

function PermissionEditor({
    user,
    modules,
    onClose,
    onSave,
}: {
    user: User,
    modules: PermissionModule[],
    onClose: () => void,
    onSave: (p: string[]) => void,
}) {
    const [selected, setSelected] = useState<string[]>(user.permissions || []);

    const availableModules = useMemo(() => {
        const known = new Set(modules.map((mod) => mod.key));
        const legacy = selected
            .filter((key) => !known.has(key))
            .map((key) => ({ key, label: `${key} (legacy)` }));
        return [...modules, ...legacy];
    }, [modules, selected]);

    const toggle = (key: string) => {
        if (selected.includes(key)) setSelected(selected.filter((k) => k !== key));
        else setSelected([...selected, key]);
    };

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
            <div className="bg-slate-900 rounded-2xl border border-[var(--border-default)] max-w-lg w-full overflow-hidden shadow-2xl">
                <div className="p-6 border-b border-slate-800">
                    <h2 className="text-xl font-bold text-[var(--text-primary)]">Permisos: {user.username}</h2>
                    <p className="text-slate-400 text-sm mt-1">Selecciona los modulos visibles para este usuario.</p>
                </div>

                <div className="p-6 grid grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto">
                    {availableModules.map((mod) => (
                        <button
                            key={mod.key}
                            onClick={() => toggle(mod.key)}
                            className={`flex items-center justify-between p-3 rounded-xl border transition-all ${selected.includes(mod.key)
                                ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                                : 'bg-slate-800 border-[var(--border-default)] text-slate-400 hover:border-slate-600'
                                }`}
                        >
                            <span className="font-medium">{mod.label}</span>
                            {selected.includes(mod.key) && <Check size={18} />}
                        </button>
                    ))}
                </div>

                <div className="p-6 bg-slate-950/50 border-t border-slate-800 flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 rounded-lg text-slate-400 hover:bg-slate-800 transition-colors">
                        Cancelar
                    </button>
                    <button
                        onClick={() => onSave(selected)}
                        className="px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-[var(--text-primary)] font-medium transition-colors shadow-lg shadow-blue-500/20"
                    >
                        Guardar Cambios
                    </button>
                </div>
            </div>
        </div>
    );
}
