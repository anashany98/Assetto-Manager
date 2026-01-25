import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Trash2, RotateCw, Square, Circle, Copy, ZoomIn, ZoomOut, Grid, Move } from 'lucide-react';
import { cn } from '../../lib/utils';
import { getTables, updateLayout } from '../../api/tables';
import type { RestaurantTable } from '../../api/tables';
export default function FloorPlanEditor() {
    const queryClient = useQueryClient();
    const canvasRef = useRef<HTMLDivElement>(null);
    const [tables, setTables] = useState<RestaurantTable[]>([]);
    const [selectedTableId, setSelectedTableId] = useState<number | null>(null);

    // Interaction States
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [snapToGrid, setSnapToGrid] = useState(false);

    // Transform State (Zoom/Pan)
    const [scale, setScale] = useState(1);
    const [translate, setTranslate] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const [panStart, setPanStart] = useState({ x: 0, y: 0 });

    const gridSize = 20;

    const { data: serverTables } = useQuery({
        queryKey: ['tables'],
        queryFn: getTables,
    });

    useEffect(() => {
        if (serverTables) {
            setTables(serverTables);
        }
    }, [serverTables]);

    const saveMutation = useMutation({
        mutationFn: updateLayout,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tables'] });
        }
    });

    const handleMouseDown = (e: React.MouseEvent, tableId: number) => {
        e.stopPropagation(); // Prevent panning
        setSelectedTableId(tableId);
        setIsDragging(true);
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();

        // Calculate offset relative to visual element, independent of scale
        setDragOffset({
            x: (e.clientX - rect.left) / scale,
            y: (e.clientY - rect.top) / scale
        });
    };

    const handleCanvasMouseDown = (e: React.MouseEvent) => {
        if (e.button === 1 || e.shiftKey) { // Middle click or Shift+Left for Pan
            e.preventDefault();
            setIsPanning(true);
            setPanStart({ x: e.clientX - translate.x, y: e.clientY - translate.y });
        } else {
            // Deselect if clicking empty space
            setSelectedTableId(null);
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isPanning) {
            setTranslate({
                x: e.clientX - panStart.x,
                y: e.clientY - panStart.y
            });
            return;
        }

        if (!isDragging || selectedTableId === null || !canvasRef.current) return;

        const canvasRect = canvasRef.current.getBoundingClientRect();

        // Calculate raw position relative to canvas origin, accounting for scale
        let rawX = (e.clientX - canvasRect.left) / scale - dragOffset.x;
        let rawY = (e.clientY - canvasRect.top) / scale - dragOffset.y;

        if (snapToGrid) {
            rawX = Math.round(rawX / gridSize) * gridSize;
            rawY = Math.round(rawY / gridSize) * gridSize;
        }

        setTables(prev => prev.map(t =>
            t.id === selectedTableId ? { ...t, x: rawX, y: rawY } : t
        ));
    };

    const handleMouseUp = () => {
        setIsDragging(false);
        setIsPanning(false);
    };

    const handleWheel = (e: React.WheelEvent) => {
        if (e.ctrlKey) {
            e.preventDefault();
            const delta = -Math.sign(e.deltaY) * 0.1;
            setScale(s => Math.min(Math.max(0.5, s + delta), 3));
        }
    };

    const addTable = (shape: 'rect' | 'circle') => {
        const newTable: RestaurantTable = {
            id: Date.now(),
            label: `T${tables.length + 1}`,
            x: 50,
            y: 50,
            width: shape === 'rect' ? 80 : 60,
            height: shape === 'rect' ? 50 : 60,
            shape,
            seats: 4,
            rotation: 0,
            zone: 'main',
            status: 'free',
            is_active: true
        };
        setTables([...tables, newTable]);
        setSelectedTableId(newTable.id);
    };

    const updateSelectedTable = (updates: Partial<RestaurantTable>) => {
        if (selectedTableId === null) return;
        setTables(prev => prev.map(t =>
            t.id === selectedTableId ? { ...t, ...updates } : t
        ));
    };

    const deleteSelectedTable = () => {
        if (selectedTableId === null) return;
        setTables(prev => prev.filter(t => t.id !== selectedTableId));
        setSelectedTableId(null);
    };

    const duplicateSelectedTable = () => {
        if (selectedTableId === null || !selectedTable) return;
        const newTable: RestaurantTable = {
            ...selectedTable,
            id: Date.now(),
            label: `${selectedTable.label}-cp`,
            x: selectedTable.x + 20,
            y: selectedTable.y + 20,
        };
        setTables([...tables, newTable]);
        setSelectedTableId(newTable.id);
    };

    const selectedTable = tables.find(t => t.id === selectedTableId);

    return (
        <div className="flex h-full" onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}>
            {/* Sidebar Controls */}
            <div className="w-72 bg-gray-900 border-r border-gray-800 p-4 space-y-6 flex flex-col overflow-y-auto z-20 shadow-xl">
                <div>
                    <h3 className="text-xs font-bold text-gray-500 uppercase mb-3">Herramientas</h3>
                    <div className="grid grid-cols-2 gap-2 mb-4">
                        <button onClick={() => addTable('rect')} className="p-3 bg-gray-800 hover:bg-gray-700 rounded-lg flex flex-col items-center gap-2 transition-colors">
                            <Square size={20} className="text-blue-400" />
                            <span className="text-xs font-bold text-gray-300">Rectangular</span>
                        </button>
                        <button onClick={() => addTable('circle')} className="p-3 bg-gray-800 hover:bg-gray-700 rounded-lg flex flex-col items-center gap-2 transition-colors">
                            <Circle size={20} className="text-green-400" />
                            <span className="text-xs font-bold text-gray-300">Redonda</span>
                        </button>
                    </div>

                    <div className="flex items-center justify-between bg-gray-800 p-2 rounded-lg">
                        <div className="flex items-center gap-2 text-gray-300 text-sm">
                            <Grid size={16} /> Snap Grid
                        </div>
                        <button
                            onClick={() => setSnapToGrid(!snapToGrid)}
                            className={cn(
                                "w-10 h-5 rounded-full relative transition-colors",
                                snapToGrid ? "bg-amber-500" : "bg-gray-600"
                            )}
                        >
                            <div className={cn(
                                "absolute top-1 w-3 h-3 bg-white rounded-full transition-all",
                                snapToGrid ? "left-6" : "left-1"
                            )} />
                        </button>
                    </div>
                </div>

                <div className="flex-1">
                    {selectedTable ? (
                        <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
                            <h3 className="text-xs font-bold text-gray-500 uppercase pb-2 border-b border-gray-800">
                                Editando {selectedTable.label}
                            </h3>

                            <div className="space-y-3">
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">Nombre</label>
                                    <input
                                        value={selectedTable.label}
                                        onChange={(e) => updateSelectedTable({ label: e.target.value })}
                                        className="w-full bg-gray-800 border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-amber-500 outline-none"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-xs text-gray-400 block mb-1">Ancho</label>
                                        <input
                                            type="number"
                                            value={selectedTable.width}
                                            onChange={(e) => updateSelectedTable({ width: Number(e.target.value) })}
                                            className="w-full bg-gray-800 border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-amber-500 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-400 block mb-1">Alto</label>
                                        <input
                                            type="number"
                                            value={selectedTable.height}
                                            onChange={(e) => updateSelectedTable({ height: Number(e.target.value) })}
                                            className="w-full bg-gray-800 border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-amber-500 outline-none"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-xs text-gray-400 block mb-1">Asientos</label>
                                        <input
                                            type="number"
                                            value={selectedTable.seats}
                                            onChange={(e) => updateSelectedTable({ seats: Number(e.target.value) })}
                                            className="w-full bg-gray-800 border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-amber-500 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-400 block mb-1">Zona</label>
                                        <select
                                            value={selectedTable.zone || 'main'}
                                            onChange={(e) => updateSelectedTable({ zone: e.target.value })}
                                            className="w-full bg-gray-800 border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-amber-500 outline-none appearance-none"
                                        >
                                            <option value="main">Interior</option>
                                            <option value="terrace">Exterior</option>
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">Notas Fijas</label>
                                    <input
                                        value={selectedTable.fixed_notes || ''}
                                        onChange={(e) => updateSelectedTable({ fixed_notes: e.target.value })}
                                        placeholder="ej. Ventana"
                                        className="w-full bg-gray-800 border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-amber-500 outline-none"
                                    />
                                </div>
                            </div>

                            <div className="pt-4 flex gap-2 flex-wrap">
                                <button
                                    onClick={() => updateSelectedTable({ rotation: (selectedTable.rotation + 45) % 360 })}
                                    className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded flex items-center justify-center gap-2"
                                    title="Rotar 45°"
                                >
                                    <RotateCw size={14} />
                                </button>
                                <button
                                    onClick={duplicateSelectedTable}
                                    className="flex-1 py-2 bg-blue-900/30 hover:bg-blue-900/50 text-blue-400 border border-blue-900/50 rounded flex items-center justify-center gap-2"
                                    title="Duplicar"
                                >
                                    <Copy size={14} />
                                </button>
                                <button
                                    onClick={deleteSelectedTable}
                                    className="flex-1 py-2 bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-900/50 rounded flex items-center justify-center gap-2"
                                    title="Borrar"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="text-sm text-gray-600 italic text-center mt-10">
                            Selecciona una mesa para editar
                        </div>
                    )}
                </div>

                <div className="pt-4 border-t border-gray-800">
                    <button
                        onClick={() => saveMutation.mutate(tables)}
                        disabled={saveMutation.isPending}
                        className="w-full py-3 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                    >
                        <Save size={18} />
                        {saveMutation.isPending ? 'Guardando...' : 'Guardar Plano'}
                    </button>
                </div>
            </div>

            {/* Canvas Container with Zoom/Pan */}
            <div
                className="flex-1 bg-gray-950 relative overflow-hidden flex items-center justify-center cursor-crosshair"
                onMouseDown={handleCanvasMouseDown}
                onWheel={handleWheel}
            >
                {/* Canvas Controls Overlay */}
                <div className="absolute top-4 right-4 flex flex-col gap-2 z-30 bg-gray-900/80 p-2 rounded-lg backdrop-blur border border-gray-700">
                    <button onClick={() => setScale(s => Math.min(s + 0.1, 3))} className="p-2 hover:bg-gray-700 rounded text-gray-300">
                        <ZoomIn size={20} />
                    </button>
                    <div className="text-xs text-center text-gray-500 font-mono">{Math.round(scale * 100)}%</div>
                    <button onClick={() => setScale(s => Math.max(s - 0.1, 0.5))} className="p-2 hover:bg-gray-700 rounded text-gray-300">
                        <ZoomOut size={20} />
                    </button>
                    <button onClick={() => { setScale(1); setTranslate({ x: 0, y: 0 }); }} className="p-2 hover:bg-gray-700 rounded text-gray-300 border-t border-gray-700 mt-1">
                        <Move size={20} />
                    </button>
                </div>

                {/* Transform Wrapper */}
                <div
                    style={{
                        transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
                        transformOrigin: 'center',
                        transition: isPanning || isDragging ? 'none' : 'transform 0.1s ease-out'
                    }}
                    className="relative"
                >
                    {/* Reference Grid */}
                    <div
                        ref={canvasRef}
                        className="bg-gray-900 relative shadow-2xl border border-gray-800"
                        style={{
                            width: '1200px', // Larger canvas
                            height: '800px',
                            backgroundImage: snapToGrid
                                ? `linear-gradient(to right, #333 1px, transparent 1px), linear-gradient(to bottom, #333 1px, transparent 1px)`
                                : `radial-gradient(circle, #374151 1px, transparent 1px)`,
                            backgroundSize: `${gridSize}px ${gridSize}px`
                        }}
                    >
                        {tables.map(table => (
                            <div
                                key={table.id}
                                onMouseDown={(e) => handleMouseDown(e, table.id)}
                                style={{
                                    position: 'absolute',
                                    left: table.x,
                                    top: table.y,
                                    width: table.width,
                                    height: table.height,
                                    transform: `rotate(${table.rotation}deg)`,
                                    borderRadius: table.shape === 'circle' ? '50%' : '8px',
                                }}
                                className={cn(
                                    "cursor-move flex items-center justify-center border-2 transition-colors group select-none relative",
                                    selectedTableId === table.id
                                        ? "bg-amber-500/20 border-amber-500 z-10 shadow-[0_0_15px_rgba(245,158,11,0.5)]"
                                        : [
                                            table.zone === 'vip' ? "bg-amber-900/20 border-amber-800" :
                                                table.zone === 'terrace' ? "bg-green-900/20 border-green-800" :
                                                    "bg-gray-800/50 border-gray-700 hover:border-gray-500"
                                        ]
                                )}
                            >
                                <span className={cn(
                                    "text-xs font-bold pointer-events-none truncate px-1",
                                    selectedTableId === table.id ? "text-amber-500" : "text-gray-400"
                                )}>
                                    {table.label}
                                </span>
                                {table.fixed_notes && selectedTableId === table.id && (
                                    <div className="absolute -bottom-6 bg-black/80 text-[10px] px-2 py-1 rounded text-white whitespace-nowrap z-20 pointer-events-none">
                                        {table.fixed_notes}
                                    </div>
                                )}

                                {/* Seats Indicators - simplified visualization */}
                                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-4 h-[2px] bg-gray-500/50" />
                                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-[2px] bg-gray-500/50" />
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Help Note */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur px-4 py-1 rounded-full text-xs text-gray-400 pointer-events-none">
                Scroll para Zoom • Shift+Drag o Click Central para mover plano
            </div>
        </div>
    );
}
