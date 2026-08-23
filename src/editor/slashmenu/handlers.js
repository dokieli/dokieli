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

import { createLanguageHTML, createLicenseHTML, createInboxHTML, createInReplyToHTML, createPublicationStatusHTML, createResourceTypeHTML, createTestSuiteHTML } from "../../doc.js";
import { fragmentFromString } from "../../utils/html.js";
import { getFormValues } from "../../utils/html.js";
import { schema } from "../schema/base.js";
import { TextSelection } from "prosemirror-state";
import Config from "../../config.js";
import { isUploadableTarget, uploadImageFile } from "../utils/imageAssets.js";
import { insertTable } from "../commands/table.js";
import { getLookupService } from "../../services.js";
import { csvStringToJson } from "../../csv.js";
import { fromCSVWTableSchema, getPrefixesUsed, ensureDocumentPrefixes } from "../../table.js";
import { defaultThreatCaption } from "../../threatModel.js";

export function formHandlerLanguage(e) {
  e.preventDefault();
  e.stopPropagation();

  const formValues = getFormValues(e.target);
  // console.log(formValues);
  const language = formValues['language'];
  const options = {};

  const htmlString = createLanguageHTML(language, options);

  const html = document.documentElement;

  html.setAttribute('lang', language);
  html.setAttribute('xml:lang', language);
  html.setAttribute('dir', Config.Languages[language].dir);

  this.replaceSelectionWithFragment(fragmentFromString(htmlString));
  this.hideMenu()
}

export function formHandlerLicense(e) {
  e.preventDefault();
  e.stopPropagation();

  const formValues = getFormValues(e.target);
  // console.log(formValues);
  const license = formValues['license'];
  const options = {};

  const htmlString = createLicenseHTML(license, options);

  this.replaceSelectionWithFragment(fragmentFromString(htmlString));
  this.hideMenu()
}

export function formHandlerInbox(e) {
  e.preventDefault();
  e.stopPropagation();

  const formValues = getFormValues(e.target);
  // console.log(formValues);
  const inbox = formValues['inbox'];
  const options = {};

  const htmlString = createInboxHTML(inbox, options);

  this.replaceSelectionWithFragment(fragmentFromString(htmlString));
  this.hideMenu()
}

export function formHandlerInReplyTo(e) {
  e.preventDefault();
  e.stopPropagation();

  const formValues = getFormValues(e.target);
  // console.log(formValues);
  const inReplyTo = formValues['in-reply-to'];
  const options = {};

  const htmlString = createInReplyToHTML(inReplyTo, options);

  this.replaceSelectionWithFragment(fragmentFromString(htmlString));
  this.hideMenu()
}

export function formHandlerPublicationStatus(e) {
  e.preventDefault();
  e.stopPropagation();

  const formValues = getFormValues(e.target);
  // console.log(formValues);
  const publicationStatus = formValues['publication-status'];
  const options = {};

  const htmlString = createPublicationStatusHTML(publicationStatus, options);

  this.replaceSelectionWithFragment(fragmentFromString(htmlString));
  this.hideMenu()
}

export function formHandlerResourceType(e) {
  e.preventDefault();
  e.stopPropagation();

  const formValues = getFormValues(e.target);
  // console.log(formValues);
  const resourceType = formValues['resource-type'];
  const options = {};

  const htmlString = createResourceTypeHTML(resourceType, options);

  this.replaceSelectionWithFragment(fragmentFromString(htmlString));
  this.hideMenu()
}

export function formHandlerTestSuite(e) {
  e.preventDefault();
  e.stopPropagation();

  const formValues = getFormValues(e.target);
  // console.log(formValues);
  const testSuite = formValues['test-suite'];
  const options = {};

  const htmlString = createTestSuiteHTML(testSuite, options);

  this.replaceSelectionWithFragment(fragmentFromString(htmlString));
  this.hideMenu()
}

// Pick the metadata entry for the imported CSV, falling back to the only table described.
function csvwTableFor(metadata, csvName) {
  if (!metadata) return null;
  const tables = Array.isArray(metadata.tables) ? metadata.tables : [metadata];
  const named = tables.find((table) => table.url && csvName && table.url.split('/').pop() === csvName);
  return named || tables[0] || null;
}

async function readImportedCSV(form) {
  const csvFile = form.querySelector('#table-csv-file')?.files?.[0];
  if (!csvFile) return null;

  const parsed = csvStringToJson(await csvFile.text());
  const rows = (parsed?.data || []).filter((row) => row.some((cell) => String(cell ?? '').trim()));
  if (!rows.length) return null;

  const [headers, ...data] = rows;

  const metadataFile = form.querySelector('#table-metadata-file')?.files?.[0];
  let columnSchemas = [];
  let tableSchema = null;

  if (metadataFile) {
    try {
      const csvw = csvwTableFor(JSON.parse(await metadataFile.text()), csvFile.name);
      const converted = fromCSVWTableSchema(csvw?.tableSchema);
      columnSchemas = converted.columns;
      tableSchema = converted.tableSchema;
    }
    catch (error) {
      console.warn('Could not read the CSVW metadata:', error?.message || error);
    }
  }

  return { headers, data, columnSchemas, tableSchema };
}

export async function formHandlerTable(e) {
  e.preventDefault();
  e.stopPropagation();

  const formValues = getFormValues(e.target);

  // Blank, a template, or an imported CSV: one of the three, never a blend.
  const start = formValues['table-start'] || 'blank';

  const imported = start === 'import' ? await readImportedCSV(e.target) : null;
  if (start === 'import' && !imported) return;

  // Each card carries its own rows field, so the visible one is the one meant.
  const rowsField = start === 'template' ? formValues['table-rows-template'] : formValues['table-rows'];
  const rows = Math.max(1, Math.min(parseInt(rowsField, 10) || 3, 100));

  // A template brings its own column set, arriving mapped and ready to autofill.
  const service = start === 'template' ? getLookupService(formValues['table-service']) : null;
  const serviceColumns = service?.columns || [];

  const columns = imported?.headers.length || (serviceColumns.length
    ? serviceColumns.length
    : Math.max(1, Math.min(parseInt(formValues['table-columns'], 10) || 3, 30)));

  const { state, dispatch } = this.editorView;
  const { selection } = state;

  // Selected text names the table: it becomes the caption of what replaces it.
  let caption = selection.empty ? '' : state.doc.textBetween(selection.from, selection.to, ' ').trim();

  // Drop the "/" when one opened the menu; the toolbar path has no slash.
  if (this.openedWithSlash) {
    const newSelection = TextSelection.create(state.doc, Math.max(selection.from - 1, 0), selection.from);
    dispatch(state.tr.setSelection(newSelection));
  }

  const tableSchema = imported?.tableSchema || service?.tableSchema || null;
  const columnSchemas = imported?.columnSchemas?.length ? imported.columnSchemas : serviceColumns;

  // A threat table without an authored caption starts with the framework's default.
  if (!caption && formValues['table-service'] === 'threatmodel') caption = defaultThreatCaption();

  insertTable({
    rows: imported?.data.length || rows,
    columns,
    caption,
    headers: imported?.headers || [],
    data: imported?.data || [],
    tableSchema,
    columnSchemas,
    // A template without an endpoint configures columns but binds no lookup.
    lookup: service?.url
      ? {
          service: formValues['table-service'],
          url: service.url,
          format: service.format,
          record: service.record,
          subject: service.subject
        }
      : null
  })(this.editorView.state, this.editorView.dispatch);

  ensureDocumentPrefixes([...getPrefixesUsed(tableSchema, columnSchemas), ...(service?.prefixes || [])]);

  this.hideMenu();
}

export async function formHandlerImg(e) {
  e.preventDefault();
  e.stopPropagation();

  const formValues = getFormValues(e.target);
  const src = formValues['img-src'];
  const alt = formValues['img-alt'] || '';
  const title = formValues['img-figcaption'] || '';

  if (!src) return;

  const attrs = { src, alt, title };

  const preview = e.target.querySelector('.img-preview');
  const previewImg = preview?.querySelector('img[src]');
  if (previewImg) {
    if (previewImg.width) attrs.width = String(previewImg.width);
    if (previewImg.height) attrs.height = String(previewImg.height);
  }

  // Upload the chosen file to the target path first, so the inserted <img>
  // resolves (for us and collaborators) instead of returning a 404.
  const file = e.target.querySelector('[name="img-file"]')?.files?.[0];
  if (file && isUploadableTarget(src)) {
    try {
      await uploadImageFile(src, file);
    } catch (err) {
      console.warn('Image upload failed:', err);
    }
  }

  const { state, dispatch } = this.editorView;
  const { selection } = state;
  const imageNode = schema.nodes.img.create({ originalAttributes: attrs });
  // Drop the "/" when one opened the menu; the toolbar path has no slash.
  const tr = this.openedWithSlash
    ? state.tr.setSelection(TextSelection.create(state.doc, Math.max(selection.from - 1, 0), selection.from)).replaceSelectionWith(imageNode)
    : state.tr.replaceSelectionWith(imageNode);
  dispatch(tr);

  this.hideMenu();
}
