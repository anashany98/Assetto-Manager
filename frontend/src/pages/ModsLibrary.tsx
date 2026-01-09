import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getMods, uploadMod, getModMetadata, type ModMetadata } from '../api/mods';
import { useState, useEffect } from 'react';
import { UploadCloud, FileBox, CheckCircle2, AlertCircle, Car, Flag, Filter, X, Zap, Activity, Ruler, MapPin } from 'lucide-react';
import { cn } from '../lib/utils';

export default function ModsLibrary() {
    const queryClient = useQueryClient();
    const { data: mods, isLoading } = useQuery({ queryKey: ['mods'], queryFn: getMods });

    // Filtering state
    const [filterType, setFilterType] = useState<'all' | 'car' | 'track'>('all');

    // Upload state
    const [isUploading, setIsUploading] = useState(false);
    const [uploadForm, setUploadForm] = useState({
        name: '',
        version: '',
        type: '', // Empty = Auto
        file: null as File | null
    });

    // Detail Modal state
    const [selectedModId, setSelectedModId] = useState<number | null>(null);
    const [metadata, setMetadata] = useState<ModMetadata | null>(null);
    const [isLoadingMeta, setIsLoadingMeta] = useState(false);

    // Fetch metadata when modal opens
    useEffect(() => {
        if (selectedModId) {
            setIsLoadingMeta(true);
            getModMetadata(selectedModId)
                .then(data => setMetadata(data))
                .catch(err => console.error("Failed to load metadata", err))
                .finally(() => setIsLoadingMeta(false));
        } else {
            setMetadata(null);
        }
    }, [selectedModId]);

    const uploadMutation = useMutation({
        mutationFn: () => {
            if (!uploadForm.file) throw new Error("No archivo seleccionado");
            return uploadMod(uploadForm.file, {
                name: uploadForm.name,
                version: uploadForm.version,
                type: uploadForm.type
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['mods'] });
            setIsUploading(false);
            setUploadForm({ name: '', version: '1.0', type: 'car', file: null });
        },
        onError: (error) => {
            alert(`Error en subida: ${error}`);
        }
    });

    if (isLoading) return <div className="p-8 text-gray-500">Cargando librería...</div>;

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const lowerName = file.name.toLowerCase();

            if (lowerName.endsWith('.rar') || lowerName.endsWith('.7z')) {
                alert("❌ Los archivos .RAR y .7Z no están soportados nativamente. Por favor, conviértelos a .ZIP para asegurar la compatibilidad.");
                e.target.value = ''; // Reset input
                return;
            }
            setUploadForm({ ...uploadForm, file: file });
        }
    };

    // Filter logic
    const filteredMods = mods?.filter(mod => {
        if (filterType === 'all') return true;
        return mod.type === filterType;
    });

    const selectedMod = mods?.find(m => m.id === selectedModId);

    return (
        <div className="p-8 relative">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Librería de Contenido</h1>
                    <p className="text-gray-500 mt-1">Gestiona coches, circuitos y apps</p>
                </div>
                <button
                    onClick={() => setIsUploading(!isUploading)}
                    className="flex items-center space-x-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg hover:bg-blue-700 shadow-md transition-all"
                >
                    <UploadCloud size={20} />
                    <span>Subir Nuevo Mod</span>
                </button>
            </div>

            {/* Tabs Filter */}
            <div className="flex space-x-2 mb-6">
                <button
                    onClick={() => setFilterType('all')}
                    className={cn(
                        "px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center",
                        filterType === 'all'
                            ? "bg-gray-800 text-white shadow-sm"
                            : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
                    )}
                >
                    <Filter size={16} className="mr-2" />
                    Todos
                </button>
                <button
                    onClick={() => setFilterType('car')}
                    className={cn(
                        "px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center",
                        filterType === 'car'
                            ? "bg-red-600 text-white shadow-sm"
                            : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
                    )}
                >
                    <Car size={16} className="mr-2" />
                    Coches
                </button>
                <button
                    onClick={() => setFilterType('track')}
                    className={cn(
                        "px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center",
                        filterType === 'track'
                            ? "bg-slate-700 text-white shadow-sm"
                            : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
                    )}
                >
                    <Flag size={16} className="mr-2" />
                    Circuitos
                </button>
            </div>

            {isUploading && (
                <div className="bg-white p-6 rounded-xl shadow-md border border-blue-100 mb-8 animate-in fade-in slide-in-from-top-4">
                    <h2 className="text-lg font-bold mb-6 flex items-center text-gray-800">
                        <div className="bg-blue-100 p-2 rounded-lg mr-3 text-blue-600">
                            <UploadCloud size={20} />
                        </div>
                        Subir Archivo (.zip)
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700">Nombre (Opcional - Auto Detect)</label>
                            <input
                                type="text"
                                placeholder="Auto (detectar desde json)"
                                className="w-full border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all placeholder:text-gray-400"
                                value={uploadForm.name}
                                onChange={e => setUploadForm({ ...uploadForm, name: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700">Tipo de Contenido</label>
                            <select
                                className="w-full border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                                value={uploadForm.type}
                                onChange={e => setUploadForm({ ...uploadForm, type: e.target.value })}
                            >
                                <option value="">Auto (Recomendado)</option>
                                <option value="car">Coche (Car)</option>
                                <option value="track">Circuito (Track)</option>
                                <option value="skin">Skin / Livery</option>
                                <option value="app">App / Plugin</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700">Versión</label>
                            <input
                                type="text"
                                placeholder="Auto v1.0"
                                className="w-full border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                value={uploadForm.version}
                                onChange={e => setUploadForm({ ...uploadForm, version: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer relative mb-6">
                        <input
                            type="file"
                            accept=".zip"
                            onChange={handleFileChange}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        <div className="flex flex-col items-center justify-center text-gray-500">
                            <UploadCloud size={32} className="mb-2 text-gray-400" />
                            <p className="font-medium text-gray-700">{uploadForm.file ? uploadForm.file.name : "Arrastra un archivo o haz clic aquí"}</p>
                            <p className="text-xs text-gray-400 mt-1">Solo archivos .zip permitidos</p>
                            <p className="text-xs text-blue-500 mt-2 font-medium">Smart Detect: Tipo, Nombre y Versión automáticos</p>
                        </div>
                    </div>

                    <div className="flex justify-end space-x-3">
                        <button
                            onClick={() => setIsUploading(false)}
                            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={() => uploadMutation.mutate()}
                            disabled={uploadMutation.isPending || !uploadForm.file}
                            className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                        >
                            {uploadMutation.isPending ? (
                                <>
                                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></span>
                                    Procesando...
                                </>
                            ) : 'Subir y Validar'}
                        </button>
                    </div>
                </div>
            )}

            <div className="bg-white shadow-sm rounded-xl overflow-hidden border border-gray-200">
                <table className="min-w-full text-left">
                    <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Tipo</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Nombre del Recurso</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Versión</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Estado</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {filteredMods?.map((mod) => (
                            <tr
                                key={mod.id}
                                onClick={() => setSelectedModId(mod.id)}
                                className="hover:bg-gray-50 transition-colors cursor-pointer group"
                            >
                                <td className="px-6 py-4">
                                    <span className={cn(
                                        "px-2.5 py-1 rounded-md text-xs font-bold uppercase inline-flex items-center",
                                        mod.type === 'car' ? "bg-red-100 text-red-700 ring-1 ring-red-200" :
                                            mod.type === 'track' ? "bg-slate-100 text-slate-700 ring-1 ring-slate-200" :
                                                "bg-gray-100 text-gray-700"
                                    )}>
                                        {mod.type === 'car' && <Car size={14} className="mr-1.5" />}
                                        {mod.type === 'track' && <Flag size={14} className="mr-1.5" />}
                                        {mod.type}
                                    </span>
                                </td>
                                <td className="px-6 py-4 font-medium text-gray-900 border-l-4 border-transparent group-hover:border-blue-500 transition-all">
                                    <div className="flex items-center">
                                        <div className={cn(
                                            "w-8 h-8 rounded-lg flex items-center justify-center mr-3",
                                            mod.type === 'car' ? "bg-red-50 text-red-500" :
                                                mod.type === 'track' ? "bg-slate-50 text-slate-500" : "bg-gray-50 text-gray-400"
                                        )}>
                                            {mod.type === 'car' ? <Car size={18} /> :
                                                mod.type === 'track' ? <Flag size={18} /> : <FileBox size={18} />}
                                        </div>
                                        <span className="text-base group-hover:text-blue-600 transition-colors">{mod.name}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-gray-500 font-mono text-sm">{mod.version}</td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center space-x-2">
                                        {mod.status === 'approved' ? (
                                            <>
                                                <CheckCircle2 size={16} className="text-green-500" />
                                                <span className="text-green-700 text-sm font-medium">Verificado</span>
                                            </>
                                        ) : (
                                            <>
                                                <AlertCircle size={16} className="text-yellow-500" />
                                                <span className="text-yellow-700 text-sm font-medium">{mod.status}</span>
                                            </>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {filteredMods?.length === 0 && (
                            <tr>
                                <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                                    <Car size={48} className="mx-auto text-gray-200 mb-3" />
                                    No hay contenido de este tipo.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* DETAIL MODAL */}
            {selectedModId && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
                    <div
                        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header Image Area */}
                        <div className="relative h-64 bg-gray-900 group">
                            {isLoadingMeta ? (
                                <div className="absolute inset-0 flex items-center justify-center text-white/50">
                                    Cargando imagen...
                                </div>
                            ) : (
                                <>
                                    {(metadata?.image_url || metadata?.map_url) ? (
                                        <img
                                            src={`http://localhost:8000${selectedMod?.type === 'track' && metadata?.map_url ? metadata.map_url : metadata?.image_url}`}
                                            alt={selectedMod?.name}
                                            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-gray-600 bg-gray-800">
                                            {selectedMod?.type === 'car' ? <Car size={64} opacity={0.5} /> : <Flag size={64} opacity={0.5} />}
                                        </div>
                                    )}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
                                    <div className="absolute bottom-6 left-8 text-white">
                                        <div className="flex items-center space-x-3 mb-2">
                                            <span className={cn(
                                                "px-2 py-0.5 rounded text-xs font-bold uppercase border",
                                                selectedMod?.type === 'car' ? "border-red-500 text-red-400 bg-red-500/10" : "border-slate-500 text-slate-400 bg-slate-500/10"
                                            )}>
                                                {selectedMod?.type}
                                            </span>
                                            {metadata?.brand && <span className="text-gray-300 font-medium">{metadata.brand}</span>}
                                        </div>
                                        <h2 className="text-4xl font-bold tracking-tight">{selectedMod?.name}</h2>
                                    </div>
                                    <button
                                        onClick={() => setSelectedModId(null)}
                                        className="absolute top-4 right-4 bg-black/40 hover:bg-black/60 text-white p-2 rounded-full transition-colors backdrop-blur-md"
                                    >
                                        <X size={20} />
                                    </button>
                                </>
                            )}
                        </div>

                        {/* Content Area */}
                        <div className="p-8 overflow-y-auto flex-1 bg-gray-50">
                            {isLoadingMeta ? (
                                <div className="space-y-4 animate-pulse">
                                    <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                                    <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                                    <div className="h-32 bg-gray-200 rounded w-full mt-6"></div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                    <div className="md:col-span-2 space-y-6">
                                        {metadata?.description ? (
                                            <div>
                                                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Descripción</h3>
                                                <p className="text-gray-700 leading-relaxed whitespace-pre-line">{metadata.description}</p>
                                            </div>
                                        ) : (
                                            <p className="text-gray-400 italic">Sin descripción disponible.</p>
                                        )}

                                        {selectedMod?.type === 'track' && metadata?.outline_url && (
                                            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm mt-4">
                                                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">Trazado</h3>
                                                <img
                                                    src={`http://localhost:8000${metadata.outline_url}`}
                                                    className="w-full h-auto max-h-48 object-contain opacity-80 invert"
                                                    alt="Track Outline"
                                                />
                                            </div>
                                        )}
                                    </div>

                                    <div className="space-y-6">
                                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                                            <h3 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-3 mb-4">Ficha Técnica</h3>

                                            <div className="space-y-4">
                                                {selectedMod?.type === 'car' && (
                                                    <>
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center text-gray-600">
                                                                <Zap size={18} className="mr-2 text-yellow-500" />
                                                                <span>Potencia</span>
                                                            </div>
                                                            <span className="font-mono font-bold text-gray-900">{metadata?.specs?.bhp || '-'} bhp</span>
                                                        </div>
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center text-gray-600">
                                                                <Activity size={18} className="mr-2 text-blue-500" />
                                                                <span>Par Motor</span>
                                                            </div>
                                                            <span className="font-mono font-bold text-gray-900">{metadata?.specs?.torque || '-'} Nm</span>
                                                        </div>
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center text-gray-600">
                                                                <Ruler size={18} className="mr-2 text-green-500" />
                                                                <span>Clase</span>
                                                            </div>
                                                            <span className="font-medium text-gray-900 capitalize">{metadata?.class || '-'}</span>
                                                        </div>
                                                    </>
                                                )}

                                                {selectedMod?.type === 'track' && (
                                                    <>
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center text-gray-600">
                                                                <MapPin size={18} className="mr-2 text-red-500" />
                                                                <span>Ciudad</span>
                                                            </div>
                                                            <span className="font-medium text-gray-900">{metadata?.city || '-'}</span>
                                                        </div>
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center text-gray-600">
                                                                <Ruler size={18} className="mr-2 text-blue-500" />
                                                                <span>Longitud</span>
                                                            </div>
                                                            <span className="font-mono font-bold text-gray-900">{metadata?.length || '-'}</span>
                                                        </div>
                                                    </>
                                                )}

                                                <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
                                                    <span className="text-xs text-gray-400">Versión del Mod</span>
                                                    <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs font-mono">{selectedMod?.version}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
