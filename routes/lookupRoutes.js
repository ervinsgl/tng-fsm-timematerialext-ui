/**
 * lookupRoutes.js
 *
 * Express Router for lookup/reference data endpoints.
 * Mounted at /api in index.js.
 *
 * Endpoints:
 * - POST /api/get-persons                        - Get all persons (technicians)
 * - POST /api/get-person-by-id                   - Get person by ID
 * - POST /api/get-person-by-external-id          - Get person by external ID
 * - POST /api/get-business-partner-by-external-id - Get business partner by external ID
 * - GET  /api/get-organization-levels-full        - Full org hierarchy
 * - GET  /api/get-time-tasks                      - Time task lookup
 * - GET  /api/get-items                           - Item lookup
 * - GET  /api/get-expense-types                   - Expense type lookup
 * - POST /api/get-udf-meta                        - UDF Meta externalId lookup
 * - GET  /api/get-user-settings                   - TMExt_UserSettings UDO records
 * - POST /api/save-user-setting                   - create/update one settings record
 * - POST /api/get-approval-status                 - Approval status batch lookup
 * - POST /api/get-user-org-level                  - Resolve user's org level
 *
 * @file routes/lookupRoutes.js
 * @requires ../utils/FSMService
 */

const express = require('express');
const router = express.Router();
const FSMService = require('../utils/FSMService');

// Get all Persons (Technicians)
router.post("/get-persons", async (req, res) => {
    try {
        const persons = await FSMService.getPersons();
        res.json({ persons });

    } catch (error) {
        console.error("Error fetching persons:", error.message);
        res.status(error.response?.status || 500).json({
            message: error.response?.data?.message || 'Failed to fetch persons',
            error: error.response?.data || error.message
        });
    }
});

// Get Person by ID
router.post("/get-person-by-id", async (req, res) => {
    const { personId } = req.body;

    if (!personId) {
        return res.status(400).json({ message: 'Person ID is required' });
    }

    try {
        const person = await FSMService.getPersonById(personId);

        if (person) {
            res.json({ person });
        } else {
            res.status(404).json({ message: 'Person not found' });
        }

    } catch (error) {
        console.error("Error fetching person by ID:", error.message);
        res.status(error.response?.status || 500).json({
            message: error.response?.data?.message || 'Failed to fetch person',
            error: error.response?.data || error.message
        });
    }
});

// Get Person by External ID
router.post("/get-person-by-external-id", async (req, res) => {
    const { externalId } = req.body;

    if (!externalId) {
        return res.status(400).json({ message: 'External ID is required' });
    }

    try {
        const person = await FSMService.getPersonByExternalId(externalId);

        if (person) {
            res.json({ person });
        } else {
            res.status(404).json({ message: 'Person not found' });
        }

    } catch (error) {
        console.error("Error fetching person by external ID:", error.message);
        res.status(error.response?.status || 500).json({
            message: error.response?.data?.message || 'Failed to fetch person',
            error: error.response?.data || error.message
        });
    }
});

// Get Business Partner by External ID
router.post("/get-business-partner-by-external-id", async (req, res) => {
    const { externalId } = req.body;

    if (!externalId) {
        return res.status(400).json({ message: 'External ID is required' });
    }

    try {
        const businessPartner = await FSMService.getBusinessPartnerByExternalId(externalId);

        if (businessPartner) {
            res.json({ businessPartner });
        } else {
            res.status(404).json({ message: 'Business Partner not found' });
        }

    } catch (error) {
        console.error("Error fetching business partner by external ID:", error.message);
        res.status(error.response?.status || 500).json({
            message: error.response?.data?.message || 'Failed to fetch business partner',
            error: error.response?.data || error.message
        });
    }
});

// Get Organization Level by ID (returns full hierarchy with all sublevels)
router.get("/get-organization-levels-full", async (req, res) => {
    try {
        const data = await FSMService.getOrganizationLevels();
        res.json(data);

    } catch (error) {
        console.error("Error fetching organization levels:", error.message);
        res.status(error.response?.status || 500).json({
            message: error.response?.data?.message || 'Failed to fetch organization levels',
            error: error.response?.data || error.message
        });
    }
});

// Get Time Tasks (for lookup/dropdown)
router.get("/get-time-tasks", async (req, res) => {
    try {
        const timeTasks = await FSMService.getTimeTasks();

        res.json({
            timeTasks: timeTasks,
            count: timeTasks.length
        });

    } catch (error) {
        console.error("Error fetching time tasks:", error.message);
        res.status(error.response?.status || 500).json({
            message: error.response?.data?.message || 'Failed to fetch time tasks',
            error: error.response?.data || error.message
        });
    }
});

// Get Items (for lookup/dropdown - excludes tools and Z11% items)
router.get("/get-items", async (req, res) => {
    try {
        const items = await FSMService.getItems();

        res.json({
            items: items,
            count: items.length
        });

    } catch (error) {
        console.error("Error fetching items:", error.message);
        res.status(error.response?.status || 500).json({
            message: error.response?.data?.message || 'Failed to fetch items',
            error: error.response?.data || error.message
        });
    }
});

// Get Expense Types (for lookup/dropdown)
router.get("/get-expense-types", async (req, res) => {
    try {
        const expenseTypes = await FSMService.getExpenseTypes();

        res.json({
            expenseTypes: expenseTypes,
            count: expenseTypes.length
        });

    } catch (error) {
        console.error("Error fetching expense types:", error.message);
        res.status(error.response?.status || 500).json({
            message: error.response?.data?.message || 'Failed to fetch expense types',
            error: error.response?.data || error.message
        });
    }
});

// Get UDF Meta externalId by ID
router.post("/get-udf-meta", async (req, res) => {
    const { udfMetaId } = req.body;

    if (!udfMetaId) {
        return res.status(400).json({ message: 'UDF Meta ID is required' });
    }

    try {
        const externalId = await FSMService.getUdfMetaById(udfMetaId);

        res.json({
            id: udfMetaId,
            externalId: externalId
        });

    } catch (error) {
        console.error("Error fetching UDF Meta:", error.message);
        res.status(error.response?.status || 500).json({
            message: error.response?.data?.message || 'Failed to fetch UDF Meta',
            error: error.response?.data || error.message
        });
    }
});

/**
 * Get User Settings (UDO 'TMExt_UserSettings').
 *
 * Returns both halves in one call:
 *   definition - every field the UDO can hold (UdoMeta.udfMetas), each with its
 *                label and, for SELECTIONLIST fields, its allowed options
 *   records    - the settings actually stored (UdoValue), one entry per record
 *
 * All UDF meta UUIDs are already resolved to readable labels - see
 * utils/FSMUdoService.js for why that resolution happens server-side instead of
 * one lookup per UUID from the browser.
 *
 * Query: ?personExternalId=egleizds1 restricts records to that person's own
 *        record (zero or one). Without it, every record is returned.
 *
 * Response: { success, udoName, definition: { fields: [...] },
 *             records: [ { id, settings: [ { label, value } ] } ], count }
 */
router.get("/get-user-settings", async (req, res) => {
    const { personExternalId } = req.query;

    try {
        const data = await FSMService.getUserSettings(undefined, personExternalId || null);

        res.json({
            success: true,
            udoName: data.udoName,
            definition: data.definition,
            records: data.records,
            count: data.records.length
        });

    } catch (error) {
        console.error("Error fetching user settings:", error.message);
        res.status(error.response?.status || 500).json({
            message: error.response?.data?.message || 'Failed to fetch user settings',
            error: error.response?.data || error.message
        });
    }
});

/**
 * Create or update the current user's settings record (UDO 'TMExt_UserSettings').
 *
 * Body: {
 *   personExternalId: "egleizds1",
 *   values: [ { externalId: "z_TM_DateType", value: "1" }, ... ]
 * }
 *
 * Upsert by externalId "<UdoMeta id>_<personExternalId>" - see saveUserSetting
 * in utils/FSMUdoService.js. Selection values are the CODE, not the display text.
 */
router.post("/save-user-setting", async (req, res) => {
    const { personExternalId, values } = req.body;

    if (!personExternalId) {
        return res.status(400).json({ message: 'personExternalId is required' });
    }
    if (!Array.isArray(values) || values.length === 0) {
        return res.status(400).json({ message: 'values array is required' });
    }

    try {
        const result = await FSMService.saveUserSetting(values, personExternalId);

        res.json({
            success: true,
            externalId: result.externalId,
            created: result.created
        });

    } catch (error) {
        console.error("Error saving user setting:", error.message);
        res.status(error.response?.status || 500).json({
            message: error.response?.data?.message || 'Failed to save user setting',
            error: error.response?.data || error.message
        });
    }
});

// Get Approval Status for T&M entries (batch)
router.post("/get-approval-status", async (req, res) => {
    const { objectIds } = req.body;

    if (!objectIds || !Array.isArray(objectIds) || objectIds.length === 0) {
        return res.status(400).json({ message: 'Object IDs array is required' });
    }

    try {
        const statusMap = await FSMService.getApprovalStatusBatch(objectIds);

        res.json({
            statuses: statusMap,
            count: Object.keys(statusMap).length
        });

    } catch (error) {
        console.error("Error fetching Approval statuses:", error.message);
        res.status(error.response?.status || 500).json({
            message: error.response?.data?.message || 'Failed to fetch Approval statuses',
            error: error.response?.data || error.message
        });
    }
});

// Get User's Organization Level by username
// Flow: username -> User API (get user ID) -> Query Person (get orgLevel)
router.post("/get-user-org-level", async (req, res) => {
    const { username } = req.body;

    if (!username) {
        return res.status(400).json({ message: 'Username is required' });
    }

    try {
        const userOrgLevel = await FSMService.getUserOrgLevel(username);

        if (!userOrgLevel) {
            return res.status(404).json({
                message: 'User or organization level not found',
                username: username
            });
        }

        res.json({
            success: true,
            data: userOrgLevel
        });

    } catch (error) {
        console.error("Error fetching user org level:", error.message);
        res.status(error.response?.status || 500).json({
            message: error.response?.data?.message || 'Failed to fetch user organization level',
            error: error.response?.data || error.message
        });
    }
});

module.exports = router;