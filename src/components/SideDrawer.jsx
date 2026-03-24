import React from 'react';
import { X, User, Bell, Info } from 'lucide-react';

const SideDrawer = ({ isOpen, onClose, onMenuClick, t, lang }) => {
  return (
    <>
      {/* Overlay */}
      <div 
        className={`drawer-overlay ${isOpen ? 'open' : ''}`} 
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <div className={`side-drawer ${isOpen ? 'open' : ''}`} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <div className="drawer-header">
          <div className="drawer-title">{t('appName')}</div>
          <button className="close-button" onClick={onClose} aria-label="Close menu">
            <X size={24} />
          </button>
        </div>

        <nav className="drawer-menu">
          <div className="drawer-item" onClick={() => { onMenuClick('Sign In'); onClose(); }}>
            <User size={20} />
            <span>{t('signIn')}</span>
          </div>
          <div className="drawer-item" onClick={() => { onMenuClick('Notice'); onClose(); }}>
            <Bell size={20} />
            <span>{t('notice')}</span>
          </div>
          <div className="drawer-item" onClick={() => { onMenuClick('About'); onClose(); }}>
            <Info size={20} />
            <span>{t('about')}</span>
          </div>
        </nav>
      </div>
    </>
  );
};

export default SideDrawer;
