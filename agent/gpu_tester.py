import time
import logging
from typing import Dict, Any, List
from gpu_monitor import get_gpu_telemetry

logger = logging.getLogger("GPU-Agent.GpuTester")

class GpuTester:
    def __init__(self):
        self._is_running = False

    def is_busy(self) -> bool:
        return self._is_running

    def run_safe_test(self, duration_seconds: int = 5, target_gpu_index: int = 0) -> Dict[str, Any]:
        """
        Executes a predefined, bounded GPU workload benchmark.
        Strictly safe: Server cannot provide arbitrary code or shell commands.
        """
        if self._is_running:
            return {
                "status": "REJECTED",
                "error": "GPU workload test rejected: Agent is currently BUSY running a test.",
            }

        # Check available GPUs
        gpus = get_gpu_telemetry()
        if not gpus:
            return {
                "status": "FAILED",
                "error": "GPU workload test failed: No NVIDIA GPU detected on this host.",
                "duration_seconds": 0,
            }

        # Validate target GPU index
        valid_indices = [g["gpu_index"] for g in gpus]
        if target_gpu_index not in valid_indices:
            target_gpu_index = valid_indices[0]

        target_gpu_initial = next(g for g in gpus if g["gpu_index"] == target_gpu_index)

        self._is_running = True
        logger.info(
            f"Starting safe predefined GPU test on GPU {target_gpu_index} ({target_gpu_initial['gpu_name']}) for {duration_seconds}s..."
        )

        samples: List[Dict[str, Any]] = []
        start_time = time.time()
        end_time = start_time + max(1, min(duration_seconds, 30)) # clamp duration between 1s and 30s
        iterations = 0

        try:
            # Check if PyTorch with CUDA is available for direct GPU tensor compute
            torch_available = False
            torch_device = None
            try:
                import torch
                if torch.cuda.is_available() and target_gpu_index < torch.cuda.device_count():
                    torch_available = True
                    torch_device = torch.device(f"cuda:{target_gpu_index}")
                    logger.info(f"PyTorch CUDA acceleration active on {torch_device}")
            except Exception:
                torch_available = False

            # Run compute loop
            while time.time() < end_time:
                loop_start = time.time()

                if torch_available and torch_device is not None:
                    # Safe fixed tensor multiplication (matrix benchmark)
                    import torch
                    a = torch.randn(2048, 2048, device=torch_device, dtype=torch.float32)
                    b = torch.randn(2048, 2048, device=torch_device, dtype=torch.float32)
                    _ = torch.matmul(a, b)
                    torch.cuda.synchronize(torch_device)
                else:
                    # Bounded math computation if torch is not installed
                    val = 1.0
                    for _ in range(50000):
                        val = (val * 1.000001) % 1000.0

                iterations += 1

                # Sample telemetry every ~500ms
                current_telemetry = get_gpu_telemetry()
                matched = next((g for g in current_telemetry if g["gpu_index"] == target_gpu_index), None)
                if matched:
                    samples.append(matched)

                # Sleep slightly to prevent 100% CPU lock if doing CPU loop
                elapsed_in_loop = time.time() - loop_start
                if elapsed_in_loop < 0.2:
                    time.sleep(0.2 - elapsed_in_loop)

            actual_duration = round(time.time() - start_time, 2)
            final_telemetry = get_gpu_telemetry()
            target_gpu_final = next(
                (g for g in final_telemetry if g["gpu_index"] == target_gpu_index),
                target_gpu_initial,
            )

            peak_util = max([s.get("utilization", 0.0) for s in samples], default=target_gpu_final.get("utilization", 0.0))
            peak_vram = max([s.get("memory_used", 0) for s in samples], default=target_gpu_final.get("memory_used", 0))
            peak_temp = max([s.get("temperature", 0.0) for s in samples], default=target_gpu_final.get("temperature", 0.0))

            logger.info(
                f"GPU Test finished: {iterations} cycles in {actual_duration}s. Peak util: {peak_util}%, Peak temp: {peak_temp}°C"
            )

            return {
                "status": "SUCCESS",
                "target_gpu_index": target_gpu_index,
                "gpu_name": target_gpu_initial["gpu_name"],
                "duration_seconds": actual_duration,
                "iterations_completed": iterations,
                "initial_temperature": target_gpu_initial.get("temperature", 0.0),
                "peak_temperature": peak_temp,
                "final_temperature": target_gpu_final.get("temperature", 0.0),
                "peak_utilization": peak_util,
                "peak_vram_mb": peak_vram,
                "message": f"Predefined GPU workload completed successfully ({iterations} iterations in {actual_duration}s)",
            }

        except Exception as e:
            logger.error(f"Error executing safe GPU test: {e}", exc_info=True)
            return {
                "status": "FAILED",
                "error": f"GPU test execution error: {str(e)}",
                "duration_seconds": round(time.time() - start_time, 2),
            }
        finally:
            self._is_running = False
