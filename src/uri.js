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
  var pIRI = stripFragmentFromString(url);

  if ((typeof document !== 'undefined' && document.location.protocol === 'https:' && pIRI.slice(0, 5).toLowerCase() === 'http:') || 'forceProxy' in options) {
    var proxyURL = getProxyURL(options);
    pIRI = (proxyURL) ? proxyURL + encodeString(pIRI) : pIRI;
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
  var match = motivatedBy.match(/(.*[#/])(.+)$/);

  if (match) {
    var ns = match[1];
    var localPart = match[2];

    var prefix = Object.keys(Prefixes).find(function(key) {
      return Config.Prefixes[key] === ns;
    });

    if (prefix) {
      return prefix + ":" + localPart;
    }
  }
}

export {
  encodeString,
  decodeString,
  getAbsoluteIRI,
  getProxyableIRI,
  getProxyURL,
  stripFragmentFromString,
  getFragmentFromString,
  getBaseURL,
  getPathURL,
  getURLLastPath,
  getParentURLPath,
  forceTrailingSlash,
  getFragmentOrLastPath,
  getLastPathSegment,
  generateDataURI,
  getPrefixedNameFromIRI
};
