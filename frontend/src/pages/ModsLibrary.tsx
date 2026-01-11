import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getMods, uploadMod, getModMetadata, deleteMod, toggleMod, getDiskUsage, getTags, createTag, addTagToMod, removeTagFromMod, bulkDeleteMods, bulkToggleMods, deployToStations, type ModMetadata } from '../api/mods';
import { useState, useEffect } from 'react';
import { UploadCloud, FileBox, CheckCircle2, AlertCircle, Car, Flag, Filter, X, Zap, Activity, Ruler, MapPin, Search, Trash2, Power, Eye, Tag as TagIcon, Plus, HardDrive, CheckSquare, Square, Rocket } from 'lucide-react';


import { cn } from '../lib/utils';
import JSZip from 'jszip';

export default function ModsLibrary() {
    const queryClient = useQueryClient();
    const { data: mods, isLoading } = useQuery({ queryKey: ['mods'], queryFn: () => getMods() });
    const { data: diskUsage } = useQuery({ queryKey: ['diskUsage'], queryFn: getDiskUsage });
    const { data: tags, refetch: refetchTags } = useQuery({ queryKey: ['tags'], queryFn: getTags });

    // Filtering state
    const [filterType, setFilterType] = useState<'all' | 'car' | 'track'>('all');
    const [searchQuery, setSearchQuery] = useState('');

    // Bulk Selection State
    const [selectedMods, setSelectedMods] = useState<number[]>([]);

    // Upload state
    const [isUploading, setIsUploading] = useState(false);
    const [uploadMode, setUploadMode] = useState<'file' | 'folder'>('file');
    const [uploadProgress, setUploadProgress] = useState(0); // 0-100
    const [uploadStatus, setUploadStatus] = useState(''); // Text status
    const [uploadForm, setUploadForm] = useState({
        name: '',
        version: '',
        type: '', // Empty = Auto
        file: null as File | null
    });

    // Tagging State (New Tag Input)
    const [newTagName, setNewTagName] = useState('');
    const [isAddingTag, setIsAddingTag] = useState(false);

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

    // Folder Zipping Logic
    const handleFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;

        setUploadStatus("Comprimiendo carpeta...");
        setIsUploading(true);

        try {
            const zip = new JSZip();
            const files = Array.from(e.target.files);

            // Get root folder name if possible from first file webkitRelativePath
            // e.g. "MyCar/data.acd" -> "MyCar"
            let rootName = "new_mod";
            if (files[0].webkitRelativePath) {
                rootName = files[0].webkitRelativePath.split('/')[0];
            }

            // Create ZIP structure
            files.forEach(file => {
                // Use webkitRelativePath to maintain structure inside the zip
                // But we want the content AT ROOT of the zip? 
                // Standard mods usually are "CarName/content..." or just "content/..."
                // If we just zip the files as they are relative to the selected directory.
                zip.file(file.webkitRelativePath, file);
            });

            const content = await zip.generateAsync({ type: "blob" }, (metadata) => {
                setUploadProgress(metadata.percent);
            });

            // Create a File object from the blob
            const zipFile = new File([content], `${rootName}.zip`, { type: "application/zip" });

            setUploadForm(prev => ({ ...prev, file: zipFile, name: rootName }));
            setUploadStatus("Carpeta lista para subir. Pulsa Subir.");
            setIsUploading(false); // Enable submit button, but keep status? 
            // Better: just set file and let user click upload.

        } catch (err) {
            console.error(err);
            alert("Error al comprimir la carpeta");
            setIsUploading(false);
            setUploadStatus("");
        }
    };

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
            queryClient.invalidateQueries({ queryKey: ['diskUsage'] }); // Refresh disk usage
            setIsUploading(false);
            setUploadForm({ name: '', version: '1.0', type: 'car', file: null });
            setUploadStatus('');
            setUploadProgress(0);
        },
        onError: (error) => {
            alert(`Error en subida: ${error}`);
            setIsUploading(false);
        }
    });

    const deleteMutation = useMutation({
        mutationFn: deleteMod,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['mods'] });
            queryClient.invalidateQueries({ queryKey: ['diskUsage'] }); // Refresh disk usage
            setSelectedModId(null); // Close modal if open
        },
        onError: (error) => alert(`Error al borrar: ${error}`)
    });

    const toggleMutation = useMutation({
        mutationFn: toggleMod,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['mods'] });
        },
        onError: (error) => alert(`Error al cambiar estado: ${error}`)
    });

    // Tag Mutations
    const createTagMutation = useMutation({
        mutationFn: (name: string) => createTag(name, '#3b82f6'),
        onSuccess: () => {
            refetchTags();
            setNewTagName('');
            setIsAddingTag(false);
        }
    });

    const addTagMutation = useMutation({
        mutationFn: ({ modId, tagId }: { modId: number, tagId: number }) => addTagToMod(modId, tagId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['mods'] });
        }
    });

    const removeTagMutation = useMutation({
        mutationFn: ({ modId, tagId }: { modId: number, tagId: number }) => removeTagFromMod(modId, tagId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['mods'] });
        }
    });

    const deployMutation = useMutation({
        mutationFn: deployToStations,
        onSuccess: (data) => alert(`Despliegue Iniciado: ${data.message}`),
        onError: () => alert("Error al iniciar despliegue")
    });

    // Bulk Actions
    const bulkDeleteMutation = useMutation({
        mutationFn: bulkDeleteMods,
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['mods'] });
            setSelectedMods([]);
            alert(`Eliminados ${data.deleted} mods correctamente.`);
        }
    });

    const bulkToggleMutation = useMutation({
        mutationFn: ({ ids, state }: { ids: number[], state: boolean }) => bulkToggleMods(ids, state),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['mods'] });
            setSelectedMods([]);
        }
    });

    const handleBulkDelete = () => {
        if (confirm(`¿Eliminar ${selectedMods.length} mods seleccionados permanentemente?`)) {
            bulkDeleteMutation.mutate(selectedMods);
        }
    };

    const toggleSelection = (id: number) => {
        if (selectedMods.includes(id)) {
            setSelectedMods(selectedMods.filter(i => i !== id));
        } else {
            setSelectedMods([...selectedMods, id]);
        }
    };

    const selectAll = () => {
        if (filteredMods && selectedMods.length === filteredMods.length) {
            setSelectedMods([]);
        } else if (filteredMods) {
            setSelectedMods(filteredMods.map(m => m.id));
        }
    };


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
        const matchesType = filterType === 'all' || mod.type === filterType;
        const matchesSearch = mod.name.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesType && matchesSearch;
    });

    const selectedMod = mods?.find(m => m.id === selectedModId);

    const handleDelete = (modId: number, modName: string) => {
        if (window.confirm(`¿Estás seguro de que quieres BORRAR "${modName}" de forma permanente? Esta acción no se puede deshacer.`)) {
            deleteMutation.mutate(modId);
        }
    };

    const handleCreateTag = () => {
        if (newTagName.trim()) {
            createTagMutation.mutate(newTagName.trim());
        }
    };

    return (
        <div className="p-8 relative">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-3xl font-black text-white italic uppercase tracking-tight">Librería de Contenido</h1>
                    <p className="text-gray-400 mt-1 font-bold">Gestiona coches, circuitos y apps</p>
                </div>

                {/* Disk Usage Indicator */}
                {diskUsage && (
                    <div className="flex items-center space-x-3 bg-gray-800 px-4 py-2 rounded-xl border border-gray-700 shadow-lg mr-4">
                        <HardDrive size={18} className="text-gray-400" />
                        <div>
                            <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Almacenamiento</div>
                            <div className="text-sm font-bold text-white">{diskUsage.pretty}</div>
                        </div>
                    </div>
                )}

                <div className="flex space-x-3">
                    <button
                        onClick={() => deployMutation.mutate()}
                        className="flex items-center space-x-2 bg-purple-600 text-white px-5 py-2.5 rounded-lg hover:bg-purple-700 shadow-md transition-all font-bold"
                        title="Sincronizar con Simuladores"
                    >
                        <Rocket size={20} />
                        <span>Desplegar a Sala</span>
                    </button>
                    <button
                        onClick={() => setIsUploading(!isUploading)}
                        className="flex items-center space-x-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg hover:bg-blue-700 shadow-md transition-all font-bold"
                    >
                        <UploadCloud size={20} />
                        <span>Subir Nuevo Mod</span>
                    </button>
                </div>
            </div>

            {/* Bulk Actions Bar */}
            {selectedMods.length > 0 && (
                <div className="bg-blue-600 text-white p-4 rounded-xl shadow-lg mb-6 flex items-center justify-between animate-in slide-in-from-top-2">
                    <div className="flex items-center space-x-4">
                        <span className="font-bold text-lg">{selectedMods.length} Seleccionados</span>
                        <div className="h-6 w-px bg-blue-400"></div>
                        <button
                            onClick={() => setSelectedMods([])}
                            className="text-sm hover:underline opacity-80"
                        >
                            Deseleccionar
                        </button>
                    </div>
                    <div className="flex items-center space-x-3">
                        <button
                            onClick={() => bulkToggleMutation.mutate({ ids: selectedMods, state: true })}
                            className="flex items-center space-x-2 px-4 py-2 bg-green-500 hover:bg-green-600 rounded-lg transition-colors font-medium shadow-sm"
                        >
                            <CheckCircle2 size={18} />
                            <span>Activar</span>
                        </button>
                        <button
                            onClick={() => bulkToggleMutation.mutate({ ids: selectedMods, state: false })}
                            className="flex items-center space-x-2 px-4 py-2 bg-yellow-500 hover:bg-yellow-600 rounded-lg transition-colors font-medium shadow-sm"
                        >
                            <Power size={18} />
                            <span>Desactivar</span>
                        </button>
                        <button
                            onClick={handleBulkDelete}
                            className="flex items-center space-x-2 px-4 py-2 bg-red-500 hover:bg-red-600 rounded-lg transition-colors font-medium shadow-sm ml-4"
                        >
                            <Trash2 size={18} />
                            <span>Eliminar</span>
                        </button>
                    </div>
                </div>
            )}

            {/* Command Bar: Tabs + Search */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 bg-gray-800 p-4 rounded-xl border border-gray-700 shadow-lg">
                <div className="flex space-x-2">
                    <button
                        onClick={() => setFilterType('all')}
                        className={cn(
                            "px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-wider transition-colors flex items-center",
                            filterType === 'all'
                                ? "bg-gray-900 text-white shadow-inner border border-gray-600"
                                : "bg-gray-700 text-gray-400 hover:bg-gray-600 border border-gray-600 hover:text-white"
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

                <div className="relative w-full md:w-96">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                    <input
                        type="text"
                        placeholder="Buscar por nombre..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all placeholder-gray-500"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>
            </div>

            {isUploading && (
                <div className="bg-gray-800 p-6 rounded-xl shadow-lg border border-blue-900/50 mb-8 animate-in fade-in slide-in-from-top-4">
                    <h2 className="text-lg font-bold mb-4 flex items-center text-white">
                        <div className="bg-blue-500/20 p-2 rounded-lg mr-3 text-blue-400">
                            <UploadCloud size={20} />
                        </div>
                        Subir Mod
                    </h2>

                    {/* Mode Toggle */}
                    <div className="flex space-x-4 mb-4 border-b border-gray-100 pb-2">
                        <button
                            onClick={() => { setUploadMode('file'); setUploadForm(p => ({ ...p, file: null })); }}
                            className={cn("text-sm font-bold pb-2", uploadMode === 'file' ? "text-blue-500 border-b-2 border-blue-500" : "text-gray-500 hover:text-gray-700")}
                        >
                            Archivo (ZIP/RAR)
                        </button>
                        <button
                            onClick={() => { setUploadMode('folder'); setUploadForm(p => ({ ...p, file: null })); }}
                            className={cn("text-sm font-bold pb-2", uploadMode === 'folder' ? "text-blue-500 border-b-2 border-blue-500" : "text-gray-500 hover:text-gray-700")}
                        >
                            Carpeta (Directo)
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-400">Nombre</label>
                            <input
                                type="text"
                                placeholder="Auto"
                                className="w-full bg-gray-900 border border-gray-700 p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-white placeholder-gray-600"
                                value={uploadForm.name}
                                onChange={e => setUploadForm({ ...uploadForm, name: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-400">Tipo</label>
                            <select
                                className="w-full bg-gray-900 border border-gray-700 p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-white"
                                value={uploadForm.type}
                                onChange={e => setUploadForm({ ...uploadForm, type: e.target.value })}
                            >
                                <option value="">Auto</option>
                                <option value="car">Coche</option>
                                <option value="track">Circuito</option>
                                <option value="skin">Skin</option>
                                <option value="app">App</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-400">Versión</label>
                            <input
                                type="text"
                                placeholder="Auto v1.0"
                                className="w-full bg-gray-900 border border-gray-700 p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-white placeholder-gray-600"
                                value={uploadForm.version}
                                onChange={e => setUploadForm({ ...uploadForm, version: e.target.value })}
                            />
                        </div>
                    </div>

                    {uploadMode === 'file' ? (
                        <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer relative mb-6">
                            <input
                                type="file"
                                accept=".zip,.rar,.7z"
                                onChange={handleFileChange}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                            <div className="flex flex-col items-center justify-center text-gray-500">
                                <UploadCloud size={32} className="mb-2 text-gray-400" />
                                <p className="font-medium text-gray-700">{uploadForm.file ? uploadForm.file.name : "Arrastra un archivo ZIP/RAR aquí"}</p>
                                <p className="text-xs text-blue-500 mt-2 font-medium">Soporta .zip y .rar</p>
                            </div>
                        </div>
                    ) : (
                        <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer relative mb-6">
                            <input
                                type="file"
                                // @ts-ignore
                                webkitdirectory="true"
                                directory=""
                                multiple
                                onChange={handleFolderSelect}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                            <div className="flex flex-col items-center justify-center text-gray-500">
                                <HardDrive size={32} className="mb-2 text-gray-400" />
                                <p className="font-medium text-gray-700">
                                    {uploadForm.file ? (
                                        <span className="text-green-600 font-bold">{uploadForm.file.name} (Listo para subir)</span>
                                    ) : (
                                        "Seleccionar Carpeta del Mod"
                                    )}
                                </p>
                                {isUploading && uploadForm.file && <p className="text-xs text-green-500">Comprimido correctamente</p>}
                                {!uploadForm.file && <p className="text-xs text-gray-400 mt-1">Se comprimirá automáticamente en el navegador</p>}
                            </div>
                        </div>
                    )}

                    {uploadStatus && (
                        <div className="text-sm text-center font-bold text-blue-600 mb-4 animate-pulse">
                            {uploadStatus} {uploadProgress > 0 && `(${uploadProgress.toFixed(0)}%)`}
                        </div>
                    )}

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

            <div className="bg-gray-800 shadow-xl rounded-xl overflow-hidden border border-gray-700">
                <table className="min-w-full text-left">
                    <thead className="bg-gray-900 border-b border-gray-700">
                        <tr>
                            <th className="px-6 py-4 w-12">
                                <button onClick={selectAll} className="text-gray-400 hover:text-gray-600">
                                    {filteredMods && selectedMods.length > 0 && selectedMods.length === filteredMods.length ?
                                        <CheckSquare size={20} className="text-blue-600" /> : <Square size={20} />}
                                </button>
                            </th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Tipo</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Nombre del Recurso</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Versión</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Estado</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {filteredMods?.map((mod) => (
                            <tr
                                key={mod.id}
                                className={cn(
                                    "hover:bg-gray-700/50 transition-colors group border-b border-gray-700/50 last:border-0",
                                    !mod.is_active && "opacity-60 bg-gray-900/50",
                                    selectedMods.includes(mod.id) && "bg-blue-900/20"
                                )}
                            >
                                <td className="px-6 py-4">
                                    <button onClick={() => toggleSelection(mod.id)} className="text-gray-500 hover:text-blue-400 transition-colors">
                                        {selectedMods.includes(mod.id) ?
                                            <CheckSquare size={20} className="text-blue-500" /> : <Square size={20} />}
                                    </button>
                                </td>
                                <td className="px-6 py-4" onClick={() => setSelectedModId(mod.id)}>
                                    <span className={cn(
                                        "px-2.5 py-1 rounded-md text-xs font-bold uppercase inline-flex items-center cursor-pointer",
                                        mod.type === 'car' ? "bg-red-100 text-red-700 ring-1 ring-red-200" :
                                            mod.type === 'track' ? "bg-slate-100 text-slate-700 ring-1 ring-slate-200" :
                                                "bg-gray-100 text-gray-700"
                                    )}>
                                        {mod.type === 'car' && <Car size={14} className="mr-1.5" />}
                                        {mod.type === 'track' && <Flag size={14} className="mr-1.5" />}
                                        {mod.type}
                                    </span>
                                </td>
                                <td className="px-6 py-4 font-medium text-white cursor-pointer" onClick={() => setSelectedModId(mod.id)}>
                                    <div className="flex items-center">
                                        <div className={cn(
                                            "w-8 h-8 rounded-lg flex items-center justify-center mr-3",
                                            mod.type === 'car' ? "bg-red-500/10 text-red-500" :
                                                mod.type === 'track' ? "bg-slate-700 text-slate-300" : "bg-gray-700 text-gray-400"
                                        )}>
                                            {mod.type === 'car' ? <Car size={18} /> :
                                                mod.type === 'track' ? <Flag size={18} /> : <FileBox size={18} />}
                                        </div>
                                        <div className="flex flex-col">
                                            <div className="flex items-center">
                                                <span className="text-base group-hover:text-blue-600 transition-colors mr-2">{mod.name}</span>
                                                {mod.tags && mod.tags.map(tag => (
                                                    <span key={tag.id} className="text-[10px] px-1.5 rounded-sm bg-blue-100 text-blue-700 font-bold mr-1">
                                                        {tag.name}
                                                    </span>
                                                ))}
                                            </div>
                                            {!mod.is_active && <span className="text-[10px] text-red-500 font-bold uppercase">Desactivado</span>}
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-gray-500 font-mono text-sm" onClick={() => setSelectedModId(mod.id)}>{mod.version}</td>
                                <td className="px-6 py-4" onClick={() => setSelectedModId(mod.id)}>
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
                                <td className="px-6 py-4 text-right">
                                    <div className="flex items-center justify-end space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setSelectedModId(mod.id); }}
                                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                            title="Ver Detalles"
                                        >
                                            <Eye size={18} />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); toggleMutation.mutate(mod.id); }}
                                            className={cn(
                                                "p-2 rounded-lg transition-colors",
                                                mod.is_active ? "text-green-500 hover:text-green-700 hover:bg-green-50" : "text-gray-400 hover:text-green-600 hover:bg-green-50"
                                            )}
                                            title={mod.is_active ? "Desactivar" : "Activar"}
                                        >
                                            <Power size={18} />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDelete(mod.id, mod.name); }}
                                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                            title="Borrar Permanentemente"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {filteredMods?.length === 0 && (
                            <tr>
                                <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                                    <Car size={48} className="mx-auto text-gray-200 mb-3" />
                                    No hay contenido que coincida con tu búsqueda.
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
                                            src={`http://${window.location.hostname}:8000${selectedMod?.type === 'track' && metadata?.map_url ? metadata.map_url : metadata?.image_url}`}
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
                                    <div className="absolute top-4 right-4 flex space-x-2">
                                        <button
                                            onClick={() => handleDelete(selectedModId, selectedMod?.name || 'Mod')}
                                            className="bg-red-600/80 hover:bg-red-600 text-white p-2 rounded-full transition-colors backdrop-blur-md"
                                            title="Borrar Mod"
                                        >
                                            <Trash2 size={20} />
                                        </button>
                                        <button
                                            onClick={() => setSelectedModId(null)}
                                            className="bg-black/40 hover:bg-black/60 text-white p-2 rounded-full transition-colors backdrop-blur-md"
                                        >
                                            <X size={20} />
                                        </button>
                                    </div>
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
                                                    src={`http://${window.location.hostname}:8000${metadata.outline_url}`}
                                                    className="w-full h-auto max-h-48 object-contain opacity-80 invert"
                                                    alt="Track Outline"
                                                />
                                            </div>
                                        )}
                                    </div>

                                    <div className="space-y-6">

                                        {/* TAGS SECTION */}
                                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                                            <h3 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-3 mb-4 flex items-center justify-between">
                                                <span>Etiquetas</span>
                                                <button onClick={() => setIsAddingTag(!isAddingTag)} className="text-blue-600 hover:text-blue-800"><Plus size={16} /></button>
                                            </h3>

                                            <div className="flex flex-wrap gap-2 mb-4">
                                                {selectedMod?.tags && selectedMod.tags.length > 0 ? (
                                                    selectedMod.tags.map(tag => (
                                                        <span key={tag.id} className="inline-flex items-center px-2 py-1 rounded bg-blue-50 text-blue-700 text-xs font-semibold border border-blue-100">
                                                            {tag.name}
                                                            <button
                                                                onClick={() => removeTagMutation.mutate({ modId: selectedMod.id, tagId: tag.id })}
                                                                className="ml-1.5 hover:text-red-500"
                                                            >
                                                                <X size={12} />
                                                            </button>
                                                        </span>
                                                    ))
                                                ) : (
                                                    <span className="text-xs text-gray-400 italic">Sin etiquetas</span>
                                                )}
                                            </div>

                                            {isAddingTag && (
                                                <div className="space-y-3 bg-gray-50 p-3 rounded-lg border border-gray-100">
                                                    <div>
                                                        <input
                                                            type="text"
                                                            placeholder="Nueva etiqueta..."
                                                            className="w-full text-xs p-1.5 border rounded mb-2"
                                                            value={newTagName}
                                                            onChange={(e) => setNewTagName(e.target.value)}
                                                            onKeyDown={(e) => { if (e.key === 'Enter') handleCreateTag(); }}
                                                        />
                                                        {newTagName && (
                                                            <button
                                                                onClick={handleCreateTag}
                                                                className="w-full bg-blue-600 text-white text-xs py-1 rounded mb-2"
                                                            >
                                                                Crear "{newTagName}"
                                                            </button>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <div className="text-xs font-bold text-gray-500 mb-2">Existentes:</div>
                                                        <div className="max-h-24 overflow-y-auto space-y-1">
                                                            {tags?.filter(t => !selectedMod?.tags.some(mt => mt.id === t.id)).map(tag => (
                                                                <button
                                                                    key={tag.id}
                                                                    onClick={() => addTagMutation.mutate({ modId: selectedMod!.id, tagId: tag.id })}
                                                                    className="flex items-center w-full text-xs text-left px-2 py-1 hover:bg-blue-100 rounded text-gray-700"
                                                                >
                                                                    <TagIcon size={12} className="mr-1.5 opacity-50" />
                                                                    {tag.name}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

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

                                                {(selectedMod?.size_bytes || 0) > 0 && (
                                                    <div className="flex items-center justify-between mt-2">
                                                        <span className="text-xs text-gray-400">Tamaño en Disco</span>
                                                        <span className="text-xs font-mono text-gray-600">
                                                            {((selectedMod?.size_bytes || 0) / (1024 * 1024)).toFixed(2)} MB
                                                        </span>
                                                    </div>
                                                )}
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
