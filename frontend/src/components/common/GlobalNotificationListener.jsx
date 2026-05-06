import React, { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import {
  getDesktopNotificationPermission,
  requestDesktopNotificationPermission,
  showDesktopNotification,
} from '../../utils/browserNotifications';

const GlobalNotificationListener = () => {
  const [toasts, setToasts] = useState([]);
  const [authVersion, setAuthVersion] = useState(0);
  const [permission, setPermission] = useState(() => getDesktopNotificationPermission());

  useEffect(() => {
    const onAuthChanged = () => setAuthVersion((v) => v + 1);
    window.addEventListener('auth-changed', onAuthChanged);
    window.addEventListener('storage', onAuthChanged);
    const syncPermission = () => setPermission(getDesktopNotificationPermission());
    window.addEventListener('focus', syncPermission);
    return () => {
      window.removeEventListener('auth-changed', onAuthChanged);
      window.removeEventListener('storage', onAuthChanged);
      window.removeEventListener('focus', syncPermission);
    };
  }, []);

  useEffect(() => {
    const token = sessionStorage.getItem('shnoor_token') || localStorage.getItem('shnoor_token');
    if (!token) return;

    const socket = io('/', {
      transports: ['websocket', 'polling'],
      auth: { token }
    });

    const userEmail =
      sessionStorage.getItem('shnoor_admin_email') ||
      sessionStorage.getItem('shnoor_email') ||
      localStorage.getItem('shnoor_admin_email') ||
      localStorage.getItem('shnoor_email') ||
      'anonymous@user.com';

    const inferRole = (email) => {
      const lower = String(email || '').toLowerCase();
      if (lower.includes('admin')) return 'admin';
      if (lower.includes('manager')) return 'manager';
      return 'employee';
    };

    socket.on('connect', () => {
      console.log('[React] Connected to Socket.IO');
      console.log('[React] Socket ID:', socket.id);
      console.log('[React] User Email:', userEmail);
      socket.emit('join_room', userEmail.toLowerCase());
      socket.emit('register-global-notifications', {
        email: userEmail,
        role: inferRole(userEmail),
        timestamp: new Date().toISOString()
      });
    });

    socket.on('registration-confirmed', (data) => {
      console.log('[React] Registration confirmed:', data);
    });

    socket.on('connect_error', (error) => {
      console.error('[React] Connection error:', error);
    });

    socket.on('disconnect', () => {
      console.log('[React] Disconnected from Socket.IO');
    });

    socket.on('error', (error) => {
      console.error('[React] Socket error:', error);
    });

    socket.on('global-notification', (data) => {
      console.log('🔔 [React] Global Notification Received:', data);
      
      // Filter by recipient if targeted
      if (data.recipientEmails && data.recipientEmails.length > 0) {
        if (!userEmail) {
          console.log('🔔 [React] Notification dropped: userEmail is missing');
          return;
        }
        const userEmailLower = userEmail.toLowerCase();
        const isRecipient = data.recipientEmails.some((email) => email.toLowerCase() === userEmailLower);
        
        if (!isRecipient) {
          console.log(`🔔 [React] Notification not for me. Expected one of: ${data.recipientEmails.map(e => String(e).toLowerCase()).join(', ')}`);
          return;
        }
        console.log('🔔 [React] Targeted notification accepted for this user');
      } else {
        console.log('🔔 [React] Global broadcast notification accepted');
      }

      const id = Date.now();
      const message = data.preview || data.fullMessage || data.message;
      
      const newToast = { id, message, sender: data.senderRole, logo: data.logo };
      setToasts(prev => [...prev, newToast]);

      // BROWSER DESKTOP NOTIFICATION
      if (Notification.permission === 'granted') {
        new Notification("HRM Portal", {
          body: message,
          icon: data.logo || '/logo.avif' // ✅ Use company logo
        });
      }

      setTimeout(() => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
      }, 8000);
    });

    socket.on('chat-message-deleted', (data) => {
      window.dispatchEvent(new CustomEvent('chat-message-deleted', { detail: data }));
    });

    return () => {
      socket.disconnect();
    };
  }, [authVersion]);

  // Resolve Logo URL
  const getLogo = (toast) => {
    // If the notification data doesn't have a specific logo, use default
    return toast.logo || '/logo.avif';
  };

  return (
    <>
      {permission === 'default' ? (
        <div
          style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            zIndex: 10000,
            background: '#111827',
            color: '#ffffff',
            borderRadius: '14px',
            padding: '14px 16px',
            width: 'min(360px, calc(100vw - 32px))',
            boxShadow: '0 12px 30px rgba(0,0,0,0.22)',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Enable desktop notifications</div>
          <div style={{ fontSize: '0.9rem', lineHeight: 1.5, color: 'rgba(255,255,255,0.82)', marginBottom: 12 }}>
            Click below once to allow real-time payroll alerts on your desktop.
          </div>
          <button
            type="button"
            onClick={enableDesktopNotifications}
            style={{
              background: '#4f46e5',
              color: '#fff',
              border: 'none',
              borderRadius: '10px',
              padding: '10px 14px',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Enable Notifications
          </button>
        </div>
      ) : null}

      <div
        className="global-toast-container"
        style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          pointerEvents: 'none'
        }}
      >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="global-toast"
          style={{
            background: 'white',
            borderRadius: '12px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
            padding: '16px 20px',
            borderLeft: '4px solid #4f46e5',
            minWidth: '330px',
            maxWidth: '450px',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            pointerEvents: 'auto',
            animation: 'toastSlideIn 0.3s ease-out'
          }}
        >
          {/* ✅ Display Company Logo */}
          <div style={{ width: '40px', height: '40px', flexShrink: 0, borderRadius: '8px', overflow: 'hidden', backgroundColor: '#f3f4f6' }}>
            <img 
               src={toast.logo || '/logo.avif'} 
               alt="logo" 
               style={{ width: '100%', height: '100%', objectFit: 'contain' }}
               onError={(e) => { e.target.src = '/logo.avif'; }} 
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '2px', color: '#111827' }}>
              HRM Notification
            </div>
            <div style={{ fontSize: '0.82rem', color: '#4b5563', lineHeight: '1.4' }}>
              {toast.message}
            </div>
          </div>
          <button
            onClick={() => setToasts((prev) => prev.filter((toastItem) => toastItem.id !== toast.id))}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#9ca3af',
              fontSize: '1.2rem',
              padding: '0 4px',
              marginTop: '-4px'
            }}
          >
            &times;
          </button>
        </div>
      ))}
      <style>{`
        @keyframes toastSlideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
      </div>
    </>
  );
};

export default GlobalNotificationListener;
