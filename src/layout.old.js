const nodeWidth = 260;
const nodeHeight = 260;
const gapX = 30;  // Jarak horisontal antar node
const gapY = 100; // Jarak vertikal antar generasi

export const getLayoutedElements = (nodes, edges, layoutType = 'original') => {
  if (layoutType === 'pyramid') return getPyramidLayout(nodes, edges);
  if (layoutType === 'tidy') return getTidyLayout(nodes, edges);
  return getOriginalLayout(nodes, edges);
};

const getTidyLayout = (nodes, edges) => {
  const childrenMap = {};
  const inDegree = {};
  nodes.forEach(n => { childrenMap[n.id] = []; inDegree[n.id] = 0; });
  edges.forEach(e => {
    if (childrenMap[e.source]) {
      childrenMap[e.source].push(e.target);
      inDegree[e.target] += 1;
    }
  });

  const roots = nodes.filter(n => inDegree[n.id] === 0).map(n => n.id);
  const contours = {}; // node -> array of {left, right} for each depth relative to node's center
  const localX = {}; 
  
  const calculateLocalPositions = (id) => {
    const children = childrenMap[id];
    
    if (!children || children.length === 0) {
      contours[id] = [ { left: -nodeWidth/2, right: nodeWidth/2 } ];
      localX[id] = 0;
      return;
    }

    children.forEach(c => calculateLocalPositions(c));

    localX[children[0]] = 0;
    
    for (let i = 1; i < children.length; i++) {
        const childId = children[i];
        let maxShift = 0;
        
        for (let j = 0; j < i; j++) {
            const leftSib = children[j];
            const leftContour = contours[leftSib];
            const rightContour = contours[childId];
            
            const maxD = Math.min(leftContour.length, rightContour.length);
            for (let d = 0; d < maxD; d++) {
                const rightEdgeOfLeftSib = localX[leftSib] + leftContour[d].right;
                // Treat right sibling as starting at 0 to find necessary shift offset
                const leftEdgeOfRightSib = 0 + rightContour[d].left; 
                
                const shiftNeeded = rightEdgeOfLeftSib + gapX - leftEdgeOfRightSib;
                if (shiftNeeded > maxShift) {
                    maxShift = shiftNeeded;
                }
            }
        }
        
        // Ensure minimum physical padding between adjacent siblings (top-level nodes for that level)
        maxShift = Math.max(maxShift, localX[children[i-1]] + nodeWidth + gapX);
        localX[childId] = maxShift;
    }
    
    const firstChildX = localX[children[0]];
    const lastChildX = localX[children[children.length - 1]];
    const childrenCenter = (firstChildX + lastChildX) / 2;
    
    // Move children backwards so parent physically sits at 0 locally
    children.forEach(c => {
        localX[c] -= childrenCenter;
    });

    let myContour = [ { left: -nodeWidth/2, right: nodeWidth/2 } ]; // parent body is depth 0
    let maxDepth = Math.max(...children.map(c => contours[c].length));
    
    for (let d = 0; d < maxDepth; d++) {
        let minLeft = Infinity;
        let maxRight = -Infinity;
        children.forEach(c => {
            if (d < contours[c].length) {
                const absLeft = localX[c] + contours[c][d].left;
                const absRight = localX[c] + contours[c][d].right;
                if (absLeft < minLeft) minLeft = absLeft;
                if (absRight > maxRight) maxRight = absRight;
            }
        });
        myContour.push({ left: minLeft, right: maxRight });
    }
    contours[id] = myContour;
  };

  roots.forEach(r => calculateLocalPositions(r));
  
  const globalX = {};
  if (roots.length > 0) {
      globalX[roots[0]] = 0;
      for (let i = 1; i < roots.length; i++) {
        const rootId = roots[i];
        let maxShift = 0;
        
        for (let j = 0; j < i; j++) {
            const leftSib = roots[j];
            const leftContour = contours[leftSib];
            const rightContour = contours[rootId];
            
            const maxD = Math.min(leftContour.length, rightContour.length);
            for (let d = 0; d < maxD; d++) {
                const rightEdgeOfLeftSib = globalX[leftSib] + leftContour[d].right;
                const leftEdgeOfRightSib = 0 + rightContour[d].left;
                
                const shiftNeeded = rightEdgeOfLeftSib + gapX - leftEdgeOfRightSib;
                if (shiftNeeded > maxShift) {
                    maxShift = shiftNeeded;
                }
            }
        }
        maxShift = Math.max(maxShift, globalX[roots[i-1]] + nodeWidth + gapX);
        globalX[rootId] = maxShift;
      }
  }

  const pos = {};
  const calculateFinalPositions = (id, currentRelativeX, currentY) => {
      pos[id] = { x: currentRelativeX, y: currentY };
      const children = childrenMap[id] || [];
      children.forEach(c => {
          calculateFinalPositions(c, currentRelativeX + localX[c], currentY + nodeHeight + gapY);
      });
  };

  let minGlobalX = Infinity;
  roots.forEach(r => {
    calculateFinalPositions(r, globalX[r], 0);
  });
  
  Object.values(pos).forEach(p => {
    if (p.x < minGlobalX) minGlobalX = p.x;
  });

  const layoutedNodes = nodes.map(n => 
      pos[n.id] ? { ...n, position: { x: pos[n.id].x - minGlobalX, y: pos[n.id].y } } : n
  );

  return { nodes: layoutedNodes, edges };
};

const getOriginalLayout = (nodes, edges) => {
  const childrenMap = {};
  const inDegree = {};
  
  nodes.forEach(n => {
    childrenMap[n.id] = [];
    inDegree[n.id] = 0;
  });

  edges.forEach(e => {
    if (childrenMap[e.source]) {
      childrenMap[e.source].push(e.target);
      inDegree[e.target] += 1;
    }
  });

  const roots = nodes.filter(n => inDegree[n.id] === 0).map(n => n.id);
  const subtreeWidth = {};

  const calculateWidths = (id) => {
    const children = childrenMap[id];
    if (!children || children.length === 0) {
      subtreeWidth[id] = nodeWidth + gapX;
      return subtreeWidth[id];
    }
    let totalChildrenWidth = 0;
    children.forEach(childId => {
      totalChildrenWidth += calculateWidths(childId);
    });
    subtreeWidth[id] = Math.max(nodeWidth + gapX, totalChildrenWidth);
    return subtreeWidth[id];
  };

  roots.forEach(r => calculateWidths(r));
  const positions = {};

  const calculatePositions = (id, xLeft, yTop) => {
    if (!childrenMap[id]) return;
    const width = subtreeWidth[id];
    const children = childrenMap[id];

    if (!children || children.length === 0) {
      positions[id] = { x: xLeft + width / 2, y: yTop };
      return;
    }

    let childrenSumWidth = children.reduce((sum, cid) => sum + (subtreeWidth[cid] || 0), 0);
    let currentX = xLeft + (width - childrenSumWidth) / 2;

    children.forEach(childId => {
      calculatePositions(childId, currentX, yTop + nodeHeight + gapY);
      currentX += (subtreeWidth[childId] || 0);
    });

    const firstChildX = positions[children[0]]?.x ?? (xLeft + width / 2);
    const lastChildX  = positions[children[children.length - 1]]?.x ?? firstChildX;
    positions[id] = {
      x: (firstChildX + lastChildX) / 2,
      y: yTop
    };
  };

  let rootX = 0;
  roots.forEach(r => {
    calculatePositions(r, rootX, 0);
    rootX += subtreeWidth[r];
  });

  const layoutedNodes = nodes.map(n =>
    positions[n.id] ? { ...n, position: positions[n.id] } : n
  );

  return { nodes: layoutedNodes, edges };
};

const getPyramidLayout = (nodes, edges) => {
  const childrenMap = {};
  const inDegree = {};
  nodes.forEach(n => { childrenMap[n.id] = []; inDegree[n.id] = 0; });
  edges.forEach(e => {
    if (childrenMap[e.source]) {
      childrenMap[e.source].push(e.target);
      inDegree[e.target] = (inDegree[e.target] || 0) + 1;
    }
  });

  const roots = nodes.filter(n => inDegree[n.id] === 0).map(n => n.id);
  const levels = []; 
  const pos = {};

  const traverseData = (id, depth) => {
    if (!levels[depth]) levels[depth] = [];
    levels[depth].push(id);
    (childrenMap[id] || []).forEach(child => traverseData(child, depth + 1));
  };
  
  roots.forEach(r => traverseData(r, 0));

  let currentRootX = 0;
  roots.forEach(r => {
    pos[r] = currentRootX;
    currentRootX += nodeWidth + gapX;
  });

  for (let d = 1; d < levels.length; d++) {
    let row = levels[d];
    
    row.forEach(id => {
      const parentEdge = edges.find(e => e.target === id);
      if (parentEdge && pos[parentEdge.source] !== undefined) {
        const parentId = parentEdge.source;
        const siblings = childrenMap[parentId];
        const idx = siblings.indexOf(id);
        const parentX = pos[parentId];
        pos[id] = parentX + (idx - (siblings.length - 1) / 2) * (nodeWidth + gapX);
      } else {
        pos[id] = 0; 
      }
    });

    let segments = row.map(id => ({
      ids: [id],
      sumIdeal: pos[id],
      count: 1
    }));

    let merged;
    do {
      merged = false;
      let nextSegments = [];
      let current = segments[0];

      for (let i = 1; i < segments.length; i++) {
        let next = segments[i];
        
        let currentCenter = current.sumIdeal / current.count;
        let currentRight = currentCenter + (current.count * (nodeWidth + gapX)) / 2;
        
        let nextCenter = next.sumIdeal / next.count;
        let nextLeft = nextCenter - (next.count * (nodeWidth + gapX)) / 2;

        if (currentRight > nextLeft) {
          current.ids.push(...next.ids);
          current.sumIdeal += next.sumIdeal;
          current.count += next.count;
          merged = true;
        } else {
          nextSegments.push(current);
          current = next;
        }
      }
      nextSegments.push(current);
      segments = nextSegments;
    } while (merged);

    segments.forEach(seg => {
      let center = seg.sumIdeal / seg.count;
      let startX = center - ((seg.count - 1) * (nodeWidth + gapX)) / 2;
      seg.ids.forEach((id, i) => {
        pos[id] = startX + i * (nodeWidth + gapX);
      });
    });
  }

  const layoutedNodes = formatOutput(nodes, levels, pos, childrenMap);
  return { nodes: layoutedNodes, edges };
};

const formatOutput = (nodes, levels, pos, childrenMap) => {
  const layoutedNodes = nodes.map(n => {
    let depth = 0;
    for (let d = 0; d < levels.length; d++) {
      if (levels[d].includes(n.id)) {
        depth = d; break;
      }
    }
    return {
      ...n,
      position: {
        x: pos[n.id] || 0,
        y: depth * (nodeHeight + gapY)
      },
      data: {
        ...n.data,
        hasChildren: (childrenMap[n.id] || []).length > 0
      }
    };
  });

  const allXs = layoutedNodes.map(n => n.position.x);
  const minX = allXs.length > 0 ? Math.min(...allXs) : 0;
  
  return layoutedNodes.map(n => ({
    ...n,
    position: {
      ...n.position,
      x: n.position.x - minX
    }
  }));
};

export const createNodesFromData = (dataList) => {
  return dataList
    .filter(person => person && person.id)
    .map(person => ({
      id: String(person.id),
      type: 'customNode',
      origin: [0.5, 0],
      position: { x: 0, y: 0 }, 
      data: {
        arabicName: person.arabicName || '',
        englishName: person.englishName || person.name || '-',
        info: person.info || '',
        isHighlighted: false,
        isCollapsed: !!person.isCollapsed,
        hasChildren: !!person.hasChildren,
        isGlowing: !!person.isGlowing,
        raw: person
      }
    }));
};
