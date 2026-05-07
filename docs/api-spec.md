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

## GET `/stats/today`

Used by the NameNode to aggregate today’s inserted patient count from each primary DataNode.

### Response `200`

```json
{
  "total": 12,
  "scope": "primary_records",
  "date_utc": "2026-05-07"
}
```

## GET `/api/patients/stats/today`

NameNode endpoint that returns the aggregated count of patient records added today across all reachable primary DataNodes.

### Response `200`

```json
{
  "total_today": 12,
  "query_date_utc": "2026-05-07",
  "per_node": [
    {
      "node": "https://example-datanode.ngrok-free.dev",
      "total": 5
    }
  ],
  "unavailable_nodes": []
}
```

