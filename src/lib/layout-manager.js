const path = require('path');
const fs = require('fs');
const { resolveProjectPath, listFiles } = require('../utils/file-utils');
const logger = require('../utils/logger');

/**
 * Layout Manager
 * Handles loading and managing layout plugins
 */
class LayoutManager {
  constructor() {
    this.layouts = new Map();
    // Layouts are part of the source code, not user data
    this.layoutsDir = path.join(__dirname, '..', '..', 'layouts');
  }

  /**
   * Load all available layouts
   */
  loadLayouts() {
    this.layouts.clear();
    
    const layoutFiles = listFiles(this.layoutsDir, '.js');
    
    layoutFiles.forEach(filePath => {
      try {
        const layout = require(filePath);
        
        // Validate layout structure
        this.validateLayout(layout);
        
        this.layouts.set(layout.name, {
          ...layout,
          path: filePath
        });
        
        logger.debug(`Loaded layout: ${layout.name}`);
      } catch (err) {
        logger.error(`Failed to load layout ${filePath}: ${err.message}`);
      }
    });
    
    if (this.layouts.size === 0) {
      throw new Error('No layouts available. At least one layout must be present.');
    }
  }

  /**
   * Validate layout structure
   * @param {object} layout - Layout object
   * @throws {Error} If layout is invalid
   */
  validateLayout(layout) {
    if (!layout.name || typeof layout.name !== 'string') {
      throw new Error('Layout must have a name property');
    }
    
    if (!layout.render || typeof layout.render !== 'function') {
      throw new Error(`Layout ${layout.name} must have a render function`);
    }
    
    if (!layout.description || typeof layout.description !== 'string') {
      throw new Error(`Layout ${layout.name} must have a description`);
    }
  }

  /**
   * Get a layout by name
   * @param {string} name - Layout name
   * @returns {object} Layout object
   * @throws {Error} If layout not found
   */
  getLayout(name = 'default') {
    if (this.layouts.size === 0) {
      this.loadLayouts();
    }
    
    const layout = this.layouts.get(name);
    
    if (!layout) {
      throw new Error(`Layout not found: ${name}. Available layouts: ${this.getLayoutNames().join(', ')}`);
    }
    
    return layout;
  }

  /**
   * Get all layout names
   * @returns {string[]} Array of layout names
   */
  getLayoutNames() {
    if (this.layouts.size === 0) {
      this.loadLayouts();
    }
    
    return Array.from(this.layouts.keys());
  }

  /**
   * List all layouts with details
   * @returns {Array} Array of layout info objects
   */
  listLayouts() {
    if (this.layouts.size === 0) {
      this.loadLayouts();
    }
    
    return Array.from(this.layouts.values()).map(layout => ({
      name: layout.name,
      description: layout.description,
      author: layout.author || 'Unknown',
      version: layout.version || '1.0.0'
    }));
  }

  /**
   * Check if a layout exists
   * @param {string} name - Layout name
   * @returns {boolean} True if layout exists
   */
  hasLayout(name) {
    if (this.layouts.size === 0) {
      this.loadLayouts();
    }
    
    return this.layouts.has(name);
  }
}

module.exports = new LayoutManager();
