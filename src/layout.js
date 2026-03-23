const nodeWidth = 140;
const nodeHeight = 140;
const gapX = 40;  // Jarak horisontal antar node
const gapY = 120; // Jarak vertikal antar generasi

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
    const width = subtreeWidth[id];
    const centerX = xLeft + width / 2;
    
    positions[id] = {
      x: centerX - nodeWidth / 2,
      y: yTop
    };

    const children = childrenMap[id];
    if (children && children.length > 0) {
      let childrenSumWidth = children.reduce((sum, cid) => sum + subtreeWidth[cid], 0);
      let currentX = xLeft + (width - childrenSumWidth) / 2;
      
      children.forEach(childId => {
        calculatePositions(childId, currentX, yTop + nodeHeight + gapY);
        currentX += subtreeWidth[childId];
      });
    }
  };

  let rootX = 0;
  roots.forEach(r => {
    calculatePositions(r, rootX, 0);
    rootX += subtreeWidth[r];
  });

  nodes.forEach(n => {
    if (positions[n.id]) {
      n.position = positions[n.id];
    }
  });

  return { nodes, edges };
};

export const createNodesFromData = (dataList) => {
  return dataList.map(person => ({
    id: person.id,
    type: 'customNode',
    position: { x: 0, y: 0 }, 
    data: {
      nameArab: person.nameArab || '',
      nameLatin: person.nameLatin || person.name || '',
      info: person.info,
      isHighlighted: false,
      raw: person
    }
  }));
};
