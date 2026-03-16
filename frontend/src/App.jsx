import { Routes, Route, Navigate } from 'react-router-dom';
import HomePage from './pages/HomePage.jsx';
import RoomPage from './pages/RoomPage.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

/**
 * App — top-level router.
 *
 * Routes:
 *   /                  → HomePage  (create / join a room)
 *   /room/:roomCode    → RoomPage  (live video call)
 *   *                  → redirect to /
 */
function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/room/:roomCode" element={<RoomPage />} />
        {/* Catch-all: redirect unknown paths to home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}

export default App;
