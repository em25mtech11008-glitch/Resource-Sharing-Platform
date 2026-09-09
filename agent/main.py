import sys
import os
import signal
import asyncio
import argparse

from logger import setup_logger
from config import AgentConfig
from node_identity import get_or_create_node_id
from connection import AgentConnection
from gpu_monitor import shutdown_nvml

def parse_args():
    parser = argparse.ArgumentParser(
        description="P2P GPU Platform - Node Agent",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--server",
        type=str,
        default=None,
        help="Backend WebSocket URL (e.g. ws://localhost:4000)",
    )
    parser.add_argument(
        "--name",
        type=str,
        default=None,
        help="Custom human-readable name for this node",
    )
    parser.add_argument(
        "--heartbeat",
        type=int,
        default=None,
        help="Heartbeat transmission interval in seconds",
    )
    parser.add_argument(
        "--metrics",
        type=int,
        default=None,
        help="GPU metrics transmission interval in seconds",
    )
    parser.add_argument(
        "--config",
        type=str,
        default=None,
        help="Path to JSON configuration file",
    )
    parser.add_argument(
        "--gui",
        action="store_true",
        help="Launch the Graphical User Interface (GUI / Web Control Panel)",
    )
    parser.add_argument(
        "--web",
        action="store_true",
        help="Launch the embedded Web User Interface (localhost:5050)",
    )
    parser.add_argument(
        "--cli",
        action="store_true",
        help="Run in Command Line (CLI) mode directly in this terminal",
    )
    parser.add_argument(
        "--data-dir",
        type=str,
        default="data",
        help="Directory to store persistent node ID and logs",
    )
    return parser.parse_args()

async def async_main():
    args = parse_args()

    # Setup structured logger
    logger = setup_logger("GPU-Agent", log_dir=args.data_dir)
    logger.info("==================================================")
    logger.info("Starting P2P GPU Node Agent...")
    logger.info("==================================================")

    # Load configuration
    config = AgentConfig.load(
        config_path=args.config,
        server_url=args.server,
        node_name=args.name,
        heartbeat_interval=args.heartbeat,
        metrics_interval=args.metrics,
        data_dir=args.data_dir,
    )

    logger.info(f"Target Platform URL: {config.server_url}")
    logger.info(f"Heartbeat Interval: {config.heartbeat_interval}s | Metrics Interval: {config.metrics_interval}s")

    # Persistent Node ID
    node_id, is_new = get_or_create_node_id(config.data_dir)
    if is_new:
        logger.info(f"Initialized new persistent Node ID: {node_id}")
    else:
        logger.info(f"Resuming with existing Node ID: {node_id}")

    # Create connection manager
    agent = AgentConnection(node_id, config)

    # Register OS signal handlers for graceful shutdown
    loop = asyncio.get_running_loop()

    def handle_shutdown_signal(sig_name):
        logger.info(f"Received {sig_name}. Initiating graceful shutdown...")
        asyncio.create_task(agent.stop())

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, lambda s=sig.name: handle_shutdown_signal(s))
        except NotImplementedError:
            # Signals might not be supported on Windows event loops
            pass

    try:
        await agent.start()
    finally:
        logger.info("Cleaning up agent resources...")
        shutdown_nvml()
        logger.info("P2P GPU Node Agent stopped cleanly.")

def main():
    # If --gui or --web requested, launch User Interface
    if "--gui" in sys.argv or "--web" in sys.argv:
        from app import main as app_main
        app_main()
        return

    try:
        asyncio.run(async_main())
    except KeyboardInterrupt:
        pass

if __name__ == "__main__":
    main()
