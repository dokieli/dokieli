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
