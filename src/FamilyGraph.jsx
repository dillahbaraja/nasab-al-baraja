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
import { Search, Palette, Database } from 'lucide-react';
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

const FamilyGraph = () => {
  const [theme, setTheme] = useState(() => localStorage.getItem('rf-theme') || 'dark');
  const [lang, setLang] = useState(() => localStorage.getItem('rf-lang') || 'id');
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

  // Firestore Realtime Listener
  useEffect(() => {
    if (!db) {
      console.warn("Firestore db tidak diinisialisasi. Cek .env.local Anda.");
      setIsLoading(false);
      return;
    }

    // Family Nodes Listener
    const unsubFamily = onSnapshot(collection(db, 'familyNodes'), (snapshot) => {
      const dbData = snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
      setFamilyData(dbData);
      setIsLoading(false);
    }, (err) => {
      console.error("Firebase Snapshot Error:", err);
      setIsLoading(false);
    });

    // Admins Listener
    const unsubAdmins = onSnapshot(collection(db, 'admins'), (snapshot) => {
      setAdmins(snapshot.docs.map(d => ({ ...d.data(), id: d.id })));
    });

    return () => {
      unsubFamily();
      unsubAdmins();
    };
  }, []);

  // Super Admin Seeder
  useEffect(() => {
    if (!db || admins.length === 0) return;
    const superEmail = 'dillahbaraja@gmail.com';
    const hasSuperAdmin = admins.some(a => a.email === superEmail);
    if (!hasSuperAdmin) {
      const seedSuper = async () => {
        try {
          await setDoc(doc(collection(db, 'admins')), {
            nameLatin: 'Abdillah',
            nameArab: 'Abdillah',
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
      setNodes([]);
      setEdges([]);
      return;
    }
    const rawNodes = createNodesFromData(familyData);
    const rawEdges = generateEdges(familyData);
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
    
    setNodes(nodesWithHandler);
    setEdges(layoutedEdges);
  }, [familyData]);

  const hasInitialized = useRef(false);
  useEffect(() => {
    if (nodes.length > 0 && !isLoading && !hasInitialized.current) {
      hasInitialized.current = true;
      const savedViewport = localStorage.getItem('rf-viewport');
      if (savedViewport && savedViewport !== "undefined") {
        try {
          const vp = JSON.parse(savedViewport);
          setTimeout(() => setViewport(vp), 100);
        } catch(e) {
          setTimeout(() => fitView({ padding: 0.2, duration: 800 }), 300);
        }
      } else {
        setTimeout(() => fitView({ padding: 0.2, duration: 800 }), 300);
      }
    }
  }, [nodes.length, fitView, isLoading, setViewport]);

  const onNodesChange = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );
  const onEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

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
      parts.push(lang === 'ar' ? current.nameArab : current.nameLatin);
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
        const latinRaw = person.nameLatin || '';
        const arabRaw = person.nameArab || '';
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
    setSearchQuery(person.nameLatin || person.nameArab);
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
        lineageLatinArr.push(current.nameLatin.toLowerCase());
        lineageArabArr.push(normalizeArabic(current.nameArab || ''));
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

  const handleMoveEnd = (event, viewport) => {
    localStorage.setItem('rf-viewport', JSON.stringify(viewport));
  };

  // ----- FIRESTORE CRUD -----

  const handleAddChild = async (parent, { nameLatin, nameArab }) => {
    if(!db) return alert(t('notConnected'));
    // Gunakan doc() dengan id otomatis atau doc string
    const newDocRef = doc(collection(db, 'familyNodes')); 
    const newPerson = {
      nameLatin,
      nameArab,
      fatherId: parent.id,
      info: `${t('descendantOf')}${parent.nameLatin}`
    };
    try {
      await setDoc(newDocRef, newPerson);
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
    if (item === 'Notice') setActiveInfoModal('notice');
    if (item === 'Admin Manager') setActiveInfoModal('adminManager');
    if (item === 'Change Password') setActiveInfoModal('changePassword');
    if (item === 'Sign Out') handleSignOut();
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
                  <div style={{ fontWeight: 'bold' }}>{lang === 'ar' ? s.nameArab : s.nameLatin}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                     {(lang === 'ar' ? s.nameArab : s.nameLatin) + getNasabDesc(s)}
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

  return (
    <>
      <MobileHeader 
        title={t('appName') || "Nasab Al-Baraja"} 
        onMenuClick={handleMenuClick}
        t={t}
        lang={lang}
        currentUser={currentUser}
      />
      
      <WebsiteHeader 
        onMenuClick={handleMenuClick}
        t={t}
        lang={lang}
        currentUser={currentUser}
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
      />

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
          <div style={{display:'flex', height:'100%', width:'100%', alignItems:'center', justifyContent:'center'}}>
             {t('loading')}
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
            nodesDraggable={false}
            nodesConnectable={false}
            onlyRenderVisibleElements={true}
            defaultEdgeOptions={{ type: 'smoothstep' }}
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
