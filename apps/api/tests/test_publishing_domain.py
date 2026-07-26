"""Regras da vitrine: slug, endereço público e impedimentos de publicação."""

from __future__ import annotations

from decimal import Decimal

from app.domain.publishing import (
    VRSYNC_PROPERTY_TYPE,
    build_slug,
    public_address,
    publication_blockers,
    slugify,
    video_embed_url,
    whatsapp_link,
)

ENDERECO = {
    "cep": "36036-000",
    "logradouro": "Rua Doutor Dilermando Cruz",
    "numero": "240",
    "complemento": "apto 302",
    "bairro": "Lourdes",
    "cidade": "Juiz de Fora",
    "uf": "MG",
}


# ── slug ─────────────────────────────────────────────────────────────────────
def test_slugify_remove_acento_e_simbolo():
    assert slugify("São Pedro") == "sao-pedro"
    assert slugify("Edifício Aurora / Bloco B") == "edificio-aurora-bloco-b"
    assert slugify("   ") == ""


def test_slug_segue_o_padrao_dos_sites_de_jf():
    slug = build_slug(
        kind="apartamento",
        purpose="venda",
        code="IM-0152",
        bedrooms=2,
        neighborhood="Lourdes",
        city="Juiz de Fora",
        uf="MG",
    )
    assert slug == "apartamento-2-quartos-lourdes-juiz-de-fora-mg-venda-im-0152"


def test_slug_de_locacao_usa_aluguel():
    slug = build_slug(kind="casa", purpose="locacao", code="IM-0007", city="Juiz de Fora", uf="MG")
    assert slug.endswith("aluguel-im-0007")


def test_slug_carrega_o_codigo_no_fim_para_ser_unico():
    a = build_slug(kind="apartamento", purpose="venda", code="IM-0001", neighborhood="Centro")
    b = build_slug(kind="apartamento", purpose="venda", code="IM-0002", neighborhood="Centro")
    assert a != b
    assert a.endswith("im-0001")
    assert b.endswith("im-0002")


# ── endereço público ─────────────────────────────────────────────────────────
def test_endereco_bairro_esconde_rua_e_numero():
    pub = public_address(ENDERECO, "bairro")
    assert pub == {"bairro": "Lourdes", "cidade": "Juiz de Fora", "uf": "MG"}
    assert "logradouro" not in pub
    assert "numero" not in pub


def test_endereco_rua_mostra_logradouro_mas_nao_numero():
    pub = public_address(ENDERECO, "rua")
    assert pub["logradouro"] == "Rua Doutor Dilermando Cruz"
    assert "numero" not in pub
    assert "cep" not in pub


def test_endereco_completo_mostra_tudo():
    pub = public_address(ENDERECO, "completo")
    assert pub["numero"] == "240"
    assert pub["complemento"] == "apto 302"
    assert pub["cep"] == "36036-000"


def test_endereco_nunca_esconde_cidade_e_uf():
    for visibilidade in ("bairro", "rua", "completo"):
        pub = public_address(ENDERECO, visibilidade)
        assert pub["cidade"] == "Juiz de Fora"
        assert pub["uf"] == "MG"


# ── impedimentos ─────────────────────────────────────────────────────────────
def _imovel_ok(**over):
    base = dict(
        purpose="venda",
        status="disponivel",
        title="Apartamento 2 quartos em Lourdes com ótimo custo-benefício",
        description=(
            "Apartamento reformado, sala com bancada em granito, box em vidro e "
            "área externa privativa. Próximo ao comércio do bairro."
        ),
        sale_price=Decimal("199000.00"),
        rent_price=None,
        photo_count=9,
        address=ENDERECO,
        kind="apartamento",
        area_util=Decimal("68"),
        bedrooms=2,
        iptu_amount=Decimal("1200"),
    )
    base.update(over)
    return publication_blockers(**base)


def test_imovel_completo_pode_publicar():
    assert _imovel_ok() == []


def test_imovel_vendido_nao_fica_anunciado():
    assert any("fechado ou inativo" in b for b in _imovel_ok(status="vendido"))


def test_falta_de_foto_impede():
    assert any("foto" in b for b in _imovel_ok(photo_count=0))


def test_venda_sem_preco_impede():
    assert any("preço de venda" in b for b in _imovel_ok(sale_price=None))


def test_locacao_sem_aluguel_impede():
    blockers = _imovel_ok(purpose="locacao", sale_price=None, rent_price=None)
    assert any("aluguel" in b for b in blockers)


def test_ambos_exige_os_dois_precos():
    blockers = _imovel_ok(purpose="ambos", sale_price=Decimal("500000"), rent_price=None)
    assert any("aluguel" in b for b in blockers)
    assert not any("preço de venda" in b for b in blockers)


def test_descricao_curta_reprova_no_portal():
    assert any("descrição" in b for b in _imovel_ok(description="Bom apê."))


def test_titulo_curto_reprova():
    assert any("título" in b for b in _imovel_ok(title="Apê JF"))


def test_sem_bairro_nao_publica():
    endereco = {"cidade": "Juiz de Fora", "uf": "MG"}
    assert any("bairro" in b for b in _imovel_ok(address=endereco))


def test_sem_area_util_nao_publica():
    assert any("área útil" in b for b in _imovel_ok(area_util=None))


def test_sem_quartos_nao_publica_em_residencial():
    assert any("quartos" in b for b in _imovel_ok(bedrooms=None))


def test_terreno_nao_exige_quartos():
    # Terreno não tem quartos; o impedimento não deve aparecer.
    blockers = _imovel_ok(kind="terreno", bedrooms=None)
    assert not any("quartos" in b for b in blockers)


def test_iptu_e_obrigatorio_mesmo_zero():
    assert any("IPTU" in b for b in _imovel_ok(iptu_amount=None))
    # Zero conta como informado (isento).
    assert not any("IPTU" in b for b in _imovel_ok(iptu_amount=Decimal("0")))


# ── WhatsApp e VRSync ────────────────────────────────────────────────────────
def test_whatsapp_link_identifica_imovel_e_leva_a_url():
    link = whatsapp_link(
        phone="(32) 99851-0706",
        code="IM-0152",
        url="https://aurora.com.br/imovel/im-0152",
    )
    assert link.startswith("https://wa.me/5532998510706?text=")
    assert "IM-0152" in link
    assert "https://aurora.com.br/imovel/im-0152" in link
    assert " " not in link.split("?text=")[1]


def test_whatsapp_nao_duplica_ddi():
    link = whatsapp_link(phone="5532998510706", code="IM-1", url="http://x")
    assert "wa.me/5532998510706" in link


# ── Embed de vídeo ───────────────────────────────────────────────────────────
def test_youtube_watch_vira_embed():
    assert (
        video_embed_url("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
        == "https://www.youtube.com/embed/dQw4w9WgXcQ"
    )


def test_youtube_short_e_shorts_tambem_viram_embed():
    assert video_embed_url("https://youtu.be/dQw4w9WgXcQ").endswith("/embed/dQw4w9WgXcQ")
    assert (
        video_embed_url("https://www.youtube.com/shorts/dQw4w9WgXcQ")
        == "https://www.youtube.com/embed/dQw4w9WgXcQ"
    )


def test_vimeo_vira_embed():
    assert (
        video_embed_url("https://vimeo.com/123456789")
        == "https://player.vimeo.com/video/123456789"
    )


def test_url_desconhecida_devolve_none():
    assert video_embed_url("https://tiktok.com/x") is None
    assert video_embed_url("") is None
    assert video_embed_url(None) is None


def test_todo_kind_tem_property_type_do_vrsync():
    from app.modules.properties import PROPERTY_KINDS  # noqa: PLC0415

    for kind in PROPERTY_KINDS:
        assert kind in VRSYNC_PROPERTY_TYPE, f"kind {kind} sem PropertyType"
