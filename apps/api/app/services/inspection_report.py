"""Laudo de vistoria em PDF, com a identidade visual da imobiliária.

HTML + CSS convertidos por WeasyPrint: o mesmo caminho usado pelos demais
documentos do sistema (recibos, extratos, holerites), para que todos herdem o
branding do tenant sem duplicar layout.
"""

from __future__ import annotations

import asyncio
import html
from datetime import datetime
from typing import Any

from app.core.format import brl
from app.domain.operations import CONDITION_LABELS
from app.services.storage import BUCKET_DOCUMENTS, get_storage

KIND_LABELS = {
    "entrada": "Vistoria de entrada",
    "saida": "Vistoria de saída",
    "periodica": "Vistoria periódica",
}

RESPONSIBILITY_LABELS = {
    "locatario": "Locatário",
    "proprietario": "Proprietário",
    "indefinido": "A definir",
}

METER_LABELS = {"agua": "Água", "luz": "Luz", "gas": "Gás"}

CONDITION_COLORS = {
    "otimo": "#0e7c66",
    "bom": "#1d4ed8",
    "regular": "#a1560a",
    "ruim": "#b42318",
}


def _esc(value: Any) -> str:
    return html.escape(str(value)) if value is not None else ""


def _date(value: str | None) -> str:
    if not value:
        return "—"
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).strftime("%d/%m/%Y %H:%M")
    except ValueError:
        return value


async def _photo_data_uri(url_or_path: str) -> str | None:
    """Lê a foto do storage e devolve como data URI.

    O PDF precisa carregar a imagem sem depender de rede nem de URL assinada.
    """
    try:
        storage = get_storage()
        # A URL pública do storage local é /storage/<bucket>/<path>.
        path = url_or_path.split(f"/{BUCKET_DOCUMENTS}/", 1)[-1]
        content = await storage.download(BUCKET_DOCUMENTS, path)
    except Exception:  # noqa: BLE001 — laudo sai sem a foto que falhou
        return None

    import base64

    return f"data:image/jpeg;base64,{base64.b64encode(content).decode()}"


def _condition_badge(condition: str | None) -> str:
    if not condition:
        return '<span class="pendente">não avaliado</span>'
    color = CONDITION_COLORS.get(condition, "#6b7280")
    return (
        f'<span class="estado" style="color:{color};border-color:{color}">'
        f"{_esc(CONDITION_LABELS.get(condition, condition))}</span>"
    )


def _build_html(inspection: dict, branding: dict, photos: dict[str, str]) -> str:
    primary = branding.get("color_primary") or "#0f766e"
    display_name = branding.get("display_name") or "Imobiliária"

    rooms_html = []
    for room in inspection.get("rooms", []):
        items_html = []
        for item in room.get("items", []):
            item_photos = "".join(
                f'<img src="{photos[p["id"]]}" alt="" />'
                for p in item.get("photos", [])
                if p["id"] in photos
            )
            photos_row = (
                f'<tr><td colspan="3" class="fotos">{item_photos}</td></tr>' if item_photos else ""
            )
            items_html.append(
                f"""
                <tr>
                  <td class="item">{_esc(item["name"])}</td>
                  <td class="estado-col">{_condition_badge(item.get("condition"))}</td>
                  <td class="obs">{_esc(item.get("notes") or "")}</td>
                </tr>
                {photos_row}
                """
            )
        if items_html:
            rooms_html.append(
                f"""
                <section class="comodo">
                  <h3>{_esc(room["name"])}</h3>
                  <table>
                    <thead>
                      <tr><th>Item</th><th>Estado</th><th>Observações</th></tr>
                    </thead>
                    <tbody>{"".join(items_html)}</tbody>
                  </table>
                </section>
                """
            )

    meters = inspection.get("meters", [])
    meters_html = (
        "".join(
            f'<div class="medidor"><span>{_esc(METER_LABELS.get(m["meter"], m["meter"]))}</span>'
            f'<strong>{_esc(m["reading"])}</strong></div>'
            for m in meters
        )
        if meters
        else '<p class="vazio">Nenhuma leitura registrada.</p>'
    )

    issues = inspection.get("issues", [])
    issues_html = ""
    if issues:
        rows = "".join(
            f"""
            <tr>
              <td>{_esc(i.get("room_name") or "—")}</td>
              <td>{_esc(i["description"])}</td>
              <td>{_esc(RESPONSIBILITY_LABELS.get(i["responsibility"], i["responsibility"]))}</td>
              <td class="valor">{brl(i["estimated_cost"]) if i.get("estimated_cost") else "—"}</td>
            </tr>
            """
            for i in issues
        )
        issues_html = f"""
        <section class="pendencias">
          <h2>Pendências apuradas</h2>
          <p class="nota">
            A responsabilidade indicada é uma sugestão a partir da comparação com a vistoria
            de entrada e deve ser confirmada pelas partes.
          </p>
          <table>
            <thead>
              <tr><th>Cômodo</th><th>Descrição</th><th>Responsabilidade</th><th>Estimativa</th></tr>
            </thead>
            <tbody>{rows}</tbody>
          </table>
        </section>
        """

    return f"""
    <!doctype html>
    <html lang="pt-BR">
    <head>
      <meta charset="utf-8" />
      <style>
        @page {{ size: A4; margin: 18mm 15mm; }}
        * {{ box-sizing: border-box; }}
        body {{
          font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
          color: #16181d; font-size: 10pt; line-height: 1.45; margin: 0;
        }}
        header.marca {{
          border-bottom: 3px solid {primary};
          padding-bottom: 10px; margin-bottom: 18px;
        }}
        header.marca .nome {{ font-size: 15pt; font-weight: 700; color: {primary}; }}
        header.marca .tipo {{ font-size: 11pt; margin-top: 2px; }}
        .ficha {{
          display: flex; flex-wrap: wrap; gap: 6px 28px;
          background: #f5f6f8; padding: 10px 12px; border-radius: 4px;
          margin-bottom: 18px; font-size: 9pt;
        }}
        .ficha div span {{ color: #6b7280; }}
        .ficha div strong {{ margin-left: 6px; }}
        h2 {{ font-size: 11pt; margin: 20px 0 8px; color: {primary}; }}
        h3 {{
          font-size: 10pt; margin: 14px 0 6px; padding-bottom: 3px;
          border-bottom: 1px solid #dcdfe4;
        }}
        table {{ width: 100%; border-collapse: collapse; }}
        th {{
          text-align: left; font-size: 7.5pt; text-transform: uppercase;
          letter-spacing: .04em; color: #6b7280; padding: 4px 6px;
          border-bottom: 1px solid #dcdfe4;
        }}
        td {{ padding: 5px 6px; border-bottom: 1px solid #e9ebee; vertical-align: top; }}
        td.item {{ width: 34%; }}
        td.estado-col {{ width: 20%; }}
        td.valor {{ text-align: right; font-variant-numeric: tabular-nums; }}
        .estado {{
          display: inline-block; border: 1px solid; border-radius: 10px;
          padding: 1px 7px; font-size: 8pt; font-weight: 600;
        }}
        .pendente {{ color: #9ca3af; font-size: 8pt; font-style: italic; }}
        td.fotos {{ padding-top: 0; }}
        td.fotos img {{
          height: 78px; border-radius: 3px; margin-right: 5px; border: 1px solid #dcdfe4;
        }}
        .medidor {{
          display: inline-block; border: 1px solid #dcdfe4; border-radius: 4px;
          padding: 6px 12px; margin-right: 8px; font-size: 9pt;
        }}
        .medidor span {{ color: #6b7280; margin-right: 6px; }}
        .comodo {{ page-break-inside: avoid; }}
        .pendencias {{ page-break-before: auto; margin-top: 20px; }}
        .nota {{ font-size: 8.5pt; color: #6b7280; margin: 0 0 8px; }}
        .vazio {{ color: #6b7280; font-size: 9pt; }}
        .assinaturas {{ margin-top: 34px; display: flex; gap: 40px; }}
        .assinaturas div {{ flex: 1; border-top: 1px solid #16181d; padding-top: 5px;
                            font-size: 8.5pt; text-align: center; }}
        footer.rodape {{
          margin-top: 26px; padding-top: 8px; border-top: 1px solid #dcdfe4;
          font-size: 7.5pt; color: #6b7280; text-align: center;
        }}
      </style>
    </head>
    <body>
      <header class="marca">
        <div class="nome">{_esc(display_name)}</div>
        <div class="tipo">{_esc(KIND_LABELS.get(inspection["kind"], inspection["kind"]))}</div>
      </header>

      <div class="ficha">
        <div><span>Imóvel</span><strong>{_esc(inspection["property_code"])}</strong></div>
        <div><span>Endereço</span><strong>{_esc(inspection["property_title"])}</strong></div>
        <div><span>Realizada em</span><strong>{_date(inspection.get("performed_at"))}</strong></div>
        <div><span>Vistoriador</span>
             <strong>{_esc(inspection.get("inspector_name") or "—")}</strong></div>
      </div>

      <h2>Leitura de medidores</h2>
      {meters_html}

      <h2>Conservação por cômodo</h2>
      {"".join(rooms_html) or '<p class="vazio">Nenhum item avaliado.</p>'}

      {issues_html}

      <div class="assinaturas">
        <div>Locatário</div>
        <div>Proprietário ou representante</div>
        <div>Vistoriador</div>
      </div>

      <footer class="rodape">
        Laudo emitido por {_esc(display_name)} em
        {datetime.now().strftime("%d/%m/%Y às %H:%M")}.
      </footer>
    </body>
    </html>
    """


async def render_inspection_report(*, inspection: dict, branding: dict) -> bytes:
    """Monta o laudo e devolve o PDF pronto."""
    # As fotos entram embutidas: o PDF precisa ser autossuficiente.
    photos: dict[str, str] = {}
    for room in inspection.get("rooms", []):
        for item in room.get("items", []):
            for photo in item.get("photos", []):
                data_uri = await _photo_data_uri(photo["url"])
                if data_uri:
                    photos[photo["id"]] = data_uri

    document = _build_html(inspection, branding, photos)

    # WeasyPrint é síncrono e pesado; roda fora do event loop.
    def _render() -> bytes:
        from weasyprint import HTML

        return HTML(string=document).write_pdf()

    return await asyncio.to_thread(_render)
