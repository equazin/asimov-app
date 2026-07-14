/*
 * Renderer de comprobantes para impresión. Cada formulario define
 * window.getPrintData() devolviendo datos normalizados; este script arma el
 * membrete + cuerpo en #print-area y dispara la impresión (window.print()).
 *
 * Datos del emisor (Bartez) — única fuente de verdad para todos los membretes.
 */
(function () {
  "use strict";

  var LOGO = "bartez-logo.png"; // logo reversado (claro), para membretes con banda de color
  var LOGO_FACTURA = "bartez-logo-negro.png"; // logo horizontal alta-res (oscuro), membrete claro de factura

  var EMISOR = {
    nombre: "BARTEZ",
    sub: "de Andrés Benitez",
    dir: "9 de Julio 3418 · CP 2000 · Rosario · Santa Fe",
    web: "ventas@bartez.com.ar · www.bartez.com.ar",
    iva: "Responsable Inscripto",
    cuit: "20-21774424-6",
    iibb: "021-356720-2",
    inicio: "01/2019",
  };

  // Código AFIP asociado a cada letra fiscal (RG 100/98).
  var LETTER_CODE = { A: "COD 01", B: "COD 06", C: "COD 11", M: "COD 51" };

  var fmt = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 });
  function money(n) { var v = Number(n); return fmt.format(isFinite(v) ? v : 0); }
  function num3(n) { var v = Number(n); return (isFinite(v) ? v : 0).toLocaleString("es-AR", { maximumFractionDigits: 3 }); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function d(v, def) { v = String(v == null ? "" : v).trim(); return v || (def || ""); }

  // ---------- Cabecera común (dos columnas) ----------
  function emisorFiscal() {
    return "<b>" + EMISOR.nombre + "</b> — " + EMISOR.sub + "<br/>" + EMISOR.dir + "<br/>" + EMISOR.web;
  }
  function fullFiscalLine() {
    return "IVA: <b>" + EMISOR.iva + "</b> · CUIT: <b>" + EMISOR.cuit + "</b><br/>" +
           "IIBB: <b>" + EMISOR.iibb + "</b> · Inicio act.: <b>" + EMISOR.inicio + "</b>";
  }
  function bandLeft() {
    return (
      '<div class="band-left">' +
        '<img class="logo" src="' + LOGO_FACTURA + '" alt="Bartez" />' +
        '<div class="addr">' + emisorFiscal() + "</div>" +
      "</div>"
    );
  }
  /*
   * bandRight(opts):
   *   letter      — letra fiscal (A/B/C/M/X). Si está, dibuja la caja con código.
   *   docName     — título del comprobante (FACTURA / REMITO / …).
   *   docSub      — subtítulo bajo el título (opcional).
   *   badge       — HTML opcional (usado por remito para el "no válido como factura").
   *   numRows     — array de { k, v } → filas "Nº / Fecha / Vendedor / …".
   *   fiscalLine  — HTML con los datos fiscales del emisor (opcional).
   */
  function bandRight(opts) {
    var letterBox = "";
    if (opts.letter) {
      var code = LETTER_CODE[opts.letter] || "";
      letterBox =
        '<div class="letter-box"><span class="l">' + esc(opts.letter) + "</span>" +
        (code ? '<span class="c">' + esc(code) + "</span>" : "") +
        "</div>";
    }
    var badge = opts.badge ? "<div>" + opts.badge + "</div>" : "";
    var numRows = (opts.numRows || []).map(function (r) {
      return '<div><span class="k">' + esc(r.k) + "</span> <b>" + esc(r.v) + "</b></div>";
    }).join("");
    var fiscal = opts.fiscalLine ? '<div class="fiscal-line">' + opts.fiscalLine + "</div>" : "";
    return (
      '<div class="band-right">' +
        '<div class="top-row">' +
          letterBox +
          '<div class="doc-info">' +
            '<div class="doc-name">' + esc(opts.docName) + "</div>" +
            (opts.docSub ? '<div class="doc-sub">' + esc(opts.docSub) + "</div>" : "") +
            badge +
            (numRows ? '<div class="num-block">' + numRows + "</div>" : "") +
          "</div>" +
        "</div>" +
        fiscal +
      "</div>"
    );
  }
  function band(opts) {
    return '<div class="band">' + bandLeft() + bandRight(opts) + "</div>";
  }

  // ---------- Membretes por tipo ----------
  function mbFactura(data) {
    return band({
      letter: d(data.letter, "X"),
      docName: d(data.documentName, "FACTURA"),
      numRows: [
        { k: "Nº", v: data.number },
        { k: "Fecha", v: data.date },
      ],
      fiscalLine: fullFiscalLine(),
    });
  }
  function mbPedido(data) {
    return band({
      docName: "PEDIDO",
      docSub: "Nota de venta",
      numRows: [
        { k: "Nº", v: data.number },
        { k: "Fecha", v: data.date },
        { k: "Vendedor", v: d(data.vendedor, "—") },
      ],
      fiscalLine: fullFiscalLine(),
    });
  }
  function mbPresupuesto(data) {
    return band({
      docName: "PRESUPUESTO",
      docSub: "Cotización",
      numRows: [
        { k: "Nº", v: data.number },
        { k: "Fecha", v: data.date },
        { k: "Validez", v: d(data.validez, "15 días") },
      ],
      fiscalLine: fullFiscalLine(),
    });
  }
  function mbRemito(data) {
    return band({
      docName: "REMITO",
      badge: '<span class="badge-nofac">DOCUMENTO NO VÁLIDO COMO FACTURA</span>',
      numRows: [
        { k: "Nº", v: data.number },
        { k: "Fecha", v: data.date },
        { k: "Transporte", v: d(data.transporte, "—") },
      ],
      fiscalLine: fullFiscalLine(),
    });
  }
  function mbRecibo(data) {
    return band({
      docName: "RECIBO",
      numRows: [
        { k: "Nº", v: data.number },
        { k: "Fecha", v: data.date },
      ],
      fiscalLine: fullFiscalLine(),
    });
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

    // Modo consolidado: un solo renglón principal con la descripción provista y
    // el total neto (subtotal), y todos los ítems reales como sub-líneas
    // informativas sin precio individual. La totalización fiscal (IVA por
    // alícuota + total) sigue calculándose sobre los ítems reales en el bloque
    // de totales, no acá.
    if (withPrices && data.consolidated && items.length > 0) {
      var t = data.totals || {};
      var mainNet = Number(t.subtotal != null ? t.subtotal : items.reduce(function (acc, it) {
        return acc + Number(it.qty || 0) * Number(it.unitPrice || 0);
      }, 0));
      var label = String(data.consolidatedLabel || "Equipo armado");
      var mainRow =
        "<tr>" +
        "<td>—</td>" +
        "<td>" + esc(label) + "</td>" +
        '<td class="c">1</td>' +
        '<td class="r">' + money(mainNet) + "</td>" +
        '<td class="c">—</td>' +
        '<td class="r">' + money(mainNet) + "</td>" +
        "</tr>";
      var subRows = items.map(function (it) {
        return (
          '<tr class="kit-component">' +
          '<td class="kit-comp-code">' + esc(it.code || "") + "</td>" +
          '<td class="kit-comp-desc">' + esc(it.description || "") + "</td>" +
          '<td class="c">' + num3(it.qty) + "</td>" +
          '<td colspan="3"></td>' +
          "</tr>"
        );
      }).join("");
      return '<table class="items">' + head + "<tbody>" + mainRow + subRows + "</tbody></table>";
    }

    var body = items.map(function (it) {
      var line = withPrices ? (Number(it.qty) * Number(it.unitPrice)) : 0;
      var mainRow =
        "<tr>" +
        "<td>" + esc(it.code) + "</td>" +
        "<td>" + esc(it.description) + "</td>" +
        '<td class="c">' + num3(it.qty) + "</td>" +
        (withPrices
          ? '<td class="r">' + money(it.unitPrice) + '</td><td class="c">' + esc(it.ivaPct) + '</td><td class="r">' + money(it.lineTotal != null ? it.lineTotal : line) + "</td>"
          : '<td class="c">' + esc(d(it.unit, "UN")) + "</td>") +
        "</tr>";
      // Sub-líneas informativas de un kit: cantidad + descripción del componente
      // con el resto de las columnas vacías (sin precio unitario, sin importe).
      var subRows = "";
      if (Array.isArray(it.components) && it.components.length > 0) {
        var extraCols = withPrices ? 3 : 1;
        subRows = it.components.map(function (c) {
          return (
            '<tr class="kit-component">' +
            '<td class="kit-comp-code">' + esc(c.code || "") + "</td>" +
            '<td class="kit-comp-desc">' + esc(c.description || "") + "</td>" +
            '<td class="c">' + num3(c.qty) + "</td>" +
            '<td colspan="' + extraCols + '"></td>' +
            "</tr>"
          );
        }).join("");
      }
      return mainRow + subRows;
    }).join("");
    return '<table class="items">' + head + "<tbody>" + body + "</tbody></table>";
  }

  // ---------- Totales ----------
  function totalsBlock(type, data) {
    if (type === "remito") return "";
    if (type === "recibo") {
      return '<div class="totals"><table>' +
        '<tr class="grand"><td class="k">TOTAL RECIBIDO</td><td class="v">' + money(data.total) + "</td></tr>" +
        "</table></div>";
    }
    var t = data.totals || {};
    var rows = "";
    if (t.subtotal != null) rows += '<tr><td class="k">Subtotal</td><td class="v">' + money(t.subtotal) + "</td></tr>";
    if (t.iva != null) rows += '<tr><td class="k">IVA</td><td class="v">' + money(t.iva) + "</td></tr>";
    if (t.perc) rows += '<tr><td class="k">Percep. IIBB</td><td class="v">' + money(t.perc) + "</td></tr>";
    rows += '<tr class="grand"><td class="k">TOTAL</td><td class="v">' + money(t.total) + "</td></tr>";
    return '<div class="totals"><table>' + rows + "</table></div>";
  }

  function notesBlock(data) {
    var cotiz = Number(data.usdRate);
    var cotizHtml = isFinite(cotiz) && cotiz > 0
      ? '<div class="cotizacion"><b>Cotización:</b> ' + cotiz.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "</div>"
      : "";
    var obs = data.notes ? "Observaciones: " + esc(data.notes) : "";
    return '<div class="notes">' + cotizHtml + obs + "</div>";
  }
  function footBlock() {
    return '<div class="foot"><span>' + EMISOR.nombre + " — " + EMISOR.sub + "</span><span>Impreso por Asimov ERP</span></div>";
  }

  // Bloque CAE + QR de AFIP (RG 4892). Solo se muestra si la factura fue autorizada.
  function caeBlock(data) {
    if (!data || !data.cae) return "";
    var qr = data.qrDataUrl
      ? '<img class="afip-qr" src="' + esc(data.qrDataUrl) + '" alt="QR AFIP" />'
      : "";
    return '<div class="afip-cae">' +
      qr +
      '<div class="afip-data">' +
      '<div><strong>CAE N°:</strong> ' + esc(data.cae) + "</div>" +
      '<div><strong>Vencimiento CAE:</strong> ' + esc(data.caeExpiration || "") + "</div>" +
      '<div class="afip-status">Comprobante autorizado por AFIP/ARCA</div>' +
      "</div></div>";
  }

  function documentSummaryBlock(type, data) {
    var authorization = type === "factura" ? caeBlock(data) : "";
    var totals = totalsBlock(type, data);
    if (!authorization && !totals) return "";
    return '<div class="document-summary ' + (authorization ? "with-authorization" : "totals-only") + '">' +
      (authorization ? '<div class="fiscal-authorization">' + authorization + "</div>" : "") +
      totals +
      "</div>";
  }

  var MEMBRETE = { factura: mbFactura, pedido: mbPedido, presupuesto: mbPresupuesto, remito: mbRemito, recibo: mbRecibo };

  window.renderComprobante = function (type, data) {
    var area = document.getElementById("print-area");
    if (!area) return;
    var mb = MEMBRETE[type] || mbFactura;
    var documentEnd =
      '<div class="document-end">' +
        documentSummaryBlock(type, data) +
        notesBlock(data) +
        footBlock() +
      "</div>";
    // En comprobantes de una hoja, el resumen y el pie quedan anclados al margen
    // inferior. A partir de 17 renglones se conserva el flujo multipágina para
    // no superponer el cierre ni recortar contenido cuando una fila ocupa más alto.
    var pinDocumentEnd = (data.items || []).length <= 16;
    area.className = "cbt mb-" + type + (pinDocumentEnd ? " document-end-pinned" : "");
    area.innerHTML =
      mb(data) +
      partyBlock(data) +
      itemsTable(type, data) +
      documentEnd;
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
