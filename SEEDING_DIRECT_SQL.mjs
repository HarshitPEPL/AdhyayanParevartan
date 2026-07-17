/**
 * ALTERNATIVE: Direct SQL Seeding (Run in Supabase SQL Editor)
 * 
 * If you prefer running SQL directly instead of the Node.js script:
 * 
 * 1. Go to Supabase Dashboard → SQL Editor
 * 2. Create new query
 * 3. Replace FILE_IDs below with your actual Google Drive file IDs
 * 4. Run the query
 * 
 * FILE_ID FORMAT: Extract from https://drive.google.com/file/d/[FILE_ID]/view?usp=sharing
 * DOWNLOAD URL: https://drive.google.com/uc?export=download&id=[FILE_ID]
 */

-- =============================================
-- CLASS 1 E-BOOKS
-- =============================================

-- English Class 1
INSERT INTO learning_materials (subject_id, format_id, title, duration_lessons, instructor_name, file_url)
SELECT subject_id, 1, 'English E-Book (Class 1)', 'Full Textbook', 'NCERT', 'https://drive.google.com/uc?export=download&id=FILE_ID_CLASS_1_ENGLISH'
FROM subjects WHERE subject_name = 'English' AND class_number = 1
ON CONFLICT DO NOTHING;

-- Hindi Class 1
INSERT INTO learning_materials (subject_id, format_id, title, duration_lessons, instructor_name, file_url)
SELECT subject_id, 1, 'Hindi E-Book (Class 1)', 'Full Textbook', 'NCERT', 'https://drive.google.com/uc?export=download&id=FILE_ID_CLASS_1_HINDI'
FROM subjects WHERE subject_name = 'Hindi' AND class_number = 1
ON CONFLICT DO NOTHING;

-- Mathematics Class 1
INSERT INTO learning_materials (subject_id, format_id, title, duration_lessons, instructor_name, file_url)
SELECT subject_id, 1, 'Mathematics E-Book (Class 1)', 'Full Textbook', 'NCERT', 'https://drive.google.com/uc?export=download&id=FILE_ID_CLASS_1_MATH'
FROM subjects WHERE subject_name = 'Mathematics' AND class_number = 1
ON CONFLICT DO NOTHING;

-- EVS Class 1
INSERT INTO learning_materials (subject_id, format_id, title, duration_lessons, instructor_name, file_url)
SELECT subject_id, 1, 'EVS E-Book (Class 1)', 'Full Textbook', 'NCERT', 'https://drive.google.com/uc?export=download&id=FILE_ID_CLASS_1_EVS'
FROM subjects WHERE subject_name = 'EVS' AND class_number = 1
ON CONFLICT DO NOTHING;

-- =============================================
-- CLASS 2 E-BOOKS
-- =============================================

-- English Class 2
INSERT INTO learning_materials (subject_id, format_id, title, duration_lessons, instructor_name, file_url)
SELECT subject_id, 1, 'English E-Book (Class 2)', 'Full Textbook', 'NCERT', 'https://drive.google.com/uc?export=download&id=FILE_ID_CLASS_2_ENGLISH'
FROM subjects WHERE subject_name = 'English' AND class_number = 2
ON CONFLICT DO NOTHING;

-- Hindi Class 2
INSERT INTO learning_materials (subject_id, format_id, title, duration_lessons, instructor_name, file_url)
SELECT subject_id, 1, 'Hindi E-Book (Class 2)', 'Full Textbook', 'NCERT', 'https://drive.google.com/uc?export=download&id=FILE_ID_CLASS_2_HINDI'
FROM subjects WHERE subject_name = 'Hindi' AND class_number = 2
ON CONFLICT DO NOTHING;

-- Mathematics Class 2
INSERT INTO learning_materials (subject_id, format_id, title, duration_lessons, instructor_name, file_url)
SELECT subject_id, 1, 'Mathematics E-Book (Class 2)', 'Full Textbook', 'NCERT', 'https://drive.google.com/uc?export=download&id=FILE_ID_CLASS_2_MATH'
FROM subjects WHERE subject_name = 'Mathematics' AND class_number = 2
ON CONFLICT DO NOTHING;

-- EVS Class 2
INSERT INTO learning_materials (subject_id, format_id, title, duration_lessons, instructor_name, file_url)
SELECT subject_id, 1, 'EVS E-Book (Class 2)', 'Full Textbook', 'NCERT', 'https://drive.google.com/uc?export=download&id=FILE_ID_CLASS_2_EVS'
FROM subjects WHERE subject_name = 'EVS' AND class_number = 2
ON CONFLICT DO NOTHING;

-- =============================================
-- CLASS 3 E-BOOKS
-- =============================================

-- English Class 3
INSERT INTO learning_materials (subject_id, format_id, title, duration_lessons, instructor_name, file_url)
SELECT subject_id, 1, 'English E-Book (Class 3)', 'Full Textbook', 'NCERT', 'https://drive.google.com/uc?export=download&id=FILE_ID_CLASS_3_ENGLISH'
FROM subjects WHERE subject_name = 'English' AND class_number = 3
ON CONFLICT DO NOTHING;

-- Hindi Class 3
INSERT INTO learning_materials (subject_id, format_id, title, duration_lessons, instructor_name, file_url)
SELECT subject_id, 1, 'Hindi E-Book (Class 3)', 'Full Textbook', 'NCERT', 'https://drive.google.com/uc?export=download&id=FILE_ID_CLASS_3_HINDI'
FROM subjects WHERE subject_name = 'Hindi' AND class_number = 3
ON CONFLICT DO NOTHING;

-- Mathematics Class 3
INSERT INTO learning_materials (subject_id, format_id, title, duration_lessons, instructor_name, file_url)
SELECT subject_id, 1, 'Mathematics E-Book (Class 3)', 'Full Textbook', 'NCERT', 'https://drive.google.com/uc?export=download&id=FILE_ID_CLASS_3_MATH'
FROM subjects WHERE subject_name = 'Mathematics' AND class_number = 3
ON CONFLICT DO NOTHING;

-- EVS Class 3
INSERT INTO learning_materials (subject_id, format_id, title, duration_lessons, instructor_name, file_url)
SELECT subject_id, 1, 'EVS E-Book (Class 3)', 'Full Textbook', 'NCERT', 'https://drive.google.com/uc?export=download&id=FILE_ID_CLASS_3_EVS'
FROM subjects WHERE subject_name = 'EVS' AND class_number = 3
ON CONFLICT DO NOTHING;

-- =============================================
-- CLASS 4-5 SIMILAR PATTERN (Classes 1-5: English, Hindi, Math, EVS)
-- =============================================

-- CLASS 6-10 (English, Hindi, Mathematics, Science, Social Studies)

-- =============================================
-- CLASS 6 E-BOOKS
-- =============================================

-- English Class 6
INSERT INTO learning_materials (subject_id, format_id, title, duration_lessons, instructor_name, file_url)
SELECT subject_id, 1, 'English E-Book (Class 6)', 'Full Textbook', 'NCERT', 'https://drive.google.com/uc?export=download&id=FILE_ID_CLASS_6_ENGLISH'
FROM subjects WHERE subject_name = 'English' AND class_number = 6
ON CONFLICT DO NOTHING;

-- Science Class 6
INSERT INTO learning_materials (subject_id, format_id, title, duration_lessons, instructor_name, file_url)
SELECT subject_id, 1, 'Science E-Book (Class 6)', 'Full Textbook', 'NCERT', 'https://drive.google.com/uc?export=download&id=FILE_ID_CLASS_6_SCIENCE'
FROM subjects WHERE subject_name = 'Science' AND class_number = 6
ON CONFLICT DO NOTHING;

-- Mathematics Class 6
INSERT INTO learning_materials (subject_id, format_id, title, duration_lessons, instructor_name, file_url)
SELECT subject_id, 1, 'Mathematics E-Book (Class 6)', 'Full Textbook', 'NCERT', 'https://drive.google.com/uc?export=download&id=FILE_ID_CLASS_6_MATH'
FROM subjects WHERE subject_name = 'Mathematics' AND class_number = 6
ON CONFLICT DO NOTHING;

-- Social Studies Class 6
INSERT INTO learning_materials (subject_id, format_id, title, duration_lessons, instructor_name, file_url)
SELECT subject_id, 1, 'Social Studies E-Book (Class 6)', 'Full Textbook', 'NCERT', 'https://drive.google.com/uc?export=download&id=FILE_ID_CLASS_6_SOCIAL'
FROM subjects WHERE subject_name = 'Social Studies' AND class_number = 6
ON CONFLICT DO NOTHING;

-- Hindi Class 6
INSERT INTO learning_materials (subject_id, format_id, title, duration_lessons, instructor_name, file_url)
SELECT subject_id, 1, 'Hindi E-Book (Class 6)', 'Full Textbook', 'NCERT', 'https://drive.google.com/uc?export=download&id=FILE_ID_CLASS_6_HINDI'
FROM subjects WHERE subject_name = 'Hindi' AND class_number = 6
ON CONFLICT DO NOTHING;

-- =============================================
-- CLASS 11-12 (Math, Physics, Chemistry, Biology, English)
-- =============================================

-- Mathematics Class 11
INSERT INTO learning_materials (subject_id, format_id, title, duration_lessons, instructor_name, file_url)
SELECT subject_id, 1, 'Mathematics E-Book (Class 11)', 'Full Textbook', 'NCERT', 'https://drive.google.com/uc?export=download&id=FILE_ID_CLASS_11_MATH'
FROM subjects WHERE subject_name = 'Mathematics' AND class_number = 11
ON CONFLICT DO NOTHING;

-- Physics Class 11
INSERT INTO learning_materials (subject_id, format_id, title, duration_lessons, instructor_name, file_url)
SELECT subject_id, 1, 'Physics E-Book (Class 11)', 'Full Textbook', 'NCERT', 'https://drive.google.com/uc?export=download&id=FILE_ID_CLASS_11_PHYSICS'
FROM subjects WHERE subject_name = 'Physics' AND class_number = 11
ON CONFLICT DO NOTHING;

-- Chemistry Class 11
INSERT INTO learning_materials (subject_id, format_id, title, duration_lessons, instructor_name, file_url)
SELECT subject_id, 1, 'Chemistry E-Book (Class 11)', 'Full Textbook', 'NCERT', 'https://drive.google.com/uc?export=download&id=FILE_ID_CLASS_11_CHEMISTRY'
FROM subjects WHERE subject_name = 'Chemistry' AND class_number = 11
ON CONFLICT DO NOTHING;

-- Biology Class 11
INSERT INTO learning_materials (subject_id, format_id, title, duration_lessons, instructor_name, file_url)
SELECT subject_id, 1, 'Biology E-Book (Class 11)', 'Full Textbook', 'NCERT', 'https://drive.google.com/uc?export=download&id=FILE_ID_CLASS_11_BIOLOGY'
FROM subjects WHERE subject_name = 'Biology' AND class_number = 11
ON CONFLICT DO NOTHING;

-- English Class 11
INSERT INTO learning_materials (subject_id, format_id, title, duration_lessons, instructor_name, file_url)
SELECT subject_id, 1, 'English E-Book (Class 11)', 'Full Textbook', 'NCERT', 'https://drive.google.com/uc?export=download&id=FILE_ID_CLASS_11_ENGLISH'
FROM subjects WHERE subject_name = 'English' AND class_number = 11
ON CONFLICT DO NOTHING;

-- =============================================
-- VERIFICATION QUERY (Run this to check seeded materials)
-- =============================================

SELECT 
  m.material_id,
  m.title,
  s.subject_name,
  s.class_number,
  m.file_url
FROM learning_materials m
JOIN subjects s ON m.subject_id = s.subject_id
ORDER BY s.class_number, s.subject_name;

-- =============================================
-- INSTRUCTIONS
-- =============================================

/**
 * STEP 1: Replace all FILE_ID_* placeholders with actual Google Drive file IDs
 * 
 * Example:
 * Before: 'https://drive.google.com/uc?export=download&id=FILE_ID_CLASS_1_ENGLISH'
 * After:  'https://drive.google.com/uc?export=download&id=1a2b3c4d5e6f7g8h9i0j'
 *
 * STEP 2: Select all queries and run in Supabase SQL Editor
 * 
 * STEP 3: Run the verification query to confirm materials were added
 * 
 * CLASS STRUCTURE:
 * - Classes 1-5: English, Hindi, Mathematics, EVS
 * - Classes 6-10: English, Hindi, Mathematics, Science, Social Studies
 * - Classes 11-12: Mathematics, Physics, Chemistry, Biology, English
 */
