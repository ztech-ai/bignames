# 当代千人集合独立复核 · 2026-11-13

研究集合复检通过：最终读取 1,000 个候选、1,000 份证据缓存及 1,000 个不同的 Wikidata 人物 ID。未发现剩余身份冲突、重复人物、阻塞缓存或来源死亡日期。这里的“通过”仅指下述集合与研究管线检查，不表示千人的完整简历、在世状态或照片已经逐一审核完毕。

## 最终计数

| 检查项 | 结果 |
| --- | --- |
| 候选 ID / 人物 QID | 各 1,000 个，无重复 |
| 已采集研究缓存 | 1,000；全部 `needs-review` |
| 缺失 / `blocked` 缓存 | 0 / 0 |
| 当前集合的来源死亡日期 | 0；不等于已确认全部在世 |
| `publicationReady: true` / 在世状态被误标为已确认 | 0 / 0 |
| 世纪或十年精度被派生为具体出生年份 | 0 |
| 暂定影响力评分 | 5 星 50 人、4 星 655 人、3 星 295 人 |
| 原有 24 份档案 | Git blob 全部未变，未计入新增千人 |

主领域为科技 217、商业 212、政治与公共事务 191、文化 124、体育 127、艺术 44、科学 43、文学 42。评分全部保留 `provisional`，不代表机构认证或道德评价。

## 方法与已关闭问题

全量检查 ID、英文姓名和 QID 重复，扫描非人物实体、歧义页、死亡声明、出生日期精度、领域与简介明显冲突、发布状态；阅读全部最终 50 位暂定 5 星人物的理由。固定种子 `20261113` 抽查 15 人：Vijay Shekhar Sharma、Joseph Stiglitz、Kelly Ortberg、Melanie Perkins、Céline Dion、Nayib Bukele、Robert Lewandowski、Mette Frederiksen、Tim Berners-Lee、蔡国强、Brendan Eich、Pascal Soriot、Michael I. Jordan、天野浩、George W. Bush。

本次发现的五个身份错配均已重采集并复检：

| 候选 | 已排除的同名人物 | 正确人物 QID |
| --- | --- | --- |
| Howard Marks | 2016 年去世的英国走私者 | Q15109625，Oaktree 投资人 |
| Maurice Lévy | 1910 年去世的法国工程师 | Q1347130，Publicis 高管 |
| Christophe Fouquet | 法国雪车运动员 | Q138786664，ASML 高管 |
| Jim Keller | 美国吉他手 | Q19958281，芯片设计师 |
| Remo Ruffini | 天体物理学家 | Q39071812，Moncler 商人 |

另外复核 David Silver 为 AI 研究者、李想为理想汽车创始人、Michael I. Jordan 为计算机学者、Robert Kahn 为互联网先驱；巴西 Ronaldo 与葡萄牙 Cristiano Ronaldo 使用不同 QID。检查 11 个名册显式 QID 覆盖项的职业与姓名匹配，避免把公司页重定向当成人物传记。对 Fouquet、李想、Martin van den Brink 另实际打开官方资料作交叉检查：[ASML 领导交接](https://www.asml.com/en/company/stories/2024/christophe-fouquet-asml-ceo)、[理想汽车李想简介](https://ir.lixiang.com/zh-hans/management/lixiang)、[ASML Martin van den Brink 简介](https://www.asml.com/en/technology/how-we-innovate/fellows/martin-van-den-brink)。

九个世纪或十年精度的出生声明已取消不受支持的具体年份，原始来源精度仍保留：Alex Krizhevsky、Forrest Li、Moxie Marlinspike、Darren Woods、Anima Anandkumar、Chuck Robbins、Limor Fried、Meredith Whittaker、Rose Marcario。Amitabh Bachchan 与周杰伦的 4 星范围已协调为 `field`；Novak Djokovic 已调整为 4 星 `field`。

## 限制与下一步门槛

百科的在世分类、缺少死亡日期、实体为人物以及抓取成功，都不能独立证明某人截至 2026-11-13 仍在世。当前 1,000 份缓存均保持待编辑复核，并未自动授予发布资格。现职、近期事件、出生日期和图片身份仍须结合近期可靠来源审核；全文撰写还须补充独立来源、肖像许可及多语言事实一致性。影响力评分属于可修订的编辑暂评，本次抽查不能替代千人逐项事实核验。

最终已重读生成集合、`selection-report.json` 和证据文件：三者均对应 1,000 人、1,000 份已采集研究资料；1,046 人合格池另有 46 人候补。六位已通过独立来源确认去世的候选未纳入本轮在世优先集合。
