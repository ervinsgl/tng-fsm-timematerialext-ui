/**
 * TimeTaskService.js
 * 
 * Frontend service for time task data management.
 * Handles fetching, caching, and lookup of time tasks for T&M entries.
 * 
 * Key Features:
 * - Fetch and cache all time tasks from FSM
 * - ID-to-name lookup for display
 * - Dropdown data transformation
 * 
 * Display Format: "Working Time"
 * 
 * Task Code Prefixes:
 * - AZ: Arbeitszeit (Working Time)
 * - FZ: Fahrzeit (Travel Time)
 * - WZ: Wartezeit (Waiting Time)
 * 
 * API Endpoint Used:
 * - GET /api/get-time-tasks
 * 
 * @file TimeTaskService.js
 * @module com/tng/fsm/timematerialext/app/utils/services/TimeTaskService
 */
sap.ui.define([], () => {
    "use strict";

    /**
     * Cache for time tasks array.
     * @type {Array|null}
     * @private
     */
    let _timeTasksCache = null;
    
    /**
     * Map for quick ID-to-object lookup.
     * @type {Map<string, Object>|null}
     * @private
     */
    let _timeTasksMap = null;

    return {
        /**
         * Fetch all time tasks from backend.
         * Results are cached for the session.
         * @returns {Promise<Array>} Array of time task objects
         */
        async fetchTimeTasks() {
            if (_timeTasksCache) {
                return _timeTasksCache;
            }

            try {
                const response = await fetch("/api/v1/get-time-tasks", {
                    method: "GET",
                    headers: { "Content-Type": "application/json" }
                });

                if (!response.ok) {
                    throw new Error(`Failed to fetch time tasks: ${response.status}`);
                }

                const data = await response.json();
                _timeTasksCache = data.timeTasks || [];

                this._buildLookupMap();

                return _timeTasksCache;

            } catch (error) {
                console.error("TimeTaskService: Error fetching time tasks:", error);
                throw error;
            }
        },

        /**
         * Build internal lookup map for ID-to-name resolution.
         * @private
         */
        _buildLookupMap() {
            _timeTasksMap = new Map();
            
            if (_timeTasksCache) {
                _timeTasksCache.forEach(task => {
                    _timeTasksMap.set(task.id, task);
                });
            }
        },

        /**
         * Get time task name by ID.
         * @param {string} taskId - Time task ID
         * @returns {string} Time task name or ID as fallback
         */
        getTaskNameById(taskId) {
            if (!taskId || taskId === 'N/A') {
                return 'N/A';
            }

            if (!_timeTasksMap) {
                return taskId;
            }

            const task = _timeTasksMap.get(taskId);
            return task ? task.name : taskId;
        },

        /**
         * Get time task display text by ID.
         * @param {string} taskId - Time task ID
         * @returns {string} Task name or ID as fallback
         */
        getTaskDisplayTextById(taskId) {
            if (!taskId || taskId === 'N/A') {
                return 'N/A';
            }

            if (!_timeTasksMap) {
                return taskId;
            }

            const task = _timeTasksMap.get(taskId);
            if (task) {
                return task.name;
            }
            return taskId;
        },

        /**
         * Get full time task object by ID.
         * @param {string} taskId - Time task ID
         * @returns {Object|null} Time task object or null
         */
        getTaskById(taskId) {
            if (!taskId || !_timeTasksMap) {
                return null;
            }
            return _timeTasksMap.get(taskId) || null;
        },

        /**
         * Get time task ID by code.
         * @param {string} taskCode - Time task code (e.g., "AZ", "FZ3", "WZ0")
         * @returns {string|null} Time task UUID or null if not found
         */
        getTaskIdByCode(taskCode) {
            if (!taskCode || !_timeTasksCache) {
                return null;
            }
            const task = _timeTasksCache.find(t => t.code === taskCode);
            return task ? task.id : null;
        },

        /**
         * Get all cached time tasks.
         * @returns {Array} Array of time task objects
         */
        getAllTasks() {
            return _timeTasksCache || [];
        },

        /**
         * Transform time tasks for dropdown/select control.
         * @returns {Array<{key: string, text: string, code: string, name: string}>}
         */
        getTasksForDropdown() {
            if (!_timeTasksCache) {
                return [];
            }

            return _timeTasksCache.map(task => ({
                key: task.id,
                text: task.name,
                code: task.code,
                name: task.name
            }));
        },

        /**
         * Check if time tasks are loaded.
         * @returns {boolean} True if cache is populated
         */
        isLoaded() {
            return _timeTasksCache !== null;
        },

        /**
         * Clear the cache.
         */
        clearCache() {
            _timeTasksCache = null;
            _timeTasksMap = null;
        }
    };
});