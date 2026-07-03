
    let products = [];
    let filteredProducts = [];
    let selectedIndex = 0;
    let currentRowId = "";

    const txtSearch = document.getElementById("txtSearch");
    const tableBody = document.getElementById("productTableBody");
    const lblStockCount = document.getElementById("lblStockCount");
    const lblRecordCount = document.getElementById("lblRecordCount");
    const btnSelect = document.getElementById("btnSelect");
    const btnNew = document.getElementById("btnNew");
    const btnExit = document.getElementById("btnExit");

    if (window.asimovProductSelection) {
      window.asimovProductSelection.onSetRowId((rowId) => {
        currentRowId = rowId;
      });

      window.asimovProductSelection.onNewArticleAdded((article) => {
        if (article) {
          products.unshift(article);
          filterAndRender();
        }
      });

      window.asimovProductSelection.onProductsLoaded((loaded) => {
        if (loaded && loaded.length > 0) {
          products = loaded;
          filterAndRender();
        }
      });
    }

    function escapeHtml(str) {
      const d = document.createElement("div");
      d.textContent = str;
      return d.innerHTML;
    }

    function renderTable() {
      tableBody.innerHTML = "";
      filteredProducts.forEach((prod, index) => {
        const tr = document.createElement("tr");
        if (index === selectedIndex) tr.className = "selected";

        const srcBadge = (prod.source || "local") === "air"
          ? '<span class="badge-air">AIR</span>'
          : '<span class="badge-local">LOCAL</span>';

        tr.innerHTML = `
          <td class="col-code">${escapeHtml(prod.codigo)}</td>
          <td class="col-desc">${escapeHtml(prod.descripcion)}</td>
          <td class="col-price">$ ${parseFloat(prod.importe).toFixed(2)}</td>
          <td class="col-iva">${escapeHtml(prod.iva)}%</td>
          <td class="col-stock">${escapeHtml(prod.st)}</td>
          <td class="col-compro">${escapeHtml(prod.compro)}</td>
          <td class="col-entr">${escapeHtml(prod.entr)}</td>
          <td class="col-line">${escapeHtml(prod.linea)}</td>
          <td class="col-cat">${escapeHtml(prod.categoria)}</td>
          <td style="text-align:center;">${srcBadge}</td>
        `;

        tr.addEventListener("click", () => selectIndex(index));
        tr.addEventListener("dblclick", () => submitSelection());
        tableBody.appendChild(tr);
      });

      if (filteredProducts[selectedIndex]) {
        lblStockCount.textContent = filteredProducts[selectedIndex].st;
        lblRecordCount.textContent = `${selectedIndex + 1} / ${filteredProducts.length}`;
      } else {
        lblStockCount.textContent = "0";
        lblRecordCount.textContent = `0 / ${filteredProducts.length}`;
      }

      const selectedRow = tableBody.querySelector(".selected");
      if (selectedRow) selectedRow.scrollIntoView({ block: "nearest" });
    }

    function selectIndex(index) {
      if (index >= 0 && index < filteredProducts.length) {
        selectedIndex = index;
        renderTable();
      }
    }

    function filterAndRender() {
      const term = txtSearch.value.toUpperCase();
      filteredProducts = products.filter(prod =>
        prod.codigo.toUpperCase().includes(term) ||
        prod.descripcion.toUpperCase().includes(term) ||
        prod.linea.toUpperCase().includes(term) ||
        prod.categoria.toUpperCase().includes(term)
      );
      selectedIndex = 0;
      renderTable();
    }

    function submitSelection() {
      const selected = filteredProducts[selectedIndex];
      if (selected && window.asimovProductSelection) {
        window.asimovProductSelection.selectProduct(selected, currentRowId);
      }
    }

    txtSearch.addEventListener("input", filterAndRender);

    window.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); selectIndex(selectedIndex + 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); selectIndex(selectedIndex - 1); }
      else if (e.key === "Enter") { e.preventDefault(); submitSelection(); }
      else if (e.key === "Escape") {
        e.preventDefault();
        if (window.asimovProductSelection) window.asimovProductSelection.selectProduct(null, currentRowId);
      }
    });

    btnSelect.addEventListener("click", submitSelection);
    btnNew.addEventListener("click", () => {
      if (window.asimovProductSelection) window.asimovProductSelection.openNewArticle();
    });
    const closeHandler = () => {
      if (window.asimovProductSelection) window.asimovProductSelection.selectProduct(null, currentRowId);
    };
    btnExit.addEventListener("click", closeHandler);

    filterAndRender();
