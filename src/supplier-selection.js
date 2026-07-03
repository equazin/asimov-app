    let suppliers = [];
    let filteredSuppliers = [];
    let selectedIndex = 0;
    let contextId = "";

    const txtSearch = document.getElementById("txtSearch");
    const tableBody = document.getElementById("supplierTableBody");
    const lblRecordCount = document.getElementById("lblRecordCount");
    const btnSelect = document.getElementById("btnSelect");
    const btnNew = document.getElementById("btnNew");
    const btnExit = document.getElementById("btnExit");

    if (window.asimovSupplierSelection) {
      window.asimovSupplierSelection.onInit((data) => {
        contextId = (data && data.contextId) || "";
      });
      window.asimovSupplierSelection.onSuppliersLoaded((loaded) => {
        suppliers = loaded || [];
        filterAndRender();
      });
    }

    function escapeHtml(str) {
      const d = document.createElement("div");
      d.textContent = str == null ? "" : String(str);
      return d.innerHTML;
    }

    function renderTable() {
      tableBody.innerHTML = "";
      if (filteredSuppliers.length === 0) {
        const tr = document.createElement("tr");
        tr.innerHTML = '<td colspan="5" class="empty-msg">No se encontraron proveedores.</td>';
        tableBody.appendChild(tr);
        lblRecordCount.textContent = "0 / 0";
        return;
      }

      filteredSuppliers.forEach((sup, index) => {
        const tr = document.createElement("tr");
        if (index === selectedIndex) tr.className = "selected";
        tr.innerHTML =
          '<td class="col-code">' + escapeHtml(sup.codigo || sup.id || "") + '</td>' +
          '<td class="col-name">' + escapeHtml(sup.razonSocial || sup.name || "") + '</td>' +
          '<td class="col-address">' + escapeHtml(sup.domicilio || sup.address || "") + '</td>' +
          '<td class="col-phone">' + escapeHtml(sup.telefono || sup.phone || "") + '</td>' +
          '<td class="col-cuit">' + escapeHtml(sup.cuit || "") + '</td>';
        tr.addEventListener("click", () => selectIndex(index));
        tr.addEventListener("dblclick", () => submitSelection());
        tableBody.appendChild(tr);
      });

      lblRecordCount.textContent = (selectedIndex + 1) + " / " + filteredSuppliers.length;
      const selectedRow = tableBody.querySelector(".selected");
      if (selectedRow) selectedRow.scrollIntoView({ block: "nearest" });
    }

    function selectIndex(index) {
      if (index >= 0 && index < filteredSuppliers.length) {
        selectedIndex = index;
        renderTable();
      }
    }

    function filterAndRender() {
      const term = txtSearch.value.toUpperCase();
      filteredSuppliers = suppliers.filter(function (sup) {
        const name = (sup.razonSocial || sup.name || "").toUpperCase();
        const code = String(sup.codigo || sup.id || "").toUpperCase();
        const addr = (sup.domicilio || sup.address || "").toUpperCase();
        const phone = (sup.telefono || sup.phone || "").toUpperCase();
        const cuit = (sup.cuit || "").toUpperCase();
        return name.includes(term) || code.includes(term) || addr.includes(term) || phone.includes(term) || cuit.includes(term);
      });
      selectedIndex = 0;
      renderTable();
    }

    function submitSelection() {
      const selected = filteredSuppliers[selectedIndex];
      if (selected && window.asimovSupplierSelection) {
        window.asimovSupplierSelection.selectSupplier(selected, contextId);
      }
    }

    txtSearch.addEventListener("input", filterAndRender);

    window.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); selectIndex(selectedIndex + 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); selectIndex(selectedIndex - 1); }
      else if (e.key === "Enter") { e.preventDefault(); submitSelection(); }
      else if (e.key === "Escape") {
        e.preventDefault();
        if (window.asimovSupplierSelection) window.asimovSupplierSelection.selectSupplier(null, contextId);
      }
    });

    btnSelect.addEventListener("click", submitSelection);
    btnNew.addEventListener("click", function () {
      if (window.asimovSupplierSelection) window.asimovSupplierSelection.openNewSupplier();
    });
    const closeHandler = function () {
      if (window.asimovSupplierSelection) window.asimovSupplierSelection.selectSupplier(null, contextId);
    };
    btnExit.addEventListener("click", closeHandler);

    filterAndRender();
