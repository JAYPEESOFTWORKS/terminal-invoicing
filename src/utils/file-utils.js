const fs = require('fs');
const path = require('path');
const os = require('os');
const logger = require('./logger');

/**
 * Get the project root directory (where config/ lives)
 * @returns {string} Project root path
 */
function getProjectRoot() {
  // Check if PROJECT_ROOT env var is set (for testing)
  if (process.env.TERMINAL_INVOICING_ROOT) {
    // Always use forward slashes to avoid escape sequences like \t
    return process.env.TERMINAL_INVOICING_ROOT.replace(/\\/g, '/');
  }
  
  // Look for config directory starting from cwd
  let currentDir = process.cwd();
  
  while (currentDir !== path.parse(currentDir).root) {
    const configDir = path.join(currentDir, 'config');
    if (fs.existsSync(configDir)) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }
  
  // Default to cwd if not found
  return process.cwd();
}

/**
 * Ensure a directory exists, creating it if necessary
 * @param {string} dirPath - Directory path
 */
function ensureDir(dirPath) {
  console.log('DEBUG ensureDir: dirPath =', dirPath);
  console.log('DEBUG ensureDir: exists?', fs.existsSync(dirPath));
  
  if (!fs.existsSync(dirPath)) {
    console.log('DEBUG ensureDir: Creating directory...');
    try {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log('DEBUG ensureDir: Created successfully');
      logger.debug(`Created directory: ${dirPath}`);
    } catch (err) {
      console.log('DEBUG ensureDir: ERROR:', err.message);
      throw err;
    }
  } else {
    console.log('DEBUG ensureDir: Already exists');
  }
}

/**
 * Write file atomically (write to temp file, then rename)
 * @param {string} filePath - Target file path
 * @param {string} content - File content
 */
function writeFileAtomic(filePath, content) {
  const tempPath = `${filePath}.tmp`;
  
  console.log('DEBUG writeFileAtomic: filePath =', filePath);
  
  try {
    // Ensure directory exists
    console.log('DEBUG writeFileAtomic: Ensuring parent dir exists');
    ensureDir(path.dirname(filePath));
    
    console.log('DEBUG writeFileAtomic: Writing temp file');
    fs.writeFileSync(tempPath, content, 'utf8');
    
    console.log('DEBUG writeFileAtomic: Renaming to final file');
    fs.renameSync(tempPath, filePath);
    
    console.log('DEBUG writeFileAtomic: Success!');
    logger.debug(`Wrote file atomically: ${filePath}`);
  } catch (err) {
    console.log('DEBUG writeFileAtomic: ERROR:', err);
    // Clean up temp file if it exists
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
    throw err;
  }
}

/**
 * Read file safely with error handling
 * @param {string} filePath - File path to read
 * @returns {string} File content
 * @throws {Error} If file doesn't exist or can't be read
 */
function readFileSafe(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    throw new Error(`Failed to read file ${filePath}: ${err.message}`);
  }
}

/**
 * List files in a directory with optional filter
 * @param {string} dirPath - Directory path
 * @param {string} extension - Optional file extension filter (e.g., '.yaml')
 * @returns {string[]} Array of file paths
 */
function listFiles(dirPath, extension = null) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }
  
  const files = fs.readdirSync(dirPath);
  
  return files
    .filter(file => {
      // Skip hidden files and directories
      if (file.startsWith('.')) return false;
      
      // Check extension if provided
      if (extension && !file.endsWith(extension)) return false;
      
      // Only include files, not directories
      const fullPath = path.join(dirPath, file);
      return fs.statSync(fullPath).isFile();
    })
    .map(file => path.join(dirPath, file));
}

/**
 * Get the data directory path (~/.Terminal Invoicing)
 * @returns {string} Data directory path
 */
function getDataDir() {
  return path.join(os.homedir(), '.Terminal Invoicing');
}

/**
 * Resolve a path relative to project root
 * @param {string} relativePath - Path relative to project root
 * @returns {string} Absolute path
 */
function resolveProjectPath(...relativePath) {
  return path.join(getProjectRoot(), ...relativePath);
}

/**
 * Check if a file exists
 * @param {string} filePath - File path to check
 * @returns {boolean} True if file exists
 */
function fileExists(filePath) {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

/**
 * Delete a file if it exists
 * @param {string} filePath - File path to delete
 * @returns {boolean} True if file was deleted
 */
function deleteFile(filePath) {
  if (fileExists(filePath)) {
    fs.unlinkSync(filePath);
    logger.debug(`Deleted file: ${filePath}`);
    return true;
  }
  return false;
}

module.exports = {
  getProjectRoot,
  ensureDir,
  writeFileAtomic,
  readFileSafe,
  listFiles,
  getDataDir,
  resolveProjectPath,
  fileExists,
  deleteFile
};
