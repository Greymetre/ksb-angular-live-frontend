// Attachment rules for invoices. These mirror Api/Services/InvoiceAttachmentStore.cs -
// the backend rejects anything outside them, so keep the two in step.
export const MAX_INVOICE_ATTACHMENTS = 10;
export const MAX_INVOICE_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_INVOICE_PDF_BYTES = 10 * 1024 * 1024;

export function isPdfFile(file: File): boolean {
  return file.type.toLowerCase() === 'application/pdf' || /\.pdf$/i.test(file.name);
}

export function megabytes(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(2);
}

/**
 * Shrinks an image until it fits {@link MAX_INVOICE_IMAGE_BYTES}, and returns the
 * original untouched when it already does (or when it is a PDF, which we never
 * re-encode). Throws when even the smallest re-encode is still too large, so the
 * caller can show the message instead of uploading a file the API would refuse.
 */
export async function compressInvoiceAttachment(file: File): Promise<File> {
  if (isPdfFile(file)) {
    if (file.size > MAX_INVOICE_PDF_BYTES) {
      throw new Error(`"${file.name}" is ${megabytes(file.size)} MB. A PDF must be ${megabytes(MAX_INVOICE_PDF_BYTES)} MB or less.`);
    }
    return file;
  }

  if (file.size <= MAX_INVOICE_IMAGE_BYTES) return file;

  const bitmap = await loadImage(file);
  try {
    // Step the longest edge and the JPEG quality down together; the first pass that
    // fits wins, which keeps a barely-oversized photo close to its original quality.
    for (const [maxEdge, quality] of [[2560, 0.8], [2048, 0.7], [1600, 0.6], [1280, 0.5], [1024, 0.4]] as const) {
      const blob = await drawToBlob(bitmap, maxEdge, quality);
      if (blob && blob.size <= MAX_INVOICE_IMAGE_BYTES) {
        return new File([blob], renameToJpeg(file.name), { type: 'image/jpeg', lastModified: Date.now() });
      }
    }
  } finally {
    if ('close' in bitmap) (bitmap as ImageBitmap).close();
  }

  throw new Error(`After compression the attachment is greater than ${megabytes(MAX_INVOICE_IMAGE_BYTES)} MB. "${file.name}" could not be reduced - please attach a smaller image.`);
}

function renameToJpeg(name: string): string {
  return name.replace(/\.[^.]+$/, '') + '.jpg';
}

async function loadImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      // Safari can refuse some encodings here; the <img> path below still handles them.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`"${file.name}" could not be read as an image.`));
      image.src = url;
    });
  } finally {
    // The bitmap is already decoded by the time onload fires, so this is safe.
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function drawToBlob(source: ImageBitmap | HTMLImageElement, maxEdge: number, quality: number): Promise<Blob | null> {
  const width = 'naturalWidth' in source ? source.naturalWidth : source.width;
  const height = 'naturalHeight' in source ? source.naturalHeight : source.height;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  if (!context) return Promise.resolve(null);
  context.drawImage(source as CanvasImageSource, 0, 0, canvas.width, canvas.height);
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
}
