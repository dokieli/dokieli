'use strict';

import Config from './config.js';

function encodeString(string) {
  return encodeURIComponent(string).replace(/'/g, '%27').replace(/"/g, '%22');
}

/**
 * UNUSED
 *
 * @param string {string}
 *
 * @returns {string}
 */
function decodeString(string) {
  return decodeURIComponent(string.replace(/\+/g, ' '));
}

function getAbsoluteIRI(base, location) {
  var iri = location;

  if (!location.toLowerCase().startsWith('http:') && !location.toLowerCase().startsWith('https:')) {
    var x = base.toLowerCase().trim().split('/');
    if (location.startsWith('/')) {
      iri = x[0] + '//' + x[2] + location;
    } else if (!base.endsWith('/')) {
      if (x[2].contains('/')) {
        iri = base.substr(0, base.lastIndexOf('/') + 1) + location;
      } else {
        iri = base + '/' + location;
      }
    } else {
      iri = base + location;
    }
  }

  return iri;
}

function getProxyableIRI(url, options = {}) {
  let pIRI = stripFragmentFromString(url);

  try {
    const origin = window.location.origin;
    const base = origin !== 'null' ? origin : 'file://';

    pIRI = new URL(pIRI, base).href;

    if (
      ('forceProxy' in options) ||
      (typeof document !== 'undefined' && document.location.protocol === 'https:' && pIRI.startsWith('http:'))
    ) {
      const proxyURL = getProxyURL(options);
      pIRI = proxyURL ? proxyURL + encodeURIComponent(pIRI) : pIRI;
    }
  } catch (error) {
    throw new Error('Invalid URL provided: ' + error);
  }

  return pIRI;
}

function getProxyURL(options) {
  return (typeof options !== 'undefined' && 'proxyURL' in options)
    ? options.proxyURL
    : (Config.User.ProxyURL)
      ? Config.User.ProxyURL
      : undefined;
}

function stripFragmentFromString(string) {
  if (typeof string === 'string') {
    let stringIndexFragment = string.indexOf('#');

    if (stringIndexFragment >= 0) {
      string = string.substring(0, stringIndexFragment);
    }
  }
  return string;
}

function getFragmentFromString(string) {
  if (typeof string === 'string') {
    let match = string.split('#')[1];

    string = (match) ? match : '';
  }
  return string;
}

function getUrlParams(name) {
  const rawParams = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.search.slice(1);

  const searchParams = new URLSearchParams(rawParams);
  return searchParams.getAll(name);
}

function stripUrlParamsFromString(urlString, paramsToStrip = null, stripHash = false) {
  const origin = window.location.origin;
  const base = origin && origin !== 'null' ? origin : undefined;
  const url = new URL(urlString, base);

  if (Array.isArray(paramsToStrip) && paramsToStrip.length > 0) {
    paramsToStrip.forEach(param => url.searchParams.delete(param));
  } else {
    url.search = '';
    if (stripHash) {
      url.hash = '';
    }
  }

  return url.toString();
}

// Side-effect function: updates the browser’s current URL in history
function stripUrlSearchHash(paramsToStrip = null) {
  const newUrl = stripUrlParamsFromString(window.location.href, paramsToStrip, true);
  window.history.replaceState({}, '', newUrl);
}

function getBaseURL(url) {
  if (typeof url === 'string') {
    url = url.substr(0, url.lastIndexOf('/') + 1);
  }

  return url;
}

function getPathURL(url) {
  if (typeof url === 'string') {
    const u = new URL(url);
    return u.origin + u.pathname;
  }

  return url;
}

function getURLLastPath(url) {
  if (typeof url === 'string') {
    url = getPathURL(url);
    url = url.substr(url.lastIndexOf('/') + 1);
  }

  return url;
}

function getParentURLPath(url) {
  if (typeof url === 'string') {
    var u = new URL(url);
    var pathname = u.pathname;

    if (pathname == '/') {
      return undefined;
    } else {
      var p = pathname.split('/');
      p.splice(-2);
      var parentPath = forceTrailingSlash(p.join('/'));
      url = u.origin + parentPath;
    }
  }

  return url;
}

function forceTrailingSlash(string) {
  if (string.slice(-1) == '/') return string;
  return string + '/';
}

function getFragmentOrLastPath(string) {
  var s = getFragmentFromString(string);
  if (s.length == 0) {
    s = getURLLastPath(string);
  }
  return s;
}

function getLastPathSegment(url) {
  var parsedUrl = new URL(url);
  var pathname = parsedUrl.pathname;
  var segments = pathname.split('/');
  segments = segments.filter(function (segment) {
    return segment !== '';
  });
  return segments.pop() || parsedUrl.hostname;
}

function generateDataURI(mediaType, encoding, data) {
  var mediaTypeEncoding = 'text/plain;charset=US-ASCII';
  var encodedData = encodeURIComponent(data);

  if (mediaType) {
    mediaTypeEncoding = mediaType;

    if (encoding === 'base64') {
      mediaTypeEncoding = mediaType + ';base64';
      encodedData = btoa(data);
    }
  }

  return `data:${mediaTypeEncoding},${encodedData}`;
}


function getPrefixedNameFromIRI(iri) {
  const hashIndex = iri.lastIndexOf('#');
  const slashIndex = iri.lastIndexOf('/');
  const sepIndex = Math.max(hashIndex, slashIndex);

  if (sepIndex === -1) {
    return iri;
  }

  const ns = iri.slice(0, sepIndex + 1);
  const localPart = iri.slice(sepIndex + 1);

  const prefix = Object.keys(Config.Prefixes).find(key => {
    return Config.Prefixes[key] === ns;
  });

  if (prefix) {
    return `${prefix}:${localPart}`;
  }

  return iri;
} 

function getIRIFromPrefix(qname) {
  const qnameParts = qname.slice(':');

  if (qnameParts.length == 2) {
    let prefix = qnameParts[0];
    let localName = qnameParts[1];

    if (prefix.length && localName.length && ns[prefix].value) {
       return ns[prefix].value + localName;
    }
  }

  return qname;
}


function getMediaTypeURIs(mediaTypes) {
  mediaTypes = Array.isArray(mediaTypes) ? mediaTypes : [mediaTypes];

  return mediaTypes.map(mediaType => { return `http://www.w3.org/ns/iana/media-types/${mediaType}#Resource` });
}

function isHttpOrHttpsProtocol(urlString) {
  try {
    const url = new URL(urlString);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isHttpsProtocol(urlString) {
  try {
    const url = new URL(urlString);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isFileProtocol(urlString) {
  try {
    const url = new URL(urlString);
    return url.protocol === 'file:';
  } catch {
    return false;
  }
}

function isLocalhost(urlString) {
  try {
    const url = new URL(urlString);
    const h = url.hostname;

    return (
      h === 'localhost' ||
      h.endsWith('.localhost') ||
      h === '::1' ||
      h.startsWith('127.')
    );
  } catch {
    return false;
  }
}

function svgToDataURI(svg, options = {}) {
  svg = svg
    .replace(/ class="[^"]*"/g, '')
    .replace(/ fill="[^"]*"/g, '')
    .replace(/>\s+</g, '><')
    .trim();

  // svg = svg.replace('<path ', '<path fill="currentColor" ');

  svg = svg
    .replace(/</g, '%3c')
    .replace(/>/g, '%3e')
    // .replace(/'/g, '%27')
    .replace(/"/g, "'")
    // .replace(/#/g, '%23')
    .replace(/\n/g, '')
    .replace(/\r/g, '');

  return `data:image/svg+xml,${svg}`;
}

export {
  encodeString,
  decodeString,
  getAbsoluteIRI,
  getProxyableIRI,
  getProxyURL,
  stripFragmentFromString,
  getFragmentFromString,
  getUrlParams,
  stripUrlParamsFromString,
  stripUrlSearchHash,
  getBaseURL,
  getPathURL,
  getURLLastPath,
  getParentURLPath,
  forceTrailingSlash,
  getFragmentOrLastPath,
  getLastPathSegment,
  generateDataURI,
  getPrefixedNameFromIRI,
  getIRIFromPrefix,
  getMediaTypeURIs,
  isHttpOrHttpsProtocol,
  isHttpsProtocol,
  isFileProtocol,
  isLocalhost,
  svgToDataURI
};
