import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  applyNodeChanges,
  applyEdgeChanges,
  useReactFlow
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Search, Palette, Database, Bell } from 'lucide-react';
import FamilyNode from './FamilyNode';
import { initialFamilyData, generateEdges } from './data';
import { getLayoutedElements, createNodesFromData } from './layout';
import NodeEditModal from './NodeEditModal';
import { db, auth } from './firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, updatePassword } from 'firebase/auth';
import { translations } from './i18n';
import MobileHeader from './components/MobileHeader';
import WebsiteHeader from './components/WebsiteHeader';
import InfoModal from './components/InfoModals';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';

const nodeTypes = { customNode: FamilyNode };

const TimeoutWarning = () => {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShow(true), 5000);
    return () => clearTimeout(timer);
  }, []);

  const handleReset = async () => {
    localStorage.clear();
    sessionStorage.clear();
    // Attempt to clear Firebase databases specifically that might be deadlocked
    try {
      const dbs = await window.indexedDB.databases();
      for (let i = 0; i < dbs.length; i++) {
        window.indexedDB.deleteDatabase(dbs[i].name);
      }
    } catch(e) {
      // Fallback if indexedDB.databases is not supported (Firefox/Safari old)
      window.indexedDB.deleteDatabase('firebaseLocalStorageDb');
      window.indexedDB.deleteDatabase('firebase-heartbeat-database');
    }
    window.location.reload(true);
  };

  if (!show) return null;
  return (
    <div style={{ textAlign: 'center', marginTop: '16px', padding: '16px', background: 'var(--panel-bg)', borderRadius: '8px', border: '1px solid var(--panel-border)' }}>
      <p style={{ marginBottom: '12px', fontSize: '14px', color: 'var(--text-secondary)' }}>
        Koneksi bermasalah atau data lokal korup?
      </p>
      <button onClick={handleReset} style={{ background: 'var(--accent)', color: '#fff', padding: '8px 16px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>
        Reset Cache & Muat Ulang
      </button>
    </div>
  );
};

const FamilyGraph = () => {
  const [theme, setTheme] = useState(() => localStorage.getItem('rf-theme') || 'light');
  const [lang, setLang] = useState(() => localStorage.getItem('rf-lang') || 'ar');
  const [familyData, setFamilyData] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const { setCenter, fitView, setViewport } = useReactFlow();

  const t = (key) => translations[key]?.[lang] || translations[key]?.['en'] || key;

  const [selectedPerson, setSelectedPerson] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [lastSearchQuery, setLastSearchQuery] = useState('');
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [admins, setAdmins] = useState([]);
  const [editAdminData, setEditAdminData] = useState(null);
  const [notices, setNotices] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [lastNoticeOpen, setLastNoticeOpen] = useState(() => Number(localStorage.getItem('rf-last-notice-open')) || 0);
  const [toast, setToast] = useState(null);
  const toastTimeoutRef = useRef(null);
  
  // Info Modals State
  const [activeInfoModal, setActiveInfoModal] = useState(null); // 'signin', 'about', 'notice', 'adminManager', 'adminForm', 'changePassword'

  // Apply Theme Toggle
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('rf-theme', theme);

    // Sync Status Bar on Android
    if (Capacitor.getPlatform() === 'android') {
      const updateStatusBar = async () => {
        try {
          await StatusBar.setStyle({
            style: theme === 'dark' ? Style.Dark : Style.Light
          });
        } catch(e) { console.warn("StatusBar error:", e); }
      };
      updateStatusBar();
    }
  }, [theme]);

  const toggleTheme = () => {
    const modes = ['dark', 'light', 'warm'];
    setTheme(prev => {
      const nextIndex = (modes.indexOf(prev) + 1) % modes.length;
      return modes[nextIndex];
    });
  };

  useEffect(() => {
    localStorage.setItem('rf-lang', lang);
  }, [lang]);

  const toggleLang = () => {
    const langs = ['id', 'en', 'ar'];
    setLang(prev => {
      const nextIndex = (langs.indexOf(prev) + 1) % langs.length;
      return langs[nextIndex];
    });
  };

  // Auth Listener
  useEffect(() => {
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsub();
  }, []);

  // 1. Family Nodes & Admins Listener (Persist during session)
  useEffect(() => {
    if (!db) return;

    const unsubFamily = onSnapshot(collection(db, 'familyNodes'), (snapshot) => {
      const dbData = snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
      console.log("Family Data Update:", dbData.length, "nodes");
      setFamilyData(dbData);
      setIsLoading(false);
    }, (err) => {
      console.error("Family Snapshot Error:", err);
      setIsLoading(false);
    });

    const unsubAdmins = onSnapshot(collection(db, 'admins'), (snapshot) => {
      setAdmins(snapshot.docs.map(d => ({ ...d.data(), id: d.id })));
    }, (err) => {
      console.error("Admins Snapshot Error:", err);
    });

    return () => {
      unsubFamily();
      unsubAdmins();
    };
  }, [db]); // Only on mount/db change

  // 2. Notices Listener (Pure data sync)
  useEffect(() => {
    if (!db) return;

    const unsubNotices = onSnapshot(collection(db, 'notices'), (snapshot) => {
      const noticeList = snapshot.docs
        .map(d => ({ ...d.data(), id: d.id }))
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      
      setNotices(noticeList);
      
      // Trigger toast for the newest notice if it's very fresh (last 15 seconds)
      const newest = noticeList[0];
      if (newest && Date.now() - (newest.timestamp || 0) < 15000) {
        if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
        setToast(newest);
        toastTimeoutRef.current = setTimeout(() => {
          setToast(null);
          toastTimeoutRef.current = null;
        }, 8000);
      }
    }, (err) => {
      console.error("Notices Snapshot Error:", err);
    });

    return () => {
      unsubNotices();
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, [db]); 

  // 3. Reactive Unread Count Calculation
  useEffect(() => {
    const unread = notices.filter(n => (n.timestamp || 0) > lastNoticeOpen).length;
    console.log("Updating Unread Count:", unread);
    setUnreadCount(unread);
  }, [notices, lastNoticeOpen]);

  // Super Admin Seeder
  useEffect(() => {
    if (!db || admins.length === 0) return;
    const superEmail = 'dillahbaraja@gmail.com';
    const hasSuperAdmin = admins.some(a => a.email === superEmail);
    if (!hasSuperAdmin) {
      const seedSuper = async () => {
        try {
          // Use fixed ID to prevent multiple docs during sync lag
          await setDoc(doc(db, 'admins', 'admin_root'), {
            englishName: 'Abdillah',
            arabicName: 'Abdillah',
            email: superEmail,
            phone: '-',
            cityCountry: 'Solo'
          });
        } catch(e) { console.error("Super Admin Seed Error:", e); }
      };
      seedSuper();
    }
  }, [db, admins]);

  // Update layout diagram on data change
  useEffect(() => {
    if (familyData.length === 0) {
      if (!isLoading) {
        // Stickiness: Don't clear nodes if they already exist, to prevent "disappearing" on sync gaps
        if (nodes.length > 0) {
          console.warn("Ignoring empty dataset to prevent vanishing nodes.");
          return;
        }
        setNodes([]);
        setEdges([]);
      }
      return;
    }

    try {
      const rawNodes = createNodesFromData(familyData);
      const rawEdges = generateEdges(familyData);
      
      // Perform layout calculation
      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(rawNodes, rawEdges, 'TB');
      
      const nodesWithHandler = layoutedNodes.map(n => ({
        ...n,
        data: {
          ...n.data,
          onLongPress: (nodeId, rawData) => {
            setSelectedPerson(rawData);
            setIsModalOpen(true);
          }
        }
      }));
      
      setNodes([...nodesWithHandler]);
      setEdges([...layoutedEdges]);
    } catch (err) {
      console.error("Layout Rendering Crash Prevented:", err);
      // Fallback: If layout fails, just show raw nodes in a grid or stay as is
    }
  }, [familyData, isLoading]);

  const [initialViewport] = useState(() => {
    try {
      const saved = localStorage.getItem('rf-viewport');
      if (saved && saved !== "undefined" && saved !== "null") {
        const vp = JSON.parse(saved);
        if (vp && typeof vp.x === 'number' && !isNaN(vp.x) && typeof vp.zoom === 'number') {
          return vp;
        }
      }
    } catch (e) {
      console.error("Viewport parse error:", e);
    }
    return null;
  });

  const onNodesChange = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );
  const onEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  const handleMoveEnd = useCallback((_, viewport) => {
    if (viewport && typeof viewport.x === 'number' && !isNaN(viewport.x)) {
      localStorage.setItem('rf-viewport', JSON.stringify(viewport));
    }
  }, []);

  const normalizeArabic = (text) => {
    return text.normalize("NFD").replace(/[\u064B-\u065F\u0670]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ي$/g, "ى").toLowerCase();
  };

  const cleanText = (text) => {
    return text.replace(/\b(bin|ben|binti)\b/gi, '').replace(/بن/g, '').replace(/\s+/g, '').trim();
  };

  const getNasabDesc = (person) => {
    let parts = [];
    let current = familyData.find(p => p.id === person.fatherId);
    let count = 0;
    while(current && count < 2) {
      parts.push(lang === 'ar' ? current.arabicName : current.englishName);
      current = familyData.find(p => p.id === current.fatherId);
      count++;
    }
    if (parts.length === 0) return '';
    return lang === 'ar' ? ` بن ${parts.join(' بن ')}` : ` bin ${parts.join(' bin ')}`;
  };

  const handleQueryChange = (e) => {
    const val = e.target.value;
    setSearchQuery(val);
    
    if (val.trim() === '') {
      setShowSuggestions(false);
      return;
    }

    if (val.length >= 3) {
      const queryLatin = cleanText(val.toLowerCase());
      const queryArab = cleanText(normalizeArabic(val));
      
      const suggestions = familyData.filter(person => {
        const latinRaw = person.englishName || '';
        const arabRaw = person.arabicName || '';
        return cleanText(latinRaw.toLowerCase()).includes(queryLatin) || 
               cleanText(normalizeArabic(arabRaw)).includes(queryArab);
      });
      setSearchSuggestions(suggestions.slice(0, 10)); // Limit 10
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
    }
  };

  const selectSuggestion = (person) => {
    setSearchQuery(person.englishName || person.arabicName);
    setShowSuggestions(false);
    const targetNode = nodes.find((n) => n.id === person.id);
    if (targetNode) {
      setCenter(targetNode.position.x + 120, targetNode.position.y + 60, { zoom: 1.5, duration: 1000 });
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setShowSuggestions(false);
    
    const isSameQuery = searchQuery === lastSearchQuery;
    let matches = [];

    const queryLatinClean = cleanText(searchQuery.toLowerCase());
    const queryArabClean = cleanText(normalizeArabic(searchQuery));

    for (const person of familyData) {
      let current = person;
      let lineageLatinArr = [];
      let lineageArabArr = [];
      let limit = 0;
      while (current && limit < 10) {
        lineageLatinArr.push(current.englishName.toLowerCase());
        lineageArabArr.push(normalizeArabic(current.arabicName || ''));
        current = familyData.find(p => p.id === current.fatherId);
        limit++;
      }
      const fullLineageLatin = cleanText(lineageLatinArr.join(''));
      const fullLineageArab = cleanText(lineageArabArr.join(''));

      if ((queryLatinClean.length > 0 && fullLineageLatin.startsWith(queryLatinClean)) ||
        (queryArabClean.length > 0 && fullLineageArab.startsWith(queryArabClean))) {
        matches.push(person.id);
      }
    }

    if (matches.length > 0) {
      let nextIndex = 0;
      if (isSameQuery) {
        nextIndex = (currentSearchIndex + 1) % matches.length;
      }
      
      const matchId = matches[nextIndex];
      setCurrentSearchIndex(nextIndex);
      setLastSearchQuery(searchQuery);

      const targetNode = nodes.find((n) => n.id === matchId);
      if (targetNode) {
        setCenter(targetNode.position.x + 120, targetNode.position.y + 60, { zoom: 1.5, duration: 1000 });
      }
    } else {
      alert(t('notFound'));
    }
  };


  // ----- FIRESTORE CRUD -----

  const handleAddChild = async (parent, { englishName, arabicName }) => {
    if(!db) return alert(t('notConnected'));
    // Gunakan doc() dengan id otomatis atau doc string
    const newDocRef = doc(collection(db, 'familyNodes')); 
    const newPerson = {
      englishName,
      arabicName,
      fatherId: parent.id,
      info: `${t('descendantOf')}${parent.englishName}`
    };
    try {
      await setDoc(newDocRef, newPerson);
      
      // CREATE NOTICE
      const grandfather = familyData.find(p => p.id === parent.fatherId);
      const gfName = grandfather ? (lang === 'ar' ? grandfather.arabicName : grandfather.englishName) : '-';
      const fatherName = lang === 'ar' ? parent.arabicName : parent.englishName;
      const childName = lang === 'ar' ? arabicName : englishName;
      
      const noticeText = lang === 'ar' 
        ? `${childName} بن ${fatherName} بن ${gfName}`
        : `${childName} bin ${fatherName} bin ${gfName}`;

      await setDoc(doc(collection(db, 'notices')), {
        text: noticeText,
        timestamp: Date.now(),
        type: 'new_member',
        targetId: newDocRef.id
      });
    } catch (err) {
      console.error(err);
      alert(t('addFailed'));
    }
  };

  const handleUpdateChild = async (childId, updates) => {
    if(!db) return alert(t('notConnected'));
    try {
      await updateDoc(doc(db, 'familyNodes', childId), updates);
    } catch (err) {
      console.error(err);
      alert(t('updateFailed'));
    }
  };

  const handleRemoveChild = async (childId) => {
    if(!db) return alert(t('notConnected'));
    try {
      await deleteDoc(doc(db, 'familyNodes', childId));
      if (selectedPerson && selectedPerson.id === childId) {
        setIsModalOpen(false); // Close modal if we deleted the person actively viewed
      }
    } catch (err) {
      console.error(err);
      alert(t('deleteFailed'));
    }
  };

  const seedDatabase = async () => {
    if(!db) return alert(t('notConnected'));
    try {
      for (const p of initialFamilyData) {
        const docRef = doc(db, 'familyNodes', p.id);
        const { id, ...data } = p;
        await setDoc(docRef, data);
      }
      alert(t('seedSuccess'));
    } catch (error) {
      console.error(error);
      alert(t('seedFailed'));
    }
  };

  // ----- ADMIN LOGIC -----

  const handleSignIn = async (email, password) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      setActiveInfoModal(null);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setActiveInfoModal(null);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleAddAdmin = async (data) => {
    try {
      await setDoc(doc(collection(db, 'admins')), data);
      setActiveInfoModal('adminManager');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleUpdateAdmin = async (id, data) => {
    try {
      const { password, ...rest } = data;
      const updateData = password ? data : rest;
      await updateDoc(doc(db, 'admins', id), updateData);
      setActiveInfoModal('adminManager');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteAdmin = async (id) => {
    if (!window.confirm(t('deleteBtn') + '?')) return;
    try {
      await deleteDoc(doc(db, 'admins', id));
    } catch (err) {
      alert(err.message);
    }
  };

  const handleChangePassword = async (newPassword) => {
    try {
      await updatePassword(auth.currentUser, newPassword);
      alert(t('updateSuccess'));
      setActiveInfoModal(null);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleMenuClick = (item) => {
    if (item === 'Sign In') setActiveInfoModal('signin');
    if (item === 'About') setActiveInfoModal('about');
    if (item === 'Admin Manager') setActiveInfoModal('adminManager');
    if (item === 'Change Password') setActiveInfoModal('changePassword');
    if (item === 'Sign Out') handleSignOut();
    
    if (item === 'Notice') {
      setActiveInfoModal('notice');
      // Fix: Use the max timestamp from the actual data to avoid local clock skew issues
      const maxTs = notices.length > 0 ? Math.max(...notices.map(n => n.timestamp || 0)) : Date.now();
      setLastNoticeOpen(maxTs);
      localStorage.setItem('rf-last-notice-open', String(maxTs));
      setUnreadCount(0);
    }
  };

  const handleViewNotice = (notice) => {
    setActiveInfoModal(null);
    if (!notice.targetId) return;

    // Wait a bit for modal transition if needed, though React Flow handles it
    const targetNode = nodes.find(n => n.id === notice.targetId);
    if (targetNode) {
      setCenter(targetNode.position.x + 100, targetNode.position.y + 40, {
        zoom: 1.5,
        duration: 1000
      });
    }
  };

  const handleEditClick = (admin, cancel = false) => {
    if (cancel) {
      setActiveInfoModal('adminManager');
      setEditAdminData(null);
      return;
    }
    setEditAdminData(admin);
    setActiveInfoModal('adminForm');
  };

  const renderSearchForm = () => (
    <div className="search-container glass-panel">
      <form onSubmit={handleSearch} style={{ display: 'flex', width: '100%', gap: '12px', alignItems: 'center' }} className="search-form">
        <Search size={20} className="search-icon" style={{ flexShrink: 0 }} />
        <div style={{ position: 'relative', width: '100%' }}>
          <input 
            type="text" 
            placeholder={t('searchPlaceholder')} 
            className="search-input" 
            value={searchQuery} 
            onChange={handleQueryChange} 
            onFocus={() => { if(searchQuery.length >= 3) setShowSuggestions(true) }}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          />
          {showSuggestions && searchSuggestions.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--panel-bg)', borderRadius: '8px', border: '1px solid var(--panel-border)', marginTop: '12px', padding: '4px', maxHeight: '250px', overflowY: 'auto' }}>
              {searchSuggestions.map(s => (
                <div key={s.id} onClick={() => selectSuggestion(s)} className="suggestion-item" style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--panel-border)' }}>
                  <div style={{ fontWeight: 'bold' }}>{lang === 'ar' ? s.arabicName : s.englishName}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                     {(lang === 'ar' ? s.arabicName : s.englishName) + getNasabDesc(s)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <button type="submit" className="search-button">{t('searchButton')}</button>
      </form>
    </div>
  );

  const handleDeleteNotice = async (id) => {
    if (!db) return;
    try {
      await deleteDoc(doc(db, 'notices', id));
    } catch (err) {
      console.error("Delete Notice Error:", err);
    }
  };

  return (
    <>
      <MobileHeader 
        title={t('appName') || "Nasab Al-Baraja"} 
        onMenuClick={handleMenuClick}
        t={t}
        lang={lang}
        currentUser={currentUser}
        unreadCount={unreadCount}
      />
      
      <WebsiteHeader 
        onMenuClick={handleMenuClick}
        t={t}
        lang={lang}
        currentUser={currentUser}
        unreadCount={unreadCount}
      >
        {renderSearchForm()}
      </WebsiteHeader>

      <InfoModal 
        isOpen={!!activeInfoModal} 
        onClose={() => setActiveInfoModal(null)} 
        type={activeInfoModal}
        title={t(activeInfoModal === 'signin' ? 'signIn' : activeInfoModal === 'about' ? 'about' : activeInfoModal === 'notice' ? 'notice' : activeInfoModal === 'adminManager' ? 'adminManager' : activeInfoModal === 'adminForm' ? (editAdminData ? 'editBtn' : 'addAdmin') : 'changePassword')}
        t={t}
        lang={lang}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
        admins={admins}
        onAddAdmin={handleAddAdmin}
        onUpdateAdmin={handleUpdateAdmin}
        onDeleteAdmin={handleDeleteAdmin}
        onChangePassword={handleChangePassword}
        currentUser={currentUser}
        editAdminData={editAdminData}
        onEditClick={handleEditClick}
        notices={notices}
        onViewNotice={handleViewNotice}
        onDeleteNotice={handleDeleteNotice}
      />

      {/* Toast Notification */}
      {toast && (
        <div className="glass-panel toast-notification" style={{
          position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999, padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '12px',
          animation: 'slideUp 0.3s ease-out'
        }}>
          <Bell size={20} color="var(--accent)" />
          <div style={{ fontSize: '14px', fontWeight: 'bold' }}>{toast.text}</div>
        </div>
      )}

      <div className="background-glow" />
      <div className="background-glow-bottom" />
      <div className="watermark">شَجَرَةُ آلِ بَارَجَاء</div>

      {/* Render Seed Button if DB is totally empty and not loading */}
      {!isLoading && familyData.length === 0 && (
        <button className="theme-toggle top-actions" onClick={seedDatabase} title={t('seedTooltip')} style={{top: 24, right: 24, color: 'var(--accent)'}}>
          <Database size={20} />
        </button>
      )}

      <NodeEditModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        person={selectedPerson}
        familyData={familyData}
        onAddChild={handleAddChild}
        onUpdateChild={handleUpdateChild}
        onRemoveChild={handleRemoveChild}
        lang={lang}
        t={t}
        currentUser={currentUser}
      />

      {/* Only show standalone search for Android (since it's in the header for Web) */}
      {Capacitor.getPlatform() === 'android' && renderSearchForm()}

      <div style={{ width: '100%', height: '100%' }}>
        {isLoading ? (
          <div style={{display:'flex', flexDirection: 'column', height:'100%', width:'100%', alignItems:'center', justifyContent:'center', gap: '16px'}}>
             <div>{t('loading')}</div>
             <TimeoutWarning />
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onMoveEnd={handleMoveEnd}
            onPaneClick={() => setSelectedPerson(null)}
            nodeTypes={nodeTypes}
            minZoom={0.1}
            maxZoom={3}
            fitView={!initialViewport}
            fitViewOptions={{ padding: 0.2, duration: 800, maxZoom: 1 }}
            defaultViewport={initialViewport || undefined}
            nodesDraggable={false}
            nodesConnectable={false}
            onlyRenderVisibleElements={true}
            defaultEdgeOptions={{ type: 'smoothstep' }}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="var(--panel-border)" gap={24} size={2} />
            <Controls position="bottom-right" showInteractive={false} fitViewOptions={{ duration: 800, padding: 0.2 }}>
              <button 
                className="react-flow__controls-button" 
                onClick={toggleTheme} 
                title={t('themeTitle')}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Palette size={14} />
              </button>
              <button 
                className="react-flow__controls-button" 
                onClick={toggleLang} 
                title={t('langTitle')}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold' }}
              >
                {lang.toUpperCase()}
              </button>
            </Controls>
          </ReactFlow>
        )}
      </div>
    </>
  );
};

export default FamilyGraph;
