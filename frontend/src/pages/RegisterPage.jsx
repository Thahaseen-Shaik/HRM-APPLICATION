import React from 'react';
import { Link } from 'react-router-dom';
import MainLayout from '../components/MainLayout';

const RegisterPage = () => {
  return (
    <MainLayout>
      <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 20px' }}>
        <div style={{ width: '100%', maxWidth: '1000px' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <span className="auth-brand">HRM</span>
            <h2 className="auth-heading" style={{ fontSize: '2.5rem', marginTop: '16px' }}>Join the Platform</h2>
            <p className="auth-sub-text" style={{ fontSize: '1.2rem' }}>Choose your account type to get started with HRM</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '32px' }}>
            {/* Admin Option */}
            <div className="login-card-modern" style={{ textAlign: 'center', padding: '48px 32px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ 
                width: '80px', 
                height: '80px', 
                background: '#f1f5f9', 
                borderRadius: '24px', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                fontSize: '2.5rem', 
                color: '#4f46e5', 
                margin: '0 auto 24px' 
              }}>
                <i className="fas fa-user-shield"></i>
              </div>
              <h3 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', marginBottom: '12px' }}>Platform Admin</h3>
              <p style={{ color: '#64748b', marginBottom: '32px', minHeight: '48px', lineHeight: '1.6' }}>
                Full control over the system, roles, and company settings.
              </p>
              <Link to="/register/admin" className="btn btn-solid btn-block" style={{ textDecoration: 'none' }}>
                Register as Admin
              </Link>
            </div>

            {/* Manager Option */}
            <div className="login-card-modern" style={{ textAlign: 'center', padding: '48px 32px', position: 'relative', overflow: 'hidden', borderTop: '6px solid #10b981' }}>
              <div style={{ position: 'absolute', top: '24px', right: '-35px', transform: 'rotate(45deg)', background: '#10b981', color: 'white', padding: '6px 40px', fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.05em' }}>
                FREE TRIAL
              </div>
              <div style={{ 
                width: '80px', 
                height: '80px', 
                background: '#ecfdf5', 
                borderRadius: '24px', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                fontSize: '2.5rem', 
                color: '#10b981', 
                margin: '0 auto 24px' 
              }}>
                <i className="fas fa-users-cog"></i>
              </div>
              <h3 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', marginBottom: '12px' }}>Team Manager</h3>
              <p style={{ color: '#64748b', marginBottom: '32px', minHeight: '48px', lineHeight: '1.6' }}>
                Manage departments, employees, and team performance with a 15-day free trial.
              </p>
              <Link to="/register/manager" className="btn btn-solid btn-block" style={{ textDecoration: 'none', backgroundColor: '#10b981' }}>
                Start Free Trial
              </Link>
            </div>

            {/* Employee Option */}
            <div className="login-card-modern" style={{ textAlign: 'center', padding: '48px 32px', position: 'relative', overflow: 'hidden', borderTop: '6px solid #6366f1' }}>
              <div style={{
                width: '80px',
                height: '80px',
                background: '#eef2ff',
                borderRadius: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '2.5rem',
                color: '#6366f1',
                margin: '0 auto 24px'
              }}>
                <i className="fas fa-user"></i>
              </div>
              <h3 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', marginBottom: '12px' }}>Employee Access</h3>
              <p style={{ color: '#64748b', marginBottom: '32px', minHeight: '48px', lineHeight: '1.6' }}>
                Create your employee account and access your personal HRM dashboard.
              </p>
              <Link to="/register/employee" className="btn btn-solid btn-block" style={{ textDecoration: 'none', backgroundColor: '#6366f1' }}>
                Register as Employee
              </Link>
            </div>
          </div>

          <div style={{ textAlign: 'center', marginTop: '48px' }}>
             <p className="auth-foot-text" style={{ fontSize: '1.1rem' }}>
               Already part of our portal? <Link to="/login" className="link-small" style={{ fontWeight: 700 }}>Login here</Link>
             </p>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default RegisterPage;
