/**
 * Centralized API error parsing.
 *
 * Usage:
 *   import { parseApiError, toastApiError } from '../lib/apiError';
 *
 *   try { ... }
 *   catch (err) { toastApiError(err); }
 *   // or
 *   catch (err) { setError(parseApiError(err)); }
 */

import { toast } from 'sonner';

interface ApiErrorBody {
    detail?: string | { msg: string }[] | unknown;
    message?: string;
}

/**
 * Extracts a human-readable message from an Axios error, a plain Error,
 * or any unknown thrown value. Falls back to `fallback`.
 */
export function parseApiError(err: unknown, fallback = 'Error inesperado'): string {
    if (!err) return fallback;

    // Axios error: err.response.data contains the backend JSON body
    if (typeof err === 'object' && err !== null) {
        const e = err as { response?: { data?: ApiErrorBody; status?: number }; message?: string };

        if (e.response?.data) {
            const data = e.response.data;

            // FastAPI validation error → array of {msg, loc, type}
            if (Array.isArray(data.detail)) {
                return data.detail
                    .map((d) => (typeof d === 'object' && d !== null && 'msg' in d ? String((d as { msg: string }).msg) : String(d)))
                    .join(', ');
            }

            // Standard backend error string
            if (typeof data.detail === 'string') return data.detail;
            if (typeof data.message === 'string') return data.message;
        }

        // Network / timeout errors from Axios
        if (e.response?.status === 429) return 'Demasiadas solicitudes. Por favor espera un momento.';
        if (e.response?.status === 403) return 'No tienes permiso para realizar esta acción.';
        if (e.response?.status === 401) return 'Sesión expirada. Por favor inicia sesión de nuevo.';
        if (e.response?.status === 404) return 'Recurso no encontrado.';
        if (e.response?.status !== undefined && e.response.status >= 500)
            return 'Error interno del servidor. Inténtalo de nuevo más tarde.';

        if (typeof e.message === 'string') return e.message;
    }

    if (typeof err === 'string') return err;
    return fallback;
}

/** Shows a Sonner toast with the parsed error message. */
export function toastApiError(err: unknown, fallback?: string): void {
    toast.error(parseApiError(err, fallback));
}

/** Shows a Sonner toast on success. */
export function toastSuccess(message: string): void {
    toast.success(message);
}
