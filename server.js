// SNAKE – Deno-Server: alle Schlangen auf einem Feld, die Bewegung läuft
// hier. Der Client schickt nur seine Richtung und zeichnet, was zurückkommt.
// Genau andersherum als das gelöschte Kurven: sähe jedes Gerät seine eigene
// Physik, sähen zwei Geräte verschiedene Zusammenstöße.

import { darfRaumOeffnen, raumVermerkt } from "./bremse.js";
import { cleanName, raumverwaltung, shuffle } from "./raum.js";
import { starte } from "./statisch.js";

const PORT = Number(Deno.env.get("PORT") ?? 8068);
const HOST = Deno.env.get("HOST") ?? "0.0.0.0";
const PUBLIC = new URL("./public/", import.meta.url);

const MAX_PLAYERS = 6;
// Eins, nicht zwei: Snake allein ist das Snake, das jeder kennt – fahren, bis
// man sich selbst frisst. Wer allein spielt, bekommt am Rundenende keine
// zwanzig Ueberlebenspunkte (siehe pruefeRundenende), sonst waere die
// Bestenliste geschenkt.
const MIN_PLAYERS = 1;

const W = 32, H = 24;          // Felder
const TICK_MS = 130;           // Schritt der Schlangen
const START_LAENGE = 4;
const AEPFEL = 4;
const PAUSE_MS = 4000;         // zwischen zwei Runden
const FARBEN = ["#35e6ff", "#ff2e88", "#ffd447", "#52ffa8", "#ff8a3d", "#a06bff"];

const RICHTUNGEN = {
  hoch: { x: 0, y: -1 },
  runter: { x: 0, y: 1 },
  links: { x: -1, y: 0 },
  rechts: { x: 1, y: 0 },
};

const {
  rooms, browsing,
  createRoom, clearTimers, anwesende,
  send, raw, broadcast,
  roomList, pushState, pushRoomList,
  makePlayer, attach, dropPlayer,
} = raumverwaltung({
  maxPlayers: MAX_PLAYERS,
  minPlayers: MIN_PLAYERS,
  einstellungen: { runden: 3 },
  raumfelder: () => ({ aepfel: [], laeuft: false, tote: [] }),
  spielerfelder: () => ({
    koerper: [], dir: "rechts", neueDir: "rechts", lebt: false, farbe: "#35e6ff", aepfelGegessen: 0,
  }),
  beimVerlassen: (room, player) => { player.lebt = false; },
  nachVerlassen: (room) => { if (room.laeuft) pruefeRundenende(room); },
  beimPlatzfrei: (room) => { if (room.laeuft) pruefeRundenende(room); },
  zurueckZurLobby: (room) => backToLobby(room),
});

// ---------------------------------------------------------------------------
// Feld
// ---------------------------------------------------------------------------

const frei = (room, x, y) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return false;
  for (const p of room.players.values()) {
    if (!p.lebt) continue;
    if (p.koerper.some((s) => s.x === x && s.y === y)) return false;
  }
  return !room.aepfel.some((a) => a.x === x && a.y === y);
};

function neuerApfel(room) {
  for (let i = 0; i < 200; i++) {
    const x = Math.floor(Math.random() * W);
    const y = Math.floor(Math.random() * H);
    if (frei(room, x, y)) return room.aepfel.push({ x, y });
  }
}

function startGame(room) {
  clearTimers(room);
  room.phase = "playing";
  room.rundeNr = 0;
  for (const p of room.players.values()) {
    p.punkte = 0;
    p.ready = false;
  }
  pushState(room);
  starteRunde(room);
  pushRoomList();
}

function starteRunde(room) {
  clearTimers(room);
  room.rundeNr++;
  room.aepfel = [];
  room.tote = [];
  const da = shuffle(anwesende(room));
  da.forEach((p, i) => {
    // Startplätze auf zwei Spalten verteilt, Blickrichtung zur Mitte.
    const links = i % 2 === 0;
    const x = links ? 3 : W - 4;
    const y = Math.floor((H / (Math.ceil(da.length / 2) + 1)) * (Math.floor(i / 2) + 1));
    p.dir = p.neueDir = links ? "rechts" : "links";
    p.koerper = [];
    for (let k = 0; k < START_LAENGE; k++) {
      p.koerper.push({ x: links ? x - k : x + k, y });
    }
    p.lebt = true;
    p.aepfelGegessen = 0;
    p.farbe = FARBEN[i % FARBEN.length];
  });
  for (const p of room.players.values()) if (!da.includes(p)) p.lebt = false;
  for (let i = 0; i < AEPFEL; i++) neuerApfel(room);
  room.laeuft = true;
  pushRunde(room, { text: "Los!", k: "snake.los" });
  planeTick(room);
}

function planeTick(room) {
  const id = setTimeout(() => {
    room.timers.delete(id);
    if (!room.laeuft) return;
    tick(room);
    if (room.laeuft) planeTick(room);
  }, TICK_MS);
  room.timers.add(id);
}

function tick(room) {
  const lebende = [...room.players.values()].filter((p) => p.lebt && p.connected);

  // Erst alle Köpfe setzen, dann prüfen: sonst hängt es von der Reihenfolge
  // ab, wer bei einem Frontalzusammenstoß überlebt.
  const koepfe = new Map();
  for (const p of lebende) {
    p.dir = p.neueDir;
    const d = RICHTUNGEN[p.dir];
    koepfe.set(p.id, { x: p.koerper[0].x + d.x, y: p.koerper[0].y + d.y });
  }

  const sterben = new Set();
  for (const p of lebende) {
    const k = koepfe.get(p.id);
    if (k.x < 0 || k.y < 0 || k.x >= W || k.y >= H) { sterben.add(p.id); continue; }
    for (const q of lebende) {
      // Der eigene Schwanz zieht in diesem Schritt weiter – das letzte Glied
      // zählt deshalb nicht, wenn q nicht gerade wächst.
      const bis = q.koerper.length - (q.waechst ? 0 : 1);
      for (let i = 0; i < bis; i++) {
        if (q.koerper[i].x === k.x && q.koerper[i].y === k.y) sterben.add(p.id);
      }
      if (q !== p) {
        const k2 = koepfe.get(q.id);
        if (k2.x === k.x && k2.y === k.y) { sterben.add(p.id); sterben.add(q.id); }
      }
    }
  }

  for (const p of lebende) {
    if (sterben.has(p.id)) continue;
    const k = koepfe.get(p.id);
    p.koerper.unshift(k);
    const ai = room.aepfel.findIndex((a) => a.x === k.x && a.y === k.y);
    if (ai >= 0) {
      room.aepfel.splice(ai, 1);
      neuerApfel(room);
      p.aepfelGegessen++;
      p.punkte += 10;
      p.waechst = true;
    } else {
      p.koerper.pop();
      p.waechst = false;
    }
  }

  for (const id of sterben) {
    const p = room.players.get(id);
    if (!p) continue;
    p.lebt = false;
    room.tote.push(p.name);
    // Wer länger durchhält, bekommt mehr: ein Punkt je noch lebender Gegner.
    p.punkte += lebende.length - sterben.size;
  }

  pushRunde(room);
  if (sterben.size) pruefeRundenende(room);
}

function pruefeRundenende(room) {
  if (!room.laeuft) return;
  const lebende = [...room.players.values()].filter((p) => p.lebt && p.connected);
  if (lebende.length > 1) return;
  if (lebende.length === 1 && anwesende(room).length > 1) {
    lebende[0].punkte += 20;
  }
  room.laeuft = false;
  clearTimers(room);
  const sieger = lebende[0]?.name ?? null;
  pushRunde(
    room,
    sieger
      ? { text: `${sieger} überlebt die Runde.`, k: "snake.ueberlebt", w: { name: sieger } }
      : { text: "Alle gleichzeitig – niemand.", k: "snake.gleichzeitig" },
  );
  pushState(room);

  const id = setTimeout(() => {
    room.timers.delete(id);
    if (room.rundeNr >= room.settings.runden || anwesende(room).length < MIN_PLAYERS) {
      finishGame(room);
    } else {
      starteRunde(room);
    }
  }, PAUSE_MS);
  room.timers.add(id);
}

function pushRunde(room, meldung) {
  if (room.phase !== "playing") return;
  const schlangen = [...room.players.values()]
    .filter((p) => p.koerper.length)
    .map((p) => ({
      id: p.id, name: p.name, farbe: p.farbe, lebt: p.lebt, punkte: p.punkte,
      // Flach als Zahlenreihe: halb so viele Zeichen wie Objekte pro Glied.
      k: p.koerper.flatMap((s) => [s.x, s.y]),
    }));
  broadcast(room, {
    t: "runde",
    n: room.rundeNr,
    total: room.settings.runden,
    w: W, h: H,
    laeuft: room.laeuft,
    aepfel: room.aepfel.flatMap((a) => [a.x, a.y]),
    schlangen,
    meldung: meldung ?? null,
  });
}

function finishGame(room) {
  clearTimers(room);
  room.laeuft = false;
  room.phase = "final";
  const tabelle = [...room.players.values()]
    .map((p) => ({
      name: p.name,
      wert: { text: p.punkte + " Punkte", k: "snake.punkte", w: { n: p.punkte } },
      punkte: p.punkte,
    }))
    .sort((a, b) => b.punkte - a.punkte);
  for (const p of room.players.values()) p.ready = false;
  broadcast(room, {
    t: "final",
    tabelle,
    untertitel: {
      text: `${room.rundeNr} Runden gespielt`,
      k: "snake.gespielt",
      w: { n: room.rundeNr },
    },
  });
  pushState(room);
  pushRoomList();
}

function backToLobby(room) {
  clearTimers(room);
  room.laeuft = false;
  room.phase = "lobby";
  room.rundeNr = 0;
  room.aepfel = [];
  for (const p of room.players.values()) {
    p.ready = false;
    p.punkte = 0;
    p.koerper = [];
    p.lebt = false;
  }
  pushState(room);
}

// ---------------------------------------------------------------------------
// Nachrichten
// ---------------------------------------------------------------------------

function handle(ws, msg) {
  const room = ws._room;
  const player = ws._player;

  if (msg.t === "ping") return raw(ws, { t: "pong", c: msg.c, s: Date.now() });

  if (msg.t === "browse") {
    if (!ws._room) {
      browsing.add(ws);
      raw(ws, { t: "rooms", rooms: roomList() });
    }
    return;
  }

  if (msg.t === "create") {
    if (room) return;
    if (!darfRaumOeffnen(ws._ip)) {
      return raw(ws, { t: "error", msg: "Zu viele Räume in kurzer Zeit. Warte kurz." });
    }
    raumVermerkt(ws._ip);
    const r = createRoom(msg.isPublic);
    const p = makePlayer(msg.name, true);
    r.hostId = p.id;
    r.players.set(p.id, p);
    attach(ws, r, p);
    pushState(r);
    pushRoomList();
    return;
  }

  if (msg.t === "join") {
    if (room) return;
    const r = rooms.get(String(msg.code ?? "").toUpperCase().trim());
    if (!r) return raw(ws, { t: "error", msg: "Diesen Raum gibt es nicht" });
    if (msg.token) {
      const back = [...r.players.values()].find((p) => p.token === msg.token);
      if (back) {
        if (back.ws && back.ws !== ws && back.ws.readyState === WebSocket.OPEN) {
          try { back.ws.close(4001, "woanders geöffnet"); } catch { /* egal */ }
        }
        attach(ws, r, back);
        pushState(r);
        return;
      }
    }
    if (r.players.size >= MAX_PLAYERS) {
      return raw(ws, { t: "error", msg: `Der Raum ist voll (${MAX_PLAYERS} Spieler)` });
    }
    if (r.phase !== "lobby") return raw(ws, { t: "error", msg: "Die Runde läuft schon" });
    const p = makePlayer(msg.name, false);
    r.players.set(p.id, p);
    attach(ws, r, p);
    pushState(r);
    return;
  }

  if (!room || !player) return;
  room.lastActivity = Date.now();

  switch (msg.t) {
    case "name":
      player.name = cleanName(msg.name);
      pushState(room);
      break;

    case "ready":
      player.ready = !!msg.value;
      pushState(room);
      break;

    case "settings":
      if (player.id !== room.hostId || room.phase !== "lobby") break;
      if ([1, 3, 5].includes(msg.runden)) room.settings.runden = msg.runden;
      if (typeof msg.isPublic === "boolean") room.isPublic = msg.isPublic;
      pushState(room);
      pushRoomList();
      break;

    case "start": {
      if (player.id !== room.hostId || room.phase !== "lobby") break;
      const da = anwesende(room);
      if (da.length < MIN_PLAYERS) break;
      if (!da.every((p) => p.ready || p.id === room.hostId)) break;
      startGame(room);
      break;
    }

    case "dir": {
      if (!player.lebt) break;
      const d = RICHTUNGEN[msg.d];
      if (!d) break;
      // Kehrtwende verboten – sonst fährt man in den eigenen Hals.
      const jetzt = RICHTUNGEN[player.dir];
      if (d.x === -jetzt.x && d.y === -jetzt.y) break;
      player.neueDir = msg.d;
      break;
    }

    case "ende":
      if (player.id !== room.hostId || room.phase !== "playing") break;
      finishGame(room);
      break;

    case "again":
      if (player.id !== room.hostId || room.phase !== "final") break;
      backToLobby(room);
      break;

    case "leave":
      dropPlayer(ws, { immediate: true });
      break;
  }
}

starte({ port: PORT, host: HOST, publicDir: PUBLIC, titel: "SNAKE", handle, dropPlayer });
