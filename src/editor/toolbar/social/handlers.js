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

import { getSelectedParentElement, restoreSelection, createNoteData} from "../../utils/annotation.js";
import { generateAttributeId, getDateTimeISO } from "../../../util.js"
import { getNodeLanguage, getFormValues, createHTML } from "../../../utils/html.js";
import { getReferenceLabel, createActivityHTML, createNoteDataHTML, getRegisteredAnnotationContainer, getPreferredTargetIRI, showActionMessage, addMessageToLog } from "../../../doc.js";
import { isNanopubIRI } from "../../../nanopub.js";
import { i18n } from "../../../i18n.js";
import { getAbsoluteIRI, stripFragmentFromString } from "../../../uri.js"
import Config from "../../../config.js"
import { notifyInbox, postActivity, showActivities, chooseAnnotationStore, registerAnnotationInTypeIndex, markAnnotationTarget, registerAnnotationStore, linkOutbox } from "../../../activity.js"
import { updateAnnotationServiceForm } from "../toolbar.js";
import { publishAnnotation } from "../../../nanopub-annotation.js";
import { shareResource } from "../../../dialog.js";
import { domSanitize } from "../../../utils/sanitization.js";
import { formatHTMLString } from "../../../utils/normalization.js";
import { encryptContent } from "../../../crypto.js";
import { isUnlocked, getSessionPublicKey, getSessionKid } from "../../../keystore.js";
import { setPublicRead } from "../../../wac.js";

const ns = Config.ns;

//select text
//open popup
//click toolbar button
//populate form
//fill out form
//submit form

//validate form
//post to external location(s)
//copy to storage
//mark the highlight text
//add the note as an aside
//update message log
//do other things...

// TODO: refactor to generalize listeners on form
// addListeners([type, callback]) {
// [listeners] => addlistener(type, callback)}
// callback { updateUI, sendfetch}

//actions = ['approve', 'disapprove', 'specificity', 'bookmark', 'comment', 'note']

//actions = ['approve', 'disapprove', 'specificity'] //Review
//actions = ['selector', 'approve', 'disapprove', 'specificity', 'bookmark', 'comment'] //Social
//actions = ['note'] //Author

export function shareButtonHandler(e) {
  const selector = this.getTextQuoteSelector();
  const baseURL = stripFragmentFromString(window.location.href);
  const uri = getAnnotationSelectorStateURI(baseURL, selector);

  shareResource(e, uri);
}

export function formHandlerAnnotate(e, action) {
  e.preventDefault();
  e.stopPropagation();

  restoreSelection(this.selection);
  const selection = window.getSelection();

  const range = selection.getRangeAt(0);
  const selectedParentElement = getSelectedParentElement(range);

  const formValues = getFormValues(e.target);

  //TODO: Mark the selection after successful comment. Move out.
  //TODO: Use node.textBetween to determine prefix, exact, suffix + parentnode with closest id
  //Mark the selected content in the document
  const selector = this.getTextQuoteSelector();

  const selectionData = {
    selection,
    selector,
    selectedParentElement,
    selectedContent: this.getSelectionAsHTML()
  };

  const annotationNotifyInboxes = [].concat(formValues[`${action}-annotation-inbox`] || []);
  const annotationLocationAnnotationStore = formValues[`${action}-annotation-location-annotation-store`];
  const annotationLocationPersonalStorage = formValues[`${action}-annotation-location-personal-storage`];
  const annotationLocationActivityOutbox = formValues[`${action}-annotation-location-activity-outbox`];
  const annotationLocationService = formValues[`${action}-annotation-location-annotation-service`];
  const annotationLocationNanopubNetwork = formValues[`${action}-annotation-location-nanopub-network`];

  updateUserUI({ annotationNotifyInboxes, annotationLocationAnnotationStore, annotationLocationPersonalStorage, annotationLocationActivityOutbox, annotationLocationService, annotationLocationNanopubNetwork })

  processAction(action, formValues, selectionData);

  this.cleanupToolbar();
}


function updateUserUI(fields) {
  Object.entries(fields).forEach(([key, value]) => {
    Config.User.UI[key] = { checked: Array.isArray(value) ? value : Boolean(value) };
  });
}


async function publishAnnotationToNanopubNetwork(data, action) {
  try {
    const { uri, registryURI } = await publishAnnotation(createNoteData(data), { action });
    const link = (url) => `<a href="${url}" rel="noopener" target="_blank">${url}</a>`;
    const where = Config.Nanopub?.UseTestRegistry ? `${link(uri)} (${link(registryURI)})` : link(uri);
    const message = { content: `Published to the nanopub network as ${where}`, type: 'success', timer: null };
    addMessageToLog(message, Config.MessageLog);
    showActionMessage(document.body, message);
    await announceNanopub(uri, data);
  }
  catch (e) {
    console.warn('dokieli: could not publish the annotation to the nanopub network', e);
    const message = { content: 'Could not publish to the nanopub network: ' + e.message, type: 'error', timer: null };
    addMessageToLog(message, Config.MessageLog);
    showActionMessage(document.body, message);
  }
}

async function announceNanopub(uri, data) {
  const activity = {
    type: ['as:Create'],
    object: uri,
    objectTypes: ['http://www.nanopub.org/nschema#Nanopublication'],
    inReplyTo: data.targetIRI,
    license: data.formData.license
  };

  const outbox = Config.User.Outbox?.[0];
  if (data.formData['annotation-location-activity-outbox'] && outbox) {
    const html = formatHTMLString(createHTML('', createActivityHTML(activity)));
    await postActivity(outbox, generateAttributeId(), html, { contentType: 'text/html', profile: 'https://www.w3.org/ns/activitystreams' })
      .catch(e => console.warn('dokieli: could not add the nanopub to the outbox', e));
  }

  const inboxes = [].concat(data.formData['annotation-inbox'] || []);
  await Promise.allSettled(inboxes.map(inbox => notifyInbox({ ...activity, type: ['as:Announce'], inbox })));
}

if (typeof document !== 'undefined') {
  document.addEventListener('click', async (e) => {
    const button = e.target.closest?.('.annotation-location-setup button');
    if (!button) return;
    e.preventDefault();

    const action = button.closest('form')?.id?.replace(/^editor-form-/, '');
    const chosen = button.dataset.location === 'activity-outbox' ? await linkOutbox() : await registerAnnotationStore();
    if (chosen) updateAnnotationServiceForm(action);
  });
}

export async function processAction(action, formValues, selectionData) {
  //TODO:

  const data = getFormActionData(action, formValues, selectionData);

  // Sanitize the user-supplied note body at the boundary; generated markup is trusted
  if (data.formData && typeof data.formData.content === 'string') {
    data.formData.content = domSanitize(data.formData.content);
  }

  const { annotationDistribution, ...otherFormData } = data;

  // Not a container, so it is published outside the distribution loop
  if (data.formData['annotation-location-nanopub-network']) {
    publishAnnotationToNanopubNetwork(otherFormData, action);
  }

  let noteHTML, note;

  //XXX: Sort of a placeholder switch but don't really need it now
  switch(action) {
    case 'approve': case 'disapprove': case 'specificity': case 'bookmark': case 'comment':
      for (const annotationData of annotationDistribution) {
        // We want to have one object with the annotation distribution data and remaining data from the form that is the same for all annotations. However, we need to overwrite any default values that we got initially from the form data with the latest calculations from annotation distribution data.
        const annotation = {
          ...otherFormData,
          ...annotationData
        };

        // Ask where to keep annotations before the first post so it lands in the chosen store
        if (annotation.canonical) {
          const containerIRI = await chooseAnnotationStore(annotation['containerIRI'], ns.oa.Annotation.value);
          if (containerIRI !== annotation['containerIRI']) {
            annotation['containerIRI'] = containerIRI;
            annotation['noteURL'] = annotation['noteIRI'] = containerIRI + annotation.id;
          }
        }

        var noteData = createNoteData(annotation);

        // POST with a relative @id so the annotation is addressed by its storage URL; the urn stays as oa:canonical
        noteData.iri = '';

        annotation['motivatedBy'] = noteData['motivatedBy'];

        const encrypted = formValues[`${action}-encrypt`] === 'true' && isUnlocked();
        const publicAccess = formValues[`${action}-access-public`] === 'true' && !encrypted;

        if (encrypted) {
          const pubKey = getSessionPublicKey();
          const kid = getSessionKid();
          const enc = async v => v ? encryptContent(v, [pubKey], kid) : v;

          if (noteData.body) {
            noteData.body = await Promise.all(noteData.body.map(async item => {
              if (item.value && item.purpose !== 'tagging' && item.purpose !== ns.oa.tagging.value) {
                return { ...item, value: await enc(item.value) };
              }
              return item;
            }));
          }

          if (noteData.target?.selector) {
            const sel = noteData.target.selector;
            [sel.exact, sel.prefix, sel.suffix] = await Promise.all([
              enc(sel.exact), enc(sel.prefix), enc(sel.suffix)
            ]);
          }
        }

        if ('profile' in annotation && annotation.profile == 'https://www.w3.org/ns/activitystreams') {
          var notificationData = createActivityData(annotation, { 'relativeObject': true });
          notificationData['statements'] = createNoteDataHTML(noteData);
          note = createActivityHTML(notificationData);
        }
        else {
          note = createNoteDataHTML(noteData);
        }

        noteHTML = formatHTMLString(createHTML('', note));

        // console.log(noteData)
        // console.log(data)
        // console.log(annotation)

        // noteData lets postActivity serialize JSON-LD directly when the server prefers it
        postActivity(annotation['containerIRI'], annotation.id, noteHTML, { ...annotation, annotationObject: noteData })
          .catch(error => {
            // console.log('Error serializing annotation:', error)
            // console.log(error)
            throw error  // re-throw, break out of promise chain
          })

          .then(response => {
            var location = response.headers.get('Location');

            if (location) {
              location = domSanitize(getAbsoluteIRI(annotation['containerIRI'], location));
              annotation['noteIRI'] = annotation['noteURL'] = location;
            }

            // Public read is not inherited from the container on every server
            if (publicAccess) {
              setPublicRead(annotation['noteIRI'], true)
                .catch(e => console.log('Could not make annotation public:', e));
            }

            if (annotation.canonical) {
              registerAnnotationInTypeIndex(annotation['containerIRI'], ns.oa.Annotation.value);

              // Mark from the in-memory selector; the re-fetch path is rate-limited. Idempotent.
              markAnnotationTarget(annotation['noteIRI'], noteData.target?.selector || annotation.selectionData?.selector, { motivatedBy: annotation.motivatedBy, id: annotation.id });
            }

            // console.log(annotation, data.options)

            return positionActivity(annotation, data.options);
          })

          .then(() => {
            if (action != 'bookmark') {
              return sendNotification(annotation, data.options);
            }
          })

          .catch(e => {  // catch-all
            // already logged; continue with the next annotation
          });
      }
      break;

    // case 'selector':
    //   window.history.replaceState({}, null, selectorIRI);
    
    //   var message = 'Copy URL from address bar.';
    //   message = {
    //     'content': message,
    //     'type': 'info',
    //     'timer': 3000
    //   }
    //   addMessageToLog(message, Config.MessageLog);
    //   showActionMessage(document.documentElement, message);
    //   // TODO: Perhaps use something like setCopyToClipboard instead. Use as `encodeURI(selectorIRI)` as input.
    //   break;
  }
}




//TODO: MOVE

export function getFormActionData(action, formValues, selectionData) {
// console.log(selectionData)
// console.log(selectionData.selectedParentElement)

  const data = {
    action: action,
    selectionData: selectionData,
    id: generateAttributeId(),
    datetime: getDateTimeISO(),
    resourceIRI: Config.DocumentURL,
    containerIRI: window.location.href,
    contentType: 'text/html',
    options: {},
    annotationDistribution: [],
    formData: {}, // keep the forms with modified keys in this object

    parentNodeWithId: selectionData.selectedParentElement?.closest('[id]'),

    //Role/Capability for Authors/Editors
    // ref: '',
    // refType: '', //TODO: reference types. UI needs input
    //TODO: replace refId and noteIRI IRIs

    //This class is added if it is only for display purposes e.g., loading an external annotation for view, but do not want to save it later on (as it will be stripped when 'do' is found)
    // doClass: '',

    //TODO: oa:TimeState's datetime should equal to hasSource value. Same for oa:HttpRequestState's rdfs:value
    // <span about="[this:#' + refId + ']" rel="oa:hasState">(timeState: <time typeof="oa:TimeState" datetime="' + datetime +'" datatype="xsd:dateTime"property="oa:sourceDate">' + datetime + '</time>)</span>\n\

    // noteData: {},
    // note: '',
    // rights: '',
    motivatedBy: Config.ActionToMotivation[action] || 'oa:replying'
  };

  //TODO: Revisit for security or other concerns since this stores any field with pattern `{action}-`
  Object.entries(formValues).forEach(([key, value]) => {
    if (key.startsWith(`${action}-`)) {
      data.formData[key.substring(action.length + 1)] = value;
    }
  });

  //FIXME: Doublecheck if this should be data.formData instead of data.type
  //TODO: If the citation-type is separated into their own actions, we don't need this.
  if (data['type'] == 'ref-footnote') {
    data.motivatedBy = 'oa:describing';
  }
  else if (data['type'] == 'ref-reference') {
    data.motivatedBy = 'oa:linking';
  }

  data.refLabel = getReferenceLabel(data.motivatedBy);

  data.refId = 'r-' + data.id;
  data.targetIRI = (data.parentNodeWithId) ? data.resourceIRI + '#' + data.parentNodeWithId.id : data.resourceIRI;

  //Preferred target: cite-as, then latest-version (see https://github.com/dokieli/dokieli/issues/420)
  data.preferredTargetIRI = getPreferredTargetIRI(data.resourceIRI);

  if (data.preferredTargetIRI && data.preferredTargetIRI != data.resourceIRI) {
    data.resourceIRI = data.preferredTargetIRI;
    data.options.targetInPreferredIRI = true;

    //TODO: Apply to any cite-as that dereferences to the annotated page, not only nanopubs
    if (isNanopubIRI(data.preferredTargetIRI)) {
      // The page is the nanopub's HTML representation, so selectors apply after content negotiation
      data.targetIRI = data.preferredTargetIRI;
      data.targetFragment = data.parentNodeWithId?.id;
      data.targetState = { type: 'HttpRequestState', value: 'Accept: text/html' };
    }
    else {
      data.targetIRI = (data.parentNodeWithId) ? data.preferredTargetIRI + '#' + data.parentNodeWithId.id : data.preferredTargetIRI;
    }
  }

  data.targetLanguage = getNodeLanguage(data.parentNodeWithId);
  data.selectionLanguage = getNodeLanguage(data.selectionData.selectedParentElement);
  // console.log(targetLanguage, selectionLanguage)

  //TODO: Revisit this to see whether resourceIRI should be the original or the one that gets updated after latestVersion check.
  data.selectorIRI = getAnnotationSelectorStateURI(data.resourceIRI, data.selectionData.selector);

  data.annotationDistribution = getAnnotationDistribution(action, data);

  return data;
}

//TODO: Generalise this later to handle different selector and states, and parameters ( https://www.w3.org/TR/selectors-states/ )
//Also consider if in extension mode (and current document doesn't have dokieli, https://wicg.github.io/scroll-to-text-fragment/ )
export function getAnnotationSelectorStateURI(baseURL, selector) {
  baseURL = baseURL || window.location.href;
  baseURL = stripFragmentFromString(baseURL);
  selector.type = selector.type || 'TextQuoteSelector';

  switch(selector.type) {
    case 'TextQuoteSelector': default:
      return `${baseURL}#selector(type=${selector.type},prefix=${encodeURIComponent(selector.prefix)},exact=${encodeURIComponent(selector.exact)},suffix=${encodeURIComponent(selector.suffix)})`;
  }
}

export function isDuplicateLocation(annotationDistribution, containerIRI) {
  return Object.keys(annotationDistribution).some(
    item => annotationDistribution[item].containerIRI == containerIRI
  );
}


export function getAnnotationDistribution(action, data) {
  const { id, selectionData, formData } = data;
  let { containerIRI } = data;
  const { selectedParentElement } = selectionData;
  //Inboxes to notify about the annotation, chosen in the form; values are inbox URLs
  const annotationInboxes = [].concat(formData['annotation-inbox'] || []);
  //These are whether the user wants to send a copy of their annotation to a personal storage and/or to an annotation service.
  const annotationLocationAnnotationStore = formData['annotation-location-annotation-store'];
  const annotationLocationPersonalStorage = formData['annotation-location-personal-storage'];
  const annotationLocationOutbox = formData['annotation-location-activity-outbox'];
  const annotationLocationService = formData['annotation-location-annotation-service'];

  //Use if (activityIndex) when all action values are taken into account e.g., `note` in author mode

  var aLS, noteURL, noteIRI, contextProfile, fromContentType, contentType;
  var annotationDistribution = [];

  let activityTypeMatched = false;
  const activityIndex = Config.ActionActivityIndex[action];

  //XXX: Use TypeIndex location as canonical if available, otherwise storage. Note how noteIRI is treated later
  if (annotationLocationAnnotationStore && Config.User.TypeIndex) {
    // Resolve the registered container from private or public TypeIndex for this action.
    const registeredContainer = getRegisteredAnnotationContainer(action);

    if (registeredContainer) {
      activityTypeMatched = true;

      containerIRI = registeredContainer;

      fromContentType = 'text/html';
      // contentType = 'text/html';
      contentType = fromContentType;

      noteURL = noteIRI = containerIRI + id;
      contextProfile = {
        // 'subjectURI': noteIRI,
      };
      aLS = { 'id': id, 'containerIRI': containerIRI, 'noteURL': noteURL, 'noteIRI': noteIRI, 'fromContentType': fromContentType, 'contentType': contentType, 'canonical': true, 'annotationInboxes': annotationInboxes };

      annotationDistribution.push(aLS);
    }
  }

  if (annotationLocationOutbox && Config.User.Outbox) {
    containerIRI = Config.User.Outbox[0];

    fromContentType = 'text/html';
    // contentType = 'application/ld+json';
    contentType = fromContentType;

    noteURL = noteIRI = containerIRI + id;
    contextProfile = {
      '@context': [
        'https://www.w3.org/ns/activitystreams',
        { 'oa': 'http://www.w3.org/ns/oa#', 'schema': 'http://schema.org/' }
      ],
      // 'subjectURI': noteIRI,
      'profile': 'https://www.w3.org/ns/activitystreams'
    };
    aLS = { 'id': id, 'containerIRI': containerIRI, 'noteURL': noteURL, 'noteIRI': noteIRI, 'fromContentType': fromContentType, 'contentType': contentType, 'annotationInboxes': annotationInboxes };
    // Outbox is canonical only when no registered or personal storage copy is selected.
    if (!activityTypeMatched && !annotationLocationPersonalStorage) {
      aLS['canonical'] = true;
    }

    aLS = Object.assign(aLS, contextProfile)

    if (!isDuplicateLocation(annotationDistribution, containerIRI)) {
      annotationDistribution.push(aLS);
    }
  }

  if (annotationLocationPersonalStorage && Config.User.Storage) {
    containerIRI = Config.User.Storage[0];

    fromContentType = 'text/html';
    // contentType = 'text/html';
    contentType = fromContentType;

    noteURL = noteIRI = containerIRI + id;
    contextProfile = {
      // 'subjectURI': noteIRI,
    };
    // The registered (TypeIndex) location, when selected, is the canonical copy.
    aLS = { 'id': id, 'containerIRI': containerIRI, 'noteURL': noteURL, 'noteIRI': noteIRI, 'fromContentType': fromContentType, 'contentType': contentType, 'canonical': !activityTypeMatched, 'annotationInboxes': annotationInboxes };

    if (!isDuplicateLocation(annotationDistribution, containerIRI)) {
      annotationDistribution.push(aLS);
    }
  }

  if (annotationLocationService && typeof Config.AnnotationService !== 'undefined') {
    containerIRI = Config.AnnotationService;
    fromContentType = 'text/html';
    // contentType = 'application/ld+json';
    contentType = fromContentType;

    contextProfile = {
      '@context': [
        'https://www.w3.org/ns/anno.jsonld',
        { 'as': 'https://www.w3.org/ns/activitystreams#', 'schema': 'http://schema.org/' }
      ],
      // 'subjectURI': noteIRI,
      'profile': 'https://www.w3.org/ns/anno.jsonld'
    };

    if (!annotationLocationAnnotationStore && !annotationLocationPersonalStorage && !annotationLocationOutbox && annotationLocationService) {
      noteURL = noteIRI = containerIRI + id;
      aLS = { 'id': id, 'containerIRI': containerIRI, 'noteURL': noteURL, 'noteIRI': noteIRI, 'fromContentType': fromContentType, 'contentType': contentType, 'canonical': true,'annotationInboxes': annotationInboxes };
    }
    else if (annotationLocationAnnotationStore || annotationLocationPersonalStorage || annotationLocationOutbox) {
      noteURL = containerIRI + id;
      aLS = { 'id': id, 'containerIRI': containerIRI, 'noteURL': noteURL, 'noteIRI': noteIRI, 'fromContentType': fromContentType, 'contentType': contentType, 'annotationInboxes': annotationInboxes };
    }
    else {
      noteURL = noteIRI = containerIRI + id;
      aLS = { 'id': id, 'containerIRI': containerIRI, 'noteURL': noteURL, 'noteIRI': noteIRI, 'fromContentType': fromContentType, 'contentType': contentType, 'canonical': true, 'annotationInboxes': annotationInboxes };
    }

    aLS = Object.assign(aLS, contextProfile)

    if (!isDuplicateLocation(annotationDistribution, containerIRI)) {
      annotationDistribution.push(aLS);
    }
  }

  return annotationDistribution;
}


export function createActivityData(annotation, options = {}) {
  const { id, targetIRI, formData, action } = annotation;

  // console.log(annotation, options)
  var noteIRI = (options.relativeObject) ? '#' + id : annotation['noteIRI'];

  var notificationStatements = '    <dl about="' + noteIRI + '">\n\
<dt>Object type</dt><dd><a about="' + noteIRI + '" typeof="oa:Annotation" href="' + ns.oa.Annotation.value + '">Annotation</a></dd>\n\
<dt>Motivation</dt><dd><a href="' + Config.getPrefixURI(annotation.motivatedBy.split(':')[0]) + annotation.motivatedBy.split(':')[1] + '" property="oa:motivation">' + annotation.motivatedBy.split(':')[1] + '</a></dd>\n\
</dl>\n\
';

  var notificationData = {
    "slug": id,
    "license": formData.license,
    "statements": notificationStatements
  };
// console.log(_this.action)

  if (options.announce) {
    notificationData['type'] = ['as:Announce'];
    notificationData['object'] = noteIRI;
    notificationData['inReplyTo'] = targetIRI;
  }
  else {
    switch(action) {
      default: case 'comment': case 'specificity':
        notificationData['type'] = ['as:Create'];
        notificationData['object'] = noteIRI;
        notificationData['inReplyTo'] = targetIRI;
        break;
      case 'approve':
        notificationData['type'] = ['as:Like'];
        notificationData['object'] = targetIRI;
        notificationData['context'] = noteIRI;
        break;
      case 'disapprove':
        notificationData['type'] = ['as:Dislike'];
        notificationData['object'] = targetIRI;
        notificationData['context'] = noteIRI;
        break;
      case 'bookmark':
        notificationData['type'] = ['as:Add'];
        notificationData['object'] = noteIRI;
        notificationData['target'] = annotation['containerIRI'];
        break;
    }
  }

// console.log(notificationData);
  return notificationData;
}



export function positionActivity(annotation, options) {
  if (!annotation['canonical']) {
    return Promise.resolve();
  }

  if ('profile' in annotation && annotation.profile == 'https://www.w3.org/ns/activitystreams') {
    return showActivities(annotation['noteIRI'])
      .catch((error) => {
        console.log('Error showing activities:', error)
        return Promise.resolve()
      })
  }
  else {
// console.log(options)
    return showActivities(annotation[ 'noteIRI' ], options)
      .catch((error) => {
        console.log('Error showing activities:', error)
        return Promise.resolve()
      })
  }
}



// Notifies each inbox the user selected in the form; no-op when none
function sendNotification(annotation, options) {
  if (!annotation['canonical']) {
    return Promise.resolve();
  }

  const inboxes = annotation.annotationInboxes || [];

  return Promise.allSettled(inboxes.map(inboxURL => {
    var notificationData = createActivityData(annotation, { 'announce': true });

    notificationData['inbox'] = inboxURL;

    return notifyInbox(notificationData)
      .then(() => {
        var message = {
          'content': i18n.t('annotation.notify-inbox.success.textContent', { inbox: inboxURL }),
          'type': 'success',
          'timer': 5000
        };
        addMessageToLog(message, Config.MessageLog);
        showActionMessage(document.body, message);
      })
      .catch(error => {
        console.log('Error notifying the inbox:', error)
        var detail = [error?.status, error?.message].filter(Boolean).join(' ');
        var message = {
          'content': i18n.t('annotation.notify-inbox.failed.textContent', { inbox: inboxURL, annotation: annotation.noteIRI, error: detail }),
          'type': 'warning',
          'timer': 15000
        };
        addMessageToLog(message, Config.MessageLog);
        showActionMessage(document.body, message);
      })
  }));
}
