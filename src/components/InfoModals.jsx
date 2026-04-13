import React, { useEffect, useMemo, useState } from 'react';
import { X, Shield, Info, Bell, Trash2, Settings, User, Users, UserCog, ShieldCheck } from 'lucide-react';

const InfoModal = ({
  isOpen,
  onClose,
  title,
  type,
  t,
  lang,
  onSignIn,
  onChangePassword,
  currentUser,
  currentMember,
  currentRole,
  familyData = [],
  notices = [],
  onViewNotice,
  onDeleteNotice,
  appSettings,
  setAppSettings,
  onUpdateProfile,
  memberClaims = [],
  verifiedMembers = [],
  adminMembers = [],
  onApproveMember,
  onRejectMember,
  onPromoteAdmin,
  loadingMembers = false
}) => {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [profileData, setProfileData] = useState({ phone: '', city: '', country: '' });
  const [pwData, setPwData] = useState({ newPassword: '', confirmPassword: '' });
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedMemberId, setExpandedMemberId] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg('');
    setIsSubmitting(false);
    setFormData({ email: '', password: '' });
    setPwData({ newPassword: '', confirmPassword: '' });
    setExpandedMemberId(null);
  }, [isOpen, type]);

  useEffect(() => {
    setProfileData({
      phone: currentMember?.phone || '',
      city: currentMember?.city || '',
      country: currentMember?.country || ''
    });
  }, [currentMember]);

  const accountStatusLabel = useMemo(() => {
    if (currentRole === 'admin') return t('adminRole');
    if (currentRole === 'verified') return t('verifiedMember');
    return t('guestRole');
  }, [currentRole, t]);

  const personMap = useMemo(() => {
    const map = new Map();
    familyData.forEach((person) => {
      map.set(String(person.id), person);
    });
    return map;
  }, [familyData]);

  if (!isOpen) return null;

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handlePwChange = (e) => {
    const { name, value } = e.target;
    setPwData((prev) => ({ ...prev, [name]: value }));
  };

  const handleProfileChange = (e) => {
    const { name, value } = e.target;
    setProfileData((prev) => ({ ...prev, [name]: value }));
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

  const renderMemberCard = (member, actionLabel = null, actionHandler = null, iconColor = 'var(--accent)', options = {}) => {
    const { compact = false, approvalCompact = false, secondaryActionLabel = null, secondaryActionHandler = null } = options;
    const personName = lang === 'ar'
      ? (member.arabic_name_snapshot || member.arabicNameSnapshot || '-')
      : (member.english_name_snapshot || member.englishNameSnapshot || member.arabic_name_snapshot || member.arabicNameSnapshot || '-');
    const arabicName = member.arabic_name_snapshot || member.arabicNameSnapshot || '-';
    const submittedAt = member.created_at || member.createdAt;
    const relatedPerson = personMap.get(String(member.person_id));
    const father = relatedPerson?.fatherId ? personMap.get(String(relatedPerson.fatherId)) : null;
    const grandfather = father?.fatherId ? personMap.get(String(father.fatherId)) : null;
    const fatherArabicName = father?.arabicName || '-';
    const grandfatherArabicName = grandfather?.arabicName || '-';
    const fatherLatinName = father ? (father.englishName || father.arabicName || '-') : '-';
    const grandfatherLatinName = grandfather ? (grandfather.englishName || grandfather.arabicName || '-') : '-';
    const isExpanded = expandedMemberId === member.id;
    const compactArabicLine = [arabicName, fatherArabicName, grandfatherArabicName].filter(Boolean).join(' بن ');
    const compactLatinLine = [
      member.english_name_snapshot || member.englishNameSnapshot || member.arabic_name_snapshot || member.arabicNameSnapshot || '-',
      fatherLatinName,
      grandfatherLatinName
    ].filter(Boolean).join(' bin ');

    const approvalSubtitle = [member.email, member.city || member.country || '-'].filter(Boolean).join(' • ');

    return (
      <div key={member.id} className="glass-panel" style={{ padding: '14px', marginBottom: '12px' }}>
        <button
          type="button"
          onClick={() => {
            if (compact || approvalCompact) {
              setExpandedMemberId((prev) => (prev === member.id ? null : member.id));
            }
          }}
          style={{ display: 'block', width: '100%', background: 'transparent', border: 'none', padding: 0, textAlign: 'left', cursor: (compact || approvalCompact) ? 'pointer' : 'default' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: '700', fontSize: compact ? '18px' : '15px', color: 'var(--text-primary)', lineHeight: '1.45' }}>
                <span style={(compact || approvalCompact) ? {
                  display: 'block',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: '100%'
                } : undefined}>
                  {compact ? compactArabicLine : personName}
                </span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: '1.5' }}>
                <span style={(compact || approvalCompact) ? {
                  display: 'block',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: '100%'
                } : undefined}>
                  {compact ? compactLatinLine : arabicName}
                </span>
              </div>
              {approvalCompact && (
                <div style={{
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                  marginTop: '6px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: '100%'
                }}>
                  {approvalSubtitle}
                </div>
              )}
            </div>
            <div style={{ fontSize: '11px', fontWeight: '700', color: iconColor }}>
              {member.claim_status === 'approved' ? t('memberApprovedBadge') : t('memberPendingBadge')}
            </div>
          </div>
        </button>

        {(!(compact || approvalCompact) || isExpanded) && (
          <>
            <div style={{ display: 'grid', gap: '6px', marginTop: '12px', fontSize: '13px' }}>
              <div><strong>{t('email')}:</strong> {member.email}</div>
              <div><strong>{t('phone')}:</strong> {member.phone || '-'}</div>
              <div><strong>{t('city')}:</strong> {member.city || '-'}</div>
              <div><strong>{t('country')}:</strong> {member.country || '-'}</div>
              {submittedAt && (
                <div>
                  <strong>{t('submittedAt')}:</strong>{' '}
                  {new Date(submittedAt).toLocaleString(lang === 'id' ? 'id-ID' : lang === 'ar' ? 'ar-SA' : 'en-US')}
                </div>
              )}
            </div>

            {(actionLabel && actionHandler) || (secondaryActionLabel && secondaryActionHandler) ? (
              <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap' }}>
                {secondaryActionLabel && secondaryActionHandler && (
                  <button
                    type="button"
                    className="lineage-danger-button"
                    onClick={async () => {
                      setErrorMsg('');
                      setIsSubmitting(true);
                      try {
                        await secondaryActionHandler(member);
                      } catch (err) {
                        setErrorMsg(err?.message || t('updateFailed'));
                      } finally {
                        setIsSubmitting(false);
                      }
                    }}
                    disabled={isSubmitting}
                    style={{ width: 'auto', paddingLeft: '14px', paddingRight: '14px' }}
                  >
                    {secondaryActionLabel}
                  </button>
                )}
                {actionLabel && actionHandler && (
                <button
                  type="button"
                  className="login-button"
                  onClick={async () => {
                    setErrorMsg('');
                    setIsSubmitting(true);
                    try {
                      await actionHandler(member);
                    } catch (err) {
                      setErrorMsg(err?.message || t('updateFailed'));
                    } finally {
                      setIsSubmitting(false);
                    }
                  }}
                  disabled={isSubmitting}
                  style={{ width: 'auto', paddingLeft: '14px', paddingRight: '14px' }}
                >
                  {actionLabel}
                </button>
                )}
              </div>
            ) : null}
          </>
        )}
      </div>
    );
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
          <div className="info-modal-body notice-modal-body" style={type === 'notice' ? { paddingLeft: '12px', paddingRight: '12px' } : {}}>
            <div className="notice-modal-hero" style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
              <Bell size={48} color="var(--accent)" />
            </div>
            <div className="notice-list-container" style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {notices.length === 0 ? (
                <div className="notice-empty-state" style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                  <Bell size={32} opacity={0.3} />
                  <p>{t('noticeEmpty')}</p>
                </div>
              ) : (
                <div className="notice-feed">
                  {notices.map((n, idx) => {
                    const meta = getNoticeMeta(n);
                    return (
                      <div key={n.id || idx} className="glass-panel notice-card" style={{ borderLeft: `4px solid ${meta.borderColor}` }}>
                        <div className="notice-card-main" style={{ flex: 1 }}>
                          <div className="notice-card-badge" style={{ background: meta.badgeBg, color: meta.badgeColor }}>
                            {meta.label}
                          </div>
                          <div className="notice-card-text">{n.text}</div>
                          <div className="notice-card-time">
                            {new Date(n.timestamp).toLocaleString(lang === 'id' ? 'id-ID' : lang === 'ar' ? 'ar-SA' : 'en-US')}
                          </div>
                        </div>
                        <div className="notice-card-actions">
                          <button
                            className="notice-view-button"
                            onClick={() => onViewNotice && onViewNotice(n)}
                            style={{ background: 'var(--accent)', color: 'white', border: 'none', borderRadius: '4px', padding: '6px 10px', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}
                          >
                            {t('view')}
                          </button>
                          {currentRole === 'admin' && (
                            <button
                              className="notice-delete-button"
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
                    );
                  })}
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
              setIsSubmitting(true);
              try {
                await onSignIn((formData.email || '').trim(), formData.password);
              } catch (err) {
                setErrorMsg(err.message);
              } finally {
                setIsSubmitting(false);
              }
            }}>
              <input type="email" name="email" placeholder={t('email')} className="login-input" value={formData.email} onChange={handleInputChange} required />
              <input type="password" name="password" placeholder={t('password')} className="login-input" value={formData.password} onChange={handleInputChange} required />
              <button type="submit" className="login-button" disabled={isSubmitting}>{t('signIn')}</button>
            </form>
          </div>
        );
      case 'profile':
        return (
          <div className="info-modal-body" style={{ padding: '0 8px' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
              <User size={48} color="var(--accent)" />
            </div>
            {!currentMember && (
              <div className="glass-panel" style={{ padding: '16px', marginBottom: '16px', color: 'var(--text-secondary)', textAlign: 'center' }}>
                {currentRole === 'admin' ? t('legacyAdminProfileNotice') : t('signInPendingClaim')}
              </div>
            )}
            {errorMsg && (
              <div style={{ color: '#ff4444', textAlign: 'center', marginBottom: '16px', fontSize: '13px', background: 'rgba(255, 68, 68, 0.1)', padding: '8px', borderRadius: '4px' }}>
                {errorMsg}
              </div>
            )}
            <div className="glass-panel" style={{ padding: '16px', marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '12px', letterSpacing: '0.05em' }}>
                {t('profileIdentity')}
              </div>
              <div style={{ display: 'grid', gap: '8px', fontSize: '14px' }}>
                <div><strong>{t('linkedPerson')}:</strong> {lang === 'ar' ? (currentMember?.arabic_name_snapshot || '-') : (currentMember?.english_name_snapshot || currentMember?.arabic_name_snapshot || '-')}</div>
                <div><strong>{t('placeholderArab')}:</strong> {currentMember?.arabic_name_snapshot || '-'}</div>
                <div><strong>{t('placeholderLatin')}:</strong> {currentMember?.english_name_snapshot || '-'}</div>
                <div><strong>{t('accountStatus')}:</strong> {accountStatusLabel}</div>
              </div>
            </div>

            <form className="glass-panel" style={{ padding: '16px', marginBottom: '16px' }} onSubmit={async (e) => {
              e.preventDefault();
              setErrorMsg('');
              setIsSubmitting(true);
              try {
                await onUpdateProfile(profileData);
              } catch (err) {
                setErrorMsg(err?.message || t('updateFailed'));
              } finally {
                setIsSubmitting(false);
              }
            }}>
              <div style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '12px', letterSpacing: '0.05em' }}>
                {t('profileAccount')}
              </div>
              <div className="input-group">
                <label style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>{t('email')}</label>
                <input type="email" value={currentMember?.email || currentUser?.email || ''} className="login-input" style={{ width: '100%' }} disabled />
              </div>
              <div className="input-group">
                <label style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>{t('phone')}</label>
                <input type="text" name="phone" value={profileData.phone} onChange={handleProfileChange} className="login-input" style={{ width: '100%' }} required />
              </div>
              <div className="input-group">
                <label style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>{t('city')}</label>
                <input type="text" name="city" value={profileData.city} onChange={handleProfileChange} className="login-input" style={{ width: '100%' }} required />
              </div>
              <div className="input-group">
                <label style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>{t('country')}</label>
                <input type="text" name="country" value={profileData.country} onChange={handleProfileChange} className="login-input" style={{ width: '100%' }} />
              </div>
              <button type="submit" className="login-button" style={{ marginTop: '10px' }} disabled={isSubmitting}>
                {t('saveProfile')}
              </button>
            </form>

            <form className="glass-panel" style={{ padding: '16px' }} onSubmit={async (e) => {
              e.preventDefault();
              setErrorMsg('');
              if ((pwData.newPassword || '').length < 6) {
                setErrorMsg(t('passwordMinLengthRule'));
                return;
              }
              if (pwData.newPassword !== pwData.confirmPassword) {
                setErrorMsg(t('passwordsDontMatch'));
                return;
              }
              setIsSubmitting(true);
              try {
                await onChangePassword(pwData.newPassword);
              } catch (err) {
                setErrorMsg(err?.message || 'Failed to change password.');
              } finally {
                setIsSubmitting(false);
              }
            }}>
              <div style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '12px', letterSpacing: '0.05em' }}>
                {t('profileSecurity')}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '16px', lineHeight: '1.5', background: 'var(--panel-highlight-bg)', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--panel-border)' }}>
                {t('passwordMinLengthRule')}
              </div>
              <div className="input-group">
                <label style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>{t('newPassword')}</label>
                <input type="password" name="newPassword" minLength={6} value={pwData.newPassword} onChange={handlePwChange} className="login-input" style={{ width: '100%' }} required />
              </div>
              <div className="input-group">
                <label style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>{t('confirmPassword')}</label>
                <input type="password" name="confirmPassword" minLength={6} value={pwData.confirmPassword} onChange={handlePwChange} className="login-input" style={{ width: '100%' }} required />
              </div>
              <button type="submit" className="login-button" style={{ marginTop: '10px' }} disabled={isSubmitting}>
                {t('changePassword')}
              </button>
            </form>
          </div>
        );
      case 'memberManager':
        return (
          <div className="info-modal-body">
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
              <Users size={48} color="var(--accent)" />
            </div>
            {errorMsg && (
              <div style={{ color: '#ff4444', textAlign: 'center', marginBottom: '16px', fontSize: '13px', background: 'rgba(255, 68, 68, 0.1)', padding: '8px', borderRadius: '4px' }}>
                {errorMsg}
              </div>
            )}
            <div style={{ maxHeight: '420px', overflowY: 'auto' }}>
              {loadingMembers ? (
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>{t('loading')}</div>
              ) : memberClaims.length === 0 ? (
                <div className="glass-panel" style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  {t('noPendingClaims')}
                </div>
              ) : (
                memberClaims.map((member) => renderMemberCard(member, t('approveMember'), onApproveMember, 'var(--accent)', {
                  approvalCompact: true,
                  secondaryActionLabel: t('rejectMember'),
                  secondaryActionHandler: onRejectMember
                }))
              )}
            </div>
          </div>
        );
      case 'listMember':
        return (
          <div className="info-modal-body">
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
              <UserCog size={48} color="var(--accent)" />
            </div>
            {errorMsg && (
              <div style={{ color: '#ff4444', textAlign: 'center', marginBottom: '16px', fontSize: '13px', background: 'rgba(255, 68, 68, 0.1)', padding: '8px', borderRadius: '4px' }}>
                {errorMsg}
              </div>
            )}
            <div style={{ maxHeight: '420px', overflowY: 'auto' }}>
              {loadingMembers ? (
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>{t('loading')}</div>
              ) : verifiedMembers.length === 0 ? (
                <div className="glass-panel" style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  {t('noVerifiedMembers')}
                </div>
              ) : (
                verifiedMembers.map((member) => renderMemberCard(member, t('promoteToAdmin'), onPromoteAdmin, 'var(--accent)', { compact: true }))
              )}
            </div>
          </div>
        );
      case 'listAdmin':
        return (
          <div className="info-modal-body">
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
              <ShieldCheck size={48} color="var(--accent)" />
            </div>
            {errorMsg && (
              <div style={{ color: '#ff4444', textAlign: 'center', marginBottom: '16px', fontSize: '13px', background: 'rgba(255, 68, 68, 0.1)', padding: '8px', borderRadius: '4px' }}>
                {errorMsg}
              </div>
            )}
            <div style={{ maxHeight: '420px', overflowY: 'auto' }}>
              {loadingMembers ? (
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>{t('loading')}</div>
              ) : adminMembers.length === 0 ? (
                <div className="glass-panel" style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  {t('noAdmins')}
                </div>
              ) : (
                adminMembers.map((member) => renderMemberCard(member, null, null, '#16a34a', { compact: true }))
              )}
            </div>
          </div>
        );
      case 'settings': {
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
                    onChange={(val) => setAppSettings((prev) => ({ ...prev, animationsEnabled: val }))}
                  />
                  <SettingRow
                    label={t('cameraEnabled')}
                    value={appSettings.cameraEnabled}
                    onChange={(val) => setAppSettings((prev) => ({ ...prev, cameraEnabled: val }))}
                    disabled={!appSettings.animationsEnabled}
                  />
                  <SettingRow
                    label={t('expandEnabled')}
                    value={appSettings.expandEnabled}
                    onChange={(val) => setAppSettings((prev) => ({ ...prev, expandEnabled: val }))}
                    disabled={!appSettings.animationsEnabled}
                  />
                  <SettingRow
                    label={t('glowEnabled')}
                    value={appSettings.glowEnabled}
                    onChange={(val) => setAppSettings((prev) => ({ ...prev, glowEnabled: val }))}
                    disabled={!appSettings.animationsEnabled}
                  />
                </div>
              </div>
            </div>
          </div>
        );
      }
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
