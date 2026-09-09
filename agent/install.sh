#!/usr/bin/env bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

echo "=========================================================="
echo "       ⚡ P2P GPU Node Agent — Quick One-Click Setup"
echo "=========================================================="
echo ""

# 1. Check Python
if ! command -v python3 &> /dev/null; then
    echo "[!] Python 3 not found. Installing python3 and pip..."
    sudo apt update && sudo apt install -y python3 python3-pip
fi

# 2. Install pip requirements automatically
echo "[*] Installing required Python libraries..."
python3 -m pip install -q -r requirements.txt --break-system-packages 2>/dev/null || \
python3 -m pip install -q -r requirements.txt --user 2>/dev/null || \
pip3 install -q -r requirements.txt 2>/dev/null || true

# 3. Create Desktop Application Shortcut in Ubuntu
DESKTOP_ENTRY_DIR="$HOME/.local/share/applications"
mkdir -p "$DESKTOP_ENTRY_DIR"
cat <<EOF > "$DESKTOP_ENTRY_DIR/p2p-gpu-agent.desktop"
[Desktop Entry]
Name=GPU Node Agent
Comment=P2P GPU Platform Node Agent Client
Exec=bash "$DIR/run-agent-app.sh"
Icon=utilities-terminal
Terminal=true
Type=Application
Categories=Utility;Development;
EOF
chmod +x "$DESKTOP_ENTRY_DIR/p2p-gpu-agent.desktop"
echo "[*] Created desktop application shortcut: GPU Node Agent"

# 4. Optional quick configuration prompt
DEFAULT_SERVER="ws://172.25.134.9:4000"
echo ""
read -r -p "Enter Central Platform Server [default: $DEFAULT_SERVER]: " INPUT_SERVER
SERVER_URL="${INPUT_SERVER:-$DEFAULT_SERVER}"

DEFAULT_NAME="Ubuntu-GPU-$(hostname)"
read -r -p "Enter Node Name [default: $DEFAULT_NAME]: " INPUT_NAME
NODE_NAME="${INPUT_NAME:-$DEFAULT_NAME}"

# Save config
mkdir -p data
cat <<EOF > data/config.json
{
  "server_url": "$SERVER_URL",
  "node_name": "$NODE_NAME"
}
EOF

echo ""
echo "=========================================================="
echo " [✔] Installation Complete!"
echo " Server configured to: $SERVER_URL"
echo " Node name set to:     $NODE_NAME"
echo "=========================================================="
echo ""
echo "Starting GPU Node Agent now..."
echo ""

# 5. Launch the application
bash "$DIR/run-agent-app.sh"
