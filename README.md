# dokieli

[dokieli](https://dokie.li/) is a clientside editor for decentralised article publishing, annotations, and social interactions.

It is built with the following principles in mind: freedom of expression, decentralisation, interoperability, and accessibility. There is no root, authority, or centralisation here. Control yourself!

Welcome! Check out the:

* [Code of Conduct](CODE-OF-CONDUCT.md)
* [Contributing Guide](CONTRIBUTING.md)
* [Documentation](https://dokie.li/docs)
* [Security Policy](SECURITY.md)
* [Roadmap](https://dokie.li/docs#roadmap)

## License

* Source code is licensed under the [Apache License, Version 2.0](http://www.apache.org/licenses/LICENSE-2.0).
* Unless otherwise noted, images and other media assets are licensed under the [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).

## Use

dokieli can be used as a:

* single-page application - open any dokieli embedded article
* browser extension - import dokieli from your Web browser's extensions (see also [instructions](https://dokie.li/docs).

## Setup

Clone your work repository, for example:

```sh
git clone git@github.com:YOUR-USERNAME/dokieli
cd dokieli
```

Install packages:

```sh
yarn
```

Make your code updates at `src/` , `media/` etc.

Build eg. to create `scripts/dokieli.js`:

```sh
yarn build
```

or automatically rebuild when files change:

```sh
yarn watch
```

or create a minified `scripts/dokieli.js`:

```sh
yarn minify
```

To serve static files, you can use any HTTP server, e.g.:

```sh
npx serve
```

For more details on our development process, including tests and code quality guidelines, see our [Contributing Guide](CONTRIBUTING.md)

## Documentation

* For brave developers and authors: the canonical [documentation](https://dokie.li/docs)
explains dokieli's principles, architectural and design patterns.

## Features

* In-browser document authoring and formatting, and semantic enrichments (RDFa annotations).
* Content negotiation is possible for RDFa, Turtle, JSON-LD, RDF/XML.
* Uses author's information from their online profile (WebID).
* Creation of new documents from any existing dokieli document - part of *self-replication*.
* Save document and its dependencies to a new location (anywhere on the Web given access) - part of *self-replication*.
* Open and edit URLs containing HTML.
* Individually assign the language of articles and annotations and parts within.
* Assignment of URI fragments (to any unit of significance) so that other resources on the Web can link to it.
* Implements versioning and has the notion of immutable resources.
* Embedding data blocks, e.g., Turtle, N-Triples, JSON-LD, TriG (Nanopublications).
* Embedding of media objects, tables, and interactions.
* Graph visualisation of linked data.
* Import GPX and extension data and view tracks on map.
* Automated references and citations (retrieves and reuses structured information).
* Insertion of table of contents, figures, tables, abbreviations.
* Drag and drop to reorganize the document's sections and table of contents.
* In-browser local storage, and document exporting.
* Message log.
* Document metadata.
* Views for screen and print (e.g., ACM, LNCS) - yes, you can output to a *paper user interface*: PDF
* .. and [many more on the way](https://github.com/dokieli/dokieli/issues/).

Let's make it so together! You are welcome to create [issues](https://github.com/dokieli/dokieli/issues/), [discuss](https://matrix.to/#/%23dokieli:matrix.org), or pull requests.

## Screencasts

* [Access request](https://dokie.li/media/video/dokieli-access-request.webm).
* [Annotating](https://dokie.li/media/video/dokieli-annotation.webm) and [sharing](https://dokie.li/media/video/dokieli-share.webm).
* Matching [resource's target audience with user's occupations](https://dokie.li/media/video/dokieli-audience-occupation.webm).
* [Citations](https://dokie.li/media/video/dokieli-citation.webm)
* [Generate and publish web feed](https://dokie.li/media/video/dokieli-generate-feed.webm).
* [Robustify links](https://dokie.li/media/video/dokieli-robustify-links.webm).
* [Sparqlines](https://dokie.li/media/video/dokieli-sparqlines.webm) towards better data journalism.
* Accessible [link tabbing, hover, and focus](https://dokie.li/media/video/dokieli-link-tabbing-hover-focus-click.webm).
* Bookmark [create](https://dokie.li/media/video/dokieli-annotation-bookmark-create.webm) and [read](https://dokie.li/media/video/dokieli-annotation-bookmark-read.webm).
* Open digital rights contrasting [storage description and personal policies](https://dokie.li/media/video/dokieli-odrl-storage-description.webm), [agreements and actions between people](https://dokie.li/media/video/dokieli-odrl.webm).
* Share an article by announcing it to [a contact from addressbook](https://dokie.li/media/video/dokieli-share.webm) and [entering a contact directly](https://dokie.li/media/video/dokieli-orcid-ldn-inbox.webm).
* Specification [requirements, test coverage, version diff, change log](https://dokie.li/media/video/dokieli-spec-conformance.webm).
* [Geo and statistical data](https://dokie.li/media/video/dokieli-geo-stats.webm) importing and viewing.

## Examples

See the growing list of [examples in the
wild](https://github.com/dokieli/dokieli/wiki#examples-in-the-wild). Add
the URLs of your articles or interactions to the list.

This repository is published and accessible from
[https://dokie.li/](https://dokie.li/). dokie.li is intended to demo and
exemplify what we can do with this technology. You are welcome to use and
experiment with dokieli there, or anywhere else you come across a dokieli
document.

For the scholars among us, see the authoring guidelines below. View the [ACM SIG Proceedings Paper](https://dokie.li/acm-sigproc-sp) using the [LNCS Author Guidelines](https://dokie.li/lncs-splnproc) (typographical rules), and vice versa (see the menu) ;)

## Specifications

* Information is represented and retrieved following the [Linked Data](https://www.w3.org/DesignIssues/LinkedData) design principles.
* [WebID](https://www.w3.org/2005/Incubator/webid/spec/identity/) for personal/agent identities.
* [WebID-TLS](https://www.w3.org/2005/Incubator/webid/spec/tls/) and [WebID-OIDC](https://github.com/solid/webid-oidc-spec) for authentication.
* [Web Access Control](https://solidproject.org/TR/wac)/ACL to set permissions on Web resources.
* W3C [Linked Data Platform](http://www.w3.org/TR/ldp/) and [Solid Protocol](https://solidproject.org/ED/protocol) servers to read and write Web resources.
* W3C [Linked Data Notifications](https://www.w3.org/TR/ldn/) for inbox notifications for annotations and social sharing.
* W3C [ActivityPub](https://www.w3.org/TR/activitypub/) client to read/write from/to profile's outbox.
* W3C [Web Annotation Model](https://www.w3.org/TR/annotation-model/), W3C [Web Annotation Vocabulary](https://www.w3.org/TR/annotation-vocab/), W3C [Embedding Web Annotations in HTML](https://www.w3.org/TR/annotation-html), and W3C [Selectors and States](https://www.w3.org/TR/selectors-states/) to model and identify annotations (eg. replies, peer-reviews, liking, resharing, bookmarking)
* W3C [Activity Streams 2.0 vocabulary](https://www.w3.org/TR/activitystreams-vocabulary) for social activities.
* W3C [ODRL Information Model](https://www.w3.org/TR/odrl-model/) and W3C [ODRL Vocabulary & Expression](https://www.w3.org/TR/odrl-vocab/) to represent statements about the usage of content and services.
* [Memento](https://tools.ietf.org/html/rfc7089) for resource management eg. TimeMap.
* [Creative Commons](https://creativecommons.org/) to assign license to individual contributions and annotations.
* [Robust Links](http://robustlinks.mementoweb.org/) for hyperlinks eg. citations, and to show Link Decoration.
* [schema.org](http://schema.org/), [SPAR Ontologies](http://www.sparontologies.net/), [PROV-O](https://www.w3.org/TR/prov-o/), and various other vocabularies.

## Supported By

* [NLnet](https://nlnet.nl/) (2024-02–present)

## Support the project

Help the project grow by sponsoring it on [Open Collective](https://opencollective.com/dokieli/) or reach out to us.

## Contributors

<a href="https://github.com/dokieli/dokieli/graphs/contributors">
<img src="https://opencollective.com/dokieli/contributors.svg?width=890" />
</a>

## Acknowledgements

The following organisations have supported a part of the research and development on dokieli:

* [Massachusetts Institute of Technology](https://web.mit.edu/) (2015–2016)
* [Qatar Computing Research Institute](https://www.hbku.edu.qa/en/qcri) (2015–2016)
* [Deutsche Forschungsgemeinschaft](https://www.dfg.de/) (2016–2017)
* [University of Bonn](https://www.uni-bonn.de/en) (2017)
* [TIB – Leibniz-Informationszentrum Technik und Naturwissenschaften](https://www.tib.eu/en/) (2017-2019)

We would also like to express our gratitude to the following individuals for their support:

* [Amy van der Hiel](https://github.com/amyvdh)
* [Andrei Vlad Sambra](https://github.com/deiu)
* [Ben Companjen](https://github.com/bencomp)
* [Benjamin Young](https://github.com/bigbluehat)
* [Christoph Braun](https://github.com/uvdsl)
* [Gerben Treora](https://github.com/treora)
* [Henry Story](https://github.com/bblfish)
* [Herbert Van de Sompel](https://github.com/hvdsomp)
* [Kingsley Idehen](https://github.com/kidehen)
* [Melvin Carvalho](https://github.com/melvincarvalho)
* [Patrick Hochstenbach](https://github.com/phochste)
* [Ruben Verborgh](https://github.com/RubenVerborgh)
* [Sandro Hawke](https://github.com/sandhawke)
* [Thomas Bergwinkl](https://github.com/bergos)
* [Tim Berners-Lee](https://github.com/timbl)
