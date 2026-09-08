import socket
import platform
import psutil
from typing import Dict, Any

def get_system_info() -> Dict[str, Any]:
    """
    Collects cross-platform host system information including hostname, OS, CPU, and RAM.
    """
    hostname = socket.gethostname()

    # OS Info
    os_name = platform.system()
    os_release = platform.release()
    os_str = f"{os_name} {os_release}"

    # CPU Info
    cpu_count_logical = psutil.cpu_count(logical=True) or 1
    cpu_count_physical = psutil.cpu_count(logical=False) or cpu_count_logical
    cpu_percent = psutil.cpu_percent(interval=None)
    
    # Try reading CPU model on Linux / Unix
    cpu_model = platform.processor() or "Unknown CPU"
    try:
        with open("/proc/cpuinfo", "r") as f:
            for line in f:
                if "model name" in line:
                    cpu_model = line.split(":", 1)[1].strip()
                    break
    except Exception:
        pass

    cpu_str = f"{cpu_model} ({cpu_count_physical}C/{cpu_count_logical}T)"

    # RAM Info
    mem = psutil.virtual_memory()
    total_gb = mem.total / (1024 ** 3)
    used_gb = mem.used / (1024 ** 3)
    ram_str = f"{total_gb:.1f} GB ({mem.percent}% used)"

    return {
        "hostname": hostname,
        "os": os_str,
        "cpu": cpu_str,
        "cpu_usage_percent": cpu_percent,
        "cpu_cores": cpu_count_logical,
        "ram": ram_str,
        "ram_total_mb": int(mem.total / (1024 ** 2)),
        "ram_used_mb": int(mem.used / (1024 ** 2)),
        "ram_free_mb": int(mem.available / (1024 ** 2)),
        "ram_percent": mem.percent,
    }
