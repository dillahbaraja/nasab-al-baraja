import React, { useRef } from 'react';
import { Handle, Position } from '@xyflow/react';

const FamilyNode = ({ id, data, selected }) => {
  const timerRef = useRef(null);

  const startPress = (e) => {
    // only start timer if it's main button or touch
    if (e.button != null && e.button !== 0) return;
    
    // reset any existing timer
    if (timerRef.current) clearTimeout(timerRef.current);
    
    timerRef.current = setTimeout(() => {
      if (data.onLongPress) {
        data.onLongPress(id, data.raw);
      }
    }, 500);
  };

  const cancelPress = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  return (
    <div 
      className={`family-node ${selected ? 'highlighted' : ''}`}
      onPointerDown={startPress}
      onPointerUp={cancelPress}
      onPointerLeave={cancelPress}
      onPointerCancel={cancelPress}
      onContextMenu={(e) => { e.preventDefault(); }}
      style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
    >
      <Handle type="target" position={Position.Top} />
      
      <div className="node-content">
        <div className="node-name-arab" style={{ fontSize: '28px', fontWeight: 'bold', fontFamily: 'serif', lineHeight: '1.2' }}>
          {data.nameArab}
        </div>
        {data.nameLatin && (
          <div className="node-name-latin" style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '8px' }}>
            {data.nameLatin}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};

export default FamilyNode;

