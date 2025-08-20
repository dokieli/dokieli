import Papa from 'papaparse';
import { domSanitize } from './util.js';
import { escapeCharacters } from './doc.js';

export function csvStringToJson(str) { 
  let json = Papa.parse(str);
  return json;
}

//https://www.w3.org/TR/tabular-data-model/
//https://www.w3.org/TR/csv2rdf/
//https://www.w3.org/TR/tabular-metadata/
export function jsonToHtmlTableString(csvTables, metadata) {

  metadata = metadata || {
    "@context": [
      "http://www.w3.org/ns/csvw",
      {
        "dpv": "https://w3id.org/dpv#",
        "risk": "https://w3id.org/dpv/risk#"
      },
      {"@language": "en"}
    ],
    "@id": "",
    "@type": "TableGroup",
    "tables": [
      {
        "url": "assessments.csv",
        "dcterms:title": [{"@value": "Dokieli Threat Modeling - STRIDE", "@language": "en"}],
        "dcat:keyword": [
          {"@value": "security risk", "@language": "en"},
          {"@value": "software security", "@language": "en"},
          {"@value": "software security assurance", "@language": "en"},
          {"@value": "threat modelling", "@language": "en"}
        ],
        "dcterms:publisher": {"@id": "https://dokie.li/#i"},
        "dcterms:license": {"@id": "https://creativecommons.org/licenses/by/4.0/"},
        "dcterms:modified": {"@value": "2025-08-20", "@type": "xsd:date"},
        "tableSchema": {
          "foreignKeys": [
            {
              "columnReference": "risk",
              "reference": {
                "resource": "risks.csv",
                "columnReference": "risk"
              }
            },
            {
              "columnReference": "mitigation",
              "reference": {
                "resource": "mitigations.csv",
                "columnReference": "mitigation"
              }
            }
          ],
          "aboutUrl": "#assessment/2025-08-20/{_row}",
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
              "valueUrl": "#{strideThreatType}",
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
          "primaryKey": "risk",
          "aboutUrl": "#{risk}",
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
              "propertyUrl": "dcterms:description"
            }
          ]
        }
      },
      {
        "url": "mitigations.csv",
        "tableSchema": {
          "primaryKey": "mitigation",
          "aboutUrl": "#{mitigation}",
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
              "propertyUrl": "dcterms:description"
            }
          ]
        }
      }
    ]
  }

  let language, url;

  const isPlainObject = (object) => {
    return Object.prototype.toString.call(object) === '[object Object]';
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
  if (!metadata.tables && !metadata.tables.length) { return }

  let tables = metadata.tables;
  console.log(tables)

  let caption = metadata['dcterms:title'] || metadata['@id'];
  let keywords = metadata['dcat:keyword'];
  let publisher = metadata['dcterms:publisher'];
  let creator = metadata['dcterms:creator'];
  let license = metadata['dcterms:license'];
  let modified = metadata['dcterms:modified'];

  let html = '';
  csvTables.forEach((obj) => {
    const tableMetadata = tables.find((table) => table.url === obj.url)
    const metadataColumns = tableMetadata.tableSchema.columns;
    const tableAboutUrl = tableMetadata.tableSchema.aboutUrl;

    let attributeTypeOf;
    let attributeProperty;
    let attributeHrefRel;
    let attributeAboutId;
    
    if (tableAboutUrl) {
      attributeAboutId = ` about="${tableAboutUrl}" id="${tableAboutUrl.slice(1)}"`;
    }

    const { data } = obj;
    if (!data || data.length === 0 ) return "<table></table>";
    const headers = data[0];
    const rows = data.slice(1);
  
  //TODO: strideThreatType S or Spoofing
  
    html += `<table>`;
    html += `<caption>${caption}</caption>`;
  
    html += `<thead><tr>`;
    headers.forEach(header => {
      header = escapeCharacters(domSanitize(header));
      html += `<th>${header}</th>`;
    });
    html += `</tr></thead>`;
  
    html += `<tbody>`;
    rows.forEach(row => {
      html += `<tr${attributeAboutId}>`;
      row.forEach((cell, i) => {
        const columnName = headers[i];
  
        const currentColumnMetadata = metadataColumns.find(col => col.name === columnName);
        if (!columnName) return;

        cell = escapeCharacters(domSanitize(cell));
        const metadataValueUrl = metadataColumns.valueUrl;
        const templateRegex = /#\{(.*?)\}/g;
        const variables = getUriTemplateVariables(metadataValueUrl);
        console.log(variables)
        let valueUrl = metadataValueUrl;
        variables?.forEach(variable => {
          if (!valueUrl) return;
          valueUrl = valueUrl.replace(templateRegex, getValueByHeader(row, headers, variable))
        })
console.log(valueUrl)
        const columnAboutUrl = currentColumnMetadata.aboutUrl;
        aboutUrl = columnAboutUrl || tableAboutUrl;

        if (aboutUrl) {
          attributeAboutId = ` about="${aboutUrl}" id="${aboutUrl.slice(1)}"`;
        }

        if (currentColumnMetadata.propertyUrl == 'rdf:type') {
          attributeTypeOf = ` typeof="${currentColumnMetadata.valueUrl}"`;
        }

        if (currentColumnMetadata.propertyUrl == 'dcterms:description') {
          attributeProperty = ` property="${currentColumnMetadata.propertyUrl}"`;
        }

        if (currentColumnMetadata.propertyUrl && currentColumnMetadata.valueUrl) {
          attributeHrefRel = `<a href="${currentColumnMetadata.valueUrl}" rel="${currentColumnMetadata.propertyUrl}">${currentColumnMetadata.valueUrl}</a>`;
        }

  let tr = `
    <tr${attributeAboutId}${attributeTypeOf}>
      <td>${risk}</td>
      <td${attributeProperty}>${description}</td>
    </tr>
  `;

        html += `<td property="${currentColumnMetadata.propertyUrl}">${cell}</td>`;

    'https://w3id.org/dpv/risk#Spoofing',
    'https://w3id.org/dpv/risk#IdentityFraud',
    'https://w3id.org/dpv/risk#IdentityTheft',
    'https://w3id.org/dpv/risk#PhishingScam'

`
<th>feature</th><th>strideThreatType</th><th>risk</th><th>riskLevel</th><th>mitigation</th><th>description</th><th>issue</th>
`
`
  <tbody>
    <tr about="${aboutUrl}">
      <td><a href="https://dokie.li/docs#feature-approving" rel="dcterms:subject">https://dokie.li/docs#feature-approving</td>
      <td rel="stride:threatType"><span resource="stride:Spoofing">S</a></span></td>
      <td><a href="#${risk}" rel="dpv:hasImpact">foo</a></td>
      <td></td>
      <td></td>
      <td></td>
      <td></td>
      <td></td>
      <td></td>
    </tr>
  </tbody>
`;







      });
  
      html += `</tr>`;
    });
    html += `</tbody>`;
  
    // html += "<tfoot>";
  
    // html += "</tfoot>";
  
    html += `</table>`;
  })

console.log(html)
  return html;
}

function getValueByHeader(row, headers, headerName) {
  const index = headers.indexOf(headerName);
  return index !== -1 ? row[index] : undefined;
}

//TODO: use https://www.npmjs.com/package/uri-templates instead :

function getUriTemplateVariables(uri) {
/*
{
  fill: [Function (anonymous)],
  fromUri: [Function (anonymous)],
  varNames: [ 'colour', 'shape' ],
  template: '/date/{colour}/{shape}/'
}
*/

  // return uriTemplates(uri)




  if (!uri) return;
  //uri = https://example.org/{foo}/{bar}/baz
  const matches = [...uri.matchAll(/#\{([^}]+)\}/g)].map(m => m[1]);
  //Output: ["foo", "bar"]
  return matches;
}