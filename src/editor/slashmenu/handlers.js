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
import { getFormValues, fragmentFromString } from "../../util.js";

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
  html.setAttribute('dir', Config.Language[language].dir);

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
