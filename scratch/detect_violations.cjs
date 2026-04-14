
const fs = require('fs');
const content = fs.readFileSync('src/FamilyGraph.jsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, index) => {
  if (line.match(/(use[A-Z][a-zA-Z]+|useReactFlow|useOnViewportChange)\(/)) {
    const indent = line.match(/^\s*/)[0].length;
    if (indent > 2) {
       console.log(`Potential violation at line ${index + 1}: ${line.trim()} (indent ${indent})`);
    }
  }
});
