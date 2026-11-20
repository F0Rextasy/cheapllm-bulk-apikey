# cheapllm-bulk-apikey

**批量创建 cheapllm.shop 账户及其 API 密钥 —— 全自动、无验证码 —— 并通过 OpenAI 兼容端点（`sk-cheap-…`、DeepSeek V4.1 Flash 1017）或本地 9Router 使用这些密钥。**

- 一条命令、一个问题：**要多少个密钥**
- 每个密钥只有在**真实 chat 200** 通过后才写入
- **代理可选**：直连即可运行；`proxies.txt` 让每个密钥使用独立出口

## 🚀 快速开始

```bash
git clone https://github.com/F0Rextasy/cheapllm-bulk-apikey
cd cheapllm-bulk-apikey
npm start
```

然后：

```
1) Mint keys       — ask how many, then run to the end
```

输入数字回车。整个流程就是：每个账户新建一个邮箱、注册、从邮箱读取确认链接、打开链接、调用一次 API，之后才把密钥写入 `keys.txt`。

不用菜单：

```bash
node src/cli.js --count 10            # 10 个密钥，直连
node src/cli.js --count 100 --pool proxies.txt   # 100 个密钥，每密钥一个出口
node src/cli.js verify                # 对所有已保存密钥做真实检测
```

## 🎁 单个账户得到什么

| 项目 | 值 |
| --- | --- |
| 面板 | [cheapllm.shop](https://cheapllm.shop) |
| 模型 | `deepseek-v4.1-flash-1017`（上下文 131 072） |
| 内测期间 | 免费、无速率限制 |
| 内测之后 | **每账户每小时 5 000 输入 + 1 000 输出 token**，无需银行卡 |
| 超出部分 | $0.05 / M 输入 · $0.009 / M 缓存输入 · $0.42 / M 输出 |
| 并发 | 每账户 1 个进行中请求 |
| 每账户密钥数 | 面板允许 25 个；本工具**每账户只取 1 个**，因为配额和并发位属于账户 |
| 扩展单位 | **一个账户 = 一个密钥** —— `--count N` 创建 N 个账户 |

实时数据：`curl https://cheapllm.shop/api/config`。

## 🧭 工作原理

```
新邮箱（temp.tf）            注册               确认              网关
─────────────────────  →  POST /api/signup  →  GET /verify?token  →  POST /v1/chat
plus 别名、真实域名          201 + 密钥 + cookie  302 verified        200 + 文本
```

1. 在 temp.tf 创建一个新的 plus 别名邮箱（outlook/hotmail 系），或使用 `--rail mailtm` 走 mail.tm。
2. `POST /api/signup {email,password,website:"",consent:true}` 返回 **201**，同一响应体里带着密钥。
3. 面板发送确认邮件。工具轮询邮箱，提取 `https://cheapllm.shop/verify?token=…` 并打开（**302** 进入面板）。
4. 用该密钥调用一次 `/v1/chat/completions`；返回带助手文本的 200 才算通过。通过后才写入密钥。

这条链路里没有验证码：没有需要破解的东西，也没有要粘贴的 token。

## ✅ 质量网关

- **只有真实 `chat 200`（含文本）之后才写入密钥。** 未通过的网关绝不进入 `keys.txt`。
- `node src/cli.js verify` 重新检测所有已保存密钥，并逐条报告 LIVE/DEAD。
- 确认链接超时、面板的地址限制、失效出口都会以明确错误呈现 —— 工具从不“猜”通过。

## 🛰️ 代理 —— 可选

| 模式 | 做法 | 适用的面板规则 |
| --- | --- | --- |
| 直连（默认） | 没有 `proxies.txt` | **每地址每小时 5 个新账户** —— 之后返回 `429 Too many new accounts from this address` |
| 池 | `proxies.txt` 每行一个代理 | 每个密钥占用**一个专属出口**；出口不会复用 |

使用 `--pool` 时是 **fail-closed**：出口在中途失效，该密钥随之失败，绝不会静默回退到你的本机地址。`outputs/exits-used.txt` 记录哪个出口承载了哪个账户。

## 🔌 连接 9Router

菜单 `4`，或：

```bash
node src/connect-9router.js --keys keys.txt --base http://localhost:20128 --model deepseek-v4.1-flash-1017
```

这会把 `cheapllm.shop` 注册为 OpenAI 兼容供应商（`prefix cheapllm`），为每个密钥添加一个连接，并输出一个客户端密钥。任何 OpenAI 兼容路由器都可用 `base_url: https://cheapllm.shop/v1` 同样接入。

## ⚙️ CLI 参考

```
node src/cli.js --count N [--pool proxies.txt] [--rail temptf|mailtm]
                [--delay ms] [--attempts 3] [--txt keys.txt]
                [--accounts outputs/accounts.jsonl] [--model …]
                [--auto] [--dry] [--allow-overlimit]
node src/cli.js verify [--pool proxies.txt]
```

| 参数 | 含义 |
| --- | --- |
| `--count N` | 创建多少账户/密钥 |
| `--pool FILE` | 每密钥一个专属出口，fail-closed |
| `--rail temptf\|mailtm` | 邮箱后端（默认 `temptf`） |
| `--delay MS` | 账户之间的间隔（默认 5000） |
| `--attempts N` | 单个密钥最多可消耗几个出口（默认 3） |
| `--auto` | 不提问（流程本就自动） |
| `--dry` | 打印计划；不发请求、不写文件 |
| `--allow-overlimit` | 仅直连模式：跳过本地每小时 5 个的守卫（面板仍会拒绝） |

## 📦 输出

| 文件 | 内容 |
| --- | --- |
| `keys.txt` | 每行一个可用密钥，仅在 chat 200 后追加 |
| `outputs/accounts.jsonl` | 邮箱、密码、密钥、出口、rail、时间（本地；gitignored） |
| `outputs/ledger-YYYY-MM-DD.jsonl` | 每次尝试的状态与耗时 |
| `outputs/exits-used.txt` | 已消耗的出口（池模式） |

`keys.txt`、`accounts.jsonl`、`proxies.txt` 与 `outputs/` 均在 gitignore 中 —— 永远不要提交密钥、账户或代理端点。

## 📁 项目结构

```
src/cli.js               mint / verify / dry run
src/launcher.js          一键菜单（npm start）
src/connect-9router.js   9Router 连接器
src/lib/panel.js         signup / verify / chat，按账户区分身份
src/lib/temptf.js        temp.tf 邮箱 + 链接轮询
src/lib/mailtm.js        mail.tm 邮箱 + 链接轮询
src/lib/proxy.js         代理解析与隧道（零依赖）
docs/PROTOCOL.md         实测链路，逐端点记录
examples/mint-and-chat.js
```

## ⚠️ 免责声明

免费额度、每地址限制和邮件行为由 cheapllm.shop 设定，可能随时变化。同一地址创建大量账户对运营方可见，其条款允许限制或停用账户；请使用代理池并控制批次规模。本项目与 cheapllm.shop 无关联。使用风险自负，并遵守服务商条款。

## 📄 许可证

MIT
