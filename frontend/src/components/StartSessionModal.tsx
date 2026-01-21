import { useState, useEffect } from 'react';
import { X, DollarSign, User, Monitor, Glasses } from 'lucide-react';
import { startSession } from '../api/sessions';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { API_URL } from '../config';

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
    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card_nayax' | 'online'>('cash');
    const [isVR, setIsVR] = useState(initialIsVR || false);

    // Fetch branding/settings for pricing
    const { data: settings } = useQuery({
        queryKey: ['settings'],
        queryFn: async () => {
            const res = await axios.get(`${API_URL}/settings/`);
            return Array.isArray(res.data) ? res.data : [];
        },
        initialData: []
    });

    const getSetting = (key: string, defaultVal: number) => {
        const s = settings.find((item: any) => item.key === key);
        return s ? parseFloat(s.value) : defaultVal;
    };

    const BASE_RATE = getSetting('pricing_base_15min', 5.0);
    const VR_SURCHARGE_PER_15_MIN = getSetting('pricing_vr_surcharge', 2.0);

    useEffect(() => {
        // Simple pricing algorithm
        const segments = duration / 15;
        let p = segments * BASE_RATE;
        if (isVR) {
            p += segments * VR_SURCHARGE_PER_15_MIN;
        }
        // Discount for longer sessions? e.g. 60m = 4 segments = 20€. maybe 15€?
        if (duration === 30) p -= 1; // 9€ instead of 10€
        if (duration === 60) p -= 5; // 15€ instead of 20€

        // Apply VR again if logic needs to be strict, but let's keep it editable.
        setPrice(p);
    }, [duration, isVR, BASE_RATE, VR_SURCHARGE_PER_15_MIN]);

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
            alert("Error al iniciar sesión");
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-gray-800 border border-gray-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center bg-gray-900/50">
                    <h2 className="text-xl font-bold text-white">Nueva Sesión: {stationName}</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        <X size={24} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {/* MODE TOGGLE */}
                    <div className="flex bg-gray-900 rounded-lg p-1 border border-gray-700">
                        <button
                            type="button"
                            onClick={() => setIsVR(false)}
                            className={`flex-1 py-2 rounded-md text-sm font-bold flex items-center justify-center gap-2 transition-all ${!isVR ? 'bg-gray-700 text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                            <Monitor size={16} /> Pantalla
                        </button>
                        <button
                            type="button"
                            onClick={() => setIsVR(true)}
                            className={`flex-1 py-2 rounded-md text-sm font-bold flex items-center justify-center gap-2 transition-all ${isVR ? 'bg-indigo-600 text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                            <Glasses size={16} /> VR (+{VR_SURCHARGE_PER_15_MIN}€)
                        </button>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Duración</label>
                        <div className="grid grid-cols-4 gap-2 mb-2">
                            {[10, 15, 30, 60].map(m => (
                                <button
                                    key={m}
                                    type="button"
                                    onClick={() => setDuration(m)}
                                    className={`py-2 rounded-lg text-sm font-bold border transition-colors ${duration === m
                                        ? 'bg-blue-600 border-blue-500 text-white'
                                        : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500'
                                        }`}
                                >
                                    {m}m
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Piloto (Opcional)</label>
                        <div className="relative">
                            <User className="absolute left-3 top-2.5 text-gray-500" size={16} />
                            <input
                                type="text"
                                placeholder="Nombre del cliente..."
                                value={driverName}
                                onChange={(e) => setDriverName(e.target.value)}
                                className="w-full bg-gray-900 border border-gray-700 rounded-xl py-2 pl-10 pr-4 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Precio (€)</label>
                            <div className="relative">
                                <DollarSign className="absolute left-3 top-2.5 text-gray-500" size={16} />
                                <input
                                    type="number"
                                    step="0.50"
                                    value={price}
                                    onChange={(e) => setPrice(Number(e.target.value))}
                                    className="w-full bg-gray-900 border border-gray-700 rounded-xl py-2 pl-10 pr-4 text-white focus:ring-2 focus:ring-green-500 outline-none font-mono font-bold text-lg"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Pago</label>
                            <div className="relative">
                                <select
                                    value={paymentMethod}
                                    onChange={(e: any) => setPaymentMethod(e.target.value)}
                                    className="w-full bg-gray-900 border border-gray-700 rounded-xl py-2.5 px-3 text-white focus:ring-2 focus:ring-purple-500 outline-none appearance-none"
                                >
                                    <option value="cash">💵 Efectivo</option>
                                    <option value="card_nayax">💳 TPV / Card</option>
                                    <option value="online">🌐 Online</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-3 rounded-xl font-bold text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl font-bold shadow-lg shadow-green-600/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Iniciando...' : 'Cobrar e Iniciar'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
