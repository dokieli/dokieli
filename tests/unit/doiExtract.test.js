import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { getGraphFromData } from '../../src/graph.js';
import { LookupServices, extractRDFValues, resolveGraphSubject } from '../../src/services.js';

const turtle = readFileSync('tests/unit/doi-sample.ttl', 'utf8');

describe('DOI RDF extraction', () => {
  it('fills columns from the Crossref Turtle under its dx.doi.org subject', async () => {
    const graph = await getGraphFromData(turtle, {
      subjectURI: 'https://doi.org/10.1007/978-3-319-60131-1_33',
      contentType: 'text/turtle'
    });

    const subject = resolveGraphSubject(
      graph,
      'https://doi.org/10.1007/978-3-319-60131-1_33',
      '10.1007/978-3-319-60131-1_33'
    );
    expect(subject).toBe('http://dx.doi.org/10.1007/978-3-319-60131-1_33');
    const columns = LookupServices.doi.columns.map((column, i) => ({ ...column, name: column.name || `c${i}` }));
    const values = extractRDFValues(graph, subject, columns);

    const byTitle = Object.fromEntries(columns.map((c) => [c.titles, values[c.name]]));

    expect(byTitle.Title.text).toBe('Decentralised Authoring, Annotations and Notifications for a Read-Write Web with dokieli');
    expect(byTitle.Authors.values).toContain('Sarven Capadisli');
    expect(byTitle.Authors.values).toContain('Tim Berners-Lee');
    expect(byTitle.Authors.valueUrl).toBeNull();
    expect(byTitle.Publisher.text).toBe('Springer International Publishing');
    expect(byTitle.Published.text).toBe('2017');
  });
});
