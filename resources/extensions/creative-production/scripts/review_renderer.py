#!/usr/bin/env python3
"""Shared review renderers for Creative Production explorers.

Explorers should emit manifests and choose a preset here instead of writing
bespoke review HTML. That keeps the inspection surfaces consistent while still
allowing product-specific layouts such as image walls or larger text boards.
"""

from __future__ import annotations

import argparse
import base64
import json
import shutil
from datetime import datetime, timezone
from html import escape
from pathlib import Path
from typing import Any

from PIL import Image, ImageOps

PREVIEW_MAX_EDGE = 720
PREVIEW_JPEG_QUALITY = 72
PREVIEW_DIR = "mcp-thumbs"
PREVIEW_ATTEMPTS = (
    {"max_edge": PREVIEW_MAX_EDGE, "quality": PREVIEW_JPEG_QUALITY},
    {"max_edge": 560, "quality": 66},
    {"max_edge": 420, "quality": 58},
    {"max_edge": 320, "quality": 50},
)
MAX_INLINE_DATA_URL_LENGTH = 160_000
JPEG_DATA_URL_PREFIX = "data:image/jpeg;base64,"
MAX_INLINE_JPEG_BYTES = int((MAX_INLINE_DATA_URL_LENGTH - len(JPEG_DATA_URL_PREFIX)) * 3 / 4)
PREVIEWABLE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
DATA_URL_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}

PRESET_ALIASES = {
    "wall": "image-wall",
    "review-wall": "image-wall",
    "image_wall": "image-wall",
    "shot-wall": "image-wall",
    "selector": "selector-board",
    "positioning": "positioning-board",
}

PRESETS: dict[str, dict[str, Any]] = {
    "image-wall": {
        "background": "#fff",
        "text": "#181818",
        "minTileWidth": 220,
        "gapWithCaptions": 18,
        "gapWithoutCaptions": 10,
        "showCaptions": True,
        "chrome": False,
    },
    "selector-board": {
        "background": "#fff",
        "text": "#181818",
        "minTileWidth": 260,
        "gapWithCaptions": 16,
        "gapWithoutCaptions": 12,
        "showCaptions": True,
        "chrome": False,
    },
    "positioning-board": {
        "background": "#fff",
        "text": "#181818",
        "minTileWidth": 320,
        "gapWithCaptions": 18,
        "gapWithoutCaptions": 16,
        "showCaptions": True,
        "chrome": False,
    },
    "moodboard": {
        "background": "#fff",
        "text": "#181818",
        "minTileWidth": 280,
        "gapWithCaptions": 18,
        "gapWithoutCaptions": 14,
        "showCaptions": True,
        "chrome": False,
    },
    "detail-review": {
        "background": "#fff",
        "text": "#181818",
        "minTileWidth": 360,
        "gapWithCaptions": 18,
        "gapWithoutCaptions": 16,
        "showCaptions": True,
        "chrome": False,
    },
}


def normalize_preset(value: str | None) -> str:
    preset = (value or "image-wall").strip()
    preset = PRESET_ALIASES.get(preset, preset)
    if preset not in PRESETS:
        available = ", ".join(sorted(PRESETS))
        raise ValueError(f"Unknown review preset '{value}'. Available presets: {available}")
    return preset


def image_files(out_dir: Path) -> list[Path]:
    web = sorted(out_dir.glob("[0-9]*-*-web.png"))
    if web:
        return web
    return sorted(
        path for path in out_dir.glob("[0-9]*-*.png") if not path.name.endswith("-web.png")
    )


def _index_width(manifest: list[dict[str, Any]]) -> int:
    return 3 if len(manifest) >= 100 else 2


def _manifest_by_output(manifest: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    indexed = {}
    for item in manifest:
        output = item.get("output") or item.get("href") or item.get("src")
        if output:
            indexed[str(output)] = item
            indexed[Path(str(output)).name] = item
    return indexed


def _caption_for(
    item: dict[str, Any] | None,
    fallback_label: str,
    fallback_index: int | str,
    width: int,
) -> str:
    if item:
        label = str(item.get("title") or item.get("label") or fallback_label)
        index = item.get("index", fallback_index)
    else:
        label = fallback_label
        index = fallback_index
    try:
        prefix = f"{int(index):0{width}d}."
    except (TypeError, ValueError):
        prefix = f"{index}."
    return f"<figcaption>{escape(prefix)} {escape(label)}</figcaption>"


def _controls_for(src: str, label: str) -> str:
    return (
        '<div class="tile-controls">'
        '<button class="select-card" type="button" aria-pressed="false">Select</button>'
        f'<a class="download-card" href="{escape(src, quote=True)}" download="{escape(Path(src).name, quote=True)}">Download</a>'
        f'<button class="remove-card" type="button" aria-label="Remove {escape(label, quote=True)}">Remove</button>'
        "</div>"
    )


def _image_cards_from_files(
    files: list[Path],
    manifest: list[dict[str, Any]],
    *,
    show_captions: bool,
    show_controls: bool = False,
) -> list[str]:
    indexed = _manifest_by_output(manifest)
    width = _index_width(manifest)
    cards = []
    for idx, path in enumerate(files, start=1):
        original = path.name.replace("-web.png", ".png")
        item = indexed.get(original) or indexed.get(path.name)
        label = (
            str(item.get("title") or item.get("label"))
            if item
            else path.stem.replace("-web", "").replace("-", " ").title()
        )
        index = item.get("index") if item else path.name.split("-", 1)[0]
        href = escape(str(item.get("href") if item and item.get("href") else original), quote=True)
        src = escape(str(item.get("src") if item and item.get("src") else path.name), quote=True)
        caption = _caption_for(item, label, index or idx, width) if show_captions else ""
        controls = _controls_for(src, label) if show_controls else ""
        if show_controls:
            cards.append(
                f'<figure data-card-id="{escape(str(item.get("id") if item else path.stem), quote=True)}">'
                f'<a class="image-link" href="{href}"><img src="{src}" alt="{escape(label, quote=True)}"></a>'
                f"{controls}{caption}</figure>"
            )
        else:
            cards.append(
                f'<figure><a href="{href}"><img src="{src}" alt="{escape(label, quote=True)}"></a>{caption}</figure>'
            )
    return cards


def _image_cards_from_manifest(
    manifest: list[dict[str, Any]],
    *,
    show_captions: bool,
    show_controls: bool = False,
) -> list[str]:
    width = _index_width(manifest)
    cards = []
    for idx, item in enumerate(manifest, start=1):
        src = item.get("src") or item.get("image") or item.get("imageUrl")
        if not src:
            continue
        href = item.get("href") or src
        label = str(
            item.get("title") or item.get("label") or Path(str(src)).stem.replace("-", " ").title()
        )
        caption = _caption_for(item, label, item.get("index", idx), width) if show_captions else ""
        controls = _controls_for(str(src), label) if show_controls else ""
        if show_controls:
            cards.append(
                f'<figure data-card-id="{escape(str(item.get("id", idx)), quote=True)}">'
                f'<a class="image-link" href="{escape(str(href), quote=True)}">'
                f'<img src="{escape(str(src), quote=True)}" alt="{escape(label, quote=True)}"></a>'
                f"{controls}{caption}</figure>"
            )
        else:
            cards.append(
                f'<figure><a href="{escape(str(href), quote=True)}">'
                f'<img src="{escape(str(src), quote=True)}" alt="{escape(label, quote=True)}"></a>{caption}</figure>'
            )
    return cards


def re_match_http(value: str) -> bool:
    return value.lower().startswith(("http://", "https://"))


def _caption_text(item: dict[str, Any]) -> str:
    explicit = item.get("caption") or item.get("description") or item.get("summary")
    if explicit:
        return str(explicit)
    parts = [
        item.get("routeName"),
        item.get("familyTitle") if item.get("familyTitle") != item.get("title") else None,
        item.get("category"),
    ]
    return " / ".join(str(part) for part in parts if part)


def _moodboard_widget_item(
    item: dict[str, Any] | None,
    image_url: str,
    index: int,
    fallback_id: str,
    *,
    preview_image_url: str | None = None,
    source_image_url: str | None = None,
    image_error: str | None = None,
) -> dict[str, Any]:
    item = item or {}
    title = str(
        item.get("title")
        or item.get("label")
        or Path(image_url).stem.replace("-web", "").replace("-", " ").title()
    )
    result = {
        "id": str(item.get("id") or fallback_id or stable_slug(title, index)),
        "title": title,
        "caption": _caption_text(item),
        "tone": str(item.get("tone") or item.get("category") or item.get("familyTitle") or ""),
        "prompt": str(item.get("prompt") or ""),
        "imageUrl": image_url,
    }
    if preview_image_url:
        result["previewImageUrl"] = preview_image_url
    if source_image_url:
        result["sourceImageUrl"] = source_image_url
    if image_error:
        result["imageError"] = image_error
    return result


def stable_slug(value: str, index: int) -> str:
    slug = "".join(char.lower() if char.isalnum() else "-" for char in value).strip("-")
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug or f"image-{index}"


def safe_file_stem(value: str) -> str:
    slug = "".join(char.lower() if char.isalnum() else "-" for char in value).strip("-")
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug[:64] or "image"


def _image_source_for_file(out_dir: Path, path: Path) -> Path:
    if path.name.endswith("-web.png"):
        original = path.with_name(path.name.replace("-web.png", ".png"))
        if original.exists():
            return original
    return path


def _resolve_local_image_path(out_dir: Path, src: str) -> Path | None:
    if not src or src.startswith(("data:", "blob:")) or re_match_http(src):
        return None
    path = Path(src)
    if path.is_absolute():
        resolved = path
    elif path.exists():
        resolved = path.resolve()
    else:
        resolved = out_dir / path
    return resolved.resolve() if resolved.exists() else None


def _write_data_url_source(out_dir: Path, item_id: str, data_url: str) -> Path | None:
    prefix, _, encoded = data_url.partition(",")
    if ";base64" not in prefix or not encoded:
        return None
    mime_type = prefix.removeprefix("data:").split(";", 1)[0].lower()
    extension = DATA_URL_EXTENSIONS.get(mime_type, ".png")
    source_path = out_dir / "generated" / f"{safe_file_stem(item_id)}{extension}"
    source_path.parent.mkdir(parents=True, exist_ok=True)
    source_path.write_bytes(base64.b64decode(encoded))
    return source_path


def _flatten_to_rgb(image: Image.Image) -> Image.Image:
    image = ImageOps.exif_transpose(image)
    if image.mode in {"RGBA", "LA"} or (image.mode == "P" and "transparency" in image.info):
        canvas = Image.new("RGB", image.size, (255, 255, 255))
        alpha = image.convert("RGBA").getchannel("A")
        canvas.paste(image.convert("RGB"), mask=alpha)
        return canvas
    return image.convert("RGB")


def _create_widget_preview(source_path: Path, preview_path: Path) -> None:
    preview_path.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source_path) as image:
        for attempt in PREVIEW_ATTEMPTS:
            preview = _flatten_to_rgb(image.copy())
            preview.thumbnail((attempt["max_edge"], attempt["max_edge"]), Image.Resampling.LANCZOS)
            preview.save(
                preview_path,
                "JPEG",
                quality=attempt["quality"],
                optimize=True,
                progressive=True,
            )
            if preview_path.stat().st_size <= MAX_INLINE_JPEG_BYTES:
                return
    raise ValueError(
        f"Widget preview remained too large for inline mood-board rendering: {preview_path}"
    )


def _copy_source_into_generated(out_dir: Path, item_id: str, source_path: Path) -> tuple[Path, str]:
    extension = source_path.suffix.lower() or ".png"
    generated_dir = out_dir / "generated"
    generated_dir.mkdir(parents=True, exist_ok=True)
    target_path = generated_dir / f"{safe_file_stem(item_id)}{extension}"
    if source_path.resolve() != target_path.resolve():
        shutil.copyfile(source_path, target_path)
    return target_path, f"/generated/{target_path.name}"


def _materialize_widget_image(
    out_dir: Path,
    image_src: str,
    item_id: str,
) -> tuple[str, str, str, str]:
    if not image_src:
        return "", "", "", "Missing image source for MCP mood-board widget."
    if re_match_http(image_src) or image_src.startswith("blob:"):
        return image_src, "", "", ""

    if image_src.startswith("data:"):
        source_path = _write_data_url_source(out_dir, item_id, image_src)
        if not source_path:
            return (
                "",
                "",
                image_src,
                "Data URL could not be materialized for MCP mood-board widget.",
            )
    else:
        source_path = _resolve_local_image_path(out_dir, image_src)
        if not source_path:
            return (
                "",
                "",
                image_src,
                f"Image source not found for MCP mood-board widget: {image_src}",
            )

    try:
        generated_source_path, source_image_url = _copy_source_into_generated(
            out_dir, item_id, source_path
        )
        if generated_source_path.suffix.lower() not in PREVIEWABLE_EXTENSIONS:
            return (
                "",
                "",
                source_image_url,
                ("Image source could not be converted into a widget-safe JPEG preview."),
            )
        preview_path = out_dir / "generated" / PREVIEW_DIR / f"{safe_file_stem(item_id)}.jpg"
        _create_widget_preview(generated_source_path, preview_path)
        if preview_path.stat().st_size <= 0:
            raise ValueError("created preview is empty")
        preview_image_url = f"/generated/{PREVIEW_DIR}/{preview_path.name}"
        return preview_image_url, preview_image_url, source_image_url, ""
    except Exception as error:  # pragma: no cover - defensive path depends on image codec failures.
        source_url = f"/generated/{safe_file_stem(item_id)}{source_path.suffix.lower() or '.png'}"
        return "", "", source_url, f"Image could not be prepared for MCP mood-board widget: {error}"


def _materialized_moodboard_widget_item(
    out_dir: Path,
    item: dict[str, Any] | None,
    image_src: str,
    index: int,
    fallback_id: str,
) -> dict[str, Any]:
    base_item = item or {}
    title = str(
        base_item.get("title")
        or base_item.get("label")
        or Path(image_src).stem.replace("-web", "").replace("-", " ").title()
    )
    item_id = str(base_item.get("id") or fallback_id or stable_slug(title, index))
    image_url, preview_image_url, source_image_url, image_error = _materialize_widget_image(
        out_dir,
        image_src,
        item_id,
    )
    return _moodboard_widget_item(
        base_item,
        image_url,
        index,
        item_id,
        preview_image_url=preview_image_url,
        source_image_url=source_image_url,
        image_error=image_error,
    )


def moodboard_widget_items(
    out_dir: Path,
    manifest: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    indexed = _manifest_by_output(manifest)
    items: list[dict[str, Any]] = []
    files = image_files(out_dir)
    if files:
        for index, path in enumerate(files, start=1):
            original = path.name.replace("-web.png", ".png")
            manifest_item = indexed.get(original) or indexed.get(path.name)
            source_path = _image_source_for_file(out_dir, path)
            items.append(
                _materialized_moodboard_widget_item(
                    out_dir,
                    manifest_item,
                    source_path.as_posix(),
                    index,
                    str((manifest_item.get("id") if manifest_item else "") or path.stem),
                )
            )
        return items

    for index, manifest_item in enumerate(manifest, start=1):
        src = (
            manifest_item.get("src")
            or manifest_item.get("image")
            or manifest_item.get("imageUrl")
            or manifest_item.get("output")
        )
        if src:
            items.append(
                _materialized_moodboard_widget_item(
                    out_dir,
                    manifest_item,
                    str(src),
                    index,
                    str(manifest_item.get("id") or manifest_item.get("output") or f"image-{index}"),
                )
            )
    return items


def _write_run_state_files(
    out_dir: Path,
    stream_path: Path,
    items: list[dict[str, Any]],
    title: str,
    summary: str,
) -> None:
    run_state_path = out_dir / "run-state.json"
    latest_action_path = out_dir / "latest-action.json"
    item_ids = [str(item.get("id") or "") for item in items if item.get("id")]
    timestamp = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    run_state = {
        "version": 1,
        "runDirectory": str(out_dir.resolve()),
        "streamPath": str(stream_path.resolve()),
        "runStatePath": str(run_state_path.resolve()),
        "latestActionPath": str(latest_action_path.resolve()),
        "paths": {
            "streamPath": str(stream_path.resolve()),
            "runStatePath": str(run_state_path.resolve()),
            "latestActionPath": str(latest_action_path.resolve()),
        },
        "itemCount": len(items),
        "items": items,
        "visibleItemIds": item_ids,
        "hiddenImageIds": [],
        "selectedImageIds": [],
        "currentImageId": item_ids[0] if item_ids else "",
        "updatedAt": timestamp,
    }
    latest_action = {
        "id": "review-renderer-materialized",
        "action": "write_moodboard_widget_payload",
        "label": "Materialized Creative Production image review",
        "createdAt": timestamp,
        "timestamp": timestamp,
        "title": title,
        "summary": summary,
        "itemCount": len(items),
        "runDirectory": str(out_dir.resolve()),
        "streamPath": str(stream_path.resolve()),
        "runStatePath": str(run_state_path.resolve()),
        "latestActionPath": str(latest_action_path.resolve()),
    }
    run_state_path.write_text(json.dumps(run_state, indent=2) + "\n", encoding="utf-8")
    latest_action_path.write_text(json.dumps(latest_action, indent=2) + "\n", encoding="utf-8")


def _static_stream(stream: dict[str, Any]) -> dict[str, Any]:
    return {
        **stream,
        "items": [
            {
                **item,
                **{
                    key: value.removeprefix("/")
                    for key, value in {
                        "imageUrl": item.get("imageUrl"),
                        "previewImageUrl": item.get("previewImageUrl"),
                        "sourceImageUrl": item.get("sourceImageUrl"),
                    }.items()
                    if isinstance(value, str) and value.startswith("/")
                },
            }
            for item in stream.get("items", [])
        ],
    }


def write_moodboard_widget_payload(
    out_dir: Path,
    manifest: list[dict[str, Any]],
    review_options: dict[str, Any] | None = None,
) -> Path:
    review_options = review_options or {}
    title = str(review_options.get("title") or "Creative Production Review")
    summary = str(
        review_options.get("summary")
        or review_options.get("note")
        or "Review, select, and hand off generated Creative Production images."
    )
    items = moodboard_widget_items(out_dir, manifest)
    data_dir = out_dir / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    stream_path = data_dir / "stream.json"
    stream = {
        "meta": {
            "title": title,
            "summary": summary,
            "source": "review_renderer",
            "itemCount": len(items),
        },
        "items": items,
    }
    stream_path.write_text(json.dumps(stream, indent=2) + "\n", encoding="utf-8")
    (data_dir / "stream-static.json").write_text(
        json.dumps(_static_stream(stream), indent=2) + "\n",
        encoding="utf-8",
    )
    _write_run_state_files(out_dir, stream_path, items, title, summary)

    payload_path = out_dir / "moodboard-widget-payload.json"
    payload = {
        "title": title,
        "summary": summary,
        "runDirectory": str(out_dir.resolve()),
        "streamPath": "data/stream.json",
    }
    payload_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return payload_path


def _prompt_cards(manifest: list[dict[str, Any]]) -> list[str]:
    width = _index_width(manifest)
    cards = []
    for idx, item in enumerate(manifest, start=1):
        route = f"<span>{escape(str(item['routeName']))}</span>" if item.get("routeName") else ""
        label = escape(str(item.get("title") or item.get("label") or f"Review item {idx}"))
        prompt = escape(str(item.get("prompt") or ""))
        index = item.get("index", idx)
        try:
            prefix = f"{int(index):0{width}d}."
        except (TypeError, ValueError):
            prefix = f"{index}."
        cards.append(
            '<figure class="prompt-card">'
            f"<figcaption>{escape(prefix)} {label} {route}</figcaption>"
            f"<p>{prompt}</p>"
            "</figure>"
        )
    return cards


def build_review_html(
    out_dir: Path,
    manifest: list[dict[str, Any]],
    review_options: dict[str, Any] | None = None,
) -> Path:
    review_options = review_options or {}
    preset_name = normalize_preset(review_options.get("preset") or review_options.get("layout"))
    preset = PRESETS[preset_name]
    show_captions = bool(review_options.get("showCaptions", preset["showCaptions"]))
    show_prompts = bool(review_options.get("showPrompts", preset.get("showPrompts", True)))
    show_controls = bool(review_options.get("showControls", preset.get("showControls", False)))
    title = str(review_options.get("title") or "Creative Production Review")
    output_name = str(review_options.get("output") or "review-board.html")
    gap = preset["gapWithCaptions"] if show_captions else preset["gapWithoutCaptions"]
    min_tile_width = int(review_options.get("minTileWidth", preset["minTileWidth"]))

    files = image_files(out_dir)
    if files:
        cards = _image_cards_from_files(
            files, manifest, show_captions=show_captions, show_controls=show_controls
        )
    else:
        cards = _image_cards_from_manifest(
            manifest, show_captions=show_captions, show_controls=show_controls
        )
        if not cards and show_prompts:
            cards = _prompt_cards(manifest)
        elif not cards:
            message = str(
                review_options.get("emptyMessage")
                or "Images pending. Generate the selected shots to populate this review wall."
            )
            cards = [f'<section class="empty-state">{escape(message)}</section>']

    interactive_css = (
        """
.tile-controls { display: flex; gap: 6px; margin-top: 7px; opacity: .86; }
.tile-controls button, .tile-controls a { border: 1px solid #dfdfdf; border-radius: 7px; background: #fff; color: #333; cursor: pointer; font: inherit; font-size: 11px; font-weight: 650; line-height: 1; padding: 6px 8px; text-decoration: none; }
.tile-controls button:hover, .tile-controls a:hover { background: #f6f6f6; }
figure.selected img { outline: 3px solid #181818; outline-offset: 2px; }
figure.hidden { display: none; }
.image-viewer { border: 0; border-radius: 10px; padding: 0; max-width: min(94vw, 1400px); background: transparent; }
.image-viewer::backdrop { background: rgba(0, 0, 0, .72); }
.image-viewer-inner { display: grid; gap: 8px; padding: 10px; background: #fff; border-radius: 10px; }
.image-viewer img { max-width: 90vw; max-height: 84vh; width: auto; border: 0; border-radius: 8px; }
.viewer-close { justify-self: end; border: 1px solid #ddd; background: #fff; border-radius: 999px; cursor: pointer; padding: 6px 10px; }
"""
        if show_controls
        else ""
    )

    interactive_html = (
        """
<dialog class="image-viewer" id="imageViewer">
  <div class="image-viewer-inner">
    <button class="viewer-close" type="button">Close</button>
    <img id="viewerImage" alt="">
  </div>
</dialog>
<script>
(function () {
  var key = "creative-production-review:" + location.pathname;
  var stored = {};
  try { stored = JSON.parse(localStorage.getItem(key) || "{}"); } catch (error) { stored = {}; }
  var selected = new Set(stored.selected || []);
  var hidden = new Set(stored.hidden || []);
  function persist() {
    localStorage.setItem(key, JSON.stringify({ selected: Array.from(selected), hidden: Array.from(hidden) }));
  }
  document.querySelectorAll("figure[data-card-id]").forEach(function (card) {
    var id = card.getAttribute("data-card-id");
    if (selected.has(id)) card.classList.add("selected");
    if (hidden.has(id)) card.classList.add("hidden");
    var select = card.querySelector(".select-card");
    if (select) {
      select.setAttribute("aria-pressed", selected.has(id) ? "true" : "false");
      select.textContent = selected.has(id) ? "Selected" : "Select";
      select.addEventListener("click", function () {
        if (selected.has(id)) selected.delete(id);
        else selected.add(id);
        card.classList.toggle("selected", selected.has(id));
        select.setAttribute("aria-pressed", selected.has(id) ? "true" : "false");
        select.textContent = selected.has(id) ? "Selected" : "Select";
        persist();
      });
    }
    var remove = card.querySelector(".remove-card");
    if (remove) {
      remove.addEventListener("click", function () {
        hidden.add(id);
        card.classList.add("hidden");
        persist();
      });
    }
  });
  var viewer = document.getElementById("imageViewer");
  var viewerImage = document.getElementById("viewerImage");
  if (viewer && viewerImage) {
    document.querySelectorAll(".image-link").forEach(function (link) {
      link.addEventListener("click", function (event) {
        event.preventDefault();
        viewerImage.src = link.getAttribute("href");
        if (typeof viewer.showModal === "function") viewer.showModal();
        else location.href = link.getAttribute("href");
      });
    });
    viewer.querySelector(".viewer-close").addEventListener("click", function () { viewer.close(); });
    viewer.addEventListener("click", function (event) { if (event.target === viewer) viewer.close(); });
  }
}());
</script>
"""
        if show_controls
        else ""
    )

    html = f"""<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{escape(title)}</title>
<style>
body {{ margin: 0; font-family: Arial, sans-serif; background: {preset["background"]}; color: {preset["text"]}; }}
main {{ padding: 24px; }}
.grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax({min_tile_width}px, 1fr)); gap: {gap}px; align-items: start; }}
figure {{ margin: 0; }}
img {{ width: 100%; height: auto; display: block; border: 1px solid #e5e5e5; border-radius: 8px; background: #fafafa; }}
figcaption {{ margin-top: 8px; font-size: 13px; line-height: 1.3; color: #333; }}
.prompt-card {{ border: 1px solid #e5e5e5; border-radius: 8px; padding: 14px; background: #fafafa; }}
.prompt-card figcaption {{ margin-top: 0; font-weight: 700; }}
.prompt-card figcaption span {{ display: inline-block; margin-left: 6px; color: #7a4b16; font-weight: 600; }}
.prompt-card p {{ margin: 10px 0 0; font-size: 12px; line-height: 1.45; color: #555; }}
.empty-state {{ border: 1px solid #e5e5e5; border-radius: 8px; padding: 18px; color: #555; background: #fafafa; }}
{interactive_css}
</style>
</head>
<body><main><div class="grid">{"".join(cards)}</div></main>{interactive_html}</body>
</html>
"""
    review_file = out_dir / output_name
    review_file.write_text(html, encoding="utf-8")
    return review_file


def _resolve_image_path(out_dir: Path, src: str) -> Path:
    path = Path(src)
    if path.is_absolute():
        return path
    return out_dir / path


def build_contact_sheet(
    out_dir: Path,
    manifest: list[dict[str, Any]],
    review_options: dict[str, Any] | None = None,
) -> Path | None:
    review_options = review_options or {}
    show_captions = bool(review_options.get("showCaptions", PRESETS["image-wall"]["showCaptions"]))
    try:
        from PIL import Image, ImageDraw, ImageFont
    except Exception:
        return None

    files = image_files(out_dir)
    if files:
        sources = [(path, None) for path in files]
    else:
        sources = []
        for item in manifest:
            src = item.get("src") or item.get("image") or item.get("imageUrl")
            if src:
                sources.append((_resolve_image_path(out_dir, str(src)), item))
    if not sources:
        return None

    indexed = _manifest_by_output(manifest)
    width = _index_width(manifest)
    thumb = int(review_options.get("contactSheetThumb", 260))
    label_h = 54 if show_captions else 0
    gap = 18 if show_captions else 12
    pad = 24
    cols = int(review_options.get("contactSheetColumns", 5))
    rows = (len(sources) + cols - 1) // cols
    sheet_w = pad * 2 + cols * thumb + (cols - 1) * gap
    sheet_h = pad * 2 + rows * (thumb + label_h) + (rows - 1) * gap
    sheet = Image.new("RGB", (sheet_w, sheet_h), "white")
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 14)
    except Exception:
        font = ImageFont.load_default()

    for idx, (path, explicit_item) in enumerate(sources):
        row, col = divmod(idx, cols)
        x = pad + col * (thumb + gap)
        y = pad + row * (thumb + label_h + gap)
        image = Image.open(path).convert("RGB")
        image.thumbnail((thumb, thumb), Image.LANCZOS)
        bx = x + (thumb - image.width) // 2
        by = y + (thumb - image.height) // 2
        draw.rounded_rectangle(
            [x, y, x + thumb, y + thumb], radius=8, outline=(224, 224, 224), width=1
        )
        sheet.paste(image, (bx, by))
        if not show_captions:
            continue
        original = path.name.replace("-web.png", ".png")
        item = explicit_item or indexed.get(original) or indexed.get(path.name)
        label = (
            str(item.get("title") or item.get("label"))
            if item
            else path.stem.replace("-web", "").replace("-", " ").title()
        )
        index = item.get("index") if item else idx + 1
        try:
            prefix = f"{int(index):0{width}d}."
        except (TypeError, ValueError):
            prefix = f"{index}."
        draw.text((x, y + thumb + 8), f"{prefix} {label}", fill=(30, 30, 30), font=font)

    sheet_file = out_dir / str(
        review_options.get("contactSheetOutput") or "offer-contact-sheet.png"
    )
    sheet.save(sheet_file, quality=95)
    return sheet_file


def _read_json_arg(value: str | None) -> dict[str, Any]:
    if not value:
        return {}
    path = Path(value)
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return json.loads(value)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Render a Creative Production review page from a manifest."
    )
    parser.add_argument("--out-dir", required=True, type=Path)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--review-options", help="JSON string or path to a JSON file.")
    parser.add_argument("--preset")
    parser.add_argument("--show-captions", action="store_true")
    parser.add_argument("--hide-captions", action="store_true")
    parser.add_argument("--contact-sheet", action="store_true")
    parser.add_argument("--moodboard-widget-payload", action="store_true")
    args = parser.parse_args()

    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    review_options = _read_json_arg(args.review_options)
    if args.preset:
        review_options["preset"] = args.preset
    if args.show_captions:
        review_options["showCaptions"] = True
    if args.hide_captions:
        review_options["showCaptions"] = False
    review_file = build_review_html(args.out_dir, manifest, review_options)
    contact_sheet = (
        build_contact_sheet(args.out_dir, manifest, review_options) if args.contact_sheet else None
    )
    moodboard_widget_payload = (
        write_moodboard_widget_payload(args.out_dir, manifest, review_options)
        if args.moodboard_widget_payload
        else None
    )
    print(
        json.dumps(
            {
                "review_html": str(review_file.resolve()),
                "contact_sheet": str(contact_sheet.resolve()) if contact_sheet else None,
                "moodboard_widget_payload": (
                    str(moodboard_widget_payload.resolve()) if moodboard_widget_payload else None
                ),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
