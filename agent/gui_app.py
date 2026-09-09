import sys
import os
from app_controller import AgentController

def run_desktop_gui():
    try:
        import tkinter as tk
        from tkinter import ttk, messagebox, scrolledtext
    except ImportError:
        print("Tkinter is not available in this Python environment.")
        print("To run the GUI on Linux, install python3-tk: sudo apt install python3-tk")
        print("Alternatively, use the local Web GUI: python web_app.py")
        sys.exit(1)

    controller = AgentController()
    hardware = controller.get_hardware_info()
    sys_info = hardware.get("sys_info", {})
    gpus = hardware.get("gpus", [])
    gpu_desc = gpus[0]["gpu_name"] + f" ({gpus[0]['total_memory']} MB VRAM)" if gpus else "No NVIDIA GPU (CPU-Only Mode)"

    root = tk.Tk()
    root.title("P2P GPU Node Agent — Control Panel")
    root.geometry("640x680")
    root.minsize(580, 600)
    root.configure(bg="#0d1117")

    # Dark mode colors
    BG = "#0d1117"
    PANEL_BG = "#161b22"
    BORDER_COLOR = "#30363d"
    TEXT_MAIN = "#f0f6fc"
    TEXT_MUTED = "#8b949e"
    EMERALD = "#10b981"
    ROSE = "#f43f5e"
    AMBER = "#f59e0b"

    # Header
    header_frame = tk.Frame(root, bg=PANEL_BG, pady=12, padx=16, highlightbackground=BORDER_COLOR, highlightthickness=1)
    header_frame.pack(fill=tk.X, padx=12, pady=(12, 6))

    title_label = tk.Label(header_frame, text="P2P GPU Node Agent", font=("Helvetica", 14, "bold"), fg=TEXT_MAIN, bg=PANEL_BG)
    title_label.pack(anchor="w")

    subtitle = tk.Label(header_frame, text="Secure Outbound GPU Telemetry & Workload Agent", font=("Helvetica", 9), fg=TEXT_MUTED, bg=PANEL_BG)
    subtitle.pack(anchor="w")

    # Status Banner
    status_frame = tk.Frame(root, bg=PANEL_BG, pady=8, padx=16, highlightbackground=BORDER_COLOR, highlightthickness=1)
    status_frame.pack(fill=tk.X, padx=12, pady=6)

    status_title = tk.Label(status_frame, text="AGENT STATUS:", font=("Helvetica", 9, "bold"), fg=TEXT_MUTED, bg=PANEL_BG)
    status_title.pack(side=tk.LEFT)

    status_text = tk.StringVar(value="STOPPED")
    status_label = tk.Label(status_frame, textvariable=status_text, font=("Helvetica", 10, "bold"), fg=ROSE, bg=PANEL_BG, padx=8)
    status_label.pack(side=tk.LEFT)

    # Configuration Form
    config_frame = tk.LabelFrame(root, text=" Server & Identity Configuration ", font=("Helvetica", 9, "bold"), fg=TEXT_MAIN, bg=PANEL_BG, padx=14, pady=10, highlightbackground=BORDER_COLOR, highlightthickness=1)
    config_frame.pack(fill=tk.X, padx=12, pady=6)

    # Server URL
    tk.Label(config_frame, text="Central Platform Address (IP or WebSocket URL):", font=("Helvetica", 9), fg=TEXT_MUTED, bg=PANEL_BG).pack(anchor="w")
    url_var = tk.StringVar(value=controller.config.server_url or "ws://172.25.134.9:4000")
    url_entry = tk.Entry(config_frame, textvariable=url_var, font=("Consolas", 10), bg="#0d1117", fg=TEXT_MAIN, insertbackground=TEXT_MAIN, highlightbackground=BORDER_COLOR, highlightthickness=1, relief=tk.FLAT)
    url_entry.pack(fill=tk.X, pady=(2, 8), ipady=4)

    # Node Name
    tk.Label(config_frame, text="Custom Node Name (Display Name):", font=("Helvetica", 9), fg=TEXT_MUTED, bg=PANEL_BG).pack(anchor="w")
    name_var = tk.StringVar(value=controller.config.node_name or f"Rig-{controller.node_id[-6:]}")
    name_entry = tk.Entry(config_frame, textvariable=name_var, font=("Consolas", 10), bg="#0d1117", fg=TEXT_MAIN, insertbackground=TEXT_MAIN, highlightbackground=BORDER_COLOR, highlightthickness=1, relief=tk.FLAT)
    name_entry.pack(fill=tk.X, pady=(2, 6), ipady=4)

    # Hardware Info Preview
    hw_frame = tk.Frame(root, bg=PANEL_BG, pady=8, padx=14, highlightbackground=BORDER_COLOR, highlightthickness=1)
    hw_frame.pack(fill=tk.X, padx=12, pady=6)

    gpu_label = tk.Label(hw_frame, text=f"🎮 GPU: {gpu_desc}", font=("Helvetica", 9, "bold"), fg=EMERALD if gpus else TEXT_MUTED, bg=PANEL_BG)
    gpu_label.pack(anchor="w")

    host_label = tk.Label(hw_frame, text=f"💻 Host: {sys_info.get('hostname', 'localhost')} | {sys_info.get('os', '')} | {sys_info.get('ram', '')}", font=("Helvetica", 8), fg=TEXT_MUTED, bg=PANEL_BG)
    host_label.pack(anchor="w", pady=(2, 0))

    node_id_label = tk.Label(hw_frame, text=f"🔑 Node ID: {controller.node_id}", font=("Consolas", 8), fg=TEXT_MUTED, bg=PANEL_BG)
    node_id_label.pack(anchor="w", pady=(2, 0))

    # Buttons Frame
    btn_frame = tk.Frame(root, bg=BG, pady=6)
    btn_frame.pack(fill=tk.X, padx=12)

    def on_start():
        url = url_var.get().strip()
        name = name_var.get().strip()
        if not url:
            messagebox.showwarning("Missing Address", "Please enter the central platform server address.")
            return

        res = controller.start_agent(url, name)
        if not res.get("success"):
            messagebox.showerror("Error", res.get("message", "Failed to start agent."))

    def on_stop():
        controller.stop_agent()

    start_btn = tk.Button(btn_frame, text="▶ START AGENT", font=("Helvetica", 10, "bold"), bg=EMERALD, fg="#ffffff", activebackground="#059669", activeforeground="#ffffff", relief=tk.FLAT, padx=20, pady=8, cursor="hand2", command=on_start)
    start_btn.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(0, 6))

    stop_btn = tk.Button(btn_frame, text="⏹ STOP AGENT", font=("Helvetica", 10, "bold"), bg=ROSE, fg="#ffffff", activebackground="#e11d48", activeforeground="#ffffff", relief=tk.FLAT, padx=20, pady=8, cursor="hand2", command=on_stop)
    stop_btn.pack(side=tk.RIGHT, fill=tk.X, expand=True, padx=(6, 0))

    # Activity Log Box
    log_frame = tk.LabelFrame(root, text=" Live Agent Activity Log ", font=("Helvetica", 9, "bold"), fg=TEXT_MAIN, bg=PANEL_BG, padx=8, pady=8, highlightbackground=BORDER_COLOR, highlightthickness=1)
    log_frame.pack(fill=tk.BOTH, expand=True, padx=12, pady=(6, 12))

    log_box = scrolledtext.ScrolledText(log_frame, bg="#0d1117", fg="#c9d1d9", font=("Consolas", 8), insertbackground=TEXT_MAIN, highlightthickness=0, relief=tk.FLAT, state=tk.DISABLED)
    log_box.pack(fill=tk.BOTH, expand=True)

    last_log_count = [0]

    def refresh_ui():
        state = controller.get_state()
        status = state.get("status", "STOPPED")

        # Update status badge
        if status == "CONNECTED":
            status_text.set("🟢 CONNECTED (Streaming Telemetry)")
            status_label.config(fg=EMERALD)
            start_btn.config(state=tk.DISABLED, bg="#21262d")
            stop_btn.config(state=tk.NORMAL, bg=ROSE)
            url_entry.config(state=tk.DISABLED)
            name_entry.config(state=tk.DISABLED)
        elif status == "CONNECTING":
            status_text.set("🟡 CONNECTING...")
            status_label.config(fg=AMBER)
            start_btn.config(state=tk.DISABLED, bg="#21262d")
            stop_btn.config(state=tk.NORMAL, bg=ROSE)
        elif status == "RECONNECTING":
            status_text.set("🟠 RECONNECTING (Backoff)...")
            status_label.config(fg=AMBER)
            start_btn.config(state=tk.DISABLED, bg="#21262d")
            stop_btn.config(state=tk.NORMAL, bg=ROSE)
        else:
            status_text.set("🔴 STOPPED")
            status_label.config(fg=ROSE)
            start_btn.config(state=tk.NORMAL, bg=EMERALD)
            stop_btn.config(state=tk.DISABLED, bg="#21262d")
            url_entry.config(state=tk.NORMAL)
            name_entry.config(state=tk.NORMAL)

        # Update log box
        logs = state.get("logs", [])
        if len(logs) != last_log_count[0]:
            last_log_count[0] = len(logs)
            log_box.config(state=tk.NORMAL)
            log_box.delete("1.0", tk.END)
            for item in logs:
                log_box.insert(tk.END, f"[{item['timestamp']}] {item['message']}\n")
            log_box.see(tk.END)
            log_box.config(state=tk.DISABLED)

        root.after(800, refresh_ui)

    def on_closing():
        if controller.is_running():
            controller.stop_agent()
        root.destroy()

    root.protocol("WM_DELETE_WINDOW", on_closing)
    refresh_ui()
    root.mainloop()

if __name__ == "__main__":
    run_desktop_gui()
