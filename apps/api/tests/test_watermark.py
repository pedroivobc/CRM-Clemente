"""Marca d'água aplicada às fotos dos imóveis."""

import io

from PIL import Image

from app.services.watermark import apply_watermark
from app.workers.tasks import _watermarked_path


def _png(size, color) -> bytes:
    buf = io.BytesIO()
    Image.new("RGBA", size, color).save(buf, format="PNG")
    return buf.getvalue()


def test_marca_dagua_preserva_dimensoes_e_gera_jpeg():
    photo = _png((800, 600), (200, 200, 200, 255))
    logo = _png((200, 80), (255, 0, 0, 255))

    result = apply_watermark(photo, logo)
    out = Image.open(io.BytesIO(result))

    assert out.format == "JPEG"
    assert out.size == (800, 600)


def test_marca_dagua_altera_o_canto_escolhido():
    photo = _png((800, 600), (255, 255, 255, 255))
    logo = _png((200, 80), (0, 0, 0, 255))

    marked = Image.open(io.BytesIO(apply_watermark(photo, logo, position="bottom-right")))
    # Canto inferior direito recebe o logo; o superior esquerdo permanece branco.
    assert marked.getpixel((760, 570)) != (255, 255, 255)
    assert marked.getpixel((10, 10)) == (255, 255, 255)


def test_sem_logo_a_foto_ainda_e_normalizada():
    photo = _png((640, 480), (10, 20, 30, 255))
    out = Image.open(io.BytesIO(apply_watermark(photo, None)))

    assert out.format == "JPEG"
    assert out.size == (640, 480)


def test_foto_grande_e_redimensionada():
    photo = _png((4000, 3000), (128, 128, 128, 255))
    out = Image.open(io.BytesIO(apply_watermark(photo, None)))

    assert max(out.size) == 2000
    assert out.size == (2000, 1500)


def test_caminho_da_versao_marcada():
    assert _watermarked_path("tenant-1/imovel-2/orig/abc.jpeg") == "tenant-1/imovel-2/wm/abc.jpg"
    assert _watermarked_path("foto.png") == "wm/foto.jpg"
