import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import MainLayout from '../components/MainLayout';
import { login as loginRequest } from '../services/authService';
import api from '../services/api';
import { acceptPolicies, clearAcceptedPolicies, hasAcceptedPolicies } from '../utils/policyAcceptance';

const LoginPage = () => {
  const navigate = useNavigate();
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginEmail, setLoginEmail] = useState(() => {
    const fromQuery = new URLSearchParams(window.location.search).get('email');
    if (fromQuery) return fromQuery;
    const remembered = localStorage.getItem('hrm_remember_email') || '';
    return remembered;
  });
  const [loginPassword, setLoginPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(() => localStorage.getItem('hrm_remember_me') === 'true');
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');
  const [policyAccepted, setPolicyAccepted] = useState(() => hasAcceptedPolicies());

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    if (!policyAccepted || !hasAcceptedPolicies()) {
      setLoginError('You must accept both the Privacy Policy and Terms & Conditions before logging in.');
      return;
    }
    setLoginLoading(true);
    try {
      const data = await loginRequest({ email: loginEmail.trim(), password: loginPassword });
      if (data.success) {
        sessionStorage.setItem('shnoor_token', data.token);
        sessionStorage.setItem('shnoor_role', data.user.role);
        sessionStorage.setItem('shnoor_email', data.user.email);

        localStorage.setItem('shnoor_token', data.token);
        localStorage.setItem('shnoor_role', data.user.role);
        localStorage.setItem('shnoor_email', data.user.email);
        localStorage.setItem('hrm_last_email', data.user.email);
        localStorage.setItem('hrm_last_role', data.user.role);
        localStorage.setItem('hrm_remember_me', rememberMe ? 'true' : 'false');
        if (rememberMe) {
          localStorage.setItem('hrm_remember_email', data.user.email);
        } else {
          localStorage.removeItem('hrm_remember_email');
        }

        if (data.user.role === 'Admin' || data.user.role === 'Super Admin') {
          sessionStorage.setItem('shnoor_admin_email', data.user.email);
          localStorage.setItem('shnoor_admin_email', data.user.email);
        } else {
          sessionStorage.removeItem('shnoor_admin_email');
          localStorage.removeItem('shnoor_admin_email');
        }

        window.dispatchEvent(new Event('auth-changed'));

        try {
          if (window.globalNotificationClient) {
            window.globalNotificationClient.disconnect();
            window.globalNotificationClient.connect();
          }
        } catch {
          // ignore
        }

        if (data.user.role === 'Manager') {
          navigate('/manager');
        } else if (data.user.role === 'Employee') {
          navigate('/employee');
        } else {
          navigate('/admin');
        }
      } else {
        setLoginError(data.error || 'Invalid email or password.');
      }
    } catch (err) {
      const message = err?.response?.data?.error || 'Network error. Please try again.';
      setLoginError(message);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setForgotError('');
    setForgotSuccess('');
    setForgotLoading(true);
    try {
      const { data } = await api.post('/api/v1/auth/forgotpassword', {
        email: forgotEmail.trim(),
      });
      if (data?.success) {
        setForgotSuccess('Reset email sent. Please check your inbox.');
      } else {
        setForgotError(data?.error || 'Email could not be sent.');
      }
    } catch (err) {
      const message = err?.response?.data?.error || 'Network error. Please try again.';
      setForgotError(message);
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <MainLayout>
      <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
        <div className="login-card-modern">
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <span className="auth-brand">HRM</span>
          </div>
          
          <h2 className="auth-heading">Welcome back</h2>
          <p className="auth-sub-text">Please enter your details to sign in.</p>
          
          {loginError && (
            <div className="login-error" style={{ marginBottom: '24px' }}>
              {loginError}
            </div>
          )}

          <form onSubmit={handleLogin} noValidate>
            <div className="form-group">
              <label htmlFor="login-email">Email Address</label>
              <input
                type="email"
                id="login-email"
                placeholder="name@company.com"
                required
                value={loginEmail}
                onChange={(e) => {
                  setLoginEmail(e.target.value);
                  setLoginError('');
                }}
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="login-password">Password</label>
              <input
                type="password"
                id="login-password"
                placeholder="••••••••"
                required
                value={loginPassword}
                onChange={(e) => {
                  setLoginPassword(e.target.value);
                  setLoginError('');
                }}
              />
            </div>

            <div className="auth-row">
              <label className="checkbox-label">
                <input type="checkbox" id="remember-me" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} /> Remember for 30 days
              </label>
              <button
                type="button"
                className="link-small"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                onClick={() => {
                  setForgotOpen(true);
                  setForgotEmail(loginEmail || localStorage.getItem('hrm_last_email') || '');
                  setForgotError('');
                  setForgotSuccess('');
                }}
              >
                Forgot password?
              </button>
            </div>

            <div style={{ margin: '18px 0 8px', fontSize: '0.95rem', color: '#666', textAlign: 'left' }}>
              To login, you must first review and accept our
              <span style={{ margin: '0 4px', textDecoration: 'underline', cursor: 'pointer', color: '#3b82f6' }}>
                <Link to="/privacy-policy" style={{ color: '#3b82f6' }}> Privacy Policy </Link>
              </span>
              and
              <span style={{ margin: '0 4px', textDecoration: 'underline', cursor: 'pointer', color: '#3b82f6' }}>
                <Link to="/terms-and-conditions" style={{ color: '#3b82f6' }}> Terms & Conditions </Link>
              </span>
              .
            </div>

            <label className="checkbox-label" style={{ alignItems: 'flex-start', margin: '8px 0 6px' }}>
              <input
                type="checkbox"
                checked={policyAccepted}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setPolicyAccepted(checked);
                  if (checked) {
                    acceptPolicies();
                  } else {
                    clearAcceptedPolicies();
                  }
                  setLoginError('');
                }}
              />
              <span>I have reviewed and accept the Privacy Policy and Terms & Conditions</span>
            </label>

            <button type="submit" className="btn btn-solid btn-block" disabled={loginLoading}>
              {loginLoading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <p className="auth-foot-text" style={{ marginTop: '32px' }}>
            Don't have an account? {' '}
            <Link to="/register" className="link-small">
              Register now
            </Link>
          </p>
        </div>

        {forgotOpen && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(15, 23, 42, 0.5)',
              zIndex: 1000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setForgotOpen(false);
            }}
          >
            <div className="login-card-modern" style={{ maxWidth: 460, width: '100%' }}>
              <h3 className="auth-heading" style={{ marginBottom: 8 }}>Forgot Password</h3>
              <p className="auth-sub-text" style={{ marginBottom: 20 }}>
                Enter your account email to receive a reset link.
              </p>

              {forgotError && <div className="login-error" style={{ marginBottom: 12 }}>{forgotError}</div>}
              {forgotSuccess && (
                <div
                  style={{
                    marginBottom: 12,
                    border: '1px solid #bbf7d0',
                    background: '#f0fdf4',
                    color: '#166534',
                    fontSize: '0.9rem',
                    padding: '10px 12px',
                    borderRadius: 10,
                  }}
                >
                  {forgotSuccess}
                </div>
              )}

              <form onSubmit={handleForgotPassword}>
                <div className="form-group">
                  <label htmlFor="forgot-email">Email Address</label>
                  <input
                    id="forgot-email"
                    type="email"
                    required
                    placeholder="name@company.com"
                    value={forgotEmail}
                    onChange={(e) => {
                      setForgotEmail(e.target.value);
                      setForgotError('');
                      setForgotSuccess('');
                    }}
                  />
                </div>

                <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                  <button type="button" className="btn btn-outline btn-block" onClick={() => setForgotOpen(false)}>
                    Close
                  </button>
                  <button type="submit" className="btn btn-solid btn-block" disabled={forgotLoading}>
                    {forgotLoading ? 'Sending...' : 'Send Reset Link'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default LoginPage;
