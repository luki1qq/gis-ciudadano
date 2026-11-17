/* Mapa de basurales de Tucumán: datos oficiales + aportes de la comunidad revisados.
   Los aportes viajan a un Formulario de Google; solo se muestran los que se aprueban en la hoja. */
(function () {
  'use strict';

  /* ---------- Configuración ---------- */
  var FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLScAPaPV5O4V4gthHEUf5qh-vF81zMJf-EXOp1dMSEEje1ZXWw/formResponse';
  var ENTRY = { tipo: 'entry.523253416', volumen: 'entry.2045012892', nota: 'entry.143905546',
                lat: 'entry.2003872253', lon: 'entry.24502903', precision: 'entry.1922969084', foto: 'entry.717811284' };
  var CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRErMJqxGFMV3A9FCLiHIBAU2qCiC4DCJXAG7ER2wElN_uCuwzGKwXHpvJ-f4jv5htO-ZrmIuXMH2w5/pub?gid=168253665&single=true&output=csv';
  var CENTRO = [-26.8241, -65.2226];
  var BBOX = { latMin: -28.0, latMax: -26.0, lonMin: -66.3, lonMax: -64.5 };
  var MAX_FOTO_CHARS = 42000;      // la celda de la hoja admite 50.000 caracteres
  var TIPOS = [
    { id: 'microbasural', label: 'Microbasural' },
    { id: 'contenedor', label: 'Contenedor desbordado' },
    { id: 'escombros', label: 'Escombros' },
    { id: 'quema', label: 'Quema de residuos' }
  ];
  var TIPO_LABEL = {}; TIPOS.forEach(function (t) { TIPO_LABEL[t.id] = t.label; });
  var VOL_LABEL = { chico: 'Chico', medio: 'Medio', grande: 'Grande' };

  function $(s) { return document.querySelector(s); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function dentro(lat, lon) { return lat >= BBOX.latMin && lat <= BBOX.latMax && lon >= BBOX.lonMin && lon <= BBOX.lonMax; }

  /* ---------- Mapa ---------- */
  function base(map) {
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
    return map;
  }
  var map = base(L.map('map', { zoomControl: true }));
  map.attributionControl.setPrefix(false);
  var gActivo = L.layerGroup().addTo(map), gInactivo = L.layerGroup().addTo(map), gCom = L.layerGroup().addTo(map);

  var of = (window.OFICIAL && window.OFICIAL.puntos) || [];
  var meta = (window.OFICIAL && window.OFICIAL.meta) || {};
  var bounds = [];
  of.forEach(function (p) {
    if (!dentro(p.lat, p.lon)) return;
    var cls = p.estado === 'Activo' ? 'activo' : 'inactivo';
    var m = L.marker([p.lat, p.lon], { icon: L.divIcon({ className: '', html: '<div class="m-of ' + cls + '"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }), keyboard: true, title: p.dir });
    m.bindPopup('<div class="pop"><h3>' + (cls === 'activo' ? 'Basural activo' : 'Basural erradicado') + '</h3>' +
      '<p>' + esc(p.dir) + '</p><p class="meta">Dato oficial de la Municipalidad (corte ' + esc(meta.corte || '') + '). Ubicación aproximada, error de unos ' + esc(p.err) + ' m.</p></div>');
    (cls === 'activo' ? gActivo : gInactivo).addLayer(m);
    bounds.push([p.lat, p.lon]);
  });
  if (bounds.length) map.fitBounds(L.latLngBounds(bounds), { padding: [30, 30] }); else map.setView(CENTRO, 13);

  /* ---------- Aportes de la comunidad (solo los aprobados) ---------- */
  var nCom = 0;
  function parseCSV(text) {
    var rows = [], row = [], cur = '', q = false, i, c;
    for (i = 0; i < text.length; i++) {
      c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else if (c !== '\r') cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }
  function num(s) { return parseFloat(String(s || '').replace(/^@/, '').replace(',', '.')); }
  function cargarComunidad() {
    fetch(CSV_URL, { cache: 'no-store', credentials: 'omit' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); }).then(function (t) {
      gCom.clearLayers(); nCom = 0;
      parseCSV(t).forEach(function (r) {
        // columnas: fecha, tipo, volumen, nota, lat, lon, precision, foto
        var lat = num(r[4]), lon = num(r[5]);
        if (!isFinite(lat) || !isFinite(lon) || !dentro(lat, lon)) return;
        var tipo = TIPO_LABEL[r[1]] || 'Basural', foto = /^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(r[7] || '') ? r[7] : '';
        var html = '<div class="pop"><h3>' + esc(tipo) + '</h3>' + (foto ? '<img src="' + foto + '" alt="Foto del basural">' : '') +
          '<p class="meta">Tamaño: ' + esc(VOL_LABEL[r[2]] || '-') + (r[3] && r[3] !== '-' ? '<br>' + esc(r[3]) : '') +
          '<br>Aporte de la comunidad, revisado.</p></div>';
        var m = L.marker([lat, lon], { icon: L.divIcon({ className: '', html: '<div class="m-com"></div>', iconSize: [28, 28], iconAnchor: [14, 28] }), keyboard: true, title: tipo });
        m.bindPopup(html, { maxWidth: 260 });
        gCom.addLayer(m); nCom++;
      });
      pintarStats();
    }).catch(function () { pintarStats(); });
  }

  function pintarStats() {
    var act = meta.activos_oficial, ina = meta.inactivos_oficial;
    $('#stats').innerHTML =
      (act != null ? '<span><b>' + act + '</b>activos</span>' : '') +
      (ina != null ? '<span><b>' + ina + '</b>erradicados</span>' : '') +
      '<span><b>' + nCom + '</b>aportes de la comunidad</span>';
  }
  pintarStats();
  cargarComunidad();

  function capa(id, group) {
    $(id).addEventListener('change', function (e) { if (e.target.checked) map.addLayer(group); else map.removeLayer(group); });
  }
  capa('#l-activo', gActivo); capa('#l-inactivo', gInactivo); capa('#l-com', gCom);

  /* ---------- Diálogos ---------- */
  var dlgAdd = $('#dlg-add'), dlgInfo = $('#dlg-info');
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-close]')) { var d = e.target.closest('dialog'); if (d) d.close(); }
  });
  $('#btn-info').addEventListener('click', function () { dlgInfo.showModal(); });

  /* ---------- Formulario de alta ---------- */
  var mini, pin, fotoDataUrl = '', pos = null, precision = null;
  $('#tipos').innerHTML = TIPOS.map(function (t, i) {
    return '<label><input type="radio" name="tipo" value="' + t.id + '"' + (i === 0 ? ' checked' : '') + '><span>' + t.label + '</span></label>';
  }).join('');

  function iniciarMini() {
    if (mini) { mini.invalidateSize(); return; }
    mini = base(L.map('mini-map', { zoomControl: false, attributionControl: false }));
    var c = map.getCenter();
    mini.setView(c, 15);
    mini.on('click', function (e) { ponerPin(e.latlng.lat, e.latlng.lng, null); });
    setTimeout(function () { mini.invalidateSize(); }, 50);
  }
  function ponerPin(lat, lon, prec) {
    pos = { lat: lat, lon: lon }; precision = prec;
    if (!pin) {
      pin = L.marker([lat, lon], { draggable: true, icon: L.divIcon({ className: '', html: '<div class="m-com"></div>', iconSize: [28, 28], iconAnchor: [14, 28] }) }).addTo(mini);
      pin.on('dragend', function () { var p = pin.getLatLng(); pos = { lat: p.lat, lon: p.lng }; precision = null; mostrarCoord(); });
    } else pin.setLatLng([lat, lon]);
    mini.setView([lat, lon], Math.max(mini.getZoom(), 17));
    mostrarCoord();
  }
  function mostrarCoord() {
    $('#coord-out').textContent = pos ? pos.lat.toFixed(5) + ', ' + pos.lon.toFixed(5) + (precision ? ' (±' + Math.round(precision) + ' m)' : '') : 'Movés el pin si hace falta';
  }

  function reset() {
    $('#form-add').hidden = false; $('#done').hidden = true; $('#form-add').reset();
    $('#photo-prev').hidden = true; $('#photo-ph').hidden = false; $('#msg-error').hidden = true;
    fotoDataUrl = ''; pos = null; precision = null;
    if (pin && mini) { mini.removeLayer(pin); pin = null; }
    mostrarCoord(); $('#btn-send').disabled = false;
  }
  $('#btn-add').addEventListener('click', function () {
    reset(); dlgAdd.showModal(); iniciarMini();
    if (mini) mini.setView(map.getCenter(), Math.max(15, Math.min(map.getZoom(), 17)));
  });

  $('#btn-gps').addEventListener('click', function () {
    var b = this;
    if (!navigator.geolocation) { error('Este navegador no da la ubicación. Tocá el mapa para poner el pin.'); return; }
    b.disabled = true; b.textContent = 'Buscando…';
    navigator.geolocation.getCurrentPosition(function (p) {
      b.disabled = false; b.textContent = 'Usar mi ubicación';
      ponerPin(p.coords.latitude, p.coords.longitude, p.coords.accuracy);
    }, function () {
      b.disabled = false; b.textContent = 'Usar mi ubicación';
      error('No pude obtener tu ubicación. Tocá el mapa para poner el pin.');
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  });

  function error(msg) { var e = $('#msg-error'); e.textContent = msg; e.hidden = false; }

  /* La foto se achica y se vuelve a codificar en un canvas: así se pierde el EXIF (GPS y datos del teléfono). */
  function procesarFoto(file) {
    return (window.createImageBitmap ? createImageBitmap(file, { imageOrientation: 'from-image' }) : Promise.reject()).catch(function () {
      return new Promise(function (ok, no) {
        var img = new Image(), u = URL.createObjectURL(file);
        img.onload = function () { URL.revokeObjectURL(u); ok(img); }; img.onerror = no; img.src = u;
      });
    }).then(function (bmp) {
      var w = bmp.width || bmp.naturalWidth, h = bmp.height || bmp.naturalHeight, lado = 560, q = 0.6, out = '';
      for (var i = 0; i < 8; i++) {
        var k = Math.min(1, lado / Math.max(w, h)), cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(w * k)); cv.height = Math.max(1, Math.round(h * k));
        cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
        out = cv.toDataURL('image/jpeg', q);
        if (out.length <= MAX_FOTO_CHARS) return out;
        if (q > 0.4) q -= 0.1; else lado = Math.round(lado * 0.8);
      }
      throw new Error('grande');
    });
  }
  $('#in-foto').addEventListener('change', function () {
    var f = this.files && this.files[0]; if (!f) return;
    $('#msg-error').hidden = true;
    procesarFoto(f).then(function (d) {
      fotoDataUrl = d; $('#photo-prev').src = d; $('#photo-prev').hidden = false; $('#photo-ph').hidden = true;
    }).catch(function () { fotoDataUrl = ''; error('No pude leer esa foto. Probá con otra.'); });
  });

  $('#form-add').addEventListener('submit', function (e) {
    e.preventDefault();
    var ultimo = +localStorage.getItem('bt-ultimo-envio') || 0;
    if (!fotoDataUrl) return error('Falta la foto.');
    if (!pos) return error('Falta la ubicación: usá tu ubicación o tocá el mapa.');
    if (!dentro(pos.lat, pos.lon)) return error('Ese punto queda fuera de Tucumán.');
    if (!$('#in-ok').checked) return error('Confirmá que la foto no muestra personas ni patentes.');
    if (Date.now() - ultimo < 20000) return error('Esperá unos segundos antes de enviar otro.');
    var tipo = (document.querySelector('input[name="tipo"]:checked') || {}).value || TIPOS[0].id;
    var body = new URLSearchParams();
    body.set(ENTRY.tipo, tipo);
    body.set(ENTRY.volumen, $('#in-vol').value);
    body.set(ENTRY.nota, ($('#in-nota').value || '').trim() || '-');
    body.set(ENTRY.lat, '@' + pos.lat.toFixed(6));          // el prefijo evita que la hoja lo tome como número con coma
    body.set(ENTRY.lon, '@' + pos.lon.toFixed(6));
    body.set(ENTRY.precision, precision ? '@' + Math.round(precision) : '-');
    body.set(ENTRY.foto, fotoDataUrl);
    var btn = $('#btn-send'); btn.disabled = true; btn.textContent = 'Enviando…';
    fetch(FORM_URL, { method: 'POST', mode: 'no-cors', body: body }).then(function () {
      localStorage.setItem('bt-ultimo-envio', String(Date.now()));
      $('#form-add').hidden = true; $('#done').hidden = false; btn.textContent = 'Enviar para revisión';
    }).catch(function () {
      btn.disabled = false; btn.textContent = 'Enviar para revisión';
      error('No se pudo enviar. Revisá tu conexión y probá de nuevo.');
    });
  });
})();
