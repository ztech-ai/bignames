# Big Names on This Planet · 这个星球上的名人

一个中文人物档案网站：以安静的纸质档案馆风格，浏览不同领域、时代与地区的人物，阅读成就、履历与倒序年表。

**纯静态网站，无数据库、无 API、无后台。** Node.js 只负责开发时把人物数据编译成 HTML；服务器只需要提供 `dist/` 中的文件。

## 已完成

- 8 个领域、4 个时代、6 个地区的交叉标签体系。
- 120 位人物的候选框架，分 4 批；首批 24 份完整人物档案。
- 中文、英语、法语、阿拉伯语、德语、日语、西班牙语、韩语共 8 个版本；首页、24 份人物全文、收录计划、编辑原则及图片许可均生成对应静态页面。
- 每页可切换语言并保持当前人物；搜索筛选条件和标签链接可随语言切换保留。阿拉伯语使用 RTL 排版。
- 中文、英文名、别名与关键词搜索；领域 / 时代 / 地区组合筛选；可移除的筛选条件；排序、分页、空结果与一键重置。
- 筛选条件写入 URL，可复制分享并通过浏览器前进 / 后退恢复。
- 每人独立 JSON、独立静态 HTML 地址，停用 JavaScript 仍可阅读完整人物内容。
- 每人一张本地图片，附作者、许可、身份标注来源；画像和摄影分别标识。
- 肖像由 `death` 字段统一控制：在世人物保留原图色彩，已故人物使用黑白；首页、列表、详情和打印一致，悬停不改变色彩。
- 倒序人生年表与小号资料引用；图片许可页、编辑原则页、收录计划页。
- 响应式样式、键盘焦点、搜索快捷键 `/`、打印 / 保存 PDF、复制链接。
- 不加载第三方字体、分析脚本或远程图片；无登录、Cookie 或个人数据收集。

## 直接使用交付文件

`dist/index.html` 是网站入口。将 **dist 内全部内容** 放入静态资源服务器即可，不需要上传源码或 `node_modules`。

开发时也可直接打开 `dist/index.html`；由于浏览器对 `file://` 的限制，复制链接和地址历史更新可能受限。完整预览建议使用任意静态文件服务器，例如：

```sh
python3 -m http.server 8080 --directory dist
```

此命令仅是本地预览工具，不是网站所需的后台服务。

## 重新构建

建议 Node.js 24.15.0+（24 LTS）或 22.22.2+（22 LTS），与交互测试依赖要求一致。**构建不需要安装任何 npm 依赖**：

```sh
npm run build
npm run check
```

`build` 每次重新生成 `dist/`，请修改 `data/`、`public/` 或 `scripts/`，不要直接改构建产物。

如需运行完整交互测试，安装锁定的开发依赖后执行：

```sh
npm ci
npm test
```

jsdom 仅用于测试，不会随网站部署，也不是构建依赖。

## 域名、子目录与 404

### GitHub Pages

源码仓库为 [ztech-ai/bignames](https://github.com/ztech-ai/bignames)，网站地址为 [ztech-ai.github.io/bignames](https://ztech-ai.github.io/bignames/)，发布结果见 [GitHub Actions](https://github.com/ztech-ai/bignames/actions/workflows/pages.yml)。首次发布前需在仓库的 **Settings → Pages → Build and deployment → Source** 中选择 **GitHub Actions**。

`.github/workflows/pages.yml` 会在推送到 `main` 或手动运行时，安装锁定的测试依赖、构建全部语言、检查数据与链接并执行测试；全部通过后，只将 `dist/` 发布到 Pages。默认访问地址为 `https://ztech-ai.github.io/bignames/`，首次部署成功后才可访问。

构建从 GitHub Pages 读取实际站点地址并传入 `SITE_URL`，确保 `/bignames/` 子目录下的 404 返回链接、canonical 地址和站点地图正确。自动发布使用 GitHub Actions 的临时凭证，不需要在仓库中保存个人 token。源码、人物资料、译文和原始图片保存在仓库中；`node_modules/`、本地构建产物和压缩包不提交。

### 其他静态托管服务

普通页面全部使用相对资源和相对链接，可以托管在域名根路径或子目录，不需要 SPA 路由重写。人物地址形如：

```text
people/elon-musk/index.html
```

确定部署地址后，可在构建时设置 `SITE_URL`，生成站点地图、robots 文件，并让自定义 404 页返回正确的首页：

```sh
SITE_URL=https://example.com/ npm run build
# 或部署到子目录
SITE_URL=https://example.com/big-names/ npm run build
SITE_URL=https://example.com/big-names/ npm run check
```

未指定 `SITE_URL` 时不生成站点地图，404 页默认返回 `/index.html`。404 页面自身不依赖外部资源，可用于任意深度的错误地址。**子目录部署若启用服务器自定义 404，必须在构建时设置 `SITE_URL`。** 普通页面不受此限制。

静态服务器需要正确返回 HTML、CSS、JavaScript、SVG、JPEG、PNG 的内容类型。根据服务器能力把错误页配置为 `404.html`；不需要将所有请求重写到首页。`robots.txt` 只有放在域名根路径才会被爬虫读取；子目录托管请把生成的 Sitemap 地址并入域名根目录的 robots 配置。

## 目录

```text
data/
  people/<slug>.json       一人一个文件：资料、标签、年表、引用
  images/<slug>.json       同一人物的图片来源与许可
  candidates.json         120 位人物候选与采编批次
  taxonomy.json           领域、时代、地区及批次定义
  SCHEMA.md               人物数据格式
  i18n/locales.json        语言注册表、展示名称、方向与启用状态
  i18n/zh/ui.json          中文界面文案（翻译底本）
  i18n/<语言>/ui.json      对应语言的界面、分类与辅助页面文案
  i18n/<语言>/ui-source.json  界面底本版本记录
  i18n/<语言>/people/     每个人一份译文，仅存展示文字和底本哈希
public/assets/
  portraits/              本地人物图片
  site.css                全站与打印样式
  site.js                 浏览器端搜索、筛选与交互
scripts/
  build.mjs               零依赖静态页面生成器
  check.mjs               数据、引用、图片与站内链接校验
  i18n.mjs                译文准备、导出、导入、检查与启用
tests/                    日期安全边界与 DOM 交互回归测试
docs/
  CONTENT-PLAN.md         收录策略与扩充方法
  IMAGE-CREDITS.md        图片署名及许可清单
  VALIDATION.md           本次验证范围及限制
  TRANSLATION-CONTRACT.md 多语言数据结构和新增语言操作说明
dist/                     可直接托管的静态产物
```

`.openai/hosting.json` 只用于当前开发环境的静态目录识别，不含项目 ID；没有注册、同步或发布到 Sites。你自己的服务器不需要这个文件。

## 新增一个人物

1. 在候选名单中确定一个长期稳定的英文 `id`。
2. 参照 `data/SCHEMA.md` 新增 `data/people/<id>.json`，从可靠来源核对姓名、生卒、关键履历和分类。
3. 通过 `sourceIds` 为成就和每个事件添加来源。记录真实的 `verifiedAt` 和 `coverageNote`，不要把资料核对日当成新闻完整覆盖日。
4. 下载具有合适许可的肖像到 `public/assets/portraits/`，新增 `data/images/<id>.json`。核实身份、作者和许可，历史画作用 `painting` 或 `engraving`。
5. 更新 `docs/IMAGE-CREDITS.md`；必要时在 `data/taxonomy.json` 更新分类说明。
6. 为已启用语言准备并核对新人物译文（详见多语言说明），再执行 `npm run build && npm run check`。变更交互逻辑时另执行 `npm test`。
7. 检查桌面、手机及打印预览后，将 `dist/` 替换为新版本。

已收录状态由人物文件是否存在自动计算。新增档案不会自动补齐未核对的内容；候选人物没有空壳详情页。若修改人物 ID，应自行配置旧地址跳转以保留已有链接。

## 内容与图片边界

这是可扩充的第一版，**不是全球名人的完整名单，也不是名人排名**。不同人物年表的截止时间不同，详见各页覆盖说明。涉及政治与争议人物时，收录不意味着认同，指控、裁决、逮捕令按不同性质表述。

事实链接是查证入口，不保证外部网站永久在线。图片本地保存，避免热链失效；其许可、署名和后续使用条件详见 `docs/IMAGE-CREDITS.md` 与网站的“图片与许可”页面。

仓库沿用已有的 Apache-2.0 代码许可证（见 `LICENSE`）。人物图片属于第三方素材，分别遵循其来源记录中的许可与署名要求。

本次数据、构建和 DOM 交互检查结果见 `docs/VALIDATION.md`。当前云环境浏览器预览未能启动，因此没有声称已完成真实浏览器的视觉与打印验收。

## 多语言版本与后续扩充

中文保留原地址，其他语言使用独立目录：

```text
index.html                              中文首页
people/elon-musk/index.html              中文人物页
en/index.html                           英语首页
fr/people/elon-musk/index.html           法语人物页
ar/people/elon-musk/index.html           阿拉伯语人物页
```

每一页都是完整 HTML，不需要在线翻译、运行时拉取 JSON、数据库或服务器路由。图片、CSS 和交互脚本只保存一份；各语言的文案与搜索索引在构建时生成。关闭 JavaScript 仍可切换语言和阅读全文。URL 决定当前语言，不按浏览器设置强行跳转。

新增语言只需要注册配置与译文，不必修改模板。例如创建尚未发布的葡萄牙语草稿：

```sh
npm run i18n:prepare -- pt --name "Português" --lang pt --dir ltr
npm run i18n:export -- pt --out /tmp/pt-work.json
```

在工作文件中对照 `source` 填写 `target`。核对完界面后设置 `uiReviewed: true`，逐个人物核对后设置对应的 `reviewed: true`，再导入、校验和启用：

```sh
npm run i18n:import -- pt --file /tmp/pt-work.json
npm run i18n:check -- pt
npm run i18n:enable -- pt
npm run build
npm run check
```

开发准备阶段允许空白译文，草稿语言默认 `enabled: false`，不出现在网站中。已启用语言必须完整且与底本一致；缺译、占位符错误或底本已变更都会阻止构建，不会把中文混入其他语言页面。构建在检查通过前保留上一版 `dist/`。

以后增加语言仍需要重新构建并上传新的静态产物；部署后的页面不依赖后台“动态翻译”。详细的数据结构、稳定 ID 和更新流程见 [多语言开发说明](docs/TRANSLATION-CONTRACT.md)。
