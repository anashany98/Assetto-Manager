import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import {
    AlertTriangle,
    Car,
    Check,
    Clock,
    Edit,
    Flag,
    Plus,
    RotateCcw,
    Save,
    Search,
    Trash2,
    X,
} from 'lucide-react';
import { createScenario, deleteScenario, getScenarios, updateScenario } from '../api/scenarios';
import type { Scenario } from '../api/scenarios';
import { getAllGlobalCars, getAllGlobalTracks } from '../api/content';

type FeedbackType = 'success' | 'error';

type FeedbackState = {
    type: FeedbackType;
    message: string;
} | null;

type ScenarioDraft = {
    name: string;
    description: string;
    session_type: string;
    allowed_cars: string[];
    allowed_tracks: string[];
    allowed_durations: number[];
    is_active: boolean;
    created_at?: string;
    updated_at?: string;
};

type ValidationErrors = {
    name?: string;
    allowed_durations?: string;
};

type ContentItem = {
    id: string | number;
    name?: string;
};

const DURATION_OPTIONS = [5, 10, 15, 20, 30, 45, 60];

const SESSION_MODES: Array<{ id: string; label: string; color: string }> = [
    { id: 'practice', label: 'PRACTICA', color: 'bg-emerald-600' },
    { id: 'race', label: 'CARRERA', color: 'bg-blue-600' },
    { id: 'drift', label: 'DRIFT', color: 'bg-orange-600' },
    { id: 'trackday', label: 'TANDAS', color: 'bg-green-600' },
    { id: 'traffic', label: 'TRAFICO', color: 'bg-yellow-600' },
    { id: 'overtake', label: 'OVERTAKE', color: 'bg-red-600' },
];

const BLANK_DRAFT: ScenarioDraft = {
    name: '',
    description: '',
    session_type: 'practice',
    allowed_cars: [],
    allowed_tracks: [],
    allowed_durations: [10, 15, 20],
    is_active: true,
};

function normalizeText(value: string | undefined | null): string {
    return (value ?? '').trim().replace(/\s+/g, ' ');
}

function uniqueStrings(values: string[] = []): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const raw of values) {
        const value = String(raw ?? '').trim();
        if (!value || seen.has(value)) continue;
        seen.add(value);
        out.push(value);
    }
    return out;
}

function uniqueDurations(values: number[] = []): number[] {
    const normalized = values
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0);
    return Array.from(new Set(normalized)).sort((a, b) => a - b);
}

function normalizeDraft(input: Partial<Scenario> | ScenarioDraft): ScenarioDraft {
    const normalizedDurations = uniqueDurations(input.allowed_durations || BLANK_DRAFT.allowed_durations);
    return {
        name: normalizeText(input.name),
        description: normalizeText(input.description),
        session_type: normalizeText(input.session_type || 'practice').toLowerCase() || 'practice',
        allowed_cars: uniqueStrings(input.allowed_cars || []),
        allowed_tracks: uniqueStrings(input.allowed_tracks || []),
        allowed_durations: normalizedDurations.length > 0 ? normalizedDurations : [...BLANK_DRAFT.allowed_durations],
        is_active: input.is_active ?? true,
        created_at: input.created_at,
        updated_at: input.updated_at,
    };
}

function arraysEqual(a: string[] | number[], b: string[] | number[]): boolean {
    if (a.length !== b.length) return false;
    return a.every((value, index) => value === b[index]);
}

function areDraftsEqual(a: ScenarioDraft, b: ScenarioDraft): boolean {
    return (
        a.name === b.name &&
        a.description === b.description &&
        a.session_type === b.session_type &&
        a.is_active === b.is_active &&
        arraysEqual(a.allowed_cars, b.allowed_cars) &&
        arraysEqual(a.allowed_tracks, b.allowed_tracks) &&
        arraysEqual(a.allowed_durations, b.allowed_durations)
    );
}

function validateDraft(draft: ScenarioDraft): ValidationErrors {
    const errors: ValidationErrors = {};
    if (!draft.name) {
        errors.name = 'El nombre es obligatorio.';
    } else if (draft.name.length > 100) {
        errors.name = 'El nombre no puede superar 100 caracteres.';
    }

    if (!draft.allowed_durations.length) {
        errors.allowed_durations = 'Selecciona al menos una duracion.';
    }
    return errors;
}

function draftToPayload(draft: ScenarioDraft): Scenario {
    return {
        name: draft.name,
        description: draft.description || undefined,
        session_type: draft.session_type,
        allowed_cars: draft.allowed_cars,
        allowed_tracks: draft.allowed_tracks,
        allowed_durations: draft.allowed_durations,
        is_active: draft.is_active,
    };
}

function apiErrorMessage(error: unknown): string {
    if (axios.isAxiosError(error)) {
        const detail = error.response?.data?.detail;
        if (typeof detail === 'string' && detail.trim()) {
            return detail;
        }
        if (detail && typeof detail === 'object') {
            const maybeMessage = (detail as { message?: string }).message;
            if (typeof maybeMessage === 'string' && maybeMessage.trim()) {
                return maybeMessage;
            }
        }
        const status = error.response?.status;
        if (status === 409) return 'Conflicto de actualizacion. Recarga los escenarios y vuelve a intentar.';
        return error.message || 'No se pudo completar la operacion.';
    }
    if (error instanceof Error) return error.message;
    return 'No se pudo completar la operacion.';
}

export default function ScenariosManager() {
    const queryClient = useQueryClient();
    const [editingId, setEditingId] = useState<number | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [formData, setFormData] = useState<ScenarioDraft>(normalizeDraft(BLANK_DRAFT));
    const [initialDraft, setInitialDraft] = useState<ScenarioDraft>(normalizeDraft(BLANK_DRAFT));
    const [feedback, setFeedback] = useState<FeedbackState>(null);

    const [carSearch, setCarSearch] = useState('');
    const [trackSearch, setTrackSearch] = useState('');
    const [showSelectedCarsOnly, setShowSelectedCarsOnly] = useState(false);
    const [showSelectedTracksOnly, setShowSelectedTracksOnly] = useState(false);
    const [carsRenderLimit, setCarsRenderLimit] = useState(120);
    const [tracksRenderLimit, setTracksRenderLimit] = useState(120);

    const [deleteTarget, setDeleteTarget] = useState<Scenario | null>(null);
    const [deleteNameInput, setDeleteNameInput] = useState('');

    const [undoDeletedScenario, setUndoDeletedScenario] = useState<Scenario | null>(null);
    const [undoExpiresAt, setUndoExpiresAt] = useState<number | null>(null);
    const [, setUndoTick] = useState(0);

    const isEditorOpen = isCreating || editingId !== null;
    const validationErrors = useMemo(() => validateDraft(formData), [formData]);
    const isFormValid = useMemo(() => Object.keys(validationErrors).length === 0, [validationErrors]);
    const isDirty = useMemo(
        () => (isEditorOpen ? !areDraftsEqual(formData, initialDraft) : false),
        [formData, initialDraft, isEditorOpen]
    );

    useEffect(() => {
        if (!isDirty) return;
        const handler = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [isDirty]);

    useEffect(() => {
        if (!undoDeletedScenario || !undoExpiresAt) return;
        const interval = window.setInterval(() => {
            setUndoTick((value) => value + 1);
            if (Date.now() >= undoExpiresAt) {
                setUndoDeletedScenario(null);
                setUndoExpiresAt(null);
            }
        }, 1000);
        return () => window.clearInterval(interval);
    }, [undoDeletedScenario, undoExpiresAt]);

    const undoSecondsLeft = undoExpiresAt ? Math.max(0, Math.ceil((undoExpiresAt - Date.now()) / 1000)) : 0;

    const { data: scenarios = [], isLoading } = useQuery({
        queryKey: ['scenarios'],
        queryFn: getScenarios,
    });

    const { data: allCars = [] } = useQuery({
        queryKey: ['cars', 'global'],
        queryFn: getAllGlobalCars,
        staleTime: 60_000,
    });
    const { data: allTracks = [] } = useQuery({
        queryKey: ['tracks', 'global'],
        queryFn: getAllGlobalTracks,
        staleTime: 60_000,
    });

    const createMutation = useMutation({
        mutationFn: createScenario,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['scenarios'] });
            setFeedback({ type: 'success', message: 'Escenario creado correctamente.' });
            setEditingId(null);
            setIsCreating(false);
            const blank = normalizeDraft(BLANK_DRAFT);
            setFormData(blank);
            setInitialDraft(blank);
        },
        onError: (error) => {
            setFeedback({ type: 'error', message: apiErrorMessage(error) });
        },
    });

    const updateMutation = useMutation({
        mutationFn: (data: { id: number; scenario: Partial<Scenario> }) => updateScenario(data.id, data.scenario),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['scenarios'] });
            setFeedback({ type: 'success', message: 'Escenario actualizado correctamente.' });
            setEditingId(null);
            setIsCreating(false);
            const blank = normalizeDraft(BLANK_DRAFT);
            setFormData(blank);
            setInitialDraft(blank);
        },
        onError: (error) => {
            setFeedback({ type: 'error', message: apiErrorMessage(error) });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (payload: { id: number; confirmName: string }) => deleteScenario(payload.id, payload.confirmName),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['scenarios'] });
            setDeleteTarget(null);
            setDeleteNameInput('');
            setFeedback({ type: 'success', message: 'Escenario eliminado.' });
            if (data.deleted) {
                setUndoDeletedScenario(data.deleted);
                setUndoExpiresAt(Date.now() + 10_000);
            }
        },
        onError: (error) => {
            setFeedback({ type: 'error', message: apiErrorMessage(error) });
        },
    });

    const restoreMutation = useMutation({
        mutationFn: (scenario: Scenario) => createScenario(draftToPayload(normalizeDraft(scenario))),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['scenarios'] });
            setUndoDeletedScenario(null);
            setUndoExpiresAt(null);
            setFeedback({ type: 'success', message: 'Escenario restaurado.' });
        },
        onError: (error) => {
            setFeedback({ type: 'error', message: apiErrorMessage(error) });
        },
    });

    const confirmDiscardEditorChanges = () => {
        if (!isDirty) return true;
        return window.confirm('Hay cambios sin guardar. Deseas descartarlos?');
    };

    const resetEditorContext = () => {
        const blank = normalizeDraft(BLANK_DRAFT);
        setFormData(blank);
        setInitialDraft(blank);
        setCarSearch('');
        setTrackSearch('');
        setShowSelectedCarsOnly(false);
        setShowSelectedTracksOnly(false);
        setCarsRenderLimit(120);
        setTracksRenderLimit(120);
    };

    const openCreate = () => {
        if (!confirmDiscardEditorChanges()) return;
        setFeedback(null);
        setIsCreating(true);
        setEditingId(null);
        resetEditorContext();
    };

    const handleEdit = (scenario: Scenario) => {
        if (!confirmDiscardEditorChanges()) return;
        setFeedback(null);
        const draft = normalizeDraft(scenario);
        setEditingId(scenario.id ?? null);
        setIsCreating(false);
        setFormData(draft);
        setInitialDraft(draft);
        setCarSearch('');
        setTrackSearch('');
        setShowSelectedCarsOnly(false);
        setShowSelectedTracksOnly(false);
        setCarsRenderLimit(120);
        setTracksRenderLimit(120);
    };

    const closeEditor = () => {
        if (!confirmDiscardEditorChanges()) return;
        setIsCreating(false);
        setEditingId(null);
        resetEditorContext();
    };

    const toggleSelection = (list: string[], item: string) => {
        if (list.includes(item)) {
            return list.filter((value) => value !== item);
        }
        return [...list, item];
    };

    const toggleDuration = (minutes: number) => {
        if (formData.allowed_durations.includes(minutes)) {
            return formData.allowed_durations.filter((value) => value !== minutes);
        }
        return [...formData.allowed_durations, minutes].sort((a, b) => a - b);
    };

    const handleSave = () => {
        const normalized = normalizeDraft(formData);
        setFormData(normalized);
        if (!isFormValid) {
            setFeedback({ type: 'error', message: 'Revisa los campos marcados antes de guardar.' });
            return;
        }

        const payload = draftToPayload(normalized);
        if (isCreating) {
            createMutation.mutate(payload);
            return;
        }

        if (editingId) {
            updateMutation.mutate({
                id: editingId,
                scenario: {
                    ...payload,
                    expected_updated_at: normalized.updated_at || normalized.created_at,
                },
            });
        }
    };

    const selectedCars = useMemo(() => new Set(formData.allowed_cars), [formData.allowed_cars]);
    const selectedTracks = useMemo(() => new Set(formData.allowed_tracks), [formData.allowed_tracks]);

    const filteredCars = useMemo(() => {
        const search = carSearch.trim().toLowerCase();
        return (allCars as ContentItem[]).filter((item) => {
            const id = String(item.id);
            const name = (item.name || id).toLowerCase();
            const matchesSearch = !search || name.includes(search) || id.toLowerCase().includes(search);
            const matchesSelected = !showSelectedCarsOnly || selectedCars.has(id);
            return matchesSearch && matchesSelected;
        });
    }, [allCars, carSearch, selectedCars, showSelectedCarsOnly]);

    const filteredTracks = useMemo(() => {
        const search = trackSearch.trim().toLowerCase();
        return (allTracks as ContentItem[]).filter((item) => {
            const id = String(item.id);
            const name = (item.name || id).toLowerCase();
            const matchesSearch = !search || name.includes(search) || id.toLowerCase().includes(search);
            const matchesSelected = !showSelectedTracksOnly || selectedTracks.has(id);
            return matchesSearch && matchesSelected;
        });
    }, [allTracks, trackSearch, selectedTracks, showSelectedTracksOnly]);

    useEffect(() => setCarsRenderLimit(120), [carSearch, showSelectedCarsOnly]);
    useEffect(() => setTracksRenderLimit(120), [trackSearch, showSelectedTracksOnly]);

    const visibleCars = filteredCars.slice(0, carsRenderLimit);
    const visibleTracks = filteredTracks.slice(0, tracksRenderLimit);

    const isSaving = createMutation.isPending || updateMutation.isPending;
    const canSave = isFormValid && (isCreating || isDirty) && !isSaving;

    const feedbackClass = feedback?.type === 'success'
        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
        : 'border-red-500/40 bg-red-500/10 text-red-200';

    return (
        <div className="p-8 text-white h-full flex flex-col">
            {undoDeletedScenario && undoSecondsLeft > 0 && (
                <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-blue-500/40 bg-blue-500/10 p-3 text-sm text-blue-100">
                    <span>
                        Escenario "{undoDeletedScenario.name}" eliminado. Puedes deshacer en {undoSecondsLeft}s.
                    </span>
                    <button
                        onClick={() => restoreMutation.mutate(undoDeletedScenario)}
                        disabled={restoreMutation.isPending}
                        className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-60"
                    >
                        <span className="inline-flex items-center gap-1">
                            <RotateCcw size={14} />
                            {restoreMutation.isPending ? 'RESTAURANDO...' : 'DESHACER'}
                        </span>
                    </button>
                </div>
            )}

            <div className="mb-8 flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-black italic">GESTOR DE ESCENARIOS</h1>
                    <p className="text-gray-400">Configura eventos y contenido restringido para el Kiosko</p>
                </div>
                {!isEditorOpen && (
                    <button
                        onClick={openCreate}
                        className="rounded-xl bg-blue-600 px-6 py-3 font-bold text-white transition-all hover:bg-blue-500"
                    >
                        <span className="flex items-center gap-2">
                            <Plus size={20} />
                            NUEVO ESCENARIO
                        </span>
                    </button>
                )}
            </div>

            {feedback && (
                <div className={`mb-5 rounded-xl border px-4 py-3 text-sm font-semibold ${feedbackClass}`}>
                    {feedback.message}
                </div>
            )}

            {isEditorOpen && (
                <div className="mb-8 rounded-2xl border border-gray-700 bg-gray-800 p-6 animate-in slide-in-from-top-4">
                    <div className="mb-6 flex items-center justify-between">
                        <h2 className="flex items-center gap-2 text-xl font-bold text-white">
                            {isCreating ? <Plus className="text-blue-500" /> : <Edit className="text-yellow-500" />}
                            {isCreating ? 'CREAR NUEVO ESCENARIO' : 'EDITAR ESCENARIO'}
                        </h2>
                        <button onClick={closeEditor} className="text-gray-400 hover:text-white" title="Cerrar editor">
                            <X />
                        </button>
                    </div>

                    <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
                        <div className="space-y-6 lg:col-span-1">
                            <div>
                                <label className="mb-1 block text-sm font-bold text-gray-400">NOMBRE</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(event) => setFormData((prev) => ({ ...prev, name: event.target.value }))}
                                    className={`w-full rounded-lg border bg-gray-900 px-4 py-3 text-white outline-none ${validationErrors.name ? 'border-red-500' : 'border-gray-700 focus:border-blue-500'
                                        }`}
                                    placeholder="Ej. Torneo Drift JDM"
                                />
                                {validationErrors.name && (
                                    <p className="mt-1 text-xs font-semibold text-red-400">{validationErrors.name}</p>
                                )}
                            </div>

                            <div>
                                <label className="mb-1 block text-sm font-bold text-gray-400">DESCRIPCION</label>
                                <textarea
                                    value={formData.description}
                                    onChange={(event) => setFormData((prev) => ({ ...prev, description: event.target.value }))}
                                    className="h-32 w-full resize-none rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-white outline-none focus:border-blue-500"
                                    placeholder="Descripcion breve para el usuario..."
                                />
                            </div>

                            <div>
                                <label className="mb-1 block text-sm font-bold text-gray-400">OPCIONES DE TIEMPO (MINUTOS)</label>
                                <div className="flex flex-wrap gap-2">
                                    {DURATION_OPTIONS.map((minutes) => (
                                        <button
                                            key={minutes}
                                            onClick={() =>
                                                setFormData((prev) => ({
                                                    ...prev,
                                                    allowed_durations: toggleDuration(minutes),
                                                }))
                                            }
                                            className={`rounded-lg border px-3 py-2 text-sm font-bold transition-all ${formData.allowed_durations.includes(minutes)
                                                ? 'border-blue-500 bg-blue-600 text-white'
                                                : 'border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-500'
                                                }`}
                                        >
                                            {minutes}m
                                        </button>
                                    ))}
                                </div>
                                {validationErrors.allowed_durations && (
                                    <p className="mt-1 text-xs font-semibold text-red-400">{validationErrors.allowed_durations}</p>
                                )}
                            </div>

                            <div>
                                <label className="mb-1 block text-sm font-bold text-gray-400">MODO DE JUEGO</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {SESSION_MODES.map((mode) => (
                                        <button
                                            key={mode.id}
                                            onClick={() => setFormData((prev) => ({ ...prev, session_type: mode.id }))}
                                            className={`flex items-center justify-center gap-2 rounded-lg border p-3 text-sm font-black transition-all ${formData.session_type === mode.id
                                                ? `${mode.color} scale-[1.02] border-white text-white shadow-lg`
                                                : 'border-gray-700 bg-gray-900 text-gray-500 hover:border-gray-500'
                                                }`}
                                        >
                                            {mode.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-700 bg-gray-900 p-3 transition-colors hover:border-blue-500">
                                    <div className={`h-6 w-10 rounded-full p-1 transition-colors ${formData.is_active ? 'bg-green-500' : 'bg-gray-700'}`}>
                                        <div className={`h-4 w-4 rounded-full bg-white transition-transform ${formData.is_active ? 'translate-x-4' : 'translate-x-0'}`} />
                                    </div>
                                    <span className="text-sm font-bold text-gray-300">ESCENARIO ACTIVO</span>
                                    <input
                                        type="checkbox"
                                        className="hidden"
                                        checked={formData.is_active}
                                        onChange={(event) => setFormData((prev) => ({ ...prev, is_active: event.target.checked }))}
                                    />
                                </label>
                            </div>
                        </div>

                        <div className="flex h-[520px] flex-col rounded-xl border border-gray-700 bg-gray-900/50 p-4 lg:col-span-1">
                            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-gray-400">
                                <Car size={16} /> COCHES PERMITIDOS
                            </h3>
                            <div className="mb-3 flex items-center gap-2">
                                <div className="relative flex-1">
                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                                    <input
                                        value={carSearch}
                                        onChange={(event) => setCarSearch(event.target.value)}
                                        placeholder="Buscar coche..."
                                        className="w-full rounded-lg border border-gray-700 bg-gray-900 py-2 pl-8 pr-3 text-sm text-gray-200 outline-none focus:border-blue-500"
                                    />
                                </div>
                                <button
                                    onClick={() => setShowSelectedCarsOnly((prev) => !prev)}
                                    className={`rounded-lg px-2 py-2 text-xs font-bold ${showSelectedCarsOnly ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                                        }`}
                                >
                                    Seleccionados
                                </button>
                            </div>
                            <div className="custom-scrollbar flex-1 space-y-1 overflow-y-auto pr-2">
                                {visibleCars.map((car) => {
                                    const id = String(car.id);
                                    const selected = selectedCars.has(id);
                                    return (
                                        <div
                                            key={id}
                                            onClick={() =>
                                                setFormData((prev) => ({
                                                    ...prev,
                                                    allowed_cars: toggleSelection(prev.allowed_cars, id),
                                                }))
                                            }
                                            className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition-colors ${selected
                                                ? 'border-blue-600/30 bg-blue-600/20 text-blue-400'
                                                : 'border-transparent text-gray-400 hover:bg-gray-800'
                                                }`}
                                        >
                                            <div className={`flex h-5 w-5 items-center justify-center rounded border ${selected ? 'border-blue-600 bg-blue-600' : 'border-gray-600'}`}>
                                                {selected && <Check size={14} className="text-white" />}
                                            </div>
                                            <span className="truncate font-medium">{car.name || id}</span>
                                        </div>
                                    );
                                })}
                                {!visibleCars.length && (
                                    <p className="px-2 py-6 text-center text-xs text-gray-500">No hay coches que coincidan con el filtro.</p>
                                )}
                            </div>
                            {filteredCars.length > carsRenderLimit && (
                                <button
                                    onClick={() => setCarsRenderLimit((prev) => prev + 120)}
                                    className="mt-3 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-xs font-bold text-gray-300 hover:bg-gray-700"
                                >
                                    Mostrar mas ({filteredCars.length - carsRenderLimit})
                                </button>
                            )}
                            <div className="mt-3 border-t border-gray-700 pt-3">
                                <div className="mb-2 text-xs font-bold uppercase text-gray-500">
                                    {formData.allowed_cars.length} coches seleccionados (0 = todos)
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        onClick={() =>
                                            setFormData((prev) => ({
                                                ...prev,
                                                allowed_cars: uniqueStrings([
                                                    ...prev.allowed_cars,
                                                    ...filteredCars.map((car) => String(car.id)),
                                                ]),
                                            }))
                                        }
                                        className="rounded bg-gray-800 px-2 py-1 text-xs font-bold text-blue-400 hover:bg-gray-700"
                                    >
                                        SELECCIONAR FILTRADOS
                                    </button>
                                    <button
                                        onClick={() => setFormData((prev) => ({ ...prev, allowed_cars: [] }))}
                                        className="rounded bg-gray-800 px-2 py-1 text-xs font-bold text-gray-300 hover:bg-gray-700"
                                    >
                                        LIMPIAR
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="flex h-[520px] flex-col rounded-xl border border-gray-700 bg-gray-900/50 p-4 lg:col-span-1">
                            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-gray-400">
                                <Flag size={16} /> CIRCUITOS PERMITIDOS
                            </h3>
                            <div className="mb-3 flex items-center gap-2">
                                <div className="relative flex-1">
                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                                    <input
                                        value={trackSearch}
                                        onChange={(event) => setTrackSearch(event.target.value)}
                                        placeholder="Buscar circuito..."
                                        className="w-full rounded-lg border border-gray-700 bg-gray-900 py-2 pl-8 pr-3 text-sm text-gray-200 outline-none focus:border-green-500"
                                    />
                                </div>
                                <button
                                    onClick={() => setShowSelectedTracksOnly((prev) => !prev)}
                                    className={`rounded-lg px-2 py-2 text-xs font-bold ${showSelectedTracksOnly ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                                        }`}
                                >
                                    Seleccionados
                                </button>
                            </div>
                            <div className="custom-scrollbar flex-1 space-y-1 overflow-y-auto pr-2">
                                {visibleTracks.map((track) => {
                                    const id = String(track.id);
                                    const selected = selectedTracks.has(id);
                                    return (
                                        <div
                                            key={id}
                                            onClick={() =>
                                                setFormData((prev) => ({
                                                    ...prev,
                                                    allowed_tracks: toggleSelection(prev.allowed_tracks, id),
                                                }))
                                            }
                                            className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition-colors ${selected
                                                ? 'border-green-600/30 bg-green-600/20 text-green-400'
                                                : 'border-transparent text-gray-400 hover:bg-gray-800'
                                                }`}
                                        >
                                            <div className={`flex h-5 w-5 items-center justify-center rounded border ${selected ? 'border-green-600 bg-green-600' : 'border-gray-600'}`}>
                                                {selected && <Check size={14} className="text-white" />}
                                            </div>
                                            <span className="truncate font-medium">{track.name || id}</span>
                                        </div>
                                    );
                                })}
                                {!visibleTracks.length && (
                                    <p className="px-2 py-6 text-center text-xs text-gray-500">No hay circuitos que coincidan con el filtro.</p>
                                )}
                            </div>
                            {filteredTracks.length > tracksRenderLimit && (
                                <button
                                    onClick={() => setTracksRenderLimit((prev) => prev + 120)}
                                    className="mt-3 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-xs font-bold text-gray-300 hover:bg-gray-700"
                                >
                                    Mostrar mas ({filteredTracks.length - tracksRenderLimit})
                                </button>
                            )}
                            <div className="mt-3 border-t border-gray-700 pt-3">
                                <div className="mb-2 text-xs font-bold uppercase text-gray-500">
                                    {formData.allowed_tracks.length} circuitos seleccionados (0 = todos)
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        onClick={() =>
                                            setFormData((prev) => ({
                                                ...prev,
                                                allowed_tracks: uniqueStrings([
                                                    ...prev.allowed_tracks,
                                                    ...filteredTracks.map((track) => String(track.id)),
                                                ]),
                                            }))
                                        }
                                        className="rounded bg-gray-800 px-2 py-1 text-xs font-bold text-green-400 hover:bg-gray-700"
                                    >
                                        SELECCIONAR FILTRADOS
                                    </button>
                                    <button
                                        onClick={() => setFormData((prev) => ({ ...prev, allowed_tracks: [] }))}
                                        className="rounded bg-gray-800 px-2 py-1 text-xs font-bold text-gray-300 hover:bg-gray-700"
                                    >
                                        LIMPIAR
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-4 border-t border-gray-700 pt-6">
                        <button
                            onClick={closeEditor}
                            className="px-6 py-3 font-bold text-gray-400 hover:text-white"
                        >
                            CANCELAR
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={!canSave}
                            className="rounded-xl bg-green-600 px-8 py-3 font-bold text-white shadow-lg shadow-green-600/20 hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <span className="flex items-center gap-2">
                                <Save size={20} />
                                {isSaving ? 'GUARDANDO...' : 'GUARDAR ESCENARIO'}
                            </span>
                        </button>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {isLoading ? (
                    <p className="text-gray-500">Cargando escenarios...</p>
                ) : scenarios.length === 0 ? (
                    <div className="col-span-full rounded-3xl border-2 border-dashed border-gray-800 py-20 text-center text-gray-600">
                        <p className="text-xl font-bold">No hay escenarios creados</p>
                        <p className="text-sm">Crea uno para empezar a personalizar el Kiosko</p>
                    </div>
                ) : (
                    scenarios.map((scenario) => (
                        <div key={scenario.id} className="group rounded-2xl border border-gray-700 bg-gray-800 p-6 transition-all hover:border-blue-500">
                            <div className="mb-4 flex items-start justify-between">
                                <h3 className="text-xl font-black text-white">{scenario.name}</h3>
                                <button
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        updateMutation.mutate({
                                            id: scenario.id!,
                                            scenario: {
                                                is_active: !scenario.is_active,
                                                expected_updated_at: scenario.updated_at || scenario.created_at,
                                            },
                                        });
                                    }}
                                    className={`rounded px-3 py-1 text-xs font-bold transition-colors ${scenario.is_active
                                        ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                                        : 'bg-gray-700 text-gray-500 hover:bg-gray-600'
                                        }`}
                                >
                                    {scenario.is_active ? 'ACTIVO' : 'INACTIVO'}
                                </button>
                            </div>
                            <p className="mb-6 h-10 line-clamp-2 text-sm text-gray-400">{scenario.description || 'Sin descripcion'}</p>

                            <div className="mb-6 space-y-2 text-sm text-gray-500">
                                <div className="flex items-center gap-2">
                                    <Car size={16} />
                                    <span className="font-bold text-gray-300">
                                        {scenario.allowed_cars?.length ? scenario.allowed_cars.length : 'TODOS'}
                                    </span>
                                    Coches
                                </div>
                                <div className="flex items-center gap-2">
                                    <Flag size={16} />
                                    <span className="font-bold text-gray-300">
                                        {scenario.allowed_tracks?.length ? scenario.allowed_tracks.length : 'TODOS'}
                                    </span>
                                    Circuitos
                                </div>
                                <div className="flex items-center gap-2">
                                    <Clock size={16} />
                                    <span className="font-bold text-gray-300">
                                        {scenario.allowed_durations?.join(', ') || 'Default'}
                                    </span>
                                    Min
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <button
                                    onClick={() => handleEdit(scenario)}
                                    className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-gray-700 py-2 font-bold text-white hover:bg-gray-600"
                                >
                                    <Edit size={16} />
                                    EDITAR
                                </button>
                                <button
                                    onClick={() => {
                                        setDeleteTarget(scenario);
                                        setDeleteNameInput('');
                                    }}
                                    className="rounded-lg border border-red-900/50 bg-red-900/30 px-4 text-red-500 transition-colors hover:bg-red-600 hover:text-white"
                                    title="Eliminar escenario"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {deleteTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
                    <div className="w-full max-w-lg rounded-2xl border border-red-800/60 bg-gray-900 p-6">
                        <h3 className="mb-2 flex items-center gap-2 text-lg font-black text-red-300">
                            <AlertTriangle size={18} />
                            Confirmar eliminacion
                        </h3>
                        <p className="mb-4 text-sm text-gray-300">
                            Para eliminar este escenario, escribe exactamente su nombre:
                            <span className="ml-1 font-black text-white">{deleteTarget.name}</span>
                        </p>
                        <input
                            value={deleteNameInput}
                            onChange={(event) => setDeleteNameInput(event.target.value)}
                            className="mb-6 w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-white outline-none focus:border-red-500"
                            placeholder="Nombre del escenario"
                        />
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => {
                                    setDeleteTarget(null);
                                    setDeleteNameInput('');
                                }}
                                className="rounded-lg px-4 py-2 font-bold text-gray-300 hover:bg-gray-800"
                            >
                                CANCELAR
                            </button>
                            <button
                                onClick={() =>
                                    deleteMutation.mutate({
                                        id: deleteTarget.id!,
                                        confirmName: deleteNameInput.trim(),
                                    })
                                }
                                disabled={deleteMutation.isPending || deleteNameInput.trim() !== deleteTarget.name}
                                className="rounded-lg bg-red-600 px-4 py-2 font-bold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {deleteMutation.isPending ? 'ELIMINANDO...' : 'ELIMINAR'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
