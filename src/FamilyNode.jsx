import React, { useRef, useState, useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';

const FamilyNode = ({ id, data, selected }) => {
  const [interactionStage, setInteractionStage] = useState('none'); // 'none', 'pressing', 'hinting'
  const actionTimerRef = useRef(null);
  const hintTimerRef = useRef(null);
  const lastClickTimeRef = useRef(0);
  const touchStartPosRef = useRef(null);
  const isCancelledRef = useRef(false);

  const cleanup = useCallback(() => {
    if (actionTimerRef.current) clearTimeout(actionTimerRef.current);
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    actionTimerRef.current = null;
    hintTimerRef.current = null;
    touchStartPosRef.current = null;
    setInteractionStage('none');
  }, []);

  const handlePointerDown = (e) => {
    // Only handle primary button/touch
    if (e.button != null && e.button !== 0) return;
    if (!e.isPrimary) {
      cleanup();
      return;
    }

    const now = Date.now();
    const isDoubleClickCandidate = (now - lastClickTimeRef.current) < 350;
    lastClickTimeRef.current = now;

    if (isDoubleClickCandidate) {
      // It's a double click! Cancel any pending long-press details
      cleanup();
      isCancelledRef.current = true;
      return;
    }

    isCancelledRef.current = false;
    touchStartPosRef.current = { x: e.clientX, y: e.clientY };
    setInteractionStage('pressing');

    // Hint timer at 250ms
    hintTimerRef.current = setTimeout(() => {
      if (!isCancelledRef.current) {
        setInteractionStage('hinting');
      }
    }, 250);

    // Main action timer at 700ms
    actionTimerRef.current = setTimeout(() => {
      if (!isCancelledRef.current && data.onLongPress) {
        data.onLongPress(id, data.raw);
        cleanup();
      }
    }, 700);
  };

  const handlePointerMove = (e) => {
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

  const handlePointerUp = () => {
    isCancelledRef.current = true;
    cleanup();
  };

  const arabLength = data.arabicName ? data.arabicName.length : 0;
  let arabFontSize = '28px';
  if (arabLength > 50) arabFontSize = '16px';
  else if (arabLength > 30) arabFontSize = '20px';
  else if (arabLength > 15) arabFontSize = '24px';

  return (
    <div
      className={`family-node ${selected ? 'highlighted' : ''} ${interactionStage} ${data.isGlowing ? 'target-glow' : ''} ${data.hasChildren && data.isCollapsed ? 'has-collapsed-lineage' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onContextMenu={(e) => { e.preventDefault(); }}
      style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
    >
      <Handle type="target" position={Position.Top} />

      <div className="node-content" style={{ width: '100%' }}>
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
          <div className="node-name-latin" style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '12px' }}>
            {data.englishName}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};

export default FamilyNode;

