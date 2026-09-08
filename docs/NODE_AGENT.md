# P2P GPU Platform — Node Agent Technical Specification (NODE_AGENT.md)

The **Python GPU Node Agent** is a dedicated background process designed to run on GPU provider host machines. It provides reliable hardware discovery, real-time telemetry streaming, persistent identity, resilient reconnection, and safe, bounded command execution.

---

## 1. Directory Structure

```text
agent/
├── config.py           # Configuration loader (JSON, ENV, CLI flags)
├── connection.py       # WebSocket client, reconnection backoff & command dispatch
├── gpu_monitor.py      # NVIDIA NVML & nvidia-smi telemetry collector (No Mock Data)
├── gpu_tester.py       # Safe predefined GPU workload benchmark
├── logger.py           # Structured console & file logging
├── main.py             # CLI parser & OS signal lifecycle orchestrator
├── node_identity.py    # Persistent node_id generator and disk storage
├── requirements.txt    # Python runtime dependencies
└── data/               # Persistent data storage (node_id.json, node_agent.log)
```

---

## 2. Agent Startup Lifecycle

1. **CLI & Environment Parsing:**
   The agent evaluates CLI arguments, environment variables, and `config.json` in order of precedence:
   - CLI flags > Environment Variables > `config.json` > Defaults.
2. **Logger Initialization:**
   Sets up dual-stream logging:
   - Console: Standard `INFO` level with timestamps.
   - File (`data/node_agent.log`): Granular `DEBUG` level with file/line tracing.
3. **Identity Verification & Persistence:**
   `node_identity.py` verifies whether `data/node_id.json` exists.
   - If present, the stored `node_id` is re-used.
   - If absent, a new UUID (`node-<uuid4>`) is generated and written atomically.
4. **Hardware Discovery:**
   The agent queries:
   - Host specs (`sys_info.py`): Hostname, OS platform/kernel, CPU model & cores, RAM total/used.
   - GPU hardware (`gpu_monitor.py`): Attempts `pynvml` initialization; falls back to `nvidia-smi`.
5. **WebSocket Outbound Connection:**
   Connects to the configured platform WebSocket URL (e.g. `ws://localhost:4000/`).
6. **Handshake & Registration:**
   Emits `NODE_REGISTER` payload containing node identity and hardware specs.
7. **Telemetry & Message Loops:**
   Concurrently runs `heartbeat_loop` (10s), `metrics_loop` (5s), and `incoming_message_loop`.
8. **Signal Handling:**
   Catches `SIGINT` (Ctrl+C) and `SIGTERM`, dispatches `AGENT_SHUTDOWN` event to backend, and terminates cleanly.

---

## 3. Persistent Node Identity

The node identity must remain invariant across process restarts and system reboots to avoid creating ghost or duplicate nodes on the central platform.

Storage format (`data/node_id.json`):
```json
{
  "node_id": "node-cf671cab-2578-428a-85c9-21ee84813325",
  "created_at": "2026-09-08T11:05:41Z"
}
```

The write operation uses a temporary file (`node_id.json.tmp`) and an atomic rename (`os.replace`) to prevent file corruption during sudden power losses.

---

## 4. GPU Telemetry & No-Mock-Data Policy

The agent interacts directly with NVIDIA drivers via two tiers:

### Tier 1: Direct NVML (`pynvml` / `nvidia-ml-py`)
NVML provides high-frequency, in-process C-level access to the NVIDIA Management Library:
- Core Utilization (%) via `nvmlDeviceGetUtilizationRates`
- Memory Controller Utilization (%)
- VRAM (Total, Used, Free MB) via `nvmlDeviceGetMemoryInfo`
- GPU Temperature (°C) via `nvmlDeviceGetTemperature`
- Current Power Draw (W) via `nvmlDeviceGetPowerUsage`
- Power Management Limit (W) via `nvmlDeviceGetPowerManagementLimit`
- Driver Version via `nvmlSystemGetDriverVersion`

### Tier 2: `nvidia-smi` Fallback
If NVML C-bindings fail (such as dynamic link mismatch or container sandbox issues), the agent invokes:
```bash
nvidia-smi --query-gpu=index,name,uuid,memory.total,memory.used,memory.free,utilization.gpu,utilization.memory,temperature.gpu,power.draw,power.limit,driver_version --format=csv,noheader,nounits
```
The agent parses the CSV stream and maps it to the identical telemetry schema.

### Absence of NVIDIA Hardware
If neither NVML nor `nvidia-smi` reports any devices, the agent strictly returns an empty list `[]` and logs:
```text
No NVIDIA GPU detected on this host. Agent operating in GPU-idle mode.
```
**Zero Mock Policy:** Under no circumstances does the agent manufacture fictitious GPU hardware names (e.g. "RTX 4090") when hardware is not present.

---

## 5. Reconnection & Backoff Architecture

To withstand unstable networks, ISP resets, or backend restarts:
- **Base delay:** 1.0 second
- **Multiplier:** 2.0x
- **Max delay:** 60.0 seconds
- **Jitter:** Random float between 0.8 and 1.2

```text
Attempt 1: 1.0s ± 20% (~0.8s - 1.2s)
Attempt 2: 2.0s ± 20% (~1.6s - 2.4s)
Attempt 3: 4.0s ± 20% (~3.2s - 4.8s)
Attempt 4: 8.0s ± 20% (~6.4s - 9.6s)
Attempt 5: 16.0s ± 20% (~12.8s - 19.2s)
Attempt 6: 32.0s ± 20% (~25.6s - 38.4s)
Attempt 7+: 60.0s (capped)
```
Upon establishing a successful WebSocket connection, the backoff delay immediately resets to 1.0s.

---

## 6. Safe Predefined Commands Allowlist

The agent enforces a strict security perimeter. Only five predefined commands are recognized:

| Command | Description | Return Payload |
| :--- | :--- | :--- |
| `PING` | Health check & latency test | `pong: true`, `uptime_seconds`, `availability` |
| `GET_SYSTEM_INFO` | Refreshes host CPU/RAM/OS telemetry | Full system hardware object |
| `GET_GPU_STATUS` | Queries instantaneous GPU sensor snapshot | List of detected GPU telemetry objects |
| `SET_NODE_AVAILABILITY` | Sets node availability (`AVAILABLE` / `BUSY`) | Updated availability state |
| `RUN_GPU_TEST` | Executes internal bounded compute workload | Duration, peak util, peak temp, peak VRAM |

### Security Rejection of Arbitrary Commands
Any unlisted command (e.g. `EXEC_SHELL`, `RUN_SCRIPT`, `BASH`, `REBOOT`) is immediately rejected:
```json
{
  "type": "COMMAND_RESULT",
  "payload": {
    "commandId": "...",
    "node_id": "...",
    "command": "EXEC_SHELL",
    "status": "ERROR",
    "error": "Command 'EXEC_SHELL' is forbidden or unknown."
  }
}
```
The agent logs a security violation warning and does NOT spawn any processes.

---

## 7. Safe Built-In GPU Workload Test (`RUN_GPU_TEST`)

- **Concurrency Guard:** Rejects execution if `is_busy()` is True.
- **Hardware Check:** If no NVIDIA GPU is detected, returns `status: "FAILED"`.
- **Bounded Duration:** Enforced execution ceiling (between 1s and 30s).
- **Execution Routine:** Uses PyTorch CUDA tensor multiplication if installed; otherwise runs a bounded math loop while continuously sampling GPU hardware sensors.
- **Non-blocking Execution:** Runs inside Python's `asyncio` thread pool executor (`run_in_executor`) to prevent blocking the WebSocket ping/pong and heartbeat coroutines.
- **Telemetry Collection:** Returns initial temperature, peak temperature, final temperature, peak core utilization, peak VRAM, and completed iterations.
