const nodeWidth = 260;
const nodeHeight = 260;
const gapX = 30;  // Jarak horisontal antar node
const gapY = 100; // Jarak vertikal antar generasi

export const getLayoutedElements = (nodes, edges) => {
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
