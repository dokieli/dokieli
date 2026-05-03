/*!
Copyright 2026 Virginia Balseiro <https://virginiabalseiro.com/>

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
*/

import { getDocumentContentNode } from './utils/html.js';

const MODES = { LIST: 'list', FULL: 'full' };

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

function setActive(idx) {
  const slides = getSlides();
  if (!slides.length) return;
  activeIndex = Math.max(0, Math.min(idx, slides.length - 1));
  slides.forEach((s, i) => s.classList.toggle('active', i === activeIndex));
  updateProgress();
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

function syncFromHash() {
  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
  if (!hash) return;
  const slide = document.getElementById(hash);
  if (!slide || !slide.classList.contains('slide')) return;
  const idx = getSlides().indexOf(slide);
  if (idx >= 0) setActive(idx);
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

  setActive(0);
  syncFromHash();

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
