const imageOrPdfExtensions = /\.(pdf|jpe?g|png|gif|webp|bmp|svg)$/i;

export function isPdfOrImageFile(file: File): boolean {
  const type = file.type.toLowerCase();
  return type.startsWith('image/') || type === 'application/pdf' || imageOrPdfExtensions.test(file.name);
}

export function hasOnlyPdfOrImageFiles(files: File[]): boolean {
  return files.every(isPdfOrImageFile);
}

