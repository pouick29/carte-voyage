/* Carte interactive — La Petite Fée Bretonne
   Moteur d'affichage partagé par la page publique et la page admin. */
(function () {
  var NS = 'http://www.w3.org/2000/svg';

  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  var regionNames = null;
  try { regionNames = new Intl.DisplayNames(['fr'], { type: 'region' }); } catch (e) {}

  function nomPays(s) {
    if (regionNames) {
      try {
        var n = regionNames.of(s.c);
        if (n && n !== s.c) return n;
      } catch (e) {}
    }
    return s.n;
  }

  /* jeu : 'france' | 'monde'
     opts.onSelect(code, nom) appelée au clic / à la touche Entrée */
  function creerCarte(host, jeu, opts) {
    opts = opts || {};
    var data = window.PFB_DATA[jeu];
    var vb = data.viewBox;
    var VW = vb[2], VH = vb[3];
    var view = { x: 0, y: 0, w: VW, h: VH };

    host.classList.add('carte-host');
    var svg = el('svg', {
      viewBox: view.x + ' ' + view.y + ' ' + view.w + ' ' + view.h,
      'class': 'carte-svg',
      role: 'group',
      'aria-label': jeu === 'france' ? 'Carte des départements français' : 'Carte du monde'
    });
    var g = el('g', {}, svg);

    if (data.frame) {
      el('rect', { x: data.frame.x, y: data.frame.y, width: data.frame.w, height: data.frame.h, rx: 10, 'class': 'cadre' }, g);
    }

    var noms = {};
    var zones = {}; // code -> [elements]
    function reg(code, node) { (zones[code] = zones[code] || []).push(node); }

    var markers = [];
    data.shapes.forEach(function (s) {
      var nom = jeu === 'monde' ? nomPays(s) : s.n;
      noms[s.c] = nom;
      var libelle = jeu === 'france' ? nom + ' (' + s.c + ')' : nom;
      var p = el('path', { d: s.d, 'class': 'zone', 'data-code': s.c, tabindex: 0, role: 'button', 'aria-label': libelle }, g);
      reg(s.c, p);
      if (s.m) markers.push([s, nom, libelle]);
    });
    markers.forEach(function (m) {
      var c = el('circle', { cx: m[0].m[0], cy: m[0].m[1], r: 3.4, 'class': 'zone marqueur', 'data-code': m[0].c, tabindex: 0, role: 'button', 'aria-label': m[2] }, g);
      reg(m[0].c, c);
    });

    (data.labels || []).forEach(function (l) {
      var t = el('text', { x: l.x, y: l.y, 'class': 'legende-carte', 'text-anchor': 'middle' }, g);
      t.textContent = l.t;
    });

    host.appendChild(svg);

    // --- boutons de zoom
    var ctr = document.createElement('div');
    ctr.className = 'zoom-ctrl';
    ctr.innerHTML = '<button type="button" aria-label="Zoomer" data-z="in">+</button>' +
      '<button type="button" aria-label="Dézoomer" data-z="out">−</button>' +
      '<button type="button" aria-label="Revenir à la vue complète" data-z="reset">⟲</button>';
    host.appendChild(ctr);

    // --- étiquette au survol
    var tip = document.createElement('div');
    tip.className = 'etiquette';
    tip.hidden = true;
    host.appendChild(tip);

    function applyView() {
      svg.setAttribute('viewBox', view.x + ' ' + view.y + ' ' + view.w + ' ' + view.h);
      var zoomed = view.w < VW - 0.5;
      svg.classList.toggle('zoome', zoomed);
    }
    function clampView() {
      view.w = Math.max(VW / 14, Math.min(VW, view.w));
      view.h = view.w * VH / VW;
      view.x = Math.max(0, Math.min(VW - view.w, view.x));
      view.y = Math.max(0, Math.min(VH - view.h, view.y));
    }
    function toSvg(clientX, clientY) {
      var m = svg.getScreenCTM();
      if (!m) return { x: view.x + view.w / 2, y: view.y + view.h / 2 };
      var pt = svg.createSVGPoint();
      pt.x = clientX; pt.y = clientY;
      var r = pt.matrixTransform(m.inverse());
      return { x: r.x, y: r.y };
    }
    function zoomAt(factor, cx, cy) {
      var nw = Math.max(VW / 14, Math.min(VW, view.w / factor));
      var k = nw / view.w;
      view.x = cx - (cx - view.x) * k;
      view.y = cy - (cy - view.y) * k;
      view.w = nw;
      clampView();
      applyView();
    }
    ctr.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      var z = b.getAttribute('data-z');
      if (z === 'reset') { view = { x: 0, y: 0, w: VW, h: VH }; applyView(); return; }
      zoomAt(z === 'in' ? 1.6 : 1 / 1.6, view.x + view.w / 2, view.y + view.h / 2);
    });
    svg.addEventListener('wheel', function (e) {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      var p = toSvg(e.clientX, e.clientY);
      zoomAt(e.deltaY < 0 ? 1.25 : 1 / 1.25, p.x, p.y);
    }, { passive: false });

    // --- glisser pour déplacer (quand la carte est zoomée) + clic
    var drag = null, moved = false;
    svg.addEventListener('pointerdown', function (e) {
      moved = false;
      if (view.w < VW - 0.5) {
        drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
      }
    });
    svg.addEventListener('pointermove', function (e) {
      if (drag && e.pointerId === drag.id) {
        var dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
        if (!moved && Math.abs(dx) + Math.abs(dy) > 6) { moved = true; try { svg.setPointerCapture(e.pointerId); } catch (x) {} }
        if (moved) {
          var m = svg.getScreenCTM();
          var sc = m ? m.a : 1;
          view.x = drag.vx - dx / sc;
          view.y = drag.vy - dy / sc;
          clampView();
          applyView();
          tip.hidden = true;
          return;
        }
      }
      if (e.pointerType === 'mouse') {
        var z = e.target.closest && e.target.closest('.zone');
        if (z) {
          var code = z.getAttribute('data-code');
          tip.textContent = jeu === 'france' ? noms[code] + ' · ' + code : noms[code];
          tip.hidden = false;
          var r = host.getBoundingClientRect();
          var x = e.clientX - r.left, y = e.clientY - r.top;
          tip.style.left = Math.min(Math.max(x, 60), r.width - 60) + 'px';
          tip.style.top = (y - 14) + 'px';
        } else tip.hidden = true;
      }
    });
    function endDrag(e) { if (drag && e.pointerId === drag.id) drag = null; }
    svg.addEventListener('pointerup', endDrag);
    svg.addEventListener('pointercancel', endDrag);
    svg.addEventListener('pointerleave', function () { tip.hidden = true; });

    svg.addEventListener('click', function (e) {
      if (moved) { moved = false; return; }
      var z = e.target.closest && e.target.closest('.zone');
      if (!z) return;
      var code = z.getAttribute('data-code');
      if (opts.onSelect) opts.onSelect(code, noms[code]);
    });
    svg.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var z = e.target.closest && e.target.closest('.zone');
      if (!z) return;
      e.preventDefault();
      var code = z.getAttribute('data-code');
      if (opts.onSelect) opts.onSelect(code, noms[code]);
    });

    // --- API
    var codes = Object.keys(noms);
    return {
      noms: noms,
      codes: codes,
      total: codes.length,
      maj: function (ensemble) {
        codes.forEach(function (c) {
          var on = ensemble.has(c);
          zones[c].forEach(function (n) { n.classList.toggle('conquis', on); });
        });
      },
      selectionner: function (code) {
        codes.forEach(function (c) {
          zones[c].forEach(function (n) { n.classList.toggle('sel', c === code); });
        });
      },
      pop: function (code) {
        (zones[code] || []).forEach(function (n) {
          n.classList.remove('pop'); n.getBoundingClientRect(); n.classList.add('pop');
          setTimeout(function () { n.classList.remove('pop'); }, 900);
        });
      }
    };
  }

  /* Remplit une liste cliquable (alternative précise pour les téléphones) */
  function creerListe(ul, carte, jeu, onSelect) {
    var items = {};
    var triee = carte.codes.slice().sort(function (a, b) {
      return jeu === 'france' ? a.localeCompare(b, 'fr', { numeric: true }) : carte.noms[a].localeCompare(carte.noms[b], 'fr');
    });
    triee.forEach(function (c) {
      var li = document.createElement('li');
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ligne';
      b.setAttribute('data-code', c);
      b.innerHTML = '<span class="coeur" aria-hidden="true">♡</span><span class="nom"></span>';
      b.querySelector('.nom').textContent = jeu === 'france' ? c + ' · ' + carte.noms[c] : carte.noms[c];
      b.addEventListener('click', function () { onSelect(c, carte.noms[c]); });
      li.appendChild(b);
      ul.appendChild(li);
      items[c] = { li: li, b: b, nom: carte.noms[c].toLowerCase(), code: c.toLowerCase() };
    });
    return {
      maj: function (ensemble) {
        Object.keys(items).forEach(function (c) {
          var on = ensemble.has(c);
          items[c].b.classList.toggle('conquis', on);
          items[c].b.querySelector('.coeur').textContent = on ? '🩷' : '♡';
        });
      },
      filtrer: function (q) {
        q = (q || '').trim().toLowerCase();
        var norm = function (s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, ''); };
        var nq = norm(q);
        Object.keys(items).forEach(function (c) {
          var it = items[c];
          it.li.hidden = nq && norm(it.nom).indexOf(nq) === -1 && it.code.indexOf(nq) === -1;
        });
      }
    };
  }

  window.PFB = { creerCarte: creerCarte, creerListe: creerListe };
})();
