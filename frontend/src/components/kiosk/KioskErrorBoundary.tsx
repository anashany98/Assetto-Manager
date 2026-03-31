import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
    children: ReactNode;
    onReset?: () => void;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class KioskErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Kiosk Error Boundary caught:', error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="h-screen w-screen bg-gray-950 text-white flex items-center justify-center">
                    <div className="text-center max-w-xl px-6">
                        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-500/20 text-red-400 mb-6">
                            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10"/>
                                <line x1="15" y1="9" x2="9" y2="15"/>
                                <line x1="9" y1="9" x2="15" y2="15"/>
                            </svg>
                        </div>
                        <h1 className="text-4xl font-black uppercase mb-3">Error del sistema</h1>
                        <p className="text-gray-400 text-lg mb-4">
                            Ha ocurrido un error inesperado. Por favor, reinicia la sesion.
                        </p>
                        {this.state.error && (
                            <p className="text-gray-600 text-xs mb-6 font-mono break-all">
                                {this.state.error.message}
                            </p>
                        )}
                        <button
                            onClick={() => {
                                this.setState({ hasError: false, error: null });
                                this.props.onReset?.();
                                window.location.reload();
                            }}
                            className="px-8 py-4 bg-red-500 hover:bg-red-400 text-black font-black uppercase tracking-widest rounded-xl text-lg"
                        >
                            Reiniciar
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
