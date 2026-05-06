import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import AdminOverviewView from '../components/admin/AdminOverviewView';
import AdminCompaniesView from '../components/admin/AdminCompaniesView';
import AdminSubscriptionsView from '../components/admin/AdminSubscriptionsView';
import AdminTransactionsView from '../components/admin/AdminTransactionsView';
import AdminOfflineView from '../components/admin/AdminOfflineView';
import AdminSuperAdminView from '../components/admin/AdminSuperAdminView';
import AdminWebsiteView from '../components/admin/AdminWebsiteView';
import AdminSystemView from '../components/admin/AdminSystemView';
import AdminChatSupportView from '../components/admin/AdminChatSupportView';
import AdminManagerTrialView from '../components/admin/AdminManagerTrialView';
import CompanyChatWorkspace from '../components/chat/CompanyChatWorkspace';
import { clearAcceptedPolicies } from '../utils/policyAcceptance';
import { getMe } from '../services/authService';

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [activeView, setActiveView] = useState('dashboard');
  const [email, setEmail] = useState('admin@hrm.com');
  const [profile, setProfile] = useState(null);

  const handleProfileUpdated = (nextProfile) => {
    setProfile(nextProfile);
    if (nextProfile?.email) setEmail(nextProfile.email);
  };

  const navItems = useMemo(
    () => [
      { id: 'dashboard', label: 'Dashboard', icon: 'fas fa-th-large' },
      { id: 'companies', label: 'Companies', icon: 'fas fa-building' },
      { id: 'subscriptions', label: 'Subscriptions', icon: 'fas fa-credit-card' },
      { id: 'transactions', label: 'Transactions', icon: 'fas fa-file-invoice-dollar' },
      { id: 'offline', label: 'Offline Requests', icon: 'fas fa-download' },
      { id: 'superadmin', label: 'Super Admin Management', icon: 'fas fa-user-shield' },
      { id: 'trials', label: 'Manager Trials', icon: 'fas fa-hourglass-half' },
      { id: 'website', label: 'Website Settings', icon: 'fas fa-globe' },
      { id: 'profile', label: 'My Profile', icon: 'fas fa-user-cog' },
      { id: 'system', label: 'Settings', icon: 'fas fa-cog' },
      { id: 'chat', label: 'Chat Support', icon: 'fas fa-comments' },
      { id: 'company-chat', label: 'Company Chat', icon: 'fas fa-people-group' },
    ],
    []
  );

  const pageTitle = useMemo(() => {
    const match = navItems.find((item) => item.id === activeView);
    return match ? match.label : 'Dashboard';
  }, [activeView, navItems]);

  useEffect(() => {
    const token = sessionStorage.getItem('shnoor_token') || localStorage.getItem('shnoor_token');
    const role = sessionStorage.getItem('shnoor_role') || localStorage.getItem('shnoor_role') || '';
    if (!token) {
      navigate('/login', { replace: true });
      return;
    }
    if (role === 'Employee') {
      navigate('/employee', { replace: true });
      return;
    }
    if (role === 'Manager') {
      navigate('/manager', { replace: true });
      return;
    }
    if (role !== 'Admin' && role !== 'Super Admin') {
      navigate('/login', { replace: true });
      return;
    }

    setEmail(
      sessionStorage.getItem('shnoor_email') ||
        sessionStorage.getItem('shnoor_admin_email') ||
        localStorage.getItem('shnoor_email') ||
        localStorage.getItem('shnoor_admin_email') ||
        'admin@hrm.com'
    );

    const loadProfile = async () => {
      try {
        const res = await getMe();
        if (res?.success) {
          setProfile(res.data);
          if (res.data?.email) setEmail(res.data.email);
        }
      } catch {
        // ignore profile load failures
      }
    };

    loadProfile();
  }, [navigate]);

  const handleLogout = () => {
    sessionStorage.removeItem('shnoor_token');
    sessionStorage.removeItem('shnoor_role');
    sessionStorage.removeItem('shnoor_email');
    sessionStorage.removeItem('shnoor_admin_email');
    localStorage.removeItem('shnoor_token');
    localStorage.removeItem('shnoor_role');
    localStorage.removeItem('shnoor_email');
    localStorage.removeItem('shnoor_admin_email');
    clearAcceptedPolicies();
    navigate('/login');
  };

  const ViewComponent = {
    dashboard: AdminOverviewView,
    companies: AdminCompaniesView,
    subscriptions: AdminSubscriptionsView,
    transactions: AdminTransactionsView,
    offline: AdminOfflineView,
    superadmin: AdminSuperAdminView,
    trials: AdminManagerTrialView,
    website: AdminWebsiteView,
    profile: AdminSystemView,
    system: AdminSystemView,
    chat: AdminChatSupportView,
    'company-chat': CompanyChatWorkspace,
  }[activeView];

  return (
    <div className="dashboard-mode">
      <DashboardLayout
        roleLabel="Admin"
        email={email}
        profile={profile}
        navItems={navItems}
        activeId={activeView}
        onSelect={setActiveView}
        onLogout={handleLogout}
        onProfileClick={() => setActiveView('profile')}
        title={pageTitle}
      >
        {activeView === 'profile' || activeView === 'system' ? <AdminSystemView onProfileUpdated={handleProfileUpdated} /> : null}
        {activeView !== 'profile' && activeView !== 'system' && ViewComponent ? <ViewComponent /> : null}
      </DashboardLayout>
    </div>
  );
};

export default AdminDashboard;
