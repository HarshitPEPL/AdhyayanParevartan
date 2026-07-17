# 🚀 Quick Start: Link Google Drive E-Books to App

## 📋 What You Need to Do (5 Steps)

### Step 1: Extract Google Drive File IDs ⏱️ 5-10 minutes

For each PDF in your Drive folders:
1. Right-click PDF → **Get link**
2. Copy the sharing link
3. Extract the **FILE_ID** (alphanumeric string between `/d/` and `/view`)

**Example:**
```
Link: https://drive.google.com/file/d/1a2b3c4d5e6f7g8h9i0j/view?usp=sharing
FILE_ID:                                  ^^^^^^^^^^^^^^^^^^^^^^^^^^
```

### Step 2: Update Seeding Script ⏱️ 5-10 minutes

Edit `seed_google_drive_materials.mjs`:

```javascript
const EBOOK_MAP = {
  1: {
    'English': '1a2b3c4d5e6f7g8h9i0j',      // ← Replace with actual FILE_ID
    'Hindi': '2k3l4m5n6o7p8q9r0s1t',
    'Mathematics': '3u4v5w6x7y8z9a0b1c2d',
    'EVS': '4e5f6g7h8i9j0k1l2m3n'
  },
  2: {
    'English': '5o6p7q8r9s0t1u2v3w4x',
    // ... etc
  }
  // ... Classes 3-12
};
```

**Subject Count by Class:**
- **Classes 1-5:** 4 subjects (English, Hindi, Math, EVS)
- **Classes 6-10:** 5 subjects (English, Hindi, Math, Science, Social Studies)
- **Classes 11-12:** 5 subjects (Math, Physics, Chemistry, Biology, English)

### Step 3: Verify Supabase Connection ⏱️ 2 minutes

Before running the seeding script:
1. **Open your app** → Go to Login page
2. **Click the database icon** (top-right) in Supabase Manager
3. **Fill in credentials:**
   - Supabase URL: `https://your-project.supabase.co`
   - Anon Key: From Supabase Dashboard → Settings → API Keys
4. **Click "Test Connection"** ✅

### Step 4: Run Seeding Script ⏱️ 2 minutes

```bash
# Terminal in your project folder
node seed_google_drive_materials.mjs
```

**Expected Output:**
```
🌱 Starting E-Book Seeding...

✅ Added: English E-Book (Class 1)
✅ Added: Hindi E-Book (Class 1)
✅ Added: Mathematics E-Book (Class 1)
✅ Added: EVS E-Book (Class 1)
...
✅ Added: English E-Book (Class 12)
🎉 Seeding complete!
```

### Step 5: Test in App ⏱️ 3 minutes

1. **Login as Student**
   - Email: `rahul@example.com`
   - Password: `password123`
2. **Select Class** (e.g., Class 1)
3. **Go to "My Library"** (Courses page)
4. **Filter by "E-Books"** 
5. **Click on an E-Book** → PDF opens in app viewer

---

## 📁 File Organization

Your Google Drive should be organized like:
```
NCERT ALL BOOKS (Class 1 to 12)
├── Class 1
│   ├── English.pdf
│   ├── Hindi.pdf
│   ├── Mathematics.pdf
│   └── EVS.pdf
├── Class 2
│   ├── English.pdf
│   ├── Hindi.pdf
│   ├── Mathematics.pdf
│   └── EVS.pdf
├── Class 3-5 (similar structure)
├── Class 6
│   ├── English.pdf
│   ├── Hindi.pdf
│   ├── Mathematics.pdf
│   ├── Science.pdf
│   └── Social Studies.pdf
├── Class 7-10 (similar to Class 6)
├── Class 11
│   ├── Mathematics.pdf
│   ├── Physics.pdf
│   ├── Chemistry.pdf
│   ├── Biology.pdf
│   └── English.pdf
└── Class 12 (similar to Class 11)
```

---

## 🔗 Google Drive URL Reference

### Sharing Link Format
```
https://drive.google.com/file/d/[FILE_ID]/view?usp=sharing
```

### How It Works in Your App

**In-App Viewer:**
- Google Drive converts PDFs to embedded viewers
- Direct download link: `https://drive.google.com/uc?export=download&id=[FILE_ID]`
- Preview link: `https://drive.google.com/file/d/[FILE_ID]/preview`
- Your app uses the download link for reliability

**What Students See:**
1. Student selects Class 1
2. Goes to "My Library"
3. Sees "English E-Book (Class 1)"
4. Clicks it
5. PDF opens in built-in viewer
6. Can read fullscreen or download

---

## 📊 Database Schema Used

The seeding script adds to the `learning_materials` table:

| Column | Value |
|--------|-------|
| `subject_id` | From `subjects` table (matched by name + class) |
| `format_id` | `1` (E-Book format) |
| `title` | "[Subject] E-Book (Class X)" |
| `file_url` | `https://drive.google.com/uc?export=download&id=[FILE_ID]` |
| `duration_lessons` | "Full Textbook" |
| `instructor_name` | "NCERT" |
| `created_at` | Current timestamp |

---

## 🛠️ Alternative: Direct SQL (If Node.js Fails)

If you prefer not to run the Node.js script:

1. **Open Supabase Dashboard**
2. **Go to SQL Editor**
3. **Create new query**
4. **Copy contents of `SEEDING_DIRECT_SQL.mjs`**
5. **Replace all `FILE_ID_*` placeholders** with actual FILE_IDs
6. **Run all queries**

Example single insert:
```sql
INSERT INTO learning_materials (subject_id, format_id, title, duration_lessons, instructor_name, file_url)
SELECT subject_id, 1, 'English E-Book (Class 1)', 'Full Textbook', 'NCERT', 'https://drive.google.com/uc?export=download&id=1a2b3c4d5e6f7g8h9i0j'
FROM subjects WHERE subject_name = 'English' AND class_number = 1;
```

---

## ✅ Verification Checklist

After seeding:

- [ ] All 48-60 materials added (4×5 for classes 1-5, 5×5 for classes 6-10, 5×2 for classes 11-12)
- [ ] Supabase shows new rows in `learning_materials` table
- [ ] App login works
- [ ] Student can select a class
- [ ] "My Library" page shows E-Books
- [ ] Clicking E-Book opens PDF viewer
- [ ] PDF displays without errors

**Count Formula:**
- Classes 1-5: 5 × 4 = **20 materials**
- Classes 6-10: 5 × 5 = **25 materials**
- Classes 11-12: 2 × 5 = **10 materials**
- **Total: ~55 materials** (if all subjects have PDFs)

---

## 🆘 Troubleshooting

### ❌ "Subject not found" error
- Check spelling matches exactly (case-sensitive)
- Verify subject exists in database

### ❌ "Supabase connection failed"
- Verify URL and Key in `.env` file
- Test credentials in app's Supabase Manager

### ❌ "FILE_ID not replaced"
- Ensure you replaced all placeholder strings
- FILE_ID should be alphanumeric, no slashes or special chars

### ❌ PDF doesn't load in app
- Check FILE_ID is correct
- Try opening the link in browser first
- Ensure PDF sharing is enabled on Drive

---

## 📝 Files You'll Use

| File | Purpose |
|------|---------|
| `seed_google_drive_materials.mjs` | Main seeding script - UPDATE THIS with FILE_IDs |
| `SEEDING_DIRECT_SQL.mjs` | Alternative SQL approach |
| `google_drive_url_helper.mjs` | URL conversion utilities |
| `GOOGLE_DRIVE_SEEDING.md` | Detailed guide (this file) |
| `extract_drive_ids.mjs` | Optional helper for ID extraction |

---

## 🎯 Next Steps

1. **Extract FILE_IDs** from your Google Drive (Classes 1-12)
2. **Update `seed_google_drive_materials.mjs`** with FILE_IDs
3. **Run seeding script** or use SQL
4. **Test in app** (login → select class → view library)
5. **Commit to GitHub:**
   ```bash
   git add seed_google_drive_materials.mjs
   git commit -m "feat: seed NCERT e-books from Google Drive"
   git push
   ```

---

**Ready to proceed? Start with Step 1 above!** 🚀

### Step 1: Access Your Google Drive
Navigate to your shared Google Drive folder:
https://drive.google.com/drive/folders/1ct1Gok1OB_1jynIW6BzcI2zQEcR8nHW6?usp=sharing

### Step 2: Get File IDs for Each PDF
For each PDF in your Drive:

1. **Right-click on the PDF file**
2. **Select "Get link"**
3. **Copy the sharing link** (format: `https://drive.google.com/file/d/[FILE_ID]/view?usp=sharing`)
4. **Extract the FILE_ID** - It's the long alphanumeric string between `/d/` and `/view`

Example:
```
Full Link: https://drive.google.com/file/d/1a2b3c4d5e6f7g8h9i0j/view?usp=sharing
FILE_ID:   1a2b3c4d5e6f7g8h9i0j
```

### Step 3: Map Your Files to Classes/Subjects

Edit `seed_google_drive_materials.mjs` and update the `EBOOK_MAP` object:

**Current Structure (Example):**
```javascript
const EBOOK_MAP = {
  1: {
    'English': 'FILE_ID_CLASS_1_ENGLISH',
    'Hindi': 'FILE_ID_CLASS_1_HINDI',
    'Mathematics': 'FILE_ID_CLASS_1_MATH',
    'EVS': 'FILE_ID_CLASS_1_EVS'
  },
  // ... more classes
};
```

**What You Need to Do:**
Replace `'FILE_ID_CLASS_1_ENGLISH'` with actual FILE_IDs from your Drive.

Example (AFTER updating):
```javascript
const EBOOK_MAP = {
  1: {
    'English': '1a2b3c4d5e6f7g8h9i0j',  // ← Actual FILE_ID
    'Hindi': '2k3l4m5n6o7p8q9r0s1t',     // ← Actual FILE_ID
    'Mathematics': '3u4v5w6x7y8z9a0b1c2d', // ← Actual FILE_ID
    'EVS': '4e5f6g7h8i9j0k1l2m3n'        // ← Actual FILE_ID
  },
  // ... more classes
};
```

### Step 4: Verify Subject Names Match Database
Check that the subject names in EBOOK_MAP match your database subjects:

**Classes 1-5 have:**
- English
- Hindi
- Mathematics
- EVS

**Classes 6-10 have:**
- English
- Hindi
- Mathematics
- Science
- Social Studies

**Classes 11-12 have:**
- Mathematics
- Physics
- Chemistry
- Biology
- English

### Step 5: Run Seeding Script

```bash
# Install dependencies (if not already done)
npm install

# Run the seeding script
node seed_google_drive_materials.mjs
```

### Expected Output:
```
🌱 Starting E-Book Seeding...

✅ Added: English E-Book (Class 1)
✅ Added: Hindi E-Book (Class 1)
✅ Added: Mathematics E-Book (Class 1)
✅ Added: EVS E-Book (Class 1)
...
🎉 Seeding complete!
```

## How Google Drive Links Work in Your App

### Download URL Format:
Google Drive files can be accessed directly via:
```
https://drive.google.com/uc?export=download&id=[FILE_ID]
```

This URL is stored in `learning_materials.file_url` and can be:
- **Embedded in iframes** for PDF preview
- **Downloaded** by users
- **Linked** in course pages

### Example: Displaying a PDF in the App
```html
<!-- Preview in iframe -->
<iframe 
  src="https://drive.google.com/uc?export=download&id=FILE_ID" 
  style="width: 100%; height: 600px;">
</iframe>

<!-- Or direct download link -->
<a href="https://drive.google.com/uc?export=download&id=FILE_ID" download>
  Download PDF
</a>
```

## Troubleshooting

### Issue: "Subject not found" Warning
**Cause:** The subject name in EBOOK_MAP doesn't match database

**Solution:**
1. Check spelling exactly (case-sensitive)
2. Verify subject exists in your database with matching class_number
3. Run migration modal SQL if subjects aren't seeded

### Issue: Supabase connection error
**Cause:** Credentials not set in .env

**Solution:**
```bash
# Create .env file with:
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

### Issue: FILE_ID shows as placeholder
**Cause:** FILE_ID not replaced in EBOOK_MAP

**Solution:** Re-check extraction process:
1. Verify Google Drive links are accessible
2. Extract FILE_ID carefully (long alphanumeric string)
3. Replace entire placeholder string with FILE_ID

## Quick Reference

| Class | Subjects |
|-------|----------|
| 1-5   | English, Hindi, Mathematics, EVS |
| 6-10  | English, Hindi, Mathematics, Science, Social Studies |
| 11-12 | Mathematics, Physics, Chemistry, Biology, English |

## After Seeding

### In the App
1. Student selects a class
2. Selects a subject  
3. E-Book appears in "Materials" section
4. Click to view/download from Google Drive

### Updating Materials
To add more materials later:
- Edit EBOOK_MAP with new FILE_IDs
- Run seeding script again
- Duplicate entries are handled (will create new records)

## Support
If you encounter issues:
1. Check FILE_ID extraction (not missing any characters)
2. Verify Supabase is running
3. Ensure subjects exist in database
4. Check console for error messages

---

**Next Steps:**
1. ✅ Extract all FILE_IDs from your Google Drive
2. ✅ Update `seed_google_drive_materials.mjs`
3. ✅ Run seeding script
4. ✅ Test in app (select class → subject → view materials)
