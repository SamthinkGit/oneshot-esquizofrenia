# ONE·SHOT

App de mesa para la one-shot: cuatro jugadores y un DM, cada uno en su móvil.
Todo el estado vive en el servidor, así que las recargas, los cierres de app y
los cambios de móvil no pierden nada.

## Qué hay dentro

| Archivo | Para qué |
|---|---|
| `public/` | La app entera (HTML + CSS + JS, sin build) |
| `lib/game.mjs` | Reglas: stats, habilidades, cooldowns, chats, vistas |
| `api/index.js` | Endpoint `/api` en Vercel. Guarda el estado en Upstash Redis |
| `netlify/functions/api.mjs` | El mismo endpoint en Netlify, con Netlify Blobs |
| `dev-server.mjs` | Servidor local que emula la función para probar sin desplegar |

## Probar en local

```bash
npm run dev
```

Abre `http://localhost:8787`. El estado se guarda en `.dev-state.json`; bórralo
para empezar de cero.

## Desplegar en Vercel

1. En Vercel, **Add New → Project** e importa el repo de GitHub. No hay que
   tocar nada: `vercel.json` ya dice que no hay build y que se publica
   `public/`.
2. **Antes de abrir la web**, en el proyecto ve a **Storage → Create Database →
   Upstash for Redis** (el plan gratis sobra) y conéctala al proyecto. Eso crea
   solo las variables `KV_REST_API_URL` y `KV_REST_API_TOKEN`. Sin ella, la
   pantalla de entrada lo avisa.
3. En **Settings → Environment Variables** añade `DM_PASS` con la clave del DM
   (4 cifras). Si no la pones, es `5441`, que está a la vista en el repo.
4. **Redeploy** para que coja las variables. Entra como DM y abre la pestaña
   **QR** para que los jugadores se unan.

## Desplegar en Netlify (alternativa)

1. Sube la carpeta a un repo y conéctalo en Netlify, o arrastra la carpeta a
   [app.netlify.com/drop](https://app.netlify.com/drop).
2. Netlify lee `netlify.toml`: publica `public/`, instala `@netlify/blobs` y
   despliega la función. No hay que configurar nada más — Blobs se activa solo
   en sitios desplegados.
3. Entra como DM y abre la pestaña **QR**: ahí está el código para que los
   jugadores se unan.

## Reglas implementadas

- **70 puntos** entre las 6 características (Kekio empieza con **60**), mínimo
  5 y máximo 20 cada una. Se reparten una sola vez; luego solo el DM puede
  tocarlas. Hay un botón **Aleatorio** que reparte los puntos respetando los límites, con afinidades al
  azar para que no salgan seis números iguales. Se puede volver a tirar y
  retocar a mano antes de confirmar.
- El jugador tiene **una sola pantalla**: características, bonus, habilidades y
  pasiva juntas. La otra pestaña son los mensajes.
- **Modificador de D&D** junto a cada característica, `floor((valor - 10) / 2)`.
  Con los límites actuales va de −3 (5) a +5 (20). Se ve mientras se reparten
  los puntos, en la ficha del jugador y en el panel del DM.
- **Lucidez**: empieza en 50, solo existe en la vista del DM. El servidor nunca
  la envía a un jugador.
- **Cooldowns**: los calcula y los valida el servidor. Manipular el cliente no
  sirve de nada.
- **Aislamiento**: cada jugador recibe únicamente sus propias habilidades,
  stats y chats. De los demás solo ve el nombre y si están conectados.
- **Confirmación** obligatoria antes de lanzar cualquier habilidad, y doble
  confirmación para la evolución permanente de Kekio (Señuelo → Espantapájaros).
- Cada aviso del DM se resuelve en dos toques: **Recibido** (acuse de recibo,
  sin comprometerse) y **Hecho** (ya aplicado). Van directos, sin confirmación.
  Solo se confirman los +1 permanentes (Taciturno y Revisar pasiva), porque
  cambian la ficha; aun así el bonus se puede corregir con los ± de **Mesa**.
- **Inicio de partida**: arranca sola cuando los cuatro han entrado y cerrado
  su ficha (o con **Empezar ya** en la pestaña Ahora del DM). Desde ese momento
  las ultis cuentan una hora.
- El jugador tiene un bloque **Tus acciones** con el estado de lo que ha
  lanzado: ámbar "esperando al DM", blanco "recibido, está en ello" y verde al
  aplicarse, con vibración y aviso aunque esté en otra pestaña.

### Habilidades

| Quién | Habilidad | CD | Notas |
|---|---|---|---|
| Kekio | Señuelo → Espantapájaros | 20 → 10 min | Dos palabras. Señuelo es ilusión secreta con la que nadie puede interactuar; Espantapájaros es real (se puede tocar y usar) y público |
| Kekio | Instinto de leñador (pasiva) | — | +1 si alguien se cree un señuelo. Se pierde al mejorar a Espantapájaros |
| Kekio | Talar el paso (ulti) | 1 h | Sin texto: es pública y lo dice en voz alta. Abre o cierra un camino |
| Tomás | Sexto Sentido | 10 min | Una palabra. El DM dice si está; si está, marca quién lo encuentra y le entra en el inventario: 1 uso, 3 min |
| Tomás | Por si acaso | 15 min | Recupera un objeto suyo usado o caducado (una vez por objeto). Automático |
| Tomás | Silencio, por favor (ulti) | 1 h | Bloquea las habilidades de otro jugador 5 min. Sabe que ha sido otro jugador, no quién ni cuánto queda |
| Gonzalo | Seguir | 12 min | Jugador o PNJ, 5 min. Le llega el nombre de cada habilidad del seguido y lee sus privados con otros jugadores de ese rato |
| Gonzalo | Taciturno | 5 min | 10 min sin hablar en voz alta. El cooldown cuenta desde que acaba el silencio. La app avisa al DM al cumplirse |
| Gonzalo | Pista falsa (ulti) | 1 h | Dos palabras. El DM engaña a la mesa en su próxima explicación |
| Marina | Ojos limpios | 10 min | Hasta 3 min de verdad, solo para lo que ella pregunte. El DM la puede parar antes |
| Marina | Extremizar | 15 min | Elige jugador y tirada. La app lanza la moneda; solo el DM ve éxito o pifia |
| Marina | Hacer ojitos (ulti) | 1 h | Dos palabras. Un PNJ no puede negarse, pero lo hace a su manera. Público |

Las ultis están bloqueadas hasta que empieza la partida y arrancan con su hora
entera de cooldown. Las pasivas tienen un botón **Revisar pasiva** para que el
jugador avise al DM de que algo ha pasado.

La evolución es permanente y la decide el jugador desde su propia pantalla. La
evolución en sí no se anuncia a la mesa: solo el uso de la nueva habilidad.

## Panel del DM

- **Ahora** (pestaña por defecto): todo lo que necesita tu atención a la vez.
  - *Te toca*: lo que espera una respuesta tuya, el más antiguo arriba, cada
    uno con una línea de qué hacer y sus botones.
  - *En curso*: lo que tiene cuenta atrás (Seguir, Taciturno, Ojos limpios,
    jugadores bloqueados y objetos de Tomás).
  - *Vigila siempre*: las pasivas, con un +1 directo.
  - *Ultis*: cuánto le falta a cada una.
  Si la partida no ha empezado, dice quién falta y tiene **Empezar ya**.
- **Avisos**: el historial completo.
- **Mesa**: lucidez, características, cooldowns y los +1 acumulados de Kekio y
  de Gonzalo, todo editable. Además "liberar móvil" si alguien cambia de teléfono.
- **Chats**: los cuatro privados con el DM y los que los jugadores tienen entre
  ellos, en modo lectura.
- **QR**: código para unirse, anuncio a la mesa y reinicio de partida.

Clave del DM: la variable de entorno `DM_PASS`; si no existe, `5441` (en `lib/game.mjs`).
