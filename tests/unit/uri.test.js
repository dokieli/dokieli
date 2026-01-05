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

import { encodeString, decodeString, getAbsoluteIRI, stripFragmentFromString, getFragmentFromString, getBaseURL, getPathURL, forceTrailingSlash, getProxyableIRI, getURLLastPath, getProxyURL, getParentURLPath, getFragmentOrLastPath, generateDataURI, getPrefixedNameFromIRI, getMediaTypeURIs, isHttpOrHttpsProtocol, isFileProtocol, svgToDataURI } from "../../src/uri";
import Config from 'src/config.js';

describe("uri", () => {
  const ENCODED_URL = "https%3A%2F%2Fexample.com";
  const DECODED_URL = "https://example.com";
  const URL_WITHOUT_QUERY_WITHOUT_FRAGMENT = "https://example.com/profile/card";
  const URL_WITHOUT_QUERY_WITH_FRAGMENT = "https://example.com/profile/card#me";
  const URL_WITH_QUERY_WITHOUT_FRAGMENT = "https://example.com/profile/card?foo=bar";
  const URL_WITH_QUERY_WITH_FRAGMENT = "https://example.com/profile/card?foo=bar#me";
  const URL_ENDING_WITH_SLASH = "https://example.com/profile/";
  const URL_ENDING_WITHOUT_SLASH = "https://example.com/profile";

  describe("encodeString", () => {
    it("returns an encoded URL", () => {
      const result = encodeString(DECODED_URL);
      expect(result).toEqual(ENCODED_URL);
    });
  });

  describe("decodeString", () => {
    it("returns a decoded URL", () => {
      const result = decodeString(ENCODED_URL);
      expect(result).toEqual(DECODED_URL);
    });
  });

  describe("getAbsoluteIRI", () => {
    it("returns correct IRI for a container relative path", () => {
      const result = getAbsoluteIRI(DECODED_URL, "/example/");
      expect(result).toEqual(`${DECODED_URL}/example/`);
    });
    it("returns correct IRI for a resource relative path", () => {
      const result = getAbsoluteIRI(DECODED_URL, "/example");
      expect(result).toEqual(`${DECODED_URL}/example`);
    });
    it("returns correct IRI for a full IRI", () => {
      const result = getAbsoluteIRI(DECODED_URL, "https://example.com");
      expect(result).toEqual(DECODED_URL);
    });
  });

  describe("stripFragmentFromString", () => {
    it("returns a string without fragment", () => {
      const result = stripFragmentFromString(URL_WITHOUT_QUERY_WITH_FRAGMENT);
      expect(result).toEqual(URL_WITHOUT_QUERY_WITHOUT_FRAGMENT);
    });
  });
  
  describe("getFragmentFromString", () => {
    it("returns fragment from a given string", () => {
      const result = getFragmentFromString(URL_WITHOUT_QUERY_WITH_FRAGMENT);
      expect(result).toEqual("me");
    });
    it("returns fragment from a given string", () => {
      const result = getFragmentFromString(URL_WITHOUT_QUERY_WITHOUT_FRAGMENT);
      expect(result).toEqual("");
    });
  });

  describe("getBaseUrl", () => {
    it("returns the base URL for a given URL", () => {
      const result = getBaseURL(URL_WITHOUT_QUERY_WITH_FRAGMENT);
      expect(result).toEqual(URL_ENDING_WITH_SLASH);
    });
  });

  describe("getPathUrl", () => {
    it("returns input if not string", () => {
      const result = getPathURL({});
      expect(result).toEqual({});
    });
    it("returns path URL for URL without query and without fragment", () => {
      const result = getPathURL(URL_WITHOUT_QUERY_WITHOUT_FRAGMENT);
      expect(result).toEqual(URL_WITHOUT_QUERY_WITHOUT_FRAGMENT);
    });
    it("returns path URL for URL without query and with fragment", () => {
      const result = getPathURL(URL_WITHOUT_QUERY_WITH_FRAGMENT);
      expect(result).toEqual(URL_WITHOUT_QUERY_WITHOUT_FRAGMENT);
    });
    it("returns path URL for URL with query and without fragment", () => {
      const result = getPathURL(URL_WITH_QUERY_WITHOUT_FRAGMENT);
      expect(result).toEqual(URL_WITHOUT_QUERY_WITHOUT_FRAGMENT);
    });
    it("returns path URL for URL with query and with fragment", () => {
      const result = getPathURL(URL_WITH_QUERY_WITH_FRAGMENT);
      expect(result).toEqual(URL_WITHOUT_QUERY_WITHOUT_FRAGMENT);
    });
  });

  describe("forceTrailingSlash", () => {
    it("returns string without slash ending with slash", () => {
      const result = forceTrailingSlash( URL_ENDING_WITHOUT_SLASH);
      expect(result).toEqual(URL_ENDING_WITH_SLASH);
    });
    it("returns string with slash ending with slash", () => {
      const result = forceTrailingSlash( URL_ENDING_WITH_SLASH);
      expect(result).toEqual(URL_ENDING_WITH_SLASH);
    });
  });

  describe('stripFragmentFromString', () => {
    it('removes fragment from string', () => {
      expect(stripFragmentFromString('http://example.com#section')).toBe('http://example.com');
    });
  
    it('returns the string unchanged if no fragment', () => {
      expect(stripFragmentFromString('http://example.com')).toBe('http://example.com');
    });
  
    it('returns input as-is if not a string', () => {
      expect(stripFragmentFromString(123)).toBe(123);
    });
  });
  
  describe('getProxyURL', () => {
    it('returns proxyURL from options if present', () => {
      expect(getProxyURL({ proxyURL: 'https://proxy.com/' })).toBe('https://proxy.com/');
    });
  
    it('returns Config.User.ProxyURL if no proxyURL in options', () => {
      Config.User.ProxyURL = 'https://config-proxy.com/';
      expect(getProxyURL({})).toBe('https://config-proxy.com/');
    });
  
    it('returns undefined if no proxyURL in options or Config', () => {
      Config.User.ProxyURL = undefined;
      expect(getProxyURL({})).toBe(undefined);
    });
  });
  
  describe('getProxyableIRI', () => {
    afterEach(() => {
      vi.restoreAllMocks();
      Config.User.ProxyURL = undefined;
    });
  
    it('returns IRI without fragment', () => {
      expect(getProxyableIRI('http://example.com/page#frag')).toBe('http://example.com/page');
    });
  
    it('uses proxy for http IRI on https page', () => {
      Config.User.ProxyURL = 'https://proxy.com/';
      window.document = { location: { protocol: 'https:' } };
      expect(getProxyableIRI('http://example.com/resource')).toBe('https://proxy.com/http%3A%2F%2Fexample.com%2Fresource');
    });
  
    it('skips proxy if not on https', () => {
      expect(getProxyableIRI('http://example.com')).toBe('http://example.com/');
    });
  
    it('forces proxy if forceProxy option is set', () => {
      expect(getProxyableIRI('http://example.com', { forceProxy: true, proxyURL: 'https://customproxy/' }))
        .toBe('https://customproxy/http%3A%2F%2Fexample.com%2F');
    });
  
    it('throws on invalid URL', () => {
      expect(() => getProxyableIRI('::::badurl::::')).toThrow(/Invalid URL provided/);
    });
  });

  describe('getURLLastPath', () => {
    it('returns the last segment of the path', () => {
      expect(getURLLastPath('http://example.org/foo/bar')).toBe('bar');
    });
  
    it('returns empty string if URL ends with slash', () => {
      expect(getURLLastPath('http://example.org/foo/bar/')).toBe('');
    });
  
    it('throws error with invalid URL string', () => {
      expect(() => getURLLastPath('just-a-string')).toThrow('Invalid URL: just-a-string');
    });
  
    it('returns non-string input unchanged', () => {
      expect(getURLLastPath(null)).toBe(null);
      expect(getURLLastPath({})).toEqual({});
    });
  });
  
  describe('getParentURLPath', () => {
    it('returns the parent path correctly', () => {
      expect(getParentURLPath('https://example.com/a/b/c/d')).toBe('https://example.com/a/b/');
      expect(getParentURLPath('http://example.org/foo/bar')).toBe('http://example.org/');
    });
  
    it('returns undefined if pathname is root (/)', () => {
      expect(getParentURLPath('http://example.org/')).toBeUndefined();
    });
  
    it('handles URLs with query params and hashes', () => {
      expect(getParentURLPath('http://example.org/foo/bar/baz?x=1#abc')).toBe('http://example.org/foo/');
    });
  
    it('returns non-string input unchanged', () => {
      expect(getParentURLPath(null)).toBe(null);
      expect(getParentURLPath(123)).toBe(123);
    });
  });
  
  describe('getFragmentOrLastPath', () => {
    it('returns fragment if present', () => {
      expect(getFragmentOrLastPath('https://example.com/page#section1')).toBe('section1');
    });
  
    it('returns last path segment if no fragment', () => {
      expect(getFragmentOrLastPath('https://example.com/foo/bar')).toBe('bar');
    });
  
    // it('handles trailing slash correctly', () => {
    //   expect(getFragmentOrLastPath('https://example.com/foo/bar/')).toBe('bar');
    // });
  
    it('handles root URL with no fragment', () => {
      expect(getFragmentOrLastPath('https://example.com/')).toBe('');
    });
  });

  describe('generateDataURI', () => {
    it('generates plain text data URI if no mediaType is given', () => {
      const result = generateDataURI(null, null, 'hello');
      expect(result).toBe('data:text/plain;charset=US-ASCII,hello');
    });
  
    it('generates URI with mediaType and no encoding', () => {
      const result = generateDataURI('text/html', null, '<div>');
      expect(result).toBe('data:text/html,%3Cdiv%3E');
    });
  
    it('generates base64-encoded data URI when encoding is base64', () => {
      const result = generateDataURI('image/png', 'base64', '1234');
      expect(result).toBe(`data:image/png;base64,${btoa('1234')}`);
    });
  
    it('handles empty data correctly', () => {
      const result = generateDataURI('text/plain', null, '');
      expect(result).toBe('data:text/plain,');
    });
  });
  

  describe("getPrefixedNameFromIRI", () => {
    it("returns prefixed name if namespace is matched", () => {
      expect(getPrefixedNameFromIRI("http://schema.org/Person")).toBe(
        "schema:Person"
      );
    });

    it("returns IRI if namespace is not matched", () => {
      expect(getPrefixedNameFromIRI("http://example.com/unknown#Thing")).toBe(
        "http://example.com/unknown#Thing"
      );
    });

    it("returns original string if no slash or hash", () => {
      expect(getPrefixedNameFromIRI("bareword")).toBe("bareword");
    });

    it("handles IRIs with # not in prefixes", () => {
      expect(getPrefixedNameFromIRI("http://schema.org/#name")).toBe(
        "http://schema.org/#name"
      );
    });
  });
describe('getMediaTypeURIs', () => {
  it('generates IANA URIs from single media type string', () => {
    expect(getMediaTypeURIs('text/html')).toEqual([
      'http://www.w3.org/ns/iana/media-types/text/html#Resource'
    ]);
  });

  it('generates IANA URIs from array of media types', () => {
    expect(getMediaTypeURIs(['text/html', 'application/json'])).toEqual([
      'http://www.w3.org/ns/iana/media-types/text/html#Resource',
      'http://www.w3.org/ns/iana/media-types/application/json#Resource'
    ]);
  });
});
describe('isHttpOrHttpsProtocol', () => {
  it('returns true for http URL', () => {
    expect(isHttpOrHttpsProtocol('http://example.com')).toBe(true);
  });

  it('returns true for https URL', () => {
    expect(isHttpOrHttpsProtocol('https://example.com')).toBe(true);
  });

  it('returns false for file URL', () => {
    expect(isHttpOrHttpsProtocol('file:///tmp/file.txt')).toBe(false);
  });

  it('returns false for invalid URL', () => {
    expect(isHttpOrHttpsProtocol('not a url')).toBe(false);
  });
});
describe('isFileProtocol', () => {
  it("returns true for file URL", () => {
    expect(isFileProtocol("file:///Users/you/file.txt")).toBe(true);
  });

  it('returns false for https URL', () => {
    expect(isFileProtocol('https://example.com')).toBe(false);
  });

  it('returns false for invalid URL', () => {
    expect(isFileProtocol('broken url')).toBe(false);
  });
});
describe('svgToDataURI', () => {
  it('removes unwanted attributes and compresses the SVG', () => {
    const input = `<svg class="icon" fill="#000"><path d="M0 0h24v24H0z"/></svg>`;
    const result = svgToDataURI(input);

    expect(result.startsWith('data:image/svg+xml,')).toBe(true);
    expect(result).not.toContain('class="');
    expect(result).not.toContain('fill="');
    expect(result).not.toContain('\n');
    expect(result).toContain('%3csvg');
  });

  it('works with clean minimal SVG', () => {
    const input = `<svg><circle cx="50" cy="50" r="40" /></svg>`;
    const result = svgToDataURI(input);
    expect(result).toBe("data:image/svg+xml,%3csvg%3e%3ccircle cx='50' cy='50' r='40' /%3e%3c/svg%3e");
  });
});
});

