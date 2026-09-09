#!/bin/bash
set -e
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

echo "======================================================"
echo "   P2P GPU Node Agent — Application Launcher"
echo "======================================================"
echo ""

if ! command -v python3 &> /dev/null; then
    echo "[ERROR] python3 could not be found. Please install Python 3.10+"
    exit 1
fi

echo "Checking dependencies..."
python3 -m pip install -q -r requirements.txt --break-system-packages 2>/dev/null || python3 -m pip install -q -r requirements.txt 2>/dev/null || true

echo "Starting application..."
python3 app.py "$@"
