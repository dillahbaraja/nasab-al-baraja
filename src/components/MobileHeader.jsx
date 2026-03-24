import React, { useState, useRef, useEffect } from 'react';
import { MoreVertical } from 'lucide-react';
import { Capacitor } from '@capacitor/core';

const MobileHeader = ({ title = "Nasab Al-Baraja", onMenuClick, t, lang, currentUser }) => {
  const platform = Capacitor.getPlatform();
  if (platform !== 'android') return null;

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const handleItemClick = (item) => {
    setIsMenuOpen(false);
    if (onMenuClick) {
      onMenuClick(item);
    }
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsMenuOpen(false);
      }
    };

    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMenuOpen]);

  return (
    <header className="android-app-bar">
      <div className="app-bar-content">
        <div className="app-bar-title">{title}</div>
        <div className="overflow-container" ref={menuRef}>
          <button 
            className="overflow-button" 
            onClick={toggleMenu}
            aria-label="More options"
          >
            <MoreVertical size={24} />
          </button>
          
          {isMenuOpen && (
          <div className="popup-menu" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
            {!currentUser ? (
              <>
                <div className="popup-item" onClick={() => handleItemClick('Sign In')}>{t('signIn')}</div>
                <div className="popup-item" onClick={() => handleItemClick('Notice')}>{t('notice')}</div>
                <div className="popup-item" onClick={() => handleItemClick('About')}>{t('about')}</div>
              </>
            ) : (
              <>
                <div className="popup-item" onClick={() => handleItemClick('Admin Manager')}>{t('adminManager')}</div>
                <div className="popup-item" onClick={() => handleItemClick('Change Password')}>{t('changePassword')}</div>
                <div className="popup-item" onClick={() => handleItemClick('Notice')}>{t('notice')}</div>
                <div className="popup-item" onClick={() => handleItemClick('Sign Out')}>{t('signOut')}</div>
              </>
            )}
          </div>
        )}
        </div>
      </div>
    </header>
  );
};

export default MobileHeader;
