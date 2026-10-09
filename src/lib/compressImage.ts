/** Client-side job photo resize/compress for mobile uploads (no extra deps). */

export type CompressImageOptions = {
  maxEdge?: number;
  quality?: number;
  mimeType?: string;
};

export type CompressedImage = {
  blob: Blob;
  fileName: string;
  width: number;
  height: number;
  originalBytes: number;
  compressedBytes: number;
};

function baseName(name: string): string {
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const i = safe.lastIndexOf(".");
  return i > 0 ? safe.slice(0, i) : safe || "foto";
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Bild konnte nicht geladen werden."));
    };
    img.src = url;
  });
}

/**
 * Resize so the longest edge is at most `maxEdge`, encode as JPEG (~quality 0.72).
 * Returns the original file wrapped as a blob if it is already small enough and JPEG-ish.
 */
export async function compressImageFile(
  file: File,
  opts: CompressImageOptions = {}
): Promise<CompressedImage> {
  const maxEdge = opts.maxEdge ?? 1600;
  const quality = opts.quality ?? 0.72;
  const mimeType = opts.mimeType ?? "image/jpeg";
  const originalBytes = file.size;

  if (!file.type.startsWith("image/") && file.type !== "") {
    throw new Error("Nur Bilddateien können hochgeladen werden.");
  }

  const img = await loadImage(file);
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  if (!srcW || !srcH) throw new Error("Ungültige Bildmaße.");

  const scale = Math.min(1, maxEdge / Math.max(srcW, srcH));
  const width = Math.max(1, Math.round(srcW * scale));
  const height = Math.max(1, Math.round(srcH * scale));

  // Skip re-encode only when already small JPEG/WebP under limits
  const alreadyOk =
    scale === 1 &&
    originalBytes <= 450_000 &&
    (file.type === "image/jpeg" || file.type === "image/jpg" || file.type === "image/webp");
  if (alreadyOk) {
    return {
      blob: file,
      fileName: file.name,
      width: srcW,
      height: srcH,
      originalBytes,
      compressedBytes: originalBytes,
    };
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Bildverarbeitung nicht verfügbar.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Komprimierung fehlgeschlagen."))),
      mimeType,
      quality
    );
  });

  return {
    blob,
    fileName: `${baseName(file.name)}.jpg`,
    width,
    height,
    originalBytes,
    compressedBytes: blob.size,
  };
}
