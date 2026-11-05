#!/usr/bin/env python3
"""Build the four Wiki mockups in the current Figma Desktop file via local MCP."""

import base64
import json
import math
import os
import select
import subprocess
import time
import urllib.request
from pathlib import Path

REPO = Path("/Users/kreckeroff/wiki/integrations/figma-mcp")
ENTRY = REPO / "mcp-server/dist/index.js"
OUT = Path("/Users/kreckeroff/wiki/design/figma/exports")
OUT.mkdir(parents=True, exist_ok=True)


def oklch(l, c, h):
    a, b = c * math.cos(math.radians(h)), c * math.sin(math.radians(h))
    lp, mp, sp = l + 0.3963377774 * a + 0.2158037573 * b, l - 0.1055613458 * a - 0.0638541728 * b, l - 0.0894841775 * a - 1.291485548 * b
    l3, m3, s3 = lp ** 3, mp ** 3, sp ** 3
    rgb = [
        4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
        -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
        -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
    ]
    def gamma(v):
        v = 12.92 * v if v <= 0.0031308 else 1.055 * (max(v, 0) ** (1 / 2.4)) - 0.055
        return max(0, min(1, v))
    return {"r": gamma(rgb[0]), "g": gamma(rgb[1]), "b": gamma(rgb[2])}


def hexcolor(value):
    value = value.lstrip("#")
    return {"r": int(value[0:2], 16) / 255, "g": int(value[2:4], 16) / 255, "b": int(value[4:6], 16) / 255}


INK = oklch(.25, .018, 155)
PROSE = oklch(.29, .018, 155)
MUTED = oklch(.49, .018, 155)
PAPER = oklch(.995, .003, 105)
GROUND = oklch(.975, .006, 105)
SIDEBAR = oklch(.955, .008, 105)
LINE = oklch(.89, .009, 105)
CONTROL = oklch(.60, .015, 155)
ACCENT = oklch(.47, .09, 157)
ACCENT_DARK = oklch(.39, .08, 157)
ACCENT_SOFT = oklch(.93, .025, 157)
AUTH_BG = oklch(.285, .055, 158)
AUTH_TEXT = oklch(.96, .015, 157)
AUTH_SECONDARY = oklch(.88, .02, 157)
AUTH_OVERLINE = oklch(.82, .04, 157)
BRAND_LIGHT = oklch(.82, .09, 157)
WHITE = oklch(.99, .005, 155)
DARK = oklch(.2, .02, 155)


def paint(color, opacity=None):
    result = {"type": "SOLID", "color": color}
    if opacity is not None:
        result["opacity"] = opacity
    return result


def style(fill=None, stroke=None, radius=None, opacity=None, stroke_weight=1):
    result = {}
    if fill is not None:
        result["fills"] = [] if fill == [] else [paint(fill)] if not isinstance(fill, list) else fill
    if stroke is not None:
        result["strokes"] = [paint(stroke)]
        result["strokeWeight"] = stroke_weight
    if radius is not None:
        result["cornerRadius"] = radius
    if opacity is not None:
        result["opacity"] = opacity
    return result


def rect(parent, name, x, y, w, h, fill=None, stroke=None, radius=None, opacity=None):
    return {"command": "CREATE_RECTANGLE", "payload": {"parentId": parent, "name": name, "x": x, "y": y, "width": w, "height": h, "style": style(fill, stroke, radius, opacity)}}


def text(parent, name, chars, x, y, w, h, size=13, color=INK, family="Onest", font_style="Regular"):
    return {"command": "CREATE_TEXT", "payload": {"parentId": parent, "name": name, "characters": chars, "x": x, "y": y, "width": w, "height": h, "fontFamily": family, "fontStyle": font_style, "fontSize": size, "style": style(color)}}


def auto(parent, name, x, y, w, h, fill=None, stroke=None, radius=None, spacing=8, padding=(0, 0, 0, 0)):
    top, right, bottom, left = padding
    layout = {"layoutMode": "HORIZONTAL", "primaryAxisSizingMode": "FIXED", "counterAxisSizingMode": "FIXED", "primaryAxisAlignItems": "CENTER", "counterAxisAlignItems": "CENTER", "itemSpacing": spacing, "paddingTop": top, "paddingRight": right, "paddingBottom": bottom, "paddingLeft": left}
    return {"command": "CREATE_AUTOLAYOUT", "payload": {"parentId": parent, "name": name, "x": x, "y": y, "width": w, "height": h, "layout": layout, "style": style(fill, stroke, radius)}}


ICONS = {
    "plus": "M9 3 L9 15 M3 9 L15 9",
    "check": "M3 9 L7 13 L15 4",
    "chevron": "M4 6 L9 11 L14 6",
    "folder": "M2 5 Q2 3 4 3 L7 3 L9 5 L15 5 Q17 5 17 7 L17 15 Q17 17 15 17 L4 17 Q2 17 2 15 Z",
    "file": "M10 1 L4 1 Q2 1 2 3 L2 16 Q2 18 4 18 L14 18 Q16 18 16 16 L16 7 Z M10 1 L10 7 L16 7 M5 11 L13 11 M5 14 L11 14",
    "stack": "M6 6 L16 6 L16 16 L6 16 Z M12 6 L12 4 Q12 2 10 2 L4 2 Q2 2 2 4 L2 11 Q2 13 4 13 L6 13",
    "more": "M3 9 L3 9 M9 9 L9 9 M15 9 L15 9",
    "lock": "M3 8 L15 8 Q16 8 16 9 L16 17 Q16 18 15 18 L3 18 Q2 18 2 17 L2 9 Q2 8 3 8 Z M5 8 L5 5 Q5 1 9 1 Q13 1 13 5 L13 8 M9 12 L9 15",
    "arrow": "M2 9 L16 9 M11 4 L16 9 L11 14",
    "cloud": "M14 15 L5 15 Q1 15 1 11 Q1 8 4 7 Q5 2 10 3 Q14 3 14 7 Q18 8 17 12 Q17 15 14 15 Z M6 11 L8 13 L12 9",
    "download": "M9 1 L9 12 M4 8 L9 13 L14 8 M2 17 L16 17",
    "menu": "M2 4 L16 4 M2 9 L16 9 M2 14 L16 14",
    "close": "M3 3 L15 15 M15 3 L3 15",
    "bold": "M5 2 L10 2 Q14 2 14 6 Q14 9 10 9 L5 9 Z M5 9 L11 9 Q15 9 15 13 Q15 17 11 17 L5 17 Z M5 2 L5 17",
    "italic": "M7 2 L15 2 M3 16 L11 16 M11 2 L7 16",
    "strike": "M14 3 L6 3 Q3 3 3 6 Q3 9 6 9 L11 9 Q14 9 14 12 Q14 15 11 15 L3 15 M1 9 L17 9",
    "code": "M6 6 L2 9 L6 12 M12 6 L16 9 L12 12 M10 3 L8 15",
    "list": "M6 4 L16 4 M6 9 L16 9 M6 14 L16 14 M2 4 L2 4 M2 9 L2 9 M2 14 L2 14",
    "ordered": "M7 4 L16 4 M7 9 L16 9 M7 14 L16 14 M2 2 L4 2 L4 6 M2 6 L5 6 M2 11 Q5 9 5 12 L2 16 L5 16",
    "quote": "M2 12 Q2 16 6 16 L6 8 L2 8 L2 3 L6 3 L6 8 M10 12 Q10 16 14 16 L14 8 L10 8 L10 3 L14 3 L14 8",
    "link": "M7 10 Q10 14 13 11 L16 8 Q18 4 14 2 L10 5 M11 8 Q8 4 5 7 L2 10 Q0 14 4 16 L8 13",
    "table": "M2 3 L16 3 L16 16 L2 16 Z M2 8 L16 8 M7 3 L7 16 M12 3 L12 16",
    "minus": "M2 9 L16 9",
}


def icon(parent, name, x, y, color=MUTED, kind=None, scale=1):
    path = ICONS[kind or name]
    return {"command": "CREATE_NODE", "payload": {"parentId": parent, "createMethod": "createVector", "properties": {"name": f"Icon / {name}", "x": x, "y": y, "vectorPaths": [{"windingRule": "NONZERO", "data": path}], "fills": [], "strokes": [paint(color)], "strokeWeight": 1.5 * scale, "strokeCap": "ROUND", "strokeJoin": "ROUND"}}}


class MCP:
    def __init__(self):
        self.proc = subprocess.Popen(["node", str(ENTRY)], cwd=REPO, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1)
        self.next_id = 1

    def send(self, method, params=None, notification=False):
        message = {"jsonrpc": "2.0", "method": method}
        if params is not None:
            message["params"] = params
        if not notification:
            message["id"] = self.next_id
            self.next_id += 1
        self.proc.stdin.write(json.dumps(message, ensure_ascii=False) + "\n")
        self.proc.stdin.flush()
        return message.get("id")

    def receive(self, request_id, timeout=180):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            readable, _, _ = select.select([self.proc.stdout], [], [], max(0, deadline - time.monotonic()))
            if not readable:
                break
            line = self.proc.stdout.readline()
            if not line:
                raise RuntimeError("MCP closed stdout")
            message = json.loads(line)
            if message.get("id") == request_id:
                if "error" in message:
                    raise RuntimeError(message["error"])
                return message["result"]
        raise TimeoutError(f"MCP response {request_id} timed out")

    def rpc(self, method, params=None):
        request_id = self.send(method, params)
        return self.receive(request_id)

    def connect(self):
        self.rpc("initialize", {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "wiki-mockup-builder", "version": "1.0.0"}})
        self.send("notifications/initialized", notification=True)
        deadline = time.monotonic() + 30
        launched = False
        while time.monotonic() < deadline:
            try:
                with urllib.request.urlopen("http://127.0.0.1:3333/health", timeout=2) as response:
                    health = json.load(response)
                if health.get("pluginConnected"):
                    return
                if not launched and time.monotonic() > deadline - 25:
                    subprocess.run(["osascript", "-e", 'tell application "Figma" to activate', "-e", "delay 0.5", "-e", 'tell application "System Events" to tell process "Figma" to click menu item "Custom Figma MCP Bridge" of menu 1 of menu item "Development" of menu 1 of menu bar item "Plugins" of menu bar 1'], check=True, stdout=subprocess.DEVNULL)
                    launched = True
            except Exception:
                pass
            time.sleep(.5)
        raise RuntimeError("Figma Desktop did not connect")

    def tool(self, name, arguments):
        response = self.rpc("tools/call", {"name": name, "arguments": arguments})
        content = response.get("content", [])
        if not content:
            raise RuntimeError(f"Empty response from {name}")
        data = json.loads(content[0]["text"])
        if response.get("isError") or not data.get("success"):
            raise RuntimeError(f"{name}: {json.dumps(data, ensure_ascii=False)}")
        return data["result"]

    def batch(self, operations):
        if not operations:
            return []
        if len(operations) > 100:
            raise ValueError("Batch exceeds 100 operations")
        result = self.tool("figma.batch_operations", {"operations": operations, "continueOnError": False, "transactional": True, "rollbackOnError": True})
        if result.get("rolledBack") or any(not item.get("success") for item in result["results"]):
            raise RuntimeError("Batch failed: " + json.dumps(result, ensure_ascii=False))
        return result["results"]

    def close(self):
        if self.proc.stdin:
            self.proc.stdin.close()
        try:
            self.proc.terminate()
            self.proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.proc.kill()
            self.proc.wait(timeout=5)


def sidebar_ops(parent, mobile=False, close=False):
    width = 288 if mobile else 272
    row_h = 44 if mobile else 34
    ops = [rect(parent, "Sidebar / background", 0, 0, width, 812 if mobile else 900, SIDEBAR), rect(parent, "Sidebar / divider", width - 1, 0, 1, 812 if mobile else 900, LINE)]
    ops += [rect(parent, "Brand / mark", 16, 14, 27, 27, ACCENT, radius=6), icon(parent, "stack", 21, 19, PAPER), text(parent, "Brand / wiki", "wiki", 51, 16, 40, 26, 19, INK, font_style="Bold"), text(parent, "Brand / edition", "рабочее место", 91, 22, 105, 18, 10, MUTED)]
    if close:
        ops += [icon(parent, "close", 249, 19, MUTED)]
    button_h = 44 if mobile else 36
    button_w = 214 if mobile else 206
    ops += [auto(parent, "Action / New page", 12, 56, button_w, button_h, PAPER, CONTROL, 7, 7), icon(parent, "plus", 27 if not mobile else 30, 65 if not mobile else 69, INK), text(parent, "Action / label", "Новая страница", 52 if not mobile else 54, 65 if not mobile else 68, 130, 22, 13, INK, font_style="Medium"), icon(parent, "folder", 225 if not mobile else 243, 65 if not mobile else 69, MUTED)]
    caption_y = 118 if mobile else 108
    ops += [text(parent, "Tree / caption", "СТРАНИЦЫ", 20, caption_y, 100, 16, 11, MUTED, font_style="Medium"), text(parent, "Tree / count", "6", width - 28, caption_y, 12, 16, 11, MUTED, font_style="Medium")]
    start_y = 140 if mobile else 126
    rows = [("Продукт", "folder", True, 0), ("Запуск продукта", "rocket", False, 1), ("Требования", "file", False, 1), ("Исследование", "file", False, 1), ("Команда", "folder", True, 0), ("Регламенты", "file", False, 1)]
    for index, (title, kind, disclosure, depth) in enumerate(rows):
        y = start_y + index * row_h
        selected = title == "Запуск продукта"
        if selected:
            ops.append(rect(parent, "Tree / selected row", 8, y, width - 16, row_h, ACCENT_SOFT, radius=6))
        x = 8 + depth * 14
        if disclosure:
            ops.append(icon(parent, "chevron", x + (13 if mobile else 5), y + (15 if mobile else 10), MUTED))
        icon_x = x + (44 if mobile else 24)
        if kind == "rocket":
            ops.append(text(parent, "Tree / rocket", "🚀", icon_x, y + (10 if mobile else 7), 20, 24, 15, MUTED))
        else:
            ops.append(icon(parent, kind, icon_x + (2 if mobile else 1), y + (13 if mobile else 9), ACCENT_DARK if selected else MUTED))
        ops.append(text(parent, f"Tree / {title}", title, icon_x + 25, y + (12 if mobile else 8), 145 if mobile else 140, 24, 13, ACCENT_DARK if selected else INK))
        ops.append(icon(parent, "plus", width - 38, y + (15 if mobile else 10), MUTED))
    bottom_y = 750 if mobile else 838
    ops += [rect(parent, "Workspace / divider", 0, bottom_y, width, 1, LINE), rect(parent, "Workspace / avatar", 16, bottom_y + 15, 31, 31, ACCENT, radius=7), text(parent, "Workspace / initial", "К", 25, bottom_y + 20, 15, 20, 13, PAPER, font_style="Bold"), text(parent, "Workspace / name", "Команда", 56, bottom_y + 13, 100, 18, 12, INK, font_style="Medium"), text(parent, "Workspace / email", "you@example.com", 56, bottom_y + 31, 130, 16, 10, MUTED), icon(parent, "more", width - 34, bottom_y + 23, MUTED)]
    return ops


def toolbar_ops(parent, x, y, mobile=False):
    size = 44 if mobile else 31
    ops = [rect(parent, "Toolbar / top rule", x, y, 335 if mobile else 760, 1, LINE), rect(parent, "Toolbar / bottom rule", x, y + (57 if mobile else 44), 335 if mobile else 760, 1, LINE), rect(parent, "Toolbar / active", x, y + 6, size, size, ACCENT_SOFT, radius=5)]
    kinds = ["bold", "italic", "strike", "code"]
    cursor = x
    for kind in kinds:
        ops.append(icon(parent, kind, cursor + (13 if mobile else 7), y + (19 if mobile else 13), ACCENT_DARK if kind == "bold" else MUTED))
        cursor += size + 2
    ops.append(rect(parent, "Toolbar / separator 1", cursor + 3, y + (18 if mobile else 12), 1, 18, LINE))
    cursor += 9
    for label in ["H1", "H2", "H3"]:
        ops.append(text(parent, f"Toolbar / {label}", label, cursor + (12 if mobile else 6), y + (18 if mobile else 12), 24, 24, 15, MUTED, font_style="Bold"))
        cursor += size + 2
    if not mobile:
        ops.append(rect(parent, "Toolbar / separator 2", cursor + 3, y + 12, 1, 18, LINE))
        cursor += 9
        for kind in ["list", "ordered", "quote", "link"]:
            ops.append(icon(parent, kind, cursor + 7, y + 13, MUTED))
            cursor += size + 2
        ops.append(rect(parent, "Toolbar / separator 3", cursor + 3, y + 12, 1, 18, LINE))
        cursor += 9
        for kind in ["table", "minus"]:
            ops.append(icon(parent, kind, cursor + 7, y + 13, MUTED))
            cursor += size + 2
    return ops


def mobile_editor_ops(parent, panel=False):
    ops = [rect(parent, "Editor / background", 0, 0, 375, 812, PAPER), rect(parent, "Topbar / divider", 0, 51, 375, 1, LINE), icon(parent, "menu", 19, 17, INK), text(parent, "Breadcrumb", "Запуск продукта", 54, 17, 160, 22, 12, MUTED), icon(parent, "cloud", 221, 18, ACCENT_DARK), rect(parent, "Presence / avatar", 251, 13, 25, 25, hexcolor("657f71"), stroke=PAPER, radius=20), text(parent, "Presence / initials", "АК", 255, 18, 20, 14, 8, PAPER, font_style="Bold"), rect(parent, "Export / touch target", 325, 4, 44, 44, PAPER, CONTROL, 6), icon(parent, "download", 338, 17, MUTED)]
    ops += [text(parent, "Page / icon", "🚀", 20, 82, 60, 58, 46, INK), text(parent, "Page / title", "Запуск продукта", 20, 145, 335, 44, 32, INK, font_style="Bold")]
    if panel:
        ops += [rect(parent, "Toolbar / empty top", 20, 207, 335, 1, LINE), rect(parent, "Toolbar / empty bottom", 20, 250, 335, 1, LINE), text(parent, "Page / intro", "Первая версия объединяет работу команды в одном\nспокойном пространстве. Здесь страница — основная\nединица работы.", 20, 278, 335, 90, 17, PROSE, "PT Serif")]
    else:
        ops += toolbar_ops(parent, 20, 207, True)
        ops += [text(parent, "Page / intro", "Первая версия объединяет работу команды в одном\nспокойном пространстве. Здесь страница — основная\nединица работы, а проект помогает собрать страницы\nпо смыслу.", 20, 286, 335, 118, 17, PROSE, "PT Serif"), text(parent, "Page / heading", "Что входит в запуск", 20, 463, 335, 32, 23, INK, font_style="Bold"), text(parent, "Page / bullet 1", "•  Дерево страниц с вложенностью\n   и перетаскиванием.", 20, 512, 335, 58, 17, PROSE, "PT Serif"), text(parent, "Page / bullet 2", "•  Полный Markdown и привычное\n   форматирование.", 20, 574, 335, 58, 17, PROSE, "PT Serif")]
    return ops


def main():
    mcp = MCP()
    top_ids = []
    try:
        mcp.connect()
        document = mcp.tool("figma.get_document", {})
        if any(child.get("name", "").startswith(("01 · Wiki", "02 · Wiki", "03 · Wiki", "04 · Wiki", "Wiki / Components")) for page in document["pages"] for child in page.get("children", [])):
            raise RuntimeError("Wiki mockups already exist; refusing to duplicate them")

        roots = [
            ("01 · Wiki / Вход / Desktop", 0, 0, 1440, 900),
            ("02 · Wiki / Редактор / Desktop", 1520, 0, 1440, 900),
            ("03 · Wiki / Редактор / Mobile", 0, 1000, 375, 812),
            ("04 · Wiki / Открытая панель / Mobile", 455, 1000, 375, 812),
        ]
        operations = [{"command": "CREATE_FRAME", "payload": {"name": name, "x": x, "y": y, "width": w, "height": h, "style": style(PAPER)}} for name, x, y, w, h in roots]
        operations.append({"command": "CREATE_COMPONENT", "payload": {"name": "Wiki / Components / Primary button", "x": 3040, "y": 0, "width": 174, "height": 44, "layout": {"layoutMode": "HORIZONTAL", "primaryAxisSizingMode": "FIXED", "counterAxisSizingMode": "FIXED", "primaryAxisAlignItems": "CENTER", "counterAxisAlignItems": "CENTER", "itemSpacing": 8}, "style": style(ACCENT, ACCENT, 8)}})
        results = mcp.batch(operations)
        top_ids = [item["result"]["node"]["id"] for item in results]
        auth, desktop, mobile, panel, component = top_ids

        # Component contents and its instance on the auth screen.
        mcp.batch([icon(component, "arrow", 0, 0, WHITE), text(component, "Button / label", "Войти в wiki", 0, 0, 100, 24, 15, WHITE, font_style="Medium")])
        instance_result = mcp.tool("figma.call_api", {"target": "node", "nodeId": component, "method": "createInstance", "args": []})
        instance_id = instance_result["createdNodeIds"][0]
        mcp.batch([{"command": "MOVE_NODE", "payload": {"nodeId": instance_id, "parentId": auth, "x": 844, "y": 618}}, {"command": "RESIZE_NODE", "payload": {"nodeId": instance_id, "width": 400, "height": 44}}])

        # 01 — Auth.
        ops = [rect(auth, "Auth / story", 0, 0, 648, 900, AUTH_BG), rect(auth, "Auth / orbit inner", 408, 540, 420, 420, [], BRAND_LIGHT, 210, .35), rect(auth, "Auth / orbit middle", 352, 484, 532, 532, [], BRAND_LIGHT, 266, .12), rect(auth, "Auth / orbit outer", 296, 428, 644, 644, [], BRAND_LIGHT, 322, .08)]
        for x, y, h in [(86, 96, 21), (112, 87, 30), (138, 101, 16)]:
            ops.append(rect(auth, "Brand / bar", x, y, 17, h, BRAND_LIGHT, radius=2))
        ops += [text(auth, "Story / overline", "МЕСТО ДЛЯ ВАШИХ ЗНАНИЙ", 86, 260, 400, 20, 13, AUTH_OVERLINE, font_style="Medium"), text(auth, "Story / title", "Мысли\nстановятся\nобщей работой.", 86, 306, 500, 210, 62, AUTH_TEXT, "PT Serif"), text(auth, "Story / description", "Страницы, проекты и живой Markdown —\nв одном спокойном редакторе.", 86, 548, 440, 66, 17, AUTH_SECONDARY)]
        for x, label, w in [(86, "Живые правки", 110), (216, "Полный Markdown", 140), (376, "Ваши данные", 110)]:
            ops += [icon(auth, "check", x, 792, AUTH_SECONDARY), text(auth, f"Proof / {label}", label, x + 23, 790, w, 22, 13, AUTH_SECONDARY)]
        ops += [rect(auth, "Form / lock background", 844, 192, 42, 42, GROUND, LINE, 10), icon(auth, "lock", 856, 204, ACCENT_DARK), text(auth, "Form / title", "С возвращением", 844, 256, 400, 38, 29, INK, font_style="Medium"), text(auth, "Form / subtitle", "Продолжите с того места, где остановились.", 844, 300, 400, 24, 14, MUTED), rect(auth, "Tabs / background", 844, 348, 400, 46, GROUND, radius=9), rect(auth, "Tabs / selected", 848, 352, 194, 38, PAPER, radius=6), text(auth, "Tabs / login", "Войти", 915, 361, 60, 22, 14, INK), text(auth, "Tabs / register", "Регистрация", 1070, 361, 110, 22, 14, MUTED), text(auth, "Field / email label", "Почта", 844, 420, 400, 20, 13, INK, font_style="Medium"), rect(auth, "Field / email", 844, 442, 400, 48, PAPER, CONTROL, 8), text(auth, "Field / email placeholder", "you@example.com", 858, 455, 360, 24, 15, MUTED), text(auth, "Field / password label", "Пароль", 844, 511, 400, 20, 13, INK, font_style="Medium"), rect(auth, "Field / password", 844, 533, 400, 48, PAPER, CONTROL, 8), text(auth, "Field / password placeholder", "Ваш пароль", 858, 546, 360, 24, 15, MUTED), text(auth, "Form / footnote", "Ваши страницы доступны только участникам workspace.", 844, 688, 400, 20, 12, MUTED)]
        mcp.batch(ops)

        # 02 — Desktop editor.
        ops = sidebar_ops(desktop)
        ops += [rect(desktop, "Topbar / divider", 272, 51, 1168, 1, LINE), text(desktop, "Breadcrumb / project", "Продукт", 290, 17, 60, 20, 12, MUTED), text(desktop, "Breadcrumb / slash", "/", 354, 17, 10, 20, 12, MUTED), text(desktop, "Breadcrumb / page", "Запуск продукта", 370, 17, 150, 20, 12, MUTED), icon(desktop, "cloud", 1158, 18, ACCENT_DARK), text(desktop, "Save / label", "Сохранено", 1180, 17, 70, 20, 11, ACCENT_DARK), rect(desktop, "Presence / AK", 1264, 13, 26, 26, hexcolor("657f71"), stroke=PAPER, radius=20), text(desktop, "Presence / AK text", "АК", 1268, 19, 20, 14, 9, PAPER, font_style="Bold"), rect(desktop, "Presence / MS", 1284, 13, 26, 26, hexcolor("876c56"), stroke=PAPER, radius=20), text(desktop, "Presence / MS text", "МС", 1288, 19, 20, 14, 9, PAPER, font_style="Bold"), rect(desktop, "Export / button", 1324, 10, 98, 32, PAPER, CONTROL, 6), icon(desktop, "download", 1334, 17, MUTED), text(desktop, "Export / label", "Markdown", 1355, 16, 62, 20, 11, MUTED)]
        ops += [text(desktop, "Page / icon", "🚀", 381, 142, 70, 66, 52, INK), text(desktop, "Page / title", "Запуск продукта", 381, 212, 760, 56, 40, INK, font_style="Bold")]
        ops += toolbar_ops(desktop, 381, 293)
        ops += [text(desktop, "Page / intro", "Первая версия объединяет работу команды в одном спокойном пространстве. Здесь\nстраница — основная единица работы, а проект помогает собрать страницы по смыслу.", 381, 362, 760, 66, 18, PROSE, "PT Serif"), text(desktop, "Page / heading", "Что входит в запуск", 381, 460, 760, 34, 25, INK, font_style="Bold"), text(desktop, "Page / bullet 1", "•  Дерево страниц с вложенностью и перетаскиванием.", 381, 514, 760, 32, 18, PROSE, "PT Serif"), text(desktop, "Page / bullet 2", "•  Полный Markdown и привычное форматирование.", 381, 548, 760, 32, 18, PROSE, "PT Serif"), text(desktop, "Page / bullet 3 marker", "•  ", 381, 582, 24, 32, 18, PROSE, "PT Serif"), text(desktop, "Page / bullet 3 emphasis", "Живые правки", 404, 582, 140, 32, 18, PROSE, "PT Serif", "Bold"), text(desktop, "Page / bullet 3 suffix", " второго участника без перезагрузки.", 540, 582, 601, 32, 18, PROSE, "PT Serif"), text(desktop, "Page / empty state", "Начните писать или введите «/», чтобы добавить новый блок.", 381, 644, 760, 34, 18, PROSE, "PT Serif"), text(desktop, "Outline / caption", "НА ЭТОЙ СТРАНИЦЕ", 1254, 82, 170, 18, 11, MUTED, font_style="Medium"), text(desktop, "Outline / link 1", "Что входит в запуск", 1254, 116, 170, 20, 11, MUTED), text(desktop, "Outline / link 2", "Первый сценарий", 1264, 142, 160, 20, 11, MUTED), rect(desktop, "Outline / divider", 1254, 190, 166, 1, LINE), icon(desktop, "cloud", 1254, 207, ACCENT_DARK), text(desktop, "Outline / online", "Онлайн · 2", 1275, 205, 100, 20, 11, ACCENT_DARK)]
        mcp.batch(ops)

        # 03 — Mobile editor.
        mcp.batch(mobile_editor_ops(mobile))

        # 04 — Editor context, dimming and open mobile sidebar.
        ops = mobile_editor_ops(panel, True)
        ops.append(rect(panel, "Sidebar / backdrop", 0, 0, 375, 812, DARK, opacity=.28))
        ops += sidebar_ops(panel, True, True)
        mcp.batch(ops)

        # Select the desktop editor and export all four states for verification.
        mcp.tool("figma.call_api", {"target": "currentPage", "method": "setSelection", "args": [[{"__nodeRef": desktop}]]}) if False else None
        for name, node_id, scale in [("01-auth", auth, .5), ("02-editor-desktop", desktop, .5), ("03-editor-mobile", mobile, 1), ("04-panel-mobile", panel, 1)]:
            exported = mcp.tool("figma.export_node", {"nodeId": node_id, "format": "PNG", "scale": scale})
            (OUT / f"{name}.png").write_bytes(base64.b64decode(exported["base64"]))
        print(json.dumps({"ok": True, "document": document["name"], "frames": dict(zip([r[0] for r in roots], top_ids[:4])), "component": component, "exports": [str(p) for p in sorted(OUT.glob('*.png'))]}, ensure_ascii=False, indent=2))
    except Exception:
        if top_ids:
            try:
                mcp.batch([{"command": "DELETE_NODE", "payload": {"nodeId": node_id, "hardDelete": True}} for node_id in top_ids])
            except Exception:
                pass
        raise
    finally:
        mcp.close()


if __name__ == "__main__":
    main()
