/**
 * Branding Tab Component - Local identity, logo, ticker, QR settings
 * Extracted from SettingsPage.tsx to reduce component complexity.
 */
import { useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'sonner';
import {
    Layout, Activity, Globe, Bell, QrCode
} from 'lucide-react';
import { API_URL } from '../../../config';
import { parseApiError } from '../../../lib/apiError';
import { usePushNotifications } from '../../../hooks/usePushNotifications';
import WallpaperSettings from '../../../components/WallpaperSettings';
import { cn } from '../../../lib/utils';

interface BrandingTabProps {
    barName: string;
    barLogo: string;
    safeBranding: Array<{ key: string; value: string }>;
    updateBranding: ReturnType<typeof useMutation>;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    handleLogoUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
}

export default function BrandingTab({
    barName,
    barLogo,
    safeBranding,
    updateBranding,
    fileInputRef,
    handleLogoUpload,
}: BrandingTabProps) {
    const queryClient = useQueryClient();
    const pushNotifications = usePushNotifications();

    return (
        <div className="max-w-5xl space-y-8 animate-in fade-in duration-300">
            {/* Identity */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-[var(--bg-elevated)] p-8 rounded-3xl border border-[var(--border-default)]">
                    <h2 className="text-xl font-black text-[var(--text-primary)] uppercase mb-6 flex items-center">
                        <Layout className="mr-2 text-blue-400" /> Identidad
                    </h2>
                    <label className="block text-xs font-bold text-[var(--text-tertiary)] uppercase mb-2">
                        Nombre del Local
                    </label>
                    <input
                        className="w-full p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-default)] text-[var(--text-primary)] font-bold outline-none focus:border-blue-500 transition-all"
                        defaultValue={barName}
                        onBlur={e => updateBranding.mutate({ key: 'bar_name', value: e.target.value })}
                    />
                    <div className="mt-6">
                        <label className="block text-xs font-bold text-[var(--text-tertiary)] uppercase mb-2">Logo</label>
                        <div className="flex items-center space-x-4">
                            <img
                                src={barLogo}
                                className="h-16 w-16 object-contain bg-[var(--bg-card)] rounded-lg p-2"
                                onError={(e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.src = '/logo.png'; }}
                            />
                            <div className="flex-1">
                                <input
                                    className="w-full p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border-default)] text-xs font-mono text-[var(--text-tertiary)] mb-2"
                                    defaultValue={barLogo}
                                    onBlur={e => updateBranding.mutate({ key: 'bar_logo', value: e.target.value })}
                                />
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="text-xs bg-gray-700 text-[var(--text-primary)] px-3 py-1.5 rounded-lg hover:bg-gray-600 uppercase font-bold"
                                >
                                    Subir Archivo
                                </button>
                                <input type="file" hidden ref={fileInputRef} onChange={handleLogoUpload} accept="image/*" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Ticker / Promo */}
                <div className="bg-[var(--bg-elevated)] p-8 rounded-3xl border border-[var(--border-default)]">
                    <h2 className="text-xl font-black text-[var(--text-primary)] uppercase mb-6 flex items-center">
                        <Activity className="mr-2 text-yellow-400" /> Ticker Noticias
                    </h2>
                    <label className="block text-xs font-bold text-[var(--text-tertiary)] uppercase mb-2">
                        Mensaje Promocional
                    </label>
                    <textarea
                        className="w-full p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-default)] text-[var(--text-primary)] font-bold outline-none focus:border-yellow-500 transition-all min-h-[100px]"
                        defaultValue={safeBranding.find((s: { key: string; value: string }) => s.key === 'promo_text')?.value}
                        onBlur={e => updateBranding.mutate({ key: 'promo_text', value: e.target.value })}
                    />
                    <div className="mt-4 flex items-center justify-between">
                        <span className="text-sm font-bold text-[var(--text-tertiary)]">Velocidad</span>
                        <input
                            type="range"
                            min="20"
                            max="200"
                            className="w-1/2 accent-yellow-500"
                            defaultValue={safeBranding.find((s: { key: string; value: string }) => s.key === 'ticker_speed')?.value || 80}
                            onChange={e => updateBranding.mutate({ key: 'ticker_speed', value: e.target.value })}
                        />
                    </div>
                </div>
            </div>

            {/* Public Access (QR) */}
            <div className="bg-[var(--bg-elevated)] p-8 rounded-3xl border border-[var(--border-default)]">
                <h2 className="text-xl font-black text-[var(--text-primary)] uppercase mb-6 flex items-center">
                    <Globe className="mr-2 text-green-400" /> Acceso Público (QR)
                </h2>
                <div className="flex flex-col md:flex-row gap-6 items-center">
                    <div className="flex-1 w-full">
                        <label className="block text-xs font-bold text-[var(--text-tertiary)] uppercase mb-2">URL Pública</label>
                        <input
                            className="w-full p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-default)] font-mono text-sm text-blue-300"
                            defaultValue={safeBranding.find((s: { key: string; value: string }) => s.key === 'bar_public_url')?.value}
                            onBlur={e => updateBranding.mutate({ key: 'bar_public_url', value: e.target.value })}
                        />
                        <button
                            onClick={() => updateBranding.mutate({
                                key: 'bar_public_url',
                                value: `${window.location.protocol}//${window.location.hostname}:${window.location.port}/mobile`
                            })}
                            className="mt-2 text-xs text-blue-500 hover:text-blue-400 font-bold uppercase underline"
                        >
                            Usar IP Local Detectada
                        </button>
                    </div>
                    <div className="flex items-center space-x-3 bg-[var(--bg-card)] p-4 rounded-xl border border-[var(--border-default)]">
                        <QrCode className="text-[var(--text-primary)]" size={32} />
                        <div>
                            <p className="text-xs font-bold text-[var(--text-tertiary)] uppercase">Mostrar en TV</p>
                            <input
                                type="checkbox"
                                className="w-5 h-5 accent-blue-500"
                                defaultChecked={safeBranding.find((s: { key: string; value: string }) => s.key === 'show_qr')?.value === 'true'}
                                onChange={e => updateBranding.mutate({ key: 'show_qr', value: e.target.checked ? 'true' : 'false' })}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Video Wallpapers */}
            <WallpaperSettings />

            {/* Push Notifications */}
            <div className="bg-[var(--bg-elevated)] p-8 rounded-3xl border border-[var(--border-default)]">
                <h2 className="text-xl font-black text-[var(--text-primary)] uppercase mb-6 flex items-center">
                    <Bell className="mr-2 text-purple-400" /> Notificaciones Push
                </h2>
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm font-bold text-[var(--text-secondary)]">Recibir alertas de nuevos récords y eventos</p>
                        <p className="text-xs text-[var(--text-tertiary)] mt-1">
                            {!pushNotifications.isSupported && 'Tu navegador no soporta notificaciones push'}
                            {pushNotifications.isSupported && pushNotifications.permission === 'denied' && 'Permisos denegados - activa en config del navegador'}
                            {pushNotifications.isSupported && pushNotifications.permission !== 'denied' && (pushNotifications.isSubscribed ? 'Suscrito ✓' : 'Click para activar')}
                        </p>
                    </div>
                    <button
                        onClick={() => pushNotifications.isSubscribed ? pushNotifications.unsubscribe() : pushNotifications.subscribe()}
                        disabled={!pushNotifications.isSupported || pushNotifications.loading || pushNotifications.permission === 'denied'}
                        className={cn(
                            "relative w-14 h-7 rounded-full transition-colors",
                            pushNotifications.isSubscribed ? "bg-purple-500" : "bg-gray-600",
                            (!pushNotifications.isSupported || pushNotifications.permission === 'denied') && "opacity-50 cursor-not-allowed"
                        )}
                    >
                        <div className={cn(
                            "absolute top-1 left-1 w-5 h-5 rounded-full bg-[var(--bg-card)] transition-transform",
                            pushNotifications.isSubscribed && "translate-x-7"
                        )} />
                    </button>
                </div>
            </div>
        </div>
    );
}
