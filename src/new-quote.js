
    /* ─── Estado ─── */
    let items = [];
    let nextRowId = 1;
    let clienteData = null;

    /* ─── Init ─── */
    (function init() {
      var now = new Date();
      var yr = String(now.getFullYear()).slice(2);
      var mo = String(now.getMonth() + 1).padStart(2, "0");
      var nr = "COT-" + yr + mo + "-" + String(Math.floor(10000 + Math.random() * 90000));
      document.getElementById("txtNroCot").value = nr;
      document.getElementById("lblNroCot").textContent = "#" + nr;
      document.getElementById("txtFecha").value = now.toISOString().slice(0, 10);
      var future = new Date(now);
      future.setDate(future.getDate() + 30);
      document.getElementById("txtValidoHasta").value = future.toISOString().slice(0, 10);
      updateValidezBanner();

      var followUp = new Date(now);
      followUp.setDate(followUp.getDate() + 7);
      document.getElementById("txtFechaSeguimiento").value = followUp.toISOString().slice(0, 10);
    })();

    function updateValidezBanner() {
      var desde = document.getElementById("txtFecha").value;
      var hasta = document.getElementById("txtValidoHasta").value;
      if (!desde || !hasta) { document.getElementById("lblValidezDias").textContent = "—"; return; }
      var d1 = new Date(desde), d2 = new Date(hasta);
      var dias = Math.round((d2 - d1) / 86400000);
      document.getElementById("lblValidezDias").textContent = dias > 0
        ? dias + " días (" + hasta + ")"
        : "Fecha inválida";
    }

    document.getElementById("txtFecha").addEventListener("change", updateValidezBanner);
    document.getElementById("txtValidoHasta").addEventListener("change", updateValidezBanner);

    /* ─── Tabs ─── */
    document.querySelectorAll(".tab").forEach(function(tab) {
      tab.addEventListener("click", function() {
        document.querySelectorAll(".tab").forEach(function(t) { t.classList.remove("active"); });
        document.querySelectorAll(".tab-panel").forEach(function(p) { p.classList.remove("active"); });
        tab.classList.add("active");
        var panel = document.getElementById("panel-" + tab.dataset.tab);
        panel.classList.add("active");
        if (tab.dataset.tab === "totales") updateTotalsTab();
      });
    });

    /* ─── Client picker ─── */
    document.getElementById("btnBuscarCliente").addEventListener("click", openClientPicker);
    document.getElementById("txtClienteNombre").addEventListener("keydown", function(e) {
      if (e.key === "F4") { e.preventDefault(); openClientPicker(); }
    });

    function openClientPicker() {
      if (window.asimovNewQuote) window.asimovNewQuote.openClientSelection();
    }

    if (window.asimovNewQuote) {
      window.asimovNewQuote.onClientSelected(function(data) {
        if (data.contextId !== "cot-cliente" || !data.client) return;
        clienteData = data.client;
        document.getElementById("txtClienteCodigo").value = data.client.codigo || data.client.id || "";
        document.getElementById("txtClienteNombre").value = data.client.razonSocial || data.client.name || "";
        document.getElementById("txtClienteCuit").value = data.client.cuit || "";
        document.getElementById("txtClienteIva").value = data.client.condicionIva || "Responsable Inscripto";
        document.getElementById("txtEmail").value = data.client.email || "";
      });

      window.asimovNewQuote.onProductSelected(function(data) {
        if (!data.product) return;
        var row = items.find(function(r) { return String(r.id) === String(data.rowId); });
        if (!row) return;
        row.codigo = data.product.codigo || data.product.code || "";
        row.descripcion = data.product.descripcion || data.product.description || data.product.name || "";
        row.unidad = data.product.unidad || "UN";
        row.precio = parseFloat(data.product.importe || data.product.price || "0") || 0;
        row.cantidad = 1;
        row.iva = parseFloat(data.product.iva || "21") || 21;
        renderItemsTable();
        recalcTotals();
        setTimeout(function() {
          var qtyInput = document.querySelector('[data-id="' + data.rowId + '"][data-field="cantidad"]');
          if (qtyInput) { qtyInput.focus(); qtyInput.select(); }
        }, 50);
      });
    }

    /* ─── Items table ─── */
    function addRow(prefill) {
      prefill = prefill || {};
      var rowId = nextRowId++;
      items.push({ id: rowId, codigo: "", descripcion: "", unidad: "UN", cantidad: 1, precio: 0, descuento: 0, iva: 21 });
      var row = items[items.length - 1];
      Object.keys(prefill).forEach(function(k) { row[k] = prefill[k]; });
      renderItemsTable();
      recalcTotals();
      setTimeout(function() {
        var inp = document.querySelector('[data-id="' + rowId + '"][data-field="codigo"]');
        if (inp) inp.focus();
      }, 30);
    }

    function removeRow(rowId) {
      items = items.filter(function(r) { return r.id !== rowId; });
      renderItemsTable();
      recalcTotals();
    }

    function renderItemsTable() {
      var tbody = document.getElementById("itemsBody");
      var count = items.length;
      document.getElementById("lblItemCount").textContent = count + (count === 1 ? " ítem" : " ítems");

      tbody.innerHTML = "";
      if (count === 0) {
        var empty = document.createElement("tr");
        empty.innerHTML = '<td colspan="9" class="empty-items-msg">Sin ítems — presione "Agregar ítem" o F4 para agregar artículos</td>';
        tbody.appendChild(empty);
        return;
      }

      items.forEach(function(row, idx) {
        var sub = row.cantidad * row.precio * (1 - row.descuento / 100);
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
          '<td><input class="cell-input right" type="number" min="0" step="0.01" data-id="' + row.id + '" data-field="precio" value="' + row.precio + '" /></td>' +
          '<td><input class="cell-input right" type="number" min="0" max="100" step="0.1" data-id="' + row.id + '" data-field="descuento" value="' + row.descuento + '" /></td>' +
          '<td class="td-sub">$ ' + fmtNum(sub) + '</td>' +
          '<td style="text-align:center;"><button class="del-row-btn" data-rowid="' + row.id + '" title="Eliminar fila">×</button></td>';
        tbody.appendChild(tr);
      });

      tbody.querySelectorAll(".cell-input").forEach(function(input) {
        input.addEventListener("change", onCellChange);
        input.addEventListener("keydown", onCellKeydown);
      });
      tbody.querySelectorAll(".picker-btn").forEach(function(btn) {
        btn.addEventListener("click", function() { openPickerForRow(parseInt(btn.dataset.rowid)); });
      });
      tbody.querySelectorAll(".del-row-btn").forEach(function(btn) {
        btn.addEventListener("click", function() { removeRow(parseInt(btn.dataset.rowid)); });
      });
    }

    function onCellChange(e) {
      var input = e.target;
      var rowId = parseInt(input.dataset.id);
      var field = input.dataset.field;
      var row = items.find(function(r) { return r.id === rowId; });
      if (!row) return;
      if (field === "cantidad" || field === "precio" || field === "descuento") {
        row[field] = parseFloat(input.value) || 0;
      } else {
        row[field] = input.value;
      }
      var sub = row.cantidad * row.precio * (1 - row.descuento / 100);
      var tr = input.closest("tr");
      var cell = tr ? tr.querySelector(".td-sub") : null;
      if (cell) cell.textContent = "$ " + fmtNum(sub);
      recalcTotals();
    }

    function onCellKeydown(e) {
      var rowId = parseInt(e.target.dataset.id);
      if (e.key === "F4" || e.key === "+") { e.preventDefault(); openPickerForRow(rowId); }
    }

    function openPickerForRow(rowId) {
      if (window.asimovNewQuote) window.asimovNewQuote.openProductSelection(String(rowId));
    }

    function recalcTotals() {
      var bruto = items.reduce(function(s, r) { return s + r.cantidad * r.precio; }, 0);
      var neto  = items.reduce(function(s, r) { return s + r.cantidad * r.precio * (1 - r.descuento / 100); }, 0);
      var iva21 = items.filter(function(r) { return r.iva === 21; })
                       .reduce(function(s, r) { return s + r.cantidad * r.precio * (1 - r.descuento / 100) * 0.21; }, 0);
      var iva10 = items.filter(function(r) { return r.iva === 10.5; })
                       .reduce(function(s, r) { return s + r.cantidad * r.precio * (1 - r.descuento / 100) * 0.105; }, 0);
      window._totals = { bruto: bruto, neto: neto, desc: bruto - neto, iva21: iva21, iva10: iva10, total: neto + iva21 + iva10, count: items.length };
    }

    function updateTotalsTab() {
      var t = window._totals || { bruto: 0, neto: 0, desc: 0, iva21: 0, iva10: 0, total: 0, count: 0 };
      document.getElementById("sumItems").textContent = t.count;
      document.getElementById("sumBruto").textContent = "$ " + fmtNum(t.bruto);
      document.getElementById("sumDesc").textContent = "− $ " + fmtNum(t.desc);
      document.getElementById("sumNeto").textContent = "$ " + fmtNum(t.neto);
      document.getElementById("sumIva21").textContent = "$ " + fmtNum(t.iva21);
      document.getElementById("sumIva10").textContent = "$ " + fmtNum(t.iva10);
      document.getElementById("sumTotal").textContent = "$ " + fmtNum(t.total);
      document.getElementById("infEstado").textContent = document.getElementById("selEstado")?.value || "—";
      document.getElementById("infValidez").textContent = document.getElementById("txtValidoHasta")?.value || "—";
      document.getElementById("infMoneda").textContent = (document.getElementById("selMoneda")?.value || "ARS").split(" ")[0];
      document.getElementById("infLista").textContent = document.getElementById("selListaPrecios")?.value || "—";
      document.getElementById("infVendedor").textContent = document.getElementById("txtVendedor")?.value || "—";
    }

    function esc(str) {
      return String(str).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
    function fmtNum(n) {
      return isNaN(n) ? "0,00" : Number(n).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    /* ─── Keyboard & toolbar ─── */
    document.getElementById("btnAddRow").addEventListener("click", function() { addRow(); });
    window.addEventListener("keydown", function(e) {
      if (e.key === "F8") { e.preventDefault(); document.getElementById("btnSave").click(); }
      if (e.key === "Insert") { e.preventDefault(); addRow(); }
    });

    /* btnNew removed */

    document.getElementById("btnSave").addEventListener("click", function() {
      if (!document.getElementById("txtClienteNombre").value.trim()) {
        alert("Seleccione un cliente antes de guardar.");
        document.querySelectorAll(".tab").forEach(function(t) { if (t.dataset.tab === "encabezado") t.click(); });
        document.getElementById("txtClienteNombre").focus();
        return;
      }
      if (items.length === 0) {
        alert("Agregue al menos un ítem a la cotización.");
        document.querySelectorAll(".tab").forEach(function(t) { if (t.dataset.tab === "items") t.click(); });
        return;
      }
      recalcTotals();
      var quote = {
        nroCot: document.getElementById("txtNroCot").value,
        fecha: document.getElementById("txtFecha").value,
        validoHasta: document.getElementById("txtValidoHasta").value,
        tipo: document.getElementById("selTipo").value,
        cliente: clienteData,
        clienteNombre: document.getElementById("txtClienteNombre").value,
        contacto: document.getElementById("txtContacto").value,
        email: document.getElementById("txtEmail").value,
        condPago: document.getElementById("selCondPago").value,
        listaPrecios: document.getElementById("selListaPrecios").value,
        moneda: document.getElementById("selMoneda").value,
        estado: document.getElementById("selEstado").value,
        items: items,
        totales: window._totals || {},
        observaciones: document.getElementById("txtObsCliente").value,
      };
      if (window.asimovNewQuote) window.asimovNewQuote.saveQuote(quote);
    });

    var closeHandler = function() {
      if (window.asimovNewQuote) window.asimovNewQuote.cancel();
    };
    document.getElementById("btnExit").addEventListener("click", closeHandler);
    document.getElementById("btnClose").addEventListener("click", closeHandler);

    recalcTotals();
    renderItemsTable();
