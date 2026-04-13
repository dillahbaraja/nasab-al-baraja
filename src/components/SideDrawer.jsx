import { X, User, Bell, Info, LogOut, Settings, Users, UserCog, ShieldCheck } from 'lucide-react';

const SideDrawer = ({
  isOpen,
  onClose,
  onMenuClick,
  t,
  lang,
  currentUser,
  role = 'guest',
  unreadCount = 0
}) => {
  const isSignedIn = Boolean(currentUser && !currentUser.is_anonymous);
  const isVerifiedMember = role === 'verified' || role === 'admin';
  const isAdmin = role === 'admin';

  const renderNoticeItem = () => (
    <div className="drawer-item" onClick={() => { onMenuClick('Notice'); onClose(); }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '12px', width: '100%' }}>
        <Bell size={20} />
        <span>{t('notice')}</span>
        {unreadCount > 0 && <span className="notice-badge" style={{ marginLeft: 'auto' }}>{unreadCount}</span>}
      </div>
    </div>
  );

  return (
    <>
      <div
        className={`drawer-overlay ${isOpen ? 'open' : ''}`}
        onClick={onClose}
      />

      <div className={`side-drawer ${isOpen ? 'open' : ''}`} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <div className="drawer-header">
          <div>
            <div className="drawer-title">{t('appName')}</div>
            <div className="drawer-subtitle">{t('modalTitle')}</div>
          </div>
          <button className="close-button" onClick={onClose} aria-label={t('closeMenu')}>
            <X size={24} />
          </button>
        </div>

        <nav className="drawer-menu">
          {isSignedIn && (
            <div className="drawer-profile-card">
              <User size={20} color="var(--accent)" />
              <span className="drawer-profile-email">{currentUser.email}</span>
            </div>
          )}

          {!isSignedIn && (
            <div className="drawer-item" onClick={() => { onMenuClick('Sign In'); onClose(); }}>
              <User size={20} />
              <span>{t('signIn')}</span>
            </div>
          )}

          {isVerifiedMember && (
            <div className="drawer-item" onClick={() => { onMenuClick('Profile'); onClose(); }}>
              <User size={20} />
              <span>{t('profile')}</span>
            </div>
          )}

          {isVerifiedMember && (
            <div className="drawer-item" onClick={() => { onMenuClick('Member Manager'); onClose(); }}>
              <Users size={20} />
              <span>{t('memberManager')}</span>
            </div>
          )}

          {isAdmin && (
            <div className="drawer-item" onClick={() => { onMenuClick('List Member'); onClose(); }}>
              <UserCog size={20} />
              <span>{t('listMember')}</span>
            </div>
          )}

          {isAdmin && (
            <div className="drawer-item" onClick={() => { onMenuClick('List Admin'); onClose(); }}>
              <ShieldCheck size={20} />
              <span>{t('listAdmin')}</span>
            </div>
          )}

          {renderNoticeItem()}

          <div className="drawer-item" onClick={() => { onMenuClick('Settings'); onClose(); }}>
            <Settings size={20} />
            <span>{t('settings')}</span>
          </div>

          <div className="drawer-item" onClick={() => { onMenuClick('About'); onClose(); }}>
            <Info size={20} />
            <span>{t('about')}</span>
          </div>

          {isSignedIn && (
            <div className="drawer-item drawer-signout" onClick={() => { onMenuClick('Sign Out'); onClose(); }}>
              <LogOut size={20} color="#ff4444" />
              <span style={{ color: '#ff4444' }}>{t('signOut')}</span>
            </div>
          )}
        </nav>
      </div>
    </>
  );
};

export default SideDrawer;
