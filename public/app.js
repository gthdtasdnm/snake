// SNAKE – Client: Feld zeichnen, Richtung schicken. Mehr nicht.
import { $, el, S, satz, schicke, starteSchale, zeige } from "./schale.js";
import { starteSprache, t, uebersetze } from "./sprache.js";
import { WOERTER } from "./texte.js";

// Vor allem, was zeichnet: der Warteraum soll gleich in der richtigen Sprache
// dastehen. Deutsch steht im HTML und in den Aufrufen hier.
starteSprache(WOERTER);

const HILFE = [
  ["snake.h1", "<b>Alle Schlangen auf einem Feld.</b> Jeder hat sein eigenes Handy, gespielt wird gegeneinander."],
  ["snake.h2", "<b>Wischen oder Pfeiltasten</b> ändern die Richtung. Kehrtwende geht nicht."],
  ["snake.h3", "<b>Äpfel machen länger</b> und geben 10 Punkte."],
  ["snake.h4", "<b>Wand, fremde Schlange, eigener Körper</b> – alles tödlich. Wer zuletzt lebt, bekommt 20 Punkte."],
  ["snake.h5", "<b>Die Bewegung läuft auf dem Server</b>, damit alle denselben Zusammenstoß sehen."],
];

const zeichneHilfe = () => {
  $("helpList").innerHTML = HILFE.map(([k, d]) => `<li>${t(k, {}, d)}</li>`).join("");
};

let leinwand = null, ctx = null;

function baueBuehne() {
  const b = $("buehne");
  if (b.dataset.fertig) return;
  b.dataset.fertig = "1";
  b.innerHTML = "";
  leinwand = el("canvas", "feld");
  b.append(leinwand);
  const tafel = el("div", "punkttafel");
  tafel.id = "punkttafel";
  b.append(tafel);
  ctx = leinwand.getContext("2d");

  // Wischen
  let start = null;
  leinwand.addEventListener("touchstart", (e) => {
    start = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });
  leinwand.addEventListener("touchmove", (e) => {
    if (!start) return;
    const dx = e.touches[0].clientX - start.x;
    const dy = e.touches[0].clientY - start.y;
    if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
    lenke(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "rechts" : "links") : (dy > 0 ? "runter" : "hoch"));
    start = null;
  }, { passive: true });
}

const lenke = (d) => schicke({ t: "dir", d });

addEventListener("keydown", (e) => {
  const k = {
    ArrowUp: "hoch", ArrowDown: "runter", ArrowLeft: "links", ArrowRight: "rechts",
    w: "hoch", s: "runter", a: "links", d: "rechts",
  }[e.key];
  if (k) { e.preventDefault(); lenke(k); }
});

function zeichneSpiel(m) {
  zeige("game");
  baueBuehne();
  $("tbLinks").innerHTML =
    `${t("snake.runde", {}, "Runde")} <strong>${m.n}</strong>/${m.total}`;
  $("tbTag").textContent = m.laeuft
    ? t("snake.laeuft", {}, "läuft")
    : t("snake.pause", {}, "Pause");
  // `m.meldung` kommt vom Server und bringt ihren Schluessel mit.
  if (m.meldung) $("rundenHint").textContent = satz(m.meldung);
  else if (m.laeuft) {
    $("rundenHint").textContent = t("snake.wischen", {}, "Wischen oder Pfeiltasten.");
  }

  const breite = Math.min(leinwand.parentElement.clientWidth, 620);
  const zell = Math.max(6, Math.floor(breite / m.w));
  const pw = zell * m.w, ph = zell * m.h;
  if (leinwand.width !== pw || leinwand.height !== ph) {
    leinwand.width = pw;
    leinwand.height = ph;
  }
  ctx.fillStyle = "#0d0819";
  ctx.fillRect(0, 0, pw, ph);
  ctx.strokeStyle = "rgba(160,120,255,.10)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= m.w; x++) {
    ctx.beginPath(); ctx.moveTo(x * zell, 0); ctx.lineTo(x * zell, ph); ctx.stroke();
  }
  for (let y = 0; y <= m.h; y++) {
    ctx.beginPath(); ctx.moveTo(0, y * zell); ctx.lineTo(pw, y * zell); ctx.stroke();
  }

  ctx.fillStyle = "#ff4d5e";
  for (let i = 0; i < m.aepfel.length; i += 2) {
    ctx.beginPath();
    ctx.arc((m.aepfel[i] + .5) * zell, (m.aepfel[i + 1] + .5) * zell, zell * .35, 0, 7);
    ctx.fill();
  }

  for (const s of m.schlangen) {
    ctx.globalAlpha = s.lebt ? 1 : .28;
    ctx.fillStyle = s.farbe;
    for (let i = 0; i < s.k.length; i += 2) {
      const r = i === 0 ? 3 : 2;
      ctx.fillRect(s.k[i] * zell + 1, s.k[i + 1] * zell + 1, zell - 2, zell - 2);
      if (i === 0 && s.id === S.me) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.strokeRect(s.k[i] * zell + 1, s.k[i + 1] * zell + 1, zell - 2, zell - 2);
      }
      void r;
    }
  }
  ctx.globalAlpha = 1;

  const tafel = $("punkttafel");
  tafel.innerHTML = "";
  for (const s of [...m.schlangen].sort((a, b) => b.punkte - a.punkte)) {
    const p = el("span", "pt" + (s.lebt ? "" : " tot"));
    const punkt = el("i");
    punkt.style.background = s.farbe;
    p.append(punkt, document.createTextNode(`${s.name} ${s.punkte}`));
    tafel.append(p);
  }

  const akt = $("aktionen");
  if (!akt.dataset.fertig) {
    akt.dataset.fertig = "1";
    akt.innerHTML = "";
    const kreuz = el("div", "kreuz");
    for (const [t, d] of [["↑", "hoch"], ["←", "links"], ["→", "rechts"], ["↓", "runter"]]) {
      const b = el("button", "btn richt " + d, t);
      b.onclick = () => lenke(d);
      kreuz.append(b);
    }
    akt.append(kreuz);
  }
}

zeichneHilfe();

// Rundenzahl als Host einstellen
const extra = $("hostExtra");
extra.innerHTML = `<div class="setting"><span class="setting-label" data-t="snake.runden">Runden</span>
  <div class="segmented">
    <button class="seg" data-runden="1">1</button>
    <button class="seg sel" data-runden="3">3</button>
    <button class="seg" data-runden="5">5</button>
  </div></div>`;
uebersetze(extra);
document.addEventListener("sprachwechsel", zeichneHilfe);

for (const b of extra.querySelectorAll("[data-runden]")) {
  b.onclick = () => schicke({ t: "settings", runden: Number(b.dataset.runden) });
}

starteSchale({
  key: "snake",
  zeichneSpiel,
  zeichneRaum: (r) => {
    for (const b of extra.querySelectorAll("[data-runden]")) {
      b.classList.toggle("sel", Number(b.dataset.runden) === r.settings.runden);
    }
  },
});
