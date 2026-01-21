import { useState, useMemo, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Trophy, Car, ChevronRight, Award, AlertTriangle, FileDown, Star, Gift, Camera } from 'lucide-react';
import axios from 'axios';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { API_URL } from '../config';

const getAllDrivers = async () => {
    const response = await axios.get(`${API_URL}/telemetry/drivers`);
    return response.data;
};

const getDriverProfile = async (name: string) => {
    const response = await axios.get(`${API_URL}/telemetry/pilot/${encodeURIComponent(name)}`);
    return response.data;
};

export default function MobilePassport() {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedDriver, setSelectedDriver] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const queryClient = useQueryClient();

    // Fetch All Drivers for Search
    const { data: drivers, isLoading: isLoadingList, error: listError } = useQuery({
        queryKey: ['drivers'],
        queryFn: async () => {
            const res = await getAllDrivers();
            return Array.isArray(res) ? res : [];
        }
    });

    // Fetch Specific Driver Profile
    const { data: profile, isLoading: isLoadingProfile, error: profileError } = useQuery({
        queryKey: ['driverProfile', selectedDriver],
        queryFn: () => getDriverProfile(selectedDriver!),
        enabled: !!selectedDriver
    });

    // Upload Photo Mutation
    const uploadPhotoMutation = useMutation({
        mutationFn: async (file: File) => {
            if (!profile?.driver_id) throw new Error("Driver ID missing");
            const formData = new FormData();
            formData.append('file', file);
            return await axios.post(`${API_URL}/drivers/${profile.driver_id}/photo`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['driverProfile', selectedDriver] });
        }
    });

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            uploadPhotoMutation.mutate(e.target.files[0]);
        }
    };

    // Fetch Loyalty Points
    const { data: loyalty } = useQuery({
        queryKey: ['driverLoyalty', selectedDriver],
        queryFn: async () => {
            const res = await axios.get(`${API_URL}/loyalty/points/${encodeURIComponent(selectedDriver!)}`);
            return res.data;
        },
        enabled: !!selectedDriver
    });

    // Filter Logic
    const filteredDrivers = useMemo(() => {
        if (!Array.isArray(drivers)) return [];
        return drivers.filter((d: { driver_name: string }) =>
            d.driver_name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [drivers, searchTerm]);

    const handleBack = () => {
        setSelectedDriver(null);
        setSearchTerm('');
    };

    // --- VIEW: DRIVER PROFILE (The "Passport") ---
    if (selectedDriver) {
        if (isLoadingProfile) {
            return (
                <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center text-white">
                    <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-4" />
                    <p className="text-blue-500 font-bold uppercase tracking-widest text-xs">Cargando Pasaporte...</p>
                </div>
            );
        }

        if (profileError || !profile) {
            return (
                <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center text-red-500 p-8">
                    <AlertTriangle size={48} className="mb-4 opacity-50" />
                    <h2 className="text-xl font-black uppercase tracking-widest text-center">Error al cargar perfil</h2>
                    <button onClick={handleBack} className="mt-6 px-6 py-2 bg-gray-900 border border-gray-800 rounded-xl text-white font-bold uppercase text-xs">Volver</button>
                </div>
            );
        }

        const passportUrl = `${window.location.origin}/passport?driver=${encodeURIComponent(selectedDriver)}`;

        return (
            <div className="min-h-screen bg-gray-950 text-white pb-safe">
                {/* Header */}
                <div className="sticky top-0 z-20 bg-gray-900/80 backdrop-blur-md border-b border-gray-800 px-4 py-3 flex items-center justify-between">
                    <button
                        onClick={handleBack}
                        className="p-2 -ml-2 text-gray-400 hover:text-white"
                    >
                        <ChevronRight className="rotate-180" size={24} />
                    </button>
                    <span className="font-bold text-sm tracking-widest uppercase">Driver Passport</span>
                    <button
                        onClick={() => window.open(`${API_URL}/exports/passport/${encodeURIComponent(selectedDriver)}`, '_blank')}
                        className="p-2 -mr-2 text-green-400 hover:text-green-300 flex items-center gap-1"
                        title="Descargar PDF"
                    >
                        <FileDown size={20} />
                    </button>
                </div>

                {/* Main Card */}
                <div className="p-4 space-y-4">
                    {/* Identity Card */}
                    <div className="bg-gradient-to-br from-blue-900/40 to-gray-900 border border-blue-500/30 rounded-2xl p-6 relative overflow-hidden shadow-2xl">
                        <div className="absolute top-0 right-0 p-2 opacity-10">
                            <QRCodeSVG
                                value={passportUrl}
                                size={100}
                                level="L"
                                bgColor="transparent"
                                fgColor="#ffffff"
                            />
                        </div>

                        <div className="relative z-10 flex flex-col items-center">
                            <div className="relative group">
                                <div className="w-24 h-24 rounded-full bg-gray-800 border-2 border-blue-400 flex items-center justify-center text-3xl font-black mb-3 shadow-lg overflow-hidden">
                                    {profile.photo_url ? (
                                        <img src={`${API_URL}${profile.photo_url}`} alt={profile.driver_name} className="w-full h-full object-cover" />
                                    ) : (
                                        profile.driver_name?.charAt(0).toUpperCase() || '?'
                                    )}
                                </div>
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="absolute bottom-3 right-0 bg-blue-600 rounded-full p-1.5 border-2 border-gray-900 text-white hover:bg-blue-500 transition-colors"
                                >
                                    <Camera size={14} />
                                </button>
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    className="hidden"
                                    accept="image/*"
                                    onChange={handleFileChange}
                                />
                                {uploadPhotoMutation.isPending && (
                                    <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center">
                                        <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    </div>
                                )}
                            </div>

                            <h1 className="text-2xl font-black uppercase tracking-tight text-center">{profile.driver_name}</h1>
                            <div className="flex gap-2 mt-2">
                                <div className="px-3 py-1 bg-blue-600/20 border border-blue-500/50 rounded-full text-blue-300 text-xs font-bold uppercase tracking-widest">
                                    {profile.total_laps > 100 ? "Pro Driver" : "Rookie"}
                                </div>
                                <div className="px-3 py-1 bg-yellow-600/20 border border-yellow-500/50 rounded-full text-yellow-300 text-xs font-bold uppercase tracking-widest flex items-center gap-1">
                                    <Trophy size={10} />
                                    ELO {Math.round(profile.elo_rating || 1200)}
                                </div>
                            </div>
                        </div>

                        {/* Quick Stats Grid */}
                        <div className="grid grid-cols-3 gap-2 mt-6 border-t border-white/10 pt-4">
                            <div className="text-center">
                                <div className="text-gray-400 text-[10px] uppercase font-bold">Vueltas</div>
                                <div className="text-xl font-mono font-bold">{profile.total_laps || 0}</div>
                            </div>
                            <div className="text-center border-l border-white/10">
                                <div className="text-gray-400 text-[10px] uppercase font-bold">Km Totales</div>
                                <div className="text-xl font-mono font-bold">{Math.round(profile.total_km || 0)}</div>
                            </div>
                            <div className="text-center border-l border-white/10">
                                <div className="text-gray-400 text-[10px] uppercase font-bold">Consist.</div>
                                <div className="text-xl font-mono font-bold text-green-400">{profile.avg_consistency || 0}%</div>
                            </div>
                        </div>
                    </div>


                    {/* Loyalty Points Card */}
                    {loyalty && (
                        <div className="bg-gradient-to-br from-amber-900/30 to-gray-900 border border-amber-500/30 rounded-2xl p-4">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <Star className="text-amber-400" size={20} />
                                    <span className="text-xs font-bold uppercase tracking-widest text-gray-400">Puntos de Fidelidad</span>
                                </div>
                                <div className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${loyalty.tier === 'platinum' ? 'bg-purple-600 text-white' :
                                    loyalty.tier === 'gold' ? 'bg-amber-500 text-black' :
                                        loyalty.tier === 'silver' ? 'bg-gray-400 text-black' :
                                            'bg-amber-800 text-amber-200'
                                    }`}>
                                    {loyalty.tier}
                                </div>
                            </div>
                            <div className="flex items-end justify-between">
                                <div>
                                    <div className="text-3xl font-black text-amber-400">{loyalty.points?.toLocaleString() || 0}</div>
                                    <div className="text-[10px] text-gray-500">puntos disponibles</div>
                                </div>
                                {loyalty.next_tier && (
                                    <div className="text-right">
                                        <div className="text-xs text-gray-500">Próximo nivel: <span className="text-amber-400 font-bold">{loyalty.next_tier}</span></div>
                                        <div className="w-24 h-1.5 bg-gray-800 rounded-full mt-1 overflow-hidden">
                                            <div
                                                className="h-full bg-gradient-to-r from-amber-600 to-amber-400 rounded-full transition-all"
                                                style={{ width: `${Math.min(100, ((loyalty.total_earned || 0) / ((loyalty.total_earned || 0) + (loyalty.points_to_next_tier || 1))) * 100)}%` }}
                                            />
                                        </div>
                                        <div className="text-[9px] text-gray-600 mt-0.5">{loyalty.points_to_next_tier} pts para {loyalty.next_tier}</div>
                                    </div>
                                )}
                            </div>
                            <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between">
                                <div className="text-[10px] text-gray-500">
                                    <Gift size={12} className="inline mr-1" />
                                    Total ganados: <span className="text-white font-bold">{loyalty.total_earned?.toLocaleString() || 0}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="space-y-3">
                        <h3 className="text-gray-400 text-xs font-bold uppercase tracking-widest ml-1">Últimas Sesiones</h3>
                        {Array.isArray(profile?.recent_sessions) && profile.recent_sessions.length > 0 ? (
                            profile.recent_sessions.map((session: { track_name?: string; car_model?: string; best_lap: number; date?: string }, i: number) => (
                                <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-between">
                                    <div>
                                        <div className="font-bold text-sm uppercase">{session.track_name?.replace(/_/g, ' ')}</div>
                                        <div className="text-xs text-gray-500 flex items-center mt-1">
                                            <Car size={10} className="mr-1" />
                                            {session.car_model?.replace(/_/g, ' ')}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-blue-400 font-mono font-bold text-sm">
                                            {Math.floor(session.best_lap / 60000)}:
                                            {Math.floor((session.best_lap % 60000) / 1000).toString().padStart(2, '0')}.
                                            {(session.best_lap % 1000).toString().padStart(3, '0')}
                                        </div>
                                        <div className="text-[10px] text-gray-600 mt-1">{session.date ? new Date(session.date).toLocaleDateString() : 'N/A'}</div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="p-8 text-center text-gray-600 italic text-xs">Sin historial reciente</div>
                        )}
                    </div>

                    {/* Stats Chart */}
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                        <h3 className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-4">Progresión (Últimas 5)</h3>
                        <div className="h-32">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={Array.isArray(profile.recent_sessions) ? profile.recent_sessions.slice(0, 5).reverse() : []}>
                                    <XAxis hide />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151' }}
                                        labelStyle={{ color: '#9CA3AF' }}
                                        cursor={{ fill: 'transparent' }}
                                    />
                                    <Bar dataKey="best_lap" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // --- VIEW: SEARCH LIST (Home) ---
    return (
        <div className="min-h-screen bg-gray-950 text-white flex flex-col">
            {/* Search Header */}
            <div className="p-6 pb-2 sticky top-0 bg-gray-950 z-10">
                <h1 className="text-3xl font-black text-white mb-1 uppercase tracking-tighter">
                    <span className="text-blue-600">Assetto</span>
                    <span className="ml-1">Passport</span>
                </h1>
                <p className="text-gray-500 text-sm mb-6">Tu carrera digital comienza aquí.</p>

                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                    <input
                        type="text"
                        placeholder="Buscar piloto..."
                        className="w-full bg-gray-900 border border-gray-800 rounded-xl pl-10 pr-4 py-3 text-white placeholder-gray-600 focus:ring-2 focus:ring-blue-600 outline-none transition-all"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* List */}
            <div className="flex-1 px-4 py-4 overflow-y-auto space-y-3">
                {isLoadingList ? (
                    <div className="text-center py-20 flex flex-col items-center">
                        <div className="w-10 h-10 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-4" />
                        <p className="text-blue-500 font-bold uppercase tracking-widest text-[10px]">Cargando pilotos...</p>
                    </div>
                ) : listError ? (
                    <div className="text-center py-20 flex flex-col items-center">
                        <AlertTriangle size={48} className="text-red-500/20 mb-4" />
                        <p className="text-red-500/50 font-bold uppercase tracking-widest text-xs">Error al cargar pilotos</p>
                    </div>
                ) : filteredDrivers?.length === 0 ? (
                    <div className="text-center text-gray-600 py-20 flex flex-col items-center">
                        <Search size={48} className="mb-4 opacity-20" />
                        <p className="text-sm font-bold uppercase tracking-widest">No hay pilotos que coincidan</p>
                    </div>
                ) : (
                    Array.isArray(filteredDrivers) && filteredDrivers.map((driver: { driver_name: string; rank_tier?: string; total_laps?: number }) => (
                        <button
                            key={driver.driver_name}
                            onClick={() => setSelectedDriver(driver.driver_name)}
                            className="w-full bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-blue-500/30 rounded-xl p-4 flex items-center justify-between transition-all group"
                        >
                            <div className="flex items-center">
                                <div className="w-10 h-10 rounded-full bg-gray-800 group-hover:bg-blue-900/30 flex items-center justify-center text-gray-400 group-hover:text-blue-400 font-black mr-3 transition-colors">
                                    {driver.driver_name.charAt(0).toUpperCase()}
                                </div>
                                <div className="text-left">
                                    <div className="font-bold text-white group-hover:text-blue-400 transition-colors uppercase">{driver.driver_name}</div>
                                    <div className="text-xs text-gray-500 flex items-center">
                                        <Award size={10} className="mr-1" />
                                        {driver.rank_tier} • {driver.total_laps} Laps
                                    </div>
                                </div>
                            </div>
                            <ChevronRight size={18} className="text-gray-600 group-hover:text-blue-500" />
                        </button>
                    ))
                )}
            </div>

            <div className="p-4 text-center text-[10px] text-gray-700 font-mono uppercase">
                Powered by Assetto Manager
            </div>
        </div>
    );
}
