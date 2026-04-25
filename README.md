# YouMind Seedance Sync

这个项目把 `https://youmind.com/zh-CN/seedance-2-0-prompts` 上的 Seedance 2.0 提示词做成三件事：

1. 抓取 YouMind 公开分页接口，保存为本地 JSON。
2. 同步到飞书多维表格。
3. 先把飞书多维表格当成站点构建源，再生成一个可部署的轻量站点。

## 当前方案

- 数据源：直接使用 YouMind 前端的公开接口 `/youhome-api/video-prompts`
- 飞书建表：本地通过 `lark-cli` 完成
- GitHub 自动同步：优先支持自托管 Runner 直接复用本机 `lark-cli`，也兼容用 Open API 同步
- 类似网站：`site/` 目录是纯静态前端，GitHub Pages 可直接部署
- 站点构建：优先从飞书多维表格回读数据并校验；如果飞书异常，再回退到 YouMind 快照 / 公开接口
- 自托管 Runner 会把提示词快照持久化到本机缓存目录，避免频繁全量抓取导致 YouMind `429 Too Many Requests`

## 为什么不是直接监听上游仓库 push

上游仓库 `YouMind-OpenLab/awesome-seedance-2-prompts` 是外部仓库，GitHub Actions 不能直接对“别人的仓库 push”原生触发。这里采用的是更稳妥的轮询方式：

- 每小时拉一次 YouMind 最新公开数据
- 只对新增 / 变更 / 下线记录做增量同步

这个效果上等价于“上游更新后不久自动同步”。

## 本地命令

```bash
npm run fetch
npm run sync:lark
npm run build:site
```

如果你想让脚本先自动刷新本机 `lark-cli` 登录态，再执行同步：

```bash
npm run sync:lark:local-auth
```

如果你想在本机装 GitHub Actions self-hosted runner：

```bash
npm run setup:runner
```

如果你要重新新建一套飞书多维表格：

```bash
npm run bootstrap:lark
```

运行后会生成本地文件 `.seedance.local.json`，里面保存当前 Base Token / Table ID。这个文件已经被 `.gitignore` 忽略。

## GitHub Actions 同步方式

### 方案 A：自托管 Runner + 本机 `lark-cli`（不需要 `FEISHU_APP_ID` / `FEISHU_APP_SECRET`）

这是最贴近你当前用法的方案。要求：

- 你的机器注册成 GitHub Actions 的 `self-hosted` runner
- 这台机器上 `lark-cli auth status` 已经是登录成功状态
- 本机存在 `~/.lark-cli/refresh-token.py`
- 仓库 Variables 里设置 `ENABLE_SELF_HOSTED_LARK_SYNC=1`
- 本机 runner 带有 `youmind-sync` label
- macOS self-hosted runner 需要可用的 `gtar`，`npm run setup:runner` 现在会自动通过 Homebrew 安装 `gnu-tar`

工作流会在 self-hosted job 里直接执行：

- `npm run sync:lark:local-auth`

这个脚本会先尝试刷新本机 `lark-cli` token，再用 `lark-cli` 直接同步飞书。

另外，自托管工作流会设置：

- `YOUMIND_CACHE_DIR=$HOME/.cache/youmind-seedance-sync`
- `YOUMIND_MAX_CACHE_AGE_HOURS=2`
- `YOUMIND_ALLOW_STALE_CACHE_ON_ERROR=1`

效果是：

- 2 小时内已有成功快照时，优先直接复用缓存
- 缓存过期后会再尝试抓远端
- 如果远端因为限流失败，但本机还有旧快照，工作流会自动回退到旧快照继续同步和部署

### 方案 B：GitHub 托管 Runner + Open API

如果你不用 self-hosted runner，而是直接跑 GitHub 托管 Runner，那还是需要在仓库 Secrets 里配置：

- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`
- `FEISHU_BASE_TOKEN`
- `FEISHU_TABLE_ID`

说明：

- `FEISHU_BASE_TOKEN` 和 `FEISHU_TABLE_ID` 可以从本地 `.seedance.local.json` 里取
- 这个模式对应工作流里的 `npm run sync:api`
- 只有 GitHub 托管环境才需要这一套，因为它无法直接复用你电脑上的 `lark-cli` 登录态

## 站点构建

先抓数据，再同步飞书，再生成站点数据：

```bash
npm run fetch
npm run sync:lark
npm run build:site
```

`npm run build:site` 的默认行为是：

- 本地 / self-hosted 有可用飞书表格时，优先从飞书回读记录生成 `site/data/prompts.json`
- 同时用刚抓下来的 YouMind 快照校验 `Prompt ID + Content Hash`
- 如果飞书读取失败、数据缺失或校验不通过，就自动回退到 YouMind 快照

生成后的静态数据文件在：

- `site/data/prompts.json`

站点入口：

- `site/index.html`

GitHub Actions 已经配置为自动部署到 GitHub Pages。

站点详情弹窗现在会优先播放 Cloudflare Stream 示例视频；如果某条记录没有视频，再回退到缩略图。

## 数据表字段

主表 `Prompts` 使用这些字段：

- `Prompt ID`
- `Title`
- `Description`
- `Prompt`
- `Translated Prompt`
- `Language`
- `Featured`
- `Active`
- `Source Link`
- `Source Published At`
- `Author`
- `Author Link`
- `Video URL`
- `Thumbnail URL`
- `Reference Images`
- `Detail URL`
- `Model`
- `Content Hash`
- `Synced At`

其中：

- `Content Hash` 用来判断内容是否变化，避免每次全表重写
- `Active` 用来标记源站已经下线或移除的提示词
