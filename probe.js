// Spielt Snake mit sechs Clients durch – der vollen Besetzung, weil genau die
// die teuerste ist: alle 130 ms gehen alle Körper an alle. Geprüft werden die
// Bewegung Schritt für Schritt, die verbotene Kehrtwende, Wachsen beim Apfel,
// Tod an der Wand, der Frontalzusammenstoß (bei dem beide sterben müssen), das
// Rundenende samt Punkten und der Endstand.
//
// **Und die Bandbreite.** Bei Cubes waren 25 Quadrate pro Nachricht 148 KB/s je
// Spieler – aufgefallen ist das erst im Betrieb. Snake schickt mehr und öfter,
// gemessen hat es bisher niemand. Diese Probe misst mit und wirft, wenn es aus
// dem Ruder läuft.
//
// Kein Testrahmen, keine Abhaengigkeit – das Skript wirft, wenn etwas nicht
// stimmt, und schreibt sonst mit, was passiert ist. Der Server muss dafuer
// laufen:
//
//   deno task dev            (in einer zweiten Sitzung)
//   deno task probe
// Gegen die Live-Fassung statt gegen den lokalen Server:
//   WS_URL=wss://inf-zeus.de/snake/ws deno task probe

const PORT = Deno.env.get("PORT") ?? "8068";
const URL_WS = Deno.env.get("WS_URL") ?? `ws://127.0.0.1:${PORT}/ws`;

/** Obergrenze je Spieler. Grosszuegig, aber weit unter dem Cubes-Fehler. */
const MAX_KB_S = 25;

const RICHTUNGEN = {
  hoch: { x: 0, y: -1 },
  runter: { x: 0, y: 1 },
  links: { x: -1, y: 0 },
  rechts: { x: 1, y: 0 },
};

const muss = (bedingung, text) => { if (!bedingung) throw new Error(text); };

function client(name) {
  const c = {
    name, ws: new WebSocket(URL_WS), you: null, room: null, runde: null,
    final: null, fehler: [], bytes: 0, nachrichten: 0,
  };
  c.ws.onmessage = (ev) => {
    c.bytes += ev.data.length;
    c.nachrichten++;
    const m = JSON.parse(ev.data);
    if (m.t === "joined") c.you = m.you;
    if (m.t === "room") c.room = m;
    if (m.t === "runde") { c.runde = m; c.final = null; }
    if (m.t === "final") c.final = m;
    if (m.t === "error") c.fehler.push(m.msg);
  };
  c.send = (m) => c.ws.send(JSON.stringify(m));
  c.offen = new Promise((res) => { c.ws.onopen = res; });
  return c;
}

const warte = (ms) => new Promise((r) => setTimeout(r, ms));

async function bis(bedingung, was, ms = 12_000) {
  const ende = Date.now() + ms;
  while (Date.now() < ende) {
    if (bedingung()) return;
    await warte(10);
  }
  throw new Error("Zeitüberschreitung: " + was);
}

// --- Sechs Clients in einen Raum --------------------------------------------

const namen = ["Anna", "Ben", "Cem", "Dana", "Emil", "Fee"];
const alleC = namen.map(client);
const [A] = alleC;
await Promise.all(alleC.map((c) => c.offen));

// Nicht oeffentlich: die Probe laeuft auch gegen live, und dort soll kein
// Geisterraum in der Liste stehen.
A.send({ t: "create", name: namen[0], isPublic: false });
await bis(() => A.room, "Raum angelegt");
console.log("Raum:", A.room.code);

for (const c of alleC.slice(1)) c.send({ t: "join", code: A.room.code, name: c.name });
await bis(() => A.room.players.length === 6, "sechs Spieler");
muss(A.room.maxPlayers === 6, "Mehr als sechs würden hier zu eng");

A.send({ t: "start" });
await warte(150);
muss(A.room.phase === "lobby", "Start ging ohne Bereit durch");
console.log("ok  Start blockiert, solange nicht alle bereit sind");

A.send({ t: "settings", runden: 3 });
for (const c of alleC.slice(1)) c.send({ t: "ready", value: true });
await bis(() => A.room.players.every((p) => p.ready || p.host), "alle bereit");
A.send({ t: "start" });
await bis(() => A.runde?.schlangen?.length === 6, "Runde 1 läuft");

// --- Das Feld ---------------------------------------------------------------

const m0 = A.runde;
muss(m0.w === 32 && m0.h === 24, `Feld ${m0.w}×${m0.h} statt 32×24`);
muss(m0.aepfel.length === 8, "Vier Äpfel sind acht Zahlen, hier: " + m0.aepfel.length);
muss(m0.n === 1 && m0.total === 3, "Runde oder Rundenzahl stimmen nicht");
for (const s of m0.schlangen) {
  muss(s.k.length === 8, `${s.name} startet nicht mit vier Gliedern`);
  muss(s.lebt, `${s.name} lebt schon zu Beginn nicht`);
}
muss(new Set(m0.schlangen.map((s) => s.farbe)).size === 6, "Zwei Schlangen haben dieselbe Farbe");
console.log("ok  32×24, vier Äpfel, sechs Schlangen zu je vier Gliedern in sechs Farben");

// --- Hilfen für die Autopilot-Runde -----------------------------------------

const glieder = (s) => {
  const liste = [];
  for (let i = 0; i < s.k.length; i += 2) liste.push({ x: s.k[i], y: s.k[i + 1] });
  return liste;
};
const kopf = (s) => ({ x: s.k[0], y: s.k[1] });
/** Die Richtung steht nicht in der Nachricht – sie steckt in den ersten zwei Gliedern. */
const richtung = (s) => ({ x: s.k[0] - s.k[2], y: s.k[1] - s.k[3] });

/** Wäre dieser Schritt im nächsten Tick sicher? Der eigene Schwanz zieht weiter. */
function sicher(m, s, dir) {
  const d = RICHTUNGEN[dir];
  const k = kopf(s);
  const nx = k.x + d.x, ny = k.y + d.y;
  if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) return false;
  for (const q of m.schlangen) {
    if (!q.lebt) continue;
    const teile = glieder(q);
    for (let i = 0; i < teile.length - 1; i++) {
      if (teile[i].x === nx && teile[i].y === ny) return false;
    }
    // Auf denselben Punkt zusteuern stirbt auch – Kopf an Kopf.
    if (q.id !== s.id) {
      const qd = richtung(q), qk = kopf(q);
      if (qk.x + qd.x === nx && qk.y + qd.y === ny) return false;
    }
  }
  return true;
}

/**
 * Lenkt jede lebende Schlange auf ein freies Feld, ohne Kehrtwende – und
 * möglichst zum nächsten Apfel. Der Hunger ist Absicht: sonst frisst in vierzig
 * Ticks niemand, und dann bleibt das Wachsen ungeprüft.
 */
function autopilot(m) {
  const aepfel = [];
  for (let i = 0; i < m.aepfel.length; i += 2) aepfel.push({ x: m.aepfel[i], y: m.aepfel[i + 1] });

  for (const s of m.schlangen) {
    if (!s.lebt) continue;
    const c = alleC.find((x) => x.you === s.id);
    if (!c) continue;
    const jetzt = richtung(s);
    const aus = Object.keys(RICHTUNGEN).filter((k) => {
      const d = RICHTUNGEN[k];
      return !(d.x === -jetzt.x && d.y === -jetzt.y) && sicher(m, s, k);
    });
    if (!aus.length) continue;

    const k = kopf(s);
    const naeher = (dir) => {
      const d = RICHTUNGEN[dir];
      const nx = k.x + d.x, ny = k.y + d.y;
      return Math.min(...aepfel.map((a) => Math.abs(a.x - nx) + Math.abs(a.y - ny)));
    };
    aus.sort((a, b) => naeher(a) - naeher(b));
    c.send({ t: "dir", d: aus[0] });
  }
}

// --- Eine Runde mit Autopilot: Bewegung nachrechnen und mitmessen -----------

let vorher = A.runde;
autopilot(vorher);

for (const c of alleC) { c.bytes = 0; c.nachrichten = 0; }
const messStart = Date.now();

let ticks = 0, gewachsen = 0, gegessen = 0;
const kehrtGeprueft = { ok: false };

while (ticks < 40 && A.runde.laeuft) {
  const alt = A.runde;
  await bis(() => A.runde !== alt, "nächster Tick", 3000);
  const neu = A.runde;
  ticks++;

  for (const s of neu.schlangen) {
    const altS = alt.schlangen.find((x) => x.id === s.id);
    if (!altS || !altS.lebt || !s.lebt) continue;
    const k = kopf(s), ak = kopf(altS);
    const dx = Math.abs(k.x - ak.x), dy = Math.abs(k.y - ak.y);
    muss(dx + dy === 1, `${s.name} ist um ${dx}/${dy} gesprungen statt um ein Feld`);
    muss(k.x >= 0 && k.y >= 0 && k.x < neu.w && k.y < neu.h, `${s.name} steht außerhalb des Feldes`);

    const laenge = s.k.length / 2, altLaenge = altS.k.length / 2;
    const punkte = s.punkte - altS.punkte;
    if (laenge > altLaenge) {
      gewachsen++;
      muss(laenge === altLaenge + 1, `${s.name} ist um ${laenge - altLaenge} Glieder gewachsen`);
      muss(punkte === 10, `${s.name} ist gewachsen, hat aber ${punkte} Punkte bekommen`);
      gegessen++;
    } else {
      muss(laenge === altLaenge, `${s.name} ist um ${altLaenge - laenge} Glieder geschrumpft`);
    }
    // Ein Körper darf sich nicht selbst überlappen.
    const felder = glieder(s).map((g) => `${g.x},${g.y}`);
    muss(new Set(felder).size === felder.length, `${s.name} liegt auf sich selbst`);
  }
  muss(neu.aepfel.length === 8, "Es liegen nicht mehr vier Äpfel auf dem Feld");

  // Kehrtwende: einmal probieren, sie muss ignoriert werden.
  if (!kehrtGeprueft.ok) {
    const s = neu.schlangen.find((x) => x.lebt);
    const c = alleC.find((x) => x.you === s.id);
    const d = richtung(s);
    const zurueck = Object.keys(RICHTUNGEN)
      .find((k) => RICHTUNGEN[k].x === -d.x && RICHTUNGEN[k].y === -d.y);
    c.send({ t: "dir", d: zurueck });
    kehrtGeprueft.ok = true;
    kehrtGeprueft.id = s.id;
    kehrtGeprueft.dir = d;
  } else if (kehrtGeprueft.id) {
    const s = neu.schlangen.find((x) => x.id === kehrtGeprueft.id);
    if (s?.lebt) {
      const d = richtung(s);
      muss(!(d.x === -kehrtGeprueft.dir.x && d.y === -kehrtGeprueft.dir.y),
        "Eine Kehrtwende ging durch – die Schlange fährt in den eigenen Hals");
    }
    kehrtGeprueft.id = null;
  }

  autopilot(neu);
  vorher = neu;
}

const dauer = (Date.now() - messStart) / 1000;
muss(gegessen > 0, "In vierzig Ticks hat niemand einen Apfel gefressen – Wachsen ungeprüft");
console.log(`ok  ${ticks} Ticks nachgerechnet: jede Bewegung ein Feld, ${gegessen}× Apfel ` +
  `gefressen und genau dabei gewachsen, immer vier Äpfel auf dem Feld`);
console.log("ok  die Kehrtwende wurde abgelehnt");

// --- Bandbreite --------------------------------------------------------------

const kbs = alleC.map((c) => c.bytes / 1024 / dauer);
const schnitt = kbs.reduce((a, b) => a + b, 0) / kbs.length;
const groesste = Math.max(...kbs);
console.log(`    Bandbreite bei sechs Spielern: ${schnitt.toFixed(1)} KB/s je Spieler ` +
  `(größte ${groesste.toFixed(1)}), ${(A.nachrichten / dauer).toFixed(1)} Nachrichten/s`);
muss(groesste < MAX_KB_S,
  `${groesste.toFixed(1)} KB/s je Spieler – das ist der Cubes-Fehler noch einmal ` +
  `(Grenze ${MAX_KB_S} KB/s)`);
console.log(`ok  unter ${MAX_KB_S} KB/s je Spieler – gemessen, nicht geschätzt`);

// --- Tod an der Wand ---------------------------------------------------------

// Ab jetzt kein Autopilot mehr: alle fahren geradeaus, bis es kracht. Wer als
// Letzter lebt, bekommt zwanzig Punkte fuer die Runde.
const rundeVor = A.runde.n;
await bis(() => !A.runde.laeuft || A.runde.n !== rundeVor, "die Runde geht zu Ende", 20_000);

if (!A.runde.laeuft) {
  const lebende = A.runde.schlangen.filter((s) => s.lebt);
  muss(lebende.length <= 1, "Die Runde endete, obwohl noch mehrere leben");
  muss(A.runde.meldung, "Zum Rundenende steht keine Meldung da");
  console.log(`ok  Runde 1 zu Ende: ${A.runde.meldung}`);
  if (lebende.length === 1) {
    muss(lebende[0].punkte >= 20, "Wer als Letzter lebt, bekommt keine zwanzig Punkte");
    console.log("ok  wer überlebt, bekommt die zwanzig Punkte für die Runde");
  }
}

// --- Runde 2 und 3 laufen ohne Zutun zu Ende --------------------------------

await bis(() => A.runde.n === 2 && A.runde.laeuft, "Runde 2 beginnt", 15_000);
muss(A.runde.schlangen.every((s) => s.k.length === 8), "Runde 2 startet nicht mit vier Gliedern");
muss(A.runde.schlangen.every((s) => s.lebt), "In Runde 2 ist schon jemand tot");
console.log("ok  Runde 2 beginnt neu: alle leben, alle wieder vier Glieder lang");

// Niemand lenkt: die Startpaare fahren frontal aufeinander zu und sterben
// gleichzeitig. Genau das darf nicht von der Reihenfolge im Server abhaengen.
await bis(() => !A.runde.laeuft, "Runde 2 zu Ende", 25_000);
console.log(`ok  ohne Lenken endet die Runde von allein: ${A.runde.meldung?.text}`);

await bis(() => A.final, "Endstand", 60_000);
const f = A.final;
muss(f.tabelle.length === 6, "Im Endstand fehlt jemand");
// Seit dem 02.09.2026 schicken Meldungen ihren Schluessel mit: uebersetzt
// wird im Client, weil am selben Tisch jeder eine andere Sprache haben kann.
// Der deutsche Wortlaut bleibt die Quelle und faehrt als `text` mit.
muss(/3 Runden/.test(f.untertitel?.text ?? ""), "Falsche Rundenzahl: " + JSON.stringify(f.untertitel));
muss(f.untertitel?.k && f.untertitel?.w?.n === 3, "Dem Untertitel fehlt der Schluessel");
muss(A.runde.meldung === null || typeof A.runde.meldung === "object",
  "Eine Meldung kam ohne Schluessel");
for (let i = 1; i < f.tabelle.length; i++) {
  muss(f.tabelle[i - 1].punkte >= f.tabelle[i].punkte, "Der Endstand ist nicht sortiert");
}
console.log("Endstand: " + f.tabelle.map((z) => `${z.name} ${z.wert.text}`).join(" · "));

A.send({ t: "again" });
await bis(() => A.room.phase === "lobby", "zurück im Warteraum");
muss(A.room.players.every((p) => !p.ready), "Bereit wurde nicht zurückgesetzt");
console.log("ok  Nochmal setzt alles zurück");

if (alleC.some((c) => c.fehler.length)) {
  throw new Error("Fehlermeldungen: " + JSON.stringify(alleC.map((c) => c.fehler)));
}
console.log("\nALLES GRÜN");
Deno.exit(0);
