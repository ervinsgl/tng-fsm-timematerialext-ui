/**
 * TypeConfigStore.js
 * 
 * Backend service for storing Service Product type configuration.
 * Stores configuration in a JSON file that persists with the application.
 * 
 * Configuration determines which Service Product IDs are treated as:
 * - Expense types
 * - Mileage types  
 * - Time & Material types (everything else)
 * 
 * @file config/TypeConfigStore.js
 * @module config/TypeConfigStore
 */
const fs = require('fs');
const path = require('path');

// Config file path - stored in project root
const CONFIG_FILE = path.join(__dirname, 'typeconfig.json');

/**
 * Default configuration values.
 * Used when no config file exists or on reset.
 *
 * NOTE (Expense/Mileage disabled by customer request):
 *   Both type lists are intentionally EMPTY. With empty lists, every Service
 *   Product ID resolves to Time & Material (TypeConfigService.isTimeMaterialType
 *   is the catch-all), so all reporting flows through the Material/Time path.
 *   The Expense/Mileage code paths are left intact but never trigger, because
 *   their visibility is bound to isExpenseType()/isMileageType().
 *
 *   Emptying the defaults here (not just typeconfig.json) is required because
 *   Cloud Foundry file storage is ephemeral: on restart/redeploy the store
 *   falls back to DEFAULT_CONFIG, which would otherwise re-enable the old IDs.
 *
 *   TO RE-ENABLE in the future, restore the original IDs below:
 *     expenseTypes: ["Z40000001", "Z40000007", "Z50000000"]
 *     mileageTypes: ["Z40000038", "Z40000008"]
 */
const DEFAULT_CONFIG = {
    expenseTypes: [],
    mileageTypes: [],
    lastModified: null,
    modifiedBy: null
};

/**
 * In-memory cache of current configuration.
 * @type {Object|null}
 */
let _configCache = null;

/**
 * Load configuration from file.
 * @returns {Object} Configuration object
 */
function loadConfig() {
    if (_configCache) {
        return _configCache;
    }

    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const data = fs.readFileSync(CONFIG_FILE, 'utf8');
            _configCache = JSON.parse(data);
            
            // Validate structure
            if (!Array.isArray(_configCache.expenseTypes) || !Array.isArray(_configCache.mileageTypes)) {
                console.warn('TypeConfigStore: Invalid config structure, using defaults');
                _configCache = getDefaultConfigCopy();
            }
        } else {
            // Create default config file
            _configCache = getDefaultConfigCopy();
            saveConfig(_configCache);
        }
    } catch (error) {
        console.error('TypeConfigStore: Error loading config:', error.message);
        _configCache = getDefaultConfigCopy();
    }

    return _configCache;
}

/**
 * Get a deep copy of default configuration.
 * @returns {Object} Copy of default config with new array instances
 */
function getDefaultConfigCopy() {
    return {
        expenseTypes: [...DEFAULT_CONFIG.expenseTypes],
        mileageTypes: [...DEFAULT_CONFIG.mileageTypes],
        lastModified: null,
        modifiedBy: null
    };
}

/**
 * Save configuration to file.
 * @param {Object} config - Configuration object to save
 * @returns {boolean} True if saved successfully
 */
function saveConfig(config) {
    try {
        // Update metadata
        config.lastModified = new Date().toISOString();
        
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
        _configCache = config;
        return true;
    } catch (error) {
        console.error('TypeConfigStore: Error saving config:', error.message);
        return false;
    }
}

module.exports = {
    /**
     * Get current configuration.
     * @returns {Object} Configuration with expenseTypes and mileageTypes arrays
     */
    getConfig() {
        return loadConfig();
    },

    /**
     * Get expense type IDs.
     * @returns {string[]} Array of expense type IDs
     */
    getExpenseTypes() {
        return loadConfig().expenseTypes;
    },

    /**
     * Get mileage type IDs.
     * @returns {string[]} Array of mileage type IDs
     */
    getMileageTypes() {
        return loadConfig().mileageTypes;
    },

    /**
     * Update full configuration.
     * @param {Object} newConfig - New configuration object
     * @param {string} [modifiedBy] - Username who made the change
     * @returns {Object} Result with success status and config
     */
    updateConfig(newConfig, modifiedBy = null) {
        const config = loadConfig();
        
        if (Array.isArray(newConfig.expenseTypes)) {
            config.expenseTypes = newConfig.expenseTypes.map(id => id.toUpperCase().trim()).filter(id => id);
        }
        
        if (Array.isArray(newConfig.mileageTypes)) {
            config.mileageTypes = newConfig.mileageTypes.map(id => id.toUpperCase().trim()).filter(id => id);
        }
        
        config.modifiedBy = modifiedBy;
        
        const success = saveConfig(config);
        return { success, config };
    },

    /**
     * Add an expense type ID.
     * @param {string} typeId - Service Product ID to add
     * @param {string} [modifiedBy] - Username who made the change
     * @returns {Object} Result with success status
     */
    addExpenseType(typeId, modifiedBy = null) {
        if (!typeId) {
            return { success: false, message: 'Type ID is required' };
        }

        const config = loadConfig();
        const normalizedId = typeId.toUpperCase().trim();

        if (config.expenseTypes.includes(normalizedId)) {
            return { success: false, message: 'Type already exists in expense types' };
        }

        // Remove from mileage if present
        const mileageIndex = config.mileageTypes.indexOf(normalizedId);
        if (mileageIndex !== -1) {
            config.mileageTypes.splice(mileageIndex, 1);
        }

        config.expenseTypes.push(normalizedId);
        config.modifiedBy = modifiedBy;
        
        const success = saveConfig(config);
        return { success, config };
    },

    /**
     * Remove an expense type ID.
     * @param {string} typeId - Service Product ID to remove
     * @param {string} [modifiedBy] - Username who made the change
     * @returns {Object} Result with success status
     */
    removeExpenseType(typeId, modifiedBy = null) {
        if (!typeId) {
            return { success: false, message: 'Type ID is required' };
        }

        const config = loadConfig();
        const normalizedId = typeId.toUpperCase().trim();
        const index = config.expenseTypes.indexOf(normalizedId);

        if (index === -1) {
            return { success: false, message: 'Type not found in expense types' };
        }

        config.expenseTypes.splice(index, 1);
        config.modifiedBy = modifiedBy;
        
        const success = saveConfig(config);
        return { success, config };
    },

    /**
     * Add a mileage type ID.
     * @param {string} typeId - Service Product ID to add
     * @param {string} [modifiedBy] - Username who made the change
     * @returns {Object} Result with success status
     */
    addMileageType(typeId, modifiedBy = null) {
        if (!typeId) {
            return { success: false, message: 'Type ID is required' };
        }

        const config = loadConfig();
        const normalizedId = typeId.toUpperCase().trim();

        if (config.mileageTypes.includes(normalizedId)) {
            return { success: false, message: 'Type already exists in mileage types' };
        }

        // Remove from expense if present
        const expenseIndex = config.expenseTypes.indexOf(normalizedId);
        if (expenseIndex !== -1) {
            config.expenseTypes.splice(expenseIndex, 1);
        }

        config.mileageTypes.push(normalizedId);
        config.modifiedBy = modifiedBy;
        
        const success = saveConfig(config);
        return { success, config };
    },

    /**
     * Remove a mileage type ID.
     * @param {string} typeId - Service Product ID to remove
     * @param {string} [modifiedBy] - Username who made the change
     * @returns {Object} Result with success status
     */
    removeMileageType(typeId, modifiedBy = null) {
        if (!typeId) {
            return { success: false, message: 'Type ID is required' };
        }

        const config = loadConfig();
        const normalizedId = typeId.toUpperCase().trim();
        const index = config.mileageTypes.indexOf(normalizedId);

        if (index === -1) {
            return { success: false, message: 'Type not found in mileage types' };
        }

        config.mileageTypes.splice(index, 1);
        config.modifiedBy = modifiedBy;
        
        const success = saveConfig(config);
        return { success, config };
    },

    /**
     * Reset configuration to defaults.
     * @param {string} [modifiedBy] - Username who made the change
     * @returns {Object} Result with success status and default config
     */
    resetToDefaults(modifiedBy = null) {
        const config = getDefaultConfigCopy();
        config.modifiedBy = modifiedBy;
        
        const success = saveConfig(config);
        return { success, config };
    },

    /**
     * Clear the in-memory cache (forces reload from file).
     */
    clearCache() {
        _configCache = null;
    }
};