# cheapllm-bulk-apikey

**Crie contas cheapllm.shop e suas chaves de API em massa — totalmente automático, sem captcha — e use as chaves via um endpoint compatível com OpenAI (`sk-cheap-…`, DeepSeek V4.1 Flash 1017) ou um 9Router local.**

- um comando, uma pergunta: **quantas chaves**
- cada chave é provada com um **chat 200 real** antes de ser gravada
- **proxy opcional**: o modo direto funciona; um `proxies.txt` dá a cada chave sua própria saída

## 🚀 Início rápido

```bash
git clone https://github.com/F0Rextasy/cheapllm-bulk-apikey
cd cheapllm-bulk-apikey
npm start
```

Depois:

```
1) Mint keys       — ask how many, then run to the end
```

Digite um número e Enter. Esse é todo o fluxo: uma caixa nova por conta, cadastro, leitura do link de confirmação, abertura do link, uma chamada à API — só então a chave é gravada em `keys.txt`.

Sem menu:

```bash
node src/cli.js --count 10            # 10 chaves, direto
node src/cli.js --count 100 --pool proxies.txt   # 100 chaves, uma saída cada
node src/cli.js verify                # teste real de cada chave salva
```

## 🎁 O que uma conta recebe

| Item | Valor |
| --- | --- |
| Painel | [cheapllm.shop](https://cheapllm.shop) |
| Modelo | `deepseek-v4.1-flash-1017` (contexto 131 072) |
| Durante o beta | grátis, sem limite de taxa |
| Após o beta | **5 000 tokens de entrada + 1 000 de saída por hora por conta**, sem cartão |
| Acima disso | $0,05 / M entrada · $0,009 / M entrada em cache · $0,42 / M saída |
| Concorrência | 1 requisição em andamento por conta |
| Chaves por conta | 25 no painel; esta ferramenta usa **uma chave por conta**, pois a cota e o slot de concorrência são da conta |
| Unidade que escala | **uma conta = uma chave** — `--count N` cria N contas |

Números ao vivo: `curl https://cheapllm.shop/api/config`.

## 🧭 Como funciona

```
caixa nova (temp.tf)          cadastro             confirmação        portão
───────────────────────  →  POST /api/signup  →  GET /verify?token  →  POST /v1/chat
alias plus, domínio real     201 + chave + cookie  302 verified        200 + texto
```

1. Uma caixa alias plus nova é criada no temp.tf (família outlook/hotmail) — ou no mail.tm com `--rail mailtm`.
2. `POST /api/signup {email,password,website:"",consent:true}` responde **201** e entrega a chave no mesmo corpo.
3. O painel envia um link de confirmação. A ferramenta consulta a caixa, extrai `https://cheapllm.shop/verify?token=…` e o abre (**302** para o painel).
4. A chave chama `/v1/chat/completions` uma vez; um 200 com texto do assistente é o portão. Só então a chave é gravada.

Nenhum captcha aparece nesta cadeia: não há nada para resolver nem token para colar.

## ✅ Portões de qualidade

- **Uma chave só é gravada após um `chat 200` real com texto.** Um portão que falha nunca chega ao `keys.txt`.
- `node src/cli.js verify` retesta cada chave salva e reporta LIVE/DEAD por chave.
- Timeouts do link, o limite por endereço do painel e saídas mortas aparecem como erros explícitos — a ferramenta nunca "adivinha" aprovação.

## 🛰️ Proxies — opcional

| Modo | Como | Regra do painel que se aplica |
| --- | --- | --- |
| Direto (padrão) | sem `proxies.txt` | **5 contas novas por endereço por hora** — depois `429 Too many new accounts from this address` |
| Pool | uma linha de proxy por chave em `proxies.txt` | cada chave usa **uma saída exclusiva**; nenhuma saída é reutilizada |

Com `--pool` a ferramenta é **fail-closed**: se a saída morre no meio, a chave falha junto; não há fallback silencioso para o seu endereço. `outputs/exits-used.txt` registra qual saída levou qual conta.

## 🔌 Conectar ao 9Router

Menu `4`, ou:

```bash
node src/connect-9router.js --keys keys.txt --base http://localhost:20128 --model deepseek-v4.1-flash-1017
```

Isso registra `cheapllm.shop` como provedor compatível com OpenAI (`prefix cheapllm`), adiciona uma conexão por chave e imprime uma chave de cliente. Qualquer router compatível com OpenAI funciona igual com `base_url: https://cheapllm.shop/v1`.

## ⚙️ Referência da CLI

```
node src/cli.js --count N [--pool proxies.txt] [--rail temptf|mailtm]
                [--delay ms] [--attempts 3] [--txt keys.txt]
                [--accounts outputs/accounts.jsonl] [--model …]
                [--auto] [--dry] [--allow-overlimit]
node src/cli.js verify [--pool proxies.txt]
```

| Flag | Significado |
| --- | --- |
| `--count N` | quantas contas/chaves |
| `--pool FILE` | uma saída por chave, exclusiva, fail-closed |
| `--rail temptf\|mailtm` | backend de caixa (padrão `temptf`) |
| `--delay MS` | pausa entre contas (padrão 5000) |
| `--attempts N` | saídas que uma chave pode queimar (padrão 3) |
| `--auto` | sem perguntas (o fluxo já é automático) |
| `--dry` | mostra o plano; nenhuma requisição, nenhuma escrita |
| `--allow-overlimit` | só no direto: ignora o guarda local de 5/h (o painel recusará igual) |

## 📦 Saída

| Arquivo | Conteúdo |
| --- | --- |
| `keys.txt` | uma chave viva por linha, adicionada só após chat 200 |
| `outputs/accounts.jsonl` | e-mail, senha, chave, saída, rail, horário (local; gitignored) |
| `outputs/ledger-YYYY-MM-DD.jsonl` | cada tentativa com status e duração |
| `outputs/exits-used.txt` | saídas já gastas (modo pool) |

`keys.txt`, `accounts.jsonl`, `proxies.txt` e `outputs/` estão no gitignore — nunca faça commit de chaves, contas ou endpoints de proxy.

## 📁 Estrutura do projeto

```
src/cli.js               mint, verify, dry run
src/launcher.js          menu de um clique (npm start)
src/connect-9router.js   conector 9Router
src/lib/panel.js         signup / verify / chat, identidade por conta
src/lib/temptf.js        caixas temp.tf + polling de links
src/lib/mailtm.js        caixas mail.tm + polling de links
src/lib/proxy.js         parsing de proxies e túneis (zero dependências)
docs/PROTOCOL.md         a cadeia medida, endpoint por endpoint
examples/mint-and-chat.js
```

## ⚠️ Aviso

O nível gratuito, o limite por endereço e o comportamento do e-mail são definidos pelo cheapllm.shop e podem mudar sem aviso. Criar muitas contas de um endereço é visível para o operador e os termos permitem limitar ou suspender contas; use um pool de proxies e lotes moderados. Este projeto não é afiliado ao cheapllm.shop. Use por sua conta e risco e respeite os termos do provedor.

## 📄 Licença

MIT
