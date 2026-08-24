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

import Config from './config.js'
import Papa from 'papaparse';
import { generateAttributeId, getDateTimeISO } from './util.js';
import { sanitizeObject } from './utils/sanitization.js';
import { createDateHTML, createLicenseHTML } from './doc.js';
import { renderCellHTML } from './table.js';
import uriTemplates from 'uri-templates';

// Expands single-letter STRIDE types so the cell emitter stays free of column special cases.
function strideValueMapper(column, cell) {
  if (column.name !== 'strideThreatType' || !column.valueUrl) return null;

  const threatType = Config.STRIDEThreatTypes[column.valueUrl.slice(1)];
  if (!threatType) return null;

  return { text: threatType.name, valueUrl: threatType.uri };
}

export function csvStringToJson(str) {
  return Papa.parse(str.trim());
}

//https://www.w3.org/TR/tabular-data-model/
//https://www.w3.org/TR/csv2rdf/
//https://www.w3.org/TR/tabular-metadata/
export function jsonToHtmlTableString(csvTables, metadata = {}) {
  csvTables = csvTables.map((table) => sanitizeObject(table, { htmlEncode: true }));
  metadata = sanitizeObject(metadata, { htmlEncode: true });

  const metadataUrl = metadata?.url;
  metadata = metadata?.content;

  let tables = metadata?.tables;

  if (!metadata) {
    tables = [];
  }
 
  if (!metadata?.tables && metadata && metadata["@type"] == "Table") {
    tables = metadata;
  }

  if (metadata?.tables) {
    const orderMap = metadata.tables.reduce((acc, table, index) => {
      acc[resolveUrl(table['url'], metadataUrl)] = index;
      return acc;
    }, {});

    csvTables = csvTables.sort((a, b) => {
      const ai = orderMap[resolveUrl(a.url, metadataUrl)] ?? Number.MAX_SAFE_INTEGER;
      const bi = orderMap[resolveUrl(b.url, metadataUrl)] ?? Number.MAX_SAFE_INTEGER;
      return ai - bi;
    });
  }


  let tableHTML = '';

  let tablesList = {};

  let documentTitle = metadata ? metadata['dcterms:title'] || metadata['@id'] : null;
  documentTitle = documentTitle ? getTitleAndLanguage(documentTitle) : { textContent: csvTables.map((t) => t.url).join(', ') };

  csvTables.forEach((obj) => {
    let tableMetadata;
    if (metadata?.tables) {
      tableMetadata = tables.find((table) => resolveUrl(table.url, metadataUrl) == resolveUrl(obj.url, metadataUrl));
    }
    else {
      tableMetadata = metadata;
    }

    let caption = tableMetadata ? tableMetadata['dcterms:title'] || tableMetadata['url'] || tableMetadata['@id'] : null;
    caption = caption ? getTitleAndLanguage(caption) : { textContent: obj.url };

    let keywordsHTML = tableMetadata ? JSONLDArrayToDL(tableMetadata['dcat:keyword'], 'Keywords', 'dcat:keyword') : '';
    let publisher = tableMetadata ? tableMetadata['dcterms:publisher'] : '';
    publisher = Array.isArray(publisher) ? publisher[0] : publisher;
    let license = tableMetadata ? tableMetadata['dcterms:license'] : '';
    let modified = tableMetadata ? tableMetadata['dcterms:modified'] : '';

    license = Array.isArray(license) ? license[0] : license;
    let licenseHTML = license ? createLicenseHTML(license["@id"], {rel:'dcterms:license', label:'License'}) : '';
    let modifiedHTML = modified ? createDateHTML({ 'property': 'dcterms:modified', 'title': 'Modified', 'datetime': new Date(tableMetadata ? tableMetadata['dcterms:modified']["@value"] : null) }) : '';

    const activityGeneratedBy = generateAttributeId();
    const activityStartedAt = getDateTimeISO();

    const metadataColumns = tableMetadata?.tableSchema?.columns;
    const virtualColumns = metadataColumns?.filter((col) => !!col.virtual);
    const tableSchemaAboutUrl = tableMetadata?.tableSchema?.aboutUrl;
    let foreignKeys = tableMetadata?.tableSchema?.foreignKeys
    foreignKeys = foreignKeys ? foreignKeys.map((foreignKeyObj) => foreignKeyObj.columnReference) : [];
    let attributeAboutId = '';

    const relColumns = virtualColumns?.filter((col) => !!col.aboutUrl && !!col.propertyUrl && !!col.valueUrl).filter((col) => col.valueUrl == tableSchemaAboutUrl );

    const rel = relColumns?.length ? relColumns[0].propertyUrl : null;
    const about = relColumns?.length ? relColumns[0].aboutUrl : `#${obj.url}`;
    const attributeTableAbout = about ? ` about="${about}"` : '';
    const attributeTableRel = rel ? ` rel="${rel}"` : ' rel="schema:hasPart"';

    let uriTemplate;
    let tableSchemaAboutUrlValue;

    const { data } = obj;
    if (!data || data.length === 0 ) return "<table></table>";
    const headers = data[0];
    const rows = data.slice(1);
    const metadataColumnsCount = (metadataColumns?.length - virtualColumns?.length) || headers.length;

    if (tableMetadata && tableMetadata['url']) {
      tablesList[tableMetadata['url']] = caption.textContent;
    } else {
      tablesList[obj.url] = caption.textContent || obj.url;
    }

    tableHTML += `<table${attributeTableAbout} id="${tableMetadata ? tableMetadata['url'] : obj.url}"${attributeTableRel}>`;
    tableHTML += `<caption${caption.language || ''}>${caption.textContent}</caption>`;
  
    tableHTML += `<thead><tr>`;
    headers.forEach(header => {
      const columnMetadata = metadataColumns?.find(col => col.name === header);
      let title = columnMetadata?.titles ?? header;
      title = Array.isArray(title) ? title[0] : title;
      title = isPlainObject(title) ? title['@value'] : title;
      tableHTML += `<th>${title}</th>`;
    });
    tableHTML += `</tr></thead>`;

    tableHTML += `<tbody>`;
    rows.forEach((row, rowIndex) => {
      const fillValues = headers.reduce((acc, header) => {
        acc[header] = getValueByHeader(row, headers, header);
        return acc;
      }, {});

      fillValues['_row'] = rowIndex + 1;

      if (tableSchemaAboutUrl) {
        uriTemplate = uriTemplates(tableSchemaAboutUrl);

        tableSchemaAboutUrlValue = uriTemplate.fill(fillValues);

        attributeAboutId = ` about="${tableSchemaAboutUrlValue}" id="${tableSchemaAboutUrlValue.slice(1)}"`;
      } else {
        const attributeAbout = `#${obj.url}/${fillValues['_row']}`;
        attributeAboutId = ` about="${attributeAbout}" id="${attributeAbout.slice(1)}"`;
      }

      const typeVirtualColumns = virtualColumns ? virtualColumns.filter((col) => col.propertyUrl == 'rdf:type'): [];

      const typeValue = typeVirtualColumns.length ? typeVirtualColumns[0].valueUrl : null;
      const attributeTypeof = typeValue ? ` typeof="${typeValue}"` : ' typeof="csvw:Row"';

      tableHTML += `<tr${attributeAboutId}${attributeTypeof}>`;

      row.forEach((cell, cellIndex) => {
        const columnName = headers[cellIndex];
        if (!columnName) return;

        cell = cell.trim();

        const columnMetadata = metadataColumns?.find(col => col.name === columnName);

        const cellFillValues = headers.reduce((acc, header) => {
          acc[header] = getValueByHeader(row, headers, header);
          return acc;
        }, {});

        cellFillValues['_row'] = rowIndex + 1;

        // No metadata: a document-relative property named after the column, so a bare CSV still says something.
        if (!columnMetadata) {
          const child = URL.canParse(cell) ? 'a' : 'span';
          const href = child === 'a' ? ` href="${new URL(cell)}"` : '';
          tableHTML += `<td><${child}${href} property="#${columnName}">${cell}</${child}></td>`;
          return;
        }

        tableHTML += renderCellHTML(columnMetadata, cell, {
          rowSubject: tableSchemaAboutUrlValue,
          fillValues: cellFillValues,
          foreignKeys,
          valueMapper: strideValueMapper
        });
      })
      tableHTML += `</tr>`;
    });

    tableHTML += `</tbody>`;
    let publisherHTML = '', publisherHref, publisherName;

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

    const activityEndedAt = getDateTimeISO();
    const provenanceHTML = generateProvenance(obj.url, metadataUrl, activityGeneratedBy, activityStartedAt, activityEndedAt);

    if (publisherHTML !== '' || licenseHTML !== '' || keywordsHTML !== '' || modifiedHTML !== '' || provenanceHTML !== '') {
      tableHTML += `<tfoot about=""><tr><td colspan="${metadataColumnsCount}">${provenanceHTML}${publisherHTML}${licenseHTML}${keywordsHTML}${modifiedHTML}</td></tr></tfoot>`;
    }

    tableHTML += `</table>`;
  })


  //TODO: buildListOfStuff('list-of-tables') could do this but it inserts its HTML, and jsonToHtmlTableString is called later.
  let navList = [];
  let navHTML = '';

  Object.keys(tablesList).forEach(key => {
    navList.push(`<li><a href="#${key}">${tablesList[key]}</a></li>`);
  })

  if (navList.length) {
    navHTML  = `<nav id="list-of-tables"><h2>Tables</h2><div><ol class="toc">${navList.join('')}</ol></div></nav>`;
  }

  const langAttribute = documentTitle.language ? ` lang="${documentTitle.language}" xml:lang="${documentTitle.language}"` : '';

  return `<h1${langAttribute}>${documentTitle.textContent}</h1>${navHTML}${tableHTML}`;
}

function generateProvenance (csvUrl, metadataUrl, activityGeneratedBy, activityStartedAt, activityEndedAt) {
  let csvwTabularMetadataHTML = '';

  if (metadataUrl) {
    csvwTabularMetadataHTML = `            
            <dl resource="#${generateAttributeId()}" typeof="prov:Usage">
              <dt>Entity</dt>
              <dd><a href="${metadataUrl}" rel="prov:entity">${metadataUrl}</a></dd>
              <dt>Role</dt>
              <dd rel="prov:hadRole" resource="csvw:tabularMetadata">CSV tabular metadata</dd>
            </dl>`;
  }

  const provenanceHTML = `
    <dl about="">
      <dt>Generated activity</dt>
      <dd rel="prov:wasGeneratedBy" resource="#${activityGeneratedBy}" typeof="prov:Activity">
        <dl>
          <dt>Was associated with</dt>
          <dd><a href="https://dokie.li/#i" rel="prov:wasAssociatedWith">dokieli</a></dd>
          <dt>Started at time</dt>
          <dd><time datetime="${activityStartedAt}" property="prov:startedAtTime">${activityStartedAt}</time></dd>
          <dt>Ended at time</dt>
          <dd><time datetime="${activityEndedAt}" property="prov:endedAtTime">${activityEndedAt}</time></dd>
          <dt>Usage</dt>
          <dd rel="prov:qualifiedUsage">
            <dl resource="#${generateAttributeId()}" typeof="prov:Usage">
              <dt>Entity</dt>
              <dd><a href="${csvUrl}" rel="prov:entity">${csvUrl}</a></dd>
              <dt>Role</dt>
              <dd rel="prov:hadRole" resource="csvw:csvEncodedTabularData">CSV encoded tabular data</dd>
            </dl>${csvwTabularMetadataHTML}
          </dd>
        </dl>
      </dd>
    </dl>
  `
  return provenanceHTML;
}

// Resolve a (possibly relative) metadata table URL against the metadata document URL.
function resolveUrl(url, base) {
  if (!url) return url;
  try {
    return new URL(url, base || undefined).href;
  } catch {
    return url;
  }
}

function getValueByHeader(row, headers, headerName) {
  const index = headers.indexOf(headerName);
  return index !== -1 ? row[index] : undefined;
}

function getTitleAndLanguage(titleObject) {
  titleObject = Array.isArray(titleObject) ? titleObject[0] : titleObject;

  let language = '';
  let textContent = titleObject;

  if (isPlainObject(titleObject)) {
    textContent = titleObject["@value"];

    language = ` lang="${titleObject["@language"]}" xml:lang="${titleObject["@language"]}"`;
  }

  return { language, textContent };

}

function JSONLDArrayToDL(arr, title, property) {
  if (!Array.isArray(arr) || arr.length === 0) return '';

  const items = arr.map(
    k => `<dd lang="${k['@language']}" property="${property}" xml:lang="${k['@language']}">${k['@value']}</dd>`
  ).join('');

  return `<dl><dt>${title}</dt>${items}</dl>`;
}

function isPlainObject(object) {
  return typeof object === 'object' && !Array.isArray(object) && object !== null;
}
