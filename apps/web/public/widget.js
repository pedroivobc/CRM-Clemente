/*
 * Vitrine embutível — grade de imóveis para o site da imobiliária/corretor.
 *
 * Uso:
 *   <script src="https://SEU-HOST/widget.js" data-imob="pub_..."></script>
 *
 * Renderiza dentro de um Shadow DOM: o CSS do site anfitrião não vaza para cá,
 * e o nosso não vaza para ele. Consome a API pública (/public/{chave}). Sem
 * dependências — roda em qualquer página.
 *
 * Atributos opcionais no <script>:
 *   data-imob      (obrigatório) chave publicável
 *   data-api       base da API (padrão: origem do próprio script)
 *   data-target    seletor do elemento onde montar (padrão: cria um após o script)
 *   data-purpose   filtro inicial de finalidade: venda | locacao
 *   data-page-size itens por página (padrão 12)
 */
(function () {
  "use strict";

  var script = document.currentScript;
  if (!script) return;
  var KEY = script.getAttribute("data-imob");
  if (!KEY) {
    console.error("[vitrine] data-imob (chave publicável) é obrigatório.");
    return;
  }

  var API = (script.getAttribute("data-api") || new URL(script.src).origin).replace(/\/$/, "");
  var BASE = API + "/public/" + encodeURIComponent(KEY);
  var PAGE_SIZE = parseInt(script.getAttribute("data-page-size") || "12", 10);
  var INITIAL_PURPOSE = script.getAttribute("data-purpose") || "";

  var KINDS = {
    casa: "Casa", casa_geminada: "Casa geminada", casa_condominio: "Casa em condomínio",
    sobrado: "Sobrado", apartamento: "Apartamento", cobertura: "Cobertura", kitnet: "Kitnet",
    studio: "Studio", flat: "Flat", garden: "Garden", loft: "Loft",
    sala_comercial: "Sala comercial", loja: "Loja", ponto_comercial: "Ponto comercial",
    galpao: "Galpão", andar_corporativo: "Andar corporativo", predio: "Prédio",
    hotel_pousada: "Hotel / pousada", terreno: "Terreno", lote_condominio: "Lote em condomínio",
    sitio_chacara: "Sítio / chácara", fazenda: "Fazenda", vaga_garagem: "Vaga de garagem",
    outro: "Outro",
  };
  var PURPOSES = { venda: "Comprar", locacao: "Alugar" };

  var BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  function money(v) { return v == null ? "Sob consulta" : BRL.format(Number(v)); }
  function kindLabel(k) { return KINDS[k] || k; }

  // ── Montagem do host + Shadow DOM ─────────────────────────────────────────
  var host = null;
  var targetSel = script.getAttribute("data-target");
  if (targetSel) host = document.querySelector(targetSel);
  if (!host) {
    host = document.createElement("div");
    script.parentNode.insertBefore(host, script.nextSibling);
  }
  var root = host.attachShadow({ mode: "open" });

  var state = {
    config: null,
    filters: {
      purpose: INITIAL_PURPOSE, kind: "", neighborhood: "", max_price: "", mcmv: "", sort: "recentes",
    },
    page: 1,
    total: 0,
    items: [],
    loading: false,
  };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function css(brand) {
    return (
      ":host{all:initial}" +
      "*{box-sizing:border-box;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}" +
      ".vt{--brand:" + brand + ";--ink:#16181d;--soft:#454a55;--muted:#6b7280;--line:#e2e5ea;" +
      "--bg:#fff;--sunken:#f4f5f7;color:var(--ink);font-size:14px;line-height:1.45}" +
      ".bar{display:flex;flex-wrap:wrap;gap:8px;align-items:end;margin-bottom:18px}" +
      ".fld{display:flex;flex-direction:column;gap:4px}" +
      ".fld label{font-size:11px;color:var(--muted)}" +
      "select,input{height:38px;padding:0 10px;border:1px solid var(--line);border-radius:8px;" +
      "background:var(--bg);color:var(--ink);font-size:13.5px;outline:none}" +
      "select:focus,input:focus{border-color:var(--brand)}" +
      ".grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}" +
      ".card{border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--bg);" +
      "cursor:pointer;transition:box-shadow .15s,transform .15s;display:flex;flex-direction:column}" +
      ".card:hover{box-shadow:0 8px 24px #16181d1a;transform:translateY(-2px)}" +
      ".cover{aspect-ratio:4/3;background:var(--sunken) center/cover no-repeat;position:relative}" +
      ".cover .tag{position:absolute;top:10px;left:10px;background:#fff;color:var(--soft);" +
      "font:600 11px/1 ui-monospace,monospace;padding:5px 8px;border-radius:6px;letter-spacing:.03em}" +
      ".cover .tag.mcmv{left:auto;right:10px;background:var(--brand);color:#fff;letter-spacing:.04em}" +
      ".cover .noimg{display:grid;place-items:center;height:100%;color:var(--muted);font-size:12px}" +
      ".body{padding:12px 14px;display:flex;flex-direction:column;gap:6px;flex:1}" +
      ".ttl{font-size:14.5px;font-weight:600;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;" +
      "-webkit-box-orient:vertical;overflow:hidden}" +
      ".loc{font-size:12.5px;color:var(--muted)}" +
      ".specs{font-size:12.5px;color:var(--soft);display:flex;gap:10px;flex-wrap:wrap}" +
      ".price{margin-top:auto;font-weight:700;font-size:16px;color:var(--ink)}" +
      ".price small{font-weight:500;font-size:12px;color:var(--muted)}" +
      ".more{display:block;margin:22px auto 0;padding:10px 20px;border:1px solid var(--line);" +
      "background:var(--bg);border-radius:8px;font-size:13.5px;cursor:pointer;color:var(--soft)}" +
      ".empty,.loading{padding:48px 16px;text-align:center;color:var(--muted)}" +
      ".count{font-size:12.5px;color:var(--muted);margin-bottom:12px}" +
      // overlay / detail
      ".ov{position:fixed;inset:0;background:#16181dcc;padding:24px;overflow:auto;z-index:2147483647}" +
      ".sheet{background:var(--bg);border-radius:14px;max-width:860px;width:100%;margin:0 auto;" +
      "overflow:hidden;position:relative}" +
      ".sheet .gal{display:flex;gap:6px;overflow-x:auto;background:#000;scroll-snap-type:x mandatory}" +
      ".sheet .gal img{height:300px;scroll-snap-align:center;object-fit:cover;flex:0 0 auto}" +
      ".sheet .gal .noimg{height:300px;width:100%;display:grid;place-items:center;color:#fff;background:#2a2e37}" +
      ".sheet .video{aspect-ratio:16/9;background:#000}" +
      ".sheet .video iframe{width:100%;height:100%;border:0;display:block}" +
      ".dt{padding:20px 22px}" +
      ".dt h2{margin:0 0 4px;font-size:20px}" +
      ".dt .loc{margin-bottom:12px}" +
      ".dt .price{font-size:22px;margin:0 0 14px}" +
      ".dt .desc{color:var(--soft);white-space:pre-line;margin:0 0 16px;font-size:13.5px}" +
      ".chips{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}" +
      ".chip{background:var(--sunken);border-radius:20px;padding:5px 12px;font-size:12.5px;color:var(--soft)}" +
      ".cta{display:flex;gap:10px;flex-wrap:wrap}" +
      ".btn{border:none;border-radius:9px;padding:11px 18px;font-size:14px;font-weight:600;cursor:pointer;" +
      "text-decoration:none;display:inline-flex;align-items:center;gap:8px}" +
      ".btn-wa{background:#25d366;color:#fff}" +
      ".btn-primary{background:var(--brand);color:#fff}" +
      ".btn-ghost{background:var(--sunken);color:var(--soft)}" +
      ".close{position:absolute;top:30px;right:30px;background:#fff;border:none;width:36px;height:36px;" +
      "border-radius:50%;font-size:18px;cursor:pointer;color:var(--soft)}" +
      // lead form
      ".lead{border-top:1px solid var(--line);margin-top:18px;padding-top:16px}" +
      ".lead h3{margin:0 0 10px;font-size:15px}" +
      ".lead .row{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px}" +
      ".lead input,.lead textarea{width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:8px;font-size:13.5px}" +
      ".lead textarea{min-height:64px;resize:vertical}" +
      ".ok{color:#0e7c66;font-size:13.5px;padding:8px 0}" +
      "@media(max-width:520px){.lead .row{grid-template-columns:1fr}.sheet .gal img{height:220px}}"
    );
  }

  function shell() {
    var wrap = document.createElement("div");
    wrap.className = "vt";
    wrap.innerHTML =
      '<div class="bar"></div><div class="count"></div>' +
      '<div class="grid"></div><div class="foot"></div>';
    return wrap;
  }

  var styleEl = document.createElement("style");
  root.appendChild(styleEl);
  var view = shell();
  root.appendChild(view);
  var $ = function (s) { return view.querySelector(s); };

  // ── Filtros ───────────────────────────────────────────────────────────────
  function renderBar() {
    var f = state.config.facets;
    var opt = function (v, l, sel) {
      return '<option value="' + esc(v) + '"' + (sel ? " selected" : "") + ">" + esc(l) + "</option>";
    };
    var purposes = (f.purposes || []).map(function (p) { return opt(p, PURPOSES[p] || p, state.filters.purpose === p); });
    var kinds = (f.kinds || []).map(function (k) { return opt(k, kindLabel(k), state.filters.kind === k); });
    var hoods = (f.neighborhoods || []).map(function (n) { return opt(n, n, state.filters.neighborhood === n); });
    var mcmvFacetas = (f.mcmv_faixas || []).map(function (m) {
      return opt(m, "MCMV " + m.split("_")[1], state.filters.mcmv === m);
    });
    var mcmvBlock = mcmvFacetas.length
      ? '<div class="fld"><label>MCMV</label><select data-k="mcmv">' +
          opt("", "Todos", !state.filters.mcmv) +
          opt("qualquer", "Qualquer faixa", state.filters.mcmv === "qualquer") +
          mcmvFacetas.join("") +
        "</select></div>"
      : "";

    $(".bar").innerHTML =
      '<div class="fld"><label>Finalidade</label><select data-k="purpose">' +
        opt("", "Todas", !state.filters.purpose) + purposes.join("") + "</select></div>" +
      '<div class="fld"><label>Tipo</label><select data-k="kind">' +
        opt("", "Todos", !state.filters.kind) + kinds.join("") + "</select></div>" +
      '<div class="fld"><label>Bairro</label><select data-k="neighborhood">' +
        opt("", "Todos", !state.filters.neighborhood) + hoods.join("") + "</select></div>" +
      '<div class="fld"><label>Até (R$)</label><input data-k="max_price" inputmode="numeric" ' +
        'placeholder="sem limite" value="' + esc(state.filters.max_price) + '"></div>' +
      mcmvBlock +
      '<div class="fld"><label>Ordenar</label><select data-k="sort">' +
        opt("recentes", "Mais recentes", state.filters.sort === "recentes") +
        opt("menor_preco", "Menor preço", state.filters.sort === "menor_preco") +
        opt("maior_preco", "Maior preço", state.filters.sort === "maior_preco") +
        opt("maior_area", "Maior área", state.filters.sort === "maior_area") +
      "</select></div>";

    Array.prototype.forEach.call($(".bar").querySelectorAll("[data-k]"), function (el) {
      var evt = el.tagName === "INPUT" ? "change" : "change";
      el.addEventListener(evt, function () {
        state.filters[el.getAttribute("data-k")] = el.value.trim();
        state.page = 1;
        load(true);
      });
    });
  }

  // ── Cards ─────────────────────────────────────────────────────────────────
  function specs(p) {
    var parts = [];
    if (p.bedrooms) parts.push(p.bedrooms + (p.bedrooms === 1 ? " quarto" : " quartos"));
    if (p.parking) parts.push(p.parking + (p.parking === 1 ? " vaga" : " vagas"));
    if (p.area) parts.push(Math.round(Number(p.area)) + " m²");
    return parts;
  }

  function priceHtml(p) {
    if (p.purpose === "locacao" || (p.rent_price && !p.sale_price)) {
      return money(p.rent_price) + " <small>/mês</small>";
    }
    return money(p.sale_price || p.rent_price);
  }

  function locText(p) {
    var a = p.address || {};
    return [a.bairro, a.cidade].filter(Boolean).join(" · ") + (a.uf ? " — " + a.uf : "");
  }

  function card(p) {
    var el = document.createElement("div");
    el.className = "card";
    var mcmvTag = p.mcmv_faixa
      ? '<span class="tag mcmv">MCMV ' + esc(p.mcmv_faixa.split("_")[1]) + "</span>"
      : "";
    var cover = p.cover_url
      ? '<div class="cover" style="background-image:url(' + JSON.stringify(p.cover_url) + ')">' +
        '<span class="tag">' + esc(p.code) + "</span>" + mcmvTag + "</div>"
      : '<div class="cover"><span class="tag">' + esc(p.code) + "</span>" + mcmvTag +
        '<div class="noimg">sem foto</div></div>';
    el.innerHTML =
      cover +
      '<div class="body"><div class="ttl">' + esc(p.title) + "</div>" +
      '<div class="loc">' + esc(locText(p)) + "</div>" +
      '<div class="specs">' + specs(p).map(function (s) { return "<span>" + esc(s) + "</span>"; }).join("") + "</div>" +
      '<div class="price">' + priceHtml(p) + "</div></div>";
    el.addEventListener("click", function () { openDetail(p.slug || p.code); });
    return el;
  }

  // ── Detalhe ───────────────────────────────────────────────────────────────
  function openDetail(slug) {
    fetch(BASE + "/properties/" + encodeURIComponent(slug))
      .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
      .then(renderDetail)
      .catch(function () {});
  }

  function renderDetail(p) {
    var ov = document.createElement("div");
    ov.className = "ov";
    var gal = (p.photos && p.photos.length)
      ? p.photos.map(function (u) { return '<img src="' + esc(u) + '" alt="">'; }).join("")
      : '<div class="noimg">Fotos em breve</div>';
    var chips = specs(p).concat(
      p.year_built ? ["Ano " + p.year_built] : [],
      p.condo_fee ? ["Cond. " + money(p.condo_fee)] : [],
      p.iptu_amount ? ["IPTU " + money(p.iptu_amount)] : []
    );
    var wa = p.whatsapp_url
      ? '<a class="btn btn-wa" href="' + esc(p.whatsapp_url) + '" target="_blank" rel="noopener">WhatsApp</a>'
      : "";
    var leadForm = state.config.lead_capture_enabled ? leadFormHtml() : "";

    var video = p.video_embed
      ? '<div class="video"><iframe src="' + esc(p.video_embed) +
        '" title="Vídeo do imóvel ' + esc(p.code) +
        '" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture"' +
        ' allowfullscreen></iframe></div>'
      : "";

    ov.innerHTML =
      '<button class="close" aria-label="Fechar">×</button>' +
      '<div class="sheet"><div class="gal">' + gal + "</div>" + video +
      '<div class="dt"><h2>' + esc(p.title) + "</h2>" +
      '<div class="loc">' + esc(kindLabel(p.kind)) + " · " + esc(locText(p)) + "</div>" +
      '<div class="price">' + priceHtml(p) + "</div>" +
      (p.description ? '<p class="desc">' + esc(p.description) + "</p>" : "") +
      '<div class="chips">' + chips.map(function (c) { return '<span class="chip">' + esc(c) + "</span>"; }).join("") + "</div>" +
      '<div class="cta">' + wa +
        '<a class="btn btn-ghost" href="mailto:' + esc(state.config.email || "") + '">E-mail</a></div>' +
      leadForm +
      "</div></div>";

    function close() { ov.remove(); }
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    ov.querySelector(".close").addEventListener("click", close);
    if (state.config.lead_capture_enabled) wireLeadForm(ov, p);
    root.appendChild(ov);
  }

  function leadFormHtml() {
    return (
      '<form class="lead"><h3>Tenho interesse</h3>' +
      '<div class="row"><input name="name" placeholder="Seu nome" required>' +
      '<input name="phone" placeholder="Telefone / WhatsApp" required></div>' +
      '<div class="row"><input name="email" placeholder="E-mail (opcional)" type="email">' +
      '<input name="website" tabindex="-1" autocomplete="off" ' +
      'style="position:absolute;left:-9999px" aria-hidden="true"></div>' +
      '<textarea name="message" placeholder="Escreva sua mensagem (opcional)"></textarea>' +
      '<div style="margin-top:10px"><button class="btn btn-primary" type="submit">Enviar</button>' +
      '<span class="ok" hidden>Recebido! Em breve entramos em contato.</span></div></form>'
    );
  }

  function wireLeadForm(ov, p) {
    var form = ov.querySelector(".lead");
    if (!form) return;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var data = {
        name: form.name.value.trim(),
        phone: form.phone.value.trim(),
        email: form.email.value.trim() || null,
        message: form.message.value.trim() || null,
        website: form.website.value,
        property_code: p.code,
        interest: p.purpose === "locacao" ? "locacao" : "venda",
      };
      var btn = form.querySelector("button");
      btn.disabled = true;
      fetch(BASE + "/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
        .then(function (r) {
          if (!r.ok) throw new Error();
          form.querySelector(".ok").hidden = false;
          form.name.value = form.phone.value = form.email.value = form.message.value = "";
        })
        .catch(function () { btn.disabled = false; alert("Não foi possível enviar. Tente pelo WhatsApp."); });
    });
  }

  // ── Carregamento ──────────────────────────────────────────────────────────
  function query() {
    var f = state.filters;
    var q = ["page=" + state.page, "page_size=" + PAGE_SIZE, "sort=" + encodeURIComponent(f.sort)];
    if (f.purpose) q.push("purpose=" + f.purpose);
    if (f.kind) q.push("kind=" + encodeURIComponent(f.kind));
    if (f.neighborhood) q.push("neighborhood=" + encodeURIComponent(f.neighborhood));
    if (f.max_price) q.push("max_price=" + encodeURIComponent(f.max_price.replace(/[^\d]/g, "")));
    if (f.mcmv) q.push("mcmv=" + encodeURIComponent(f.mcmv));
    return q.join("&");
  }

  function load(reset) {
    if (state.loading) return;
    state.loading = true;
    if (reset) { state.items = []; $(".grid").innerHTML = ""; }
    $(".foot").innerHTML = '<div class="loading">Carregando imóveis…</div>';

    fetch(BASE + "/properties?" + query())
      .then(function (r) { return r.json(); })
      .then(function (data) {
        state.total = data.total;
        state.items = state.items.concat(data.items);
        renderGrid();
      })
      .catch(function () { $(".foot").innerHTML = '<div class="empty">Não foi possível carregar os imóveis.</div>'; })
      .finally(function () { state.loading = false; });
  }

  function renderGrid() {
    var grid = $(".grid");
    if (!state.items.length) {
      grid.innerHTML = "";
      $(".count").textContent = "";
      $(".foot").innerHTML = '<div class="empty">Nenhum imóvel encontrado com esses filtros.</div>';
      return;
    }
    grid.innerHTML = "";
    state.items.forEach(function (p) { grid.appendChild(card(p)); });
    $(".count").textContent =
      state.total + (state.total === 1 ? " imóvel disponível" : " imóveis disponíveis");
    $(".foot").innerHTML = "";
    if (state.items.length < state.total) {
      var more = document.createElement("button");
      more.className = "more";
      more.textContent = "Carregar mais";
      more.addEventListener("click", function () { state.page += 1; load(false); });
      $(".foot").appendChild(more);
    }
  }

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  fetch(BASE + "/showcase")
    .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
    .then(function (cfg) {
      state.config = cfg;
      styleEl.textContent = css(cfg.color_primary || "#1f4d8f");
      renderBar();
      load(true);
    })
    .catch(function (err) {
      styleEl.textContent = css("#1f4d8f");
      view.innerHTML = '<div class="vt"><div class="empty">Vitrine indisponível no momento.</div></div>';
      console.error("[vitrine] falha ao carregar a configuração:", err);
    });
})();
