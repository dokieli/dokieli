/*!
Copyright 2026 Virginia Balseiro <https://virginiabalseiro.com/>

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
*/

import Config from './config.js';
import { getDocumentContentNode } from './utils/html.js';

const MODES = { LIST: 'list', FULL: 'full' };

// Skipped when syncing slide id to URL; 'open=' is handled specially (slide id rides as its fragment).
const OTHER_DOKIELI_HASH_PARAMS = ['author', 'graph', 'graph-view', 'output', 'social', 'style'];

let activeIndex = 0;
let started = false;
let keyupHandler = null;
let keydownHandler = null;
let hashHandler = null;

function getSlides() {
  return Array.from(document.querySelectorAll('.shower .slide'));
}

function getProgress() {
  return document.querySelector('.shower .progress');
}

function isList() {
  return document.body.classList.contains(MODES.LIST);
}

function isFull() {
  return document.body.classList.contains(MODES.FULL);
}

function inEditableTarget(target) {
  return !!(target && target.closest && target.closest('[contenteditable=""], [contenteditable="true"]'));
}

function setActive(idx, options = {}) {
  const slides = getSlides();
  if (!slides.length) return;
  activeIndex = Math.max(0, Math.min(idx, slides.length - 1));
  slides.forEach((s, i) => s.classList.toggle('active', i === activeIndex));
  updateProgress();
  if (options.syncHash !== false) syncToHash(slides[activeIndex]);
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
  setActive(idx);
}

export function next() {
  setActive(activeIndex + 1);
}

export function prev() {
  setActive(activeIndex - 1);
}

export function enterFullMode() {
  document.body.classList.remove(MODES.LIST);
  document.body.classList.add(MODES.FULL);
  setActive(activeIndex);
}

export function exitFullMode() {
  document.body.classList.remove(MODES.FULL);
  document.body.classList.add(MODES.LIST);
  clearSlideFromHash();
}

function onKeyup(e) {
  if (!document.body.classList.contains('shower')) return;
  if (inEditableTarget(e.target)) return;

  if (isFull() && e.key === 'Escape') {
    e.preventDefault();
    exitFullMode();
  }
}

function onKeydown(e) {
  if (!document.body.classList.contains('shower')) return;
  if (inEditableTarget(e.target)) return;

  if (isFull()) {
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
      case 'PageDown':
      case ' ':
        e.preventDefault();
        next();
        return;
      case 'ArrowLeft':
      case 'ArrowUp':
      case 'PageUp':
        e.preventDefault();
        prev();
        return;
      case 'Home':
        e.preventDefault();
        setActive(0);
        return;
      case 'End':
        e.preventDefault();
        setActive(getSlides().length - 1);
        return;
    }
  }
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

export function start() {
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

  if (!document.body.classList.contains(MODES.LIST) && !document.body.classList.contains(MODES.FULL)) {
    document.body.classList.add(MODES.LIST);
  }

  setActive(0, { syncHash: false });
  const deepLinked = syncFromHash();
  // Deep-link entry: shared #slide-id URL lands in full mode (unless editing).
  if (deepLinked && Config.Editor?.mode !== 'author') {
    enterFullMode();
  }

  keydownHandler = onKeydown;
  keyupHandler = onKeyup;
  hashHandler = syncFromHash;
  document.addEventListener('keydown', keydownHandler);
  document.addEventListener('keyup', keyupHandler);
  window.addEventListener('hashchange', hashHandler);
}

export function stop() {
  if (!started) return;
  started = false;
  if (keydownHandler) document.removeEventListener('keydown', keydownHandler);
  if (keyupHandler) document.removeEventListener('keyup', keyupHandler);
  if (hashHandler) window.removeEventListener('hashchange', hashHandler);
  keydownHandler = keyupHandler = hashHandler = null;
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
  isStarted,
};
