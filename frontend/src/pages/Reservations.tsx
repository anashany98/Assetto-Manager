import { useState, useEffect } from 'react';
import { Calendar, Clock, User, Phone, Mail, Plus, Trash2, Check, X, RefreshCw } from 'lucide-react';
import api from '../api/client';

interface Reservation {
    id: number;
    station_id: number | null;
    station_name: string | null;
    client_name: string;
    client_email: string | null;
    client_phone: string | null;
    start_time: string;
    end_time: string;
    duration_minutes: number;
    status: string;
    notes: string | null;
    price: number | null;
    paid: boolean;
}

interface Station {
    id: number;
    name: string;
}

export default function Reservations() {
    const [reservations, setReservations] = useState<Reservation[]>([]);
    const [stations, setStations] = useState<Station[]>([]);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({
        station_id: '',
        client_name: '',
        client_email: '',
        client_phone: '',
        start_time: '',
        duration_minutes: 30,
        notes: '',
        price: ''
    });

    useEffect(() => {
        fetchReservations();
        fetchStations();
    }, [selectedDate]);

    const fetchReservations = async () => {
        try {
            const res = await api.get(`/reservations/?date=${selectedDate}`);
            setReservations(res.data);
        } catch (err) {
            console.error('Error fetching reservations:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchStations = async () => {
        try {
            const res = await api.get('/stations/');
            setStations(res.data);
        } catch (err) {
            console.error('Error fetching stations:', err);
        }
    };

    const createReservation = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post('/reservations/', {
                ...formData,
                station_id: formData.station_id ? parseInt(formData.station_id) : null,
                start_time: new Date(formData.start_time).toISOString(),
                price: formData.price ? parseFloat(formData.price) : null
            });
            setShowForm(false);
            setFormData({ station_id: '', client_name: '', client_email: '', client_phone: '', start_time: '', duration_minutes: 30, notes: '', price: '' });
            fetchReservations();
        } catch (err: any) {
            alert(err.response?.data?.detail || 'Error al crear reserva');
        }
    };

    const updateStatus = async (id: number, status: string) => {
        try {
            await api.put(`/reservations/${id}`, { status });
            fetchReservations();
        } catch (err) {
            console.error('Error updating reservation:', err);
        }
    };

    const cancelReservation = async (id: number) => {
        if (!confirm('¿Cancelar esta reserva?')) return;
        try {
            await api.delete(`/reservations/${id}`);
            fetchReservations();
        } catch (err) {
            console.error('Error cancelling reservation:', err);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'confirmed': return 'bg-green-500/20 text-green-400 border-green-500/30';
            case 'pending': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
            case 'cancelled': return 'bg-red-500/20 text-red-400 border-red-500/30';
            case 'completed': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
            default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
        }
    };

    const formatTime = (isoString: string) => {
        return new Date(isoString).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-white">Reservas</h1>
                    <p className="text-gray-400 mt-1">Gestión de reservas online</p>
                </div>
                <div className="flex gap-3">
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                    />
                    <button
                        onClick={() => setShowForm(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                    >
                        <Plus size={18} /> Nueva Reserva
                    </button>
                </div>
            </div>

            {/* Reservations Grid */}
            {loading ? (
                <div className="flex justify-center py-12">
                    <RefreshCw className="animate-spin text-blue-500" size={32} />
                </div>
            ) : reservations.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                    <Calendar size={48} className="mx-auto mb-4 opacity-50" />
                    <p>No hay reservas para esta fecha</p>
                </div>
            ) : (
                <div className="grid gap-4">
                    {reservations.map((r) => (
                        <div key={r.id} className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="text-center min-w-[80px]">
                                    <div className="text-2xl font-bold text-white">{formatTime(r.start_time)}</div>
                                    <div className="text-xs text-gray-400">{r.duration_minutes} min</div>
                                </div>
                                <div className="border-l border-gray-600 pl-4">
                                    <div className="flex items-center gap-2 text-white font-medium">
                                        <User size={16} /> {r.client_name}
                                    </div>
                                    <div className="flex gap-4 text-sm text-gray-400 mt-1">
                                        {r.client_phone && <span className="flex items-center gap-1"><Phone size={12} /> {r.client_phone}</span>}
                                        {r.client_email && <span className="flex items-center gap-1"><Mail size={12} /> {r.client_email}</span>}
                                    </div>
                                    {r.station_name && <div className="text-xs text-blue-400 mt-1">📍 {r.station_name}</div>}
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(r.status)}`}>
                                    {r.status.toUpperCase()}
                                </span>
                                {r.status === 'pending' && (
                                    <button onClick={() => updateStatus(r.id, 'confirmed')} className="p-2 bg-green-600/20 text-green-400 rounded-lg hover:bg-green-600/30">
                                        <Check size={16} />
                                    </button>
                                )}
                                {r.status !== 'cancelled' && (
                                    <button onClick={() => cancelReservation(r.id)} className="p-2 bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30">
                                        <Trash2 size={16} />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* New Reservation Modal */}
            {showForm && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
                    <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 w-full max-w-md">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold text-white">Nueva Reserva</h2>
                            <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-white"><X size={20} /></button>
                        </div>
                        <form onSubmit={createReservation} className="space-y-4">
                            <input
                                type="text"
                                placeholder="Nombre del cliente *"
                                value={formData.client_name}
                                onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
                                required
                                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400"
                            />
                            <div className="grid grid-cols-2 gap-3">
                                <input
                                    type="email"
                                    placeholder="Email"
                                    value={formData.client_email}
                                    onChange={(e) => setFormData({ ...formData, client_email: e.target.value })}
                                    className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400"
                                />
                                <input
                                    type="tel"
                                    placeholder="Teléfono"
                                    value={formData.client_phone}
                                    onChange={(e) => setFormData({ ...formData, client_phone: e.target.value })}
                                    className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400"
                                />
                            </div>
                            <select
                                value={formData.station_id}
                                onChange={(e) => setFormData({ ...formData, station_id: e.target.value })}
                                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                            >
                                <option value="">Cualquier Simulador</option>
                                {stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                            <div className="grid grid-cols-2 gap-3">
                                <input
                                    type="datetime-local"
                                    value={formData.start_time}
                                    onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                                    required
                                    className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                                />
                                <select
                                    value={formData.duration_minutes}
                                    onChange={(e) => setFormData({ ...formData, duration_minutes: parseInt(e.target.value) })}
                                    className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                                >
                                    <option value={15}>15 min</option>
                                    <option value={30}>30 min</option>
                                    <option value={45}>45 min</option>
                                    <option value={60}>1 hora</option>
                                </select>
                            </div>
                            <input
                                type="number"
                                placeholder="Precio (€)"
                                value={formData.price}
                                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400"
                            />
                            <button type="submit" className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors">
                                Crear Reserva
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
