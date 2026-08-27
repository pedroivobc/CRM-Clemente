"""Marca d'água com o logo do tenant sobre as fotos dos imóveis."""

from __future__ import annotations

import io

from PIL import Image

# Padrões deliberadamente discretos: a foto vende, o logo só assina. Vai
# mais leve que o comum do mercado — dá para escurecer por tenant nas
# properties.watermark_settings.
LOGO_WIDTH_RATIO = 0.15
MARGIN_RATIO = 0.02
DEFAULT_OPACITY = 0.35
MAX_DIMENSION = 2000


def apply_watermark(
    photo_bytes: bytes,
    logo_bytes: bytes | None,
    *,
    opacity: float = DEFAULT_OPACITY,
    position: str = "bottom-right",
) -> bytes:
    """Devolve a foto em JPEG com o logo aplicado no canto indicado.

    Sem logo cadastrado, a foto é apenas normalizada (redimensionada e
    convertida), de modo que a versão pública exista sempre.
    """
    photo = Image.open(io.BytesIO(photo_bytes))
    photo = _normalize(photo)

    if logo_bytes:
        logo = Image.open(io.BytesIO(logo_bytes)).convert("RGBA")
        logo = _resize_logo(logo, photo.width)
        logo = _apply_opacity(logo, opacity)
        photo.alpha_composite(logo, _anchor(photo.size, logo.size, position))

    out = io.BytesIO()
    photo.convert("RGB").save(out, format="JPEG", quality=88, optimize=True)
    return out.getvalue()


def _normalize(photo: Image.Image) -> Image.Image:
    photo = photo.convert("RGBA")
    if max(photo.size) > MAX_DIMENSION:
        photo.thumbnail((MAX_DIMENSION, MAX_DIMENSION), Image.LANCZOS)
    return photo


def _resize_logo(logo: Image.Image, photo_width: int) -> Image.Image:
    target_w = max(1, int(photo_width * LOGO_WIDTH_RATIO))
    ratio = target_w / logo.width
    target_h = max(1, int(logo.height * ratio))
    return logo.resize((target_w, target_h), Image.LANCZOS)


def _apply_opacity(logo: Image.Image, opacity: float) -> Image.Image:
    opacity = min(max(opacity, 0.0), 1.0)
    alpha = logo.getchannel("A").point(lambda v: int(v * opacity))
    logo.putalpha(alpha)
    return logo


def _anchor(
    photo_size: tuple[int, int], logo_size: tuple[int, int], position: str
) -> tuple[int, int]:
    pw, ph = photo_size
    lw, lh = logo_size
    margin = int(pw * MARGIN_RATIO)
    positions = {
        "bottom-right": (pw - lw - margin, ph - lh - margin),
        "bottom-left": (margin, ph - lh - margin),
        "top-right": (pw - lw - margin, margin),
        "top-left": (margin, margin),
        "center": ((pw - lw) // 2, (ph - lh) // 2),
    }
    x, y = positions.get(position, positions["bottom-right"])
    return max(0, x), max(0, y)
