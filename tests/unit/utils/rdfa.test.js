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

import { JSDOM } from "jsdom";
import { describe, it, expect } from "vitest";
import { expandTerm, expandTokens, collectTerms, getPrefixes } from "../../../src/utils/rdfa.js";
import { classifySection } from "../../../src/cv.js";

const SCHEMA = "http://schema.org/";
const FOAF = "http://xmlns.com/foaf/0.1/";

describe("expandTerm", () => {
  const prefixes = { schema: SCHEMA, foaf: FOAF };

  it("expands a known CURIE to a full IRI", () => {
    expect(expandTerm("schema:BusinessEvent", prefixes)).toBe(`${SCHEMA}BusinessEvent`);
    expect(expandTerm("foaf:made", prefixes)).toBe(`${FOAF}made`);
  });

  it("leaves an absolute IRI unchanged", () => {
    expect(expandTerm("http://schema.org/name", prefixes)).toBe("http://schema.org/name");
  });

  it("passes through an unknown prefix unchanged", () => {
    expect(expandTerm("unknown:Thing", prefixes)).toBe("unknown:Thing");
  });

  it("returns empty for empty input and trims", () => {
    expect(expandTerm("", prefixes)).toBe("");
    expect(expandTerm("  schema:name  ", prefixes)).toBe(`${SCHEMA}name`);
  });
});

describe("expandTokens", () => {
  const prefixes = { schema: SCHEMA };

  it("splits whitespace and expands each token", () => {
    const set = expandTokens("schema:Person schema:Thing", prefixes);
    expect(set).toBeInstanceOf(Set);
    expect([...set].sort()).toEqual([`${SCHEMA}Person`, `${SCHEMA}Thing`]);
  });

  it("is empty for falsy input", () => {
    expect(expandTokens("", prefixes).size).toBe(0);
    expect(expandTokens(null, prefixes).size).toBe(0);
  });
});

describe("getPrefixes", () => {
  it("includes the document's standard prefixes from Config", () => {
    const px = getPrefixes();
    expect(px.schema).toBe(SCHEMA);
    expect(px.foaf).toBe(FOAF);
  });
});

describe("collectTerms over a DOM subtree", () => {
  const prefixes = { schema: SCHEMA, foaf: FOAF };
  const section = new JSDOM(`
    <section>
      <h2 property="schema:name">Experience</h2>
      <div property="schema:description">
        <ul>
          <li><dl rel="schema:performerIn" typeof="schema:BusinessEvent">
            <dd property="schema:name"><p>Engineer</p></dd>
          </dl></li>
        </ul>
      </div>
    </section>`).window.document.querySelector("section");

  const terms = collectTerms(
    (cb) => section.querySelectorAll("[typeof],[property],[rel],[rev]").forEach(cb),
    (el, name) => el.getAttribute(name),
    prefixes
  );

  it("collects typeof IRIs from descendants", () => {
    expect(terms.typeof.has(`${SCHEMA}BusinessEvent`)).toBe(true);
  });

  it("collects property and rel IRIs", () => {
    expect(terms.property.has(`${SCHEMA}name`)).toBe(true);
    expect(terms.property.has(`${SCHEMA}description`)).toBe(true);
    expect(terms.rel.has(`${SCHEMA}performerIn`)).toBe(true);
  });
});

describe("classifySection precedence", () => {
  const t = (attr, ...terms) => ({ [attr]: new Set(terms.map((x) => expandTerm(x))) });

  it("identifies an event section by its entry's RDFa type, ignoring a stale marker", () => {
    expect(classifySection({ terms: t("typeof", "schema:BusinessEvent"), marker: "skills" })).toBe("experience");
    expect(classifySection({ terms: t("typeof", "schema:EducationEvent") })).toBe("education");
    expect(classifySection({ terms: t("typeof", "schema:ConferenceEvent") })).toBe("talks");
  });

  it("identifies property-based sections by RDFa", () => {
    expect(classifySection({ terms: t("property", "schema:knowsAbout") })).toBe("skills");
    expect(classifySection({ terms: t("property", "schema:award") })).toBe("awards");
    expect(classifySection({ terms: t("property", "schema:abstract") })).toBe("summary");
    expect(classifySection({ terms: t("rel", "schema:hasCredential") })).toBe("credentials");
  });

  it("falls back to the transient marker when no RDFa signal is present", () => {
    expect(classifySection({ marker: "experience" })).toBe("experience");
    expect(classifySection({ marker: "technical-contributions" })).toBe("technical-contributions");
  });

  it("ignores an unknown marker", () => {
    expect(classifySection({ marker: "not-a-section" })).toBe(null);
  });

  it("falls back to the heading slug last", () => {
    expect(classifySection({ headingText: "Experience" })).toBe("experience");
    expect(classifySection({ headingText: "Scholarly Communication" })).toBe("scholarly-communication");
  });

  it("cannot distinguish the two contribution sections by RDFa alone (shared relations)", () => {
    const shared = { rel: new Set([expandTerm("foaf:made")]), rev: new Set([expandTerm("schema:contributor")]) };
    expect(classifySection({ terms: shared })).toBe(null);
    expect(classifySection({ terms: shared, headingText: "Technical Contributions" })).toBe("technical-contributions");
  });

  it("returns null when nothing identifies the section", () => {
    expect(classifySection({})).toBe(null);
  });
});
