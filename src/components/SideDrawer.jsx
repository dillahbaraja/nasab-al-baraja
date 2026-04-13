import { X, User, Bell, Info, Shield, Key, LogOut, Settings } from 'lucide-react';

const SideDrawer = ({ isOpen, onClose, onMenuClick, t, lang, currentUser, unreadCount = 0 }) => {
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
          <button className="close-button" onClick={onClose} aria-label={t('closeMenu')}>
            <X size={24} />
          </button>
        </div>

        <nav className="drawer-menu">
          {!currentUser ? (
            <>
              <div className="drawer-item" onClick={() => { onMenuClick('Sign In'); onClose(); }}>
                <User size={20} />
                <span>{t('signIn')}</span>
              </div>
              <div className="drawer-item" onClick={() => { onMenuClick('Notice'); onClose(); }}>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '12px', width: '100%' }}>
                  <Bell size={20} />
                  <span>{t('notice')}</span>
                  {unreadCount > 0 && <span className="notice-badge" style={{ marginLeft: 'auto' }}>{unreadCount}</span>}
                </div>
              </div>
              <div className="drawer-item" onClick={() => { onMenuClick('Settings'); onClose(); }}>
                <Settings size={20} />
                <span>{t('settings')}</span>
              </div>
              <div className="drawer-item" onClick={() => { onMenuClick('About'); onClose(); }}>
                <Info size={20} />
                <span>{t('about')}</span>
              </div>
            </>
          ) : (
            <>
              <div className="drawer-item" style={{ background: 'var(--panel-highlight-bg)', marginBottom: '10px', borderRadius: '8px', cursor: 'default' }}>
                <User size={20} color="var(--accent)" />
                <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--accent)' }}>{currentUser.email}</span>
              </div>

              <div className="drawer-item" onClick={() => { onMenuClick('Change Password'); onClose(); }}>
                <Key size={20} />
                <span>{t('changePassword')}</span>
              </div>
              <div className="drawer-item" onClick={() => { onMenuClick('Notice'); onClose(); }}>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '12px', width: '100%' }}>
                  <Bell size={20} />
                  <span>{t('notice')}</span>
                  {unreadCount > 0 && <span className="notice-badge" style={{ marginLeft: 'auto' }}>{unreadCount}</span>}
                </div>
              </div>
              <div className="drawer-item" onClick={() => { onMenuClick('Settings'); onClose(); }}>
                <Settings size={20} />
                <span>{t('settings')}</span>
              </div>
              <div className="drawer-item" onClick={() => { onMenuClick('About'); onClose(); }}>
                <Info size={20} />
                <span>{t('about')}</span>
              </div>
              <div className="drawer-item" style={{ marginTop: '20px', borderTop: '1px solid var(--panel-border)', paddingTop: '20px' }} onClick={() => { onMenuClick('Sign Out'); onClose(); }}>
                <LogOut size={20} color="#ff4444" />
                <span style={{ color: '#ff4444' }}>{t('signOut')}</span>
              </div>
            </>
          )}
        </nav>
      </div>
    </>
  );
};

export default SideDrawer;
