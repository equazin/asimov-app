
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
    return 'OP-'+yy+mm+'-'+'00001';
  }

  function initDate(){
    document.getElementById('fecha').value = new Date().toISOString().slice(0,10);
  }

  function activarTab(name){
    document.querySelectorAll('.tab').forEach(function(t){t.classList.toggle('active',t.dataset.tab===name)});
    document.querySelectorAll('.tab-panel').forEach(function(p){p.classList.toggle('active',p.id==='panel-'+name)});
  }

  document.querySelectorAll('.tab').forEach(function(t){
    t.addEventListener('click',function(){activarTab(this.dataset.tab)});
  });

  document.querySelectorAll('.metodo-tab').forEach(function(tab){
    tab.addEventListener('click',function(){
      document.querySelectorAll('.metodo-tab').forEach(function(t){t.classList.remove('active')});
      document.querySelectorAll('.metodo-panel').forEach(function(p){p.classList.remove('active')});
      tab.classList.add('active');
      document.getElementById('mp-'+tab.dataset.metodo).classList.add('active');
      actualizarResumen();
    });
  });

  function totalFacturasVal(){
    var sum = 0;
    document.querySelectorAll('#facturasBody tr').forEach(function(tr){
      sum += parseFloat(tr.dataset.apagar)||0;
    });
    return sum;
  }

  function totalPagoVal(){
    var ef = parseFloat(document.getElementById('ef-monto').value)||0;
    var tr = parseFloat(document.getElementById('tr-monto').value)||0;
    var ch = parseFloat(document.getElementById('ch-monto').value)||0;
    var ta = parseFloat(document.getElementById('ta-monto').value)||0;
    var ot = parseFloat(document.getElementById('ot-monto').value)||0;
    return ef + tr + ch + ta + ot;
  }

  function actualizarResumen(){
    var totalF = totalFacturasVal();
    var totalP = totalPagoVal();
    var dif = totalP - totalF;
    document.getElementById('res-facturas').textContent = '$ '+fmtNum(totalF);
    document.getElementById('res-pago').textContent = '$ '+fmtNum(totalP);
    document.getElementById('res-dif').textContent = '$ '+fmtNum(Math.abs(dif));
    var sem = document.getElementById('res-semaforo');
    var row = document.getElementById('res-dif-row');
    row.className = 'summary-row';
    sem.className = 'semaforo';
    if(Math.abs(dif) < 0.01){sem.classList.add('ok');row.classList.add('ok')}
    else if(Math.abs(dif) < totalF * 0.05){sem.classList.add('warn');row.classList.add('warn')}
    else{sem.classList.add('danger');row.classList.add('danger')}
    document.getElementById('totalBadge').textContent = 'Total: $ '+fmtNum(totalF);
    document.getElementById('totalFacturas').textContent = '$ '+fmtNum(totalF);
  }

  function agregarFactura(data){
    data = data || {};
    rowCounter++;
    var tbody = document.getElementById('facturasBody');
    var tr = document.createElement('tr');
    tr.dataset.id = rowCounter;
    tr.dataset.apagar = 0;
    tr.innerHTML =
      '<td style="text-align:center;color:#999;font-size:11px">'+rowCounter+'</td>'+
      '<td><input class="cell-input" data-col="nro" value="'+esc(data.nro||'')+'"></td>'+
      '<td><input class="cell-input" type="date" data-col="fecha" value="'+esc(data.fecha||'')+'"></td>'+
      '<td><input class="cell-input right" type="number" data-col="original" value="'+esc(data.original||0)+'" min="0" step="any"></td>'+
      '<td><input class="cell-input right" type="number" data-col="saldo" value="'+esc(data.saldo||0)+'" min="0" step="any"></td>'+
      '<td><input class="cell-input right" type="number" data-col="apagar" value="'+esc(data.apagar||0)+'" min="0" step="any"></td>'+
      '<td><button class="del-row" title="Eliminar">✕</button></td>';
    tbody.appendChild(tr);
    tr.querySelector('.del-row').addEventListener('click',function(){tr.remove();actualizarResumen()});
    tr.querySelector('[data-col=apagar]').addEventListener('input',function(){
      tr.dataset.apagar = parseFloat(this.value)||0;
      actualizarResumen();
    });
    tr.querySelector('[data-col=original]').addEventListener('blur',function(){
      var saldo = tr.querySelector('[data-col=saldo]');
      var apagar = tr.querySelector('[data-col=apagar]');
      if(!parseFloat(saldo.value)) saldo.value = this.value;
      if(!parseFloat(apagar.value)){apagar.value = this.value;tr.dataset.apagar=parseFloat(this.value)||0;actualizarResumen()}
    });
  }

  function abrirProveedorPicker(){
    if(window.asimovNewPaymentOrder && window.asimovNewPaymentOrder.openSupplierSelection)
      window.asimovNewPaymentOrder.openSupplierSelection('op-proveedor');
  }

  function onClientSelected(data){
    if(!data || data.contextId !== 'op-proveedor') return;
    proveedorId = data.id;
    document.getElementById('proveedorNombre').value = esc(data.nombre||'');
    document.getElementById('proveedorCuit').value = esc(data.cuit||'');
    document.getElementById('proveedorIva').value = esc(data.condIva||'');
    if(data.cbu) document.getElementById('tr-cbu').value = esc(data.cbu);
  }

  if(window.asimovNewPaymentOrder){
    if(window.asimovNewPaymentOrder.onSupplierSelected) window.asimovNewPaymentOrder.onSupplierSelected(onClientSelected);
  }

  function validar(){
    if(!document.getElementById('proveedorNombre').value.trim()){
      alert('Debe seleccionar un proveedor.');
      activarTab('encabezado');
      return false;
    }
    if(document.querySelectorAll('#facturasBody tr').length === 0){
      alert('Debe ingresar al menos una factura a pagar.');
      activarTab('facturas');
      return false;
    }
    return true;
  }

  function guardar(){
    if(!validar()) return;
    var facturas = [];
    document.querySelectorAll('#facturasBody tr').forEach(function(tr){
      facturas.push({
        nro: tr.querySelector('[data-col=nro]').value,
        fecha: tr.querySelector('[data-col=fecha]').value,
        original: parseFloat(tr.querySelector('[data-col=original]').value)||0,
        saldo: parseFloat(tr.querySelector('[data-col=saldo]').value)||0,
        apagar: parseFloat(tr.querySelector('[data-col=apagar]').value)||0
      });
    });
    var metodoActivo = document.querySelector('.metodo-tab.active').dataset.metodo;
    var payload = {
      nroOP: document.getElementById('nroOP').value,
      fecha: document.getElementById('fecha').value,
      concepto: document.getElementById('concepto').value,
      proveedorId: proveedorId,
      proveedorNombre: document.getElementById('proveedorNombre').value,
      proveedorCuit: document.getElementById('proveedorCuit').value,
      responsable: document.getElementById('responsable').value,
      banco: document.getElementById('banco').value,
      moneda: document.getElementById('moneda').value,
      estado: document.getElementById('estado').value,
      solicitadoPor: document.getElementById('solicitadoPor').value,
      aprobadoPor: document.getElementById('aprobadoPor').value,
      ejecutadoPor: document.getElementById('ejecutadoPor').value,
      comprobanteBanco: document.getElementById('comprobanteBanco').value,
      notas: document.getElementById('notas').value,
      metodo: metodoActivo,
      montoEfectivo: parseFloat(document.getElementById('ef-monto').value)||0,
      montoTransferencia: parseFloat(document.getElementById('tr-monto').value)||0,
      cbuDestino: document.getElementById('tr-cbu').value,
      bancoTransferencia: document.getElementById('tr-banco').value,
      refTransferencia: document.getElementById('tr-ref').value,
      montoCheque: parseFloat(document.getElementById('ch-monto').value)||0,
      nroCheque: document.getElementById('ch-nro').value,
      fechaCheque: document.getElementById('ch-fecha').value,
      montoTarjeta: parseFloat(document.getElementById('ta-monto').value)||0,
      montoOtros: parseFloat(document.getElementById('ot-monto').value)||0,
      conceptoOtros: document.getElementById('ot-concepto').value,
      totalFacturas: totalFacturasVal(),
      totalPago: totalPagoVal(),
      facturas: facturas
    };
    if(window.asimovNewPaymentOrder) window.asimovNewPaymentOrder.savePaymentOrder(payload);
  }

  function imprimir(){
    window.print();
  }

  function anular(){
    if(!confirm('¿Desea anular esta orden de pago?')) return;
    document.getElementById('estado').value = 'Rechazada';
    guardar();
  }

  document.addEventListener('keydown',function(e){
    if(e.key === 'F8'){e.preventDefault();guardar()}
    if(e.key === 'Insert'){
      var panel = document.querySelector('.tab-panel.active');
      if(panel && panel.id === 'panel-facturas'){e.preventDefault();agregarFactura()}
    }
  });

  var badge = genBadge();
  document.getElementById('opBadge').textContent = badge;
  document.getElementById('nroOP').value = badge;
  initDate();
  agregarFactura();
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
