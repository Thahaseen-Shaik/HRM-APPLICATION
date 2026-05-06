import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import EmployeeOverviewView from '../components/employee/EmployeeOverviewView';
import EmployeeAttendanceView from '../components/employee/EmployeeAttendanceView';
import EmployeeLeavesView from '../components/employee/EmployeeLeavesView';
import EmployeeAssetsView from '../components/employee/EmployeeAssetsView';
import EmployeeCalendarView from '../components/employee/EmployeeCalendarView';
import EmployeeAppreciationsView from '../components/employee/EmployeeAppreciationsView';
import EmployeeOffboardingView from '../components/employee/EmployeeOffboardingView';
import EmployeeExpensesView from '../components/employee/EmployeeExpensesView';
import EmployeePayrollView from '../components/employee/EmployeePayrollView';
import EmployeePrePaymentsView from '../components/employee/EmployeePrePaymentsView';
import EmployeeIncrementPromotionView from '../components/employee/EmployeeIncrementPromotionView';
import EmployeePoliciesView from '../components/employee/EmployeePoliciesView';
import EmployeeProfileView from '../components/employee/EmployeeProfileView';
import EmployeeLettersView from '../components/employee/EmployeeLettersView';
import EmployeeRemainingLeavesView from '../components/employee/EmployeeRemainingLeavesView';
import EmployeeUnpaidLeavesView from '../components/employee/EmployeeUnpaidLeavesView';
import EmployeePaidLeavesView from '../components/employee/EmployeePaidLeavesView';
import EmployeeDashboardAddons from '../components/employee/EmployeeDashboardAddons';
import CompanyChatWorkspace from '../components/chat/CompanyChatWorkspace';
import { clearAcceptedPolicies } from '../utils/policyAcceptance';
import { getProfile } from '../services/employeeService';

const EmployeeDashboard = () => {
  const navigate = useNavigate();
  const [activeView, setActiveView] = useState('dashboard');
  const [email, setEmail] = useState('emp@hrm.com');
  const [profile, setProfile] = useState(null);

  const handleProfileUpdated = (nextProfile) => {
    setProfile(nextProfile);
    if (nextProfile?.email) setEmail(nextProfile.email);
  };

  const navItems = useMemo(
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
      { id: 'appreciations', label: 'Appreciations', icon: 'fas fa-award' },
      {
        id: 'offboarding',
        label: 'Offboarding',
        icon: 'fas fa-user-minus',
        children: [
          { id: 'offboarding-warnings', label: 'Warnings', icon: 'fas fa-triangle-exclamation' },
          { id: 'offboarding-resignation', label: 'Resignation', icon: 'fas fa-right-from-bracket' },
          { id: 'offboarding-complaints', label: 'Complaints', icon: 'fas fa-comment-dots' },
        ],
      },
      { id: 'expenses', label: 'Expenses', icon: 'fas fa-receipt' },
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
      { id: 'policies', label: 'Policies', icon: 'fas fa-file-contract' },
      { id: 'letters', label: 'Letters', icon: 'fas fa-envelope-open-text' },
      { id: 'company-chat', label: 'Company Chat', icon: 'fas fa-comments' },
      { id: 'profile', label: 'My Profile', icon: 'fas fa-user-cog' },
    ],
    []
  );

  const resolveLabel = (items, id) => {
    for (const item of items) {
      if (item.id === id) return item.label;
      if (Array.isArray(item.children)) {
        const child = item.children.find((x) => x.id === id);
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
    if (role === 'Admin' || role === 'Super Admin') {
      navigate('/admin', { replace: true });
      return;
    }
    if (role === 'Manager') {
      navigate('/manager', { replace: true });
      return;
    }

    setEmail(sessionStorage.getItem('shnoor_email') || localStorage.getItem('shnoor_email') || 'emp@hrm.com');

    const loadProfile = async () => {
      try {
        const res = await getProfile();
        if (res?.success) {
          setProfile(res.data);
          if (res.data?.email) setEmail(res.data.email);
        }
      } catch {
        // ignore sidebar profile load failures
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
    clearAcceptedPolicies();
    navigate('/login');
  };

  const ViewComponent = {
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
    'pre-payments': EmployeePrePaymentsView,
    'increment-promotion': EmployeeIncrementPromotionView,
    policies: EmployeePoliciesView,
    letters: EmployeeLettersView,
    profile: EmployeeProfileView,
    'company-chat': CompanyChatWorkspace,
  }[activeView];

  return (
    <div className="dashboard-mode">
      <DashboardLayout
        roleLabel="Employee"
        email={email}
        profile={profile}
        navItems={navItems}
        activeId={activeView}
        onSelect={setActiveView}
        onLogout={handleLogout}
        onProfileClick={() => setActiveView('profile')}
        title={pageTitle}
      >
        {activeView === 'profile' ? <EmployeeProfileView onProfileUpdated={handleProfileUpdated} /> : null}
        {activeView !== 'profile' && ViewComponent ? <ViewComponent /> : null}
        {activeView === 'dashboard' ? <EmployeeDashboardAddons /> : null}
      </DashboardLayout>
    </div>
  );
};

export default EmployeeDashboard;
