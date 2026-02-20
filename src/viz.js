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
import { domSanitize, sanitizeInsertAdjacentHTML, sanitizeIRI } from "./utils/sanitization.js";


// Extract a short human-readable label from an IRI (last non-empty path/fragment segment)
function shortLabel(iri) {
  if (!iri || iri.startsWith('http://example.com/.well-known/genid/')) return '';
  const parts = iri.split(/[/#]/);
  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i]) return parts[i];
  }
  return iri;
}

// Return the best hover label for a node:
// - Literals (group 4): show the literal value, truncated to 50 chars
// - Named/blank nodes: last IRI path/fragment segment
function nodeLabel(d) {
  if (d.group === 4) {
    var val = d.id;
    return val.length > 50 ? val.slice(0, 47) + '\u2026' : val;
  }
  return shortLabel(d.id);
}

//Borrowed some of the d3 parts from https://bl.ocks.org/mbostock/4600693
export function showVisualisationGraph(url, data, selector, options) {
  url = url || currentLocation();
  url = stripUrlParamsFromString(url);
  url = sanitizeIRI(url);
  selector = selector || 'body';
  options = options || {};
  options['contentType'] = options.contentType || 'text/html';
  options['subjectURI'] = sanitizeIRI(options.subjectURI) || url;
  options['license'] = options.license || 'https://creativecommons.org/licenses/by/4.0/';
  options['language'] = options.language || 'en';
  options['creator'] = options.creator || 'https://dokie.li/#i';
  var width = options.width || '100%';
  var height = options.height || '100%';
  var nodeRadius = 7;
  var simulation;
  var canvasCleanup = null;    // cleanup fn for window-level canvas event listeners
  var currentGraphObject = null; // last built graph, used for on-demand SVG export

  var id = generateAttributeId();

  function positionLink(d) {
    return "M" + d[0].x + "," + d[0].y
          + "S" + d[1].x + "," + d[1].y
          + " " + d[2].x + "," + d[2].y;
  }

  function positionNode(d) {
    return "translate(" + d.x + "," + d.y + ")";
  }

  function showTooltip(e, content) {
    if (!content) return;
    content = content.trim();
    //TODO: if object has rdf:HTML datatype, appendChild
    tooltip.textContent = content.length > 120 ? content.slice(0, 117) + '…' : content;
    tooltip.style.display = 'block';
    // moveTooltip(e);
  }

  function moveTooltip(e) {
    // var x = e.clientX + 14;
    // var y = e.clientY + 14;
    // if (x + 440 > window.innerWidth) { x = e.clientX - 440; }
    // if (y + 80 > window.innerHeight) { y = e.clientY - 80; }
    // tooltip.style.left = x + 'px';
    // tooltip.style.top = y + 'px';
  }

  function hideTooltip() {
    tooltip.style.display = 'none';
  }

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

  var buttonClose = getButtonHTML({ key:'dialog.graph-view.close.button', button: 'close', buttonClass: 'close', iconSize: 'fa-2x' });

  if (selector == '#graph-view' && !document.getElementById('graph-view')) {
    document.body.appendChild(fragmentFromString(`
      <aside aria-labelledby="graph-view-label" class="do on" dir="${Config.User.UI.LanguageDir}" id="graph-view" lang="${Config.User.UI.Language}" rel="schema:hasPart" resource="#graph-view" xml:lang="${Config.User.UI.Language}">
        <h2 data-i18n="dialog.graph-view.h2" id="graph-view-label" property="schema:name">${i18n.t('dialog.graph-view.h2.textContent')} ${Config.Button.Info.GraphView}</h2>
        ${buttonClose}
        <div class="info"></div>
        <div id="graph-view-tooltip"></div>
      </aside>`));
  }

  let tooltip = document.getElementById('viz-tooltip');

  // var svg = d3.select(selector).append('svg')
  //   .attr('width', width)
  //   .attr('height', height)
  //   .attr('id', id)
  //   .attr('xmlns', 'http://www.w3.org/2000/svg')
  //   .attr('xml:lang', options.language)
  //   .attr('prefix', 'rdf: http://www.w3.org/1999/02/22-rdf-syntax-ns# rdfs: http://www.w3.org/2000/01/rdf-schema# xsd: http://www.w3.org/2001/XMLSchema# dcterms: http://purl.org/dc/terms/')
  //   .attr('typeof', 'http://purl.org/dc/dcmitype/Image')

  var graphView = document.querySelector(selector);
  if (getComputedStyle(graphView).position === 'static') {
    graphView.style.position = 'relative';
  }

  var containerStyle = graphView.ownerDocument.defaultView.getComputedStyle(graphView);
  width = options.width || parseInt(containerStyle.width) || 800;
  height = options.height || parseInt(containerStyle.height) - 128 || 600;
  
  graphView.addEventListener('click', (e) => {
    if (e.target.closest('button.export')) {
      if (!currentGraphObject) { return; }

      var exportOptions = {
        subjectURI: 'http://example.org/' + id,
        mediaType: 'image/svg+xml',
        filenameExtension: '.svg'
      }

      const documentOptions = {
        ...Config.DOMProcessing,
        format: true,
        sanitize: true,
        normalize: true
      };

      var svgNode = getDocument(generateExportSVG(currentGraphObject), documentOptions);
      exportAsDocument(svgNode, exportOptions);
    }
  });

  // var s = document.getElementById(id);
  // width = options.width || parseInt(s.ownerDocument.defaultView.getComputedStyle(s, null)["width"]);
  // height = options.height || parseInt(s.ownerDocument.defaultView.getComputedStyle(s, null)["height"]);

  function addLegend(go, target) {
    var graphLegend = target.append('g')
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

  function handleResource(iri, headers, options) {
    return getResource(iri, headers, options)
      .then(response => {
        var cT = response.headers.get('Content-Type');
        options['contentType'] = (cT) ? cT.split(';')[0].toLowerCase().trim() : 'text/turtle';

        return response.text().then(data => {
          options['mergeGraph'] = true;
          initiateVisualisation(options['subjectURI'], data, options);
        });
      })
  }


  function buildGraphObject(graph, options) {
    var graphObject = {};
    var nodes = graph.nodes;
    var nodeById = new Map();
    nodes.forEach(n => {
      nodeById.set(n.id, n);
    });
    var links = graph.links;
    var bilinks = [];

    var uniqueNodes = {};

    links.forEach(link => {
      var s = link.source = nodeById.get(link.source),
          t = link.target = nodeById.get(link.target),
          i = {}, // intermediate node for curved path
          predicate = link.value;

      nodes.push(i);

      // Fixed: use 'in' operator instead of > -1 (uniqueNodes stores objects, not numbers)
      if (s.id in uniqueNodes) {
        s = uniqueNodes[s.id];
      } else {
        uniqueNodes[s.id] = s;
      }

      if (t.id in uniqueNodes) {
        t = uniqueNodes[t.id];
      } else {
        uniqueNodes[t.id] = t;
      }

      links.push({source: s, target: i}, {source: i, target: t});
      // Store predicate at index 3 for edge label tooltips
      bilinks.push([s, i, t, predicate]);
    });

    graphObject = {
      'nodes': nodes,
      'links': links,
      'bilinks': bilinks,
      'uniqueNodes': uniqueNodes,
      'resources': options.resources
    };

    return graphObject;
  }

  // Build a static SVG from current simulation positions for export.
  // Creates a detached element — never added to the live DOM.
  function generateExportSVG(go) {
    var exportContainer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    var exportSvg = d3.select(exportContainer)
      .attr('id', id)
      .attr('width', width)
      .attr('height', height)
      .attr('xmlns', 'http://www.w3.org/2000/svg')
      .attr('xml:lang', options.language)
      .attr('prefix', 'rdf: http://www.w3.org/1999/02/22-rdf-syntax-ns# rdfs: http://www.w3.org/2000/01/rdf-schema# xsd: http://www.w3.org/2001/XMLSchema# dcterms: http://purl.org/dc/terms/')
      .attr('typeof', 'http://purl.org/dc/dcmitype/Image');

    if ('title' in options) {
      exportSvg.append('title')
        .attr('property', 'dcterms:title')
        .text(options.title);
    }

    // Arrow marker
    exportSvg.append('defs')
      .append('marker')
        .attr('id', 'end')
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', nodeRadius + 6)
        .attr('refY', -1)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .attr('fill', group[2].color)
      .append('path')
        .attr('d', 'M0,-5L10,0L0,5');

    var gObjects = exportSvg.append('g').attr('class', 'graph-objects');

    // Links at their settled positions
    gObjects.selectAll(null)
      .data(go.bilinks.filter(function(d) { return d[0].x != null && d[2].x != null; }))
      .enter().append('path')
        .attr('fill', 'none')
        .attr('stroke', group[4].color)
        .attr('marker-end', 'url(#end)')
        .attr('d', positionLink);

    // Nodes at their settled positions
    var nodeData = Object.values(go.uniqueNodes).filter(function(d) { return d.x != null; });
    var nodeGroups = gObjects.selectAll(null)
      .data(nodeData)
      .enter()
      .append('a')
        .attr('href', function(d) {
          if ('type' in group[d.group] && group[d.group].type !== 'rdfs:Literal' && !d.id.startsWith('http://example.com/.well-known/genid/')) {
            return d.id;
          }
          return null;
        })
        .attr('rel', function() {
          if (this.getAttribute('href') === null) { return null; }
          return 'dcterms:references';
        })
      .append('g')
        .attr('class', 'node-group')
        .attr('transform', positionNode);

    nodeGroups.append('circle')
      .attr('r', nodeRadius)
      .attr('fill', function(d) { return group[d.group] ? group[d.group].color : '#fff'; })
      .attr('stroke', function(d) {
        if (d.visited) { return group[3].color; }
        if (d.group == 4) { return group[2].color; }
        return group[7].color;
      })
      .attr('stroke-width', 1.5);

    // Labels always visible in the export
    nodeGroups.append('text')
      .attr('x', nodeRadius + 3)
      .attr('y', 4)
      .attr('font-size', '10px')
      .attr('font-family', 'monospace')
      .attr('fill', 'rgba(220,220,220,0.9)')
      .text(function(d) { return nodeLabel(d); });

    addLegend(go, exportSvg);

    return exportContainer;
  }

  // Canvas renderer — always used for the live graph view.
  // Supports pan (drag) and zoom (wheel). Labels shown on hover only.
  function buildCanvasRenderer(go) {
    var container = document.querySelector(selector);

    var existingCanvas = container.querySelector('canvas.graph-canvas');
    if (existingCanvas) existingCanvas.remove();

    var canvas = document.createElement('canvas');
    canvas.id = id;
    canvas.className = 'graph-canvas';
    canvas.width = width;
    canvas.height = height;
    container.appendChild(canvas);

    // var cN = document.getElementById(id);
    // var containerStyle = cN.ownerDocument.defaultView.getComputedStyle(cN, null);
    // width = options.width || parseInt(containerStyle.width) || 800;
    // height = options.height || parseInt(containerStyle.height) || 600;

    sanitizeInsertAdjacentHTML(graphView, 'beforeend', `<button class="export" data-i18n="dialog.graph-view.export.button" title="${i18n.t('dialog.graph-view.export.button.title')}" type="button">${i18n.t('dialog.graph-view.export.button.textContent')}</button>`);

    var ctx = canvas.getContext('2d');
    var nodes = Object.values(go.uniqueNodes);

    // Pan/zoom transform state
    var tx = { x: 0, y: 0, scale: 1 };

    // Hover state — drives label rendering each frame
    var hoveredNode = null;
    var hoveredLink = null;

    // Pan gesture tracking
    var isPanning = false;
    var panStart = { x: 0, y: 0 };
    var dragMoved = false;

    // Sample a point on a quadratic bezier at parameter tt in [0,1]
    function sampleBezier(s, mid, t, tt) {
      var mx = mid.x != null ? mid.x : (s.x + t.x) / 2;
      var my = mid.y != null ? mid.y : (s.y + t.y) / 2;
      return {
        x: (1 - tt) * (1 - tt) * s.x + 2 * (1 - tt) * tt * mx + tt * tt * t.x,
        y: (1 - tt) * (1 - tt) * s.y + 2 * (1 - tt) * tt * my + tt * tt * t.y
      };
    }

    function drawArrowhead(fromX, fromY, toX, toY) {
      var angle = Math.atan2(toY - fromY, toX - fromX);
      var len = 8;
      ctx.beginPath();
      ctx.moveTo(toX, toY);
      ctx.lineTo(toX - len * Math.cos(angle - Math.PI / 6), toY - len * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(toX - len * Math.cos(angle + Math.PI / 6), toY - len * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fill();
    }

    function drawPill(text, x, y) {
      ctx.font = 'bold 16px monospace';
      var tw = ctx.measureText(text).width;
      ctx.fillStyle = 'rgba(20,20,20,0.88)';
      ctx.beginPath();
      ctx.roundRect(x - 3, y - 13, tw + 6, 16, 3);
      ctx.fill();
      ctx.fillStyle = '#eee';
      ctx.fillText(text, x, y);
    }

    function draw() {
      ctx.clearRect(0, 0, width, height);

      // Apply pan/zoom transform for the graph area
      ctx.save();
      ctx.translate(tx.x, tx.y);
      ctx.scale(tx.scale, tx.scale);

      // Draw links
      go.bilinks.forEach(function(d) {
        var s = d[0], mid = d[1], t = d[2];
        if (s.x == null || t.x == null) return;
        var mx = mid.x != null ? mid.x : (s.x + t.x) / 2;
        var my = mid.y != null ? mid.y : (s.y + t.y) / 2;
        var isHovered = d === hoveredLink;

        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.quadraticCurveTo(mx, my, t.x, t.y);
        ctx.strokeStyle = isHovered ? '#ff8800' : group[4].color;
        ctx.lineWidth = isHovered ? 2 / tx.scale : 1 / tx.scale;
        ctx.stroke();

        var tip = sampleBezier(s, mid, t, 0.95);
        var before = sampleBezier(s, mid, t, 0.88);
        ctx.fillStyle = isHovered ? '#ff8800' : group[2].color;
        drawArrowhead(before.x, before.y, tip.x, tip.y);

        // Edge label on hover — drawn at the midpoint of the curve
        if (isHovered && d[3]) {
          var midPt = sampleBezier(s, mid, t, 0.5);
          drawPill(shortLabel(d[3]), midPt.x, midPt.y);
        }
      });

      // Draw nodes
      nodes.forEach(function(d) {
        if (d.x == null) return;
        var isHovered = d === hoveredNode;
        var r = isHovered ? nodeRadius * 1.3 : nodeRadius;

        ctx.beginPath();
        ctx.arc(d.x, d.y, r, 0, 2 * Math.PI);
        ctx.fillStyle = group[d.group] ? group[d.group].color : '#fff';
        ctx.fill();

        var strokeColor = d.visited ? group[3].color : (d.group == 4 ? group[2].color : group[7].color);
        ctx.strokeStyle = isHovered ? '#fff' : strokeColor;
        ctx.lineWidth = isHovered ? 2.5 / tx.scale : 1.5 / tx.scale;
        ctx.stroke();

        // Label on hover for all node types (literals show their value)
        if (isHovered) {
          var label = nodeLabel(d);
          if (label) {
            drawPill(label, d.x + r + 4, d.y + 4);
          }
        }
      });

      ctx.restore();

      // Legend is drawn outside the transform — fixed top-left position
      drawCanvasLegend(go);
    }

    function drawCanvasLegend(go) {
      var x = 12, y = 20;
      ctx.font = '16px monospace';
      ctx.fillStyle = '#000';
      ctx.fillText('Resources: ' + go.resources.join(', '), x, y);
      ctx.fillText('Statements: ' + go.bilinks.length, x, y + 22);
      ctx.fillText('Nodes: ' + nodes.length + ' (unique)', x, y + 44);
      ctx.fillText('Creator: ' + options.creator, x, y + 66);
      ctx.fillText('License: ' + options.license, x, y + 88);

      const legendInfo = {};
      Object.keys(legendCategories).forEach(g => {
        legendInfo[g] = { ...legendCategories[g], count: 0 };
      });
      go.nodes.forEach(function(node) {
        if (node.group && legendInfo[node.group]) legendInfo[node.group].count++;
      });

      var legendY = y + 132;
      Object.keys(legendInfo).forEach(function(g, i) {
        ctx.beginPath();
        ctx.arc(x + nodeRadius, legendY + i * 22, nodeRadius, 0, 2 * Math.PI);
        ctx.fillStyle = legendInfo[g].color;
        ctx.fill();
        ctx.fillStyle = legendInfo[g].color;
        ctx.fillText(legendInfo[g].label + ' (' + legendInfo[g].count + ')', x + nodeRadius * 2 + 4, legendY + i * 22 + 4);
      });
    }

    // Convert a mouse event to raw canvas pixel coords
    function rawCoords(e) {
      var rect = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) * (width / rect.width),
        y: (e.clientY - rect.top) * (height / rect.height)
      };
    }

    // Convert raw canvas coords to graph-space coords (inverse of pan/zoom transform)
    function graphCoords(e) {
      var raw = rawCoords(e);
      return {
        x: (raw.x - tx.x) / tx.scale,
        y: (raw.y - tx.y) / tx.scale
      };
    }

    function getNodeAt(x, y) {
      return nodes.find(function(d) {
        if (d.x == null) return false;
        var dx = d.x - x, dy = d.y - y;
        return dx * dx + dy * dy <= nodeRadius * nodeRadius;
      });
    }

    function getLinkAt(x, y) {
      var closest = null;
      // Scale hit tolerance inversely with zoom so it stays ~8px on screen
      var minDist = 8 / tx.scale;
      go.bilinks.forEach(function(d) {
        var s = d[0], mid = d[1], t = d[2];
        if (s.x == null || t.x == null) return;
        for (var j = 0; j <= 12; j++) {
          var pt = sampleBezier(s, mid, t, j / 12);
          var dist = Math.sqrt((pt.x - x) * (pt.x - x) + (pt.y - y) * (pt.y - y));
          if (dist < minDist) {
            minDist = dist;
            closest = d;
          }
        }
      });
      return closest;
    }

    // Zoom toward mouse cursor on wheel
    canvas.addEventListener('wheel', function(e) {
      e.preventDefault();
      var raw = rawCoords(e);
      var factor = e.deltaY < 0 ? 1.1 : 0.9;
      tx.x = raw.x - factor * (raw.x - tx.x);
      tx.y = raw.y - factor * (raw.y - tx.y);
      tx.scale = Math.max(0.05, Math.min(20, tx.scale * factor));
      draw();
    }, { passive: false });

    canvas.addEventListener('mousedown', function(e) {
      if (e.button !== 0) return;
      isPanning = true;
      dragMoved = false;
      panStart.x = e.clientX - tx.x;
      panStart.y = e.clientY - tx.y;
    });

    // Window-level listeners so pan continues when cursor leaves canvas
    function onWindowMouseMove(e) {
      if (!isPanning) return;
      var dx = e.clientX - panStart.x - tx.x;
      var dy = e.clientY - panStart.y - tx.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved = true;
      if (dragMoved) {
        tx.x = e.clientX - panStart.x;
        tx.y = e.clientY - panStart.y;
        hideTooltip();
        draw();
      }
    }

    function onWindowMouseUp() {
      isPanning = false;
    }

    window.addEventListener('mousemove', onWindowMouseMove);
    window.addEventListener('mouseup', onWindowMouseUp);

    canvas.addEventListener('mousemove', function(e) {
      if (isPanning && dragMoved) return;
      var pt = graphCoords(e);
      var node = getNodeAt(pt.x, pt.y);
      var link = node ? null : getLinkAt(pt.x, pt.y);

      var changed = (node !== hoveredNode) || (link !== hoveredLink);
      hoveredNode = node;
      hoveredLink = link;

      if (node) {
        showTooltip(e, node.id);
        // canvas.style.cursor = 'pointer';
      } else if (link && link[3]) {
        showTooltip(e, link[3]);
        // canvas.style.cursor = 'default';
      } else {
        hideTooltip();
        // canvas.style.cursor = 'default';
      }

      // Only redraw if hover target changed (sim may not be ticking any more)
      if (changed) draw();
    });

    canvas.addEventListener('mouseleave', function() {
      hoveredNode = null;
      hoveredLink = null;
      hideTooltip();
      draw();
    });

    canvas.addEventListener('click', function(e) {
      if (dragMoved) return; // was a pan gesture, not a click
      var pt = graphCoords(e);
      var d = getNodeAt(pt.x, pt.y);
      if (d && 'type' in group[d.group] && group[d.group].type !== 'rdfs:Literal' && !(d.id in Config.Graphs)) {
        options = options || {};
        options['subjectURI'] = d.id;
        var headers = { 'Accept': setAcceptRDFTypes() };
        if (d.id.slice(0, 5).toLowerCase() == 'http:') {
          options['noCredentials'] = true;
        }
        handleResource(d.id, headers, options);
      }
    });

    function cleanup() {
      window.removeEventListener('mousemove', onWindowMouseMove);
      window.removeEventListener('mouseup', onWindowMouseUp);
    }

    return { draw, cleanup };
  }


  // Unified simulation runner: wire links and call tickFn on every tick.
  // Works for both SVG (pass a fn that updates attrs) and canvas (pass draw).
  function runSimulation(graph, tickFn) {
    simulation.force("link").links(graph.links);
    simulation.on("tick", tickFn);
    simulation.on("end", tickFn); // one final draw after settling
  }

  function initiateVisualisation(url, data, options) {
    url = stripFragmentFromString(url);
    options.resources = ('resources' in options) ? uniqueArray(options.resources.concat(url)) : [url];

    // Stop any previous simulation before rebuilding
    if (simulation) { simulation.stop(); }

    return getVisualisationGraphData(url, data, options).then(
      function(graph) {
        var graphObject = buildGraphObject(graph, options);
        var uniqueNodeCount = Object.keys(graphObject.uniqueNodes).length;
        currentGraphObject = graphObject;

        // Faster convergence for larger graphs at the cost of slightly less optimal layout
        var alphaDecay = uniqueNodeCount > 500 ? 0.1 : uniqueNodeCount > 200 ? 0.05 : 0.025;

        simulation = d3.forceSimulation()
          .nodes(graph.nodes)
          .alphaDecay(alphaDecay)
          .force("link", d3.forceLink().distance(nodeRadius * 4).strength(0.25))
          .force('collide', d3.forceCollide().radius(nodeRadius * 2.5).strength(0.25))
          .force("center", d3.forceCenter(width / 2, height / 2));

        if ('mergeGraph' in options && options.mergeGraph) {
          if (canvasCleanup) { canvasCleanup(); canvasCleanup = null; }
          var container = document.querySelector(selector);
          var existingCanvas = container.querySelector('canvas.graph-canvas');
          if (existingCanvas) existingCanvas.remove();
        }

        var canvasRenderer = buildCanvasRenderer(graphObject);
        canvasCleanup = canvasRenderer.cleanup;
        runSimulation(graph, canvasRenderer.draw);
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
  // Use a Set for O(1) membership checks instead of O(n) array.includes()
  var graphNodes = new Set();

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
      if (!graphNodes.has(t.subject.value)) {
        graphNodes.add(t.subject.value);
        graphData.nodes.push({"id": t.subject.value, "group": sGroup, "visited": sVisited });
      }

      if (!graphNodes.has(objectValue)) {
        if (t.object.value in Config.Resource) {
          // console.log(t.object.value)
          Config.Resource[t.object.value].graph.out(ns.rdf.type).values.forEach(type => {
            if (isActorType(type)) {
              // console.log(type)
              oGroup = 10
            }
          })
        }

        graphNodes.add(objectValue);
        graphData.nodes.push({"id": objectValue, "group": oGroup, "visited": oVisited });
      }
    // }

    graphData.links.push({"source": t.subject.value, "target": objectValue, "value": t.predicate.value});
  });
  // console.log(graphNodes)

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
