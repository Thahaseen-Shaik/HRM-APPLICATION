import React, { useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

const DashboardLayout = ({ 
  roleLabel, 
  email, 
  profile,
  navItems, 
  activeId, 
  onSelect, 
  onLogout, 
  title, 
  children,
  portalMode,
  onPortalChange,
  onProfileClick
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const roleKey = (roleLabel || '').toString().trim().toLowerCase();

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 900) {
        setSidebarOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleToggle = () => {
    if (window.innerWidth <= 900) {
      setSidebarOpen((prev) => !prev);
    } else {
      setSidebarCollapsed((prev) => !prev);
    }
  };

  const handleSelect = (id) => {
    onSelect(id);
    if (window.innerWidth <= 900) {
      setSidebarOpen(false);
    }
  };

  return (
    <div className="app-root">
      <Sidebar
        brand="HRM"
        tag={roleLabel}
        profile={profile}
        navItems={navItems}
        activeId={activeId}
        onSelect={handleSelect}
        onLogout={onLogout}
        isOpen={sidebarOpen}
        isCollapsed={sidebarCollapsed}
        portalMode={portalMode}
        onPortalChange={onPortalChange}
        onProfileClick={onProfileClick}
      />
      <div className={`main-wrap${sidebarCollapsed ? ' expanded' : ''}`}>
        <Topbar title={title} roleLabel={roleLabel} roleKey={roleKey} email={email} profile={profile} onToggle={handleToggle} />
        <main className="main-content">{children}</main>
      </div>
    </div>
  );
};

export default DashboardLayout;
