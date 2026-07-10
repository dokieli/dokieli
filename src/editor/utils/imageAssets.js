/*!
Copyright 2012-2026 Sarven Capadisli <https://csarven.ca/>
Copyright 2023-2026 Virginia Balseiro <https://virginiabalseiro.com/>

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

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

// Default in-document target path for an inserted image file, e.g.
// "media/images/diagram.png". This is what goes into the image form's URL field
// and into the <img src> — a relative, collaboratively-resolvable location — not
// a browser-local blob: URL.
export function defaultImageTargetPath(file) {
  const baseName = sanitizeFilename(file?.name || 'image');
  let { stem, ext } = splitExt(baseName);
  if (!ext) ext = extFromType(file?.type);
  return getBaseURL(Config.DocumentURL) + `media/images/${stem}${ext || ''}`;
}

// A src that is not an absolute URL (nor data:/blob:) — a relative path.
export function isRelativeTargetPath(src) {
  return typeof src === 'string' && src.length > 0 && !/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(src);
}

// True when we should upload the chosen file to `src`: a relative path, or an
// absolute URL under the current document's container. (Not gated on sign-in —
// whether the PUT is allowed is the storage backend's call, same as saving.)
export function isUploadableTarget(src) {
  if (!src) return false;
  if (isRelativeTargetPath(src)) return true;
  const base = getBaseURL(Config.DocumentURL);
  return typeof base === 'string' && src.startsWith(base);
}

// PUT an image file to `pathOrURL` (relative paths resolve against the document).
export async function uploadImageFile(pathOrURL, file, options = {}) {
  const target = isRelativeTargetPath(pathOrURL)
    ? getBaseURL(Config.DocumentURL) + pathOrURL
    : pathOrURL;
  const buffer = await file.arrayBuffer();
  const contentType = file.type || 'application/octet-stream';
  return Config.Storage.put(target, buffer, contentType, null, options);
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
