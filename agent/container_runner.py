import subprocess
import shutil
import uuid
import logging
import socket
from typing import Dict, Any, Optional
from gpu_monitor import get_gpu_telemetry

logger = logging.getLogger("GPU-Agent.ContainerRunner")

# Strictly approved image for safe Jupyter deployment
APPROVED_JUPYTER_IMAGE = "jupyter/base-notebook:latest"
CONTAINER_PREFIX = "p2p-gpu-jupyter"

class ContainerRunner:
    def __init__(self, node_id: str):
        self.node_id = node_id
        self.container_name = f"{CONTAINER_PREFIX}-{node_id[-6:]}"
        self.active_session: Optional[Dict[str, Any]] = None

    def is_docker_available(self) -> bool:
        """Checks if the Docker CLI and daemon are accessible on the host."""
        if not shutil.which("docker"):
            return False
        try:
            res = subprocess.run(
                ["docker", "info"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=5,
            )
            return res.returncode == 0
        except Exception:
            return False

    def get_host_ip(self) -> str:
        """Detects the primary LAN IP address of this host machine."""
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except Exception:
            return "localhost"

    def get_status(self) -> Dict[str, Any]:
        """Inspects if the designated Jupyter container is currently running."""
        if not self.is_docker_available():
            return {
                "installed": False,
                "running": False,
                "message": "Docker daemon is not available on this host.",
            }

        try:
            res = subprocess.run(
                ["docker", "inspect", "-f", "{{.State.Running}}", self.container_name],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=5,
            )
            is_running = res.stdout.strip().lower() == "true"

            if is_running and self.active_session:
                return {
                    "installed": True,
                    "running": True,
                    "container_name": self.container_name,
                    **self.active_session,
                }
            elif is_running:
                return {
                    "installed": True,
                    "running": True,
                    "container_name": self.container_name,
                }
            else:
                self.active_session = None
                return {
                    "installed": True,
                    "running": False,
                }
        except Exception as e:
            return {
                "installed": True,
                "running": False,
                "error": str(e),
            }

    def start_jupyter(self, port: int = 8888) -> Dict[str, Any]:
        """
        Deploys a sandboxed Jupyter Notebook container using the pre-approved template.
        Safe: Server cannot supply custom Dockerfiles, images, or volume mount paths.
        """
        if not self.is_docker_available():
            return {
                "status": "FAILED",
                "error": "Docker is not installed or the Docker daemon is not running on this host.",
            }

        # Check if already running
        current = self.get_status()
        if current.get("running"):
            return {
                "status": "ALREADY_RUNNING",
                "message": f"Jupyter container '{self.container_name}' is already active.",
                **current,
            }

        # Cleanup existing stopped container with the same name if present
        subprocess.run(
            ["docker", "rm", "-f", self.container_name],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

        token = str(uuid.uuid4())
        host_ip = self.get_host_ip()

        # Check GPU availability for GPU passthrough
        gpus = get_gpu_telemetry()
        has_gpu = len(gpus) > 0

        cmd = [
            "docker", "run", "-d",
            "--name", self.container_name,
            "-p", f"{port}:8888",
            "-e", f"JUPYTER_TOKEN={token}",
            "--restart", "unless-stopped",
        ]

        # Enable NVIDIA GPU passthrough if GPUs are physically available
        if has_gpu:
            cmd.extend(["--gpus", "all"])
            logger.info(f"NVIDIA GPU detected. Deploying container with --gpus all passthrough.")
        else:
            logger.info("No NVIDIA GPU detected. Deploying container in CPU mode.")

        # Predefined safe image
        cmd.append(APPROVED_JUPYTER_IMAGE)
        cmd.extend([
            "start-notebook.sh",
            f"--NotebookApp.token={token}",
            "--NotebookApp.ip=0.0.0.0",
            "--NotebookApp.allow_origin=*",
        ])

        logger.info(f"Starting pre-approved Jupyter container: {' '.join(cmd)}")

        try:
            res = subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=60,
            )

            if res.returncode != 0:
                err_msg = res.stderr.strip()
                # If --gpus all failed (e.g. nvidia-container-toolkit not configured), fallback to CPU
                if has_gpu and ("nvidia-container-cli" in err_msg or "unknown flag: --gpus" in err_msg):
                    logger.warning("NVIDIA container toolkit not available. Retrying container in standard CPU mode...")
                    cmd = [c for c in cmd if c not in ["--gpus", "all"]]
                    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=60)

                if res.returncode != 0:
                    return {
                        "status": "FAILED",
                        "error": f"Docker run failed: {res.stderr.strip()}",
                    }

            container_id = res.stdout.strip()[:12]
            access_url = f"http://{host_ip}:{port}/tree?token={token}"

            self.active_session = {
                "container_id": container_id,
                "container_name": self.container_name,
                "image": APPROVED_JUPYTER_IMAGE,
                "port": port,
                "token": token,
                "host_ip": host_ip,
                "access_url": access_url,
                "gpu_enabled": has_gpu,
            }

            logger.info(f"Predefined Jupyter container '{self.container_name}' started successfully. Access URL: {access_url}")

            return {
                "status": "SUCCESS",
                **self.active_session,
            }

        except subprocess.TimeoutExpired:
            return {
                "status": "FAILED",
                "error": "Docker container startup timed out (image download may be in progress).",
            }
        except Exception as e:
            logger.error(f"Error starting Jupyter container: {e}", exc_info=True)
            return {
                "status": "FAILED",
                "error": str(e),
            }

    def stop_jupyter(self) -> Dict[str, Any]:
        """Stops and removes the pre-approved Jupyter container."""
        if not self.is_docker_available():
            return {
                "status": "FAILED",
                "error": "Docker is not available on this host.",
            }

        try:
            logger.info(f"Stopping Jupyter container '{self.container_name}'...")
            subprocess.run(
                ["docker", "stop", self.container_name],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=15,
            )
            subprocess.run(
                ["docker", "rm", self.container_name],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=5,
            )
            self.active_session = None
            logger.info(f"Container '{self.container_name}' stopped and removed.")
            return {
                "status": "SUCCESS",
                "message": f"Jupyter container '{self.container_name}' stopped successfully.",
            }
        except Exception as e:
            logger.error(f"Error stopping container: {e}", exc_info=True)
            return {
                "status": "FAILED",
                "error": str(e),
            }
