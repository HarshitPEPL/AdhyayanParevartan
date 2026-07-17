# 📚 Google Drive E-Book Integration - Setup Complete

**Status:** ✅ All tools ready - You can now link your NCERT e-books to the app

## What's Been Created

### 1️⃣ Main Seeding Script
**File:** `seed_google_drive_materials.mjs`
- Connects to your Supabase database
- Maps Google Drive FILE_IDs to class/subject combinations
- Automatically inserts materials with correct metadata
- **ACTION:** Replace placeholder FILE_IDs with your actual Drive file IDs

### 2️⃣ Alternative SQL Approach  
**File:** `SEEDING_DIRECT_SQL.mjs`
- Copy-paste into Supabase SQL Editor
- For when you prefer direct SQL
- Replace FILE_ID placeholders, run queries

### 3️⃣ Helper Utilities
**File:** `google_drive_url_helper.mjs`
- Functions to extract FILE_IDs from sharing links
- Convert between preview and download URLs
- Reusable for future enhancements

### 4️⃣ ID Extraction Tool
**File:** `extract_drive_ids.mjs`
- Helper to process multiple Drive links
- Extracts FILE_IDs and generates mapping format

### 5️⃣ Complete Guide
**File:** `GOOGLE_DRIVE_SEEDING.md`
- Step-by-step instructions with examples
- Troubleshooting section
- Database schema reference

---

## 🚀 Quick Start (5 Steps)

```
1. Extract FILE_IDs from your Google Drive PDFs
   └─ Right-click PDF → Get link → Copy FILE_ID

2. Update seed_google_drive_materials.mjs
   └─ Replace placeholder FILE_IDs with actual ones

3. Verify Supabase connection
   └─ Test in app's Supabase Manager

4. Run: node seed_google_drive_materials.mjs
   └─ Watch for "✅ Added" confirmations

5. Test in app
   └─ Login → Select Class → My Library → Click E-Book
```

---

## 📋 What Happens When You Seed

The script will create entries in your `learning_materials` table:

**Example Entry:**
```
Title:             English E-Book (Class 1)
Subject:           English (Class 1)
Format:            E-Book (format_id=1)
Duration:          Full Textbook
Instructor:        NCERT
File URL:          https://drive.google.com/uc?export=download&id=1a2b...
```

**In the App:**
```
Student selects "Class 1"
       ↓
Goes to "My Library" (Courses page)
       ↓
Sees "English E-Book (Class 1)"
       ↓
Clicks it
       ↓
PDF opens in fullscreen viewer
       ↓
Can read or download
```

---

## 📊 What Gets Populated

**Total Materials by Class:**
- **Classes 1-5:** 4 subjects × 5 classes = 20 materials
- **Classes 6-10:** 5 subjects × 5 classes = 25 materials  
- **Classes 11-12:** 5 subjects × 2 classes = 10 materials
- **TOTAL: ~55 E-Books** (if all have PDFs)

**Subjects by Class:**
```
Classes 1-5:    English, Hindi, Mathematics, EVS
Classes 6-10:   English, Hindi, Mathematics, Science, Social Studies
Classes 11-12:  Mathematics, Physics, Chemistry, Biology, English
```

---

## ✅ Verification After Seeding

Check these to confirm it worked:

1. **Supabase:** Query `learning_materials` table → should show new rows
2. **App Login:** `rahul@example.com` / `password123`
3. **Select Class:** Choose any class 1-12
4. **My Library:** Should show E-Books matching that class
5. **Click PDF:** Opens in viewer (can read fullscreen)

---

## 🔗 Google Drive Integration How-To

### Getting FILE_ID from Sharing Link

```
Sharing Link:
https://drive.google.com/file/d/[FILE_ID]/view?usp=sharing
                             ^^^^^^^^^^^^^^^^^
                             This part
```

### Two URL Types

**Preview URL** (for in-app viewing):
```
https://drive.google.com/file/d/[FILE_ID]/preview
```

**Download URL** (what the app uses):
```
https://drive.google.com/uc?export=download&id=[FILE_ID]
```

Both work perfectly in the app's PDF viewer!

---

## 🛠️ Two Ways to Seed

### Option A: Node.js Script (Recommended)
```bash
node seed_google_drive_materials.mjs
```
✅ Automatic FILE_ID handling
✅ Better error messages
✅ Can rerun multiple times safely

### Option B: Direct SQL
1. Open Supabase Dashboard → SQL Editor
2. Copy from `SEEDING_DIRECT_SQL.mjs`
3. Replace FILE_ID_* with actual IDs
4. Run queries

---

## 📁 Your Google Drive Structure

Confirm your Drive looks like:
```
NCERT ALL BOOKS (Class 1 to 12)
├── Class 1
│   ├── English.pdf (extract FILE_ID)
│   ├── Hindi.pdf
│   ├── Mathematics.pdf
│   └── EVS.pdf
├── Class 2 (similar)
├── Class 3-5 (4 subjects each)
├── Class 6
│   ├── English.pdf
│   ├── Hindi.pdf
│   ├── Mathematics.pdf
│   ├── Science.pdf (new!)
│   └── Social Studies.pdf (new!)
├── Class 7-10 (same as Class 6)
├── Class 11
│   ├── Mathematics.pdf
│   ├── Physics.pdf (new!)
│   ├── Chemistry.pdf (new!)
│   ├── Biology.pdf (new!)
│   └── English.pdf
└── Class 12 (same as Class 11)
```

---

## 🎯 Next Actions

### Immediate (Today)
- [ ] Review `GOOGLE_DRIVE_SEEDING.md` guide
- [ ] Extract FILE_IDs for at least Classes 1 & 11 (to test both structures)
- [ ] Update `seed_google_drive_materials.mjs`

### Soon (Next Few Hours)
- [ ] Run seeding script
- [ ] Test in app (select class → view library)
- [ ] Extract remaining FILE_IDs if needed
- [ ] Seed remaining classes

### Later (Optional)
- [ ] Add more material types (Audio Books, Videos)
- [ ] Link NCERT solutions
- [ ] Add sample questions
- [ ] Create practice materials

---

## 📞 Support

**Common Issues:**

| Issue | Solution |
|-------|----------|
| `FILE_ID not replaced` | Ensure you updated ALL placeholder values |
| `Subject not found` | Check spelling matches database exactly |
| `Supabase error` | Verify URL & Key in `.env` and test connection |
| `PDF won't load` | Confirm FILE_ID is correct, test URL in browser |

---

## 🔐 Security Note

Your Supabase credentials are stored in `.env`:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_key_here
```

⚠️ **Never commit `.env` to GitHub**
✅ Already in `.gitignore`

---

## 📝 Database Entry Example

When you seed, this happens behind the scenes:

```sql
INSERT INTO learning_materials (
  subject_id,        -- Found from subjects table (English, Class 1)
  format_id,         -- 1 (E-Book)
  title,             -- "English E-Book (Class 1)"
  duration_lessons,  -- "Full Textbook"
  instructor_name,   -- "NCERT"
  file_url           -- "https://drive.google.com/uc?export=download&id=..."
) VALUES (
  42,  -- subject_id for English Class 1
  1,
  'English E-Book (Class 1)',
  'Full Textbook',
  'NCERT',
  'https://drive.google.com/uc?export=download&id=1a2b3c4d5e6f...'
);
```

---

## ✨ What's Included in Your App Now

- ✅ Courses page shows E-Books by class
- ✅ Filter by subject and format type
- ✅ Click to open PDF in full viewer
- ✅ Fullscreen reading mode
- ✅ Download option
- ✅ Mobile-responsive
- ✅ Offline support (after first load)

---

**You're all set! 🎉 Follow the Quick Start steps above to begin seeding your e-books.**

