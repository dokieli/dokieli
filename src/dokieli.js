/** dokieli
 *
 * Sarven Capadisli <info@csarven.ca> https://csarven.ca/#i
 * http://www.apache.org/licenses/LICENSE-2.0.html Apache License, Version 2.0
 * https://dokie.li/
 * https://github.com/dokieli/dokieli
 */

import { getResource, setAcceptRDFTypes, postResource, putResource, currentLocation, patchResourceGraph, patchResourceWithAcceptPatch, putResourceWithAcceptPut, copyResource, deleteResource } from './fetcher.js'
import { getDocument, getDocumentContentNode, escapeCharacters, showActionMessage, selectArticleNode, buttonClose, buttonInfo, notificationsToggle, showRobustLinksDecoration, getResourceInfo, getResourceSupplementalInfo, removeNodesWithIds, getResourceInfoSKOS, removeReferences, buildReferences, removeSelectorFromNode, insertDocumentLevelHTML, getResourceInfoSpecRequirements, getTestDescriptionReviewStatusHTML, createFeedXML, getButtonDisabledHTML, showTimeMap, createMutableResource, createImmutableResource, updateMutableResource, createHTML, getResourceImageHTML, setDocumentRelation, setDate, getLanguageOptionsHTML, getLicenseOptionsHTML, getNodeWithoutClasses, getDoctype, setCopyToClipboard, addMessageToLog, updateDocumentDoButtonStates, updateFeatureStatesOfResourceInfo, accessModeAllowed, getAccessModeOptionsHTML, focusNote, handleDeleteNote, parseMarkdown, getReferenceLabel, createNoteDataHTML, isButtonDisabled, hasNonWhitespaceText } from './doc.js'
import { getProxyableIRI, getPathURL, stripFragmentFromString, getFragmentOrLastPath, getFragmentFromString, getURLLastPath, getLastPathSegment, forceTrailingSlash, getBaseURL, getParentURLPath, encodeString, generateDataURI, getMediaTypeURIs, isHttpOrHttpsProtocol, isFileProtocol } from './uri.js'
import { getResourceGraph, getResourceOnlyRDF, traverseRDFList, getLinkRelation, getAgentName, getGraphImage, getGraphFromData, isActorType, isActorProperty, getGraphLabel, getGraphLabelOrIRI, getGraphConceptLabel, getUserContacts, getAgentInbox, getLinkRelationFromHead, getACLResourceGraph, getAccessSubjects, getAuthorizationsMatching, getGraphRights, getGraphLicense, getGraphLanguage, getGraphDate, getGraphAuthors, getGraphEditors, getGraphContributors, getGraphPerformers, getUserLabelOrIRI, getGraphTypes, filterQuads } from './graph.js'
import { notifyInbox, sendNotifications } from './inbox.js'
import { uniqueArray, fragmentFromString, generateAttributeId, sortToLower, getDateTimeISO, getDateTimeISOFromMDY, generateUUID, isValidISBN, findPreviousDateTime, domSanitize, sanitizeObject, escapeRDFLiteral, tranformIconstoCSS, getIconsFromCurrentDocument } from './util.js'
import { generateGeoView } from './geo.js'
import { getLocalStorageProfile, showAutoSaveStorage, hideAutoSaveStorage } from './storage.js'
import { showUserSigninSignout, showUserIdentityInput, getSubjectInfo, restoreSession } from './auth.js'
import { Icon } from './ui/icons.js'
import * as d3Selection from 'd3-selection';
import * as d3Force from 'd3-force';
const d3 = { ...d3Selection, ...d3Force };
import shower from '@shower/core'
import { diffChars } from 'diff'
import LinkHeader from 'http-link-header';
import rdf from 'rdf-ext';
import Config from './config.js';
import { Editor } from './editor/editor.js';
import { getButtonHTML } from './ui/button-icons.js'

const ns = Config.ns;
let DO;

if (typeof window.DO === 'undefined'){

DO = {
  C: Config,

  U: {
    getItemsList: function(url, options) {
      url = url || currentLocation();
      options = options || {};
      options['resourceItems'] = options.resourceItems || [];
      options['headers'] = options.headers || {};
      options['excludeMarkup'] = true;

      DO.C['CollectionItems'] = DO.C['CollectionItems'] || {};
      DO.C['CollectionPages'] = ('CollectionPages' in DO.C && DO.C.CollectionPages.length) ? DO.C.CollectionPages : [];
      DO.C['Collections'] = ('Collections' in DO.C && DO.C.Collections.length) ? DO.C.Collections : [];

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

            var s = g.node(rdf.namedNode(url));
// console.log(s.toString());

            var types = getGraphTypes(s);

            if (types.includes(ns.ldp.Container.value) ||
               types.includes(ns.as.Collection.value) ||
               types.includes(ns.as.OrderedCollection.value)) {
              DO.C.Collections.push(url);
            }

            if (!types.includes(ns.ldp.Container.value) &&
               !types.includes(ns.as.Collection.value) &&
               !types.includes(ns.as.OrderedCollection.value)) {
              DO.C.CollectionPages.push(url);
            }

            var items = [s.out(ns.as.items).values, s.out(ns.as.orderedItems).values, s.out(ns.ldp.contains).values];

            items.forEach(i => {
              i.forEach(resource => {
// console.log(resource)
                var r = s.node(rdf.namedNode(resource));

                if (r.out(ns.rdf.first).values.length || r.out(ns.rdf.rest).values.length) {
                  options.resourceItems = options.resourceItems.concat(traverseRDFList(s, resource));
                }
                else {
                  //FIXME: This may need to be processed outside of items? See also comment above about processing Collection and CollectionPages.
                  var types = getGraphTypes(r);
                  //Include only non-container/collection and items that's not from an RDFList
                  if (!types.includes(ns.ldp.Container.value) &&
                     !types.includes(ns.as.Collection.value) &&
                     !types.includes(ns.as.CollectionPage.value) &&
                     !types.includes(ns.as.OrderedCollection.value) &&
                     !types.includes(ns.as.OrderedCollectionPage.value)) {
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

            var first = s.out(ns.as.first).values;
            var next = s.out(ns.as.next).values;

            if (first.length && !DO.C.CollectionPages.includes(first[0])) {
              return DO.U.getItemsList(first[0], options);
            }
            else if (next.length && !DO.C.CollectionPages.includes(next[0])) {
              return DO.U.getItemsList(next[0], options);
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
      url = url || currentLocation();
      var notifications = [];

      DO.C.Inbox[url] = {};
      DO.C.Inbox[url]['Notifications'] = [];

      return getResourceGraph(url)
        .then(g => {
          DO.C.Inbox[url]['Graph'] = g;

          var s = g.node(rdf.namedNode(url));
          s.out(ns.ldp.contains).values.forEach(resource => {
// console.log(resource);
            var types = getGraphTypes(s.node(rdf.namedNode(resource)));
// console.log(types);
            if(!types.includes(ns.ldp.Container.value)) {
              notifications.push(resource);
            }
          });
// console.log(notifications);
          if (notifications.length) {
            DO.C.Inbox[url]['Notifications'] = notifications;
            return notifications;
          }
          else {
            var reason = {"message": "There are no notifications."};
            return Promise.reject(reason);
          }
        });
    },

    showInboxNotifications: function(url, data) {
      //TODO: Consider checking multiple getLinkRelation, [ns.ldp.inbox.value, ns.as.inbox.value]
      getLinkRelation(ns.ldp.inbox.value, url, data)
        .then(i => {
          i.forEach(inboxURL => {
            if (!DO.C.Inbox[inboxURL]) {
              DO.U.showNotificationSources(inboxURL);
            }
          });
        });
    },

    showNotificationSources: function(url) {
      DO.U.getNotifications(url).then(
        function(notifications) {
          notifications.forEach(notification => {
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

      var showProgress = function() {
        var info = aside.querySelector('div.info');
        var progressOld = info.querySelector('.progress');
        var progressNew = fragmentFromString(`<div class="progress">${Icon[".fas.fa-circle-notch.fa-spin.fa-fw"].replace(' fa-fw', '')} Checking activities</div>`);

        if (progressOld) {
          info.replaceChild(progressNew, progressOld)
        }
        else {
          info.appendChild(progressNew);
        }
      }

      var removeProgress = function() {
        var info = aside.querySelector('div.info');
        var progressOld = info.querySelector('.progress');
        info.removeChild(progressOld);
        DO.U.initializeButtonMore(aside);
      }

      var promises = [];
      promises.push(...DO.U.processAgentActivities(DO.C.User));

      showProgress();

      var processContacts = (contacts) => {
        if (contacts.length) {
          var contactsPromises = contacts.map((url) =>
            getSubjectInfo(url).then((subject) => {
              if (subject.Graph) {
                DO.C.User.Contacts[url] = subject;
                return DO.U.processAgentActivities(subject); 
              }
              return [];
            })
          );

          return Promise.allSettled(contactsPromises).then((allContactPromises) => {
            promises.push(...allContactPromises.flat());
          });
        }
        return Promise.resolve();
      };

      var processExistingContacts = (contacts) => {
        var contactsPromises = Object.keys(contacts).map((iri) => {
          var contact = DO.C.User.Contacts[iri];
          if (contact.IRI) {
            return DO.U.processAgentActivities(contact);
          }
          return [];
        });
    
        return Promise.allSettled(contactsPromises).then((allContactPromises) => {
          promises.push(...allContactPromises.flat());
        });
      };

      function getContactsAndActivities() {
        if (DO.C.User.Contacts && Object.keys(DO.C.User.Contacts).length) {
          return processExistingContacts(DO.C.User.Contacts);
        } else if (DO.C.User.IRI) {
          return getUserContacts(DO.C.User.IRI).then(processContacts);
        }
        return Promise.resolve();
      }

      getContactsAndActivities()
        .then(() => Promise.allSettled(promises))
        .then(() => removeProgress())
        .catch(() => removeProgress());
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

      var publicTypeIndexes = agent.TypeIndex[ns.solid.publicTypeIndex.value] || {};
      var privateTypeIndexes = agent.TypeIndex[ns.solid.privateTypeIndex.value] || {};
      //XXX: Perhaps these shouldn't be merged and kept apart or have the UI clarify what's public/private, and additional engagements keep that context
      var typeIndexes = Object.assign({}, publicTypeIndexes, privateTypeIndexes);

      var recognisedTypes = [];

      Object.values(typeIndexes).forEach(typeRegistration => {
        var forClass = typeRegistration[ns.solid.forClass.value];
        var instance = typeRegistration[ns.solid.instance.value];
        var instanceContainer = typeRegistration[ns.solid.instanceContainer.value];

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
      if (agent.Storage && agent.Storage.length) {
        if (agent.Outbox && agent.Outbox.length) {
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
      else if (agent.Outbox && agent.Outbox.length) {
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
          // console.log(g)
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

          var currentPathURL = currentLocation();

          var subjectsReferences = [];
          var subjects = [];
          g.out().quads().forEach(t => {
            subjects.push(t.subject.value);
          });
          subjects = uniqueArray(subjects);

          subjects.forEach(i => {
            var s = g.node(rdf.namedNode(i));
            var types = getGraphTypes(s);

            if (types.length) {
              var resourceTypes = types;

              var language = getGraphLanguage(s);
              var license = getGraphLicense(s);
              var rights = getGraphRights(s);

              //XXX: May need to be handled in a similar way to to as:Anounce/Create?
              if (resourceTypes.includes(ns.as.Like.value) ||
                 resourceTypes.includes(ns.as.Dislike.value)){
                var object = s.out(ns.as.object).values;
                if (object.length && getPathURL(object.values[0]) == currentPathURL) {
                  var context = s.out(ns.as.context).values;
                  if (context.length) {
                    subjectsReferences.push(context[0]);
                    return DO.U.showActivities(context[0])
                      .then(iri => iri)
                      .catch(e => console.log(context[0] + ': context is unreachable', e));
                  }
                  else {
                    var iri = s.term.value;
                    var targetIRI = object[0];
                    // var motivatedBy = 'oa:assessing';
                    var id = generateUUID(iri);
                    var refId = 'r-' + id;
                    var refLabel = id;

                    var bodyValue = (resourceTypes.includes(ns.as.Like.value)) ? 'Liked' : 'Disliked';
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

                    var actor = s.out(ns.as.actor).values;
                    if (actor.length) {
                      noteData['creator'] = {
                        'iri': actor[0]
                      }
                      var a = g.node(rdf.namedNode(noteData['creator']['iri']));
                      var actorName = getAgentName(a);
                      var actorImage = getGraphImage(a);

                      if (typeof actorName != 'undefined') {
                        noteData['creator']['name'] = actorName;
                      }
                      if (typeof actorImage != 'undefined') {
                        noteData['creator']['image'] = actorImage;
                      }
                    }
                    else if (resourceTypes.includes(ns.as.Dislike.value)) {
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
              else if (resourceTypes.includes(ns.as.Relationship.value)) {
                if (s.out(ns.as.subject).values.length && as.out(as.relationship).values.length && s.out(ns.as.object).values.length && getPathURL(s.out(ns.as.object).values[0]) == currentPathURL) {
                  var subject = s.out(ns.as.subject).values[0];
                  subjectsReferences.push(subject);
                  return DO.U.showActivities(subject)
                    .then(iri => iri)
                    .catch(e => console.log(subject + ': subject is unreachable', e));
                }
              }
              else if (resourceTypes.includes(ns.as.Announce.value) || resourceTypes.includes(ns.as.Create.value)) {
                var o = {};

                var object = s.out(ns.as.object).values.length ? s.out(ns.as.object).values[0] : undefined;
                //TODO: if no object, leave.

                var target = s.out(ns.as.target).values.length ? s.out(ns.as.target).values[0] : undefined;

                var objectGraph = s.node(rdf.namedNode(object));
                var inReplyTo = objectGraph.out(ns.as.inReplyTo).values.length && objectGraph.out(ns.as.inReplyTo).values[0];

                if (object && (target || inReplyTo)) {
                  var targetPathURL = getPathURL(target) || getPathURL(inReplyTo);

                  if (targetPathURL == currentPathURL) {
                    o['targetInOriginalResource'] = true;
                  }
                  else if (DO.C.Resource[documentURL].graph.out(ns.rel['latest-version']).values.length && targetPathURL == getPathURL(DO.C.Resource[documentURL].graph.out(ns.rel['latest-version']).values[0])) {
                    o['targetInMemento'] = true;
                  }
                  else if (DO.C.Resource[documentURL].graph.out(ns.owl.sameAs).values.length && DO.C.Resource[documentURL].graph.out(ns.owl.sameAs).values[0] == targetPathURL) {
                    o['targetInSameAs'] = true;
                  }

                  if (o['targetInOriginalResource'] || o['targetInMemento'] || o['targetInSameAs']) {
                    subjectsReferences.push(object);

                    if (options.notification) {
                      DO.C.Notification[url]['Activities'].push(object);
                    }

                    if (object.startsWith(url)) {
                      return DO.U.showAnnotation(object, s, o);
                    }
                    else {
                      s = s.node(rdf.namedNode(object));
                      var citation = {};

                      // if (target.startsWith(currentPathURL)) {
                        Object.keys(DO.C.Citation).forEach(citationCharacterization => {
                          var citedEntity = s.out(rdf.namedNode(citationCharacterization)).values;
                          // if(citedEntity) {
                            citedEntity.forEach(cE => {
                              if(cE.startsWith(currentPathURL)) {
                                o['objectCitingEntity'] = true;
                                citation = {
                                  'citingEntity': object,
                                  'citationCharacterization': citationCharacterization,
                                  'citedEntity': target || inReplyTo
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
              else if(resourceTypes.includes(ns.as.Add.value)) {
                var object = s.out(ns.as.object).values.length ? s.out(ns.as.object).values[0] : undefined;
                var target = s.out(ns.as.target).values.length ? s.out(ns.as.target).values[0] : undefined;
                var origin = s.out(ns.as.origin).values.length ? s.out(ns.as.origin).values[0] : undefined;


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
              else if (resourceTypes.includes(ns.oa.Annotation.value) && getPathURL(s.out(ns.oa.hasTarget).values[0]) == currentPathURL && !subjectsReferences.includes(i)) {
                return DO.U.showAnnotation(i, s);
              }
              else if (!subjectsReferences.includes(i) && documentTypes.some(item => resourceTypes.includes(item)) && s.out(ns.as.inReplyTo).values.length && s.out(ns.as.inReplyTo).values[0] && getPathURL(s.out(ns.as.inReplyTo).values[0]) == currentPathURL) {
                  subjectsReferences.push(i);
                return DO.U.showAnnotation(i, s);
              }
              else if (resourceTypes.includes(ns.bookmark.Bookmark.value) && s.out(ns.bookmark.recalls).values.length && getPathURL(s.out(ns.bookmark.recalls).values[0]) == currentPathURL ) {
                var iri = s.term.value;
                var targetIRI = s.out(ns.bookmark.recalls).values[0];
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
                  const { values } = s.out(rdf.namedNode(key));
                  if (values.length) {
                    creator = values[0];
                    return true;
                  }
                })

                if (creator){
                  noteData['creator'] = {
                    'iri': creator
                  }
                  var a = g.node(rdf.namedNode(noteData['creator']['iri']));
                  var actorName = getAgentName(a);
                  var actorImage = getGraphImage(a);

                  if (typeof actorName != 'undefined') {
                    noteData['creator']['name'] = actorName;
                  }
                  if (typeof actorImage != 'undefined') {
                    noteData['creator']['image'] = actorImage;
                  }
                }

                var datetime = getGraphDate(s);
                if (datetime) {
                  noteData['datetime'] = datetime;
                }

                if (license) {
                  noteData['license'] = license;
                }

                if (rights) {
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
      url = url || currentLocation();
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
      // Object.keys(group).forEach(i => {
      //   a.push('<div style="background-color:' + group[i].color + '; width:5em; height:5em;">' + group[i].label + '</div>');
      // });
      // getDocumentContentNode(document).insertAdjacentHTML('beforeend', a.join(''));


      if (selector == '#graph-view' && !document.getElementById('graph-view')) {
        document.body.appendChild(fragmentFromString(`<aside id="graph-view" class="do on">${DO.C.Button.Close}<h2>Graph view ${getButtonHTML({ button: 'info', buttonClass: 'info', buttonTitle: 'About Graph View', buttonRel: 'rel:help', buttonResource: Config.ButtonInfo['feature-graph-view'] })}</h2><div class="info"></div></aside>`));
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
      graphView.addEventListener('click', (e) => {
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

      if ('title' in options) {
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

        go.resources.forEach((i, index) => {
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
            .attr("cy", (d, i) => { return 150 + i*25 })
            .attr("r", nodeRadius)
            .attr("fill", (d) => { return legendInfo[d].color })

        graphLegend.selectAll("foobarbazqux")
          .data(legendGroups)
          .enter()
          .append("text")
            .attr("x", 25)
            .attr("y", (d, i) => { return 155 + i*25 })
            .attr("fill", (d) => { return legendInfo[d].color })
            .text((d) => { return legendInfo[d].label + ' (' + legendInfo[d].count + ')'} )
      }

      function handleResource (iri, headers, options) {
        return getResource(iri, headers, options)
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
        nodes.forEach(n => {
          nodeById.set(n.id, n);
        })
        var links = graph.links;
        var bilinks = [];

// console.log(graph)
// console.log(nodeById)
        var uniqueNodes = {};

        links.forEach(link => {
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
            .attr('stroke', function(d) {
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
                // var pIRI = getProxyableIRI(iri);
                if (iri.slice(0, 5).toLowerCase() == 'http:') {
                  options['noCredentials'] = true;
                }

                handleResource(iri, headers, options);
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
        return getGraphFromData(data, options)
          .then(g => {
            return DO.U.convertGraphToVisualisationGraph(requestURL, g, options);
          });
      }
      else if (typeof data == 'object') {
        return DO.U.convertGraphToVisualisationGraph(requestURL, data, options);
      }
      else if (typeof data == 'undefined') {
        if (DO.C.Resource[documentURL] && DO.C.Resource[documentURL].graph) {
          return DO.U.convertGraphToVisualisationGraph(requestURL, DO.C.Resource[documentURL].graph, options);
        }
        else {
          data = getDocument(null, optionsNormalisation);
          return getGraphFromData(data, options)
            .then(g => {
              return DO.U.convertGraphToVisualisationGraph(requestURL, g, options);
            });
        }
      }
    },

    //TODO: Review grapoi
    convertGraphToVisualisationGraph: function(url, g, options){
// console.log(g);
      DO.C['Graphs'] = DO.C['Graphs'] || {};

      var dataGraph = rdf.grapoi({ dataset: rdf.dataset().addAll(g.dataset)});
      var graphs = {};
      graphs[options['subjectURI']] = g;

      if ('mergeGraph' in options && options.mergeGraph) {
        graphs = Object.assign(DO.C.Graphs, graphs);
      }

      DO.C['Graphs'][options['subjectURI']] = g;

      Object.keys(graphs).forEach(i => {
        dataGraph.dataset.addAll(graphs[i].dataset);
      });

      var graphData = {"nodes":[], "links": [], "resources": options.resources };
      var graphNodes = [];

      dataGraph.out().quads().forEach(t => {
        if (
          // t.predicate.value == 'http://www.w3.org/1999/02/22-rdf-syntax-ns#first' ||
          // t.predicate.value == 'http://www.w3.org/1999/02/22-rdf-syntax-ns#rest' ||
          t.object.value == 'http://www.w3.org/1999/02/22-rdf-syntax-ns#nil'
          ) {
          return;
        }

        var sGroup = 8;
        var pGroup = 8;
        var oGroup = 8;
        var sVisited = false;
        var oVisited = false;

        switch(t.subject.termType) {
          default: case 'NamedNode':
            if (stripFragmentFromString(t.subject.value) != url) {
              sGroup = 7;
            }
            break;
          case 'BlankNode':
            sGroup = 8;
            break;
        }

        switch(t.object.termType) {
          default: case 'NamedNode':
            if (stripFragmentFromString(t.object.value) != url) {
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

        if (t.subject.value.startsWith('http://example.com/.well-known/genid/')) {
          sGroup = 8;
        }
        if (t.object.value.startsWith('http://example.com/.well-known/genid/')) {
          oGroup = 8;
        }

        if (t.predicate.value == ns.rdf.type.value){
          oGroup = 6;

          if (isActorType(t.object.value)) {
            sGroup = 10;
          }

          switch (t.object.value) {
            case ns.qb.DataSet.value:
              oGroup = 11;
              break;
            case ns.doap.Specification.value:
              sGroup = 14;
              break;
            case ns.odrl.Agreement.value:
            case ns.odrl.Assertion.value:
            case ns.odrl.Offer.value:
            case ns.odrl.Policy.value:
            case ns.odrl.Privacy.value:
            case ns.odrl.Request.value:
            case ns.odrl.Set.value:
            case ns.odrl.Ticket.value:
              sGroup = 15;
              break;
            case ns.schema.Event.value:
            case ns.bibo.Event.value:
            case ns.bibo.Conference.value:
              sGroup = 16;
              break;
            case ns.bibo.Slide.value:
              sGroup = 17;
              break;
            // case ns.skos.Collection.value:
            //   sGroup = 18; //Assign Concepts colour to Collection?
            //   break;
          }
        }

        if (t.subject.value == 'http://purl.org/ontology/bibo/presentedAt') {
          oGroup = 16;
        }
        if (Config.Event.Property.hasOwnProperty(t.predicate.value)) {
          sGroup = 16;
        }

        if (isActorProperty(t.predicate.value)) {
          oGroup = 10;
        }
        if (t.predicate.value.startsWith('http://purl.org/spar/cito/')) {
          oGroup = 9;
        }
        switch(t.predicate.value) {
          case ns.foaf.knows.value:
            sGroup = 10;
            oGroup = 10;
            break;
          case ns.spec.requirement.value:
          case ns.spec.requirementReference.value:
            oGroup = 12;
            break;
          case ns.spec.advisement.value:
            oGroup = 13;
            break;
          case ns.spec.testSuite.value:
            oGroup = 11;
            break;
          case ns.odrl.hasPolicy.value:
            oGroup = 15;
            break;
          case ns.skos.hasTopConcept.value:
          case ns.skos.inScheme.value:
          case ns.skos.semanticRelation.value:
          case ns.skos.topConceptOf.value:
          case ns.schema.audience.value:
            oGroup = 18;
            break;
        }

        if (DO.C.Graphs[t.subject.value]) {
          // sGroup = 1;
          sVisited = true;
        }
        if (DO.C.Graphs[t.object.value]) {
          // oGroup = 1;
          oVisited = true;
        }

        //Initial root node
        if (t.subject.value == url) {
          sGroup = 5;
          sVisited = true;
        }

        if (t.object.value == url) {
          oGroup = 5;
          oVisited = true;
        }

        //FIXME: groups are set once - not updated.

        var objectValue = t.object.value;
        if (t.object.termType == 'Literal') {
          //TODO: Revisit
          // if(t.object.datatype.termType.value == 'http://www.w3.org/rdf/1999/02/22-rdf-syntax-ns#HTML') {
          // }
          // objectValue = escapeCharacters(objectValue);
          objectValue = domSanitize(objectValue);
        }

        //XXX: Don't remember why this if was included but it seems to be problematic since it skips adding nodes where the object doesn't have a type. So commenting it out for now. Seems to work as expected.
        // if (!g.node(rdf.namedNode(t.object.value)).out(ns.rdf.type).values.length) {
          if (!graphNodes.includes(t.subject.value)) {
            graphNodes.push(t.subject.value);
            graphData.nodes.push({"id": t.subject.value, "group": sGroup, "visited": sVisited });
          }

          if (!graphNodes.includes(t.object.value)) {
            if (t.object.value in DO.C.Resource) {
              // console.log(t.object.value)
              DO.C.Resource[t.object.value].graph.out(ns.rdf.type).values.forEach(type => {
                if (isActorType(type)) {
                  // console.log(type)
                  oGroup = 10
                }
              })
            }

            graphNodes.push(objectValue);
            graphData.nodes.push({"id": objectValue, "group": oGroup, "visited": oVisited });
          }
        // }

        graphData.links.push({"source": t.subject.value, "target": objectValue, "value": t.predicate.value});
      });
// console.log(graphNodes)

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
        var property = (resources && 'filter' in options && 'predicates' in options.filter && options.filter.predicates.length) ? options.filter.predicates[0] : ns.ldp.inbox.value;
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

    //TODO: Review grapoi
    showGraphResources: function(resources, selector, options) {
      selector = selector || getDocumentContentNode(document);
      options = options || {};
      if (Array.isArray(resources)) {
        resources = uniqueArray(resources);
      }

      DO.U.processResources(resources, options)
        .then(urls => {
          var promises = [];
          urls.forEach(url => {
            // window.setTimeout(function () {
              promises.push(getResourceGraph(url));
            // }, 1000)
          });

          Promise.allSettled(promises)
            .then(resolvedPromises => {
              let dataset = rdf.dataset();
        
              resolvedPromises.forEach(response => {
                if (response.value) {
                  dataset.addAll(response.value.dataset);
                }
              })

              if (options.filter) {
                var g = rdf.grapoi({ dataset });

                const quads = filterQuads(g.out().quads(), options);

                dataset = rdf.dataset(quads);
              }

              options['contentType'] = 'text/turtle';
              options['resources'] = resources;
              // options['subjectURI'] = url;

              //FIXME: For multiple graphs (fetched resources), options.subjectURI is the last item, so it is inaccurate
              DO.U.showVisualisationGraph(options.subjectURI, dataset.toCanonical(), selector, options);
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
      const params = new URLSearchParams(window.location.search);
      return params.get(name);
    },

    initAuth: function() {
      // console.log(window.location.href)

      restoreSession().then(() => {
        if (!Config['Session']) {
          console.log("No session");
          return;
        }

        console.log("Logged in: ", Config['Session'].webId);
      })
    },

    initUser: function() {
      getLocalStorageProfile().then(user => {
        if (user && 'object' in user) {
          // user.object.describes.Role = (DO.C.User.IRI && user.object.describes.Role) ? user.object.describes.Role : 'social';

          DO.C['User'] = sanitizeObject(user.object.describes);
        }
      })
    },

    getContentNode: function(node) {
      return getDocumentContentNode(document);
    },

    initEditor: function(options = {}) {
      DO['Editor'] = new Editor();
      const tmpl = options.template || (Config.Editor.new ? 'new' : null);
      options = tmpl ? { template: tmpl } : {};
      DO.Editor.init(null, null, options);
    },

    setDocumentURL: function(url) {
      url = url || currentLocation();

      DO.C.DocumentURL = stripFragmentFromString(url);
    },

    setDocumentString: function(node) {
      DO.C.DocumentString = getDocument(node);
    },

    setDocumentMode: function(mode) {
      Config.Editor.mode = mode || Config.Editor.mode;

      var style = domSanitize(DO.U.urlParam('style'));

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

      var open = domSanitize(DO.U.urlParam('open'));
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
        showActionMessage(document.body, message);

        DO.U.openResource(open);

        window.history.replaceState({}, null, document.location.href.substr(0, document.location.href.lastIndexOf('?')));
      }

      if (DO.C.GraphViewerAvailable) {
        var searchParams = new URLSearchParams(window.location.search);
        var graphs = searchParams.getAll('graph');

        var urls = graphs.map(url => {
          url = domSanitize(url);
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

        if (urls.length) {
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
          showActionMessage(document.body, message);

          DO.U.showGraph(urls, '#graph-view', options);

          window.history.replaceState({}, null, document.location.href.substr(0, document.location.href.lastIndexOf('?graph')));
        }
      }

      if (DO.U.urlParam('author') == 'true' || DO.U.urlParam('social') == 'true') {
        if (DO.U.urlParam('social') == 'true') {
          Config.Editor.mode = 'social';
        }
        else if (DO.U.urlParam('author') == 'true') {
          Config.Editor.mode = 'author';
        }
        var url = document.location.href;
        window.history.replaceState({}, null, url.substr(0, url.lastIndexOf('?')));
      }
      else if (DO.C.Resource[DO.C.DocumentURL].contentType == 'text/html') {
        // var tmpl = document.implementation.createHTMLDocument('template');
        // var fragment = fragmentFromString(DO.C.Resource[DO.C.DocumentURL].data);
        // tmpl.documentElement.replaceChildren(fragment);
        var node = selectArticleNode(document);
        var hasContent = hasNonWhitespaceText(node);

        if (!hasContent) {
          Config.Editor.mode = 'author';
          Config.Editor.new = true;
        }
      }
    },

    initDocumentActions: function() {
      buttonClose();
      buttonInfo();
      notificationsToggle();
      showRobustLinksDecoration();
      focusNote();

      var documentURL = DO.C.DocumentURL;

      //Fugly
      function checkResourceInfo() {
// console.log(DO.C.Resource[documentURL])

        if (documentURL in DO.C.Resource && 'state' in DO.C.Resource[documentURL]) {
          DO.U.processPotentialAction(DO.C.Resource[documentURL]);

          if (DO.C.Resource[documentURL].inbox?.length && !DO.C.Inbox[DO.C.Resource[documentURL].inbox[0]]) {
            DO.U.showNotificationSources(DO.C.Resource[documentURL].inbox[0]);
          }
        }
        else {
          getResourceInfo(DO.C.DocumentString).then(resourceInfo => {
            DO.U.processPotentialAction(resourceInfo);

            if (DO.C.Resource[documentURL].inbox?.length && !DO.C.Inbox[DO.C.Resource[documentURL].inbox[0]]) {
              DO.U.showNotificationSources(DO.C.Resource[documentURL].inbox[0]);
            }
          });
          // window.setTimeout(checkResourceInfo, 100);
        }
      }

      checkResourceInfo();

      DO.U.processActivateAction();

      var licenseOptions = document.querySelectorAll('[about="#feature-license-options"][typeof="schema:ChooseAction"], [href="#feature-license-options"][typeof="schema:ChooseAction"], [resource="#feature-license-options"][typeof="schema:ChooseAction"]');
      for (var i = 0; i < licenseOptions.length; i++){
        licenseOptions[i].parentNode.replaceChild(fragmentFromString('<select>' + getLicenseOptionsHTML() + '</select>'), licenseOptions[i]);
      }

      var languageOptions = document.querySelectorAll('[about="#feature-language-options"][typeof="schema:ChooseAction"], [href="#feature-language-options"][typeof="schema:ChooseAction"], [resource="#feature-language-options"][typeof="schema:ChooseAction"]');
      for (var i = 0; i < languageOptions.length; i++){
        languageOptions[i].parentNode.replaceChild(fragmentFromString('<select>' + getLanguageOptionsHTML() + '</select>'), languageOptions[i]);
      }
    },

    processActivateAction: function() {
      document.addEventListener('click', (e) => {
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

    //TODO: Review grapoi
    processPotentialAction: function(resourceInfo) {
      var g = resourceInfo.graph;
      var triples = g.out().quads();
      triples.forEach(t => {
        var s = t.subject.value;
        var p = t.predicate.value;
        var o = t.object.value;

        if (p == ns.schema.potentialAction.value) {
          var action = o;
          var documentOrigin = (document.location.origin === "null") ? "file://" : document.location.origin;
          var originPathname = documentOrigin + document.location.pathname;
// console.log(originPathname)
// console.log(action.startsWith(originPathname + '#'))
          if (action.startsWith(originPathname)) {
            document.addEventListener('click', (e) => {
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

                  var so = g.node(rdf.namedNode(action)).out(ns.schema.object).values;
                  if (so.length) {
                    selector = '#' + element.closest('[id]').id;

                    var svgGraph = document.querySelector(selector + ' svg');
                    if (svgGraph) {
                      svgGraph.nextSibling.parentNode.removeChild(svgGraph.nextSibling);
                      svgGraph.parentNode.removeChild(svgGraph);
                    }
                    else {
                      // serializeGraph(g, { 'contentType': 'text/turtle' })
                      //   .then(data => {
                          var options = {};
                          options['subjectURI'] = so[0];
                          options['contentType'] = 'text/turtle';
                          DO.U.showVisualisationGraph(options.subjectURI, g.dataset.toCanonical(), selector, options);
                        // });
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
      document.body.appendChild(fragmentFromString('<menu id="document-menu" class="do"><button class="show" title="Open menu">' + Icon[".fas.fa-bars"] + '</button><header></header><div></div><footer><dl><dt>About</dt><dd id="about-dokieli"><img alt="" height="16" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAMAAAD04JH5AAAAn1BMVEUAAAAAjwAAkAAAjwAAjwAAjwAAjwAAjwAAkAAAdwAAjwAAjQAAcAAAjwAAjwAAiQAAjwAAjAAAjwAAjwAAjwAAjwAAkAAAjwAAjwAAjwAAjQAAjQAAhQAAhQAAkAAAkAAAkAAAjgAAjwAAiQAAhAAAkAAAjwAAjwAAkAAAjwAAjgAAjgAAjQAAjwAAjQAAjwAAkAAAjwAAjQAAiwAAkABp3EJyAAAANHRSTlMA+fH89enaabMF4iADxJ4SiSa+uXztyoNvQDcsDgvl3pRiXBcH1M+ppJlWUUpFMq6OdjwbMc1+ZgAABAhJREFUeNrt29nSmkAQBeAGZBMUxH3f993/vP+zJZVKVZKCRhibyc3/XVt6SimYPjPSt28Vmt5W/fu2T/9B9HIf7Tp+0RsgDC6DY6OLvzxJj8341DnsakgZUNUmo2XsORYYS6rOeugukhnyragiq56JIs5UEQ/FXKgidRTzompEKOhG1biioDFV44mCAqrGAQWtqRptA8VMqCpR6zpo9iy84VO1opWHPBZVb9QAzyQN/D1YNungJ+DMSYsbOFvSIwGjR3p0wGiQHkMw2qRHC4w76RGBcSA9NmAcSY8QjAdpYiFbTJoYyNYnTWrI1iFNusj2JE1sZBuQJtyE5pImc3Y21cRhZ1NNtsh2Ik127HCsSY8djjVpINuVhPnjVefobee2adXqu2S/6FyivABDEjQ9Lxo1pDlNd5wg24ikRK5ngKGhHhg1DSgZk4RrD6pa9LlRAnUBfWp6xCe+6EOvOT6yrmrigZaCZHPAp6b0gaiBFKvRd0/D1rr1OrvxDqiyoZmmPt9onib0t/VybyEXqdu0Cw16rUNVAfZFlzdjr5KOaoAUK6JsrgWGQapuBlIS4gy70gEmTrk1fuAgU40UxWXv6wvZAC2Dqfx0BfBK1z1H0aJ0WH7Ub4oG8JDlpBCgK1l5tSjHQSoAf0HVfMqxF+yqpzVk2ZGuAGdk8ijPHZlmpOCg0vh5cgE2JtN3qQSoU3lXpbKlLRegrzTpt+U2TNpKY2YiFiA0kS1Q6QccweZ/oinASm2B3RML0AGDNAU4qq3udmIXYVttD3YrFsBR24N1xG5EJpTeaiYWwILS5WRKBfChFsCSehpOwKi/yS0V4AsMWym3TWUFgMqIsRYL8AVOSDlaYgEitbZnDKll+UatchyJBSC1c3lDuQA2VHYAL3KneHpgLCjHSS7AHYyEciwh1g88wDB94rlyAVxwhsR7ygW4gRMTry8XwDdUDkXFgjVdD5wRsRaCAWJwPGI1Baval8Ie3Hqn8AjjhHbZr2DzrInumDTBGlCG8xy8QPY3MNLX4TiRP1q+BWs2pn9ECwu5+qTABc+80h++28UbTkjlTW3wrM6Ufrtu8d5J9Svg1Vch/RTcUYQdUHm+g1z1x2gSGyjGGVN5F7xjoTCjE0ndC3jJMzfCftmiciZ1lNGe3vCGufOWVMLIQHHehi3X1O8JJxR236SalUzninbu937BlwfV/I3k4KdGk2xm+MHuLa8Z0i9TC280qLRrF+8cw9RSjrOg8oIG8j2YgULsbGPomsgR0x9nsOzkOLh+kZr1owZGbfC2JJl78fIV0Wei/gxZDl85XWVtt++cxhuSEQ6bdfzLjlvM86PbaD4vQUjSglV8385My7CdXtO9+ZSyrLcf7nBN376V8gMpRztyq6RXYQAAAABJRU5ErkJggg==" width="16" /><a href="https://dokie.li/" target="_blank">dokieli</a> is an ' + Icon[".fab.fa-osi"] + ' <a href="https://github.com/dokieli/dokieli" target="_blank">open source</a> project. There is ' + Icon[".fas.fa-flask"] + ' <a href="https://dokie.li/docs" target="_blank">documentation</a> and public ' + Icon[".fas.fa-comments"] + ' <a href="https://matrix.to/#/%23dokieli:matrix.org" target="_blank">chat</a>. Made with fun.</dd></dl></footer></menu>'));
      document.querySelector('#document-menu').addEventListener('click', (e) => {
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
      dMenuButton.setHTMLUnsafe(domSanitize(Icon[".fas.fa-minus"]));
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
      dMenuButton.setHTMLUnsafe(domSanitize(Icon[".fas.fa-bars"]));
      removeNodesWithIds(DO.C.DocumentDoItems);
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

    generateCSSBasedOnCurrentDocumentIcons: function() {
      var icons = getIconsFromCurrentDocument();
      var css = tranformIconstoCSS(icons);
      console.log(css);
    },

    getCurrentLinkStylesheet: function() {
      return document.querySelector('head link[rel="stylesheet"][title]:not([href$="dokieli.css"]):not([disabled])');
    },

    showViews: function(node) {
      if(document.querySelector('#document-views')) { return; }

      var stylesheets = document.querySelectorAll('head link[rel~="stylesheet"][title]:not([href$="dokieli.css"])');

      var s = '<section id="document-views"><h2>Views</h2>' + Icon[".fas.fa-magic"] + '<ul>';
      if (DO.C.GraphViewerAvailable) {
        s += '<li><button class="resource-visualise" title="Change to graph view">Graph</button></li>';
      }
      s += '<li><button title="Change to native device/browser view">Native</button></li>';

      if (stylesheets.length) {
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
      node.insertAdjacentHTML('beforeend', domSanitize(s));

      var viewButtons = document.querySelectorAll('#document-views button:not([class~="resource-visualise"])');
      for (let i = 0; i < viewButtons.length; i++) {
        viewButtons[i].removeEventListener('click', DO.U.initCurrentStylesheet);
        viewButtons[i].addEventListener('click', DO.U.initCurrentStylesheet);
      }

      if(DO.C.GraphViewerAvailable) {
        document.querySelector('#document-views').addEventListener('click', (e) => {
          if (e.target.closest('.resource-visualise')) {
            if(document.querySelector('#graph-view')) { return; }

            if (e) {
              e.target.disabled = true;
            }

            document.body.appendChild(fragmentFromString(`<aside id="graph-view" class="do on">${DO.C.Button.Close}<h2>Graph view ${getButtonHTML({ button: 'info', buttonClass: 'info', buttonTitle: 'About Graph View', buttonRel: 'rel:help', buttonResource: Config.ButtonInfo['feature-graph-view'] })}</h2><div class="info"></div></aside>`));

            var graphView = document.getElementById('graph-view');
            graphView.addEventListener('click', (e) => {
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

      var bd = document.querySelectorAll('#document-views button');
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
          dMenuButton.setHTMLUnsafe(domSanitize(Icon[".fas.fa-minus"]));
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
        if (scriptCurrent.length) {
          for(var i = 0; i < scriptCurrent.length; i++) {
            var v = scriptCurrent[i];
            var id = v.id;
            scriptCurrentData[id] = v.getHTML().split(/\r\n|\r|\n/);
            scriptCurrentData[id].shift();
            scriptCurrentData[id].pop();
            scriptCurrentData[id] = {
              'type': v.getAttribute('type') || '',
              'title': v.getAttribute('title') || '',
              'content' : scriptCurrentData[id].join('\n')
            };
          }
        }

        var embedMenu = `
        <aside id="embed-data-entry" class="do on tabs">${DO.C.Button.Close}
          <h2>Embed Data ${getButtonHTML({ button: 'info', buttonClass: 'info', buttonTitle: 'About Embed Data', buttonRel: 'rel:help', buttonResource: Config.ButtonInfo['feature-embed-data'] })}</h2>
          <div class="info"></div>
          <nav><ul><li class="selected"><a href="#embed-data-turtle">Turtle</a></li><li><a href="#embed-data-json-ld">JSON-LD</a></li><li><a href="#embed-data-trig">TriG</a></li></ul></nav>
          <div id="embed-data-turtle" class="selected"><textarea placeholder="Enter data in Turtle" name="meta-turtle" cols="80" rows="24">${(scriptCurrentData['meta-turtle'] ? scriptCurrentData['meta-turtle'].content : '')}</textarea><button class="save" title="Embed data into document">Save</button></div>
          <div id="embed-data-json-ld"><textarea placeholder="Enter data in JSON-LD" name="meta-json-ld" cols="80" rows="24">${(scriptCurrentData['meta-json-ld'] ? scriptCurrentData['meta-json-ld'].content : '')}</textarea><button class="save" title="Embed data into document">Save</button></div>
          <div id="embed-data-trig"><textarea placeholder="Enter data in TriG" name="meta-trig" cols="80" rows="24">${(scriptCurrentData['meta-trig'] ? scriptCurrentData['meta-trig'].content : '')}</textarea><button class="save" title="Embed data into document">Save</button></div>
        </aside>
        `;

        document.body.appendChild(fragmentFromString(embedMenu));
        document.querySelector('#embed-data-turtle textarea').focus();
        var a = document.querySelectorAll('#embed-data-entry nav a');
        for(let i = 0; i < a.length; i++) {
          a[i].addEventListener('click', (e) => {
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

        document.querySelector('#embed-data-entry button.close').addEventListener('click', (e) => {
          document.querySelector('button.embed-data-meta').removeAttribute('disabled');
        });

        var buttonSave = document.querySelectorAll('#embed-data-entry button.save');
        for (let i = 0; i < buttonSave.length; i++) {
          buttonSave[i].addEventListener('click', (e) => {
            var textarea = e.target.closest('.selected').querySelector('textarea');
            var name = textarea.getAttribute('name');
            var scriptEntry = domSanitize(textarea.value);
            var script = document.getElementById(name);
            if (scriptEntry.length) {
              //If there was a script already
              if (script) {
                script.textContent = scriptType[name].cdataStart + scriptEntry + scriptType[name].cdataEnd;
              }
              else {
                document.querySelector('head').insertAdjacentHTML('beforeend',
                  scriptType[name].scriptStart +
                  scriptType[name].cdataStart +
                  scriptEntry +
                  scriptType[name].cdataEnd +
                  scriptType[name].scriptEnd
                );
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

    //TODO: Review grapoi
    showDocumentMetadata: function(node) {
      if(document.querySelector('#document-metadata')) { return; }

      var documentURL = DO.C.DocumentURL;

      var content = selectArticleNode(document);
      var count = DO.U.contentCount(content);
      var authors = [], contributors = [], editors = [], performers = [];
      var citationsTo = [];
      var requirements = [];
      var advisements = [];
      var skos = [];

      // var subjectURI = currentLocation();
      // var options = {'contentType': 'text/html', 'subjectURI': subjectURI };
// console.log(options)
      var g = DO.C.Resource[documentURL].graph;
      var citations = Object.keys(DO.C.Citation).concat([ns.dcterms.references.value, ns.schema.citation.value]);
      var triples = g.out().quads();
      // g.out().terms.length
      for (const t of triples) {
// console.log(t)
        var s = t.subject.value;
        var p = t.predicate.value;
        var o = t.object.value;

        //TODO: Distinguish between external/internal for DO.C.Resource[documentURL].citations (right now it is external only), then use that for citations in showDocumentMetadata instead of using this triples.forEach
        if (citations.includes(p)) {
          citationsTo.push(t);
        }
      };

      requirements = (DO.C.Resource[documentURL].spec && DO.C.Resource[documentURL].spec['requirement']) ? Object.keys(DO.C.Resource[documentURL].spec['requirement']) : [];
      advisements = (DO.C.Resource[documentURL].spec && DO.C.Resource[documentURL].spec['advisement']) ? Object.keys(DO.C.Resource[documentURL].spec['advisement']) : [];
      skos = (DO.C.Resource[documentURL].skos) ? DO.C.Resource[documentURL].skos : [];

      citations = '<tr class="citations"><th>Citations</th><td>' + citationsTo.length + '</td></tr>';
      requirements = '<tr class="requirements"><th>Requirements</th><td>' + requirements.length + '</td></tr>';
      advisements = '<tr class="advisements"><th>Advisements</th><td>' + advisements.length + '</td></tr>';
      var conceptsList = [];
      conceptsList = (skos.type && skos.type[ns.skos.Concept.value]) ? skos.type[ns.skos.Concept.value] : conceptsList;

      var concepts = '<tr class="concepts"><th>Concepts</th><td>' + conceptsList.length + '</td></tr>';
      // TODO: Review grapoi . Check it matches expected
      var statements = '<tr class="statements"><th>Statements</th><td>' + g.out().terms.length + '</td></tr>';

      var graphEditors = getGraphEditors(g);
      var graphAuthors = getGraphAuthors(g);
      var graphContributors = getGraphContributors(g);
      var graphPerformers = getGraphPerformers(g);

      if (graphEditors) {
        graphEditors.forEach(i => {
          var go = g.node(rdf.namedNode(i));
          let name = getGraphLabelOrIRI(go);
          name = (name === i) ? getUserLabelOrIRI(i) : name;
          editors.push(`<li>${name}</li>`);
        });
        if (editors.length){
          editors = '<tr class="people"><th>Editors</th><td><ul class="editors">' + editors.join('') + '</ul></td></tr>';
        }
      }

      if (graphAuthors) {
        graphAuthors.forEach(i => {
          var go = g.node(rdf.namedNode(i));
          let name = getGraphLabelOrIRI(go);
          name = (name === i) ? getUserLabelOrIRI(i) : name;
          authors.push(`<li>${name}</li>`);
        });
        if (authors.length){
          authors = '<tr class="people"><th>Authors</th><td><ul class="authors">' + authors.join('') + '</ul></td></tr>';
        }
      }

      if (graphContributors) {
        graphContributors.forEach(i => {
          var go = g.node(rdf.namedNode(i));
          let name = getGraphLabelOrIRI(go);
          name = (name === i) ? getUserLabelOrIRI(i) : name;
          contributors.push(`<li>${name}</li>`);
        });
        if (contributors.length){
          contributors = '<tr class="people"><th>Contributors</th><td><ul class="contributors">' + contributors.join('') + '</ul></td></tr>';
        }
      }

      if (graphPerformers) {
        graphPerformers.forEach(i => {
          var go = g.node(rdf.namedNode(i));
          let name = getGraphLabelOrIRI(go);
          name = (name === i) ? getUserLabelOrIRI(i) : name;
          performers.push(`<li>${name}</li>`);
        });
        if (performers.length){
          performers = '<tr class="people"><th>Performers</th><td><ul class="performers">' + performers.join('') + '</ul></td></tr>';
        }
      }

      var data = authors + editors + contributors + performers + citations + requirements + advisements + concepts + statements;

          // <tr><th>Lines</th><td>' + count.lines + '</td></tr>\n\
          // <tr><th>A4 Pages</th><td>' + count.pages.A4 + '</td></tr>\n\
          // <tr><th>US Letter</th><td>' + count.pages.USLetter + '</td></tr>\n\
      var html = '<section id="document-metadata"><table>\n\
        <caption>Document Metadata</caption>\n\
        <tbody>\n\
          ' + data + '\n\
          <tr><th>Reading time</th><td>' + count.readingTime + ' minutes</td></tr>\n\
          <tr><th>Characters</th><td>' + count.chars + '</td></tr>\n\
          <tr><th>Words</th><td>' + count.words + '</td></tr>\n\
          <tr><th>Bytes</th><td>' + count.bytes + '</td></tr>\n\
        </tbody>\n\
      </table></section>';

      node.insertAdjacentHTML('beforeend', domSanitize(html));
    },

    contentCount: function contentCount (node) {
      node = node || selectArticleNode(document);
      node = getNodeWithoutClasses(node, 'do');
      var doctype = (node instanceof Element && node.tagName.toLowerCase() === 'html') ? getDoctype() : '';
      var content = node.textContent.trim();
      var contentCount = { readingTime:1, words:0, chars:0, lines:0, pages:{A4:1, USLetter:1}, bytes:0 };
      if (content.length) {
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

    //TODO: Review grapoi
    showExtendedConcepts: function() {
      var documentURL = DO.C.DocumentURL;
      var citationsList = DO.C.Resource[documentURL].citations;

      var promises = [];
      citationsList.forEach(url => {
        // console.log(u);
        // window.setTimeout(function () {
          // var pIRI = getProxyableIRI(u);
          promises.push(getResourceGraph(url));
        // }, 1000)
      });

      var dataset = rdf.dataset();
      var html = [];
      var options = { 'resources': [] };

      return Promise.allSettled(promises)
        .then(results => results.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value))
        .then(graphs => {
// console.log(graphs);
          graphs.forEach(g => {
            if (g && g.out().terms.length){
            // if (g) {
              var documentURL = g.term.value;
              g = rdf.grapoi({dataset: g.dataset})
// console.log(documentURL)
// console.log(g)
              DO.C.Resource[documentURL] = DO.C.Resource[documentURL] || {};
              DO.C.Resource[documentURL]['graph'] = g;
              DO.C.Resource[documentURL]['skos'] = getResourceInfoSKOS(g);
              DO.C.Resource[documentURL]['title'] = getGraphLabel(g) || documentURL;

              if (DO.C.Resource[documentURL]['skos']['graph'].out().terms.length) {
                html.push('<section><h4><a href="' + documentURL + '">' + DO.C.Resource[documentURL]['title'] + '</a></h4><div><dl>' + DO.U.getDocumentConceptDefinitionsHTML(documentURL) + '</dl></div></section>');

                dataset.addAll(DO.C.Resource[documentURL]['skos']['graph'].dataset);
                options['resources'].push(documentURL);
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

          loC.querySelector('div').insertAdjacentHTML('beforeend', domSanitize(html));

          // insertDocumentLevelHTML(document, html, { 'id': id });

          aC = document.getElementById(id);
          window.history.replaceState(null, null, '#' + id);
          aC.scrollIntoView();

          var selector = '#' + id + ' figure';

          aC.addEventListener('click', (e) => {
            var button = e.target.closest('button.graph');
            if (button) {
              button.parentNode.removeChild(button);

              // serializeGraph(dataset, { 'contentType': 'text/turtle' })
              //   .then(data => {
              ///FIXME: This DO.C.DocumentURL doesn't seem right other than what the visualisation's root node becomes?
                  options['subjectURI'] = DO.C.DocumentURL;
                  options['contentType'] = 'text/turtle';
                  //FIXME: For multiple graphs (fetched resources), options.subjectURI is the last item, so it is inaccurate
                  DO.U.showVisualisationGraph(options.subjectURI, dataset.toCanonical(), selector, options);
                // });
            }
          })

// console.log(dataGraph)


// console.log(DO.C.Resource)
          return dataset;
        });
    },

    //TODO: Review grapoi
    getDocumentConceptDefinitionsHTML: function(documentURL) {
// console.log(documentURL)
      var s = '';
      Object.keys(DO.C.Resource[documentURL]['skos']['type']).forEach(rdftype => {
// console.log(rdftype)
        s += '<dt>' + DO.C.SKOSClasses[rdftype] + 's</dt>';

        if (rdftype == ns.skos.Concept.value) {
          s += '<dd><ul>';
        }

        sortToLower(DO.C.Resource[documentURL]['skos']['type'][rdftype]).forEach(subject => {
          var g = DO.C.Resource[documentURL]['graph'].node(rdf.namedNode(subject));

          var conceptLabel = sortToLower(getGraphConceptLabel(g));
// console.log(conceptLabel)
          conceptLabel = (conceptLabel.length) ? conceptLabel.join(' / ') : getFragmentOrLastPath(subject);
          conceptLabel = conceptLabel.trim();
          conceptLabel = '<a href="' + subject + '">' + conceptLabel + '</a>';

          if (rdftype == ns.skos.Concept.value) {
            s += '<li>' + conceptLabel + '</li>';
          }
          else {
            s += '<dd>';
            s += '<dl>';
            s += '<dt>' + conceptLabel + '</dt><dd><ul>';

            var hasConcepts = [ns.skos.hasTopConcept.value, ns.skos.member.value];

            hasConcepts.forEach(hasConcept => {
              var concept = DO.C.Resource[documentURL]['skos']['data'][subject][hasConcept];

              if (concept?.length) {
                sortToLower(concept).forEach(c => {
                  var conceptGraph = DO.C.Resource[documentURL]['graph'].node(rdf.namedNode(c));
                  var cLabel = getGraphConceptLabel(conceptGraph);
                  cLabel = (cLabel.length) ? cLabel : [getFragmentOrLastPath(c)];
                  cLabel.forEach(cL => {
                    cL = cL.trim();
                    console.log(cL)
                    s += '<li><a href="' + c + '">' + cL + '</a></li>';
                  });
                });
              }
            });
            s += '</ul></dd></dl>';
            s += '</dd>';
          }
        })

        if (rdftype == ns.skos.Concept.value) {
          s += '</ul></dd>';
        }
      });

      return s;
    },

    showDocumentCommunicationOptions: function(node) {
      var communicationOptionsHTML = [];

      var documentURL = DO.C.DocumentURL;

      function waitUntil() {
        if (!DO.C.Resource[documentURL].headers?.linkHeaders?.has('rel', 'describedby')) {
          window.setTimeout(waitUntil, 250);
        }
        else {
          var db = DO.C.Resource[documentURL].headers.linkHeaders.rel('describedby');

          if (!db.every(relationItem => DO.C.Resource[relationItem.uri]?.graph !== undefined)) {
            window.setTimeout(waitUntil, 250);
          }
          else {
            db.forEach(relationItem => {
              if (DO.C.Resource[relationItem.uri]?.graph !== undefined) {
                communicationOptionsHTML.push(DO.U.getCommunicationOptions(DO.C.Resource[relationItem.uri].graph, { 'subjectURI': documentURL }));
              }
            });

            communicationOptionsHTML.forEach(html => {
              node.insertAdjacentHTML('beforeend', domSanitize(html));
              var nodes = document.querySelectorAll('#' + node.id + ' [id^="notification-subscriptions-"]');
              DO.U.buttonSubscribeNotificationChannel(nodes, documentURL);
            });
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

      document.body.appendChild(fragmentFromString('<aside id="document-items" class="do on">' + DO.C.Button.Close + '</aside>'));
      documentItems = document.getElementById('document-items');

      var articleNode = selectArticleNode(document);
      var sections = articleNode.querySelectorAll('section:not(section section):not([id^=table-of]):not([id^=list-of])');

      DO.U.showListOfStuff(documentItems);

      DO.U.showHighlightStructuredData(documentItems);

      if (sections.length) {
        DO.U.showTableOfContents(documentItems, sections)

        if (DO.C.SortableList && DO.C.EditorEnabled) {
          DO.U.sortToC();
        }
      }

      DO.U.showDocumentMetadata(documentItems);

      DO.U.showDocumentCommunicationOptions(documentItems);
    },

    showHighlightStructuredData: function(node) {
      if (!node) { return; }

      var contextNode = selectArticleNode(document);
      var checked = (contextNode.classList.contains('highlight-structure')) ? 'checked="checked"' : '';

      var html = `<section id="highlight-data"><h2>Highlight Data</h2><ul><li><input id="highlight-structured-data" name="highlight-structured-data" type="checkbox" ${checked}/> <label for="highlight-structured-data">Structure</label></li></ul></section>`;

      node.insertAdjacentHTML('beforeend', html);

      var structuredData = document.querySelector('#highlight-data')

      structuredData.addEventListener('change', (e) => {
        var input = e.target.closest('#highlight-structured-data');
        if (input) {
          if (input.checked) {
            contextNode.classList.add('highlight-structure');
          }
          else {
            contextNode.classList.remove('highlight-structure');
          }
        }
      });
    },

    showListOfStuff: function(node) {
      if (!node) { return; }

      var disabledInput = '', s = [];
      if (!DO.C.EditorEnabled) {
        disabledInput = ' disabled="disabled"';
      }

      Object.keys(DO.C.ListOfStuff).forEach(id => {
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

      if (s.length) {
        node.insertAdjacentHTML('beforeend', '<section id="list-of-stuff"><h2>List of Stuff</h2><ul>' + s.join('') + '</ul></section>');

        if (DO.C.EditorEnabled) {
          document.getElementById('list-of-stuff').addEventListener('click', (e) => {
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

      var toc = '<section id="table-of-contents-i"' + sortable + '><h2>' + DO.C.ListOfStuff['table-of-contents'].label + '</h2><ol class="toc' + sortable + '">';
      toc += DO.U.getListOfSections(sections, {'sortable': DO.C.SortableList});
      toc += '</ol></section>';

      node.insertAdjacentHTML('beforeend', domSanitize(toc));
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

            if (subsections.length) {
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

      var rootNode = selectArticleNode(document);

      if(id == 'references'){
        buildReferences();
      }
      else {
        var label = DO.C.ListOfStuff[id].label;
        var selector = DO.C.ListOfStuff[id].selector;
        var titleSelector = DO.C.ListOfStuff[id].titleSelector;

        var nodes = rootNode.querySelectorAll('*:not([class~="do"]) ' + selector);

        if (id == 'table-of-contents' || id == 'list-of-concepts' || nodes.length) {
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
              if (d.length) {
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
              Object.keys(DO.C.Resource[documentURL]['spec']['requirement']).forEach(i => {
// console.log(DO.C.Resource[documentURL]['spec'][i])
                var statement = DO.C.Resource[documentURL]['spec']['requirement'][i][ns.spec.statement.value] || i;
                //FIXME: This selector is brittle.
                // var requirementIRI = document.querySelector('#document-identifier [rel="owl:sameAs"]');
                var requirementIRI = document.querySelector('#document-latest-published-version [rel~="rel:latest-version"]');
                requirementIRI = (requirementIRI) ? requirementIRI.href : i;

                requirementIRI = i.replace(stripFragmentFromString(i), requirementIRI);
                statement = '<a href="' + requirementIRI + '">' + statement + '</a>';

                var requirementSubjectIRI = DO.C.Resource[documentURL]['spec']['requirement'][i][ns.spec.requirementSubject.value];
                var requirementSubjectLabel = requirementSubjectIRI || '<span class="warning">?</span>';
                if (requirementSubjectLabel.startsWith('http')) {
                  requirementSubjectLabel = getFragmentFromString(requirementSubjectIRI) || getURLLastPath(requirementSubjectIRI) || requirementSubjectLabel;
                }
                var requirementSubject = '<a href="' + requirementSubjectIRI + '">' + requirementSubjectLabel + '</a>';

                var requirementLevelIRI = DO.C.Resource[documentURL]['spec']['requirement'][i][ns.spec.requirementLevel.value];
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
              Object.keys(DO.C.Resource[documentURL]['spec']['advisement']).forEach(i => {
// console.log(DO.C.Resource[documentURL]['spec']['advisement'][i])
                var statement = DO.C.Resource[documentURL]['spec']['advisement'][i][ns.spec.statement.value] || i;
                //FIXME: This selector is brittle.
                //TODO: Revisit this:
                // var advisementIRI = document.querySelector('#document-identifier [rel="owl:sameAs"]');
                var advisementIRI = document.querySelector('#document-latest-published-version [rel~="rel:latest-version"]');
                advisementIRI = (advisementIRI) ? advisementIRI.href : i;

                advisementIRI = i.replace(stripFragmentFromString(i), advisementIRI);
                statement = '<a href="' + advisementIRI + '">' + statement + '</a>';

                // var advisementSubjectIRI = DO.C.Resource[documentURL]['spec']['advisement'][i][ns.spec.advisementSubject.value];
                // var advisementSubjectLabel = advisementSubjectIRI || '<span class="warning">?</span>';
                // if (advisementSubjectLabel.startsWith('http')) {
                //   advisementSubjectLabel = getFragmentFromString(advisementSubjectIRI) || getURLLastPath(advisementSubjectIRI) || advisementSubjectLabel;
                // }
                // var advisementSubject = '<a href="' + advisementSubjectIRI + '">' + advisementSubjectLabel + '</a>';

                var advisementLevelIRI = DO.C.Resource[documentURL]['spec']['advisement'][i][ns.spec.advisementLevel.value];
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
              if (nodes.length) {
                nodes = [].slice.call(nodes);
                nodes.sort((a, b) => {
                  return a.textContent.toLowerCase().localeCompare(b.textContent.toLowerCase());
                });
              }

              var processed = [];
              for (var i = 0; i < nodes.length; i++) {
                if (!processed.includes(nodes[i].textContent)) {
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

      insertDocumentLevelHTML(document, s, { id });

      if (id == 'table-of-requirements') {
        var options = { noCredentials: true };
        // var options = {};
        var testSuites = DO.C.Resource[documentURL].graph.out(ns.spec.testSuite).values;
// testSuites = [];
// console.log(testSuites)
        if (testSuites.length) {
          //TODO: Process all spec:testSuites
          var url = testSuites[0];

          getResourceGraph(url, null, options)
            .then(g => {
// console.log(g.out().values)
              if (g) {
                DO.U.insertTestCoverageToTable(id, g);
              }
            })
            .catch(reason => {
console.log(reason);
            });
        }

        var predecessorVersion = DO.C.Resource[documentURL].graph.out(ns.rel['predecessor-version']).values;
// predecessorVersion = [];
        if (predecessorVersion.length) {
          url = predecessorVersion[0];

          var sourceGraph = DO.C.Resource[documentURL].graph;
          var sourceGraphURI = sourceGraph.term.value;
// console.log(sourceGraphURI)
          var buttonTextDiffRequirements = 'Diff requirements with the predecessor version';

          var table = document.getElementById(id);
          var thead = table.querySelector('thead');
          thead.querySelector('tr > th').insertAdjacentHTML('beforeend', '<button id="include-diff-requirements" class="do add" disabled="disabled" title="' + buttonTextDiffRequirements + '">' + Icon[".fas.fa-circle-notch.fa-spin.fa-fw"] + '</button>');

          getResourceGraph(url, null, options)
            .then(targetGraph => {
              if (targetGraph) {
                var targetGraphURI = targetGraph.term.value;
// console.log(targetGraphURI)

                var buttonRD = document.getElementById('include-diff-requirements');
                buttonRD.setHTMLUnsafe(domSanitize(Icon[".fas.fa-plus-minus"]));
                buttonRD.disabled = false;

                buttonRD.addEventListener('click', (e) => {
                  var button = e.target.closest('button');
                  if (button){
                    if (button.classList.contains('add')) {
                      button.classList.remove('add');
                      button.classList.add('remove');
                      button.setAttribute('title', "Show requirements");
                      button.setHTMLUnsafe(domSanitize(Icon[".fas.fa-list-check"]));

                      if (!button.classList.contains('checked')) {
                        DO.U.diffRequirements(sourceGraph, targetGraph);
                        button.classList.add('checked');
                      }

                      table.querySelectorAll('tbody tr').forEach(tr => {
                        var sR = tr.getAttribute('about');
                        var td = tr.querySelector('td:nth-child(3)');
                        sR = sR.replace(stripFragmentFromString(sR), sourceGraphURI);
                        var tR = targetGraphURI + '#' + getFragmentFromString(sR);
                        td.setHTMLUnsafe(domSanitize(DO.C.Resource[sourceGraphURI].spec['requirement'][sR]['diff'][tR]['statement'])) || '';
                      });
                    }
                    else if (button.classList.contains('remove')) {
                      button.classList.remove('remove');
                      button.classList.add('add');
                      button.setAttribute('title', buttonTextDiffRequirements);
                      button.setHTMLUnsafe(domSanitize(Icon[".fas.fa-plus-minus"]));

                      table.querySelectorAll('tbody tr').forEach(tr => {
                        var sR = tr.getAttribute('about');
                        var td = tr.querySelector('td:nth-child(3)');
                        var sourceRequirementURI = sourceGraphURI + '#' + getFragmentFromString(sR);
                        var statement = DO.C.Resource[sourceGraphURI].spec['requirement'][sourceRequirementURI][ns.spec.statement.value] || sR;
                        td.setHTMLUnsafe(domSanitize('<a href="' + sR + '">' + statement + '</a>'));
                      });
                    }
                  }
                });
              }
            });
        }
      }

      if (id == 'list-of-concepts') {
        document.getElementById(id).addEventListener('click', (e) => {
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
      var sourceGraphURI = sourceGraph.term.value;
      var targetGraphURI = targetGraph.term.value;
// console.log(sourceGraphURI, targetGraphURI)
      var sourceRequirements = getResourceInfoSpecRequirements(sourceGraph);
      var targetRequirements = getResourceInfoSpecRequirements(targetGraph);
// console.log(sourceRequirements, targetRequirements)
      var changes = Object.values(DO.C.Resource[sourceGraphURI].spec.change);
// console.log(changes)
      Object.keys(sourceRequirements).forEach(sR => {
        DO.C.Resource[sourceGraphURI].spec['requirement'][sR]['diff'] = {};

        var sRStatement = sourceRequirements[sR][ns.spec.statement.value] || '';
        var tR = targetGraphURI + '#' + getFragmentFromString(sR);

        DO.C.Resource[sourceGraphURI].spec['requirement'][sR]['diff'][tR] = {};

        var tRStatement = '';

        if (targetRequirements[tR]) {
          tRStatement = targetRequirements[tR][ns.spec.statement.value] || '';
        }

        var change = changes.filter(change => change[ns.spec.changeSubject.value] == sR)[0];
        var changeHTML = '';
        if (change) {
          var changeClass = change[ns.spec.changeClass.value];
          var changeDescription = change[ns.spec.statement.value];
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
      testSuiteGraph  = rdf.grapoi({ dataset: testSuiteGraph.dataset });
// console.log(testSuiteGraph)
      testSuiteGraph.out().quads().forEach(t => {
// console.log(t)
        subjects.push(t.subject.value);
      });
      subjects = uniqueArray(subjects);

      var testCases = [];

      //FIXME: Brittle selector
      var specificationReferenceBase = document.querySelector('#document-latest-published-version [rel~="rel:latest-version"]').href;
// console.log(specificationReferenceBase)

      subjects.forEach(i => {
        var s = testSuiteGraph.node(rdf.namedNode(i));
        var testCaseIRI = s.term.value;
        var types = getGraphTypes(s);

        if (types.length) {
          if (types.includes(ns['test-description'].TestCase.value)) {
            var requirementReference = s.out(ns.spec.requirementReference).values[0];
            if (requirementReference && requirementReference.startsWith(specificationReferenceBase)) {
              testCases[testCaseIRI] = {};
              testCases[testCaseIRI][ns.spec.requirementReference.value] = requirementReference;
              testCases[testCaseIRI][ns['test-description'].reviewStatus.value] = s.out(ns['test-description'].reviewStatus).values[0];
              testCases[testCaseIRI][ns.dcterms.title.value] = s.out(ns.dcterms.title).values[0];
            }
          }
        }
      });

// console.log(testCases);

      table.querySelectorAll('tbody tr').forEach(tr => {
        var requirement = tr.querySelector('td:nth-child(3) a').href;

        Object.keys(testCases).forEach(testCaseIRI => {
          if (testCases[testCaseIRI][ns.spec.requirementReference.value] == requirement) {
            var testCaseLabel = testCases[testCaseIRI][ns.dcterms.title.value] || testCaseIRI;

            var testCaseHTML = '<a href="'+ testCaseIRI + '">' + testCaseLabel + '</a>';

            if (testCases[testCaseIRI][ns['test-description'].reviewStatus.value]) {
              var reviewStatusIRI = testCases[testCaseIRI][ns['test-description'].reviewStatus.value];
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
        ids[i].addEventListener('mouseenter', (e) => {
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

        ids[i].addEventListener('mouseleave', (e) => {
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

      elements.forEach(element => {
        var nodes = selectArticleNode(document).querySelectorAll(element);
        nodes.forEach(node => {
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

      document.body.appendChild(fragmentFromString('<aside id="robustify-links" class="do on">' + DO.C.Button.Close + `<h2>Robustify Links  ${getButtonHTML({ button: 'info', buttonClass: 'info', buttonTitle: 'About Robustify Links', buttonRel: 'rel:help', buttonResource: Config.ButtonInfo['feature-robustify-links'] })}</h2>` + '<div class="info"></div><div id="robustify-links-input"><p><input id="robustify-links-select-all" type="checkbox" value="true"/><label for="robustify-links-select-all">Select all</label></p><p><input id="robustify-links-reuse" type="checkbox" value="true" checked="checked"/><label for="robustify-links-reuse">Reuse Robustifed</label></p><ul id="robustify-links-list"></ul></div><button class="robustify" title="Robustify Links">Robustify</button></aside>'));

      //TODO: Move unique list of existing RL's to DO.C.Resource?
      var robustLinksUnique = {};
      robustLinks.forEach(i => {
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
      rlCandidates.forEach(i => {
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

          rlChecked.forEach(i => {
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
              Object.keys(robustLinksUnique).forEach(url => {
                if (i.value == url) {
// console.log(robustLinksUnique[url])
                  progress.setHTMLUnsafe(domSanitize('<a href="' + robustLinksUnique[url]["data-versionurl"] + '" target="_blank">' + Icon[".fas.fa-archive"] + '</a>'));
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

                  progress.setHTMLUnsafe(domSanitize('<a href="' + versionURL + '" target="_blank">' + Icon[".fas.fa-archive"] + '</a>'));

                  showRobustLinksDecoration(node.closest('cite'));
                })
                .catch(r => {
                  progress.setHTMLUnsafe(domSanitize(Icon[".fas.fa-times-circle"] + ' Unable to archive. Try later.'));
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
            rlInput.forEach(i => {
              i.setAttribute('checked', 'checked');
              i.checked = true;
            });
          }
          else {
            rlInput.forEach(i => {
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
        .then(r => {
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
              showActionMessage(document.body, message);
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

    snapshotAtEndpoint: function(e, iri, endpoint, noteData, options = {}) {
      iri = iri || currentLocation();
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

      // if(note.length) {
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
          progress.setHTMLUnsafe(domSanitize(responseMessages[response.status]));
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
          progress.setHTMLUnsafe(domSanitize(message.content));
        }

        return Promise.resolve(o);
      }

      var checkLinkHeader = function(response) {
        var link = response.headers.get('Link');

        if (link && link.length) {
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
              if (location && location.length) {
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
                      // ALLOW_UNKNOWN_PROTOCOLS is needed for namespaced attribute values that DOMPurify mistakenly interpret as an unknown protocol protocol; it will allow mailto: but strip out others it does not recognize
                      data = domSanitize(data);

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
                progress.setHTMLUnsafe(domSanitize(message.content));
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
                progress.setHTMLUnsafe(domSanitize(message.content));
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
              progress.setHTMLUnsafe(domSanitize(message.content));
            }
          })
      }
    },

    //Derived from saveAsDocument
    generateFeed: function generateFeed (e) {
      e.target.disabled = true;
      document.body.appendChild(fragmentFromString('<aside id="generate-feed" class="do on">' + DO.C.Button.Close + '<h2>Generate Feed</h2></aside>'));

      var generateFeed = document.getElementById('generate-feed');
      generateFeed.addEventListener('click', (e) => {
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
        if (feedFormatSelectionChecked.length) {
          feedFormat = (DO.C.MediaTypes.Feed.indexOf(feedFormatSelectionChecked.value) > -1) ? feedFormatSelectionChecked.value : feedFormat;

          options['contentType'] = feedFormat;
        }

        var feedTitle = generateFeed.querySelector('input[name="' + id + '-title"]').value || storageIRI

        var feedLanguageSelected = generateFeed.querySelector('select[name="' + id + '-language"]').value
        var feedLicenseSelected = generateFeed.querySelector('select[name="' + id + '-license"]').value


        var feedURLSelection = [];

        var checkedInput = generateFeed.querySelectorAll('#' + id + '-ul' + ' input[type="checkbox"]:checked')
        checkedInput = Array.from(checkedInput)
        if (checkedInput.length) {
          feedURLSelection = checkedInput.map((el) => el.value);
        }
// console.log(feedURLSelection)

        function getFeedData(urls) {
          var promises = [];
          var resourceData = {};

          urls.forEach(function (url) {
            // var pIRI = getProxyableIRI(u);
            promises.push(
              getResource(url)
                .then(response => {
                  var cT = response.headers.get('Content-Type');
                  var options = {};
                  options['contentType'] = (cT) ? cT.split(';')[0].toLowerCase().trim() : 'text/turtle';
                  options['subjectURI'] = response.url;

                  return response.text()
                    .then(data => getResourceInfo(data, options))
                    .catch(function (error) {
                      console.error(`Error fetching ${url}:`, error.message);
                      return Promise.resolve(); // or handle the error accordingly
                    });
                })
                .then((result) => {
                  resourceData[url] = result; // Directly store the result in resourceData
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
                  'Document saved at <a href="' + url + documentMode + '" target="_blank">' + url + '</a></p></div>'
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
      li.push(`<li>${getButtonHTML({ button: 'version', buttonClass: 'create-version', buttonDisabled: isButtonDisabled('create-version'), buttonTitle: 'Version this article', buttonTextContent: 'Version', iconSize: 'fa-2x' })}</li>`);

      li.push(`<li>${getButtonHTML({ button: 'immutable', buttonClass: 'create-immutable', buttonDisabled: isButtonDisabled('create-immutable'), buttonTitle: 'Make this article immutable and version it', buttonTextContent: 'Immutable', iconSize: 'fa-2x' })}</li>`);

      li.push(`<li>${getButtonHTML({ button: 'robustify-links', buttonClass: 'robustify-links', buttonDisabled: isButtonDisabled('robustify-links'), buttonTitle: 'Robustify Links', buttonTextContent: 'Robustify Links', iconSize: 'fa-2x' })}</li>`);

      li.push(`<li>${getButtonHTML({ button: 'archive', buttonClass: 'snapshot-internet-archive', buttonDisabled: isButtonDisabled('snapshot-internet-archive'), buttonTitle: 'Capture with Internet Archive', buttonTextContent: 'Internet Archive', iconSize: 'fa-2x' })}</li>`);

      li.push(`<li>${getButtonHTML({ button: 'feed', buttonClass: 'generate-feed', buttonDisabled: isButtonDisabled('generate-feed'), buttonTitle: 'Generate Web feed', buttonTextContent: 'Feed', iconSize: 'fa-2x' })}</li>`);

      li.push(`<li>${getButtonHTML({ button: 'export', buttonClass: 'export-as-html', buttonDisabled: isButtonDisabled('export-as-html'), buttonTitle: 'Export and save to file', buttonTextContent: 'Export', iconSize: 'fa-2x' })}</li>`);

      e.target.closest('button').insertAdjacentHTML('afterend', '<ul id="memento-items" class="on">' + li.join('') + '</ul>');

      mementoItems = document.getElementById('memento-items');

      mementoItems.addEventListener('click', (e) => {
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

      var s = '<section id="document-do"><h2>Do</h2><ul>';

      s += `${getButtonHTML({ button: 'share', buttonClass: 'resource-share', buttonDisabled: isButtonDisabled('resource-share'), buttonTitle: 'Share resource', buttonTextContent: 'Share', iconSize: 'fa-2x' })}`;

      s += `<li>${getButtonHTML({ button: 'in-reply-to', buttonClass: 'resource-reply', buttonTitle: 'Reply', buttonTextContent: 'Reply', iconSize: 'fa-2x' })}</li>`;

      s += `<li>${getButtonHTML({ button: 'activities', buttonClass: 'resource-notifications', buttonTitle: 'Show notifications', buttonTextContent: 'Notifications', iconSize: 'fa-2x' })}</li>`;

      s += `<li>${getButtonHTML({ button: 'new', buttonClass: 'resource-new', buttonTitle: 'Create new article', buttonTextContent: 'New', iconSize: 'fa-2x' })}</li>`;

      s += `<li>${getButtonHTML({ button: 'open', buttonClass: 'resource-open', buttonTitle: 'Open article', buttonTextContent: 'Open', iconSize: 'fa-2x' })}</li>`;

      s += `<li>${getButtonHTML({ button: 'save', buttonClass: 'resource-save', buttonTitle: 'Save article', buttonTextContent: 'Save', iconSize: 'fa-2x' })}</li>`;

      s += `${getButtonHTML({ button: 'save-as', buttonClass: 'resource-save-as', buttonDisabled: isButtonDisabled('resource-save-as'), buttonTitle: 'Save as article', buttonTextContent: 'Save As', iconSize: 'fa-2x' })}`;

      s += `${getButtonHTML({ button: 'memento', buttonClass: 'resource-memento', buttonTitle: 'Memento article', buttonTextContent: 'Memento', iconSize: 'fa-2x' })}`;

      //TODO: Use DO.C.Editor.mode and getButtonHTML instead
      if (DO.C.EditorAvailable) {
        var editFile = (DO.C.EditorEnabled && DO.C.Editor.mode == 'author')
          ? DO.C.Editor.DisableEditorButton
          : DO.C.Editor.EnableEditorButton;
        s += '<li>' + editFile + '</li>';
      }

      s += `${getButtonHTML({ button: 'source', buttonClass: 'resource-source', buttonTitle: 'Edit article source code', buttonTextContent: 'Source', iconSize: 'fa-2x' })}`;

      s += `${getButtonHTML({ button: 'data-meta', buttonClass: 'embed-data-meta', buttonTitle: 'Embed structured data (Turtle, JSON-LD, TriG)', buttonTextContent: 'Embed Data', iconSize: 'fa-2x' })}`;

      if (DO.C.Resource[documentURL]['odrl'] && DO.C.Resource[documentURL]['odrl']['prohibitionAssignee'] == DO.C.User.IRI &&
        ((Array.isArray(DO.C.Resource[documentURL]['odrl']['prohibitionActions']) && DO.C.Resource[documentURL]['odrl']['prohibitionActions'].some(action => action === 'http://www.w3.org/ns/odrl/2/print')) ||
        (Array.isArray(DO.C.Resource[documentURL]['odrl']['permissionActions']) && DO.C.Resource[documentURL]['odrl']['permissionActions'].some(action => action === 'http://www.w3.org/ns/odrl/2/print')))) {
        s += `${getButtonHTML({ button: 'print', buttonClass: 'resource-print', buttonDisabled: getButtonDisabledHTML('resource-print'), buttonTitle: 'Print document', buttonTextContent: 'Print', iconSize: 'fa-2x' })}`;
      }

      s += `${getButtonHTML({ button: 'delete', buttonClass: 'resource-delete', buttonTitle: 'Delete article', buttonTextContent: 'Delete', iconSize: 'fa-2x' })}`;

      s += `${getButtonHTML({ button: 'messages', buttonClass: 'message-log', buttonTitle: 'Show message log', buttonTextContent: 'Messages', iconSize: 'fa-2x' })}`;

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

        b = e.target.closest('button.editor-disable');
        var documentURL = DO.C.DocumentURL;
        if (b) {
          var node = b.closest('li');
          b.outerHTML = DO.C.Editor.EnableEditorButton;
          DO.U.hideDocumentMenu();
          DO.Editor.toggleEditor('social', e);
          hideAutoSaveStorage(node.querySelector('#autosave-items'), documentURL);
        }
        else {
          b = e.target.closest('button.editor-enable');
          if (b) {
            node = b.closest('li');
            b.outerHTML = DO.C.Editor.DisableEditorButton;
            DO.U.hideDocumentMenu();
            DO.Editor.toggleEditor('author', e);
            showAutoSaveStorage(node, documentURL);
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

      if (DO.C.MessageLog && DO.C.MessageLog.length) {
        messageLog = '<table><caption>Messages</caption><thead><tr><th>Date/Time</th><th>Message</th><th>Type</th></tr></thead><tbody>';
        Object.keys(DO.C.MessageLog).forEach(i => {
          messageLog += '<tr><td><time>' + DO.C.MessageLog[i].dateTime + '</time></td><td>' + DO.C.MessageLog[i].content + '</td><td>' + DO.C.MessageLog[i].type + '</td></tr>';
        });
        messageLog += '</tbody></table>';
      }
      else {
        messageLog = '<p>No messages.</p>';
      }

      document.body.appendChild(fragmentFromString('<aside id="message-log" class="do on">' + DO.C.Button.Close + `<h2>Message Log ${getButtonHTML({ button: 'info', buttonClass: 'info', buttonTitle: 'About Message Log', buttonRel: 'rel:help', buttonResource: Config.ButtonInfo['feature-message-log'] })}</h2>` + '<div class="info"></div><div>' + messageLog + '</div></aside>'));

      document.querySelector('#message-log button.close').addEventListener('click', (e) => {
        document.querySelector('button.message-log').removeAttribute('disabled');
      });
    },

    //TODO: Minor refactoring to delete any URL, e.g., annotation (already implemented)
    resourceDelete: function(e, url, options) {
      if (!url) { return; }

      e.target.closest('button').disabled = true

      document.body.appendChild(fragmentFromString('<aside id="delete-document" class="do on">' + DO.C.Button.Close + `<h2>Delete ${getButtonHTML({ button: 'info', buttonClass: 'info', buttonTitle: 'About Delete', buttonRel: 'rel:help', buttonResource: Config.ButtonInfo['feature-delete'] })}</h2>` + '<div class="info"></div><div><p>Are you sure you want to delete the following document?</p><p><code>' + url  +'</code></p></div><button class="cancel" title="Cancel delete">Cancel</button><button class="delete" title="Delete document">Delete</button></aside>'));

      document.querySelector('#delete-document').addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        var buttonCC = e.target.closest('button.close') || e.target.closest('button.cancel');
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
                  data = domSanitize(data);

                  //TODO: Reuse saveAsDocument's catch to request access by checking the Link header.

                  var details = (data.trim().length) ? '<details><summary>Details</summary><div>' + data + '</div></details>' : '';
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
                  showActionMessage(document.body, message);

                  // throw error;
                  // return Promise.reject({});
                });
            })
            .then(response => {
// console.log(response);
              return response.text()
                .then(data => {
// console.log(data);
                  data = domSanitize(data);

                  var details = (data.trim().length) ? '<details><summary>Details</summary><div>' + data + '</div></details>' : '';
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
                  showActionMessage(document.body, message);

                  var buttonD = e.target.closest('button.delete')
                  if (buttonD) {
                    var parent = buttonD.parentNode;
                    parent.parentNode.removeChild(parent);
                  }
                })
                .then(() => {
                  //FIXME:
                  getDocumentContentNode(document).setHTMLUnsafe(domSanitize('<main><article about="" typeof="schema:Article"></article></main>'));
                  Editor.init('author');


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
      var url = currentLocation();
      var data = getDocument();
      options = options || {};

      getResourceInfo(data, options).then(i => {
        if (DO.Editor.new) {
          DO.U.saveAsDocument(e);
        }
        else {
          if (e.target.closest('.create-version')) {
            createMutableResource(url);
          }
          else if (e.target.closest('.create-immutable')) {
            createImmutableResource(url);
          }
          else if (e.target.closest('.resource-save')) {
            updateMutableResource(url);
          }
        }
      });
    },

    replyToResource: function replyToResource (e, iri) {
      iri = iri || currentLocation()

      e.target.closest('button').disabled = true

      document.body.appendChild(fragmentFromString('<aside id="reply-to-resource" class="do on">' + DO.C.Button.Close + `<h2>Reply ${getButtonHTML({ button: 'info', buttonClass: 'info', buttonTitle: 'About Reply', buttonRel: 'rel:help', buttonResource: Config.ButtonInfo['feature-reply'] })}</h2>` + '<div class="info"></div><div id="reply-to-resource-input"><p>Reply to <code>' +
        iri +'</code></p><ul><li><p><label for="reply-to-resource-note">Quick reply (plain text note)</label></p><p><textarea id="reply-to-resource-note" rows="10" cols="40" name="reply-to-resource-note" placeholder="Great article!"></textarea></p></li><li><label for="reply-to-resource-language">Language</label> <select id="reply-to-resource-language" name="reply-to-resource-language">' +
        getLanguageOptionsHTML() + '</select></li><li><label for="reply-to-resource-license">License</label> <select id="reply-to-resource-license" name="reply-to-resource-license">' +
        getLicenseOptionsHTML() + '</select></li></ul></div>'))

      // TODO: License
      // TODO: ACL - can choose whether to make this reply private (to self), visible only to article author(s), visible to own contacts, public
      // TODO: Show name and face of signed in user reply is from, or 'anon' if article can host replies

      var replyToResource = document.getElementById('reply-to-resource')

      var id = 'location-reply-to'
      var action = 'write'
      var note;
      var noteIRI;

      DO.U.setupResourceBrowser(replyToResource, id, action)
      document.getElementById(id).insertAdjacentHTML('afterbegin', '<p>Choose a location to save your reply.</p>')

      replyToResource.insertAdjacentHTML('beforeend', '<p>Your reply will be saved at <samp id="' + id +'-' + action + '"></samp></p>')

      var bli = document.getElementById(id + '-input')
      bli.focus()
      bli.placeholder = 'https://example.org/path/to/article'
      replyToResource.insertAdjacentHTML('beforeend', '<button class="reply" title="Send your reply">Send</button>')

      replyToResource.addEventListener('click', e => {
        if (e.target.closest('button.close')) {
          document.querySelector('#document-do .resource-reply').disabled = false
        }

        if (e.target.closest('button.reply')) {
          note = document
            .querySelector('#reply-to-resource #reply-to-resource-note')
            .value.trim()

          var rm = replyToResource.querySelector('.response-message')
          if (rm) {
            rm.parentNode.removeChild(rm)
          }
          replyToResource.insertAdjacentHTML('beforeend', '<div class="response-message"></div>')

          noteIRI = document.querySelector('#reply-to-resource #' + id + '-' + action).innerText.trim();

          try {
            noteIRI = noteIRI && noteIRI.length ? new URL(noteIRI).href : noteIRI;
          } catch (e) {
            noteIRI = noteIRI; // Keep the original value if it's not a valid URL
          }

          if (!note || !noteIRI) {
            document.querySelector('#reply-to-resource .response-message')
              .setHTMLUnsafe(domSanitize('<p class="error">Need a note and a location to save it.</p>'));
            return;
          }

          sendReply();
        }
      })

      function sendReply() {
        var datetime = getDateTimeISO()
        var attributeId = generateAttributeId()

        var motivatedBy = "oa:replying"
        var noteData = {
          "type": 'comment',
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
        if (language && language.length) {
          noteData["language"] = language.value.trim()
          noteData["body"]["language"] = noteData["language"];
        }

        var license = document.querySelector('#reply-to-resource-license')
        if (license && license.length) {
          noteData["license"] = license.value.trim()
          noteData["body"]["rights"] = noteData["body"]["license"] = noteData["rights"] = noteData["license"];
        }

        note = createNoteDataHTML(noteData)

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
              .setHTMLUnsafe(domSanitize('<p class="success"><a target="_blank" href="' + response.url + '">Reply saved!</a></p>'));

            return getLinkRelation(ns.ldp.inbox.value, null, getDocument());
          })

          .then(inboxes => {
            if (!inboxes) {
              throw new Error('Inbox is empty or missing')
            }

            var inboxURL = inboxes[0]

            let notificationStatements = '    <dl about="' + noteIRI +
              '">\n<dt>Object type</dt><dd><a about="' +
              noteIRI + '" typeof="oa:Annotation" href="' +
              ns.oa.Annotation.value +
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

            var responseMessage = replyToResource.querySelector('.response-message');
            responseMessage.setHTMLUnsafe(domSanitize(responseMessage.getHTML() + '<p class="success">' + notificationSent + '</p>'));
          })

          .catch(error => {
            // Catch-all error, actually notify the user
            var responseMessage = replyToResource.querySelector('.response-message');
            responseMessage.setHTMLUnsafe(domSanitize(responseMessage.getHTML() + '<p class="error">We could not notify the author of your reply:' + error.message + '</p>'));

          })
      }
    },

    shareResource: function(listenerEvent, iri) {
      if (document.querySelector('#share-resource.do.on')) { return; }

      // Config.ButtonStates['resource-share'] = false;

      iri = iri || currentLocation();
      const documentURL = stripFragmentFromString(iri);

      var button = listenerEvent.target.closest('button');
      if (button) {
        button.disabled = true;
      }

      var addContactsButtonDisable = '', noContactsText = '';
      if (!DO.C.User.IRI && !(DO.C.User.Graph && ((DO.C.User.Knows && DO.C.User.Knows.length) || (DO.C.User.Graph.out(ns.owl.sameAs).values.length)))) {
        addContactsButtonDisable = ' disabled="disabled"';
        noContactsText = '<p>Sign in to select from your list of contacts, alternatively, enter contacts individually:</p>';
      }

      var shareResourceLinkedResearch = '';
      if (DO.C.User.IRI && DO.C.OriginalResourceInfo['rdftype'] && DO.C.OriginalResourceInfo.rdftype.includes(ns.schema.ScholarlyArticle.value) || DO.C.OriginalResourceInfo.rdftype.includes(ns.schema.Thesis.value)) {
        shareResourceLinkedResearch = `
          <div id="share-resource-external">
            <h3>Share with research community</h3>
            <input id="share-resource-linked-research" type="checkbox" value="https://linkedresearch.org/cloud" />
            <label for="share-resource-linked-research"><a href="https://linkedresearch.org/cloud">Linked Open Research Cloud</a></label>
          </div>`;
      }

      var shareResourceHTML = `
        <aside id="share-resource" class="do on">${DO.C.Button.Close}
          <h2>Share ${getButtonHTML({ button: 'info', buttonClass: 'info', buttonTitle: 'About Open', buttonRel: 'rel:help', buttonResource: Config.ButtonInfo['feature-share'] })}</h2>
          
          <div class="info"></div>

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

      document.body.appendChild(fragmentFromString(shareResourceHTML));

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

            input.addEventListener('focus', (e) => {
              if (!e.target.value.length) {
                showSuggestions(getFilteredContacts());
              }
            });

            input.addEventListener('input', (e) => {
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
// console.log(matchesQuery)
                return !subjectsWithAccessKeys.has(contact) && matchesQuery;
              });
            }

            var showSuggestions = function (filteredContacts) {
              suggestions.replaceChildren();

              filteredContacts.forEach(contact => {
                const suggestion = document.createElement('li');

                var name = DO.C.User.Contacts[contact].Name || contact;
                var img = DO.C.User.Contacts[contact].Image;
                if (!(img && img.length)) {
                  img = generateDataURI('image/svg+xml', 'base64', Icon['.fas.fa-user-secret']);
                }
                img = '<img alt="" height="32" src="' + img + '" width="32" />';

                suggestion.insertAdjacentHTML('beforeend', img + '<span title="' + contact + '">' + name + '</span>');

                var ul = document.querySelector('#share-resource-permissions ul');

                suggestion.addEventListener('click', () => {
                  DO.U.addAccessSubjectItem(ul, DO.C.User.Contacts[contact].Graph, contact);
                  var li = document.getElementById('share-resource-access-subject-' + encodeURIComponent(contact));
                  var options = {};
                  options['accessContext'] = 'Share';
                  options['selectedAccessMode'] = ns.acl.Read.value;
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

                  suggestions.replaceChildren();
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
// console.log(accessSubject)
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
                  (verifiedAccessModes.includes(ns.acl.Control.value) && ns.acl.Control.value) ||
                  (verifiedAccessModes.includes(ns.acl.Write.value) && ns.acl.Write.value) ||
                  (verifiedAccessModes.includes(ns.acl.Read.value) && ns.acl.Read.value) ||
                  '';

                var options = options || {};
                options['accessContext'] = 'Share';
                options['selectedAccessMode'] = selectedAccessMode;
// console.log(options)
                DO.U.showAccessModeSelection(li, '', accessSubject, subjectsWithAccess[accessSubject]['subjectType'], options);
              }
            }

            Object.keys(subjectsWithAccess).forEach(accessSubject => {
              if (accessSubject === ns.foaf.Agent.value || accessSubject === DO.C.User.IRI) {
                return;
              }

              //Gets some information about the accessSubject that can be displayed besides their URI.
              getResourceGraph(accessSubject)
                .catch(e => {
                  showPermissions(null, accessSubject);
                })
                .then(g => {
                  var s;
                  if (g) {
                    s = g.node(rdf.namedNode(accessSubject));
                  }
                  showPermissions(s, accessSubject);
                })
            })
        });
      }

      var shareResource = document.getElementById('share-resource');
      shareResource.addEventListener('click', function (e) {
        if (e.target.closest('button.close')) {
          // Config.ButtonStates['resource-share'] = true;
          listenerEvent.target.closest('button').disabled = false;
        }

        if (e.target.closest('button.share')) {
          var tos = [];
          var resourceTo = document.querySelector('#share-resource #share-resource-to');
          if (resourceTo) {
            resourceTo = resourceTo.value.trim();
            tos = (resourceTo.length) ? resourceTo.split(/\r\n|\r|\n/) : [];
          }

          var note = document.querySelector('#share-resource #share-resource-note').value.trim();

          var ps = document.querySelectorAll('#share-resource-contacts .progress');
          ps.forEach(p => {
            p.parentNode.removeChild(p);
          });

          var srlr = document.querySelector('#share-resource-linked-research:checked');
          if(srlr) {
            tos.push(srlr.value);
          }

          var srci = document.querySelectorAll('#share-resource-contacts input:checked');
          if (srci.length) {
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
      var iri = s?.term.value || url;
      iri = domSanitize(iri);

      var id = encodeURIComponent(iri);
      var name = s ? getAgentName(s) || iri : iri;
      var img = s ? getGraphImage(s) : null;
      if (!(img && img.length)) {
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
                case ns.acl.Read.value:
                  updatedMode = [ns.acl.Read.value];
                  break;
                case ns.acl.Write.value:
                  updatedMode = [ns.acl.Read.value, ns.acl.Write.value];
                  break;
                case ns.acl.Control.value:
                  updatedMode = [ns.acl.Read.value, ns.acl.Write.value, ns.acl.Control.value];
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
      node.setHTMLUnsafe(domSanitize('<ul id="share-resource-contacts"></ul>'));
      var shareResourceNode = document.getElementById('share-resource-contacts');

      if (DO.C.User.Contacts && Object.keys(DO.C.User.Contacts).length){
        Object.keys(DO.C.User.Contacts).forEach(iri => {
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
          if(contacts.length) {
            contacts.forEach(url => {
              getSubjectInfo(url)
                .then(subject => {
                  DO.C.User.Contacts[url] = subject;
                  if (subject.Graph) {
                    DO.U.addShareResourceContactInput(node, subject.Graph);
                  }
                });
            });

            // return Promise.all(promises)
          }
          //TODO: This feature used to exist where user was able to enter WebIDs in a textarea (one per line? comma-separated).
          // else {
          //   node.setHTMLUnsafe(domSanitize('No contacts with ' + Icon[".fas.fa-inbox"] + ' inbox found in your profile, but you can enter contacts individually:'));
          // }

          return Promise.resolve();
        });
    },

    addShareResourceContactInput: function(node, s) {
      var iri = s.term.value;
      var inbox = DO.C.User.Contacts[iri]['Inbox'];

      if (inbox && inbox.length) {
        var id = encodeURIComponent(iri);
        var name = getAgentName(s) || iri;
        var img = getGraphImage(s);
        if (!(img && img.length)) {
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
          return getLinkRelationFromHead(ns.ldp.inbox.value, iri);
        }
      }

      return checkInbox(s)
        .then(inboxes => {
          if (inboxes && inboxes.length) {
            DO.C.User.Contacts[iri]['Inbox'] = inboxes;
          }
        })
    },

    nextLevelButton: function(button, url, id, action) {
      url = domSanitize(url);
      id = domSanitize(id);
      action = domSanitize(action);

      //Action is for features that need to show a samp URL, e.g., save as URL (before submitting). The open feature doesn't have samp.
      var actionNode = document.getElementById(id + '-' + action);

      //TODO: Some refactoring needed because it is radio only. For now this function is not called for inputType=checkbox
      var inputType = (id == 'location-generate-feed') ? 'checkbox' : 'radio';

      button.addEventListener('click', () => {
        if(button.parentNode.classList.contains('container')){
          var headers;
          headers = {'Accept': 'text/turtle, application/ld+json'};
          getResourceGraph(url, headers).then(g => {
              if (actionNode) {
                actionNode.textContent = (action == 'write') ? url + generateAttributeId() : url;
              }
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

          if (actionNode) {
            actionNode.textContent =  url;
          }

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

      return new Promise((resolve, reject) => {
        document.getElementById(id + '-input').value = url;

        var msgs = document.getElementById(id).querySelectorAll('.response-message');
        for(var i = 0; i < msgs.length; i++){
          msgs[i].parentNode.removeChild(msgs[i]);
        }

        //TODO: Perhaps this should be handled outside of generateBrowserList?
        var createContainer = document.getElementById(id + '-create-container');
        if (createContainer) {
          createContainer.replaceChildren();
        }

        var list = document.getElementById(id + '-ul');
        list.replaceChildren();

        var urlPath = url.split("/");
        if (urlPath.length > 4){ // This means it's not the base URL
          urlPath.splice(-2,2);
          var prevUrl = forceTrailingSlash(urlPath.join("/"));
          var upBtn = '<li class="container"><input type="radio" name="containers" value="' + prevUrl + '" id="' + prevUrl + '" /><label for="' + prevUrl + '" id="browser-up">..</label></li>';
          list.insertAdjacentHTML('afterbegin', upBtn);
        }

        var current = g.node(rdf.namedNode(url));
        var contains = current.out(ns.ldp.contains).values;
        var containersLi = Array();
        var resourcesLi = Array();
        contains.forEach(c => {
          var cg = g.node(rdf.namedNode(c));
          var resourceTypes = getGraphTypes(cg);
 
          var path = c.split("/");
          if (resourceTypes.includes(ns.ldp.Container.value) || resourceTypes.includes(ns.ldp.BasicContainer.value)){
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
      nodes.forEach(subNode => {
        subNode.addEventListener('click', (e) => {
          var button = e.target.closest('button');

          if (button){
            if (!(topicResource in DO.C.Subscription && 'Connection' in DO.C.Subscription[topicResource]) && button.classList.contains('subscribe')) {
              var subscription = subNode.querySelector('[rel="notify:subscription"]').getAttribute('resource');
// console.log(DO.C.Resource[s.iri().toString()].subscription);
              var channelType = DO.C.Resource[topicResource]['subscription'][subscription]['channelType'];

              var data = {
                "type": channelType[0],
                "topic": topicResource
              };

              var features = DO.C.Resource[topicResource]['subscription'][subscription]['feature'];

              if (features && features.length) {
                var d = new Date();
                var startAt = new Date(d.getTime() + 1000);
                var endAt = new Date(startAt.getTime() + 3600000);

                if (features.includes(ns.notify.startAt.value)) {
                  data['startAt'] = startAt.toISOString();
                }
                if (features.includes(ns.notify.endAt.value)) {
                  data['endAt'] = endAt.toISOString();
                }
                if (features.includes(ns.notify.rate.value)) {
                  data['rate'] = "PT10S";
                }
              }

              DO.U.subscribeToNotificationChannel(subscription, data)
              .then(i => {
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
        var sDPromise = getLinkRelation(ns.solid.storageDescription.value, storageUrl);

        return sDPromise
          .then(sDURLs => {
            // TODO: resourceIRI for getLinkRelation should be the
            // closest IRI (not necessarily the document).

            if (sDURLs.length) {
              ///TODO: Handle multiple storage descriptions?
              var sDURL = sDURLs[0];
              DO.C.Storages = DO.C.Storages || {};
              DO.C.Storages[s.term.value] = {
                "storageDescription": sDURL
              };
            }
            if (sD) {
              sD.replaceChildren();
            }
            samp.insertAdjacentHTML('afterend', '<details id="' + id + '-storage-description-details"><summary>Storage details</summary></details>');

            sD = document.getElementById(id + '-storage-description-details');

            sD.addEventListener('click', (e) => {
              if (!sD.open) {
                var storageDescriptionNode = document.getElementById(id + '-storage-description');

                if (!storageDescriptionNode) {
                  var storageLocation = '<dl id="storage-location"><dt>Storage location</dt><dd><a href="' + storageUrl +'" target="_blank">' + storageUrl + '</a></dd></dl>';

                  getResourceGraph(sDURL).then(g => {
                    if (g) {
                      var primaryTopic = g.out(ns.foaf.primaryTopic).values;
                      g = (primaryTopic.length) ? g.node(rdf.namedNode(primaryTopic[0])) : g.node(rdf.namedNode(storageUrl));

                      var selfDescription = DO.U.getStorageSelfDescription(g);
                      var contactInformation = DO.U.getContactInformation(g);
                      var persistencePolicy = DO.U.getPersistencePolicy(g);
                      var odrlPolicies = DO.U.getODRLPolicies(g);
                      var communicationOptions = DO.U.getCommunicationOptions(g);

                      sD.insertAdjacentHTML('beforeend', domSanitize('<div id="' + id + '-storage-description">' + storageLocation + selfDescription + contactInformation + persistencePolicy + odrlPolicies + communicationOptions + '</div>'));

                      var subscriptionsId = id + '-storage-description-details';
                      var topicResource = s.term.value;

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
      
      var storageURL = g.term.value;

      storageName = (typeof storageName !== 'undefined') ? storageName : storageURL;

      DO.C.Resource[storageURL] = DO.C.Resource[storageURL] || {};
      DO.C.Resource[storageURL]['title'] = storageName;
      DO.C.Resource[storageURL]['description'] = g.out(ns.schema.abstract).values[0] || g.out(ns.dcterms.description).values[0] || g.out(ns.rdf.value).values[0] || g.out(ns.as.summary).values[0] || g.out(ns.schema.description).values[0] || g.out(ns.as.content).values[0] || undefined;

      var storageTitle = '<dt>Storage name</dt><dd><a href="' + storageURL + '">' + storageName + '</a></dd>';
      var storageDescription = (DO.C.Resource[storageURL]['description']) ? '<dt>Storage description</dt><dd>' + DO.C.Resource[storageURL]['description'] + '</dd>' : '';

      s = '<dl id="storage-self-description">' + storageTitle + storageDescription + '</dl>';

      return s;
    },

    getPersistencePolicy: function(g) {
      var s = '';

      var persistencePolicy = g.out(ns.pim.persistencePolicy).values;

      if (persistencePolicy.length) {
        var pp = [];

        DO.C.Resource[g.term.value] = DO.C.Resource[g.term.value] || {};
        DO.C.Resource[g.term.value]['persistencePolicy'] = [];

        persistencePolicy.forEach(iri => {
          DO.C.Resource[g.term.value]['persistencePolicy'].push(iri);

          pp.push('<dd><a href="' + iri  + '" target="_blank">' + iri + '</a></dd>');
        });

        s = '<dl id="storage-persistence-policy"><dt>URI persistence policy</dt>' + pp.join('') + '</dl>'
      }

      return s;
    },

    getODRLPolicies: function(g) {
      var s = '';
      var odrlPolicies = [];

      var hasPolicy = g.out(ns.odrl.hasPolicy).values;

      if (hasPolicy.length) {
        hasPolicy.forEach(iri => {
          var policy = g.node(rdf.namedNode(iri));
          var policyDetails = [];

          var types = getGraphTypes(policy);

          var indexPolicy = types.findIndex(t => 
            t === ns.odrl.Offer.value || t === ns.odrl.Agreement.value
          );

          if (indexPolicy >= 0) {
            var rule = types[indexPolicy];
            //XXX: Label derived from URI.
            var ruleLabel = rule.substr(rule.lastIndexOf('/') + 1);

            policyDetails.push('<dt>Rule<dt><dd><a href="' + rule + '" target="_blank">' + ruleLabel + '</a></dd>');
          }

          //TODO: odrl:Set

          var uid = policy.out(ns.odrl.uid).values[0];
          if (uid) {
            policyDetails.push('<dt>Unique identifier<dt><dd><a href="' + uid + '" target="_blank">' + uid + '</a></dd>');
          }

          var target = policy.out(ns.odrl.target).values[0];
          if (target) {
            policyDetails.push('<dt>Target<dt><dd><a href="' + target + '" target="_blank">' + target + '</a></dd>');
          }

          var permission = policy.out(ns.odrl.permission).values[0];
          if (permission) {
            var ruleG = g.node(rdf.namedNode(permission));

            policyDetails.push(DO.U.getODRLRuleActions(ruleG));
            policyDetails.push(DO.U.getODRLRuleAssigners(ruleG));
            policyDetails.push(DO.U.getODRLRuleAssignees(ruleG));
          }
          var prohibition = policy.out(ns.odrl.prohibition).values[0];
          if (prohibition) {
            ruleG = g.node(rdf.namedNode(prohibition));

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

    getODRLRuleActions: function(g) {
// console.log(r.odrlaction)
      var actions = [];

      var actionsIRIs = g.out(ns.odrl.action).values;

      actionsIRIs.forEach(iri => {
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
        if (DO.C.User.PreferredPolicyRule && DO.C.User.PreferredPolicyRule.Prohibition && DO.C.User.PreferredPolicyRule.Prohibition.Actions.includes(iri)) {
          warning = Icon[".fas.fa-circle-exclamation"] + ' ';
          attributeClass = ' class="warning"';
          attributeTitle = ' title="The action (' + label + ') is prohibited by preferred policy."';
        }

        actions.push('<li' + attributeTitle + '>' + warning + '<a' + attributeClass + ' href="' + href + '" resource="' + iri + '">' + label + '</a></li>')
      });

      actions = '<dt>Actions</dt><dd><ul rel="odrl:action">' + actions.join('') + '</ul></dd>';

      return actions;
    },

    getODRLRuleAssigners: function(g) {
      var s = '';
      var a = [];

      var assigners = g.out(ns.odrl.assigner).values;

      assigners.forEach(iri => {
        a.push('<dd><a href="' + iri + '" target="_blank">' + iri + '</a></dd>');
      });

      s = '<dt>Assigners</dt>' + a.join('');

      return s;
    },

    getODRLRuleAssignees: function(g) {
      var s = '';
      var a = [];

      var assignees = g.out(ns.odrl.assignees).values;

      assignees.forEach(iri => {
        a.push('<dd><a href="' + iri + '" target="_blank">' + iri + '</a></dd>');
      });

      s = '<dt>Assignees</dt>' + a.join('');

      return s;
    },

    getContactInformation: function(g) {
      var s = '';
      var resourceOwners = [];

      var solidOwner = g.out(ns.solid.owner).values;

      if (solidOwner.length) {
        DO.C.Resource[g.term.value] = DO.C.Resource[g.term.value] || {};
        DO.C.Resource[g.term.value]['owner'] = [];

        solidOwner.forEach(iri => {
          DO.C.Resource[g.term.value]['owner'].push(iri);

          resourceOwners.push('<dd><a href="' + iri + '" target="_blank">' + iri + '</a></dd>');
        });

        s = '<dl id="resource-owners"><dt>Owners</dt>' + resourceOwners.join('') + '</dl>';
      }

      return s;
    },

    getCommunicationOptions: function(g, options = {}) {
      var subjectURI = options.subjectURI || g.term.value;
      g = g.node(rdf.namedNode(subjectURI));
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

        notificationSubscriptions.forEach(subscription => {
          var nS = g.node(rdf.namedNode(subscription));
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

            features.forEach(iri => {
              var label, href = iri;

              switch (iri) {
                case ns.notify.startAt.value:
                case ns.notify.endAt.value:
                case ns.notify.state.value:
                case ns.notify.rate.value:
                case ns.notify.accept.value:
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
    getNotificationSubscriptions: function(g) {
      var notifysubscription = g.out(ns.notify.subscription).values;
      return (notifysubscription.length)
        ? notifysubscription
        : undefined
    },

    getNotificationChannels: function(g) {
      var notifychannel = g.out(ns.notify.channel).values;
      return (notifychannel.length)
        ? notifychannel
        : undefined
    },

    getNotificationChannelTypes: function(g) {
      var notifychannelType = g.out(ns.notify.channelType).values;
      return (notifychannelType)
        ? notifychannelType
        : undefined
    },

    getNotificationFeatures: function(g) {
      var notifyfeature = g.out(ns.notify.feature).values;
      return (notifyfeature.length)
        ? notifyfeature
        : undefined
    },

    //doap:implements <https://solidproject.org/TR/2022/notification-protocol-20221231#subscription-client-subscription-request>
    subscribeToNotificationChannel: function(url, data) {
      switch(data.type){
        //doap:implements <https://solidproject.org/TR/websocket-channel-2023>
        case ns.notify.WebSocketChannel2023.value:
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
          data = '<> a <' + d.type  + '> ;\n\
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
            case 'WebSocketChannel2023': case ns.notify.WebSocketChannel2023.value:
              data.type = ns.notify.WebSocketChannel2023.value;
              return DO.U.connectToWebSocket(data.receiveFrom, data).then(i => {
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
// console.log(data)
        // return getGraphFromData(data, options).then
        switch (contentType) {
          case 'text/turtle':
            return Promise.reject({'message': 'TODO text/turtle', 'data': data});

          case 'application/ld+json':
            if (data['@context'] && data.type && data.topic) {
              if (d.topic != data.topic) {
                console.log('TODO: topic requested != response');
              }
// console.log(d.type, data)
              //TODO d.type == 'LDNChannel2023' && data.sender
              if ((d.type == 'WebSocketChannel2023' || d.type == ns.notify.WebSocketChannel2023.value) && data.receiveFrom) {
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
          nTypes.forEach(t => {
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
          showActionMessage(document.body, message);

          // return Promise.resolve(data);
        // }
      }
    },

    connectToWebSocket: function(url, data) {
      function connect() {
        return new Promise((resolve, reject) => {
// console.log(data)
          var protocols = [data.type];
// protocols = ['solid-0.1'];
// console.log(url, protocols)
          var ws = new WebSocket(url);
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
            // setTimeout(() => { connect(); }, 1000);
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

      return connect().then().catch((err) => {
        console.log(err)
      });
    },

    //TODO: Refactor, especially buttons.
    initBrowse: function(baseUrl, input, browseButton, createButton, id, action){
      input.value = baseUrl;
      var headers;
      headers = {'Accept': 'text/turtle, application/ld+json'};
      getResourceGraph(baseUrl, headers)
        .then(g => {
          DO.U.generateBrowserList(g, baseUrl, id, action)
            .then(i => {
              DO.U.showStorageDescription(g, id, baseUrl);
            });
        })
        .then(i => {
          document.getElementById(id + '-' + action).textContent = (action == 'write') ? input.value + generateAttributeId() : input.value;
        });

      browseButton.addEventListener('click', (e) => {
        DO.U.triggerBrowse(input.value, id, action);
      }, false);

      if (DO.C['Session']?.isActive) {
        createButton.addEventListener('click', (e) => {
          DO.U.showCreateContainer(input.value, id, action, e);
        }, false);
      }
    },

    triggerBrowse: function(url, id, action){
      var inputBox = document.getElementById(id);
      if (url.length > 10 && url.match(/^https?:\/\//g) && url.slice(-1) == "/"){
// console.log(url)
        var headers;
        headers = {'Accept': 'text/turtle, application/ld+json'};
        getResourceGraph(url, headers).then(g => {
          DO.U.generateBrowserList(g, url, id, action).then(l => {
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
        div.replaceChildren();
      }

      div.insertAdjacentHTML('beforeend', '<label for="' + id + '-create-container-name">Container Name</label> <input id="' + id + '-create-container-name" name="' + id + '-create-container-name" type="text" placeholder="My Secret Stuff" /> <button class="insert" disabled="disabled">Create</button>');

      var label = div.querySelector('label');
      var input = div.querySelector('input');

      var createButton = document.querySelector('#' + id + '-create-container button.insert');

      input.addEventListener('keyup', (e) => {
        var containerLabel = domSanitize(input.value.trim());

        if (containerLabel.length) {
          createButton.removeAttribute('disabled');
        }
        else {
          createButton.disabled = 'disabled';
        }
      });

      createButton.addEventListener('click', (e) => {
        //FIXME: Escaping containerLabel and containerURL (request-target) can be better.

        var patch = {};
        var containerLabel = domSanitize(input.value.trim());
        var insertG = '<> <' + ns.dcterms.title.value +  '> """' + escapeRDFLiteral(containerLabel) + '""" .';
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
      // console.log(statusCode);
      console.log(response);

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

      node.insertAdjacentHTML('beforeend', '<div class="response-message"><p class="error">' + domSanitize(msg) + '</p></div>');
    },

    setupResourceBrowser: function(parent, id, action){
      id = id || 'browser-location';
      id = domSanitize(id);
      action = action || 'write';
      action = domSanitize(action);

      var createContainerButton = '';
      var createContainerDiv = '';
      if  (DO.C['Session']?.isActive) {
        createContainerButton = ' <button id="' + id + '-create-container-button' + '" title="Create container (folder)">Create container</button>';
        createContainerDiv = '<div id="' + id + '-create-container"></div>';
      }

      parent.insertAdjacentHTML('beforeend', '<div id="' + id + '"><label for="' + id +'-input">URL</label> <input type="text" id="' + id +'-input" name="' + id + '-input" placeholder="https://example.org/path/to/" /><button id="' + id +'-update" disabled="disabled" title="Browse location">Browse</button>' + createContainerButton+ '</div>' + createContainerDiv + '<div id="' + id + '-listing"></div>');

      var inputBox = document.getElementById(id);
      var createContainer = document.getElementById(id + '-create-container');
      var createButton = document.getElementById(id + '-create-container-button');
      var storageBox = document.getElementById(id + '-listing');
      var input = document.getElementById(id + '-input');
      var browseButton = document.getElementById(id + '-update');

      input.addEventListener('keyup', (e) => {
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

      if(DO.C.User.Storage && DO.C.User.Storage.length) {
        baseUrl = forceTrailingSlash(DO.C.User.Storage[0]);
      }
      else if(DO.C.User.Outbox && DO.C.User.Outbox[0]) {
        baseUrl = forceTrailingSlash(DO.C.User.Outbox[0]);
      }


      if(baseUrl){
        DO.U.initBrowse(baseUrl, input, browseButton, createButton, id, action);
      }
      else {
        getLinkRelation(ns.oa.annotationService.value, null, getDocument()).then(
          function(storageUrl) {
            DO.U.initBrowse(storageUrl[0], input, browseButton, createButton, id, action);
          },
          function(){
            var input = document.getElementById(id + '-input');

            if (DO.C['Session']?.isActive) {
              browseButton.addEventListener('click', () => {
                createContainer.replaceChildren();
                DO.U.triggerBrowse(input.value, id, action);
              }, false);

              createButton.addEventListener('click', (e) => {
                DO.U.showCreateContainer(input.value, id, action, e);
              }, false);
            }
          }
        )
      }
    },

    showResourceBrowser: function(id, action) {
      id = id || 'location-' + generateAttributeId();
      id = domSanitize(id);
      action = action || 'write';
      action = domSanitize(id);

      var browserHTML = '<aside id="resource-browser-' + id + '" class="do on">' + DO.C.Button.Close + '<h2>Resource Browser</h2></aside>';
      document.body.appendChild(fragmentFromString(browserHTML));

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
      document.body.insertAdjacentHTML('beforeend', '<aside id="open-document" class="do on">' + DO.C.Button.Close + `<h2>Open Document ${getButtonHTML({ button: 'info', buttonClass: 'info', buttonTitle: 'About Open', buttonRel: 'rel:help', buttonResource: Config.ButtonInfo['feature-open'] })}</h2><div class="info"></div><p><label for="open-local-file">Open local file</label> <input type="file" id="open-local-file" name="open-local-file" /></p></aside>`);

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
      // var pIRI = getProxyableIRI(iri);
      // if (pIRI.slice(0, 5).toLowerCase() == 'http:') {
      // }

      // options['noCredentials'] = true;

      var handleResource = function handleResource (iri, headers, options) {
        var message = {
          'content': 'Opening <a href="' + iri + '" target="_blank">' + iri + '</a>.',
          'type': 'info',
          'timer': 10000
        }
        addMessageToLog(message, Config.MessageLog);
        message.content = '<span class="progress">' + Icon[".fas.fa-circle-notch.fa-spin.fa-fw"] + message.content + '</span>';
        const messageId = showActionMessage(document.body, message);

        return getResource(iri, headers, options)
          .catch(error => {
            console.log(error)
            // console.log(error.status)
            // console.log(error.response)

            //XXX: It was either a CORS related issue or 4xx/5xx.

            document.getElementById(messageId).remove();

            var message = 'Unable to open <a href="' + iri + '" target="_blank">' + iri + '</a>.';
            message = {
              'content': message,
              'type': 'error',
              'timer': 5000
            }
            addMessageToLog(message, Config.MessageLog);
            message.content = '<span class="progress">' + Icon[".fas.fa-times-circle.fa-fw"] + message.content + '</span>';
            showActionMessage(document.body, message);

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
                //   data = domSanitize(data);
                //   console.log(DOMPurify.removed)
                // }

                DO.U.setDocumentURL(iri);
                var documentURL = DO.C.DocumentURL;
                DO.C['Resource'][documentURL] = Config['Resource'][documentURL] || {};

                var spawnOptions = {};

                var checkMarkdownInMediaTypes = ['text/markdown', 'text/plain'];
                if  (checkMarkdownInMediaTypes.includes(options['contentType'])) {
                  data = parseMarkdown(data, {createDocument: true});
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
                showActionMessage(document.body, message);
              })
          })
      }

      handleResource(iri, headers, options);
    },

    //XXX: Review grapoi
    buildResourceView: function(data, options) {
      if (!DO.C.MediaTypes.RDF.includes(options['contentType'])) {
        return Promise.resolve({"data": data, "options": options});
      }

      return getGraphFromData(data, options).then(
        function(g){
// console.log(g)
          var title = getGraphLabel(g) || options.subjectURI;
          var h1 = '<a href="' +  options.subjectURI + '">' + title + '</a>';

          var types = getGraphTypes(g);
// console.log(types)
          if(types.includes(ns.ldp.Container.value) ||
             types.includes(ns.as.Collection.value) ||
             types.includes(ns.as.OrderedCollection.value)) {

            return DO.U.processResources(options['subjectURI'], options).then(
              function(urls) {
                var promises = [];
                urls.forEach(url => {
                  // console.log(u);
                  // window.setTimeout(function () {

                    // var pIRI = getProxyableIRI(u);
                    promises.push(getResourceGraph(url));
                  // }, 1000)
                });

                // return Promise.all(promises.map(p => p.catch(e => e)))
                return Promise.allSettled(promises)
                  .then(results => {
                    var items = [];
                    // graphs.filter(result => !(result instanceof Error));

                    //TODO: Refactor if/else based on getResourceGraph
                    results.forEach(result => {
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
                          items.push('<li rel="schema:hasPart" resource="' + result.value.term.value + '">' + html + '</li>');
                        }
                      }
                    })

                    //TODO: Show createNewDocument button.
                    var createNewDocument = '';

                    var listItems = '';

                    if (items.length) {
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

      name = getGraphLabel(g) || g.term.value;
      name = '<a href="' + g.term.value + '" property="schema:name" rel="schema:url">' + name + '</a>';

      function getValues(g, properties) {
        let result;
        properties.forEach(p => {
          result = g.out(p).values;
        })
        return result;
      } 

      var properties = [ns.schema.datePublished, ns.dcterms.issued, ns.dcterms.date, ns.as.published, ns.schema.dateCreated, ns.dcterms.created, ns.prov.generatedAtTime, ns.dcterms.modified, ns.as.updated];
      var datePublished = getValues(g, properties)[0] || '';

      if (datePublished) {
        published = ', <time content="' + datePublished + '" datetime="' + datePublished + '" property="schema:dataPublished">' + datePublished.substr(0,10) + '</time>';
      }

      if (g.out(ns.oa.hasBody).values.length) {
        summary = g.node(rdf.namedNode(summary)).out(ns.rdf.value).values[0];
      }
      else {
        summary = getValues(g, [ns.schema.abstract, ns.dcterms.description, ns.rdf.value, ns.as.summary, ns.schema.description, ns.as.content])[0] || '';
      }

      if (summary) {
        summary = '<div datatype="rdf:HTML" property="schema:description">' + summary + '</div>';
      }

      if (g.out(ns.as.tag).values.length) {
        tags = [];
        g.out(ns.as.tag).values.forEach(tagURL => {
          var t = g.node(g.namedNode(tagURL));
          var tagName = getFragmentOrLastPath(tagURL);

          if (t.out(ns.as.href).values.length) {
            tagURL = t.out(ns.as.href).values[0];
          }
          if (t.out(ns.as.name).values.length) {
            tagName = t.out(ns.as.name).values[0];
          }
          tags.push('<li><a href="' + tagURL + '" rel="schema:about">' + tagName + '</a></li>');
        })
        tags = '<ul>' + tags.join('') + '</ul>';
      }

      return image + name + published + summary + tags;
    },

    spawnDokieli: async function(documentNode, data, contentType, iri, options = {}){
      iri = domSanitize(iri);
      const isHttpIRI = isHttpOrHttpsProtocol(iri);
      const isFileIRI = isFileProtocol(iri);

      if (!isHttpIRI && !isFileIRI) {
        const message = `Cannot open non http(s): or file: URLs.`;
        const messageObject = {
          'content': message,
          'type': 'error',
          'timer': 3000,
        }
        addMessageToLog(messageObject, Config.MessageLog);
        showActionMessage(document.body, messageObject);

        throw new Error(message);
      }

      var tmpl = document.implementation.createHTMLDocument('template');
      // console.log(tmpl);

      switch(contentType){
        case 'text/html': case 'application/xhtml+xml':
          tmpl.documentElement.setHTMLUnsafe(data);
          tmpl.body.setHTMLUnsafe(domSanitize(tmpl.body.getHTML()));
          break;

        case 'application/gpx+xml':
          // console.log(data)
          tmpl = await generateGeoView(data)
            // FIXME: Tested with generateGeoView returning a Promise but somehow
            .then(i => {
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
                showActionMessage(document.body, message);

                var w = document.getElementById(id);
                window.history.pushState(null, null, '#' + id);
                w.scrollIntoView();
              }

              return i;
            });

          break;

        default:
          data = escapeCharacters(data)
          // console.log(data)
          var iframe = document.createElement('iframe');
          // <pre type=&quot;' + contentType + '&quot; -- nice but `type` is undefined attribute for `pre`.at the moment. Create issue in WHATWG for fun/profit?
          iframe.srcdoc = '<pre>' + data + '</pre>';
          iframe.width = '1280'; iframe.height = '720';

          const dt = (isFileIRI) ? `<code>${iri.slice(5)}</code>` : `<a href="${iri}" rel="noopener" target="_blank">${iri}</a>`;

          var main = fragmentFromString(`<main><article><dl><dt>${dt}</dt><dd></dd></dl></article></main>`);
          main.querySelector('dd').appendChild(iframe);
          tmpl.body.appendChild(main);
          break;
      }

      if (options.defaultStylesheet) {
        var documentCss = document.querySelectorAll('head link[rel~="stylesheet"][href]');

        let hasDokieliCss = false;

        documentCss.forEach(node => {
          const href = node.href;
          const isBasicCss = href === 'https://dokie.li/media/css/basic.css';
          const isDokieliCss = href === 'https://dokie.li/media/css/dokieli.css';

          node.setAttribute('href', href);

          if (!isBasicCss && !isDokieliCss) {
            node.setAttribute('disabled', 'disabled');
            node.classList.add('do');
          }
          else {
            node.setAttribute('rel', 'stylesheet');
            hasDokieliCss = true;
          }
        });

        if (!hasDokieliCss) {
          document.querySelector('head').insertAdjacentHTML('beforeend', `
            <link href="https://dokie.li/media/css/basic.css" media="all" rel="stylesheet" title="Basic" />
            <link href="https://dokie.li/media/css/dokieli.css" media="all" rel="stylesheet" />`);
        }
      }

      var documentScript = document.querySelectorAll('head script[src]');
      documentScript.forEach(node => {
        node.setAttribute('src', node.src);
      })

      if (options.init === true && isHttpIRI) {
        var baseElements = document.querySelectorAll('head base');
        baseElements.forEach(baseElement => {
          baseElement.remove();
        });

        document.querySelector('head').insertAdjacentHTML('afterbegin', '<base href="' + iri + '" />');
        //TODO: Setting the base URL with `base` seems to work correctly, i.e., link base is opened document's URL, and simpler than updating some of the elements' href/src/data attributes. Which approach may be better depends on actions afterwards, e.g., Save As (perhaps other features as well) may need to remove the base and go with the user selection.
        // var nodes = tmpl.querySelectorAll('head link, [src], object[data]');
        // nodes = DO.U.rewriteBaseURL(nodes, {'baseURLType': 'base-url-absolute', 'iri': iri});
      }

      if (contentType == 'application/gpx+xml') {
        options['init'] = false;

        //XXX: Should this be taken care by ufpdating the document.documentElement and then running DO.C.init(iri) ? If I'm asking, then probably yes.
        var asideOpenDocument = document.getElementById('open-document');
        if (asideOpenDocument) {
          asideOpenDocument.parentNode.removeChild(asideOpenDocument);
        }
        document.querySelector('#document-do .resource-open').disabled = false;
        DO.U.hideDocumentMenu();
      }
      else if (options.init === true) { // && !isFileIRI ?
        // window.open(iri, '_blank');

        //TODO: Which approach?
        // var restrictedNodes = Array.from(document.body.querySelectorAll('.do:not(.copy-to-clipboard):not(.robustlinks):not(.ref):not(.delete):not(#document-action-message)'));
        // var restrictedNodes = [document.getElementById('document-menu'), document.getElementById('document-editor'), document.getElementById('document-action-message')];
        // restrictedNodes.forEach(node => {
        //   tmpl.body.appendChild(node);
        // });

        const tmplBody = tmpl.body.cloneNode(true);

        document.documentElement.replaceChild(tmplBody, document.body);
        DO.U.showDocumentInfo();
        DO.U.initEditor();

        // DO.U.hideDocumentMenu();
        return;
      }

      //XXX: This is used in cases options.init is false or undefined
      return tmpl.documentElement.cloneNode(true);

      // console.log('//TODO: Handle server returning wrong or unknown Response/Content-Type for the Request/Accept');
    },

    createNewDocument: function(e) {
      DO.U.hideDocumentMenu();

      DO.Editor.toggleEditor('author', e, { template: 'new' });
    },

    //XXX: To be deprecated. Formerly used for createNewDocument 
    createNewDocumentSaveAs: function(e) {
      e.target.disabled = true
      document.body.appendChild(fragmentFromString('<aside id="create-new-document" class="do on">' + DO.C.Button.Close + '<h2>Create New Document</h2></aside>'))

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
      baseURLSelection = domSanitize(baseURLSelection);

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
        var title = (storageIRI.length) ? getURLLastPath(storageIRI) : ''
        title = DO.U.generateLabelFromString(title);

        var rm = newDocument.querySelector('.response-message')
        if (rm) {
          rm.parentNode.removeChild(rm)
        }

        var html = document.documentElement.cloneNode(true)
        var baseURLSelectionChecked = newDocument.querySelector('select[name="base-url"]')
        // console.log(baseURLSelectionChecked);

        if (baseURLSelectionChecked.length) {
          var baseURLType = baseURLSelectionChecked.value
          var nodes = html.querySelectorAll('head link, [src], object[data]')
          if (baseURLType == 'base-url-relative') {
            DO.U.copyRelativeResources(storageIRI, nodes)
          }
          nodes = DO.U.rewriteBaseURL(nodes, {'baseURLType': baseURLType})
        }

        html.querySelector('body').setHTMLUnsafe(domSanitize('<main><article about="" typeof="schema:Article"><h1 property="schema:name">' + title + '</h1></article></main>'));
        html.querySelector('head title').setHTMLUnsafe(domSanitize(title));
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
              'Could not create new document: ' + domSanitize(message) + '</p>'
            )
          })
      })
    },

    saveAsDocument: async function saveAsDocument (e) {
      if (e) {
        e.target.closest('button').disabled = true;
      }

      document.body.appendChild(fragmentFromString(`<aside id="save-as-document" class="do on">${DO.C.Button.Close}<h2>Save As ${getButtonHTML({ button: 'info', buttonClass: 'info', buttonTitle: 'About Save As', buttonRel: 'rel:help', buttonResource: Config.ButtonInfo['feature-save-as'] })}</h2><div class="info"></div></aside>`));

      var saveAsDocument = document.getElementById('save-as-document');
      saveAsDocument.addEventListener('click', (e) => {
        if (e.target.closest('button.close')) {
          document.querySelector('#document-do .resource-save-as').disabled = false;
        }
      });

      var fieldset = '';

      var locationInboxId = 'location-inbox';
      var locationInboxAction = 'read';
      saveAsDocument.insertAdjacentHTML('beforeend', '<div><input id="' + locationInboxId + '-set" name="' + locationInboxId + '-set" type="checkbox" /> <label for="' + locationInboxId + '-set">Set Inbox</label></div>');

      saveAsDocument.addEventListener('click', (e) => {
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

      saveAsDocument.addEventListener('click', (e) => {
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
        img.forEach(i => {
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
      if (imgFailed.length || imgCantTell.length) {
        imgAccessibilityReport += (imgFailed.length) ? '<li>Fail: Images (<code>img</code>) without alternative text (<code>alt</code>).</li>' : '';
        imgAccessibilityReport += (imgCantTell.length) ? '<li>Can\'t Tell: Images (<code>img</code>) without a non-empty alternative text (<code>alt</code>).</li>' : '';
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
        video.forEach(i => {
          if (i.querySelector('track') && i.hasAttribute('kind')) {
            videoPassed.push(i);
          }
          else {
            videoFailed.push(i);
          }
        });
      }
      var videoAccessibilityReport = '';
      if (videoFailed.length) {
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
        audio.forEach(i => {
          if (i.querySelector('track') && i.hasAttribute('kind')) {
            audioPassed.push(i);
          }
          else {
            audioFailed.push(i);
          }
        });
      }
      var audioAccessibilityReport = '';
      if (audioFailed.length) {
        audioAccessibilityReport += '<li>Fail: Audios (<code>audio</code>) without external timed text tracks (<code>track</code> or <code>track</code> with <code>kind</code> of text track.)</li>';
      }

      var aRWarning = '<p>This document contains some content, e.g., images, videos, audio, that is not accompanied with alternative text or an alternative text field without information. End users with disabilities will likely experience difficulty accessing the content. Please consider adding alternative text before continuing:</p>';
      var aRSuccess = '<p>All content in this document includes alternative text. End users with disabilities will likely have a good experience with this document.</p>';
      var accessibilityReport = '';
      if (imgAccessibilityReport.length || audioAccessibilityReport.length || videoAccessibilityReport.length) {
        accessibilityReport += aRWarning + '<ul>' + imgAccessibilityReport + audioAccessibilityReport + videoAccessibilityReport + '</ul>';
      }
      else {
        accessibilityReport += aRSuccess;
      }
      accessibilityReport = '<details id="accessibility-report-save-as"><summary>Accessibility Report</summary>' + accessibilityReport + '</details>';

      let dokielizeResource = '';
      let derivationData = '';
      
      if (!DO.Editor['new']) {
        dokielizeResource = '<li><input type="checkbox" id="dokielize-resource" name="dokielize-resource" /><label for="dokielize-resource">dokielize</label></li>';
        derivationData = '<li><input type="checkbox" id="derivation-data" name="derivation-data" checked="checked" /><label for="derivation-data">Derivation data</label></li>'
      }

      var id = 'location-save-as';
      var action = 'write';
      saveAsDocument.insertAdjacentHTML('beforeend', '<fieldset id="' + id + '-fieldset"><legend>Save to</legend></fieldset>');
      fieldset = saveAsDocument.querySelector('fieldset#' + id + '-fieldset');
      DO.U.setupResourceBrowser(fieldset, id, action);
      fieldset.insertAdjacentHTML('beforeend', '<p id="' + id + '-samp' + '">Article will be saved at: <samp id="' + id + '-' + action + '"></samp></p>' + DO.U.getBaseURLSelection() + '<ul>' + dokielizeResource + derivationData + '</ul>' + accessibilityReport + '<button class="create" title="Save to destination">Save</button>');
      var bli = document.getElementById(id + '-input');
      bli.focus();
      bli.placeholder = 'https://example.org/path/to/article';

      saveAsDocument.addEventListener('click', async (e) => {
        if (!e.target.closest('button.create')) {
          return
        }

        var saveAsDocument = document.getElementById('save-as-document')
        var storageIRI = saveAsDocument.querySelector('#' + id + '-' + action).innerText.trim()

        var rm = saveAsDocument.querySelector('.response-message')
        if (rm) {
          rm.parentNode.removeChild(rm)
        }

        if (!storageIRI.length) {
          saveAsDocument.insertAdjacentHTML('beforeend',
            '<div class="response-message"><p class="error">' +
            'Specify the location to save the article to, and optionally set its <em>inbox</em> or <em>annotation service</em>.</p></div>'
          )

          return
        }

        var html = document.documentElement.cloneNode(true)
        var o, r

        if (!DO.Editor['new']) {
          var dokielize = document.querySelector('#dokielize-resource')
          if (dokielize.checked) {
            html = getDocument(html)
            html = await DO.U.spawnDokieli(document, html, 'text/html', storageIRI, {'init': false})
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
        if (baseURLSelectionChecked.length) {
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
            url = domSanitize(url);

            var documentMode = (DO.C.WebExtension) ? '' : '?author=true'

            saveAsDocument.insertAdjacentHTML('beforeend',
              '<div class="response-message"><p class="success">' +
              'Document saved at <a href="' + url + documentMode + '">' + url + '</a></p></div>'
            )

            if (DO.Editor['new']) {
              //XXX: Commenting this out for now, not sure what this was supposed to fix
              // DO.Editor.replaceContent('author', fragmentFromString(html));
              DO.Editor['new'] = false;

              var urlObject = new URL(url);
              var documentURLObject = new URL(DO.C.DocumentURL);

              if (urlObject.origin === documentURLObject.origin) {
                window.history.pushState({}, null, url);
                DO.U.setDocumentURL(url);
                DO.U.hideDocumentMenu();
              }
              else {
                window.open(url + documentMode, '_blank');
              }
            }
            else {
              window.open(url + documentMode, '_blank');
            }
          })

          .catch(error => {
            console.log('Error saving document. Status: ' + error.status)

            progress.parentNode.removeChild(progress)

            let message

            var requestAccess = '';
            var linkHeaders;
            var inboxURL;
            // TODO: error.response could be undefined, handle this case (error UI)
            var link = error.response.headers.get('Link');
            if (link) {
              linkHeaders = LinkHeader.parse(link);
            }

            if (DO.C.User.IRI && linkHeaders && linkHeaders.has('rel', ns.ldp.inbox.value)){
              inboxURL = linkHeaders.rel(ns.ldp.inbox.value)[0].uri;
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

            saveAsDocument.insertAdjacentHTML('beforeend', domSanitize(
              '<div class="response-message"><p class="error">' +
              'Unable to save: ' + message + '</p>' + requestAccess + '</div>')
            )

            if (DO.C.User.IRI && requestAccess) {
              document.querySelector('#save-as-document .response-message .request-access').addEventListener('click', (e) => {
                var objectId = '#' + generateUUID();

                inboxURL = e.target.dataset.inbox;
                var accessTo = e.target.dataset.target;
                var agent = DO.C.User.IRI;

                e.target.disabled = true;
                var responseMessage = e.target.parentNode;
                responseMessage.insertAdjacentHTML('beforeend', domSanitize(
                  '<span class="progress" data-to="' + inboxURL +
                  '">' + Icon[".fas.fa-circle-notch.fa-spin.fa-fw"] + '</span>'))

                var notificationStatements = `<dl about="` + objectId + `" prefix="acl: http://www.w3.org/ns/auth/acl#">
  <dt>Object type</dt><dd><a about="` + objectId + `" href="` + ns.acl.Authorization.value + `" typeof="acl:Authorization">Authorization</a></dd>
  <dt>Agents</dt><dd><a href="` + agent + `" property="acl:agent">` + agent + `</a></dd>
  <dt>Access to</dt><dd><a href="` + accessTo + `" property="acl:accessTo">` + accessTo + `</a></dd>
  <dt>Modes</dt><dd><a href="` + ns.acl.Read.value + `" property="acl:mode">Read</a></dd><dd><a href="` + ns.acl.Write.value + `" property="acl:mode">Write</a></dd>
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
                      .setHTMLUnsafe(domSanitize(Icon[".fas.fa-times-circle.fa-fw"] + ' Unable to notify. Try later.'))
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
                      .setHTMLUnsafe(domSanitize(notificationSent))
                  })

              })
            }
          })
      })
    },

    viewSource: function(e) {
      if (e) {
        e.target.closest('button').disabled = true;
      }

      var buttonDisabled = (document.location.protocol === 'file:') ? ' disabled="disabled"' : '';

      document.body.appendChild(fragmentFromString('<aside id="source-view" class="do on">' + DO.C.Button.Close + `<h2>Source ${getButtonHTML({ button: 'info', buttonClass: 'info', buttonTitle: 'About Source', buttonRel: 'rel:help', buttonResource: Config.ButtonInfo['feature-source'] })}</h2>` + '<div class="info"></div><textarea id="source-edit" rows="24" cols="80"></textarea><p><button class="update"'+ buttonDisabled + ' title="Update source">Update</button></p></aside>'));
      var sourceBox = document.getElementById('source-view');
      var input = document.getElementById('source-edit');
      input.value = getDocument();

      sourceBox.addEventListener('click', (e) => {
        if (e.target.closest('button.update')) {
          var data = document.getElementById('source-edit').value;
          //FIXME: dokieli related stuff may be getting repainted / updated in the DOM
          document.documentElement.setHTMLUnsafe(domSanitize(data));
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
      if (typeof nodes === 'object' && nodes.length) {
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
      if (typeof s === 'string' && s.length) {
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

    //TODO: Review grapoi
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

        var isbnData = rdf.grapoi({ dataset: rdf.dataset() }).node(rdf.namedNode(url));

        return getResource(url, headers, options)
          .then(response => {
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
              isbnData.addOut(ns.schema.name, data.title);
            }

          //Unused
//           if (data.subtitle) {
// console.log(data.subtitle)
//           }

            if (data.publish_date) {
// console.log(data.publish_date)
              isbnData.addOut(schemadatePublished, getDateTimeISOFromMDY(data.publish_date));
            }

            if (data.covers) {
// console.log(data.covers)
              isbnData.addOut(ns.schema.image, rdf.namedNode('https://covers.openlibrary.org/b/id/' + data.covers[0] + '-S.jpg'));
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

            if (data.authors && Array.isArray(data.authors) && data.authors.length && data.authors[0].key) {
              var a = 'https://openlibrary.org' + data.authors[0].key;
// console.log(a)
              promises.push(getResource(a, headers, options)
                .then(response => {
// console.log(response)
                  return response.text();
                })
                .then(data => {
                  //TODO: try/catch?
                  data = JSON.parse(data);
// console.log(data)

                  var authorURL = 'http://example.com/.well-known/genid/' + generateUUID();
                  if (data.links && Array.isArray(data.links) && data.links.length) {
// console.log(data.links[0].url)
                    authorURL = data.links[0].url;
                  }
                  isbnData.addOut(ns.schema.author, rdf.namedNode(authorURL), authorName => {
                    if (data.name) {
                      authorName.addOut(ns.schema.name, data.name);
                    }
                  });

                  return isbnData;

                //XXX: Working but unused:
//                 if (data.remote_ids && data.remote_ids.wikidata) {
//                   //wE has a few redirects to wW
//                   var wE = 'https://www.wikidata.org/entity/' + data.remote_ids.wikidata;
//                   var wW = 'https://www.wikidata.org/wiki/Special:EntityData/' + data.remote_ids.wikidata + '.jsonld';
//                   promises.push(getResourceGraph(wW, wikidataHeaders, options)
//                     .then(g => {
// // console.log(g)
// // console.log(g.iri().toString())
//                       var s = g.match(wE.replace(/^https:/, 'http:'))
// // console.log(s.toString());

//                       console.log(isbnData)
//                       console.log(isbnData.toString())

//                       return isbnData;
//                     }));
//                 }

                }));
            }

            // XXX: Working but unused:
            // if (data.identifiers?.wikidata && Array.isArray(data.identifiers.wikidata) && data.identifiers.wikidata.length) {
              // var w = 'https://www.wikidata.org/entity/' + data.identifiers.wikidata[0];
              // promises.push(getResourceGraph(w, wikidataHeaders, options).then(g => {
// console.log(g);
// console.log(g.toString());
              // }));
            // }

            return Promise.allSettled(promises)
              .then(results => {
                var items = [];
                results.forEach(result => {
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
      var subject = citationGraph.node(rdf.namedNode(citationURI));
// console.log(citationGraph);
// console.log('citationGraph.iri().toString(): ' + citationGraph.iri().toString());
// console.log('citationGraph.toString(): ' + citationGraph.toString());
// console.log('options.citationId: ' + options.citationId);
// console.log('citationURI: ' + citationURI);
// console.log('subject.iri().toString(): ' + subject.iri().toString());

      var title = getGraphLabel(subject);
      //FIXME: This is a hack that was related to SimpleRDF's RDFa parser not setting the base properly. May no longer be needed.
      if(typeof title == 'undefined') {
        subject = citationGraph.node(rdf.namedNode(options.citationId));

        title = getGraphLabel(subject) || '';
      }
      title = escapeCharacters(title);
      title = (title.length) ? '<cite>' + title + '</cite>, ' : '';
      var datePublished = getGraphDate(subject) || '';
      var dateVersion = subject.out(ns.schema.dateModified).values[0] || datePublished;
      datePublished = (datePublished) ? datePublished.substr(0,4) + ', ' : '';
      var dateAccessed = 'Accessed: ' + getDateTimeISO();
      var authors = [], authorList = [];
// console.log(subject);
// console.log(subject.biboauthorList);
// console.log(subject.schemaauthor);
// console.log(subject.dctermscreator);

      //XXX: FIXME: Putting this off for now because SimpleRDF is not finding the bnode for some reason in citationGraph.child(item), or at least authorItem.rdffirst (undefined)
      //TODO: Revisit using grapoi
//       if (subject.biboauthorList) {
//TODO: Just use/test something like: authorList = authorList.concat(traverseRDFList(citationGraph, subject.biboauthorList));
//       }
//       else

      var schemaAuthor = subject.out(ns.schema.author).values;
      var dctermsCreator = subject.out(ns.dcterms.creator).values;
      var asActor = subject.out(ns.as.actor).values;
      if (schemaAuthor.length) {
        schemaAuthor.forEach(a => {
          authorList.push(a);
        });
      }
      else if (dctermsCreator.length) {
        dctermsCreator.forEach(a => {
          authorList.push(a);
        });
      }
      else if (asActor.length) {
        asActor.forEach(a => {
          authorList.push(a);
        });
      }
// console.log(authorList);

      if (authorList.length) {
        authorList.forEach(authorIRI => {
          var s = subject.node(rdf.namedNode(authorIRI));
          var author = getAgentName(s);
          var schemafamilyName = s.out(ns.schema.familyName).values;
          var schemagivenName = s.out(ns.schema.givenName).values;
          var foaffamilyName = s.out(ns.foaf.familyName).values;
          var foafgivenName = s.out(ns.foaf.givenName).values;

          if (schemafamilyName.length && schemagivenName.length) {
            author = DO.U.createRefName(schemafamilyName[0], schemagivenName[0]);
          }
          else if (foaffamilyName.length && foafgivenName.length) {
            author = DO.U.createRefName(foaffamilyName[0], foafgivenName[0]);
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
      var memento = subject.out(ns.mem.memento).values;
      var latestVersion = subject.out(ns.rel['latest-version']).values;
      if (memento.length) {
        dataVersionURL = memento;
      }
      else if (latestVersion.length) {
        dataVersionURL = latestVersion;
      }
      dataVersionURL = (dataVersionURL) ? ' data-versionurl="' + dataVersionURL + '"' : '';

      var dataVersionDate = (dateVersion) ? ' data-versiondate="' + dateVersion + '"' : '';

      var content = ('content' in options && options.content.length) ? options.content + ', ' : '';

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
        highlights[i].addEventListener('mouseenter', (e) => {
          var c = e.target.getAttribute('class').split(' ')
                    .filter(s => { return s.startsWith('highlight-'); });
          var highlightsX = getDocumentContentNode(document).querySelectorAll('*[class~="'+ c[0] +'"]');
          for (var j = 0; j < highlightsX.length; j++) {
            highlightsX[j].classList.add('do', 'highlight');
          }
        });

        highlights[i].addEventListener('mouseleave', (e) => {
          var c = e.target.getAttribute('class');
          c = e.target.getAttribute('class').split(' ')
                    .filter(s => { return s.startsWith('highlight-'); });
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
              options.optional.prefLabels.forEach(property => {
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
      var values = data.map(n => { return n[obsValue]; }),
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
      triples.forEach(t => {
        var s = t.subject.value;
        var o = t.object.value;
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

      nodes.forEach(node => {
        var li = node.querySelectorAll('nav li.selected');
        var figure = node.querySelectorAll('figure.selected');

        if (li.length == 0 && figure.length == 0) {
          node.querySelector('nav li').classList.add('selected');
          node.querySelector('figure').classList.add('selected');
        }

        node.querySelector('nav').addEventListener('click', (e) => {
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

      var note = g.node(rdf.namedNode(noteIRI));
      if (note.out(ns.as.object).values.length) {
        note = g.node(rdf.namedNode(note.out(ns.as.object).values[0]));
      }
// console.log(noteIRI)
// console.log(note.toString())
// console.log(note)

      var id = generateUUID(noteIRI);
      var refId = 'r-' + id;
      var refLabel = id;

      var inboxIRI = note.out(ns.ldp.inbox).values.length ? note.out(ns.ldp.inbox).values[0] : undefined;
      var asInboxIRI = note.out(ns.as.inbox).values.length ? note.out(ns.as.inbox).values[0] : undefined;
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
          DO.C.Inbox[inboxIRI]['Notifications'].forEach(notification => {
// console.log(notification)
            if (DO.C.Notification[notification]) {
              if (DO.C.Notification[notification]['Activities']) {
                DO.C.Notification[notification]['Activities'].forEach(activity => {
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

      var datetime = getGraphDate(note);

// console.log(datetime);
      //TODO: Create a helper function to look for annotater, e.g., getGraphAnnotatedBy
      var annotatedBy =
        (note.out(ns.schema.creator).values.length) ? note.out(ns.schema.creator) :
        (note.out(ns.dcterms.creator).values.length) ? note.out(ns.dcterms.creator) :
        (note.out(ns.as.creator).values.length) ? note.out(ns.as.creator) :
        undefined;

      var annotatedByIRI;
// console.log(annotatedBy);
      if (annotatedBy) {
        annotatedByIRI = annotatedBy.values[0];
// console.log(annotatedByIRI);
        annotatedBy = g.node(rdf.namedNode(annotatedByIRI));
// console.log(annotatedBy);

        var annotatedByName = getAgentName(annotatedBy);
// console.log(annotatedByName);
        var annotatedByImage = getGraphImage(annotatedBy);
// console.log(annotatedByImage);
        var annotatedByURL = annotatedBy.out(ns.schema.url).values[0];
      }

      var motivatedBy = 'oa:replying';

      //XXX: Is this used? Probably. Fix bodyValue
      var bodyValue = note.out(ns.schema.description).values[0] || note.out(ns.dcterms.description).values[0] || note.out(ns.as.content).values[0];

      var types = getGraphTypes(note);
// console.log(types);
      var resourceTypes = [];
      types.forEach(type => {
        resourceTypes.push(type);
// console.log(type);
      });

      if (resourceTypes.includes(ns.oa.Annotation.value)) {
        bodyValue = note.out(ns.oa.bodyValue).values[0] || bodyValue;
        var hasBody = note.out(ns.oa.hasBody).values;

        if (hasBody.length) {
          var noteLanguage = getGraphLanguage(note);
          var noteLicense = getGraphLicense(note);
          var noteRights = getGraphRights(note);

          var bodyObjects = [];
// console.log(note.oahasBody)
// console.log(note.oahasBody._array)
          hasBody.forEach(bodyIRI => {
// console.log(bodyIRI);
            var bodyObject = {
              "id": bodyIRI
            };

            var body = g.node(rdf.namedNode(bodyIRI));

            if (body) {
// console.log(body.toString());

              var bodyTypes = getGraphTypes(body);
              if (bodyTypes.length) {
                bodyObject['type'] = bodyTypes;
              }

              var rdfValue = body.out(ns.rdf.value).values;
              if (rdfValue.length) {
                bodyObject['value'] = rdfValue[0];
              }

              var hasPurpose = body.out(ns.oa.hasPurpose).values;
              if (hasPurpose.length) {
// console.log(body.oahasPurpose)
                bodyObject['purpose'] = hasPurpose[0];
              }

              //TODO: Revisit format and language when there is a hasPurpose (e.g., describing, tagging)

              var bodyFormat = body.out(ns.dcelements.format).values[0] || body.out(ns.dcterms.format).values[0];
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
        var hasTarget = note.out(ns.oa.hasTarget).values[0];
        if (hasTarget && !(hasTarget.startsWith(documentURL) || 'targetInMemento' in options || 'targetInSameAs' in options)){
          // return Promise.reject();
          return;
        }

        var target = g.node(rdf.namedNode(hasTarget));
        var targetIRI = target.term.value;
// console.log(targetIRI);

        var source = target.out(ns.oa.hasSource).values[0];
// console.log(source);
// console.log(note.oamotivatedBy);
        var motivatedBy = note.out(ns.oa.motivatedBy).values[0];
        if (motivatedBy) {
          refLabel = getReferenceLabel(motivatedBy);
        }

        var exact, prefix, suffix;
        var selector = target.out(ns.oa.hasSelector).values[0];
        if (selector) {
          selector = g.node(rdf.namedNode(selector));
// console.log(selector);

// console.log(selector.rdftype);
// console.log(selector.out(ns.rdf.type).values);
          //FIXME: This is taking the first rdf:type. There could be multiple.
          var selectorTypes = getGraphTypes(selector)[0];
// console.log(selectorTypes)
// console.log(selectorTypes == 'http://www.w3.org/ns/oa#FragmentSelector');
          if (selectorTypes == ns.oa.TextQuoteSelector.value) {
            exact = selector.out(ns.oa.exact).values[0];
            prefix = selector.out(ns.oa.prefix).values[0];
            suffix = selector.out(ns.oa.suffix).values[0];
          }
          else if (selectorTypes == ns.oa.FragmentSelector.value) {
            var refinedBy = selector.out(ns.oa.refinedBy).values[0];
            refinedBy = refinedBy && selector.node(rdf.namedNode(refinedBy));
// console.log(refinedBy)
            exact = refinedBy && refinedBy.out(ns.oa.exact).values[0];
            prefix = refinedBy && refinedBy.out(ns.oa.prefix).values[0];
            suffix = refinedBy && refinedBy.out(ns.oa.suffix).values[0];
// console.log(selector.rdfvalue)
            if (selector.out(ns.rdf.value).values[0] && selector.out(ns.dcterms.conformsTo).values[0] && selector.out(ns.dcterms.conformsTo).values[0].endsWith('://tools.ietf.org/html/rfc3987')) {
              var fragment = selector.out(ns.rdf.value).values[0];
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

          var selectedParentNode = DO.Editor.importTextQuoteSelector(containerNode, selector, refId, motivatedBy, docRefType, { 'do': true });

          var parentNodeWithId = selectedParentNode.closest('[id]');
          targetIRI = (parentNodeWithId) ? documentURL + '#' + parentNodeWithId.id : documentURL;
// console.log(parentNodeWithId, targetIRI)
          var noteData = {
            "type": 'comment',
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
              buttonDelete.addEventListener('click', (e) => {
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
            "type": 'comment',
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
      else if (note.out(ns.as.inReplyTo).values[0] || note.out(ns.sioc.replyof).values[0]) {
        var inReplyTo, inReplyToRel;
        if (note.out(ns.as.inReplyTo).values[0]) {
          inReplyTo = note.out(ns.as.inReplyTo).values[0];
          inReplyToRel = 'as:inReplyTo';
        }
        else if (note.out(ns.sioc.reply_of).values[0]) {
          inReplyTo = note.out(ns.sioc.reply_of).values[0];
          inReplyToRel = 'sioc:reply_of';
        }

        if (inReplyTo && inReplyTo.includes(currentLocation())) {
          noteData = {
            "type": 'comment',
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
      // var pIRI = getProxyableIRI(citation.citingEntity);
      return getResourceGraph(citation.citingEntity)
      .then(i => {
          var cEURL = stripFragmentFromString(citation.citingEntity);
          DO.C.Activity[cEURL] = {};
          DO.C.Activity[cEURL]['Graph'] = i;
          var s = i.node(rdf.namedNode(citation.citingEntity));
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
      s = s.node(rdf.namedNode(citingEntity));

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
        var cEL = getGraphLabel(s.node(rdf.namedNode(cEURL)));
        citingEntityLabel = cEL ? cEL : citingEntity;
      }
      citation['citingEntityLabel'] = citingEntityLabel;

      var citedEntityLabel = getGraphLabel(DO.C.Resource[documentURL].graph.node(rdf.namedNode(citedEntity)));
      if (!citedEntityLabel) {
        cEL = DO.C.Resource[documentURL].graph(DO.C.Resource[documentURL].graph.node(rdf.namedNode(stripFragmentFromString(citedEntity))));
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
      var noteDataHTML = createNoteDataHTML(noteData);

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
      var info = node.querySelector('div.info');
      var progressOld = info.querySelector('.progress');
      var progressNew = fragmentFromString('<div class="progress">' + DO.C.Button.More + ' See more interactions with this document</div>');

      if (progressOld) {
        info.replaceChild(progressNew, progressOld)
      }
      else {
        info.appendChild(progressNew);
      }

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

      //TEMP buttonRel/Resource
      var aside = `<aside class="do" contenteditable="false" id="document-notifications">${DO.C.Button.Toggle}<h2>Notifications ${getButtonHTML({ button: 'info', buttonClass: 'info', buttonTitle: 'About Notifications', buttonRel: 'rel:help', buttonResource: Config.ButtonInfo['feature-notifications'] })}</h2><div><div class="info"></div><ul class="activities"></ul></div></aside>`;
      document.body.insertAdjacentHTML('beforeend', aside);
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
      
// console.log(noteData)
      var note = createNoteDataHTML(noteData);

      var datetime = noteData.datetime ? noteData.datetime : '1900-01-01T00:00:00.000Z';

      var li = domSanitize('<li data-datetime="' + datetime + '"><blockquote cite="' + noteDataIRI + '">'+ note + '</blockquote></li>');
// console.log(li);
      var aside = document.getElementById('document-notifications');

      if(!aside) {
        aside = DO.U.initializeNotifications({includeButtonMore: true});
      }

      var notifications = document.querySelector('#document-notifications > div > ul');
      var timesNodes = aside.querySelectorAll('div > ul > li[data-datetime]');
      var previousElement = null;

      //Maintain reverse chronological order
      if (timesNodes.length) {
        var times = Array.from(timesNodes).map(element => element.getAttribute("data-datetime"));
        var sortedTimes = times.sort().reverse();
        var previousDateTime = findPreviousDateTime(sortedTimes, noteData.datetime);
        previousElement = Array.from(timesNodes).find((element) => previousDateTime && previousDateTime === element.getAttribute("data-datetime") ? element : null);
      }

      if (previousElement) {
        previousElement.insertAdjacentHTML('beforebegin', li);
      }
      else {
        notifications.insertAdjacentHTML('beforeend', li);
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


  } //DO.U
}; //DO

if (document.readyState === "loading") {
  document.addEventListener('DOMContentLoaded', () => { DO.C.init(); });
}
else {
  window.addEventListener("load", () => { DO.C.init(); });
}

}

window.DO = DO;
export default DO
