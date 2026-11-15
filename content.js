// 数据表：从单机版 solo.html 原样搬运（卡牌 / 天赋 / BOSS / 常量）

// ================= 工具 =================
let uid=0;
// 牌组条目：{id, cd 费用变化, fxm 效果倍率, lv 升级次数} —— 支持"降费/增效"两种升级
const mkEntry = id => ({id, cd:0, fxm:1, lv:0});
function scaleFx(fx,m){
  const o={...fx};          // ← 先完整复制：漏掉 spring / randomEntry / blockPlayed 等非数值字段，升级后整张牌会变成空卡
  // 注意：selfDmg（自损）不随升级上涨，maxHpCost（扣上限）也不涨——
  //       自残牌升级应该「正面更强、代价不变」，否则像淬血这种升级 = 白扣 2 点血换 0 收益
  ['dmg','block','heal','gold','poison','poisonE','gu','vuln','strength','maxHp','draw','poisonTick','random','energy','randomEntry','randomSetup','blockPlayed','spring','loseBlock','safeSetup','guConvert','guRot','guDoom'].forEach(k=>{
    if(fx[k]!=null) o[k]=Math.max(1,Math.round(fx[k]*m));
  });
  return o;
}
// 「牌数联动」成长表也跟着升级放大（per/cap 之外的数值型字段）
function scaleLadder(s,m){
  if(!s || m===1) return s;
  const o={...s};
  ['dmg','block','heal','gold','poison','draw','vuln'].forEach(k=>{ if(o[k]!=null) o[k]=Math.max(1,Math.round(o[k]*m)); });
  if(o.cap!=null) o.cap=Math.round(o.cap*m);
  return o;
}
function mk(entry){
  const id = typeof entry==='string'? entry : entry.id;
  const base = POOL[id];
  const c = {...base, uid:++uid, id};
  if(typeof entry==='object' && entry){
    const minC = base.minCost ?? 0;                  // ← 每张卡有降费下限
    c.cost = Math.max(minC, base.cost + (entry.cd||0));
    if(entry.fxm && entry.fxm!==1){
      c.fx = scaleFx(base.fx, entry.fxm);
      if(base.scale) c.scale = scaleLadder(base.scale, entry.fxm);
    }
    c.level = entry.lv||0;
  }
  return c;
}

// ================= 卡牌 =================
// fx 字段：dmg伤害 block格挡 draw抽牌 gold金币 heal治疗 poison中毒 vuln易伤 strength力量
//          poisonTick 立即结算毒伤 random 随机临时牌 selfDmg 自损
// minCost：降费下限。0 = 可以降到0费；1/2 = 最低只能降到该数值（防无限刷）

// ================= 卡牌 =================
// ================= 卡牌 =================
// fx 字段：dmg伤害 block格挡 draw抽牌 gold金币 heal治疗 poison中毒 vuln易伤 strength力量
//          poisonTick 立即结算毒伤 random 随机临时牌 selfDmg 自损
// minCost：降费下限。0 = 可以降到0费；1/2 = 最低只能降到该数值（防无限刷）
const POOL = {
  // —— 无词条普通牌 ——
  strike:  {name:'打击',   cat:'攻击', kind:'attack',  cost:1, minCost:0, fx:{dmg:6},            desc:'造成6点伤害'},
  anger:   {name:'愤怒',   cat:'攻击', kind:'attack',  cost:0, minCost:0, fx:{dmg:6},            desc:'造成6点伤害（消耗0能量）'},
  ironwave:{name:'铁斩波', cat:'攻击', kind:'attack',  cost:1, minCost:0, fx:{dmg:5,block:5},    desc:'造成5点伤害，并获得5点格挡'},
  heavy:   {name:'重击',   cat:'攻击', kind:'attack',  cost:2, minCost:1, fx:{dmg:14},           desc:'造成14点伤害'},
  bash:    {name:'碎击',   cat:'攻击', kind:'attack',  cost:2, minCost:1, fx:{dmg:8,vuln:2},     desc:'造成8点伤害，施加2层易伤'},
  poison:  {name:'毒刃',   cat:'攻击', kind:'attack',  cost:1, minCost:0, fx:{dmg:4,poison:3},   desc:'造成4点伤害，施加3层中毒'},
  venom_trap:{name:'毒陷阱',cat:'攻击',kind:'attack',  cost:1, minCost:0, fx:{poison:6},         desc:'施加6层中毒（配合毒联动天赋）'},
  defend:  {name:'防御',   cat:'防御', kind:'defense', cost:1, minCost:0, fx:{block:5},          desc:'获得5点格挡'},
  ironwall:{name:'铁壁',   cat:'防御', kind:'defense', cost:2, minCost:1, fx:{block:12},         desc:'获得12点格挡'},
  tactic:  {name:'战术',   cat:'技能', kind:'skill',   cost:1, minCost:1, fx:{draw:2},           desc:'抽2张牌'},
  insight: {name:'洞察',   cat:'技能', kind:'skill',   cost:0, minCost:0, fx:{draw:1},           desc:'抽1张牌'},
  herb:    {name:'药草',   cat:'技能', kind:'skill',   cost:1, minCost:0, fx:{heal:6},           desc:'恢复6点生命'},
  goldhand:{name:'攫财之手',cat:'技能',kind:'skill',   cost:1, minCost:1, fx:{gold:15},          desc:'获得15金币（不可降费）'},
  goldpan: {name:'淘金',   cat:'技能', kind:'skill',   cost:0, minCost:0, fx:{gold:6},           desc:'获得6金币（无战斗效果）'},
  powcard: {name:'力量',   cat:'技能', kind:'skill',   cost:1, minCost:1, fx:{strength:2},       desc:'永久获得2点力量（不可降费）'},
  spark:   {name:'灵光乍现',cat:'技能',kind:'skill',   cost:1, minCost:1, fx:{random:1},         desc:'随机获得1张临时牌（转瞬）'},
  vamp:    {name:'吸血',   cat:'攻击', kind:'attack',  cost:1, minCost:0, fx:{dmg:6,heal:3},     desc:'造成6点伤害，恢复3生命'},
  venomb:  {name:'剧毒之刃',cat:'攻击',kind:'attack',  cost:1, minCost:0, fx:{dmg:3,poison:5},   desc:'造成3点伤害，施加5层中毒'},
  burst:   {name:'灵能爆发',cat:'攻击', kind:'attack',  cost:2, minCost:2, fx:{dmg:20},           desc:'造成20点伤害（不可降费）'},
  sacrifice:{name:'舍身一击',cat:'攻击',kind:'attack', cost:1, minCost:1, fx:{dmg:16,selfDmg:4}, desc:'造成16点伤害，自身失去4生命'},
  extract: {name:'榨取',   cat:'技能', kind:'skill',   cost:0, minCost:0, fx:{draw:1,gold:5},    desc:'抽1张牌，获得5金币'},
  barricade:{name:'壁垒',  cat:'防御', kind:'defense', cost:2, minCost:1, fx:{block:15},         desc:'获得15点格挡'},
  reposte: {name:'反击形态',cat:'防御',kind:'defense', cost:1, minCost:0, fx:{block:4,dmg:4},    desc:'获得4点格挡，造成4点伤害'},
  brute:   {name:'蛮力',   cat:'技能', kind:'skill',   cost:2, minCost:1, fx:{strength:3},       desc:'永久获得3点力量'},
  // —— 整备触发器：本身没有「整备」词条，但能当场引爆已布置的整备 ——
  panic:    {name:'惊慌失措', cat:'技能', kind:'skill', cost:0, minCost:0, fx:{loseBlock:6, randomSetup:1}, desc:'失去6点格挡，随机触发1个整备效果', word:'整备触发器：0 费，但要先吃掉自己 6 点格挡才换到 1 次引爆（没有整备词条，不占布置位）。它不抽牌、不给资源，净收益就是那一次引爆，所以和白给 6 伤的「愤怒」一样可以吃 0 费'},
  call:     {name:'战斗号令', cat:'技能', kind:'skill', cost:1, minCost:0, fx:{block:6, randomSetup:1}, desc:'获得6点格挡，随机触发1个整备效果', word:'整备触发器：铺格挡的同时引爆一次整备，自己续自己的燃料'},
  slam:     {name:'草木皆兵', cat:'核心', kind:'skill', cost:1, minCost:0, fx:{blockSetup:{per:4,cap:6}}, desc:'消耗你的全部格挡，每4点随机触发1个整备效果（最多6次）', word:'整备触发器·关键牌：把攒下的格挡一次性换成整备爆发，是整备流唯一的爆发手段。名字取自「风声鹤唳，草木皆兵」——攒的格挡越多，炸出来的整备越多'},

  // —— 整备（能力牌·每回合开始触发） ——
  setup_bomb: {name:'整备·炮击', cat:'整备', kind:'setup', cost:1, minCost:0, fx:{dmg:8},   desc:'每回合开始造成8点伤害',      word:'整备：每回合开始时发动（仅本场战斗）'},
  setup_guard:{name:'整备·盾卫', cat:'整备', kind:'setup', cost:1, minCost:0, fx:{block:5}, desc:'每回合开始获得5点格挡',      word:'整备：每回合开始时发动（仅本场战斗）'},
  setup_regen:{name:'整备·再生', cat:'整备', kind:'setup', cost:1, minCost:0, fx:{heal:4},  desc:'每回合开始恢复4生命',        word:'整备：每回合开始时发动（仅本场战斗）'},
  setup_venom:{name:'整备·毒瘴', cat:'整备', kind:'setup', cost:1, minCost:0, fx:{poison:4},desc:'每回合开始施加4层中毒',      word:'整备：每回合开始时发动（仅本场战斗）'},
  setup_energy:{name:'整备·蓄能', cat:'整备', kind:'setup', cost:1, minCost:0, fx:{energy:1},desc:'每回合开始额外获得1点能量',   word:'整备：每回合开始时发动（仅本场战斗）'},
  setup_tactic:{name:'整备·军师', cat:'整备', kind:'setup', cost:1, minCost:0, fx:{draw:1,gold:3}, desc:'每回合开始抽1张牌并获得3金币', word:'整备：每回合开始时发动（仅本场战斗）'},
  setup_echo: {name:'整备·回响', cat:'整备', kind:'setup', cost:1, minCost:0, fx:{randomEntry:1}, desc:'每回合开始随机触发1个已登记的登场效果', word:'整备：整备→登场 衔接牌。它自己能触发登场，但登场牌不会回头选中它（避免回环空转）'},
  setup_weak: {name:'整备·挫锐', cat:'整备', kind:'setup', cost:1, minCost:0, fx:{vuln:2},   desc:'每回合开始给敌人施加2层易伤', word:'整备：每回合开始时发动（仅本场战斗）'},
  setup_pillage:{name:'整备·掠夺',cat:'整备',kind:'setup', cost:1, minCost:0, fx:{gold:9},   desc:'每回合开始获得9金币',        word:'整备：整备流的经济基础，铺得越多回本越快'},
  // 新增整备牌：补「格挡」维度 —— 格挡既保命，也是「草木皆兵」这类触发牌的燃料
  setup_bulwark:{name:'整备·壁垒', cat:'整备', kind:'setup', cost:2, minCost:1, fx:{block:8}, desc:'每回合开始获得8点格挡', word:'整备：每回合开始时发动（仅本场战斗）'},
  setup_aegis: {name:'整备·援护', cat:'整备', kind:'setup', cost:1, minCost:0, fx:{block:4,gold:3}, desc:'每回合开始获得4点格挡与3金币', word:'整备：攻防经济三合一，适合起手铺'},
  setup_march: {name:'整备·军势', cat:'整备', kind:'setup', cost:2, minCost:1, fx:{dmg:6,block:5}, desc:'每回合开始造成6点伤害并获得5点格挡', word:'整备：每回合开始时发动（仅本场战斗）'},

  // —— 登场（能力牌·打出立即触发，并登记起来可重复Combo） ——
  entry_flame:{name:'登场·烈焰', cat:'登场', kind:'entry', cost:1, minCost:1, fx:{dmg:12},   desc:'造成12点伤害',   word:'登场：立即发动并登记；之后每次打出登场牌都会重放全部已登记效果。本场第一张登场牌额外发动一次（初登场）'},
  entry_heal: {name:'登场·回春', cat:'登场', kind:'entry', cost:1, minCost:1, fx:{heal:10},  desc:'恢复10点生命',   word:'登场：立即发动并登记；之后每次打出登场牌都会重放全部已登记效果。本场第一张登场牌额外发动一次（初登场）'},
  entry_bolt: {name:'登场·雷光', cat:'登场', kind:'entry', cost:2, minCost:1, fx:{dmg:13,draw:1}, desc:'造成13点伤害并抽1张牌', word:'登场：立即发动并登记；之后每次打出登场牌都会重放全部已登记效果。本场第一张登场牌额外发动一次（初登场）'},
  entry_alch: {name:'登场·炼金', cat:'登场', kind:'entry', cost:1, minCost:1, fx:{gold:18},  desc:'获得18金币',     word:'登场：立即发动并登记；之后每次打出登场牌都会重放全部已登记效果。本场第一张登场牌额外发动一次（初登场）'},
  entry_bloom:{name:'登场·毒之绽放', cat:'登场', kind:'entry', cost:1, minCost:1, fx:{dmg:6,poisonTick:1}, desc:'造成6点伤害，并立即结算1次中毒伤害（不消耗层数）', word:'登场：立即发动并登记；之后每次打出登场牌都会重放全部已登记效果。本场第一张登场牌额外发动一次（初登场）'},
  entry_reso:{name:'登场·共鸣', cat:'登场', kind:'entry', cost:1, minCost:1, fx:{randomSetup:2, safeSetup:1}, desc:'随机触发2个你身上的整备效果（不会选到「会触发登场」的整备）', word:'登场：整备联动——立即发动并登记；之后每次打登场牌都会重放。它的随机不会选中「整备·回响」，避免登场↔整备互相吞'},

  // —— 下场（能力牌·立即结算并结束本回合，下回合首牌额外触发一次登场） ——
  down_charge: {name:'下场·蓄力', cat:'下场', kind:'down', cost:1, minCost:1, fx:{dmg:14},   desc:'立即造成14点伤害，并结束本回合',  word:'下场：打出后立即结算，本回合就此结束（手牌弃掉）；你下个回合打出的第一张牌，会额外触发 1 次登场效果（重放已登记登场）'},
  down_fortify:{name:'下场·整军', cat:'下场', kind:'down', cost:1, minCost:1, fx:{block:18}, desc:'立即获得18点格挡，并结束本回合', word:'下场：打出后立即结算，本回合就此结束（手牌弃掉）；你下个回合打出的第一张牌，会额外触发 1 次登场效果（重放已登记登场）'},
  down_raid:   {name:'下场·奇袭', cat:'下场', kind:'down', cost:2, minCost:1, fx:{dmg:30},   desc:'立即造成30点伤害，并结束本回合',  word:'下场：打出后立即结算，本回合就此结束（手牌弃掉）；你下个回合打出的第一张牌，会额外触发 1 次登场效果（重放已登记登场）'},

  // —— 开团：低费低数值，但打出时按「2 张」计入连锁/刷牌天赋 ——
  // scale = 牌数联动：本回合每打出 per 张牌（按连锁计数），列出的效果就成长一次；
  //          cap 是「该类效果的总加成上限」，防止后期无限膨胀
  open_jab:   {name:'开团·突刺', cat:'开团', kind:'open', cost:0, minCost:0, fx:{dmg:4,temp:1},     scale:{dmg:2,per:3,cap:6},   desc:'造成4点伤害，获得1张随机转瞬', word:'开团·牌源：0 费，打完还顺手塞给你一张 0 费转瞬牌——<b>它自己就能把连锁续下去</b>'},
  open_step:  {name:'开团·游走', cat:'开团', kind:'open', cost:0, minCost:0, fx:{dmg:2,block:2},   scale:{dmg:1,block:1,per:3,cap:4}, desc:'造成2点伤害，获得2点格挡', word:'开团：数值低、消耗低，但按 2 张计连锁；越到回合后期越疼'},
  open_cheer: {name:'开团·助威', cat:'开团', kind:'open', cost:0, minCost:0, fx:{block:4,temp:1},   scale:{block:2,per:3,cap:6}, desc:'获得4点格挡，获得1张随机转瞬', word:'开团·牌源：0 费防御牌，但会给一张 0 费转瞬牌——<b>守得住，也续得上链</b>'},
  open_scout: {name:'开团·侦察', cat:'开团', kind:'open', cost:0, minCost:0, fx:{gold:3,draw:1},   scale:{gold:2,per:3,cap:6},  desc:'获得3金币并抽1张牌',          word:'开团：刷牌滚动经济的核心，连锁越深回报越高'},
  open_flare: {name:'开团·信号弹',cat:'开团',kind:'open', cost:1, minCost:0, fx:{dmg:3,draw:1,tempCopy:1}, scale:{dmg:2,per:3,cap:6}, desc:'造成3点伤害，抽1张牌，复制上一张牌（转瞬版）', word:'开团·回响：<b>把上一张牌再打一次</b>——复制体 0 费转瞬，接在它后面的开团牌等于白赚一次连锁'},
  open_toxin: {name:'开团·抹毒', cat:'开团', kind:'open', cost:1, minCost:0, fx:{dmg:2,poison:2},  scale:{poison:2,per:3,cap:6},desc:'造成2点伤害，施加2层中毒',    word:'开团：叠毒速度随本回合牌数成长，毒伤无视敌人的护甲与格挡'},
  open_band:  {name:'开团·包扎', cat:'开团', kind:'open', cost:1, minCost:0, fx:{heal:4,tempCopy:1}, scale:{heal:2,per:4,cap:6}, desc:'恢复4点生命，复制上一张牌（转瞬版）', word:'开团·回响：续航的同时<b>把上一张牌还给你</b>，适合接在主力开团牌之后'},
  open_ward:  {name:'开团·守望', cat:'开团', kind:'open', cost:0, minCost:0, fx:{block:1,draw:1},  scale:{block:2,per:3,cap:6}, desc:'获得1点格挡并抽1张牌',        word:'开团：0 费起手牌，负责把连锁滚起来'},
  open_order: {name:'开团·整队', cat:'开团', kind:'open', cost:1, minCost:0, fx:{draw:2},          desc:'抽2张牌',               word:'开团：补牌手段，保证手牌不断供'},
  open_press: {name:'开团·压迫', cat:'开团', kind:'open', cost:0, minCost:0, fx:{dmg:3,vuln:1},    scale:{dmg:2,per:3,cap:6},   desc:'造成3点伤害，施加1层易伤',    word:'开团：易伤让后面的牌都更疼，适合连锁中段打出'},
  open_rally: {name:'开团·集结', cat:'开团', kind:'open', cost:0, minCost:0, fx:{draw:1,gold:2},   scale:{gold:3,per:3,cap:9},  desc:'抽1张牌，获得2金币',          word:'开团·联动：连锁越深，这张牌给的钱越多——刷牌流的经济引擎'},
  open_unity: {name:'众志成城', cat:'开团', kind:'open', cost:0, minCost:0, fx:{blockPlayed:1}, dynVal:true, desc:'获得的格挡 = 本回合打出的牌数（含本卡）', word:'开团：效果随本回合打出牌数成长，卡面实时显示当前格挡值'},
  open_finale:{name:'开团·收网', cat:'开团', kind:'open', cost:2, minCost:1, fx:{dmg:9},           scale:{dmg:3,per:3,cap:9},   desc:'造成9点伤害',                 word:'开团：连锁打满后的收尾刀'},
  open_break: {name:'开团·破阵', cat:'开团', kind:'open', cost:1, minCost:0, fx:{dmg:8},           scale:{dmg:3,per:3,cap:9},   desc:'造成8点伤害',                 word:'开团：性价比伤害牌，连锁后接近重击'},
  open_combo: {name:'开团·合击', cat:'开团', kind:'open', cost:2, minCost:1, fx:{dmg:14},          scale:{dmg:4,per:4,cap:12},  desc:'造成14点伤害',                word:'开团：主力输出，连锁打满后是全游戏单体最高之一'},
  open_blood: {name:'开团·血怒', cat:'开团', kind:'open', cost:1, minCost:0, fx:{dmg:7,selfDmg:2}, scale:{dmg:3,per:3,cap:9},   desc:'造成7点伤害，自身失去2生命',  word:'开团：伤害高但自损，注意血量'},

  // —— 自残（无专属词条：靠「失去生命」换资源，散落在各体系里，可与其他流派混搭） ——
  blood_strike:{name:'割腕', cat:'攻击', kind:'attack', cost:1, minCost:0, fx:{dmg:14,selfDmg:3}, desc:'造成14点伤害，自身失去3生命', word:'自残：用血换数值，1 费的伤害比「重击」还高，代价是每场战斗都要为它付血'},
  blood_rite:{name:'血祭', cat:'技能', kind:'skill', cost:0, minCost:0, fx:{selfDmgPct:0.06,selfDmgPctMin:4,draw:2,drawIfPaid:1}, desc:'失去生命上限6%的生命（至少4），抽2张牌；本回合已失过血则再抽1张', word:'自残：0 费抽 2，<b>本回合先付过血就再抽 1</b>——不给能量，血是它的费用。原先还要扣 1 点上限，抽起来像在抵押命；现在只流血，不拆血池，自残流终于有稳定的过牌'},
  blood_armor:{name:'血甲', cat:'防御', kind:'defense', cost:1, minCost:0, fx:{selfDmg:2,block:14,maxHp:2}, desc:'自身失去2生命，获得14点格挡，生命上限+2', word:'自残：2 点血换 12 点格挡，比「铁壁」便宜一半。同时抬 2 点生命上限——挨 BOSS 一锤不至于当场去世'},
  blood_pact:{name:'整备·血契', cat:'整备', kind:'setup', cost:1, minCost:0, fx:{selfDmg:2,block:7,strength:1}, desc:'每回合开始失去2生命，获得7点格挡与1点力量', word:'自残·整备引擎：每回合都在扣你自己的血，所以每回合都能触发自残类天赋——血越流，天赋转得越快。<b>它不给生命上限</b>：上限留给主动牌（血甲 / 血肉熔炉 / 血月），否则每场 10 点的配额会被它几回合吃光'},
  blood_moon:{name:'登场·血月', cat:'登场', kind:'entry', cost:1, minCost:1, fx:{selfDmg:4,dmg:16,maxHp:2}, desc:'自身失去4生命，造成16点伤害，生命上限+2', word:'自残·登场：登记后每次重放都会再扣一次血（也就会再触发一次自残天赋）；上限每场只吃得进一次'},
  blood_open:{name:'开团·放血', cat:'开团', kind:'open', cost:0, minCost:0, fx:{selfDmg:2,dmg:4}, scale:{dmg:3,per:3,cap:9}, desc:'自身失去2生命，造成4点伤害', word:'自残·开团：0 费 2 血，连锁越深伤害越高，是自残流的铺场牌'},
  blood_temper:{name:'淬血', cat:'技能', kind:'skill', cost:1, minCost:0, fx:{selfDmg:4,maxHp:5},
    desc:'失去4生命，生命上限+5', word:'自残·堆血池：1 费换 5 点生命上限，是前期把血池拉起来最快的一张。上限涨、血不回——你的血量比例会被主动稀释'},
  blood_forge:{name:'血肉熔炉', cat:'核心', kind:'skill', cost:1, minCost:0, fx:{selfDmgPct:0.06,draw:1,maxHp:4},
    desc:'失去生命上限6%的生命（至少3），生命上限+4，抽1张牌', word:'自残·上限核心：唯一能大幅抬血池的牌。上限涨了但血不回——你要在「血更厚」和「血更稀」之间自己找平衡'},
  blood_pawn:{name:'典当血肉', cat:'技能', kind:'skill', cost:0, minCost:0, burn:true, shopPrice:20, fx:{selfDmg:8,gold:40},
    desc:'失去8点生命，获得40金币。本场战斗用完即焚', word:'自残·经济：拿命换钱，一张牌只在<b>本场战斗</b>生效一次——不然它就成了印钞机。商店里只卖 20 金，买来当一场 40 金的「血息」'},
  blood_debt:{name:'血债血偿', cat:'核心', kind:'attack', cost:2, minCost:1, bloodCut:true,
    fx:{dmg:14,bloodPaid:1,bloodPaidMin:5,bloodPaidCap:25,selfDmgPct:0.06,selfDmgPctMin:3,maxHpCost:2}, desc:'造成14点伤害，并额外造成等于「本回合与上回合你失去的生命」的伤害（至少5，最多25）；随后失去生命上限6%的生命（至少3），生命上限-2', word:'自残·核心牌：<b>这段时间你流了多少血，它就多打多少伤害</b>——本回合的割腕、血祭、中毒，加上<b>上个回合（含敌人回合挨的那一顿）</b>，全都算。所以被打完进回合，第一张血债就是把那一锤原样还回去。<b>上个回合扣过血</b>时费用 -1'},

  // —— 蛊毒（专属词条「蛊术」：打出叠蛊术，蛊术替你吃毒伤；蛊毒牌一律不给格挡） ——
  gu_breed:{name:'蛊·育蛊', cat:'蛊毒', kind:'gu', cost:1, minCost:0, school:'gu', fx:{gu:14},
    desc:'获得14点蛊术（不铺毒）',
    word:'蛊毒·<b>蛊术牌</b>：<b>纯喂池子</b>，一张牌 +14 蛊术（= 能吞 42 点毒伤）。它<b>不给你也不给敌人上毒</b>——蛊毒流真正的续航在这里：先攒池子，才有资格去打那些「毒牌」。蛊术<b>不随回合衰减</b>，但<b>每场战斗清零</b>。<b>1 点蛊术吞 3 点毒伤（只吃伤害、不回血）</b>；挨打是「先扣血、再拿蛊术补回来」（1 点回 2 血，没有上限），回合结束时血没满会自动用蛊术补。<b>生命上限只能从牌里拿</b>（续命 血满时的转化），不会白送。'},
  gu_mite: {name:'蛊·噬骨', cat:'蛊毒', kind:'gu', cost:1, minCost:0, school:'gu', fx:{poison:16,poisonSelf:10,gu:4},
    desc:'敌人+16层中毒、你+10层，获得4点蛊术', word:'蛊毒·<b>毒牌</b>：敌 16 / 你 10，蛊术只给 4 点——<b>刚好够盖住你吃下的这 10 层</b>（4×3=12），一点都不多。也就是说它<b>能让你不受伤，但绝不帮你攒池子</b>；债主是你自己，账会一直挂到战斗结束。'},
  gu_drain:{name:'蛊·抽髓', cat:'蛊毒', kind:'gu', cost:1, minCost:1, school:'gu', fx:{gu:10,draw:2},
    desc:'获得10点蛊术，抽2张牌（不铺毒）',
    word:'蛊毒·<b>蛊术牌 + 过牌</b>：1 费抽 2 还给 10 点蛊术，<b>不往任何人身上放毒</b>。它是「补贴池子 + 找下一张」的高频件，缺它就容易在打毒牌时把池子抽干。'},
  gu_plague:{name:'瘟疫', cat:'蛊毒', kind:'gu', cost:2, minCost:1, school:'gu', shopPrice:70,
    fx:{gu:6,poisonE:28,poisonSelf:18},
    desc:'敌人+28层、你+18层中毒，获得6点蛊术',
    word:'蛊毒·<b>毒牌</b>：<b>敌 28 / 你 18</b>——流派里最大的一张毒，蛊术只给 6 点，刚好盖住你那份（6×3=18）。<b>它把你自己的账单一起翻倍</b>，之后每回合都要为这 18 层付钱（层数只掉 1）。<b>先有池子，再打这张。</b>'},
  gu_doctor:{name:'蛊医', cat:'蛊毒', kind:'gu', cost:0, minCost:0, school:'gu', shopPrice:45,
    fx:{gu:8,poisonCut:4,gold:14},
    desc:'获得8点蛊术，敌人中毒-4层，获得14金币',
    word:'蛊毒·<b>0 费蛊术牌</b>：白拿 8 点蛊术（= 24 点毒伤），顺手把敌人的毒「剪」掉 4 层、再换 14 金。<b>它自己不给你上毒</b>，是低费时最稳的补池手段。<b>升级只加钱、不减毒</b>，避免变成印钞机。'},
  gu_swarm:{name:'蛊·虫潮', cat:'蛊毒', kind:'gu', cost:2, minCost:1, school:'gu', shopPrice:65,
    fx:{gu:5,poisonE:18,poisonSelf:12,draw:1},
    desc:'敌人+18层中毒、你+12层，获得5点蛊术，抽1张牌',
    word:'蛊毒·<b>毒牌</b>：小一号的瘟疫——<b>敌 18 / 你 12</b>，蛊术 5 点（差一点点盖住，15>12 刚好够），顺带过一张。它负责推进，不负责续航。'},
  gu_shift:{name:'蛊·移毒', cat:'蛊毒', kind:'gu', cost:1, minCost:0, school:'gu', fx:{guShift:1},
    desc:'把你身上一半的中毒转移给敌人，每转移2层获得1点蛊术',
    word:'蛊毒·转化：<b>把自己身上的毒甩给敌人</b>，自毒从代价变成弹药。'},
  gu_mend: {name:'蛊·续命', cat:'蛊毒', kind:'gu', cost:1, minCost:0, school:'gu', fx:{guCost:8,heal:24},
    desc:'消耗至多8点蛊术，每点恢复3生命（最多24）；血量已满时改为提升生命上限',
    word:'蛊毒·续航：<b>蛊术换血，比被动效率高</b>（1 蛊术回 3 血，被动只有 2）。蛊术不足时按比例少回。<b>血满时这口奶不会浪费</b>——每 3 点蛊术化作 +1 生命上限（单次最多 +3，与其它加上限的牌共用每场 +14 配额），专门用来垫厚血条、防一刀秒。'},
  gu_burst:{name:'蛊·爆蛊', cat:'蛊毒', kind:'gu', cost:1, minCost:0, school:'gu', shopPrice:70,
    fx:{guConvert:20},
    desc:'把你「中毒+蛊术」的20%转成敌人中毒，并从你身上扣掉同样层数的毒',
    word:'蛊毒·转化：<b>不再炸空自己</b>——把「自身中毒 + 蛊术」的 20% 搬给敌人，同时从你身上扣掉同样层数的毒。蛊术不清零，所以它既是<b>卸毒</b>，也是往敌人毒池里续柴。升级只涨比例：20% → 30%。'},
  gu_rot:{name:'蛊·溃烂', cat:'蛊毒', kind:'gu', cost:1, minCost:0, school:'gu', shopPrice:65,
    fx:{guRot:50},
    desc:'造成「敌人中毒层数×50%」的伤害（不消耗层数）；若毒层已≥其当前生命，直接斩杀',
    word:'蛊毒·终结：<b>毒不够就砍一半，毒够了直接斩杀</b>。层数不减，所以它既是一次爆发，也是把战线往前推的刀。它不靠蛊术、只看敌人身上的毒——<b>毒越厚，这一刀越狠</b>。'},
  gu_doom:{name:'蛊·催命', cat:'蛊毒', kind:'gu', cost:2, minCost:1, school:'gu', shopPrice:75,
    fx:{guDoom:100,poisonSelf:6},
    desc:'敌人中毒层数+100%、你+6层；若之后毒层≥其当前生命，直接斩杀',
    word:'蛊毒·催化：<b>把敌人身上的毒当场翻倍</b>，翻完还压得住血线，就当场斩杀。它本身<b>不产生伤害</b>，只负责把毒推到斩杀线上——所以它永远跟在「铺毒」的下一手。'},
  gu_altar:{name:'蛊·祭坛', cat:'蛊毒', kind:'setup', cost:1, minCost:0, school:'gu', fx:{gu:2,poisonE:7,poisonSelf:5},
    desc:'每回合开始：敌人+7层、你+5层中毒，获得2点蛊术',
    word:'蛊毒·<b>毒引擎（整备）</b>：每回合 敌 7 毒 / 你 5 毒，蛊术 2 点——<b>刚好盖住你吃下的 5 层</b>（2×3=6）。它每回合都往两边下毒，但只会给你刚好够用的蛊术：<b>毒在涨，池子不涨</b>。'},

  // —— 核心牌：整备·随机获取与引爆（万事俱备 / 只欠东风 / 临阵磨枪）——
  all_ready:{name:'万事俱备', cat:'核心', kind:'setup', cost:2, minCost:1, shopPrice:70, setupEvery:3,
    fx:{block:3},
    desc:'每回合开始获得3点格挡；此后每触发3次整备效果，获得1张随机整备牌（0费转瞬，每回合最多2张）',
    word:'整备·核心牌：<b>把「整备触发」变成牌源</b>——每 3 次触发就从<b>全牌库</b>随机捞 1 张整备牌（0 费转瞬，每回合最多 2 张）。铺得越密、引爆得越频繁，白嫖的整备越多。<br>和【只欠东风】成套：先用它把手牌刷厚，再用东风一次性引爆；碎掉的整备很快又能补回来。'},
  east_wind:{name:'只欠东风', cat:'核心', kind:'skill', cost:2, minCost:1, shopPrice:75, cond:{needSetup:1},
    fx:{fireAll:1, removePer:4},
    desc:'引爆你身上全部整备效果；每引爆4个，随机失去1个整备（需身上至少1个整备）',
    word:'整备·核心牌：<b>一次性把所有整备兑现</b>——身上挂 N 个，就当场触发 N 次（整备·回响的登场链也会跟着跑）。代价是每引爆 4 个随机碎掉 1 个，可能碎到关键牌；配【万事俱备】能补、【整备·拆解】能把碎掉的换成格挡与金币。身上不足 4 个时没有损耗。'},
  last_minute:{name:'临阵磨枪', cat:'核心', kind:'skill', cost:1, minCost:0, shopPrice:55,
    cond:{intentHarm:1, needSetup:1},
    fx:{randomSetup:3, removeSetup:1},
    desc:'只能在敌人本回合准备造成伤害、且你身上有整备时打出：随机触发3个整备效果，然后随机失去1个整备',
    word:'整备·核心牌：<b>敌人亮刀才准用</b>（攻击 / 连击 / 蓄力意图）。1 费换 3 次整备爆发，代价是随机碎 1 个——敌人在防守、加 buff、铺毒时它打不出去，是一张「读意图」的牌。'},

  // —— 核心牌：费用与效果随本回合节奏变化（X 会实时显示在卡面） ——
  spring: {name:'春秋蝉鸣', cat:'核心', kind:'open', cost:0, minCost:0, dynCost:true, fx:{spring:1},
    desc:'消耗 X 能量（X = 距上次蝉鸣之后打出的转瞬牌 + 真正开团牌数量，余韵牌不算）；把本回合打出的前 X+1 张牌拿回手上并变为转瞬。打出后 X 归零、重新累积',
    word:'核心：<b>可以反复打</b>——每次打完 X 清零，下一张蝉鸣从 0 重新累积（0 费时召回 1 张）；而且它打完会<b>回到抽牌堆顶</b>，开团流抽牌多，一回合能抽回来再打一次。X 只数<b>转瞬牌和真正的开团牌</b>，靠余韵蹭成开团牌的普通牌不算，所以「余韵 → 蝉鸣 → 余韵」不会把 X 白送上去'},

  // —— 天赋专属：不在商店/战利品出现，只能由天赋「临危受命」在低血量时发放（转瞬牌） ——
  last_stand:{name:'临危受命', cat:'天命', kind:'skill', cost:0, minCost:0, fx:{heal:14,block:12,energy:1,draw:2},
    desc:'恢复14生命，获得12点格挡、1点能量，并抽2张牌',
    word:'天赋【临危受命】在你血量低于 30% 时塞进手里的转瞬牌：0 费，回血/格挡/能量/抽牌一次做完'},
};

// 全部整备牌 id（「万事俱备 / 深度学习」从全牌库随机捞，不看玩家主牌库）
const SETUP_POOL = Object.keys(POOL).filter(id=>POOL[id].kind==='setup');

// 商店/战利品候选（不含初始基础牌）
const SHOP_POOL = ['ironwave','anger','heavy','bash','poison','venom_trap','vamp','venomb','burst','sacrifice',
                   'ironwall','barricade','reposte','tactic','insight','extract','herb','goldhand','goldpan','powcard','brute','spark',
                   'setup_bomb','setup_guard','setup_regen','setup_venom','setup_energy','setup_tactic','setup_echo','setup_weak','setup_pillage',
                   'setup_bulwark','setup_aegis','setup_march','panic','call','slam',
                   'all_ready','east_wind','last_minute',
                   'blood_strike','blood_rite','blood_armor','blood_pact','blood_moon','blood_open','blood_temper','blood_forge','blood_pawn','blood_debt',
                   'gu_breed','gu_mite','gu_drain','gu_plague','gu_doctor','gu_swarm','gu_shift','gu_mend','gu_altar','gu_burst','gu_rot','gu_doom',
                   'entry_flame','entry_heal','entry_bolt','entry_alch','entry_bloom','entry_reso',
                   'down_charge','down_fortify','down_raid',
                   'open_jab','open_step','open_cheer','open_scout','open_flare','open_toxin','open_band','open_finale',
                   'open_ward','open_order','open_press','open_unity','open_break','open_combo','open_blood','open_rally','spring'];

// ================= 天赋 =================
// ================= 天赋 =================
const TALENTS = {
  // 基础
  setupPower:{name:'整备之力', price:60, desc:'回合开始时，恢复你身上「整备」效果个数的生命'},
  sharp:     {name:'锋锐',     price:70, desc:'每场战斗开始时，永久获得2点力量'},
  guardT:    {name:'守势',     price:55, desc:'每场战斗开始时获得8点格挡'},
  greedy:    {name:'贪婪',     price:50, desc:'每次战斗胜利额外获得12金币'},
  scholar:   {name:'博学者',   price:80, desc:'每回合多抽1张牌'},
  tough:     {name:'强韧',     price:60, desc:'生命上限+10，并立即回复10生命'},
  // 与词条联动
  entryPower:{name:'登场之力', price:85, desc:'登场联动：每第3回合，随机获得1张临时登场牌（仅本场可用，下场重新随机）'},
  fleeting:  {name:'灵感迸发', price:75, desc:'临时牌：每回合开始随机获得1张临时牌（0费转瞬，回合结束未打出则消失）'},
  venomT:    {name:'毒师',     price:70, desc:'中毒联动：战斗开始时给敌人5层中毒；你施加的中毒层数额外+2'},
  bloomT:    {name:'毒之绽放', price:80, desc:'中毒联动：每次触发登场效果时，立即结算1次敌人中毒伤害（不消耗层数）'},
  snareT:    {name:'毒药陷阱', price:75, desc:'中毒联动：你的「整备」效果额外给敌人施加2层中毒'},

  // —— 登场系（围绕「登记 + 重放」做强化）——
  showTalent:{name:'登场·票房', price:70, desc:'登场联动：每登记 1 个登场效果，立即获得 10 金币（补登场流的经济）'},
  entryGuard:{name:'登场·护势', price:75, desc:'登场联动：每次触发登场效果，获得 2 点格挡（每回合最多 4 次）'},
  entryDraw: {name:'登场·气韵', price:80, desc:'登场联动：每回合第 1 次触发登场效果时，抽 1 张牌'},
  entryMight:{name:'登场·威压', price:90, desc:'登场联动：你每打出 1 张登场牌，本场永久 +1 力量'},
  entryGold: {name:'登场·掠财', price:70, desc:'登场联动：每次触发登场效果获得 3 金币（每回合最多 3 次）'},

  // —— 整备系（围绕「常驻能力牌」做强化）——
  setupArmor:{name:'整备·常备', price:60, desc:'整备联动：每回合开始时，按你身上的整备数量获得等量格挡'},
  setupEcho: {name:'整备·回响', price:65, desc:'整备联动：你<b>打出的第 1 个整备</b>每回合额外触发 1 次（随机获得的整备排在后面，抢不到加成）；它被顶替/移除后，加成按<b>打出先后顺延</b>给下一个还活着的整备'},
  setupVigor:{name:'整备·精研', price:60, desc:'整备联动：回合开始时若你有 2 个以上整备，额外抽 1 张牌'},
  setupFree: {name:'整备·预置', price:65, desc:'整备联动：每场战斗开始时，免费随机布置 1 个整备效果（不消耗能量）'},
  setupFund: {name:'整备·津贴', price:60, desc:'整备联动·经济：每回合开始时，按你身上的整备数量获得金币（每个 5 金）'},
  setupLevy: {name:'整备·征粮', price:65, desc:'整备联动·经济：你每布置 1 张整备牌（打出时），立即获得 10 金币'},
  setupAegis:{name:'整备·铁壁', price:65, desc:'整备联动：每次触发整备效果，额外获得 2 点格挡（每回合最多 8 次）'},
  setupMight:{name:'整备·军威', price:70, desc:'整备联动·战力：你每布置 1 个整备效果，本场永久 +1 力量'},
  setupDraft:{name:'整备·扩编', price:70, desc:'整备联动·战力：每回合开始时，从你的牌组额外抽 1 张整备牌到手上'},
  setupCycle:{name:'整备·轮回', price:70, desc:'整备联动·牌源：每累计触发 6 次整备效果，抽 1 张牌（本场累计，跨回合不清零）'},
  setupLink: {name:'整备·连动', price:85, desc:'整备联动·爆发：每次触发整备效果，有 25% 概率额外触发另一个整备（每回合最多 3 次）'},
  setupSalvage:{name:'整备·拆解', price:65, desc:'整备联动·残值：每当一个整备被移除（只欠东风 / 临阵磨枪的损耗），获得 8 点格挡与 5 金币'},
  deepLearn: {name:'深度学习', price:80, desc:'整备联动·牌源：同一种整备效果累计触发 5 次后，获得 1 张该整备牌（0 费转瞬，每种每场限 1 次）'},
  // 刷牌连锁
  rushT:     {name:'连锁打击', price:70, desc:'连锁：每回合每打出3张牌，对敌人造成4点伤害'},
  weakenT:   {name:'连锁削弱', price:65, desc:'连锁：每回合每打出3张牌，给敌人施加1层易伤'},
  surgeT:    {name:'连锁蓄能', price:95, desc:'连锁：每回合每打出6张牌，获得1点能量'},
  openEcon:  {name:'开团补给', price:80, desc:'开团联动：连锁计数每累计 4，获得 10 金币；另外每打出 1 张开团牌额外获得 2 金币'},
  // —— 开团 × 转瞬（新联动轴：转瞬牌既是弹药，也是余韵的燃料）——
  tempOpen:  {name:'转瞬·余韵', price:70, desc:'转瞬联动：每打出 2 张转瞬牌，立即获得「开团余韵」（每回合最多 3 次）——转瞬牌自己就能把开团链接起来'},
  tempDraw:  {name:'转瞬·流转', price:75, desc:'转瞬联动·牌源：每打出 3 张转瞬牌，抽 1 张牌（每回合最多 2 次）'},
  tempGold:  {name:'转瞬·拾遗', price:60, desc:'转瞬联动·经济：每打出 1 张转瞬牌，获得 3 金币（每回合最多 4 次，共 12）'},
  tempWard:  {name:'转瞬·护幕', price:65, desc:'转瞬联动·防御：每打出 1 张转瞬牌，获得 4 点格挡（每回合最多 4 次）——开团流最缺的防线'},
  openEcho:  {name:'开团·回响', price:75, desc:'开团联动·牌源：每打出 3 张真正的开团牌，获得 1 张随机转瞬牌（每回合最多 2 张）'},
  springEcho:{name:'蝉鸣·余响', price:85, desc:'春秋蝉鸣联动：每次蝉鸣额外召回 1 张（X+2）；X 依然在每次打出后清零重算'},

  // —— 通用天赋（不依赖特定体系，任何牌组都能吃到）——
  firstEntry:{name:'首发登场', price:85, desc:'通用：每场战斗你打出的第一张牌，额外视为一张登场牌（触发登录与重放）'},
  firstOpen: {name:'首发开团', price:80, desc:'通用：每场战斗你打出的第一张牌，额外视为一张开团牌（按2张计数，并挂上开团余韵）'},
  regen:     {name:'战后休整', price:65, desc:'通用：每场战斗胜利后额外恢复 8 点生命'},
  openingDraw:{name:'先手',    price:70, desc:'通用：每场战斗的第 1 回合额外抽 2 张牌'},
  sturdy:    {name:'坚韧',     price:70, desc:'通用：每回合开始时获得 2 点格挡'},
  firstStrike:{name:'首击',    price:60, desc:'通用：每场战斗打出的第一张攻击牌，额外造成 8 点伤害'},
  lucky:     {name:'幸运',     price:75, desc:'通用：战利品从三选一变成四选一'},
  openingEnergy:{name:'起势',  price:65, desc:'通用：每场战斗的第 1 回合额外获得 1 点能量'},

  // —— 自残系（围绕「你自己失去生命」做文章：没有专属词条，任何带自损的牌都能吃到） ——
  bloodRes:  {name:'血之回响', price:70, desc:'自残联动：每次你失去生命，恢复<b>已损失生命 15%</b> 的生命（至少 1，每回合 4 次）——越残，回得越多'},
  bloodBurst:{name:'血怒',     price:80, desc:'自残联动：每次你失去生命，对敌人造成<b>已损失生命 10%</b> 的伤害（至少 2）——自己流血，敌人掉肉'},
  bloodMight:{name:'血勇',     price:75, desc:'自残联动：每次你失去生命，本场永久 +1 力量（每回合最多 3 次）'},
  bloodWard: {name:'血盾',     price:65, desc:'自残联动：每次你失去生命，获得 3 点格挡（每回合最多 6 次）'},
  bloodGold: {name:'血金',     price:55, desc:'自残联动·经济：每次你失去生命，获得 5 金币（每回合最多 3 次，共 15）——挨打、自损、中毒都算'},
  bloodFlow: {name:'血行',     price:85, desc:'自残联动：每次你失去生命，获得 1 点能量（每回合最多 2 次）'},
  bloodFeast:{name:'嗜血',     price:60, desc:'自残联动·续航：每场战斗胜利后，按本场失血量的 40% 回血（至少 3、最多 20）——带一两张自损牌就能用'},
  // —— 蛊毒系（围绕「蛊术」：拿蛊术吞自己的毒，再把毒甩给敌人） ——
  guT:    {name:'蛊术精进', price:60, desc:'蛊毒联动：每打出 1 张蛊毒牌，额外获得 1 点蛊术'},
  guSym:  {name:'蛊毒·共生', price:65, desc:'蛊毒联动：每回合开始时，若你身上有中毒，获得 4 点蛊术——毒越久，它越能养你'},
  guBack: {name:'蛊毒·反噬', price:75, desc:'蛊毒联动：蛊术每替你吞下 4 点毒伤，就对敌人造成 1 点伤害（无视格挡与护甲）'},
  guHeal: {name:'蛊毒·回生', price:70, desc:'蛊毒联动·续航：蛊术吞毒时，恢复吸收量 50% 的生命（每回合最多 12 点）'},
  guBond: {name:'蛊毒·同归', price:85, desc:'蛊毒联动·引擎：每当你获得蛊术，敌人也获得「获得量六成」层数的中毒'},
  guOpen: {name:'蛊毒·引子', price:60, desc:'蛊毒联动：每场战斗开始时，获得 12 点蛊术并给敌人 6 层中毒'},
  guCurse:{name:'病入膏肓', price:100, desc:'蛊毒联动·斩杀：<b>敌人身上的毒不再造成伤害</b>，只当倒计时；<b>你每次对敌人施加中毒额外 +50%（再叠 +2 层）</b>；<b>每次中毒结算完之后</b>，敌我双方的毒全<b>翻倍</b>、你的蛊术也<b>翻倍</b>，敌人再按「你的蛊术×50%」<b>永久提高生命上限</b>；<b>毒层 ≥ 敌人生命上限 70% 时直接斩杀</b>'},
  guErode:{name:'蛊毒·蚀心', price:70, desc:'蛊毒联动·催化：每回合开始时，敌人获得 7 层中毒（受「施加中毒 +2」加成）——把毒一路推向斩杀线'},
  guFeast:{name:'蛊毒·垂涎', price:65, desc:'蛊毒联动·循环：敌人中毒 ≥ 25 层时，每回合开始时抽 1 张牌并获得 4 点蛊术'},
  lastStand: {name:'临危受命', price:90, desc:'自残联动·保命：血量低于 30% 时，获得 1 张转瞬牌【临危受命】（回血＋格挡＋能量＋抽牌）。<b>但若它已经触发过，且你的血量跌到 15% 以下，这个天赋会破碎</b>——力量太薄，得去商店重新买回来（买回后触发计数清零）'},
};

// ================= 状态 =================
let G;
const hasTalent = id => G.player.talents.includes(id);

// ================= 开局：组建初始牌组 + 自选一个天赋 =================
const BASE_DECK = ['strike','strike','strike','defend','defend'];   // 固定部分，不可选
const PICK_COUNT = 4;
// 开局天赋池：开团 / 登场 / 整备 / 通用 全都在，只有「毒之绽放」这种雪球过强的不发
const START_TALENTS = ['openEcon','rushT','weakenT','surgeT','tempOpen','tempDraw','tempGold','tempWard','openEcho','guardT','greedy','tough','sharp','scholar','setupPower','venomT','snareT','fleeting',
                       'firstEntry','firstOpen','regen','openingDraw','sturdy','firstStrike','lucky','openingEnergy',
                       'entryPower','entryGuard','entryDraw','entryMight','entryGold','showTalent',
                       'setupArmor','setupEcho','setupVigor','setupFree',
                       'bloodRes','bloodBurst','bloodMight','bloodWard','bloodFeast','lastStand'];
// 开局必给：开团系 1 个候选（含新增的转瞬联动天赋）
const START_OPEN_TALENTS = ['openEcon','rushT','weakenT','surgeT','tempOpen','tempDraw','tempGold','tempWard','openEcho','springEcho'];
// 开局必给：登场系 2 个候选 + 整备系 2 个候选（用户点名要求），保证每一局都能走这两条路
const START_ENTRY_TALENTS = ['entryPower','showTalent','entryGuard','entryDraw','entryMight','entryGold'];
const START_SETUP_TALENTS = ['setupArmor','setupEcho','setupVigor','setupFree','setupPower','setupFund','setupLevy','setupAegis','setupMight','setupDraft','setupCycle','setupLink','deepLearn'];
// 开局必给：自残系 1 个候选（用户要求：自残流作为进阶路线，开局就能看见）
const START_BLOOD_TALENTS = ['bloodRes','bloodBurst','bloodMight','bloodWard','bloodGold','lastStand','bloodGold'];
// ================= 五流派（单机版 v4.2 迁移） =================
// —— 开局天赋池：按「流派」分组。爱好流派会把更多席位分给它 ——
// 只有「毒之绽放 / 血行 / 蝉鸣·余响」这类需要特定牌才成立、或雪球过强的天赋不发在开局池
const SCHOOLS = {
  open: {name:'开团系', color:'#8be07a',
    pool:['openEcon','rushT','weakenT','surgeT','tempOpen','tempDraw','tempGold','tempWard','openEcho']},
  entry:{name:'登场系', color:'#ff9d5c',
    pool:['entryPower','showTalent','entryGuard','entryDraw','entryMight','entryGold']},
  setup:{name:'整备系', color:'#7ac8ff',
    pool:['setupPower','setupArmor','setupEcho','setupVigor','setupFree','setupFund','setupLevy',
          'setupAegis','setupMight','setupDraft','setupCycle','setupLink','deepLearn']},
  blood:{name:'自残系', color:'#ff7a8a',
    pool:['bloodRes','bloodBurst','bloodMight','bloodWard','bloodGold','bloodFeast','lastStand']},
  gu:  {name:'蛊毒系', color:'#c79bff',
    // 病入膏肓（guCurse）刻意不发开局：它把整场战斗变成一场指数赛跑（毒×2、蛊术×2、敌人上限跟着涨），起手就有等于白送胜利条件。
    // 只能商店买（100 金），和「毒之绽放 / 血行 / 蝉鸣·余响」同一条规矩。
    pool:['guT','guSym','guBack','guHeal','guBond','guOpen','guErode','guFeast']},
};
const SCHOOL_KEYS = ['open','entry','setup','blood','gu'];
const START_PICK_N = 7;              // 开局候选天赋数量（7 选 1）：每个未禁用的系保底 1 + 剩余灵活席位
const PREF_SEATS = 3;                // 指定爱好流派时，该流派拿 3 席（5 系 → 3+1+1+1+1 正好 7）
// 通用天赋（不属于任何流派）：只在某个流派抽空、需要补位时才会出现
const START_OTHER_TALENTS = ['guardT','greedy','tough','sharp','scholar','venomT','snareT','fleeting',
                             'firstEntry','firstOpen','regen','openingDraw','sturdy','firstStrike','lucky','openingEnergy'];
// 开局天赋池：由五流派聚合（保留下方 START_*_TALENTS 作为旧接口兼容）
const SCHOOL_START_TALENTS = [...SCHOOL_KEYS.reduce((a,k)=>a.concat(SCHOOLS[k].pool),[]), ...START_OTHER_TALENTS];
// 纯函数：卡牌归属流派 / 未被禁用的流派（不依赖任何全局状态，服务端可直接调用）
function cardSchools(id){
  const c=POOL[id]; if(!c) return [];
  if(c.school) return [c.school];
  const out=[];
  if(c.kind==='open'||c.kind==='entry'||c.kind==='setup') out.push(c.kind);
  if((c.fx&&(c.fx.selfDmg||c.fx.selfDmgPct))||c.bloodCut){ if(!out.includes('blood')) out.push('blood'); }
  return out;
}
function activeSchools(ban){ return SCHOOL_KEYS.filter(k=>k!==ban); }
function cardBlocked(id,ban){ return !!ban && cardSchools(id).includes(ban); }
// 天赋 → 它联动哪一类牌（开局选牌时用来加权）
const TALENT_TAGS = {
  openEcon:'open', firstOpen:'open', rushT:'open', weakenT:'open', surgeT:'open',
  tempOpen:'open', tempDraw:'open', tempGold:'open', tempWard:'open', openEcho:'open', springEcho:'open',
  entryPower:'entry', firstEntry:'entry',
  showTalent:'entry', entryGuard:'entry', entryDraw:'entry', entryMight:'entry', entryGold:'entry',
  venomT:'poison', bloomT:'poison', snareT:'poison',
  setupPower:'setup', setupArmor:'setup', setupEcho:'setup', setupVigor:'setup', setupFree:'setup',
  setupFund:'setup', setupLevy:'setup', setupAegis:'setup', setupMight:'setup', setupDraft:'setup',
  setupCycle:'setup', setupLink:'setup', setupSalvage:'setup', deepLearn:'setup',
  sturdy:'defense', regen:'skill', scholar:'skill',
  bloodRes:'blood', bloodBurst:'blood', bloodMight:'blood', bloodWard:'blood',
  bloodGold:'blood', bloodFlow:'blood', bloodFeast:'blood', lastStand:'blood',
  guT:'gu', guSym:'gu', guBack:'gu', guHeal:'gu', guBond:'gu', guOpen:'gu',
  guCurse:'gu', guErode:'gu', guFeast:'gu',
};

// ================= 敌人与 BOSS =================
// ================= 敌人与 BOSS 机制 =================
// 设计原则：小怪只负责「爽感」，数值刻意压低；BOSS 主要靠「机制」制造压力，而不是堆血堆攻
const AV=['👾','👹','🦂','🐲','💀','🕷️','🐺','🦅','👻','😈','🧟','🦎','🐉','🦑','👺'];
// BOSS 专属形象（内联 SVG：无外链、无额外请求）
const BOSS_ART={
  ironclad:'<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">'+
    '<path d="M32 6l19 7.6v16.4c0 12.4-8 21-19 25.8-11-4.8-19-13.4-19-25.8V13.6z" fill="#232c3b" stroke="#93aac6" stroke-width="1.5" stroke-linejoin="round"/>'+
    '<path d="M32 6l19 7.6v16.4c0 12.4-8 21-19 25.8z" fill="#1a222e"/>'+
    '<path d="M13.8 26.8h36.4" stroke="#93aac6" stroke-width="1" opacity=".3"/>'+
    '<rect x="19.4" y="29.6" width="9.6" height="4.4" rx="2.2" fill="#a9dbff"/>'+
    '<rect x="35" y="29.6" width="9.6" height="4.4" rx="2.2" fill="#a9dbff"/>'+
    '<path d="M26.5 43.5h11" stroke="#0c1119" stroke-width="2.2" stroke-linecap="round"/>'+
    '<path d="M32 11.8v8" stroke="#0c1119" stroke-width="2.4" stroke-linecap="round"/>'+
    '<path d="M21 17.5l-1.6 5M43 17.5l1.6 5" stroke="#93aac6" stroke-width="1.2" stroke-linecap="round" opacity=".55"/>'+
    '</svg>',
  plague:'<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">'+
    '<path d="M10 33c0-11 9.8-18 22-18s22 7 22 18c0 3-4 4.6-10.5 4.6h-23C14 37.6 10 36 10 33z" fill="#243026" stroke="#7cb271" stroke-width="1.4" stroke-linejoin="round"/>'+
    '<path d="M23.5 37.6h17l-2.4 15.2c-.3 1.7-1.6 2.6-3.4 2.6h-5.4c-1.8 0-3.1-.9-3.4-2.6z" fill="#1a251f" stroke="#7cb271" stroke-width="1.2" stroke-linejoin="round"/>'+
    '<ellipse cx="24.6" cy="30" rx="3.5" ry="2.9" fill="#0b120e"/>'+
    '<ellipse cx="39.4" cy="30" rx="3.5" ry="2.9" fill="#0b120e"/>'+
    '<path d="M14 34.6h36" stroke="#7cb271" stroke-width="1" opacity=".22"/>'+
    '<circle cx="19.5" cy="16" r="1.9" fill="#8be07a" opacity=".5"/>'+
    '<circle cx="33" cy="10.8" r="1.4" fill="#8be07a" opacity=".36"/>'+
    '<circle cx="45.5" cy="16.6" r="1.7" fill="#8be07a" opacity=".44"/>'+
    '<path d="M28 43v9M36.5 43v9" stroke="#7cb271" stroke-width="1" opacity=".28"/>'+
    '</svg>',
  commander:'<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">'+
    '<circle cx="32" cy="30" r="22.5" fill="none" stroke="#ffb454" stroke-width="1" opacity=".24" stroke-dasharray="3 5.5"/>'+
    '<path d="M16 26.5l3.2-13.5 7 6.4L32 9l5.8 10.4 7-6.4L48 26.5z" fill="#33261a" stroke="#ffb454" stroke-width="1.3" stroke-linejoin="round"/>'+
    '<path d="M19 26.5h26v13.8C45 48.6 39.3 55 32 55s-13-6.4-13-14.7z" fill="#221f2b" stroke="#d59a67" stroke-width="1.3" stroke-linejoin="round"/>'+
    '<rect x="22.6" y="32.8" width="18.8" height="3.8" rx="1.9" fill="#ffcf8a"/>'+
    '<path d="M32 46.5v5.4" stroke="#d59a67" stroke-width="1.3" stroke-linecap="round"/>'+
    '<circle cx="32" cy="23.6" r="1.5" fill="#ffb454" opacity=".8"/>'+
    '</svg>',
  ram:'<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">'+
    '<path d="M8 38h48l-7 15H15z" fill="#2a2118" stroke="#ff8c5a" stroke-width="1.4" stroke-linejoin="round"/>'+
    '<path d="M19 38V26c0-6.5 5.6-11 13-11s13 4.5 13 11v12" fill="#241d16" stroke="#ff8c5a" stroke-width="1.4" stroke-linejoin="round"/>'+
    '<path d="M8 30h9l-9 12z" fill="#ff8c5a" opacity=".6"/>'+
    '<path d="M19 26l-6-7 9 2zM45 26l6-7-9 2z" fill="#ffb27a" opacity=".85"/>'+
    '<circle cx="26" cy="28" r="2.6" fill="#ffd0a8"/><circle cx="38" cy="28" r="2.6" fill="#ffd0a8"/>'+
    '<path d="M27 34h10" stroke="#ff8c5a" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>'+
    '<path d="M18 53v6M46 53v6" stroke="#ff8c5a" stroke-width="2.2" stroke-linecap="round"/>'+
    '</svg>',
  combo:'<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">'+
    '<circle cx="32" cy="32" r="21" fill="none" stroke="#c4a0ff" stroke-width="1" opacity=".22" stroke-dasharray="3 5"/>'+
    '<path d="M17 53L45 13" stroke="#c4a0ff" stroke-width="3" stroke-linecap="round"/>'+
    '<path d="M47 53L19 13" stroke="#7f5fd0" stroke-width="3" stroke-linecap="round"/>'+
    '<path d="M45 13l6-2-2 6z" fill="#e6d8ff"/>'+
    '<circle cx="32" cy="32" r="4.6" fill="#2a2340" stroke="#c4a0ff" stroke-width="1.3"/>'+
    '<path d="M12 44l6-2M52 44l-6-2" stroke="#c4a0ff" stroke-width="1.2" opacity=".5"/>'+
    '</svg>',
  titan:'<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">'+
    '<path d="M18 16h28v22c0 4-3 7-7 7H25c-4 0-7-3-7-7z" fill="#2a2620" stroke="#dcc078" stroke-width="1.4" stroke-linejoin="round"/>'+
    '<circle cx="26" cy="26" r="2.8" fill="#ffd98a"/><circle cx="38" cy="26" r="2.8" fill="#ffd98a"/>'+
    '<path d="M26 35h12" stroke="#dcc078" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>'+
    '<path d="M12 30l6-4v22h-6zM46 26l6 4v18h-6z" fill="#232019" stroke="#dcc078" stroke-width="1.2" stroke-linejoin="round"/>'+
    '<path d="M22 45h20v13H22z" fill="#232019" stroke="#dcc078" stroke-width="1.2"/>'+
    '<path d="M22 52h20M32 45v13" stroke="#dcc078" stroke-width="1" opacity=".25"/>'+
    '</svg>',
  breaker:'<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">'+
    '<path d="M20 9h24v20c0 11-7 17-12 21-5-4-12-10-12-21z" fill="#1f2733" stroke="#78c8ff" stroke-width="1.5" stroke-linejoin="round"/>'+
    '<path d="M32 11v34" stroke="#0b0f15" stroke-width="2.4"/>'+
    '<path d="M32 20l-5 6 5 3-4 6" stroke="#0b0f15" stroke-width="1.6" fill="none" stroke-linejoin="round"/>'+
    '<path d="M44 46l10 8-7 6-9-9z" fill="#2a2118" stroke="#78c8ff" stroke-width="1.3" stroke-linejoin="round"/>'+
    '<circle cx="26" cy="22" r="2" fill="#a9dbff"/><circle cx="38" cy="22" r="2" fill="#a9dbff"/>'+
    '</svg>',
  devourer:'<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">'+
    '<ellipse cx="32" cy="34" rx="11" ry="13" fill="#241a2e" stroke="#aa78dc" stroke-width="1.4"/>'+
    '<circle cx="32" cy="17" r="7" fill="#2a1f36" stroke="#aa78dc" stroke-width="1.3"/>'+
    '<circle cx="29" cy="16" r="1.9" fill="#d9b8ff"/><circle cx="35" cy="16" r="1.9" fill="#d9b8ff"/>'+
    '<path d="M25 24L10 12M39 24l15-12M24 32H7M40 32h17M25 41L12 51M39 41l13 10" stroke="#aa78dc" stroke-width="1.5" stroke-linecap="round"/>'+
    '<path d="M32 30l3 4-3 4-3-4z" fill="#d9b8ff" opacity=".6"/>'+
    '</svg>'
};
function portraitHTML(e){ return (e && e.isBoss) ? (BOSS_ART[e.key]||e.avatar) : (e?e.avatar:'👾'); }
const BOSS_DEFS={
  // ── 第 5 层：入门 BOSS ──
  ironclad:{key:'ironclad', tier:5, name:'铁壁巨像', avatar:'🗿', hp:150, attack:12, armor:2,
     mech:[['🛡 铁壁', '你每次对它的击中，最终伤害都会<b>减少 2 点</b>（最低仍造成 1 点）。小伤害会被刮得很惨，大伤害、毒结算才是解法。'],
           ['🔨 蓄力重锤', '会先<b>蓄力 1 回合</b>（该回合没有任何动作，给你喘息），下一击打出约 <b>2.2 倍</b>的巨额伤害。'],
           ['🧱 加固', '偶尔给自己加格挡，让你本来就低的单次伤害更难受。'],
           ['🩸 撞击', '它的攻击会额外按你<b>当前生命上限</b>追加伤害：普攻 <b>6%</b>、蓄力重锤 <b>8%</b>。血池堆得越厚，这一下越疼——上限是保险，不是免死金牌。']],
     tip:'把攒不住的小牌用来防守，把大招留给它。看到「⏳ 蓄力中」就赶紧铺格挡。'},
  ram:{key:'ram', tier:5, name:'攻城兽', avatar:'🦏', hp:165, attack:11, armor:0,
     mech:[['🩸 撞击（核心）', '它<b>每一次攻击都带撞击</b>：普攻额外按你<b>生命上限的 8%</b>、野蛮冲撞额外 <b>15%</b>。这是它的<b>固定特色</b>——没有任何一回合是「安全挨打」。'],
           ['🐗 野蛮冲撞', '每 3 回合蓄力 1 回合，然后打出 <b>1.6 倍</b>攻击 + 15% 上限的撞击。面板会提前显示总伤害。'],
           ['🪨 蛮力', '没有护甲、不会防御：它只会一路撞过来。<b>血量比巨像略高</b>，但你能用纯输出把它跑赢。']],
     tip:'它没有护甲，是纯粹的伤害赛跑：堆上限会被撞得更疼，所以别指望靠血池硬吃。看到冲撞倒计时就把格挡铺满。'},
  // ── 第 10 层：机制 BOSS ──
  plague:{key:'plague', tier:10, name:'瘟疫毒沼', avatar:'🦠', hp:230, attack:14, armor:0,
     mech:[['☠ 毒气蔓延', '每回合给你叠 <b>4 层中毒</b>（<b>无视格挡</b>，回合开始直接扣血）。它只在你中毒层数 <b>低于 10</b> 时才继续铺毒——毒到 10 层后它就改去攻击，而那是可以被格挡的。'],
           ['🍄 共生菌毯（能力牌）', '战斗一开始就布置：每回合它自身<b>获得 6 点格挡</b>。伤害贴着它的格挡走会很吃亏，<b>中毒无视格挡</b>，是关键解法。'],
           ['🩸 吞噬', '当它自身中毒堆到 <b>20 层</b>时会自我净化一次，直接清空中毒——纯拖时间的毒体系会被它克制，但 20 层以前你安心叠。'],
           ['💥 撞击', '普通攻击会额外按你<b>当前生命上限的 5%</b> 追加伤害（毒伤之外再压你一手）。']],
     tip:'别指望只靠毒——它吃得开才会白；带点回血，或者干脆在毒堆起来前把它打穿。'},
  combo:{key:'combo', tier:10, name:'千刃舞者', avatar:'🗡️', hp:200, attack:9, armor:0,
     mech:[['⚔ 两套剑路', '它只有两种意图，来回切换：<b>磨刃</b>（攻击力 +4，永远叠）与<b>连击</b>（4 段，每段约 45% 攻击力）。磨得越久，连击越致命。'],
           ['🎯 破绽（克制）', '<b>你在一个回合里打中它 4 次或更多</b>，剑路就会被打断：这一回合它<b>只能仓促磨刃</b>——<b>不攻击，攻击力只 +2</b>（正常磨刃是 +4）。多段攻击、0 费小牌都算「打中」，所以它怕的是「次数」不是「单发大数字」。'],
           ['🔥 爆发', '两回合磨刃之后的一次连击，很容易打出 4×15 以上的伤害——看到它<b>连续磨刃</b>就该提前铺格挡或压血线。']],
     tip:'别让它安静地磨刃：用多段小攻击把它的节奏打乱，或者干脆在它磨到第三刀之前结束战斗。'},
  breaker:{key:'breaker', tier:10, name:'破盾者', avatar:'⚒️', hp:245, attack:16, armor:0,
     mech:[['⚒ 破盾', '它打你时，<b>你的格挡只按 50% 计算</b>（20 点格挡只挡 10 点伤害）。堆格挡的收益腰斩。'],
           ['💥 碎盾重击', '每 3 回合一次，<b>完全无视格挡</b>，并且伤害 ×1.5。这一下只能靠血量、蛊术或减伤硬吃。'],
           ['🔨 钝击', '其余回合是普通攻击（16 点，格挡减半），偶尔给自己加 12 点格挡。']],
     tip:'纯防守流会被它拆穿：格挡只能当「半价」用。要么在被碎盾重击前把它打死，要么带点蛊术/回血当第二条血条。'},
  // ── 第 15 层：终局 BOSS ──
  commander:{key:'commander', tier:15, name:'终末指挥官', avatar:'👑', hp:360, attack:20, armor:1, rageEvery:15, rageGain:2,
     mech:[['📜 终末指令（能力牌）', '每隔一段时间就会<b>蓄力</b>，倒计时结束后造成 <b>60~70 点</b>高额伤害。倒计时就写在它的面板上，可以提前准备。'],
           ['😡 战意', '你在本场战斗每打出 <b>15 张牌</b>，它就永久 <b>+2 力量</b>（叠加后它的每一次攻击都会变重）。打得越久它越猛。'],
           ['💚 重整军势', '血量低于 30% 时会<b>一次性恢复 60 点生命</b>——别把大招都留到最后，要为斩杀留爆发。'],
           ['🩸 撞击', '终末指令额外按你<b>当前生命上限的 10%</b> 追加伤害（面板上显示的是含撞击的总值）。']],
     tip:'这是一场限时赛：拖得越久，你和它的差距就越大。压缩回合数、在 nova 落下来之前铺好格挡。'},
  titan:{key:'titan', tier:15, name:'磐石巨灵', avatar:'🪨', hp:420, attack:22, armor:1, strength:4,
     mech:[['🪨 血厚力沉', '生命 <b>420</b>、攻击 22，还自带 <b>+4 力量</b>——它的平A就是 26 点。硬拼血线是拼不过的。'],
           ['📉 压制（核心克制）', '它这一回合<b>每承受 10 点伤害，攻击力就临时 -1</b>（可降到 0，直接打不出伤害）。<b>你打得越狠，它这回合越没劲</b>——所以「多段爆发」比「苟」更有用。'],
           ['🏔 坚岩', '常驻 <b>1 点减伤</b>，偶尔给自己加 18 点格挡。小碎伤会被它吃得很干净。'],
           ['⏳ 输出即防御', '面板上会实时显示它本回合已被压制多少——这个数字就是它下回合的实际攻击。']],
     tip:'这是一场「输出换生存」的 BOSS：你每回合打够伤害，它就打不动你。攒爆发、别分散输出，毒结算也算伤害。'},
  devourer:{key:'devourer', tier:15, name:'噬牌者', avatar:'🕷️', hp:380, attack:18, armor:0,
     mech:[['🕷 蚕食牌库', '它每回合结束时<b>永久吞掉你牌堆里的 1 张牌</b>（本场战斗不再回来），并因此 <b>+1 攻击</b>。最多吞 <b>5 张</b>。'],
           ['🕸 饥饿', '吞掉的牌会从「抽牌堆」或「弃牌堆」随机挑——你越依赖某张核心牌，越要早打。'],
           ['💀 压血线', '生命 380、攻击 18 起步，吞噬还会让它越打越疼。它不玩花样，只负责把战斗拖长。']],
     tip:'拖得越久，牌库越薄、它越强。带上过牌压缩回合数，别把关键牌留在牌堆里等它吃。'}
};
const BOSS_POOL={5:['ironclad','ram'], 10:['plague','combo','breaker'], 15:['commander','titan','devourer']};
function bossDefFor(f){
  const pool=BOSS_POOL[f]; if(!pool||!pool.length) return null;
  return BOSS_DEFS[pool[Math.floor(Math.random()*pool.length)]];
}
function makeEnemy(f){
  const def=bossDefFor(f);
  if(def) return {isBoss:true, key:def.key, name:`★${def.name}★`, avatar:def.avatar,
    hp:def.hp, maxHp:def.hp, block:0, strength:def.strength||0, attack:def.attack,
    armor:def.armor||0, vuln:0, poison:0, intent:null,
    setups:[], charge:null, pstep:0, mech:def.mech, tip:def.tip, cfg:def,
    rageEvery:def.rageEvery||0, rageGain:def.rageGain||0, cleansed:false, healed:false,
    mode:'', hitsThisTurn:0, dmgTakenThisTurn:0, devoured:0};
  const hp=24+f*9, atk=5+Math.round(f*1.4);          // 小怪：刻意压低的曲线，前期也能爽快清场
  return {isBoss:false, key:'', name:`第${f}层守卫`, avatar:AV[(f-1)%AV.length],
    hp, maxHp:hp, block:0, strength:0, attack:atk, armor:0, vuln:0, poison:0,
    intent:null, setups:[], charge:null, pstep:0, mech:[], tip:'', cfg:null};
}

// ================= 常量 =================
// —— 临时牌（转瞬）：0费上手；回合结束前没打出就消失；打出后不进任何牌堆、不回主牌库 ——
// 转瞬牌「衍生」上限：0 费牌互相生成会无限滚，所以每回合封顶 TEMP_GEN_PER_TURN 张
const TEMP_GEN_PER_TURN = 4;
// 随机转瞬牌只从「开团 + 通用小牌」里抽：避免开团流白嫖整备/登场/自残的体系牌
const TEMP_POOL = ['open_jab','open_step','open_cheer','open_scout','open_flare','open_toxin','open_band',
                   'open_ward','open_order','open_press','open_rally','open_break','open_blood',
                   'anger','ironwave','tactic','insight','herb'];
// 通用效果结算（普通牌 / 整备 / 登场 / 下场 共用）
let applyDepth=0;                 // 防止「随机触发登场↔随机触发整备」互相递归死循环
// 联动链深度上限：0=你打出的牌，1=它引爆的第 1 层，2=第 2 层，3=第 3 层
// 允许「触发牌 → 整备·回响 → 登场·共鸣 → 2 个整备」这条完整四段链跑完（3 层之后掐断）
const CHAIN_MAX=3;
// 每回合出牌上限（保险丝）：0 费抽牌循环可以无限滚连锁 → 金币/能量/联动全部失去意义
const TURN_CARD_CAP = 60;
// 整备数量上限：万事俱备会不断发 0 费整备，不封顶会滚成指数增长（每回合触发几十次 → 卡顿 + 无敌）
const MAX_SETUP = 8;
// 万事俱备每回合最多送几张（防止同一回合把手牌刷爆）
const ALL_READY_PER_TURN = 2;
// 整备·回响：额外触发固定给「打出最早」的那张（通常就是玩家自己挑的牌）；
// 它被顶替/移除后，加成本身不动，按打出先后顺延给下一张还活着的整备
const ECHO_EXTRA = 1;
// 自残流：生命上限增益每场战斗的封顶（防止「堆上限」在单场里滚成无限）
const MAXHP_CAP_PER_COMBAT = 14;
// ================= 蛊术常量（单机版 v4.2 迁移） =================
const GU_MAX = 40;
const GU_CURSE_CAP = 240;          // 病入膏肓下蛊术跟着毒一起翻倍，常规上限不够用
const GU_ABSORB = 3;               // 1 点蛊术能吞下多少点毒伤（蛊毒牌普遍双向下毒后，5:1 让自毒毫无代价，收紧到 3:1）
const GU_HEAL = 2;                 // 1 点蛊术能换回多少生命（受击 / 回合结束 通用）
const GU_TEMPER_COST = 3;          // 蛊·续命 血满时：3 点蛊术炼成 1 点生命上限（只有牌能给上限）
// 炼体涨的上限与其它加血上限的牌共用每场配额 MAXHP_CAP_PER_COMBAT（14）
const GU_POISON_PCT = 0.10;        // 每打出一张蛊毒牌：敌人按当前中毒的 10% 继续叠毒（至少 1 层）
const GU_CURSE_PCT = 0.70;         // 病入膏肓：敌人中毒 ≥ 生命上限的 70% → 直接斩杀
const GU_TALENTS = ['guT','guSym','guBack','guHeal','guBond','guOpen','guCurse','guErode','guFeast'];
function isGuCard(c){ return !!(c && (c.school==='gu' || c.cat==='蛊毒')); }

// ① 先选天赋（决定后面的选牌倾向）
const TALENT_CAT = {
  entry:{name:'登场系', color:'#ff9d5c', key:'entry'},
  setup:{name:'整备系', color:'#7ac8ff', key:'setup'},
  open: {name:'开团系', color:'#8be07a', key:'open'},
  blood:{name:'自残系', color:'#ff7a8a', key:'blood'},
  poison:{name:'中毒系', color:'#9be36b', key:'poison'},
  gu:   {name:'蛊毒系', color:'#c79bff', key:'gu'},
  other:{name:'通用',   color:'#c4b0ff', key:'other'},
};
function talentCat(t){
  const tag=TALENT_TAGS[t];
  if(tag==='entry') return TALENT_CAT.entry;
  if(tag==='setup') return TALENT_CAT.setup;
  if(tag==='open')  return TALENT_CAT.open;
  if(tag==='blood') return TALENT_CAT.blood;
  if(tag==='poison') return TALENT_CAT.poison;
  if(tag==='gu')     return TALENT_CAT.gu;
  return TALENT_CAT.other;
}

const INTENT_HARM={attack:1,multiatk:1,charge:1};

function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
const nextUid=()=>++uid;
const setUid=v=>{ uid=Math.max(uid,v); };

module.exports = {POOL, SETUP_POOL, SHOP_POOL, TALENTS, BASE_DECK, PICK_COUNT,
  START_TALENTS, START_OPEN_TALENTS, START_ENTRY_TALENTS, START_SETUP_TALENTS, START_BLOOD_TALENTS,
  SCHOOLS, SCHOOL_KEYS, START_PICK_N, PREF_SEATS, START_OTHER_TALENTS, SCHOOL_START_TALENTS,
  cardSchools, activeSchools, cardBlocked,
  TALENT_TAGS, TALENT_CAT, talentCat, mk, mkEntry, scaleFx, scaleLadder, BOSS_ART, BOSS_DEFS, BOSS_POOL, bossDefFor, makeEnemy,
  TEMP_POOL, TEMP_GEN_PER_TURN, CHAIN_MAX, MAX_SETUP, ALL_READY_PER_TURN, ECHO_EXTRA,
  MAXHP_CAP_PER_COMBAT, INTENT_HARM, shuffle, nextUid, setUid,
  GU_MAX, GU_CURSE_CAP, GU_ABSORB, GU_HEAL, GU_TEMPER_COST, GU_POISON_PCT, GU_CURSE_PCT, GU_TALENTS};
