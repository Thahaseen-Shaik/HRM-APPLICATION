import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { getMe } from '../services/authService';

// Manager Components
import ManagerOverviewView from '../components/manager/ManagerOverviewView';
import ManagerEmployeesView from '../components/manager/ManagerEmployeesView';
import ManagerAttendanceView from '../components/manager/ManagerAttendanceView';
import ManagerLeavesView from '../components/manager/ManagerLeavesView';
import ManagerAssetsView from '../components/manager/ManagerAssetsView';
import ManagerPayrollView from '../components/manager/ManagerPayrollView';
import ManagerPrePaymentsView from '../components/manager/ManagerPrePaymentsView';
import ManagerIncrementPromotionView from '../components/manager/ManagerIncrementPromotionView';
import ManagerAppreciationsView from '../components/manager/ManagerAppreciationsView';
import ManagerPoliciesView from '../components/manager/ManagerPoliciesView';
import ManagerOffboardingWarningsView from '../components/manager/ManagerOffboardingWarningsView';
import ManagerOffboardingResignationView from '../components/manager/ManagerOffboardingResignationView';
import ManagerOffboardingComplaintsView from '../components/manager/ManagerOffboardingComplaintsView';
import ManagerFinanceView from '../components/manager/ManagerFinanceView';
import ManagerHolidaysView from '../components/manager/ManagerHolidaysView';
import ManagerLettersView from '../components/manager/ManagerLettersView';
import ManagerDashboardAddons from '../components/manager/ManagerDashboardAddons';
import ManagerProfileView from '../components/manager/ManagerProfileView';
import CompanyChatWorkspace from '../components/chat/CompanyChatWorkspace';

// Employee Components (for Self Portal)
import EmployeeOverviewView from '../components/employee/EmployeeOverviewView';
import EmployeeAttendanceView from '../components/employee/EmployeeAttendanceView';
import EmployeeLeavesView from '../components/employee/EmployeeLeavesView';
import EmployeeAssetsView from '../components/employee/EmployeeAssetsView';
import EmployeeCalendarView from '../components/employee/EmployeeCalendarView';
import EmployeeAppreciationsView from '../components/employee/EmployeeAppreciationsView';
import EmployeeOffboardingView from '../components/employee/EmployeeOffboardingView';
import EmployeeExpensesView from '../components/employee/EmployeeExpensesView';
import EmployeePayrollView from '../components/employee/EmployeePayrollView';
import EmployeePoliciesView from '../components/employee/EmployeePoliciesView';
import EmployeeLettersView from '../components/employee/EmployeeLettersView';
import EmployeeRemainingLeavesView from '../components/employee/EmployeeRemainingLeavesView';
import EmployeeUnpaidLeavesView from '../components/employee/EmployeeUnpaidLeavesView';
import EmployeePaidLeavesView from '../components/employee/EmployeePaidLeavesView';
import EmployeeDashboardAddons from '../components/employee/EmployeeDashboardAddons';
import { clearAcceptedPolicies } from '../utils/policyAcceptance';

const TrialBanner = ({ userData }) => {
  const isManager = userData?.role === 'Manager';
  if (!userData || !isManager) return null;

  const trialEnd = userData.trialEndDate
    ? new Date(userData.trialEndDate)
    : new Date(new Date(userData.createdAt).getTime() + 15 * 24 * 60 * 60 * 1000);

  const now = new Date();
  const diff = trialEnd - now;
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  const remaining = days > 0 ? days : 0;

  let statusMessage = '';
  let bannerColor = '';
  let iconClass = '';

  if (remaining <= 0) {
    statusMessage = 'Your trial period has expired. Please contact admin.';
    bannerColor = '#fee2e2';
    iconClass = 'fa-hourglass-end';
  } else if (remaining <= 3) {
    statusMessage = `Your trial is expiring soon. ${remaining} days left.`;
    bannerColor = '#ffedd5';
    iconClass = 'fa-hourglass-half';
  } else {
    statusMessage = `Your trial period is active. ${remaining} days remaining.`;
    bannerColor = '#f0fdf4';
    iconClass = 'fa-hourglass-start';
  }

  return (
    <div style={{
      background: bannerColor,
      border: `1px solid ${remaining <= 3 ? '#fdba74' : '#86efac'}`,
      borderLeftWidth: '6px',
      color: remaining <= 3 ? '#9a3412' : '#166534',
      padding: '16px 24px',
      borderRadius: '12px',
      marginBottom: '24px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
      fontWeight: 600,
      fontSize: '0.95rem',
    }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <i className={`fas ${iconClass}`} style={{ fontSize: '1.2rem' }} />
        <span>{statusMessage}</span>
      </div>
      <div
        style={{
          background: 'rgba(255, 255, 255, 0.5)',
          padding: '4px 12px',
          borderRadius: '20px',
          fontSize: '0.85rem',
          border: '1px solid currentColor',
        }}
      >
        <b>{remaining} Days Left</b>
      </div>
    </div>
  );
};

const ManagerDashboard = () => {
  const navigate = useNavigate();
  const [activeView, setActiveView] = useState('dashboard');
  const [portalMode, setPortalMode] = useState('manager');
  const [email, setEmail] = useState('manager@hrm.com');
  const [userData, setUserData] = useState(null);
  const [profile, setProfile] = useState(null);

  const handleProfileUpdated = (nextProfile) => {
    setProfile(nextProfile);
    if (nextProfile?.email) setEmail(nextProfile.email);
  };

  const managementNavItems = useMemo(
    () => [
      { id: 'dashboard', label: 'Dashboard', icon: 'fas fa-th-large' },
      { id: 'employees', label: 'Employees', icon: 'fas fa-users' },
      { id: 'attendance', label: 'Attendance', icon: 'fas fa-clock' },
      { id: 'leaves', label: 'Leaves', icon: 'fas fa-calendar-alt' },
      { id: 'assets', label: 'Assets', icon: 'fas fa-laptop' },
      {
        id: 'payroll-menu',
        label: 'Payroll',
        icon: 'fas fa-money-check-alt',
        children: [
          { id: 'pre-payments', label: 'Pre Payments' },
          { id: 'increment-promotion', label: 'Increment / Promotion' },
          { id: 'payroll', label: 'Payroll' },
        ],
      },
      { id: 'appreciations', label: 'Appreciations', icon: 'fas fa-award' },
      { id: 'policies', label: 'Policies', icon: 'fas fa-file-contract' },
      {
        id: 'offboardings',
        label: 'Offboarding',
        icon: 'fas fa-user-minus',
        children: [
          { id: 'offboarding-warnings', label: 'Warnings', icon: 'fas fa-triangle-exclamation' },
          { id: 'offboarding-resignation', label: 'Resignation', icon: 'fas fa-right-from-bracket' },
          { id: 'offboarding-complaints', label: 'Complaints', icon: 'fas fa-comment-dots' },
        ],
      },
      { id: 'finance', label: 'Finance', icon: 'fas fa-wallet' },
      { id: 'holidays', label: 'Holidays', icon: 'fas fa-calendar-day' },
      { id: 'letters', label: 'Letters', icon: 'fas fa-envelope-open-text' },
      { id: 'company-chat', label: 'Company Chat', icon: 'fas fa-comments' },
      { id: 'profile', label: 'My Profile', icon: 'fas fa-user-cog' },
    ],
    []
  );

  const selfNavItems = useMemo(
    () => [
      { id: 'dashboard', label: 'Dashboard', icon: 'fas fa-th-large' },
      { id: 'attendance', label: 'Attendance', icon: 'fas fa-clock' },
      {
        id: 'leaves_parent',
        label: 'Leaves',
        icon: 'fas fa-calendar-alt',
        children: [
          { id: 'leaves', label: 'Leaves' },
          { id: 'remaining_leaves', label: 'Remaining Leaves' },
          { id: 'unpaid_leaves', label: 'Unpaid Leaves' },
          { id: 'paid_leaves', label: 'Paid Leaves' },
        ],
      },
      { id: 'assets', label: 'Assets', icon: 'fas fa-laptop' },
      { id: 'calendar', label: 'Holiday Calendar', icon: 'fas fa-calendar-day' },
      { id: 'appreciations', label: 'Thanks', icon: 'fas fa-thumbs-up' },
      { id: 'offboarding', label: 'Offboarding', icon: 'fas fa-user-minus' },
      { id: 'expenses', label: 'Expenses', icon: 'fas fa-receipt' },
      { id: 'payroll', label: 'Payroll', icon: 'fas fa-money-check-alt' },
      { id: 'policies', label: 'Policies', icon: 'fas fa-file-contract' },
      { id: 'letters', label: 'Letters', icon: 'fas fa-envelope-open-text' },
      { id: 'company-chat', label: 'Company Chat', icon: 'fas fa-comments' },
      { id: 'profile', label: 'My Profile', icon: 'fas fa-user-cog' },
    ],
    []
  );

  const navItems = portalMode === 'manager' ? managementNavItems : selfNavItems;

  const resolveLabel = (items, id) => {
    for (const item of items) {
      if (item.id === id) return item.label;
      const subItems = Array.isArray(item.children)
        ? item.children
        : Array.isArray(item.subItems)
          ? item.subItems
          : [];
      if (subItems.length) {
        const child = subItems.find((x) => x.id === id);
        if (child) return child.label;
      }
    }
    return null;
  };

  const pageTitle = useMemo(() => resolveLabel(navItems, activeView) || 'Dashboard', [activeView, navItems]);

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
  }, [navigate]);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await getMe();
        if (res.success) {
          setUserData(res.data);
          setProfile(res.data);
          if (res.data?.email) setEmail(res.data.email);
        }
      } catch (err) {
        console.error('Failed to fetch manager profile:', err);
      }
    };

    fetchUser();
  }, []);

  const handleLogout = () => {
    sessionStorage.removeItem('shnoor_token');
    sessionStorage.removeItem('shnoor_role');
    sessionStorage.removeItem('shnoor_email');
    sessionStorage.removeItem('shnoor_admin_email');
    localStorage.removeItem('shnoor_token');
    localStorage.removeItem('shnoor_role');
    localStorage.removeItem('shnoor_email');
    clearAcceptedPolicies();
    navigate('/login');
  };

  const handlePortalChange = (mode) => {
    setPortalMode(mode);
    setActiveView('dashboard');
  };

  const managementComponents = {
    dashboard: ManagerOverviewView,
    employees: ManagerEmployeesView,
    attendance: ManagerAttendanceView,
    leaves: ManagerLeavesView,
    assets: ManagerAssetsView,
    'pre-payments': ManagerPrePaymentsView,
    'increment-promotion': ManagerIncrementPromotionView,
    payroll: ManagerPayrollView,
    appreciations: ManagerAppreciationsView,
    policies: ManagerPoliciesView,
    'offboarding-warnings': ManagerOffboardingWarningsView,
    'offboarding-resignation': ManagerOffboardingResignationView,
    'offboarding-complaints': ManagerOffboardingComplaintsView,
    finance: ManagerFinanceView,
    holidays: ManagerHolidaysView,
    letters: ManagerLettersView,
    profile: ManagerProfileView,
    'company-chat': CompanyChatWorkspace,
  };

  const selfComponents = {
    dashboard: EmployeeOverviewView,
    attendance: EmployeeAttendanceView,
    leaves: EmployeeLeavesView,
    remaining_leaves: EmployeeRemainingLeavesView,
    unpaid_leaves: EmployeeUnpaidLeavesView,
    paid_leaves: EmployeePaidLeavesView,
    assets: EmployeeAssetsView,
    calendar: EmployeeCalendarView,
    appreciations: EmployeeAppreciationsView,
    offboarding: EmployeeOffboardingView,
    expenses: EmployeeExpensesView,
    payroll: EmployeePayrollView,
    policies: EmployeePoliciesView,
    letters: EmployeeLettersView,
    profile: ManagerProfileView,
    'company-chat': CompanyChatWorkspace,
  };

  const ViewComponent = portalMode === 'manager' ? managementComponents[activeView] : selfComponents[activeView];

  return (
    <div className="dashboard-mode">
      <DashboardLayout
        roleLabel="Manager"
        email={email}
        profile={profile}
        navItems={navItems}
        activeId={activeView}
        onSelect={setActiveView}
        onLogout={handleLogout}
        title={pageTitle}
        portalMode={portalMode}
        onPortalChange={handlePortalChange}
        onProfileClick={() => setActiveView('profile')}
      >
        {activeView === 'dashboard' && <TrialBanner userData={userData} />}
        {activeView === 'profile' ? <ManagerProfileView onProfileUpdated={handleProfileUpdated} /> : null}
        {activeView !== 'profile' && ViewComponent ? <ViewComponent /> : null}
        {activeView === 'dashboard' && (
          portalMode === 'manager' ? <ManagerDashboardAddons /> : <EmployeeDashboardAddons />
        )}
      </DashboardLayout>
    </div>
  );
};

export default ManagerDashboard;
