import Config from './config.js'
import Papa from 'papaparse';
import { domSanitize } from './util.js';
import { createDateHTML, createLicenseHTML, escapeCharacters, createDefinitionListHTML } from './doc.js';
import uriTemplates from 'uri-templates';

export function csvStringToJson(str) {
  return Papa.parse(str.trim());
}

//https://www.w3.org/TR/tabular-data-model/
//https://www.w3.org/TR/csv2rdf/
//https://www.w3.org/TR/tabular-metadata/
export function jsonToHtmlTableString(csvTables, metadata) {
  let language;

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

  // console.log(metadata)

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
  // console.log(csvTables)

  let html = '';

  let tablesList = {};

  let documentTitle = metadata['dcterms:title'] || metadata['@id'];
  documentTitle = getTitleAndLanguage(documentTitle);

  csvTables.forEach((obj) => {
    const tableMetadata = tables.find((table) => table.url === obj.url); 
    // console.log(tableMetadata)

    let caption = tableMetadata['dcterms:title'] || tableMetadata['url'] || tableMetadata['@id'];
    caption = getTitleAndLanguage(caption);

    let keywordsHTML = JSONLDArrayToDL(tableMetadata['dcat:keyword'], 'Keywords', 'dcat:keyword');
    let publisher = tableMetadata['dcterms:publisher'];
    publisher = Array.isArray(publisher) ? publisher[0] : publisher;
    let license = tableMetadata['dcterms:license'];
    let modified = tableMetadata['dcterms:modified'];

    license = Array.isArray(license) ? license[0] : license;
    let licenseHTML = license ? createLicenseHTML(license["@id"], {rel:'dcterms:license', label:'License'}) : '';
    let modifiedHTML = modified ? createDateHTML({ 'property': 'dcterms:modified', 'title': 'Modified', 'datetime': new Date(tableMetadata['dcterms:modified']["@value"]) }) : '';

    let sourceHTML = createDefinitionListHTML([{rel: 'dcterms:source', href: obj.url}], {title: 'Source'});


    const metadataColumns = tableMetadata.tableSchema.columns;
    const virtualColumns = metadataColumns.filter((col) => !!col.virtual);
    const metadataColumnsCount = metadataColumns.length - virtualColumns.length;
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

    tablesList[tableMetadata['url']] = caption.textContent;

    html += `<table id="${tableMetadata['url']}">`;
    html += `<caption${caption.language}>${caption.textContent}</caption>`;
  
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

      fillValues['_row'] = rowIndex + 1;

      if (tableSchemaAboutUrl) {
        uriTemplate = uriTemplates(domSanitize(tableSchemaAboutUrl));

        tableSchemaAboutUrlValue = uriTemplate.fill(fillValues);

        attributeAboutId = ` about="${tableSchemaAboutUrlValue}" id="${tableSchemaAboutUrlValue.slice(1)}"`;
      }

      const typeVirtualColumns = virtualColumns ? virtualColumns.filter((col) => col.propertyUrl == 'rdf:type'): [];

      const typeValue = typeVirtualColumns.length ? typeVirtualColumns[0].valueUrl : null;
      const attributeTypeof = typeValue ? ` typeof="${typeValue}"` : '';

      html += `<tr${attributeAboutId}${attributeTypeof}>`;

      row.forEach((cell, cellIndex) => {
        const columnName = headers[cellIndex];
        if (!columnName) return;

        cell = cell.trim();

        cell = escapeCharacters(domSanitize(cell));

        const currentColumnMetadataOriginal = metadataColumns.find(col => col.name === columnName);
        const currentColumnMetadata = { ...currentColumnMetadataOriginal };
        
        const nullValues = currentColumnMetadata.null || [''];

        const cellFillValues = headers.reduce((acc, header) => {
          let val = getValueByHeader(row, headers, header);
          acc[header] = val;
          return acc;
        }, {});

        fillValues['_row'] = rowIndex + 1;

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

          if (currentColumnMetadata.propertyUrl == 'dcterms:description' && !nullValues.includes(cell)) {
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

    if (publisherHTML !== '' || licenseHTML !== '' || keywordsHTML !== '' || modifiedHTML !== '' || sourceHTML !== '') {
      html += `<tfoot><tr><td colspan="${metadataColumnsCount}">${sourceHTML}${publisherHTML}${licenseHTML}${keywordsHTML}${modifiedHTML}</td></tr></tfoot>`;
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
    navHtml  = `<nav id="list-of-tables"><h2>Tables</h2><div><ol class="toc">${navList.join('')}</ol></div></nav>`;
  }

  return `<h1${documentTitle.language}>${documentTitle.textContent}</h1>${navHtml}${html}`;
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

const isPlainObject = (object) => {
  return Object.prototype.toString.call(object) === '[object Object]';
}
