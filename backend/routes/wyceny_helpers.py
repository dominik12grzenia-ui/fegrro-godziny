"""Wyceny — wspolne helpery PDF/XLSX (split z routes/wyceny.py iter95ds).

Funkcje wykorzystywane przez generatory eksportow:
- BOM (XLSX + PDF) w wyceny.py
- Wycena export (XLSX + PDF) w wyceny.py
- Wycena client export (XLSX + PDF) w wyceny.py

Brak endpointow w tym pliku — czyste funkcje pomocnicze.
"""
import logging
import os
import urllib.parse
from typing import Optional, List

logger = logging.getLogger(__name__)


def _get_logo_path() -> Optional[str]:
    """iter95cr: zwraca pierwszą istniejącą ścieżkę do logo firmy (PDF/Excel).
    PRIORYTET: bundled backend assets (/app/backend/assets/logo/) — działa na każdym
    deployu (Render itp.) niezależnie od tego, czy frontend jest w tym samym kontenerze.
    Fallback: frontend/public/ dla dev/lokalnego środowiska.
    """
    _backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    _bundled_logo = os.path.join(_backend_dir, "assets", "logo")
    candidates = [
        os.path.join(_bundled_logo, "logo.png"),
        os.path.join(_bundled_logo, "logo-192.png"),
        os.path.join(_bundled_logo, "apple-touch-icon.png"),
        "/app/frontend/public/icon-512x512.png",
        "/app/frontend/public/icon-192x192.png",
        "/app/frontend/public/apple-touch-icon.png",
    ]
    return next((p for p in candidates if os.path.exists(p)), None)


# iter95bw: HTML-escape dla ReportLab Paragraph.
# Paragraph() interpretuje <, >, & jako tagi XML/HTML — jesli nazwa pozycji
# wyceny zawiera te znaki (typowe w budowlance: "Ściana < 30cm", "Beton C20/25 & zbrojenie"),
# PDF generator wywala 500. Eskapujemy wszystkie user-strings zanim trafia do Paragraph.
def _pdf_safe(text) -> str:
    """Zamienia <, >, & na encje, zachowujac <br/> jako rzeczywisty break."""
    if text is None:
        return ""
    s = str(text)
    # Najpierw zamien & (zeby nie psuc &lt; ktore wstawimy za chwile)
    s = s.replace("&", "&amp;")
    s = s.replace("<", "&lt;").replace(">", "&gt;")
    # Newline -> <br/> (Paragraph tego nie robi sam)
    s = s.replace("\r\n", "\n").replace("\r", "\n").replace("\n", "<br/>")
    return s


# iter95bx: bezpieczna rejestracja fontu z polskimi znakami w PDF.
# PROBLEM: ReportLab fallbackuje do Helvetica gdy nie znajdzie TTF -> Helvetica
# nie obsluguje polskich znakow (ą, ę, ł, ż, ś, ć, ó, ź, ń, ", ², ³) i wywala
# `KeyError` / `UnicodeEncodeError` przy renderowaniu Paragraph z polskim tekstem.
# Render.com / niektore Docker images NIE MAJA /usr/share/fonts/truetype/liberation/
# zainstalowanego -> kazda wycena z polskimi znakami w nazwie konczy sie 500.
#
# Rozwiazanie: bundlujemy LiberationSans (regular + bold) w /app/backend/assets/fonts/
# i probujemy zarejestrowac w kolejnosci:
#   1. bundled (zawsze obecny - dziala na kazdym deployu)
#   2. systemowy DejaVu (dev env)
#   3. systemowy Liberation (Ubuntu dev)
#   4. fallback: Helvetica + transliteracja polskich znakow do ASCII
#
# Wywolywane raz na startup modulu (zamiast w kazdej funkcji generatora PDF).
_PL_TO_ASCII = str.maketrans({
    "ą": "a", "ę": "e", "ł": "l", "ż": "z", "ź": "z", "ś": "s", "ć": "c", "ó": "o", "ń": "n",
    "Ą": "A", "Ę": "E", "Ł": "L", "Ż": "Z", "Ź": "Z", "Ś": "S", "Ć": "C", "Ó": "O", "Ń": "N",
    "²": "2", "³": "3", "°": " stopni ",
})

_PDF_FONTS_REGISTERED = None  # (base_font, bold_font, supports_polish)


def _register_pdf_fonts():
    """Rejestruje fonty PDF raz. Zwraca (base, bold, supports_polish_unicode).
    `supports_polish_unicode=True` gdy TTF zostal zaladowany; False -> trzeba
    transliterowac polskie znaki do ASCII zeby Helvetica zadzialala.
    """
    global _PDF_FONTS_REGISTERED
    if _PDF_FONTS_REGISTERED is not None:
        return _PDF_FONTS_REGISTERED
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    _backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    _bundled = os.path.join(_backend_dir, "assets", "fonts")

    regular_candidates = [
        os.path.join(_bundled, "LiberationSans-Regular.ttf"),  # bundled (priority)
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ]
    bold_candidates = [
        os.path.join(_bundled, "LiberationSans-Bold.ttf"),  # bundled (priority)
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ]

    base_font, bold_font = "Helvetica", "Helvetica-Bold"
    supports_unicode = False
    for fp in regular_candidates:
        if os.path.exists(fp):
            try:
                pdfmetrics.registerFont(TTFont("PDFBase", fp))
                base_font = "PDFBase"
                supports_unicode = True
                logger.info("PDF font registered (regular): %s", fp)
                break
            except Exception as e:
                logger.warning("Failed to register PDF font %s: %s", fp, e)
    for fp in bold_candidates:
        if os.path.exists(fp):
            try:
                pdfmetrics.registerFont(TTFont("PDFBaseBold", fp))
                bold_font = "PDFBaseBold"
                break
            except Exception as e:
                logger.warning("Failed to register PDF bold font %s: %s", fp, e)

    if not supports_unicode:
        logger.error(
            "PDF generator FALLBACK to Helvetica - polskie znaki beda transliterowane do ASCII. "
            "Dodaj /app/backend/assets/fonts/LiberationSans-Regular.ttf zeby naprawic."
        )

    _PDF_FONTS_REGISTERED = (base_font, bold_font, supports_unicode)
    return _PDF_FONTS_REGISTERED


def _pdf_text(text) -> str:
    """Bezpieczny tekst do ReportLab: escape XML + transliteracja PL gdy fonty fallback."""
    s = _pdf_safe(text)
    _, _, supports_unicode = _register_pdf_fonts()
    if not supports_unicode:
        s = s.translate(_PL_TO_ASCII)
    return s


# iter95bx: bezpieczny Content-Disposition header dla plikow z polskimi znakami.
# PROBLEM: Starlette koduje HTTP headers jako latin-1 (RFC 7230) -> nazwy plikow
# z `Ł`, `ó`, `ś` itd. rzucaja UnicodeEncodeError -> HTTP 500.
# ROZWIAZANIE: RFC 5987 + ASCII-only fallback (oba w jednym headerze).
# Przegladarki preferuja `filename*=UTF-8''...` z procentowym kodowaniem.
def _safe_content_disposition(disposition: str, filename: str) -> str:
    """Buduje `Content-Disposition: <disposition>; filename="<ascii>"; filename*=UTF-8''<encoded>`."""
    # ASCII-only fallback (Latin-1 safe) - transliteracja PL
    ascii_name = (filename or "plik").translate(_PL_TO_ASCII)
    # Usun wszystko poza ASCII printable
    ascii_name = "".join(c if 32 <= ord(c) < 127 and c != '"' else "_" for c in ascii_name)
    # RFC 5987 encoded version dla nowoczesnych przegladarek (UTF-8)
    utf8_encoded = urllib.parse.quote(filename or "plik", safe="")
    return f'{disposition}; filename="{ascii_name}"; filename*=UTF-8\'\'{utf8_encoded}'


def _xlsx_add_logo(ws, anchor: str = "A1", width: int = 110, height: int = 110) -> None:
    """iter95av: wstawia logo w arkuszu XLSX na danej kotwicy. Cicho ignoruje błąd.
    iter95cs: zachowuje naturalne proporcje pliku PNG zamiast wymuszać kwadrat -
    parametr `width` jest brany jako bazowa szerokość, wysokość liczona z aspect ratio.
    """
    try:
        path = _get_logo_path()
        if not path:
            return
        from openpyxl.drawing.image import Image as XLImage
        from PIL import Image as PILImage
        with PILImage.open(path) as _li:
            _lw, _lh = _li.size
        _ratio = (_lh / _lw) if _lw else 1.0
        img = XLImage(path)
        img.width = width
        img.height = int(width * _ratio)
        img.anchor = anchor
        ws.add_image(img)
    except Exception:
        pass


def _filter_bom_rows(data: dict, subcategories: Optional[List[str]] = None) -> dict:
    """iter95ar: filtruj BOM po sub_category (kategoriach materialow)."""
    if not subcategories:
        return data
    wanted = {(s or "").lower().strip() for s in subcategories if s}
    if not wanted:
        return data
    rows = [r for r in data.get("rows", []) if (r.get("sub_category") or "").lower().strip() in wanted]
    return {**data, "rows": rows}
