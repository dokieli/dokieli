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

import { exportAsDocument } from "./actions.js";
import { getDocument } from "./doc.js";
import { fragmentFromString, getDocumentContentNode } from "./utils/html.js";
import { getResource, setAcceptRDFTypes } from "./fetcher.js";
import { getButtonHTML } from "./ui/buttons.js";
import { stripFragmentFromString, stripUrlParamsFromString, currentLocation } from "./uri.js";
import { generateAttributeId, uniqueArray } from "./util.js";
import Config from "./config.js";
const ns = Config.ns;
import { filterQuads, getGraphFromData, getResourceGraph, isActorProperty, isActorType, processResources } from "./graph.js";
import rdf from 'rdf-ext';
import * as d3Selection from 'd3-selection';
import * as d3Force from 'd3-force';
const d3 = { ...d3Selection, ...d3Force };
import { i18n } from "./i18n.js";
import { domSanitize } from "./utils/sanitization.js";

//Borrowed some of the d3 parts from https://bl.ocks.org/mbostock/4600693
export function showVisualisationGraph(url, data, selector, options) {
  url = url || currentLocation();
  url = stripUrlParamsFromString(url);
  selector = selector || 'body';
  options = options || {};
  options['contentType'] = options.contentType || 'text/html';
  options['subjectURI'] = options.subjectURI || url;
  options['license'] = options.license || 'https://creativecommons.org/licenses/by/4.0/';
  options['language'] = options.language || 'en';
  options['creator'] = options.creator || 'https://dokie.li/#i';
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

  var buttonClose = getButtonHTML({ key:'dialog.graph-view.close.button', button: 'close', buttonClass: 'close', iconSize: 'fa-2x' });

  if (selector == '#graph-view' && !document.getElementById('graph-view')) {
    document.body.appendChild(fragmentFromString(`
      <aside aria-labelledby="graph-view-label" class="do on" dir="${Config.User.UI.LanguageDir}" id="graph-view" lang="${Config.User.UI.Language}" rel="schema:hasPart" resource="#graph-view" xml:lang="${Config.User.UI.Language}">
        <h2 data-i18n="dialog.graph-view.h2" id="graph-view-label" property="schema:name">${i18n.t('dialog.graph-view.h2.textContent')} ${Config.Button.Info.GraphView}</h2>
        ${buttonClose}
        <div class="info"></div>
      </aside>`));
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
  graphView.insertAdjacentHTML('beforeend', `<button class="export" data-i18n="dialog.graph-view.export.button" title="${i18n.t('dialog.graph-view.export.button.title')}" type="button">${i18n.t('dialog.graph-view.export.button.textContent')}</button>`);
  graphView.addEventListener('click', (e) => {
    if (e.target.closest('button.export')) {
      var svgNode = graphView.querySelector('svg[typeof="http://purl.org/dc/dcmitype/Image"]');

      var options = {
        subjectURI: 'http://example.org/' + svgNode.id,
        mediaType: 'image/svg+xml',
        filenameExtension: '.svg'
      }

      const documentOptions = {
        ...Config.DOMProcessing,
        format: true,
        sanitize: true,
        normalize: true
      };

      svgNode = getDocument(svgNode.cloneNode(true), documentOptions);

      exportAsDocument(svgNode, options);
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
      .text(Config.License[options.license].name)

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
          if ('type' in group[d.group] && group[d.group].type !== 'rdf:Literal' && !(d.id in Config.Graphs)) {
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

    return getVisualisationGraphData(url, data, options).then(
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
}

export function getVisualisationGraphData(url, data, options) {
  var requestURL = stripFragmentFromString(url);
  var documentURL = Config.DocumentURL;

  const documentOptions = {
    ...Config.DOMProcessing,
    removeNodesWithSelector: [],
    //TODO: You can always do it better!
    sanitize: true,
    normalize: true
  }

  if (typeof data == 'string') {
    return getGraphFromData(data, options)
      .then(g => {
        return convertGraphToVisualisationGraph(requestURL, g, options);
      });
  }
  else if (typeof data == 'object') {
    return convertGraphToVisualisationGraph(requestURL, data, options);
  }
  else if (typeof data == 'undefined') {
    if (Config.Resource[documentURL] && Config.Resource[documentURL].graph) {
      return convertGraphToVisualisationGraph(requestURL, Config.Resource[documentURL].graph, options);
    }
    else {
      data = getDocument(null, documentOptions);
      return getGraphFromData(data, options)
        .then(g => {
          return convertGraphToVisualisationGraph(requestURL, g, options);
        });
    }
  }
}

//TODO: Review grapoi
function convertGraphToVisualisationGraph(url, g, options){
  // console.log(g);
  Config['Graphs'] = Config['Graphs'] || {};

  var dataGraph = rdf.grapoi({ dataset: rdf.dataset().addAll(g.dataset)});
  var graphs = {};
  graphs[options['subjectURI']] = g;

  if ('mergeGraph' in options && options.mergeGraph) {
    graphs = Object.assign(Config.Graphs, graphs);
  }

  Config['Graphs'][options['subjectURI']] = g;

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

    if (Config.Graphs[t.subject.value]) {
      // sGroup = 1;
      sVisited = true;
    }
    if (Config.Graphs[t.object.value]) {
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
      // objectValue = htmlEncode(objectValue);
      objectValue = domSanitize(objectValue);
    }

    //XXX: Don't remember why this if was included but it seems to be problematic since it skips adding nodes where the object doesn't have a type. So commenting it out for now. Seems to work as expected.
    // if (!g.node(rdf.namedNode(t.object.value)).out(ns.rdf.type).values.length) {
      if (!graphNodes.includes(t.subject.value)) {
        graphNodes.push(t.subject.value);
        graphData.nodes.push({"id": t.subject.value, "group": sGroup, "visited": sVisited });
      }

      if (!graphNodes.includes(t.object.value)) {
        if (t.object.value in Config.Resource) {
          // console.log(t.object.value)
          Config.Resource[t.object.value].graph.out(ns.rdf.type).values.forEach(type => {
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
}

export function showGraph(resources, selector, options){
  if (!Config.GraphViewerAvailable) { return; }

  options = options || {};
  options['contentType'] = options.contentType || 'text/html';
  options['subjectURI'] = options.subjectURI || location.href.split(location.search||location.hash||/[?#]/)[0];

  if (Array.isArray(resources)) {
    showGraphResources(resources, selector, options);
  }
  else {
    var property = (resources && 'filter' in options && 'predicates' in options.filter && options.filter.predicates.length) ? options.filter.predicates[0] : ns.ldp.inbox.value;
    var iri = (resources) ? resources : location.href.split(location.search||location.hash||/[?#]/)[0];

    getLinkRelation(property, iri).then(
      function(resources) {
        showGraphResources(resources[0], selector, options);
      },
      function(reason) {
        console.log(reason);
      }
    );
  }
}

//TODO: Review grapoi
export function showGraphResources(resources, selector, options) {
  selector = selector || getDocumentContentNode(document);
  options = options || {};

  if (Array.isArray(resources)) {
    resources = uniqueArray(resources);
  }

  processResources(resources, options)
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
          showVisualisationGraph(options.subjectURI, dataset.toCanonical(), selector, options);
        });
  });
}
