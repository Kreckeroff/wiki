#!/usr/bin/env python3
"""Generate the web token layer from the shared Wiki design tokens."""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TOKENS = ROOT / "design" / "tokens.json"
OUTPUT = ROOT / "app" / "src" / "tokens.css"


def kebab(value: str) -> str:
    return re.sub(r"(?<!^)(?=[A-Z])", "-", value).lower()


def main() -> None:
    data = json.loads(TOKENS.read_text())
    lines = [
        "/* Generated from design/tokens.json. Run python design/scripts/sync_tokens.py. */",
        ":root {",
        f"  --wiki-font-family: '{data['font']['family']}', sans-serif;",
        f"  --wiki-font-mono: {data['font']['mono']};",
    ]
    for name, value in data["colors"].items():
        lines.append(f"  --wiki-color-{kebab(name)}: #{value};")
    for name, values in data["typography"].items():
        token = kebab(name)
        lines.extend([
            f"  --wiki-type-{token}-size: {values['size']}px;",
            f"  --wiki-type-{token}-line: {values['line']}px;",
            f"  --wiki-type-{token}-weight: {values['cssWeight']};",
        ])
    for category in ("space", "radius", "size"):
        for name, value in data[category].items():
            lines.append(f"  --wiki-{category}-{kebab(name)}: {value}px;")
    for name in ("fast", "normal", "slow"):
        lines.append(f"  --wiki-motion-{name}: {data['motion'][name]}ms;")
    lines.append(f"  --wiki-motion-easing: {data['motion']['easing']};")
    lines.extend([
        "  --wiki-shadow-menu: 0 12px 32px #24272424;",
        "  --wiki-shadow-dialog: 0 20px 64px #2427242e;",
        "",
        "  /* Compatibility aliases for the existing application styles. */",
        "  --ink: var(--wiki-color-ink);",
        "  --muted: var(--wiki-color-muted);",
        "  --faint: var(--wiki-color-faint);",
        "  --paper: var(--wiki-color-paper);",
        "  --ground: var(--wiki-color-canvas);",
        "  --sidebar: var(--wiki-color-sidebar);",
        "  --line: var(--wiki-color-line);",
        "  --accent: var(--wiki-color-accent);",
        "  --accent-dark: var(--wiki-color-accent-dark);",
        "  --accent-soft: var(--wiki-color-accent-soft);",
        "  --danger: var(--wiki-color-danger);",
        "}",
        "",
    ])
    OUTPUT.write_text("\n".join(lines))
    print(f"Wrote {OUTPUT}")


if __name__ == "__main__":
    main()
