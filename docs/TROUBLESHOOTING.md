# P2P GPU Platform — Troubleshooting Guide (TROUBLESHOOTING.md)

This guide covers common operational challenges, error messages, and remediation steps across the Node Agent, Backend Server, Database, and Web Dashboard.

---

## 1. Node Agent Diagnostics

### Symptom 1: Agent reports 0 GPUs (`detected 0 GPU(s)`)
- **Root Cause:** The host machine does not have an NVIDIA GPU, or the NVIDIA proprietary display drivers are not installed / not accessible to the Python runtime.
- **Verification:**
  Open a terminal on the host and run:
  ```bash
  nvidia-smi
  ```
  If this command fails with `command not found`, NVIDIA drivers are missing.
- **Resolution:**
  1. Download and install standard drivers from [nvidia.com/drivers](https://www.nvidia.com/drivers).
  2. On Ubuntu/Debian:
     ```bash
     sudo apt update && sudo apt install -y nvidia-driver-535
     sudo reboot
     ```
  3. Verify by running `python3 -c "import pynvml; pynvml.nvmlInit(); print('NVML OK')"`

---

### Symptom 2: Connection Refused (`OSError: [Errno 111] Connect call failed`)
- **Root Cause:** The backend server is not running, or the agent is pointing to the wrong IP/port.
- **Verification:**
  1. Check if backend is active:
     ```bash
     curl -I http://<server-ip>:4000/api/nodes
     ```
  2. Verify firewall rules on the central server:
     Ensure port `4000` (or your customized backend port) allows inbound TCP connections.
- **Resolution:**
  Start the backend server:
  ```bash
  cd backend && npm run start:dev
  ```
  Pass the correct server URL to the agent:
  ```bash
  python3 main.py --server ws://<server-ip>:4000
  ```

---

### Symptom 3: `PermissionError` when writing `node_id.json`
- **Root Cause:** The agent does not have write permissions in the target data directory.
- **Resolution:**
  Grant ownership or specify a writable directory via `--data-dir`:
  ```bash
  python3 main.py --data-dir /home/user/.p2p-gpu-agent
  ```

---

### Symptom 4: Command Rejected with 400 Bad Request
- **Log message:** `Command must be one of: PING, GET_SYSTEM_INFO, GET_GPU_STATUS, SET_NODE_AVAILABILITY, RUN_GPU_TEST`
- **Root Cause:** A request attempted to execute a command that is not in the predefined security allowlist.
- **Explanation:** By design (RULES.md), the platform forbids arbitrary shell commands, terminal execution, or script evaluation. Only allowlisted commands are processed.

---

## 2. Backend Server & Database Diagnostics

### Symptom 1: Backend crashes on startup with `ECONNREFUSED 127.0.0.1:5432`
- **Root Cause:** PostgreSQL container is stopped or still starting up.
- **Verification:**
  ```bash
  docker ps -a
  ```
- **Resolution:**
  Start the database using Docker Compose:
  ```bash
  docker compose up -d
  ```
  Check PostgreSQL readiness:
  ```bash
  docker exec -it p2p-gpu-postgres pg_isready -U gpu_user -d p2p_gpu
  ```

---

### Symptom 2: Node marked OFFLINE while agent is still running
- **Root Cause:** Heartbeat timeout sweep detected `last_seen > 30 seconds`.
- **Causes:**
  1. Temporary network interruption between host and backend.
  2. Agent event loop was blocked (fixed by running GPU tests in a separate thread).
  3. Machine went to sleep / suspended.
- **Behavior:** As soon as the agent re-establishes connectivity or sends the next heartbeat, the backend will immediately transition the node status back to `ONLINE`.

---

## 3. Web Dashboard Diagnostics

### Symptom 1: Live Telemetry stream says "Reconnecting Stream..."
- **Root Cause:** Web browser cannot establish a WebSocket connection to `ws://localhost:4000`.
- **Resolution:**
  1. Ensure the NestJS backend is running on port 4000.
  2. If accessing the frontend remotely, ensure `NEXT_PUBLIC_WS_URL` is set to the public IP/domain of the backend server (e.g. `ws://server-ip:4000`).

---

## 4. Operational Runbook

| Action | Command |
| :--- | :--- |
| Check Postgres Health | `docker exec -it p2p-gpu-postgres pg_isready -U gpu_user -d p2p_gpu` |
| View Postgres Logs | `docker logs p2p-gpu-postgres --tail 50` |
| View Agent Audit Events | `curl -s http://localhost:4000/api/nodes/<nodeId>/events \| jq .` |
| View Agent Raw Logs | `tail -f agent/data/node_agent.log` |
| Restart All Containers | `docker compose restart` |
