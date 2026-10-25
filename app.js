/**
 * PDF 2-Up / 3-Up & Backside Image Studio
 * Combines 3 PDF pages onto 1 page (scaled down) and places an uploaded image on the backside (Page 2).
 */

(function () {
  'use strict';

  // Configure PDF.js worker if available (using Blob wrapper so it works from file:// and http://)
  if (window.pdfjsLib) {
    try {
      const workerBlob = new Blob(
        ['importScripts("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js");'],
        { type: 'application/javascript' }
      );
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(workerBlob);
    } catch (_) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
  }

  // Paper dimensions in PDF points (1 pt = 1/72 inch)
  const PAPER_SIZES = {
    A4: { width: 841.89, height: 595.28 },     // Landscape A4 (297 x 210 mm)
    LETTER: { width: 792.0, height: 612.0 }    // Landscape US Letter (11 x 8.5 in)
  };

  // Application State
  const state = {
    pdfSlots: [
      createEmptyPdfSlot(0),
      createEmptyPdfSlot(1),
      createEmptyPdfSlot(2)
    ],
    imageSlot: {
      hasImage: false,
      fileName: '',
      imgElement: null,
      rotation: 0 // 0, 90, 180, 270
    },
    layoutMode: 'three-up-landscape', // 'three-up-landscape' | 'two-up-duplex' | 'three-up-portrait'
    threeUpBackMode: 'full',          // 'full' | 'repeat-3'
    backSideOrder: 'pdf3-left-img-right', // 'pdf3-left-img-right' | 'img-left-pdf3-right'
    imageFit: 'contain',              // 'contain' | 'cover' | 'stretch'
    paperSize: 'A4',                  // 'A4' | 'LETTER'
    marginPt: 14,                     // Margin in PDF points
    showGuides: true
  };

  function createEmptyPdfSlot(index) {
    return {
      index,
      hasFile: false,
      fileName: '',
      pdfBytes: null,
      pdfJsDoc: null,
      pageIndex: 0,
      pageCount: 1,
      pageCanvas: null,
      pageWidthPt: 595.28,
      pageHeightPt: 841.89
    };
  }

  // DOM Elements
  const els = {
    batchDropzone: document.getElementById('batchDropzone'),
    batchFileInput: document.getElementById('batchFileInput'),
    batchBrowseBtn: document.getElementById('batchBrowseBtn'),
    uploadStatusBadge: document.getElementById('uploadStatusBadge'),
    loadDemoBtn: document.getElementById('loadDemoBtn'),
    resetAllBtn: document.getElementById('resetAllBtn'),

    // Image slot
    slotCardImage: document.getElementById('slotCardImage'),
    imageFileInput: document.getElementById('imageFileInput'),
    imageDrop: document.getElementById('imageDrop'),
    imageEmpty: document.getElementById('imageEmpty'),
    imagePreviewWrap: document.getElementById('imagePreviewWrap'),
    imageThumb: document.getElementById('imageThumb'),
    imageFooter: document.getElementById('imageFooter'),
    imageFileName: document.getElementById('imageFileName'),
    clearImageBtn: document.getElementById('clearImageBtn'),
    rotateImageBtn: document.getElementById('rotateImageBtn'),
    slotBadgeImage: document.getElementById('slotBadgeImage'),

    // Layout & options
    layoutRadios: document.querySelectorAll('input[name="layoutMode"]'),
    layoutOpt3Up: document.getElementById('layoutOpt3Up'),
    layoutOpt2Up: document.getElementById('layoutOpt2Up'),
    layoutOpt3UpPortrait: document.getElementById('layoutOpt3UpPortrait'),
    twoUpBackGroup: document.getElementById('twoUpBackGroup'),
    threeUpBackGroup: document.getElementById('threeUpBackGroup'),
    backSideOrder: document.getElementById('backSideOrder'),
    threeUpBackMode: document.getElementById('threeUpBackMode'),
    imageFitSelect: document.getElementById('imageFitSelect'),
    paperSizeSelect: document.getElementById('paperSizeSelect'),
    marginSelect: document.getElementById('marginSelect'),
    showGuidesCheckbox: document.getElementById('showGuidesCheckbox'),

    // Preview & actions
    frontSheetCanvas: document.getElementById('frontSheetCanvas'),
    backSheetCanvas: document.getElementById('backSheetCanvas'),
    frontMetaLabel: document.getElementById('frontMetaLabel'),
    backMetaLabel: document.getElementById('backMetaLabel'),
    previewDimText: document.getElementById('previewDimText'),
    downloadPdfBtn: document.getElementById('downloadPdfBtn'),
    openPdfTabBtn: document.getElementById('openPdfTabBtn'),
    statusBanner: document.getElementById('statusBanner')
  };

  // Initialize UI & Event Listeners
  function init() {
    setupSlotListeners();
    setupBatchListeners();
    setupOptionListeners();
    setupActionListeners();
    updateSlotBadgesAndLabels();
    renderLiveSheets();
  }

  function setupSlotListeners() {
    for (let i = 0; i < 3; i++) {
      const fileInput = document.getElementById(`fileInput${i}`);
      const slotDrop = document.getElementById(`slotDrop${i}`);
      const slotCard = document.getElementById(`slotCard${i}`);
      const clearBtn = slotCard.querySelector(`[data-clear-slot="${i}"]`);

      slotDrop.addEventListener('click', () => fileInput.click());

      fileInput.addEventListener('change', async (e) => {
        if (e.target.files && e.target.files[0]) {
          await handlePdfFileUpload(i, e.target.files[0], true);
          fileInput.value = '';
        }
      });

      // Drag and drop on individual PDF slot
      slotCard.addEventListener('dragover', (e) => {
        e.preventDefault();
        slotCard.classList.add('dragover');
      });
      slotCard.addEventListener('dragleave', () => {
        slotCard.classList.remove('dragover');
      });
      slotCard.addEventListener('drop', async (e) => {
        e.preventDefault();
        slotCard.classList.remove('dragover');
        const files = Array.from(e.dataTransfer.files || []);
        const pdfFile = files.find((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
        if (pdfFile) {
          await handlePdfFileUpload(i, pdfFile, true);
        } else if (files[0] && files[0].type.startsWith('image/')) {
          await handleImageFileUpload(files[0]);
        }
      });

      clearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        clearPdfSlot(i);
      });
    }

    // Page navigation buttons inside slots
    document.querySelectorAll('.page-btn[data-page-dir]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const slotIdx = parseInt(btn.getAttribute('data-slot'), 10);
        const dir = parseInt(btn.getAttribute('data-page-dir'), 10);
        await changeSlotPage(slotIdx, dir);
      });
    });

    // Image slot events
    els.imageDrop.addEventListener('click', () => els.imageFileInput.click());
    els.imageFileInput.addEventListener('change', async (e) => {
      if (e.target.files && e.target.files[0]) {
        await handleImageFileUpload(e.target.files[0]);
        els.imageFileInput.value = '';
      }
    });

    els.slotCardImage.addEventListener('dragover', (e) => {
      e.preventDefault();
      els.slotCardImage.classList.add('dragover');
    });
    els.slotCardImage.addEventListener('dragleave', () => {
      els.slotCardImage.classList.remove('dragover');
    });
    els.slotCardImage.addEventListener('drop', async (e) => {
      e.preventDefault();
      els.slotCardImage.classList.remove('dragover');
      const files = Array.from(e.dataTransfer.files || []);
      const imgFile = files.find((f) => f.type.startsWith('image/'));
      if (imgFile) {
        await handleImageFileUpload(imgFile);
      }
    });

    els.clearImageBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      clearImageSlot();
    });

    els.rotateImageBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!state.imageSlot.hasImage) return;
      state.imageSlot.rotation = (state.imageSlot.rotation + 90) % 360;
      els.imageThumb.style.transform = `rotate(${state.imageSlot.rotation}deg)`;
      renderLiveSheets();
    });
  }

  function setupBatchListeners() {
    els.batchDropzone.addEventListener('click', (e) => {
      if (e.target === els.batchBrowseBtn) return;
      els.batchFileInput.click();
    });
    els.batchBrowseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      els.batchFileInput.click();
    });

    els.batchFileInput.addEventListener('change', async (e) => {
      if (e.target.files && e.target.files.length > 0) {
        await handleBatchFiles(Array.from(e.target.files));
        els.batchFileInput.value = '';
      }
    });

    els.batchDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      els.batchDropzone.classList.add('dragover');
    });
    els.batchDropzone.addEventListener('dragleave', () => {
      els.batchDropzone.classList.remove('dragover');
    });
    els.batchDropzone.addEventListener('drop', async (e) => {
      e.preventDefault();
      els.batchDropzone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        await handleBatchFiles(Array.from(e.dataTransfer.files));
      }
    });
  }

  function setupOptionListeners() {
    els.layoutRadios.forEach((radio) => {
      radio.addEventListener('change', () => {
        if (radio.checked) {
          state.layoutMode = radio.value;
          els.layoutOpt3Up.classList.toggle('active', state.layoutMode === 'three-up-landscape');
          els.layoutOpt2Up.classList.toggle('active', state.layoutMode === 'two-up-duplex');
          els.layoutOpt3UpPortrait.classList.toggle('active', state.layoutMode === 'three-up-portrait');

          const isTwoUp = state.layoutMode === 'two-up-duplex';
          els.twoUpBackGroup.hidden = !isTwoUp;
          els.threeUpBackGroup.hidden = isTwoUp;

          updateSlotBadgesAndLabels();
          renderLiveSheets();
        }
      });
    });

    els.backSideOrder.addEventListener('change', () => {
      state.backSideOrder = els.backSideOrder.value;
      updateSlotBadgesAndLabels();
      renderLiveSheets();
    });

    els.threeUpBackMode.addEventListener('change', () => {
      state.threeUpBackMode = els.threeUpBackMode.value;
      updateSlotBadgesAndLabels();
      renderLiveSheets();
    });

    els.imageFitSelect.addEventListener('change', () => {
      state.imageFit = els.imageFitSelect.value;
      renderLiveSheets();
    });

    els.paperSizeSelect.addEventListener('change', () => {
      state.paperSize = els.paperSizeSelect.value;
      updateSlotBadgesAndLabels();
      renderLiveSheets();
    });

    els.marginSelect.addEventListener('change', () => {
      state.marginPt = parseFloat(els.marginSelect.value) || 0;
      renderLiveSheets();
    });

    els.showGuidesCheckbox.addEventListener('change', () => {
      state.showGuides = els.showGuidesCheckbox.checked;
      renderLiveSheets();
    });
  }

  function setupActionListeners() {
    els.loadDemoBtn.addEventListener('click', loadSampleDemo);
    els.resetAllBtn.addEventListener('click', resetAll);
    els.downloadPdfBtn.addEventListener('click', () => exportCombinedPdf(false));
    els.openPdfTabBtn.addEventListener('click', () => exportCombinedPdf(true));
  }

  // Handle batch file upload (1 multi-page PDF or multiple PDFs + image)
  async function handleBatchFiles(files) {
    const pdfFiles = files.filter(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );
    const imageFiles = files.filter((f) => f.type.startsWith('image/'));

    if (imageFiles.length > 0) {
      await handleImageFileUpload(imageFiles[0]);
    }

    if (pdfFiles.length === 1) {
      // Load into slot 0, and if it has multiple pages, auto-populate slots 1 and 2
      await handlePdfFileUpload(0, pdfFiles[0], true, true);
    } else if (pdfFiles.length > 1) {
      for (let i = 0; i < Math.min(3, pdfFiles.length); i++) {
        await handlePdfFileUpload(i, pdfFiles[i], false, false);
      }
    }
  }

  // Load a PDF file into a specific slot
  async function handlePdfFileUpload(slotIdx, file, allowAutoFillOtherSlots = false, forceAutoFill = false) {
    try {
      hideStatus();
      const arrayBuffer = await file.arrayBuffer();
      const pdfBytes = new Uint8Array(arrayBuffer);

      await loadPdfBytesIntoSlot(slotIdx, pdfBytes, file.name, 0);

      // If this PDF has >= 2 pages and the other slots are empty (or batch drop), auto-fill pages 2 & 3!
      const pageCount = state.pdfSlots[slotIdx].pageCount;
      const otherSlotsEmpty = !state.pdfSlots[1].hasFile && !state.pdfSlots[2].hasFile;
      if (slotIdx === 0 && pageCount >= 2 && (forceAutoFill || (allowAutoFillOtherSlots && otherSlotsEmpty))) {
        if (pageCount >= 2) {
          await loadPdfBytesIntoSlot(1, pdfBytes.slice(), file.name, 1);
        }
        if (pageCount >= 3) {
          await loadPdfBytesIntoSlot(2, pdfBytes.slice(), file.name, 2);
        }
        showStatus(`Seiten 1–${Math.min(3, pageCount)} aus „${file.name}“ in PDF-Bereich 1–${Math.min(3, pageCount)} geladen.`);
      }

      updateUploadProgress();
      renderLiveSheets();
    } catch (err) {
      console.error('Fehler beim Laden des PDFs:', err);
      showStatus(`Die PDF-Datei „${file.name}“ konnte nicht gelesen werden. Bitte stellen Sie sicher, dass es sich um eine gültige PDF-Datei handelt.`, true);
    }
  }

  async function loadPdfBytesIntoSlot(slotIdx, pdfBytes, fileName, initialPageIndex = 0) {
    const slot = state.pdfSlots[slotIdx];
    slot.pdfBytes = pdfBytes;
    slot.fileName = fileName;
    slot.hasFile = true;
    slot.pageIndex = initialPageIndex;
    slot.pageCount = 1;

    // Parse with pdf.js for visual preview
    if (window.pdfjsLib) {
      const loadingTask = window.pdfjsLib.getDocument({ data: pdfBytes.slice() });
      slot.pdfJsDoc = await loadingTask.promise;
      slot.pageCount = slot.pdfJsDoc.numPages;
      slot.pageIndex = Math.min(initialPageIndex, slot.pageCount - 1);
      await renderSlotThumbnail(slotIdx);
    } else if (window.PDFLib) {
      const doc = await window.PDFLib.PDFDocument.load(pdfBytes);
      slot.pageCount = doc.getPageCount();
      slot.pageIndex = Math.min(initialPageIndex, slot.pageCount - 1);
      const page = doc.getPage(slot.pageIndex);
      const { width, height } = page.getSize();
      slot.pageWidthPt = width;
      slot.pageHeightPt = height;
      renderFallbackSlotThumbnail(slotIdx);
    } else {
      renderFallbackSlotThumbnail(slotIdx);
    }

    updateSlotDom(slotIdx);
  }

  async function renderSlotThumbnail(slotIdx) {
    const slot = state.pdfSlots[slotIdx];
    if (!slot.pdfJsDoc) return;

    const page = await slot.pdfJsDoc.getPage(slot.pageIndex + 1);
    const unscaledViewport = page.getViewport({ scale: 1 });
    slot.pageWidthPt = unscaledViewport.width;
    slot.pageHeightPt = unscaledViewport.height;

    // Render high-res offscreen canvas for clean sheet preview & fallback export
    const targetScale = Math.min(2.2, 1200 / Math.max(unscaledViewport.width, unscaledViewport.height));
    const viewport = page.getViewport({ scale: targetScale });

    const offCanvas = document.createElement('canvas');
    offCanvas.width = Math.round(viewport.width);
    offCanvas.height = Math.round(viewport.height);
    const ctx = offCanvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, offCanvas.width, offCanvas.height);

    await page.render({ canvasContext: ctx, viewport }).promise;
    slot.pageCanvas = offCanvas;

    // Copy to slot thumbnail canvas
    const thumbCanvas = document.getElementById(`slotCanvas${slotIdx}`);
    thumbCanvas.width = offCanvas.width;
    thumbCanvas.height = offCanvas.height;
    const thumbCtx = thumbCanvas.getContext('2d');
    thumbCtx.drawImage(offCanvas, 0, 0);
  }

  function renderFallbackSlotThumbnail(slotIdx) {
    const slot = state.pdfSlots[slotIdx];
    const offCanvas = document.createElement('canvas');
    offCanvas.width = 420;
    offCanvas.height = 594;
    const ctx = offCanvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, offCanvas.width, offCanvas.height);
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 4;
    ctx.strokeRect(16, 16, offCanvas.width - 32, offCanvas.height - 32);

    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`PDF-Seite ${slotIdx + 1}`, offCanvas.width / 2, offCanvas.height / 2 - 20);
    ctx.fillStyle = '#64748b';
    ctx.font = '20px sans-serif';
    ctx.fillText(slot.fileName, offCanvas.width / 2, offCanvas.height / 2 + 20);
    ctx.fillText(`Seite ${slot.pageIndex + 1} von ${slot.pageCount}`, offCanvas.width / 2, offCanvas.height / 2 + 54);

    slot.pageCanvas = offCanvas;
    const thumbCanvas = document.getElementById(`slotCanvas${slotIdx}`);
    thumbCanvas.width = offCanvas.width;
    thumbCanvas.height = offCanvas.height;
    thumbCanvas.getContext('2d').drawImage(offCanvas, 0, 0);
  }

  async function changeSlotPage(slotIdx, dir) {
    const slot = state.pdfSlots[slotIdx];
    if (!slot.hasFile || slot.pageCount <= 1) return;
    const nextIdx = slot.pageIndex + dir;
    if (nextIdx < 0 || nextIdx >= slot.pageCount) return;
    slot.pageIndex = nextIdx;
    if (slot.pdfJsDoc) {
      await renderSlotThumbnail(slotIdx);
    } else {
      renderFallbackSlotThumbnail(slotIdx);
    }
    updateSlotDom(slotIdx);
    renderLiveSheets();
  }

  function updateSlotDom(slotIdx) {
    const slot = state.pdfSlots[slotIdx];
    const card = document.getElementById(`slotCard${slotIdx}`);
    const emptyEl = document.getElementById(`slotEmpty${slotIdx}`);
    const previewWrap = document.getElementById(`slotPreviewWrap${slotIdx}`);
    const footerEl = document.getElementById(`slotFooter${slotIdx}`);
    const fileNameEl = document.getElementById(`fileName${slotIdx}`);
    const pageSelectorEl = document.getElementById(`pageSelector${slotIdx}`);
    const pageLabelEl = document.getElementById(`pageLabel${slotIdx}`);
    const removeBtn = card.querySelector(`[data-clear-slot="${slotIdx}"]`);

    card.classList.toggle('has-file', slot.hasFile);
    emptyEl.hidden = slot.hasFile;
    previewWrap.hidden = !slot.hasFile;
    footerEl.hidden = !slot.hasFile;
    removeBtn.hidden = !slot.hasFile;

    if (slot.hasFile) {
      fileNameEl.textContent = slot.fileName;
      fileNameEl.title = slot.fileName;
      pageSelectorEl.hidden = slot.pageCount <= 1;
      pageLabelEl.textContent = `S. ${slot.pageIndex + 1}/${slot.pageCount}`;
    }
  }

  function clearPdfSlot(slotIdx) {
    state.pdfSlots[slotIdx] = createEmptyPdfSlot(slotIdx);
    updateSlotDom(slotIdx);
    updateUploadProgress();
    renderLiveSheets();
  }

  // Handle Backside Image Upload
  async function handleImageFileUpload(file) {
    try {
      hideStatus();
      const dataUrl = await readFileAsDataURL(file);
      const img = await loadImageElement(dataUrl);

      state.imageSlot.hasImage = true;
      state.imageSlot.fileName = file.name;
      state.imageSlot.imgElement = img;
      state.imageSlot.rotation = 0;

      els.imageThumb.src = dataUrl;
      els.imageThumb.style.transform = 'rotate(0deg)';
      els.slotCardImage.classList.add('has-file');
      els.imageEmpty.hidden = true;
      els.imagePreviewWrap.hidden = false;
      els.imageFooter.hidden = false;
      els.clearImageBtn.hidden = false;
      els.imageFileName.textContent = file.name;
      els.imageFileName.title = file.name;

      updateUploadProgress();
      renderLiveSheets();
    } catch (err) {
      console.error('Fehler beim Laden des Bildes:', err);
      showStatus(`Das Bild „${file.name}“ konnte nicht geladen werden. Bitte versuchen Sie eine andere Bilddatei.`, true);
    }
  }

  function clearImageSlot() {
    state.imageSlot.hasImage = false;
    state.imageSlot.fileName = '';
    state.imageSlot.imgElement = null;
    state.imageSlot.rotation = 0;

    els.imageThumb.removeAttribute('src');
    els.slotCardImage.classList.remove('has-file');
    els.imageEmpty.hidden = false;
    els.imagePreviewWrap.hidden = true;
    els.imageFooter.hidden = true;
    els.clearImageBtn.hidden = true;

    updateUploadProgress();
    renderLiveSheets();
  }

  function updateUploadProgress() {
    const pdfCount = state.pdfSlots.filter((s) => s.hasFile).length;
    const imgCount = state.imageSlot.hasImage ? 1 : 0;
    const total = pdfCount + imgCount;
    els.uploadStatusBadge.textContent = `${total} / 4 Bereit`;
    els.uploadStatusBadge.classList.toggle('complete', total === 4);
  }

  function updateSlotBadgesAndLabels() {
    const badge0 = document.getElementById('slotBadge0');
    const badge1 = document.getElementById('slotBadge1');
    const badge2 = document.getElementById('slotBadge2');
    const badgeImg = els.slotBadgeImage;

    const isPortrait = state.layoutMode === 'three-up-portrait';
    const orientWord = isPortrait ? 'Hochformat' : 'Querformat';
    els.previewDimText.textContent = `1 doppelseitiges ${orientWord}-PDF (Seite 1: Vorderseite, Seite 2: Rückseite)`;

    if (state.layoutMode === 'three-up-landscape') {
      badge0.textContent = 'Vorderseite • Links (1/3)';
      badge1.textContent = 'Vorderseite • Mitte (2/3)';
      badge2.textContent = 'Vorderseite • Rechts (3/3)';
      badge2.className = 'slot-target-badge';
      badgeImg.textContent =
        state.threeUpBackMode === 'repeat-3' ? 'Rückseite • 3× wiederholt' : 'Seite 2 • Ganze Rückseite';
      els.frontMetaLabel.textContent = '3 Hochformat-PDF-Seiten nebeneinander auf 1 Querformat-Seite';
      els.backMetaLabel.textContent =
        state.threeUpBackMode === 'repeat-3'
          ? 'Hochgeladenes Bild 3× auf der Rückseite wiederholt'
          : 'Hochgeladenes Bild auf der Rückseite (Seite 2)';
    } else if (state.layoutMode === 'two-up-duplex') {
      badge0.textContent = 'Vorderseite • Linke Hälfte';
      badge1.textContent = 'Vorderseite • Rechte Hälfte';
      if (state.backSideOrder === 'pdf3-left-img-right') {
        badge2.textContent = 'Rückseite • Linke Hälfte';
        badgeImg.textContent = 'Rückseite • Rechte Hälfte';
        els.backMetaLabel.textContent = 'Links: PDF-Seite 3 • Rechts: Hochgeladenes Bild';
      } else {
        badge2.textContent = 'Rückseite • Rechte Hälfte';
        badgeImg.textContent = 'Rückseite • Linke Hälfte';
        els.backMetaLabel.textContent = 'Links: Hochgeladenes Bild • Rechts: PDF-Seite 3';
      }
      badge2.className = 'slot-target-badge badge-back';
      els.frontMetaLabel.textContent = 'Links: PDF-Seite 1 • Rechts: PDF-Seite 2 (2 Hochformat-Seiten auf 1 Querformat-Seite)';
    } else {
      // three-up-portrait
      badge0.textContent = 'Vorderseite • Oben (1/3)';
      badge1.textContent = 'Vorderseite • Mitte (2/3)';
      badge2.textContent = 'Vorderseite • Unten (3/3)';
      badge2.className = 'slot-target-badge';
      badgeImg.textContent =
        state.threeUpBackMode === 'repeat-3' ? 'Rückseite • 3× Reihen' : 'Seite 2 • Ganze Rückseite';
      els.frontMetaLabel.textContent = '3 PDF-Seiten untereinander auf 1 Seite';
      els.backMetaLabel.textContent =
        state.threeUpBackMode === 'repeat-3'
          ? 'Hochgeladenes Bild 3× auf der Rückseite wiederholt'
          : 'Hochgeladenes Bild auf der Rückseite (Seite 2)';
    }
  }

  // Compute exact slot bounding boxes in PDF coordinates (top-left origin for canvas, bottom-left converted for pdf-lib)
  function getSheetGeometry() {
    const baseSize = PAPER_SIZES[state.paperSize] || PAPER_SIZES.A4;
    const isPortrait = state.layoutMode === 'three-up-portrait';
    const sheetWidth = isPortrait ? baseSize.height : baseSize.width;
    const sheetHeight = isPortrait ? baseSize.width : baseSize.height;
    const m = state.marginPt;

    const innerW = Math.max(50, sheetWidth - m * 2);
    const innerH = Math.max(50, sheetHeight - m * 2);
    const gap = m > 0 ? Math.max(8, m * 0.75) : 0;

    let frontRects = [];
    let backRects = [];
    let guideLines = []; // { x1, y1, x2, y2, page: 'front'|'back'|'both' }

    if (state.layoutMode === 'three-up-landscape') {
      const colW = (innerW - gap * 2) / 3;
      for (let i = 0; i < 3; i++) {
        frontRects.push({
          type: 'pdf',
          slotIndex: i,
          x: m + i * (colW + gap),
          y: m,
          w: colW,
          h: innerH,
          label: `PDF-Seite ${i + 1}`
        });
      }
      // Vertical divider lines between the 3 columns
      for (let i = 1; i < 3; i++) {
        const lineX = m + i * colW + (i - 0.5) * gap;
        guideLines.push({ x1: lineX, y1: m * 0.4, x2: lineX, y2: sheetHeight - m * 0.4, page: 'front' });
      }

      if (state.threeUpBackMode === 'repeat-3') {
        for (let i = 0; i < 3; i++) {
          backRects.push({
            type: 'image',
            x: m + i * (colW + gap),
            y: m,
            w: colW,
            h: innerH,
            label: `Rückseitenbild (${i + 1}/3)`
          });
        }
        for (let i = 1; i < 3; i++) {
          const lineX = m + i * colW + (i - 0.5) * gap;
          guideLines.push({ x1: lineX, y1: m * 0.4, x2: lineX, y2: sheetHeight - m * 0.4, page: 'back' });
        }
      } else {
        backRects.push({
          type: 'image',
          x: m,
          y: m,
          w: innerW,
          h: innerH,
          label: 'Rückseitenbild'
        });
      }
    } else if (state.layoutMode === 'two-up-duplex') {
      const colW = (innerW - gap) / 2;
      frontRects = [
        { type: 'pdf', slotIndex: 0, x: m, y: m, w: colW, h: innerH, label: 'PDF-Seite 1' },
        { type: 'pdf', slotIndex: 1, x: m + colW + gap, y: m, w: colW, h: innerH, label: 'PDF-Seite 2' }
      ];
      const midX = sheetWidth / 2;
      guideLines.push({ x1: midX, y1: m * 0.4, x2: midX, y2: sheetHeight - m * 0.4, page: 'both' });

      if (state.backSideOrder === 'pdf3-left-img-right') {
        backRects = [
          { type: 'pdf', slotIndex: 2, x: m, y: m, w: colW, h: innerH, label: 'PDF-Seite 3' },
          { type: 'image', x: m + colW + gap, y: m, w: colW, h: innerH, label: 'Rückseitenbild' }
        ];
      } else {
        backRects = [
          { type: 'image', x: m, y: m, w: colW, h: innerH, label: 'Rückseitenbild' },
          { type: 'pdf', slotIndex: 2, x: m + colW + gap, y: m, w: colW, h: innerH, label: 'PDF-Seite 3' }
        ];
      }
    } else {
      // three-up-portrait (stacked vertically)
      const rowH = (innerH - gap * 2) / 3;
      for (let i = 0; i < 3; i++) {
        frontRects.push({
          type: 'pdf',
          slotIndex: i,
          x: m,
          y: m + i * (rowH + gap),
          w: innerW,
          h: rowH,
          label: `PDF-Seite ${i + 1}`
        });
      }
      for (let i = 1; i < 3; i++) {
        const lineY = m + i * rowH + (i - 0.5) * gap;
        guideLines.push({ x1: m * 0.4, y1: lineY, x2: sheetWidth - m * 0.4, y2: lineY, page: 'front' });
      }

      if (state.threeUpBackMode === 'repeat-3') {
        for (let i = 0; i < 3; i++) {
          backRects.push({
            type: 'image',
            x: m,
            y: m + i * (rowH + gap),
            w: innerW,
            h: rowH,
            label: `Rückseitenbild (${i + 1}/3)`
          });
        }
        for (let i = 1; i < 3; i++) {
          const lineY = m + i * rowH + (i - 0.5) * gap;
          guideLines.push({ x1: m * 0.4, y1: lineY, x2: sheetWidth - m * 0.4, y2: lineY, page: 'back' });
        }
      } else {
        backRects.push({
          type: 'image',
          x: m,
          y: m,
          w: innerW,
          h: innerH,
          label: 'Rückseitenbild'
        });
      }
    }

    return { sheetWidth, sheetHeight, frontRects, backRects, guideLines };
  }

  // Render live previews of Page 1 (Front) and Page 2 (Back)
  function renderLiveSheets(scaleMultiplier = 1.25) {
    const geom = getSheetGeometry();
    drawSheetCanvas(els.frontSheetCanvas, geom, geom.frontRects, 'front', scaleMultiplier, true);
    drawSheetCanvas(els.backSheetCanvas, geom, geom.backRects, 'back', scaleMultiplier, true);
  }

  function drawSheetCanvas(canvas, geom, rects, side, scale, showPlaceholders) {
    const w = Math.round(geom.sheetWidth * scale);
    const h = Math.round(geom.sheetHeight * scale);
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    for (const rect of rects) {
      const rx = rect.x * scale;
      const ry = rect.y * scale;
      const rw = rect.w * scale;
      const rh = rect.h * scale;

      if (rect.type === 'pdf') {
        const slot = state.pdfSlots[rect.slotIndex];
        if (slot && slot.hasFile && slot.pageCanvas) {
          drawContainedCanvas(ctx, slot.pageCanvas, rx, ry, rw, rh);
        } else if (showPlaceholders) {
          drawPlaceholderBox(ctx, rx, ry, rw, rh, rect.label, 'PDF-Seite ablegen oder auswählen', '#eff6ff', '#93c5fd', '#1d4ed8');
        }
      } else if (rect.type === 'image') {
        if (state.imageSlot.hasImage && state.imageSlot.imgElement) {
          drawRotatedImageInBox(
            ctx,
            state.imageSlot.imgElement,
            state.imageSlot.rotation,
            state.imageFit,
            rx,
            ry,
            rw,
            rh
          );
        } else if (showPlaceholders) {
          drawPlaceholderBox(ctx, rx, ry, rw, rh, rect.label, 'Rückseitenbild hochladen', '#ecfdf5', '#6ee7b7', '#047857');
        }
      }
    }

    // Draw cut/fold guide lines if enabled
    if (state.showGuides) {
      ctx.save();
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = Math.max(1, 0.8 * scale);
      ctx.setLineDash([6 * scale, 5 * scale]);
      for (const line of geom.guideLines) {
        if (line.page === 'both' || line.page === side) {
          ctx.beginPath();
          ctx.moveTo(line.x1 * scale, line.y1 * scale);
          ctx.lineTo(line.x2 * scale, line.y2 * scale);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    ctx.restore();
  }

  function drawContainedCanvas(ctx, sourceCanvas, boxX, boxY, boxW, boxH) {
    const srcRatio = sourceCanvas.width / sourceCanvas.height;
    const boxRatio = boxW / boxH;
    let drawW, drawH;
    if (srcRatio > boxRatio) {
      drawW = boxW;
      drawH = boxW / srcRatio;
    } else {
      drawH = boxH;
      drawW = boxH * srcRatio;
    }
    const drawX = boxX + (boxW - drawW) / 2;
    const drawY = boxY + (boxH - drawH) / 2;

    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(drawX, drawY, drawW, drawH);
    ctx.drawImage(sourceCanvas, drawX, drawY, drawW, drawH);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(drawX, drawY, drawW, drawH);
    ctx.restore();
  }

  function drawRotatedImageInBox(ctx, img, rotationDeg, fitMode, boxX, boxY, boxW, boxH) {
    const rotCanvas = getRotatedImageCanvas(img, rotationDeg);
    const srcW = rotCanvas.width;
    const srcH = rotCanvas.height;
    const srcRatio = srcW / srcH;
    const boxRatio = boxW / boxH;

    ctx.save();
    ctx.beginPath();
    ctx.rect(boxX, boxY, boxW, boxH);
    ctx.clip();

    if (fitMode === 'stretch') {
      ctx.drawImage(rotCanvas, boxX, boxY, boxW, boxH);
    } else if (fitMode === 'cover') {
      let drawW, drawH;
      if (srcRatio > boxRatio) {
        drawH = boxH;
        drawW = boxH * srcRatio;
      } else {
        drawW = boxW;
        drawH = boxW / srcRatio;
      }
      const drawX = boxX + (boxW - drawW) / 2;
      const drawY = boxY + (boxH - drawH) / 2;
      ctx.drawImage(rotCanvas, drawX, drawY, drawW, drawH);
    } else {
      // contain
      let drawW, drawH;
      if (srcRatio > boxRatio) {
        drawW = boxW;
        drawH = boxW / srcRatio;
      } else {
        drawH = boxH;
        drawW = boxH * srcRatio;
      }
      const drawX = boxX + (boxW - drawW) / 2;
      const drawY = boxY + (boxH - drawH) / 2;
      ctx.drawImage(rotCanvas, drawX, drawY, drawW, drawH);
    }

    ctx.restore();
  }

  function getRotatedImageCanvas(img, rotationDeg) {
    const deg = ((rotationDeg % 360) + 360) % 360;
    const swapDims = deg === 90 || deg === 270;
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;

    const c = document.createElement('canvas');
    c.width = swapDims ? h : w;
    c.height = swapDims ? w : h;
    const ctx = c.getContext('2d');
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate((deg * Math.PI) / 180);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    return c;
  }

  function drawPlaceholderBox(ctx, x, y, w, h, title, subtitle, bg, border, textColor) {
    ctx.save();
    ctx.fillStyle = bg;
    ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
    ctx.strokeStyle = border;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
    ctx.setLineDash([]);

    ctx.fillStyle = textColor;
    ctx.font = `bold ${Math.max(11, Math.min(18, Math.round(w * 0.065)))}px -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(title, x + w / 2, y + h / 2 - 6);

    ctx.fillStyle = '#64748b';
    ctx.font = `${Math.max(9, Math.min(13, Math.round(w * 0.045)))}px -apple-system, sans-serif`;
    ctx.fillText(subtitle, x + w / 2, y + h / 2 + 14);
    ctx.restore();
  }

  // Export Combined 2-Page PDF (Page 1: Front with scaled PDFs, Page 2: Backside with Image)
  async function exportCombinedPdf(openInNewTab = false) {
    const anyPdfLoaded = state.pdfSlots.some((s) => s.hasFile);
    const anyImageLoaded = state.imageSlot.hasImage;
    if (!anyPdfLoaded && !anyImageLoaded) {
      showStatus('Bitte laden Sie Ihre 3 PDF-Seiten und ein Rückseitenbild hoch (oder klicken Sie zum Testen auf „Beispieldateien laden“).', true);
      return;
    }

    try {
      els.downloadPdfBtn.disabled = true;
      els.openPdfTabBtn.disabled = true;
      hideStatus();

      let finalPdfBytes;
      if (window.PDFLib) {
        finalPdfBytes = await buildVectorPdfWithPdfLib();
      } else {
        finalPdfBytes = await buildHighResCanvasPdfFallback();
      }

      const blob = new Blob([finalPdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);

      if (openInNewTab) {
        window.open(url, '_blank');
        showStatus('Kombiniertes 2-seitiges PDF in einem neuen Tab geöffnet (bereit für den beidseitigen Druck).');
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = 'wiedereintritt-kombiniert.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        showStatus('„wiedereintritt-kombiniert.pdf“ heruntergeladen (Seite 1: PDF-Vorderseite, Seite 2: Rückseitenbild)!');
      }
    } catch (err) {
      console.error('Fehler beim Erstellen des PDFs:', err);
      showStatus(`Fehler beim Erstellen des PDFs: ${err.message || err}`, true);
    } finally {
      els.downloadPdfBtn.disabled = false;
      els.openPdfTabBtn.disabled = false;
    }
  }

  // Vector-preserving PDF generation using pdf-lib
  async function buildVectorPdfWithPdfLib() {
    const { PDFDocument, rgb } = window.PDFLib;
    const outDoc = await PDFDocument.create();
    const geom = getSheetGeometry();

    const frontPage = outDoc.addPage([geom.sheetWidth, geom.sheetHeight]);
    const backPage = outDoc.addPage([geom.sheetWidth, geom.sheetHeight]);

    // Pre-embed uploaded PDF pages
    const embeddedPdfPages = [null, null, null];
    for (let i = 0; i < 3; i++) {
      const slot = state.pdfSlots[i];
      if (slot.hasFile && slot.pdfBytes) {
        const srcDoc = await PDFDocument.load(slot.pdfBytes);
        const safePageIdx = Math.min(slot.pageIndex, srcDoc.getPageCount() - 1);
        const [embeddedPage] = await outDoc.embedPdf(srcDoc, [safePageIdx]);
        embeddedPdfPages[i] = embeddedPage;
      }
    }

    // Pre-embed uploaded backside image (normalized via canvas to handle rotation/crop/WebP/SVG cleanly)
    let embeddedImage = null;
    if (state.imageSlot.hasImage && state.imageSlot.imgElement) {
      const rotCanvas = getRotatedImageCanvas(state.imageSlot.imgElement, state.imageSlot.rotation);
      const pngDataUrl = rotCanvas.toDataURL('image/png');
      const pngBytes = dataUrlToUint8Array(pngDataUrl);
      embeddedImage = await outDoc.embedPng(pngBytes);
    }

    // Helper to draw a rect item onto a pdf-lib page
    const drawItemOnPdfPage = async (pdfPage, rect) => {
      // Convert top-left Y to bottom-left Y for pdf-lib
      const pdfBoxX = rect.x;
      const pdfBoxY = geom.sheetHeight - rect.y - rect.h;
      const boxW = rect.w;
      const boxH = rect.h;

      if (rect.type === 'pdf') {
        const embPage = embeddedPdfPages[rect.slotIndex];
        if (!embPage) return;

        const srcRatio = embPage.width / embPage.height;
        const boxRatio = boxW / boxH;
        let drawW, drawH;
        if (srcRatio > boxRatio) {
          drawW = boxW;
          drawH = boxW / srcRatio;
        } else {
          drawH = boxH;
          drawW = boxH * srcRatio;
        }
        const drawX = pdfBoxX + (boxW - drawW) / 2;
        const drawY = pdfBoxY + (boxH - drawH) / 2;

        pdfPage.drawPage(embPage, {
          x: drawX,
          y: drawY,
          width: drawW,
          height: drawH
        });
      } else if (rect.type === 'image') {
        if (!embeddedImage) return;

        if (state.imageFit === 'stretch') {
          pdfPage.drawImage(embeddedImage, {
            x: pdfBoxX,
            y: pdfBoxY,
            width: boxW,
            height: boxH
          });
        } else if (state.imageFit === 'cover') {
          // Crop to exact aspect ratio on a canvas so it doesn't bleed outside the slot
          const croppedPngBytes = getCroppedCoverImagePngBytes(
            state.imageSlot.imgElement,
            state.imageSlot.rotation,
            boxW,
            boxH
          );
          const croppedEmbedded = await outDoc.embedPng(croppedPngBytes);
          pdfPage.drawImage(croppedEmbedded, {
            x: pdfBoxX,
            y: pdfBoxY,
            width: boxW,
            height: boxH
          });
        } else {
          // contain
          const srcRatio = embeddedImage.width / embeddedImage.height;
          const boxRatio = boxW / boxH;
          let drawW, drawH;
          if (srcRatio > boxRatio) {
            drawW = boxW;
            drawH = boxW / srcRatio;
          } else {
            drawH = boxH;
            drawW = boxH * srcRatio;
          }
          const drawX = pdfBoxX + (boxW - drawW) / 2;
          const drawY = pdfBoxY + (boxH - drawH) / 2;
          pdfPage.drawImage(embeddedImage, {
            x: drawX,
            y: drawY,
            width: drawW,
            height: drawH
          });
        }
      }
    };

    for (const rect of geom.frontRects) {
      await drawItemOnPdfPage(frontPage, rect);
    }
    for (const rect of geom.backRects) {
      await drawItemOnPdfPage(backPage, rect);
    }

    // Draw cut/fold guide lines if enabled
    if (state.showGuides) {
      for (const line of geom.guideLines) {
        const start = { x: line.x1, y: geom.sheetHeight - line.y1 };
        const end = { x: line.x2, y: geom.sheetHeight - line.y2 };
        const lineOpts = {
          start,
          end,
          thickness: 0.6,
          color: rgb(0.65, 0.71, 0.78),
          dashArray: [5, 4]
        };
        if (line.page === 'both' || line.page === 'front') {
          frontPage.drawLine(lineOpts);
        }
        if (line.page === 'both' || line.page === 'back') {
          backPage.drawLine(lineOpts);
        }
      }
    }

    return await outDoc.save();
  }

  function getCroppedCoverImagePngBytes(img, rotationDeg, targetW, targetH) {
    const rotCanvas = getRotatedImageCanvas(img, rotationDeg);
    const outCanvas = document.createElement('canvas');
    const scale = Math.min(2000 / Math.max(targetW, targetH), 3);
    outCanvas.width = Math.round(targetW * scale);
    outCanvas.height = Math.round(targetH * scale);
    const ctx = outCanvas.getContext('2d');

    const srcRatio = rotCanvas.width / rotCanvas.height;
    const boxRatio = outCanvas.width / outCanvas.height;
    let drawW, drawH;
    if (srcRatio > boxRatio) {
      drawH = outCanvas.height;
      drawW = outCanvas.height * srcRatio;
    } else {
      drawW = outCanvas.width;
      drawH = outCanvas.width / srcRatio;
    }
    const drawX = (outCanvas.width - drawW) / 2;
    const drawY = (outCanvas.height - drawH) / 2;
    ctx.drawImage(rotCanvas, drawX, drawY, drawW, drawH);

    return dataUrlToUint8Array(outCanvas.toDataURL('image/png'));
  }

  // Offline / Fallback Pure-JS 2-Page PDF Builder (renders high-DPI canvases into a valid 2-page PDF)
  async function buildHighResCanvasPdfFallback() {
    const geom = getSheetGeometry();
    const frontCanvas = document.createElement('canvas');
    const backCanvas = document.createElement('canvas');

    drawSheetCanvas(frontCanvas, geom, geom.frontRects, 'front', 2.5, false);
    drawSheetCanvas(backCanvas, geom, geom.backRects, 'back', 2.5, false);

    return buildMinimalTwoPageJpegPdf(
      frontCanvas,
      backCanvas,
      geom.sheetWidth,
      geom.sheetHeight
    );
  }

  function buildMinimalTwoPageJpegPdf(canvas1, canvas2, pageWidthPt, pageHeightPt) {
    const jpg1 = dataUrlToUint8Array(canvas1.toDataURL('image/jpeg', 0.94));
    const jpg2 = dataUrlToUint8Array(canvas2.toDataURL('image/jpeg', 0.94));
    const wPt = pageWidthPt.toFixed(2);
    const hPt = pageHeightPt.toFixed(2);

    const enc = new TextEncoder();
    const chunks = [];
    const offsets = [];
    let byteLength = 0;

    function pushStr(str) {
      const b = enc.encode(str);
      chunks.push(b);
      byteLength += b.length;
    }
    function pushBytes(b) {
      chunks.push(b);
      byteLength += b.length;
    }
    function startObj(id) {
      offsets[id] = byteLength;
      pushStr(`${id} 0 obj\n`);
    }
    function endObj() {
      pushStr(`\nendobj\n`);
    }

    pushStr('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');

    // 1: Catalog
    startObj(1);
    pushStr('<< /Type /Catalog /Pages 2 0 R >>');
    endObj();

    // 2: Pages
    startObj(2);
    pushStr('<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>');
    endObj();

    // 3: Page 1 (Front)
    startObj(3);
    pushStr(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${wPt} ${hPt}] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>`
    );
    endObj();

    // 4: Image 1 XObject
    startObj(4);
    pushStr(
      `<< /Type /XObject /Subtype /Image /Width ${canvas1.width} /Height ${canvas1.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg1.length} >>\nstream\n`
    );
    pushBytes(jpg1);
    pushStr('\nendstream');
    endObj();

    // 5: Page 1 Contents
    const content1 = `q ${wPt} 0 0 ${hPt} 0 0 cm /Im1 Do Q`;
    startObj(5);
    pushStr(`<< /Length ${content1.length} >>\nstream\n${content1}\nendstream`);
    endObj();

    // 6: Page 2 (Back)
    startObj(6);
    pushStr(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${wPt} ${hPt}] /Resources << /XObject << /Im2 7 0 R >> >> /Contents 8 0 R >>`
    );
    endObj();

    // 7: Image 2 XObject
    startObj(7);
    pushStr(
      `<< /Type /XObject /Subtype /Image /Width ${canvas2.width} /Height ${canvas2.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg2.length} >>\nstream\n`
    );
    pushBytes(jpg2);
    pushStr('\nendstream');
    endObj();

    // 8: Page 2 Contents
    const content2 = `q ${wPt} 0 0 ${hPt} 0 0 cm /Im2 Do Q`;
    startObj(8);
    pushStr(`<< /Length ${content2.length} >>\nstream\n${content2}\nendstream`);
    endObj();

    const xrefOffset = byteLength;
    pushStr('xref\n0 9\n0000000000 65535 f \n');
    for (let i = 1; i <= 8; i++) {
      pushStr(String(offsets[i]).padStart(10, '0') + ' 00000 n \n');
    }
    pushStr(`trailer\n<< /Size 9 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

    const out = new Uint8Array(byteLength);
    let pos = 0;
    for (const c of chunks) {
      out.set(c, pos);
      pos += c.length;
    }
    return out;
  }

  // Generate 3 realistic sample vertical PDF pages + 1 sample Backside Image for instant testing
  async function loadSampleDemo() {
    try {
      hideStatus();
      const colors = [
        { accent: '#2563eb', light: '#dbeafe', title: 'Dokument Seite 1', subtitle: 'Übersicht & Einleitung' },
        { accent: '#7c3aed', light: '#ede9fe', title: 'Dokument Seite 2', subtitle: 'Angaben & Daten' },
        { accent: '#d97706', light: '#fef3c7', title: 'Dokument Seite 3', subtitle: 'Zusammenfassung & Hinweise' }
      ];

      for (let i = 0; i < 3; i++) {
        const sampleBytes = await createSampleSinglePagePdf(i + 1, colors[i]);
        await loadPdfBytesIntoSlot(i, sampleBytes, `beispiel-seite-${i + 1}.pdf`, 0);
      }

      // Create a sample backside image
      const sampleImgDataUrl = createSampleBacksideImageDataUrl();
      const img = await loadImageElement(sampleImgDataUrl);
      state.imageSlot.hasImage = true;
      state.imageSlot.fileName = 'rueckseite-motiv.png';
      state.imageSlot.imgElement = img;
      state.imageSlot.rotation = 0;

      els.imageThumb.src = sampleImgDataUrl;
      els.imageThumb.style.transform = 'rotate(0deg)';
      els.slotCardImage.classList.add('has-file');
      els.imageEmpty.hidden = true;
      els.imagePreviewWrap.hidden = false;
      els.imageFooter.hidden = false;
      els.clearImageBtn.hidden = false;
      els.imageFileName.textContent = 'rueckseite-motiv.png';

      updateUploadProgress();
      renderLiveSheets();
      showStatus('3 Beispiel-PDF-Seiten und 1 Rückseitenbild geladen! Klicken Sie auf „Kombiniertes PDF herunterladen“, um die Datei zu exportieren.');
    } catch (err) {
      console.error('Fehler beim Laden der Beispieldateien:', err);
      showStatus('Beispieldateien konnten nicht erstellt werden.', true);
    }
  }

  async function createSampleSinglePagePdf(pageNum, theme) {
    if (window.PDFLib) {
      const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
      const doc = await PDFDocument.create();
      const page = doc.addPage([595.28, 841.89]); // Portrait A4
      const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
      const fontReg = await doc.embedFont(StandardFonts.Helvetica);

      const accentRgb = hexToRgb01(theme.accent);
      const lightRgb = hexToRgb01(theme.light);

      // Border & Header Banner
      page.drawRectangle({
        x: 28,
        y: 28,
        width: 539.28,
        height: 785.89,
        borderColor: rgb(accentRgb.r, accentRgb.g, accentRgb.b),
        borderWidth: 3
      });

      page.drawRectangle({
        x: 28,
        y: 690,
        width: 539.28,
        height: 123.89,
        color: rgb(lightRgb.r, lightRgb.g, lightRgb.b)
      });

      page.drawText(`HOCHFORMAT PDF-SEITE ${pageNum}`, {
        x: 56,
        y: 760,
        size: 28,
        font: fontBold,
        color: rgb(accentRgb.r, accentRgb.g, accentRgb.b)
      });

      page.drawText(theme.subtitle, {
        x: 56,
        y: 724,
        size: 16,
        font: fontReg,
        color: rgb(0.25, 0.3, 0.38)
      });

      // Simulated document paragraphs and boxes
      for (let row = 0; row < 6; row++) {
        const yPos = 610 - row * 85;
        page.drawRectangle({
          x: 56,
          y: yPos,
          width: 483,
          height: 16,
          color: rgb(0.2, 0.25, 0.33)
        });
        page.drawRectangle({
          x: 56,
          y: yPos - 24,
          width: 440,
          height: 11,
          color: rgb(0.55, 0.62, 0.7)
        });
        page.drawRectangle({
          x: 56,
          y: yPos - 42,
          width: 390,
          height: 11,
          color: rgb(0.68, 0.74, 0.82)
        });
      }

      page.drawText(`Seite ${pageNum} von 3 • Skaliert auf Querformat-Blatt`, {
        x: 56,
        y: 55,
        size: 13,
        font: fontBold,
        color: rgb(0.4, 0.45, 0.52)
      });

      return await doc.save();
    }

    // Fallback empty byte array if PDFLib not loaded
    return new Uint8Array([37, 80, 68, 70]);
  }

  function createSampleBacksideImageDataUrl() {
    const c = document.createElement('canvas');
    c.width = 1200;
    c.height = 850;
    const ctx = c.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, c.width, c.height);
    grad.addColorStop(0, '#065f46');
    grad.addColorStop(0.5, '#059669');
    grad.addColorStop(1, '#0d9488');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, c.width, c.height);

    // Decorative circles
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    ctx.arc(220, 200, 260, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(980, 680, 310, 0, Math.PI * 2);
    ctx.fill();

    // Inner frame
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 6;
    ctx.strokeRect(48, 48, c.width - 96, c.height - 96);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 64px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('RÜCKSEITENBILD (SEITE 2)', c.width / 2, c.height / 2 - 20);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
    ctx.font = '32px -apple-system, sans-serif';
    ctx.fillText('Wird auf die Rückseite des kombinierten PDF-Blatts gedruckt', c.width / 2, c.height / 2 + 45);

    return c.toDataURL('image/png');
  }

  function resetAll() {
    for (let i = 0; i < 3; i++) {
      state.pdfSlots[i] = createEmptyPdfSlot(i);
      updateSlotDom(i);
    }
    clearImageSlot();
    hideStatus();
    updateUploadProgress();
    renderLiveSheets();
  }

  // Utility helpers
  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function loadImageElement(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function dataUrlToUint8Array(dataUrl) {
    const base64 = dataUrl.split(',')[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  function hexToRgb01(hex) {
    const clean = hex.replace('#', '');
    const num = parseInt(clean, 16);
    return {
      r: ((num >> 16) & 255) / 255,
      g: ((num >> 8) & 255) / 255,
      b: (num & 255) / 255
    };
  }

  function showStatus(msg, isError = false) {
    els.statusBanner.textContent = msg;
    els.statusBanner.classList.toggle('error', isError);
    els.statusBanner.hidden = false;
  }

  function hideStatus() {
    els.statusBanner.hidden = true;
  }

  // Start app once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
