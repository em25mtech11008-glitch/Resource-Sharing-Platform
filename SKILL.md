# P2P GPU Platform — Technical Reference & Engineering Skill Guide (SKILL.md)

This document provides the standard reference patterns, architectural designs, and implementation best practices for the P2P GPU Platform MVP.

---

## 1. System Architecture Overview

```
 ┌─────────────────────────────────────────────────────────────┐
 │                Web Dashboard (Next.js 14+)                 │
 │       Real-time node telemetry, status badges, actions       │
 └──────────────────────────────┬──────────────────────────────┘
                                │ HTTP / WebSocket
                                ▼
 ┌─────────────────────────────────────────────────────────────┐
 │            Central Backend / Control Server (NestJS)         │
 │  - WebSocket Gateway (Agent communication on /ws/agent)      │
 │  - Dashboard WebSocket (Live updates on /ws/dashboard)       │
 │  - REST API (/api/nodes, /api/nodes/:id/command)             │
 │  - Offline Detector & Heartbeat Monitor Cron                 │
 └──────────────┬───────────────────────────────┬──────────────┘
                │ TypeORM                       │ WebSocket (Inbound from Agent)
                ▼                               ▼
 ┌───────────────────────────┐    ┌────────────────────────────┐
 │   PostgreSQL Database     │    │   Python Node Agent        │
 │ - nodes                   │    │ - Persistent node_id       │
 │ - gpus                    │    │ - Hardware detection       │
 │ - gpu_metrics             │    │ - NVML / nvidia-smi        │
 │ - node_events             │    │ - Backoff reconnection     │
 └───────────────────────────┘    │ - Predefined command runner│
                                  └────────────────────────────┘
```

---

## 2. Technology Standards & Best Practices

### 2.1 Python Node Agent
- **Runtime:** Python 3.10+ (tested on Python 3.12).
- **Asynchronous Engine:** `asyncio` with `websockets` client library for persistent bidirectional messaging.
- **Node Identity:**
  - On startup, search for `data/node_id.json`.
  - If missing, generate `node_id = str(uuid.uuid4())`, write atomically to `data/node_id.json`.
  - Identity persists across machine restarts and process reboots.
- **NVIDIA GPU Telemetry:**
  - Primary driver: `pynvml` (`nvidia-ml-py`).
  - Fallback driver: `nvidia-smi` CLI query parsing (`--query-gpu=index,name,uuid,memory.total,memory.used,memory.free,utilization.gpu,utilization.memory,temperature.gpu,power.draw,power.limit,driver_version --format=csv,noheader,nounits`).
  - No Mock Data: If NVML and `nvidia-smi` are unavailable or report no devices, accurately report 0 GPUs and log that no hardware was detected.
  - Multi-GPU: Always query device count `nvmlDeviceGetCount()` and iterate over each index `0..N-1`.
- **Reconnection with Exponential Backoff:**
  - Base delay: 1.0s, multiplier: 2.0, max delay: 60.0s, jitter: ±20%.
  - When connection is severed, gracefully close sockets, wait for the backoff interval, and retry outbound connection.
  - On successful connection, reset backoff counter to 1.0s.
- **Command Security Allowlist:**
  - Incoming payloads are strictly parsed as JSON.
  - Expected envelope: `{"commandId": "...", "command": "COMMAND_NAME", "params": {...}}`.
  - Allowed commands: `PING`, `GET_SYSTEM_INFO`, `GET_GPU_STATUS`, `SET_NODE_AVAILABILITY`, `RUN_GPU_TEST`.
  - Any unknown command string immediately triggers an error packet:
    `{"status": "ERROR", "error": "Unknown or forbidden command: <cmd>"}` and logs an internal warning.
- **Safe GPU Test Execution:**
  - Only execute built-in compute routines (e.g. PyTorch CUDA tensor matmul if available, or matrix math benchmark using CUDA libraries/vector compute).
  - Check node availability: if `BUSY`, reject execution.
  - Fixed, bounded duration (e.g., 5-10 seconds) with time budget enforcement.
  - Sample GPU metrics periodically during test; return summary (peak utilization, peak temperature, peak VRAM, duration, status).

---

### 2.2 NestJS Backend Architecture
- **Framework:** NestJS with TypeScript.
- **WebSocket Gateway:**
  - Use `ws` adapter or `@nestjs/websockets` with native WebSocket engine.
  - Agent Gateway: `/ws/agent` handles persistent connections from Python agents.
  - Connection map: `Map<nodeId, { socket, lastSeen, status }>`.
  - Dashboard Gateway: `/ws/dashboard` broadcasts real-time telemetry to frontends.
- **Database Access:** TypeORM with PostgreSQL.
  - Entities:
    1. `NodeEntity` (`nodes`): `node_id` (PK, string), `node_name`, `hostname`, `os`, `cpu`, `ram`, `status` (`ONLINE`|`OFFLINE`|`AVAILABLE`|`BUSY`), `last_seen`, `created_at`, `updated_at`.
    2. `GpuEntity` (`gpus`): `id` (PK, uuid), `node_id` (FK), `gpu_index`, `gpu_uuid`, `gpu_name`, `total_memory`, `driver_version`, `availability`, `created_at`, `updated_at`.
    3. `GpuMetricEntity` (`gpu_metrics`): `id` (PK, uuid), `gpu_id` (FK), `node_id`, `utilization`, `memory_used`, `memory_free`, `temperature`, `power_draw`, `power_limit`, `timestamp`.
    4. `NodeEventEntity` (`node_events`): `id` (PK, uuid), `node_id`, `event_type`, `message`, `metadata`, `timestamp`.
- **Heartbeat Tracking & Offline Detection:**
  - Background scheduler (`@nestjs/schedule` or `setInterval`): Runs every 5 seconds.
  - Identifies nodes where `status != 'OFFLINE'` and `last_seen < (now - 30_000ms)`.
  - Automatically transitions timed-out nodes to `OFFLINE`, marks their GPUs as `OFFLINE`, inserts a `DISCONNECT` event, and broadcasts status change to all dashboard clients.
- **Command Dispatcher:**
  - Validates command against allowlist.
  - Generates unique `commandId` (UUID).
  - Transmits over target node's active WebSocket connection.
  - Registers pending promise with 15s timeout to capture the agent's `COMMAND_RESULT` response.

---

### 2.3 Next.js Frontend Architecture
- **Framework:** Next.js (App Router), React, TypeScript, Tailwind CSS.
- **Design Philosophy:** Clean, dark-mode focused, utilitarian operations dashboard.
- **State & Real-time Integration:**
  - Initial load via REST: `GET /api/nodes` (fetches all nodes and GPU summaries).
  - Real-time stream: WebSocket connection to `/ws/dashboard` for immediate reactive updates on:
    - Node online / offline state changes
    - Streaming GPU metrics (utilization, VRAM, temp, power)
    - Node events (registrations, commands, test completions)
- **Interactive Control Drawer / Modal:**
  - Detailed system specs (CPU cores, RAM total/used, OS release, IP/hostname).
  - Per-GPU hardware gauges (VRAM progress bar, Utilization %, Temp °C, Power W).
  - Safe action buttons: Ping, Refresh System Info, Refresh GPU Status, Toggle Available/Busy, Run GPU Test.

---

### 2.4 Security Hardening Rules
1. Never open inbound listening ports on the GPU Node Agent.
2. Never send raw shell strings or executable paths from the backend.
3. Message validation: Both the agent and backend parse JSON and validate schema fields before dispatching handlers.
4. All command dispatch events and executions are immutably logged into `NODE_EVENTS`.
