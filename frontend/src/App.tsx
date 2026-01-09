import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import Configuration from './pages/Configuration';
import ModsLibrary from './pages/ModsLibrary';
import ProfilesPage from './pages/ProfilesPage';
import Dashboard from './pages/Dashboard';
import Leaderboard from './pages/Leaderboard';
import MobileLeaderboard from './pages/MobileLeaderboard';
import { LayoutDashboard, Settings, Library, Users, Trophy } from 'lucide-react';

function NavItem({ to, icon: Icon, children }: { to: string, icon: any, children: React.ReactNode }) {
  const location = useLocation();
  const isActive = location.pathname === to;

  return (
    <Link
      to={to}
      className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${isActive
        ? 'bg-blue-600 text-white shadow-lg'
        : 'text-gray-400 hover:bg-gray-800 hover:text-white'
        }`}
    >
      <Icon size={20} />
      <span className="font-medium">{children}</span>
    </Link>
  );
}

function AppContent() {
  const location = useLocation();
  const isTVMode = location.pathname.startsWith('/tv');
  const isMobileView = location.pathname.startsWith('/mobile');

  const { data: branding } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await axios.get('http://localhost:8000/settings');
      return res.data;
    }
  });

  const barLogo = branding?.find((s: any) => s.key === 'bar_logo')?.value || '/logo.png';
  const barName = branding?.find((s: any) => s.key === 'bar_name')?.value || 'VRacing Bar';

  if (isTVMode || isMobileView) {
    return (
      <div className="flex h-screen bg-gray-900 text-white overflow-hidden">
        <div className="flex-1 overflow-auto">
          <Routes>
            <Route path="/tv/leaderboard" element={<Leaderboard />} />
            <Route path="/mobile" element={<MobileLeaderboard />} />
          </Routes>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-64 bg-gray-900 text-white flex flex-col">
        <div className="p-6 flex flex-col items-center">
          <img src={barLogo} alt="VRacing Bar" className="h-20 w-auto object-contain drop-shadow-[0_0_15px_rgba(59,130,246,0.5)] mb-2" />
          <h2 className="text-xs font-black uppercase tracking-[0.3em] text-blue-500 opacity-80">{barName}</h2>
        </div>

        <nav className="flex-1 px-4 space-y-2">
          <NavItem to="/" icon={LayoutDashboard}>Panel de Control</NavItem>
          <NavItem to="/config" icon={Settings}>Configuración</NavItem>
          <NavItem to="/mods" icon={Library}>Librería de Mods</NavItem>
          <NavItem to="/profiles" icon={Users}>Perfiles de Sesión</NavItem>
          <NavItem to="/leaderboard" icon={Trophy}>Rankings</NavItem>
        </nav>

        <div className="p-4 border-t border-gray-800">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold">A</div>
            <div>
              <p className="text-sm font-medium">Operador</p>
              <p className="text-xs text-green-400 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                Online
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/profiles" element={<ProfilesPage />} />
          <Route path="/mods" element={<ModsLibrary />} />
          <Route path="/config" element={<Configuration />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
        </Routes>
      </div>
    </div>
  );
}

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;
