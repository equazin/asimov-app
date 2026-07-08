/*
 * Renderer de comprobantes para impresión. Cada formulario define
 * window.getPrintData() devolviendo datos normalizados; este script arma el
 * membrete + cuerpo en #print-area y dispara la impresión (window.print()).
 *
 * Datos del emisor (Bartez) — única fuente de verdad para todos los membretes.
 */
(function () {
  "use strict";

  var LOGO = "bartez-logo.png"; // copiado a dist/ junto a los HTML

  var EMISOR = {
    nombre: "BARTEZ",
    sub: "de Andrés Benitez",
    dir: "9 de Julio 3418 · CP 2000 · Rosario · Santa Fe",
    tel: "Tel. (0341) 430-3151 / 430-4476 / 435-4230 / 435-4906",
    web: "ventas@bartez.com.ar · www.bartez.com.ar",
    iva: "Responsable Inscripto",
    cuit: "20-21774424-6",
    iibb: "021-356720-2",
    inicio: "01/2019",
  };

  var fmt = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 });
  function money(n) { var v = Number(n); return fmt.format(isFinite(v) ? v : 0); }
  function num3(n) { var v = Number(n); return (isFinite(v) ? v : 0).toLocaleString("es-AR", { maximumFractionDigits: 3 }); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function d(v, def) { v = String(v == null ? "" : v).trim(); return v || (def || ""); }

  // ---------- Membretes por tipo ----------
  function mbFactura(data) {
    return (
      '<div class="band">' +
        '<img class="logo" src="' + LOGO + '" alt="Bartez" />' +
        '<div class="right">' +
          '<div class="letter">' + esc(d(data.letter, "X")) + "</div>" +
          '<div class="meta">' +
            '<div class="big">FACTURA</div>' +
            "<div>N° <span class=\"num\">" + esc(data.number) + "</span></div>" +
            "<div>" + esc(data.date) + "</div>" +
          "</div>" +
        "</div>" +
      "</div>" +
      '<div class="sub">' +
        '<div class="fiscal">' + emisorFiscal() + "</div>" +
        '<div class="fbox">' +
          '<div><span class="k">IVA:</span> <span class="v">' + EMISOR.iva + "</span></div>" +
          '<div><span class="k">CUIT:</span> <span class="v">' + EMISOR.cuit + "</span></div>" +
          '<div><span class="k">Ing. Brutos:</span> <span class="v">' + EMISOR.iibb + "</span></div>" +
          '<div><span class="k">Inicio act.:</span> <span class="v">' + EMISOR.inicio + "</span></div>" +
        "</div>" +
      "</div>"
    );
  }
  function mbPedido(data) {
    return (
      '<div class="band">' +
        '<img class="logo lg" src="' + LOGO + '" alt="Bartez" />' +
        '<div class="right">' +
          '<div class="big">PEDIDO</div>' +
          '<div class="k">NOTA DE VENTA</div>' +
          '<div class="k">N° <span class="num">' + esc(data.number) + "</span> · " + esc(data.date) + "</div>" +
        "</div>" +
      "</div>" +
      '<div class="sub"><div class="fiscal">' + emisorFiscal() +
        '</div><div class="fiscal" style="text-align:right">Vendedor: <b>' + esc(d(data.vendedor, "—")) + "</b></div></div>"
    );
  }
  function mbPresupuesto(data) {
    return (
      '<div class="wrap">' +
        '<div class="side">' +
          '<img class="logo sm" src="' + LOGO + '" alt="Bartez" />' +
          '<div class="emisor"><b>' + EMISOR.sub + "</b><br/>" + EMISOR.dir.split(" · ").slice(0, 2).join("<br/>") +
            "<br/>CUIT " + EMISOR.cuit + "<br/>IVA " + EMISOR.iva + "<br/>" + "ventas@bartez.com.ar</div>" +
        "</div>" +
        '<div class="main">' +
          '<div class="title">PRESUPUESTO<small>PRESUPUESTO / COTIZACIÓN</small></div>' +
          '<div class="row">' +
            '<div><div class="k">Número</div><div class="v">' + esc(data.number) + "</div></div>" +
            '<div><div class="k">Fecha</div><div class="v">' + esc(data.date) + "</div></div>" +
            '<div><div class="k">Validez</div><div class="v">' + esc(d(data.validez, "15 días")) + "</div></div>" +
          "</div>" +
        "</div>" +
      "</div>"
    );
  }
  function mbRemito(data) {
    return (
      '<div class="band"><img class="logo" src="' + LOGO + '" alt="Bartez" /></div>' +
      '<div class="body">' +
        '<div class="title">REMITO</div>' +
        '<div class="note">DOCUMENTO NO VÁLIDO COMO FACTURA</div>' +
        '<div class="meta">' +
          '<div><div class="k">Número</div><div class="v">' + esc(data.number) + "</div></div>" +
          '<div><div class="k">Fecha</div><div class="v">' + esc(data.date) + "</div></div>" +
          '<div><div class="k">Transporte</div><div class="v">' + esc(d(data.transporte, "—")) + "</div></div>" +
        "</div>" +
        '<div class="fiscal"><b>' + EMISOR.sub + "</b> · CUIT " + EMISOR.cuit + " · 9 de Julio 3418, Rosario · IVA " + EMISOR.iva + "</div>" +
      "</div>"
    );
  }
  function mbRecibo(data) {
    return (
      '<div class="wrap">' +
        '<div class="band">' +
          '<img class="logo sm" src="' + LOGO + '" alt="Bartez" />' +
          '<div class="t"><b>' + EMISOR.sub + "</b><br/>CUIT " + EMISOR.cuit + "<br/>9 de Julio 3418, Rosario</div>" +
        "</div>" +
        '<div class="main">' +
          '<div class="title">RECIBO<small>N° ' + esc(data.number) + " · " + esc(data.date) + "</small></div>" +
          '<div class="amount"><div class="k">Total recibido</div><div class="v">' + money(data.total) + "</div></div>" +
        "</div>" +
      "</div>"
    );
  }
  function emisorFiscal() {
    return "<b>" + EMISOR.nombre + "</b> — " + EMISOR.sub + "<br/>" + EMISOR.dir + "<br/>" + EMISOR.tel + "<br/>" + EMISOR.web;
  }

  // ---------- Destinatario ----------
  function partyBlock(data) {
    var p = data.party || {};
    if (!p.name) return "";
    return (
      '<div class="party">' +
        '<div class="full"><span class="k">Sr./es:</span> <b>' + esc(p.name) + "</b></div>" +
        (p.address ? '<div><span class="k">Domicilio:</span> ' + esc(p.address) + "</div>" : "<div></div>") +
        (p.cuit ? '<div><span class="k">CUIT:</span> ' + esc(p.cuit) + "</div>" : "<div></div>") +
        (p.iva ? '<div><span class="k">IVA:</span> ' + esc(p.iva) + "</div>" : "<div></div>") +
        (data.condVenta ? '<div><span class="k">Cond. venta:</span> ' + esc(data.condVenta) + "</div>" : "<div></div>") +
      "</div>"
    );
  }

  // ---------- Tabla de ítems ----------
  function itemsTable(type, data) {
    var items = data.items || [];
    if (!items.length) return "";
    var withPrices = type !== "remito";
    var head =
      "<thead><tr>" +
      "<th>Código</th><th>Descripción</th><th class=\"c\">Cant.</th>" +
      (withPrices ? "<th class=\"r\">P. Unit.</th><th class=\"c\">%IVA</th><th class=\"r\">Importe</th>" : "<th class=\"c\">U.M.</th>") +
      "</tr></thead>";
    var body = items.map(function (it) {
      var line = withPrices ? (Number(it.qty) * Number(it.unitPrice)) : 0;
      return (
        "<tr>" +
        "<td>" + esc(it.code) + "</td>" +
        "<td>" + esc(it.description) + "</td>" +
        '<td class="c">' + num3(it.qty) + "</td>" +
        (withPrices
          ? '<td class="r">' + money(it.unitPrice) + '</td><td class="c">' + esc(it.ivaPct) + '</td><td class="r">' + money(it.lineTotal != null ? it.lineTotal : line) + "</td>"
          : '<td class="c">' + esc(d(it.unit, "UN")) + "</td>") +
        "</tr>"
      );
    }).join("");
    return '<table class="items">' + head + "<tbody>" + body + "</tbody></table>";
  }

  // ---------- Totales ----------
  function totalsBlock(type, data) {
    if (type === "remito" || type === "recibo") return "";
    var t = data.totals || {};
    var rows = "";
    if (t.subtotal != null) rows += '<tr><td class="k">Subtotal</td><td class="v">' + money(t.subtotal) + "</td></tr>";
    if (t.iva != null) rows += '<tr><td class="k">IVA</td><td class="v">' + money(t.iva) + "</td></tr>";
    if (t.perc) rows += '<tr><td class="k">Percep. IIBB</td><td class="v">' + money(t.perc) + "</td></tr>";
    rows += '<tr class="grand"><td class="k">TOTAL</td><td class="v">' + money(t.total) + "</td></tr>";
    return '<div class="totals"><table>' + rows + "</table></div>";
  }

  function notesBlock(data) {
    return '<div class="notes">' + (data.notes ? "Observaciones: " + esc(data.notes) : "") + "</div>";
  }
  function footBlock() {
    return '<div class="foot"><span>' + EMISOR.nombre + " — " + EMISOR.sub + "</span><span>Impreso por Asimov ERP</span></div>";
  }

  // Bloque CAE + QR de AFIP (RG 4892). Solo se muestra si la factura fue autorizada.
  function caeBlock(data) {
    if (!data || !data.cae) return "";
    var qr = data.qrDataUrl
      ? '<img class="afip-qr" src="' + esc(data.qrDataUrl) + '" alt="QR AFIP" style="width:110px;height:110px;" />'
      : "";
    return '<div class="afip-cae" style="display:flex;gap:14px;align-items:center;margin-top:10px;padding-top:8px;border-top:1px solid #ccc;">' +
      qr +
      '<div style="font-size:11px;line-height:1.5;">' +
      '<div><strong>CAE N°:</strong> ' + esc(data.cae) + "</div>" +
      '<div><strong>Vencimiento CAE:</strong> ' + esc(data.caeExpiration || "") + "</div>" +
      '<div style="opacity:0.7;margin-top:2px;">Comprobante autorizado por AFIP/ARCA</div>' +
      "</div></div>";
  }

  var MEMBRETE = { factura: mbFactura, pedido: mbPedido, presupuesto: mbPresupuesto, remito: mbRemito, recibo: mbRecibo };

  window.renderComprobante = function (type, data) {
    var area = document.getElementById("print-area");
    if (!area) return;
    var mb = MEMBRETE[type] || mbFactura;
    area.className = "cbt mb-" + type;
    area.innerHTML =
      mb(data) +
      partyBlock(data) +
      itemsTable(type, data) +
      totalsBlock(type, data) +
      (type === "factura" ? caeBlock(data) : "") +
      notesBlock(data) +
      footBlock();
  };

  window.printComprobante = function (type) {
    if (typeof window.getPrintData !== "function") {
      alert("Impresión no disponible en este documento.");
      return;
    }
    var data = window.getPrintData();
    if (!data) return; // getPrintData ya avisó qué falta
    window.renderComprobante(type, data);
    setTimeout(function () { window.print(); }, 40);
  };
})();
