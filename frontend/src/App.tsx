import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import Configuration from './pages/Configuration';
import ConfigPage from './pages/ConfigPage';

// New imports for Championships
import ChampionshipsPage from './pages/ChampionshipsPage';
import ChampionshipDetails from './pages/ChampionshipDetails';
import ModsLibrary from './pages/ModsLibrary';
import ProfilesPage from './pages/ProfilesPage';
import Dashboard from './pages/Dashboard';
import Leaderboard from './pages/Leaderboard';
// import MobileLeaderboard from './pages/MobileLeaderboard';
import MobilePassport from './pages/MobilePassport'; // Imported

import { TVMode } from './pages/TVMode';
import BattleMode from './pages/BattleMode'; // Imported

import { HallOfFame } from './pages/HallOfFame';
import { useState } from 'react';
import { Trophy, LayoutDashboard, Settings, Users, Crown, Calendar, MonitorPlay, Server, Library, ChevronLeft, ChevronRight, List } from 'lucide-react';
import EventsPage from './pages/EventsPage';
import EventDetails from './pages/EventDetails';
import TVRemote from './pages/TVRemote';
import DriversPage from './pages/DriversPage';
import DriverPassport from './pages/DriverPassport';
import LandingPage from './pages/LandingPage';
// ... imports

// ... inside AppContent
<Routes>
  <Route path="/tv" element={<TVMode />} />
  <Route path="/mobile" element={<MobilePassport />} />

</Routes>

function NavItem({ to, icon: Icon, children, collapsed }: { to: string, icon: any, children: React.ReactNode, collapsed?: boolean }) {
  const location = useLocation();
  const isActive = location.pathname === to;

  return (
    <Link
      to={to}
      className={`flex items-center ${collapsed ? 'justify-center' : 'space-x-3'} px-4 py-3 rounded-lg transition-colors ${isActive
        ? 'bg-blue-600 text-white shadow-lg'
        : 'text-gray-400 hover:bg-gray-800 hover:text-white'
        }`}
      title={collapsed ? children as string : ''}
    >
      <Icon size={20} />
      <span className={`font-medium transition-all ${collapsed ? 'hidden w-0' : 'block'}`}>{children}</span>
    </Link>
  );
}

function AppContent() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const location = useLocation();
  const isTVMode = location.pathname.startsWith('/tv');
  const isMobileView = location.pathname.startsWith('/mobile');

  const { data: branding } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await axios.get(`http://${window.location.hostname}:8000/settings`);
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
            <Route path="/mobile" element={<MobilePassport />} />

          </Routes>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100">
      {/* Sidebar */}
      <div className={`${isSidebarOpen ? 'w-64' : 'w-20'} bg-gray-900 text-white flex flex-col transition-all duration-300 relative`}>
        {/* Toggle Button */}
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="absolute -right-3 top-6 bg-blue-600 rounded-full p-1 shadow-lg border border-gray-800 z-50 hover:bg-blue-700"
        >
          {isSidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>

        <div className="p-6 flex flex-col items-center overflow-hidden">
          <img src={barLogo} alt="VRacing Bar" className={`h-20 w-auto object-contain drop-shadow-[0_0_15px_rgba(59,130,246,0.5)] mb-2 transition-all ${isSidebarOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-50 h-0 my-0'}`} />
          <h2 className={`text-xs font-black uppercase tracking-[0.3em] text-blue-500 opacity-80 whitespace-nowrap transition-all ${!isSidebarOpen && 'hidden'}`}>{barName}</h2>
          {!isSidebarOpen && <img src={barLogo} className="h-10 w-10 object-contain drop-shadow-[0_0_15px_rgba(59,130,246,0.5)]" />}
        </div>

        <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
          {/* GESTIÓN (ADMIN) */}
          <div className={`text-[10px] text-gray-500 font-bold uppercase mt-4 mb-2 px-2 tracking-wider ${!isSidebarOpen && 'hidden'}`}>
            Gestión
          </div>
          <NavItem to="/" icon={LayoutDashboard} collapsed={!isSidebarOpen}>Dashboard</NavItem>
          <NavItem to="/drivers" icon={Users} collapsed={!isSidebarOpen}>Pilotos</NavItem>
          <NavItem to="/events" icon={Calendar} collapsed={!isSidebarOpen}>Torneos</NavItem>
          <NavItem to="/championships" icon={Trophy} collapsed={!isSidebarOpen}>Campeonatos</NavItem>
          <NavItem to="/mods" icon={Library} collapsed={!isSidebarOpen}>Librería</NavItem>

          {/* CONFIGURACIÓN */}
          <div className={`text-[10px] text-gray-500 font-bold uppercase mt-6 mb-2 px-2 tracking-wider ${!isSidebarOpen && 'hidden'}`}>
            Sistema
          </div>
          <NavItem to="/config" icon={Server} collapsed={!isSidebarOpen}>Config. Sala</NavItem>
          <NavItem to="/ac-config" icon={Settings} collapsed={!isSidebarOpen}>Config. Assetto</NavItem>
          <NavItem to="/profiles" icon={Users} collapsed={!isSidebarOpen}>Perfiles</NavItem>

          {/* VISTA PÚBLICA / HERRAMIENTAS */}
          <div className={`text-[10px] text-gray-500 font-bold uppercase mt-6 mb-2 px-2 tracking-wider ${!isSidebarOpen && 'hidden'}`}>
            Sala & TV
          </div>
          <NavItem to="/remote" icon={MonitorPlay} collapsed={!isSidebarOpen}>Mando TV</NavItem>
          <NavItem to="/leaderboard" icon={List} collapsed={!isSidebarOpen}>Leaderboard</NavItem>
          <NavItem to="/hall-of-fame" icon={Crown} collapsed={!isSidebarOpen}>Salón Fama</NavItem>
          <NavItem to="/kiosk" icon={MonitorPlay} collapsed={!isSidebarOpen}>Menú Pantallas</NavItem>
        </nav>

        <div className="p-4 border-t border-gray-800">
          <div className="flex items-center space-x-3 justify-center">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold flex-shrink-0">A</div>
            <div className={`transition-all overflow-hidden ${!isSidebarOpen ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
              <p className="text-sm font-medium whitespace-nowrap">Operador</p>
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
          <Route path="/ac-config" element={<ConfigPage />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/hall-of-fame" element={<HallOfFame />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/events/:id" element={<EventDetails />} />
          <Route path="/drivers" element={<DriversPage />} />
          <Route path="/drivers/:driverName" element={<DriverPassport />} />
          <Route path="/championships" element={<ChampionshipsPage />} />
          <Route path="/championships/:id" element={<ChampionshipDetails />} />
          <Route path="/remote" element={<TVRemote />} />
          <Route path="/battle" element={<BattleMode />} />
          <Route path="/kiosk" element={<LandingPage />} />
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
