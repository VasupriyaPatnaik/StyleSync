import hashlib
import io
import json
import os
import re
from collections import Counter
from datetime import datetime
from typing import Any
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup
from bson import ObjectId
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field
from pymongo import ASCENDING, ReturnDocument
from pymongo.mongo_client import MongoClient

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    Image = None

try:
    from playwright.sync_api import sync_playwright
except ImportError:  # pragma: no cover
    sync_playwright = None


MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
MONGODB_DB = os.getenv("MONGODB_DB", "stylesync")

mongo_client = MongoClient(MONGODB_URI)
mongo_db = mongo_client[MONGODB_DB]


app = FastAPI(title="StyleSync API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup() -> None:
    mongo_db.scraped_sites.create_index([("site_id", ASCENDING)], unique=True)
    mongo_db.scraped_sites.create_index([("url", ASCENDING)])
    mongo_db.design_tokens.create_index([("site_id", ASCENDING)], unique=True)
    mongo_db.locked_tokens.create_index([("site_id", ASCENDING), ("token_path", ASCENDING)], unique=True)
    mongo_db.version_history.create_index([("site_id", ASCENDING), ("created_at", ASCENDING)])
    mongo_db.counters.update_one(
        {"_id": "site_id"},
        {"$setOnInsert": {"seq": 0}},
        upsert=True,
    )


class AnalyzeRequest(BaseModel):
    url: str
    site_id: int | None = None
    use_browser: bool = False


class TokensPayload(BaseModel):
    colors: dict[str, Any]
    typography: dict[str, Any]
    spacing: dict[str, Any]


class TokenUpdateRequest(BaseModel):
    tokens: TokensPayload
    source: str = Field(default="manual-edit")


class LockRequest(BaseModel):
    token_path: str
    locked: bool
    value: Any | None = None


def normalize_url(url: str) -> str:
    if not url.startswith(("http://", "https://")):
        return f"https://{url}"
    return url


def rgb_to_hex(raw: str) -> str | None:
    match = re.search(r"rgba?\((\d+),\s*(\d+),\s*(\d+)", raw)
    if not match:
        return None
    r, g, b = (int(match.group(i)) for i in range(1, 4))
    return f"#{r:02x}{g:02x}{b:02x}"


def get_nested_value(data: dict[str, Any], path: str) -> Any:
    cursor: Any = data
    for part in path.split("."):
        if not isinstance(cursor, dict) or part not in cursor:
            return None
        cursor = cursor[part]
    return cursor


def set_nested_value(data: dict[str, Any], path: str, value: Any) -> None:
    parts = path.split(".")
    cursor = data
    for part in parts[:-1]:
        if part not in cursor or not isinstance(cursor[part], dict):
            cursor[part] = {}
        cursor = cursor[part]
    cursor[parts[-1]] = value


def dedupe_keep_order(items: list[str]) -> list[str]:
    seen = set()
    result = []
    for item in items:
        lowered = item.lower()
        if lowered not in seen:
            seen.add(lowered)
            result.append(item)
    return result


def build_fallback_tokens(url: str) -> dict[str, Any]:
    digest = hashlib.md5(url.encode("utf-8")).hexdigest()
    seed = int(digest[:6], 16)
    primary = f"#{seed & 0xFFFFFF:06x}"
    secondary = f"#{(seed ^ 0x334455) & 0xFFFFFF:06x}"
    accent = f"#{(seed ^ 0x667788) & 0xFFFFFF:06x}"
    return {
        "colors": {
            "primary": primary,
            "secondary": secondary,
            "accent": accent,
            "surface": "#ffffff",
            "text": "#121212",
            "muted": "#f3f4f6",
        },
        "typography": {
            "headingFont": "system-ui",
            "bodyFont": "system-ui",
            "baseSize": "16px",
            "lineHeight": 1.5,
            "headingWeight": 700,
            "bodyWeight": 400,
        },
        "spacing": {
            "unit": 8,
            "scale": [0, 4, 8, 12, 16, 24, 32, 48],
            "radius": {"sm": 6, "md": 10, "lg": 16},
        },
    }


def extract_image_palette(image_urls: list[str], base_url: str) -> list[str]:
    if Image is None:
        return []
    colors: list[str] = []
    for src in image_urls[:4]:
        full_url = urljoin(base_url, src)
        try:
            img_res = requests.get(full_url, timeout=6)
            img_res.raise_for_status()
            image = Image.open(io.BytesIO(img_res.content)).convert("RGB")
            small = image.resize((64, 64))
            pixels = list(small.getdata())
            common = Counter(pixels).most_common(3)
            for rgb, _ in common:
                colors.append(f"#{rgb[0]:02x}{rgb[1]:02x}{rgb[2]:02x}")
        except Exception:
            continue
    return dedupe_keep_order(colors)


def scrape_html(url: str, use_browser: bool = False) -> tuple[str, list[str], list[str], list[str], str]:
    browser_warnings: list[str] = []
    computed_styles: list[str] = []
    image_urls: list[str] = []
    status = "ok"

    if use_browser and sync_playwright is not None:
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                page = browser.new_page()
                page.goto(url, timeout=20000, wait_until="networkidle")
                html = page.content()
                image_urls = page.eval_on_selector_all(
                    "img",
                    "(els) => els.map(el => el.getAttribute('src')).filter(Boolean)",
                )
                computed_styles = page.eval_on_selector_all(
                    "*",
                    """
                    (els) => els.slice(0, 220).map(el => {
                        const s = getComputedStyle(el);
                        return `${s.color};${s.backgroundColor};${s.fontFamily};${s.fontSize};${s.margin};${s.padding};`;
                    })
                    """,
                )
                browser.close()
                return html, browser_warnings, computed_styles, image_urls, status
        except Exception as exc:
            message = str(exc)
            if "Executable doesn't exist" not in message and "download new browsers" not in message:
                browser_warnings.append(f"Browser scrape fallback used: {exc}")
                status = "partial"

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    }
    res = requests.get(url, headers=headers, timeout=12)
    res.raise_for_status()
    soup = BeautifulSoup(res.text, "html.parser")
    image_urls = [img.get("src") for img in soup.select("img[src]") if img.get("src")]
    return res.text, browser_warnings, computed_styles, image_urls, status


def extract_tokens_from_html(url: str, html: str, computed_styles: list[str], image_urls: list[str]) -> dict[str, Any]:
    soup = BeautifulSoup(html, "html.parser")
    full_text = "\n".join([html, *computed_styles])

    hex_colors = re.findall(r"#(?:[0-9a-fA-F]{3}){1,2}", full_text)
    rgb_raw = re.findall(r"rgba?\([^\)]*\)", full_text)
    rgb_as_hex = [rgb_to_hex(rgb) for rgb in rgb_raw]
    rgb_as_hex = [c for c in rgb_as_hex if c]

    inline_colors = []
    for style_tag in soup.select("[style]"):
        style_text = style_tag.get("style", "")
        inline_colors.extend(re.findall(r"#(?:[0-9a-fA-F]{3}){1,2}", style_text))

    image_palette = extract_image_palette(image_urls, url)
    color_pool = dedupe_keep_order([*hex_colors, *rgb_as_hex, *inline_colors, *image_palette])

    if not color_pool:
        color_pool = ["#111827", "#374151", "#2563eb", "#ffffff", "#f3f4f6"]

    font_candidates = re.findall(r"font-family\s*:\s*([^;\n]+)", full_text, flags=re.IGNORECASE)
    font_candidates += [
        f.get("content", "") for f in soup.select('meta[property="og:site_name"]') if f.get("content")
    ]
    cleaned_fonts = []
    for item in font_candidates:
        primary = item.split(",")[0].strip().strip("\"'")
        if primary and len(primary) < 40:
            cleaned_fonts.append(primary)
    cleaned_fonts = dedupe_keep_order(cleaned_fonts)

    font_sizes = re.findall(r"font-size\s*:\s*([\d\.]+)px", full_text, flags=re.IGNORECASE)
    numeric_sizes = [float(v) for v in font_sizes if 10 <= float(v) <= 72]
    base_size = f"{int(round(sum(numeric_sizes) / len(numeric_sizes)))}px" if numeric_sizes else "16px"

    spacing_vals = re.findall(r"(?:margin|padding)[^:\n]*:\s*([\d\.]+)px", full_text, flags=re.IGNORECASE)
    spacing_numbers = sorted({int(float(v)) for v in spacing_vals if 0 <= float(v) <= 96})
    if not spacing_numbers:
        spacing_numbers = [0, 4, 8, 12, 16, 24, 32, 48]
    unit = 8 if 8 in spacing_numbers else max(4, min(spacing_numbers[1] if len(spacing_numbers) > 1 else 8, 16))

    return {
        "colors": {
            "primary": color_pool[0],
            "secondary": color_pool[1] if len(color_pool) > 1 else color_pool[0],
            "accent": color_pool[2] if len(color_pool) > 2 else color_pool[0],
            "surface": color_pool[3] if len(color_pool) > 3 else "#ffffff",
            "text": color_pool[4] if len(color_pool) > 4 else "#111827",
            "muted": color_pool[5] if len(color_pool) > 5 else "#f3f4f6",
        },
        "typography": {
            "headingFont": cleaned_fonts[0] if cleaned_fonts else "system-ui",
            "bodyFont": cleaned_fonts[1] if len(cleaned_fonts) > 1 else (cleaned_fonts[0] if cleaned_fonts else "system-ui"),
            "baseSize": base_size,
            "lineHeight": 1.5,
            "headingWeight": 700,
            "bodyWeight": 400,
        },
        "spacing": {
            "unit": unit,
            "scale": spacing_numbers[:10],
            "radius": {"sm": 6, "md": 12, "lg": 18},
        },
    }


def apply_locks(tokens: dict[str, Any], locks: list[dict[str, Any]]) -> dict[str, Any]:
    merged = json.loads(json.dumps(tokens))
    for lock in locks:
        set_nested_value(merged, lock["token_path"], lock.get("locked_value", {}).get("value"))
    return merged


def snapshot(tokens: dict[str, Any] | None) -> dict[str, Any]:
    if tokens is None:
        return {"colors": {}, "typography": {}, "spacing": {}}
    return {
        "colors": tokens.get("colors", {}),
        "typography": tokens.get("typography", {}),
        "spacing": tokens.get("spacing", {}),
    }


def next_site_id() -> int:
    counter = mongo_db.counters.find_one_and_update(
        {"_id": "site_id"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return int(counter["seq"])


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/sites/analyze")
def analyze_site(payload: AnalyzeRequest) -> dict[str, Any]:
    normalized_url = normalize_url(payload.url)

    if payload.site_id:
        site = mongo_db.scraped_sites.find_one({"site_id": payload.site_id})
        if not site:
            raise HTTPException(status_code=404, detail="Site not found")
        site_id = payload.site_id
    else:
        site_id = next_site_id()
        site = {
            "site_id": site_id,
            "url": normalized_url,
            "raw_html": None,
            "extraction_status": "pending",
            "error_message": None,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }
        mongo_db.scraped_sites.insert_one(site)

    token_record = mongo_db.design_tokens.find_one({"site_id": site_id})
    before = snapshot(token_record)

    warnings: list[str] = []
    try:
        html, browser_warnings, computed_styles, image_urls, status = scrape_html(normalized_url, payload.use_browser)
        warnings.extend(browser_warnings)
        extracted = extract_tokens_from_html(normalized_url, html, computed_styles, image_urls)
        site_update = {
            "url": normalized_url,
            "raw_html": html[:150000],
            "extraction_status": status,
            "error_message": None,
            "updated_at": datetime.utcnow(),
        }
    except Exception as exc:
        extracted = build_fallback_tokens(normalized_url)
        site_update = {
            "url": normalized_url,
            "raw_html": None,
            "extraction_status": "blocked",
            "error_message": str(exc),
            "updated_at": datetime.utcnow(),
        }
        warnings.append("Live scraping failed. Simulated analysis was applied.")

    mongo_db.scraped_sites.update_one({"site_id": site_id}, {"$set": site_update})

    locks = list(mongo_db.locked_tokens.find({"site_id": site_id}))
    merged = apply_locks(extracted, locks)

    mongo_db.design_tokens.update_one(
        {"site_id": site_id},
        {
            "$set": {
                "colors": merged["colors"],
                "typography": merged["typography"],
                "spacing": merged["spacing"],
                "updated_at": datetime.utcnow(),
            },
            "$setOnInsert": {"created_at": datetime.utcnow()},
        },
        upsert=True,
    )

    token_record = mongo_db.design_tokens.find_one({"site_id": site_id})

    after = snapshot(token_record)
    mongo_db.version_history.insert_one(
        {
            "site_id": site_id,
            "before_state": before,
            "after_state": after,
            "source": "analyze",
            "created_at": datetime.utcnow(),
        }
    )

    site_record = mongo_db.scraped_sites.find_one({"site_id": site_id})

    return {
        "siteId": site_id,
        "status": site_record.get("extraction_status", "ok"),
        "warnings": warnings,
        "error": site_record.get("error_message"),
        "tokens": after,
        "lockedTokens": [lock["token_path"] for lock in locks],
    }


@app.get("/api/sites/{site_id}/tokens")
def get_tokens(site_id: int) -> dict[str, Any]:
    token = mongo_db.design_tokens.find_one({"site_id": site_id})
    if not token:
        raise HTTPException(status_code=404, detail="Tokens not found")
    locks = list(mongo_db.locked_tokens.find({"site_id": site_id}))
    return {
        "siteId": site_id,
        "tokens": snapshot(token),
        "lockedTokens": [lock["token_path"] for lock in locks],
    }


@app.put("/api/sites/{site_id}/tokens")
def update_tokens(site_id: int, payload: TokenUpdateRequest) -> dict[str, Any]:
    token = mongo_db.design_tokens.find_one({"site_id": site_id})
    if not token:
        raise HTTPException(status_code=404, detail="Tokens not found")

    before = snapshot(token)
    after = {
        "colors": payload.tokens.colors,
        "typography": payload.tokens.typography,
        "spacing": payload.tokens.spacing,
    }
    mongo_db.design_tokens.update_one(
        {"site_id": site_id},
        {
            "$set": {
                "colors": after["colors"],
                "typography": after["typography"],
                "spacing": after["spacing"],
                "updated_at": datetime.utcnow(),
            }
        },
    )

    mongo_db.version_history.insert_one(
        {
            "site_id": site_id,
            "before_state": before,
            "after_state": after,
            "source": payload.source,
            "created_at": datetime.utcnow(),
        }
    )
    return {"siteId": site_id, "tokens": after}


@app.post("/api/sites/{site_id}/locks")
def lock_token(site_id: int, payload: LockRequest) -> dict[str, Any]:
    token = mongo_db.design_tokens.find_one({"site_id": site_id})
    if not token:
        raise HTTPException(status_code=404, detail="Tokens not found")

    token_state = snapshot(token)

    if payload.locked:
        lock_value = payload.value
        if lock_value is None:
            lock_value = get_nested_value(token_state, payload.token_path)
        mongo_db.locked_tokens.update_one(
            {"site_id": site_id, "token_path": payload.token_path},
            {
                "$set": {"locked_value": {"value": lock_value}},
                "$setOnInsert": {"created_at": datetime.utcnow()},
            },
            upsert=True,
        )
    else:
        mongo_db.locked_tokens.delete_one({"site_id": site_id, "token_path": payload.token_path})

    locks = list(mongo_db.locked_tokens.find({"site_id": site_id}))
    return {"siteId": site_id, "lockedTokens": [lock["token_path"] for lock in locks]}


@app.get("/api/sites/{site_id}/versions")
def list_versions(site_id: int) -> dict[str, Any]:
    entries = list(mongo_db.version_history.find({"site_id": site_id}).sort("created_at", -1))
    return {
        "siteId": site_id,
        "versions": [
            {
                "id": str(entry["_id"]),
                "source": entry.get("source", "unknown"),
                "createdAt": entry.get("created_at"),
            }
            for entry in entries
        ],
    }


@app.post("/api/sites/{site_id}/versions/{version_id}/restore")
def restore_version(site_id: int, version_id: str) -> dict[str, Any]:
    token = mongo_db.design_tokens.find_one({"site_id": site_id})
    if not ObjectId.is_valid(version_id):
        raise HTTPException(status_code=400, detail="Invalid version id")

    version = mongo_db.version_history.find_one({"_id": ObjectId(version_id), "site_id": site_id})
    if not token or not version:
        raise HTTPException(status_code=404, detail="Version not found")

    before = snapshot(token)
    after_state = version.get("after_state", {})
    after = {
        "colors": after_state.get("colors", {}),
        "typography": after_state.get("typography", {}),
        "spacing": after_state.get("spacing", {}),
    }

    mongo_db.design_tokens.update_one(
        {"site_id": site_id},
        {
            "$set": {
                "colors": after["colors"],
                "typography": after["typography"],
                "spacing": after["spacing"],
                "updated_at": datetime.utcnow(),
            }
        },
    )

    mongo_db.version_history.insert_one(
        {
            "site_id": site_id,
            "before_state": before,
            "after_state": after,
            "source": "restore",
            "created_at": datetime.utcnow(),
        }
    )
    return {"siteId": site_id, "tokens": after}


def build_css_variables(tokens: dict[str, Any]) -> str:
    colors = tokens.get("colors", {})
    typography = tokens.get("typography", {})
    spacing = tokens.get("spacing", {})
    scale = spacing.get("scale", [])

    lines = [":root {"]
    for key, value in colors.items():
        lines.append(f"  --color-{key}: {value};")
    lines.append(f"  --font-heading: {typography.get('headingFont', 'system-ui')};")
    lines.append(f"  --font-body: {typography.get('bodyFont', 'system-ui')};")
    lines.append(f"  --font-size-base: {typography.get('baseSize', '16px')};")
    lines.append(f"  --line-height-base: {typography.get('lineHeight', 1.5)};")
    for idx, value in enumerate(scale):
        lines.append(f"  --spacing-{idx}: {value}px;")
    lines.append("}")
    return "\n".join(lines)


@app.get("/api/sites/{site_id}/export")
def export_tokens(
    site_id: int,
    format: str = Query(default="json", pattern="^(json|css|tailwind)$"),
):
    token = mongo_db.design_tokens.find_one({"site_id": site_id})
    if not token:
        raise HTTPException(status_code=404, detail="Tokens not found")
    tokens = snapshot(token)

    if format == "css":
        return PlainTextResponse(build_css_variables(tokens))

    if format == "tailwind":
        theme = {
            "theme": {
                "extend": {
                    "colors": tokens.get("colors", {}),
                    "fontFamily": {
                        "heading": [tokens["typography"].get("headingFont", "system-ui")],
                        "body": [tokens["typography"].get("bodyFont", "system-ui")],
                    },
                    "spacing": {
                        str(i): f"{v}px" for i, v in enumerate(tokens.get("spacing", {}).get("scale", []))
                    },
                }
            }
        }
        return theme

    return tokens