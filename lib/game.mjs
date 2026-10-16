// ---------------------------------------------------------------------------
// Núcleo de reglas del one-shot. Sin dependencias: lo usan tanto la función de
// Netlify como el servidor de desarrollo local.
// ---------------------------------------------------------------------------

// En el despliegue se cambia con la variable de entorno DM_PASS: el repo es
// visible y la clave no debería estar escrita en él.
export const DM_PASS = (typeof process !== 'undefined' && process.env && process.env.DM_PASS) || '5441';

export const RULES = { MIN_STAT: 5, MAX_STAT: 20, TOTAL_POINTS: 70, LUCIDEZ_INICIAL: 50 };

// Quien empieza con menos puntos que el resto.
const POINTS = { kekio: 60 };
const pointsFor = pid => POINTS[pid] || RULES.TOTAL_POINTS;

export const STATS = [
  { key: 'fuerza',       label: 'Fuerza' },
  { key: 'destreza',     label: 'Destreza' },
  { key: 'inteligencia', label: 'Inteligencia' },
  { key: 'constitucion', label: 'Constitución' },
  { key: 'carisma',      label: 'Carisma' },
  { key: 'arcano',       label: 'Arcano' },
];

export const PLAYER_IDS = ['kekio', 'tomas', 'gonzalo', 'marina'];

export const PLAYERS = {
  kekio:   { name: 'Kekio',   tag: 'Leñador' },
  tomas:   { name: 'Tomás',   tag: 'Bibliotecario' },
  gonzalo: { name: 'Gonzalo', tag: 'Investigador' },
  marina:  { name: 'Marina',  tag: 'Inocencia' },
};

const MIN = 60;
const ITEM_LIFE = 3 * MIN;   // lo que dura un objeto encontrado sin usarse
const BLOCK_TIME = 5 * MIN;  // Silencio, por favor

// input: null | 'words' (2 palabras) | 'word' (1 palabra) | 'target' (otro
// jugador) | 'follow' (jugador o PNJ) | 'extreme' (jugador + qué tirada) |
// 'item' (un objeto de la mochila de Tomás)
//
// public: se anuncia a la mesa. auto: se aplica sola y el aviso del DM llega ya
// resuelto. ulti: bloqueada hasta que empieza la partida y, desde ahí, arranca
// con su cooldown entero. hint: lo que el DM lee en el aviso. done: lo que lee
// el jugador cuando el DM la marca como hecha.
export const ABILITIES = {
  kekio: {
    senuelo: {
      name: 'Señuelo',
      cd: 20 * MIN,
      input: 'words',
      stage: 'base',
      short: 'El DM crea una ilusión en un sitio concreto. Se ve, pero no es real.',
      long: 'Escribes exactamente dos palabras y el DM monta con ellas una ilusión en un lugar concreto de la escena.\n\nEs secreta: para la mesa, lo que aparece es simplemente lo que hay. Pero NUNCA es real: solo el DM y tú lo sabéis.\n\nAl ser falsa, nadie puede interactuar de verdad con ella: se puede ver y oír, pero no tocar, coger, usar ni atravesar como si existiera. Si alguien lo intenta, simplemente no funciona.\n\nCada vez que alguien actúe creyéndose uno de tus señuelos, tu pasiva Instinto de leñador te da +1.\n\nCooldown: 20 minutos.',
      confirm: 'El DM recibirá tus dos palabras y montará la ilusión.',
      hint: 'Ilusión secreta en un sitio concreto. NO es real: se ve, pero nadie puede interactuar con ella. Si alguien actúa creyéndosela, Kekio gana +1.',
      done: 'El DM ya ha montado tu señuelo',
    },
    espantapajaros: {
      name: 'Espantapájaros',
      cd: 10 * MIN,
      input: 'words',
      stage: 'evolved',
      public: true,
      announce: 'Kekio ha hecho aparecer algo real.',
      short: 'Lo que invocas es REAL: se puede tocar y usar. Todos sabrán que has sido tú.',
      long: 'Escribes dos palabras y lo que invocas existe de verdad: una entidad, un objeto, un elemento del mundo.\n\nA diferencia del Señuelo, aquí sí se puede interactuar: se puede tocar, coger, usar, bloquea el paso y hace daño si tiene que hacerlo. Para la partida es tan real como cualquier otra cosa.\n\nLa contrapartida es que deja de ser secreto: la mesa sabrá que has sido tú.\n\nCooldown: 10 minutos.',
      confirm: 'Esto es público: la mesa sabrá que has hecho aparecer algo.',
      hint: 'Es REAL: se puede interactuar con ello. La mesa ya sabe que ha sido Kekio.',
      done: 'El DM ya lo ha hecho aparecer',
    },
    talar: {
      name: 'Talar el paso',
      cd: 60 * MIN,
      ulti: true,
      input: null,
      public: true,
      announce: 'Kekio ha talado el paso.',
      short: 'Abres o cierras un camino de la escena. El DM tiene que respetarlo.',
      long: 'Pulsa la habilidad y di en voz alta qué camino abres o cierras: derribas una puerta, tiras un árbol que corta el paso, cortas un puente…\n\nEl DM está obligado a respetarlo.\n\nEs público: la mesa verá que has sido tú, así que no hace falta escribir nada.\n\nUlti: se desbloquea una hora después de empezar la partida. Cooldown: 1 hora.',
      confirm: 'Esto es público. Después dile en voz alta al DM qué camino abres o cierras.',
      hint: 'Te dirá en voz alta qué camino abre o cierra. Tienes que respetarlo. La mesa ya lo sabe.',
      done: 'El DM ya ha cambiado el camino',
    },
  },
  tomas: {
    sexto: {
      name: 'Sexto Sentido',
      cd: 10 * MIN,
      input: 'word',
      short: 'Notas si lo que buscas está cerca. Si está, tienes que encontrarlo antes que nadie.',
      long: 'Escribe UNA palabra con lo que buscas ("llave", "cuerda", "linterna").\n\nEl DM te dirá si está. Si está, hay algo así a 20 metros o menos y tienes que ir a buscarlo. Si no existía, tu suerte hace que aparezca igual.\n\nCuando lo encuentres, entra en tu inventario. Pero si otro lo encuentra antes que tú, se lo queda él.\n\nEl objeto tiene UN solo uso. Si no lo usas en 3 minutos de juego desde que entra en el inventario, desaparece.\n\nCuando lo uses, púlsalo en tu inventario para que el DM lo sepa.\n\nCooldown: 10 minutos.',
      confirm: 'El DM recibirá tu palabra y te dirá si está.',
      hint: '¿Está? Si dices que sí, está a 20 m o menos (si no existía, aparece). Luego marca quién lo encuentra: entra en su inventario con 1 uso y 3 min.',
      done: 'Hecho',
    },
    porsiacaso: {
      name: 'Por si acaso',
      cd: 15 * MIN,
      input: 'item',
      auto: true,
      short: 'Recuperas algo que ya encontraste. Vuelve con 1 uso y 3 minutos.',
      long: 'Saca de la mochila algo que ya encontraste con Sexto Sentido, aunque ya lo usaras o hubiera desaparecido.\n\nVuelve con un uso más y otros 3 minutos para usarlo. Cada objeto solo se puede recuperar una vez.\n\nNo hace falta esperar al DM: aparece en tu inventario al momento.\n\nCooldown: 15 minutos.',
      confirm: 'El objeto vuelve a tu inventario con 1 uso y 3 minutos.',
      hint: 'Automático: ya lo tiene otra vez en el inventario (1 uso, 3 min).',
      done: 'Recuperado · tienes 3 min para usarlo',
    },
    silencio: {
      name: 'Silencio, por favor',
      cd: 60 * MIN,
      ulti: true,
      input: 'target',
      auto: true,
      short: 'Bloqueas las habilidades de un jugador durante 5 minutos. No sabrá que has sido tú.',
      long: 'Eliges a un jugador y sus habilidades quedan bloqueadas durante 5 minutos.\n\nSabrá que otro jugador se las ha bloqueado, pero no quién ni cuánto le queda.\n\nUlti: se desbloquea una hora después de empezar la partida. Cooldown: 1 hora.',
      confirm: 'Sus habilidades quedarán bloqueadas 5 minutos. No sabrá que has sido tú.',
      hint: 'Automático: ya está bloqueado 5 min. No le digas quién ha sido.',
      done: 'Hecho · bloqueado 5 minutos',
    },
  },
  gonzalo: {
    seguir: {
      name: 'Seguir',
      cd: 12 * MIN,
      window: 5 * MIN,
      input: 'follow',
      short: 'Sigues a alguien 5 minutos: ves qué habilidades usa y lees sus mensajes privados.',
      long: 'Eliges a un jugador o a un PNJ y le sigues durante 5 minutos.\n\nSi es un jugador:\n· Cada habilidad que use en ese rato te llega al momento por el chat del DM. Solo el nombre: no sabrás qué ha escrito ni en qué consiste.\n· Puedes leer los mensajes privados que mande o reciba de otros jugadores en ese rato. Los verás en Mensajes, en "Interceptados", y se te quedan.\n· Lo que haga a escondidas fuera de la app te lo cuenta el DM.\n\nSi es un PNJ, el DM te cuenta en privado lo que hace.\n\nCooldown: 12 minutos.',
      confirm: 'Durante 5 minutos verás qué habilidades usa y leerás sus mensajes privados.',
      hint: 'Durante 5 min, cuéntale por privado lo que haga a escondidas. Las habilidades que use y sus mensajes con otros jugadores le llegan solos.',
      done: 'El DM lo tiene en cuenta',
    },
    taciturno: {
      name: 'Taciturno',
      cd: 5 * MIN,     // cuenta desde que termina el silencio, no desde que empieza
      window: 10 * MIN,
      input: null,
      short: 'Púlsala cuando empieces a callarte. Si aguantas 10 min sin hablar en voz alta, +1 permanente.',
      long: 'Púlsala en el momento en que empiezas a estar callado.\n\nSi aguantas 10 minutos sin hablar en voz alta (el chat de la app sí vale), el DM te confirma un +1 permanente.\n\nSi hablas, se corta: pulsa "He hablado".\n\nCooldown: 5 minutos desde que termina el silencio, tanto si aguantas como si se corta.',
      confirm: 'Empiezan 10 minutos de silencio. Si hablas en voz alta, se corta.',
      hint: '10 min sin hablar en voz alta (el chat sí vale). Si habla, pulsa "Ha hablado". La app te avisa al cumplirse.',
      done: 'Hecho',
    },
    pista: {
      name: 'Pista falsa',
      cd: 60 * MIN,
      ulti: true,
      input: 'words',
      short: 'El DM cuela tu mentira en su próxima explicación a la mesa.',
      long: 'Escribe dos palabras y el DM las usará para engañar a la mesa la próxima vez que explique o narre algo que ha pasado.\n\nEs secreta: nadie sabrá que la mentira viene de ti.\n\nUlti: se desbloquea una hora después de empezar la partida. Cooldown: 1 hora.',
      confirm: 'El DM meterá tu mentira en su próxima explicación.',
      hint: 'En tu PRÓXIMA explicación o narración de algo que ha pasado, engaña a la mesa con esto.',
      done: 'El DM ya ha colado tu mentira',
    },
  },
  marina: {
    ojos: {
      name: 'Ojos limpios',
      cd: 10 * MIN,
      window: 3 * MIN,
      input: null,
      short: 'Durante un rato, el DM responde con la verdad a lo que TÚ preguntes.',
      long: 'Durante hasta 3 minutos ves las cosas como son.\n\nOjo: solo funciona con lo que TÚ preguntes. Pregúntale al DM (en voz alta o por chat) qué hay de verdad en algo y te responderá con la verdad. Lo que pregunten los demás no cuenta.\n\nSolo cambia lo que ves tú: los demás siguen viendo lo mismo, a no ser que se lo cuentes. Contra lo que es real no hay nada que destapar.\n\nEl DM puede darla por terminada antes si ya has preguntado suficiente.\n\nCooldown: 10 minutos.',
      confirm: 'Durante 3 minutos, SOLO lo que tú preguntes se responde con la verdad.',
      hint: 'Responde con la verdad SOLO a lo que pregunte Marina. Las ilusiones no le afectan (Espantapájaros sí, es real). Cuando ya sea suficiente, pulsa "Parar".',
      done: 'Hecho',
    },
    extremizar: {
      name: 'Extremizar',
      cd: 15 * MIN,
      input: 'extreme',
      short: 'Eliges a un jugador: su tirada será éxito o pifia, al 50%.',
      long: 'Eliges a un jugador (tú también vales) y si va sobre su próxima tirada o sobre la que acaba de hacer.\n\nEsa tirada será un éxito o una pifia, sin término medio. La moneda la lanza la app y solo el DM ve el resultado.\n\nCooldown: 15 minutos.',
      confirm: 'La app lanzará la moneda. Solo el DM verá si es éxito o pifia.',
      hint: 'La app ya ha lanzado la moneda. Aplica este resultado a esa tirada.',
      done: 'El DM ya lo ha aplicado',
    },
    ojitos: {
      name: 'Hacer ojitos',
      cd: 60 * MIN,
      ulti: true,
      input: 'words',
      public: true,
      announce: 'Marina le ha hecho ojitos a alguien.',
      short: 'Le pides algo a un PNJ y no puede negarse.',
      long: 'Escribe dos palabras con lo que le pides a un PNJ ("abre puerta", "dame llave"). Puedes pedir lo que sea.\n\nEl PNJ no puede negarse. Pero que te obedezca no quiere decir que salga como esperas: lo hará a su manera.\n\nEs público: la mesa verá que has sido tú.\n\nUlti: se desbloquea una hora después de empezar la partida. Cooldown: 1 hora.',
      confirm: 'Esto es público. El PNJ no puede negarse, pero lo hará a su manera.',
      hint: 'El PNJ no puede negarse, pero no tiene por qué salir bien: cúmplelo a su manera. La mesa ya lo sabe.',
      done: 'El DM ya lo ha aplicado',
    },
  },
};

// Pasivas: siempre encendidas. El jugador puede pedir que el DM la revise y el
// DM concede el +1 desde el aviso o desde Ahora.
export const PASSIVES = {
  kekio: {
    name: 'Instinto de leñador',
    lostOnEvolve: true,
    short: '+1 permanente cada vez que alguien actúa creyéndose uno de tus señuelos.',
    long: 'No se activa: está siempre encendida y no tiene cooldown.\n\nCada vez que alguien (un PNJ o un jugador) actúe creyéndose uno de tus señuelos, ganas un +1 permanente que se acumula toda la partida.\n\nSi ves que ha pasado, pulsa "Revisar pasiva" y el DM lo comprobará.\n\nSe pierde si evolucionas a Espantapájaros. Los +1 que ya tengas se quedan.',
    watch: '+1 cada vez que alguien actúe creyéndose un señuelo de Kekio.',
  },
};

// Quién acumula +1 permanentes y de dónde le vienen.
export const BONUSES = {
  kekio: 'de Instinto de leñador',
  gonzalo: 'de Taciturno',
};

// Evoluciones permanentes (base -> evolved)
export const EVOLUTIONS = {
  kekio: {
    from: 'senuelo', to: 'espantapajaros',
    label: 'Mejorar Señuelo a Espantapájaros',
    warn: 'Perderás Señuelo y tu pasiva Instinto de leñador PARA SIEMPRE (los +1 que tengas se quedan). A cambio, lo que invoques será real: los demás podrán tocarlo, usarlo y chocar con ello. El cooldown baja a 10 minutos. No hay vuelta atrás.',
  },
};

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------

const STATE_VERSION = 2;

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

function newPlayer(id) {
  return {
    id,
    claimed: false,
    token: null,
    lastSeen: 0,
    stats: null,          // null hasta que reparte los 70 puntos
    lucidez: RULES.LUCIDEZ_INICIAL,
    evolved: false,
    plusOnes: 0,          // solo quien tenga BONUSES
    cooldowns: {},        // abilityKey -> epoch ms en que vuelve a estar lista
    blockedUntil: 0,      // Silencio, por favor
    items: [],            // lo que ha encontrado: [{id, word, foundAt, expiresAt, usedAt, revived}]
  };
}

export function newState(now = Date.now()) {
  const players = {};
  for (const id of PLAYER_IDS) players[id] = newPlayer(id);
  return {
    v: STATE_VERSION,
    createdAt: now,
    startedAt: null,  // se fija cuando los cuatro tienen ficha (o el DM la arranca)
    dmToken: null,
    dmLastSeen: 0,
    players,
    events: [],   // feed del DM
    public: [],   // anuncios visibles por todos
    chats: {},    // chatId -> [{id, ts, from, text}]
    reads: {},    // `${viewer}:${chatId}` -> ts
  };
}

// Un estado guardado con los personajes de antes no sirve: se rehace entero
// conservando solo la sesión del DM.
function migrate(state) {
  if (state.v === STATE_VERSION && state.players && PLAYER_IDS.every(id => state.players[id])) return;
  const fresh = newState();
  fresh.dmToken = state.dmToken || null;
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, fresh);
}

export const chatId = (a, b) => [a, b].sort().join('|');

export function activeAbilities(state, pid) {
  const defs = ABILITIES[pid] || {};
  const evolved = !!(state.players[pid] && state.players[pid].evolved);
  return Object.entries(defs).filter(([, d]) => {
    if (!d.stage) return true;
    return evolved ? d.stage === 'evolved' : d.stage === 'base';
  });
}

function passiveFor(state, pid) {
  const def = PASSIVES[pid];
  if (!def) return null;
  if (def.lostOnEvolve && state.players[pid].evolved) return null;
  return def;
}

// Última ventana abierta de una habilidad (Seguir, Taciturno, Ojos limpios).
function activeWindow(state, pid, key, now) {
  return state.events.find(e =>
    e.playerId === pid && e.ability === key && e.windowEnds > now && e.status !== 'fail') || null;
}

// Cierra una ventana antes de tiempo. Taciturno empieza ahí su cooldown.
function endWindow(state, ev, now) {
  if (!(ev.windowEnds > now)) return;
  ev.windowEnds = now;
  if (ev.ability === 'taciturno') {
    state.players[ev.playerId].cooldowns.taciturno = now + ABILITIES[ev.playerId].taciturno.cd * 1000;
  }
}

function itemState(item, now) {
  if (item.usedAt) return 'used';
  return item.expiresAt > now ? 'active' : 'expired';
}

function pushEvent(state, ev) {
  const full = Object.assign({ id: uid(), status: 'new', note: '' }, ev);
  state.events.unshift(full);
  if (state.events.length > 300) state.events.length = 300;
  return full;
}

function announce(state, text, now) {
  state.public.unshift({ id: uid(), ts: now, text });
  if (state.public.length > 60) state.public.length = 60;
}

function dmSays(state, to, text, now) {
  const cid = chatId('dm', to);
  if (!state.chats[cid]) state.chats[cid] = [];
  state.chats[cid].push({ id: uid(), ts: now, from: 'dm', text });
}

// Seguir: lo que haga el seguido en la app le llega a Gonzalo sin que el DM
// tenga que escribir nada.
function tellFollowers(state, who, what, now) {
  const follows = state.events.filter(e => e.ability === 'seguir' && e.target === who && e.windowEnds > now);
  const told = {};
  for (const f of follows) {
    if (told[f.playerId]) continue;
    told[f.playerId] = true;
    dmSays(state, f.playerId, '🔎 Seguir · ' + PLAYERS[who].name + ' ' + what, now);
  }
}

function startGame(state, now) {
  state.startedAt = now;
  for (const pid of PLAYER_IDS) {
    const p = state.players[pid];
    for (const [key, def] of Object.entries(ABILITIES[pid])) {
      if (def.ulti) p.cooldowns[key] = Math.max(p.cooldowns[key] || 0, now + def.cd * 1000);
    }
  }
  announce(state, 'Empieza la partida.', now);
  pushEvent(state, {
    ts: now, kind: 'system', status: 'done',
    title: 'Empieza la partida',
    detail: 'Las ultis se desbloquean dentro de una hora.',
  });
}

function maybeStart(state, now) {
  if (state.startedAt) return;
  if (PLAYER_IDS.every(id => state.players[id].claimed && state.players[id].stats)) startGame(state, now);
}

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

export class Fail extends Error {
  constructor(msg, code = 400) { super(msg); this.code = code; }
}

function requirePlayer(state, as, token) {
  // 401 y no 400: un móvil con la sesión de un personaje que ya no existe
  // tiene que volver a la pantalla de entrada, no quedarse "sin conexión".
  if (!PLAYER_IDS.includes(as)) throw new Fail('Identidad desconocida.', 401);
  const p = state.players[as];
  if (!p.claimed || p.token !== token) throw new Fail('Sesión caducada. Vuelve a entrar.', 401);
  return p;
}

function requireDM(state, token) {
  if (!state.dmToken || state.dmToken !== token) throw new Fail('Sesión de DM caducada.', 401);
}

function twoWords(raw) {
  const words = String(raw || '').trim().split(/\s+/).filter(Boolean);
  if (words.length !== 2) throw new Fail('Tienen que ser exactamente dos palabras.');
  if (words.join(' ').length > 40) throw new Fail('Esas palabras son demasiado largas.');
  return words.join(' ');
}

function oneWord(raw) {
  const words = String(raw || '').trim().split(/\s+/).filter(Boolean);
  if (words.length !== 1) throw new Fail('Tiene que ser una sola palabra.');
  if (words[0].length > 24) throw new Fail('Esa palabra es demasiado larga.');
  return words[0];
}

function cleanText(raw, max) {
  return String(raw || '').trim().replace(/\s+/g, ' ').slice(0, max);
}

// ---------------------------------------------------------------------------
// Acciones
// ---------------------------------------------------------------------------

export function applyAction(state, body, now = Date.now()) {
  migrate(state);
  const { op, as, token } = body;

  switch (op) {
    // ----- entrada -------------------------------------------------------
    case 'join': {
      if (as === 'dm') {
        if (String(body.pass || '') !== DM_PASS) throw new Fail('Contraseña incorrecta.', 403);
        state.dmToken = token;
        state.dmLastSeen = now;
        return { ok: true, role: 'dm' };
      }
      if (!PLAYER_IDS.includes(as)) throw new Fail('Identidad desconocida.');
      const p = state.players[as];
      if (p.claimed && p.token !== token) {
        throw new Fail(PLAYERS[as].name + ' ya está en uso en otro móvil. Pídele al DM que lo libere.', 409);
      }
      p.claimed = true;
      p.token = token;
      p.lastSeen = now;
      maybeStart(state, now);
      return { ok: true, role: 'player' };
    }

    case 'ping': {
      if (as === 'dm') { if (state.dmToken === token) state.dmLastSeen = now; }
      else if (state.players[as] && state.players[as].token === token) state.players[as].lastSeen = now;
      return { ok: true };
    }

    // ----- ficha ---------------------------------------------------------
    case 'setStats': {
      const p = requirePlayer(state, as, token);
      if (p.stats) throw new Fail('Tu ficha ya está cerrada.');
      const incoming = body.stats || {};
      const stats = {};
      let total = 0;
      for (const s of STATS) {
        const n = Number(incoming[s.key]);
        if (!Number.isInteger(n) || n < RULES.MIN_STAT || n > RULES.MAX_STAT) {
          throw new Fail(s.label + ' debe estar entre ' + RULES.MIN_STAT + ' y ' + RULES.MAX_STAT + '.');
        }
        stats[s.key] = n;
        total += n;
      }
      if (total !== pointsFor(as)) throw new Fail('Tienes que repartir exactamente ' + pointsFor(as) + ' puntos.');
      p.stats = stats;
      pushEvent(state, {
        ts: now, playerId: as, kind: 'stats', status: 'done',
        title: PLAYERS[as].name + ' ha cerrado su ficha',
        detail: STATS.map(s => s.label + ' ' + stats[s.key]).join(' · '),
      });
      maybeStart(state, now);
      return { ok: true };
    }

    // ----- habilidades ---------------------------------------------------
    case 'cast': {
      const p = requirePlayer(state, as, token);
      const key = body.ability;
      const available = activeAbilities(state, as).map(([k]) => k);
      if (!available.includes(key)) throw new Fail('Esa habilidad no está disponible.');
      const def = ABILITIES[as][key];
      if (p.blockedUntil > now) throw new Fail('Otro jugador ha bloqueado tus habilidades.');
      if (def.ulti && !state.startedAt) throw new Fail('Las ultis se desbloquean cuando empieza la partida.');
      if (def.window && activeWindow(state, as, key, now)) throw new Fail('Ya la tienes activa.');
      const readyAt = p.cooldowns[key] || 0;
      if (readyAt > now) throw new Fail('Esa habilidad todavía está en cooldown.');

      const ev = {
        ts: now, playerId: as, kind: 'cast', ability: key,
        title: PLAYERS[as].name + ' · ' + def.name,
        detail: '', target: null, hint: def.hint, public: !!def.public,
      };
      let item = null;

      switch (def.input) {
        case 'words': ev.detail = twoWords(body.words); break;
        case 'word': ev.detail = oneWord(body.words); break;
        case 'target': {
          if (!PLAYER_IDS.includes(body.target) || body.target === as) throw new Fail('Tienes que elegir a otro jugador.');
          ev.target = body.target;
          ev.detail = PLAYERS[body.target].name;
          break;
        }
        case 'follow': {
          if (PLAYER_IDS.includes(body.target) && body.target !== as) {
            ev.target = body.target;
            ev.detail = PLAYERS[body.target].name;
          } else {
            const npc = cleanText(body.npc, 40);
            if (!npc) throw new Fail('Elige a un jugador o escribe qué PNJ.');
            ev.npc = npc;
            ev.detail = 'PNJ: ' + npc;
            ev.hint = 'Durante 5 min, cuéntale por privado lo que hace este PNJ.';
          }
          break;
        }
        case 'extreme': {
          if (!PLAYER_IDS.includes(body.target)) throw new Fail('Tienes que elegir a un jugador.');
          const when = body.when === 'last' ? 'last' : 'next';
          ev.target = body.target;
          ev.detail = PLAYERS[body.target].name + ' · ' + (when === 'last' ? 'la tirada que acaba de hacer' : 'su próxima tirada');
          ev.extra = { when, result: Math.random() < 0.5 ? 'exito' : 'pifia' };
          break;
        }
        case 'item': {
          item = p.items.find(i => i.id === body.item);
          if (!item) throw new Fail('Elige algo de tu mochila.');
          if (item.revived) throw new Fail('Eso ya lo recuperaste una vez.');
          if (itemState(item, now) === 'active') throw new Fail('Eso todavía lo tienes a mano.');
          ev.detail = item.word;
          break;
        }
      }

      p.cooldowns[key] = now + def.cd * 1000;
      if (def.window) ev.windowEnds = now + def.window * 1000;
      // El de Taciturno cuenta desde que acaba el silencio. Si se corta antes,
      // se recalcula en endTaciturno().
      if (key === 'taciturno') p.cooldowns[key] = ev.windowEnds + def.cd * 1000;
      if (def.auto) { ev.status = 'done'; ev.resolvedAt = now; }

      if (key === 'silencio') {
        state.players[ev.target].blockedUntil = now + BLOCK_TIME * 1000;
        ev.until = state.players[ev.target].blockedUntil;
      }
      if (key === 'porsiacaso') {
        item.revived = true;
        item.usedAt = null;
        item.expiresAt = now + ITEM_LIFE * 1000;
      }
      if (def.announce) announce(state, def.announce, now);

      pushEvent(state, ev);
      tellFollowers(state, as, 'acaba de usar ' + def.name + '.', now);
      return { ok: true, readyAt: p.cooldowns[key] };
    }

    case 'taciturnoBreak': {
      requirePlayer(state, as, token);
      const ev = activeWindow(state, as, 'taciturno', now);
      if (!ev) throw new Fail('No tienes Taciturno activo.');
      ev.status = 'fail';
      ev.resolvedAt = now;
      ev.note = 'Ha avisado él de que ha hablado.';
      endWindow(state, ev, now);
      return { ok: true };
    }

    case 'useItem': {
      const p = requirePlayer(state, as, token);
      const item = p.items.find(i => i.id === body.item);
      if (!item) throw new Fail('Ese objeto no existe.');
      if (itemState(item, now) !== 'active') throw new Fail('Ese objeto ya no lo tienes.');
      item.usedAt = now;
      pushEvent(state, {
        ts: now, playerId: as, kind: 'item', ability: 'item',
        title: PLAYERS[as].name + ' · usa lo que encontró',
        detail: item.word,
        hint: 'Haz que funcione. Era su único uso.',
      });
      tellFollowers(state, as, 'acaba de usar algo que encontró.', now);
      return { ok: true };
    }

    case 'passiveCheck': {
      requirePlayer(state, as, token);
      const def = passiveFor(state, as);
      if (!def) throw new Fail('No tienes ninguna pasiva.');
      const open = state.events.find(e => e.playerId === as && e.kind === 'passive' && (e.status === 'new' || e.status === 'seen'));
      if (open) throw new Fail('Ya tienes una revisión pendiente: espera a que el DM la mire.');
      pushEvent(state, {
        ts: now, playerId: as, kind: 'passive', ability: 'passive',
        title: PLAYERS[as].name + ' · revisar ' + def.name,
        detail: cleanText(body.text, 120),
        hint: def.watch,
      });
      return { ok: true };
    }

    case 'evolve': {
      const p = requirePlayer(state, as, token);
      const evo = EVOLUTIONS[as];
      if (!evo) throw new Fail('Tu habilidad no evoluciona.');
      if (p.evolved) throw new Fail('Ya has evolucionado.');
      p.evolved = true;
      // El cooldown pendiente pasa a la nueva, pero nunca más largo que el suyo.
      const carry = Math.min(p.cooldowns[evo.from] || 0, now + ABILITIES[as][evo.to].cd * 1000);
      p.cooldowns[evo.to] = Math.max(p.cooldowns[evo.to] || 0, carry);
      pushEvent(state, {
        ts: now, playerId: as, kind: 'evolve', status: 'done',
        title: PLAYERS[as].name + ' ha evolucionado',
        detail: ABILITIES[as][evo.from].name + ' → ' + ABILITIES[as][evo.to].name + ' (permanente)' +
          (PASSIVES[as] && PASSIVES[as].lostOnEvolve ? '. Pierde ' + PASSIVES[as].name + '.' : ''),
      });
      // La evolución en sí NO se anuncia: solo el uso de la nueva habilidad es
      // público. Si quieres contarlo a la mesa, usa el anuncio manual del DM.
      tellFollowers(state, as, 'acaba de cambiar algo en él para siempre.', now);
      return { ok: true };
    }

    // ----- chat ----------------------------------------------------------
    case 'send': {
      const to = body.to;
      const participants = ['dm'].concat(PLAYER_IDS);
      if (!participants.includes(to) || to === as) throw new Fail('Destinatario inválido.');
      if (as === 'dm') requireDM(state, token); else requirePlayer(state, as, token);
      const text = String(body.text || '').trim().slice(0, 600);
      if (!text) throw new Fail('Mensaje vacío.');
      const cid = chatId(as, to);
      if (!state.chats[cid]) state.chats[cid] = [];
      state.chats[cid].push({ id: uid(), ts: now, from: as, text });
      if (state.chats[cid].length > 400) state.chats[cid].splice(0, state.chats[cid].length - 400);
      state.reads[as + ':' + cid] = now;
      return { ok: true };
    }

    case 'read': {
      state.reads[as + ':' + String(body.chat || '')] = now;
      return { ok: true };
    }

    // ----- DM ------------------------------------------------------------
    case 'dmLucidez': {
      requireDM(state, token);
      const p = state.players[body.playerId];
      if (!p) throw new Fail('Jugador inválido.');
      p.lucidez = clamp(Math.round(p.lucidez + Number(body.delta || 0)), 0, 100);
      return { ok: true, lucidez: p.lucidez };
    }

    case 'dmStat': {
      requireDM(state, token);
      const p = state.players[body.playerId];
      if (!p || !p.stats) throw new Fail('Ese jugador aún no tiene ficha.');
      if (!STATS.some(s => s.key === body.stat)) throw new Fail('Stat inválida.');
      p.stats[body.stat] = clamp(Math.round(p.stats[body.stat] + Number(body.delta || 0)), 0, 99);
      return { ok: true };
    }

    case 'dmPlusOne': {
      requireDM(state, token);
      if (!BONUSES[body.playerId]) throw new Fail('Ese jugador no acumula bonus.');
      const p = state.players[body.playerId];
      p.plusOnes = clamp(Math.round(p.plusOnes + Number(body.delta || 0)), 0, 99);
      return { ok: true, plusOnes: p.plusOnes };
    }

    case 'dmResolve': {
      requireDM(state, token);
      const ev = state.events.find(e => e.id === body.eventId);
      if (!ev) throw new Fail('Evento no encontrado.');
      // 'seen' = el DM acusa recibo pero aún no lo ha aplicado.
      if (!['seen', 'ok', 'fail', 'done'].includes(body.status)) throw new Fail('Estado inválido.');
      // Un doble toque no debe dar dos +1 ni dos objetos.
      if (['ok', 'fail', 'done'].includes(ev.status)) return { ok: true };
      ev.status = body.status;
      ev.resolvedAt = now;
      if (body.status === 'ok' && (ev.ability === 'taciturno' || ev.kind === 'passive') && BONUSES[ev.playerId]) {
        state.players[ev.playerId].plusOnes += 1;
      }
      if (body.status === 'fail') endWindow(state, ev, now);
      return { ok: true };
    }

    // Sexto Sentido en dos pasos: primero el DM dice si está; después, quién
    // lo encuentra. Al que lo encuentra le entra en el inventario.
    case 'dmSexto': {
      requireDM(state, token);
      const ev = state.events.find(e => e.id === body.eventId && e.ability === 'sexto');
      if (!ev) throw new Fail('Evento no encontrado.');
      if (['ok', 'fail', 'done'].includes(ev.status)) return { ok: true };
      if (body.step === 'no') {
        ev.status = 'fail';
        ev.resolvedAt = now;
      } else if (body.step === 'esta') {
        ev.status = 'seen';
        ev.stage = 'search';
      } else if (body.step === 'found') {
        if (!PLAYER_IDS.includes(body.finder)) throw new Fail('¿Quién lo ha encontrado?');
        const finder = state.players[body.finder];
        const item = { id: uid(), word: ev.detail, foundAt: now, expiresAt: now + ITEM_LIFE * 1000, usedAt: null, revived: false };
        finder.items.unshift(item);
        if (finder.items.length > 30) finder.items.length = 30;
        ev.status = 'ok';
        ev.stage = 'found';
        ev.finder = body.finder;
        ev.resolvedAt = now;
      } else {
        throw new Fail('Paso inválido.');
      }
      return { ok: true };
    }

    case 'dmStop': {
      requireDM(state, token);
      const ev = state.events.find(e => e.id === body.eventId);
      if (!ev || !(ev.windowEnds > now)) throw new Fail('Eso ya no está activo.');
      endWindow(state, ev, now);
      if (ev.status === 'new' || ev.status === 'seen') { ev.status = 'done'; ev.resolvedAt = now; }
      return { ok: true };
    }

    case 'dmUnblock': {
      requireDM(state, token);
      const p = state.players[body.playerId];
      if (!p) throw new Fail('Jugador inválido.');
      p.blockedUntil = 0;
      return { ok: true };
    }

    case 'dmStart': {
      requireDM(state, token);
      if (state.startedAt) throw new Fail('La partida ya ha empezado.');
      startGame(state, now);
      return { ok: true };
    }

    case 'dmCooldown': {
      requireDM(state, token);
      const p = state.players[body.playerId];
      if (!p) throw new Fail('Jugador inválido.');
      if (body.ability === '*') p.cooldowns = {};
      else p.cooldowns[body.ability] = Number(body.readyAt) || 0;
      return { ok: true };
    }

    case 'dmRelease': {
      requireDM(state, token);
      const p = state.players[body.playerId];
      if (!p) throw new Fail('Jugador inválido.');
      p.claimed = false;
      p.token = null;
      return { ok: true };
    }

    case 'dmResetStats': {
      requireDM(state, token);
      const p = state.players[body.playerId];
      if (!p) throw new Fail('Jugador inválido.');
      p.stats = null;
      return { ok: true };
    }

    case 'dmNote': {
      requireDM(state, token);
      const ev = state.events.find(e => e.id === body.eventId);
      if (!ev) throw new Fail('Evento no encontrado.');
      ev.note = String(body.note || '').slice(0, 400);
      return { ok: true };
    }

    case 'dmAnnounce': {
      requireDM(state, token);
      const text = String(body.text || '').trim().slice(0, 300);
      if (!text) throw new Fail('Anuncio vacío.');
      announce(state, text, now);
      return { ok: true };
    }

    case 'dmReset': {
      requireDM(state, token);
      const fresh = newState(now);
      fresh.dmToken = token;
      for (const k of Object.keys(state)) delete state[k];
      Object.assign(state, fresh);
      return { ok: true };
    }

    default:
      throw new Fail('Operación desconocida.');
  }
}

// ---------------------------------------------------------------------------
// Vistas (el servidor filtra: un jugador nunca recibe datos de otro)
// ---------------------------------------------------------------------------

const ONLINE_MS = 45000;

// Qué lee el jugador sobre algo que ha lanzado. El texto lo decide el servidor
// para que el aviso del DM y lo que ve el jugador nunca discrepen.
function castStatus(ev, now) {
  if (ev.kind === 'passive') {
    if (ev.status === 'ok') return { text: '+1 permanente', state: 'ok' };
    if (ev.status === 'fail') return { text: 'Esta vez no cuenta', state: 'fail' };
  }
  if (ev.ability === 'taciturno') {
    if (ev.status === 'ok') return { text: 'Aguantaste · +1 permanente', state: 'ok' };
    if (ev.status === 'fail') return { text: 'Se cortó', state: 'fail' };
    if (ev.windowEnds > now) return { text: 'En silencio… no hables en voz alta', state: 'seen' };
    return { text: 'Cumplido · el DM te confirmará el +1', state: 'wait' };
  }
  // Seguir y Ojos limpios no esperan al DM: duran lo que dura su ventana.
  if (ev.ability === 'seguir' || ev.ability === 'ojos') {
    if (ev.windowEnds > now) {
      return ev.ability === 'seguir'
        ? { text: 'Siguiendo · te llega por el chat del DM', state: 'seen' }
        : { text: 'Activa · solo vale lo que TÚ preguntes', state: 'seen' };
    }
    return { text: 'Terminada', state: 'ok' };
  }
  if (ev.ability === 'sexto') {
    if (ev.status === 'ok') {
      return ev.finder === ev.playerId
        ? { text: 'Lo has encontrado · mira tu inventario', state: 'ok' }
        : { text: 'Alguien lo ha encontrado antes que tú', state: 'fail' };
    }
    if (ev.status === 'fail') return { text: 'No está', state: 'fail' };
    if (ev.stage === 'search') return { text: 'Está a 20 m o menos · encuéntralo antes que nadie', state: 'seen' };
  }
  if (ev.status === 'new') return { text: 'Enviada. Esperando al DM', state: 'wait' };
  if (ev.status === 'seen') return { text: 'El DM la ha recibido · está en ello', state: 'seen' };
  if (ev.status === 'fail') return { text: 'Esta vez no ha funcionado', state: 'fail' };
  if (ev.status === 'ok') return { text: 'Ha funcionado', state: 'ok' };
  const def = (ABILITIES[ev.playerId] || {})[ev.ability];
  return { text: (def && def.done) || 'Aplicado por el DM', state: 'ok' };
}

function eventName(ev) {
  if (ev.kind === 'passive') return 'Revisar pasiva';
  if (ev.kind === 'item') return 'Usar objeto';
  return ((ABILITIES[ev.playerId] || {})[ev.ability] || {}).name || ev.ability;
}

function itemsView(p, now) {
  return p.items.map(i => ({
    id: i.id, word: i.word, expiresAt: i.expiresAt, revived: i.revived,
    state: itemState(i, now),
  }));
}

function chatView(state, viewer, other, label) {
  const cid = chatId(viewer, other);
  const msgs = state.chats[cid] || [];
  const lastRead = state.reads[viewer + ':' + cid] || 0;
  return {
    id: cid,
    withId: other,
    label,
    messages: msgs,
    unread: msgs.filter(m => m.from !== viewer && m.ts > lastRead).length,
    last: msgs.length ? msgs[msgs.length - 1] : null,
  };
}

function pairChat(state, viewer, a, b, msgs) {
  const cid = chatId(a, b);
  const names = {};
  names[a] = PLAYERS[a].name;
  names[b] = PLAYERS[b].name;
  return {
    id: cid,
    label: PLAYERS[a].name + ' ↔ ' + PLAYERS[b].name,
    messages: msgs,
    last: msgs[msgs.length - 1],
    unread: msgs.filter(m => m.ts > (state.reads[viewer + ':' + cid] || 0)).length,
    names,
  };
}

// Seguir: los mensajes entre el seguido y otros jugadores mientras duraba la
// ventana. Se quedan aunque acabe: es lo que vio mientras le seguía.
function interceptedFor(state, viewer) {
  const follows = state.events.filter(e => e.playerId === viewer && e.ability === 'seguir' && e.target);
  const out = [];
  if (!follows.length) return out;
  for (let i = 0; i < PLAYER_IDS.length; i++) {
    for (let j = i + 1; j < PLAYER_IDS.length; j++) {
      const a = PLAYER_IDS[i], b = PLAYER_IDS[j];
      if (a === viewer || b === viewer) continue;
      const msgs = (state.chats[chatId(a, b)] || []).filter(m => follows.some(f =>
        (f.target === a || f.target === b) && m.ts >= f.ts && m.ts <= f.windowEnds));
      if (msgs.length) out.push(pairChat(state, viewer, a, b, msgs));
    }
  }
  return out;
}

export function viewFor(state, as, token, now = Date.now()) {
  migrate(state);
  const base = { now, rules: RULES, stats: STATS, public: state.public.slice(0, 20), startedAt: state.startedAt };

  if (as === 'dm') {
    if (state.dmToken !== token) throw new Fail('Sesión de DM caducada.', 401);
    const players = PLAYER_IDS.map(id => {
      const p = state.players[id];
      const passive = passiveFor(state, id);
      return {
        id, name: PLAYERS[id].name, tag: PLAYERS[id].tag,
        claimed: p.claimed, online: now - p.lastSeen < ONLINE_MS,
        stats: p.stats, lucidez: p.lucidez, evolved: p.evolved,
        blockedUntil: p.blockedUntil,
        items: itemsView(p, now),
        bonus: BONUSES[id] ? { value: p.plusOnes, from: BONUSES[id] } : null,
        passive: passive ? { name: passive.name, watch: passive.watch } : null,
        abilities: activeAbilities(state, id).map(([key, d]) => ({
          key, name: d.name, cd: d.cd, ulti: !!d.ulti,
          locked: !!d.ulti && !state.startedAt,
          readyAt: p.cooldowns[key] || 0,
        })),
        evolution: EVOLUTIONS[id] ? {
          done: p.evolved,
          label: ABILITIES[id][EVOLUTIONS[id].from].name + ' → ' + ABILITIES[id][EVOLUTIONS[id].to].name,
        } : null,
      };
    });
    const direct = PLAYER_IDS.map(id => chatView(state, 'dm', id, PLAYERS[id].name));
    const intercepted = [];
    for (let i = 0; i < PLAYER_IDS.length; i++) {
      for (let j = i + 1; j < PLAYER_IDS.length; j++) {
        const a = PLAYER_IDS[i], b = PLAYER_IDS[j];
        const msgs = state.chats[chatId(a, b)] || [];
        if (msgs.length) intercepted.push(pairChat(state, 'dm', a, b, msgs));
      }
    }
    return Object.assign({}, base, {
      role: 'dm',
      players,
      waiting: PLAYER_IDS
        .filter(id => !state.players[id].claimed || !state.players[id].stats)
        .map(id => ({ name: PLAYERS[id].name, why: state.players[id].claimed ? 'sin ficha' : 'sin entrar' })),
      events: state.events.slice(0, 80),
      chats: { direct, intercepted },
    });
  }

  const p = requirePlayer(state, as, token);
  const abilities = activeAbilities(state, as).map(([key, d]) => {
    const win = d.window ? activeWindow(state, as, key, now) : null;
    return {
      key, name: d.name, short: d.short, long: d.long, confirm: d.confirm,
      cd: d.cd, input: d.input || null, readyAt: p.cooldowns[key] || 0,
      ulti: !!d.ulti, locked: !!d.ulti && !state.startedAt, public: !!d.public,
      activeUntil: win ? win.windowEnds : 0,
    };
  });
  const evo = EVOLUTIONS[as];
  const passive = passiveFor(state, as);
  return Object.assign({}, base, {
    role: 'player',
    me: {
      id: as, name: PLAYERS[as].name, tag: PLAYERS[as].tag,
      stats: p.stats, evolved: p.evolved, blocked: p.blockedUntil > now,
      points: pointsFor(as),
      bonus: BONUSES[as] ? { value: p.plusOnes, from: BONUSES[as] } : null,
      items: itemsView(p, now),
      canRevive: as === 'tomas',
    },
    abilities,
    passive: passive ? {
      name: passive.name, short: passive.short, long: passive.long,
      pending: state.events.some(e => e.playerId === as && e.kind === 'passive' && (e.status === 'new' || e.status === 'seen')),
    } : null,
    myEvents: state.events
      .filter(e => e.playerId === as && (e.kind === 'cast' || e.kind === 'passive' || e.kind === 'item'))
      .slice(0, 5)
      .map(e => {
        const st = castStatus(e, now);
        return {
          id: e.id, ts: e.ts, ability: e.ability, name: eventName(e),
          detail: e.detail || '',
          status: e.status, text: st.text, state: st.state,
        };
      }),
    evolution: evo && !p.evolved ? {
      label: evo.label, warn: evo.warn,
      from: ABILITIES[as][evo.from].name,
      to: ABILITIES[as][evo.to].name,
      toShort: ABILITIES[as][evo.to].short,
      toLong: ABILITIES[as][evo.to].long,
    } : null,
    others: PLAYER_IDS.filter(id => id !== as).map(id => ({
      id, name: PLAYERS[id].name,
      online: now - state.players[id].lastSeen < ONLINE_MS,
    })),
    chats: [chatView(state, as, 'dm', 'DM')].concat(
      PLAYER_IDS.filter(id => id !== as).map(id => chatView(state, as, id, PLAYERS[id].name))
    ),
    intercepted: interceptedFor(state, as),
  });
}

export function lobbyView(state, now = Date.now()) {
  migrate(state);
  return {
    now,
    players: PLAYER_IDS.map(id => ({
      id, name: PLAYERS[id].name, tag: PLAYERS[id].tag,
      claimed: state.players[id].claimed,
    })),
  };
}
