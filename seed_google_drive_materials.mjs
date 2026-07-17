/**
 * Seed Google Drive NCERT E-Books into the database
 * Run this AFTER you have Supabase set up with the schema
 * 
 * Usage: node seed_google_drive_materials.mjs
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Supabase credentials not found in .env file');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * Google Drive Direct Download Link Format:
 * https://drive.google.com/uc?export=download&id=FILE_ID
 * 
 * Extract FILE_ID from:
 * https://drive.google.com/file/d/FILE_ID/view?usp=sharing
 */

// Map of Class -> Subject -> Google Drive File ID
const EBOOK_MAP = {
  1: {
    'English': 'FILE_ID_CLASS_1_ENGLISH',
    'Hindi': 'FILE_ID_CLASS_1_HINDI',
    'Mathematics': 'FILE_ID_CLASS_1_MATH',
    'EVS': 'FILE_ID_CLASS_1_EVS'
  },
  2: {
    'English': 'FILE_ID_CLASS_2_ENGLISH',
    'Hindi': 'FILE_ID_CLASS_2_HINDI',
    'Mathematics': 'FILE_ID_CLASS_2_MATH',
    'EVS': 'FILE_ID_CLASS_2_EVS'
  },
  3: {
    'English': 'FILE_ID_CLASS_3_ENGLISH',
    'Hindi': 'FILE_ID_CLASS_3_HINDI',
    'Mathematics': 'FILE_ID_CLASS_3_MATH',
    'EVS': 'FILE_ID_CLASS_3_EVS'
  },
  4: {
    'English': 'FILE_ID_CLASS_4_ENGLISH',
    'Hindi': 'FILE_ID_CLASS_4_HINDI',
    'Mathematics': 'FILE_ID_CLASS_4_MATH',
    'EVS': 'FILE_ID_CLASS_4_EVS'
  },
  5: {
    'English': 'FILE_ID_CLASS_5_ENGLISH',
    'Hindi': 'FILE_ID_CLASS_5_HINDI',
    'Mathematics': 'FILE_ID_CLASS_5_MATH',
    'EVS': 'FILE_ID_CLASS_5_EVS'
  },
  6: {
    'English': 'FILE_ID_CLASS_6_ENGLISH',
    'Hindi': 'FILE_ID_CLASS_6_HINDI',
    'Mathematics': 'FILE_ID_CLASS_6_MATH',
    'Science': 'FILE_ID_CLASS_6_SCIENCE',
    'Social Studies': 'FILE_ID_CLASS_6_SOCIAL'
  },
  7: {
    'English': 'FILE_ID_CLASS_7_ENGLISH',
    'Hindi': 'FILE_ID_CLASS_7_HINDI',
    'Mathematics': 'FILE_ID_CLASS_7_MATH',
    'Science': 'FILE_ID_CLASS_7_SCIENCE',
    'Social Studies': 'FILE_ID_CLASS_7_SOCIAL'
  },
  8: {
    'English': 'FILE_ID_CLASS_8_ENGLISH',
    'Hindi': 'FILE_ID_CLASS_8_HINDI',
    'Mathematics': 'FILE_ID_CLASS_8_MATH',
    'Science': 'FILE_ID_CLASS_8_SCIENCE',
    'Social Studies': 'FILE_ID_CLASS_8_SOCIAL'
  },
  9: {
    'English': 'FILE_ID_CLASS_9_ENGLISH',
    'Hindi': 'FILE_ID_CLASS_9_HINDI',
    'Mathematics': 'FILE_ID_CLASS_9_MATH',
    'Science': 'FILE_ID_CLASS_9_SCIENCE',
    'Social Studies': 'FILE_ID_CLASS_9_SOCIAL'
  },
  10: {
    'English': 'FILE_ID_CLASS_10_ENGLISH',
    'Hindi': 'FILE_ID_CLASS_10_HINDI',
    'Mathematics': 'FILE_ID_CLASS_10_MATH',
    'Science': 'FILE_ID_CLASS_10_SCIENCE',
    'Social Studies': 'FILE_ID_CLASS_10_SOCIAL'
  },
  11: {
    'Mathematics': 'FILE_ID_CLASS_11_MATH',
    'Physics': 'FILE_ID_CLASS_11_PHYSICS',
    'Chemistry': 'FILE_ID_CLASS_11_CHEMISTRY',
    'Biology': 'FILE_ID_CLASS_11_BIOLOGY',
    'English': 'FILE_ID_CLASS_11_ENGLISH'
  },
  12: {
    'Mathematics': 'FILE_ID_CLASS_12_MATH',
    'Physics': 'FILE_ID_CLASS_12_PHYSICS',
    'Chemistry': 'FILE_ID_CLASS_12_CHEMISTRY',
    'Biology': 'FILE_ID_CLASS_12_BIOLOGY',
    'English': 'FILE_ID_CLASS_12_ENGLISH'
  }
};

/**
 * Convert Google Drive FILE_ID to direct download URL
 */
function getGoogleDriveDownloadUrl(fileId) {
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

/**
 * Seed the database with e-books
 */
async function seedEbooks() {
  try {
    console.log('🌱 Starting E-Book Seeding...\n');

    for (const [classNum, subjects] of Object.entries(EBOOK_MAP)) {
      for (const [subjectName, fileId] of Object.entries(subjects)) {
        // Skip placeholder IDs
        if (fileId.includes('FILE_ID')) {
          console.log(`⏭️  Skipping ${subjectName} (Class ${classNum}) - FILE_ID not set`);
          continue;
        }

        // Get subject_id
        const { data: subjectData, error: subjectError } = await supabase
          .from('subjects')
          .select('subject_id')
          .eq('subject_name', subjectName)
          .eq('class_number', parseInt(classNum))
          .single();

        if (subjectError || !subjectData) {
          console.log(`⚠️  Subject not found: ${subjectName} (Class ${classNum})`);
          continue;
        }

        const subjectId = subjectData.subject_id;
        const downloadUrl = getGoogleDriveDownloadUrl(fileId);
        const title = `${subjectName} E-Book (Class ${classNum})`;

        // Insert material
        const { error: insertError } = await supabase
          .from('learning_materials')
          .insert([
            {
              subject_id: subjectId,
              format_id: 1, // 1 = E-Book
              title: title,
              duration_lessons: 'Full Textbook',
              instructor_name: 'NCERT',
              file_url: downloadUrl,
              description: `NCERT ${subjectName} Textbook for Class ${classNum}`
            }
          ]);

        if (insertError) {
          console.error(`❌ Error adding ${title}:`, insertError.message);
        } else {
          console.log(`✅ Added: ${title}`);
        }
      }
    }

    console.log('\n🎉 Seeding complete!');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

// Run seeding
seedEbooks();
