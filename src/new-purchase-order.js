
(function(){
  var proveedorId = null;
  var rowCounter = 0;

  function esc(s){
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function fmtNum(n,dec){
    dec = dec === undefined ? 2 : dec;
    return Number(n).toLocaleString('es-AR',{minimumFractionDigits:dec,maximumFractionDigits:dec});
  }

  function genBadge(){
    var d = new Date();
    var yy = String(d.getFullYear()).slice(2);
    var mm = String(d.getMonth()+1).padStart(2,'0');
    return 'OC-'+yy+mm+'-'+'00001';
  }

  function initDate(){
    var d = new Date();
    var iso = d.toISOString().slice(0,10);
    document.getElementById('fecha').value = iso;
    var d2 = new Date(d.getTime() + 7*24*60*60*1000);
    document.getElementById('fechaEntrega').value = d2.toISOString().slice(0,10);
  }

  function activarTab(name){
    document.querySelectorAll('.tab').forEach(function(t){t.classList.toggle('active',t.dataset.tab===name)});
    document.querySelectorAll('.tab-panel').forEach(function(p){p.classList.toggle('active',p.id==='panel-'+name)});
    if(name==='totales') actualizarInfoCard();
  }

  document.querySelectorAll('.tab').forEach(function(t){
    t.addEventListener('click',function(){activarTab(this.dataset.tab)});
  });

  function agregarFila(data){
    data = data || {};
    rowCounter++;
    var tbody = document.getElementById('itemsBody');
    var tr = document.createElement('tr');
    tr.dataset.id = rowCounter;
    tr.innerHTML =
      '<td style="text-align:center;color:#999;font-size:11px">'+rowCounter+'</td>'+
      '<td><input class="cell-input" data-col="codigo" value="'+esc(data.codigo||'')+'"></td>'+
      '<td><input class="cell-input" data-col="desc" value="'+esc(data.descripcion||'')+'"></td>'+
      '<td><input class="cell-input" data-col="unidad" value="'+esc(data.unidad||'UN')+'"></td>'+
      '<td><input class="cell-input right" type="number" data-col="cant" value="'+esc(data.cantidad||1)+'" min="0" step="any"></td>'+
      '<td><input class="cell-input right" type="number" data-col="precio" value="'+esc(data.precio||0)+'" min="0" step="any"></td>'+
      '<td><input class="cell-input right" type="number" data-col="desc_pct" value="0" min="0" max="100" step="any"></td>'+
      '<td><input class="cell-input right" data-col="sub" readonly value="0,00"></td>'+
      '<td><button class="del-row" title="Eliminar fila">✕</button></td>';
    tbody.appendChild(tr);
    tr.querySelector('.del-row').addEventListener('click',function(){tr.remove();recalcTotals()});
    tr.querySelectorAll('input[data-col=cant],input[data-col=precio],input[data-col=desc_pct]').forEach(function(inp){
      inp.addEventListener('input',function(){recalcFila(tr);recalcTotals()});
    });
    recalcFila(tr);
    recalcTotals();
  }

  function recalcFila(tr){
    var cant = parseFloat(tr.querySelector('[data-col=cant]').value)||0;
    var precio = parseFloat(tr.querySelector('[data-col=precio]').value)||0;
    var desc = parseFloat(tr.querySelector('[data-col=desc_pct]').value)||0;
    var bruto = cant * precio;
    var sub = bruto * (1 - desc/100);
    tr.querySelector('[data-col=sub]').value = fmtNum(sub);
    tr.dataset.sub = sub;
    tr.dataset.bruto = bruto;
    tr.dataset.desc_monto = bruto - sub;
  }

  function recalcTotals(){
    var bruto = 0, descMonto = 0;
    document.querySelectorAll('#itemsBody tr').forEach(function(tr){
      bruto += parseFloat(tr.dataset.bruto)||0;
      descMonto += parseFloat(tr.dataset.desc_monto)||0;
    });
    var neto = bruto - descMonto;
    var iva21 = neto * 0.21;
    var iva105 = 0;
    var total = neto + iva21 + iva105;
    document.getElementById('t-bruto').textContent = '$ '+fmtNum(bruto);
    document.getElementById('t-desc').textContent = '$ '+fmtNum(descMonto);
    document.getElementById('t-neto').textContent = '$ '+fmtNum(neto);
    document.getElementById('t-iva21').textContent = '$ '+fmtNum(iva21);
    document.getElementById('t-iva105').textContent = '$ '+fmtNum(iva105);
    document.getElementById('t-total').textContent = '$ '+fmtNum(total);
  }

  function actualizarInfoCard(){
    document.getElementById('inf-nro').textContent = document.getElementById('nroOC').value;
    document.getElementById('inf-prov').textContent = document.getElementById('proveedorNombre').value || '—';
    document.getElementById('inf-fecha').textContent = document.getElementById('fecha').value || '—';
    document.getElementById('inf-entrega').textContent = document.getElementById('fechaEntrega').value || '—';
    document.getElementById('inf-estado').textContent = document.getElementById('estado').value;
    document.getElementById('inf-dep').textContent = document.getElementById('deposito').options[document.getElementById('deposito').selectedIndex].text;
    document.getElementById('inf-mon').textContent = document.getElementById('moneda').value;
  }

  function abrirProveedorPicker(){
    if(window.asimovNewPurchaseOrder && window.asimovNewPurchaseOrder.openSupplierSelection)
      window.asimovNewPurchaseOrder.openSupplierSelection('oc-proveedor');
  }

  function abrirProductoPicker(){
    if(window.asimovNewPurchaseOrder) window.asimovNewPurchaseOrder.openProductSelection();
  }

  function onClientSelected(data){
    if(!data || data.contextId !== 'oc-proveedor') return;
    proveedorId = data.id;
    document.getElementById('proveedorNombre').value = esc(data.nombre||'');
    document.getElementById('proveedorCuit').value = esc(data.cuit||'');
    document.getElementById('proveedorIva').value = esc(data.condIva||'');
  }

  function onProductSelected(data){
    if(!data) return;
    agregarFila({codigo:data.codigo,descripcion:data.descripcion,unidad:data.unidad,precio:data.precioCompra||0});
  }

  if(window.asimovNewPurchaseOrder){
    if(window.asimovNewPurchaseOrder.onSupplierSelected) window.asimovNewPurchaseOrder.onSupplierSelected(onClientSelected);
    if(window.asimovNewPurchaseOrder.onProductSelected) window.asimovNewPurchaseOrder.onProductSelected(onProductSelected);
  }

  function validar(){
    if(!document.getElementById('proveedorNombre').value.trim()){
      alert('Debe seleccionar un proveedor.');
      activarTab('encabezado');
      return false;
    }
    if(document.querySelectorAll('#itemsBody tr').length === 0){
      alert('Debe ingresar al menos un ítem.');
      activarTab('items');
      return false;
    }
    return true;
  }

  function guardar(){
    if(!validar()) return;
    var items = [];
    document.querySelectorAll('#itemsBody tr').forEach(function(tr){
      items.push({
        codigo: tr.querySelector('[data-col=codigo]').value,
        descripcion: tr.querySelector('[data-col=desc]').value,
        unidad: tr.querySelector('[data-col=unidad]').value,
        cantidad: parseFloat(tr.querySelector('[data-col=cant]').value)||0,
        precio: parseFloat(tr.querySelector('[data-col=precio]').value)||0,
        descPct: parseFloat(tr.querySelector('[data-col=desc_pct]').value)||0,
        subtotal: parseFloat(tr.dataset.sub)||0
      });
    });
    var payload = {
      nroOC: document.getElementById('nroOC').value,
      fecha: document.getElementById('fecha').value,
      fechaEntrega: document.getElementById('fechaEntrega').value,
      proveedorId: proveedorId,
      proveedorNombre: document.getElementById('proveedorNombre').value,
      proveedorCuit: document.getElementById('proveedorCuit').value,
      responsable: document.getElementById('responsable').value,
      deposito: document.getElementById('deposito').value,
      moneda: document.getElementById('moneda').value,
      tipo: document.getElementById('tipo').value,
      estado: document.getElementById('estado').value,
      formaPago: document.getElementById('formaPago').value,
      condEntrega: document.getElementById('condEntrega').value,
      direccionEntrega: document.getElementById('direccionEntrega').value,
      instrucciones: document.getElementById('instrucciones').value,
      notasProveedor: document.getElementById('notasProveedor').value,
      notasInternas: document.getElementById('notasInternas').value,
      referencias: document.getElementById('referencias').value,
      aprobadoPor: document.getElementById('aprobadoPor').value,
      items: items
    };
    if(window.asimovNewPurchaseOrder) window.asimovNewPurchaseOrder.savePurchaseOrder(payload);
  }

  function imprimir(){
    window.print();
  }

  function anular(){
    if(!confirm('¿Desea anular esta orden de compra?')) return;
    document.getElementById('estado').value = 'Cancelada';
    guardar();
  }

  document.addEventListener('keydown',function(e){
    if(e.key === 'F8'){e.preventDefault();guardar()}
    if(e.key === 'F4'){e.preventDefault();abrirProductoPicker()}
    if(e.key === 'Insert'){
      var panel = document.querySelector('.tab-panel.active');
      if(panel && panel.id === 'panel-items'){e.preventDefault();agregarFila()}
    }
  });

  var badge = genBadge();
  document.getElementById('ocBadge').textContent = badge;
  document.getElementById('nroOC').value = badge;
  initDate();
  agregarFila();
})();

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
