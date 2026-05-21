const WebExtension = (typeof browser !== 'undefined') ? browser : chrome;

var C = {
  'Loaded': false,
  'WebID': null
}

function isDokieliReady() {
  return typeof DO !== 'undefined' && DO.U !== undefined && C.Loaded;
}

WebExtension.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  try {
    if (request.action === 'dokieli.status') {
      var ready = isDokieliReady();
      sendResponse({
        loaded: ready,
        editMode: ready ? (DO.C.EditorEnabled || false) : false,
        user: ready && DO.C.User.IRI ? { iri: DO.C.User.IRI } : null
      });
    }
    else if (request.action === 'dokieli.showDocumentMenu') {
      if (!C.Loaded && !document.querySelector('#document-menu')) {
        DO.C.HideInPageMenu = true;
        var attributes = {
          'about': '',
          'prefix': 'rdf: http://www.w3.org/1999/02/22-rdf-syntax-ns# rdfs: http://www.w3.org/2000/01/rdf-schema# owl: http://www.w3.org/2002/07/owl# xsd: http://www.w3.org/2001/XMLSchema# rdfa: http://www.w3.org/ns/rdfa# dcterms: http://purl.org/dc/terms/ dctypes: http://purl.org/dc/dcmitype/ foaf: http://xmlns.com/foaf/0.1/ pimspace: http://www.w3.org/ns/pim/space# skos: http://www.w3.org/2004/02/skos/core# prov: http://www.w3.org/ns/prov# mem: http://mementoweb.org/ns# qb: http://purl.org/linked-data/cube# schema: http://schema.org/ void: http://rdfs.org/ns/void# rsa: http://www.w3.org/ns/auth/rsa# cert: http://www.w3.org/ns/auth/cert# wgs: http://www.w3.org/2003/01/geo/wgs84_pos# bibo: http://purl.org/ontology/bibo/ sioc: http://rdfs.org/sioc/ns# doap: http://usefulinc.com/ns/doap# dbr: http://dbpedia.org/resource/ dbp: http://dbpedia.org/property/ sio: http://semanticscience.org/resource/ opmw: http://www.opmw.org/ontology/ deo: http://purl.org/spar/deo/ doco: http://purl.org/spar/doco/ cito: http://purl.org/spar/cito/ fabio: http://purl.org/spar/fabio/ oa: http://www.w3.org/ns/oa# as: https://www.w3.org/ns/activitystreams# ldp: http://www.w3.org/ns/ldp# solid: http://www.w3.org/ns/solid/terms# acl: http://www.w3.org/ns/auth/acl# odrl: http://www.w3.org/ns/odrl/2/ dio: https://w3id.org/dio# earl: http://www.w3.org/ns/earl# spec: http://www.w3.org/ns/spec# rel: https://www.w3.org/ns/iana/link-relations/relation#',
          'typeof': 'schema:CreativeWork'
        };

        var rootNode = DO.U.getContentNode(document);
        var existingAttributes = Array.from(rootNode.attributes).map(attr => attr.name);

        Object.keys(attributes).forEach(function (attribute) {
          if (!existingAttributes.includes(attribute)) {
            rootNode.setAttribute(attribute, attributes[attribute]);
          }
        });

        DO.U.load();
        C.Loaded = true;
      }

      if (request.webid) {
        try {
          var w = JSON.parse(request.webid);
          var iri = w.id;
          if (iri && C.WebID !== iri) {
            DO.C.User.WebIdDelegate = iri;
            C.WebID = iri;
          }
        } catch (e) {
          console.log('dokieli: request.webid may be malformed: ' + e);
        }
      }

      window.setTimeout(function () {
        DO.U.showDocumentMenu();
      }, 50);

      sendResponse({ loaded: true });
    }
    else if (request.action === 'dokieli.menuClick') {
      if (typeof DO === 'undefined' || !DO.U || !request.className) {
        sendResponse({ ok: false });
        return;
      }
      try { DO.U.menuClick(request.className); } catch (e) { console.log('dokieli: menuClick failed: ' + e); }
      sendResponse({ ok: true });
    }
    else if (request.action === 'dokieli.updateLanguage') {
      if (typeof DO === 'undefined' || !DO.U || !request.lang) {
        sendResponse({ ok: false });
        return;
      }
      try { DO.U.updateUILanguage(request.lang); } catch (e) { console.log('dokieli: updateLanguage failed: ' + e); }
      sendResponse({ ok: true });
    }
    else if (request.action === 'dokieli.activate') {
      if (typeof DO === 'undefined' || !DO.U) {
        sendResponse({ error: 'dokieli not loaded' });
        return;
      }

      if (C.Loaded) {
        sendResponse({ ok: true, alreadyLoaded: true });
        return;
      }

      DO.C.HideInPageMenu = true;

      var attributes = {
        'about': '',
        'prefix': 'rdf: http://www.w3.org/1999/02/22-rdf-syntax-ns# rdfs: http://www.w3.org/2000/01/rdf-schema# owl: http://www.w3.org/2002/07/owl# xsd: http://www.w3.org/2001/XMLSchema# rdfa: http://www.w3.org/ns/rdfa# dcterms: http://purl.org/dc/terms/ dctypes: http://purl.org/dc/dcmitype/ foaf: http://xmlns.com/foaf/0.1/ pimspace: http://www.w3.org/ns/pim/space# skos: http://www.w3.org/2004/02/skos/core# prov: http://www.w3.org/ns/prov# mem: http://mementoweb.org/ns# qb: http://purl.org/linked-data/cube# schema: http://schema.org/ void: http://rdfs.org/ns/void# rsa: http://www.w3.org/ns/auth/rsa# cert: http://www.w3.org/ns/auth/cert# wgs: http://www.w3.org/2003/01/geo/wgs84_pos# bibo: http://purl.org/ontology/bibo/ sioc: http://rdfs.org/sioc/ns# doap: http://usefulinc.com/ns/doap# dbr: http://dbpedia.org/resource/ dbp: http://dbpedia.org/property/ sio: http://semanticscience.org/resource/ opmw: http://www.opmw.org/ontology/ deo: http://purl.org/spar/deo/ doco: http://purl.org/spar/doco/ cito: http://purl.org/spar/cito/ fabio: http://purl.org/spar/fabio/ oa: http://www.w3.org/ns/oa# as: https://www.w3.org/ns/activitystreams# ldp: http://www.w3.org/ns/ldp# solid: http://www.w3.org/ns/solid/terms# acl: http://www.w3.org/ns/auth/acl# odrl: http://www.w3.org/ns/odrl/2/ dio: https://w3id.org/dio# earl: http://www.w3.org/ns/earl# spec: http://www.w3.org/ns/spec# rel: https://www.w3.org/ns/iana/link-relations/relation#',
        'typeof': 'schema:CreativeWork'
      };

      var rootNode = DO.U.getContentNode(document);
      var existingAttributes = Array.from(rootNode.attributes).map(attr => attr.name);
      Object.keys(attributes).forEach(function (attribute) {
        if (!existingAttributes.includes(attribute)) {
          rootNode.setAttribute(attribute, attributes[attribute]);
        }
      });

      document.addEventListener('dokieli:ready', function () {
        try {
          if (DO.C && DO.C.Editor && typeof DO.C.Editor.toggleEditor === 'function') {
            DO.C.Editor.toggleEditor('social');
          }
        } catch (e) {
          console.log('dokieli: activate toggleEditor failed: ' + e);
        }
      }, { once: true });

      DO.U.load();
      C.Loaded = true;

      sendResponse({ ok: true });
    }
    else if (request.action === 'dokieli.showSignin') {
      if (typeof DO === 'undefined' || !DO.U) {
        sendResponse({ error: 'dokieli not loaded' });
        return;
      }

      var showDialog = function () {
        try { DO.U.showUserIdentityInput(); }
        catch (e) { console.log('dokieli: showSignin failed: ' + e); }
      };

      if (DO.C && DO.C.Button && DO.C.Button.Info && DO.C.Button.Info.SignIn) {
        showDialog();
      } else {
        document.addEventListener('dokieli:ready', showDialog, { once: true });

        if (!C.Loaded) {
          DO.C.HideInPageMenu = true;
          var attributes = {
            'about': '',
            'prefix': 'rdf: http://www.w3.org/1999/02/22-rdf-syntax-ns# rdfs: http://www.w3.org/2000/01/rdf-schema# owl: http://www.w3.org/2002/07/owl# xsd: http://www.w3.org/2001/XMLSchema# rdfa: http://www.w3.org/ns/rdfa# dcterms: http://purl.org/dc/terms/ dctypes: http://purl.org/dc/dcmitype/ foaf: http://xmlns.com/foaf/0.1/ pimspace: http://www.w3.org/ns/pim/space# skos: http://www.w3.org/2004/02/skos/core# prov: http://www.w3.org/ns/prov# mem: http://mementoweb.org/ns# qb: http://purl.org/linked-data/cube# schema: http://schema.org/ void: http://rdfs.org/ns/void# rsa: http://www.w3.org/ns/auth/rsa# cert: http://www.w3.org/ns/auth/cert# wgs: http://www.w3.org/2003/01/geo/wgs84_pos# bibo: http://purl.org/ontology/bibo/ sioc: http://rdfs.org/sioc/ns# doap: http://usefulinc.com/ns/doap# dbr: http://dbpedia.org/resource/ dbp: http://dbpedia.org/property/ sio: http://semanticscience.org/resource/ opmw: http://www.opmw.org/ontology/ deo: http://purl.org/spar/deo/ doco: http://purl.org/spar/doco/ cito: http://purl.org/spar/cito/ fabio: http://purl.org/spar/fabio/ oa: http://www.w3.org/ns/oa# as: https://www.w3.org/ns/activitystreams# ldp: http://www.w3.org/ns/ldp# solid: http://www.w3.org/ns/solid/terms# acl: http://www.w3.org/ns/auth/acl# odrl: http://www.w3.org/ns/odrl/2/ dio: https://w3id.org/dio# earl: http://www.w3.org/ns/earl# spec: http://www.w3.org/ns/spec# rel: https://www.w3.org/ns/iana/link-relations/relation#',
            'typeof': 'schema:CreativeWork'
          };

          var rootNode = DO.U.getContentNode(document);
          var existingAttributes = Array.from(rootNode.attributes).map(attr => attr.name);
          Object.keys(attributes).forEach(function (attribute) {
            if (!existingAttributes.includes(attribute)) {
              rootNode.setAttribute(attribute, attributes[attribute]);
            }
          });

          DO.U.load();
          C.Loaded = true;
        }
      }

      sendResponse({ ok: true });
    }
    else {
      sendResponse({});
    }
  } catch (e) {
    console.log('dokieli: runtime.onMessage: ' + e);
    sendResponse({});
  }
});
