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
const TVAds = lazy(() => import('./pages/TVAds'));
const MobileLeaderboard = lazy(() => import('./pages/MobileLeaderboard'));
const MobilePassport = lazy(() => import('./pages/MobilePassport'));
const LiveMapPage = lazy(() => import('./pages/LiveMapPage'));
const HistoryPage = lazy(() => import('./pages/HistoryPage'));
const LapAnalysisPage = lazy(() => import('./pages/LapAnalysisPage'));
const BookingsPage = lazy(() => import('./pages/BookingsPage'));
const TableReservations = lazy(() => import('./pages/TableReservations'));
const PublicBookingPage = lazy(() => import('./pages/PublicBookingPage'));
const TVMode = lazy(() => import('./pages/TVMode').then(module => ({ default: module.TVMode })));
const EliminationTV = lazy(() => import('./pages/EliminationTV'));
const EliminationAdmin = lazy(() => import('./pages/EliminationAdmin'));
const HardwareMonitor = lazy(() => import('./pages/HardwareMonitor'));
const ScenariosManager = lazy(() => import('./pages/ScenariosManager'));
const KioskMode = lazy(() => import('./pages/KioskMode'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const PilotPortal = lazy(() => import('./pages/PilotPortal'));
const ManageBooking = lazy(() => import('./pages/ManageBooking'));
const LockScreen = lazy(() => import('./pages/LockScreen'));
const Reservations = lazy(() => import('./pages/Reservations'));
const LapComparison = lazy(() => import('./pages/LapComparison'));
const TVSpectator = lazy(() => import('./pages/TVSpectator'));
const TVSpectatorFullscreen = lazy(() => import('./pages/TVSpectatorFullscreen'));
const TVSpectatorMulti = lazy(() => import('./pages/TVSpectatorMulti'));
const UserManagement = lazy(() => import('./pages/UserManagement'));
const StationDisplay = lazy(() => import('./pages/StationDisplay'));


import { useBranding } from './hooks/useBranding';
import { LicenseProvider } from './context/LicenseContext';

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
        <LicenseProvider>
          <Layout>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/admin" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
                <Route path="/admin/scenarios" element={<PrivateRoute><ScenariosManager /></PrivateRoute>} />
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
                <Route path="/bookings" element={<PrivateRoute><BookingsPage /></PrivateRoute>} />
                <Route path="/reservations" element={<PrivateRoute><TableReservations /></PrivateRoute>} />
                <Route path="/mods" element={<PrivateRoute><ModsLibrary /></PrivateRoute>} />
                <Route path="/online-reservations" element={<PrivateRoute><Reservations /></PrivateRoute>} />
                <Route path="/compare" element={<PrivateRoute><LapComparison /></PrivateRoute>} />

                {/* System */}
                <Route path="/settings" element={<PrivateRoute><SettingsPage /></PrivateRoute>} />
                <Route path="/profiles" element={<PrivateRoute><ProfilesPage /></PrivateRoute>} />
                <Route path="/users" element={<PrivateRoute><UserManagement /></PrivateRoute>} />

                {/* Public Views */}
                <Route path="/remote" element={<PrivateRoute><TVRemote /></PrivateRoute>} />
                <Route path="/leaderboard" element={<Leaderboard />} />
                <Route path="/hall-of-fame" element={<HallOfFame />} />
                <Route path="/kiosk" element={<KioskMode />} />
                <Route path="/battle" element={<BattleMode />} />
                <Route path="/live-map" element={<LiveMapPage />} />
                <Route path="/tv" element={<TVMode />} />
                <Route path="/telemetry/:id" element={<LapAnalysisPage />} />
                <Route path="/reservar" element={<PublicBookingPage />} />
                <Route path="/reserva/:token" element={<ManageBooking />} />
                <Route path="/p/:driverName" element={<PilotPortal />} />
                <Route path="/portal" element={<PilotPortal />} />
                <Route path="/station-display" element={<StationDisplay />} />


                {/* TV & Mobile (Handled by Layout to hide sidebar) */}
                <Route path="/tv/leaderboard" element={<Leaderboard />} />
                <Route path="/tv/bracket/:id" element={<TournamentTV />} />
                <Route path="/tv/ads" element={<TVAds />} />
                <Route path="/tv/spectator" element={<TVSpectator />} />
                <Route path="/tv/spectator-fullscreen" element={<TVSpectatorFullscreen />} />
                <Route path="/tv/spectator-multi" element={<TVSpectatorMulti />} />
                <Route path="/mobile" element={<MobileLeaderboard />} />
                <Route path="/passport-scanner" element={<MobilePassport />} />
                <Route path="/tv-mode" element={<TVMode />} />

                {/* Elimination Mode */}
                <Route path="/elimination" element={<PrivateRoute><EliminationAdmin /></PrivateRoute>} />
                <Route path="/elimination-tv/:id" element={<EliminationTV />} />
                <Route path="/hardware" element={<PrivateRoute><HardwareMonitor /></PrivateRoute>} />
                <Route path="/analytics" element={<PrivateRoute><AnalyticsPage /></PrivateRoute>} />

                {/* Security */}
                <Route path="/lock-screen" element={<LockScreen />} />

                {/* Fallback */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </Layout>
        </LicenseProvider>
      </ErrorBoundary>
    </Router>
  );
}

export default App;
