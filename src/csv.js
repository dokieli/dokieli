import Papa from 'papaparse';
import { domSanitize } from './util';

export function csvStringToJson(str) { 
  let json = Papa.parse(str);
  return json;
}

export function jsonToHtmlTableString(obj, csvFilename, metadata) {
  const dokieliStrideThreatModelCSVSchema = {
    "@context": ["http://www.w3.org/ns/csvw", {"@language": "en"}],
    "@type": "TableGroup",
    "tables": [
      {
        "url": "dokieli-stride-threat-modeling.csv",
        "dcterms:title": "Dokieli Threat Modeling - STRIDE",
        "dcat:keyword": ['security risk', 'software security', 'software security assurance', 'threat modelling'],
        "dcterms:publisher": "https://dokie.li/#i",
        "dcterms:license": {"@id": "https://creativecommons.org/licenses/by/4.0/"},
        "dcterms:modified": {"@value": "2025-08-19", "@type": "xsd:date"},
        "tableSchema": {
          "aboutUrl": "https://dokie.li/docs#assessment-2025-08-19-{_row}",
          "columns": [
            {
              "name": "feature",
              "titles": "Feature",
              "datatype": "string",
              "propertyUrl": "dcterms:subject",
              "valueUrl": "{feature}",
              "required": true
            },
            {
              "name": "strideThreatType",
              "titles": "STRIDE threat type",
              "datatype": "string",
              "aboutUrl": "#{risk}",
              "propertyUrl": "dpv:hasImpact",
              "valueUrl": "#{strideThreatType",
              "null": ["N/A", ""]
            },
            {
              "name": "risk",
              "titles": "Risk",
              "datatype": "string",
              "propertyUrl": "risk:hasRisk",
              "valueUrl": "#{risk}",
              "null": ["N/A", ""]
            },
            {
              "name": "riskLevel",
              "titles": "Risk level",
              "datatype": "string",
              "aboutUrl": "#{risk}",
              "propertyUrl": "risk:hasRiskLevel",
              "valueUrl": "https://w3id.org/dpv/risk#{riskLevel}",
              "null": ["N/A", ""]
            },
            {
              "name": "mitigation",
              "titles": "Mitigation",
              "datatype": "string",
              "aboutUrl": "#{risk}",
              "propertyUrl": "risk:isMitigatedByMeasure",
              "valueUrl": "#{mitigation}",
              "null": ["N/A", ""]
            },
            {
              "name": "description",
              "titles": "Description",
              "datatype": "string",
              "propertyUrl": "dcterms:description",
              "null": ["N/A", ""]
            },
            {
              "name": "issue",
              "titles": "Issue",
              "datatype": "string",
              "propertyUrl": "rdfs:seeAlso",
              "valueUrl": "{feature}",
              "null": ["N/A", ""]
            }
          ]
        }
      },
      {
        "url": "risks.csv",
        "tableSchema": {
          "columns": [
            {
              "name": "risk",
              "titles": "Risk",
              "datatype": "string",
              "propertyUrl": "rdf:type",
              "valueUrl": "dpv:Risk"
            },
            {
              "name": "description",
              "titles": "Description",
              "datatype": "string",
              "aboutUrl": "{risk}",
              "propertyUrl": "dcterms:description",
            }
          ]
        }
      },
      {
        "url": "mitigations.csv",
        "tableSchema": {
          "columns": [
            {
              "name": "mitigation",
              "titles": "Mitigation",
              "datatype": "string",
              "propertyUrl": "rdf:type",
              "valueUrl": "dpv:RiskMitigationMeasure"
            },
            {
              "name": "description",
              "titles": "Description",
              "datatype": "string",
              "aboutUrl": "{mitigation}",
              "propertyUrl": "dcterms:description",
            }
          ]
        }
      }
    ]
  }

  let language, url;

  const isPlainObject = (object) => {
    return Object.prototype.toString.call(value) === '[object Object]';
  }

  //http://www.w3.org/TR/tabular-data-model/
  if (metadata && metadata['@context'] && (metadata['@context'] == 'http://www.w3.org/ns/csvw' || metadata['@context'].includes('http://www.w3.org/ns/csvw') )) {
    if (Array.isArray(metadata['@context'])) {
      metadata['@context'].forEach(i => {
        if (isPlainObject(i)) {
          if (i['@language']) {
            language = i['@language'];
          }
        }
      })
    }
  }

  let caption = metadata['dc:title'] || metadata['@id'] || csvFilename;
  let keywords = metadata['dcat:keyword'];
  let publisher = metadata['dc:publisher'];
  let creator = metadata['dc:creator'];
  let license = metadata['dc:license'];
  let modified = metadata['dc:modified'];
  let columns = metadata['columns'];

  const { data } = obj;
  if (!data || data.length === 0) return "<table></table>";
  
  const headers = data[0];
  const rows = data.slice(1);

//TODO: strideThreatType S or Spoofing

  let html = "<table>";
  html += `<caption>${caption}</caption>`;

  html += "<thead><tr>";
  headers.forEach(header => {
    header = escapeHtml(domSanitize(header));
    html += `<th>${header}</th>`;
  });
  html += "</tr></thead>";

  html += "<tbody>";
  rows.forEach(row => {
    html += "<tr>";
    row.forEach((cell, i) => {
      const columnName = headers[i];
      const currentColumn = columns.find(col => col.name === columnName);
      cell = escapeHtml(domSanitize(cell));

      htmlAttribute = ''

      //TODO: aboutUrl
      //TODO: valueUrl

      if (currentColumn.datatype == 'string') {
        htmlAttribute
      }

      html += `<td${currentColumn.propertyUrl}>${cell}</td>`;
    });

    html += "</tr>";
  });
  html += "</tbody>";

  // html += "<tfoot>";

  // html += "</tfoot>";

  html += "</table>";

  return html;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
