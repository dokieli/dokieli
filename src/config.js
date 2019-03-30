'use strict'
/**
 * Configuration
 */
module.exports = {
  init: function() {
    if(document.body) {
      DO.U.initUser();
      DO.U.initCurrentStylesheet();
      DO.U.setPolyfill();
      DO.U.setDocRefType();
      DO.U.showRefs();
      DO.U.buttonClose();
      DO.U.highlightItems();
      DO.U.initDocumentActions();
      DO.U.getResourceInfo();
      DO.U.showTextQuoteSelector();
      DO.U.showDocumentInfo();
      DO.U.showFragment();
      DO.U.showRobustLinks();
      DO.U.setDocumentMode();
      DO.U.showInboxNotifications();
      DO.U.initMath();
    }
  },
  Inbox: {},
  Notification: {},
  Activity: {},
  Lang: document.documentElement.lang,
  DocRefType: '',
  RefType: {
    LNCS: { InlineOpen: '[', InlineClose: ']' },
    ACM: { InlineOpen: '[', InlineClose: ']' }
  },
  Stylesheets: [],
  User: {
    IRI: null,
    Role: null,
    UI: {},
    OIDC: false,
    WebIdDelegate: null
  },
  OidcPopupUrl: 'https://dokie.li/popup.html',
  LocalDocument: (document.location.protocol == 'file:'),
  UseStorage: false,
  AutoSaveId: '',
  AutoSaveTimer: 60000,
  AvatarSize: 48,
  DisableStorageButtons: '<button class="local-storage-disable-html" title="Disable local storage (temporary) in the browser"><svg class="fas fa-database fa-2x" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path d="M448 73.143v45.714C448 159.143 347.667 192 224 192S0 159.143 0 118.857V73.143C0 32.857 100.333 0 224 0s224 32.857 224 73.143zM448 176v102.857C448 319.143 347.667 352 224 352S0 319.143 0 278.857V176c48.125 33.143 136.208 48.572 224 48.572S399.874 209.143 448 176zm0 160v102.857C448 479.143 347.667 512 224 512S0 479.143 0 438.857V336c48.125 33.143 136.208 48.572 224 48.572S399.874 369.143 448 336z"/></svg>Local Storage</button>',
  EnableStorageButtons: '<button class="local-storage-enable-html" title="Enable local storage (temporary) in the browser"><svg class="fas fa-database fa-2x" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path d="M448 73.143v45.714C448 159.143 347.667 192 224 192S0 159.143 0 118.857V73.143C0 32.857 100.333 0 224 0s224 32.857 224 73.143zM448 176v102.857C448 319.143 347.667 352 224 352S0 319.143 0 278.857V176c48.125 33.143 136.208 48.572 224 48.572S399.874 209.143 448 176zm0 160v102.857C448 479.143 347.667 512 224 512S0 479.143 0 438.857V336c48.125 33.143 136.208 48.572 224 48.572S399.874 369.143 448 336z"/></svg>Local Storage</button>',
  CDATAStart: '//<![CDATA[',
  CDATAEnd: '//]]>',
  SortableList: false,
  GraphViewerAvailable: (typeof d3 !== 'undefined'),
  MathAvailable: (typeof MathJax !== 'undefined'),
  EditorAvailable: true,
  EditorEnabled: false,
  ContentEditable: false,
  WebExtension: ((window.chrome && chrome.runtime && chrome.runtime.id) || (typeof browser !== 'undefined' && browser.runtime && browser.runtime.id)),
  Editor: {
    headings: ["h1", "h2", "h3", "h4", "h5", "h6"],
    regexEmptyHTMLTags: /<[^\/>][^>]*><\/[^>]+>/gim,
    ButtonLabelType: 'fontawesome',
    DisableEditorButton: '<button class="editor-disable" title="Disable editor"><svg class="fas fa-i-cursor fa-2x" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 512"><path d="M256 52.048V12.065C256 5.496 250.726.148 244.158.066 211.621-.344 166.469.011 128 37.959 90.266.736 46.979-.114 11.913.114 5.318.157 0 5.519 0 12.114v39.645c0 6.687 5.458 12.078 12.145 11.998C38.111 63.447 96 67.243 96 112.182V224H60c-6.627 0-12 5.373-12 12v40c0 6.627 5.373 12 12 12h36v112c0 44.932-56.075 48.031-83.95 47.959C5.404 447.942 0 453.306 0 459.952v39.983c0 6.569 5.274 11.917 11.842 11.999 32.537.409 77.689.054 116.158-37.894 37.734 37.223 81.021 38.073 116.087 37.845 6.595-.043 11.913-5.405 11.913-12V460.24c0-6.687-5.458-12.078-12.145-11.998C217.889 448.553 160 444.939 160 400V288h36c6.627 0 12-5.373 12-12v-40c0-6.627-5.373-12-12-12h-36V112.182c0-44.932 56.075-48.213 83.95-48.142 6.646.018 12.05-5.346 12.05-11.992z"/></svg>Edit</button>',
    EnableEditorButton: '<button class="editor-enable" title="Enable editor"><svg class="fas fa-i-cursor fa-2x" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 512"><path d="M256 52.048V12.065C256 5.496 250.726.148 244.158.066 211.621-.344 166.469.011 128 37.959 90.266.736 46.979-.114 11.913.114 5.318.157 0 5.519 0 12.114v39.645c0 6.687 5.458 12.078 12.145 11.998C38.111 63.447 96 67.243 96 112.182V224H60c-6.627 0-12 5.373-12 12v40c0 6.627 5.373 12 12 12h36v112c0 44.932-56.075 48.031-83.95 47.959C5.404 447.942 0 453.306 0 459.952v39.983c0 6.569 5.274 11.917 11.842 11.999 32.537.409 77.689.054 116.158-37.894 37.734 37.223 81.021 38.073 116.087 37.845 6.595-.043 11.913-5.405 11.913-12V460.24c0-6.687-5.458-12.078-12.145-11.998C217.889 448.553 160 444.939 160 400V288h36c6.627 0 12-5.373 12-12v-40c0-6.627-5.373-12-12-12h-36V112.182c0-44.932 56.075-48.213 83.95-48.142 6.646.018 12.05-5.346 12.05-11.992z"/></svg>Edit</button>'
  },
  Button: {
    Close: '<button class="close" title="Close"><svg class="fas fa-times fa-2x" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 352 512"><path d="M242.72 256l100.07-100.07c12.28-12.28 12.28-32.19 0-44.48l-22.24-22.24c-12.28-12.28-32.19-12.28-44.48 0L176 189.28 75.93 89.21c-12.28-12.28-32.19-12.28-44.48 0L9.21 111.45c-12.28 12.28-12.28 32.19 0 44.48L109.28 256 9.21 356.07c-12.28 12.28-12.28 32.19 0 44.48l22.24 22.24c12.28 12.28 32.2 12.28 44.48 0L176 322.72l100.07 100.07c12.28 12.28 32.2 12.28 44.48 0l22.24-22.24c12.28-12.28 12.28-32.19 0-44.48L242.72 256z"/></svg></button>'
  },
  DOMNormalisation: {
    'selfClosing': ['area', 'base', 'basefont', 'br', 'col', 'colgroup', 'embed', 'hr', 'img', 'input', 'isindex', 'link', 'meta', 'param', 'source', 'wbr'],
    'skipAttributes': ['aria-multiline', 'contenteditable', 'data-medium-editor-editor-index', 'data-medium-editor-element', 'data-medium-focused', 'data-placeholder', 'medium-editor-index', 'role', 'spellcheck', 'style'],
    'sortAttributes': true,
    'skipNodeWithClass': 'do',
    'classWithChildText': {
      'class': '.do.ref',
      'element': 'mark'
    },
    'replaceClassItemWith': {
      'source': ['medium-editor-element', 'medium-editor-placeholder', 'on-document-menu'],
      'target': ''
    },
    'skipClassWithValue': ''
  },

  SelectorSign: {
    "*": "🔗",
    "aside": "|",
    "audio": "🔊",
    "code": "#",
    "dl": "☝",
    "dl#document-annotation-service": "※",
    "dl#document-created": "📅",
    "dl#document-in-reply-to": "⮪",
    "dl#document-identifier": "🚩",
    "dl#document-inbox": "📥",
    "dl#document-latest-version": "∼",
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
    "section#references": "☛",
    "section#related-work": "⌘",
    "section#results": "∞",
    "table": "𝄜",
    "video": "🎞"
  },

  DocumentItems: [
    'authors',
    'document-identifier',
    'document-created',
    'document-modified',
    'document-published',
    'document-original',
    'document-memento',
    'document-latest-version',
    'document-predecessor-version',
    'document-timegate',
    'document-timemap',
    'document-derived-from',
    'document-derived-on',
    'document-license',
    'document-inbox',
    'document-annotation-service',
    'document-in-reply-to',
    'document-rights',
    'document-resource-state',
    'document-status',
    'document-see-also',
    'table-of-contents',
    'table-of-figures',
    'table-of-tables',
    'table-of-abbrs',
    'abstract',
    'categories-and-subject-descriptors',
    'keywords',
    'general-terms',

    'introduction'
  ],

  CollectionItemsLimit: 20,
  ContextLength: 32,
  ProxyURL: ((window.location.hostname == 'localhost' || !navigator.onLine) ? window.location.protocol + '//' + window.location.host + '/proxy?uri=' : 'https://dokie.li/proxy?uri='),
  AuthEndpoint: ((window.location.hostname == 'localhost' || !navigator.onLine) ? window.location.protocol + '//' + window.location.host + '/' : 'https://dokie.li/'),
  NotificationLicense: 'https://creativecommons.org/publicdomain/zero/1.0/',
  License: {
    "https://creativecommons.org/publicdomain/zero/1.0/": {'name': 'CC0 1.0', 'description': 'Creative Commons CC0 1.0 Universal'},
    "https://creativecommons.org/licenses/by/4.0/": {'name': 'CC BY 4.0', 'description': 'Creative Commons Attribution 4.0 International'},
    "https://creativecommons.org/licenses/by-sa/4.0/": {'name': 'CC BY-SA 4.0', 'description': 'Creative Commons Attribution-ShareAlike 4.0 International'},
    "https://creativecommons.org/licenses/by-nc/4.0/": {'name': 'CC BY-NC 4.0', 'description': 'Creative Commons Attribution-NonCommercial 4.0 International'},
    "https://creativecommons.org/licenses/by-nd/4.0/": {'name': 'CC BY-ND 4.0', 'description': 'Creative Commons Attribution-NoDerivatives 4.0 International'},
    "https://creativecommons.org/licenses/by-nc-sa/4.0/": {'name': 'CC BY-NC-SA 4.0', 'description': 'Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International'},
    "https://creativecommons.org/licenses/by-nc-nd/4.0/": {'name': 'CC BY-NC-ND 4.0', 'description': 'Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 International'}
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

  AvailableMediaTypes: ['text/turtle', 'application/ld+json', 'application/rdf+xml', 'application/xhtml+xml', 'text/html'],

  AcceptBinaryTypes: ['image/png', 'image/jpeg', 'image/gif'],

  Prefixes: {
    'xsd': 'http://www.w3.org/2001/XMLSchema#',
    'rdf': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
    'as': 'https://www.w3.org/ns/activitystreams#',
    'oa': 'http://www.w3.org/ns/oa#',
    'schema': 'http://schema.org/'
  },

  Vocab: {
    "rdftype": { "@id": "http://www.w3.org/1999/02/22-rdf-syntax-ns#type", "@type": "@id", "@array": true },
    "rdffirst": { "@id": "http://www.w3.org/1999/02/22-rdf-syntax-ns#first", "@type": "@id" },
    "rdfrest": { "@id": "http://www.w3.org/1999/02/22-rdf-syntax-ns#rest", "@type": "@id" },
    "rdfvalue": "http://www.w3.org/1999/02/22-rdf-syntax-ns#value",
    "rdfslabel": { "@id": "http://www.w3.org/2000/01/rdf-schema#label" },
    "rdfsseeAlso": { "@id": "http://www.w3.org/2000/01/rdf-schema#seeAlso", "@type": "@id", "@array": true },

    "owlsameAs": { "@id": "http://www.w3.org/2002/07/owl#sameAs", "@type": "@id", "@array": true },

    "foafname": "http://xmlns.com/foaf/0.1/name",
    "foaffamilyName": "http://xmlns.com/foaf/0.1/familyName",
    "foafgivenName": "http://xmlns.com/foaf/0.1/givenName",
    "foafhomepage": { "@id": "http://xmlns.com/foaf/0.1/homepage", "@type": "@id" },
    "foafweblog": { "@id": "http://xmlns.com/foaf/0.1/weblog", "@type": "@id" },
    "foafimg": { "@id": "http://xmlns.com/foaf/0.1/img", "@type": "@id" },
    "foafdepiction": { "@id": "http://xmlns.com/foaf/0.1/depiction", "@type": "@id" },
    "foafnick": "http://xmlns.com/foaf/0.1/nick",
    "foafmaker": { "@id": "http://xmlns.com/foaf/0.1/maker", "@type": "@id" },
    "foafknows": { "@id": "http://xmlns.com/foaf/0.1/knows", "@type": "@id", "@array": true },

    "vcardfn": "http://www.w3.org/2006/vcard/ns#fn",
    "vcardfamilyname": "http://www.w3.org/2006/vcard/ns#family-name",
    "vcardgivenname": "http://www.w3.org/2006/vcard/ns#given-name",
    "vcardnickname": "http://www.w3.org/2006/vcard/ns#nickname",
    "vcardurl": { "@id": "http://www.w3.org/2006/vcard/ns#url", "@type": "@id" },
    "vcardphoto": { "@id": "http://www.w3.org/2006/vcard/ns#photo", "@type": "@id" },
    "vcardhasPhoto": { "@id": "http://www.w3.org/2006/vcard/ns#hasPhoto", "@type": "@id" },

    "schemaname": "http://schema.org/name",
    "schemafamilyName": "http://schema.org/familyName",
    "schemagivenName": "http://schema.org/givenName",
    "schemaurl": { "@id": "http://schema.org/url", "@type": "@id" },
    "schemaimage": { "@id": "http://schema.org/image", "@type": "@id" },
    "schemacreator": { "@id": "http://schema.org/creator", "@type": "@id", "@array": true },
    "schemaauthor": { "@id": "http://schema.org/author", "@type": "@id", "@array": true },
    "schemacontributor": { "@id": "http://schema.org/contributor", "@type": "@id", "@array": true },
    "schemaeditor": { "@id": "http://schema.org/editor", "@type": "@id", "@array": true },
    "schemainLanguage": "http://schema.org/inLanguage",
    "schemalicense": { "@id": "http://schema.org/license", "@type": "@id" },
    "schemacitation": { "@id": "http://schema.org/citation", "@type": "@id", "@array": true },
    "schemaknows": { "@id": "http://schema.org/knows", "@type": "@id", "@array": true },
    "schemadateCreated": "http://schema.org/dateCreated",
    "schemadateModified": "http://schema.org/dateModified",
    "schemadatePublished": "http://schema.org/datePublished",
    "schemaabstract": "http://schema.org/abstract",
    "schemadescription": "http://schema.org/description",
    "schemahasPart": { "@id": "http://schema.org/hasPart", "@type": "@id", "@array": true }, 
    "schemaisPartOf": { "@id": "http://schema.org/isPartOf", "@type": "@id", "@array": true },
    "schemaScholarlyArticle": { "@id": "http://schema.org/ScholarlyArticle" },

    "dctermstitle": "http://purl.org/dc/terms/title",
    "dctermsdescription": "http://purl.org/dc/terms/description",
    "dctermscreator": { "@id": "http://purl.org/dc/terms/creator", "@type": "@id", "@array": true },
    "dctermsdate": "http://purl.org/dc/terms/date",
    "dctermsissued": "http://purl.org/dc/terms/issued",
    "dctermscreated": "http://purl.org/dc/terms/created",
    "dctermslanguage": "http://purl.org/dc/terms/language",
    "dctermsrights": { "@id": "http://purl.org/dc/terms/rights", "@type": "@id" },
    "dctermsconformsTo": { "@id": "http://purl.org/dc/terms/conformsTo", "@type": "@id" },
    "dctermshasPart": { "@id": "http://purl.org/dc/terms/hasPart", "@type": "@id", "@array": true },
    "dctermsisPartOf": { "@id": "http://purl.org/dc/terms/isPartOf", "@type": "@id", "@array": true },

    "skosprefLabel": { "@id": "http://www.w3.org/2004/02/skos/core#prefLabel", "@type": "@id", "@array": true },

    "provgeneratedAtTime": "http://www.w3.org/ns/prov#generatedAtTime",

    "refPeriod": "http://purl.org/linked-data/sdmx/2009/dimension#refPeriod",
    "obsValue": "http://purl.org/linked-data/sdmx/2009/measure#obsValue",

    "biboauthorList": { "@id": "http://purl.org/ontology/bibo/authorList", "@type": "@id" },

    "pimstorage": { "@id": "http://www.w3.org/ns/pim/space#storage", "@type": "@id", "@array": true },
    "pimpreferencesFile": { "@id": "http://www.w3.org/ns/pim/space#preferencesFile", "@type": "@id" },

    "acldelegates" : { "@id": "http://www.w3.org/ns/auth/acl#delegates", "@type": "@id" },

    "solidpreferredProxy": "http://www.w3.org/ns/solid/terms#preferredProxy",
    "solidforClass": { "@id": "http://www.w3.org/ns/solid/terms#forClass", "@type": "@id" },
    "solidinstanceContainer": { "@id": "http://www.w3.org/ns/solid/terms#instanceContainer", "@type": "@id" },
    "solidpublicTypeIndex": { "@id": "http://www.w3.org/ns/solid/terms#publicTypeIndex", "@type": "@id" },
    "solidprivateTypeIndex": { "@id": "http://www.w3.org/ns/solid/terms#privateTypeIndex", "@type": "@id" },

    "oaAnnotation": { "@id": "http://www.w3.org/ns/oa#Annotation", "@type": "@id" },
    "oahasBody": { "@id": "http://www.w3.org/ns/oa#hasBody", "@type": "@id" },
    "oahasTarget": { "@id": "http://www.w3.org/ns/oa#hasTarget", "@type": "@id" },
    "oahasSource": { "@id": "http://www.w3.org/ns/oa#hasSource", "@type": "@id" },
    "oahasSelector": { "@id": "http://www.w3.org/ns/oa#hasSelector", "@type": "@id" },
    "oarefinedBy": { "@id": "http://www.w3.org/ns/oa#refinedBy", "@type": "@id" },
    "oaexact": "http://www.w3.org/ns/oa#exact",
    "oaprefix": "http://www.w3.org/ns/oa#prefix",
    "oasuffix": "http://www.w3.org/ns/oa#suffix",
    "oamotivatedBy": { "@id": "http://www.w3.org/ns/oa#motivatedBy", "@type": "@id" },
    "oaannotationService": { "@id": "http://www.w3.org/ns/oa#annotationService", "@type": "@id", "@array": true },

    "asinbox": { "@id": "https://www.w3.org/ns/activitystreams#inbox", "@type": "@id", "@array": true },
    "assubject": { "@id": "https://www.w3.org/ns/activitystreams#subject", "@type": "@id", "@array": true },
    "asobject": { "@id": "https://www.w3.org/ns/activitystreams#object", "@type": "@id", "@array": true },
    "astarget": { "@id": "https://www.w3.org/ns/activitystreams#target", "@type": "@id", "@array": true },
    "asrelationship": { "@id": "https://www.w3.org/ns/activitystreams#relationship", "@type": "@id", "@array": true },
    "ascontext": { "@id": "https://www.w3.org/ns/activitystreams#context", "@type": "@id", "@array": true },
    "asinReplyTo": { "@id": "https://www.w3.org/ns/activitystreams#inReplyTo", "@type": "@id", "@array": true },
    "asactor": { "@id": "https://www.w3.org/ns/activitystreams#actor", "@type": "@id" },
    "asupdated": "https://www.w3.org/ns/activitystreams#updated",
    "aspublished": "https://www.w3.org/ns/activitystreams#published",
    "assummary": "https://www.w3.org/ns/activitystreams#summary",
    "ascontent": "https://www.w3.org/ns/activitystreams#content",
    "asname": "https://www.w3.org/ns/activitystreams#name",
    "asimage": { "@id": "https://www.w3.org/ns/activitystreams#image", "@type": "@id" },
    "asoutbox": { "@id": "https://www.w3.org/ns/activitystreams#outbox", "@type": "@id", "@array": true },
    "asitems": { "@id": "https://www.w3.org/ns/activitystreams#items", "@type": "@id", "@array": true },
    "asorderedItems": { "@id": "https://www.w3.org/ns/activitystreams#orderedItems", "@type": "@id", "@array": true },
    "astotalItems": "https://www.w3.org/ns/activitystreams#totalItems",
    "asfirst": { "@id": "https://www.w3.org/ns/activitystreams#first", "@type": "@id" },
    "asnext": { "@id": "https://www.w3.org/ns/activitystreams#next", "@type": "@id" },
    "asCollection": { "@id": "https://www.w3.org/ns/activitystreams#Collection", "@type": "@id" },
    "asOrderedCollection": { "@id": "https://www.w3.org/ns/activitystreams#OrderedCollection", "@type": "@id" },
    "asAnnounce": { "@id": "https://www.w3.org/ns/activitystreams#Announce", "@type": "@id" },

    "siocreplyof": { "@id": "http://rdfs.org/sioc/ns#reply_of", "@type": "@id", "@array": true },
    "siocavatar": { "@id": "http://rdfs.org/sioc/ns#avatar", "@type": "@id" },

    "ldpinbox": { "@id": "http://www.w3.org/ns/ldp#inbox", "@type": "@id", "@array": true },
    "ldpcontains": { "@id": "http://www.w3.org/ns/ldp#contains", "@type": "@id", "@array": true },
    "ldpResource": { "@id": "http://www.w3.org/ns/ldp#Resource", "@type": "@id" },
    "ldpContainer": { "@id": "http://www.w3.org/ns/ldp#Container", "@type": "@id" },
    "ldpRDFSource": { "@id": "http://www.w3.org/ns/ldp#RDFSource", "@type": "@id" },
    "ldpImmutableResource": { "@id": "http://www.w3.org/ns/ldp#ImmutableResource", "@type": "@id" },

    "memOriginalResource": { "@id": "http://mementoweb.org/ns#OriginalResource", "@type": "@id" },
    "memMemento": { "@id": "http://mementoweb.org/ns#Memento", "@type": "@id" },
    "memoriginal": { "@id": "http://mementoweb.org/ns#original", "@type": "@id" },
    "memmemento": { "@id": "http://mementoweb.org/ns#memento", "@type": "@id" },
    "memtimegate": { "@id": "http://mementoweb.org/ns#timegate", "@type": "@id" },
    "memtimemap": { "@id": "http://mementoweb.org/ns#timemap", "@type": "@id" },

    "relpredecessorversion": { "@id": "https://www.w3.org/ns/iana/link-relations/relation#predecessor-version", "@type": "@id" },
    "rellatestversion": { "@id": "https://www.w3.org/ns/iana/link-relations/relation#latest-version", "@type": "@id" },

    "psodraft": { "@id": "http://purl.org/spar/pso/draft", "@type": "@id" },
    "psopublished": { "@id": "http://purl.org/spar/pso/published", "@type": "@id" }
  },

  SecretAgentNames: ['Abraham Lincoln', 'Admiral Awesome', 'Anonymous Coward', 'Believe it or not', 'Creative Monkey', 'Senegoid', 'Dog from the Web', 'Ekrub', 'Elegant Banana', 'Foo Bar', 'Lbmit', 'Lunatic Scholar', 'NahuLcm', 'Noslen', 'Okie Dokie', 'Samurai Cat', 'Vegan Superstar'],

  RefAreas: {"AF":"Afghanistan","A9":"Africa","AL":"Albania","DZ":"Algeria","AS":"American Samoa","L5":"Andean Region","AD":"Andorra","AO":"Angola","AG":"Antigua and Barbuda","1A":"Arab World","AR":"Argentina","AM":"Armenia","AW":"Aruba","AU":"Australia","AT":"Austria","AZ":"Azerbaijan","BS":"Bahamas, The","BH":"Bahrain","BD":"Bangladesh","BB":"Barbados","BY":"Belarus","BE":"Belgium","BZ":"Belize","BJ":"Benin","BM":"Bermuda","BT":"Bhutan","BO":"Bolivia","BA":"Bosnia and Herzegovina","BW":"Botswana","BR":"Brazil","BN":"Brunei Darussalam","BG":"Bulgaria","BF":"Burkina Faso","BI":"Burundi","CV":"Cabo Verde","KH":"Cambodia","CM":"Cameroon","CA":"Canada","S3":"Caribbean small states","KY":"Cayman Islands","CF":"Central African Republic","TD":"Chad","JG":"Channel Islands","CL":"Chile","CN":"China","CO":"Colombia","KM":"Comoros","CD":"Congo, Dem. Rep.","CG":"Congo, Rep.","CR":"Costa Rica","CI":"Cote d'Ivoire","HR":"Croatia","CU":"Cuba","CW":"Curacao","CY":"Cyprus","CZ":"Czech Republic","DK":"Denmark","DJ":"Djibouti","DM":"Dominica","DO":"Dominican Republic","Z4":"East Asia & Pacific (all income levels)","4E":"East Asia & Pacific (developing only)","C4":"East Asia and the Pacific (IFC classification)","EC":"Ecuador","EG":"Egypt, Arab Rep.","SV":"El Salvador","GQ":"Equatorial Guinea","ER":"Eritrea","EE":"Estonia","ET":"Ethiopia","XC":"Euro area","Z7":"Europe & Central Asia (all income levels)","7E":"Europe & Central Asia (developing only)","C5":"Europe and Central Asia (IFC classification)","EU":"European Union","FO":"Faeroe Islands","FJ":"Fiji","FI":"Finland","FR":"France","PF":"French Polynesia","GA":"Gabon","GM":"Gambia, The","GE":"Georgia","DE":"Germany","GH":"Ghana","GR":"Greece","GL":"Greenland","GD":"Grenada","GU":"Guam","GT":"Guatemala","GN":"Guinea","GW":"Guinea-Bissau","GY":"Guyana","HT":"Haiti","XE":"Heavily indebted poor countries (HIPC)","XD":"High income","XS":"High income: OECD","XR":"High income: nonOECD","HN":"Honduras","HK":"Hong Kong SAR, China","HU":"Hungary","IS":"Iceland","IN":"India","ID":"Indonesia","IR":"Iran, Islamic Rep.","IQ":"Iraq","IE":"Ireland","IM":"Isle of Man","IL":"Israel","IT":"Italy","JM":"Jamaica","JP":"Japan","JO":"Jordan","KZ":"Kazakhstan","KE":"Kenya","KI":"Kiribati","KP":"Korea, Dem. Rep.","KR":"Korea, Rep.","KV":"Kosovo","KW":"Kuwait","KG":"Kyrgyz Republic","LA":"Lao PDR","ZJ":"Latin America & Caribbean (all income levels)","XJ":"Latin America & Caribbean (developing only)","L4":"Latin America and the Caribbean","C6":"Latin America and the Caribbean (IFC classification)","LV":"Latvia","XL":"Least developed countries: UN classification","LB":"Lebanon","LS":"Lesotho","LR":"Liberia","LY":"Libya","LI":"Liechtenstein","LT":"Lithuania","XO":"Low & middle income","XM":"Low income","XN":"Lower middle income","LU":"Luxembourg","MO":"Macao SAR, China","MK":"Macedonia, FYR","MG":"Madagascar","MW":"Malawi","MY":"Malaysia","MV":"Maldives","ML":"Mali","MT":"Malta","MH":"Marshall Islands","MR":"Mauritania","MU":"Mauritius","MX":"Mexico","L6":"Mexico and Central America","FM":"Micronesia, Fed. Sts.","ZQ":"Middle East & North Africa (all income levels)","XQ":"Middle East & North Africa (developing only)","C7":"Middle East and North Africa (IFC classification)","XP":"Middle income","MD":"Moldova","MC":"Monaco","MN":"Mongolia","ME":"Montenegro","MA":"Morocco","MZ":"Mozambique","MM":"Myanmar","NA":"Namibia","NP":"Nepal","NL":"Netherlands","NC":"New Caledonia","NZ":"New Zealand","NI":"Nicaragua","NE":"Niger","NG":"Nigeria","M2":"North Africa","XU":"North America","MP":"Northern Mariana Islands","NO":"Norway","XY":"Not classified","OE":"OECD members","OM":"Oman","S4":"Other small states","S2":"Pacific island small states","PK":"Pakistan","PW":"Palau","PA":"Panama","PG":"Papua New Guinea","PY":"Paraguay","PE":"Peru","PH":"Philippines","PL":"Poland","PT":"Portugal","PR":"Puerto Rico","QA":"Qatar","RO":"Romania","RU":"Russian Federation","RW":"Rwanda","WS":"Samoa","SM":"San Marino","ST":"Sao Tome and Principe","SA":"Saudi Arabia","SN":"Senegal","RS":"Serbia","SC":"Seychelles","SL":"Sierra Leone","SG":"Singapore","SX":"Sint Maarten (Dutch part)","SK":"Slovak Republic","SI":"Slovenia","S1":"Small states","SB":"Solomon Islands","SO":"Somalia","ZA":"South Africa","8S":"South Asia","C8":"South Asia (IFC classification)","SS":"South Sudan","L7":"Southern Cone Extended","ES":"Spain","LK":"Sri Lanka","KN":"St. Kitts and Nevis","LC":"St. Lucia","MF":"St. Martin (French part)","VC":"St. Vincent and the Grenadines","C9":"Sub-Saharan Africa (IFC classification)","ZG":"Sub-Saharan Africa (all income levels)","ZF":"Sub-Saharan Africa (developing only)","A4":"Sub-Saharan Africa excluding South Africa","A5":"Sub-Saharan Africa excluding South Africa and Nigeria","SD":"Sudan","SR":"Suriname","SZ":"Swaziland","SE":"Sweden","CH":"Switzerland","SY":"Syrian Arab Republic","TJ":"Tajikistan","TZ":"Tanzania","TH":"Thailand","TL":"Timor-Leste","TG":"Togo","TO":"Tonga","TT":"Trinidad and Tobago","TN":"Tunisia","TR":"Turkey","TM":"Turkmenistan","TC":"Turks and Caicos Islands","TV":"Tuvalu","UG":"Uganda","UA":"Ukraine","AE":"United Arab Emirates","GB":"United Kingdom","US":"United States","XT":"Upper middle income","UY":"Uruguay","UZ":"Uzbekistan","VU":"Vanuatu","VE":"Venezuela, RB","VN":"Vietnam","VI":"Virgin Islands (U.S.)","PS":"West Bank and Gaza","1W":"World","YE":"Yemen, Rep.","ZM":"Zambia","ZW":"Zimbabwe"},
    Languages: {"ab":"аҧсуа","aa":"Afaraf","af":"Afrikaans","ak":"Akan","sq":"Shqip","am":"አማርኛ","ar":"العربية","an":"Aragonés","hy":"Հայերեն","as":"অসমীয়া","av":"Aвар","ae":"Avesta","ay":"Aymar","az":"Azərbaycanca","bm":"Bamanankan","ba":"башҡорт","eu":"Euskara","be":"Беларуская","bn":"বাংলা","bh":"भोजपुरी","bi":"Bislama","bs":"Bosanski","br":"Brezhoneg","bg":"български","my":"ဗမာစာ","ca":"Català","ch":"Chamoru","ce":"нохчийн мотт","ny":"chiCheŵa","zh":"中文","cv":"чӑваш чӗлхи","kw":"Kernewek","co":"Corsu","cr":"ᓀᐦᐃᔭᐍᐏᐣ","hr":"Hrvatski","cs":"Čeština","da":"Dansk","dv":"ދިވެހި","nl":"Nederlands","en":"English","eo":"Esperanto","et":"Eesti","ee":"Eʋegbe","fo":"Føroyskt","fj":"Vosa Vakaviti","fi":"Suomi","fr":"Français","ff":"Fulfulde","gl":"Galego","ka":"ქართული","de":"Deutsch","el":"Ελληνικά","gn":"Avañeẽ","gu":"ગુજરાતી","ht":"Kreyòl ayisyen","ha":"Hausa, هَوُسَ","he":"עברית","hz":"Otjiherero","hi":"हिन्दी","ho":"Hiri Motu","hu":"Magyar","ia":"Interlingua","id":"Bahasa Indonesia","ie":"Interlingue","ga":"Gaeilge","ig":"Asụsụ Igbo","ik":"Iñupiaq","io":"Ido","is":"Íslenska","it":"Italiano","iu":"ᐃᓄᒃᑎᑐᑦ","ja":"日本語","jv":"Basa Jawa","kl":"Kalaallisut","kn":"ಕನ್ನಡ","kr":"Kanuri","ks":"कश्मीरी","kk":"Қазақ тілі","km":"ភាសាខ្មែរ","ki":"Gĩkũyũ","rw":"Ikinyarwanda","ky":"кыргыз","kv":"коми кыв","kg":"KiKongo","ko":"한국어","ku":"Kurdî","kj":"Kuanyama","la":"Latina","lb":"Lëtzebuergesch","lg":"Luganda","li":"Limburgs","ln":"Lingála","lo":"ພາສາລາວ","lt":"Lietuvių","lu":"Luba-Katanga","lv":"Latviešu","gv":"Gaelg","mk":"македонски","mg":"Malagasy","ms":"Bahasa Melayu","ml":"മലയാളം","mt":"Malti","mi":"te reo Māori","mr":"मराठी","mh":"Kajin M̧ajeļ","mn":"монгол","na":"Naoero","nv":"Diné bizaad","nb":"Norsk bokmål","nd":"isiNdebele","ne":"नेपाली","ng":"Owambo","nn":"Nynorsk","no":"Norsk","ii":"Sichuan Yi","nr":"isiNdebele","oc":"Occitan","oj":"ᐊᓂᔑᓈᐯᒧᐎᓐ","cu":"Словѣньскъ","om":"Afaan Oromoo","or":"ଓଡ଼ିଆ","os":"ирон æвзаг","pa":"ਪੰਜਾਬੀ","pi":"पाऴि","fa":"فارسی","pl":"Polski","ps":"پښتو","pt":"Português","qu":"Runa Simi","rm":"Rumantsch","rn":"kiRundi","ro":"Română","ru":"русский язык","sa":"संस्कृतम्","sc":"sardu","sd":"सिन्धी","se":"Davvisámegiella","sm":"Gagana Samoa","sg":"Sängö","sr":"српски","gd":"Gàidhlig","sn":"chiShona","si":"සිංහල","sk":"slovenčina","sl":"slovenščina","so":"Soomaaliga","st":"Sesotho","es":"Español","su":"Basa Sunda","sw":"Kiswahili","ss":"SiSwati","sv":"Svenska","ta":"தமிழ்","te":"తెలుగు","tg":"тоҷикӣ","th":"ไทย","ti":"ትግርኛ","bo":"བོད་ཡིག","tk":"Türkmen","tl":"Tagalog","tn":"Setswana","to":"faka Tonga","tr":"Türkçe","ts":"Xitsonga","tt":"татарча","tw":"Twi","ty":"Reo Tahiti","ug":"ئۇيغۇرچە‎","uk":"українська","ur":"اردو","uz":"O‘zbek","ve":"Tshivenḓa","vi":"Tiếng Việt","vo":"Volapük","wa":"Walon","cy":"Cymraeg","wo":"Wollof","fy":"Frysk","xh":"IsiXhosa","yi":"ייִדיש","yo":"Yorùbá","za":"Saɯ cueŋƅ"}
}
