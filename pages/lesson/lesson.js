// Logic for lesson
export function init(navigateTo, state) {
    const mat = state.activeMaterial;
    if (!mat) {
        navigateTo('courses');
        return;
    }

    const classNum = state.selectedClass || (state.currentUser ? state.currentUser.class_number : 9) || 9;

    document.getElementById('lesson-subject').textContent = `${mat.subject_name.toUpperCase()} - CLASS ${classNum}`;
    document.getElementById('lesson-title').textContent = mat.title;
    document.getElementById('lesson-format').textContent = mat.format_name;
    document.getElementById('lesson-duration').textContent = mat.duration_lessons || 'N/A';
    document.getElementById('lesson-instructor').textContent = mat.instructor_name || 'Unknown Author';

    const viewerContainer = document.getElementById('lesson-viewer-container');
    const ext = mat.file_url.split('.').pop().toLowerCase();
    const isDataUrl = mat.file_url.startsWith('data:');
    
    // Add a wrapper for fullscreen capabilities
    viewerContainer.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'width: 100%; height: 100%; position: relative; display: flex; align-items: center; justify-content: center;';
    
    if (ext === 'mp4' || ext === 'webm' || ext === 'ogg' || mat.format_name === 'Video Content' || (isDataUrl && mat.file_url.includes('video'))) {
        wrapper.innerHTML = `<video controls style="width: 100%; height: 100%; max-height: 100%;"><source src="${mat.file_url}">Your browser does not support the video tag.</video>`;
    } else if (ext === 'mp3' || ext === 'wav' || mat.format_name === 'Audio Book' || (isDataUrl && mat.file_url.includes('audio'))) {
        wrapper.innerHTML = `<div style="text-align:center; width: 100%;"><i class="fa-solid fa-headphones" style="font-size: 4rem; color: #aaa; margin-bottom: 20px;"></i><br><audio controls style="width: 80%;"><source src="${mat.file_url}">Your browser does not support the audio tag.</audio></div>`;
    } else if (ext === 'pdf' || (isDataUrl && mat.file_url.includes('pdf'))) {
        let pdfUrl = mat.file_url;
        if (isDataUrl) {
            try {
                const byteString = atob(mat.file_url.split(',')[1]);
                const mimeString = mat.file_url.split(',')[0].split(':')[1].split(';')[0];
                const ab = new ArrayBuffer(byteString.length);
                const ia = new Uint8Array(ab);
                for (let i = 0; i < byteString.length; i++) {
                    ia[i] = byteString.charCodeAt(i);
                }
                const blob = new Blob([ab], {type: mimeString});
                pdfUrl = URL.createObjectURL(blob);
            } catch (e) {
                console.error("Error converting PDF data URL to blob URL", e);
            }
        }
        wrapper.innerHTML = `<object data="${pdfUrl}" type="application/pdf" width="100%" height="100%" style="border: none;">
            <p>Your browser does not support PDFs. <a href="${pdfUrl}">Download the PDF</a>.</p>
        </object>`;
        
        // Add Fullscreen button for PDF
        const fsBtn = document.createElement('button');
        fsBtn.innerHTML = '<i class="fa-solid fa-expand"></i> Fullscreen Read';
        fsBtn.className = 'btn btn-primary';
        fsBtn.style.cssText = 'position: absolute; bottom: 10px; right: 10px; z-index: 10; padding: 6px 12px; font-size: 0.8rem; box-shadow: 0 4px 6px rgba(0,0,0,0.3);';
        fsBtn.onclick = () => {
            const pdfViewer = wrapper.querySelector('object');
            if (pdfViewer && pdfViewer.requestFullscreen) {
                pdfViewer.requestFullscreen();
            } else if (pdfViewer && pdfViewer.webkitRequestFullscreen) {
                pdfViewer.webkitRequestFullscreen();
            } else {
                window.open(mat.file_url, '_blank');
            }
        };
        wrapper.appendChild(fsBtn);
    } else {
        wrapper.innerHTML = `<div style="text-align:center; color: #fff;"><i class="fa-solid fa-file" style="font-size: 3rem; margin-bottom: 10px;"></i><br>Preview not available for this format.</div>`;
    }
    viewerContainer.appendChild(wrapper);

    const downloadBtn = document.getElementById('lesson-download-btn');
    if (downloadBtn) {
        downloadBtn.onclick = () => {
            if (isDataUrl) {
                // Programmatic download for Data URLs
                const a = document.createElement('a');
                a.href = mat.file_url;
                // Try to guess extension for filename
                let dlExt = 'file';
                if (mat.file_url.includes('pdf')) dlExt = 'pdf';
                else if (mat.file_url.includes('audio')) dlExt = 'mp3';
                else if (mat.file_url.includes('video')) dlExt = 'mp4';
                
                a.download = `Adhyayan_${mat.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.${dlExt}`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            } else {
                window.open(mat.file_url, '_blank');
            }
        };
    }
}
