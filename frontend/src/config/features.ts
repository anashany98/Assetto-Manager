export interface FeatureFlags {
    drivers: boolean;
    tournaments: boolean;     // /events
    championships: boolean;   // /championships
    history: boolean;         // /history
    bookings: boolean;        // /bookings
    tables: boolean;          // /reservations
    analytics: boolean;       // /analytics
    kiosk: boolean;           // /scenarios (Kiosk Sessions)
    mods: boolean;            // /mods
    online_reservations: boolean; // /online-reservations
    lap_comparison: boolean;  // /compare

    // System
    settings: boolean;
    editor: boolean;
    profiles: boolean;

    // Public Views
    tv_remote: boolean;
    tv_spectator: boolean;
    leaderboard: boolean;
    hall_of_fame: boolean;
    kiosk_menu: boolean;

    // TV Sub-features (Granular Control)
    tv_versus: boolean;
    tv_bracket: boolean;
    tv_sponsorship: boolean;
    tv_qr: boolean;
    ads_tab: boolean; // Settings Tab
}

/**
 * Feature Flags Configuration
 * 
 * Controls the visibility and availability of application modules.
 * This allows for "Lite" vs "Full" deployments and granular feature toggling.
 * 
 * Values are resolved in the following order:
 * 1. Environment Variables (VITE_FEATURE_*)
 * 2. Default Configuration (defined below)
 */

const DEFAULT_FEATURES: FeatureFlags = {
    // --- CORE MODULES ---
    mods: true,
    kiosk: true,          // Session Management & Kiosk Mode
    tournaments: true,    // Events & Scenarios management

    // --- SYSTEM MODULES (Essential) ---
    settings: true,
    editor: true,         // Assetto Corsa Configuration Editor
    profiles: true,       // Wheel/Controller Profiles

    // --- PUBLIC VIEWS (TV & Displays) ---
    tv_remote: true,      // Remote Control Interface
    tv_spectator: true,   // Spectator/Broadcast View
    leaderboard: true,    // Public Leaderboard
    hall_of_fame: true,   // Top Records View
    kiosk_menu: true,     // User Interaction Menu

    // --- OPTIONAL TV SUB-FEATURES (Default: Disabled) ---
    tv_versus: false,        // Head-to-Head View
    tv_bracket: false,       // Tournament Brackets
    tv_sponsorship: false,   // Sponsorship Overlay/Slides
    tv_qr: false,            // Mobile Portal QR Code

    // --- OPTIONAL SETTINGS ---
    ads_tab: false,          // Advertising Configuration Tab

    // --- EXTENDED MODULES (Default: Disabled / Upsell) ---
    drivers: false,          // Advanced Driver CRM
    championships: false,    // Season/Championship Logic
    history: false,          // Detailed Session History
    bookings: false,         // Simulator Reservations
    tables: false,           // Table/Venue Reservations
    analytics: false,        // Business Intelligence/Stats
    online_reservations: false, // Public Web Booking
    lap_comparison: false,   // Telemetry Analysis Tool
};

/**
 * Resolves the feature flag value, prioritizing Environment Variables.
 * Example: VITE_FEATURE_DRIVERS='true' will enable the 'drivers' module.
 */
export const FEATURES: FeatureFlags = Object.keys(DEFAULT_FEATURES).reduce((acc, key) => {
    const featureKey = key as keyof FeatureFlags;
    const envKey = `VITE_FEATURE_${featureKey.toUpperCase()}`;
    const envValue = import.meta.env[envKey];

    // Env vars are strings, so we check if it equals 'true'
    if (envValue !== undefined) {
        acc[featureKey] = envValue === 'true';
    } else {
        acc[featureKey] = DEFAULT_FEATURES[featureKey];
    }
    return acc;
}, {} as FeatureFlags);

export const isFeatureEnabled = (feature: keyof FeatureFlags): boolean => {
    return FEATURES[feature];
};
