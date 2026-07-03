
    const txtCodigo = document.getElementById("txtCodigo");
    const txtRazonSocial = document.getElementById("txtRazonSocial");
    const txtCuit = document.getElementById("txtCuit");

    txtCodigo.value = Math.floor(10000 + Math.random() * 90000);

    document.querySelectorAll(".tab").forEach(tab => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
        document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
        tab.classList.add("active");
        document.getElementById("panel-" + tab.dataset.tab).classList.add("active");
      });
    });

    /* btnNew removed from footer */

    document.getElementById("btnSave").addEventListener("click", () => {
      if (!txtRazonSocial.value.trim()) { alert("Ingrese la Razón Social."); return; }
      const client = {
        codigo: txtCodigo.value.trim(),
        razonSocial: txtRazonSocial.value.trim().toUpperCase(),
        cuit: txtCuit.value.trim(),
        domicilio: document.getElementById("txtDomicilio")?.value || "",
        telefono: document.getElementById("txtTelefono")?.value || "",
        email: document.getElementById("txtEmail")?.value || "",
        condicionIva: document.getElementById("selIva")?.value || "",
        mayorista: document.getElementById("chkMayorista")?.checked || false,
      };
      if (window.asimovNewClient) window.asimovNewClient.createClient(client);
    });

    const closeHandler = () => { if (window.asimovNewClient) window.asimovNewClient.cancel(); };
    document.getElementById("btnExit").addEventListener("click", closeHandler);
    document.getElementById("btnClose").addEventListener("click", closeHandler);
