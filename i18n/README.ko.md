# cheapllm-bulk-apikey

**cheapllm.shop 계정과 API 키를 대량으로 생성합니다 — 완전 자동, 캡차 없음 — 그리고 그 키를 OpenAI 호환 엔드포인트(`sk-cheap-…`, DeepSeek V4.1 Flash 1017)나 로컬 9Router로 사용합니다.**

- 명령 하나, 질문 하나: **키를 몇 개 만들까**
- 모든 키는 저장 전에 **실제 chat 200**으로 검증됩니다
- **프록시 선택 사항**: 직접 실행도 동작하고, `proxies.txt`가 있으면 키마다 전용 출구를 씁니다

## 🚀 빠른 시작

```bash
git clone https://github.com/F0Rextasy/cheapllm-bulk-apikey
cd cheapllm-bulk-apikey
npm start
```

그다음:

```
1) Mint keys       — ask how many, then run to the end
```

숫자를 입력하고 Enter. 이게 전부입니다: 계정마다 새 메일박스를 만들고, 가입하고, 확인 링크를 메일에서 읽어 열고, API를 한 번 호출한 뒤에야 키가 `keys.txt`에 기록됩니다.

메뉴 없이:

```bash
node src/cli.js --count 10            # 키 10개, 직접
node src/cli.js --count 100 --pool proxies.txt   # 키 100개, 각각 전용 출구
node src/cli.js verify                # 저장된 모든 키 실측 검증
```

## 🎁 계정 하나가 받는 것

| 항목 | 값 |
| --- | --- |
| 패널 | [cheapllm.shop](https://cheapllm.shop) |
| 모델 | `deepseek-v4.1-flash-1017` (컨텍스트 131 072) |
| 베타 기간 | 무료, 속도 제한 없음 |
| 베타 이후 | **계정당 시간당 입력 5 000 + 출력 1 000 토큰**, 카드 불필요 |
| 그 이상 | $0.05 / M 입력 · $0.009 / M 캐시 입력 · $0.42 / M 출력 |
| 동시성 | 계정당 진행 중 요청 1개 |
| 계정당 키 | 패널은 25개. 이 도구는 **계정당 키 1개**만 사용합니다(할당량과 동시성 슬롯이 계정 단위이므로) |
| 확장 단위 | **계정 1개 = 키 1개** — `--count N`은 계정 N개 생성 |

실시간 수치: `curl https://cheapllm.shop/api/config`.

## 🧭 동작 방식

```
새 메일박스 (temp.tf)        가입                 확인                게이트
──────────────────────  →  POST /api/signup  →  GET /verify?token  →  POST /v1/chat
plus 별칭, 실제 도메인      201 + 키 + 쿠키       302 verified        200 + 텍스트
```

1. temp.tf에서 새 plus 별칭을 만듭니다(outlook/hotmail 계열). `--rail mailtm`이면 mail.tm.
2. `POST /api/signup {email,password,website:"",consent:true}`가 **201**과 함께 같은 본문에 키를 줍니다.
3. 패널이 확인 링크를 메일로 보냅니다. 도구가 수신함을 폴링해 `https://cheapllm.shop/verify?token=…`를 뽑아 열면 **302**로 대시보드로 갑니다.
4. 그 키로 `/v1/chat/completions`를 한 번 호출해 텍스트가 담긴 200이 나오면 통과. 그 뒤에야 키를 씁니다.

이 흐름에는 캡차가 없습니다. 풀 것도, 붙여넣을 토큰도 없습니다.

## ✅ 품질 게이트

- **키는 실제 `chat 200`(텍스트 포함) 뒤에만 기록됩니다.** 실패한 게이트는 `keys.txt`에 절대 들어가지 않습니다.
- `node src/cli.js verify`는 저장된 모든 키를 다시 검증해 키별 LIVE/DEAD를 보고합니다.
- 확인 링크 타임아웃, 패널의 주소 제한, 죽은 출구는 명시적 오류로 드러납니다 — 도구가 통과를 "추측"하지 않습니다.

## 🛰️ 프록시 — 선택 사항

| 모드 | 방법 | 적용되는 패널 규칙 |
| --- | --- | --- |
| 직접(기본) | `proxies.txt` 없음 | **주소당 시간당 신규 계정 5개** — 이후 `429 Too many new accounts from this address` |
| 풀 | `proxies.txt`에 키당 프록시 한 줄 | 키마다 **전용 출구 1개**; 출구는 재사용하지 않음 |

`--pool`에서는 **fail-closed**: 출구가 중간에 죽으면 키도 함께 실패하며, 자신의 주소로 조용히 폴백하지 않습니다. `outputs/exits-used.txt`가 어느 출구가 어느 계정을 태웠는지 기록합니다.

## 🔌 9Router 연결

메뉴 `4`, 또는:

```bash
node src/connect-9router.js --keys keys.txt --base http://localhost:20128 --model deepseek-v4.1-flash-1017
```

`cheapllm.shop`을 OpenAI 호환 공급자(`prefix cheapllm`)로 등록하고, 키마다 연결을 추가한 뒤 클라이언트 키를 출력합니다. OpenAI 호환 라우터라면 `base_url: https://cheapllm.shop/v1`로 동일하게 쓸 수 있습니다.

## ⚙️ CLI 레퍼런스

```
node src/cli.js --count N [--pool proxies.txt] [--rail temptf|mailtm]
                [--delay ms] [--attempts 3] [--txt keys.txt]
                [--accounts outputs/accounts.jsonl] [--model …]
                [--auto] [--dry] [--allow-overlimit]
node src/cli.js verify [--pool proxies.txt]
```

| 플래그 | 의미 |
| --- | --- |
| `--count N` | 만들 계정/키 수 |
| `--pool FILE` | 키당 출구 1개, 전용, fail-closed |
| `--rail temptf\|mailtm` | 메일백엔드(기본 `temptf`) |
| `--delay MS` | 계정 간 대기(기본 5000) |
| `--attempts N` | 한 키가 태울 수 있는 출구 수(기본 3) |
| `--auto` | 질문 없음(원래 자동) |
| `--dry` | 계획만 출력; 요청도 쓰기도 없음 |
| `--allow-overlimit` | 직접 모드 전용: 로컬 시간당 5개 가드 무시(패널은 거부함) |

## 📦 출력

| 파일 | 내용 |
| --- | --- |
| `keys.txt` | 살아있는 키 한 줄씩, chat 200 이후에만 추가 |
| `outputs/accounts.jsonl` | 이메일, 비밀번호, 키, 출구, 레일, 시각(로컬·gitignored) |
| `outputs/ledger-YYYY-MM-DD.jsonl` | 모든 시도의 상태와 소요 시간 |
| `outputs/exits-used.txt` | 이미 쓴 출구(풀 실행) |

`keys.txt`, `accounts.jsonl`, `proxies.txt`, `outputs/`는 gitignore — 키·계정·프록시 엔드포인트를 절대 커밋하지 마세요.

## 📁 프로젝트 구조

```
src/cli.js               mint / verify / dry run
src/launcher.js          원클릭 메뉴(npm start)
src/connect-9router.js   9Router 커넥터
src/lib/panel.js         signup / verify / chat, 계정별 식별
src/lib/temptf.js        temp.tf 메일박스 + 링크 폴링
src/lib/mailtm.js        mail.tm 메일박스 + 링크 폴링
src/lib/proxy.js         프록시 파싱과 터널(의존성 없음)
docs/PROTOCOL.md         실측한 흐름, 엔드포인트별
examples/mint-and-chat.js
```

## ⚠️ 면책

무료 티어, 주소별 제한, 확인 메일 동작은 cheapllm.shop이 정하며 예고 없이 바뀔 수 있습니다. 한 주소에서 여러 계정을 만드는 것은 운영자에게 보이며, 약관은 계정 제한·정지를 허용합니다. 프록시 풀과 적당한 배치를 사용하세요. 이 프로젝트는 cheapllm.shop과 무관합니다. 책임은 사용자에게 있으며 제공자 약관을 지켜야 합니다.

## 📄 라이선스

MIT
