
    /* ─── Estado ─── */
    let items = [];
    let nextRowId = 1;
    let clienteData = null;
    let tipoActual = "B";

    /* ─── Init ─── */
    (function init() {
      var now = new Date();
      var nroFact = String(Math.floor(1 + Math.random() * 99999999)).padStart(8, "0");
      document.getElementById("txtNroFact").value = nroFact;
      document.getElementById("txtFecha").value = now.toISOString().slice(0, 10);
      document.getElementById("txtFechaCreacion").value = now.toLocaleDateString("es-AR");
      var venc = new Date(now);
      venc.setDate(venc.getDate() + 30);
      document.getElementById("txtFechaVenc").value = venc.toISOString().slice(0, 10);
      document.getElementById("txtPrimerVenc").value = venc.toISOString().slice(0, 10);
      updateHeader();
    })();

    function updateHeader() {
      var ptoVta = document.getElementById("txtPtoVta").value.padStart(4, "0");
      var nroFact = document.getElementById("txtNroFact").value;
      var label = tipoActual + " " + ptoVta + "-" + (nroFact || "00000000");
      document.getElementById("lblNroFact").textContent = label;
      document.getElementById("lblTipoBadge").textContent = tipoLabel(tipoActual);
    }

    function tipoLabel(t) {
      var map = { A: "FACTURA A", B: "FACTURA B", C: "FACTURA C", M: "FACTURA M", ND: "NOTA DE DÉBITO", NC: "NOTA DE CRÉDITO" };
      return map[t] || "FACTURA " + t;
    }

    /* ─── Tipo selector ─── */
    document.querySelectorAll(".tipo-btn").forEach(function(btn) {
      btn.addEventListener("click", function() {
        document.querySelectorAll(".tipo-btn").forEach(function(b) { b.classList.remove("active"); });
        btn.classList.add("active");
        tipoActual = btn.dataset.tipo;
        updateHeader();
      });
    });

    document.getElementById("txtPtoVta").addEventListener("input", updateHeader);

    /* ─── Tabs ─── */
    document.querySelectorAll(".tab").forEach(function(tab) {
      tab.addEventListener("click", function() {
        document.querySelectorAll(".tab").forEach(function(t) { t.classList.remove("active"); });
        document.querySelectorAll(".tab-panel").forEach(function(p) { p.classList.remove("active"); });
        tab.classList.add("active");
        document.getElementById("panel-" + tab.dataset.tab).classList.add("active");
        if (tab.dataset.tab === "totales") updateTotalsTab();
      });
    });

    /* ─── Client picker ─── */
    document.getElementById("btnBuscarCliente").addEventListener("click", openClientPicker);
    document.getElementById("txtClienteNombre").addEventListener("keydown", function(e) {
      if (e.key === "F4") { e.preventDefault(); openClientPicker(); }
    });

    function openClientPicker() {
      if (window.asimovNewInvoice) window.asimovNewInvoice.openClientSelection();
    }

    if (window.asimovNewInvoice) {
      window.asimovNewInvoice.onClientSelected(function(data) {
        if (data.contextId !== "factura-cliente" || !data.client) return;
        clienteData = data.client;
        document.getElementById("txtClienteCodigo").value = data.client.codigo || data.client.id || "";
        document.getElementById("txtClienteNombre").value = data.client.razonSocial || data.client.name || "";
        document.getElementById("txtClienteCuit").value = data.client.cuit || "";
        document.getElementById("txtClienteIva").value = data.client.condicionIva || "";
        document.getElementById("txtClienteDomicilio").value = data.client.domicilio || data.client.address || "";
        // Auto-suggest tipo comprobante
        var iva = (data.client.condicionIva || "").toLowerCase();
        if (iva.includes("inscripto")) setTipo("A");
        else if (iva.includes("monotributo")) setTipo("C");
        else setTipo("B");
      });

      window.asimovNewInvoice.onProductSelected(function(data) {
        if (!data.product) return;
        var row = items.find(function(r) { return String(r.id) === String(data.rowId); });
        if (!row) return;
        row.codigo = data.product.codigo || data.product.code || "";
        row.descripcion = data.product.descripcion || data.product.description || data.product.name || "";
        row.unidad = data.product.unidad || "UN";
        var costo = parseFloat(data.product.importe || data.product.price || "0") || 0;
        row.costo = costo;
        var margenGral = parseFloat(document.getElementById("txtMargenGral").value) || 0;
        row.margen = margenGral;
        row.precio = costo * (1 + margenGral / 100);
        row.cantidad = 1;
        row.iva = parseFloat(data.product.iva || "21") || 21;
        renderItemsTable();
        recalcTotals();
        setTimeout(function() {
          var inp = document.querySelector('[data-id="' + data.rowId + '"][data-field="cantidad"]');
          if (inp) { inp.focus(); inp.select(); }
        }, 50);
      });
    }

    function setTipo(t) {
      tipoActual = t;
      document.querySelectorAll(".tipo-btn").forEach(function(b) {
        b.classList.toggle("active", b.dataset.tipo === t);
      });
      updateHeader();
    }

    /* ─── Items table ─── */
    function addRow(prefill) {
      prefill = prefill || {};
      var rowId = nextRowId++;
      var margenGral = parseFloat(document.getElementById("txtMargenGral").value) || 0;
      items.push({ id: rowId, codigo: "", descripcion: "", unidad: "UN", cantidad: 1, costo: 0, margen: margenGral, precio: 0, descuento: 0, iva: 21 });
      Object.assign(items[items.length - 1], prefill);
      renderItemsTable(); recalcTotals();
      setTimeout(function() {
        var inp = document.querySelector('[data-id="' + rowId + '"][data-field="codigo"]');
        if (inp) inp.focus();
      }, 30);
    }

    function removeRow(rowId) {
      items = items.filter(function(r) { return r.id !== rowId; });
      renderItemsTable(); recalcTotals();
    }

    function renderItemsTable() {
      var tbody = document.getElementById("itemsBody");
      var count = items.length;
      document.getElementById("lblItemCount").textContent = count + (count === 1 ? " ítem" : " ítems");
      tbody.innerHTML = "";
      if (count === 0) {
        var empty = document.createElement("tr");
        empty.innerHTML = '<td colspan="12" class="empty-items-msg">Sin ítems — presione "Agregar ítem" o F4</td>';
        tbody.appendChild(empty);
        return;
      }

      items.forEach(function(row, idx) {
        var sub = row.cantidad * row.precio * (1 - row.descuento / 100);
        var ivaOpts = [21, 10.5, 0].map(function(v) {
          var label = v === 0 ? "Exento" : v + "%";
          var sel = row.iva === v ? " selected" : "";
          return '<option value="' + v + '"' + sel + '>' + label + '</option>';
        }).join("");

        var tr = document.createElement("tr");
        tr.innerHTML =
          '<td class="td-num">' + (idx + 1) + '</td>' +
          '<td><div class="code-wrap">' +
            '<input class="cell-input" data-id="' + row.id + '" data-field="codigo" value="' + esc(row.codigo) + '" />' +
            '<button class="picker-btn" data-rowid="' + row.id + '" title="Buscar artículo (F4)">+</button>' +
          '</div></td>' +
          '<td><input class="cell-input" data-id="' + row.id + '" data-field="descripcion" value="' + esc(row.descripcion) + '" /></td>' +
          '<td><input class="cell-input" data-id="' + row.id + '" data-field="unidad" value="' + esc(row.unidad) + '" /></td>' +
          '<td><input class="cell-input right" type="number" min="0" step="1" data-id="' + row.id + '" data-field="cantidad" value="' + row.cantidad + '" /></td>' +
          '<td><input class="cell-input right" type="number" min="0" step="0.01" data-id="' + row.id + '" data-field="costo" value="' + row.costo + '" /></td>' +
          '<td><input class="cell-input right" type="number" min="0" max="999" step="0.1" data-id="' + row.id + '" data-field="margen" value="' + row.margen + '" /></td>' +
          '<td><input class="cell-input right" type="number" min="0" step="0.01" data-id="' + row.id + '" data-field="precio" value="' + fmtDec(row.precio) + '" /></td>' +
          '<td><input class="cell-input right" type="number" min="0" max="100" step="0.1" data-id="' + row.id + '" data-field="descuento" value="' + row.descuento + '" /></td>' +
          '<td><select class="cell-select" data-id="' + row.id + '" data-field="iva">' + ivaOpts + '</select></td>' +
          '<td class="td-sub">$ ' + fmtNum(sub) + '</td>' +
          '<td style="text-align:center;"><button class="del-row-btn" data-rowid="' + row.id + '" title="Eliminar">×</button></td>';
        tbody.appendChild(tr);
      });

      tbody.querySelectorAll(".cell-input").forEach(function(inp) {
        inp.addEventListener("change", onCellChange);
        inp.addEventListener("keydown", onCellKeydown);
      });
      tbody.querySelectorAll(".cell-select").forEach(function(sel) {
        sel.addEventListener("change", onCellChange);
      });
      tbody.querySelectorAll(".picker-btn").forEach(function(btn) {
        btn.addEventListener("click", function() { openPickerForRow(parseInt(btn.dataset.rowid)); });
      });
      tbody.querySelectorAll(".del-row-btn").forEach(function(btn) {
        btn.addEventListener("click", function() { removeRow(parseInt(btn.dataset.rowid)); });
      });
    }

    function onCellChange(e) {
      var el = e.target;
      var rowId = parseInt(el.dataset.id);
      var field = el.dataset.field;
      var row = items.find(function(r) { return r.id === rowId; });
      if (!row) return;
      if (field === "cantidad" || field === "precio" || field === "descuento" || field === "iva" || field === "costo" || field === "margen") {
        row[field] = parseFloat(el.value) || 0;
      } else {
        row[field] = el.value;
      }
      if (field === "costo" || field === "margen") {
        row.precio = row.costo * (1 + row.margen / 100);
        var precioInput = el.closest("tr").querySelector('[data-field="precio"]');
        if (precioInput) precioInput.value = fmtDec(row.precio);
      }
      if (field === "precio" && row.costo > 0) {
        row.margen = ((row.precio / row.costo) - 1) * 100;
        var margenInput = el.closest("tr").querySelector('[data-field="margen"]');
        if (margenInput) margenInput.value = fmtDec(row.margen);
      }
      var sub = row.cantidad * row.precio * (1 - row.descuento / 100);
      var tr = el.closest("tr");
      var cell = tr ? tr.querySelector(".td-sub") : null;
      if (cell) cell.textContent = "$ " + fmtNum(sub);
      recalcTotals();
      updateCuotaImporte();
    }

    function onCellKeydown(e) {
      var rowId = parseInt(e.target.dataset.id);
      if (e.key === "F4" || e.key === "+") { e.preventDefault(); openPickerForRow(rowId); }
    }

    function openPickerForRow(rowId) {
      if (window.asimovNewInvoice) window.asimovNewInvoice.openProductSelection(String(rowId));
    }

    function recalcTotals() {
      var neto21 = items.filter(function(r) { return r.iva === 21; })
                        .reduce(function(s, r) { return s + r.cantidad * r.precio * (1 - r.descuento / 100); }, 0);
      var neto10 = items.filter(function(r) { return r.iva === 10.5; })
                        .reduce(function(s, r) { return s + r.cantidad * r.precio * (1 - r.descuento / 100); }, 0);
      var neto0  = items.filter(function(r) { return r.iva === 0; })
                        .reduce(function(s, r) { return s + r.cantidad * r.precio * (1 - r.descuento / 100); }, 0);
      var iva21 = neto21 * 0.21;
      var iva10 = neto10 * 0.105;
      var total = neto21 + neto10 + neto0 + iva21 + iva10;
      window._totals = { neto21: neto21, neto10: neto10, neto0: neto0, iva21: iva21, iva10: iva10, total: total, count: items.length };
      document.getElementById("txtNetoACobrar").value = "$ " + fmtNum(total);
    }

    function updateCuotaImporte() {
      var t = window._totals || {};
      var cuotas = parseInt(document.getElementById("selCuotas").value) || 1;
      var por = (t.total || 0) / cuotas;
      document.getElementById("txtImporteCuota").value = "$ " + fmtNum(por);
    }

    document.getElementById("selCuotas").addEventListener("change", updateCuotaImporte);

    function updateTotalsTab() {
      var t = window._totals || { neto21: 0, neto10: 0, neto0: 0, iva21: 0, iva10: 0, total: 0, count: 0 };
      document.getElementById("sumNeto21").textContent = "$ " + fmtNum(t.neto21);
      document.getElementById("sumNeto10").textContent = "$ " + fmtNum(t.neto10);
      document.getElementById("sumNeto0").textContent = "$ " + fmtNum(t.neto0);
      document.getElementById("sumNeto").textContent = "$ " + fmtNum(t.neto21 + t.neto10 + t.neto0);
      document.getElementById("sumIva21").textContent = "$ " + fmtNum(t.iva21);
      document.getElementById("sumIva10").textContent = "$ " + fmtNum(t.iva10);
      document.getElementById("sumIIBB").textContent = "$ 0,00";
      document.getElementById("sumTotal").textContent = "$ " + fmtNum(t.total);
      document.getElementById("infTipo").textContent = tipoLabel(tipoActual);
      document.getElementById("infPtoVta").textContent = document.getElementById("txtPtoVta").value;
      document.getElementById("infNro").textContent = document.getElementById("txtNroFact").value;
      document.getElementById("infFecha").textContent = document.getElementById("txtFecha").value || "—";
      document.getElementById("infCond").textContent = document.getElementById("selCondVenta").value;
    }

    function esc(str) {
      return String(str).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
    function fmtNum(n) {
      return isNaN(n) ? "0,00" : Number(n).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function fmtDec(n) {
      return isNaN(n) ? "0" : parseFloat(Number(n).toFixed(2));
    }

    /* ─── Keyboard & toolbar ─── */
    document.getElementById("btnAddRow").addEventListener("click", function() { addRow(); });
    window.addEventListener("keydown", function(e) {
      if (e.key === "F8") { e.preventDefault(); document.getElementById("btnSave").click(); }
      if (e.key === "Insert") { e.preventDefault(); addRow(); }
    });

    /* ─── Footer buttons ─── */
    /* btnNew removed in new theme */

    document.getElementById("btnSave").addEventListener("click", function() {
      if (!document.getElementById("txtClienteNombre").value.trim()) {
        alert("Seleccione un cliente antes de guardar.");
        document.querySelectorAll(".tab").forEach(function(t) { if (t.dataset.tab === "comprobante") t.click(); });
        document.getElementById("txtClienteNombre").focus();
        return;
      }
      if (items.length === 0) {
        alert("Agregue al menos un ítem a la factura.");
        document.querySelectorAll(".tab").forEach(function(t) { if (t.dataset.tab === "items") t.click(); });
        return;
      }
      recalcTotals();
      var invoice = {
        tipo: tipoActual,
        ptoVta: document.getElementById("txtPtoVta").value,
        nroFact: document.getElementById("txtNroFact").value,
        fecha: document.getElementById("txtFecha").value,
        cliente: clienteData,
        clienteNombre: document.getElementById("txtClienteNombre").value,
        condVenta: document.getElementById("selCondVenta").value,
        items: items,
        totales: window._totals || {},
        observaciones: document.getElementById("txtObsCliente").value,
      };
      if (window.asimovNewInvoice) window.asimovNewInvoice.saveInvoice(invoice);
    });

    var closeHandler = function() {
      if (window.asimovNewInvoice) window.asimovNewInvoice.cancel();
    };
    document.getElementById("btnExit").addEventListener("click", closeHandler);
    document.getElementById("btnClose").addEventListener("click", closeHandler);

    recalcTotals();
    renderItemsTable();
