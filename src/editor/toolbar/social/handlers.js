import { schema } from "../../schema/base.js"
import { getTextQuoteHTML, getSelectedParentElement, restoreSelection, getInboxOfClosestNodeWithSelector, createNoteData} from "../../utils/annotation.js";
import { getFormValues, kebabToCamel, generateAttributeId, getDateTimeISO } from "../../../util.js"
import { createActivityHTML, createHTML, createNoteDataHTML, getNodeLanguage, getReferenceLabel } from "../../../doc.js"
import { getAbsoluteIRI, stripFragmentFromString } from "../../../uri.js"
import Config from "../../../config.js"
import { notifyInbox, postActivity } from "../../../inbox.js"

const ns = Config.ns;

//select text
//open popup
//click toolbar button
//populate form
//fill out form
//submit form

//validate form
//post to external location(s)
//copy to localStorage
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
  DO.U.shareResource(e)
}

export function ohYeahButtonHandler(e) {
  ohYeah(e)
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

  const annotationInboxLocation = formValues['annotation-inbox'];
  const annotationLocationPersonalStorage = formValues['annotation-location-personal-storage'];
  const annotationLocationService = formValues['annotation-location-service'];

  updateUserUI({ annotationInboxLocation, annotationLocationPersonalStorage, annotationLocationService }, formValues)

  processAction(action, formValues, selectionData);

  this.cleanupToolbar();
}

export function ohYeah(e, action) {
  e.preventDefault();
  e.stopPropagation();
console.log(this)
  restoreSelection(this.selection);
  const selection = window.getSelection();

  const range = selection.getRangeAt(0);
  const selectedParentElement = getSelectedParentElement(range);

  //XXX: Not currently used
  // const formValues = getFormValues(e.target);

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

  console.log(selectionData)

  //XXX: Not currently used
  // processAction(action, formValues, selectionData);

  this.cleanupToolbar();
}


function updateUserUI(fields, formValues) {
  Object.entries(fields).forEach(([key, value]) => {
    const input = formValues[key];
    Config.User.UI[key] = { checked: false };
  
    if (input) {
      Config.User.UI[key].checked = input.checked;
    }
  });
}


export function processAction(action, formValues, selectionData) {
  //TODO:

  const data = getFormActionData(action, formValues, selectionData);
  const { annotationDistribution, ...otherFormData } = data;

  let noteHTML, note;

  //XXX: Sort of a placeholder switch but don't really need it now
  switch(action) {
    case 'approve': case 'disapprove': case 'specificity': case 'bookmark': case 'comment':
      annotationDistribution.forEach(annotationData => {
        // We want to have one object with the annotation distribution data and remaining data from the form that is the same for all annotations. However, we need to overwrite any default values that we got initially from the form data with the latest calculations from annotation distribution data.
        const annotation = {
          ...otherFormData,
          ...annotationData
        };

        var noteData = createNoteData(annotation);
        annotation['motivatedByIRI'] = noteData['motivatedByIRI'];

        if ('profile' in annotation && annotation.profile == 'https://www.w3.org/ns/activitystreams') {
          var notificationData = createActivityData(annotation, { 'relativeObject': true });
          notificationData['statements'] = createNoteDataHTML(noteData);
          note = createActivityHTML(notificationData);
        }
        else {
          note = createNoteDataHTML(noteData);
        }

        noteHTML = createHTML('', note);

        // console.log(noteData)
        // console.log(data)
        // console.log(annotation)

        postActivity(annotation['containerIRI'], annotation.id, noteHTML, annotation)
          .catch(error => {
            // console.log('Error serializing annotation:', error)
            // console.log(error)
            throw error  // re-throw, break out of promise chain
          })

          .then(response => {
            var location = response.headers.get('Location');

            if (location) {
              location = getAbsoluteIRI(annotation['containerIRI'], location);
              annotation['noteIRI'] = annotation['noteURL'] = location;
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
            // suppress the error, it was already logged to the console above
            // nothing else needs to be done, the loop will proceed
            // to the next annotation
          });
      });
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

  data.latestVersion = DO.C.Resource[data.resourceIRI].graph.out(ns.rel['latest-version']).values[0];

  if (data.latestVersion) {
    data.resourceIRI = data.latestVersion;
    data.targetIRI = (data.parentNodeWithId) ? data.latestVersion + '#' + data.parentNodeWithId.id : data.latestVersion;
    data.options.targetInMemento = true;
  }

  // console.log(latestVersion)
  // console.log(resourceIRI)
  // console.log(targetIRI)

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
  //This annotationInbox is about when the selected text is part of an existing Annotation, it gets that Annotation's own inbox which is used towards announcing the annotation that's about to be created. (This is not related to whether an inbox should be assigned to an annotation that's about to be created.)
  const annotationInbox =  getInboxOfClosestNodeWithSelector(selectedParentElement, '.do[typeof="oa:Annotation"]');
  //These are whether the user wants to send a copy of their annotation to a personal storage and/or to an annotation service.
  const annotationLocationPersonalStorage = formData['annotation-location-personal-storage'];
  const annotationLocationService = formData['annotation-location-service'];

  //Use if (activityIndex) when all action values are taken into account e.g., `note` in author mode

  var aLS, noteURL, noteIRI, contextProfile, fromContentType, contentType;
  var annotationDistribution = [];

  let activityTypeMatched = false;
  const activityIndex = Config.ActionActivityIndex[action];

  //XXX: Use TypeIndex location as canonical if available, otherwise storage. Note how noteIRI is treated later
  if ((annotationLocationPersonalStorage && Config.User.TypeIndex) || (!annotationLocationPersonalStorage && !annotationLocationService && Config.User.TypeIndex)) {
    //TODO: Preferring publicTypeIndex for now. Refactor this when the UI allows user to decide whether to have it public or private.

    var publicTypeIndexes = Config.User.TypeIndex[ns.solid.publicTypeIndex.value];
    var privateTypeIndexes = Config.User.TypeIndex[ns.solid.privateTypeIndex.value];

    if (publicTypeIndexes) {
      var publicTIValues = Object.values(publicTypeIndexes);
      // console.log(publicTIValues)
      publicTIValues.forEach(ti => {
        //XXX: For now, we are only sending the annotation to one location that's already matched
        if (activityTypeMatched) return;

        var forClass = ti[ns.solid.forClass.value];
        var instanceContainer = ti[ns.solid.instanceContainer.value];
        var instance = ti[ns.solid.instance.value];

        if (activityIndex?.includes(forClass)) {
          if (instanceContainer) {
            activityTypeMatched = true;

            containerIRI = instanceContainer;

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
          //TODO: Not handling `instance` yet.
        }
      })

    }
    else if (privateTypeIndexes) {

    }
  }

  if ((annotationLocationPersonalStorage && Config.User.Outbox) || (!annotationLocationPersonalStorage && !annotationLocationService && Config.User.Outbox)) {
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
    aLS = { 'id': id, 'containerIRI': containerIRI, 'noteURL': noteURL, 'noteIRI': noteIRI, 'fromContentType': fromContentType, 'contentType': contentType, 'annotationInbox': annotationInbox };
    if (typeof Config.User.Storage === 'undefined' && !activityTypeMatched) {
      aLS['canonical'] = true;
    }

    aLS = Object.assign(aLS, contextProfile)

    if (!isDuplicateLocation(annotationDistribution, containerIRI)) {
      annotationDistribution.push(aLS);
    }
  }

  if (!activityTypeMatched && ((annotationLocationPersonalStorage && Config.User.Storage) || (!annotationLocationPersonalStorage && !annotationLocationService && Config.User.Storage))) {
    containerIRI = Config.User.Storage[0];

    fromContentType = 'text/html';
    // contentType = 'text/html';
    contentType = fromContentType;

    noteURL = noteIRI = containerIRI + id;
    contextProfile = {
      // 'subjectURI': noteIRI,
    };
    aLS = { 'id': id, 'containerIRI': containerIRI, 'noteURL': noteURL, 'noteIRI': noteIRI, 'fromContentType': fromContentType, 'contentType': contentType, 'canonical': true, 'annotationInbox': annotationInbox };

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
        'http://www.w3.org/ns/anno.jsonld',
        { 'as': 'https://www.w3.org/ns/activitystreams#', 'schema': 'http://schema.org/' }
      ],
      // 'subjectURI': noteIRI,
      'profile': 'http://www.w3.org/ns/anno.jsonld'
    };

    if (!annotationLocationPersonalStorage && annotationLocationService) {
      noteURL = noteIRI = containerIRI + id;
      aLS = { 'id': id, 'containerIRI': containerIRI, 'noteURL': noteURL, 'noteIRI': noteIRI, 'fromContentType': fromContentType, 'contentType': contentType, 'canonical': true,'annotationInbox': annotationInbox };
    }
    else if (annotationLocationPersonalStorage) {
      noteURL = containerIRI + id;
      aLS = { 'id': id, 'containerIRI': containerIRI, 'noteURL': noteURL, 'noteIRI': noteIRI, 'fromContentType': fromContentType, 'contentType': contentType, 'annotationInbox': annotationInbox };
    }
    else {
      noteURL = noteIRI = containerIRI + id;
      aLS = { 'id': id, 'containerIRI': containerIRI, 'noteURL': noteURL, 'noteIRI': noteIRI, 'fromContentType': fromContentType, 'contentType': contentType, 'canonical': true, 'annotationInbox': annotationInbox };
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
<dt>Motivation</dt><dd><a href="' + DO.C.Prefixes[annotation.motivatedByIRI.split(':')[0]] + annotation.motivatedByIRI.split(':')[1] + '" property="oa:motivation">' + annotation.motivatedByIRI.split(':')[1] + '</a></dd>\n\
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
    return DO.U.showActivities(annotation['noteIRI'])
      .catch((error) => {
        console.log('Error showing activities:', error)
        return Promise.resolve()
      })
  }
  else {
// console.log(options)
    return DO.U.showActivities(annotation[ 'noteIRI' ], options)
      .catch((error) => {
        console.log('Error showing activities:', error)
        return Promise.resolve()
      })
  }
}



function sendNotification(annotation, options) {
  const documentURL = Config.DocumentURL;

  if (!annotation['canonical']) {
    return Promise.resolve();
  }

  var inboxPromise;

  if (annotation.annotationInbox) {
    inboxPromise = Promise.resolve([annotation.annotationInbox])
  }
  else {
    if ('inbox' in DO.C.Resource[documentURL] && DO.C.Resource[documentURL].inbox.length) {
      inboxPromise = Promise.resolve(DO.C.Resource[documentURL].inbox)
    }
    else {
      inboxPromise =
        getLinkRelation(ns.ldp.inbox.value, documentURL)
          .catch(() => {
            return getLinkRelationFromRDF(ns.as.inbox.value, documentURL);
          });
    }
  }

  return inboxPromise
    .catch(error => {
      // console.log('Error fetching ldp:inbox and as:inbox endpoint:', error)
      throw error
    })
    .then(inboxes => {
      // TODO: resourceIRI for getLinkRelation should be the
      // closest IRI (not necessarily the document).
// console.log(inboxes)
      if (inboxes.length) {
        var notificationData = createActivityData(annotation, { 'announce': true });

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
