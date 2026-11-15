# 人物数据约定

每个人一个 `data/people/<slug>.json`。只存有来源的事实，中文原创摘要，避免实时职位、财富数值等易失效断言。`verifiedAt`记录实际编辑核对日；事实截止日和年表范围通过`coverageNote`及批次`cutoffDate`分别记录，不混为同一日期。

```json
{
  "id": "elon-musk",
  "name": "埃隆·马斯克",
  "enName": "Elon Musk",
  "aliases": ["马斯克"],
  "birth": "1971-06-28",
  "death": null,
  "country": "南非 / 美国",
  "domains": ["technology", "business"],
  "eras": ["contemporary"],
  "regions": ["africa", "north-america"],
  "tags": ["电动汽车", "商业航天"],
  "role": "企业家 · 商业航天先行者",
  "summary": "100—160字的客观生平与贡献摘要，不回避重大争议，避免宣传口吻。",
  "highlights": [{"title": "标题", "text": "简短成果描述", "sourceIds": ["s1"]}],
  "facts": [{"label": "出生地", "value": "..."}, {"label": "教育", "value": "..."}],
  "timeline": [{"date": "2022", "title": "事件标题", "text": "约30—65字中文，简洁原创措辞。", "sourceIds": ["s1"]}],
  "sources": [{"id": "s1", "title": "页面标题", "publisher": "机构", "url": "https://..."}],
  "verifiedAt": "2026-11-13",
  "coverageNote": "选录公开可核对的重要履历；非实时新闻档案。"
}
```

highlights 2—3项；timeline 至少6项（理想8—10），倒序，包括早年/出生/教育和重要转折。不要为凑数量编造。日期为 YYYY / YYYY-MM / YYYY-MM-DD；公元前用 -0551；如果需要约数，添加 dateLabel，如 "约公元前551年"。

若可靠来源对出生年份有分歧，使用`birth: null`及按升序排列、互不重复的整数`birthYears`（例如`[1951,1952]`），不要挑一个未经证实的年份充作精确出生日期。两者互斥；至少2个、至多5个可能年份，另以有来源的资料说明分歧。八语生卒栏和人物卡片展示所有可能年份；排序仅按最早可能年份定位，不视作确定日期；JSON-LD不输出`birthDate`。`death: null`仍独立表示经核对在世。

若没有足够可靠的出生年份资料，使用 `birth: null`、`birthUnknown: true`，且不设置 `birthYears`。这与来源确有不同年份记载的情形分开：不能为了通过格式检查编造年份或备选范围。八语生卒栏显示本语言的“未详 — 今”或已核实的死亡年份，结构化数据不输出出生日期；按出生年代排序时排在已知年份之后。`birthUnknown` 只允许值 `true`，不能与确定日期或年份备选共存；省略出生信息不免除核实在世状态的要求。

`death` 为必填字段，也是生卒文字与肖像色彩的唯一依据：`null` 表示经核对仍在世，照片保留原图色彩；有效死亡日期表示已故，肖像统一以黑白显示。不得以缺失字段、空字符串或 `false` 表示在世，不另设独立的生存状态或色彩字段。状态不明时先核对再收录。首页精选、列表、详情及打印共用该规则，悬停不会改变色彩。后续更新死亡日期并重新构建即可同步全部页面；原始图片文件保持不变。

领域：technology 科技与创新；politics 政治与公共事务；science 科学与医学；business 商业与经济；literature 文学与思想；arts 艺术与设计；culture 影视与音乐；sports 体育与探索。

时代（按主要活动时期，可多选）：ancient 古代（1500年前）；early-modern 近世（1500—1799）；modern 近代（1800—1945）；contemporary 当代（1946年至今）。世纪边界是本站导航约定，不作统一世界史分期判断。

地区（出生、成长或长期活动关联，可多选，不等同于国籍）：asia 亚洲；europe 欧洲；north-america 北美洲；south-america 南美洲；africa 非洲；oceania 大洋洲。

图片元数据另由图像任务提供 `data/images/<slug>.json`，不要放入人物文件。来源必须实际打开/搜索核对。

如果来源要求署名链接，可添加 `creditUrl`，必须为经核对的 HTTP(S) 作者地址。构建时人物页、图片许可页与生成的署名文档共用该字段，将 `credit` 文字链接到作者页面；不能用作者主页替代照片来源或许可链接。

当代新增档案的 `influence` 包含 `stars`（1—5）、`scope`（`global` / `field` / `regional`）、中文 `rationale`、`assessedAt`、`methodVersion`、`reviewStatus`。评级衡量影响范围，不是道德评价；原有档案允许暂未评级。完整档案与候选名单的星级、范围、中文理由应一致。各语言理由存于译文 `strings["influence.rationale"]`，不在基础数据重复保存外语理由。评级标准见 `data/collections/influence-method.json`。

多语言：`facts`、`highlights`、`timeline` 的每个条目必须有稳定且组内唯一的 `id`。修改内容或调整顺序时保留原 ID；新增条目使用新 ID。人物译文位于 `data/i18n/<语言>/people/<slug>.json`，只翻译展示文字，日期、来源、分类 ID、图片和 `death` 均复用基础数据。详见 `docs/TRANSLATION-CONTRACT.md`。

## 缺失肖像的明确例外

需要随素材提供完整许可时，可添加`licenseText`，仅允许`assets/licenses/<文件名>.txt`，对应文件必须保存在`public/`中并随站发布；`licenseUrl`仍保存真实许可原文地址。可选`permissionNotice`保存来源原有许可声明，八语人物和许可页面均原样显示，不把声明改写为新的授权。

实际照片/画像继续要求 `src`、`alt`、`credit`、`license`、`licenseUrl`、`sourceUrl`。仅经用户明确同意的例外可使用 `{ "kind": "placeholder", "status": "awaiting-permission", "approvedBy": "user", "verifiedAt": "2026-11-13", "reason": "具体原因与确认范围" }`。这种记录禁止包含 `src`、`credit`、`creditUrl`、`license`、`licenseUrl`、`sourceUrl`，不能把姓名框描述成授权图片。本批仅奥特加适用。列表、详情、许可页及八语无障碍标签统一显示肖像待补；随后取得授权彩照时换成完整照片元数据并重新构建即可。

本批六语`translationProvenance`记录`ai-reviewed`、实际reviewer、reviewedKeys及sourceLocale=en与sourceTextSha256。它不改变中文数据的唯一事实地位；英文是采编参考版本。审阅者必须实际读过对应文字，不能用程序填状态替代语义核对；未审机器稿不允许通过构建。保存工具见`scripts/reviewed-translation.mjs`，其保存行为不证明人类或母语资格。

英文直接对照中文的AI审阅声明可保存在`authorshipReview`（`sourceLocale: "zh"`）中，独立于六种目标语言的英文中介依赖。`translationProvenance`仅用于以英文为中介的六语版本，须有`sourceLocale: "en"`及准确英文文字哈希。不要把英文自身声明放进中介依赖字段。声明都是AI自报，文字及中文底本哈希仍按同一正式译文约定校验。
