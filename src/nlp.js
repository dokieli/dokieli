import nlp from "compromise";
//https://compromise.cool/
//https://observablehq.com/@spencermountain/compromise-accuracy

// types here must be singular
//XXX: We will have this discusion later!
const lexicon = {
  "dokieli": "Organization",
  "W3C": "Organization",
  "Sarven Capadisli": "Person",
  "Sarven": "Person",
  "Virginia Balseiro": "Person",
  "Wiesbaden": "Place"
}

export const entityNamesMap = {
  "person": "People",
  "organization": "Organizations",
  "place": "Places"
};

export function extractEntitiesFromText(text) {
  text = text.replace('.', '')
  const doc = nlp(text, lexicon);
  // doc.normalize();

  function extractTypedMatches(type, selection) {
    return selection.json({ offset: true }).map(entry => {
      const terms = entry.terms;

      if (!terms.length) return null;

      const first = terms[0].offset;
      const last  = terms[terms.length - 1].offset;
      const start = first.start;
      const end   = last.start + last.length;

      return {
        type,
        text: entry.text.replace(/[.,!?]/g, ''),
        start,
        end,
        length: end - start,
        tokenIndex: terms[0].index[1],
      };
    }).filter(Boolean);
  }

  const people = extractTypedMatches("person", doc.people());
  const places = extractTypedMatches("place",  doc.places());
  const orgs = extractTypedMatches("organization", doc.organizations());
  const acronymsRaw = doc.acronyms().json({ offset: true });
  const acronyms = acronymsRaw
    .map(entry => {
      const t = entry.terms[0];
      return {
        type: "acronym",
        text: entry.text,
        start: t.offset.start,
        end: t.offset.start + t.offset.length,
        length: t.offset.length,
        tokenIndex: t.index[1],
      };
    })
    .filter(item => !orgs.some(o => o.text === item.text));

  return {
    people,
    organizations: orgs,
    places,
    acronyms,
    all: [...people, ...orgs, ...places, ...acronyms]
  };
}
