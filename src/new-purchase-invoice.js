
(function(){
  var proveedorId = null;
  var tipoActual = 'FC-A';
  var rowCounter = 0;
  var cuotaCounter = 0;

  function esc(s){
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function fmtNum(n,dec){
    dec = dec === undefined ? 2 : dec;
    return Number(n).toLocaleString('es-AR',{minimumFractionDigits:dec,maximumFractionDigits:dec});
  }

  function initDate(){
    var d = new Date();
    var iso = d.toISOString().slice(0,10);
    document.getElementById('fechaRecepcion').value = iso;
    document.getElementById('fechaFactura').value = iso;
    var mm = String(d.getMonth()+1).padStart(2,'0');
    document.getElementById('periodoFiscal').value = mm+'/'+d.getFullYear();
  }

  function activarTab(name){
    document.querySelectorAll('.tab').forEach(function(t){t.classList.toggle('active',t.dataset.tab===name)});
    document.querySelectorAll('.tab-panel').forEach(function(p){p.classList.toggle('active',p.id==='panel-'+name)});
    if(name==='totales') actualizarInfoCard();
  }

  document.querySelectorAll('.tab').forEach(function(t){
    t.addEventListener('click',function(){activarTab(this.dataset.tab)});
  });

  document.querySelectorAll('.tipo-btn').forEach(function(btn){
    btn.addEventListener('click',function(){
      document.querySelectorAll('.tipo-btn').forEach(function(b){b.classList.remove('active')});
      btn.classList.add('active');
      tipoActual = btn.dataset.tipo;
      document.getElementById('tipoBadge').textContent = tipoActual;
    });
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
      '<td><select class="cell-input" data-col="iva_pct" style="padding:2px 2px"><option value="21">21%</option><option value="10.5">10,5%</option><option value="0">0%</option></select></td>'+
      '<td><input class="cell-input right" data-col="sub" readonly value="0,00"></td>'+
      '<td><button class="del-row" title="Eliminar fila">✕</button></td>';
    tbody.appendChild(tr);
    tr.querySelector('.del-row').addEventListener('click',function(){tr.remove();recalcTotals()});
    tr.querySelectorAll('input[data-col=cant],input[data-col=precio],input[data-col=desc_pct]').forEach(function(inp){
      inp.addEventListener('input',function(){recalcFila(tr);recalcTotals()});
    });
    tr.querySelector('[data-col=iva_pct]').addEventListener('change',function(){recalcFila(tr);recalcTotals()});
    recalcFila(tr);
    recalcTotals();
  }

  function recalcFila(tr){
    var cant = parseFloat(tr.querySelector('[data-col=cant]').value)||0;
    var precio = parseFloat(tr.querySelector('[data-col=precio]').value)||0;
    var desc = parseFloat(tr.querySelector('[data-col=desc_pct]').value)||0;
    var neto = cant * precio * (1 - desc/100);
    tr.querySelector('[data-col=sub]').value = fmtNum(neto);
    tr.dataset.neto = neto;
    tr.dataset.iva = parseFloat(tr.querySelector('[data-col=iva_pct]').value)||0;
  }

  function recalcTotals(){
    var neto21 = 0, neto105 = 0, neto0 = 0;
    document.querySelectorAll('#itemsBody tr').forEach(function(tr){
      var n = parseFloat(tr.dataset.neto)||0;
      var iva = parseFloat(tr.dataset.iva)||0;
      if(iva === 21) neto21 += n;
      else if(iva === 10.5) neto105 += n;
      else neto0 += n;
    });
    var iva21 = neto21 * 0.21;
    var iva105 = neto105 * 0.105;
    var percepciones = parseFloat(document.getElementById('percepciones').value)||0;
    var total = neto21 + neto105 + neto0 + iva21 + iva105 + percepciones;
    document.getElementById('t-neto21').textContent = '$ '+fmtNum(neto21);
    document.getElementById('t-neto105').textContent = '$ '+fmtNum(neto105);
    document.getElementById('t-neto0').textContent = '$ '+fmtNum(neto0);
    document.getElementById('t-iva21').textContent = '$ '+fmtNum(iva21);
    document.getElementById('t-iva105').textContent = '$ '+fmtNum(iva105);
    document.getElementById('t-total').textContent = '$ '+fmtNum(total);
    document.getElementById('sum-factura').textContent = '$ '+fmtNum(total);
    actualizarSumaCuotas();
  }

  function actualizarInfoCard(){
    document.getElementById('inf-tipo').textContent = tipoActual;
    document.getElementById('inf-prov').textContent = document.getElementById('proveedorNombre').value || '—';
    var pto = document.getElementById('ptoVenta').value;
    var nro = document.getElementById('nroFactura').value;
    document.getElementById('inf-nro').textContent = pto && nro ? pto+'-'+nro : '—';
    document.getElementById('inf-fecha').textContent = document.getElementById('fechaFactura').value || '—';
    document.getElementById('inf-venc').textContent = document.getElementById('fechaVencimiento').value || '—';
  }

  function agregarCuota(data){
    data = data || {};
    cuotaCounter++;
    var tbody = document.getElementById('cuotasBody');
    var tr = document.createElement('tr');
    tr.dataset.id = cuotaCounter;
    tr.innerHTML =
      '<td><input class="cell-input right" data-col="nro" value="'+cuotaCounter+'" readonly></td>'+
      '<td><input class="cell-input" type="date" data-col="venc" value="'+esc(data.venc||'')+'"></td>'+
      '<td><input class="cell-input right" type="number" data-col="importe" value="'+esc(data.importe||0)+'" min="0" step="any"></td>'+
      '<td><select class="cell-input" data-col="estado"><option>Pendiente</option><option>Pagada</option></select></td>'+
      '<td><button class="del-row" title="Eliminar">✕</button></td>';
    tbody.appendChild(tr);
    tr.querySelector('.del-row').addEventListener('click',function(){tr.remove();actualizarSumaCuotas()});
    tr.querySelector('[data-col=importe]').addEventListener('input',actualizarSumaCuotas);
  }

  function actualizarSumaCuotas(){
    var sum = 0;
    document.querySelectorAll('#cuotasBody tr').forEach(function(tr){
      sum += parseFloat(tr.querySelector('[data-col=importe]').value)||0;
    });
    document.getElementById('sum-cuotas').textContent = '$ '+fmtNum(sum);
  }

  function abrirProveedorPicker(){
    if(window.asimovNewPurchaseInvoice && window.asimovNewPurchaseInvoice.openSupplierSelection)
      window.asimovNewPurchaseInvoice.openSupplierSelection('fc-proveedor');
  }

  function abrirProductoPicker(){
    if(window.asimovNewPurchaseInvoice) window.asimovNewPurchaseInvoice.openProductSelection();
  }

  function onClientSelected(data){
    if(!data || data.contextId !== 'fc-proveedor') return;
    proveedorId = data.id;
    document.getElementById('proveedorNombre').value = esc(data.nombre||'');
    document.getElementById('proveedorCuit').value = esc(data.cuit||'');
    document.getElementById('proveedorIva').value = esc(data.condIva||'');
    document.getElementById('provBadge').textContent = 'Proveedor: '+(data.nombre||'—');
  }

  function onProductSelected(data){
    if(!data) return;
    agregarFila({codigo:data.codigo,descripcion:data.descripcion,unidad:data.unidad,precio:data.precioCompra||0});
  }

  if(window.asimovNewPurchaseInvoice){
    if(window.asimovNewPurchaseInvoice.onSupplierSelected) window.asimovNewPurchaseInvoice.onSupplierSelected(onClientSelected);
    if(window.asimovNewPurchaseInvoice.onProductSelected) window.asimovNewPurchaseInvoice.onProductSelected(onProductSelected);
  }

  function validar(){
    if(!document.getElementById('proveedorNombre').value.trim()){
      alert('Debe seleccionar un proveedor.');
      activarTab('comprobante');
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
        ivaPct: parseFloat(tr.querySelector('[data-col=iva_pct]').value)||0,
        subtotal: parseFloat(tr.dataset.neto)||0
      });
    });
    var cuotas = [];
    document.querySelectorAll('#cuotasBody tr').forEach(function(tr){
      cuotas.push({
        nro: tr.querySelector('[data-col=nro]').value,
        venc: tr.querySelector('[data-col=venc]').value,
        importe: parseFloat(tr.querySelector('[data-col=importe]').value)||0,
        estado: tr.querySelector('[data-col=estado]').value
      });
    });
    var payload = {
      tipo: tipoActual,
      ptoVenta: document.getElementById('ptoVenta').value,
      nroFactura: document.getElementById('nroFactura').value,
      fechaFactura: document.getElementById('fechaFactura').value,
      fechaRecepcion: document.getElementById('fechaRecepcion').value,
      fechaVencimiento: document.getElementById('fechaVencimiento').value,
      cae: document.getElementById('cae').value,
      periodoFiscal: document.getElementById('periodoFiscal').value,
      proveedorId: proveedorId,
      proveedorNombre: document.getElementById('proveedorNombre').value,
      proveedorCuit: document.getElementById('proveedorCuit').value,
      ocVinculada: document.getElementById('ocVinculada').value,
      rmcVinculada: document.getElementById('rmcVinculada').value,
      percepciones: parseFloat(document.getElementById('percepciones').value)||0,
      bancoPago: document.getElementById('bancoPago').value,
      cbuProveedor: document.getElementById('cbuProveedor').value,
      condPago: document.getElementById('condPago').value,
      notas: document.getElementById('notas').value,
      reclamos: document.getElementById('reclamos').value,
      referencias: document.getElementById('referencias').value,
      estadoCont: document.getElementById('estadoCont').value,
      items: items,
      cuotas: cuotas
    };
    if(window.asimovNewPurchaseInvoice) window.asimovNewPurchaseInvoice.savePurchaseInvoice(payload);
  }

  function imprimir(){
    window.print();
  }

  function anular(){
    if(!confirm('¿Desea anular esta factura de compra?')) return;
    document.getElementById('estadoCont').value = 'Anulada';
    guardar();
  }

  document.addEventListener('keydown',function(e){
    if(e.key === 'F8'){e.preventDefault();guardar()}
    if(e.key === 'F4'){e.preventDefault();abrirProductoPicker()}
    if(e.key === 'Insert'){
      var panel = document.querySelector('.tab-panel.active');
      if(panel && panel.id === 'panel-items'){e.preventDefault();agregarFila()}
      if(panel && panel.id === 'panel-vencimientos'){e.preventDefault();agregarCuota()}
    }
  });

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
