// src/lib/docExtract.ts
// Extract plain text from an uploaded document so it can be analyzed into the Project Brain.
// Supports .txt / .md (native) and .docx (via mammoth, dynamically imported so it's only
// loaded when a docx is actually uploaded). PDF is a planned follow-up.

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

  throw new Error('Unsupported file type — upload a .txt, .md, or .docx (PDF support coming).');
}
