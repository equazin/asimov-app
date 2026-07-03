    let clients = [];
    let filteredClients = [];
    let selectedIndex = 0;
    let contextId = "";

    const txtSearch = document.getElementById("txtSearch");
    const tableBody = document.getElementById("clientTableBody");
    const lblRecordCount = document.getElementById("lblRecordCount");
    const btnSelect = document.getElementById("btnSelect");
    const btnNew = document.getElementById("btnNew");
    const btnExit = document.getElementById("btnExit");

    if (window.asimovClientSelection) {
      window.asimovClientSelection.onInit((data) => {
        contextId = (data && data.contextId) || "";
      });
      window.asimovClientSelection.onClientsLoaded((loaded) => {
        clients = loaded || [];
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
      if (filteredClients.length === 0) {
        const tr = document.createElement("tr");
        tr.innerHTML = '<td colspan="5" class="empty-msg">No se encontraron clientes.</td>';
        tableBody.appendChild(tr);
        lblRecordCount.textContent = "0 / 0";
        return;
      }

      filteredClients.forEach((cli, index) => {
        const tr = document.createElement("tr");
        if (index === selectedIndex) tr.className = "selected";
        tr.innerHTML =
          '<td class="col-code">' + escapeHtml(cli.codigo || cli.id || "") + '</td>' +
          '<td class="col-name">' + escapeHtml(cli.razonSocial || cli.name || "") + '</td>' +
          '<td class="col-address">' + escapeHtml(cli.domicilio || cli.address || "") + '</td>' +
          '<td class="col-phone">' + escapeHtml(cli.telefono || cli.phone || "") + '</td>' +
          '<td class="col-cuit">' + escapeHtml(cli.cuit || "") + '</td>';
        tr.addEventListener("click", () => selectIndex(index));
        tr.addEventListener("dblclick", () => submitSelection());
        tableBody.appendChild(tr);
      });

      lblRecordCount.textContent = (selectedIndex + 1) + " / " + filteredClients.length;
      const selectedRow = tableBody.querySelector(".selected");
      if (selectedRow) selectedRow.scrollIntoView({ block: "nearest" });
    }

    function selectIndex(index) {
      if (index >= 0 && index < filteredClients.length) {
        selectedIndex = index;
        renderTable();
      }
    }

    function filterAndRender() {
      const term = txtSearch.value.toUpperCase();
      filteredClients = clients.filter(function (cli) {
        const name = (cli.razonSocial || cli.name || "").toUpperCase();
        const code = String(cli.codigo || cli.id || "").toUpperCase();
        const addr = (cli.domicilio || cli.address || "").toUpperCase();
        const phone = (cli.telefono || cli.phone || "").toUpperCase();
        const cuit = (cli.cuit || "").toUpperCase();
        return name.includes(term) || code.includes(term) || addr.includes(term) || phone.includes(term) || cuit.includes(term);
      });
      selectedIndex = 0;
      renderTable();
    }

    function submitSelection() {
      const selected = filteredClients[selectedIndex];
      if (selected && window.asimovClientSelection) {
        window.asimovClientSelection.selectClient(selected, contextId);
      }
    }

    txtSearch.addEventListener("input", filterAndRender);

    window.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); selectIndex(selectedIndex + 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); selectIndex(selectedIndex - 1); }
      else if (e.key === "Enter") { e.preventDefault(); submitSelection(); }
      else if (e.key === "Escape") {
        e.preventDefault();
        if (window.asimovClientSelection) window.asimovClientSelection.selectClient(null, contextId);
      }
    });

    btnSelect.addEventListener("click", submitSelection);
    btnNew.addEventListener("click", function () {
      if (window.asimovClientSelection) window.asimovClientSelection.openNewClient();
    });
    const closeHandler = function () {
      if (window.asimovClientSelection) window.asimovClientSelection.selectClient(null, contextId);
    };
    btnExit.addEventListener("click", closeHandler);

    filterAndRender();
