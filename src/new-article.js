
    const txtCodigo = document.getElementById("txtCodigo");
    const txtDescripcion = document.getElementById("txtDescripcion");
    const txtLinea = document.getElementById("txtLinea");
    const txtCategoria = document.getElementById("txtCategoria");
    const selIva = document.getElementById("selIva");

    txtCodigo.value = Math.floor(100000 + Math.random() * 900000);

    // Tab switching
    document.querySelectorAll(".tab").forEach(tab => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
        document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
        tab.classList.add("active");
        document.getElementById("panel-" + tab.dataset.tab).classList.add("active");
      });
    });

    /* btnNew removed */

    document.getElementById("btnSave").addEventListener("click", () => {
      if (!txtCodigo.value || !txtDescripcion.value) {
        alert("Complete Código y Descripción.");
        return;
      }
      const article = {
        codigo: txtCodigo.value.trim(),
        descripcion: txtDescripcion.value.trim().toUpperCase(),
        importe: (10 + Math.random() * 100).toFixed(2),
        iva: selIva.value,
        st: "0", compro: "0", entr: "0",
        linea: (txtLinea.value.trim() || "GENÉRICO").toUpperCase(),
        categoria: (txtCategoria.value.trim() || "VARIOS").toUpperCase()
      };
      if (window.asimovNewArticle) window.asimovNewArticle.createArticle(article);
    });

    const closeHandler = () => { if (window.asimovNewArticle) window.asimovNewArticle.cancel(); };
    document.getElementById("btnExit").addEventListener("click", closeHandler);
    document.getElementById("btnClose").addEventListener("click", closeHandler);
