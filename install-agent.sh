#!/bin/bash
set -e

echo "Downloading GPU Node Agent from repository..."

# Use sparse checkout to ONLY download the agent folder efficiently
git clone --quiet --depth 1 --filter=blob:none --sparse https://github.com/em25mtech11008-glitch/Resource-Sharing-Platform.git .temp-agent-repo
cd .temp-agent-repo
git sparse-checkout set agent --quiet
cd ..

# Move the agent folder out and clean up the temp repo
mv .temp-agent-repo/agent ./gpu-node-agent
rm -rf .temp-agent-repo

echo "✅ Download complete! The agent is in the 'gpu-node-agent' folder."
echo ""
echo "Next steps for Ubuntu/Linux users:"
echo "  cd gpu-node-agent"
echo "  bash build-ubuntu.sh"
