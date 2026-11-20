# cheapllm-bulk-apikey

**Buat akun cheapllm.shop dan kunci API-nya secara massal — sepenuhnya otomatis, tanpa captcha — lalu pakai kuncinya lewat endpoint kompatibel OpenAI (`sk-cheap-…`, DeepSeek V4.1 Flash 1017) atau 9Router lokal.**

- satu perintah, satu pertanyaan: **berapa kunci**
- setiap kunci dibuktikan dengan **chat 200 nyata** sebelum ditulis
- **proxy opsional**: mode langsung berfungsi; `proxies.txt` memberi tiap kunci exit sendiri

## 🚀 Mulai cepat

```bash
git clone https://github.com/F0Rextasy/cheapllm-bulk-apikey
cd cheapllm-bulk-apikey
npm start
```

Lalu:

```
1) Mint keys       — ask how many, then run to the end
```

Ketik angka, Enter. Itu seluruh alurnya: kotak surat baru per akun, pendaftaran, tautan konfirmasi dibaca dari kotak, dibuka, API dipanggil sekali, dan baru setelah itu kunci ditulis ke `keys.txt`.

Tanpa menu:

```bash
node src/cli.js --count 10            # 10 kunci, langsung
node src/cli.js --count 100 --pool proxies.txt   # 100 kunci, satu exit masing-masing
node src/cli.js verify                # uji nyata setiap kunci tersimpan
```

## 🎁 Yang didapat satu akun

| Butir | Nilai |
| --- | --- |
| Panel | [cheapllm.shop](https://cheapllm.shop) |
| Model | `deepseek-v4.1-flash-1017` (konteks 131 072) |
| Selama beta | gratis, tanpa batas laju |
| Setelah beta | **5 000 token masukan + 1 000 keluaran per jam per akun**, tanpa kartu |
| Di atasnya | $0,05 / M masukan · $0,009 / M masukan cache · $0,42 / M keluaran |
| Konkurensi | 1 permintaan berjalan per akun |
| Kunci per akun | 25 di panel; alat ini mengambil **satu kunci per akun**, karena kuota dan slot konkurensi milik akun |
| Satuan yang diskalakan | **satu akun = satu kunci** — `--count N` membuat N akun |

Angka langsung: `curl https://cheapllm.shop/api/config`.

## 🧭 Cara kerjanya

```
kotak baru (temp.tf)          pendaftaran          konfirmasi          gerbang
──────────────────────  →  POST /api/signup  →  GET /verify?token  →  POST /v1/chat
alias plus, domain asli      201 + kunci + cookie  302 verified        200 + teks
```

1. Kotak alias plus baru dibuat di temp.tf (keluarga outlook/hotmail) — atau di mail.tm dengan `--rail mailtm`.
2. `POST /api/signup {email,password,website:"",consent:true}` menjawab **201** dan kunci ada di body yang sama.
3. Panel mengirim tautan konfirmasi. Alat memantau kotak, mengambil `https://cheapllm.shop/verify?token=…`, dan membukanya (**302** ke dasbor).
4. Kunci memanggil `/v1/chat/completions` sekali; 200 dengan teks asisten adalah gerbangnya. Baru setelah itu kunci ditulis.

Tidak ada captcha di rantai ini — tidak ada yang perlu dipecahkan dan tidak ada token untuk ditempel.

## ✅ Gerbang kualitas

- **Kunci hanya ditulis setelah `chat 200` nyata dengan teks.** Gerbang gagal tidak pernah masuk `keys.txt`.
- `node src/cli.js verify` menguji ulang setiap kunci tersimpan dan melaporkan LIVE/DEAD per kunci.
- Timeout tautan, batas per alamat dari panel, dan exit mati muncul sebagai galat eksplisit — alat tidak pernah "menebak" lolos.

## 🛰️ Proxy — opsional

| Mode | Cara | Aturan panel yang berlaku |
| --- | --- | --- |
| Langsung (default) | tanpa `proxies.txt` | **5 akun baru per alamat per jam** — setelah itu `429 Too many new accounts from this address` |
| Pool | satu baris proxy per kunci di `proxies.txt` | tiap kunci memakai **satu exit eksklusif**; exit tidak dipakai ulang |

Dengan `--pool` alat bersifat **fail-closed**: jika exit mati di tengah alur, kunci gagal bersamanya; tidak ada fallback diam-diam ke alamat Anda sendiri. `outputs/exits-used.txt` mencatat exit mana yang membawa akun mana.

## 🔌 Sambung ke 9Router

Menu `4`, atau:

```bash
node src/connect-9router.js --keys keys.txt --base http://localhost:20128 --model deepseek-v4.1-flash-1017
```

Ini mendaftarkan `cheapllm.shop` sebagai penyedia kompatibel OpenAI (`prefix cheapllm`), menambah satu koneksi per kunci, dan mencetak kunci klien. Router kompatibel OpenAI apa pun bekerja sama dengan `base_url: https://cheapllm.shop/v1`.

## ⚙️ Referensi CLI

```
node src/cli.js --count N [--pool proxies.txt] [--rail temptf|mailtm]
                [--delay ms] [--attempts 3] [--txt keys.txt]
                [--accounts outputs/accounts.jsonl] [--model …]
                [--auto] [--dry] [--allow-overlimit]
node src/cli.js verify [--pool proxies.txt]
```

| Flag | Arti |
| --- | --- |
| `--count N` | berapa akun/kunci |
| `--pool FILE` | satu exit per kunci, eksklusif, fail-closed |
| `--rail temptf\|mailtm` | backend kotak surat (default `temptf`) |
| `--delay MS` | jeda antar akun (default 5000) |
| `--attempts N` | exit yang boleh dibakar satu kunci (default 3) |
| `--auto` | tanpa pertanyaan (alurnya memang otomatis) |
| `--dry` | cetak rencana; tanpa permintaan, tanpa tulis |
| `--allow-overlimit` | hanya mode langsung: lewati penjaga lokal 5/jam (panel tetap menolak) |

## 📦 Keluaran

| Berkas | Isi |
| --- | --- |
| `keys.txt` | satu kunci hidup per baris, ditambahkan hanya setelah chat 200 |
| `outputs/accounts.jsonl` | email, kata sandi, kunci, exit, rail, waktu (lokal; gitignored) |
| `outputs/ledger-YYYY-MM-DD.jsonl` | setiap percobaan dengan status dan durasi |
| `outputs/exits-used.txt` | exit yang sudah dipakai (mode pool) |

`keys.txt`, `accounts.jsonl`, `proxies.txt`, dan `outputs/` masuk gitignore — jangan pernah commit kunci, akun, atau endpoint proxy.

## 📁 Struktur proyek

```
src/cli.js               mint, verify, dry run
src/launcher.js          menu sekali klik (npm start)
src/connect-9router.js   konektor 9Router
src/lib/panel.js         signup / verify / chat, identitas per akun
src/lib/temptf.js        kotak temp.tf + pemantauan tautan
src/lib/mailtm.js        kotak mail.tm + pemantauan tautan
src/lib/proxy.js         parsing proxy dan tunnel (tanpa dependensi)
docs/PROTOCOL.md         rantai terukur, endpoint demi endpoint
examples/mint-and-chat.js
```

## ⚠️ Penafian

Tingkat gratis, batas per alamat, dan perilaku email ditetapkan cheapllm.shop dan bisa berubah sewaktu-waktu. Membuat banyak akun dari satu alamat terlihat oleh operator dan ketentuannya mengizinkan pembatasan atau penangguhan akun; gunakan pool proxy dan batch yang wajar. Proyek ini tidak berafiliasi dengan cheapllm.shop. Gunakan dengan risiko sendiri dan hormati ketentuan penyedia.

## 📄 Lisensi

MIT
