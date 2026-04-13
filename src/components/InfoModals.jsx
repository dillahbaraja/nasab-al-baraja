import React, { useState } from 'react';
import { X, Shield, Info, Bell, UserPlus, Edit, Trash2, Key, MapPin, Phone, Mail, User, Settings } from 'lucide-react';

const InfoModal = ({ 
  isOpen, 
  onClose, 
  title, 
  type, 
  t, 
  lang, 
  onSignIn, 
  onSignOut,
  onChangePassword,
  currentUser,
  notices = [],
  onViewNotice,
  onDeleteNotice,
  appSettings,
  setAppSettings
}) => {
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });

  const [pwData, setPwData] = useState({
    newPassword: '',
    confirmPassword: ''
  });

  const [errorMsg, setErrorMsg] = useState('');



  if (!isOpen) return null;

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handlePwChange = (e) => {
    const { name, value } = e.target;
    setPwData(prev => ({ ...prev, [name]: value }));
  };

  const getNoticeMeta = (notice) => {
    if (notice.type === 'proposal_add_child') {
      return {
        label: t('noticeProposalAddChild'),
        borderColor: '#dc2626',
        badgeBg: 'rgba(220, 38, 38, 0.14)',
        badgeColor: '#fca5a5'
      };
    }

    if (notice.type === 'proposal_name_change') {
      return {
        label: t('noticeProposalNameChange'),
        borderColor: '#ea580c',
        badgeBg: 'rgba(234, 88, 12, 0.14)',
        badgeColor: '#fdba74'
      };
    }

    return {
      label: t('noticeNewMember'),
      borderColor: 'var(--accent)',
      badgeBg: 'rgba(var(--accent-rgb), 0.14)',
      badgeColor: 'var(--accent)'
    };
  };

  const renderContent = () => {
    switch (type) {
      case 'about':
        return (
          <div className="info-modal-body">
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
              <Info size={48} color="var(--accent)" />
            </div>
            <p style={{ textAlign: 'center', marginBottom: '16px', fontWeight: 'bold' }}>
              {t('appName')} 
            </p>
            <p style={{ marginBottom: '12px' }}>
              {t('aboutDescription')}
            </p>
            <p>
              {t('aboutInstructions')}
            </p>
          </div>
        );
      case 'notice':
        return (
          <div className="info-modal-body" style={type === 'notice' ? { paddingLeft: '12px', paddingRight: '12px' } : {}}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
              <Bell size={48} color="var(--accent)" />
            </div>
            <div className="notice-list-container" style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {notices.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                  <Bell size={32} opacity={0.3} />
                  <p>{t('noticeEmpty')}</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {notices.map((n, idx) => {
                    const meta = getNoticeMeta(n);
                    return (
                    <div key={n.id || idx} className="glass-panel" style={{ padding: '12px 16px', borderLeft: `4px solid ${meta.borderColor}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 8px', borderRadius: '999px', fontSize: '10px', fontWeight: 'bold', marginBottom: '8px', background: meta.badgeBg, color: meta.badgeColor }}>
                          {meta.label}
                        </div>
                        <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '4px' }}>{n.text}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                          {new Date(n.timestamp).toLocaleString(lang === 'id' ? 'id-ID' : lang === 'ar' ? 'ar-SA' : 'en-US')}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', marginLeft: '12px' }}>
                        <button 
                          onClick={() => onViewNotice && onViewNotice(n)}
                          style={{ background: 'var(--accent)', color: 'white', border: 'none', borderRadius: '4px', padding: '6px 10px', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}
                        >
                          {t('view')}
                        </button>
                        {currentUser && (
                          <button 
                            onClick={() => {
                              if (window.confirm(t('deleteBtn') + '?')) {
                                onDeleteNotice && onDeleteNotice(n.id);
                              }
                            }}
                            style={{ background: 'transparent', border: 'none', color: '#ff4444', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                          >
                            <Trash2 size={18} />
                          </button>
                        )}
                      </div>
                    </div>
                  )})}
                </div>
              )}
            </div>
          </div>
        );
      case 'signin':
        return (
          <div className="info-modal-body">
             <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
              <Shield size={48} color="var(--accent)" />
            </div>
            <p style={{ textAlign: 'center', marginBottom: '20px' }}>
              {t('signInDescription')}
            </p>
            {errorMsg && (
              <div style={{ color: '#ff4444', textAlign: 'center', marginBottom: '16px', fontSize: '13px', background: 'rgba(255, 68, 68, 0.1)', padding: '8px', borderRadius: '4px' }}>
                {errorMsg}
              </div>
            )}
            <form className="login-form" onSubmit={async (e) => { 
              e.preventDefault(); 
              setErrorMsg('');
              try {
                await onSignIn(formData.email, formData.password);
              } catch (err) {
                setErrorMsg(err.message);
              }
            }}>
              <input type="email" name="email" placeholder={t('email')} className="login-input" value={formData.email} onChange={handleInputChange} required />
              <input type="password" name="password" placeholder={t('password')} className="login-input" value={formData.password} onChange={handleInputChange} required />
              <button type="submit" className="login-button">{t('signIn')}</button>
            </form>
          </div>
        );

      case 'changePassword':
        return (
          <div className="info-modal-body">
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
              <Key size={48} color="var(--accent)" />
            </div>
            <form className="login-form" onSubmit={(e) => {
              e.preventDefault();
              if (pwData.newPassword !== pwData.confirmPassword) return alert(t('passwordsDontMatch'));
              onChangePassword(pwData.newPassword);
            }}>
              <div className="input-group">
                <label style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>{t('newPassword')}</label>
                <input type="password" name="newPassword" value={pwData.newPassword} onChange={handlePwChange} className="login-input" style={{ width: '100%' }} required />
              </div>
              <div className="input-group">
                <label style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>{t('confirmPassword')}</label>
                <input type="password" name="confirmPassword" value={pwData.confirmPassword} onChange={handlePwChange} className="login-input" style={{ width: '100%' }} required />
              </div>
              <button type="submit" className="login-button" style={{ marginTop: '10px' }}>{t('save')}</button>
            </form>
          </div>
        );
      case 'settings':
        const SettingRow = ({ label, value, onChange, disabled }) => (
          <div className={`setting-row ${disabled ? 'disabled' : ''}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--panel-border)' }}>
            <span style={{ fontSize: '14px', fontWeight: '500' }}>{label}</span>
            <label className="switch">
              <input 
                type="checkbox" 
                checked={value} 
                onChange={(e) => onChange(e.target.checked)} 
                disabled={disabled}
              />
              <span className="slider round"></span>
            </label>
          </div>
        );



        return (
          <div className="info-modal-body" style={{ padding: '0 8px' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
              <Settings size={48} color="var(--accent)" />
            </div>
            <div className="settings-container">

              <div style={{ marginBottom: '16px' }}>
                <h3 style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.05em', marginBottom: '8px' }}>
                  {t('animations')}
                </h3>
                <div className="glass-panel" style={{ padding: '0 16px' }}>
                  <SettingRow 
                    label={t('allAnimations')} 
                    value={appSettings.animationsEnabled} 
                    onChange={(val) => setAppSettings(prev => ({ ...prev, animationsEnabled: val }))} 
                  />
                  <SettingRow 
                    label={t('cameraEnabled')} 
                    value={appSettings.cameraEnabled} 
                    onChange={(val) => setAppSettings(prev => ({ ...prev, cameraEnabled: val }))}
                    disabled={!appSettings.animationsEnabled}
                  />
                  <SettingRow 
                    label={t('expandEnabled')} 
                    value={appSettings.expandEnabled} 
                    onChange={(val) => setAppSettings(prev => ({ ...prev, expandEnabled: val }))}
                    disabled={!appSettings.animationsEnabled}
                  />
                  <SettingRow 
                    label={t('glowEnabled')} 
                    value={appSettings.glowEnabled} 
                    onChange={(val) => setAppSettings(prev => ({ ...prev, glowEnabled: val }))}
                    disabled={!appSettings.animationsEnabled}
                  />
                </div>
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="info-modal-overlay" onClick={onClose}>
      <div className="info-modal-content" onClick={(e) => e.stopPropagation()} style={type === 'notice' ? { paddingLeft: '8px', paddingRight: '8px' } : {}}>
        <button className="info-modal-close" onClick={onClose}>
          <X size={24} />
        </button>
        <div className="info-modal-title">{title}</div>
        {renderContent()}
      </div>
    </div>
  );
};

export default InfoModal;
