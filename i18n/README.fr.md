# cheapllm-bulk-apikey

**Créez en masse des comptes cheapllm.shop et leurs clés API — entièrement automatique, sans captcha — puis utilisez les clés via un point d'accès compatible OpenAI (`sk-cheap-…`, DeepSeek V4.1 Flash 1017) ou un 9Router local.**

- une commande, une question : **combien de clés**
- chaque clé est prouvée par un **chat 200 réel** avant d'être écrite
- **proxy en option** : le mode direct fonctionne ; un `proxies.txt` donne à chaque clé sa propre sortie

## 🚀 Démarrage rapide

```bash
git clone https://github.com/F0Rextasy/cheapllm-bulk-apikey
cd cheapllm-bulk-apikey
npm start
```

Puis :

```
1) Mint keys       — ask how many, then run to the end
```

Tapez un nombre, Entrée. C'est tout le flux : une boîte neuve par compte, inscription, lecture du lien de confirmation, ouverture du lien, un appel à l'API — la clé n'est écrite qu'ensuite dans `keys.txt`.

Sans menu :

```bash
node src/cli.js --count 10            # 10 clés, direct
node src/cli.js --count 100 --pool proxies.txt   # 100 clés, une sortie chacune
node src/cli.js verify                # contrôle réel de chaque clé enregistrée
```

## 🎁 Ce qu'un compte obtient

| Point | Valeur |
| --- | --- |
| Panneau | [cheapllm.shop](https://cheapllm.shop) |
| Modèle | `deepseek-v4.1-flash-1017` (contexte 131 072) |
| Pendant la bêta | gratuit, sans limite de débit |
| Après la bêta | **5 000 tokens d'entrée + 1 000 de sortie par heure et par compte**, sans carte |
| Au-delà | 0,05 $ / M entrée · 0,009 $ / M entrée en cache · 0,42 $ / M sortie |
| Concurrence | 1 requête en cours par compte |
| Clés par compte | 25 sur le panneau ; cet outil prend **une clé par compte**, car le quota et le créneau de concurrence appartiennent au compte |
| Unité qui passe à l'échelle | **un compte = une clé** — `--count N` crée N comptes |

Chiffres en direct : `curl https://cheapllm.shop/api/config`.

## 🧭 Comment ça marche

```
boîte neuve (temp.tf)          inscription          confirmation        porte
───────────────────────  →  POST /api/signup  →  GET /verify?token  →  POST /v1/chat
alias plus, vrai domaine     201 + clé + cookie     302 verified        200 + texte
```

1. Une boîte alias plus neuve est créée sur temp.tf (famille outlook/hotmail) — ou sur mail.tm avec `--rail mailtm`.
2. `POST /api/signup {email,password,website:"",consent:true}` répond **201** et renvoie la clé dans le même corps.
3. Le panneau envoie un lien de confirmation. L'outil interroge la boîte, extrait `https://cheapllm.shop/verify?token=…` et l'ouvre (**302** vers le tableau de bord).
4. La clé appelle une fois `/v1/chat/completions` ; un 200 avec du texte d'assistant est la porte. La clé n'est écrite qu'après.

Aucun captcha n'apparaît dans cette chaîne : rien à résoudre, aucun jeton à coller.

## ✅ Portes de qualité

- **Une clé n'est écrite qu'après un `chat 200` réel avec du texte.** Une porte ratée n'atterrit jamais dans `keys.txt`.
- `node src/cli.js verify` reteste chaque clé enregistrée et rapporte LIVE/DEAD par clé.
- Les délais du lien, la limite par adresse du panneau et les sorties mortes apparaissent comme des erreurs explicites — l'outil ne "devine" jamais un succès.

## 🛰️ Proxies — en option

| Mode | Comment | Règle du panneau |
| --- | --- | --- |
| Direct (par défaut) | pas de `proxies.txt` | **5 nouveaux comptes par adresse et par heure** — ensuite `429 Too many new accounts from this address` |
| Pool | une ligne de proxy par clé dans `proxies.txt` | chaque clé prend **une sortie exclusive** ; aucune sortie n'est réutilisée |

Avec `--pool` l'outil est **fail-closed** : si la sortie meurt en cours de route, la clé échoue avec elle ; aucun repli silencieux sur votre propre adresse. `outputs/exits-used.txt` note quelle sortie a porté quel compte.

## 🔌 Connecter à 9Router

Menu `4`, ou :

```bash
node src/connect-9router.js --keys keys.txt --base http://localhost:20128 --model deepseek-v4.1-flash-1017
```

Cela enregistre `cheapllm.shop` comme fournisseur compatible OpenAI (`prefix cheapllm`), ajoute une connexion par clé et imprime une clé client. Tout routeur compatible OpenAI fonctionne de même avec `base_url: https://cheapllm.shop/v1`.

## ⚙️ Référence CLI

```
node src/cli.js --count N [--pool proxies.txt] [--rail temptf|mailtm]
                [--delay ms] [--attempts 3] [--txt keys.txt]
                [--accounts outputs/accounts.jsonl] [--model …]
                [--auto] [--dry] [--allow-overlimit]
node src/cli.js verify [--pool proxies.txt]
```

| Option | Sens |
| --- | --- |
| `--count N` | nombre de comptes/clés |
| `--pool FILE` | une sortie par clé, exclusive, fail-closed |
| `--rail temptf\|mailtm` | backend de boîte (défaut `temptf`) |
| `--delay MS` | pause entre comptes (défaut 5000) |
| `--attempts N` | sorties qu'une clé peut brûler (défaut 3) |
| `--auto` | aucune question (le flux est déjà automatique) |
| `--dry` | affiche le plan ; aucune requête, aucune écriture |
| `--allow-overlimit` | direct seulement : ignore le garde-fou local de 5/h (le panneau refusera quand même) |

## 📦 Sorties

| Fichier | Contenu |
| --- | --- |
| `keys.txt` | une clé vivante par ligne, ajoutée seulement après chat 200 |
| `outputs/accounts.jsonl` | e-mail, mot de passe, clé, sortie, rail, horodatage (local ; gitignored) |
| `outputs/ledger-YYYY-MM-DD.jsonl` | chaque tentative avec statut et durée |
| `outputs/exits-used.txt` | sorties déjà dépensées (mode pool) |

`keys.txt`, `accounts.jsonl`, `proxies.txt` et `outputs/` sont gitignored — ne commitez jamais clés, comptes ni points d'accès proxy.

## 📁 Structure du projet

```
src/cli.js               mint, verify, dry run
src/launcher.js          menu en un clic (npm start)
src/connect-9router.js   connecteur 9Router
src/lib/panel.js         signup / verify / chat, identité par compte
src/lib/temptf.js        boîtes temp.tf + interrogation des liens
src/lib/mailtm.js        boîtes mail.tm + interrogation des liens
src/lib/proxy.js         analyse des proxies et tunnels (zéro dépendance)
docs/PROTOCOL.md         la chaîne mesurée, endpoint par endpoint
examples/mint-and-chat.js
```

## ⚠️ Avertissement

Le niveau gratuit, la limite par adresse et le comportement des e-mails sont fixés par cheapllm.shop et peuvent changer sans préavis. Créer de nombreux comptes depuis une adresse est visible pour l'opérateur et ses conditions l'autorisent à limiter ou suspendre des comptes ; utilisez un pool de proxies et des lots mesurés. Ce projet n'est pas affilié à cheapllm.shop. À utiliser à vos risques et dans le respect des conditions du fournisseur.

## 📄 Licence

MIT
