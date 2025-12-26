/**
 * AI API Integration for dokieli
 * Hybrid approach: Python backend + JavaScript frontend
 */

/**
 * Call Python extraction script via fetch
 * @param {string} text - Text to analyze
 * @param {string} apiKey - Gemini API key
 * @returns {Promise<Array>} Extracted entities
 */
export async function extractEntitiesFromAPI(text, apiKey) {
  try {
    // Create a temporary approach using the existing AI_Framework_2.5
    // For now, we'll simulate the API call structure
    
    const response = await fetch('/ai-extract', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({ text: text })
    });

    if (!response.ok) {
      throw new Error(`AI API Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.entities || [];

  } catch (error) {
    console.error("AI API Error:", error);
    return getDemoEntities(text);
  }
}

/**
 * Demo entities for fallback
 */
function getDemoEntities(text) {
  // Simple entity detection for demo
  const entityTypes = ['Person', 'Work', 'Concept', 'Date', 'Organization'];
  const entities = [];

  entityTypes.forEach(type => {
    // This is a very basic demo - in real implementation use proper NLP
    const regex = new RegExp(`(\\b${type}\\b)`, 'gi');
    const match = text.match(regex);
    
    if (match) {
      const idx = text.indexOf(match[0]);
      entities.push({
        name: match[0],
        type: type,
        confidence: 0.8,
        mentions: [{
          text: match[0],
          start: idx,
          end: idx + match[0].length
        }],
        attributes: { demo: true }
      });
    }
  });

  return entities;
}

/**
 * Integrate with dokieli's annotation system
 */
export function addAIAnnotations(doc, entities) {
  if (!doc || !entities || !entities.length) return;

  entities.forEach(entity => {
    entity.mentions.forEach(mention => {
      // Create annotation in dokieli format
      const annotation = {
        '@context': 'http://www.w3.org/ns/anno.jsonld',
        'type': 'Annotation',
        'body': {
          'type': entity.type,
          'name': entity.name,
          'confidence': entity.confidence,
          'attributes': entity.attributes
        },
        'target': {
          'selector': {
            'type': 'TextPositionSelector',
            'start': mention.start,
            'end': mention.end
          }
        }
      };

      // Add to dokieli document
      if (doc.addAnnotation) {
        doc.addAnnotation(annotation);
      }
    });
  });
}

/**
 * UI Integration - Add AI button to toolbar
 */
export function addAIButtonToToolbar(toolbar) {
  const aiButton = document.createElement('button');
  aiButton.className = 'toolbar-button ai-button';
  aiButton.title = 'Analyze with AI';
  aiButton.innerHTML = '🤖 AI';

  aiButton.addEventListener('click', async () => {
    const editor = toolbar.getEditor();
    const text = editor.getText();
    const apiKey = localStorage.getItem('gemini_api_key') || prompt('Enter Gemini API Key:');

    if (text && apiKey) {
      try {
        aiButton.disabled = true;
        aiButton.textContent = '🤖 Processing...';

        const entities = await extractEntitiesFromAPI(text, apiKey);
        
        // Add annotations to document
        const doc = editor.getDocument();
        addAIAnnotations(doc, entities);

        alert(`Found ${entities.length} entities: ${entities.map(e => e.name).join(', ')}`);

      } catch (error) {
        console.error('AI Analysis failed:', error);
        alert('AI Analysis failed. See console for details.');
      } finally {
        aiButton.disabled = false;
        aiButton.textContent = '🤖 AI';
      }
    }
  });

  toolbar.addButton(aiButton);
}