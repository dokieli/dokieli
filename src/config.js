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
import DO from './dokieli.js';

export default {
  init: function(url) {
    DO.U.initServiceWorker();

    var contentNode = DO.U?.getContentNode(document);
    if (contentNode) {
      DO.U.initButtons();
      DO.U.setDocumentURL(url);
      DO.U.setWebExtensionURL();
      DO.U.setDocumentString();
      DO.U.initUser();
      DO.U.setDocumentMode();
      DO.U.initLocalStorage();
      DO.U.highlightItems();
      DO.U.showAsTabs();
      DO.U.initDocumentActions();
      DO.U.initDocumentMenu();
      DO.U.setDocRefType();
      DO.U.initCurrentStylesheet();
      DO.U.showFragment();
      DO.U.initCopyToClipboard();
      DO.U.initSlideshow();
      DO.U.initEditor();
      DO.U.initMath();
      DO.U.monitorNetworkStatus();
    }
  },
  OIDC: {},
  DocumentAction: '',
  Button: {},
  DocumentURL: '',
  DocumentString: '',
  Resource: {},
  Inbox: {},
  Notification: {},
  Subscription: {},
  Activity: {},
  Lang: document.documentElement.lang,
  DocRefType: '',
  RefType: {
    LNCS: { InlineOpen: '[', InlineClose: ']' },
    ACM: { InlineOpen: '[', InlineClose: ']' }
  },
  VerifyCitation: true,
  Stylesheets: [],
  User: {
    IRI: null,
    Role: null,
    UI: {},
    WebIdDelegate: null
  },
  ContributorRoles: ['author', 'editor'],
  LocalDocument: (document.location.protocol == 'file:'),
  UseLocalStorage: false,
  HttpTimeout: 5000,
  AutoSave: {
    Methods: ['localStorage', 'http'],
    Timer: 3000,
    Items: {}
  },
  RequestCheck: {
    Timer: 60000
  },
  ActionMessage: {
    Timer: 5000
  },
  MessageLog: [],
  AvatarSize: 48,

  CDATAStart: '//<![CDATA[',
  CDATAEnd: '//]]>',
  SortableList: false,
  GraphViewerAvailable: true,
  MathAvailable: (typeof MathJax !== 'undefined'),
  EditorEnabled: false,
  EditorWasEnabled: false,
  ContentEditable: false,
  WebExtensionEnabled: ((window.chrome && chrome.runtime && chrome.runtime.id) || (typeof browser !== 'undefined' && browser.runtime && browser.runtime.id)),
  WebExtension: (typeof browser !== 'undefined') ? browser : window.chrome,
  Editor: {
    headings: ["h1", "h2", "h3", "h4", "h5", "h6"],
    regexEmptyHTMLTags: /<[^\/>][^>]*><\/[^>]+>/gim,
    mode: 'social'
  },

  DOMProcessing: {
    'rdfaAttributes': ['about', 'content', 'datatype', 'href', 'inlist', 'prefix', 'property', 'rel', 'resource', 'rev', 'src', 'typeof', 'vocab'],
    'inlineElements': ['span', 'progress', 'del', 'ins', 'data', 'datalist', 'mark', 'cite', 'q', 'sup', 'sub', 'a', 'time', 'em', 'strong', 'b', 'i', 'u', 's', 'strike', 'dfn', 'abbr', 'var', 'samp', 'kbd', 'bdi', 'math', 'mrow', 'mi', 'mo', 'mfrac', 'embed', 'img', 'wbr', 'code', 'meta', 'link', 'button', 'svg', 'title', 'metadata', 'defs', 'marker', 'g', 'line', 'circle', 'path', 'tspan', 'text'],
    'proseMirrorMarks': ['del', 'ins', 'mark', 'cite', 'q', 'sup', 'sub', 'a', 'em', 'strong', 'dfn', 'abbr'],
    'voidElements': ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'],
    'selfClosing': ['circle', 'ellipse', 'line', 'path', 'polygon', 'polyline', 'rect', 'stop', 'use'],
    'urlAttributes': ['href', 'src', 'data-versionurl', 'about', 'rel', 'rev', 'typeof', 'property', 'resource', 'datatype', 'vocab', 'xmlns', 'action', 'formaction', 'cite', 'data', 'poster', 'manifest', 'longdesc', 'profile', 'background', 'icon', 'usemap'],
    'multiTermAttributes': ['prefix', 'property', 'rel', 'resource', 'rev', 'typeof'],
    'sortAttributes': true,
    'removeAttributes': ['contenteditable', 'data-placeholder', 'draggable', 'spellcheck', 'style'],
    'removeCommentNodes': false,
    'removeNodesWithSelector': ['.do', '.ProseMirror-trailingBreak'],
    'removeClassValues': [],
    'removeWrapper': [{
      'wrapperSelector': '.do.ref',
      'contentSelector': 'mark'
    }],
    'allowedDataBlockTypes': ['text/turtle', 'application/ld+json', 'application/activity+json', 'application/n-triples', 'application/trig', 'text/n3'],
    'allowedDataMimeTypes': [ 'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/x-icon'],
    'allowedScripts': {
      'https://www.w3.org/scripts/TR/2021/fixup.js': {
        'removeNodesWithSelector': [ '#toc-nav'],
        'removeClassValues': ['toc-sidebar']
      }
    },
  },

  BeautifyOptions: {
    "indent_size": 2,
    "end_with_newline": true
  },

  ArticleNodeSelectors: [
    'main > article',
    'main',
    'body'
  ],

  SelectorSign: {
    "*": "🔗",
    "aside": "|",
    "audio": "🔊",
    "code": "#",
    "dl": "☝",
    "dl#document-annotation-service": "※",
    "dl#document-cited-by": "※",
    "dl#document-created": "📅",
    "dl#document-in-reply-to": "⮪",
    "dl#document-identifier": "🚩",
    "dl#document-inbox": "📥",
    "dl#document-latest-version": "∼",
    "dl#document-language": "🗺",
    "dl#document-license": "🌻",
    "dl#document-memento": "⛰",
    "dl#document-modified": "📅",
    "dl#document-original": "♁",
    "dl#document-predecessor-version": "≺",
    "dl#document-published": "📅",
    "dl#document-rights": "📜",
    "dl#document-resource-state": "🙊",
    "dl#document-see-also": "🙈",
    "dl#document-status": "🎆",
    "dl#document-timemap": "⌚",
    "dl#document-type": "🌱",
    "dfn": "📇",
    "figure": "❦",
    "footer": "⸙",
    "img": "🖼",
    "nav": "☛",
    "p": "¶",
    "pre": "🖩",
    "section": "§",
    "section#acknowledgements": "☺",
    "section#conclusions": "∴",
    "section#keywords": "🏷",
    "section#references": "※",
    "section#related-work": "⌘",
    "section#results": "∞",
    "table": "𝄜",
    "video": "🎞"
  },

  MotivationSign: {
    "oa:assessing": "✪",
    "oa:bookmarking": "🔖",
    "oa:commenting": "🗨",
    "oa:describing": "※",
    "oa:highlighting": "#",
    "oa:linking": "※",
    "oa:questioning": "?",
    "oa:replying": "💬",
    "bookmark:Bookmark": "🔖"
  },

  ActionToMotivation: {
    'approve': 'oa:assessing',
    'disapprove': 'oa:assessing',
    'specificity': 'oa:questioning',
    'bookmark': 'oa:bookmarking',
    'comment': 'oa:replying',
    'note': 'oa:commenting',
    'citation': 'oa:linking',
    'footnote': 'oa:describing',
    'reference': 'oa:linking',
    'semantics': 'oa:classifying'
  },

  DocumentDoItems: [
    'create-new-document',
    'document-info',
    'embed-data-entry',
    'generate-feed',
    'graph-view',
    'memento-document',
    'message-log',
    'open-document',
    'reply-to-resource',
    'resource-browser',
    'robustify-links',
    'save-as-document',
    'share-resource',
    'source-view',
    'user-identity-input'
  ],

  DocumentItems: [
    'authors',
    'document-identifier',
    'document-created',
    'document-modified',
    'document-published',
    'document-repository',
    'document-test-suite',
    'document-original',
    'document-memento',
    'document-latest-version',
    'document-latest-published-version',
    'document-predecessor-version',
    'document-timegate',
    'document-timemap',
    'document-derived-from',
    'document-derived-on',
    'document-editors',
    'document-authors',
    'document-language',
    'document-license',
    'document-rights',
    'document-inbox',
    'document-annotation-service',
    'document-in-reply-to',
    'document-type',
    'document-resource-state',
    'document-status',
    'document-see-also',
    'document-cited-by',
    'document-policy',
    'table-of-contents',
    'list-of-figures',
    'list-of-tables',
    'list-of-abbreviations',
    'list-of-concepts',
    'list-of-quotations',
    'table-of-requirements',
    'table-of-advisements',
    'abstract',
    'categories-and-subject-descriptors',
    'keywords',
    'general-terms',
    'list-of-additional-concepts',

    'introduction'
  ],
  ListOfStuff: {
    'table-of-contents': { 'label': 'Contents', 'selector': 'content', 'titleSelector': 'h1' },
    'list-of-figures': { 'label': 'Figures', 'selector': 'figure', 'titleSelector': 'figcaption' },
    'list-of-tables': { 'label': 'Tables', 'selector': 'table', 'titleSelector': 'caption' },
    'list-of-abbreviations': { 'label': 'Abbreviations', 'selector': 'abbr', 'titleSelector': 'title'},
    'list-of-quotations': {'label': 'Quotations', 'selector': 'q', 'titleSelector': 'cite'},
    'list-of-concepts': {'label': 'Concepts', 'selector': '[typeof~="skos:Concept"]', 'titleSelector': '[property~="skos:prefLabel"]'},
    'table-of-requirements': {'label': 'Requirements', 'selector': '[rel~="spec:requirement"]', 'titleSelector': '[property~="spec:statement"]'},
    'table-of-advisements': {'label': 'Advisements', 'selector': '[rel~="spec:advisement"]', 'titleSelector': '[property~="spec:statement"]'},
    'references': { 'label': 'References', 'selector':'cite a', 'titleSelector': 'h2' }
  },
  CollectionItemsLimit: 50,
  ContextLength: 32,
  NotificationLicense: 'https://creativecommons.org/publicdomain/zero/1.0/',
  License: {
    "https://creativecommons.org/publicdomain/zero/1.0/": {'name': 'CC0 1.0', 'code': 'cc0-1.0'},
    "https://creativecommons.org/licenses/by/4.0/": {'name': 'CC BY 4.0', 'code': 'cc-by-4.0'},
    "https://creativecommons.org/licenses/by-sa/4.0/": {'name': 'CC BY-SA 4.0', 'code': 'cc-by-sa-4.0'},
    "https://creativecommons.org/licenses/by-nc/4.0/": {'name': 'CC BY-NC 4.0', 'code': 'cc-by-nc-4.0'},
    "https://creativecommons.org/licenses/by-nd/4.0/": {'name': 'CC BY-ND 4.0', 'code': 'cc-by-nd-4.0'},
    "https://creativecommons.org/licenses/by-nc-sa/4.0/": {'name': 'CC BY-NC-SA 4.0', 'code': 'cc-by-nc-sa-4.0'},
    "https://creativecommons.org/licenses/by-nc-nd/4.0/": {'name': 'CC BY-NC-ND 4.0', 'code': 'cc-by-nc-nd-4.0'}
  },
  ResourceType: {
    "http://schema.org/Article": 'Article',
    "http://schema.org/BlogPosting": 'Blog Posting',
    "http://schema.org/Course": 'Course',
    "http://schema.org/Guide": 'Guide',
    "http://schema.org/NewsArticle": 'News Article',
    "http://schema.org/Recipe": 'Recipe',
    "http://schema.org/Review": 'Review',
    "http://schema.org/ScholarlyArticle": 'Scholarly Article',
    "http://purl.org/ontology/bibo/Slideshow": 'Slideshow',
    "http://usefulinc.com/ns/doap#Specification": 'Specification',
    "http://schema.org/TechArticle": 'Tech Article',
    "http://schema.org/Thesis": 'Thesis',
    "http://schema.org/Trip":'Trip',
  },
  PublicationStatus: {
    "http://purl.org/spar/pso/draft": 'Draft',
    "http://purl.org/spar/pso/published": 'Published'
  },
  Citation: {
    'http://purl.org/spar/cito/agreesWith': 'agrees with',
    'http://purl.org/spar/cito/cites': 'cites',
    'http://purl.org/spar/cito/citesAsAuthority': 'cites as authority',
    'http://purl.org/spar/cito/citesAsDataSource': 'cites as data source',
    'http://purl.org/spar/cito/citesAsEvidence': 'cites as evidence',
    'http://purl.org/spar/cito/citesAsMetadataDocument': 'cites as metadata document',
    'http://purl.org/spar/cito/citesAsPotentialSolution': 'cites as potential solution',
    'http://purl.org/spar/cito/citesAsRecommendedReading': 'cites as potential reading',
    'http://purl.org/spar/cito/citesAsRelated': 'cites as related',
    'http://purl.org/spar/cito/citesAsSourceDocument': 'cites as source document',
    'http://purl.org/spar/cito/citesForInformation': 'cites for information',
    'http://purl.org/spar/cito/compiles': 'compiles',
    'http://purl.org/spar/cito/confirms': 'confirms',
    'http://purl.org/spar/cito/containsAssertionFrom': 'contains assertion from',
    'http://purl.org/spar/cito/corrects': 'corrects',
    'http://purl.org/spar/cito/credits': 'credits',
    'http://purl.org/spar/cito/critiques': 'critiques',
    'http://purl.org/spar/cito/derides': 'derides',
    'http://purl.org/spar/cito/describes': 'describes',
    'http://purl.org/spar/cito/disagreesWith': 'disagrees with',
    'http://purl.org/spar/cito/discusses': 'discusses',
    'http://purl.org/spar/cito/disputes': 'disputes',
    'http://purl.org/spar/cito/documents': 'documents',
    'http://purl.org/spar/cito/extends': 'extends',
    'http://purl.org/spar/cito/includesExcerptFrom': 'includes excerpt from',
    'http://purl.org/spar/cito/includesQuotationFrom': 'includes quotation from',
    'http://purl.org/spar/cito/linksTo': 'links to',
    'http://purl.org/spar/cito/obtainsBackgroundFrom': 'obtains background from',
    'http://purl.org/spar/cito/obtainsSupportFrom': 'obtains support from',
    'http://purl.org/spar/cito/parodies': 'parodies',
    'http://purl.org/spar/cito/plagiarizes': 'plagiarizes',
    'http://purl.org/spar/cito/qualifies': 'qualifies',
    'http://purl.org/spar/cito/refutes': 'refutes',
    'http://purl.org/spar/cito/repliesTo': 'replies to',
    'http://purl.org/spar/cito/retracts': 'retracts',
    'http://purl.org/spar/cito/reviews': 'reviews',
    'http://purl.org/spar/cito/ridicules': 'ridicules',
    'http://purl.org/spar/cito/speculatesOn': 'speculates on',
    'http://purl.org/spar/cito/supports': 'supports',
    'http://purl.org/spar/cito/updates': 'updates',
    'http://purl.org/spar/cito/usesConclusionsFrom': 'uses conclusions from',
    'http://purl.org/spar/cito/usesDataFrom': 'uses data from',
    'http://purl.org/spar/cito/usesMethodIn': 'uses method in'
  },

  RequirementLevel: {
    'http://www.w3.org/ns/spec#MUST': 'MUST',
    'http://www.w3.org/ns/spec#MUSTNOT': 'MUST NOT',
    'http://www.w3.org/ns/spec#REQUIRED': 'REQUIRED',
    'http://www.w3.org/ns/spec#SHALL': 'SHALL',
    'http://www.w3.org/ns/spec#SHALLNOT': 'SHALL NOT',
    'http://www.w3.org/ns/spec#SHOULD': 'SHOULD',
    'http://www.w3.org/ns/spec#SHOULDNOT': 'SHOULD NOT',
    'http://www.w3.org/ns/spec#RECOMMENDED': 'RECOMMENDED',
    'http://www.w3.org/ns/spec#NOTRECOMMENDED': 'NOT RECOMMENDED',
    'http://www.w3.org/ns/spec#MAY': 'MAY',
    'http://www.w3.org/ns/spec#OPTIONAL': 'OPTIONAL'
  },

  SKOSClasses: {
    'http://www.w3.org/2004/02/skos/core#ConceptScheme': 'Concept Scheme',
    'http://www.w3.org/2004/02/skos/core#Collection': 'Collection',
    'http://www.w3.org/2004/02/skos/core#OrderedCollection': 'Ordered Collection',
    'http://www.w3.org/2004/02/skos/core#Concept': 'Concept'
  },

  TestDescriptionReviewStatus: {
    'http://www.w3.org/2006/03/test-description#accepted': "Accepted",
    'http://www.w3.org/2006/03/test-description#approved': "Approved",
    'http://www.w3.org/2006/03/test-description#assigned': "Assigned",
    'http://www.w3.org/2006/03/test-description#onhold': "On hold",
    'http://www.w3.org/2006/03/test-description#rejected': "Rejected",
    'http://www.w3.org/2006/03/test-description#unreviewed': "Unreviewed"
  },

  Actor: {
    Type: {
      "http://purl.org/dc/terms/Agent":"Agent",
      "http://schema.org/Person":"Person",
      "http://www.w3.org/2006/vcard/ns#Group":"Group",
      "http://www.w3.org/2006/vcard/ns#Individual":"Individual",
      "http://www.w3.org/2006/vcard/ns#Organization":"Organization",
      "http://www.w3.org/2006/vcard/ns#VCard":"VCard",
      "http://xmlns.com/foaf/0.1/Agent":"Agent",
      "http://xmlns.com/foaf/0.1/Group":"Group",
      "http://xmlns.com/foaf/0.1/Organization":"Organization",
      "http://xmlns.com/foaf/0.1/Person":"Person",
      "https://www.w3.org/ns/activitystreams#Application":"Application",
      "https://www.w3.org/ns/activitystreams#Group":"Group",
      "https://www.w3.org/ns/activitystreams#Organization":"Organization",
      "https://www.w3.org/ns/activitystreams#Person":"Person",
      "https://www.w3.org/ns/activitystreams#Service":"Service",
      "https://d-nb.info/standards/elementset/gnd#DifferentiatedPerson":"Person"
    },

    Property: {
      "http://purl.org/dc/terms/creator":"creator",
      "http://purl.org/dc/terms/publisher":"publisher",
      "http://schema.org/author":"author",
      "http://schema.org/contributor":"contributor",
      "http://schema.org/creator":"creator",
      "http://schema.org/editor":"editor",
      "http://schema.org/performer":"performer",
      "http://schema.org/publisher":"publisher",
      "http://xmlns.com/foaf/0.1/knows":"knows",
      "http://xmlns.com/foaf/0.1/maker":"maker",
      "https://www.w3.org/ns/activitystreams#actor":"actor"
    }
  },

  Event: {
    Property: {
      'http://schema.org/subEvent': "sub event",
      'http://schema.org/superEvent': "super event",
      'http://schema.org/startDate': "start date",
      'http://schema.org/endDate': "end date",
      'http://schema.org/performer': "performer"
    }
  },

  AccessContext: {
    Share: {
      'http://www.w3.org/ns/auth/acl#Read': 'read',
      'http://www.w3.org/ns/auth/acl#Write': 'write',
      'http://www.w3.org/ns/auth/acl#Control': 'control'
    }
  },

  ActivitiesObjectTypes: [
    'https://www.w3.org/ns/activitystreams#Activity',
    'https://www.w3.org/ns/activitystreams#Like',
    'https://www.w3.org/ns/activitystreams#Dislike',
    'https://www.w3.org/ns/activitystreams#Article',
    'https://www.w3.org/ns/activitystreams#Note',
    'https://www.w3.org/ns/activitystreams#Document',
    'http://www.w3.org/ns/oa#Annotation',
    'http://www.w3.org/2002/01/bookmark#Bookmark'
  ],

  ActionActivityIndex: {
    'comment': [ 'http://www.w3.org/ns/oa#Annotation', 'https://www.w3.org/ns/activitystreams#Note', 'https://www.w3.org/ns/activitystreams#Article', 'https://www.w3.org/ns/activitystreams#Document', 'http://schema.org/CreativeWork' ],
    'approve': [ 'http://www.w3.org/ns/oa#Annotation', 'https://www.w3.org/ns/activitystreams#Like', 'https://www.w3.org/ns/activitystreams#Activity', 'http://schema.org/CreativeWork' ],
    'disapprove': [ 'http://www.w3.org/ns/oa#Annotation', 'https://www.w3.org/ns/activitystreams#Dislike', 'https://www.w3.org/ns/activitystreams#Activity', 'http://schema.org/CreativeWork' ],
    'specificity': [ 'http://www.w3.org/ns/oa#Annotation','https://www.w3.org/ns/activitystreams#Note', 'https://www.w3.org/ns/activitystreams#Article', 'https://www.w3.org/ns/activitystreams#Document', 'http://schema.org/CreativeWork' ],
    'bookmark': [ 'http://www.w3.org/ns/oa#Annotation', 'http://www.w3.org/2002/01/bookmark#Bookmark', 'https://www.w3.org/ns/activitystreams#Activity', 'http://schema.org/CreativeWork' ]
  },

  CollectionTypes: [
    'https://www.w3.org/ns/activitystreams#Collection',
    'https://www.w3.org/ns/activitystreams#OrderedCollection',
    'http://www.w3.org/ns/ldp#Container'
  ],

  STRIDEThreatTypes: {
    S: {
      uri: 'http://www.wikidata.org/entity/Q11081100',
      name: 'Spoofing',
      related: [
        'http://www.grsu.by/net/SecurityPatternCatalogNaiveSchema#STRIDE_Spoofing',
        'https://w3id.org/dpv/risk#Spoofing',
        'https://w3id.org/dpv/risk#IdentityFraud',
        'https://w3id.org/dpv/risk#IdentityTheft',
        'https://w3id.org/dpv/risk#PhishingScam'
      ]
    },
    T: {
      uri: 'http://www.wikidata.org/entity/Q7681776',
      name: 'Tampering',
      related: [
        'http://www.grsu.by/net/SecurityPatternCatalogNaiveSchema#STRIDE_Tampering',
        'https://w3id.org/dpv/risk#UnauthorisedDataModification',
        'https://w3id.org/dpv/risk#UnauthorisedCodeModification',
        'https://w3id.org/dpv/risk#DataCorruption',
        'https://w3id.org/dpv/risk#IntegrityBreach'
      ]
    },
    R: {
      uri: 'http://www.wikidata.org/entity/Q1327773',
      name: 'Repudiation',
      related: [
        'http://www.grsu.by/net/SecurityPatternCatalogNaiveSchema#STRIDE_Repudiation',
        'https://w3id.org/dpv/risk#AuthorisationFailure',
        'https://w3id.org/dpv/risk#LackOfSystemTransparency',
        'https://w3id.org/dpv/risk#LoseTrust',
        'https://w3id.org/dpv/risk#LoggingControl'
      ]
    },
    I: {
      uri: 'http://www.wikidata.org/entity/Q2775060',
      name: 'Information disclosure',
      related: [
        'http://www.grsu.by/net/SecurityPatternCatalogNaiveSchema#STRIDE_Information_Disclosure',
        'https://w3id.org/dpv/risk#UnauthorisedInformationDisclosure',
        'https://w3id.org/dpv/risk#UnauthorisedDataDisclosure',
        'https://w3id.org/dpv/risk#UnwantedDisclosureData',
        'https://w3id.org/dpv/risk#ConfidentialityBreach'
      ]
    },
    D: {
      uri: 'http://www.wikidata.org/entity/Q131406',
      name: 'Denial of service',
      related: [
        'http://www.grsu.by/net/SecurityPatternCatalogNaiveSchema#STRIDE_Denial_of_Service',
        'https://w3id.org/dpv/risk#DenialServiceAttack',
        'https://w3id.org/dpv/risk#AvailabilityBreach'
      ]
    },
    E: {
      uri: 'http://www.wikidata.org/entity/Q1856893',
      name: 'Elevation of privilege',
      related: [
        'http://www.grsu.by/net/SecurityPatternCatalogNaiveSchema#STRIDE_Elevation_of_Privilege',
        'https://w3id.org/dpv/risk#UnauthorisedDataAccess',
        'https://w3id.org/dpv/risk#UnauthorisedSystemAccess',
        'https://w3id.org/dpv/risk#UnauthorisedCodeAccess'
      ]
    }
  },

  MediaTypes: {
    RDF: ['text/turtle', 'application/ld+json', 'application/activity+json', 'text/html', 'image/svg+xml', 'application/rdf+xml'],

    Binary: ['image/png', 'image/jpeg', 'image/gif', 'image/x-icon'],

    Feed: ['application/atom+xml', 'application/rss+xml'],

    Markup: ['text/html', 'image/svg+xml', 'text/markdown'],

    MultiMediaType: ['audio', 'image', 'video'],

    Geo: ['application/gpx+xml']
  },

  Prefixes: {
    'xsd': 'http://www.w3.org/2001/XMLSchema#',
    'rdf': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
    'as': 'https://www.w3.org/ns/activitystreams#',
    'oa': 'http://www.w3.org/ns/oa#',
    'schema': 'http://schema.org/',
    'cito': 'http://purl.org/spar/cito/',
    'qudt-unit': 'http://qudt.org/vocab/unit#',
    'ex': 'http://example.org/'
  },

  ns: {
    'sdmx-dimension': rdf.namespace('http://purl.org/linked-data/sdmx/2009/dimension'),
    'sdmx-measure': rdf.namespace('http://purl.org/linked-data/sdmx/2009/measure'),
    'test-description': rdf.namespace('http://www.w3.org/2006/03/test-description#'),
    acl: rdf.namespace('http://www.w3.org/ns/auth/acl#'),
    as: rdf.namespace('https://www.w3.org/ns/activitystreams#'),
    bibo: rdf.namespace('http://purl.org/ontology/bibo/'),
    bookmark: rdf.namespace('http://www.w3.org/2002/01/bookmark#'),
    cc: rdf.namespace('http://creativecommons.org/ns#'),
    cert: rdf.namespace('http://www.w3.org/ns/auth/cert#'),
    cito: rdf.namespace('http://purl.org/spar/cito/'),
    dbr: rdf.namespace('http://dbpedia.org/resource/'),
    dbp: rdf.namespace('http://dbpedia.org/property/'),
    dcat: rdf.namespace('http://www.w3.org/ns/dcat#'),
    dcelements: rdf.namespace('http://purl.org/dc/elements/'),
    dcterms: rdf.namespace('http://purl.org/dc/terms/'),
    dctypes: rdf.namespace('http://purl.org/dc/dcmitype/'),
    deo: rdf.namespace('http://purl.org/spar/deo/'),
    dio: rdf.namespace('https://w3id.org/dio#'),
    doap: rdf.namespace('http://usefulinc.com/ns/doap#'),
    doc: rdf.namespace('http://www.w3.org/2000/10/swap/pim/doc#'),
    doco: rdf.namespace('http://purl.org/spar/doco/'),
    dpv: rdf.namespace('https://w3id.org/dpv#'),
    fabio: rdf.namespace('http://purl.org/spar/fabio/'),
    foaf: rdf.namespace('http://xmlns.com/foaf/0.1/'),
    ldp: rdf.namespace('http://www.w3.org/ns/ldp#'),
    mem: rdf.namespace('http://mementoweb.org/ns#'),
    notify: rdf.namespace('http://www.w3.org/ns/solid/notifications#'),
    oa: rdf.namespace('http://www.w3.org/ns/oa#'),
    odrl: rdf.namespace('http://www.w3.org/ns/odrl/2/'),
    opmw: rdf.namespace('http://www.opmw.org/ontology/'),
    owl: rdf.namespace('http://www.w3.org/2002/07/owl#'),
    pim: rdf.namespace('http://www.w3.org/ns/pim/space#'),
    prov: rdf.namespace('http://www.w3.org/ns/prov#'),
    pso: rdf.namespace('http://purl.org/spar/pso/'),
    qb: rdf.namespace('http://purl.org/linked-data/cube#'),
    qudt: rdf.namespace('http://qudt.org/vocab/unit#'),
    rdf: rdf.namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#'),
    rdfa: rdf.namespace(' http://www.w3.org/ns/rdfa#'),
    rdfs: rdf.namespace('http://www.w3.org/2000/01/rdf-schema#'),
    rel: rdf.namespace('https://www.w3.org/ns/iana/link-relations/relation#'),
    risk: rdf.namespace('https://w3id.org/dpv/risk#'),
    rsa: rdf.namespace('http://www.w3.org/ns/auth/rsa#'),
    schema: rdf.namespace('http://schema.org/'),
    sio: rdf.namespace('http://semanticscience.org/resource/'),
    sioc: rdf.namespace('http://rdfs.org/sioc/ns#'),
    skos: rdf.namespace('http://www.w3.org/2004/02/skos/core#'),
    skosxl: rdf.namespace('http://www.w3.org/2008/05/skos-xl#'),
    solid: rdf.namespace('http://www.w3.org/ns/solid/terms#'),
    spec: rdf.namespace('http://www.w3.org/ns/spec#'),
    tech: rdf.namespace('https://w3id.org/dpv/tech'),
    vcard: rdf.namespace('http://www.w3.org/2006/vcard/ns#'),
    void: rdf.namespace('http://rdfs.org/ns/void#'),
    wgs: rdf.namespace('http://www.w3.org/2003/01/geo/wgs84_pos#'),
    xhv: rdf.namespace('http://www.w3.org/1999/xhtml/vocab#'),
    xsd: rdf.namespace('http://www.w3.org/2001/XMLSchema#')
  },

  ChangeClasses: {
    'http://www.w3.org/ns/spec#ChangeClass1': '1',
    'http://www.w3.org/ns/spec#ChangeClass2': '2',
    'http://www.w3.org/ns/spec#ChangeClass3': '3',
    'http://www.w3.org/ns/spec#ChangeClass4': '4',
    'http://www.w3.org/ns/spec#ChangeClass5': '5'
  },
  SecretAgentNames: ['Abraham Lincoln', 'Admiral Awesome', 'Anonymous Coward', 'Believe it or not', 'Creative Monkey', 'Senegoid', 'Dog from the Web', 'Ekrub', 'Elegant Banana', 'Foo Bar', 'Lbmit', 'Lunatic Scholar', 'NahuLcm', 'Noslen', 'Okie Dokie', 'Samurai Cat', 'Vegan Superstar'],

  RefAreas: {"AF":"Afghanistan","A9":"Africa","AL":"Albania","DZ":"Algeria","AS":"American Samoa","L5":"Andean Region","AD":"Andorra","AO":"Angola","AG":"Antigua and Barbuda","1A":"Arab World","AR":"Argentina","AM":"Armenia","AW":"Aruba","AU":"Australia","AT":"Austria","AZ":"Azerbaijan","BS":"Bahamas, The","BH":"Bahrain","BD":"Bangladesh","BB":"Barbados","BY":"Belarus","BE":"Belgium","BZ":"Belize","BJ":"Benin","BM":"Bermuda","BT":"Bhutan","BO":"Bolivia","BA":"Bosnia and Herzegovina","BW":"Botswana","BR":"Brazil","BN":"Brunei Darussalam","BG":"Bulgaria","BF":"Burkina Faso","BI":"Burundi","CV":"Cabo Verde","KH":"Cambodia","CM":"Cameroon","CA":"Canada","S3":"Caribbean small states","KY":"Cayman Islands","CF":"Central African Republic","TD":"Chad","JG":"Channel Islands","CL":"Chile","CN":"China","CO":"Colombia","KM":"Comoros","CD":"Congo, Dem. Rep.","CG":"Congo, Rep.","CR":"Costa Rica","CI":"Cote d'Ivoire","HR":"Croatia","CU":"Cuba","CW":"Curacao","CY":"Cyprus","CZ":"Czech Republic","DK":"Denmark","DJ":"Djibouti","DM":"Dominica","DO":"Dominican Republic","Z4":"East Asia & Pacific (all income levels)","4E":"East Asia & Pacific (developing only)","C4":"East Asia and the Pacific (IFC classification)","EC":"Ecuador","EG":"Egypt, Arab Rep.","SV":"El Salvador","GQ":"Equatorial Guinea","ER":"Eritrea","EE":"Estonia","ET":"Ethiopia","XC":"Euro area","Z7":"Europe & Central Asia (all income levels)","7E":"Europe & Central Asia (developing only)","C5":"Europe and Central Asia (IFC classification)","EU":"European Union","FO":"Faeroe Islands","FJ":"Fiji","FI":"Finland","FR":"France","PF":"French Polynesia","GA":"Gabon","GM":"Gambia, The","GE":"Georgia","DE":"Germany","GH":"Ghana","GR":"Greece","GL":"Greenland","GD":"Grenada","GU":"Guam","GT":"Guatemala","GN":"Guinea","GW":"Guinea-Bissau","GY":"Guyana","HT":"Haiti","XE":"Heavily indebted poor countries (HIPC)","XD":"High income","XS":"High income: OECD","XR":"High income: nonOECD","HN":"Honduras","HK":"Hong Kong SAR, China","HU":"Hungary","IS":"Iceland","IN":"India","ID":"Indonesia","IR":"Iran, Islamic Rep.","IQ":"Iraq","IE":"Ireland","IM":"Isle of Man","IL":"Israel","IT":"Italy","JM":"Jamaica","JP":"Japan","JO":"Jordan","KZ":"Kazakhstan","KE":"Kenya","KI":"Kiribati","KP":"Korea, Dem. Rep.","KR":"Korea, Rep.","KV":"Kosovo","KW":"Kuwait","KG":"Kyrgyz Republic","LA":"Lao PDR","ZJ":"Latin America & Caribbean (all income levels)","XJ":"Latin America & Caribbean (developing only)","L4":"Latin America and the Caribbean","C6":"Latin America and the Caribbean (IFC classification)","LV":"Latvia","XL":"Least developed countries: UN classification","LB":"Lebanon","LS":"Lesotho","LR":"Liberia","LY":"Libya","LI":"Liechtenstein","LT":"Lithuania","XO":"Low & middle income","XM":"Low income","XN":"Lower middle income","LU":"Luxembourg","MO":"Macao SAR, China","MK":"Macedonia, FYR","MG":"Madagascar","MW":"Malawi","MY":"Malaysia","MV":"Maldives","ML":"Mali","MT":"Malta","MH":"Marshall Islands","MR":"Mauritania","MU":"Mauritius","MX":"Mexico","L6":"Mexico and Central America","FM":"Micronesia, Fed. Sts.","ZQ":"Middle East & North Africa (all income levels)","XQ":"Middle East & North Africa (developing only)","C7":"Middle East and North Africa (IFC classification)","XP":"Middle income","MD":"Moldova","MC":"Monaco","MN":"Mongolia","ME":"Montenegro","MA":"Morocco","MZ":"Mozambique","MM":"Myanmar","NA":"Namibia","NP":"Nepal","NL":"Netherlands","NC":"New Caledonia","NZ":"New Zealand","NI":"Nicaragua","NE":"Niger","NG":"Nigeria","M2":"North Africa","XU":"North America","MP":"Northern Mariana Islands","NO":"Norway","XY":"Not classified","OE":"OECD members","OM":"Oman","S4":"Other small states","S2":"Pacific island small states","PK":"Pakistan","PW":"Palau","PA":"Panama","PG":"Papua New Guinea","PY":"Paraguay","PE":"Peru","PH":"Philippines","PL":"Poland","PT":"Portugal","PR":"Puerto Rico","QA":"Qatar","RO":"Romania","RU":"Russian Federation","RW":"Rwanda","WS":"Samoa","SM":"San Marino","ST":"Sao Tome and Principe","SA":"Saudi Arabia","SN":"Senegal","RS":"Serbia","SC":"Seychelles","SL":"Sierra Leone","SG":"Singapore","SX":"Sint Maarten (Dutch part)","SK":"Slovak Republic","SI":"Slovenia","S1":"Small states","SB":"Solomon Islands","SO":"Somalia","ZA":"South Africa","8S":"South Asia","C8":"South Asia (IFC classification)","SS":"South Sudan","L7":"Southern Cone Extended","ES":"Spain","LK":"Sri Lanka","KN":"St. Kitts and Nevis","LC":"St. Lucia","MF":"St. Martin (French part)","VC":"St. Vincent and the Grenadines","C9":"Sub-Saharan Africa (IFC classification)","ZG":"Sub-Saharan Africa (all income levels)","ZF":"Sub-Saharan Africa (developing only)","A4":"Sub-Saharan Africa excluding South Africa","A5":"Sub-Saharan Africa excluding South Africa and Nigeria","SD":"Sudan","SR":"Suriname","SZ":"Swaziland","SE":"Sweden","CH":"Switzerland","SY":"Syrian Arab Republic","TJ":"Tajikistan","TZ":"Tanzania","TH":"Thailand","TL":"Timor-Leste","TG":"Togo","TO":"Tonga","TT":"Trinidad and Tobago","TN":"Tunisia","TR":"Turkey","TM":"Turkmenistan","TC":"Turks and Caicos Islands","TV":"Tuvalu","UG":"Uganda","UA":"Ukraine","AE":"United Arab Emirates","GB":"United Kingdom","US":"United States","XT":"Upper middle income","UY":"Uruguay","UZ":"Uzbekistan","VU":"Vanuatu","VE":"Venezuela, RB","VN":"Vietnam","VI":"Virgin Islands (U.S.)","PS":"West Bank and Gaza","1W":"World","YE":"Yemen, Rep.","ZM":"Zambia","ZW":"Zimbabwe"},
  //https://en.wikipedia.org/wiki/List_of_ISO_639_language_codes
  Languages: {
    ab: { name: "Abkhaz", sourceName: "Аҧсуа", dir: "ltr" },
    aa: { name: "Afar", sourceName: "Qafar af", dir: "ltr" },
    af: { name: "Afrikaans", sourceName: "Afrikaans", dir: "ltr" },
    ak: { name: "Akan", sourceName: "Ákán", dir: "ltr" },
    sq: { name: "Albanian", sourceName: "Shqip", dir: "ltr" },
    am: { name: "Amharic", sourceName: "አማርኛ", dir: "ltr" },
    ar: { name: "Arabic", sourceName: "اَلْعَرَبِيَّةُ", dir: "rtl" },
    an: { name: "Aragonese", sourceName: "Aragonés", dir: "ltr" },
    hy: { name: "Armenian", sourceName: "Հայերեն", dir: "ltr" },
    as: { name: "Assamese", sourceName: "অসমীয়া", dir: "ltr" },
    av: { name: "Avar", sourceName: "Авар мацӏ", dir: "ltr" },
    ae: { name: "Avestan", sourceName: "Upastawakaēna", dir: "ltr" },
    ay: { name: "Aymara", sourceName: "Aymara", dir: "ltr" },
    az: { name: "Azerbaijani", sourceName: "Azərbaycan dili", dir: "ltr" },
    bm: { name: "Bambara", sourceName: "ߓߡߊߣߊ߲ߞߊ߲", dir: "ltr" },
    ba: { name: "Bashkir", sourceName: "Башҡорт теле", dir: "ltr" },
    eu: { name: "Basque", sourceName: "Euskara", dir: "ltr" },
    be: { name: "Belarusian", sourceName: "Беларуская мова", dir: "ltr" },
    bn: { name: "Bengali", sourceName: "বাংলা", dir: "ltr" },
    bi: { name: "Bislama", sourceName: "Bislama", dir: "ltr" },
    bs: { name: "Bosnian", sourceName: "Босански", dir: "ltr" },
    br: { name: "Breton", sourceName: "Brezhoneg", dir: "ltr" },
    bg: { name: "Bulgarian", sourceName: "Български", dir: "ltr" },
    my: { name: "Burmese", sourceName: "မြန်မာစာ", dir: "ltr" },
    ca: { name: "Catalan", sourceName: "Català", dir: "ltr" },
    ch: { name: "Chamorro", sourceName: "Finu' Chamoru", dir: "ltr" },
    ce: { name: "Chechen", sourceName: "Нохчийн мотт", dir: "ltr" },
    ny: { name: "Chichewa", sourceName: "Chichewa", dir: "ltr" },
    zh: { name: "Chinese", sourceName: "中文", dir: "ltr" },
    cu: { name: "Church Slavonic", sourceName: "Славе́нскїй ѧ҆зы́къ", dir: "ltr" },
    cv: { name: "Chuvash", sourceName: "Чӑвашла", dir: "ltr" },
    kw: { name: "Cornish", sourceName: "Kernowek", dir: "ltr" },
    co: { name: "Corsican", sourceName: "Corsu", dir: "ltr" },
    cr: { name: "Cree", sourceName: "ᓀᐦᐃᔭᐁᐧᐃᐧᐣ", dir: "ltr" },
    hr: { name: "Croatian", sourceName: "Hrvatski", dir: "ltr" },
    cs: { name: "Czech", sourceName: "Čeština", dir: "ltr" },
    da: { name: "Danish", sourceName: "Dansk", dir: "ltr" },
    dv: { name: "Divehi", sourceName: "ދިވެހި", dir: "ltr" },
    nl: { name: "Dutch", sourceName: "Nederlands", dir: "ltr" },
    dz: { name: "Dzongkha", sourceName: "རྫོང་ཁ་", dir: "ltr" },
    en: { name: "English", sourceName: "English", dir: "ltr" },
    eo: { name: "Esperanto", sourceName: "Esperanto", dir: "ltr" },
    et: { name: "Estonian", sourceName: "Eesti keel", dir: "ltr" },
    ee: { name: "Ewe", sourceName: "Èʋegbe", dir: "ltr" },
    fo: { name: "Faroese", sourceName: "Føroyskt", dir: "ltr" },
    fj: { name: "Fijian", sourceName: "Na Vosa Vakaviti", dir: "ltr" },
    fi: { name: "Finnish", sourceName: "Suomi", dir: "ltr" },
    fr: { name: "French", sourceName: "Français", dir: "ltr" },
    fy: { name: "Frisian", sourceName: "Frysk", dir: "ltr" },
    ff: { name: "Fula", sourceName: "ࢻُلْࢻُلْدٜ", dir: "ltr" },
    gd: { name: "Scottish Gaelic", sourceName: "Gàidhlig", dir: "ltr" },
    gl: { name: "Galician", sourceName: "Galego", dir: "ltr" },
    lg: { name: "Ganda", sourceName: "Luganda", dir: "ltr" },
    ka: { name: "Georgian", sourceName: "ქართული", dir: "ltr" },
    de: { name: "German", sourceName: "Deutsch", dir: "ltr" },
    el: { name: "Greek", sourceName: "Νέα Ελληνικά", dir: "ltr" },
    kl: { name: "Greenlandic", sourceName: "Kalaallisut", dir: "ltr" },
    gn: { name: "Guarani", sourceName: "Avañe'ẽ", dir: "ltr" },
    gu: { name: "Gujarati", sourceName: "ગુજરાતી", dir: "ltr" },
    ht: { name: "Haitian Creole", sourceName: "Kreyòl ayisyen", dir: "ltr" },
    ha: { name: "Hausa", sourceName: "هَرْشٜن هَوْس", dir: "ltr" },
    haw: { name: "Hawaiian", sourceName: "ʻōlelo Hawaiʻi", dir: "ltr" },
    he: { name: "Hebrew", sourceName: "עברית", dir: "rtl" },
    hz: { name: "Herero", sourceName: "Otjiherero", dir: "ltr" },
    hi: { name: "Hindi", sourceName: "हिन्दी", dir: "ltr" },
    ho: { name: "Hiri Motu", sourceName: "Hiri Motu", dir: "ltr" },
    hu: { name: "Hungarian", sourceName: "Magyar nyelv", dir: "ltr" },
    is: { name: "Icelandic", sourceName: "Íslenska", dir: "ltr" },
    io: { name: "Ido", sourceName: "Ido", dir: "ltr" },
    ig: { name: "Igbo", sourceName: "ásụ̀sụ́ Ìgbò", dir: "ltr" },
    id: { name: "Indonesian", sourceName: "bahasa Indonesia", dir: "ltr" },
    ia: { name: "Interlingua", sourceName: "Interlingua", dir: "ltr" },
    ie: { name: "Interlingue", sourceName: "Interlingue; Occidental", dir: "ltr" },
    iu: { name: "Inuktitut", sourceName: "ᐃᓄᒃᑎᑐᑦ", dir: "ltr" },
    ik: { name: "Inupiaq", sourceName: "Iñupiaq", dir: "ltr" },
    ga: { name: "Irish", sourceName: "Gaeilge", dir: "ltr" },
    it: { name: "Italian", sourceName: "Italiano", dir: "ltr" },
    ja: { name: "Japanese", sourceName: "日本語", dir: "ltr" },
    jv: { name: "Javanese", sourceName: "ꦧꦱꦗꦮ", dir: "ltr" },
    kn: { name: "Kannada", sourceName: "ಕನ್ನಡ", dir: "ltr" },
    kr: { name: "Kanuri", sourceName: "كَنُرِيِه", dir: "ltr" },
    ks: { name: "Kashmiri", sourceName: "कॉशुर", dir: "ltr" },
    kk: { name: "Kazakh", sourceName: "Қазақша", dir: "ltr" },
    km: { name: "Khmer", sourceName: "ខេមរភាសា", dir: "ltr" },
    ki: { name: "Kikuyu", sourceName: "Gĩgĩkũyũ", dir: "ltr" },
    rw: { name: "Kinyarwanda", sourceName: "Ikinyarwanda", dir: "ltr" },
    ky: { name: "Kirghiz", sourceName: "Кыргыз", dir: "ltr" },
    kv: { name: "Komi", sourceName: "Коми кыв", dir: "ltr" },
    kg: { name: "Kongo", sourceName: "Kikongo", dir: "ltr" },
    ko: { name: "Korean", sourceName: "한국어", dir: "ltr" },
    kj: { name: "Kwanyama", sourceName: "Oshikwanyama", dir: "ltr" },
    ku: { name: "Kurdish", sourceName: "کوردی", dir: "ltr" },
    lo: { name: "Lao", sourceName: "ພາສາລາວ", dir: "ltr" },
    la: { name: "Latin", sourceName: "Latinum", dir: "ltr" },
    lv: { name: "Latvian", sourceName: "Latviešu", dir: "ltr" },
    li: { name: "Limburgish", sourceName: "Lèmburgs", dir: "ltr" },
    ln: { name: "Lingala", sourceName: "Lingála", dir: "ltr" },
    lt: { name: "Lithuanian", sourceName: "Lietuvių", dir: "ltr" },
    lu: { name: "Luba-Katanga", sourceName: "Kiluba", dir: "ltr" },
    lb: { name: "Luxembourgish", sourceName: "Lëtzebuergesch", dir: "ltr" },
    mk: { name: "Macedonian", sourceName: "Македонски", dir: "ltr" },
    mg: { name: "Malagasy", sourceName: "مَلَغَسِ", dir: "ltr" },
    ms: { name: "Malay", sourceName: "بهاس ملايو", dir: "ltr" },
    ml: { name: "Malayalam", sourceName: "മലയാളം", dir: "ltr" },
    mt: { name: "Maltese", sourceName: "Malti", dir: "ltr" },
    gv: { name: "Manx", sourceName: "Gaelg", dir: "ltr" },
    mi: { name: "Maori", sourceName: "reo Māori", dir: "ltr" },
    mr: { name: "Marathi", sourceName: "मराठी", dir: "ltr" },
    mh: { name: "Marshallese", sourceName: "kajin M̧ajel‌̧", dir: "ltr" },
    mn: { name: "Mongolian", sourceName: "ᠮᠣᠩᠭᠣᠯ ᠬᠡᠯᠡ", dir: "ltr" },
    na: { name: "Nauru", sourceName: "dorerin Naoe", dir: "ltr" },
    nv: { name: "Navajo", sourceName: "Diné bizaad", dir: "ltr" },
    nd: { name: "North Ndebele", sourceName: "isiNdebele; saseNyakatho", dir: "ltr" },
    nr: { name: "South Ndebele", sourceName: "isiNdebele; sakwaNdzundza", dir: "ltr" },
    ng: { name: "Ndonga", sourceName: "Ndonga", dir: "ltr" },
    ne: { name: "Nepali", sourceName: "नेपाली भाषा", dir: "ltr" },
    no: { name: "Norwegian", sourceName: "Norsk", dir: "ltr" },
    nb: { name: "Norwegian Bokmål", sourceName: "Norsk Bokmål", dir: "ltr" },
    nn: { name: "Norwegian Nynorsk", sourceName: "Norsk Nynorsk", dir: "ltr" },
    oc: { name: "Occitan", sourceName: "Occitan; Provençal", dir: "ltr" },
    oj: { name: "Ojibwa", sourceName: "ᐊᓂᔑᓈᐯᒧᐎᓐ", dir: "ltr" },
    or: { name: "Oriya", sourceName: "ଓଡ଼ିଆ", dir: "ltr" },
    om: { name: "Oromo", sourceName: "afaan Oromoo", dir: "ltr" },
    os: { name: "Ossetian", sourceName: "ирон Ӕвзаг", dir: "ltr" },
    pi: { name: "Pali", sourceName: "Pāli", dir: "ltr" },
    ps: { name: "Pashto", sourceName: "پښتو", dir: "rtl" },
    fa: { name: "Persian", sourceName: "فارسی", dir: "rtl" },
    pl: { name: "Polish", sourceName: "Polski", dir: "ltr" },
    pt: { name: "Portuguese", sourceName: "Português", dir: "ltr" },
    pa: { name: "Punjabi", sourceName: "ਪੰਜਾਬੀ; پنجابی", dir: "ltr" },
    qu: { name: "Quechua", sourceName: "Runa simi", dir: "ltr" },
    ro: { name: "Romanian", sourceName: "Română", dir: "ltr" },
    rm: { name: "Romansh", sourceName: "Rumantsch", dir: "ltr" },
    rn: { name: "Rundi", sourceName: "Ikirundi", dir: "ltr" },
    ru: { name: "Russian", sourceName: "Русский язык", dir: "ltr" },
    se: { name: "Northern Sami", sourceName: "Davvisámegiella", dir: "ltr" },
    sm: { name: "Samoan", sourceName: "gagana Sāmoa", dir: "ltr" },
    sg: { name: "Sango", sourceName: "yângâ tî Sängö", dir: "ltr" },
    sa: { name: "Sanskrit", sourceName: "संस्कृतम्", dir: "ltr" },
    sc: { name: "Sardinian", sourceName: "Sardu", dir: "ltr" },
    sr: { name: "Serbian", sourceName: "Српски", dir: "ltr" },
    sn: { name: "Shona", sourceName: "chiShona", dir: "ltr" },
    sd: { name: "Sindhi", sourceName: "سنڌي; सिन्धी", dir: "ltr" },
    si: { name: "Sinhala", sourceName: "සිංහල", dir: "ltr" },
    sk: { name: "Slovak", sourceName: "Slovenčina", dir: "ltr" },
    sl: { name: "Slovene", sourceName: "Slovenščina", dir: "ltr" },
    so: { name: "Somali", sourceName: "Soomaali", dir: "ltr" },
    st: { name: "Southern Sotho", sourceName: "Sesotho", dir: "ltr" },
    es: { name: "Spanish", sourceName: "Español", dir: "ltr" },
    su: { name: "Sundanese", sourceName: "basa Sunda", dir: "ltr" },
    sw: { name: "Swahili", sourceName: "Kiswahili", dir: "ltr" },
    ss: { name: "Swati", sourceName: "siSwati", dir: "ltr" },
    sv: { name: "Swedish", sourceName: "Svenska", dir: "ltr" },
    tl: { name: "Tagalog", sourceName: "Wikang Tagalog", dir: "ltr" },
    ty: { name: "Tahitian", sourceName: "reo Tahiti", dir: "ltr" },
    tg: { name: "Tajik", sourceName: "Тоҷикӣ", dir: "ltr" },
    ta: { name: "Tamil", sourceName: "தமிழ்", dir: "ltr" },
    tt: { name: "Tatar", sourceName: "Татар теле", dir: "ltr" },
    te: { name: "Telugu", sourceName: "తెలుగు", dir: "ltr" },
    th: { name: "Thai", sourceName: "ภาษาไทย", dir: "ltr" },
    bo: { name: "Tibetan", sourceName: "བོད་སྐད་", dir: "ltr" },
    ti: { name: "Tigrinya", sourceName: "ትግርኛ", dir: "ltr" },
    to: { name: "Tonga", sourceName: "lea faka-Tonga", dir: "ltr" },
    ts: { name: "Tsonga", sourceName: "Xitsonga", dir: "ltr" },
    tn: { name: "Tswana", sourceName: "Setswana", dir: "ltr" },
    tr: { name: "Turkish", sourceName: "Türkçe", dir: "ltr" },
    tk: { name: "Turkmen", sourceName: "Türkmençe", dir: "ltr" },
    tw: { name: "Twi", sourceName: "Twi", dir: "ltr" },
    ug: { name: "Uyghur", sourceName: "ئۇيغۇر تىلى", dir: "ltr" },
    uk: { name: "Ukrainian", sourceName: "Українська", dir: "ltr" },
    ur: { name: "Urdu", sourceName: "اُردُو", dir: "rtl" },
    uz: { name: "Uzbek", sourceName: "Ózbekça", dir: "ltr" },
    ve: { name: "Venda", sourceName: "Tshivenḓa", dir: "ltr" },
    vi: { name: "Vietnamese", sourceName: "tiếng Việt", dir: "ltr" },
    vo: { name: "Volapük", sourceName: "Volapük", dir: "ltr" },
    wa: { name: "Walloon", sourceName: "Walon", dir: "ltr" },
    cy: { name: "Welsh", sourceName: "Cymraeg", dir: "ltr" },
    wo: { name: "Wolof", sourceName: "وࣷلࣷفْ", dir: "ltr" },
    xh: { name: "Xhosa", sourceName: "isiXhosa", dir: "ltr" },
    ii: { name: "Yi", sourceName: "ꆈꌠꉙ", dir: "ltr" },
    yi: { name: "Yiddish", sourceName: "ייִדיש", dir: "rtl" },
    yo: { name: "Yoruba", sourceName: "èdè Yorùbá", dir: "ltr" },
    za: { name: "Zhuang", sourceName: "話僮", dir: "ltr" },
    zu: { name: "Zulu", sourceName: "isiZulu", dir: "ltr" },
  }
}
