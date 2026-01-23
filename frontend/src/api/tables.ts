import axios from 'axios';
import { API_URL } from '../config';

export interface RestaurantTable {
    id: number;
    label: string;
    x: number;
    y: number;
    width: number;
    height: number;
    shape: 'rect' | 'circle';
    seats: number;
    rotation: number;
    zone: string;
    fixed_notes?: string;
    is_active: boolean;
    status: 'free' | 'occupied' | 'bill' | 'cleaning' | 'reserved';
}

export interface TableBooking {
    id: number;
    table_ids: number[];
    customer_name: string;
    customer_phone?: string;
    customer_email?: string;
    start_time: string;
    end_time: string;
    pax: number;
    status: 'confirmed' | 'seated' | 'cancelled' | 'completed';
    notes?: string;
}

export const getTables = async (): Promise<RestaurantTable[]> => {
    const res = await axios.get(`${API_URL}/tables/`);
    return res.data;
};

export const updateLayout = async (tables: Partial<RestaurantTable>[]): Promise<RestaurantTable[]> => {
    const res = await axios.post(`${API_URL}/tables/layout`, tables);
    return res.data;
};

export const getBookings = async (startDate: string, endDate?: string): Promise<TableBooking[]> => {
    const res = await axios.get(`${API_URL}/tables/bookings`, {
        params: { start_date: startDate, end_date: endDate }
    });
    return res.data;
};

export const createBooking = async (booking: Omit<TableBooking, 'id' | 'status'>): Promise<TableBooking> => {
    const res = await axios.post(`${API_URL}/tables/bookings`, booking);
    return res.data;
};

export const updateTableStatus = async (tableId: number, status: string): Promise<void> => {
    await axios.put(`${API_URL}/tables/${tableId}/status`, { status });
};

export const findBestFit = async (pax: number, date: string, time: string): Promise<{ strategy: string, table_ids: number[], reason: string }> => {
    const res = await axios.post(`${API_URL}/tables/find-best-fit`, { pax, date, time });
    return res.data;
};
