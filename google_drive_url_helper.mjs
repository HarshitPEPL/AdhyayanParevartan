/**
 * Google Drive URL Helper
 * 
 * Google Drive provides two types of URLs:
 * 1. PREVIEW: https://drive.google.com/file/d/FILE_ID/preview
 *    → Opens embedded PDF viewer in the app
 * 2. DOWNLOAD: https://drive.google.com/uc?export=download&id=FILE_ID
 *    → Triggers download dialog
 * 
 * The lesson viewer automatically handles both!
 */

// =============================================
// UPDATED EBOOK_MAP - USE PREVIEW URLS
// =============================================

/**
 * RECOMMENDATION: Use PREVIEW URLs for in-app viewing
 * Format: https://drive.google.com/file/d/[FILE_ID]/preview
 * 
 * This provides:
 * ✅ Embedded Google Drive PDF viewer (no download)
 * ✅ Better mobile experience
 * ✅ No CORS issues
 * ✅ Built-in search and navigation
 */

const EBOOK_MAP_WITH_PREVIEW = {
  1: {
    'English': 'https://drive.google.com/file/d/FILE_ID_CLASS_1_ENGLISH/preview',
    'Hindi': 'https://drive.google.com/file/d/FILE_ID_CLASS_1_HINDI/preview',
    'Mathematics': 'https://drive.google.com/file/d/FILE_ID_CLASS_1_MATH/preview',
    'EVS': 'https://drive.google.com/file/d/FILE_ID_CLASS_1_EVS/preview'
  },
  // ... add other classes similarly
};

// =============================================
// HELPER FUNCTIONS
// =============================================

/**
 * Extract FILE_ID from any Google Drive URL format
 */
function extractGoogleDriveFileId(url) {
  if (!url) return null;
  
  // Format 1: https://drive.google.com/file/d/FILE_ID/view
  const match1 = url.match(/\/d\/([a-zA-Z0-9-_]+)\//);
  if (match1) return match1[1];
  
  // Format 2: https://drive.google.com/uc?id=FILE_ID
  const match2 = url.match(/id=([a-zA-Z0-9-_]+)/);
  if (match2) return match2[1];
  
  return null;
}

/**
 * Generate Google Drive Preview URL (for in-app viewing)
 */
function getGoogleDrivePreviewUrl(fileId) {
  return `https://drive.google.com/file/d/${fileId}/preview`;
}

/**
 * Generate Google Drive Download URL (for downloading)
 */
function getGoogleDriveDownloadUrl(fileId) {
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

/**
 * Convert any Google Drive URL to preview format
 */
function convertToPreviewUrl(url) {
  const fileId = extractGoogleDriveFileId(url);
  if (!fileId) return url;
  return getGoogleDrivePreviewUrl(fileId);
}

/**
 * Convert any Google Drive URL to download format
 */
function convertToDownloadUrl(url) {
  const fileId = extractGoogleDriveFileId(url);
  if (!fileId) return url;
  return getGoogleDriveDownloadUrl(fileId);
}

// =============================================
// USAGE EXAMPLES
// =============================================

/**
 * EXAMPLE 1: When storing in database seed script
 * 
 * // In seed_google_drive_materials.mjs
 * const downloadUrl = getGoogleDriveDownloadUrl(fileId);
 * // Result: https://drive.google.com/uc?export=download&id=FILE_ID
 * 
 * // Store this in database
 * await window.adhyayan.addMaterial(subjectId, 1, title, duration, instructor, downloadUrl);
 */

/**
 * EXAMPLE 2: When displaying in lesson page
 * 
 * // In lesson.js, the viewer automatically handles Google Drive URLs
 * // The lesson viewer detects .pdf extension and displays in <object> tag
 * 
 * // For better experience, convert to preview:
 * const previewUrl = convertToPreviewUrl(mat.file_url);
 * // Result: https://drive.google.com/file/d/FILE_ID/preview
 */

/**
 * EXAMPLE 3: Get both preview and download URLs
 * 
 * const fileId = extractGoogleDriveFileId(sharingUrl);
 * const preview = getGoogleDrivePreviewUrl(fileId);  // For viewing
 * const download = getGoogleDriveDownloadUrl(fileId); // For downloading
 */

// =============================================
// WHICH URL TYPE TO USE?
// =============================================

/**
 * PREVIEW URL: https://drive.google.com/file/d/FILE_ID/preview
 * ✅ Best for: In-app PDF viewing
 * ✅ Works in: <iframe>, <object>, new window
 * ✅ Provides: Google Drive viewer UI
 * ✅ No download popup
 * ✅ Mobile-friendly
 * 
 * DOWNLOAD URL: https://drive.google.com/uc?export=download&id=FILE_ID
 * ✅ Best for: Direct downloads, offline PDFs
 * ✅ Works in: Direct links, downloads
 * ✅ Triggers download dialog
 * ✅ Can be embedded in <object> tag
 * ✅ Bypass: Add &confirm=t to suppress confirmation
 * 
 * RECOMMENDATION FOR YOUR APP:
 * Use DOWNLOAD URL in database (it's more reliable for <object> tag)
 * The lesson viewer will handle it properly
 */

// =============================================
// EXPORT FOR USE IN OTHER FILES
// =============================================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    extractGoogleDriveFileId,
    getGoogleDrivePreviewUrl,
    getGoogleDriveDownloadUrl,
    convertToPreviewUrl,
    convertToDownloadUrl
  };
}
