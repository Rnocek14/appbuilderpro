// src/lib/docExtract.ts
// Extract plain text from an uploaded document so it can be analyzed into the Project Brain.
// Supports .txt / .md (native), .docx (via mammoth), and .pdf (via pdfjs-dist) — the heavy parsers
// are dynamically imported so they only load when that file type is actually uploaded.

export async function extractText(file: File): Promise<string> {
  const name = file.name.toLowerCase();

  if (name.endsWith('.txt') || name.endsWith('.md') || file.type.startsWith('text/')) {
    return (await file.text()).trim();
  }

  if (name.endsWith('.docx')) {
    const mammoth = await import('mammoth');
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return (result.value ?? '').trim();
  }

  if (name.endsWith('.pdf') || file.type === 'application/pdf') {
    const pdfjs = await import('pdfjs-dist');
    const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const MAX_PAGES = 200; // enough for any real business document; bounds runaway files
    const pages: string[] = [];
    const n = Math.min(doc.numPages, MAX_PAGES);
    for (let i = 1; i <= n; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items.map((it) => ('str' in it ? it.str : '')).join(' '));
    }
    const text = pages.join('\n\n').replace(/[ \t]+/g, ' ').trim();
    if (!text) {
      // A scanned/image-only PDF has no text layer — say so honestly instead of ingesting emptiness.
      throw new Error('This PDF has no extractable text (it may be a scan). Nothing was ingested.');
    }
    return doc.numPages > MAX_PAGES ? `${text}\n\n[Note: extracted the first ${MAX_PAGES} of ${doc.numPages} pages.]` : text;
  }

  throw new Error('Unsupported file type — upload a .txt, .md, .docx, or .pdf.');
}
