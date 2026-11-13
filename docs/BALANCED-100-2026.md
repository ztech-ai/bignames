# 均衡新增100人 · 八语静态档案交付记录

署名：OpenAI Codex（AI助手） · 2026-11-13

## 范围与结果

按既有影响力星级从高到低选择尚未建档人物。原名单中的五星均已完成，因此本批全部采用现有四星，不提分、不降到三星填配额。同星级内结合长期公共成果、可核实资料、肖像可用性选择；这不是100人的精确影响力名次。

| 领域 | 新增人数 |
| --- | ---: |
| 科技与创新 | 13 |
| 商业与经济 | 13 |
| 政治与公共事务 | 13 |
| 影视与音乐 | 13 |
| 科学与医学 | 12 |
| 文学与思想 | 12 |
| 艺术与设计 | 12 |
| 体育与探索 | 12 |

新增100人、100张真实彩色肖像、200项基础资料、200项代表成果、1,036条倒序事件、743条来源记录；来源数按逐人引用记录计，并非独立出版物数量。中文及英语、法语、阿拉伯语、德语、日语、西班牙语、韩语共8种语言，产生800个新增人物HTML。

全站195人、1,954条事件、1,305条来源，1,560个人物HTML及40个辅助HTML，共1,600页；194张共享本地肖像与原有奥特加姓名占位。新100人全部配真实彩照，没有增加缺失肖像例外。之前95份人物基础JSON逐份SHA-256不变；本批100份influence对象与千人集合逐项相同，保持四星provisional状态。

千人集合中171位已有完整档案，另829位仍待完整采编；原1000份研究证据及草稿继续待审，不因本批发布而批量晋升为已核验。名单和基线：`data/collections/balanced-100-2026-11.json`与同名CSV；批次程序报告：`data/research/balanced-100-report.json`。

## 取舍与来源边界

实际检索截止2026-11-13，不预写本月后续事件。每人保留coverageNote、最近已选年表节点、引用和AI采编记录；近期访问网页不等于履历穷尽到当天。明确区分公告与完成、前任与现任、指控/程序与裁决、个人与公司责任、共同与个人成果。

在相同四星和领域内替换了两人：Andrew Barto尚未找到可核实再使用许可的真实彩照，换为Leslie Lamport；Richard Sutton公开出生年为1957或1958，当前精确日期模式无法忠实表达，换为John Hennessy。没有断言被替换者影响力更低。此前Fosse、Ando的黑白缓存分别换成经查看的可使用彩色照片；Starmer改用许可明确的2017年议会肖像。

近期重点包括Duflo/Banerjee 2026年7月苏黎世任命已生效、Starmer已结束首相任期、Lula赢得下届选举但新任期尚未开始、Iger已交接CEO但12月退休尚未发生，以及IPO认购/申请与上市完成的区别。原始资料中的出生日期、毕业年、CEO生效日期和影片年份冲突均按具名来源处理并在逐人记录说明。

部分来源直接访问受限时使用搜索索引、可访问机构资料和独立报道交叉核对，限制如实保留。Andrew Wiles的2026依据是学术发表、现有大学成员记录及讲席交接，不把Andrew Wiles Building活动当作本人出席。来源链接不是对全文已可访问的保证。

## 多语言质量与实际分工

原事实只保存在中文底本；日期、生卒、来源、分类、评分和照片在八语共享。100份英文底本与六种外语均由AI撰写或逐字段语义复核，六语各3,712字段，合计22,272字段；连同英文共25,984外语字段。没有人类或八语母语编辑签字认证。

公共机翻试验曾生成158份目标语言草稿，后因429限流以及实质语义错误停止。正式600份六语文件全部经过AI逐字段核义或直接翻译，不能用字段齐全代替语义正确。已修正的典型错误包括单打变成歌曲、网球场变成法庭、冠军次数变成排名、任教变成入学、已获胜变成准备获胜，以及小说/专辑标题被误当普通句子。

英文评级理由逐一对齐未变的中文原理由；英文参考版本变化后，各语言再次核对对应理由并通过保存器留痕，没有手改哈希消除错误。独立AI复核还覆盖root编写的8份西语共292字段，发现并修正provost和全职教授/职级等值表述；Stroustrup相关字段在六语均明确核对后保存。

`scripts/reviewed-translation.mjs`只负责版本、字段、审阅声明和原子保存，不翻译、不联网、不调用模型。`scripts/check-batch.mjs`核验本批选择、均衡分配、基线保留、原评级、资料最低覆盖、译文版本和照片字节。统一模板生成800个新人物页面，复用资源、语言导航与一页简历式排版，AI没有逐页手写HTML。

完整构建、链接、DOM行为、JavaScript及Python验证由本地交付命令执行，最终结果和文件指纹以`big-names-manifest.json`为准。浏览器验收实际尝试返回`the gaas-browser node_repl sandbox cannot be disabled`；没有完成真实桌面、移动、阿拉伯语排版或打印视觉验收，也未用替代浏览器绕过环境限制。

本次仅本地开发与交付，未推送、部署或修改域名。细节见[署名与自动化分工](AUTHORSHIP-AND-AUTOMATION.md)、[操作手册](EDITORIAL-OPERATIONS.md)和[验证记录](VALIDATION.md)。

## 人物清单

| 领域 | 姓名 | English name | ID |
| --- | --- | --- | --- |
| 科技与创新 | 吴恩达 | Andrew Ng | andrew-ng |
| 科技与创新 | 约翰·亨尼斯 | John Hennessy | john-hennessy |
| 科技与创新 | 莱斯利·兰波特 | Leslie Lamport | leslie-lamport |
| 科技与创新 | 芭芭拉·利斯科夫 | Barbara Liskov | barbara-liskov |
| 科技与创新 | 唐纳德·克努特 | Donald Knuth | donald-knuth |
| 科技与创新 | 比雅尼·斯特劳斯特鲁普 | Bjarne Stroustrup | bjarne-stroustrup |
| 科技与创新 | 詹姆斯·高斯林 | James Gosling | james-gosling |
| 科技与创新 | 罗纳德·李维斯特 | Ron Rivest | ron-rivest |
| 科技与创新 | 阿迪·沙米尔 | Adi Shamir | adi-shamir |
| 科技与创新 | 史蒂夫·沃兹尼亚克 | Steve Wozniak | steve-wozniak |
| 科技与创新 | 安迪·贾西 | Andy Jassy | andy-jassy |
| 科技与创新 | 理查德·斯托曼 | Richard Stallman | richard-stallman |
| 科技与创新 | 李彦宏 | Robin Li | robin-li |
| 商业与经济 | 本·伯南克 | Ben Bernanke | ben-bernanke |
| 商业与经济 | 珍妮特·耶伦 | Janet Yellen | janet-yellen |
| 商业与经济 | 埃丝特·迪弗洛 | Esther Duflo | esther-duflo |
| 商业与经济 | 阿比吉特·班纳吉 | Abhijit Banerjee | abhijit-banerjee |
| 商业与经济 | 克劳迪娅·戈尔丁 | Claudia Goldin | claudia-goldin |
| 商业与经济 | 达龙·阿西莫格鲁 | Daron Acemoglu | daron-acemoglu |
| 商业与经济 | 卡洛斯·斯利姆 | Carlos Slim | carlos-slim |
| 商业与经济 | 穆克什·安巴尼 | Mukesh Ambani | mukesh-ambani |
| 商业与经济 | 阿利科·丹格特 | Aliko Dangote | aliko-dangote |
| 商业与经济 | 丰田章男 | Akio Toyoda | akio-toyoda |
| 商业与经济 | 杰米·戴蒙 | Jamie Dimon | jamie-dimon |
| 商业与经济 | 鲍勃·艾格 | Bob Iger | bob-iger |
| 商业与经济 | 英德拉·努伊 | Indra Nooyi | indra-nooyi |
| 政治与公共事务 | 乔·拜登 | Joe Biden | joe-biden |
| 政治与公共事务 | 希拉里·克林顿 | Hillary Clinton | hillary-clinton |
| 政治与公共事务 | 阿尔·戈尔 | Al Gore | al-gore |
| 政治与公共事务 | 安东尼奥·古特雷斯 | António Guterres | antonio-guterres |
| 政治与公共事务 | 潘基文 | Ban Ki-moon | ban-ki-moon |
| 政治与公共事务 | 埃伦·约翰逊·瑟利夫 | Ellen Johnson Sirleaf | ellen-johnson-sirleaf |
| 政治与公共事务 | 杰辛达·阿德恩 | Jacinda Ardern | jacinda-ardern |
| 政治与公共事务 | 米歇尔·巴切莱特 | Michelle Bachelet | michelle-bachelet |
| 政治与公共事务 | 路易斯·伊纳西奥·卢拉·达席尔瓦 | Luiz Inácio Lula da Silva | luiz-inacio-lula-da-silva |
| 政治与公共事务 | 西里尔·拉马福萨 | Cyril Ramaphosa | cyril-ramaphosa |
| 政治与公共事务 | 基尔·斯塔默 | Keir Starmer | keir-starmer |
| 政治与公共事务 | 焦尔贾·梅洛尼 | Giorgia Meloni | giorgia-meloni |
| 政治与公共事务 | 格蕾塔·通贝里 | Greta Thunberg | greta-thunberg |
| 影视与音乐 | 阿黛尔 | Adele | adele |
| 影视与音乐 | 蕾哈娜 | Rihanna | rihanna |
| 影视与音乐 | 比莉·艾利什 | Billie Eilish | billie-eilish |
| 影视与音乐 | 夏奇拉 | Shakira | shakira |
| 影视与音乐 | 席琳·迪翁 | Celine Dion | celine-dion |
| 影视与音乐 | 沙鲁克·汗 | Shah Rukh Khan | shah-rukh-khan |
| 影视与音乐 | 阿米尔·汗 | Aamir Khan | aamir-khan |
| 影视与音乐 | 阿米塔布·巴强 | Amitabh Bachchan | amitabh-bachchan |
| 影视与音乐 | 李安 | Ang Lee | ang-lee |
| 影视与音乐 | 佩德罗·阿尔莫多瓦 | Pedro Almodovar | pedro-almodovar |
| 影视与音乐 | 克里斯托弗·诺兰 | Christopher Nolan | christopher-nolan |
| 影视与音乐 | 梅丽尔·斯特里普 | Meryl Streep | meryl-streep |
| 影视与音乐 | 维奥拉·戴维斯 | Viola Davis | viola-davis |
| 科学与医学 | 阿兰·阿斯佩 | Alain Aspect | alain-aspect |
| 科学与医学 | 安东·蔡林格 | Anton Zeilinger | anton-zeilinger |
| 科学与医学 | 安德烈娅·盖兹 | Andrea Ghez | andrea-ghez |
| 科学与医学 | 罗杰·彭罗斯 | Roger Penrose | roger-penrose |
| 科学与医学 | 弗朗西丝·阿诺德 | Frances Arnold | frances-arnold |
| 科学与医学 | 卡罗琳·贝尔托齐 | Carolyn Bertozzi | carolyn-bertozzi |
| 科学与医学 | 戴维·贝克 | David Baker | david-baker |
| 科学与医学 | 约翰·江珀 | John Jumper | john-jumper |
| 科学与医学 | 伊丽莎白·布莱克本 | Elizabeth Blackburn | elizabeth-blackburn |
| 科学与医学 | 卡罗尔·格雷德 | Carol Greider | carol-greider |
| 科学与医学 | 唐娜·斯特里克兰 | Donna Strickland | donna-strickland |
| 科学与医学 | 安德鲁·怀尔斯 | Andrew Wiles | andrew-wiles |
| 文学与思想 | 村上春树 | Haruki Murakami | haruki-murakami |
| 文学与思想 | 玛格丽特·阿特伍德 | Margaret Atwood | margaret-atwood |
| 文学与思想 | 石黑一雄 | Kazuo Ishiguro | kazuo-ishiguro |
| 文学与思想 | 韩江 | Han Kang | han-kang |
| 文学与思想 | 安妮·埃尔诺 | Annie Ernaux | annie-ernaux |
| 文学与思想 | 奥尔加·托卡尔丘克 | Olga Tokarczuk | olga-tokarczuk |
| 文学与思想 | 阿卜杜勒拉扎克·古尔纳 | Abdulrazak Gurnah | abdulrazak-gurnah |
| 文学与思想 | 约恩·福瑟 | Jon Fosse | jon-fosse |
| 文学与思想 | 奥尔罕·帕慕克 | Orhan Pamuk | orhan-pamuk |
| 文学与思想 | 莫言 | Mo Yan | mo-yan |
| 文学与思想 | 萨尔曼·鲁西迪 | Salman Rushdie | salman-rushdie |
| 文学与思想 | 刘慈欣 | Liu Cixin | liu-cixin |
| 艺术与设计 | 艾未未 | Ai Weiwei | ai-weiwei |
| 艺术与设计 | 安尼施·卡普尔 | Anish Kapoor | anish-kapoor |
| 艺术与设计 | 格哈德·里希特 | Gerhard Richter | gerhard-richter |
| 艺术与设计 | 玛丽娜·阿布拉莫维奇 | Marina Abramovic | marina-abramovic |
| 艺术与设计 | 蔡国强 | Cai Guo-Qiang | cai-guo-qiang |
| 艺术与设计 | 奥拉维尔·埃利亚松 | Olafur Eliasson | olafur-eliasson |
| 艺术与设计 | 诺曼·福斯特 | Norman Foster | norman-foster |
| 艺术与设计 | 雷姆·库哈斯 | Rem Koolhaas | rem-koolhaas |
| 艺术与设计 | 安藤忠雄 | Tadao Ando | tadao-ando |
| 艺术与设计 | 妹岛和世 | Kazuyo Sejima | kazuyo-sejima |
| 艺术与设计 | 大卫·奇普菲尔德 | David Chipperfield | david-chipperfield |
| 艺术与设计 | 迪埃贝多·弗朗西斯·凯雷 | Diebedo Francis Kere | diebedo-francis-kere |
| 体育与探索 | 拉斐尔·纳达尔 | Rafael Nadal | rafael-nadal |
| 体育与探索 | 大阪直美 | Naomi Osaka | naomi-osaka |
| 体育与探索 | 伊加·斯维亚特克 | Iga Świątek | iga-swiatek |
| 体育与探索 | 科科·高芙 | Coco Gauff | coco-gauff |
| 体育与探索 | 卡洛斯·阿尔卡拉斯 | Carlos Alcaraz | carlos-alcaraz |
| 体育与探索 | 斯蒂芬·库里 | Stephen Curry | stephen-curry |
| 体育与探索 | 凯文·杜兰特 | Kevin Durant | kevin-durant |
| 体育与探索 | 马克斯·维斯塔潘 | Max Verstappen | max-verstappen |
| 体育与探索 | 凯蒂·莱德基 | Katie Ledecky | katie-ledecky |
| 体育与探索 | 雪莉-安·弗雷泽-普赖斯 | Shelly-Ann Fraser-Pryce | shelly-ann-fraser-pryce |
| 体育与探索 | 米凯拉·希弗林 | Mikaela Shiffrin | mikaela-shiffrin |
| 体育与探索 | 阿曼德·杜普兰蒂斯 | Armand Duplantis | armand-duplantis |
