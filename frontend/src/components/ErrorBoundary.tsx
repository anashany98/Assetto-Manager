import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4 text-white">
                    <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl max-w-md w-full text-center border border-gray-700">
                        <div className="bg-red-500/10 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                            <AlertTriangle size={40} className="text-red-500" />
                        </div>

                        <h1 className="text-2xl font-bold mb-2">Algo ha salido mal</h1>
                        <p className="text-gray-400 mb-6">
                            La aplicación ha encontrado un error inesperado.
                        </p>

                        {this.state.error && (
                            <div className="bg-black/30 p-4 rounded-lg text-left mb-6 overflow-auto max-h-32">
                                <code className="text-red-400 text-xs font-mono">
                                    {this.state.error.toString()}
                                </code>
                            </div>
                        )}

                        <button
                            onClick={() => window.location.reload()}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center transition-colors shadow-lg shadow-blue-900/20"
                        >
                            <RefreshCw size={20} className="mr-2" />
                            Recargar Aplicación
                        </button>
                    </div>

                    <p className="mt-8 text-gray-600 text-xs">
                        Si el error persiste, contacta con el administrador del sistema.
                    </p>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
