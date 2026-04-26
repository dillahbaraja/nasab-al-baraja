import React, { Suspense, lazy, useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
import { Search, Palette, Database, Bell, ListTree, Maximize, Camera } from 'lucide-react';
import { initialFamilyData, generateEdges } from './data';
import { getLayoutedElements, createNodesFromData } from './layout';
import { supabase } from './supabase';
import { translations } from './i18n';
import WebsiteHeader from './components/WebsiteHeader';
import { nodeTypes } from './reactFlowTypes';
import GraphErrorBoundary from './components/GraphErrorBoundary';

const LazyNodeEditModal = lazy(() => import('./NodeEditModal'));
const LazyInfoModal = lazy(() => import('./components/InfoModals'));

const readStorage = (storageName, key, fallback = null) => {
  try {
    if (typeof window === 'undefined') return fallback;
    const storage = window[storageName];
    if (!storage) return fallback;
    const value = storage.getItem(key);
    return value === null ? fallback : value;
  } catch {
    return fallback;
  }
};

const writeStorage = (storageName, key, value) => {
  try {
    if (typeof window === 'undefined') return;
    const storage = window[storageName];
    if (!storage) return;
    storage.setItem(key, value);
  } catch {
    // Ignore storage failures on restrictive browsers like iOS private mode.
  }
};

const clearStorage = (storageName) => {
  try {
    if (typeof window === 'undefined') return;
    const storage = window[storageName];
    if (!storage) return;
    storage.clear();
  } catch {
    // Ignore storage failures on restrictive browsers like iOS private mode.
  }
};

const wouldCreateFatherCycle = (familyList, childId, nextFatherId) => {
  if (!nextFatherId) return false;

  const childKey = String(childId);
  const targetKey = String(nextFatherId);
  if (childKey === targetKey) return true;

  const personMap = new Map(familyList.map((person) => [String(person.id), person]));
  let currentId = targetKey;
  let guard = 0;

  while (currentId && guard < 200) {
    if (currentId === childKey) return true;
    currentId = personMap.get(currentId)?.fatherId ? String(personMap.get(currentId).fatherId) : null;
    guard += 1;
  }

  return false;
};

const TimeoutWarning = () => {
  const lang = readStorage('localStorage', 'rf-lang', 'en');
  const translate = (key) => translations[key]?.[lang] || translations[key]?.en || key;
  const [show, setShow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShow(true), 5000);
    return () => clearTimeout(timer);
  }, []);

  const handleReset = async () => {
    clearStorage('localStorage');
    clearStorage('sessionStorage');
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

const SCREENSHOT_BUTTON_ENABLED = false;

const escapeXml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

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

  if (type === 'admin_name_change') {
    if (lang === 'ar') return `تعديل الاسم من الإدارة لـ ${personName}`;
    if (lang === 'id') return `Perubahan nama oleh admin untuk ${personName}`;
    return `Admin name update for ${personName}`;
  }

  if (lang === 'ar') return `${personName} بن ${parentName}${grandParentName ? ` بن ${grandParentName}` : ''}`;
  return `${personName} bin ${parentName}${grandParentName ? ` bin ${grandParentName}` : ''}`;
};

const FamilyGraph = () => {
  const [theme, setTheme] = useState(() => readStorage('localStorage', 'rf-theme', 'light'));
  const [lang, setLang] = useState(() => readStorage('localStorage', 'rf-lang', 'en'));
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
  const openNodeDetailsTimeoutRef = useRef(null);
  const lineageTourTokenRef = useRef(0);
  const introTimeoutsRef = useRef([]);
  const [collapsedStateById, setCollapsedStateById] = useState(() => {
    try {
      const saved = readStorage('localStorage', 'rf-collapsed-state', null);
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });

  useEffect(() => {
    writeStorage('localStorage', 'rf-collapsed-state', JSON.stringify(collapsedStateById));
  }, [collapsedStateById]);

  useEffect(() => {
    return () => {
      introTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
      introTimeoutsRef.current = [];
      if (openNodeDetailsTimeoutRef.current) {
        clearTimeout(openNodeDetailsTimeoutRef.current);
        openNodeDetailsTimeoutRef.current = null;
      }
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
        searchDebounceRef.current = null;
      }
      if (resumeSyncTimeoutRef.current) {
        clearTimeout(resumeSyncTimeoutRef.current);
        resumeSyncTimeoutRef.current = null;
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, []);

  const glowTimeoutRef = useRef(null);
  const lastGlowNodeIdRef = useRef(null);
  const mobilePathGlowEnabledRef = useRef(false);
  const prevVisibleSetRef = useRef(new Set());
  const expandAllViewportCenterLockRef = useRef(null);
  const hasInitialFocusedRef = useRef(false); // tracks first-load root focus

  const t = useCallback((key) => translations[key]?.[lang] || translations[key]?.['en'] || key, [lang]);
  const isMobileDevice = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    return /iPhone|iPod|Android/i.test(navigator.userAgent)
      || (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)')?.matches);
  }, []);
  const setAncestorPathSafe = useCallback((nextPath) => {
    if (isMobileDevice) return;
    setAncestorPath(nextPath);
  }, [isMobileDevice]);
  const clearAncestorPathSafe = useCallback(() => {
    mobilePathGlowEnabledRef.current = false;
    setAncestorPath({ nodeIds: new Set(), edgeIds: new Set() });
  }, []);

  const clearMobileRelationshipFocus = useCallback(() => {
    setMobileRelationshipFocus(null);
  }, []);

  const setAncestorPathForMobile = useCallback((nextPath) => {
    if (!isMobileDevice) {
      setAncestorPath(nextPath);
      return;
    }

    mobilePathGlowEnabledRef.current = true;
    setAncestorPath(nextPath);
  }, [isMobileDevice]);

  // Memoized O(1) person lookup map — replaces O(N) familyData.find() calls
  const personMap = useMemo(() => {
    const map = new Map();
    familyData.forEach(p => map.set(String(p.id), p));
    return map;
  }, [familyData]);

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
  const [lastNoticeOpen, setLastNoticeOpen] = useState(() => Number(readStorage('localStorage', 'rf-last-notice-open', '0')) || 0);
  const [toast, setToast] = useState(null);
  const toastTimeoutRef = useRef(null);
  const [isCapturingScreenshot, setIsCapturingScreenshot] = useState(false);
  const nodesSyncInFlightRef = useRef(false);
  const nodeFetchVersionRef = useRef(0);
  const noticesSyncInFlightRef = useRef(false);
  const exportModulesRef = useRef(null);
  const pendingDeletedIdsRef = useRef(new Set());
  const lastVisibleSyncAtRef = useRef(0);
  const hiddenSinceRef = useRef(null);
  const [pendingFocusTarget, setPendingFocusTarget] = useState(null);
  const [visibleNoticeTargetId, setVisibleNoticeTargetId] = useState(null);
  const [toggledNodeInfo, setToggledNodeInfo] = useState(null); // { id, lastPos, lastViewport }
  const [collapsingParentId, setCollapsingParentId] = useState(null);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [ancestorPath, setAncestorPath] = useState({ nodeIds: new Set(), edgeIds: new Set() });
  const [nodeComparisonSelection, setNodeComparisonSelection] = useState({ sourceId: null, sourceName: '' });
  const [mobileRelationshipFocus, setMobileRelationshipFocus] = useState(null);
  const deepLinkAppliedRef = useRef(false);
  const selectedNodeIdRef = useRef(null);
  const startNodeComparisonRef = useRef(null);
  const completeNodeComparisonRef = useRef(null);
  const nodeComparisonTimeoutRef = useRef(null);
  const searchDebounceRef = useRef(null);
  const resumeSyncTimeoutRef = useRef(null);
  const adminWalkthroughEnabledRef = useRef(false);
  const pendingAdminAutoOpenRef = useRef(false);
  const wasAdminRef = useRef(false);
  const ignorePaneClickUntilRef = useRef(0);

  const isSignedInUser = Boolean(currentUser && !currentUser.is_anonymous);
  const effectiveRole = userRole === 'admin' || isLegacyAdmin
    ? 'admin'
    : userRole === 'verified'
      ? 'verified'
      : 'guest';

  useEffect(() => {
    if (isMobileDevice) {
      selectedNodeIdRef.current = null;
      return;
    }
    selectedNodeIdRef.current = selectedNodeId ? String(selectedNodeId) : null;
  }, [isMobileDevice, selectedNodeId]);
  const isVerifiedMember = effectiveRole === 'verified' || effectiveRole === 'admin';
  const isAdmin = effectiveRole === 'admin';
  const canModerateProposals = isVerifiedMember;
  const canViewPendingChildNodes = isVerifiedMember;
  const visibleNoticeTargetKey = visibleNoticeTargetId ? String(visibleNoticeTargetId) : null;
  const shouldIncludeVisibleNoticeTarget = useCallback((person) => String(person?.id) === visibleNoticeTargetKey, [visibleNoticeTargetKey]);
  const pendingMemberClaims = useMemo(() => memberRecords.filter((member) => member.claim_status === 'pending'), [memberRecords]);
  const verifiedMembers = useMemo(() => memberRecords.filter((member) => member.claim_status === 'approved' && member.member_level === 'verified'), [memberRecords]);
  const adminMembers = useMemo(() => memberRecords.filter((member) => member.claim_status === 'approved' && member.member_level === 'admin'), [memberRecords]);
  const visibleNotices = useMemo(() => notices, [notices]);
  const visibleToast = useMemo(() => {
    if (!toast) return null;
    return toast;
  }, [toast]);

  // Pre-built search index — computed once on data load, not on every search keystroke
  const searchIndex = useMemo(() => {
    const searchablePeople = canViewPendingChildNodes
      ? familyData
      : familyData.filter((person) => !isPendingAddChildNode(person) || shouldIncludeVisibleNoticeTarget(person));

    return searchablePeople.map(person => {
      const displayNames = getDisplayNames(person);
      const englishClean = cleanText((displayNames.englishName || '').toLowerCase());
      const arabicClean = cleanText(normalizeArabic(displayNames.arabicName || ''));
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
        englishClean,
        arabicClean,
        lineageLatin: cleanText(lineageLatinArr.join('')),
        lineageArab: cleanText(lineageArabArr.join('')),
        info: (person.info || '').toLowerCase()
      };
    });
  }, [canViewPendingChildNodes, familyData, personMap, shouldIncludeVisibleNoticeTarget]); // personMap already depends on familyData

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
      const saved = readStorage('localStorage', 'rf-app-settings', null);
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
    writeStorage('localStorage', 'rf-app-settings', JSON.stringify(appSettings));
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
    const normalizedId = String(nodeId);

    // Turn off previous glow if it exists
    if (lastGlowNodeIdRef.current && lastGlowNodeIdRef.current !== normalizedId) {
      updateNodeData(lastGlowNodeIdRef.current, { isGlowing: false });
      setNodes((nds) => nds.map((node) => (
        String(node.id) === String(lastGlowNodeIdRef.current)
          ? { ...node, data: { ...node.data, isGlowing: false } }
          : node
      )));
    }

    // Turn on current glow
    updateNodeData(normalizedId, { isGlowing: true });
    setNodes((nds) => nds.map((node) => (
      String(node.id) === normalizedId
        ? { ...node, data: { ...node.data, isGlowing: true } }
        : node
    )));
    lastGlowNodeIdRef.current = normalizedId;

    glowTimeoutRef.current = setTimeout(() => {
      updateNodeData(normalizedId, { isGlowing: false });
      setNodes((nds) => nds.map((node) => (
        String(node.id) === normalizedId
          ? { ...node, data: { ...node.data, isGlowing: false } }
          : node
      )));
      lastGlowNodeIdRef.current = null;
      glowTimeoutRef.current = null;
    }, 1600);
  }, [appSettings.glowEnabled, setNodes, updateNodeData]);

  const wait = useCallback((ms) => new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  }), []);

  const waitForNextFrame = useCallback(() => new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  }), []);

  const showToast = useCallback((nextToast, duration = 2800) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast(nextToast);
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
      toastTimeoutRef.current = null;
    }, duration);
  }, []);

  const loadExportModules = useCallback(async () => {
    if (exportModulesRef.current) return exportModulesRef.current;

    const [{ toCanvas, toPng }, { jsPDF }] = await Promise.all([
      import('html-to-image'),
      import('jspdf')
    ]);

    exportModulesRef.current = { toCanvas, toPng, jsPDF };
    return exportModulesRef.current;
  }, []);

  const handleCaptureVisibleView = useCallback(async () => {
    if (isCapturingScreenshot) return;

    const flowElement = document.querySelector('.graph-workspace .react-flow');
    if (!flowElement) {
      showToast({ text: t('screenshotFailed') });
      return;
    }

    setIsCapturingScreenshot(true);

    try {
      await wait(80);
      const { toPng } = await loadExportModules();

      const bounds = flowElement.getBoundingClientRect();
      const requestedScale = Math.min(Math.max(window.devicePixelRatio || 1, 3), 4);
      const maxCanvasPixels = 18000000;
      const estimatedPixels = bounds.width * bounds.height * requestedScale * requestedScale;
      const safeScale = estimatedPixels > maxCanvasPixels
        ? Math.max(2, Math.sqrt(maxCanvasPixels / Math.max(bounds.width * bounds.height, 1)))
        : requestedScale;

      const dataUrl = await toPng(flowElement, {
        cacheBust: true,
        pixelRatio: 1,
        canvasWidth: Math.max(1, Math.round(bounds.width * safeScale)),
        canvasHeight: Math.max(1, Math.round(bounds.height * safeScale)),
        backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg-color').trim() || '#ffffff',
        filter: (node) => {
          if (!(node instanceof HTMLElement)) return true;
          return !node.closest('.react-flow__controls');
        }
      });

      const now = new Date();
      const pad = (value) => String(value).padStart(2, '0');
      const fileName = `nasab-visible-view-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}.png`;

      const downloadLink = document.createElement('a');
      downloadLink.href = dataUrl;
      downloadLink.download = fileName;
      downloadLink.click();

      showToast({ text: t('screenshotSuccess') });
    } catch (error) {
      console.error('Screenshot export failed:', error);
      showToast({ text: t('screenshotFailed') });
    } finally {
      setIsCapturingScreenshot(false);
    }
  }, [isCapturingScreenshot, loadExportModules, showToast, t, wait]);

  const handleDownloadAncestorPdf = useCallback(async (personId) => {
    const normalizedId = String(personId);
    const chain = [];
    let current = personMap.get(normalizedId);
    let guard = 0;

    while (current && guard < 200) {
      chain.push(current);
      current = current.fatherId ? personMap.get(String(current.fatherId)) : null;
      guard += 1;
    }

    if (chain.length === 0) {
      showToast({ text: t('ancestorPdfFailed') });
      return;
    }

    const targetPerson = chain[0];
    const targetNames = getDisplayNames(targetPerson);
    const headingArabic = targetNames.arabicName || targetNames.englishName || `#${targetPerson.id}`;
    const headingLatin = targetNames.englishName || targetNames.arabicName || `#${targetPerson.id}`;
    const titlePeople = chain.slice(0, 3).map((person) => {
      const names = getDisplayNames(person);
      return {
        arabic: names.arabicName || names.englishName || `#${person.id}`,
        latin: names.englishName || names.arabicName || `#${person.id}`
      };
    });
    const titleLatinBase = titlePeople.map((item) => item.latin).join(' bin ');
    const titleArabicBase = titlePeople.map((item) => item.arabic).join(' بن ');
    const titleLatinFull = `${titleLatinBase} Baraja`;
    const titleArabicFull = `${titleArabicBase} بارجاء`;
    const combinedLineageName = `${titleLatinFull} (${titleArabicFull})`;
    const documentTitle = lang === 'id'
      ? `Silsilah nasab dari ${combinedLineageName}`
      : lang === 'ar'
        ? `سلسلة النسب من ${titleArabicFull} (${titleLatinFull})`
        : `Lineage of ${combinedLineageName}`;
    const exportShell = document.createElement('div');
    const exportCard = document.createElement('div');
    const measureCanvas = document.createElement('canvas');
    const measureContext = measureCanvas.getContext('2d');
    const measureTextWidth = (text, font) => {
      if (!measureContext) return String(text || '').length * 14;
      measureContext.font = font;
      return measureContext.measureText(String(text || '')).width;
    };

    const metrics = chain.map((person) => {
      const names = getDisplayNames(person);
      const arabicName = names.arabicName || names.englishName || `#${person.id}`;
      const latinName = names.englishName || names.arabicName || `#${person.id}`;
      const arabicWidth = measureTextWidth(arabicName, '700 30px Tahoma');
      const latinWidth = measureTextWidth(latinName, 'italic 18px Segoe UI');
      const width = Math.min(420, Math.max(150, Math.ceil(Math.max(arabicWidth, latinWidth) + 56)));
      const contentWidth = Math.max(90, width - 34);
      const arabicLines = Math.max(1, Math.ceil(arabicWidth / contentWidth));
      const latinLines = Math.max(1, Math.ceil(latinWidth / contentWidth));
      const height = Math.max(94, 22 + arabicLines * 34 + latinLines * 22 + 20);
      return {
        id: String(person.id),
        arabicName,
        latinName,
        width,
        height,
        arabicLines,
        latinLines
      };
    });

    const horizontalGap = 56;
    const verticalGap = 76;
    const outerPadding = 48;
    const maxDiagramWidth = 1320;
    const contentWidth = maxDiagramWidth;
    const rows = [];
    let currentRow = [];
    let currentRowWidth = 0;

    metrics.forEach((item) => {
      const projectedWidth = currentRow.length === 0
        ? item.width
        : currentRowWidth + horizontalGap + item.width;

      if (currentRow.length > 0 && projectedWidth > contentWidth) {
        rows.push(currentRow);
        currentRow = [item];
        currentRowWidth = item.width;
      } else {
        currentRow.push(item);
        currentRowWidth = projectedWidth;
      }
    });

    if (currentRow.length > 0) rows.push(currentRow);

    const diagramWidth = outerPadding * 2 + contentWidth;
    const titleHeight = 118;
    const rowPositions = [];
    const rowHeights = rows.map((row) => Math.max(...row.map((item) => item.height), 94));
    let accumulatedHeight = outerPadding + titleHeight;

    rows.forEach((row, rowIndex) => {
      const isRightToLeft = rowIndex % 2 === 0;
      const rowHeight = rowHeights[rowIndex];
      const y = accumulatedHeight;
      const rowWidth = row.reduce((sum, item, itemIndex) => sum + item.width + (itemIndex > 0 ? horizontalGap : 0), 0);
      const positioned = [];

      if (isRightToLeft) {
        let xCursor = outerPadding + contentWidth;
        row.forEach((item) => {
          const x = xCursor - item.width;
          positioned.push({
            ...item,
            x,
            y: y + (rowHeight - item.height) / 2,
            centerX: x + item.width / 2,
            centerY: y + (rowHeight - item.height) / 2 + item.height / 2
          });
          xCursor = x - horizontalGap;
        });
      } else {
        let xCursor = outerPadding;
        row.forEach((item) => {
          const x = xCursor;
          positioned.push({
            ...item,
            x,
            y: y + (rowHeight - item.height) / 2,
            centerX: x + item.width / 2,
            centerY: y + (rowHeight - item.height) / 2 + item.height / 2
          });
          xCursor += item.width + horizontalGap;
        });
      }

      rowPositions.push({
        isRightToLeft,
        items: positioned
      });
      accumulatedHeight += rowHeight;
      if (rowIndex < rows.length - 1) accumulatedHeight += verticalGap;
    });
    const diagramHeight = accumulatedHeight + outerPadding;

    const svgParts = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${diagramWidth}" height="${diagramHeight}" viewBox="0 0 ${diagramWidth} ${diagramHeight}" role="img" aria-label="${escapeXml(headingLatin)}">`,
      '<defs>',
      '<marker id="ancestor-arrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">',
      '<path d="M 0 0 L 10 5 L 0 10 z" fill="#111827" />',
      '</marker>',
      '</defs>',
      `<rect x="0" y="0" width="${diagramWidth}" height="${diagramHeight}" fill="#ffffff" />`,
      `<text x="${diagramWidth / 2}" y="${diagramHeight / 2}" text-anchor="middle" font-family="Tahoma, Arial, sans-serif" font-size="138" font-weight="800" fill="rgba(15,23,42,0.08)" transform="rotate(-10 ${diagramWidth / 2} ${diagramHeight / 2})">شجرة آل بارجاء</text>`,
      `<text x="${diagramWidth / 2}" y="${outerPadding + 2}" text-anchor="middle" font-family="${lang === 'ar' ? 'Tahoma, Arial, sans-serif' : 'Segoe UI, Arial, sans-serif'}" font-size="28" font-weight="700" fill="#111827">${escapeXml(documentTitle)}</text>`,
      `<text x="${diagramWidth / 2}" y="${outerPadding + 38}" text-anchor="middle" font-family="Tahoma, Arial, sans-serif" font-size="30" font-weight="700" fill="#111827">${escapeXml(headingArabic)}</text>`,
      `<text x="${diagramWidth / 2}" y="${outerPadding + 72}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="18" font-style="italic" fill="#475569">${escapeXml(headingLatin)}</text>`
    ];

    rowPositions.forEach((row, rowIndex) => {
      row.items.forEach((item, itemIndex) => {
        svgParts.push(`<rect x="${item.x}" y="${item.y}" rx="18" ry="18" width="${item.width}" height="${item.height}" fill="#ffffff" stroke="#111827" stroke-width="3" />`);
        svgParts.push(`<foreignObject x="${item.x + 10}" y="${item.y + 10}" width="${item.width - 20}" height="${item.height - 20}">`);
        svgParts.push('<div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;overflow:hidden;">');
        svgParts.push(`<div style="font-family:Tahoma, Arial, sans-serif;font-size:30px;font-weight:700;line-height:1.15;color:#111827;word-break:break-word;overflow-wrap:anywhere;max-width:100%;margin-bottom:6px;">${escapeXml(item.arabicName)}</div>`);
        svgParts.push(`<div style="font-family:'Segoe UI', Arial, sans-serif;font-size:17px;font-style:italic;line-height:1.18;color:#475569;word-break:break-word;overflow-wrap:anywhere;max-width:100%;">${escapeXml(item.latinName)}</div>`);
        svgParts.push('</div>');
        svgParts.push('</foreignObject>');

        if (itemIndex < row.items.length - 1) {
          const next = row.items[itemIndex + 1];
          const startX = row.isRightToLeft ? item.x - 8 : item.x + item.width + 8;
          const endX = row.isRightToLeft ? next.x + next.width + 8 : next.x - 8;
          svgParts.push(`<line x1="${startX}" y1="${item.centerY}" x2="${endX}" y2="${next.centerY}" stroke="#111827" stroke-width="4" stroke-linecap="round" marker-end="url(#ancestor-arrow)" />`);
        }
      });

      if (rowIndex < rowPositions.length - 1) {
        const currentLast = row.items[row.items.length - 1];
        const nextFirst = rowPositions[rowIndex + 1].items[0];
        const startY = currentLast.y + currentLast.height + 8;
        const endY = nextFirst.y - 8;

        svgParts.push(`<line x1="${currentLast.centerX}" y1="${startY}" x2="${nextFirst.centerX}" y2="${endY}" stroke="#111827" stroke-width="4" stroke-linecap="round" marker-end="url(#ancestor-arrow)" />`);
      }
    });

    svgParts.push('</svg>');

    exportShell.style.cssText = 'position:fixed;left:-100000px;top:0;pointer-events:none;opacity:1;z-index:-1;padding:0;margin:0;';
    exportCard.style.cssText = `width:${diagramWidth}px;background:#ffffff;padding:0;box-sizing:border-box;font-family:Segoe UI, Arial, sans-serif;color:#0f172a;`;
    exportCard.innerHTML = svgParts.join('');

    exportShell.appendChild(exportCard);
    document.body.appendChild(exportShell);

    try {
      await wait(90);
      const { toCanvas, jsPDF } = await loadExportModules();

      const bounds = exportCard.getBoundingClientRect();
      const requestedScale = 2.8;
      const maxCanvasPixels = 24000000;
      const estimatedPixels = bounds.width * bounds.height * requestedScale * requestedScale;
      const safeScale = estimatedPixels > maxCanvasPixels
        ? Math.max(1.6, Math.sqrt(maxCanvasPixels / Math.max(bounds.width * bounds.height, 1)))
        : requestedScale;

      const canvas = await toCanvas(exportCard, {
        cacheBust: true,
        pixelRatio: 1,
        canvasWidth: Math.max(1, Math.round(bounds.width * safeScale)),
        canvasHeight: Math.max(1, Math.round(bounds.height * safeScale)),
        backgroundColor: '#f8fafc'
      });

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 24;
      const printableWidth = pageWidth - margin * 2;
      const printableHeight = pageHeight - margin * 2;
      const renderedHeight = canvas.height * (printableWidth / canvas.width);

      if (renderedHeight <= printableHeight) {
        const imageData = canvas.toDataURL('image/png', 1.0);
        pdf.addImage(imageData, 'PNG', margin, margin, printableWidth, renderedHeight, undefined, 'FAST');
      } else {
        const sliceHeightPx = Math.max(1, Math.floor(printableHeight * (canvas.width / printableWidth)));
        let offsetY = 0;
        let pageIndex = 0;

        while (offsetY < canvas.height) {
          const currentSliceHeight = Math.min(sliceHeightPx, canvas.height - offsetY);
          const sliceCanvas = document.createElement('canvas');
          const sliceContext = sliceCanvas.getContext('2d');

          sliceCanvas.width = canvas.width;
          sliceCanvas.height = currentSliceHeight;

          if (!sliceContext) throw new Error('Unable to prepare PDF page canvas');

          sliceContext.fillStyle = '#f8fafc';
          sliceContext.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
          sliceContext.drawImage(canvas, 0, offsetY, canvas.width, currentSliceHeight, 0, 0, sliceCanvas.width, sliceCanvas.height);

          if (pageIndex > 0) pdf.addPage();

          const imageData = sliceCanvas.toDataURL('image/png', 1.0);
          const imageHeight = currentSliceHeight * (printableWidth / canvas.width);
          pdf.addImage(imageData, 'PNG', margin, margin, printableWidth, imageHeight, undefined, 'FAST');

          offsetY += currentSliceHeight;
          pageIndex += 1;
        }
      }

      const fileBaseName = (lang === 'ar' ? headingArabic : headingLatin || `person-${normalizedId}`)
        .replace(/[\\/:*?"<>|]/g, '')
        .trim() || `person-${normalizedId}`;

      pdf.save(`nasab-${fileBaseName}.pdf`);
      showToast({ text: t('ancestorPdfSuccess') });
    } catch (error) {
      console.error('Ancestor PDF export failed:', error);
      showToast({ text: t('ancestorPdfFailed') });
    } finally {
      exportShell.remove();
    }
  }, [lang, loadExportModules, personMap, showToast, t, wait]);

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
      if (changed) writeStorage('localStorage', 'rf-collapsed-state', JSON.stringify(next));
      return next;
    });
  }, []);

  const getViewportForVisibleNodes = useCallback((targetNodes, options = {}) => {
    const {
      minZoom = 0.54,
      maxZoom = 1.05,
      paddingRatio: paddingRatioOverride
    } = options;
    const visibleNodes = (targetNodes || []).filter(Boolean);
    if (visibleNodes.length === 0) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    visibleNodes.forEach((node) => {
      const width = Math.max(node.width || node.measured?.width || 180, 120);
      const height = Math.max(node.height || node.measured?.height || 72, 56);
      minX = Math.min(minX, node.position.x - width / 2);
      minY = Math.min(minY, node.position.y);
      maxX = Math.max(maxX, node.position.x + width / 2);
      maxY = Math.max(maxY, node.position.y + height);
      });

      const flowElem = document.querySelector('.react-flow');
      const viewportWidth = Math.max(flowElem?.clientWidth || window.innerWidth, 320);
      const viewportHeight = Math.max(flowElem?.clientHeight || window.innerHeight, 320);
      const paddingRatio = Number.isFinite(paddingRatioOverride)
        ? paddingRatioOverride
        : viewportWidth < 768 ? 0.16 : 0.12;
      const paddedWidth = Math.max(maxX - minX, 240) * (1 + paddingRatio * 2);
      const paddedHeight = Math.max(maxY - minY, 180) * (1 + paddingRatio * 2);
      const zoomX = viewportWidth / paddedWidth;
      const zoomY = viewportHeight / paddedHeight;
      const zoom = Math.min(Math.max(Math.min(zoomX, zoomY), minZoom), maxZoom);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

      return {
        x: viewportWidth / 2 - centerX * zoom,
        y: viewportHeight / 2 - centerY * zoom,
        zoom,
        centerX,
        centerY,
        viewportWidth,
        viewportHeight
      };
    }, []);

  const runLineageCameraTour = useCallback(async (selectedId, chainIds, options = {}) => {
    const {
      startViewport = null,
      preserveZoomOnMobile = false,
      preserveCurrentZoom = false,
      skipInitialFocus = false,
      relationshipMode = false
    } = options;

    const tourToken = Date.now();
    lineageTourTokenRef.current = tourToken;

    const initialWait = relationshipMode
      ? 180
      : preserveZoomOnMobile && isMobileDevice
        ? 200
        : (appSettings.animationsEnabled && appSettings.cameraEnabled ? 520 : 60);

    await wait(initialWait);
    if (lineageTourTokenRef.current !== tourToken) return;

    if ((preserveZoomOnMobile && isMobileDevice && startViewport) || (preserveCurrentZoom && startViewport && !relationshipMode)) {
      setViewport({
        x: startViewport.x,
        y: startViewport.y,
        zoom: preserveCurrentZoom
          ? Math.min(Math.max(startViewport.zoom || 1, 0.72), 1.12)
          : Math.min(Math.max(startViewport.zoom || 1, 0.6), 1.2)
      }, { duration: 0 });
      await wait(50);
      if (lineageTourTokenRef.current !== tourToken) return;
    }

    const liveNodes = getNodes();
    if (!liveNodes || liveNodes.length === 0) return;

    const selectedNode = getNode(String(selectedId));
    const visibleNodes = liveNodes.filter((node) => node && !node.hidden);
    const overviewViewport = (preserveZoomOnMobile && isMobileDevice) || preserveCurrentZoom
      ? null
      : getViewportForVisibleNodes(visibleNodes);
    const viewportSeed = startViewport || getViewport();
    const seedZoom = Number.isFinite(viewportSeed?.zoom) ? viewportSeed.zoom : 1;

    if (!selectedNode || (!overviewViewport && !(preserveZoomOnMobile && isMobileDevice) && !preserveCurrentZoom)) {
      fitView({ duration: appSettings.animationsEnabled && appSettings.cameraEnabled ? 700 : 0, padding: 0.18 });
      return;
    }

    const transitionsEnabled = appSettings.animationsEnabled && appSettings.cameraEnabled;
    const totalSteps = Math.max(chainIds.length - 1, 1);
    const endZoom = preserveCurrentZoom
      ? Math.min(Math.max(seedZoom, 0.72), 1.05)
      : preserveZoomOnMobile && isMobileDevice
      ? Math.min(Math.max(seedZoom, 0.9), 1.15)
      : Math.max(overviewViewport.zoom, 0.6);
    const startZoom = preserveCurrentZoom
      ? endZoom
      : preserveZoomOnMobile && isMobileDevice
      ? Math.min(Math.max(seedZoom + 0.08, 0.92), 1.18)
      : Math.min(Math.max(endZoom + 0.22, 0.9), 1.18);

    const centerNodeInViewport = (liveNode, zoom, duration) => {
      const nodeHeight = liveNode.height || liveNode.measured?.height || 72;
      const targetX = liveNode.position.x;
      const targetY = liveNode.position.y + nodeHeight / 2;
      setCenter(targetX, targetY, { zoom, duration });
    };

    const centerNode = async (nodeId, zoom, duration, holdMs = 0, shouldGlow = false) => {
      const liveNode = getNode(String(nodeId));
      if (!liveNode) return;
      centerNodeInViewport(liveNode, zoom, duration);
      await wait(duration + 110 + holdMs);
      if (shouldGlow) {
        triggerGlow(String(nodeId));
      }
    };

    if (!transitionsEnabled) {
      centerNodeInViewport(selectedNode, startZoom, 0);
      setViewport(overviewViewport, { duration: 0 });
      triggerGlow(String(selectedId));
      return;
    }

    let startIndex = 1;
    if (!skipInitialFocus) {
      await centerNode(selectedId, startZoom, preserveCurrentZoom ? 560 : 920, preserveCurrentZoom ? 120 : 440, false);
      if (lineageTourTokenRef.current !== tourToken) return;
      startIndex = 1;
    }

    for (let index = startIndex; index < chainIds.length; index += 1) {
      if (lineageTourTokenRef.current !== tourToken) return;
      const progress = index / totalSteps;
      const stepZoom = startZoom + (endZoom - startZoom) * progress;
      const isLastStep = index === chainIds.length - 1;
      const stepDuration = relationshipMode
        ? (isLastStep ? 1320 : 1120)
        : preserveCurrentZoom
        ? (isLastStep ? 900 : 780)
        : (isLastStep ? 1120 : 980);
      const holdDuration = relationshipMode
        ? (isLastStep ? 380 : 280)
        : preserveCurrentZoom
        ? (isLastStep ? 240 : 180)
        : (isLastStep ? 460 : 380);
      await centerNode(chainIds[index], stepZoom, stepDuration, holdDuration, false);
    }

    if (lineageTourTokenRef.current !== tourToken) return;
    await centerNode(
      selectedId,
      endZoom,
      relationshipMode ? 1450 : 1180,
      relationshipMode ? 420 : 320,
      true
    );
  }, [appSettings.animationsEnabled, appSettings.cameraEnabled, fitView, getNode, getNodes, getViewport, getViewportForVisibleNodes, isMobileDevice, setCenter, setViewport, triggerGlow, wait]);

  const runRelationshipCameraPath = useCallback(async (targetId, orderedNodeIds, options = {}) => {
    const {
      startViewport = null,
      focusNodeIds = orderedNodeIds,
      sourceId = null
    } = options;
    if (!targetId || !orderedNodeIds?.length) return;

    const normalizedTargetId = String(targetId);
    const normalizedSourceId = sourceId ? String(sourceId) : null;
    const cameraNodeIds = [...orderedNodeIds].map(String).reverse();
    const tourToken = Date.now();
    lineageTourTokenRef.current = tourToken;

    await wait(appSettings.animationsEnabled && appSettings.cameraEnabled ? 240 : 60);
    if (lineageTourTokenRef.current !== tourToken) return;

    // Wait for collapse/layout to settle before we start moving the camera.
    await waitForNextFrame();
    await waitForNextFrame();
    if (lineageTourTokenRef.current !== tourToken) return;

    const resolveLiveNode = async (nodeId, maxAttempts = 8) => {
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const liveNode = getNode(String(nodeId));
        if (liveNode && !liveNode.hidden) {
          return liveNode;
        }
        await waitForNextFrame();
        if (lineageTourTokenRef.current !== tourToken) return null;
      }
      return null;
    };

    const targetNode = await resolveLiveNode(normalizedTargetId);
    if (!targetNode) {
      triggerGlow(normalizedTargetId);
      return;
    }

    const transitionsEnabled = appSettings.animationsEnabled && appSettings.cameraEnabled;
    const viewportSeed = startViewport || getViewport();
    const focusPathNodes = [];
    if (Array.isArray(focusNodeIds) && focusNodeIds.length > 0) {
      for (const nodeId of focusNodeIds) {
        const liveNode = await resolveLiveNode(nodeId, 4);
        if (liveNode) {
          focusPathNodes.push(liveNode);
        }
      }
    }

    const focusViewport = focusPathNodes.length > 1
      ? getViewportForVisibleNodes(focusPathNodes)
      : null;
    const boundedFocusZoom = focusViewport
      ? isMobileDevice
        ? Math.min(Math.max(focusViewport.zoom, 0.72), 0.98)
        : Math.min(Math.max(focusViewport.zoom, 0.68), 1.02)
      : null;
    const seedZoom = isMobileDevice
      ? Math.min(Math.max(boundedFocusZoom || viewportSeed?.zoom || 0.9, 0.72), 0.98)
      : Math.min(Math.max(boundedFocusZoom || viewportSeed?.zoom || 0.92, 0.68), 1.02);

    const centerRelationshipNode = async (nodeId, duration, holdMs = 0, shouldGlow = false) => {
      const liveNode = await resolveLiveNode(nodeId);
      if (!liveNode) return false;
      const nodeHeight = liveNode.height || liveNode.measured?.height || 72;
      setCenter(liveNode.position.x, liveNode.position.y + nodeHeight / 2, {
        zoom: seedZoom,
        duration
      });
      await wait(duration + 100 + holdMs);
      if (shouldGlow) {
        triggerGlow(String(nodeId));
      }
      return lineageTourTokenRef.current === tourToken;
    };

    const viewportWithZoom = (viewport, zoomOverride) => {
      if (!viewport) return null;
      const zoom = Number.isFinite(zoomOverride) ? zoomOverride : viewport.zoom;
      const viewportWidth = Math.max(viewport.viewportWidth || 0, 320);
      const viewportHeight = Math.max(viewport.viewportHeight || 0, 320);
      const centerX = viewport.centerX;
      const centerY = viewport.centerY;

      if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) {
        return {
          x: viewport.x,
          y: viewport.y,
          zoom
        };
      }

      return {
        x: viewportWidth / 2 - centerX * zoom,
        y: viewportHeight / 2 - centerY * zoom,
        zoom
      };
    };

    const getComparisonViewport = async () => {
      if (!normalizedSourceId) return null;
      const sourceNode = await resolveLiveNode(normalizedSourceId, 4);
      const finalTargetNode = await resolveLiveNode(normalizedTargetId, 4);
      if (!sourceNode || !finalTargetNode) return null;

      const dualViewport = getViewportForVisibleNodes(
        [sourceNode, finalTargetNode],
        {
          minZoom: isMobileDevice ? 0.12 : 0.08,
          maxZoom: isMobileDevice ? 0.96 : 1.0,
          paddingRatio: isMobileDevice ? 0.22 : 0.16
        }
      );
      if (!dualViewport) return null;

      const minZoom = isMobileDevice ? 0.12 : 0.08;
      const maxZoom = isMobileDevice ? 0.96 : 1.0;
      const preferredUpperBound = Math.min(seedZoom - (isMobileDevice ? 0.04 : 0.05), maxZoom);
      const finalZoom = dualViewport.zoom > preferredUpperBound
        ? Math.max(minZoom, preferredUpperBound)
        : dualViewport.zoom;

      return viewportWithZoom(
        dualViewport,
        Number.isFinite(finalZoom) ? finalZoom : dualViewport.zoom
      );
    };

    if (!transitionsEnabled) {
      const comparisonViewport = await getComparisonViewport();
      if (comparisonViewport) {
        setViewport(comparisonViewport, { duration: 0 });
      } else if (focusViewport) {
        setViewport(viewportWithZoom(focusViewport, seedZoom), { duration: 0 });
      } else {
        const nodeHeight = targetNode.height || targetNode.measured?.height || 72;
        setCenter(targetNode.position.x, targetNode.position.y + nodeHeight / 2, { zoom: seedZoom, duration: 0 });
      }
      triggerGlow(normalizedTargetId);
      return;
    }

    if (focusViewport) {
      setViewport(viewportWithZoom(focusViewport, seedZoom), { duration: 520 });
      await wait(700);
      if (lineageTourTokenRef.current !== tourToken) return;
    }

    const initialOk = await centerRelationshipNode(normalizedTargetId, 560, 220, false);
    if (!initialOk || lineageTourTokenRef.current !== tourToken) return;

    for (let index = 1; index < cameraNodeIds.length; index += 1) {
      const isLastTraversalNode = index === cameraNodeIds.length - 1;
      const moved = await centerRelationshipNode(
        cameraNodeIds[index],
        isLastTraversalNode ? 1480 : 1260,
        isLastTraversalNode ? 420 : 320,
        false
      );
      if (!moved || lineageTourTokenRef.current !== tourToken) return;
    }

    const finalFocusOk = await centerRelationshipNode(normalizedTargetId, 1560, 460, true);
    if (!finalFocusOk || lineageTourTokenRef.current !== tourToken) return;

    const comparisonViewport = await getComparisonViewport();
    if (!comparisonViewport || lineageTourTokenRef.current !== tourToken) return;

    setViewport(comparisonViewport, { duration: 1380 });
    await wait(1560);
  }, [appSettings.animationsEnabled, appSettings.cameraEnabled, getNode, getViewport, getViewportForVisibleNodes, isMobileDevice, setCenter, setViewport, triggerGlow, wait, waitForNextFrame]);

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

    const initH = rootNode.measured?.height || rootNode.height || 100;
    const initCX = rootNode.position.x;
    const initCY = rootNode.position.y + (initH / 2);
    const flowElem = document.querySelector('.react-flow');
    const initialVpW = flowElem ? flowElem.clientWidth : window.innerWidth;
    const initialVpH = flowElem ? flowElem.clientHeight : window.innerHeight;
    const introStartZoom = 1.3;

    setViewport({
      x: (initialVpW / 2) - (initCX * introStartZoom),
      y: (initialVpH / 2) - (initCY * introStartZoom),
      zoom: introStartZoom
    }, { duration: 0 });

    const easeInOutCubic = (p) => (
      p < 0.5
        ? 4 * p * p * p
        : 1 - ((-2 * p + 2) ** 3) / 2
    );
    const easeOutQuad = (p) => 1 - ((1 - p) * (1 - p));
    const easeOutQuint = (p) => 1 - Math.pow(1 - p, 5);

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    clearIntroTimers();

    const isLikelyMobile = typeof window !== 'undefined' && (
        window.innerWidth <= 768
        || window.matchMedia?.('(pointer: coarse)')?.matches
      );

    // Jika mobile, durasi animasi ngebut, jika desktop durasi normal
    const duration = isLikelyMobile ? 5500 : 14000;
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

      // Smoothly zoom out as the tree expands to reveal more generations
      // Using easeOutQuint for a much more aggressive and fast initial zoom out
      const zoomProgress = easeOutQuint(rawProgress);
      const targetEndZoom = 0.25;
      const currentZoom = introStartZoom - zoomProgress * (introStartZoom - targetEndZoom);

      const driftX = Math.sin(progress * Math.PI * 0.9) * 120;
      const driftY = Math.sin(progress * Math.PI) * 80;
      const activeH = liveRoot.measured?.height || liveRoot.height || 100;
      const nodeCenterX = liveRoot.position.x;
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
        // Pertahankan posisi terakhir (jangan di fitView/zoom out lagi)
        setIsIntroRunning(false);
      }
    };

    animationRef.current = requestAnimationFrame(animateCamera);

    if (isLikelyMobile) {
      // Jadwal ngebut untuk mobile (Total ~5 detik)
      scheduleIntroAction(600, () => setCollapsedIds(tier1, false));
      scheduleIntroAction(1600, () => setCollapsedIds(tier2, false));
      scheduleIntroAction(2600, () => setCollapsedIds(tier3, false));
      scheduleIntroAction(3600, () => setCollapsedIds(tier4, false));
      scheduleIntroAction(4600, () => setCollapsedIds(tier5, false));
    } else {
      // Jadwal normal untuk desktop
      scheduleIntroAction(2000, () => setCollapsedIds(tier1, false));
      scheduleIntroAction(4500, () => setCollapsedIds(tier2, false));
      scheduleIntroAction(7000, () => setCollapsedIds(tier3, false));
      scheduleIntroAction(9500, () => setCollapsedIds(tier4, false));
      scheduleIntroAction(12000, () => setCollapsedIds(tier5, false));
    }

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

  const calculateRelationshipPath = useCallback((fromNodeId, toNodeId) => {
    if (!fromNodeId || !toNodeId) {
      return { nodeIds: new Set(), edgeIds: new Set(), orderedNodeIds: [] };
    }

    const startId = String(fromNodeId);
    const targetId = String(toNodeId);

    if (startId === targetId) {
      return { nodeIds: new Set([startId]), edgeIds: new Set(), orderedNodeIds: [startId] };
    }

    const startAncestors = [];
    const startAncestorSet = new Set();
    let currentId = startId;
    let guard = 0;
    while (currentId && guard < 200) {
      startAncestors.push(currentId);
      startAncestorSet.add(currentId);
      currentId = personMap.get(currentId)?.fatherId ? String(personMap.get(currentId).fatherId) : null;
      guard += 1;
    }

    const targetAncestors = [];
    let commonAncestorId = null;
    currentId = targetId;
    guard = 0;
    while (currentId && guard < 200) {
      targetAncestors.push(currentId);
      if (startAncestorSet.has(currentId)) {
        commonAncestorId = currentId;
        break;
      }
      currentId = personMap.get(currentId)?.fatherId ? String(personMap.get(currentId).fatherId) : null;
      guard += 1;
    }

    if (!commonAncestorId) {
      return { nodeIds: new Set(), edgeIds: new Set(), orderedNodeIds: [] };
    }

    const startToCommon = [];
    for (let i = 0; i < startAncestors.length; i += 1) {
      startToCommon.push(startAncestors[i]);
      if (startAncestors[i] === commonAncestorId) break;
    }

    const targetToCommon = [];
    for (let i = 0; i < targetAncestors.length; i += 1) {
      targetToCommon.push(targetAncestors[i]);
      if (targetAncestors[i] === commonAncestorId) break;
    }

    const orderedNodeIds = [
      ...startToCommon,
      ...targetToCommon.slice(0, -1).reverse()
    ];

    const nodeIds = new Set(orderedNodeIds);
    const edgeIds = new Set();
    for (let i = 0; i < orderedNodeIds.length - 1; i += 1) {
      const currentNodeId = orderedNodeIds[i];
      const nextNodeId = orderedNodeIds[i + 1];
      const currentFatherId = personMap.get(currentNodeId)?.fatherId ? String(personMap.get(currentNodeId).fatherId) : null;
      const nextFatherId = personMap.get(nextNodeId)?.fatherId ? String(personMap.get(nextNodeId).fatherId) : null;

      if (currentFatherId === nextNodeId) {
        edgeIds.add(`e-${nextNodeId}-${currentNodeId}`);
      } else if (nextFatherId === currentNodeId) {
        edgeIds.add(`e-${currentNodeId}-${nextNodeId}`);
      }
    }

    return { nodeIds, edgeIds, orderedNodeIds };
  }, [personMap]);

  // Apply Theme Toggle
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    writeStorage('localStorage', 'rf-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    const modes = ['dark', 'light', 'warm'];
    setTheme(prev => {
      const nextIndex = (modes.indexOf(prev) + 1) % modes.length;
      return modes[nextIndex];
    });
  };

  useEffect(() => {
    writeStorage('localStorage', 'rf-lang', lang);
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

  const fetchPublicMemberDirectory = useCallback(async () => {
    setIsMemberDataLoading(true);
    const { data, error } = await supabase
      .from('baraja_member_directory')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Public member directory lookup failed:', error);
      setIsMemberDataLoading(false);
      return;
    }

    setMemberRecords(data || []);
    setIsMemberDataLoading(false);
  }, []);

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

  const syncVisibleAppData = useCallback(async ({ includeNodes = false, force = false } = {}) => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

    const now = Date.now();
    if (!force && now - lastVisibleSyncAtRef.current < 15000) {
      return;
    }
    lastVisibleSyncAtRef.current = now;

    const tasks = [fetchLatestNotices()];
    if (includeNodes || familyData.length === 0) {
      tasks.push(fetchAllNodes({ markLoaded: false }));
    }

    await Promise.all(tasks);
  }, [familyData.length, fetchAllNodes, fetchLatestNotices]);

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
    const scheduleResumeSync = ({ includeNodes = false, force = false } = {}) => {
      if (resumeSyncTimeoutRef.current) {
        clearTimeout(resumeSyncTimeoutRef.current);
      }

      resumeSyncTimeoutRef.current = window.setTimeout(() => {
        void syncVisibleAppData({ includeNodes, force });
        resumeSyncTimeoutRef.current = null;
      }, 350);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenSinceRef.current = Date.now();
        return;
      }

      const hiddenDuration = hiddenSinceRef.current ? Date.now() - hiddenSinceRef.current : 0;
      hiddenSinceRef.current = null;
      scheduleResumeSync({
        includeNodes: hiddenDuration > 3 * 60 * 1000
      });
    };

    const handleWindowFocus = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      scheduleResumeSync();
    };

    const handleOnline = () => {
      hiddenSinceRef.current = null;
      scheduleResumeSync({ includeNodes: true, force: true });
    };

    const intervalId = window.setInterval(() => {
      void syncVisibleAppData({ includeNodes: true });
    }, 5 * 60 * 1000);

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('online', handleOnline);

    return () => {
      clearInterval(intervalId);
      if (resumeSyncTimeoutRef.current) {
        clearTimeout(resumeSyncTimeoutRef.current);
        resumeSyncTimeoutRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('online', handleOnline);
    };
  }, [syncVisibleAppData]);

  // 3. Reactive Unread Count Calculation
  useEffect(() => {
    const unread = visibleNotices.filter(n => (n.timestamp || 0) > lastNoticeOpen).length;

    setUnreadCount(unread);
  }, [visibleNotices, lastNoticeOpen]);

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



  const openNodeDetails = useCallback((rawData) => {
    if (!rawData) return;
    void fetchPublicMemberStatuses();
    const normalizedId = String(rawData.id);
    const personToOpen = personMap.get(normalizedId) || rawData;

    if (openNodeDetailsTimeoutRef.current) {
      clearTimeout(openNodeDetailsTimeoutRef.current);
    }

    openNodeDetailsTimeoutRef.current = setTimeout(() => {
      setSelectedPerson(personToOpen);
      setIsModalOpen(true);
      openNodeDetailsTimeoutRef.current = null;
    }, 0);
  }, [fetchPublicMemberStatuses, personMap]);

  const toggleNodeCollapse = useCallback((nodeId) => {
    const normalizedNodeId = String(nodeId);
    const node = getNode(normalizedNodeId);
    if (!node) return;
    clearMobileRelationshipFocus();

    const wasExpanded = !collapsedStateById[normalizedNodeId];

    if (wasExpanded) {
      // 1. Start Grouping animation (Recursive Collapse)
      setCollapsingParentId(normalizedNodeId);

      // Build parent-children map for O(1) recursion
      const parentToChildrenMap = new Map();
      familyData.forEach(p => {
        const fid = p.fatherId ? String(p.fatherId) : null;
        if (fid) {
          if (!parentToChildrenMap.has(fid)) parentToChildrenMap.set(fid, []);
          parentToChildrenMap.get(fid).push(p);
        }
      });

      const gatherDescendantIds = (parentId, visited = new Set()) => {
        const pid = String(parentId);
        if (visited.has(pid)) return [];
        visited.add(pid);

        let results = [];
        const children = parentToChildrenMap.get(pid) || [];
        children.forEach(child => {
          const cid = String(child.id);
          if (visited.has(cid)) return;
          results.push(cid);
          results = results.concat(gatherDescendantIds(cid, visited));
        });
        return results;
      };
      const descendants = gatherDescendantIds(normalizedNodeId);

      // Stabilization: Snapping persists through the 600ms animation into the final layout
      const view = getViewport();
      setToggledNodeInfo({
        id: normalizedNodeId,
        lastPos: { ...node.position },
        lastViewport: { ...view },
        isPersistent: true
      });

      setTimeout(() => {
        setCollapsedStateById(prev => {
          const newState = { ...prev, [normalizedNodeId]: true };
          descendants.forEach(cid => { newState[cid] = true; }); // RECURSIVE COLLAPSE
          writeStorage('localStorage', 'rf-collapsed-state', JSON.stringify(newState));
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

      const gatherDescendantIds = (parentId, visited = new Set()) => {
        const pid = String(parentId);
        if (visited.has(pid)) return [];
        visited.add(pid);

        let results = [];
        const children = parentToChildrenMap.get(pid) || [];
        children.forEach(child => {
          const cid = String(child.id);
          if (visited.has(cid)) return;
          results.push(cid);
          results = results.concat(gatherDescendantIds(cid, visited));
        });
        return results;
      };

      const descendants = gatherDescendantIds(normalizedNodeId);

      // Viewport Stabilization (Snap only once for expand)
      const view = getViewport();
      setToggledNodeInfo({
        id: normalizedNodeId,
        lastPos: { ...node.position },
        lastViewport: { ...view }
      });

      setCollapsedStateById(prev => {
        const newState = { ...prev };
        newState[normalizedNodeId] = false;
        writeStorage('localStorage', 'rf-collapsed-state', JSON.stringify(newState));
        return newState;
      });
    }
  }, [clearMobileRelationshipFocus, collapsedStateById, familyData, getNode, getViewport]);



  // Update layout diagram on data change

  // Highlight Ancestor Path
  useEffect(() => {
    setNodes(nds => nds.map(node => {
      const nid = String(node.id);
        const isPathGlow = (mobilePathGlowEnabledRef.current || !isMobileDevice) && ancestorPath.nodeIds.has(nid);
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
      const isPathGlow = !isMobileDevice && ancestorPath.edgeIds.has(edge.id);
      const className = isPathGlow ? 'ancestor-edge-glow' : '';
      if (edge.className === className) return edge;
      return {
        ...edge,
        className
      };
    }));
  }, [ancestorPath, isMobileDevice]);

  useEffect(() => {
    if (isMobileDevice) return;
    setNodes((nds) => nds.map((node) => {
      const isSelected = selectedNodeId != null && String(node.id) === String(selectedNodeId);
      if (!!node.selected === isSelected) return node;
      return { ...node, selected: isSelected };
    }));
  }, [isMobileDevice, selectedNodeId]);

  useEffect(() => {
    setNodes((nds) => nds.map((node) => {
      if (!node.data?.isPending) return node;
      const pendingLabel = t('pendingAdminVerification');
      if (node.data.pendingLabel === pendingLabel) return node;
      return {
        ...node,
        data: {
          ...node.data,
          pendingLabel
        }
      };
    }));
  }, [t]);

  const [initialViewport] = useState(() => {
    try {
      const saved = readStorage('localStorage', 'rf-viewport', null);
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

    // Select the node without forcing a full graph relayout.
    if (!isMobileDevice) {
      setSelectedNodeId(nodeId);
    }
    setAncestorPathSafe(calculateAncestorPath(nodeId));
  }, [calculateAncestorPath, getViewport, nodes, setAncestorPathSafe, setViewport, triggerGlow]);

  const onPaneDoubleClick = useCallback((e) => {
    // Only zoom if clicking directly on pane/background — not on a node
    const isOnPane = !e.target.closest('.react-flow__node') && !e.target.closest('.react-flow__controls');
    if (!isOnPane) return;
    zoomIn({ duration: 300 });
  }, [zoomIn]);

  const onPaneClick = useCallback(() => {
    if (Date.now() < ignorePaneClickUntilRef.current) {
      return;
    }
    setVisibleNoticeTargetId(null);
    setSelectedPerson(null);
    setSelectedNodeId(null);
    clearMobileRelationshipFocus();
    clearAncestorPathSafe();
    stopCameraMotion();
  }, [clearAncestorPathSafe, clearMobileRelationshipFocus, stopCameraMotion]);

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
      writeStorage('localStorage', 'rf-viewport', JSON.stringify(viewport));
    }
  }, []);



  // Handle device orientation change to keep the same focal point
  useEffect(() => {
    let lastWidth = window.innerWidth;
    let lastHeight = window.innerHeight;

    const handleResize = () => {
      if (isMobileDevice && (isModalOpen || activeInfoModal)) return;

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
  }, [activeInfoModal, getViewport, isMobileDevice, isModalOpen, setCenter]);


  const ensurePathVisible = useCallback((targetId) => {
    const normalizedTargetId = String(targetId);
    // 1. Walk up the ancestor chain to collect all ancestor IDs
    let current = familyData.find(p => String(p.id) === normalizedTargetId);
    const ancestorsToExpand = [];
    let loopGuard = 0;
    while (current && current.fatherId && loopGuard < 100) { // #8: loop limit against circular refs
      loopGuard++;
      ancestorsToExpand.push(String(current.fatherId));
      current = familyData.find(p => String(p.id) === String(current.fatherId));
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

    const wasHidden = ensurePathVisible(targetId);
    if (wasHidden) {
      setPendingFocusTarget({ id: targetId, options });
    } else {
      const targetNode = nodes.find((node) => node.id === targetId);
      if (targetNode) {
        smoothFocusNode(targetId, options);
      }
    }

    openNodeDetails(person);
  }, [ensurePathVisible, fetchPublicMemberStatuses, nodes, personMap, smoothFocusNode]);

  const handleNodeClick = useCallback((nodeId, rawData) => {
    if (Date.now() < ignorePaneClickUntilRef.current) {
      return;
    }

    const normalizedNodeId = String(nodeId);
    ignorePaneClickUntilRef.current = Date.now() + 500;
    const targetPerson = personMap.get(normalizedNodeId) || rawData;
    const isCollapsed = !!collapsedStateById[normalizedNodeId];
    const hasChildren = familyData.some((person) => String(person.fatherId || '') === normalizedNodeId);

    setSelectedNodeId(normalizedNodeId);
    selectedNodeIdRef.current = normalizedNodeId;
    setAncestorPathSafe(calculateAncestorPath(normalizedNodeId));

    if (hasChildren && isCollapsed) {
      toggleNodeCollapse(normalizedNodeId);
      return;
    }

    openNodeDetails(targetPerson);
  }, [calculateAncestorPath, collapsedStateById, familyData, openNodeDetails, personMap, setAncestorPathSafe, toggleNodeCollapse]);

  const handleNodeLongPress = useCallback((nodeId, rawData) => {
    const normalizedNodeId = String(nodeId);
    const targetPerson = personMap.get(normalizedNodeId) || rawData;
    if (!targetPerson) return;

    ignorePaneClickUntilRef.current = Date.now() + 1500;

    if (!nodeComparisonSelection.sourceId) {
      startNodeComparisonRef.current?.(normalizedNodeId);
      return;
    }

    if (String(nodeComparisonSelection.sourceId) === normalizedNodeId) {
      showToast({ text: t('compareCancelHint') }, 2800);
      return;
    }

    completeNodeComparisonRef.current?.(normalizedNodeId);
  }, [nodeComparisonSelection.sourceId, personMap, showToast, t]);

  useEffect(() => {
    setNodes((nds) => nds.map((node) => ({
      ...node,
      data: {
        ...node.data,
        onClick: handleNodeClick,
        onLongPress: handleNodeLongPress
      }
    })));
  }, [handleNodeClick, handleNodeLongPress]);

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
      const renderableFamilyData = canViewPendingChildNodes
        ? familyData
        : familyData.filter((person) => !isPendingAddChildNode(person) || shouldIncludeVisibleNoticeTarget(person));

      // 1. Build lookup maps for O(N) performance
      const personMapLocal = new Map();
      const parentToChildren = new Map();
      renderableFamilyData.forEach(p => {
        const id = String(p.id);
        const fid = p.fatherId ? String(p.fatherId) : null;
        personMapLocal.set(id, { ...p, id, fatherId: fid });
        if (fid) {
          if (!parentToChildren.has(fid)) parentToChildren.set(fid, []);
          parentToChildren.get(fid).push({ ...p, id, fatherId: fid });
        }
      });

      const rootList = renderableFamilyData.filter(p => !p.fatherId);
      const visibleData = [];
      const visitedTraversalIds = new Set();
      const traverse = (person) => {
        const pid = String(person.id);
        if (visitedTraversalIds.has(pid)) return;
        visitedTraversalIds.add(pid);
        const isCollapsed = !!collapsedStateById[pid];
        const isCurrentlyCollapsing = collapsingParentId === pid;
        const displayNames = getDisplayNames(person);
        const pending = isPersonPending(person);

        visibleData.push({
          ...person,
          displayArabicName: displayNames.arabicName,
          displayEnglishName: displayNames.englishName,
          isPending: pending,
          pendingType: isPendingAddChildNode(person) ? "add_child" : (getPendingNameChange(person) ? "name_change" : null),
          pendingLabel: pending ? t('pendingAdminVerification') : "",
          isGlowing: isCollapsed, // Add glow to collapsed nodes
          isCollapsed: isCollapsed,
          hasChildren: parentToChildren.has(pid)
        });

        if (!isCollapsed || isCurrentlyCollapsing) {
          const children = (parentToChildren.get(pid) || [])
            .filter((child) => canViewPendingChildNodes || !isPendingAddChildNode(child) || shouldIncludeVisibleNoticeTarget(child));
          children.forEach(c => traverse(c));
        }
      };
      rootList.forEach(r => traverse(r));

      const relationshipFocusedIds = isMobileDevice && mobileRelationshipFocus?.visibleNodeIds?.length
        ? new Set(mobileRelationshipFocus.visibleNodeIds.map(String))
        : null;
      const layoutSourceData = relationshipFocusedIds
        ? visibleData.filter((person) => relationshipFocusedIds.has(String(person.id)))
        : visibleData;

      const rawNodes = createNodesFromData(layoutSourceData);
      const rawEdges = generateEdges(layoutSourceData);

      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(rawNodes, rawEdges, appSettings.layoutStyle || "tidy");

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
                className: "collapsing-child"
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
      const currentVisibleIds = new Set(layoutSourceData.map(p => p.id));
      const newlyVisibleIds = new Set([...currentVisibleIds].filter(id => !prevVisibleSetRef.current.has(id)));

      setNodes(finalNodes.map(n => {
        const isNew = newlyVisibleIds.has(n.id);
        const isToggled = toggledNodeInfo && toggledNodeInfo.id === n.id;

        // #7: Preserve nav glow (from triggerGlow) across layout re-renders
        const nid2 = String(n.id);
        const isNavGlowing = lastGlowNodeIdRef.current === nid2;
        const isPathGlow = !isMobileDevice && ancestorPath.nodeIds.has(nid2);
        const isGlowing = isNavGlowing || n.isGlowing || !!(toggledNodeInfo && toggledNodeInfo.id === n.id);

        // Ungrouping Animation: New nodes start at the parent's position
        let initialPos = { ...n.position };
        if (isNew && toggledNodeInfo && !toggledNodeInfo.isPersistent) {
          initialPos = { ...toggledNodeInfo.lastPos };
        }

        return {
          ...n,
            selected: selectedNodeIdRef.current != null && String(n.id) === String(selectedNodeIdRef.current),
            data: {
              ...n.data,
              isGlowing,
              isPathGlow,
              onClick: handleNodeClick,
              onLongPress: handleNodeLongPress
            },
            position: initialPos
          };
      }));
      setEdges(layoutedEdges.map((edge) => ({
        ...edge,
        className: ((mobilePathGlowEnabledRef.current || !isMobileDevice) && ancestorPath.edgeIds.has(edge.id)) ? 'ancestor-edge-glow' : ''
      }))); 

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

      if (expandAllViewportCenterLockRef.current) {
        const {
          anchorNodeId,
          anchorScreenX,
          anchorScreenY,
          flowCenterX,
          flowCenterY,
          zoom
        } = expandAllViewportCenterLockRef.current;

        const anchorNode = anchorNodeId ? layoutNodesMap.get(String(anchorNodeId)) : null;
        const anchorWidth = anchorNode?.measured?.width || anchorNode?.width || 260;
        const anchorHeight = anchorNode?.measured?.height || anchorNode?.height || 100;

        if (anchorNode && Number.isFinite(anchorScreenX) && Number.isFinite(anchorScreenY)) {
          const anchorCenterX = anchorNode.position.x + (anchorWidth / 2);
          const anchorCenterY = anchorNode.position.y + (anchorHeight / 2);

          setViewport({
            x: anchorScreenX - anchorCenterX * zoom,
            y: anchorScreenY - anchorCenterY * zoom,
            zoom
          }, { duration: (!appSettings.animationsEnabled || !appSettings.expandEnabled) ? 0 : 400 });
        } else {
          const flowElem = document.querySelector(".react-flow");
          const viewportWidth = flowElem ? flowElem.clientWidth : window.innerWidth;
          const viewportHeight = flowElem ? flowElem.clientHeight : window.innerHeight;

          setViewport({
            x: viewportWidth / 2 - flowCenterX * zoom,
            y: viewportHeight / 2 - flowCenterY * zoom,
            zoom
          }, { duration: (!appSettings.animationsEnabled || !appSettings.expandEnabled) ? 0 : 400 });
        }

        expandAllViewportCenterLockRef.current = null;
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
  }, [familyData, canViewPendingChildNodes, shouldIncludeVisibleNoticeTarget, collapsedStateById, isLoading, collapsingParentId, appSettings.layoutStyle, isMobileDevice, mobileRelationshipFocus]);


  const getNextPendingIdForModerator = useCallback((excludeId = null) => {
    if (!canModerateProposals || pendingQueueIds.length === 0) {
      return null;
    }

    return pendingQueueIds.find((id) => id !== String(excludeId || '')) || null;
  }, [canModerateProposals, pendingQueueIds]);

  const openNextPendingForModerator = useCallback((excludeId = null) => {
    if (!canModerateProposals || pendingQueueIds.length === 0) {
      adminWalkthroughEnabledRef.current = false;
      return false;
    }

    const nextId = getNextPendingIdForModerator(excludeId);
    if (!nextId) {
      adminWalkthroughEnabledRef.current = false;
      return false;
    }

    openPersonModalById(nextId, { targetZoom: 1.25 });
    return true;
  }, [canModerateProposals, getNextPendingIdForModerator, openPersonModalById, pendingQueueIds]);

  // Auto-focus when pending target becomes visible in nodes array
  useEffect(() => {
    if (!pendingFocusTarget) return;

    const targetNode = nodes.find((n) => n.id === pendingFocusTarget.id);
    const isLayoutReady = targetNode && (Math.abs(targetNode.position.x) > 1 || Math.abs(targetNode.position.y) > 1);
    if (!isLayoutReady) return;

    const runFocus = () => {
      smoothFocusNode(pendingFocusTarget.id, pendingFocusTarget.options);
      setPendingFocusTarget(null);
    };

    if (pendingFocusTarget.source === 'notice' || pendingFocusTarget.source === 'list') {
      requestAnimationFrame(() => {
        runFocus();
      });
      return;
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        runFocus();
      });
    });
  }, [nodes, pendingFocusTarget, smoothFocusNode]);

  useEffect(() => {
    if (isAdmin && !wasAdminRef.current) {
      adminWalkthroughEnabledRef.current = true;
      pendingAdminAutoOpenRef.current = pendingQueueIds.length > 0;
    }

    if (!isAdmin) {
      adminWalkthroughEnabledRef.current = false;
      pendingAdminAutoOpenRef.current = false;
    }

    wasAdminRef.current = isAdmin;
  }, [isAdmin, pendingQueueIds]);

  useEffect(() => {
    if (!isAdmin || !pendingAdminAutoOpenRef.current) return;
    if (activeInfoModal || isModalOpen) return;

    const hasNextPending = openNextPendingForModerator();
    pendingAdminAutoOpenRef.current = false;

    if (!hasNextPending) {
      adminWalkthroughEnabledRef.current = false;
    }
  }, [activeInfoModal, isAdmin, isModalOpen, openNextPendingForModerator]);

  // CINEMATIC INTRO SEQUENCE
  useEffect(() => {
    if (isLoading || nodes.length === 0 || hasInitialFocusedRef.current) return;
    if (initialViewport) {
      // Saved viewport exists — don't override
      hasInitialFocusedRef.current = true;
      return;
    }

    if (familyData.length === 0) return;

    const isLikelyMobile = typeof window !== 'undefined' && (
        window.innerWidth <= 768
        || window.matchMedia?.('(pointer: coarse)')?.matches
      );

    // User request: Focus intro explicitly on "Muhammad bin Mas'ud ... al-Mulaqqab bi-Abi Raja'"
    const rootPerson = familyData.find(p => p.arabicName && p.arabicName.includes('الملقب بأبي رجاء'))
      || familyData.find(p => !p.fatherId);

    if (!rootPerson) return;

    // Step 0: ensure the tree is forcefully collapsed before cinematic starts.
    const hasBeenForced = readStorage('sessionStorage', 'rf-cinematic-forced', null);
    if (!hasBeenForced) {
      const parentToChildrenMap = buildParentToChildrenMap(familyData);

      const gatherDescendantIds = (parentId, visited = new Set()) => {
        const pid = String(parentId);
        if (visited.has(pid)) return [];
        visited.add(pid);

        let results = [];
        const children = parentToChildrenMap.get(pid) || [];
        children.forEach(child => {
          const cid = String(child.id);
          if (visited.has(cid)) return;
          results.push(cid);
          results = results.concat(gatherDescendantIds(cid, visited));
        });
        return results;
      };

      const descendants = gatherDescendantIds(rootPerson.id);
      setCollapsedIds([String(rootPerson.id), ...descendants], true);
      writeStorage('sessionStorage', 'rf-cinematic-forced', '1');
      return;
    }

    runIntroStrategy(INTRO_STRATEGY, rootPerson);
  }, [buildParentToChildrenMap, familyData, initialViewport, isLoading, nodes, runIntroStrategy, setCollapsedIds, smoothFocusNode]);



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

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }

    if (val.trim() === '') {
      setSearchSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    if (val.trim().length >= 1) {
      searchDebounceRef.current = setTimeout(() => {
        const queryLatin = cleanText(val.toLowerCase());
        const queryArab = cleanText(normalizeArabic(val));
        const queryLower = val.toLowerCase();

        const suggestions = searchIndex
          .filter((entry) =>
            entry.info.includes(queryLower) ||
            (queryLatin.length > 0 && entry.lineageLatin.startsWith(queryLatin)) ||
            (queryArab.length > 0 && entry.lineageArab.startsWith(queryArab)) ||
            (queryLatin.length > 0 && entry.englishClean.includes(queryLatin)) ||
            (queryArab.length > 0 && entry.arabicClean.includes(queryArab))
          )
          .slice(0, 10)
          .map((entry) => personMap.get(String(entry.id)))
          .filter(Boolean);

        setSearchSuggestions(suggestions);
        setShowSuggestions(suggestions.length > 0);
        searchDebounceRef.current = null;
      }, 120);
    } else {
      setSearchSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const selectSuggestion = (person) => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }
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
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }
    setShowSuggestions(false);

    const isSameQuery = searchQuery === lastSearchQuery;
    const queryLatinClean = cleanText(searchQuery.toLowerCase());
    const queryArabClean = cleanText(normalizeArabic(searchQuery));
    const queryLower = searchQuery.toLowerCase();

    // Use pre-built searchIndex — O(N) instead of O(N×depth) per search
    const matches = searchIndex
      .filter(entry =>
        entry.info.includes(queryLower) ||
        (queryLatinClean.length > 0 && entry.englishClean.includes(queryLatinClean)) ||
        (queryArabClean.length > 0 && entry.arabicClean.includes(queryArabClean)) ||
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
      const currentPerson = personMap.get(String(childId));
      const dbUpdates = {};
      if (updates.englishName !== undefined) dbUpdates.english_name = updates.englishName;
      if (updates.arabicName !== undefined) dbUpdates.arabic_name = updates.arabicName;
      if (updates.info !== undefined) dbUpdates.info = updates.info;
      if (updates.fatherId !== undefined) {
        const nextFatherId = updates.fatherId === '' ? null : updates.fatherId;
        const normalizedChildId = String(childId);

        if (nextFatherId != null) {
          const normalizedFatherId = String(nextFatherId);
          if (!personMap.has(normalizedFatherId)) {
            throw new Error(t('invalidFatherReference'));
          }
          if (normalizedFatherId === normalizedChildId || wouldCreateFatherCycle(familyData, normalizedChildId, normalizedFatherId)) {
            throw new Error(t('invalidFatherRelation'));
          }
        }

        dbUpdates.father_id = nextFatherId;
      }
      if (updates.moderation !== undefined) dbUpdates.moderation = updates.moderation;

      const { error } = await supabase
        .from('nodes')
        .update(dbUpdates)
        .eq('id', childId);

      if (error) throw error;
      patchLocalPerson(childId, updates);

      const nextArabicName = updates.arabicName !== undefined ? (updates.arabicName || '') : (currentPerson?.arabicName || '');
      const nextEnglishName = updates.englishName !== undefined ? (updates.englishName || '') : (currentPerson?.englishName || '');
      const didChangeName = nextArabicName !== (currentPerson?.arabicName || '') || nextEnglishName !== (currentPerson?.englishName || '');

      if (didChangeName) {
        const notice = await createNotice({
          text: buildNoticeText({
            type: 'admin_name_change',
            lang,
            personName: lang === 'ar'
              ? (nextArabicName || currentPerson?.arabicName || '')
              : (nextEnglishName || nextArabicName || currentPerson?.englishName || currentPerson?.arabicName || '')
          }),
          type: 'admin_name_change',
          targetId: childId,
          targetPersonId: childId,
          timestamp: Date.now()
        });
        if (notice) appendLocalNotice(notice);
      }

      await fetchAllNodes({ markLoaded: false });
    } catch (err) {
      console.error(err);
      alert(err?.message || t('updateFailed'));
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

      const gatherDescendantIds = (parentId, visited = new Set()) => {
        const pid = String(parentId);
        if (visited.has(pid)) return [];
        visited.add(pid);

        const directChildren = parentToChildrenMap.get(pid) || [];
        const results = [];
        directChildren.forEach((descendantId) => {
          const cid = String(descendantId);
          if (visited.has(cid)) return;
          results.push(cid);
          results.push(...gatherDescendantIds(cid, visited));
        });
        return results;
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

        const parent = person.fatherId ? personMap.get(String(person.fatherId)) : null;
        const grandParent = parent?.fatherId ? personMap.get(String(parent.fatherId)) : null;
        const notice = await createNotice({
          text: buildNoticeText({
            type: 'new_member',
            lang,
            personName: lang === 'ar' ? (person.arabicName || '') : (person.englishName || person.arabicName || ''),
            parentName: parent ? (lang === 'ar' ? (parent.arabicName || '') : (parent.englishName || parent.arabicName || '')) : '',
            grandParentName: grandParent ? (lang === 'ar' ? (grandParent.arabicName || '') : (grandParent.englishName || grandParent.arabicName || '')) : ''
          }),
          type: 'new_member',
          targetId: person.id,
          targetPersonId: person.id,
          timestamp: Date.now()
        });
        if (notice) appendLocalNotice(notice);
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
    showToast({ text: t('passwordChangedSuccess') });
    setActiveInfoModal(null);
  };

  const handleUpdateProfile = async ({ phone, city, region, regionCode, country, countryCode }) => {
    if (!currentMember?.id) return;
    const trimmedPhone = (phone || '').trim();
    const trimmedCity = (city || '').trim();
    const trimmedRegion = (region || '').trim();
    const trimmedCountry = (country || '').trim();
    const trimmedRegionCode = (regionCode || '').trim();
    const trimmedCountryCode = (countryCode || '').trim();
    if (!trimmedPhone || !trimmedCity) {
      throw new Error(t('fillAllFields'));
    }

    const { data, error } = await supabase
      .from('baraja_member')
      .update({
        phone: trimmedPhone,
        city: trimmedCity,
        region: trimmedRegion,
        region_code: trimmedRegionCode,
        country: trimmedCountry,
        country_code: trimmedCountryCode
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

  const handleUpdateEmailNotifications = async (enabled) => {
    if (!currentMember?.id) return;

    const { data, error } = await supabase
      .from('baraja_member')
      .update({
        email_notifications_enabled: Boolean(enabled)
      })
      .eq('id', currentMember.id)
      .select('*')
      .maybeSingle();

    if (error) {
      throw new Error(error.message || t('updateFailed'));
    }

    setCurrentMember(data || null);
    setMemberRecords((prev) => prev.map((item) => (item.id === data?.id ? data : item)));
    showToast({ text: t('emailNotificationsUpdated') });
  };

  const handleUpdateEmailNotificationGroups = async (patch) => {
    if (!currentMember?.id) return;

    const { data, error } = await supabase
      .from('baraja_member')
      .update(patch)
      .eq('id', currentMember.id)
      .select('*')
      .maybeSingle();

    if (error) {
      throw new Error(error.message || t('updateFailed'));
    }

    setCurrentMember(data || null);
    setMemberRecords((prev) => prev.map((item) => (item.id === data?.id ? data : item)));
    showToast({ text: t('emailNotificationsUpdated') });
  };

  const handleSubmitMemberClaim = useCallback(async (person, payload) => {
    const email = (payload.email || '').trim().toLowerCase();
    const password = payload.password || '';
    const phone = (payload.phone || '').trim();
    const city = (payload.city || '').trim();
    const regionCode = (payload.regionCode || '').trim();
    const region = (payload.region || '').trim();
    const countryCode = (payload.countryCode || '').trim();
    const country = (payload.country || '').trim();

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
      country_code: countryCode,
      region,
      region_code: regionCode,
      country,
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
      void fetchPublicMemberDirectory();
      setActiveInfoModal('listMember');
    }
    if (item === 'List Admin') {
      void fetchPublicMemberDirectory();
      setActiveInfoModal('listAdmin');
    }
    if (item === 'Sign Out') handleSignOut();

    if (item === 'Notice') {
      setActiveInfoModal('notice');
      // Fix: Use the max timestamp from the actual data to avoid local clock skew issues
      const maxTs = visibleNotices.length > 0 ? Math.max(...visibleNotices.map(n => n.timestamp || 0)) : Date.now();
      setLastNoticeOpen(maxTs);
      writeStorage('localStorage', 'rf-last-notice-open', String(maxTs));
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
    clearMobileRelationshipFocus();
    const flowElem = document.querySelector('.react-flow');
    const viewportWidth = flowElem ? flowElem.clientWidth : window.innerWidth;
    const viewportHeight = flowElem ? flowElem.clientHeight : window.innerHeight;
    const currentViewport = getViewport();
    const viewportCenterX = (viewportWidth / 2 - currentViewport.x) / currentViewport.zoom;
    const viewportCenterY = (viewportHeight / 2 - currentViewport.y) / currentViewport.zoom;

    const anchorNode = nodes.reduce((closest, node) => {
      const nodeWidth = node.measured?.width || node.width || 260;
      const nodeHeight = node.measured?.height || node.height || 100;
      const nodeCenterX = node.position.x + (nodeWidth / 2);
      const nodeCenterY = node.position.y + (nodeHeight / 2);
      const distance = Math.hypot(nodeCenterX - viewportCenterX, nodeCenterY - viewportCenterY);

      if (!closest || distance < closest.distance) {
        return {
          id: node.id,
          centerX: nodeCenterX,
          centerY: nodeCenterY,
          distance
        };
      }

      return closest;
    }, null);

    expandAllViewportCenterLockRef.current = {
      anchorNodeId: anchorNode?.id ?? null,
      anchorScreenX: anchorNode ? currentViewport.x + anchorNode.centerX * currentViewport.zoom : null,
      anchorScreenY: anchorNode ? currentViewport.y + anchorNode.centerY * currentViewport.zoom : null,
      flowCenterX: viewportCenterX,
      flowCenterY: viewportCenterY,
      zoom: Math.max(0.05, currentViewport.zoom * 0.95)
    };

    setCollapsedStateById(() => {
      const next = {};
      familyData.forEach(p => {
        next[p.id] = false;
      });
      writeStorage('localStorage', 'rf-collapsed-state', JSON.stringify(next));
      return next;
    });
  }, [clearMobileRelationshipFocus, getViewport, familyData, nodes]);

  const handleModalClose = useCallback(() => {
    const closingPersonId = selectedPerson ? String(selectedPerson.id) : null;
    adminWalkthroughEnabledRef.current = false;
    setIsModalOpen(false);
    setSelectedPerson(null);
    clearMobileRelationshipFocus();
    clearAncestorPathSafe();
    if (isMobileDevice && closingPersonId) {
      requestAnimationFrame(() => triggerGlow(closingPersonId));
    }
  }, [clearAncestorPathSafe, clearMobileRelationshipFocus, isMobileDevice, selectedPerson, triggerGlow]);

  const handleSkipPending = useCallback((personId) => {
    if (!isAdmin) return;
    adminWalkthroughEnabledRef.current = true;
    const hasNextPending = openNextPendingForModerator(personId);
    if (!hasNextPending) {
      setIsModalOpen(false);
      setSelectedPerson(null);
    }
  }, [isAdmin, openNextPendingForModerator]);

  const continueAdminVerification = useCallback((currentPersonId) => {
    if (!isAdmin) return;
    adminWalkthroughEnabledRef.current = true;
    setIsModalOpen(false);
    setSelectedPerson(null);
    setTimeout(() => {
      openNextPendingForModerator(currentPersonId);
    }, 250);
  }, [isAdmin, openNextPendingForModerator]);


  const handleViewPerson = (personId, options = {}) => {
    const {
      source = 'list',
      openDetails = false,
      targetZoom = 1.2,
      customDuration = source === 'notice' ? 180 : 220,
    } = options;

    setActiveInfoModal(null);
    setIsModalOpen(false);

    if (source !== 'notice') {
      setVisibleNoticeTargetId(null);
    }

    if (!personId) return;

    const normalizedPersonId = String(personId);
    const focusOptions = { targetZoom, customDuration };

    const wasHidden = ensurePathVisible(normalizedPersonId);
    if (wasHidden) {
      setPendingFocusTarget({ id: normalizedPersonId, options: focusOptions, source, openDetails });
    } else {
      const targetNode = nodes.find((n) => String(n.id) === normalizedPersonId);
      if (targetNode) {
        smoothFocusNode(normalizedPersonId, focusOptions);
        if (source === 'notice') {
          setVisibleNoticeTargetId(null);
        }
      } else {
        setPendingFocusTarget({ id: normalizedPersonId, options: focusOptions, source, openDetails });
      }
    }
  };

  useEffect(() => {
    if (deepLinkAppliedRef.current) return;
    if (familyData.length === 0) return;
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search || '');
    const personId = String(params.get('personId') || '').trim();
    const parentId = String(params.get('parentId') || '').trim();
    const focusId = personId && personMap.has(personId)
      ? personId
      : parentId && personMap.has(parentId)
        ? parentId
        : '';

    deepLinkAppliedRef.current = true;
    if (!focusId) return;

    handleViewPerson(focusId, { source: 'deeplink', targetZoom: 1.2, customDuration: 260 });
  }, [familyData.length, personMap]);

  const handleShowLineageOnly = useCallback((personId) => {
    if (!personId || familyData.length === 0) return;
    const startViewport = getViewport();
    clearMobileRelationshipFocus();

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

      writeStorage('localStorage', 'rf-collapsed-state', JSON.stringify(next));
      return next;
    });

    // Aktifkan garis biru ancestor path + select node (sama seperti klik node biasa)
    setAncestorPathForMobile(calculateAncestorPath(selectedId));
    if (!isMobileDevice) {
      setSelectedNodeId(selectedId);
    }

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
    if (isMobileDevice) {
      requestAnimationFrame(() => triggerGlow(selectedId));
    }
    runLineageCameraTour(selectedId, ancestorChain, {
      startViewport,
      preserveZoomOnMobile: isMobileDevice
    });
  }, [calculateAncestorPath, clearMobileRelationshipFocus, getViewport, isMobileDevice, runLineageCameraTour, setAncestorPathForMobile, triggerGlow]);

  const applyVisualRelationshipPath = useCallback((targetId, relationshipPath, options = {}) => {
    if (!targetId || !relationshipPath?.orderedNodeIds?.length) return false;

    const {
      startViewport = getViewport(),
      sourceId = null
    } = options;

    const scaffoldNodeIds = new Set();
    relationshipPath.orderedNodeIds.forEach((nodeId) => {
      let currentId = nodeId;
      let guard = 0;
      while (currentId && guard < 200) {
        scaffoldNodeIds.add(currentId);
        currentId = personMap.get(currentId)?.fatherId ? String(personMap.get(currentId).fatherId) : null;
        guard += 1;
      }
    });

    const contextualVisibleNodeIds = new Set(scaffoldNodeIds);
    scaffoldNodeIds.forEach((nodeId) => {
      const parentId = personMap.get(String(nodeId))?.fatherId ? String(personMap.get(String(nodeId)).fatherId) : null;
      if (!parentId) return;

      familyData.forEach((person) => {
        const siblingId = String(person.id);
        const siblingFatherId = person.fatherId ? String(person.fatherId) : null;
        if (siblingFatherId === parentId) {
          contextualVisibleNodeIds.add(siblingId);
        }
      });
    });

    setCollapsedStateById((prev) => {
      const next = { ...prev };
      familyData.forEach((person) => {
        const id = String(person.id);
        if (scaffoldNodeIds.has(id)) {
          next[id] = false;
          return;
        }
        if (contextualVisibleNodeIds.has(id)) {
          next[id] = true;
          return;
        }
        next[id] = true;
      });
      writeStorage('localStorage', 'rf-collapsed-state', JSON.stringify(next));
      return next;
    });

    setAncestorPathForMobile({
      nodeIds: relationshipPath.nodeIds,
      edgeIds: relationshipPath.edgeIds
    });
    if (isMobileDevice) {
      setMobileRelationshipFocus({
        orderedNodeIds: relationshipPath.orderedNodeIds.map(String),
        scaffoldNodeIds: Array.from(scaffoldNodeIds).map(String),
        visibleNodeIds: Array.from(contextualVisibleNodeIds).map(String),
        targetId: String(targetId)
      });
    } else {
      clearMobileRelationshipFocus();
    }
    if (!isMobileDevice) {
      setSelectedNodeId(targetId);
    }
    setIsModalOpen(false);
    if (isMobileDevice) {
      requestAnimationFrame(() => triggerGlow(targetId));
    }
    runRelationshipCameraPath(targetId, relationshipPath.orderedNodeIds, {
      startViewport,
      focusNodeIds: relationshipPath.orderedNodeIds,
      sourceId
    });

    return true;
  }, [clearMobileRelationshipFocus, familyData, getViewport, isMobileDevice, personMap, runRelationshipCameraPath, setAncestorPathForMobile, triggerGlow]);

  const handleShowRelationshipWithMe = useCallback((personId) => {
    const memberPersonId = currentMember?.person_id ? String(currentMember.person_id) : null;
    const targetId = personId ? String(personId) : null;
    if (!memberPersonId || !targetId || memberPersonId === targetId || familyData.length === 0) return;
    const startViewport = getViewport();

    const relationshipPath = calculateRelationshipPath(memberPersonId, targetId);
    if (relationshipPath.orderedNodeIds.length === 0) return;

    applyVisualRelationshipPath(targetId, relationshipPath, {
      startViewport,
      sourceId: memberPersonId
    });
  }, [applyVisualRelationshipPath, calculateRelationshipPath, currentMember?.person_id, familyData.length, getViewport]);

  const handleStartNodeComparison = useCallback((personId) => {
    const sourceId = personId ? String(personId) : null;
    if (!sourceId) return;

    const sourcePerson = personMap.get(sourceId);
    const displayNames = getDisplayNames(sourcePerson);
    const sourceName = lang === 'ar'
      ? displayNames.arabicName
      : (displayNames.englishName || displayNames.arabicName || sourceId);

    if (nodeComparisonTimeoutRef.current) {
      clearTimeout(nodeComparisonTimeoutRef.current);
      nodeComparisonTimeoutRef.current = null;
    }

    clearMobileRelationshipFocus();
    clearAncestorPathSafe();
    setNodeComparisonSelection({ sourceId, sourceName });
    setIsModalOpen(false);
    showToast({ text: `${sourceName} ${t('compareStartSelectedToast')}` }, 3600);
    nodeComparisonTimeoutRef.current = setTimeout(() => {
      clearMobileRelationshipFocus();
      setNodeComparisonSelection({ sourceId: null, sourceName: '' });
      showToast({ text: t('compareSelectionExpired') }, 3200);
      nodeComparisonTimeoutRef.current = null;
    }, 60000);
  }, [clearAncestorPathSafe, clearMobileRelationshipFocus, lang, personMap, showToast, t]);

  const handleCancelNodeComparison = useCallback(() => {
    if (nodeComparisonTimeoutRef.current) {
      clearTimeout(nodeComparisonTimeoutRef.current);
      nodeComparisonTimeoutRef.current = null;
    }
    clearMobileRelationshipFocus();
    setNodeComparisonSelection({ sourceId: null, sourceName: '' });
    showToast({ text: t('compareCanceled') });
  }, [clearMobileRelationshipFocus, showToast, t]);

  const handleCompleteNodeComparison = useCallback((personId) => {
    const sourceId = nodeComparisonSelection.sourceId ? String(nodeComparisonSelection.sourceId) : null;
    const targetId = personId ? String(personId) : null;
    if (!sourceId || !targetId || sourceId === targetId || familyData.length === 0) return;

    const startViewport = getViewport();
    const relationshipPath = calculateRelationshipPath(sourceId, targetId);
    if (relationshipPath.orderedNodeIds.length === 0) {
      showToast({ text: t('comparePathNotFound') }, 3200);
      return;
    }

    const didApply = applyVisualRelationshipPath(targetId, relationshipPath, {
      startViewport,
      sourceId
    });

    if (!didApply) return;

    if (nodeComparisonTimeoutRef.current) {
      clearTimeout(nodeComparisonTimeoutRef.current);
      nodeComparisonTimeoutRef.current = null;
    }
    setNodeComparisonSelection({ sourceId: null, sourceName: '' });
    showToast({ text: t('compareVisualOnlyNotice') }, 3200);
  }, [applyVisualRelationshipPath, calculateRelationshipPath, familyData.length, getViewport, nodeComparisonSelection.sourceId, showToast, t]);

  useEffect(() => {
    startNodeComparisonRef.current = handleStartNodeComparison;
    completeNodeComparisonRef.current = handleCompleteNodeComparison;
  }, [handleStartNodeComparison, handleCompleteNodeComparison]);

  useEffect(() => {
    return () => {
      if (nodeComparisonTimeoutRef.current) {
        clearTimeout(nodeComparisonTimeoutRef.current);
        nodeComparisonTimeoutRef.current = null;
      }
    };
  }, []);

  const handleViewNotice = (notice) => {
    const targetId = String(notice?.targetId || '').trim();
    if (!targetId) return;

    if (notice?.type === 'proposal_add_child' && notice?.targetId) {
      setVisibleNoticeTargetId(targetId);
    }

    if (notice?.type === 'new_member' && notice?.id) {
      supabase
        .from('notices')
        .delete()
        .eq('id', notice.id)
        .then(({ error }) => {
          if (error) {
            console.error("Auto Delete Notice Error:", error);
            return;
          }
          removeLocalNoticeById(notice.id);
        });
    }

    handleViewPerson(targetId, {
      source: 'notice',
      openDetails: false,
      targetZoom: 1.2,
      customDuration: 180,
    });
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
            onFocus={() => { if (searchQuery.trim().length >= 1 && searchSuggestions.length > 0) setShowSuggestions(true) }}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          />
          {showSuggestions && searchSuggestions.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 120, background: 'var(--panel-bg)', borderRadius: '8px', border: '1px solid var(--panel-border)', marginTop: '12px', padding: '4px', maxHeight: '250px', overflowY: 'auto', boxShadow: '0 12px 28px rgba(15, 23, 42, 0.18)' }}>
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
      <WebsiteHeader
        onMenuClick={handleMenuClick}
        t={t}
        lang={lang}
        currentUser={isSignedInUser ? currentUser : null}
        role={effectiveRole}
        unreadCount={unreadCount}
        activeItem={activeInfoModal}
      >
        {renderSearchForm()}
      </WebsiteHeader>

      {!!activeInfoModal && (
        <Suspense fallback={
          <div className="info-modal-overlay">
            <div className="info-modal-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '200px' }}>
              <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>{t('loading')}</div>
                <div style={{ fontSize: '13px' }}>{t('loadingHint')}</div>
              </div>
            </div>
          </div>
        }>
          <LazyInfoModal
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
            notices={visibleNotices}
            onViewNotice={handleViewNotice}
            onViewMember={handleViewPerson}
            onDeleteNotice={handleDeleteNotice}
            appSettings={appSettings}
            setAppSettings={setAppSettings}
            onUpdateProfile={handleUpdateProfile}
            onUpdateEmailNotifications={handleUpdateEmailNotifications}
            onUpdateEmailNotificationGroups={handleUpdateEmailNotificationGroups}
            memberClaims={pendingMemberClaims}
            verifiedMembers={verifiedMembers}
            adminMembers={adminMembers}
            onApproveMember={handleApproveMember}
            onRejectMember={handleRejectMember}
            onPromoteAdmin={handlePromoteAdmin}
            loadingMembers={isMemberDataLoading}
          />
        </Suspense>
      )}

      {/* Toast Notification */}
      {visibleToast && (
        <div className="glass-panel toast-notification" style={{
          position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999, padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '12px',
          animation: 'slideUp 0.3s ease-out'
        }}>
          <Bell size={20} color="var(--accent)" />
          <div style={{ fontSize: '14px', fontWeight: 'bold' }}>{visibleToast.text}</div>
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

      <GraphErrorBoundary fallback={(
        <div style={{ padding: '24px', margin: '24px', borderRadius: '16px', background: 'var(--panel-bg)', border: '1px solid var(--panel-border)', color: 'var(--text-primary)' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>{t('graphCrashedTitle')}</div>
          <div style={{ marginBottom: '12px', color: 'var(--text-secondary)' }}>{t('graphCrashedHint')}</div>
          <button className="lineage-primary-button" onClick={() => window.location.reload()}>{t('reload')}</button>
        </div>
      )}>
        {isModalOpen && selectedPerson && (
          <Suspense fallback={null}>
            <LazyNodeEditModal
              isOpen={isModalOpen}
              onClose={handleModalClose}
              person={selectedPerson}
              familyData={familyData}
              onAddChild={handleAddChild}
              onUpdateChild={handleUpdateChild}
              onRemoveChild={handleRemoveChild}
              onViewPerson={handleViewPerson}
              onShowLineageOnly={handleShowLineageOnly}
              onDownloadAncestorPdf={handleDownloadAncestorPdf}
              onShowRelationshipWithMe={handleShowRelationshipWithMe}
              onStartNodeComparison={handleStartNodeComparison}
              onCompleteNodeComparison={handleCompleteNodeComparison}
              onCancelNodeComparison={handleCancelNodeComparison}
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
              canShowRelationshipWithMe={
                !nodeComparisonSelection.sourceId &&
                isVerifiedMember &&
                Boolean(currentMember?.person_id) &&
                selectedPerson &&
                String(currentMember.person_id) !== String(selectedPerson.id)
              }
              nodeComparisonSourceId={nodeComparisonSelection.sourceId}
              nodeComparisonSourceName={nodeComparisonSelection.sourceName}
              memberClaimStatus={selectedPerson ? (memberStatuses[String(selectedPerson.id)] || 'none') : 'none'}
              allowMemberClaim={effectiveRole === 'guest' && (!currentMember || ['rejected', 'cancelled'].includes(currentMember.claim_status))}
              currentMemberClaimStatus={currentMember?.claim_status || 'none'}
              onSubmitMemberClaim={handleSubmitMemberClaim}
            />
          </Suspense>
        )}

        <div className={`graph-workspace ${isCapturingScreenshot ? 'is-capturing-screenshot' : ''}`} style={{ width: '100%', height: '100%', pointerEvents: isIntroRunning ? 'none' : 'auto' }} onDoubleClick={onPaneDoubleClick}>
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
              onNodeClick={(event, node) => {
                event?.preventDefault?.();
                event?.stopPropagation?.();
                handleNodeClick(node.id, node.data?.raw);
              }}
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
                  title={t('expandAll')}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <ListTree size={14} />
                </button>
                {SCREENSHOT_BUTTON_ENABLED && (
                  <button
                    className="react-flow__controls-button"
                    onClick={handleCaptureVisibleView}
                    title={t('screenshotVisibleView')}
                    disabled={isCapturingScreenshot}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Camera size={14} />
                  </button>
                )}
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
      </GraphErrorBoundary>
    </div>
  );
};

export default FamilyGraph;
