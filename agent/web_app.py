import http.server
import socketserver
import json
import webbrowser
import threading
import sys
import os
from urllib.parse import urlparse

from app_controller import AgentController

controller = AgentController()

HTML_PAGE = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>P2P GPU Node Agent — App</title>
  <style>
    :root {
      --bg: #0d1117;
      --panel: #161b22;
      --border: #30363d;
      --text: #f0f6fc;
      --muted: #8b949e;
      --emerald: #10b981;
      --rose: #f43f5e;
      --amber: #f59e0b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      padding: 24px;
      display: flex;
      justify-content: center;
    }
    .container {
      width: 100%;
      max-width: 680px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .card {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 18px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .title { font-size: 18px; font-weight: 700; color: var(--text); }
    .subtitle { font-size: 12px; color: var(--muted); margin-top: 2px; }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 600;
    }
    .badge-connected { background: rgba(16, 185, 129, 0.15); color: var(--emerald); border: 1px solid var(--emerald); }
    .badge-stopped { background: rgba(244, 63, 94, 0.15); color: var(--rose); border: 1px solid var(--rose); }
    .badge-connecting { background: rgba(245, 158, 11, 0.15); color: var(--amber); border: 1px solid var(--amber); }
    .pulse {
      width: 8px; height: 8px; border-radius: 50%;
      background: currentColor;
    }
    .form-group { margin-top: 12px; }
    label { display: block; font-size: 12px; color: var(--muted); margin-bottom: 4px; font-weight: 500; }
    input {
      width: 100%;
      padding: 10px 12px;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text);
      font-family: monospace;
      font-size: 13px;
      outline: none;
      transition: border-color 0.2s;
    }
    input:focus { border-color: var(--emerald); }
    input:disabled { opacity: 0.6; cursor: not-allowed; }
    .btn-row { display: flex; gap: 12px; margin-top: 14px; }
    button {
      flex: 1;
      padding: 12px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 700;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: opacity 0.2s, transform 0.1s;
    }
    button:active { transform: scale(0.98); }
    button:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
    .btn-start { background: var(--emerald); color: #fff; }
    .btn-stop { background: var(--rose); color: #fff; }
    .hw-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; font-size: 12px; }
    .hw-item { background: var(--bg); padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border); }
    .hw-label { color: var(--muted); font-size: 11px; }
    .hw-val { color: var(--text); font-weight: 600; margin-top: 2px; }
    .logs-box {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px;
      font-family: monospace;
      font-size: 11px;
      height: 220px;
      overflow-y: auto;
      white-space: pre-wrap;
      color: #c9d1d9;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header Card -->
    <div class="card">
      <div class="header">
        <div>
          <div class="title">⚡ P2P GPU Node Agent</div>
          <div class="subtitle">Secure Outbound GPU Telemetry & Workload Client</div>
        </div>
        <div id="statusBadge" class="badge badge-stopped">
          <span class="pulse"></span>
          <span id="statusText">STOPPED</span>
        </div>
      </div>
    </div>

    <!-- Configuration Card -->
    <div class="card">
      <div style="font-size: 14px; font-weight: 600; margin-bottom: 8px;">Agent Settings</div>
      
      <div class="form-group">
        <label>Central Server Address (IP or WebSocket URL):</label>
        <input type="text" id="serverUrl" placeholder="e.g. 172.25.134.9:4000 or ws://172.25.134.9:4000">
      </div>

      <div class="form-group">
        <label>Node Display Name:</label>
        <input type="text" id="nodeName" placeholder="e.g. My-GPU-Rig">
      </div>

      <div class="btn-row">
        <button id="startBtn" class="btn-start" onclick="startAgent()">▶ START AGENT</button>
        <button id="stopBtn" class="btn-stop" onclick="stopAgent()" disabled>⏹ STOP AGENT</button>
      </div>
    </div>

    <!-- Hardware Information Card -->
    <div class="card">
      <div style="font-size: 14px; font-weight: 600;">Hardware Telemetry</div>
      <div class="hw-grid">
        <div class="hw-item" style="grid-column: span 2;">
          <div class="hw-label">NVIDIA GPU Adapter</div>
          <div class="hw-val" id="gpuInfo" style="color: var(--emerald);">Scanning...</div>
        </div>
        <div class="hw-item">
          <div class="hw-label">Host CPU</div>
          <div class="hw-val" id="cpuInfo">--</div>
        </div>
        <div class="hw-item">
          <div class="hw-label">System RAM</div>
          <div class="hw-val" id="ramInfo">--</div>
        </div>
        <div class="hw-item" style="grid-column: span 2;">
          <div class="hw-label">Persistent Node ID</div>
          <div class="hw-val" id="nodeId" style="font-family: monospace; font-size: 11px;">--</div>
        </div>
      </div>
    </div>

    <!-- Logs Card -->
    <div class="card">
      <div style="font-size: 14px; font-weight: 600; margin-bottom: 8px;">Activity Log</div>
      <div id="logsBox" class="logs-box">Waiting for agent activity...</div>
    </div>
  </div>

  <script>
    let isConnected = false;

    async function pollState() {
      try {
        const res = await fetch('/api/state');
        if (!res.ok) return;
        const data = await res.json();
        updateUI(data);
      } catch (e) {
        console.error("Poll error:", e);
      }
    }

    function updateUI(data) {
      const statusBadge = document.getElementById('statusBadge');
      const statusText = document.getElementById('statusText');
      const startBtn = document.getElementById('startBtn');
      const stopBtn = document.getElementById('stopBtn');
      const serverUrlInput = document.getElementById('serverUrl');
      const nodeNameInput = document.getElementById('nodeName');

      if (!serverUrlInput.value && data.server_url) {
        serverUrlInput.value = data.server_url;
      }
      if (!nodeNameInput.value && data.node_name) {
        nodeNameInput.value = data.node_name;
      }

      const status = data.status || 'STOPPED';
      statusText.innerText = status;

      if (status === 'CONNECTED') {
        statusBadge.className = 'badge badge-connected';
        startBtn.disabled = true;
        stopBtn.disabled = false;
        serverUrlInput.disabled = true;
        nodeNameInput.disabled = true;
      } else if (status === 'CONNECTING' || status === 'RECONNECTING') {
        statusBadge.className = 'badge badge-connecting';
        startBtn.disabled = true;
        stopBtn.disabled = false;
      } else {
        statusBadge.className = 'badge badge-stopped';
        startBtn.disabled = false;
        stopBtn.disabled = true;
        serverUrlInput.disabled = false;
        nodeNameInput.disabled = false;
      }

      // Hardware Info
      const hw = data.hardware || {};
      const gpus = hw.gpus || [];
      if (gpus.length > 0) {
        document.getElementById('gpuInfo').innerText = `${gpus[0].gpu_name} (${gpus[0].total_memory} MB VRAM)`;
      } else {
        document.getElementById('gpuInfo').innerText = "No NVIDIA GPU (CPU-Only Mode)";
      }

      const sys = hw.sys_info || {};
      document.getElementById('cpuInfo').innerText = sys.cpu || '--';
      document.getElementById('ramInfo').innerText = sys.ram || '--';
      document.getElementById('nodeId').innerText = data.node_id || '--';

      // Logs
      const logs = data.logs || [];
      const logsBox = document.getElementById('logsBox');
      if (logs.length > 0) {
        const text = logs.map(l => `[${l.timestamp}] ${l.message}`).join('\\n');
        logsBox.innerText = text;
        logsBox.scrollTop = logsBox.scrollHeight;
      }
    }

    async function startAgent() {
      const serverUrl = document.getElementById('serverUrl').value.trim();
      const nodeName = document.getElementById('nodeName').value.trim();
      if (!serverUrl) {
        alert("Please enter the server address!");
        return;
      }

      document.getElementById('startBtn').disabled = true;
      try {
        await fetch('/api/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ server_url: serverUrl, node_name: nodeName })
        });
        pollState();
      } catch (e) {
        alert("Error starting agent: " + e.message);
      }
    }

    async function stopAgent() {
      document.getElementById('stopBtn').disabled = true;
      try {
        await fetch('/api/stop', { method: 'POST' });
        pollState();
      } catch (e) {
        alert("Error stopping agent: " + e.message);
      }
    }

    // Initial load and polling every 1000ms
    pollState();
    setInterval(pollState, 1000);
  </script>
</body>
</html>
"""

class AgentAppRequestHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Silence default HTTP server console noise
        return

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/" or parsed.path == "/index.html":
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(HTML_PAGE.encode("utf-8"))
        elif parsed.path == "/api/state":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            state = controller.get_state()
            self.wfile.write(json.dumps(state).encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        parsed = urlparse(self.path)
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"
        try:
            payload = json.loads(body)
        except Exception:
            payload = {}

        if parsed.path == "/api/start":
            url = payload.get("server_url", "")
            name = payload.get("node_name", "")
            res = controller.start_agent(url, name)
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(res).encode("utf-8"))

        elif parsed.path == "/api/stop":
            res = controller.stop_agent()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(res).encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()

def run_web_app(port: int = 5050, open_browser: bool = True):
    socketserver.TCPServer.allow_reuse_address = True
    server = socketserver.TCPServer(("127.0.0.1", port), AgentAppRequestHandler)
    app_url = f"http://localhost:{port}"

    print("==================================================")
    print("   P2P GPU Node Agent — Application Control")
    print(f"   Opening Control Panel at: {app_url}")
    print("==================================================")

    if open_browser:
        threading.Timer(0.8, lambda: webbrowser.open(app_url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        if controller.is_running():
            controller.stop_agent()
        server.server_close()
        print("\nAgent application closed.")

if __name__ == "__main__":
    run_web_app()
