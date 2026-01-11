import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import React from 'react';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';

// Pages
import Dashboard from './pages/Dashboard';
import ProfilesPage from './pages/ProfilesPage';
import ModsLibrary from './pages/ModsLibrary';
import SettingsPage from './pages/SettingsPage';
import Leaderboard from './pages/Leaderboard';
import { HallOfFame } from './pages/HallOfFame';
import EventsPage from './pages/EventsPage';
import EventDetails from './pages/EventDetails';
import DriversPage from './pages/DriversPage';
import DriverPassport from './pages/DriverPassport';
import ChampionshipsPage from './pages/ChampionshipsPage';
import ChampionshipDetails from './pages/ChampionshipDetails';
import TVRemote from './pages/TVRemote';
import BattleMode from './pages/BattleMode';
import LandingPage from './pages/LandingPage';
import TournamentTV from './pages/TournamentTV';
import MobileLeaderboard from './pages/MobileLeaderboard';
import MobilePassport from './pages/MobilePassport';

function App() {
  return (
    <Router>
      <ErrorBoundary>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />

            {/* Management */}
            <Route path="/drivers" element={<DriversPage />} />
            <Route path="/drivers/:driverName" element={<DriverPassport />} />
            <Route path="/events" element={<EventsPage />} />
            <Route path="/events/:id" element={<EventDetails />} />
            <Route path="/championships" element={<ChampionshipsPage />} />
            <Route path="/championships/:id" element={<ChampionshipDetails />} />
            <Route path="/mods" element={<ModsLibrary />} />

            {/* System */}
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/profiles" element={<ProfilesPage />} />

            {/* Public Views */}
            <Route path="/remote" element={<TVRemote />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/hall-of-fame" element={<HallOfFame />} />
            <Route path="/kiosk" element={<LandingPage />} />
            <Route path="/battle" element={<BattleMode />} />

            {/* TV & Mobile (Handled by Layout to hide sidebar) */}
            <Route path="/tv/leaderboard" element={<Leaderboard />} />
            <Route path="/tv/bracket/:id" element={<TournamentTV />} />
            <Route path="/mobile" element={<MobileLeaderboard />} />
            <Route path="/passport-scanner" element={<MobilePassport />} />
          </Routes>
        </Layout>
      </ErrorBoundary>
    </Router>
  );
}

export default App;

