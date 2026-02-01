import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getWallpapers, getWallpaperConfig, uploadWallpaper, deleteWallpaper, updateWallpaperConfig } from '../api/wallpapers';
import { Trash2, Upload, Play, Clock, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function WallpaperSettings() {
    const queryClient = useQueryClient();
    const [uploading, setUploading] = useState(false);

    const { data: files = [] } = useQuery({
        queryKey: ['wallpapers-files'],
        queryFn: getWallpapers
    });

    const { data: config } = useQuery({
        queryKey: ['wallpapers-config'],
        queryFn: getWallpaperConfig
    });

    const uploadMutation = useMutation({
        mutationFn: uploadWallpaper,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['wallpapers-files'] });
            toast.success('Video subido correctamente');
            setUploading(false);
        },
        onError: () => {
            toast.error('Error al subir video');
            setUploading(false);
        }
    });

    const deleteMutation = useMutation({
        mutationFn: deleteWallpaper,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['wallpapers-files'] });
            // Also refetch config as it might have changed implicitly (though backend doesn't auto-remove yet, UI should handle)
            queryClient.invalidateQueries({ queryKey: ['wallpapers-config'] });
            toast.success('Video eliminado');
        }
    });

    const configMutation = useMutation({
        mutationFn: updateWallpaperConfig,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['wallpapers-config'] });
            toast.success('Configuración guardada');
        }
    });

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setUploading(true);
            uploadMutation.mutate(e.target.files[0]);
        }
    };

    const toggleActive = (filename: string) => {
        if (!config) return;
        const currentActive = config.active_wallpapers || [];
        const newActive = currentActive.includes(filename)
            ? currentActive.filter(f => f !== filename)
            : [...currentActive, filename];

        configMutation.mutate({
            ...config,
            active_wallpapers: newActive
        });
    };

    const updateInterval = (seconds: number) => {
        if (!config) return;
        configMutation.mutate({
            ...config,
            interval_seconds: seconds
        });
    };

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-3xl p-8">
            <h2 className="text-2xl font-black text-white mb-6 uppercase flex items-center gap-3">
                <Play className="text-blue-500" /> Wallpapers Dinámicos
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Configuration Panel */}
                <div className="col-span-1 bg-gray-800/50 rounded-2xl p-6 h-fit">
                    <h3 className="text-lg font-bold text-gray-300 mb-4 flex items-center gap-2">
                        <Clock size={20} /> Configuración de Rotación
                    </h3>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-gray-400 text-sm mb-2">Intervalo de cambio (segundos)</label>
                            <input
                                type="number"
                                min="10"
                                value={config?.interval_seconds || 30}
                                onChange={(e) => updateInterval(parseInt(e.target.value))}
                                className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white focus:border-blue-500 outline-none"
                            />
                        </div>

                        <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl p-4">
                            <p className="text-blue-200 text-sm">
                                <strong>Sincronización Automática:</strong> Los videos se rotarán en todos los simuladores al mismo tiempo basado en este intervalo.
                            </p>
                        </div>

                        <div className="pt-4 border-t border-gray-700">
                            <label className="block text-gray-400 text-sm mb-2">Subir Nuevo Video</label>
                            <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-2xl cursor-pointer hover:bg-gray-700/50 transition-all ${uploading ? 'border-blue-500 bg-blue-500/10' : 'border-gray-600'}`}>
                                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                    <Upload className={`mb-3 ${uploading ? 'animate-bounce text-blue-400' : 'text-gray-400'}`} />
                                    <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
                                        {uploading ? 'Subiendo...' : <span className="font-semibold">Click para subir video</span>}
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">MP4, WEBM (Max 100MB)</p>
                                </div>
                                <input type="file" className="hidden" accept="video/mp4,video/webm" onChange={handleFileSelect} disabled={uploading} />
                            </label>
                        </div>
                    </div>
                </div>

                {/* Files List */}
                <div className="col-span-2 space-y-4">
                    <h3 className="text-lg font-bold text-gray-300 mb-4">Videos Disponibles ({files.length})</h3>

                    {files.length === 0 ? (
                        <div className="text-center py-12 text-gray-500 italic border border-gray-800 rounded-2xl">
                            No hay videos subidos.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {files.map(file => {
                                const isActive = config?.active_wallpapers?.includes(file.filename);
                                return (
                                    <div key={file.filename} className={`relative group rounded-2xl overflow-hidden border-2 transition-all ${isActive ? 'border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.2)]' : 'border-gray-800 hover:border-gray-600'}`}>
                                        <video
                                            src={file.url}
                                            className="w-full h-40 object-cover bg-black"
                                            muted
                                            onMouseOver={e => e.currentTarget.play()}
                                            onMouseOut={e => {
                                                e.currentTarget.pause();
                                                e.currentTarget.currentTime = 0;
                                            }}
                                        />

                                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />

                                        <div className="absolute bottom-0 left-0 right-0 p-4 flex justify-between items-end">
                                            <div className="overflow-hidden">
                                                <p className="text-white font-bold truncate text-sm" title={file.filename}>{file.filename}</p>
                                                <p className="text-gray-400 text-xs">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
                                            </div>

                                            <div className="flex gap-2 pointer-events-auto">
                                                <button
                                                    onClick={() => toggleActive(file.filename)}
                                                    className={`p-2 rounded-lg transition-colors ${isActive ? 'bg-green-500 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
                                                    title={isActive ? "Desactivar" : "Activar"}
                                                >
                                                    <CheckCircle size={18} />
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        if (confirm('¿Eliminar este video?')) deleteMutation.mutate(file.filename);
                                                    }}
                                                    className="p-2 bg-red-900/50 hover:bg-red-600 text-red-200 hover:text-white rounded-lg transition-colors"
                                                    title="Eliminar"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        </div>

                                        {isActive && (
                                            <div className="absolute top-3 right-3 bg-green-500 text-white text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-widest shadow-lg">
                                                Activo
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
