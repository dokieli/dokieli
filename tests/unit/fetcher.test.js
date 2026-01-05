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

import {
  getResource,
  setAcceptRDFTypes,
  getResourceHead,
  getResourceOptions,
  authFetch
} from "src/fetcher";
import { setupMockFetch, resetMockFetch, mockFetch } from "../utils/mockFetch";
import { Session } from "@uvdsl/solid-oidc-client-browser";
import Config from "src/config";

Config['Session'] = new Session();

describe("fetcher", () => {
  beforeEach(() => {
    vi.spyOn(global, "fetch").mockImplementation(mockFetch);
    // vi.spyOn(Session, "authFetch").mockImplementation(mockFetch);
  });

  afterEach(() => {
    resetMockFetch();
  });

  describe("getResource", () => {
    test("should throw error", async () => {
      const iri = "http://example.com/nonexistent-resource";
      const headers = { Accept: "text/turtle" };
      const options = {};

      setupMockFetch({
        "http://example.com/resource": {
          ok: true,
          status: 500,
          json: async () => ({ message: "mocked error" }),
        },
      });

      await expect(getResource(iri, headers, options)).rejects.toThrow(
        "Error fetching resource"
      );
    });

    test("should return a resource", async () => {
      const iri = 'http://example.com/resource';
      const headers = { Accept: 'text/turtle' };
      const options = {};
  
      setupMockFetch({
        [iri]: { 
          ok: true,
          status: 200,
          statusText: 'OK',
          data: 'mocked data' }, 
      });
  
      const response = await getResource(iri, headers, options);
  
      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      const jsonData = await response.json(); 
      expect(jsonData).toEqual({ data: 'mocked data' });
    });
  });

  describe("setAcceptRDFTypes", () => {
    test("should return the correct accept types", () => {
      const options = {};

      const result = setAcceptRDFTypes(options);

      expect(result).toEqual(
        "text/turtle,application/ld+json,application/activity+json,text/html;q=0.9,image/svg+xml;q=0.9,application/rdf+xml"
      );
    });

    test("should return the correct accept types with options", () => {
      const excludeMarkupOptions = {
        excludeMarkup: true
      };

      const defaultExcludeMarkupOptions = {
        excludeMarkup: false
      };


      const resultWithExclude = setAcceptRDFTypes(excludeMarkupOptions);
      const resultDefaultWithoutExclude = setAcceptRDFTypes(defaultExcludeMarkupOptions);

      expect(resultWithExclude).toEqual(
        "text/turtle,application/ld+json,application/activity+json,application/rdf+xml"
      );

      expect(resultDefaultWithoutExclude).toEqual(
        "text/turtle,application/ld+json,application/activity+json,text/html;q=0.9,image/svg+xml;q=0.9,application/rdf+xml"
      );
    });
  });

  describe("getResourceHead", () => {
    test("should throw error when response is not ok", async () => {
      const url = "http://example.com/resource";
      const options = {};

      setupMockFetch({
        "http://example.com/resource": {
          ok: false,
          status: 404,
          statusText: "Not Found",
        },
      });

      await expect(getResourceHead(url, options)).rejects.toThrow(
        "Error fetching resource"
      );
    });

    test("should return response when response is ok", async () => {
      const url = "http://example.com/resource";
      const options = {};

      // Mock the fetch function to resolve with a response that is ok
      vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
      });

      const result = await getResourceHead(url, options);

      expect(result).toEqual({ ok: true, status: 200, statusText: "OK" });
    });
  });

  describe("getResourceOptions", () => {
    test("should return resource options with default values", async () => {
      const url = "http://example.com/resource";
      const options = {};

      // Mock the fetch function to resolve with a response
      vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: {
          get: () => "text/turtle",
        },
      });

      const result = await getResourceOptions(url, options);

      expect(result.headers.get()).toEqual("text/turtle");
    });

    test("should throw error when response is not ok", async () => {
      const url = "http://example.com/resource";
      const options = {};

      // Mock the fetch function to resolve with a response that is not ok
      vi.spyOn(global, "fetch").mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      await expect(getResourceOptions(url, options)).rejects.toThrow(
        "Error fetching resource OPTIONS: 404 Not Found"
      );
    });

    test("should throw error when specific header is not present", async () => {
      const url = "http://example.com/resource";
      const options = { header: "X-Custom-Header" };

      // Mock the fetch function to resolve with a response
      vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: {
          get: () => null,
        },
      });

      await expect(getResourceOptions(url, options)).rejects.toThrow(
        "OPTIONS without X-Custom-Header header: 200 OK"
      );
    });

    test("should return specific header value", async () => {
      const url = "http://example.com/resource";
      const options = { header: "X-Custom-Header" };

      // Mock the fetch function to resolve with a response
      vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: {
          get: () => "custom-value",
        },
      });

      const result = await getResourceOptions(url, options);

      expect(result).toEqual({ headers: "custom-value" });
    });
  });
});


describe('authFetch', () => {
  test('should call Config.Session.authFetch with a Request object', async () => {
    const url = 'http://example.com/protected-resource';
    const options = { method: 'GET', headers: { Authorization: 'Bearer token' } };

    const mockAuthFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ message: 'success' }),
    });

    Config['Session'].authFetch = mockAuthFetch;

    const response = await authFetch(url, options);

    expect(mockAuthFetch).toHaveBeenCalledTimes(1);

    const calledRequest = mockAuthFetch.mock.calls[0][0];
    expect(calledRequest).toBeInstanceOf(Request);
    expect(calledRequest.url).toBe(url);
    expect(calledRequest.method).toBe(options.method);
    expect(calledRequest.headers.get('Authorization')).toBe('Bearer token');

    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data).toEqual({ message: 'success' });
  });
});

describe("setAcceptRDFTypes", () => {
  beforeAll(() => {
    Config.MediaTypes = {
      RDF: [
        "text/turtle",
        "application/ld+json",
        "application/activity+json",
        "text/html",
        "image/svg+xml",
        "application/rdf+xml"
      ],
      Markup: [
        "text/html",
        "image/svg+xml"
      ]
    };
  });

  test("returns all RDF media types with markup types weighted when excludeMarkup is false or omitted", () => {
    const result = setAcceptRDFTypes();
    expect(result).toBe(
      "text/turtle,application/ld+json,application/activity+json,text/html;q=0.9,image/svg+xml;q=0.9,application/rdf+xml"
    );
  });

  test("excludes markup media types when excludeMarkup is true", () => {
    const result = setAcceptRDFTypes({ excludeMarkup: true });
    expect(result).toBe(
      "text/turtle,application/ld+json,application/activity+json,application/rdf+xml"
    );
  });
});