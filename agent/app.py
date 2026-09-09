import sys
import argparse

def main():
    parser = argparse.ArgumentParser(description="P2P GPU Node Agent — Application")
    parser.add_argument("--web", action="store_true", help="Force embedded Web UI launcher instead of desktop GUI")
    parser.add_argument("--port", type=int, default=5050, help="Port for the local Web UI (default 5050)")
    args = parser.parse_args()

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
