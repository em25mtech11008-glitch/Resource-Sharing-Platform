import sys
import argparse

def main():
    parser = argparse.ArgumentParser(
        description="P2P GPU Node Agent — Application (GUI & CLI)",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--cli", action="store_true", help="Run directly in Command Line (CLI) mode")
    parser.add_argument("--server", type=str, default=None, help="Backend WebSocket URL for CLI mode")
    parser.add_argument("--name", type=str, default=None, help="Node display name for CLI mode")
    parser.add_argument("--web", action="store_true", help="Force embedded Web UI launcher instead of desktop GUI")
    parser.add_argument("--port", type=int, default=5050, help="Port for the local Web UI (default 5050)")
    args, unknown = parser.parse_known_args()

    # If --cli or --server specified, run pure Command Line mode
    if args.cli or args.server:
        import asyncio
        from main import async_main
        try:
            asyncio.run(async_main())
        except KeyboardInterrupt:
            pass
        return

    if args.web:
        from web_app import run_web_app
        run_web_app(port=args.port)
        return

    # Try native desktop GUI (Tkinter) first
    try:
        import tkinter
        from gui_app import run_desktop_gui
        run_desktop_gui()
    except (ImportError, Exception) as e:
        print("Note: Native desktop GUI library (Tkinter) not detected or display unavailable.")
        print("Automatically launching lightweight embedded Web Control Panel instead...")
        from web_app import run_web_app
        run_web_app(port=args.port)

if __name__ == "__main__":
    main()
