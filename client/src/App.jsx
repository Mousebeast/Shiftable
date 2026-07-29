import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { NotificationsProvider } from './hooks/useNotifications';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Claim from './pages/Claim';
import Dashboard from './pages/Dashboard';
import Schedule from './pages/Schedule';
import SwapShift from './pages/SwapShift';
import TimeOff from './pages/TimeOff';
import Availability from './pages/Availability';
import Notifications from './pages/Notifications';
import ScheduleBuilder from './pages/ScheduleBuilder';
import Approvals from './pages/Approvals';
import StaffManagement from './pages/StaffManagement';
import GroupManagement from './pages/GroupManagement';
import Broadcast from './pages/Broadcast';
import AdminPanel from './pages/AdminPanel';
import Reports from './pages/Reports';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/claim" element={<Claim />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <NotificationsProvider>
                  <Layout />
                </NotificationsProvider>
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="schedule" element={<Schedule />} />
            <Route path="swaps" element={<SwapShift />} />
            <Route path="timeoff" element={<TimeOff />} />
            <Route path="availability" element={<Availability />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="builder" element={<ProtectedRoute roles={['manager', 'admin']}><ScheduleBuilder /></ProtectedRoute>} />
            <Route path="approvals" element={<ProtectedRoute roles={['manager', 'admin']}><Approvals /></ProtectedRoute>} />
            <Route path="staff" element={<ProtectedRoute roles={['manager', 'admin']}><StaffManagement /></ProtectedRoute>} />
            <Route path="groups" element={<ProtectedRoute roles={['manager', 'admin']}><GroupManagement /></ProtectedRoute>} />
            <Route path="broadcast" element={<ProtectedRoute roles={['manager', 'admin']}><Broadcast /></ProtectedRoute>} />
            <Route path="reports" element={<ProtectedRoute roles={['manager', 'admin']}><Reports /></ProtectedRoute>} />
            <Route path="admin" element={<ProtectedRoute roles={['admin']}><AdminPanel /></ProtectedRoute>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
