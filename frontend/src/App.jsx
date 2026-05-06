import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ContactPage from './pages/ContactPage';
import AdminDashboard from './pages/AdminDashboard';
import ManagerDashboard from './pages/ManagerDashboard';
import EmployeeDashboard from './pages/EmployeeDashboard';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import TermsAndConditionsPage from './pages/TermsAndConditionsPage';
import AdminRegistration from './pages/AdminRegistration';
import ManagerRegistration from './pages/ManagerRegistration';
import EmployeeRegistration from './pages/EmployeeRegistration';
import './index.css';
import GlobalNotificationListener from './components/common/GlobalNotificationListener.jsx';

import ChatbotApp from './components/chatbot/ChatbotApp.jsx';

const getStoredRole = () =>
  sessionStorage.getItem('shnoor_role') || localStorage.getItem('shnoor_role') || '';

const getStoredToken = () =>
  sessionStorage.getItem('shnoor_token') || localStorage.getItem('shnoor_token') || '';

const getDashboardPath = (role) => {
  if (role === 'Manager') return '/manager';
  if (role === 'Employee') return '/employee';
  if (role === 'Admin' || role === 'Super Admin') return '/admin';
  return '/login';
};

function HomeRoute() {
  const token = getStoredToken();
  const role = getStoredRole();

  return token ? <Navigate to={getDashboardPath(role)} replace /> : <LandingPage />;
}

function PublicRoute({ children }) {
  const token = getStoredToken();
  const role = getStoredRole();

  return token ? <Navigate to={getDashboardPath(role)} replace /> : children;
}

function ProtectedRoute({ allowedRoles, children }) {
  const token = getStoredToken();
  const role = getStoredRole();

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(role)) {
    return <Navigate to={getDashboardPath(role)} replace />;
  }

  return children;
}

function App() {
  return (
    <BrowserRouter>
      <GlobalNotificationListener />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/register/admin" element={<AdminRegistration />} />
        <Route path="/register/manager" element={<ManagerRegistration />} />
        <Route path="/register/employee" element={<EmployeeRegistration />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={['Admin', 'Super Admin']}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/manager"
          element={
            <ProtectedRoute allowedRoles={['Manager']}>
              <ManagerDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/employee"
          element={
            <ProtectedRoute allowedRoles={['Employee']}>
              <EmployeeDashboard />
            </ProtectedRoute>
          }
        />
        <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
        <Route path="/terms-and-conditions" element={<TermsAndConditionsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ChatbotApp />
    </BrowserRouter>
  );
}

export default App;
