# DataNode Internal APIs (Replication & Sync)

## POST `/replicate`

Used by primary node to push replicated record to replica node.

### Request body

```json
{
  "patient_id": "P001",
  "name": "Nguyen Van A",
  "symptom": "Fever",
  "facility": "mien-bac",
  "version": 1,
  "is_primary": false
}
```

### Response `200`

```json
{
  "message": "Replication handled",
  "action": "inserted",
  "patient_id": "P001"
}
```

`action` can be:
- `inserted`: replica record is created
- `updated`: existing replica updated with newer version
- `ignored`: incoming record is older or equal version

### Response `400`

```json
{
  "message": "Invalid replication payload",
  "required": ["patient_id", "version"]
}
```

## POST `/internal/sync`

Manually trigger sync for records marked as degraded (failed replication before).

### Response `200`

```json
{
  "message": "Sync completed",
  "total": 1,
  "recovered": 1,
  "failed": 0,
  "details": [
    {
      "patient_id": "P001",
      "status": "recovered",
      "attempt": 1
    }
  ]
}
```

