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

import Config from './config.js';
import leaflet from 'leaflet';
import * as leafletGpx from 'leaflet-gpx';
const L = { ...leaflet, ...leafletGpx };
import { generateAttributeId, convertToISO8601Duration } from './util.js'
import { getAgentHTML, createDateHTML, setCopyToClipboard } from './doc.js'
import { fragmentFromString, selectArticleNode } from "./utils/html.js";
import { getResource } from './fetcher.js'
import { i18n } from './i18n.js';

let gpxTrkptDistance = 0;
//FIXME: Update RDF properties, datatypes, and other information that's temporarily marked/being used with ex:FIXME- below in gpxtpx.
//Extensions based on https://www8.garmin.com/xmlschemas/TrackPointExtensionv2.xsd
const gpxtpx = {
  'atemp': { 'label': 'measure.air-temperature.textContent', 'unitLabel': 'unit.degrees-celsius.textContent', 'property': 'ex:FIXME-atemp', 'datatype': 'xsd:double', 'xpathResultType': 'NUMBER_TYPE' },
  'wtemp': { 'label': 'measure.water-temperature.textContent', 'unitLabel': 'unit.degrees-celsius.textContent', 'property': 'ex:FIXME-wtemp', 'datatype': 'xsd:double', 'xpathResultType': 'NUMBER_TYPE' },
  'depth': { 'label': 'measure.depth.textContent', 'unitLabel': 'unit.meters.textContent', 'property': 'qudt-unit:Meter', 'datatype': 'xsd:double', 'xpathResultType': 'NUMBER_TYPE' },
  'hr': { 'label': 'measure.heart-rate.textContent', 'unitLabel': 'unit.beats-per-minute.textContent', 'property': 'qudt-unit:HeartBeatsPerMinute', 'datatype': 'xsd:unsignedByte', 'xpathResultType': 'NUMBER_TYPE' },
  'cad': { 'label': 'measure.cadence.textContent', 'unitLabel': 'unit.revolutions-per-minute.textContent', 'property': 'ex:FIXME-cadence', 'datatype': 'xsd:unsignedByte', 'xpathResultType': 'NUMBER_TYPE' },
  'speed': { 'label': 'measure.speed.textContent', 'unitLabel': 'unit.meters-per-second.textContent', 'property': 'schema:speed', 'datatype': 'xsd:double', 'xpathResultType': 'NUMBER_TYPE' },
  'course': { 'label': 'measure.course.textContent', 'unitLabel': 'unit.degrees-angle.textContent', 'property': 'ex:FIXME-course', 'datatype': 'xsd:decimal', 'xpathResultType': 'NUMBER_TYPE' },
  'bearing': { 'label': 'measure.bearing.textContent', 'unitLabel': 'unit.degrees-angle.textContent', 'property': 'ex:FIXME-bearing', 'datatype': 'xsd:decimal', 'xpathResultType': 'NUMBER_TYPE' },
}


//FIXME: It should perhaps act more like an insert/append as opposed to replacing the body.
function generateGeoView(data) {
  gpxTrkptDistance = 0;

  var tmpl = document.implementation.createHTMLDocument('template');

  var parser = new DOMParser();
  data = data.replace(/<!DOCTYPE[^>]*>/i, '');
  var rootNode = parser.parseFromString(data, "text/xml");
  var contextNode = rootNode;

  //XXX: Allowing only one map (#geo) in the document for now but revisit when giving unique #id to each map.
  if (Config.Map) {
    Config.Map.off();
    Config.Map.remove();
    var mapNode = document.querySelector('[typeof="schema:Map"]');
    mapNode.parentNode.parentNode.removeChild(mapNode.parentNode);
  }

  var gpxActivity = getGPXActivityHTML(rootNode, contextNode);

  var prefixes = document.body.getAttribute('prefix') + ' wgs: http://www.w3.org/2003/01/geo/wgs84_pos# sdmx-dimension: http://purl.org/linked-data/sdmx/2009/dimension# sdmx-measure: http://purl.org/linked-data/sdmx/2009/measure# gi: http://reference.data.gov.uk/id/gregorian-instant/ qudt-unit: http://qudt.org/vocab/unit#';
  document.body.setAttribute('prefix', prefixes);

  var node = selectArticleNode(document);
  // document.body.replaceChildren(fragmentFromString('<main><article about="" typeof="schema:Article">' + gpxActivity + '</article></main>'));
  //TODO: If generateGeoView provides a node to append to, it should append to that node instead of the body:
  node.appendChild(fragmentFromString(gpxActivity));

  var table = node.querySelector('#geo table');
  table.insertAdjacentHTML('afterend', Config.Button.Clipboard);
  var button = table.nextElementSibling;
  setCopyToClipboard(table, button);

  const titleElement = document.querySelector('head title');
  if (titleElement) {
    titleElement.textContent = '';
  }

  //XXX: This (tmpl) is not really being used in the return?
  //XXX: Should this use domSanitize?
  tmpl.documentElement.setHTMLUnsafe(document.documentElement.getHTML());

  mapNode = document.querySelector('[typeof="schema:Map"]');
  var mapOptions = {
    'preferCanvas': true
  }
  var map = L.map(mapNode, mapOptions);
  Config['Map'] = map;
  
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    subdomains: 'abc',
    attribution: `${i18n.tDoc('geo.map-data.textContent')} &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> ${i18n.tDoc('geo.contributors.textContent')}, <a href="https://creativecommons.org/licenses/by-sa/2.0/">CC BY-SA 2.0</a>`
  }).addTo(map);
  // var nexrad = L.tileLayer.wms("http://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0r.cgi", {
  //     layers: 'nexrad-n0r-900913',
  //     format: 'image/png',
  //     transparent: true,
  //     attribution: "Weather data © 2012 IEM Nexrad"
  // });
  
  // https://github.com/mpetazzoni/leaflet-gpx
  // gpx = 'https://localhost:8443/gpx2rdf/data/2014-02-17-16-12-20.gpx';
  
  var gptOptions =  {
    async: true,
    joinTrackSegments: false,
    polyline_options: {
      color: '#f00',
      opacity: 0.75,
      weight: 3,
      lineCap: 'round'
    },
    markers: {
      startIcon: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACEAAAAtCAMAAAAX+PImAAABC1BMVEUAAAAAgAAAgAAAgAAAgAAAgAAAgAAAgAAAgAAAgAAAgAAAgAAAgAAAgAAAgAAAgAAAgAAAgAAAgAAAgAAAgAAAgAAAgAAAgAAAgAAAgAAAgAAAgAAAgAAAgAAAgAAAgAAAgAAAgAAAgAAAgAAAgAAAgAAAgAAAgAAAgAAAgAAAgAAAgAAAgAAAgAD///8AlAAAkgAAgQAAgwAAhgAAjQAAkAAAhwAElQQAigD7/fv3/PcfoR8LmQsAjABRtlFGskY8rTw0qjQAkQDx+fHp9unX7te+5L6W05ZjvmMUnRTi8+Lc8NzP68+q26qc1px0xXRAr0DM6szI6Mi04LSIzYhyxHJpwGkupy4spyzxfiXGAAAALXRSTlMA/QL59OffBr60qG9iDuzPujoJ746Ff3l0TUhAMycjGxJd18WunJhZLRgMZVI0U6/AAAACQklEQVQ4y32U53baQBBGR6L33k1zjZ0sLJJA9GoDjmt63v9JMrNarELs+4ODVvd8MxrtCmzU62opmg6no6VqU4VjQieFVI4JFH8qnwl5hUY+wJwkL+vgRK2kmJfTL6pDiMuAnqbrutaTMbGQLVgNaMM+J9YzXUj+8kGpioTekHcPcENjSK4NguaZCDDELUL8GTAkeAJEUQh9WjYny8XrxORvynmCnvOUSoiE1e5uMxo/PC9NUqiQ7wqNGLkDXDL3XzsWt7+meG1Qu5EbyEYogmrsN50D4xdT1glkoBG0IvjKSpApr9wKUWJQ8aNhYI3njpMnU3YShbgiivDJg8u4/YMhVCYMMTQ03uWLscsYzdEYonEGZWnMRx0Xv8mwM46N0V4aEYhLY7lxGeOFNPL0LKLT++8u426Cho5DbUOd5jHDR3txlfkp5x78BIk0GjrHkK1D+EYRBrWRBSjKqfPVo11jiQLHIiwGAJkcjZ1W/j6NrS5/rLh8c0Hazzfi1c2o7nSx2z5ud/MpCWua+YUKSNv3tkF4d3o/xV8SqEayBkQrzGSKJQn6JLBoFgRXfoWUQd/eyTONyQhB4pyhQo6x5kh/SPdx7TIEkkyAKYo8UvJE4QJN64BaVAhmQ5e+Mthch5nihaVb4KAWYF4hUHMf/rLPY/hKKrhIRJk7ItICD/WUU6ETe0Ql6VD8cThGLTlayctxv9cKCzfhvzRSTDaRAS/2x8jVxDHqZz9NohCCdwkVsduLBHxAtuBLN+FDWgXvqP4Bkoed0xIT03MAAAAASUVORK5CYII=',
      endIcon: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACEAAAAtCAMAAAAX+PImAAABAlBMVEUAAADGQkLGQkLGQkLGQkLGQkLGQkLGQkLGQkLGQkLGQkLGQkLGQkLGQkLGQkLGQkLGQkLGQkLGQkLGQkLGQkLGQkLGQkLGQkLGQkLGQkLGQkLGQkLGQkLGQkLGQkLGQkLGQkLGQkLGQkLGQkLGQkLGQkLGQkLGQkLGQkLGQkLGQkLGQkLGQkL///+3LCy4Li62KSnFQEDDPT3COzu7MjK9NDT9+Pi6MDC/NzfARUXBOTn+/PzUf3/Ob2/GV1e6NTX57e303t7iqKjYjIzLZGTJX1/78/P35+f14uLx19fx1NTtysrrxMTkrq7MaGjIXFzEUVG8PDznubnnuLjdnJy+Pz/5SaUvAAAALHRSTlMA/AL5Cgb08ObdurSoGg3sz75zbmM6joV/eVpNSEAzJyMSX+jh18SunJgtUvqwWL0AAAJBSURBVDjLfZN3e6JAEIcHsAXF3kssudRbAQFBjSWx5NLLle//VW5nWaUYff/hYZ+X3wyzu+AhKs1aSpblVK2piLBP9LSSjROGEM+WS9Gw0CkniJ/MdRv8iI0sCXP+U/QJxTPCGBimaRoDHlOI7oSe24AxsjRN1TRnaDIplt8qzQT7fqSpWzTLwKV4HRjKBRMsFdEpzDFx8eQUkOpO0LXxZr0Za/pOuUzjf56jMFQp8+W9bduPbx8sBQtJWKeA7gSXpr/6LncrTLSw3WQEIkmMcOjK9KG/xV5hCtY5K0HnxI3Q524CT1nrNAR3IA+NGH0OaY23vp8/Fu8kBUWBFdHHjwHj7pOGTKiRgwI1DE3V13bAuJ1RY0SNC8hzY3bbDzBFg2ccN5JQ5MbHQ0Cw37lRxn9h4/h6Dhj3Y50NROpBG+eBM18FyvzFIdOh/riBtEwNk77/e/EJzxhhuVOHKt9Zff7k1djofHcLAFCKY4hGlc/fttvl61ylDLFIGwC3jneiL96Xr08vy9kCD4iDM78SgVKXdgdEVxdfC9U7ZJkWIN0c4YoPBwWSigCjHhNQmTjeScYeeASSviRUQcdyNIo1whbo2nUUOKUEEQR+pQxjgN/jwsmNd+eqAkI88FXKg4eSI0IYInfBRytBwkKiBX7EvBQypJoIAdIpEoxIdiFEO+tX8Mbu0cj4lFgR9hFrvlbKfNyHWiE5Bb6lkyW8iRIcoOlOJdaDQ4jFOE6iEoWDRKu026s0HCFSkWQFjtKthEf1H+4TmsxXLEfyAAAAAElFTkSuQmCC',
      shadowUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAQAAAC0NkA6AAAELklEQVR4AWIYBaNgFIyCUTAKRsEoADRLF2uSFEEcwCMjpaRlfb9vcXeHK+5whjP+GuzzMFfuzBl3d4fx6ZK0iGC2exenC4d/tHdV/NL+bNTf2kf+ODLUFEF9X4sIMMip+tPIouX16FWLEROKYiXzAlh80FxQyWfQ6gL8w4gCvB53cJ/2OMZOJ8xIyEjYLeYiyGM2VOVp5rxLl9GKAP8RBEFdrqe60EaLAYM66KiTbjWjR1CMAEqQKprkKpWhjhTLDLQyn436nUukz9Ejc451dmLRZkOms9F0xuuwVwlPQ4Av2VGR98ex399N+txvxQP5NAIGMMdhWY6fBFozsUedcVOHBRbksh3Z7DbsV0Y0acKvEECxpiPxaBi11iBMOfNnvMUAAOaNJcSKAgR9mtmxh1xdmBJLXx2uUvlcEV2y4cSMNCMhICiAzMzrcdZPzU2s0nbyaZzX1BxZG9jq00xb7C/rkutcQ/1J/VxFZXbZRkNzAhQrWJwuFsoGoEkvuwvsTAfcVhOYI78trCrAM8ysmNR6lEcXTF4eh5pLLnORjGjWCQF5TgAszhYAI++B6+os+EZa2IUXABTIso3HC+xmMRnh1E7Hk0+mapQqKcixBUx4cg7zoIAgIUlErxrcOXPTb/KO7sB/nICWzgSUx8PO1WdNPtr3yZQmeUQFWdCsfzJ+QUYG0hmSCtxhc6T5phVPqcprDLJ8udQtCjSYfcWn9bcjGu8RVXKMgKcAFGBkJEuaIKnEUXpoj862d2SWuzY0CWgIgZm6BMFku1GYMhfiyLL5MWBIE5LNOpnMUYL41J3drM2kyW3bQwQCHkSuhwNqot7W1rCJBjQj4wJARtJksk4um2iiRB1Cf2nP3Uetabu+9ZAgL4hBJEiCs+BFyDDvrkAQgM0ccEnHItpog/Xkr+t3+22/04Nv/Sg2+RQxgAisyq4EtnQRvSpOohgGQNH5BOBOAL7wyl/fH+sb33rrdaBYpgPpYwJeEIOIkmdgKkl62S9aNGvmrBBzuQeYUPqyt/29fdUpzz2FFEOC1OY5IPOCQWSRo7Ah1V5ZimQTihKdquB83evu/u5wZzrnfQixSZyYZvzxL4Eh5BZ4E2owotmQSbWiBFSGsnPd/e2xbtzZ3gUKmD7Mn9Mar/Iv2w8iokAdVZ8pB4pcYp8zAEbX39uc1h7oRp3zOu7GNmf6nC+X478BDCCLsCCnbAOyKKRrwg1t0Rzs9nv0IULeogP8MAOsLAEGkBdgDB1s88fR9jrUfG9y/aSbdpWHAHmSP+QnGERgOGbZReuwxbOUPeQ7ZJSLtM8f6DFMUpXfoAf4+uH+gzNRAC0jfRDOkmtUSzVVCQLElGf0ND8pIPC7o+Q3/1nVL9novLU6SkEVTQlTpK/ojwEDyIN4ud7RQY9VI5lPY+A36Cn+/cAwMpz/G/IdAqGyx1q2VHAAAAAASUVORK5CYII=',
      wptIcons: {
      '': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACEAAAAzCAMAAAAuJJHNAAAAkFBMVEUAAAAAru8Aru8Aru8Aru8Aru8Aru8Aru8Aru8Aru8Aru8Aru8Aru8Aru8Aru8Aru8Aru8Aru8Aru8Aru8Aru8Aru8Aru8Aru8Aru8Aru8Aru8Aru8Aru8Aru8Aru8Aru8Aru8Aru8Aru8Aru8Aru8Aru8Aru8Aru8Aru8Aru8Aru8Aru8Aru8Aru8Aru8Aru9ovJP8AAAAL3RSTlMA+AT68Fr0FA8H3MSXQDkL6+bg1o6CUkcxwbitbV8sJyQZz76neH1yTB6yolWHaUf8FCEAAAGESURBVDjLfdTnloIwEAXgmyxVKUoTxLWsvezO+7/dqkgGDPH7B2dOuJkwQVe8Dgv7Fq48DIqjfJtYQggrGWczvcifXSxiTmXH6DkHFvWJeomOcky6dNYp+KEhiSrZbGlY+vqQzMikbuKGEzIRNu7klcwqD8BySmbiEXbRi18Hu/SLWAbIHSlOtpaQm30n2NjFhnvxtZd4srnB0xIlx5h7aMiAgxSYOdT6RivklwvYQqWI+CATVZHjWyW3uGIzUhW/uAkV1EYr4qgHRLy1nY+XvNt3l3frtFHDKe92CQTEj38egLhISZnHQNFpsqjyxWHuENs/cqdkNilxl5FZ7fPWdNwAvyaTHxdPhSCDIxqe6V8frfHCZ9OXo+WOh5dYAZ8XycHcypCC2YI0B3R5c31oz+g5Oe/tXKDPV2PDg/ImmmgzzYbuiEsMzWpEbBJiwJFYIMG03nO/NYXDpz7Mv1KjcmFQJvRgnWC0b2L6YENhR0t8cLLUgRjIgG8ig9U2xGdy/R7zH4uopdSUohgfAAAAAElFTkSuQmCC',
      }
    }
  }

  var x = new L.GPX(data, gptOptions)
    .on('loaded', e => {
      var gpx = e.target;
      // console.log(e);
      map.fitBounds(gpx.getBounds());
      
      var dtdd = [];
      
      var movingPace = gpx.get_moving_pace();
      if (movingPace) {
        var seconds = Math.floor(movingPace / 1000);
        var date = new Date(null);
        date.setSeconds(seconds);
        var utc = date.toUTCString();
        movingPace = utc.substr(utc.indexOf(':') - 2, 8)
        
        dtdd.push(`<dt>${i18n.tDoc('measure.average-pace.textContent')}</dt><dd>${movingPace} / <abbr title="${i18n.tDoc('unit.km.abbr.title')}">${i18n.tDoc('unit.km.abbr.textContent')}</abbr></dd>`);
      }
      
      var averageHR = gpx.get_average_hr();
      if (averageHR) {
        dtdd.push(`<dt>${i18n.tDoc('measure.average-heart-rate.textContent')}</dt><dd>${averageHR} <abbr title="${i18n.tDoc('unit.bpm.abbr.title')}">${i18n.tDoc('unit.bpm.abbr.textContent')}</abbr></dd>`);
      }
      
      // var distance = gpx.get_distance();
      // if (distance) {
      //   dtdd.push('<dt>Distance</dt><dd>' + distance + ' m</dd>');
      // }
      // var totalTime = gpx.get_total_time();
      // if (totalTime) {
      //   dtdd.push('<dt>Time</dt><dd>' + totalTime + ' ms</dd>');
      // }
      
      var elevationGain = gpx.get_elevation_gain();
      if (elevationGain) {
        dtdd.push(`<dt>${i18n.tDoc('measure.elevation-gain.textContent')}</dt><dd>${parseFloat(elevationGain.toFixed(2))} <abbr title="${i18n.tDoc('unit.m.abbr.title')}">${i18n.tDoc('unit.m.abbr.textContent')}</abbr></dd>`);
      }
      var elevationLoss = gpx.get_elevation_loss();
      if (elevationLoss) {
        dtdd.push(`<dt>${i18n.tDoc('measure.elevation-lost.textContent')}</dt><dd>${parseFloat(elevationLoss.toFixed(2))} <abbr title="${i18n.tDoc('unit.m.abbr.title')}">${i18n.tDoc('unit.m.abbr.textContent')}</abbr></dd>`);
      }
      document.querySelector('tfoot > tr > td [typeof="schema:ExerciseAction"]').insertAdjacentHTML('beforeend', dtdd.join(''));
    }).addTo(map);
  
  // var mapTrackStart = L.divIcon({className: 'map-track-start'});
  // var mapTrackEnd = L.divIcon({className: 'map-track-end'});
  // L.marker([46.94971829,7.457774797], {icon: mapTrackStart}).addTo(map).bindPopup('Start');
  // L.marker([46.949853993,7.458736704], {icon: mapTrackEnd}).addTo(map).bindPopup('End');
  
  L.control.scale({imperial: false}).addTo(map);
  
  // console.log(map)
  // console.log(leafletImage)
  // leafletImage(map, (err, canvas) => {
  //     var img = document.createElement('img');
  //     var dimensions = map.getSize();
  //     img.width = dimensions.x;
  //     img.height = dimensions.y;
  //     img.src = canvas.toDataURL();
  //     // document.getElementById('map').replaceChildren();
  //     document.body.appendChild(img);
  // });

  return Promise.resolve(tmpl);
}

function getXPathValue(rootNode, xpathExpression, contextNode, namespaceResolver, resultType) {
  var xpathResult = evaluateXPath(rootNode, xpathExpression, contextNode, namespaceResolver, resultType);
// console.log(xpathResult);

  switch(xpathResult.resultType) {
    case 0:
    default: //ANY_TYPE
      return xpathResult;
    case 1: //NUMBER_TYPE
      return xpathResult.numberValue;
    case 2: //STRING_TYPE
      return xpathResult.stringValue;
    case 3: //BOOLEAN_TYPE
      return xpathResult.booleanValue;
  }
}

function getGPXActivityHTML(rootNode, contextNode, options) {
  options = options || {};
  var html = '';
  var data = {};

  data['minLat'] = getXPathValue(rootNode, "/gpx:gpx/gpx:trk/gpx:trkseg/gpx:trkpt/@lat[not(. > ../../gpx:trkpt/@lat)][1]", contextNode, null, 'NUMBER_TYPE');
  data['minLon'] = getXPathValue(rootNode, "/gpx:gpx/gpx:trk/gpx:trkseg/gpx:trkpt/@lon[not(. > ../../gpx:trkpt/@lon)][1]", contextNode, null, 'NUMBER_TYPE');
  data['maxLat'] = getXPathValue(rootNode, "/gpx:gpx/gpx:trk/gpx:trkseg/gpx:trkpt/@lat[not(. < ../../gpx:trkpt/@lat)][1]", contextNode, null, 'NUMBER_TYPE');
  data['maxLon'] = getXPathValue(rootNode, "/gpx:gpx/gpx:trk/gpx:trkseg/gpx:trkpt/@lon[not(. < ../../gpx:trkpt/@lon)][1]", contextNode, null, 'NUMBER_TYPE');

  data['minEle'] = getXPathValue(rootNode, "/gpx:gpx/gpx:trk/gpx:trkseg/gpx:trkpt/gpx:ele[not(. > ../../gpx:trkpt/gpx:ele)][1]", contextNode, null, 'NUMBER_TYPE');
  data['maxEle'] = getXPathValue(rootNode, "/gpx:gpx/gpx:trk/gpx:trkseg/gpx:trkpt/gpx:ele[not(. < ../../gpx:trkpt/gpx:ele)][1]", contextNode, null, 'NUMBER_TYPE');
// console.log(data['maxEle'])
// console.log(data['minEle'])


  //Works but data is not always available
  // data['minLat'] = getXPathValue(rootNode, "/gpx:gpx/gpx:metadata/gpx:bounds/@minlat", contextNode, null, 'NUMBER_TYPE');
  // data['minLon'] = getXPathValue(rootNode, "/gpx:gpx/gpx:metadata/gpx:bounds/@minlon", contextNode, null, 'NUMBER_TYPE');
  // data['maxLat'] = getXPathValue(rootNode, "/gpx:gpx/gpx:metadata/gpx:bounds/@maxlat", contextNode, null, 'NUMBER_TYPE');
  // data['maxLon'] = getXPathValue(rootNode, "/gpx:gpx/gpx:metadata/gpx:bounds/@maxlon", contextNode, null, 'NUMBER_TYPE');

  data['startDate'] = getXPathValue(rootNode, "/gpx:gpx/gpx:trk/gpx:trkseg/gpx:trkpt[1]/gpx:time", contextNode, null, 'STRING_TYPE');
  data['endDate'] = getXPathValue(rootNode, "/gpx:gpx/gpx:trk/gpx:trkseg[last()]/gpx:trkpt[last()]/gpx:time", contextNode, null, 'STRING_TYPE');

  data['metadataBounds'] = data.minLon + ',' + data.minLat + ',' + data.maxLon + ',' + data.maxLat;
  data['dataset'] = data.startDate + ',' + data.endDate + ',' + data.metadataBounds;
  data['centreLat'] = (data.minLat + data.maxLat) / 2.0;
  data['centreLon'] = (data.minLon + data.maxLon) / 2.0;

  data['metadataBoundsURL'] = `https://www.openstreetmap.org/?minlon=${data.minLon}&amp;minlat=${data.minLat}&amp;maxlon=${data.maxLon}&amp;maxlat=${data.maxLat}`;

  //FIXME: I prefer to have this HTML by the table but right now this may be the simplest/best place to put it because lookupPlace needs to be called with lat/lon
  lookupPlace(data.centreLat, data.centreLon)
    .then(response => {
      setTimeout(() => {
        document.querySelector('[typeof="schema:ExerciseAction"]')
          .appendChild(fragmentFromString(`
                    <dt>${i18n.tDoc('geo.place.dt.textContent')}</dt>
                    <dd><a href="https://www.wikidata.org/entity/${response.details.extratags.wikidata}" rel="schema:exerciseCourse">${response.reverse.features[0].properties.name}</a> (<a about="https://www.wikidata.org/entity/${response.details.extratags.wikidata}" rel="schema:hasMap" href="${data.metadataBoundsURL}">${i18n.tDoc('geo.map.a.textContent')}</a>)</dd>
                  `))
      }, 3000);
    });

// console.log(data.metadataTime);
// console.log(data.minLat)
// console.log(data.minLon)
// console.log(data.maxLat)
// console.log(data.maxLon)
// console.log(data.startDate)
// console.log(data.endDate)
// console.log(data.metadataBounds)
// console.log(data.dataset)
// console.log(data.centreLat)
// console.log(data.centreLon)


  var start = new Date(data['startDate']).getTime();
  var end = new Date(data['endDate']).getTime();
  var seconds = Math.floor((end - start) / 1000);
  var date = new Date(null);
  date.setSeconds(seconds);
  var utc = date.toUTCString();
  data['duration'] = utc.substr(utc.indexOf(':') - 2, 8)
// [${data.startDate} ~ ${data.endDate}]

  var trksegContextNodes = contextNode.querySelectorAll('gpx trk trkseg');

  //XXX: I'm not sure what this accomplishes
  options['gpxtpx'] = {};
  Object.keys(gpxtpx).forEach(element => {
    options['gpxtpx'][element] = getXPathValue(rootNode, `gpx:trkpt[1]/gpx:extensions/gpxtpx:TrackPointExtension/gpxtpx:${element}`, trksegContextNodes[0], null, 'BOOLEAN_TYPE');
  });

  var datasetPublisher = '';
  data['datasetPublisher'] = (Config.User.IRI) ? Config.User.IRI : null;
  if (data['datasetPublisher']) {
    datasetPublisher = `
          <dl>
            <dt>${i18n.tDoc('geo.publisher.dt.textContent')}</dt>
            <dd rel="dcterms:publisher">${getAgentHTML({'omitImage': true})}</dd>
          </dl>`;
  }

  var datasetPublished = createDateHTML({ 'id': 'dataset-published', 'property': 'schema:datePublished' });

  //XXX: The user is not necessarily the performer of this activity! Is there a way to automatically find out?
  //TODO: as:origin, as:target
  var performedBy = '', performedByName = '';
  if (Config.User.IRI) {
    performedBy = `
          <dl rel="schema:hasPart" resource="#activity" typeof="as:Travel">
            <dt>${i18n.tDoc('geo.actor.dt.textContent')}</dt>
            <dd rel="as:actor">${getAgentHTML()}</dd>
          </dl>`;
  }

  var tfootColSpan = 4;
  var gpxtpxTH = [];
  var gpxtpxLI = [];
  Object.keys(gpxtpx).forEach(element => {
    if (options['gpxtpx'][element]) {
      tfootColSpan++;
      gpxtpxTH.push(`<th rel="qb:component" resource="#component/${data.dataset}/measure/${element}" typeof="qb:ComponentSpecification"><span rel="qb:componentProperty" resource="${gpxtpx[element].property}" typeof="qb:MeasureProperty"><span property="skos:prefLabel" rel="rdfs:subPropertyOf" resource="sdmx-measure:obsValue">${i18n.tDoc(gpxtpx[element].label)}</span></span></th>`);

      var p = gpxtpx[element].property;
      var propertyURI = Config.Prefixes[p.split(':')[0]] + p.split(':')[1];

      gpxtpxLI.push(`<li><a href="${propertyURI}">${i18n.tDoc(gpxtpx[element].label)}</a> (${i18n.tDoc(gpxtpx[element].unitLabel)})</li>`);
    }
  })
  gpxtpxTH = gpxtpxTH.join('');
  gpxtpxLI = gpxtpxLI.join('');

  var mapId = generateAttributeId();
  html = `
    <figure id="geo" rel="schema:hasPart" resource="#geo">
      <figcaption>${i18n.tDoc('geo.activity-at.figcaption.textContent')} <a href="${data.metadataBoundsURL}">${data.metadataBounds}</a> .</figcaption>
      <div class="do" id="${mapId}" typeof="schema:Map"></div>
      <details>
        <summary>${i18n.tDoc('geo.gps-details.summary.textContent')}</summary>
        <table id="cube/${data.dataset}">
          <caption>${i18n.tDoc('geo.activity-data-at.figcaption.textContent')} <a href="${data.metadataBoundsURL}">${data.metadataBounds}</a> .</caption>
          <thead id="structure/${data.dataset}" rel="schema:hasPart" resource="#structure/${data.dataset}" typeof="qb:DataStructureDefinition">
            <tr>
              <th rel="qb:component" resource="#component/${data.dataset}/dimension/time" typeof="qb:ComponentSpecification"><span rel="qb:componentProperty" resource="sdmx-dimension:timePeriod" typeof="qb:DimensionProperty"><span property="skos:prefLabel">${i18n.tDoc('geo.time.span.textContent')}</span></span></th>
              <th rel="qb:component" resource="#component/${data.dataset}/measure/latitude" typeof="qb:ComponentSpecification"><span rel="qb:componentProperty" resource="wgs:lat" typeof="qb:MeasureProperty"><span property="skos:prefLabel" rel="rdfs:subPropertyOf" resource="sdmx-measure:obsValue">${i18n.tDoc('geo.latitude.span.textContent')}</span></span></th>
              <th rel="qb:component" resource="#component/${data.dataset}/measure/longitude" typeof="qb:ComponentSpecification"><span rel="qb:componentProperty" resource="wgs:lon" typeof="qb:MeasureProperty"><span property="skos:prefLabel" rel="rdfs:subPropertyOf" resource="sdmx-measure:obsValue">${i18n.tDoc('geo.longitude.span.textContent')}</span></span></th>
              <th rel="qb:component" resource="#component/${data.dataset}/measure/altitude" typeof="qb:ComponentSpecification"><span rel="qb:componentProperty" resource="wgs:alt" typeof="qb:MeasureProperty"><span property="skos:prefLabel" rel="rdfs:subPropertyOf" resource="sdmx-measure:obsValue">${i18n.tDoc('geo.altitude.span.textContent')}</span></span></th>
${gpxtpxTH}
            </tr>
          </thead>`;
          let isFirstSegment = true;
          let tbodyId = ` id="dataset/${data.dataset}`;
          let tbodyTypeof = ` typeof="qb:DataSet"`;
          trksegContextNodes.forEach(trksegContextNode => {
html += `
          <tbody${isFirstSegment ? tbodyId : ''} rel="schema:hasPart" resource="#dataset/${data.dataset}"${isFirstSegment ? tbodyTypeof : ''}>` +
getGPXtrkptHTML(rootNode, trksegContextNode, data, options) + `
          </tbody>`;

          isFirstSegment = false;
        });
html += `
          <tfoot>
            <tr>
              <td about="#dataset/${data.dataset}" colspan="2">
                <p><a href="#dataset/${data.dataset}">${i18n.tDoc('geo.dataset.a.textContent')}</a> <a href="#structure/${data.dataset}">${i18n.tDoc('geo.structure.a.textContent')}</a>:</p>

                <dl>
                  <dt>${i18n.tDoc('geo.dimensions.dt.textContent')}</dt>
                  <dd><a href="http://purl.org/linked-data/sdmx/2009/dimension#timePeriod">${i18n.tDoc('geo.time.a.textContent')}</a> (ISO 8601)</dd>
                  <dt>${i18n.tDoc('geo.measures.dt.textContent')}</dt>
                  <dd>
                    <ul>
                      <li><a href="http://www.w3.org/2003/01/geo/wgs84_pos#lat">${i18n.tDoc('measure.latitude.textContent')}</a> (${i18n.tDoc('unit.decimal-degrees.textContent')})</li>
                      <li><a href="http://www.w3.org/2003/01/geo/wgs84_pos#lon">${i18n.tDoc('measure.longitude.textContent')}</a> (${i18n.tDoc('unit.decimal-degrees.textContent')})</li>
                      <li><a href="http://www.w3.org/2003/01/geo/wgs84_pos#alt">${i18n.tDoc('measure.altitude.textContent')}</a> (${i18n.tDoc('unit.meters.textContent')})</li>
${gpxtpxLI}
                    </ul>
                  </dd>
                </dl>
              ` + datasetPublished + datasetPublisher + performedBy + `
              </td>
              <td colspan="${tfootColSpan - 2}">
                <dl about="#activity/${data.dataset}" typeof="schema:ExerciseAction">
                  <dt>${i18n.tDoc('geo.distance.dt.title')}</dt>
                  <dd property="schema:distance">${roundValue(gpxTrkptDistance / 1000, 2)} <abbr title="${i18n.tDoc('unit.km.abbr.title')}">${i18n.tDoc('unit.km.abbr.textContent')}</abbr></dd>
                  <dt>${i18n.tDoc('geo.time.dt.title')}</dt>
                  <dd><time datatype="xsd:duration" datetime="${convertToISO8601Duration(data.duration)}" property="schema:activityDuration">${data.duration}</time></dd>
                </dl>
              </td>
            </tr>
          </tfoot>
        </table>
      </details>
    </figure>
`;
      // <img alt="" src="https://localhost:8443/proxy?uri=https://render.openstreetmap.org/cgi-bin/export?bbox=${data.metadataBounds}&amp;scale=12724&amp;format=svg&amp;layers=C" />
      // <object type="image/svg+xml" data="https://render.openstreetmap.org/cgi-bin/export?bbox=${data.metadataBounds}&amp;scale=12724&amp;format=svg&amp;layers=C"></object>

//TODO gpx/wpt, gpx/rte
// console.log(html)
  return html;
}

function getGPXtrkptHTML(rootNode, contextNode, data, options) {
  var html = '';
  var trkpt = getXPathValue(rootNode, "gpx:trkpt", contextNode, null, 'ORDERED_NODE_ITERATOR_TYPE');

  try {
    var xR = trkpt.iterateNext();
// console.log(xR)

    var lat1, lon1, ele1, lat2, lon2;

    while (xR) {
// console.log(xR)
      data['lat'] = getXPathValue(rootNode, "@lat", xR, null, 'NUMBER_TYPE');
      data['lon'] = getXPathValue(rootNode, "@lon", xR, null, 'NUMBER_TYPE');
      data['time'] = getXPathValue(rootNode, "gpx:time", xR, null, 'STRING_TYPE');
      // <!-- XXX: Is elevation value always present in GPX? -->
      data['ele'] = getXPathValue(rootNode, "gpx:ele", xR, null, 'NUMBER_TYPE');
      data['timePeriod'] = data.time.replace(/Z/, '');

      html += `
            <tr about="#dataset/${data.dataset}/${data.time};${data.lat},${data.lon};${data.ele}" typeof="qb:Observation">
              <td rel="sdmx-dimension:timePeriod" resource="gi:${data.timePeriod}">${data.time}</td>
              <td datatype="xsd:decimal" property="wgs:lat">${data.lat}</td>
              <td datatype="xsd:decimal" property="wgs:lon">${data.lon}</td>
              <td datatype="xsd:decimal" property="wgs:alt">${data.ele}</td>
${getGPXextensionsHTML(rootNode, xR, data, options)}
              <td rel="qb:dataSet" resource="#dataset/${data.dataset}"></td>
            </tr>`;

      if (typeof lat1 !== 'undefined' && typeof lon1 !== 'undefined' && typeof ele1 !== 'undefined') {
        gpxTrkptDistance = gpxTrkptDistance + calculateDistance(lat1, lon1, ele1, data['lat'], data['lon'], data['ele']);
      }

      lat1 = data['lat'];
      lon1 = data['lon'];
      ele1 = data['ele'];

      xR = trkpt.iterateNext();
    }

    gpxTrkptDistance = gpxTrkptDistance + calculateDistance(lat1, lon1, ele1, data['lat'], data['lon'], data['ele']);
  }
  catch (e) {
    console.log('Error: Document tree modified during iteration ' + e);
  }

  return html;
}

function getGPXextensionsHTML(rootNode, contextNode, data, options) {
  var extensionsContextNode = contextNode.querySelector('extensions');

  var html = [];
  Object.keys(gpxtpx).forEach(element => {
    if (options['gpxtpx'][element]) {
      var value = getXPathValue(rootNode, "gpxtpx:TrackPointExtension/gpxtpx:" + element, extensionsContextNode, null, gpxtpx[element].xpathResultType);
      html.push(`<td datatype="${gpxtpx[element].datatype}" property="${gpxtpx[element].property}">${value}</td>`);
    }
  })

  return html.join('\n              ');
}

function namespaceMap(prefix) {
  var ns = {
    'xhtml' : 'http://www.w3.org/1999/xhtml',
    'mathml': 'http://www.w3.org/1998/Math/MathML',
    'gpx': 'http://www.topografix.com/GPX/1/1',
    'gpxx': 'http://www.garmin.com/xmlschemas/GpxExtensions/v3',
    'gpxtpx': 'http://www.garmin.com/xmlschemas/TrackPointExtension/v1'
  };
  return ns[prefix] || 'http://www.topografix.com/GPX/1/1';
}

// function normalisePath(xpathExpression) {
//   return xpathExpression.replace(/\//g, '/gpx:');
// },

function evaluateXPath(rootNode, xpathExpression, contextNode, namespaceResolver, resultType, result) {
  rootNode = rootNode || document;
  // xpathExpression = normalisePath(xpathExpression);
// console.log(xpathExpression)
  contextNode = contextNode || document;
  namespaceResolver = (typeof namespaceResolver == 'function') ? namespaceResolver : namespaceMap;
  // namespaceResolver = document.createNSResolver( contextNode.ownerDocument == null ? contextNode.documentElement : contextNode.ownerDocument.documentElement );
// console.log(namespaceResolver)
  resultType = XPathResult[resultType] || XPathResult.ANY_TYPE;
  // result = result || null;
// console.log(xpathExpression);
// console.log(contextNode);
// console.log(namespaceResolver);
// console.log(resultType);
// console.log(result);
  return rootNode.evaluate(xpathExpression, contextNode, namespaceResolver, resultType);
}

function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

//ECEF_WGS84, returns in meters
function calculateDistance(lat1, lon1, ele1, lat2, lon2, ele2) {
  // WGS84 ellipsoid constants
  const a = 6378137.0;        // semi-major axis (equatorial radius) in meters
  const f = 1 / 298.257223563; // flattening
  const e2 = 2 * f - f * f;    // eccentricity squared

  // Convert to radians
  const φ1 = toRadians(lat1);
  const λ1 = toRadians(lon1);
  const φ2 = toRadians(lat2);
  const λ2 = toRadians(lon2);

  // Prime vertical radius of curvature
  const N1 = a / Math.sqrt(1 - e2 * Math.sin(φ1) ** 2);
  const N2 = a / Math.sqrt(1 - e2 * Math.sin(φ2) ** 2);

  // ECEF coordinates
  const x1 = (N1 + ele1) * Math.cos(φ1) * Math.cos(λ1);
  const y1 = (N1 + ele1) * Math.cos(φ1) * Math.sin(λ1);
  const z1 = (N1 * (1 - e2) + ele1) * Math.sin(φ1);

  const x2 = (N2 + ele2) * Math.cos(φ2) * Math.cos(λ2);
  const y2 = (N2 + ele2) * Math.cos(φ2) * Math.sin(λ2);
  const z2 = (N2 * (1 - e2) + ele2) * Math.sin(φ2);

  // Euclidean distance in 3D space
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dz = z2 - z1;

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}


function roundValue(value, decimals) {
  return Number(Math.round(value + 'e' + decimals) + 'e-' + decimals);
}

async function lookupPlace(lat, lon) {
  const reverseURL = `https://nominatim.openstreetmap.org/reverse?format=geojson&zoom=10&lat=${lat}&lon=${lon}`;

  const headers = { 'Accept': 'application/json' };
  const options = { 'noCredentials': true };

  try {
    const reverseResponse = await getResource(reverseURL, headers, options);
    const reverseData = await reverseResponse.json();

    const osmId = reverseData.features[0].properties.osm_id;
    const osmType = reverseData.features[0].properties.osm_type.charAt(0).toUpperCase();

    const detailsURL = `https://nominatim.openstreetmap.org/details.php?format=json&osmtype=${osmType}&osmid=${osmId}`;
    const detailsResponse = await getResource(detailsURL, headers, options);
    const detailsData = await detailsResponse.json();

    return { 'reverse': reverseData, 'details': detailsData };
  } catch (error) {
    console.error('Error fetching or processing data:', error);
    throw error; // Rethrow the error to propagate it to the caller
  }
}

export {
  generateGeoView,
  getXPathValue,
  getGPXActivityHTML,
  getGPXtrkptHTML,
  getGPXextensionsHTML,
  namespaceMap,
  evaluateXPath,
  calculateDistance,
  roundValue,
  lookupPlace
}