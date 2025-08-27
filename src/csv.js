import Config from './config.js'
import Papa from 'papaparse';
import { domSanitize, generateUUID, getDateTimeISO, isPlainObject, sanitizeObject, htmlEncode } from './util.js';
import { createDateHTML, createLicenseHTML } from './doc.js';
import uriTemplates from 'uri-templates';

export function csvStringToJson(str) {
  return Papa.parse(str.trim());
}

//https://www.w3.org/TR/tabular-data-model/
//https://www.w3.org/TR/csv2rdf/
//https://www.w3.org/TR/tabular-metadata/
export function jsonToHtmlTableString(csvTables, metadata = {}) {
  csvTables = csvTables.map((table) => sanitizeObject(table));
  metadata = sanitizeObject(metadata);

  const metadataUrl = metadata?.url;
  metadata = metadata?.content;

  let tables = metadata?.tables;

  if (!metadata) {
    tables = [];
  }
 
  if (!metadata.tables) {
    if (metadata["@type"] == "Table") {
      tables = metadata;
    } 
  }

  const uriTemplateProperties = ['aboutUrl', 'propertyUrl', 'valueUrl'];

  if (metadata.tables) {
    const orderMap = metadata.tables.reduce((acc, table, index) => {
      acc[table['url']] = index;
      return acc;
    }, {});
  
    csvTables = csvTables.sort((a, b) => {
      const ai = orderMap[a.url] ?? Number.MAX_SAFE_INTEGER;
      const bi = orderMap[b.url] ?? Number.MAX_SAFE_INTEGER;
      return ai - bi;
    });
  }


  let tableHTML = '';

  let tablesList = {};

  let documentTitle = metadata['dcterms:title'] || metadata['@id'];
  documentTitle = documentTitle ? getTitleAndLanguage(documentTitle) : { textContent: csvTables.map((t) => t.url).join(', ') };

  csvTables.forEach((obj) => {
    let tableMetadata;
    if (metadata.tables) {
      tableMetadata = tables.find((table) => table.url == obj.url);
    }
    else {
      tableMetadata = metadata;
    }

    let caption = tableMetadata['dcterms:title'] || tableMetadata['url'] || tableMetadata['@id'];
    caption = caption ? getTitleAndLanguage(caption) : { textContent: obj.url };

    let keywordsHTML = tableMetadata ? JSONLDArrayToDL(tableMetadata['dcat:keyword'], 'Keywords', 'dcat:keyword') : null;
    let publisher = tableMetadata ? tableMetadata['dcterms:publisher'] : null;
    publisher = Array.isArray(publisher) ? publisher[0] : publisher;
    let license = tableMetadata ? tableMetadata['dcterms:license'] : null;
    let modified = tableMetadata ? tableMetadata['dcterms:modified'] : null;

    license = Array.isArray(license) ? license[0] : license;
    let licenseHTML = license ? createLicenseHTML(license["@id"], {rel:'dcterms:license', label:'License'}) : '';
    let modifiedHTML = modified ? createDateHTML({ 'property': 'dcterms:modified', 'title': 'Modified', 'datetime': new Date(tableMetadata ? tableMetadata['dcterms:modified']["@value"] : null) }) : '';

    const activityGeneratedBy = generateUUID();
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

    if (tableMetadata['url']) {
      tablesList[tableMetadata['url']] = caption.textContent;
    } else {
      tablesList[obj.url] = caption.textContent || obj.url;
    }

    tableHTML += `<table${attributeTableAbout} id="${tableMetadata['url'] || obj.url}"${attributeTableRel}>`;
    tableHTML += `<caption${caption.language || ''}>${caption.textContent}</caption>`;
  
    tableHTML += `<thead><tr>`;
    headers.forEach(header => {
      header = htmlEncode(header);
      tableHTML += `<th>${header}</th>`;
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

        cell = htmlEncode(domSanitize(cell));

        const currentColumnMetadataOriginal = metadataColumns?.find(col => col.name === columnName);
        const currentColumnMetadata = { ...currentColumnMetadataOriginal };
        
        const nullValues = currentColumnMetadata?.null || [''];

        const cellFillValues = headers.reduce((acc, header) => {
          let val = getValueByHeader(row, headers, header);
          acc[header] = val;
          return acc;
        }, {});

        fillValues['_row'] = rowIndex + 1;

        let isInForeignKeys = !!foreignKeys.includes(currentColumnMetadata?.name)

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
          attributes.push(`about="${currentColumnMetadata.aboutUrl}"`);

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
          let hrefValue;

          if (URL.canParse(cell)) {
            hrefValue = new URL(cell);
            childWithAttribute = `<a href="${hrefValue}" property="#${columnName}">${cell}</a>`;
          } else {
            childWithAttribute = `<span property="#${columnName}">${cell}</span>`;
          }
        }

        if (nullValues.includes(cell)) {
          tableHTML += `<td>${cell}</td>`;
        }
        else {
          tableHTML += `<td ${attributes.join(' ')}>${childWithAttribute}</td>`;
        }
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
            <dl resource="#${generateUUID()}" typeof="prov:Usage">
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
          <dd><a href="https://dokie.li/" rel="prov:wasAssociatedWith">dokieli</a></dd>
          <dt>Started at time</dt>
          <dd><time datetime="${activityStartedAt}" property="prov:startedAtTime">${activityStartedAt}</time></dd>
          <dt>Ended at time</dt>
          <dd><time datetime="${activityEndedAt}" property="prov:endedAtTime">${activityEndedAt}</time></dd>
          <dt>Usage</dt>
          <dd rel="prov:qualifiedUsage">
            <dl resource="#${generateUUID()}" typeof="prov:Usage">
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
