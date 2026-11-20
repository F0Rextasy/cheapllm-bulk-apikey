# cheapllm-bulk-apikey

**Crea en masa cuentas de cheapllm.shop y sus claves API — totalmente automático, sin captcha — y usa las claves mediante un endpoint compatible con OpenAI (`sk-cheap-…`, DeepSeek V4.1 Flash 1017) o un 9Router local.**

- un comando, una pregunta: **cuántas claves**
- cada clave se prueba con un **chat 200 real** antes de guardarse
- **proxy opcional**: el modo directo funciona; un `proxies.txt` da a cada clave su propia salida

## 🚀 Inicio rápido

```bash
git clone https://github.com/F0Rextasy/cheapllm-bulk-apikey
cd cheapllm-bulk-apikey
npm start
```

Después:

```
1) Mint keys       — ask how many, then run to the end
```

Escribe un número y pulsa Enter. Ese es todo el flujo: se crea un buzón nuevo por cuenta, se registra, se lee el enlace de confirmación del buzón, se abre, se llama a la API una vez y solo entonces la clave se añade a `keys.txt`.

Sin menú:

```bash
node src/cli.js --count 10            # 10 claves, directo
node src/cli.js --count 100 --pool proxies.txt   # 100 claves, una salida cada una
node src/cli.js verify                # prueba real de cada clave guardada
```

## 🎁 Qué obtiene una cuenta

| Punto | Valor |
| --- | --- |
| Panel | [cheapllm.shop](https://cheapllm.shop) |
| Modelo | `deepseek-v4.1-flash-1017` (contexto 131 072) |
| Durante la beta | gratis, sin límite de velocidad |
| Tras la beta | **5 000 tokens de entrada + 1 000 de salida por hora y cuenta**, sin tarjeta |
| Más allá | $0,05 / M entrada · $0,009 / M entrada cacheada · $0,42 / M salida |
| Concurrencia | 1 petición en vuelo por cuenta |
| Claves por cuenta | 25 en el panel; esta herramienta toma **una clave por cuenta**, porque la cuota y el turno de concurrencia son de la cuenta |
| Unidad que escala | **una cuenta = una clave** — `--count N` crea N cuentas |

Cifras en vivo: `curl https://cheapllm.shop/api/config`.

## 🧭 Cómo funciona

```
buzón nuevo (temp.tf)          registro             confirmación        puerta
───────────────────────  →  POST /api/signup  →  GET /verify?token  →  POST /v1/chat
alias plus, dominio real     201 + clave + cookie   302 verified        200 + texto
```

1. Se crea un buzón alias plus nuevo en temp.tf (familia outlook/hotmail) — o en mail.tm con `--rail mailtm`.
2. `POST /api/signup {email,password,website:"",consent:true}` responde **201** y entrega la clave en el mismo cuerpo.
3. El panel envía un enlace de confirmación. La herramienta consulta el buzón, extrae `https://cheapllm.shop/verify?token=…` y lo abre (**302** al panel).
4. La clave llama una vez a `/v1/chat/completions`; un 200 con texto del asistente es la puerta. Solo entonces se escribe la clave.

En esta cadena no aparece ningún captcha: no hay nada que resolver ni token que pegar.

## ✅ Puertas de calidad

- **Una clave solo se escribe tras un `chat 200` real con texto.** Una puerta fallida nunca llega a `keys.txt`.
- `node src/cli.js verify` vuelve a probar cada clave guardada y reporta LIVE/DEAD por clave.
- Los tiempos de espera del enlace, el límite por dirección del panel y las salidas muertas aparecen como errores explícitos — la herramienta nunca "adivina" un aprobado.

## 🛰️ Proxies — opcional

| Modo | Cómo | Regla del panel que aplica |
| --- | --- | --- |
| Directo (por defecto) | sin `proxies.txt` | **5 cuentas nuevas por dirección y hora** — después responde `429 Too many new accounts from this address` |
| Pool | una línea de proxy por clave en `proxies.txt` | cada clave toma **una salida exclusiva**; ninguna salida se reutiliza |

Con `--pool` la herramienta es **fail-closed**: si la salida muere a mitad del flujo, la clave falla con ella; no hay retorno silencioso a tu propia dirección. `outputs/exits-used.txt` registra qué salida llevó cada cuenta.

## 🔌 Conectar con 9Router

Menú `4`, o:

```bash
node src/connect-9router.js --keys keys.txt --base http://localhost:20128 --model deepseek-v4.1-flash-1017
```

Registra `cheapllm.shop` como proveedor compatible con OpenAI (`prefix cheapllm`), añade una conexión por clave e imprime una clave de cliente. Cualquier router compatible con OpenAI funciona igual con `base_url: https://cheapllm.shop/v1`.

## ⚙️ Referencia CLI

```
node src/cli.js --count N [--pool proxies.txt] [--rail temptf|mailtm]
                [--delay ms] [--attempts 3] [--txt keys.txt]
                [--accounts outputs/accounts.jsonl] [--model …]
                [--auto] [--dry] [--allow-overlimit]
node src/cli.js verify [--pool proxies.txt]
```

| Flag | Significado |
| --- | --- |
| `--count N` | cuántas cuentas/claves |
| `--pool FILE` | una salida por clave, exclusiva, fail-closed |
| `--rail temptf\|mailtm` | backend de buzón (por defecto `temptf`) |
| `--delay MS` | pausa entre cuentas (por defecto 5000) |
| `--attempts N` | salidas que una clave puede quemar (por defecto 3) |
| `--auto` | sin preguntas (el flujo ya es automático) |
| `--dry` | muestra el plan; no hace peticiones ni escribe nada |
| `--allow-overlimit` | solo directo: omite el guardián local de 5/h (el panel rechazará igual) |

## 📦 Salida

| Archivo | Contenido |
| --- | --- |
| `keys.txt` | una clave viva por línea, añadida solo tras chat 200 |
| `outputs/accounts.jsonl` | correo, contraseña, clave, salida, rail, marca de tiempo (local; gitignored) |
| `outputs/ledger-YYYY-MM-DD.jsonl` | cada intento con su estado y duración |
| `outputs/exits-used.txt` | salidas ya gastadas (modo pool) |

`keys.txt`, `accounts.jsonl`, `proxies.txt` y `outputs/` están gitignored — nunca hagas commit de claves, cuentas ni endpoints de proxy.

## 📁 Estructura del proyecto

```
src/cli.js               mint, verify, dry run
src/launcher.js          menú de un clic (npm start)
src/connect-9router.js   conector de 9Router
src/lib/panel.js         signup / verify / chat, identidad por cuenta
src/lib/temptf.js        buzones temp.tf + sondeo de enlaces
src/lib/mailtm.js        buzones mail.tm + sondeo de enlaces
src/lib/proxy.js         parseo de proxies y túneles (sin dependencias)
docs/PROTOCOL.md         la cadena medida, endpoint por endpoint
examples/mint-and-chat.js
```

## ⚠️ Aviso

El nivel gratuito, el límite por dirección y el comportamiento del correo los fija cheapllm.shop y pueden cambiar sin aviso. Crear muchas cuentas desde una dirección es visible para el operador y sus términos le permiten limitar o suspender cuentas; usa un pool de proxies y lotes moderados. Este proyecto no está afiliado a cheapllm.shop. Úsalo bajo tu responsabilidad y respetando los términos del proveedor.

## 📄 Licencia

MIT
