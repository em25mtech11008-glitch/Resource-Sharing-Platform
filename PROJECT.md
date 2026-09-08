# P2P GPU Platform — Complete Operations & Verification Guide (PROJECT.md)

This guide provides complete, step-by-step instructions for running the central platform, connecting remote GPU computers over the same Wi-Fi/LAN, and thoroughly testing every feature.

---

## 1. System Overview & Network Topology

```text
 ┌──────────────────────────────────────────────────────────────────┐
 │                     MACHINE A: CENTRAL SERVER                    │
 │                     Local IP: 172.25.134.9                       │
 │                                                                  │
 │  1. PostgreSQL Database   -> Port 5432                           │
 │  2. NestJS Backend Server -> Port 4000 (REST + WebSocket)        │
 │  3. Next.js Web Dashboard -> Port 3000 (Web UI)                  │
 └──────────────────────────────▲───────────────────────────────────┘
                                │
               (Same Wi-Fi / Local Area Network)
                                │ Outbound WebSocket (ws://172.25.134.9:4000)
 ┌──────────────────────────────┴───────────────────────────────────┐
 │                     MACHINE B: REMOTE GPU NODE                   │
 │                     (Windows 11 or Linux PC)                     │
 │                                                                  │
 │  - Python GPU Node Agent (main.py)                               │
 │  - NVIDIA GPU Hardware (NVML / nvidia-smi telemetry)             │
 │  - Sandboxed Jupyter Docker Container (:8888)                    │
 │                                                                  │
 │  * NO public IP, NO port forwarding, and NO open ports required! │
 └──────────────────────────────────────────────────────────────────┘
```

---

## 2. Setting Up Machine A (Central Server)

Run these steps on the main computer hosting the backend, database, and web dashboard.

### Step 2.1: Start the PostgreSQL Database
Make sure Docker is running, then run in terminal:
```bash
cd "/home/user/Desktop/Node agent"
docker compose up -d
```
Verify PostgreSQL is ready:
```bash
docker exec -it p2p-gpu-postgres pg_isready -U gpu_user -d p2p_gpu
# Expected output: /var/run/postgresql:5432 - accepting connections
```

---

### Step 2.2: Start the NestJS Backend Server (:4000)
Open a new terminal tab and start the backend:
```bash
cd "/home/user/Desktop/Node agent/backend"
npm run start:prod
# Or in development mode: npm run start:dev
```

**Verification:**
Open your browser or run curl:
```bash
curl http://localhost:4000/api/nodes
# Expected output: {"summary":{"totalNodes":...,"onlineNodes":...},"nodes":[...]}
```

---

### Step 2.3: Start the Next.js Web Dashboard (:3000)
Open a new terminal tab and start the frontend:
```bash
cd "/home/user/Desktop/Node agent/frontend"
npm run start
# Or in development mode: npm run dev
```

**Verification:**
Open `http://localhost:3000` in your browser. You will see:
- Real-time Summary Cards
- Header with green pulsing indicator: `Live Telemetry Stream`
- Connected GPU Nodes grid

---

## 3. Connecting Machine B (Remote GPU Computer) Over the Same Wi-Fi

### Step 3.1: Check Wi-Fi Connection
Ensure **Machine A** and **Machine B** are connected to the **same Wi-Fi router** (or same local network).

Find Machine A's IP address (already detected as **`172.25.134.9`**).
You can verify it anytime on Machine A by running:
```bash
hostname -I
```

---

### Step 3.2: Transfer the Agent Package to Machine B

You can copy the pre-packaged agent files located in `~/Desktop/Node agent`:
- [`agent-package.zip`](file:///home/user/Desktop/Node%20agent/agent-package.zip) (Recommended for Windows)
- [`agent-package.tar.gz`](file:///home/user/Desktop/Node%20agent/agent-package.tar.gz) (Recommended for Linux)

**Transfer Methods:**
- **Method 1 (USB Drive):** Copy `agent-package.zip` to a USB drive and paste it onto Machine B.
- **Method 2 (Local Network Download):**
  On Machine A, run a quick web server:
  ```bash
  cd "/home/user/Desktop/Node agent"
  python3 -m http.server 8080
  ```
  On Machine B, open any browser and download:
  `http://172.25.134.9:8080/agent-package.zip`

---

### Step 3.3: Install Dependencies on Machine B

On **Machine B**:
1. Extract `agent-package.zip` (Right-click -> Extract All).
2. Open **PowerShell** (Windows) or **Terminal** (Linux) inside the extracted `agent` folder:
   ```powershell
   cd C:\path\to\extracted\agent
   ```
3. Install required Python packages:
   ```powershell
   pip install -r requirements.txt
   ```

---

### Step 3.4: Launch the Agent on Machine B

Run the agent, specifying Machine A's IP with the `--server` parameter:

```powershell
python main.py --server ws://172.25.134.9:4000 --name "LivingRoom-GPU-Rig"
```
*(On Linux, use `python3 main.py ...`)*.

#### Expected Output in Terminal on Machine B:
```text
[2026-09-08 12:00:00] [INFO] [GPU-Agent] Starting P2P GPU Node Agent...
[2026-09-08 12:00:00] [INFO] [GPU-Agent] Target Platform URL: ws://172.25.134.9:4000
[2026-09-08 12:00:00] [INFO] [GPU-Agent.Identity] Generated and saved new persistent Node ID: node-xxxx...
[2026-09-08 12:00:01] [INFO] [GPU-Agent.Connection] Connected to central backend WebSocket.
[2026-09-08 12:00:01] [INFO] [GPU-Agent.Connection] Sending NODE_REGISTER for node-xxxx with 1 detected GPU(s)...
[2026-09-08 12:00:01] [INFO] [GPU-Agent.Connection] Node registered acknowledged by platform!
```

---

## 4. End-to-End Verification Checklist

Test each item below to verify the entire system is operating properly:

### Test 1: Real-Time Discovery on Dashboard
1. On Machine A or Machine B, open the browser at `http://172.25.134.9:3000`.
2. Notice the **Online Nodes** counter increases automatically.
3. The node **`LivingRoom-GPU-Rig`** appears with a green **ONLINE** badge.
4. Host specifications (OS, CPU cores, RAM) are displayed.
5. If Machine B has an NVIDIA GPU, its model name (e.g., *NVIDIA GeForce RTX 4080*), VRAM, and live core utilization progress bar are visible.

---

### Test 2: Safe Allowlisted Actions
Click **Inspect** on your remote node card to open the detail modal:

1. **Ping:**
   Click **Ping**. 
   - *Expected Result:* Returns instant `pong: true`, latency, and remote uptime.
2. **Refresh System Info:**
   Click **Sys Info**.
   - *Expected Result:* Returns up-to-date CPU load %, free RAM, and core count.
3. **Refresh GPU Status:**
   Click **GPU Status**.
   - *Expected Result:* Returns live temperature, power draw (W), and memory utilization directly from NVML.
4. **Change Availability:**
   - Click **Set Busy** -> The node status badge updates to yellow **BUSY**.
   - Click **Available** -> The badge updates back to green **ONLINE/AVAILABLE**.
5. **Run Built-in GPU Test:**
   Click **GPU Test**.
   - *Expected Result:* The agent safely runs an internal 5-second matrix compute benchmark, measures peak GPU temperature and utilization, and reports the results back with zero shell script execution.

---

### Test 3: Sandboxed Jupyter Notebook Workload
In the same modal, locate the **Sandboxed Workload (Predefined Jupyter)** section:

1. Click **Deploy Jupyter Notebook (Port 8888)**.
2. The agent automatically executes a pre-approved, sandboxed Docker container:
   - **If an NVIDIA GPU is present:** Runs with `--gpus all` passthrough.
   - **If no GPU is present:** Runs in standard CPU fallback mode.
3. The modal updates to **Container Running** with Container ID, Port, and Mode.
4. Click **Open Jupyter Notebook**.
   - *Expected Result:* A new browser tab opens directly into the Jupyter Lab/Notebook interface authenticated with a secure token!
5. Test inside a notebook cell:
   ```python
   import torch
   print("CUDA available:", torch.cuda.is_available())
   ```
6. Click **Stop Notebook** in the dashboard modal to terminate and clean up the container.

---

### Test 4: Network Disconnection & Offline Detection
1. On Machine B, press **`Ctrl + C`** to stop the agent.
2. Observe the dashboard:
   - Within seconds, the node status transitions to red **OFFLINE**.
   - The **Offline Nodes** counter increments.
   - The audit log records: `[DISCONNECT] Node marked OFFLINE`.

---

### Test 5: Reconnection & Persistent Node ID
1. On Machine B, start the agent again:
   ```powershell
   python main.py --server ws://172.25.134.9:4000 --name "LivingRoom-GPU-Rig"
   ```
2. Observe:
   - The console logs: `Loaded persistent Node ID from disk: node-xxxx...`
   - It re-uses the exact same identity from `data/node_id.json`.
   - On the dashboard, the node turns **ONLINE** immediately without creating a duplicate card.

---

### Test 6: Backend Server Outage & Exponential Backoff
1. On Machine A, stop the backend server.
2. On Machine B, observe the agent logs:
   - It does not crash.
   - It automatically logs: `Connection lost or unreachable. Reconnecting in 1.1s (backoff factor: 1.0s)...`
   - It retries using exponential backoff (2.0s, 4.0s, 8.0s...).
3. On Machine A, restart the backend server.
4. On Machine B, within seconds the agent automatically reconnects and resumes heartbeats with zero manual intervention.

---

## 5. Troubleshooting Common Network Issues

| Problem | Cause | Solution |
| :--- | :--- | :--- |
| `[WinError 1225] The remote computer refused network connection` | Agent attempted to connect to `localhost:4000` instead of Machine A's IP | Add `--server ws://172.25.134.9:4000` to your run command. |
| Cannot connect / Connection timeout | Wi-Fi router has "AP Isolation" or Linux firewall is blocking port 4000 | On Machine A, verify firewall: `sudo ufw allow 4000/tcp` and `sudo ufw allow 3000/tcp`. |
| Dashboard says "Reconnecting Stream..." | Dashboard loaded with wrong IP | Refresh `http://172.25.134.9:3000` in the browser; it automatically detects the server IP. |
| `Docker is not installed or daemon not running` | Docker Desktop is not started on Machine B | Start Docker Desktop on Machine B before clicking "Deploy Jupyter Notebook". |
| `nvidia-smi: command not found` | NVIDIA GPU drivers missing | Install latest drivers from [nvidia.com/drivers](https://www.nvidia.com/drivers). The agent will operate in CPU mode until installed. |

---

## 6. Quick Reference Commands

```bash
# Machine A: Start everything
cd "Node agent"
docker compose up -d
cd backend && npm run start:prod
cd frontend && npm run start

# Machine B: Run Agent
cd agent
python main.py --server ws://172.25.134.9:4000 --name "My-GPU-Node"
```
