# P2P GPU Platform — Testing & Verification Guide (TESTING.md)

This document provides step-by-step test plans and verification procedures for every operational requirement of the P2P GPU Platform MVP.

---

## 1. Automated & Integration Test Matrix

| Test Case | Description | Expected Outcome | Verification Method |
| :--- | :--- | :--- | :--- |
| **TC-01** | Database Startup | PostgreSQL container starts & accepts connections | `docker exec -it p2p-gpu-postgres pg_isready` |
| **TC-02** | Backend Startup | NestJS initializes TypeORM & WebSocket gateway | `curl http://localhost:4000/api/nodes` returns 200 OK |
| **TC-03** | Frontend Startup | Next.js dashboard compiles & serves on port 3000 | `curl -I http://localhost:3000` returns 200 OK |
| **TC-04** | Node Identity Persistence | Node generates `node_id` and re-reads it on reboot | `node_id.json` is preserved across agent restarts |
| **TC-05** | Agent Outbound Connection | Agent connects to server without open inbound ports | Backend logs `New WebSocket connection established` |
| **TC-06** | Node Registration | Node registers hardware specs & GPUs into PostgreSQL | Record appears in `nodes` table with status `ONLINE` |
| **TC-07** | Hardware Telemetry (No Mock) | Queries actual NVML/nvidia-smi or reports 0 GPUs | Zero mock data generated; real CPU/RAM/GPU parsed |
| **TC-08** | Heartbeat & Last Seen | Agent emits heartbeat every 10s | `last_seen` timestamp in database updates continuously |
| **TC-09** | Disconnect Handling | Agent termination immediately updates status | WebSocket close event transitions node to `OFFLINE` |
| **TC-10** | Offline Sweep Detection | Heartbeat silence for >30s marks node offline | `OfflineDetectorService` marks stale node `OFFLINE` |
| **TC-11** | Automatic Reconnection | Agent reconnects after backend outage | Exponential backoff triggers; node returns to `ONLINE` |
| **TC-12** | Multi-Node Concurrency | Multiple agents connect with unique IDs | Summary shows `totalNodes: N, onlineNodes: N` |
| **TC-13** | Predefined Command: PING | Dispatches PING to agent | Agent replies with `pong: true`, uptime, and latency |
| **TC-14** | Predefined Command: SYS_INFO | Dispatches GET_SYSTEM_INFO | Agent replies with fresh CPU, RAM, OS metrics |
| **TC-15** | Predefined Command: GPU_STATUS | Dispatches GET_GPU_STATUS | Agent replies with latest GPU telemetry snapshot |
| **TC-16** | Predefined Command: AVAILABILITY | Toggles node availability (`BUSY` / `AVAILABLE`) | Node and GPU records update in DB and frontend |
| **TC-17** | Predefined Command: RUN_GPU_TEST | Executes internal bounded GPU workload | Fixed duration test collects metrics; no code sent |
| **TC-18** | Security Rejection | Server or agent receives unauthorized command | 400 Bad Request / error packet; zero RCE |

---

## 2. Step-by-Step Verification Procedures

### Test 1: Persistent Node Identity (`TC-04`)
1. Launch agent:
   ```bash
   cd agent && python3 main.py --name "Node-Identity-Test"
   ```
2. Check generated ID in console:
   ```text
   [INFO] [GPU-Agent.Identity] Generated and saved new persistent Node ID: node-cf671cab-...
   ```
3. Stop the agent with `Ctrl+C`.
4. Check the content of `data/node_id.json`:
   ```bash
   cat agent/data/node_id.json
   ```
5. Restart the agent:
   ```bash
   python3 main.py --name "Node-Identity-Test"
   ```
6. **Pass Criteria:** The console logs:
   ```text
   [INFO] [GPU-Agent.Identity] Loaded persistent Node ID from disk: node-cf671cab-...
   [INFO] [GPU-Agent] Resuming with existing Node ID: node-cf671cab-...
   ```
   No new record is duplicated in the backend database.

---

### Test 2: Safe Predefined Commands Execution (`TC-13` – `TC-17`)

1. **Ping Command:**
   ```bash
   curl -X POST http://localhost:4000/api/nodes/<NODE_ID>/command \
     -H "Content-Type: application/json" \
     -d '{"command": "PING"}'
   ```
   **Response:** `{"success": true, "command": "PING", "result": {"output": {"pong": true, "uptime_seconds": ...}}}`

2. **System Info Command:**
   ```bash
   curl -X POST http://localhost:4000/api/nodes/<NODE_ID>/command \
     -H "Content-Type: application/json" \
     -d '{"command": "GET_SYSTEM_INFO"}'
   ```
   **Response:** Returns `hostname`, `cpu_usage_percent`, `ram_used_mb`, etc.

3. **Set Availability to BUSY:**
   ```bash
   curl -X POST http://localhost:4000/api/nodes/<NODE_ID>/command \
     -H "Content-Type: application/json" \
     -d '{"command": "SET_NODE_AVAILABILITY", "params": {"status": "BUSY"}}'
   ```
   **Response:** `{"availability": "BUSY"}`. Node card updates to yellow BUSY badge.

4. **Run Predefined GPU Test:**
   ```bash
   curl -X POST http://localhost:4000/api/nodes/<NODE_ID>/command \
     -H "Content-Type: application/json" \
     -d '{"command": "RUN_GPU_TEST", "params": {"duration": 5}}'
   ```
   **Response:** Agent executes internal safe benchmark, measures sensor metrics, and returns structured result.

---

### Test 3: Security Boundary & Zero RCE Verification (`TC-18`)

Send an unauthorized or malicious payload attempting shell execution:
```bash
curl -X POST http://localhost:4000/api/nodes/<NODE_ID>/command \
  -H "Content-Type: application/json" \
  -d '{"command": "EXEC_SHELL", "params": {"cmd": "whoami"}}'
```
**Pass Criteria:**
1. Server returns HTTP 400 Bad Request:
   ```json
   {
     "message": ["Command must be one of: PING, GET_SYSTEM_INFO, GET_GPU_STATUS, SET_NODE_AVAILABILITY, RUN_GPU_TEST"],
     "error": "Bad Request",
     "statusCode": 400
   }
   ```
2. No process is executed on the agent machine.

---

### Test 4: Multi-Node Concurrency (`TC-12`)
1. Start Node 1 in terminal 1:
   ```bash
   python3 main.py --name "Rig-1" --data-dir "data-rig1"
   ```
2. Start Node 2 in terminal 2:
   ```bash
   python3 main.py --name "Rig-2" --data-dir "data-rig2"
   ```
3. Check summary endpoint:
   ```bash
   curl http://localhost:4000/api/nodes | jq .summary
   ```
4. **Pass Criteria:**
   ```json
   {
     "totalNodes": 2,
     "onlineNodes": 2,
     "offlineNodes": 0
   }
   ```
   Both nodes appear independently on the web dashboard.

---

### Test 5: Backend Outage & Agent Auto-Reconnection (`TC-11`)
1. With an active agent running, stop the backend server process.
2. Observe agent logs:
   ```text
   [WARNING] [GPU-Agent.Connection] Connection lost. Reconnecting in 1.1s (backoff factor: 1.0s)...
   [WARNING] [GPU-Agent.Connection] Connection lost. Reconnecting in 2.2s (backoff factor: 2.0s)...
   ```
3. Start the backend server again.
4. Observe agent logs within seconds:
   ```text
   [INFO] [GPU-Agent.Connection] Connected to central backend WebSocket.
   [INFO] [GPU-Agent.Connection] Sending NODE_REGISTER...
   [INFO] [GPU-Agent.Connection] Node registered acknowledged by platform!
   ```
5. **Pass Criteria:** The agent recovers autonomously with zero human intervention and resumes streaming.
