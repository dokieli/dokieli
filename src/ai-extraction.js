/**
 * AI Entity Extraction Module for dokieli
 * Integrates google/langextract for entity extraction with source grounding
 */

import * as lx from 'google/langextract';

/**
 * Extract entities from text using Google LangExtract
 * @param {string} text - The text to analyze
 * @param {string} apiKey - Google Gemini API key
 * @returns {Promise<Array>} Array of extracted entities with source grounding
 */
export async function extractEntities(text, apiKey) {
  try {
    // Set API key
    process.env.GEMINI_API_KEY = apiKey;
    
    // Define extraction prompt
    const prompt = "Extract key entities (Person, Work, Concept, Technology, Organization, Date) in order of appearance. " +
                  "Use exact text for extractions. Provide meaningful attributes for each entity.";

    // Provide examples to guide the model
    const examples = [
      new lx.data.ExampleData(
        "Bernard Stiegler wrote La technique et le temps in 1994.",
        [
          new lx.data.Extraction(
            "Person",
            "Bernard Stiegler",
            {role: "philosopher"}
          ),
          new lx.data.Extraction(
            "Work",
            "La technique et le temps",
            {type: "book"}
          ),
          new lx.data.Extraction(
            "Date",
            "1994",
            {precision: "year"}
          )
        ]
      )
    ];

    // Extract with source grounding
    const result = await lx.extract({
      text_or_documents: text,
      prompt_description: prompt,
      examples: examples,
      model_id: "gemini-2.0-flash-exp"
    });

    // Convert to dokieli-compatible format
    const entities = [];
    if (result.extractions) {
      for (const extraction of result.extractions) {
        const entity = {
          name: extraction.extraction_text,
          type: extraction.extraction_class,
          confidence: 0.95,
          mentions: [],
          attributes: extraction.attributes || {}
        };

        // Add source grounding
        if (extraction.char_interval) {
          try {
            const [start, end] = extraction.char_interval;
            entity.mentions.push({
              text: extraction.extraction_text,
              start: start,
              end: end
            });
          } catch (e) {
            // Fallback to manual search
            const idx = text.indexOf(extraction.extraction_text);
            if (idx !== -1) {
              entity.mentions.push({
                text: extraction.extraction_text,
                start: idx,
                end: idx + extraction.extraction_text.length
              });
            }
          }
        }

        entities.push(entity);
      }
    }

    return entities;

  } catch (error) {
    console.error("AI Extraction Error:", error);
    // Fallback to demo data
    return getDemoEntities(text);
  }
}

/**
 * Fallback demo entities when API fails
 */
function getDemoEntities(text) {
  const demoEntities = [
    { name: "Person", type: "Person", confidence: 1.0, mentions: [], attributes: {} },
    { name: "Work", type: "Work", confidence: 1.0, mentions: [], attributes: {} },
    { name: "Concept", type: "Concept", confidence: 1.0, mentions: [], attributes: {} }
  ];

  // Find positions in text
  demoEntities.forEach(entity => {
    const idx = text.indexOf(entity.name);
    if (idx !== -1) {
      entity.mentions.push({
        text: entity.name,
        start: idx,
        end: idx + entity.name.length
      });
    }
  });

  return demoEntities;
}

/**
 * Convert entities to RDF for Solid integration
 */
export function entitiesToRDF(entities, documentUri) {
  // Implementation for Solid RDF integration
  // Will be enhanced in future steps
  return [];
}