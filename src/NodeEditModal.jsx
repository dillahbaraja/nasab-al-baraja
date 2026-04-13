import React, { useState, useEffect, useMemo, useRef } from 'react';

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
  isAdmin
}) => {
  const person = initialPerson ? (familyData.find((p) => p.id === initialPerson.id) || initialPerson) : null;
  const [childrenInputs, setChildrenInputs] = useState([createEmptyChildInput()]);
  const [showFullNasab, setShowFullNasab] = useState(false);
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [editInfoText, setEditInfoText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [activeSuggestionMode, setActiveSuggestionMode] = useState(null);
  const [proposalNameForm, setProposalNameForm] = useState({ latin: '', arab: '' });
  const suggestionFormRef = useRef(null);
  const primarySuggestionInputRef = useRef(null);

  const pendingNameChange = person?.moderation?.nameChange?.status === 'pending'
    ? person.moderation.nameChange
    : null;
  const isPendingAddSuggestion = person?.moderation?.status === 'pending' && person?.moderation?.type === 'add_child';
  const hasPendingProposal = Boolean(isPendingAddSuggestion || pendingNameChange);

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
  }, [person, displayNames]);

  useEffect(() => {
    if (!activeSuggestionMode) return;

    const timer = setTimeout(() => {
      suggestionFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      if (primarySuggestionInputRef.current) {
        primarySuggestionInputRef.current.focus();
        primarySuggestionInputRef.current.select();
      }
    }, 60);

    return () => clearTimeout(timer);
  }, [activeSuggestionMode]);

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
      current = familyData.find((p) => p.id === current.fatherId);
      count++;
    }
    return nasab.join(language === 'ar' ? ' بن ' : ' bin ');
  };

  const getAncestorCount = (targetPerson) => {
    let current = familyData.find((p) => p.id === targetPerson.fatherId);
    let count = 0;
    while (current && count < 50) {
      count++;
      current = familyData.find((p) => p.id === current.fatherId);
    }
    return count;
  };

  const children = familyData.filter((p) => p.fatherId === person.id);
  const personHasDescendants = children.length > 0;

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
    <form ref={suggestionFormRef} onSubmit={onSubmit} className="lineage-modal-form">
      <h3 className="lineage-section-title">
        {title}
      </h3>
      <div className="lineage-form-stack">
        <input
          ref={primarySuggestionInputRef}
          type="text"
          placeholder={`${t('placeholderArab')} *`}
          className="search-input"
          style={{ padding: '12px 14px', background: 'var(--input-bg)', border: '1px solid var(--panel-border)', borderRadius: '12px', color: 'var(--text-primary)' }}
          value={proposalNameForm.arab}
          onChange={(e) => setProposalNameForm((prev) => ({ ...prev, arab: e.target.value }))}
          required
        />
        <input
          type="text"
          placeholder={`${t('placeholderLatin')} ${t('optional')}`}
          className="search-input"
          style={{ padding: '12px 14px', background: 'var(--input-bg)', border: '1px solid var(--panel-border)', borderRadius: '12px', color: 'var(--text-primary)' }}
          value={proposalNameForm.latin}
          onChange={(e) => setProposalNameForm((prev) => ({ ...prev, latin: e.target.value }))}
        />
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
    <form ref={suggestionFormRef} onSubmit={handleSubmitChildSuggestionForm} className="lineage-modal-form">
      <h3 className="lineage-section-title">{t('suggestAddChildFor')}{displayName}</h3>
      <div className="lineage-form-stack">
        {childrenInputs.map((childInput, idx) => (
          <div key={idx} className="lineage-child-form-card" style={{ borderBottom: idx < childrenInputs.length - 1 ? '1px dashed var(--panel-border)' : 'none' }}>
            {childrenInputs.length > 1 && (
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' }}>
                <span>{t('childLabel')} #{idx + 1}</span>
                {idx > 0 && (
                  <button type="button" onClick={() => setChildrenInputs(childrenInputs.filter((_, i) => i !== idx))} style={{ background: 'transparent', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: '12px' }}>
                    {t('deleteBtn')}
                  </button>
                )}
              </div>
            )}
            <input
              ref={idx === 0 ? primarySuggestionInputRef : null}
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
          <button type="button" onClick={() => setChildrenInputs([...childrenInputs, createEmptyChildInput()])} className="lineage-secondary-button" style={{ flex: 1 }}>
            +
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

  return (
    <div className="modal-overlay lineage-modal-overlay" onClick={onClose} style={{
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(4px)'
    }}>
      <div className="glass-panel lineage-modal-sheet" onClick={(e) => e.stopPropagation()} style={{
        width: '90%', maxWidth: '600px', padding: '24px', position: 'relative',
        maxHeight: '85vh', overflowY: 'auto'
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
            {isAdmin && (
              <>
                <div style={{ fontSize: '13px', marginTop: '10px', lineHeight: '1.5', color: '#7f1d1d' }}>
                  {t('adminVerificationHelp')}
                </div>
                <div style={{ fontSize: '12px', marginTop: '8px', lineHeight: '1.5', color: '#991b1b', fontWeight: '600' }}>
                  {t('skipVerificationHelp')}
                </div>
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
          <div className="lineage-hero-arabic" style={{ fontSize: '24px', fontWeight: 'bold', fontFamily: 'serif', color: 'var(--text-primary)', marginBottom: '8px', lineHeight: '1.4' }}>
            {getFullNasab(person, 'ar', showFullNasab)}
          </div>
          <div className="lineage-hero-latin" style={{ fontSize: '16px', color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: '1.4' }}>
            {getFullNasab(person, lang !== 'ar' ? lang : 'en', showFullNasab)}
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
          <button
            onClick={() => onShowLineageOnly && onShowLineageOnly(person.id)}
            className="lineage-primary-action"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-hover, #7c3aed) 100%)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 'bold',
              letterSpacing: '0.01em',
              boxShadow: '0 2px 12px rgba(0,0,0,0.18)',
              transition: 'all 0.18s ease',
              width: '100%',
              justifyContent: 'center'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.88'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            <span style={{ fontSize: '16px' }}>🌿</span>
            {t('showLineageOnly')}
          </button>
        </div>

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
            {isAdmin && (
              <>
                <button
                  onClick={() => onSkipPending && onSkipPending(person.id)}
                  className="lineage-neutral-button"
                  style={{ flex: 1 }}
                >
                  {t('skipVerification')}
                </button>
                <button
                  onClick={async () => {
                    await onApproveProposal(person);
                  }}
                  className="lineage-success-button"
                  style={{ flex: 1 }}
                >
                  {t('approveSuggestion')}
                </button>
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
                </li>
              ))}
            </ul>
          )}
        </div>

        {activeSuggestionMode === 'suggestChild' && renderChildSuggestionForm()}
        {activeSuggestionMode === 'suggestName' && renderNameForm(t('suggestNameChange'), handleSubmitNameSuggestionForm, t('saveSuggestion'))}
        {activeSuggestionMode === 'editPending' && renderNameForm(t('editPendingSuggestion'), handleSavePendingProposal, t('saveSuggestionChanges'))}
        {activeSuggestionMode === 'adminEdit' && renderNameForm(t('editPerson'), handleSaveAdminEdit, t('save'))}

        {!isAdmin && !hasPendingProposal && activeSuggestionMode === null && (
          <div className="lineage-action-card" style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid var(--panel-border)', paddingTop: '20px' }}>
            <button
              onClick={() => {
                setChildrenInputs([createEmptyChildInput()]);
                setActiveSuggestionMode('suggestChild');
              }}
              className="lineage-danger-button"
              style={{ width: '100%' }}
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
              style={{ width: '100%' }}
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
