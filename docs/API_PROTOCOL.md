# P2P GPU Platform — API & WebSocket Protocol Reference (API_PROTOCOL.md)

This specification details all bidirectional WebSocket message packets and HTTP REST endpoints.

---

## 1. WebSocket Protocol (`ws://<host>:<port>`)

All messages sent over the WebSocket use JSON encoding with an envelope format:
```json
{
  "type": "MESSAGE_TYPE",
  "payload": { ... }
}
```

---

### 1.1 Agent → Backend Messages

#### `NODE_REGISTER`
Transmitted immediately when the agent establishes a connection.
```json
{
  "type": "NODE_REGISTER",
  "payload": {
    "node_id": "node-cf671cab-2578-428a-85c9-21ee84813325",
    "node_name": "Primary-Test-Node",
    "hostname": "gpu-host-01",
    "os": "Linux 7.0.0-30-generic",
    "cpu": "Intel(R) Core(TM) i5-14500 (14C/20T)",
    "ram": "31.1 GB (23.0% used)",
    "gpus": [
      {
        "gpu_index": 0,
        "gpu_uuid": "GPU-8f2c3d5e-...",
        "gpu_name": "NVIDIA GeForce RTX 4090",
        "total_memory": 24576,
        "driver_version": "535.129.03"
      }
    ]
  }
}
```

#### `HEARTBEAT`
Transmitted every 10 seconds to maintain `last_seen` timestamp.
```json
{
  "type": "HEARTBEAT",
  "payload": {
    "node_id": "node-cf671cab-2578-428a-85c9-21ee84813325",
    "timestamp": 1788865658.41,
    "uptime_seconds": 120.5,
    "availability": "AVAILABLE"
  }
}
```

#### `GPU_STATUS`
Transmitted every 5 seconds with hardware telemetry.
```json
{
  "type": "GPU_STATUS",
  "payload": {
    "node_id": "node-cf671cab-2578-428a-85c9-21ee84813325",
    "timestamp": 1788865660.12,
    "gpus": [
      {
        "gpu_index": 0,
        "gpu_uuid": "GPU-8f2c3d5e-...",
        "gpu_name": "NVIDIA GeForce RTX 4090",
        "total_memory": 24576,
        "memory_used": 2048,
        "memory_free": 22528,
        "utilization": 4.5,
        "memory_utilization": 2.1,
        "temperature": 42.0,
        "power_draw": 35.8,
        "power_limit": 450.0,
        "driver_version": "535.129.03"
      }
    ]
  }
}
```

#### `COMMAND_RESULT`
Transmitted in response to a server command.
```json
{
  "type": "COMMAND_RESULT",
  "payload": {
    "commandId": "158c42e8-5862-4e04-a75e-e0398b468580",
    "node_id": "node-cf671cab-2578-428a-85c9-21ee84813325",
    "command": "PING",
    "status": "SUCCESS",
    "output": {
      "pong": true,
      "uptime_seconds": 26.1,
      "availability": "AVAILABLE",
      "timestamp": 1788865658.41
    }
  }
}
```

#### `GPU_TEST_RESULT`
Transmitted upon completion of `RUN_GPU_TEST`.
```json
{
  "type": "GPU_TEST_RESULT",
  "payload": {
    "commandId": "76feee05-d0ab-42b5-9535-eb6dbc621028",
    "node_id": "node-cf671cab-2578-428a-85c9-21ee84813325",
    "status": "SUCCESS",
    "results": {
      "status": "SUCCESS",
      "target_gpu_index": 0,
      "gpu_name": "NVIDIA GeForce RTX 4090",
      "duration_seconds": 5.02,
      "iterations_completed": 25,
      "initial_temperature": 42.0,
      "peak_temperature": 54.0,
      "final_temperature": 51.0,
      "peak_utilization": 98.2,
      "peak_vram_mb": 4200,
      "message": "Predefined GPU workload completed successfully"
    },
    "timestamp": 1788865707.7
  }
}
```

#### `NODE_EVENT`
Transmitted when an event occurs on the agent (e.g. shutdown).
```json
{
  "type": "NODE_EVENT",
  "payload": {
    "node_id": "node-cf671cab-2578-428a-85c9-21ee84813325",
    "event_type": "AGENT_SHUTDOWN",
    "message": "Node agent shutting down gracefully (SIGINT/SIGTERM received)"
  }
}
```

---

### 1.2 Backend → Agent Messages

#### `NODE_REGISTER_ACK`
```json
{
  "type": "NODE_REGISTER_ACK",
  "payload": {
    "node_id": "node-cf671cab-2578-428a-85c9-21ee84813325",
    "status": "REGISTERED",
    "timestamp": "2026-09-08T11:08:55.014Z"
  }
}
```

#### `HEARTBEAT_ACK`
```json
{
  "type": "HEARTBEAT_ACK",
  "payload": {
    "node_id": "node-cf671cab-2578-428a-85c9-21ee84813325",
    "timestamp": "2026-09-08T11:08:55.020Z"
  }
}
```

#### `COMMAND`
Dispatched by backend to trigger safe allowlisted actions.
```json
{
  "type": "COMMAND",
  "commandId": "158c42e8-5862-4e04-a75e-e0398b468580",
  "command": "PING",
  "params": {},
  "timestamp": "2026-09-08T11:07:38.407Z"
}
```
Example with params:
```json
{
  "type": "COMMAND",
  "commandId": "76feee05-d0ab-42b5-9535-eb6dbc621028",
  "command": "RUN_GPU_TEST",
  "params": {
    "duration": 5,
    "gpu_index": 0
  },
  "timestamp": "2026-09-08T11:08:27.671Z"
}
```

---

### 1.3 Dashboard WebSocket Messages (`DASHBOARD_SUBSCRIBE`)

Web Dashboards connect and send:
```json
{
  "type": "DASHBOARD_SUBSCRIBE"
}
```
The server broadcasts the following live event types to subscribed dashboards:
- `NODE_REGISTERED`: `{ type: "NODE_REGISTERED", payload: NodeEntity }`
- `GPU_METRICS_UPDATED`: `{ type: "GPU_METRICS_UPDATED", payload: { node_id, gpus: [...] } }`
- `NODE_OFFLINE`: `{ type: "NODE_OFFLINE", payload: { nodeId, reason } }`
- `NODE_EVENT`: `{ type: "NODE_EVENT", payload: NodeEventEntity }`
- `COMMAND_RESULT_EVENT`: `{ type: "COMMAND_RESULT_EVENT", payload: { commandId, status, ... } }`

---

## 2. HTTP REST API (`http://<host>:<port>`)

### `GET /api/nodes`
Returns high-level summary statistics and all registered nodes with their latest GPU metrics.

**Response (200 OK):**
```json
{
  "summary": {
    "totalNodes": 2,
    "onlineNodes": 2,
    "offlineNodes": 0,
    "totalGpus": 2,
    "activeGpus": 2
  },
  "nodes": [
    {
      "node_id": "node-cf671cab-...",
      "node_name": "Primary-Test-Node",
      "hostname": "gpu-rig-1",
      "os": "Linux 7.0.0",
      "cpu": "Intel i5-14500",
      "ram": "31.1 GB",
      "status": "ONLINE",
      "last_seen": "2026-09-08T11:10:00.000Z",
      "isWsConnected": true,
      "gpus": [ ... ]
    }
  ]
}
```

---

### `GET /api/nodes/:nodeId`
Returns detailed information for a specific node, including all GPU records, recent time-series metrics, and recent events.

**Response (200 OK):**
```json
{
  "node_id": "node-cf671cab-...",
  "node_name": "Primary-Test-Node",
  "hostname": "gpu-rig-1",
  "os": "Linux 7.0.0",
  "cpu": "Intel i5-14500",
  "ram": "31.1 GB",
  "status": "ONLINE",
  "last_seen": "2026-09-08T11:10:00.000Z",
  "isWsConnected": true,
  "gpus": [ ... ],
  "recentEvents": [ ... ]
}
```

---

### `POST /api/nodes/:nodeId/command`
Dispatches a safe allowlisted command to an online node.

**Request Headers:** `Content-Type: application/json`

**Request Body:**
```json
{
  "command": "PING",
  "params": {}
}
```

**Allowlisted Commands:**
- `PING`
- `GET_SYSTEM_INFO`
- `GET_GPU_STATUS`
- `SET_NODE_AVAILABILITY` (`params: { "status": "AVAILABLE" | "BUSY" }`)
- `RUN_GPU_TEST` (`params: { "duration": 5, "gpu_index": 0 }`)
- `START_JUPYTER_CONTAINER` (`params: { "port": 8888 }`)
- `STOP_JUPYTER_CONTAINER`
- `GET_CONTAINER_STATUS`

**Response (200 OK):**
```json
{
  "success": true,
  "command": "PING",
  "nodeId": "node-cf671cab-...",
  "result": {
    "commandId": "...",
    "node_id": "node-cf671cab-...",
    "command": "PING",
    "status": "SUCCESS",
    "output": {
      "pong": true,
      "uptime_seconds": 45.2,
      "availability": "AVAILABLE"
    }
  }
}
```

**Response (400 Bad Request — Security Rejection):**
```json
{
  "message": [
    "Command must be one of: PING, GET_SYSTEM_INFO, GET_GPU_STATUS, SET_NODE_AVAILABILITY, RUN_GPU_TEST"
  ],
  "error": "Bad Request",
  "statusCode": 400
}
```

---

### `GET /api/nodes/:nodeId/events`
Returns historical audit log events for a node.

**Query Parameters:**
- `limit` (optional, default: 50)

---

### `GET /api/nodes/:nodeId/metrics`
Returns historical GPU metric records for a node.

**Query Parameters:**
- `limit` (optional, default: 100)
