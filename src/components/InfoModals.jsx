import React, { useEffect, useMemo, useState } from 'react';
import { X, Shield, Info, Bell, Trash2, Settings, User, Users, UserCog, ShieldCheck, MessageCircle } from 'lucide-react';
import { buildLocationState, ensureCurrentOption, getCityOptions, getCountryLabelFromCode, getCountryOptions, getRegionOptions } from '../locationData';

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
  onViewMember,
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
  const [profileData, setProfileData] = useState({ phone: '', city: '', region: '', country: '', countryCode: '', regionCode: '' });
  const [pwData, setPwData] = useState({ newPassword: '', confirmPassword: '' });
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedMemberId, setExpandedMemberId] = useState(null);
  const [showSecurityForm, setShowSecurityForm] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg('');
    setIsSubmitting(false);
    setFormData({ email: '', password: '' });
    setPwData({ newPassword: '', confirmPassword: '' });
    setExpandedMemberId(null);
    setShowSecurityForm(false);
  }, [isOpen, type]);

  useEffect(() => {
    const nextLocation = buildLocationState({
      country: currentMember?.country || '',
      countryCode: currentMember?.country_code || currentMember?.countryCode || '',
      region: currentMember?.region || '',
      regionCode: currentMember?.region_code || currentMember?.regionCode || '',
      city: currentMember?.city || ''
    }, lang);
    setProfileData({
      phone: currentMember?.phone || '',
      ...nextLocation
    });
  }, [currentMember, lang]);

  const accountStatusLabel = useMemo(() => {
    if (currentRole === 'admin') return t('adminRole');
    if (currentRole === 'verified') return t('verifiedMember');
    return t('guestRole');
  }, [currentRole, t]);

  const canViewProposalNotice = currentRole === 'verified' || currentRole === 'admin';

  const personMap = useMemo(() => {
    const map = new Map();
    familyData.forEach((person) => {
      map.set(String(person.id), person);
    });
    return map;
  }, [familyData]);

  const countryOptions = useMemo(
    () => ensureCurrentOption(getCountryOptions(lang), profileData.countryCode, profileData.country),
    [lang, profileData.country, profileData.countryCode]
  );
  const regionOptions = useMemo(
    () => ensureCurrentOption(getRegionOptions(profileData.countryCode), profileData.regionCode, profileData.region),
    [profileData.countryCode, profileData.region, profileData.regionCode]
  );
  const cityOptions = useMemo(
    () => ensureCurrentOption(getCityOptions(profileData.countryCode, profileData.regionCode), profileData.city, profileData.city),
    [profileData.city, profileData.countryCode, profileData.regionCode]
  );

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

  const handleProfileCountryChange = (e) => {
    const nextCountryCode = e.target.value;
    const selectedCountry = countryOptions.find((option) => option.code === nextCountryCode);
    setProfileData((prev) => ({
      ...prev,
      countryCode: nextCountryCode,
      country: selectedCountry?.label || getCountryLabelFromCode(nextCountryCode, lang, ''),
      regionCode: '',
      region: '',
      city: ''
    }));
  };

  const handleProfileRegionChange = (e) => {
    const nextRegionCode = e.target.value;
    const selectedRegion = regionOptions.find((option) => option.code === nextRegionCode);
    setProfileData((prev) => ({
      ...prev,
      regionCode: nextRegionCode,
      region: selectedRegion?.label || '',
      city: ''
    }));
  };

  const handleProfileCityChange = (e) => {
    const nextCity = e.target.value;
    const selectedCity = cityOptions.find((option) => option.code === nextCity || option.label === nextCity);
    setProfileData((prev) => ({
      ...prev,
      city: selectedCity?.label || nextCity
    }));
  };

  const isWideListModal = type === 'memberManager' || type === 'listMember' || type === 'listAdmin';
  const isWideProfileModal = type === 'profile';
  const isMobileWideList = isWideListModal && window.innerWidth <= 768;
  const isMobileWideProfile = isWideProfileModal && window.innerWidth <= 768;

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

  const getWhatsAppLink = (phone) => {
    const normalizedPhone = String(phone || '').replace(/[^\d+]/g, '');
    if (!normalizedPhone) return null;
    const waPhone = normalizedPhone.startsWith('+')
      ? normalizedPhone.slice(1)
      : normalizedPhone.startsWith('0')
        ? `62${normalizedPhone.slice(1)}`
        : normalizedPhone;
    return `https://wa.me/${waPhone}`;
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

    const displayCountry = getCountryLabelFromCode(
      member.country_code || member.countryCode || '',
      lang,
      member.country || '-'
    );
    const approvalSubtitle = [member.email, member.city || member.region || displayCountry || '-'].filter(Boolean).join(' • ');
    const whatsappLink = getWhatsAppLink(member.phone);

    const isCompactCard = compact || approvalCompact;

    return (
      <div
        key={member.id}
        className="glass-panel"
        style={{
          padding: isMobileWideList ? '11px 12px' : '14px',
          marginBottom: isMobileWideList ? '10px' : '12px',
          borderRadius: isMobileWideList ? '14px' : undefined
        }}
      >
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
            {!isCompactCard && (
              <div style={{ fontSize: '11px', fontWeight: '700', color: iconColor, textAlign: 'right' }}>
                {member.claim_status === 'approved' ? t('memberApprovedBadge') : t('memberPendingBadge')}
              </div>
            )}
          </div>
          {isCompactCard && (
            <div
              style={{
                marginTop: '10px',
                display: 'inline-flex',
                maxWidth: '100%',
                padding: '4px 10px',
                borderRadius: '999px',
                background: member.claim_status === 'approved' ? 'rgba(22, 163, 74, 0.10)' : 'rgba(var(--accent-rgb), 0.10)',
                color: iconColor,
                fontSize: '11px',
                fontWeight: '700',
                lineHeight: 1.2,
                whiteSpace: 'normal',
                wordBreak: 'break-word'
              }}
            >
              {member.claim_status === 'approved' ? t('memberApprovedBadge') : t('memberPendingBadge')}
            </div>
          )}
        </button>

        {(!(compact || approvalCompact) || isExpanded) && (
          <>
            <div style={{ display: 'grid', gap: '6px', marginTop: '12px', fontSize: '13px' }}>
              <div><strong>{t('email')}:</strong> {member.email}</div>
              <div>
                <strong>{t('phone')}:</strong>{' '}
                {whatsappLink ? (
                  <a
                    href={whatsappLink}
                    target="_blank"
                    rel="noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#16a34a', fontWeight: 600, textDecoration: 'none' }}
                  >
                    <span>{member.phone}</span>
                    <MessageCircle size={14} />
                  </a>
                ) : (
                  member.phone || '-'
                )}
              </div>
              <div><strong>{t('city')}:</strong> {member.city || '-'}</div>
              <div><strong>{t('region')}:</strong> {member.region || '-'}</div>
              <div><strong>{t('country')}:</strong> {displayCountry || '-'}</div>
              {submittedAt && (
                <div>
                  <strong>{t('submittedAt')}:</strong>{' '}
                  {new Date(submittedAt).toLocaleString(lang === 'id' ? 'id-ID' : lang === 'ar' ? 'ar-SA' : 'en-US')}
                </div>
              )}
            </div>

            {(onViewMember || (actionLabel && actionHandler) || (secondaryActionLabel && secondaryActionHandler)) ? (
              <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap' }}>
                {relatedPerson && onViewMember && (
                  <button
                    type="button"
                    className="lineage-secondary-button"
                    onClick={() => onViewMember(relatedPerson.id)}
                    style={{ width: 'auto', paddingLeft: '14px', paddingRight: '14px' }}
                  >
                    {t('view')}
                  </button>
                )}
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
                            style={{
                              background: 'var(--accent)',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              padding: '6px 10px',
                              fontSize: '12px',
                              cursor: 'pointer',
                              fontWeight: 'bold',
                              opacity: 1
                            }}
                          >
                            {t('view')}
                          </button>
                          {currentRole === 'admin' && (
                            <button
                              className="notice-delete-button"
                              onClick={() => {
                                if (window.confirm(t('deleteNoticeConfirm'))) {
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
            <div className="sign-in-hint-box">
              <div className="sign-in-hint-title">{t('signInClaimRequiredTitle')}</div>
              <div>{t('signInClaimRequiredBody')}</div>
            </div>
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
          <div className="info-modal-body" style={isMobileWideProfile ? { padding: '0 4px 12px' } : { padding: '0 8px' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
              <User size={48} color="var(--accent)" />
            </div>
            {!currentMember && (
              <div className="glass-panel" style={{ padding: isMobileWideProfile ? '12px' : '16px', marginBottom: '16px', color: 'var(--text-secondary)', textAlign: 'center' }}>
                {currentRole === 'admin' ? t('legacyAdminProfileNotice') : t('signInPendingClaim')}
              </div>
            )}
            {errorMsg && (
              <div style={{ color: '#ff4444', textAlign: 'center', marginBottom: '16px', fontSize: '13px', background: 'rgba(255, 68, 68, 0.1)', padding: '8px', borderRadius: '4px' }}>
                {errorMsg}
              </div>
            )}
            <div className="glass-panel" style={{ padding: isMobileWideProfile ? '12px' : '16px', marginBottom: '16px' }}>
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

            <form className="glass-panel" style={{ padding: isMobileWideProfile ? '12px' : '16px', marginBottom: '16px' }} onSubmit={async (e) => {
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
                <label style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>{t('country')}</label>
                <select value={profileData.countryCode} onChange={handleProfileCountryChange} className="login-input" style={{ width: '100%' }}>
                  <option value="">{t('selectCountry')}</option>
                  {countryOptions.map((country) => (
                    <option key={country.code} value={country.code}>{country.label}</option>
                  ))}
                </select>
              </div>
              <div className="input-group">
                <label style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>{t('region')}</label>
                <select value={profileData.regionCode} onChange={handleProfileRegionChange} className="login-input" style={{ width: '100%' }} disabled={!profileData.countryCode || regionOptions.length === 0}>
                  <option value="">{t('selectRegion')}</option>
                  {regionOptions.map((region) => (
                    <option key={region.code} value={region.code}>{region.label}</option>
                  ))}
                </select>
                {!profileData.countryCode || regionOptions.length > 0 ? null : (
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>{t('noRegionOptions')}</div>
                )}
              </div>
              <div className="input-group">
                <label style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>{t('city')}</label>
                <select value={profileData.city} onChange={handleProfileCityChange} className="login-input" style={{ width: '100%' }} disabled={!profileData.countryCode || cityOptions.length === 0}>
                  <option value="">{t('selectCity')}</option>
                  {cityOptions.map((city) => (
                    <option key={city.code} value={city.code}>{city.label}</option>
                  ))}
                </select>
                {!profileData.countryCode || cityOptions.length > 0 ? null : (
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>{t('noCityOptions')}</div>
                )}
              </div>
              <button type="submit" className="login-button" style={{ marginTop: '10px' }} disabled={isSubmitting}>
                {t('saveProfile')}
              </button>
            </form>

            <div className="glass-panel" style={{ padding: isMobileWideProfile ? '12px' : '16px' }}>
              <div style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '12px', letterSpacing: '0.05em' }}>
                {t('profileSecurity')}
              </div>
              <button
                type="button"
                className="login-button"
                style={{ marginTop: '2px' }}
                onClick={() => setShowSecurityForm((prev) => !prev)}
                disabled={isSubmitting}
              >
                {t('changePassword')}
              </button>
              {showSecurityForm && (
                <form onSubmit={async (e) => {
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
                }} style={{ marginTop: '14px' }}>
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
                    {t('save')}
                  </button>
                </form>
              )}
            </div>
          </div>
        );
      case 'memberManager':
        return (
          <div className="info-modal-body" style={isMobileWideList ? { paddingLeft: '4px', paddingRight: '4px', paddingTop: '0', paddingBottom: '14px' } : { paddingLeft: '16px', paddingRight: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: isMobileWideList ? '12px' : '20px' }}>
              <Users size={isMobileWideList ? 42 : 48} color="var(--accent)" />
            </div>
            {errorMsg && (
              <div style={{ color: '#ff4444', textAlign: 'center', marginBottom: '16px', fontSize: '13px', background: 'rgba(255, 68, 68, 0.1)', padding: '8px', borderRadius: '4px' }}>
                {errorMsg}
              </div>
            )}
            <div style={{ maxHeight: '64vh', overflowY: 'auto' }}>
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
          <div className="info-modal-body" style={isMobileWideList ? { paddingLeft: '4px', paddingRight: '4px', paddingTop: '0', paddingBottom: '14px' } : { paddingLeft: '16px', paddingRight: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: isMobileWideList ? '12px' : '20px' }}>
              <UserCog size={isMobileWideList ? 42 : 48} color="var(--accent)" />
            </div>
            {errorMsg && (
              <div style={{ color: '#ff4444', textAlign: 'center', marginBottom: '16px', fontSize: '13px', background: 'rgba(255, 68, 68, 0.1)', padding: '8px', borderRadius: '4px' }}>
                {errorMsg}
              </div>
            )}
            <div style={{ maxHeight: '64vh', overflowY: 'auto' }}>
              {loadingMembers ? (
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>{t('loading')}</div>
              ) : verifiedMembers.length === 0 ? (
                <div className="glass-panel" style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  {t('noVerifiedMembers')}
                </div>
              ) : (
                verifiedMembers.map((member) => renderMemberCard(
                  member,
                  currentRole === 'admin' ? t('promoteToAdmin') : null,
                  currentRole === 'admin' ? onPromoteAdmin : null,
                  'var(--accent)',
                  { compact: true }
                ))
              )}
            </div>
          </div>
        );
      case 'listAdmin':
        return (
          <div className="info-modal-body" style={isMobileWideList ? { paddingLeft: '4px', paddingRight: '4px', paddingTop: '0', paddingBottom: '14px' } : { paddingLeft: '16px', paddingRight: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: isMobileWideList ? '12px' : '20px' }}>
              <ShieldCheck size={isMobileWideList ? 42 : 48} color="var(--accent)" />
            </div>
            {errorMsg && (
              <div style={{ color: '#ff4444', textAlign: 'center', marginBottom: '16px', fontSize: '13px', background: 'rgba(255, 68, 68, 0.1)', padding: '8px', borderRadius: '4px' }}>
                {errorMsg}
              </div>
            )}
            <div style={{ maxHeight: '64vh', overflowY: 'auto' }}>
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

  const overlayStyle = {};

  return (
    <div className="info-modal-overlay" onClick={onClose} style={overlayStyle}>
      <div
        className="info-modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '760px',
          width: 'min(96vw, 760px)',
          maxHeight: '90vh',
          borderRadius: '22px',
          ...(window.innerWidth <= 768 ? {
            width: '96vw',
            maxWidth: '96vw',
            maxHeight: '84vh',
            margin: '0 auto'
          } : {})
        }}
      >
        <button className="info-modal-close" onClick={onClose}>
          <X size={24} />
        </button>
        <div className="info-modal-title" style={(isMobileWideList || isMobileWideProfile) ? { paddingLeft: '10px', paddingRight: '10px', paddingTop: '18px', marginBottom: '12px' } : {}}>
          {title}
        </div>
        {renderContent()}
      </div>
    </div>
  );
};

export default InfoModal;
