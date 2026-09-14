#!/bin/bash
echo "Installing dependencies..."
sudo apt update
sudo apt install -y python3-pip python3-venv

echo "Setting up virtual environment..."
python3 -m venv venv
source venv/bin/activate

echo "Installing requirements and PyInstaller..."
pip install -r requirements.txt pyinstaller

echo "Building standalone executable for Ubuntu..."
pyinstaller --onefile main.py --name NodeAgent

echo "Build complete! Your executable is in the 'dist' folder."
echo "You can run it like this: ./dist/NodeAgent --server ws://172.25.135.245:4000 --name Ubuntu-GPU"
