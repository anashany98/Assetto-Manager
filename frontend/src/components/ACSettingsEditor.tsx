import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import {
    Gauge, MonitorCog, Volume2,
    Save, RotateCcw, ChevronDown, ChevronUp,
    Sliders, Zap, Eye, Vibrate, Camera, Sun, Cloud, Bot, Users,
    Cog, Gamepad2, Car
} from 'lucide-react';
import { API_URL } from '../config';
import { cn } from '../lib/utils';

interface ACSettingsEditorProps {
    category: 'controls' | 'gameplay' | 'video' | 'audio' | 'camera' | 'race' | 'weather';
    profileName: string;
}

type SectionData = Record<string, Record<string, string>>;

// Slider component with labels
function SettingSlider({
    label,
    value,
    min = 0,
    max = 100,
    step = 1,
    unit = '%',
    color = 'blue',
    onChange
}: {
    label: string;
    value: number;
    min?: number;
    max?: number;
    step?: number;
    unit?: string;
    color?: string;
    onChange: (v: number) => void;
}) {
    const colorClasses: Record<string, string> = {
        blue: 'accent-blue-500',
        orange: 'accent-orange-500',
        purple: 'accent-purple-500',
        green: 'accent-green-500',
        red: 'accent-red-500',
        cyan: 'accent-cyan-500',
        yellow: 'accent-yellow-500',
    };

    const textColorClasses: Record<string, string> = {
        blue: 'text-blue-400',
        orange: 'text-orange-400',
        purple: 'text-purple-400',
        green: 'text-green-400',
        red: 'text-red-400',
        cyan: 'text-cyan-400',
        yellow: 'text-yellow-400',
    };

    return (
        <div className="space-y-2">
            <div className="flex justify-between items-center">
                <label className="text-sm font-bold text-gray-300">{label}</label>
                <span className={cn("text-sm font-bold", textColorClasses[color] || 'text-blue-400')}>
                    {value}{unit}
                </span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                className={cn("w-full h-2 bg-gray-700 rounded-lg cursor-pointer", colorClasses[color])}
            />
        </div>
    );
}

// Toggle switch component
function SettingToggle({
    label,
    value,
    description,
    onChange
}: {
    label: string;
    value: boolean;
    description?: string;
    onChange: (v: boolean) => void;
}) {
    return (
        <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-xl border border-gray-700">
            <div>
                <p className="font-bold text-white">{label}</p>
                {description && <p className="text-xs text-gray-500 mt-1">{description}</p>}
            </div>
            <button
                onClick={() => onChange(!value)}
                className={cn(
                    "w-14 h-7 rounded-full transition-all relative",
                    value ? "bg-green-500" : "bg-gray-600"
                )}
            >
                <div className={cn(
                    "absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow-lg transition-transform",
                    value && "translate-x-7"
                )} />
            </button>
        </div>
    );
}

// Select dropdown component
function SettingSelect({
    label,
    value,
    options,
    onChange
}: {
    label: string;
    value: string;
    options: { value: string; label: string }[];
    onChange: (v: string) => void;
}) {
    return (
        <div className="space-y-2">
            <label className="text-sm font-bold text-gray-300">{label}</label>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-600 text-white font-medium focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            >
                {options.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
            </select>
        </div>
    );
}

// Collapsible section
function SettingSection({
    title,
    icon: Icon,
    color = 'blue',
    children,
    defaultOpen = true
}: {
    title: string;
    icon: React.ComponentType<{ className?: string; size?: number }>;
    color?: string;
    children: React.ReactNode;
    defaultOpen?: boolean;
}) {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    const iconColorClasses: Record<string, string> = {
        blue: 'text-blue-400',
        orange: 'text-orange-400',
        purple: 'text-purple-400',
        green: 'text-green-400',
        red: 'text-red-400',
        cyan: 'text-cyan-400',
        yellow: 'text-yellow-400',
    };

    return (
        <div className="glass-card overflow-hidden">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "w-full flex items-center justify-between p-4 transition-colors",
                    isOpen ? "bg-white/5" : "hover:bg-white/5"
                )}
            >
                <div className="flex items-center gap-3">
                    <Icon size={20} className={iconColorClasses[color] || 'text-blue-400'} />
                    <span className="font-bold text-white">{title}</span>
                </div>
                {isOpen ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
            </button>
            {isOpen && (
                <div className="p-4 pt-0 space-y-4 animate-fade-in">
                    {children}
                </div>
            )}
        </div>
    );
}

export default function ACSettingsEditor({ category, profileName }: ACSettingsEditorProps) {
    const queryClient = useQueryClient();
    const [localData, setLocalData] = useState<SectionData | null>(null);
    const [hasChanges, setHasChanges] = useState(false);

    // Fetch profile content
    const { data, isLoading, error } = useQuery<{ sections: SectionData }>({
        queryKey: ['ac-config', category, profileName],
        queryFn: async () => {
            const res = await axios.get(`${API_URL}/configs/profile/${category}/${profileName}/parsed`);
            return res.data;
        },
        enabled: !!profileName,
    });

    // Save mutation
    const saveMutation = useMutation({
        mutationFn: async (sections: SectionData) => {
            await axios.post(`${API_URL}/configs/profile/${category}/${profileName}/parsed`, { sections });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['ac-config', category, profileName] });
            setHasChanges(false);
        }
    });

    // Use local data if modified, otherwise server data
    const sections = localData ?? data?.sections ?? {};

    const updateValue = (section: string, key: string, value: string) => {
        setLocalData(prev => {
            const current = prev ?? data?.sections ?? {};
            return {
                ...current,
                [section]: {
                    ...(current[section] || {}),
                    [key]: value
                }
            };
        });
        setHasChanges(true);
    };

    const handleSave = () => {
        if (localData) {
            saveMutation.mutate(localData);
        }
    };

    const handleReset = () => {
        setLocalData(null);
        setHasChanges(false);
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-12">
                <div className="w-8 h-8 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6 text-center text-red-400">
                Error al cargar configuración
            </div>
        );
    }

    // Render specialized editors based on category
    const renderEditor = () => {
        switch (category) {
            case 'controls':
                return renderControlsEditor();
            case 'gameplay':
                return renderGameplayEditor();
            case 'video':
                return renderVideoEditor();
            case 'audio':
                return renderAudioEditor();
            case 'camera':
                return renderCameraEditor();
            case 'race':
                return renderRaceEditor();
            case 'weather':
                return renderWeatherEditor();
            default:
                return renderGenericEditor();
        }
    };

    // ========== CONTROLS EDITOR ==========
    const renderControlsEditor = () => {
        const ffb = sections['FF_POST_PROCESS'] || {};
        const steer = sections['STEER'] || {};
        const advanced = sections['ADVANCED'] || {};
        const keyboard = sections['KEYBOARD'] || {};

        return (
            <div className="space-y-4">
                {/* Force Feedback */}
                <SettingSection title="Force Feedback" icon={Vibrate} color="blue">
                    <SettingSlider
                        label="FF Gain (Intensidad General)"
                        value={Math.round(Number(ffb.ENABLED !== '0' ? (ffb.TYPE === 'LUT' ? 100 : Number(steer.FF_GAIN || 1) * 100) : 0))}
                        min={0} max={200} step={5}
                        onChange={(v) => updateValue('STEER', 'FF_GAIN', (v / 100).toFixed(2))}
                        color="blue"
                    />
                    <SettingSlider
                        label="Damper (Amortiguación)"
                        value={Math.round(Number(advanced.DAMPER_GAIN || 0.5) * 100)}
                        min={0} max={100} step={5}
                        onChange={(v) => updateValue('ADVANCED', 'DAMPER_GAIN', (v / 100).toFixed(2))}
                        color="blue"
                    />
                    <SettingSlider
                        label="Minimum Force"
                        value={Math.round(Number(advanced.MIN_FF || 0.05) * 100)}
                        min={0} max={30} step={1}
                        onChange={(v) => updateValue('ADVANCED', 'MIN_FF', (v / 100).toFixed(2))}
                        color="blue"
                    />
                    <SettingSlider
                        label="Filter (Suavizado)"
                        value={Math.round(Number(steer.FILTER_FF || 0) * 100)}
                        min={0} max={100} step={5}
                        onChange={(v) => updateValue('STEER', 'FILTER_FF', (v / 100).toFixed(2))}
                        color="blue"
                    />
                    <SettingToggle
                        label="Enhanced Understeer Effect"
                        value={advanced.ENHANCED_UNDERSTEER === '1'}
                        description="Mejora la sensación de subviraje"
                        onChange={(v) => updateValue('ADVANCED', 'ENHANCED_UNDERSTEER', v ? '1' : '0')}
                    />
                </SettingSection>

                {/* FFB Effects */}
                <SettingSection title="Efectos FFB" icon={Zap} color="orange" defaultOpen={false}>
                    <SettingSlider
                        label="Kerb Effect (Pianos)"
                        value={Math.round(Number(advanced.KERB_EFFECT || 0.4) * 100)}
                        min={0} max={150} step={5}
                        onChange={(v) => updateValue('ADVANCED', 'KERB_EFFECT', (v / 100).toFixed(2))}
                        color="orange"
                    />
                    <SettingSlider
                        label="Road Effect (Textura Asfalto)"
                        value={Math.round(Number(advanced.ROAD_EFFECT || 0.3) * 100)}
                        min={0} max={150} step={5}
                        onChange={(v) => updateValue('ADVANCED', 'ROAD_EFFECT', (v / 100).toFixed(2))}
                        color="orange"
                    />
                    <SettingSlider
                        label="Slip Effect (Deslizamiento)"
                        value={Math.round(Number(advanced.SLIP_EFFECT || 0) * 100)}
                        min={0} max={150} step={5}
                        onChange={(v) => updateValue('ADVANCED', 'SLIP_EFFECT', (v / 100).toFixed(2))}
                        color="orange"
                    />
                    <SettingSlider
                        label="ABS Effect"
                        value={Math.round(Number(advanced.ABS_EFFECT || 0.25) * 100)}
                        min={0} max={100} step={5}
                        onChange={(v) => updateValue('ADVANCED', 'ABS_EFFECT', (v / 100).toFixed(2))}
                        color="orange"
                    />
                </SettingSection>

                {/* Steering */}
                <SettingSection title="Dirección" icon={Gauge} color="purple" defaultOpen={false}>
                    <SettingSlider
                        label="Grados de Rotación (Lock)"
                        value={Number(steer.LOCK || 900)}
                        min={180} max={1080} step={10}
                        unit="°"
                        onChange={(v) => updateValue('STEER', 'LOCK', String(v))}
                        color="purple"
                    />
                    <SettingSlider
                        label="Steer Gamma"
                        value={Math.round(Number(steer.STEER_GAMMA || 1) * 100)}
                        min={50} max={200} step={5}
                        onChange={(v) => updateValue('STEER', 'STEER_GAMMA', (v / 100).toFixed(2))}
                        color="purple"
                    />
                    <SettingSlider
                        label="Steer Filter"
                        value={Math.round(Number(steer.STEER_FILTER || 0) * 100)}
                        min={0} max={100} step={5}
                        onChange={(v) => updateValue('STEER', 'STEER_FILTER', (v / 100).toFixed(2))}
                        color="purple"
                    />
                    <SettingSlider
                        label="Speed Sensitivity"
                        value={Math.round(Number(steer.SPEED_SENSITIVITY || 0) * 100)}
                        min={0} max={100} step={5}
                        onChange={(v) => updateValue('STEER', 'SPEED_SENSITIVITY', (v / 100).toFixed(2))}
                        color="purple"
                    />
                    <SettingSlider
                        label="Deadzone"
                        value={Math.round(Number(steer.STEER_DEADZONE || 0) * 100)}
                        min={0} max={20} step={1}
                        onChange={(v) => updateValue('STEER', 'STEER_DEADZONE', (v / 100).toFixed(2))}
                        color="purple"
                    />
                </SettingSection>

                {/* Keyboard */}
                <SettingSection title="Teclado (Sensibilidad)" icon={Gamepad2} color="cyan" defaultOpen={false}>
                    <SettingSlider
                        label="Steer Speed"
                        value={Math.round(Number(keyboard.STEER_SPEED || 1.75) * 100)}
                        min={50} max={500} step={25}
                        onChange={(v) => updateValue('KEYBOARD', 'STEER_SPEED', (v / 100).toFixed(2))}
                        color="cyan"
                    />
                    <SettingSlider
                        label="Throttle Speed"
                        value={Math.round(Number(keyboard.GAS_SPEED || 2) * 100)}
                        min={50} max={500} step={25}
                        onChange={(v) => updateValue('KEYBOARD', 'GAS_SPEED', (v / 100).toFixed(2))}
                        color="cyan"
                    />
                    <SettingSlider
                        label="Brake Speed"
                        value={Math.round(Number(keyboard.BRAKE_SPEED || 2) * 100)}
                        min={50} max={500} step={25}
                        onChange={(v) => updateValue('KEYBOARD', 'BRAKE_SPEED', (v / 100).toFixed(2))}
                        color="cyan"
                    />
                </SettingSection>
            </div>
        );
    };

    // ========== GAMEPLAY/ASSISTS EDITOR ==========
    const renderGameplayEditor = () => {
        const assists = sections['ASSISTS'] || {};
        const realism = sections['REALISM'] || {};

        return (
            <div className="space-y-4">
                {/* Driving Assists */}
                <SettingSection title="Ayudas a la Conducción" icon={Sliders} color="orange">
                    <SettingSelect
                        label="ABS (Antibloqueo)"
                        value={assists.ABS ?? '1'}
                        options={[
                            { value: '0', label: 'Off - Desactivado' },
                            { value: '1', label: 'Factory - Según el coche' },
                            { value: '2', label: 'On - Siempre activado' },
                        ]}
                        onChange={(v) => updateValue('ASSISTS', 'ABS', v)}
                    />
                    <SettingSelect
                        label="Traction Control (TC)"
                        value={assists.TRACTION_CONTROL ?? '1'}
                        options={[
                            { value: '0', label: 'Off - Desactivado' },
                            { value: '1', label: 'Factory - Según el coche' },
                            { value: '2', label: 'On - Siempre activado' },
                        ]}
                        onChange={(v) => updateValue('ASSISTS', 'TRACTION_CONTROL', v)}
                    />
                    <SettingSlider
                        label="Stability Control (%)"
                        value={Number(assists.STABILITY_CONTROL || 0)}
                        min={0} max={100} step={5}
                        onChange={(v) => updateValue('ASSISTS', 'STABILITY_CONTROL', String(v))}
                        color="orange"
                    />
                    <SettingToggle
                        label="Auto Clutch"
                        value={assists.AUTO_CLUTCH === '1'}
                        description="Embrague automático al cambiar"
                        onChange={(v) => updateValue('ASSISTS', 'AUTO_CLUTCH', v ? '1' : '0')}
                    />
                    <SettingToggle
                        label="Auto Blip (Heel-Toe)"
                        value={assists.AUTO_BLIP === '1'}
                        description="Punta-tacón automático al reducir"
                        onChange={(v) => updateValue('ASSISTS', 'AUTO_BLIP', v ? '1' : '0')}
                    />
                    <SettingToggle
                        label="Autosteer"
                        value={assists.AUTOSTEER === '1'}
                        description="Dirección asistida automática"
                        onChange={(v) => updateValue('ASSISTS', 'AUTOSTEER', v ? '1' : '0')}
                    />
                </SettingSection>

                {/* Visual Aids */}
                <SettingSection title="Ayudas Visuales" icon={Eye} color="cyan" defaultOpen={false}>
                    <SettingToggle
                        label="Ideal Racing Line"
                        value={assists.IDEAL_LINE === '1'}
                        description="Muestra la línea óptima en pista"
                        onChange={(v) => updateValue('ASSISTS', 'IDEAL_LINE', v ? '1' : '0')}
                    />
                    <SettingToggle
                        label="Auto Gear"
                        value={assists.AUTO_GEAR === '1'}
                        description="Cambio automático de marchas"
                        onChange={(v) => updateValue('ASSISTS', 'AUTO_GEAR', v ? '1' : '0')}
                    />
                    <SettingToggle
                        label="Visual Damage"
                        value={realism.VISUAL_DAMAGE === '1'}
                        description="Mostrar daños visuales en el coche"
                        onChange={(v) => updateValue('REALISM', 'VISUAL_DAMAGE', v ? '1' : '0')}
                    />
                </SettingSection>

                {/* Realism Settings */}
                <SettingSection title="Realismo" icon={Zap} color="red" defaultOpen={false}>
                    <SettingSelect
                        label="Mechanical Damage"
                        value={realism.DAMAGE ?? '100'}
                        options={[
                            { value: '0', label: 'Off - Sin daños' },
                            { value: '25', label: '25%' },
                            { value: '50', label: '50%' },
                            { value: '75', label: '75%' },
                            { value: '100', label: '100% - Realista' },
                        ]}
                        onChange={(v) => updateValue('REALISM', 'DAMAGE', v)}
                    />
                    <SettingSelect
                        label="Fuel Consumption"
                        value={realism.FUEL_RATE ?? '1'}
                        options={[
                            { value: '0', label: 'Off - Combustible infinito' },
                            { value: '1', label: '1x - Normal' },
                            { value: '2', label: '2x - Doble consumo' },
                            { value: '3', label: '3x - Triple consumo' },
                        ]}
                        onChange={(v) => updateValue('REALISM', 'FUEL_RATE', v)}
                    />
                    <SettingSelect
                        label="Tyre Wear"
                        value={realism.TYRE_WEAR ?? '1'}
                        options={[
                            { value: '0', label: 'Off - Neumáticos infinitos' },
                            { value: '1', label: '1x - Normal' },
                            { value: '2', label: '2x - Doble desgaste' },
                            { value: '3', label: '3x - Triple desgaste' },
                        ]}
                        onChange={(v) => updateValue('REALISM', 'TYRE_WEAR', v)}
                    />
                    <SettingToggle
                        label="Tyre Blankets"
                        value={realism.TYRE_BLANKETS === '1'}
                        description="Neumáticos precalentados al inicio"
                        onChange={(v) => updateValue('REALISM', 'TYRE_BLANKETS', v ? '1' : '0')}
                    />
                    <SettingToggle
                        label="Penalties"
                        value={realism.PENALTIES === '1'}
                        description="Penalizaciones por cortar"
                        onChange={(v) => updateValue('REALISM', 'PENALTIES', v ? '1' : '0')}
                    />
                </SettingSection>
            </div>
        );
    };

    // ========== VIDEO/GRAPHICS EDITOR ==========
    const renderVideoEditor = () => {
        const video = sections['VIDEO'] || {};
        const effects = sections['POST_PROCESS'] || {};
        const mirror = sections['MIRROR'] || {};
        const cubemap = sections['CUBEMAP'] || {};
        const shadows = sections['ASSETTOCORSA'] || {};

        return (
            <div className="space-y-4">
                {/* Display Settings */}
                <SettingSection title="Pantalla" icon={MonitorCog} color="purple">
                    <SettingSelect
                        label="Resolución"
                        value={`${video.WIDTH || '1920'}x${video.HEIGHT || '1080'}`}
                        options={[
                            { value: '1280x720', label: '1280×720 (720p HD)' },
                            { value: '1600x900', label: '1600×900 (900p)' },
                            { value: '1920x1080', label: '1920×1080 (1080p Full HD)' },
                            { value: '2560x1440', label: '2560×1440 (1440p 2K)' },
                            { value: '3440x1440', label: '3440×1440 (Ultrawide)' },
                            { value: '3840x2160', label: '3840×2160 (4K UHD)' },
                        ]}
                        onChange={(v) => {
                            const [w, h] = v.split('x');
                            updateValue('VIDEO', 'WIDTH', w);
                            updateValue('VIDEO', 'HEIGHT', h);
                        }}
                    />
                    <SettingToggle
                        label="Fullscreen"
                        value={video.FULLSCREEN === '1'}
                        onChange={(v) => updateValue('VIDEO', 'FULLSCREEN', v ? '1' : '0')}
                    />
                    <SettingToggle
                        label="VSync"
                        value={video.VSYNC === '1'}
                        description="Sincronización vertical"
                        onChange={(v) => updateValue('VIDEO', 'VSYNC', v ? '1' : '0')}
                    />
                    <SettingSlider
                        label="Frame Rate Limit"
                        value={Number(video.FPS_CAP_MS || 0) === 0 ? 0 : Math.round(1000 / Number(video.FPS_CAP_MS || 16.67))}
                        min={0} max={240} step={10}
                        unit=" fps"
                        onChange={(v) => updateValue('VIDEO', 'FPS_CAP_MS', v === 0 ? '0' : String(Math.round(1000 / v)))}
                        color="purple"
                    />
                </SettingSection>

                {/* VR Settings - Content Manager Real Options */}
                <SettingSection title="Realidad Virtual (VR)" icon={Eye} color="cyan" defaultOpen={false}>
                    <SettingSelect
                        label="Rendering Mode (Modo de Renderizado)"
                        value={video.CAMERA_MODE ?? 'DEFAULT'}
                        options={[
                            { value: 'DEFAULT', label: '🖥️ Default - Monitor Normal' },
                            { value: 'OCULUS', label: '🥽 Oculus Rift - Modo Nativo Oculus' },
                            { value: 'OPENVR', label: '🎮 OpenVR - SteamVR / Otros HMD' },
                            { value: 'TRIPLE', label: '🖥️🖥️🖥️ Triple Screen' },
                        ]}
                        onChange={(v) => updateValue('VIDEO', 'CAMERA_MODE', v)}
                    />
                    <SettingToggle
                        label="Fixed Resolution (Resolución Fija)"
                        value={video.FIXED_RESOLUTION !== '0'}
                        description="Desactivar para VR - deja que el HMD controle la resolución"
                        onChange={(v) => updateValue('VIDEO', 'FIXED_RESOLUTION', v ? '1' : '0')}
                    />
                    <SettingSlider
                        label="Render Resolution Multiplier (%)"
                        value={Number(video.RENDER_SCALE || 100)}
                        min={50} max={200} step={10}
                        onChange={(v) => updateValue('VIDEO', 'RENDER_SCALE', String(v))}
                        color="cyan"
                    />
                    <SettingSlider
                        label="Refresh Rate (Hz)"
                        value={Number(video.REFRESH || 90)}
                        min={60} max={144} step={1}
                        unit=" Hz"
                        onChange={(v) => updateValue('VIDEO', 'REFRESH', String(v))}
                        color="cyan"
                    />
                </SettingSection>

                {/* Anti-Aliasing & Filtering */}
                <SettingSection title="Anti-Aliasing" icon={Eye} color="blue" defaultOpen={false}>
                    <SettingSelect
                        label="MSAA Samples"
                        value={video.AASAMPLES ?? '4'}
                        options={[
                            { value: '0', label: 'Off' },
                            { value: '2', label: '2x MSAA' },
                            { value: '4', label: '4x MSAA' },
                            { value: '8', label: '8x MSAA' },
                        ]}
                        onChange={(v) => updateValue('VIDEO', 'AASAMPLES', v)}
                    />
                    <SettingSelect
                        label="Anisotropic Filtering"
                        value={video.ANISOTROPIC ?? '8'}
                        options={[
                            { value: '0', label: 'Off' },
                            { value: '2', label: '2x' },
                            { value: '4', label: '4x' },
                            { value: '8', label: '8x' },
                            { value: '16', label: '16x (Max)' },
                        ]}
                        onChange={(v) => updateValue('VIDEO', 'ANISOTROPIC', v)}
                    />
                    <SettingToggle
                        label="FXAA"
                        value={effects.FXAA === '1'}
                        description="Fast Approximate Anti-Aliasing"
                        onChange={(v) => updateValue('POST_PROCESS', 'FXAA', v ? '1' : '0')}
                    />
                </SettingSection>

                {/* Shadows */}
                <SettingSection title="Sombras" icon={Cloud} color="orange" defaultOpen={false}>
                    <SettingSelect
                        label="Shadow Map Size"
                        value={video.SHADOW_MAP_SIZE ?? '2048'}
                        options={[
                            { value: '0', label: 'Off' },
                            { value: '512', label: '512 (Low)' },
                            { value: '1024', label: '1024 (Medium)' },
                            { value: '2048', label: '2048 (High)' },
                            { value: '4096', label: '4096 (Ultra)' },
                        ]}
                        onChange={(v) => updateValue('VIDEO', 'SHADOW_MAP_SIZE', v)}
                    />
                    <SettingSlider
                        label="World Detail"
                        value={Number(shadows.WORLD_DETAIL || 4)}
                        min={0} max={5} step={1}
                        unit=""
                        onChange={(v) => updateValue('ASSETTOCORSA', 'WORLD_DETAIL', String(v))}
                        color="orange"
                    />
                </SettingSection>

                {/* Reflections */}
                <SettingSection title="Reflejos y Espejos" icon={Camera} color="cyan" defaultOpen={false}>
                    <SettingSelect
                        label="Cubemap Size (Reflections)"
                        value={cubemap.SIZE ?? '1024'}
                        options={[
                            { value: '0', label: 'Off' },
                            { value: '256', label: '256 (Low)' },
                            { value: '512', label: '512 (Medium)' },
                            { value: '1024', label: '1024 (High)' },
                            { value: '2048', label: '2048 (Ultra)' },
                        ]}
                        onChange={(v) => updateValue('CUBEMAP', 'SIZE', v)}
                    />
                    <SettingSlider
                        label="Cubemap Faces/Frame"
                        value={Number(cubemap.FACES_PER_FRAME || 3)}
                        min={1} max={6} step={1}
                        unit=""
                        onChange={(v) => updateValue('CUBEMAP', 'FACES_PER_FRAME', String(v))}
                        color="cyan"
                    />
                    <SettingSelect
                        label="Mirror Resolution"
                        value={mirror.SIZE ?? '512'}
                        options={[
                            { value: '256', label: '256 (Low)' },
                            { value: '512', label: '512 (Medium)' },
                            { value: '1024', label: '1024 (High)' },
                        ]}
                        onChange={(v) => updateValue('MIRROR', 'SIZE', v)}
                    />
                    <SettingToggle
                        label="High Quality Mirror"
                        value={mirror.HQ === '1'}
                        onChange={(v) => updateValue('MIRROR', 'HQ', v ? '1' : '0')}
                    />
                </SettingSection>

                {/* Post Processing */}
                <SettingSection title="Post-Procesado" icon={Sliders} color="green" defaultOpen={false}>
                    <SettingToggle
                        label="Post-Processing Enabled"
                        value={effects.ENABLED === '1'}
                        onChange={(v) => updateValue('POST_PROCESS', 'ENABLED', v ? '1' : '0')}
                    />
                    <SettingSlider
                        label="Effect Quality"
                        value={Number(effects.QUALITY || 3)}
                        min={0} max={5} step={1}
                        unit=""
                        onChange={(v) => updateValue('POST_PROCESS', 'QUALITY', String(v))}
                        color="green"
                    />
                    <SettingSlider
                        label="Glare"
                        value={Number(effects.GLARE || 2)}
                        min={0} max={5} step={1}
                        unit=""
                        onChange={(v) => updateValue('POST_PROCESS', 'GLARE', String(v))}
                        color="green"
                    />
                    <SettingSlider
                        label="Depth of Field (DOF)"
                        value={Number(effects.DOF || 0)}
                        min={0} max={5} step={1}
                        unit=""
                        onChange={(v) => updateValue('POST_PROCESS', 'DOF', String(v))}
                        color="green"
                    />
                    <SettingToggle
                        label="Motion Blur"
                        value={video.MOTION_BLUR !== '0'}
                        description="Desenfoque de movimiento"
                        onChange={(v) => updateValue('VIDEO', 'MOTION_BLUR', v ? '5' : '0')}
                    />
                    <SettingToggle
                        label="Heat Shimmer"
                        value={effects.HEAT_SHIMMER === '1'}
                        description="Efecto de calor del asfalto"
                        onChange={(v) => updateValue('POST_PROCESS', 'HEAT_SHIMMER', v ? '1' : '0')}
                    />
                    <SettingToggle
                        label="Rays of God (Sunrays)"
                        value={effects.RAYS_OF_GOD === '1'}
                        description="Rayos de sol volumétricos"
                        onChange={(v) => updateValue('POST_PROCESS', 'RAYS_OF_GOD', v ? '1' : '0')}
                    />
                </SettingSection>

                {/* Smoke & Particles */}
                <SettingSection title="Humo y Partículas" icon={Cloud} color="yellow" defaultOpen={false}>
                    <SettingSlider
                        label="Smoke Generation"
                        value={Number(video.SMOKE || 2)}
                        min={0} max={5} step={1}
                        unit=""
                        onChange={(v) => updateValue('VIDEO', 'SMOKE', String(v))}
                        color="yellow"
                    />
                    <SettingToggle
                        label="Smoke in Mirrors"
                        value={video.RENDER_SMOKE_IN_MIRROR === '1'}
                        onChange={(v) => updateValue('VIDEO', 'RENDER_SMOKE_IN_MIRROR', v ? '1' : '0')}
                    />
                </SettingSection>
            </div>
        );
    };

    // ========== AUDIO EDITOR ==========
    const renderAudioEditor = () => {
        const levels = sections['LEVELS'] || {};

        return (
            <div className="space-y-4">
                <SettingSection title="Niveles de Audio" icon={Volume2} color="green">
                    <SettingSlider
                        label="Master Volume"
                        value={Math.round(Number(levels.MASTER || 0.8) * 100)}
                        min={0} max={100} step={5}
                        onChange={(v) => updateValue('LEVELS', 'MASTER', (v / 100).toFixed(2))}
                        color="green"
                    />
                    <SettingSlider
                        label="Engine"
                        value={Math.round(Number(levels.ENGINE || 0.8) * 100)}
                        min={0} max={100} step={5}
                        onChange={(v) => updateValue('LEVELS', 'ENGINE', (v / 100).toFixed(2))}
                        color="green"
                    />
                    <SettingSlider
                        label="Tyres (Screeching)"
                        value={Math.round(Number(levels.TYRES || 0.8) * 100)}
                        min={0} max={100} step={5}
                        onChange={(v) => updateValue('LEVELS', 'TYRES', (v / 100).toFixed(2))}
                        color="green"
                    />
                    <SettingSlider
                        label="Surfaces (Road Noise)"
                        value={Math.round(Number(levels.SURFACES || 0.5) * 100)}
                        min={0} max={100} step={5}
                        onChange={(v) => updateValue('LEVELS', 'SURFACES', (v / 100).toFixed(2))}
                        color="green"
                    />
                    <SettingSlider
                        label="Wind"
                        value={Math.round(Number(levels.WIND || 0.5) * 100)}
                        min={0} max={100} step={5}
                        onChange={(v) => updateValue('LEVELS', 'WIND', (v / 100).toFixed(2))}
                        color="green"
                    />
                    <SettingSlider
                        label="Opponents"
                        value={Math.round(Number(levels.OPPONENTS || 0.8) * 100)}
                        min={0} max={100} step={5}
                        onChange={(v) => updateValue('LEVELS', 'OPPONENTS', (v / 100).toFixed(2))}
                        color="green"
                    />
                    <SettingSlider
                        label="Dirt/Gravel"
                        value={Math.round(Number(levels.DIRT || 0.5) * 100)}
                        min={0} max={100} step={5}
                        onChange={(v) => updateValue('LEVELS', 'DIRT', (v / 100).toFixed(2))}
                        color="green"
                    />
                </SettingSection>
            </div>
        );
    };

    // ========== CAMERA EDITOR ==========
    const renderCameraEditor = () => {
        const cockpit = sections['COCKPIT'] || {};
        const chase = sections['CHASE'] || {};
        const hood = sections['HOOD'] || {};
        const general = sections['GENERAL'] || {};

        return (
            <div className="space-y-4">
                {/* Cockpit Camera */}
                <SettingSection title="Cámara Cockpit (Interior)" icon={Camera} color="cyan">
                    <SettingSlider
                        label="Field of View (FOV)"
                        value={Number(cockpit.FOV || 56)}
                        min={30} max={100} step={1}
                        unit="°"
                        onChange={(v) => updateValue('COCKPIT', 'FOV', String(v))}
                        color="cyan"
                    />
                    <SettingSlider
                        label="Distance (Distancia)"
                        value={Math.round(Number(cockpit.DISTANCE || 0.4) * 100)}
                        min={0} max={100} step={5}
                        onChange={(v) => updateValue('COCKPIT', 'DISTANCE', (v / 100).toFixed(2))}
                        color="cyan"
                    />
                    <SettingSlider
                        label="Height (Altura)"
                        value={Math.round((Number(cockpit.HEIGHT || 0) + 0.5) * 100)}
                        min={0} max={100} step={5}
                        onChange={(v) => updateValue('COCKPIT', 'HEIGHT', ((v / 100) - 0.5).toFixed(2))}
                        color="cyan"
                    />
                    <SettingSlider
                        label="Exposure Offset"
                        value={Math.round(Number(cockpit.EXPOSURE || 0) * 100 + 50)}
                        min={0} max={100} step={5}
                        onChange={(v) => updateValue('COCKPIT', 'EXPOSURE', ((v - 50) / 100).toFixed(2))}
                        color="cyan"
                    />
                </SettingSection>

                {/* Visual Options */}
                <SettingSection title="Opciones Visuales" icon={Eye} color="purple" defaultOpen={false}>
                    <SettingToggle
                        label="Hide Steering Wheel"
                        value={general.HIDE_STEER === '1'}
                        description="Ocultar volante virtual"
                        onChange={(v) => updateValue('GENERAL', 'HIDE_STEER', v ? '1' : '0')}
                    />
                    <SettingToggle
                        label="Hide Arms"
                        value={general.HIDE_ARMS === '1'}
                        description="Ocultar brazos del piloto"
                        onChange={(v) => updateValue('GENERAL', 'HIDE_ARMS', v ? '1' : '0')}
                    />
                    <SettingToggle
                        label="Lock Steer Animation"
                        value={general.LOCK_STEER === '1'}
                        description="Bloquear animación del volante"
                        onChange={(v) => updateValue('GENERAL', 'LOCK_STEER', v ? '1' : '0')}
                    />
                </SettingSection>

                {/* Chase Camera */}
                <SettingSection title="Cámara Chase (Exterior)" icon={Car} color="orange" defaultOpen={false}>
                    <SettingSlider
                        label="Field of View"
                        value={Number(chase.FOV || 30)}
                        min={20} max={80} step={1}
                        unit="°"
                        onChange={(v) => updateValue('CHASE', 'FOV', String(v))}
                        color="orange"
                    />
                    <SettingSlider
                        label="Distance"
                        value={Math.round(Number(chase.DISTANCE || 5) * 10)}
                        min={20} max={150} step={5}
                        unit="dm"
                        onChange={(v) => updateValue('CHASE', 'DISTANCE', (v / 10).toFixed(1))}
                        color="orange"
                    />
                    <SettingSlider
                        label="Height"
                        value={Math.round(Number(chase.HEIGHT || 1.5) * 10)}
                        min={5} max={50} step={1}
                        unit="dm"
                        onChange={(v) => updateValue('CHASE', 'HEIGHT', (v / 10).toFixed(1))}
                        color="orange"
                    />
                </SettingSection>

                {/* Hood Camera */}
                <SettingSection title="Cámara Hood (Capó)" icon={Cog} color="yellow" defaultOpen={false}>
                    <SettingSlider
                        label="Field of View"
                        value={Number(hood.FOV || 56)}
                        min={30} max={100} step={1}
                        unit="°"
                        onChange={(v) => updateValue('HOOD', 'FOV', String(v))}
                        color="yellow"
                    />
                    <SettingSlider
                        label="Height"
                        value={Math.round(Number(hood.HEIGHT || 0.8) * 100)}
                        min={0} max={200} step={10}
                        onChange={(v) => updateValue('HOOD', 'HEIGHT', (v / 100).toFixed(2))}
                        color="yellow"
                    />
                </SettingSection>
            </div>
        );
    };

    // ========== RACE/AI EDITOR ==========
    const renderRaceEditor = () => {
        const race = sections['RACE'] || {};
        const ai = sections['BOT'] || sections['AI'] || {};

        return (
            <div className="space-y-4">
                {/* Race Configuration */}
                <SettingSection title="Configuración de Sesión" icon={Bot} color="red">
                    <SettingSlider
                        label="AI Opponents"
                        value={Number(race.AI_OPPONENTS || 7)}
                        min={0} max={30} step={1}
                        unit=""
                        onChange={(v) => updateValue('RACE', 'AI_OPPONENTS', String(v))}
                        color="red"
                    />
                    <SettingSlider
                        label="Race Laps"
                        value={Number(race.LAPS || 5)}
                        min={1} max={100} step={1}
                        unit=""
                        onChange={(v) => updateValue('RACE', 'LAPS', String(v))}
                        color="red"
                    />
                    <SettingSlider
                        label="Practice Minutes"
                        value={Number(race.PRACTICE_TIME || 10)}
                        min={0} max={60} step={5}
                        unit=" min"
                        onChange={(v) => updateValue('RACE', 'PRACTICE_TIME', String(v))}
                        color="red"
                    />
                    <SettingSlider
                        label="Qualify Minutes"
                        value={Number(race.QUALIFY_TIME || 10)}
                        min={0} max={30} step={5}
                        unit=" min"
                        onChange={(v) => updateValue('RACE', 'QUALIFY_TIME', String(v))}
                        color="red"
                    />
                    <SettingToggle
                        label="Rolling Start"
                        value={race.ROLLING_START === '1'}
                        description="Salida lanzada en movimiento"
                        onChange={(v) => updateValue('RACE', 'ROLLING_START', v ? '1' : '0')}
                    />
                    <SettingToggle
                        label="Jump Start Penalty"
                        value={race.JUMP_START === '1'}
                        description="Penalización por salida anticipada"
                        onChange={(v) => updateValue('RACE', 'JUMP_START', v ? '1' : '0')}
                    />
                </SettingSection>

                {/* AI Settings */}
                <SettingSection title="Configuración de IA" icon={Users} color="orange" defaultOpen={false}>
                    <SettingSlider
                        label="AI Level (Difficulty)"
                        value={Number(ai.LEVEL || 95)}
                        min={70} max={100} step={1}
                        onChange={(v) => updateValue('BOT', 'LEVEL', String(v))}
                        color="orange"
                    />
                    <SettingSlider
                        label="AI Aggression"
                        value={Number(ai.AGGRESSION || 50)}
                        min={0} max={100} step={5}
                        onChange={(v) => updateValue('BOT', 'AGGRESSION', String(v))}
                        color="orange"
                    />
                    <SettingSlider
                        label="AI Strength Variation"
                        value={Number(ai.STRENGTH_VARIATION || 0)}
                        min={0} max={30} step={1}
                        onChange={(v) => updateValue('BOT', 'STRENGTH_VARIATION', String(v))}
                        color="orange"
                    />
                    <SettingToggle
                        label="Unique AI Personalities"
                        value={ai.UNIQUE === '1'}
                        description="Cada IA tiene diferentes características"
                        onChange={(v) => updateValue('BOT', 'UNIQUE', v ? '1' : '0')}
                    />
                </SettingSection>
            </div>
        );
    };

    // ========== WEATHER EDITOR ==========
    const renderWeatherEditor = () => {
        const weather = sections['WEATHER'] || {};
        const time = sections['DYNAMIC_TIME'] || sections['TIME'] || {};
        const lighting = sections['LIGHTING'] || {};

        return (
            <div className="space-y-4">
                {/* Weather Conditions */}
                <SettingSection title="Condiciones Meteorológicas" icon={Cloud} color="blue">
                    <SettingSelect
                        label="Weather Type"
                        value={weather.NAME ?? 'sol_01_CLear'}
                        options={[
                            { value: 'sol_01_CLear', label: '☀️ Clear - Despejado' },
                            { value: 'sol_02_FewClouds', label: '🌤️ Few Clouds - Pocas Nubes' },
                            { value: 'sol_03_ScatteredClouds', label: '⛅ Scattered Clouds - Nubes Dispersas' },
                            { value: 'sol_04_BrokenClouds', label: '🌥️ Broken Clouds - Nublado Parcial' },
                            { value: 'sol_05_Overcast', label: '☁️ Overcast - Cubierto' },
                            { value: 'sol_06_Mist', label: '🌫️ Mist - Neblina' },
                            { value: 'sol_07_Fog', label: '🌁 Fog - Niebla Densa' },
                            { value: 'sol_10_LightRain', label: '🌦️ Light Rain - Lluvia Ligera' },
                            { value: 'sol_11_Rain', label: '🌧️ Rain - Lluvia' },
                            { value: 'sol_12_HeavyRain', label: '⛈️ Heavy Rain - Lluvia Fuerte' },
                            { value: 'sol_13_Thunderstorm', label: '🌩️ Thunderstorm - Tormenta' },
                        ]}
                        onChange={(v) => updateValue('WEATHER', 'NAME', v)}
                    />
                    <SettingSlider
                        label="Ambient Temperature"
                        value={Number(weather.AMBIENT || 22)}
                        min={-10} max={45} step={1}
                        unit="°C"
                        onChange={(v) => updateValue('WEATHER', 'AMBIENT', String(v))}
                        color="blue"
                    />
                    <SettingSlider
                        label="Track Temperature"
                        value={Number(weather.ROAD || 30)}
                        min={0} max={60} step={1}
                        unit="°C"
                        onChange={(v) => updateValue('WEATHER', 'ROAD', String(v))}
                        color="blue"
                    />
                    <SettingSlider
                        label="Wind Speed"
                        value={Number(weather.WIND_SPEED || 5)}
                        min={0} max={50} step={1}
                        unit=" km/h"
                        onChange={(v) => updateValue('WEATHER', 'WIND_SPEED', String(v))}
                        color="blue"
                    />
                    <SettingSlider
                        label="Wind Direction"
                        value={Number(weather.WIND_DIRECTION || 0)}
                        min={0} max={359} step={15}
                        unit="°"
                        onChange={(v) => updateValue('WEATHER', 'WIND_DIRECTION', String(v))}
                        color="blue"
                    />
                </SettingSection>

                {/* Time Settings */}
                <SettingSection title="Hora del Día" icon={Sun} color="yellow" defaultOpen={false}>
                    <SettingSlider
                        label="Start Hour"
                        value={Number(time.START_TIME || 12)}
                        min={0} max={23} step={1}
                        unit=":00"
                        onChange={(v) => updateValue('DYNAMIC_TIME', 'START_TIME', String(v))}
                        color="yellow"
                    />
                    <SettingSlider
                        label="Time Multiplier"
                        value={Number(time.TIME_MULT || 1)}
                        min={0} max={60} step={1}
                        unit="x"
                        onChange={(v) => updateValue('DYNAMIC_TIME', 'TIME_MULT', String(v))}
                        color="yellow"
                    />
                    <SettingToggle
                        label="Dynamic Time"
                        value={time.ENABLED === '1'}
                        description="El tiempo avanza durante la sesión"
                        onChange={(v) => updateValue('DYNAMIC_TIME', 'ENABLED', v ? '1' : '0')}
                    />
                </SettingSection>

                {/* Track Conditions */}
                <SettingSection title="Condiciones de Pista" icon={Cog} color="green" defaultOpen={false}>
                    <SettingSlider
                        label="Track Grip %"
                        value={Number(weather.TRACK_GRIP || 98)}
                        min={80} max={100} step={1}
                        onChange={(v) => updateValue('WEATHER', 'TRACK_GRIP', String(v))}
                        color="green"
                    />
                    <SettingSelect
                        label="Track State"
                        value={weather.TRACK_STATE ?? 'green'}
                        options={[
                            { value: 'green', label: '🟢 Green - Pista Limpia' },
                            { value: 'fast', label: '🔵 Fast - Pista Rápida' },
                            { value: 'optimum', label: '🟡 Optimum - Pista Óptima' },
                            { value: 'dusty', label: '🟠 Dusty - Pista Polvorienta' },
                            { value: 'old', label: '🔴 Old - Pista Desgastada' },
                        ]}
                        onChange={(v) => updateValue('WEATHER', 'TRACK_STATE', v)}
                    />
                </SettingSection>

                {/* Lighting */}
                <SettingSection title="Iluminación" icon={Eye} color="purple" defaultOpen={false}>
                    <SettingSlider
                        label="Saturation"
                        value={Number(lighting.SATURATION || 100)}
                        min={0} max={150} step={5}
                        onChange={(v) => updateValue('LIGHTING', 'SATURATION', String(v))}
                        color="purple"
                    />
                    <SettingSlider
                        label="Brightness"
                        value={Number(lighting.BRIGHTNESS || 100)}
                        min={50} max={150} step={5}
                        onChange={(v) => updateValue('LIGHTING', 'BRIGHTNESS', String(v))}
                        color="purple"
                    />
                </SettingSection>
            </div>
        );
    };

    // ========== GENERIC FALLBACK EDITOR ==========
    const renderGenericEditor = () => (
        <div className="space-y-4">
            {Object.entries(sections).map(([sectionName, keys]) => (
                <SettingSection key={sectionName} title={sectionName} icon={Sliders}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {Object.entries(keys as object).map(([key, val]) => (
                            <div key={key}>
                                <label className="text-xs font-bold text-gray-400 uppercase mb-1">{key}</label>
                                <input
                                    className="w-full px-4 py-2 rounded-xl border border-gray-600 bg-gray-900 text-white text-sm focus:border-blue-500 outline-none"
                                    value={val as string}
                                    onChange={(e) => updateValue(sectionName, key, e.target.value)}
                                />
                            </div>
                        ))}
                    </div>
                </SettingSection>
            ))}
        </div>
    );

    return (
        <div className="space-y-4">
            {/* Action buttons */}
            {hasChanges && (
                <div className="flex items-center justify-between p-4 glass-card border-l-4 border-blue-500 animate-slide-up">
                    <p className="text-sm text-gray-300">
                        <span className="font-bold text-blue-400">Cambios sin guardar</span> — Recuerda aplicar tus cambios
                    </p>
                    <div className="flex gap-2">
                        <button
                            onClick={handleReset}
                            className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm font-bold flex items-center gap-2 transition-colors"
                        >
                            <RotateCcw size={16} />
                            Descartar
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saveMutation.isPending}
                            className="px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm font-bold flex items-center gap-2 transition-all shadow-lg shadow-blue-500/25 disabled:opacity-50"
                        >
                            <Save size={16} />
                            {saveMutation.isPending ? 'Guardando...' : 'Guardar Cambios'}
                        </button>
                    </div>
                </div>
            )}

            {/* Content */}
            {renderEditor()}
        </div>
    );
}
