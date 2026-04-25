import Config from '../../config.js';
import { getBaseURL } from '../../uri.js';

const blobAssets = new Map();

export function registerBlobAsset(blobURL, file) {
  if (!blobURL || !file) return;
  blobAssets.set(blobURL, { kind: 'upload', file });
}

export function registerAuthResolvedBlob(blobURL, originalSrc) {
  if (!blobURL || !originalSrc) return;
  blobAssets.set(blobURL, { kind: 'auth', originalSrc });
}

export function getBlobAsset(blobURL) {
  return blobAssets.get(blobURL);
}

export function clearBlobAssets() {
  for (const url of blobAssets.keys()) {
    try { URL.revokeObjectURL(url); } catch {}
  }
  blobAssets.clear();
}

export function hasUploadTarget() {
  return Boolean(Config?.User?.IRI || Config?.Session?.isActive);
}

function sanitizeFilename(name) {
  const safe = (name || 'image')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/^-+|-+$/g, '');
  return safe || 'image';
}

function splitExt(name) {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return { stem: name, ext: '' };
  return { stem: name.slice(0, dot), ext: name.slice(dot) };
}

const TYPE_TO_EXT = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'image/avif': '.avif',
  'image/bmp': '.bmp',
  'image/tiff': '.tiff'
};

function extFromType(type) {
  if (!type) return '';
  return TYPE_TO_EXT[type.toLowerCase()] || '';
}

export function describeBlobAsset(blobURL) {
  const entry = blobAssets.get(blobURL);
  if (entry?.kind !== 'upload') return null;
  const file = entry.file;
  if (!file) return null;
  return { name: file.name || '', type: file.type || '' };
}

export function rewriteBlobImagesToRelative(rootEl, used = new Set()) {
  const mapping = [];
  const imgs = rootEl.querySelectorAll('img[src^="blob:"]');
  for (const img of imgs) {
    const src = img.getAttribute('src');
    const entry = blobAssets.get(src);

    if (entry?.kind === 'auth') {
      img.setAttribute('src', entry.originalSrc);
      continue;
    }

    const file = entry?.file;
    const storedName = img.getAttribute('data-original-filename') || '';
    const storedType = img.getAttribute('data-content-type') || '';
    const baseName = sanitizeFilename(file?.name || storedName || 'image');
    let { stem, ext } = splitExt(baseName);
    if (!ext) ext = extFromType(file?.type || storedType);
    const finalBase = `${stem}${ext}`;
    let candidate = `media/images/${finalBase}`;
    let n = 1;
    while (used.has(candidate)) {
      n += 1;
      candidate = `media/images/${stem}-${n}${ext}`;
    }
    used.add(candidate);
    img.setAttribute('src', candidate);
    img.removeAttribute('data-original-filename');
    img.removeAttribute('data-content-type');
    mapping.push({ blobURL: src, relativePath: candidate, file, contentType: file?.type || storedType || '' });
  }
  return mapping;
}

export async function uploadBlobAssets(storageIRI, mapping, options = {}) {
  if (!mapping.length) return [];
  const baseURL = getBaseURL(storageIRI);
  const tasks = mapping.map(async ({ blobURL, relativePath, file, contentType }) => {
    let blob = file;
    if (!blob) {
      const r = await fetch(blobURL);
      blob = await r.blob();
    }
    const buffer = await blob.arrayBuffer();
    const resolvedType = blob.type || contentType || 'application/octet-stream';
    const target = baseURL + relativePath;
    return Config.Storage.put(target, buffer, resolvedType, null, options);
  });
  return Promise.allSettled(tasks);
}

export async function resolveAuthenticatedImages(rootEl) {
  const gitforge = Config.Storage?.backend?.('gitforge');
  if (!gitforge) return;
  const imgs = Array.from(rootEl.querySelectorAll('img[src]'));
  await Promise.all(imgs.map(async (img) => {
    const original = img.getAttribute('src');
    if (!original || original.startsWith('blob:') || original.startsWith('data:')) return;
    let absolute;
    try {
      absolute = new URL(original, document.baseURI).href;
    } catch {
      return;
    }
    let host;
    try { host = new URL(absolute).host; } catch { return; }
    if (!gitforge.matches(host)) return;
    try {
      const response = await gitforge.get(absolute);
      if (!response.ok) return;
      const blob = await response.blob();
      const blobURL = URL.createObjectURL(blob);
      img.src = blobURL;
      registerAuthResolvedBlob(blobURL, original);
    } catch {}
  }));
}
