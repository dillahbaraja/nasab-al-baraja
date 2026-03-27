export const initialFamilyData = [
  // Generation 1 (Awal/Paling Tua)
  { id: 'gen1_1', nameLatin: 'Ali', nameArab: 'علي', info: 'Kakek Canggah (Gen 1)' },
  
  // Generation 2
  { id: 'gen2_1', nameLatin: 'Hasan', nameArab: 'الحسن', fatherId: 'gen1_1', info: 'Kakek Buyut (Gen 2)' },
  { id: 'gen2_2', nameLatin: 'Husain', nameArab: 'الحسين', fatherId: 'gen1_1', info: 'Kakek Buyut (Gen 2)' },

  // Generation 3
  { id: 'gen3_1', nameLatin: 'Muhammad', nameArab: 'محمد', fatherId: 'gen2_1', info: 'Kakek (Gen 3)' },
  { id: 'gen3_2', nameLatin: 'Zaid', nameArab: 'زيد', fatherId: 'gen2_1', info: 'Kakek (Gen 3)' },
  { id: 'gen3_3', nameLatin: 'Abidin', nameArab: 'زين العابدين', fatherId: 'gen2_2', info: 'Kakek (Gen 3)' },

  // Generation 4 (Ayah)
  { id: 'gen4_1', nameLatin: 'Abdullah', nameArab: 'عبد الله', fatherId: 'gen3_1', info: 'Ayah (Gen 4)' },
  { id: 'gen4_2', nameLatin: 'Umar', nameArab: 'عمر', fatherId: 'gen3_2', info: 'Paman (Gen 4)' },
  { id: 'gen4_3', nameLatin: 'Baqir', nameArab: 'الباقر', fatherId: 'gen3_3', info: 'Ayah (Gen 4)' },

  // Generation 5 (Anak termuda)
  { id: 'gen5_1', nameLatin: 'Ahmad', nameArab: 'أحمد', fatherId: 'gen4_1', info: 'Anak (Gen 5)' },
  { id: 'gen5_2', nameLatin: 'Ja\'far', nameArab: 'جعفر', fatherId: 'gen4_3', info: 'Anak (Gen 5)' },
];

export const generateEdges = (familyNodes) => {
  const edges = [];
  const validIds = new Set(familyNodes.map(p => p.id));
  
  familyNodes.forEach(person => {
    // Patrilineal only - verify both parent and child exist in the list
    if (person.fatherId && validIds.has(person.fatherId)) {
      edges.push({
        id: `e-${person.fatherId}-${person.id}`,
        source: person.fatherId,
        target: person.id,
        type: 'smoothstep',
        animated: false
      });
    }
  });
  return edges;
};
