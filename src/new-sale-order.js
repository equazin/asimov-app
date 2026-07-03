
    /* ─── Estado ─── */
    let items = [];
    let nextRowId = 1;
    let clienteData = null;

    /* ─── Init ─── */
    (function init() {
      const now = new Date();
      const yr = String(now.getFullYear()).slice(2);
      const mo = String(now.getMonth() + 1).padStart(2, "0");
      const nr = "PV-" + yr + mo + "-" + String(Math.floor(10000 + Math.random() * 90000));
      document.getElementById("txtNroPedido").value = nr;
      document.getElementById("lblNroPedido").textContent = "#" + nr;
      document.getElementById("txtFecha").value = now.toISOString().slice(0, 10);
      document.getElementById("txtHora").value = now.toTimeString().slice(0, 5);
      const future = new Date(now);
      future.setDate(future.getDate() + 30);
      document.getElementById("txtValidoHasta").value = future.toISOString().slice(0, 10);
    })();

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
      if (window.asimovNewSaleOrder) window.asimovNewSaleOrder.openClientSelection();
    }

    if (window.asimovNewSaleOrder) {
      window.asimovNewSaleOrder.onClientSelected(function(data) {
        var client = data.client;
        var contextId = data.contextId;
        if (contextId !== "pedido-cliente" || !client) return;
        clienteData = client;
        document.getElementById("txtClienteCodigo").value = client.codigo || client.id || "";
        document.getElementById("txtClienteNombre").value = client.razonSocial || client.name || "";
        document.getElementById("txtClienteCuit").value = client.cuit || "";
        document.getElementById("txtClienteIva").value = client.condicionIva || "Responsable Inscripto";
      });

      window.asimovNewSaleOrder.onProductSelected(function(data) {
        var product = data.product;
        var rowId = data.rowId;
        if (!product) return;
        var row = items.find(function(r) { return String(r.id) === String(rowId); });
        if (!row) return;
        row.codigo = product.codigo || product.code || "";
        row.descripcion = product.descripcion || product.description || product.name || "";
        row.unidad = product.unidad || "UN";
        var costo = parseFloat(product.importe || product.price || "0") || 0;
        row.costo = costo;
        var margenGral = parseFloat(document.getElementById("txtMargenGral").value) || 0;
        row.margen = margenGral;
        row.precio = costo * (1 + margenGral / 100);
        row.cantidad = 1;
        row.iva = parseFloat(product.iva || "21") || 21;
        renderItemsTable();
        recalcTotals();
        setTimeout(function() {
          var qtyInput = document.querySelector('[data-id="' + rowId + '"][data-field="cantidad"]');
          if (qtyInput) { qtyInput.focus(); qtyInput.select(); }
        }, 50);
      });
    }

    /* ─── Items table ─── */
    function addRow(prefill) {
      prefill = prefill || {};
      var rowId = nextRowId++;
      var margenGral = parseFloat(document.getElementById("txtMargenGral").value) || 0;
      items.push({ id: rowId, codigo: "", descripcion: "", unidad: "UN", cantidad: 1, costo: 0, margen: margenGral, precio: 0, descuento: 0, iva: 21 });
      var row = items[items.length - 1];
      Object.keys(prefill).forEach(function(k) { row[k] = prefill[k]; });
      renderItemsTable();
      recalcTotals();
      setTimeout(function() {
        var codeInput = document.querySelector('[data-id="' + rowId + '"][data-field="codigo"]');
        if (codeInput) codeInput.focus();
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
        empty.innerHTML = '<td colspan="11" class="empty-items-msg">Sin ítems — presione "Agregar ítem" o F4 para agregar artículos</td>';
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
          '<td><input class="cell-input right" type="number" min="0" step="0.01" data-id="' + row.id + '" data-field="costo" value="' + row.costo + '" /></td>' +
          '<td><input class="cell-input right" type="number" min="0" max="999" step="0.1" data-id="' + row.id + '" data-field="margen" value="' + row.margen + '" /></td>' +
          '<td><input class="cell-input right" type="number" min="0" step="0.01" data-id="' + row.id + '" data-field="precio" value="' + fmtDec(row.precio) + '" /></td>' +
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
      if (field === "cantidad" || field === "precio" || field === "descuento" || field === "costo" || field === "margen") {
        row[field] = parseFloat(input.value) || 0;
      } else {
        row[field] = input.value;
      }
      if (field === "costo" || field === "margen") {
        row.precio = row.costo * (1 + row.margen / 100);
        var precioInput = input.closest("tr").querySelector('[data-field="precio"]');
        if (precioInput) precioInput.value = fmtDec(row.precio);
      }
      if (field === "precio" && row.costo > 0) {
        row.margen = ((row.precio / row.costo) - 1) * 100;
        var margenInput = input.closest("tr").querySelector('[data-field="margen"]');
        if (margenInput) margenInput.value = fmtDec(row.margen);
      }
      var sub = row.cantidad * row.precio * (1 - row.descuento / 100);
      var tr = input.closest("tr");
      var cell = tr ? tr.querySelector(".td-sub") : null;
      if (cell) cell.textContent = "$ " + fmtNum(sub);
      recalcTotals();
    }

    function onCellKeydown(e) {
      var rowId = parseInt(e.target.dataset.id);
      if (e.key === "F4" || e.key === "+") {
        e.preventDefault();
        openPickerForRow(rowId);
      }
    }

    function openPickerForRow(rowId) {
      if (window.asimovNewSaleOrder) {
        window.asimovNewSaleOrder.openProductSelection(String(rowId));
      }
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
      var cond = document.getElementById("selCondVenta");
      var lista = document.getElementById("selListaPrecios");
      var moneda = document.getElementById("selMoneda");
      var estado = document.getElementById("selEstado");
      var entrega = document.getElementById("txtFechaEntrega");
      document.getElementById("infCondVenta").textContent = cond ? cond.value : "—";
      document.getElementById("infLista").textContent = lista ? lista.value : "—";
      document.getElementById("infMoneda").textContent = moneda ? moneda.value.split(" ")[0] : "ARS";
      document.getElementById("infEstado").textContent = estado ? estado.value : "—";
      document.getElementById("infEntrega").textContent = (entrega && entrega.value) ? entrega.value : "—";
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

    /* ─── Toolbar & keyboard ─── */
    document.getElementById("btnAddRow").addEventListener("click", function() { addRow(); });
    window.addEventListener("keydown", function(e) {
      if (e.key === "F8") { e.preventDefault(); document.getElementById("btnSave").click(); }
      if (e.key === "Insert") { e.preventDefault(); addRow(); }
    });

    /* ─── Footer buttons ─── */

    document.getElementById("btnSave").addEventListener("click", function() {
      if (!document.getElementById("txtClienteNombre").value.trim()) {
        alert("Seleccione un cliente antes de guardar.");
        document.querySelectorAll(".tab").forEach(function(t) { if (t.dataset.tab === "encabezado") t.click(); });
        document.getElementById("txtClienteNombre").focus();
        return;
      }
      if (items.length === 0) {
        alert("Agregue al menos un ítem al pedido.");
        document.querySelectorAll(".tab").forEach(function(t) { if (t.dataset.tab === "items") t.click(); });
        return;
      }
      recalcTotals();
      var order = {
        nroPedido: document.getElementById("txtNroPedido").value,
        fecha: document.getElementById("txtFecha").value,
        hora: document.getElementById("txtHora").value,
        tipo: document.getElementById("selTipo").value,
        cliente: clienteData,
        clienteNombre: document.getElementById("txtClienteNombre").value,
        clienteCodigo: document.getElementById("txtClienteCodigo").value,
        condVenta: document.getElementById("selCondVenta").value,
        listaPrecios: document.getElementById("selListaPrecios").value,
        moneda: document.getElementById("selMoneda").value,
        items: items,
        totales: window._totals || {},
        observaciones: document.getElementById("txtObsCliente").value,
      };
      if (window.asimovNewSaleOrder) window.asimovNewSaleOrder.saveSaleOrder(order);
    });

    var closeHandler = function() {
      if (window.asimovNewSaleOrder) window.asimovNewSaleOrder.cancel();
    };
    document.getElementById("btnExit").addEventListener("click", closeHandler);
    var closeBtn = document.getElementById("btnClose");
    if (closeBtn) closeBtn.addEventListener("click", closeHandler);

    recalcTotals();
    renderItemsTable();
