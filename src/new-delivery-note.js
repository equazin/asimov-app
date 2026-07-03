
    /* ─── Estado ─── */
    let items = [];
    let nextRowId = 1;
    let clienteData = null;
    let estadoActual = "Pendiente";

    /* ─── Init ─── */
    (function init() {
      var now = new Date();
      var yr = String(now.getFullYear()).slice(2);
      var mo = String(now.getMonth() + 1).padStart(2, "0");
      var nr = "REM-" + yr + mo + "-" + String(Math.floor(10000 + Math.random() * 90000));
      document.getElementById("txtNroRem").value = nr;
      document.getElementById("lblNroCotBadge") && (document.getElementById("lblNroCotBadge").textContent = "#" + nr);
      document.getElementById("lblNroRem").textContent = "#" + nr;
      var today = now.toISOString().slice(0, 10);
      document.getElementById("txtFecha").value = today;
      document.getElementById("txtFechaDespacho").value = today;
      document.getElementById("txtFechaCreacion").value = now.toLocaleDateString("es-AR");

      // Default dispatch time: 09:00
      document.getElementById("txtHoraDespacho").value = "09:00";
    })();

    /* ─── Tabs ─── */
    document.querySelectorAll(".tab").forEach(function(tab) {
      tab.addEventListener("click", function() {
        document.querySelectorAll(".tab").forEach(function(t) { t.classList.remove("active"); });
        document.querySelectorAll(".tab-panel").forEach(function(p) { p.classList.remove("active"); });
        tab.classList.add("active");
        document.getElementById("panel-" + tab.dataset.tab).classList.add("active");
      });
    });

    /* ─── Estado cards ─── */
    document.querySelectorAll(".status-card").forEach(function(card) {
      card.addEventListener("click", function() {
        document.querySelectorAll(".status-card").forEach(function(c) { c.classList.remove("active"); });
        card.classList.add("active");
        estadoActual = card.dataset.status;
        document.getElementById("lblEstadoChip").textContent = estadoActual.toUpperCase();
      });
    });

    /* ─── Client picker ─── */
    document.getElementById("btnBuscarCliente").addEventListener("click", openClientPicker);
    document.getElementById("txtClienteNombre").addEventListener("keydown", function(e) {
      if (e.key === "F4") { e.preventDefault(); openClientPicker(); }
    });

    function openClientPicker() {
      if (window.asimovNewDeliveryNote) window.asimovNewDeliveryNote.openClientSelection();
    }

    if (window.asimovNewDeliveryNote) {
      window.asimovNewDeliveryNote.onClientSelected(function(data) {
        if (data.contextId !== "remito-cliente" || !data.client) return;
        clienteData = data.client;
        document.getElementById("txtClienteCodigo").value = data.client.codigo || data.client.id || "";
        document.getElementById("txtClienteNombre").value = data.client.razonSocial || data.client.name || "";
        document.getElementById("txtClienteCuit").value = data.client.cuit || "";
        document.getElementById("txtDireccion").value = data.client.domicilio || data.client.address || "";
        document.getElementById("txtLocalidad").value = data.client.localidad || data.client.city || "";
        document.getElementById("txtCP").value = data.client.cp || "";
        document.getElementById("txtContacto").value = data.client.contacto || "";
        document.getElementById("txtTelContacto").value = data.client.telefono || data.client.phone || "";
      });

      window.asimovNewDeliveryNote.onProductSelected(function(data) {
        if (!data.product) return;
        var row = items.find(function(r) { return String(r.id) === String(data.rowId); });
        if (!row) return;
        row.codigo = data.product.codigo || data.product.code || "";
        row.descripcion = data.product.descripcion || data.product.description || data.product.name || "";
        row.unidad = data.product.unidad || "UN";
        row.cantPedida = 1;
        row.cantEntregada = 1;
        renderItemsTable();
        setTimeout(function() {
          var inp = document.querySelector('[data-id="' + data.rowId + '"][data-field="cantEntregada"]');
          if (inp) { inp.focus(); inp.select(); }
        }, 50);
      });
    }

    /* ─── Items table ─── */
    function addRow(prefill) {
      prefill = prefill || {};
      var rowId = nextRowId++;
      items.push({ id: rowId, codigo: "", descripcion: "", unidad: "UN", cantPedida: 1, cantEntregada: 1, lote: "" });
      Object.assign(items[items.length - 1], prefill);
      renderItemsTable();
      setTimeout(function() {
        var inp = document.querySelector('[data-id="' + rowId + '"][data-field="codigo"]');
        if (inp) inp.focus();
      }, 30);
    }

    function removeRow(rowId) {
      items = items.filter(function(r) { return r.id !== rowId; });
      renderItemsTable();
    }

    function renderItemsTable() {
      var tbody = document.getElementById("itemsBody");
      var count = items.length;
      document.getElementById("lblItemCount").textContent = count + (count === 1 ? " ítem" : " ítems");
      tbody.innerHTML = "";

      if (count === 0) {
        var empty = document.createElement("tr");
        empty.innerHTML = '<td colspan="9" class="empty-items-msg">Sin ítems — presione "Agregar ítem" o F4</td>';
        tbody.appendChild(empty);
        return;
      }

      items.forEach(function(row, idx) {
        var diff = row.cantEntregada - row.cantPedida;
        var diffClass = diff === 0 ? "ok" : diff < 0 ? "warn" : "err";
        var diffLabel = diff === 0 ? "= Completo" : diff < 0 ? diff + " (parcial)" : "+" + diff + " (exceso)";

        var tr = document.createElement("tr");
        tr.innerHTML =
          '<td class="td-num">' + (idx + 1) + '</td>' +
          '<td><div class="code-wrap">' +
            '<input class="cell-input" data-id="' + row.id + '" data-field="codigo" value="' + esc(row.codigo) + '" />' +
            '<button class="picker-btn" data-rowid="' + row.id + '" title="Buscar artículo (F4)">+</button>' +
          '</div></td>' +
          '<td><input class="cell-input" data-id="' + row.id + '" data-field="descripcion" value="' + esc(row.descripcion) + '" /></td>' +
          '<td><input class="cell-input" data-id="' + row.id + '" data-field="unidad" value="' + esc(row.unidad) + '" /></td>' +
          '<td><input class="cell-input center" type="number" min="0" step="1" data-id="' + row.id + '" data-field="cantPedida" value="' + row.cantPedida + '" /></td>' +
          '<td><input class="cell-input center" type="number" min="0" step="1" data-id="' + row.id + '" data-field="cantEntregada" value="' + row.cantEntregada + '" style="font-weight:700;" /></td>' +
          '<td class="td-diff ' + diffClass + '">' + diffLabel + '</td>' +
          '<td><input class="cell-input" data-id="' + row.id + '" data-field="lote" value="' + esc(row.lote) + '" placeholder="Nro lote / serie..." /></td>' +
          '<td style="text-align:center;"><button class="del-row-btn" data-rowid="' + row.id + '" title="Eliminar">×</button></td>';
        tbody.appendChild(tr);
      });

      tbody.querySelectorAll(".cell-input").forEach(function(inp) {
        inp.addEventListener("change", onCellChange);
        inp.addEventListener("keydown", onCellKeydown);
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
      if (field === "cantPedida" || field === "cantEntregada") {
        row[field] = parseFloat(el.value) || 0;
      } else {
        row[field] = el.value;
      }
      // Re-render just this row's diff cell
      var diff = row.cantEntregada - row.cantPedida;
      var diffClass = diff === 0 ? "ok" : diff < 0 ? "warn" : "err";
      var diffLabel = diff === 0 ? "= Completo" : diff < 0 ? diff + " (parcial)" : "+" + diff + " (exceso)";
      var tr = el.closest("tr");
      var cell = tr ? tr.querySelector(".td-diff") : null;
      if (cell) {
        cell.className = "td-diff " + diffClass;
        cell.textContent = diffLabel;
      }
    }

    function onCellKeydown(e) {
      var rowId = parseInt(e.target.dataset.id);
      if (e.key === "F4" || e.key === "+") { e.preventDefault(); openPickerForRow(rowId); }
    }

    function openPickerForRow(rowId) {
      if (window.asimovNewDeliveryNote) window.asimovNewDeliveryNote.openProductSelection(String(rowId));
    }

    function esc(str) {
      return String(str).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
        alert("Seleccione un destinatario antes de guardar.");
        document.querySelectorAll(".tab").forEach(function(t) { if (t.dataset.tab === "encabezado") t.click(); });
        document.getElementById("txtClienteNombre").focus();
        return;
      }
      if (items.length === 0) {
        alert("Agregue al menos un ítem al remito.");
        document.querySelectorAll(".tab").forEach(function(t) { if (t.dataset.tab === "items") t.click(); });
        return;
      }
      var delivery = {
        nroRem: document.getElementById("txtNroRem").value,
        fecha: document.getElementById("txtFecha").value,
        fechaDespacho: document.getElementById("txtFechaDespacho").value,
        estado: estadoActual,
        cliente: clienteData,
        clienteNombre: document.getElementById("txtClienteNombre").value,
        direccion: document.getElementById("txtDireccion").value,
        items: items,
        observaciones: document.getElementById("txtObsEntrega").value,
      };
      if (window.asimovNewDeliveryNote) window.asimovNewDeliveryNote.saveDeliveryNote(delivery);
    });

    var closeHandler = function() {
      if (window.asimovNewDeliveryNote) window.asimovNewDeliveryNote.cancel();
    };
    document.getElementById("btnExit").addEventListener("click", closeHandler);
    document.getElementById("btnClose").addEventListener("click", closeHandler);

    renderItemsTable();
