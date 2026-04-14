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

// Storage abstraction so alternative backends can plug in via Config.Storage.

import {
  getResource,
  getResourceHead,
  getResourceOptions,
  postResource,
  putResource,
  patchResource,
  deleteResource,
  copyResource,
  getMultipleResources,
  processSave as fetcherProcessSave,
  patchResourceWithAcceptPatch,
  putResourceWithAcceptPut,
  getAcceptPostPreference,
} from "../fetcher.js";

// Capability flags for supports() method - indicates which features a backend supports, so dokieli can use the appropriate methods and fallback if needed or display different UI (for example for access control).
const CAPS = Object.freeze({
  ACL: "acl",
  LDP: "ldp",
  PATCH: "patch",
  POST_CONTAINER: "post-container",
  CONNEG: "conneg",
});

const DEFAULT_CONTENT_TYPE = "text/html; charset=utf-8";

class StorageBackend {
  get name() {
    return "abstract";
  }
  supports(_cap) {
    return false;
  }

  get(_url, _headers, _options) {
    return Promise.reject(new Error("not implemented"));
  }
  head(_url, _headers, _options) {
    return Promise.reject(new Error("not implemented"));
  }
  options(_url, _opts) {
    return Promise.reject(new Error("not implemented"));
  }
  put(_url, _data, _contentType, _links, _options) {
    return Promise.reject(new Error("not implemented"));
  }
  post(_url, _slug, _data, _contentType, _links, _options) {
    return Promise.reject(new Error("not implemented"));
  }
  patch(_url, _data, _options) {
    return Promise.reject(new Error("not implemented"));
  }
  delete(_url, _options) {
    return Promise.reject(new Error("not implemented"));
  }
  copy(_fromURL, _toURL, _options) {
    return Promise.reject(new Error("not implemented"));
  }
  getMultiple(_resources, _options) {
    return Promise.reject(new Error("not implemented"));
  }

  save(_url, _slug, _data, _options) {
    return Promise.reject(new Error("not implemented"));
  }

  // Solid-specific
  putWithConneg(_url, _data, _options) {
    return Promise.reject(new Error("not implemented"));
  }
  patchWithConneg(_url, _patch, _options) {
    return Promise.reject(new Error("not implemented"));
  }
  getAcceptPost(_url) {
    return Promise.reject(new Error("not implemented"));
  }
}

// Plain HTTP CRUD. No Solid session, LDP Link, or conneg handling
class HttpStorage extends StorageBackend {
  constructor({ authFetch, defaultContentType } = {}) {
    super();
    this._authFetch = authFetch || null;
    this._defaultContentType = defaultContentType || DEFAULT_CONTENT_TYPE;
  }

  get name() {
    return "http";
  }

  supports(cap) {
    return cap === CAPS.PATCH;
  }

  _fetch(url, options) {
    return this._authFetch
      ? this._authFetch(url, options)
      : fetch(url, options);
  }

  async _send(url, options, errorPrefix) {
    const response = await this._fetch(url, options);
    if (!response.ok) {
      const error = new Error(
        `${errorPrefix}: ${response.status} ${response.statusText}`,
      );
      error.status = response.status;
      error.response = response;
      throw error;
    }
    return response;
  }

  get(url, headers = {}, options = {}) {
    options.method = options.method === "HEAD" ? "HEAD" : "GET";
    if (!headers["Accept"] && options.method !== "HEAD")
      headers["Accept"] = "*/*";
    options.headers = { ...headers };
    return this._send(url, options, "Error fetching resource");
  }

  head(url, headers = {}, options = {}) {
    options.method = "HEAD";
    return this.get(url, headers, options);
  }

  async options(url, options = {}) {
    options.method = "OPTIONS";
    const response = await this._send(
      url,
      options,
      "Error fetching resource OPTIONS",
    );
    if (options.header) {
      const v = response.headers.get(options.header);
      if (!v) {
        const error = new Error(
          `OPTIONS without ${options.header} header: ${response.status} ${response.statusText}`,
        );
        error.status = response.status;
        error.response = response;
        throw error;
      }
      return { headers: v };
    }
    return { headers: response.headers };
  }

  put(url, data, contentType, _links, options = {}) {
    if (!url)
      return Promise.reject(new Error("Cannot PUT resource - missing url"));
    options.method = "PUT";
    options.body = data;
    options.headers = options.headers || {};
    options.headers["Content-Type"] = contentType || this._defaultContentType;
    return this._send(url, options, "Error writing resource");
  }

  post(url, slug, data, contentType, _links, options = {}) {
    if (!url)
      return Promise.reject(new Error("Cannot POST resource - missing url"));
    options.method = "POST";
    options.body = data;
    options.headers = options.headers || {};
    options.headers["Content-Type"] = contentType || this._defaultContentType;
    if (slug) options.headers["Slug"] = slug;
    return this._send(url, options, "Error creating resource");
  }

  patch(url, data, options = {}) {
    options.method = "PATCH";
    options.body = data;
    options.headers = options.headers || {};
    options.headers["Content-Type"] =
      options.headers["Content-Type"] || "text/n3";
    return this._send(url, options, "Error patching resource");
  }

  delete(url, options = {}) {
    if (!url)
      return Promise.reject(new Error("Cannot DELETE resource - missing url"));
    options.method = "DELETE";
    return this._send(url, options, "Error deleting resource");
  }

  async copy(fromURL, toURL, options = {}) {
    if (!fromURL || !toURL) throw new Error("Missing fromURL or toURL in copy");
    const response = await this.get(fromURL, { Accept: "*/*" }, options);
    const contentType = (response.headers.get("Content-Type") || "text/plain")
      .split(";")[0]
      .trim();
    const contents = await response.text();
    return this.put(toURL, contents, contentType, null, options);
  }

  async getMultiple(resources, _options = {}) {
    return Promise.all(
      resources.map(async (url) => {
        const response = await this.get(url);
        const contentType =
          response.headers.get("content-type") || "application/octet-stream";
        return {
          name: url,
          type: contentType.split(";")[0].toLowerCase().trim(),
          content: await response.text(),
        };
      }),
    );
  }

  async save(url, slug, data, options = {}) {
    const request = slug
      ? this.post(url, slug, data, null, null, options)
      : this.put(url, data, null, null, options);
    return request.then((response) => ({
      response,
      message: {
        content: `Saved document to ${response.headers.get("Location") || url}`,
        type: "success",
      },
    }));
  }
}

// Delegates to fetcher.js for OIDC authFetch, LDP Link, proxy fallback, and retry.
class SolidStorage extends StorageBackend {
  get name() {
    return "solid";
  }

  supports(cap) {
    return (
      cap === CAPS.ACL ||
      cap === CAPS.LDP ||
      cap === CAPS.PATCH ||
      cap === CAPS.POST_CONTAINER ||
      cap === CAPS.CONNEG
    );
  }

  get(url, headers, options) {
    return getResource(url, headers, options);
  }
  head(url, headers, options) {
    return getResourceHead(url, headers, options);
  }
  options(url, opts) {
    return getResourceOptions(url, opts);
  }
  put(url, data, contentType, links, options) {
    return putResource(url, data, contentType, links, options);
  }
  post(url, slug, data, contentType, links, options) {
    return postResource(url, slug, data, contentType, links, options);
  }
  patch(url, data, options) {
    return patchResource(url, data, options);
  }
  delete(url, options) {
    return deleteResource(url, options);
  }
  copy(fromURL, toURL, options) {
    return copyResource(fromURL, toURL, options);
  }
  getMultiple(resources, options) {
    return getMultipleResources(resources, options);
  }

  save(url, slug, data, options) {
    return fetcherProcessSave(url, slug, data, options);
  }

  putWithConneg(url, data, options) {
    return putResourceWithAcceptPut(url, data, options);
  }
  patchWithConneg(url, patch, options) {
    return patchResourceWithAcceptPatch(url, patch, options);
  }
  getAcceptPost(url) {
    return getAcceptPostPreference(url);
  }
}

export { StorageBackend, HttpStorage, SolidStorage, CAPS };
