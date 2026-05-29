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

import { TextSelection } from 'prosemirror-state';
import Config from './config.js';
import { getDocumentContentNode } from './utils/html.js';
import { setActiveSlideIndex, setSlideshowMode } from './editor/plugins/slideshowDecorations.js';

const MODES = { FULL: 'full', SINGLE: 'single' };
// Vertical thumbnail rail layout: each thumb's transformed height
// (640px * 0.215 ≈ 138px) plus 14px gap.
const THUMB_TOP_BASE = 24;
const THUMB_STRIDE = 152;

// Skipped when syncing slide id to URL; 'open=' is handled specially (slide id rides as its fragment).
const OTHER_DOKIELI_HASH_PARAMS = ['author', 'graph', 'graph-view', 'output', 'social', 'style'];

let activeIndex = 0;
let started = false;
let keyupHandler = null;
let keydownHandler = null;
let hashHandler = null;
let railClickHandler = null;
let decorationsUpdateHandler = null;
let modeChangeHandler = null;

function getSlides() {
  // Exclude the cloned active-slide thumbnail living inside #rail-active-placeholder.
  return Array.from(document.querySelectorAll('.shower .slide'))
    .filter(s => !s.closest('#rail-active-placeholder'));
}

function getProgress() {
  return document.querySelector('.shower .progress');
}

function isFull() {
  return document.body.classList.contains(MODES.FULL);
}

function getEditorView() {
  return Config.Editor?.authorToolbarView?.editorView || null;
}

function setActive(idx, options = {}) {
  const slides = getSlides();
  if (!slides.length) return;
  activeIndex = Math.max(0, Math.min(idx, slides.length - 1));
  const view = getEditorView();
  if (view) {
    // PM owns the slide DOM; route .active and rail tops through a decoration plugin.
    setActiveSlideIndex(view, activeIndex);
  } else {
    slides.forEach((s, i) => s.classList.toggle('active', i === activeIndex));
  }
  updateProgress();
  if (!isFull()) layoutSingle();
  if (options.syncHash !== false) syncToHash(slides[activeIndex]);
  if (options.focusEditor && view && Config.Editor?.mode === 'author') {
    focusActiveSlideHeading(view, activeIndex);
  }
}

// Place PM's cursor inside the active slide's first heading so typing lands in the slide.
function focusActiveSlideHeading(view, idx) {
  let sectionIdx = 0;
  let targetPos = null;
  view.state.doc.descendants((node, pos) => {
    if (targetPos !== null) return false;
    if (node.type.name !== 'section') return true;
    const cls = node.attrs.originalAttributes?.class || '';
    if (!cls.split(/\s+/).includes('slide')) return true;
    if (sectionIdx === idx) {
      node.descendants((child, childPos) => {
        if (targetPos !== null) return false;
        if (child.type.name === 'heading') {
          targetPos = pos + 1 + childPos + 1;
          return false;
        }
        return true;
      });
    }
    sectionIdx++;
    return false;
  });
  if (targetPos === null) return;
  const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, targetPos));
  view.dispatch(tr);
  view.focus();
}

// Active slide goes to the main area via CSS; placeholder holds its rail slot. In PM mode the decoration plugin owns rail tops; here we only manage the placeholder.
export function layoutSingle() {
  const slides = getSlides();
  if (!getEditorView()) {
    for (let i = 0; i < slides.length; i++) {
      const s = slides[i];
      if (s.classList.contains('active')) {
        s.style.top = '';
      } else {
        s.style.top = (THUMB_TOP_BASE + i * THUMB_STRIDE) + 'px';
      }
    }
  }
  // Rail thumbs are position:absolute and don't grow the article. Without this
  // the page can't scroll to thumbs past the viewport.
  const article = document.querySelector('.shower > main > article');
  if (article) {
    const railBottom = THUMB_TOP_BASE + slides.length * THUMB_STRIDE;
    article.style.minHeight = `max(100vh, ${railBottom}px)`;
  }
  updateActivePlaceholder(slides);
}

function updateActivePlaceholder(slides) {
  const activeIdx = slides.findIndex(s => s.classList.contains('active'));
  let placeholder = document.getElementById('rail-active-placeholder');
  if (activeIdx < 0) {
    placeholder?.remove();
    return;
  }
  if (!placeholder) {
    placeholder = document.createElement('div');
    placeholder.id = 'rail-active-placeholder';
    placeholder.className = 'do';
    document.body.appendChild(placeholder);
  }
  // Mirror the active slide into the placeholder so the rail shows it under the green overlay.
  const activeSlide = slides[activeIdx];
  const clone = activeSlide.cloneNode(true);
  clone.removeAttribute('contenteditable');
  clone.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
  clone.setAttribute('draggable', 'true');
  placeholder.replaceChildren(clone);

  const article = document.querySelector('.shower > main > article');
  if (!article) return;
  const rect = article.getBoundingClientRect();
  placeholder.style.top = (rect.top + window.scrollY + THUMB_TOP_BASE + activeIdx * THUMB_STRIDE) + 'px';
  placeholder.style.left = (rect.left + window.scrollX + 24) + 'px';
}

export function clearSingleLayout() {
  if (!getEditorView()) {
    for (const s of getSlides()) s.style.top = '';
  }
  const article = document.querySelector('.shower > main > article');
  if (article) article.style.minHeight = '';
  document.getElementById('rail-active-placeholder')?.remove();
}

function hasOtherDokieliParam(hashStr) {
  if (!hashStr) return false;
  const params = new URLSearchParams(hashStr);
  return OTHER_DOKIELI_HASH_PARAMS.some(p => params.has(p));
}

// Forms: #open=URL#slide-id (riding open's fragment) | #slide-id (bare) | other dokieli params (skipped).
function syncToHash(slide) {
  if (!slide?.id) return;
  const cur = location.hash.startsWith('#') ? location.hash.slice(1) : '';

  let next;
  if (/(?:^|&)open=/.test(cur)) {
    next = /(?:^|&)open=[^&#]*#[^&]*/.test(cur)
      ? cur.replace(/((?:^|&)open=[^&#]*)#[^&]*/, `$1#${slide.id}`)
      : cur.replace(/((?:^|&)open=[^&#]*)/, `$1#${slide.id}`);
  } else if (hasOtherDokieliParam(cur)) {
    return;
  } else {
    next = slide.id;
  }

  const target = '#' + next;
  if (location.hash === target) return;
  history.replaceState(null, '', target);
}

// Strip slide id from the URL — used on exit from full mode so the URL no longer deep-links to a slide.
function clearSlideFromHash() {
  const cur = location.hash.startsWith('#') ? location.hash.slice(1) : '';
  if (!cur) return;

  let next;
  if (/(?:^|&)open=[^&#]*#[^&]*/.test(cur)) {
    next = cur.replace(/((?:^|&)open=[^&#]*)#[^&]*/, '$1');
  } else if (!hasOtherDokieliParam(cur) && !/[=&]/.test(cur)) {
    next = '';
  } else {
    return;
  }

  const target = next ? '#' + next : location.pathname + location.search;
  if (location.hash === (next ? '#' + next : '')) return;
  history.replaceState(null, '', target);
}

function updateProgress() {
  const progress = getProgress();
  const slides = getSlides();
  if (!progress || !slides.length) return;
  const pct = ((activeIndex + 1) / slides.length) * 100;
  progress.style.width = pct + '%';
}

export function goTo(idx) {
  setActive(idx, { focusEditor: true });
}

export function next() {
  setActive(activeIndex + 1);
}

export function prev() {
  setActive(activeIndex - 1);
}

export function enterFullMode() {
  document.body.classList.remove(MODES.SINGLE);
  document.body.classList.add(MODES.FULL);
  clearSingleLayout();
  const view = getEditorView();
  if (view) setSlideshowMode(view, MODES.FULL);
  setActive(activeIndex);
}

export function exitFullMode() {
  document.body.classList.remove(MODES.FULL);
  document.body.classList.add(MODES.SINGLE);
  const view = getEditorView();
  if (view) setSlideshowMode(view, MODES.SINGLE);
  layoutSingle();
  clearSlideFromHash();
}

function onKeyup(e) {
  if (!document.body.classList.contains('shower')) return;
  // Presentation keys override the editor cursor in fullscreen.
  if (!isFull()) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    exitFullMode();
  }
}

function onKeydown(e) {
  if (!document.body.classList.contains('shower')) return;
  if (!isFull()) return;

  switch (e.key) {
    case 'ArrowRight':
    case 'ArrowDown':
    case 'PageDown':
    case ' ':
      e.preventDefault();
      e.stopPropagation();
      next();
      return;
    case 'ArrowLeft':
    case 'ArrowUp':
    case 'PageUp':
      e.preventDefault();
      e.stopPropagation();
      prev();
      return;
    case 'Home':
      e.preventDefault();
      e.stopPropagation();
      setActive(0);
      return;
    case 'End':
      e.preventDefault();
      e.stopPropagation();
      setActive(getSlides().length - 1);
      return;
  }
}

// Rail click: clicking a non-active thumbnail makes it the active slide.
function onRailClick(e) {
  if (!document.body.classList.contains('shower')) return;
  if (isFull()) return;
  if (e.target.closest('#document-menu') || e.target.closest('.do')) return;
  const slide = e.target.closest('.slide');
  if (!slide || slide.classList.contains('active')) return;
  e.preventDefault();
  const idx = getSlides().indexOf(slide);
  if (idx >= 0) setActive(idx, { focusEditor: true });
}

// Resolves slide from #slide-id or #open=URL#slide-id; returns the element or null.
function syncFromHash() {
  const hash = location.hash.startsWith('#') ? location.hash.slice(1) : '';
  if (!hash) return null;

  let slideId;
  const m = hash.match(/(?:^|&)open=[^&]*#([^&]+)/);
  if (m) {
    slideId = m[1];
  } else if (!/[=&]/.test(hash)) {
    slideId = hash;
  }
  if (!slideId) return null;

  const slide = document.getElementById(slideId);
  if (!slide || !slide.classList.contains('slide')) return null;
  const idx = getSlides().indexOf(slide);
  if (idx < 0) return null;
  setActive(idx, { syncHash: false });
  return slide;
}

export function start(options = {}) {
  if (started) return;
  started = true;

  const content = getDocumentContentNode(document);
  if (!content || !content.classList.contains('shower')) {
    started = false;
    return;
  }

  if (!getProgress()) {
    const div = document.createElement('div');
    div.className = 'do progress';
    content.appendChild(div);
  }

  if (!document.body.classList.contains(MODES.FULL)
      && !document.body.classList.contains(MODES.SINGLE)) {
    document.body.classList.add(MODES.SINGLE);
  }
  if (!isFull()) layoutSingle();

  setActive(0, { syncHash: false, focusEditor: options.focusEditor === true });
  const deepLinked = syncFromHash();
  // Deep-link entry: shared #slide-id URL lands in full mode (unless editing).
  if (deepLinked && Config.Editor?.mode !== 'author') {
    enterFullMode();
  }

  keydownHandler = onKeydown;
  keyupHandler = onKeyup;
  hashHandler = syncFromHash;
  railClickHandler = onRailClick;
  decorationsUpdateHandler = () => { if (!isFull()) layoutSingle(); };
  // In author mode .active is a PM decoration, not a real attribute; switching to
  // reading mode destroys the editor and drops it, leaving the main view empty.
  // Re-apply the active slide for the new mode (read mode toggles the real class).
  modeChangeHandler = () => {
    if (!document.body.classList.contains('shower')) return;
    setActive(activeIndex, { syncHash: false });
  };
  document.addEventListener('keydown', keydownHandler, true);
  document.addEventListener('keyup', keyupHandler, true);
  window.addEventListener('hashchange', hashHandler);
  document.addEventListener('click', railClickHandler, true);
  window.addEventListener('dokieli:slideshow-decorations-updated', decorationsUpdateHandler);
  window.addEventListener('dokieli:editor-mode-changed', modeChangeHandler);
}

export function stop() {
  if (!started) return;
  started = false;
  if (keydownHandler) document.removeEventListener('keydown', keydownHandler, true);
  if (keyupHandler) document.removeEventListener('keyup', keyupHandler, true);
  if (hashHandler) window.removeEventListener('hashchange', hashHandler);
  if (railClickHandler) document.removeEventListener('click', railClickHandler, true);
  if (decorationsUpdateHandler) window.removeEventListener('dokieli:slideshow-decorations-updated', decorationsUpdateHandler);
  if (modeChangeHandler) window.removeEventListener('dokieli:editor-mode-changed', modeChangeHandler);
  keydownHandler = keyupHandler = hashHandler = railClickHandler = decorationsUpdateHandler = modeChangeHandler = null;
}

export function isStarted() {
  return started;
}

export default {
  start,
  stop,
  goTo,
  next,
  prev,
  enterFullMode,
  exitFullMode,
  layoutSingle,
  clearSingleLayout,
  isStarted,
};
