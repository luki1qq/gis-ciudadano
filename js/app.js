/* Del celular al mapa: lógica de la web. Sin dependencias salvo Leaflet. */
(function () {
  'use strict';

  /* ---------- Datos y constantes ---------- */
  var TIPOS = [
    { id: 'microbasural', label: 'Microbasural', color: '#D55E00' },
    { id: 'contenedor', label: 'Contenedor desbordado', color: '#0072B2' },
    { id: 'escombros', label: 'Escombros', color: '#B8860B' },
    { id: 'quema', label: 'Quema de residuos', color: '#B0508A' }
  ];
  var TIPO = {};
  TIPOS.forEach(function (t) { TIPO[t.id] = t; });
  var VOL = { chico: 'Chico', medio: 'Medio', grande: 'Grande' };

  var CENTRO = [-26.8241, -65.2226];            // San Miguel de Tucumán
  var BBOX = { latMin: -28.0, latMax: -26.0, lonMin: -66.3, lonMax: -64.5 }; // caja aproximada de la provincia
  var CELDA_M = 500;
  var RADIO_M = 200;
  var UMBRAL_PRECISION = 25;                    // metros
  var UMBRAL_DUPLICADO = 15;                    // metros
  var KEY_MIOS = 'gisc-mis-puntos-v1';

  var base = (window.PUNTOS || []).slice();
  var mios = cargarMios();
  var tiposActivos = {};
  TIPOS.forEach(function (t) { tiposActivos[t.id] = true; });
  var capas = { puntos: true, dens: false, radio: false, oficial: true };
  var OFI = window.OFICIAL || { meta: {}, puntos: [] };   // datos oficiales de la Municipalidad (ver datos-oficiales/FUENTE.md)
  var OFI_COLOR = { Activo: '#0B2E8F', Inactivo: '#2E9E7E' };
  var OFI_METODO = { cruce: 'esquina exacta', cruce_aprox: 'esquina aproximada', tramo: 'punto medio del tramo', tramo_parcial: 'una esquina del tramo' };
  var marcadores = {};
  var cacheCalidad = {};

  /* ---------- Utilidades ---------- */
  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function reducido() { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  function oscuro() { return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches; }
  function fmtFecha(iso) {
    if (!iso) return 'sin fecha';
    var d = new Date(iso);
    if (isNaN(d)) return 'sin fecha';
    return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' }) + ', ' +
      d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  }
  function haversine(lat1, lon1, lat2, lon2) {
    var R = 6371000, r = Math.PI / 180;
    var dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R_(a) * R;
  }
  function R_(a) { return Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); }
  function dentro(p) {
    return p.lat >= BBOX.latMin && p.lat <= BBOX.latMax && p.lon >= BBOX.lonMin && p.lon <= BBOX.lonMax;
  }
  var toastTimer;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 3800);
  }
  function cargarMios() {
    try { var v = JSON.parse(localStorage.getItem(KEY_MIOS) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }
  function guardarMios() {
    try { localStorage.setItem(KEY_MIOS, JSON.stringify(mios)); return true; } catch (e) { return false; }
  }
  function todos() { return base.concat(mios.map(function (m) { m.mio = true; return m; })); }
  function visibles() { return todos().filter(function (p) { return dentro(p) && TIPO[p.tipo]; }); }
  function filtrados() { return visibles().filter(function (p) { return tiposActivos[p.tipo]; }); }

  /* ---------- Mapas ---------- */
  // OpenStreetMap: mapa hecho por voluntarios, o sea, ciencia ciudadana aplicada a la cartografía.
  // El modo oscuro se resuelve con un filtro CSS sobre los tiles (ver style.css).
  var ATTR = '&copy; colaboradores de <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
  function conBase(mapa) {
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: ATTR }).addTo(mapa);
    return mapa;
  }

  var mapa = conBase(L.map('map', { scrollWheelZoom: false, zoomControl: true }).setView(CENTRO, 12));
  mapa.on('click', function () { mapa.scrollWheelZoom.enable(); });
  mapa.getContainer().addEventListener('mouseleave', function () { mapa.scrollWheelZoom.disable(); });
  L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(mapa);

  var gPuntos = L.layerGroup(), gDens = L.layerGroup(), gRadio = L.layerGroup(), gOficial = L.layerGroup();

  // Capa oficial: se dibuja una sola vez. Círculos chicos para distinguirlos de los pines de ejemplo.
  function dibujarOficial() {
    OFI.puntos.forEach(function (p) {
      var c = OFI_COLOR[p.estado] || '#666';
      var m = L.circleMarker([p.lat, p.lon], { radius: 5, color: '#fff', weight: 1.5, fillColor: c, fillOpacity: 0.95 });
      m.bindPopup(function () {
        var h = '<div class="pop"><div class="pt" style="--c:' + c + '"><i></i>Basural ' + esc(p.estado.toLowerCase()) + '</div>';
        h += '<p>' + esc(p.dir) + '</p>';
        h += '<p class="mono">Ubicación aproximada: ' + esc(OFI_METODO[p.metodo] || p.metodo) + ', error estimado ±' + p.err + ' m</p>';
        h += '<span class="fl">dato oficial, corte ' + esc((OFI.meta.corte || '').split('-').reverse().join('/')) + '</span>';
        return h + '</div>';
      }, { maxWidth: 260 });
      gOficial.addLayer(m);
    });
  }
  var zonaCritica = null;

  function icono(p) {
    var c = TIPO[p.tipo].color;
    return L.divIcon({ className: '', html: '<span class="pin' + (p.mio ? ' mio' : '') + '" style="--c:' + c + '"></span>', iconSize: [20, 20], iconAnchor: [10, 10], popupAnchor: [0, -12] });
  }

  function popupHtml(p) {
    var t = TIPO[p.tipo], flags = calidad(p);
    var img = p.miniatura || p.foto;
    var h = '<div class="pop">';
    h += img ? '<img src="' + esc(img) + '" alt="Foto del punto">' : '';
    h += '<div class="pt" style="--c:' + t.color + '"><i></i>' + esc(t.label) + '</div>';
    h += '<p>' + esc(VOL[p.volumen] || '') + (p.estado === 'recurrente' ? ' · se repite' : '') + '</p>';
    if (p.nota) h += '<p>' + esc(p.nota) + '</p>';
    h += '<p class="mono">' + esc(fmtFecha(p.fecha)) + '</p>';
    h += '<p class="mono">' + p.lat.toFixed(5) + ', ' + p.lon.toFixed(5) + '</p>';
    if (p.ejemplo) h += '<span class="fl">ejemplo</span>';
    if (p.mio) h += '<span class="fl">tu punto, solo en este dispositivo</span>';
    flags.forEach(function (f) { h += '<span class="fl">' + esc(f) + '</span>'; });
    return h + '</div>';
  }

  /* ---------- Densidad ---------- */
  function celdas(pts) {
    if (!pts.length) return { lista: [], max: 0 };
    var lat0 = CENTRO[0];
    var dLat = CELDA_M / 111320, dLon = CELDA_M / (111320 * Math.cos(lat0 * Math.PI / 180));
    var mapaC = {};
    pts.forEach(function (p) {
      var i = Math.floor(p.lat / dLat), j = Math.floor(p.lon / dLon), k = i + ':' + j;
      if (!mapaC[k]) mapaC[k] = { i: i, j: j, n: 0, pts: [] };
      mapaC[k].n++; mapaC[k].pts.push(p);
    });
    var lista = Object.keys(mapaC).map(function (k) {
      var c = mapaC[k];
      c.bounds = [[c.i * dLat, c.j * dLon], [(c.i + 1) * dLat, (c.j + 1) * dLon]];
      c.centro = [(c.i + 0.5) * dLat, (c.j + 0.5) * dLon];
      return c;
    }).sort(function (a, b) { return b.n - a.n; });
    return { lista: lista, max: lista[0].n };
  }

  /* ---------- Calidad ---------- */
  function calidad(p) {
    if (cacheCalidad[p.id] && cacheCalidad.__v === todos().length) return cacheCalidad[p.id];
    return evaluar(p);
  }
  function evaluar(p) {
    var f = [];
    if (!p.foto) f.push('Sin foto');
    if (p.precision_m && p.precision_m > UMBRAL_PRECISION) f.push('GPS impreciso (±' + p.precision_m + ' m)');
    if (!p.fecha) f.push('Sin fecha');
    if (!dentro(p)) f.push('Fuera de Tucumán');
    else {
      var otros = todos();
      for (var i = 0; i < otros.length; i++) {
        var q = otros[i];
        if (q.id === p.id || q.tipo !== p.tipo || !dentro(q)) continue;
        if (String(q.id) < String(p.id) && haversine(p.lat, p.lon, q.lat, q.lon) < UMBRAL_DUPLICADO) { f.push('Posible duplicado de ' + q.id); break; }
      }
    }
    return f;
  }
  function recalcularCalidad() {
    cacheCalidad = {};
    var t = todos();
    t.forEach(function (p) { cacheCalidad[p.id] = evaluar(p); });
    cacheCalidad.__v = t.length;
  }

  /* ---------- Render del mapa ---------- */
  function refrescarMapa() {
    gPuntos.clearLayers(); gDens.clearLayers(); gRadio.clearLayers(); marcadores = {};
    var pts = filtrados();
    pts.forEach(function (p) {
      var m = L.marker([p.lat, p.lon], { icon: icono(p), title: TIPO[p.tipo].label, keyboard: true });
      m.bindPopup(function () { return popupHtml(p); }, { maxWidth: 260 });
      gPuntos.addLayer(m); marcadores[p.id] = m;
      gRadio.addLayer(L.circle([p.lat, p.lon], { radius: RADIO_M, stroke: false, fillColor: TIPO[p.tipo].color, fillOpacity: 0.16, interactive: false }));
    });
    var c = celdas(pts);
    zonaCritica = c.lista[0] || null;
    c.lista.forEach(function (ce, idx) {
      var r = L.rectangle(ce.bounds, {
        color: '#9B3FD1', weight: idx === 0 ? 3 : 1, dashArray: idx === 0 ? '6 4' : null,
        fillColor: '#9B3FD1', fillOpacity: 0.2 + 0.5 * (ce.n / c.max)
      });
      r.bindTooltip(ce.n + (ce.n === 1 ? ' punto' : ' puntos') + ' en 500 m', { sticky: true });
      gDens.addLayer(r);
    });
    aplicarCapas();
    actualizarEscala();
  }
  function aplicarCapas() {
    [['puntos', gPuntos], ['dens', gDens], ['radio', gRadio], ['oficial', gOficial]].forEach(function (par) {
      var on = capas[par[0]], g = par[1];
      if (on && !mapa.hasLayer(g)) mapa.addLayer(g);
      if (!on && mapa.hasLayer(g)) mapa.removeLayer(g);
    });
    $('#l-puntos').checked = capas.puntos; $('#l-dens').checked = capas.dens; $('#l-radio').checked = capas.radio;
    $('#l-oficial').checked = capas.oficial;
  }
  function volar(centro, zoom) {
    if (reducido()) mapa.setView(centro, zoom); else mapa.flyTo(centro, zoom, { duration: 0.9 });
  }
  function ajustarTodo() {
    var pts = filtrados().concat(capas.oficial ? OFI.puntos : []);
    if (!pts.length) { mapa.setView(CENTRO, 12); return; }
    var b = L.latLngBounds(pts.map(function (p) { return [p.lat, p.lon]; }));
    mapa.fitBounds(b, { padding: [40, 40], maxZoom: 15, animate: !reducido() });
  }
  function actualizarEscala() {
    var z = mapa.getZoom(), lat = mapa.getCenter().lat;
    var den = Math.round(156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, z) / 0.00028);
    $('#scale-out').textContent = 'Escala ≈ 1:' + den.toLocaleString('es-AR') + ' · zoom ' + z;
  }
  mapa.on('zoomend moveend', actualizarEscala);

  function irAPunto(p) {
    if (!tiposActivos[p.tipo]) { tiposActivos[p.tipo] = true; dibujarFiltros(); refrescarTodo(); }
    capas.puntos = true; aplicarCapas();
    $('#mapa').scrollIntoView({ behavior: reducido() ? 'auto' : 'smooth', block: 'start' });
    setTimeout(function () {
      volar([p.lat, p.lon], 17);
      var m = marcadores[p.id];
      if (m) setTimeout(function () { m.openPopup(); }, reducido() ? 0 : 1000);
    }, reducido() ? 0 : 400);
  }

  /* ---------- Filtros ---------- */
  function dibujarFiltros() {
    var cuentas = {};
    visibles().forEach(function (p) { cuentas[p.tipo] = (cuentas[p.tipo] || 0) + 1; });
    $('#filtros').innerHTML = TIPOS.map(function (t) {
      return '<div class="chip" style="--c:' + t.color + '"><input type="checkbox" id="f-' + t.id + '" data-tipo="' + t.id + '"' + (tiposActivos[t.id] ? ' checked' : '') + '>' +
        '<label for="f-' + t.id + '"><span class="dot"></span>' + esc(t.label) + ' <small>' + (cuentas[t.id] || 0) + '</small></label></div>';
    }).join('');
  }
  $('#filtros').addEventListener('change', function (e) {
    var id = e.target.getAttribute('data-tipo');
    if (!id) return;
    tiposActivos[id] = e.target.checked;
    refrescarTodo();
  });
  ['puntos', 'dens', 'radio', 'oficial'].forEach(function (k) {
    $('#l-' + k).addEventListener('change', function (e) { capas[k] = e.target.checked; aplicarCapas(); });
  });
  $$('[data-escala]').forEach(function (b) {
    b.addEventListener('click', function () {
      var e = b.getAttribute('data-escala');
      if (e === 'prov') volar([-26.95, -65.35], 8);
      else if (e === 'gran') ajustarTodo();
      else if (zonaCritica) volar(zonaCritica.centro, 16);
      else toast('Todavía no hay puntos para marcar una zona crítica.');
    });
  });

  /* ---------- Pestañas ---------- */
  var TABS = ['capas', 'resumen', 'historia'];
  function tab(id) {
    TABS.forEach(function (t) {
      $('#tab-' + t).setAttribute('aria-selected', t === id);
      $('#p-' + t).hidden = t !== id;
    });
  }
  TABS.forEach(function (t) { $('#tab-' + t).addEventListener('click', function () { tab(t); if (t === 'historia') aplicarHistoria(); }); });

  /* ---------- Resumen ---------- */
  function renderResumen() {
    var pts = filtrados(), todosV = visibles();
    var rec = pts.filter(function (p) { return p.estado === 'recurrente'; }).length;
    var fechas = pts.map(function (p) { return p.fecha; }).filter(Boolean).sort();
    var rango = fechas.length ? new Date(fechas[0]).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) + ' al ' + new Date(fechas[fechas.length - 1]).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) : 'sin fechas';
    var porTipo = {}; pts.forEach(function (p) { porTipo[p.tipo] = (porTipo[p.tipo] || 0) + 1; });
    var max = Math.max.apply(null, [1].concat(Object.keys(porTipo).map(function (k) { return porTipo[k]; })));
    var barras = TIPOS.map(function (t) {
      var n = porTipo[t.id] || 0;
      return '<div class="brow" style="--c:' + t.color + '"><span>' + esc(t.label) + '</span><div class="trk"><i style="width:' + Math.round(n / max * 100) + '%"></i></div><span class="n">' + n + '</span></div>';
    }).join('');
    var zona = zonaCritica
      ? '<div class="zona"><b>Zona crítica</b><span>' + zonaCritica.n + ' de ' + pts.length + ' puntos caen en una sola celda de ' + CELDA_M + ' m (' + Math.round(zonaCritica.n / pts.length * 100) + '%).</span><button type="button" class="btn-ghost" id="ir-zona">Ver en el mapa</button></div>'
      : '<div class="zona">Sin puntos para analizar con estos filtros.</div>';
    $('#resumen').innerHTML =
      '<div class="stat-row"><div class="stat"><b>' + pts.length + '</b><span>puntos' + (pts.length !== todosV.length ? ' de ' + todosV.length : '') + '</span></div>' +
      '<div class="stat"><b>' + (pts.length ? Math.round(rec / pts.length * 100) : 0) + '%</b><span>se repiten</span></div>' +
      '<div class="stat"><b>' + mios.length + '</b><span>tuyos</span></div></div>' +
      '<p class="note">Período: ' + esc(rango) + '</p>' +
      '<h3>Por tipo</h3><div class="bars">' + barras + '</div>' + zona;
    var btn = $('#ir-zona');
    if (btn) btn.addEventListener('click', function () { capas.dens = true; aplicarCapas(); volar(zonaCritica.centro, 16); });
  }

  /* ---------- Historia ---------- */
  var paso = 0;
  function pasos() {
    var pts = visibles(), n = pts.length;
    var porTipo = {}; pts.forEach(function (p) { porTipo[p.tipo] = (porTipo[p.tipo] || 0) + 1; });
    var top = TIPOS.slice().sort(function (a, b) { return (porTipo[b.id] || 0) - (porTipo[a.id] || 0); })[0];
    var c = celdas(pts);
    var rec = pts.filter(function (p) { return p.estado === 'recurrente'; }).length;
    var malos = pts.filter(function (p) { return evaluar(p).length; }).length;
    return [
      { t: 'El problema', x: 'Se registraron ' + n + ' puntos con residuos en el Gran Tucumán. Cada uno es una observación de una persona, con foto y ubicación.', ver: function () { setFiltros(null); capas.puntos = true; capas.dens = false; capas.radio = false; ajustarTodo(); } },
      { t: 'Dónde se concentra', x: c.lista[0] ? (c.lista[0].n + ' de los ' + n + ' puntos caen en una sola celda de ' + CELDA_M + ' m. Una concentración así sugiere un problema de zona, no de casos aislados.') : 'Todavía no hay puntos.', ver: function () { setFiltros(null); capas.puntos = true; capas.dens = true; capas.radio = false; if (c.lista[0]) volar(c.lista[0].centro, 15); } },
      { t: 'Qué domina', x: top && porTipo[top.id] ? ('El tipo más frecuente es «' + top.label.toLowerCase() + '» con ' + porTipo[top.id] + ' puntos. Si se filtra solo ese tipo, la mancha de densidad cambia de lugar o de tamaño.') : 'Sin datos.', ver: function () { if (top) setFiltros(top.id); capas.puntos = true; capas.dens = true; capas.radio = false; ajustarTodo(); } },
      { t: 'Cuánto se repite', x: rec + ' de ' + n + ' puntos (' + (n ? Math.round(rec / n * 100) : 0) + '%) ya estaban de antes. Los puntos que se repiten muestran dónde la limpieza puntual no alcanza. El radio de 200 m muestra cuánta zona rodean.', ver: function () { setFiltros(null); capas.puntos = true; capas.dens = false; capas.radio = true; ajustarTodo(); } },
      { t: 'Qué tan seguro es esto', x: (n - malos) + ' de ' + n + ' puntos pasan todos los controles de calidad. Los otros ' + malos + ' tienen observaciones (sin foto, GPS impreciso o posible duplicado). Antes de pedir una acción hay que revisarlos.', ver: function () { setFiltros(null); capas.puntos = true; capas.dens = false; capas.radio = false; ajustarTodo(); document.getElementById('calidad').scrollIntoView({ behavior: reducido() ? 'auto' : 'smooth' }); } }
    ];
  }
  function setFiltros(solo) {
    TIPOS.forEach(function (t) { tiposActivos[t.id] = solo ? t.id === solo : true; });
    dibujarFiltros(); refrescarMapa(); renderResumen();
  }
  function renderHistoria() {
    var ps = pasos(), p = ps[paso];
    var puntos = ps.map(function (_, i) { return '<i class="' + (i === paso ? 'on' : '') + '"></i>'; }).join('');
    $('#historia').innerHTML =
      '<div class="story"><p class="story-n">Paso ' + (paso + 1) + ' de ' + ps.length + '</p><h3>' + esc(p.t) + '</h3><p>' + esc(p.x) + '</p></div>' +
      '<div class="story-nav"><button type="button" class="btn-ghost" id="h-prev"' + (paso === 0 ? ' disabled' : '') + '>Anterior</button><span class="dots" aria-hidden="true">' + puntos + '</span>' +
      '<button type="button" class="btn-ghost" id="h-next"' + (paso === ps.length - 1 ? ' disabled' : '') + '>Siguiente</button></div>';
    $('#h-prev').addEventListener('click', function () { if (paso > 0) { paso--; aplicarHistoria(); } });
    $('#h-next').addEventListener('click', function () { if (paso < ps.length - 1) { paso++; aplicarHistoria(); } });
  }
  function aplicarHistoria() {
    renderHistoria();
    var ps = pasos();
    ps[paso].ver();
    aplicarCapas();
    $('#mapa').scrollIntoView({ block: 'nearest' });
  }

  /* ---------- Calidad (sección 4) ---------- */
  function renderCalidad() {
    recalcularCalidad();
    var t = todos();
    var buenos = t.filter(function (p) { return !cacheCalidad[p.id].length; }).length;
    var cuenta = function (re) { return t.filter(function (p) { return cacheCalidad[p.id].some(function (f) { return re.test(f); }); }).length; };
    var ctl = [
      ['Tiene foto', /Sin foto/], ['GPS preciso (hasta ' + UMBRAL_PRECISION + ' m)', /impreciso/], ['Tiene fecha', /Sin fecha/],
      ['Cae dentro de Tucumán', /Fuera/], ['No es duplicado (menos de ' + UMBRAL_DUPLICADO + ' m del mismo tipo)', /duplicado/]
    ];
    var pct = t.length ? Math.round(buenos / t.length * 100) : 0;
    $('#cal-sum').innerHTML =
      '<div><div class="big">' + buenos + '<small> de ' + t.length + '</small></div><p>puntos pasan los 5 controles</p></div>' +
      '<div class="meter" role="img" aria-label="' + pct + ' por ciento de puntos sin observaciones"><i style="width:' + pct + '%"></i></div>' +
      '<ul class="checks">' + ctl.map(function (c) {
        var n = cuenta(c[1]);
        return '<li><span>' + esc(c[0]) + '</span><b class="' + (n ? 'some' : 'zero') + '">' + (n ? n + ' fallan' : 'todos bien') + '</b></li>';
      }).join('') + '</ul>';
    var malos = t.filter(function (p) { return cacheCalidad[p.id].length; });
    $('#cal-list').innerHTML = malos.length ? malos.map(function (p) {
      var ti = TIPO[p.tipo] || { label: p.tipo, color: '#888' };
      var excl = !dentro(p);
      return '<li class="cal-item" style="--c:' + ti.color + '"><span class="dot"></span><div class="what"><b>' + esc(ti.label) + '</b> · ' + esc(p.id) + (excl ? ' · excluido del mapa' : '') +
        '<div class="why">' + cacheCalidad[p.id].map(function (f) { return '<span>' + esc(f) + '</span>'; }).join('') + '</div></div>' +
        (excl ? '<span></span>' : '<button type="button" class="btn-ghost" data-ir="' + esc(p.id) + '">Ver</button>') + '</li>';
    }).join('') : '<li class="cal-empty">Todos los puntos pasan los controles.</li>';
    $$('[data-ir]').forEach(function (b) {
      b.addEventListener('click', function () {
        var p = todos().filter(function (q) { return q.id === b.getAttribute('data-ir'); })[0];
        if (p) irAPunto(p);
      });
    });
  }

  /* ---------- Registro (sección 2) ---------- */
  function renderRegistro() {
    var p = mios.length ? mios[mios.length - 1] : (base.filter(dentro)[0] || null);
    if (!p) { $('#rec-card').innerHTML = '<div class="rec-body">Todavía no hay puntos cargados.</div>'; $('#rec-json').textContent = ''; return; }
    var t = TIPO[p.tipo] || { label: p.tipo, color: '#888' };
    var img = p.miniatura || p.foto;
    $('#rec-card').innerHTML =
      '<div class="rec-img">' + (img ? '<img src="' + esc(img) + '" alt="Foto del punto">' : '<span>Sin foto</span>') + '</div>' +
      '<div class="rec-body"><div class="rec-tag" style="--c:' + t.color + '"><i></i>' + esc(t.label) + (p.mio ? '<em>tu punto</em>' : p.ejemplo ? '<em>ejemplo</em>' : '') + '</div>' +
      '<dl style="margin:0">' +
      '<div class="kv"><dt>Qué es</dt><dd>' + esc(t.label) + ', tamaño ' + esc((VOL[p.volumen] || '').toLowerCase()) + (p.estado === 'recurrente' ? ', se repite' : '') + '</dd></div>' +
      '<div class="kv"><dt>Nota</dt><dd>' + esc(p.nota || 'sin nota') + '</dd></div>' +
      '<div class="kv"><dt>Dónde</dt><dd><span class="lat-lon">' + p.lat.toFixed(5) + ', ' + p.lon.toFixed(5) + '</span></dd></div>' +
      '<div class="kv"><dt>Cuándo</dt><dd>' + esc(fmtFecha(p.fecha)) + '</dd></div>' +
      '<div class="kv"><dt>Precisión del GPS</dt><dd>' + (p.precision_m ? '±' + p.precision_m + ' m' : 'no informada (posición elegida a mano)') + '</dd></div>' +
      '</dl></div>';
    var j = {
      id: p.id, tipo: p.tipo, volumen: p.volumen, estado: p.estado || 'nuevo', nota: p.nota || '',
      lat: p.lat, lon: p.lon, fecha: p.fecha, precision_m: p.precision_m == null ? null : p.precision_m, foto: p.foto ? '(imagen)' : null
    };
    var txt = esc(JSON.stringify(j, null, 2));
    txt = txt.replace(/(&quot;lat&quot;: [-0-9.]+,\n\s*&quot;lon&quot;: [-0-9.]+)/, '<span class="hl">$1</span>');
    $('#rec-json').innerHTML = txt;
    $('#rec-code-t').textContent = p.mio ? 'Tu punto, como lo ve el mapa' : 'Un punto, como lo ve el mapa';
  }

  /* ---------- Formulario (sección 1) ---------- */
  $('#tipos-form').innerHTML = TIPOS.map(function (t, i) {
    return '<div class="chip" style="--c:' + t.color + '"><input type="radio" name="tipo" id="r-' + t.id + '" value="' + t.id + '"' + (i === 0 ? ' checked' : '') + '>' +
      '<label for="r-' + t.id + '"><span class="dot"></span>' + esc(t.label) + '</label></div>';
  }).join('');

  var mini = conBase(L.map('mini-map', { zoomControl: false, attributionControl: false, scrollWheelZoom: false }).setView(CENTRO, 13));
  var pinMini = L.marker(CENTRO, { draggable: true, icon: L.divIcon({ className: '', html: '<span class="pin mio" style="--c:#D55E00"></span>', iconSize: [20, 20], iconAnchor: [10, 10] }) }).addTo(mini);
  var posForm = { lat: CENTRO[0], lon: CENTRO[1], acc: null };
  function actualizarCoord(texto) {
    $('#coord-out').textContent = texto || (posForm.lat.toFixed(5) + ', ' + posForm.lon.toFixed(5) + (posForm.acc ? ' ±' + Math.round(posForm.acc) + ' m' : ' · a mano'));
  }
  pinMini.on('dragend', function () { var ll = pinMini.getLatLng(); posForm = { lat: ll.lat, lon: ll.lng, acc: null }; setGps(null); actualizarCoord(); });
  mini.on('click', function (e) { pinMini.setLatLng(e.latlng); posForm = { lat: e.latlng.lat, lon: e.latlng.lng, acc: null }; setGps(null); actualizarCoord(); });
  actualizarCoord('Tocá el mapa o arrastrá el pin');
  function setGps(estado) { var d = $('#gps-dot'); d.className = 'gps-dot' + (estado ? ' ' + estado : ''); }

  $('#btn-gps').addEventListener('click', function () {
    if (!navigator.geolocation) { toast('Este navegador no tiene geolocalización. Ubicá el pin a mano.'); setGps('err'); return; }
    $('#coord-out').textContent = 'Buscando señal…';
    navigator.geolocation.getCurrentPosition(function (pos) {
      posForm = { lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy };
      pinMini.setLatLng([posForm.lat, posForm.lon]); mini.setView([posForm.lat, posForm.lon], 17);
      setGps('on'); actualizarCoord();
      if (!dentro({ lat: posForm.lat, lon: posForm.lon })) toast('Estás fuera de Tucumán: el punto no se va a mostrar en el mapa.');
    }, function () {
      setGps('err'); actualizarCoord('Sin permiso o sin señal. Ubicá el pin a mano.');
      toast('No pude leer tu ubicación. Tocá el mapa para ubicar el punto.');
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
  });

  var fotoData = null;
  $('#in-foto').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    var url = URL.createObjectURL(f), img = new Image();
    img.onload = function () {
      var max = 360, k = Math.min(1, max / Math.max(img.width, img.height));
      var cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      fotoData = cv.toDataURL('image/jpeg', 0.7);
      var pv = $('#photo-prev'); pv.src = fotoData; pv.hidden = false; $('#photo-ph').hidden = true;
      URL.revokeObjectURL(url);
    };
    img.onerror = function () { toast('No pude leer esa imagen. Probá con otra.'); URL.revokeObjectURL(url); };
    img.src = url;
  });

  $('#form-punto').addEventListener('submit', function (e) {
    e.preventDefault();
    var tipo = ($('input[name="tipo"]:checked') || {}).value || 'microbasural';
    var p = {
      id: 'tu-' + Date.now().toString(36), lat: +posForm.lat.toFixed(6), lon: +posForm.lon.toFixed(6),
      fecha: new Date().toISOString(), tipo: tipo, volumen: $('#in-vol').value,
      estado: $('#in-rec').checked ? 'recurrente' : 'nuevo', nota: $('#in-nota').value.trim(),
      foto: fotoData, miniatura: fotoData, precision_m: posForm.acc ? Math.round(posForm.acc) : null, mio: true
    };
    mios.push(p);
    var ok = guardarMios();
    refrescarTodo();
    toast(dentro(p)
      ? (ok ? 'Punto guardado. Ya aparece en el mapa de la etapa 3.' : 'Punto cargado, pero este navegador no permite guardarlo: se pierde al recargar.')
      : 'Punto guardado, pero está fuera de Tucumán y no se muestra en el mapa.');
    $('#in-nota').value = ''; $('#in-rec').checked = false;
    fotoData = null; $('#photo-prev').hidden = true; $('#photo-ph').hidden = false; $('#in-foto').value = '';
    $('#registro').scrollIntoView({ behavior: reducido() ? 'auto' : 'smooth', block: 'start' });
  });

  /* ---------- Orquestación ---------- */
  function refrescarTodo() {
    recalcularCalidad();
    dibujarFiltros();
    refrescarMapa();
    renderResumen();
    renderRegistro();
    renderCalidad();
    renderHistoria();
  }

  if (todos().some(function (p) { return p.ejemplo; })) $('#banner-ejemplo').hidden = false;
  dibujarOficial();
  refrescarTodo();
  ajustarTodo();
  // Con el layout ya asentado, se recalcula el tamaño y se vuelve a encuadrar.
  setTimeout(function () { mapa.invalidateSize(); mini.invalidateSize(); ajustarTodo(); }, 250);
  window.addEventListener('resize', function () { mapa.invalidateSize(); mini.invalidateSize(); });
})();
