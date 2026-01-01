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
    "https://creativecommons.org/publicdomain/zero/1.0/": {'name': 'CC0 1.0', 'description': 'Creative Commons CC0 1.0 Universal', 'code': 'cc0-1.0'},
    "https://creativecommons.org/licenses/by/4.0/": {'name': 'CC BY 4.0', 'description': 'Creative Commons Attribution 4.0 International', 'code': 'cc-by-4.0'},
    "https://creativecommons.org/licenses/by-sa/4.0/": {'name': 'CC BY-SA 4.0', 'description': 'Creative Commons Attribution-ShareAlike 4.0 International', 'code': 'cc-by-sa-4.0'},
    "https://creativecommons.org/licenses/by-nc/4.0/": {'name': 'CC BY-NC 4.0', 'description': 'Creative Commons Attribution-NonCommercial 4.0 International', 'code': 'cc-by-nc-4.0'},
    "https://creativecommons.org/licenses/by-nd/4.0/": {'name': 'CC BY-ND 4.0', 'description': 'Creative Commons Attribution-NoDerivatives 4.0 International', 'code': 'cc-by-nd-4.0'},
    "https://creativecommons.org/licenses/by-nc-sa/4.0/": {'name': 'CC BY-NC-SA 4.0', 'description': 'Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International', 'code': 'cc-by-nc-sa-4.0'},
    "https://creativecommons.org/licenses/by-nc-nd/4.0/": {'name': 'CC BY-NC-ND 4.0', 'description': 'Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 International', 'code': 'cc-by-nc-nd-4.0'}
  },
  ResourceType: {
    "http://schema.org/Article": {'name': 'Article', 'description': 'An article, such as a news article or piece of investigative report.'},
    "http://schema.org/BlogPosting": {'name': 'BlogPosting', 'description': 'A blog post.'},
    "http://schema.org/Course": {'name': 'Course', 'description': 'A description of an educational course.'},
    "http://schema.org/Guide": {'name': 'Guide', 'description': 'Guide is a page or article that recommends specific products or services, or aspects of a thing for a user to consider.'},
    "http://schema.org/NewsArticle": {'name': 'NewsArticle', 'description': 'A NewsArticle is an article whose content reports news, or provides background context and supporting materials for understanding the news.'},
    "http://schema.org/Recipe": {'name': 'Recipe', 'description': 'A recipe.'},
    "http://schema.org/Review": {'name': 'Review', 'description': 'A review of an item - for example, of a restaurant, movie, or store.'},
    "http://schema.org/ScholarlyArticle": {'name': 'ScholarlyArticle', 'description': 'A scholarly article.'},
    "http://purl.org/ontology/bibo/Slideshow": {'name': 'Slideshow', 'description': 'A presentation of a series of slides, usually presented in front of an audience with written text and images.'},
    "http://usefulinc.com/ns/doap#Specification": {'name': 'Specification', 'description': 'A specification of a system\'s aspects, technical or otherwise.'},
    "http://schema.org/TechArticle": {'name': 'TechArticle', 'description': 'A technical article - Example: How-to (task) topics, step-by-step, procedural troubleshooting, specifications, etc.'},
    "http://schema.org/Thesis": {'name': 'Thesis', 'description': 'A thesis or dissertation document submitted in support of candidature for an academic degree or professional qualification.'},
    "http://schema.org/Trip": {'name': 'Trip', 'description': 'A trip or journey. An itinerary of visits to one or more places.'}
  },
  PublicationStatus: {
    "http://purl.org/spar/pso/draft": { 'name': 'Draft', 'description': 'The status of a work (for example a document or a dataset) prior to completion and publication.' },
    "http://purl.org/spar/pso/published": { 'name': 'Published', 'description': 'The status of material (for example a document or a dataset) that has been published, i.e. made available for people to access, read or use, either freely or for a purchase price or an access fee.' }
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
    'http://www.w3.org/2006/03/test-description#accepted': "the item has gone through a first review, which shows it as valid for further processing",
    'http://www.w3.org/2006/03/test-description#approved': "the item has gone through the review process and was approved",
    'http://www.w3.org/2006/03/test-description#assigned': "a more specific review of the item has been assigned to someone",
    'http://www.w3.org/2006/03/test-description#onhold': "the item had already gone through the review process, but the results of the review need to be re-assessed due to new input",
    'http://www.w3.org/2006/03/test-description#rejected': "the item has gone through the review process and was rejected",
    'http://www.w3.org/2006/03/test-description#unreviewed': "the item has been proposed, but hasn't been reviewed (e.g. for completeness) yet"
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
  Languages: {"ab":"Аҧсуа","aa":"Qafar af","af":"Afrikaans","ak":"Ákán","sq":"Shqip","am":"አማርኛ","ar":"اَلْعَرَبِيَّةُ","an":"Aragonés","hy":"Հայերեն","as":"অসমীয়া","av":"Авар мацӏ","ae":"Upastawakaēna","ay":"Aymara","az":"Azərbaycan dili","bm":"ߓߡߊߣߊ߲ߞߊ߲","ba":"Башҡорт теле","eu":"Euskara","be":"Беларуская мова","bn":"বাংলা","bi":"Bislama","bs":"Босански","br":"Brezhoneg","bg":"Български","my":"မြန်မာစာ","ca":"Català","ch":"Finu' Chamoru","ce":"Нохчийн мотт","ny":"Chichewa","zh":"中文","cu":"Славе́нскїй ѧ҆зы́къ","cv":"Чӑвашла","kw":"Kernowek","co":"Corsu","cr":"ᓀᐦᐃᔭᐁᐧᐃᐧᐣ","hr":"Hrvatski","cs":"Čeština","da":"Dansk","dv":"ދިވެހި","nl":"Nederlands","dz":"རྫོང་ཁ་","en":"English","eo":"Esperanto","et":"Eesti keel","ee":"Èʋegbe","fo":"Føroyskt","fj":"Na Vosa Vakaviti","fi":"Suomi","fr":"Français","fy":"Frysk","ff":"ࢻُلْࢻُلْدٜ","gd":"Gàidhlig","gl":"Galego","lg":"Luganda","ka":"ქართული","de":"Deutsch","el":"Νέα Ελληνικά","kl":"Kalaallisut","gn":"Avañe'ẽ","gu":"ગુજરાતી","ht":"Kreyòl ayisyen","ha":"هَرْشٜن هَوْس","haw":"ʻōlelo Hawaiʻi","he":"עברית","hz":"Otjiherero","hi":"हिन्दी","ho":"Hiri Motu","hu":"Magyar nyelv","is":"Íslenska","io":"Ido","ig":"ásụ̀sụ́ Ìgbò","id":"bahasa Indonesia","ia":"Interlingua","ie":"Interlingue; Occidental","iu":"ᐃᓄᒃᑎᑐᑦ","ik":"Iñupiaq","ga":"Gaeilge","it":"Italiano","ja":"日本語","jv":"ꦧꦱꦗꦮ","kn":"ಕನ್ನಡ","kr":"كَنُرِيِه","ks":"कॉशुर","kk":"Қазақша","km":"ខេមរភាសា","ki":"Gĩgĩkũyũ","rw":"Ikinyarwanda","ky":"Кыргыз","kv":"Коми кыв","kg":"Kikongo","ko":"한국어","kj":"Oshikwanyama","ku":"کوردی","lo":"ພາສາລາວ","la":"Latinum","lv":"Latviešu","li":"Lèmburgs","ln":"Lingála","lt":"Lietuvių","lu":"Kiluba","lb":"Lëtzebuergesch","mk":"Македонски","mg":"مَلَغَسِ","ms":"بهاس ملايو","ml":"മലയാളം","mt":"Malti","gv":"Gaelg","mi":"reo Māori","mr":"मराठी","mh":"kajin M̧ajel‌̧","mn":"ᠮᠣᠩᠭᠣᠯ ᠬᠡᠯᠡ","na":"dorerin Naoe","nv":"Diné bizaad","nd":"isiNdebele; saseNyakatho","nr":"isiNdebele; sakwaNdzundza","ng":"Ndonga","ne":"नेपाली भाषा","no":"Norsk","nb":"Norsk Bokmål","nn":"Norsk Nynorsk","oc":"Occitan; Provençal","oj":"ᐊᓂᔑᓈᐯᒧᐎᓐ","or":"ଓଡ଼ିଆ","om":"afaan Oromoo","os":"ирон Ӕвзаг","pi":"Pāli","ps":"پښتو","fa":"فارسی","pl":"Polski","pt":"Português","pa":"ਪੰਜਾਬੀ; پنجابی","qu":"Runa simi","ro":"Română","rm":"Rumantsch","rn":"Ikirundi","ru":"Русский язык","se":"Davvisámegiella","sm":"gagana Sāmoa","sg":"yângâ tî Sängö","sa":"संस्कृतम्","sc":"Sardu","sr":"Српски","sn":"chiShona","sd":"سنڌي; सिन्धी","si":"සිංහල","sk":"Slovenčina","sl":"Slovenščina","so":"Soomaali","st":"Sesotho","es":"Español","su":"basa Sunda","sw":"Kiswahili","ss":"siSwati","sv":"Svenska","tl":"Wikang Tagalog","ty":"reo Tahiti","tg":"Тоҷикӣ","ta":"தமிழ்","tt":"Татар теле","te":"తెలుగు","th":"ภาษาไทย","bo":"བོད་སྐད་","ti":"ትግርኛ","to":"lea faka-Tonga","ts":"Xitsonga","tn":"Setswana","tr":"Türkçe","tk":"Türkmençe","tw":"Twi","ug":"ئۇيغۇر تىلى","uk":"Українська","ur":"اُردُو","uz":"Ózbekça","ve":"Tshivenḓa","vi":"tiếng Việt","vo":"Volapük","wa":"Walon","cy":"Cymraeg","wo":"وࣷلࣷفْ","xh":"isiXhosa","ii":"ꆈꌠꉙ","yi":"ייִדיש","yo":"èdè Yorùbá","za":"話僮","zu":"isiZulu"},

  Translations: ['en', 'es']
};
