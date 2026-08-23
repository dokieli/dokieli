import { describe, it, expect } from 'vitest';
import { strideTypes, linddunTypes, riskLevels, threatModelElementGroups, THREAT_SELECT_RELS, threatModelTableHTML, threatClassificationSentence, threatModelDefinitionHTML, threatTableRef, defaultThreatCaption } from '../../src/threatModel.js';
import { normalizeHTML } from '../../src/utils/normalization.js';

describe('threat model vocabulary', () => {
  it('offers the six STRIDE types as Wikidata entities', () => {
    const types = strideTypes();
    expect(types).toHaveLength(6);
    expect(types.map((t) => t.label)).toContain('Spoofing');
    expect(types.every((t) => t.value.startsWith('http://www.wikidata.org/entity/Q'))).toBe(true);
  });

  it('offers the seven LINDDUN types with their linddun.org anchors', () => {
    const types = linddunTypes();
    expect(types).toHaveLength(7);
    expect(types.find((t) => t.label === 'Non-repudiation').value).toBe('https://linddun.org/threat-types/#Nr');
    expect(types.find((t) => t.label === 'Non-compliance').value).toBe('https://linddun.org/threat-types/#Nc');
  });

  it('offers the seven DPV RISK levels', () => {
    const levels = riskLevels();
    expect(levels).toHaveLength(7);
    expect(levels.find((l) => l.label === 'Extremely High').value).toBe('https://w3id.org/dpv/risk#ExtremelyHigh');
    expect(levels.find((l) => l.label === 'Moderate').value).toBe('https://w3id.org/dpv/risk#Moderate');
  });

  it('groups all fifty threat-model elements by model', () => {
    const groups = threatModelElementGroups();
    expect(groups[0].options).toHaveLength(16);
    expect(groups[1].options).toHaveLength(34);
    expect(groups[0].options.find((o) => o.label === 'B1 Web Origin Boundary').value)
      .toBe('https://www.w3.org/TR/threat-model-web/#web-origin-boundary');
    expect(groups[1].options.find((o) => o.label === 'B1.8 Local Network Boundary').value)
      .toBe('https://www.w3.org/TR/threat-model-web/#local-network-boundary');
  });
});

describe('threat model save conversion', () => {
  const makeTable = () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <table typeof="schema:Table" resource="#threats" id="threats" rel="schema:hasPart">
        <thead><tr>
          <th>Threat</th>
          <th><select data-select="threat-model-kind"><option selected="selected" value="stride">STRIDE type</option><option value="linddun">LINDDUN type</option></select></th>
          <th>Risk level</th>
        </tr></thead>
        <tbody>
          <tr typeof="dpv:Risk">
            <td property="dcterms:description">Description substitution. An attacker serves a fraudulent description.</td>
            <td><select data-select="threat-type"><option value=""></option><option selected="selected" value="http://www.wikidata.org/entity/Q11081100">Spoofing</option></select></td>
            <td><select data-select="risk-level"><option value=""></option><option selected="selected" value="https://w3id.org/dpv/risk#High">High</option></select></td>
          </tr>
          <tr typeof="dpv:Risk">
            <td property="dcterms:description">Description substitution. A second threat with the same first clause.</td>
            <td><select data-select="threat-type"><option value=""></option><option value="http://www.wikidata.org/entity/Q11081100">Spoofing</option></select></td>
            <td><select data-select="risk-level"><option value=""></option><option value="https://w3id.org/dpv/risk#High">High</option></select></td>
          </tr>
          <tr>
            <td></td>
            <td><select data-select="threat-type"><option value=""></option><option value="http://www.wikidata.org/entity/Q11081100">Spoofing</option></select></td>
            <td><select data-select="risk-level"><option value=""></option><option value="https://w3id.org/dpv/risk#High">High</option></select></td>
          </tr>
        </tbody>
      </table>`;
    return root;
  };

  it('converts chosen selects to anchors with their rels and drops unchosen ones', () => {
    const root = normalizeHTML(makeTable(), {});

    const anchors = root.querySelectorAll('tbody a');
    expect([...anchors].map((a) => a.getAttribute('rel'))).toEqual(['dpv:hasImpact', 'dpv:hasRiskLevel']);
    expect(anchors[0].getAttribute('href')).toBe('http://www.wikidata.org/entity/Q11081100');
    expect(anchors[0].textContent).toBe('Spoofing');
    expect(root.querySelector('select')).toBeNull();
  });

  it('turns the header select into the chosen title text', () => {
    const root = normalizeHTML(makeTable(), {});
    const th = root.querySelectorAll('th')[1];
    expect(th.textContent.trim()).toBe('STRIDE type');
  });

  it('removes rows whose only content was unchosen selects', () => {
    const root = normalizeHTML(makeTable(), {});
    expect(root.querySelectorAll('tbody tr')).toHaveLength(2);
  });

  it('mints readable risk subjects from the threat text, deduplicated', () => {
    const root = normalizeHTML(makeTable(), {});
    const rows = root.querySelectorAll('tr[typeof~="dpv:Risk"]');
    expect(rows[0].getAttribute('about')).toBe('#risk-description-substitution');
    expect(rows[0].getAttribute('id')).toBe('risk-description-substitution');
    expect(rows[1].getAttribute('about')).toBe('#risk-description-substitution-2');
  });

  it('renders an attribute-stated mitigation as the nested measure pattern', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <table typeof="schema:Table">
        <tbody><tr typeof="dpv:Risk">
          <td property="dcterms:description">Bad thing. Details.</td>
          <td rel="dpv:isMitigatedByMeasure" resource="#mitigation-bad-thing"><p>Do good.</p></td>
        </tr></tbody>
      </table>`;
    const out = normalizeHTML(root, {});

    const td = out.querySelector('td[rel="dpv:isMitigatedByMeasure"]');
    expect(td.hasAttribute('resource')).toBe(false);
    const span = td.querySelector('span');
    expect(span.getAttribute('about')).toBe('#mitigation-bad-thing');
    expect(span.getAttribute('id')).toBe('mitigation-bad-thing');
    expect(span.getAttribute('property')).toBe('dcterms:description');
    expect(span.getAttribute('typeof')).toBe('dpv:RiskMitigationMeasure');
    expect(span.textContent).toBe('Do good.');
  });

  it('strips table configuration attributes from the output', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <table typeof="schema:Table" data-subject="#x" data-about-url="#risk-{_slug_threat}">
        <thead><tr><th data-name="threat" data-titles="Threat" data-property-url="dcterms:description">Threat</th></tr></thead>
        <tbody><tr><td>Something</td></tr></tbody>
      </table>`;
    const out = normalizeHTML(root, {});

    expect(out.querySelector('[data-subject], [data-about-url], [data-name], [data-titles], [data-property-url]')).toBeNull();
    expect(out.querySelector('table').getAttribute('typeof')).toBe('schema:Table');
  });

  it('builds the classification sentence per the AC pattern', () => {
    const stride = threatTableRef(defaultThreatCaption('stride'), 'stride');
    const linddun = threatTableRef(defaultThreatCaption('linddun'), 'linddun');

    expect(stride.id).toBe('security-threats-and-mitigations');

    const strideOnly = threatClassificationSentence([stride]);
    expect(strideOnly).toContain('href="#security-threats-and-mitigations"');
    expect(strideOnly).toContain('>Security Threats</a> are classified by a');
    expect(strideOnly).toContain('STRIDE_model');
    expect(strideOnly).not.toContain('LINDDUN');

    const linddunOnly = threatClassificationSentence([linddun]);
    expect(linddunOnly).toContain('>Privacy Threats</a> are classified by a');
    expect(linddunOnly).toContain('linddun.org');

    const both = threatClassificationSentence([stride, linddun]);
    expect(both).toContain('STRIDE</a> threat type and');
    expect(both).toContain('>Privacy Threats</a> by a');

    expect(threatClassificationSentence([])).toBe('');
  });

  it('the definition paragraph carries the framework citations and risk sentence', () => {
    const html = threatModelDefinitionHTML([threatTableRef(defaultThreatCaption(), 'stride')]);
    expect(html).toContain('id="threat-model-definition"');
    expect(html).toContain('threat-model-web');
    expect(html).toContain('privacy-principles');
    expect(html).toContain('Each threat is assigned a risk level');
    expect(html).toContain('DPV-RISK');

    // Without tables, the classification sentence is simply absent.
    const bare = threatModelDefinitionHTML([]);
    expect(bare).not.toContain('Security Threats');
    expect(bare).toContain('Each threat is assigned');
  });

  it('renders a ready-to-edit threat table for section templates', () => {
    const root = document.createElement('div');
    root.innerHTML = threatModelTableHTML();

    const table = root.querySelector('table');
    expect(table.getAttribute('data-typeof')).toBe('dpv:Risk');
    expect(table.getAttribute('data-about-url')).toBe('#risk-{_slug_threat}');
    expect(root.querySelector('caption').textContent).toBe('Security Threats and Mitigations');

    const ths = root.querySelectorAll('th');
    expect(ths).toHaveLength(6);
    expect(ths[1].getAttribute('data-property-url')).toBe('dcterms:description');
    expect(ths[2].querySelector('select[data-select="threat-model-kind"] option[selected]').getAttribute('value')).toBe('stride');

    const typeSelect = root.querySelector('td select[data-select="threat-type"]');
    expect(typeSelect.getAttribute('data-framework')).toBe('stride');
    expect(typeSelect.querySelectorAll('option')).toHaveLength(7);
    expect(typeSelect.querySelector('option[value=""]').textContent).toBe('Select threat type');

    expect(root.querySelectorAll('td select[data-select="threat-element"] optgroup')).toHaveLength(2);
    expect(root.querySelectorAll('td select[data-select="risk-level"] option')).toHaveLength(8);
  });

  it('maps each select kind to its relation', () => {
    expect(THREAT_SELECT_RELS['threat-type']).toBe('dpv:hasImpact');
    expect(THREAT_SELECT_RELS['threat-element']).toBe('dcat:theme');
    expect(THREAT_SELECT_RELS['risk-level']).toBe('dpv:hasRiskLevel');
  });
});
