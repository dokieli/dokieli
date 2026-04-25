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
    const baseName = sanitizeFilename(file?.name || 'image');
    const { stem, ext } = splitExt(baseName);
    let candidate = `media/images/${baseName}`;
    let n = 1;
    while (used.has(candidate)) {
      n += 1;
      candidate = `media/images/${stem}-${n}${ext}`;
    }
    used.add(candidate);
    img.setAttribute('src', candidate);
    mapping.push({ blobURL: src, relativePath: candidate, file });
  }
  return mapping;
}

export async function uploadBlobAssets(storageIRI, mapping, options = {}) {
  if (!mapping.length) return [];
  const baseURL = getBaseURL(storageIRI);
  const tasks = mapping.map(async ({ blobURL, relativePath, file }) => {
    let blob = file;
    if (!blob) {
      const r = await fetch(blobURL);
      blob = await r.blob();
    }
    const buffer = await blob.arrayBuffer();
    const contentType = blob.type || 'application/octet-stream';
    const target = baseURL + relativePath;
    return Config.Storage.put(target, buffer, contentType, null, options);
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
