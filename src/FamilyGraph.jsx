import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  applyNodeChanges,
  applyEdgeChanges,
  useReactFlow
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Search, Palette, Database, Bell, ListTree, ArrowRight, ArrowLeft, Maximize } from 'lucide-react';
import FamilyNode from './FamilyNode';
import { initialFamilyData, generateEdges } from './data';
import { getLayoutedElements, createNodesFromData } from './layout';
import NodeEditModal from './NodeEditModal';
import { db, auth } from './firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, updateDoc, writeBatch } from 'firebase/firestore';
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

// Module-level helpers — no state/props dependencies, defined once
const normalizeArabic = (text) => {
  return text.normalize("NFD").replace(/[\u064B-\u065F\u0670]/g, "").replace(/[\u0623\u0625\u0622]/g, "\u0627").replace(/\u0629/g, "\u0647").replace(/\u064A$/g, "\u0649").toLowerCase();
};

const cleanText = (text) => {
  return text.replace(/\b(bin|ben|binti)\b/gi, '').replace(/\u0628\u0646/g, '').replace(/\s+/g, '').trim();
};

const FamilyGraph = () => {
  const [theme, setTheme] = useState(() => localStorage.getItem('rf-theme') || 'light');
  const [lang, setLang] = useState(() => localStorage.getItem('rf-lang') || 'en');
  const [familyData, setFamilyData] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const { setCenter, fitView, setViewport, getViewport, updateNodeData, zoomIn, getNode } = useReactFlow();
  const animationRef = useRef(null);
  const [collapsedStateById, setCollapsedStateById] = useState(() => {
    try {
      const saved = localStorage.getItem('rf-collapsed-state');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem('rf-collapsed-state', JSON.stringify(collapsedStateById));
  }, [collapsedStateById]);

  const glowTimeoutRef = useRef(null);
  const lastGlowNodeIdRef = useRef(null);
  const prevVisibleSetRef = useRef(new Set());
  const expandClickCountRef = useRef(0);
  const expandClickTimerRef = useRef(null);
  const hasInitialFocusedRef = useRef(false); // tracks first-load root focus
  const [expandClickCount, setExpandClickCount] = useState(0);
  const [navDirection, setNavDirection] = useState('right'); // 'right' = next click goes to rightmost

  const t = useCallback((key) => translations[key]?.[lang] || translations[key]?.['en'] || key, [lang]);

  // Memoized O(1) person lookup map — replaces O(N) familyData.find() calls
  const personMap = useMemo(() => {
    const map = new Map();
    familyData.forEach(p => map.set(String(p.id), p));
    return map;
  }, [familyData]);

  // Pre-built search index — computed once on data load, not on every search keystroke
  const searchIndex = useMemo(() => {
    return familyData.map(person => {
      let current = person;
      let lineageLatinArr = [];
      let lineageArabArr = [];
      let limit = 0;
      while (current && limit < 10) {
        lineageLatinArr.push((current.englishName || '').toLowerCase());
        lineageArabArr.push(normalizeArabic(current.arabicName || ''));
        current = personMap.get(String(current.fatherId));
        limit++;
      }
      return {
        id: person.id,
        lineageLatin: cleanText(lineageLatinArr.join('')),
        lineageArab: cleanText(lineageArabArr.join('')),
        info: (person.info || '').toLowerCase()
      };
    });
  }, [personMap]); // personMap already depends on familyData

  const [selectedPerson, setSelectedPerson] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [lastSearchQuery, setLastSearchQuery] = useState('');
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
  const searchIndexRef = useRef(0); // #6: mirror ref to avoid stale closure in handleSearch
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [notices, setNotices] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [lastNoticeOpen, setLastNoticeOpen] = useState(() => Number(localStorage.getItem('rf-last-notice-open')) || 0);
  const [toast, setToast] = useState(null);
  const toastTimeoutRef = useRef(null);
  const [pendingFocusTarget, setPendingFocusTarget] = useState(null);
  const [toggledNodeInfo, setToggledNodeInfo] = useState(null); // { id, lastPos, lastViewport }
  const [collapsingParentId, setCollapsingParentId] = useState(null);
  const [ancestorPath, setAncestorPath] = useState({ nodeIds: new Set(), edgeIds: new Set() });
  
  // Info Modals State
  const [activeInfoModal, setActiveInfoModal] = useState(null); // 'signin', 'about', 'notice', 'adminManager', 'adminForm', 'changePassword', 'settings'
  const [isIntroRunning, setIsIntroRunning] = useState(false);

  const [appSettings, setAppSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('rf-app-settings');
      return saved ? JSON.parse(saved) : {
        animationsEnabled: true,
        cameraEnabled: true,
        expandEnabled: true,
        glowEnabled: true,
        layoutStyle: 'tidy'
      };
    } catch (e) {
      return {
        animationsEnabled: true,
        cameraEnabled: true,
        expandEnabled: true,
        glowEnabled: true,
        layoutStyle: 'tidy'
      };
    }
  });

  useEffect(() => {
    localStorage.setItem('rf-app-settings', JSON.stringify(appSettings));
  }, [appSettings]);

  // Trigger fitView whenever layout changes
  const prevLayoutRef = useRef(appSettings.layoutStyle || 'tidy');
  useEffect(() => {
    const currentLayout = appSettings.layoutStyle || 'tidy';
    if (prevLayoutRef.current !== currentLayout) {
      prevLayoutRef.current = currentLayout;
      // Delay slightly so layout change resolves before computing bounds
      setTimeout(() => {
        fitView({ duration: 800 });
      }, 150);
    }
  }, [appSettings.layoutStyle, fitView]);


  const triggerGlow = useCallback((nodeId) => {
    if (!appSettings.glowEnabled) return;
    if (glowTimeoutRef.current) clearTimeout(glowTimeoutRef.current);

    // Turn off previous glow if it exists
    if (lastGlowNodeIdRef.current && lastGlowNodeIdRef.current !== nodeId) {
      updateNodeData(lastGlowNodeIdRef.current, { isGlowing: false });
    }

    // Turn on current glow
    updateNodeData(nodeId, { isGlowing: true });
    lastGlowNodeIdRef.current = nodeId;
    
    glowTimeoutRef.current = setTimeout(() => {
      updateNodeData(nodeId, { isGlowing: false });
      lastGlowNodeIdRef.current = null;
      glowTimeoutRef.current = null;
    }, 1200);
  }, [appSettings.glowEnabled, updateNodeData]);

  const calculateAncestorPath = useCallback((nodeId) => {
    if (!nodeId) return { nodeIds: new Set(), edgeIds: new Set() };
    const nodeIds = new Set([nodeId]);
    const edgeIds = new Set();
    let currentId = nodeId;
    let iterations = 0;
    
    while (currentId && iterations < 100) {
      const person = personMap.get(currentId); // O(1) lookup instead of O(N) find()
      if (person && person.fatherId) {
        const fatherId = String(person.fatherId);
        nodeIds.add(fatherId);
        edgeIds.add(`e-${fatherId}-${currentId}`);
        currentId = fatherId;
      } else {
        currentId = null;
      }
      iterations++;
    }
    return { nodeIds, edgeIds };
  }, [personMap]);

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

      setFamilyData(dbData);
      setIsLoading(false);
    }, (err) => {
      console.error("Family Snapshot Error:", err);
      setIsLoading(false);
    });

    return () => {
      unsubFamily();
    };
  }, []); // db is a stable module constant, no need to re-subscribe

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
  }, []); // db is a stable module constant, no need to re-subscribe

  // 3. Reactive Unread Count Calculation
  useEffect(() => {
    const unread = notices.filter(n => (n.timestamp || 0) > lastNoticeOpen).length;

    setUnreadCount(unread);
  }, [notices, lastNoticeOpen]);



  // Stable callback for node long-press — prevents child re-renders on every layout recalc
  const handleNodeLongPress = useCallback((nodeId, rawData) => {
    setSelectedPerson(rawData);
    setIsModalOpen(true);
  }, []); // setSelectedPerson and setIsModalOpen are stable React setState functions

  // Update layout diagram on data change
  useEffect(() => {
    if (familyData.length === 0) {
      if (!isLoading) {
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
      // 1. Build lookup maps for O(N) performance
      const personMapLocal = new Map();
      const parentToChildren = new Map();
      familyData.forEach(p => {
        const id = String(p.id);
        const fid = p.fatherId ? String(p.fatherId) : null;
        personMapLocal.set(id, { ...p, id, fatherId: fid });
        if (fid) {
          if (!parentToChildren.has(fid)) parentToChildren.set(fid, []);
          parentToChildren.get(fid).push({ ...p, id, fatherId: fid });
        }
      });

      const rootList = familyData.filter(p => !p.fatherId);
      const visibleData = [];
      const traverse = (person) => {
        const pid = String(person.id);
        const isCollapsed = !!collapsedStateById[pid];
        const isCurrentlyCollapsing = collapsingParentId === pid;
        
        visibleData.push({
          ...person,
          isGlowing: isCollapsed, // Add glow to collapsed nodes
          isCollapsed: isCollapsed,
          hasChildren: parentToChildren.has(pid)
        });

        if (!isCollapsed || isCurrentlyCollapsing) {
          const children = parentToChildren.get(pid) || [];
          children.forEach(c => traverse(c));
        }
      };
      rootList.forEach(r => traverse(r));

      const rawNodes = createNodesFromData(visibleData);
      const rawEdges = generateEdges(visibleData);
      
      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(rawNodes, rawEdges, appSettings.layoutStyle || 'tidy');
      
      // Index existing nodes and layout nodes for O(1) override lookups
      const nodesMap = new Map(nodes.map(n => [String(n.id), n]));
      const layoutNodesMap = new Map(layoutedNodes.map(n => [String(n.id), n]));

      const finalNodes = layoutedNodes.map(n => {
        const nid = String(n.id);
        const person = personMapLocal.get(nid);
        const cpid = collapsingParentId ? String(collapsingParentId) : null;

        // Grouping/Collapse Animation Overlay
        if (person && person.fatherId && cpid) {
          let isPhantomCollapsing = false;
          let curr = person;
          while (curr && curr.fatherId) {
            if (String(curr.fatherId) === cpid) {
              isPhantomCollapsing = true;
              break;
            }
            curr = personMapLocal.get(String(curr.fatherId));
          }

          if (isPhantomCollapsing) {
            const parentNode = layoutNodesMap.get(cpid);
            if (parentNode) {
              return {
                ...n,
                position: { ...parentNode.position },
                className: 'collapsing-child'
              };
            }
          }
        }
        
        // Ungrouping/Expand Animation Overlay
        const isNew = !prevVisibleSetRef.current.has(nid);
        if (isNew && person && person.fatherId) {
          const fid = String(person.fatherId);
          const parentNode = nodesMap.get(fid) || layoutNodesMap.get(fid);
          if (parentNode) {
             return { ...n, position: { ...parentNode.position }, opacity: 0 };
          }
        }

        return n;
      });
      
      // 2. Expansion & Collapse Glow Detection
      const currentVisibleIds = new Set(visibleData.map(p => p.id));
      const newlyVisibleIds = new Set([...currentVisibleIds].filter(id => !prevVisibleSetRef.current.has(id)));
      
      setNodes(finalNodes.map(n => {
        const isNew = newlyVisibleIds.has(n.id);
        const isToggled = toggledNodeInfo && toggledNodeInfo.id === n.id;
        
        // #7: Preserve nav glow (from triggerGlow) across layout re-renders
        const nid2 = String(n.id);
        const isNavGlowing = lastGlowNodeIdRef.current === nid2;
        const isGlowing = isNavGlowing || n.isGlowing || !!(toggledNodeInfo && toggledNodeInfo.id === n.id);

        // Ungrouping Animation: New nodes start at the parent's position
        let initialPos = { ...n.position };
        if (isNew && toggledNodeInfo && !toggledNodeInfo.isPersistent) {
          initialPos = { ...toggledNodeInfo.lastPos };
        }
        
        return {
          ...n,
          data: {
            ...n.data,
            isGlowing,
            onLongPress: handleNodeLongPress // Stable reference — prevents unnecessary child re-renders
          },
          position: initialPos
        };
      }));
      setEdges([...layoutedEdges]);
      
      // 3. Stabilization: Keep the toggled node at the same screen position
      if (toggledNodeInfo) {
        const targetNode = layoutNodesMap.get(String(toggledNodeInfo.id));
        if (targetNode) {
          const { lastPos, lastViewport } = toggledNodeInfo;
          const currentPos = targetNode.position;
          
          // Formula: vpOffset_new = vpOffset_old + (nodePos_old - nodePos_new) * zoom
          const nextX = lastViewport.x + (lastPos.x - currentPos.x) * lastViewport.zoom;
          const nextY = lastViewport.y + (lastPos.y - currentPos.y) * lastViewport.zoom;
          
          // Instant adjustments to prevent visual jumps
          const isInstant = !appSettings.animationsEnabled || !appSettings.expandEnabled;
          setViewport({ x: nextX, y: nextY, zoom: lastViewport.zoom }, { duration: isInstant ? 0 : 400 });
        }
        
        if (!toggledNodeInfo.isPersistent) {
          setToggledNodeInfo(null);
        }
      }

      // Update tracking ref
      prevVisibleSetRef.current = currentVisibleIds;

      // 4. Expansion Sequencer (Ungrouping effect)
      if (newlyVisibleIds.size > 0) {
        requestAnimationFrame(() => {
          setNodes(nds => nds.map(node => {
            const nid = String(node.id);
            const targetNode = layoutNodesMap.get(nid);
            if (targetNode && newlyVisibleIds.has(nid)) {
              return { ...node, position: { ...targetNode.position }, opacity: 1 };
            }
            return node;
          }));
        });
      }

      // 5. Clear expansion/toggle glow after 2.5s
      if (newlyVisibleIds.size > 0 || collapsingParentId) {
        if (glowTimeoutRef.current) clearTimeout(glowTimeoutRef.current);
        glowTimeoutRef.current = setTimeout(() => {
          setNodes(nds => nds.map(node => {
            const isCollapsed = !!collapsedStateById[node.id];
            return {
              ...node,
              data: { 
                ...node.data, 
                isGlowing: isCollapsed // Permanent glow for collapsed branches, clear for others
              }
            };
          }));
        }, 2500);
      }
    } catch (err) {
      console.error("Layout Rendering Crash Prevented:", err);
    }
  }, [familyData, collapsedStateById, isLoading, collapsingParentId, handleNodeLongPress, appSettings.layoutStyle]); // handleNodeLongPress is stable (useCallback [])

  // Highlight Ancestor Path
  useEffect(() => {
    setNodes(nds => nds.map(node => {
      const nid = String(node.id);
      const isPathGlow = ancestorPath.nodeIds.has(nid);
      if (node.data.isPathGlow === isPathGlow) return node;
      return {
        ...node,
        data: {
          ...node.data,
          isPathGlow
        }
      };
    }));
    setEdges(eds => eds.map(edge => {
      const isPathGlow = ancestorPath.edgeIds.has(edge.id);
      const className = isPathGlow ? 'ancestor-edge-glow' : '';
      if (edge.className === className) return edge;
      return {
        ...edge,
        className
      };
    }));
  }, [ancestorPath]);

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
  

  const smoothFocusNode = useCallback((nodeId, options = {}) => {
    const { 
      targetZoom, 
      forceGlow = true,
      customDuration
    } = options;

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    const { x: currentX, y: currentY, zoom: currentZoom } = getViewport();
    const targetNode = nodes.find((n) => n.id === nodeId);
    if (!targetNode) return;

    // Use current zoom if targetZoom not provided
    const finalZoom = targetZoom || currentZoom;
    
    // Viewport dimensions
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Center point logic: Screen Center - (Node Coord * Zoom)
    const targetX = (viewportWidth / 2) - (targetNode.position.x * finalZoom);
    const targetY = (viewportHeight / 2) - (targetNode.position.y * finalZoom);

    // Distance calculation for adaptive duration
    const dx = targetX - currentX;
    const dy = targetY - currentY;
    const distance = Math.hypot(dx, dy);
    
    // Adaptive Duration: clamp(distance * factor, 280ms, 700ms)
    let duration = customDuration || Math.min(Math.max(distance * 0.45, 280), 700);
    
    // Check Settings
    if (!appSettings.animationsEnabled || !appSettings.cameraEnabled) {
      duration = 0;
    }
    
    // Fast snap for local movements with same zoom
    if (!customDuration && Math.abs(currentZoom - finalZoom) < 0.01 && distance < 1500) {
        duration = Math.min(duration, 400); 
    }

    const startTime = performance.now();

    const animate = (time) => {
      const elapsed = time - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // easeInOutCubic
      const easing = progress < 0.5 
        ? 4 * progress * progress * progress 
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      const nextX = currentX + (targetX - currentX) * easing;
      const nextY = currentY + (targetY - currentY) * easing;
      const nextZoom = currentZoom + (finalZoom - currentZoom) * easing;

      setViewport({ x: nextX, y: nextY, zoom: nextZoom });

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        animationRef.current = null;
        if (forceGlow) {
           triggerGlow(nodeId);
        }
      }
    };

    animationRef.current = requestAnimationFrame(animate);
    
    // Select the node
    setNodes((nds) => nds.map(n => ({ ...n, selected: n.id === nodeId })));
    setAncestorPath(calculateAncestorPath(nodeId));
  }, [getViewport, setViewport, nodes, triggerGlow, calculateAncestorPath]);

  // Arc navigation: zoom out → pan → zoom in (for edge navigation)
  const handleNavEdge = useCallback((direction) => {
    if (nodes.length === 0) return;

    const target = direction === 'right'
      ? nodes.reduce((prev, curr) => curr.position.x > prev.position.x ? curr : prev)
      : nodes.reduce((prev, curr) => curr.position.x < prev.position.x ? curr : prev);

    setNavDirection(direction === 'right' ? 'left' : 'right');
    setNodes((nds) => nds.map(n => ({ ...n, selected: n.id === target.id })));
    setAncestorPath(calculateAncestorPath(target.id));

    if (animationRef.current) cancelAnimationFrame(animationRef.current);

    const { x: startX, y: startY, zoom: startZoom } = getViewport();
    const finalZoom = 1.0;
    const vpW = window.innerWidth;
    const vpH = window.innerHeight;

    const endX = (vpW / 2) - (target.position.x * finalZoom);
    const endY = (vpH / 2) - (target.position.y * finalZoom);
    const distance = Math.hypot(endX - startX, endY - startY);
    const isFar = distance > 400;

    const ease = (p) => p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2;

    if (!appSettings.animationsEnabled || !appSettings.cameraEnabled || !isFar) {
      // Direct smooth pan + zoom, no arc
      const dur = (!appSettings.animationsEnabled || !appSettings.cameraEnabled) ? 0 : 600;
      const dx = endX - startX;
      const dy = endY - startY;
      const startTime = performance.now();
      const animateDirect = (time) => {
        const p = Math.min((time - startTime) / (dur || 1), 1);
        const e = ease(p);
        setViewport({ x: startX + dx * e, y: startY + dy * e, zoom: startZoom + (finalZoom - startZoom) * e });
        if (p < 1) animationRef.current = requestAnimationFrame(animateDirect);
        else { animationRef.current = null; triggerGlow(target.id); }
      };
      animationRef.current = requestAnimationFrame(animateDirect);
      return;
    }

    // ── True 3-Phase Arc ─────────────────────────────────────────────────────
    // midZoom: zoom out enough to feel like flying, but nodes still visible (cap 0.35)
    const safeStart = startZoom > 0 ? startZoom : 1;
    const arcMidZoom = Math.min(Math.max(safeStart * 0.45, 0.13), 0.35);
    const arcDuration = Math.min(Math.max(distance * 0.25, 900), 1600);

    // Phase 1 end: same flow center as now, but at arcMidZoom
    const flowCX = (vpW / 2 - startX) / safeStart;
    const flowCY = (vpH / 2 - startY) / safeStart;
    const midStartX = vpW / 2 - flowCX * arcMidZoom;
    const midStartY = vpH / 2 - flowCY * arcMidZoom;

    // Phase 2 end: target centered at arcMidZoom
    const midEndX = vpW / 2 - target.position.x * arcMidZoom;
    const midEndY = vpH / 2 - target.position.y * arcMidZoom;

    const startTime = performance.now();

    const animateArc = (time) => {
      const raw = Math.min((time - startTime) / arcDuration, 1);
      let curX, curY, curZoom;

      if (raw <= 0.3) {
        // Phase 1 (0–30%): zoom out, current view center stays fixed
        const p = ease(raw / 0.3);
        curZoom = safeStart + (arcMidZoom - safeStart) * p;
        curX = startX + (midStartX - startX) * p;
        curY = startY + (midStartY - startY) * p;

      } else if (raw <= 0.7) {
        // Phase 2 (30–70%): pan at arcMidZoom across the landscape
        const p = ease((raw - 0.3) / 0.4);
        curZoom = arcMidZoom;
        curX = midStartX + (midEndX - midStartX) * p;
        curY = midStartY + (midEndY - midStartY) * p;

      } else {
        // Phase 3 (70–100%): zoom in, target node locked to screen center
        const p = ease((raw - 0.7) / 0.3);
        curZoom = arcMidZoom + (finalZoom - arcMidZoom) * p;
        curX = vpW / 2 - target.position.x * curZoom;
        curY = vpH / 2 - target.position.y * curZoom;
      }

      setViewport({ x: curX, y: curY, zoom: curZoom });

      if (raw < 1) {
        animationRef.current = requestAnimationFrame(animateArc);
      } else {
        animationRef.current = null;
        triggerGlow(target.id);
      }
    };

    animationRef.current = requestAnimationFrame(animateArc);
  }, [nodes, getViewport, setViewport, calculateAncestorPath, triggerGlow, appSettings]);


  const onNodeClick = useCallback((_, node) => {
    // Selection only, no centering (Per user request)
    setNodes((nds) => nds.map(n => ({ ...n, selected: n.id === node.id })));
    setAncestorPath(calculateAncestorPath(node.id));
  }, [calculateAncestorPath]);

  const onNodeDoubleClick = useCallback((_, node) => {
    const wasExpanded = !collapsedStateById[node.id];
    
    if (wasExpanded) {
      // 1. Start Grouping animation (Recursive Collapse)
      setCollapsingParentId(node.id);
      
      // Build parent-children map for O(1) recursion
      const parentToChildrenMap = new Map();
      familyData.forEach(p => {
        const fid = p.fatherId ? String(p.fatherId) : null;
        if (fid) {
          if (!parentToChildrenMap.has(fid)) parentToChildrenMap.set(fid, []);
          parentToChildrenMap.get(fid).push(p);
        }
      });

      const gatherDescendantIds = (parentId) => {
        let results = [];
        const pid = String(parentId);
        const children = parentToChildrenMap.get(pid) || [];
        children.forEach(child => {
          results.push(String(child.id));
          results = results.concat(gatherDescendantIds(child.id));
        });
        return results;
      };
      const descendants = gatherDescendantIds(node.id);

      // Stabilization: Snapping persists through the 600ms animation into the final layout
      const view = getViewport();
      setToggledNodeInfo({
        id: node.id,
        lastPos: { ...node.position },
        lastViewport: { ...view },
        isPersistent: true 
      });

      setTimeout(() => {
        setCollapsedStateById(prev => {
          const newState = { ...prev, [node.id]: true };
          descendants.forEach(cid => { newState[cid] = true; }); // RECURSIVE COLLAPSE
          localStorage.setItem('rf-collapsed-state', JSON.stringify(newState));
          return newState;
        });
        setCollapsingParentId(null);
        setToggledNodeInfo(prev => prev ? { ...prev, isPersistent: false } : null);
      }, 150);
    } else {
      // 2. Start Ungrouping animation (Recursive Expand)
      // Build parent-children map for O(1) recursion
      const parentToChildrenMap = new Map();
      familyData.forEach(p => {
        const fid = p.fatherId ? String(p.fatherId) : null;
        if (fid) {
          if (!parentToChildrenMap.has(fid)) parentToChildrenMap.set(fid, []);
          parentToChildrenMap.get(fid).push(p);
        }
      });

      const gatherDescendantIds = (parentId) => {
        let results = [];
        const pid = String(parentId);
        const children = parentToChildrenMap.get(pid) || [];
        children.forEach(child => {
          results.push(String(child.id));
          results = results.concat(gatherDescendantIds(child.id));
        });
        return results;
      };
      
      const descendants = gatherDescendantIds(node.id);
      
      // Viewport Stabilization (Snap only once for expand)
      const view = getViewport();
      setToggledNodeInfo({
        id: node.id,
        lastPos: { ...node.position },
        lastViewport: { ...view }
      });

      setCollapsedStateById(prev => {
        const newState = { ...prev };
        newState[node.id] = false;
        localStorage.setItem('rf-collapsed-state', JSON.stringify(newState));
        return newState;
      });
    }
  }, [collapsedStateById, familyData, getViewport]);

  const onPaneDoubleClick = useCallback((e) => {
    // Only zoom if clicking directly on pane/background — not on a node
    const isOnPane = !e.target.closest('.react-flow__node') && !e.target.closest('.react-flow__controls');
    if (!isOnPane) return;
    zoomIn({ duration: 300 });
  }, [zoomIn]);

  const onPaneClick = useCallback(() => {
    setSelectedPerson(null);
    setAncestorPath({ nodeIds: new Set(), edgeIds: new Set() });
    if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
    }
  }, []);

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



  // Handle device orientation change to keep the same focal point
  useEffect(() => {
    let lastWidth = window.innerWidth;
    let lastHeight = window.innerHeight;
    
    const handleResize = () => {
      const currentWidth = window.innerWidth;
      const currentHeight = window.innerHeight;
      
      // Only adjust center if the width changes significantly (e.g. orientation change),
      // avoiding jumpiness when the mobile keyboard pops up.
      if (Math.abs(currentWidth - lastWidth) > 50) {
        // Calculate the old center of the screen in flow coordinates
        const { x, y, zoom } = getViewport();
        const oldCenterX = lastWidth / 2;
        const oldCenterY = lastHeight / 2;
        
        const flowCenterX = (oldCenterX - x) / zoom;
        const flowCenterY = (oldCenterY - y) / zoom;
        
        // Re-apply so that the old flowCenter becomes the new screen center
        setTimeout(() => {
          setCenter(flowCenterX, flowCenterY, { zoom, duration: 400 });
        }, 150);
      }
      
      lastWidth = currentWidth;
      lastHeight = currentHeight;
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, [getViewport, setCenter]);


  const ensurePathVisible = useCallback((targetId) => {
    // 1. Walk up the ancestor chain to collect all ancestor IDs
    let current = familyData.find(p => p.id === targetId);
    const ancestorsToExpand = [];
    let loopGuard = 0;
    while (current && current.fatherId && loopGuard < 100) { // #8: loop limit against circular refs
      loopGuard++;
      ancestorsToExpand.push(String(current.fatherId));
      current = familyData.find(p => p.id === current.fatherId);
    }

    if (ancestorsToExpand.length === 0) return false;

    // 2. Check synchronously (against current state snapshot) whether any are collapsed
    //    This avoids the async setState stale-closure bug where `changed` was always false.
    const anyCollapsed = ancestorsToExpand.some(id => !!collapsedStateById[id]);
    
    if (!anyCollapsed) return false;

    // 3. Expand all collapsed ancestors
    setCollapsedStateById(prev => {
      const next = { ...prev };
      ancestorsToExpand.forEach(id => {
        if (next[id]) next[id] = false;
      });
      return next;
    });

    return true;
  }, [familyData, collapsedStateById]);

  // Auto-focus when pending target becomes visible in nodes array
  useEffect(() => {
    if (pendingFocusTarget) {
      const targetNode = nodes.find(n => n.id === pendingFocusTarget.id);
      // Verify node exists AND has a meaningful computed position (not a default 0,0 before layout)
      const isLayoutReady = targetNode && (Math.abs(targetNode.position.x) > 1 || Math.abs(targetNode.position.y) > 1);

      if (isLayoutReady) {
        // Double rAF: first frame = DOM update done, second frame = layout/paint fully settled
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            smoothFocusNode(pendingFocusTarget.id, pendingFocusTarget.options);
            setPendingFocusTarget(null);
          });
        });
      }
    }
  }, [nodes, pendingFocusTarget, smoothFocusNode]);

  // CINEMATIC INTRO SEQUENCE
  useEffect(() => {
    if (isLoading || nodes.length === 0 || hasInitialFocusedRef.current) return;
    if (initialViewport) {
      // Saved viewport exists — don't override
      hasInitialFocusedRef.current = true;
      return;
    }

    if (familyData.length === 0) return;
    
    // User request: Focus intro explicitly on "Muhammad bin Mas'ud ... al-Mulaqqab bi-Abi Raja'"
    const rootPerson = familyData.find(p => p.arabicName && p.arabicName.includes('الملقب بأبي رجاء')) 
                       || familyData.find(p => !p.fatherId);
                       
    if (!rootPerson) return;

    // Step 0: Ensure the tree is forcefully collapsed before cinematic starts
    const hasBeenForced = sessionStorage.getItem('rf-cinematic-forced');
    if (!hasBeenForced) {
        // Collect descendants of Muhammad to collapse them
        const parentToChildrenMap = new Map();
        familyData.forEach(p => {
          const fid = p.fatherId ? String(p.fatherId) : null;
          if (fid) {
            if (!parentToChildrenMap.has(fid)) parentToChildrenMap.set(fid, []);
            parentToChildrenMap.get(fid).push(p);
          }
        });
        
        const gatherDescendantIds = (parentId) => {
          let results = [];
          const children = parentToChildrenMap.get(String(parentId)) || [];
          children.forEach(child => {
            const cid = String(child.id);
            results.push(cid);
            results = results.concat(gatherDescendantIds(cid));
          });
          return results;
        };
        
        const descendants = gatherDescendantIds(rootPerson.id);
        
        setCollapsedStateById(prev => {
           let newState = { ...prev };
           newState[rootPerson.id] = true; // Collapse his immediate children
           descendants.forEach(cid => { newState[cid] = true; }); // Collapse all descendant branches
           localStorage.setItem('rf-collapsed-state', JSON.stringify(newState));
           return newState;
        });
        sessionStorage.setItem('rf-cinematic-forced', '1');
        return; // Wait for the next React render tick with a heavily tightened map
    }

    // Now layout is truly tight and recalculation is done
    const rootNode = nodes.find(n => n.id === String(rootPerson.id));
    const isLayoutReady = rootNode && (Math.abs(rootNode.position.x) > 1 || Math.abs(rootNode.position.y) > 1);
    if (!isLayoutReady) return;

    hasInitialFocusedRef.current = true;
    setIsIntroRunning(true);
    
    // Build tier arrays for dynamic popping
    const parentToChildrenMap = new Map();
    familyData.forEach(p => {
      const fid = p.fatherId ? String(p.fatherId) : null;
      if (fid) {
        if (!parentToChildrenMap.has(fid)) parentToChildrenMap.set(fid, []);
        parentToChildrenMap.get(fid).push(p);
      }
    });

    const tier1 = [String(rootPerson.id)]; // Root opens first
    const tier2 = (parentToChildrenMap.get(String(rootPerson.id)) || []).map(c => String(c.id));
    const tier3 = tier2.flatMap(id => parentToChildrenMap.get(id) || []).map(c => String(c.id));
    const tier4 = tier3.flatMap(id => parentToChildrenMap.get(id) || []).map(c => String(c.id));
    const tier5 = tier4.flatMap(id => parentToChildrenMap.get(id) || []).map(c => String(c.id));

    // Phase 1: Sinkronisasi Snap Awal ke Center persis tanpa menggunakan setCenter (menghindari Glitch)
    const initW = rootNode.measured?.width || rootNode.width || 260;
    const initH = rootNode.measured?.height || rootNode.height || 100;
    const initCX = rootNode.position.x + (initW / 2);
    const initCY = rootNode.position.y + (initH / 2);
    
    setViewport({ 
        x: (window.innerWidth / 2) - (initCX * 2.5), 
        y: (window.innerHeight / 2) - (initCY * 2.5), 
        zoom: 2.5 
    });

    const popGroup = (ids, delay) => {
        if (!ids || ids.length === 0) return;
        setTimeout(() => {
            setCollapsedStateById(prev => {
                const next = { ...prev };
                let changed = false;
                ids.forEach(id => {
                    if (next[id]) { next[id] = false; changed = true; }
                });
                if (changed) localStorage.setItem('rf-collapsed-state', JSON.stringify(next));
                return next;
            });
        }, delay);
    };

    const duration = 14500;
    const startT = window.performance.now();

    const animateCamera = (timestamp) => {
        const elapsed = timestamp - startT;
        const progress = Math.min(elapsed / duration, 1);
        
        const liveRoot = getNode(String(rootPerson.id));
        if (!liveRoot) return;
        
        // Memperbaiki Zoom Out Maksimum sampai 0.05 (sangat jauh)
        let currentZoom;
        if (progress < 0.25) {
             currentZoom = 2.5 - (progress / 0.25) * 1.5; // 0->25%: 2.5 to 1.0
        } else if (progress < 0.6) {
             currentZoom = 1.0 - ((progress - 0.25) / 0.35) * 0.7; // 25->60%: 1.0 to 0.3
        } else {
             currentZoom = 0.3 - ((progress - 0.6) / 0.4) * 0.25; // 60->100%: 0.3 to 0.05
        }
        
        // Kamera melengkung ayunan drone
        const panCurve = Math.sin(progress * Math.PI); 
        const offsetX = panCurve * 800; // max shift 800px
        const offsetY = panCurve * 800; 

        const activeW = liveRoot.measured?.width || liveRoot.width || 260;
        const activeH = liveRoot.measured?.height || liveRoot.height || 100;
        const nodeCenterX = liveRoot.position.x + (activeW / 2);
        const nodeCenterY = liveRoot.position.y + (activeH / 2);

        const flowElem = document.querySelector('.react-flow');
        const vpW = flowElem ? flowElem.clientWidth : window.innerWidth;
        const vpH = flowElem ? flowElem.clientHeight : window.innerHeight;
        
        const targetX = (vpW / 2) - ((nodeCenterX + offsetX) * currentZoom);
        const targetY = (vpH / 2) - ((nodeCenterY + offsetY) * currentZoom);
        
        setViewport({ x: targetX, y: targetY, zoom: currentZoom });
        
        if (progress < 1) {
            requestAnimationFrame(animateCamera);
        } else {
            setIsIntroRunning(false); 
        }
    };

    // Eksekusi Animasi Kamera Continuous
    requestAnimationFrame(animateCamera);

    // Buka node bertahap layer by layer
    popGroup(tier1, 1000); 
    popGroup(tier2, 2800); 
    popGroup(tier3, 5000); 
    popGroup(tier4, 7500); 
    popGroup(tier5, 9500); 

    // Langkah Terakhir: Pastikan SEMUA sisa nodes tanpa terkecuali mengembang persis di ujung penarikan
    const allIds = familyData.map(d => String(d.id));
    popGroup(allIds, 11500);

  }, [isLoading, nodes, familyData, initialViewport, setCenter]);



  const getNasabDesc = (person) => {
    let parts = [];
    let current = personMap.get(String(person.fatherId)); // O(1) vs O(N) find()
    let count = 0;
    while(current && count < 2) {
      parts.push(lang === 'ar' ? current.arabicName : current.englishName);
      current = personMap.get(String(current.fatherId));
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
        const infoRaw = person.info || '';
        return cleanText(latinRaw.toLowerCase()).includes(queryLatin) || 
               cleanText(normalizeArabic(arabRaw)).includes(queryArab) ||
               infoRaw.toLowerCase().includes(val.toLowerCase());
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
    
    const wasHidden = ensurePathVisible(person.id);
    if (wasHidden) {
      setPendingFocusTarget({ id: person.id, options: { targetZoom: 1.2 } });
    } else {
      smoothFocusNode(person.id, { targetZoom: 1.2 });
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setShowSuggestions(false);
    
    const isSameQuery = searchQuery === lastSearchQuery;
    const queryLatinClean = cleanText(searchQuery.toLowerCase());
    const queryArabClean = cleanText(normalizeArabic(searchQuery));
    const queryLower = searchQuery.toLowerCase();

    // Use pre-built searchIndex — O(N) instead of O(N×depth) per search
    const matches = searchIndex
      .filter(entry =>
        entry.info.includes(queryLower) ||
        (queryLatinClean.length > 0 && entry.lineageLatin.startsWith(queryLatinClean)) ||
        (queryArabClean.length > 0 && entry.lineageArab.startsWith(queryArabClean))
      )
      .map(entry => entry.id);

    if (matches.length > 0) {
      let nextIndex = 0;
      if (isSameQuery) {
        nextIndex = (searchIndexRef.current + 1) % matches.length;
      }
      searchIndexRef.current = nextIndex;
      const matchId = matches[nextIndex];
      setCurrentSearchIndex(nextIndex);
      setLastSearchQuery(searchQuery);
      
      const wasHidden = ensurePathVisible(matchId);
      if (wasHidden) {
        setPendingFocusTarget({ id: matchId, options: { targetZoom: 1.2 } });
      } else {
        const targetNode = nodes.find((n) => n.id === matchId);
        if (targetNode) {
          smoothFocusNode(matchId, { targetZoom: 1.2 });
        }
      }
    } else {
      alert(t('notFound'));
    }
  };


  // ----- FIRESTORE CRUD -----

  const handleAddChild = async (parent, childrenList) => {
    if(!db) return alert(t('notConnected'));
    try {
      const list = Array.isArray(childrenList) ? childrenList : [childrenList];
      
      const promises = list.map(async (child) => {
        const { englishName, arabicName } = child;
        const newDocRef = doc(collection(db, 'familyNodes')); 
        const newPerson = {
          englishName,
          arabicName,
          fatherId: parent.id,
          info: ''
        };
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
      });

      await Promise.all(promises);
    } catch (err) {
      console.error(err);
      alert(t('addFailed'));
      throw err;
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
      const batch = writeBatch(db);
      
      // 1. Find all descendants recursively
      const parentToChildrenMap = new Map();
      familyData.forEach(p => {
        const fid = p.fatherId ? String(p.fatherId) : null;
        if (fid) {
          if (!parentToChildrenMap.has(fid)) parentToChildrenMap.set(fid, []);
          parentToChildrenMap.get(fid).push(p);
        }
      });

      const gatherDescendantIds = (parentId) => {
        let results = [];
        const pid = String(parentId);
        const children = parentToChildrenMap.get(pid) || [];
        children.forEach(child => {
          results.push(String(child.id));
          results = results.concat(gatherDescendantIds(child.id));
        });
        return results;
      };

      const idsToDelete = [String(childId), ...gatherDescendantIds(childId)];
      
      // 2. Add to batch
      idsToDelete.forEach(id => {
        batch.delete(doc(db, 'familyNodes', id));
      });

      await batch.commit();

      if (selectedPerson && idsToDelete.includes(String(selectedPerson.id))) {
        setIsModalOpen(false); 
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
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        throw new Error(lang === 'id' ? 'Email atau password salah.' : lang === 'ar' ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' : 'Invalid email or password.');
      } else if (err.code === 'auth/too-many-requests') {
        throw new Error(lang === 'id' ? 'Terlalu banyak percobaan gagal, silakan coba lagi nanti.' : lang === 'ar' ? 'محاولات فاشلة كثيرة، يرجى المحاولة لاحقًا.' : 'Too many failed attempts, please try again later.');
      } else {
        throw new Error(lang === 'id' ? 'Gagal masuk: ' + err.message : lang === 'ar' ? 'فشل تسجيل الدخول: ' + err.message : 'Sign in failed: ' + err.message);
      }
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
    if (item === 'Settings') setActiveInfoModal('settings');
    if (item === 'Sign In') setActiveInfoModal('signin');
    if (item === 'About') setActiveInfoModal('about');

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

  const handleCustomFitView = useCallback(() => {
    if (!familyData || familyData.length === 0) return;
    
    // Override absolute root; user explicitly targets this specific node as the visual center
    const targetPerson = familyData.find(p => p.arabicName && p.arabicName.includes('الملقب بأبي رجاء')) 
                         || familyData.find(p => !p.fatherId);
    if (!targetPerson) return;
    
    const liveRoot = getNode(String(targetPerson.id));
    if (!liveRoot) return;

    const activeW = liveRoot.measured?.width || liveRoot.width || 260;
    const activeH = liveRoot.measured?.height || liveRoot.height || 100;
    const nodeCenterX = liveRoot.position.x + (activeW / 2);
    const nodeCenterY = liveRoot.position.y + (activeH / 2);
    
    const flowElem = document.querySelector('.react-flow');
    const vpW = flowElem ? flowElem.clientWidth : window.innerWidth;
    const vpH = flowElem ? flowElem.clientHeight : window.innerHeight;
    
    const currentZoom = 0.05;
    const targetX = (vpW / 2) - (nodeCenterX * currentZoom);
    // Presisi di tengah layar canvas yang sebenarnya
    const targetY = (vpH / 2) - (nodeCenterY * currentZoom);

    // Langsung tembakViewport tanpa setCenter karena setCenter membuang node keluar dimensi
    setViewport({ x: targetX, y: targetY, zoom: currentZoom }, { duration: 1200 });
  }, [familyData, getNode, setViewport]);

  const handleExpandAll = useCallback(() => {
    // --- Manual Multi-Click Counter (Click 1 = Visible Only, Click 2 within 2s = Everything) ---
    expandClickCountRef.current += 1;
    const clickIteration = expandClickCountRef.current;
    setExpandClickCount(clickIteration);

    // Reset timer on every interaction
    if (expandClickTimerRef.current) clearTimeout(expandClickTimerRef.current);

    if (clickIteration >= 2) {
      // CLICK 2: Deep Expand (All nodes in database) + Center View
      expandClickCountRef.current = 0;
      setExpandClickCount(0);

      setCollapsedStateById(() => {
        const next = {};
        // Open every single person in the database
        familyData.forEach(p => { next[p.id] = false; });
        localStorage.setItem('rf-collapsed-state', JSON.stringify(next));
        return next;
      });

      // Fit view using cinematic target (Muhammad bin Mas'ud)
      setTimeout(() => handleCustomFitView(), 250);
      return;
    }

    // CLICK 1: Shallow Expand (Only visible collapsed nodes)
    expandClickTimerRef.current = setTimeout(() => {
      expandClickCountRef.current = 0;
      setExpandClickCount(0);
    }, 2000);

    const flowElem = document.querySelector('.react-flow');
    const vpW = flowElem ? flowElem.clientWidth : window.innerWidth;
    const vpH = flowElem ? flowElem.clientHeight : window.innerHeight;
    
    const { x, y, zoom } = getViewport();
    const padding = 50; 
    
    // Bounds in flow-space
    const minX = (-x - padding) / zoom;
    const minY = (-y - padding) / zoom;
    const maxX = (vpW - x + padding) / zoom;
    const maxY = (vpH - y + padding) / zoom;

    const visibleCollapsedNodes = nodes.filter(node => {
      const isVisible = 
        node.position.x >= minX && 
        node.position.x <= maxX && 
        node.position.y >= minY && 
        node.position.y <= maxY;
      
      return isVisible && !!collapsedStateById[node.id] && node.data?.hasChildren;
    });

    if (visibleCollapsedNodes.length === 0) return;

    setCollapsedStateById(prev => {
      const next = { ...prev };
      visibleCollapsedNodes.forEach(node => {
        next[node.id] = false; // Just open this node, not its descendants
      });
      localStorage.setItem('rf-collapsed-state', JSON.stringify(next));
      return next;
    });
  }, [getViewport, nodes, collapsedStateById, handleCustomFitView, familyData]);


  const handleViewPerson = (personId) => {
    setActiveInfoModal(null);
    setIsModalOpen(false); 
    
    if (!personId) return;

    const wasHidden = ensurePathVisible(personId);
    if (wasHidden) {
      setPendingFocusTarget({ id: personId, options: { targetZoom: 1.2 } });
    } else {
      const targetNode = nodes.find(n => n.id === personId);
      if (targetNode) {
        smoothFocusNode(personId, { targetZoom: 1.2 });
      }
    }
  };

  const handleShowLineageOnly = useCallback((personId) => {
    if (!personId || familyData.length === 0) return;

    // Build O(1) lookup maps
    const personMapLocal = new Map();
    const parentToChildren = new Map();
    familyData.forEach(p => {
      const id = String(p.id);
      const fid = p.fatherId ? String(p.fatherId) : null;
      personMapLocal.set(id, { ...p, id, fatherId: fid });
      if (fid) {
        if (!parentToChildren.has(fid)) parentToChildren.set(fid, []);
        parentToChildren.get(fid).push(id);
      }
    });

    const selectedId = String(personId);
    const visibleSet = new Set(); // node IDs yang harus EXPANDED (tampil dengan anak-anaknya)
    const keepOpenSet = new Set(); // node IDs yang tetap dibuka (tidak di-collapse)

    // 1. Traverse ke atas: kumpulkan semua ancestor langsung
    const ancestors = []; // ordered dari parent -> root
    let currentId = selectedId;
    let guard = 0;
    while (currentId && guard < 200) {
      const p = personMapLocal.get(currentId);
      if (!p) break;
      keepOpenSet.add(currentId);
      if (p.fatherId) {
        ancestors.push({ id: currentId, parentId: p.fatherId });
        visibleSet.add(p.fatherId); // parent harus expanded
        keepOpenSet.add(p.fatherId);
      }
      currentId = p.fatherId || null;
      guard++;
    }

    // 2. Tentukan parent & grandparent dari selected person
    const selectedPerson = personMapLocal.get(selectedId);
    const parentId = selectedPerson?.fatherId || null;
    const grandParentId = parentId ? personMapLocal.get(parentId)?.fatherId || null : null;

    // 3. Saudara kandung: semua anak dari parent yang sama → tampilkan (keepOpen), tapi kolapskan mereka sendiri
    if (parentId) {
      const siblings = parentToChildren.get(parentId) || [];
      siblings.forEach(sibId => {
        keepOpenSet.add(sibId); // sibling tampil
        // Sibling di-collapse (kecuali diri sendiri = selected)
        visibleSet.delete(sibId);
      });
      // pastikan parent expanded
      visibleSet.add(parentId);
    }

    // 4. Aunts/Uncles + First Cousins (satu kakek):
    if (grandParentId) {
      const parentSiblings = parentToChildren.get(grandParentId) || []; // termasuk parent selected
      parentSiblings.forEach(auntUncleId => {
        keepOpenSet.add(auntUncleId); // aunt/uncle tampil
        if (auntUncleId !== parentId) {
          // ini benar-benar aunt/uncle → expand untuk tampilkan cousins
          visibleSet.add(auntUncleId); // aunt/uncle harus expanded
          const cousins = parentToChildren.get(auntUncleId) || [];
          cousins.forEach(cousinId => {
            keepOpenSet.add(cousinId); // cousin tampil
            // cousin di-collapse (kecuali selected)
          });
        }
      });
      // pastikan grandparent expanded
      visibleSet.add(grandParentId);
    }

    // 5. Selected person selalu tetap open (keturunannya tidak di-collapse)
    keepOpenSet.add(selectedId);

    // 6. Bangun collapsed state baru:
    // - Semua node yang ADA di familyData yang tidak di keepOpenSet → collapsed
    // - Semua node ancestors yang di visibleSet → tidak collapsed
    // - Selected person dan anak-anaknya → tidak di-touch (biarkan state lama)
    const gatherDescendants = (rootId) => {
      const result = new Set();
      const stack = [rootId];
      let g = 0;
      while (stack.length > 0 && g < 10000) {
        const id = stack.pop();
        result.add(id);
        const children = parentToChildren.get(id) || [];
        children.forEach(c => stack.push(c));
        g++;
      }
      return result;
    };

    // Keturunan selected person: jangan disentuh sama sekali (biarkan state lama mereka)
    const selectedDescendants = gatherDescendants(selectedId);

    setCollapsedStateById(prev => {
      const next = { ...prev };

      familyData.forEach(p => {
        const id = String(p.id);

        // Jangan sentuh keturunan selected person (termasuk selected itu sendiri)
        if (selectedDescendants.has(id)) return;

        if (keepOpenSet.has(id)) {
          // Node ini harus tampil
          if (visibleSet.has(id)) {
            // Harus di-expand (agar anaknya muncul)
            next[id] = false;
          } else {
            // Tampil tapi di-collapse (sibling, cousin)
            next[id] = true;
          }
        } else {
          // Di luar lineage → kolaps
          next[id] = true;
        }
      });

      localStorage.setItem('rf-collapsed-state', JSON.stringify(next));
      return next;
    });

    // Aktifkan garis biru ancestor path + select node (sama seperti klik node biasa)
    setAncestorPath(calculateAncestorPath(selectedId));
    setNodes(nds => nds.map(n => ({ ...n, selected: n.id === selectedId })));

    // Tutup modal, lalu fitView agar seluruh lineage terlihat centered
    setIsModalOpen(false);
    setTimeout(() => {
      fitView({ duration: 700, padding: 0.18 });
    }, 300);
  }, [familyData, fitView, calculateAncestorPath]);

  const handleViewNotice = (notice) => {
    handleViewPerson(notice.targetId);
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
    <div className={`app-root-container ${!appSettings.animationsEnabled ? 'no-animations' : ''}`}>
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
        title={t(activeInfoModal === 'signin' ? 'signIn' : activeInfoModal === 'about' ? 'about' : activeInfoModal === 'notice' ? 'notice' : activeInfoModal === 'changePassword' ? 'changePassword' : 'settings')}
        t={t}
        lang={lang}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
        onChangePassword={handleChangePassword}
        currentUser={currentUser}
        notices={notices}
        onViewNotice={handleViewNotice}
        onDeleteNotice={handleDeleteNotice}
        appSettings={appSettings}
        setAppSettings={setAppSettings}
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

      <div className="total-nodes-label">
        {t('totalNodes')}: {familyData.length}
      </div>

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
        onViewPerson={handleViewPerson}
        onShowLineageOnly={handleShowLineageOnly}
        lang={lang}
        t={t}
        currentUser={currentUser}
      />

      {/* Only show standalone search for Android (since it's in the header for Web) */}
      {Capacitor.getPlatform() === 'android' && renderSearchForm()}

      <div className={`graph-workspace ${Capacitor.getPlatform()}`} style={{ width: '100%', height: '100%', pointerEvents: isIntroRunning ? 'none' : 'auto' }} onDoubleClick={onPaneDoubleClick}>
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
            onPaneClick={onPaneClick}
            onPaneDoubleClick={onPaneDoubleClick}
            onNodeClick={onNodeClick}
            onNodeDoubleClick={onNodeDoubleClick}
            zoomOnDoubleClick={false}
            onMoveStart={(e) => {
              if (e && e.type !== 'animation' && animationRef.current) {
                  cancelAnimationFrame(animationRef.current);
                  animationRef.current = null;
              }
            }}
            nodeTypes={nodeTypes}
            minZoom={0.05}
            maxZoom={3}
            fitView={!initialViewport}
            fitViewOptions={{ padding: 0.2, duration: 800, maxZoom: 1 }}
            defaultViewport={initialViewport || undefined}
            nodesDraggable={false}
            nodesConnectable={false}
            onlyRenderVisibleElements={true}
            defaultEdgeOptions={{ type: 'smoothstep', animated: true }}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="var(--panel-border)" gap={24} size={2} />
            <Controls position="bottom-right" showInteractive={false} showFitView={false}>
              <button 
                className="react-flow__controls-button" 
                onClick={handleCustomFitView} 
                title={t('fitView') || 'Fit View'}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Maximize size={14} />
              </button>
              <button 
                className="react-flow__controls-button" 
                onClick={handleExpandAll} 
                title={expandClickCount === 0 ? t('expandAll') : '1 more click = Expand All!'}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}
              >
                <ListTree size={14} />
                {expandClickCount > 0 && (
                  <span style={{
                    position: 'absolute', top: '-4px', right: '-4px',
                    background: expandClickCount >= 2 ? 'var(--accent)' : 'var(--text-secondary)',
                    color: '#fff', borderRadius: '50%',
                    width: '14px', height: '14px',
                    fontSize: '9px', fontWeight: 'bold',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    lineHeight: 1, pointerEvents: 'none'
                  }}>
                    {expandClickCount}
                  </span>
                )}
              </button>
              <button
                className="react-flow__controls-button"
                onClick={() => handleNavEdge(navDirection)}
                title={navDirection === 'right' ? t('goToRightmost') || 'Go to rightmost node' : t('goToLeftmost') || 'Go to leftmost node'}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                {navDirection === 'right' ? <ArrowRight size={14} /> : <ArrowLeft size={14} />}
              </button>
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
    </div>
  );
};

export default FamilyGraph;
