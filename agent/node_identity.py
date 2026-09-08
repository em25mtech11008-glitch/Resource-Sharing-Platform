import os
import json
import uuid
import logging
from typing import Tuple

logger = logging.getLogger("GPU-Agent.Identity")

def get_or_create_node_id(data_dir: str = "data") -> Tuple[str, bool]:
    """
    Retrieves the persistent node_id from disk, or generates and saves a new one.
    Returns (node_id, is_newly_created).
    """
    os.makedirs(data_dir, exist_ok=True)
    identity_file = os.path.join(data_dir, "node_id.json")

    # Attempt to read existing identity
    if os.path.isfile(identity_file):
        try:
            with open(identity_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                node_id = data.get("node_id")
                if node_id and isinstance(node_id, str) and len(node_id) > 8:
                    logger.info(f"Loaded persistent Node ID from disk: {node_id}")
                    return node_id, False
        except Exception as e:
            logger.warning(f"Failed to read existing identity file ({e}). A new identity will be generated.")

    # Generate new persistent ID
    node_id = f"node-{uuid.uuid4()}"
    identity_data = {
        "node_id": node_id,
        "created_at": os.popen("date -u +%Y-%m-%dT%H:%M:%SZ").read().strip() if os.name != "nt" else "",
    }

    # Write atomically
    temp_file = f"{identity_file}.tmp"
    with open(temp_file, "w", encoding="utf-8") as f:
        json.dump(identity_data, f, indent=2)
    os.replace(temp_file, identity_file)

    logger.info(f"Generated and saved new persistent Node ID: {node_id}")
    return node_id, True
