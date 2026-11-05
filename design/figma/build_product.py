#!/usr/bin/env python3
"""Build a coherent full-product Wiki design proposal in the open Figma file."""

import base64
import json
from pathlib import Path

from build_mockups import MCP, ICONS

ROOT = Path("/Users/kreckeroff/wiki/design/figma")
STATE_PATH = ROOT / "product-state.json"
OUT = ROOT / "product-exports"
OUT.mkdir(parents=True, exist_ok=True)
PAGE_NAME = "02 · Product / Full scope"

TOKENS = json.loads((ROOT.parent / "tokens.json").read_text())
COLORS = TOKENS["colors"]
TYPE = {name: (values["size"], values["line"], values["weight"]) for name, values in TOKENS["typography"].items()}
SCOPES = {
    "paper": ["FRAME_FILL", "SHAPE_FILL"], "canvas": ["FRAME_FILL", "SHAPE_FILL"],
    "sidebar": ["FRAME_FILL", "SHAPE_FILL"], "ink": ["TEXT_FILL"], "muted": ["TEXT_FILL"],
    "faint": ["TEXT_FILL"], "line": ["STROKE_COLOR", "SHAPE_FILL"], "control": ["STROKE_COLOR"],
    "accent": ["FRAME_FILL", "SHAPE_FILL", "TEXT_FILL", "STROKE_COLOR"],
    "accentDark": ["TEXT_FILL"], "accentSoft": ["FRAME_FILL", "SHAPE_FILL"],
    "selection": ["FRAME_FILL", "SHAPE_FILL"], "danger": ["TEXT_FILL", "STROKE_COLOR"],
    "dangerSoft": ["FRAME_FILL", "SHAPE_FILL"], "warning": ["TEXT_FILL"], "info": ["TEXT_FILL"],
    "white": ["TEXT_FILL"], "backdrop": ["FRAME_FILL", "SHAPE_FILL"],
}
COLOR_IDS = {}
VALUE_IDS = {}
STYLE_IDS = {}
COMPONENTS = {}
PLACEMENTS = []
EARLY_PLACEMENTS = []


def rgb(value):
    return {"r": int(value[0:2], 16) / 255, "g": int(value[2:4], 16) / 255, "b": int(value[4:6], 16) / 255}


def paint(token, opacity=None):
    result = {"type": "SOLID", "color": rgb(COLORS[token])}
    if token in COLOR_IDS:
        result["boundVariables"] = {"color": {"type": "VARIABLE_ALIAS", "id": COLOR_IDS[token]}}
    if opacity is not None:
        result["opacity"] = opacity
    return result


def style(fill=None, stroke=None, radius=None, opacity=None):
    result = {}
    if fill is not None:
        result["fills"] = [] if fill == [] else [paint(fill)]
    if stroke:
        result["strokes"] = [paint(stroke)]
        result["strokeWeight"] = 1
    if radius is not None:
        result["cornerRadius"] = radius
    if opacity is not None:
        result["opacity"] = opacity
    return result


def rect(parent, name, x, y, w, h, fill="paper", stroke=None, radius=None, opacity=None):
    return {"command": "CREATE_RECTANGLE", "payload": {"parentId": parent, "name": name, "x": x, "y": y, "width": w, "height": h, "style": style(fill, stroke, radius, opacity)}}


def text(parent, name, chars, x, y, w, h=None, kind="Body", color="ink", align=None):
    size, line, weight = TYPE[kind]
    properties = {
        "name": name, "fontName": {"family": "Onest", "style": weight},
        "fontSize": size, "characters": chars, "fills": [paint(color)],
        "lineHeight": {"unit": "PIXELS", "value": line}, "textAutoResize": "HEIGHT",
    }
    if kind in STYLE_IDS:
        properties["textStyleId"] = STYLE_IDS[kind]
    if align:
        properties["textAlignHorizontal"] = align
    return {"command": "CREATE_NODE", "payload": {"parentId": parent, "createMethod": "createText", "properties": {**properties, "x": x, "y": y, "width": w, "height": h or line}}}


def icon(parent, name, x, y, color="muted", kind=None, size=18):
    path = ICONS[kind or name]
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 18 18" fill="none"><path d="{path}" stroke="#{COLORS[color]}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    return {"command": "CREATE_NODE", "payload": {"parentId": parent, "createMethod": "createNodeFromSvg", "args": [svg], "properties": {"name": f"Icon / {name}", "x": x, "y": y, "width": size, "height": size}}}


def line(parent, name, x, y, w, color="line"):
    return rect(parent, name, x, y, w, 1, color)


def place_component(component_name, parent, x, y, w, h, *labels):
    queue = EARLY_PLACEMENTS if component_name == "Dialog / Container" else PLACEMENTS
    queue.append((component_name, parent, x, y, w, h, labels))


def button(parent, label, x, y, w=140, primary=True):
    place_component("Button / Primary" if primary else "Button / Secondary", parent, x, y, w, 40, label)
    return []


def input_field(parent, label, value, x, y, w, h=40):
    ops = []
    if label:
        ops.append(text(parent, f"Field / {label}", label, x, y, w, 18, "SmallMedium"))
        y += 24
    place_component("Field / Input", parent, x, y, w, h, value)
    return ops


def place_nav(parent, label, x, y, w=236):
    PLACEMENTS.append(("Navigation / Active", parent, x, y, w, 36, label))


def api(mcp, target, method, args=None, **kwargs):
    return mcp.tool("figma.call_api", {"target": target, "method": method, "args": args or [], **kwargs}).get("result")


def set_prop(mcp, target, prop, value, **kwargs):
    return mcp.tool("figma.set_property", {"target": target, "property": prop, "value": value, **kwargs})


def save_state(state):
    STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n")


def batch(mcp, ops):
    for start in range(0, len(ops), 90):
        if ops[start:start + 90]:
            return mcp.batch(ops[start:start + 90])
    return []


def flush(mcp, ops):
    results = []
    for start in range(0, len(ops), 90):
        chunk = ops[start:start + 90]
        if chunk:
            results.extend(mcp.batch(chunk))
    return results


def flush_placements(mcp, queue=None):
    queue = PLACEMENTS if queue is None else queue
    while queue:
        component_name, parent, x, y, w, h, labels = queue.pop(0)
        component_id = COMPONENTS[component_name]
        created = mcp.tool("figma.call_api", {"target": "node", "nodeId": component_id, "method": "createInstance", "args": []})
        node_id = created["createdNodeIds"][0]
        mcp.batch([{"command": "MOVE_NODE", "payload": {"nodeId": node_id, "parentId": parent, "x": x, "y": y}}, {"command": "RESIZE_NODE", "payload": {"nodeId": node_id, "width": w, "height": h}}])
        result = mcp.tool("figma.get_node", {"nodeId": node_id})
        node = result.get("node", result)
        text_nodes = [child for child in node.get("children", []) if child.get("type") == "TEXT"]
        label_values = (labels,) if isinstance(labels, str) else labels
        for text_node, label in zip(text_nodes, label_values):
            mcp.tool("figma.set_property", {"target": "node", "nodeId": text_node["id"], "property": "textAutoResize", "value": "WIDTH_AND_HEIGHT"})
            mcp.batch([{"command": "UPDATE_NODE", "payload": {"nodeId": text_node["id"], "characters": label}}])


def foundations(mcp, page_id):
    existing = mcp.tool("figma.list_variables", {})
    collections = [item for item in existing["collections"] if item["name"] == "Wiki / Product"]
    collection = max(collections, key=lambda item: len(item["variableIds"])) if collections else api(mcp, "variables", "createVariableCollection", ["Wiki / Product"])
    collection_id = collection["id"]
    specifications = [(f"color/{name}", value, "COLOR", SCOPES[name]) for name, value in COLORS.items()]
    specifications += [(f"space/{name}", value, "FLOAT", ["GAP"]) for name, value in TOKENS["space"].items()]
    specifications += [(f"radius/{name}", value, "FLOAT", ["CORNER_RADIUS"]) for name, value in TOKENS["radius"].items()]
    specifications += [(f"size/{name}", value, "FLOAT", ["WIDTH_HEIGHT"]) for name, value in TOKENS["size"].items()]
    for name, value, kind, scopes in specifications:
        variable = next((item for item in existing["variables"] if item["variableCollectionId"] == collection_id and item["name"] == name), None)
        if variable is None:
            variable = api(mcp, "variables", "createVariable", [name, collection_id, kind])
        VALUE_IDS[name] = variable["id"]
        if name.startswith("color/"):
            COLOR_IDS[name.split("/", 1)[1]] = variable["id"]
        set_prop(mcp, "variable", "scopes", scopes, variableId=variable["id"])
        api(mcp, "variable", "setValueForMode", [collection["defaultModeId"], rgb(value) if kind == "COLOR" else value], variableId=variable["id"])
        api(mcp, "variable", "setVariableCodeSyntax", ["WEB", f"var(--wiki-{name.replace('/', '-')})"], variableId=variable["id"])
    for weight in ("Regular", "Medium", "SemiBold", "Bold"):
        api(mcp, "figma", "loadFontAsync", [{"family": "Onest", "style": weight}])
    existing_styles = mcp.tool("figma.list_styles", {})["text"]
    missing = [(name, values) for name, values in TYPE.items() if not any(item["name"] == f"Wiki / {name}" for item in existing_styles)]
    style_operations = [{"command": "CREATE_NODE", "payload": {"createMethod": "createTextStyle", "properties": {"name": f"Wiki / {name}", "fontName": {"family": "Onest", "style": values[2]}, "fontSize": values[0], "lineHeight": {"unit": "PIXELS", "value": values[1]}}}} for name, values in missing]
    if style_operations:
        mcp.batch(style_operations)
    existing_styles = mcp.tool("figma.list_styles", {})["text"]
    for name in TYPE:
        STYLE_IDS[name] = next(item["id"] for item in existing_styles if item["name"] == f"Wiki / {name}")
    document = mcp.tool("figma.get_document", {})
    page = next(item for item in document["pages"] if item["id"] == page_id)
    existing_components = {item["name"]: item["id"] for item in page.get("children", []) if item["type"] == "COMPONENT"}
    button_layout = {"layoutMode": "HORIZONTAL", "primaryAxisSizingMode": "FIXED", "counterAxisSizingMode": "FIXED", "primaryAxisAlignItems": "CENTER", "counterAxisAlignItems": "CENTER", "paddingLeft": 16, "paddingRight": 16}
    definitions = {
        "Button / Primary": {"parentId": page_id, "name": "Button / Primary", "x": 0, "y": 5000, "width": 160, "height": 40, "layout": button_layout, "style": style("accent", "accent", 6)},
        "Navigation / Active": {"parentId": page_id, "name": "Navigation / Active", "x": 200, "y": 5000, "width": 236, "height": 36, "layout": {**button_layout, "paddingLeft": 12, "paddingRight": 12}, "style": style("accentSoft", None, 6)},
        "Button / Secondary": {"parentId": page_id, "name": "Button / Secondary", "x": 480, "y": 5000, "width": 160, "height": 40, "layout": button_layout, "style": style("paper", "line", 6)},
        "Icon Button / Default": {"parentId": page_id, "name": "Icon Button / Default", "x": 700, "y": 5000, "width": 40, "height": 40, "style": style("paper", "line", 6)},
        "Field / Input": {"parentId": page_id, "name": "Field / Input", "x": 780, "y": 5000, "width": 320, "height": 40, "style": style("paper", "line", 6)},
        "Menu / Item": {"parentId": page_id, "name": "Menu / Item", "x": 1140, "y": 5000, "width": 320, "height": 52, "style": style("paper", None, 6)},
        "Menu / Item / Active": {"parentId": page_id, "name": "Menu / Item / Active", "x": 1140, "y": 5080, "width": 320, "height": 52, "style": style("accentSoft", None, 6)},
        "Menu / Item / Danger": {"parentId": page_id, "name": "Menu / Item / Danger", "x": 1140, "y": 5160, "width": 320, "height": 52, "style": style("paper", None, 6)},
        "Dialog / Container": {"parentId": page_id, "name": "Dialog / Container", "x": 1500, "y": 5000, "width": 640, "height": 620, "style": style("paper", "line", 10)},
    }
    missing_components = [name for name in definitions if name not in existing_components]
    if missing_components:
        results = mcp.batch([{"command": "CREATE_COMPONENT", "payload": definitions[name]} for name in missing_components])
        for name, result in zip(missing_components, results):
            existing_components[name] = result["result"]["node"]["id"]
    COMPONENTS.update(existing_components)
    for component_name in definitions:
        result = mcp.tool("figma.get_node", {"nodeId": COMPONENTS[component_name]})
        component = result.get("node", result)
        children = component.get("children", [])
        operations = []
        if component_name in ("Button / Primary", "Button / Secondary", "Navigation / Active") and not any(child.get("type") == "TEXT" for child in children):
            color = "white" if component_name == "Button / Primary" else "accent" if component_name == "Navigation / Active" else "ink"
            operations.append(text(COMPONENTS[component_name], "Label", "Действие" if "Button" in component_name else "Раздел", 0, 0, 120, 22, "BodyMedium", color))
        elif component_name == "Icon Button / Default" and not children:
            operations.append(icon(COMPONENTS[component_name], "plus", 11, 11))
        elif component_name == "Field / Input" and not any(child.get("type") == "TEXT" for child in children):
            operations.append(text(COMPONENTS[component_name], "Value", "Значение поля", 12, 9, 280, 22, "Body", "muted"))
        elif component_name.startswith("Menu / Item") and not any(child.get("type") == "TEXT" for child in children):
            label_color = "danger" if component_name == "Menu / Item / Danger" else "ink"
            operations += [rect(COMPONENTS[component_name], "Icon / container", 12, 10, 32, 32, "canvas", "line", 4), text(COMPONENTS[component_name], "Label", "Пункт меню", 56, 5, 220, 22, "BodyMedium", label_color), text(COMPONENTS[component_name], "Hint", "Описание пункта", 56, 27, 240, 18, "Small", "muted")]
        elif component_name == "Dialog / Container" and not any(child.get("type") == "TEXT" for child in children):
            operations += [text(COMPONENTS[component_name], "Title", "Название диалога", 32, 26, 500, 30, "Title"), text(COMPONENTS[component_name], "Close", "×", 584, 24, 24, 30, "Title", "muted", "CENTER")]
        if operations:
            flush(mcp, operations)
        radius = "radius/xl" if component_name == "Dialog / Container" else "radius/md"
        api(mcp, "node", "setBoundVariable", ["cornerRadius", {"$variableId": VALUE_IDS[radius]}], nodeId=COMPONENTS[component_name])
        if component_name in ("Button / Primary", "Button / Secondary", "Navigation / Active"):
            token = "space/3" if component_name == "Navigation / Active" else "space/4"
            api(mcp, "node", "setBoundVariable", ["paddingLeft", {"$variableId": VALUE_IDS[token]}], nodeId=COMPONENTS[component_name])
            api(mcp, "node", "setBoundVariable", ["paddingRight", {"$variableId": VALUE_IDS[token]}], nodeId=COMPONENTS[component_name])
    return {"collectionId": collection_id, "colors": COLOR_IDS, "values": VALUE_IDS, "styles": STYLE_IDS, "components": COMPONENTS}


def sidebar(parent, active="Страницы"):
    ops = [rect(parent, "Sidebar / background", 0, 0, 264, 900, "sidebar"), rect(parent, "Sidebar / rule", 263, 0, 1, 900, "line"), text(parent, "Wordmark", "wiki", 20, 19, 80, 32, "Title")]
    ops += [rect(parent, "Search / field", 16, 62, 232, 36, "paper", "line", 6), icon(parent, "search", 28, 71, kind="file"), text(parent, "Search / placeholder", "Поиск", 54, 70, 120, 20, "Body", "muted"), text(parent, "Search / shortcut", "⌘K", 205, 71, 30, 18, "Small", "muted")]
    ops += [rect(parent, "New page", 16, 110, 178, 36, "paper", "control", 6), icon(parent, "plus", 28, 119), text(parent, "New page / label", "Новая страница", 52, 118, 130, 20, "BodyMedium"), rect(parent, "Inbox", 202, 110, 46, 36, "paper", "line", 6), text(parent, "Inbox / label", "3", 219, 118, 14, 20, "BodyMedium", "muted")]
    if active == "Страницы":
        place_nav(parent, "Запуск продукта", 32, 308, 216)
    elif active == "Поиск":
        place_nav(parent, "Поиск", 16, 62, 232)
    elif active == "Входящие":
        place_nav(parent, "3", 202, 110, 46)
    ops += [text(parent, "Tree / favorites", "ИЗБРАННОЕ", 20, 166, 180, 16, "Caption", "muted"), icon(parent, "file", 26, 193), text(parent, "Tree / favorite page", "Запуск продукта", 52, 191, 170, 22, "Body"), text(parent, "Tree / pages", "СТРАНИЦЫ", 20, 232, 180, 16, "Caption", "muted"), icon(parent, "folder", 26, 269), text(parent, "Tree / project", "Продукт", 52, 267, 160, 22, "BodyMedium")]
    rows = [(314, "Запуск продукта"), (350, "Требования"), (386, "Исследование"), (422, "Команда")]
    for y, label in rows:
        if active == "Страницы" and label == "Запуск продукта":
            continue
        ops += [icon(parent, "file", 42, y + 2), text(parent, f"Tree / {label}", label, 68, y, 156, 22, "Body", "muted")]
    ops += [text(parent, "Tree / shared", "Общие", 28, 466, 150, 22, "Body", "muted"), text(parent, "Tree / private", "Личные", 28, 500, 150, 22, "Body", "muted"), text(parent, "Tree / trash", "Корзина", 28, 534, 150, 22, "Body", "muted"), line(parent, "Work / rule", 16, 574, 232), text(parent, "Work / caption", "РАБОТА · ПОЗЖЕ", 20, 594, 200, 16, "Caption", "muted")]
    work = [(630, "Задачи"), (666, "Агенты"), (702, "Граф"), (738, "Скиллы")]
    for y, label in work:
        if active == label:
            place_nav(parent, label, 16, y - 6)
        else:
            ops.append(text(parent, f"Work / {label}", label, 28, y, 160, 22, "Body", "muted"))
    ops += [line(parent, "Workspace / rule", 0, 824, 264), rect(parent, "Workspace / avatar", 16, 842, 32, 32, "accent", radius=6), text(parent, "Workspace / initial", "К", 26, 849, 12, 18, "SmallMedium", "white"), text(parent, "Workspace / name", "Команда", 58, 840, 140, 20, "BodyMedium"), text(parent, "Workspace / email", "you@example.com", 58, 860, 160, 16, "Small", "muted"), icon(parent, "more", 226, 849)]
    return ops


def topbar(parent, section, editor=False, later=False):
    ops = [line(parent, "Topbar / rule", 264, 55, 1176), text(parent, "Breadcrumb", f"Команда  /  {section}", 288, 18, 500, 22, "Body", "muted")]
    if editor:
        ops += [text(parent, "Save", "Сохранено", 1000, 19, 90, 20, "Small", "muted"), rect(parent, "Presence / AK", 1110, 13, 30, 30, "info", radius=15), text(parent, "Presence / AK text", "АК", 1116, 19, 20, 16, "Caption", "white"), rect(parent, "Presence / MS", 1132, 13, 30, 30, "warning", radius=15), text(parent, "Presence / MS text", "МС", 1138, 19, 20, 16, "Caption", "white")]
        ops += button(parent, "Поделиться", 1244, 9, 148, False)
    elif later:
        ops.append(text(parent, "Topbar / status", "Позже", 1320, 19, 72, 20, "Small", "muted"))
    return ops


def heading(parent, title, description, action=None):
    ops = [text(parent, "Header / title", title, 304, 88, 760, 38, "Display"), text(parent, "Header / description", description, 304, 136, 820, 46, "Body", "muted")]
    if action:
        ops += button(parent, action, 1216, 90, 176)
    return ops


def shell(parent, section, active="Страницы", editor=False, later=False):
    return sidebar(parent, active) + topbar(parent, section, editor, later)


def auth_screen(parent):
    ops = [rect(parent, "Background", 0, 0, 1440, 900, "paper"), text(parent, "Wordmark", "wiki", 48, 40, 120, 36, "Title"), text(parent, "Form / eyebrow", "РАБОЧЕЕ МЕСТО", 500, 202, 440, 18, "Caption", "muted"), text(parent, "Form / title", "Войти в wiki", 500, 240, 440, 40, "Display"), text(parent, "Form / description", "Продолжите работу со своими страницами.", 500, 292, 440, 24, "Body", "muted")]
    ops += input_field(parent, "Почта", "you@example.com", 500, 358, 440, 44)
    ops += input_field(parent, "Пароль", "Ваш пароль", 500, 452, 440, 44)
    ops += button(parent, "Войти", 500, 550, 440)
    ops += [text(parent, "Register", "Нет учётной записи?  Регистрация", 500, 610, 440, 22, "Body", "accent"), line(parent, "Form / rule", 500, 664, 440), text(parent, "Form / note", "После входа откроется последний workspace.\nРегистрация может быть отключена на сервере.", 500, 686, 440, 48, "Small", "muted")]
    return ops


def editor_content(parent, comments=False, plugins=False):
    ops = [text(parent, "Appearance", "Добавить иконку   ·   Добавить обложку", 336, 96, 480, 20, "Small", "muted"), text(parent, "Page / title", "Запуск продукта", 336, 136, 760, 46, "Display"), text(parent, "Page / metadata", "WIKI-142   ·   Доверие 0,86   ·   обновлено сегодня", 336, 188, 720, 20, "Small", "muted")]
    tools = [(336, "bold"), (370, "italic"), (404, "strike"), (438, "code"), (500, "list"), (534, "ordered"), (568, "quote"), (602, "link"), (660, "table"), (694, "minus")]
    ops += [line(parent, "Toolbar / top", 336, 232, 760), line(parent, "Toolbar / bottom", 336, 274, 760)]
    for x, kind in tools:
        ops.append(icon(parent, kind, x, 244))
    if plugins:
        ops += [text(parent, "Plugin / heading", "Схема процесса", 336, 310, 500, 30, "Heading"), rect(parent, "Plugin / code", 336, 356, 350, 320, "canvas", "line", 6), text(parent, "Plugin / source", "@startuml\nstart\n:Требования;\n:Прототип;\nif (Согласовано?) then (да)\n  :Разработка;\nelse (нет)\n  :Уточнить;\nendif\nstop\n@enduml", 356, 378, 310, 260, "Body", "ink"), rect(parent, "Plugin / diagram", 710, 356, 590, 320, "paper", "line", 6), text(parent, "Plugin / caption", "BPMN · редактируемый блок страницы", 730, 374, 500, 20, "Small", "muted")]
        for x, label in [(780, "Требования"), (970, "Прототип"), (1160, "Разработка")]:
            ops += [rect(parent, f"BPMN / {label}", x, 470, 130, 56, "canvas", "control", 4), text(parent, "BPMN / label", label, x + 10, 488, 110, 20, "SmallMedium")]
        ops += [line(parent, "BPMN / connector 1", 910, 497, 60, "control"), line(parent, "BPMN / connector 2", 1100, 497, 60, "control"), text(parent, "Plugin / note", "PlantUML и BPMN подключаются как плагины оформления.", 336, 710, 760, 24, "Small", "muted")]
    else:
        ops += [text(parent, "Page / intro", "Первая версия объединяет работу команды в одном месте.\nСтраница — основная единица работы, а проект собирает страницы по смыслу.", 336, 310, 760, 60, "Editor"), text(parent, "Page / heading", "Что входит в запуск", 336, 408, 700, 30, "Heading"), text(parent, "Page / bullets", "•  Дерево страниц с вложенностью и перетаскиванием.\n•  Полный Markdown и привычное форматирование.\n•  Живые правки второго участника без перезагрузки.", 336, 458, 760, 88, "Editor"), text(parent, "Page / task", "WIKI-142  Сверить редактор с утверждённым поведением", 336, 578, 720, 28, "BodyMedium", "accent"), text(parent, "Page / empty", "Пишите здесь или введите / для выбора блока…", 336, 644, 700, 28, "Editor", "muted")]
    if not comments and not plugins:
        ops += [line(parent, "Outline / rule", 1180, 96, 1, "line"), text(parent, "Outline / title", "НА ЭТОЙ СТРАНИЦЕ", 1210, 100, 180, 18, "Caption", "muted"), text(parent, "Outline / item", "Что входит в запуск", 1210, 138, 180, 22, "Small", "muted"), text(parent, "Outline / trust", "Доверие страницы\n0,86 · высокое", 1210, 206, 180, 46, "Small", "muted"), text(parent, "Outline / artifacts", "Артефакты задачи\nМакет · SA · 4 правки", 1210, 284, 190, 46, "Small", "muted")]
    return ops


def search_screen(parent):
    ops = shell(parent, "Поиск", "Поиск") + heading(parent, "Недавние страницы", "Поиск по названию и тексту страниц, доступных вам.")
    ops += [rect(parent, "Search / backdrop", 264, 56, 1176, 844, "backdrop", opacity=.16), rect(parent, "Search / dialog", 432, 116, 720, 570, "paper", "line", 8), rect(parent, "Search / input", 456, 140, 672, 48, "paper", "control", 6), text(parent, "Search / query", "запуск", 474, 153, 560, 24, "BodyMedium"), text(parent, "Search / esc", "esc", 1072, 154, 36, 20, "Small", "muted"), text(parent, "Search / count", "4 результата", 456, 214, 300, 20, "Small", "muted")]
    results = [("Запуск продукта", "Продукт / Запуск продукта", "…что входит в запуск и как устроен редактор…"), ("Требования к запуску", "Продукт / Требования", "…критерии готовности первого запуска…"), ("План запуска", "Продукт / Исследование", "…проверить перед запуском у участников…"), ("Ретроспектива", "Команда / Ретроспектива", "…после запуска обсудить следующий этап…")]
    for i, (title, path, snippet) in enumerate(results):
        y = 252 + i * 98
        ops += [line(parent, "Result / rule", 456, y - 12, 672), icon(parent, "file", 460, y + 4), text(parent, "Result / title", title, 490, y, 520, 24, "BodyMedium"), text(parent, "Result / path", path, 490, y + 28, 520, 18, "Small", "muted"), text(parent, "Result / snippet", snippet, 490, y + 52, 590, 20, "Small", "muted")]
    return ops


def share_screen(parent):
    ops = shell(parent, "Запуск продукта", editor=True) + editor_content(parent)
    ops += [rect(parent, "Share / backdrop", 264, 56, 1176, 844, "backdrop", opacity=.22), rect(parent, "Share / dialog", 512, 140, 640, 620, "paper", "line", 8), text(parent, "Share / title", "Доступ к странице", 544, 172, 560, 32, "Title"), text(parent, "Share / subtitle", "Запуск продукта", 544, 210, 560, 22, "Body", "muted")]
    ops += input_field(parent, "Пригласить человека", "Почта или имя участника", 544, 258, 420, 40)
    ops += button(parent, "Пригласить", 980, 282, 140, False)
    ops += [text(parent, "Share / scope", "ОБЩИЙ ДОСТУП", 544, 356, 400, 18, "Caption", "muted")]
    scopes = [("Только участники с приглашением", True), ("Любой, кто вошёл в сервис", False), ("Любой, у кого есть ссылка", False)]
    for i, (label, selected) in enumerate(scopes):
        y = 392 + i * 44
        ops += [rect(parent, "Scope / radio", 544, y + 2, 16, 16, "accent" if selected else "paper", "accent" if selected else "control", 8), text(parent, "Scope / label", label, 574, y, 420, 24, "Body")]
    ops += [line(parent, "Share / rule", 544, 532, 576), text(parent, "Share / right", "ПРАВО ДЛЯ ЭТОГО КРУГА", 544, 554, 400, 18, "Caption", "muted"), rect(parent, "Share / select", 544, 586, 360, 40, "paper", "control", 6), text(parent, "Share / select value", "Только смотреть", 558, 596, 300, 22, "Body"), text(parent, "Share / hide", "Скрывать из поиска у тех, кто ещё не открывал страницу", 544, 650, 520, 22, "Small", "muted"), text(parent, "Share / limit", "В workspace: 4 из 5 участников", 544, 700, 440, 20, "Small", "muted")]
    return ops


def inbox_screen(parent):
    ops = shell(parent, "Входящие", "Входящие") + heading(parent, "Входящие", "Приглашения и события, которые требуют вашего внимания.")
    ops += [text(parent, "Inbox / filters", "Непрочитанные   Все   Архив", 304, 202, 560, 24, "BodyMedium"), line(parent, "Inbox / tabs", 304, 238, 1096)]
    rows = [("Мария приглашает вас в workspace «Продукт»", "Сейчас", "Принять", "Отклонить"), ("Антон принял приглашение в «Команду»", "20 минут назад", "", ""), ("Вам открыли страницу «Требования к запуску»", "1 час назад", "Открыть", ""), ("Запрос права на правку «Исследование»", "Вчера", "Разрешить", "Отклонить")]
    for i, (message, when, primary, secondary) in enumerate(rows):
        y = 270 + i * 118
        ops += [rect(parent, "Inbox / unread", 304, y + 7, 6, 6, "accent", radius=3), text(parent, "Inbox / message", message, 328, y, 750, 26, "BodyMedium"), text(parent, "Inbox / time", when, 328, y + 34, 300, 20, "Small", "muted"), line(parent, "Inbox / rule", 304, y + 92, 1096)]
        if primary:
            ops += button(parent, primary, 1090, y, 130, primary == "Принять")
        if secondary:
            ops += button(parent, secondary, 1230, y, 130, False)
    return ops


def comments_screen(parent):
    ops = shell(parent, "Запуск продукта", editor=True) + editor_content(parent, comments=True)
    ops += [rect(parent, "Comments / panel", 1112, 56, 328, 844, "paper"), rect(parent, "Comments / rule", 1111, 56, 1, 844, "line"), text(parent, "Comments / title", "Комментарии", 1136, 88, 270, 30, "Title"), text(parent, "Comments / filters", "Открытые   Закрытые", 1136, 134, 270, 20, "Small", "muted"), line(parent, "Comments / top", 1136, 174, 280), text(parent, "Comment / author", "Мария Соколова", 1136, 198, 240, 22, "BodyMedium"), text(parent, "Comment / time", "14:32", 1350, 200, 60, 18, "Small", "muted"), text(parent, "Comment / body", "Уточним здесь, что дочерняя страница наследует доступ родителя?", 1136, 232, 272, 70, "Body"), rect(parent, "Comment / reply", 1136, 320, 272, 76, "canvas", "line", 6), text(parent, "Comment / placeholder", "Ответить…", 1150, 336, 240, 22, "Body", "muted"), text(parent, "Comment / resolve", "Закрыть тред", 1136, 416, 240, 22, "SmallMedium", "accent"), line(parent, "Comment / next", 1136, 466, 280), text(parent, "Comment 2 / author", "Антон Крылов", 1136, 490, 240, 22, "BodyMedium"), text(parent, "Comment 2 / body", "Предлагаю вынести ключ задачи в отдельный блок.", 1136, 526, 272, 66, "Body"), text(parent, "Comments / proposal", "Черновик поведения · О-9", 1136, 842, 270, 20, "Small", "warning")]
    return ops


def tasks_screen(parent):
    ops = shell(parent, "Задачи", "Задачи", later=True) + heading(parent, "Задачи", "Агент-продукт-менеджер превращает текст в работу команды.", "Новая задача")
    ops += [rect(parent, "Task / composer", 304, 194, 1096, 72, "paper", "control", 6), text(parent, "Task / prompt", "Опишите результат — агент предложит задачи для доски", 326, 214, 850, 24, "Body", "muted"), text(parent, "Task / send", "Разобрать", 1260, 218, 110, 22, "BodyMedium", "accent")]
    columns = [("НОВЫЕ", [("WIKI-151", "Согласовать круг доступа", "")]), ("В РАБОТЕ", [("WIKI-142", "Сверить редактор", "Агент · Макет"), ("WIKI-146", "Проверить Markdown", "Антон")]), ("ЗАБЛОКИРОВАНЫ", [("WIKI-138", "Правила комментариев", "Ждёт О-9")]), ("ГОТОВО", [("WIKI-127", "Дерево страниц", "4 артефакта")])]
    for i, (name, cards) in enumerate(columns):
        x = 304 + i * 280
        ops += [text(parent, "Board / column", name, x, 306, 240, 20, "Caption", "muted"), line(parent, "Board / rule", x, 340, 256)]
        for j, (key, title, meta) in enumerate(cards):
            y = 360 + j * 156
            ops += [rect(parent, "Task / card", x, y, 256, 132, "paper", "line", 6), text(parent, "Task / key", key, x + 16, y + 14, 200, 18, "SmallMedium", "accent"), text(parent, "Task / title", title, x + 16, y + 44, 224, 46, "BodyMedium"), text(parent, "Task / meta", meta, x + 16, y + 102, 224, 18, "Small", "muted")]
    ops += [text(parent, "Activity / title", "Сводка агентов", 304, 716, 400, 26, "Heading"), text(parent, "Activity / summary", "Сегодня: 7 задач обновлено · 3 артефакта добавлено · 1 блокировка", 304, 754, 1000, 24, "Body", "muted")]
    return ops


def agents_screen(parent):
    ops = shell(parent, "Агенты", "Агенты", later=True) + heading(parent, "Агенты", "Доступ к страницам, поиск для моделей и ход работы.", "Подключить агента")
    ops += [line(parent, "Agents / left rule", 304, 206, 340), text(parent, "Agents / list caption", "ПОДКЛЮЧЕНЫ", 304, 224, 300, 18, "Caption", "muted"), text(parent, "Agent / selected", "Продуктовый агент", 304, 264, 320, 26, "BodyMedium", "accent"), text(parent, "Agent / second", "Агент исследования", 304, 310, 320, 26, "Body"), text(parent, "Agent / third", "Локальный MCP-клиент", 304, 356, 320, 26, "Body"), rect(parent, "Agent / divider", 676, 206, 1, 620, "line"), text(parent, "Agent / title", "Продуктовый агент", 712, 206, 560, 34, "Title"), text(parent, "Agent / state", "Подключён через MCP · смотреть и править", 712, 252, 560, 22, "Body", "muted"), text(parent, "Agent / access caption", "ДОСТУП К СТРАНИЦАМ", 712, 312, 400, 18, "Caption", "muted")]
    for i, label in enumerate(["Продукт", "Запуск продукта", "Требования"]):
        y = 348 + i * 40
        ops += [icon(parent, "folder" if i == 0 else "file", 714, y), text(parent, "Agent / page", label, 742, y, 360, 22, "Body"), text(parent, "Agent / right", "Смотреть и править" if i else "Смотреть", 1130, y, 210, 22, "Small", "muted")]
    ops += [line(parent, "Agent / search rule", 712, 484, 688), text(parent, "Agent / index", "Поиск для моделей", 712, 508, 500, 26, "Heading"), text(parent, "Agent / index state", "Индекс: 46 страниц · обновлён 2 минуты назад", 712, 546, 600, 22, "Body", "muted"), text(parent, "Agent / activity", "Последняя работа", 712, 614, 500, 26, "Heading"), text(parent, "Agent / activity rows", "14:32  Обновил WIKI-142\n14:18  Добавил макет в артефакты\n13:56  Прочитал воркфлоу проекта", 712, 654, 620, 80, "Body")]
    return ops


def graph_screen(parent):
    ops = shell(parent, "Граф", "Граф", later=True) + heading(parent, "Граф workspace", "Связи страниц, задач и артефактов. Доверие видно у выбранного узла.")
    ops += [text(parent, "Graph / filters", "Все связи   Страницы   Артефакты   Агенты", 304, 196, 540, 24, "BodyMedium"), text(parent, "Graph / controls", "−   +   Настройки", 876, 196, 176, 24, "SmallMedium", "muted", "RIGHT"), rect(parent, "Graph / canvas", 304, 236, 748, 554, "canvas", "line", 6), rect(parent, "Graph / inspector", 1076, 236, 324, 554, "paper", "line", 6)]
    edges = [(680, 470, 510, 350), (680, 470, 840, 360), (680, 470, 860, 590), (680, 470, 560, 620), (510, 350, 560, 620), (560, 620, 710, 665)]
    for index, (x1, y1, x2, y2) in enumerate(edges):
        ops.append({"command": "CREATE_NODE", "payload": {"parentId": parent, "createMethod": "createVector", "properties": {"name": f"Graph / edge {index + 1}", "x": x1, "y": y1, "strokes": [paint("control")], "strokeWeight": 1.2, "vectorPaths": [{"windingRule": "NONZERO", "data": f"M0 0 L{x2-x1} {y2-y1}"}]}}})
    nodes = [(510, 350, "WIKI-142", 12, "info", 450, 310, 120, "CENTER"), (840, 360, "Макет", 10, "muted", 790, 320, 100, "CENTER"), (860, 590, "Требования", 12, "accent", 884, 580, 130, "LEFT"), (560, 620, "Исследование", 10, "accent", 390, 610, 140, "RIGHT"), (710, 665, "Продуктовый агент", 10, "warning", 630, 688, 160, "CENTER")]
    for x, y, title, radius, color, label_x, label_y, label_width, align in nodes:
        ops += [rect(parent, f"Graph / {title}", x - radius, y - radius, radius * 2, radius * 2, "paper", color, radius), text(parent, f"Graph / {title} label", title, label_x, label_y, label_width, 22, "SmallMedium", "ink", align)]
    ops += [rect(parent, "Graph / selected ring", 658, 448, 44, 44, "paper", "accent", 22), rect(parent, "Graph / selected node", 666, 456, 28, 28, "accentSoft", "accent", 14), text(parent, "Graph / selected label", "Запуск продукта", 724, 459, 160, 24, "BodyMedium", "ink")]
    ops += [line(parent, "Graph / timeline top", 326, 724, 704), text(parent, "Graph / timeline", "Создание и правки", 326, 744, 150, 20, "SmallMedium"), line(parent, "Graph / timeline rule", 492, 754, 350, "control"), rect(parent, "Graph / playhead", 746, 742, 2, 24, "accent"), text(parent, "Graph / play", "Проиграть", 914, 744, 104, 20, "SmallMedium", "accent", "RIGHT")]
    ops += [text(parent, "Inspector / caption", "СТРАНИЦА · ВЫБРАНА", 1100, 260, 276, 18, "Caption", "accent"), text(parent, "Inspector / title", "Запуск продукта", 1100, 292, 276, 32, "Title"), text(parent, "Inspector / meta", "Продукт · изменено сегодня", 1100, 334, 276, 20, "Small", "muted"), line(parent, "Inspector / rule 1", 1100, 374, 276), text(parent, "Inspector / sources", "Источники · 3", 1100, 394, 276, 22, "BodyMedium"), text(parent, "Inspector / source list", "WIKI-142 · задача\nМакет · артефакт\nТребования · страница", 1100, 428, 276, 66, "Small", "muted"), text(parent, "Inspector / context", "Продукт   ·   3 агента   ·   24 применения", 1100, 504, 276, 20, "Small", "muted"), line(parent, "Inspector / rule 2", 1100, 542, 276), text(parent, "Inspector / trust caption", "ДОВЕРИЕ АГЕНТОВ", 1100, 562, 276, 18, "Caption", "muted"), text(parent, "Inspector / trust", "0,86 · высокое", 1100, 590, 276, 26, "Heading"), rect(parent, "Inspector / trust track", 1100, 628, 240, 6, "line", radius=3), rect(parent, "Inspector / trust value", 1100, 628, 206, 6, "accent", radius=3), text(parent, "Inspector / trust stats", "24 применения · 22 успешных", 1100, 650, 276, 20, "Small", "muted"), text(parent, "Inspector / trust basis", "Свежесть и подтверждённые применения", 1100, 678, 276, 40, "Small", "muted"), line(parent, "Inspector / rule 3", 1100, 724, 276), text(parent, "Inspector / open", "Открыть страницу", 1100, 744, 160, 22, "BodyMedium", "accent"), text(parent, "Inspector / pin", "Закрепить", 1260, 744, 116, 22, "SmallMedium", "muted", "RIGHT")]
    return ops


def skills_screen(parent):
    ops = shell(parent, "Скиллы", "Скиллы", later=True) + heading(parent, "Скиллы", "Страницы с инструкциями для повторяемой работы.", "Новый скилл")
    ops += [text(parent, "Skills / tabs", "Мои   Найти", 304, 202, 400, 24, "BodyMedium"), line(parent, "Skills / rule", 304, 240, 1096), text(parent, "Skills / name header", "НАЗВАНИЕ", 304, 266, 300, 18, "Caption", "muted"), text(parent, "Skills / source header", "СТРАНИЦА", 650, 266, 300, 18, "Caption", "muted"), text(parent, "Skills / state header", "СОСТОЯНИЕ", 1050, 266, 250, 18, "Caption", "muted")]
    rows = [("Проверка фичи", "Продукт / Воркфлоу", "Включён · актуален"), ("Согласование макета", "Команда / Дизайн", "Есть новая версия"), ("Разбор исследования", "Продукт / Исследование", "Включить у себя"), ("Экспорт SKILL.md", "Общие / Инструкции", "Включён · актуален")]
    for i, (name, path, state) in enumerate(rows):
        y = 308 + i * 84
        ops += [line(parent, "Skill / row", 304, y - 12, 1096), text(parent, "Skill / name", name, 304, y, 320, 24, "BodyMedium"), text(parent, "Skill / path", path, 650, y, 350, 24, "Body", "muted"), text(parent, "Skill / state", state, 1050, y, 300, 24, "Body", "warning" if "новая" in state else "accent" if "Включить" not in state else "ink")]
    ops += [text(parent, "Skills / note", "Скилл остаётся обычной страницей. Права на её правку не меняются.", 304, 704, 900, 24, "Body", "muted")]
    return ops


def plugins_screen(parent):
    return shell(parent, "Запуск продукта", editor=True, later=True) + editor_content(parent, plugins=True)


def workspace_screen(parent):
    ops = shell(parent, "Настройки workspace", later=True) + heading(parent, "Workspace «Команда»", "Участники, режим организации и доступ.")
    ops += [text(parent, "Members / title", "Участники", 304, 206, 500, 30, "Title"), text(parent, "Members / count", "4 из 5 мест", 1210, 214, 180, 22, "Body", "muted"), line(parent, "Members / rule", 304, 250, 1096)]
    people = [("Антон Крылов", "Владелец", "you@example.com"), ("Мария Соколова", "Участник", "maria@example.com"), ("Илья Воронов", "Участник", "ilya@example.com"), ("Ольга Смирнова", "Участник", "olga@example.com")]
    for i, (name, role, email) in enumerate(people):
        y = 282 + i * 62
        ops += [text(parent, "Member / name", name, 304, y, 280, 24, "BodyMedium"), text(parent, "Member / email", email, 610, y, 340, 24, "Body", "muted"), text(parent, "Member / role", role, 1120, y, 240, 24, "Body", "muted"), line(parent, "Member / rule", 304, y + 42, 1096)]
    ops += [text(parent, "Org / title", "Режим организации", 304, 584, 500, 30, "Title"), text(parent, "Org / description", "При включении доступны внешний SSO и роли организации.\nОграничение workspace в пять участников сохраняется.", 304, 628, 700, 52, "Body", "muted"), rect(parent, "Org / toggle", 1280, 594, 44, 24, "accent", radius=12), rect(parent, "Org / knob", 1300, 598, 16, 16, "paper", radius=8), text(parent, "Org / sso", "Внешний SSO", 304, 716, 300, 24, "BodyMedium"), text(parent, "Org / sso state", "Не подключён", 1120, 716, 240, 24, "Body", "muted")]
    return ops


def apps_screen(parent):
    ops = shell(parent, "Приложения и синхронизация", later=True) + heading(parent, "Приложения", "Тот же интерфейс в браузере и на компьютере.", "Скачать для macOS")
    ops += [text(parent, "Sync / title", "Локальная копия", 304, 208, 500, 30, "Title"), rect(parent, "Sync / status dot", 304, 262, 8, 8, "accent", radius=4), text(parent, "Sync / status", "Синхронизировано с сервером 1 минуту назад", 326, 254, 700, 24, "Body"), text(parent, "Sync / detail", "46 страниц · 12 вложений · изменения отправляются автоматически", 304, 294, 800, 24, "Body", "muted"), line(parent, "Apps / rule", 304, 354, 1096), text(parent, "Apps / table title", "Платформы", 304, 388, 500, 30, "Title")]
    rows = [("Браузер", "Доступен", "Текущая версия"), ("macOS", "Доступен", "Локальная копия и синхронизация"), ("Windows", "Доступен", "Локальная копия и синхронизация"), ("Android", "Позже", "После desktop-приложений")]
    for i, (platform, status, detail) in enumerate(rows):
        y = 446 + i * 72
        ops += [line(parent, "App / row", 304, y - 12, 1096), text(parent, "App / platform", platform, 304, y, 260, 24, "BodyMedium"), text(parent, "App / status", status, 650, y, 220, 24, "Body", "accent" if status == "Доступен" else "muted"), text(parent, "App / detail", detail, 900, y, 480, 24, "Body", "muted")]
    return ops


def mobile_editor(parent):
    ops = [rect(parent, "Background", 0, 0, 375, 812, "paper"), icon(parent, "menu", 20, 18, "ink"), text(parent, "Breadcrumb", "Запуск продукта", 56, 17, 170, 22, "Body", "muted"), text(parent, "Save", "✓", 302, 17, 20, 22, "Body", "accent"), icon(parent, "download", 338, 18), line(parent, "Topbar", 0, 52, 375), text(parent, "Appearance", "Добавить иконку", 20, 82, 250, 20, "Small", "muted"), text(parent, "Title", "Запуск продукта", 20, 124, 335, 42, "Display"), text(parent, "Metadata", "WIKI-142 · Сохранено", 20, 174, 335, 20, "Small", "muted"), line(parent, "Toolbar / top", 20, 216, 335)]
    for x, kind in [(24, "bold"), (68, "italic"), (112, "strike"), (156, "code"), (216, "list"), (260, "ordered"), (304, "quote")]:
        ops.append(icon(parent, kind, x, 232, size=20))
    ops += [line(parent, "Toolbar / bottom", 20, 270, 335), text(parent, "Intro", "Первая версия объединяет работу команды в одном месте. Страница — основная единица работы, а проект собирает страницы по смыслу.", 20, 306, 335, 112, "Editor"), text(parent, "Heading", "Что входит в запуск", 20, 452, 335, 32, "Heading"), text(parent, "Bullets", "•  Дерево страниц с вложенностью\n   и перетаскиванием.\n\n•  Полный Markdown и привычное\n   форматирование.", 20, 510, 335, 140, "Editor"), text(parent, "Task", "WIKI-142  Сверить редактор", 20, 694, 335, 26, "BodyMedium", "accent")]
    return ops


def mobile_search(parent):
    ops = [rect(parent, "Background", 0, 0, 375, 812, "paper"), text(parent, "Cancel", "Отмена", 304, 20, 52, 22, "Body", "accent"), rect(parent, "Search / field", 16, 16, 270, 44, "canvas", "control", 6), text(parent, "Search / query", "запуск", 32, 27, 220, 24, "BodyMedium"), text(parent, "Search / caption", "4 РЕЗУЛЬТАТА", 20, 92, 300, 18, "Caption", "muted")]
    results = [("Запуск продукта", "Продукт", "…что входит в запуск…"), ("Требования к запуску", "Продукт / Требования", "…критерии готовности…"), ("План запуска", "Исследование", "…проверить перед запуском…"), ("Ретроспектива", "Команда", "…после запуска обсудить…")]
    for i, (title, path, snippet) in enumerate(results):
        y = 136 + i * 126
        ops += [line(parent, "Result / rule", 20, y - 14, 335), icon(parent, "file", 22, y + 2), text(parent, "Result / title", title, 54, y, 290, 26, "BodyMedium"), text(parent, "Result / path", path, 54, y + 34, 290, 20, "Small", "muted"), text(parent, "Result / snippet", snippet, 54, y + 64, 290, 22, "Small", "muted")]
    return ops


def share_detail_screen(parent, project=False):
    entity = "проектом" if project else "страницей"
    title = "Продукт" if project else "Запуск продукта"
    base_ops = shell(parent, title, editor=True) + editor_content(parent)
    base_ops += [rect(parent, "Share / backdrop", 264, 56, 1176, 844, "backdrop", opacity=.2)]
    place_component("Dialog / Container", parent, 400, 80, 640, 740, f"Поделиться {entity}")
    ops = [text(parent, "Share / page", title, 432, 148, 500, 22, "Body", "muted"), text(parent, "Share / invite label", "Пригласить человека", 432, 194, 320, 18, "SmallMedium")]
    ops += input_field(parent, "", "Имя участника или почта", 432, 220, 290)
    ops += [rect(parent, "Share / invite right", 734, 220, 130, 40, "paper", "line", 6), text(parent, "Share / invite right value", "Смотреть", 746, 229, 106, 22, "Small")]
    ops += button(parent, "Пригласить", 876, 220, 132)
    ops += [text(parent, "Share / people caption", "ЛЮДИ С ДОСТУПОМ", 432, 290, 400, 18, "Caption", "muted")]
    people = [("Антон Крылов", "Владелец"), ("Мария Соколова", "Смотреть и править")]
    for index, (name, right) in enumerate(people):
        y = 322 + index * 44
        ops += [rect(parent, "Person / avatar", 432, y, 30, 30, "accentSoft", radius=15), text(parent, "Person / initial", name[0], 442, y + 5, 12, 18, "SmallMedium", "accent"), text(parent, "Person / name", name, 474, y + 4, 250, 22, "BodyMedium"), text(parent, "Person / right", right, 770, y + 5, 238, 20, "Small", "muted", "RIGHT")]
    ops += [line(parent, "Share / people rule", 432, 420, 576), text(parent, "Share / scope caption", "КТО МОЖЕТ ОТКРЫТЬ", 432, 444, 400, 18, "Caption", "muted")]
    scopes = [("Только участники workspace", True), ("Любой зарегистрированный", False), ("Любой по ссылке", False)]
    for index, (label, selected) in enumerate(scopes):
        y = 478 + index * 40
        ops += [rect(parent, "Scope / radio", 432, y + 2, 16, 16, "accent" if selected else "paper", "accent" if selected else "control", 8), text(parent, "Scope / label", label, 460, y, 440, 22, "Body")]
    ops += [text(parent, "Share / scope right caption", "ПРАВО ДЛЯ ВЫБРАННОГО КРУГА", 432, 610, 420, 18, "Caption", "muted"), rect(parent, "Share / scope right", 432, 638, 360, 40, "paper", "line", 6), text(parent, "Share / scope right value", "Только смотреть", 444, 647, 320, 22, "Body")]
    ops += button(parent, "Скопировать ссылку", 432, 704, 200, False)
    ops += [text(parent, "Share / link note", "Ссылка не меняет круг доступа: открыть страницу смогут только люди из выбранного круга.", 432, 754, 576, 40, "Small", "muted")]
    if project:
        ops += [text(parent, "Share / inheritance", "Наследование доступа на вложенные страницы ещё не решено.", 432, 796, 576, 18, "Small", "warning")]
    return base_ops, ops


def slash_screen(parent):
    ops = shell(parent, "Запуск продукта", editor=True) + editor_content(parent)
    ops += [rect(parent, "Slash / menu", 820, 64, 380, 792, "paper", "line", 8), text(parent, "Slash / title", "Вставить блок", 836, 78, 300, 22, "BodyMedium"), text(parent, "Slash / query", "/ в тексте страницы", 1010, 80, 170, 18, "Small", "muted", "RIGHT")]
    groups = [
        ("Текст", [("text", "Текст", "Обычный абзац"), ("h1", "Заголовок 1", "Крупная глава"), ("h2", "Заголовок 2", "Средняя глава"), ("h3", "Заголовок 3", "Малая глава")]),
        ("Списки", [("bullet", "Маркированный список", "Простой список"), ("ordered", "Нумерованный список", "Шаги по порядку"), ("task", "Список дел", "Задачи с отметками")]),
        ("Оформление", [("quote", "Цитата", "Выделенная мысль"), ("code", "Код", "Блок без форматирования"), ("divider", "Разделитель", "Линия между частями")]),
        ("Структура", [("table", "Таблица", "Три строки и три колонки")]),
        ("Медиа", [("image", "Картинка", "По ссылке")]),
    ]
    y = 116
    for group, commands in groups:
        ops += [text(parent, f"Slash / {group}", group, 840, y, 300, 18, "Caption", "muted")]
        y += 22
        for command_id, label, hint in commands:
            place_component("Menu / Item / Active" if command_id == "h2" else "Menu / Item", parent, 832, y, 356, 46, label, hint)
            y += 48
    ops += [line(parent, "Slash / footer rule", 820, 818, 380), text(parent, "Slash / shortcuts", "↑↓ выбрать     Enter вставить     Esc закрыть", 836, 828, 348, 18, "Small", "muted")]
    return ops


def block_menu_screen(parent):
    ops = shell(parent, "Запуск продукта", editor=True) + editor_content(parent)
    ops += [rect(parent, "Block / selected", 320, 392, 792, 56, "accentSoft", None, 6), text(parent, "Block / selected text", "Что входит в запуск", 336, 408, 700, 30, "Heading"), icon(parent, "more", 300, 408)]
    ops += [rect(parent, "Block menu / surface", 360, 456, 256, 166, "paper", "line", 8), text(parent, "Block menu / caption", "ДЕЙСТВИЯ С БЛОКОМ", 376, 466, 210, 18, "Caption", "muted")]
    place_component("Menu / Item / Active", parent, 368, 490, 240, 40, "Превратить в", "Выбрать тип блока")
    place_component("Menu / Item", parent, 368, 532, 240, 40, "Дублировать", "Создать копию ниже")
    place_component("Menu / Item / Danger", parent, 368, 574, 240, 40, "Удалить", "Убрать блок")
    ops += [rect(parent, "Turn menu / surface", 628, 456, 304, 398, "paper", "line", 8), text(parent, "Turn menu / caption", "ПРЕВРАТИТЬ В", 644, 466, 240, 18, "Caption", "muted")]
    commands = [("Текст", "Обычный абзац"), ("Заголовок 1", "Крупная глава"), ("Заголовок 2", "Средняя глава"), ("Заголовок 3", "Малая глава"), ("Маркированный список", "Простой список"), ("Нумерованный список", "Шаги по порядку"), ("Список дел", "Задачи с отметками"), ("Цитата", "Выделенная мысль"), ("Код", "Блок без форматирования")]
    for index, (label, hint) in enumerate(commands):
        place_component("Menu / Item", parent, 636, 490 + index * 40, 288, 40, label, hint)
    return ops


def block_group_screen(parent):
    ops = shell(parent, "Запуск продукта", editor=True)
    labels = ["Вводный блок", "Первый блок группы", "Второй блок группы", "Третий блок группы", "Блок после группы"]
    ops += [
        text(parent, "Group / selection title", "1 · Выделение группы и меню", 320, 88, 760, 22, "SmallMedium"),
        text(parent, "Group / selection hint", "Esc · Shift + ↑/↓ · протягивание слева", 320, 118, 760, 20, "Small", "muted"),
        rect(parent, "Group / selected range", 320, 204, 792, 144, "accentSoft", None, 6),
        rect(parent, "Group / selected edge", 320, 204, 2, 144, "accent"),
    ]
    for index, label in enumerate(labels):
        ops.append(text(parent, f"Group / row {index + 1}", label, 336, 168 + index * 48, 740, 28, "Editor"))
    ops += [
        icon(parent, "more", 292, 219),
        rect(parent, "Group menu / surface", 360, 356, 256, 126, "paper", "line", 8),
        text(parent, "Group menu / caption", "ДЕЙСТВИЯ С ГРУППОЙ", 376, 366, 210, 18, "Caption", "muted"),
        text(parent, "Group / drag title", "2 · Перетаскивание группы", 320, 524, 760, 22, "SmallMedium"),
        text(parent, "Group / drag hint", "Захват внутри выделения · направляющая показывает новое место", 320, 554, 760, 20, "Small", "muted"),
        rect(parent, "Group / dragged range", 320, 636, 792, 144, "accentSoft", None, 6),
        rect(parent, "Group / dragged edge", 320, 636, 2, 144, "accent"),
    ]
    for index, label in enumerate(labels):
        ops.append(text(parent, f"Group / dragged row {index + 1}", label, 336, 600 + index * 48, 740, 28, "Editor"))
    ops += [
        icon(parent, "more", 292, 651),
        rect(parent, "Group / drop indicator", 320, 844, 792, 2, "accent"),
    ]
    place_component("Menu / Item", parent, 368, 390, 240, 40, "Дублировать", "Создать копии ниже")
    place_component("Menu / Item / Danger", parent, 368, 430, 240, 40, "Удалить", "Убрать группу")
    return ops


def design_system_screen(parent):
    base_ops = [rect(parent, "Background", 0, 0, 1440, 900, "canvas")]
    ops = [text(parent, "DS / title", "Дизайн-система Wiki", 48, 40, 800, 40, "Display"), text(parent, "DS / subtitle", "Один источник токенов и компонентов для Figma и кода · версия 1", 48, 88, 900, 24, "Body", "muted")]
    ops += [text(parent, "DS / colors", "ЦВЕТА", 48, 144, 300, 18, "Caption", "muted")]
    for index, token in enumerate(("paper", "canvas", "sidebar", "ink", "muted", "line", "accent", "accentSoft", "danger", "info")):
        x = 48 + index * 104
        ops += [rect(parent, f"Color / {token}", x, 176, 88, 56, token, "line", 6), text(parent, f"Color / {token} label", token, x, 240, 88, 18, "Small", "muted")]
    ops += [text(parent, "DS / typography", "ТИПОГРАФИКА · ONEST", 48, 296, 400, 18, "Caption", "muted"), text(parent, "DS / display", "Display · Рабочие знания", 48, 330, 560, 36, "Display"), text(parent, "DS / title sample", "Title · Название диалога", 48, 382, 560, 30, "Title"), text(parent, "DS / body sample", "Body · Основной интерфейсный текст 14/22", 48, 428, 560, 24, "Body"), text(parent, "DS / small sample", "Small · Вспомогательный текст 13/20", 48, 462, 560, 20, "Small", "muted")]
    ops += [text(parent, "DS / buttons", "КНОПКИ И ПОЛЯ", 680, 296, 400, 18, "Caption", "muted")]
    place_component("Button / Primary", parent, 680, 328, 180, 40, "Основное действие")
    place_component("Button / Secondary", parent, 876, 328, 180, 40, "Второе действие")
    place_component("Icon Button / Default", parent, 1072, 328, 40, 40)
    place_component("Field / Input", parent, 680, 392, 360, 40, "Имя участника или почта")
    ops += [text(parent, "DS / menu", "ПУНКТ МЕНЮ", 680, 464, 400, 18, "Caption", "muted")]
    place_component("Menu / Item / Active", parent, 680, 496, 360, 52, "Заголовок 2", "Средняя глава · активный пункт")
    ops += [text(parent, "DS / navigation", "НАВИГАЦИЯ", 48, 716, 400, 18, "Caption", "muted")]
    place_component("Navigation / Active", parent, 48, 748, 236, 36, "Запуск продукта")
    ops += [text(parent, "DS / rules", "ПРАВИЛА", 48, 544, 400, 18, "Caption", "muted"), text(parent, "DS / rule list", "• Контрол 40 px, компактный 32 px, увеличенный 44 px\n• Радиус контрола 6 px, меню 8 px, диалога 10 px\n• Отступы кратны 4 px; состояния не зависят только от цвета\n• Без локальных кнопок, градиентов, свечения и декоративного шума", 48, 578, 720, 112, "Body")]
    place_component("Dialog / Container", parent, 768, 584, 608, 280, "Переиспользуемый диалог")
    ops += [text(parent, "DS / dialog note", "Общая поверхность, заголовок, закрытие, фокус и отступы.", 928, 650, 380, 48, "Body", "muted")]
    ops += button(parent, "Действие", 928, 748, 160)
    return base_ops, ops


SCREENS = [
    ("P01 · Вход / Desktop", 1440, 900, auth_screen),
    ("P02 · Редактор / Desktop", 1440, 900, lambda p: shell(p, "Запуск продукта", editor=True) + editor_content(p)),
    ("P03 · Поиск / Desktop", 1440, 900, search_screen),
    ("P04 · Доступ / Desktop", 1440, 900, share_screen),
    ("P05 · Входящие / Desktop", 1440, 900, inbox_screen),
    ("P06 · Комментарии / О-9 / Desktop", 1440, 900, comments_screen),
    ("P07 · Задачи / Desktop", 1440, 900, tasks_screen),
    ("P08 · Агенты и MCP / Desktop", 1440, 900, agents_screen),
    ("P09 · Граф / Desktop", 1440, 900, graph_screen),
    ("P10 · Скиллы / Desktop", 1440, 900, skills_screen),
    ("P11 · Плагины BPMN и PlantUML / Desktop", 1440, 900, plugins_screen),
    ("P12 · Workspace и организация / Desktop", 1440, 900, workspace_screen),
    ("P13 · Приложения и синхронизация / Desktop", 1440, 900, apps_screen),
    ("P14 · Редактор / Mobile", 375, 812, mobile_editor),
    ("P15 · Поиск / Mobile", 375, 812, mobile_search),
    ("P16 · Доступ к странице / Desktop", 1440, 900, lambda p: share_detail_screen(p)),
    ("P17 · Доступ к проекту / Desktop", 1440, 900, lambda p: share_detail_screen(p, project=True)),
    ("P18 · Slash-меню / Desktop", 1440, 900, slash_screen),
    ("P19 · Дизайн-система / Desktop", 1440, 900, design_system_screen),
    ("P20 · Меню блока / Desktop", 1440, 900, block_menu_screen),
    ("P21 · Группа блоков / Desktop", 1440, 900, block_group_screen),
]


def main():
    mcp = MCP()
    state = json.loads(STATE_PATH.read_text()) if STATE_PATH.exists() else {"completed": []}
    try:
        mcp.connect()
        document = mcp.tool("figma.get_document", {})
        page = next((p for p in document["pages"] if p["name"] == PAGE_NAME), None)
        if page and "pageId" not in state:
            raise RuntimeError("Product page already exists without a state ledger")
        if not page:
            created = mcp.tool("figma.call_api", {"target": "figma", "method": "createPage", "args": []})
            page_id = created["createdNodeIds"][0]
            set_prop(mcp, "page", "name", PAGE_NAME, pageId=page_id)
            state["pageId"] = page_id
            save_state(state)
        page_id = state["pageId"]
        api(mcp, "figma", "setCurrentPageAsync", [{"$pageId": page_id}])
        state["foundations"] = foundations(mcp, page_id)
        save_state(state)
        COLOR_IDS.update(state["foundations"]["colors"])
        VALUE_IDS.update(state["foundations"]["values"])
        STYLE_IDS.update(state["foundations"]["styles"])
        COMPONENTS.update(state["foundations"]["components"])
        state.setdefault("frames", {})
        missing_screens = [(i, screen) for i, screen in enumerate(SCREENS) if screen[0] not in state["frames"]]
        if missing_screens:
            operations = []
            for i, (name, width, height, _) in missing_screens:
                if i < 13:
                    x, y = (i % 4) * 1520, (i // 4) * 1000
                elif i < 15:
                    x, y = (i - 13) * 455, 4000
                else:
                    x, y = (i - 15) * 1520, 6000
                operations.append({"command": "CREATE_FRAME", "payload": {"parentId": page_id, "name": name, "x": x, "y": y, "width": width, "height": height, "style": style("paper")}})
            results = mcp.batch(operations)
            for (_, screen), result in zip(missing_screens, results):
                state["frames"][screen[0]] = result["result"]["node"]["id"]
            save_state(state)
        for name, _, _, builder in SCREENS:
            if name in state["completed"]:
                continue
            frame_id = state["frames"][name]
            operations = builder(frame_id)
            if isinstance(operations, tuple):
                base_operations, content_operations = operations
                flush(mcp, base_operations)
                flush_placements(mcp, EARLY_PLACEMENTS)
                flush(mcp, content_operations)
            else:
                flush_placements(mcp, EARLY_PLACEMENTS)
                flush(mcp, operations)
            flush_placements(mcp)
            state["completed"].append(name)
            save_state(state)
            print(f"built {name}", flush=True)
        state["exports"] = {}
        for i, (name, width, _, _) in enumerate(SCREENS):
            exported = mcp.tool("figma.export_node", {"nodeId": state["frames"][name], "format": "PNG", "scale": .5 if width > 400 else 1})
            filename = f"{i+1:02d}-{name.split(' · ')[1].split(' / ')[0].lower().replace(' ', '-')}.png"
            (OUT / filename).write_bytes(base64.b64decode(exported["base64"]))
            state["exports"][name] = str(OUT / filename)
        state["done"] = True
        save_state(state)
        print(json.dumps({"ok": True, "pageId": page_id, "screens": len(state["completed"]), "exports": state["exports"]}, ensure_ascii=False, indent=2))
    finally:
        mcp.close()


if __name__ == "__main__":
    main()
