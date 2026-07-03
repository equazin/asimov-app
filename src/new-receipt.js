
    /* ─── Estado ─── */
    let facturas = [];
    let nextFactId = 1;
    let clienteData = null;
    let cheques = [];
    let nextChequeId = 1;
    let methodAmts = { efectivo: 0, transferencia: 0, cheque: 0, tarjeta: 0, otros: 0 };

    /* ─── Init ─── */
    (function init() {
      var now = new Date();
      var yr = String(now.getFullYear()).slice(2);
      var mo = String(now.getMonth() + 1).padStart(2, "0");
      var nr = "REC-" + yr + mo + "-" + String(Math.floor(10000 + Math.random() * 90000));
      document.getElementById("txtNroRec").value = nr;
      document.getElementById("lblNroRec").textContent = "#" + nr;
      document.getElementById("txtFecha").value = now.toISOString().slice(0, 10);
      document.getElementById("txtFechaCreacion").value = now.toLocaleDateString("es-AR");
      document.getElementById("mFechaTransf").value = now.toISOString().slice(0, 10);
      renderCheques();
    })();

    /* ─── Tabs ─── */
    document.querySelectorAll(".tab").forEach(function(tab) {
      tab.addEventListener("click", function() {
        document.querySelectorAll(".tab").forEach(function(t) { t.classList.remove("active"); });
        document.querySelectorAll(".tab-panel").forEach(function(p) { p.classList.remove("active"); });
        tab.classList.add("active");
        document.getElementById("panel-" + tab.dataset.tab).classList.add("active");
        if (tab.dataset.tab === "cobro") updateCobroSummary();
      });
    });

    /* ─── Client picker ─── */
    document.getElementById("btnBuscarCliente").addEventListener("click", openClientPicker);
    document.getElementById("txtClienteNombre").addEventListener("keydown", function(e) {
      if (e.key === "F4") { e.preventDefault(); openClientPicker(); }
    });

    function openClientPicker() {
      if (window.asimovNewReceipt) window.asimovNewReceipt.openClientSelection();
    }

    if (window.asimovNewReceipt) {
      window.asimovNewReceipt.onClientSelected(function(data) {
        if (data.contextId !== "recibo-cliente" || !data.client) return;
        clienteData = data.client;
        document.getElementById("txtClienteCodigo").value = data.client.codigo || data.client.id || "";
        document.getElementById("txtClienteNombre").value = data.client.razonSocial || data.client.name || "";
        document.getElementById("txtClienteCuit").value = data.client.cuit || "";
        document.getElementById("txtClienteIva").value = data.client.condicionIva || "";
      });
    }

    /* ─── Facturas table ─── */
    document.getElementById("btnAddFact").addEventListener("click", function() {
      var id = nextFactId++;
      facturas.push({ id: id, nroFact: "", fecha: new Date().toISOString().slice(0, 10), importe: 0, saldo: 0, cobrado: 0 });
      renderFacturas();
      setTimeout(function() {
        var inp = document.querySelector('[data-fid="' + id + '"][data-ffield="nroFact"]');
        if (inp) inp.focus();
      }, 30);
    });

    function renderFacturas() {
      var tbody = document.getElementById("factBody");
      var count = facturas.length;
      document.getElementById("lblFactCount").textContent = count + (count === 1 ? " comprobante" : " comprobantes");

      tbody.innerHTML = "";
      if (count === 0) {
        tbody.innerHTML = '<tr id="factEmptyRow"><td colspan="7" style="text-align:center;color:var(--text-muted);font-style:italic;padding:40px 0;">Sin comprobantes</td></tr>';
        document.getElementById("factTotal").textContent = "$ 0,00";
        updateHeader();
        return;
      }

      var totalCobrado = 0;
      facturas.forEach(function(row, idx) {
        totalCobrado += row.cobrado;
        var tr = document.createElement("tr");
        tr.innerHTML =
          '<td style="text-align:center;color:var(--text-muted);font-size:10px;">' + (idx + 1) + '</td>' +
          '<td><input style="width:100%;height:22px;border:1px solid transparent;border-radius:3px;padding:0 4px;font-family:Consolas,monospace;font-size:11px;font-weight:700;background:transparent;outline:none;" data-fid="' + row.id + '" data-ffield="nroFact" value="' + esc(row.nroFact) + '" placeholder="Ej: B 0001-00000123" /></td>' +
          '<td><input type="date" style="width:100%;height:22px;border:1px solid transparent;border-radius:3px;padding:0 4px;font-size:11px;background:transparent;outline:none;" data-fid="' + row.id + '" data-ffield="fecha" value="' + row.fecha + '" /></td>' +
          '<td class="td-r"><input class="fact-input" style="color:var(--text-muted);" type="number" min="0" step="0.01" data-fid="' + row.id + '" data-ffield="importe" value="' + row.importe + '" placeholder="0.00" /></td>' +
          '<td class="td-r"><input class="fact-input" style="color:var(--text-muted);" type="number" min="0" step="0.01" data-fid="' + row.id + '" data-ffield="saldo" value="' + row.saldo + '" placeholder="0.00" /></td>' +
          '<td class="td-r"><input class="fact-input" type="number" min="0" step="0.01" data-fid="' + row.id + '" data-ffield="cobrado" value="' + row.cobrado + '" placeholder="0.00" /></td>' +
          '<td style="text-align:center;"><button class="del-row-btn" data-fid="' + row.id + '">×</button></td>';
        tbody.appendChild(tr);
      });

      tbody.querySelectorAll("[data-ffield]").forEach(function(inp) {
        inp.addEventListener("change", onFactChange);
      });
      tbody.querySelectorAll(".del-row-btn").forEach(function(btn) {
        btn.addEventListener("click", function() {
          facturas = facturas.filter(function(r) { return r.id !== parseInt(btn.dataset.fid); });
          renderFacturas();
        });
      });

      document.getElementById("factTotal").textContent = "$ " + fmtNum(totalCobrado);
      updateHeader(totalCobrado);
      updateCobroSummary();
    }

    function onFactChange(e) {
      var el = e.target;
      var fid = parseInt(el.dataset.fid);
      var field = el.dataset.ffield;
      var row = facturas.find(function(r) { return r.id === fid; });
      if (!row) return;
      if (field === "importe" || field === "saldo" || field === "cobrado") {
        row[field] = parseFloat(el.value) || 0;
        if (field === "importe" && !row.saldo) row.saldo = row.importe;
        if (field === "saldo" && !row.cobrado) row.cobrado = row.saldo;
      } else {
        row[field] = el.value;
      }
      var totalCobrado = facturas.reduce(function(s, r) { return s + r.cobrado; }, 0);
      document.getElementById("factTotal").textContent = "$ " + fmtNum(totalCobrado);
      updateHeader(totalCobrado);
      updateCobroSummary();
    }

    /* ─── Method toggles ─── */
    document.querySelectorAll(".method-toggle").forEach(function(btn) {
      btn.addEventListener("click", function(e) {
        e.stopPropagation();
        btn.classList.toggle("on");
        var method = btn.id.replace("mtgl-", "");
        var body = document.getElementById("mbody-" + method);
        body.classList.toggle("hidden");
        if (!btn.classList.contains("on")) {
          methodAmts[method] = 0;
          var mAmt = document.getElementById("mAmt-" + method);
          if (mAmt) mAmt.textContent = "$ 0,00";
          updateCobroSummary();
        }
      });
    });
    document.querySelectorAll(".method-header").forEach(function(hdr) {
      hdr.addEventListener("click", function(e) {
        if (e.target.classList.contains("method-toggle")) return;
        var toggle = hdr.querySelector(".method-toggle");
        if (toggle) toggle.click();
      });
    });

    window.updateMethodAmt = function(method, val) {
      methodAmts[method] = parseFloat(val) || 0;
      var el = document.getElementById("mAmt-" + method);
      if (el) el.textContent = "$ " + fmtNum(methodAmts[method]);
      updateCobroSummary();
    };

    /* ─── Cheques ─── */
    document.getElementById("btnAddCheque").addEventListener("click", function() {
      cheques.push({ id: nextChequeId++, banco: "", nro: "", fecha: new Date().toISOString().slice(0,10), importe: 0, tipo: "Al día" });
      renderCheques();
    });

    function renderCheques() {
      var container = document.getElementById("chequesContainer");
      container.innerHTML = "";
      if (cheques.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted);font-size:11px;font-style:italic;">Sin cheques — haga clic en "+ Agregar cheque"</p>';
        methodAmts.cheque = 0;
        document.getElementById("mAmt-cheque").textContent = "$ 0,00";
        updateCobroSummary();
        return;
      }
      cheques.forEach(function(ch) {
        var div = document.createElement("div");
        div.style.cssText = "display:grid;grid-template-columns:1fr 1fr 1fr 1fr 90px 24px;gap:6px 8px;align-items:end;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid #ebebeb;";
        div.innerHTML =
          mkField("Banco", '<input type="text" value="' + esc(ch.banco) + '" data-chid="' + ch.id + '" data-chfield="banco" placeholder="Banco emisor..." />') +
          mkField("Nro. cheque", '<input type="text" value="' + esc(ch.nro) + '" data-chid="' + ch.id + '" data-chfield="nro" placeholder="Nro..." style="font-family:Consolas,monospace;" />') +
          mkField("Vto. / Fecha", '<input type="date" value="' + ch.fecha + '" data-chid="' + ch.id + '" data-chfield="fecha" />') +
          mkField("Tipo", '<select data-chid="' + ch.id + '" data-chfield="tipo"><option' + (ch.tipo==="Al día"?" selected":"") + '>Al día</option><option' + (ch.tipo==="Diferido"?" selected":"") + '>Diferido</option><option' + (ch.tipo==="Cruzado"?" selected":"") + '>Cruzado</option></select>') +
          mkField("Importe", '<input type="number" min="0" step="0.01" value="' + ch.importe + '" data-chid="' + ch.id + '" data-chfield="importe" style="font-weight:700;" />') +
          '<div style="display:flex;align-items:flex-end;"><button class="del-row-btn" data-chid="' + ch.id + '">×</button></div>';
        container.appendChild(div);
      });
      container.querySelectorAll("[data-chfield]").forEach(function(inp) {
        inp.addEventListener("change", function() {
          var chid = parseInt(inp.dataset.chid);
          var field = inp.dataset.chfield;
          var row = cheques.find(function(c) { return c.id === chid; });
          if (!row) return;
          row[field] = field === "importe" ? (parseFloat(inp.value) || 0) : inp.value;
          var total = cheques.reduce(function(s, c) { return s + c.importe; }, 0);
          methodAmts.cheque = total;
          document.getElementById("mAmt-cheque").textContent = "$ " + fmtNum(total);
          updateCobroSummary();
        });
      });
      container.querySelectorAll(".del-row-btn").forEach(function(btn) {
        btn.addEventListener("click", function() {
          cheques = cheques.filter(function(c) { return c.id !== parseInt(btn.dataset.chid); });
          renderCheques();
        });
      });
      var total = cheques.reduce(function(s, c) { return s + c.importe; }, 0);
      methodAmts.cheque = total;
      document.getElementById("mAmt-cheque").textContent = "$ " + fmtNum(total);
      updateCobroSummary();
    }

    function mkField(label, inputHtml) {
      return '<div><label style="display:block;font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;">' + label + '</label>' +
        '<div style="height:26px;">' + inputHtml.replace(/(<input|<select)/, '$1 style="width:100%;height:26px;border:1px solid var(--border);border-radius:4px;padding:0 6px;font-family:inherit;font-size:12px;background:var(--input-bg);outline:none;"').replace(/style="([^"]+)"([^>]+style="width)/, 'style="$1" $2') + '</div></div>';
    }

    /* ─── Summary & header ─── */
    function updateCobroSummary() {
      var factTotal = facturas.reduce(function(s, r) { return s + r.cobrado; }, 0);
      var totalCobrado = Object.values(methodAmts).reduce(function(s, v) { return s + v; }, 0);
      var diff = totalCobrado - factTotal;

      document.getElementById("sumFactTotal").textContent = "$ " + fmtNum(factTotal);
      document.getElementById("sumEfectivo").textContent = "$ " + fmtNum(methodAmts.efectivo);
      document.getElementById("sumTransf").textContent = "$ " + fmtNum(methodAmts.transferencia);
      document.getElementById("sumCheques").textContent = "$ " + fmtNum(methodAmts.cheque);
      document.getElementById("sumTarjeta").textContent = "$ " + fmtNum(methodAmts.tarjeta);
      document.getElementById("sumOtros").textContent = "$ " + fmtNum(methodAmts.otros);
      document.getElementById("sumTotalCobrado").textContent = "$ " + fmtNum(totalCobrado);

      var diffRow = document.getElementById("sumDiffRow");
      var diffVal = document.getElementById("sumDiff");
      diffVal.textContent = (diff >= 0 ? "+ " : "- ") + "$ " + fmtNum(Math.abs(diff));
      diffRow.className = "cobro-summary-row " + (Math.abs(diff) < 0.01 ? "diff-ok" : "diff-err");

      // Vuelto
      var ef = document.getElementById("minput-efectivo");
      if (ef) {
        var vuelto = parseFloat(ef.value || "0") - factTotal;
        var vueltoEl = document.getElementById("mVuelto");
        if (vueltoEl) vueltoEl.value = Math.max(0, vuelto).toFixed(2);
      }
    }

    function updateHeader(total) {
      total = total || facturas.reduce(function(s, r) { return s + r.cobrado; }, 0);
      document.getElementById("lblTotalHeader").textContent = "$ " + fmtNum(total);
    }

    /* ─── Keyboard ─── */
    window.addEventListener("keydown", function(e) {
      if (e.key === "F8") { e.preventDefault(); document.getElementById("btnSave").click(); }
    });

    /* ─── Footer buttons ─── */
    document.getElementById("btnNew").addEventListener("click", function() {
      facturas = []; nextFactId = 1; clienteData = null; cheques = []; nextChequeId = 1;
      methodAmts = { efectivo: 0, transferencia: 0, cheque: 0, tarjeta: 0, otros: 0 };
      var now = new Date();
      var yr = String(now.getFullYear()).slice(2);
      var mo = String(now.getMonth() + 1).padStart(2, "0");
      var nr = "REC-" + yr + mo + "-" + String(Math.floor(10000 + Math.random() * 90000));
      document.getElementById("txtNroRec").value = nr;
      document.getElementById("lblNroRec").textContent = "#" + nr;
      document.getElementById("lblTotalHeader").textContent = "$ 0,00";
      document.getElementById("txtClienteCodigo").value = "";
      document.getElementById("txtClienteNombre").value = "";
      document.getElementById("txtClienteCuit").value = "";
      document.getElementById("txtClienteIva").value = "";
      document.querySelectorAll(".method-toggle.on").forEach(function(t) { t.click(); });
      renderFacturas(); renderCheques();
    });

    document.getElementById("btnSave").addEventListener("click", function() {
      if (!document.getElementById("txtClienteNombre").value.trim()) {
        alert("Seleccione un cliente antes de guardar.");
        document.querySelectorAll(".tab").forEach(function(t) { if (t.dataset.tab === "encabezado") t.click(); });
        document.getElementById("txtClienteNombre").focus();
        return;
      }
      if (facturas.length === 0) {
        alert("Agregue al menos un comprobante en la pestaña 'Facturas cobradas'.");
        document.querySelectorAll(".tab").forEach(function(t) { if (t.dataset.tab === "facturas") t.click(); });
        return;
      }
      var receipt = {
        nroRec: document.getElementById("txtNroRec").value,
        fecha: document.getElementById("txtFecha").value,
        cliente: clienteData,
        clienteNombre: document.getElementById("txtClienteNombre").value,
        concepto: document.getElementById("txtConcepto").value,
        facturas: facturas,
        cobro: Object.assign({}, methodAmts, { cheques: cheques }),
        totalCobrado: Object.values(methodAmts).reduce(function(s, v) { return s + v; }, 0),
      };
      if (window.asimovNewReceipt) window.asimovNewReceipt.saveReceipt(receipt);
    });

    var closeHandler = function() {
      if (window.asimovNewReceipt) window.asimovNewReceipt.cancel();
    };
    document.getElementById("btnExit").addEventListener("click", closeHandler);
    document.getElementById("btnClose").addEventListener("click", closeHandler);

    function esc(str) {
      return String(str || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
    function fmtNum(n) {
      return isNaN(n) ? "0,00" : Number(n).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    renderFacturas();
    updateCobroSummary();
  
  // [CSP] Delegación de eventos: reemplaza los handlers inline (onclick/oninput/
  // onchange), permitiendo CSP script-src 'self' sin 'unsafe-inline'.
  document.querySelectorAll('[data-onclick]').forEach(function (el) {
    var n = el.getAttribute('data-onclick');
    el.addEventListener('click', function () {
      if (n === 'close') { window.close(); }
      else if (typeof window[n] === 'function') { window[n](); }
    });
  });
  ['input', 'change'].forEach(function (evt) {
    document.querySelectorAll('[data-on' + evt + ']').forEach(function (el) {
      var parts = el.getAttribute('data-on' + evt).split(':');
      var n = parts[0], arg = parts[1];
      el.addEventListener(evt, function () {
        if (typeof window[n] !== 'function') return;
        if (arg !== undefined) { window[n](arg, el.value); } else { window[n](); }
      });
    });
  });
