import { X, User, Bell, Info, LogOut, Settings, Users, UserCog, ShieldCheck } from 'lucide-react';

const activeItemMap = {
  signin: 'Sign In',
  profile: 'Profile',
  memberManager: 'Member Manager',
  listMember: 'List Member',
  listAdmin: 'List Admin',
  notice: 'Notice',
  settings: 'Settings',
  about: 'About',
};

const SideDrawer = ({
  isOpen,
  onClose,
  onMenuClick,
  t,
  lang,
  currentUser,
  role = 'guest',
  unreadCount = 0,
  activeItem = null,
}) => {
  const isSignedIn = Boolean(currentUser && !currentUser.is_anonymous);
  const isVerifiedMember = role === 'verified' || role === 'admin';
  const isRtl = lang === 'ar';
  const activeMenuItem = activeItem ? activeItemMap[activeItem] || null : null;
  const brandTitle = lang === 'ar' ? 'آل بارجاء' : 'Al-Baraja';
  const brandSubtitle = lang === 'id'
    ? 'Silsilah Nasab'
    : lang === 'ar'
      ? 'شجرة النسب'
      : 'Family Lineage';

  const renderMenuButton = ({ item, icon, label, badge = null, tone = 'default' }) => {
    const isActive = activeMenuItem === item;
    const toneClass = tone === 'danger' ? ' drawer-item-danger' : '';

    return (
      <button
        type="button"
        className={`drawer-item${isActive ? ' active' : ''}${toneClass}`}
        onClick={() => { onMenuClick(item); onClose(); }}
      >
        <span className="drawer-item-icon">{icon}</span>
        <span className="drawer-item-label">{label}</span>
        <span className="drawer-item-trailing">
          {badge}
        </span>
      </button>
    );
  };

  return (
    <>
      <div className={`drawer-overlay ${isOpen ? 'open' : ''}`} onClick={onClose} />

      <div className={`side-drawer ${isOpen ? 'open' : ''}`} dir={isRtl ? 'rtl' : 'ltr'}>
        <div className="drawer-header">
          <div className="drawer-brand">
            <img className="drawer-brand-logo" src="/favicon.png" alt="Nasab Al-Baraja" />
            <div className="drawer-brand-copy">
              <div className={`drawer-title ${isRtl ? 'drawer-title-ar' : 'drawer-title-latin'}`}>{brandTitle}</div>
              <div className="drawer-subtitle">{brandSubtitle}</div>
            </div>
          </div>
          <button className="close-button" onClick={onClose} aria-label={t('closeMenu')}>
            <X size={24} />
          </button>
        </div>

        <nav className="drawer-menu">
          {isSignedIn && (
            <div className="drawer-profile-card">
              <div className="drawer-profile-icon">
                <User size={20} color="var(--accent)" />
              </div>
              <div className="drawer-profile-content">
                <span className="drawer-profile-email">{currentUser.email}</span>
              </div>
            </div>
          )}

          {!isSignedIn && (
            <>
              {renderMenuButton({ item: 'Sign In', icon: <User size={20} />, label: t('signIn') })}
            </>
          )}

          {isVerifiedMember && (
            <>
              {renderMenuButton({ item: 'Profile', icon: <User size={20} />, label: t('profile') })}
              {renderMenuButton({ item: 'Member Manager', icon: <Users size={20} />, label: t('memberManager') })}
            </>
          )}

          {renderMenuButton({ item: 'List Member', icon: <UserCog size={20} />, label: t('listMember') })}
          {renderMenuButton({ item: 'List Admin', icon: <ShieldCheck size={20} />, label: t('listAdmin') })}

          {renderMenuButton({
            item: 'Notice',
            icon: <Bell size={20} />,
            label: t('notice'),
            badge: unreadCount > 0 ? <span className="notice-badge">{unreadCount}</span> : null,
          })}

          {renderMenuButton({ item: 'Settings', icon: <Settings size={20} />, label: t('settings') })}
          {renderMenuButton({ item: 'About', icon: <Info size={20} />, label: t('about') })}

          {isSignedIn && (
            <>
              {renderMenuButton({ item: 'Sign Out', icon: <LogOut size={20} />, label: t('signOut'), tone: 'danger' })}
            </>
          )}
        </nav>
      </div>
    </>
  );
};

export default SideDrawer;
