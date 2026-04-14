
const fs = require('fs');
const content = fs.readFileSync('src/FamilyGraph.jsx', 'utf8');
const lines = content.split('\n');
let hookCount = 0;
lines.forEach((line, index) => {
  const match = line.match(/(use[A-Z][a-zA-Z]+|useReactFlow|useOnViewportChange)\(/);
  if (match) {
    hookCount++;
    console.log(`${hookCount}: ${match[0]} at line ${index + 1}`);
  }
});
