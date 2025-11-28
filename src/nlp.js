import nlp from "compromise";
//https://compromise.cool/
// https://observablehq.com/@spencermountain/compromise-accuracy

export function extractEntitiesFromText(text) {
  const doc = nlp(text);

  // Get named entities
  const people = doc.people().out("array");
  const organizations = doc.organizations().out("array");
  const places = doc.places().out("array");

  return {
    people,
    organizations,
    places
  };
}
