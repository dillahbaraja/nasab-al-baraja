import React, { useState } from 'react';
import { X, Shield, Info, Bell, UserPlus, Edit, Trash2, Key, MapPin, Phone, Mail, User } from 'lucide-react';

const InfoModal = ({ 
  isOpen, 
  onClose, 
  title, 
  type, 
  t, 
  lang, 
  onSignIn, 
  onSignOut,
  currentUser,
  notices = [],
  onViewNotice,
  onDeleteNotice
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
              {lang === 'id' ? 'Aplikasi ini dirancang untuk mendokumentasikan dan memvisualisasikan silsilah keluarga Al-Baraja secara digital dan interaktif.' : 
               lang === 'ar' ? 'تم تصميم هذا التطبيق لتوثيق وتصور نسب عائلة بارجاء رقمياً وتفاعلياً.' :
               'This application is designed to document and visualize the Al-Baraja family lineage digitally and interactively.'}
            </p>
            <p>
              {lang === 'id' ? 'Gunakan fitur pencarian untuk menemukan anggota keluarga dan klik dua kali (tekan lama di mobile) untuk melihat detail.' :
               lang === 'ar' ? 'استخدم ميزة البحث للعثور على أفراد العائلة وانقر مرتين (أو اضغط مطولاً على الجوال) لعرض التفاصيل.' :
               'Use the search feature to find family members and double-click (long-press on mobile) to view details.'}
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
                  <p>{lang === 'id' ? 'Belum ada penambahan data keluarga baru saat ini.' : lang === 'ar' ? 'لا توجد إضافات جديدة لبيانات العائلة حالياً.' : 'No new family data additions at this time.'}</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {notices.map((n, idx) => (
                    <div key={n.id || idx} className="glass-panel" style={{ padding: '12px 16px', borderLeft: '4px solid var(--accent)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ flex: 1 }}>
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
                          {lang === 'id' ? 'Lihat' : lang === 'ar' ? 'عرض' : 'View'}
                        </button>
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
                      </div>
                    </div>
                  ))}
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
              {lang === 'id' ? 'Silakan masuk untuk mengakses fitur manajemen data.' : 
               lang === 'ar' ? 'يرجى تسجيل الدخول للوصول إلى ميزات إدارة البيانات.' : 
               'Please sign in to access data management features.'}
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
              <input type="email" name="email" placeholder="Email" className="login-input" value={formData.email} onChange={handleInputChange} required />
              <input type="password" name="password" placeholder="Password" className="login-input" value={formData.password} onChange={handleInputChange} required />
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
