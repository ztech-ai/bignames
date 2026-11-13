# 人物数据约定

每个人一个 `data/people/<slug>.json`。只存有来源的事实，中文原创摘要，避免实时职位、财富数值等易失效断言。资料核对日 2026-11-13；年表覆盖范围通过 coverageNote 如实说明。

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

`death` 为必填字段，也是生卒文字与肖像色彩的唯一依据：`null` 表示经核对仍在世，照片保留原图色彩；有效死亡日期表示已故，肖像统一以黑白显示。不得以缺失字段、空字符串或 `false` 表示在世，不另设独立的生存状态或色彩字段。状态不明时先核对再收录。首页精选、列表、详情及打印共用该规则，悬停不会改变色彩。后续更新死亡日期并重新构建即可同步全部页面；原始图片文件保持不变。

领域：technology 科技与创新；politics 政治与公共事务；science 科学与医学；business 商业与经济；literature 文学与思想；arts 艺术与设计；culture 影视与音乐；sports 体育与探索。

时代（按主要活动时期，可多选）：ancient 古代（1500年前）；early-modern 近世（1500—1799）；modern 近代（1800—1945）；contemporary 当代（1946年至今）。世纪边界是本站导航约定，不作统一世界史分期判断。

地区（出生、成长或长期活动关联，可多选，不等同于国籍）：asia 亚洲；europe 欧洲；north-america 北美洲；south-america 南美洲；africa 非洲；oceania 大洋洲。

图片元数据另由图像任务提供 `data/images/<slug>.json`，不要放入人物文件。来源必须实际打开/搜索核对。

多语言：`facts`、`highlights`、`timeline` 的每个条目必须有稳定且组内唯一的 `id`。修改内容或调整顺序时保留原 ID；新增条目使用新 ID。人物译文位于 `data/i18n/<语言>/people/<slug>.json`，只翻译展示文字，日期、来源、分类 ID、图片和 `death` 均复用基础数据。详见 `docs/TRANSLATION-CONTRACT.md`。
