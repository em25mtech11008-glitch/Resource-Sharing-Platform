import subprocess
import logging
from typing import List, Dict, Any, Optional

logger = logging.getLogger("GPU-Agent.GpuMonitor")

# Track whether NVML was initialized successfully
_NVML_INITIALIZED = False
_NVML_AVAILABLE = False

try:
    import pynvml
    _NVML_AVAILABLE = True
except ImportError:
    try:
        import nvidia_smi as pynvml
        _NVML_AVAILABLE = True
    except ImportError:
        _NVML_AVAILABLE = False


def _init_nvml() -> bool:
    """Safely initializes NVML once."""
    global _NVML_INITIALIZED
    if not _NVML_AVAILABLE:
        return False
    if _NVML_INITIALIZED:
        return True

    try:
        pynvml.nvmlInit()
        _NVML_INITIALIZED = True
        logger.info("NVIDIA NVML initialized successfully.")
        return True
    except Exception as e:
        logger.debug(f"NVML initialization failed: {e}")
        return False


def _query_via_nvml() -> Optional[List[Dict[str, Any]]]:
    """Queries GPU telemetry directly using pynvml."""
    if not _init_nvml():
        return None

    try:
        driver_ver = pynvml.nvmlSystemGetDriverVersion()
        if isinstance(driver_ver, bytes):
            driver_ver = driver_ver.decode("utf-8")

        device_count = pynvml.nvmlDeviceGetCount()
        if device_count == 0:
            return []

        gpus = []
        for i in range(device_count):
            handle = pynvml.nvmlDeviceGetHandleByIndex(i)

            name = pynvml.nvmlDeviceGetName(handle)
            if isinstance(name, bytes):
                name = name.decode("utf-8")

            try:
                uuid_str = pynvml.nvmlDeviceGetUUID(handle)
                if isinstance(uuid_str, bytes):
                    uuid_str = uuid_str.decode("utf-8")
            except Exception:
                uuid_str = f"GPU-{i}"

            # Memory Info
            mem = pynvml.nvmlDeviceGetMemoryInfo(handle)
            total_mb = int(mem.total / (1024 * 1024))
            used_mb = int(mem.used / (1024 * 1024))
            free_mb = int(mem.free / (1024 * 1024))

            # Utilization
            try:
                util = pynvml.nvmlDeviceGetUtilizationRates(handle)
                gpu_util = float(util.gpu)
                mem_util = float(util.memory)
            except Exception:
                gpu_util = 0.0
                mem_util = 0.0

            # Temperature
            try:
                temp = float(pynvml.nvmlDeviceGetTemperature(handle, pynvml.NVML_TEMPERATURE_GPU))
            except Exception:
                temp = 0.0

            # Power Draw and Limit
            try:
                power_draw = float(pynvml.nvmlDeviceGetPowerUsage(handle)) / 1000.0  # mW to Watts
            except Exception:
                power_draw = 0.0

            try:
                power_limit = float(pynvml.nvmlDeviceGetPowerManagementLimit(handle)) / 1000.0
            except Exception:
                power_limit = 0.0

            gpus.append({
                "gpu_index": i,
                "gpu_uuid": uuid_str,
                "gpu_name": name,
                "total_memory": total_mb,
                "memory_used": used_mb,
                "memory_free": free_mb,
                "utilization": round(gpu_util, 1),
                "memory_utilization": round(mem_util, 1),
                "temperature": round(temp, 1),
                "power_draw": round(power_draw, 1),
                "power_limit": round(power_limit, 1),
                "driver_version": str(driver_ver),
            })

        return gpus
    except Exception as e:
        logger.debug(f"Error querying via NVML: {e}")
        return None


def _query_via_nvidia_smi() -> Optional[List[Dict[str, Any]]]:
    """Fallback: Queries GPU telemetry using nvidia-smi CLI."""
    query_fields = [
        "index",
        "name",
        "uuid",
        "memory.total",
        "memory.used",
        "memory.free",
        "utilization.gpu",
        "utilization.memory",
        "temperature.gpu",
        "power.draw",
        "power.limit",
        "driver_version",
    ]

    cmd = [
        "nvidia-smi",
        f"--query-gpu={','.join(query_fields)}",
        "--format=csv,noheader,nounits",
    ]

    try:
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=5)
        if proc.returncode != 0:
            return None

        lines = [line.strip() for line in proc.stdout.strip().split("\n") if line.strip()]
        if not lines:
            return []

        gpus = []
        for line in lines:
            parts = [p.strip() for p in line.split(",")]
            if len(parts) < len(query_fields):
                continue

            def safe_float(val, default=0.0):
                try:
                    return float(val)
                except Exception:
                    return default

            def safe_int(val, default=0):
                try:
                    return int(float(val))
                except Exception:
                    return default

            gpus.append({
                "gpu_index": safe_int(parts[0], 0),
                "gpu_name": parts[1],
                "gpu_uuid": parts[2],
                "total_memory": safe_int(parts[3], 0),
                "memory_used": safe_int(parts[4], 0),
                "memory_free": safe_int(parts[5], 0),
                "utilization": safe_float(parts[6], 0.0),
                "memory_utilization": safe_float(parts[7], 0.0),
                "temperature": safe_float(parts[8], 0.0),
                "power_draw": safe_float(parts[9], 0.0),
                "power_limit": safe_float(parts[10], 0.0),
                "driver_version": parts[11],
            })

        return gpus
    except Exception as e:
        logger.debug(f"nvidia-smi fallback execution error: {e}")
        return None


def get_gpu_telemetry() -> List[Dict[str, Any]]:
    """
    Returns actual NVIDIA GPU telemetry.
    Attempts NVML first, then falls back to nvidia-smi.
    Does NOT use mock data. If no NVIDIA GPU is found, returns an empty list.
    """
    # 1. Primary: NVML
    gpus = _query_via_nvml()
    if gpus is not None:
        return gpus

    # 2. Fallback: nvidia-smi
    gpus = _query_via_nvidia_smi()
    if gpus is not None:
        return gpus

    # 3. No hardware / driver present
    return []


def shutdown_nvml():
    """Shuts down NVML gracefully upon agent exit."""
    global _NVML_INITIALIZED
    if _NVML_INITIALIZED:
        try:
            pynvml.nvmlShutdown()
            _NVML_INITIALIZED = False
        except Exception:
            pass
