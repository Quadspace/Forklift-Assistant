// Simple test for PDF reference detection
const { detectPageReferences } = require('./src/app/utils/pdfReferences.ts');

// Test content similar to what you showed in the screenshot
const testContent = `
The identification of loose or faulty components and damage [5, pp. 25-31]. 
Regular inspection of the forklift each day to ensure safety and proper functioning of the equipment.
`;

console.log('Testing PDF reference detection...');
console.log('Test content:', testContent);

try {
  const references = detectPageReferences(testContent);
  console.log('\nDetected references:', references);
  
  references.forEach((ref, index) => {
    console.log(`\nReference ${index + 1}:`);
    console.log(`  Full match: "${ref.fullMatch}"`);
    console.log(`  Start page: ${ref.startPage}`);
    console.log(`  End page: ${ref.endPage}`);
    console.log(`  Document number: ${ref.documentNumber}`);
    console.log(`  Match index: ${ref.matchIndex}`);
    console.log(`  Search text: ${ref.searchText}`);
  });
  
  if (references.length === 0) {
    console.log('\n❌ No references detected! This indicates an issue with the regex patterns.');
  } else {
    console.log(`\n✅ Successfully detected ${references.length} reference(s)!`);
  }
} catch (error) {
  console.error('Error testing PDF references:', error);
} 