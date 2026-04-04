export const initialFamilyData = [
  // Generation 1 (Awal/Paling Tua)
  { id: 'gen1_1', englishName: 'Ali', arabicName: 'علي', info: 'Kakek Canggah (Gen 1)' },
  
  // Generation 2
  { id: 'gen2_1', englishName: 'Hasan', arabicName: 'الحسن', fatherId: 'gen1_1', info: 'Kakek Buyut (Gen 2)' },
  { id: 'gen2_2', englishName: 'Husain', arabicName: 'الحسين', fatherId: 'gen1_1', info: 'Kakek Buyut (Gen 2)' },

  // Generation 3
  { id: 'gen3_1', englishName: 'Muhammad', arabicName: 'محمد', fatherId: 'gen2_1', info: 'Kakek (Gen 3)' },
  { id: 'gen3_2', englishName: 'Zaid', arabicName: 'زيد', fatherId: 'gen2_1', info: 'Kakek (Gen 3)' },
  { id: 'gen3_3', englishName: 'Abidin', arabicName: 'زين العابدين', fatherId: 'gen2_2', info: 'Kakek (Gen 3)' },

  // Generation 4 (Ayah)
  { id: 'gen4_1', englishName: 'Abdullah', arabicName: 'عبد الله', fatherId: 'gen3_1', info: 'Ayah (Gen 4)' },
  { id: 'gen4_2', englishName: 'Umar', arabicName: 'عمر', fatherId: 'gen3_2', info: 'Paman (Gen 4)' },
  { id: 'gen4_3', englishName: 'Baqir', arabicName: 'الباقر', fatherId: 'gen3_3', info: 'Ayah (Gen 4)' },

  // Generation 5 (Anak termuda)
  { id: 'gen5_1', englishName: 'Ahmad', arabicName: 'أحمد', fatherId: 'gen4_1', info: 'Anak (Gen 5)' },
  { id: 'gen5_2', englishName: 'Ja\'far', arabicName: 'جعفر', fatherId: 'gen4_3', info: 'Anak (Gen 5)' },
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
        animated: false,
        style: { strokeWidth: 2.5, stroke: 'var(--edge-color)' }
      });
    }
  });
  return edges;
};
