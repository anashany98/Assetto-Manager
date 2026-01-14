import { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import PrivateRoute from './components/PrivateRoute';
import { LoginPage } from './pages/LoginPage';
// Pages - Lazy Loaded
const Dashboard = lazy(() => import('./pages/Dashboard'));
const ProfilesPage = lazy(() => import('./pages/ProfilesPage'));
const ModsLibrary = lazy(() => import('./pages/ModsLibrary'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const Configuration = lazy(() => import('./pages/Configuration'));
const Leaderboard = lazy(() => import('./pages/Leaderboard'));
const HallOfFame = lazy(() => import('./pages/HallOfFame').then(module => ({ default: module.HallOfFame }))); // Handle named export if needed, assuming default or named
const EventsPage = lazy(() => import('./pages/EventsPage'));
const EventDetails = lazy(() => import('./pages/EventDetails'));
const DriversPage = lazy(() => import('./pages/DriversPage'));
const DriverPassport = lazy(() => import('./pages/DriverPassport'));
const ChampionshipsPage = lazy(() => import('./pages/ChampionshipsPage'));
const ChampionshipDetails = lazy(() => import('./pages/ChampionshipDetails'));
const TVRemote = lazy(() => import('./pages/TVRemote'));
const BattleMode = lazy(() => import('./pages/BattleMode'));
const LandingPage = lazy(() => import('./pages/LandingPage'));
const TournamentTV = lazy(() => import('./pages/TournamentTV'));
const MobileLeaderboard = lazy(() => import('./pages/MobileLeaderboard'));
const MobilePassport = lazy(() => import('./pages/MobilePassport'));
const LiveMapPage = lazy(() => import('./pages/LiveMapPage'));
const HistoryPage = lazy(() => import('./pages/HistoryPage'));
const LapAnalysisPage = lazy(() => import('./pages/LapAnalysisPage'));
const TVMode = lazy(() => import('./pages/TVMode').then(module => ({ default: module.TVMode })));

import { useBranding } from './hooks/useBranding';

// Fallback Loading Component
const PageLoader = () => (
  <div className="h-full w-full flex items-center justify-center p-20">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent"></div>
  </div>
);

function App() {
  useBranding(); // Manejo dinámico de título y favicon

  return (
    <Router>
      <ErrorBoundary>
        <Layout>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/admin" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/analysis/:id" element={<LapAnalysisPage />} />

              {/* Management */}
              <Route path="/drivers" element={<PrivateRoute><DriversPage /></PrivateRoute>} />
              <Route path="/drivers/:driverName" element={<PrivateRoute><DriverPassport /></PrivateRoute>} />
              <Route path="/events" element={<PrivateRoute><EventsPage /></PrivateRoute>} />
              <Route path="/events/:id" element={<PrivateRoute><EventDetails /></PrivateRoute>} />
              <Route path="/championships" element={<PrivateRoute><ChampionshipsPage /></PrivateRoute>} />
              <Route path="/championships/:id" element={<PrivateRoute><ChampionshipDetails /></PrivateRoute>} />
              <Route path="/history" element={<PrivateRoute><HistoryPage /></PrivateRoute>} />
              <Route path="/mods" element={<PrivateRoute><ModsLibrary /></PrivateRoute>} />

              {/* System */}
              <Route path="/settings" element={<PrivateRoute><SettingsPage /></PrivateRoute>} />
              <Route path="/config" element={<PrivateRoute><Configuration /></PrivateRoute>} />
              <Route path="/profiles" element={<PrivateRoute><ProfilesPage /></PrivateRoute>} />

              {/* Public Views */}
              <Route path="/remote" element={<PrivateRoute><TVRemote /></PrivateRoute>} />
              <Route path="/leaderboard" element={<Leaderboard />} />
              <Route path="/hall-of-fame" element={<HallOfFame />} />
              <Route path="/kiosk" element={<LandingPage />} />
              <Route path="/battle" element={<BattleMode />} />
              <Route path="/live-map" element={<LiveMapPage />} />
              <Route path="/tv" element={<TVMode />} />
              <Route path="/telemetry/:id" element={<LapAnalysisPage />} />

              {/* TV & Mobile (Handled by Layout to hide sidebar) */}
              <Route path="/tv/leaderboard" element={<Leaderboard />} />
              <Route path="/tv/bracket/:id" element={<TournamentTV />} />
              <Route path="/mobile" element={<MobileLeaderboard />} />
              <Route path="/passport-scanner" element={<MobilePassport />} />
              <Route path="/tv-mode" element={<TVMode />} />

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </Layout>
      </ErrorBoundary>
    </Router>
  );
}

export default App;

