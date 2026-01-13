import { useParams } from 'react-router-dom';
import SessionAnalysis from '../components/SessionAnalysis';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function LapAnalysisPage() {
    const { id } = useParams();

    if (!id) return <div>ID de vuelta no encontrado</div>;

    return (
        <div className="min-h-screen bg-black text-white p-4">
            <div className="max-w-md mx-auto">
                <Link to="/" className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition-colors">
                    <ArrowLeft size={20} />
                    Volver
                </Link>

                <div className="mb-6">
                    <h1 className="text-2xl font-black italic">TELEMETRÍA</h1>
                    <p className="text-gray-500">Informe de tu última sesión</p>
                </div>

                <SessionAnalysis lapId={parseInt(id)} />

                <div className="mt-8 text-center">
                    <p className="text-xs text-gray-600">
                        VRacing Telemetry System v1.0
                    </p>
                </div>
            </div>
        </div>
    );
}
