import os
import json
from dataclasses import dataclass
from typing import Optional

@dataclass
class AgentConfig:
    server_url: str = "ws://localhost:4000"
    node_name: Optional[str] = None
    heartbeat_interval: int = 10  # seconds
    metrics_interval: int = 5      # seconds
    data_dir: str = "data"
    offline_timeout: int = 30     # seconds

    @classmethod
    def load(cls, config_path: Optional[str] = None, **overrides) -> "AgentConfig":
        config = cls()

        # Check default config locations
        search_paths = [config_path] if config_path else ["config.json", "agent_config.json"]

        for path in search_paths:
            if path and os.path.isfile(path):
                try:
                    with open(path, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    if "server_url" in data:
                        config.server_url = data["server_url"]
                    if "node_name" in data:
                        config.node_name = data["node_name"]
                    if "heartbeat_interval" in data:
                        config.heartbeat_interval = int(data["heartbeat_interval"])
                    if "metrics_interval" in data:
                        config.metrics_interval = int(data["metrics_interval"])
                    if "data_dir" in data:
                        config.data_dir = data["data_dir"]
                    break
                except Exception as e:
                    print(f"Warning: Failed to parse config file {path}: {e}")

        # Environment variables override file config
        if os.environ.get("P2P_GPU_SERVER_URL"):
            config.server_url = os.environ["P2P_GPU_SERVER_URL"]
        if os.environ.get("P2P_GPU_NODE_NAME"):
            config.node_name = os.environ["P2P_GPU_NODE_NAME"]
        if os.environ.get("P2P_GPU_HEARTBEAT_INTERVAL"):
            config.heartbeat_interval = int(os.environ["P2P_GPU_HEARTBEAT_INTERVAL"])
        if os.environ.get("P2P_GPU_METRICS_INTERVAL"):
            config.metrics_interval = int(os.environ["P2P_GPU_METRICS_INTERVAL"])
        if os.environ.get("P2P_GPU_DATA_DIR"):
            config.data_dir = os.environ["P2P_GPU_DATA_DIR"]

        # Explicit CLI overrides have highest precedence
        for key, value in overrides.items():
            if value is not None and hasattr(config, key):
                setattr(config, key, value)

        return config
