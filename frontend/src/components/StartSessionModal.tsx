import { useState, useEffect } from 'react';
import { X, DollarSign, User, Monitor, Glasses } from 'lucide-react';
import { startSession } from '../api/sessions';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { API_URL } from '../config';
import { calculatePrice, getDurationOptions, getPricingConfig } from '../utils/pricing';
import { toastApiError } from '../lib/apiError';

interface StartSessionModalProps {
    stationId: number;
    stationName: string;
    initialIsVR?: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export default function StartSessionModal({ stationId, stationName, initialIsVR, onClose, onSuccess }: StartSessionModalProps) {
    const [duration, setDuration] = useState(15);
    const [driverName, setDriverName] = useState('');
    const [price, setPrice] = useState(5.0);
    const [loading, setLoading] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card_nayax' | 'online' | 'stripe_qr' | 'bizum'>('cash');
    const [isVR, setIsVR] = useState(initialIsVR || false);

    // Fetch branding/settings for pricing
    const { data: settings } = useQuery({
        queryKey: ['settings'],
        queryFn: async () => {
            const res = await axios.get(`${API_URL}/settings/`);
            return Array.isArray(res.data) ? res.data : [];
        },
        initialData: [],
        staleTime: 60_000,
    });

    const pricingConfig = getPricingConfig(settings);
    const durationOptions = getDurationOptions(pricingConfig);

    useEffect(() => {
        // Simple pricing algorithm
        const computed = calculatePrice(duration, isVR, pricingConfig);
        setPrice(computed);
    }, [duration, isVR, pricingConfig]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await startSession({
                station_id: stationId,
                driver_name: driverName || undefined,
                duration_minutes: duration,
                price: price,
                payment_method: paymentMethod,
                is_vr: isVR
            });
            onSuccess();
            onClose();
        } catch (err) {
            console.error('Failed to start session:', err);
            toastApiError(err, 'Error al iniciar sesión');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-[var(--border-default)] flex justify-between items-center bg-[var(--bg-card)]/50">
                    <h2 className="text-xl font-bold text-[var(--text-primary)]">Nueva Sesión: {stationName}</h2>
                    <button onClick={onClose} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
                        <X size={24} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {/* MODE TOGGLE */}
                    <div className="flex bg-[var(--bg-card)] rounded-lg p-1 border border-[var(--border-default)]">
                        <button
                            type="button"
                            onClick={() => setIsVR(false)}
                            className={`flex-1 py-2 rounded-md text-sm font-bold flex items-center justify-center gap-2 transition-all ${!isVR ? 'bg-gray-700 text-[var(--text-primary)] shadow' : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'}`}
                        >
                            <Monitor size={16} /> Pantalla
                        </button>
                        <button
                            type="button"
                            onClick={() => setIsVR(true)}
                            className={`flex-1 py-2 rounded-md text-sm font-bold flex items-center justify-center gap-2 transition-all ${isVR ? 'bg-indigo-600 text-[var(--text-primary)] shadow' : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'}`}
                        >
                            <Glasses size={16} /> VR (+{pricingConfig.vrSurchargePerMin}€/min)
                        </button>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-[var(--text-tertiary)] uppercase mb-1">Duración</label>
                        <div className="grid grid-cols-4 gap-2 mb-2">
                            {durationOptions.map(m => (
                                <button
                                    key={m}
                                    type="button"
                                    onClick={() => setDuration(m)}
                                    className={`py-2 rounded-lg text-sm font-bold border transition-colors ${duration === m
                                        ? 'bg-blue-600 border-blue-500 text-[var(--text-primary)]'
                                        : 'bg-[var(--bg-card)] border-[var(--border-default)] text-[var(--text-tertiary)] hover:border-gray-500'
                                        }`}
                                >
                                    {m}m
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-[var(--text-tertiary)] uppercase mb-1">Piloto (Opcional)</label>
                        <div className="relative">
                            <User className="absolute left-3 top-2.5 text-[var(--text-tertiary)]" size={16} />
                            <input
                                type="text"
                                placeholder="Nombre del cliente..."
                                value={driverName}
                                onChange={(e) => setDriverName(e.target.value)}
                                className="w-full bg-[var(--bg-card)] border border-[var(--border-default)] rounded-xl py-2 pl-10 pr-4 text-[var(--text-primary)] focus:border-[var(--border-focus)] outline-none"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                        <label className="block text-xs font-bold text-[var(--text-tertiary)] uppercase mb-1">Precio (€)</label>
                        <div className="relative">
                            <DollarSign className="absolute left-3 top-2.5 text-[var(--text-tertiary)]" size={16} />
                            <input
                                type="number"
                                step="0.50"
                                value={price}
                                onChange={(e) => setPrice(Number(e.target.value))}
                                readOnly={!pricingConfig.allowManualOverride}
                                className={`w-full bg-[var(--bg-card)] border border-[var(--border-default)] rounded-xl py-2 pl-10 pr-4 text-[var(--text-primary)] focus:ring-2 focus:ring-green-500 outline-none font-mono font-bold text-lg ${pricingConfig.allowManualOverride ? '' : 'opacity-70 cursor-not-allowed'}`}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-[var(--text-tertiary)] uppercase mb-1">Pago</label>
                        <div className="relative">
                            <select
                                value={paymentMethod}
                                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setPaymentMethod(e.target.value as typeof paymentMethod)}
                                className="w-full bg-[var(--bg-card)] border border-[var(--border-default)] rounded-xl py-2.5 px-3 text-[var(--text-primary)] focus:ring-2 focus:ring-purple-500 outline-none appearance-none"
                            >
                                <option value="cash">💵 Efectivo</option>
                                <option value="card_nayax">💳 TPV / Card</option>
                                <option value="stripe_qr">🧾 Stripe QR</option>
                                <option value="bizum">📲 Bizum</option>
                                <option value="online">🌐 Online</option>
                            </select>
                        </div>
                    </div>
                    </div>

                    <div className="pt-4 flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-3 rounded-xl font-bold text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 bg-green-600 hover:bg-green-700 text-[var(--text-primary)] py-3 rounded-xl font-bold shadow-lg shadow-green-600/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Iniciando...' : 'Cobrar e Iniciar'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
