#!/usr/bin/env python3
"""Remove selected product frames so build_product.py can rebuild them safely."""

import json
import sys

from build_mockups import MCP
from build_product import STATE_PATH, save_state


def main():
    prefixes = sys.argv[1:]
    if not prefixes:
        raise SystemExit("Usage: python design/figma/rebuild_screens.py P16 P17")
    state = json.loads(STATE_PATH.read_text())
    mcp = MCP()
    try:
        mcp.connect()
        for prefix in prefixes:
            name = next(name for name in state["frames"] if name.startswith(prefix))
            mcp.tool("figma.call_api", {"target": "node", "nodeId": state["frames"][name], "method": "remove", "args": []})
            del state["frames"][name]
            state["completed"] = [item for item in state["completed"] if item != name]
            save_state(state)
            print(f"removed {name}", flush=True)
    finally:
        mcp.close()


if __name__ == "__main__":
    main()
