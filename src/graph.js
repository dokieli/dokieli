'use strict'

import rdf from "rdf-ext";
import { RdfaParser } from "rdfa-streaming-parser";
import { Readable } from "readable-stream";
import Config from './config.js'
import { stripFragmentFromString, getProxyableIRI, getBaseURL, getPathURL, getAbsoluteIRI, getParentURLPath } from './uri.js'
import { uniqueArray } from './util.js'
import { setAcceptRDFTypes, getResource, getResourceHead } from './fetcher.js'
import LinkHeader from "http-link-header";
import DOMPurify from 'dompurify';

const ns = Config.ns;

function getGraphFromData (data, options = {}) {
  if (!('contentType' in options)) {
    options['contentType'] = 'text/turtle'
  }

  // FIXME: These are fugly but a temporary fix to get around the baseURI not being passed to the DOM parser. This injects the `base` element into the document so that the parsers fallsback to that. The actual fix should happen upstream. See related issues:
  // https://github.com/dokieli/dokieli/issues/132
  // https://github.com/rdf-ext/rdf-parser-dom/issues/2
  // https://github.com/rdf-ext/rdf-parser-rdfa/issues/3
  // https://github.com/simplerdf/simplerdf/issues/19

  // if (!('subjectURI' in options)) {
  //   // console.log(options)
  //   options['subjectURI'] = 'http://localhost/d79351f4-cdb8-4228-b24f-3e9ac74a840d'
  // }

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
  const parser = getRDFParser(options.subjectURI, options.contentType);
  const nodeStream = stringToStream(data);
  const quadStream = parser.import(nodeStream, { 'baseIRI': options.subjectURI });
// console.log(quadStream)

  return rdf.dataset().import(quadStream).then((dataset) => {
// console.log(dataset)
// console.log(dataset.toCanonical());
    return rdf.grapoi({ dataset });
  });


// console.log(data)
// console.log(options)
//   return SimpleRDF.parse(data, options['contentType'], options['subjectURI'])
//     .then(function(g){
//       // var o = { 'contentType': 'application/n-triples' };
//       var o = { 'contentType': 'text/turtle' };
//       return serializeGraph(g, o).then(function(d){
//         d = skolem(d, o);
//         d = setDocumentBase(d, options.subjectURI, o.contentType);
// // console.log(d)
//         return SimpleRDF.parse(d, o['contentType'], options['subjectURI']);
//       })});
}

function stringToStream(str) {
  return new Readable({
    read() {
      this.push(str);
      this.push(null);
    }
  })
}

function getRDFParser(baseIRI, contentType) {
  var RDFaMediaTypes = ['text/html', 'application/xhtml+xml', 'image/svg+xml', 'application/xml', 'text/xml'];

  if (RDFaMediaTypes.includes(contentType)) {
    return new RdfaParser({
      baseIRI: baseIRI,
      contentType: contentType,
    });
  }
  else {
    return rdf.formats.parsers.get(contentType);
  }
}

function getMatchFromData (data, spo = {}, options = {}) {
  if (!data) { return Promise.resolve({}) }

  spo['subject'] = spo.subject || window.location.origin + window.location.pathname
  spo['predicate'] = spo.predicate || Config.Vocab['rdfslabel']

  options['contentType'] = options.contentType || 'text/html'
  options['subjectURI'] = options.subjectURI || spo.subject

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
      return serializeData(data, options['contentType'], 'text/turtle', options);

    case 'application/ld+json':
    case 'application/json':
    case '*/*':
    default:
      return serializeData(data, options['contentType'], 'application/ld+json', options);
  }
}

/**
 * @param data
 * @param fromContentType
 * @param toContentType
 * @param options
 *
 * @returns {Promise}
 */
function serializeData (data, fromContentType, toContentType, options) {
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

            context.forEach(function(c){
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

function serializeGraph (g, options = {}) {
  if (!('contentType' in options)) {
    options['contentType'] = 'text/turtle'
  }

  return store.serializers[options.contentType].serialize(g._graph)
    .then(data => {
      data = applyParserSerializerFixes(data, options.contentType)

      // XXX: .compact doesn't work as advertised
      // if (options.contentType === 'application/ld+json' && '@context' in options) {
      //   return jsonld.promises().compact(data, options['@context'], {'skipExpansion': true})
      // }

      return data
    })
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
        data['@context'].forEach(function(a){
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
  var b = g.child(resource);
  var result = [];

  if (b.rdffirst) {
    result.push(b.rdffirst);
  }
  if (b.rdfrest && b.rdfrest !== 'http://www.w3.org/1999/02/22-rdf-syntax-ns#nil') {
    result = result.concat(traverseRDFList(g, b.rdfrest));
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

      if (!Config.MediaTypes.RDF.includes(options['contentType'])) {
        return Promise.reject({ resource: iri, response: response, message: 'Unsupported media type for RDF parsing: ' + options['contentType'] })
      }

      options['subjectURI'] = stripFragmentFromString(iri)

      return response.text()
    })
    .then(data => {
      return getGraphFromData(data, options)
    })
    .then(g => {
      let fragment = (iri.lastIndexOf('#') >= 0) ? iri.substr(iri.lastIndexOf('#')) : ''

      return rdf.grapoi({ dataset: g.dataset, term: rdf.namespace(getProxyableIRI(iri) + fragment)('')});
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
    .then(function (response) {
      var cT = response.headers.get('Content-Type');
      var options = {};
      options['contentType'] = (cT) ? cT.split(';')[0].toLowerCase().trim() : '';

      if (DO.C.MediaTypes.RDF.includes(options['contentType'])) {
        var headers = { 'Accept': setAcceptRDFTypes() };
        return getResourceGraph(url, headers);
      }
    });
}

function getLinkRelation (property, url, data) {
  if (url) {
    return getLinkRelationFromHead(property, url)
      .catch(() => {
        if (!data) {
          getLinkRelationFromRDF(property, url)
        }
      });
  }
  else if (data) {
    var subjectURI = window.location.href.split(window.location.search || window.location.hash || /[?#]/)[0]

    var options = {
      'contentType': 'text/html',
      'subjectURI': subjectURI
    }

    return getGraphFromData(data, options)
      .then(function (result) {
          // TODO: Should this get all or a given subject's?
          var endpoints = result.match(subjectURI, property).toArray()
          if (endpoints.length > 0) {
            return endpoints.map(function(t){ return t.object.nominalValue })
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
      if (link && link.length > 0) {
        var linkHeaders = LinkHeader.parse(link)
  // console.log(property)
  // console.log(linkHeaders)
        var uris = [];
        properties.forEach(function(property){
          if (linkHeaders.has('rel', property)) {
            uris.push(linkHeaders.rel(property)[0].uri);
          }
        });

        if (uris.length > 0) {
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

function getLinkRelationFromRDF (property, url, subjectIRI) {
  url = url || window.location.origin + window.location.pathname
  subjectIRI = subjectIRI || url

  return getResourceGraph(subjectIRI)
    .then(function (i) {
        var s = i.child(subjectIRI)

//XXX: Why is this switch needed? Use default?
        switch (property) {
          case Config.Vocab['ldpinbox']['@id']:
            if (s.ldpinbox._array.length > 0){
// console.log(s.ldpinbox._array)
              return [s.ldpinbox.at(0)]
            }
            break
          case Config.Vocab['oaannotationService']['@id']:
            if (s.oaannotationService._array.length > 0){
// console.log(s.oaannotationService._array)
              return [s.oaannotationService.at(0)]
            }
            break
          default:
            if (s[property]._array.length > 0) {
              return [s[property].at(0)]
            }
            break
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

  if (preferencesFile) {
    return getResourceGraph(preferencesFile);
  }
  else {
    return Promise.reject({});
  }
}


function getAgentPreferredPolicyRule(s) {
  var preferredPolicyRule = {};

  if (s && s.odrlprohibition && s.odrlprohibition.at(0)) {
    var prohibitionG = s.child(s.odrlprohibition.at(0));

    if (prohibitionG.odrlaction && prohibitionG.odrlaction._array.length > 0) {
      preferredPolicyRule['Prohibition'] = {};
      preferredPolicyRule['Prohibition']['Actions'] = prohibitionG.odrlaction._array;
    }
  }

  if (s && s.odrlpermission && s.odrlpermission.at(0)) {
    var permissionG = s.child(s.odrlpermission.at(0));

    if (permissionG.odrlaction && permissionG.odrlaction._array.length > 0) {
      preferredPolicyRule['Permission'] = {};
      preferredPolicyRule['Permission']['Actions'] = permissionG.odrlaction._array;
    }
  }

  return preferredPolicyRule;
}

function setPreferredPolicyInfo(g) {
  Config.User['PreferredPolicy'] = getAgentPreferredPolicy(g);
  var s = g.child(Config.User.PreferredPolicy);
  Config.User['PreferredPolicyRule'] = getAgentPreferredPolicyRule(s);
}

function getAgentSupplementalInfo(iri) {
  if (iri == Config.User.IRI) {
    return processSameAs(Config.User.Graph, getAgentSupplementalInfo);
  }
  else {
    return getResourceGraph(iri).then(
      function(g){
        if(typeof g._graph == 'undefined') {
          return Promise.resolve([]);
        }
        var s = g.child(iri);

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
                .then(function(){
                  return getAgentSeeAlso(s)
                });
      },
      function(reason){
        return Promise.resolve([]);
      });
  }
}

function getAgentSeeAlso(g, baseURI, subjectURI) {
  if (!g) { return Promise.resolve([]); }

  subjectURI = baseURI = baseURI || g.iri().toString();

  var seeAlso = g.child(baseURI).rdfsseeAlso;

  if (seeAlso && seeAlso._array.length > 0) {
    var iris = [];
    var promises = [];

    seeAlso._array.forEach(function(iri){
      if (!Config.User.SeeAlso.includes(iri)) {
        iris.push(iri)
      }
    });

    iris.forEach(function(iri){
      Config.User.SeeAlso = uniqueArray(Config.User.SeeAlso.concat(iri));
      promises.push(getResourceGraph(iri));
    });

    return Promise.allSettled(promises)
      .then(function(results) {
        var promisesGetAgentSeeAlso = [];

        results.forEach(result => {
// console.log(result)

          var g = result.value;
          var iri = g.iri().toString();

          if (g) {
            var s = g.child(subjectURI)

            var knows = getAgentKnows(s) || [];
            var liked = getAgentLiked(s) || [];
            var occupations = getAgentOccupations(s) || [];
            var publications = getAgentPublications(s) || [];
            var made = getAgentMade(s) || [];

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
                : publications;
            }

            if (made.length > 0) {
              Config.User.Made = (Config.User.Made)
                ? uniqueArray(Config.User.Made.concat(made))
                : made;
            }

            promisesGetAgentSeeAlso.push(getAgentSeeAlso(g, iri, subjectURI))
          }
        })

        return Promise.allSettled(promisesGetAgentSeeAlso)
          .then(function(results) {
            return Promise.resolve([]);
          })
      })
      .catch(function(e) {
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
      return getResourceGraph(iri).then(
        function(g){
          // if(typeof g._graph == 'undefined' || g.resource || g.cause || g.status?.startsWith(5)) {
          if(typeof g._graph == 'undefined') {
            return Promise.resolve([]);
          }

          var s = g.child(iri);

          var knows = getAgentKnows(s) || [];

          if (knows.length > 0) {
            Config.User.Knows = (Config.User.Knows)
              ? uniqueArray(Config.User.Knows.concat(knows))
              : knows;
          }

          return processSameAs(s, getUserContacts);
        }).catch(e => {
           return Promise.resolve([]);
          });
    }
  }

  return fyn(iri).then(function(i){ return Config.User.Knows || []; });
}

function getAgentTypeIndex(s) {
  //XXX: TypeRegistration forClasses of interest but for now lets store what we find without filtering.
  // const TypeRegistrationClasses = [Config.Vocab['oaAnnotation']['@id'], Config.Vocab['asAnnounce']['@id']];

  var fetchTypeRegistration = function(iri, typeIndexType) {
    return getResourceGraph(iri)
      .then(function(g){
        //XXX: https://github.com/solid/type-indexes/issues/29 for potential property to discover TypeRegistrations.
// console.log(iri, g);
        if(!g) {
          return {};
        }

        var triples = g.graph().toArray();
// console.log(triples);
        if(triples.length > 0) {
          var typeIndexes = {};
          typeIndexes[typeIndexType] = {};

          triples.forEach(function(t){
            var s = t.subject.nominalValue;
            var p = t.predicate.nominalValue;
            var o = t.object.nominalValue;

            if (p == Config.Vocab['solidforClass']['@id']) {
              typeIndexes[typeIndexType][s] = {};
              typeIndexes[typeIndexType][s][p] = o;
            }
          });

          triples.forEach(function(t){
            var s = t.subject.nominalValue;
            var p = t.predicate.nominalValue;
            var o = t.object.nominalValue;

            if(typeIndexes[typeIndexType][s]) {
              if (p == Config.Vocab['solidinstance']['@id'] ||
                  p == Config.Vocab['solidinstanceContainer']['@id']) {
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

  if (publicTypeIndex) {
    promises.push(fetchTypeRegistration(publicTypeIndex, Config.Vocab['solidpublicTypeIndex']['@id']))
  }
  if (privateTypeIndex && Config.User.OIDC) {
    promises.push(fetchTypeRegistration(privateTypeIndex, Config.Vocab['solidprivateTypeIndex']['@id']))
  }

  return Promise.allSettled(promises)
    .then(function(results) {
      results.filter(result => !(result instanceof Error));

      var typeIndexes = {};

      results.forEach(function(result) {
        Object.assign(typeIndexes, result.value);
      });

      return typeIndexes;
    });
}

function processSameAs(s, callback) {
  if (s.owlsameAs && s.owlsameAs._array.length > 0){
    var iris = s.owlsameAs._array;
    var promises = [];
    iris.forEach(function(iri){
// console.log(iri);
      if(iri != Config.User.IRI && Config.User.SameAs.indexOf(iri) < 0) {
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
      .then(function(results) {
        return Promise.resolve([]);
      })
      .catch(function(e) {
        return Promise.resolve([]);
      });
  }
  else {
    return Promise.resolve([]);
  }
}

function getAgentPreferredProxy (s) {
  return s.out(ns.solid.preferredProxy).value || undefined
}

function getAgentPreferredPolicy (s) {
  return s.out(ns.solid.preferredPolicy).value || undefined
}

function getAgentName (s) {
  var name = s.out(ns.foaf.name).value || s.out(ns.schema.name).value || s.out(ns.vcard.fn).value || s.out(ns.as.name).value || s.out(ns.rdfs.label).value || undefined
  if (typeof name === 'undefined') {
    if (s.out(ns.schema.familyName).value && s.out(ns.schema.familyName).value.length > 0 && s.out(ns.schema.givenName).value && s.out(ns.schema.givenName).value.length > 0) {
      name = s.out(ns.schema.givenName).value + ' ' + s.out(ns.schema.familyName).value
    } else if (s.out(ns.foaf.familyName).value && s.out(ns.foaf.familyName).value.length > 0 && s.out(ns.foaf.givenName).value && s.out(ns.foaf.givenName).value.length > 0) {
      name = s.out(ns.foaf.givenName).value + ' ' + s.out(ns.foaf.familyName).value
    } else if (s.out(ns.vcard.familyname).value && s.out(ns.vcard.familyname).value.length > 0 && s.out(ns.vcard.givenname).value && s.out(ns.vcard.givenname).value.length > 0) {
      name = s.out(ns.vcard.givenname).value + ' ' + s.out(ns.vcard.familyname).value
    } else if (s.out(ns.foaf.nick).value && s.out(ns.foaf.nick).value.length > 0) {
      name = s.out(ns.foaf.nick).value
    } else if (s.out(ns.vcard.nickname).value && s.out(ns.vcard.nickname).value.length > 0) {
      name = s.out(ns.vcard.nickname).value
    }
  }
  return name === undefined ? undefined : DOMPurify.sanitize(name)
}

function getAgentURL (s) {
  return s.out(ns.foaf.homepage).value || s.out(ns.foaf.weblog).value || s.out(ns.schema.url).value || s.out(ns.vcard.url).value || undefined
}

function getAgentDelegates (s) {
  var d = s.out(ns.acl.delegates).values;
  return d.length ? d : undefined;;
}

function getAgentStorage (s) {
  var d = s.out(ns.pim.storage).values;
  return d.length ? d : undefined;;
}

function getAgentOutbox (s) {
  var d = s.out(ns.as.outbox).values;
  return d.length ? d : undefined;;
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

  if (foafknows.length > 0){
    knows = knows.concat(foafknows);
  }

  if (schemaknows.length > 0){
    knows = knows.concat(schemaknows);
  }

  knows = uniqueArray(knows);

  return (knows.length > 0) ? knows : undefined;
}

function getAgentFollowing (s) {
  var following = [];
// console.log(s.asfollowing)
  if (s.asfollowing) {
    var options = {
      headers: {'Accept': 'application/ld+json; profile="https://www.w3.org/ns/activitystreams", application/activity+json, text/turtle'},
      noCredentials: true
    };
    return DO.U.getItemsList(s.asfollowing, options).then(following => {
      following = uniqueArray(following);
// console.log(following);
      return (following.length > 0) ? following : undefined;
    });
  }
}

function getAgentPublicTypeIndex (s) {
  var d = s.out(ns.solid.publicTypeIndex.values);
  return d.length ? d : undefined;
}

function getAgentPrivateTypeIndex (s) {
  var d = s.out(ns.solid.privateTypeIndex.values);
  return d.length ? d : undefined;
}

function getAgentPreferencesFile (s) {
  var d = s.out(ns.pim.preferencesFile.values);
  return d.length ? d : undefined;
}

function getAgentLiked (s) {
  var d = s.out(ns.as.liked.values);
  return d.length ? d : undefined;
}

function getAgentOccupations (s) {
  var d = s.out(ns.schema.hasOccupation.values);
  return d.length ? d : undefined;
}

function getGraphAudience (s) {
  var d = s.out(ns.schema.audience.values);
  return d.length ? d : undefined;
}

function getAgentPublications (s) {
  var d = s.out(ns.foaf.publications.values);
  return d.length ? d : undefined;
}

function getAgentMade (s) {
  var d = s.out(ns.foaf.made).values;
  return d.length ? d : undefined;
}

function getGraphImage (s) {
  if (s.asimage || s.asicon) {
    var image = s.asimage || s.asicon;
    s._graph.some(function(t){
      if(t.predicate.nominalValue == Config.Vocab['asurl']['@id'] || t.predicate.nominalValue == Config.Vocab['ashref']['@id']) {
        if (t.subject.nominalValue == s.asicon || "_:" + t.subject.nominalValue == s.asicon) {
          image = t.object.nominalValue;
          return true;
        }
        else if (t.subject.nominalValue == s.asimage || "_:" + t.subject.nominalValue == s.asimage) {
          image = t.object.nominalValue;
          return true;
        }
        return false;
      }
    });
    return image;
  }
  else {
    return s.foafimg || s.schemaimage || s.vcardphoto || s.vcardhasPhoto || s.siocavatar || s.foafdepiction || undefined
  }
}

function getGraphEmail(s) {
  var email = s.out(ns.schema.email).values;
  var mbox = s.out(ns.foaf.mbox).values;
  var d =
    email.length > 0 ? email[0].value :
    mbox.length > 0 ? mbox[0].value :
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
  var d = s.out(ns.schema.datePublished).value || s.out(ns.as.published).value || s.out(ns.dcterms.issued).value || s.out(ns.dcterms.date).value || s.out(ns.prov.generatedAtTime).value || undefined;
  return d === undefined ? undefined : DOMPurify.sanitize(d)
}

function getGraphUpdated(s) {
  var d = s.out(ns.schema.dateModified).value || s.out(ns.as.updated).value || s.out(ns.dcterms.modified).value || s.out(ns.dcterms.date).value || s.out(ns.prov.generatedAtTime).value || undefined;
  return d === undefined ? undefined : DOMPurify.sanitize(d)
}

function getGraphCreated(s) {
  var d = s.out(ns.schema.dateCreated).value || s.out(ns.dcterms.created).value || s.out(ns.dcterms.date).value || s.out(ns.prov.generatedAtTime).value || undefined;
  return d === undefined ? undefined : DOMPurify.sanitize(d)
}

function getGraphLanguage(s) {
  return s.out(ns.dcterms.language).value || s.out(ns.dcelements.language).value || s.out(ns.schema.inLanguage).value || undefined;
}

function getGraphLicense(s) {
  return s.out(ns.dcterms.license).value || s.out(ns.schema.license).value || s.out(ns.cc.license).value || s.out(ns.xhv.license).value || undefined;
}

function getGraphRights(s) {
  return s.out(ns.dcterms.rights).value || getGraphLicense(s) || undefined;
}

function getGraphLabel(s) {
  var d = s.out(ns.schema.name).value || s.out(ns.dcterms.title).value || s.out(ns.dcelements.title).value || getAgentName(s) || s.out(ns.as.summary).value || undefined;
  return d === undefined ? undefined : DOMPurify.sanitize(d)
}

function getGraphTitle(s) {
  var d = s.out(ns.schema.name).value || s.out(ns.dcterms.title).value || s.out(ns.dcelements.title).value || s.out(ns.as.name).value || undefined;
  return d === undefined ? undefined : DOMPurify.sanitize(d)
}

function getGraphLabelOrIRI(s) {
  return getGraphLabel(s) || s.in().trim().value;
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

function getGraphConceptLabel(g, options) {
  var labels = {
    prefLabel: [],
    xlprefLabel: [],
    altLabel: [],
    xlaltLabel: [],
    notation: []
  };
  options = options || {};
  options['subjectURI'] = options['subjectURI'] || g.iri().toString();
  options['lang'] = options['lang'] || 'en';

  //FIXME: Using this approach temporarily that is tied to SimpleRDF for convenience until it is replaced. It is fugly but it works. Make it better!

  var triples = g._graph

  triples.forEach(function(t){
// console.log(t)
    var s = t.subject.nominalValue;
    var p = t.predicate.nominalValue;
    var o = t.object.nominalValue;

    if (s == options['subjectURI']){
      if (p == Config.Vocab['skosprefLabel']['@id'] && (t.object.language && (t.object.language == '' || t.object.language.toLowerCase().startsWith(options['lang'])))) {
        labels.prefLabel.push(o);
      }
      else if (p == Config.Vocab['skosxlprefLabel']['@id']) {
        g.child(o)._graph.forEach(function(oT){
          var oS = oT.subject.nominalValue;
          var oP = oT.predicate.nominalValue;
          var oO = oT.object.nominalValue;

          if (oS == o && oP == Config.Vocab['skosxlliteralForm']['@id'] && (oT.object.language && (oT.object.language == '' || oT.object.language.toLowerCase().startsWith(options['lang'])))) {
            labels.xlprefLabel.push(oO);
          }
        })
      }
      else if (p == Config.Vocab['skosaltLabel']['@id'] && (t.object.language && (t.object.language == '' || t.object.language.toLowerCase().startsWith(options['lang'])))) {
        labels.altLabel.push(o);
      }
      else if (p == Config.Vocab['skosxlaltLabel']['@id']) {
        g.child(o)._graph.forEach(function(oT){
          var oS = oT.subject.nominalValue;
          var oP = oT.predicate.nominalValue;
          var oO = oT.object.nominalValue;

          if (oS == o && oP == Config.Vocab['skosxlliteralForm']['@id'] && (oT.object.language && (oT.object.language == '' || oT.object.language.toLowerCase().startsWith(options['lang'])))) {
            labels.xlaltLabel.push(oO);
          }
        })
      }
      else if (p == Config.Vocab['skosnotation']['@id']) {
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

  g.toArray().sort(function (a, b) {
    return a[options.sortBy].nominalValue
      .toLowerCase()
      .localeCompare(b[options.sortBy].nominalValue.toLowerCase());
  });

  return g;
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
  return getLinkRelationFromHead('acl', iri).then(
    function(i) {
      if (i.length > 0) {
        var aR = i[0];

        var aclResource = getAbsoluteIRI(baseURL, aR);
// console.log(aclResource)

        Config.Resource[iri]['acl']['defaultACLResource'] = Config.Resource[iri]['acl']['defaultACLResource'] || aclResource;

        return getResourceGraph(aclResource)
          .then(function(g){
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
// console.log(g)

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

// console.log("getAuthorizationsMatching:", g, matchers);

  var subjects = [];
  g.graph().toArray().forEach(function(t){
    subjects.push(t.subject.nominalValue);
  });
  subjects = uniqueArray(subjects);

  subjects.forEach(i => {
    var s = g.child(i);

    if (s.rdftype._array.includes(Config.Vocab['aclAuthorization']['@id'])) {
      var authorizationIRI = s.iri().toString();
      var candidateAuthorization = {};

      Object.keys(matchers).forEach(key => {
        if (s['acl' + key]._array.includes(matchers[key])) {
          candidateAuthorization[key] = matchers[key];
        }
      })

      var allKeysMatched = Object.keys(matchers).every(key => Object.keys(candidateAuthorization).includes(key));

      if (allKeysMatched) {
        var properties = ['agent', 'agentClass', 'agentGroup', 'accessTo', 'default', 'mode', 'origin'];
        var authorization = {};
        properties.forEach(p => {
          authorization[p] = s['acl' + p]._array;
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
  stringToStream,
  getRDFParser
}