/**
 * Main AI Integration for dokieli
 * Connects AI extraction with dokieli's core functionality
 */

import { extractEntitiesFromAPI, addAIAnnotations } from './ai-api.js';
import Config from './config.js';

// Extend dokieli's DO object with AI functionality
if (typeof window.DO === 'undefined') {
  window.DO = {};
}

DO.AI = {
  /**
   * Analyze current document with AI
   * @param {string} apiKey - Gemini API key
   */
  analyzeDocument: async function(apiKey) {
    try {
      const editor = DO.Editor;
      const doc = DO.C.Resource[DO.U.getCurrentDocumentIRI()];

      if (!editor || !doc) {
        console.warn('No active editor or document found');
        return;
      }

      const text = editor.getText();
      if (!text || text.trim() === '') {
        console.warn('Document is empty');
        return;
      }

      // Show processing state
      const originalTitle = document.title;
      document.title = '🤖 Analyzing with AI...';

      const entities = await extractEntitiesFromAPI(text, apiKey);

      // Add annotations to document
      addAIAnnotations(doc, entities);

      // Show results
      DO.U.showActionMessage(`AI Analysis Complete: Found ${entities.length} entities`);

      // Highlight entities in text
      this.highlightEntities(entities);

      return entities;

    } catch (error) {
      console.error('AI Analysis Error:', error);
      DO.U.showActionMessage(`AI Analysis Error: ${error.message}`);
      return [];
    } finally {
      document.title = originalTitle;
    }
  },

  /**
   * Highlight entities in the document
   */
  highlightEntities: function(entities) {
    if (!entities || !entities.length) return;

    const contentNode = DO.U.getDocumentContentNode();
    if (!contentNode) return;

    // Remove previous highlights
    const existingHighlights = contentNode.querySelectorAll('.ai-entity-highlight');
    existingHighlights.forEach(el => el.remove());

    // Create highlights
    entities.forEach(entity => {
      entity.mentions.forEach(mention => {
        const range = document.createRange();
        const textNode = this.findTextNode(contentNode, mention.text, mention.start);

        if (textNode) {
          range.setStart(textNode, 0);
          range.setEnd(textNode, textNode.length);

          const span = document.createElement('span');
          span.className = 'ai-entity-highlight';
          span.style.backgroundColor = this.getEntityColor(entity.type);
          span.title = `${entity.type}: ${entity.name} (${entity.confidence})`;
          span.dataset.entityType = entity.type;
          span.dataset.entityName = entity.name;

          range.surroundContents(span);
        }
      });
    });

    // Add legend
    this.addEntityLegend(entities);
  },

  /**
   * Find text node at specific position
   */
  findTextNode: function(root, text, startPos) {
    let currentPos = 0;
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    while (walker.nextNode()) {
      const node = walker.currentNode;
      const nodeText = node.textContent;
      const nodeLength = nodeText.length;

      if (currentPos + nodeLength > startPos) {
        // Found the node
        const offset = startPos - currentPos;
        return node;
      }

      currentPos += nodeLength;
    }

    return null;
  },

  /**
   * Get color for entity type
   */
  getEntityColor: function(type) {
    const colors = {
      'Person': '#FFF3E0',      // Orange light
      'Work': '#E8F5E9',        // Green light
      'Concept': '#E3F2FD',     // Blue light
      'Date': '#FCE4EC',        // Pink light
      'Organization': '#FFF8E1', // Yellow light
      'Technology': '#F3E5F5',  // Purple light
      'default': '#EEEEEE'      // Gray light
    };

    return colors[type] || colors['default'];
  },

  /**
   * Add legend for entity types
   */
  addEntityLegend: function(entities) {
    // Remove existing legend
    const existingLegend = document.getElementById('ai-entity-legend');
    if (existingLegend) existingLegend.remove();

    // Group entities by type
    const entityTypes = {};
    entities.forEach(entity => {
      if (!entityTypes[entity.type]) {
        entityTypes[entity.type] = 0;
      }
      entityTypes[entity.type]++;
    });

    // Create legend
    const legend = document.createElement('div');
    legend.id = 'ai-entity-legend';
    legend.style.position = 'fixed';
    legend.style.bottom = '20px';
    legend.style.right = '20px';
    legend.style.background = 'white';
    legend.style.padding = '10px';
    legend.style.borderRadius = '5px';
    legend.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
    legend.style.zIndex = '1000';

    const title = document.createElement('div');
    title.style.fontWeight = 'bold';
    title.style.marginBottom = '8px';
    title.textContent = '🤖 AI Entities Found';
    legend.appendChild(title);

    Object.entries(entityTypes).forEach(([type, count]) => {
      const item = document.createElement('div');
      item.style.display = 'flex';
      item.style.alignItems = 'center';
      item.style.marginBottom = '4px';

      const colorBox = document.createElement('div');
      colorBox.style.width = '16px';
      colorBox.style.height = '16px';
      colorBox.style.backgroundColor = this.getEntityColor(type);
      colorBox.style.border = '1px solid #ddd';
      colorBox.style.marginRight = '6px';

      const label = document.createElement('span');
      label.textContent = `${type}: ${count}`;

      item.appendChild(colorBox);
      item.appendChild(label);
      legend.appendChild(item);
    });

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.position = 'absolute';
    closeBtn.style.top = '4px';
    closeBtn.style.right = '4px';
    closeBtn.style.background = 'none';
    closeBtn.style.border = 'none';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.fontSize = '16px';
    closeBtn.onclick = () => legend.remove();

    legend.appendChild(closeBtn);
    document.body.appendChild(legend);
  },

  /**
   * Initialize AI module
   */
  init: function() {
    console.log('AI Module initialized');

    // Add AI button to toolbar if available
    if (DO.U && DO.U.initButtons) {
      // The button was already added to the config
      // It will appear in the toolbar automatically
    }

    // Add event listeners for AI analysis
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('resource-ai-analyze') || 
          e.target.closest('.resource-ai-analyze')) {
        const apiKey = localStorage.getItem('gemini_api_key') || 
                      prompt('Enter your Gemini API Key:');
        if (apiKey) {
          this.analyzeDocument(apiKey);
        }
      }
    });
  }
};

// Initialize AI module when dokieli is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', DO.AI.init);
} else {
  DO.AI.init();
}

// Export for module systems
export default DO.AI;