/**
 * Helper to extract Google Drive File IDs and generate EBOOK_MAP
 * 
 * Instructions:
 * 1. Go to each Class folder in your Google Drive
 * 2. Right-click on each PDF and select "Get link"
 * 3. Copy the link (format: https://drive.google.com/file/d/FILE_ID/view?usp=sharing)
 * 4. Extract FILE_ID (the long alphanumeric string between /d/ and /view)
 * 5. Paste links in the DRIVE_LINKS array below
 * 6. Run: node extract_drive_ids.mjs
 * 7. Copy output and paste into seed_google_drive_materials.mjs's EBOOK_MAP
 */

// Paste your Google Drive sharing links here
const DRIVE_LINKS = [
  // Class 1
  'https://drive.google.com/file/d/YOUR_FILE_ID_HERE/view?usp=sharing',
  // Add more links...
];

/**
 * Extract FILE_ID from Google Drive sharing link
 */
function extractFileId(url) {
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)\//);
  return match ? match[1] : null;
}

/**
 * Parse link and prompt for subject/class
 */
async function parseLinks() {
  console.log('📋 Google Drive File ID Extractor\n');
  console.log('📌 FORMAT: https://drive.google.com/file/d/FILE_ID/view?usp=sharing\n');

  const mapping = {};

  for (const link of DRIVE_LINKS) {
    if (!link.trim()) continue;

    const fileId = extractFileId(link);
    if (!fileId) {
      console.warn(`⚠️  Invalid link format: ${link}`);
      continue;
    }

    console.log(`\n📄 File ID: ${fileId}`);
    console.log(`   Link: ${link}`);
    console.log(`   Download URL: https://drive.google.com/uc?export=download&id=${fileId}`);
    
    mapping[fileId] = link;
  }

  console.log('\n\n📊 EXTRACTED FILE IDs:');
  console.log(JSON.stringify(mapping, null, 2));
  
  console.log('\n\n📝 INSTRUCTIONS TO POPULATE EBOOK_MAP:');
  console.log('1. Note the FILE_ID for each class/subject');
  console.log('2. Update seed_google_drive_materials.mjs with these FILE_IDs');
  console.log('3. Example: \'English\': \'1a2b3c4d5e6f7g8h9i0j\' (the FILE_ID value)');
}

parseLinks();

/**
 * AUTOMATED MAPPING HELPER
 * 
 * Use this format to quickly generate the mapping:
 * 
 * const CLASS_AND_SUBJECT = {
 *   1: { English: 'FILE_ID', Hindi: 'FILE_ID', Mathematics: 'FILE_ID', EVS: 'FILE_ID' },
 *   2: { English: 'FILE_ID', Hindi: 'FILE_ID', Mathematics: 'FILE_ID', EVS: 'FILE_ID' },
 *   // ... and so on
 * };
 * 
 * FILE_ID is the part between /d/ and /view in the sharing link
 */
