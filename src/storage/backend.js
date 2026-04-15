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

class GitForgeStorage extends StorageBackend {
  #hosts = new Map();
  #branchLocks = new Map();

  constructor() {
    super();
  }

  #withBranchLock(key, fn) {
    const prev = this.#branchLocks.get(key) || Promise.resolve();
    const next = prev.catch(() => {}).then(fn);
    this.#branchLocks.set(key, next);
    next.finally(() => {
      if (this.#branchLocks.get(key) === next) this.#branchLocks.delete(key);
    });
    return next;
  }

  get name() {
    return "gitforge";
  }

  supports(_cap) {
    return false;
  }

  addHost(host, { apiBase, rawHost = host, provider = "github", token = null } = {}) {
    const existing = this.#hosts.get(host) || {};
    this.#hosts.set(host, {
      apiBase: apiBase.replace(/\/$/, ""),
      rawHost,
      provider,
      token: token ?? existing.token ?? null,
    });
  }

  setToken(host, token) {
    const cfg = this.#hosts.get(host);
    if (!cfg) return;
    cfg.token = token || null;
  }

  hosts() {
    return Array.from(this.#hosts.keys());
  }

  matches(host) {
    if (!host) return false;
    if (this.#hosts.has(host)) return true;
    for (const cfg of this.#hosts.values()) {
      if (host === cfg.rawHost) return true;
      try { if (host === new URL(cfg.apiBase).host) return true; } catch {}
    }
    return false;
  }

  _configFor(url) {
    let u;
    try { u = new URL(url); } catch { return null; }
    if (this.#hosts.has(u.host)) return { host: u.host, ...this.#hosts.get(u.host) };
    for (const [host, cfg] of this.#hosts) {
      if (u.host === cfg.rawHost) return { host, ...cfg };
      try { if (u.host === new URL(cfg.apiBase).host) return { host, ...cfg }; } catch {}
    }
    return null;
  }

  _parse(url) {
    let u;
    try { u = new URL(url); } catch { return null; }
    const cfg = this._configFor(url);
    if (!cfg) return null;

    const apiUrl = new URL(cfg.apiBase);
    const apiPrefix = apiUrl.pathname.replace(/\/$/, "");
    if (u.host === apiUrl.host && (apiPrefix === "" || u.pathname.startsWith(apiPrefix + "/"))) {
      const rest = apiPrefix ? u.pathname.slice(apiPrefix.length) : u.pathname;
      const m = rest.match(/^\/repos\/([^/]+)\/([^/]+)\/contents\/(.+)$/);
      if (m) {
        return { host: cfg.host, owner: m[1], repo: m[2], ref: u.searchParams.get("ref") || "HEAD", path: m[3] };
      }
    }

    if (u.host === cfg.rawHost && cfg.provider === "github") {
      const parts = u.pathname.replace(/^\//, "").split("/");
      if (parts.length < 4) return null;
      const [owner, repo, ref, ...rest] = parts;
      return { host: cfg.host, owner, repo, ref, path: rest.join("/") };
    }

    const parts = u.pathname.replace(/^\//, "").split("/").filter(Boolean);
    if (parts.length < 2) return null;
    const [owner, repo, ...after] = parts;
    const kind = after[0];

    if (cfg.provider === "forgejo" && (kind === "src" || kind === "raw" || kind === "media") && after.length >= 4) {
      const ref = after[2];
      const pathParts = after.slice(3);
      return { host: cfg.host, owner, repo, ref, path: pathParts.join("/") };
    }

    if (cfg.provider === "github" && (kind === "blob" || kind === "raw") && after.length >= 3) {
      const browse = after.slice(1);
      let ref, pathParts;
      if (browse[0] === "refs" && (browse[1] === "heads" || browse[1] === "tags") && browse.length >= 4) {
        ref = browse.slice(0, 3).join("/");
        pathParts = browse.slice(3);
      } else {
        ref = browse[0];
        pathParts = browse.slice(1);
      }
      return { host: cfg.host, owner, repo, ref, path: pathParts.join("/") };
    }

    if (after.length === 0) return null;
    return { host: cfg.host, owner, repo, ref: "HEAD", path: after.join("/") };
  }

  _contentsUrl({ host, owner, repo, ref, path }, { withRef = true } = {}) {
    const cfg = this.#hosts.get(host);
    const u = new URL(`${cfg.apiBase}/repos/${owner}/${repo}/contents/${path}`);
    if (withRef && ref && ref !== "HEAD") u.searchParams.set("ref", ref);
    return u.toString();
  }

  _headers(host, accept) {
    const cfg = this.#hosts.get(host) || {};
    const h = { "Accept": accept || (cfg.provider === "github" ? "application/vnd.github.v3+json" : "application/json") };
    if (cfg.token) {
      h["Authorization"] = cfg.provider === "forgejo" ? `token ${cfg.token}` : `Bearer ${cfg.token}`;
    }
    return h;
  }

  _encodeContent(data) {
    const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  async _resolveDefaultBranch(parsed) {
    const cfg = this.#hosts.get(parsed.host);
    const apiUrl = `${cfg.apiBase}/repos/${parsed.owner}/${parsed.repo}`;
    const response = await fetch(apiUrl, { headers: this._headers(parsed.host) });
    if (!response.ok) throw new Error(`Error resolving default branch: ${response.status} ${response.statusText}`);
    const payload = await response.json();
    return payload.default_branch || "main";
  }

  async _getSha(parsed) {
    const apiUrl = this._contentsUrl(parsed);
    const response = await fetch(apiUrl, { headers: this._headers(parsed.host) });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Error reading current sha: ${response.status} ${response.statusText}`);
    const payload = await response.json();
    return Array.isArray(payload) ? null : payload.sha;
  }

  _sniffContentType(path) {
    const ext = path.split(".").pop().toLowerCase();
    const map = {
      html: "text/html; charset=utf-8",
      htm: "text/html; charset=utf-8",
      ttl: "text/turtle",
      jsonld: "application/ld+json",
      json: "application/json",
      md: "text/markdown",
      txt: "text/plain",
      svg: "image/svg+xml",
    };
    return map[ext] || "application/octet-stream";
  }

  async get(url, _headers = {}, _options = {}) {
    const parsed = this._parse(url);
    if (!parsed) throw new Error(`GitForgeStorage: cannot parse URL ${url}`);
    const apiUrl = this._contentsUrl(parsed);
    const response = await fetch(apiUrl, { headers: this._headers(parsed.host) });
    if (!response.ok) {
      const error = new Error(`Error fetching resource: ${response.status} ${response.statusText}`);
      error.status = response.status;
      error.response = response;
      throw error;
    }
    const payload = await response.json();
    if (Array.isArray(payload)) {
      throw new Error(`GitForgeStorage: ${url} is a directory, not a file`);
    }
    const content = payload.encoding === "base64"
      ? new TextDecoder().decode(Uint8Array.from(atob(payload.content.replace(/\n/g, "")), c => c.charCodeAt(0)))
      : payload.content;
    const contentType = this._sniffContentType(parsed.path);
    return new Response(content, {
      status: 200,
      headers: { "Content-Type": contentType, "ETag": payload.sha ? `"${payload.sha}"` : "" },
    });
  }

  async head(url, headers = {}, options = {}) {
    const response = await this.get(url, headers, options);
    return new Response(null, { status: response.status, headers: response.headers });
  }

  async options(_url, _opts = {}) {
    return { headers: new Headers() };
  }

  async getMultiple(resources, _options = {}) {
    return Promise.all(resources.map(async (url) => {
      const response = await this.get(url);
      const contentType = response.headers.get("content-type") || "application/octet-stream";
      return {
        name: url,
        type: contentType.split(";")[0].toLowerCase().trim(),
        content: await response.text(),
      };
    }));
  }

  async put(url, data, _contentType, _links, options = {}) {
    const parsed = this._parse(url);
    if (!parsed) throw new Error(`GitForgeStorage: cannot parse URL ${url}`);
    if (parsed.ref === "HEAD") {
      parsed.ref = await this._resolveDefaultBranch(parsed);
    }
    const apiUrl = this._contentsUrl(parsed, { withRef: false });
    const cfg = this.#hosts.get(parsed.host) || {};
    const branch = parsed.ref.replace(/^refs\/(heads|tags)\//, "");
    const lockKey = `${parsed.host}/${parsed.owner}/${parsed.repo}@${branch}`;

    const send = async (sha) => {
      const body = {
        message: options.message || `Update ${parsed.path}`,
        content: this._encodeContent(data),
        branch,
      };
      if (sha) body.sha = sha;
      const method = (cfg.provider === "forgejo" && !sha) ? "POST" : "PUT";
      return fetch(apiUrl, {
        method,
        headers: { ...this._headers(parsed.host), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    };

    return this.#withBranchLock(lockKey, async () => {
      let sha = await this._getSha(parsed);
      let response = await send(sha);
      if (response.status === 409 || (response.status === 422 && !sha)) {
        sha = await this._getSha(parsed);
        if (sha) response = await send(sha);
      }
      if (!response.ok) {
        const error = new Error(`Error writing resource: ${response.status} ${response.statusText}`);
        error.status = response.status;
        error.response = response;
        throw error;
      }
      const location = this._browseUrl(parsed) || url;
      return new Response(null, { status: 201, headers: { "Location": location } });
    });
  }

  _browseUrl({ host, owner, repo, ref, path }) {
    const cfg = this.#hosts.get(host);
    if (!cfg) return null;
    const branch = (ref || "HEAD").replace(/^refs\/(heads|tags)\//, "");
    if (cfg.provider === "forgejo") {
      return `https://${host}/${owner}/${repo}/src/branch/${branch}/${path}`;
    }
    return `https://${host}/${owner}/${repo}/blob/${branch}/${path}`;
  }

  post(url, slug, data, contentType, _links, options = {}) {
    if (!url) return Promise.reject(new Error("Cannot POST resource - missing url"));
    const target = slug ? url.replace(/\/?$/, "/") + slug : url;
    return this.put(target, data, contentType, null, options);
  }

  async delete(url, options = {}) {
    const parsed = this._parse(url);
    if (!parsed) throw new Error(`GitForgeStorage: cannot parse URL ${url}`);
    if (parsed.ref === "HEAD") {
      parsed.ref = await this._resolveDefaultBranch(parsed);
    }
    const branch = parsed.ref.replace(/^refs\/(heads|tags)\//, "");
    const lockKey = `${parsed.host}/${parsed.owner}/${parsed.repo}@${branch}`;
    const apiUrl = this._contentsUrl(parsed, { withRef: false });

    return this.#withBranchLock(lockKey, async () => {
      const sha = await this._getSha(parsed);
      if (!sha) {
        const error = new Error(`Error deleting resource: 404 Not Found`);
        error.status = 404;
        throw error;
      }
      const body = {
        message: options.message || `Delete ${parsed.path}`,
        sha,
        branch,
      };
      const response = await fetch(apiUrl, {
        method: "DELETE",
        headers: { ...this._headers(parsed.host), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const error = new Error(`Error deleting resource: ${response.status} ${response.statusText}`);
        error.status = response.status;
        error.response = response;
        throw error;
      }
      return response;
    });
  }

  async copy(fromURL, toURL, options = {}) {
    if (!fromURL || !toURL) throw new Error("Missing fromURL or toURL in copy");
    const fetcher = this.matches(new URL(fromURL).host) ? this : null;
    const response = fetcher
      ? await fetcher.get(fromURL, { Accept: "*/*" }, options)
      : await fetch(fromURL, { headers: { Accept: "*/*" } });
    const contents = await response.text();
    return this.put(toURL, contents, null, null, options);
  }

  _ensureExtension(target, contentType) {
    const lastSegment = target.split("/").pop() || "";
    if (lastSegment.includes(".")) return target;
    const ext = contentType && contentType.startsWith("text/markdown") ? "md" : "html";
    return `${target}.${ext}`;
  }

  async save(url, slug, data, options = {}) {
    let target = slug ? url.replace(/\/?$/, "/") + slug : url;
    target = this._ensureExtension(target, options.contentType);
    await this.put(target, data, null, null, options);
    return {
      response: new Response(null, { status: 201, headers: { "Location": target } }),
      message: { content: `Saved document to ${target}`, type: "success" },
    };
  }
}

class StorageRouter {
  constructor({ default: defaultBackend, backends = {} } = {}) {
    this._default = defaultBackend;
    this._backends = backends;
  }

  register(name, backend) {
    this._backends[name] = backend;
    return this;
  }

  backend(name) {
    return this._backends[name];
  }

  for(url, options) {
    if (options && options.backend && this._backends[options.backend]) {
      return this._backends[options.backend];
    }
    if (url && this._backends.gitforge?.matches) {
      try {
        if (this._backends.gitforge.matches(new URL(url).host)) {
          return this._backends.gitforge;
        }
      } catch {}
    }
    return this._default;
  }

  get name() { return "router"; }
  supports(cap) { return this._default.supports(cap); }

  get(url, headers, options)                         { return this.for(url, options).get(url, headers, options); }
  head(url, headers, options)                        { return this.for(url, options).head(url, headers, options); }
  options(url, opts)                                 { return this.for(url, opts).options(url, opts); }
  put(url, data, contentType, links, options)        { return this.for(url, options).put(url, data, contentType, links, options); }
  post(url, slug, data, contentType, links, options) { return this.for(url, options).post(url, slug, data, contentType, links, options); }
  patch(url, data, options)                          { return this.for(url, options).patch(url, data, options); }
  delete(url, options)                               { return this.for(url, options).delete(url, options); }
  copy(fromURL, toURL, options)                      { return this.for(toURL, options).copy(fromURL, toURL, options); }
  getMultiple(resources, options)                    { return this.for(resources?.[0], options).getMultiple(resources, options); }
  save(url, slug, data, options)                     { return this.for(url, options).save(url, slug, data, options); }
  putWithConneg(url, data, options)                  { return this.for(url, options).putWithConneg(url, data, options); }
  patchWithConneg(url, patch, options)               { return this.for(url, options).patchWithConneg(url, patch, options); }
  getAcceptPost(url)                                 { return this.for(url).getAcceptPost(url); }
}

let _router = null;

function initStorage({ default: defaultBackend, backends = {} } = {}) {
  if (_router) return _router;
  const router = new StorageRouter({ default: defaultBackend, backends });
  Object.freeze(router._backends);
  Object.freeze(router);
  _router = router;
  return _router;
}

function storage() {
  if (!_router) throw new Error("Storage not initialized; call initStorage() first");
  return _router;
}

export { StorageBackend, HttpStorage, SolidStorage, GitForgeStorage, StorageRouter, CAPS, initStorage, storage };
