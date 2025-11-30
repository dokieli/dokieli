import nlp from "compromise";
//https://compromise.cool/
// https://observablehq.com/@spencermountain/compromise-accuracy

// types here must be singular
const lexicon = {
  "dokieli": "Organization",
  "W3C": "Organization",
  "Sarven Capadisli": "Person",
  "Sarven": "Person",
  "Virginia Balseiro": "Person",
}

export function extractEntitiesFromText(text) {
  text = text.replace('.', '')
  let doc = nlp(text, lexicon);
  doc.normalize();

  // Get named entities
  const people = [...new Set(doc.people().out("array"))];
  const organizations = [...new Set(doc.organizations().out("array"))];
  const places = [...new Set(doc.places().out("array"))];
  const acronyms = [...new Set(doc.acronyms().out("array"))].filter((item) => !organizations.includes(item));

  // adj + noun

  return {
    people,
    organizations,
    places,
    acronyms
  };
}
