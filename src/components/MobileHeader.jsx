import React, { useState } from 'react';
import { MoreVertical } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import SideDrawer from './SideDrawer';

const MobileHeader = ({ title = '', onMenuClick, t, lang, currentUser, role = 'guest', unreadCount = 0 }) => {
  const platform = Capacitor.getPlatform();
  if (platform !== 'android') return null;

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const handleItemClick = (item) => {
    setIsDrawerOpen(false);
    if (onMenuClick) {
      onMenuClick(item);
    }
  };

  return (
    <div className="android-app-bar">
      <div className="status-bar-spacer" />
      <div className="app-bar-content">
        <h1 className="app-bar-title">{title}</h1>
        <div className="overflow-container">
          <button className="overflow-button" onClick={() => setIsDrawerOpen(true)} aria-label={t('openMenu')}>
            <div style={{ position: 'relative' }}>
              <MoreVertical size={24} />
              {unreadCount > 0 && (
                <div style={{
                  position: 'absolute', top: -4, right: -4, background: '#ff4444', color: 'white',
                  borderRadius: '50%', width: '16px', height: '16px', fontSize: '10px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold'
                }}>
                  {unreadCount}
                </div>
              )}
            </div>
          </button>
        </div>
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
    </div>
  );
};

export default MobileHeader;
