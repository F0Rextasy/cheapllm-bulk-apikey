# cheapllm-bulk-apikey

**cheapllm.shop-Konten und ihre API-Schlüssel im Bulk erzeugen — vollautomatisch, ohne Captcha — und die Schlüssel über einen OpenAI-kompatiblen Endpunkt (`sk-cheap-…`, DeepSeek V4.1 Flash 1017) oder einen lokalen 9Router nutzen.**

- ein Befehl, eine Frage: **wie viele Schlüssel**
- jeder Schlüssel wird mit einem **echten Chat-200** geprüft, bevor er geschrieben wird
- **Proxy optional**: Direktläufe funktionieren; eine `proxies.txt` gibt jedem Schlüssel einen eigenen Exit

## 🚀 Schnellstart

```bash
git clone https://github.com/F0Rextasy/cheapllm-bulk-apikey
cd cheapllm-bulk-apikey
npm start
```

Dann:

```
1) Mint keys       — ask how many, then run to the end
```

Zahl eingeben, Enter. Das ist der ganze Ablauf: pro Konto wird ein frisches Postfach erzeugt, registriert, der Bestätigungslink aus dem Postfach gelesen, geöffnet, die API einmal aufgerufen — erst danach landet der Schlüssel in `keys.txt`.

Ohne Menü:

```bash
node src/cli.js --count 10            # 10 Schlüssel, direkt
node src/cli.js --count 100 --pool proxies.txt   # 100 Schlüssel, je ein Exit
node src/cli.js verify                # Live-Prüfung aller gespeicherten Schlüssel
```

## 🎁 Was ein Konto bekommt

| Punkt | Wert |
| --- | --- |
| Panel | [cheapllm.shop](https://cheapllm.shop) |
| Modell | `deepseek-v4.1-flash-1017` (131 072 Token Kontext) |
| Während der Beta | kostenlos, kein Rate-Limit |
| Nach der Beta | **5 000 Input- + 1 000 Output-Token pro Stunde pro Konto**, keine Karte |
| Darüber hinaus | $0,05 / M Input · $0,009 / M gecachter Input · $0,42 / M Output |
| Parallelität | 1 laufende Anfrage pro Konto |
| Schlüssel pro Konto | 25 im Panel; dieses Tool nimmt **einen Schlüssel pro Konto**, weil Quota und Parallelitäts-Slot am Konto hängen |
| Skalierungseinheit | **ein Konto = ein Schlüssel** — `--count N` erzeugt N Konten |

Live-Zahlen: `curl https://cheapllm.shop/api/config`.

## 🧭 So funktioniert es

```
frisches Postfach (temp.tf)      Registrierung        Bestätigung        Gate
───────────────────────────  →  POST /api/signup  →  GET /verify?token  →  POST /v1/chat
Plus-Alias, echte Domain        201 + Key + Cookie    302 verified        200 + Text
```

1. Ein frisches Plus-Alias-Postfach entsteht bei temp.tf (Outlook/Hotmail-Familie) — oder mit `--rail mailtm` bei mail.tm.
2. `POST /api/signup {email,password,website:"",consent:true}` antwortet **201** und liefert den Schlüssel im selben Body.
3. Das Panel mailt einen Bestätigungslink. Das Tool pollt das Postfach, extrahiert `https://cheapllm.shop/verify?token=…` und öffnet ihn (**302** zum Dashboard).
4. Der Schlüssel ruft einmal `/v1/chat/completions` auf; ein 200 mit Assistenten-Text ist das Gate. Erst dann wird der Schlüssel geschrieben.

In dieser Kette erscheint kein Captcha — es gibt nichts zu lösen und keinen Token einzufügen.

## ✅ Qualitätsgates

- **Ein Schlüssel wird erst nach einem echten `chat 200` mit Text geschrieben.** Ein fehlgeschlagenes Gate landet nie in `keys.txt`.
- `node src/cli.js verify` prüft jeden gespeicherten Schlüssel erneut und meldet LIVE/DEAD je Schlüssel.
- Timeouts beim Bestätigungslink, das Adress-Limit des Panels und tote Exits erscheinen als klare Fehler — das Tool rät nie einen Erfolg.

## 🛰️ Proxys — optional

| Modus | Vorgehen | Geltende Panel-Regel |
| --- | --- | --- |
| Direkt (Standard) | keine `proxies.txt` | **5 neue Konten pro Adresse pro Stunde** — danach `429 Too many new accounts from this address` |
| Pool | eine Proxy-Zeile pro Schlüssel in `proxies.txt` | jeder Schlüssel nimmt **einen exklusiven Exit**; kein Exit wird wiederverwendet |

Mit `--pool` arbeitet das Tool **fail-closed**: stirbt der Exit mitten im Ablauf, scheitert der Schlüssel mit ihm; es gibt keinen stillen Fallback auf deine eigene Adresse. `outputs/exits-used.txt` hält fest, welcher Exit welches Konto getragen hat.

## 🔌 9Router anbinden

Menüpunkt `4`, oder:

```bash
node src/connect-9router.js --keys keys.txt --base http://localhost:20128 --model deepseek-v4.1-flash-1017
```

Das registriert `cheapllm.shop` als OpenAI-kompatiblen Provider (`prefix cheapllm`), legt pro Schlüssel eine Verbindung an und gibt einen Client-Key aus. Jeder OpenAI-kompatible Router funktioniert genauso mit `base_url: https://cheapllm.shop/v1`.

## ⚙️ CLI-Referenz

```
node src/cli.js --count N [--pool proxies.txt] [--rail temptf|mailtm]
                [--delay ms] [--attempts 3] [--txt keys.txt]
                [--accounts outputs/accounts.jsonl] [--model …]
                [--auto] [--dry] [--allow-overlimit]
node src/cli.js verify [--pool proxies.txt]
```

| Flag | Bedeutung |
| --- | --- |
| `--count N` | Anzahl der Konten/Schlüssel |
| `--pool FILE` | ein Exit pro Schlüssel, exklusiv, fail-closed |
| `--rail temptf\|mailtm` | Postfach-Backend (Standard `temptf`) |
| `--delay MS` | Pause zwischen Konten (Standard 5000) |
| `--attempts N` | Exits, die ein Schlüssel verbrauchen darf (Standard 3) |
| `--auto` | keine Rückfragen (der Lauf ist ohnehin automatisch) |
| `--dry` | Plan anzeigen; keine Anfrage, keine Datei |
| `--allow-overlimit` | nur Direktmodus: den lokalen 5-pro-Stunde-Wächter überspringen (das Panel lehnt trotzdem ab) |

## 📦 Ausgabe

| Datei | Inhalt |
| --- | --- |
| `keys.txt` | ein aktiver Schlüssel pro Zeile, erst nach Chat-200 angehängt |
| `outputs/accounts.jsonl` | E-Mail, Passwort, Schlüssel, Exit, Rail, Zeitstempel (lokal; gitignored) |
| `outputs/ledger-YYYY-MM-DD.jsonl` | jeder Versuch mit Status und Dauer |
| `outputs/exits-used.txt` | bereits verbrauchte Exits (Pool-Läufe) |

`keys.txt`, `accounts.jsonl`, `proxies.txt` und `outputs/` sind gitignored — niemals Schlüssel, Konten oder Proxy-Endpunkte committen.

## 📁 Projektstruktur

```
src/cli.js               Mint, Verify, Dry-Run
src/launcher.js          Ein-Klick-Menü (npm start)
src/connect-9router.js   9Router-Connector
src/lib/panel.js         Signup / Verify / Chat, Identität pro Konto
src/lib/temptf.js        temp.tf-Postfächer + Link-Polling
src/lib/mailtm.js        mail.tm-Postfächer + Link-Polling
src/lib/proxy.js         Proxy-Parsing und Tunnel (keine Abhängigkeiten)
docs/PROTOCOL.md         die gemessene Kette, Endpunkt für Endpunkt
examples/mint-and-chat.js
```

## ⚠️ Haftungsausschluss

Free-Tier, Adress-Limit und Bestätigungsmail-Verhalten setzt cheapllm.shop und kann sie jederzeit ändern. Viele Konten von einer Adresse sind für den Betreiber sichtbar; seine Bedingungen erlauben ihm, Konten zu begrenzen oder zu sperren. Nutze einen Proxy-Pool und maßvolle Chargen. Dieses Projekt ist nicht mit cheapllm.shop verbunden. Nutzung auf eigenes Risiko und im Rahmen der Bedingungen des Anbieters.

## 📄 Lizenz

MIT
