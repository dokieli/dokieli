import { uniqueArray, getDateTimeISO, removeChildren, escapeRegExp, generateUUID, generateAttributeId, hashCode, fragmentFromString, getHash, findPreviousDateTime, isValidISBN } from "../../src/util";

describe("util", () => {
  describe("uniqueArray", () => {
    it("returns an array with unique values", () => {
      const nonUniqueArray = [1, 2, 2, 2, 6, 9];
      const result = uniqueArray(nonUniqueArray);
      expect(result).toHaveLength(4);
      expect(result).toEqual([1, 2, 6, 9]);
    });
  });

  describe("getDateTimeISO", () => {
    jest.useFakeTimers().setSystemTime(new Date("April 25, 2022 02:00:00"));
    it("returns a date string", () => {
      const result = getDateTimeISO();
      expect(result).toBe("2022-04-25T02:00:00.000Z");
    });
  });

  describe("removeChildren", () => {
    it("removes first child", () => {
      const node = `<div id='wrapper'><span>test</span></div>`;
      document.body.innerHTML = node;
      removeChildren(document.getElementById("wrapper"));
      expect(document.body.innerHTML.toString()).toMatchInlineSnapshot(
        `"<div id="wrapper"></div>"`
      );
    });
  });

  describe("escapeRegExp", () => {
    it("escape characters in a given string", () => {
      const resultString = escapeRegExp("example (test)");
      expect(resultString).toEqual("example \\(test\\)");
    });
  });

  describe("findPreviousDateTime", () => {
    it("returns the previous date time", () => {
      const times = [
        '2024-11-08T18:18:50.286Z', '2024-11-08T17:50:10.488Z', '2024-11-08T17:31:44.289Z', '2024-11-08T12:45:12.806Z', '2024-11-08T12:38:51.837Z', '2024-11-08T12:35:25.833Z', '2024-11-08T12:20:20.252Z', '2024-11-04T12:13:53.355Z', '2024-11-04T11:40:49.758Z', '2024-11-04T11:29:50.932Z', '2024-11-04T11:29:34.775Z', '2024-11-01T17:27:21.930Z', '2024-11-01T16:38:20.088Z'];
      const checkTime = '2024-11-08T17:41:33.987Z';
      const result = findPreviousDateTime(times, checkTime);
      expect(result).toEqual("2024-11-08T17:31:44.289Z");
    });
  })

  describe("generateUUID", () => {
    it("returns a 36-character-long UUID", () => {
      const result = generateUUID();
      expect(result).toHaveLength(36);
    });
  });

  describe("generateAttributeId", () => {
    it("returns an attribute id given a prefix and a string", () => {
      const id = generateAttributeId("a", "example");
      expect(id).toEqual("aexample");
    });
    it("returns an attribute id given a string and no prefix", () => {
      const id = generateAttributeId(null, "example");
      expect(id).toEqual("example");
    });
    it("returns an attribute id with a suffix if id already in use", () => {
      const node = `<div id='example'><span>test</span></div>`;
      document.body.innerHTML = node;
      const id = generateAttributeId(null, "example");
      expect(id).toMatch(/(example-)/i)

    });
    it("returns a 36-character-long UUID if string is not passed", () => {
      const id = generateAttributeId();
      expect(id).toHaveLength(36);
    });
  });

  describe("hashCode", () => {
    it("retuns a number for a given string", () => {
      const result = hashCode("example string");
      expect(result).toEqual(168766343);
    });
  });

  describe("fragmentFromString", () => {
    it("creates a document fragment from a string", () => {
      const result = fragmentFromString(
        '<div id="wrapper"><span>test</span></div>'
      );
      expect(result).toMatchInlineSnapshot(`
      <DocumentFragment>
        <div
          id="wrapper"
        >
          <span>
            test
          </span>
        </div>
      </DocumentFragment>
      `);
    });
  });

  describe("getHash", () => {
    it("returns a hash for a given message and default algorithm", async () => {
      const hash = await getHash("example");
      expect(hash).toEqual(
        "50d858e0985ecc7f60418aaf0cc5ab587f42c2570a884095a9e8ccacd0f6545c"
      );
    });
    it("returns a hash for a given message and algorithm", async () => {
      const hash = await getHash("example", "SHA-512");
      expect(hash).toEqual(
        "3bb12eda3c298db5de25597f54d924f2e17e78a26ad8953ed8218ee682f0bbbe9021e2f3009d152c911bf1f25ec683a902714166767afbd8e5bd0fb0124ecb8a"
      );
    });
  });
});


describe('isValidISBN', () => {
  it('should return true for a valid ISBN-10', () => {
    const isbn = '123-456-7890'; 
    const result = isValidISBN(isbn);
    expect(result).toBe(true);
  });

  it('should return true for a valid ISBN-13', () => {
    const isbn = '978-1234567890'; 
    const result = isValidISBN(isbn);
    expect(result).toBe(true);
  });

  it('should return false for an invalid ISBN', () => {
    const isbn = '1234567'; 
    const result = isValidISBN(isbn);
    expect(result).toBe(false);
  });

  it('should return false for a string with letters or other invalid characters', () => {
    const isbn = '978-123ABC-7890'; 
    const result = isValidISBN(isbn);
    expect(result).toBe(false);
  });

  it('should return false for an empty string', () => {
    const isbn = ''; 
    const result = isValidISBN(isbn);
    expect(result).toBe(false);
  });
});

describe('findPreviousDateTime', () => {
  it('should return the previous valid date-time before the check time', () => {
    const times = ['2025-04-01T10:00:00', '2025-04-01T12:00:00', '2025-04-01T14:00:00'];
    const checkTime = '2025-04-01T13:00:00';
    const result = findPreviousDateTime(times, checkTime);
    expect(result).toBe('2025-04-01T12:00:00');
  });

  it('should return null if there is no valid previous date-time', () => {
    const times = ['2025-04-01T10:00:00', '2025-04-01T12:00:00'];
    const checkTime = '2025-04-01T09:00:00'; 
    const result = findPreviousDateTime(times, checkTime);
    expect(result).toBeNull();
  });

  it('should return the last date-time if checkTime is later than all times', () => {
    const times = ['2025-04-01T10:00:00', '2025-04-01T12:00:00', '2025-04-01T14:00:00'];
    const checkTime = '2025-04-01T15:00:00';
    const result = findPreviousDateTime(times, checkTime);
    expect(result).toBe('2025-04-01T14:00:00');
  });

  it('should handle an empty array of times', () => {
    const times = [];
    const checkTime = '2025-04-01T10:00:00';
    const result = findPreviousDateTime(times, checkTime);
    expect(result).toBeNull();
  });

  it('should handle duplicate date-times in the array', () => {
    const times = ['2025-04-01T10:00:00', '2025-04-01T10:00:00', '2025-04-01T12:00:00'];
    const checkTime = '2025-04-01T11:00:00';
    const result = findPreviousDateTime(times, checkTime);
    expect(result).toBe('2025-04-01T10:00:00'); 
  });

  it('should correctly handle ISO string format times', () => {
    const times = ['2025-04-01T10:00:00Z', '2025-04-01T12:00:00Z', '2025-04-01T14:00:00Z'];
    const checkTime = '2025-04-01T13:00:00Z';
    const result = findPreviousDateTime(times, checkTime);
    expect(result).toBe('2025-04-01T12:00:00Z');
  });
});