import { describe, it, expect } from 'vitest';
import { renderCellHTML, buildCellRDFa, computeRowSubject, getColumnAttributes, getColumnSchema } from '../../src/table.js';
import { LookupServices, extractJSONValue, extractJSONValues, isValidISBN, looksLikeIdentifier } from '../../src/services.js';

const service = LookupServices.openlibrary;

describe('Open Library output matches the library pattern', () => {
  it('row subject minted from the ISBN', () => {
    const subject = computeRowSubject(service.tableSchema, { isbn: '9780451089977' }, null);
    expect(subject).toBe('urn:isbn:9780451089977');
  });

  it('ISBN cell: plain literal, no datatype', () => {
    const [isbnColumn] = service.columns;
    const html = renderCellHTML({ ...isbnColumn }, '9780451089977', { rowSubject: 'urn:isbn:9780451089977', fillValues: {} });
    expect(html).toBe('<td property="schema:isbn" lang="" xml:lang="">9780451089977</td>');
  });

  it('Published cell: <time> with inferred gYear datatype', () => {
    const published = { ...service.columns.find((c) => c.titles === 'Published'), name: 'published' };
    const html = renderCellHTML(published, '1988', { fillValues: {} });
    expect(html).toBe('<td><time datetime="1988" property="schema:datePublished" datatype="xsd:gYear">1988</time></td>');
  });

  it('Published cell: <time> with inferred date datatype', () => {
    const published = { ...service.columns.find((c) => c.titles === 'Published'), name: 'published' };
    const html = renderCellHTML(published, '1968-04-01', { fillValues: {} });
    expect(html).toBe('<td><time datetime="1968-04-01" property="schema:datePublished" datatype="xsd:date">1968-04-01</time></td>');
  });

  it('Published cell: unrecognised format keeps <time> but no datatype', () => {
    const published = { ...service.columns.find((c) => c.titles === 'Published'), name: 'published' };
    const html = renderCellHTML(published, 'March 1988', { fillValues: {} });
    expect(html).toBe('<td><time property="schema:datePublished">March 1988</time></td>');
  });

  it('a declared temporal datatype wraps in <time> without the flag', () => {
    const html = renderCellHTML(
      { name: 'updated', propertyUrl: 'schema:dateModified', datatype: 'dateTime' },
      '2026-04-19T10:38:21Z',
      { fillValues: {} }
    );
    expect(html).toBe('<td><time datetime="2026-04-19T10:38:21Z" property="schema:dateModified" datatype="xsd:dateTime">2026-04-19T10:38:21Z</time></td>');
  });

  it('Title cell: anchor with rel=schema:url and property=schema:name', () => {
    const titleColumn = { ...service.columns[1], name: 'title' };
    const html = renderCellHTML(
      { ...titleColumn, valueUrl: 'https://openlibrary.org/books/OL7058607M/2001' },
      '2001: a space odyssey',
      { rowSubject: 'urn:isbn:9780451089977', fillValues: {} }
    );
    expect(html).toBe('<td><a href="https://openlibrary.org/books/OL7058607M/2001" rel="schema:url" property="schema:name">2001: a space odyssey</a></td>');
  });

  it('Author cell: plain literal', () => {
    const authorColumn = { ...service.columns[2], name: 'author' };
    const html = renderCellHTML(authorColumn, 'Arthur C. Clarke', { rowSubject: 'urn:isbn:9780451089977', fillValues: {} });
    expect(html).toBe('<td property="schema:author" lang="" xml:lang="">Arthur C. Clarke</td>');
  });

  it('valueRel round-trips through column attributes', () => {
    const attrs = getColumnAttributes(service.columns[1]);
    expect(attrs['data-value-rel']).toBe('schema:url');
    expect(attrs['data-lookup-url-source']).toBe('url');
    expect(getColumnSchema(attrs).valueRel).toBe('schema:url');
    expect(getColumnSchema(attrs).lookup.urlSource).toBe('url');
  });

  it('a link column without valueRel keeps rel=propertyUrl', () => {
    const built = buildCellRDFa(
      { name: 'author', propertyUrl: 'schema:author', valueUrl: 'http://www.wikidata.org/entity/Q47087' },
      'Arthur C. Clarke',
      { fillValues: {} }
    );
    expect(built.child.attributes).toEqual({ href: 'http://www.wikidata.org/entity/Q47087', rel: 'schema:author' });
  });

  it('Cover cell: img keeps alt="" and carries measured dimensions', () => {
    const cover = { ...service.columns.find((c) => c.titles === 'Cover'), name: 'cover' };
    const html = renderCellHTML(cover, 'https://covers.openlibrary.org/b/id/240727-M.jpg', {
      fillValues: {},
      imageSize: { width: 180, height: 270 }
    });
    expect(html).toContain('src="https://covers.openlibrary.org/b/id/240727-M.jpg"');
    expect(html).toContain('alt=""');
    expect(html).toContain('width="180"');
    expect(html).toContain('height="270"');
    expect(html).toContain('property="schema:image"');
  });

  it('Cover cell: no dimensions when none were measured', () => {
    const cover = { ...service.columns.find((c) => c.titles === 'Cover'), name: 'cover' };
    const html = renderCellHTML(cover, 'https://covers.openlibrary.org/b/id/240727-M.jpg', { fillValues: {} });
    expect(html).toContain('alt=""');
    expect(html).not.toContain('width=');
    expect(html).not.toContain('height=');
  });

  it('multiple authors: one span per author, none on the td', () => {
    const author = { ...service.columns.find((c) => c.titles === 'Authors'), name: 'author' };
    const html = renderCellHTML(author, 'Ursula K. Le Guin, Someone Else', {
      fillValues: {},
      textValues: ['Ursula K. Le Guin', 'Someone Else']
    });
    expect(html).toBe('<td><span property="schema:author" lang="" xml:lang="">Ursula K. Le Guin</span>, <span property="schema:author" lang="" xml:lang="">Someone Else</span></td>');
  });

  it('a single author keeps the property on the td', () => {
    const author = { ...service.columns.find((c) => c.titles === 'Authors'), name: 'author' };
    const html = renderCellHTML(author, 'Arthur C. Clarke', { fillValues: {} });
    expect(html).toBe('<td property="schema:author" lang="" xml:lang="">Arthur C. Clarke</td>');
  });

  it('extractJSONValues returns each author separately', () => {
    const record = { authors: [{ name: 'A' }, { name: 'B' }] };
    expect(extractJSONValues(record, 'authors.*.name')).toEqual(['A', 'B']);
    expect(extractJSONValue(record, 'authors.*.name')).toBe('A, B');
  });

  it('ISBN check digits gate the lookup', () => {
    expect(isValidISBN('9780451089977')).toBe(true);
    expect(isValidISBN('978-0-451-08997-7')).toBe(true);
    expect(isValidISBN('9780451089978')).toBe(false);
    expect(isValidISBN('080442957X')).toBe(true);
    expect(isValidISBN('0804429571')).toBe(false);
    expect(isValidISBN('not an isbn')).toBe(false);

    const lookup = { service: 'openlibrary' };
    expect(looksLikeIdentifier(lookup, '9780451089977')).toBe(true);
    expect(looksLikeIdentifier(lookup, '9780451089978')).toBe(false);
  });

  it('urlSource pulls the page URL out of a jscmd=data record', () => {
    const record = { url: 'https://openlibrary.org/books/OL7058607M/2001', title: '2001' };
    expect(extractJSONValue(record, 'url')).toBe('https://openlibrary.org/books/OL7058607M/2001');
  });
});
