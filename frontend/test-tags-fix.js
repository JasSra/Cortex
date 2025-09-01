// Test script to verify the tags handling fix works correctly

// Mock note data with different tag formats
const testNotes = [
  { id: '1', title: 'Note 1', tags: ['tag1', 'tag2'] }, // Array format (expected)
  { id: '2', title: 'Note 2', tags: 'tag3,tag4' }, // String format (from API)
  { id: '3', title: 'Note 3', tags: '["tag5", "tag6"]' }, // JSON string format
  { id: '4', title: 'Note 4', tags: null }, // Null tags
  { id: '5', title: 'Note 5', tags: undefined }, // Undefined tags
  { id: '6', title: 'Note 6' }, // Missing tags property
]

// Function to safely extract tags (mirroring the fix in WorkspaceSidebar)
function extractTags(note) {
  let tags = []
  if (note.tags) {
    const rawTags = note.tags
    if (Array.isArray(rawTags)) {
      tags = rawTags
    } else if (typeof rawTags === 'string') {
      try {
        const parsed = JSON.parse(rawTags)
        tags = Array.isArray(parsed) ? parsed : []
      } catch {
        tags = rawTags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0)
      }
    }
  }
  return tags
}

// Test the fix
console.log('Testing tags extraction:')
testNotes.forEach(note => {
  const extractedTags = extractTags(note)
  console.log(`Note ${note.id}: ${note.title}`)
  console.log(`  Raw tags:`, note.tags)
  console.log(`  Extracted tags:`, extractedTags)
  console.log(`  Tags is array:`, Array.isArray(extractedTags))
  console.log('---')
})

// Test the allTags extraction (mirroring the fixed code)
console.log('\nTesting allTags extraction:')
const tagSet = new Set()
testNotes.forEach(note => {
  const tags = Array.isArray(note.tags) ? note.tags : extractTags(note)
  tags.forEach(tag => tagSet.add(tag))
})
const allTags = Array.from(tagSet).sort()
console.log('All unique tags:', allTags)
