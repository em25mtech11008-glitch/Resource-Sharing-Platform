# P2P GPU Platform — Architecture Documentation (ARCHITECTURE.md)

This document details the system design, communication protocols, state machines, and data flows of the P2P GPU Platform MVP.

---

## 1. High-Level System Architecture

```mermaid
graph TD
    subgraph GPU Owner Machine [Remote Host / GPU Machine]
        NVML[NVIDIA NVML / nvidia-smi]
        Agent[Python GPU Node Agent]
        Disk[(node_id.json)]
        NVML -->|Hardware Telemetry| Agent
        Agent <-->|Persistent Identity| Disk
    end

    subgraph Central Platform [Central Server / Cloud]
        Backend[NestJS Backend Server :4000]
        WSG[WebSocket Gateway]
        Detector[Offline Heartbeat Detector Cron]
        DB[(PostgreSQL 16 :5432)]
        UI[Next.js Web Dashboard :3000]

        WSG <--> Backend
        Detector --> Backend
        Backend <--> DB
        UI <-->|REST & Live WS| Backend
    end

    Agent == Outbound Persistent WebSocket ==> WSG
```

---

## 2. Component Responsibilities

### 2.1 Python Node Agent
- **Outbound Connection:** Initiates an outbound WebSocket connection to the backend server. Requires zero inbound ports or public IP.
- **Hardware Telemetry:** Direct driver interaction via `pynvml` (primary) and `nvidia-smi` (fallback) to inspect core utilization, VRAM usage, temperature, power, and driver version. No mock data is ever fabricated.
- **Persistent Identity:** Automatically generates a UUIDv4 node ID on first run, saves it to `data/node_id.json`, and preserves the same identity across reboots.
- **Periodic Streaming:** Sends `NODE_REGISTER` on connect, `HEARTBEAT` every 10 seconds, and `GPU_STATUS` telemetry every 5 seconds.
- **Exponential Backoff Reconnection:** Automatically reconnects upon network drops or server restarts using jittered exponential backoff (1s -> 2s -> 4s -> ... -> 60s max).
- **Zero-RCE Predefined Command Runner:** Strictly allowlists commands (`PING`, `GET_SYSTEM_INFO`, `GET_GPU_STATUS`, `SET_NODE_AVAILABILITY`, `RUN_GPU_TEST`) and rejects any arbitrary shell or script execution.

### 2.2 NestJS Backend & Control Server
- **WebSocket Gateway (`NodesGateway`):** Accepts and routes bidirectional messages with agents and web dashboards.
- **Connection Registry:** Tracks live WebSocket connections, maps sockets to `node_id`, and manages dispatch timeouts.
- **Database Persistence (`NodesService`):** Persists node info, GPU specs, metric time-series, and audit events in PostgreSQL using TypeORM.
- **Offline Detector Service:** A scheduled sweep running every 5 seconds that identifies nodes whose `last_seen` timestamp exceeds the timeout (~30s), marks them `OFFLINE`, updates their GPUs to `OFFLINE`, and alerts connected dashboards.
- **Safe Command Dispatcher:** REST endpoint (`POST /api/nodes/:nodeId/command`) that validates input against the command allowlist, dispatches the request to the target agent over WebSocket, awaits response with timeout, and logs audit events.

### 2.3 Web Dashboard (Next.js)
- **Real-Time Overview:** Displays count of online/offline nodes, total GPUs, and active GPUs.
- **Node Grid & Cards:** Shows hardware specs, live GPU metrics, utilization progress bars, and status badges.
- **Interactive Control Modal:** Inspects full node hardware, real-time GPU gauges (VRAM, utilization, temp, power), triggers safe allowlisted actions, and views recent node audit events.

### 2.4 PostgreSQL Database
- `nodes`: Hostname, OS, CPU, RAM, status, last_seen, timestamps.
- `gpus`: Node reference, index, UUID, name, total VRAM, driver version, availability.
- `gpu_metrics`: Time-series telemetry (utilization, VRAM used/free, temperature, power draw/limit).
- `node_events`: Immutable audit trail for registrations, disconnections, command dispatches, command completions, and errors.

---

## 3. Communication & Data Flows

### 3.1 Node Registration Flow
```mermaid
sequenceDiagram
    autonumber
    actor Host as GPU Owner
    participant Agent as Python Node Agent
    participant WS as Backend WebSocket Gateway
    participant DB as PostgreSQL Database
    participant Dash as Web Dashboard

    Host->>Agent: Launch python main.py
    Agent->>Agent: Read data/node_id.json (or generate UUID)
    Agent->>Agent: Query NVML / sys_info
    Agent->>WS: Connect ws://server:4000
    WS-->>Agent: WebSocket Connected
    Agent->>WS: NODE_REGISTER {node_id, hostname, os, cpu, ram, gpus: [...]}
    WS->>DB: Upsert Node & GPUs, mark ONLINE, log event
    WS-->>Agent: NODE_REGISTER_ACK {status: "REGISTERED"}
    WS->>Dash: Broadcast NODE_REGISTERED event
```

### 3.2 Periodic Telemetry & Heartbeat Flow
```mermaid
sequenceDiagram
    autonumber
    participant Agent as Python Node Agent
    participant WS as Backend WebSocket Gateway
    participant DB as PostgreSQL Database
    participant Dash as Web Dashboard

    loop Every 5 seconds
        Agent->>WS: GPU_STATUS {node_id, gpus: [utilization, vram, temp, power]}
        WS->>DB: Insert into gpu_metrics, update node.last_seen
        WS->>Dash: Broadcast GPU_METRICS_UPDATED
    end

    loop Every 10 seconds
        Agent->>WS: HEARTBEAT {node_id, timestamp, uptime}
        WS->>DB: Update node.last_seen = now()
        WS-->>Agent: HEARTBEAT_ACK
    end
```

### 3.3 Offline Detection Flow
```mermaid
sequenceDiagram
    autonumber
    participant Cron as OfflineDetectorService (5s interval)
    participant DB as PostgreSQL Database
    participant WS as Backend WebSocket Gateway
    participant Dash as Web Dashboard

    Cron->>DB: Query nodes where status != 'OFFLINE' AND last_seen < (now - 30s)
    alt Node timed out
        DB-->>Cron: Return timed out nodes
        Cron->>DB: Update node status to OFFLINE, gpus to OFFLINE
        Cron->>DB: Insert DISCONNECT event into node_events
        Cron->>WS: Broadcast NODE_OFFLINE {nodeId}
        WS->>Dash: Update UI status badge to OFFLINE
    end
```

### 3.4 Safe Command Execution Flow
```mermaid
sequenceDiagram
    autonumber
    actor User as Platform Operator
    participant Dash as Web Dashboard
    participant API as Backend REST Controller
    participant WS as Backend WebSocket Gateway
    participant Agent as Python Node Agent
    participant DB as PostgreSQL Database

    User->>Dash: Click 'Run GPU Test' or 'Ping'
    Dash->>API: POST /api/nodes/:nodeId/command {command: "RUN_GPU_TEST", params: {duration: 5}}
    API->>API: Validate against ALLOWED_COMMANDS allowlist
    API->>DB: Insert COMMAND_DISPATCH event
    API->>WS: Send over target agent's socket {commandId, command, params}
    WS->>Agent: WebSocket packet COMMAND
    Agent->>Agent: Security allowlist verification
    Agent->>Agent: Run predefined safe workload (in separate thread)
    Agent->>WS: GPU_TEST_RESULT {commandId, status: "SUCCESS", results: {...}}
    WS->>DB: Insert GPU_TEST_RESULT event
    WS-->>API: Resolve pending command promise
    API-->>Dash: HTTP 200 {success: true, result: {...}}
    Dash-->>User: Display test results & metrics
```
