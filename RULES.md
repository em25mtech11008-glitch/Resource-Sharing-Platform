# P2P GPU Platform — Engineering Rules & Operational Boundaries (RULES.md)

This document establishes the mandatory architectural rules, security boundaries, and engineering practices for the P2P GPU Platform MVP. Every component (Node Agent, Backend Server, Web Dashboard, and Database) must comply with these rules.

---

## 1. Core Principles

1. **Node Agent Reliability is Highest Priority**
   - The Python Node Agent runs on third-party computers and must be resilient against crashes, network drops, server reboots, and missing drivers.
   - Do not sacrifice agent stability or error resilience for UI features.

2. **Outbound Connections Only**
   - The Node Agent MUST initiate outbound connections to the central backend via persistent WebSocket.
   - GPU host machines MUST NOT require inbound open ports, public IP addresses, port forwarding, SSH, or remote desktop protocols (RDP/VNC).

3. **No Arbitrary Command Execution (Zero Remote Code Execution)**
   - NEVER implement or allow arbitrary shell commands (`bash`, `sh`, `cmd`, `powershell`).
   - NEVER implement remote terminal/PTY streaming.
   - NEVER implement `eval()`, `exec()`, or dynamic code compilation from server messages.
   - NEVER expose unrestricted filesystem access or process spawning to remote commands.
   - Every command dispatched to an agent MUST be strictly allowlisted and validated.

4. **Strict Command Allowlist**
   Only the following commands are recognized and processed by the Node Agent:
   - `PING`
   - `GET_SYSTEM_INFO`
   - `GET_GPU_STATUS`
   - `SET_NODE_AVAILABILITY`
   - `RUN_GPU_TEST`
   Any unrecognized or malformed command MUST be rejected immediately with an error response and logged locally.

5. **Safe GPU Testing**
   - `RUN_GPU_TEST` must execute only a predefined, hardcoded internal workload.
   - The backend server must never transmit code, scripts, or binaries to be run as part of a test.
   - The test must verify GPU availability (reject if already `BUSY`), run for a bounded duration, gather telemetry (utilization, VRAM, temperature), and return structured results.

6. **Persistent Node Identity**
   - Each agent must generate a unique `node_id` on initial launch and persist it to durable storage (e.g., `node_id.json`).
   - The same `node_id` must be reloaded and reused across restarts.
   - The backend must perform upserts on `node_id` to prevent duplicate node records when an agent reconnects.

7. **Actual Hardware Telemetry (No Mock Data)**
   - Do not use mock or fabricated GPU data.
   - Query actual NVIDIA hardware via NVML (`pynvml` / `nvidia-ml-py`) with fallback to `nvidia-smi`.
   - If no NVIDIA GPU or driver is present on the host, report 0 GPUs accurately and log the absence of hardware.
   - Support systems with multiple NVIDIA GPUs.

8. **Resilient Reconnection with Exponential Backoff**
   - In case of network disconnection or backend downtime, the agent must not crash.
   - It must automatically attempt reconnection using exponential backoff with jitter (e.g., 1s, 2s, 4s, 8s, up to 60s max).
   - When the backend recovers, the agent must seamlessly re-register and resume telemetry streams.

9. **Deterministic Heartbeats & Offline Detection**
   - The agent sends heartbeats at a regular interval (default: 10 seconds).
   - The agent streams GPU metrics at a regular interval (default: 5 seconds).
   - The backend actively detects offline nodes via a sweep interval if `last_seen > timeout` (default: ~30 seconds) or when a WebSocket connection drops.

10. **Structured Logging & Event Auditing**
    - All connection lifecycle events, commands received, commands executed, and errors must be logged with timestamps.
    - Security-relevant events (e.g., unknown command attempts, validation failures) must be recorded in the database `NODE_EVENTS` audit table.

11. **Keep Frontend Simple and Focused**
    - The dashboard is an operational monitoring and control tool, not a complex marketplace UI.
    - Focus on clear real-time status indicators, node health, GPU telemetry, and safe action buttons.

12. **Synchronized Documentation**
    - Code and documentation must be kept in sync.
    - Any changes to protocol messages, schemas, or behaviors must be updated in `docs/` and `SKILL.md`.
    - Do not claim features are implemented unless they have been built and verified.
