import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  applyNodeChanges,
  applyEdgeChanges,
  useReactFlow,
  useOnViewportChange
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Search, Palette, Database, Bell, ListTree, ArrowRight, ArrowLeft, Maximize } from 'lucide-react';
import FamilyNode from './FamilyNode';
import { initialFamilyData, generateEdges } from './data';
import { getLayoutedElements, createNodesFromData } from './layout';
import NodeEditModal from './NodeEditModal';
import { supabase } from './supabase';
import { translations } from './i18n';
import MobileHeader from './components/MobileHeader';
import WebsiteHeader from './components/WebsiteHeader';
import InfoModal from './components/InfoModals';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';

const nodeTypes = { customNode: FamilyNode };

const TimeoutWarning = () => {
  const lang = localStorage.getItem('rf-lang') || 'en';
  const translate = (key) => translations[key]?.[lang] || translations[key]?.en || key;
  const [show, setShow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShow(true), 5000);
    return () => clearTimeout(timer);
  }, []);

  const handleReset = async () => {
    localStorage.clear();
    sessionStorage.clear();
    // Best-effort cache cleanup for browsers that may keep stale local DB state.
    try {
      const dbs = await window.indexedDB.databases();
      for (let i = 0; i < dbs.length; i++) {
        window.indexedDB.deleteDatabase(dbs[i].name);
      }
    } catch (e) {
      // Ignore browsers that do not expose indexedDB.databases().
    }
    window.location.reload();
  };

  if (!show) return null;
  return (
    <div style={{ textAlign: 'center', marginTop: '16px', padding: '16px', background: 'var(--panel-bg)', borderRadius: '8px', border: '1px solid var(--panel-border)' }}>
      <p style={{ marginBottom: '12px', fontSize: '14px', color: 'var(--text-secondary)' }}>
        {translate('timeoutWarning')}
      </p>
      <button onClick={handleReset} style={{ background: 'var(--accent)', color: '#fff', padding: '8px 16px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>
        {translate('resetCacheReload')}
      </button>
    </div>
  );
};

const LoadingScreen = ({ t }) => {
  return (
    <div className="loading-screen-shell">
      <div className="loading-screen-card glass-panel">
        <div className="loading-dots" aria-hidden="true">
          <span className="loading-dot loading-dot-a" />
          <span className="loading-dot loading-dot-b" />
          <span className="loading-dot loading-dot-c" />
        </div>
        <div className="loading-screen-title">{t('loading')}</div>
        <div className="loading-screen-subtitle">{t('loadingHint')}</div>
      </div>
      <TimeoutWarning />
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

const getPendingNameChange = (person) => person?.moderation?.nameChange?.status === 'pending'
  ? person.moderation.nameChange
  : null;

const isPendingAddChildNode = (person) => person?.moderation?.status === 'pending' && person?.moderation?.type === 'add_child';

const isPersonPending = (person) => Boolean(isPendingAddChildNode(person) || getPendingNameChange(person));

const getDisplayNames = (person) => {
  const pendingNameChange = getPendingNameChange(person);
  if (pendingNameChange) {
    return {
      arabicName: pendingNameChange.proposedArabicName || person?.arabicName || '',
      englishName: pendingNameChange.proposedEnglishName || person?.englishName || ''
    };
  }
  return {
    arabicName: person?.arabicName || '',
    englishName: person?.englishName || ''
  };
};

const getPendingCreatedAt = (person) => {
  if (isPendingAddChildNode(person)) return Number(person?.moderation?.createdAt || 0);
  const pendingNameChange = getPendingNameChange(person);
  if (pendingNameChange) return Number(pendingNameChange.createdAt || 0);
  return 0;
};

const INTRO_STRATEGY = 'lineage-bloom';

const buildNoticeText = ({ type, lang, personName = '', parentName = '', grandParentName = '' }) => {
  if (type === 'proposal_add_child') {
    if (lang === 'ar') return `اقتراح ابن جديد: ${personName} بن ${parentName}${grandParentName ? ` بن ${grandParentName}` : ''}`;
    if (lang === 'id') return `Usulan anak baru: ${personName} bin ${parentName}${grandParentName ? ` bin ${grandParentName}` : ''}`;
    return `New child suggestion: ${personName} bin ${parentName}${grandParentName ? ` bin ${grandParentName}` : ''}`;
  }

  if (type === 'proposal_name_change') {
    if (lang === 'ar') return `اقتراح تعديل الاسم لـ ${personName}`;
    if (lang === 'id') return `Usulan perubahan nama untuk ${personName}`;
    return `Name change suggestion for ${personName}`;
  }

  if (lang === 'ar') return `${personName} بن ${parentName}${grandParentName ? ` بن ${grandParentName}` : ''}`;
  return `${personName} bin ${parentName}${grandParentName ? ` bin ${grandParentName}` : ''}`;
};

const FamilyGraph = () => {
  const [theme, setTheme] = useState(() => localStorage.getItem('rf-theme') || 'light');
  const [lang, setLang] = useState(() => localStorage.getItem('rf-lang') || 'en');
  const [familyData, setFamilyData] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const { setCenter, fitView, setViewport, getViewport, updateNodeData, zoomIn, getNode, getNodes } = useReactFlow();

  useOnViewportChange({
    onChange: (viewport) => {
      if (viewport.zoom < 0.55) {
        if (!document.body.classList.contains('low-graphics-mode')) {
          document.body.classList.add('low-graphics-mode');
        }
      } else {
        if (document.body.classList.contains('low-graphics-mode')) {
          document.body.classList.remove('low-graphics-mode');
        }
      }
    }
  });

  const animationRef = useRef(null);
  const lineageTourTokenRef = useRef(0);
  const introTimeoutsRef = useRef([]);
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

  useEffect(() => {
    return () => {
      introTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
      introTimeoutsRef.current = [];
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, []);

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
      const displayNames = getDisplayNames(person);
      let current = person;
      let lineageLatinArr = [];
      let lineageArabArr = [];
      let limit = 0;
      while (current && limit < 10) {
        const currentDisplay = getDisplayNames(current);
        lineageLatinArr.push((currentDisplay.englishName || '').toLowerCase());
        lineageArabArr.push(normalizeArabic(currentDisplay.arabicName || ''));
        current = personMap.get(String(current.fatherId));
        limit++;
      }
      return {
        id: person.id,
        englishName: displayNames.englishName,
        arabicName: displayNames.arabicName,
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
  const [currentMember, setCurrentMember] = useState(null);
  const [userRole, setUserRole] = useState('guest');
  const [isLegacyAdmin, setIsLegacyAdmin] = useState(false);
  const [memberStatuses, setMemberStatuses] = useState({});
  const [memberRecords, setMemberRecords] = useState([]);
  const [isMemberDataLoading, setIsMemberDataLoading] = useState(false);
  const [notices, setNotices] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [lastNoticeOpen, setLastNoticeOpen] = useState(() => Number(localStorage.getItem('rf-last-notice-open')) || 0);
  const [toast, setToast] = useState(null);
  const toastTimeoutRef = useRef(null);
  const nodesSyncInFlightRef = useRef(false);
  const nodeFetchVersionRef = useRef(0);
  const noticesSyncInFlightRef = useRef(false);
  const pendingDeletedIdsRef = useRef(new Set());
  const [pendingFocusTarget, setPendingFocusTarget] = useState(null);
  const [toggledNodeInfo, setToggledNodeInfo] = useState(null); // { id, lastPos, lastViewport }
  const [collapsingParentId, setCollapsingParentId] = useState(null);
  const [ancestorPath, setAncestorPath] = useState({ nodeIds: new Set(), edgeIds: new Set() });
  const adminWalkthroughEnabledRef = useRef(false);
  const wasAdminRef = useRef(false);

  const isSignedInUser = Boolean(currentUser && !currentUser.is_anonymous);
  const effectiveRole = userRole === 'admin' || isLegacyAdmin
    ? 'admin'
    : userRole === 'verified'
      ? 'verified'
      : 'guest';
  const isVerifiedMember = effectiveRole === 'verified' || effectiveRole === 'admin';
  const isAdmin = effectiveRole === 'admin';
  const canModerateProposals = isVerifiedMember;
  const pendingMemberClaims = useMemo(() => memberRecords.filter((member) => member.claim_status === 'pending'), [memberRecords]);
  const verifiedMembers = useMemo(() => memberRecords.filter((member) => member.claim_status === 'approved' && member.member_level === 'verified'), [memberRecords]);
  const adminMembers = useMemo(() => memberRecords.filter((member) => member.claim_status === 'approved' && member.member_level === 'admin'), [memberRecords]);

  const pendingQueueIds = useMemo(() => {
    const getDepth = (id) => {
      let depth = 0;
      let current = personMap.get(String(id));
      let guard = 0;
      while (current?.fatherId && guard < 100) {
        depth += 1;
        current = personMap.get(String(current.fatherId));
        guard += 1;
      }
      return depth;
    };

    return familyData
      .filter((person) => isPersonPending(person))
      .sort((a, b) => {
        const depthDiff = getDepth(a.id) - getDepth(b.id);
        if (depthDiff !== 0) return depthDiff;
        return getPendingCreatedAt(a) - getPendingCreatedAt(b);
      })
      .map((person) => String(person.id));
  }, [familyData, personMap]);

  // Info Modals State
  const [activeInfoModal, setActiveInfoModal] = useState(null); // 'signin', 'about', 'notice', 'profile', 'memberManager', 'listMember', 'listAdmin', 'settings'
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

  const wait = useCallback((ms) => new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  }), []);

  const showToast = useCallback((nextToast, duration = 2800) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast(nextToast);
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
      toastTimeoutRef.current = null;
    }, duration);
  }, []);

  const stopCameraMotion = useCallback(() => {
    lineageTourTokenRef.current += 1;
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    const currentViewport = getViewport();
    setViewport(currentViewport, { duration: 0 });
  }, [getViewport, setViewport]);

  const clearIntroTimers = useCallback(() => {
    introTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
    introTimeoutsRef.current = [];
  }, []);

  const scheduleIntroAction = useCallback((delay, action) => {
    const timeoutId = window.setTimeout(action, delay);
    introTimeoutsRef.current.push(timeoutId);
    return timeoutId;
  }, []);

  const buildParentToChildrenMap = useCallback((people) => {
    const map = new Map();
    people.forEach((person) => {
      const fatherId = person.fatherId ? String(person.fatherId) : null;
      if (!fatherId) return;
      if (!map.has(fatherId)) map.set(fatherId, []);
      map.get(fatherId).push(person);
    });
    return map;
  }, []);

  const setCollapsedIds = useCallback((ids, collapsed) => {
    if (!ids || ids.length === 0) return;
    setCollapsedStateById((prev) => {
      const next = { ...prev };
      let changed = false;
      ids.forEach((id) => {
        if (!!next[id] !== collapsed) {
          next[id] = collapsed;
          changed = true;
        }
      });
      if (changed) localStorage.setItem('rf-collapsed-state', JSON.stringify(next));
      return next;
    });
  }, []);

  const getViewportForVisibleNodes = useCallback((targetNodes) => {
    const visibleNodes = (targetNodes || []).filter(Boolean);
    if (visibleNodes.length === 0) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    visibleNodes.forEach((node) => {
      const width = Math.max(node.width || node.measured?.width || 180, 120);
      const height = Math.max(node.height || node.measured?.height || 72, 56);
      minX = Math.min(minX, node.position.x);
      minY = Math.min(minY, node.position.y);
      maxX = Math.max(maxX, node.position.x + width);
      maxY = Math.max(maxY, node.position.y + height);
    });

    const viewportWidth = Math.max(window.innerWidth, 320);
    const viewportHeight = Math.max(window.innerHeight, 320);
    const paddingRatio = viewportWidth < 768 ? 0.16 : 0.12;
    const paddedWidth = Math.max(maxX - minX, 240) * (1 + paddingRatio * 2);
    const paddedHeight = Math.max(maxY - minY, 180) * (1 + paddingRatio * 2);
    const zoomX = viewportWidth / paddedWidth;
    const zoomY = viewportHeight / paddedHeight;
    const zoom = Math.min(Math.max(Math.min(zoomX, zoomY), 0.42), 1.05);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    return {
      x: viewportWidth / 2 - centerX * zoom,
      y: viewportHeight / 2 - centerY * zoom,
      zoom
    };
  }, []);

  const runLineageCameraTour = useCallback(async (selectedId, chainIds) => {
    const tourToken = Date.now();
    lineageTourTokenRef.current = tourToken;

    await wait(appSettings.animationsEnabled && appSettings.cameraEnabled ? 520 : 60);
    if (lineageTourTokenRef.current !== tourToken) return;

    const liveNodes = getNodes();
    if (!liveNodes || liveNodes.length === 0) return;

    const selectedNode = getNode(String(selectedId));
    const visibleNodes = liveNodes.filter((node) => node && !node.hidden);
    const overviewViewport = getViewportForVisibleNodes(visibleNodes);

    if (!selectedNode || !overviewViewport) {
      fitView({ duration: appSettings.animationsEnabled && appSettings.cameraEnabled ? 700 : 0, padding: 0.18 });
      return;
    }

    const transitionsEnabled = appSettings.animationsEnabled && appSettings.cameraEnabled;
    const totalSteps = Math.max(chainIds.length - 1, 1);
    const startZoom = Math.min(Math.max(overviewViewport.zoom + 0.34, 0.95), 1.3);
    const endZoom = overviewViewport.zoom;

    const centerNode = async (nodeId, zoom, duration, holdMs = 0) => {
      const liveNode = getNode(String(nodeId));
      if (!liveNode) return;
      const nodeWidth = liveNode.width || liveNode.measured?.width || 180;
      const nodeHeight = liveNode.height || liveNode.measured?.height || 72;
      const targetX = liveNode.position.x + nodeWidth / 2;
      const targetY = liveNode.position.y + nodeHeight / 2;
      setCenter(targetX, targetY, { zoom, duration });
      await wait(duration + 110 + holdMs);
    };

    if (!transitionsEnabled) {
      setCenter(
        selectedNode.position.x + ((selectedNode.width || selectedNode.measured?.width || 180) / 2),
        selectedNode.position.y + ((selectedNode.height || selectedNode.measured?.height || 72) / 2),
        { zoom: startZoom, duration: 0 }
      );
      setViewport(overviewViewport, { duration: 0 });
      return;
    }

    await centerNode(selectedId, startZoom, 780, 380);
    if (lineageTourTokenRef.current !== tourToken) return;

    for (let index = 1; index < chainIds.length; index += 1) {
      if (lineageTourTokenRef.current !== tourToken) return;
      const progress = index / totalSteps;
      const stepZoom = startZoom + (endZoom - startZoom) * progress;
      const stepDuration = index === chainIds.length - 1 ? 980 : 860;
      const holdDuration = index === chainIds.length - 1 ? 420 : 340;
      await centerNode(chainIds[index], stepZoom, stepDuration, holdDuration);
    }

    if (lineageTourTokenRef.current !== tourToken) return;
    await centerNode(selectedId, overviewViewport.zoom, 920, 260);
  }, [appSettings.animationsEnabled, appSettings.cameraEnabled, fitView, getNode, getNodes, getViewportForVisibleNodes, setCenter, setViewport, wait]);

  const runLineageBloomIntro = useCallback((rootPerson) => {
    const rootId = String(rootPerson.id);
    const rootNode = nodes.find((node) => node.id === rootId);
    const isLayoutReady = rootNode && (Math.abs(rootNode.position.x) > 1 || Math.abs(rootNode.position.y) > 1);
    if (!isLayoutReady) return false;

    hasInitialFocusedRef.current = true;
    setIsIntroRunning(true);

    const parentToChildrenMap = buildParentToChildrenMap(familyData);
    const tier1 = [rootId];
    const tier2 = (parentToChildrenMap.get(rootId) || []).map((child) => String(child.id));
    const tier3 = tier2.flatMap((id) => (parentToChildrenMap.get(id) || []).map((child) => String(child.id)));
    const tier4 = tier3.flatMap((id) => (parentToChildrenMap.get(id) || []).map((child) => String(child.id)));
    const tier5 = tier4.flatMap((id) => (parentToChildrenMap.get(id) || []).map((child) => String(child.id)));

    const initW = rootNode.measured?.width || rootNode.width || 260;
    const initH = rootNode.measured?.height || rootNode.height || 100;
    const initCX = rootNode.position.x + (initW / 2);
    const initCY = rootNode.position.y + (initH / 2);
    const flowElem = document.querySelector('.react-flow');
    const initialVpW = flowElem ? flowElem.clientWidth : window.innerWidth;
    const initialVpH = flowElem ? flowElem.clientHeight : window.innerHeight;

    setViewport({
      x: (initialVpW / 2) - (initCX * 2.85),
      y: (initialVpH / 2) - (initCY * 2.85),
      zoom: 2.85
    }, { duration: 0 });

    const easeInOutCubic = (p) => (
      p < 0.5
        ? 4 * p * p * p
        : 1 - ((-2 * p + 2) ** 3) / 2
    );
    const easeOutQuad = (p) => 1 - ((1 - p) * (1 - p));

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    clearIntroTimers();

    const duration = 15400;
    const startT = window.performance.now();

    const animateCamera = (timestamp) => {
      const rawProgress = Math.min(Math.max(timestamp - startT, 0) / duration, 1);
      const progress = easeInOutCubic(rawProgress);
      const liveRoot = getNode(rootId);
      if (!liveRoot) {
        setIsIntroRunning(false);
        animationRef.current = null;
        return;
      }

      let currentZoom;
      if (progress < 0.08) {
        currentZoom = 2.85 - easeOutQuad(progress / 0.08) * 1.95;
      } else if (progress < 0.36) {
        currentZoom = 0.90 - easeInOutCubic((progress - 0.08) / 0.28) * 0.42;
      } else {
        currentZoom = 0.48 - easeInOutCubic((progress - 0.36) / 0.64) * 0.30;
      }

      const driftX = Math.sin(progress * Math.PI * 0.9) * 80;
      const driftY = Math.sin(progress * Math.PI) * 56;
      const activeW = liveRoot.measured?.width || liveRoot.width || 260;
      const activeH = liveRoot.measured?.height || liveRoot.height || 100;
      const nodeCenterX = liveRoot.position.x + (activeW / 2);
      const nodeCenterY = liveRoot.position.y + (activeH / 2);
      const activeFlowElem = document.querySelector('.react-flow');
      const vpW = activeFlowElem ? activeFlowElem.clientWidth : window.innerWidth;
      const vpH = activeFlowElem ? activeFlowElem.clientHeight : window.innerHeight;

      setViewport({
        x: (vpW / 2) - ((nodeCenterX + driftX) * currentZoom),
        y: (vpH / 2) - ((nodeCenterY + driftY) * currentZoom),
        zoom: currentZoom
      });

      if (rawProgress < 1) {
        animationRef.current = requestAnimationFrame(animateCamera);
      } else {
        animationRef.current = null;
        clearIntroTimers();
        fitView({ duration: 900, padding: 0.14 });
        scheduleIntroAction(940, () => {
          setIsIntroRunning(false);
        });
      }
    };

    animationRef.current = requestAnimationFrame(animateCamera);

    scheduleIntroAction(3000, () => setCollapsedIds(tier1, false));
    scheduleIntroAction(5300, () => setCollapsedIds(tier2, false));
    scheduleIntroAction(7800, () => setCollapsedIds(tier3, false));
    scheduleIntroAction(10300, () => setCollapsedIds(tier4, false));
    scheduleIntroAction(12700, () => setCollapsedIds(tier5, false));
    scheduleIntroAction(14500, () => setCollapsedIds(familyData.map((person) => String(person.id)), false));

    return true;
  }, [buildParentToChildrenMap, clearIntroTimers, familyData, fitView, getNode, nodes, scheduleIntroAction, setCollapsedIds, setViewport]);

  const runIntroStrategy = useCallback((strategyName, rootPerson) => {
    const strategies = {
      'lineage-bloom': () => runLineageBloomIntro(rootPerson)
    };

    const strategy = strategies[strategyName] || strategies['lineage-bloom'];
    return strategy();
  }, [runLineageBloomIntro]);

  useEffect(() => {
    const interruptCamera = () => {
      stopCameraMotion();
    };

    window.addEventListener('pointerdown', interruptCamera, { passive: true });
    window.addEventListener('touchstart', interruptCamera, { passive: true });

    return () => {
      window.removeEventListener('pointerdown', interruptCamera);
      window.removeEventListener('touchstart', interruptCamera);
    };
  }, [stopCameraMotion]);

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
        } catch (e) { console.warn("StatusBar error:", e); }
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

  const fetchPublicMemberStatuses = useCallback(async () => {
    const { data, error } = await supabase
      .from('baraja_member_public_status')
      .select('*');

    if (error) {
      console.error('Member status lookup failed:', error);
      return;
    }

    const nextMap = {};
    (data || []).forEach((item) => {
      nextMap[String(item.person_id)] = item.claim_status || 'none';
    });
    setMemberStatuses(nextMap);
  }, []);

  const fetchCurrentMember = useCallback(async (user) => {
    if (!user || user.is_anonymous) {
      setCurrentMember(null);
      setUserRole('guest');
      setIsLegacyAdmin(false);
      return null;
    }

    const { data, error } = await supabase
      .from('baraja_member')
      .select('*')
      .eq('auth_user_id', user.id)
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Current member lookup failed:', error);
      setCurrentMember(null);
      setUserRole('guest');
      return null;
    }

    setCurrentMember(data || null);

    if (!data || data.claim_status !== 'approved') {
      setUserRole('guest');
    } else if (data.member_level === 'admin') {
      setUserRole('admin');
    } else {
      setUserRole('verified');
    }

    return data || null;
  }, []);

  const checkLegacyAdminUser = useCallback(async (user) => {
    if (!user || user.is_anonymous || !user.email) return false;

    const { data, error } = await supabase
      .from('admin_users')
      .select('email')
      .eq('email', user.email)
      .maybeSingle();

    if (error) {
      console.error('Legacy admin lookup failed:', error);
      return false;
    }

    return Boolean(data);
  }, []);

  const fetchManageableMembers = useCallback(async (roleOverride = effectiveRole) => {
    if (!(roleOverride === 'verified' || roleOverride === 'admin')) {
      setMemberRecords([]);
      setIsMemberDataLoading(false);
      return;
    }

    setIsMemberDataLoading(true);
    const { data, error } = await supabase
      .from('baraja_member')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Member manager lookup failed:', error);
      setIsMemberDataLoading(false);
      return;
    }

    setMemberRecords(data || []);
    setIsMemberDataLoading(false);
  }, [effectiveRole]);

  const resolveMemberContext = useCallback(async (user) => {
    if (!user || user.is_anonymous) {
      setCurrentMember(null);
      setUserRole('guest');
      setIsLegacyAdmin(false);
      setMemberRecords([]);
      return { role: 'guest', member: null };
    }

    const member = await fetchCurrentMember(user);
    const legacyAdmin = await checkLegacyAdminUser(user);
    setIsLegacyAdmin(legacyAdmin);
    const nextRole = !member || member.claim_status !== 'approved'
      ? (legacyAdmin ? 'admin' : 'guest')
      : member.member_level === 'admin'
        ? 'admin'
        : 'verified';

    if (nextRole === 'verified' || nextRole === 'admin') {
      await fetchManageableMembers(nextRole);
    } else {
      setMemberRecords([]);
    }

    return { role: nextRole, member, isLegacyAdmin: legacyAdmin };
  }, [checkLegacyAdminUser, fetchCurrentMember, fetchManageableMembers]);

  // Auth State Listener
  useEffect(() => {
    let isMounted = true;

    const ensureGuestSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!isMounted) return;

      const user = session?.user || null;
      setCurrentUser(user);
      await resolveMemberContext(user);

      if (!session) {
        const { data, error } = await supabase.auth.signInAnonymously();
        if (error) {
          console.error('Anonymous auth bootstrap failed:', error);
          return;
        }
        if (!isMounted) return;
        const anonUser = data?.user || null;
        setCurrentUser(anonUser);
        await resolveMemberContext(anonUser);
      }
    };

    fetchPublicMemberStatuses();
    ensureGuestSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      const user = session?.user || null;
      setCurrentUser(user);
      void resolveMemberContext(user);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [fetchPublicMemberStatuses, resolveMemberContext]);

  const sortNoticesNewestFirst = useCallback((items) => {
    return [...items].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }, []);

  const fetchAllNodes = useCallback(async ({ markLoaded = true } = {}) => {
    if (nodesSyncInFlightRef.current) return;
    nodesSyncInFlightRef.current = true;
    const requestVersion = ++nodeFetchVersionRef.current;

    try {
      let allData = [];
      let from = 0;
      let to = 999;
      let finished = false;

      while (!finished) {
        const { data, error } = await supabase
          .from('nodes')
          .select('*')
          .range(from, to);

        if (error) throw error;

        allData = [...allData, ...(data || [])];
        if (!data || data.length < 1000) {
          finished = true;
        } else {
          from += 1000;
          to += 1000;
        }
      }

      const mappedData = allData.map(n => ({
        ...n,
        fatherId: n.father_id,
        arabicName: n.arabic_name,
        englishName: n.english_name
      }));
      const filteredData = mappedData.filter((person) => !pendingDeletedIdsRef.current.has(String(person.id)));

      if (requestVersion === nodeFetchVersionRef.current) {
        setFamilyData(filteredData);
      }
      if (markLoaded) setIsLoading(false);
    } catch (error) {
      console.error("Error fetching nodes:", error);
      if (markLoaded) setIsLoading(false);
    } finally {
      nodesSyncInFlightRef.current = false;
    }
  }, []);

  const fetchLatestNotices = useCallback(async () => {
    if (noticesSyncInFlightRef.current) return;
    noticesSyncInFlightRef.current = true;

    try {
      const { data, error } = await supabase
        .from('notices')
        .select('*')
        .order('timestamp', { descending: true })
        .limit(30);

      if (error) throw error;

      const mappedNotices = (data || []).map(n => ({
        ...n,
        targetId: n.target_id,
        targetPersonId: n.target_person_id
      }));
      setNotices(sortNoticesNewestFirst(mappedNotices));
    } catch (error) {
      console.error("Error fetching notices:", error);
    } finally {
      noticesSyncInFlightRef.current = false;
    }
  }, [sortNoticesNewestFirst]);

  const syncVisibleAppData = useCallback(async () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    await Promise.all([
      fetchAllNodes({ markLoaded: false }),
      fetchLatestNotices()
    ]);
  }, [fetchAllNodes, fetchLatestNotices]);

  const removeLocalNoticeById = useCallback((noticeId) => {
    setNotices((prev) => prev.filter((notice) => String(notice.id) !== String(noticeId)));
  }, []);

  // 1. Family Nodes (Initial fetch + Realtime subscription)
  useEffect(() => {
    fetchAllNodes();

    const channel = supabase
      .channel('nodes_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'nodes' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const newDoc = { ...payload.new, fatherId: payload.new.father_id, arabicName: payload.new.arabic_name, englishName: payload.new.english_name };
          if (pendingDeletedIdsRef.current.has(String(newDoc.id))) return;
          setFamilyData(prev => [...prev.filter(p => p.id !== newDoc.id), newDoc]);
        } else if (payload.eventType === 'UPDATE') {
          const updatedDoc = { ...payload.new, fatherId: payload.new.father_id, arabicName: payload.new.arabic_name, englishName: payload.new.english_name };
          if (pendingDeletedIdsRef.current.has(String(updatedDoc.id))) return;
          setFamilyData(prev => prev.map(p => p.id === updatedDoc.id ? updatedDoc : p));
        } else if (payload.eventType === 'DELETE') {
          pendingDeletedIdsRef.current.delete(String(payload.old.id));
          setFamilyData(prev => prev.filter(p => p.id !== payload.old.id));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchAllNodes]);

  // 2. Notices Listener
  useEffect(() => {
    fetchLatestNotices();

    const channel = supabase
      .channel('notices_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notices' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const newNotice = {
            ...payload.new,
            targetId: payload.new.target_id,
            targetPersonId: payload.new.target_person_id
          };

          setNotices((prev) => sortNoticesNewestFirst([newNotice, ...prev]).slice(0, 30));

          if (Date.now() - (newNotice.timestamp || 0) < 15000) {
            showToast(newNotice, 8000);
          }
          return;
        }

        if (payload.eventType === 'UPDATE') {
          const updatedNotice = {
            ...payload.new,
            targetId: payload.new.target_id,
            targetPersonId: payload.new.target_person_id
          };
          setNotices((prev) => sortNoticesNewestFirst([
            updatedNotice,
            ...prev.filter((notice) => String(notice.id) !== String(updatedNotice.id))
          ]).slice(0, 30));
          return;
        }

        if (payload.eventType === 'DELETE') {
          removeLocalNoticeById(payload.old.id);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, [fetchLatestNotices, removeLocalNoticeById, showToast, sortNoticesNewestFirst]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void syncVisibleAppData();
      }
    };

    const handleWindowFocus = () => {
      void syncVisibleAppData();
    };

    const handleOnline = () => {
      void syncVisibleAppData();
    };

    const intervalId = window.setInterval(() => {
      void syncVisibleAppData();
    }, 60000);

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('online', handleOnline);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('online', handleOnline);
    };
  }, [syncVisibleAppData]);

  // 3. Reactive Unread Count Calculation
  useEffect(() => {
    const unread = notices.filter(n => (n.timestamp || 0) > lastNoticeOpen).length;

    setUnreadCount(unread);
  }, [notices, lastNoticeOpen]);

  const getActorId = useCallback(() => {
    if (!currentUser) return 'public';
    return currentUser.id;
  }, [currentUser]);

  const reserveNextNodeIds = useCallback((count = 1) => {
    const numericIds = familyData
      .map((person) => Number(person.id))
      .filter((id) => Number.isFinite(id));
    const startId = (numericIds.length > 0 ? Math.max(...numericIds) : 0) + 1;
    return Array.from({ length: count }, (_, index) => startId + index);
  }, [familyData]);

  const createNotice = useCallback(async ({ text, type, targetId, targetPersonId = null, timestamp = Date.now() }) => {
    const { data, error } = await supabase.from('notices').insert({
      text,
      timestamp,
      type,
      target_id: targetId,
      target_person_id: targetPersonId
    }).select().maybeSingle();
    if (error) console.error("Create Notice Error:", error);
    return data
      ? {
        ...data,
        targetId: data.target_id,
        targetPersonId: data.target_person_id
      }
      : null;
  }, []);

  const removeProposalNoticesLocally = useCallback((person, proposalType = null) => {
    setNotices((prev) => prev.filter((notice) => {
      const noticeTypeMatches = proposalType ? notice.type === proposalType : (
        notice.type === 'proposal_add_child' || notice.type === 'proposal_name_change'
      );

      if (!noticeTypeMatches) return true;

      if (proposalType === 'proposal_add_child' || isPendingAddChildNode(person)) {
        return !(notice.type === 'proposal_add_child' && String(notice.targetId) === String(person.id));
      }

      return !(notice.type === 'proposal_name_change' && String(notice.targetId) === String(person.id));
    }));
  }, []);

  const removeMemberNoticesLocally = useCallback((targetIds) => {
    const targetSet = new Set((targetIds || []).map((id) => String(id)));
    setNotices((prev) => prev.filter((notice) => {
      if (notice.type !== 'new_member') return true;
      return !targetSet.has(String(notice.targetId));
    }));
  }, []);

  const deleteProposalNotices = useCallback(async (person, proposalType = null) => {
    let query = supabase.from('notices').delete();

    if (proposalType === 'proposal_add_child' || isPendingAddChildNode(person)) {
      query = query.eq('type', 'proposal_add_child').eq('target_id', person.id);
    } else {
      query = query.eq('type', 'proposal_name_change').eq('target_id', person.id);
    }

    const { error } = await query;
    if (error) {
      console.error('Delete Proposal Notice Error:', error);
      throw error;
    }

    removeProposalNoticesLocally(person, proposalType);
  }, [removeProposalNoticesLocally]);

  const deleteMemberNotices = useCallback(async (targetIds) => {
    const normalizedIds = (targetIds || []).map((id) => String(id)).filter(Boolean);
    if (normalizedIds.length === 0) return;

    const { error } = await supabase
      .from('notices')
      .delete()
      .eq('type', 'new_member')
      .in('target_id', normalizedIds);

    if (error) {
      console.error('Delete Member Notice Error:', error);
      throw error;
    }

    removeMemberNoticesLocally(normalizedIds);
  }, [removeMemberNoticesLocally]);

  const upsertLocalPerson = useCallback((person) => {
    setFamilyData((prev) => {
      const next = [...prev];
      const index = next.findIndex((item) => String(item.id) === String(person.id));
      if (index >= 0) {
        next[index] = { ...next[index], ...person };
      } else {
        next.push(person);
      }
      return next;
    });
  }, []);

  const patchLocalPerson = useCallback((personId, patch) => {
    setFamilyData((prev) => prev.map((person) => (
      String(person.id) === String(personId)
        ? { ...person, ...patch }
        : person
    )));
  }, []);

  const removeLocalPersons = useCallback((idsToRemove) => {
    const removeSet = new Set(idsToRemove.map((id) => String(id)));
    setFamilyData((prev) => prev.filter((person) => !removeSet.has(String(person.id))));
  }, []);

  const appendLocalNotice = useCallback((notice) => {
    setNotices((prev) => sortNoticesNewestFirst([
      notice,
      ...prev.filter((item) => String(item.id) !== String(notice.id || ''))
    ]).slice(0, 30));
  }, [sortNoticesNewestFirst]);



  // Stable callback for node long-press — prevents child re-renders on every layout recalc
  const handleNodeLongPress = useCallback((nodeId, rawData) => {
    void fetchPublicMemberStatuses();
    setSelectedPerson(rawData);
    setIsModalOpen(true);
  }, [fetchPublicMemberStatuses]); // setSelectedPerson and setIsModalOpen are stable React setState functions

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
        const displayNames = getDisplayNames(person);
        const pending = isPersonPending(person);

        visibleData.push({
          ...person,
          displayArabicName: displayNames.arabicName,
          displayEnglishName: displayNames.englishName,
          isPending: pending,
          pendingType: isPendingAddChildNode(person) ? 'add_child' : (getPendingNameChange(person) ? 'name_change' : null),
          pendingLabel: pending ? t('pendingAdminVerification') : '',
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
  }, [familyData, collapsedStateById, isLoading, collapsingParentId, handleNodeLongPress, appSettings.layoutStyle, t, lang]); // handleNodeLongPress is stable (useCallback [])

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
    stopCameraMotion();
  }, [stopCameraMotion]);

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

  const openPersonModalById = useCallback((personId, options = { targetZoom: 1.2 }) => {
    const targetId = String(personId);
    const person = personMap.get(targetId);
    if (!person) return;

    void fetchPublicMemberStatuses();
    setSelectedPerson(person);
    setIsModalOpen(true);

    const wasHidden = ensurePathVisible(targetId);
    if (wasHidden) {
      setPendingFocusTarget({ id: targetId, options });
    } else {
      const targetNode = nodes.find((node) => node.id === targetId);
      if (targetNode) {
        smoothFocusNode(targetId, options);
      }
    }
  }, [ensurePathVisible, fetchPublicMemberStatuses, nodes, personMap, smoothFocusNode]);

  const getNextPendingIdForAdmin = useCallback((excludeId = null) => {
    if (!isAdmin || pendingQueueIds.length === 0) {
      return null;
    }

    return pendingQueueIds.find((id) => id !== String(excludeId || '')) || null;
  }, [isAdmin, pendingQueueIds]);

  const openNextPendingForAdmin = useCallback((excludeId = null) => {
    if (!isAdmin || pendingQueueIds.length === 0) {
      adminWalkthroughEnabledRef.current = false;
      return false;
    }

    const nextId = getNextPendingIdForAdmin(excludeId);
    if (!nextId) {
      adminWalkthroughEnabledRef.current = false;
      return false;
    }

    openPersonModalById(nextId, { targetZoom: 1.25 });
    return true;
  }, [getNextPendingIdForAdmin, isAdmin, openPersonModalById, pendingQueueIds]);

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

  useEffect(() => {
    if (isAdmin && !wasAdminRef.current) {
      adminWalkthroughEnabledRef.current = true;
      if (pendingQueueIds.length > 0) {
        openNextPendingForAdmin();
      }
    }

    if (!isAdmin) {
      adminWalkthroughEnabledRef.current = false;
    }

    wasAdminRef.current = isAdmin;
  }, [isAdmin, openNextPendingForAdmin, pendingQueueIds]);

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

    // Step 0: ensure the tree is forcefully collapsed before cinematic starts.
    const hasBeenForced = sessionStorage.getItem('rf-cinematic-forced');
    if (!hasBeenForced) {
      const parentToChildrenMap = buildParentToChildrenMap(familyData);

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
      setCollapsedIds([String(rootPerson.id), ...descendants], true);
      sessionStorage.setItem('rf-cinematic-forced', '1');
      return;
    }

    runIntroStrategy(INTRO_STRATEGY, rootPerson);
  }, [buildParentToChildrenMap, familyData, initialViewport, isLoading, nodes, runIntroStrategy, setCollapsedIds]);



  const getNasabDesc = (person) => {
    let parts = [];
    let current = personMap.get(String(person.fatherId)); // O(1) vs O(N) find()
    let count = 0;
    while (current && count < 2) {
      const currentDisplay = getDisplayNames(current);
      parts.push(lang === 'ar' ? currentDisplay.arabicName : (currentDisplay.englishName || currentDisplay.arabicName));
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
      setSearchSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    if (val.length >= 3) {
      const queryLatin = cleanText(val.toLowerCase());
      const queryArab = cleanText(normalizeArabic(val));
      const queryLower = val.toLowerCase();

      const suggestions = searchIndex
        .filter((entry) =>
          entry.info.includes(queryLower) ||
          (queryLatin.length > 0 && entry.lineageLatin.startsWith(queryLatin)) ||
          (queryArab.length > 0 && entry.lineageArab.startsWith(queryArab)) ||
          cleanText((entry.englishName || '').toLowerCase()).includes(queryLatin) ||
          cleanText(normalizeArabic(entry.arabicName || '')).includes(queryArab)
        )
        .slice(0, 10)
        .map((entry) => personMap.get(String(entry.id)))
        .filter(Boolean);

      setSearchSuggestions(suggestions);
      setShowSuggestions(suggestions.length > 0);
    } else {
      setSearchSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const selectSuggestion = (person) => {
    const displayNames = getDisplayNames(person);
    setSearchQuery(displayNames.englishName || displayNames.arabicName);
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

  // ----- SUPABASE CRUD -----

  const handleAddChild = useCallback(async (parent, childrenList) => {
    if (!isAdmin) return;
    try {
      const list = Array.isArray(childrenList) ? childrenList : [childrenList];
      const reservedIds = reserveNextNodeIds(list.length);

      for (const [index, child] of list.entries()) {
        const { englishName, arabicName } = child;

        const { data: newNodes, error: nodeError } = await supabase
          .from('nodes')
          .insert({
            id: reservedIds[index],
            english_name: englishName,
            arabic_name: arabicName,
            father_id: parent.id,
            info: ''
          })
          .select();

        if (nodeError) throw nodeError;
        const createdNode = {
          ...newNodes[0],
          fatherId: newNodes[0].father_id,
          arabicName: newNodes[0].arabic_name,
          englishName: newNodes[0].english_name
        };
        const newNodeId = createdNode.id;
        upsertLocalPerson(createdNode);

        // CREATE NOTICE
        const grandfather = familyData.find(p => p.id === parent.fatherId);
        const gfName = grandfather ? (lang === 'ar' ? grandfather.arabicName : grandfather.englishName) : '-';
        const fatherName = lang === 'ar' ? parent.arabicName : parent.englishName;
        const childName = lang === 'ar' ? arabicName : englishName;

        const noticeText = buildNoticeText({
          type: 'new_member',
          lang,
          personName: childName,
          parentName: fatherName,
          grandParentName: gfName !== '-' ? gfName : ''
        });

        const notice = await createNotice({
          text: noticeText,
          timestamp: Date.now(),
          type: 'new_member',
          targetId: newNodeId,
          targetPersonId: newNodeId
        });
        if (notice) appendLocalNotice(notice);
      }
    } catch (err) {
      console.error(err);
      alert(t('addFailed'));
      throw err;
    }
  }, [appendLocalNotice, createNotice, familyData, lang, t, isAdmin, reserveNextNodeIds, upsertLocalPerson]);

  const handleUpdateChild = async (childId, updates) => {
    if (!isAdmin) return;
    try {
      const dbUpdates = {};
      if (updates.englishName !== undefined) dbUpdates.english_name = updates.englishName;
      if (updates.arabicName !== undefined) dbUpdates.arabic_name = updates.arabicName;
      if (updates.info !== undefined) dbUpdates.info = updates.info;
      if (updates.fatherId !== undefined) dbUpdates.father_id = updates.fatherId;
      if (updates.moderation !== undefined) dbUpdates.moderation = updates.moderation;

      const { error } = await supabase
        .from('nodes')
        .update(dbUpdates)
        .eq('id', childId);

      if (error) throw error;
      patchLocalPerson(childId, updates);
      await fetchAllNodes({ markLoaded: false });
    } catch (err) {
      console.error(err);
      alert(t('updateFailed'));
      throw err;
    }
  };

  const handleRemoveChild = async (childId) => {
    if (!isAdmin) return;
    let idsToDelete = [];
    try {
      const parentToChildrenMap = new Map();
      familyData.forEach((person) => {
        const fatherId = person.fatherId ? String(person.fatherId) : null;
        if (!fatherId) return;
        if (!parentToChildrenMap.has(fatherId)) parentToChildrenMap.set(fatherId, []);
        parentToChildrenMap.get(fatherId).push(String(person.id));
      });

      const gatherDescendantIds = (parentId) => {
        const directChildren = parentToChildrenMap.get(String(parentId)) || [];
        return directChildren.flatMap((descendantId) => [descendantId, ...gatherDescendantIds(descendantId)]);
      };

      idsToDelete = [String(childId), ...gatherDescendantIds(childId)];
      idsToDelete.forEach((id) => pendingDeletedIdsRef.current.add(String(id)));
      removeLocalPersons(idsToDelete);
      removeMemberNoticesLocally(idsToDelete);

      if (selectedPerson && idsToDelete.includes(String(selectedPerson.id))) {
        setIsModalOpen(false);
      }

      const { error } = await supabase
        .from('nodes')
        .delete()
        .in('id', idsToDelete);

      if (error) throw error;
      await deleteMemberNotices(idsToDelete);
      await fetchAllNodes({ markLoaded: false });
      idsToDelete.forEach((id) => pendingDeletedIdsRef.current.delete(String(id)));
    } catch (err) {
      console.error(err);
      idsToDelete.forEach((id) => pendingDeletedIdsRef.current.delete(String(id)));
      await Promise.all([
        fetchAllNodes({ markLoaded: false }),
        fetchLatestNotices()
      ]);
      alert(t('deleteFailed'));
      throw err;
    }
  };

  const handleSubmitChildSuggestion = useCallback(async (parent, childrenList) => {
    try {
      const list = Array.isArray(childrenList) ? childrenList : [childrenList];
      const actorId = getActorId();
      const now = Date.now();
      const reservedIds = reserveNextNodeIds(list.length);

      await Promise.all(list.map(async (child, index) => {
        const { data: newNodes, error: nodeError } = await supabase
          .from('nodes')
          .insert({
            id: reservedIds[index],
            english_name: child.englishName || '',
            arabic_name: child.arabicName || '',
            father_id: parent.id,
            info: '',
            moderation: {
              status: 'pending',
              type: 'add_child',
              createdAt: now,
              updatedAt: now,
              createdBy: actorId,
              lastEditedBy: actorId
            }
          })
          .select();

        if (nodeError) throw nodeError;
        const createdNode = {
          ...newNodes[0],
          fatherId: newNodes[0].father_id,
          arabicName: newNodes[0].arabic_name,
          englishName: newNodes[0].english_name
        };
        const newNodeId = createdNode.id;
        upsertLocalPerson(createdNode);

        const parentDisplay = getDisplayNames(parent);
        const grandParent = parent.fatherId ? personMap.get(String(parent.fatherId)) : null;
        const grandParentDisplay = grandParent ? getDisplayNames(grandParent) : null;
        const noticeChildName = lang === 'ar' ? (child.arabicName || '') : (child.englishName || child.arabicName || '');
        const parentName = lang === 'ar'
          ? parentDisplay.arabicName
          : (parentDisplay.englishName || parentDisplay.arabicName);
        const grandParentName = grandParentDisplay
          ? (lang === 'ar' ? grandParentDisplay.arabicName : (grandParentDisplay.englishName || grandParentDisplay.arabicName))
          : '';

        const notice = await createNotice({
          text: buildNoticeText({
            type: 'proposal_add_child',
            lang,
            personName: noticeChildName,
            parentName,
            grandParentName
          }),
          type: 'proposal_add_child',
          targetId: newNodeId,
          targetPersonId: parent.id,
          timestamp: now
        });
        if (notice) appendLocalNotice(notice);
      }));
      alert(t('suggestionSaved'));
    } catch (err) {
      console.error(err);
      alert(`${t('addFailed')} ${err?.message || ''}`.trim());
      throw err;
    }
  }, [appendLocalNotice, createNotice, getActorId, lang, personMap, reserveNextNodeIds, t, upsertLocalPerson]);

  const handleSubmitNameSuggestion = useCallback(async (personId, updates) => {
    try {
      const actorId = getActorId();
      const now = Date.now();
      const currentPerson = personMap.get(String(personId));
      if (!currentPerson) return;

      const { data, error } = await supabase
        .from('nodes')
        .update({
          moderation: {
            ...(currentPerson.moderation || {}),
            nameChange: {
              status: 'pending',
              proposedEnglishName: updates.englishName || '',
              proposedArabicName: updates.arabicName || '',
              createdAt: now,
              updatedAt: now,
              createdBy: actorId,
              lastEditedBy: actorId
            }
          }
        })
        .eq('id', personId)
        .select('id')
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Name suggestion update was blocked or did not affect any row.');
      const nextModeration = {
        ...(currentPerson.moderation || {}),
        nameChange: {
          status: 'pending',
          proposedEnglishName: updates.englishName || '',
          proposedArabicName: updates.arabicName || '',
          createdAt: now,
          updatedAt: now,
          createdBy: actorId,
          lastEditedBy: actorId
        }
      };
      patchLocalPerson(personId, { moderation: nextModeration });

      const currentDisplay = getDisplayNames(currentPerson);
      const notice = await createNotice({
        text: buildNoticeText({
          type: 'proposal_name_change',
          lang,
          personName: lang === 'ar'
            ? (currentDisplay.arabicName || updates.arabicName || '')
            : (currentDisplay.englishName || currentDisplay.arabicName || updates.englishName || updates.arabicName || '')
        }),
        type: 'proposal_name_change',
        targetId: personId,
        targetPersonId: personId,
        timestamp: now
      });
      if (notice) appendLocalNotice(notice);
      alert(t('suggestionSaved'));
    } catch (err) {
      console.error(err);
      alert(`${t('updateFailed')} ${err?.message || ''}`.trim());
      throw err;
    }
  }, [appendLocalNotice, createNotice, getActorId, lang, patchLocalPerson, personMap, t]);

  const handleUpdateProposal = async (person, updates) => {
    try {
      const actorId = getActorId();
      const now = Date.now();

      if (isPendingAddChildNode(person)) {
        const { data, error } = await supabase
          .from('nodes')
          .update({
            english_name: updates.englishName || '',
            arabic_name: updates.arabicName || '',
            moderation: {
              ...(person.moderation || {}),
              updatedAt: now,
              lastEditedBy: actorId
            }
          })
          .eq('id', person.id)
          .select('id')
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('Pending child suggestion update was blocked or did not affect any row.');
        patchLocalPerson(person.id, {
          englishName: updates.englishName || '',
          arabicName: updates.arabicName || '',
          moderation: {
            ...(person.moderation || {}),
            updatedAt: now,
            lastEditedBy: actorId
          }
        });
      } else if (getPendingNameChange(person)) {
        const { data, error } = await supabase
          .from('nodes')
          .update({
            moderation: {
              ...(person.moderation || {}),
              nameChange: {
                ...(person.moderation?.nameChange || {}),
                proposedEnglishName: updates.englishName || '',
                proposedArabicName: updates.arabicName || '',
                updatedAt: now,
                lastEditedBy: actorId
              }
            }
          })
          .eq('id', person.id)
          .select('id')
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('Pending name suggestion update was blocked or did not affect any row.');
        patchLocalPerson(person.id, {
          moderation: {
            ...(person.moderation || {}),
            nameChange: {
              ...(person.moderation?.nameChange || {}),
              proposedEnglishName: updates.englishName || '',
              proposedArabicName: updates.arabicName || '',
              updatedAt: now,
              lastEditedBy: actorId
            }
          }
        });
      }
      alert(t('suggestionUpdated'));
    } catch (err) {
      console.error(err);
      alert(t('updateFailed'));
      throw err;
    }
  };

  const handleCancelProposal = async (person) => {
    try {
      if (isPendingAddChildNode(person)) {
        const { error } = await supabase.from('nodes').delete().eq('id', person.id);
        if (error) throw error;
        removeLocalPersons([person.id]);
        await deleteProposalNotices(person, 'proposal_add_child');
      } else if (getPendingNameChange(person)) {
        const newMod = { ...(person.moderation || {}) };
        delete newMod.nameChange;
        const { error } = await supabase.from('nodes').update({ moderation: newMod }).eq('id', person.id);
        if (error) throw error;
        patchLocalPerson(person.id, { moderation: newMod });
        await deleteProposalNotices(person, 'proposal_name_change');
      }
      alert(t('suggestionCanceled'));
    } catch (err) {
      console.error(err);
      alert(t('deleteFailed'));
      throw err;
    }
  };

  const handleApproveProposal = async (person) => {
    if (!canModerateProposals) return;
    try {
      if (isPendingAddChildNode(person)) {
        const newMod = { ...(person.moderation || {}), status: 'approved', updatedAt: Date.now() };
        const { error } = await supabase.from('nodes').update({ moderation: newMod }).eq('id', person.id);
        if (error) throw error;
        patchLocalPerson(person.id, { moderation: newMod });
        await deleteProposalNotices(person, 'proposal_add_child');
      } else {
        const pendingNameChange = getPendingNameChange(person);
        if (!pendingNameChange) return;
        const newMod = { ...(person.moderation || {}) };
        delete newMod.nameChange;
        const { error } = await supabase.from('nodes').update({
          english_name: pendingNameChange.proposedEnglishName || '',
          arabic_name: pendingNameChange.proposedArabicName || '',
          moderation: newMod
        }).eq('id', person.id);
        if (error) throw error;
        patchLocalPerson(person.id, {
          englishName: pendingNameChange.proposedEnglishName || '',
          arabicName: pendingNameChange.proposedArabicName || '',
          moderation: newMod
        });
        await deleteProposalNotices(person, 'proposal_name_change');
      }
      alert(t('suggestionApproved'));
      if (isAdmin) {
        continueAdminVerification(person.id);
      }
    } catch (err) {
      console.error(err);
      alert(t('updateFailed'));
      throw err;
    }
  };

  const handleRejectProposal = async (person) => {
    if (!isAdmin) return;
    try {
      if (isPendingAddChildNode(person)) {
        const { error } = await supabase.from('nodes').delete().eq('id', person.id);
        if (error) throw error;
        removeLocalPersons([person.id]);
        await deleteProposalNotices(person, 'proposal_add_child');
      } else if (getPendingNameChange(person)) {
        const newMod = { ...(person.moderation || {}) };
        delete newMod.nameChange;
        const { error } = await supabase.from('nodes').update({ moderation: newMod }).eq('id', person.id);
        if (error) throw error;
        patchLocalPerson(person.id, { moderation: newMod });
        await deleteProposalNotices(person, 'proposal_name_change');
      }
      alert(t('suggestionRejected'));
      continueAdminVerification(person.id);
    } catch (err) {
      console.error(err);
      alert(t('deleteFailed'));
      throw err;
    }
  };

  const seedDatabase = async () => {
    if (!isAdmin) return;
    try {
      const payload = initialFamilyData.map(({ id, englishName, arabicName, fatherId, info }) => ({
        id,
        english_name: englishName || '',
        arabic_name: arabicName || '',
        father_id: fatherId || null,
        info: info || ''
      }));
      const { error } = await supabase.from('nodes').insert(payload);
      if (error) throw error;
      await fetchAllNodes({ markLoaded: false });
      alert(t('seedSuccess'));
    } catch (error) {
      console.error(error);
      alert(t('seedFailed'));
    }
  };

  const refreshMemberData = useCallback(async () => {
    await fetchPublicMemberStatuses();
    await resolveMemberContext(currentUser);
  }, [currentUser, fetchPublicMemberStatuses, resolveMemberContext]);

  // ----- MEMBER / AUTH LOGIC -----

  const handleSignIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      if (error.message?.toLowerCase().includes('invalid login credentials')) {
        throw new Error(t('invalidCredentials'));
      }
      throw new Error(error.message || t('invalidCredentials'));
    }
    const context = await resolveMemberContext(data?.user || null);
    if (context?.member?.claim_status === 'pending') {
      alert(t('signInPendingClaim'));
    }
    setActiveInfoModal(null);
  };

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    const { error: anonError } = await supabase.auth.signInAnonymously();
    if (anonError) throw anonError;
  };



  const handleChangePassword = async (newPassword) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      throw new Error(error.message || 'Failed to change password.');
    }
    alert(t('passwordChangedSuccess'));
    setActiveInfoModal(null);
  };

  const handleUpdateProfile = async ({ phone, city, country }) => {
    if (!currentMember?.id) return;
    const trimmedPhone = (phone || '').trim();
    const trimmedCity = (city || '').trim();
    const trimmedCountry = (country || '').trim();
    if (!trimmedPhone || !trimmedCity) {
      throw new Error(t('fillAllFields'));
    }

    const { data, error } = await supabase
      .from('baraja_member')
      .update({
        phone: trimmedPhone,
        city: trimmedCity,
        country: trimmedCountry
      })
      .eq('id', currentMember.id)
      .select('*')
      .maybeSingle();

    if (error) {
      throw new Error(error.message || t('updateFailed'));
    }

    setCurrentMember(data || null);
    setMemberRecords((prev) => prev.map((item) => (item.id === data?.id ? data : item)));
    showToast({ text: t('profileUpdated') });
    setActiveInfoModal(null);
  };

  const handleSubmitMemberClaim = useCallback(async (person, payload) => {
    const email = (payload.email || '').trim().toLowerCase();
    const password = payload.password || '';
    const phone = (payload.phone || '').trim();
    const city = (payload.city || '').trim();

    if (!email || !password || !phone || !city) {
      throw new Error(t('fillAllFields'));
    }
    if (password.length < 6) {
      throw new Error(t('passwordMinLengthRule'));
    }
    if (currentMember?.claim_status === 'pending') {
      throw new Error(t('alreadyHavePendingClaim'));
    }
    if (currentMember?.claim_status === 'approved') {
      throw new Error(t('alreadyConnectedMember'));
    }
    if ((memberStatuses[String(person.id)] || 'none') !== 'none') {
      throw new Error(
        memberStatuses[String(person.id)] === 'approved'
          ? t('personConnectedToMember')
          : t('personVerificationInProgress')
      );
    }

    let authUser = null;
    const signUpResult = await supabase.auth.signUp({
      email,
      password
    });

    if (signUpResult.error) {
      const message = signUpResult.error.message || '';
      const alreadyRegistered = message.toLowerCase().includes('already registered');

      if (!alreadyRegistered) {
        throw new Error(message || t('claimFailed'));
      }

      const signInResult = await supabase.auth.signInWithPassword({ email, password });
      if (signInResult.error) {
        throw new Error(signInResult.error.message || t('invalidCredentials'));
      }
      authUser = signInResult.data?.user || null;
      alert(t('existingAccountContinueClaim'));
    } else {
      authUser = signUpResult.data?.user || null;
      if (!signUpResult.data?.session) {
        const signInResult = await supabase.auth.signInWithPassword({ email, password });
        if (signInResult.error) {
          throw new Error(signInResult.error.message || t('claimFailed'));
        }
        authUser = signInResult.data?.user || authUser;
      }
    }

    if (!authUser?.id) {
      throw new Error(t('claimFailed'));
    }

    const { data: existingMember, error: existingMemberError } = await supabase
      .from('baraja_member')
      .select('*')
      .eq('auth_user_id', authUser.id)
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (existingMemberError) {
      throw new Error(existingMemberError.message || t('claimFailed'));
    }

    if (existingMember?.claim_status === 'pending') {
      await resolveMemberContext(authUser);
      await fetchPublicMemberStatuses();
      throw new Error(t('alreadyHavePendingClaim'));
    }

    if (existingMember?.claim_status === 'approved') {
      await resolveMemberContext(authUser);
      await fetchPublicMemberStatuses();
      throw new Error(t('alreadyConnectedMember'));
    }

    const memberPayload = {
      auth_user_id: authUser.id,
      person_id: String(person.id),
      email,
      phone,
      city,
      claim_status: 'pending',
      member_level: 'guest',
      arabic_name_snapshot: person.arabicName || '',
      english_name_snapshot: person.englishName || ''
    };

    const memberWriteQuery = existingMember
      ? supabase.from('baraja_member').update(memberPayload).eq('id', existingMember.id)
      : supabase.from('baraja_member').insert(memberPayload);

    const { error } = await memberWriteQuery;

    if (error) {
      throw new Error(error.message || t('claimFailed'));
    }

    await fetchPublicMemberStatuses();
    await resolveMemberContext(authUser);
    alert(t('claimSaved'));
  }, [currentMember, fetchPublicMemberStatuses, memberStatuses, resolveMemberContext, t]);

  const handleApproveMember = useCallback(async (member) => {
    const { error } = await supabase.rpc('approve_baraja_member_claim', {
      target_member_id: member.id
    });

    if (error) {
      throw new Error(error.message || t('updateFailed'));
    }

    await refreshMemberData();
    alert(t('memberApproved'));
  }, [refreshMemberData, t]);

  const handleRejectMember = useCallback(async (member) => {
    const { error } = await supabase
      .from('baraja_member')
      .delete()
      .eq('id', member.id)
      .eq('claim_status', 'pending');

    if (error) {
      throw new Error(error.message || t('deleteFailed'));
    }

    await refreshMemberData();
    alert(t('memberRejected'));
  }, [refreshMemberData, t]);

  const handlePromoteAdmin = useCallback(async (member) => {
    const { error } = await supabase.rpc('promote_baraja_member_admin', {
      target_member_id: member.id
    });

    if (error) {
      throw new Error(error.message || t('updateFailed'));
    }

    await refreshMemberData();
    alert(t('adminPromoted'));
  }, [refreshMemberData, t]);

  const handleMenuClick = (item) => {
    if (item === 'Settings') setActiveInfoModal('settings');
    if (item === 'Sign In') setActiveInfoModal('signin');
    if (item === 'About') setActiveInfoModal('about');
    if (item === 'Profile') setActiveInfoModal('profile');
    if (item === 'Member Manager') {
      void fetchManageableMembers();
      setActiveInfoModal('memberManager');
    }
    if (item === 'List Member') {
      void fetchManageableMembers('admin');
      setActiveInfoModal('listMember');
    }
    if (item === 'List Admin') {
      void fetchManageableMembers('admin');
      setActiveInfoModal('listAdmin');
    }
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

  const handleModalClose = useCallback(() => {
    adminWalkthroughEnabledRef.current = false;
    setIsModalOpen(false);
    setSelectedPerson(null);
  }, []);

  const handleSkipPending = useCallback((personId) => {
    if (!isAdmin) return;
    adminWalkthroughEnabledRef.current = true;
    const hasNextPending = openNextPendingForAdmin(personId);
    if (!hasNextPending) {
      setIsModalOpen(false);
      setSelectedPerson(null);
    }
  }, [isAdmin, openNextPendingForAdmin]);

  const continueAdminVerification = useCallback((currentPersonId) => {
    if (!isAdmin) return;
    adminWalkthroughEnabledRef.current = true;
    setIsModalOpen(false);
    setSelectedPerson(null);
    setTimeout(() => {
      openNextPendingForAdmin(currentPersonId);
    }, 250);
  }, [isAdmin, openNextPendingForAdmin]);


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

    const ancestorChain = [selectedId];
    let climbId = selectedPerson?.fatherId || null;
    let safety = 0;
    while (climbId && safety < 200) {
      const normalizedId = String(climbId);
      ancestorChain.push(normalizedId);
      climbId = personMapLocal.get(normalizedId)?.fatherId || null;
      safety += 1;
    }

    // Tutup modal, lalu jalankan tur kamera dari selected node ke atas hingga framing akhir pas.
    setIsModalOpen(false);
    runLineageCameraTour(selectedId, ancestorChain);
  }, [familyData, calculateAncestorPath, runLineageCameraTour]);

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
            onFocus={() => { if (searchQuery.length >= 3) setShowSuggestions(true) }}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          />
          {showSuggestions && searchSuggestions.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--panel-bg)', borderRadius: '8px', border: '1px solid var(--panel-border)', marginTop: '12px', padding: '4px', maxHeight: '250px', overflowY: 'auto' }}>
              {searchSuggestions.map(s => (
                <div key={s.id} onClick={() => selectSuggestion(s)} className="suggestion-item" style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--panel-border)' }}>
                  <div style={{ fontWeight: 'bold' }}>{lang === 'ar' ? getDisplayNames(s).arabicName : (getDisplayNames(s).englishName || getDisplayNames(s).arabicName)}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    {(lang === 'ar' ? getDisplayNames(s).arabicName : (getDisplayNames(s).englishName || getDisplayNames(s).arabicName)) + getNasabDesc(s)}
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
    if (!isAdmin) return;
    try {
      const { error } = await supabase.from('notices').delete().eq('id', id);
      if (error) throw error;
      removeLocalNoticeById(id);
    } catch (err) {
      console.error("Delete Notice Error:", err);
    }
  };

  return (
    <div className={`app-root-container ${!appSettings.animationsEnabled ? 'no-animations' : ''}`}>
      <MobileHeader
        title={t('appName')}
        onMenuClick={handleMenuClick}
        t={t}
        lang={lang}
        currentUser={isSignedInUser ? currentUser : null}
        role={effectiveRole}
        unreadCount={unreadCount}
      />

      <WebsiteHeader
        onMenuClick={handleMenuClick}
        t={t}
        lang={lang}
        currentUser={isSignedInUser ? currentUser : null}
        role={effectiveRole}
        unreadCount={unreadCount}
      >
        {renderSearchForm()}
      </WebsiteHeader>

      <InfoModal
        isOpen={!!activeInfoModal}
        onClose={() => setActiveInfoModal(null)}
        type={activeInfoModal}
        title={t(
          activeInfoModal === 'signin' ? 'signIn'
            : activeInfoModal === 'about' ? 'about'
              : activeInfoModal === 'notice' ? 'notice'
                  : activeInfoModal === 'profile' ? 'profile'
                    : activeInfoModal === 'memberManager' ? 'memberManager'
                      : activeInfoModal === 'listMember' ? 'listMember'
                        : activeInfoModal === 'listAdmin' ? 'listAdmin'
                      : 'settings'
        )}
        t={t}
        lang={lang}
        onSignIn={handleSignIn}
        onChangePassword={handleChangePassword}
        currentUser={isSignedInUser ? currentUser : null}
        currentMember={currentMember}
        currentRole={effectiveRole}
        familyData={familyData}
        notices={notices}
        onViewNotice={handleViewNotice}
        onDeleteNotice={handleDeleteNotice}
        appSettings={appSettings}
        setAppSettings={setAppSettings}
        onUpdateProfile={handleUpdateProfile}
        memberClaims={pendingMemberClaims}
        verifiedMembers={verifiedMembers}
        adminMembers={adminMembers}
        onApproveMember={handleApproveMember}
        onRejectMember={handleRejectMember}
        onPromoteAdmin={handlePromoteAdmin}
        loadingMembers={isMemberDataLoading}
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
      {!isLoading && familyData.length === 0 && isAdmin && (
        <button className="theme-toggle top-actions" onClick={seedDatabase} title={t('seedTooltip')} style={{ top: 24, right: 24, color: 'var(--accent)' }}>
          <Database size={20} />
        </button>
      )}

      <NodeEditModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        person={selectedPerson}
        familyData={familyData}
        onAddChild={handleAddChild}
        onUpdateChild={handleUpdateChild}
        onRemoveChild={handleRemoveChild}
        onViewPerson={handleViewPerson}
        onShowLineageOnly={handleShowLineageOnly}
        onSubmitChildSuggestion={handleSubmitChildSuggestion}
        onSubmitNameSuggestion={handleSubmitNameSuggestion}
        onUpdateProposal={handleUpdateProposal}
        onCancelProposal={handleCancelProposal}
        onApproveProposal={handleApproveProposal}
        onRejectProposal={handleRejectProposal}
        onSkipPending={handleSkipPending}
        lang={lang}
        t={t}
        currentUser={currentUser}
        isAdmin={isAdmin}
        canModerateProposals={canModerateProposals}
        currentRole={effectiveRole}
        memberClaimStatus={selectedPerson ? (memberStatuses[String(selectedPerson.id)] || 'none') : 'none'}
        allowMemberClaim={effectiveRole === 'guest' && (!currentMember || ['rejected', 'cancelled'].includes(currentMember.claim_status))}
        currentMemberClaimStatus={currentMember?.claim_status || 'none'}
        onSubmitMemberClaim={handleSubmitMemberClaim}
      />

      {/* Only show standalone search for Android (since it's in the header for Web) */}
      {Capacitor.getPlatform() === 'android' && renderSearchForm()}

      <div className={`graph-workspace ${Capacitor.getPlatform()}`} style={{ width: '100%', height: '100%', pointerEvents: isIntroRunning ? 'none' : 'auto' }} onDoubleClick={onPaneDoubleClick}>
        {isLoading ? (
          <LoadingScreen t={t} />
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
              if (e && e.type !== 'animation') {
                stopCameraMotion();
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
            <Background color="var(--grid-color)" gap={24} size={2} />
            <Controls position="bottom-right" showInteractive={false} showFitView={false}>
              <button
                className="react-flow__controls-button"
                onClick={handleCustomFitView}
                title={t('fitView')}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Maximize size={14} />
              </button>
              <button
                className="react-flow__controls-button"
                onClick={handleExpandAll}
                title={expandClickCount === 0 ? t('expandAll') : t('expandAllHint')}
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
                title={navDirection === 'right' ? t('goToRightmost') : t('goToLeftmost')}
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
