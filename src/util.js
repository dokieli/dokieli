import DOMPurify from 'dompurify';
import { rdfaAttributes } from 'src/editor/schema/base';

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

function debounce(func, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      func(...args);
    }, delay);
  };
}

function removeChildren(node) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeRDFLiteral(str) {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fragmentFromString(strHTML) {
  return document.createRange().createContextualFragment(domSanitize(strHTML));
}

function generateUUID(inputString) {
  // Simple FNV-1a hash function to generate a deterministic 32-bit integer hash for each part
  function fnv1aHash(str, seed = 2166136261) {
    let hash = seed;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return hash >>> 0; // Ensure unsigned 32-bit integer
  }

  if (inputString) {
    // Generate deterministic UUID using FNV-1a hash
    const d0 = fnv1aHash(inputString, 2166136261);
    const d1 = fnv1aHash(inputString, 2166136261 ^ 0xdeadbeef);
    const d2 = fnv1aHash(inputString, 2166136261 ^ 0xcafebabe);
    const d3 = fnv1aHash(inputString, 2166136261 ^ 0x8badf00d);

    const hex = (
      d0.toString(16).padStart(8, '0') +
      d1.toString(16).padStart(8, '0') +
      d2.toString(16).padStart(8, '0') +
      d3.toString(16).padStart(8, '0')
    );

    // Ensure UUID version (4) and variant (8, 9, a, or b)
    let uuid = hex.substring(0, 8) + '-' +
               hex.substring(8, 12) + '-' +
               '4' + hex.substring(13, 16) + '-' + // Set version to 4
               ((parseInt(hex[16], 16) & 0x3f) | 0x80).toString(16) + // Set variant to 10xxxxxx
               hex.substring(17, 20) + '-' +
               hex.substring(20, 32);

    // Optionally, ensure the UUID starts with 'a' if needed
    uuid = 'a' + uuid.slice(1);

    return uuid;
  }
  else {
    const uuid = crypto.randomUUID();
    const array = new Uint8Array(1);
    crypto.getRandomValues(array);
    const randomLetter = String.fromCharCode(97 + (array[0] % 6)); // Start with a-f
    return randomLetter + uuid.slice(1);
  }
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

function getFormValues(form) {
  const formData = new FormData(form);

  const formValues = Object.fromEntries(
    [...formData.entries()].map(([key, value]) => [key, typeof value === "string" ? domSanitize(value.trim()) : value])
  );

// console.log(formValues);
  return formValues;
}

function getHash(message, algo = "SHA-256") {
  var buffer = new TextEncoder("utf-8").encode(message);
  return crypto.subtle.digest(algo, buffer).then(function (hash) {
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

function getRandomIndex(length) {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return array[0] % length;
}

function domSanitize(strHTML, options = {}) {
  // ALLOW_UNKNOWN_PROTOCOLS is needed for namespaced attribute values that DOMPurify mistakenly interpret as an unknown protocol protocol; it will allow mailto: but strip out others it does not recognize
  const cleanHTML = DOMPurify.sanitize(strHTML, {
    ALLOW_UNKNOWN_PROTOCOLS: options.ALLOW_UNKNOWN_PROTOCOLS === false ? false : true,
    ADD_ATTR: [...rdfaAttributes, 'xml:lang', 'target'],
    ...options
  });

  return cleanHTML;
}

function sanitizeObject(input) {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return {};
  }

  const safe = {};

  for (const key in input) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) continue;
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;

    const value = input[key];

    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null
    ) {
      safe[key] = value;
    }
    else if (typeof value === 'object') {
      safe[key] = sanitizeObject(value);
    }
  }

  return safe;
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

function kebabToCamel(str) {
  return str.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

function isReDoSVulnerable(regex) {
  const regexStr = regex.toString();

  const vulnerablePatterns = [
    /(\*|\+|\{.*\})\s?\1/,  
    /([a-zA-Z0-9])\1{2,}/,  
    /.*a.*b.*c.*d.*e.*/  
  ];

  for (let pattern of vulnerablePatterns) {
    if (pattern.test(regexStr)) {
      return true;
    }
  }

  return false; 
}



function matchAllIndex(string, regexp) {
  // const matches = Array.from(string.matchAll(regexp));
  // return matches.map(match => ({ match: match[0], index: match.index }));

  const matches = [];

  if (!regexp.global) {
    const globalRegexp = new RegExp(regexp.source, `${regexp.flags}g`);
    regexp = globalRegexp;
  }

  if (isReDoSVulnerable(regexp)) {
    throw new Error('Regular expression is potentially vulnerable to ReDoS attack');
  }
  
  for (const match of string.matchAll(regexp)) {
    const arr = [...match]; // Convert the match to an array
    arr.index = match.index; // Add the index of the match
    arr.input = match.input; // Add the original input string
    matches.push(arr);
  }
  
  return matches.length ? matches : null;
}

function isValidISBN (str) {
  const regex = /^(?=(?:[^0-9]*[0-9]){10}(?:(?:[^0-9]*[0-9]){3})?$)[\d-]+$/;
  const pattern = new RegExp(regex);
  return pattern.test(str);
}

function findPreviousDateTime(times, checkTime) {
  const sortedTimes = uniqueArray(times).sort().reverse();

  let previousDateTime = null;
  for(let time of sortedTimes) {
    if (time <= checkTime) {
      previousDateTime = time;
      break;
    }
  }

  return previousDateTime;
}

//TODO: Check browser support for Temporal.Duration, in particular `PT`, e.g., PT17S
function parseISODuration(duration) {
  if (!/^P(?:\d+[YMD])*(?:T(?:\d+[HMS])*)?$/.test(duration)) {
    throw new Error('Invalid ISO 8601 duration format');
  }
  const regex = /P(?:([\d.]+)Y)?(?:([\d.]+)M)?(?:([\d.]+)D)?(?:T(?:([\d.]+)H)?(?:([\d.]+)M)?(?:([\d.]+)S)?)?/;
  const matches = duration.match(regex);

  const [, years, months, days, hours, minutes, seconds] = matches.map(x => x ? parseFloat(x) : 0);

  const parts = [];
  if (years) parts.push(`${years}y`);
  if (months) parts.push(`${months}m`);
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (seconds) parts.push(`${seconds}s`);

  return parts.length ? parts.join(', ') : '0s';
}

function getIconsFromCurrentDocument() {
  var usedIcons = Array.from(document.querySelectorAll('i[class*="fa-"]'))
    .flatMap(el => Array.from(el.classList))
    .filter(cls => cls.startsWith('fa-'));

  var uniqueClasses = [...new Set(usedIcons)];

  var filteredEntries = Object.entries(Icon).filter(([cls]) =>
    uniqueClasses.some(usedCls => cls.includes(usedCls))
  );

  var sortedEntries = filteredEntries.sort(([a], [b]) => a.localeCompare(b));

  var newIcons = Object.fromEntries(sortedEntries);

  return newIcons;
}

export {
  debounce,
  uniqueArray,
  getDateTimeISO,
  getDateTimeISOFromMDY,
  convertToISO8601Duration,
  removeChildren,
  escapeRegExp,
  escapeRDFLiteral,
  sleep,
  fragmentFromString,
  generateUUID,
  generateAttributeId,
  generateId,
  getHash,
  getRandomIndex,
  hashCode,
  sortToLower,
  matchAllIndex,
  isValidISBN,
  findPreviousDateTime,
  getFormValues,
  kebabToCamel,
  parseISODuration,
  domSanitize,
  sanitizeObject
};
