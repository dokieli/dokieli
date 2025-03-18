import { createResourceTypeHTML, createLanguageHTML, createLicenseHTML, createInboxHTML, createInReplyToHTML } from "../../doc.js";
import { getFormValues, fragmentFromString } from "../../util.js";

export function formHandlerLanguage(e) {
  e.preventDefault();
  e.stopPropagation();

  const formValues = getFormValues(e.target);
  // console.log(formValues);
  const language = formValues['language'];
  const options = {};

  const htmlString = createLanguageHTML(language, options);

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
