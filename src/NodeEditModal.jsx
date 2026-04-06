import React, { useState, useEffect } from 'react';

const NodeEditModal = ({ 
  isOpen, 
  onClose, 
  person: initialPerson, 
  familyData, 
  onAddChild, 
  onUpdateChild, 
  onRemoveChild,
  lang,
  t,
  currentUser
}) => {
  const person = initialPerson ? (familyData.find(p => p.id === initialPerson.id) || initialPerson) : null;
  const [childrenInputs, setChildrenInputs] = useState([{ latin: '', arab: '' }]);
  const [showFullNasab, setShowFullNasab] = useState(false);
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [editInfoText, setEditInfoText] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setShowFullNasab(false);
    setIsEditingInfo(false);
    setIsSaving(false);
    setChildrenInputs([{ latin: '', arab: '' }]);
  }, [person]);

  if (!isOpen || !person) return null;

  const displayName = lang === 'ar' ? person.arabicName : person.englishName;
  const getChildName = (c) => lang === 'ar' ? c.arabicName : c.englishName;

  // Helper function to build lineage string
  const getFullNasab = (targetPerson, language, showAll = false) => {
    let nasab = [];
    let current = targetPerson;
    let count = 0; 
    while (current && count < 50 && (showAll || count <= 5)) {
      nasab.push(language === 'ar' ? current.arabicName : current.englishName);
      current = familyData.find(p => p.id === current.fatherId);
      count++;
    }
    return nasab.join(language === 'ar' ? ' بن ' : ' bin ');
  };

  const getAncestorCount = (targetPerson) => {
    let current = familyData.find(p => p.id === targetPerson.fatherId);
    let count = 0;
    while(current && count < 50) {
      count++;
      current = familyData.find(p => p.id === current.fatherId);
    }
    return count;
  };

  // Find direct children (patrilineal)
  const children = familyData.filter(p => p.fatherId === person.id);
  const personHasDescendants = children.length > 0;

  const handleAdd = async (e) => {
    e.preventDefault();
    const validChildren = childrenInputs.filter(c => c.arab.trim() !== '');
    if (validChildren.length === 0 || isSaving) return;
    
    setIsSaving(true);
    try {
      const payload = validChildren.map(c => ({
        englishName: c.latin,
        arabicName: c.arab
      }));
      await onAddChild(person, payload);
      setChildrenInputs([{ latin: '', arab: '' }]);
      onClose(); // Auto-close on success
    } catch (err) {
      console.error("Save Error:", err);
    } finally {
      setIsSaving(false);
    }
  };

  // HANDLERS FOR THE CURRENTLY SELECTED PERSON
  const handleRemoveCurrentPerson = () => {
    if (personHasDescendants) {
      alert(`${t('cannotDeleteTarget')}${displayName}. ${t('alertConfirmMulti')}`);
      return;
    }
    if (window.confirm(`${t('alertDeleteTarget')}${displayName}?`)) {
      onRemoveChild(person.id);
      onClose();
    }
  };

  const handleEditCurrentPersonName = () => {
    const arab = window.prompt(t('updateArab'), person.arabicName || '');
    if (!arab) return;
    const latin = window.prompt(`${t('updateLatin')} ${t('skipLabel')}`, person.englishName || '');
    const finalLatin = latin === null ? person.englishName : latin;
    onUpdateChild(person.id, { englishName: finalLatin, arabicName: arab });
  };

  // HANDLERS FOR THE CHILDREN (FROM THE LIST)
  const handleRemoveChildItem = (child) => {
    const hasDescendants = familyData.some(p => p.fatherId === child.id);
    if (hasDescendants) {
      alert(`${t('cannotDeleteTarget')}${getChildName(child)}. ${t('alertConfirmMulti')}`);
      return;
    }
    if (window.confirm(`${t('alertDeleteTarget')}${getChildName(child)}?`)) {
      onRemoveChild(child.id);
    }
  };

  const handleEditChildNameItem = (child) => {
    const arab = window.prompt(t('updateArab'), child.arabicName || '');
    if (!arab) return;
    const latin = window.prompt(`${t('updateLatin')} ${t('skipLabel')}`, child.englishName || '');
    const finalLatin = latin === null ? child.englishName : latin;
    onUpdateChild(child.id, { englishName: finalLatin, arabicName: arab });
  };

  const saveInfo = () => {
    setIsEditingInfo(false);
    const currentInfo = person.info || '';
    const newInfo = editInfoText.trim();
    if (newInfo !== currentInfo) {
      onUpdateChild(person.id, { info: newInfo });
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(4px)'
    }}>
      <div className="glass-panel" onClick={(e) => e.stopPropagation()} style={{
        width: '90%', maxWidth: '600px', padding: '24px', position: 'relative',
        maxHeight: '85vh', overflowY: 'auto'
      }}>
        <button onClick={onClose} style={{
          position: 'absolute', top: '16px', right: '16px', 
          background: 'none', border: 'none', color: '#ffffff', cursor: 'pointer', fontSize: '18px'
        }}>✕</button>
        
        <h2 style={{ marginBottom: '16px' }}>{t('modalTitle')}</h2>

        {/* INFO DISPLAY */}
        <div style={{ textAlign: 'center', marginBottom: '16px', fontSize: '14px', color: 'var(--text-secondary)', fontStyle: 'italic', background: 'var(--panel-highlight-bg)', padding: '8px', borderRadius: '4px' }}>
          {isEditingInfo ? (
            <input 
              autoFocus
              type="text" 
              value={editInfoText}
              onChange={e => setEditInfoText(e.target.value)}
              placeholder={t('addInfoPlaceholder')}
              onBlur={saveInfo}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveInfo();
              }}
              style={{ width: '100%', background: 'transparent', border: '1px solid var(--accent)', color: 'var(--text-primary)', padding: '4px 8px', outline: 'none', borderRadius: '4px', textAlign: 'center' }}
            />
          ) : (
            <div onClick={() => { setIsEditingInfo(true); setEditInfoText(person.info || ''); }} style={{ cursor: 'pointer', minHeight: '20px' }} title={t('editInfoTooltip')}>
              {person.info || t('addInfoPlaceholder')}
            </div>
          )}
        </div>
        
        {/* NASAB (LINEAGE) DISPLAY */}
        <div style={{ background: 'var(--panel-highlight-bg)', padding: '16px', borderRadius: '8px', marginBottom: '24px', textAlign: 'center', border: '1px solid var(--panel-border)' }}>
          <div style={{ fontSize: '24px', fontWeight: 'bold', fontFamily: 'serif', color: 'var(--text-primary)', marginBottom: '8px', lineHeight: '1.4' }}>
            {getFullNasab(person, 'ar', showFullNasab)}
          </div>
          <div style={{ fontSize: '16px', color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: '1.4' }}>
            {getFullNasab(person, lang !== 'ar' ? lang : 'en', showFullNasab)}
          </div>
          {getAncestorCount(person) >= 5 && !showFullNasab && (
            <button 
              onClick={() => setShowFullNasab(true)} 
              style={{ background: 'transparent', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '13px', marginTop: '16px', fontWeight: 'bold', textDecoration: 'underline' }}
            >
              {t('continueNasab')}
            </button>
          )}
        </div>

        {/* CURRENT PERSON ACTIONS - ONLY FOR ADMIN */}
        {currentUser && (
          <div style={{ background: 'rgba(255,255,255,0.05)', padding: '16px', borderRadius: '8px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={handleEditCurrentPersonName} style={{
                padding: '6px 12px', background: 'var(--accent)', color: '#ffffff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold'
              }}>{t('editPerson')}</button>
              <button 
                onClick={handleRemoveCurrentPerson} 
                style={{
                  padding: '6px 12px', 
                  background: personHasDescendants ? 'var(--btn-secondary-bg)' : '#ef4444', 
                  color: personHasDescendants ? 'var(--text-secondary)' : '#ffffff', 
                  border: 'none', borderRadius: '4px', 
                  cursor: personHasDescendants ? 'not-allowed' : 'pointer', 
                  fontSize: '13px', fontWeight: 'bold'
                }}
              >
                {t('deletePerson')}
              </button>
            </div>
            {personHasDescendants && (
              <div style={{ fontSize: '11px', color: '#ef4444', marginTop: '6px', fontWeight: '500' }}>
                {t('cannotDelete')}
              </div>
            )}
          </div>
        )}

        {/* CHILDREN LIST */}
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>{t('childrenOf')}{displayName}</h3>
          {children.length === 0 ? (
            <div style={{ color: 'var(--text-secondary)', fontSize: '14px', fontStyle: 'italic' }}>{t('noChildren')}</div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {children.map(c => (
                <li key={c.id} style={{ 
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                  padding: '10px 12px', background: 'var(--panel-highlight-bg)', 
                  marginBottom: '8px', borderRadius: '8px', border: '1px solid var(--panel-border)'
                }}>
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: '16px', color: 'var(--text-primary)' }}>{c.arabicName}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{c.englishName}</div>
                  </div>
                  {currentUser && (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => handleEditChildNameItem(c)} style={{
                        padding: '6px 10px', background: 'var(--btn-secondary-bg)', color: 'var(--btn-secondary-text)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: '500'
                      }}>{t('editBtn')}</button>
                      <button onClick={() => handleRemoveChildItem(c)} style={{
                        padding: '6px 10px', background: '#ef4444', color: '#ffffff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: '500'
                      }}>{t('deleteBtn')}</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ADD CHILD FORM - ONLY FOR ADMIN */}
        {currentUser && (
          <form onSubmit={handleAdd} style={{ borderTop: '1px solid var(--panel-border)', paddingTop: '20px' }}>
            <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>{t('addChildTitle')}{displayName}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {childrenInputs.map((childInput, idx) => (
                <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingBottom: '12px', borderBottom: idx < childrenInputs.length - 1 ? '1px dashed var(--panel-border)' : 'none' }}>
                  {childrenInputs.length > 1 && (
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Anak #{idx + 1}</span>
                      {idx > 0 && (
                        <button type="button" onClick={() => setChildrenInputs(childrenInputs.filter((_, i) => i !== idx))} style={{ background: 'transparent', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: '12px' }}>Hapus</button>
                      )}
                    </div>
                  )}
                  <input
                    type="text"
                    placeholder={`${t('placeholderArab')} *`}
                    className="search-input"
                    style={{ padding: '10px 12px', background: 'var(--input-bg)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-primary)' }}
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
                    style={{ padding: '10px 12px', background: 'var(--input-bg)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-primary)' }}
                    value={childInput.latin}
                    onChange={(e) => {
                      const newArr = [...childrenInputs];
                      newArr[idx].latin = e.target.value;
                      setChildrenInputs(newArr);
                    }}
                  />
                </div>
              ))}
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <button type="button" onClick={() => setChildrenInputs([...childrenInputs, { latin: '', arab: '' }])} style={{ padding: '12px', background: 'var(--btn-secondary-bg)', color: 'var(--text-primary)', border: '1px solid var(--panel-border)', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', flex: '1' }}>
                  +
                </button>
                <button type="submit" className="search-button" style={{ padding: '12px', fontSize: '15px', fontWeight: 'bold', flex: '4' }}>
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
