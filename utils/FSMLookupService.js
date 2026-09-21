/**
 * FSMLookupService.js
 *
 * Lookup and reference data methods for FSM API integration.
 * Provides data fetching for reference tables, approval status,
 * person/technician data, organization hierarchy, and user management.
 *
 * These methods are mixed into the FSMService class prototype at startup,
 * so they have access to FSMService's instance properties and HTTP methods via `this`.
 * Destination names are defined centrally in FSMService constructor.
 *
 * Sections:
 * - LOOKUP DATA: TimeTasks, Items, ExpenseTypes, UdfMeta
 * - APPROVAL STATUS: Decision status for T&M entries
 * - PERSON/TECHNICIAN: Person queries by ID, externalId, BusinessPartner
 * - ORGANIZATION: Organization level hierarchy
 * - USER: User API lookup, combined user-org-level flow
 *   (with UnifiedPerson fallback for accounts where Person.userName
 *    stores the login name instead of the User API id)
 *
 * @file FSMLookupService.js
 * @module utils/FSMLookupService
 * @requires ./DestinationService (via FSMService `this` context)
 * @requires ./TokenCache (via FSMService `this` context)
 */

const axios = require('axios');
const DestinationService = require('./DestinationService');
const TokenCache = require('./TokenCache');

/**
 * Person rows that represent the same human, ranked. Lower sorts first.
 *
 * ERPUSER is the anchor identity: FSM's own preferred relationship is
 *   Person[ERPUSER].id = Person[ERPUSER].refId = Person[EMPLOYEE].refId
 *                      = UnifiedPerson.id = UnifiedPerson.refId
 * and - verified in this tenant - it is the row FSM itself writes into
 * `createPerson` on the TimeEfforts it creates. Choosing it keeps our entries
 * pointing at the same Person FSM Mobile / Web UI point at.
 *
 * `id === refId` is the same signal without relying on the type string, and is
 * the fallback for the day the ERPUSER label stops being the marker.
 *
 * @param {Object} row - raw Person / UnifiedPerson row
 * @returns {number} sort rank
 */
function identityRank(row) {
    const types = Array.isArray(row?.types)
        ? row.types.map(t => String(t).toUpperCase())
        : (row?.type ? [String(row.type).toUpperCase()] : []);

    if (types.includes('ERPUSER')) return 0;
    if (row?.id && row.id === row.refId) return 1;
    if (types.includes('EMPLOYEE')) return 2;
    return 3;
}

/**
 * Build the identity list returned by both person lookup paths.
 *
 * One human can have several Person rows for the same userName (EMPLOYEE +
 * ERPUSER), each with its own id AND its own externalId. All are kept, but they
 * are ORDERED - not left in whatever order FSM returned them.
 *
 * That ordering is the point of this function. Callers take [0] as "the user",
 * and that value ends up in stored data (the z_TM_PersonID of the user-settings
 * record). FSM does not promise a row order, so an unsorted [0] is a lottery
 * that can flip between calls - and a flip writes a SECOND settings record under
 * the other externalId, silently orphaning the first. Ranking by identityRank
 * makes [0] the same row every time.
 *
 * refId is carried through because it - not id - is the one value FSM guarantees
 * is identical across every row for one human. It is the right key for "is this
 * the same person", e.g. when de-duplicating the technician list.
 *
 * displayName is "firstName lastName" - a single space between, and no stray
 * space when only one of the two is filled. It falls back to the externalId so
 * the UI always has something to show.
 *
 * @param {Array<Object>} rows - raw Person / UnifiedPerson rows
 * @returns {Array<{id: string, refId: string|null, type: string|null, externalId: string, firstName: string, lastName: string, displayName: string}>}
 */
function buildPersonIdentities(rows) {
    const seen = new Set();
    const persons = [];

    rows.forEach(row => {
        if (!row || !row.id || seen.has(row.id)) return;
        seen.add(row.id);

        const firstName = row.firstName || '';
        const lastName = row.lastName || '';
        const displayName = [firstName, lastName]
            .map(part => String(part).trim())
            .filter(Boolean)
            .join(' ');

        // UnifiedPerson carries `types` (array), Person carries `type` (string).
        const type = Array.isArray(row.types)
            ? (row.types[0] || null)
            : (row.type || null);

        persons.push({
            id: row.id,
            refId: row.refId || null,
            type: type,
            externalId: row.externalId || null,
            firstName: firstName,
            lastName: lastName,
            displayName: displayName || row.externalId || '',
            _rank: identityRank(row)
        });
    });

    // Stable within a rank: sort only by rank, then drop the helper field.
    persons.sort((a, b) => a._rank - b._rank);
    persons.forEach(person => { delete person._rank; });

    return persons;
}

module.exports = {

    // ========================================
    // LOOKUP DATA
    // ========================================

    /**
     * Get all Time Tasks for lookup/dropdown.
     * @returns {Promise<Array<{id: string, code: string, name: string}>>}
     */
    async getTimeTasks() {
        try {
            const data = await this.makeRequest('/TimeTask', {
                dtos: 'TimeTask.18',
                fields: 'name,id,code'
            });

            if (!data.data || data.data.length === 0) {
                return [];
            }

            return data.data.map(item => ({
                id: item.timeTask.id,
                code: item.timeTask.code,
                name: item.timeTask.name
            }));

        } catch (error) {
            console.error("FSMService: Error fetching time tasks:", error.message);
            return [];
        }
    },

    /**
     * Get all Items for lookup/dropdown.
     * Excludes tools and Z11% items.
     *
     * IMPORTANT — the `tool` predicate MUST stay null-safe. Do not simplify
     * `(w.tool = false OR w.tool IS NULL)` back to `w.tool = false`.
     *
     * FSM's Item master contains records where `tool` is NULL rather than
     * false (measured in P: 74 of 133 items).
     *
     * Note: `NOT LIKE 'Z11%'` also drops rows with a NULL externalId (same
     * three-valued-logic behaviour). This is intentional — only S/4-replicated
     * items carry an externalId, and an item without one cannot serve as a
     * materialId anyway.
     *
     * @returns {Promise<Array<{id: string, externalId: string, name: string}>>}
     */
    async getItems() {
        try {
            const query = `SELECT DISTINCT w.name, w.externalId, w.id
                           FROM Item w
                           WHERE (w.tool = false OR w.tool IS NULL)
                           AND w.externalId NOT LIKE 'Z11%'`;

            const data = await this.makeQueryRequest(query, 'Item.24');

            if (!data.data || data.data.length === 0) {
                console.warn("FSMService.getItems: query returned no items");
                return [];
            }

            const items = data.data.map(item => ({
                id: item.w.id,
                externalId: item.w.externalId,
                name: item.w.name
            }));

            console.log(`FSMService.getItems: ${items.length} items loaded`);

            return items;

        } catch (error) {
            console.error("FSMService: Error fetching items:", error.message);
            return [];
        }
    },

    /**
     * Get all Expense Types for lookup/dropdown.
     * @returns {Promise<Array<{id: string, code: string, name: string}>>}
     */
    async getExpenseTypes() {
        try {
            const data = await this.makeRequest('/ExpenseType', {
                dtos: 'ExpenseType.17',
                fields: 'name,id,code'
            });

            if (!data.data || data.data.length === 0) {
                return [];
            }

            return data.data.map(item => ({
                id: item.expenseType.id,
                code: item.expenseType.code,
                name: item.expenseType.name
            }));

        } catch (error) {
            console.error("FSMService: Error fetching expense types:", error.message);
            return [];
        }
    },

    /**
     * Get UDF Meta externalId by ID.
     * @param {string} udfMetaId - UDF Meta ID
     * @returns {Promise<string|null>} externalId or null if not found
     */
    async getUdfMetaById(udfMetaId) {
        try {
            const query = `SELECT w.externalId FROM UdfMeta w WHERE w.id = '${udfMetaId}'`;
            const data = await this.makeQueryRequest(query, 'UdfMeta.20');

            if (!data.data || data.data.length === 0) {
                return null;
            }

            return data.data[0]?.w?.externalId || null;

        } catch (error) {
            console.error("FSMService: Error fetching UDF Meta:", error.message);
            return null;
        }
    },

    // ========================================
    // APPROVAL STATUS
    // ========================================

    /**
     * Get Approval Decision Status for a T&M entry.
     * @param {string} objectId - The T&M entry ID
     * @returns {Promise<Object|null>} Object with decisionStatus and decisionRemarks, or null
     */
    async getApprovalStatus(objectId) {
        try {
            const query = `SELECT w.decisionStatus, w.decisionRemarks FROM Approval w WHERE w.object.objectId = '${objectId}'`;
            const data = await this.makeQueryRequest(query, 'Approval.15');

            if (!data.data || data.data.length === 0) {
                return null;
            }

            return {
                decisionStatus: data.data[0]?.w?.decisionStatus || null,
                decisionRemarks: data.data[0]?.w?.decisionRemarks || null
            };

        } catch (error) {
            console.error("FSMService: Error fetching Approval status:", error.message);
            return null;
        }
    },

    /**
     * Get Approval Decision Status for multiple T&M entries.
     * @param {string[]} objectIds - Array of T&M entry IDs
     * @returns {Promise<Object>} Map of objectId to {decisionStatus, decisionRemarks}
     */
    async getApprovalStatusBatch(objectIds) {
        if (!objectIds || objectIds.length === 0) {
            return {};
        }

        // De-duplicate and drop falsy IDs so the IN() lists stay clean.
        const ids = [...new Set(objectIds.filter(Boolean))];

        // IMPORTANT — do NOT revert this to one makeQueryRequest per objectId.
        //
        // The previous implementation fired one FSM Query API request per ID via
        // Promise.all. For a 274-entry activity that is 274 concurrent requests.
        // FSM rate-limits concurrent query requests, so a random subset failed
        // each call; failures were caught and silently omitted from statusMap,
        // and the frontend rendered the missing entries with its PENDING fallback.
        // That is why the UI showed a *different* set of PENDING rows on every
        // refresh even though every Approval was APPROVED. Fix: batch the IDs into
        // a small number of IN() queries with bounded concurrency, and let a chunk
        // failure surface instead of dropping rows into a false PENDING state.

        const CHUNK_SIZE = 100;   // keeps the IN() list well under FSM's query-length limit
        const MAX_CONCURRENCY = 4;

        const chunks = [];
        for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
            chunks.push(ids.slice(i, i + CHUNK_SIZE));
        }

        const statusMap = {};

        const runChunk = async (chunk) => {
            // Escape single quotes defensively (FSM IDs are GUIDs, but be safe).
            const inList = chunk.map(id => `'${String(id).replace(/'/g, "''")}'`).join(', ');
            const query = `SELECT w.object.objectId, w.decisionStatus, w.decisionRemarks `
                + `FROM Approval w WHERE w.object.objectId IN (${inList})`;

            const data = await this.makeQueryRequest(query, 'Approval.15');
            const rows = (data && Array.isArray(data.data)) ? data.data : [];

            for (const row of rows) {
                const w = row?.w;
                // FSM returns the projected nested path as a FLAT property key with a
                // literal dot in the name ("object.objectId"), NOT as w.object.objectId.
                // Reading it as a nested path yields undefined and drops every row.
                const objectId = w ? w["object.objectId"] : undefined;
                if (objectId && w?.decisionStatus) {
                    statusMap[objectId] = {
                        decisionStatus: w.decisionStatus,
                        decisionRemarks: w.decisionRemarks || null
                    };
                }
            }
        };

        // Bounded-concurrency worker pool: at most MAX_CONCURRENCY chunks in flight.
        let cursor = 0;
        const worker = async () => {
            while (cursor < chunks.length) {
                const chunk = chunks[cursor++];
                await runChunk(chunk);
            }
        };

        // A chunk error rejects the whole batch on purpose: the route returns 500
        // and the frontend leaves prior/unknown state rather than falsely showing
        // these rows as PENDING. Do not swallow per-chunk errors here.
        await Promise.all(
            Array.from({ length: Math.min(MAX_CONCURRENCY, chunks.length) }, worker)
        );

        return statusMap;
    },

    // ========================================
    // PERSON/TECHNICIAN DATA
    // ========================================

    /**
     * Every Person in the team of a Service Call.
     *
     * WHY A JOIN AND NOT TWO QUERIES
     *   The service call's `team` field is NOT present in the composite-tree
     *   payload the app already loads, so the team id cannot be read from what we
     *   have. Rather than fetch the ServiceCall again just to learn its team, the
     *   join resolves ServiceCall -> team -> TeamTimeFrame -> person in one call.
     *
     *   Keyed on ServiceCall.id, not .code: the id is the value the app already
     *   holds in every context (it is what the composite tree was fetched with),
     *   it is unambiguous, and it needs no assumption about how codes are
     *   formatted or whether they are unique.
     *
     * TEAM MEMBERSHIP IS TIME-FRAMED
     *   TeamTimeFrame is one row per person per time frame, so the same person
     *   comes back several times when they have more than one frame. Rows are
     *   de-duplicated here; the caller only asks "is this person in the team".
     *
     *   validFrom / validTo are deliberately NOT evaluated. Membership is an
     *   access gate, and a technician whose frame ended yesterday should not lose
     *   sight of the service order they worked on. If the requirement ever becomes
     *   "only current members", filter here rather than at the caller.
     *
     * @param {string} serviceCallId - ServiceCall UUID
     * @returns {Promise<string[]>} Person UUIDs, de-duplicated (empty on any problem)
     */
    async getServiceCallTeamPersons(serviceCallId) {
        try {
            if (!serviceCallId) return [];

            // The id is interpolated into FSQL, so it must be a plain identifier.
            // FSM ids are 32-char hex; be liberal but reject anything that could
            // break out of the quoted literal.
            if (!/^[A-Za-z0-9_-]{1,64}$/.test(String(serviceCallId))) {
                console.warn(`FSMService.getServiceCallTeamPersons: refusing unsafe service call id '${serviceCallId}'`);
                return [];
            }

            // Both DTOs are required - one per entity in the join, semicolon
            // separated. Result rows are aliased `v` (the TeamTimeFrame side).
            const query = `SELECT v.person FROM ServiceCall m `
                + `JOIN TeamTimeFrame v ON v.team = m.team `
                + `WHERE m.id = '${serviceCallId}'`;
            const data = await this.makeQueryRequest(query, 'ServiceCall.27;TeamTimeFrame.11');

            if (!data.data || data.data.length === 0) {
                // Also the normal result when the service call has no team at all -
                // the join then yields nothing, which the caller reads as
                // "not a member" and falls through to the assignment check.
                return [];
            }

            return [...new Set(
                data.data.map(row => row.v?.person).filter(Boolean)
            )];

        } catch (error) {
            // Never let a lookup failure open the gate: an empty list means
            // "not a member", and the caller falls back to the assignment check.
            console.error('FSMService.getServiceCallTeamPersons: query failed:',
                error.response?.data || error.message);
            return [];
        }
    },

    /**
     * Get all Persons (Technicians), ONE ROW PER HUMAN.
     *
     * WHY THE DE-DUPLICATION
     *   The Person table stores one row per type for the same human - an ERPUSER
     *   row and an EMPLOYEE row - and each has its own id AND its own externalId
     *   (e.g. 'egleizds1' and 'egleizds2'). Both pass the externalId filter, so
     *   the raw query lists every technician twice.
     *
     *   That is not only untidy. The picked entry becomes `createPerson` on the
     *   entry we create, and FSM's own Mobile / Web UI writes the ERPUSER row
     *   there. Offering the EMPLOYEE duplicate lets a user create entries under
     *   an identity FSM itself never uses, which then reads differently in FSM
     *   reporting than an identical entry made in FSM.
     *
     *   refId is identical across those rows - it is the only value FSM
     *   guarantees for that - so it is the de-duplication key, and identityRank
     *   decides which of the duplicates survives (ERPUSER).
     *
     * WHY THE DROPPED ROWS STILL COME BACK AS ALIASES
     *   Collapsing the rows must not make the dropped identity unfindable. An
     *   activity's `responsible` or `supportingPersons` may reference the
     *   EMPLOYEE id or externalId, and the T&M creation dialog looks technicians
     *   up by exactly those values to build its dropdown and preselect the
     *   responsible. If only the surviving row's own id/externalId were
     *   returned, those lookups would miss and the technician would silently
     *   vanish from the dialog.
     *
     *   So every merged row contributes to `ids` and `externalIds`. One entry
     *   per human in the list, findable under any identity that human has.
     *
     * @returns {Promise<Array<{id: string, refId: string|null, type: string|null, externalId: string, ids: string[], externalIds: string[], firstName: string, lastName: string}>>}
     */
    async getPersons() {
        try {
            const query = `SELECT w.id, w.refId, w.type, w.externalId, w.firstName, w.lastName FROM Person w WHERE w.externalId IS NOT NULL`;
            const data = await this.makeQueryRequest(query, 'Person.25');

            if (!data.data || data.data.length === 0) {
                return [];
            }

            const rows = data.data.map(item => item.w).filter(Boolean);

            // Group by refId, keeping every row of the group. Rows without a
            // refId cannot be grouped, so they are keyed by their own id and
            // form a group of one.
            const groups = new Map();
            rows.forEach(row => {
                if (!row.id) return;
                const key = row.refId || row.id;
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key).push(row);
            });

            return [...groups.values()].map(group => {
                const ranked = [...group].sort((a, b) => identityRank(a) - identityRank(b));
                const primary = ranked[0];

                return {
                    id: primary.id,
                    refId: primary.refId || null,
                    type: primary.type || null,
                    externalId: primary.externalId,
                    // Every identity of this human, primary first. Callers match
                    // against these so a reference to the collapsed row still
                    // finds the person.
                    ids: [...new Set(ranked.map(r => r.id).filter(Boolean))],
                    externalIds: [...new Set(ranked.map(r => r.externalId).filter(Boolean))],
                    firstName: primary.firstName || '',
                    lastName: primary.lastName || ''
                };
            });

        } catch (error) {
            console.error("FSMService: Error fetching persons:", error.message);
            return [];
        }
    },

    /**
     * Run one person lookup against Person, then UnifiedPerson if it finds nothing.
     *
     * WHY THE FALLBACK
     *   SAP is migrating Person -> UnifiedPerson feature by feature, and the
     *   documentation is explicit that `Person[ERPUSER].id = UnifiedPerson.id`
     *   must NOT be taken for granted: "at some point of the migration to
     *   UnifiedPerson, this link will be broken."
     *
     *   When that happens for a component that feeds us person ids (an activity's
     *   responsible or supporting technicians), a Person-only lookup returns
     *   nothing and the UI falls back to showing a raw UUID. The second query
     *   only runs on a miss, so the normal path costs nothing.
     *
     *   As of today both ids resolve in Person in this tenant - this is
     *   insurance, not a fix for a current failure.
     *
     * @param {string} field - column to match ('id' or 'externalId')
     * @param {string} value - value to match
     * @returns {Promise<Object|null>} Person-shaped object or null
     * @private
     */
    async _lookupPerson(field, value) {
        const shape = row => ({
            id: row.id,
            refId: row.refId || null,
            type: Array.isArray(row.types) ? (row.types[0] || null) : (row.type || null),
            externalId: row.externalId,
            firstName: row.firstName || '',
            lastName: row.lastName || ''
        });

        const personQuery = `SELECT w.id, w.refId, w.type, w.externalId, w.firstName, w.lastName FROM Person w WHERE w.${field} = '${value}'`;
        const personData = await this.makeQueryRequest(personQuery, 'Person.25');

        if (personData.data && personData.data.length > 0) {
            // More than one row can come back for an externalId only if FSM data
            // is inconsistent; rank anyway so the answer is deterministic.
            const rows = personData.data.map(r => r.w).filter(Boolean);
            rows.sort((a, b) => identityRank(a) - identityRank(b));
            return shape(rows[0]);
        }

        // `types` here, not `type` - different column name on UnifiedPerson.
        const unifiedQuery = `SELECT w.id, w.refId, w.types, w.externalId, w.firstName, w.lastName FROM UnifiedPerson w WHERE w.${field} = '${value}'`;
        const unifiedData = await this.makeQueryRequest(unifiedQuery, 'UnifiedPerson.13');

        if (unifiedData.data && unifiedData.data.length > 0) {
            return shape(unifiedData.data[0].w);
        }

        return null;
    },

    /**
     * Get Person by ID. Falls back to UnifiedPerson - see _lookupPerson.
     * @param {string} personId - Person ID
     * @returns {Promise<Object|null>} Person object or null
     */
    async getPersonById(personId) {
        try {
            if (!personId) return null;
            return await this._lookupPerson('id', personId);
        } catch (error) {
            console.error("FSMService: Error fetching person by ID:", error.message);
            return null;
        }
    },

    /**
     * Get Person by External ID. Falls back to UnifiedPerson - see _lookupPerson.
     * @param {string} externalId - Person External ID
     * @returns {Promise<Object|null>} Person object or null
     */
    async getPersonByExternalId(externalId) {
        try {
            if (!externalId) return null;
            return await this._lookupPerson('externalId', externalId);
        } catch (error) {
            console.error("FSMService: Error fetching person by externalId:", error.message);
            return null;
        }
    },

    /**
     * Get Business Partner by External ID.
     * @param {string} externalId - Business Partner External ID
     * @returns {Promise<Object|null>} Business Partner object or null
     */
    async getBusinessPartnerByExternalId(externalId) {
        try {
            if (!externalId) return null;

            const query = `SELECT w.name FROM BusinessPartner w WHERE w.externalId = '${externalId}'`;
            const data = await this.makeQueryRequest(query, 'BusinessPartner.25');

            if (!data.data || data.data.length === 0) {
                return null;
            }

            return {
                externalId: externalId,
                name: data.data[0].w.name || ''
            };

        } catch (error) {
            console.error("FSMService: Error fetching business partner:", error.message);
            return null;
        }
    },

    // ========================================
    // ORGANIZATION LEVEL
    // ========================================

    /**
     * Get Organization Levels hierarchy.
     * @returns {Promise<Object>} Organization level hierarchy
     */
    async getOrganizationLevels() {
        try {
            const destination = await DestinationService.getDestination(this.destinationName);
            const token = await TokenCache.getToken(destination);

            const baseUrl = destination.destinationConfiguration.URL;
            const fullUrl = `${baseUrl}/cloud-org-level-service/api/v1/levels`;

            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'X-Account-ID': destination.destinationConfiguration['URL.headers.X-Account-ID'],
                'X-Company-ID': destination.destinationConfiguration['URL.headers.X-Company-ID']
            };

            const response = await axios.get(fullUrl, { headers });
            return response.data;

        } catch (error) {
            console.error('FSMService: Organizational-levels API Error:', error.response?.data || error.message);
            throw error;
        }
    },

    // ========================================
    // USER API
    // ========================================

    /**
     * Get User by username from User API.
     * @param {string} username - Username (e.g., "EGLEIZDS")
     * @returns {Promise<Object|null>} User object or null
     */
    async getUserByUsername(username) {
        try {
            if (!username) return null;

            const destination = await DestinationService.getDestination(this.destinationName);
            const token = await TokenCache.getToken(destination);

            const baseUrl = destination.destinationConfiguration.URL;
            const { account } = this._getAccountCompany(destination);
            const fullUrl = `${baseUrl}/api/user/v1/users`;

            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'X-Account-ID': destination.destinationConfiguration['URL.headers.X-Account-ID'],
                'X-Company-ID': destination.destinationConfiguration['URL.headers.X-Company-ID'],
                'X-Client-ID': destination.destinationConfiguration['URL.headers.X-Client-ID'],
                'X-Client-Version': destination.destinationConfiguration['URL.headers.X-Client-Version']
            };

            const response = await axios.get(fullUrl, {
                params: {
                    name: username,
                    account: account
                },
                headers: headers
            });

            if (response.data && response.data.content && response.data.content.length > 0) {
                const user = response.data.content[0];
                return {
                    id: user.id,
                    email: user.email,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    name: user.name,
                    companies: user.companies || []
                };
            }

            return null;

        } catch (error) {
            console.error('FSMService: User API Error:', error.response?.data || error.message);
            throw error;
        }
    },

    /**
     * Get Person's orgLevel + identity by user ID.
     *
     * Selects id/externalId in addition to orgLevel so the app has the user's
     * person identity - notably personExternalIds, which the T&M Journal user
     * settings use to fill PERSON fields.
     *
     * The same human can have multiple Person rows for one userName
     * (e.g. EMPLOYEE + ERPUSER), each with its own id/externalId. ALL identities
     * are collected and returned as arrays; callers use the first.
     *
     * @param {string} userId - User ID from User API
     * @returns {Promise<Object|null>} Object with orgLevel, orgLevelIds, personIds[], personExternalIds[]
     */
    async getPersonOrgLevelByUserId(userId) {
        try {
            if (!userId) return null;

            // firstName/lastName are selected for display only - the app shows
            // "firstName lastName" in the User Settings table while keeping
            // externalId for the PATCH.
            // refId + type are selected so the identity rows can be RANKED rather
            // than taken in FSM's arbitrary order - see buildPersonIdentities.
            const query = `SELECT w.id, w.refId, w.type, w.externalId, w.orgLevel, w.orgLevelIds, w.firstName, w.lastName FROM Person w WHERE w.userName = '${userId}'`;
            const data = await this.makeQueryRequest(query, 'Person.25');

            if (!data.data || data.data.length === 0) {
                return null;
            }

            // Collect every identity row for this userName, not just row 0.
            const rows = data.data.map(r => r.w).filter(Boolean);

            // Derived from the RANKED list, so [0] is the anchor identity
            // (ERPUSER) rather than whichever row FSM happened to return first.
            const persons = buildPersonIdentities(rows);
            const personIds = [...new Set(persons.map(p => p.id).filter(Boolean))];
            const personExternalIds = [...new Set(persons.map(p => p.externalId).filter(Boolean))];
            const personRefIds = [...new Set(persons.map(p => p.refId).filter(Boolean))];

            // orgLevel is shared across the duplicate rows; take the first
            // populated one rather than assuming row 0 carries it.
            const orgLevelRow = rows.find(r => r.orgLevel) || rows[0];

            return {
                orgLevel: orgLevelRow.orgLevel || null,
                orgLevelIds: orgLevelRow.orgLevelIds || null,
                personIds,
                personExternalIds,
                personRefIds,
                persons
            };

        } catch (error) {
            console.error('FSMService: Person orgLevel query Error:', error.response?.data || error.message);
            throw error;
        }
    },

    /**
     * Fallback: get Person's orgLevel + identity via UnifiedPerson by the raw context user value.
     *
     * Why this exists: Person.userName is supposed to contain the User API id
     * (e.g. '605269'), but in some FSM accounts (observed in QA) it contains
     * the login name instead (e.g. '61'). In those accounts the primary
     * Person lookup by User API id finds nothing. UnifiedPerson queried with
     * the raw context value resolves the same person and returns the same
     * orgLevel + identity fields.
     *
     * Selects id/externalId here too so the app has the person identity on the
     * fallback path as well, not only the primary path.
     *
     * @param {string} contextUserValue - User value exactly as delivered by FSM context
     * @returns {Promise<Object|null>} Object with orgLevel, orgLevelIds, personIds[], personExternalIds[], or null
     */
    async getUnifiedPersonOrgLevel(contextUserValue) {
        try {
            if (!contextUserValue) return null;

            // firstName/lastName selected for display, same as the primary path.
            // UnifiedPerson has `types` (array), NOT `type` - selecting w.type
            // here is an error. refId is present on both.
            const query = `SELECT w.id, w.refId, w.types, w.externalId, w.orgLevel, w.orgLevelIds, w.firstName, w.lastName FROM UnifiedPerson w WHERE w.userName = '${contextUserValue}'`;
            const data = await this.makeQueryRequest(query, 'UnifiedPerson.13');

            if (!data.data || data.data.length === 0) {
                return null;
            }

            // Normally ONE row here - that is the point of UnifiedPerson - but it
            // goes through the same ranking so both paths return identical shapes.
            const rows = data.data.map(r => r.w).filter(Boolean);

            const persons = buildPersonIdentities(rows);
            const personIds = [...new Set(persons.map(p => p.id).filter(Boolean))];
            const personExternalIds = [...new Set(persons.map(p => p.externalId).filter(Boolean))];
            const personRefIds = [...new Set(persons.map(p => p.refId).filter(Boolean))];
            const orgLevelRow = rows.find(r => r.orgLevel) || rows[0];

            return {
                orgLevel: orgLevelRow.orgLevel || null,
                orgLevelIds: orgLevelRow.orgLevelIds || null,
                personIds,
                personExternalIds,
                personRefIds,
                persons
            };

        } catch (error) {
            // Fallback failure must not mask the primary path result —
            // log and return null so getUserOrgLevel reports "not found" cleanly.
            console.error('FSMService: UnifiedPerson orgLevel query Error:', error.response?.data || error.message);
            return null;
        }
    },

    /**
     * Get User's Organization Level (combined flow with fallback).
     *
     * Primary path:
     * 1. Resolve login name -> user id via User API
     * 2. Query Person with that user id -> orgLevel/orgLevelIds + identity
     *
     * Fallback path (when primary finds nothing):
     * 3. Query UnifiedPerson with the raw context value -> orgLevel/orgLevelIds + identity
     *    Covers accounts where Person.userName stores the login name
     *    instead of the User API id (environment data discrepancy).
     *
     * personIds / personExternalIds are returned as arrays. personExternalIds[0]
     * is what the frontend puts into PERSON fields of the user settings.
     *
     * @param {string} username - User value from FSM context (login name or id)
     * @returns {Promise<Object|null>} Object with orgLevel info + person identity, or null if unresolvable
     */
    async getUserOrgLevel(username) {
        try {
            if (!username) {
                return null;
            }

            // Step 1: resolve via User API (non-fatal — fallback still runs if this fails)
            let user = null;
            try {
                user = await this.getUserByUsername(username);
            } catch (error) {
                console.error('FSMService: User API lookup failed, continuing to fallback:', error.message);
            }

            // Step 2: primary — Person keyed by User API id
            let orgLevelData = null;
            let resolvedVia = null;
            if (user && user.id) {
                orgLevelData = await this.getPersonOrgLevelByUserId(user.id);
                if (orgLevelData) {
                    resolvedVia = 'Person (by User API id)';
                }
            }

            // Step 3: fallback — UnifiedPerson keyed by raw context value
            if (!orgLevelData) {
                console.log(`FSMService: Person lookup empty for user '${username}', falling back to UnifiedPerson`);
                orgLevelData = await this.getUnifiedPersonOrgLevel(username);
                if (orgLevelData) {
                    resolvedVia = 'UnifiedPerson (by context value)';
                }
            }

            if (!orgLevelData) {
                return null;
            }

            console.log(`FSMService: User org level resolved via ${resolvedVia} for '${username}'`);

            const persons = orgLevelData.persons || [];
            const primary = persons[0] || null;

            return {
                userId: user?.id || username,
                userName: username,
                userFirstName: user?.firstName || null,
                userLastName: user?.lastName || null,
                orgLevel: orgLevelData.orgLevel,
                orgLevelIds: orgLevelData.orgLevelIds,
                personIds: orgLevelData.personIds || [],
                personExternalIds: orgLevelData.personExternalIds || [],
                // Same human across every row; the stable key when one is needed.
                personRefIds: orgLevelData.personRefIds || [],
                // Full identity rows: id, externalId, firstName, lastName, displayName.
                // The UI shows displayName; externalId is what a PATCH writes.
                persons: persons,
                personDisplayName: primary?.displayName || null
            };

        } catch (error) {
            console.error('FSMService: getUserOrgLevel Error:', error.message);
            throw error;
        }
    }
};