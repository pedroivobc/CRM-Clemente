"""Legendas geradas para Instagram e Facebook a partir da ficha."""

from __future__ import annotations

from decimal import Decimal

from app.domain.social import build_social_caption


def _kwargs(**over):
    base = dict(
        platform="instagram",
        kind="apartamento",
        purpose="venda",
        code="IM-0152",
        title="Apartamento 2 quartos em Lourdes",
        description=(
            "Reformado, sala com bancada em granito e área externa privativa. "
            "Próximo ao comércio do bairro."
        ),
        bairro="Lourdes",
        cidade="Juiz de Fora",
        uf="MG",
        area_util=Decimal("68"),
        bedrooms=2,
        suites=1,
        bathrooms=2,
        parking_spots=1,
        sale_price=Decimal("199000"),
        rent_price=None,
        condo_fee=Decimal("420"),
        iptu_amount=Decimal("1200"),
        pet_allowed=True,
        republic_allowed=None,
        has_leisure_area=True,
        whatsapp_url="https://wa.me/5532998510706?text=Ola",
        phone="(32) 99851-0706",
        site_url="/imovel/apartamento-2-quartos-lourdes-jf-mg-venda-im-0152",
    )
    base.update(over)
    return base


def test_headline_traz_tipo_quartos_bairro_e_finalidade():
    txt = build_social_caption(**_kwargs())
    assert txt.startswith("Apartamento de 2 quartos no Lourdes à venda")


def test_venda_mostra_preco_em_reais_formato_brl():
    txt = build_social_caption(**_kwargs(sale_price=Decimal("1250000")))
    assert "Venda: R$ 1.250.000" in txt


def test_locacao_mostra_aluguel_por_mes():
    txt = build_social_caption(
        **_kwargs(purpose="locacao", sale_price=None, rent_price=Decimal("2500"))
    )
    assert "Aluguel: R$ 2.500/mês" in txt
    assert "à venda" not in txt.split("\n")[0]


def test_ambos_mostra_venda_e_aluguel():
    txt = build_social_caption(
        **_kwargs(purpose="ambos", sale_price=Decimal("500000"), rent_price=Decimal("3200"))
    )
    assert "Venda: R$ 500.000" in txt
    assert "Aluguel: R$ 3.200/mês" in txt


def test_specs_lista_area_quartos_banheiros_vagas():
    txt = build_social_caption(**_kwargs())
    assert "Área útil: 68 m²" in txt
    assert "Quartos: 2 (sendo 1 suíte(s))" in txt
    assert "Banheiros: 2" in txt
    assert "Vagas: 1" in txt


def test_diferenciais_aparecem_apenas_quando_true():
    txt = build_social_caption(**_kwargs())
    assert "aceita pet" in txt
    assert "com área de lazer" in txt
    assert "aceita república" not in txt

    txt_sem = build_social_caption(
        **_kwargs(pet_allowed=None, republic_allowed=None, has_leisure_area=None)
    )
    assert "Diferenciais" not in txt_sem


def test_iptu_zero_ainda_aparece_como_isento():
    txt = build_social_caption(**_kwargs(iptu_amount=Decimal("0")))
    assert "IPTU: R$ 0" in txt


def test_call_to_action_traz_codigo_e_whatsapp():
    txt = build_social_caption(**_kwargs())
    assert "Cód. IM-0152" in txt
    assert "WhatsApp: https://wa.me/5532998510706" in txt


def test_instagram_tem_mais_hashtags_que_facebook():
    ig = build_social_caption(**_kwargs(platform="instagram"))
    fb = build_social_caption(**_kwargs(platform="facebook"))
    ig_tags = [w for w in ig.split() if w.startswith("#")]
    fb_tags = [w for w in fb.split() if w.startswith("#")]
    assert len(ig_tags) > len(fb_tags)
    assert len(fb_tags) <= 5


def test_hashtags_incluem_bairro_e_cidade_sem_acento():
    txt = build_social_caption(**_kwargs(bairro="São Pedro", cidade="Juiz de Fora"))
    assert "#saopedro" in txt
    assert "#juizdefora" in txt


def test_e_deterministica():
    a = build_social_caption(**_kwargs())
    b = build_social_caption(**_kwargs())
    assert a == b


def test_descricao_longa_e_cortada_sem_partir_palavra():
    longa = "Palavra " * 200
    txt = build_social_caption(**_kwargs(description=longa))
    # Não estoura o limite prático e não corta uma palavra no meio.
    assert "Palavr…" not in txt
    assert txt.endswith("#corretorvenda") or "…" in txt


def test_terreno_nao_menciona_quartos_no_headline():
    txt = build_social_caption(
        **_kwargs(kind="terreno", bedrooms=None, suites=None, bathrooms=None, parking_spots=None)
    )
    linha1 = txt.split("\n")[0]
    assert "quarto" not in linha1
    assert "Terreno" in linha1


def test_headline_sem_bairro_usa_cidade():
    txt = build_social_caption(**_kwargs(bairro=None))
    assert "em Juiz de Fora à venda" in txt


def test_facebook_respeita_limite_de_caracteres():
    txt = build_social_caption(
        **_kwargs(platform="facebook", description="a" * 5000)
    )
    assert len(txt) <= 4000
