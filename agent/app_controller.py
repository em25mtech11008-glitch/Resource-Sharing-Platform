import asyncio
import threading
import time
import logging
from typing import Dict, Any, List, Optional
from collections import deque

from config import AgentConfig
from node_identity import get_or_create_node_id
from sys_info import get_system_info
from gpu_monitor import get_gpu_telemetry
from connection import AgentConnection

logger = logging.getLogger("GPU-Agent.Controller")

class LogCaptureHandler(logging.Handler):
    """Custom log handler that buffers recent log entries for the GUI/Web UI."""
    def __init__(self, max_entries: int = 100):
        super().__init__()
        self.logs = deque(maxlen=max_entries)

    def emit(self, record):
        try:
            msg = self.format(record)
            self.logs.append({
                "timestamp": time.strftime("%H:%M:%S", time.localtime(record.created)),
                "level": record.levelname,
                "message": msg,
            })
        except Exception:
            pass

class AgentController:
    """Manages background agent execution, lifecycle control, and telemetry tracking."""

    def __init__(self, data_dir: str = "data"):
        self.data_dir = data_dir
        self.config = AgentConfig.load(data_dir=data_dir)
        self.node_id, _ = get_or_create_node_id(data_dir)

        self.status = "STOPPED"  # STOPPED, CONNECTING, CONNECTED, RECONNECTING
        self.error_message: Optional[str] = None
        self.agent: Optional[AgentConnection] = None
        self.thread: Optional[threading.Thread] = None
        self.loop: Optional[asyncio.AbstractEventLoop] = None

        # Setup in-memory log capture
        self.log_handler = LogCaptureHandler(max_entries=150)
        self.log_handler.setFormatter(logging.Formatter("%(message)s"))
        root_logger = logging.getLogger("GPU-Agent")
        root_logger.addHandler(self.log_handler)

    def normalize_server_url(self, raw_url: str) -> str:
        """Standardizes user input into a valid WebSocket URL."""
        raw = raw_url.strip()
        if not raw:
            return "ws://localhost:4000"
        if raw.startswith("http://"):
            raw = "ws://" + raw[7:]
        elif raw.startswith("https://"):
            raw = "wss://" + raw[8:]
        elif not raw.startswith("ws://") and not raw.startswith("wss://"):
            raw = f"ws://{raw}"
        return raw

    def get_hardware_info(self) -> Dict[str, Any]:
        """Queries host and GPU hardware specs."""
        return {
            "node_id": self.node_id,
            "sys_info": get_system_info(),
            "gpus": get_gpu_telemetry(),
        }

    def start_agent(self, server_url: str, node_name: str) -> Dict[str, Any]:
        """Starts the Node Agent in a background thread."""
        if self.is_running():
            return {"success": False, "message": "Agent is already running."}

        clean_url = self.normalize_server_url(server_url)
        clean_name = node_name.strip() or f"Node-{self.node_id[-6:]}"

        # Update and persist config
        self.config.server_url = clean_url
        self.config.node_name = clean_name
        self._save_config()

        self.status = "CONNECTING"
        self.error_message = None

        # Launch background execution thread
        self.thread = threading.Thread(target=self._run_event_loop, daemon=True)
        self.thread.start()

        logger.info(f"Agent control started for '{clean_name}' pointing to {clean_url}")
        return {"success": True, "status": self.status, "server_url": clean_url, "node_name": clean_name}

    def stop_agent(self) -> Dict[str, Any]:
        """Gracefully stops the background agent."""
        if not self.is_running():
            self.status = "STOPPED"
            return {"success": True, "message": "Agent is not running."}

        logger.info("Stopping agent via application control...")
        self.status = "STOPPING"

        if self.agent and self.loop:
            # Schedule graceful stop on agent's event loop
            asyncio.run_coroutine_threadsafe(self.agent.stop(), self.loop)

        # Wait briefly for thread completion
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=2.0)

        self.status = "STOPPED"
        self.agent = None
        self.thread = None
        self.loop = None

        logger.info("Agent stopped.")
        return {"success": True, "status": self.status}

    def is_running(self) -> bool:
        return self.thread is not None and self.thread.is_alive() and self.status != "STOPPED"

    def get_state(self) -> Dict[str, Any]:
        """Returns instantaneous agent state, hardware, and recent logs."""
        # Derive live status from connection object if available
        if self.is_running() and self.agent:
            if getattr(self.agent, "_connected", False):
                self.status = "CONNECTED"
            else:
                self.status = "RECONNECTING"
        elif not self.is_running():
            self.status = "STOPPED"

        return {
            "status": self.status,
            "isRunning": self.is_running(),
            "server_url": self.config.server_url,
            "node_name": self.config.node_name or f"Node-{self.node_id[-6:]}",
            "node_id": self.node_id,
            "hardware": self.get_hardware_info(),
            "logs": list(self.log_handler.logs),
            "error": self.error_message,
        }

    def _run_event_loop(self):
        """Worker thread entry point executing asyncio event loop."""
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)

        try:
            self.agent = AgentConnection(self.node_id, self.config)
            self.loop.run_until_complete(self.agent.start())
        except Exception as e:
            logger.error(f"Agent error in background thread: {e}")
            self.error_message = str(e)
            self.status = "ERROR"
        finally:
            self.status = "STOPPED"
            try:
                self.loop.close()
            except Exception:
                pass

    def _save_config(self):
        """Persists current configuration to disk."""
        import json
        import os
        os.makedirs(self.data_dir, exist_ok=True)
        config_path = os.path.join(self.data_dir, "config.json")
        try:
            with open(config_path, "w", encoding="utf-8") as f:
                json.dump({
                    "server_url": self.config.server_url,
                    "node_name": self.config.node_name,
                    "heartbeat_interval": self.config.heartbeat_interval,
                    "metrics_interval": self.config.metrics_interval,
                }, f, indent=2)
        except Exception as e:
            logger.warning(f"Failed to persist config: {e}")
