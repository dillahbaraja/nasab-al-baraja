import React, { useState } from 'react';
import { Menu } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import SideDrawer from './SideDrawer';

const WebsiteHeader = ({ onMenuClick, children, t, lang, currentUser, role = 'guest', unreadCount = 0 }) => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const platform = Capacitor.getPlatform();

  // Only show on website, not on native mobile apps.
  if (platform === 'android' || platform === 'ios') return null;

  return (
    <>
      <div className="web-header-container">
        <div className="web-search-wrapper">
          {children}
        </div>
        <button 
          className="hamburger-button" 
          onClick={() => setIsDrawerOpen(true)}
          aria-label={t('openMenu')}
        >
          <div style={{ position: 'relative' }}>
            <Menu size={24} />
            {unreadCount > 0 && (
              <div style={{
                position: 'absolute', top: -4, right: -4, background: '#ff4444', color: 'white',
                borderRadius: '50%', width: '14px', height: '14px', fontSize: '9px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold'
              }}>
                {unreadCount}
              </div>
            )}
          </div>
        </button>
      </div>

      <SideDrawer 
        isOpen={isDrawerOpen} 
        onClose={() => setIsDrawerOpen(false)} 
        onMenuClick={onMenuClick}
        t={t}
        lang={lang}
        currentUser={currentUser}
        role={role}
        unreadCount={unreadCount}
      />
    </>
  );
};

export default WebsiteHeader;
