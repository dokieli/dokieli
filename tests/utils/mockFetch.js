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

export const mockFetch = vi.fn();

export const mockFetchHandler = (responses = {}) => {
  return (input, options) => {
    const url = typeof input === "string" ? input : input.url;

    console.warn("Fetching:", url);

    if (responses[url] && responses[url].ok === false) {
      const error = new Error(
        `Error fetching resource: ${responses[url].status} ${responses[url].statusText}`
      );
      error.status = responses[url].status;
      error.response = responses[url];

      return Promise.reject(new Error(error));
    }
    
    if (responses[url]) {
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        json: () => Promise.resolve({ data: responses[url].data }),
        text: () => Promise.resolve(responses[url].data),
      });    
    }

    console.error(`Unhandled fetch: ${url}`);
    return Promise.reject(new Error(`Unhandled fetch to ${url}`));
  };
};

export const setupMockFetch = (responses) => {
  mockFetch.mockImplementation(mockFetchHandler(responses));
};

export const resetMockFetch = () => {
  vi.clearAllMocks();
};
