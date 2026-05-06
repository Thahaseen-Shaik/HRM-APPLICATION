import React from 'react';
import { Link } from 'react-router-dom';
import { useSiteLogo } from '../hooks/useSiteLogo';

const clean = (value) => (value || '').toString().trim();

const Footer = ({ socialLinks = [], contact = {} }) => {
  const logoUrl = useSiteLogo();
  const email = clean(contact.email);
  const phone = clean(contact.phone);
  const address = clean(contact.address);

  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <div className="logo" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <img src={logoUrl || '/logo.avif'} alt="HRM logo" style={{ height: 32, width: 32, objectFit: 'contain', borderRadius: 6, marginRight: 8 }} />
            <span style={{ fontWeight: 700, fontSize: '1.3rem', letterSpacing: 1 }}>HRM</span>
          </div>
          <div className="footer-text">Empowering Next-Gen Workforce</div>
          {socialLinks.length > 0 && (
            <div className="social-row" style={{ marginTop: 18, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              {socialLinks.map((link) => (
                <a key={link.href} href={link.href} target="_blank" rel="noreferrer" className="social-icon" title={link.label}>
                  <i className={link.icon} />
                </a>
              ))}
            </div>
          )}
          <div style={{ marginTop: 18, fontSize: '0.95rem' }}>
            <Link className="footer-link" to="/privacy-policy" style={{ marginRight: 12 }}>
              Privacy Policy
            </Link>
            <Link className="footer-link" to="/terms-and-conditions">
              Terms & Conditions
            </Link>
          </div>
        </div>

        <div className="footer-col">
          <div className="footer-col-title">Company</div>
          <div className="footer-list">
            <a className="footer-link" href="/#about">
              About
            </a>
            <a className="footer-link" href="/#features">
              Features
            </a>
            <a className="footer-link" href="/#pricing">
              Pricing
            </a>
            <Link className="footer-link" to="/contact">
              Contact
            </Link>
          </div>
        </div>

        <div className="footer-col">
          <div className="footer-col-title">Account</div>
          <div className="footer-list">
            <Link className="footer-link" to="/login">
              Login
            </Link>
            <Link className="footer-link" to="/register">
              Register
            </Link>
          </div>
        </div>

        <div className="footer-col">
          <div className="footer-col-title">Contact</div>
          <div className="footer-list">
            {email ? (
              <a className="footer-link" href={`mailto:${email}`}>
                {email}
              </a>
            ) : (
              <span className="footer-muted">Email not configured</span>
            )}
            {phone ? (
              <a className="footer-link" href={`tel:${phone}`}>
                {phone}
              </a>
            ) : (
              <span className="footer-muted">Phone not configured</span>
            )}
            {address ? <span className="footer-muted">{address}</span> : <span className="footer-muted">Address not configured</span>}
          </div>
        </div>
      </div>

      <div className="footer-bar">
        <div style={{ fontSize: '0.85rem', color: 'var(--text-light)' }}>
          &copy; {new Date().getFullYear()} HRM Solutions LLC. All rights reserved.
        </div>
      </div>
    </footer>
  );
};

export default Footer;

