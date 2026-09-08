import asyncio
import json
import random
import time
import logging
from typing import Optional, Dict, Any

import websockets
from websockets.exceptions import ConnectionClosed

from config import AgentConfig
from sys_info import get_system_info
from gpu_monitor import get_gpu_telemetry
from gpu_tester import GpuTester
from container_runner import ContainerRunner

logger = logging.getLogger("GPU-Agent.Connection")

# Predefined safe commands allowlist
SAFE_COMMANDS = {
    "PING",
    "GET_SYSTEM_INFO",
    "GET_GPU_STATUS",
    "SET_NODE_AVAILABILITY",
    "RUN_GPU_TEST",
    "START_JUPYTER_CONTAINER",
    "STOP_JUPYTER_CONTAINER",
    "GET_CONTAINER_STATUS",
}

class AgentConnection:
    def __init__(self, node_id: str, config: AgentConfig):
        self.node_id = node_id
        self.config = config
        self.gpu_tester = GpuTester()
        self.container_runner = ContainerRunner(node_id)
        self.start_time = time.time()
        self.availability = "AVAILABLE"

        self._running = True
        self._ws: Optional[websockets.WebSocketClientProtocol] = None
        self._connected = False

    async def start(self):
        """Main connection loop with exponential backoff."""
        base_delay = 1.0
        factor = 2.0
        max_delay = 60.0
        current_delay = base_delay

        logger.info(f"Connecting to central platform at {self.config.server_url}...")

        while self._running:
            try:
                # Format WebSocket endpoint
                ws_url = self.config.server_url
                if not ws_url.endswith("/"):
                    ws_url = f"{ws_url}/"

                async with websockets.connect(
                    ws_url,
                    ping_interval=20,
                    ping_timeout=20,
                    close_timeout=5,
                ) as ws:
                    self._ws = ws
                    self._connected = True
                    current_delay = base_delay  # Reset backoff upon successful connection
                    logger.info("Connected to central backend WebSocket.")

                    # Handshake: Register Node
                    await self._send_registration()

                    # Run background loops concurrently
                    await asyncio.gather(
                        self._heartbeat_loop(),
                        self._metrics_loop(),
                        self._incoming_message_loop(),
                    )

            except (ConnectionClosed, ConnectionRefusedError, OSError) as e:
                self._connected = False
                self._ws = None
                if self._running:
                    # Calculate jittered exponential backoff
                    jitter = random.uniform(0.8, 1.2)
                    sleep_time = min(current_delay * jitter, max_delay)
                    logger.warning(
                        f"Connection lost or unreachable ({e}). Reconnecting in {sleep_time:.1f}s (backoff factor: {current_delay:.1f}s)..."
                    )
                    await asyncio.sleep(sleep_time)
                    current_delay = min(current_delay * factor, max_delay)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Unexpected connection error: {e}", exc_info=True)
                await asyncio.sleep(3.0)

    async def stop(self):
        """Stops the agent and closes WebSocket connection gracefully."""
        self._running = False
        if self._ws and self._connected:
            try:
                # Notify server of clean departure
                await self._send_json({
                    "type": "NODE_EVENT",
                    "payload": {
                        "node_id": self.node_id,
                        "event_type": "AGENT_SHUTDOWN",
                        "message": "Node agent shutting down gracefully (SIGINT/SIGTERM received)",
                    }
                })
                await self._ws.close()
            except Exception:
                pass
        self._connected = False

    async def _send_json(self, data: Dict[str, Any]):
        """Helper to send JSON safely over the WebSocket."""
        if self._ws and self._connected:
            await self._ws.send(json.dumps(data))

    async def _send_registration(self):
        """Collects initial system information and registers with the backend."""
        sys_info = get_system_info()
        gpus = get_gpu_telemetry()

        registration_packet = {
            "type": "NODE_REGISTER",
            "payload": {
                "node_id": self.node_id,
                "node_name": self.config.node_name or f"Node-{self.node_id[-6:]}",
                "hostname": sys_info.get("hostname", "unknown"),
                "os": sys_info.get("os", "unknown"),
                "cpu": sys_info.get("cpu", "unknown"),
                "ram": sys_info.get("ram", "unknown"),
                "gpus": [
                    {
                        "gpu_index": g["gpu_index"],
                        "gpu_uuid": g["gpu_uuid"],
                        "gpu_name": g["gpu_name"],
                        "total_memory": g["total_memory"],
                        "driver_version": g.get("driver_version", "N/A"),
                    }
                    for g in gpus
                ],
            },
        }

        logger.info(
            f"Sending NODE_REGISTER for {self.node_id} with {len(gpus)} detected GPU(s)..."
        )
        await self._send_json(registration_packet)

    async def _heartbeat_loop(self):
        """Sends periodic heartbeats to maintain active status and detect broken connections."""
        while self._running and self._connected:
            await asyncio.sleep(self.config.heartbeat_interval)
            try:
                heartbeat_packet = {
                    "type": "HEARTBEAT",
                    "payload": {
                        "node_id": self.node_id,
                        "timestamp": time.time(),
                        "uptime_seconds": round(time.time() - self.start_time, 1),
                        "availability": self.availability,
                    },
                }
                await self._send_json(heartbeat_packet)
                logger.debug("Heartbeat sent.")
            except Exception as e:
                logger.warning(f"Error sending heartbeat: {e}")
                break

    async def _metrics_loop(self):
        """Sends periodic GPU telemetry to the backend."""
        while self._running and self._connected:
            await asyncio.sleep(self.config.metrics_interval)
            try:
                gpus = get_gpu_telemetry()
                status_packet = {
                    "type": "GPU_STATUS",
                    "payload": {
                        "node_id": self.node_id,
                        "timestamp": time.time(),
                        "gpus": gpus,
                    },
                }
                await self._send_json(status_packet)
                logger.debug(f"GPU metrics sent for {len(gpus)} GPU(s).")
            except Exception as e:
                logger.warning(f"Error sending GPU metrics: {e}")
                break

    async def _incoming_message_loop(self):
        """Listens for and validates incoming messages and commands from the server."""
        while self._running and self._connected:
            try:
                raw_msg = await self._ws.recv()
                data = json.loads(raw_msg)
                msg_type = data.get("type")

                if msg_type == "COMMAND":
                    await self._handle_command(data)
                elif msg_type == "NODE_REGISTER_ACK":
                    logger.info(f"Node registered acknowledged by platform: {data.get('payload')}")
                elif msg_type == "HEARTBEAT_ACK":
                    logger.debug("Received HEARTBEAT_ACK from platform.")
                elif msg_type == "ERROR":
                    logger.error(f"Platform reported error: {data.get('payload')}")
                else:
                    logger.warning(f"Ignoring unhandled message type: {msg_type}")

            except ConnectionClosed:
                break
            except json.JSONDecodeError:
                logger.warning("Received invalid non-JSON payload from server.")
            except Exception as e:
                logger.error(f"Error in message processing loop: {e}", exc_info=True)

    async def _handle_command(self, packet: Dict[str, Any]):
        """
        Processes server-dispatched commands.
        Enforces strict allowlist security check.
        """
        command_id = packet.get("commandId", "unknown")
        command_name = packet.get("command")
        params = packet.get("params", {}) or {}

        logger.info(f"Received command: {command_name} (ID: {command_id})")

        # Security check: Must be in allowlist
        if command_name not in SAFE_COMMANDS:
            logger.error(
                f"SECURITY VIOLATION: Command '{command_name}' is not in predefined allowlist. Rejecting."
            )
            await self._send_json({
                "type": "COMMAND_RESULT",
                "payload": {
                    "commandId": command_id,
                    "node_id": self.node_id,
                    "command": command_name,
                    "status": "ERROR",
                    "error": f"Command '{command_name}' is forbidden or unknown.",
                    "timestamp": time.time(),
                },
            })
            return

        # Execute safe predefined command
        try:
            if command_name == "PING":
                uptime = round(time.time() - self.start_time, 1)
                await self._send_json({
                    "type": "COMMAND_RESULT",
                    "payload": {
                        "commandId": command_id,
                        "node_id": self.node_id,
                        "command": "PING",
                        "status": "SUCCESS",
                        "output": {
                            "pong": True,
                            "uptime_seconds": uptime,
                            "availability": self.availability,
                            "timestamp": time.time(),
                        },
                    },
                })

            elif command_name == "GET_SYSTEM_INFO":
                sys_info = get_system_info()
                await self._send_json({
                    "type": "COMMAND_RESULT",
                    "payload": {
                        "commandId": command_id,
                        "node_id": self.node_id,
                        "command": "GET_SYSTEM_INFO",
                        "status": "SUCCESS",
                        "output": sys_info,
                    },
                })

            elif command_name == "GET_GPU_STATUS":
                gpus = get_gpu_telemetry()
                await self._send_json({
                    "type": "COMMAND_RESULT",
                    "payload": {
                        "commandId": command_id,
                        "node_id": self.node_id,
                        "command": "GET_GPU_STATUS",
                        "status": "SUCCESS",
                        "output": {
                            "gpu_count": len(gpus),
                            "gpus": gpus,
                        },
                    },
                })

            elif command_name == "SET_NODE_AVAILABILITY":
                new_status = params.get("status", "AVAILABLE")
                if new_status in ["AVAILABLE", "BUSY"]:
                    self.availability = new_status
                    await self._send_json({
                        "type": "COMMAND_RESULT",
                        "payload": {
                            "commandId": command_id,
                            "node_id": self.node_id,
                            "command": "SET_NODE_AVAILABILITY",
                            "status": "SUCCESS",
                            "output": {"availability": self.availability},
                        },
                    })
                else:
                    await self._send_json({
                        "type": "COMMAND_RESULT",
                        "payload": {
                            "commandId": command_id,
                            "node_id": self.node_id,
                            "command": "SET_NODE_AVAILABILITY",
                            "status": "ERROR",
                            "error": f"Invalid status: {new_status}. Must be AVAILABLE or BUSY.",
                        },
                    })

            elif command_name == "RUN_GPU_TEST":
                duration = int(params.get("duration", 5))
                gpu_idx = int(params.get("gpu_index", 0))

                # Run test in thread pool so it does not block the async event loop
                loop = asyncio.get_running_loop()
                test_result = await loop.run_in_executor(
                    None,
                    self.gpu_tester.run_safe_test,
                    duration,
                    gpu_idx,
                )

                await self._send_json({
                    "type": "GPU_TEST_RESULT",
                    "payload": {
                        "commandId": command_id,
                        "node_id": self.node_id,
                        "status": test_result.get("status", "UNKNOWN"),
                        "results": test_result,
                        "error": test_result.get("error"),
                        "timestamp": time.time(),
                    },
                })

            elif command_name == "START_JUPYTER_CONTAINER":
                port = int(params.get("port", 8888))
                loop = asyncio.get_running_loop()
                container_res = await loop.run_in_executor(
                    None,
                    self.container_runner.start_jupyter,
                    port,
                )
                await self._send_json({
                    "type": "COMMAND_RESULT",
                    "payload": {
                        "commandId": command_id,
                        "node_id": self.node_id,
                        "command": "START_JUPYTER_CONTAINER",
                        "status": container_res.get("status", "SUCCESS"),
                        "output": container_res,
                        "timestamp": time.time(),
                    },
                })

            elif command_name == "STOP_JUPYTER_CONTAINER":
                loop = asyncio.get_running_loop()
                container_res = await loop.run_in_executor(
                    None,
                    self.container_runner.stop_jupyter,
                )
                await self._send_json({
                    "type": "COMMAND_RESULT",
                    "payload": {
                        "commandId": command_id,
                        "node_id": self.node_id,
                        "command": "STOP_JUPYTER_CONTAINER",
                        "status": container_res.get("status", "SUCCESS"),
                        "output": container_res,
                        "timestamp": time.time(),
                    },
                })

            elif command_name == "GET_CONTAINER_STATUS":
                loop = asyncio.get_running_loop()
                container_res = await loop.run_in_executor(
                    None,
                    self.container_runner.get_status,
                )
                await self._send_json({
                    "type": "COMMAND_RESULT",
                    "payload": {
                        "commandId": command_id,
                        "node_id": self.node_id,
                        "command": "GET_CONTAINER_STATUS",
                        "status": "SUCCESS",
                        "output": container_res,
                        "timestamp": time.time(),
                    },
                })

        except Exception as e:
            logger.error(f"Error handling command {command_name}: {e}", exc_info=True)
            await self._send_json({
                "type": "COMMAND_RESULT",
                "payload": {
                    "commandId": command_id,
                    "node_id": self.node_id,
                    "command": command_name,
                    "status": "ERROR",
                    "error": f"Command processing exception: {str(e)}",
                },
            })
