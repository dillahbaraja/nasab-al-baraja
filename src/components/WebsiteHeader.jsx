import React, { useState } from 'react';
import { Menu } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import SideDrawer from './SideDrawer';

const WebsiteHeader = ({ onMenuClick, children, t, lang, currentUser }) => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const platform = Capacitor.getPlatform();

  // ONLY show on website, NOT on android
  if (platform === 'android') return null;

  return (
    <>
      <div className="web-header-container">
        <div className="web-search-wrapper">
          {children}
        </div>
        <button 
          className="hamburger-button" 
          onClick={() => setIsDrawerOpen(true)}
          aria-label="Open menu"
        >
          <Menu size={24} />
        </button>
      </div>

      <SideDrawer 
        isOpen={isDrawerOpen} 
        onClose={() => setIsDrawerOpen(false)} 
        onMenuClick={onMenuClick}
        t={t}
        lang={lang}
        currentUser={currentUser}
      />
    </>
  );
};

export default WebsiteHeader;
