import React from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useSiteLogo } from '../hooks/useSiteLogo';

const Header = () => {
  const location = useLocation();
  const logoUrl = useSiteLogo();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  React.useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname, location.hash]);

  return (
    <>
      <header className="navbar">
        <div className="nav-container">
          <Link to="/" className="logo" aria-label="HRM Home" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <img src={logoUrl || '/logo.avif'} alt="HRM logo" style={{ height: '48px' }} />
            HRM
          </Link>

          <button
            type="button"
            className="hamburger"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? '×' : '☰'}
          </button>

          <nav className={`nav-links${mobileOpen ? ' open' : ''}`} aria-label="Main navigation">
            <NavLink to="/" end className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              Home
            </NavLink>
            <a href="/#about" className="nav-link">
              About Us
            </a>
            <a href="/#features" className="nav-link">
              Features
            </a>
            <a href="/#pricing" className="nav-link">
              Pricing
            </a>
            <NavLink to="/contact" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              Contact
            </NavLink>
          </nav>

          <div className="nav-right">
            <Link to="/register" className="btn btn-outline" style={{ marginLeft: 'auto' }}>
              Register
            </Link>
            <Link to="/login" className="btn btn-solid">
              Login
            </Link>
          </div>
        </div>
      </header>

      <div className={`nav-mobile-backdrop${mobileOpen ? ' open' : ''}`} role="presentation" onClick={() => setMobileOpen(false)} />
    </>
  );
};

export default Header;

