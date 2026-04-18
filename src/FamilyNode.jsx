import React, { useRef, useState, useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';

const FamilyNode = ({ id, data, selected }) => {
  const isMobileDevice = (() => {
    if (typeof navigator === 'undefined') return false;
    return /iPhone|iPod|Android/i.test(navigator.userAgent)
      || (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)')?.matches);
  })();
  const [interactionStage, setInteractionStage] = useState('none'); // 'none', 'pressing', 'hinting'
  const actionTimerRef = useRef(null);
  const hintTimerRef = useRef(null);
  const touchStartPosRef = useRef(null);
  const isCancelledRef = useRef(false);
  const didLongPressRef = useRef(false);
  const suppressClickRef = useRef(false);

  const cleanup = useCallback(() => {
    if (actionTimerRef.current) clearTimeout(actionTimerRef.current);
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    actionTimerRef.current = null;
    hintTimerRef.current = null;
    touchStartPosRef.current = null;
    setInteractionStage('none');
  }, []);

  const handlePointerDown = (e) => {
    if (isMobileDevice) return;

    // Only handle primary button/touch
    if (e.button != null && e.button !== 0) return;
    if (!e.isPrimary) {
      cleanup();
      return;
    }

    isCancelledRef.current = false;
    didLongPressRef.current = false;
    suppressClickRef.current = false;
    touchStartPosRef.current = { x: e.clientX, y: e.clientY };
    setInteractionStage('pressing');

    if (e.currentTarget.setPointerCapture) {
      e.currentTarget.setPointerCapture(e.pointerId);
    }

    // Hint timer at 160ms
    hintTimerRef.current = setTimeout(() => {
      if (!isCancelledRef.current) {
        setInteractionStage('hinting');
      }
    }, 160);

    // Main action timer at 450ms
    actionTimerRef.current = setTimeout(() => {
      if (!isCancelledRef.current && data.onLongPress) {
        didLongPressRef.current = true;
        data.onLongPress(id, data.raw);
        cleanup();
      }
    }, 450);
  };

  const handlePointerMove = (e) => {
    if (isMobileDevice) return;

    if (!touchStartPosRef.current || isCancelledRef.current) return;

    const dx = e.clientX - touchStartPosRef.current.x;
    const dy = e.clientY - touchStartPosRef.current.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // If movement exceeds threshold (12px), cancel long press
    if (distance > 12) {
      isCancelledRef.current = true;
      cleanup();
    }
  };

  const cancelInteraction = useCallback((e) => {
    if (isMobileDevice) return;

    if (e?.currentTarget?.releasePointerCapture && e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    isCancelledRef.current = true;
    cleanup();
  }, [cleanup]);

  const handlePointerUp = (e) => {
    if (isMobileDevice) return;

    if (e.currentTarget.releasePointerCapture && e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }

    suppressClickRef.current = didLongPressRef.current;
    isCancelledRef.current = true;
    cleanup();
  };

  const handleClickCapture = (e) => {
    if (isMobileDevice) return;

    if (!suppressClickRef.current) return;
    suppressClickRef.current = false;
    e.preventDefault();
    e.stopPropagation();
  };

  const arabLength = data.arabicName ? data.arabicName.length : 0;
  let arabFontSize = '28px';
  if (arabLength > 50) arabFontSize = '16px';
  else if (arabLength > 30) arabFontSize = '20px';
  else if (arabLength > 15) arabFontSize = '24px';

  return (
    <div
      className={`family-node ${selected ? 'highlighted' : ''} ${interactionStage} ${data.isGlowing ? 'target-glow' : ''} ${data.isPathGlow ? 'path-glow' : ''} ${data.isPending ? 'pending-node' : ''} ${data.hasChildren && data.isCollapsed ? 'is-expandable' : ''} ${data.hasChildren && data.isCollapsed ? 'has-collapsed-lineage' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={cancelInteraction}
      onPointerCancel={cancelInteraction}
      onClickCapture={handleClickCapture}
      onContextMenu={(e) => { e.preventDefault(); }}
      style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
    >
      <Handle type="target" position={Position.Top} />

      <div className="node-content" style={{ width: '100%' }}>
        {data.isPending && (
          <div className="node-pending-badge">
            {data.pendingLabel}
          </div>
        )}
        {data.info && (
          <div className="node-info" style={{
            fontSize: '11px',
            color: 'var(--text-secondary)',
            opacity: 0.75,
            marginBottom: '6px',
            fontStyle: 'italic',
            lineHeight: '1.3'
          }}>
            {data.info}
          </div>
        )}
        <div className="node-name-arab" style={{
          fontSize: arabFontSize,
          fontWeight: 'bold',
          fontFamily: 'serif',
          lineHeight: '1.4',
          wordBreak: 'break-word'
        }}>
          {data.arabicName}
        </div>
        {data.englishName && (
          <div className="node-name-latin" style={{
            fontSize: '14px',
            color: 'var(--text-secondary)',
            marginTop: '12px'
          }}>
            {data.englishName}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};

export default FamilyNode;

