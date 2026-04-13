const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'FamilyGraph.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// The problematic block is usually around handleRemoveChild
content = content.replace(/const handleRemoveChild = async \(childId\) => \{[\s\S]*?\};\s+const idsToDelete = [\s\S]*?deleteFailed'\)\);\s+\}\s+\};/, (match) => {
    // Keep only the first part (the migrated Supabase function)
    const firstEnd = match.indexOf('};') + 2;
    return match.substring(0, firstEnd);
});

fs.writeFileSync(filePath, content);
console.log("Cleaned up FamilyGraph.jsx syntax errors!");
