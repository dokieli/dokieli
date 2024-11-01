"use strict";

function uniqueArray(a) {
  return Array.from(new Set(a));
}

function getDateTimeISO() {
  var date = new Date();
  return date.toISOString();
}

function getDateTimeISOFromMDY(s) {
  let date = new Date(s);

  let year = date.getFullYear();
  let month = String(date.getMonth() + 1).padStart(2, '0');
  let day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function convertToISO8601Duration(timeValue) {
  const [hours, minutes, seconds] = timeValue.split(':').map(Number);
  const formattedDuration = `PT${hours}H${minutes}M${seconds}S`;
  return formattedDuration;
}

function removeChildren(node) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fragmentFromString(strHTML) {
  return document.createRange().createContextualFragment(strHTML);
}

function generateUUID(inputString) {
  var lut = [];
  for (var i = 0; i < 256; i++) {
    lut[i] = (i < 16 ? "0" : "") + i.toString(16);
  }

  // Simple FNV-1a hash function to generate a deterministic 32-bit integer hash for each part
  function fnv1aHash(str, seed = 2166136261) {
    let hash = seed;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return hash >>> 0; // Ensure unsigned 32-bit integer
  }

  // Generate a UUID from four 32-bit numbers
  function formatUUID(d0, d1, d2, d3) {
    let uuid = (
      lut[d0 & 0xff] +
      lut[(d0 >> 8) & 0xff] +
      lut[(d0 >> 16) & 0xff] +
      lut[(d0 >> 24) & 0xff] +
      "-" +
      lut[d1 & 0xff] +
      lut[(d1 >> 8) & 0xff] +
      "-" +
      lut[((d1 >> 16) & 0x0f) | 0x40] +
      lut[(d1 >> 24) & 0xff] +
      "-" +
      lut[(d2 & 0x3f) | 0x80] +
      lut[(d2 >> 8) & 0xff] +
      "-" +
      lut[(d2 >> 16) & 0xff] +
      lut[(d2 >> 24) & 0xff] +
      lut[d3 & 0xff] +
      lut[(d3 >> 8) & 0xff] +
      lut[(d3 >> 16) & 0xff] +
      lut[(d3 >> 24) & 0xff]
    );

    // Ensure the UUID starts with a letter (a-f) if it's deterministic
    if (inputString && /^[0-9]/.test(uuid[0])) {
      uuid = 'a' + uuid.slice(1);
    }

    return uuid;
  }

  // Generate deterministic UUID if inputString is provided
  if (inputString) {
    const d0 = fnv1aHash(inputString, 2166136261);
    const d1 = fnv1aHash(inputString, 2166136261 ^ 0xdeadbeef);
    const d2 = fnv1aHash(inputString, 2166136261 ^ 0xcafebabe);
    const d3 = fnv1aHash(inputString, 2166136261 ^ 0x8badf00d);
    return formatUUID(d0, d1, d2, d3);
  }

  // Otherwise, generate random UUID
  const d0 = (Math.random() * 0xffffffff) | 0;
  const d1 = (Math.random() * 0xffffffff) | 0;
  const d2 = (Math.random() * 0xffffffff) | 0;
  const d3 = (Math.random() * 0xffffffff) | 0;
  return formatUUID(d0, d1, d2, d3);
}

function generateId(prefix, string, suffix) {
  prefix = prefix || "";

  if (string) {
    string = string.trim();
    string = string.replace(/\W/g, "-");
    var s1 = string.substr(0, 1);
    string =
      prefix === "" && s1 == parseInt(s1) ? "x-" + string : prefix + string;
    return document.getElementById(string)
      ? string + "-" + (suffix || generateUUID())
      : string;
  } else {
    return generateUUID();
  }
}

function generateAttributeId(prefix, string, suffix) {
  const id = generateId(prefix, string, suffix);
  if (/^\d/.test(id)) {
    return generateAttributeId(prefix, string, suffix);
  }
  return id;
}

function getHash(message, algo = "SHA-256") {
  var buffer = new TextEncoder("utf-8").encode(message);
  return window.crypto.subtle.digest(algo, buffer).then(function (hash) {
    var hexCodes = [];
    var view = new DataView(hash);
    for (var i = 0; i < view.byteLength; i += 4) {
      var value = view.getUint32(i);
      var stringValue = value.toString(16);
      var padding = "00000000";
      var paddedValue = (padding + stringValue).slice(-padding.length);
      hexCodes.push(paddedValue);
    }
    return hexCodes.join("");
  });
}

function hashCode(s) {
  var hash = 0;
  if (s.length == 0) return hash;
  for (var i = 0; i < s.length; i++) {
    var char = s.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash;
}

function sortToLower(array, key) {
  return array.sort(function (a, b) {
    if (key) {
      a = a[key];
      b = b[key];
    }
    return a.toLowerCase().localeCompare(b.toLowerCase());
  });
}

function matchAllIndex(string, regexp) {
  //XXX: This used to be String.protocol.matchAll from https://web.archive.org/web/20180407184826/http://cwestblog.com/2013/02/26/javascript-string-prototype-matchall/ and returns an Array, but it is being repurposed. Firefox Nightly 66.0a1 (around 2018-12-24) started to support String.prototype.matchAll and returns an RegExp String Iterator. Changing it to matchAllIndex to not conflict

  // if (!String.prototype.matchAll) {
    // String.prototype.matchAll = function(regexp) {
      var matches = [];
      // this.replace(regexp, function() {
      string.replace(regexp, function() {
        var arr = ([]).slice.call(arguments, 0);
        var extras = arr.splice(-2);
        arr.index = extras[0];
        arr.input = extras[1];
        matches.push(arr);
      });
      return matches.length ? matches : null;
    // };
  // }
}

function isValidISBN (str) {
  const regex = /^(?=(?:[^0-9]*[0-9]){10}(?:(?:[^0-9]*[0-9]){3})?$)[\d-]+$/;
  const pattern = new RegExp(regex);
  return pattern.test(str);
}

function findPreviousDateTime(times, checkTime) {
  let previousDateTime = null;
  times.forEach(time => {
    if (checkTime > time) {
      previousDateTime = time;
    }
  })
  return previousDateTime;
}

export {
  uniqueArray,
  getDateTimeISO,
  getDateTimeISOFromMDY,
  convertToISO8601Duration,
  removeChildren,
  escapeRegExp,
  sleep,
  fragmentFromString,
  generateUUID,
  generateAttributeId,
  generateId,
  getHash,
  hashCode,
  sortToLower,
  matchAllIndex,
  isValidISBN,
  findPreviousDateTime
};
