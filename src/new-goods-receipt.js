
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
    return 'RMC-'+yy+mm+'-'+'00001';
  }

  function initDateTime(){
    var d = new Date();
    document.getElementById('fecha').value = d.toISOString().slice(0,10);
    var hh = String(d.getHours()).padStart(2,'0');
    var min = String(d.getMinutes()).padStart(2,'0');
    document.getElementById('hora').value = hh+':'+min;
  }

  function activarTab(name){
    document.querySelectorAll('.tab').forEach(function(t){t.classList.toggle('active',t.dataset.tab===name)});
    document.querySelectorAll('.tab-panel').forEach(function(p){p.classList.toggle('active',p.id==='panel-'+name)});
  }

  document.querySelectorAll('.tab').forEach(function(t){
    t.addEventListener('click',function(){activarTab(this.dataset.tab)});
  });

  function semaforoHtml(dif){
    if(dif === 0) return '<span class="semaforo ok"></span>Conforme';
    if(Math.abs(dif) <= 2) return '<span class="semaforo warn"></span>'+fmtNum(dif,0);
    return '<span class="semaforo danger"></span>'+fmtNum(dif,0);
  }

  function actualizarDif(tr){
    var pedida = parseFloat(tr.querySelector('[data-col=pedida]').value)||0;
    var recibida = parseFloat(tr.querySelector('[data-col=recibida]').value)||0;
    var dif = recibida - pedida;
    tr.querySelector('.dif-cell').innerHTML = semaforoHtml(dif);
  }

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
      '<td><input class="cell-input right" type="number" data-col="pedida" value="'+esc(data.pedida||0)+'" min="0" step="any"></td>'+
      '<td><input class="cell-input right" type="number" data-col="recibida" value="'+esc(data.pedida||0)+'" min="0" step="any"></td>'+
      '<td class="dif-cell" style="white-space:nowrap;font-size:12px"></td>'+
      '<td><input class="cell-input" data-col="lote" value="'+esc(data.lote||'')+'"></td>'+
      '<td><input class="cell-input" type="date" data-col="venc" value="'+esc(data.venc||'')+'"></td>'+
      '<td><button class="del-row" title="Eliminar fila">✕</button></td>';
    tbody.appendChild(tr);
    tr.querySelector('.del-row').addEventListener('click',function(){tr.remove()});
    tr.querySelectorAll('input[data-col=pedida],input[data-col=recibida]').forEach(function(inp){
      inp.addEventListener('input',function(){actualizarDif(tr)});
    });
    actualizarDif(tr);
  }

  function abrirProveedorPicker(){
    if(window.asimovNewGoodsReceipt && window.asimovNewGoodsReceipt.openSupplierSelection)
      window.asimovNewGoodsReceipt.openSupplierSelection('rmc-proveedor');
  }

  function abrirProductoPicker(){
    if(window.asimovNewGoodsReceipt) window.asimovNewGoodsReceipt.openProductSelection();
  }

  function onClientSelected(data){
    if(!data || data.contextId !== 'rmc-proveedor') return;
    proveedorId = data.id;
    document.getElementById('proveedorNombre').value = esc(data.nombre||'');
  }

  function onProductSelected(data){
    if(!data) return;
    agregarFila({codigo:data.codigo,descripcion:data.descripcion,unidad:data.unidad,pedida:1});
  }

  if(window.asimovNewGoodsReceipt){
    if(window.asimovNewGoodsReceipt.onSupplierSelected) window.asimovNewGoodsReceipt.onSupplierSelected(onClientSelected);
    if(window.asimovNewGoodsReceipt.onProductSelected) window.asimovNewGoodsReceipt.onProductSelected(onProductSelected);
  }

  function validar(){
    if(!document.getElementById('proveedorNombre').value.trim()){
      alert('Debe seleccionar un proveedor.');
      activarTab('encabezado');
      return false;
    }
    if(document.querySelectorAll('#itemsBody tr').length === 0){
      alert('Debe ingresar al menos un ítem recibido.');
      activarTab('items');
      return false;
    }
    return true;
  }

  function guardar(){
    if(!validar()) return;
    var items = [];
    document.querySelectorAll('#itemsBody tr').forEach(function(tr){
      var pedida = parseFloat(tr.querySelector('[data-col=pedida]').value)||0;
      var recibida = parseFloat(tr.querySelector('[data-col=recibida]').value)||0;
      items.push({
        codigo: tr.querySelector('[data-col=codigo]').value,
        descripcion: tr.querySelector('[data-col=desc]').value,
        unidad: tr.querySelector('[data-col=unidad]').value,
        cantPedida: pedida,
        cantRecibida: recibida,
        diferencia: recibida - pedida,
        lote: tr.querySelector('[data-col=lote]').value,
        fechaVenc: tr.querySelector('[data-col=venc]').value
      });
    });
    var payload = {
      nroRmc: document.getElementById('nroRmc').value,
      fecha: document.getElementById('fecha').value,
      hora: document.getElementById('hora').value,
      proveedorId: proveedorId,
      proveedorNombre: document.getElementById('proveedorNombre').value,
      ocOrigen: document.getElementById('ocOrigen').value,
      remito: document.getElementById('remito').value,
      estado: document.getElementById('estado').value,
      deposito: document.getElementById('deposito').value,
      responsable: document.getElementById('responsable').value,
      ubicacion: document.getElementById('ubicacion').value,
      transportista: document.getElementById('transportista').value,
      patente: document.getElementById('patente').value,
      temperatura: document.getElementById('temperatura').value,
      condicion: document.getElementById('condicion').value,
      firma: document.getElementById('firma').value,
      notasCalidad: document.getElementById('notasCalidad').value,
      diferencias: document.getElementById('diferencias').value,
      reclamos: document.getElementById('reclamos').value,
      notasInternas: document.getElementById('notasInternas').value,
      fechaNextAction: document.getElementById('fechaNextAction').value,
      items: items
    };
    if(window.asimovNewGoodsReceipt) window.asimovNewGoodsReceipt.saveGoodsReceipt(payload);
  }

  function imprimir(){
    window.print();
  }

  function anular(){
    if(!confirm('¿Desea marcar esta recepción como Rechazada?')) return;
    document.getElementById('estado').value = 'Rechazada';
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
  document.getElementById('rmcBadge').textContent = badge;
  document.getElementById('nroRmc').value = badge;
  initDateTime();
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
