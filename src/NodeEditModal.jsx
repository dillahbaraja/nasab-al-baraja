import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Pencil, Trash2 } from 'lucide-react';

const createEmptyChildInput = () => ({ latin: '', arab: '' });

const NodeEditModal = ({
  isOpen,
  onClose,
  person: initialPerson,
  familyData,
  onAddChild,
  onUpdateChild,
  onRemoveChild,
  onViewPerson,
  onShowLineageOnly,
  onDownloadAncestorPdf,
  onShowRelationshipWithMe,
  onStartNodeComparison,
  onCompleteNodeComparison,
  onCancelNodeComparison,
  onSubmitChildSuggestion,
  onSubmitNameSuggestion,
  onUpdateProposal,
  onCancelProposal,
  onApproveProposal,
  onRejectProposal,
  onSkipPending,
  lang,
  t,
  currentUser,
  isAdmin,
  canModerateProposals = false,
  currentRole,
  canShowRelationshipWithMe = false,
  nodeComparisonSourceId = null,
  nodeComparisonSourceName = '',
  memberClaimStatus = 'none',
  allowMemberClaim = false,
  currentMemberClaimStatus = 'none',
  onSubmitMemberClaim
}) => {
  const familyMap = useMemo(() => {
    const nextMap = new Map();
    familyData.forEach((member) => {
      nextMap.set(String(member.id), member);
    });
    return nextMap;
  }, [familyData]);
  const person = initialPerson ? (familyMap.get(String(initialPerson.id)) || initialPerson) : null;
  const [childrenInputs, setChildrenInputs] = useState([createEmptyChildInput()]);
  const [showFullNasab, setShowFullNasab] = useState(false);
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [editInfoText, setEditInfoText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [activeSuggestionMode, setActiveSuggestionMode] = useState(null);
  const [proposalNameForm, setProposalNameForm] = useState({ latin: '', arab: '' });
  const [claimForm, setClaimForm] = useState({ email: '', password: '', phone: '', country: '', countryCode: '', region: '', regionCode: '', city: '' });
  const [locationApi, setLocationApi] = useState(null);
  const suggestionFormRef = useRef(null);
  const primarySuggestionInputRef = useRef(null);

  const pendingNameChange = person?.moderation?.nameChange?.status === 'pending'
    ? person.moderation.nameChange
    : null;
  const isPendingAddSuggestion = person?.moderation?.status === 'pending' && person?.moderation?.type === 'add_child';
  const hasPendingProposal = Boolean(isPendingAddSuggestion || pendingNameChange);
  const isMobileDevice = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    return /iPhone|iPod|Android/i.test(navigator.userAgent)
      || (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)')?.matches);
  }, []);
  const normalizedPersonId = person ? String(person.id) : null;
  const isNodeComparisonPending = Boolean(nodeComparisonSourceId);
  const isCurrentComparisonSource = isNodeComparisonPending && normalizedPersonId === String(nodeComparisonSourceId);
  const canStartNodeComparison = Boolean(person && !isNodeComparisonPending);
  const canCompleteNodeComparison = Boolean(person && isNodeComparisonPending && !isCurrentComparisonSource);
  const actionButtonBaseStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 20px',
    borderRadius: '10px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 'bold',
    letterSpacing: '0.01em',
    flex: '1 1 140px',
    justifyContent: 'center',
    border: '1px solid transparent',
    boxShadow: '0 10px 24px rgba(15, 23, 42, 0.12)',
    transition: 'transform 0.18s ease, box-shadow 0.18s ease, filter 0.18s ease'
  };
  const lineageActionStyle = {
    ...actionButtonBaseStyle,
    background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
    color: '#ffffff',
    boxShadow: '0 10px 24px rgba(22, 163, 74, 0.28)'
  };
  const pdfActionStyle = {
    ...actionButtonBaseStyle,
    background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
    color: '#ffffff',
    boxShadow: '0 10px 24px rgba(37, 99, 235, 0.28)'
  };
  const memberRelationActionStyle = {
    ...actionButtonBaseStyle,
    background: 'linear-gradient(135deg, #0f766e 0%, #0f766e 100%)',
    color: '#ffffff',
    boxShadow: '0 10px 24px rgba(15, 118, 110, 0.28)'
  };
  const compareActionStyle = isCurrentComparisonSource
    ? {
        ...actionButtonBaseStyle,
        background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
        color: '#ffffff',
        boxShadow: '0 10px 24px rgba(239, 68, 68, 0.28)'
      }
    : canCompleteNodeComparison
      ? {
          ...actionButtonBaseStyle,
          background: 'linear-gradient(135deg, #0891b2 0%, #0e7490 100%)',
          color: '#ffffff',
          boxShadow: '0 10px 24px rgba(8, 145, 178, 0.28)'
        }
      : {
          ...actionButtonBaseStyle,
          background: 'linear-gradient(135deg, #475569 0%, #334155 100%)',
          color: '#ffffff',
          boxShadow: '0 10px 24px rgba(71, 85, 105, 0.28)'
        };

  const displayNames = useMemo(() => {
    if (!person) return { englishName: '', arabicName: '' };
    if (pendingNameChange) {
      return {
        englishName: pendingNameChange.proposedEnglishName || person.englishName || '',
        arabicName: pendingNameChange.proposedArabicName || person.arabicName || ''
      };
    }
    return {
      englishName: person.englishName || '',
      arabicName: person.arabicName || ''
    };
  }, [person, pendingNameChange]);

  useEffect(() => {
    setShowFullNasab(false);
    setIsEditingInfo(false);
    setIsSaving(false);
    setChildrenInputs([createEmptyChildInput()]);
    setActiveSuggestionMode(null);
    setProposalNameForm({
      latin: displayNames.englishName || '',
      arab: displayNames.arabicName || ''
    });
    setClaimForm({
      email: '',
      password: '',
      phone: '',
      country: '',
      countryCode: '',
      region: '',
      regionCode: '',
      city: ''
    });
  }, [person, displayNames]);

  useEffect(() => {
    if (isMobileDevice) return;
    if (!activeSuggestionMode) return;

    const timer = setTimeout(() => {
      suggestionFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      if (primarySuggestionInputRef.current) {
        primarySuggestionInputRef.current.focus();
        primarySuggestionInputRef.current.select();
      }
    }, 60);

    return () => clearTimeout(timer);
  }, [activeSuggestionMode, isMobileDevice]);

  useEffect(() => {
    if (isMobileDevice || activeSuggestionMode !== 'claimMember') return;
    if (locationApi) return;

    let cancelled = false;
    import('./locationData').then((mod) => {
      if (!cancelled) setLocationApi(mod);
    }).catch((error) => {
      console.error('Location data failed to load:', error);
    });

    return () => {
      cancelled = true;
    };
  }, [activeSuggestionMode, isMobileDevice, locationApi]);

  const children = useMemo(() => {
    if (!person) return [];
    return familyData.filter((member) => String(member.fatherId) === String(person.id));
  }, [familyData, person]);
  const canEditPendingChildFromList = true;
  const claimCountryOptions = useMemo(() => (locationApi?.getCountryOptions ? locationApi.getCountryOptions(lang) : []), [locationApi, lang]);
  const claimRegionOptions = useMemo(() => (locationApi?.getRegionOptions ? locationApi.getRegionOptions(claimForm.countryCode) : []), [locationApi, claimForm.countryCode]);
  const claimCityOptions = useMemo(() => (locationApi?.getCityOptions ? locationApi.getCityOptions(claimForm.countryCode, claimForm.regionCode) : []), [locationApi, claimForm.countryCode, claimForm.regionCode]);

  if (!isOpen || !person) return null;

  const displayName = lang === 'ar' ? displayNames.arabicName : (displayNames.englishName || displayNames.arabicName);
  const getChildName = (c) => {
    const childPendingName = c?.moderation?.nameChange?.status === 'pending' ? c.moderation.nameChange : null;
    if (lang === 'ar') return childPendingName?.proposedArabicName || c.arabicName;
    return childPendingName?.proposedEnglishName || c.englishName || c.arabicName;
  };

  const getFullNasab = (targetPerson, language, showAll = false) => {
    let nasab = [];
    let current = targetPerson;
    let count = 0;
    while (current && count < 50 && (showAll || count <= 5)) {
      const currentPendingName = current?.moderation?.nameChange?.status === 'pending'
        ? current.moderation.nameChange
        : null;
      nasab.push(language === 'ar'
        ? (currentPendingName?.proposedArabicName || current.arabicName)
        : (currentPendingName?.proposedEnglishName || current.englishName || current.arabicName));
      current = current?.fatherId ? familyMap.get(String(current.fatherId)) : null;
      count++;
    }
    return nasab.join(language === 'ar' ? ' بن ' : ' bin ');
  };

  const getShortNasab = (targetPerson, language, ancestorLimit = 5) => {
    const nasab = [];
    let current = targetPerson?.fatherId ? familyMap.get(String(targetPerson.fatherId)) : null;
    let count = 0;

    while (current && count < ancestorLimit) {
      const currentPendingName = current?.moderation?.nameChange?.status === 'pending'
        ? current.moderation.nameChange
        : null;
      nasab.push(language === 'ar'
        ? (currentPendingName?.proposedArabicName || current.arabicName)
        : (currentPendingName?.proposedEnglishName || current.englishName || current.arabicName));
      current = current?.fatherId ? familyMap.get(String(current.fatherId)) : null;
      count++;
    }

    return nasab.join(language === 'ar' ? ' بن ' : ' bin ');
  };

  const getAncestorCount = (targetPerson) => {
    let current = targetPerson?.fatherId ? familyMap.get(String(targetPerson.fatherId)) : null;
    let count = 0;
    while (current && count < 50) {
      count++;
      current = current?.fatherId ? familyMap.get(String(current.fatherId)) : null;
    }
    return count;
  };

  const personHasDescendants = children.length > 0;
  const canDownloadAncestorPdf = true;

  const handleAdd = async (e) => {
    e.preventDefault();
    const validChildren = childrenInputs.filter((c) => c.arab.trim() !== '');
    if (validChildren.length === 0 || isSaving) return;

    setIsSaving(true);
    try {
      const payload = validChildren.map((c) => ({
        englishName: c.latin.trim(),
        arabicName: c.arab.trim()
      }));
      await onAddChild(person, payload);
      setChildrenInputs([createEmptyChildInput()]);
      onClose();
    } catch (err) {
      console.error('Save Error:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmitChildSuggestionForm = async (e) => {
    e.preventDefault();
    const validChildren = childrenInputs.filter((c) => c.arab.trim() !== '');
    if (validChildren.length === 0 || isSaving) return;

    setIsSaving(true);
    try {
      await onSubmitChildSuggestion(person, validChildren.map((child) => ({
        englishName: child.latin.trim(),
        arabicName: child.arab.trim()
      })));
      setChildrenInputs([createEmptyChildInput()]);
      setActiveSuggestionMode(null);
      onClose();
    } catch (err) {
      console.error('Proposal Save Error:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmitNameSuggestionForm = async (e) => {
    e.preventDefault();
    if (!proposalNameForm.arab.trim() || isSaving) return;

    setIsSaving(true);
    try {
      await onSubmitNameSuggestion(person.id, {
        englishName: proposalNameForm.latin.trim(),
        arabicName: proposalNameForm.arab.trim()
      });
      setActiveSuggestionMode(null);
      onClose();
    } catch (err) {
      console.error('Name Proposal Save Error:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSavePendingProposal = async (e) => {
    e.preventDefault();
    if (!proposalNameForm.arab.trim() || isSaving) return;

    setIsSaving(true);
    try {
      await onUpdateProposal(person, {
        englishName: proposalNameForm.latin.trim(),
        arabicName: proposalNameForm.arab.trim()
      });
      setActiveSuggestionMode(null);
      onClose();
    } catch (err) {
      console.error('Pending Proposal Update Error:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveCurrentPerson = async () => {
    if (personHasDescendants) return;
    if (!window.confirm(`${t('confirmDeleteLeafPerson')} ${displayName}?`)) {
      return;
    }
    if (isSaving) return;

    setIsSaving(true);
    try {
      await onRemoveChild(person.id);
      onClose();
    } catch (err) {
      console.error('Delete Current Person Error:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmitMemberClaimForm = async (e) => {
    e.preventDefault();
    const payload = {
      email: (claimForm.email || '').trim(),
      password: claimForm.password || '',
      phone: (claimForm.phone || '').trim(),
      countryCode: claimForm.countryCode || '',
      country: (claimForm.country || '').trim(),
      regionCode: claimForm.regionCode || '',
      region: (claimForm.region || '').trim(),
      city: (claimForm.city || '').trim()
    };

    if (!payload.email || !payload.password || !payload.phone || !payload.city || isSaving) return;

    setIsSaving(true);
    try {
      await onSubmitMemberClaim(person, payload);
      setActiveSuggestionMode(null);
      onClose();
    } catch (err) {
      console.error('Member Claim Save Error:', err);
      alert(err?.message || t('claimFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditCurrentPersonName = () => {
    setProposalNameForm({
      latin: person.englishName || '',
      arab: person.arabicName || ''
    });
    setActiveSuggestionMode('adminEdit');
  };

  const handleSaveAdminEdit = async (e) => {
    e.preventDefault();
    if (!proposalNameForm.arab.trim() || isSaving) return;

    setIsSaving(true);
    try {
      await onUpdateChild(person.id, {
        englishName: proposalNameForm.latin.trim(),
        arabicName: proposalNameForm.arab.trim()
      });
      setActiveSuggestionMode(null);
      onClose();
    } catch (err) {
      console.error('Edit Current Person Error:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const saveInfo = () => {
    setIsEditingInfo(false);
    const currentInfo = person.info || '';
    const newInfo = editInfoText.trim();
    if (newInfo !== currentInfo) {
      onUpdateChild(person.id, { info: newInfo });
    }
  };

  const renderNameForm = (title, onSubmit, submitLabel) => (
    <form ref={suggestionFormRef} onSubmit={onSubmit} className="lineage-modal-form lineage-suggestion-form">
      <h3 className="lineage-section-title">
        {title}
      </h3>
      <div className="lineage-form-stack">
        <div className="lineage-name-input-grid">
          <input
            ref={primarySuggestionInputRef}
            type="text"
            placeholder={`${t('placeholderArab')} *`}
            className="search-input lineage-name-input"
            style={{ padding: '12px 14px', background: 'var(--input-bg)', border: '1px solid var(--panel-border)', borderRadius: '12px', color: 'var(--text-primary)' }}
            value={proposalNameForm.arab}
            onChange={(e) => setProposalNameForm((prev) => ({ ...prev, arab: e.target.value }))}
            required
          />
          <input
            type="text"
            placeholder={`${t('placeholderLatin')} ${t('optional')}`}
            className="search-input lineage-name-input"
            style={{ padding: '12px 14px', background: 'var(--input-bg)', border: '1px solid var(--panel-border)', borderRadius: '12px', color: 'var(--text-primary)' }}
            value={proposalNameForm.latin}
            onChange={(e) => setProposalNameForm((prev) => ({ ...prev, latin: e.target.value }))}
          />
        </div>
        <div className="lineage-button-row">
          <button type="button" onClick={() => setActiveSuggestionMode(null)} className="lineage-secondary-button" style={{ flex: 1 }}>
            {t('cancel')}
          </button>
          <button type="submit" className="search-button lineage-primary-button" style={{ flex: 2 }}>
            {submitLabel}
          </button>
        </div>
      </div>
    </form>
  );

  const renderChildSuggestionForm = () => (
    <form ref={suggestionFormRef} onSubmit={handleSubmitChildSuggestionForm} className="lineage-modal-form lineage-suggestion-form">
      <h3 className="lineage-section-title">{t('suggestAddChildFor')}{displayName}</h3>
      <div className="lineage-form-stack">
        {childrenInputs.map((childInput, idx) => (
          <div key={idx} className="lineage-child-form-card lineage-suggestion-child-card" style={{ borderBottom: idx < childrenInputs.length - 1 ? '1px dashed var(--panel-border)' : 'none' }}>
            {childrenInputs.length > 1 && (
              <div className="lineage-child-form-header" style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' }}>
                <span>{t('childLabel')} #{idx + 1}</span>
                {idx > 0 && (
                  <button type="button" onClick={() => setChildrenInputs(childrenInputs.filter((_, i) => i !== idx))} style={{ background: 'transparent', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: '12px' }}>
                    {t('deleteBtn')}
                  </button>
                )}
              </div>
            )}
            <div className="lineage-name-input-grid">
              <input
                ref={idx === 0 ? primarySuggestionInputRef : null}
                type="text"
                placeholder={`${t('placeholderArab')} *`}
                className="search-input lineage-name-input"
                style={{ padding: '12px 14px', background: 'var(--input-bg)', border: '1px solid var(--panel-border)', borderRadius: '12px', color: 'var(--text-primary)' }}
                value={childInput.arab}
                onChange={(e) => {
                  const newArr = [...childrenInputs];
                  newArr[idx].arab = e.target.value;
                  setChildrenInputs(newArr);
                }}
                required
              />
              <input
                type="text"
                placeholder={`${t('placeholderLatin')} ${t('optional')}`}
                className="search-input lineage-name-input"
                style={{ padding: '12px 14px', background: 'var(--input-bg)', border: '1px solid var(--panel-border)', borderRadius: '12px', color: 'var(--text-primary)' }}
                value={childInput.latin}
                onChange={(e) => {
                  const newArr = [...childrenInputs];
                  newArr[idx].latin = e.target.value;
                  setChildrenInputs(newArr);
                }}
              />
            </div>
          </div>
        ))}
        <div className="lineage-button-row">
          <button type="button" onClick={() => setChildrenInputs([...childrenInputs, createEmptyChildInput()])} className="lineage-secondary-button lineage-add-child-button" style={{ flex: 2 }}>
            {t('addNewChild')}
          </button>
          <button type="button" onClick={() => setActiveSuggestionMode(null)} className="lineage-secondary-button" style={{ flex: 2 }}>
            {t('cancel')}
          </button>
          <button type="submit" className="search-button lineage-primary-button" style={{ flex: 4 }}>
            {t('saveSuggestion')} ({childrenInputs.length})
          </button>
        </div>
      </div>
    </form>
  );

  const renderMemberClaimForm = () => (
    <form ref={suggestionFormRef} onSubmit={handleSubmitMemberClaimForm} className="lineage-modal-form">
      <h3 className="lineage-section-title">{t('claimFormTitle')}</h3>
      <div className="lineage-form-stack">
        <input
          type="text"
          value={displayNames.arabicName || ''}
          className="search-input"
          style={{ padding: '12px 14px', background: 'var(--input-bg)', border: '1px solid var(--panel-border)', borderRadius: '12px', color: 'var(--text-primary)' }}
          disabled
        />
        <input
          type="text"
          value={displayNames.englishName || ''}
          className="search-input"
          style={{ padding: '12px 14px', background: 'var(--input-bg)', border: '1px solid var(--panel-border)', borderRadius: '12px', color: 'var(--text-primary)' }}
          disabled
        />
        <input
          ref={primarySuggestionInputRef}
          type="email"
          placeholder={`${t('email')} *`}
          className="search-input"
          style={{ padding: '12px 14px', background: 'var(--input-bg)', border: '1px solid var(--panel-border)', borderRadius: '12px', color: 'var(--text-primary)' }}
          value={claimForm.email}
          onChange={(e) => setClaimForm((prev) => ({ ...prev, email: e.target.value }))}
          required
        />
        <input
          type="password"
          placeholder={`${t('password')} *`}
          minLength={6}
          className="search-input"
          style={{ padding: '12px 14px', background: 'var(--input-bg)', border: '1px solid var(--panel-border)', borderRadius: '12px', color: 'var(--text-primary)' }}
          value={claimForm.password}
          onChange={(e) => setClaimForm((prev) => ({ ...prev, password: e.target.value }))}
          required
        />
        <input
          type="text"
          placeholder={`${t('phone')} *`}
          className="search-input"
          style={{ padding: '12px 14px', background: 'var(--input-bg)', border: '1px solid var(--panel-border)', borderRadius: '12px', color: 'var(--text-primary)' }}
          value={claimForm.phone}
          onChange={(e) => setClaimForm((prev) => ({ ...prev, phone: e.target.value }))}
          required
        />
        <select
          className="search-input"
          style={{ padding: '12px 14px', background: 'var(--input-bg)', border: '1px solid var(--panel-border)', borderRadius: '12px', color: 'var(--text-primary)' }}
          value={claimForm.countryCode}
          onChange={(e) => {
            const selected = claimCountryOptions.find((country) => country.code === e.target.value);
            setClaimForm((prev) => ({
              ...prev,
              countryCode: e.target.value,
              country: selected?.label || locationApi?.getCountryLabelFromCode?.(e.target.value, lang, '') || e.target.value,
              regionCode: '',
              region: '',
              city: ''
            }));
          }}
        >
          <option value="">{t('selectCountry')}</option>
          {claimCountryOptions.map((country) => (
            <option key={country.code} value={country.code}>{country.label}</option>
          ))}
        </select>
        <select
          className="search-input"
          style={{ padding: '12px 14px', background: 'var(--input-bg)', border: '1px solid var(--panel-border)', borderRadius: '12px', color: 'var(--text-primary)' }}
          value={claimForm.regionCode}
          onChange={(e) => {
            const selected = claimRegionOptions.find((region) => region.code === e.target.value);
            setClaimForm((prev) => ({
              ...prev,
              regionCode: e.target.value,
              region: selected?.label || '',
              city: ''
            }));
          }}
          disabled={!claimForm.countryCode || claimRegionOptions.length === 0}
        >
          <option value="">{t('selectRegion')}</option>
          {claimRegionOptions.map((region) => (
            <option key={region.code} value={region.code}>{region.label}</option>
          ))}
        </select>
        <select
          className="search-input"
          style={{ padding: '12px 14px', background: 'var(--input-bg)', border: '1px solid var(--panel-border)', borderRadius: '12px', color: 'var(--text-primary)' }}
          value={claimForm.city}
          onChange={(e) => setClaimForm((prev) => ({ ...prev, city: e.target.value }))}
          disabled={!claimForm.countryCode || claimCityOptions.length === 0}
          required
        >
          <option value="">{t('selectCity')}</option>
          {claimCityOptions.map((city) => (
            <option key={city.code} value={city.label}>{city.label}</option>
          ))}
        </select>
        <div className="lineage-button-row">
          <button type="button" onClick={() => setActiveSuggestionMode(null)} className="lineage-secondary-button" style={{ flex: 1 }}>
            {t('cancel')}
          </button>
          <button type="submit" className="search-button lineage-primary-button" style={{ flex: 2 }} disabled={isSaving}>
            {t('claimThisPerson')}
          </button>
        </div>
      </div>
    </form>
  );

  return (
    <div className="modal-overlay lineage-modal-overlay" onClick={onClose} style={{
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(4px)'
    }}>
      <div className="glass-panel lineage-modal-sheet" onClick={(e) => e.stopPropagation()} style={{
        width: 'min(96vw, 760px)', 
        maxWidth: '760px', 
        padding: '24px', 
        position: 'relative',
        maxHeight: '90vh', 
        overflowY: 'auto',
        ...(window.innerWidth <= 768 ? {
          width: '96vw',
          maxWidth: '96vw',
          maxHeight: '84vh',
          borderRadius: '22px',
          margin: '0 auto'
        } : {})
      }}>
        <button className="lineage-modal-close" onClick={onClose} style={{
          position: 'absolute', top: '16px', right: '16px',
          background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '18px'
        }}>✕</button>

        <h2 className="lineage-modal-title" style={{ marginBottom: '16px' }}>{t('modalTitle')}</h2>

        {hasPendingProposal && (
          <div className="lineage-pending-panel" style={{
            marginBottom: '16px',
            padding: '12px 14px',
            borderRadius: '10px',
            border: '1px solid rgba(239, 68, 68, 0.55)',
            background: 'rgba(239, 68, 68, 0.12)',
            color: '#7f1d1d',
            boxShadow: '0 0 18px rgba(239, 68, 68, 0.2)'
          }}>
            <div style={{ fontWeight: 'bold', marginBottom: '6px', color: '#991b1b' }}>{t('pendingAdminVerification')}</div>
            <div style={{ fontSize: '13px' }}>
              {isPendingAddSuggestion ? t('pendingAddChildDescription') : t('pendingNameChangeDescription')}
            </div>
            {canModerateProposals && (
              <>
                <div style={{ fontSize: '13px', marginTop: '10px', lineHeight: '1.5', color: '#7f1d1d' }}>
                  {t('adminVerificationHelp')}
                </div>
                {isAdmin && (
                  <div style={{ fontSize: '12px', marginTop: '8px', lineHeight: '1.5', color: '#991b1b', fontWeight: '600' }}>
                    {t('skipVerificationHelp')}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <div className="lineage-info-strip" style={{ textAlign: 'center', marginBottom: '16px', fontSize: '14px', color: 'var(--text-secondary)', fontStyle: 'italic', background: 'var(--panel-highlight-bg)', padding: '8px', borderRadius: '4px' }}>
          {isEditingInfo ? (
            <input
              autoFocus
              type="text"
              value={editInfoText}
              onChange={(e) => setEditInfoText(e.target.value)}
              placeholder={t('addInfoPlaceholder')}
              onBlur={saveInfo}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveInfo();
              }}
              style={{ width: '100%', background: 'transparent', border: '1px solid var(--accent)', color: 'var(--text-primary)', padding: '4px 8px', outline: 'none', borderRadius: '4px', textAlign: 'center' }}
            />
          ) : (
            <div onClick={() => { if (isAdmin) { setIsEditingInfo(true); setEditInfoText(person.info || ''); } }} style={{ cursor: isAdmin ? 'pointer' : 'default', minHeight: '20px' }} title={isAdmin ? t('editInfoTooltip') : ''}>
              {person.info || t('addInfoPlaceholder')}
            </div>
          )}
        </div>

        <div className="lineage-hero-card" style={{ background: 'var(--panel-highlight-bg)', padding: '16px', borderRadius: '8px', marginBottom: '24px', textAlign: 'center', border: '1px solid var(--panel-border)' }}>
          <div className="lineage-hero-name" style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '10px', lineHeight: '1.4' }}>
            {displayName}
          </div>
          <div className="lineage-hero-arabic" style={{ fontSize: '20px', fontWeight: 'bold', fontFamily: 'serif', color: 'var(--text-primary)', marginBottom: '8px', lineHeight: '1.4' }}>
            {(isMobileDevice && !showFullNasab) ? getShortNasab(person, 'ar', 5) : getFullNasab(person, 'ar', showFullNasab)}
          </div>
          <div className="lineage-hero-latin" style={{ fontSize: '14px', color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: '1.4' }}>
            {(isMobileDevice && !showFullNasab) ? getShortNasab(person, lang !== 'ar' ? lang : 'en', 5) : getFullNasab(person, lang !== 'ar' ? lang : 'en', showFullNasab)}
          </div>
          {getAncestorCount(person) >= 5 && !showFullNasab && (
            <button
              className="lineage-hero-link"
              onClick={() => setShowFullNasab(true)}
              style={{ background: 'transparent', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '13px', marginTop: '16px', fontWeight: 'bold', textDecoration: 'underline' }}
            >
              {t('continueNasab')}
            </button>
          )}
        </div>

        <div style={{ marginBottom: '16px', textAlign: 'center' }}>
          {isNodeComparisonPending && (
            <div style={{ marginBottom: '10px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              <strong>{t('compareNode1Label')}:</strong> {nodeComparisonSourceName || t('compareNode1SelectedShort')}
              <br />
              {isCurrentComparisonSource ? t('compareCancelHint') : t('compareSelectNode2')}
            </div>
          )}
          {!isNodeComparisonPending && (
            <div style={{ marginBottom: '10px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {t('compareVisualOnlyNotice')}
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          <button
            onClick={() => onShowLineageOnly && onShowLineageOnly(person.id)}
            className="lineage-primary-action"
            style={lineageActionStyle}
          >
            <span style={{ fontSize: '16px' }}>🌿</span>
            {t('showLineageOnly')}
          </button>
          {canDownloadAncestorPdf && (
            <button
              onClick={() => onDownloadAncestorPdf && onDownloadAncestorPdf(person.id)}
              style={pdfActionStyle}
            >
              <span style={{ fontSize: '16px' }}>📄</span>
              {t('downloadAncestorPdf')}
            </button>
          )}
          {canShowRelationshipWithMe && (
            <button
              onClick={() => onShowRelationshipWithMe && onShowRelationshipWithMe(person.id)}
              style={memberRelationActionStyle}
            >
              <span style={{ fontSize: '16px' }}>🔗</span>
              {t('showRelationshipWithMe')}
            </button>
          )}
          {(canStartNodeComparison || canCompleteNodeComparison || isCurrentComparisonSource) && (
            <button
              onClick={() => {
                if (isCurrentComparisonSource) {
                  onCancelNodeComparison && onCancelNodeComparison();
                  return;
                }
                if (canCompleteNodeComparison) {
                  onCompleteNodeComparison && onCompleteNodeComparison(person.id);
                  return;
                }
                onStartNodeComparison && onStartNodeComparison(person.id);
              }}
              style={compareActionStyle}
            >
              <span style={{ fontSize: '16px' }}>{isCurrentComparisonSource ? '✕' : '↔'}</span>
              {isCurrentComparisonSource
                ? t('compareCancel')
                : canCompleteNodeComparison
                  ? t('compareNodes')
                  : t('compareNode1Button')}
            </button>
          )}
          </div>
        </div>

        {(!isAdmin && (
          (memberClaimStatus === 'none' && currentRole === 'guest' && activeSuggestionMode !== 'claimMember') ||
          memberClaimStatus === 'pending' ||
          memberClaimStatus === 'approved'
        )) && (
          <div className="glass-panel" style={{ padding: '14px', marginBottom: '20px', border: '1px solid var(--panel-border)' }}>
            {memberClaimStatus === 'none' && currentRole === 'guest' && allowMemberClaim && activeSuggestionMode !== 'claimMember' && (
              <button
                onClick={() => setActiveSuggestionMode('claimMember')}
                className="lineage-primary-button"
                style={{ width: '100%' }}
              >
                {t('claimThisPerson')}
              </button>
            )}
            {memberClaimStatus === 'pending' && (
              <div style={{ color: 'var(--text-secondary)', textAlign: 'center', fontWeight: '600' }}>
                {t('waitingMemberVerification')}
              </div>
            )}
            {memberClaimStatus === 'approved' && (
              <div style={{ color: 'var(--text-secondary)', textAlign: 'center', fontWeight: '600' }}>
                {t('connectedAsMember')}
              </div>
            )}
            {memberClaimStatus === 'none' && currentRole === 'guest' && !allowMemberClaim && activeSuggestionMode !== 'claimMember' && (
              <div style={{ color: 'var(--text-secondary)', textAlign: 'center', fontWeight: '600' }}>
                {currentMemberClaimStatus === 'approved'
                  ? t('alreadyConnectedMember')
                  : currentMemberClaimStatus === 'pending'
                    ? t('alreadyHavePendingClaim')
                    : t('claimThisPerson')}
              </div>
            )}
          </div>
        )}

        {isAdmin && !hasPendingProposal && (
          <div className="lineage-action-card" style={{ background: 'rgba(255,255,255,0.05)', padding: '16px', borderRadius: '8px', marginBottom: '24px' }}>
            <div className="lineage-button-row">
              <button onClick={handleEditCurrentPersonName} className="lineage-primary-button" style={{
                padding: '6px 12px', background: 'var(--accent)', color: '#ffffff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold'
              }}>{t('editPerson')}</button>
              {!personHasDescendants && (
                <button
                  onClick={handleRemoveCurrentPerson}
                  className="lineage-danger-button"
                  style={{
                    padding: '6px 12px',
                    background: '#ef4444',
                    color: '#ffffff',
                    border: 'none', borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '13px', fontWeight: 'bold'
                  }}
                >
                  {t('deletePerson')}
                </button>
              )}
            </div>
          </div>
        )}

        {hasPendingProposal && (
          <div className="lineage-action-card lineage-pending-actions" style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
            <button
              onClick={() => {
                setProposalNameForm({
                  latin: displayNames.englishName || '',
                  arab: displayNames.arabicName || ''
                });
                setActiveSuggestionMode('editPending');
              }}
              className="lineage-secondary-button"
              style={{ flex: 1 }}
            >
              {t('editPendingSuggestion')}
            </button>
            {!isAdmin && (
              <button
                onClick={async () => {
                  if (!window.confirm(t('confirmCancelSuggestion'))) return;
                  await onCancelProposal(person);
                  onClose();
                }}
                className="lineage-danger-button"
                style={{ flex: 1 }}
              >
                {t('cancelSuggestion')}
              </button>
            )}
            {canModerateProposals && (
              <>
                {isAdmin && (
                  <button
                    onClick={() => onSkipPending && onSkipPending(person.id)}
                    className="lineage-neutral-button"
                    style={{ flex: 1 }}
                  >
                    {t('skipVerification')}
                  </button>
                )}
                <button
                  onClick={async () => {
                    await onApproveProposal(person);
                  }}
                  className="lineage-success-button"
                  style={{ flex: 1 }}
                >
                  {t('approveSuggestion')}
                </button>
                {isAdmin && (
                  <button
                    onClick={async () => {
                      if (!window.confirm(t('confirmRejectSuggestion'))) return;
                      await onRejectProposal(person);
                      onClose();
                    }}
                    className="lineage-danger-button"
                    style={{ flex: 1 }}
                  >
                    {t('rejectSuggestion')}
                  </button>
                )}
              </>
            )}
          </div>
        )}

        <div className="lineage-children-section" style={{ marginBottom: '24px' }}>
          <h3 className="lineage-section-title" style={{ fontSize: '16px', marginBottom: '12px' }}>{t('childrenOf')}{displayName}</h3>
          {children.length === 0 ? (
            <div className="lineage-empty-state" style={{ color: 'var(--text-secondary)', fontSize: '14px', fontStyle: 'italic' }}>{t('noChildren')}</div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {children.map((c) => (
                <li key={c.id} className="lineage-child-item" style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 12px', background: 'var(--panel-highlight-bg)',
                  marginBottom: '8px', borderRadius: '8px', border: c?.moderation?.status === 'pending' ? '1px solid rgba(239, 68, 68, 0.55)' : '1px solid var(--panel-border)'
                }}>
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: '16px', color: 'var(--text-primary)' }}>{c?.moderation?.nameChange?.status === 'pending' ? (c.moderation.nameChange.proposedArabicName || c.arabicName) : c.arabicName}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{getChildName(c)}</div>
                    {c?.moderation?.status === 'pending' && (
                      <div style={{ fontSize: '11px', color: '#dc2626', fontWeight: 'bold', marginTop: '4px' }}>{t('pendingAdminVerification')}</div>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      className="lineage-view-button"
                      onClick={() => onViewPerson && onViewPerson(c.id)}
                      style={{
                        background: 'var(--accent)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '6px 12px',
                        fontSize: '12px',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        transition: 'background 0.2s'
                      }}
                      onMouseEnter={(e) => { e.target.style.background = 'var(--accent-hover)'; }}
                      onMouseLeave={(e) => { e.target.style.background = 'var(--accent)'; }}
                    >
                      {t('view')}
                    </button>
                    {c?.moderation?.status === 'pending' && canEditPendingChildFromList && (
                      <>
                        <button
                          type="button"
                          onClick={() => onViewPerson && onViewPerson(c.id)}
                          title={t('editPendingSuggestion')}
                          aria-label={t('editPendingSuggestion')}
                          style={{ background: 'transparent', border: 'none', color: 'var(--accent)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!window.confirm(t('confirmCancelSuggestion'))) return;
                            await onCancelProposal(c);
                          }}
                          title={t('cancelSuggestion')}
                          aria-label={t('cancelSuggestion')}
                          style={{ background: 'transparent', border: 'none', color: '#dc2626', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {activeSuggestionMode === 'suggestChild' && renderChildSuggestionForm()}
        {activeSuggestionMode === 'suggestName' && renderNameForm(t('suggestNameChange'), handleSubmitNameSuggestionForm, t('saveSuggestion'))}
        {activeSuggestionMode === 'editPending' && renderNameForm(t('editPendingSuggestion'), handleSavePendingProposal, t('saveSuggestionChanges'))}
        {activeSuggestionMode === 'adminEdit' && renderNameForm(t('editPerson'), handleSaveAdminEdit, t('save'))}
        {activeSuggestionMode === 'claimMember' && renderMemberClaimForm()}

        {!isAdmin && !hasPendingProposal && activeSuggestionMode === null && (
          <div className="lineage-action-card lineage-suggestion-action-row" style={{ borderTop: '1px solid var(--panel-border)', paddingTop: '20px' }}>
            <button
              onClick={() => {
                setChildrenInputs([createEmptyChildInput()]);
                setActiveSuggestionMode('suggestChild');
              }}
              className="lineage-danger-button"
              style={{ flex: 1 }}
            >
              {t('suggestAddChild')}
            </button>
            <button
              onClick={() => {
                setProposalNameForm({
                  latin: displayNames.englishName || '',
                  arab: displayNames.arabicName || ''
                });
                setActiveSuggestionMode('suggestName');
              }}
              className="lineage-danger-button"
              style={{ flex: 1 }}
            >
              {t('suggestNameChange')}
            </button>
          </div>
        )}

        {isAdmin && !hasPendingProposal && (
          <form onSubmit={handleAdd} className="lineage-modal-form" style={{ marginTop: '20px' }}>
            <h3 className="lineage-section-title" style={{ fontSize: '16px', marginBottom: '12px' }}>{t('addChildTitle')}{displayName}</h3>
            <div className="lineage-form-stack">
              {childrenInputs.map((childInput, idx) => (
                <div key={idx} className="lineage-child-form-card" style={{ borderBottom: idx < childrenInputs.length - 1 ? '1px dashed var(--panel-border)' : 'none' }}>
                  {childrenInputs.length > 1 && (
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' }}>
                      <span>{t('childLabel')} #{idx + 1}</span>
                      {idx > 0 && (
                        <button type="button" onClick={() => setChildrenInputs(childrenInputs.filter((_, i) => i !== idx))} style={{ background: 'transparent', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: '12px' }}>{t('deleteBtn')}</button>
                      )}
                    </div>
                  )}
                  <input
                    type="text"
                    placeholder={`${t('placeholderArab')} *`}
                    className="search-input"
                    style={{ padding: '12px 14px', background: 'var(--input-bg)', border: '1px solid var(--panel-border)', borderRadius: '12px', color: 'var(--text-primary)' }}
                    value={childInput.arab}
                    onChange={(e) => {
                      const newArr = [...childrenInputs];
                      newArr[idx].arab = e.target.value;
                      setChildrenInputs(newArr);
                    }}
                    required
                  />
                  <input
                    type="text"
                    placeholder={`${t('placeholderLatin')} ${t('optional')}`}
                    className="search-input"
                    style={{ padding: '12px 14px', background: 'var(--input-bg)', border: '1px solid var(--panel-border)', borderRadius: '12px', color: 'var(--text-primary)' }}
                    value={childInput.latin}
                    onChange={(e) => {
                      const newArr = [...childrenInputs];
                      newArr[idx].latin = e.target.value;
                      setChildrenInputs(newArr);
                    }}
                  />
                </div>
              ))}
              <div className="lineage-button-row">
                <button type="button" onClick={() => setChildrenInputs([...childrenInputs, createEmptyChildInput()])} className="lineage-secondary-button" style={{ flex: '1' }}>
                  +
                </button>
                <button type="submit" className="search-button lineage-primary-button" style={{ flex: '4' }}>
                  {t('saveChild')} ({childrenInputs.length})
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default NodeEditModal;
