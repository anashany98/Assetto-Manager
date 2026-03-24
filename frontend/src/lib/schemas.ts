/**
 * Shared Zod validation schemas used across form components.
 * Keep schemas here so validation rules stay consistent between
 * the public booking page, the admin booking panel, and the API layer.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const emailSchema = z
    .string()
    .trim()
    .email('Email inválido')
    .max(254, 'Email demasiado largo');

export const optionalEmailSchema = z
    .string()
    .trim()
    .email('Email inválido')
    .max(254, 'Email demasiado largo')
    .or(z.literal(''))
    .optional();

export const phoneSchema = z
    .string()
    .trim()
    .max(30, 'Teléfono demasiado largo')
    .regex(/^[+\d\s\-().]*$/, 'Formato de teléfono inválido')
    .optional()
    .or(z.literal(''));

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const loginSchema = z.object({
    username: z.string().trim().min(1, 'Usuario requerido'),
    password: z.string().min(1, 'Contraseña requerida'),
});

export type LoginFormData = z.infer<typeof loginSchema>;

export const userSetupSchema = z.object({
    username: z
        .string()
        .trim()
        .min(3, 'Mínimo 3 caracteres')
        .max(50, 'Máximo 50 caracteres')
        .regex(/^[a-zA-Z0-9_\-.]+$/, 'Solo letras, números, guiones y puntos'),
    password: z
        .string()
        .min(8, 'Mínimo 8 caracteres')
        .max(128, 'Máximo 128 caracteres'),
    confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
});

export type UserSetupFormData = z.infer<typeof userSetupSchema>;

// ---------------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------------

export const bookingSchema = z.object({
    customer_name: z
        .string()
        .trim()
        .min(1, 'Nombre requerido')
        .max(120, 'Nombre demasiado largo'),
    customer_email: optionalEmailSchema,
    customer_phone: phoneSchema,
    num_players: z
        .number({ invalid_type_error: 'Número inválido' })
        .int()
        .min(1, 'Mínimo 1 jugador')
        .max(50, 'Máximo 50 jugadores'),
    duration_minutes: z
        .number({ invalid_type_error: 'Número inválido' })
        .int()
        .min(5, 'Mínimo 5 minutos')
        .max(480, 'Máximo 8 horas'),
    notes: z.string().max(1000, 'Máximo 1000 caracteres').optional().or(z.literal('')),
});

export type BookingFormData = z.infer<typeof bookingSchema>;

// ---------------------------------------------------------------------------
// Table bookings (public / manage page)
// ---------------------------------------------------------------------------

export const tableBookingSchema = z.object({
    customer_name: z
        .string()
        .trim()
        .min(1, 'Nombre requerido')
        .max(120, 'Nombre demasiado largo'),
    customer_email: optionalEmailSchema,
    customer_phone: phoneSchema,
    pax: z
        .number({ invalid_type_error: 'Número inválido' })
        .int()
        .min(1, 'Mínimo 1 persona')
        .max(50, 'Máximo 50 personas'),
    notes: z.string().max(1000, 'Máximo 1000 caracteres').optional().or(z.literal('')),
});

export type TableBookingFormData = z.infer<typeof tableBookingSchema>;

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export const eventSchema = z.object({
    name: z
        .string()
        .trim()
        .min(1, 'Nombre requerido')
        .max(120, 'Máximo 120 caracteres'),
    description: z.string().max(500, 'Máximo 500 caracteres').optional().or(z.literal('')),
    start_date: z.string().min(1, 'Fecha de inicio requerida'),
    end_date: z.string().optional().or(z.literal('')),
    track_name: z.string().max(100, 'Máximo 100 caracteres').optional().or(z.literal('')),
    allowed_cars: z.string().max(500, 'Máximo 500 caracteres').optional().or(z.literal('')),
    status: z.enum(['upcoming', 'active', 'completed', 'cancelled']),
    rules: z.string().max(2000, 'Máximo 2000 caracteres').optional().or(z.literal('')),
}).refine(data => {
    if (data.end_date && data.start_date && data.end_date < data.start_date) {
        return false;
    }
    return true;
}, {
    message: 'La fecha de fin no puede ser anterior a la de inicio',
    path: ['end_date'],
});

export type EventFormData = z.infer<typeof eventSchema>;

// ---------------------------------------------------------------------------
// Drivers
// ---------------------------------------------------------------------------

export const driverSchema = z.object({
    name: z
        .string()
        .trim()
        .min(1, 'Nombre requerido')
        .max(100, 'Máximo 100 caracteres'),
    email: optionalEmailSchema,
    phone: phoneSchema,
    notes: z.string().max(500, 'Máximo 500 caracteres').optional().or(z.literal('')),
});

export type DriverFormData = z.infer<typeof driverSchema>;
