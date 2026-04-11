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
import { Search, Palette, Database, Bell, ListTree } from 'lucide-react';
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

const FamilyGraph = () => {
  const [theme, setTheme] = useState(() => localStorage.getItem('rf-theme') || 'light');
  const [lang, setLang] = useState(() => localStorage.getItem('rf-lang') || 'ar');
  const [familyData, setFamilyData] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const { setCenter, fitView, setViewport, getViewport, updateNodeData } = useReactFlow();
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

  const [appSettings, setAppSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('rf-app-settings');
      return saved ? JSON.parse(saved) : {
        animationsEnabled: true,
        cameraEnabled: true,
        expandEnabled: true,
        glowEnabled: true
      };
    } catch (e) {
      return {
        animationsEnabled: true,
        cameraEnabled: true,
        expandEnabled: true,
        glowEnabled: true
      };
    }
  });

  useEffect(() => {
    localStorage.setItem('rf-app-settings', JSON.stringify(appSettings));
  }, [appSettings]);


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
    let iterations = 0; // Guard against potential infinite loops in data
    
    while (currentId && iterations < 100) {
      const person = familyData.find(p => p.id === currentId);
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
  }, [familyData]);

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

    return () => {
      unsubFamily();
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
      const personMap = new Map();
      const parentToChildren = new Map();
      familyData.forEach(p => {
        const id = String(p.id);
        const fid = p.fatherId ? String(p.fatherId) : null;
        personMap.set(id, { ...p, id, fatherId: fid });
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
      
      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(rawNodes, rawEdges, 'TB');
      
      // Index existing nodes and layout nodes for O(1) override lookups
      const nodesMap = new Map(nodes.map(n => [String(n.id), n]));
      const layoutNodesMap = new Map(layoutedNodes.map(n => [String(n.id), n]));

      const finalNodes = layoutedNodes.map(n => {
        const nid = String(n.id);
        const person = personMap.get(nid);
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
            curr = personMap.get(String(curr.fatherId));
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
        
        // Use the person's isGlowing property we set in traverse
        const isGlowing = n.isGlowing || (toggledNodeInfo && toggledNodeInfo.id === n.id);

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
            onLongPress: (nodeId, rawData) => {
              setSelectedPerson(rawData);
              setIsModalOpen(true);
            }
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
  }, [familyData, collapsedStateById, isLoading]);

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
    let current = familyData.find(p => p.id === targetId);
    const toExpand = [];
    while (current && current.fatherId) {
      toExpand.push(current.fatherId);
      current = familyData.find(p => p.id === current.fatherId);
    }
    
    if (toExpand.length === 0) return false;

    let changed = false;
    setCollapsedStateById(prev => {
      const next = { ...prev };
      toExpand.forEach(id => {
        if (next[id]) {
          next[id] = false;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
    return changed;
  }, [familyData]);

  // Auto-focus when pending target becomes visible in nodes array
  useEffect(() => {
    if (pendingFocusTarget) {
      const targetNode = nodes.find(n => n.id === pendingFocusTarget.id);
      if (targetNode) {
        // Extra frame buffer to ensure layout settlement
        requestAnimationFrame(() => {
          smoothFocusNode(pendingFocusTarget.id, pendingFocusTarget.options);
          setPendingFocusTarget(null);
        });
      }
    }
  }, [nodes, pendingFocusTarget, smoothFocusNode]);

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
          info: `${t('descendantOf')}${parent.englishName}`
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

  const handleExpandAll = useCallback(() => {
    const { x, y, zoom } = getViewport();
    
    // Calculate viewport bounds in flow coordinates
    const padding = 100; // Extra padding to include nodes partially off-screen
    const minX = (-x - padding) / zoom;
    const minY = (-y - padding) / zoom;
    const maxX = (window.innerWidth - x + padding) / zoom;
    const maxY = (window.innerHeight - y + padding) / zoom;

    const visibleCollapsedNodes = nodes.filter(node => {
      const isVisible = 
        node.position.x >= minX && 
        node.position.x <= maxX && 
        node.position.y >= minY && 
        node.position.y <= maxY;
      
      const isCollapsed = !!collapsedStateById[node.id];
      const hasChildren = node.data?.hasChildren;

      return isVisible && isCollapsed && hasChildren;
    });

    if (visibleCollapsedNodes.length === 0) return;

    setCollapsedStateById(prev => {
      const next = { ...prev };
      visibleCollapsedNodes.forEach(node => {
        next[node.id] = false;
      });
      localStorage.setItem('rf-collapsed-state', JSON.stringify(next));
      return next;
    });
  }, [getViewport, nodes, collapsedStateById]);

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
        lang={lang}
        t={t}
        currentUser={currentUser}
      />

      {/* Only show standalone search for Android (since it's in the header for Web) */}
      {Capacitor.getPlatform() === 'android' && renderSearchForm()}

      <div className={`graph-workspace ${Capacitor.getPlatform()}`} style={{ width: '100%', height: '100%' }}>
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
                onClick={handleExpandAll} 
                title={t('expandAll')}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <ListTree size={14} />
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
