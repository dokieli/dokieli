import nlp from 'compromise';
//https://compromise.cool/
// https://observablehq.com/@spencermountain/compromise-accuracy

// const doc = nlp("Elon Musk is the CEO of SpaceX and lives in Texas.");
const doc = nlp("Sarven Capadisli is the creator of dokieli. He lives in Bern.");
// const doc = nlp("Virginia Balseiro is a woman who lives in Germany and works at Dokieli.");


// Get named entities
const people = doc.people().out('array'); 
const organizations = doc.organizations().out('array'); 
const places = doc.places().out('array');

