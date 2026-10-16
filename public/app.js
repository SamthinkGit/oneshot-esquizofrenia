/* ONE·SHOT — cliente. Todo el estado real vive en el servidor; esto solo pinta. */
(function () {
  'use strict';

  var APP = document.getElementById('app');
  var MODAL = document.getElementById('modal-root');
  var TOAST = document.getElementById('toast');
  var LS = 'oneshot.session.v2';
  var VERSION = 'v9'; // se ve en la pantalla de entrada: sirve para saber si el móvil tiene la última

  var S = { as: null, token: null };
  try { S = JSON.parse(localStorage.getItem(LS)) || S; } catch (e) {}

  var view = null;       // vista filtrada que manda el servidor
  var lobby = null;
  var lobbyError = null;
  var knownItems = null;   // ids del inventario ya vistos, para avisar de lo nuevo
  var skew = 0;          // Date.now() - reloj del servidor
  var screen = 'boot';   // boot | lock | pin | alloc | app
  var tab = null;
  var openChat = null;
  var modal = null;
  var pinBuf = '';
  var allocDraft = null;
  var lastEventId = null;
  var lastUnread = 0;
  var actionStatus = {};   // id de acción -> último estado visto, para avisar de cambios
  var connected = true;
  var pollTimer = null;
  var needsRender = false;

  var STAT_LABELS = {
    fuerza: 'Fuerza', destreza: 'Destreza', inteligencia: 'Inteligencia',
    constitucion: 'Constitución', carisma: 'Carisma', arcano: 'Arcano'
  };
  var STAT_ORDER = ['fuerza', 'destreza', 'inteligencia', 'constitucion', 'carisma', 'arcano'];

  // Habilidades con ventana: mientras dura, el DM las ve en "En curso".
  var RUNNING = { seguir: 1, ojos: 1, taciturno: 1 };
  // Avisos cuyo detalle son las palabras que ha escrito el jugador.
  var WORDS = { senuelo: 1, espantapajaros: 1, talar: 1, pista: 1, ojitos: 1, sexto: 1, item: 1 };
  var alerted = {};  // avisos de Taciturno cumplido que ya han sonado

  /* ---------------------------------------------------------------- utils */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function now() { return Date.now() - skew; }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function mmss(ms) {
    var t = Math.max(0, Math.ceil(ms / 1000));
    return pad(Math.floor(t / 60)) + ':' + pad(t % 60);
  }
  function hhmm(ts) {
    var d = new Date(ts);
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function buzz(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }

  // Modificador de D&D: 10 y 11 dan 0, cada 2 puntos suman o restan 1.
  function mod(score) {
    var m = Math.floor((Number(score) - 10) / 2);
    return m < 0 ? '−' + Math.abs(m) : '+' + m;
  }

  var toastTimer;
  function toast(msg, bad) {
    TOAST.textContent = msg;
    TOAST.className = 'on' + (bad ? ' bad' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { TOAST.className = ''; }, 2600);
  }

  function saveSession() { try { localStorage.setItem(LS, JSON.stringify(S)); } catch (e) {} }
  function clearSession() {
    S = { as: null, token: null };
    try { localStorage.removeItem(LS); } catch (e) {}
  }
  function makeToken() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'tk-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  /* ------------------------------------------------------------------ api */

  function post(body) {
    body.as = body.as || S.as;
    body.token = body.token || S.token;
    return fetch('/api', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().catch(function () { return { error: 'Respuesta inválida del servidor.' }; })
        .then(function (j) {
          if (!r.ok) { var e = new Error(j.error || 'Error'); e.status = r.status; throw e; }
          return j;
        });
    });
  }

  function get(params) {
    var q = [];
    for (var k in params) q.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k]));
    return fetch('/api?' + q.join('&')).then(function (r) {
      return r.json().catch(function () { return { error: 'Respuesta inválida del servidor.' }; })
        .then(function (j) {
          if (!r.ok) { var e = new Error(j.error || 'Error'); e.status = r.status; throw e; }
          return j;
        });
    });
  }

  var lastSig = null;
  function absorb(v) {
    if (!v) return;
    if (v.now) skew = Date.now() - v.now;
    var prev = view;
    var wasConnected = connected;
    view = v;
    connected = true;

    // Repintar solo cuando algo cambia de verdad: si no, el DOM se recrea cada
    // 1,5 s y se come los toques del móvil.
    var sig = JSON.stringify(v, function (k, val) { return k === 'now' ? 0 : val; });
    var changed = sig !== lastSig || !wasConnected;
    lastSig = sig;

    if (v.role === 'dm' && v.events && v.events.length) {
      var top = v.events[0];
      if (lastEventId && top.id !== lastEventId) {
        buzz([28, 60, 28]);
        toast(top.title);
        flash();
      }
      lastEventId = top.id;
    }
    // Cuando el DM resuelve algo tuyo, avisa aunque estés en otra pestaña.
    if (v.role === 'player' && v.myEvents) {
      v.myEvents.forEach(function (e) {
        var was = actionStatus[e.id];
        if (was !== undefined && was !== e.status) {
          buzz([25, 60, 25]);
          toast(e.name + ' · ' + e.text);
        }
        actionStatus[e.id] = e.status;
      });
    }
    // Algo nuevo en el inventario: puede haberlo encontrado aunque no lo buscara.
    if (v.role === 'player' && v.me.items) {
      var fresh = {};
      v.me.items.forEach(function (i) {
        fresh[i.id] = true;
        if (knownItems && !knownItems[i.id]) { buzz([30, 50, 30]); toast('Has encontrado «' + i.word + '». Tienes 3 min para usarlo.'); }
      });
      knownItems = fresh;
    }

    var unread = totalUnread(v);
    if (prev && unread > lastUnread) buzz(24);
    lastUnread = unread;
    if (changed) render(); else tick();
  }

  function totalUnread(v) {
    var n = 0;
    if (!v) return 0;
    if (v.role === 'player' && v.chats) v.chats.concat(v.intercepted || []).forEach(function (c) { n += c.unread; });
    if (v.role === 'dm' && v.chats) {
      v.chats.direct.forEach(function (c) { n += c.unread; });
      v.chats.intercepted.forEach(function (c) { n += c.unread; });
    }
    return n;
  }

  function flash() {
    var el = document.querySelector('.top');
    if (!el) return;
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  }

  function fail(err) {
    if (err && err.status === 401) {
      clearSession(); view = null; screen = 'lock'; loadLobby();
      toast('Sesión caducada, vuelve a entrar.', true);
      return;
    }
    toast((err && err.message) || 'Algo ha fallado.', true);
  }

  /* ------------------------------------------------------------- arranque */

  function loadLobby() {
    return get({ op: 'lobby' }).then(function (l) {
      lobby = l; lobbyError = null; connected = true;
      if (l.now) skew = Date.now() - l.now;
      if (!S.as) screen = 'lock';
      render();
    }).catch(function (err) {
      // Si el servidor contesta con un error (p. ej. sin base de datos), se
      // enseña tal cual: "sin conexión" solo cuando no responde nada.
      connected = false;
      lobbyError = err && err.status ? err.message : null;
      render();
    });
  }

  function refresh() {
    if (!S.as) return Promise.resolve();
    return get({ op: 'view', as: S.as, token: S.token })
      .then(absorb)
      .catch(function (err) {
        // Cualquier rechazo del servidor (4xx) significa que la sesión guardada
        // ya no vale: a la pantalla de entrada. Solo sin respuesta es "sin red".
        if (err && err.status >= 400 && err.status < 500) { err.status = 401; fail(err); return; }
        if (connected) { connected = false; render(); }
      });
  }

  function startPolling() {
    if (pollTimer) return;
    var loop = function () {
      pollTimer = setTimeout(function () {
        (document.hidden ? Promise.resolve() : refresh()).then(loop);
      }, document.hidden ? 4000 : 1500);
    };
    loop();
    setInterval(function () {
      if (S.as && !document.hidden) post({ op: 'ping', withView: false }).catch(function () {});
    }, 20000);
  }

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && S.as) refresh();
  });

  /* ----------------------------------------------------------- foco/scroll */

  function captureFocus() {
    var el = document.activeElement;
    if (!el || !el.id || (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA')) return null;
    return { id: el.id, value: el.value, start: el.selectionStart, end: el.selectionEnd };
  }
  function restoreFocus(f) {
    if (!f) return;
    var el = document.getElementById(f.id);
    if (!el) return;
    el.value = f.value;
    try { el.setSelectionRange(f.start, f.end); } catch (e) {}
    el.focus();
  }

  /* --------------------------------------------------------------- render */

  function render() {
    var f = captureFocus();
    var atBottom = threadAtBottom();

    if (!S.as) {
      if (screen === 'pin') renderPin(); else renderLock();
    } else if (!view) {
      renderBoot();
    } else if (view.role === 'player') {
      if (!view.me.stats) renderAlloc(); else renderPlayer();
    } else {
      renderDM();
    }

    renderModal();
    restoreFocus(f);
    if (atBottom) scrollThread();
    tick();
  }

  function threadAtBottom() {
    var t = document.querySelector('.thread');
    if (!t) return true;
    var m = document.scrollingElement || document.documentElement;
    return m.scrollHeight - m.scrollTop - m.clientHeight < 140;
  }
  function scrollThread() {
    if (!document.querySelector('.thread')) return;
    var m = document.scrollingElement || document.documentElement;
    m.scrollTop = m.scrollHeight;
  }

  function renderBoot() {
    APP.innerHTML =
      '<div class="lock"><div class="lock-head center">' +
      '<h1 class="brand" data-t="ONE·SHOT">ONE·SHOT</h1>' +
      '<p class="lock-sub">' + (connected ? 'conectando…' : 'sin conexión') + '</p>' +
      '</div></div>';
  }

  /* ---------------------------------------------------------- 1. identidad */

  function renderLock() {
    var list = (lobby && lobby.players) || [];
    APP.innerHTML =
      '<div class="lock">' +
        '<div class="lock-head">' +
          '<h1 class="brand" data-t="ONE·SHOT">ONE·SHOT</h1>' +
          '<p class="lock-sub">Elige quién eres <span class="ver">' + VERSION + '</span></p>' +
        '</div>' +
        '<div class="id-list">' +
          list.map(function (p) {
            return '<button class="id ' + (p.claimed ? 'taken' : 'free') + '" data-act="pick" data-id="' + p.id + '"' +
              (p.claimed ? ' disabled' : '') + '>' +
              '<span class="id-dot"></span><span>' +
              '<span class="id-name">' + esc(p.name) + '</span>' +
              '<span class="id-tag">' + esc(p.tag) + '</span></span>' +
              '<span class="id-state">' + (p.claimed ? 'ocupado' : 'libre') + '</span></button>';
          }).join('') +
          '<button class="id dm" data-act="pick" data-id="dm">' +
            '<span class="id-dot"></span><span>' +
            '<span class="id-name">DM</span><span class="id-tag">Narrador</span></span>' +
            '<span class="id-state">clave</span></button>' +
        '</div>' +
        (list.length ? '' : '<p class="empty">' +
          (connected ? 'cargando…' : esc(lobbyError || 'Sin conexión con el servidor.')) + '</p>') +
      '</div>';
  }

  function renderPin() {
    var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'volver', '0', 'borrar'];
    APP.innerHTML =
      '<div class="lock"><div class="pin-wrap">' +
        '<p class="mono-label">Acceso del DM</p>' +
        '<div class="pin-dots">' +
          [0, 1, 2, 3].map(function (i) {
            return '<span class="pin-dot' + (pinBuf.length > i ? ' on' : '') + '"></span>';
          }).join('') +
        '</div>' +
        '<div class="pin-pad">' +
          keys.map(function (k) {
            var ghost = (k === 'volver' || k === 'borrar');
            return '<button class="pin-key' + (ghost ? ' ghost' : '') + '" data-act="pin" data-k="' + k + '">' + k + '</button>';
          }).join('') +
        '</div>' +
      '</div></div>';
  }

  /* ------------------------------------------------------- 2. reparto 70pt */

  // Reparte los puntos al azar respetando mínimo, máximo y total exacto.
  // Cada característica recibe una afinidad aleatoria para que salgan
  // personajes con carácter en vez de seis números casi iguales.
  function randomStats(r, total) {
    var out = {}, weight = {};
    STAT_ORDER.forEach(function (k) { out[k] = r.MIN_STAT; weight[k] = 0.25 + Math.random(); });
    var left = total - r.MIN_STAT * STAT_ORDER.length;
    while (left > 0) {
      var pool = STAT_ORDER.filter(function (k) { return out[k] < r.MAX_STAT; });
      if (!pool.length) break;
      var total = 0;
      pool.forEach(function (k) { total += weight[k]; });
      var pick = pool[pool.length - 1], roll = Math.random() * total;
      for (var i = 0; i < pool.length; i++) {
        roll -= weight[pool[i]];
        if (roll <= 0) { pick = pool[i]; break; }
      }
      out[pick]++;
      left--;
    }
    return out;
  }

  function renderAlloc() {
    var r = view.rules;
    if (!allocDraft) {
      allocDraft = {};
      STAT_ORDER.forEach(function (k) { allocDraft[k] = r.MIN_STAT; });
    }
    var used = 0;
    STAT_ORDER.forEach(function (k) { used += allocDraft[k]; });
    var left = view.me.points - used;

    APP.innerHTML =
      topBar(view.me.name, 'crea tu personaje', { exit: true }) +
      '<div class="alloc">' +
        '<div class="alloc-pool">' +
          '<span class="pool-n' + (left === 0 ? ' zero' : '') + '">' + left + '</span>' +
          '<span class="pool-txt">puntos<br>por repartir</span>' +
        '</div>' +
        STAT_ORDER.map(function (k) {
          var v = allocDraft[k];
          return '<div class="stat-row">' +
            '<span class="stat-name">' + STAT_LABELS[k] + '</span>' +
            '<span class="stat-mod">' + mod(v) + '</span>' +
            '<div class="stepper">' +
              '<button class="step" data-act="alloc" data-k="' + k + '" data-d="-1"' + (v <= r.MIN_STAT ? ' disabled' : '') + '>−</button>' +
              '<span class="stat-val">' + v + '</span>' +
              '<button class="step" data-act="alloc" data-k="' + k + '" data-d="1"' + (v >= r.MAX_STAT || left <= 0 ? ' disabled' : '') + '>+</button>' +
            '</div>' +
          '</div>';
        }).join('') +
        '<p class="hint" style="margin-top:16px">Mínimo ' + r.MIN_STAT + ', máximo ' + r.MAX_STAT + ' por característica. Una vez confirmes no podrás cambiarlo.</p>' +
        '<div class="sheet-acts">' +
          '<button data-act="allocRandom">🎲 Aleatorio</button>' +
          '<button class="primary" data-act="allocSave"' + (left !== 0 ? ' disabled' : '') + '>Confirmar</button>' +
        '</div>' +
      '</div>';
  }

  /* ----------------------------------------------------------- 3. jugador */

  function topBar(title, sub, opts) {
    opts = opts || {};
    return '<header class="top">' +
      (opts.back ? '<button class="icon-btn" data-act="' + opts.back + '">‹</button>' : '') +
      '<div><div class="top-name">' + esc(title) + '</div>' +
      (sub ? '<div class="top-tag">' + esc(sub) + '</div>' : '') + '</div>' +
      '<div class="top-right">' +
        '<span class="live' + (connected ? '' : ' off') + '"><i></i>' + (connected ? 'en vivo' : 'sin red') + '</span>' +
        (opts.exit ? '<button class="icon-btn" data-act="logout" title="Salir">⎋</button>' : '') +
      '</div></header>';
  }

  function tabsBar(items, active) {
    return '<nav class="tabs">' + items.map(function (t) {
      return '<button class="tab' + (t.k === active ? ' on' : '') + '" data-act="tab" data-t="' + t.k + '">' +
        t.label + (t.badge ? '<span class="dot">' + t.badge + '</span>' : '') + '</button>';
    }).join('') + '</nav>';
  }

  function cooldownBlock(readyAt, cd) {
    var left = readyAt - now();
    if (left <= 0) return '';
    return '<div class="cd" data-ready="' + readyAt + '" data-cd="' + cd + '">' +
      '<div class="cd-track"><div class="cd-fill"></div></div>' +
      '<div class="cd-meta"><span>recargando</span><span class="cd-time">' + mmss(left) + '</span></div>' +
    '</div>';
  }

  function publicFeed(items) {
    if (!items || !items.length) return '';
    return '<div class="section-t"><span class="mono-label">La mesa</span></div>' +
      '<ul class="public">' + items.slice(0, 5).map(function (a) {
        return '<li><time>' + hhmm(a.ts) + '</time>' + esc(a.text) + '</li>';
      }).join('') + '</ul>';
  }

  function renderPlayer() {
    // Ficha y habilidades viven en la misma pantalla: durante la partida no
    // hay que cambiar de pestaña para consultar una stat antes de tirar.
    if (tab !== 'chat') tab = 'personaje';
    var unread = totalUnread(view);

    if (tab === 'chat' && openChat) { renderThread(); return; }

    var body = tab === 'personaje'
      ? blockedBanner() + publicFeed(view.public) + myActionsBlock() + inventoryBlock() + statsBlock() + bonusBlock() +
        '<div class="section-t"><span class="mono-label">Habilidades</span></div>' +
        view.abilities.map(abilityCard).join('') +
        passiveCard() +
        evolutionCard()
      : chatListBody(view.chats, false) + interceptedList(view.intercepted);

    APP.innerHTML =
      topBar(view.me.name, view.me.tag, { exit: true }) +
      '<main>' + body + '</main>' +
      tabsBar([
        { k: 'personaje', label: 'Personaje' },
        { k: 'chat', label: 'Mensajes', badge: unread || 0 }
      ], tab);
  }

  function abilityCard(a) {
    var t = now();
    var blocked = view.me.blocked;
    var ready = !a.locked && a.readyAt <= t;
    var active = a.activeUntil > t;

    var chip = '';
    if (active) {
      chip = '<div class="window-chip" data-window="' + a.activeUntil + '">' +
        (a.key === 'taciturno' ? 'en silencio' : 'activa') + ' · <b class="wt">' + mmss(a.activeUntil - t) + '</b></div>';
      if (a.key === 'ojos') chip += '<p class="ab-note">Solo vale lo que TÚ preguntes.</p>';
    }

    var foot;
    var usable = false;
    if (a.locked) {
      foot = '<div class="lock-note">Se desbloquea cuando empiece la partida</div>';
    } else if (a.key === 'taciturno' && active) {
      foot = '<button class="cast-btn ghost" data-act="taciBreak">He hablado</button>';
    } else if (!ready) {
      foot = cooldownBlock(a.readyAt, a.cd);
    } else if (blocked) {
      foot = '<div class="lock-note">bloqueada</div>';
    } else if (a.input === 'item' && !revivable().length) {
      foot = '<div class="lock-note">No tienes nada que recuperar</div>';
    } else {
      usable = true;
      foot = '<button class="cast-btn" data-act="cast" data-k="' + a.key + '">Usar</button>';
    }

    return '<article class="ab' + (usable ? ' ready' : '') + '">' +
      '<div class="ab-head">' +
        '<h3 class="ab-name">' + esc(a.name) + '</h3>' +
        (a.ulti ? '<span class="ab-tag acc">ulti</span>' : '') +
        (a.public ? '<span class="ab-tag">pública</span>' : '') +
        '<button class="info-btn" data-act="info" data-k="' + a.key + '" aria-label="Más información">?</button>' +
      '</div>' +
      '<p class="ab-short">' + esc(a.short) + '</p>' +
      chip + foot +
    '</article>';
  }

  // Sin cuenta atrás a propósito: solo sabe que ha sido otro jugador.
  function blockedBanner() {
    if (!view.me.blocked) return '';
    return '<div class="pending-bar"><div class="pending">' +
      '<b>BLOQUEADO</b> Otro jugador ha bloqueado tus habilidades.</div></div>';
  }

  // Inventario. "Activo" se decide con el reloj local para que el objeto
  // desaparezca justo a los 3 minutos sin esperar al servidor.
  function itemActive(i) { return i.state === 'active' && i.expiresAt > now(); }
  function revivable() {
    if (!view.me.canRevive) return [];
    return (view.me.items || []).filter(function (i) { return !i.revived && !itemActive(i); });
  }

  function inventoryBlock() {
    var items = view.me.items || [];
    // Tomás siempre lo ve; el resto, solo cuando ha encontrado algo.
    if (!items.length && !view.me.canRevive) return '';
    var active = items.filter(itemActive);
    var rest = items.filter(function (i) { return !itemActive(i); });
    var out = '<div class="section-t"><span class="mono-label">Inventario</span></div>';
    if (!items.length) {
      return out + '<p class="hint left">Vacío. Lo que encuentres con Sexto Sentido aparecerá aquí.</p>';
    }
    out += active.length
      ? active.map(function (i) {
          return '<div class="item">' +
            '<span class="item-name">' + esc(i.word) + '</span>' +
            '<span class="window-chip" data-window="' + i.expiresAt + '">desaparece en <b class="wt">' + mmss(i.expiresAt - now()) + '</b></span>' +
            '<button class="mini good" data-act="useItem" data-i="' + esc(i.id) + '">Usar</button>' +
          '</div>';
        }).join('')
      : '<p class="hint left">No tienes nada a mano ahora mismo.</p>';
    if (rest.length) {
      out += '<p class="mono-label" style="margin:14px 0 8px">Mochila</p><ul class="bag">' +
        rest.map(function (i) {
          return '<li><span>' + esc(i.word) + '</span><span class="dim">' +
            (i.state === 'used' ? 'usado' : 'desaparecido') +
            (!view.me.canRevive ? '' : i.revived ? ' · ya recuperado' : ' · se puede recuperar') + '</span></li>';
        }).join('') + '</ul>';
    }
    return out;
  }

  function evolutionCard() {
    var e = view.evolution;
    if (!e) return '';
    return '<div class="evolve-card">' +
      '<h4>' + esc(e.label) + '</h4>' +
      '<p>Cambias <b>' + esc(e.from) + '</b> por <b>' + esc(e.to) + '</b>. ' + esc(e.toShort) + '</p>' +
      '<button class="evolve-btn" data-act="evolveInfo">Ver qué implica</button>' +
    '</div>';
  }

  function myActionsBlock() {
    var list = view.myEvents || [];
    if (!list.length) return '';
    return '<div class="section-t"><span class="mono-label">Tus acciones</span></div>' +
      '<ul class="acts">' + list.map(function (e) {
        return '<li class="act ' + e.state + '">' +
          '<span class="act-top">' +
            '<span class="act-name">' + esc(e.name) +
            (e.detail ? ' <span class="act-detail">' + esc(e.detail) + '</span>' : '') + '</span>' +
            '<time>' + hhmm(e.ts) + '</time>' +
          '</span>' +
          '<span class="act-state">' + esc(e.text) + '</span>' +
        '</li>';
      }).join('') + '</ul>';
  }

  function statsBlock() {
    var st = view.me.stats || {};
    return '<div class="section-t"><span class="mono-label">Características</span></div>' +
      '<div class="sheet-grid">' +
        STAT_ORDER.map(function (k) {
          return '<div class="sheet-cell"><span class="mono-label">' + STAT_LABELS[k] + '</span>' +
            '<div class="sheet-n">' + st[k] + '<span class="mod">' + mod(st[k]) + '</span></div></div>';
        }).join('') +
      '</div>';
  }

  function bonusBlock() {
    var b = view.me.bonus;
    if (!b) return '';
    return '<div class="bonus"><span class="bonus-n">+' + b.value + '</span>' +
      '<span class="bonus-txt">Bonus permanente acumulado<br>' +
      '<span class="dim">' + esc(b.from) + ' · lo concede el DM</span></span></div>';
  }

  function passiveCard() {
    var p = view.passive;
    if (!p) return '';
    return '<article class="ab passive">' +
      '<div class="ab-head">' +
        '<h3 class="ab-name">' + esc(p.name) + '</h3>' +
        '<button class="info-btn" data-act="infoPassive" aria-label="Más información">?</button>' +
      '</div>' +
      '<span class="tagline">Pasiva · siempre activa</span>' +
      '<p class="ab-short">' + esc(p.short) + '</p>' +
      '<button class="cast-btn ghost" data-act="passiveCheck"' + (p.pending ? ' disabled' : '') + '>' +
        (p.pending ? 'Enviada · esperando al DM' : 'Revisar pasiva') + '</button>' +
    '</article>';
  }

  /* -------------------------------------------------------------- chats */

  function chatListBody(chats, isDM) {
    var rows = chats.map(function (c) {
      var initial = (c.label || '?').slice(0, 2).toUpperCase();
      var prev = c.last ? (c.last.from === S.as ? 'Tú: ' : '') + c.last.text : 'Sin mensajes todavía';
      return '<li><button class="chat-open" data-act="openChat" data-c="' + esc(c.id) + '">' +
        '<span class="chat-av' + (c.withId === 'dm' ? ' dm' : '') + '">' + esc(initial) + '</span>' +
        '<span class="chat-meta"><span class="chat-who">' + esc(c.label) + '</span>' +
        '<span class="chat-prev">' + esc(prev) + '</span></span>' +
        (c.unread ? '<span class="badge">' + c.unread + '</span>' :
          (c.last ? '<span class="chat-prev">' + hhmm(c.last.ts) + '</span>' : '')) +
      '</button></li>';
    }).join('');
    return '<div class="section-t"><span class="mono-label">' + (isDM ? 'Tus chats' : 'Privados') + '</span></div>' +
      '<ul class="chat-list">' + rows + '</ul>';
  }

  function findChat(id) {
    if (!view) return null;
    if (view.role === 'player') {
      return view.chats.concat(view.intercepted || []).filter(function (c) { return c.id === id; })[0];
    }
    var all = view.chats.direct.concat(view.chats.intercepted);
    return all.filter(function (c) { return c.id === id; })[0];
  }

  function renderThread() {
    var c = findChat(openChat);
    if (!c) { openChat = null; render(); return; }
    var readOnly = !c.withId; // chat interceptado entre jugadores
    var msgs = c.messages || [];

    var body = msgs.length
      ? '<div class="thread">' + msgs.map(function (m) {
          var mine = m.from === S.as;
          var who = '';
          if (readOnly) who = '<span class="who">' + esc((c.names && c.names[m.from]) || m.from) + '</span>';
          return '<div class="msg ' + (mine ? 'me' : 'them') + '">' + who +
            esc(m.text) + '<time>' + hhmm(m.ts) + '</time></div>';
        }).join('') + '</div>'
      : '<p class="empty">Nada por aquí todavía.<br>Lo que escribas solo lo verá ' + esc(c.label) + '.</p>';

    APP.innerHTML =
      topBar(c.label, readOnly ? 'interceptado' : 'privado', { back: 'backChat' }) +
      '<main style="padding-bottom:88px">' + body + '</main>' +
      (readOnly ? '' :
        '<div class="composer">' +
          '<textarea id="composer-input" rows="1" placeholder="Escribe…" data-act="grow"></textarea>' +
          '<button class="send-btn" data-act="send">➤</button>' +
        '</div>');
  }

  /* ------------------------------------------------------------------ DM */

  function renderDM() {
    if (!tab) tab = 'ahora';
    if (tab === 'chats' && openChat) { renderThread(); return; }

    var unread = totalUnread(view);
    var todo = dmTodo().length;
    var body = '';

    if (tab === 'ahora') body = dmNow();
    else if (tab === 'feed') body = dmFeed();
    else if (tab === 'mesa') body = dmTable();
    else if (tab === 'chats') body = dmChats();
    else body = dmTools();

    APP.innerHTML =
      topBar('DM', 'control total', { exit: true }) +
      '<main>' + body + '</main>' +
      tabsBar([
        { k: 'ahora', label: 'Ahora', badge: todo || 0 },
        { k: 'feed', label: 'Avisos' },
        { k: 'mesa', label: 'Mesa' },
        { k: 'chats', label: 'Chats', badge: unread || 0 },
        { k: 'tools', label: 'QR' }
      ], tab);
  }

  function isOpen(e) { return e.status === 'new' || e.status === 'seen'; }
  function isRunning(e) { return RUNNING[e.ability] && e.windowEnds > now() && e.status !== 'fail'; }

  // Lo que espera una respuesta del DM. Seguir y Ojos limpios no: duran lo que
  // dura su ventana y se apagan solas. Taciturno sí, pero solo al cumplirse.
  function needsDM(e) {
    if (!isOpen(e)) return false;
    if (e.kind !== 'cast' && e.kind !== 'passive' && e.kind !== 'item') return false;
    if (RUNNING[e.ability]) return e.ability === 'taciturno' && !isRunning(e);
    return true;
  }
  function dmTodo() { return view.events.filter(needsDM).reverse(); } // el más antiguo arriba

  function dmNow() {
    var t = now();
    var out = '';

    if (!view.startedAt) {
      out += '<div class="now-start">' +
        '<b>La partida aún no ha empezado.</b>' +
        '<span>Empieza sola cuando los cuatro tengan su ficha. Las ultis cuentan una hora desde ese momento.</span>' +
        (view.waiting.length
          ? '<span class="dim">Faltan: ' + view.waiting.map(function (w) { return esc(w.name) + ' (' + w.why + ')'; }).join(', ') + '</span>'
          : '') +
        '<button class="mini" data-act="dmStart">Empezar ya</button>' +
      '</div>';
    }

    var todo = dmTodo();
    out += '<div class="section-t"><span class="mono-label">Te toca' + (todo.length ? ' · ' + todo.length : '') + '</span></div>' +
      (todo.length ? todo.map(eventCard).join('') : '<p class="now-empty">Nada pendiente.</p>');

    var running = view.events.filter(isRunning).map(eventCard);
    view.players.forEach(function (p) {
      if (p.blockedUntil > t) {
        running.push('<div class="watch">' +
          '<div class="watch-txt"><b>' + esc(p.name) + ' bloqueado</b><span>Silencio, por favor. No sabe quién ha sido.</span></div>' +
          '<span class="window-chip" data-window="' + p.blockedUntil + '"><b class="wt">' + mmss(p.blockedUntil - t) + '</b></span>' +
          '<button class="mini" data-act="dmUnblock" data-p="' + p.id + '">Quitar</button>' +
        '</div>');
      }
      (p.items || []).filter(itemActive).forEach(function (i) {
        running.push('<div class="watch">' +
          '<div class="watch-txt"><b>' + esc(p.name) + ' tiene «' + esc(i.word) + '»</b><span>1 uso. Si no lo usa, desaparece.</span></div>' +
          '<span class="window-chip" data-window="' + i.expiresAt + '"><b class="wt">' + mmss(i.expiresAt - t) + '</b></span>' +
        '</div>');
      });
    });
    out += '<div class="section-t" style="margin-top:22px"><span class="mono-label">En curso</span></div>' +
      (running.length ? running.join('') : '<p class="now-empty">Nada en marcha.</p>');

    var watch = view.players.filter(function (p) { return p.passive; }).map(function (p) {
      return '<div class="watch">' +
        '<div class="watch-txt"><b>' + esc(p.name) + ' · ' + esc(p.passive.name) + '</b><span>' + esc(p.passive.watch) + '</span></div>' +
        (p.bonus ? '<span class="watch-n">+' + p.bonus.value + '</span>' : '') +
        '<button class="mini good" data-act="dmPlus" data-p="' + p.id + '" data-d="1">+1</button>' +
      '</div>';
    });
    if (watch.length) {
      out += '<div class="section-t" style="margin-top:22px"><span class="mono-label">Vigila siempre</span></div>' + watch.join('');
    }

    var ultis = [];
    view.players.forEach(function (p) {
      p.abilities.filter(function (a) { return a.ulti; }).forEach(function (a) {
        var left = a.readyAt - t;
        ultis.push('<div class="dm-cd"><span class="nm">' + esc(p.name) + ' · ' + esc(a.name) + '</span>' +
          (a.locked ? '<span class="t">espera al inicio</span>'
            : left > 0 ? '<span class="t" data-ready="' + a.readyAt + '" data-cd="' + a.cd + '">' + mmss(left) + '</span>'
            : '<span class="t ready">lista</span>') +
        '</div>');
      });
    });
    out += '<div class="section-t" style="margin-top:22px"><span class="mono-label">Ultis</span></div>' + ultis.join('');
    return out;
  }

  function dmFeed() {
    if (!view.events.length) {
      return '<p class="empty">Todo tranquilo.<br>Aquí aparecerá cada habilidad que usen.</p>';
    }
    return '<div class="section-t"><span class="mono-label">Historial</span></div>' +
      view.events.map(eventCard).join('');
  }

  function resolveBtn(e, s, label, cls) {
    return '<button class="mini' + (cls ? ' ' + cls : '') + '" data-act="dmResolve" data-e="' + e.id + '" data-s="' + s + '">' + label + '</button>';
  }

  function sextoBtn(e, step, label, cls, finder) {
    return '<button class="mini' + (cls ? ' ' + cls : '') + '" data-act="dmSexto" data-e="' + e.id + '" data-step="' + step + '"' +
      (finder ? ' data-p="' + finder + '"' : '') + '>' + esc(label) + '</button>';
  }

  function eventCard(e) {
    var running = isRunning(e);
    var acts = '';
    if (isOpen(e) && (e.kind === 'cast' || e.kind === 'passive' || e.kind === 'item')) {
      // "Recibido" solo mientras no lo haya acusado: avisa al jugador de que
      // lo tienes sin comprometerte a que ya esté aplicado.
      if (e.status === 'new' && !RUNNING[e.ability] && e.ability !== 'sexto') acts += resolveBtn(e, 'seen', 'Recibido');
      if (e.ability === 'sexto') {
        // Dos pasos: ¿está? y, si está, ¿quién lo encuentra?
        if (e.stage !== 'search') {
          acts += sextoBtn(e, 'esta', 'Está', 'good') + sextoBtn(e, 'no', 'No está', 'bad');
        } else {
          acts += view.players.map(function (p) {
            return sextoBtn(e, 'found', 'Lo encuentra ' + p.name, p.id === e.playerId ? 'good' : '', p.id);
          }).join('');
        }
      } else if (e.ability === 'ojos' && running) {
        acts += '<button class="mini bad" data-act="dmStop" data-e="' + e.id + '">Parar</button>';
      } else if (e.ability === 'taciturno') {
        acts += running
          ? resolveBtn(e, 'fail', 'Ha hablado', 'bad')
          : resolveBtn(e, 'ok', 'Aguantó · +1', 'good') + resolveBtn(e, 'fail', 'Habló', 'bad');
      } else if (e.kind === 'passive') {
        acts += resolveBtn(e, 'ok', 'Cuenta · +1', 'good') + resolveBtn(e, 'fail', 'No cuenta', 'bad');
      } else if (!RUNNING[e.ability]) {
        acts += resolveBtn(e, 'done', 'Hecho', 'good');
      }
    }
    var status = running ? 'en curso' : e.status === 'ok' ? 'confirmado' : e.status === 'fail' ? 'no'
      : e.status === 'done' ? 'resuelto' : e.status === 'seen' ? 'recibido' : '';

    var detail = '';
    if (e.ability === 'extremizar' && e.extra) {
      detail = '<div class="ev-words ' + e.extra.result + '">' + (e.extra.result === 'exito' ? 'ÉXITO' : 'PIFIA') + '</div>' +
        '<p class="ev-detail">→ ' + esc(e.detail) + '</p>';
    } else if (WORDS[e.ability]) {
      detail = '<div class="ev-words">' + esc(e.detail) + '</div>';
    } else if (e.target || e.npc) {
      detail = '<div class="ev-words">→ ' + esc(e.detail) + '</div>';
    } else if (e.kind === 'passive') {
      detail = e.detail ? '<p class="ev-detail">«' + esc(e.detail) + '»</p>' : '';
    } else if (e.detail) {
      detail = '<p class="ev-detail">' + esc(e.detail) + '</p>';
    }
    var hint = e.ability === 'sexto' && e.stage === 'search'
      ? 'Está. Tiene que buscarlo: marca quién lo encuentra y le entra en el inventario (1 uso, 3 min).'
      : e.hint;
    if (hint && (isOpen(e) || running)) detail += '<p class="ev-hint">' + esc(hint) + '</p>';
    if (e.finder) {
      var who = view.players.filter(function (p) { return p.id === e.finder; })[0];
      detail += '<p class="ev-detail">Lo encontró ' + esc(who ? who.name : e.finder) + '.</p>';
    }
    if (e.note) detail += '<p class="ev-detail">' + esc(e.note) + '</p>';

    var win = '';
    if (running) {
      win = '<div class="window-chip" data-window="' + e.windowEnds + '">quedan <b class="wt">' + mmss(e.windowEnds - now()) + '</b></div>';
    }

    return '<article class="ev ' + (running ? 'seen' : e.status) + '">' +
      '<div class="ev-top"><span class="ev-title">' + esc(e.title) + '</span>' +
      (e.public ? '<span class="ev-status">pública</span>' : '') +
      (status ? '<span class="ev-status">' + status + '</span>' : '') +
      '<span class="ev-time">' + hhmm(e.ts) + '</span></div>' +
      detail + win +
      (acts ? '<div class="ev-acts">' + acts + '</div>' : '') +
    '</article>';
  }

  // Las únicas confirmaciones que quedan: conceder un +1 permanente.
  function resolveQuestion(ev, st) {
    var who = ev && ev.title ? ev.title.split(' · ')[0] : 'El jugador';
    return {
      title: '¿Ha funcionado?',
      body: who + ' gana un +1 permanente y lo verá al momento en su ficha.',
      ok: 'Sí, +1',
    };
  }

  function dmTable() {
    return view.players.map(function (p) {
      var stats = p.stats
        ? '<div class="dm-stats">' + STAT_ORDER.map(function (k) {
            return '<div class="dm-stat">' +
              '<span class="l">' + STAT_LABELS[k] + '</span>' +
              '<span class="dm-stat-row">' +
                '<button data-act="dmStat" data-p="' + p.id + '" data-k="' + k + '" data-d="-1">−</button>' +
                '<span class="n">' + p.stats[k] + '<em>' + mod(p.stats[k]) + '</em></span>' +
                '<button data-act="dmStat" data-p="' + p.id + '" data-k="' + k + '" data-d="1">+</button>' +
              '</span></div>';
          }).join('') + '</div>'
        : '<p class="empty" style="padding:18px 0">Aún no ha repartido sus puntos.</p>';

      var cds = p.abilities.map(function (a) {
        var left = a.readyAt - now();
        return '<div class="dm-cd"><span class="nm">' + esc(a.name) + (a.ulti ? ' · ulti' : '') + '</span>' +
          (a.locked ? '<span class="t">espera al inicio</span>' : left > 0
            ? '<span class="t" data-ready="' + a.readyAt + '" data-cd="' + a.cd + '">' + mmss(left) + '</span>' +
              '<button class="mini" data-act="dmCd" data-p="' + p.id + '" data-k="' + a.key + '">Reset</button>'
            : '<span class="t ready">lista</span>') +
        '</div>';
      }).join('');

      return '<section class="pcard">' +
        '<div class="pcard-head">' +
          '<span class="id-dot" style="background:' + (p.online ? 'var(--ok)' : 'var(--dimmer)') + '"></span>' +
          '<div><div class="pcard-name">' + esc(p.name) + '</div>' +
          '<div class="pcard-sub">' + (p.claimed ? (p.online ? 'conectado' : 'ausente') : 'sin entrar') +
          (p.evolved ? ' · evolucionado' : '') +
          (p.blockedUntil > now() ? ' · bloqueado' : '') +
          (p.passive ? ' · pasiva ' + esc(p.passive) : '') + '</div></div>' +
        '</div>' +
        '<div class="pcard-body">' +
          '<div class="lucid">' +
            '<span class="lucid-n">' + p.lucidez + '</span>' +
            '<span class="lucid-lbl"><span class="mono-label">Lucidez</span><span>solo tú la ves</span></span>' +
            '<span class="lucid-btns">' +
              '<button data-act="dmLuc" data-p="' + p.id + '" data-d="-5">−5</button>' +
              '<button data-act="dmLuc" data-p="' + p.id + '" data-d="-1">−1</button>' +
              '<button data-act="dmLuc" data-p="' + p.id + '" data-d="1">+1</button>' +
              '<button data-act="dmLuc" data-p="' + p.id + '" data-d="5">+5</button>' +
            '</span>' +
          '</div>' +
          (p.bonus
            ? '<div class="lucid"><span class="lucid-n acc">+' + p.bonus.value + '</span>' +
              '<span class="lucid-lbl"><span class="mono-label">Bonus fijo</span><span>' + esc(p.bonus.from) + '</span></span>' +
              '<span class="lucid-btns">' +
                '<button data-act="dmPlus" data-p="' + p.id + '" data-d="-1">−1</button>' +
                '<button data-act="dmPlus" data-p="' + p.id + '" data-d="1">+1</button>' +
              '</span></div>'
            : '') +
          stats + cds +
          '<div class="row-acts">' +
            '<button class="mini" data-act="dmRelease" data-p="' + p.id + '">Liberar móvil</button>' +
            (p.stats ? '<button class="mini" data-act="dmResetStats" data-p="' + p.id + '">Rehacer ficha</button>' : '') +
            '<button class="mini" data-act="dmCdAll" data-p="' + p.id + '">Reset cooldowns</button>' +
          '</div>' +
        '</div>' +
      '</section>';
    }).join('');
  }

  function dmChats() {
    return chatListBody(view.chats.direct, true) + interceptedList(view.chats.intercepted);
  }

  // Chats entre otros dos jugadores, solo lectura: el DM los ve todos y quien
  // use Seguir, los que pilló mientras seguía a alguien.
  function interceptedList(list) {
    if (!list || !list.length) return '';
    return '<div class="section-t" style="margin-top:26px"><span class="mono-label">Interceptados</span></div>' +
      '<ul class="chat-list">' + list.map(function (c) {
        return '<li><button class="chat-open" data-act="openChat" data-c="' + esc(c.id) + '">' +
          '<span class="chat-av">◦◦</span>' +
          '<span class="chat-meta"><span class="chat-who">' + esc(c.label) + '</span>' +
          '<span class="chat-prev">' + esc(c.last ? c.last.text : '') + '</span></span>' +
          (c.unread ? '<span class="badge">' + c.unread + '</span>' : '') +
        '</button></li>';
      }).join('') + '</ul>';
  }

  function dmTools() {
    return '<div class="section-t"><span class="mono-label">Unirse a la partida</span></div>' +
      '<div class="qr-box" id="qr"></div>' +
      '<div class="url-box">' + esc(location.origin) + '</div>' +
      '<p class="hint" style="margin-top:12px">Que escaneen este código. Cada uno elige su personaje.</p>' +
      '<div class="sheet-acts"><button data-act="copyUrl">Copiar enlace</button></div>' +

      '<div class="section-t" style="margin-top:32px"><span class="mono-label">Anuncio a la mesa</span></div>' +
      '<div class="field"><input id="announce-input" placeholder="Todos leerán esto" /></div>' +
      '<div class="sheet-acts"><button data-act="announce">Anunciar</button></div>' +

      '<div class="section-t" style="margin-top:32px"><span class="mono-label">Peligro</span></div>' +
      '<div class="sheet-acts"><button data-act="resetGame" style="border-color:var(--acc);color:var(--acc)">Reiniciar partida</button></div>' +
      '<p class="hint" style="margin-top:10px">Borra fichas, cooldowns, avisos y chats.</p>';
  }

  var qrLoaded = false;
  function paintQR() {
    var box = document.getElementById('qr');
    if (!box || box.dataset.done) return;
    var draw = function () {
      try {
        var q = window.qrcode(0, 'M');
        q.addData(location.origin);
        q.make();
        box.innerHTML = q.createImgTag(6, 0);
        box.dataset.done = '1';
      } catch (e) { box.innerHTML = '<span style="color:#000;font-size:12px">No se pudo generar</span>'; }
    };
    if (window.qrcode) return draw();
    if (qrLoaded) return;
    qrLoaded = true;
    var s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
    s.onload = draw;
    s.onerror = function () { box.innerHTML = '<span style="color:#000;font-size:12px">Sin conexión</span>'; };
    document.head.appendChild(s);
  }

  /* -------------------------------------------------------------- modales */

  function renderModal() {
    if (!modal) { MODAL.innerHTML = ''; return; }
    var m = modal;
    var inner = '';

    if (m.type === 'info') {
      inner = '<h3>' + esc(m.title) + '</h3>' +
        '<p class="mono-label">Cómo funciona</p>' +
        '<div class="long">' + esc(m.body) + '</div>' +
        '<div class="sheet-acts"><button data-act="closeModal">Entendido</button></div>';

    } else if (m.type === 'cast') {
      var a = m.ability;
      var valid = castValid();
      var chips = function (list, act, current) {
        return '<div class="chips">' + list.map(function (o) {
          return '<button class="chip' + (current === o.id ? ' on' : '') + '" data-act="' + act + '" data-id="' + esc(o.id) + '">' + esc(o.name) + '</button>';
        }).join('') + '</div>';
      };
      var input = '';
      if (a.input === 'words' || a.input === 'word') {
        var one = a.input === 'word';
        // El "cuántas palabras" se explica en el ?; aquí solo sale si se pasa.
        input = '<div class="field"><input id="cast-words" placeholder="' + (one ? 'una palabra' : 'dos palabras') + '" autocomplete="off" value="' + esc(m.words || '') + '" /></div>' +
          '<p class="hint bad"' + (m.words && !valid ? '' : ' hidden') + '>' +
          (one ? 'Tiene que ser una sola palabra.' : 'Tienen que ser exactamente dos palabras.') + '</p>';
      } else if (a.input === 'target') {
        input = '<p class="mono-label" style="margin-top:18px">Elige a quién</p>' + chips(view.others, 'pickTarget', m.target);
      } else if (a.input === 'follow') {
        input = '<p class="mono-label" style="margin-top:18px">A quién sigues</p>' +
          chips(view.others.concat([{ id: 'npc', name: 'Un PNJ' }]), 'pickTarget', m.target) +
          (m.target === 'npc'
            ? '<div class="field"><input id="cast-npc" placeholder="¿qué PNJ?" autocomplete="off" value="' + esc(m.npc || '') + '" /></div>'
            : '');
      } else if (a.input === 'extreme') {
        input = '<p class="mono-label" style="margin-top:18px">A quién</p>' +
          chips([{ id: view.me.id, name: 'Tú' }].concat(view.others), 'pickTarget', m.target) +
          '<p class="mono-label" style="margin-top:18px">Qué tirada</p>' +
          chips([{ id: 'next', name: 'Su próxima tirada' }, { id: 'last', name: 'La que acaba de hacer' }], 'pickWhen', m.when);
      } else if (a.input === 'item') {
        input = '<p class="mono-label" style="margin-top:18px">Qué recuperas</p>' +
          chips(revivable().map(function (i) { return { id: i.id, name: i.word }; }), 'pickItem', m.item);
      }
      inner = '<h3>¿Usar ' + esc(a.name) + '?</h3>' +
        '<p class="confirm-q">' + esc(a.confirm || '') + '</p>' +
        input +
        '<div class="sheet-acts">' +
          '<button data-act="closeModal">Cancelar</button>' +
          '<button class="primary" data-act="castGo"' + (valid ? '' : ' disabled') + '>Confirmar</button>' +
        '</div>';

    } else if (m.type === 'evolve') {
      var e = view.evolution;
      inner = '<h3>' + esc(e.label) + '</h3>' +
        '<p class="mono-label" style="margin-top:14px">' + esc(e.to) + '</p>' +
        '<div class="long">' + esc(e.toLong) + '</div>' +
        '<div class="warn-box">' + esc(e.warn) + '</div>' +
        '<div class="sheet-acts">' +
          '<button data-act="closeModal">Ahora no</button>' +
          '<button class="primary" data-act="evolveGo">' + (m.armed ? 'Sí, para siempre' : 'Evolucionar') + '</button>' +
        '</div>';

    } else if (m.type === 'passive') {
      inner = '<h3>Revisar ' + esc(view.passive.name) + '</h3>' +
        '<p class="confirm-q">Le pides al DM que mire si ha pasado algo que cuente para tu pasiva.</p>' +
        '<div class="field"><input id="passive-text" placeholder="qué ha pasado (opcional)" autocomplete="off" maxlength="120" value="' + esc(m.text || '') + '" /></div>' +
        '<div class="sheet-acts">' +
          '<button data-act="closeModal">Cancelar</button>' +
          '<button class="primary" data-act="passiveGo">Avisar al DM</button>' +
        '</div>';

    } else if (m.type === 'confirm') {
      inner = '<h3>' + esc(m.title) + '</h3>' +
        '<p class="confirm-q">' + esc(m.body) + '</p>' +
        '<div class="sheet-acts">' +
          '<button data-act="closeModal">Cancelar</button>' +
          '<button class="primary" data-act="confirmGo">' + esc(m.ok || 'Confirmar') + '</button>' +
        '</div>';
    }

    MODAL.innerHTML = '<div class="overlay" data-act="overlay"><div class="sheet">' +
      '<div class="sheet-grab"></div>' + inner + '</div></div>';
  }

  function castValid() {
    if (!modal || modal.type !== 'cast') return false;
    var a = modal.ability;
    var w = String(modal.words || '').trim().split(/\s+/).filter(Boolean);
    if (a.input === 'words') return w.length === 2 && w.join(' ').length <= 40;
    if (a.input === 'word') return w.length === 1 && w[0].length <= 24;
    if (a.input === 'target') return !!modal.target;
    if (a.input === 'follow') return !!modal.target && (modal.target !== 'npc' || !!String(modal.npc || '').trim());
    if (a.input === 'extreme') return !!modal.target && !!modal.when;
    if (a.input === 'item') return !!modal.item;
    return true;
  }

  /* --------------------------------------------------------------- ticker */

  function tick() {
    var t = now();
    var expired = false;

    var cds = document.querySelectorAll('.cd[data-ready]');
    for (var i = 0; i < cds.length; i++) {
      var el = cds[i];
      var ready = Number(el.dataset.ready), cd = Number(el.dataset.cd) * 1000;
      var left = ready - t;
      if (left <= 0) { expired = true; continue; }
      var f = el.querySelector('.cd-fill');
      if (f) f.style.width = Math.max(0, Math.min(100, (1 - left / cd) * 100)) + '%';
      var tt = el.querySelector('.cd-time');
      if (tt) tt.textContent = mmss(left);
    }

    var plain = document.querySelectorAll('.t[data-ready]');
    for (var j = 0; j < plain.length; j++) {
      var e2 = plain[j], l2 = Number(e2.dataset.ready) - t;
      if (l2 <= 0) { expired = true; continue; }
      e2.textContent = mmss(l2);
    }

    var wins = document.querySelectorAll('[data-window]');
    for (var k = 0; k < wins.length; k++) {
      var w = wins[k], lw = Number(w.dataset.window) - t;
      var b = w.querySelector('.wt') || w.querySelector('b');
      if (lw <= 0) { expired = true; continue; }
      if (b) b.textContent = mmss(lw);
    }

    // Taciturno cumplido: el DM tiene que enterarse aunque esté en otra pestaña.
    if (view && view.role === 'dm') {
      view.events.forEach(function (e) {
        if (e.ability !== 'taciturno' || !isOpen(e) || e.windowEnds > t || alerted[e.id]) return;
        alerted[e.id] = true;
        buzz([40, 80, 40, 80, 40]);
        toast('Gonzalo lleva 10 min callado: ¿le das el +1?');
        flash();
        expired = true;
      });
    }

    if (expired && !needsRender) { needsRender = true; setTimeout(function () { needsRender = false; render(); }, 60); }
    if (tab === 'tools') paintQR();
  }
  setInterval(tick, 250);

  /* --------------------------------------------------------------- acciones */

  function closeModal() { modal = null; renderModal(); }

  document.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-act]');
    if (!el) return;
    var act = el.dataset.act;

    /* --- entrada --- */
    if (act === 'pick') {
      var id = el.dataset.id;
      if (id === 'dm') { screen = 'pin'; pinBuf = ''; render(); return; }
      var tk = makeToken();
      post({ op: 'join', as: id, token: tk, withView: false }).then(function () {
        S = { as: id, token: tk }; saveSession(); screen = 'app'; tab = 'hab';
        startPolling(); return refresh();
      }).catch(function (e) { toast(e.message, true); loadLobby(); });
      return;
    }

    if (act === 'pin') {
      var k = el.dataset.k;
      if (k === 'volver') { screen = 'lock'; pinBuf = ''; render(); return; }
      if (k === 'borrar') { pinBuf = pinBuf.slice(0, -1); render(); return; }
      if (pinBuf.length >= 4) return;
      pinBuf += k;
      render();
      if (pinBuf.length === 4) {
        var tok = makeToken(), pass = pinBuf;
        post({ op: 'join', as: 'dm', token: tok, pass: pass, withView: false }).then(function () {
          S = { as: 'dm', token: tok }; saveSession(); screen = 'app'; tab = 'ahora';
          startPolling(); return refresh();
        }).catch(function (e) {
          pinBuf = ''; buzz([60, 40, 60]); toast(e.message, true); render();
        });
      }
      return;
    }

    /* --- reparto --- */
    if (act === 'alloc') {
      var key = el.dataset.k, d = Number(el.dataset.d);
      var r = view.rules, used = 0;
      STAT_ORDER.forEach(function (s) { used += allocDraft[s]; });
      var nv = allocDraft[key] + d;
      if (nv < r.MIN_STAT || nv > r.MAX_STAT) return;
      if (d > 0 && used >= view.me.points) return;
      allocDraft[key] = nv;
      render();
      return;
    }
    if (act === 'allocRandom') {
      allocDraft = randomStats(view.rules, view.me.points);
      buzz(18);
      render();
      return;
    }
    if (act === 'allocSave') {
      post({ op: 'setStats', stats: allocDraft }).then(function (res) {
        allocDraft = null; toast('Ficha cerrada.'); absorb(res.view);
      }).catch(fail);
      return;
    }

    /* --- navegación --- */
    if (act === 'tab') { tab = el.dataset.t; openChat = null; render(); return; }
    if (act === 'backChat') { openChat = null; render(); return; }
    if (act === 'openChat') {
      // Abrir es un cambio local: pinta ya y marca leído de fondo. Si se
      // esperase a absorb(), un chat sin mensajes nuevos no cambiaría la vista
      // del servidor y no llegaría a abrirse nunca.
      openChat = el.dataset.c;
      render();
      scrollThread();
      post({ op: 'read', chat: openChat }).then(function (r) { absorb(r.view); }).catch(function () {});
      return;
    }
    if (act === 'logout') {
      modal = { type: 'confirm', title: '¿Salir?', body: 'Volverás a la pantalla de entrada. Tu personaje seguirá ocupado hasta que el DM lo libere.', ok: 'Salir', go: function () {
        clearSession(); view = null; openChat = null; tab = null; screen = 'lock';
        closeModal(); loadLobby();
      } };
      renderModal();
      return;
    }

    /* --- habilidades --- */
    if (act === 'info') {
      var a = view.abilities.filter(function (x) { return x.key === el.dataset.k; })[0];
      if (a) { modal = { type: 'info', title: a.name, body: a.long }; renderModal(); }
      return;
    }
    if (act === 'infoPassive') {
      if (view.passive) { modal = { type: 'info', title: view.passive.name, body: view.passive.long }; renderModal(); }
      return;
    }
    if (act === 'cast') {
      var ab = view.abilities.filter(function (x) { return x.key === el.dataset.k; })[0];
      if (!ab) return;
      modal = { type: 'cast', ability: ab, words: '', target: null, npc: '', when: 'next', item: null };
      renderModal();
      return;
    }
    if (act === 'pickTarget') { modal.target = el.dataset.id; renderModal(); return; }
    if (act === 'pickWhen') { modal.when = el.dataset.id; renderModal(); return; }
    if (act === 'pickItem') { modal.item = el.dataset.id; renderModal(); return; }
    if (act === 'castGo') {
      if (!castValid()) return;
      var inp = modal.ability.input;
      var body = { op: 'cast', ability: modal.ability.key };
      if (inp === 'words' || inp === 'word') body.words = modal.words;
      if (inp === 'target' || inp === 'extreme' || (inp === 'follow' && modal.target !== 'npc')) body.target = modal.target;
      if (inp === 'follow' && modal.target === 'npc') body.npc = modal.npc;
      if (inp === 'extreme') body.when = modal.when;
      if (inp === 'item') body.item = modal.item;
      var nm = modal.ability.name;
      closeModal();
      post(body).then(function (res) { buzz(40); toast(nm + ' enviada al DM.'); absorb(res.view); }).catch(fail);
      return;
    }
    if (act === 'taciBreak') {
      post({ op: 'taciturnoBreak' }).then(function (res) { toast('Cortado. Vuelve a empezar cuando quieras.'); absorb(res.view); }).catch(fail);
      return;
    }
    if (act === 'useItem') {
      var itemId = el.dataset.i;
      var it = (view.me.items || []).filter(function (x) { return x.id === itemId; })[0];
      if (!it) return;
      modal = { type: 'confirm', title: '¿Usar «' + it.word + '»?', body: 'Solo tiene un uso. El DM recibirá el aviso.', ok: 'Usar', go: function () {
        closeModal();
        post({ op: 'useItem', item: itemId }).then(function (res) { buzz(40); toast('Usado. El DM ya lo sabe.'); absorb(res.view); }).catch(fail);
      } };
      renderModal();
      return;
    }
    if (act === 'passiveCheck') { modal = { type: 'passive', text: '' }; renderModal(); return; }
    if (act === 'passiveGo') {
      var ptxt = modal.text || '';
      closeModal();
      post({ op: 'passiveCheck', text: ptxt }).then(function (res) { buzz(40); toast('El DM revisará tu pasiva.'); absorb(res.view); }).catch(fail);
      return;
    }
    if (act === 'evolveInfo') { modal = { type: 'evolve', armed: false }; renderModal(); return; }
    if (act === 'evolveGo') {
      if (!modal.armed) { modal.armed = true; renderModal(); buzz(30); return; }
      closeModal();
      post({ op: 'evolve' }).then(function (res) { toast('No hay vuelta atrás.'); absorb(res.view); }).catch(fail);
      return;
    }

    /* --- chat --- */
    if (act === 'send') {
      var input = document.getElementById('composer-input');
      if (!input) return;
      var text = input.value.trim();
      if (!text) return;
      var c = findChat(openChat);
      if (!c || !c.withId) return;
      input.value = '';
      input.style.height = 'auto';
      post({ op: 'send', to: c.withId, text: text }).then(function (res) { absorb(res.view); scrollThread(); }).catch(fail);
      return;
    }

    /* --- DM --- */
    if (act === 'dmLuc') {
      post({ op: 'dmLucidez', playerId: el.dataset.p, delta: Number(el.dataset.d) })
        .then(function (r) { buzz(12); absorb(r.view); }).catch(fail);
      return;
    }
    if (act === 'dmStat') {
      post({ op: 'dmStat', playerId: el.dataset.p, stat: el.dataset.k, delta: Number(el.dataset.d) })
        .then(function (r) { absorb(r.view); }).catch(fail);
      return;
    }
    if (act === 'dmPlus') {
      post({ op: 'dmPlusOne', playerId: el.dataset.p, delta: Number(el.dataset.d) })
        .then(function (r) { buzz(12); absorb(r.view); }).catch(fail);
      return;
    }
    if (act === 'dmResolve') {
      var evId = el.dataset.e, evSt = el.dataset.s;
      var ev = view.events.filter(function (x) { return x.id === evId; })[0];
      var send = function () {
        post({ op: 'dmResolve', eventId: evId, status: evSt })
          .then(function (r) {
            buzz(12);
            toast(evSt === 'seen' ? 'El jugador ya sabe que lo tienes.' : 'Avisado al jugador.');
            absorb(r.view);
          }).catch(fail);
      };
      // Lo único que se confirma es el +1 permanente, porque cambia la ficha.
      // El resto son acuses de recibo: van directos.
      if (ev && evSt === 'ok' && (ev.ability === 'taciturno' || ev.kind === 'passive')) {
        var q = resolveQuestion(ev, evSt);
        modal = { type: 'confirm', title: q.title, body: q.body, ok: q.ok, go: function () { closeModal(); send(); } };
        renderModal();
        return;
      }
      send();
      return;
    }
    if (act === 'dmSexto') {
      post({ op: 'dmSexto', eventId: el.dataset.e, step: el.dataset.step, finder: el.dataset.p })
        .then(function (r) { buzz(12); toast('Avisado.'); absorb(r.view); }).catch(fail);
      return;
    }
    if (act === 'dmStop') {
      post({ op: 'dmStop', eventId: el.dataset.e })
        .then(function (r) { buzz(12); toast('Parado. Ya no tiene que ser verdad.'); absorb(r.view); }).catch(fail);
      return;
    }
    if (act === 'dmUnblock') {
      post({ op: 'dmUnblock', playerId: el.dataset.p })
        .then(function (r) { toast('Desbloqueado.'); absorb(r.view); }).catch(fail);
      return;
    }
    if (act === 'dmStart') {
      modal = { type: 'confirm', title: 'Empezar la partida', body: 'Arranca ya aunque falte alguien. Las ultis empiezan a contar una hora desde ahora.', ok: 'Empezar', go: function () {
        closeModal();
        post({ op: 'dmStart' }).then(function (r) { toast('Partida en marcha.'); absorb(r.view); }).catch(fail);
      } };
      renderModal();
      return;
    }
    if (act === 'dmCd') {
      post({ op: 'dmCooldown', playerId: el.dataset.p, ability: el.dataset.k, readyAt: 0 })
        .then(function (r) { absorb(r.view); }).catch(fail);
      return;
    }
    if (act === 'dmCdAll') {
      post({ op: 'dmCooldown', playerId: el.dataset.p, ability: '*' }).then(function (r) { absorb(r.view); }).catch(fail);
      return;
    }
    if (act === 'dmRelease') {
      var pid = el.dataset.p;
      modal = { type: 'confirm', title: 'Liberar móvil', body: 'Ese personaje quedará libre y podrá entrar desde otro móvil. Su ficha, cooldowns y chats se mantienen.', ok: 'Liberar', go: function () {
        closeModal();
        post({ op: 'dmRelease', playerId: pid }).then(function (r) { toast('Liberado.'); absorb(r.view); }).catch(fail);
      } };
      renderModal();
      return;
    }
    if (act === 'dmResetStats') {
      var pid2 = el.dataset.p;
      modal = { type: 'confirm', title: 'Rehacer ficha', body: 'Volverá a repartir sus puntos desde cero.', ok: 'Rehacer', go: function () {
        closeModal();
        post({ op: 'dmResetStats', playerId: pid2 }).then(function (r) { absorb(r.view); }).catch(fail);
      } };
      renderModal();
      return;
    }
    if (act === 'announce') {
      var ai = document.getElementById('announce-input');
      if (!ai || !ai.value.trim()) return;
      var txt = ai.value.trim();
      ai.value = '';
      post({ op: 'dmAnnounce', text: txt }).then(function (r) { toast('Anunciado.'); absorb(r.view); }).catch(fail);
      return;
    }
    if (act === 'copyUrl') {
      try {
        navigator.clipboard.writeText(location.origin);
        toast('Enlace copiado.');
      } catch (e) { toast(location.origin); }
      return;
    }
    if (act === 'resetGame') {
      modal = { type: 'confirm', title: 'Reiniciar partida', body: 'Se borra TODO: fichas, lucidez, cooldowns, avisos y chats. No se puede deshacer.', ok: 'Borrar todo', go: function () {
        closeModal();
        post({ op: 'dmReset' }).then(function () { toast('Partida reiniciada.'); lastEventId = null; return refresh(); }).catch(fail);
      } };
      renderModal();
      return;
    }

    /* --- modales --- */
    if (act === 'confirmGo') { if (modal && modal.go) modal.go(); return; }
    if (act === 'closeModal') { closeModal(); return; }
    if (act === 'overlay' && ev.target === el) { closeModal(); return; }
  });

  document.addEventListener('input', function (ev) {
    var el = ev.target;
    if (el.id === 'cast-words' && modal && modal.type === 'cast') {
      modal.words = el.value;
      var btn = MODAL.querySelector('[data-act="castGo"]');
      var hint = MODAL.querySelector('.hint');
      if (btn) btn.disabled = !castValid();
      if (hint) hint.hidden = !(el.value && !castValid());
      return;
    }
    if (el.id === 'cast-npc' && modal && modal.type === 'cast') {
      modal.npc = el.value;
      var btn2 = MODAL.querySelector('[data-act="castGo"]');
      if (btn2) btn2.disabled = !castValid();
      return;
    }
    if (el.id === 'passive-text' && modal && modal.type === 'passive') { modal.text = el.value; return; }
    if (el.id === 'composer-input') {
      el.style.height = 'auto';
      el.style.height = Math.min(120, el.scrollHeight) + 'px';
    }
  });

  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter' && !ev.shiftKey && ev.target.id === 'composer-input') {
      ev.preventDefault();
      var b = document.querySelector('[data-act="send"]');
      if (b) b.click();
    }
  });

  /* ---------------------------------------------------------------- inicio */

  if (S.as && S.token) {
    screen = 'app';
    tab = S.as === 'dm' ? 'ahora' : 'hab';
    renderBoot();
    startPolling();
    refresh();
  } else {
    renderBoot();
    loadLobby();
  }
})();
