import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { API_URL } from '../config';

interface AdCampaign {
    id: number;
    title: string;
    image_path: string;
    is_active: boolean;
    display_duration: number;
}

const AdsSettings: React.FC = () => {
    const queryClient = useQueryClient();
    const [uploading, setUploading] = useState(false);
    const [newAdTitle, setNewAdTitle] = useState("");
    const [newAdDuration, setNewAdDuration] = useState(15);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    // FIX: Using full URL for fetching
    const { data: ads, isLoading, error } = useQuery({
        queryKey: ['ads'],
        queryFn: async () => {
            const res = await fetch(`${API_URL}/ads/`);
            if (!res.ok) throw new Error("Failed to fetch ads");
            return res.json() as Promise<AdCampaign[]>;
        }
    });

    const uploadMutation = useMutation({
        mutationFn: async (formData: FormData) => {
            const res = await fetch(`${API_URL}/ads/`, {
                method: 'POST',
                body: formData, // No Authorization header needed for now or handled globally?
            });
            if (!res.ok) throw new Error("Failed to upload ad");
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['ads'] });
            setNewAdTitle("");
            setSelectedFile(null);
            setUploading(false);
        }
    });

    const toggleMutation = useMutation({
        mutationFn: async (id: number) => {
            const res = await fetch(`${API_URL}/ads/${id}/toggle`, { method: 'PUT' });
            if (!res.ok) throw new Error("Toggle failed");
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ads'] })
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: number) => {
            const res = await fetch(`${API_URL}/ads/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error("Delete failed");
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ads'] })
    });

    const handleUpload = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedFile || !newAdTitle) return;

        const formData = new FormData();
        formData.append('title', newAdTitle);
        formData.append('display_duration', newAdDuration.toString());
        formData.append('file', selectedFile);
        formData.append('is_active', 'true');

        setUploading(true);
        uploadMutation.mutate(formData);
    };

    return (
        <div className="space-y-6 text-white">
            <h2 className="text-2xl font-bold border-b border-gray-700 pb-2">Promotions & Sponsors</h2>

            {/* Upload Form */}
            <form onSubmit={handleUpload} className="bg-gray-800 p-4 rounded-lg space-y-4 border border-gray-700">
                <h3 className="text-lg font-semibold">New Promotion</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm mb-1">Title</label>
                        <input
                            type="text"
                            className="w-full bg-gray-700 rounded p-2 border border-gray-600 focus:outline-none focus:border-blue-500"
                            value={newAdTitle}
                            onChange={e => setNewAdTitle(e.target.value)}
                            placeholder="Checking E.g. Burger Combo"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm mb-1">Duration (s)</label>
                        <input
                            type="number"
                            className="w-full bg-gray-700 rounded p-2 border border-gray-600"
                            value={newAdDuration}
                            onChange={e => setNewAdDuration(parseInt(e.target.value))}
                            min={5}
                            max={300}
                        />
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-sm mb-1">Image</label>
                        <input
                            type="file"
                            accept="image/*"
                            className="w-full bg-gray-700 rounded p-2 text-sm"
                            onChange={e => setSelectedFile(e.target.files ? e.target.files[0] : null)}
                            required
                        />
                    </div>
                </div>
                <button
                    type="submit"
                    disabled={uploading || !selectedFile}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded transition-colors disabled:opacity-50"
                >
                    {uploading ? "Uploading..." : "Add Promotion"}
                </button>
            </form>

            {/* List */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {isLoading && (
                    <div className="col-span-full py-12 flex flex-col items-center gap-3 text-gray-500">
                        <div className="w-8 h-8 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                        <p className="text-sm font-bold uppercase tracking-widest">Cargando...</p>
                    </div>
                )}

                {error && (
                    <div className="col-span-full py-12 bg-red-500/10 border border-red-500/20 rounded-2xl text-center">
                        <p className="text-red-400 font-bold uppercase tracking-tight mb-1">Error de conexión</p>
                        <p className="text-gray-500 text-xs">No se han podido recuperar las promociones.</p>
                    </div>
                )}

                {Array.isArray(ads) ? (
                    ads.map(ad => (
                        <div key={ad.id} className={`relative group border rounded-2xl shadow-lg border-gray-700 overflow-hidden transition-all hover:border-gray-500 ${ad.is_active ? 'border-green-500/30' : 'border-red-500/30 opacity-75'}`}>
                            {/* Image Preview */}
                            <div className="aspect-video bg-black relative">
                                <img
                                    src={`${API_URL}/static/${ad.image_path}`}
                                    alt={ad.title}
                                    className="w-full h-full object-cover"
                                />
                                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-4">
                                    <p className="font-bold text-white">{ad.title}</p>
                                    <p className="text-[10px] text-gray-400 uppercase font-black tracking-widest">{ad.display_duration}s DE EXPOSICIÓN</p>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="p-3 flex justify-between bg-gray-900/80 items-center">
                                <button
                                    onClick={() => toggleMutation.mutate(ad.id)}
                                    className={`text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg transition-all ${ad.is_active ? 'bg-green-500/20 text-green-400 hover:bg-green-500 hover:text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-white'}`}
                                >
                                    {ad.is_active ? "Activa" : "Pausada"}
                                </button>
                                <button
                                    onClick={() => { if (confirm("¿Estás seguro de eliminar esta promoción?")) deleteMutation.mutate(ad.id) }}
                                    className="text-[10px] font-black uppercase tracking-wider bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white px-3 py-1.5 rounded-lg transition-all"
                                >
                                    Eliminar
                                </button>
                            </div>
                        </div>
                    ))
                ) : !isLoading && (
                    <div className="col-span-full py-12 text-center bg-gray-800/50 rounded-2xl border-2 border-dashed border-gray-700">
                        <p className="text-gray-500 font-bold italic">No has creado ninguna promoción todavía.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdsSettings;
