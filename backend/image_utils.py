"""Image utilities for FeGrro.

Generates small JPEG thumbnails from base64 input images.
Used so list endpoints can return tiny thumbs (~3-5 KB) instead of full 200 KB photos.
"""
import base64
import io
import logging
from typing import Optional

logger = logging.getLogger(__name__)

try:
    from PIL import Image
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False
    logger.warning("Pillow not available - thumbnail generation disabled")


def _split_data_url(b64_input: str):
    """Returns (header_or_None, raw_b64_string)."""
    if not b64_input:
        return None, None
    s = b64_input.strip()
    if s.startswith('data:'):
        try:
            header, b64 = s.split(',', 1)
            return header, b64
        except ValueError:
            return None, None
    return None, s


def make_thumbnail(b64_input: Optional[str], max_size: int = 96, quality: int = 75) -> Optional[str]:
    """Generate JPEG thumbnail as a data: URL from any base64 image input.

    Returns None if Pillow is unavailable, input is empty, or decoding fails.
    Output is always JPEG (lossy, smaller). Animated GIFs collapse to first frame.
    """
    if not PIL_AVAILABLE or not b64_input:
        return None
    try:
        _, b64 = _split_data_url(b64_input)
        if not b64:
            return None
        raw = base64.b64decode(b64)
        img = Image.open(io.BytesIO(raw))
        # Strip transparency: composite onto white (JPEG has no alpha)
        if img.mode in ('RGBA', 'LA', 'P'):
            img = img.convert('RGBA')
            bg = Image.new('RGB', img.size, (255, 255, 255))
            bg.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
            img = bg
        else:
            img = img.convert('RGB')
        img.thumbnail((max_size, max_size), Image.LANCZOS)
        out = io.BytesIO()
        img.save(out, format='JPEG', quality=quality, optimize=True)
        out_b64 = base64.b64encode(out.getvalue()).decode('ascii')
        return f"data:image/jpeg;base64,{out_b64}"
    except Exception as e:
        logger.warning(f"Thumbnail generation failed: {e}")
        return None


def is_likely_image(b64_input: Optional[str]) -> bool:
    if not b64_input:
        return False
    s = b64_input.strip()
    return s.startswith('data:image/') or len(s) > 100
