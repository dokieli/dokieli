'use strict'

import Config from './config.js'
import { generateUUID } from './util.js'
import { getProxyableIRI } from './uri.js'
import * as solidAuth from 'solid-auth-client'

const DEFAULT_CONTENT_TYPE = 'text/html; charset=utf-8'
const LDP_RESOURCE = '<http://www.w3.org/ns/ldp#Resource>; rel="type"'

const __fetch = solidAuth.fetch;

function setAcceptRDFTypes(options = {}) {
  const excludeMarkup = options.excludeMarkup || false;
  
  return Config.MediaTypes.RDF.filter(i => !excludeMarkup || Config.MediaTypes.Markup.indexOf(i) === -1)
    .map(i => {
      return Config.MediaTypes.Markup.indexOf(i) > -1 ? `${i};q=0.9` : i;
    })
    .join(',');
}

// I want HTTP COPY and I want it now!
function copyResource (fromURL, toURL, options = {}) {
  let headers = { 'Accept': '*/*' }
  let contentType

  if (!fromURL || !toURL) {
    return Promise.reject(new Error('Missing fromURL or toURL in copyResource'))
  }

  return getResource(fromURL, headers, options)
    .then(response => {
      contentType = response.headers.get('Content-Type')

      return (Config.MediaTypes.Binary.indexOf(contentType))
        ? response.arrayBuffer()
        : response.text()
    })
    .then(contents => {
      //XXX: Should this sanitize (DOMPurify.sanitize(contents)) or copy resource as is?
      return putResource(toURL, contents, contentType, null, options)
        .catch(error => {
          if (error.status === 0) {
            // Retry with no credentials
            options.noCredentials = true
            return putResource(toURL, contents, contentType, null, options)
          }

          throw error  // re-throw error
        })
    })
}

/**
 * currentLocation
 * 
 * Returns the current URL after removing specified or default query paramaters and values
 *
 * @param {object} options
 * @returns {string}
 */
function currentLocation (options = {}) {
  const url = new URL(window.location);

  options.removeParams = options.removeParams || { author: 'true', social: 'true' };

  Object.entries(options.removeParams).forEach(([param, value]) => {
    if (url.searchParams.get(param) === value) {
      url.searchParams.delete(param);
    }
  });

  return url.origin + url.pathname + (url.search ? '?' + url.searchParams.toString() : '');
}

/**
 * deleteResource
 *
 * @param url {string}
 * @param options {object}
 *
 * @returns {Promise<Response>}
 */
function deleteResource (url, options = {}) {
  var _fetch = Config.User.OIDC? __fetch : fetch;

  if (!url) {
    return Promise.reject(new Error('Cannot DELETE resource - missing url'))
  }

  if (!options.noCredentials) {
    options.credentials = 'include'
  }

  options.method = 'DELETE'

  return _fetch(url, options)

    .then(response => {
      if (!response.ok) {  // not a 2xx level response
        let error = new Error('Error deleting resource: ' +
          response.status + ' ' + response.statusText)
        error.status = response.status
        error.response = response

        throw error
      }

      return response
    })
}

function getAcceptPostPreference (url) {
  const pIRI = getProxyableIRI(url)
// console.trace()
  return getResourceOptions(pIRI, {'header': 'Accept-Post'})
    .catch(error => {
//      console.log(error)
      return {'headers': 'application/ld+json'}
    })
    .then(result => {
      let header = result.headers.trim().split(/\s*,\s*/);

      if (header.includes('text/html') || header.includes('application/xhtml+xml')) {
        return 'text/html';
      }
      else if (header.includes('application/ld+json') || header.includes('application/json') || header.includes('application/activity+json') || header.includes('*/*')) {
        return 'application/ld+json';
      }
      else if (header.includes('text/turtle')) {
        return 'text/turtle';
      }
      else if (header.includes('application/n-triples')) {
        return 'application/n-triples';
      }
      else if (header.includes('application/n-quads')) {
        return 'application/n-quads';
      }
      else if (header.includes('text/n3')) {
        return 'text/n3';
      }
      else {
        console.log('Accept-Post contains unrecognised media-range; ' + result.headers);
        return result.headers;
      }
    })
}

function getAcceptPatchPreference (url) {
  const pIRI = url || getProxyableIRI(url)

  return getResourceOptions(pIRI, {'header': 'Accept-Patch'})
    .catch(error => {
//      console.log(error)
      return {'headers': 'text/n3'}
    })
    .then(result => {
      let header = result.headers.trim().split(/\s*,\s*/)

      if (header.indexOf('text/html') > -1 || header.indexOf('application/xhtml+xml') > -1) {
        return 'text/html'
      } else if (header.indexOf('text/n3') > -1 || header.indexOf('*/*') > -1) {
        return 'text/n3'
      } else if (header.indexOf('application/sparql-update') > -1) {
        return 'application/sparql-update'
      } else {
        console.log('Accept-Patch contains unrecognised media-range; ' + result.headers)
        return result.headers
      }
    })
}

function getAcceptPutPreference (url) {
  const pIRI = url || getProxyableIRI(url)

  return getResourceOptions(pIRI, {'header': 'Accept-Put'})
    .catch(error => {
//      console.log(error)
      return {'headers': 'text/html'}
    })
    .then(result => {
      let header = result.headers.trim().split(/\s*,\s*/)

      if (header.indexOf('text/html') > -1 || header.indexOf('application/xhtml+xml') > -1) {
        return 'text/html'
      } else if (header.indexOf('text/turtle') > -1 || header.indexOf('*/*') > -1) {
        return 'text/turtle'
      } else if (header.indexOf('application/ld+json') > -1 || header.indexOf('application/json') > -1) {
        return 'application/ld+json'
      } else {
        console.log('Accept-Patch contains unrecognised media-range; ' + result.headers)
        return result.headers
      }
    })
}


/**
 * getResource
 *
 * @param url {string}
 *
 * @param headers {object}
 * @param [headers.accept='text/turtle'] {string}
 *
 * @param options {object}
 *
 * @returns {Promise<string>|Promise<ArrayBuffer>}
 */
function getResource (url, headers = {}, options = {}) {
  var _fetch = Config.User.OIDC? __fetch : fetch;
  fetch = session.isActive ? session.fetch : fetch

  url = url || currentLocation()
// console.log(url)
  if (url.startsWith('file:')){
    return;
  }

  options.method = ('method' in options && options.method == 'HEAD') ? 'HEAD' : 'GET'

  if (!headers['Accept'] && options.method !== 'HEAD') {
    headers['Accept'] = 'text/turtle'
  }

  if (options.noCache) {
    options.cache = 'no-cache'
    headers['Cache-Control'] = 'no-cache'
  }

  if (options.noStore) {
    options.cache = 'no-store'
    headers['Cache-Control'] = 'no-store'
  }

  //XXX: Do we need this?
  if (!options.noCredentials) {
    options.credentials = 'include'
  }

  options.headers = Object.assign({}, headers)

  return _fetch(url, options)
    .catch(error => {
      //XXX: When CORS preflight request returns 405, error is an object but neither an instance of Error nor Response.

// console.log(options)
// console.log(error)
// console.error(error)

      if (error?.status == 405) {
// console.log('status: 405', error)
        throw error
      }
      else if (error?.status == 401) {
        if (options.hasRetriedWithCredentials) {
          throw new Error('401 retries failed', { cause: error });
        }
        options.hasRetriedWithCredentials = true
        options.noCredentials = false
        options.credentials = 'include'
// console.log('status: 401')
        return getResource(url, headers, options)
      }
      else if (!options.noCredentials && options.credentials !== 'omit') {
// console.log('Possible CORS error, retry with no credentials')
        options.noCredentials = true
        options.credentials = 'omit'
        return getResource(url, headers, options)
      }
      // else if (!error?.status) {
      else {
        if (options.proxyForced) { 
          throw new Error('Cannot fetch proxied URL: ' + url);
        }
        var pIRI = getProxyableIRI(url, {'forceProxy': true});

        if (pIRI !== url) {
          options['proxyForced'] = true;
          options.noCredentials = true;
          options.credentials = 'omit';
          return getResource(pIRI, headers, options);
        }
        else {
          throw new Error('Error fetching resource', { cause: error });
        }
      }

      // throw error
    })
    .then(response => {
      if (!response.ok) {  // not a 2xx level response
        let error = new Error('Error fetching resource: ' +
          response.status + ' ' + response.statusText)
        error.status = response.status
        error.response = response

        throw error
      }

      return response
    })
}

/**
 * getResourceHead
 *
 * @param url {string}
 * @param headers {object}
 * @param options {object}
 *
 * @returns {Promise<Response>}
 */
function getResourceHead (url, headers = {}, options = {}) {
  options['method'] = 'HEAD'

  return getResource (url, headers, options)
}

/**
 * getResourceOptions
 *
 * @param [url] {string} Defaults to current url
 *
 * @param [options={}] {object}
 * @param [options.header] {string} Specific response header to return
 * @param [options.noCredentials] {boolean}
 *
 * @returns {Promise} Resolves with `{ headers: ... }` object
 */
function getResourceOptions (url, options = {}) {
  var _fetch = Config.User.OIDC? __fetch : fetch;
  url = url || currentLocation()

  options.method = 'OPTIONS'

  if (!options.noCredentials) {
    options.credentials = 'include'
  }

  return _fetch(url, options)

    .then(response => {
      if (!response.ok) {  // not a 2xx level response
        let error = new Error('Error fetching resource OPTIONS: ' +
          response.status + ' ' + response.statusText)
        error.status = response.status
        error.response = response

        throw error
      }
      else if (options.header && !response.headers.get(options.header)){
        let error = new Error('OPTIONS without ' + options.header + ' header: ' +
          response.status + ' ' + response.statusText)
        error.status = response.status
        error.response = response

        throw error
      }

      if (options.header) {  // specific header requested
        return { headers: response.headers.get(options.header) }
      }

      return { headers: response.headers }  // Not currently used anywhere
    })
}

//TODO: Move these and doc.js:getRDFaPrefixHTML (rename) elsewhere.
function getN3PrefixesString(prefixes){
  return Object.keys(prefixes).map(i => { return '@prefix ' + i + ': ' + '<' + prefixes[i] + '> .' }).join('\n');
}
function getSPARQLPrefixesString(prefixes){
  return Object.keys(prefixes).map(i => { return 'PREFIX ' + i + ': ' + '<' + prefixes[i] + '>' }).join('\n');
}
//https://www.w3.org/TR/sparql11-query/#rVar
function containsSPARQLVariable(str) {
  const pnCharsBase = "A-Za-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD";
  const pnCharsU = `${pnCharsBase}_`;
  const varName = `(?:[${pnCharsU}]|[0-9])(?:[${pnCharsU}]|[0-9]|\\u00B7|[\\u0300-\\u036F]|[\\u203F-\\u2040])*`;

  const var1Pattern = `\\?[${pnCharsU}](${varName})`;
  const var2Pattern = `\\$[${pnCharsU}](${varName})`;

  const varRegex = new RegExp(`(${var1Pattern}|${var2Pattern})`, 'u');

  return varRegex.test(str);
}

function patchResourceGraph (url, patches, options = {}) {
  options.headers = options.headers || {}
  options.headers['Content-Type'] = options.headers['Content-Type'] || 'text/n3';

  patches = (Array.isArray(patches)) ? patches : [patches];
  options['prefixes'] = options.prefixes || {};
  options['prefixes']['solid'] = 'http://www.w3.org/ns/solid/terms#';
  options['prefixes']['acl'] = 'http://www.w3.org/ns/auth/acl#';
  var prefixes;

  switch(options.headers['Content-Type']) {
    case 'application/sparql-update':
      prefixes = getSPARQLPrefixesString(options.prefixes);
      break;
    case 'text/n3':
    default:
      prefixes = getN3PrefixesString(options.prefixes);
      break;
  }

  var data = prefixes + `\n`;
  var operation;

  switch (options.headers['Content-Type']) {
    case 'application/sparql-update':
      if (patches[0].delete) {
        operation = containsSPARQLVariable(patches[0].delete) ? 'DELETE' : 'DELETE DATA';
        data += `${operation} {\n${patches[0].delete}\n}\n`;
      }

      if (patches[0].insert) {
        operation = containsSPARQLVariable(patches[0].insert) ? 'INSERT' : 'INSERT DATA';
        data += `${operation} {\n${patches[0].insert}\n}\n`;
      }

      if (patches[0].where) {
        data += `WHERE {\n${patches[0].where}\n}\n`;
      }
      break

    case 'text/n3':
    default :
      var patchId = '_:' + generateUUID();
      data += `${patchId} a solid:InsertDeletePatch .\n`;
      var deletes = '';
      patches.forEach(patch => {
        if (patch.delete) {
          if (!deletes.length) {
            deletes += `${patchId} solid:deletes {`
          }
          deletes += `${patch.delete}\n`;
        }
        if (patch.insert) {
          data += `${patchId} solid:inserts {\n${patch.insert}\n} .\n`;
        }
        if (patch.where) {
          data += `${patchId} solid:where {\n${patch.where}\n} .\n`;
        }
      });

      if (deletes.length) {
        data += deletes + '} .';
      }

      break
  }

 
  return patchResource (url, data, options);
}

function patchResource (url, data, options = {}) {
  var _fetch = Config.User.OIDC? __fetch : fetch;

  options.headers = options.headers || {}

  options.headers['Content-Type'] = options.headers['Content-Type'] || 'text/n3'

  options.body = data

  options.method = 'PATCH'

  if (!options.noCredentials) {
    options.credentials = 'include'
  }

  return _fetch(url, options)

    .then(response => {
      if (!response.ok) {  // not a 2xx level response
        let error = new Error('Error patching resource: ' +
          response.status + ' ' + response.statusText)
        error.status = response.status
        error.response = response

        throw error
      }

      return response
    })
}

function postResource (url, slug, data, contentType, links, options = {}) {
  var _fetch = Config.User.OIDC? __fetch : fetch;
  if (!url) {
    return Promise.reject(new Error('Cannot POST resource - missing url'))
  }

  options.method = 'POST'

  options.body = data

  if (!options.noCredentials) {
    options.credentials = 'include'
  }

  options.headers = options.headers || {}

  options.headers['Content-Type'] = contentType || DEFAULT_CONTENT_TYPE

  links = links
    ? LDP_RESOURCE + ', ' + links
    : LDP_RESOURCE

  options.headers['Link'] = links

  if (slug) {
    options.headers['Slug'] = slug
  }

  return _fetch(url, options)

    .catch(error => {
      if (error.status === 0 && !options.noCredentials) {
        // Possible CORS error, retry with no credentials
        options.noCredentials = true
        return postResource(url, slug, data, contentType, options)
      }

      throw error
    })

    .then(response => {
      if (!response.ok) {  // not a 2xx level response
        let error = new Error('Error creating resource: ' +
          response.status + ' ' + response.statusText)
        error.status = response.status
        error.response = response

        throw error
      }

      return response
    })
}

/**
 * putResource
 *
 * @param url {string}
 *
 * @param data {string|object}
 *
 * @param [contentType=DEFAULT_CONTENT_TYPE] {string}
 *
 * @param [links=LDP_RESOURCE] {string}
 *
 * @param [options={}] {object}
 *
 * @returns {Promise<Response>}
 */
function putResource (url, data, contentType, links, options = {}) {
  var _fetch = Config.User.OIDC? __fetch : fetch;
  if (!url) {
    return Promise.reject(new Error('Cannot PUT resource - missing url'))
  }

  options.method = 'PUT'

  options.body = data

  if (!options.noCredentials) {
    options.credentials = 'include'
  }

  options.headers = options.headers || {}

  options.headers['Content-Type'] = contentType || DEFAULT_CONTENT_TYPE

  links = links
    ? LDP_RESOURCE + ', ' + links
    : LDP_RESOURCE

  options.headers['Link'] = links

  return _fetch(url, options)

    .then(response => {
      if (!response.ok) {  // not a 2xx level response
        let error = new Error('Error writing resource: ' +
          response.status + ' ' + response.statusText)
        error.status = response.status
        error.response = response

        throw error
      }

      return response
    })
}

/**
 * putResourceACL
 *
 * TODO: This doesn't seem to be used anywhere...
 *
 * @param accessToURL
 * @param aclURL
 * @param acl
 *
 * @returns {Promise<Response|null>}
 */
function putResourceACL (accessToURL, aclURL, acl) {
  if (!Config.User.IRI) {
    console.log('Go through sign-in or do: DO.C.User.IRI = "https://example.org/#i";')
    return Promise.resolve(null)
  }

  acl = acl || {
    'u': { 'iri': [Config.User.IRI], 'mode': ['acl:Control', 'acl:Read', 'acl:Write'] },
    'g': { 'iri': ['http://xmlns.com/foaf/0.1/Agent'], 'mode': ['acl:Read'] },
    'o': { 'iri': [], 'mode': [] }
  }

  let agent, agentClass, mode

  if ('u' in acl && 'iri' in acl.u && 'mode' in acl.u) {
    agent = '<' + acl.u.iri.join('> , <') + '>'
    mode = acl.u.mode.join(' , ')
  } else {
    agent = '<' + Config.User.IRI + '>'
    mode = 'acl:Control , acl:Read , acl:Write'
  }

  let authorizations = []

  authorizations.push(
    '[ a acl:Authorization ; acl:accessTo <' +
    accessToURL + '> ; acl:accessTo <' + aclURL + '> ; acl:mode ' + mode +
    ' ; acl:agent ' + agent + ' ] .'
  )

  if ('g' in acl && 'iri' in acl.g && acl.g.iri.length >= 0) {
    agentClass = '<' + acl.g.iri.join('> , <') + '>'
    mode = acl.g.mode.join(' , ')
    authorizations.push(
      '[ a acl:Authorization ; acl:accessTo <' + accessToURL +
      '> ; acl:mode ' + mode + ' ; acl:agentClass ' + agentClass + ' ] .'
    )
  }

  let data = '@prefix acl: <http://www.w3.org/ns/auth/acl#> .\n' +
    authorizations.join('\n') + '\n'

  return putResource(aclURL, data, 'text/turtle; charset=utf-8')
}

function processSave(url, slug, data, options) {
  options = options || {};
  var request = (slug)
                ? postResource(url, slug, data)
                : putResource(url, data)

  return request
    .then(response => {
      var location = response.headers.get('Location') || url;

      var message = {
        'content': 'Saved document to <code>' + location + '</code>',
        'type': 'success'
      }
      return Promise.resolve({'response': response, 'message': message})
    })
    .catch(error => {
      console.log(error)

      let message

      switch (error.status) {
        case 401:
          message = 'Need to authenticate before saving'
          break

        case 403:
          message = 'You are not authorized to save'
          break

        case 405:
        default:
          message = 'Server doesn\'t allow this resource to be rewritten'
          break
      }

      message = {
        'content': message,
        'type': 'error'
      }

      return Promise.reject({'error': error, 'message': message})
    })
}

//TODO: Use OPTIONS (getResourceOptions). Check/use Allow: PATCH and Accept-Patch. Check/use Allow: PUT using Accept-Put. Fallback to PUT.

function patchResourceWithAcceptPatch(url, patch, options) {
  return getAcceptPatchPreference(url)
    .then(preferredContentType => {
      options = options || {}
      options['headers'] = options['headers'] || {}
      options.headers['Content-Type'] = options.headers['Content-Type'] || preferredContentType

      return patchResourceGraph(url, patch, options)
    })
}

function putResourceWithAcceptPut(url, html, options) {
  return getAcceptPutPreference(url)
    .then(preferredContentType => {
      options = options || {}
      options['headers'] = options['headers'] || {}
      options.headers['Content-Type'] = options.headers['Content-Type'] || preferredContentType

      return putResource(url, html, null, null, options)
    })
}

export {
  setAcceptRDFTypes,
  copyResource,
  currentLocation,
  deleteResource,
  getAcceptPostPreference,
  getAcceptPatchPreference,
  getAcceptPutPreference,
  getResource,
  getResourceHead,
  getResourceOptions,
  patchResource,
  patchResourceGraph,
  postResource,
  putResource,
  putResourceACL,
  processSave,
  patchResourceWithAcceptPatch,
  putResourceWithAcceptPut,
  getN3PrefixesString,
  getSPARQLPrefixesString,
  containsSPARQLVariable
}
