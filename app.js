/**
 * Dokumente & Fotos platzsparend auf DIN A4
 * - Bis zu 20+ PDFs, Bilder oder Textdateien auswählen
 * - Legt je 2 DIN-A4-Seiten nebeneinander auf 1 DIN-A4-Blatt
 * - Gruppiert Fotos platzsparend im Raster auf DIN A4
 */

(function () {
  'use strict';

  function configurePdfJsWorker() {
    if (window.pdfjsLib && !window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
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
  }
  configurePdfJsWorker();

  // DIN A4 Landscape dimensions in PDF points (297 x 210 mm)
  const A4_LANDSCAPE = { width: 841.89, height: 595.28 };

  let nextItemId = 1;

  const state = {
    items: [],
    pdfsPerPage: 2,              // 2 DIN A4 pages horizontally on 1 DIN A4
    imagesPerPage: 6,            // 4, 6, 8, 9, 12, or 2 images per DIN A4 page
    packMode: 'pack-free-half',  // 'pack-free-half' | 'separate-page'
    imageFit: 'contain',         // 'contain' | 'cover'
    marginPt: 14,                // Margin in points (~5mm)
    showGuides: true,
    showCaptions: false
  };

  const els = {
    batchDropzone: document.getElementById('batchDropzone'),
    batchFileInput: document.getElementById('batchFileInput'),
    batchBrowseBtn: document.getElementById('batchBrowseBtn'),
    loadDemoBtn: document.getElementById('loadDemoBtn'),
    resetAllBtn: document.getElementById('resetAllBtn'),

    pdfCountBadge: document.getElementById('pdfCountBadge'),
    imgCountBadge: document.getElementById('imgCountBadge'),
    emptyQueueState: document.getElementById('emptyQueueState'),
    itemsGrid: document.getElementById('itemsGrid'),

    pdfLayoutChoices: document.querySelectorAll('#pdfLayoutChoices .visual-choice'),
    imgLayoutChoices: document.querySelectorAll('#imgLayoutChoices .visual-choice'),
    imagesPerPageSelect: document.getElementById('imagesPerPageSelect'),
    packModeSelect: document.getElementById('packModeSelect'),
    pdfsPerPageSelect: document.getElementById('pdfsPerPageSelect'),
    imageFitSelect: document.getElementById('imageFitSelect'),
    marginSelect: document.getElementById('marginSelect'),
    showGuidesCheckbox: document.getElementById('showGuidesCheckbox'),
    showCaptionsCheckbox: document.getElementById('showCaptionsCheckbox'),

    previewDimText: document.getElementById('previewDimText'),
    downloadPdfBtn: document.getElementById('downloadPdfBtn'),
    openPdfTabBtn: document.getElementById('openPdfTabBtn'),
    statusBanner: document.getElementById('statusBanner'),
    sheetsContainer: document.getElementById('sheetsContainer')
  };

  function init() {
    configurePdfJsWorker();
    setupUploadListeners();
    setupOptionListeners();
    setupActionListeners();
    renderAll();
  }

  function setupUploadListeners() {
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
        await handleUploadedFiles(Array.from(e.target.files));
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
        await handleUploadedFiles(Array.from(e.dataTransfer.files));
      }
    });
  }

  function setupOptionListeners() {
    // Visual buttons for PDFs per page
    els.pdfLayoutChoices.forEach((btn) => {
      btn.addEventListener('click', () => {
        const val = parseInt(btn.getAttribute('data-pdfs-per-page'), 10) || 2;
        state.pdfsPerPage = val;
        if (els.pdfsPerPageSelect) els.pdfsPerPageSelect.value = String(val);
        els.pdfLayoutChoices.forEach((b) =>
          b.classList.toggle('active', b === btn)
        );
        renderQueue();
        renderSheetsPreview();
      });
    });

    // Visual buttons for Images per page
    els.imgLayoutChoices.forEach((btn) => {
      btn.addEventListener('click', () => {
        const val = parseInt(btn.getAttribute('data-imgs-per-page'), 10) || 6;
        state.imagesPerPage = val;
        if (els.imagesPerPageSelect) els.imagesPerPageSelect.value = String(val);
        els.imgLayoutChoices.forEach((b) =>
          b.classList.toggle('active', b === btn)
        );
        renderSheetsPreview();
      });
    });

    if (els.imagesPerPageSelect) {
      els.imagesPerPageSelect.addEventListener('change', () => {
        state.imagesPerPage = parseInt(els.imagesPerPageSelect.value, 10) || 6;
        els.imgLayoutChoices.forEach((b) =>
          b.classList.toggle(
            'active',
            parseInt(b.getAttribute('data-imgs-per-page'), 10) === state.imagesPerPage
          )
        );
        renderSheetsPreview();
      });
    }

    if (els.pdfsPerPageSelect) {
      els.pdfsPerPageSelect.addEventListener('change', () => {
        state.pdfsPerPage = parseInt(els.pdfsPerPageSelect.value, 10) || 2;
        els.pdfLayoutChoices.forEach((b) =>
          b.classList.toggle(
            'active',
            parseInt(b.getAttribute('data-pdfs-per-page'), 10) === state.pdfsPerPage
          )
        );
        renderQueue();
        renderSheetsPreview();
      });
    }

    els.packModeSelect.addEventListener('change', () => {
      state.packMode = els.packModeSelect.value;
      renderSheetsPreview();
    });

    els.imageFitSelect.addEventListener('change', () => {
      state.imageFit = els.imageFitSelect.value;
      renderSheetsPreview();
    });

    els.marginSelect.addEventListener('change', () => {
      state.marginPt = parseFloat(els.marginSelect.value) || 0;
      renderSheetsPreview();
    });

    els.showGuidesCheckbox.addEventListener('change', () => {
      state.showGuides = els.showGuidesCheckbox.checked;
      renderSheetsPreview();
    });

    els.showCaptionsCheckbox.addEventListener('change', () => {
      state.showCaptions = els.showCaptionsCheckbox.checked;
      renderSheetsPreview();
    });
  }

  function setupActionListeners() {
    els.loadDemoBtn.addEventListener('click', loadSampleDemo);
    els.resetAllBtn.addEventListener('click', () => {
      state.items = [];
      hideStatus();
      renderAll();
    });
    els.downloadPdfBtn.addEventListener('click', () => exportCombinedPdf(false));
    els.openPdfTabBtn.addEventListener('click', () => exportCombinedPdf(true));
  }

  // Process any number of uploaded files (PDFs, images, text/HTML/CSV/JSON files)
  async function handleUploadedFiles(fileList) {
    hideStatus();
    let addedPages = 0;
    let addedImages = 0;
    let errors = [];

    for (const file of fileList) {
      const lower = file.name.toLowerCase();
      try {
        if (file.type === 'application/pdf' || lower.endsWith('.pdf')) {
          const count = await addPdfFileItems(file);
          addedPages += count;
        } else if (
          file.type.startsWith('image/') ||
          /\.(jpg|jpeg|png|webp|gif|svg|bmp|avif|ico)$/i.test(lower)
        ) {
          await addImageFileItem(file);
          addedImages++;
        } else if (
          file.type.startsWith('text/') ||
          /\.(txt|csv|md|html|htm|json|xml|log)$/i.test(lower)
        ) {
          await addTextFileItem(file);
          addedPages++;
        } else {
          try {
            await addImageFileItem(file);
            addedImages++;
          } catch (_) {
            await addTextFileItem(file);
            addedPages++;
          }
        }
      } catch (err) {
        console.error('Fehler beim Lesen der Datei:', file.name, err);
        errors.push(file.name);
      }
    }

    renderAll();

    if (errors.length > 0) {
      showStatus(
        `Hinweis: Einige Dateien konnten nicht gelesen werden (${errors.join(', ')}). Alle übrigen Dateien wurden hinzugefügt.`,
        true
      );
    } else if (addedPages > 0 || addedImages > 0) {
      const parts = [];
      if (addedPages > 0) parts.push(`${addedPages} Dokument-Seite(n)`);
      if (addedImages > 0) parts.push(`${addedImages} Foto(s)/Bild(er)`);
      showStatus(`Fertig! ${parts.join(' und ')} wurden hinzugefügt. Rechts sehen Sie sofort die fertige Vorschau.`);
    }
  }

  async function addPdfFileItems(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdfBytes = new Uint8Array(arrayBuffer);
    return await addPdfBytesItems(pdfBytes, file.name);
  }

  async function addPdfBytesItems(pdfBytes, fileName) {
    configurePdfJsWorker();
    let numPages = 1;
    let pdfJsDoc = null;

    if (window.pdfjsLib) {
      const loadingTask = window.pdfjsLib.getDocument({ data: pdfBytes.slice() });
      pdfJsDoc = await loadingTask.promise;
      numPages = pdfJsDoc.numPages;
    } else if (window.PDFLib) {
      const doc = await window.PDFLib.PDFDocument.load(pdfBytes);
      numPages = doc.getPageCount();
    }

    for (let p = 0; p < numPages; p++) {
      let previewCanvas;
      if (pdfJsDoc) {
        const page = await pdfJsDoc.getPage(p + 1);
        const unscaled = page.getViewport({ scale: 1 });
        const scale = Math.min(2.0, 1100 / Math.max(unscaled.width, unscaled.height));
        const viewport = page.getViewport({ scale });
        previewCanvas = document.createElement('canvas');
        previewCanvas.width = Math.round(viewport.width);
        previewCanvas.height = Math.round(viewport.height);
        const ctx = previewCanvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
      } else {
        previewCanvas = createFallbackPdfCanvas(fileName, p + 1, numPages);
      }

      const label = numPages > 1 ? `${fileName} (S. ${p + 1}/${numPages})` : fileName;
      state.items.push({
        id: nextItemId++,
        kind: 'doc',
        sourceType: 'pdf',
        label,
        fileName,
        pdfBytes: pdfBytes.slice(),
        pageIndex: p,
        previewCanvas,
        rotation: 0
      });
    }

    return numPages;
  }

  async function addImageFileItem(file) {
    const dataUrl = await readFileAsDataURL(file);
    const img = await loadImageElement(dataUrl);
    const canvas = document.createElement('canvas');
    const maxDim = 1400;
    const w = img.naturalWidth || img.width || 800;
    const h = img.naturalHeight || img.height || 600;
    const scale = Math.min(1, maxDim / Math.max(w, h));
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    state.items.push({
      id: nextItemId++,
      kind: 'img',
      sourceType: 'image',
      label: file.name,
      fileName: file.name,
      pdfBytes: null,
      pageIndex: 0,
      previewCanvas: canvas,
      rotation: 0
    });
  }

  async function addTextFileItem(file) {
    const text = await file.text();
    const canvas = renderTextToA4Canvas(file.name, text);
    state.items.push({
      id: nextItemId++,
      kind: 'doc',
      sourceType: 'text',
      label: file.name,
      fileName: file.name,
      pdfBytes: null,
      pageIndex: 0,
      previewCanvas: canvas,
      rotation: 0
    });
  }

  function renderTextToA4Canvas(fileName, rawText) {
    const c = document.createElement('canvas');
    c.width = 794;
    c.height = 1123;
    const ctx = c.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);

    ctx.fillStyle = '#eff6ff';
    ctx.fillRect(40, 40, c.width - 80, 64);
    ctx.strokeStyle = '#bfdbfe';
    ctx.lineWidth = 2;
    ctx.strokeRect(40, 40, c.width - 80, c.height - 80);

    ctx.fillStyle = '#1e3a8a';
    ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(fileName, 60, 78);

    const cleanText = rawText.replace(/<[^>]*>/g, ' ').replace(/\r\n/g, '\n');
    const lines = cleanText.split('\n');
    ctx.fillStyle = '#1e293b';
    ctx.font = '15px ui-monospace, SFMono-Regular, Menlo, monospace';

    let y = 136;
    const maxW = c.width - 120;
    for (const line of lines) {
      if (y > c.height - 65) break;
      const words = line.split(/\s+/);
      let current = '';
      for (const word of words) {
        const test = current ? `${current} ${word}` : word;
        if (ctx.measureText(test).width > maxW && current) {
          ctx.fillText(current, 60, y);
          y += 22;
          current = word;
          if (y > c.height - 65) break;
        } else {
          current = test;
        }
      }
      if (y <= c.height - 65) {
        ctx.fillText(current, 60, y);
        y += 22;
      }
    }
    return c;
  }

  function createFallbackPdfCanvas(fileName, pageNum, totalPages) {
    const c = document.createElement('canvas');
    c.width = 595;
    c.height = 842;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 4;
    ctx.strokeRect(20, 20, c.width - 40, c.height - 40);
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(fileName, c.width / 2, c.height / 2 - 15);
    ctx.fillStyle = '#64748b';
    ctx.font = '22px sans-serif';
    ctx.fillText(`DIN A4 Seite ${pageNum} von ${totalPages}`, c.width / 2, c.height / 2 + 25);
    return c;
  }

  function renderAll() {
    renderQueue();
    renderSheetsPreview();
  }

  function renderQueue() {
    const docItems = state.items.filter((it) => it.kind === 'doc');
    const imgItems = state.items.filter((it) => it.kind === 'img');

    els.pdfCountBadge.textContent = `${docItems.length} Brief${docItems.length === 1 ? '' : 'e'} (DIN A4)`;
    els.imgCountBadge.textContent = `${imgItems.length} Foto${imgItems.length === 1 ? '' : 's'} (klein)`;

    if (state.items.length === 0) {
      els.emptyQueueState.hidden = false;
      els.itemsGrid.hidden = true;
      els.itemsGrid.innerHTML = '';
      return;
    }

    els.emptyQueueState.hidden = true;
    els.itemsGrid.hidden = false;
    els.itemsGrid.innerHTML = '';

    state.items.forEach((item, idx) => {
      const card = document.createElement('div');
      card.className = `item-card ${item.kind === 'doc' ? 'type-doc' : 'type-img'}`;

      const top = document.createElement('div');
      top.className = 'item-top';

      const indexSpan = document.createElement('span');
      indexSpan.className = 'item-index';
      indexSpan.textContent = `Nr. ${idx + 1}`;

      const typeBtn = document.createElement('button');
      typeBtn.type = 'button';
      typeBtn.className = `item-type-btn ${item.kind === 'doc' ? 'badge-doc' : 'badge-img'}`;
      typeBtn.title = 'Hier klicken, um zwischen „Groß (wie ein Brief)“ und „Klein (wie ein Foto)“ zu wechseln';
      typeBtn.textContent =
        item.kind === 'doc' ? `📄 Groß (${state.pdfsPerPage}/Blatt)` : '🖼️ Klein (Foto)';
      typeBtn.addEventListener('click', () => {
        item.kind = item.kind === 'doc' ? 'img' : 'doc';
        renderAll();
      });

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'item-remove';
      removeBtn.title = 'Diese Datei aus der Liste löschen';
      removeBtn.innerHTML = '&times;';
      removeBtn.addEventListener('click', () => {
        state.items.splice(idx, 1);
        renderAll();
      });

      top.appendChild(indexSpan);
      top.appendChild(typeBtn);
      top.appendChild(removeBtn);

      const thumbWrap = document.createElement('div');
      thumbWrap.className = 'item-thumb-wrap';
      const rotCanvas = getRotatedCanvas(item.previewCanvas, item.rotation);
      const thumbCanvas = document.createElement('canvas');
      const thumbScale = Math.min(1, 220 / Math.max(rotCanvas.width, rotCanvas.height));
      thumbCanvas.width = Math.max(1, Math.round(rotCanvas.width * thumbScale));
      thumbCanvas.height = Math.max(1, Math.round(rotCanvas.height * thumbScale));
      thumbCanvas.getContext('2d').drawImage(rotCanvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
      thumbWrap.appendChild(thumbCanvas);

      const footer = document.createElement('div');
      footer.className = 'item-footer';

      const nameEl = document.createElement('div');
      nameEl.className = 'item-name';
      nameEl.textContent = item.label;
      nameEl.title = item.label;

      const controls = document.createElement('div');
      controls.className = 'item-controls';

      const leftBtn = document.createElement('button');
      leftBtn.type = 'button';
      leftBtn.className = 'mini-btn';
      leftBtn.textContent = '◄ Vor';
      leftBtn.title = 'Weiter nach vorne schieben';
      leftBtn.disabled = idx === 0;
      leftBtn.addEventListener('click', () => {
        if (idx > 0) {
          const tmp = state.items[idx - 1];
          state.items[idx - 1] = state.items[idx];
          state.items[idx] = tmp;
          renderAll();
        }
      });

      const rotBtn = document.createElement('button');
      rotBtn.type = 'button';
      rotBtn.className = 'mini-btn';
      rotBtn.textContent = '↻ Drehen';
      rotBtn.title = 'Um 90 Grad drehen';
      rotBtn.addEventListener('click', () => {
        item.rotation = (item.rotation + 90) % 360;
        renderAll();
      });

      const rightBtn = document.createElement('button');
      rightBtn.type = 'button';
      rightBtn.className = 'mini-btn';
      rightBtn.textContent = 'Zurück ►';
      rightBtn.title = 'Weiter nach hinten schieben';
      rightBtn.disabled = idx === state.items.length - 1;
      rightBtn.addEventListener('click', () => {
        if (idx < state.items.length - 1) {
          const tmp = state.items[idx + 1];
          state.items[idx + 1] = state.items[idx];
          state.items[idx] = tmp;
          renderAll();
        }
      });

      controls.appendChild(leftBtn);
      controls.appendChild(rotBtn);
      controls.appendChild(rightBtn);

      footer.appendChild(nameEl);
      footer.appendChild(controls);

      card.appendChild(top);
      card.appendChild(thumbWrap);
      card.appendChild(footer);
      els.itemsGrid.appendChild(card);
    });
  }

  function computeA4Sheets() {
    const sheetW = A4_LANDSCAPE.width;
    const sheetH = A4_LANDSCAPE.height;
    const m = state.marginPt;
    const innerW = Math.max(80, sheetW - m * 2);
    const innerH = Math.max(80, sheetH - m * 2);
    const gap = m > 0 ? Math.max(8, m * 0.7) : 6;

    const docItems = state.items.filter((it) => it.kind === 'doc');
    const imgItems = state.items.filter((it) => it.kind === 'img');

    const sheets = [];
    let imgCursor = 0;

    // 1. Place DIN A4 Document pages (2 side-by-side horizontally on DIN A4 by default)
    const docsPerSheet = state.pdfsPerPage;
    for (let i = 0; i < docItems.length; i += docsPerSheet) {
      const chunk = docItems.slice(i, i + docsPerSheet);
      const placements = [];
      const guideLines = [];

      if (docsPerSheet === 4) {
        const cellW = (innerW - gap) / 2;
        const cellH = (innerH - gap) / 2;
        chunk.forEach((docItem, idx) => {
          const col = idx % 2;
          const row = Math.floor(idx / 2);
          placements.push({
            item: docItem,
            x: m + col * (cellW + gap),
            y: m + row * (cellH + gap),
            w: cellW,
            h: cellH,
            slotRole: 'doc'
          });
        });
        guideLines.push({ x1: sheetW / 2, y1: m * 0.4, x2: sheetW / 2, y2: sheetH - m * 0.4 });
        guideLines.push({ x1: m * 0.4, y1: sheetH / 2, x2: sheetW - m * 0.4, y2: sheetH / 2 });
      } else {
        const colW = (innerW - gap * (docsPerSheet - 1)) / docsPerSheet;
        chunk.forEach((docItem, idx) => {
          placements.push({
            item: docItem,
            x: m + idx * (colW + gap),
            y: m,
            w: colW,
            h: innerH,
            slotRole: 'doc'
          });
        });
        for (let c = 1; c < docsPerSheet; c++) {
          const lineX = m + c * colW + (c - 0.5) * gap;
          guideLines.push({ x1: lineX, y1: m * 0.4, x2: lineX, y2: sheetH - m * 0.4 });
        }

        const freeCols = docsPerSheet - chunk.length;
        if (
          freeCols > 0 &&
          state.packMode === 'pack-free-half' &&
          imgCursor < imgItems.length
        ) {
          const freeX = m + chunk.length * (colW + gap);
          const freeW = freeCols * colW + (freeCols - 1) * gap;
          const freeH = innerH;

          const halfCapacity = Math.max(
            2,
            Math.round((state.imagesPerPage * freeCols) / docsPerSheet)
          );
          const subGrid = getCompactGridDimensions(halfCapacity, freeW, freeH);
          const subCellW = (freeW - gap * (subGrid.cols - 1)) / subGrid.cols;
          const subCellH = (freeH - gap * (subGrid.rows - 1)) / subGrid.rows;

          const countToPlace = Math.min(halfCapacity, imgItems.length - imgCursor);
          for (let k = 0; k < countToPlace; k++) {
            const col = k % subGrid.cols;
            const row = Math.floor(k / subGrid.cols);
            placements.push({
              item: imgItems[imgCursor++],
              x: freeX + col * (subCellW + gap),
              y: m + row * (subCellH + gap),
              w: subCellW,
              h: subCellH,
              slotRole: 'img'
            });
          }

          sheets.push({
            sheetNumber: sheets.length + 1,
            sheetWidth: sheetW,
            sheetHeight: sheetH,
            placements,
            guideLines,
            tagType: 'mixed',
            tagLabel: `DIN-A4-BLATT ${sheets.length + 1} — BRIEF LINKS + FOTOS RECHTS`,
            metaLabel: `${chunk.length} Brief-Seite(n) + ${countToPlace} verkleinerte(s) Foto(s) auf der freien Blatthälfte`
          });
          continue;
        }
      }

      sheets.push({
        sheetNumber: sheets.length + 1,
        sheetWidth: sheetW,
        sheetHeight: sheetH,
        placements,
        guideLines,
        tagType: 'doc',
        tagLabel: `DIN-A4-BLATT ${sheets.length + 1} — ${chunk.length} BRIEF-SEITE(N) NEBENEINANDER`,
        metaLabel: `Je ${docsPerSheet} DIN-A4-Seiten nebeneinander auf 1 DIN-A4-Querformat-Blatt`
      });
    }

    // 2. Pack all remaining images compactly onto DIN A4 sheet(s)
    const imgsPerSheet = state.imagesPerPage;
    while (imgCursor < imgItems.length) {
      const chunk = imgItems.slice(imgCursor, imgCursor + imgsPerSheet);
      imgCursor += chunk.length;

      const grid = getCompactGridDimensions(imgsPerSheet, innerW, innerH);
      const cellW = (innerW - gap * (grid.cols - 1)) / grid.cols;
      const cellH = (innerH - gap * (grid.rows - 1)) / grid.rows;
      const placements = [];
      const guideLines = [];

      chunk.forEach((imgItem, idx) => {
        const col = idx % grid.cols;
        const row = Math.floor(idx / grid.cols);
        placements.push({
          item: imgItem,
          x: m + col * (cellW + gap),
          y: m + row * (cellH + gap),
          w: cellW,
          h: cellH,
          slotRole: 'img'
        });
      });

      for (let c = 1; c < grid.cols; c++) {
        const lx = m + c * cellW + (c - 0.5) * gap;
        guideLines.push({ x1: lx, y1: m * 0.4, x2: lx, y2: sheetH - m * 0.4 });
      }
      for (let r = 1; r < grid.rows; r++) {
        const ly = m + r * cellH + (r - 0.5) * gap;
        guideLines.push({ x1: m * 0.4, y1: ly, x2: sheetW - m * 0.4, y2: ly });
      }

      sheets.push({
        sheetNumber: sheets.length + 1,
        sheetWidth: sheetW,
        sheetHeight: sheetH,
        placements,
        guideLines,
        tagType: 'img',
        tagLabel: `DIN-A4-BLATT ${sheets.length + 1} — FOTOS PLATZSPAREND (${grid.cols}×${grid.rows})`,
        metaLabel: `${chunk.length} Foto(s) klein und übersichtlich auf 1 DIN-A4-Blatt`
      });
    }

    // Placeholder sheet with visual illustration when nothing is uploaded yet
    if (sheets.length === 0) {
      const halfW = (innerW - gap) / 2;
      sheets.push({
        sheetNumber: 1,
        sheetWidth: sheetW,
        sheetHeight: sheetH,
        placements: [],
        guideLines: [{ x1: sheetW / 2, y1: m * 0.4, x2: sheetW / 2, y2: sheetH - m * 0.4 }],
        isPlaceholder: true,
        placeholderBoxes: [
          {
            x: m,
            y: m,
            w: halfW,
            h: innerH,
            title: '📄 Linke Blatthälfte: Brief / PDF 1',
            subtitle: 'Hier liegt automatisch die 1. DIN-A4-Seite',
            bg: '#eff6ff',
            border: '#93c5fd',
            color: '#1d4ed8'
          },
          {
            x: m + halfW + gap,
            y: m,
            w: halfW,
            h: innerH,
            title: '📄 Rechte Blatthälfte: Brief 2 oder 🖼️ Fotos',
            subtitle: 'Hier liegt die 2. DIN-A4-Seite (oder verkleinerte Fotos)',
            bg: '#ecfdf5',
            border: '#6ee7b7',
            color: '#047857'
          }
        ],
        tagType: 'doc',
        tagLabel: 'BEISPIEL-ANSICHT — 1 DIN-A4-BLATT (QUERFORMAT)',
        metaLabel: 'Wählen Sie links Ihre Dateien aus, um die echte Vorschau zu sehen'
      });
    }

    return sheets;
  }

  function getCompactGridDimensions(count, areaW, areaH) {
    const isLandscapeArea = areaW >= areaH;
    switch (count) {
      case 2:
        return isLandscapeArea ? { cols: 2, rows: 1 } : { cols: 1, rows: 2 };
      case 3:
        return isLandscapeArea ? { cols: 3, rows: 1 } : { cols: 1, rows: 3 };
      case 4:
        return { cols: 2, rows: 2 };
      case 6:
        return isLandscapeArea ? { cols: 3, rows: 2 } : { cols: 2, rows: 3 };
      case 8:
        return isLandscapeArea ? { cols: 4, rows: 2 } : { cols: 2, rows: 4 };
      case 9:
        return { cols: 3, rows: 3 };
      case 12:
        return isLandscapeArea ? { cols: 4, rows: 3 } : { cols: 3, rows: 4 };
      default: {
        const cols = Math.ceil(Math.sqrt(count * (areaW / areaH)));
        const rows = Math.ceil(count / cols);
        return { cols, rows };
      }
    }
  }

  function renderSheetsPreview() {
    const sheets = computeA4Sheets();
    const realCount = sheets[0] && sheets[0].isPlaceholder ? 0 : sheets.length;
    els.previewDimText.textContent =
      realCount > 0
        ? `Ihr fertiges Dokument hat ${realCount} DIN-A4-Blatt/Blätter (aus ${state.items.length} hochgeladenen Seiten/Fotos)`
        : 'So werden Ihre Dokumente und Fotos auf DIN-A4-Blättern angeordnet';

    els.sheetsContainer.innerHTML = '';

    sheets.forEach((sheet) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'sheet-wrapper';

      const labelBar = document.createElement('div');
      labelBar.className = 'sheet-label-bar';

      const tag = document.createElement('span');
      tag.className =
        sheet.tagType === 'img'
          ? 'sheet-tag img-sheet-tag'
          : sheet.tagType === 'mixed'
          ? 'sheet-tag mixed-sheet-tag'
          : 'sheet-tag';
      tag.textContent = sheet.tagLabel;

      const meta = document.createElement('span');
      meta.className = 'sheet-meta';
      meta.textContent = sheet.metaLabel;

      labelBar.appendChild(tag);
      labelBar.appendChild(meta);

      const stage = document.createElement('div');
      stage.className = 'sheet-stage';

      const canvas = document.createElement('canvas');
      canvas.className = 'sheet-canvas';
      drawA4SheetOnCanvas(canvas, sheet, 1.25);

      stage.appendChild(canvas);
      wrapper.appendChild(labelBar);
      wrapper.appendChild(stage);
      els.sheetsContainer.appendChild(wrapper);
    });
  }

  function drawA4SheetOnCanvas(canvas, sheet, scale) {
    const w = Math.round(sheet.sheetWidth * scale);
    const h = Math.round(sheet.sheetHeight * scale);
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    if (sheet.isPlaceholder && sheet.placeholderBoxes) {
      for (const box of sheet.placeholderBoxes) {
        drawPlaceholderBox(
          ctx,
          box.x * scale,
          box.y * scale,
          box.w * scale,
          box.h * scale,
          box.title,
          box.subtitle,
          box.bg,
          box.border,
          box.color
        );
      }
    }

    for (const p of sheet.placements) {
      const rx = p.x * scale;
      const ry = p.y * scale;
      const rw = p.w * scale;
      const rh = p.h * scale;
      const captionH = state.showCaptions && p.slotRole === 'img' ? 14 * scale : 0;
      const contentH = Math.max(10, rh - captionH);

      const rotCanvas = getRotatedCanvas(p.item.previewCanvas, p.item.rotation);
      const fitMode = p.slotRole === 'img' ? state.imageFit : 'contain';

      drawCanvasInBox(ctx, rotCanvas, fitMode, rx, ry, rw, contentH);

      if (captionH > 0) {
        ctx.save();
        ctx.fillStyle = '#475569';
        ctx.font = `${Math.round(9.5 * scale)}px -apple-system, sans-serif`;
        ctx.textAlign = 'center';
        const shortLabel =
          p.item.label.length > 28 ? p.item.label.slice(0, 26) + '…' : p.item.label;
        ctx.fillText(shortLabel, rx + rw / 2, ry + rh - 3 * scale);
        ctx.restore();
      }
    }

    if (state.showGuides && sheet.guideLines) {
      ctx.save();
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = Math.max(1, 0.75 * scale);
      ctx.setLineDash([5 * scale, 4 * scale]);
      for (const line of sheet.guideLines) {
        ctx.beginPath();
        ctx.moveTo(line.x1 * scale, line.y1 * scale);
        ctx.lineTo(line.x2 * scale, line.y2 * scale);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.restore();
  }

  function drawCanvasInBox(ctx, srcCanvas, fitMode, boxX, boxY, boxW, boxH) {
    const srcRatio = srcCanvas.width / srcCanvas.height;
    const boxRatio = boxW / boxH;

    ctx.save();
    ctx.beginPath();
    ctx.rect(boxX, boxY, boxW, boxH);
    ctx.clip();

    let drawW, drawH;
    if (fitMode === 'cover') {
      if (srcRatio > boxRatio) {
        drawH = boxH;
        drawW = boxH * srcRatio;
      } else {
        drawW = boxW;
        drawH = boxW / srcRatio;
      }
    } else {
      if (srcRatio > boxRatio) {
        drawW = boxW;
        drawH = boxW / srcRatio;
      } else {
        drawH = boxH;
        drawW = boxH * srcRatio;
      }
    }

    const drawX = boxX + (boxW - drawW) / 2;
    const drawY = boxY + (boxH - drawH) / 2;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(drawX, drawY, drawW, drawH);
    ctx.drawImage(srcCanvas, drawX, drawY, drawW, drawH);

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      fitMode === 'cover' ? boxX : drawX,
      fitMode === 'cover' ? boxY : drawY,
      fitMode === 'cover' ? boxW : drawW,
      fitMode === 'cover' ? boxH : drawH
    );
    ctx.restore();
  }

  function getRotatedCanvas(srcCanvas, rotationDeg) {
    const deg = ((rotationDeg % 360) + 360) % 360;
    if (deg === 0) return srcCanvas;
    const swap = deg === 90 || deg === 270;
    const c = document.createElement('canvas');
    c.width = swap ? srcCanvas.height : srcCanvas.width;
    c.height = swap ? srcCanvas.width : srcCanvas.height;
    const ctx = c.getContext('2d');
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate((deg * Math.PI) / 180);
    ctx.drawImage(srcCanvas, -srcCanvas.width / 2, -srcCanvas.height / 2);
    return c;
  }

  function drawPlaceholderBox(ctx, x, y, w, h, title, subtitle, bg, border, textColor) {
    ctx.save();
    ctx.fillStyle = bg;
    ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
    ctx.strokeStyle = border;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
    ctx.setLineDash([]);

    ctx.fillStyle = textColor;
    ctx.font = `bold ${Math.max(12, Math.min(17, Math.round(w * 0.044)))}px -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(title, x + w / 2, y + h / 2 - 8);

    ctx.fillStyle = '#64748b';
    ctx.font = `${Math.max(10, Math.min(13, Math.round(w * 0.033)))}px -apple-system, sans-serif`;
    ctx.fillText(subtitle, x + w / 2, y + h / 2 + 14);
    ctx.restore();
  }

  // Export all generated DIN A4 sheets into a single multi-page DIN A4 PDF
  async function exportCombinedPdf(openInNewTab = false) {
    if (state.items.length === 0) {
      showStatus(
        'Bitte wählen Sie zuerst in Schritt 1 Ihre Dateien aus (oder klicken Sie oben rechts auf „Beispiel ausprobieren“).',
        true
      );
      return;
    }

    try {
      els.downloadPdfBtn.disabled = true;
      els.openPdfTabBtn.disabled = true;
      hideStatus();

      const sheets = computeA4Sheets();
      let finalPdfBytes;

      if (window.PDFLib) {
        finalPdfBytes = await buildMultiPageVectorPdf(sheets);
      } else {
        finalPdfBytes = buildMultiPageCanvasPdfFallback(sheets);
      }

      const blob = new Blob([finalPdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);

      if (openInNewTab) {
        window.open(url, '_blank');
        showStatus(`Ihr fertiges PDF (${sheets.length} DIN-A4-Blatt/Blätter) wurde in einem neuen Tab zum Drucken geöffnet.`);
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Fertiges-DIN-A4-Dokument.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        showStatus(
          `„Fertiges-DIN-A4-Dokument.pdf“ (${sheets.length} DIN-A4-Seite${sheets.length === 1 ? '' : 'n'}) wurde gespeichert!`
        );
      }
    } catch (err) {
      console.error('Fehler beim Erstellen des PDFs:', err);
      showStatus(`Fehler beim Erstellen des PDFs: ${err.message || err}`, true);
    } finally {
      els.downloadPdfBtn.disabled = false;
      els.openPdfTabBtn.disabled = false;
    }
  }

  async function buildMultiPageVectorPdf(sheets) {
    const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
    const outDoc = await PDFDocument.create();
    const fontReg = await outDoc.embedFont(StandardFonts.Helvetica);

    for (const sheet of sheets) {
      const pdfPage = outDoc.addPage([sheet.sheetWidth, sheet.sheetHeight]);

      for (const p of sheet.placements) {
        const captionH = state.showCaptions && p.slotRole === 'img' ? 12 : 0;
        const boxW = p.w;
        const boxH = Math.max(10, p.h - captionH);
        const pdfBoxX = p.x;
        const pdfBoxY = sheet.sheetHeight - p.y - boxH;

        const item = p.item;
        const fitMode = p.slotRole === 'img' ? state.imageFit : 'contain';

        if (item.sourceType === 'pdf' && item.pdfBytes && item.rotation === 0 && fitMode === 'contain') {
          const srcDoc = await PDFDocument.load(item.pdfBytes);
          const safeIdx = Math.min(item.pageIndex, srcDoc.getPageCount() - 1);
          const [embPage] = await outDoc.embedPdf(srcDoc, [safeIdx]);

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
        } else {
          const rotCanvas = getRotatedCanvas(item.previewCanvas, item.rotation);
          if (fitMode === 'cover') {
            const croppedBytes = getCroppedCanvasJpegBytes(rotCanvas, boxW, boxH);
            const embImg = await outDoc.embedJpg(croppedBytes);
            pdfPage.drawImage(embImg, {
              x: pdfBoxX,
              y: pdfBoxY,
              width: boxW,
              height: boxH
            });
          } else {
            const pngBytes = dataUrlToUint8Array(rotCanvas.toDataURL('image/png'));
            const embImg = await outDoc.embedPng(pngBytes);
            const srcRatio = embImg.width / embImg.height;
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
            pdfPage.drawImage(embImg, {
              x: drawX,
              y: drawY,
              width: drawW,
              height: drawH
            });
          }
        }

        if (captionH > 0) {
          const shortLabel =
            item.label.length > 32 ? item.label.slice(0, 30) + '...' : item.label;
          const textSize = 7.5;
          const textWidth = fontReg.widthOfTextAtSize(shortLabel, textSize);
          pdfPage.drawText(shortLabel, {
            x: pdfBoxX + Math.max(0, (boxW - textWidth) / 2),
            y: sheet.sheetHeight - p.y - p.h + 2,
            size: textSize,
            font: fontReg,
            color: rgb(0.3, 0.35, 0.42)
          });
        }
      }

      if (state.showGuides && sheet.guideLines) {
        for (const line of sheet.guideLines) {
          pdfPage.drawLine({
            start: { x: line.x1, y: sheet.sheetHeight - line.y1 },
            end: { x: line.x2, y: sheet.sheetHeight - line.y2 },
            thickness: 0.5,
            color: rgb(0.75, 0.8, 0.86),
            dashArray: [5, 4]
          });
        }
      }
    }

    return await outDoc.save();
  }

  function getCroppedCanvasJpegBytes(srcCanvas, targetW, targetH) {
    const outCanvas = document.createElement('canvas');
    const scale = Math.min(2000 / Math.max(targetW, targetH), 3);
    outCanvas.width = Math.max(1, Math.round(targetW * scale));
    outCanvas.height = Math.max(1, Math.round(targetH * scale));
    const ctx = outCanvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, outCanvas.width, outCanvas.height);

    const srcRatio = srcCanvas.width / srcCanvas.height;
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
    ctx.drawImage(srcCanvas, drawX, drawY, drawW, drawH);

    return dataUrlToUint8Array(outCanvas.toDataURL('image/jpeg', 0.92));
  }

  function buildMultiPageCanvasPdfFallback(sheets) {
    const pageCanvases = sheets.map((sheet) => {
      const c = document.createElement('canvas');
      drawA4SheetOnCanvas(c, sheet, 2.2);
      return c;
    });

    const wPt = A4_LANDSCAPE.width.toFixed(2);
    const hPt = A4_LANDSCAPE.height.toFixed(2);
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
      pushStr('\nendobj\n');
    }

    pushStr('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');

    startObj(1);
    pushStr('<< /Type /Catalog /Pages 2 0 R >>');
    endObj();

    const pageObjIds = pageCanvases.map((_, idx) => 3 + idx * 3);

    startObj(2);
    pushStr(
      `<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageCanvases.length} >>`
    );
    endObj();

    pageCanvases.forEach((canvas, idx) => {
      const pageId = 3 + idx * 3;
      const imgId = pageId + 1;
      const contentId = pageId + 2;
      const jpg = dataUrlToUint8Array(canvas.toDataURL('image/jpeg', 0.92));

      startObj(pageId);
      pushStr(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${wPt} ${hPt}] /Resources << /XObject << /Im${idx} ${imgId} 0 R >> >> /Contents ${contentId} 0 R >>`
      );
      endObj();

      startObj(imgId);
      pushStr(
        `<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`
      );
      pushBytes(jpg);
      pushStr('\nendstream');
      endObj();

      const content = `q ${wPt} 0 0 ${hPt} 0 0 cm /Im${idx} Do Q`;
      startObj(contentId);
      pushStr(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
      endObj();
    });

    const totalObjs = 2 + pageCanvases.length * 3;
    const xrefOffset = byteLength;
    pushStr(`xref\n0 ${totalObjs + 1}\n0000000000 65535 f \n`);
    for (let i = 1; i <= totalObjs; i++) {
      pushStr(String(offsets[i]).padStart(10, '0') + ' 00000 n \n');
    }
    pushStr(
      `trailer\n<< /Size ${totalObjs + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
    );

    const out = new Uint8Array(byteLength);
    let pos = 0;
    for (const c of chunks) {
      out.set(c, pos);
      pos += c.length;
    }
    return out;
  }

  // Sample Demo Loader: Generates 3 DIN A4 PDF pages + 6 sample images
  async function loadSampleDemo() {
    try {
      hideStatus();
      state.items = [];

      const docThemes = [
        { accent: '#2563eb', light: '#dbeafe', subtitle: 'Antrag & Übersicht (DIN A4)' },
        { accent: '#7c3aed', light: '#ede9fe', subtitle: 'Angaben & Datenblatt (DIN A4)' },
        { accent: '#d97706', light: '#fef3c7', subtitle: 'Unterschrift & Beiblatt (DIN A4)' }
      ];

      for (let i = 0; i < docThemes.length; i++) {
        const pdfBytes = await createSampleSinglePagePdf(i + 1, docThemes[i]);
        await addPdfBytesItems(pdfBytes, `Beispiel-Brief-${i + 1}.pdf`);
      }

      const imgColors = [
        ['#065f46', '#059669', 'Foto / Ausweis 1'],
        ['#1e40af', '#3b82f6', 'Foto / Beleg 2'],
        ['#6b21a8', '#9333ea', 'Scan / Nachweis 3'],
        ['#9a3412', '#ea580c', 'Anhang Foto 4'],
        ['#0f766e', '#14b8a6', 'Anhang Foto 5'],
        ['#be123c', '#f43f5e', 'Anhang Foto 6']
      ];

      for (let i = 0; i < imgColors.length; i++) {
        const [c1, c2, title] = imgColors[i];
        const canvas = createSampleImageCanvas(i + 1, c1, c2, title);
        state.items.push({
          id: nextItemId++,
          kind: 'img',
          sourceType: 'image',
          label: `Beispiel-Foto-${i + 1}.png`,
          fileName: `Beispiel-Foto-${i + 1}.png`,
          pdfBytes: null,
          pageIndex: 0,
          previewCanvas: canvas,
          rotation: 0
        });
      }

      renderAll();
      showStatus(
        'Beispiel geladen: 3 Briefe (DIN A4) und 6 Fotos! Sehen Sie rechts, wie je 2 Briefe nebeneinander liegen und die Fotos klein zusammengestellt wurden.'
      );
    } catch (err) {
      console.error('Fehler beim Laden der Beispieldateien:', err);
      showStatus('Beispieldateien konnten nicht geladen werden.', true);
    }
  }

  async function createSampleSinglePagePdf(pageNum, theme) {
    if (window.PDFLib) {
      const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
      const doc = await PDFDocument.create();
      const page = doc.addPage([595.28, 841.89]);
      const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
      const fontReg = await doc.embedFont(StandardFonts.Helvetica);

      const accentRgb = hexToRgb01(theme.accent);
      const lightRgb = hexToRgb01(theme.light);

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

      page.drawText(`BRIEF / DOKUMENT ${pageNum}`, {
        x: 56,
        y: 758,
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

      for (let row = 0; row < 6; row++) {
        const yPos = 610 - row * 85;
        page.drawRectangle({
          x: 56,
          y: yPos,
          width: 483,
          height: 15,
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

      page.drawText(`Original DIN A4 • Wird automatisch zu zweit nebeneinander gelegt`, {
        x: 56,
        y: 55,
        size: 12,
        font: fontBold,
        color: rgb(0.4, 0.45, 0.52)
      });

      return await doc.save();
    }
    return new Uint8Array([37, 80, 68, 70]);
  }

  function createSampleImageCanvas(num, c1, c2, title) {
    const c = document.createElement('canvas');
    c.width = 720;
    c.height = 520;
    const ctx = c.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, c.width, c.height);
    grad.addColorStop(0, c1);
    grad.addColorStop(1, c2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, c.width, c.height);

    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 5;
    ctx.strokeRect(26, 26, c.width - 52, c.height - 52);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 42px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`FOTO ${num}`, c.width / 2, c.height / 2 - 14);

    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '26px -apple-system, sans-serif';
    ctx.fillText(title, c.width / 2, c.height / 2 + 34);
    return c;
  }

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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
