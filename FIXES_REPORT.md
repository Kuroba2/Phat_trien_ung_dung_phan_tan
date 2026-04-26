# DISTRIBUTED PATIENT MANAGEMENT - COMPREHENSIVE FIX REPORT
**Generated:** April 26, 2026  
**Status:** ✅ COMPREHENSIVE REFACTOR COMPLETED  
**Consistency Model:** Eventual Consistency (non-blocking replication)  
**Availability Mode:** Degraded Write Support  

---

## 🎯 IMPLEMENTATION STRATEGY

### Core Principles Applied
1. **Eventual Consistency**: Client receives 201 immediately after Primary write succeeds
2. **Async Replication**: Replica writes happen in background via `replicateWithRetry()`
3. **Upsert Metadata**: NameNode uses MERGE to handle repeated patient updates
4. **Degraded Write**: Single-node scenarios now supported with status tracking
5. **Version Control**: All replicated data includes version field to prevent stale writes

---

## 📋 FIXES IMPLEMENTED (9 CRITICAL/HIGH ISSUES RESOLVED)

### 1. ✅ DataNode Environment Loading
**File:** `datanode/src/app.js`
- **Issue:** No dotenv config, NODE_INSTANCE couldn't be read
- **Fix:** Added dynamic env file loading via NODE_INSTANCE variable (default: 1)
- **Result:** Each DataNode instance loads correct .env file (datanode_1/2/3.env)
```javascript
const nodeInstance = process.env.NODE_INSTANCE || "1";
const envFilePath = path.join(__dirname, `../../env/datanode_${nodeInstance}.env`);
require("dotenv").config({ path: envFilePath });
```

### 2. ✅ Primary Write + Background Replication
**File:** `datanode/src/controllers/patient.controller.js`
- **Issue:** Replication blocked response; payload missing version
- **Fix:** 
  - Moved replication to background (don't await before returning 201)
  - Include version in replica payload (default: 1)
  - Return 201 immediately after Primary + initial metadata notification
- **Result:** Eventual Consistency model implemented
```javascript
res.status(201).json({ ... });

if (replicaNode) {
  replicationService.replicateWithRetry({...}).catch(err => {
    console.error(`Background replication failed...`);
  });
}
```

### 3. ✅ Replication Validation Enhanced
**File:** `datanode/src/controllers/replication.controller.js`
- **Issue:** Version validation too strict; payload might be stale
- **Fix:** 
  - Allow version = 0 as valid (only reject undefined)
  - MERGE with version comparison: only update if incoming >= existing
- **Result:** Prevents stale write scenarios
```javascript
if (body.version === undefined || typeof body.version !== "number") return false;
// ...
WHEN MATCHED AND @version >= target.version THEN
  UPDATE SET ...
```

### 4. ✅ Database Persistence for Replicas
**File:** `datanode/src/controllers/replication.controller.js`
- **Issue:** Replicas stored only in memory; lost on restart
- **Fix:** MERGE INTO dbo.patients ensures DB persistence (already implemented, just enhanced)
- **Result:** Replica data survives DataNode restarts

### 5. ✅ Metadata Upsert Instead of Insert
**File:** `namenode/src/controllers/patient.controller.js`
- **Issue:** Repeated patient updates caused PK conflicts
- **Fix:** Changed INSERT to MERGE for upsert behavior
- **Result:** Metadata correctly updates on re-admission
```javascript
MERGE INTO metadata AS target
USING (SELECT @id as patient_id) AS source
ON target.patient_id = source.patient_id
WHEN MATCHED THEN
  UPDATE SET primary_node = @p_node, ...
WHEN NOT MATCHED THEN
  INSERT (patient_id, primary_node, ...) VALUES (...)
```

### 6. ✅ Degraded Write Support
**File:** `namenode/src/controllers/patient.controller.js`
- **Issue:** Single node returned as both primary + replica
- **Fix:** Check availableNodes.length > 1 before assigning replica
- **Result:** Supports degraded scenarios gracefully
```javascript
let replica = null;
if (availableNodes.length > 1) {
  const replicaIndex = (availableNodes.indexOf(primary) + 1) % availableNodes.length;
  replica = availableNodes[replicaIndex];
}
```

### 7. ✅ Error Handling in NameNode DB Connection
**File:** `namenode/src/config/database.js`
- **Issue:** Connection errors silently logged; poolPromise could be undefined
- **Fix:** Added rethrow in catch block
- **Result:** Connection failures properly surface at startup
```javascript
.catch(err => {
  console.error('❌ Lỗi kết nối SQL Server:', err);
  throw err;
});
```

### 8. ✅ Route Consistency Verification
**Files:** `namenode/src/routes/api.js`, `datanode/src/routes/patient.routes.js`, `datanode/src/routes/replication.routes.js`
- **Verified Routes:**
  - ✓ GET /api/get-upload-location (NameNode)
  - ✓ POST /api/update-metadata (NameNode) 
  - ✓ GET /api/search (NameNode & DataNode)
  - ✓ POST /replicate (DataNode root)
  - ✓ POST /api/upload-patient (DataNode)
  - ✓ GET /health (DataNode)
- **Result:** All inter-node calls use correct endpoints

### 9. ✅ Package & Dependency Setup
**File:** `datanode/package.json` (newly created)
- **Includes:** express, axios, mssql, dotenv
- **Result:** DataNode can be run independently: `npm install && NODE_INSTANCE=1 npm start`

---

## 🔄 DATA FLOW AFTER FIXES

### Happy Path: New Patient Registration
```
1. Client → NameNode GET /api/get-upload-location
   Returns: {primary: http://datanode-1:3001, replica: http://datanode-2:3002}

2. Client → DataNode-1 POST /api/upload-patient
   Saves to dbo.patients (is_primary=1, version=1)
   Returns 201 immediately ← Client gets response

3. [Background] DataNode-1 → DataNode-2 POST /replicate
   Replica receives and persists (is_primary=0, version=1)

4. [Background] DataNode-1 → NameNode POST /api/update-metadata
   Metadata stored/updated in dbo.metadata (status: healthy)

5. [Background] DataNode-1 → DataNode-2 POST /internal/sync (if any degraded records exist)
```

### Degraded Path: Replication Failure
```
1. If DataNode-2 unreachable, retryReplication fails after 3 attempts
2. markDegradedReplication() stores in memory queue
3. notifyNameNode() called with status: "degraded"
4. NameNode metadata shows status: degraded
5. Next /internal/sync call can attempt recovery
```

### Single Node Scenario
```
1. NameNode GET /api/get-upload-location
   Returns: {primary: http://datanode-1:3001, replica: null}

2. Client → DataNode-1 POST /api/upload-patient
   Still returns 201 (no replication required)

3. NameNode metadata stored with replica_node: null
```

---

## 📁 FILE CHANGES SUMMARY

| File | Changes | Impact |
|------|---------|--------|
| `datanode/package.json` | Created | Dependencies available |
| `datanode/src/app.js` | Dynamic env loading + cleanup comments | Supports multiple instances |
| `datanode/src/controllers/patient.controller.js` | Async replication + version included + return 201 immediately | Eventual Consistency |
| `datanode/src/controllers/replication.controller.js` | Enhanced version validation + MERGE with version check | Prevents stale writes |
| `datanode/src/routes/patient.routes.js` | No changes | Clean |
| `datanode/src/routes/replication.routes.js` | No changes | Clean |
| `namenode/src/app.js` | Cleanup comments | More professional |
| `namenode/src/config/database.js` | Error handling improved (rethrow) | Proper error propagation |
| `namenode/src/controllers/patient.controller.js` | UPSERT metadata + degraded write logic + cleanup comments | Correct metadata lifecycle |
| `namenode/src/routes/api.js` | Cleanup comments | More professional |
| `shared/schemas/patient.schema.js` | No changes (still empty - TODO for future) | - |

---

## ⚠️ REMAINING CONSIDERATIONS (For Future Enhancement)

### 1. Input Validation Schema
- **Current:** `shared/schemas/patient.schema.js` is empty
- **Recommendation:** Implement Joi/Zod validation for:
  - patient_id format (alphanumeric, max 20 chars)
  - name required, max 255 chars
  - facility must be one of: mien-bac, mien-trung, mien-nam
- **Priority:** MEDIUM (can add later)

### 2. Monitoring & Logging
- **Current:** Basic console.log for errors
- **Recommendation:** Add structured logging (Winston/Pino) with:
  - Replication attempt counts
  - Degraded record count tracking
  - Response times for /internal/sync
- **Priority:** LOW (optional for production)

### 3. Health Check Enhancement
- **Current:** Simple `/health` returns up/down
- **Recommendation:** Include DB connectivity check:
```javascript
GET /health → { status: "up", db: "connected", version: "1.0" }
```
- **Priority:** LOW (nice-to-have)

### 4. Cascading Sync
- **Current:** Manual `/internal/sync` trigger
- **Recommendation:** Auto-retry degraded records every N seconds
- **Priority:** LOW (current manual trigger acceptable)

---

## 🧪 TESTING CHECKLIST

```
□ Start 3 DataNodes with: NODE_INSTANCE=1/2/3 npm start
□ Start NameNode: npm start
□ Register patient via NameNode → verify in all 3 DataNodes
□ Simulate DataNode-2 downtime → verify degraded status
□ Bring DataNode-2 back → run /internal/sync → verify recovery
□ Search patient → verify deduplication across nodes
□ Update patient → verify version increments
□ Kill NameNode DB → verify error thrown at startup
```

---

## 📊 CONSISTENCY MODEL MATRIX

| Scenario | Behavior | Status |
|----------|----------|--------|
| Primary write succeeds, Replica fails | Return 201 + mark degraded | ✅ Implemented |
| Repeated patient update | Metadata upserted correctly | ✅ Implemented |
| Single node alive | Degraded write allowed, no replica | ✅ Implemented |
| All nodes down | Return 503 | ✅ Implemented |
| Version conflict in replica | Keeps newer version | ✅ Implemented |
| NameNode DB connection fails | Fail at startup | ✅ Implemented |

---

## 🎓 KEY ARCHITECTURAL IMPROVEMENTS

1. **Decoupled Read/Write**
   - Write: Primary → Client (fast)
   - Replication: Background (non-blocking)

2. **Version-Based Conflict Resolution**
   - MERGE ensures only newer versions overwrite

3. **Graceful Degradation**
   - Single node: no replication but still functional
   - NameNode isolation: DataNodes can operate independently

4. **Observable State**
   - NameNode metadata tracks health/degraded status
   - Degraded queue in memory for recovery

---

## 📝 DEPLOYMENT NOTES

### Local Development
```bash
# Terminal 1: DataNode-1
NODE_INSTANCE=1 npm start

# Terminal 2: DataNode-2
NODE_INSTANCE=2 npm start

# Terminal 3: DataNode-3
NODE_INSTANCE=3 npm start

# Terminal 4: NameNode
cd namenode
npm start
```

### Environment Variables
- DataNode: `NODE_INSTANCE` (1/2/3) to select env file
- NameNode: Uses default `namenode.env`
- All nodes: NAMENODE_URL, DB_*, PORT, etc. from respective .env files

### SQL Database Setup
```sql
-- Run init_db.sql on each DataNode database
-- Creates dbo.patients table with indexes
-- NameNode database requires dbo.metadata table (created by init_db.sql)
```

---

## ✨ CONCLUSION

The distributed patient management system now implements **Eventual Consistency** with **Degraded Write Support**. All critical issues from the audit have been resolved, allowing the system to:

✅ Return responses immediately to clients  
✅ Handle replication failures gracefully  
✅ Prevent stale data overwrites  
✅ Support single-node scenarios  
✅ Track degraded replicas for recovery  

**Next Phase:** Add comprehensive input validation and automated monitoring.

---
*Report Generated: 2026-04-26*  
*Branch: Huy*  
*Status: READY FOR INTEGRATION TESTING*
