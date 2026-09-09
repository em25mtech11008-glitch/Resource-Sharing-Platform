# P2P GPU Platform — GPU Owner's User Manual (USER_MANUAL.md)

Welcome to the **P2P GPU Platform Node Agent**. This manual is written for GPU owners (providers) who want to connect their NVIDIA GPU computer to the platform. No advanced Linux or network engineering background is required.

---

## 1. What the Node Agent Does

The Node Agent is a lightweight Python program that runs in the background on your computer:
1. **Discovers your NVIDIA GPU hardware** (model name, VRAM, temperature, power, driver version).
2. **Establishes a secure, outbound connection** to the central platform server.
3. **Periodically sends GPU metrics and heartbeats** so the platform knows your GPU is available and healthy.
4. **Receives and executes safe commands** (like health checks, availability updates, and built-in benchmark tests).

### Security Guarantee for GPU Owners
- **No Inbound Ports Needed:** You do NOT need a public IP, static IP, or port forwarding. Your home router and firewall stay completely closed to inbound traffic.
- **No SSH or Remote Desktop Required:** The central platform never connects directly into your machine via SSH, VNC, or RDP.
- **Zero Remote Code Execution:** The agent CANNOT run arbitrary terminal commands, scripts, or programs. Only a fixed, built-in allowlist of safe commands is supported.

---

## 2. Prerequisites

1. **Computer with NVIDIA GPU** (GeForce RTX, GTX, Quadro, Tesla, A100, H100, etc.).
2. **NVIDIA Display Drivers** installed (verify by opening terminal/command prompt and typing `nvidia-smi`).
3. **Python 3.10 or higher** installed.

---

## 3. Installation Guide

### Step 1: Download or Clone the Agent Folder
Extract or clone the repository to your computer:
```bash
git clone <repo-url>
cd "Node agent/agent"
```

### Step 2: Install Python Dependencies
Install the required lightweight libraries using `pip`:
```bash
pip install -r requirements.txt
```
*(On Linux/macOS, if prompted about system packages, use `pip install -r requirements.txt --user` or `pip install -r requirements.txt --break-system-packages`)*.

---

## 4. Configuring the Agent

The agent is pre-configured to connect locally (`ws://localhost:4000`), but you can easily point it to a remote platform server.

### Option A: Graphical Desktop Application (Easiest & Recommended)
- **On Windows:** Simply double-click **`Run-Agent-App.bat`** in the `agent` folder.
- **On Linux:** Double-click or run **`./run-agent-app.sh`** (or `python3 app.py`).

The application window will open:
1. Enter your Central Platform Address (e.g. `172.25.134.9:4000`).
2. Enter your Node Nickname (e.g. `My-Gaming-Rig`).
3. Click **▶ START AGENT**.
4. The status turns green (**🟢 CONNECTED**), and your GPU hardware stats and live logs will stream right inside the app!
5. Click **⏹ STOP AGENT** whenever you wish to pause or disconnect.

---

### Option B: Command-Line Flags (CLI Mode)
If you prefer running in the terminal without a GUI:
```bash
python main.py --server ws://your-server-ip:4000 --name "LivingRoom-RTX4090"
```

---

### Option C: Standalone Executable (.exe)
To package the agent into a single executable file that requires no manual Python installation:
```bash
python build_exe.py
```
This generates **`dist/GPUNodeAgent.exe`** on Windows (or `dist/GPUNodeAgent` on Linux). Anyone can simply double-click the `.exe` file to open the app!

---

## 5. Starting the Agent & Verifying Status

Run the agent:
```bash
python3 main.py
```

### Expected Startup Output:
```text
[2026-09-08 11:08:54] [INFO] [GPU-Agent] Starting P2P GPU Node Agent...
[2026-09-08 11:08:54] [INFO] [GPU-Agent] Target Platform URL: ws://your-server-ip:4000
[2026-09-08 11:08:54] [INFO] [GPU-Agent.Identity] Loaded persistent Node ID: node-cf671cab-...
[2026-09-08 11:08:55] [INFO] [GPU-Agent.Connection] Connected to central backend WebSocket.
[2026-09-08 11:08:55] [INFO] [GPU-Agent.Connection] Sending NODE_REGISTER with 1 detected GPU(s)...
[2026-09-08 11:08:55] [INFO] [GPU-Agent.Connection] Node registered acknowledged by platform!
```

### How to Confirm Your GPU is Online:
1. Open the Web Dashboard at `http://localhost:3000` (or the central server's URL).
2. Look for your node name or Node ID in the **Connected GPU Nodes** section.
3. You will see an **ONLINE** green badge, your GPU model name, current core utilization, VRAM usage, and temperature.
4. Click **Inspect** to see live hardware gauges.

---

## 6. What Happens During Network Failures or Restarts?

- **Network Drops:** If your internet connection drops or WiFi glitches, the agent automatically retries connecting using an exponential backoff schedule (1s, 2s, 4s, 8s, up to 60s max). You do not need to restart the agent manually.
- **Server Restarts:** If the central platform server restarts or updates, your agent will wait and reconnect automatically once the server is back online.
- **Machine Restarts:** Your Node ID is stored securely in `data/node_id.json`. When you reboot your computer and restart the agent, the platform recognizes it as the exact same node without duplicating records.

---

## 7. How to Stop the Agent

To stop the agent cleanly, press:
```text
Ctrl + C
```
The agent catches the interrupt signal, notifies the central platform that it is going offline, closes the connection cleanly, and shuts down within 1 second.

---

## 8. Common Questions & Troubleshooting

| Problem | Cause | Solution |
| :--- | :--- | :--- |
| `nvidia-smi: command not found` | NVIDIA drivers not installed or not in PATH | Install standard NVIDIA drivers from [nvidia.com/drivers](https://www.nvidia.com/drivers). |
| `Connection refused` | Central backend is not running or wrong IP | Verify server IP address and make sure backend is listening on port 4000. |
| Dashboard shows "None detected (CPU-only)" | Machine does not have an NVIDIA GPU or driver is corrupted | Reinstall NVIDIA drivers or check with `nvidia-smi`. The agent will operate in CPU-only mode. |
| Node marked OFFLINE on dashboard | No heartbeat received in >30 seconds | Verify agent process is still running and host computer has internet access. |
