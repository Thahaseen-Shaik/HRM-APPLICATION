import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import MainLayout from '../components/MainLayout';
import { registerPublic } from '../services/authService';

const ManagerRegistration = () => {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'Manager' });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const res = await registerPublic(form);
      if (res.success) {
        setMessage('Manager registration successful! 15-day trial activated. Redirecting to login...');
        setTimeout(() => navigate('/login'), 2500);
      } else {
        setMessage(res.error || 'Registration failed.');
      }
    } catch (err) {
      setMessage(err?.response?.data?.error || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <MainLayout>
      <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
        <div className="login-card-modern">
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <span className="auth-brand">HRM</span>
          </div>
          
          <h2 className="auth-heading">Manager Registration</h2>
          <p className="auth-sub-text">Sign up for a 15-day free trial and explore all features.</p>
          
          {message && (
            <div className={`login-error ${message.includes('successful') ? 'success' : ''}`} style={{ 
              marginBottom: '24px',
              backgroundColor: message.includes('successful') ? '#f0fdf4' : '#fef2f2',
              borderColor: message.includes('successful') ? '#bbf7d0' : '#fecaca',
              color: message.includes('successful') ? '#166534' : '#991b1b',
              border: '1px solid',
              padding: '12px 16px',
              borderRadius: '10px'
            }}>
              {message}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label htmlFor="reg-name">Full Name</label>
              <input
                type="text"
                id="reg-name"
                placeholder="Enter your full name"
                required
                value={form.name}
                onChange={(e) => setForm({...form, name: e.target.value})}
              />
            </div>

            <div className="form-group">
              <label htmlFor="reg-email">Email Address</label>
              <input
                type="email"
                id="reg-email"
                placeholder="name@company.com"
                required
                value={form.email}
                onChange={(e) => setForm({...form, email: e.target.value})}
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="reg-password">Password</label>
              <input
                type="password"
                id="reg-password"
                placeholder="••••••••"
                required
                value={form.password}
                onChange={(e) => setForm({...form, password: e.target.value})}
              />
            </div>

            <div className="trial-info-panel" style={{ 
              padding: '12px 16px', 
              background: '#f0fdf4', 
              border: '1px solid #bbf7d0', 
              borderRadius: '10px',
              marginBottom: '24px',
              fontSize: '0.9rem',
              color: '#166534',
              display: 'flex',
              gap: '12px',
              alignItems: 'flex-start'
            }}>
              <i className="fas fa-gift" style={{ marginTop: '3px' }}></i>
              <div>
                <strong style={{ display: 'block', marginBottom: '2px' }}>15-Day Free Trial</strong>
                Once you sign up, you'll have full access to all HRM modules for 15 days.
              </div>
            </div>

            <button type="submit" className="btn btn-solid btn-block" disabled={loading} style={{ backgroundColor: '#10b981' }}>
              {loading ? 'Creating Account...' : 'Start 15-Day Trial'}
            </button>
          </form>

          <p className="auth-foot-text" style={{ marginTop: '32px' }}>
            Already have an account? {' '}
            <Link to="/login" className="link-small">
              Login here
            </Link>
          </p>
        </div>
      </div>
    </MainLayout>
  );
};

export default ManagerRegistration;
