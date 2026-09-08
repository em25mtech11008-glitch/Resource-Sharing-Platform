# P2P GPU Platform — MVP & Node Agent Control Center

A complete, integrated MVP for a future Peer-to-Peer (P2P) GPU rental platform.

The primary objective of this MVP is to validate a **reliable Python GPU Node Agent** that runs on remote computers, connects NVIDIA GPU hardware to a central platform over persistent WebSockets, streams live hardware telemetry, withstands network interruptions, and safely communicates with zero Remote Code Execution (RCE) exposure.

---

## Architecture Overview

```
 Web Dashboard (Next.js 14 + React + Tailwind CSS)
                │
                ▼
 Backend / Control Server (NestJS + TypeORM)
                │
                │ Persistent Outbound WebSocket
                │
       ┌────────┴────────┬────────────────┐
       ▼                 ▼                ▼
  GPU Node 1        GPU Node 2       GPU Node 3
 Python Agent      Python Agent     Python Agent
       │                 │                │
  NVIDIA GPU        NVIDIA GPU       NVIDIA GPU

 Database: PostgreSQL 16 (Docker Compose)
 Development: Docker Compose / Node.js 20+ / Python 3.10+
```

### Key Security & Network Guarantees
- **Outbound Connections Only:** The GPU Node Agent always initiates outbound WebSocket connections to the central platform.
- **Zero Inbound Configuration:** GPU owners do **not** need a public IP, static IP, inbound open ports, port forwarding, SSH access, or remote desktop protocols.
- **Zero Arbitrary Execution:** Shell execution (`bash`, `sh`, `powershell`), terminal streaming, and arbitrary Python execution are completely disabled and architecturally forbidden.
- **Strict Allowlist:** The agent only accepts five predefined commands: `PING`, `GET_SYSTEM_INFO`, `GET_GPU_STATUS`, `SET_NODE_AVAILABILITY`, and `RUN_GPU_TEST`.
- **Persistent Identity:** Each node generates a UUIDv4 on initial run and persists it to disk. Reconnecting nodes are updated via upserts, never duplicated.
- **Real Hardware Telemetry (No Mock Data):** Telemetry queries actual NVIDIA NVML bindings (`pynvml` / `nvidia-ml-py`) with `nvidia-smi` fallback. If no NVIDIA GPU is detected, 0 GPUs are accurately reported.

---

## Tech Stack

- **GPU Node Agent:** Python 3.10+, `websockets`, `psutil`, `nvidia-ml-py` / `pynvml`
- **Backend / Control Server:** NestJS, TypeScript, `@nestjs/platform-ws` (RFC 6455 WebSockets), TypeORM, `@nestjs/schedule`
- **Database:** PostgreSQL 16 (via Docker Compose)
- **Frontend Dashboard:** Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, Lucide Icons

---

## Quick Start Guide

### 1. Start PostgreSQL Database
```bash
docker compose up -d
```
Verify the container is healthy:
```bash
docker exec -it p2p-gpu-postgres pg_isready -U gpu_user -d p2p_gpu
```

---

### 2. Start NestJS Backend Server
```bash
cd backend
npm install
npm run build
npm run start
```
The backend will:
- Listen for HTTP API requests on `http://localhost:4000`
- Listen for WebSocket connections on `ws://localhost:4000`
- Automatically synchronize PostgreSQL schema tables (`nodes`, `gpus`, `gpu_metrics`, `node_events`)
- Run an offline detector sweep every 5 seconds (30-second heartbeat timeout)

---

### 3. Start Web Dashboard
```bash
cd frontend
npm install
npm run dev
```
Open your browser and navigate to:
```text
http://localhost:3000
```

---

### 4. Run the Python GPU Node Agent
On any computer (local machine or remote GPU server):

```bash
cd agent
pip install -r requirements.txt
python3 main.py --name "Primary-GPU-Node"
```

To connect a remote agent to a central server over LAN or Internet:
```bash
python3 main.py --server ws://<server-ip>:4000 --name "Remote-RTX4090"
```

The agent will:
1. Detect host system specs (OS, CPU cores, RAM).
2. Query NVIDIA NVML for GPU model, VRAM, utilization, temperature, power, and driver version.
3. Establish an outbound persistent WebSocket connection.
4. Stream heartbeats every 10 seconds and GPU metrics every 5 seconds.
5. Automatically reconnect with jittered exponential backoff if the network or backend drops.

---

## Safe Command Allowlist & Testing

The platform allows safe control of remote nodes via predefined allowlisted commands:

```bash
# Ping a node
curl -X POST http://localhost:4000/api/nodes/<NODE_ID>/command \
  -H "Content-Type: application/json" \
  -d '{"command": "PING"}'

# Refresh hardware system info
curl -X POST http://localhost:4000/api/nodes/<NODE_ID>/command \
  -H "Content-Type: application/json" \
  -d '{"command": "GET_SYSTEM_INFO"}'

# Refresh GPU status
curl -X POST http://localhost:4000/api/nodes/<NODE_ID>/command \
  -H "Content-Type: application/json" \
  -d '{"command": "GET_GPU_STATUS"}'

# Set node availability to BUSY or AVAILABLE
curl -X POST http://localhost:4000/api/nodes/<NODE_ID>/command \
  -H "Content-Type: application/json" \
  -d '{"command": "SET_NODE_AVAILABILITY", "params": {"status": "BUSY"}}'

# Run safe predefined built-in GPU test
curl -X POST http://localhost:4000/api/nodes/<NODE_ID>/command \
  -H "Content-Type: application/json" \
  -d '{"command": "RUN_GPU_TEST", "params": {"duration": 5}}'
```

Any unauthorized command (e.g. `{"command": "EXEC_SHELL"}`) is rejected by both the backend API and the agent's internal security perimeter.

---

## Project Documentation Directory

Detailed specifications and runbooks are available in the [`docs/`](file:///home/user/Desktop/Node%20agent/docs/) directory:

- [RULES.md](file:///home/user/Desktop/Node%20agent/RULES.md) — Mandatory engineering rules and security boundaries.
- [SKILL.md](file:///home/user/Desktop/Node%20agent/SKILL.md) — Technical reference and engineering best practices.
- [docs/USER_MANUAL.md](file:///home/user/Desktop/Node%20agent/docs/USER_MANUAL.md) — Non-technical guide for GPU owners.
- [docs/ARCHITECTURE.md](file:///home/user/Desktop/Node%20agent/docs/ARCHITECTURE.md) — Architectural diagrams, data flows, and state machines.
- [docs/NODE_AGENT.md](file:///home/user/Desktop/Node%20agent/docs/NODE_AGENT.md) — In-depth agent internals, NVML, and reconnection logic.
- [docs/API_PROTOCOL.md](file:///home/user/Desktop/Node%20agent/docs/API_PROTOCOL.md) — JSON schema envelopes and REST API documentation.
- [docs/TROUBLESHOOTING.md](file:///home/user/Desktop/Node%20agent/docs/TROUBLESHOOTING.md) — Error diagnostics and resolution runbook.
- [docs/TESTING.md](file:///home/user/Desktop/Node%20agent/docs/TESTING.md) — Verification plans and integration test scenarios.

---

## Verification & Acceptance Checklist

- [x] PostgreSQL starts via Docker Compose and creates database schema.
- [x] NestJS backend starts, exposes REST API on `:4000`, and runs RFC 6455 WebSocket gateway.
- [x] Next.js frontend builds and serves responsive operations dashboard on `:3000`.
- [x] Python Node Agent connects via outbound WebSocket with zero inbound ports required.
- [x] Persistent unique Node ID (`node_id.json`) preserved across agent reboots.
- [x] Hardware detection queries actual NVIDIA NVML & `nvidia-smi` without mock data.
- [x] Periodic heartbeats (10s) and GPU metrics streaming (5s).
- [x] Offline detector marks inactive nodes `OFFLINE` after 30-second silence.
- [x] Jittered exponential backoff handles temporary network drops and backend reboots.
- [x] Safe command allowlist (`PING`, `GET_SYSTEM_INFO`, `GET_GPU_STATUS`, `SET_NODE_AVAILABILITY`, `RUN_GPU_TEST`) fully operational.
- [x] Arbitrary command execution and remote shell access strictly rejected.
- [x] Multi-node concurrency verified with independent telemetry streams.
- [x] Complete technical and user-facing documentation suite synchronized.
