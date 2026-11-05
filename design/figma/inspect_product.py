#!/usr/bin/env python3
"""Read the current Wiki Figma product page and design-system inventory."""

import json
from build_mockups import MCP

PAGE_ID = "1:287"

mcp = MCP()
try:
    mcp.connect()
    document = mcp.tool("figma.get_document", {})
    page = mcp.tool("figma.get_node", {"nodeId": PAGE_ID})
    variables = mcp.tool("figma.list_variables", {})
    styles = mcp.tool("figma.list_styles", {})
    node = page.get("node", page)
    print(json.dumps({
        "pages": [{"id": item["id"], "name": item["name"]} for item in document["pages"]],
        "productPage": {
            "id": node["id"],
            "name": node["name"],
            "children": [
                {"id": item["id"], "name": item["name"], "type": item["type"]}
                for item in node.get("children", [])
                if item["type"] in {"COMPONENT", "COMPONENT_SET", "FRAME"}
            ],
        },
        "collections": [
            {"id": item["id"], "name": item["name"], "count": len(item["variableIds"])}
            for item in variables["collections"]
        ],
        "variables": [
            {"id": item["id"], "name": item["name"], "collection": item["variableCollectionId"], "scopes": item.get("scopes")}
            for item in variables["variables"]
            if item["variableCollectionId"] == "VariableCollectionId:1:262"
        ],
        "textStyles": [{"id": item["id"], "name": item["name"]} for item in styles["text"] if item["name"].startswith("Wiki /")],
    }, ensure_ascii=False, indent=2))
finally:
    mcp.close()
