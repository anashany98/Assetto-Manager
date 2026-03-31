import React, { useEffect, useRef } from 'react';
import type { KioskSelection } from './types';

interface NoPaymentStepProps {
    paymentEnabled: boolean;
    launchWithoutPayment: () => void;
    selection: KioskSelection | null;
    stationId: number;
}

export const NoPaymentStep: React.FC<NoPaymentStepProps> = ({
    paymentEnabled, launchWithoutPayment
}) => {
    const hasLaunchedRef = useRef(false);

    useEffect(() => {
        if (!paymentEnabled && !hasLaunchedRef.current) {
            hasLaunchedRef.current = true;
            launchWithoutPayment();
        }
    }, [paymentEnabled, launchWithoutPayment]);

    return (
        <div className="h-full flex flex-col items-center justify-center animate-in zoom-in duration-300 max-w-3xl mx-auto w-full text-center px-4">
            <h2 className="text-3xl font-black text-white mb-3">Iniciando sesion</h2>
            <p className="text-slate-400">El pago esta desactivado. Lanzando la sesion...</p>
        </div>
    );
};
