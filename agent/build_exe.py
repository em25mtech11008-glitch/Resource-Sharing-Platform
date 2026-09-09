#!/usr/bin/env python3
"""
PyInstaller builder to package the P2P GPU Node Agent into a single standalone executable.
Run this on Windows to generate `dist/GPUNodeAgent.exe`
Run this on Linux to generate `dist/GPUNodeAgent`
"""
import os
import sys
import subprocess

def build():
    print("==================================================")
    print("   Building Standalone GPU Node Agent Executable")
    print("==================================================")

    # Verify pyinstaller is installed
    try:
        import PyInstaller
    except ImportError:
        print("Installing pyinstaller...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pyinstaller"])

    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--name=GPUNodeAgent",
        "--onefile",
        "--clean",
        "--noconfirm",
        "--hidden-import=websockets",
        "--hidden-import=psutil",
        "--hidden-import=nvidia_ml_py",
        "--hidden-import=pynvml",
        "app.py",
    ]

    print(f"Running: {' '.join(cmd)}")
    subprocess.check_call(cmd)

    output_dir = os.path.abspath("dist")
    print("\n==================================================")
    print("BUILD SUCCESSFUL!")
    print(f"Standalone executable located in: {output_dir}")
    print("==================================================")

if __name__ == "__main__":
    build()
