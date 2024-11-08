/** dokieli
 *
 * Sarven Capadisli <info@csarven.ca> https://csarven.ca/#i
 * http://www.apache.org/licenses/LICENSE-2.0.html Apache License, Version 2.0
 * https://dokie.li/
 * https://github.com/dokieli/dokieli
 */

import { getResource, setAcceptRDFTypes, postResource, putResource, currentLocation, patchResourceGraph, patchResourceWithAcceptPatch, putResourceWithAcceptPut, copyResource, deleteResource } from './fetcher.js'
import { getDocument, getDocumentContentNode, escapeCharacters, showActionMessage, selectArticleNode, buttonClose, notificationsToggle, showRobustLinksDecoration, getResourceInfo, getResourceSupplementalInfo, removeNodesWithIds, getResourceInfoSKOS, removeReferences, buildReferences, removeSelectorFromNode, insertDocumentLevelHTML, getResourceInfoSpecRequirements, getTestDescriptionReviewStatusHTML, createFeedXML, getButtonDisabledHTML, showTimeMap, createMutableResource, createImmutableResource, updateMutableResource, createHTML, getResourceImageHTML, setDocumentRelation, setDate, getClosestSectionNode, getAgentHTML, setEditSelections, getNodeLanguage, createActivityHTML, createLanguageHTML, createLicenseHTML, createRightsHTML, getAnnotationInboxLocationHTML, getAnnotationLocationHTML, getResourceTypeOptionsHTML, getPublicationStatusOptionsHTML, getLanguageOptionsHTML, getLicenseOptionsHTML, getCitationOptionsHTML, getDocumentNodeFromString, getNodeWithoutClasses, getDoctype, setCopyToClipboard, addMessageToLog, updateDocumentDoButtonStates, updateFeatureStatesOfResourceInfo, accessModeAllowed, getAccessModeOptionsHTML, focusNote, handleDeleteNote } from './doc.js'
import { getProxyableIRI, getPathURL, stripFragmentFromString, getFragmentOrLastPath, getFragmentFromString, getURLLastPath, getLastPathSegment, forceTrailingSlash, getBaseURL, getParentURLPath, encodeString, getAbsoluteIRI, generateDataURI, getMediaTypeURIs, getPrefixedNameFromIRI } from './uri.js'
import { getResourceGraph, getResourceOnlyRDF, traverseRDFList, getLinkRelation, getAgentName, getGraphImage, getGraphFromData, isActorType, isActorProperty, serializeGraph, getGraphLabel, getGraphLabelOrIRI, getGraphConceptLabel, getUserContacts, getAgentOutbox, getAgentStorage, getAgentInbox, getLinkRelationFromHead, sortGraphTriples, getACLResourceGraph, getAccessSubjects, getAuthorizationsMatching, getGraphRights, getGraphLicense, getGraphLanguage, getGraph, getGraphDate } from './graph.js'
import { notifyInbox, sendNotifications, postActivity } from './inbox.js'
import { uniqueArray, fragmentFromString, hashCode, generateAttributeId, escapeRegExp, sortToLower, getDateTimeISO, getDateTimeISOFromMDY, generateUUID, matchAllIndex, isValidISBN, findPreviousDateTime } from './util.js'
import { generateGeoView } from './geo.js'
import MediumEditor from "medium-editor/dist/js/medium-editor.js";
// window.MediumEditor = MediumEditor;
import MediumEditorTable from "medium-editor-tables/dist/js/medium-editor-tables.js";
// window.MediumEditorTable = MediumEditorTable;
import { getLocalStorageProfile, showAutoSaveStorage, hideAutoSaveStorage, updateLocalStorageProfile } from './storage.js'
import { showUserSigninSignout, showUserIdentityInput, setContactInfo, getSubjectInfo } from './auth.js'
import { Icon, createRDFaHTML } from './template.js'
import * as d3Selection from 'd3-selection';
import * as d3Force from 'd3-force';
const d3 = { ...d3Selection, ...d3Force };
import shower from 'shower'
import { diffChars } from 'diff'
import { micromark as marked } from 'micromark'
import { gfm, gfmHtml } from 'micromark-extension-gfm'
import { gfmTagfilterHtml } from 'micromark-extension-gfm-tagfilter'
import LinkHeader from 'http-link-header';
import * as DOMPurify from 'dompurify';
import * as ld from './simplerdf.cjs'
import Config from './config.js';

let DO;

if(typeof window.DO === 'undefined'){
const SimpleRDF = ld.SimpleRDF
DO = {
  C: Config,

  U: {
    getItemsList: function(url, options) {
      url = url || window.location.origin + window.location.pathname;
      options = options || {};
      options['resourceItems'] = options.resourceItems || [];
      options['headers'] = options.headers || {};
      options['excludeMarkup'] = true;

      DO.C['CollectionItems'] = DO.C['CollectionItems'] || {};
      DO.C['CollectionPages'] = ('CollectionPages' in DO.C && DO.C.CollectionPages.length > 0) ? DO.C.CollectionPages : [];
      DO.C['Collections'] = ('Collections' in DO.C && DO.C.Collections.length > 0) ? DO.C.Collections : [];

      const mediaTypeURIPrefix = "http://www.w3.org/ns/iana/media-types/";
      //TODO: Move this elsewhere (call from DO.C.init()?) where it runs once and stores it in e.g, DO.C.MediaTypeURIs
      var mediaTypeURIs = getMediaTypeURIs(DO.C.MediaTypes.RDF);

      // if (DO.C.Notification[url]) {
      //   return Promise.resolve([]);
      // }

      return getResourceGraph(url, options.headers, options)
        .then(
          function(g) {
            if (!g || g.resource) return [];

            var s = g.child(url);
// console.log(s.toString());

            var types = s.rdftype;
            if (types.indexOf(DO.C.Vocab['ldpContainer']["@id"]) > -1 ||
               types.indexOf(DO.C.Vocab['asCollection']["@id"]) > -1 ||
               types.indexOf(DO.C.Vocab['asOrderedCollection']["@id"]) > -1) {
              DO.C.Collections.push(url);
            }

            if (types.indexOf(DO.C.Vocab['ldpContainer']["@id"]) < 0 &&
               types.indexOf(DO.C.Vocab['asCollection']["@id"]) < 0 &&
               types.indexOf(DO.C.Vocab['asOrderedCollection']["@id"]) < 0) {
              DO.C.CollectionPages.push(url);
            }

            var items = [s.asitems, s.asorderedItems, s.ldpcontains];
            Object.keys(items).forEach(function(i) {
              items[i].forEach(function(resource){
// console.log(resource)

                var r = s.child(resource);

                if (r.rdffirst || r.rdfrest) {
                  options.resourceItems = options.resourceItems.concat(traverseRDFList(s, resource));
                }
                else {
                  //FIXME: This may need to be processed outside of items? See also comment above about processing Collection and CollectionPages.
                  var types = r.rdftype._array || [];
                  //Include only non-container/collection and items that's not from an RDFList
                  if (types.indexOf(DO.C.Vocab['ldpContainer']["@id"]) < 0 &&
                     types.indexOf(DO.C.Vocab['asCollection']["@id"]) < 0 &&
                     types.indexOf(DO.C.Vocab['asCollectionPage']["@id"]) < 0 &&
                     types.indexOf(DO.C.Vocab['asOrderedCollection']["@id"]) < 0 &&
                     types.indexOf(DO.C.Vocab['asOrderedCollectionPage']["@id"]) < 0) {
                    //XXX: The following is not used at the moment:
                    // DO.C.CollectionItems[resource] = s;

                    const hasPrefix = types.some(url => url.startsWith(mediaTypeURIPrefix));
                    const mediaTypeFound = hasPrefix && types.some(item => mediaTypeURIs.includes(item));
                    
                    if (mediaTypeFound || !hasPrefix) {
                      options.resourceItems.push(resource);
                    }
                  }
                }
              });
            });

            if (s.asfirst && DO.C.CollectionPages.indexOf(s.asfirst) < 0) {
              return DO.U.getItemsList(s.asfirst, options);
            }
            else if (s.asnext && DO.C.CollectionPages.indexOf(s.asnext) < 0) {
              return DO.U.getItemsList(s.asnext, options);
            }
            else {
              return uniqueArray(options.resourceItems);
            }
          })
        .catch (e => {
          console.log(e)
          return [];
        })
    },


    getNotifications: function(url) {
      url = url || window.location.origin + window.location.pathname;
      var notifications = [];

      DO.C.Inbox[url] = {};
      DO.C.Inbox[url]['Notifications'] = [];

      return getResourceGraph(url)
        .then(
          function(i) {
            DO.C.Inbox[url]['Graph'] = i;

            var s = i.child(url);
            s.ldpcontains.forEach(function(resource) {
// console.log(resource);
              var types = s.child(resource).rdftype;
// console.log(types);
              if(types.indexOf(DO.C.Vocab['ldpContainer']["@id"]) < 0) {
                notifications.push(resource);
              }
            });
// console.log(notifications);
            if (notifications.length > 0) {
              DO.C.Inbox[url]['Notifications'] = notifications;
              return notifications;
            }
            else {
              var reason = {"message": "There are no notifications."};
              return Promise.reject(reason);
            }
          },
          function(reason) {
// console.log(reason);
            return reason;
          }
        );
    },

    showInboxNotifications: function() {
      getLinkRelation(DO.C.Vocab['ldpinbox']['@id'], null, DO.C.DocumentString).then(
        function(i) {
          i.forEach(function(inboxURL) {
            if (!DO.C.Inbox[inboxURL]) {
              DO.U.showNotificationSources(inboxURL);
            }
          });
        },
        function(reason) {
// console.log(reason);
        }
      );
    },

    showNotificationSources: function(url) {
      DO.U.getNotifications(url).then(
        function(notifications) {
          notifications.forEach(function(notification) {
            DO.U.showActivities(notification, { notification: true });
           });
        },
        function(reason) {
          console.log('No notifications');
          return reason;
        }
      );
    },

    showContactsActivities: function() {
      var aside = document.querySelector('#document-notifications');

      var showProgress = function(){

        var info = aside.querySelector('div.info');
        info.replaceChildren();

        var progress =  fragmentFromString(`<span class="progress">${Icon[".fas.fa-circle-notch.fa-spin.fa-fw"]} Checking activities</span>`);

        info.appendChild(progress);
      }

      var removeProgress = function() {
        var info = aside.querySelector('div.info');
        info.replaceChildren();
        DO.U.initializeButtonMore(aside);
      }

      var promises = [];
      promises.push(...DO.U.processAgentActivities(DO.C.User));
      Promise.allSettled(promises).then((r) => removeProgress())

      if (DO.C.User.Contacts && Object.keys(DO.C.User.Contacts).length > 0){
        showProgress();

        Object.keys(DO.C.User.Contacts).forEach(function(iri){
          var contact = DO.C.User.Contacts[iri];
          if (!contact.IRI) return;

          promises.push(...DO.U.processAgentActivities(contact));
        });

       Promise.allSettled(promises).then(() => removeProgress())
      }
      else if (DO.C.User.IRI) {
        showProgress();

        getUserContacts(DO.C.User.IRI)
          .then(contacts => {
            if (contacts.length > 0) {
              const contactsPromises = contacts.map(function(url) {
                return getSubjectInfo(url).then(subject => {
                  if (subject.Graph) {
                    DO.C.User.Contacts[url] = subject;

                    promises.push(...DO.U.processAgentActivities(DO.C.User.Contacts[url]));
                  }
                  return DO.U.processAgentActivities(DO.C.User.Contacts[url]);
                })
              });
              promises.push(...contactsPromises);

            }
          })
          .then(() => {
            // FIXME: this is triggered prematurely - review why contact's promises are being resolved before the user's
            Promise.allSettled(promises).then(() => {
              removeProgress()
            })
          })
          .catch((e) => {
            removeProgress()
          })

      }
      else {
        // Promise.allSettled(promises).then(() => removeProgress())
      }

    },

    processAgentActivities: function(agent) {
      if (agent.TypeIndex && Object.keys(agent.TypeIndex).length) {
        // console.log(agent.IRI, agent.TypeIndex)
        // console.log(DO.U.processAgentTypeIndex(agent))
        return DO.U.processAgentTypeIndex(agent);
      }

      return [Promise.resolve()];

      //TODO: Need proper filtering of storage/outbox matching an object of interest
      // else {
      //   return DO.U.processAgentStorageOutbox(agent)
      // }
    },

    processAgentTypeIndex: function(agent) {
      var promises = [];
      var documentTypes = DO.C.ActivitiesObjectTypes.concat(Object.keys(DO.C.ResourceType));

      var publicTypeIndexes = agent.TypeIndex[DO.C.Vocab['solidpublicTypeIndex']['@id']] || {};
      var privateTypeIndexes = agent.TypeIndex[DO.C.Vocab['solidprivateTypeIndex']['@id']] || {};
      //XXX: Perhaps these shouldn't be merged and kept apart or have the UI clarify what's public/private, and additional engagements keep that context
      var typeIndexes = Object.assign({}, publicTypeIndexes, privateTypeIndexes);

      var recognisedTypes = [];

      Object.values(typeIndexes).forEach(typeRegistration => {
        var forClass = typeRegistration[DO.C.Vocab['solidforClass']['@id']];
        var instance = typeRegistration[DO.C.Vocab['solidinstance']['@id']];
        var instanceContainer = typeRegistration[DO.C.Vocab['solidinstanceContainer']['@id']];

        if (documentTypes.includes(forClass)) {
          recognisedTypes.push(forClass);

          if (instance) {
            promises.push(DO.U.showActivities(instance, { excludeMarkup: true, agent: agent.IRI }));
          }

          if (instanceContainer) {
            promises.push(DO.U.showActivitiesSources(instanceContainer, { activityType: 'instanceContainer', agent: agent.IRI }));
          }
        }
      });

//       TODO: Need proper filtering of storage/outbox matching an object of interest
//       if (recognisedTypes.length == 0) {
// console.log(agent, recognisedTypes);
//         promises.push(DO.U.processAgentStorageOutbox(agent));
//       }

// console.log(promises)
      return promises;
    },

    processAgentStorageOutbox: function(agent) {
      var promises = [];
      if (agent.Storage && agent.Storage.length > 0) {
        if (agent.Outbox && agent.Outbox.length > 0) {
          if (agent.Storage[0] === agent.Outbox[0]) {
            promises.push(DO.U.showActivitiesSources(agent.Outbox[0]));
          }
          else {
            promises.push(DO.U.showActivitiesSources(agent.Storage[0]));
            promises.push(DO.U.showActivitiesSources(agent.Outbox[0]));
          }
        }
        else {
          promises.push(DO.U.showActivitiesSources(agent.Storage[0]))
        }
      }
      else if (agent.Outbox && agent.Outbox.length > 0) {
        promises.push(DO.U.showActivitiesSources(agent.Outbox[0]));
      }

      return promises;
    },

    showActivitiesSources: function(url, options = {}) {
      return DO.U.getItemsList(url).then(
        function(items) {
          var promises = [];

          for (var i = 0; i < items.length && i < DO.C.CollectionItemsLimit; i++) {
            var pI = function(iri) {
              return DO.U.showActivities(iri, options);
            }

            promises.push(pI(items[i]));
          }
// console.log(promises)
          return Promise.allSettled(promises);
        },
      ).catch((error) => {
          console.log(error)
          console.log(url + ' has no activities.');
          // return error;
      });
    },

    getActivities: function(url, options) {
      url = url || currentLocation();
      url = stripFragmentFromString(url);

      switch (options['activityType']) {
        default:
        case 'instanceContainer':
          // console.log(DO.U.getItemsList(url))
          return DO.U.getItemsList(url);
        case 'instance':
          return DO.U.showActivities(url);
      }
    },

    showActivities: function(url, options = {}) {
      if (DO.C.Activity[url] || DO.C.Notification[url]) {
        return [];
      }

      var documentURL = DO.C.DocumentURL;

      var documentTypes = DO.C.ActivitiesObjectTypes.concat(Object.keys(DO.C.ResourceType));

      return getResourceOnlyRDF(url)
        //TODO: Needs throws handled from functions calling showActivities
        // .catch(e => {
        //   return [];
        // })
        .then(g => {
          if (!g || g.resource) return;

          if (options.notification) {
            DO.C.Notification[url] = {};
            DO.C.Notification[url]['Activities'] = [];
            DO.C.Notification[url]['Graph'] = g;
          }
          else {
            DO.C.Activity[url] = {};
            DO.C.Activity[url]['Graph'] = g;
          }

          var currentPathURL = window.location.origin + window.location.pathname;

          var subjectsReferences = [];
          var subjects = [];
          g.graph().toArray().forEach(function(t){
            subjects.push(t.subject.nominalValue);
          });
          subjects = uniqueArray(subjects);

          subjects.forEach(function(i){
            var s = g.child(i)
// console.log(s)
            var types = s.rdftype._array || [];

            if (types.length > 0) {
              var resourceTypes = types;

              var language = getGraphLanguage(s);
              var license = getGraphLicense(s);
              var rights = getGraphRights(s);

              //XXX: May need to be handled in a similar way to to as:Anounce/Create?
              if(resourceTypes.indexOf('https://www.w3.org/ns/activitystreams#Like') > -1 ||
                 resourceTypes.indexOf('https://www.w3.org/ns/activitystreams#Dislike') > -1){
                if(s.asobject && s.asobject.at(0) && getPathURL(s.asobject.at(0)) == currentPathURL ) {
                  if(s.ascontext && s.ascontext.at(0)){
                    var context = s.ascontext.at(0);
                    subjectsReferences.push(context);
                    return DO.U.showActivities(context)
                      .then(iri => iri)
                      .catch(e => console.log(context + ': context is unreachable', e));
                  }
                  else {
                    var iri = s.iri().toString();
                    var targetIRI = s.asobject.at(0);
                    // var motivatedBy = 'oa:assessing';
                    var id = generateUUID(iri);
                    var refId = 'r-' + id;
                    var refLabel = id;

                    var bodyValue = (resourceTypes.indexOf('https://www.w3.org/ns/activitystreams#Like') > -1) ? 'Liked' : 'Disliked';
                    var motivatedBy = bodyValue.slice(0, -1);

                    var noteData = {
                      "type": bodyValue === 'Liked' ? 'approve' : 'disapprove',
                      "mode": "read",
                      "motivatedByIRI": motivatedBy,
                      "id": id,
                      "refId": refId,
                      "refLabel": refLabel,
                      "iri": iri, //but don't pass this to createNoteDataHTML?
                      "creator": {},
                      "target": {
                        "iri": targetIRI
                      }
                    };

                    var bodyObject = {
                      "value": bodyValue
                    }

                    if (language) {
                      noteData["language"] = language;
                      bodyObject["language"] = language;
                    }
                    if (license) {
                      noteData["rights"] = noteData["license"] = license;
                      bodyObject["rights"] = bodyObject["license"] = license;
                    }

                    noteData["body"] = [bodyObject];

                    if (s.asactor && s.asactor.at(0)){
                      noteData['creator'] = {
                        'iri': s.asactor.at(0)
                      }
                      var a = g.child(noteData['creator']['iri']);
                      var actorName = getAgentName(a);
                      var actorImage = getGraphImage(a);

                      if(typeof actorName != 'undefined') {
                        noteData['creator']['name'] = actorName;
                      }
                      if(typeof actorImage != 'undefined') {
                        noteData['creator']['image'] = actorImage;
                      }
                    }
                    else if(resourceTypes.indexOf('https://www.w3.org/ns/activitystreams#Dislike') > -1) {
                      noteData['creator'] = {
                        'name': 'Anonymous Coward'
                      }
                    }

                    var datetime = getGraphDate(s);
                    if (datetime){
                      noteData['datetime'] = datetime;
                    }

                    DO.U.addNoteToNotifications(noteData);
                  }
                }
              }
              else if(resourceTypes.indexOf('https://www.w3.org/ns/activitystreams#Relationship') > -1){
                if(s.assubject && s.assubject.at(0) && s.asrelationship && s.asrelationship.at(0) && s.asobject && s.asobject.at(0) && getPathURL(s.asobject.at(0)) == currentPathURL) {
                  var subject = s.assubject.at(0);
                  subjectsReferences.push(subject);
                  return DO.U.showActivities(subject)
                    .then(iri => iri)
                    .catch(e => console.log(subject + ': subject is unreachable', e));
                }
              }
              else if(resourceTypes.indexOf('https://www.w3.org/ns/activitystreams#Announce') > -1 || resourceTypes.indexOf('https://www.w3.org/ns/activitystreams#Create') > -1) {
                if(s.asobject && s.asobject.at(0) && s.astarget && s.astarget.at(0)) {
                  var o = {};

                  var targetPathURL = getPathURL(s.astarget.at(0));

                  if (targetPathURL == currentPathURL) {
                    o['targetInOriginalResource'] = true;
                  }
                  else if (DO.C.Resource[documentURL].graph.rellatestversion && targetPathURL == getPathURL(DO.C.Resource[documentURL].graph.rellatestversion)) {
                    o['targetInMemento'] = true;
                  }
                  else if (DO.C.Resource[documentURL].graph.owlsameAs && DO.C.Resource[documentURL].graph.owlsameAs.at(0) == targetPathURL) {
                    o['targetInSameAs'] = true;
                  }

                  if (o['targetInOriginalResource'] || o['targetInMemento'] || o['targetInSameAs']){
                    var object = s.asobject.at(0);
                    var target = s.astarget.at(0);
                    subjectsReferences.push(object);

                    if (options.notification) {
                      DO.C.Notification[url]['Activities'].push(object);
                    }

                    if (object.startsWith(url)) {
                      return DO.U.showAnnotation(object, s, o);
                    }
                    else {
                      s = s.child(object);
                      var citation = {};

                      // if (target.startsWith(currentPathURL)) {
                        Object.keys(DO.C.Citation).forEach(function(citationCharacterization){
                          var citedEntity = s[citationCharacterization];
                          // if(citedEntity) {
                            citedEntity.forEach(function(cE) {
                              if(cE.startsWith(currentPathURL)) {
                                o['objectCitingEntity'] = true;
                                citation = {
                                  'citingEntity': object,
                                  'citationCharacterization': citationCharacterization,
                                  'citedEntity': target
                                }
                              }
                            })
                          // }
                        })
                      // }

                      if (o['objectCitingEntity']) {
                        return DO.U.showCitations(citation, s);
                      }
                      else {
                        return DO.U.showActivities(object, o)
                          .then(iri => iri)
                          .catch(e => console.log(object + ': object is unreachable', e));
                      }
                    }
                  }
                }
              }
              // else if (resourceTypes.indexOf('http://purl.org/spar/cito/Citation')) {
                //TODO:
                // var iri = s.iri().toString();
                // return DO.U.showCitations(iri, s)
              // }
              else if(resourceTypes.indexOf('https://www.w3.org/ns/activitystreams#Add') > -1) {
                var object = s.asobject ? s.asobject.at(0) : undefined;
                var target = s.astarget ? s.astarget.at(0) : undefined;
                var origin = s.asorigin ? s.asorigin.at(0) : undefined;

                if (object && (target || origin)) {
                  var targetPathURL = getPathURL(target);
                  var originPathURL = getPathURL(origin);
// console.log('pathURLs: ', targetPathURL, originPathURL);
                  if (targetPathURL == currentPathURL || originPathURL == currentPathURL) {
                    subjectsReferences.push(object);
// console.log('object:', object);
// console.log('target:', target);
// console.log('origin:', origin);

                    if (object.startsWith(url)) {
                      return DO.U.showAnnotation(object, s);
                    }
                    else {
                      return DO.U.showActivities(object)
                        .then(iri => iri)
                        .catch(e => console.log(object + ': object is unreachable', e));
                    }
                  }
                }
              }
              else if(resourceTypes.indexOf('http://www.w3.org/ns/oa#Annotation') > -1 && getPathURL(s.oahasTarget) == currentPathURL && !subjectsReferences.includes(i)) {
                return DO.U.showAnnotation(i, s);
              }
              else if (!subjectsReferences.includes(i) && documentTypes.some(item => resourceTypes.includes(item)) && s.asinReplyTo && s.asinReplyTo.at(0) && getPathURL(s.asinReplyTo.at(0)) == currentPathURL) {
                  subjectsReferences.push(i);
                return DO.U.showAnnotation(i, s);
              }
              else if (resourceTypes.indexOf('http://www.w3.org/2002/01/bookmark#Bookmark') > -1 && s.bookmarkrecalls && getPathURL(s.bookmarkrecalls) == currentPathURL ) {
                var iri = s.iri().toString();
                var targetIRI = s.bookmarkrecalls;
                var motivatedBy = 'bookmark:Bookmark';
                var id = generateUUID(iri);
                var refId = 'r-' + id;
                var refLabel = id;

                var bodyValue = 'Bookmarked';

                var noteData = {
                  "type": 'bookmark',
                  "mode": "read",
                  "motivatedByIRI": motivatedBy,
                  "id": id,
                  "refId": refId,
                  "refLabel": refLabel,
                  "iri": iri, //but don't pass this to createNoteDataHTML?
                  "creator": {},
                  "target": {
                    "iri": targetIRI
                  },
                  "body": [{ "value": bodyValue }]
                };

                var creator = options.agent;
                //TODO: Move to graph.js?
                Object.keys(DO.C.Actor.Property).some(key => {
                  if (s[key] && s[key].at(0)) {
                    creator = s[key].at(0);
                    return true;
                  }
                })

                if (creator){
                  noteData['creator'] = {
                    'iri': creator
                  }
                  var a = g.child(noteData['creator']['iri']);
                  var actorName = getAgentName(a);
                  var actorImage = getGraphImage(a);

                  if(typeof actorName != 'undefined') {
                    noteData['creator']['name'] = actorName;
                  }
                  if(typeof actorImage != 'undefined') {
                    noteData['creator']['image'] = actorImage;
                  }
                }

                var datetime = getGraphDate(s);
                if (datetime){
                  noteData['datetime'] = datetime;
                }

                if (license){
                  noteData['license'] = license;
                }
                if (rights){
                  noteData['rights'] = rights;
                }

                DO.U.addNoteToNotifications(noteData);
              }
              else {
                // console.log(i + ' has unrecognised types: ' + resourceTypes);
                // return Promise.reject({'message': 'Unrecognised types ' + resourceTypes});
              }
            }
            else {
              // console.log('Skipping ' + i + ': No type.');
              // return Promise.reject({'message': 'Activity has no type. What to do?'});
            }
          });
        }
        // ,
        // function(reason) {
        //   console.log(url + ': is unreachable. ' + reason);
        //   return reason;
        // }
      );
    },

    //Borrowed some of the d3 parts from https://bl.ocks.org/mbostock/4600693
    showVisualisationGraph: function(url, data, selector, options) {
      url = url || window.location.origin + window.location.pathname;
      selector = selector || 'body';
      options = options || {};
      options['contentType'] = options.contentType || 'text/html';
      options['subjectURI'] = options.subjectURI || url;
      options['license'] = options.license || 'https://creativecommons.org/licenses/by/4.0/';
      options['language'] = options.language || 'en';
      options['creator'] = options.creator || 'https://dokie.li/';
      var width = options.width || '100%';
      var height = options.height || '100%';
      var nodeRadius = 6;
      var simulation;

      var id = generateAttributeId();


      function positionLink(d) {
        return "M" + d[0].x + "," + d[0].y
             + "S" + d[1].x + "," + d[1].y
             + " " + d[2].x + "," + d[2].y;
      }

      function positionNode(d) {
        return "translate(" + d.x + "," + d.y + ")";
      }

      // function dragstarted(d) {
      //   if (!d3.event.active) simulation.alphaTarget(0.3).restart();
      //   d.fx = d.x, d.fy = d.y;
      // }

      // function dragged(d) {
      //   d.fx = d3.event.x, d.fy = d3.event.y;
      // }

      function dragended(d) {
        if (!d3.event.active) simulation.alphaTarget(0);
        d.fx = null, d.fy = null;
      }

      function runSimulation(graph, svgObject) {
// console.log(graph)
// console.log(svgObject)
        simulation
            .nodes(graph.nodes)
            .on("tick", ticked);

        simulation.force("link")
            .links(graph.links);

        function ticked() {
          svgObject.link.attr("d", positionLink);
          svgObject.node.attr("transform", positionNode);
        }
      }

      // var color = d3.scaleOrdinal(d3.schemeCategory10);

      //TODO: Structure of these objects should change to use the label as key, and move to config.js
      var group = {
        "0": { color: '#fff', label: '' },
        "1": { color: '#000', label: '', type: 'rdf:Resource' },
        "2": { color: '#777', label: '' },
        "3": { color: '#551a8b', label: 'Visited', type: 'rdf:Resource' }
      }
      var legendCategories = {
        "4": { color: '#ccc', label: 'Literal', type: 'rdfs:Literal' },
        "5": { color: '#ff0', label: 'Root', type: 'rdf:Resource' },
        "6": { color: '#ff2900', label: 'Type', type: 'rdf:Resource' },
        "7": { color: '#002af7', label: 'External reference', type: 'rdf:Resource' },
        "8": { color: '#00cc00', label: 'Internal reference', type: 'rdf:Resource' },
        "9": { color: '#00ffff', label: 'Citation', type: 'rdf:Resource' },
        "10": { color: '#900090', label: 'Social', type: 'rdf:Resource' },
        "11": { color: '#ff7f00', label: 'Dataset', type: 'rdf:Resource' },
        "12": { color: '#9a3a00', label: 'Requirement', type: 'rdf:Resource' },
        "13": { color: '#9a6c00', label: 'Advisement', type: 'rdf:Resource' },
        "14": { color: '#ff00ff', label: 'Specification', type: 'rdf:Resource' },
        "15": { color: '#0088ee', label: 'Policy', type: 'rdf:Resource' },
        "16": { color: '#FFB900', label: 'Event', type: 'rdf:Resource' },
        "17": { color: '#009999', label: 'Slides', type: 'rdf:Resource' },
        "18": { color: '#d1001c', label: 'Concepts', type: 'rdf:Resource' }
      }
      group = Object.assign(group, legendCategories);

      // var a = [];
      // Object.keys(group).forEach(function(i){
      //   a.push('<div style="background-color:' + group[i].color + '; width:5em; height:5em;">' + group[i].label + '</div>');
      // });
      // getDocumentContentNode(document).insertAdjacentHTML('beforeend', a.join(''));


      if (selector == '#graph-view' && !document.getElementById('graph-view')) {
        document.documentElement.appendChild(fragmentFromString('<aside id="graph-view" class="do on">' + DO.C.Button.Close + '<h2>Graph view</h2></aside>'));
      }

      var svg = d3.select(selector).append('svg')
        .attr('width', width)
        .attr('height', height)
        .attr('id', id)
        // .attr('about', '#' + id)
        // .attr('class', 'graph')
        .attr('xmlns', 'http://www.w3.org/2000/svg')
        .attr('xml:lang', options.language)
        .attr('prefix', 'rdf: http://www.w3.org/1999/02/22-rdf-syntax-ns# rdfs: http://www.w3.org/2000/01/rdf-schema# xsd: http://www.w3.org/2001/XMLSchema# dcterms: http://purl.org/dc/terms/')
        .attr('typeof', 'http://purl.org/dc/dcmitype/Image')

      var graphView = document.querySelector(selector);
      graphView.insertAdjacentHTML('beforeend', '<button class="export" title="Export graph as SVG">Export</button>');
      graphView.addEventListener('click', function(e) {
        if (e.target.closest('button.export')) {
          var svgNode = graphView.querySelector('svg[typeof="http://purl.org/dc/dcmitype/Image"]');

          var options = {
            subjectURI: 'http://example.org/' + svgNode.id,
            mediaType: 'image/svg+xml',
            filenameExtension: '.svg'
          }

          svgNode = getDocument(svgNode.cloneNode(true));

          DO.U.exportAsDocument(svgNode, options);
        }
      });

      var s = document.getElementById(id);
      width = options.width || parseInt(s.ownerDocument.defaultView.getComputedStyle(s, null)["width"]);
      height = options.height || parseInt(s.ownerDocument.defaultView.getComputedStyle(s, null)["height"]);

      if('title' in options) {
        svg.append('title')
          .attr('property', 'dcterms:title')
          .text(options.title);
      }

      function addLegend(go) {
// console.log(go)

        var graphLegend = svg.append('g')
          .attr('class', 'graph-legend');

        var graphResources = graphLegend
          .append("text")
            .attr('class', 'graph-resources')
            .attr("x", 0)
            .attr("y", 20)
            .text("Resources: ")

        go.resources.forEach(function(i, index){
          graphResources
            .append('a')
              .attr('fill', legendCategories[7].color)
              .attr('href', i)
              .attr('rel', 'dcterms:source')
              .text(i)

          if (index < go.resources.length - 1) {
            graphResources
              .append('tspan')
              .text(', ');
          }
        })

        graphLegend
          .append("text")
          .attr('class', 'graph-statements')
          .attr("x", 0)
          .attr("y", 45)
          .text("Statements: " + go.bilinks.length);

        graphLegend
          .append("text")
          .attr('class', 'graph-nodes-unique')
          .attr("x", 0)
          .attr("y", 70)
          .text("Nodes: " + Object.keys(go.uniqueNodes).length + " (unique)");

        graphLegend
          .append("text")
          .attr('class', 'graph-creator')
          .attr("x", 0)
          .attr("y", 95)
          .text("Creator: ");
        var graphCreator = graphLegend.select('g.graph-legend .graph-creator');
        graphCreator
          .append('a')
          .attr('fill', legendCategories[7].color)
          .attr('href', options.creator)
          .attr('rel', 'dcterms:creator')
          .text(options.creator)

        graphLegend
          .append("text")
          .attr('class', 'graph-license')
          .attr("x", 0)
          .attr("y", 120)
          .text("License: ");
        var graphLicense = graphLegend.select('g.graph-legend .graph-license');
        graphLicense
          .append('a')
          .attr('href', options.license)
          .attr('rel', 'dcterms:license')
          .attr('fill', legendCategories[7].color)
          .text(DO.C.License[options.license].name)
        // var selectLicense = '<select id="graph-license" name="graph-license">' + getLicenseOptionsHTML() + '</select>';
        // graphLegend.append('License: <a href="' + options.license + '">' + DO.C.License[options.license].name  + '</a>' + selectLicense);

        // graphLegend
        //   .append("text")
        //   .attr("x", 0)
        //   .attr("y", 45)
        //   .text('Language: <a href="' + options.language + '">' + DO.C.Languages[options.language].name  + '');
        // var selectLanguages = '<select id="graph-view-language" name="graph-view-language">' + getLanguageOptionsHTML() + '</select>';

        const legendInfo = {};

        Object.keys(legendCategories).forEach(group => {
          legendInfo[group] = { ...legendCategories[group], count: 0 };
        });

        go.nodes.forEach(node => {
          const group = node.group;
          if (group && legendInfo.hasOwnProperty(group)) {
            legendInfo[group].count++;
          }
        });
        //TODO: Move foobarbazqux into graphLegend
        //FIXME: Why doesn't select or selectAll("g.graph-legend") work? g.graph-legend is in the svg. foobarbazqux is a hack IIRC.
        //Why is graphLegend.selectAll('foobarbazqux') necessary?
        var legendGroups = Object.keys(legendInfo);
        graphLegend.selectAll("foobarbazqux")
          .data(legendGroups)
          .enter()
          .append("circle")
            .attr("cx", 10)
            .attr("cy", function(d,i){ return 150 + i*25 })
            .attr("r", nodeRadius)
            .attr("fill", function(d){ return legendInfo[d].color })

        graphLegend.selectAll("foobarbazqux")
          .data(legendGroups)
          .enter()
          .append("text")
            .attr("x", 25)
            .attr("y", function(d,i){ return 155 + i*25 })
            .attr("fill", function(d){ return legendInfo[d].color })
            .text(function(d){ return legendInfo[d].label + ' (' + legendInfo[d].count + ')'} )
      }

      function handleResource (pIRI, headers, options) {
        return getResource(pIRI, headers, options)
//           .catch(error => {
// // console.log(error)
//             // if (error.status === 0) {
//               // retry with proxied uri
//               var pIRI = getProxyableIRI(options['subjectURI'], {'forceProxy': true});
//               return handleResource(pIRI, headers, options);
//             // }

//             // throw error  // else, re-throw the error
//           })
          .then(response => {
// console.log(response)
            var cT = response.headers.get('Content-Type');
            options['contentType'] = (cT) ? cT.split(';')[0].trim() : 'text/turtle';

            return response.text().then(data => {
              options['mergeGraph'] = true;
              initiateVisualisation(options['subjectURI'], data, options);
            });
          })
      }

      function createSVGMarker() {
        svg.append("defs")
          .append("marker")
            .attr("id", "end")
            .attr("viewBox", "0 -5 10 10")
            .attr("refX", 20)
            .attr("refY", -1)
            .attr("markerWidth", 6)
            .attr("markerHeight", 6)
            .attr("orient", "auto")
            .attr("fill", group[2].color)
          .append("path")
            .attr("d", "M0,-5L10,0L0,5");
      }

      function buildGraphObject(graph, options) {
        var graphObject = {};

        var nodes = graph.nodes;
        var nodeById = new Map();
        nodes.forEach(function(n){
          nodeById.set(n.id, n);
        })
        var links = graph.links;
        var bilinks = [];

// console.log(graph)
// console.log(nodeById)
        var uniqueNodes = {};

        links.forEach(function(link) {
          var s = link.source = nodeById.get(link.source),
              t = link.target = nodeById.get(link.target),
              i = {}; // intermediate node
              // linkValue = link.value
          nodes.push(i);

          if (uniqueNodes[s.id] > -1) {
            s = uniqueNodes[s.id];
          }
          else {
            uniqueNodes[s.id] = s;
          }

          if (uniqueNodes[t.id] > -1) {
            t = uniqueNodes[t.id];
          }
          else {
            uniqueNodes[t.id] = t;
          }

          links.push({source: s, target: i}, {source: i, target: t});
          bilinks.push([s, i, t]);
        });

        graphObject = {
          'nodes': nodes,
          'links': links,
          'bilinks': bilinks,
          'uniqueNodes': uniqueNodes,
          'resources': options.resources
        };
// console.log(graphObject)

        return graphObject;
      }

      function buildSVGObject(go) {
        var svgObject = {};

        createSVGMarker();

        svg.append('g')
          .attr('class', 'graph-objects');

        var graphObjects = svg.select('g.graph-objects');

        var link = graphObjects.selectAll("path")
          .data(go.bilinks)
          .enter().append("path")
            // .attr("class", "link")
            .attr('fill', 'none')
            .attr('stroke', group[4].color)
            .attr("marker-end", "url(#end)");

        // link.transition();

        var node = graphObjects.selectAll("circle")
          .data(go.nodes.filter(function(d) {
            if (go.uniqueNodes[d.id] && go.uniqueNodes[d.id].index == d.index) {
              return d.id;
            }
          }))
          .enter()
          .append('a')
            .attr('href', function(d) {
              if ('type' in group[d.group] && group[d.group].type !== 'rdfs:Literal' && !d.id.startsWith('http://example.com/.well-known/genid/')) {
                return d.id
              }
              return null
            })
            .attr('rel', function(d) {
              if (this.getAttribute('href') === null) { return null }
              return 'dcterms:references'
            })
          .append('circle')
            .attr('r', nodeRadius)
            .attr('fill', function(d) { return group[d.group].color; })
            .attr('stroke', function (d) {
              if (d.visited) { return group[3].color }
              else if (d.group == 4) { return group[2].color }
              else { return group[7].color }})
            .on('click', function(e, d) {
              e.preventDefault();
              e.stopPropagation();

              var iri = d.id;
              if ('type' in group[d.group] && group[d.group].type !== 'rdf:Literal' && !(d.id in DO.C.Graphs)) {
                options = options || {};
                options['subjectURI'] = iri;
                //TODO: These values need not be set here. getResource(Graph) should take care of it. Refactor handleResource
                var headers = { 'Accept': setAcceptRDFTypes() };
                var pIRI = getProxyableIRI(iri);
                if (pIRI.slice(0, 5).toLowerCase() == 'http:') {
                  options['noCredentials'] = true;
                }

                handleResource(pIRI, headers, options);
              }
            })

        node.append('title')
          .text(function(d) { return d.id; });

            // .call(d3.drag()
            //     .on("start", dragstarted)
            //     .on("drag", dragged)
            //     .on("end", dragended));

        svgObject = {
          'link': link,
          'node': node
        }

        //Adding this now so that it is not selected with circles above.
        addLegend(go);

// console.log(svgObject)
        return svgObject;
      }

      function initiateVisualisation(url, data, options) {
        url = stripFragmentFromString(url);
        options.resources = ('resources' in options) ? uniqueArray(options.resources.concat(url)) : [url];

        return DO.U.getVisualisationGraphData(url, data, options).then(
          function(graph){
// console.log(graph);
            var graphObject = buildGraphObject(graph, options);

            simulation = d3.forceSimulation().nodes(graph.nodes)
              .alphaDecay(0.025)
              // .velocityDecay(0.1)
              .force("link", d3.forceLink().distance(nodeRadius).strength(0.25))
              .force('collide', d3.forceCollide().radius(nodeRadius * 2).strength(0.25))
              // .force("charge", d3.forceManyBody().stength(-5))
              .force("center", d3.forceCenter(width / 2, height / 2));

            if ('mergeGraph' in options && options.mergeGraph) {
              svg.selectAll("defs").remove();
              svg.selectAll("g.graph-legend").remove();
              svg.selectAll("g.graph-objects").remove();
              simulation.restart();
            }

            var svgObject = buildSVGObject(graphObject);

            runSimulation(graph, svgObject);
          });
      }

      initiateVisualisation(url, data, options);
    },

    getVisualisationGraphData: function(url, data, options) {
      var requestURL = stripFragmentFromString(url);
      var documentURL = DO.C.DocumentURL;

      var { skipNodeWithClass, ...restOptions } = DO.C.DOMNormalisation;
      var optionsNormalisation = restOptions;

      if (typeof data == 'string') {
        return getGraphFromData(data, options).then(function(g){
          return DO.U.convertGraphToVisualisationGraph(requestURL, g, options);
        });
      }
      else if (typeof data == 'object') {
        return DO.U.convertGraphToVisualisationGraph(requestURL, data, options);
      }
      else if (typeof data == 'undefined') {
        if (DO.C.Resource[documentURL] && DO.C.Resource[documentURL].graph) {
          return DO.U.convertGraphToVisualisationGraph(requestURL, DO.C.Resource[documentURL].graph.graph(), options);
        }
        else {
          data = getDocument(null, optionsNormalisation);
          return getGraphFromData(data, options).then(function(g){
            return DO.U.convertGraphToVisualisationGraph(requestURL, g, options);
          });
        }
      }
    },

    convertGraphToVisualisationGraph: function(url, g, options){
// console.log(g);
      DO.C['Graphs'] = DO.C['Graphs'] || {};
      g = SimpleRDF(DO.C.Vocab, options['subjectURI'], g, ld.store).child(url);
// console.log(g.toString())
      var dataGraph = SimpleRDF();
      var graphs = {};
      graphs[options['subjectURI']] = g;

      if ('mergeGraph' in options && options.mergeGraph) {
        graphs = Object.assign(DO.C.Graphs, graphs);
      }

      DO.C['Graphs'][options['subjectURI']] = g;

      Object.keys(graphs).forEach(function(i){
        var g = graphs[i].graph();

        dataGraph.graph().addAll(g);
      });

      var graphData = {"nodes":[], "links": [], "resources": options.resources };
      var graphNodes = [];

      dataGraph.graph().toArray().forEach(function(t){
        if(
          // t.predicate.nominalValue == 'http://www.w3.org/1999/02/22-rdf-syntax-ns#first' ||
          // t.predicate.nominalValue == 'http://www.w3.org/1999/02/22-rdf-syntax-ns#rest' ||
          t.object.nominalValue == 'http://www.w3.org/1999/02/22-rdf-syntax-ns#nil'
          ) {
          return;
        }

        var sGroup = 8;
        var pGroup = 8;
        var oGroup = 8;
        var sVisited = false;
        var oVisited = false;

        switch(t.subject.interfaceName) {
          default: case 'NamedNode':
            if (stripFragmentFromString(t.subject.nominalValue) != url) {
              sGroup = 7;
            }
            break;
          case 'BlankNode':
            sGroup = 8;
            break;
        }

        switch(t.object.interfaceName) {
          default: case 'NamedNode':
            if (stripFragmentFromString(t.object.nominalValue) != url) {
              oGroup = 7;
            }
            break;
          case 'BlankNode':
            oGroup = 8;
            break;
          case 'Literal':
            oGroup = 4;
            break;
        }

        if (t.subject.nominalValue.startsWith('http://example.com/.well-known/genid/')) {
          sGroup = 8;
        }
        if (t.object.nominalValue.startsWith('http://example.com/.well-known/genid/')) {
          oGroup = 8;
        }

        if (t.predicate.nominalValue == DO.C.Vocab['rdftype']['@id']){
          oGroup = 6;

          if (isActorType(t.object.nominalValue)) {
            sGroup = 10;
          }

          switch (t.object.nominalValue) {
            case DO.C.Vocab['qbDataSet']['@id']:
              oGroup = 11;
              break;
            case DO.C.Vocab['doapSpecification']['@id']:
              sGroup = 14;
              break;
            case DO.C.Vocab['odrlAgreement']['@id']:
            case DO.C.Vocab['odrlAssertion']['@id']:
            case DO.C.Vocab['odrlOffer']['@id']:
            case DO.C.Vocab['odrlPolicy']['@id']:
            case DO.C.Vocab['odrlPrivacy']['@id']:
            case DO.C.Vocab['odrlRequest']['@id']:
            case DO.C.Vocab['odrlSet']['@id']:
            case DO.C.Vocab['odrlTicket']['@id']:
              sGroup = 15;
              break;
            case DO.C.Vocab['schemaEvent']['@id']:
            case DO.C.Vocab['biboEvent']['@id']:
            case DO.C.Vocab['biboConference']['@id']:
              sGroup = 16;
              break;
            case DO.C.Vocab['biboSlide']['@id']:
              sGroup = 17;
              break;
          }
        }

        if (t.subject.nominalValue == 'http://purl.org/ontology/bibo/presentedAt') {
          oGroup = 16;
        }
        if (Config.Event.Property.hasOwnProperty(t.predicate.nominalValue)) {
          sGroup = 16;
        }

        if (isActorProperty(t.predicate.nominalValue)) {
          oGroup = 10;
        }
        if (t.predicate.nominalValue.startsWith('http://purl.org/spar/cito/')) {
          oGroup = 9;
        }
        switch(t.predicate.nominalValue) {
          case DO.C.Vocab['foafknows']['@id']:
            sGroup = 10;
            oGroup = 10;
            break;
          case DO.C.Vocab['specrequirement']['@id']:
          case DO.C.Vocab['specrequirementReference']['@id']:
            oGroup = 12;
            break;
          case DO.C.Vocab['specadvisement']['@id']:
            oGroup = 13;
            break;
          case DO.C.Vocab['spectestSuite']['@id']:
            oGroup = 11;
            break;
          case DO.C.Vocab['odrlhasPolicy']['@id']:
            oGroup = 14;
            break;
          case DO.C.Vocab['skoshasTopConcept']['@id']:
          case DO.C.Vocab['skosinScheme']['@id']:
          case DO.C.Vocab['skosCollection']['@id']:
          case DO.C.Vocab['skossemanticRelation']['@id']:
          case DO.C.Vocab['skostopConceptOf']['@id']:
          case DO.C.Vocab['schemaaudience']['@id']:
            oGroup = 18;
            break;
        }

        if (DO.C.Graphs[t.subject.nominalValue]) {
          // sGroup = 1;
          sVisited = true;
        }
        if (DO.C.Graphs[t.object.nominalValue]) {
          // oGroup = 1;
          oVisited = true;
        }

        //Initial root node
        if (t.subject.nominalValue == url) {
          sGroup = 5;
          sVisited = true;
        }

        if (t.object.nominalValue == url) {
          oGroup = 5;
          oVisited = true;
        }

        //FIXME: groups are set once - not updated.

        var objectValue = t.object.nominalValue;
        if (t.object.interfaceName == 'Literal') {
          //TODO: Revisit
          // if(t.object.datatype.nominalValue == 'http://www.w3.org/rdf/1999/02/22-rdf-syntax-ns#HTML') {
          // }
          // objectValue = escapeCharacters(objectValue);
          objectValue = DOMPurify.sanitize(objectValue);
        }

        if(graphNodes.indexOf(t.subject.nominalValue) == -1) {
          graphNodes.push(t.subject.nominalValue);
          graphData.nodes.push({"id": t.subject.nominalValue, "group": sGroup, "visited": sVisited });
        }
        if(graphNodes.indexOf(t.object.nominalValue) == -1) {
          if (t.object.nominalValue in DO.C.Resource) {
            // console.log(t.object.nominalValue)
            DO.C.Resource[t.object.nominalValue].rdftype.forEach(function(type){
              if (isActorType(type)) {
                // console.log(type)
                oGroup = 10
              }
            })
          }

          graphNodes.push(objectValue);
          graphData.nodes.push({"id": objectValue, "group": oGroup, "visited": oVisited });
        }

        graphData.links.push({"source": t.subject.nominalValue, "target": objectValue, "value": t.predicate.nominalValue});
      });
// console.log(graphNodes)
// console.log(graph)

      graphNodes = undefined;
      return Promise.resolve(graphData);
    },

    showGraph: function(resources, selector, options){
      if (!DO.C.GraphViewerAvailable) { return; }

      options = options || {};
      options['contentType'] = options.contentType || 'text/html';
      options['subjectURI'] = options.subjectURI || location.href.split(location.search||location.hash||/[?#]/)[0];

      if (Array.isArray(resources)) {
        DO.U.showGraphResources(resources, selector, options);
      }
      else {
        var property = (resources && 'filter' in options && 'predicates' in options.filter && options.filter.predicates.length > 0) ? options.filter.predicates[0] : DO.C.Vocab['ldpinbox']['@id'];
        var iri = (resources) ? resources : location.href.split(location.search||location.hash||/[?#]/)[0];

        getLinkRelation(property, iri).then(
          function(resources) {
            DO.U.showGraphResources(resources[0], selector, options);
          },
          function(reason) {
            console.log(reason);
          }
        );
      }
    },

    showGraphResources: function(resources, selector, options) {
      selector = selector || getDocumentContentNode(document);
      options = options || {};
      if (Array.isArray(resources)) {
        resources = uniqueArray(resources);
      }

      DO.U.processResources(resources, options).then(
        function(url) {
          var promises = [];
          url.forEach(function(u) {
            // console.log(u);
            // window.setTimeout(function () {
              var pIRI = getProxyableIRI(u);
              promises.push(getResourceGraph(pIRI));
            // }, 1000)
          });

          var dataGraph = SimpleRDF();

          Promise.all(promises)
            .then(function(graphs) {
              graphs.forEach(function(g){
                g = g.graph();

                dataGraph.graph().addAll(g);
              });

              if ('filter' in options) {
                dataGraph = dataGraph.graph().filter(function(g) {
                  if ('subjects' in options.filter && options.filter.subjects.length > 0 && options.filter.subjects.indexOf(g.subject.nominalValue) >= 0) {
                    return g;
                  }
                  if ('predicates' in options.filter && options.filter.predicates.length > 0 && options.filter.predicates.indexOf(g.predicate.nominalValue) >= 0) {
                    return g;
                  }
                });
              }

              serializeGraph(dataGraph, { 'contentType': 'text/turtle' })
                .then(function(data){
                  options['contentType'] = 'text/turtle';
                  options['resources'] = resources;
                  // options['subjectURI'] = url;
                  //FIXME: For multiple graphs (fetched resources), options.subjectURI is the last item, so it is inaccurate
                  DO.U.showVisualisationGraph(options.subjectURI, data, selector, options);
                });
            });
        });
    },

    processResources: function(resources, options) {
      if (Array.isArray(resources)) {
        return Promise.resolve(resources);
      }
      else {
        return DO.U.getItemsList(resources, options);
      }
    },

    urlParam: function(name) {
      //FIXME
      var results = new RegExp('[\?&]' + name + '=([^&#]*)').exec(window.location.href);
      if (results===null){
         return null;
      }
      else{
         return results[1] || 0;
      }
    },

    getTextQuoteSelectorFromLocation: function(location) {
      var regexp = /#selector\(type=TextQuoteSelector,(.*)\)/;
      const matches = location.hash.match(regexp);

      if (matches) {
        var selectorsArray = matches[1].split(',')
        var selector = {};

        selectorsArray.forEach(function(s){
          var kv = s.split('=');

          if (kv.length == 2) {
            switch(kv[0]) {
              case 'prefix':
                selector['prefix'] = decodeURIComponent(kv[1]);
                break;
              case 'exact':
                selector['exact'] = decodeURIComponent(kv[1]);
                break;
              case 'suffix':
                selector['suffix'] = decodeURIComponent(kv[1]);
                break;
            }
          }

        })

        return selector;
      }
    },

    showTextQuoteSelector: function(containerNode) {
      var motivatedBy = 'oa:highlighting';
      var selector = DO.U.getTextQuoteSelectorFromLocation(document.location);
      if (selector && selector.exact && selector.exact.length > 0) {
        //XXX: TODO: Copied from showAnnotation

        var refId = document.location.hash.substring(1);
        var refLabel = DO.U.getReferenceLabel(motivatedBy);

        containerNode = containerNode || getDocumentContentNode(document);

        var docRefType = '<sup class="ref-highlighting"><a rel="oa:hasTarget" href="#' + refId + '">' + refLabel + '</a></sup>';

        var options = {
          'do': true,
          'mode': '#selector'
        };

        DO.U.importTextQuoteSelector(containerNode, selector, refId, motivatedBy, docRefType, options)
      }
    },

    importTextQuoteSelector: function(containerNode, selector, refId, motivatedBy, docRefType, options) {
      var containerNodeTextContent = containerNode.textContent;
      //XXX: Seems better?
      // var containerNodeTextContent = fragmentFromString(getDocument(containerNode)).textContent.trim();


// console.log(containerNodeTextContent);
      options = options || {};

// console.log(selector)
      var prefix = selector.prefix || '';
      var exact = selector.exact || '';
      var suffix = selector.suffix || '';

      var phrase = escapeRegExp(prefix.toString() + exact.toString() + suffix.toString());
// console.log(phrase);

      var selectedParentNode;

      var textMatches = matchAllIndex(containerNodeTextContent, new RegExp(phrase, 'g'));
// console.log(textMatches)

      textMatches.forEach(function(item) {
// console.log('phrase:')
// console.log(phrase)
// console.log(item)
        var selectorIndex = item.index;
// console.log('selectorIndex:')
// console.log(selectorIndex)
      // var selectorIndex = containerNodeTextContent.indexOf(prefix + exact + suffix);
// console.log(selectorIndex);
      // if (selectorIndex >= 0) {
        var exactStart = selectorIndex + prefix.length
        var exactEnd = selectorIndex + prefix.length + exact.length;
        var selection = { start: exactStart, end: exactEnd };
// console.log('selection:')
// console.log(selection)
        var ref = DO.U.getTextQuoteHTML(refId, motivatedBy, exact, docRefType, options);
// console.log('containerNode:')
// console.log(containerNode)
        MediumEditor.selection.importSelection(selection, containerNode, document);

        //XXX: Review
        selection = window.getSelection();
// console.log(selection)
        var r = selection.getRangeAt(0);
        selection.removeAllRanges();
        selection.addRange(r);
        r.collapse(true);
// console.log(r)
// console.log('r.commonAncestorContainer:')
// console.log(r.commonAncestorContainer)
        selectedParentNode = r.commonAncestorContainer.parentNode;
// console.log('selectedParentNode:')
// console.log(selectedParentNode)
        var selectedParentNodeValue = r.commonAncestorContainer.nodeValue;
// console.log(selectedParentNodeValue)

// console.log(selectedParentNodeValue.substr(0, r.startOffset) + ref + selectedParentNodeValue.substr(r.startOffset + exact.length))
        var selectionUpdated = fragmentFromString(selectedParentNodeValue.substr(0, r.startOffset) + ref + selectedParentNodeValue.substr(r.startOffset + exact.length));
// console.log(selectionUpdated)

        //XXX: Review. This feels a bit dirty
        for(var i = 0; i < selectedParentNode.childNodes.length; i++) {
          var n = selectedParentNode.childNodes[i];
          if (n.nodeType === 3 && n.nodeValue === selectedParentNodeValue) {
            selectedParentNode.replaceChild(selectionUpdated, n);
          }
        }
// console.log('---')
      })

      return selectedParentNode;
    },

    initUser: function() {
      getLocalStorageProfile().then(user => {
        if (user && 'object' in user) {
          user.object.describes.Role = (DO.C.User.IRI && user.object.describes.Role) ? user.object.describes.Role : 'social';

          DO.C['User'] = user.object.describes;
        }
      })
    },

    getContentNode: function(node) {
      return getDocumentContentNode(document);
    },

    setDocumentURL: function(url) {
      url = url || currentLocation();

      DO.C.DocumentURL = stripFragmentFromString(url);
    },

    setDocumentString: function(node) {
      DO.C.DocumentString = getDocument(node);
    },

    setDocumentMode: function(mode) {
      var style = DO.U.urlParam('style');

      if (style) {
        var title = style.lastIndexOf('/');
        title = (title > -1) ? style.substr(title + 1) : style;

        if (style.startsWith('http')) {
          var pIRI = getProxyableIRI(style);
          var link = '<link class="do" href="' + pIRI + '" media="all" rel="stylesheet" title="' + title + '" />'
          document.querySelector('head').insertAdjacentHTML('beforeend', link);
        }

        window.history.replaceState({}, null, document.location.href.substr(0, document.location.href.lastIndexOf('?')));
        var stylesheets = document.querySelectorAll('head link[rel~="stylesheet"][title]:not([href$="dokieli.css"])');
        DO.U.updateSelectedStylesheets(stylesheets, title);
      }

      var open = DO.U.urlParam('open');
      if (open) {
        open = decodeURIComponent(open);

        var message = 'Opening <a href="' + open + '" target="_blank">' + open + '</a>';
        message = {
          'content': message,
          'type': 'info',
          'timer': 10000
        }
        addMessageToLog(message, Config.MessageLog);
        message.content = '<span class="progress">' + Icon[".fas.fa-circle-notch.fa-spin.fa-fw"] + ' ' + message.content + '</span>';
        showActionMessage(document.documentElement, message);

        DO.U.openResource(open);

        window.history.replaceState({}, null, document.location.href.substr(0, document.location.href.lastIndexOf('?')));
      }

      if (DO.C.GraphViewerAvailable) {
        var searchParams = new URLSearchParams(document.location.search);
        var graphs = searchParams.getAll('graph');

        var urls = graphs.map(url => {
          // var iri = decodeURIComponent(g);

          //TODO: Need a way to handle potential proxy use eg. https://dokie.li/?graph=https://dokie.li/proxy?uri=https://example.org/
          //XXX: if iri startsWith https://dokie.li/proxy? then the rest gets chopped.
          // var docURI = iri.split(/[?#]/)[0];

          //XXX: fugly
          // var docURI = iri.split(/[#]/)[0];
          // iri = iri.split('=').pop();

          return stripFragmentFromString(url);
        });
// console.log(urls);

        if (urls.length > 0) {
          // var options = {'license': 'https://creativecommons.org/publicdomain/zero/1.0/', 'filter': { 'subjects': [docURI, iri] }, 'title': iri };
          var options = {'subjectURI': urls[0], 'license': 'https://creativecommons.org/publicdomain/zero/1.0/', 'title': urls[0] };

          // DO.U.showGraphResources([docURI], '#graph-view', options);
// console.log(options);

          var anchors = urls.map(url => `<a href="${url}">${url}</a>`);

          message = 'Loading graph(s) ' + anchors.join(', ');
          message = {
            'content': message,
            'type': 'info',
            'timer': 3000
          }
          addMessageToLog(message, Config.MessageLog);
          message.content = '<span class="progress">' + Icon[".fas.fa-circle-notch.fa-spin.fa-fw"] + ' ' + message.content + '</span>';
          showActionMessage(document.documentElement, message);

          DO.U.showGraph(urls, '#graph-view', options);

          window.history.replaceState({}, null, document.location.href.substr(0, document.location.href.lastIndexOf('?graph')));
        }
      }

      if (DO.C.EditorAvailable) {
        if (DO.U.urlParam('author') == 'true' || DO.U.urlParam('social') == 'true') {
          if (DO.U.urlParam('social') == 'true') {
            mode = 'social';
          }
          else if (DO.U.urlParam('author') == 'true') {
            mode = 'author';
          }
          var url = document.location.href;
          window.history.replaceState({}, null, url.substr(0, url.lastIndexOf('?')));
        }

        switch(mode) {
          case 'social': default:
            DO.U.Editor.enableEditor('social');
            break;
          case 'author':
            DO.U.Editor.enableEditor('author');
            break;
        }
      }
    },

    initDocumentActions: function() {
      buttonClose();
      notificationsToggle();
      showRobustLinksDecoration();
      focusNote();

      var documentURL = DO.C.DocumentURL;

      //Fugly
      function checkResourceInfo() {
        if (documentURL in DO.C.Resource && 'state' in DO.C.Resource[documentURL]) {
          DO.U.processPotentialAction(DO.C.Resource[documentURL]);
        }
        else {
          getResourceInfo(DO.C.DocumentString).then(function(resourceInfo){
            DO.U.processPotentialAction(resourceInfo);
          });
          // window.setTimeout(checkResourceInfo, 100);
        }
      }

      checkResourceInfo();

      DO.U.processActivateAction();

      var annotationRights = document.querySelectorAll('[about="#annotation-rights"][typeof="schema:ChooseAction"], [href="#annotation-rights"][typeof="schema:ChooseAction"], [resource="#annotation-rights"][typeof="schema:ChooseAction"]');
      for (var i = 0; i < annotationRights.length; i++){
        annotationRights[i].parentNode.replaceChild(fragmentFromString('<select>' + getLicenseOptionsHTML() + '</select>'), annotationRights[i]);
      }
    },

    processActivateAction: function() {
      document.addEventListener('click', function(e) {
        if (e.target.closest('[about="#document-menu"][typeof="schema:ActivateAction"], [href="#document-menu"][typeof="schema:ActivateAction"], [resource="#document-menu"][typeof="schema:ActivateAction"]')) {
          e.preventDefault();
          e.stopPropagation();

          if (getDocumentContentNode(document).classList.contains('on-document-menu')) {
            DO.U.hideDocumentMenu(e);
          }
          else {
            DO.U.showDocumentMenu(e);
          }
        }
      });
    },

    processPotentialAction: function(resourceInfo) {
      var g = resourceInfo.graph;
      var triples = g._graph;
      triples.forEach(function(t){
        var s = t.subject.nominalValue;
        var p = t.predicate.nominalValue;
        var o = t.object.nominalValue;

        if(p == DO.C.Vocab['schemapotentialAction']['@id']) {
          var action = o;
          var documentOrigin = (document.location.origin === "null") ? "file://" : document.location.origin;
          var originPathname = documentOrigin + document.location.pathname;
// console.log(originPathname)
// console.log(action.startsWith(originPathname + '#'))
          if (action.startsWith(originPathname)) {
            document.addEventListener('click', function(e) {
              var fragment = action.substr(action.lastIndexOf('#'));
// console.log(fragment)
              if (fragment) {
                var selector = '[about="' + fragment  + '"][typeof="schema:ViewAction"], [href="' + fragment  + '"][typeof="schema:ViewAction"], [resource="' + fragment  + '"][typeof="schema:ViewAction"]';
// console.log(selector)
                // var element = document.querySelectorAll(selector);
                var element = e.target.closest(selector);
// console.log(element)
                if (element) {
                  e.preventDefault();
                  e.stopPropagation();

                  var so = g.child(action).schemaobject;
                  if (typeof so !== 'undefined') {
                    so = so.iri().toString();
                    selector = '#' + element.closest('[id]').id;

                    var svgGraph = document.querySelector(selector + ' svg');
                    if (svgGraph) {
                      svgGraph.nextSibling.parentNode.removeChild(svgGraph.nextSibling);
                      svgGraph.parentNode.removeChild(svgGraph);
                    }
                    else {
                      serializeGraph(g, { 'contentType': 'text/turtle' })
                        .then(function(data){
                          var options = {};
                          options['subjectURI'] = so;
                          options['contentType'] = 'text/turtle';
                          DO.U.showVisualisationGraph(options.subjectURI, data, selector, options);
                        });
                    }
                  }
                }
              }
            });
          }
        }
      });
    },


    showDocumentInfo: function() {
      document.documentElement.appendChild(fragmentFromString('<menu id="document-menu" class="do"><button class="show" title="Open menu">' + Icon[".fas.fa-bars"] + '</button><header></header><div></div><footer><dl><dt>About</dt><dd id="about-dokieli"><img alt="" height="16" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAMAAAD04JH5AAAAn1BMVEUAAAAAjwAAkAAAjwAAjwAAjwAAjwAAjwAAkAAAdwAAjwAAjQAAcAAAjwAAjwAAiQAAjwAAjAAAjwAAjwAAjwAAjwAAkAAAjwAAjwAAjwAAjQAAjQAAhQAAhQAAkAAAkAAAkAAAjgAAjwAAiQAAhAAAkAAAjwAAjwAAkAAAjwAAjgAAjgAAjQAAjwAAjQAAjwAAkAAAjwAAjQAAiwAAkABp3EJyAAAANHRSTlMA+fH89enaabMF4iADxJ4SiSa+uXztyoNvQDcsDgvl3pRiXBcH1M+ppJlWUUpFMq6OdjwbMc1+ZgAABAhJREFUeNrt29nSmkAQBeAGZBMUxH3f993/vP+zJZVKVZKCRhibyc3/XVt6SimYPjPSt28Vmt5W/fu2T/9B9HIf7Tp+0RsgDC6DY6OLvzxJj8341DnsakgZUNUmo2XsORYYS6rOeugukhnyragiq56JIs5UEQ/FXKgidRTzompEKOhG1biioDFV44mCAqrGAQWtqRptA8VMqCpR6zpo9iy84VO1opWHPBZVb9QAzyQN/D1YNungJ+DMSYsbOFvSIwGjR3p0wGiQHkMw2qRHC4w76RGBcSA9NmAcSY8QjAdpYiFbTJoYyNYnTWrI1iFNusj2JE1sZBuQJtyE5pImc3Y21cRhZ1NNtsh2Ik127HCsSY8djjVpINuVhPnjVefobee2adXqu2S/6FyivABDEjQ9Lxo1pDlNd5wg24ikRK5ngKGhHhg1DSgZk4RrD6pa9LlRAnUBfWp6xCe+6EOvOT6yrmrigZaCZHPAp6b0gaiBFKvRd0/D1rr1OrvxDqiyoZmmPt9onib0t/VybyEXqdu0Cw16rUNVAfZFlzdjr5KOaoAUK6JsrgWGQapuBlIS4gy70gEmTrk1fuAgU40UxWXv6wvZAC2Dqfx0BfBK1z1H0aJ0WH7Ub4oG8JDlpBCgK1l5tSjHQSoAf0HVfMqxF+yqpzVk2ZGuAGdk8ijPHZlmpOCg0vh5cgE2JtN3qQSoU3lXpbKlLRegrzTpt+U2TNpKY2YiFiA0kS1Q6QccweZ/oinASm2B3RML0AGDNAU4qq3udmIXYVttD3YrFsBR24N1xG5EJpTeaiYWwILS5WRKBfChFsCSehpOwKi/yS0V4AsMWym3TWUFgMqIsRYL8AVOSDlaYgEitbZnDKll+UatchyJBSC1c3lDuQA2VHYAL3KneHpgLCjHSS7AHYyEciwh1g88wDB94rlyAVxwhsR7ygW4gRMTry8XwDdUDkXFgjVdD5wRsRaCAWJwPGI1Baval8Ie3Hqn8AjjhHbZr2DzrInumDTBGlCG8xy8QPY3MNLX4TiRP1q+BWs2pn9ECwu5+qTABc+80h++28UbTkjlTW3wrM6Ufrtu8d5J9Svg1Vch/RTcUYQdUHm+g1z1x2gSGyjGGVN5F7xjoTCjE0ndC3jJMzfCftmiciZ1lNGe3vCGufOWVMLIQHHehi3X1O8JJxR236SalUzninbu937BlwfV/I3k4KdGk2xm+MHuLa8Z0i9TC280qLRrF+8cw9RSjrOg8oIG8j2YgULsbGPomsgR0x9nsOzkOLh+kZr1owZGbfC2JJl78fIV0Wei/gxZDl85XWVtt++cxhuSEQ6bdfzLjlvM86PbaD4vQUjSglV8385My7CdXtO9+ZSyrLcf7nBN376V8gMpRztyq6RXYQAAAABJRU5ErkJggg==" width="16" /><a href="https://dokie.li/" target="_blank">dokieli</a> is an ' + Icon[".fab.fa-osi"] + ' <a href="https://github.com/dokieli/dokieli" target="_blank">open source</a> project. There is ' + Icon[".fas.fa-flask"] + ' <a href="https://dokie.li/docs" target="_blank">documentation</a> and public ' + Icon[".fas.fa-comments"] + ' <a href="https://gitter.im/dokieli/dokieli" target="_blank">chat</a>. Made with fun.</dd></dl></footer></menu>'));
      document.querySelector('#document-menu').addEventListener('click', function(e) {
        var button = e.target.closest('button');
        if(button){
          if (button.classList.contains('show')) {
            DO.U.showDocumentMenu(e);
          }
          else if (button.classList.contains('hide')) {
            DO.U.hideDocumentMenu(e);
          }
        }
      });
    },

    showDocumentMenu: function (e) {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }

      var dMenu = document.querySelector('#document-menu.do');

      if (!dMenu) {
        DO.U.showDocumentInfo();
        DO.U.showDocumentMenu();
        return;
      }

      var dMenuButton = dMenu.querySelector('button');
      var dHead = dMenu.querySelector('header');
      var dInfo = dMenu.querySelector('div');

      dMenuButton.classList.remove('show');
      dMenuButton.classList.add('hide');
      dMenuButton.setAttribute('title', 'Hide Menu');
      dMenuButton.innerHTML = Icon[".fas.fa-minus"];
      dMenu.classList.add('on');
      // body.classList.add('on-document-menu');

      showUserSigninSignout(dHead);
      DO.U.showDocumentDo(dInfo);
      DO.U.showViews(dInfo);

      var body = getDocumentContentNode(document);

      if(!body.classList.contains('on-slideshow')) {
        DO.U.showDocumentItems();
      }

      getResourceInfo(getDocument()).then(() => {
        updateDocumentDoButtonStates();
      });

      var options = { 'reuse': true };
      if (document.location.protocol.startsWith('http')) {
        options['followLinkRelationTypes'] = ['describedby'];
      }
      getResourceSupplementalInfo(DO.C.DocumentURL, options).then(resourceInfo => {
        updateFeatureStatesOfResourceInfo(resourceInfo);
        updateDocumentDoButtonStates();
      });
    },

    hideDocumentMenu: function(e) {
      // document.removeEventListener('click', DO.U.eventLeaveDocumentMenu);

      var body = getDocumentContentNode(document);
      var dMenu = document.querySelector('#document-menu.do');
      var dMenuButton = dMenu.querySelector('button');

      dMenu.classList.remove('on');
      // var sections = dMenu.querySelectorAll('section');
      // for (var i = 0; i < sections.length; i++) {
      //   if(sections[i].id != 'user-info' && !sections[i].querySelector('button.signin-user')) {
      //     sections[i].parentNode.removeChild(sections[i]);
      //   }
      // };
      var buttonSigninUser = dMenu.querySelector('button.signin-user');
      if(buttonSigninUser) {
        dMenu.querySelector('button.signin-user').disabled = false;
      }
      // body.classList.remove('on-document-menu');
      dMenuButton.classList.remove('hide');
      dMenuButton.classList.add('show');
      dMenuButton.setAttribute('title', 'Open Menu');
      dMenuButton.innerHTML = Icon[".fas.fa-bars"];
      removeNodesWithIds(DO.C.DocumentDoItems);
    },

    setPolyfill: function() {
      if (!Element.prototype.matches) {
        Element.prototype.matches = Element.prototype.msMatchesSelector;
      }

      if (!Element.prototype.closest) {
        Element.prototype.closest = function (selector) {
          var el = this;
          while (el) {
            if (el.matches(selector)) {
              return el;
            }
            el = el.parentElement;
          }
        };
      }
    },

    showXHRProgressHTML: function(http, options) {
      if ('progress' in options) {
        http.upload.onprogress = function(e) {
          if (e.lengthComputable) {
            options.progress.value = (e.loaded / e.total) * 100;
            options.progress.textContent = options.progress.value; // Fallback for unsupported browsers.
          }
        };
      }
    },

    setDocRefType: function() {
      var link = document.querySelector('head link[rel="stylesheet"][title]');
      if (link) {
        DO.C.DocRefType = link.getAttribute('title');
      }
      if (Object.keys(DO.C.RefType).indexOf(DO.C.DocRefType) == -1) {
        DO.C.DocRefType = 'LNCS';
      }
    },

    getCurrentLinkStylesheet: function() {
      return document.querySelector('head link[rel="stylesheet"][title]:not([href$="dokieli.css"]):not([disabled])');
    },

    showViews: function(node) {
      if(document.querySelector('#document-views')) { return; }

      var stylesheets = document.querySelectorAll('head link[rel~="stylesheet"][title]:not([href$="dokieli.css"])');

      var s = '<section id="document-views" class="do"><h2>Views</h2>' + Icon[".fas.fa-magic"] + '<ul>';
      if (DO.C.GraphViewerAvailable) {
        s += '<li><button class="resource-visualise" title="Change to graph view">Graph</button></li>';
      }
      s += '<li><button title="Change to native device/browser view">Native</button></li>';

      if (stylesheets.length > 0) {
        for (var i = 0; i < stylesheets.length; i++) {
          var stylesheet = stylesheets[i];
          var view = stylesheet.getAttribute('title');
          if(stylesheet.closest('[rel~="alternate"]')) {
            s += '<li><button title="Change to ‘' + view + '’ view">' + view + '</button></li>';
          }
          else {
            s += '<li><button disabled="disabled" title="Current style">' + view + '</button></li>';
          }
        }
      }

      s += '</ul></section>';
      node.insertAdjacentHTML('beforeend', s);

      var viewButtons = document.querySelectorAll('#document-views.do button:not([class~="resource-visualise"])');
      for (let i = 0; i < viewButtons.length; i++) {
        viewButtons[i].removeEventListener('click', DO.U.initCurrentStylesheet);
        viewButtons[i].addEventListener('click', DO.U.initCurrentStylesheet);
      }

      if(DO.C.GraphViewerAvailable) {
        document.querySelector('#document-views.do').addEventListener('click', function(e){
          if (e.target.closest('.resource-visualise')) {
            if(document.querySelector('#graph-view')) { return; }

            if (e) {
              e.target.disabled = true;
            }

            document.documentElement.appendChild(fragmentFromString('<aside id="graph-view" class="do on">' + DO.C.Button.Close + '<h2>Graph view</h2></aside>'));

            var graphView = document.getElementById('graph-view');
            graphView.addEventListener('click', function(e) {
              if (e.target.closest('button.close')) {
                var rv = document.querySelector('#document-views .resource-visualise');
                if (rv) {
                  rv.disabled = false;
                }
              }
            });

            DO.U.showVisualisationGraph(DO.C.DocumentURL, undefined, '#graph-view');
          }
        });
      }
    },

    updateSelectedStylesheets: function(stylesheets, selected) {
      selected = selected.toLowerCase();

      for (var j = 0; j < stylesheets.length; j++) {
        (function(stylesheet) {
          if (stylesheet.getAttribute('title').toLowerCase() != selected) {
              stylesheet.disabled = true;
              stylesheet.setAttribute('rel', 'stylesheet alternate');
          }
        })(stylesheets[j]);
      }
      for (let j = 0; j < stylesheets.length; j++) {
        (function(stylesheet) {
          if (stylesheet.getAttribute('title').toLowerCase() == selected) {
              stylesheet.setAttribute('rel', 'stylesheet');
              stylesheet.disabled = false;
          }
        })(stylesheets[j]);
      }
    },

    initCurrentStylesheet: function(e) {
      var currentStylesheet = DO.U.getCurrentLinkStylesheet();
      currentStylesheet = (currentStylesheet) ? currentStylesheet.getAttribute('title') : '';
      var selected = (e && e.target) ? e.target.textContent.toLowerCase() : currentStylesheet.toLowerCase();
      var stylesheets = document.querySelectorAll('head link[rel~="stylesheet"][title]:not([href$="dokieli.css"])');

      DO.U.updateSelectedStylesheets(stylesheets, selected);

      var bd = document.querySelectorAll('#document-views.do button');
      for(var j = 0; j < bd.length; j++) {
        bd[j].disabled = (e && e.target && (e.target.textContent == bd[j].textContent)) ? true : false;
      }

      DO.U.showRefs();

      if (selected == 'shower') {
        var slides = document.querySelectorAll('.slide');
        for(j = 0; j < slides.length; j++) {
          slides[j].classList.add('do');
        }
        getDocumentContentNode(document).classList.add('on-slideshow', 'list');
        document.querySelector('head').insertAdjacentHTML('beforeend', '<meta content="width=792, user-scalable=no" name="viewport" />');


        var body = getDocumentContentNode(document);
        var dMenu = document.querySelector('#document-menu.do');

        if(dMenu) {
          var dMenuButton = dMenu.querySelector('button');
          var dHead = dMenu.querySelector('header');
          var dInfo = dMenu.querySelector('div');

          dMenuButton.classList.remove('show');
          dMenuButton.classList.add('hide');
          dMenuButton.setAttribute('title', 'Open Menu');
          dMenuButton.innerHTML = Icon[".fas.fa-minus"];
          dMenu.classList.remove('on');
          body.classList.remove('on-document-menu');

          var dMenuSections = dMenu.querySelectorAll('section');
          for (j = 0; j < dMenuSections.length; j++) {
            dMenuSections[j].parentNode.removeChild(dMenuSections[j]);
          }
        }

        var toc = document.getElementById('table-of-contents');
        toc = (toc) ? toc.parentNode.removeChild(toc) : false;

        shower.initRun();
      }
      if (currentStylesheet.toLowerCase() == 'shower') {
        slides = document.querySelectorAll('.slide');
        for (var c = 0; c < slides.length; c++){
          slides[c].classList.remove('do');
        }
        getDocumentContentNode(document).classList.remove('on-slideshow', 'list', 'full');
        getDocumentContentNode(document).removeAttribute('style');
        var mV = document.querySelector('head meta[name="viewport"][content="width=792, user-scalable=no"]');
        mV = (mV) ? mV.parentNode.removeChild(mV) : false;

        history.pushState(null, null, window.location.pathname);

        shower.removeEvents();
      }
    },

    showEmbedData: function(e) {
      if(document.querySelector('#embed-data-in-html')) { return; }

      // var eventEmbedData = function(e) {
        e.target.setAttribute('disabled', 'disabled');
        var scriptCurrent = document.querySelectorAll('head script[id^="meta-"]');

        var scriptType = {
          'meta-turtle': {
            scriptStart: '<script id="meta-turtle" title="Turtle" type="text/turtle">',
            cdataStart: '# ' + DO.C.CDATAStart + '\n',
            cdataEnd: '\n# ' + DO.C.CDATAEnd,
            scriptEnd: '</script>'
          },
          'meta-json-ld': {
            scriptStart: '<script id="meta-json-ld" title="JSON-LD" type="application/ld+json">',
            cdataStart: DO.C.CDATAStart + '\n',
            cdataEnd: '\n' + DO.C.CDATAEnd,
            scriptEnd: '</script>'
          },
          'meta-trig': {
            scriptStart: '<script id="meta-trig" title="TriG" type="application/trig">',
            cdataStart: '# ' + DO.C.CDATAStart + '\n',
            cdataEnd: '\n# ' + DO.C.CDATAEnd,
            scriptEnd: '</script>'
          }
        }

        var scriptCurrentData = {};
        if (scriptCurrent.length > 0) {
          for(var i = 0; i < scriptCurrent.length; i++) {
            var v = scriptCurrent[i];
            var id = v.id;
            scriptCurrentData[id] = v.innerHTML.split(/\r\n|\r|\n/);
            scriptCurrentData[id].shift();
            scriptCurrentData[id].pop();
            scriptCurrentData[id] = {
              'type': v.getAttribute('type') || '',
              'title': v.getAttribute('title') || '',
              'content' : scriptCurrentData[id].join('\n')
            };
          }
        }

        var embedMenu = '<aside id="embed-data-entry" class="do on tabs">' + DO.C.Button.Close + '\n\
        <h2>Embed Data</h2>\n\
        <nav><ul><li class="selected"><a href="#embed-data-turtle">Turtle</a></li><li><a href="#embed-data-json-ld">JSON-LD</a></li><li><a href="#embed-data-trig">TriG</a></li></ul></nav>\n\
        <div id="embed-data-turtle" class="selected"><textarea placeholder="Enter data in Turtle" name="meta-turtle" cols="80" rows="24">' + ((scriptCurrentData['meta-turtle']) ? scriptCurrentData['meta-turtle'].content : '') + '</textarea><button class="save" title="Embed data into document">Save</button></div>\n\
        <div id="embed-data-json-ld"><textarea placeholder="Enter data in JSON-LD" name="meta-json-ld" cols="80" rows="24">' + ((scriptCurrentData['meta-json-ld']) ? scriptCurrentData['meta-json-ld'].content : '') + '</textarea><button class="save" title="Embed data into document">Save</button></div>\n\
        <div id="embed-data-trig"><textarea placeholder="Enter data in TriG" name="meta-trig" cols="80" rows="24">' + ((scriptCurrentData['meta-trig']) ? scriptCurrentData['meta-trig'].content : '') + '</textarea><button class="save" title="Embed data into document">Save</button></div>\n\
        </aside>';

        document.documentElement.appendChild(fragmentFromString(embedMenu));
        document.querySelector('#embed-data-turtle textarea').focus();
        var a = document.querySelectorAll('#embed-data-entry nav a');
        for(let i = 0; i < a.length; i++) {
          a[i].addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();

            var li = e.target.parentNode;
            if(!li.classList.contains('selected')) {
              document.querySelector('#embed-data-entry nav li.selected').classList.remove('selected');
              li.classList.add('selected');
              document.querySelector('#embed-data-entry > div.selected').classList.remove('selected');
              var d = document.querySelector('#embed-data-entry > div' + e.target.hash);
              d.classList.add('selected');
              d.querySelector('textarea').focus();
            }
          });
        }

        document.querySelector('#embed-data-entry button.close').addEventListener('click', function(e) {
          document.querySelector('button.embed-data-meta').removeAttribute('disabled');
        });

        var buttonSave = document.querySelectorAll('#embed-data-entry button.save');
        for (let i = 0; i < buttonSave.length; i++) {
          buttonSave[i].addEventListener('click', function(e) {
            var textarea = e.target.parentNode.querySelector('textarea');
            var name = textarea.getAttribute('name');
            var scriptEntry = textarea.value;
            var script = document.getElementById(name);

            if (scriptEntry.length > 0) {
              //If there was a script already
              if (script) {
                script.textContent = scriptType[name].cdataStart + scriptEntry + scriptType[name].cdataEnd;
              }
              else {
                document.querySelector('head').appendChild(fragmentFromString(scriptType[name].scriptStart + scriptType[name].scriptEnd));
                var textNode = document.createTextNode(scriptType[name].cdataStart + scriptEntry + scriptType[name].cdataEnd);
                document.getElementById(name).appendChild(textNode);
              }
            }
            else {
              //Remove if no longer used
              script.parentNode.removeChild(script);
            }

            var ede = document.getElementById('embed-data-entry');
            ede.parentNode.removeChild(ede);
            document.querySelector('.embed-data-meta').removeAttribute('disabled');
          });
        }
      // };

      // var edih = document.querySelector('button.embed-data-meta');
      // edih.removeEventListener('click', eventEmbedData);
      // edih.addEventListener('click', eventEmbedData);
    },

    showDocumentMetadata: function(node) {
      if(document.querySelector('#document-metadata')) { return; }

      var documentURL = DO.C.DocumentURL;

      var content = selectArticleNode(document);
      var count = DO.U.contentCount(content);
      var authors = [], contributors = [], editors = [];
      var citationsTo = [];
      var requirements = [];
      var advisements = [];
      var skos = [];

      var subjectURI = window.location.origin + window.location.pathname;
      var options = {'contentType': 'text/html', 'subjectURI': subjectURI };

      var s = DO.C.Resource[documentURL].graph;
 // console.log(s)

      var triples = s._graph;
      var citations = Object.keys(DO.C.Citation).concat(DO.C.Vocab["schemacitation"]["@id"]);
      triples.forEach(function(t){
        var s = t.subject.nominalValue;
        var p = t.predicate.nominalValue;
        var o = t.object.nominalValue;

        if(citations.indexOf(p) > -1) {
          citationsTo.push(t);
        }
      });

      requirements = (DO.C.Resource[documentURL].spec && DO.C.Resource[documentURL].spec['requirement']) ? Object.keys(DO.C.Resource[documentURL].spec['requirement']) : [];
      advisements = (DO.C.Resource[documentURL].spec && DO.C.Resource[documentURL].spec['advisement']) ? Object.keys(DO.C.Resource[documentURL].spec['advisement']) : [];
      skos = (DO.C.Resource[documentURL].skos) ? DO.C.Resource[documentURL].skos : [];

      citations = '<tr class="citations"><th>Citations</th><td>' + citationsTo.length + '</td></tr>';
      requirements = '<tr class="requirements"><th>Requirements</th><td>' + requirements.length + '</td></tr>';
      advisements = '<tr class="advisements"><th>Advisements</th><td>' + advisements.length + '</td></tr>';
      var conceptsList = [];
      conceptsList = (skos.type && skos.type[DO.C.Vocab['skosConcept']['@id']]) ? skos.type[DO.C.Vocab['skosConcept']['@id']] : conceptsList;

      var concepts = '<tr class="concepts"><th>Concepts</th><td>' + conceptsList.length + '</td></tr>';
      var statements = '<tr class="statements"><th>Statements</th><td>' + triples.length + '</td></tr>';

      var g = s.child(options['subjectURI']);
// console.log(g)

      if(g.schemaeditor._array.length > 0) {
        g.schemaeditor.forEach(function(s){
          editors.push('<li>' + getGraphLabelOrIRI(g.child(s)) + '</li>');
        });
        if(editors.length > 0){
          editors = '<tr class="people"><th>Editors</th><td><ul class="editors">' + editors.join('') + '</ul></td></tr>';
        }
      }

      if(g.schemaauthor._array.length > 0) {
        g.schemaauthor.forEach(function(s){
          authors.push('<li>' + getGraphLabelOrIRI(g.child(s)) + '</li>');
        });
        if(authors.length > 0){
          authors = '<tr class="people"><th>Authors</th><td><ul class="authors">' + authors.join('') + '</ul></td></tr>';
        }
      }

      if(g.schemacontributor._array.length > 0) {
        g.schemacontributor.forEach(function(s){
          contributors.push('<li>' + getGraphLabelOrIRI(g.child(s)) + '</li>');
        });
        if(contributors.length > 0){
          contributors = '<tr class="people"><th>Contributors</th><td><ul class="contributors">' + contributors.join('') + '</ul></td></tr>';
        }
      }

      var data = authors + editors + contributors + citations + requirements + advisements + concepts + statements;

          // <tr><th>Lines</th><td>' + count.lines + '</td></tr>\n\
          // <tr><th>A4 Pages</th><td>' + count.pages.A4 + '</td></tr>\n\
          // <tr><th>US Letter</th><td>' + count.pages.USLetter + '</td></tr>\n\
      var html = '<section id="document-metadata" class="do"><table>\n\
        <caption>Document Metadata</caption>\n\
        <tbody>\n\
          ' + data + '\n\
          <tr><th>Reading time</th><td>' + count.readingTime + ' minutes</td></tr>\n\
          <tr><th>Characters</th><td>' + count.chars + '</td></tr>\n\
          <tr><th>Words</th><td>' + count.words + '</td></tr>\n\
          <tr><th>Bytes</th><td>' + count.bytes + '</td></tr>\n\
        </tbody>\n\
      </table></section>';

      node.insertAdjacentHTML('beforeend', html);
    },

    contentCount: function contentCount (node) {
      node = node || selectArticleNode(document);
      node = getNodeWithoutClasses(node, 'do');
      var doctype = (node instanceof Element && node.tagName.toLowerCase() === 'html') ? getDoctype() : '';
      var content = node.textContent.trim();
      var contentCount = { readingTime:1, words:0, chars:0, lines:0, pages:{A4:1, USLetter:1}, bytes:0 };
      if (content.length > 0) {
        var lineHeight = node.ownerDocument.defaultView.getComputedStyle(node, null)["line-height"];
        var linesCount = Math.ceil(node.clientHeight / parseInt(lineHeight));
        contentCount = {
          readingTime: Math.ceil(content.split(' ').length / 200),
          words: content.match(/\S+/g).length,
          chars: content.length,
          lines: linesCount,
          pages: { A4: Math.ceil(linesCount / 47), USLetter: Math.ceil(linesCount / 63) },
          bytes: encodeURI(doctype + node.outerHTML).split(/%..|./).length - 1
        };
      }
      return contentCount;
    },

    showExtendedConcepts: function() {
      var documentURL = DO.C.DocumentURL;
      var citationsList = DO.C.Resource[documentURL].citations;

      var promises = [];
      citationsList.forEach(function(u) {
        // console.log(u);
        // window.setTimeout(function () {
          var pIRI = getProxyableIRI(u);
          promises.push(getResourceGraph(pIRI));
        // }, 1000)
      });

      var dataGraph = SimpleRDF();
      var html = [];

      return Promise.all(promises.map(p => p.catch(e => e)))
        .then(function(graphs) {
          graphs.forEach(function(g){
// console.log(g)
            if (g && g._graph.length > 0){
              var documentURL = g.iri().toString();
// console.log(documentURL)
// console.log(g)
              DO.C.Resource[documentURL] = DO.C.Resource[documentURL] || {};
              DO.C.Resource[documentURL]['graph'] = g;
              DO.C.Resource[documentURL]['skos'] = getResourceInfoSKOS(g);
              DO.C.Resource[documentURL]['title'] = getGraphLabel(g) || documentURL;

              if (DO.C.Resource[documentURL]['skos']['graph']._graph.length > 0) {
                html.push('<section><h4><a href="' + documentURL + '">' + DO.C.Resource[documentURL]['title'] + '</a></h4><div><dl>' + DO.U.getDocumentConceptDefinitionsHTML(documentURL) + '</dl></div></section>');

                dataGraph.graph().addAll(DO.C.Resource[documentURL]['skos']['graph']);
              }
            }
          });

          var id = 'list-of-additional-concepts';
          html = '<section id="' + id + '"><h3>Additional Concepts</h3><div><button class="graph">View Graph</button><figure></figure>' + html.join('') + '</div></section>';

          var aC = document.getElementById(id);
          if (aC) {
            aC.parentNode.removeChild(aC);
          }

          var loC = document.getElementById('list-of-concepts');

          var ic = loC.querySelector('#include-concepts');
          if (ic) { ic.parentNode.removeChild(ic); }

          loC.querySelector('div').insertAdjacentHTML('beforeend', html);

          // insertDocumentLevelHTML(document, html, { 'id': id });

          aC = document.getElementById(id);
          window.history.replaceState(null, null, '#' + id);
          aC.scrollIntoView();

          var selector = '#' + id + ' figure';

          aC.addEventListener('click', function(e){
            var button = e.target.closest('button.graph');
            if (button) {
              button.parentNode.removeChild(button);

              serializeGraph(dataGraph, { 'contentType': 'text/turtle' })
                .then(function(data){
                  var options = {};
                  options['subjectURI'] = DO.C.DocumentURL;
                  options['contentType'] = 'text/turtle';
                  DO.U.showVisualisationGraph(options.subjectURI, data, selector, options);
                });
            }
          })

// console.log(dataGraph)


// console.log(DO.C.Resource)
          return dataGraph;
        });
    },

    getDocumentConceptDefinitionsHTML: function(documentURL) {
// console.log(documentURL)
      var g;
      var s = '';
      Object.keys(DO.C.Resource[documentURL]['skos']['type']).forEach(function(rdftype) {
// console.log(rdftype)
        s += '<dt>' + DO.C.SKOSClasses[rdftype] + 's</dt>';

        if (rdftype == DO.C.Vocab['skosConcept']['@id']) {
          s += '<dd><ul>';
        }

        sortToLower(DO.C.Resource[documentURL]['skos']['type'][rdftype]).forEach(function(subject) {
// console.log(subject)
          g = DO.C.Resource[documentURL]['graph'].child(subject);

          var conceptLabel = sortToLower(getGraphConceptLabel(g));
          conceptLabel = (conceptLabel.length > 0) ? conceptLabel.join(' / ') : getFragmentOrLastPath(subject);
          conceptLabel = conceptLabel.trim();
          conceptLabel = '<a href="' + subject + '">' + conceptLabel + '</a>';

          if (rdftype == DO.C.Vocab['skosConcept']['@id']) {
            s += '<li>' + conceptLabel + '</li>';
          }
          else {
            s += '<dd>';
            s += '<dl>';
            s += '<dt>' + conceptLabel + '</dt><dd><ul>';

            var hasConcepts = [DO.C.Vocab['skoshasTopConcept']['@id'], DO.C.Vocab['skosmember']['@id']];

            hasConcepts.forEach(function(hasConcept) {
              var concept = DO.C.Resource[documentURL]['skos']['data'][subject][hasConcept];

              if (concept && concept.length > 0) {
                sortToLower(concept).forEach(function(c) {
                  var conceptGraph = DO.C.Resource[documentURL]['graph'].child(c);
                  var cLabel = getGraphConceptLabel(conceptGraph);
                  cLabel = (cLabel.length > 0) ? cLabel : [getFragmentOrLastPath(c)];
                  cLabel.forEach(function(cL) {
                    cL = cL.trim();
                    s += '<li><a href="' + c + '">' + cL + '</a></li>';
                  });
                });
              }
            });
            s += '</ul></dd></dl>';
            s += '</dd>';
          }
        })

        if (rdftype == DO.C.Vocab['skosConcept']['@id']) {
          s += '</ul></dd>';
        }
      });

      return s;
    },

    showDocumentCommunicationOptions: function(node) {
      var html = [];

      var documentURL = DO.C.DocumentURL;

      function waitUntil() {
        if (!DO.C.Resource[documentURL].headers?.linkHeaders?.has('rel', 'describedby')) {
          window.setTimeout(waitUntil, 250);
        }
        else {
          var db = DO.C.Resource[documentURL].headers.linkHeaders.rel('describedby');

          var missingResource = db.filter(function(relationItem) { return !DO.C.Resource[relationItem.uri]; });

          if (missingResource == undefined) {
            window.setTimeout(waitUntil, 250);
          }
          else {
            db.forEach(relationItem => {
              if (DO.C.Resource[relationItem.uri]?.graph !== undefined) {
                html.push(DO.U.getCommunicationOptions(DO.C.Resource[relationItem.uri].graph, { 'subjectURI': documentURL }));
              }
            });

            if (html.length > 0) {
              node.insertAdjacentHTML('beforeend', html);

              var nodes = document.querySelectorAll('#' + node.id + ' [id^="notification-subscriptions-"]');
              DO.U.buttonSubscribeNotificationChannel(nodes, documentURL);
            }
          }
        }
      }

      waitUntil();
    },

    showDocumentItems: function() {
      var documentItems = document.getElementById('document-items');
      if (documentItems) {
        documentItems.parentNode.removeChild(documentItems);
      }

      document.documentElement.appendChild(fragmentFromString('<aside id="document-items" class="do on">' + DO.C.Button.Close + '</aside>'));
      documentItems = document.getElementById('document-items');

      var articleNode = selectArticleNode(document);
      var sections = articleNode.querySelectorAll('section:not(section section):not([id^=table-of]):not([id^=list-of])');

      if (sections.length > 0) {
        DO.U.showListOfStuff(documentItems);

        DO.U.showTableOfContents(documentItems, sections)

        if(DO.C.SortableList && DO.C.EditorEnabled) {
          DO.U.sortToC();
        }
      }

      DO.U.showDocumentMetadata(documentItems);

      DO.U.showDocumentCommunicationOptions(documentItems);
    },

    showListOfStuff: function(node) {
      if (!node) { return; }

      var disabledInput = '', s = [];
      if (!DO.C.EditorEnabled) {
        disabledInput = ' disabled="disabled"';
      }

      Object.keys(DO.C.ListOfStuff).forEach(function(id) {
        var checkedInput = '';
        var label = DO.C.ListOfStuff[id].label;
        var selector = DO.C.ListOfStuff[id].selector;

        var item = document.getElementById(id);

        if(item) {
          checkedInput = ' checked="checked"';

          // DO.U.buildListOfStuff(id);
        }

        s.push('<li><input id="l-o-s-' + id +'" type="checkbox"' + disabledInput + checkedInput + '/><label for="l-o-s-' + id + '">' + label + '</label></li>');
      });

      if (s.length > 0) {
        node.insertAdjacentHTML('beforeend', '<section id="list-of-stuff" class="do"><h2>List of Stuff</h2><ul>' + s.join('') + '</ul></section>');

        if(DO.C.EditorEnabled) {
          document.getElementById('list-of-stuff').addEventListener('click', function(e){
            if (e.target.closest('input')) {
              var id = e.target.id.slice(6);
              if(!e.target.getAttribute('checked')) {
                DO.U.buildListOfStuff(id);
                e.target.setAttribute('checked', 'checked');
                window.location.hash = '#' + id;
              }
              else {
                var tol = document.getElementById(id);
                if(tol) {
                  tol.parentNode.removeChild(tol);

                  removeReferences();
                }
                e.target.removeAttribute('checked');
                window.history.replaceState(null, null, window.location.pathname);
              }
            }
          });
        }
      }
    },

    showTableOfContents: function(node, sections, options) {
      options = options || {}
      var sortable = (DO.C.SortableList && DO.C.EditorEnabled) ? ' sortable' : '';

      if (!node) { return; }

      var toc = '<section id="table-of-contents-i" class="do"' + sortable + '><h2>' + DO.C.ListOfStuff['table-of-contents'].label + '</h2><ol class="toc' + sortable + '">';
      toc += DO.U.getListOfSections(sections, {'sortable': DO.C.SortableList});
      toc += '</ol></section>';

      node.insertAdjacentHTML('beforeend', toc);
    },


    sortToC: function() {
    },

    getListOfSections: function(sections, options) {
      options = options || {};
      var s = '', attributeClass = '';
      if (options.sortable == true) { attributeClass = ' class="sortable"'; }

      for (var i = 0; i < sections.length; i++) {
        var section = sections[i];
        if(section.id) {
          var heading = section.querySelector('h1, h2, h3, h4, h5, h6, header h1, header h2, header h3, header h4, header h5, header h6') || { 'textContent': section.id };
          var currentHash = '';
          var dataId = ' data-id="' + section.id +'"';

          if (!options.raw) {
            currentHash = (document.location.hash == '#' + section.id) ? ' class="selected"' : '';
            attributeClass = '';
          }

          if (heading) {
            s += '<li' + currentHash + dataId + '><a href="#' + section.id + '">' + heading.textContent + '</a>';
            var subsections = section.parentNode.querySelectorAll('[id="' + section.id + '"] > div > section[rel*="hasPart"]:not([class~="slide"]), [id="' + section.id + '"] > section[rel*="hasPart"]:not([class~="slide"])');

            if (subsections.length > 0) {
              s += '<ol'+ attributeClass +'>';
              s += DO.U.getListOfSections(subsections, options);
              s += '</ol>';
            }
            s += '</li>';
          }
        }
      }

      return s;
    },

    buildListOfStuff: function(id) {
      var s = '';

      var documentURL = DO.C.DocumentURL;

      if(id == 'references'){
        buildReferences();
      }
      else {
        var label = DO.C.ListOfStuff[id].label;
        var selector = DO.C.ListOfStuff[id].selector;
        var titleSelector = DO.C.ListOfStuff[id].titleSelector;

        var nodes = document.querySelectorAll('section:not([class~="do"]) ' + selector);

        if (id == 'table-of-contents' || id == 'list-of-concepts' || nodes.length > 0) {
          var tId = document.getElementById(id);

          if(tId) { tId.parentNode.removeChild(tId); }

          switch(id) {
            default:
              s += '<nav id="' + id + '">';
              s += '<h2>' + label + '</h2>';
              s += '<div><ol class="toc">';
              break;

            case 'list-of-abbreviations':
              s += '<section id="' + id + '">';
              s += '<h2>' + label + '</h2>';
              s += '<div><dl>';
              break;

            case 'list-of-quotations':
              s += '<section id="' + id + '">';
              s += '<h2>' + label + '</h2>';
              s += '<div><ul>';
              break;

            case 'list-of-concepts':
              s += '<section id="' + id + '">';
              s += '<h2>' + label + '</h2>';
              var d = DO.C.Resource[documentURL].citations || [];
              if (d.length > 0) {
                s += '<div><p id="include-concepts"><button class="add">Include concepts</button> from <data value="' + d.length + '">' + d.length + '</data> external references.</p>';
              }
              s += '<dl>';
              break;

            case 'table-of-requirements':
              s += '<section id="' + id + '">';
              s += '<h2>' + label + '</h2>';
              s += '<div><table>';
              break;

            case 'table-of-advisements':
              s += '<section id="' + id + '">';
              s += '<h2>' + label + '</h2>';
              s += '<div><table>';
              break;
          }

          if (id == 'table-of-contents') {
            var articleNode = selectArticleNode(document);
            s += DO.U.getListOfSections(articleNode.querySelectorAll('section:not(section section)'), {'raw': true});
          }
          else {
            //TODO: Perhaps table-of-requirements and table-of-advisements could be consolidated / generalised.

            if (id == 'table-of-requirements') {
//TODO: Sort by requirementSubject then requirementLevel? or offer controls on the table.

              s += '<caption>Conformance Requirements and Test Coverage</caption>'
              s += '<thead><tr><th colspan="3">Requirement</th></tr><tr><th>Subject</th><th>Level</th><th>Statement</th></tr></thead>';
              s += '<tbody>';
              Object.keys(DO.C.Resource[documentURL]['spec']['requirement']).forEach(function(i) {
// console.log(DO.C.Resource[documentURL]['spec'][i])
                var statement = DO.C.Resource[documentURL]['spec']['requirement'][i][DO.C.Vocab['specstatement']['@id']] || i;
                //FIXME: This selector is brittle.
                // var requirementIRI = document.querySelector('#document-identifier [rel="owl:sameAs"]');
                var requirementIRI = document.querySelector('#document-latest-published-version [rel~="rel:latest-version"]');
                requirementIRI = (requirementIRI) ? requirementIRI.href : i;

                requirementIRI = i.replace(stripFragmentFromString(i), requirementIRI);
                statement = '<a href="' + requirementIRI + '">' + statement + '</a>';

                var requirementSubjectIRI = DO.C.Resource[documentURL]['spec']['requirement'][i][DO.C.Vocab['specrequirementSubject']['@id']];
                var requirementSubjectLabel = requirementSubjectIRI || '<span class="warning">?</span>';
                if (requirementSubjectLabel.startsWith('http')) {
                  requirementSubjectLabel = getFragmentFromString(requirementSubjectIRI) || getURLLastPath(requirementSubjectIRI) || requirementSubjectLabel;
                }
                var requirementSubject = '<a href="' + requirementSubjectIRI + '">' + requirementSubjectLabel + '</a>';

                var requirementLevelIRI = DO.C.Resource[documentURL]['spec']['requirement'][i][DO.C.Vocab['specrequirementLevel']['@id']];
                var requirementLevelLabel = requirementLevelIRI || '<span class="warning">?</span>';
                if (requirementLevelLabel.startsWith('http')) {
                  requirementLevelLabel = getFragmentFromString(requirementLevelIRI) || getURLLastPath(requirementLevelIRI) || requirementLevelLabel;
                }
                var requirementLevel = '<a href="' + requirementLevelIRI + '">' + requirementLevelLabel + '</a>';

                s += '<tr about="' + requirementIRI + '">';
                s += '<td>' + requirementSubject + '</td>';
                s += '<td>' + requirementLevel + '</td>';
                s += '<td>' + statement + '</td>';
                s += '</tr>'
              });
              s += '</tbody>';
            }
            else if (id == 'table-of-advisements') {
//TODO: Sort by advisementSubject then advisementLevel? or offer controls on the table.

              s += '<caption>Non-normative Advisements</caption>'
              s += '<thead><tr><th colspan="2">Advisement</th></tr><tr><th>Level</th><th>Statement</th></tr></thead>';
              s += '<tbody>';
              Object.keys(DO.C.Resource[documentURL]['spec']['advisement']).forEach(function(i) {
// console.log(DO.C.Resource[documentURL]['spec']['advisement'][i])
                var statement = DO.C.Resource[documentURL]['spec']['advisement'][i][DO.C.Vocab['specstatement']['@id']] || i;
                //FIXME: This selector is brittle.
                //TODO: Revisit this:
                // var advisementIRI = document.querySelector('#document-identifier [rel="owl:sameAs"]');
                var advisementIRI = document.querySelector('#document-latest-published-version [rel~="rel:latest-version"]');
                advisementIRI = (advisementIRI) ? advisementIRI.href : i;

                advisementIRI = i.replace(stripFragmentFromString(i), advisementIRI);
                statement = '<a href="' + advisementIRI + '">' + statement + '</a>';

                // var advisementSubjectIRI = DO.C.Resource[documentURL]['spec']['advisement'][i][DO.C.Vocab['specadvisementSubject']['@id']];
                // var advisementSubjectLabel = advisementSubjectIRI || '<span class="warning">?</span>';
                // if (advisementSubjectLabel.startsWith('http')) {
                //   advisementSubjectLabel = getFragmentFromString(advisementSubjectIRI) || getURLLastPath(advisementSubjectIRI) || advisementSubjectLabel;
                // }
                // var advisementSubject = '<a href="' + advisementSubjectIRI + '">' + advisementSubjectLabel + '</a>';

                var advisementLevelIRI = DO.C.Resource[documentURL]['spec']['advisement'][i][DO.C.Vocab['specadvisementLevel']['@id']];
                var advisementLevelLabel = advisementLevelIRI || '<span class="warning">?</span>';
                if (advisementLevelLabel.startsWith('http')) {
                  advisementLevelLabel = getFragmentFromString(advisementLevelIRI) || getURLLastPath(advisementLevelIRI) || advisementLevelLabel;
                }
                var advisementLevel = '<a href="' + advisementLevelIRI + '">' + advisementLevelLabel + '</a>';

                s += '<tr about="' + advisementIRI + '">';
                // s += '<td>' + advisementSubject + '</td>';
                s += '<td>' + advisementLevel + '</td>';
                s += '<td>' + statement + '</td>';
                s += '</tr>'
              });
              s += '</tbody>';
            }
            else if (id == 'list-of-abbreviations') {
              if (nodes.length > 0) {
                nodes = [].slice.call(nodes);
                nodes.sort(function(a, b) {
                  return a.textContent.toLowerCase().localeCompare(b.textContent.toLowerCase());
                });
              }

              var processed = [];
              for (var i = 0; i < nodes.length; i++) {
                if (processed.indexOf(nodes[i].textContent) < 0) {
                  s += '<dt>' + nodes[i].textContent + '</dt>';
                  s += '<dd>' + nodes[i].getAttribute(titleSelector) + '</dd>';
                  processed.push(nodes[i].textContent);
                }
              }
            }
            else if (id == 'list-of-concepts') {
// console.log(DO.C.Resource[documentURL]['skos'])
              s += DO.U.getDocumentConceptDefinitionsHTML(documentURL);
            }
            //list-of-figures, list-of-tables, list-of-quotations, table-of-requirements
            else {
              processed = [];
              for (let i = 0; i < nodes.length; i++) {
                var title, textContent;

                if (id == 'list-of-quotations') {
                  title = nodes[i].getAttribute(titleSelector);
                }
                else {
                  title = nodes[i].querySelector(titleSelector);
                }

                if (title) {
                  if (id == 'list-of-quotations') {
                    textContent = removeSelectorFromNode(nodes[i], '.do').textContent;
                  }
                  else {
                    textContent = removeSelectorFromNode(title, '.do').textContent;
                  }

                  if (processed.indexOf(textContent) < 0) {
                    if (id == 'list-of-quotations') {
                      s += '<li><q>' + textContent + '</q>, <a href="' + title + '">' + title + '</a></li>';
                    }
                    else if(nodes[i].id){
                      s += '<li><a href="#' + nodes[i].id +'">' + textContent +'</a></li>';
                    }
                    else {
                      s += '<li>' + textContent +'</li>';
                    }

                    processed.push(textContent);
                  }
                }
              }
            }
          }

          switch(id) {
            default:
              s += '</ol></div>';
              s += '</nav>';
              break;

            case 'list-of-abbreviations':
              s += '</dl></div>';
              s += '</section>';
              break;

            case 'list-of-quotations':
              s += '</ul></div>';
              s += '</section>';
              break;

            case 'list-of-concepts':
              s += '</dl></div>';
              s += '</section>';
              break;

            case 'table-of-requirements':
              s += '</table></div>';
              s += '</section>';
              break;
          }
        }
      }

      insertDocumentLevelHTML(document, s, { 'id': id });

      if (id == 'table-of-requirements') {
        var testSuites = DO.C.Resource[documentURL].graph.spectestSuite;
        if (testSuites && testSuites.at(0)) {
          //TODO: Process all spec:testSuites
          var url = testSuites.at(0);

          getResourceGraph(url).then(
            function(g){
// console.log(g)
              if (g) {
                DO.U.insertTestCoverageToTable(id, g);
              }
            },
            function(reason){
console.log(reason);
            }
          );
        }

        var predecessorVersion = DO.C.Resource[documentURL].graph.relpredecessorversion;
        if (predecessorVersion) {
          url = predecessorVersion;

          var sourceGraph = DO.C.Resource[documentURL].graph;
          var sourceGraphURI = sourceGraph.iri().toString();

          var buttonTextDiffRequirements = 'Diff requirements with the predecessor version';

          var table = document.getElementById(id);
          var thead = table.querySelector('thead');
          thead.querySelector('tr > th').insertAdjacentHTML('beforeend', '<button id="include-diff-requirements" class="do add" disabled="disabled" title="' + buttonTextDiffRequirements + '">' + Icon[".fas.fa-circle-notch.fa-spin.fa-fw"] + '</button>');

          getResourceGraph(url).then(
            function(targetGraph){
              if (targetGraph) {
                var targetGraphURI = targetGraph.iri().toString();

                var buttonRD = document.getElementById('include-diff-requirements');
                buttonRD.innerHTML = Icon[".fas.fa-plus-minus"];
                buttonRD.disabled = false;

                buttonRD.addEventListener('click', function(e) {
                  var button = e.target.closest('button');
                  if (button){
                    if (button.classList.contains('add')) {
                      button.classList.remove('add');
                      button.classList.add('remove');
                      button.setAttribute('title', "Show requirements");
                      button.innerHTML = Icon[".fas.fa-list-check"];

                      if (!button.classList.contains('checked')) {
                        DO.U.diffRequirements(sourceGraph, targetGraph);
                        button.classList.add('checked');
                      }

                      table.querySelectorAll('tbody tr').forEach(tr => {
                        var sR = tr.getAttribute('about');
                        var td = tr.querySelector('td:nth-child(3)');
                        sR = sR.replace(stripFragmentFromString(sR), sourceGraphURI);
                        var tR = targetGraphURI + '#' + getFragmentFromString(sR);
                        td.innerHTML = DO.C.Resource[sourceGraphURI].spec['requirement'][sR]['diff'][tR]['statement'] || '';
                      });
                    }
                    else if (button.classList.contains('remove')) {
                      button.classList.remove('remove');
                      button.classList.add('add');
                      button.setAttribute('title', buttonTextDiffRequirements);
                      button.innerHTML = Icon[".fas.fa-plus-minus"];

                      table.querySelectorAll('tbody tr').forEach(tr => {
                        var sR = tr.getAttribute('about');
                        var td = tr.querySelector('td:nth-child(3)');
                        var sourceRequirementURI = sourceGraphURI + '#' + getFragmentFromString(sR);
                        var statement = DO.C.Resource[sourceGraphURI].spec['requirement'][sourceRequirementURI][DO.C.Vocab['specstatement']['@id']] || sR;
                        td.innerHTML = '<a href="' + sR + '">' + statement + '</a>';
                      });
                    }
                  }
                });
              }
            },
            function(reason){
console.log(reason);
            }
          );
        }
      }

      if (id == 'list-of-concepts') {
        document.getElementById(id).addEventListener('click', function(e) {
          var button = e.target.closest('button.add');
          if (button) {
            button.disabled = true;
            button.insertAdjacentHTML('beforeend', Icon[".fas.fa-circle-notch.fa-spin.fa-fw"]);

            DO.U.showExtendedConcepts();
          }
        })
      }
    },

    diffRequirements: function(sourceGraph, targetGraph) {
      var documentURL = DO.C.DocumentURL;
      var sourceGraphURI = sourceGraph.iri().toString();
      var targetGraphURI = targetGraph.iri().toString();
      var sourceRequirements = getResourceInfoSpecRequirements(sourceGraph);
      var targetRequirements = getResourceInfoSpecRequirements(targetGraph);

      var changes = Object.values(DO.C.Resource[sourceGraphURI].change);

      Object.keys(sourceRequirements).forEach(sR => {
        DO.C.Resource[sourceGraphURI].spec['requirement'][sR]['diff'] = {};

        var sRStatement = sourceRequirements[sR][DO.C.Vocab['specstatement']['@id']] || '';
        var tR = targetGraphURI + '#' + getFragmentFromString(sR);

        DO.C.Resource[sourceGraphURI].spec['requirement'][sR]['diff'][tR] = {};

        var tRStatement = '';

        if (targetRequirements[tR]) {
          tRStatement = targetRequirements[tR][DO.C.Vocab['specstatement']['@id']] || '';
        }

        var change = changes.filter(change => change[DO.C.Vocab['specchangeSubject']['@id']] == sR)[0];
        var changeHTML = '';
        if (change) {
          var changeClass = change[DO.C.Vocab['specchangeClass']['@id']];
          var changeDescription = change[DO.C.Vocab['specstatement']['@id']];
          if (changeClass) {
            var changeClassValue = DO.C.ChangeClasses[changeClass] || changeClass;
            if (changeDescription) {
              changeDescription = '<dt>Change Description</dt><dd>' + changeDescription + '</dd>';
            }
            changeHTML = '<details><summary>Changelog</summary><dl><dt>Change Class</dt><dd><a href="' + changeClass + '">' + changeClassValue + '</a></dd>' + changeDescription + '</dl></details>';
          }
        }

        var diff = diffChars(tRStatement, sRStatement);
        var diffHTML = [];
        diff.forEach((part) => {
          var eName = 'span';

          if (part.added) {
            eName = 'ins';
          }
          else if (part.removed) {
            eName = 'del';
          }

          diffHTML.push('<' + eName + '>' + part.value + '</' + eName + '>');
        });

        DO.C.Resource[sourceGraphURI].spec['requirement'][sR]['diff'][tR]['statement'] = diffHTML.join('') + changeHTML;
      });
    },

    // ?spec spec:requirement ?requirement .
    // ?spec spec:implementationReport ?implementationReport .
    // ?spec spec:testSuite ?testSuite .
    // ?testSuite ldp:contains ?testCase .
    // ?testCase spec:requirementReference ?requirement .
    insertTestCoverageToTable(id, testSuiteGraph) {
      var table = document.getElementById(id);
      var thead = table.querySelector('thead');
      thead.querySelector('tr:first-child').insertAdjacentHTML('beforeend', '<th colspan="2">Coverage</th>');
      thead.querySelector('tr:nth-child(2)').insertAdjacentHTML('beforeend', '<th>Test Case (Review Status)</th>');

      var subjects = [];
      testSuiteGraph.graph().toArray().forEach(function(t){
        subjects.push(t.subject.nominalValue);
      });
      subjects = uniqueArray(subjects);

      var testCases = [];

      //FIXME: Brittle selector
      var specificationReferenceBase = document.querySelector('#document-latest-published-version [rel~="rel:latest-version"]').href;
// console.log(specificationReferenceBase)

      subjects.forEach(function(i){
        var s = testSuiteGraph.child(i)
        var testCaseIRI = s.iri().toString();
// console.log(s)
        var types = s.rdftype._array || [];

        if (types.length > 0) {
          var resourceTypes = types;
          if (resourceTypes.indexOf('http://www.w3.org/2006/03/test-description#TestCase') > -1){
            if (s.specrequirementReference && s.specrequirementReference.startsWith(specificationReferenceBase)) {
              testCases[testCaseIRI] = {};
              testCases[testCaseIRI][DO.C.Vocab['specrequirementReference']['@id']] = s.specrequirementReference;
              testCases[testCaseIRI][DO.C.Vocab['testdescriptionreviewStatus']['@id']] = s.testdescriptionreviewStatus;
              testCases[testCaseIRI][DO.C.Vocab['dctermstitle']] = s.dctermstitle;
            }
          }
        }
      });

// console.log(testCases);

      table.querySelectorAll('tbody tr').forEach(function(tr){
        var requirement = tr.querySelector('td:nth-child(3) a').href;

        Object.keys(testCases).forEach(testCaseIRI => {
          if (testCases[testCaseIRI][DO.C.Vocab['specrequirementReference']['@id']] == requirement) {
            var testCaseLabel = testCases[testCaseIRI][DO.C.Vocab['dctermstitle']] || testCaseIRI;

            var testCaseHTML = '<a href="'+ testCaseIRI + '">' + testCaseLabel + '</a>';

            if (testCases[testCaseIRI][DO.C.Vocab['testdescriptionreviewStatus']['@id']]) {
              var reviewStatusIRI = testCases[testCaseIRI][DO.C.Vocab['testdescriptionreviewStatus']['@id']];
              var reviewStatusLabel = getFragmentFromString(reviewStatusIRI) || getURLLastPath(reviewStatusIRI) || reviewStatusIRI;

              var reviewStatusHTML = ' (<a href="'+ reviewStatusIRI + '">' + reviewStatusLabel + '</a>)';

              testCaseHTML = testCaseHTML + reviewStatusHTML;
            }

            testCaseHTML = '<li>' + testCaseHTML + '</li>';

            var tdTestCase = tr.querySelector('td:nth-child(4)');

            if (tdTestCase) {
              tdTestCase.querySelector('ul').insertAdjacentHTML('beforeend', testCaseHTML);
            }
            else {
              tr.insertAdjacentHTML('beforeend', '<td><ul>' + testCaseHTML + '</ul></td>');
            }
          }
        })

        var tC = tr.querySelector('td:nth-child(4)');
        if (!tC) {
          tr.insertAdjacentHTML('beforeend', '<td><span class="warning">?</span></td>');
        }
      });

      table.insertAdjacentHTML('beforeend', '<tfoot><tr>' + getTestDescriptionReviewStatusHTML() + '</tr></tfoot>')
    },

    eventEscapeDocumentMenu: function(e) {
      if (e.keyCode == 27) { // Escape
        DO.U.hideDocumentMenu(e);
      }
    },

    eventLeaveDocumentMenu: function(e) {
      if (!e.target.closest('.do.on')) {
        DO.U.hideDocumentMenu(e);
      }
    },

    updateDocumentTitle: function(e) {
      var h1 = document.querySelector('h1');
      if (h1) {
        document.title = h1.textContent.trim();
      }
    },

    utf8Tob64: function(s) {
      return window.btoa(encodeURIComponent(s));
    },

    b64Toutf8: function(s) {
      return unescape(decodeURIComponent(window.atob(s)));
    },

    getSelectorSign: function(node) {
      if(!node) {
        return DO.C.SelectorSign["*"];
      }

      if (typeof node === 'object') {
        var nodeName = node.nodeName.toLowerCase();
        var nodeId = '';

        if(node.id) {
          switch(nodeName) {
            default: break;
            case 'section': case 'dl':
              nodeId = '#' + node.id;
              break;
          }
        }

        return DO.C.SelectorSign[nodeName + nodeId] || DO.C.SelectorSign[nodeName] || DO.C.SelectorSign["*"];
      }

      return DO.C.SelectorSign["*"];
    },

    showFragment: function(selector) {
      var ids = (selector) ? document.querySelectorAll(selector) : document.querySelectorAll('main *[id]:not(input):not(textarea):not(select):not(#content)');

      for(var i = 0; i < ids.length; i++){
        ids[i].addEventListener('mouseenter', function(e){
          var fragment = document.querySelector('*[id="' + e.target.id + '"] > .do.fragment');
          if (!fragment && e.target.parentNode.nodeName.toLowerCase() != 'aside'){
            const sign = DO.U.getSelectorSign(e.target);

            e.target.insertAdjacentHTML('afterbegin', '<span class="do fragment"><a href="#' + e.target.id + '">' + sign + '</a></span>');
            fragment = document.querySelector('[id="' + e.target.id + '"] > .do.fragment');
            var fragmentClientWidth = fragment.clientWidth;

            var fragmentOffsetLeft = DO.U.getOffset(e.target).left;
            var bodyOffsetLeft = DO.U.getOffset(getDocumentContentNode(document)).left;

            var offsetLeft = 0;
            if ((fragmentOffsetLeft - bodyOffsetLeft) > 200) {
              offsetLeft = e.target.offsetLeft;
            }

            fragment.style.top = Math.ceil(e.target.offsetTop) + 'px';
            fragment.style.left = (offsetLeft - fragmentClientWidth) + 'px';
            fragment.style.height = e.target.clientHeight + 'px';
            fragment.style.width = (fragmentClientWidth - 10) + 'px';
          }
        });

        ids[i].addEventListener('mouseleave', function(e){
          var fragment = document.querySelector('[id="' + e.target.id + '"] > .do.fragment');
          if (fragment && fragment.parentNode) {
            fragment.parentNode.removeChild(fragment);
          }
        });
      }
    },

    getOffset: function(el) {
      var box = el.getBoundingClientRect();

      return {
        top: box.top + window.pageYOffset - document.documentElement.clientTop,
        left: box.left + window.pageXOffset - document.documentElement.clientLeft
      }
    },

    initCopyToClipboard: function() {
      var elements = ['pre', 'table'];

      elements.forEach(function(element){
        var nodes = selectArticleNode(document).querySelectorAll(element);
        nodes.forEach(function(node){
          node.insertAdjacentHTML('afterend', '<button class="do copy-to-clipboard" title="Copy to clipboard">' + Icon[".fas.fa-copy"] + '</button>');
          var button = node.nextElementSibling;
          setCopyToClipboard(node, button);
        });
      })
    },

    generateFilename: function(url, options) {
      url = url || DO.C.DocumentURL;
      var fileName = getLastPathSegment(url);
      var timestamp = getDateTimeISO().replace(/[^\w]+/ig, '') || "now";
      var extension = options.filenameExtension || '.txt';
      fileName = fileName + "." + timestamp + extension;
      return fileName;
    },

    exportAsDocument: function(data, options = {}) {
      data = data || getDocument();
      var mediaType = options.mediaType || 'text/html';
      var url = options.subjectURI || DO.C.DocumentURL;

      //XXX: Encodes strings as UTF-8. Consider storing bytes instead?
      var blob = new Blob([data], {type: mediaType + ';charset=utf-8'});

      var a = document.createElement("a");
      a.download = DO.U.generateFilename(url, options);

      a.href = window.URL.createObjectURL(blob);
      a.style.display = "none";
      getDocumentContentNode(document).appendChild(a);
      a.click();
      getDocumentContentNode(document).removeChild(a);
      window.URL.revokeObjectURL(a.href);
    },

    showRobustLinks: function(e, selector) {
      if (e) {
        e.target.closest('button').disabled = true;
      }

      var robustLinks = selector || document.querySelectorAll('cite > a[href^="http"][data-versionurl][data-versiondate]');

      document.documentElement.appendChild(fragmentFromString('<aside id="robustify-links" class="do on">' + DO.C.Button.Close + '<h2>Robustify Links</h2><div id="robustify-links-input"><p><input id="robustify-links-select-all" type="checkbox" value="true"/><label for="robustify-links-select-all">Select all</label></p><p><input id="robustify-links-reuse" type="checkbox" value="true" checked="checked"/><label for="robustify-links-reuse">Reuse Robustifed</label></p><ul id="robustify-links-list"></ul></div><button class="robustify" title="Robustify Links">Robustify</button></aside>'));

      //TODO: Move unique list of existing RL's to DO.C.Resource?
      var robustLinksUnique = {};
      robustLinks.forEach(function(i){
        if (!robustLinksUnique[i.href]) {
          robustLinksUnique[i.href] = {
            "node": i,
            "data-versionurl": i.getAttribute("data-versionurl"),
            "data-versiondate": i.getAttribute("data-versiondate")
          };
        }
        else {
          // console.log(i);
        }
      });

// console.log('robustLinks: ' + robustLinks.length);
// console.log(robustLinksUnique)
// console.log('<robustLinksUnique:  ' + Object.keys(robustLinksUnique).length);

      var rlCandidates = document.querySelectorAll('cite > a[href^="http"]:not([data-versionurl]):not([data-versiondate])');
// console.log(rlCandidates)
      var rlInput = document.querySelector('#robustify-links-input');

      rlInput.insertAdjacentHTML('afterbegin', '<p class="count"><data>' + rlCandidates.length + '</data> candidates.</p>');

      var rlUL = document.querySelector('#robustify-links-list');
      rlCandidates.forEach(function(i){
        var html = '<li><input id="' + i.href + '" type="checkbox" value="' + i.href + '" /> <label for="' + i.href + '"><a href="' + i.href + '" target="_blank" title="' + i.textContent + '">' + i.href + '</a></label>';

          //TODO: addEventListener
//         if(robustLinksUnique[i.href]) {
//           //Reuse RL
// // console.log('Reuse Robust Link? ' + robustLinksUnique[i.href]["data-versionurl"]);
//           html += '<button class="robustlinks-reuse" title="' + robustLinksUnique[i.href]["data-versionurl"] + '">' + Icon[".fas.fa-recycle"] + '</button>';
//         }

        html += '</li>';
        rlUL.insertAdjacentHTML('beforeend', html);
      });


      var robustifyLinks = document.getElementById('robustify-links');
      robustifyLinks.addEventListener('click', function (e) {
        if (e.target.closest('button.close')) {
          var rs = document.querySelector('#document-do .robustify-links');
          if (rs) {
            rs.disabled = false;
          }
        }

        if (e.target.closest('button.robustify')) {
          e.target.disabled = true;

          var rlChecked = document.querySelectorAll('#robustify-links-list input:checked');

          var promises = [];

          rlChecked.forEach(function(i){
// console.log('Robustifying: ' + i.value)
// console.log(i);

            var options = {};
            options['showRobustLinksDecoration'] = false;
            options['showActionMessage'] = false;
            var node = document.querySelector('cite > a[href="' + i.value + '"]:not([data-versionurl]):not([data-versiondate])');

// console.log(node);

            i.parentNode.insertAdjacentHTML('beforeend', '<span class="progress" data-to="' + i.value + '">' + Icon[".fas.fa-circle-notch.fa-spin.fa-fw"] + '</span>')

            // window.setTimeout(function () {
// console.log(i.value);

            var progress = document.querySelector('#robustify-links-list .progress[data-to="' + i.value + '"]');

            var robustLinkFound = false;

            var robustifyLinksReuse = document.querySelector('#robustify-links-reuse');
            if (robustifyLinksReuse.checked) {
              Object.keys(robustLinksUnique).forEach(function(url){
                if (i.value == url) {
// console.log(robustLinksUnique[url])
                  progress.innerHTML = '<a href="' + robustLinksUnique[url]["data-versionurl"] + '" target="_blank">' + Icon[".fas.fa-archive"] + '</a>';
// console.log(node)
                  node.setAttribute("data-versionurl", robustLinksUnique[url]["data-versionurl"]);
                  node.setAttribute("data-versiondate", robustLinksUnique[url]["data-versiondate"]);

                  showRobustLinksDecoration(node.closest('cite'));

                  robustLinkFound = true;
                }
              });
            }

            if (!robustLinkFound) {
              DO.U.createRobustLink(i.value, node, options).then(
                function(rl){
                  var versionURL = ("data-versionurl" in rl) ? rl["data-versionurl"] : rl.href;

                  if ("data-versionurl" in rl && "data-versiondate" in rl) {
                    robustLinksUnique[i.value] = {
                      "node": node,
                      "data-versionurl": rl["data-versionurl"],
                      "data-versiondate": rl["data-versiondate"]
                    }
// console.log('Add    robustLinksUnique: ' + Object.keys(robustLinksUnique).length);
                  }

                  progress.innerHTML = '<a href="' + versionURL + '" target="_blank">' + Icon[".fas.fa-archive"] + '</a>';

                  showRobustLinksDecoration(node.closest('cite'));
                })
                .catch(function(r){
                  progress.innerHTML = Icon[".fas.fa-times-circle"] + ' Unable to archive. Try later.';
                });
            }
// console.log('</robustLinksUnique: ' + Object.keys(robustLinksUnique).length);
            e.target.disabled = false;
          });
        }

        if (e.target.closest('#robustify-links-select-all')) {
          var rlInput = document.querySelectorAll('#robustify-links-list input');
          // console.log(rlInput.value)
          // console.log(e.target.checked)
          if (e.target.checked) {
            rlInput.forEach(function(i) {
              i.setAttribute('checked', 'checked');
              i.checked = true;
            });
          }
          else {
            rlInput.forEach(function(i) {
              i.removeAttribute('checked');
              i.checked = false;
            });
          }
        }

        if (e.target.closest('#robustify-links-list input')) {
          // console.log(e.target)
          if(e.target.getAttribute('checked')) {
            e.target.removeAttribute('checked');
          }
          else {
            e.target.setAttribute('checked', 'checked');
          }
          // console.log(e.target);
        }
      });
    },

    createRobustLink: function(uri, node, options){
      return DO.U.snapshotAtEndpoint(undefined, uri, 'https://web.archive.org/save/', '', {'Accept': '*/*', 'showActionMessage': false })
        .then(function(r){
// console.log(r)
          //FIXME TODO: Doesn't handle relative URLs in Content-Location from w3.org or something. Getting Overview.html but base is lost.
          if (r) {
            var o = {
              "href": uri
            };
            var versionURL = r.location;

            if (typeof versionURL === 'string') {
              var vD = versionURL.split('/')[4];
              if (vD) {
                var versionDate = vD.substr(0,4) + '-' + vD.substr(4,2) + '-' + vD.substr(6,2) + 'T' + vD.substr(8,2) + ':' + vD.substr(10,2) + ':' + vD.substr(12,2) + 'Z';

                node.setAttribute('data-versionurl', versionURL);
                node.setAttribute('data-versiondate', versionDate);

                o["data-versionurl"] = versionURL;
                o["data-versiondate"] = versionDate;
              }
            }

            options['showActionMessage'] = ('showActionMessage' in options) ? options.showActionMessage : true;
            if (options.showActionMessage) {
              var message = 'Archived <a href="' + uri + '">' + uri + '</a> at <a href="' + versionURL + '">' + versionURL + '</a> and created RobustLink.';
              message = {
                'content': message,
                'type': 'success'
              }
              addMessageToLog(message, Config.MessageLog);
              showActionMessage(document.documentElement, message);
            }

            if (options.showRobustLinksDecoration) {
              showRobustLinksDecoration();
            }

            return o;
          }
          else {
            return Promise.reject();
          }
        });
    },

    snapshotAtEndpoint: function snapshotAtEndpoint (e, iri, endpoint, noteData, options = {}) {
      iri = iri || window.location.origin + window.location.pathname;
      endpoint = endpoint || 'https://pragma.archivelab.org/';
      options.noCredentials = true

      var progress, svgFail, messageArchivedAt;
      options['showActionMessage'] = ('showActionMessage' in options) ? options.showActionMessage : true;

      //TODO: Move to Config?
      svgFail = Icon[".fas.fa-times-circle.fa-fw"];

      messageArchivedAt = Icon[".fas.fa-archive"] + ' Archived at ';

      var responseMessages = {
        "403": svgFail + ' Archive unavailable. Please try later.',
        "504": svgFail + ' Archive timeout. Please try later.'
      }

      // if(note.length > 0) {
      //   noteData.annotation["message"] = note;
      // }

      if (options.showActionMessage) {
        var button = e.target.closest('button');

        if (typeof e !== 'undefined' && button) {
          if (button.disabled) { return; }
          else { button.disabled = true; }

          var archiveNode = button.parentNode;
          var message = 'Archiving in progress.';
          message = {
            'content': message,
            'type': 'info'
          }
          addMessageToLog(message, Config.MessageLog);
          archiveNode.insertAdjacentHTML('beforeend', ' <span class="progress">' + Icon[".fas.fa-circle-notch.fa-spin.fa-fw"] + ' ' + message.content + '</span>');
        }

        progress = archiveNode.querySelector('.progress');
      }

      var handleError = function(response) {
        if (options.showActionMessage) {
          var message = responseMessages[response.status];
          message = {
            'content': message,
            'type': 'error',
            'timer': 3000
          }
          addMessageToLog(message, Config.MessageLog);
          progress.innerHTML = responseMessages[response.status];
        }

        return Promise.reject(responseMessages[response.status]);
      }

      var handleSuccess = function(o) {
// console.log(o)
        if (options.showActionMessage) {
          var message = messageArchivedAt + '<a target="_blank" href="' + o.location + '">' + o.location + '</a>';
          message = {
            'content': message,
            'type': 'success'
          }
          addMessageToLog(message, Config.MessageLog);
          progress.innerHTML = message.content
        }

        return Promise.resolve(o);
      }

      var checkLinkHeader = function(response) {
        var link = response.headers.get('Link');

        if (link && link.length > 0) {
          var rels = LinkHeader.parse(link);
          if (rels.has('rel', 'memento')) {
            var o = {
              "response": response,
              "location": rels.rel('memento')[0].uri
            }
            return handleSuccess(o);
          }
        }

        return handleError(response);
      }


      //TODO: See also https://archive.org/help/wayback_api.php

      switch (endpoint) {
        case 'https://web.archive.org/save/':
          var headers = { 'Accept': '*/*' };
// options['mode'] = 'no-cors';
          var pIRI = endpoint + iri;
          // i = 'https://web.archive.org/save/https://example.org/';

          pIRI = (DO.C.WebExtension) ? pIRI : getProxyableIRI(pIRI, {'forceProxy': true});
          // pIRI = getProxyableIRI(pIRI, {'forceProxy': true})
// console.log(pIRI)
          return getResource(pIRI, headers, options)
            .then(response => {
// console.log(response)
// for(var key of response.headers.keys()) {
//   console.log(key + ': ' + response.headers.get(key))
// }

              let location = response.headers.get('Content-Location');
// console.log(location)
              if (location && location.length > 0) {
                //XXX: Scrape Internet Archive's HTML
                if (location.startsWith('/web/')) {
                  var o = {
                    "response": response,
                    "location": 'https://web.archive.org' + location
                  }
                  return handleSuccess(o);
                }
                else {
                  return response.text()
                    .then(data => {
// console.log(data)
                      data = DOMPurify.sanitize(data);

                      var regexp = /var redirUrl = "([^"]*)";/;
                      var match = data.match(regexp);
// console.log(match)
                      if (match && match[1].startsWith('/web/')) {
                        var o = {
                          "response": response,
                          "location": 'https://web.archive.org' + match[1]
                        }
                        return handleSuccess(o);
                      }
                      else {
                        return checkLinkHeader(response);
                      }
                    })
                }
              }
              else {
// response.text().then(data => { console.log(data) })

                return checkLinkHeader(response);
              }
            })
            .catch(response => {
// console.log(response)
              return handleError(response);
            })

        case 'https://pragma.archivelab.org/':
        default:
          noteData = noteData || {
            "url": iri,
            "annotation": {
              "@context": "http://www.w3.org/ns/anno.jsonld",
              "@type": "Annotation",
              "motivation": "linking",
              "target": iri,
              "rights": "https://creativecommons.org/publicdomain/zero/1.0/"
            }
          };

          if (DO.C.User.IRI) {
            noteData.annotation['creator'] = {};
            noteData.annotation.creator["@id"] = DO.C.User.IRI;
          }
          if (DO.C.User.Name) {
            noteData.annotation.creator["http://schema.org/name"] = DO.C.User.Name;
          }
          if (DO.C.User.Image) {
            noteData.annotation.creator["http://schema.org/image"] = DO.C.User.Image;
          }
          if (DO.C.User.URL) {
            noteData.annotation.creator["http://schema.org/url"] = DO.C.User.URL;
          }

          if(!('contentType' in options)){
            options['contentType'] = 'application/json';
          }

          return postResource(endpoint, '', JSON.stringify(noteData), options.contentType, null, options)

          .then(response => response.json())

          .then(response => {
            if (response['wayback_id']) {
              var message;
              let location = 'https://web.archive.org' + response.wayback_id

              if (options.showActionMessage) {
                message = messageArchivedAt + '<a target="_blank" href="' + location + '">' + location + '</a>';
                message = {
                  'content': message,
                  'type': 'info'
                }
                addMessageToLog(message, Config.MessageLog);
                progress.innerHTML = message.content
              }

              return { "response": response, "location": location };
            }
            else {
              if (options.showActionMessage) {
                message = responseMessages[response.status];
                message = {
                  'content': message,
                  'type': 'error'
                }
                addMessageToLog(message, Config.MessageLog);
                progress.innerHTML = message.content;
              }

              return Promise.reject(responseMessages[response.status])
            }
          })

          .catch((err) => {
            if (options.showActionMessage) {
              var message = responseMessages[err.response.status];
              message = {
                'content': message,
                'type': 'error'
              }
              addMessageToLog(message, Config.MessageLog);
              progress.innerHTML = message.content;
            }
          })
      }
    },

    //Derived from saveAsDocument
    generateFeed: function generateFeed (e) {
      e.target.disabled = true;
      document.documentElement.appendChild(fragmentFromString('<aside id="generate-feed" class="do on">' + DO.C.Button.Close + '<h2>Generate Feed</h2></aside>'));

      var generateFeed = document.getElementById('generate-feed');
      generateFeed.addEventListener('click', function(e) {
        if (e.target.closest('button.close')) {
          document.querySelector('#document-do .generate-feed').disabled = false;
        }
      });

      var fieldset = '';

      var id = 'location-generate-feed';
      var action = 'write';
      generateFeed.insertAdjacentHTML('beforeend', '<fieldset id="' + id + '-fieldset"><legend>Save to</legend></fieldset>');
      fieldset = generateFeed.querySelector('fieldset#' + id + '-fieldset');
      DO.U.setupResourceBrowser(fieldset, id, action);
      var feedTitlePlaceholder = (DO.C.User.IRI && DO.C.User.Name) ? DO.C.User.Name + "'s" : "Example's";
      fieldset.insertAdjacentHTML('beforeend', '<p id="' + id + '-samp' + '">Feed will be generated at: <samp id="' + id + '-' + action + '"></samp></p><ul><li><label for="' + id + '-title">Title</label> <input type="text" placeholder="' + feedTitlePlaceholder + ' Web Feed" name="' + id + '-title" value=""></li><li><label for="' + id + '-language">Language</label> <select id="' + id + '-language" name="' + id + '-language">' + getLanguageOptionsHTML() + '</select></li><li><label for="' + id + '-license">License</label> <select id="' + id + '-license" name="' + id + '-license">' + getLicenseOptionsHTML() + '</select></li><li>' + DO.U.getFeedFormatSelection() + '</li></ul><button class="create" title="Save to destination">Generate</button>');
      var bli = document.getElementById(id + '-input');
      bli.focus();
      bli.placeholder = 'https://example.org/path/to/feed.xml';

      generateFeed.addEventListener('click', e => {
        if (!e.target.closest('button.create')) {
          return
        }

        var generateFeed = document.getElementById('generate-feed')
        var storageIRI = generateFeed.querySelector('#' + id + '-' + action).innerText.trim()
// console.log('storageIRI: ' + storageIRI)
        var rm = generateFeed.querySelector('.response-message')
        if (rm) {
          rm.parentNode.removeChild(rm)
        }

        if (!storageIRI.length) {
          generateFeed.insertAdjacentHTML('beforeend',
            '<div class="response-message"><p class="error">' +
            'Specify the location to generate the feed to.</p></div>'
          )

          return
        }

        var options = {};
        var feedFormat = DO.C.MediaTypes.Feed[0];
        var feedFormatSelectionChecked = generateFeed.querySelector('select[name="feed-format"]')
        if (feedFormatSelectionChecked.length > 0) {
          feedFormat = (DO.C.MediaTypes.Feed.indexOf(feedFormatSelectionChecked.value) > -1) ? feedFormatSelectionChecked.value : feedFormat;

          options['contentType'] = feedFormat;
        }

        var feedTitle = generateFeed.querySelector('input[name="' + id + '-title"]').value || storageIRI

        var feedLanguageSelected = generateFeed.querySelector('select[name="' + id + '-language"]').value
        var feedLicenseSelected = generateFeed.querySelector('select[name="' + id + '-license"]').value


        var feedURLSelection = [];

        var checkedInput = generateFeed.querySelectorAll('#' + id + '-ul' + ' input[type="checkbox"]:checked')
        checkedInput = Array.from(checkedInput)
        if (checkedInput.length > 0) {
          feedURLSelection = checkedInput.map((el) => el.value);
        }
// console.log(feedURLSelection)

        function getFeedData(urls) {
          var promises = [];
          var resourceData = {};

          urls.forEach(function (u) {
            var pIRI = getProxyableIRI(u);
            promises.push(
              getResource(pIRI)
                .then(function (response) {
                  var cT = response.headers.get('Content-Type');
                  var options = {};
                  options['contentType'] = (cT) ? cT.split(';')[0].toLowerCase().trim() : 'text/turtle';
                  options['subjectURI'] = response.url;

                  return response.text()
                    .then(data => getResourceInfo(data, options))
                    .catch(function (error) {
                      console.error(`Error fetching ${u}:`, error.message);
                      return Promise.resolve(); // or handle the error accordingly
                    });
                })
                .then((result) => {
                  resourceData[u] = result; // Directly store the result in resourceData
                })
            );
          });

          return Promise.all(promises).then(() => resourceData);
        }

        getFeedData(feedURLSelection)
          .then(resourceData => {
            var feed = {
              self: storageIRI,
              title: feedTitle,
              // description: 'TODO: User Input',
              language: feedLanguageSelected,
              license: feedLicenseSelected,
              // copyright: 'TODO: User Input',
              // rights: 'TODO: User Input',
              author: {},
              origin: new URL(storageIRI).origin,
              items: resourceData
            };

            if (DO.C.User.IRI) {
              feed['author']['uri'] = DO.C.User.IRI;
              if (DO.C.User.Name) {
                feed['author']['name'] = DO.C.User.Name;
              }
            }

// console.log(feed)
// console.log(options)

            feed = createFeedXML(feed, options);
// console.log(feed);
            return feed;
          })
          .then(feedData => {
            var progress = generateFeed.querySelector('progress')
            if(progress) {
              progress.parentNode.removeChild(progress)
            }
            e.target.insertAdjacentHTML('afterend', '<progress min="0" max="100" value="0"></progress>')
            progress = generateFeed.querySelector('progress')

// console.log(feedData)
// console.log(storageIRI)
// console.log(options);
            putResource(storageIRI, feedData, options.contentType, null, { 'progress': progress })
              .then(response => {
                progress.parentNode.removeChild(progress)

                let url = response.url || storageIRI

                var documentMode = (DO.C.WebExtension) ? '' : ''

                generateFeed.insertAdjacentHTML('beforeend',
                  '<div class="response-message"><p class="success">' +
                  'Document saved at <a href="' + url + documentMode + '">' + url + '</a></p></div>'
                )

                window.open(url + documentMode, '_blank')
              })

              //TODO: Reuse saveAsDocument's catch
              .catch(error => {
                console.log('Error saving document. Status: ' + error.status)
              })
          })
      })
    },

    mementoDocument: function(e) {
      if(typeof e !== 'undefined') {
        var b = e.target.closest('button');
        if(b.disabled) { return; }
        else {
          b.disabled = true;
          DO.C.ButtonStates['resource-memento'] = false;
        }
      }

      showTimeMap();

      var mementoItems = document.getElementById('memento-items');
      if (mementoItems) { return; }

      var iri = DO.C.DocumentURL;

      var li = [];
      li.push('<li><button class="create-version"' + getButtonDisabledHTML('create-version') +
        ' title="Version this article">' + Icon[".fas.fa-code-branch.fa-2x"] + 'Version</button></li>');
      li.push('<li><button class="create-immutable"' + getButtonDisabledHTML('create-immutable') +
        ' title="Make this article immutable and version it">' + Icon[".far.fa-snowflake.fa-2x"] + 'Immutable</button></li>');
      li.push('<li><button class="robustify-links"' + getButtonDisabledHTML('robustify-links') +
        ' title="Robustify Links">' + Icon[".fas.fa-link.fa-2x"] + 'Robustify Links</button></li>');
      li.push('<li><button class="snapshot-internet-archive"' + getButtonDisabledHTML('snapshot-internet-archive') +
        ' title="Capture with Internet Archive">' + Icon[".fas.fa-archive.fa-2x"] + 'Internet Archive</button></li>');
      li.push('<li><button class="generate-feed"' + getButtonDisabledHTML('generate-feed') +
        ' title="Generate Web feed">' + Icon[".fas.fa-rss.fa-2x"] + 'Feed</button></li>');
      li.push('<li><button class="export-as-html"' + getButtonDisabledHTML('export-as-html') +
        ' title="Export and save to file">' + Icon[".fas.fa-external-link-alt.fa-2x"] + 'Export</button></li>');

      e.target.closest('button').insertAdjacentHTML('afterend', '<ul id="memento-items" class="on">' + li.join('') + '</ul>');

      mementoItems = document.getElementById('memento-items');

      mementoItems.addEventListener('click', function(e) {
        if (e.target.closest('button.resource-save') ||
            e.target.closest('button.create-version') ||
            e.target.closest('button.create-immutable')) {
          DO.U.resourceSave(e);
        }

        if (e.target.closest('button.export-as-html')) {
          var options = {
            subjectURI: DO.C.DocumentURL,
            mediaType: 'text/html',
            filenameExtension: '.html'
          }
          DO.U.exportAsDocument(getDocument(), options);
        }

        if (e.target.closest('button.robustify-links')){
          DO.U.showRobustLinks(e);
        }

        if (e.target.closest('button.snapshot-internet-archive')){
          // DO.U.snapshotAtEndpoint(e, iri, 'https://pragma.archivelab.org/', '', {'contentType': 'application/json'});
          DO.U.snapshotAtEndpoint(e, iri, 'https://web.archive.org/save/', '', {'Accept': '*/*', 'showActionMessage': true });
        }

        if (e.target.closest('button.generate-feed')) {
          DO.U.generateFeed(e);
        }
      });
    },

    showDocumentDo: function (node) {
      var d = node.querySelector('#document-do');
      if (d) { return; }

      var documentURL = DO.C.DocumentURL;

      var buttonDisabled = '';

      var s = '<section id="document-do" class="do"><h2>Do</h2><ul>';
      s += '<li><button class="resource-share" title="Share resource">' + Icon[".fas.fa-bullhorn.fa-2x"] + 'Share</button></li>';
      s += '<li><button class="resource-reply" title="Reply">' + Icon[".fas.fa-reply.fa-2x"] + 'Reply</button></li>';

      var activitiesIcon = Icon[".fas.fa-bolt.fa-2x"];


      s += '<li><button class="resource-notifications"' + buttonDisabled +
        ' title="Show notifications">' + activitiesIcon + 'Notifications</button></li>';

      s += '<li><button class="resource-new" title="Create new article">' + Icon[".far.fa-lightbulb.fa-2x"] + 'New</button></li>';

      s += '<li><button class="resource-open" title="Open article">' + Icon[".fas.fa-coffee.fa-2x"] + 'Open</button></li>';

      s += '<li><button class="resource-save" title="Save article">' + Icon[".fas.fa-life-ring.fa-2x"] + 'Save</button></li>';

      s += '<li><button class="resource-save-as"' + getButtonDisabledHTML('resource-save-as') + ' title="Save as article">' + Icon[".far.fa-paper-plane.fa-2x"] + 'Save As</button></li>';

      s += '<li><button class="resource-memento" title="Memento article">' + Icon[".far.fa-clock.fa-2x"] + 'Memento</button></li>';

      if (DO.C.EditorAvailable) {
        var editFile = (DO.C.EditorEnabled && DO.C.User.Role == 'author')
          ? DO.C.Editor.DisableEditorButton
          : DO.C.Editor.EnableEditorButton;
        s += '<li>' + editFile + '</li>';
      }

      s += '<li><button class="resource-source" title="Edit article source code">' + Icon[".fas.fa-code.fa-2x"] + 'Source</button></li>';

      s += '<li><button class="embed-data-meta" title="Embed structured data (Turtle, JSON-LD, TriG)">' + Icon [".fas.fa-table.fa-2x"] + 'Embed Data</button></li>';

      if (DO.C.Resource[documentURL]['odrl'] && DO.C.Resource[documentURL]['odrl']['prohibitionAssignee'] == DO.C.User.IRI &&
        ((DO.C.Resource[documentURL]['odrl']['prohibitionActions'] && DO.C.Resource[documentURL]['odrl']['prohibitionActions'].indexOf('http://www.w3.org/ns/odrl/2/print') > -1) ||
        (DO.C.Resource[documentURL]['odrl']['permissionActions'] && DO.C.Resource[documentURL]['odrl']['permissionActions'].indexOf('http://www.w3.org/ns/odrl/2/print') > -1))) {
        s += '<li><button class="resource-print"' + getButtonDisabledHTML('resource-print') + ' title="Print document">' + Icon[".fas.fa-print.fa-2x"] + 'Print</button></li>';
      }


      var trashIcon = getDocumentNodeFromString(Icon[".fas.fa-trash-alt"], {'contentType': 'image/svg+xml'})
      trashIcon.classList.add('fa-2x');
      trashIcon = trashIcon.outerHTML;
      s += '<li><button class="resource-delete" title="Delete article">' + trashIcon + 'Delete</button></li>';

      s += '<li><button class="message-log" title="Show message log">' + Icon [".fas.fa-scroll.fa-2x"] + 'Messages</button></li>';

      s += '</ul></section>';

      node.insertAdjacentHTML('beforeend', s);

      updateDocumentDoButtonStates();

      var eD = node.querySelector('.editor-disable');
      if (eD) {
        showAutoSaveStorage(eD.closest('li'));
      }

      var dd = document.getElementById('document-do');

      dd.addEventListener('click', e => {
        if (e.target.closest('.resource-share')) {
          DO.U.shareResource(e);
        }

        if (e.target.closest('.resource-reply')) {
          DO.U.replyToResource(e);
        }

        var b;
        if (DO.C.EditorAvailable) {
          b = e.target.closest('button.editor-disable');
          var documentURL = DO.C.DocumentURL;
          if (b) {
            var node = b.closest('li');
            b.outerHTML = DO.C.Editor.EnableEditorButton;
            DO.U.Editor.enableEditor('social', e);
            hideAutoSaveStorage(node.querySelector('#autosave-items'), documentURL);
          }
          else {
            b = e.target.closest('button.editor-enable');
            if (b) {
              node = b.closest('li');
              b.outerHTML = DO.C.Editor.DisableEditorButton;
              DO.U.Editor.enableEditor('author', e);
              showAutoSaveStorage(node, documentURL);
            }
          }
        }

        if (e.target.closest('.resource-notifications')) {
          DO.U.showNotifications(e);
        }

        if (e.target.closest('.resource-new')) {
          DO.U.createNewDocument(e);
        }

        if (e.target.closest('.resource-open')) {
          DO.U.openDocument(e);
        }

        if (e.target.closest('.resource-source')) {
          DO.U.viewSource(e);
        }

        if (e.target.closest('.embed-data-meta')) {
          DO.U.showEmbedData(e);
        }

        if (e.target.closest('.resource-save')){
          DO.U.resourceSave(e);
        }

        if (e.target.closest('.resource-save-as')) {
          DO.U.saveAsDocument(e);
        }

        if (e.target.closest('.resource-memento')) {
          DO.U.mementoDocument(e);
        }

        if (e.target.closest('.resource-print')) {
          window.print();
          return false;
        }

        if (e.target.closest('.resource-delete')){
          DO.U.resourceDelete(e, DO.C.DocumentURL);
        }

        if (e.target.closest('.message-log')) {
          DO.U.showMessageLog(e);
        }
      });
    },

    showMessageLog: function(e, options) {
      e.target.closest('button').disabled = true

      var messageLog;

      if (DO.C.MessageLog && DO.C.MessageLog.length > 0) {
        messageLog = '<table><caption>Messages</caption><thead><tr><th>Date/Time</th><th>Message</th><th>Type</th></tr></thead><tbody>';
        Object.keys(DO.C.MessageLog).forEach(i => {
          messageLog += '<tr><td><time>' + DO.C.MessageLog[i].dateTime + '</time></td><td>' + DO.C.MessageLog[i].content + '</td><td>' + DO.C.MessageLog[i].type + '</td></tr>';
        });
        messageLog += '</tbody></table>';
      }
      else {
        messageLog = '<p>No messages.</p>';
      }

      document.documentElement.appendChild(fragmentFromString('<aside id="message-log" class="do on">' + DO.C.Button.Close + '<h2>Message Log</h2><div>' + messageLog + '</div></aside>'));

      document.querySelector('#message-log button.close').addEventListener('click', function(e) {
        document.querySelector('button.message-log').removeAttribute('disabled');
      });
    },

    //TODO: Minor refactoring to delete any URL, e.g., annotation (already implemented)
    resourceDelete: function(e, url, options) {
      if (!url) { return; }

      e.target.closest('button').disabled = true

      document.documentElement.appendChild(fragmentFromString('<aside id="delete-document" class="do on">' + DO.C.Button.Close + '<h2>Delete Document</h2><div><p>Are you sure you want to delete the following document?</p><p><code>' + url  +'</code></p></div><button class="cancel" title="Cancel delete">Cancel</button><button class="delete" title="Delete document">Delete</button></aside>'));

      document.querySelector('#delete-document').addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();

        var buttonCC = e.target.closest('button.close') ||  e.target.closest('button.cancel');
        if (buttonCC) {
          var parent = buttonCC.parentNode;
          parent.parentNode.removeChild(parent);

          var rd = document.querySelector('#document-do .resource-delete');
          if (rd) {
            rd.disabled = false;
          }
        }
        else if (e.target.closest('button.delete')) {
          deleteResource(url)
            .catch((error) => {
// console.log(error)
// console.log(error.status)
// console.log(error.response)
              error.response.text()
                .then(data => {
// console.log(data);
                  data = DOMPurify.sanitize(data);

                  //TODO: Reuse saveAsDocument's catch to request access by checking the Link header.

                  var details = (data.trim().length > 0) ? '<details><summary>Details</summary><div>' + data + '</div></details>' : '';
                  var message = '';
                  if (error.status) {
                    switch(error.status) {
                      case 401:
                        message = 'You are lack valid authenticated credentials to delete <code>' + url + '</code>.'
                        if(!DO.C.User.IRI){
                          message += ' Try signing in.';
                        }
                        message += details;
                        break;
                      case 403: default:
                        message = 'Unable to delete <code>' + url + '</code>.';
                        if(DO.C.User.IRI){
                          message += ' Your credentails were insufficient. Try signing in with different credentials or request access.';
                        }
                        message + details;
                        break;
                      case 409:
                        message = 'There was a conflict when trying to delete <code>' + url + '</code>.' + details;
                        break;
                    }
                  }

                  message = {
                    'content': message,
                    'type': 'error',
                    'timer': 10000
                  }
                  addMessageToLog(message, Config.MessageLog);
                  showActionMessage(document.documentElement, message);

                  // throw error;
                  // return Promise.reject({});
                });
            })
            .then(response => {
// console.log(response);
              return response.text()
                .then(data => {
// console.log(data);
                  data = DOMPurify.sanitize(data);

                  var details = (data.trim().length > 0) ? '<details><summary>Details</summary><div>' + data + '</div></details>' : '';
                  var message = '';
                  switch(response.status) {
                    case 200: default:
                      message = 'Deleted <code>' + url + '</code>.' + details;
                      break;
                    case 202:
                      message = 'Deleting <code>' + url + '</code> will succeed but has not yet been enacted.';
                    break;
                    case 204:
                      message = 'Deleted <code>' + url + '</code>.';
                      break;
                  }

                  message = {
                    'content': message,
                    'type': 'success',
                    'timer': 3000
                  }
                  addMessageToLog(message, Config.MessageLog);
                  showActionMessage(document.documentElement, message);

                  var buttonD = e.target.closest('button.delete')
                  if (buttonD) {
                    var parent = buttonD.parentNode;
                    parent.parentNode.removeChild(parent);
                  }
                })
                .then(() => {
                  //FIXME:
                  getDocumentContentNode(document).innerHTML = '<main><article about="" typeof="schema:Article"></article></main>';
                  DO.U.Editor.enableEditor('author');


                  // or better: createHTML() and update spawnDocument()
                  //XXX Experimental:
//                   var html = getDocument()
// console.log(html)
//                   html = DO.U.spawnDokieli(document, html, 'text/html', url, {'init': true})
                  // window.history.pushState({}, '', ??????)

                  // Or offer to create a new document somewhere.
                  // DO.U.createNewDocument(e);
                })
            })
          }
      });
    },

    resourceSave: function(e, options) {
      var url = window.location.origin + window.location.pathname;
      var data = getDocument();
      options = options || {};

      getResourceInfo(data, options).then(function(i) {
        if (e.target.closest('.create-version')) {
          createMutableResource(url);
        }
        else if (e.target.closest('.create-immutable')) {
          createImmutableResource(url);
        }
        else if (e.target.closest('.resource-save')) {
          updateMutableResource(url);
        }
      });
    },

    replyToResource: function replyToResource (e, iri) {
      iri = iri || currentLocation()

      e.target.closest('button').disabled = true

      document.documentElement.appendChild(fragmentFromString('<aside id="reply-to-resource" class="do on">' + DO.C.Button.Close + '<h2>Reply to this</h2><div id="reply-to-resource-input"><p>Reply to <code>' +
        iri +'</code></p><ul><li><p><label for="reply-to-resource-note">Quick reply (plain text note)</label></p><p><textarea id="reply-to-resource-note" rows="10" cols="40" name="reply-to-resource-note" placeholder="Great article!"></textarea></p></li><li><label for="reply-to-resource-language">Language</label> <select id="reply-to-resource-language" name="reply-to-resource-language">' +
        getLanguageOptionsHTML() + '</select></li><li><label for="reply-to-resource-license">License</label> <select id="reply-to-resource-license" name="reply-to-resource-license">' +
        getLicenseOptionsHTML() + '</select></li></ul></div>'))

      // TODO: License
      // TODO: ACL - can choose whether to make this reply private (to self), visible only to article author(s), visible to own contacts, public
      // TODO: Show name and face of signed in user reply is from, or 'anon' if article can host replies

      var replyToResource = document.getElementById('reply-to-resource')

      var id = 'location-reply-to'
      var action = 'write'

      DO.U.setupResourceBrowser(replyToResource, id, action)
      document.getElementById(id).insertAdjacentHTML('afterbegin', '<p>Choose a location to save your reply.</p>')

      replyToResource.insertAdjacentHTML('beforeend', '<p>Your reply will be saved at <samp id="' + id +'-' + action +
        '">https://example.org/path/to/article</samp></p>')

      var bli = document.getElementById(id + '-input')
      bli.focus()
      bli.placeholder = 'https://example.org/path/to/article'
      replyToResource.insertAdjacentHTML('beforeend', '<button class="reply" title="Send your reply">Send</button>')

      replyToResource.addEventListener('click', e => {
        if (e.target.closest('button.close')) {
          document.querySelector('#document-do .resource-reply').disabled = false
        }

        if (e.target.closest('button.reply')) {
          var note = document
            .querySelector('#reply-to-resource #reply-to-resource-note')
            .value.trim()

          var rm = replyToResource.querySelector('.response-message')
          if (rm) {
            rm.parentNode.removeChild(rm)
          }
        }

        replyToResource.insertAdjacentHTML('beforeend', '<div class="response-message"></div>')

        if (!iri || !note) {
          document.querySelector('#reply-to-resource .response-message')
            .innerHTML = '<p class="error">Need a note and a location to save it.</p>'
          return
        }

        var datetime = getDateTimeISO()
        var attributeId = generateAttributeId()
        var noteIRI = document.querySelector('#reply-to-resource #' + id +
          '-' + action).innerText.trim()
        var motivatedBy = "oa:replying"
        var noteData = {
          "type": 'article',
          "mode": "write",
          "motivatedByIRI": motivatedBy,
          "id": attributeId,
          // "iri": noteIRI, //e.g., https://example.org/path/to/article
          "creator": {},
          "datetime": datetime,
          "target": {
            "iri": iri
          },
          "body": [{ "value": note }],
        }
        if (DO.C.User.IRI) {
          noteData.creator["iri"] = DO.C.User.IRI
        }
        if (DO.C.User.Name) {
          noteData.creator["name"] = DO.C.User.Name
        }
        if (DO.C.User.Image) {
          noteData.creator["image"] = DO.C.User.Image
        }
        if (DO.C.User.URL) {
          noteData.creator["url"] = DO.C.User.URL
        }

        var language = document.querySelector('#reply-to-resource-language')
        if (language && language.length > 0) {
          noteData["language"] = language.value.trim()
          noteData["body"]["language"] = noteData["language"];
        }

        var license = document.querySelector('#reply-to-resource-license')
        if (license && license.length > 0) {
          noteData["license"] = license.value.trim()
          noteData["body"]["rights"] = noteData["body"]["license"] = noteData["rights"] = noteData["license"];
        }

        note = DO.U.createNoteDataHTML(noteData)

        var data = createHTML('', note)

        putResource(noteIRI, data)

          .catch(error => {
            console.log('Could not save reply:')
            console.error(error)

            let message

            switch (error.status) {
              case 0:
              case 405:
                message = 'this location is not writable.'
                break
              case 401:
                message = 'you are not authorized.'
                if(!DO.C.User.IRI){
                  message += ' Try signing in.';
                }
                break;
              case 403:
                message = 'you do not have permission to write here.'
                break
              case 406:
                message = 'enter a name for your resource.'
                break
              default:
                // some other reason
                message = error.message
                break
            }

            // re-throw, to break out of the promise chain
            throw new Error('Cannot save your reply: ', message)
          })

          .then(response => {
            replyToResource
              .querySelector('.response-message')
              .innerHTML = '<p class="success"><a target="_blank" href="' + response.url + '">Reply saved!</a></p>'

            // Determine the inbox endpoint, to send the notification to
            return getLinkRelation(DO.C.Vocab['ldpinbox']['@id'], null, getDocument())
              .catch(error => {
                console.error('Could not fetch inbox endpoint:', error)

                // re-throw
                throw new Error('Could not determine the author inbox endpoint')
              })
          })

          .then(inboxes => {
            if (!inboxes) {
              throw new Error('Author inbox endpoint is empty or missing')
            }

            var inboxURL = inboxes[0]

            let notificationStatements = '    <dl about="' + noteIRI +
              '">\n<dt>Object type</dt><dd><a about="' +
              noteIRI + '" typeof="oa:Annotation" href="' +
              DO.C.Vocab['oaAnnotation']['@id'] +
              '">Annotation</a></dd>\n<dt>Motivation</dt><dd><a href="' +
              DO.C.Prefixes[motivatedBy.split(':')[0]] +
              motivatedBy.split(':')[1] + '" property="oa:motivation">' +
              motivatedBy.split(':')[1] + '</a></dd>\n</dl>\n'

            let notificationData = {
              "type": ['as:Announce'],
              "inbox": inboxURL,
              "object": noteIRI,
              "target": iri,
              "license": noteData.license,
              "statements": notificationStatements
            }

            return notifyInbox(notificationData)
              .catch(error => {
                console.error('Failed sending notification to ' + inboxURL + ' :', error)

                throw new Error('Failed sending notification to author inbox')
              })
          })

          .then(response => {  // Success!
            var notificationSent = 'Notification sent'
            var location = response.headers.get('Location')

            if (location) {
              notificationSent = '<a target="_blank" href="' + location.trim() + '">' + notificationSent + '</a>!'
            }
            else {
              notificationSent = notificationSent + ", but location unknown."
            }

            replyToResource
              .querySelector('.response-message')
              .innerHTML += '<p class="success">' + notificationSent + '</p>'
          })

          .catch(error => {
            // Catch-all error, actually notify the user
            replyToResource
              .querySelector('.response-message')
              .innerHTML += '<p class="error">' +
                'We could not notify the author of your reply:' +
                error.message + '</p>'
          })
      })
    },

    shareResource: function shareResource (e, iri) {
      iri = iri || currentLocation();
      const documentURL = stripFragmentFromString(iri);

      var button = e.target.closest('button');
      if (button) {
        button.disabled = true;
      }

      var addContactsButtonDisable = '', noContactsText = '';
      if (!DO.C.User.IRI && !(DO.C.User.Graph && ((DO.C.User.Knows && DO.C.User.Knows.length > 0) || (DO.C.User.Graph.owlsameAs && DO.C.User.Graph.owlsameAs._array.length > 0)))) {
        addContactsButtonDisable = ' disabled="disabled"';
        noContactsText = '<p>Sign in to select from your list of contacts, alternatively, enter contacts individually:</p>';
      }

      var shareResourceLinkedResearch = '';
      if (DO.C.User.IRI && DO.C.OriginalResourceInfo['rdftype'] && DO.C.OriginalResourceInfo.rdftype.includes(DO.C.Vocab['schemaScholarlyArticle']['@id']) || DO.C.OriginalResourceInfo.rdftype.includes(DO.C.Vocab['schemaThesis']['@id'])) {
        shareResourceLinkedResearch = `
          <div id="share-resource-external">
            <h3>Share with research community</h3>
            <input id="share-resource-linked-research" type="checkbox" value="https://linkedresearch.org/cloud" />
            <label for="share-resource-linked-research"><a href="https://linkedresearch.org/cloud">Linked Open Research Cloud</a></label>
          </div>`;
      }

      var shareResourceHTML = `
        <aside id="share-resource" class="do on">${DO.C.Button.Close}
          <h2>Share</h2>

          <div id="share-resource-share-url">
            <h3>Share URL</h3>

            <label for="share-resource-clipboard">Copy URL to clipboard</label>
            <input id="share-resource-clipboard" name="share-resource-clipboard" readonly="readonly" type="text" value="${iri}" /><button class="do copy-to-clipboard" title="Copy to clipboard">${Icon[".fas.fa-copy"]}</button>
          </div>

          ${shareResourceLinkedResearch}

          <div id="share-resource-agents">
            <h3>Share with contacts</h3>

            <ul>
              <li id="share-resource-address-book">
              </li>
            </ul>

            <label for="share-resource-note">Note</label>
            <textarea id="share-resource-note" rows="2" cols="40" name="share-resource-note" placeholder="Check this out!"></textarea>

            <button class="share" id="share-resource-agents-button" title="Share resource">Share</button>
          </div>
        </aside>
      `;

      document.documentElement.appendChild(fragmentFromString(shareResourceHTML));

      var clipboardInput = document.querySelector('#share-resource-clipboard');
      var clipboardButton = document.querySelector('#share-resource-clipboard + button.copy-to-clipboard');
      setCopyToClipboard(clipboardInput, clipboardButton);

      clipboardInput.addEventListener('focus', e => {
        var input = e.target.closest('input');
        if (input) {
          input.selectionStart = 0;
          input.selectionEnd = input.value.length;
        }
      });

      var li = document.getElementById('share-resource-address-book');
      li.insertAdjacentHTML('beforeend', Icon[".fas.fa-circle-notch.fa-spin.fa-fw"]);

        DO.U.selectContacts(li, DO.C.User.IRI);

      var hasAccessModeControl = accessModeAllowed(documentURL, 'control');
      if (hasAccessModeControl) {
        var h2 = document.querySelector('#share-resource h2');

        var shareResourcePermissions = `
          <div id="share-resource-permissions">
            <h3>Permissions</h3>

            <span class="progress">${Icon[".fas.fa-circle-notch.fa-spin.fa-fw"]} Checking access permissions.</span>

            <ul>
            </ul>

            <div class="autocomplete">
              <label for="share-resource-search-contacts">Add contacts</label>
              <input id="share-resource-search-contacts" name="share-resource-search-contacts" placeholder="Search contacts or enter WebID" type="text" value="" />
              <ul class="suggestions">
              </ul>
            </div>
          </div>`;
        h2.insertAdjacentHTML('afterend', shareResourcePermissions);

        var accessPermissionsNode = document.getElementById('share-resource-permissions');
        var accessPermissionFetchingIndicator = accessPermissionsNode.querySelector('.progress');

        getACLResourceGraph(documentURL)
          .catch(e => {
            accessPermissionsNode.removeChild(accessPermissionFetchingIndicator);

console.log('XXX: Cannot access effectiveACLResource', e);
          })
          .then(aclResourceGraph => {
            accessPermissionsNode.removeChild(accessPermissionFetchingIndicator);

            const { defaultACLResource, effectiveACLResource, effectiveContainer } = DO.C.Resource[documentURL].acl;
            const hasOwnACLResource = defaultACLResource == effectiveACLResource;

            var matchers = {};

            if (hasOwnACLResource) {
              matchers['accessTo'] = documentURL;
            }
            else {
              matchers['default'] = effectiveContainer;
            }

            var authorizations = getAuthorizationsMatching(aclResourceGraph, matchers);
// console.log(authorizations)
            const subjectsWithAccess = getAccessSubjects(authorizations);
// console.log(subjectsWithAccess)

            const input = document.getElementById('share-resource-search-contacts');
            const suggestions = document.querySelector('#share-resource-permissions .suggestions');

            input.addEventListener('focus', function(e) {
              if (!e.target.value.length) {
                showSuggestions(getFilteredContacts());
              }
            });

            input.addEventListener('input', function(e) {
              const query = e.target.value.trim().toLowerCase();
              showSuggestions(getFilteredContacts(query));
            });

            var getFilteredContacts = function(query = '') {
              const contacts = Object.keys(DO.C.User.Contacts);
              const subjectsWithAccessKeys = new Set(Object.keys(subjectsWithAccess));

              return contacts.filter(contact => {
                const matchesQuery = (
                  !query.length ||
                  contact.toLowerCase().includes(query) ||
                  DO.C.User.Contacts[contact].Name?.toLowerCase().includes(query) ||
                  DO.C.User.Contacts[contact].IRI?.toLowerCase().includes(query) ||
                  DO.C.User.Contacts[contact].URL?.toLowerCase().includes(query)
                );

                return !subjectsWithAccessKeys.has(contact) && matchesQuery;
              });
            }

            var showSuggestions = function (filteredContacts) {
              //TODO: Change innerHTML
              suggestions.innerHTML = '';

              filteredContacts.forEach(contact => {
                const suggestion = document.createElement('li');

                var name = DO.C.User.Contacts[contact].Name || contact;
                var img = DO.C.User.Contacts[contact].Image;
                if (!(img && img.length > 0)) {
                  img = generateDataURI('image/svg+xml', 'base64', Icon['.fas.fa-user-secret']);
                }
                img = '<img alt="" height="32" src="' + img + '" width="32" />';

                suggestion.insertAdjacentHTML('beforeend', img + '<span title="' + contact + '">' + name + '</span>');

                var ul = document.querySelector('#share-resource-permissions ul');

                suggestion.addEventListener('click', function() {
                  DO.U.addAccessSubjectItem(ul, DO.C.User.Contacts[contact].Graph, contact);
                  var li = document.getElementById('share-resource-access-subject-' + encodeURIComponent(contact));
                  var options = {};
                  options['accessContext'] = 'Share';
                  options['selectedAccessMode'] = DO.C.Vocab['aclRead']['@id'];
                  DO.U.showAccessModeSelection(li, '', contact, 'agent', options);

                  var select = document.querySelector('[id="' + li.id + '"] select');
                  select.disabled = true;
                  select.insertAdjacentHTML('afterend', `<span class="progress">${Icon[".fas.fa-circle-notch.fa-spin.fa-fw"]}</span>`);

                  DO.U.updateAuthorization(options.accessContext, options.selectedAccessMode, contact, 'agent')
                    .catch(error => {
                      console.log(error)
                    })
                    .then(response => {
                      getACLResourceGraph(documentURL)
                        .catch(g => {
                          DO.U.removeProgressIndicator(select);
                        })
                        .then(g => {
                          DO.U.removeProgressIndicator(select);
                        })
                    });

                  //TODO: Change from innerHTML
                  suggestions.innerHTML = '';
                  input.value = '';
                });

                suggestions.appendChild(suggestion);
              })
            }


            //Allowing only Share-related access modes.
            var accessContext = DO.C.AccessContext['Share'];

            const accessContextModes = Object.keys(accessContext);

            var ul = document.querySelector('#share-resource-permissions ul');

            var showPermissions = function(s, accessSubject) {
              if (accessSubject != DO.C.User.IRI) {
                DO.U.addAccessSubjectItem(ul, s, accessSubject);

                //XXX: Relies on knowledge in addAcessSubjectItem where it inserts li with a particular id
                var li = document.getElementById('share-resource-access-subject-' + encodeURIComponent(accessSubject));

                var verifiedAccessModes = [];

                Object.keys(authorizations).forEach(authorization => {
                  var authorizationModes = authorizations[authorization].mode;
                  if (authorizations[authorization].agent.includes(accessSubject) || authorizations[authorization].agentGroup.includes(accessSubject)) {
                    authorizationModes.forEach(grantedMode => {
                      if (accessContextModes.includes(grantedMode)) {
                        verifiedAccessModes.push(grantedMode);
                      }
                    });
                  }
                })
// console.log(verifiedAccessModes)

                const selectedAccessMode =
                  (verifiedAccessModes.includes(DO.C.Vocab['aclControl']['@id']) && DO.C.Vocab['aclControl']['@id']) ||
                  (verifiedAccessModes.includes(DO.C.Vocab['aclWrite']['@id']) && DO.C.Vocab['aclWrite']['@id']) ||
                  (verifiedAccessModes.includes(DO.C.Vocab['aclRead']['@id']) && DO.C.Vocab['aclRead']['@id']) ||
                  '';

                var options = options || {};
                options['accessContext'] = 'Share';
                options['selectedAccessMode'] = selectedAccessMode;
// console.log(options)
                DO.U.showAccessModeSelection(li, '', accessSubject, subjectsWithAccess[accessSubject]['subjectType'], options);
              }
            }

            Object.keys(subjectsWithAccess).forEach(accessSubject => {
              if (accessSubject === DO.C.Vocab['foafAgent']['@id'] || accessSubject === DO.C.User.IRI) {
                return;
              }

              //Gets some information about the accessSubject that can be displayed besides their URI.
              getResourceGraph(accessSubject)
                .catch(e => {
console.log(e);
                  showPermissions(null, accessSubject);
                })
                .then(g => {
                  if (typeof g?._graph === 'undefined') {
                    showPermissions(null, accessSubject);
                  }
                  var s = g.child(accessSubject);
                  showPermissions(s, accessSubject);
                })
            })
        });
      }

      var shareResource = document.getElementById('share-resource');
      shareResource.addEventListener('click', function (e) {
        if (e.target.closest('button.close')) {
          var rs = document.querySelector('#document-do .resource-share');
          if (rs) {
            rs.disabled = false;
          }
        }

        if (e.target.closest('button.share')) {
          var tos = [];
          var resourceTo = document.querySelector('#share-resource #share-resource-to');
          if (resourceTo) {
            resourceTo = resourceTo.value.trim();
            tos = (resourceTo.length > 0) ? resourceTo.split(/\r\n|\r|\n/) : [];
          }

          var note = document.querySelector('#share-resource #share-resource-note').value.trim();

          var ps = document.querySelectorAll('#share-resource-contacts .progress');
          ps.forEach(function(p){
            p.parentNode.removeChild(p);
          });

          var srlr = document.querySelector('#share-resource-linked-research:checked');
          if(srlr) {
            tos.push(srlr.value);
          }

          var srci = document.querySelectorAll('#share-resource-contacts input:checked');
          if (srci.length > 0) {
            for(var i = 0; i < srci.length; i++) {
              tos.push(srci[i].value);
            }
          }

          var rm = shareResource.querySelector('.response-message');
          if (rm) {
            rm.parentNode.removeChild(rm);
          }
          shareResource.insertAdjacentHTML('beforeend', '<div class="response-message"></div>');

          return sendNotifications(tos, note, iri, shareResource)
        }
      });
    },

    //TODO: Revisit this function and addShareResourceContactInput to generalise.
    addAccessSubjectItem: function(node, s, url) {
      var iri = s?.iri().toString() || url;
// console.log(iri.toString());

      var id = encodeURIComponent(iri);
      var name = s ? getAgentName(s) || iri : iri;
      var img = s ? getGraphImage(s) : null;
      if (!(img && img.length > 0)) {
        img = generateDataURI('image/svg+xml', 'base64', Icon['.fas.fa-user-secret']);
      }
      img = '<img alt="" height="32" src="' + img + '" width="32" />';

      var input = '<li id="share-resource-access-subject-' + id + '">' + img + '<a href="' + iri + '" target="_blank">' + name + '</a></li>';

      node.insertAdjacentHTML('beforeend', input);
    },


    showAccessModeSelection: function(node, id, accessSubject, subjectType, options) {
      id = id || generateAttributeId('select-access-mode-');
      options = options || {};
      options['accessContext'] = options.accessContext || 'Share';
      options['selectedAccessMode'] = options.selectedAccessMode || '';

      const documentURL = currentLocation();

      const selectNode = '<select id="' + id + '">' + getAccessModeOptionsHTML({'context': options.accessContext, 'selected': options.selectedAccessMode }) + '</select>';

      node.insertAdjacentHTML('beforeend', selectNode);

      var select = document.getElementById(id);
      select.addEventListener('change', e => {
        var selectedMode = e.target.value;

        if (DO.C.AccessContext[options.accessContext][selectedMode] || selectedMode == '') {
          e.target.disabled = true;
          e.target.insertAdjacentHTML('afterend', `<span class="progress">${Icon[".fas.fa-circle-notch.fa-spin.fa-fw"]}</span>`);

          DO.U.updateAuthorization(options.accessContext, selectedMode, accessSubject, subjectType)
            .catch(error => {
              console.log(error);
              DO.U.removeProgressIndicator(e.target);
            })
            .then(response => {
// console.log(response)

              getACLResourceGraph(documentURL)
                .catch(g => {
                  DO.U.removeProgressIndicator(select);
                })
                .then(g => {
                  DO.U.removeProgressIndicator(select);
                })
            });
        }
        else {
          //TODO: Naughty
        }
      });
    },

    removeProgressIndicator(node) {
      var progress = document.querySelector('[id="' + node.id + '"] + .progress');

      node.disabled = false;
      node.parentNode.removeChild(progress);
    },


    updateAuthorization: function(accessContext, selectedMode, accessSubject, subjectType) {
      var documentURL = currentLocation();

      const { defaultACLResource, effectiveACLResource, effectiveContainer } = DO.C.Resource[documentURL].acl;
      const hasOwnACLResource = defaultACLResource == effectiveACLResource;
      const patchACLResource = defaultACLResource;

      var aclResourceGraph = DO.C.Resource[effectiveACLResource].graph;

      var matchers = {};

      if (hasOwnACLResource) {
        matchers['accessTo'] = documentURL;
      }
      else {
        matchers['default'] = effectiveContainer;
      }

      var authorizations = getAuthorizationsMatching(aclResourceGraph, matchers);

      var insertGraph = '';
      var deleteGraph = '';
      // var whereGraph = '';
      var authorizationSubject;

      var patches = [];

// console.log(authorizations);
      if (hasOwnACLResource) {
        Object.keys(authorizations).forEach(authorization => {
// console.log(authorizations[authorization], selectedMode, accessSubject, subjectType);
          if (authorizations[authorization][subjectType].includes(accessSubject)) {
            var multipleAccessSubjects = (authorizations[authorization][subjectType].length > 1) ? true : false;
            var deleteAccessObjectProperty = (hasOwnACLResource) ? 'accessTo' : 'default';

            var deleteAccessSubjectProperty = subjectType;
            var deleteAccessSubject = accessSubject;

            var accessModes = authorizations[authorization].mode;
            var deleteAccessModes = '<' + accessModes.join('>, <') + '>';

            if (!multipleAccessSubjects) {
              deleteGraph += `
<${authorization}>
  a acl:Authorization ;
  acl:${deleteAccessObjectProperty} <${documentURL}> ;
  acl:mode ${deleteAccessModes} ;
  acl:${deleteAccessSubjectProperty} <${deleteAccessSubject}> .
`;
            }
            else {
              deleteGraph += `
<${authorization}>
  acl:${deleteAccessSubjectProperty} <${deleteAccessSubject}> .
`;
            }

            patches.push({ 'delete': deleteGraph });
          }
        })

        if (selectedMode.length) {
          authorizationSubject = '#' + generateAttributeId();

          insertGraph += `
  <${authorizationSubject}>
    a acl:Authorization ;
    acl:accessTo <${documentURL}> ;
    acl:mode <${selectedMode}> ;
    acl:${subjectType} <${accessSubject}> .
  `;

          patches.push({ 'insert': insertGraph });
        }
      }
      else {
        // eslint-disable-next-line no-undef
        var updatedAuthorizations = structuredClone(authorizations);
        var authorizationsToDelete = [];

        Object.keys(updatedAuthorizations).forEach(authorization => {
          if (updatedAuthorizations[authorization][subjectType].includes(accessSubject)) {
            var updatedMode;

            if (selectedMode.length) {
              authorizationsToDelete.push(authorization);
            }
            else {
              switch (selectedMode) {
                case DO.C.Vocab['aclRead']['@id']:
                  updatedMode = [DO.C.Vocab['aclRead']['@id']];
                  break;
                case DO.C.Vocab['aclWrite']['@id']:
                  updatedMode = [DO.C.Vocab['aclRead']['@id'], DO.C.Vocab['aclWrite']['@id']];
                  break;
                case DO.C.Vocab['aclControl']['@id']:
                  updatedMode = [DO.C.Vocab['aclRead']['@id'], DO.C.Vocab['aclWrite'], DO.C.Vocab['aclControl']['@id']];
                  break;
              }

              updatedAuthorizations[authorization].mode = updatedMode;
            }
          }
        });

        authorizationsToDelete.forEach(authorization => {
          delete updatedAuthorizations[authorization];
        });

        //XXX: updatedAuthorizations may have different authorization objects with the same properties and values. This is essentially just duplicate authorization rules.

        insertGraph = '';
        Object.keys(updatedAuthorizations).forEach(authorization => {
          authorizationSubject = '#' + generateAttributeId();

          var additionalProperties = [];
          ['agent', 'agentClass', 'agentGroup', 'origin'].forEach(key => {
            if (updatedAuthorizations[authorization][key] && updatedAuthorizations[authorization][key].length) {
              additionalProperties.push(`  acl:${key} <${updatedAuthorizations[authorization][key].join('>, <')}>`);
            }
          })
          additionalProperties = additionalProperties.join(';\n');

          insertGraph += `
<${authorizationSubject}>
  a acl:Authorization ;
  acl:accessTo <${documentURL}> ;
  acl:mode <${updatedAuthorizations[authorization].mode.join('>, <')}> ;
  ${additionalProperties} .
`;
        });

        patches.push({ 'insert': insertGraph });
      }

      if (!patches.length) {
        throw new Error("Check why the patch payload wasn't constructed in updateAuthorization." + patches);
      }
      else {
        return patchResourceWithAcceptPatch(patchACLResource, patches);
      }
    },

    selectContacts: function(node, url) {
      node.innerHTML = '<ul id="share-resource-contacts"></ul>';
      var shareResourceNode = document.getElementById('share-resource-contacts');

      if (DO.C.User.Contacts && Object.keys(DO.C.User.Contacts).length > 0){
        Object.keys(DO.C.User.Contacts).forEach(function(iri){
          if (DO.C.User.Contacts[iri].Inbox && DO.C.User.IRI !== iri) {
            DO.U.addShareResourceContactInput(shareResourceNode, DO.C.User.Contacts[iri].Graph);
          }
        });
      }
      else {
        DO.U.updateContactsInfo(url, shareResourceNode);
      }
    },

    updateContactsInfo: function(url, node, options) {
      options = options || {};

      return getUserContacts(url).then(
        function(contacts) {
          if(contacts.length > 0) {
            contacts.forEach(function(url) {
              getSubjectInfo(url).then(subject => {
                DO.C.User.Contacts[url] = subject;
                if (subject.Graph) {
                  DO.U.addShareResourceContactInput(node, subject.Graph);
                }
              });
            });

            // return Promise.all(promises)
          }
          else {
            node.innerHTML = 'No contacts with ' + Icon[".fas.fa-inbox"] + ' inbox found in your profile, but you can enter contacts individually:';
          }

          return Promise.resolve();
        });
    },

    addShareResourceContactInput: function(node, s) {
      var iri = s?.iri().toString();
// console.log(iri.toString());
      var inbox = DO.C.User.Contacts[iri]['Inbox'];

      if (inbox && inbox.length > 0) {
        var id = encodeURIComponent(iri);
        var name = getAgentName(s) || iri;
        var img = getGraphImage(s);
        if (!(img && img.length > 0)) {
          img = generateDataURI('image/svg+xml', 'base64', Icon['.fas.fa-user-secret']);
        }
        img = '<img alt="" height="32" src="' + img + '" width="32" />';

        var input = '<li><input id="share-resource-contact-' + id + '" type="checkbox" value="' + iri + '" /><label for="share-resource-contact-' + id + '">' + img + '<a href="' + iri + '" target="_blank">' + name + '</a></label></li>';

        node.insertAdjacentHTML('beforeend', input);
      }
    },

    updateContactsInbox: function(iri, s) {
      var checkInbox = function(s) {
        var aI = getAgentInbox(s);

        if (aI) {
          return Promise.resolve(aI);
        }
        else {
          return getLinkRelationFromHead(DO.C.Vocab['ldpinbox']['@id'], iri);
        }
      }

      return checkInbox(s)
        .then(inboxes => {
          if (inboxes && inboxes.length > 0) {
            DO.C.User.Contacts[iri]['Inbox'] = inboxes;
          }
        })
    },

    nextLevelButton: function(button, url, id, action) {
      var actionNode = document.getElementById(id + '-' + action);
      //TODO: Some refactoring needed because it is radio only. For now this function is not called for inputType=checkbox
      var inputType = (id == 'location-generate-feed') ? 'checkbox' : 'radio';

      button.addEventListener('click', function(){
        if(button.parentNode.classList.contains('container')){
          var headers;
          headers = {'Accept': 'text/turtle, application/ld+json'};
          getResourceGraph(url, headers).then(function(g){
              actionNode.textContent = (action == 'write') ? url + generateAttributeId() : url;
              return DO.U.generateBrowserList(g, url, id, action);
            },
            function(reason){
              var node = document.getElementById(id);

              DO.U.showErrorResponseMessage(node, reason.response);
            }
          );
        }
        else {
          document.getElementById(id + '-input').value = url;
          var alreadyChecked = button.parentNode.querySelector('input[type="radio"]').checked;
          var radios = button.parentNode.parentNode.querySelectorAll('input[checked="true"]');

          actionNode.textContent =  url;

          for(var i = 0; i < radios.length; i++){
            radios[i].removeAttribute('checked');
          }
          if(alreadyChecked){
            button.parentNode.querySelector('input[type="radio"]').removeAttribute('checked');
          }
          else{
            button.parentNode.querySelector('input[type="radio"]').setAttribute('checked', 'true');
          }
        }
      }, false);
    },

    generateBrowserList: function(g, url, id, action) {
      //TODO: This should be part of refactoring.
      var inputType = (id == 'location-generate-feed') ? 'checkbox' : 'radio';

      return new Promise(function(resolve, reject){
        document.getElementById(id + '-input').value = url;

        var msgs = document.getElementById(id).querySelectorAll('.response-message');
        for(var i = 0; i < msgs.length; i++){
          msgs[i].parentNode.removeChild(msgs[i]);
        }

        //TODO: Perhaps this should be handled outside of generateBrowserList?
        var createContainer = document.getElementById(id + '-create-container');
        if (createContainer) {
          createContainer.innerHTML = '';
        }

        var list = document.getElementById(id + '-ul');
        list.innerHTML = '';

        var urlPath = url.split("/");
        if(urlPath.length > 4){ // This means it's not the base URL
          urlPath.splice(-2,2);
          var prevUrl = forceTrailingSlash(urlPath.join("/"));
          var upBtn = '<li class="container"><input type="radio" name="containers" value="' + prevUrl + '" id="' + prevUrl + '" /><label for="' + prevUrl + '" id="browser-up">..</label></li>';
          list.insertAdjacentHTML('afterbegin', upBtn);
        }

        var current = g.child(url);
        var contains = current.ldpcontains;
        var containersLi = Array();
        var resourcesLi = Array();
        contains.forEach(function(c){
          var cg = g.child(c);
          var types = cg.rdftype;
          var resourceTypes = [];
          types.forEach(function(type){
            resourceTypes.push(type);
          });

          var path = c.split("/");
          if(resourceTypes.indexOf('http://www.w3.org/ns/ldp#Container') > -1 || resourceTypes.indexOf('http://www.w3.org/ns/ldp#BasicContainer') > -1){
            var slug = path[path.length-2];
            containersLi.push('<li class="container"><input type="radio" name="resources" value="' + c + '" id="' + slug + '"/><label for="' + slug + '">' + decodeURIComponent(slug) + '</label></li>');
          }
          else {
            slug = path[path.length-1];
            resourcesLi.push('<li><input type="' + inputType + '" name="resources" value="' + c + '" id="' + slug + '"/><label for="' + slug + '">' + decodeURIComponent(slug) + '</label></li>');
          }

        });
        containersLi.sort(function (a, b) {
          return a.toLowerCase().localeCompare(b.toLowerCase());
        });
        resourcesLi.sort(function (a, b) {
          return a.toLowerCase().localeCompare(b.toLowerCase());
        });
        var liHTML = containersLi.join('\n') + resourcesLi.join('\n');
        list.insertAdjacentHTML('beforeend', liHTML);

        var buttons = list.querySelectorAll('label');
        if(buttons.length <= 1){
          list.insertAdjacentHTML('beforeend', '<p><em>(empty)</em></p>');
        }

        for(let i = 0; i < buttons.length; i++) {
          var buttonParent = buttons[i].parentNode;
          var buttonInput = buttonParent.querySelector('input');

          //TODO: Find a better way than checking specific ids.
          if (!(id == 'location-generate-feed' && !buttonParent.classList.contains('container'))) {
            var nextUrl = buttonInput.value;
            DO.U.nextLevelButton(buttons[i], nextUrl, id, action);
          }
        }

        return resolve(list);
      });
    },

    buttonSubscribeNotificationChannel: function(nodes, topicResource) {
      //TODO: Consider using typeof selector instead and make sure it is in the markup
      nodes.forEach(function(subNode){
        subNode.addEventListener('click', function(e) {
          var button = e.target.closest('button');

          if (button){
            if (!(topicResource in DO.C.Subscription && 'Connection' in DO.C.Subscription[topicResource]) && button.classList.contains('subscribe')) {
              var subscription = subNode.querySelector('[rel="notify:subscription"]').getAttribute('resource');
// console.log(DO.C.Resource[s.iri().toString()].subscription);
              var channelType = DO.C.Resource[topicResource]['subscription'][subscription]['channelType'];

              var data = {
                "type": channelType,
                "topic": topicResource
              };

              var features = DO.C.Resource[topicResource]['subscription'][subscription]['feature'];

              if (features && features.length > 0) {
                var d = new Date();
                var startAt = new Date(d.getTime() + 1000);
                var endAt = new Date(startAt.getTime() + 3600000);

                if (features.indexOf(DO.C.Vocab['notifystartAt']) > -1) {
                  data['startAt'] = startAt.toISOString();
                }
                if (features.indexOf(DO.C.Vocab['notifyendAt']) > -1) {
                  data['endAt'] = endAt.toISOString();
                }
                if (features.indexOf(DO.C.Vocab['notifyrate']) > -1) {
                  data['rate'] = "PT10S";
                }
              }

              DO.U.subscribeToNotificationChannel(subscription, data)
              .then(function(i){
                if (DO.C.Subscription[data.topic] && 'Connection' in DO.C.Subscription[data.topic]) {
                  button.textContent = 'Unsubscribe';
                  button.setAttribute('class', 'unsubscribe');
                }
              }).catch(e => {
                console.log(e);
              });
            }
            else {
              DO.C.Subscription[topicResource].Connection.close();
              DO.C.Subscription[topicResource] = {};
              button.textContent = 'Subscribe';
              button.setAttribute('class', 'subscribe');
            }
          }
        });
      });
    },

    showStorageDescription: function(s, id, storageUrl, checkAgain) {
      var samp = document.getElementById(id + '-samp');
      var sD = document.getElementById(id + '-storage-description');

      if (samp && !sD) {
        var sDPromise = getLinkRelation(DO.C.Vocab['solidstorageDescription']['@id'], storageUrl);

        return sDPromise
          .then(sDURLs => {
            // TODO: resourceIRI for getLinkRelation should be the
            // closest IRI (not necessarily the document).

            if (sDURLs.length > 0) {
              ///TODO: Handle multiple storage descriptions?
              var sDURL = sDURLs[0];
              DO.C.Storages = DO.C.Storages || {};
              DO.C.Storages[s.iri().toString()] = {
                "storageDescription": sDURL
              };
            }
            if (sD) {
              sD.innerHTML = '';
            }
            samp.insertAdjacentHTML('afterend', '<details id="' + id + '-storage-description-details"><summary>Storage details</summary></details>');

            sD = document.getElementById(id + '-storage-description-details');

            sD.addEventListener('click', function(e){
              if (!sD.open) {
                var storageDescriptionNode = document.getElementById(id + '-storage-description');

                if (!storageDescriptionNode) {
                  var storageLocation = '<dl id="storage-location"><dt>Storage location</dt><dd><a href="' + storageUrl +'" target="_blank">' + storageUrl + '</a></dd></dl>';

                  getResourceGraph(sDURL).then(function(g){
                    if (g) {
                      g = (g.foafprimaryTopic) ? g.child(g.foafprimaryTopic) : g.child(storageUrl);

                      var selfDescription = DO.U.getStorageSelfDescription(g);
                      var contactInformation = DO.U.getContactInformation(g);
                      var persistencePolicy = DO.U.getPersistencePolicy(g);
                      var odrlPolicies = DO.U.getODRLPolicies(g);
                      var communicationOptions = DO.U.getCommunicationOptions(g);

                      sD.insertAdjacentHTML('beforeend', '<div id="' + id + '-storage-description">' + storageLocation + selfDescription + contactInformation + persistencePolicy + odrlPolicies + communicationOptions + '</div>');

                      var subscriptionsId = id + '-storage-description-details';
                      var topicResource = s.iri().toString();

                      var nodes = document.querySelectorAll('[id="' + id + '-storage-description"] [id^="notification-subscriptions-"]');
                      DO.U.buttonSubscribeNotificationChannel(nodes, topicResource);
                    }
                    else {
                      // TODO: var status = (g.status) ? g.status
                      sD.insertAdjacentHTML('beforeend', '<div id="' + id + '-storage-description">Unavailable</div>');
                    }
                  });
                }
              }
            });

// console.log(DO.C.Resource);
          })
          .catch(error => {
            // console.log('Error fetching solid:storageDescription endpoint:', error)
            // throw error
          });
      }
    },

    getStorageSelfDescription: function(g) {
      var s = '';

      var storageName = getGraphLabel(g);
      var storageURL = g.iri().toString();

      storageName = (typeof storageName !== 'undefined') ? storageName : storageURL;

      DO.C.Resource[g.iri().toString()] = DO.C.Resource[g.iri().toString()] || {};
      DO.C.Resource[g.iri().toString()]['title'] = storageName;
      DO.C.Resource[g.iri().toString()]['description'] = g.schemaabstract || g.dctermsdescription || g.rdfvalue || g.assummary || g.schemadescription || g.ascontent || undefined;

      var storageTitle = '<dt>Storage name</dt><dd><a href="' + storageURL + '">' + storageName + '</a></dd>';
      var storageDescription = (DO.C.Resource[g.iri().toString()]['description']) ? '<dt>Storage description</dt><dd>' + DO.C.Resource[g.iri().toString()]['description'] + '</dd>' : '';

      s = '<dl id="storage-self-description">' + storageTitle + storageDescription + '</dl>';

      return s;
    },

    getPersistencePolicy: function(g) {
      var s = '';

      if (g.pimpersistencePolicy && g.pimpersistencePolicy._array.length > 0) {
        var pp = [];

        DO.C.Resource[g.iri().toString()] = DO.C.Resource[g.iri().toString()] || {};
        DO.C.Resource[g.iri().toString()]['persistencePolicy'] = [];

        g.pimpersistencePolicy.forEach(function(iri){
          DO.C.Resource[g.iri().toString()]['persistencePolicy'].push(iri);

          pp.push('<dd><a href="' + iri  + '" target="_blank">' + iri + '</a></dd>');
        });

        s = '<dl id="storage-persistence-policy"><dt>URI persistence policy</dt>' + pp.join('') + '</dl>'
      }

      return s;
    },

    getODRLPolicies: function(g) {
      var s = '';
      var odrlPolicies = [];

      if (g.odrlhasPolicy && g.odrlhasPolicy._array.length > 0) {
        g.odrlhasPolicy._array.forEach(function(iri){
          var policy = g.child(iri);
          var policyDetails = [];

          var types = policy.rdftype._array;
          var indexPolicy = types.indexOf(DO.C.Vocab['odrlOffer']["@id"]) || types.indexOf(DO.C.Vocab['odrlAgreement']["@id"]);
          if (indexPolicy >= 0) {
            var rule = types[indexPolicy];
            //XXX: Label derived from URI.
            var ruleLabel = rule.substr(rule.lastIndexOf('/') + 1);

            policyDetails.push('<dt>Rule<dt><dd><a href="' + rule + '" target="_blank">' + ruleLabel + '</a></dd>');
          }

          //TODO: odrl:Set

          if (policy.odrluid && policy.odrluid.at(0)) {
            policyDetails.push('<dt>Unique identifier<dt><dd><a href="' + policy.odrluid + '" target="_blank">' + policy.odrluid + '</a></dd>');
          }

          if (policy.odrtarget && policy.odrltarget.at(0)) {
            policyDetails.push('<dt>Target<dt><dd><a href="' + policy.odrltarget + '" target="_blank">' + policy.odrltarget + '</a></dd>');
          }

          if (policy.odrlpermission && policy.odrlpermission.at(0)) {
            var ruleG = g.child(policy.odrlpermission.at(0));

            policyDetails.push(DO.U.getODRLRuleActions(ruleG));
            policyDetails.push(DO.U.getODRLRuleAssigners(ruleG));
            policyDetails.push(DO.U.getODRLRuleAssignees(ruleG));
          }

          if (policy.odrlprohibition && policy.odrlprohibition.at(0)) {
            ruleG = g.child(policy.odrlprohibition.at(0));

            policyDetails.push(DO.U.getODRLRuleActions(ruleG));
            policyDetails.push(DO.U.getODRLRuleAssigners(ruleG));
            policyDetails.push(DO.U.getODRLRuleAssignees(ruleG));
          }

          var detail = '<dl>' + policyDetails.join('') + '</dl>';

          odrlPolicies.push('<dd><details><summary><a href="' + iri + '" target="_blank">' + iri + '</a></summary>' + detail + '</details></dd>');
        });

        s = '<dl id="odrl-policies"><dt>Policies</dt>' + odrlPolicies.join('') + '</dl>';
      }

      return s;
    },

    getODRLRuleActions: function(r) {
// console.log(r.odrlaction)
      var actions = [];

      if (r.odrlaction && r.odrlaction._array.length > 0) {
        r.odrlaction._array.forEach(function(iri){

          //FIXME: Label derived from URI.
          var label = iri;
          var href = iri;

          if (iri.startsWith('http://www.w3.org/ns/odrl/2/')) {
            label = iri.substr(iri.lastIndexOf('/') + 1);
            href = 'https://www.w3.org/TR/odrl-vocab/#term-' + label;
          }
          else if (iri.startsWith('http://creativecommons.org/ns#')) {
            label = iri.substr(iri.lastIndexOf('#') + 1);
            href = 'https://www.w3.org/TR/odrl-vocab/#term-' + label;
          }
          else if (iri.lastIndexOf('#')) {
            label = iri.substr(iri.lastIndexOf('#') + 1);
          }
          else if (iri.lastIndexOf('/')) {
            label = iri.substr(iri.lastIndexOf('/') + 1);
          }

          var warning = '';
          var attributeClass = '';
          var attributeTitle = '';

          //Get user's actions from preferred policy (prohibition) to check for conflicts with storage's policy (permission)
          if (DO.C.User.PreferredPolicyRule && DO.C.User.PreferredPolicyRule.Prohibition && DO.C.User.PreferredPolicyRule.Prohibition.Actions.indexOf(iri) > -1) {
            warning = Icon[".fas.fa-circle-exclamation"] + ' ';
            attributeClass = ' class="warning"';
            attributeTitle = ' title="The action (' + label + ') is prohibited by preferred policy."';
          }

          actions.push('<li' + attributeTitle + '>' + warning + '<a' + attributeClass + ' href="' + href + '" resource="' + iri + '">' + label + '</a></li>')
        });

        actions = '<dt>Actions</dt><dd><ul rel="odrl:action">' + actions.join('') + '</ul></dd>';

        return actions;
      }
    },

    getODRLRuleAssigners: function(g) {
      var s = '';
      var a = [];

      if (g.odrlassigner && g.odrlassigner._array.length > 0) {
        g.odrlassigner._array.forEach(function(iri){
          a.push('<dd><a href="' + iri + '" target="_blank">' + iri + '</a></dd>');
        });

        s = '<dt>Assigners</dt>' + a.join('');
      }

      return s;
    },

    getODRLRuleAssignees: function(g) {
      var s = '';
      var a = [];

      if (g.odrlassignee && g.odrlassignee._array.length > 0) {
        g.odrlassignee._array.forEach(function(iri){
          a.push('<dd><a href="' + iri + '" target="_blank">' + iri + '</a></dd>');
        });

        s = '<dt>Assignees</dt>' + a.join('');
      }

      return s;
    },

    getContactInformation: function(g) {
      var s = '';
      var resourceOwners = [];


      if (g.solidowner && g.solidowner._array.length > 0) {
        DO.C.Resource[g.iri().toString()] = DO.C.Resource[g.iri().toString()] || {};
        DO.C.Resource[g.iri().toString()]['owner'] = [];

        g.solidowner._array.forEach(function(iri){
          DO.C.Resource[g.iri().toString()]['owner'].push(iri);

          resourceOwners.push('<dd><a href="' + iri + '" target="_blank">' + iri + '</a></dd>');
        });

        s = '<dl id="resource-owners"><dt>Owners</dt>' + resourceOwners.join('') + '</dl>';
      }

      return s;
    },

    getCommunicationOptions: function(g, options = {}) {
      var subjectURI = options.subjectURI || g.iri().toString();
      g = g.child(subjectURI);
// console.log(subjectURI)
      var notificationSubscriptions = DO.U.getNotificationSubscriptions(g);
      var notificationChannels = DO.U.getNotificationChannels(g);

      DO.C.Resource[subjectURI] = DO.C.Resource[subjectURI] || {};

      if (notificationSubscriptions) {
        DO.C.Resource[subjectURI]['subscription'] = DO.C.Resource[subjectURI]['subscription'] || {};
      }

      if (notificationChannels) {
        DO.C.Resource[subjectURI]['channel'] = DO.C.Resource[subjectURI]['channel'] || {};
      }

      var nSHTML = [];

      if (notificationSubscriptions) {
        nSHTML.push('<dl id="notification-subscriptions-' + subjectURI + '"><dt>Notification Subscriptions</dt>');

        notificationSubscriptions.forEach(function(subscription){
          var nSChannelType = '';
          var nSSubscription = '';
          var nSFeatures = '';

          var nS = g.child(subscription);
          var channelType = DO.U.getNotificationChannelTypes(nS);
          var features = DO.U.getNotificationFeatures(nS);

          DO.C.Resource[subjectURI]['subscription'][subscription] = {};
          DO.C.Resource[subjectURI]['subscription'][subscription]['channelType'] = channelType;
          DO.C.Resource[subjectURI]['subscription'][subscription]['feature'] = features;

          var buttonSubscribe = 'Subscribe';
          var buttonSubscribeClass = 'subscribe';

          var topicResource = subjectURI;

          if (DO.C.Subscription[topicResource] && DO.C.Subscription[topicResource].Connection) {
            buttonSubscribe = 'Unsubscribe';
            buttonSubscribeClass = 'unsubscribe';
          }

          nSHTML.push('<dd id="notification-subscription-' + subscription + '"><details><summary><a href="' + subscription + '" target="_blank">' + subscription + '</a></summary>');
          nSHTML.push('<dl rel="notify:subscription" resource="' + subscription + '">');
          // nSHTML.push('<dt>Subscription</dt><dd><a href="' + subscription + '" target="_blank">' + subscription + '</a></dd>');

          var topic = subjectURI;

          if (topic) {
            nSHTML.push('<dt>Topic</dt><dd><a href="' + topic + '" rel="notify:topic" target="_blank">' + topic + '</a> <button id="notification-subscription-' + subscription + '-button"' + ' class="' + buttonSubscribeClass + '">' + buttonSubscribe + '</button></dd>');
          }

          if (channelType) {
            nSHTML.push('<dt>Channel Type</dt><dd><a href="' + channelType + '" rel="notify:channelType" target="_blank">' + channelType + '</a></dd>');
          }

          if (features) {
            nSHTML.push('<dt>Features</dt><dd><ul rel="notify:feature">');

            var nF = [];

            features.forEach(function(iri){
              var label, href = iri;

              switch (iri) {
                case DO.C.Vocab['notifystartAt']:
                case DO.C.Vocab['notifyendAt']:
                case DO.C.Vocab['notifystate']:
                case DO.C.Vocab['notifyrate']:
                case DO.C.Vocab['notifyaccept']:
                  label = getFragmentFromString(iri);
                  href = 'https://solidproject.org/TR/2022/notifications-protocol-20221231#notify-' + label;
                  break;

                default:
                  break;
              }

              nSHTML.push('<li><a href="' + href + '" resource="' + iri + '" target="_blank">' + label + '</a></li>');
            });

            nSHTML.push('</ul></dd>');
          }

          nSHTML.push('</dl></details></dd>');
        })

        nSHTML.push('</dl>');
      }

      return nSHTML.join('');
    },

    //https://solidproject.org/TR/notifications-protocol#discovery
    getNotificationSubscriptions: function(s) {
      return (s.notifysubscription && s.notifysubscription._array.length > 0)
        ? s.notifysubscription._array
        : undefined
    },

    getNotificationChannels: function(s) {
      return (s.notifychannel && s.notifychannel._array.length > 0)
        ? s.notifychannel._array
        : undefined
    },

    getNotificationChannelTypes: function(s) {
      return (s.notifychannelType)
        ? s.notifychannelType
        : undefined
    },

    getNotificationFeatures: function(s) {
      return (s.notifyfeature && s.notifyfeature._array.length > 0)
        ? s.notifyfeature._array
        : undefined
    },

    //doap:implements <https://solidproject.org/TR/2022/notification-protocol-20221231#subscription-client-subscription-request>
    subscribeToNotificationChannel: function(url, data) {
      switch(data.type){
        //doap:implements <https://solidproject.org/TR/websocket-channel-2023>
        case DO.C.Vocab['notifyWebSocketChannel2023']['@id']:
          return DO.U.subscribeToWebSocketChannel(url, data);
      }
    },

    //doap:implements <https://solidproject.org/TR/2022/notification-protocol-20221231#notification-channel-data-model>
    subscribeToWebSocketChannel: function(url, d, options = {}) {
      if (!url || !d.type || !d.topic) { return Promise.reject(); }

      options['contentType'] = options.contentType || 'application/ld+json';

      var data;

      switch (options.contentType) {
        case 'text/turtle':
          var notifyChannelType = 'notify' + d.type;
          data = '<> a <' + DO.C.Vocab[notifyChannelType]['@id']  + '> ;\n\
  <http://www.w3.org/ns/solid/notifications#topic> <' + d.topic + '> .';
          break;

        default:
        case 'application/ld+json':
          d['@context'] = d['@context'] || ["https://www.w3.org/ns/solid/notification/v1"];
          // d['id'] = d['id'] || '';
          // data['feature'] = '';
          data = JSON.stringify(d);
          break;
      }

// d.topic = 'https://csarven.localhost:8443/foo.html';
      if (DO.C.Subscription[d.topic] && DO.C.Subscription[d.topic]['Connection']) {
        DO.C.Subscription[d.topic]['Connection'].close();
      }

      DO.C.Subscription[d.topic] = {};
      DO.C.Subscription[d.topic]['Request'] = d;

// console.log(DO.C.Subscription)

      return postResource(url, '', data, options.contentType, null, options)
        .then(response => {
          return DO.U.processNotificationSubscriptionResponse(response, d);
        })
        .catch(error => {
            console.error(error);

            let message;

            switch (error.status) {
              case 0:
              case 405:
                message = 'subscription request not allowed.';
                break;
              case 401:
                message = 'you are not authorized.'
                if(!DO.C.User.IRI){
                  message += ' Try signing in.';
                }
                break;
              case 403:
                message = 'you do not have permission to request a subscription.';
                break;
              case 406:
                message = 'representation not acceptable to the user agent.';
                break;
              default:
                // some other reason
                message = error.message;
                break;
            }

            // re-throw, to break out of the promise chain
            throw new Error('Cannot subscribe: ', message);
        })
        .then(data => {
// console.log(data);
// data = {
//   '@context': ['https://www.w3.org/ns/solid/notifications/v1'],
//   'type': 'WebSocketChannel2023',
//   'topic': 'https://csarven.localhost:8443/foo.html',
//   'receiveFrom': 'wss://csarven.localhost:8443/'
// }

          if (!(data.topic in DO.C.Subscription)) {
            console.log('DO.C.Subscription[' + data.topic + '] undefined.');
          }
          DO.C.Subscription[data.topic]['Response'] = data;

          switch (data.type) {
            case 'WebSocketChannel2023': case DO.C.Vocab['notifyWebSocketChannel2023']['@id']:
              data.type = DO.C.Vocab['notifyWebSocketChannel2023']['@id'];
              return DO.U.connectToWebSocket(data.receiveFrom, data).then(function(i){
                DO.C.Subscription[data.topic]['Connection'] = i;
                // return Promise.resolve();
              });
          }
        });
    },

    processNotificationSubscriptionResponse: function(response, d) {
      var cT = response.headers.get('Content-Type');
      var contentType = cT.split(';')[0].trim();

      var rD = (contentType == 'application/ld+json') ? response.json() : response.text();

      return rD.then(data => {
        // return getGraphFromData(data, options).then
        switch (contentType) {
          case 'text/turtle':
            return Promise.reject({'message': 'TODO text/turtle', 'data': data});

          case 'application/ld+json':
            if (data['@context'] && data.type && data.topic) {
              if (d.topic != data.topic) {
                console.log('TODO: topic requested != response');
              }

              //TODO d.type == 'LDNChannel2023' && data.sender
              if ((d.type == 'WebSocketChannel2023' || d.type == DO.C.Vocab['notifyWebSocketChannel2023']['@id']) && data.receiveFrom) {
                return Promise.resolve(data);
              }
            }
            else {
              return Promise.reject({'message': 'Missing @context, type, topic(, receiveFrom)', 'data': data})
            }
            break;

          default:
          case 'text/plain':
            return Promise.reject({'message': 'TODO text/plain?', 'data': data});
        }
      });
    },

    processNotificationChannelMessage: function(data, options) {
// console.log(data);
// console.log(options);
// data = {
//   "@context": [
//     "https://www.w3.org/ns/activitystreams",
//     "https://www.w3.org/ns/solid/notification/v1"
//   ],
//   "id": "urn:uuid:" + generateUUID(),
//   "type": "Update",
//   "object": "https://csarven.localhost:8443/foo.html",
//   "state": "128f-MtYev",
//   "published": "2021-08-05T01:01:49.550Z"
// }

      //TODO: Only process ns/solid/notifications/v1 JSON-LD context.
      // return getGraphFromData(data, options).then(

      if (data['@context'] && data.id && data.type && data.object && data.published) {
        if (options.subjectURI != data.object) {
          console.log('TODO: topic requested != message object ');
        }

        // if (data.type.startsWith('https://www.w3.org/ns/activitystreams#')) {
          //TODO: Move this UI somewhere else

          //TODO: See if createActivityHTML can be generalised/reusable.


          DO.C.Subscription[data.object]['Notifications'] = DO.C.Subscription[data.object]['Notifications'] || {};
          //TODO: Max notifications to store. FIFO
          DO.C.Subscription[data.object]['Notifications'][data.id] = data;
          // DO.C.Subscription[data.object]['Notifications'][data.id] = g;
// console.log(DO.C.Subscription[data.object]['Notifications'])

          var nTypes = (Array.isArray(data.type)) ? data.type : [data.type];
          var types = '';
          nTypes.forEach(function(t){
            types += types + '<dd><a href="' + t + '">' + t + '</a></dd>';
          })

          var message = [];
          message.push('<details>');
          message.push('<summary>Notification Received</summary>');
          message.push('<dl>');
          message.push('<dt>Identifier</dt><dd><a href="' + data.id  + '">' + data.id + '</a></dd>');
          message.push('<dt>Types</dt>' + types);
          message.push('<dt>Object</dt><dd><a href="' + data.object  + '">' + data.object + '</a></dd>');
          message.push('<dt>Published</dt><dd><time>' + data.published + '</time></dd>');
          message.push('</dl>');
          message.push('</details>');
          message = message.join('');

          message = {
            'content': message,
            'type': 'info',
            'timer': 3000
          }
          addMessageToLog(message, Config.MessageLog);
          showActionMessage(document.documentElement, message);

          // return Promise.resolve(data);
        // }
      }
    },

    connectToWebSocket: function(url, data) {
      function connect() {
        return new Promise(function(resolve, reject) {
// console.log(data)
          var protocols = [data.type];
// protocols = ['solid-0.1'];

          var ws = new WebSocket(url, protocols);
          var message;

          ws.onopen = function() {
            message = {'message': 'Connected to ' + url + ' (' + data.type + ').'};
            console.log(message);
// ws.send('sub ' + data.topic);

            // ws.send(JSON.stringify({
            // }));
            resolve(ws);
          };

          ws.onclose = function(e) {
            message = {'message': 'Socket to ' + url + ' is closed.'};
            //TODO: Separate reconnect on connection dropping from intentional close.
            // setTimeout(function() { connect(); }, 1000);
            // var timeout = 250;
            // setTimeout(connect, Math.min(10000,timeout+=timeout));

            console.log(message, e.reason);
          };

          ws.onerror = function(err) {
            console.error('Socket encountered error: ', err.message, 'Closing socket');
            ws.close();

            reject(err);
          };

          ws.onmessage = function(msg) {
// console.log(msg)
            var options = { 'subjectURI': data.topic }
            DO.U.processNotificationChannelMessage(msg.data, options);
          };
        });
      }

      return connect().then().catch(function(err) {
        console.log(err)
      });
    },

    //TODO: Refactor, especially buttons.
    initBrowse: function(baseUrl, input, browseButton, createButton, id, action){
      input.value = baseUrl;
      var headers;
      headers = {'Accept': 'text/turtle, application/ld+json'};
      getResourceGraph(baseUrl, headers).then(function(g){
        DO.U.generateBrowserList(g, baseUrl, id, action).then(function(i){
          DO.U.showStorageDescription(g, id, baseUrl);
        });
      }).then(function(i){
        document.getElementById(id + '-' + action).textContent = (action == 'write') ? input.value + generateAttributeId() : input.value;
      });

      browseButton.addEventListener('click', function(e){
        DO.U.triggerBrowse(input.value, id, action);
      }, false);

      createButton.addEventListener('click', function(e){
        DO.U.showCreateContainer(input.value, id, action, e);
      }, false);
    },

    triggerBrowse: function(url, id, action){
      var inputBox = document.getElementById(id);
      if (url.length > 10 && url.match(/^https?:\/\//g) && url.slice(-1) == "/"){
// console.log(url)
        var headers;
        headers = {'Accept': 'text/turtle, application/ld+json'};
        getResourceGraph(url, headers).then(function(g){
          DO.U.generateBrowserList(g, url, id, action).then(function(l){
            DO.U.showStorageDescription(g, id, url);
            return l;
          },
          function(reason){
            console.log('???? ' + reason); // Probably no reason for it to get to here
          });
        },
        function(reason){
          var node = document.getElementById(id + '-ul');

          DO.U.showErrorResponseMessage(node, reason.response);
        });
      }
      else{
        inputBox.insertAdjacentHTML('beforeend', '<div class="response-message"><p class="error">This is not a valid location.</p></div>');
      }
    },

    showCreateContainer: function(baseURL, id, action, e) {
      //FIXME: Do these checks for now until showCreateContainer is refactored
      if (!e) {
        return;
      }
      id = id || generateUUID();

      var div = document.getElementById(id + '-create-container');
      if (div) {
        div.innerHTML = '';
      }

      div.insertAdjacentHTML('beforeend', '<label for="' + id + '-create-container-name">Container Name</label> <input id="' + id + '-create-container-name" name="' + id + '-create-container-name" type="text" placeholder="My Secret Stuff" /> <button class="insert" disabled="disabled">Create</button>');

      var label = div.querySelector('label');
      var input = div.querySelector('input');

      var createButton = document.querySelector('#' + id + '-create-container button.insert');

      input.addEventListener('keyup', function(e){
        var containerLabel = input.value.trim();

        if (containerLabel.length > 0) {
          createButton.removeAttribute('disabled');
        }
        else {
          createButton.disabled = 'disabled';
        }
      });

      createButton.addEventListener('click', function(e){
        //FIXME: Escaping containerLabel and containerURL (request-target) can be better.

        var patch = {};
        var containerLabel = input.value.trim();
        var insertG = '<> <' + DO.C.Vocab['dctermstitle'] +  '> """' + containerLabel.replace(/"/g, '\"') + '""" .';
        patch = { 'insert': insertG };

        containerLabel = containerLabel.endsWith('/') ? containerLabel.slice(0, -1) : containerLabel;

        var containerURL = baseURL + encodeURIComponent(containerLabel) + '/';

        var options = { 'headers': { 'If-None-Match': '*' } };

        patchResourceWithAcceptPatch(containerURL, patch, options).then(
          function(response){
            DO.U.triggerBrowse(containerURL, id, action);
          },
          function(reason) {
            var main = '<article about=""><dl id="document-title"><dt>Title</dt><dd property="dcterms:title">' + containerLabel + '</dd></dl></article>';
            var o = {
              'omitLang': true,
              'prefixes': {
                'dcterms': 'http://purl.org/dc/terms/'
              }
            }
            var data = createHTML(containerLabel, main, o);
// console.log(data);

            putResourceWithAcceptPut(containerURL, data, options).then(
              function(response){
                DO.U.triggerBrowse(containerURL, id, action);
              },
              function(reason){
// console.log(reason);
                var node = document.getElementById(id + '-create-container');
                DO.U.showErrorResponseMessage(node, reason.response, 'createContainer');
              });
          });
      });
    },

    showErrorResponseMessage(node, response, context) {
      var statusCode = ('status' in response) ? response.status : 0;
      statusCode = (typeof statusCode === 'string') ? parseInt(response.slice(-3)) : statusCode;
// console.log(statusCode)
console.log(response)
      var msgs = node.querySelectorAll('.response-message');
      for(var i = 0; i < msgs.length; i++){
        msgs[i].parentNode.removeChild(msgs[i]);
      }

      var statusText = response.statusText || '';
      //TODO: use Sanitizer API?
      statusText = statusText
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

      var msg = '';

      switch(statusCode) {
        default:
          msg = 'Request unsuccessful ('+ statusText + ').';
          break;
        case 401:
          var s = 'You are not authenticated with valid credentials.';
          msg = (!DO.C.User.IRI) ? s + ' . Try signing in.' : s;
          break;
        case 403:
          msg = 'This request is forbidden.';
          break;
        case 404:
          msg = 'Not found.';
          break;
        case 405:
          msg = 'Request not supported on the target resource.';
          break;
        case 409:
          msg = 'Conflict with the current state of the target resource.';
          break;
        case 412:
          msg = 'Precondition failed.';
          switch (context) {
            default:
              break;
            case 'createContainer':
              msg += ' Use a different Container Name.';
              break;
          }
          break;
      }

      node.insertAdjacentHTML('beforeend', '<div class="response-message"><p class="error">' + msg + '</p></div>');
    },

    setupResourceBrowser: function(parent, id, action){
      id = id || 'browser-location';
      action = action || 'write';

      parent.insertAdjacentHTML('beforeend', '<div id="' + id + '"><label for="' + id +'-input">URL</label> <input type="text" id="' + id +'-input" name="' + id + '-input" placeholder="https://example.org/path/to/" /><button id="' + id +'-update" disabled="disabled" title="Browse location">Browse</button> <button id="' + id + '-create-container-button' + '" title="Create container (folder)">Create container</button></div>\n\
      <div id="' + id + '-create-container"></div><div id="' + id + '-listing"></div>');

      var inputBox = document.getElementById(id);
      var createContainer = document.getElementById(id + '-create-container');
      var createButton = document.getElementById(id + '-create-container-button');
      var storageBox = document.getElementById(id + '-listing');
      var input = document.getElementById(id + '-input');
      var browseButton = document.getElementById(id + '-update');

      input.addEventListener('keyup', function(e){
        var msgs = document.getElementById(id).querySelectorAll('.response-message');
        for(var i = 0; i < msgs.length; i++){
          msgs[i].parentNode.removeChild(msgs[i]);
        }

        var actionNode = document.getElementById(id + '-' + action);
        if (input.value.length > 10 && input.value.match(/^https?:\/\//g) && input.value.slice(-1) == "/") {
          browseButton.removeAttribute('disabled');
          //TODO: enable button if only agent has write permission?
          // createButton.removeAttribute('disabled');

          if(e.which == 13){
            DO.U.triggerBrowse(input.value, id, action);
          }
          if(actionNode){
            actionNode.textContent = input.value + generateAttributeId();
          }
        }
        else {
          browseButton.disabled = 'disabled';
          //TODO: disable button if only agent has write permission?
          // createButton.disabled = 'disabled';
          if(actionNode) {
            actionNode.textContent = input.value;
          }
        }
      }, false);

      var browserul = document.getElementById(id + '-ul');
      if(!browserul){
        browserul = document.createElement('ul');
        browserul.id = id + '-ul';

        storageBox.appendChild(browserul);
      }

      var baseUrl;

      // TODO: Show and use storage, outbox, annotationService as opposed to first available.

      if(DO.C.User.Storage && DO.C.User.Storage.length > 0) {
        baseUrl = forceTrailingSlash(DO.C.User.Storage[0]);
      }
      else if(DO.C.User.Outbox && DO.C.User.Outbox[0]) {
        baseUrl = forceTrailingSlash(DO.C.User.Outbox[0]);
      }


      if(baseUrl){
        DO.U.initBrowse(baseUrl, input, browseButton, createButton, id, action);
      }
      else {
        getLinkRelation(DO.C.Vocab['oaannotationService']['@id'], null, getDocument()).then(
          function(storageUrl) {
            DO.U.initBrowse(storageUrl[0], input, browseButton, createButton, id, action);
          },
          function(){
            var input = document.getElementById(id + '-input');

            browseButton.addEventListener('click', function(){
              createContainer.innerHTML = '';
              DO.U.triggerBrowse(input.value, id, action);
            }, false);
            createButton.addEventListener('click', function(e){
              DO.U.showCreateContainer(input.value, id, action, e);
            }, false);
          }
        )
      }
    },

    showResourceBrowser: function(id, action) {
      id = id || 'location-' + generateAttributeId();
      action = action || 'write';

      var browserHTML = '<aside id="resource-browser-' + id + '" class="do on">' + DO.C.Button.Close + '<h2>Resource Browser</h2></aside>';
      document.documentElement.appendChild(fragmentFromString(browserHTML));

      DO.U.setupResourceBrowser(document.getElementById('resource-browser-' + id), id, action);
      document.getElementById('resource-browser-' + id).insertAdjacentHTML('beforeend', '<p><samp id="' + id + '-' + action + '"></samp></p>');
    },

    openInputFile: function(e) {
      var file = e.target.files[0];
// console.log(file);
      var contentType = file.type;
      var options = { 'init': true };

      var reader = new FileReader();
      reader.onload = function(){
// console.log(reader);

        var html = DO.U.spawnDokieli(document, reader.result, contentType, 'file:' + file.name, options);
      };
      reader.readAsText(file);
    },

    openDocument: function (e) {
      if(typeof e !== 'undefined') {
        e.target.disabled = true;
      }
      document.documentElement.appendChild(fragmentFromString('<aside id="open-document" class="do on">' + DO.C.Button.Close + '<h2>Open Document</h2><p><label for="open-local-file">Open local file</label> <input type="file" id="open-local-file" name="open-local-file" /></p></aside>'));

      var id = 'location-open-document';
      var action = 'read';

      var openDocument = document.getElementById('open-document');
      DO.U.setupResourceBrowser(openDocument , id, action);
      var idSamp = (typeof DO.C.User.Storage == 'undefined') ? '' : '<p><samp id="' + id + '-' + action + '">https://example.org/path/to/article</samp></p>';
      openDocument.insertAdjacentHTML('beforeend', idSamp + '<button class="open" title="Open document">Open</button>');

      openDocument.addEventListener('click', function (e) {
        if (e.target.closest('button.close')) {
          document.querySelector('#document-do .resource-open').disabled = false;
        }

        if (e.target.closest('#open-local-file')){
          e.target.addEventListener('change', DO.U.openInputFile, false);
        }

        if (e.target.closest('button.open')) {
          var openDocument = document.getElementById('open-document');
          var rm = openDocument.querySelector('.response-message');
          if (rm) {
            rm.parentNode.removeChild(rm);
          }

          var bli = document.getElementById(id + '-input');
          var iri = bli.value;

          var options = {};

          DO.U.openResource(iri, options);
        }
      });
    },

    openResource: function(iri, options) {
      options = options || {};
      var headers = { 'Accept': setAcceptRDFTypes() };
      var pIRI = getProxyableIRI(iri);
      // if (pIRI.slice(0, 5).toLowerCase() == 'http:') {
      // }

      // options['noCredentials'] = true;

      var handleResource = function handleResource (pIRI, headers, options) {
        var message = {
          'content': 'Opening <a href="' + iri + '" target="_blank">' + iri + '</a>.',
          'type': 'info',
          'timer': 10000
        }
        addMessageToLog(message, Config.MessageLog);
        message.content = '<span class="progress">' + Icon[".fas.fa-circle-notch.fa-spin.fa-fw"] + message.content + '</span>';
        showActionMessage(document.documentElement, message);

        return getResource(pIRI, headers, options)
          .catch(error => {
            console.log(error)
            // console.log(error.status)
            // console.log(error.response)

            //XXX: It was either a CORS related issue or 4xx/5xx.

            var message = 'Unable to open <a href="' + iri + '" target="_blank">' + iri + '</a>.';
            message = {
              'content': message,
              'type': 'error',
              'timer': 5000
            }
            addMessageToLog(message, Config.MessageLog);
            message.content = '<span class="progress">' + Icon[".fas.fa-times-circle.fa-fw"] + message.content + '</span>';
            showActionMessage(document.documentElement, message);

            throw error
          })
          .then(response => {
// console.log(response)
            iri = encodeURI(iri)
            var cT = response.headers.get('Content-Type');
            var options = {};
            options['contentType'] = (cT) ? cT.split(';')[0].toLowerCase().trim() : 'text/turtle';
            options['subjectURI'] = iri;

            return response.text()
              .then(data => {
                //XXX: Revisit DOMPurify. This removes... pretty much everything. We don't necessarily want to completely get rid of styles (`link` or `style` tags). `script` tag and perhaps `style` attribute could perhaps be filtered - not sure if that's something we want to keep. Definitely do not remove RDF attributes (DO.C.RDFaAttributes).
                // var sT = [...DO.C.MediaTypes.Markup, ...['text/plain', 'application/xhtml+xml']];
                // if (sT.includes(options['contentType'])) {
                //   data = DOMPurify.sanitize(data);
                //   console.log(DOMPurify.removed)
                // }

                DO.U.setDocumentURL(iri);
                var documentURL = DO.C.DocumentURL;
                DO.C['Resource'][documentURL] = Config['Resource'][documentURL] || {};

                var spawnOptions = {};

                var checkMarkdownInMediaTypes = ['text/markdown', 'text/plain'];
                if  (checkMarkdownInMediaTypes.indexOf(options['contentType']) > -1) {
                  data = DO.U.parseMarkdown(data, {createDocument: true});
                  spawnOptions['defaultStylesheet'] = true;
                  //XXX: Perhaps okay for text/markdown but not text/plain?
                  options.contentType = 'text/html';
                }

                if (DO.C.MediaTypes.RDF.includes(options['contentType'])) {
                  getResourceInfo(data, options);
                }

                DO.U.buildResourceView(data, options)
                  .then(o => {
// console.log(o)
                    spawnOptions['defaultStylesheet'] = ('defaultStylesheet' in o) ? o.defaultStylesheet : (('defaultStylesheet' in spawnOptions) ? spawnOptions['defaultStylesheet'] : false);
                    spawnOptions['init'] = true;

                    var html = DO.U.spawnDokieli(document, o.data, o.options['contentType'], o.options['subjectURI'], spawnOptions);
                  })
              })
              .then(() => {
                var rm = document.querySelector('#document-action-message')
                if (rm) {
                  rm.parentNode.removeChild(rm)
                }
                var message = 'Opened <a href="' + iri + '" target="_blank">' + iri + '</a>.';
                message = {
                  'content': message,
                  'type': 'success',
                  'timer': 3000
                }
                addMessageToLog(message, Config.MessageLog);
                showActionMessage(document.documentElement, message);
              })
          })
      }

      handleResource(pIRI, headers, options);
    },

    parseMarkdown: function(data, options) {
      options = options || {};
// console.log(data)
      var extensions = {
        extensions: [gfm()],
        allowDangerousHtml: true,
        htmlExtensions: [gfmHtml(), gfmTagfilterHtml()]
      };
      var html = marked(data, extensions);
// console.log(parsed)
      if (options.createDocument) {
        html = createHTML('', '<article>' + html+ '</article>');
      }
// console.log(html);
      return html;
    },

    buildResourceView: function(data, options) {
      if (!DO.C.MediaTypes.RDF.includes(options['contentType'])) {
        return Promise.resolve({"data": data, "options": options});
      }

      return getGraphFromData(data, options).then(
        function(i){
          var s = SimpleRDF(DO.C.Vocab, options['subjectURI'], i, ld.store).child(options['subjectURI']);
// console.log(s)
          var title = getGraphLabel(s) || options.subjectURI;
          var h1 = '<a href="' +  options.subjectURI + '">' + title + '</a>';

          var types = s.rdftype._array;
// console.log(types)
          if(types.indexOf(DO.C.Vocab['ldpContainer']["@id"]) >= 0 ||
             types.indexOf(DO.C.Vocab['asCollection']["@id"]) >= 0 ||
             types.indexOf(DO.C.Vocab['asOrderedCollection']["@id"]) >= 0) {

            return DO.U.processResources(options['subjectURI'], options).then(
              function(url) {

                var promises = [];
                url.forEach(function(u) {
                  // console.log(u);
                  // window.setTimeout(function () {

                    // var pIRI = getProxyableIRI(u);
                    promises.push(getResourceGraph(u));
                  // }, 1000)
                });

                // return Promise.all(promises.map(p => p.catch(e => e)))
                return Promise.allSettled(promises)
                  .then(function(results) {
                    var items = [];
                    // graphs.filter(result => !(result instanceof Error));

                    //TODO: Refactor if/else based on getResourceGraph
                    results.forEach(function(result){
// console.log(result.value)

                      //XXX: Not sure about htis.
                      if (result.value instanceof Error) {
                        // TODO: decide how to handle
                      }
                      //FIXME: This is not actually useful yet. getResourceGraph should return the iri in which its content had no triples or failed to parse perhaps.
                      else if (typeof result.value === 'undefined') {
                        //   items.push('<a href="' + result.value + '">' + result.value + '</a>');
                      }
                      else if ('resource' in result.value) {
                        items.push('<li rel="schema:hasPart" resource="' + result.value.resource + '"><a href="' + result.value.resource + '">' + result.value.resource + '</a></li>');
                      }
                      else {
                        var html = DO.U.generateIndexItemHTML(result.value);
                        if (typeof html === 'string' && html !== '') {
                          items.push('<li rel="schema:hasPart" resource="' + result.value.iri().toString() + '">' + html + '</li>');
                        }
                      }
                    })

                    //TODO: Show createNewDocument button.
                    var createNewDocument = '';

                    var listItems = '';

                    if (items.length > 0) {
                      listItems = "<ul>" + items.join('') + "</ul>";
                    }

                    var html = `      <article about="" typeof="as:Collection">
        <h1 property="schema:name">` + h1 + `</h1>
        <div datatype="rdf:HTML" property="schema:description">
          <section>` + createNewDocument + listItems + `
          </section>
        </div>
      </article>`;

                    return {
                      'data': createHTML('Collection: ' + options.subjectURI, html),
                      'options': {
                        'subjectURI': options.subjectURI,
                        'contentType': 'text/html'
                      },
                      'defaultStylesheet': true
                    };
                  })
                  .catch(e => {
                    // console.log(e)
                  });
              });
          }
          else {
            return {"data": data, "options": options};
          }

        });
    },

    generateIndexItemHTML: function(g, options) {
      if (typeof g.iri === 'undefined') return;

// console.log(graph);
      options = options || {};
      var image = '';
      var name = '';
      var published = '';
      var summary = '';
      var tags = '';

      image = getGraphImage(g) || '';
      if (image) {
        image = getResourceImageHTML(image) + ' ';
      }

      name = getGraphLabel(g) || g.iri().toString();
      name = '<a href="' + g.iri().toString() + '" property="schema:name" rel="schema:url">' + name + '</a>';

      var datePublished = g.schemadatePublished || g.dctermsissued || g.dctermsdate || g.aspublished || g.schemadateCreated || g.dctermscreated || g.provgeneratedAtTime || g.dctermsmodified || g.asupdated || '';

      if (datePublished) {
        published = ', <time content="' + datePublished + '" datetime="' + datePublished + '" property="schema:dataPublished">' + datePublished.substr(0,10) + '</time>';
      }

      if (g.oahasBody) {
        summary = g.child(g.oahasBody).rdfvalue;
      }
      else {
        summary = g.schemaabstract || g.dctermsdescription || g.rdfvalue || g.assummary || g.schemadescription || g.ascontent || '';
      }

      if (summary) {
        summary = '<div datatype="rdf:HTML" property="schema:description">' + summary + '</div>';
      }

      if (g.astag && g.astag._array.length > 0) {
        tags = [];
        g.astag.forEach(function(tagURL){
          var t = g.child(tagURL);
          var tagName = getFragmentOrLastPath(tagURL);

          if (t.ashref && t.asname.length > 0) {
            tagURL = t.ashref;
          }
          if (t.asname && t.asname.length > 0) {
            tagName = t.asname;
          }
          tags.push('<li><a href="' + tagURL + '" rel="schema:about">' + tagName + '</a></li>');
        })
        tags = '<ul>' + tags.join('') + '</ul>';
      }

      return image + name + published + summary + tags;
    },

    spawnDokieli: async function(documentNode, data, contentType, iri, options){
      options =  options || {};

      // if (DO.C.MediaTypes.RDF.includes(contentType)) {
        var tmpl = document.implementation.createHTMLDocument('template');
// console.log(tmpl);

        switch(contentType){
          case 'text/html': case 'application/xhtml+xml':
            //TODO: Remoe scripts, keep styles?
            //tmpl.documentElement.appendChild(fragmentFromString(DOMPurify.sanitize(data)));
            tmpl.documentElement.innerHTML = data;
            break;

          case 'application/gpx+xml':
// console.log(data)
            tmpl = await generateGeoView(data)
            // FIXME: Tested with generateGeoView returning a Promise but somehow
            .then(function(i){
              var id = 'geo';
              var metadataBounds = document.querySelector('#' + id + ' figcaption a');
              if (metadataBounds) {
                var message = 'Opened geo data at <a href="' + metadataBounds.href + '">' + metadataBounds.textContent + '</a>';
                message = {
                  'content': message,
                  'type': 'info',
                  'timer': 3000,
                }
                addMessageToLog(message, Config.MessageLog);
                showActionMessage(document.documentElement, message);

                var w = document.getElementById(id);
                window.history.replaceState(null, null, '#' + id);
                w.scrollIntoView();
              }

              return i;
            })
            break;

          default:
            data = escapeCharacters(data)
            // console.log(data)
            var iframe = document.createElement('iframe');
            // <pre type=&quot;' + contentType + '&quot; -- nice but `type` is undefined attribute for `pre`.at the moment. Create issue in WHATWG for fun/profit?
            iframe.srcdoc = '<pre>' + data + '</pre>';
            iframe.width = '1280'; iframe.height = '720';
            var dl = fragmentFromString('<dl><dt><a href="' + iri + '" target="_blank">' + iri + '</a></dt><dd></dd></dl>');
            dl.querySelector('dd').appendChild(iframe);
            tmpl.documentElement.appendChild(dl);
            break;
        }

// console.log(tmpl);

        var documentHasDokieli = tmpl.querySelectorAll('head script[src$="/dokieli.js"]');
// console.log(documentHasDokieli);
// console.log(documentHasDokieli.length)
        if (documentHasDokieli.length == 0) {
          if (!DO.C.WebExtension) {
            tmpl.querySelectorAll('head link[rel~="stylesheet"]').forEach(e => {
              e.setAttribute('disabled', 'disabled');
              e.classList.add('do');
            })
          }

          var doFiles = [];
          if (options.defaultStylesheet) {
            doFiles.push('basic.css');
          }
          doFiles = doFiles.concat(['dokieli.css', 'dokieli.js']);

          doFiles.forEach(function(i){
// console.log(i);
            var media = i.endsWith('.css') ? tmpl.querySelectorAll('head link[rel~="stylesheet"][href$="/' + i + '"]') : tmpl.querySelectorAll('head script[src$="/' + i + '"]');
// console.log(media);
// console.log(media.length)
            if (media.length == 0) {
              switch(i) {
                case 'dokieli.css': case 'basic.css':
                  tmpl.querySelector('head').insertAdjacentHTML('beforeend', '<link href="https://dokie.li/media/css/' + i + '" media="all" rel="stylesheet" />');
                  break;
                case 'dokieli.js':
                  tmpl.querySelector('head').insertAdjacentHTML('beforeend', '<script src="https://dokie.li/scripts/' + i + '"></script>')
                  break;
              }
            }
// console.log(tmpl)
          });

          if (options.init === true) {
            tmpl.querySelector('head').insertAdjacentHTML('afterbegin', '<base href="' + iri + '" />');
            //TODO: Setting the base URL with `base` seems to work correctly, i.e., link base is opened document's URL, and simpler than updating some of the elements' href/src/data attributes. Which approach may be better depends on actions afterwards, e.g., Save As (perhaps other features as well) may need to remove the base and go with the user selection.
            // var nodes = tmpl.querySelectorAll('head link, [src], object[data]');
            // nodes = DO.U.rewriteBaseURL(nodes, {'baseURLType': 'base-url-absolute', 'iri': iri});
            documentNode.documentElement.removeAttribute('id');
            documentNode.documentElement.removeAttribute('class');
          }
          else {
            var baseElements = tmpl.querySelectorAll('head base');
            baseElements.forEach(function(baseElement) {
              baseElement.remove();
            });
          }
        }
        else if (contentType == 'application/gpx+xml') {
          options['init'] = false;

          //XXX: Should this be taken care by updating the document.documentElement and then running DO.C.init(iri) ? If I'm asking, then probably yes.
          var asideOpenDocument = document.getElementById('open-document');
          if (asideOpenDocument) {
            asideOpenDocument.parentNode.removeChild(asideOpenDocument);
          }
          document.querySelector('#document-do .resource-open').disabled = false;
          DO.U.hideDocumentMenu();
        }
        else if (!iri.startsWith('file:') && options.init) {
          window.open(iri, '_blank');
          return;
        }

        if (options.init === true) {
          documentNode.documentElement.innerHTML = tmpl.documentElement.innerHTML;
          documentNode.documentElement.querySelectorAll('head link[rel~="stylesheet"][disabled][class~="do"]').forEach(e => {
            e.removeAttribute('disabled');
            e.classList.remove('do');
            if (e.classList.length == 0) { e.removeAttribute('class'); }
          });

// console.log(document.location.protocol);
          if (!iri.startsWith('file:')){
            var iriHost = iri.split('//')[1].split('/')[0];
            var iriProtocol = iri.split('//')[0];
// console.log(iriHost);
// console.log(iriProtocol);
            if (documentNode.location.protocol == iriProtocol && documentNode.location.host == iriHost) {
              try {
                history.pushState(null, null, iri);
              }
              catch(e) { console.log('Cannot change pushState due to cross-origin.'); }
            }
          }

          DO.C.init(iri);
        }

        return tmpl.documentElement.cloneNode(true);
//       }
//       else {
// console.log('//TODO: Handle server returning wrong or unknown Response/Content-Type for the Request/Accept');
//       }
    },


    createNewDocument: function createNewDocument (e) {
      e.target.disabled = true
      document.documentElement.appendChild(fragmentFromString('<aside id="create-new-document" class="do on">' + DO.C.Button.Close + '<h2>Create New Document</h2></aside>'))

      var newDocument = document.getElementById('create-new-document')
      newDocument.addEventListener('click', e => {
        if (e.target.closest('button.close')) {
          document.querySelector('#document-do .resource-new').disabled = false
        }
      })

      var id = 'location-new'
      var action = 'write'

      DO.U.setupResourceBrowser(newDocument, id, action)
      document.getElementById(id).insertAdjacentHTML('afterbegin', '<p>Choose a location to save your new article.</p>')
      var baseURLSelection = (document.location.protocol == 'file:') ? '' : DO.U.getBaseURLSelection()

      newDocument.insertAdjacentHTML('beforeend', baseURLSelection +
        '<p>Your new document will be saved at <samp id="' + id + '-' + action +
        '">https://example.org/path/to/article</samp></p><button class="create" title="Create new document">Create</button>')

      var bli = document.getElementById(id + '-input')
      bli.focus()
      bli.placeholder = 'https://example.org/path/to/article'

      newDocument.addEventListener('click', e => {
        if (!e.target.closest('button.create')) {
          return
        }

        var newDocument = document.getElementById('create-new-document')
        var storageIRI = newDocument.querySelector('#' + id + '-' + action).innerText.trim()
        var title = (storageIRI.length > 0) ? getURLLastPath(storageIRI) : ''
        title = DO.U.generateLabelFromString(title);

        var rm = newDocument.querySelector('.response-message')
        if (rm) {
          rm.parentNode.removeChild(rm)
        }

        var html = document.documentElement.cloneNode(true)
        var baseURLSelectionChecked = newDocument.querySelector('select[name="base-url"]')
        // console.log(baseURLSelectionChecked);

        if (baseURLSelectionChecked.length > 0) {
          var baseURLType = baseURLSelectionChecked.value
          var nodes = html.querySelectorAll('head link, [src], object[data]')
          if (baseURLType == 'base-url-relative') {
            DO.U.copyRelativeResources(storageIRI, nodes)
          }
          nodes = DO.U.rewriteBaseURL(nodes, {'baseURLType': baseURLType})
        }

        html.querySelector('body').innerHTML = '<main><article about="" typeof="schema:Article"><h1 property="schema:name">' + title + '</h1></article></main>'
        html.querySelector('head title').innerHTML = title
        html = getDocument(html)

        putResource(storageIRI, html)
          .then(() => {
            var documentMode = (DO.C.WebExtension) ? '' : '?author=true'

            newDocument.insertAdjacentHTML('beforeend',
              '<div class="response-message"><p class="success">' +
              'New document created at <a href="' + storageIRI +
              documentMode + '">' + storageIRI + '</a></p></div>'
            )

            window.open(storageIRI + documentMode, '_blank')
          })

          .catch(error => {
            console.log('Error creating a new document:')
            console.error(error)

            let message

            switch (error.status) {
              case 0:
              case 405:
                message = 'this location is not writable.'
                break
              case 401:
                message = 'you are not authorized.'
                if(!DO.C.User.IRI){
                  message += ' Try signing in.';
                }
                break
              case 403:
                message = 'you do not have permission to write here.'
                break
              case 406:
                message = 'enter a name for your resource.'
                break
              default:
                message = error.message
                break
            }

            newDocument.insertAdjacentHTML('beforeend',
              '<div class="response-message"><p class="error">' +
              'Could not create new document: ' + message + '</p>'
            )
          })
      })
    },

    saveAsDocument: function saveAsDocument (e) {
      e.target.disabled = true;
      document.documentElement.appendChild(fragmentFromString('<aside id="save-as-document" class="do on">' + DO.C.Button.Close + '<h2>Save As Document</h2></aside>'));

      var saveAsDocument = document.getElementById('save-as-document');
      saveAsDocument.addEventListener('click', function(e) {
        if (e.target.closest('button.close')) {
          document.querySelector('#document-do .resource-save-as').disabled = false;
        }
      });

      var fieldset = '';

      var locationInboxId = 'location-inbox';
      var locationInboxAction = 'read';
      saveAsDocument.insertAdjacentHTML('beforeend', '<div><input id="' + locationInboxId + '-set" name="' + locationInboxId + '-set" type="checkbox" /> <label for="' + locationInboxId + '-set">Set Inbox</label></div>');

      saveAsDocument.addEventListener('click', function(e) {
        if (e.target.closest('input#' + locationInboxId + '-set')) {
          if (e.target.getAttribute('checked')) {
            e.target.removeAttribute('checked');

            fieldset = saveAsDocument.querySelector('#' + locationInboxId + '-fieldset');
            fieldset.parentNode.removeChild(fieldset);
          }
          else {
            e.target.setAttribute('checked', 'checked');

            e.target.nextElementSibling.insertAdjacentHTML('afterend', '<fieldset id="' + locationInboxId + '-fieldset"></fieldset>');
            fieldset = saveAsDocument.querySelector('#' + locationInboxId + '-fieldset');
            DO.U.setupResourceBrowser(fieldset, locationInboxId, locationInboxAction);
            fieldset.insertAdjacentHTML('beforeend', '<p>Article\'s <em>inbox</em> will be set to: <samp id="' + locationInboxId + '-' + locationInboxAction + '"></samp></p>');
            var lii = document.getElementById(locationInboxId + '-input');
            lii.focus();
            lii.placeholder = 'https://example.org/path/to/inbox/';
          }
        }
      });

      var locationAnnotationServiceId = 'location-annotation-service';
      var locationAnnotationServiceAction = 'read';
      saveAsDocument.insertAdjacentHTML('beforeend', '<div><input id="' + locationAnnotationServiceId + '-set" name="' + locationAnnotationServiceId + '-set" type="checkbox" /> <label for="' + locationAnnotationServiceId + '-set">Set Annotation Service</label></div>');

      saveAsDocument.addEventListener('click', function(e) {
        if (e.target.closest('input#' + locationAnnotationServiceId + '-set')) {
          if (e.target.getAttribute('checked')) {
            e.target.removeAttribute('checked');

            fieldset = saveAsDocument.querySelector('#' + locationAnnotationServiceId + '-fieldset');
            fieldset.parentNode.removeChild(fieldset);
          }
          else {
            e.target.setAttribute('checked', 'checked');

            e.target.nextElementSibling.insertAdjacentHTML('afterend', '<fieldset id="' + locationAnnotationServiceId + '-fieldset"></fieldset>');
            fieldset = saveAsDocument.querySelector('#' + locationAnnotationServiceId + '-fieldset');
            DO.U.setupResourceBrowser(fieldset, locationAnnotationServiceId, locationAnnotationServiceAction);
            fieldset.insertAdjacentHTML('beforeend', '<p>Article\'s <em>annotation service</em> will be set to: <samp id="' + locationAnnotationServiceId + '-' + locationAnnotationServiceAction + '"></samp></p>');
            var lasi = document.getElementById(locationAnnotationServiceId + '-input');
            lasi.focus();
            lasi.placeholder = 'https://example.org/path/to/annotation/';
          }
        }
      });


      //https://www.w3.org/TR/ATAG20/#gl_b31
      //TODO: Better tracking of fails so that author can correct.
      var img = document.querySelectorAll('img');
      var imgFailed = [];
      var imgPassed = [];
      var imgCantTell = [];
      var imgTestResult;
      if (img.length == 0) {
        imgTestResult = 'earl:inapplicable';
      }
      else {
        img.forEach(function(i){
          if (i.hasAttribute('alt')) {
            if(i.alt.trim() === '') {
              imgCantTell.push(i);
            }
            imgPassed.push(i);
          }
          else {
            imgFailed.push(i);
          }
        });
      }
      var imgAccessibilityReport = '';
      if (imgFailed.length > 0 || imgCantTell.length > 0) {
        imgAccessibilityReport += (imgFailed.length > 0) ? '<li>Fail: Images (<code>img</code>) without alternative text (<code>alt</code>).</li>' : '';
        imgAccessibilityReport += (imgCantTell.length > 0) ? '<li>Can\'t Tell: Images (<code>img</code>) without a non-empty alternative text (<code>alt</code>).</li>' : '';
      }

      var video = document.querySelectorAll('video');
      var videoFailed = [];
      var videoPassed = [];
      var videoCantTell = [];
      var videoTestResult = 'earl:untested';
      if (video.length == 0) {
        videoTestResult = 'earl:inapplicable';
      }
      else {
        video.forEach(function(i){
          if (i.querySelector('track') && i.hasAttribute('kind')) {
            videoPassed.push(i);
          }
          else {
            videoFailed.push(i);
          }
        });
      }
      var videoAccessibilityReport = '';
      if (videoFailed.length > 0) {
        videoAccessibilityReport += '<li>Fail: Videos (<code>video</code>) without external timed text tracks (<code>track</code> or <code>track</code> with <code>kind</code> of text track.)</li>';
      }


      var audio = document.querySelectorAll('audio');
      var audioFailed = [];
      var audioPassed = [];
      var audioCantTell = [];
      var audioTestResult = 'earl:untested';
      if (audio.length == 0) {
        audioTestResult = 'earl:inapplicable';
      }
      else {
        audio.forEach(function(i){
          if (i.querySelector('track') && i.hasAttribute('kind')) {
            audioPassed.push(i);
          }
          else {
            audioFailed.push(i);
          }
        });
      }
      var audioAccessibilityReport = '';
      if (audioFailed.length > 0) {
        audioAccessibilityReport += '<li>Fail: Audios (<code>audio</code>) without external timed text tracks (<code>track</code> or <code>track</code> with <code>kind</code> of text track.)</li>';
      }

      var aRWarning = '<p>This document contains some content, e.g., images, videos, audio, that is not accompanied with alternative text or an alternative text field without information. End users with disabilities will likely experience difficulty accessing the content. Please consider adding alternative text before continuing:</p>';
      var aRSuccess = '<p>All content in this document includes alternative text. End users with disabilities will likely have a good experience with this document.</p>';
      var accessibilityReport = '';
      if (imgAccessibilityReport.length > 0 || audioAccessibilityReport.length > 0 || videoAccessibilityReport.length > 0) {
        accessibilityReport += aRWarning + '<ul>' + imgAccessibilityReport + audioAccessibilityReport + videoAccessibilityReport + '</ul>';
      }
      else {
        accessibilityReport += aRSuccess;
      }
      accessibilityReport = '<details id="accessibility-report-save-as"><summary>Accessibility Report</summary>' + accessibilityReport + '</details>';


      var dokielizeResource = '<li><input type="checkbox" id="dokielize-resource" name="dokielize-resource" /><label for="dokielize-resource">dokielize</label></li>';
      var derivationData = '<li><input type="checkbox" id="derivation-data" name="derivation-data" checked="checked" /><label for="derivation-data">Derivation data</label></li>'

      var id = 'location-save-as';
      var action = 'write';
      saveAsDocument.insertAdjacentHTML('beforeend', '<fieldset id="' + id + '-fieldset"><legend>Save to</legend></fieldset>');
      fieldset = saveAsDocument.querySelector('fieldset#' + id + '-fieldset');
      DO.U.setupResourceBrowser(fieldset, id, action);
      fieldset.insertAdjacentHTML('beforeend', '<p id="' + id + '-samp' + '">Article will be saved at: <samp id="' + id + '-' + action + '"></samp></p>' + DO.U.getBaseURLSelection() + '<ul>' + dokielizeResource + derivationData + '</ul>' + accessibilityReport + '<button class="create" title="Save to destination">Save</button>');
      var bli = document.getElementById(id + '-input');
      bli.focus();
      bli.placeholder = 'https://example.org/path/to/article';


      saveAsDocument.addEventListener('click', e => {
        if (!e.target.closest('button.create')) {
          return
        }

        var saveAsDocument = document.getElementById('save-as-document')
        var storageIRI = saveAsDocument.querySelector('#' + id + '-' + action).innerText.trim()

        var rm = saveAsDocument.querySelector('.response-message')
        if (rm) {
          rm.parentNode.removeChild(rm)
        }

        if(!storageIRI.length) {
          saveAsDocument.insertAdjacentHTML('beforeend',
            '<div class="response-message"><p class="error">' +
            'Specify the location to save the article to, and optionally set its <em>inbox</em> or <em>annotation service</em>.</p></div>'
          )

          return
        }

        var html = document.documentElement.cloneNode(true)
        var o, r

        var dokielize = document.querySelector('#dokielize-resource')
        if (dokielize.checked) {
          html = getDocument(html)
// console.log(html)
          html = DO.U.spawnDokieli(document, html, 'text/html', storageIRI, {'init': false})
// console.log(html)
        }

        var wasDerived = document.querySelector('#derivation-data')
        if (wasDerived.checked) {
          o = { 'id': 'document-derived-from', 'title': 'Derived From' };
          r = { 'rel': 'prov:wasDerivedFrom', 'href': DO.C.DocumentURL };
          html = setDocumentRelation(html, [r], o);

          html = setDate(html, { 'id': 'document-derived-on', 'property': 'prov:generatedAtTime', 'title': 'Derived On' });

          o = { 'id': 'document-identifier', 'title': 'Identifier' };
          r = { 'rel': 'owl:sameAs', 'href': storageIRI };
          html = setDocumentRelation(html, [r], o);
        }

        var inboxLocation = saveAsDocument.querySelector('#' + locationInboxId + '-' + locationInboxAction);
        if (inboxLocation) {
          inboxLocation = inboxLocation.innerText.trim();
          o = { 'id': 'document-inbox', 'title': 'Notifications Inbox' };
          r = { 'rel': 'ldp:inbox', 'href': inboxLocation };
          html = setDocumentRelation(html, [r], o);
        }

        var annotationServiceLocation = saveAsDocument.querySelector('#' + locationAnnotationServiceId + '-' + locationAnnotationServiceAction)
        if (annotationServiceLocation) {
          annotationServiceLocation = annotationServiceLocation.innerText.trim();
          o = { 'id': 'document-annotation-service', 'title': 'Annotation Service' };
          r = { 'rel': 'oa:annotationService', 'href': annotationServiceLocation };
          html = setDocumentRelation(html, [r], o);
        }

        var baseURLSelectionChecked = saveAsDocument.querySelector('select[name="base-url"]')
        if (baseURLSelectionChecked.length > 0) {
          var baseURLType = baseURLSelectionChecked.value
          var nodes = html.querySelectorAll('head link, [src], object[data]')
          var base = html.querySelector('head base[href]');
          if (baseURLType == 'base-url-relative') {
            DO.U.copyRelativeResources(storageIRI, nodes)
          }
          var baseOptions = {'baseURLType': baseURLType};
          if (base) {
            baseOptions['iri'] = base.href;
          }
          nodes = DO.U.rewriteBaseURL(nodes, baseOptions)
        }

        html = getDocument(html)

        var progress = saveAsDocument.querySelector('progress')
        if(progress) {
          progress.parentNode.removeChild(progress)
        }
        e.target.insertAdjacentHTML('afterend', '<progress min="0" max="100" value="0"></progress>')
        progress = saveAsDocument.querySelector('progress')

        putResource(storageIRI, html, null, null, { 'progress': progress })
          .then(response => {
            progress.parentNode.removeChild(progress)

            let url = response.url || storageIRI

            var documentMode = (DO.C.WebExtension) ? '' : '?author=true'

            saveAsDocument.insertAdjacentHTML('beforeend',
              '<div class="response-message"><p class="success">' +
              'Document saved at <a href="' + url + documentMode + '">' + url + '</a></p></div>'
            )

            window.open(url + documentMode, '_blank')
          })

          .catch(error => {
            console.log('Error saving document. Status: ' + error.status)

            progress.parentNode.removeChild(progress)

            let message

            var requestAccess = '';
            var linkHeaders;
            var inboxURL;
            var link = error.response.headers.get('Link');
            if (link) {
              linkHeaders = LinkHeader.parse(link);
            }

            if (DO.C.User.IRI && linkHeaders && linkHeaders.has('rel', DO.C.Vocab['ldpinbox']['@id'])){
              inboxURL = linkHeaders.rel(DO.C.Vocab['ldpinbox']['@id'])[0].uri;
              requestAccess = '<p><button class="request-access" data-inbox="' + inboxURL +'" data-target="' + storageIRI + '" title="Send an access request to resource inbox.">Request Access</button></p>'
            }

            switch (error.status) {
              case 0:
              case 405:
                message = 'this location is not writable.'
                break
              case 401:
                message = 'you are not authorized.'
                if(!DO.C.User.IRI){
                  message += ' Try signing in.';
                }
                break
              case 403:
                message = 'you do not have permission to write here.'
                break
              case 406:
                message = 'enter a name for your resource.'
                break
              default:
                message = error.message
                break
            }

            saveAsDocument.insertAdjacentHTML('beforeend',
              '<div class="response-message"><p class="error">' +
              'Unable to save: ' + message + '</p>' + requestAccess + '</div>'
            )

            if (DO.C.User.IRI && requestAccess) {
              document.querySelector('#save-as-document .response-message .request-access').addEventListener('click', function(e) {
                var objectId = '#' + generateUUID();

                inboxURL = e.target.dataset.inbox;
                var accessTo = e.target.dataset.target;
                var agent = DO.C.User.IRI;

                e.target.disabled = true;
                var responseMessage = e.target.parentNode;
                responseMessage.insertAdjacentHTML('beforeend',
                  '<span class="progress" data-to="' + inboxURL +
                  '">' + Icon[".fas.fa-circle-notch.fa-spin.fa-fw"] + '</span>')

                var notificationStatements = `<dl about="` + objectId + `" prefix="acl: http://www.w3.org/ns/auth/acl#">
  <dt>Object type</dt><dd><a about="` + objectId + `" href="` + DO.C.Vocab['aclAuthorization']['@id'] + `" typeof="acl:Authorization">Authorization</a></dd>
  <dt>Agents</dt><dd><a href="` + agent + `" property="acl:agent">` + agent + `</a></dd>
  <dt>Access to</dt><dd><a href="` + accessTo + `" property="acl:accessTo">` + accessTo + `</a></dd>
  <dt>Modes</dt><dd><a href="` + DO.C.Vocab['aclRead']['@id'] + `" property="acl:mode">Read</a></dd><dd><a href="` + DO.C.Vocab['aclWrite']['@id'] + `" property="acl:mode">Write</a></dd>
</dl>
`;

                var notificationData = {
                  "type": ['as:Request'],
                  "inbox": inboxURL,
                  "object": objectId,
                  "statements": notificationStatements
                };

                responseMessage = document.querySelector('#save-as-document .response-message');

                return notifyInbox(notificationData)
                  .catch(error => {
                    console.log('Error notifying the inbox:', error)

                    responseMessage
                      .querySelector('.progress[data-to="' + inboxURL + '"]')
                      .innerHTML = Icon[".fas.fa-times-circle.fa-fw"] + ' Unable to notify. Try later.'
                  })
                  .then(response => {
                    var notificationSent = 'Notification sent';
                    var location = response.headers.get('Location');

                    if (location) {
                      notificationSent = '<a target="_blank" href="' + location.trim() + '">' + Icon[".fas.fa-check-circle.fa-fw"] + '</a>'
                    }
                    else {
                      notificationSent = notificationSent + ", but location unknown."
                    }

                    responseMessage
                      .querySelector('.progress[data-to="' + inboxURL + '"]')
                      .innerHTML = notificationSent
                  })

              })
            }
          })
      })
    },

    viewSource: function(e) {
      e.target.disabled = true;

      var buttonDisabled = (document.location.protocol === 'file:') ? ' disabled="disabled"' : '';

      document.documentElement.appendChild(fragmentFromString('<aside id="source-view" class="do on">' + DO.C.Button.Close + '<h2>Source</h2><textarea id="source-edit" rows="24" cols="80"></textarea><p><button class="create"'+ buttonDisabled + ' title="Update source">Update</button></p></aside>'));
      var sourceBox = document.getElementById('source-view');
      var input = document.getElementById('source-edit');
      input.value = getDocument();

      sourceBox.addEventListener('click', function(e) {
        if (e.target.closest('button.create')) {
          var url = window.location.origin + window.location.pathname;
          var data = document.getElementById('source-edit').value;
          document.documentElement.innerHTML = data;
          DO.U.showDocumentInfo();
          DO.U.showDocumentMenu(e);
          DO.U.viewSource();
          document.querySelector('#document-do .resource-source').disabled = true;
        }

        if (e.target.closest('button.close')) {
          document.querySelector('#document-do .resource-source').disabled = false;
        }
      });
    },

    getFeedFormatSelection: function() {
      return '<div id="feed-format-selection"><label>Format:</label>\n\
      <select name="feed-format">\n\
      <option id="feed-format-atom" value="application/atom+xml">Atom</option>\n\
      <option id="feed-format-rss" value="application/rss+xml" selected="selected">RSS</option>\n\
      </select>\n\
      </div>';
    },

    getBaseURLSelection: function() {
      return '<div id="base-url-selection"><label>Location of media resources:</label>\n\
      <select name="base-url">\n\
      <option id="base-url-absolute" value="base-url-absolute" selected="selected">Use references as is</option>\n\
      <option id="base-url-relative" value="base-url-relative">Copy to your storage</option>\n\
      </select>\n\
      </div>';
    },

    rewriteBaseURL: function(nodes, options) {
      options = options || {};
      if (typeof nodes === 'object' && nodes.length > 0) {
        for (var i = 0; i < nodes.length; i++) {
          var node = nodes[i];
          var url, ref;
          switch(node.tagName.toLowerCase()) {
            default:
              url = node.getAttribute('src');
              ref = 'src';
              break;
            case 'link':
              url = node.getAttribute('href');
              ref = 'href';
              break;
            case 'object':
              url = node.getAttribute('data');
              ref = 'data';
              break;
          }

          var s = url.split(':')[0];
          if (s != 'http' && s != 'https' && s != 'file' && s != 'data' && s != 'urn' && document.location.protocol != 'file:') {
            url = DO.U.setBaseURL(url, options);
          }
          else if (url.startsWith('http:') && node.tagName.toLowerCase()) {
            url = getProxyableIRI(url)
          }
          node.setAttribute(ref, url);
        }
      }

      return nodes;
    },

    setBaseURL: function(url, options) {
      options = options || {};
      var urlType = ('baseURLType' in options) ? options.baseURLType : 'base-url-absolute';
// console.log(url)
// console.log(options)
// console.log(urlType)
      var matches = [];
      var regexp = /(https?:\/\/([^\/]*)\/|file:\/\/\/|data:|urn:|\/\/)?(.*)/;

      matches = url.match(regexp);

      if (matches) {
        switch(urlType) {
          case 'base-url-absolute': default:
            if(matches[1] == '//' && 'iri' in options){
              url = options.iri.split(':')[0] + ':' + url;
            }
            else {
              let href = ('iri' in options) ? getProxyableIRI(options.iri) : document.location.href;
              url = getBaseURL(href);
// console.log(url)
              //TODO: Move/Refactor in uri.js
              //TODO: "./"
              if (matches[3].startsWith('../')) {
                var parts = matches[3].split('../');
                for (var i = 0; i < parts.length - 1; i++) {
                  url = getParentURLPath(url) || url;
                }
                url += parts[parts.length - 1];
              }
              else {
                url += matches[3].replace(/^\//g, '');
              }
// console.log(href)
// console.log(url)
            }
            break;
          case 'base-url-relative':
            url = matches[3].replace(/^\//g, '');
// console.log(url)
            break;
        }
      }

      return url;
    },

    generateLabelFromString: function(s) {
      if (typeof s === 'string' && s.length > 0) {
        s = s.replace(/-/g, ' ');
        s = (s !== '.html' && s.endsWith('.html')) ? s.substr(0, s.lastIndexOf('.html')) : s;
        s = (s !== '.' && s.endsWith('.')) ? s.substr(0, s.lastIndexOf('.')) : s;

        s = s.charAt(0).toUpperCase() + s.slice(1);
      }

      return s;
    },

    copyRelativeResources: function copyRelativeResources (storageIRI, relativeNodes) {
      var ref = '';
      var baseURL = getBaseURL(storageIRI);

      for (var i = 0; i < relativeNodes.length; i++) {
        var node = relativeNodes[i];
        switch(node.tagName.toLowerCase()) {
          default:
            ref = 'src';
            break;
          case 'link':
            ref = 'href';
            break;
          case 'object':
            ref = 'data';
            break;
        }

        var fromURL, x = node.getAttribute(ref).trim();
        var pathToFile = '';
        var s = fromURL.split(':')[0];

        if (s != 'http' && s != 'https' && s != 'file' && s != 'data' && s != 'urn' && s != 'urn') {
          if (fromURL.startsWith('//')) {
            fromURL = document.location.protocol + fromURL
            var toURL = baseURL + fromURL.substr(2)
          }
          else if (fromURL.startsWith('/')) {
            pathToFile = DO.U.setBaseURL(fromURL, {'baseURLType': 'base-url-relative'});
            fromURL = document.location.origin + fromURL
            toURL = baseURL + pathToFile
          }
          else {
            pathToFile = DO.U.setBaseURL(fromURL, {'baseURLType': 'base-url-relative'});
            fromURL = getBaseURL(document.location.href) + fromURL
            toURL = baseURL + pathToFile
          }

          copyResource(fromURL, toURL);
        }
      }
    },

    createAttributeDateTime: function(element) {
      //Creates datetime attribute.
      //TODO: Include @data-author for the signed in user e.g., WebID or URL.
      var a = getDateTimeISO();

      switch(element) {
        case 'mark': case 'article':
          a = 'data-datetime="' + a + '"';
          break;
        case 'del': case 'ins':
          a = 'datetime="' + a + '"';
          break;
        default:
          a = '';
          break;
      }

      return a;
    },

    getCitation: function(i, options) {
// console.log(i)
// console.log(options)
      options = options || {};
      options['noCredentials'] = true;
      var url;

      if (isValidISBN(i)) {
        url = 'https://openlibrary.org/isbn/' + i;
        var headers = {'Accept': 'application/json'};
        var wikidataHeaders = {'Accept': 'application/ld+json'};

        var isbnData = SimpleRDF(DO.C.Vocab, url);

        return getResource(url, headers, options)
          .then(function(response) {
// console.log(response)
            return response.text();
          }).then(data => {
            //TODO: try/catch?
            data = JSON.parse(data);
// console.log(data)
            //data.identifiers.librarything data.identifiers.goodreads

            var promises = [];

            if (data.title) {
// console.log(data.title)
              isbnData.schemaname = data.title;
            }

          //Unused
//           if (data.subtitle) {
// console.log(data.subtitle)
//           }

            if (data.publish_date) {
// console.log(data.publish_date)
              isbnData.schemadatePublished = getDateTimeISOFromMDY(data.publish_date)
            }

            if (data.covers) {
// console.log(data.covers)
              isbnData.schemaimage = 'https://covers.openlibrary.org/b/id/' + data.covers[0] + '-S.jpg';
              // document.body.insertAdjacentHTML('afterbegin', '<img src="' + img + '"/>');

              //   async function fetchImage(url) {
              //     const img = new Image();
              //     return new Promise((res, rej) => {
              //         img.onload = () => res(img);
              //         img.onerror = e => rej(e);
              //         img.src = url;
              //     });
              // }
              // const img = await fetchImage('https://covers.openlibrary.org/b/id/12547191-L.jpg');
              // const w = img.width;
              // const h = img.height;
            }

            if (data.authors && Array.isArray(data.authors) && data.authors.length > 0 && data.authors[0].key) {
              var a = 'https://openlibrary.org' + data.authors[0].key;
// console.log(a)
              promises.push(getResource(a, headers, options)
                .then(function(response){
// console.log(response)
                  return response.text();
                }).then(data => {
                  //TODO: try/catch?
                  data = JSON.parse(data);
// console.log(data)

                  var authorURL = 'http://example.com/.well-known/genid/' + generateUUID();
                  if (data.links && Array.isArray(data.links) && data.links.length > 0) {
// console.log(data.links[0].url)
                    authorURL = data.links[0].url;
                  }
                  isbnData.schemaauthor = [authorURL];

                  if (data.name) {
// console.log(data.name)
                    isbnData.child(authorURL).schemaname = data.name;
                  }
// console.log(isbnData)

                  return isbnData.child(url);

                //Unused:
//                 if (data.remote_ids && data.remote_ids.wikidata) {
//                   //wE has a few redirects to wW
//                   var wE = 'https://www.wikidata.org/entity/' + data.remote_ids.wikidata;
//                   var wW = 'https://www.wikidata.org/wiki/Special:EntityData/' + data.remote_ids.wikidata + '.jsonld';
//                   promises.push(getResourceGraph(wW, wikidataHeaders, options)
//                     .then(function(g){
// // console.log(g)
// // console.log(g.iri().toString())
//                       var s = g.graph().match(wE.replace(/^https:/, 'http:'))
// // console.log(s.toString());

//                       console.log(isbnData)
//                       console.log(isbnData.toString())

//                       return isbnData;
//                     }));
//                 }

                }));
            }

            // XXX Unused for now:
            // if (data.identifiers?.wikidata && Array.isArray(data.identifiers.wikidata) && data.identifiers.wikidata.length > 0) {
              // var w = 'https://www.wikidata.org/entity/' + data.identifiers.wikidata[0];
              // promises.push(getResourceGraph(w, wikidataHeaders, options).then(function(g){
// console.log(g);
// console.log(g.toString());
              // }));
            // }

            return Promise.allSettled(promises)
              .then(function(results) {
                var items = [];
                results.forEach(function(result){
// console.log(result)
                  items.push(result.value);
                })

                //For now just [0]
                return items[0];
              });

          })
      }
      else {
        if (i.match(/^10\.\d+\//)) {
          url= 'https://doi.org/' + i;
        }
        else {
          url = i.replace(/https?:\/\/dx\.doi\.org\//i, 'https://doi.org/');
        }

        return getResourceGraph(url, null, options);
      }
    },

    getCitationHTML: function(citationGraph, citationURI, options) {
      if (!citationGraph) { return; }
      options = options || {};
      // var citationId = ('citationId' in options) ? options.citationId : citationURI;
      var subject = citationGraph.child(citationURI);
// console.log(citationGraph);
// console.log('citationGraph.iri().toString(): ' + citationGraph.iri().toString());
// console.log('citationGraph.toString(): ' + citationGraph.toString());
// console.log('options.citationId: ' + options.citationId);
// console.log('citationURI: ' + citationURI);
// console.log('subject.iri().toString(): ' + subject.iri().toString());

      var title = getGraphLabel(subject);
      //FIXME: This is a stupid hack because RDFa parser is not setting the base properly.
      if(typeof title == 'undefined') {
        subject = citationGraph.child(options.citationId);

        title = getGraphLabel(subject) || '';
      }
      title = escapeCharacters(title);
      title = (title.length > 0) ? '<cite>' + title + '</cite>, ' : '';
      var datePublished = subject.schemadatePublished || subject.dctermsissued || subject.dctermsdate || subject.schemadateCreated || subject.dctermscreated || '';
      var dateVersion = subject.schemadateModified || datePublished;
      datePublished = (datePublished) ? datePublished.substr(0,4) + ', ' : '';
      var dateAccessed = 'Accessed: ' + getDateTimeISO();
      var authors = [], authorList = [];
// console.log(subject);
// console.log(subject.biboauthorList);
// console.log(subject.schemaauthor);
// console.log(subject.dctermscreator);

      //XXX: FIXME: Putting this off for now because SimpleRDF is not finding the bnode for some reason in citationGraph.child(item), or at least authorItem.rdffirst (undefined)
//       if (subject.biboauthorList) {
//TODO: Just use/test something like: authorList = authorList.concat(traverseRDFList(citationGraph, subject.biboauthorList));
//       }
//       else
      if (subject.schemaauthor && subject.schemaauthor._array.length > 0) {
        subject.schemaauthor.forEach(function(a) {
          authorList.push(a);
        });
      }
      else if (subject.dctermscreator && subject.dctermscreator._array.length > 0) {
        subject.dctermscreator.forEach(function(a) {
          authorList.push(a);
        });
      }
      else if (subject.asactor && subject.asactor._array.length > 0) {
        subject.asactor.forEach(function(a) {
          authorList.push(a);
        });
      }
// console.log(authorList);

      if(authorList.length > 0) {
        authorList.forEach(function(authorIRI) {
          var s = subject.child(authorIRI);
          var author = getAgentName(s);

          if (s.schemafamilyName && s.schemafamilyName.length > 0 && s.schemagivenName && s.schemagivenName.length > 0) {
            author = DO.U.createRefName(s.schemafamilyName, s.schemagivenName);
          }
          else if (s.foaffamilyName && s.foaffamilyName.length > 0 && s.foafgivenName && s.foafgivenName.length > 0) {
            author = DO.U.createRefName(s.foaffamilyName, s.foafgivenName);
          }

          if (author) {
            authors.push(author);
          }
          else {
            authors.push(authorIRI);
          }
        });
        authors = authors.join(', ') + ': ';
      }

      var dataVersionURL;
      if (subject.memmemento) {
        dataVersionURL = subject.memmemento;
      }
      else if (subject.rellatestversion) {
        dataVersionURL = subject.rellatestversion;
      }
      dataVersionURL = (dataVersionURL) ? ' data-versionurl="' + dataVersionURL + '"' : '';

      var dataVersionDate = (dateVersion) ? ' data-versiondate="' + dateVersion + '"' : '';

      var content = ('content' in options && options.content.length > 0) ? options.content + ', ' : '';

      var citationReason = 'Reason: ' + DO.C.Citation[options.citationRelation];

      var citationIdLabel = citationURI;
      var prefixCitationLink = '';

      if (isValidISBN(options.citationId)) {
        citationIdLabel = options.citationId;
        prefixCitationLink = ', ISBN: ';
      }
      else if (options.citationId.match(/^10\.\d+\//)) {
        citationURI = 'https://doi.org/' + options.citationId;
        citationIdLabel = citationURI;
      }
      else {
        citationURI = citationURI.replace(/https?:\/\/dx\.doi\.org\//i, 'https://doi.org/');
        citationIdLabel = citationURI;
      }

      var citationHTML = authors + title + datePublished + content + prefixCitationLink + '<a about="#' + options.refId + '"' + dataVersionDate + dataVersionURL + ' href="' + citationURI + '" rel="schema:citation ' + options.citationRelation  + '" title="' + DO.C.Citation[options.citationRelation] + '">' + citationIdLabel + '</a> [' + dateAccessed + ', ' + citationReason + ']';
//console.log(citationHTML);
      return citationHTML;
    },

    createRefName: function(familyName, givenName, refType) {
      refType = refType || DO.C.DocRefType;
      switch(refType) {
        case 'LNCS': default:
          return familyName + ', ' + givenName.slice(0,1) + '.';
        case 'ACM':
          return givenName.slice(0,1) + '. ' + familyName;
        case 'fullName':
          return givenName + ' ' + familyName;
      }
    },

    highlightItems: function() {
      var highlights = getDocumentContentNode(document).querySelectorAll('*[class*="highlight-"]');
      for (var i = 0; i < highlights.length; i++) {
        highlights[i].addEventListener('mouseenter', function(e) {
          var c = e.target.getAttribute('class').split(' ')
                    .filter(function(s) { return s.startsWith('highlight-'); });
          var highlightsX = getDocumentContentNode(document).querySelectorAll('*[class~="'+ c[0] +'"]');
          for (var j = 0; j < highlightsX.length; j++) {
            highlightsX[j].classList.add('do', 'highlight');
          }
        });

        highlights[i].addEventListener('mouseleave', function(e) {
          var c = e.target.getAttribute('class');
          c = e.target.getAttribute('class').split(' ')
                    .filter(function(s) { return s.startsWith('highlight-'); });
          var highlightsX = getDocumentContentNode(document).querySelectorAll('*[class~="'+ c[0] +'"]');
          for (var j = 0; j < highlightsX.length; j++) {
            highlightsX[j].classList.remove('do', 'highlight');
          }
        });
      }
    },

    SPARQLQueryURL: {
      getResourcesOfTypeWithLabel: function(sparqlEndpoint, resourceType, textInput, options) {
        options = options || {};
        var labelsPattern = '', resourcePattern = '';

        if(!('lang' in options)) {
          options['lang'] = 'en';
        }

        if ('filter' in options) {
          if(resourceType == '<http://purl.org/linked-data/cube#DataSet>' || resourceType == 'qb:DataSet'
            && 'dimensionRefAreaNotation' in options.filter) {
              var dimensionPattern, dimensionDefault = '';
              var dataSetPattern = "\n\
    [] qb:dataSet ?resource";
            if ('dimensionProperty' in options.filter) {
              dimensionPattern = " ; " + options.filter.dimensionProperty;
            }
            else {
              dimensionDefault = " .\n\
  { SELECT DISTINCT ?propertyRefArea WHERE { ?propertyRefArea rdfs:subPropertyOf* sdmx-dimension:refArea . } }";
              dimensionPattern = " ; ?propertyRefArea ";

            }
            var notationPattern = " [ skos:notation '" + options.filter.dimensionRefAreaNotation.toUpperCase() + "' ] ."
          }
          resourcePattern = dimensionDefault + dataSetPattern + dimensionPattern + notationPattern;
        }

        labelsPattern = "\n\
  ";
        if ('optional' in options) {
          if('prefLabels' in options.optional) {
            if (options.optional.prefLabels.length == 1) {
              labelsPattern += "  ?resource " + options.optional.prefLabels[0] + " ?prefLabel .";
            }
            else {
              labelsPattern += "  VALUES ?labelProperty {";
              options.optional.prefLabels.forEach(function(property){
                labelsPattern += ' ' + property;
              });
              labelsPattern += " } ?resource ?labelProperty ?prefLabel .";
            }
          }
        }
        else {
          labelsPattern += "  ?resource rdfs:label ?prefLabel .";
        }


//  FILTER (!STRSTARTS(STR(?resource), 'http://purl.org/linked-data/sdmx/'))\n\
      var query = "PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>\n\
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>\n\
PREFIX dcterms: <http://purl.org/dc/terms/>\n\
PREFIX qb: <http://purl.org/linked-data/cube#>\n\
PREFIX sdmx-dimension: <http://purl.org/linked-data/sdmx/2009/dimension#>\n\
PREFIX sdmx-measure: <http://purl.org/linked-data/sdmx/2009/measure#>\n\
CONSTRUCT {\n\
  ?resource skos:prefLabel ?prefLabel .\n\
}\n\
WHERE {\n\
  ?resource a " + resourceType + " ."
+ labelsPattern + "\n\
  FILTER (CONTAINS(LCASE(?prefLabel), '" + textInput + "') && (LANG(?prefLabel) = '' || LANGMATCHES(LANG(?prefLabel), '" + options.lang + "')))"
+ resourcePattern + "\n\
}";
       return sparqlEndpoint + "?query=" + encodeString(query);
      },

      getObservationsWithDimension: function(sparqlEndpoint, dataset, paramDimension, options) {
        var query = "PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>\n\
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>\n\
PREFIX dcterms: <http://purl.org/dc/terms/>\n\
PREFIX qb: <http://purl.org/linked-data/cube#>\n\
PREFIX sdmx-dimension: <http://purl.org/linked-data/sdmx/2009/dimension#>\n\
PREFIX sdmx-measure: <http://purl.org/linked-data/sdmx/2009/measure#>\n\
CONSTRUCT {\n\
  ?observation sdmx-dimension:refPeriod ?refPeriod .\n\
  ?observation sdmx-measure:obsValue ?obsValue .\n\
}\n\
WHERE {\n\
  ?observation qb:dataSet <" + dataset + "> .\n\
  " + paramDimension + "\n\
  ?propertyRefPeriod rdfs:subPropertyOf* sdmx-dimension:refPeriod .\n\
  ?observation ?propertyRefPeriod ?refPeriod .\n\
  ?propertyMeasure rdfs:subPropertyOf* sdmx-measure:obsValue .\n\
  ?observation ?propertyMeasure ?obsValue .\n\
}";

        return sparqlEndpoint + "?query=" + encodeString(query);
      },
    },

    getSparkline: function(data, options) {
      options = options || {};
      if(!('cssStroke' in options)) {
        options['cssStroke'] = '#000';
      }

      var svg = '<svg height="100%" prefix="rdf: http://www.w3.org/1999/02/22-rdf-syntax-ns# rdfs: http://www.w3.org/2000/01/rdf-schema# xsd: http://www.w3.org/2001/XMLSchema# qb: http://purl.org/linked-data/cube# prov: http://www.w3.org/ns/prov# schema: http://schema.org/" width="100%" xmlns="http://www.w3.org/2000/svg">';

      svg += DO.U.drawSparklineGraph(data, options);
      svg += '</svg>';

      return svg;
    },

    drawSparklineGraph: function(data, options) {
      options = options || {};
      if(!('cssStroke' in options)) {
        options['cssStroke'] = '#000';
      }
      var svg= '';

      var obsValue = 'http://purl.org/linked-data/sdmx/2009/measure#obsValue';
      var observation = 'http://purl.org/linked-data/cube#Observation';

      var dotSize = 1;
      var values = data.map(function(n) { return n[obsValue]; }),
        min = Math.min.apply(null, values),
        max = Math.max.apply(null, values);

      var new_max = 98;
      var new_min = 0;
      var range = new_max - new_min;

      var parts = values.map(function (v) {
        return (new_max - new_min) / (max - min) * (v - min) + new_min || 0;
      });

      var div = 100 / parts.length;
      var x1 = 0, y1 = 0, x2 = div / 2, y2 = range - parts[0];

      var lines = '';
      for (var i=0; i < parts.length; i++) {
        x1 = x2; y1 = y2;
        x2 = range * (i / parts.length) + (div / 2);
        y2 = range - parts[i];

        lines += '<a rel="rdfs:seeAlso" resource="' + data[i][observation] + '" target="_blank" href="' + data[i][observation] + '"><line' +
          ' x1="' + x1 + '%"' +
          ' x2="' + x2 + '%"' +
          ' y1="' + y1 + '%"' +
          ' y2="' + y2 + '%"' +
          ' stroke="' + options.cssStroke + '"' +
          ' /></a>';

        //Last data item
        if(i+1 === parts.length) {
          lines += '<a target="_blank" href="' + data[i][observation] + '"><circle' +
            ' cx="' + x2 + '%"' +
            ' cy="' + y2 + '%"' +
            ' r="' + dotSize + '"' +
            ' stroke="#f00"' +
            ' fill:#f00' +
            ' /></a>';
        }
      }

      var wasDerivedFrom = '';
      if(options && 'url' in options) {
        wasDerivedFrom = ' rel="prov:wasDerivedFrom" resource="' + options.url + '"';
      }
      svg += '<g' + wasDerivedFrom + '>';
      svg += '<metadata rel="schema:license" resource="https://creativecommons.org/publicdomain/zero/1.0/"></metadata>';
      if (options && 'title' in options) {
        svg += '<title property="schema:name">' + options['title'] + '</title>';
      }
      svg += lines + '</g>';

      return svg;
    },

    getListHTMLFromTriples: function(triples, options) {
      options = options || {element: 'ul'};
      var elementId = ('elementId' in options) ? ' id="' + options.elementId + '"' : '';
      var elementName = ('elementId' in options) ? ' name="' + options.elementId + '"' : '';
      var elementTitle = ('elementId' in options) ? options.elementId : '';
      var items = '';
      triples.forEach(function(t){
        var s = t.subject.nominalValue;
        var o = t.object.nominalValue;
        switch(options.element) {
          case 'ol': case 'ul': default:
            items += '<li><a href="' + s + '">' + o + '</a></li>';
            break;
          case 'dl':
            items += '<dd><a href="' + s + '">' + o + '</a></dd>';
            break;
          case 'select':
            items += '<option value="' +   s + '">' + o + '</option>';
            break;
        }
      });

      switch(options.element) {
        case 'ul': default:
          return '<ul' + elementId + '>' + items + '</ul>';
        case 'ol':
          return '<ol' + elementId + '>' + items + '</ol>';
        case 'dl':
          return '<dl' + elementId + '><dt>' + elementTitle + '</dt>' + items + '</dl>';
        case 'select':
          return '<select' + elementId + elementName + '>' + items + '</select>';
      }
    },

    showAsTabs: function(selector) {
      selector = selector || '.tabs';
      var nodes = document.querySelectorAll(selector);

      nodes.forEach(function(node){
        var li = node.querySelectorAll('nav li.selected');
        var figure = node.querySelectorAll('figure.selected');

        if (li.length == 0 && figure.length == 0) {
          node.querySelector('nav li').classList.add('selected');
          node.querySelector('figure').classList.add('selected');
        }

        node.querySelector('nav').addEventListener('click', function(e) {
          var a = e.target;
          if (a.closest('a')) {
            e.preventDefault();
            e.stopPropagation();

            var li = a.parentNode;
            if(!li.classList.contains('class')) {
              var navLi = node.querySelectorAll('nav li');
              for (var i = 0; i < navLi.length; i++) {
                navLi[i].classList.remove('selected');
              }
              li.classList.add('selected');
              var figures = node.querySelectorAll('figure');
              for (let i = 0; i < figures.length; i++) {
                figures[i].classList.remove('selected');
              }
              node.querySelector('figure' + a.hash).classList.add('selected');
            }
          }
        });

      })
    },

    getReferenceLabel: function(motivatedBy) {
      motivatedBy = motivatedBy || '';
      //TODO: uriToPrefix
      motivatedBy = (motivatedBy.length > 0 && motivatedBy.slice(0, 4) == 'http' && motivatedBy.indexOf('#') > -1) ? 'oa:' + motivatedBy.substr(motivatedBy.lastIndexOf('#') + 1) : motivatedBy;

      return DO.C.MotivationSign[motivatedBy] || '#';
    },

    showRefs: function() {
      var refs = document.querySelectorAll('span.ref');
      for (var i = 0; i < refs.length; i++) {
// console.log(this);
        var ref = refs[i].querySelector('mark[id]');
// console.log(ref);
        if (ref) {
          var refId = ref.id;
// console.log(refId);
          var refA = refs[i].querySelectorAll('[class*=ref-] a');
// console.log(refA);
          for (var j = 0; j < refA.length; j++) {
            //XXX: Assuming this is always an internal anchor?
            var noteId = refA[j].getAttribute('href').substr(1);
// console.log(noteId);
            var refLabel = refA[j].textContent;
// console.log(refLabel);

// console.log(refId + ' ' +  refLabel + ' ' + noteId);
            DO.U.positionNote(refId, noteId, refLabel);
          }
        }
      }
    },

    getTextQuoteHTML: function(refId, motivatedBy, exact, docRefType, options){
      options = options || {};

      var doMode = (options.do) ? ' do' : '';

      var refOpen = '<span class="ref' + doMode + '" rel="schema:hasPart" resource="#' + refId + '" typeof="http://purl.org/dc/dcmitype/Text">';
      var refClose = '</span>';
      if (motivatedBy == 'oa:highlighting') {
        refOpen = '<span class="ref' + doMode + '" rel="schema:hasPart" resource="#h-' + refId + '" typeof="oa:Annotation"><span rel="oa:motivatedBy" resource="oa:highlighting"></span><span rel="oa:hasTarget" resource="#' + refId + '" typeof="http://purl.org/dc/dcmitype/Text">';
        refClose = '</span></span>';
      }
      var mark = '<mark datatype="rdf:HTML" id="'+ refId +'" property="rdf:value">' + exact + '</mark>';

      return refOpen + mark + docRefType + refClose;
    },

    positionNote: function(refId, noteId, refLabel) {
      var ref =  document.querySelector('[id="' + refId + '"]');
      var note = document.querySelector('[id="' + noteId + '"]');
      ref = (ref) ? ref : selectArticleNode(note);

      if (note.hasAttribute('style')) {
        note.removeAttribute('style');
      }

      //TODO: If there are articles already in the aside.note , the subsequent top values should come after one another
      var style = [
        'top: ' + Math.ceil(ref.parentNode.offsetTop) + 'px'
      ].join('; ');
      note.setAttribute('style', style);
    },

    //XXX: To be deprecated
    positionInteraction: function(noteIRI, containerNode, options) {
      containerNode = containerNode || getDocumentContentNode(document);

      if (DO.C.Activity[noteIRI]) {
        return Promise.reject();
      }

      DO.C.Activity[noteIRI] = {};

      return getResourceGraph(noteIRI).then(
        function(g){
          //XXX: REVISIT
          if (!g || g.resource) return;

          DO.U.showAnnotation(noteIRI, g, containerNode, options);
        });
    },

    showAnnotation: function(noteIRI, g, options) {
      // containerNode = containerNode || getDocumentContentNode(document);
      var containerNode = getDocumentContentNode(document);
      options = options || {};

      var documentURL = DO.C.DocumentURL;

      var note = g.child(noteIRI);
      if (note.asobject && note.asobject.at(0)) {
        note = g.child(note.asobject.at(0))
      }
// console.log(noteIRI)
// console.log(note.toString())
// console.log(note)

      var id = generateUUID(noteIRI);
      var refId = 'r-' + id;
      var refLabel = id;

      var inboxIRI = (note.ldpinbox && note.ldpinbox.at(0)) ? note.ldpinbox.at(0) : undefined;
      var asInboxIRI = (note.asinbox && note.asinbox.at(0)) ? note.asinbox.at(0) : undefined;
      inboxIRI = inboxIRI || asInboxIRI;
      if (inboxIRI) {
        // console.log('inboxIRI:')
        // console.log(inboxIRI)
        // console.log('DO.C.Inbox:')
        // console.log(DO.C.Inbox)
        // console.log('DO.C.Notification:')
        // console.log(DO.C.Notification)
        // console.log('DO.C.Activity:')
        // console.log(DO.C.Activity)
        if (DO.C.Inbox[inboxIRI]) {
          DO.C.Inbox[inboxIRI]['Notifications'].forEach(function(notification) {
// console.log(notification)
            if (DO.C.Notification[notification]) {
              if (DO.C.Notification[notification]['Activities']) {
                DO.C.Notification[notification]['Activities'].forEach(function(activity){
  // console.log('   ' + activity)
                  if (!document.querySelector('[about="' + activity + '"]') && DO.C.Activity[activity] && DO.C.Activity[activity]['Graph']) {
                    DO.U.showAnnotation(activity, DO.C.Activity[activity]['Graph']);
                  }
                })
              }
            }
            else {
              DO.U.showActivities(notification, { notification: true });
            }
          });
        }
        else {
          DO.U.showNotificationSources(inboxIRI);
        }
      }

      // var datetime = note.schemadatePublished || note.dctermscreated || note.aspublished;
      var datetime = getGraphDate(note);

// console.log(datetime);
      var annotatedBy = (note.schemacreator && note.schemacreator.at(0) !== undefined) ? note.schemacreator :
      (note.dctermscreator && note.dctermscreator.at(0) !== undefined) ? note.dctermscreator :
      (note.asactor && note.asactor.at(0) !== undefined) ? note.asactor :
      undefined;
      var annotatedByIRI;
// console.log(annotatedBy);
      if (annotatedBy && annotatedBy.at(0)) {
        annotatedByIRI = annotatedBy.at(0);
// console.log(annotatedByIRI);
        annotatedBy = g.child(annotatedByIRI);
// console.log(annotatedBy);
      }
      var annotatedByName = getAgentName(annotatedBy);
// console.log(annotatedByName);
      var annotatedByImage = getGraphImage(annotatedBy);
// console.log(annotatedByImage);
      var annotatedByURL = annotatedBy.schemaurl || '';
      annotatedByURL = (annotatedByURL) ? annotatedByURL : undefined;

      var motivatedBy = 'oa:replying';


      //XXX: Is this used? Probably. Fix bodyValue
      var bodyValue = note.schemadescription;
      if(!bodyValue) {
        bodyValue = note.dctermsdescription;
        if(!bodyValue)  {
          bodyValue = note.ascontent;
        }
      }

      var types = note.rdftype;
// console.log(types);
      var resourceTypes = [];
      types.forEach(function(type){
        resourceTypes.push(type);
// console.log(type);
      });

      if (resourceTypes.indexOf('http://www.w3.org/ns/oa#Annotation') > -1) {
        if (note.oabodyValue) {
          var bodyValue = note.oabodyValue;
// console.log(bodyValue);
        }
        else if (note.oahasBody && note.oahasBody._array.length > 0) {
          var noteLanguage = getGraphLanguage(note);
          var noteLicense = getGraphLicense(note);
          var noteRights = getGraphRights(note);

          var bodyObjects = [];
// console.log(note.oahasBody)
// console.log(note.oahasBody._array)
          note.oahasBody._array.forEach(bodyIRI => {
// console.log(bodyIRI);
            var bodyObject = {
              "id": bodyIRI
            };

            var body = g.child(bodyIRI);

            if (body) {
// console.log(body.toString());

              if (body.rdftype && body.rdftype._array.length > 0) {
                bodyObject['type'] = body.rdftype._array;
              }

              if (body.rdfvalue) {
                bodyObject['value'] = body.rdfvalue;
              }

              if (body.oahasPurpose) {
// console.log(body.oahasPurpose)
                bodyObject['purpose'] = body.oahasPurpose;
              }

              //TODO: Revisit format and language when there is a hasPurpose (e.g., describing, tagging)

              var bodyFormat = body.dcformat || body.dctermsformat;
              if (bodyFormat) {
                bodyObject['format'] = bodyFormat;
              }

              var bodyLanguage = getGraphLanguage(body) || noteLanguage;
              if (bodyLanguage) {
// console.log(bodyLanguage)
                bodyObject['language'] = bodyLanguage;
              }

              var bodyLicense = getGraphLicense(body) || noteLicense;
              if (bodyLicense) {
// console.log(bodyLicense)
                bodyObject['license'] = bodyLicense;
              }

              var bodyRights = getGraphRights(body) || noteRights;
              if (bodyRights) {
// console.log(bodyRights)
                bodyObject['rights'] = bodyRights;
              }
            }
            bodyObjects.push(bodyObject);
          })
// console.log(bodyObjects)
        }

// console.log(documentURL)
        if (note.oahasTarget && !(note.oahasTarget.startsWith(documentURL) || 'targetInMemento' in options || 'targetInSameAs' in options)){
          // return Promise.reject();
          return;
        }

        var target = g.child(note.oahasTarget);
// console.log(target);
        var targetIRI = target.iri().toString();
// console.log(targetIRI);

        var source = target.oahasSource;
// console.log(source);
// console.log(note.oamotivatedBy);

        if(note.oamotivatedBy) {
          motivatedBy = note.oamotivatedBy;
          refLabel = DO.U.getReferenceLabel(motivatedBy);
        }

        var exact, prefix, suffix;
        var selector = target.oahasSelector;
        if(selector) {
          selector = g.child(selector);
// console.log(selector);

// console.log(selector.rdftype);
// console.log(selector.rdftype._array);
          //FIXME: This is taking the first rdf:type. There could be multiple.
          var selectorTypes;
          if (selector.rdftype && selector.rdftype.at(0)) {
            selectorTypes = selector.rdftype.at(0);
          }
// console.log(selectorTypes == 'http://www.w3.org/ns/oa#FragmentSelector');
          if(selectorTypes == 'http://www.w3.org/ns/oa#TextQuoteSelector') {
            exact = selector.oaexact;
            prefix = selector.oaprefix;
            suffix = selector.oasuffix;
          }
          else if (selectorTypes == 'http://www.w3.org/ns/oa#FragmentSelector') {
            var refinedBy = g.child(selector.oarefinedBy);
// console.log(refinedBy)
            exact = refinedBy.oaexact;
            prefix = refinedBy.oaprefix;
            suffix = refinedBy.oasuffix;
// console.log(selector.rdfvalue)
            if (selector.rdfvalue && selector.rdfvalue !== '' && selector.dctermsconformsTo && selector.dctermsconformsTo.endsWith('://tools.ietf.org/html/rfc3987')) {
              var fragment = selector.rdfvalue;
// console.log(fragment)
              fragment = (fragment.indexOf('#') == 0) ? getFragmentFromString(fragment) : fragment;

              if (fragment !== '') {
                containerNode = document.getElementById(fragment) || getDocumentContentNode(document);
              }
            }
          }
        }
// console.log(exact);
// console.log(prefix);
// console.log(suffix);
// console.log('----')
        var docRefType = '<sup class="ref-annotation"><a href="#' + id + '" rel="cito:hasReplyFrom" resource="' + noteIRI + '">' + refLabel + '</a></sup>';

        var containerNodeTextContent = containerNode.textContent;
        //XXX: Seems better?
        // var containerNodeTextContent = fragmentFromString(getDocument(containerNode)).textContent.trim();

//console.log(containerNodeTextContent);
// console.log(prefix + exact + suffix);
        var selectorIndex = containerNodeTextContent.indexOf(prefix + exact + suffix);
// console.log(selectorIndex);
        if (selectorIndex >= 0) {
          selector =  {
            "prefix": prefix,
            "exact": exact,
            "suffix": suffix
          };

          var selectedParentNode = DO.U.importTextQuoteSelector(containerNode, selector, refId, motivatedBy, docRefType, { 'do': true });

          var parentNodeWithId = selectedParentNode.closest('[id]');
          targetIRI = (parentNodeWithId) ? documentURL + '#' + parentNodeWithId.id : documentURL;

          var noteData = {
            "type": 'article',
            "mode": "read",
            "motivatedByIRI": motivatedBy,
            "id": id,
            "refId": refId,
            "iri": noteIRI, //e.g., https://example.org/path/to/article
            "creator": {},
            "target": {
              "iri": targetIRI,
              "source": source,
              "selector": {
                "exact": exact,
                "prefix": prefix,
                "suffix": suffix
              }
              //TODO: state
            }
          }
          if (bodyValue) {
            noteData["bodyValue"] = bodyValue;
          }
          if (bodyObjects) {
            noteData["body"] = bodyObjects;
          }
          if (annotatedByIRI) {
            noteData.creator["iri"] = annotatedByIRI;
          }
          if (annotatedByName) {
            noteData.creator["name"] = annotatedByName;
          }
          if (annotatedByImage) {
            noteData.creator["image"] = annotatedByImage;
          }
          if (annotatedByURL) {
            noteData.creator["url"] = annotatedByURL;
          }
          if (noteLanguage) {
            noteData["language"] = noteLanguage;
          }
          if (noteLicense) {
            noteData["license"] = noteLicense;
          }
          if (noteRights) {
            noteData["rights"] = noteRights;
          }
          if (inboxIRI) {
            noteData["inbox"] = inboxIRI;
          }
          if (datetime){
            noteData["datetime"] = datetime;
          }

          DO.U.addNoteToNotifications(noteData);

//           var asideNode = fragmentFromString(asideNote);
//           var parentSection = getClosestSectionNode(selectedParentNode);
//           parentSection.appendChild(asideNode);
          //XXX: Keeping this comment around for emergency
//                selectedParentNode.parentNode.insertBefore(asideNode, selectedParentNode.nextSibling);

          if(DO.C.User.IRI) {
            var buttonDelete = document.querySelector('aside.do blockquote[cite="' + noteIRI + '"] article button.delete');
            if (buttonDelete) {
              buttonDelete.addEventListener('click', function(e) {
                var button = e.target.closest('button.delete');
                handleDeleteNote(button);
              });
            }
          }

          //Perhaps return something more useful?
          return noteIRI;
        }

        //XXX: Annotation without a selection
        else {
          noteData = {
            "type": 'article',
            "mode": "read",
            "motivatedByIRI": motivatedBy,
            "id": id,
            "refId": refId,
            "refLabel": refLabel,
            "iri": noteIRI,
            "creator": {},
            "target": {
              "iri": targetIRI
            }
          };
          if (bodyValue) {
            noteData["bodyValue"] = bodyValue;
          }
          if (bodyObjects) {
            noteData["body"] = bodyObjects;
          }
          if (annotatedByIRI) {
            noteData.creator["iri"] = annotatedByIRI;
          }
          if (annotatedByName) {
            noteData.creator["name"] = annotatedByName;
          }
          if (annotatedByImage) {
            noteData.creator["image"] = annotatedByImage;
          }
          if (noteLanguage) {
            noteData["language"] = noteLanguage;
          }
          if (noteLicense) {
            noteData["license"] = noteLicense;
          }
          if (noteRights) {
            noteData["rights"] = noteRights;
          }
          if (inboxIRI) {
            noteData["inbox"] = inboxIRI;
          }
          if (datetime){
            noteData["datetime"] = datetime;
          }
// console.log(noteData)
          DO.U.addNoteToNotifications(noteData);
        }
      }
      //TODO: Refactor
      else if ((note.asinReplyTo && note.asinReplyTo.at(0)) || (note.siocreplyof && note.siocreplyof.at(0))) {
        var inReplyTo, inReplyToRel;
        if (note.asinReplyTo.at(0)) {
          inReplyTo = note.asinReplyTo.at(0);
          inReplyToRel = 'as:inReplyTo';
        }
        else if(note.siocreplyof.at(0)) {
          inReplyTo = note.siocreplyof.at(0);
          inReplyToRel = 'sioc:reply_of';
        }

        if(inReplyTo && inReplyTo.indexOf(window.location.origin + window.location.pathname) >= 0) {
          noteData = {
            "type": 'article',
            "mode": "read",
            "motivatedByIRI": motivatedBy,
            "id": id,
            "refId": refId,
            "refLabel": refLabel,
            "iri": noteIRI,
            "creator": {},
            "inReplyTo": {
              'iri': inReplyTo,
              'rel': inReplyToRel
            }
          };
          if (bodyValue) {
            noteData["bodyValue"] = bodyValue;
          }
          if (bodyObjects) {
            noteData["body"] = bodyObjects;
          }
          if (annotatedByIRI) {
            noteData.creator["iri"] = annotatedByIRI;
          }
          if (annotatedByName) {
            noteData.creator["name"] = annotatedByName;
          }
          if (annotatedByImage) {
            noteData.creator["image"] = annotatedByImage;
          }
          if (noteLanguage) {
            noteData["language"] = noteLanguage;
          }
          if (noteLicense) {
            noteData["license"] = noteLicense;
          }
          if (noteRights) {
            noteData["rights"] = noteRights;
          }
          if (inboxIRI) {
            noteData["inbox"] = inboxIRI;
          }
          if (datetime){
            noteData["datetime"] = datetime;
          }
          DO.U.addNoteToNotifications(noteData);
        }
        else {
          console.log(noteIRI + ' is not an oa:Annotation, as:inReplyTo, sioc:reply_of');
        }
      }
    },

    showCitations: function(citation, g) {
// console.log('----- showCitations: ')
// console.log(citation);

      var cEURL = stripFragmentFromString(citation.citingEntity);
// console.log(DO.C.Activity[cEURL]);

      if (DO.C.Activity[cEURL]) {
        if (DO.C.Activity[cEURL]['Graph']) {
          DO.U.addCitation(citation, DO.C.Activity[cEURL]['Graph']);
        }
        else {
// console.log('  Waiting...' + citation.citingEntity)
          window.setTimeout(DO.U.showCitations, 1000, citation, g);
        }
      }
      else {
        DO.U.processCitationClaim(citation);
      }
    },

    processCitationClaim: function(citation) {
// console.log('  processCitationClaim(' + citation.citingEntity + ')')
      var pIRI = getProxyableIRI(citation.citingEntity);
      return getResourceGraph(pIRI).then(
        function(i) {
          var cEURL = stripFragmentFromString(citation.citingEntity);
          DO.C.Activity[cEURL] = {};
          DO.C.Activity[cEURL]['Graph'] = i;
          var s = i.child(citation.citingEntity);
          DO.U.addCitation(citation, s);
        }
      );
    },

    addCitation: function(citation, s) {
// console.log('  addCitation(' + citation.citingEntity + ')')
      var citingEntity = citation.citingEntity;
      var citationCharacterization = citation.citationCharacterization;
      var citedEntity = citation.citedEntity;

      var documentURL = DO.C.DocumentURL;

      //XXX: Important
      s = s.child(citingEntity);

      //TODO: cito:Citation
      // if rdftypes.indexOf(citoCitation)
      //   note.citocitingEntity && note.citocitationCharacterization && note.citocitedEntity)

      // else

// console.log("  " + citationCharacterization + "  " + citedEntity);
    var citationCharacterizationLabel = DO.C.Citation[citationCharacterization] || citationCharacterization;

    var id = generateUUID(citingEntity);
    var refId;

    var cEURL = stripFragmentFromString(citingEntity);
    var citingEntityLabel = getGraphLabel(s);
    if (!citingEntityLabel) {
      var cEL = getGraphLabel(s.child(cEURL));
      citingEntityLabel = cEL ? cEL : citingEntity;
    }
    citation['citingEntityLabel'] = citingEntityLabel;

    var citedEntityLabel = getGraphLabel(DO.C.Resource[documentURL].graph.child(citedEntity))
    if (!citedEntityLabel) {
      cEL = DO.C.Resource[documentURL].graph(DO.C.Resource[documentURL].graph.child(stripFragmentFromString(citedEntity)))
      citedEntityLabel = cEL ? cEL : citedEntity;
    }
    citation['citedEntityLabel'] = citedEntityLabel;

    var noteData = {
      'id': id,
      'iri': citingEntity,
      'type': 'ref-citation',
      'mode': 'read',
      'citation': citation
    }

// console.log(noteData)
    var noteDataHTML = DO.U.createNoteDataHTML(noteData);

    var asideNote = '\n\
<aside class="note do">\n\
<blockquote cite="' + citingEntity + '">'+ noteDataHTML + '</blockquote>\n\
</aside>\n\
';
// console.log(asideNote)
    var asideNode = fragmentFromString(asideNote);

    var fragment, fragmentNode;

  // //FIXME: If containerNode is used.. the rest is buggy

    fragment = getFragmentFromString(citedEntity);
// console.log("  fragment: " + fragment)
    fragmentNode = document.querySelector('[id="' + fragment + '"]');

    if (fragmentNode) {
// console.log(asideNote)
      var containerNode = fragmentNode;
      refId = fragment;
// console.log(fragment);
// console.log(fragmentNode);
      containerNode.appendChild(asideNode);
      DO.U.positionNote(refId, id, citingEntityLabel);
    }
    else {
      var dl;
      var citingItem = '<li><a about="' + citingEntity + '" href="' + citingEntity + '" rel="' + citationCharacterization + '" resource="' + citedEntity + '">' + citingEntityLabel + '</a> (' + citationCharacterizationLabel + ')</li>';

      var documentCitedBy = 'document-cited-by';
      var citedBy = document.getElementById(documentCitedBy);

      if(citedBy) {
        var ul = citedBy.querySelector('ul');
        var spo = ul.querySelector('[about="' + citingEntity + '"][rel="' + citationCharacterization + '"][resource="' + citedEntity + '"]');
        if (!spo) {
          ul.appendChild(fragmentFromString(citingItem));
        }
      }
      else {
        dl = '        <dl class="do" id="' + documentCitedBy + '"><dt>Cited By</dt><dd><ul>' + citingItem + '</ul></dl>';
        insertDocumentLevelHTML(document, dl, { 'id': documentCitedBy });
      }
    }
    },

    initializeButtonMore: function(node) {
      var progress = fragmentFromString('<span class="progress">' + DO.C.Button.More + ' Discover activities from your social circles!</span>');
      node.querySelector('div.info').replaceChildren(progress);

      node = document.getElementById('document-notifications');

      var buttonMore = node.querySelector('div.info button.more');
      buttonMore.addEventListener('click', () => {
        if (!DO.C.User.IRI) {
          showUserIdentityInput();
        }
        else {
          DO.U.showContactsActivities();
        }
      });
    },

    initializeNotifications: function(options = {}) {
      var contextNode = selectArticleNode(document);
      // <p class="count"><data about="" datatype="xsd:nonNegativeInteger" property="sioc:num_replies" value="' + interactionsCount + '">' + interactionsCount + '</data> interactions</p>
      //<progress min="0" max="100" value="0"></progress>
      //<div class="actions"><a href="/docs#resource-activities" target="_blank">${Icon[".fas.fa-circle-info"]}</a></div>

      var aside = `<aside class="do" id="document-notifications">${DO.C.Button.Toggle}<h2>Notifications</h2><div><div class="info"></div><ul class="activities"></ul></div></aside>`;
      contextNode.insertAdjacentHTML('beforeend', aside);
      aside = document.getElementById('document-notifications');

      if (options.includeButtonMore) {
        DO.U.initializeButtonMore(aside);
      }

      return aside;
    },

    addNoteToNotifications: function (noteData) {
      var id = document.getElementById(noteData.id);
      if (id) return;

      var noteDataIRI = noteData.iri;
      // delete noteData.iri;
// console.log(noteData)
      var note = DO.U.createNoteDataHTML(noteData);

      var datetime = noteData.datetime ? noteData.datetime : '1900-01-01T00:00:00.000Z';

      // var li = '<li data-datetime="' + noteData.datetime + '"><blockquote cite="' + noteData.iri + '">'+ note + '</blockquote></li>';
      var li = '<li data-datetime="' + datetime + '"><blockquote cite="' + noteDataIRI + '">'+ note + '</blockquote></li>';
// console.log(li);
      var aside = document.getElementById('document-notifications');

      if(!aside) {
        aside = DO.U.initializeNotifications({includeButtonMore: true});
      }

      var notifications = document.querySelector('#document-notifications > div > ul');
      var timesNodes = aside.querySelectorAll('div > ul > li[data-datetime]');
      var previousElement = null;
      if (timesNodes.length) {
        var times = Array.from(timesNodes).map(element => element.getAttribute("data-datetime"));
        var previousDateTime = findPreviousDateTime(times, noteData.datetime);
        previousElement = Array.from(timesNodes).find((element) => previousDateTime && previousDateTime === element.datetime ? element : null);
      }

      if (previousElement) {
        previousElement.insertAdjacentHTML('afterend', li);
      }
      else {
        notifications.insertAdjacentHTML('afterbegin', li);
      }
    },

    showNotifications: function() {
      DO.U.hideDocumentMenu();

      var aside = document.getElementById('document-notifications');

      if(!aside) {
        aside = DO.U.initializeNotifications();
      }
      aside.classList.add('on');

      DO.U.showContactsActivities();
    },

    createNoteDataHTML: function(n) {
// console.log(n);
      var created = '';
      var lang = '', xmlLang = '', language = '';
      var license = '';
      var rights = '';
      var creator = '', authors = '', creatorImage = '', creatorNameIRI = '', creatorURLNameIRI = '';
      var hasTarget = '', annotationTextSelector = '', target = '';
      var inbox = '';
      var heading, hX;
      var aAbout = '', aPrefix = '';
      var noteType = '';
      var body = '';
      var buttonDelete = '';
      var note = '';
      var targetLabel = '';
      var bodyAltLabel = '';
      var articleClass = '';
      var prefixes = ' prefix="rdf: http://www.w3.org/1999/02/22-rdf-syntax-ns# schema: http://schema.org/ dcterms: http://purl.org/dc/terms/ oa: http://www.w3.org/ns/oa# as: https://www.w3.org/ns/activitystreams# ldp: http://www.w3.org/ns/ldp#"';

      var canonicalId = n.canonical || 'urn:uuid:' + generateUUID();

      var motivatedByIRI = n.motivatedByIRI || '';
      var motivatedByLabel = '';

      motivatedByIRI = getPrefixedNameFromIRI(motivatedByIRI);

      switch(motivatedByIRI) {
        case 'oa:replying': default:
          motivatedByIRI = 'oa:replying';
          motivatedByLabel = 'replies';
          targetLabel = 'In reply to';
          bodyAltLabel = 'Replied';
          aAbout = ('mode' in n && n.mode == 'object') ? '#' + n.id : '';
          aPrefix = prefixes;
          break;
        case 'oa:assessing':
          motivatedByLabel = 'reviews';
          targetLabel = 'Review of';
          bodyAltLabel = 'Reviewed';
          aAbout = ('mode' in n && n.mode == 'object') ? '#' + n.id : '';
          aPrefix = prefixes;
          break;
        case 'oa:questioning':
          motivatedByLabel = 'questions';
          targetLabel = 'Questions';
          bodyAltLabel = 'Questioned';
          aAbout = ('mode' in n && n.mode == 'object') ? '#' + n.id : '';
          aPrefix = prefixes;
          break;
        case 'oa:describing':
          motivatedByLabel = 'describes';
          targetLabel = 'Describes';
          bodyAltLabel = 'Described'
          aAbout = '#' + n.id;
          break;
        case 'oa:commenting':
          motivatedByLabel = 'comments';
          targetLabel = 'Comments on';
          bodyAltLabel = 'Commented';
          aAbout = '#' + n.id;
          break;
        case 'oa:bookmarking': case 'bookmark:Bookmark':
          motivatedByLabel = 'bookmarks';
          targetLabel = 'Bookmarked';
          bodyAltLabel = 'Bookmarked';
          aAbout = ('mode' in n && n.mode == 'object') ? '#' + n.id : '';
          aPrefix = prefixes;
          break;
        case 'as:Like':
          motivatedByLabel = 'Liked';
          targetLabel = 'Like of';
          bodyAltLabel = 'Liked';
          aAbout = ('mode' in n && n.mode == 'object') ? '#' + n.id : '';
          aPrefix = prefixes;
          break;
        case 'as:Dislike':
          motivatedByLabel = 'Disliked';
          targetLabel = 'Dislike of';
          bodyAltLabel = 'Disliked';
          aAbout = ('mode' in n && n.mode == 'object') ? '#' + n.id : '';
          aPrefix = prefixes;
          break;
      }

      switch(n.mode) {
        default: case 'read':
          hX = 3;
          if ('creator' in n && 'iri' in n.creator && n.creator.iri == DO.C.User.IRI) {
            buttonDelete = '<button class="delete do" title="Delete item">' + Icon[".fas.fa-trash-alt"] + '</button>' ;
          }
          articleClass = (motivatedByIRI == 'oa:commenting') ? '': ' class="do"';
          aAbout = ('iri' in n) ? n.iri : '';
          break;
        case 'write':
          hX = 1;
          break;
        case 'object':
          hX = 2;
          break;
      }

      var creatorName = '';
      var creatorIRI = '#' + generateAttributeId();
      // creatorNameIRI = DO.C.SecretAgentNames[Math.floor(Math.random() * DO.C.SecretAgentNames.length)];

      if ('creator' in n) {
        if('iri' in n.creator) {
          creatorIRI = n.creator.iri;
        }

        creatorName = creatorIRI;

        if('name' in n.creator) {
          creatorName = n.creator.name;
          creatorNameIRI = '<span about="' + creatorIRI + '" property="schema:name">' + creatorName + '</span>';
        }
        else if (DO.C.User.Name && (creatorIRI == DO.C.User.IRI || DO.C.User?.SameAs.includes(creatorIRI))) {
          creatorName = DO.C.User.Name;
          creatorNameIRI = '<span about="' + creatorIRI + '" property="schema:name">' + creatorName + '</span>';
        }
        //XXX: This could potentially incorporate checking the sameAses of all contacts to match creatorIRI
        else if (DO.C.User.Contacts && DO.C.User.Contacts[creatorIRI] && DO.C.User.Contacts[creatorIRI].Name) {
          creatorName = DO.C.User.Contacts[creatorIRI].Name;
          creatorNameIRI = creatorName;
        }

        var img = generateDataURI('image/svg+xml', 'base64', Icon['.fas.fa-user-secret']);
        if ('image' in n.creator) {
          img = (n.mode == 'read') ? getProxyableIRI(n.creator.image) : n.creator.image;
        }
        else if (DO.C.User.Image && (creatorIRI == DO.C.User.IRI || DO.C.User.SameAs.includes(creatorIRI))) {
          img = (n.mode == 'read') ? getProxyableIRI(DO.C.User.Image) : DO.C.User.Image;
        }
        else {
          img = (DO.C.User.Contacts && DO.C.User.Contacts[creatorIRI] && DO.C.User.Contacts[creatorIRI].Image) ? DO.C.User.Contacts[creatorIRI].Image : img;
        }
        creatorImage = '<img alt="" height="48" rel="schema:image" src="' + img + '" width="48" /> ';

        creatorURLNameIRI = ('url' in n.creator) ? '<a href="' + n.creator.url + '" rel="schema:url">' + creatorNameIRI + '</a>' : '<a href="' + creatorIRI + '">' + creatorNameIRI + '</a>';

        creator = '<span about="' + creatorIRI + '" typeof="schema:Person">' + creatorImage + creatorURLNameIRI + '</span>';

        authors = '<dl class="author-name"><dt>Authors</dt><dd><span rel="dcterms:creator">' + creator + '</span></dd></dl>';
      }

      heading = '<h' + hX + ' property="schema:name">' + creatorName + ' <span rel="oa:motivatedBy" resource="' + motivatedByIRI + '">' + motivatedByLabel + '</span></h' + hX + '>';

      if ('inbox' in n && typeof n.inbox !== 'undefined') {
        inbox = '<dl class="inbox"><dt>Notifications Inbox</dt><dd><a href="' + n.inbox + '" rel="ldp:inbox">' + n.inbox + '</a></dd></dl>';
      }

      if ('datetime' in n && typeof n.datetime !== 'undefined'){
        var time = '<time datetime="' + n.datetime + '" datatype="xsd:dateTime" property="dcterms:created" content="' + n.datetime + '">' + n.datetime.substr(0,19).replace('T', ' ') + '</time>';
        var timeLinked = ('iri' in n) ? '<a href="' + n.iri + '">' + time + '</a>' : time;
        created = '<dl class="created"><dt>Created</dt><dd>' + timeLinked + '</dd></dl>';
      }

      if (n.language) {
        language = createLanguageHTML(n.language, {property:'dcterms:language', label:'Language'});
        lang = ' lang="' +  n.language + '"';
        xmlLang = ' xml:lang="' +  n.language + '"';
      }
      if (n.license) {
        license = createLicenseHTML(n.license, {rel:'schema:license', label:'License'});
      }
      if (n.rights) {
        rights = createRightsHTML(n.rights, {rel:'dcterms:rights', label:'Rights'});
      }

      //TODO: Differentiate language, license, rights on Annotation from Body

      switch(n.type) {
        case 'article': case 'note': case 'bookmark': case 'approve': case 'disapprove': case 'specificity':
          if (typeof n.target !== 'undefined' || typeof n.inReplyTo !== 'undefined') { //note, annotation, reply
            //FIXME: Could resourceIRI be a fragment URI or *make sure* it is the document URL without the fragment?
            //TODO: Use n.target.iri?
// console.log(n)
            if (typeof n.body !== 'undefined') {
              var tagsArray = [];

              n.body = Array.isArray(n.body) ? n.body : [n.body];
              n.body.forEach(bodyItem => {
                var bodyLanguage = createLanguageHTML(bodyItem.language, {property:'dcterms:language', label:'Language'}) || language;
                var bodyLicense = createLicenseHTML(bodyItem.license, {rel:'schema:license', label:'License'}) || license;
                var bodyRights = createRightsHTML(bodyItem.rights, {rel:'dcterms:rights', label:'Rights'}) || rights;
                var bodyValue = bodyItem.value || bodyAltLabel;
                // var bodyValue = bodyItem.value || '';
                // var bodyFormat = bodyItem.format ? bodyItem.format : 'rdf:HTML';

                if (bodyItem.purpose) {
                  if (bodyItem.purpose == "describing" || bodyItem.purpose == DO.C.Vocab["oadescribing"]["@id"]) {
                    body += '<section id="note-' + n.id + '" rel="oa:hasBody" resource="#note-' + n.id + '"><h' + (hX+1) + ' property="schema:name" rel="oa:hasPurpose" resource="oa:describing">Note</h' + (hX+1) + '>' + bodyLanguage + bodyLicense + bodyRights + '<div datatype="rdf:HTML"' + lang + ' property="rdf:value schema:description" resource="#note-' + n.id + '" typeof="oa:TextualBody"' + xmlLang + '>' + bodyValue + '</div></section>';
                  }
                  if (bodyItem.purpose == "tagging" || bodyItem.purpose == DO.C.Vocab["oatagging"]["@id"]) {
                    tagsArray.push(bodyValue);
                  }
                }
                else {
                  body += '<section id="note-' + n.id + '" rel="oa:hasBody" resource="#note-' + n.id + '"><h' + (hX+1) + ' property="schema:name">Note</h' + (hX+1) + '>' + bodyLanguage + bodyLicense + bodyRights + '<div datatype="rdf:HTML"' + lang + ' property="rdf:value schema:description" resource="#note-' + n.id + '" typeof="oa:TextualBody"' + xmlLang + '>' + bodyValue + '</div></section>';
                }
              });

              if (tagsArray.length) {
                tagsArray = tagsArray
                  .map(tag => escapeCharacters(tag.trim()))
                  .filter(tag => tag.length > 0);
                  tagsArray = uniqueArray(tagsArray.sort());

                var tags = tagsArray.map(tag => '<li about="#tag-' + n.id + '-' + generateAttributeId(null, tag) + '" typeof="oa:TextualBody" property="rdf:value" rel="oa:hasPurpose" resource="oa:tagging">' + tag + '</li>').join('');

                body += '<dl id="tags-' + n.id + '" class="tags"><dt>Tags</dt><dd><ul rel="oa:hasBody">' + tags + '</ul></dd></dl>';
              }
            }
            else if (n.bodyValue !== 'undefined') {
              body += '<p property="oa:bodyValue">' + n.bodyValue + '</p>';
            }
// console.log(body)
            var targetIRI = '';
            var targetRelation = 'oa:hasTarget';
            if (typeof n.target !== 'undefined' && 'iri' in n.target) {
              targetIRI = n.target.iri;
              var targetIRIFragment = getFragmentFromString(n.target.iri);
              //TODO: Handle when there is no fragment
              //TODO: Languages should be whatever is target's (not necessarily 'en')
              if (typeof n.target.selector !== 'undefined') {
                var selectionLanguage = ('language' in n.target.selector && n.target.selector.language) ? n.target.selector.language : '';

                annotationTextSelector = '<div rel="oa:hasSelector" resource="#fragment-selector" typeof="oa:FragmentSelector"><dl class="conformsto"><dt>Fragment selector conforms to</dt><dd><a content="' + targetIRIFragment + '" lang="" property="rdf:value" rel="dcterms:conformsTo" href="https://tools.ietf.org/html/rfc3987" xml:lang="">RFC 3987</a></dd></dl><dl rel="oa:refinedBy" resource="#text-quote-selector" typeof="oa:TextQuoteSelector"><dt>Refined by</dt><dd><span lang="' + selectionLanguage + '" property="oa:prefix" xml:lang="' + selectionLanguage + '">' + n.target.selector.prefix + '</span><mark lang="' + selectionLanguage + '" property="oa:exact" xml:lang="' + selectionLanguage + '">' + n.target.selector.exact + '</mark><span lang="' + selectionLanguage + '" property="oa:suffix" xml:lang="' + selectionLanguage + '">' + n.target.selector.suffix + '</span></dd></dl></div>';
              }
            }
            else if(typeof n.inReplyTo !== 'undefined' && 'iri' in n.inReplyTo) {
              targetIRI = n.inReplyTo.iri;
              targetRelation = ('rel' in n.inReplyTo) ? n.inReplyTo.rel : 'as:inReplyTo';
              // TODO: pass document title and maybe author so they can be displayed on the reply too.
            }

            hasTarget = '<a href="' + targetIRI + '" rel="' + targetRelation + '">' + targetLabel + '</a>';
            if (typeof n.target !== 'undefined' && typeof n.target.source !== 'undefined') {
              hasTarget += ' (<a about="' + n.target.iri + '" href="' + n.target.source +'" rel="oa:hasSource" typeof="oa:SpecificResource">part of</a>)';
            }

            var targetLanguage = (typeof n.target !== 'undefined' && 'language' in n.target) ? '<dl><dt>Language</dt><dd><span lang="" property="dcterms:language" xml:lang="">' + n.target.language + '</span></dd></dl>': '';

            target ='<dl class="target"><dt>' + hasTarget + '</dt>';
            if (typeof n.target !== 'undefined' && typeof n.target.selector !== 'undefined') {
              target += '<dd><blockquote about="' + targetIRI + '" cite="' + targetIRI + '">' + targetLanguage + annotationTextSelector + '</blockquote></dd>';
            }
            target += '</dl>';

            target += '<dl class="renderedvia"><dt>Rendered via</dt><dd><a about="' + targetIRI + '" href="https://dokie.li/" rel="oa:renderedVia">dokieli</a></dd></dl>';

            var canonical = '<dl class="canonical"><dt>Canonical</dt><dd rel="oa:canonical" resource="' + canonicalId + '">' + canonicalId + '</dd></dl>';

            note = '<article about="' + aAbout + '" id="' + n.id + '" typeof="oa:Annotation' + noteType + '"' + aPrefix + articleClass + '>'+buttonDelete+'\n\
  ' + heading + '\n\
  ' + authors + '\n\
  ' + created + '\n\
  ' + language + '\n\
  ' + license + '\n\
  ' + rights + '\n\
  ' + inbox + '\n\
  ' + canonical + '\n\
  ' + target + '\n\
  ' + body + '\n\
</article>';
          }
          break;

        case 'ref-footnote':
          var citationURL = (typeof n.citationURL !== 'undefined' && n.citationURL != '') ? '<a href="' + n.citationURL + '" rel="rdfs:seeAlso">' + n.citationURL + '</a>' : '';
          body = (typeof n.body !== 'undefined' && n.body != '') ? ((citationURL) ? ', ' + n.body : n.body) : '';

          note = '\n\
  <dl about="#' + n.id +'" id="' + n.id +'" typeof="oa:Annotation">\n\
    <dt><a href="#' + n.refId + '" rel="oa:hasTarget">' + n.refLabel + '</a><meta rel="oa:motivation" resource="' + motivatedByIRI + '" /></dt>\n\
    <dd rel="oa:hasBody" resource="#n-' + n.id + '"><div datatype="rdf:HTML" property="rdf:value" resource="#n-' + n.id + '" typeof="oa:TextualBody">' + citationURL + body + '</div></dd>\n\
  </dl>\n\
';
          break;

        case 'ref-citation':
          heading = '<h' + hX + '>Citation</h' + hX + '>';

          var citingEntityLabel = ('citingEntityLabel' in n.citation) ? n.citation.citingEntityLabel : n.citation.citingEntity;
          var citationCharacterizationLabel = DO.C.Citation[n.citation.citationCharacterization] || n.citation.citationCharacterization;
          var citedEntityLabel = ('citedEntityLabel' in n.citation) ? n.citation.citedEntityLabel : n.citation.citedEntity;

          var citation = '\n\
  <dl about="' + n.citation.citingEntity + '">\n\
    <dt>Cited by</dt><dd><a href="' + n.citation.citingEntity + '">' + citingEntityLabel + '</a></dd>\n\
    <dt>Citation type</dt><dd><a href="' + n.citation.citationCharacterization + '">' + citationCharacterizationLabel+ '</a></dd>\n\
    <dt>Cites</dt><dd><a href="' + n.citation.citedEntity + '" property="' + n.citation.citationCharacterization + '">' + citedEntityLabel + '</a></dd>\n\
  </dl>\n\
';

          note = '<article about="' + aAbout + '" id="' + n.id + '" prefixes="cito: http://purl.org/spart/cito/"' + articleClass + '>\n\
  ' + heading + '\n\
  ' + citation + '\n\
</article>';
          break;

        default:
          break;
      }

      return note;
    },

    tagsToBodyObjects: function(string) {
      var bodyObjects = [];

      let tagsArray = string
        .split(',')
        .map(tag => escapeCharacters(tag.trim()))
        .filter(tag => tag.length > 0);

      tagsArray = uniqueArray(tagsArray.sort());

      tagsArray.forEach(tag => {
        bodyObjects.push({
          "purpose": "tagging",
          "value": tag
        })
      })

      return bodyObjects;
    },

    initMath: function(config) {
      if (!DO.C.MathAvailable) { return; }

      config = config || {
        skipTags: ["script","noscript","style","textarea","pre","code", "math"],
        ignoreClass: "equation",
        MathML: {
          useMathMLspacing: true
        },
        tex2jax: {
          inlineMath: [["$","$"],["\\(","\\)"]],
          processEscapes: true
        },
        asciimath2jax: {
          delimiters: [['$','$'], ['`','`']]
        }
      }

      window.MathJax.Hub.Config(config);

      window.MathJax.Hub.Register.StartupHook("End Jax",function () {
        var BROWSER = window.MathJax.Hub.Browser;
        var jax = "SVG";
        if (BROWSER.isMSIE && BROWSER.hasMathPlayer) jax = "NativeMML";
        if (BROWSER.isFirefox) jax = "NativeMML";
        if (BROWSER.isSafari && BROWSER.versionAtLeast("5.0")) jax = "NativeMML";

        window.MathJax.Hub.setRenderer(jax);
      });
    },

    initSlideshow: function(options) {
      options = options || {};
      options.progress = options.progress || true;

      //TODO: .shower can be anywhere?
      //TODO: check for rdf:type bibo:Slideshow or schema:PresentationDigitalDocument
      if (getDocumentContentNode(document).classList.contains('shower')) {
        //TODO: Check if .shower.list or .shower.full. pick a default in a dokieli or leave default to shower (list)?

        //TODO: Check if .bibo:Slide, and if there is no .slide, add .slide

        if (!getDocumentContentNode(document).querySelector('.progress') && options.progress) {
          getDocumentContentNode(document).appendChild(fragmentFromString('<div class="progress"></progress>'));
        }

        var shwr = new shower();
        shwr.start();
      }
    },

    Editor: {
      disableEditor: function(e) {
        
    //    _mediumEditors[1].destroy();
        DO.C.EditorEnabled = false;
        DO.C.User.Role = 'social';
        DO.U.updateDocumentTitle();
        // document.removeEventListener('click', DO.U.updateDocumentTitle);
        return DO.U.Editor.MediumEditor.destroy();
      },

      enableEditor: function(editorMode, e, selector) {
        if (typeof DO.U.Editor.MediumEditor !== 'undefined') {
          DO.U.Editor.disableEditor();
        }

        if (e || (typeof e === 'undefined' && editorMode == 'author')) {
          var message = 'Activated <em>' + editorMode + '</em> mode.';
          message = {
            'content': message,
            'type': 'info'
          }
          addMessageToLog(message, Config.MessageLog);
          showActionMessage(document.documentElement, message);
        }

        if (!document.getElementById('document-editor')) {
          document.documentElement.appendChild(fragmentFromString('<aside id="document-editor" class="do"></aside>'))
        }

        // console.log(new DO.U.Editor.Button({action:'h2', label:'h2'}))
        var editorOptions = {
          author: {
            id: 'author',
            elementsContainer: document.getElementById('document-editor'),
            placeholder: {
              text: ["Make it so!", "This is not a Paper", "Cogito Ergo Sum", "Do One Thing and Do It Well", "Free Your Mind", "Do or Do Not"][Math.floor(Math.random() * 6)]
            },
            disableDoubleReturn: true,
            paste: {
              forcePlainText: false,
              cleanPastedHTML: false,
              cleanReplacements: [],
              cleanAttrs: ['class', 'style', 'dir'],
              cleanTags: ['area', 'basefont', 'br', 'font', 'hr', 'isindex', 'link', 'script', 'style', 'wbr']
            },
            buttonLabels: DO.C.Editor.ButtonLabelType,
            toolbar: {
              buttons: ['h2', 'h3', 'h4', 'em', 'strong', 'orderedlist', 'unorderedlist', 'code', 'pre', 'anchor', 'q', 'image', 'sparkline', 'rdfa', 'cite', 'note'],
              diffLeft: 0,
              diffTop: -10,
              allowMultiParagraphSelection: false
            },
            anchorPreview: false,
            extensions: {
              'h2': new DO.U.Editor.Button({action:'h2', label:'h2'}),
              'h3': new DO.U.Editor.Button({action:'h3', label:'h3'}),
              'h4': new DO.U.Editor.Button({action:'h4', label:'h4'}),
              'em': new DO.U.Editor.Button({action:'em', label:'em'}),
              'strong': new DO.U.Editor.Button({action:'strong', label:'strong'}),
              'code': new DO.U.Editor.Button({action:'code', label:'code'}),
              'q': new DO.U.Editor.Button({action:'q', label:'q'}),
              'image': new DO.U.Editor.Button({action:'image', label:'image'}),
              'sparkline': new DO.U.Editor.Note({action:'sparkline', label:'sparkline'}),
              'rdfa': new DO.U.Editor.Note({action:'rdfa', label:'rdfa'}),
              'cite': new DO.U.Editor.Note({action:'cite', label:'cite'}),
              'note': new DO.U.Editor.Note({action:'note', label:'note'})
            }
          },

          social: {
            id: 'social',
            elementsContainer: document.getElementById('document-editor'),
            buttonLabels: DO.C.Editor.ButtonLabelType,
            toolbar: {
              buttons: ['selector', 'share', 'approve', 'disapprove', 'specificity', 'bookmark', 'note'],
              allowMultiParagraphSelection: false
            },
            disableEditing: true,
            anchorPreview: false,
            extensions: {
              'selector': new DO.U.Editor.Note({action:'selector', label:'selector'}),
              'share': new DO.U.Editor.Note({action:'share', label:'share'}),
              'bookmark': new DO.U.Editor.Note({action:'bookmark', label:'bookmark'}),
              'approve': new DO.U.Editor.Note({action:'approve', label:'approve'}),
              'disapprove': new DO.U.Editor.Note({action:'disapprove', label:'disapprove'}),
              'specificity': new DO.U.Editor.Note({action:'specificity', label:'specificity'}),
              'note': new DO.U.Editor.Note({action:'article', label:'note'})
            }
          }
        };

        if('MathJax' in window) {
          editorOptions.author.extensions['math'] = new DO.U.Editor.Button({action:'math', label:'math'});
          editorOptions.author.toolbar.buttons.splice(7, 0, 'math');
        }

        if('MediumEditorTable' in window) {
          editorOptions.author.extensions['table'] = new MediumEditorTable();
          editorOptions.author.toolbar.buttons.splice(10, 0, 'table');
        }

        var eNodes = selector || selectArticleNode(document);
        var eOptions = editorOptions[editorMode];
        DO.C.User.Role = editorMode;
        updateLocalStorageProfile(DO.C.User);

        if (typeof MediumEditor !== 'undefined') {
          DO.U.Editor.MediumEditor = new MediumEditor(eNodes, eOptions);
          DO.C.EditorEnabled = true;

          //XXX: MediumEditor is adding these and we don't really want them.
          eNodes.removeAttribute('role');
          eNodes.removeAttribute('aria-multiline');

          if (e && e.target.closest('button.editor-enable')) {
            DO.C.ContentEditable = true;
            // document.addEventListener('click', DO.U.updateDocumentTitle);
            DO.U.updateDocumentTitle();
            var documentURL = DO.C.DocumentURL;

            //FIXME: This is a horrible way of hacking MediumEditorTable
            document.querySelectorAll('i.fa-table, i.fa-link, i.fa-picture-o').forEach(function(i){
              var icon = Icon[".fas.fa-table.fa-2x"].replace(/ fa\-2x/, '');

              if (i.classList.contains('fa-link') > 0) {
                icon = Icon[".fas.fa-link"];
              }
              else if (i.classList.contains('fa-image') > 0) {
                icon = Icon[".fas.fa-image"];
              }

              i.parentNode.replaceChild(fragmentFromString(icon), i);
            });

            //XXX: Reconsider bringing this code back for primarily ScholarlyArticles?
            // var documentAuthors = 'authors';
            // var authors = document.getElementById(documentAuthors);
            // var authorName = 'author-name';
            // if (!authors) {
            //   var authors = '<div class="do" id="' + documentAuthors + '"><dl id="' + authorName + '"><dt>Authors</dt></dl></div>';
            //   insertDocumentLevelHTML(document, authors, { 'id': documentAuthors });
            //   authors = document.getElementById(documentAuthors);
            // }

            var s = DO.C.Resource[documentURL].graph.child(documentURL);

            DO.C.ContributorRoles.forEach(contributorRole => {
// console.log(contributorRole)
              var contributorNodeId = 'document-' + contributorRole + 's';
              var contributorNode = document.getElementById(contributorNodeId);
              if (!contributorNode) {
                var contributorTitle = contributorRole.charAt(0).toUpperCase() + contributorRole.slice(1) + 's';
                contributorNode = '        <dl id="' + contributorNodeId + '"><dt>' + contributorTitle + '</dt></dl>';
                insertDocumentLevelHTML(document, contributorNode, { 'id': contributorNodeId })
                contributorNode = document.getElementById(contributorNodeId);
              }

              //User can add themselves as a contributor
              if (DO.C.User.IRI && s['schema' + contributorRole].indexOf(DO.C.User.IRI) < 0){
                var contributorId;
                var contributorName = DO.C.User.Name || DO.C.User.IRI;
                if (DO.C.User.Name) {
                  contributorId = generateAttributeId(null, DO.C.User.Name);
                  if (document.getElementById(contributorId)) {
                    contributorId = generateAttributeId(null, DO.C.User.Name, contributorRole);
                  }
                }
                else {
                  contributorId = generateAttributeId(null, DO.C.User.IRI);
                }
                contributorId = ' id="' + contributorId + '"';

                var contributorInList = (DO.C.Resource[documentURL].rdftype.indexOf(DO.C.Vocab['schemaScholarlyArticle']['@id']) > -1) ?
                  ' inlist="" rel="bibo:' + contributorRole + 'List" resource="' + DO.C.User.IRI + '"' : '';

                var userHTML = '<dd class="do"' + contributorId + contributorInList + '><span about="" rel="schema:' + contributorRole + '">' + getAgentHTML({'avatarSize': 32}) + '</span><button class="add-' + contributorRole + '" contenteditable="false" title="Add ' + contributorName + ' as ' + contributorRole + '">' + Icon[".fas.fa-plus"] + '</button></dd>';

                contributorNode.insertAdjacentHTML('beforeend', userHTML);
              }

              //User can enter a contributor's WebID
              contributorNode.insertAdjacentHTML('beforeend', '<dd class="do"><button class="enter-' + contributorRole + '" contenteditable="false" title="Enter ' + contributorRole +'">' + Icon[".fas.fa-user-plus"] + '</button></dd>');

              //User can invite a contributor from their contacts
              contributorNode.insertAdjacentHTML('beforeend', '<dd class="do"><button class="invite-' + contributorRole + '" contenteditable="false" title="Invite ' + contributorRole +'">' + Icon[".fas.fa-bullhorn"] + '</button></dd>');

              contributorNode = document.getElementById(contributorNodeId);
              contributorNode.addEventListener('click', function(e){
                var button = e.target.closest('button.add-' + contributorRole);
                if (button){
                  var n = e.target.closest('.do');
                  if (n) {
                    n.classList.add('selected');
                  }
                  button.parentNode.removeChild(button);
                }

                button = e.target.closest('button.enter-' + contributorRole);
                //TODO: This input field can behave like the one in js showUserIdentityInput for enableDisableButton to button.commit
                if (button){
                  n = e.target.closest('.do');
                  n.insertAdjacentHTML('beforebegin', '<dd class="do" contenteditable="false"><input contenteditable="false" name="enter-' + contributorRole + '" placeholder="https://csarven.ca/#i" type="text" value="" /> <button class="commit-' + contributorRole + '" contenteditable="false" title="Commit ' + contributorRole + '">' + Icon[".fas.fa-plus"] + '</button></dd>');
                }

                button = e.target.closest('button.commit-' + contributorRole);
                if (button){
                  n = e.target.closest('.do');
                  if (n) {
                    n.classList.add('selected');

                    var input = n.querySelector('input');
                    var iri = input.value.trim();

                    //TODO:
                    // button.disabled = true;
                    // button.parentNode.disabled = true;
                    // button.querySelector('svg').classList.add('fa-spin');

                    if (iri.startsWith('http')) {
                      //TODO: Refactor. There is overlap with addShareResourceContactInput and getAgentHTML
                      getResourceGraph(iri).then(function(s){
                        // var iri = s.iri().toString();
                        // var id = encodeURIComponent(iri);

                        var name = getAgentName(s) || iri;
                        var img = getGraphImage(s);

                        img = (img && img.length > 0) ? '<img alt="" height="32" rel="schema:image" src="' + img + '" width="32" /> ' : '';
                        var userHTML = fragmentFromString('<span about="" rel="schema:' + contributorRole + '"><span about="' + iri + '" typeof="schema:Person">' + img + '<a href="' + iri + '" rel="schema:url">' + name + '</a></span></span>');

                        n.replaceChild(userHTML, input);
                        button.parentNode.removeChild(button);
                      });
                    }
                    else {
                      input.focus();
                    }
                  }
                }

                if (e.target.closest('button.invite-' + contributorRole)) {
                  DO.U.shareResource(e);
                  e.target.removeAttribute('disabled');
                }
              });

              //TODO: Show 'Remove' button for selected contributor (before exiting edit mode).

              //TODO: Update getResourceInfo() so that DO.C.Resource[documentURL] can be used to check other contributors while still in edit.
            })

            var documentModified = 'document-modified';
            var modified = document.getElementById(documentModified);
            var lastModified = DO.C.Resource[DO.C.DocumentURL]?.headers?.['last-modified']?.['field-value'];
            if(!modified && lastModified) {
              lastModified = new Date(lastModified);
              setDate(document, { 'id': 'document-modified', 'property': 'schema:dateModified', 'title': 'Modified', 'datetime': lastModified } );
            }

            var documentLanguage = 'document-language';
            var language = document.getElementById(documentLanguage);
            if(!language) {
              var dl = '        <dl class="do" id="' + documentLanguage + '"><dt>Language</dt><dd><select contenteditable="false" name="language">' + getLanguageOptionsHTML({ 'selected': '' }) + '</select></dd></dl>';
              insertDocumentLevelHTML(document, dl, { 'id': documentLanguage });

              var dLangS = document.querySelector('#' + documentLanguage + ' select');
              dLangS.addEventListener('change', function(e){
                dLangS.querySelectorAll('option').forEach(function(o){
                  o.removeAttribute('selected');
                });
                dLangS.querySelector('option[value="' + e.target.value + '"]').setAttribute('selected', 'selected');
              });
            }

            var documentLicense = 'document-license';
            var license = document.getElementById(documentLicense);
            if(!license) {
              dl = '        <dl class="do" id="' + documentLicense + '"><dt>License</dt><dd><select contenteditable="false" name="license">' + getLicenseOptionsHTML({ 'selected': '' }) + '</select></dd></dl>';
              insertDocumentLevelHTML(document, dl, { 'id': documentLicense });

              var dLS = document.querySelector('#' + documentLicense + ' select');
              dLS.addEventListener('change', function(e){
                dLS.querySelectorAll('option').forEach(function(o){
                  o.removeAttribute('selected');
                });
                dLS.querySelector('option[value="' + e.target.value + '"]').setAttribute('selected', 'selected');
              });
            }

            var documentType = 'document-type';
            var type = document.getElementById(documentType);
            if(!type) {
              dl = '        <dl class="do" id="' + documentType + '"><dt>Document Type</dt><dd><select contenteditable="false" name="document-type">' + getResourceTypeOptionsHTML({ 'selected': '' }) + '</select></dd></dl>';
              insertDocumentLevelHTML(document, dl, { 'id': documentType });

              var dTypeS = document.querySelector('#' + documentType + ' select');
              dTypeS.addEventListener('change', function(e){
                dTypeS.querySelectorAll('option').forEach(function(o){
                  o.removeAttribute('selected');
                });
                dTypeS.querySelector('option[value="' + e.target.value + '"]').setAttribute('selected', 'selected');
              });
            }

            var documentStatus = 'document-status';
            var status = document.getElementById(documentStatus);
            if(!status) {
              dl = '        <dl class="do" id="' + documentStatus + '"><dt>Document Status</dt><dd><select contenteditable="false" name="status">' + getPublicationStatusOptionsHTML({ 'selected': '' }) + '</select></dd></dl>';
              insertDocumentLevelHTML(document, dl, { 'id': documentStatus });

              var dSS = document.querySelector('#' + documentStatus + ' select');
              dSS.addEventListener('change', function(e){
                dSS.querySelectorAll('option').forEach(function(o){
                  o.removeAttribute('selected');
                });
                dSS.querySelector('option[value="' + e.target.value + '"]').setAttribute('selected', 'selected');
              });
            }

            if (s.rdftype.indexOf(DO.C.Vocab["doapSpecification"]["@id"]) > -1) {
              var documentTestSuite = 'document-test-suite';
              var testSuite = document.getElementById(documentTestSuite);
              if (!testSuite) {
                // <!--<button class="add-test-suite" contenteditable="false" title="Add test suite">' + Icon[".fas.fa-plus"] + '</button>-->
                dl = '        <dl class="do" id="' + documentTestSuite + '"><dt>Test Suite</dt><dd><input contenteditable="false" name="test-suite" placeholder="https://example.net/test-suite" type="text" value="" /></dd></dl>';
                insertDocumentLevelHTML(document, dl, { 'id': documentTestSuite });

                //XXX: This is a workaround until we understand why the input value is not available in setEditSelections() where it is using `document.querySelector` to get the value fresh. The following catches the blur event and sets the input value back to itself, and that seems to be available setEditSelections().
                var dTS = document.querySelector('#' + documentTestSuite + ' input');
                dTS.addEventListener('blur', function(e){
                  dTS.setAttribute('value', dTS.value)
                });
              }
            }

            if (!s.ldpinbox || s.ldpinbox._array.length === 0) {
              var documentInbox = 'document-inbox';
              var inbox = document.getElementById(documentInbox);
              if (!inbox) {
                //XXX: <!--<button class="add-inbox" contenteditable="false" title="Add inbox">' + Icon[".fas.fa-plus"] + '</button>-->
                dl = '        <dl class="do" id="' + documentInbox + '"><dt>Inbox</dt><dd><input contenteditable="false" name="inbox" placeholder="https://example.net/inbox/" type="text" value="" /></dd></dl>';
                insertDocumentLevelHTML(document, dl, { 'id': documentInbox });

                //XXX: Same as above comment about workaround for setEditSelections
                var dI = document.querySelector('#' + documentInbox + ' input');
                dI.addEventListener('blur', function(e){
                  dI.setAttribute('value', dI.value);
                });
              }
            }

            if (!s.asinReplyTo || s.asinReplyTo._array.length === 0) {
              var documentInReplyTo = 'document-in-reply-to';
              var inReplyTo = document.getElementById(documentInReplyTo);
              if (!inReplyTo) {
                //XXX: <!--<button class="add-in-reply-to" contenteditable="false" title="Add in-reply-to">' + Icon[".fas.fa-plus"] + '</button>-->
                dl = '        <dl class="do" id="' + documentInReplyTo + '"><dt>In Reply To</dt><dd><input contenteditable="false" name="in-reply-to" placeholder="https://example.net/article" type="text" value="" /></dd></dl>';
                insertDocumentLevelHTML(document, dl, { 'id': documentInReplyTo });

                //XXX: Same as above comment about workaround for setEditSelections
                var dIRT = document.querySelector('#' + documentInReplyTo + ' input');
                dIRT.addEventListener('blur', function(e){
                  dIRT.setAttribute('value', dI.value);
                });
              }
            }
          }
          else if (e && e.target.closest('button.editor-disable')) {
            setEditSelections();
          }

          //XXX: This should be perhaps limited to certain nodes?
          document.querySelectorAll('.do').forEach(function(node){
            node.setAttribute('contenteditable', 'false');
          })

          return DO.U.Editor.MediumEditor;
        }
      },

      Button: (function () {
        if (typeof MediumEditor !== 'undefined') {
          MediumEditor.extensions.button.prototype.defaults.unorderedlist.contentFA = Icon[".fas.fa-link-ul"];

          MediumEditor.extensions.button.prototype.defaults.orderedlist.contentFA = Icon[".fas.fa-link-ol"];

          MediumEditor.extensions.button.prototype.defaults.image.contentFA = Icon[".fas.fa-image"];

          MediumEditor.extensions.button.prototype.defaults.pre.contentFA = Icon[".fas.fa-code"];

          return MediumEditor.extensions.button.extend({
            init: function () {
              this.name = this.label;
              // this.action = this.action;
              this.aria = this.label;
              this.tagNames = [this.action];
              this.useQueryState = true;
              this.contentDefault = '<b>' + this.label + '</b>';

              switch(this.action) {
                case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': this.contentFA = Icon[".fas.fa-header"] + parseInt(this.action.slice(-1)); break;

                case 'em': this.contentFA = Icon[".fas.fa-italic"]; break;

                case 'strong': this.contentFA = Icon[".fas.fa-bold"]; break;

                case 'image': this.contentFA = Icon[".fas.fa-image"]; break;

                case 'q': this.contentFA = Icon[".fas.fa-quote-right"]; break;

                case 'math': this.contentFA = Icon[".fas.fa-calculator"]; break;
                default: break;
              }

              this.button = this.createButton();
              this.on(this.button, 'click', this.handleClick.bind(this));

              //TODO: Listen to section hX changes and update section @id and span @class do.fragment
            },

            // getButton: function() {
            //   console.log('DO.U.Editor.Button.Note.getButton()');
            //   return this.button;
            // },

            handleClick: function(event) { //, editable
        //console.log('DO.U.Editor.Button.handleClick()');
// console.log(this);
              event.preventDefault();
              event.stopPropagation();

              var action = this.getAction();
              var tagNames = this.getTagNames();
              var button = this.getButton();

              if (this.isActive()) {
                return this.base.execAction('removeFormat');
              }
              else {
                var datetime = ' ' + DO.U.createAttributeDateTime(this.action);

                this.base.selectedDocument = this.document;
                this.base.selection = MediumEditor.selection.getSelectionHtml(this.base.selectedDocument);
                //.replace(DO.C.Editor.regexEmptyHTMLTags, '');
// console.log('this.base.selection:');
// console.log(this.base.selection);

                var selectedParentElement = this.base.getSelectedParentElement();
// console.log('getSelectedParentElement:');
// console.log(selectedParentElement);
                var parentSection = MediumEditor.util.getClosestTag(selectedParentElement, 'section');
// console.log(parentSection);

                //XXX: DO NOT REMOVE. Saving the selection should be before inserting/updating HTML.
                this.base.saveSelection();

                switch(this.action) {
                  case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
                    //XXX: Which heading level are we at?
                    var parentSectionHeading = '';
                    for (var i = 0; i < parentSection.childNodes.length; i++) {
                      parentSectionHeading = parentSection.childNodes[i].nodeName.toLowerCase();
                      if(DO.C.Editor.headings.indexOf(parentSectionHeading) > 0) {
// console.log(parentSectionHeading);
                        break;
                      }
                    }
                    var pSH = parseInt(parentSectionHeading.slice(-1));

                    //XXX: Which heading level is the action?
                    var cSH = parseInt(this.action.slice(-1));
// console.log("parentH: " + pSH);
// console.log("currentH: " + cSH);
// console.log(cSH-pSH);

                    var closePreviousSections = '';
                    // if (cSH > pSH) {}
                    for (i = 0; i <= (pSH-cSH); i++) {
                      console.log("i: " + i);
                      closePreviousSections += '</div></section>';
                    }
// console.log(closePreviousSections);
// console.log(this.base.selection);
// var doc = this.document;
                    var selection = window.getSelection();
// console.log(this.base.selection);
// console.log(selection);

                    if (selection.rangeCount) {
                      // FIXME: Seem ununsed. Remove later. 
                      // range = selection.getRangeAt(0);
                      // parent = selectedParentElement;

// console.log(range);
                      //Section
                      var sectionId = generateAttributeId(null, this.base.selection);
                      var section = document.createElement('section');
                      section.id = sectionId;
                      section.setAttribute('rel', 'schema:hasPart');
                      section.setAttribute('resource', '#' + sectionId);
// console.log(section);


                      //Heading
                      var heading = document.createElement(tagNames[0]);
                      heading.setAttribute('property', 'schema:name');
                      heading.innerHTML = this.base.selection;
// console.log(heading);
// console.log(selection);


                      var divDescription = parentSection.getElementsByTagName('div')[0];
// console.log(divDescription);
// console.log(divDescription.innerHTML);
// console.log(divDescription.childNodes);
// console.log(divDescription.length);
// console.log(selectedParentElement);
// console.log(selectedParentElement.childNodes);
// console.log(selectedParentElement.lastChild);
// console.log(selectedParentElement.lastChild.length);

                      r = selection.getRangeAt(0);
// console.log(r);
// console.log(r.startContainer);
// console.log(r.startOffset);
// console.log(r.endOffset);
                      //Remaining nodes
                      var r = document.createRange();
                      r.setStart(selection.focusNode, selection.focusOffset);
                      r.setEnd(selectedParentElement.lastChild, selectedParentElement.lastChild.length);
// console.log(r.commonAncestorContainer.nodeType);

// console.log(r.startContainer);
// console.log(r.endContainer);
// console.log(selection.anchorNode);
// selection.removeAllRanges(); //XXX: is this doing anything?
// selection.addRange(r);

// console.log(selection.anchorNode);
                      var fragment = r.extractContents();
// console.log(fragment);
// console.log(selection);
// r = selection.getRangeAt(0);
// console.log(r);
// console.log(r.startContainer);
// console.log(r.startOffset);
// console.log(r.endOffset);
                      if (fragment.firstChild.nodeType === 3) {
                        //TODO: trim only if there is one child which is a textnode
                        // fragment.firstChild.nodeValue = fragment.firstChild.nodeValue.trim();

// console.log(fragment);
                        var sPE = selectedParentElement.nodeName.toLowerCase();
                        switch(sPE) {
                          case "p": default:
                            var xSPE = document.createElement(sPE);
                            xSPE.appendChild(fragment.cloneNode(true));
                            fragment = fragmentFromString(xSPE.outerHTML);
                            break;
                          //TODO: Other cases?
                        }
                      }
// console.log(fragment);
// console.log(selection);

                      r = selection.getRangeAt(0);
// console.log(r);
// console.log(r.startContainer);
// console.log(r.startOffset);
// console.log(r.endOffset);
// var remainingNodes = document.createElement('div');
// remainingNodes.appendChild(fragment.cloneNode(true));
// console.log(remainingNodes);


                      //Description
                      var div = document.createElement('div');
                      div.setAttribute('property', 'schema:description');
                      div.appendChild(fragment.cloneNode(true));

                      //Put it together
                      section.appendChild(heading);
                      section.appendChild(div);
// console.log(range.startContainer);

                      var selectionUpdated = document.createElement('div');
                      selectionUpdated.appendChild(section);
                      selectionUpdated = selectionUpdated.innerHTML;
// console.log(selectionUpdated);
// range.deleteContents();
// MediumEditor.util.insertHTMLCommand(this.document, closePreviousSections);
// MediumEditor.extensions.paste(closePreviousSections);

                      //Sub-section
                      if (cSH-pSH > 0) {
                        MediumEditor.util.insertHTMLCommand(this.base.selectedDocument, selectionUpdated);

                        // This doesn't seem to be needed anymore?
                        // MediumEditor.selection.select(this.base.selectedDocument, heading, 0);
                      }
                      else {
// console.log(selection);
// console.log(parentSection);
                        MediumEditor.selection.selectNode(parentSection, document);
                        r = selection.getRangeAt(0);
// console.log(r);
// console.log(r.startOffset);
// console.log(r.endOffset);


                        //This selection is based off previous operations; handling remaining Nodes after the selection. So, this is not accurate per se.. the range might be accurate.
                        selection = window.getSelection();
// console.log(selection);
                        r = selection.getRangeAt(0);
// console.log(r);
// console.log(r.startOffset);
// console.log(r.endOffset);


                        r = document.createRange();
                        r.setStartAfter(parentSection);
// console.log(r);
                        r.setEndAfter(parentSection);
// console.log(r);
                        r.collapse(true);
                        selection.removeAllRanges();
                        selection.addRange(r);
// console.log(selection);
                        var foo = document.createElement('div');
                        foo.appendChild(parentSection);
                        parentSection = foo.innerHTML;
// console.log(parentSection + selectionUpdated);
                        MediumEditor.util.insertHTMLCommand(this.base.selectedDocument, parentSection + selectionUpdated);

                        // MediumEditor.selection.select(this.base.selectedDocument, heading, 0);
                        // parentSection.parentNode.insertBefore(section, parentSection.nextSibling);
                      }
                    }

                    this.base.restoreSelection();
                    this.base.checkSelection();
                    break;

                  case 'math':
                    var QUEUE = window.MathJax.Hub.Queue;  // shorthand for the queue
                    var math = null;                // the element jax for the math output.

                    selection = this.base.selection;

                    var selectionId = generateAttributeId();

                    selectionUpdated = '<span id="' + selectionId + '">$$</span>';

                    MediumEditor.util.insertHTMLCommand(this.base.selectedDocument, selectionUpdated);

                    window.MathJax.Hub.Queue(["Typeset", window.MathJax.Hub, selectionId]);
                    math = window.MathJax.Hub.getAllJax(selectionId)[0];
                    window.MathJax.Hub.Queue(["Text", math, selection]);

                    MediumEditor.selection.selectNode(document.getElementById(selectionId), document);
                    break;

                  //XXX: This is used for non-built-in buttons
                  default:
                    selectionUpdated = '<' + tagNames[0] + datetime + '>' + this.base.selection + '</' + tagNames[0] + '>';

                    if (this.action == 'image') {
                      var imgOptions = this.base.selection.split("|");

                      var src = imgOptions[0];
                      var alt = '';
                      var width = '';
                      var height = '';

                      //https://example/foo.jpg|figure|480x320|Hello world
                      switch (imgOptions.length) {
                        case 1: default:
                          src = imgOptions[0];
                          break;

                        case 2:
                          alt = imgOptions[1];
                          break;

                        case 3:
                          width = ' width="' + imgOptions[1] + '"';
                          var widthHeight = imgOptions[1].split('x');

                          if (widthHeight.length == 2) {
                            width = ' width="' + widthHeight[0] + '"';
                            height = ' height="' + widthHeight[1] + '"';
                          }

                          alt = imgOptions[2];
                          break;

                        case 4:
                          var figure = imgOptions[1];
                          //if imgOptions[1] == 'figure'

                          width = ' width="' + imgOptions[2] + '"';
                          widthHeight = imgOptions[2].split('x');

                          if (widthHeight.length == 2) {
                            width = ' width="' + widthHeight[0] + '"';
                            height = ' height="' + widthHeight[1] + '"';
                          }

                          alt = imgOptions[3];
                          break;
                      }

                      selectionUpdated = '<img alt="'+ alt +'"' + height + ' src="' + src + '"' + width + ' />';
                      if (imgOptions.length == 4) {
                        selectionUpdated = '<figure>' + selectionUpdated + '<figcaption>' + alt + '</figcaption></figure>';
                      }
                    }

                    MediumEditor.util.insertHTMLCommand(this.base.selectedDocument, selectionUpdated);
                    this.base.restoreSelection();
                    this.base.checkSelection();

                    break;
                }

                this.setActive();
              }
            }
          });
        }
      })(),

      //Adapted from MediumEditor's Anchor Form
      Note: (function() {
        if (typeof MediumEditor !== 'undefined') {
          return MediumEditor.extensions.form.extend({
            /* Textarea Form Options */

            /* customClassOption: [string]  (previously options.anchorButton + options.anchorButtonClass)
             * Custom class name the user can optionally have added to their created links (ie 'button').
             * If passed as a non-empty string, a checkbox will be displayed allowing the user to choose
             * whether to have the class added to the created link or not.
             */
            customClassOption: null,

            /* customClassOptionText: [string]
             * text to be shown in the checkbox when the __customClassOption__ is being used.
             */
            customClassOptionText: 'Button',

            /* linkValidation: [boolean]  (previously options.checkLinkFormat)
             * enables/disables check for common URL protocols on anchor links.
             */
            linkValidation: false,

            /* placeholderText: [string]  (previously options.anchorInputPlaceholder)
             * text to be shown as placeholder of the anchor input.
             */
            placeholderText: "What’s up?",

            /* targetCheckbox: [boolean]  (previously options.anchorTarget)
             * enables/disables displaying a "Open in new window" checkbox, which when checked
             * changes the `target` attribute of the created link.
             */
            targetCheckbox: false,

            /* targetCheckboxText: [string]  (previously options.anchorInputCheckboxLabel)
             * text to be shown in the checkbox enabled via the __targetCheckbox__ option.
             */
            targetCheckboxText: 'Open in new window',

            // Options for the Button base class
            // name: this.name,
            // action: 'createLink',
            // aria: 'link',
            // tagNames: ['a'],
            // contentDefault: '<b>#</b>',
            // contentFA: '<i class="fa fa-sticky-note"></i>',

            init: function () {
              this.name = this.label;
              // this.action = this.action;
              this.aria = this.label;
              this.tagNames = [this.action];
              this.useQueryState = true;
              this.contentDefault = '<b>' + this.label + '</b>';
              this.signInRequired = false;

              switch(this.action) {
                case 'cite': default:
                  this.contentFA = Icon[".fas.fa-hashtag"];
                  break;
                case 'article':
                  this.contentFA = Icon[".fas.fa-sticky-note"];
                  this.signInRequired = true;
                  break;
                case 'note':
                  this.contentFA = Icon[".fas.fa-sticky-note"];
                  break;
                case 'rdfa':
                  this.contentFA = Icon[".fas.fa-rocket"];
                  break;
                case 'selector':
                  this.contentFA = Icon[".fas.fa-anchor"];
                  break;
                case 'bookmark':
                  this.contentFA = Icon[".fas.fa-bookmark"];
                  this.signInRequired = true;
                  break;
                case 'share':
                  this.contentFA = Icon[".fas.fa-bullhorn"];
                  this.signInRequired = true;
                  break;
                case 'approve':
                  this.contentFA = Icon[".fas.fa-thumbs-up"];
                  this.signInRequired = true;
                  break;
                case 'disapprove':
                  this.contentFA = Icon[".fas.fa-thumbs-down"];
                  this.signInRequired = true;
                  break;
                case 'specificity':
                  this.contentFA = Icon[".fas.fa-crosshairs"];
                  this.signInRequired = true;
                  break;
                case 'sparkline':
                  this.contentFA = Icon[".fas.fa-chart-line"];
                  break;
              }
              MediumEditor.extensions.form.prototype.init.apply(this, arguments);

        //TODO: Change this bind key
        //      this.subscribe('editableKeydown', this.handleKeydown.bind(this));
        //      this.on(this.button, 'click', this.handleClick.bind(this));
            },

            // Called when the button the toolbar is clicked
            // Overrides ButtonExtension.handleClick
            handleClick: function (event) {
              event.preventDefault();
              event.stopPropagation();
              var _this = this;
              var showAction = function() {
                switch(_this.action) {
                  default:
                    var range = MediumEditor.selection.getSelectionRange(_this.document);

                    if (range.startContainer.nodeName.toLowerCase() === 'a' ||
                      range.endContainer.nodeName.toLowerCase() === 'a' ||
                      MediumEditor.util.getClosestTag(MediumEditor.selection.getSelectedParentElement(range), 'a')) {
                      return _this.execAction('unlink');
                    }

                    if (DO.U.Editor.MediumEditor.options.id == 'social' && _this.action == 'selector'){
                      var opts = {
                        license: 'https://creativecommons.org/licenses/by/4.0/',
                        content: 'Liked'
                      }
                      _this.completeFormSave(opts);
                    }
                    else if (!_this.isDisplayed()) {
                      _this.showForm();
                    }
                    break;

                  case 'share':
                    _this.base.restoreSelection();
                    var resourceIRI = DO.C.DocumentURL;
                    var node = _this.base.getSelectedParentElement().closest('[id]');
                    resourceIRI = (node && node.id) ? resourceIRI + '#' + node.id : resourceIRI;
                    _this.window.getSelection().removeAllRanges();
                    _this.base.checkSelection();
                    DO.U.shareResource(null, resourceIRI);
                    break;
                }
              };

              var updateAnnotationServiceForm = function() {
                var annotationServices = document.querySelectorAll('.annotation-location-selection');
                for (var i = 0; i < annotationServices.length; i++) {
                  annotationServices[i].innerHTML = getAnnotationLocationHTML();
                }
              };

              var updateAnnotationInboxForm = function() {
                var annotationInbox = document.querySelectorAll('.annotation-inbox');
                for (var i = 0; i < annotationInbox.length; i++) {
                  annotationInbox[i].innerHTML = getAnnotationInboxLocationHTML();
                }
              };

              updateAnnotationInboxForm();

              return getLinkRelation(DO.C.Vocab['oaannotationService']['@id'], null, getDocument()).then(
                function(url) {
                  DO.C.AnnotationService = url[0];
                  updateAnnotationServiceForm();
                  showAction();
                },
                function(reason) {
                  if(_this.signInRequired && !DO.C.User.IRI) {
                    showUserIdentityInput();
                  }
                  else {
                    updateAnnotationServiceForm();
                    showAction();
                  }
                }
              );
            },

            // Called when user hits the defined shortcut (CTRL / COMMAND + K)
            handleKeydown: function (event) {
              if (MediumEditor.util.isKey(event, MediumEditor.util.keyCode.K) && MediumEditor.util.isMetaCtrlKey(event) && !event.shiftKey) {
                this.handleClick(event);
              }
            },

            // Called by medium-editor to append form to the toolbar
            getForm: function () {
              if (!this.form) {
                this.form = this.createForm();
              }
              return this.form;
            },

            getTemplate: function () {
              var tmpl = [];
              switch(this.action) {
                case 'rdfa':
                  tmpl = [
                  '<label for="rdfa-about">about</label><input id="rdfa-about" class="medium-editor-toolbar-input" placeholder="https://example.org/foo#bar" /><br/>',
                  '<label for="rdfa-resource">resource</label><input id="rdfa-resource" class="medium-editor-toolbar-input" placeholder="https://example.net/baz" /><br/>',
                  '<label for="rdfa-typeof">typeof</label><input id="rdfa-typeof" class="medium-editor-toolbar-input" placeholder="https://example.net/baz" /><br/>',
                  '<label for="rdfa-rel">rel</label><input id="rdfa-rel" class="medium-editor-toolbar-input" placeholder="schema:url"><br/>',
                  '<label for="rdfa-property">property</label><input id="rdfa-property" class="medium-editor-toolbar-input" placeholder="schema:name" /><br/>',
                  '<label for="rdfa-href">href</label><input id="rdfa-href" class="medium-editor-toolbar-input" placeholder="https://example.net/baz" /><br/>',
                  '<label for="rdfa-content">content</label><input id="rdfa-content" class="medium-editor-toolbar-input" placeholder="Baz" /><br/>',
                  '<label for="rdfa-language">language</label><input id="rdfa-language" class="medium-editor-toolbar-input" placeholder="en" /><br/>',
                  '<label for="rdfa-datatype">datatype</label><input id="rdfa-datatype" class="medium-editor-toolbar-input" placeholder="https://example.net/baz" /><br/>'
                  ];
                  break;
                case 'article':
                  tmpl = [
                  '<label for="bookmark-tagging">Tags</label> <input id="bookmark-tagging" class="medium-editor-toolbar-input" placeholder="Separate tags with commas" /><br/>',
                  '<textarea id="article-content" name="content" cols="20" rows="5" class="medium-editor-toolbar-textarea" placeholder="', this.placeholderText, '"></textarea>',
                  '<select id="article-language" name="language" class="medium-editor-toolbar-select">', getLanguageOptionsHTML(), '</select>',
                  '<select id="article-license" name="license" class="medium-editor-toolbar-select">',
                  getLicenseOptionsHTML(),
                  '</select>',
                  '<span class="annotation-location-selection">' + getAnnotationLocationHTML() + '</span>',
                  '<span class="annotation-inbox">' + getAnnotationInboxLocationHTML() + '</span>'
                  ];
                  break;
                case 'note':
                  tmpl = [
                  '<label for="bookmark-tagging">Tags</label> <input id="bookmark-tagging" class="medium-editor-toolbar-input" placeholder="Separate tags with commas" /><br/>',
                  '<textarea id="article-content" name="content" cols="20" rows="1" class="medium-editor-toolbar-textarea" placeholder="', this.placeholderText, '"></textarea>',
                  '<select id="article-language" name="language" class="medium-editor-toolbar-select">', getLanguageOptionsHTML(), '</select>',
                  '<select id="article-license" name="license" class="medium-editor-toolbar-select">',
                  getLicenseOptionsHTML(),
                  '</select>'
                  ];
                  break;
                case 'approve':
                  tmpl = [
                  '<label for="bookmark-tagging">Tags</label> <input id="bookmark-tagging" class="medium-editor-toolbar-input" placeholder="Separate tags with commas" /><br/>',
                  '<textarea id="approve-content" name="content" cols="20" rows="2" class="medium-editor-toolbar-textarea" placeholder="Strong point? Convincing argument?"></textarea>',
                  '<select id="article-language" name="language" class="medium-editor-toolbar-select">', getLanguageOptionsHTML(), '</select>',
                  '<select id="approve-license" name="license" class="medium-editor-toolbar-select">',
                  getLicenseOptionsHTML(),
                  '</select>',
                  '<span class="annotation-location-selection">' + getAnnotationLocationHTML() + '</span>',
                  '<span class="annotation-inbox">' + getAnnotationInboxLocationHTML() + '</span>'
                  ];
                  break;
                case 'disapprove':
                  tmpl = [
                  '<label for="bookmark-tagging">Tags</label> <input id="bookmark-tagging" class="medium-editor-toolbar-input" placeholder="Separate tags with commas" /><br/>',
                  '<textarea id="disapprove-content" name="content" cols="20" rows="2" class="medium-editor-toolbar-textarea" placeholder="Weak point? Error? Inaccurate?"></textarea>',
                  '<select id="article-language" name="language" class="medium-editor-toolbar-select">', getLanguageOptionsHTML(), '</select>',
                  '<select id="disapprove-license" name="license" class="medium-editor-toolbar-select">',
                  getLicenseOptionsHTML(),
                  '</select>',
                  '<span class="annotation-location-selection">' + getAnnotationLocationHTML() + '</span>',
                  '<span class="annotation-inbox">' + getAnnotationInboxLocationHTML() + '</span>'
                  ];
                  break;
                case 'specificity':
                  tmpl = [
                  '<label for="bookmark-tagging">Tags</label> <input id="bookmark-tagging" class="medium-editor-toolbar-input" placeholder="Separate tags with commas" /><br/>',
                  '<textarea id="specificity-content" name="content" cols="20" rows="2" class="medium-editor-toolbar-textarea" placeholder="Citation or specificity needed?"></textarea>',
                  '<select id="article-language" name="language" class="medium-editor-toolbar-select">', getLanguageOptionsHTML(), '</select>',
                  '<select id="specificity-license" name="license" class="medium-editor-toolbar-select">',
                  getLicenseOptionsHTML(),
                  '</select>',
                  '<span class="annotation-location-selection">' + getAnnotationLocationHTML() + '</span>',
                  '<span class="annotation-inbox">' + getAnnotationInboxLocationHTML() + '</span>'
                  ];
                  break;
                case 'cite':
                  tmpl = [
                  '<input type="text" name="specref-search" value="" id="specref-search" class="medium-editor-toolbar-input" placeholder="Enter terms to search for specifications" />',
                  '<input type="submit" name="specref-search-submit" value="Search" id="specref-search-submit" />',
                  '<div class="specref-search-results"></div>',
                  '<input type="radio" name="citation-type" value="ref-footnote" id="ref-footnote" /> <label for="ref-footnote">Footnote</label>',
                  '<input type="radio" name="citation-type" value="ref-reference" id="ref-reference" /> <label for="ref-reference">Reference</label>',
                  '<select id="citation-relation" name="citation-relation" class="medium-editor-toolbar-select">',
                  getCitationOptionsHTML(),
                  '</select>',
                  '<input type="text" name="citation-url" value="" id="citation-url" class="medium-editor-toolbar-input" placeholder="http://example.org/article#results" />',
                  '<textarea id="citation-content" cols="20" rows="1" class="medium-editor-toolbar-textarea" placeholder="', this.placeholderText, '"></textarea>',
                  '<select id="article-language" name="language" class="medium-editor-toolbar-select">', getLanguageOptionsHTML(), '</select>',
                  ];
                  break;
                case 'bookmark':
                  tmpl = [
                  '<label for="bookmark-tagging">Tags</label> <input id="bookmark-tagging" class="medium-editor-toolbar-input" placeholder="Separate tags with commas" /><br/>',
                  '<textarea id="bookmark-content" name="content" cols="20" rows="2" class="medium-editor-toolbar-textarea" placeholder="Description"></textarea>',
                  '<select id="article-language" name="language" class="medium-editor-toolbar-select">', getLanguageOptionsHTML(), '</select>',
                  '<select id="bookmark-license" name="license" class="medium-editor-toolbar-select">',
                  getLicenseOptionsHTML(),
                  '</select>'
                  ];
                  break;
                case 'sparkline':
                  tmpl = [
                  '<input type="text" name="sparkline-search" value="" id="sparkline-search" class="medium-editor-toolbar-input" placeholder="Enter search terms" /><br/>',
                  '<input type="hidden" name="sparkline-selection-dataset" value="" id="sparkline-selection-dataset" />',
                  '<input type="hidden" name="sparkline-selection-refarea" value="" id="sparkline-selection-refarea" />'
                  ];
                  break;
                default:
                  tmpl = [
                  '<textarea cols="20" rows="1" class="medium-editor-toolbar-textarea" placeholder="', this.placeholderText, '"></textarea>'
                  ];
                  break;
              }

              tmpl.push(
                '<a href="#" class="medium-editor-toolbar-save" title="Save">',
                this.getEditorOption('buttonLabels') === 'fontawesome' ? Icon[".fas.fa-check"] : this.formSaveLabel,
                '</a>'
              );

              tmpl.push(
                '<a href="#" class="medium-editor-toolbar-close" title="Close">',
                this.getEditorOption('buttonLabels') === 'fontawesome' ? Icon[".fas.fa-times"] : this.formCloseLabel,
                '</a>'
              );

              // both of these options are slightly moot with the ability to
              // override the various form buildup/serialize functions.

              if (this.targetCheckbox) {
                // fixme: ideally, this targetCheckboxText would be a formLabel too,
                // figure out how to deprecate? also consider `fa-` icon default implcations.
                tmpl.push(
                  '<div class="medium-editor-toolbar-form-row">',
                  '<input type="checkbox" class="medium-editor-toolbar-textarea-target">',
                  '<label>',
                  this.targetCheckboxText,
                  '</label>',
                  '</div>'
                );
              }

              if (this.customClassOption) {
                // fixme: expose this `Button` text as a formLabel property, too
                // and provide similar access to a `fa-` icon default.
                tmpl.push(
                  '<div class="medium-editor-toolbar-form-row">',
                  '<input type="checkbox" class="medium-editor-toolbar-textarea-button">',
                  '<label>',
                  this.customClassOptionText,
                  '</label>',
                  '</div>'
                );
              }

              return tmpl.join('');

            },

            // Used by medium-editor when the default toolbar is to be displayed
            isDisplayed: function () {
              return this.getForm().style.display === 'block';
            },

            hideForm: function () {
              this.getForm().style.display = 'none';
              this.getInput().value = '';
            },

            showForm: function (opts) {
              var _this = this;
              var input = this.getInput(),
                targetCheckbox = this.getAnchorTargetCheckbox(),
                buttonCheckbox = this.getAnchorButtonCheckbox();

              opts = opts || { url: '' };
              // TODO: This is for backwards compatability
              // We don't need to support the 'string' argument in 6.0.0
              if (typeof opts === 'string') {
                opts = {
                  url: opts
                };
              }

              var initialSelectedParentElement = this.base.getSelectedParentElement();
              var initialSelectionState = MediumEditor.selection.exportSelection(initialSelectedParentElement, this.document);

              //XXX: Get this before getForm.
              var selection = MediumEditor.selection.getSelectionHtml(this.document).trim();
              this.base.saveSelection();
              this.hideToolbarDefaultActions();
              var form = this.getForm();
              form.style.display = 'block';
              this.setToolbarPosition();

              input.value = opts.url;

              switch(this.action) {
                case 'rdfa':
                  input.about.focus();
                  break;
                case 'article': case 'note': case 'approve': case 'disapprove': case 'specificity':
                  input.content.focus();
                  break;
                case 'cite':
                  input.search.focus();
                  input.search.value = selection;

                  var specrefSearchResults = document.querySelector('.specref-search-results');
                  if(specrefSearchResults) {
                    specrefSearchResults.innerHTML = '';
                  }

                  var specref = document.querySelector('#specref-search-submit');
                  specref.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
// console.log(e);

                    var keyword = input.search.value.trim();
                    var url = 'https://api.specref.org/search-refs?q=' + keyword;
                    var headers = {'Accept': 'application/json'};
                    var options = {'noCredentials': true};

                    getResource(url, headers, options).then(response => {
                      // console.log(response);
                      return response.text();
                    }).then(data => {
                      data = JSON.parse(data);
// console.log(data);

                      var searchResultsHTML = '';
                      var searchResultsItems = [];

                      var href, title, publisher, date, status;

                      //TODO: Clean input data

                      Object.keys(data).forEach(function(key) {
// console.log(data[key])
                        if ('href' in data[key] &&
                            !('aliasOf' in data[key]) && !('versionOf' in data[key]) &&

                          //fugly WG21
                            (!('publisher' in data[key]) || ((data[key].publisher.toLowerCase() != 'wg21') || ((data[key].href.startsWith('https://wg21.link/n') || data[key].href.startsWith('https://wg21.link/p') || data[key].href.startsWith('https://wg21.link/std')) && !data[key].href.endsWith('.yaml') && !data[key].href.endsWith('/issue') && !data[key].href.endsWith('/github') && !data[key].href.endsWith('/paper'))))

                            ) {

                          href = data[key].href;
                          title = data[key].title || href;
                          publisher = data[key].publisher || '';
                          date = data[key].date || '';
                          status = data[key].status || '';

                          if (publisher) {
                            publisher = '. ' + publisher;
                          }
                          if (date) {
                            date = '. ' + date;
                          }
                          if (status) {
                            status = '. ' + status;
                          }

                          searchResultsItems.push('<li><input type="radio" name="specref-item" value="' + key + '" id="ref-' + key + '" /> <label for="ref-' + key + '"><a href="' + href + '" target="_blank">' + title + '</a>' + publisher + date + status + '</label></li>');
                        }
                      });

                      searchResultsHTML = '<ul>' + searchResultsItems.join('') + '</ul>';

                      if (searchResultsItems) {
                        specrefSearchResults = document.querySelector('.specref-search-results');
                        if(specrefSearchResults) {
                          specrefSearchResults.innerHTML = searchResultsHTML;
                        }

                        //XXX: Assigning 'change' action to ul because it gets removed when there is a new search result / replaced. Perhaps it'd be nicer (but more expensive?) to destroy/create .specref-search-results node?
                        specrefSearchResults.querySelector('ul').addEventListener('change', function(e){
                          var checkedCheckbox = e.target.closest('input');
                          if (checkedCheckbox) {
// console.log(e.target);
                            document.querySelector('#citation-url').value = data[checkedCheckbox.value].href;
                          }
                        });
                      }
                    });

                  });

                  input.url.focus();
                  document.querySelector('.medium-editor-toolbar-form input[name="citation-type"]').checked = true;
                  break;
                case 'sparkline':
                  input.search.focus();
                  input.search.value = selection;

                  var inputSearch = function(e){
                    if(e.which == 13) {
                      e.preventDefault();
                      e.stopPropagation();
                      _this.base.restoreSelection();
                      MediumEditor.util.insertHTMLCommand(document, e.target.value);
                      var selection = { start: initialSelectionState.start, end: (initialSelectionState.start + e.target.value.length) };
                      MediumEditor.selection.importSelection(selection, initialSelectedParentElement, document);
                      _this.base.checkSelection();
                      e.target.setAttribute('data-event-keyup-enter', true);
                      _this.showForm();
                      return;
                    }
                  }
                  if(!input.search.getAttribute('data-event-keyup-enter')) {
                    input.search.addEventListener('keyup', inputSearch, false);
                  }

                  var sparqlEndpoint = 'http://worldbank.270a.info/';
                  var resourceType = '<http://purl.org/linked-data/cube#DataSet>';
                  var sparklineGraphId = 'sparkline-graph';
                  var resultContainerId = 'sparkline-select';
                  //TODO: This should be from user's preference?
                  var lang = 'en';

                  //TODO: What's the best way for user input? ' of '
                  var textInputA = selection.split(' of ')[0];
                  var textInputB = selection.substr(selection.indexOf(' of ') + 4);

                  if(!DO.C.RefAreas[textInputB.toUpperCase()]) {
                    Object.keys(DO.C.RefAreas).forEach(function(key) {
                      if(DO.C.RefAreas[key].toLowerCase() == textInputB.toLowerCase()) {
                        textInputB = key;
                      }
                    });
                  }

                  var sG = document.getElementById(sparklineGraphId);
                  if(sG) {
                    sG.parentNode.removeChild(sG);
                  }

                  if(!DO.C.RefAreas[textInputB.toUpperCase()]) {
                    var refAreas;
                    Object.keys(DO.C.RefAreas).forEach(function(key) {
                      refAreas += '<option value="' + key + '">' + key + ' - ' + DO.C.RefAreas[key] + '</option>';
                    });
                    form.querySelector('.medium-editor-toolbar-save').insertAdjacentHTML('beforebegin', '<div id="' + sparklineGraphId + '">`' + textInputB + '` is not available. Try: ' + '<select name="refAreas"><option>Select a reference area</option>' + refAreas + '</select></div>');
                    var rA = document.querySelector('#' + sparklineGraphId + ' select[name="refAreas"]');
                    rA.addEventListener('change', function(e) {
                      e.preventDefault();
                      e.stopPropagation();
                      textInputB = e.target.value;
                      input.search.value = textInputA + ' of ' + textInputB;
                      form.querySelector('#sparkline-selection-dataset').value = textInputA;
                      form.querySelector('#sparkline-selection-refarea').value = textInputB;

                      _this.base.restoreSelection();
                      MediumEditor.util.insertHTMLCommand(document, input.search.value);
                      var selection = { start: initialSelectionState.start, end: (initialSelectionState.start + input.search.value.length) };
                      MediumEditor.selection.importSelection(selection, initialSelectedParentElement, document);
                      _this.base.checkSelection();
                      _this.showForm();
                    });
                    return;
                  }

                  var options = {};
                  options.filter = {
                    dimensionProperty: 'sdmx-dimension:refArea',
                    dimensionRefAreaNotation: textInputB
                  };
                  options.optional = { prefLabels: ["dcterms:title"] };

                  var queryURL = DO.U.SPARQLQueryURL.getResourcesOfTypeWithLabel(sparqlEndpoint, resourceType, textInputA.toLowerCase(), options);

                  queryURL = getProxyableIRI(queryURL);

                  form.querySelector('.medium-editor-toolbar-save').insertAdjacentHTML('beforebegin', '<div id="' + sparklineGraphId + '"></div>' + Icon[".fas.fa-circle-notch.fa-spin.fa-fw"]);
                  sG = document.getElementById(sparklineGraphId);

                  getResourceGraph(queryURL)
                    .then(function(g){
                      sG.removeAttribute('class');
                      var triples = sortGraphTriples(g.graph(), { sortBy: 'object' });
                      return DO.U.getListHTMLFromTriples(triples, {element: 'select', elementId: resultContainerId});
                    })
                    .then(function(listHTML){
                      sG.innerHTML = listHTML;
                      form.removeChild(form.querySelector('.fas.fa-circle-notch.fa-spin.fa-fw'));
                    })
                    .then(function(x){
                      var rC = document.getElementById(resultContainerId);
                      rC.addEventListener('change', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        var sparkline = sG.querySelectorAll('.sparkline, .sparkline-info');
                        for (var i = 0; i < sparkline.length; i++) {
                          sparkline[i].parentNode.removeChild(sparkline[i]);
                        }
                        form.querySelector('.medium-editor-toolbar-save').insertAdjacentHTML('beforebegin', Icon[".fas.fa-circle-notch.fa-spin.fa-fw"]);

                        var dataset = e.target.value;
                        var title = e.target.querySelector('*[value="' + e.target.value + '"]').textContent.trim();
                        //XXX: Should this replace the initial search term?
                        form.querySelector('#sparkline-selection-dataset').value = title;
                        form.querySelector('#sparkline-selection-refarea').value = textInputB.toUpperCase();

                        var refArea = textInputB.toUpperCase();
                        var paramDimension = "\n\
  ?propertyRefArea rdfs:subPropertyOf* sdmx-dimension:refArea .\n\
  ?observation ?propertyRefArea [ skos:notation '" + refArea + "' ] .";

// console.log(dataset);
// console.log(refArea);
                        var queryURL = DO.U.SPARQLQueryURL.getObservationsWithDimension(sparqlEndpoint, dataset, paramDimension);
// console.log(queryURL);
                        queryURL = getProxyableIRI(queryURL);

                        getResourceGraph(queryURL)
                          .then(function(g){
                            var triples = sortGraphTriples(g.graph(), { sortBy: 'object' });
                            
                            g = g.graph().toArray();
// console.log(triples);
                            if(triples.length > 0) {
                              var observations = {};
                              triples.forEach(function(t){
                                var s = t.subject.nominalValue;
                                var p = t.predicate.nominalValue;
                                var o = t.object.nominalValue;
                                observations[s] = observations[s] || {};
                                observations[s][p] = o;
                              });
// console.log(observations);
                              var list = [], item;
                              Object.keys(observations).forEach(function(key) {
                                item = {};
                                observations[key]['http://purl.org/linked-data/cube#Observation'] = key;
                                item[key] = observations[key];
                                list.push(item[key]);
                              });
                              var sortByKey = 'http://purl.org/linked-data/sdmx/2009/dimension#refPeriod';
                              list.sort(function (a, b) {
                                return a[sortByKey].toLowerCase().localeCompare(b[sortByKey].toLowerCase());
                              });
// console.log(list);
                              var options = {
                                url: dataset,
                                title: title
                              };
                              var sparkline = DO.U.getSparkline(list, options);
                              sG.insertAdjacentHTML('beforeend', '<span class="sparkline">' + sparkline + '</span> <span class="sparkline-info">' + triples.length + ' observations</span>');
                                form.removeChild(form.querySelector('.fas.fa-circle-notch.fa-spin.fa-fw'));
                            }
                            else {
                              //This shouldn't happen.
                              sG.insertAdjacentHTML('beforeend', '<span class="sparkline-info">0 observations. Select another.</span>');
                            }
                          });
                      });
                    });
                  break;
                case 'bookmark':
                  input.content.focus();
                  break;
                default:
                  input.focus();
                  break;
              }

              // If we have a target checkbox, we want it to be checked/unchecked
              // based on whether the existing link has target=_blank
              if (targetCheckbox) {
                targetCheckbox.checked = opts.target === '_blank';
              }

              // If we have a custom class checkbox, we want it to be checked/unchecked
              // based on whether an existing link already has the class
              if (buttonCheckbox) {
                var classList = opts.buttonClass ? opts.buttonClass.split(' ') : [];
                buttonCheckbox.checked = (classList.indexOf(this.customClassOption) !== -1);
              }
            },

            // Called by core when tearing down medium-editor (destroy)
            destroy: function () {
              if (!this.form) {
                return false;
              }

              if (this.form.parentNode) {
                this.form.parentNode.removeChild(this.form);
              }

              delete this.form;
            },

            // core methods

            getFormOpts: function () {
              // no notion of private functions? wanted `_getFormOpts`
              var targetCheckbox = this.getAnchorTargetCheckbox(),
                buttonCheckbox = this.getAnchorButtonCheckbox();
              var opts = {};

              switch(this.action) {
                case 'rdfa':
                  opts.about = this.getInput().about.value;
                  opts.rel = this.getInput().rel.value;
                  opts.href = this.getInput().href.value;
                  opts.typeOf = this.getInput().typeOf.value;
                  opts.resource = this.getInput().resource.value;
                  opts.property = this.getInput().property.value;
                  opts.content = this.getInput().content.value;
                  opts.datatype = this.getInput().datatype.value;
                  opts.language = this.getInput().language.value;
                  break;
                case 'article': case 'approve': case 'disapprove': case 'specificity':
                  opts.content = this.getInput().content.value;
                  var aLS = this.getInput().annotationLocationService;
                  DO.C.User.UI['annotationLocationService'] = { checked: false }
                  if(aLS) {
                    DO.C.User.UI.annotationLocationService.checked = opts.annotationLocationService = aLS.checked;
                  }
                  var aLPS = this.getInput().annotationLocationPersonalStorage;
                  DO.C.User.UI['annotationLocationPersonalStorage'] = { checked: false }
                  if(aLPS) {
                    DO.C.User.UI.annotationLocationPersonalStorage.checked = opts.annotationLocationPersonalStorage = aLPS.checked;
                  }
                  var aIL = this.getInput().annotationInboxLocation;
                  DO.C.User.UI['annotationInboxLocation'] = { checked: false }
                  if(aIL) {
                    DO.C.User.UI.annotationInboxLocation.checked = opts.annotationInboxLocation = aIL.checked;
                  }
                  opts.tagging = this.getInput().tagging.value;
                  opts.language = this.getInput().language.value;
                  opts.license = this.getInput().license.value;
                  break;
                case 'note':
                  opts.content = this.getInput().content.value;
                  opts.tagging = this.getInput().tagging.value;
                  opts.language = this.getInput().language.value;
                  opts.license = this.getInput().license.value;
                  break;
                case 'cite':
                  opts.search = this.getInput().search.value;
                  opts.citationType = this.getInput().citationType.value;
                  opts.citationRelation = this.getInput().citationRelation.value;
                  opts.url = this.getInput().url.value;
                  opts.content = this.getInput().content.value;
                  opts.language = this.getInput().language.value;
                  break;
                case 'bookmark':
                  opts.content = this.getInput().content.value;
                  opts.tagging = this.getInput().tagging.value;
                  opts.language = this.getInput().language.value;
                  opts.license = this.getInput().license.value;
                  break;
                case 'sparkline':
                  opts.search = this.getInput().search.value;
                  opts.select = this.getInput().select.value;
                  opts.sparkline = this.getInput().sparkline.innerHTML;
                  opts.selectionDataSet = this.getInput().selectionDataSet.value;
                  opts.selectionRefArea = this.getInput().selectionRefArea.value;
                  break;
                default:
                  opts.url = this.getInput().value;
                  break;

              }

              if (typeof opts.language !== 'undefined') {
                DO.C.User.UI['Language'] = opts.language;
              }
              if (typeof opts.license !== 'undefined') {
                DO.C.User.UI['License'] = opts.license;
              }

              updateLocalStorageProfile(DO.C.User);

              opts.target = '_self';
              if (targetCheckbox && targetCheckbox.checked) {
                opts.target = '_blank';
              }

              if (buttonCheckbox && buttonCheckbox.checked) {
                opts.buttonClass = this.customClassOption;
              }

              Object.keys(opts).forEach(function(key) {
                if(typeof opts[key] === 'string') {
                  opts[key] = opts[key].trim();
                }
              });

              return opts;
            },

            doFormSave: function () {
              var opts = this.getFormOpts();
              this.completeFormSave(opts);
            },

            completeFormSave: function (opts) {
              var _this = this;
// console.log(this.base)
// console.log(opts);
// console.log('completeFormSave() with this.action: ' + this.action);
              this.base.restoreSelection();
              var range = MediumEditor.selection.getSelectionRange(this.document);
              var selectedParentElement = this.base.getSelectedParentElement();
// console.log('getSelectedParentElement:');
// console.log(selectedParentElement);

              //Mark the text which the note was left for (with reference to the note?)
              this.base.selectedDocument = this.document;
              this.base.selection = MediumEditor.selection.getSelectionHtml(this.base.selectedDocument); //.replace(DO.C.Editor.regexEmptyHTMLTags, '');
// console.log('this.base.selection:');
// console.log(this.base.selection);
 
              var exact = this.base.selection;
              var selectionState = MediumEditor.selection.exportSelection(selectedParentElement, this.document);
              var start = selectionState.start;
              var end = selectionState.end;
              var prefixStart = Math.max(0, start - DO.C.ContextLength);
// console.log('pS ' + prefixStart);
              var prefix = selectedParentElement.textContent.substr(prefixStart, start - prefixStart);
// console.log('-' + prefix + '-');
              prefix = escapeCharacters(prefix);

              var suffixEnd = Math.min(selectedParentElement.textContent.length, end + DO.C.ContextLength);
// console.log('sE ' + suffixEnd);
              var suffix = selectedParentElement.textContent.substr(end, suffixEnd - end);
// console.log('-' + suffix + '-');
              suffix = escapeCharacters(suffix);

              //Annotating an annotation
              //FIXME: A bit hacky - should use RDF
              var annotationInbox = selectedParentElement.closest('.do[typeof="oa:Annotation"]');
              if (annotationInbox) {
                annotationInbox = annotationInbox.querySelector('[rel="ldp:inbox"]');
                if (annotationInbox) {
                  annotationInbox = annotationInbox.href || annotationInbox.getAttribute('resource')
                  annotationInbox = decodeURIComponent(annotationInbox);
                }
              }

              var datetime = getDateTimeISO();
              var id = generateAttributeId();
              var refId = 'r-' + id;
              // var noteId = 'i-' + id;

              var resourceIRI = DO.C.DocumentURL;
              var containerIRI = window.location.href;

              var selectorIRI = resourceIRI + '#selector(type=TextQuoteSelector,prefix=' + encodeURIComponent(prefix) + ',exact=' + encodeURIComponent(exact) + ',suffix=' + encodeURIComponent(suffix) +')';

              var contentType = 'text/html';
              var noteIRI, noteURL;
              var profile;
              var options = {};
              var annotationDistribution = [] , aLS = {};

              if((opts.annotationLocationPersonalStorage && DO.C.User.Outbox) || (!opts.annotationLocationPersonalStorage && !opts.annotationLocationService && DO.C.User.Outbox)) {
                containerIRI = DO.C.User.Outbox[0];

                var fromContentType = 'text/html';
                // contentType = 'application/ld+json';
                contentType = fromContentType;

                noteURL = noteIRI = containerIRI + id;
                var contextProfile = {
                  '@context': [
                    'https://www.w3.org/ns/activitystreams',
                    { 'oa': 'http://www.w3.org/ns/oa#', 'schema': 'http://schema.org/' }
                  ],
                  // 'subjectURI': noteIRI,
                  'profile': 'https://www.w3.org/ns/activitystreams'
                };
                aLS = { 'id': id, 'containerIRI': containerIRI, 'noteURL': noteURL, 'noteIRI': noteIRI, 'fromContentType': fromContentType, 'contentType': contentType, 'annotationInbox': annotationInbox };
                if (typeof DO.C.User.Storage === 'undefined') {
                  aLS['canonical'] = true;
                }

                aLS = Object.assign(aLS, contextProfile)

                annotationDistribution.push(aLS);
              }

              //XXX: Use this as the canonical if available. Note how noteIRI is treated later
              if((opts.annotationLocationPersonalStorage && DO.C.User.Storage) || (!opts.annotationLocationPersonalStorage && !opts.annotationLocationService && DO.C.User.Storage)) {
                containerIRI = DO.C.User.Storage[0];

                fromContentType = 'text/html';
                // contentType = 'text/html';
                contentType = fromContentType;

                noteURL = noteIRI = containerIRI + id;
                contextProfile = {
                  // 'subjectURI': noteIRI,
                };
                aLS = { 'id': id, 'containerIRI': containerIRI, 'noteURL': noteURL, 'noteIRI': noteIRI, 'fromContentType': fromContentType, 'contentType': contentType, 'canonical': true, 'annotationInbox': annotationInbox };

                annotationDistribution.push(aLS);
              }

              if(opts.annotationLocationService && typeof DO.C.AnnotationService !== 'undefined') {
                containerIRI = DO.C.AnnotationService;
                fromContentType = 'text/html';
                // contentType = 'application/ld+json';
                contentType = fromContentType;

                contextProfile = {
                  '@context': [
                    'http://www.w3.org/ns/anno.jsonld',
                    { 'as': 'https://www.w3.org/ns/activitystreams#', 'schema': 'http://schema.org/' }
                  ],
                  // 'subjectURI': noteIRI,
                  'profile': 'http://www.w3.org/ns/anno.jsonld'
                };

                if(!opts.annotationLocationPersonalStorage && opts.annotationLocationService) {
                  noteURL = noteIRI = containerIRI + id;
                  aLS = { 'id': id, 'containerIRI': containerIRI, 'noteURL': noteURL, 'noteIRI': noteIRI, 'fromContentType': fromContentType, 'contentType': contentType, 'canonical': true,'annotationInbox': annotationInbox };
                }
                else if(opts.annotationLocationPersonalStorage) {
                  noteURL = containerIRI + id;
                  aLS = { 'id': id, 'containerIRI': containerIRI, 'noteURL': noteURL, 'noteIRI': noteIRI, 'fromContentType': fromContentType, 'contentType': contentType, 'annotationInbox': annotationInbox };
                }
                else {
                  noteURL = noteIRI = containerIRI + id;
                  aLS = { 'id': id, 'containerIRI': containerIRI, 'noteURL': noteURL, 'noteIRI': noteIRI, 'fromContentType': fromContentType, 'contentType': contentType, 'canonical': true, 'annotationInbox': annotationInbox };
                }

                aLS = Object.assign(aLS, contextProfile)

                annotationDistribution.push(aLS);
              }

// console.log(annotationDistribution);

              //XXX: Defaulting to id but overwritten by motivation symbol
              var refLabel = id;

              var parentNodeWithId = selectedParentElement.closest('[id]');

              var targetIRI = (parentNodeWithId) ? resourceIRI + '#' + parentNodeWithId.id : resourceIRI;
              var documentURL = resourceIRI;
              var latestVersion = DO.C.Resource[documentURL].graph.rellatestversion;
              if (latestVersion) {
                resourceIRI = latestVersion;
                targetIRI = (parentNodeWithId) ? latestVersion + '#' + parentNodeWithId.id : latestVersion;
                options['targetInMemento'] = true;
              }
// console.log(latestVersion)
// console.log(resourceIRI)
// console.log(targetIRI)

              var targetLanguage = getNodeLanguage(parentNodeWithId);
              var selectionLanguage = getNodeLanguage(selectedParentElement);
// console.log(targetLanguage)
// console.log(selectionLanguage)

              //Role/Capability for Authors/Editors
              var ref = '', refType = ''; //TODO: reference types. UI needs input
              //TODO: replace refId and noteIRI IRIs

              //This class is added if it is only for display purposes e.g., loading an external annotation for view, but do not want to save it later on (as it will be stripped when 'do' is found)
              var doClass = '';

              //TODO: oa:TimeState's datetime should equal to hasSource value. Same for oa:HttpRequestState's rdfs:value
              // <span about="[this:#' + refId + ']" rel="oa:hasState">(timeState: <time typeof="oa:TimeState" datetime="' + datetime +'" datatype="xsd:dateTime"property="oa:sourceDate">' + datetime + '</time>)</span>\n\

              var noteData = {};
              var note = '';
              var language = opts.language;
              var license = opts.license;
              var rights = '';
              var motivatedBy = 'oa:replying';

              var createNoteData = function(annotation) {
                var id = annotation.id;
                var note = '';
                var mode = '';

                if (annotation && 'profile' in annotation && annotation.profile == 'https://www.w3.org/ns/activitystreams') {
                  mode = 'object'
                }
                else {
                  mode = 'write'
                }

                switch(_this.action) {
                  case 'sparkline':
                    var figureIRI = generateAttributeId(null, opts.selectionDataSet);
                    ref = '<span rel="schema:hasPart" resource="#figure-' + figureIRI + '">\n\
                    <a href="' + opts.select + '" property="schema:name" rel="prov:wasDerivedFrom" resource="' + opts.select + '" typeof="qb:DataSet">' + opts.selectionDataSet + '</a> [' + escapeCharacters(DO.C.RefAreas[opts.selectionRefArea]) + ']\n\
                    <span class="sparkline" rel="schema:image" resource="#' + figureIRI + '">' + opts.sparkline + '</span></span>';
                    break;

                  //External Note
                  case 'article': case 'approve': case 'disapprove': case 'specificity':
                    if (_this.action === 'approve' || _this.action === 'disapprove') {
                      motivatedBy = 'oa:assessing';
                    }
                    if (_this.action === 'specificity') {
                      motivatedBy = 'oa:questioning';
                    }
                    if (_this.action !== 'article') {
                      refLabel = DO.U.getReferenceLabel(motivatedBy);
                    }

                    ref = _this.base.selection;

                    noteData = {
                      "type": _this.action,
                      "mode": mode,
                      "motivatedByIRI": motivatedBy,
                      "id": id,
                      "canonical": 'urn:uuid:' + id,
                      "refId": refId,
                      "refLabel": refLabel,
                      // "iri": noteIRI, //e.g., https://example.org/path/to/article
                      "creator": {},
                      "datetime": datetime,
                      "target": {
                        "iri": targetIRI,
                        "source": resourceIRI,
                        "selector": {
                          "exact": exact,
                          "prefix": prefix,
                          "suffix": suffix,
                          "language": selectionLanguage
                        },
                        "language": targetLanguage
                        //TODO: state
                      }
                    };

                    var bodyObject = {
                      "value": opts.content
                    };

                    if (language) {
                      noteData["language"] = language;
                      bodyObject["language"] = language;
                    }
                    if (license) {
                      noteData["rights"] = noteData["license"] = license;
                      bodyObject["rights"] = bodyObject["license"] = license;
                    }

                    noteData["body"] = [bodyObject].concat(DO.U.tagsToBodyObjects(opts.tagging));

                    if (DO.C.User.IRI) {
                      noteData.creator["iri"] = DO.C.User.IRI;
                    }
                    if (DO.C.User.Name) {
                      noteData.creator["name"] = DO.C.User.Name;
                    }
                    noteData.creator["image"] = DO.C.User.Image || generateDataURI('image/svg+xml', 'base64', Icon['.fas.fa-user-secret']);
                    if (DO.C.User.URL) {
                      noteData.creator["url"] = DO.C.User.URL;
                    }
                    if (opts.annotationInboxLocation && DO.C.User.TypeIndex && DO.C.User.TypeIndex[DO.C.Vocab['asAnnounce']['@id']]) {
                      noteData.inbox = DO.C.User.TypeIndex[DO.C.Vocab['asAnnounce']['@id']];
                    }

                    // note = DO.U.createNoteDataHTML(noteData);
                    break;

                  //Internal Note
                  case 'note':
                    motivatedBy = "oa:commenting";
                    refLabel = DO.U.getReferenceLabel(motivatedBy);
                    var docRefType = '<sup class="ref-comment"><a rel="cito:isCitedBy" href="#' + id + '">' + refLabel + '</a></sup>';
                    var noteType = 'note';
                    noteData = {
                      "type": noteType,
                      "mode": "read",
                      "motivatedByIRI": motivatedBy,
                      "id": id,
                      "refId": refId,
                      "refLabel": refLabel,
                      // "iri": noteIRI, //e.g., https://example.org/path/to/article
                      "creator": {},
                      "datetime": datetime,
                      "target": {
                        "iri": targetIRI,
                        "source": resourceIRI,
                        "selector": {
                          "exact": exact,
                          "prefix": prefix,
                          "suffix": suffix,
                          "language": selectionLanguage
                        },
                        "language": targetLanguage
                        //TODO: state
                      }
                    };

                    var bodyObject = {
                      "purpose": "describing",
                      "value": opts.content
                    };

                    if (language) {
                      noteData["language"] = language;
                      bodyObject["language"] = language;
                    }
                    if (license) {
                      noteData["rights"] = noteData["license"] = license;
                      bodyObject["rights"] = bodyObject["license"] = license;
                    }

                    noteData["body"] = [bodyObject].concat(DO.U.tagsToBodyObjects(opts.tagging));

                    if (DO.C.User.IRI) {
                      noteData.creator["iri"] = DO.C.User.IRI;
                    }
                    if (DO.C.User.Name) {
                      noteData.creator["name"] = DO.C.User.Name;
                    }
                    noteData.creator["image"] = DO.C.User.Image || generateDataURI('image/svg+xml', 'base64', Icon['.fas.fa-user-secret']);
                    if (DO.C.User.URL) {
                      noteData.creator["url"] = DO.C.User.URL;
                    }

                    // note = DO.U.createNoteDataHTML(noteData);

                    ref = DO.U.getTextQuoteHTML(refId, motivatedBy, exact, docRefType);
                    break;

                  case 'cite': //footnote reference
                    switch(opts.citationType) {
                      case 'ref-footnote': default:
                        motivatedBy = "oa:describing";
                        refLabel = DO.U.getReferenceLabel(motivatedBy);
                        docRefType = '<sup class="' + opts.citationType + '"><a rel="cito:isCitedBy" href="#' + id + '">' + refLabel + '</a></sup>';
                        noteData = {
                          "type": opts.citationType,
                          "mode": mode,
                          "motivatedByIRI": motivatedBy,
                          "id": id,
                          "refId": refId,
                          "refLabel": refLabel,
                          // "iri": noteIRI,
                          "datetime": datetime,
                          "citationURL": opts.url
                        };

                        var bodyObject = {
                          "value": opts.content
                        };

                        if (language) {
                          noteData["language"] = language;
                          bodyObject["language"] = language;
                        }
                        if (license) {
                          noteData["rights"] = noteData["license"] = license;
                          bodyObject["rights"] = bodyObject["license"] = license;
                        }

                        noteData["body"] = [bodyObject];

                        // note = DO.U.createNoteDataHTML(noteData);
                        break;

                      case 'ref-reference':
                        motivatedBy = 'oa:linking';
                        refLabel = DO.U.getReferenceLabel('oa:linking');
                        docRefType = '<span class="' + opts.citationType + '">' + DO.C.RefType[DO.C.DocRefType].InlineOpen + '<a href="#' + id + '">' + refLabel + '</a>' + DO.C.RefType[DO.C.DocRefType].InlineClose + '</span>';
                        break;
                    }

                    ref = DO.U.getTextQuoteHTML(refId, motivatedBy, exact, docRefType);
                    break;
                  // case 'reference':
                  //   ref = '<span class="ref" about="[this:#' + refId + ']" typeof="dctypes:Text"><span id="'+ refId +'" property="schema:description">' + this.base.selection + '</span> <span class="ref-reference">' + DO.C.RefType[DO.C.DocRefType].InlineOpen + '<a rel="cito:isCitedBy" href="#' + id + '">' + refLabel + '</a>' + DO.C.RefType[DO.C.DocRefType].InlineClose + '</span></span>';
  //                  break;

                  case 'rdfa':
                    //TODO: inlist, prefix
                    //TODO: lang/xmlllang
                    noteData = {
                      about: opts.about,
                      typeOf: opts.typeOf,
                      rel: opts.rel,
                      href: opts.href,
                      resource: opts.resource,
                      property: opts.property,
                      content: opts.content,
                      datatype: opts.datatype,
                      lang: opts.language,
                      textContent: _this.base.selection
                    };
                    ref = createRDFaHTML(noteData, 'expanded');
                    break;

                  case 'bookmark':
                    noteType = 'bookmark';
                    motivatedBy = "oa:bookmarking";
                    refLabel = DO.U.getReferenceLabel(motivatedBy);
                    docRefType = '';
                    noteData = {
                      "type": noteType,
                      "mode": mode,
                      "motivatedByIRI": motivatedBy,
                      "id": id,
                      "canonical": 'urn:uuid:' + id,
                      "refId": refId,
                      "refLabel": refLabel,
                      // "iri": noteIRI, //e.g., https://example.org/path/to/article
                      "creator": {},
                      "datetime": datetime,
                      "target": {
                        "iri": targetIRI,
                        "source": resourceIRI,
                        "selector": {
                          "exact": exact,
                          "prefix": prefix,
                          "suffix": suffix,
                          "language": selectionLanguage
                        },
                        "language": targetLanguage
                        //TODO: state
                      }
                    };

                    var bodyObject = {
                      "purpose": "describing",
                      "value": opts.content
                    };

                    if (language) {
                      noteData["language"] = language;
                      bodyObject["language"] = language;
                    }
                    if (license) {
                      noteData["rights"] = noteData["license"] = license;
                      bodyObject["rights"] = bodyObject["license"] = license;
                    }

                    noteData["body"] = [bodyObject].concat(DO.U.tagsToBodyObjects(opts.tagging));

                    if (DO.C.User.IRI) {
                      noteData.creator["iri"] = DO.C.User.IRI;
                    }
                    if (DO.C.User.Name) {
                      noteData.creator["name"] = DO.C.User.Name;
                    }
                    noteData.creator["image"] = DO.C.User.Image || generateDataURI('image/svg+xml', 'base64', Icon['.fas.fa-user-secret']);
                    if (DO.C.User.URL) {
                      noteData.creator["url"] = DO.C.User.URL;
                    }

                    // note = DO.U.createNoteDataHTML(noteData);
                    ref = DO.U.getTextQuoteHTML(refId, motivatedBy, exact, docRefType, { 'do': true });
                    break;
                }

                var selectionUpdated = ref;
                MediumEditor.util.insertHTMLCommand(_this.base.selectedDocument, selectionUpdated);

                return noteData;
              }

              var createNotificationData = function(annotation, options) {
                options = options || {};
                var notificationType, notificationObject, notificationContext, notificationTarget, notificationStatements;

                var noteIRI = (options.relativeObject) ? '#' + id : annotation['noteIRI'];

                notificationStatements = '    <dl about="' + noteIRI + '">\n\
  <dt>Object type</dt><dd><a about="' + noteIRI + '" typeof="oa:Annotation" href="' + DO.C.Vocab['oaAnnotation']['@id'] + '">Annotation</a></dd>\n\
  <dt>Motivation</dt><dd><a href="' + DO.C.Prefixes[motivatedBy.split(':')[0]] + motivatedBy.split(':')[1] + '" property="oa:motivation">' + motivatedBy.split(':')[1] + '</a></dd>\n\
</dl>\n\
';

                switch(_this.action) {
                  default: case 'article': case 'specificity':
                    notificationType = ['as:Create'];
                    notificationObject = noteIRI;
                    notificationTarget = targetIRI;
                    break;
                  case 'approve':
                    notificationType = ['as:Like'];
                    notificationObject = targetIRI;
                    notificationContext = noteIRI;
                    break;
                  case 'disapprove':
                    notificationType = ['as:Dislike'];
                    notificationObject = targetIRI;
                    notificationContext = noteIRI;
                    break;
                  case 'bookmark':
                    notificationType = ['as:Add'];
                    notificationObject = noteIRI;
                    notificationTarget = annotation['containerIRI'];
                    break;
                }

                var notificationData = {
                  "type": notificationType,
                  "slug": id,
                  "object": notificationObject,
                  "license": opts.license
                };

                if(typeof notificationContext !== 'undefined') {
                  notificationData['context'] = notificationContext;
                }

                if(typeof notificationTarget !== 'undefined') {
                  notificationData['target'] = notificationTarget;
                }

                notificationData['statements'] = notificationStatements;

                return notificationData;
              }

              var positionActivity = function(annotation, options) {
                if (!annotation['canonical']) {
                  return Promise.resolve();
                }

                if ('profile' in annotation && annotation.profile == 'https://www.w3.org/ns/activitystreams') {
                  return DO.U.showActivities(annotation['noteIRI'])
                    .catch(() => {
                      return Promise.resolve()
                    })
                }
                else {
// console.log(options)
                  return DO.U.showActivities(annotation[ 'noteIRI' ], options)
                    .catch(() => {
                      return Promise.resolve()
                    })
                }
              }

              var sendNotification = function(annotation, options) {
                if (!annotation['canonical']) {
                  return Promise.resolve();
                }

                var inboxPromise;

                if (annotation.annotationInbox) {
                  inboxPromise = Promise.resolve([annotation.annotationInbox])
                }
                else {
                  if ('inbox' in DO.C.Resource[documentURL] && DO.C.Resource[documentURL].inbox.length > 0) {
                    inboxPromise = Promise.resolve(DO.C.Resource[documentURL].inbox)
                  }
                  else {
                    inboxPromise = getLinkRelation(DO.C.Vocab['ldpinbox']['@id'], documentURL);
                  }
                }

                return inboxPromise
                  .catch(error => {
                    console.log('Error fetching ldp:inbox endpoint:', error)
                    throw error
                  })
                  .then(inboxes => {
                    // TODO: resourceIRI for getLinkRelation should be the
                    // closest IRI (not necessarily the document).

                    if (inboxes.length > 0) {
                      var notificationData = createNotificationData(annotation);

                      notificationData['inbox'] = inboxes[0];

                      // notificationData['type'] = ['as:Announce'];
// console.log(annotation)
// console.log(notificationData)
                      return notifyInbox(notificationData)
                        .catch(error => {
                          console.log('Error notifying the inbox:', error)
                        })
                    }
                  })
              }

              switch(this.action) {
                case 'article': case 'approve': case 'disapprove': case 'specificity': case 'bookmark':
                  annotationDistribution.forEach(annotation => {
                    var data = '';

                    var notificationData = createNotificationData(annotation, { 'relativeObject': true });

                    var noteData = createNoteData(annotation)
                    if ('profile' in annotation && annotation.profile == 'https://www.w3.org/ns/activitystreams') {
                      notificationData['statements'] = DO.U.createNoteDataHTML(noteData);
                      note = createActivityHTML(notificationData);
                    }
                    else {
                      note = DO.U.createNoteDataHTML(noteData);
                    }
                    data = createHTML('', note);
// console.log(noteData)
// console.log(note)
// console.log(data)
// console.log(annotation)

                    postActivity(annotation['containerIRI'], id, data, annotation)
                      .catch(error => {
                        // console.log('Error serializing annotation:', error)
                        // console.log(error)
                        throw error  // re-throw, break out of promise chain
                      })

                      .then(response => {
                        var location = response.headers.get('Location')

                        if (location) {
                          location = getAbsoluteIRI(annotation['containerIRI'], location)
                          annotation['noteIRI'] = annotation['noteURL'] = location
                        }

// console.log(annotation)
                        return positionActivity(annotation, options)
                       })

                      .then(() => {
                        if (this.action != 'bookmark') {
                          return sendNotification(annotation, options)
                        }
                      })

                      .catch(e => {  // catch-all
                        // suppress the error, it was already logged to the console above
                        // nothing else needs to be done, the loop will proceed
                        // to the next annotation
                      })
                  })
                  break;

                case 'note':
                  noteData = createNoteData({'id': id})
                  note = DO.U.createNoteDataHTML(noteData);
                  // var nES = selectedParentElement.nextElementSibling;
                  var asideNote = '\n\
<aside class="note">\n\
'+ note + '\n\
</aside>';
                  var asideNode = fragmentFromString(asideNote);
                  var parentSection = getClosestSectionNode(selectedParentElement);
                  parentSection.appendChild(asideNode);

                  DO.U.positionNote(refId, id);
                  break;

                case 'selector':
                  window.history.replaceState({}, null, selectorIRI);

                  var message = 'Copy URL from address bar.';
                  message = {
                    'content': message,
                    'type': 'info',
                    'timer': 3000
                  }
                  addMessageToLog(message, Config.MessageLog);
                  showActionMessage(document.documentElement, message);
                  // TODO: Perhaps use something like setCopyToClipboard instead. Use as `encodeURI(selectorIRI)` as input.
                  break;

                case 'cite': //footnote reference
                  //TODO: Refactor this what's in positionInteraction

                  noteData = createNoteData({'id': id})
                  note = DO.U.createNoteDataHTML(noteData);

                  switch(opts.citationType) {
                    case 'ref-footnote': default:
                      var nES = selectedParentElement.nextElementSibling;
                      asideNote = '\n\
<aside class="note">\n\
'+ note + '\n\
</aside>';
                      asideNode = fragmentFromString(asideNote);
                      parentSection = getClosestSectionNode(selectedParentElement);
                      parentSection.appendChild(asideNode);

                      DO.U.positionNote(refId, id);
                      break;

                    case 'ref-reference':
                      options = opts;
                      opts.url = opts.url.trim(); //XXX: Perhaps use escapeCharacters()?
                      options['citationId'] = opts.url;
                      options['refId'] = refId;

                      //TODO: offline mode
                      DO.U.getCitation(opts.url, options).then(function(citationGraph) {
                        var citationURI = opts.url;
// console.log(citationGraph)
// console.log(citationGraph.toString())
// console.log(options.citationId)
// console.log( getProxyableIRI(options.citationId))
                        if (isValidISBN(opts.url)) {
                          citationURI = citationGraph.iri().toString();
                          // options.citationId = citationURI;
                        }
                        else if(opts.url.match(/^10\.\d+\//)) {
                          citationURI = 'http://dx.doi.org/' + opts.url;
                          // options.citationId = citationURI;
                        }
                        //FIXME: subjectIRI shouldn't be set here. Bug in RDFaProcessor (see also SimpleRDF ES5/6). See also: https://github.com/dokieli/dokieli/issues/132

                        citationURI = citationURI.replace(/(https?:\/\/(dx\.)?doi\.org\/)/i, 'http://dx.doi.org/');

                        //XXX: I don't know what this is going on about...
                        // else if (stripFragmentFromString(options.citationId) !==  getProxyableIRI(options.citationId)) {
                        //   citationURI = window.location.origin + window.location.pathname;
                        // }

                        var citation = DO.U.getCitationHTML(citationGraph, citationURI, options);

                        //TODO: references nodes, e.g., references, normative-references, informative-references
                        var references = document.querySelector('#references');
                        var referencesList = references?.querySelector('dl, ol, ul') || references;

                        buildReferences(referencesList, id, citation);

                        options['showRobustLinksDecoration'] = true;
                        var node = document.querySelector('[id="' + id + '"] a[about]');

                        // var robustLink = DO.U.createRobustLink(citationURI, node, options);

// console.log(options.url);
                        var s = citationGraph.child(citationURI);
                        if(s.ldpinbox._array.length == 0) {
                          s = citationGraph.child(options.citationId);
                        }
                        else {
                          var inboxURL = s.ldpinbox.at(0);
// console.log(inboxURL);

                          var citedBy = location.href.split(location.search||location.hash||/[?#]/)[0] + '#' + options.refId;

                          var notificationStatements = '    <dl about="' + citedBy + '">\n\
      <dt>Action</dt><dd>Citation</dd>\n\
      <dt>Cited by</dt><dd><a href="' + citedBy + '">' + citedBy + '</a></dd>\n\
      <dt>Citation type</dt><dd><a href="' + options.url + '">' + DO.C.Citation[options.citationRelation] + '</a></dd>\n\
      <dt>Cites</dt><dd><a href="' + options.url + '" property="' + options.citationRelation + '">' + options.url + '</a></dd>\n\
    </dl>\n\
';

                          var notificationData = {
                            "type": ['as:Announce'],
                            "inbox": inboxURL,
                            "object": citedBy,
                            "target": options.url,
                            "statements": notificationStatements
                          };

                          notifyInbox(notificationData).then(
                            function(s){
                              console.log('Sent Linked Data Notification to ' + inboxURL);
                            });
                        }
                      });
                      break;
                  }
                  break;

                case 'rdfa':
                  //This only updates the DOM. Nothing further. The 'id' is not used.
                  noteData = createNoteData({'id': id});
                  break;
              }

              this.window.getSelection().removeAllRanges();
              this.base.checkSelection();
            },

            checkLinkFormat: function (value) {
              var re = /^(https?|ftps?|rtmpt?):\/\/|mailto:/;
              return (re.test(value) ? '' : 'http://') + value;
            },

            doFormCancel: function () {
              this.base.restoreSelection();
              this.base.checkSelection();
            },

            // form creation and event handling
            attachFormEvents: function (form) {
              var close = form.querySelector('.medium-editor-toolbar-close'),
                save = form.querySelector('.medium-editor-toolbar-save');

              this.on(form, 'click', this.handleFormClick.bind(this));
              this.on(close, 'click', this.handleCloseClick.bind(this));
              this.on(save, 'click', this.handleSaveClick.bind(this), true);
            },

            createForm: function () {
              var form = this.document.createElement('div');

              // Anchor Form (div)
              form.className = 'medium-editor-toolbar-form';
              //FIXME
              form.id = 'medium-editor-toolbar-form-textarea-' + this.getEditorId();
              form.innerHTML = this.getTemplate();
              this.attachFormEvents(form);

              return form;
            },

            getInput: function () {
              var r = {};
              switch(this.action) {
                case 'rdfa':
                  r.about = this.getForm().querySelector('#rdfa-about.medium-editor-toolbar-input');
                  r.rel = this.getForm().querySelector('#rdfa-rel.medium-editor-toolbar-input');
                  r.href = this.getForm().querySelector('#rdfa-href.medium-editor-toolbar-input');
                  r.typeOf = this.getForm().querySelector('#rdfa-typeof.medium-editor-toolbar-input');
                  r.resource = this.getForm().querySelector('#rdfa-resource.medium-editor-toolbar-input');
                  r.property = this.getForm().querySelector('#rdfa-property.medium-editor-toolbar-input');
                  r.content = this.getForm().querySelector('#rdfa-content.medium-editor-toolbar-input');
                  r.datatype = this.getForm().querySelector('#rdfa-datatype.medium-editor-toolbar-input');
                  r.language = this.getForm().querySelector('#rdfa-language.medium-editor-toolbar-input');
                  break;
                case 'article':
                  r.content = this.getForm().querySelector('#article-content.medium-editor-toolbar-textarea');
                  r.annotationLocationService = this.getForm().querySelector('#annotation-location-service');
                  r.annotationLocationPersonalStorage = this.getForm().querySelector('#annotation-location-personal-storage');
                  r.annotationInboxLocation = this.getForm().querySelector('#annotation-inbox');
                  r.tagging = this.getForm().querySelector('#bookmark-tagging.medium-editor-toolbar-input');
                  r.language = this.getForm().querySelector('#article-language.medium-editor-toolbar-select');
                  r.license = this.getForm().querySelector('#article-license.medium-editor-toolbar-select');
                  break;
                case 'note':
                  r.content = this.getForm().querySelector('#article-content.medium-editor-toolbar-textarea');
                  r.tagging = this.getForm().querySelector('#bookmark-tagging.medium-editor-toolbar-input');
                  r.language = this.getForm().querySelector('#article-language.medium-editor-toolbar-select');
                  r.license = this.getForm().querySelector('#article-license.medium-editor-toolbar-select');
                  break;
                case 'approve':
                  r.content = this.getForm().querySelector('#approve-content.medium-editor-toolbar-textarea');
                  r.annotationLocationService = this.getForm().querySelector('#annotation-location-service');
                  r.annotationLocationPersonalStorage = this.getForm().querySelector('#annotation-location-personal-storage');
                  r.annotationInboxLocation = this.getForm().querySelector('#annotation-inbox');
                  r.tagging = this.getForm().querySelector('#bookmark-tagging.medium-editor-toolbar-input');
                  r.language = this.getForm().querySelector('#article-language.medium-editor-toolbar-select');
                  r.license = this.getForm().querySelector('#approve-license.medium-editor-toolbar-select');
                  break;
                case 'disapprove':
                  r.content = this.getForm().querySelector('#disapprove-content.medium-editor-toolbar-textarea');
                  r.annotationLocationService = this.getForm().querySelector('#annotation-location-service');
                  r.annotationLocationPersonalStorage = this.getForm().querySelector('#annotation-location-personal-storage');
                  r.annotationInboxLocation = this.getForm().querySelector('#annotation-inbox');
                  r.tagging = this.getForm().querySelector('#bookmark-tagging.medium-editor-toolbar-input');
                  r.language = this.getForm().querySelector('#article-language.medium-editor-toolbar-select');
                  r.license = this.getForm().querySelector('#disapprove-license.medium-editor-toolbar-select');
                  break;
                case 'specificity':
                  r.content = this.getForm().querySelector('#specificity-content.medium-editor-toolbar-textarea');
                  r.annotationLocationService = this.getForm().querySelector('#annotation-location-service');
                  r.annotationLocationPersonalStorage = this.getForm().querySelector('#annotation-location-personal-storage');
                  r.annotationInboxLocation = this.getForm().querySelector('#annotation-inbox');
                  r.tagging = this.getForm().querySelector('#bookmark-tagging.medium-editor-toolbar-input');
                  r.language = this.getForm().querySelector('#article-language.medium-editor-toolbar-select');
                  r.license = this.getForm().querySelector('#specificity-license.medium-editor-toolbar-select');
                  break;
                case 'cite':
                  r.search = this.getForm().querySelector('#specref-search.medium-editor-toolbar-input');
                  r.select = this.getForm().querySelector('input[name="specref-item"]:checked');
                  r.citationType = this.getForm().querySelector('input[name="citation-type"]:checked');
                  r.citationRelation = this.getForm().querySelector('#citation-relation.medium-editor-toolbar-select');
                  r.url = this.getForm().querySelector('#citation-url.medium-editor-toolbar-input');
                  r.content = this.getForm().querySelector('#citation-content.medium-editor-toolbar-textarea');
                  r.language = this.getForm().querySelector('#article-language.medium-editor-toolbar-select');
                  break;
                case 'bookmark':
                  r.content = this.getForm().querySelector('#bookmark-content.medium-editor-toolbar-textarea');
                  r.tagging = this.getForm().querySelector('#bookmark-tagging.medium-editor-toolbar-input');
                  r.language = this.getForm().querySelector('#article-language.medium-editor-toolbar-select');
                  r.license = this.getForm().querySelector('#bookmark-license.medium-editor-toolbar-select');
                  break;
                case 'sparkline':
                  r.search = this.getForm().querySelector('#sparkline-search.medium-editor-toolbar-input');
                  r.select = this.getForm().querySelector('#sparkline-select');
                  r.sparkline = this.getForm().querySelector('#sparkline-graph .sparkline');
                  r.selectionDataSet = this.getForm().querySelector('#sparkline-selection-dataset');
                  r.selectionRefArea = this.getForm().querySelector('#sparkline-selection-refarea');
                  break;

                default:
                  r = this.getForm().querySelector('textarea.medium-editor-toolbar-textarea');
                  break;
              }

              return r;
            },

            getAnchorTargetCheckbox: function () {
              return this.getForm().querySelector('.medium-editor-toolbar-textarea-target');
            },

            getAnchorButtonCheckbox: function () {
              return this.getForm().querySelector('.medium-editor-toolbar-textarea-button');
            },

            handleTextboxKeyup: function (event) {
              // For ENTER -> create the anchor
              if (event.keyCode === MediumEditor.util.keyCode.ENTER) {
                event.preventDefault();
                this.doFormSave();
                return;
              }

              // For ESCAPE -> close the form
              if (event.keyCode === MediumEditor.util.keyCode.ESCAPE) {
                event.preventDefault();
                this.doFormCancel();
              }
            },

            handleFormClick: function (event) {
              // make sure not to hide form when clicking inside the form
              event.stopPropagation();
            },

            handleSaveClick: function (event) {
              // Clicking Save -> create the anchor
              event.preventDefault();
              this.doFormSave();
            },

            handleCloseClick: function (event) {
              // Click Close -> close the form
              event.preventDefault();
              this.doFormCancel();
            }
          });
        }
      })()

    } //DO.U.Editor
  } //DO.U
}; //DO

if (document.readyState === "loading") {
  document.addEventListener('DOMContentLoaded', function(){ DO.C.init(); });
}
else {
  window.addEventListener("load", function(){ DO.C.init(); });
}

}

window.DO = DO;
export default DO
