import axios from 'axios';
import { API_URL } from '../config';

export type PaymentProvider = 'stripe_qr' | 'bizum';

export type PaymentCheckoutRequest = {
    provider: PaymentProvider;
    station_id: number;
    duration_minutes: number;
    driver_name?: string;
    scenario_id?: number;
    is_vr?: boolean;
};

export type PaymentStatus = {
    id: number;
    provider: PaymentProvider;
    status: 'pending' | 'paid' | 'failed' | 'expired';
    amount: number;
    currency: string;
    checkout_url?: string;
    instructions?: string;
    reference?: string;
};

export const createPaymentCheckout = async (data: PaymentCheckoutRequest, headers: Record<string, string> = {}) => {
    const response = await axios.post(`${API_URL}/payments/checkout`, data, { headers });
    return response.data as PaymentStatus;
};

export const getPaymentStatus = async (paymentId: number, headers: Record<string, string> = {}) => {
    const response = await axios.get(`${API_URL}/payments/${paymentId}`, { headers });
    return response.data as PaymentStatus;
};
