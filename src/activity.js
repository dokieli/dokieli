/*!
Copyright 2012-2026 Sarven Capadisli <https://csarven.ca/>
Copyright 2023-2026 Virginia Balseiro <https://virginiabalseiro.com/>

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import rdf from 'rdf-ext';
import { createActivityHTML, showCitations, getReferenceLabel, createNoteDataHTML } from './doc.js';
import { createHTML } from './utils/html.js';
import { Icon } from './ui/icons.js'
import { getButtonHTML } from './ui/buttons.js'
import { getAbsoluteIRI, getPathURL, isHttpOrHttpsProtocol, stripFragmentFromString, currentLocation } from './uri.js';
import { getLinkRelation, serializeDataToPreferredContentType, getGraphLanguage, getGraphLicense, getGraphRights, getGraphTypes, getGraphDate, getGraphImage, getResourceGraph, getResourceOnlyRDF, getAgentTypeIndex, getUserContacts, getAgentName, getSubjectInfo, getItemsList } from './graph.js';
import { getAcceptPostPreference, postResource } from './fetcher.js';
import Config from './config.js';
import { domSanitize, sanitizeInsertAdjacentHTML } from './utils/sanitization.js';
import { generateUUID, uniqueArray } from './util.js';
import { fragmentFromString, getDocumentContentNode } from "./utils/html.js";
import { i18n } from './i18n.js';
import { showUserIdentityInput } from './auth.js';

const ns = Config?.ns;

export function initializeNotifications(options = {}) {
  // var contextNode = selectArticleNode(document);
  // <p class="count"><data about="" datatype="xsd:nonNegativeInteger" property="sioc:num_replies" value="' + interactionsCount + '">' + interactionsCount + '</data> interactions</p>
  //<progress min="0" max="100" value="0"></progress>
  //<div class="actions"><a href="/docs#resource-activities" rel="noopener" target="_blank">${Icon[".fas.fa-circle-info"]}</a></div>

  var buttonToggle = getButtonHTML({ key: 'panel.notifications.toggle.button', button: 'toggle', buttonClass: 'toggle' })

  //TEMP buttonRel/Resource
  var aside = `
  <aside aria-labelledby="document-notifications-label" class="do" contenteditable="false" dir="${Config.User.UI.LanguageDir}" id="document-notifications" lang="${Config.User.UI.Language}" rel="schema:hasPart" resource="#document-notifications" xml:lang="${Config.User.UI.Language}">
    <h2 data-i18n="panel.notifications.h2" id="document-notifications-label" property="schema:name">${i18n.t('panel.notifications.h2.textContent')} ${Config.Button.Info.Notifications}</h2>
    ${buttonToggle}
    <div>
      <div class="info"></div>
      <ul class="activities"></ul>
    </div>
  </aside>`;
  sanitizeInsertAdjacentHTML(document.body, 'beforeend', aside);
  aside = document.getElementById('document-notifications');

  if (options.includeButtonMore) {
    initializeButtonMore(aside);
  }

  return aside;
}

export function initializeButtonMore(node) {
  var info = node.querySelector('div.info');
  var progressOld = info.querySelector('.progress');
  var progressNew = fragmentFromString(`<div class="progress" data-i18n="panel.notifications.progress.more">${Config.Button.Notifications.More} ${i18n.t('panel.notifications.progress.more.textContent')}</div>`);

  if (progressOld) {
    info.replaceChild(progressNew, progressOld)
  }
  else {
    info.appendChild(progressNew);
  }

  node = document.getElementById('document-notifications');

  var buttonMore = node.querySelector('div.info button.more');
  buttonMore.addEventListener('click', () => {
    if (!Config.User.IRI) {
      showUserIdentityInput();
    }
    else {
      showContactsActivities();
    }
  });
}

export function addNoteToNotifications(noteData) {
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
    aside = initializeNotifications({includeButtonMore: true});
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
    sanitizeInsertAdjacentHTML(previousElement, 'beforebegin', li);
  }
  else {
    sanitizeInsertAdjacentHTML(notifications, 'beforeend', li);
  }
}

export function sendNotifications(tos, note, iri, shareResource) {
  return new Promise((resolve, reject) => {
    var notificationData = {
      'type': ['as:Announce'],
      'object': iri,
      'summary': note,
      'license': 'https://creativecommons.org/licenses/by/4.0/'
    };

    var rootIRI = Config.Resource[iri] || Config.Resource[getPathURL(iri)];

    if (rootIRI) {
      if (Config.Resource[iri].rdftype.length) {
        notificationData['objectTypes'] = Config.Resource[iri].rdftype;
      }
      if (Config.Resource[iri].license) {
        notificationData['objectLicense'] = Config.Resource[iri].license;
      }
    }
    else {
      var g = Config.Resource[iri].graph.node(rdf.namedNode(iri));
      var types = getGraphTypes(g);
      if (types.length) {
        notificationData['objectTypes'] = types;
      }
      var license = getGraphLicense(g);
      if (license) {
        notificationData['objectLicense'] = license;
      }
    }

    tos.forEach(to => {
      to = domSanitize(to);

      if (!isHttpOrHttpsProtocol(to)) return;

      notificationData['to'] = to;

      var toInput = shareResource.querySelector('[value="' + to + '"]') ||
        shareResource.querySelector('#share-resource-to');

      sanitizeInsertAdjacentHTML(toInput.parentNode, 'beforeend',
        '<span class="progress" data-to="' + to +
        '">' + Icon[".fas.fa-circle-notch.fa-spin.fa-fw"] + '</span>');

      inboxResponse(to, toInput)
        .then(inboxURL => {
          notificationData['inbox'] = inboxURL;

          notifyInbox(notificationData)
            .then(response => {
              var location = response.headers.get('Location');

              if (location) {
                location = domSanitize(getAbsoluteIRI(inboxURL, location));

                toInput
                  .parentNode
                  .querySelector('.progress[data-to="' + to + '"]')
                  .setHTMLUnsafe(domSanitize('<a href="' + location + '" rel="noopener" target="_blank">' + Icon[".fas.fa-check-circle.fa-fw"] + '</a>'));
              }
            })
            .catch(error => {
              // console.log('Error in notifyInbox:', error)
              toInput
                .parentNode
                .querySelector('.progress[data-to="' + to + '"]')
                .setHTMLUnsafe(domSanitize(Icon[".fas.fa-times-circle.fa-fw"] + ' Unable to notify. Try later.'));
            });
        });
    });
  });
}

export function inboxResponse(to, toInput) {
  return getLinkRelation(ns.ldp.inbox.value, to)
    .then(inboxes => {
      return inboxes[0]
    })

    .catch(error => {
      // console.log('Error in inboxResponse:', error)

      toInput
        .parentNode
        .querySelector('.progress[data-to="' + to + '"]')
        .setHTMLUnsafe(domSanitize(Icon[".fas.fa-times-circle.fa-fw"] + ' Inbox not responding. Try later.'))
    });
}

export function notifyInbox(o) {
  var slug, inboxURL;

  if ('slug' in o) {
    slug = o.slug;
  }
  if ('inbox' in o) {
    inboxURL = o.inbox;
  }

  if (!inboxURL) {
    return Promise.reject(new Error('No inbox to send notification to'));
  }

  //TODO title
  var title = '';
  var data = createActivityHTML(o);

  data = createHTML(title, data, { 'prefixes': Config.Prefixes });

  data = domSanitize(data);

  var options = {
    'contentType': 'text/html',
    'profile': 'https://www.w3.org/ns/activitystreams'
  };

  return postActivity(inboxURL, slug, data, options);
}
export function postActivity(url, slug, data, options) {
  return getAcceptPostPreference(url)
    .then(preferredContentType => {
      options = options || {};
      options['preferredContentType'] = preferredContentType;

      return serializeDataToPreferredContentType(data, options)
        .then(serializedData => {
          var profile = ('profile' in options) ? '; profile="' + options.profile + '"' : '';
          var contentType = options['preferredContentType'] + profile + '; charset=utf-8';

          return postResource(url, slug, serializedData, contentType);
        });
    });
}

export function getNotifications(url) {
  url = url || currentLocation();
  var notifications = [];

  Config.Inbox[url] = {};
  Config.Inbox[url]['Notifications'] = [];

  return getResourceGraph(url)
    .then(g => {
      Config.Inbox[url]['Graph'] = g;

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
        Config.Inbox[url]['Notifications'] = notifications;
        return notifications;
      }
      else {
        var reason = {"message": "There are no notifications."};
        return Promise.reject(reason);
      }
    });
}

export function showInboxNotifications(url, data) {
  //TODO: Consider checking multiple getLinkRelation, [ns.ldp.inbox.value, ns.as.inbox.value]
  getLinkRelation(ns.ldp.inbox.value, url, data)
    .then(i => {
      i.forEach(inboxURL => {
        if (!Config.Inbox[inboxURL]) {
          showNotificationSources(inboxURL);
        }
      });
    });
}

export function showNotificationSources(url) {
  getNotifications(url).then(
    function(notifications) {
      notifications.forEach(notification => {
        showActivities(notification, { notification: true });
       });
    },
    function(reason) {
      console.log('No notifications');
      return reason;
    }
  );
}

export async function showActivitiesSources(url, options = {}) {
  return getItemsList(url)
    .then(items => {
      var promises = [];

      for (var i = 0; i < items.length && i < Config.CollectionItemsLimit; i++) {
        var pI = function(iri) {
          return showActivities(iri, options);
        }

        promises.push(pI(items[i]));
      }
      // console.log(promises)
      return Promise.allSettled(promises);
    })
    .catch((error) => {
      console.log(error)
      console.log(url + ' has no activities.');
      // return error;
    });
}

// export function getActivities(url, options) {
//   url = url || currentLocation();
//   url = stripFragmentFromString(url);

//   switch (options['activityType']) {
//     default:
//     case 'instanceContainer':
//       // console.log(getItemsList(url))
//       return getItemsList(url);
//     case 'instance':
//       return showActivities(url);
//   }
// }

export function showActivities(url, options = {}) {
  if (Config.Activity[url] || Config.Notification[url]) {
    return Promise.reject([]);
  }

  var documentURL = Config.DocumentURL;

  var documentTypes = Config.ActivitiesObjectTypes.concat(Object.keys(Config.ResourceType));

  return getResourceOnlyRDF(url)
    //TODO: Needs throws handled from functions calling showActivities
    // .catch(e => {
    //   // return [];
    //   throw e;
    // })
    .then(g => {
      // console.log(g)
      if (!g || g.resource) return;

      if (options.notification) {
        Config.Notification[url] = {};
        Config.Notification[url]['Activities'] = [];
        Config.Notification[url]['Graph'] = g;
      }
      else {
        Config.Activity[url] = {};
        Config.Activity[url]['Graph'] = g;
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
                return showActivities(context[0])
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

                addNoteToNotifications(noteData);
              }
            }
          }
          else if (resourceTypes.includes(ns.as.Relationship.value)) {
            if (s.out(ns.as.subject).values.length && as.out(as.relationship).values.length && s.out(ns.as.object).values.length && getPathURL(s.out(ns.as.object).values[0]) == currentPathURL) {
              var subject = s.out(ns.as.subject).values[0];
              subjectsReferences.push(subject);
              return showActivities(subject)
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
              else if (Config.Resource[documentURL].graph.out(ns.rel['latest-version']).values.length && targetPathURL == getPathURL(Config.Resource[documentURL].graph.out(ns.rel['latest-version']).values[0])) {
                o['targetInMemento'] = true;
              }
              else if (Config.Resource[documentURL].graph.out(ns.owl.sameAs).values.length && Config.Resource[documentURL].graph.out(ns.owl.sameAs).values[0] == targetPathURL) {
                o['targetInSameAs'] = true;
              }

              if (o['targetInOriginalResource'] || o['targetInMemento'] || o['targetInSameAs']) {
                subjectsReferences.push(object);

                if (options.notification) {
                  Config.Notification[url]['Activities'].push(object);
                }

                if (object.startsWith(url)) {
                  return showAnnotation(object, s, o);
                }
                else {
                  s = s.node(rdf.namedNode(object));
                  var citation = {};

                  // if (target.startsWith(currentPathURL)) {
                    Object.keys(Config.Citation).forEach(citationCharacterization => {
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
                    return showCitations(citation, s);
                  }
                  else {
                    return showActivities(object, o)
                      .then(iri => iri)
                      .catch(e => {
                        // console.log(object + ': object is unreachable', e)
                      });
                  }
                }
              }
            }
          }
          // else if (resourceTypes.indexOf('http://purl.org/spar/cito/Citation')) {
            //TODO:
            // var iri = s.iri().toString();
            // return showCitations(iri, s)
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
                  return showAnnotation(object, s);
                }
                else {
                  return showActivities(object)
                    .then(iri => iri)
                    .catch(e => console.log(object + ': object is unreachable', e));
                }
              }
            }
          }
          else if (resourceTypes.includes(ns.oa.Annotation.value) && getPathURL(s.out(ns.oa.hasTarget).values[0]) == currentPathURL && !subjectsReferences.includes(i)) {
            return showAnnotation(i, s);
          }
          else if (!subjectsReferences.includes(i) && documentTypes.some(item => resourceTypes.includes(item)) && s.out(ns.as.inReplyTo).values.length && s.out(ns.as.inReplyTo).values[0] && getPathURL(s.out(ns.as.inReplyTo).values[0]) == currentPathURL) {
              subjectsReferences.push(i);
            return showAnnotation(i, s);
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
            Object.keys(Config.Actor.Property).some(key => {
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

            addNoteToNotifications(noteData);
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
}

export function showContactsActivities() {
  var aside = document.querySelector('#document-notifications');

  var showProgress = function() {
    var info = aside.querySelector('div.info');
    var progressOld = info.querySelector('.progress');
    var progressNew = fragmentFromString(`<div class="progress" data-i18n="panel.notifications.progress.checking">${Icon[".fas.fa-circle-notch.fa-spin.fa-fw"].replace(' fa-fw', '')} ${i18n.t('panel.notifications.progress.checking.textContent')}</div>`);

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
    initializeButtonMore(aside);
  }

  var promises = [];
  promises.push(...processAgentActivities(Config.User));

  showProgress();

  var processContacts = async (contacts) => {
    if (contacts.length) {
      var contactsPromises = contacts.map((url) =>
        getSubjectInfo(url, { 'fetchIndexes': true }).then((subject) => {
          if (subject.Graph) {
            Config.User['Contacts'] = Config.User['Contacts'] || {};
            Config.User.Contacts[url] = subject;
            return processAgentActivities(subject); 
          }
          return [];
        })
      );

      const allContactPromises = await Promise.allSettled(contactsPromises);
      promises.push(...allContactPromises.flat());
    }
    return Promise.resolve();
  };

  var processExistingContacts = (contacts) => {
    var contactsPromises = Object.keys(contacts).map((iri) => {
      var contact = Config.User.Contacts[iri];
      if (contact.IRI) {
        return processAgentActivities(contact);
      }
      return [];
    });

    return Promise.allSettled(contactsPromises).then((allContactPromises) => {
      promises.push(...allContactPromises.flat());
    });
  };

  function getContactsAndActivities() {
    if (Config.User.Contacts && Object.keys(Config.User.Contacts).length) {
      return processExistingContacts(Config.User.Contacts);
    } else if (Config.User.IRI) {
      return getUserContacts(Config.User.IRI).then(processContacts);
    }
    return Promise.resolve();
  }

  getContactsAndActivities()
    .then(() => Promise.allSettled(promises))
    .then(() => removeProgress())
    .catch(() => removeProgress());
}

export function processAgentActivities(agent) {
  // console.log(agent.IRI, agent.TypeIndex, agent.PublicTypeIndex, agent.PrivateTypeIndex)
  if (agent.TypeIndex && Object.keys(agent.TypeIndex).length) {
    return processAgentTypeIndex(agent);
  }
  else if (agent.Graph && (agent.PublicTypeIndex?.length || agent.PrivateTypeIndex?.length)) {
    return getAgentTypeIndex(agent.Graph)
      .then(typeIndexes => {
        Object.keys(typeIndexes).forEach(typeIndexType => {
          agent.TypeIndex[typeIndexType] = typeIndexes[typeIndexType];
        });

        return processAgentActivities(agent);
      });
  }

  return [Promise.resolve()];

  //TODO: Need proper filtering of storage/outbox matching an object of interest
  // else {
  //   return processAgentStorageOutbox(agent)
  // }
}

export function processAgentTypeIndex(agent) {
  var promises = [];
  var documentTypes = Config.ActivitiesObjectTypes.concat(Object.keys(Config.ResourceType));

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
        promises.push(showActivities(instance, { excludeMarkup: true, agent: agent.IRI }));
      }

      if (instanceContainer) {
        promises.push(showActivitiesSources(instanceContainer, { activityType: 'instanceContainer', agent: agent.IRI }));
      }
    }
  });

  //       TODO: Need proper filtering of storage/outbox matching an object of interest
  //       if (recognisedTypes.length == 0) {
  // console.log(agent, recognisedTypes);
  //         promises.push(processAgentStorageOutbox(agent));
  //       }

  // console.log(promises)
  return promises;
}

export function processAgentStorageOutbox(agent) {
  var promises = [];

  if (agent.Storage && agent.Storage.length) {
    if (agent.Outbox && agent.Outbox.length) {
      if (agent.Storage[0] === agent.Outbox[0]) {
        promises.push(showActivitiesSources(agent.Outbox[0]));
      }
      else {
        promises.push(showActivitiesSources(agent.Storage[0]));
        promises.push(showActivitiesSources(agent.Outbox[0]));
      }
    }
    else {
      promises.push(showActivitiesSources(agent.Storage[0]))
    }
  }
  else if (agent.Outbox && agent.Outbox.length) {
    promises.push(showActivitiesSources(agent.Outbox[0]));
  }

  return promises;
}

//XXX: To be deprecated
export async function positionInteraction(noteIRI, containerNode, options) {
  containerNode = containerNode || getDocumentContentNode(document);

  if (Config.Activity[noteIRI]) {
    return Promise.reject();
  }

  Config.Activity[noteIRI] = {};

  const g = await getResourceGraph(noteIRI);
  //XXX: REVISIT
  if (!g || g.resource) return;
  showAnnotation(noteIRI, g, containerNode, options);
}

export function showAnnotation(noteIRI, g, options) {
  // containerNode = containerNode || getDocumentContentNode(document);
  var containerNode = getDocumentContentNode(document);
  options = options || {};

  var documentURL = Config.DocumentURL;

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
    // console.log('Config.Inbox:')
    // console.log(Config.Inbox)
    // console.log('Config.Notification:')
    // console.log(Config.Notification)
    // console.log('Config.Activity:')
    // console.log(Config.Activity)
    if (Config.Inbox[inboxIRI]) {
      Config.Inbox[inboxIRI]['Notifications'].forEach(notification => {
        // console.log(notification)
        if (Config.Notification[notification]) {
          if (Config.Notification[notification]['Activities']) {
            Config.Notification[notification]['Activities'].forEach(activity => {
              // console.log('   ' + activity)
              if (!document.querySelector('[about="' + activity + '"]') && Config.Activity[activity] && Config.Activity[activity]['Graph']) {
                showAnnotation(activity, Config.Activity[activity]['Graph']);
              }
            })
          }
        }
        else {
          showActivities(notification, { notification: true });
        }
      });
    }
    else {
      showNotificationSources(inboxIRI);
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

    // console.log(containerNodeTextContent);
    // console.log(prefix + exact + suffix);
    var selectorIndex = containerNodeTextContent.indexOf(prefix + exact + suffix);
    // console.log(selectorIndex);
    if (selectorIndex >= 0) {
      selector =  {
        "prefix": prefix,
        "exact": exact,
        "suffix": suffix
      };

      var selectedParentNode = Config.Editor.importTextQuoteSelector(containerNode, selector, refId, motivatedBy, docRefType, { 'do': true });

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

      addNoteToNotifications(noteData);

      // var asideNode = fragmentFromString(asideNote);
      // var parentSection = getClosestSectionNode(selectedParentNode);
      // parentSection.appendChild(asideNode);
      // XXX: Keeping this comment around for emergency
      // selectedParentNode.parentNode.insertBefore(asideNode, selectedParentNode.nextSibling);

      if(Config.User.IRI) {
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
      addNoteToNotifications(noteData);
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
      addNoteToNotifications(noteData);
    }
    else {
      console.log(noteIRI + ' is not an oa:Annotation, as:inReplyTo, sioc:reply_of');
    }
  }
}
