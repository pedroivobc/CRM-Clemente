/**
 * Mockups estáticos do painel para ilustrar as features. Não são screenshots
 * porque em landing precisamos rodar sozinho — são reconstruções em SVG/HTML
 * que carregam rápido e ficam nítidas em qualquer densidade de tela.
 */

export function MockDashboard() {
  return (
    <div className="shot">
      <h4>Painel · manhã de segunda</h4>
      <div className="m-tiles">
        <div className="m-tile">
          <div className="m-label">Receita 7 dias</div>
          <div className="m-val">R$ 42.180</div>
          <div className="m-hint">12 cobranças a vencer</div>
        </div>
        <div className="m-tile">
          <div className="m-label">Em atraso</div>
          <div className="m-val m-danger">R$ 3.200</div>
          <div className="m-hint">2 cobranças</div>
        </div>
        <div className="m-tile">
          <div className="m-label">Leads abertos</div>
          <div className="m-val m-accent">28</div>
          <div className="m-hint">aguardando</div>
        </div>
        <div className="m-tile">
          <div className="m-label">Propostas</div>
          <div className="m-val">7</div>
          <div className="m-hint">esperando resposta</div>
        </div>
        <div className="m-tile">
          <div className="m-label">Contratos 60d</div>
          <div className="m-val m-warn">4</div>
          <div className="m-hint">vencendo</div>
        </div>
        <div className="m-tile">
          <div className="m-label">Anunciados</div>
          <div className="m-val">54</div>
          <div className="m-hint">no site</div>
        </div>
      </div>
    </div>
  );
}

export function MockDunning() {
  return (
    <div className="shot">
      <h4>Régua de cobrança · hoje</h4>
      <div>
        <div className="m-row">
          <div style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0 }}>
            <span className="m-badge brand">vence em 3d</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              Fernanda M. · IM-0142
            </span>
          </div>
          <button className="m-btn">WhatsApp</button>
        </div>
        <div className="m-row">
          <div style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0 }}>
            <span className="m-badge warn">vence hoje</span>
            <span>Ronaldo S. · IM-0087</span>
          </div>
          <button className="m-btn">WhatsApp</button>
        </div>
        <div className="m-row">
          <div style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0 }}>
            <span className="m-badge crit">atraso 3d</span>
            <span>Marina C. · IM-0203</span>
          </div>
          <button className="m-btn">WhatsApp</button>
        </div>
        <div className="m-row">
          <div style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0 }}>
            <span className="m-badge crit">atraso 7d</span>
            <span>Pedro V. · IM-0156</span>
          </div>
          <button className="m-btn">WhatsApp</button>
        </div>
      </div>
    </div>
  );
}

export function MockShowcase() {
  return (
    <div className="shot" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--line-soft)", background: "#fff" }}>
        <div className="m-eyebrow">seu-nome.imob.br</div>
        <div className="m-title">Imóveis à venda</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, padding: 16 }}>
        {[
          { code: "IM-0142", title: "Apto 2 quartos · Lourdes", price: "R$ 348.000", mcmv: true },
          { code: "IM-0087", title: "Casa 3 qtos · Grama", price: "R$ 520.000" },
          { code: "IM-0203", title: "Studio · Centro", price: "R$ 189.000", mcmv: true },
        ].map((p) => (
          <div key={p.code} style={{ border: "1px solid var(--line-soft)", borderRadius: 8, overflow: "hidden" }}>
            <div style={{ aspectRatio: "4/3", background: "linear-gradient(135deg, #d8dbe4, #eef1f7)", position: "relative" }}>
              <span style={{ position: "absolute", top: 6, left: 6, background: "#fff", padding: "2px 6px", borderRadius: 4, fontSize: 9, fontFamily: "ui-monospace, monospace", fontWeight: 700 }}>
                {p.code}
              </span>
              {p.mcmv ? (
                <span style={{ position: "absolute", top: 6, right: 6, background: "var(--accent)", color: "#fff", padding: "2px 6px", borderRadius: 4, fontSize: 9, fontWeight: 700 }}>
                  MCMV
                </span>
              ) : null}
            </div>
            <div style={{ padding: "8px 10px" }}>
              <div style={{ fontSize: 11, fontWeight: 600 }}>{p.title}</div>
              <div style={{ fontSize: 12, fontFamily: "Archivo", fontWeight: 700, marginTop: 2 }}>{p.price}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MockRanking() {
  return (
    <div className="shot">
      <h4>Ranking · 30 dias</h4>
      <div style={{ display: "grid", gap: 10 }}>
        {[
          { name: "Ana Rocha", leads: 42, prop: 18, deals: 6, up: "+3" },
          { name: "Bruno Lima", leads: 38, prop: 15, deals: 5, up: "+2" },
          { name: "Carla Dias", leads: 30, prop: 11, deals: 3, up: "=" },
          { name: "Diego P.", leads: 22, prop: 7, deals: 2, up: "-1" },
        ].map((row, i) => (
          <div key={row.name} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13 }}>
            <span style={{ width: 20, fontFamily: "ui-monospace, monospace", fontWeight: 700, color: i === 0 ? "#c78500" : i === 1 ? "#7d8794" : "var(--muted)" }}>
              {i + 1}º
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>{row.name}</div>
              <div style={{ height: 4, background: "var(--line-soft)", borderRadius: 4, marginTop: 4, overflow: "hidden" }}>
                <div style={{ width: `${100 - i * 22}%`, height: "100%", background: "var(--accent)" }} />
              </div>
            </div>
            <span style={{ fontSize: 11, color: "var(--muted)", width: 100, textAlign: "right", fontFamily: "ui-monospace, monospace" }}>
              {row.leads}l · {row.prop}p · {row.deals}v
            </span>
            <span style={{ fontSize: 11, fontWeight: 600, width: 32, textAlign: "right", color: row.up.startsWith("-") ? "var(--danger)" : row.up === "=" ? "var(--muted)" : "var(--accent)" }}>
              {row.up}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MockSegundaVia() {
  return (
    <div className="shot" style={{ padding: 0, overflow: "hidden", maxWidth: 320, marginLeft: "auto", marginRight: "auto" }}>
      <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line-soft)", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--ink)", color: "#fff", display: "grid", placeItems: "center", fontFamily: "Archivo", fontWeight: 800, fontSize: 13 }}>
          IA
        </div>
        <div>
          <div className="m-eyebrow">2ª via de aluguel</div>
          <div className="m-title">Imobiliária Aurora</div>
        </div>
      </div>
      <div style={{ padding: 18 }}>
        <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>Valor</div>
        <div style={{ fontFamily: "Archivo", fontWeight: 800, fontSize: 30, color: "var(--accent)", lineHeight: 1 }}>R$ 1.850,00</div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, fontSize: 12 }}>
          <div>
            <div style={{ color: "var(--muted)", fontSize: 10 }}>Vencimento</div>
            <div style={{ fontWeight: 600 }}>15/09/2026</div>
          </div>
          <div>
            <div style={{ color: "var(--muted)", fontSize: 10 }}>Competência</div>
            <div style={{ fontWeight: 600 }}>setembro 2026</div>
          </div>
        </div>
        <div style={{ marginTop: 16, padding: 10, background: "var(--paper)", borderRadius: 6, fontSize: 10, fontFamily: "ui-monospace, monospace", overflowWrap: "anywhere", wordBreak: "break-all" }}>
          00020126540014BR.GOV.BCB.PIX0132…
        </div>
        <button style={{ marginTop: 12, width: "100%", background: "var(--accent)", color: "#fff", padding: 10, borderRadius: 8, fontWeight: 600, fontSize: 13, border: "none" }}>
          Copiar Pix
        </button>
      </div>
    </div>
  );
}

export function MockFeed() {
  return (
    <div className="shot">
      <h4>Pulso do time</h4>
      <div className="m-feed">
        <div className="m-feed-item">
          <div className="icn">✓</div>
          <div>
            <div>Venda fechada de R$ 348.000</div>
            <div className="meta">Ana Rocha · agora</div>
          </div>
        </div>
        <div className="m-feed-item">
          <div className="icn brand">+</div>
          <div>
            <div>Novo lead de venda: Fernanda M.</div>
            <div className="meta">Ana Rocha · 12 min atrás</div>
          </div>
        </div>
        <div className="m-feed-item">
          <div className="icn">↑</div>
          <div>
            <div>Proposta PR-0087 enviada por R$ 520.000</div>
            <div className="meta">Bruno Lima · 34 min atrás</div>
          </div>
        </div>
        <div className="m-feed-item">
          <div className="icn crit">−</div>
          <div>
            <div>Lead perdido: Ronaldo S.</div>
            <div className="meta">Carla Dias · 1 h atrás</div>
          </div>
        </div>
        <div className="m-feed-item">
          <div className="icn">✎</div>
          <div>
            <div>Contrato CT-0142 ativado</div>
            <div className="meta">Diego P. · 2 h atrás</div>
          </div>
        </div>
      </div>
    </div>
  );
}
