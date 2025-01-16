'use strict';

import { getDocument, createActivityHTML, createHTML } from './doc.js';
import { Icon } from './template.js'
import { getAbsoluteIRI, getPathURL, getProxyableIRI } from './uri.js';
import { getMatchFromData, getLinkRelation, serializeDataToPreferredContentType, getGraphLicense, getGraphTypes } from './graph.js';
import { getAcceptPostPreference, postResource } from './fetcher.js';
import Config from './config.js';

const ns = Config.ns;

function sendNotifications(tos, note, iri, shareResource) {
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
      notificationData['to'] = to;

      var toInput = shareResource.querySelector('[value="' + to + '"]') ||
        shareResource.querySelector('#share-resource-to');

      toInput.parentNode.insertAdjacentHTML('beforeend',
        '<span class="progress" data-to="' + to +
        '">' + Icon[".fas.fa-circle-notch.fa-spin.fa-fw"] + '</span>');

      inboxResponse(to, toInput)

        .then(inboxURL => {
          notificationData['inbox'] = inboxURL;

          notifyInbox(notificationData)
            .then(response => {
              var location = response.headers.get('Location');

              if (location) {
                location = getAbsoluteIRI(inboxURL, location);

                toInput
                  .parentNode
                  .querySelector('.progress[data-to="' + to + '"]')
                  .innerHTML = '<a target="_blank" href="' +
                  location + '">' + Icon[".fas.fa-check-circle.fa-fw"] + '</a>';
              }
            })
            .catch(error => {
              // console.log('Error in notifyInbox:', error)
              toInput
                .parentNode
                .querySelector('.progress[data-to="' + to + '"]')
                .innerHTML = Icon[".fas.fa-times-circle.fa-fw"] + ' Unable to notify. Try later.';
            });
        });
    });
  });
}

function inboxResponse(to, toInput) {
  return getLinkRelation(ns.ldp.inbox.value, to)
    .then(inboxes => {
      console.log(inboxes)
      return inboxes[0]
    })

    .catch(error => {
      // console.log('Error in inboxResponse:', error)

      toInput
        .parentNode
        .querySelector('.progress[data-to="' + to + '"]')
        .innerHTML = Icon[".fas.fa-times-circle.fa-fw"] + ' Inbox not responding. Try later.';
    });
}

function notifyInbox(o) {
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

  var options = {
    'contentType': 'text/html',
    'profile': 'https://www.w3.org/ns/activitystreams'
  };
  return postActivity(inboxURL, slug, data, options);
}

function postActivity(url, slug, data, options) {
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

export {
  sendNotifications,
  inboxResponse,
  notifyInbox,
  postActivity
};
