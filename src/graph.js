'use strict'

import rdf from "rdf-ext";
import { RdfaParser } from "rdfa-streaming-parser";
import { Readable } from "readable-stream";
import Config from './config.js'
import { stripFragmentFromString, getProxyableIRI, getBaseURL, getPathURL, getAbsoluteIRI, getParentURLPath } from './uri.js'
import { uniqueArray } from './util.js'
import { parseMarkdown } from "./doc.js";
import { setAcceptRDFTypes, getResource, getResourceHead, currentLocation } from './fetcher.js'
import LinkHeader from "http-link-header";
import DOMPurify from 'dompurify';

const ns = Config.ns;

//https://github.com/rdfjs-base/io
// https://github.com/rdfjs-base/formats/

function getGraphFromData (data, options = {}) {

  options['contentType'] = options.contentType || 'text/turtle';
  if (!('subjectURI' in options)) {
    options['subjectURI'] = 'http://localhost/d79351f4-cdb8-4228-b24f-3e9ac74a840d'
  }
// console.log(options)
  var baseIRI = options.subjectURI
  //  || Config.DocumentURL;

// console.log(data)
// console.log(baseIRI)

  baseIRI = stripFragmentFromString(baseIRI);
// console.log(baseIRI)

  // FIXME: These are fugly but a temporary fix to get around the baseURI not being passed to the DOM parser. This injects the `base` element into the document so that the parsers fallsback to that. The actual fix should happen upstream. See related issues:
  // https://github.com/dokieli/dokieli/issues/132
  // https://github.com/rdf-ext/rdf-parser-dom/issues/2
  // https://github.com/rdf-ext/rdf-parser-rdfa/issues/3
  // https://github.com/simplerdf/simplerdf/issues/19

  // // TODO: Revisit this as setting base will be now be taken care of by rdf-ext in getRDFParser, so this may not be needed
  // const baseNeededMediaTypes = ['text/html', 'application/xhtml+xml', 'text/turtle', 'application/ld+json', 'application/activity+json'];
  // if (baseNeededMediaTypes.includes(options.contentType)){
  //   data = setDocumentBase(data, options.subjectURI, options.contentType)
  // }

  // if (options.contentType == 'text/html' || options.contentType == 'application/xhtml+xml' || options.contentType == 'text/turtle' || options.contentType == 'application/ld+json' || options.contentType == 'application/activity+json') {

  //     data = setDocumentBase(data, options.subjectURI, options.contentType)
  // }

  switch (options.contentType) {
    case 'application/activity+json': case 'application/json':
      options.contentType = 'application/ld+json';
      break;
    case 'text/plain':
    case 'text/markdown':
    // case 'image/svg+xml':
      options.contentType = 'text/html';
      break;
    default:
      break;
  }

  //TODO: Look into a wrapping function so that we don't have to pass baseURI twice; getRDFParser, parser.import
  const parser = getRDFParser(baseIRI, options.contentType);
  const nodeStream = Readable.from([data]);
  const quadStream = parser.import(nodeStream, { baseIRI: baseIRI });
  // const dataset = rdf.dataset().import(quadStream);
// console.log(quadStream)
  // return rdf.grapoi({ dataset });
  return rdf.dataset().import(quadStream).then((dataset) => {
// console.log(dataset.toCanonical())
    return rdf.grapoi({ dataset });
  });


// console.log(data)
// console.log(options)
//   return SimpleRDF.parse(data, options['contentType'], options['subjectURI'])
//     .then(g => {
//       // var o = { 'contentType': 'application/n-triples' };
//       var o = { 'contentType': 'text/turtle' };
//       return serializeGraph(g, o).then(d => {
//         d = skolem(d, o);
//         d = setDocumentBase(d, options.subjectURI, o.contentType);
// // console.log(d)
//         return SimpleRDF.parse(d, o['contentType'], options['subjectURI']);
//       })});
}

function getRDFParser(baseIRI, contentType) {
  var RDFaMediaTypes = ['text/html', 'application/xhtml+xml', 'image/svg+xml', 'application/xml', 'text/xml'];

  var profile = '';
  switch(contentType) {
    case 'text/html':
      profile = 'html';
      break;
    case 'application/xhtml+xml':
      profile = 'xhtml';
      break;
    case 'image/svg+xml':
    case 'application/xml':
    case 'text/xml':
      profile = 'xml';
      break;
  }

  if (RDFaMediaTypes.includes(contentType)) {
    return new RdfaParser({
      baseIRI: baseIRI,
      contentType: contentType,
      profile: profile
    });
  }
  else {
    return rdf.formats.parsers.get(contentType);
  }
}

function getMatchFromData (data, spo = {}, options = {}) {
  if (!data) { return Promise.resolve({}) }

  spo['subject'] = spo.subject || currentLocation();
  spo['predicate'] = spo.predicate || ns.rdfs.label.value;

  options['contentType'] = options.contentType || 'text/html';
  options['subjectURI'] = options.subjectURI || spo.subject;

  return getGraphFromData(data, options)
    .then(g => {
      return g.out(spo.predicate);
    })
    .catch(() => {
      return undefined
    })
}

function serializeDataToPreferredContentType(data, options) {
  switch (options['preferredContentType']) {
    case 'text/html':
    case 'application/xhtml+xml':
      return Promise.resolve(data);

    case 'text/turtle':
    case 'application/n-triples':
    case 'application/n-quads':
    case 'text/n3':
      return serializeData(data, options['contentType'], options['preferredContentType'], options);

    case 'application/ld+json':
    case 'application/activity+json':
    case 'application/json':
    case '*/*':
    default:
      return serializeData(data, options['contentType'], 'application/ld+json', options);
  }
}

function serializeData (data, fromContentType, toContentType, options = {}) {
  // if (!rdf.formats.serializers.get(toContentType)) { return Promise.reject('XXX: Should not be here'); }
  
  if (fromContentType === toContentType) {
    return Promise.resolve(data);
  }

  options['contentType'] = fromContentType;

  return getGraphFromData(data, options)
    .then(g => {
      options['contentType'] = toContentType;

      return serializeGraph(g, options);
    });
}


/**
 * @param data
 * @param fromContentType
 * @param toContentType
 * @param options
 *
 * @returns {Promise}
 */
function XXXOLDserializeData (data, fromContentType, toContentType, options) {
  if (fromContentType === toContentType) {
    return Promise.resolve(data)
  }

  options.contentType = fromContentType

// console.log(data)

  return getGraphFromData(data, options)
    .then(g => {

      options.contentType = toContentType

      switch (toContentType) {
        case 'application/ld+json':
// console.log(g)
          return serializeGraph(g, options).then(subjectTriples => {
            subjectTriples = JSON.parse(subjectTriples)

            var data = {}
            if (options["@context"]) {
              data["@context"] = options["@context"]
            }

            var subjectsChecked = []
            var subjectsList = []
            var rootIndex = 0

            for(var i = 0; i < subjectTriples.length; i++) {
              subjectsList.push(subjectTriples[i]["@id"])

              if ("@id" in subjectTriples[i] && subjectTriples[i]["@id"] == options.subjectURI) {
                Object.assign(data, subjectTriples[i])

                subjectsChecked.push(options.subjectURI)

                rootIndex = i
              }
            }

            var processObject = function(subject) {
              var properties = Object.keys(subject)
              properties.forEach(property => {
                if (typeof subject[property] === 'object') {
                  if ("@id" in subject[property]
                    && subjectsChecked.indexOf(subject[property]["@id"]) < 0
                    && subjectsList.indexOf(subject[property]["@id"]) > -1) {

                    subjectTriples.forEach(o => {
                      if (o["@id"] == subject[property]["@id"]) {
                        subject[property] = o;

                        subjectsChecked.push(subject[property]["@id"])
                      }
                    })
                  }

                  return Object.assign({}, processObject(subject[property]))
                }
              })

              return subject
            }

            var subject = subjectTriples[rootIndex]

            Object.assign(data, processObject(subject))

// console.log(data)
// console.log(JSON.stringify(data))
            return JSON.stringify(data) + '\n'
          })

        default:
          return serializeGraph(g, options)
      }
    })
    .then(data => {
      switch (toContentType) {
        default:
          break;

        case 'application/ld+json':
          //TODO: Lazy person's JSON-LD compacting. Expect errors!
          if (options["@context"]) {
            var context = (typeof options["@context"] === 'string') ? [options["@context"]] : options['@context']

            data = JSON.parse(data);
            delete data["@context"]
            data = JSON.stringify(data)

            data = data.replace(new RegExp('"@id"', 'g'), '"id"')
            data = data.replace(new RegExp('"@type"', 'g'), '"type"')

            context.forEach(c => {
              var search = '';
              var replace = '';

              if (typeof c === 'string') {
                switch(c) {
                  case 'http://www.w3.org/ns/anno.jsonld':
                    data = data.replace(new RegExp('http://www.w3.org/ns/oa#autoDirection', 'g'), 'auto')
                    data = data.replace(new RegExp('http://www.w3.org/ns/oa#cachedSource', 'g'), 'cached')
                    data = data.replace(new RegExp('http://www.w3.org/ns/oa#hasBody', 'g'), 'body')
                    data = data.replace(new RegExp('http://www.w3.org/ns/oa#hasEndSelector', 'g'), 'endSelector')
                    data = data.replace(new RegExp('http://www.w3.org/ns/oa#hasPurpose', 'g'), 'purpose')
                    data = data.replace(new RegExp('http://www.w3.org/ns/oa#hasScope', 'g'), 'scope')
                    data = data.replace(new RegExp('http://www.w3.org/ns/oa#hasSelector', 'g'), 'selector')
                    data = data.replace(new RegExp('http://www.w3.org/ns/oa#hasSource', 'g'), 'source')
                    data = data.replace(new RegExp('http://www.w3.org/ns/oa#hasStartSelector', 'g'), 'startSelector')
                    data = data.replace(new RegExp('http://www.w3.org/ns/oa#hasTarget', 'g'), 'target')
                    data = data.replace(new RegExp('http://www.w3.org/ns/oa#ltrDirection', 'g'), 'ltr')
                    data = data.replace(new RegExp('http://www.w3.org/ns/oa#motivatedBy', 'g'), 'motivation')
                    data = data.replace(new RegExp('http://www.w3.org/ns/oa#rtlDirection', 'g'), 'rtl')
                    data = data.replace(new RegExp('http://www.w3.org/ns/oa#styledBy', 'g'), 'stylesheet')

                    data = data.replace(new RegExp('"oa:', 'g'), '"')

                    search = 'http://www.w3.org/ns/oa#'
                    break

                  case 'https://www.w3.org/ns/activitystreams':
                    data = data.replace(new RegExp('"as:', 'g'), '"')

                    search = 'https://www.w3.org/ns/activitystreams#'
                    break

                  case 'http://schema.org/':
                    data = data.replace(new RegExp('"schema:', 'g'), '"')

                    search = 'http://schema.org/'
                    break
                }
              }
              else {
                replace = Object.keys(c)[0];

                switch(replace) {
                  case 'oa':
                    search = 'http://www.w3.org/ns/oa#'
                    break

                  case 'as':
                    search = 'https://www.w3.org/ns/activitystreams#'
                    break

                  case 'schema':
                    search = 'http://schema.org/'
                    break
                }

                replace = replace + ':'
              }

              data = data.replace(new RegExp(search, 'g'), replace)

            })

            data = JSON.parse(data)
            //XXX: Is it ever possible that via could already exist and this mistakenly overwrites it?
            //Why is this specific to JSON-LD?
            if (!options['canonical'] && 'id' in data) {
              data[ "via" ] = data[ "id" ]
              data[ "id" ] = ""
            }
            data = Object.assign({"@context": options["@context"]}, data)
            data = JSON.stringify(data)
          }

          break;
      }
// console.log(data)
      return data
    })
}

function streamToString (stream) {
  const chunks = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('error', (err) => reject(err));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  })
}

function serializeGraph (g, options = {}) {
  if (!('contentType' in options)) {
    options['contentType'] = 'text/turtle'
  }
// console.log(options)

  try {
    var quads = g.out().quads();

    // console.log(Array.from(quads))

    // if (options?.subjectURI == 'http://localhost/d79351f4-cdb8-4228-b24f-3e9ac74a840d') {
    //   for (let quad of Array.from(quads)) {
    //     quad.subject.value = quad.subject.value.replace(/http:\/\/localhost\/d79351f4-cdb8-4228-b24f-3e9ac74a840d/g, '');
    //     quad.subject.value = quad.object.value.replace(/http:\/\/localhost\/d79351f4-cdb8-4228-b24f-3e9ac74a840d/g, '');
    //   }
    // }

    // console.log(Array.from(quads))

    return streamToString(rdf.formats.serializers.get(options.contentType, { compact: true, prettyPrint: true }).import(Readable.from(quads), { compact: true, prettyPrint: true })).then((data) => {
      // if (options?.subjectURI == 'http://localhost/d79351f4-cdb8-4228-b24f-3e9ac74a840d') {
      return data.replace(/http:\/\/localhost\/d79351f4-cdb8-4228-b24f-3e9ac74a840d/g, '');
      // }
    });
  }
  catch(e) {
    console.log(e)
  }


  // return store.serializers[options.contentType].serialize(g._graph)
  //   .then(data => {
  //     data = applyParserSerializerFixes(data, options.contentType)

      // XXX: .compact doesn't work as advertised
      // if (options.contentType === 'application/ld+json' && '@context' in options) {
      //   return jsonld.promises().compact(data, options['@context'], {'skipExpansion': true})
      // }

    //   return data
    // })
}

function applyParserSerializerFixes(data, contentType) {
  // FIXME: FUGLY because parser defaults to localhost. Using UUID to minimise conflict
  data = data.replace(/http:\/\/localhost\/d79351f4-cdb8-4228-b24f-3e9ac74a840d/g, '');

  switch(contentType) {
    case 'text/turtle':
      //XXX: Workaround for rdf-parser-rdfa bug that gives '@langauge' instead of @type when encountering datatype in HTML+RDFa . TODO: Link to bug here
      data = data.replace(/Z"@en;/, 'Z"^^<http://www.w3.org/2001/XMLSchema#dateTime>;');
      data = data.replace(/start> "(\d+)"@en;/, 'start> "$1"^^<http://www.w3.org/2001/XMLSchema#nonNegativeInteger>;');
      data = data.replace(/end> "(\d+)"@en;/, 'end> "$1"^^<http://www.w3.org/2001/XMLSchema#nonNegativeInteger>;');
      data = data.replace(/\%2523/, '%23');

      //XXX: Seems to get added when https://schema.org/docs/jsonldcontext.jsonld is used. After using 'http' -> 'https' (for fetching purpose) but then the serializer adds `@prefix 0: <https://schema.org/>` which seems invalid.
      data = data.replace(/^@prefix 0: .*$/gm, '');
      break;

    case 'application/ld+json':
      var x = JSON.parse(data);

      //XXX: Workaround for rdf-parser-rdfa bug that gives '@language' instead of @type when encountering datatype in HTML+RDFa . See also https://github.com/rdf-ext/rdf-parser-rdfa/issues/5
      var properties = ['https://www.w3.org/ns/activitystreams#published', 'https://www.w3.org/ns/activitystreams#updated', 'http://schema.org/dateCreated', 'http://schema.org/datePublished', 'http://schema.org/dateModified', 'http://www.w3.org/ns/oa#start', 'http://www.w3.org/ns/oa#end'];

      for(var i = 0; i < x.length; i++){
        for(var j = 0; j < properties.length; j++){
          if(properties[j] in x[i]) {
            if (properties[j] == 'http://www.w3.org/ns/oa#start' || properties[j] == 'http://www.w3.org/ns/oa#end') {
              x[i][properties[j]] = {
                '@type': 'http://www.w3.org/2001/XMLSchema#nonNegativeInteger',
                '@value': x[i][properties[j]]['@value']
              };
            }
            else {
              x[i][properties[j]] = {
                '@type': 'http://www.w3.org/2001/XMLSchema#dateTime',
                '@value': x[i][properties[j]]['@value']
              };
            }
          }
        }
      }

      data = JSON.stringify(x);
      break;
  }

  return data;
}

function skolem(data, options) {
  //XXX: Perhaps this should just be part of applyParserSerializerFixes or an option of it
  //TODO: Reuse an existing function/library for this (from parsers?) instead of the hack here. Proper skolem for different options.contentType needed?

  //XXX: Perhaps for Turtle
  data = data.replace(new RegExp('_:([^ \.\,\;]*)([ \.\,\;]+)', 'g'), "<http://example.com/.well-known/genid/$1>$2");
  //XXX: Simpler for N-Triples https://www.w3.org/TR/n-triples/#BNodes but not actually conforming:
  // data = data.replace(new RegExp('_:([^ \.]*)([ \.]+)', 'g'), "<http://example.com/.well-known/genid/$1>$2");

// console.log(data)
  return data;
}

function* filterQuads(quads, options) {
  for (const q of quads) {
    if (
      ('subjects' in options.filter && options.filter.subjects.includes(q.subject.value)) ||
      ('predicates' in options.filter && options.filter.predicates.includes(q.predicate.value))
    ) {
      yield q;
    }
  }
}

function transformJsonldContextURLScheme(data) {
  if (typeof data["@context"] === "string") {
    data["@context"] = data["@context"].replace(/^http:/, 'https:');
  }
  // else if (typeof data["@context"] === "object") {
  //   for (var key in data["@context"]) {
  //     if (data["@context"].hasOwnProperty(key) && typeof data["@context"][key] === "string") {
  //       data["@context"][key] = data["@context"][key].replace(/^http:/, 'https:');
  //     }
  //   }
  // }
  return data;
}

function setDocumentBase (data, baseURI, contentType) {
  baseURI = stripFragmentFromString(baseURI)
  let template;
  let base;
  switch(contentType) {
    case 'text/html': case 'application/xhtml+xml':
      template = document.implementation.createHTMLDocument()
      template.documentElement.innerHTML = data
      base = template.querySelector('head base[href]')
      if (!base) {
        template.querySelector('head').insertAdjacentHTML('afterbegin', '<base href="' + baseURI + '" />')
        data = template.documentElement.outerHTML
      }
      break;

    case 'text/turtle':
      data = `@base <` + baseURI + `> .\n` + data;
      break;

    case 'application/json': case 'application/ld+json': case 'application/activity+json':
      data = data.replace(/(\\)(?=\/)/g, '');
      data = JSON.parse(data);
      //TODO: This is outside the scope of this function. Should move to applyParserSerializerFixes or getGraphFromData?
      data = transformJsonldContextURLScheme(data);

      data['@context'] = (data['@context']) ? data['@context'] : {'@base': baseURI};

      if (Array.isArray(data['@context'])) {
        var found = false;
        data['@context'].forEach(a => {
          if (typeof a === 'object' && '@base' in a) {
            found = true;
          }
        })
        if (!found) {
          data['@context'].push({'@base': baseURI});
        }
      }
      else if (typeof data['@context'] === 'object' && !('@base' in data['@context'])) {
        data['@context']['@base'] = baseURI;
      }
      else if (typeof data['@context'] === 'string') {
        data['@context'] = [
          data['@context'],
          {'@base': baseURI}
        ]
      }

      data = JSON.stringify(data);
      break;

    default:
      break;
  }
// console.log(data)
  return data
}

function traverseRDFList(g, resource) {
  var b = g.node(rdf.namedNode(resource));
  var result = [];

  if (b.out(ns.rdf.first).values.length) {
    result.push(b.out(ns.rdf.first).values[0]);
  }
  if (b.out(ns.rdf.rest).values.length && b.out(ns.rdf.rest).values[0] !== 'http://www.w3.org/1999/02/22-rdf-syntax-ns#nil') {
    result = result.concat(traverseRDFList(g, b.out(ns.rdf.rest).values[0]));
  }

  return result;
}

//TODO: Review grapoi
function getResourceGraph (iri, headers, options = {}) {
  let wildCard = options.excludeMarkup ? '' : ',*/*;q=0.1';
  let defaultHeaders = {'Accept': setAcceptRDFTypes(options) + wildCard}
  headers = headers || defaultHeaders
  if (!('Accept' in headers)) {
    Object.assign(headers, defaultHeaders)
  }

  return getResource(iri, headers, options)
    .then(response => {
      let cT = response.headers.get('Content-Type')
      options['contentType'] = (cT) ? cT.split(';')[ 0 ].trim() : 'text/turtle'
      // options['subjectURI'] = stripFragmentFromString(iri)
      options['subjectURI'] = iri

      //XXX: Perhaps okay for text/markdown but not text/plain?
      if  (['text/markdown', 'text/plain'].includes(options['contentType'])) {
        options.contentType = 'text/html';
        return response.text().then(data => parseMarkdown(data, {createDocument: true}));
      }
      else if (options['contentType'] == 'application/json') {
        return response.json().then(data => {
          if (data['@context']) {
            data = transformJsonldContextURLScheme(data);
            return JSON.stringify(data);
          }

          return Promise.reject({ resource: iri, response: response, message: 'Unsupported media type for RDF parsing (without @context): ' + options['contentType'] })
        });
      }
      else if (!Config.MediaTypes.RDF.includes(options['contentType'])) {
        return Promise.reject({ resource: iri, response: response, message: 'Unsupported media type for RDF parsing: ' + options['contentType'] })
      }

      return response.text();
    })
    .then(data => {
// console.log(data, options)
      return getGraphFromData(data, options)
    })
    .then(g => {
// console.log(g)
//       let fragment = (iri.lastIndexOf('#') >= 0) ? iri.substr(iri.lastIndexOf('#')) : ''
// console.log(iri, getProxyableIRI(iri), fragment)
//       var r = 
// console.log(r.term.value)
//       // var r =  rdf.grapoi({ dataset: g.dataset, term: rdf.namespace(getProxyableIRI(iri) + fragment)('')});

//       console.log(Array.from(r.out().quads()))
//       return r;

// console.log(stripFragmentFromString(iri))

//       return g.node(rdf.namedNode(iri));
      return rdf.grapoi({ dataset: g.dataset, term: rdf.namedNode(stripFragmentFromString(iri))});
    })
    .catch(e => {
      if ('resource' in e || 'cause' in e || e.status?.toString().startsWith('5')) {
        return e;
      }

      // throw e;
    })
}

function getResourceOnlyRDF(url) {
  return getResourceHead(url)
    .then(response => {
      var cT = response.headers.get('Content-Type');
      var options = {};
      options['contentType'] = (cT) ? cT.split(';')[0].toLowerCase().trim() : '';

      if (DO.C.MediaTypes.RDF.includes(options['contentType'])) {
        var headers = { 'Accept': setAcceptRDFTypes() };
        return getResourceGraph(url, headers);
      } 
      else {
        return Promise.reject({ resource: url, response: response, message: 'Unsupported media type for RDF parsing: ' + options['contentType'] });
      }
    });
}

function getLinkRelation (property, url, data) {
  if (url) {
    return getLinkRelationFromHead(property, url)
      .catch(() => {
        if (!data) {
          return getLinkRelationFromRDF(property, url)
        }
      });
  }
  else if (data) {
    var subjectURI = currentLocation();
    // var subjectURI = window.location.href.split(window.location.search || window.location.hash || /[?#]/)[0]

    var options = {
      'contentType': 'text/html',
      'subjectURI': subjectURI
    }

    return getGraphFromData(data, options)
      .then(g => {
        g = g.node(rdf.namedNode(subjectURI));
        // TODO: Should this get all or a given subject's?
        var endpoints = g.out(rdf.namedNode(property)).values;

        if (endpoints?.length) {
          return endpoints;
        }

// console.log(property + ' endpoint was not found in message body')
        return getLinkRelationFromHead(property, subjectURI)
      })

    }
}

function getLinkRelationFromHead (property, url) {
  var properties = (Array.isArray(property)) ? property : [property];

  return getResourceHead(url).then(
    function (i) {
      var link = i.headers.get('Link')
      if (link && link.length) {
        var linkHeaders = LinkHeader.parse(link)
  // console.log(property)
  // console.log(linkHeaders)
        var uris = [];
        properties.forEach(property => {
          if (linkHeaders.has('rel', property)) {
            uris.push(linkHeaders.rel(property)[0].uri);
          }
        });

        if (uris.length) {
          return uris;
        }

       return Promise.reject({'message': properties.join(', ') + " endpoint(s) was not found in 'Link' header"})
      }
      return Promise.reject({'message': properties.join(', ') + " endpoint(s) was not found in 'Link' header"})
    },
    function (reason) {
      return Promise.reject({'message': "'Link' header not found"})
    }
  );
}

function getLinkRelationFromRDF (property, url) {
  if (!url) { return Promise.reject({'message': 'Missing url paramater' })}

  return getResourceGraph(url)
    .then(g => {
        g = g.node(rdf.namedNode(url));
        var values = g.out(rdf.namedNode(property)).values;

        if (values.length) {
          return values;
        }

        return Promise.reject({'message': property + " endpoint was not found in message body"})
      }
    )
}

function isActorType (s) {
  return Config.Actor.Type.hasOwnProperty(s)
}

function isActorProperty (s) {
  return Config.Actor.Property.hasOwnProperty(s)
}

function getAgentPreferencesInfo(g) {
  if (!g) { return; }

  var preferencesFile = getAgentPreferencesFile(g) || Config.User.PreferencesFile;

  if (preferencesFile?.length) {
    return getResourceGraph(preferencesFile[0]);
  }
  else {
    return Promise.reject({});
  }
}

//TODO: Review grapoi
function getAgentPreferredPolicyRule(s) {
  var preferredPolicyRule = {};

  var prohibitions = s.out(ns.odrl.prohibition).values;
  if (prohibitions.length) {
    var prohibitionG = s.node(rdf.namedNode(prohibitions[0]));

    if (prohibitionG.out(ns.odrl.action).values.length) {
      preferredPolicyRule['Prohibition'] = {};
      preferredPolicyRule['Prohibition']['Actions'] = prohibitionG.out(ns.odrl.action).values;
    }
  }

  var permissions = s.out(ns.odrl.permissions).values;
  if (permissions.length) {
    var permissionG = s.node(rdf.namedNode(permissions[0]));

    if (permissionG.out(ns.odrl.action).values.length) {
      preferredPolicyRule['Permission'] = {};
      preferredPolicyRule['Permission']['Actions'] = permissionG.out(ns.odrl.action).values;
    }
  }

  return preferredPolicyRule;
}

//TODO: Review grapoi
function setPreferredPolicyInfo(g) {
  Config.User['PreferredPolicy'] = getAgentPreferredPolicy(g);
  var s = g.node(rdf.namedNode(Config.User.PreferredPolicy));
  Config.User['PreferredPolicyRule'] = getAgentPreferredPolicyRule(s);
}

//TODO: Review grapoi
function getAgentSupplementalInfo(iri) {
  if (iri == Config.User.IRI) {
    return processSameAs(Config.User.Graph, getAgentSupplementalInfo);
  }
  else {
    return getResourceGraph(iri)
      .then(g => {
        if (!Array.from(g.out().quads()).length) {
          return Promise.resolve([]);
        }

        var s = g.node(rdf.namedNode(iri));

        Config.User.Name = Config.User.Name || getAgentName(s);

        Config.User.Image = Config.User.Image || getGraphImage(s);

        var storage = getAgentStorage(s) || [];
        var outbox = getAgentOutbox(s) || [];
        var knows = getAgentKnows(s) || [];
        var liked = getAgentLiked(s) || [];
        var occupations = getAgentOccupations(s) || [];
        var publications = getAgentPublications(s) || [];
        var made = getAgentMade(s) || [];
        //TODO publicTypeIndex privateTypeIndex ??

        if (storage.length > 0) {
          Config.User.Storage = (Config.User.Storage)
            ? uniqueArray(Config.User.Storage.concat(storage))
            : storage;
        }

        if (outbox.length > 0) {
          Config.User.Outbox = (Config.User.Outbox)
            ? uniqueArray(Config.User.Outbox.concat(outbox))
            : outbox;
        }

        if (knows.length > 0) {
          Config.User.Knows = (Config.User.Knows)
            ? uniqueArray(Config.User.Knows.concat(knows))
            : knows;
        }

        if (liked.length > 0) {
          Config.User.Liked = (Config.User.Liked)
            ? uniqueArray(Config.User.Liked.concat(liked))
            : liked;
        }

        if (occupations.length > 0) {
          Config.User.Occupations = (Config.User.Occupations)
            ? uniqueArray(Config.User.Occupations.concat(occupations))
            : occupations;
        }

        if (publications.length > 0) {
          Config.User.Publications = (Config.User.Publications)
            ? uniqueArray(Config.User.Publications.concat(publications))
            : occupations;
        }

        if (made.length > 0) {
          Config.User.Made = (Config.User.Made)
            ? uniqueArray(Config.User.Made.concat(made))
            : made;
        }

        return processSameAs(s, getAgentSupplementalInfo)
                .then(() => {
                  return getAgentSeeAlso(s)
                });
      },
      function(reason){
        return Promise.resolve([]);
      });
  }
}

function getAgentSeeAlso(g, subjectURI) {
  if (!g) { return Promise.resolve([]); }

  subjectURI = subjectURI || g.term.value;
  var baseURI = stripFragmentFromString(subjectURI);
  var seeAlso = g.out(ns.rdfs.seeAlso).values;

  if (seeAlso.length) {
    var iris = [];
    var promises = [];

    seeAlso.forEach(iri => {
      if (!Config.User.SeeAlso.includes(iri) && (stripFragmentFromString(iri) != baseURI)) {
        iris.push(iri);
      }
    });

    iris.forEach(iri => {
      Config.User.SeeAlso = uniqueArray(Config.User.SeeAlso.concat(iri));
      promises.push(getResourceGraph(iri));
    });

    return Promise.allSettled(promises)
      .then(results => {
        var promisesGetAgentSeeAlso = [];

        results.forEach(result => {
          var g = result.value;

          if (g) {
            var s = g.node(rdf.namedNode(subjectURI));

            var knows = getAgentKnows(s) || [];
            var liked = getAgentLiked(s) || [];
            var occupations = getAgentOccupations(s) || [];
            var publications = getAgentPublications(s) || [];
            var made = getAgentMade(s) || [];

            if (knows.length) {
              Config.User.Knows = (Config.User.Knows)
                ? uniqueArray(Config.User.Knows.concat(knows))
                : knows;
            }

            if (liked.length) {
              Config.User.Liked = (Config.User.Liked)
                ? uniqueArray(Config.User.Liked.concat(liked))
                : liked;
            }

            if (occupations.length) {
              Config.User.Occupations = (Config.User.Occupations)
                ? uniqueArray(Config.User.Occupations.concat(occupations))
                : occupations;
            }

            if (publications.length) {
              Config.User.Publications = (Config.User.Publications)
                ? uniqueArray(Config.User.Publications.concat(publications))
                : publications;
            }

            if (made.length) {
              Config.User.Made = (Config.User.Made)
                ? uniqueArray(Config.User.Made.concat(made))
                : made;
            }

            promisesGetAgentSeeAlso.push(getAgentSeeAlso(g, subjectURI))
          }
        })

        return Promise.allSettled(promisesGetAgentSeeAlso)
          .then(results => {
            return Promise.resolve([]);
          })
      })
      .catch(e => {
        return Promise.resolve([]);
      });
  }
  else {
    return Promise.resolve([])
  }
}

function getUserContacts(iri) {
  var fyn = function(iri){
    if ((iri == Config.User.IRI) && Config.User.Graph) {
      return processSameAs(Config.User.Graph, getUserContacts);
    }
    else {
      return getResourceGraph(iri)
        .then(g => {
          // if(typeof g._graph == 'undefined' || g.resource || g.cause || g.status?.startsWith(5)) {
          if(typeof g == 'undefined') {
            return Promise.resolve([]);
          }

          var s = g.node(rdf.namedNode(iri));

          var knows = getAgentKnows(s) || [];

          if (knows.length > 0) {
            Config.User.Knows = (Config.User.Knows)
              ? uniqueArray(Config.User.Knows.concat(knows))
              : knows;
          }

          return processSameAs(s, getUserContacts);
        })
        .catch(e => {
          return Promise.resolve([]);
        });
    }
  }

  return fyn(iri).then(i => { return Config.User.Knows || []; });
}

function getAgentTypeIndex(s) {
  //XXX: TypeRegistration forClasses of interest but for now lets store what we find without filtering.
  // const TypeRegistrationClasses = [ns.oa.Annotation, ns.as.Announce];

  var fetchTypeRegistration = function(iri, typeIndexType) {
    return getResourceGraph(iri)
      .then(g => {
        //XXX: https://github.com/solid/type-indexes/issues/29 for potential property to discover TypeRegistrations.
// console.log(iri, g, g.term.value, typeIndexType);
        if (!g) {
          return {};
        }

        g = rdf.grapoi({ dataset: g.dataset });

        var triples = Array.from(g.out().quads());

        if (triples.length) {
          var typeIndexes = {};
          typeIndexes[typeIndexType] = {};

          triples.forEach(t => {
            var s = t.subject.value;
            var p = t.predicate.value;
            var o = t.object.value;

            if (p == ns.solid.forClass.value) {
              typeIndexes[typeIndexType][s] = {};
              typeIndexes[typeIndexType][s][p] = o;
            }
          });

          triples.forEach(t => {
            var s = t.subject.value;
            var p = t.predicate.value;
            var o = t.object.value;

            if (typeIndexes[typeIndexType][s]) {
              if (p == ns.solid.instance.value ||
                  p == ns.solid.instanceContainer.value) {
                typeIndexes[typeIndexType][s][p] = o;
              }
            }
          });
// console.log(typeIndexes)
          return typeIndexes
        }
      })
  }

  var promises = []

  var publicTypeIndex = getAgentPublicTypeIndex(s);
  var privateTypeIndex = getAgentPrivateTypeIndex(s);

  if (publicTypeIndex?.length) {
    promises.push(fetchTypeRegistration(publicTypeIndex[0], ns.solid.publicTypeIndex.value))
  }
  if (privateTypeIndex?.length && Config.User.OIDC) {
    promises.push(fetchTypeRegistration(privateTypeIndex[0], ns.solid.privateTypeIndex.value))
  }

  return Promise.allSettled(promises)
    .then(results => {
      results.filter(result => !(result instanceof Error));

      var typeIndexes = {};

      results.forEach(result => {
        Object.assign(typeIndexes, result.value);
      });

      return typeIndexes;
    });
}

function processSameAs(s, callback) {
  var sameAs = s.out(ns.owl.sameAs).values;

  if (sameAs.length){
    var promises = [];
    sameAs.forEach(iri => {
// console.log(iri);
      if(iri != Config.User.IRI && !Config.User.SameAs.includes(iri)) {
        Config.User.SameAs = uniqueArray(Config.User.SameAs.concat(iri));

        if (typeof callback !== 'undefined') {
          promises.push(callback(iri));
        }
        else {
          promises.push(Promise.resolve(Config.User.SameAs));
        }
      }
    });

    return Promise.all(promises)
      .then(results => {
        return Promise.resolve([]);
      })
      .catch(e => {
        return Promise.resolve([]);
      });
  }
  else {
    return Promise.resolve([]);
  }
}

function getAgentPreferredProxy (s) {
  return s.out(ns.solid.preferredProxy).values[0] || undefined
}

function getAgentPreferredPolicy (s) {
  return s.out(ns.solid.preferredPolicy).values[0] || undefined
}

//TODO: undefined?
function getAgentOIDCIssuer (s) {
  let idp = s.out(ns.solid.oidcIssuer)?.values[0] || undefined;
  idp = idp && idp.endsWith("/") ? idp.substring(0, idp.length - 1) : idp;

  return idp;
}

function getAgentName (s) {
  var name = s.out(ns.foaf.name).values[0] || s.out(ns.schema.name).values[0] || s.out(ns.vcard.fn).values[0] || s.out(ns.as.name).values[0] || s.out(ns.rdfs.label).values[0] || undefined;
  // var name = s.out([ns.foaf.name, ns.schema.name]).values[0]
  if (typeof name === 'undefined') {
    // s.hasOut(ns.schema.familyName).hasOut(ns.schema.givenName)
    // .map(ptr => {
    //   return ptr.out(ns.schema.familyName).values[0] + ' '
    //   ptr.out(ns.schema.givenName).values[0]
    // })
    // .out([ns.schema.familyName, ns.schema.givenName]).join(' ')

    if (s.out(ns.schema.familyName).values.length && s.out(ns.schema.givenName).values.length) {
      name = s.out(ns.schema.givenName).values[0] + ' ' + s.out(ns.schema.familyName).values[0];
    } else if (s.out(ns.foaf.familyName).values.length && s.out(ns.foaf.givenName).values.length) {
      name = s.out(ns.foaf.givenName).values[0] + ' ' + s.out(ns.foaf.familyName).values[0];
    } else if (s.out(ns.vcard['family-name']).values.length && s.out(ns.vcard['given-name']).values.length) {
      name = s.out(ns.vcard['given-name']).values[0] + ' ' + s.out(ns.vcard['family-name']).values[0];
    } else if (s.out(ns.foaf.nick).values.length) {
      name = s.out(ns.foaf.nick).values;
    } else if (s.out(ns.vcard.nickname).values.length){
      name = s.out(ns.vcard.nickname).values;
    }
  }
  return name === undefined ? undefined : DOMPurify.sanitize(name)
}

function getAgentURL (s) {
  return s.out(ns.foaf.homepage).values[0] || s.out(ns.foaf.weblog).values[0] || s.out(ns.schema.url).values[0] || s.out(ns.vcard.url).values[0] || undefined
}

function getAgentDelegates (s) {
  var d = s.out(ns.acl.delegates).values;
  return d.length ? d : undefined;
}

function getAgentStorage (s) {
  var d = s.out(ns.pim.storage).values;
  return d.length ? d : undefined;
}

function getAgentOutbox (s) {
  var d = s.out(ns.as.outbox).values;
  return d.length ? d : undefined;
}

function getAgentInbox (s) {
  return getGraphInbox(s);
}

function getGraphInbox(s) {
  var ldpinbox = s.out(ns.ldp.inbox).values;
  var asinbox = s.out(ns.as.inbox).values;
  return (
    ldpinbox.length > 0 ? ldpinbox :
    asinbox.length > 0 ? asinbox :
    undefined
  );
}

function getAgentKnows (s) {
  var knows = [];

  var foafknows = s.out(ns.foaf.knows).values;
  var schemaknows = s.out(ns.schema.knows).values;

  if (foafknows.length){
    knows = knows.concat(foafknows);
  }

  if (schemaknows.length){
    knows = knows.concat(schemaknows);
  }

  knows = uniqueArray(knows);

  return (knows.length) ? knows : undefined;
}

function getAgentFollowing (s) {
  var following = s.out(ns.as.following).values;

  if (following.length) {
    var options = {
      headers: {'Accept': 'application/ld+json; profile="https://www.w3.org/ns/activitystreams", application/activity+json, text/turtle'},
      noCredentials: true
    };
    return DO.U.getItemsList(following[0], options)
      .then(items => {
  // console.log(following);
        return (items.length) ? items : undefined;
      });
  }
}

function getAgentPublicTypeIndex (s) {
  var d = s.out(ns.solid.publicTypeIndex).values;
  return d.length ? d : undefined;
}

function getAgentPrivateTypeIndex (s) {
  var d = s.out(ns.solid.privateTypeIndex).values;
  return d.length ? d : undefined;
}

function getAgentPreferencesFile (s) {
  var d = s.out(ns.pim.preferencesFile).values;
  return d.length ? d : undefined;
}

function getAgentLiked (s) {
  var d = s.out(ns.as.liked).values;
  return d.length ? d : undefined;
}

function getAgentOccupations (s) {
  var d = s.out(ns.schema.hasOccupation).values;
  return d.length ? d : undefined;
}

function getGraphAudience (s) {
  var d = s.out(ns.schema.audience).values;
  return d.length ? d : undefined;
}

function getAgentPublications (s) {
  var d = s.out(ns.foaf.publications).values;
  return d.length ? d : undefined;
}

function getAgentMade (s) {
  var d = s.out(ns.foaf.made).values;
  return d.length ? d : undefined;
}

//TODO: Review grapoi
function getGraphImage (s) {
  var image = s.out(ns.as.image).values;
  var icon = s.out(ns.as.icon).values;
  if (image.length || icon.length) {
    var image = image[0] || icon[0];
    Array.from(s.out().quads()).some(t => {
      // var image = s.out([ns.as.icon, ns.as.image]).out([ns.as.url, ns.as.href]).values[0];
      if (t.predicate.value == ns.as.url.value || t.predicate.value == ns.as.href.value) {
        // https://github.com/rdfjs-base/to-ntriples
        // toNT(t.subject)
        // toNT(t)
        // toNT(s.dataset)
        //t.subject.term.equals(s.out(ns.as.icon).terms[0])

        if (t.subject.value == s.out(ns.as.icon).values[0] || "_:" + t.subject.value == s.out(ns.as.icon).values[0]) {
          image = t.object.value;
          return true;
        }
        else if (t.subject.value == s.out(ns.as.image).values[0] || "_:" + t.subject.value == s.out(ns.as.image).values[0]) {
          image = t.object.value;
          return true;
        }
        return false;
      }
    });
    return image;
  }
  else {
    return s.out(ns.foaf.img).values[0] || s.out(ns.schema.image).values[0] || s.out(ns.vcard.photo).values[0] || s.out(ns.vcard.hasPhoto).values[0] || s.out(ns.sioc.avatar).values[0] || s.out(ns.foaf.depiction).values[0] || undefined
  }
}

function getGraphEmail(s) {
  var email = s.out(ns.schema.email).values;
  var mbox = s.out(ns.foaf.mbox).values;
  var d =
    email.length ? email[0] :
    mbox.length ? mbox[0] :
    undefined;

  return d === undefined ? undefined : DOMPurify.sanitize(d)
}

function getGraphContributors(s) {
  var d = s.out(ns.schema.contributor).values;
  return d.length ? d : undefined;
}

function getGraphEditors(s) {
  var d = s.out(ns.schema.editor).values;
  return d.length ? d : undefined;
}

function getGraphAuthors(s) {
  var author = s.out(ns.schema.author).values;
  var creator = s.out(ns.schema.creator).values;
  var actor = s.out(ns.as.author).values;
  var dcreator = s.out(ns.dcterms.creator).values;

  return (
    author.length > 0 ? author :
    creator.length > 0 ? creator :
    actor.length > 0 ? actor :
    dcreator.length > 0 ? dcreator :
    undefined
  );
}

function getGraphPerformers(s) {
  var d = s.out(ns.schema.performer).values;
  return d.length ? d : undefined;
}

function getGraphPublishers(s) {
  var publisher = s.out(ns.schema.publisher).values;
  var dpublisher = s.out(ns.dcterms.publisher).values;
  return (
    publisher.length > 0 ? publisher :
    dpublisher.length > 0 ? dpublisher :
    undefined
  )
}

function getGraphDate(s) {
  return getGraphUpdated(s) || getGraphPublished(s) || getGraphCreated(s);
}

function getGraphPublished(s) {
  var d = s.out(ns.schema.datePublished).values[0] || s.out(ns.as.published).values[0] || s.out(ns.dcterms.issued).values[0] || s.out(ns.dcterms.date).values[0] || s.out(ns.prov.generatedAtTime).values [0] || undefined;
  return d === undefined ? undefined : DOMPurify.sanitize(d);
}

function getGraphUpdated(s) {
  var d = s.out(ns.schema.dateModified).values[0] || s.out(ns.as.updated).values[0] || s.out(ns.dcterms.modified).values[0] || s.out(ns.dcterms.date).values[0] || s.out(ns.prov.generatedAtTime).values[0] || undefined;
  return d === undefined ? undefined : DOMPurify.sanitize(d);
}

function getGraphCreated(s) {
  var d = s.out(ns.schema.dateCreated).values[0] || s.out(ns.dcterms.created).values[0] || s.out(ns.dcterms.date).values[0] || s.out(ns.prov.generatedAtTime).values[0] || undefined;
  return d === undefined ? undefined : DOMPurify.sanitize(d);
}

function getGraphLanguage(s) {
  return s.out(ns.dcterms.language).values[0] || s.out(ns.dcelements.language).values[0] || s.out(ns.schema.inLanguage).values[0] || undefined;
}

function getGraphLicense(s) {
  return s.out(ns.dcterms.license).values[0] || s.out(ns.schema.license).values[0] || s.out(ns.cc.license).values[0] || s.out(ns.xhv.license).values[0] || undefined;
}

function getGraphRights(s) {
  return s.out(ns.dcterms.rights).values[0] || getGraphLicense(s) || undefined;
}

function getGraphLabel(s) {
  var d = s.out(ns.schema.name).values[0] || s.out(ns.dcterms.title).values[0] || s.out(ns.dcelements.title).values[0] || getAgentName(s) || s.out(ns.as.summary).values[0] || undefined;
  return d === undefined ? undefined : DOMPurify.sanitize(d)
}

function getGraphTitle(s) {
  var d = s.out(ns.schema.name).values[0] || s.out(ns.dcterms.title).values[0] || s.out(ns.dcelements.title).values[0] || s.out(ns.as.name).values[0] || undefined;
  return d === undefined ? undefined : DOMPurify.sanitize(d)
}

function getGraphLabelOrIRI(s) {
  return getGraphLabel(s) || s.term.value;
}

function getUserLabelOrIRI(iri) {
  let name = iri;

  if (Config.User.Name && (iri == Config.User.IRI || Config.User?.SameAs.includes(iri))) {
    name = Config.User.Name;
  }
  //XXX: This could potentially incorporate checking the sameAses of all contacts to match iri
  else if (Config.User.Contacts && Config.User.Contacts[iri] && Config.User.Contacts[iri].Name) {
    name = Config.User.Contacts[iri].Name;
  }

  return name;
}

//XXX: RDFa issue retaining markup on non `datatype` nodes: https://github.com/rubensworks/rdfa-streaming-parser.js/issues/49
function getGraphConceptLabel(g, options) {
  var labels = {
    prefLabel: [],
    xlprefLabel: [],
    altLabel: [],
    xlaltLabel: [],
    notation: []
  };
  options = options || {};
  options['subjectURI'] = options['subjectURI'] || g.term.value;
  options['lang'] = options['lang'] || 'en';

  var documentURL = Config.DocumentURL;

  //FIXME: Using this approach temporarily that is tied to SimpleRDF for convenience until it is replaced. It is fugly but it works. Make it better!

  var triples = Array.from(g.out().quads());

  triples.forEach(t => {
// console.log(t)
    var s = t.subject.value;
    var p = t.predicate.value;
    var o = t.object.value;

    if (s == options['subjectURI']){
      if (p == ns.skos.prefLabel.value && (t.object.language && (t.object.language == '' || t.object.language.toLowerCase().startsWith(options['lang'])))) {
        labels.prefLabel.push(o);
      }
      else if (p == ns.skosxl.prefLabel.value) {
        var quads = Config.Resource[documentURL]['graph'].node(rdf.namedNode(o)).out().quads();
        quads.forEach(oT => {
          var oS = oT.subject.value;
          var oP = oT.predicate.value;
          var oO = oT.object.value;

          if (oS == o && oP == ns.skosxl.literalForm.value && (oT.object.language && (oT.object.language == '' || oT.object.language.toLowerCase().startsWith(options['lang'])))) {
            labels.xlprefLabel.push(oO);
          }
        })
      }
      else if (p == ns.skos.altLabel.value && (t.object.language && (t.object.language == '' || t.object.language.toLowerCase().startsWith(options['lang'])))) {
        labels.altLabel.push(o);
      }
      else if (p == ns.skosxl.altLabel.value) {
        var quads = Config.Resource[documentURL]['graph'].node(rdf.namedNode(o)).out().quads();
        quads.forEach(oT => {
          var oS = oT.subject.value;
          var oP = oT.predicate.value;
          var oO = oT.object.value;

          if (oS == o && oP == ns.skosxl.literalForm.value && (oT.object.language && (oT.object.language == '' || oT.object.language.toLowerCase().startsWith(options['lang'])))) {
            labels.xlaltLabel.push(oO);
          }
        })
      }
      else if (p == ns.skos.notation.value) {
        labels.notation.push(o);
      }
    }
  })

  var flattenedLabels = [];

  for (var key in labels) {
    if (labels.hasOwnProperty(key)) {
      flattenedLabels = flattenedLabels.concat(labels[key].sort().map(element => DOMPurify.sanitize(element)));
    }
  }

  labels = uniqueArray(flattenedLabels);

  // console.log(labels)
  return labels;
}

function getGraphDescription(s) {
  var d = s.out(ns.schema.description).value || s.out(ns.dcterms.description).value || s.out(ns.dcelements.description).value || s.out(ns.schema.name).value || s.out(ns.as.name).value || undefined;
  return d === undefined ? undefined : DOMPurify.sanitize(d)
}

function getGraphTypes(s) {
  return s.out(ns.rdf.type).values;
}

function sortGraphTriples(g, options) {
  options = options || {};
  if (!("sortBy" in options)) {
    options["sortBy"] = "object";
  }
  g = rdf.grapoi({ dataset: g.dataset });
  var quads = Array.from(g.out().quads());
  quads.sort(function(a, b) {
    return a[options.sortBy].value
      .toLowerCase()
      .localeCompare(b[options.sortBy].value.toLowerCase());
  });

  return quads;
}

// https://solidproject.org/TR/2024/wac-20240512#effective-acl-resource-algorithm
function getACLResourceGraph(documentURL, iri, options = {}) {
  iri = iri || documentURL;
  //This is probably not needed
  Config.Resource[iri] = Config.Resource[iri] || {};
  Config.Resource[iri]['acl'] = {};

  var baseURL = getBaseURL(iri)
  var pathURL = getPathURL(iri)
// console.log(baseURL)
// console.log(pathURL)

  //TODO: Consider whether to skip this HEAD if we already determined the ACLResource previously. While possible the effectiveACLResource is unlikely to change.
  return getLinkRelationFromHead('acl', iri)
    .then(i => {
      if (i.length) {
        var aR = i[0];

        var aclResource = getAbsoluteIRI(baseURL, aR);
// console.log(aclResource)

        Config.Resource[iri]['acl']['defaultACLResource'] = Config.Resource[iri]['acl']['defaultACLResource'] || aclResource;

        return getResourceGraph(aclResource)
          .then(g => {
// console.log(i)
// console.log(i.status)
//404?
            if (typeof g === 'undefined') {
              var container = pathURL.endsWith('/') ? getParentURLPath(pathURL) : baseURL;
// console.log(container);
              if (typeof container !== 'undefined') {
                Config.Resource[documentURL]['acl']['effectiveContainer'] = container;

                return getACLResourceGraph(documentURL, container);
              }
              else {
                return Promise.reject(new Error('effectiveACLResource not determined. https://solidproject.org/TR/2024/wac-20240512#effective-acl-resource-algorithm'));
              }
            }

            Config.Resource[documentURL]['acl']['effectiveACLResource'] = aclResource;
            Config.Resource[aclResource] = {};
            //TODO: We probably shouldn't use this approach here:
            Config.Resource[aclResource]['graph'] = g;

            return g;
          },
          function(reason){
console.log(reason)
            // return getACLResourceGraph(uri.getParentURLPath(iri))
          });
      }
      else {
        return Promise.reject(new Error('defaultACLResource or effectiveACLResource not determined. https://solidproject.org/TR/2024/wac-20240512#effective-acl-resource-algorithm'));
      }
    },
    //No HEAD + rel=acl
    function(reason){
console.log(reason);
//       var rootURIPath = new URL('/', iri)
//       rootURIPath = rootURIPath.href;
// console.log(iri + ' - ' + rootURIPath)
//       if (iri == rootURIPath) {
        return Promise.reject(new Error('effectiveACLResource not determined. https://solidproject.org/TR/2024/wac-20240512#effective-acl-resource-algorithm'));
      // }
      // else {
      //   var parentURLPath = uri.getParentURLPath(iri);
      //   // return getACLResourceGraph(parentURLPath)
      // }
    });
}


function getAccessSubjects (authorizations, options) {
  var accessSubjects = {};
  var subjectTypes = options || ['agent', 'agentClass', 'agentGroup'];

  Object.keys(authorizations).forEach(authorization => {
    subjectTypes.forEach(subjectType => {
      var accessSubjectsArray = authorizations[authorization][subjectType];
      accessSubjectsArray.forEach(accessSubject => {
        accessSubjects[accessSubject] = {};
        accessSubjects[accessSubject]['subjectType'] = subjectType;
        accessSubjects[accessSubject]['mode'] = authorizations[authorization]['mode'];
      });
    })
  })

  return accessSubjects;
}


function getAuthorizationsMatching (g, matchers) {
  var authorizations = {};

// console.log("getAuthorizationsMatching:", g.terms, g.out().values, matchers);

  var subjects = [];

  g = rdf.grapoi({ dataset: g.dataset });

  g.out().quads().forEach(t => {
// console.log(t)
    subjects.push(t.subject.value);
  });
  subjects = uniqueArray(subjects);
// console.log(subjects)
  subjects.forEach(i => {
    var s = g.node(rdf.namedNode(i));

    if (s.out(ns.rdf.type).values.includes(ns.acl.Authorization.value)) {
      var authorizationIRI = s.term.value;
      var candidateAuthorization = {};

      Object.keys(matchers).forEach(key => {
        if (s.out(ns.acl[key]).values.includes(matchers[key])) {
          candidateAuthorization[key] = matchers[key];
        }
      })

      var allKeysMatched = Object.keys(matchers).every(key => Object.keys(candidateAuthorization).includes(key));

      if (allKeysMatched) {
        var properties = ['agent', 'agentClass', 'agentGroup', 'accessTo', 'default', 'mode', 'origin'];
        var authorization = {};
        properties.forEach(p => {
          authorization[p] = s.out(ns.acl[p]).values;
        })
        authorizations[authorizationIRI] = authorization;
      }
    }
  });

  return authorizations;
}

export {
  getGraphFromData,
  getMatchFromData,
  serializeDataToPreferredContentType,
  XXXOLDserializeData,
  serializeData,
  serializeGraph,
  applyParserSerializerFixes,
  skolem,
  transformJsonldContextURLScheme,
  setDocumentBase,
  traverseRDFList,
  getResourceGraph,
  getResourceOnlyRDF,
  getLinkRelation,
  getLinkRelationFromHead,
  getLinkRelationFromRDF,
  isActorType,
  isActorProperty,
  getAgentPreferencesInfo,
  getAgentPreferredPolicyRule,
  setPreferredPolicyInfo,
  getAgentSeeAlso,
  getAgentSupplementalInfo,
  getUserContacts,
  getAgentTypeIndex,
  processSameAs,
  getAgentPreferredProxy,
  getAgentPreferredPolicy,
  getAgentOIDCIssuer,
  getAgentName,
  getAgentURL,
  getAgentDelegates,
  getAgentStorage,
  getAgentOutbox,
  getAgentInbox,
  getAgentKnows,
  getAgentFollowing,
  getAgentPublicTypeIndex,
  getAgentPrivateTypeIndex,
  getAgentPreferencesFile,
  getAgentLiked,
  getAgentOccupations,
  getAgentPublications,
  getAgentMade,
  getGraphImage,
  getGraphEmail,
  getGraphContributors,
  getGraphEditors,
  getGraphAuthors,
  getGraphPerformers,
  getGraphPublishers,
  getGraphDate,
  getGraphPublished,
  getGraphUpdated,
  getGraphCreated,
  getGraphLanguage,
  getGraphLicense,
  getGraphRights,
  getGraphLabel,
  getGraphTitle,
  getGraphLabelOrIRI,
  getGraphConceptLabel,
  getGraphDescription,
  getGraphTypes,
  getGraphInbox,
  sortGraphTriples,
  getGraphAudience,
  getACLResourceGraph,
  getAccessSubjects,
  getAuthorizationsMatching,
  getUserLabelOrIRI,
  getRDFParser,
  filterQuads
}