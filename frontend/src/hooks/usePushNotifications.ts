import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API_URL } from '../config';

interface PushNotificationState {
    isSupported: boolean;
    isSubscribed: boolean;
    permission: NotificationPermission;
    loading: boolean;
    error: string | null;
}

export function usePushNotifications() {
    const [state, setState] = useState<PushNotificationState>({
        isSupported: false,
        isSubscribed: false,
        permission: 'default',
        loading: false,
        error: null
    });

    useEffect(() => {
        // Check if push notifications are supported
        const isSupported = 'serviceWorker' in navigator && 'PushManager' in window;
        setState(prev => ({
            ...prev,
            isSupported,
            permission: isSupported ? Notification.permission : 'denied'
        }));

        // Check if already subscribed
        if (isSupported && navigator.serviceWorker.controller) {
            checkExistingSubscription();
        }
    }, []);

    const checkExistingSubscription = async () => {
        try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();
            setState(prev => ({ ...prev, isSubscribed: !!subscription }));
        } catch (err) {
            console.error('Error checking subscription:', err);
        }
    };

    const subscribe = useCallback(async () => {
        if (!state.isSupported) {
            setState(prev => ({ ...prev, error: 'Push notifications not supported' }));
            return false;
        }

        setState(prev => ({ ...prev, loading: true, error: null }));

        try {
            // Request permission
            const permission = await Notification.requestPermission();
            setState(prev => ({ ...prev, permission }));

            if (permission !== 'granted') {
                setState(prev => ({
                    ...prev,
                    loading: false,
                    error: 'Permission denied'
                }));
                return false;
            }

            // Get service worker registration
            const registration = await navigator.serviceWorker.ready;

            // Get VAPID public key from server
            const vapidResponse = await axios.get(`${API_URL}/push/vapid-key`);
            const vapidPublicKey = vapidResponse.data.publicKey;

            // Subscribe to push
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
            });

            // Send subscription to backend
            const subscriptionJson = subscription.toJSON();
            await axios.post(`${API_URL}/push/subscribe`, {
                endpoint: subscriptionJson.endpoint,
                keys: subscriptionJson.keys
            });

            setState(prev => ({
                ...prev,
                isSubscribed: true,
                loading: false
            }));
            return true;

        } catch (err) {
            console.error('Subscription error:', err);
            setState(prev => ({
                ...prev,
                loading: false,
                error: err instanceof Error ? err.message : 'Subscription failed'
            }));
            return false;
        }
    }, [state.isSupported]);

    const unsubscribe = useCallback(async () => {
        setState(prev => ({ ...prev, loading: true }));

        try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();

            if (subscription) {
                // Unsubscribe from browser
                await subscription.unsubscribe();

                // Notify backend
                await axios.delete(`${API_URL}/push/unsubscribe`, {
                    params: { endpoint: subscription.endpoint }
                });
            }

            setState(prev => ({
                ...prev,
                isSubscribed: false,
                loading: false
            }));
            return true;

        } catch (err) {
            console.error('Unsubscribe error:', err);
            setState(prev => ({
                ...prev,
                loading: false,
                error: err instanceof Error ? err.message : 'Unsubscribe failed'
            }));
            return false;
        }
    }, []);

    return {
        ...state,
        subscribe,
        unsubscribe
    };
}

// Helper function to convert VAPID key
function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray.buffer as ArrayBuffer;
}
