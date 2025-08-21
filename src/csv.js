import Config from './config.js'
import Papa from 'papaparse';
import { domSanitize } from './util.js';
import { escapeCharacters } from './doc.js';
import uriTemplates from 'uri-templates';

export function csvStringToJson(str) {
  return Papa.parse(str.trim());
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
        "dcterms:title": [{"@value": "Risks", "@language": "en"}],
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
        "dcterms:title": [{"@value": "Mitigations", "@language": "en"}],
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

  const uriTemplateProperties = ['aboutUrl', 'propertyUrl', 'valueUrl'];

  const orderMap = metadata.tables.reduce((acc, table, index) => {
    acc[table.url] = index;
    return acc;
  }, {});

  csvTables = csvTables.sort((a, b) => {
    const ai = orderMap[a.url] ?? Number.MAX_SAFE_INTEGER;
    const bi = orderMap[b.url] ?? Number.MAX_SAFE_INTEGER;
    return ai - bi;
  });

  let html = '';

  let tablesList = {};

  csvTables.forEach((obj) => {
    const tableMetadata = tables.find((table) => table.url === obj.url);

    let caption = tableMetadata['dcterms:title'] || tableMetadata['url'] || tableMetadata['@id'];
    caption = Array.isArray(caption) ? caption[0] : caption;

    let keywordsHTML = JSONLDArrayToDL(tableMetadata['dcat:keyword'], 'Keywords', 'dcat:keyword');
    let publisher = tableMetadata['dcterms:publisher'];
    publisher = Array.isArray(publisher) ? publisher[0] : publisher;
    let license = tableMetadata['dcterms:license'];
    let modified = tableMetadata['dcterms:modified'];

    const metadataColumns = tableMetadata.tableSchema.columns;
    const metadataColumnsCount = metadataColumns.length;
    const tableSchemaAboutUrl = tableMetadata.tableSchema.aboutUrl;
    let foreignKeys = tableMetadata.tableSchema.foreignKeys
    foreignKeys = foreignKeys ? foreignKeys.map((foreignKeyObj) => foreignKeyObj.columnReference) : [];
    let attributeAboutId = '';

    let uriTemplate;
    let tableSchemaAboutUrlValue;

    const { data } = obj;
    if (!data || data.length === 0 ) return "<table></table>";
    const headers = data[0];
    const rows = data.slice(1);

    let captionLang = '';
    if (isPlainObject(caption)) {
      const captionValue = caption["@value"];

      captionLang = ` lang="${caption["@language"]}" xml:lang="${caption["@language"]}"`;
      caption = captionValue;
    }

    tablesList[tableMetadata['url']] = caption;

    html += `<table id="${tableMetadata['url']}">`;
    html += `<caption${captionLang}>${caption}</caption>`;
  
    html += `<thead><tr>`;
    headers.forEach(header => {
      header = escapeCharacters(domSanitize(header));
      html += `<th>${header}</th>`;
    });
    html += `</tr></thead>`;

    html += `<tbody>`;
    rows.forEach((row, rowIndex) => {
      const fillValues = headers.reduce((acc, header) => {
        acc[header] = getValueByHeader(row, headers, header);
        return acc;
      }, {});

      fillValues['_row'] = rowIndex;

      if (tableSchemaAboutUrl) {
        uriTemplate = uriTemplates(domSanitize(tableSchemaAboutUrl));

        tableSchemaAboutUrlValue = uriTemplate.fill(fillValues);

        attributeAboutId = ` about="${tableSchemaAboutUrlValue}" id="${tableSchemaAboutUrlValue.slice(1)}"`;
      }

      html += `<tr${attributeAboutId}>`;

      row.forEach((cell, cellIndex) => {
        const columnName = headers[cellIndex];
        if (!columnName) return;
        cell = escapeCharacters(domSanitize(cell));

        const currentColumnMetadataOriginal = metadataColumns.find(col => col.name === columnName);
        const currentColumnMetadata = { ...currentColumnMetadataOriginal };
        
        const nullValues = currentColumnMetadata.null || [];

        const cellFillValues = headers.reduce((acc, header) => {
          let val = getValueByHeader(row, headers, header);
          acc[header] = val;
          return acc;
        }, {});

        fillValues['_row'] = rowIndex;

        let isInForeignKeys = !!foreignKeys.includes(currentColumnMetadata.name)

        let skipProperty = false;

        Object.keys(currentColumnMetadata).forEach(key => {
          if (uriTemplateProperties.includes(key)) {
            const uriTemplate = uriTemplates(currentColumnMetadata[key]);
            let isNull = false;
            uriTemplate.varNames.forEach((v) => {
              if (foreignKeys.includes(v) && v !== currentColumnMetadata.name) {
                isInForeignKeys = true;
                isNull = nullValues.includes(cellFillValues[v]);
                if (isNull) {
                  skipProperty = true;
                }
              }
            })

            currentColumnMetadata[key] = isNull ? null : domSanitize(uriTemplate.fill(cellFillValues));
          }
        })

        const attributes = []

        if (currentColumnMetadata.aboutUrl) {
          attributes.push(`about="${currentColumnMetadata.aboutUrl}"`)
          if (!isInForeignKeys) {
            attributes.push(`id="${currentColumnMetadata.aboutUrl.slice(1)}"`);
          }
        }

        let childWithAttribute;

        if (currentColumnMetadata.propertyUrl) {
          if (currentColumnMetadata.propertyUrl == 'rdf:type') {
            let aboutUrl = currentColumnMetadata.aboutUrl || tableSchemaAboutUrlValue;

            attributes.push(`about="${aboutUrl}"`);

            if (!tableSchemaAboutUrlValue && !isInForeignKeys) {
              attributes.push(`id="${aboutUrl.slice(1)}"`);
            }
            
            if (currentColumnMetadata.valueUrl) {
              attributes.push(`typeof="${currentColumnMetadata.valueUrl}"`);
            }
            else {
              attributes.push(`typeof="${cell}"`);
            }
          }

          if (currentColumnMetadata.propertyUrl == 'dcterms:description') {
            attributes.push(`property="${currentColumnMetadata.propertyUrl}"`);
          }

          if (currentColumnMetadata.propertyUrl !== 'rdf:type' && currentColumnMetadata.propertyUrl !== 'dcterms:description' && currentColumnMetadata.valueUrl) {
            if (currentColumnMetadata.name == 'strideThreatType') {
              let valueUrlSliced = currentColumnMetadata.valueUrl.slice(1);
              let strideThreatType = Config.STRIDEThreatTypes[valueUrlSliced];

              if (strideThreatType) {
                cell = strideThreatType.name;
                currentColumnMetadata.valueUrl = strideThreatType.uri;
              }
            }

            let hrefValue;
            let relAttribute = '';

            if ((currentColumnMetadata.propertyUrl == 'dcterms:subject' || currentColumnMetadata.propertyUrl == 'rdfs:seeAlso') && URL.canParse(cell)) {
              hrefValue = cell;
            }

            if (!skipProperty) {
              relAttribute = ` rel="${currentColumnMetadata.propertyUrl}"`;
            }

            childWithAttribute = `<a href="${hrefValue ?? currentColumnMetadata.valueUrl}"${relAttribute}>${cell}</a>`;
          }
          else {
            childWithAttribute = cell;
          }
        }
        else {
          childWithAttribute = `<span property="${columnName}">${cell}</span>`;
        }

        if (nullValues.includes(cell)) {
          html += `<td>${cell}</td>`;
        }
        else {
          html += `<td ${attributes.join(' ')}>${childWithAttribute}</td>`;
        }
      })
      html += `</tr>`;
    });

    html += `</tbody>`;
    let publisherHTML = '', publisherHref, publisherName;

    let licenseHTML = '', licenseHref, licenseName;

    if (isPlainObject(publisher)) {
      publisherHref = publisher["@id"] || publisher["schema:url"];
      publisherHref = publisherHref["@id"] ? publisherHref["@id"] : publisherHref;
      publisherName = (publisher["schema:name"]) ? publisher["schema:name"] : publisherHref;
    }
    else {
      publisherHref = publisher;
    }
    if (publisher) {
      publisherHTML = `<dl><dt>Publisher</dt><dd><a href="${publisherHref}" rel="dcterms:publisher">${publisherName}</a></dd></dl>`;
    }

    if (isPlainObject(license)) {
      licenseHref = license["@id"] || publisher["schema:url"];

      licenseName = (licenseHref && Config.License[licenseHref]) ? Config.License[licenseHref].name : licenseHref;
    }

    if (license) {
      licenseHTML = `<dl><dt>License</dt><dd><a href="${licenseHref}" rel="dcterms:license">${licenseName}</a></dd></dl>`;
    }

    if (publisherHTML !== '' || licenseHTML !== '' || keywordsHTML !== '') {
      html += `<tfoot><tr><td colspan="${metadataColumnsCount}">${publisherHTML}${licenseHTML}${keywordsHTML}</td></tr></tfoot>`;
    }

    html += `</table>`;
  })


  //TODO: buildListOfStuff('list-of-tables') could do this but it inserts its HTML, and jsonToHtmlTableString is called later.
  let navList = [];
  let navHtml = '';

  Object.keys(tablesList).forEach(key => {
    navList.push(`<li><a href="#${key}">${tablesList[key]}</a></li>`);
  })

  if (navList.length) {
    navHtml = `<nav id="list-of-tables"><h2>Tables</h2><div><ol class="toc">${navList.join('')}</ol></div></nav>`;
  }

  return navHtml + html;
}

function getValueByHeader(row, headers, headerName) {
  const index = headers.indexOf(headerName);
  return index !== -1 ? row[index] : undefined;
}


function JSONLDArrayToDL(arr, title, property) {
  if (!Array.isArray(arr) || arr.length === 0) return '';

  const items = arr.map(
    k => `<dd lang="${k['@language']}" property="${property}" xml:lang="${k['@language']}">${k['@value']}</dd>`
  ).join('');

  return `<dl><dt>${title}</dt>${items}</dl>`;
}
