/* ============================================================
   海龟汤 · 题库
   ------------------------------------------------------------
   选题参考：Soupbase（https://github.com/spoonnotfound/soupbase）
     · 代码许可：MIT；只借鉴它的题目字段（汤面/汤底/事实/提示）
       与主持判定协议（是 / 不是 / 不重要 / 无法确认），
       没有复制它的 Next.js、PostgreSQL、模型调用代码。
     · 题目许可：soupbase 在 content/LICENSE.md 里明确把
       doorbell / lit-room / blank-last-page 三道示例题以 CC0 1.0 释出，
       因此可以自由修改、商用、再分发。本文件在保留原意的前提下
       补充了供本地判题使用的 keywords / negKeys 字段。
     · 其余 3 道「空座位 / 凌晨的快递 / 不关的水龙头」为本项目原创，
       同样以 CC0 1.0 释出。

   选题参考 2：lateral-thinking-mcp-server
     （https://github.com/sanzgiri/lateral-thinking-mcp-server）
     · 仓库 README 声明 License: ISC（仓库内未附 LICENSE 文件）。
     · 这里把 puzzle_001 / 002 / 004 / 005 / 010 / 012 / 014 / 015
       八道英文 lateral thinking 题翻译改写成中文海龟汤，并按 ISC 许可
       在每题 source 里保留来源与许可说明。

   字段说明（在 soupbase schema 上做的唯一扩展）：
     facts[].keys  该事实的关键词，用于无模型时的本地判定
     negKeys       常见错误假设；命中即答「不是」
     solutionKeys  汤底关键词，用于判断玩家猜底是否接近
   ============================================================ */
'use strict';

const DIFFICULTY = {
  easy: '入门',
  medium: '标准',
  hard: '进阶',
};

const PUZZLES = [
  {
    id: 'doorbell',
    title: '没有响过的门铃',
    difficulty: 'easy',
    tags: ['日常', '反直觉'],
    surface: '小林按了门铃，屋里没有任何铃声。几秒后，小周却来开门了。小周没有看见门外的小林，也没有听到他的声音。他怎么知道有人来？',
    solution: '小周听不见声音，家中安装了可视提醒门铃：门外按钮连接的室内灯会闪烁，不会发声。小林按按钮后，小周看到了闪灯，因此知道有人到访并来开门。他开门前不知道访客是谁。',
    facts: [
      { text: '小周听不见声音。', required: false, keys: ['听不见', '聋', '失聪', '听力'] },
      { text: '门铃按钮触发室内灯闪烁，不产生铃声。', required: true, keys: ['灯', '闪', '可视', '光', '亮'] },
      { text: '小周看见闪灯而知道有人到访。', required: true, keys: ['看见', '看到', '闪灯', '灯亮', '光'] },
    ],
    negKeys: ['摄像头', '监控', '喊话', '敲门', '手机响', '视频通话'],
    solutionKeys: ['听不见', '可视门铃', '灯', '闪', '光'],
    hints: ['这里的门铃提供了一种提醒。', '提醒不一定是声音。', '屋内有一个会变化的光源。'],
    unknowns: ['没有设定小林到访的目的。', '没有设定小周的年龄。'],
    source: {
      name: 'Soupbase 示例题',
      url: 'https://github.com/spoonnotfound/soupbase',
      license: 'CC0 1.0',
      note: '取自 content/puzzles/zh/doorbell.json，按 CC0 1.0 使用并补充本地判题字段。',
    },
  },
  {
    id: 'lit-room',
    title: '一直亮着的房间',
    difficulty: 'medium',
    tags: ['日常', '科技'],
    surface: '晚上，林远看到对面房间的灯亮着，就放心地关上手机睡了。他没有和任何人联系，房间里也没有人。为什么？',
    solution: '林远在自己家用手机远程控制无人居住的工作室灯光，测试智能插座是否恢复连接。工作室正好在对面楼，可以从家中看到。看到灯亮说明远程控制成功。他不认识附近其他住户，也没有向任何人求助。',
    facts: [
      { text: '对面的房间是林远无人居住的工作室。', required: true, keys: ['工作室', '空房', '没人住', '无人', '自己的房'] },
      { text: '林远用手机远程控制工作室灯光，测试智能插座连接。', required: true, keys: ['远程', '手机', '智能插座', '控制', '开关', '测试'] },
      { text: '看到灯亮说明测试成功，因此他放心睡觉。', required: true, keys: ['测试成功', '灯亮', '放心', '连接'] },
    ],
    negKeys: ['女朋友', '家人', '邻居', '有人住', '约会', '报警', '小偷'],
    solutionKeys: ['工作室', '远程', '智能插座', '灯', '测试'],
    hints: ['那盏灯的作用不是告诉他有人在家。', '他在手机上做了一次测试。', '他能控制对面的灯。'],
    unknowns: ['没有设定智能插座此前断线的原因。'],
    source: {
      name: 'Soupbase 示例题',
      url: 'https://github.com/spoonnotfound/soupbase',
      license: 'CC0 1.0',
      note: '取自 content/puzzles/zh/lit-room.json，按 CC0 1.0 使用并补充本地判题字段。',
    },
  },
  {
    id: 'blank-last-page',
    title: '空白的最后一页',
    difficulty: 'hard',
    tags: ['日常', '文字'],
    surface: '读到一本书的最后一页时，女孩笑了。那一页一个字也没有，而她之前一直很紧张。发生了什么？',
    solution: '女孩在检查自己刚装订好的练字作品集，担心最后一张纸背面的墨迹透到末页。她不是在读故事，而是逐页检查成品。翻到末页发现纸面干净、没有透墨，于是松了一口气笑了。',
    facts: [
      { text: '这是女孩自己的练字作品集，她在检查装订成品。', required: true, keys: ['练字', '作品集', '装订', '自己的', '成品', '检查'] },
      { text: '她担心墨迹透到末页，发现末页干净说明没有透墨。', required: true, keys: ['墨迹', '透', '背面', '干净', '末页', '纸'] },
    ],
    negKeys: ['故事结局', '小说', '作者', '密码', '遗书', '日记', '空白页'],
    solutionKeys: ['练字', '装订', '墨迹', '透墨', '末页', '纸'],
    hints: ['她担心的不是故事结局。', '这本书与她自己的劳动有关。', '她检查的是纸张上的痕迹。'],
    unknowns: ['没有设定女孩的年龄。'],
    source: {
      name: 'Soupbase 示例题',
      url: 'https://github.com/spoonnotfound/soupbase',
      license: 'CC0 1.0',
      note: '取自 content/puzzles/zh/blank-last-page.json，按 CC0 1.0 使用并补充本地判题字段。',
    },
  },
  {
    id: 'empty-seat',
    title: '空座位',
    difficulty: 'easy',
    tags: ['日常', '反转'],
    surface: '男人每次看电影都买两张票，却总是一个人。散场时，他把旁边空座位上的外套拿起来穿上了。为什么？',
    solution: '男人是盲人，带着导盲犬进影院。多买的一张票是给狗留的位置，狗一直趴在座位下面。电影放映时他把外套脱下来放在旁边的空座位上，散场时再拿起来穿上。',
    facts: [
      { text: '男人是盲人。', required: true, keys: ['盲', '看不见', '视力', '导盲'] },
      { text: '两张票是为导盲犬留的位置，狗趴在座位下面。', required: true, keys: ['导盲犬', '狗', '宠物', '陪伴', '两张票', '座位'] },
      { text: '外套是他自己脱下来放在空座位上的。', required: true, keys: ['外套', '自己', '脱', '衣服'] },
    ],
    negKeys: ['朋友', '约会', '情侣', '妻子', '幽灵', '小偷', '尸体', '小孩'],
    solutionKeys: ['盲人', '导盲犬', '两张票', '外套', '自己的'],
    hints: ['他并不是一个人来的。', '多出来的那张票不是给人坐的。', '外套的主人和他是同一个人。'],
    unknowns: ['没有设定看的什么电影。', '没有设定导盲犬的品种。'],
    source: {
      name: '本站原创',
      url: '',
      license: 'CC0 1.0',
      note: '为本项目撰写，按 CC0 1.0 释出。',
    },
  },
  {
    id: 'dawn-delivery',
    title: '凌晨的快递',
    difficulty: 'medium',
    tags: ['亲情', '日常'],
    surface: '凌晨三点，他收到一条快递签收通知，显示「本人签收」。他明明一直在家，却没听到敲门。他看完通知，反而放心地睡了。为什么？',
    solution: '快递寄给他独居的母亲。他一直担心母亲不会用手机、收不到取件信息，所以把收件地址填成母亲家，并备注送货上门。签收通知来自母亲家的地址，「本人签收」说明母亲平安在家、自己收了快递。他并不在母亲家，所以没听到敲门。',
    facts: [
      { text: '快递是寄给他独居母亲的。', required: true, keys: ['母亲', '妈妈', '独居', '老人', '寄给', '家人'] },
      { text: '签收通知来自母亲家的地址，不是他家。', required: true, keys: ['地址', '母亲家', '不是他家', '另一个地址', '老家'] },
      { text: '「本人签收」说明母亲平安在家。', required: true, keys: ['本人签收', '不会用手机', '平安', '在家', '放心', '安全'] },
    ],
    negKeys: ['快递员', '偷窃', '自己签收', '门铃', '出差', '公司', '同事'],
    solutionKeys: ['母亲', '独居', '本人签收', '平安', '放心'],
    hints: ['快递不是寄给他的。', '他一直在家，但收件地址不是他家。', '他担心的是收件的那个人。'],
    unknowns: ['没有设定快递里是什么。', '没有设定母亲的身体状况细节。'],
    source: {
      name: '本站原创',
      url: '',
      license: 'CC0 1.0',
      note: '为本项目撰写，按 CC0 1.0 释出。',
    },
  },
  {
    id: 'running-tap',
    title: '不关的水龙头',
    difficulty: 'medium',
    tags: ['生活常识', '冬天'],
    surface: '他出门前特意把厨房水龙头拧开，让水一直细流。邻居提醒他这样很浪费水，他却说这样才安全。为什么？',
    solution: '正值冬天，他住的是水管裸露的老楼，马上要离家很多天。关紧水龙头后管内积水容易结冰、把水管冻裂，回来会水漫一地。让水保持细流，水一直在动就不容易结冰。他宁可浪费一点水，也不想水管爆裂。',
    facts: [
      { text: '正值冬天，他要离家很多天。', required: true, keys: ['冬天', '冷', '离家', '出门', '出差', '旅行', '多天'] },
      { text: '老楼的水管容易结冰爆裂。', required: true, keys: ['水管', '结冰', '冻住', '爆裂', '老楼'] },
      { text: '让水保持细流可以防止水管冻住。', required: true, keys: ['细流', '滴水', '流动', '防冻', '一直开'] },
    ],
    negKeys: ['水费', '忘关', '浪费', '漏水', '停水', '洗澡'],
    solutionKeys: ['冬天', '水管', '结冰', '细流', '防冻'],
    hints: ['这和水费无关。', '和外面的温度有关。', '他怕的不是浪费，而是水管坏掉。'],
    unknowns: ['没有设定他离家的具体天数。', '没有设定他去哪里。'],
    source: {
      name: '本站原创',
      url: '',
      license: 'CC0 1.0',
      note: '为本项目撰写，按 CC0 1.0 释出。',
    },
  },

  /* ---------- 以下 8 题翻译改自 lateral-thinking-mcp-server（ISC）---------- */
  {
    id: 'hiccup-gun',
    title: '一杯水和一把枪',
    difficulty: 'easy',
    tags: ['经典', '反直觉'],
    surface: '男人走进酒吧，向调酒师要一杯水。调酒师却掏出一把枪指着他。男人说了声「谢谢」，转身走了。为什么？',
    solution: '男人打嗝停不下来，想喝水止嗝。调酒师看出他的困扰，用枪吓了他一下，惊吓把嗝吓停了。男人道谢离开，并不是真的口渴。',
    facts: [
      { text: '男人在打嗝，喝水是为了止嗝。', required: true, keys: ['打嗝', '嗝'] },
      { text: '调酒师掏枪是为了吓他。', required: true, keys: ['吓', '惊吓', '吓唬', '威胁'] },
      { text: '惊吓让打嗝停了，所以男人道谢。', required: true, keys: ['停了', '止住', '好了', '道谢', '谢谢'] },
    ],
    negKeys: ['抢劫', '自杀', '谋杀', '仇人', '警察', '醉酒', '枪战', '要钱'],
    solutionKeys: ['打嗝', '吓', '枪', '止嗝', '谢谢'],
    hints: ['男人要水不是因为他渴。', '调酒师其实是在帮他。', '有一种常见办法能止住这种小毛病。'],
    unknowns: ['没有设定男人和调酒师是否认识。', '没有设定枪里有没有子弹。'],
    source: {
      name: 'lateral-thinking-mcp-server #001',
      url: 'https://github.com/sanzgiri/lateral-thinking-mcp-server',
      license: 'ISC',
      note: '翻译改写自 puzzle_001（打嗝/水/枪）；仓库 README 声明 ISC，仓库内未附 LICENSE 文件。',
    },
  },
  {
    id: 'open-package',
    title: '田野里的包裹',
    difficulty: 'medium',
    tags: ['经典', '意外'],
    surface: '一个男人死在空旷的田野里，身边只有一个没有拆开的包裹。现场没有别的线索。他是怎么死的？',
    solution: '他是跳伞者，降落伞没有打开。那个「没拆开的包裹」就是没能展开的降落伞。他从空中直接坠落，所以田野里没有别的痕迹。',
    facts: [
      { text: '男人是从空中坠落的。', required: true, keys: ['跳伞', '飞机', '空中', '坠落', '摔死', '降落'] },
      { text: '「包裹」是没能打开的降落伞。', required: true, keys: ['降落伞', '伞包', '没打开', '未打开', '伞'] },
      { text: '田野空旷，所以看起来没有别的线索。', required: false, keys: ['田野', '空地', '没有脚印'] },
    ],
    negKeys: ['炸弹', '快递', '行李箱', '谋杀', '中毒', '徒步', '迷路', '动物咬'],
    solutionKeys: ['跳伞', '降落伞', '没打开', '坠落', '高空'],
    hints: ['他不是走到田野中央的。', '那个包裹本来应该打开。', '想一想人怎么会从天上掉下来。'],
    unknowns: ['没有设定他的姓名和跳伞经验。'],
    source: {
      name: 'lateral-thinking-mcp-server #002',
      url: 'https://github.com/sanzgiri/lateral-thinking-mcp-server',
      license: 'ISC',
      note: '翻译改写自 puzzle_002（田野/未拆开的包裹）；仓库 README 声明 ISC，仓库内未附 LICENSE 文件。',
    },
  },
  {
    id: 'shoot-husband',
    title: '先开枪，再按进水里',
    difficulty: 'medium',
    tags: ['文字', '经典'],
    surface: '女人先朝丈夫「开枪」，又把丈夫按进水里五分钟，接着把他挂了起来。做完这些，两个人一起吃了顿愉快的晚餐。这是怎么回事？',
    solution: '她是摄影师。「开枪」是按下快门拍照，「按进水里」是把照片放进显影液冲洗，「挂起来」是把照片挂起来晾干。她拍的正是丈夫，所以晚饭时两人还好好的。',
    facts: [
      { text: '女人是摄影师。', required: true, keys: ['摄影师', '照相', '拍照', '照片'] },
      { text: '「开枪」是拍照。', required: true, keys: ['快门', '拍照', '照相', '相机', '镜头'] },
      { text: '「按进水里」是冲洗照片，「挂起来」是晾干照片。', required: true, keys: ['冲洗', '显影', '晾干', '挂照片', '暗房'] },
    ],
    negKeys: ['谋杀', '家暴', '溺水', '上吊', '尸体', '分尸', '报复', '意外', '死了', '去世', '受伤', '枪杀', '中枪'],
    solutionKeys: ['摄影师', '拍照', '冲洗', '显影', '晾干', '照片'],
    hints: ['「开枪」「按进水里」「挂起来」都可以有别的意思。', '这和一种需要暗房的职业有关。', '丈夫并没有受伤。'],
    unknowns: ['没有设定照片的内容。'],
    source: {
      name: 'lateral-thinking-mcp-server #004',
      url: 'https://github.com/sanzgiri/lateral-thinking-mcp-server',
      license: 'ISC',
      note: '翻译改写自 puzzle_004（摄影师冲洗照片）；仓库 README 声明 ISC，仓库内未附 LICENSE 文件。',
    },
  },
  {
    id: 'hotel-fortune',
    title: '推车到旅馆',
    difficulty: 'hard',
    tags: ['经典', '视角'],
    surface: '男人把车推到一家旅馆门口，随后就破产了。发生了什么？',
    solution: '他们在玩大富翁。男人用「汽车」棋子走到了一格旅馆，付不起租金，于是输光了钱。那不是真的车，也不是真的旅馆。',
    facts: [
      { text: '这是棋盘游戏，不是现实。', required: true, keys: ['大富翁', '棋盘', '游戏', '桌游', '棋子'] },
      { text: '「车」是游戏里的汽车棋子。', required: true, keys: ['棋子', '汽车棋子', '小车'] },
      { text: '他落在旅馆格，付不起租金而破产。', required: true, keys: ['旅馆', '租金', '破产', '付不起', '钱'] },
    ],
    negKeys: ['车祸', '真车', '酒店', '抢劫', '赌博', '赌场', '欠债', '推车'],
    solutionKeys: ['大富翁', '棋子', '旅馆', '租金', '破产'],
    hints: ['这不是现实里发生的事。', '「车」和「旅馆」都是游戏里的东西。', '想一想哪款桌游会让人因为旅馆破产。'],
    unknowns: ['没有设定他玩的是哪个版本的大富翁。'],
    source: {
      name: 'lateral-thinking-mcp-server #005',
      url: 'https://github.com/sanzgiri/lateral-thinking-mcp-server',
      license: 'ISC',
      note: '翻译改写自 puzzle_005（大富翁/旅馆）；仓库 README 声明 ISC，仓库内未附 LICENSE 文件。',
    },
  },
  {
    id: 'two-fathers',
    title: '两个父亲和两个儿子',
    difficulty: 'easy',
    tags: ['经典', '逻辑'],
    surface: '两个父亲和两个儿子一起去钓鱼，每人钓到一条鱼，最后却只带回家三条。鱼没有丢，也没有被吃掉。为什么？',
    solution: '去的其实只有三个人：爷爷、爸爸、儿子。爸爸既是爷爷的儿子，又是儿子的父亲，所以「两个父亲和两个儿子」加起来只有三个人，三条鱼刚好一人一条。',
    facts: [
      { text: '现场只有三个人。', required: true, keys: ['三个人', '三人', '只有三'] },
      { text: '中间那个人既是父亲又是儿子。', required: true, keys: ['爷爷', '爸爸', '父子', '三代', '中间'] },
      { text: '角色重叠，所以人数比称呼少。', required: true, keys: ['重叠', '既是', '又是', '同一个人'] },
    ],
    negKeys: ['四个人', '鱼被吃了', '鱼丢了', '送人', '放生', '四条', '秤坏了', '鱼死了'],
    solutionKeys: ['三个人', '爷爷', '爸爸', '儿子', '三代'],
    hints: ['不要按称呼直接算人数。', '有一个人同时占两个身份。', '想一想祖孙三代。'],
    unknowns: ['没有设定他们钓的是什么鱼。'],
    source: {
      name: 'lateral-thinking-mcp-server #012',
      url: 'https://github.com/sanzgiri/lateral-thinking-mcp-server',
      license: 'ISC',
      note: '翻译改写自 puzzle_012（三代人钓鱼）；仓库 README 声明 ISC，仓库内未附 LICENSE 文件。',
    },
  },
  {
    id: 'seventh-floor',
    title: '只坐到七楼',
    difficulty: 'medium',
    tags: ['经典', '日常'],
    surface: '男人住十楼。每天早上他坐电梯直达一楼；晚上回家却只坐到七楼，再走楼梯上去。只有下雨天，他才会直接坐到十楼。为什么？',
    solution: '男人个子很矮，够不到十楼的按钮。下楼时按最下面的一楼很容易；上楼时他只能按到七楼，只好走上去。下雨天他带着伞，用伞尖够到了十楼按钮。',
    facts: [
      { text: '男人个子矮，够不到十楼按钮。', required: true, keys: ['矮', '够不到', '按不到', '身高', '按钮太高'] },
      { text: '下楼按一楼没问题，上楼只能按到七楼。', required: true, keys: ['一楼', '七楼', '下楼', '上楼', '按得到'] },
      { text: '下雨天用伞够到十楼按钮。', required: true, keys: ['雨伞', '伞', '下雨', '够到', '按到十楼'] },
    ],
    negKeys: ['健身', '锻炼', '电梯坏了', '怕高', '忘带钥匙', '停电', '减肥', '七楼住人'],
    solutionKeys: ['矮', '够不到', '按钮', '七楼', '雨伞'],
    hints: ['问题出在他按按钮的方式。', '下楼和上楼的区别在于按钮的位置。', '下雨天他会多带一样东西。'],
    unknowns: ['没有设定他的具体身高。'],
    source: {
      name: 'lateral-thinking-mcp-server #014',
      url: 'https://github.com/sanzgiri/lateral-thinking-mcp-server',
      license: 'ISC',
      note: '翻译改写自 puzzle_014（矮个子/电梯/雨伞）；仓库 README 声明 ISC，仓库内未附 LICENSE 文件。',
    },
  },
  {
    id: 'horse-friday',
    title: '星期五进城',
    difficulty: 'easy',
    tags: ['文字', '经典'],
    surface: '牛仔星期五进城，住了三天，又在星期五出城。这是怎么回事？',
    solution: '他的马叫「星期五」。他骑着名叫星期五的马进城，住了三天，再骑着星期五出城。这里的「星期五」不是星期几，而是马的名字。',
    facts: [
      { text: '星期五是马的名字。', required: true, keys: ['马', '马名', '马叫', '坐骑'] },
      { text: '他骑马进出城，不是日期。', required: true, keys: ['骑马', '骑着', '坐骑', '不是日期', '名字'] },
    ],
    negKeys: ['时光倒流', '穿越', '记错日子', '日历坏了', '住了一周', '时差', '火车', '汽车'],
    solutionKeys: ['马', '名字', '星期五', '骑马'],
    hints: ['「星期五」不一定指星期。', '他进出城都骑着一样东西。', '给坐骑起个名字很常见。'],
    unknowns: ['没有设定他进城做什么。'],
    source: {
      name: 'lateral-thinking-mcp-server #015',
      url: 'https://github.com/sanzgiri/lateral-thinking-mcp-server',
      license: 'ISC',
      note: '翻译改写自 puzzle_015（马叫 Friday）；仓库 README 声明 ISC，仓库内未附 LICENSE 文件。',
    },
  },
  {
    id: 'surgeon-mother',
    title: '不能动手术的外科医生',
    difficulty: 'medium',
    tags: ['经典', '偏见'],
    surface: '父亲和儿子出了车祸，父亲当场去世。儿子被送进医院，外科医生看了一眼说：「我不能给他动手术，他是我的儿子。」这是怎么回事？',
    solution: '外科医生是男孩的母亲。题目从没说过医生是男性，很多人会自动把「外科医生」想成男人，才觉得矛盾。',
    facts: [
      { text: '外科医生是男孩的母亲。', required: true, keys: ['母亲', '妈妈', '女的', '女性', '妈妈是医生'] },
      { text: '医生不是父亲，父亲已经去世。', required: true, keys: ['不是父亲', '父亲死了', '妈妈', '母亲'] },
      { text: '题目没有限定医生的性别。', required: false, keys: ['没说', '性别', '没限定', '偏见'] },
    ],
    negKeys: ['继父', '养父', '双胞胎', '鬼魂', '同名', '认错人', '父亲没死', '穿越', '男医生', '男性'],
    solutionKeys: ['母亲', '妈妈', '女医生', '外科医生', '性别'],
    hints: ['题目里没有说医生是男的。', '父亲已经不可能来做手术了。', '想一想还有哪位家长。'],
    unknowns: ['没有设定男孩的年龄和伤情。'],
    source: {
      name: 'lateral-thinking-mcp-server #010',
      url: 'https://github.com/sanzgiri/lateral-thinking-mcp-server',
      license: 'ISC',
      note: '翻译改写自 puzzle_010（外科医生是母亲）；仓库 README 声明 ISC，仓库内未附 LICENSE 文件。',
    },
  },
];

function normText(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/[\s\u3000]+/g, '');
}

/* 无模型时的本地判定：只基于题库里的关键词。
 * 命中越集中越肯定；拿不准就给「部分」或「无法确认」，绝不编造汤底细节。
 * 返回的 note 会广播给所有人，所以这里不放任何事实原文。 */
function judgeQuestion(p, question) {
  const q = normText(question);
  if (!q) return { verdict: 'unknown', note: '' };
  if ((p.negKeys || []).some((k) => q.includes(normText(k)))) {
    return { verdict: 'no', note: '' };
  }
  const matched = p.facts.filter((f) => (f.keys || []).some((k) => q.includes(normText(k))));
  if (!matched.length) return { verdict: 'irrelevant', note: '' };
  if (matched.length >= 2) return { verdict: 'yes', note: '' };
  return { verdict: 'partial', note: '' };
}

function judgeGuess(p, guess) {
  const g = normText(guess);
  if (!g) return { verdict: 'no', note: '' };
  const required = p.facts.filter((f) => f.required);
  const hit = required.filter((f) => (f.keys || []).some((k) => g.includes(normText(k))));
  const solKeys = p.solutionKeys || [];
  const solHit = solKeys.filter((k) => g.includes(normText(k)));
  const ratio = required.length ? hit.length / required.length : 0;
  if ((required.length && hit.length === required.length)
    || (solKeys.length && solHit.length >= Math.max(3, Math.ceil(solKeys.length * 0.6)))) {
    return { verdict: 'correct', note: '' };
  }
  if (ratio >= 0.5 || solHit.length >= 2) return { verdict: 'partial', note: '' };
  return { verdict: 'no', note: '' };
}

/* 给主持人选题用的轻量列表：不含汤底，避免无意剧透 */
function list() {
  return PUZZLES.map((p) => ({
    id: p.id,
    title: p.title,
    difficulty: p.difficulty,
    difficultyLabel: DIFFICULTY[p.difficulty] || p.difficulty,
    tags: p.tags.slice(),
    surface: p.surface,
    hintCount: p.hints.length,
    source: { name: p.source.name, url: p.source.url, license: p.source.license },
  }));
}

function get(id) {
  return PUZZLES.find((p) => p.id === id) || null;
}

module.exports = { PUZZLES, DIFFICULTY, list, get, judgeQuestion, judgeGuess };
