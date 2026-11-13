# 多语言数据与开发流程

## 基础数据与译文分离

`data/people/<id>.json` 是人物事实的唯一来源，也提供中文底本文案。日期、生卒状态、领域/时代/地区 ID、来源 URL、来源引用以及照片元数据不在译文中重复保存。所有语言共同使用 `death` 控制在世人物彩色、已故人物黑白的显示规则。

`data/i18n/<语言>/people/<id>.json` 只保存展示文字：

```json
{
  "sourceHash": "对应人物底本的 SHA-256",
  "strings": {
    "name": "Elon Musk",
    "role": "Entrepreneur · Commercial spaceflight and electric vehicles",
    "country": "South Africa / Canada / United States",
    "summary": "...",
    "coverageNote": "...",
    "tags.商业航天": "Commercial spaceflight",
    "facts.fact-01.label": "Birthplace",
    "facts.fact-01.value": "Pretoria, South Africa",
    "highlights.highlight-01.title": "...",
    "highlights.highlight-01.text": "...",
    "timeline.event-01.title": "...",
    "timeline.event-01.text": "..."
  }
}
```

示例只展示格式，实际文件必须包含该人物全部必需文字字段。`sourceStrings()` 自动从底本提取键，`sourceHash()` 标识所依据的底本版本；哈希用于发现变化，不是对内容正确性的证明。

事实、成就、年表的每个条目都有稳定 `id`。修改顺序或插入事件时保留已有 ID，新事件使用从未使用过的 ID；禁止重新按位置给已有条目编号或重复 ID。翻译通过 ID 匹配，不按数组下标匹配，避免年表插入后错配译文。

标签的基础键保留中文原词，展示值按语言翻译；查询 URL 使用基础键。因此从法语切换到阿拉伯语时，已选标签仍指向同一组人物，不依赖译文恰好相同。

来源文献的原始标题、出版机构原名和图片作者署名保留来源原文，不在本地化过程中改写。未建档候选在非中文版本中使用已有英文名，已建档人物使用对应语言姓名。

## 界面与语言注册表

- `data/i18n/locales.json`：底本语言 `source`、默认入口 `default`、各语言 `id`、HTML `lang`、本土名称 `name`、方向 `dir`、`enabled`。
- `data/i18n/zh/ui.json`：界面、领域/时代/地区标签、辅助页面正文的底本，使用稳定语义键。
- `data/i18n/<语言>/ui.json`：对应语言的相同键集，字符串中不嵌入 HTML；输出统一转义。
- `data/i18n/<语言>/ui-source.json`：界面底本哈希。即使只修改同一个键的中文措辞，也会触发译文过期检查。

占位符如 `{count}`、`{name}`、`{start}` 必须保留完整且数量一致。可以按照目标语言语序移动，但不可自行翻译键名。日期用语言对应的 `Intl.DateTimeFormat` 展示，只有年份的事件不补造月份和日期；公元前年份及“至今”由语言文案处理。

## 新增语言

1. `npm run i18n:prepare -- pt --name "Português" --lang pt --dir ltr`：注册未启用语言并生成空译文。RTL 语言使用 `--dir rtl`。
2. `npm run i18n:export -- pt --out /tmp/pt-work.json`：导出含源文和目标文字的对照文件。
3. 填写每项 `target`；核对完整界面后设置 `uiReviewed: true`，逐个人物核对后设置其 `reviewed: true`。不修改 `source`、键名或哈希。
4. `npm run i18n:import -- pt --file /tmp/pt-work.json`：先检查整个文件，全部通过才写入正式译文；保持原有启用状态。
5. `npm run i18n:check -- pt`：检查全部键、占位符、非空文本和底本版本。
6. `npm run i18n:enable -- pt`：检查通过后启用。重新构建即可生成新语言目录并加入所有语言菜单。

工作文件可交给任何编辑工具或翻译流程处理。项目不绑定翻译供应商，不内置 API 密钥，也不在访问者浏览时调用翻译服务。

## 更新基础资料

修改人物事实或中文底本后，相关人物所有译文都会被标记为过期。运行 `prepare` 会保留已有译文、添加新字段的空白值，并保留旧哈希，不会将未经核对的译文自动标记为最新。

重新 `export` 获得最新源文和已有译文，审阅差异、填写新字段，再 `import`。导出之后如果底本又发生变化，导入会拒绝旧工作文件，避免覆盖新内容。也可以直接维护正式译文 JSON，但应在核对完成后再更新其版本哈希。

初始七种译文为完整 AI 辅助翻译，已进行字段完整性、占位符、事实一致性与重点语义抽查；没有声称经过各语种母语编辑的全面校对。面向广泛读者正式发布前，可通过上述导出流程进行语言审校。

## 静态产物规则

默认中文保留根目录旧地址；其他语言位于 `<语言>/`。每种语言生成首页、24 份完整人物 HTML、收录计划、说明、许可和 404 页。所有语言共用图片与样式文件，不复制七份肖像。

每页提供普通链接形式的语言菜单、正确的 `lang` / `dir` 和 `hreflang`；设置 `SITE_URL` 后还会生成绝对 canonical 与站点地图地址。即使 JavaScript 不可用，人物页语言切换与阅读仍可用。JavaScript 只负责搜索、筛选、分页和保留当前查询条件。

`source` 固定标识中文底本，`default` 决定根目录地址所用语言，两者可以不同。默认语言决定旧地址的位置。已有站点不建议随意更改 `default`；若确有需要，需另行安排旧 URL 跳转。增加语言可以只改配置和译文，但仍需构建并重新上传静态产物。
