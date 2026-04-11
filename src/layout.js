const nodeWidth = 240;
const nodeHeight = 200;
const gapX = 20;  // Jarak horisontal antar node
const gapY = 90;  // Jarak vertikal antar generasi

export const getLayoutedElements = (nodes, edges, direction = 'TB') => {
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
    if (!childrenMap[id]) return; // Safety
    const width = subtreeWidth[id];
    const children = childrenMap[id];

    if (!children || children.length === 0) {
      // Leaf node: center within its allocated width slot
      positions[id] = { x: xLeft + width / 2, y: yTop };
      return;
    }

    // 1. Place all children first (subtree widths guarantee no overlap)
    let childrenSumWidth = children.reduce((sum, cid) => sum + (subtreeWidth[cid] || 0), 0);
    let currentX = xLeft + (width - childrenSumWidth) / 2;

    children.forEach(childId => {
      calculatePositions(childId, currentX, yTop + nodeHeight + gapY);
      currentX += (subtreeWidth[childId] || 0);
    });

    // 2. Parent sits at midpoint of first & last immediate child
    //    → balanced even when siblings have very different subtree sizes
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

export const createNodesFromData = (dataList) => {
  return dataList
    .filter(person => person && person.id) // defensive check
    .map(person => ({
      id: String(person.id),
      type: 'customNode',
      origin: [0.5, 0], // Anchor node to its center-top to guarantee perfect alignment
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
