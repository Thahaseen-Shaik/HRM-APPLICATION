import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import MainLayout from '../components/MainLayout';
import { registerEmployee } from '../services/authService';

const EmployeeRegistration = () => {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'Employee' });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const res = await registerEmployee(form);
      if (res.success) {
        setMessage('Employee registration successful! Redirecting to login...');
        setTimeout(() => navigate('/login'), 2000);
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

          <h2 className="auth-heading">Employee Registration</h2>
          <p className="auth-sub-text">Create your employee account and access the portal.</p>

          {message && (
            <div
              className={`login-error ${message.includes('successful') ? 'success' : ''}`}
              style={{
                marginBottom: '24px',
                backgroundColor: message.includes('successful') ? '#f0fdf4' : '#fef2f2',
                borderColor: message.includes('successful') ? '#bbf7d0' : '#fecaca',
                color: message.includes('successful') ? '#166534' : '#991b1b',
                border: '1px solid',
                padding: '12px 16px',
                borderRadius: '10px',
              }}
            >
              {message}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label htmlFor="emp-name">Full Name</label>
              <input
                type="text"
                id="emp-name"
                placeholder="Enter your full name"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label htmlFor="emp-email">Email Address</label>
              <input
                type="email"
                id="emp-email"
                placeholder="name@company.com"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label htmlFor="emp-password">Password</label>
              <input
                type="password"
                id="emp-password"
                placeholder="••••••••"
                required
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>

            <button type="submit" className="btn btn-solid btn-block" disabled={loading} style={{ backgroundColor: '#6366f1' }}>
              {loading ? 'Creating Account...' : 'Register as Employee'}
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

export default EmployeeRegistration;
