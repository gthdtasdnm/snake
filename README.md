# Snake 🐍

Alle Schlangen auf **einem** Feld, jeder auf seinem eigenen Handy. Wand, fremde
Schlange, eigener Körper – alles tödlich. Wer zuletzt lebt, gewinnt die Runde.

**Die Bewegung läuft auf dem Server.** Genau andersherum als das gelöschte
Kurven: sähe jedes Gerät seine eigene Physik, sähen zwei Geräte verschiedene
Zusammenstöße, und niemand könnte sich einigen, wer zuerst dran war.

Läuft auf **Deno**, ohne eine einzige externe Abhängigkeit. Kein Build-Schritt,
kein `node_modules`, ein Prozess.

---

## Starten

```bash
deno task dev          # http://localhost:8068/
PORT=9000 deno task dev
deno task check        # Typprüfung
deno task probe        # spielt drei Runden mit sechs Clients (Server muss laufen)
```

## An den Tisch kommen

Name eintippen, **Raum eröffnen** oder über die Liste bzw. den vierstelligen
**Code** beitreten. **Zwei bis sechs** Leute. Der Host stellt **1, 3 oder 5**
Runden ein.

## Das Feld

| | |
|---|---|
| Größe | 32 × 24 Felder |
| Schritt | alle 130 ms |
| Startlänge | 4 Glieder |
| Äpfel | immer 4 auf dem Feld |
| Pause zwischen Runden | 4 s |

Startplätze liegen auf zwei Spalten verteilt, Blickrichtung zur Mitte. Wer
nicht lenkt, fährt seinem Gegenüber frontal in den Kopf – und dann sterben
**beide**. Dass das nicht von der Reihenfolge im Server abhängt, ist der Grund,
warum erst alle Köpfe gesetzt und dann alle Zusammenstöße geprüft werden.

## Punkte

| Wofür | Punkte |
|---|---|
| Apfel | 10 |
| je noch lebender Gegner beim eigenen Tod | 1 |
| als Letzter überleben | 20 |

Wischen oder Pfeiltasten ändern die Richtung. **Kehrtwende geht nicht** – sonst
fährt man in den eigenen Hals.

## Bandbreite

Bei Cubes waren 25 Quadrate pro Nachricht **148 KB/s je Spieler**, und
aufgefallen ist das erst im Betrieb. Snake schickt alle 130 ms alle Körper an
alle; geschätzt war das unkritisch, gemessen hatte es niemand.

Jetzt schon. Bei **sechs Spielern** – der vollen Besetzung und damit dem
teuersten Fall – sind es rund **7 KB/s je Spieler** bei 7,7 Nachrichten/s.
`probe.js` misst das bei jedem Lauf mit und wirft ab 25 KB/s.

Der Trick dabei ist die Nachricht selbst: Körper gehen flach als Zahlenreihe
(`[x, y, x, y, …]`) statt als Objekte – halb so viele Zeichen pro Glied.

## Was `probe.js` sonst prüft

Sechs Clients, vierzig Ticks lang mit einem kleinen Autopiloten, der freie
Felder sucht und dabei absichtlich hungrig ist – sonst frisst in vierzig Ticks
niemand und das Wachsen bliebe ungeprüft. In jedem Tick: jede Bewegung genau
ein Feld, kein Körper auf sich selbst, immer vier Äpfel, gewachsen genau dann,
wenn es zehn Punkte gab. Danach lenkt niemand mehr, und die Startpaare fahren
frontal ineinander.

## Wenn jemand geht

- Wer geht, stirbt sofort. Es gibt keine Karenzzeit, in der eine tote Schlange
  im Weg liegt.
- Bleibt einer übrig, endet die Runde.
- Sind es weniger als zwei, endet die Partie nach der Pause.

## Dateien

| Datei | Was |
|---|---|
| `server.js` | Feld, Uhr, Bewegung, Zusammenstöße, Äpfel, Runden |
| `probe.js` | sechs Clients, Bewegung nachgerechnet, Bandbreite gemessen |
| `bremse.js`, `raum.js`, `statisch.js` | gemeinsam, **wortgleich in allen Spielen** |
| `public/index.html` | alle vier Bildschirme plus die Hilfe |
| `public/schale.js` | gemeinsame Client-Schale (Verbindung, Lobby) |
| `public/style.css` | Lobby-Basis, gemeinsamer Rahmen, darunter das Eigene |
| `public/app.js` | Leinwand, Wischen, Punktestand |

## Betrieb

Port **8068**, gebunden auf `127.0.0.1`, davor Apache als Reverse Proxy unter
`/snake/`. Dienst: `snake.service` (systemd, läuft als `www-data`).

```bash
systemctl status snake
journalctl -u snake -f
```

Der Zustand liegt vollständig im RAM. Ein Neustart wirft alle laufenden Partien
weg – das ist gewollt, es gibt nichts zu sichern.
