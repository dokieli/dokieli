const WebExtension = (typeof browser !== 'undefined') ? browser : chrome;

var C = {
  'Loaded': false,
  'WebID': null
}

WebExtension.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  var initialized = (DO !== undefined && DO.U !== undefined && C.Loaded);

  try {
    // if (request.action == "dokieli.getUser") {
    //   sendResponse(DO.C.User);
    // }
    // if (request.action == "dokieli.generateUUID") {
    //   sendResponse(DO.U.generateUUID());
    // }
    // else
    if (request.action == "dokieli.status") {
      sendResponse({"dokieli": initialized});
    }
    else if (request.action == "dokieli.showDocumentMenu") {
      var iri = null;

      if (!C.Loaded && !document.querySelector('#document-menu')) {
        var attributes = {
          "about": "",
          "prefix": "rdf: http://www.w3.org/1999/02/22-rdf-syntax-ns# rdfs: http://www.w3.org/2000/01/rdf-schema# owl: http://www.w3.org/2002/07/owl# xsd: http://www.w3.org/2001/XMLSchema# rdfa: http://www.w3.org/ns/rdfa# dcterms: http://purl.org/dc/terms/ dctypes: http://purl.org/dc/dcmitype/ foaf: http://xmlns.com/foaf/0.1/ pimspace: http://www.w3.org/ns/pim/space# skos: http://www.w3.org/2004/02/skos/core# prov: http://www.w3.org/ns/prov# mem: http://mementoweb.org/ns# qb: http://purl.org/linked-data/cube# schema: http://schema.org/ void: http://rdfs.org/ns/void# rsa: http://www.w3.org/ns/auth/rsa# cert: http://www.w3.org/ns/auth/cert# wgs: http://www.w3.org/2003/01/geo/wgs84_pos# bibo: http://purl.org/ontology/bibo/ sioc: http://rdfs.org/sioc/ns# doap: http://usefulinc.com/ns/doap# dbr: http://dbpedia.org/resource/ dbp: http://dbpedia.org/property/ sio: http://semanticscience.org/resource/ opmw: http://www.opmw.org/ontology/ deo: http://purl.org/spar/deo/ doco: http://purl.org/spar/doco/ cito: http://purl.org/spar/cito/ fabio: http://purl.org/spar/fabio/ oa: http://www.w3.org/ns/oa# as: https://www.w3.org/ns/activitystreams# ldp: http://www.w3.org/ns/ldp# solid: http://www.w3.org/ns/solid/terms# acl: http://www.w3.org/ns/auth/acl# odrl: http://www.w3.org/ns/odrl/2/ dio: https://w3id.org/dio# earl: http://www.w3.org/ns/earl# spec: http://www.w3.org/ns/spec# rel: https://www.w3.org/ns/iana/link-relations/relation#",
          "typeof": "schema:CreativeWork"
        }

        var rootNode = DO.U.getContentNode(document);

        var existingAttributes = Array.from(rootNode.attributes).map(attr => attr.name);

        Object.keys(attributes).forEach(function(attribute) {
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
          iri = w.id;
        }
        catch(e) {
          console.log("dokieli: request.webid may be malformed: " + e);
        }
      }

      if (iri && (C.WebID == null || C.WebID != iri)) {

        //auth.submitSignIn(iri);
        DO.C.User.WebIdDelegate = iri;

        C.WebID = iri;
      }

      window.setTimeout(function () {
        DO.U.showDocumentMenu();
      }, 50);
    }
    else {
      sendResponse({}); /* stop */
    }
  }
  catch(e) {
    console.log("dokieli: runtime.onMessage.addListener: " + e);
  }
});
