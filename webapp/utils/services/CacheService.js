/**
 * CacheService.js
 * 
 * Centralized cache warming service for optimized app performance.
 * Pre-loads all reference data services in parallel at app startup.
 * 
 * Benefits:
 * - First dialog open is instant (no loading delay)
 * - Parallel loading reduces total wait time
 * - Single point of cache management
 * - Graceful error handling per service
 * 
 * Services Managed:
 * - TechnicianService (persons for dropdown)
 * - TimeTaskService (AZ/FZ/WZ tasks)
 * - ItemService (materials)
 * - ExpenseTypeService (expense categories)
 * 
 * Note: UdfMetaService uses on-demand caching (lazy load per ID)
 * 
 * @file CacheService.js
 * @module com/tns/fsm/timematerialext/app/utils/services/CacheService
 */
sap.ui.define([
    "com/tns/fsm/timematerialext/app/utils/services/TechnicianService",
    "com/tns/fsm/timematerialext/app/utils/services/TimeTaskService",
    "com/tns/fsm/timematerialext/app/utils/services/ItemService",
    "com/tns/fsm/timematerialext/app/utils/services/ExpenseTypeService"
], (TechnicianService, TimeTaskService, ItemService, ExpenseTypeService) => {
    "use strict";

    return {
        /**
         * Flag to track if cache warming has been initiated.
         * @type {boolean}
         * @private
         */
        _isWarming: false,

        /**
         * Flag to track if cache warming is complete.
         * @type {boolean}
         * @private
         */
        _isWarmed: false,

        /**
         * Promise for ongoing warm operation.
         * @type {Promise|null}
         * @private
         */
        _warmPromise: null,

        /**
         * Cache warming results.
         * @type {Object}
         * @private
         */
        _results: {
            technicians: false,
            timeTasks: false,
            items: false,
            expenseTypes: false
        },

        /**
         * Warm all caches in parallel at app startup.
         * Safe to call multiple times - only runs once.
         * @returns {Promise<Object>} Results object with status per service
         */
        async warmAllCaches() {
            // Already warmed
            if (this._isWarmed) {
                return this._results;
            }

            // Warming in progress - return existing promise
            if (this._isWarming) {
                return this._warmPromise;
            }

            this._isWarming = true;
            console.log("CacheService: Starting parallel cache warm...");
            const startTime = performance.now();

            this._warmPromise = this._executeWarmup();

            try {
                await this._warmPromise;
                this._isWarmed = true;
                const duration = Math.round(performance.now() - startTime);
                console.log(`CacheService: Cache warm complete in ${duration}ms`, this._results);
            } finally {
                this._isWarming = false;
            }

            return this._results;
        },

        /**
         * Execute parallel cache warming.
         * @returns {Promise<void>}
         * @private
         */
        async _executeWarmup() {
            const warmupTasks = [
                this._warmTechnicians(),
                this._warmTimeTasks(),
                this._warmItems(),
                this._warmExpenseTypes()
            ];

            // Wait for all to complete (don't fail fast)
            await Promise.allSettled(warmupTasks);
        },

        /**
         * Warm technician cache.
         * @private
         */
        async _warmTechnicians() {
            try {
                await TechnicianService.initialize();
                this._results.technicians = true;
            } catch (error) {
                console.warn("CacheService: Failed to warm technicians:", error.message);
                this._results.technicians = false;
            }
        },

        /**
         * Warm time tasks cache.
         * @private
         */
        async _warmTimeTasks() {
            try {
                await TimeTaskService.fetchTimeTasks();
                this._results.timeTasks = true;
            } catch (error) {
                console.warn("CacheService: Failed to warm time tasks:", error.message);
                this._results.timeTasks = false;
            }
        },

        /**
         * Warm items cache.
         * @private
         */
        async _warmItems() {
            try {
                await ItemService.fetchItems();
                this._results.items = true;
            } catch (error) {
                console.warn("CacheService: Failed to warm items:", error.message);
                this._results.items = false;
            }
        },

        /**
         * Warm expense types cache.
         * @private
         */
        async _warmExpenseTypes() {
            try {
                await ExpenseTypeService.fetchExpenseTypes();
                this._results.expenseTypes = true;
            } catch (error) {
                console.warn("CacheService: Failed to warm expense types:", error.message);
                this._results.expenseTypes = false;
            }
        },

        /**
         * Check if all caches are warmed.
         * @returns {boolean} True if all caches are ready
         */
        isReady() {
            return this._isWarmed;
        },

        /**
         * Check if a specific cache is ready.
         * @param {string} cacheName - Name of cache (technicians, timeTasks, items, expenseTypes)
         * @returns {boolean} True if cache is ready
         */
        isCacheReady(cacheName) {
            return this._results[cacheName] === true;
        },

        /**
         * Get cache warming status.
         * @returns {Object} Status object with all cache states
         */
        getStatus() {
            return {
                isWarming: this._isWarming,
                isWarmed: this._isWarmed,
                results: { ...this._results }
            };
        },

        /**
         * Clear all caches and reset state.
         * Useful for logout or session refresh.
         */
        clearAllCaches() {
            TechnicianService.clearCache();
            TimeTaskService.clearCache();
            ItemService.clearCache();
            ExpenseTypeService.clearCache();

            this._isWarming = false;
            this._isWarmed = false;
            this._warmPromise = null;
            this._results = {
                technicians: false,
                timeTasks: false,
                items: false,
                expenseTypes: false
            };

            console.log("CacheService: All caches cleared");
        }
    };
});