// ============================================================
// 文件: src/config.js
// 描述: 全局常量/变量/难度/天气/商店/神器
// 行范围: 247-1410 (原 game.js)
// 注意: 本文件由原版 HTML 抽取，保持原作用域不变
// ============================================================

        // ===== 中/英文翻译词条（key 为中文字段原文，value 为英文翻译） =====
        Object.assign(I18N_DICT, {
            // 难度
            '简单': 'Easy',
            '敌对生物速度很慢，生命值很低': 'Enemies are very slow with very low HP',
            '普通': 'Normal',
            '敌对生物速度比较慢，生命值低': 'Enemies are slow with low HP',
            '困难': 'Hard',
            '敌对生物速度正常但是比你慢，生命值正常': 'Enemies move at normal speed (slower than you) with normal HP',
            '噩梦': 'Nightmare',
            '敌对生物速度快但是还是比你慢，生命值高': 'Enemies are fast (still slower than you) with high HP',
            '终焉': 'Finale',
            '敌对生物速度可能比你快，生命值很高': 'Enemies may be faster than you with very high HP',
            '诅咒之夜': 'Curse Night',
            '终焉基础·全精英·额外Boss·专属天气·血量×3': 'Finale base · All elites · Extra Boss · Exclusive weather · HP ×3',
            '疯狂之夜': 'Madness Night',
            '终焉基础·全精英·额外Boss·专属天气·血量×5': 'Finale base · All elites · Extra Boss · Exclusive weather · HP ×5',
            // 天气名称
            '晴天': 'Sunny',
            '雨天': 'Rainy',
            '雷电': 'Thunder',
            '暴雪': 'Blizzard',
            '炎夏': 'Heatwave',
            '迷雾': 'Fog',
            '风暴': 'Storm',
            '月夜': 'Moonlit Night',
            '天罚雷电': 'Divine Thunder',
            '诅咒弥漫': 'Cursed Spread',
            '猩红疯狂': 'Crimson Frenzy',
            '疯狂弥漫': 'Madness Spread',
            // 天气效果（英雄/敌人）
            '无': 'None',
            '增伤+15%，每秒流失2%HP': 'DMG +15%, lose 2% HP per second',
            '攻击+15%': 'ATK +15%',
            '移速+15%': 'Move +15%',
            '移速+15%，暴击率-10%': 'Move +15%, Crit -10%',
            '移速-10%，免伤+15%': 'Move -10%, Damage reduction +15%',
            '移速-10%': 'Move -10%',
            '增伤+15%，生命上限-20%': 'DMG +15%, Max HP -20%',
            '攻击+20%': 'ATK +20%',
            '视野-50%': 'Vision -50%',
            '移速+30%': 'Move +30%',
            '移速+20%，攻击+10%': 'Move +20%, ATK +10%',
            '暴击率+25%，攻击+10%': 'Crit +25%, ATK +10%',
            '移速+20%': 'Move +20%',
            '攻击+50%，移速+20%': 'ATK +50%, Move +20%',
            '血量+50%，攻击+50%': 'HP +50%, ATK +50%',
            '移速+40%': 'Move +40%',
            '攻击+50%，移速+40%': 'ATK +50%, Move +40%',
            '血量+50%，攻击+50%，移速+20%': 'HP +50%, ATK +50%, Move +20%',
            // 天气 UI 标签
            '英雄: ': 'Hero: ',
            '敌人: ': 'Enemy: ',
            // 商店
            '🏪 商店': '🏪 Shop',
            '金币: ': 'Gold: ',
            '最大生命加200': 'Max HP +200',
            '普通攻击加100': 'Basic ATK +100',
            '一技能伤害加40': 'Skill 1 DMG +40',
            '二技能伤害加4': 'Skill 2 DMG +4',
            '三技能伤害加70': 'Skill 3 DMG +70',
            '暴击率提升10%': 'Crit rate +10%',
            '回满血': 'Full heal',
            // 神器
            '时之沙漏': 'Hourglass of Time',
            '所有技能CD减少25%': 'All skill CDs reduced by 25%',
            '荆棘之甲': 'Thorned Armor',
            '受到伤害时反弹15%给周围所有敌人': 'Reflect 15% of damage taken to nearby enemies',
            '不灭之心': 'Undying Heart',
            '首次阵亡时满血复活': 'Revive at full HP on first death',
            '幻影斗篷': 'Phantom Cloak',
            '移动时15%概率留下持续2秒的残影分身': '15% chance while moving to leave an afterimage for 2s',
            '嗜血之牙': 'Blood Fang',
            '普攻和技能回复造成伤害的10%生命': 'Basic attacks & skills heal 10% of damage dealt',
            '共鸣之石': 'Resonance Stone',
            '每释放3次技能，下一个技能无CD': 'After every 3 skills, the next skill has no CD',
            '雷电之触': 'Thunder Touch',
            '普攻25%概率触发连锁闪电（最多4目标）': '25% chance on basic attack to trigger chain lightning (up to 4 targets)',
            '疾风之靴': 'Gale Boots',
            '移速+25%': 'Move speed +25%',
            '不屈之盾': 'Unyielding Shield',
            '开局获得35%伤害减免': 'Start with 35% damage reduction',
            '影之分身': 'Shadow Clone',
            '每10秒召唤一个分身持续4秒': 'Every 10s summon a clone lasting 4s',
            '审判之眼': 'Eye of Judgment',
            '每15秒标记最近敌人，对其伤害翻倍': 'Every 15s mark the nearest enemy, double damage to it',
            '幸运硬币': 'Lucky Coin',
            '暴击率+12%，拾取掉落物时10%概率双倍效果': 'Crit +12%, 10% chance of double effect on pickups',
            // 战斗浮字
            '冻结': 'Frozen',
            '无敌': 'Invincible'
        });

        const WIDTH = 1280, HEIGHT = 770;          // 可见视口（Canvas尺寸）
        const MAP_WIDTH = 4000, MAP_HEIGHT = 3080;  // 逻辑地图尺寸（长宽各4倍视口）
        let camX = 0, camY = 0;                     // 相机偏移（世界坐标）
        const GRID = 25;
        let canvas, ctx;
        let dpr = 1;  // 设备像素比（高DPI屏幕适配），bootstrap初始化后赋值，gameLoop每帧setTransform使用
        let hero, enemies = [], particles = [];
        let wave = 1, totalKills = 0;
        let keys = {}, waveTimer = 0;
        let gameRunning = false, showingBuff = false;
        let ringActive = false, ringTimer = 0, ringAngle = 0;
        let guanYuRangeBoost = 0, guanYuDmgBoost = 0, guanYuLifesteal = false;
        // ===== 新增：英雄专属肉鸽增强数值（每局重置） =====
        let enhZhaoYunHeal = 0;            // 赵云七进七出额外回血比例
        let enhDiaoChanPoisonDuration = 0; // 貂蝉百花绽放额外毒区持续时间（帧）
        let enhDiaoChanCloneCount = 0;    // 貂蝉月华分身额外数量（肉鸽增强）
        let diaoChanSpeedBoostTimer = 0;  // 貂蝉三技能移速增益剩余帧
        let enhGuanYuRangeMult = 0;        // 关羽青龙之威额外范围倍数
        let enhGuanYuRangeDuration = 0;    // 关羽青龙之威额外持续时间（帧）
        let enhGuanYuLifesteal = 0;        // 关羽过五关额外吸血比例
        let enhHuangZhongSplash = 0;       // 黄忠百步穿杨额外溅射范围
        let enhMaChaoChainCount = 0;       // 马超神威万里额外连锁数
        // ===== 新增：诸葛亮专属肉鸽增强数值 =====
        let enhZhugeLiangSpeed = 0;        // 诸葛亮一技能额外加速比例（每次+5%）
        let enhZhugeLiangAoeMult = 0;      // 诸葛亮二技能额外范围倍数（每次+0.2）
        let enhZhugeLiangRadiusMult = 0;   // 诸葛亮三技能额外半径比例（每次+0.15）
        let zhugeLiangSpeedTimer = 0;      // 诸葛亮一技能加速剩余帧
        let zhugeLiangAoeBoostTimer = 0;   // 诸葛亮二技能AOE强化剩余帧
        let zhugeLiangRadiusBoostTimer = 0;// 诸葛亮三技能半径增大剩余帧
        // ===== 新增：张飞专属肉鸽增强数值 =====
        let enhZhangFeiRoarDmg = 0;        // 张飞燕人咆哮额外伤害
        let enhZhangFeiSpearDmg = 0;       // 张飞丈八蛇矛额外伤害
        let enhZhangFeiShield = 0;         // 张飞万人敌额外护盾比例（每次+10%）
        let zhangFeiInvincibleTimer = 0;   // 张飞三技能无敌剩余帧（保留向后兼容）
        let zhangFeiShieldTimer = 0;       // 张飞三技能护盾剩余帧
        // ===== 新增：周瑜专属肉鸽增强数值 =====
        let enhZhouyuSkill1Dmg = 0;        // 周瑜焰冲斩额外伤害（每次+200，独立）
        let enhZhouyuSkill2Dmg = 0;        // 周瑜炎突斩额外伤害（每次+200，独立）
        let enhZhouyuSkill3Dmg = 0;
        // ===== 吕蒙专属状态 =====
        let lvmengSpeedBoostTimer = 0;   // 疾风步移速增益剩余帧
        let enhLvmengSpeed = 0;          // 疾风步额外加速比例（每次+6%）
        let lvmengMissiles = [];          // 天诛导弹容器
        // ===== 墨子（光学机关师）全局变量 =====
        let moziLasers = [];             // 当前场上激光段数组（每段独立，折射后新增段）
        let moziNextBeamWidthMult = 1.0; // 二技能：下一次激光宽度倍率（基础1.0，开启后×2，每次强化+0.3）
        let moziNextBeamExtraBounces = 0;// 三技能：下一次激光额外折射次数（基础0，开启后+1，每次强化+1）
        let enhMoziBeamDmg = 0;          // 一技能伤害强化（每次+165）
        let enhMoziWidthMult = 0;        // 二技能宽度倍率强化（每次+0.3）
        let enhMoziBounces = 0;          // 三技能折射次数强化（每次+1）
        // ===== 韩非（法家·律令裁决）全局变量 =====
        let heroFreezeTimer = 0;         // 雾隐：敌方静止剩余帧（仅冻结敌方，英雄可动；与冥渊timeFrozen独立，互不干扰）
        let heroFogHidden = false;       // 雾隐：英雄处于"隐身"状态标志（用于绘制全黑形态+灰色烟雾粒子）
        let enhHanFeiHeal = 0;           // 视线替换额外回血比例（每次+0.07，基础0.30）
        let enhHanFeiSpeed = 0;          // 视线替换额外加速比例（每次+0.07，基础0.40）
        let hanFeiSpeedBoostTimer = 0;   // 视线替换加速剩余帧
        let enhHanFeiJudgementDmg = 0;   // 最终审判额外伤害（每次+200，基础200）
        // ===== 司马懿（天空之主·原创角色1）全局变量 =====
        // 新机制：风之印记 - 每释放5次技能获得21%加速持续2.1秒（削弱30%）
        let cangqiongSkillCount = 0;        // 风之印记：技能释放计数（0-5，满5次激活21%加速2.1秒）
        let cangqiongWindMarkTimer = 0;     // 风之印记加速剩余帧（2.1秒=126帧，21%加速）
        let cangqiongFlyingTimer = 0;       // 天空之眼起飞加速剩余帧（2.1秒=126帧，前1.05秒无敌）
        let cangqiongThunderStormTimer = 0; // 天罚之雷持续剩余帧（2.8秒=168帧）
        let cangqiongThunderStormTickTimer = 0; // 天罚之雷伤害tick计时
        let enhCangqiongWhirlDmg = 0;       // 旋风斩额外伤害（每次+42，肉鸽强化）
        let enhCangqiongThunderStrikeDmg = 0; // 天空之眼天雷固定额外伤害（每次+56，基础70）
        let enhCangqiongThunderDmg = 0;     // 天罚之雷额外伤害（每次+21）
        // ===== 典韦（灰烬武者·原创角色2）全局变量 =====
        // 新机制：普攻叠加烬值 - 每普攻1次+1层，满6次触发烬燃3秒（攻击+80%，移速+30%）
        let jinAttackStacks = 0;            // 普攻烬值计数（0-6，满6次触发烬燃3秒）
        let jinEmberBurnTimer = 0;          // 烬燃状态剩余帧（攻击+80%，移速+30%）
        let enhJinThrustDmg = 0;            // 烬突刺额外伤害（每次+30）
        let enhJinBurnDuration = 0;         // 烬燃额外持续帧（每次+36帧=0.6秒）
        let enhJinExplosionDmg = 0;         // 灰飞烟灭额外伤害（每次+120）
        let enhJinExplosionHeal = 0;        // 灰飞烟灭额外回血比例（每次+0.15，基础0.4）
        // ===== 鲁肃（水之法师·原创角色3）全局变量 =====
        // 新机制：潮汐护盾 - 4秒持续，护盾吸收+每秒回5%最大HP
        let lanShieldTimer = 0;             // 潮汐护盾剩余帧（4秒=240帧）
        let lanShieldAmount = 0;            // 潮汐护盾吸收量
        let lanShieldHealTickTimer = 0;     // 潮汐护盾每秒回血tick计时
        let lanTsunamiTimer = 0;            // 深海怒涛持续剩余帧
        let lanTsunamiTickTimer = 0;        // 深海怒涛伤害tick计时
        let enhLanShieldHp = 0;             // 潮汐护盾额外吸收量（每次+80，基础100）
        let enhLanHealPct = 0;              // 潮汐护盾额外每秒回血比例（每次+0.02，基础0.05）
        // ===== 左慈（时空织者·原创角色5）全局变量 =====
        // 新机制：被动增加1次复活机会（首次复活触发文字提示）
        let zhiExtraReviveUsed = false;     // 左慈额外复活已用标志（首次复活时显示文字提示）
        let zhiFreezeTimer = 0;             // 时间停滞剩余帧（冻结所有敌人3秒=180帧）
        let zhiCollapseTimer = 0;           // 时空崩塌持续剩余帧
        let zhiCollapseTickTimer = 0;       // 时空崩塌伤害tick计时
        let zhiRiftTimer = 0;               // 时空裂隙伤害区域剩余帧（3秒=180帧）
        let zhiRiftX = 0;                   // 时空裂隙伤害区域中心X
        let zhiRiftY = 0;                   // 时空裂隙伤害区域中心Y
        let zhiRiftTickTimer = 0;           // 时空裂隙伤害tick计时
        let enhZhiRiftDmg = 0;              // 时空裂隙额外伤害（每次+60）
        let enhZhiCollapseDmg = 0;          // 时空崩塌额外伤害（每次+200或+180）
        // ===== 陆逊（烈焰之心·原创角色6）全局变量 =====
        // 新机制：燃烧双轨制 - 叠层数（永久不消失，每5层转1层正在燃烧层）+ 正在燃烧层（每层独立3秒，每秒-30血）
        let yanBurnAuraTimer = 0;           // 焚身烈焰光环剩余帧（3秒=180帧，每秒对范围敌人+1层叠层+50伤害）
        let yanBurnAuraTickTimer = 0;       // 焚身烈焰伤害tick计时
        let enhYanSlashDmg = 0;             // 烈焰冲击额外伤害（每次+80）
        let enhYanAuraDmg = 0;              // 焚身烈焰每秒额外伤害（每次+50）
        let enhYanBurnDmg = 0;              // 燃烧每一层每秒额外伤害（每次+20，基础30）
        // ===== 甄姬（寒冰女皇·原创角色7）全局变量 =====
        // 新机制：寒冰累积 - 普攻/技能叠加寒冰层数，5层立即冻结2秒；冻结期间不可继续叠层，冻结解除后从0开始叠
        let shuangBlizzardTimer = 0;        // 极地风暴持续剩余帧
        let shuangBlizzardTickTimer = 0;    // 极地风暴伤害tick计时
        let enhShuangArrowDmg = 0;          // 寒冰箭额外伤害（每次+80）
        let enhShuangFieldDmg = 0;          // 冰封领域额外伤害（每次+100）
        let enhShuangBlizzardDmg = 0;       // 极地风暴额外伤害（每次+30）
        // ===== 于吉（荆棘领主·原创角色8）全局变量 =====
        // 新机制：一技能普攻伤害翻倍+减速，二技能链接5敌每秒回血，三技能AOE
        let jiAtkBoostTimer = 0;            // 一技能普攻伤害翻倍剩余帧（2秒=120帧）
        let jiVineLinks = [];               // 二技能寄生藤蔓链接数组（最多5个，{enemy, timer}）
        let jiVineHealTimer = 0;            // 二技能每秒回血持续剩余帧（2秒=120帧）
        let jiVineHealTickTimer = 0;        // 二技能每秒回血tick计时
        let enhJiVineHealPct = 0;           // 二技能每秒回血额外比例（每次+0.06，基础0.10）
        let enhJiFieldDmg = 0;              // 三技能额外伤害（每次+200）
        // ===== 黄盖（水晶主宰·原创角色10）全局变量 =====
        // 新机制：二技能召唤5个水晶棱镜炮台环绕自身3秒，每炮台独立普攻(0.14倍率)，三技能引爆每棱镜255范围+眩晕128范围1.2秒
        let jingPrisms = [];                // 水晶棱镜炮台数组（{x, y, life, attackTimer, angle}）
        let jingPrismFieldActive = false;   // 二技能棱镜阵列是否激活中（三技能使用前置条件）
        let jingRefractionBoostTimer = 0;   // 一技能下次普攻折射强化剩余帧（窗口期内下次普攻触发折射）
        let enhJingRefractionCount = 0;     // 一技能折射额外人数（每次+1，基础2）
        let enhJingRefractionMult = 0;      // 一技能折射伤害倍率额外加成（每次+0.14，基础0.42）
        let enhJingPrismAtkMult = 0;        // 二技能炮台攻击倍率额外加成（每次+0.07，基础0.14）
        let enhJingBurstDmg = 0;            // 三技能每棱镜爆炸额外伤害（每次+42，基础35）
        // 周瑜焚影刺额外伤害（每次+200，独立）
        let skillCooldown = [...SKILL_CONFIG.skillCooldowns.initial];
        let skillMaxCooldown = [...SKILL_CONFIG.skillCooldowns.max];
        // 防御性：确保 skillCooldown 至少4个元素
        while (skillCooldown.length < 4) skillCooldown.push(0);
        while (skillMaxCooldown.length < 4) skillMaxCooldown.push(0);
        let skillText = null;
        // ===== 复活系统：以困难模式为基准（1次复活），噩梦+1，终焉+3 =====
        let revivesLeft = GAME_CONFIG.hero.baseRevives;        // 当前剩余复活次数（游戏内动态递减）
        let heroReviveMaxHp = 0;    // 英雄死亡时记录的最大血量（复活时回满血用）
        let stats = {
            hp: GAME_CONFIG.hero.baseHp,
            attack: GAME_CONFIG.hero.baseAttack,
            skill1: GAME_CONFIG.hero.baseSkillDamage.skill1,
            skill2: GAME_CONFIG.hero.baseSkillDamage.skill2,
            skill3: GAME_CONFIG.hero.baseSkillDamage.skill3
        };
        let enemyCount = 1;
        let enemyBaseHp = GAME_CONFIG.enemy.baseHp;
        let enemyBaseAttack = GAME_CONFIG.enemy.baseAttack;

        // ============================================================
        // ===== 难度系统（以"困难"为基准，其他难度在困难基础上调整） =====
        // ============================================================
        // 所有数值注释均以困难模式为基准说明其他难度的偏移
        // eliteRules 字段说明：
        //   key 为波次区间起点（1=1-5波, 6=6-10波, 11=11-15波, 16=16波及以后）
        //   value = -1 表示该区间固定1个精英怪
        //   value = 0~1 表示该区间每个普通小怪位置按此概率替换为精英
        //   精英替换普通怪出现，怪总数不变；boss是新增，不影响小怪刷新
        const DIFFICULTY_CONFIG = {
            // ===== 简单模式：敌对生物速度很慢，生命值很低 =====
            easy: {
                name: _t('简单'),
                desc: _t('敌对生物速度很慢，生命值很低'),
                heroSpeed: 2.3,                                      // 英雄速度（所有难度固定2.3）
                enemySpeed: { normal: 1.7, elite: 1.9, archer: 0.7, boss: 1.0 },  // 困难基准: 1.9/2.1/0.9/1.8
                hpMult: 0.45,                                        // 困难基准: 1.0（即100%血量）
                eliteRules: { 1: 0, 6: 0, 11: 0, 16: 0 },           // 困难基准: 0/3%/5%/10% —— 简单永远没有精英
                extraRevives: 0                                      // 困难基准: 0次额外复活
            },
            // ===== 普通模式：敌对生物速度比较慢，生命值低 =====
            normal: {
                name: _t('普通'),
                desc: _t('敌对生物速度比较慢，生命值低'),
                heroSpeed: 2.3,
                enemySpeed: { normal: 1.8, elite: 2.0, archer: 0.8, boss: 1.4 },
                hpMult: 0.75,                                        // 困难基准75%
                eliteRules: { 1: 0, 6: 0, 11: 0.03, 16: 0.05 },     // 1-10波无精英, 11-15波3%, 16+固定5%
                extraRevives: 0
            },
            // ===== 困难模式（基准）：敌对生物速度正常但是比你慢，生命值正常 =====
            hard: {
                name: _t('困难'),
                desc: _t('敌对生物速度正常但是比你慢，生命值正常'),
                heroSpeed: 2.3,
                enemySpeed: { normal: 1.9, elite: 2.1, archer: 0.9, boss: 1.8 },
                hpMult: 1.0,                                         // 基准100%
                eliteRules: { 1: 0, 6: 0.03, 11: 0.05, 16: 0.10 },  // 1-5波无, 6-10波3%, 11-15波5%, 16+固定10%
                extraRevives: 0
            },
            // ===== 噩梦模式：敌对生物速度快但是还是比你慢，生命值高 =====
            nightmare: {
                name: _t('噩梦'),
                desc: _t('敌对生物速度快但是还是比你慢，生命值高'),
                heroSpeed: 2.3,
                enemySpeed: { normal: 2.0, elite: 2.2, archer: 1.0, boss: 2.0 },
                hpMult: 1.5,                                         // 困难基准150%
                eliteRules: { 1: -1, 6: 0.10, 11: 0.15, 16: 0.20 }, // 1-5波固定1精英, 6-10波10%, 11-15波15%, 16+固定20%
                extraRevives: 1                                      // 比困难多1次复活
            },
            // ===== 终焉模式：敌对生物速度可能比你快，生命值很高 =====
            end: {
                name: _t('终焉'),
                desc: _t('敌对生物速度可能比你快，生命值很高'),
                heroSpeed: 2.3,
                enemySpeed: { normal: 2.15, elite: 2.35, archer: 1.5, boss: 2.2 },
                hpMult: 2.0,                                         // 困难基准200%
                eliteRules: { 1: -1, 6: 0.20, 11: 0.30, 16: 0.50 }, // 1-5波固定1精英, 6-10波20%, 11-15波30%, 16+固定50%
                extraRevives: 3                                      // 比困难多3次复活
            },
            // ===== 诅咒之夜：独立难度（终焉基础·血量×3·专属天气·全精英·每波额外Boss） =====
            curse: {
                name: _t('诅咒之夜'),
                desc: _t('终焉基础·全精英·额外Boss·专属天气·血量×3'),
                heroSpeed: 2.3,
                enemySpeed: { normal: 2.15, elite: 2.35, archer: 1.5, boss: 2.2 },  // 与终焉一致
                hpMult: 3.0,                                         // 困难基准300%（敌人基础血量×3）
                eliteRules: { 1: -1, 6: 0.20, 11: 0.30, 16: 0.50 }, // 与终焉一致
                extraRevives: 5                                      // 终焉3次+诅咒之夜额外2次
            },
            // ===== 疯狂之夜：独立难度（终焉基础·血量×5·全精英·专属天气·每波额外Boss） =====
            madness: {
                name: _t('疯狂之夜'),
                desc: _t('终焉基础·全精英·额外Boss·专属天气·血量×5'),
                heroSpeed: 2.3,
                enemySpeed: { normal: 2.15, elite: 2.35, archer: 1.5, boss: 2.2 },  // 与终焉一致
                hpMult: 5.0,                                         // 困难基准500%（敌人基础血量×5）
                eliteRules: { 1: -1, 6: 0.20, 11: 0.30, 16: 0.50 }, // 与终焉一致
                extraRevives: 5                                      // 总复活次数=1基础+5额外=6次
            }
        };
        // 战斗暂停状态（空格键切换）
        let gamePaused = false;
        // 当前难度对象（默认困难——基准难度）
        let currentDifficulty = DIFFICULTY_CONFIG.hard;
        // 当前选中的难度key（用于UI高亮）
        let selectedDifficultyKey = 'hard';

        // ===== 根据波次获取精英生成概率/规则 =====
        // 返回值: -1 = 固定1个精英; 0~1 = 每个普通小怪按此概率替换为精英
        function getEliteRule(wave) {
            // 防御性：currentDifficulty 或 eliteRules 未定义时返回0（不生成精英）
            const rules = (currentDifficulty && currentDifficulty.eliteRules) || {};
            if (wave <= 5) return rules[1] || 0;       // 1-5波区间
            if (wave <= 10) return rules[6] || 0;      // 6-10波区间
            if (wave <= 15) return rules[11] || 0;     // 11-15波区间
            return rules[16] || 0;                     // 16波及以后
        }

        // ===== 新增：连杀/暴击/道具/慢动作 系统 =====
        let combo = 0;
        let comboTimer = 0;
        const COMBO_TIMEOUT = 180;
        let slowMoTimer = 0;
        let bossDeathDelay = 0;   // Boss死亡后延迟弹出肉鸽选择（等死亡动画播完）
        let bossUpgradeTriggered = false; // 防重复：checkWave推wave后已触发升级（防"升级好几次"）
        let bossDeathFxTriggered = false; // 防重复：boss死亡特效(triggerSlowMo/Shake)只触发1次（防王分裂体/双boss误判）
        let pickups = [];
        let bossAlive = false;
        let bossRefs = [];        // 多Boss引用数组（支持双Boss）
        let trailParticles = [];
        
        // ===== 流畅度优化：帧率监控 + 自适应性能降级 =====
        // perfLevel: 0=最高画质, 1=降低shadowBlur, 2=降低粒子数
        // 当帧率低于45fps时自动降级，高于55fps时自动升级
        let perfLevel = 0;
        let frameTimes = [];        // 最近60帧的耗时记录
        let lastFrameTime = performance.now();

        // ============================================================
        // ===== 天气系统 =====
        // ============================================================
        function switchWeather() {
            // 先移除旧天气的所有效果
            if (currentWeather) removeWeatherEffects();

            const w = WEATHER_DEFS[Math.floor(Math.random() * WEATHER_DEFS.length)];
            currentWeather = w.id;

            // 应用新天气效果（追踪所有变化）
            applyNewWeather(w);

            // 更新天气UI
            const wi = document.getElementById('weatherIndicator');
            if (wi && w) {
                wi.innerHTML = `<div class="weather-name" style="color:${w.color}">${w.icon} ${w.name}</div>` +
                    `<div class="weather-effect">` +
                    `<span class="hero-eff">${_t('英雄: ')}${w.heroEffect}</span> | ` +
                    `<span class="enemy-eff">${_t('敌人: ')}${w.enemyEffect}</span>` +
                    `</div>`;
                wi.style.borderColor = w.color;
                wi.style.display = 'block';
            }
        }

        // ===== 诅咒之夜专属天气切换（30秒轮换一次，只从3种诅咒天气中选） =====
        function switchCursedWeather() {
            // 先移除旧天气的所有效果
            if (currentWeather) removeWeatherEffects();

            // 随机取下一个诅咒天气（避免与当前重复）
            let nextIdx;
            do {
                nextIdx = Math.floor(Math.random() * CURSED_WEATHER_DEFS.length);
            } while (CURSED_WEATHER_DEFS.length > 1 && nextIdx === curseNightWeatherIndex);
            curseNightWeatherIndex = nextIdx;
            const w = CURSED_WEATHER_DEFS[nextIdx];
            currentWeather = w.id;

            // 应用新天气效果
            applyNewWeather(w);

            // 更新天气UI
            const wi = document.getElementById('weatherIndicator');
            if (wi && w) {
                wi.innerHTML = `<div class="weather-name" style="color:${w.color}">${w.icon} ${w.name}</div>` +
                    `<div class="weather-effect">` +
                    `<span class="hero-eff">${_t('英雄: ')}${w.heroEffect}</span> | ` +
                    `<span class="enemy-eff">${_t('敌人: ')}${w.enemyEffect}</span>` +
                    `</div>`;
                wi.style.borderColor = w.color;
                wi.style.display = 'block';
            }
        }

        // ===== 疯狂之夜专属天气切换（每波自动切换，只从3种疯狂天气中选，不重复当前） =====
        function switchMadnessWeather() {
            // 先移除旧天气的所有效果
            if (currentWeather) removeWeatherEffects();

            // 随机取下一个疯狂天气（避免与当前重复）
            let nextIdx;
            do {
                nextIdx = Math.floor(Math.random() * MADNESS_WEATHER_DEFS.length);
            } while (MADNESS_WEATHER_DEFS.length > 1 && nextIdx === madnessNightWeatherIndex);
            madnessNightWeatherIndex = nextIdx;
            const w = MADNESS_WEATHER_DEFS[nextIdx];
            currentWeather = w.id;

            // 应用新天气效果
            applyNewWeather(w);

            // 更新天气UI
            const wi = document.getElementById('weatherIndicator');
            if (wi && w) {
                wi.innerHTML = `<div class="weather-name" style="color:${w.color}">${w.icon} ${w.name}</div>` +
                    `<div class="weather-effect">` +
                    `<span class="hero-eff">${_t('英雄: ')}${w.heroEffect}</span> | ` +
                    `<span class="enemy-eff">${_t('敌人: ')}${w.enemyEffect}</span>` +
                    `</div>`;
                wi.style.borderColor = w.color;
                wi.style.display = 'block';
            }
        }

        function drawWeatherEffects() {
            if (!enableWeather && !curseNightMode && !madnessNightMode) return;
            const t = Date.now() / 1000;
            switch (currentWeather) {
                case 'rain':
                    // 暴雨：密集蓝色斜向雨丝 + 地面溅射
                    ctx.save();
                    ctx.strokeStyle = '#4488ff';
                    ctx.lineWidth = 1.5;
                    for (let i = 0; i < 120; i++) {
                        const rx = camX + ((i * 137 + Math.sin(t + i) * 30) % WIDTH);
                        const ry = camY + ((t * 350 + i * 53) % HEIGHT);
                        const alpha = 0.15 + Math.random() * 0.3;
                        ctx.globalAlpha = alpha;
                        ctx.beginPath();
                        ctx.moveTo(rx, ry);
                        ctx.lineTo(rx + 3, ry + 22);
                        ctx.stroke();
                    }
                    // 雨滴溅射
                    ctx.fillStyle = '#aaccff';
                    for (let i = 0; i < 15; i++) {
                        const sx = camX + Math.random() * WIDTH;
                        const sy = camY + Math.random() * HEIGHT;
                        ctx.globalAlpha = 0.04;
                        ctx.fillRect(sx, sy, 8, 2);
                    }
                    ctx.restore();
                    break;
                case 'thunder':
                    // 雷电：更频繁强烈的闪电 + 屏幕白闪
                    ctx.save();
                    if (Math.random() < 0.04) {
                        const lx = camX + Math.random() * WIDTH;
                        ctx.globalAlpha = 0.7;
                        ctx.strokeStyle = '#ffffaa';
                        ctx.lineWidth = 4;
                        ctx.shadowColor = '#ffffaa';
                        ctx.shadowBlur = 60;
                        ctx.beginPath();
                        ctx.moveTo(lx, camY);
                        ctx.lineTo(lx + 30, camY + 80);
                        ctx.lineTo(lx - 15, camY + 180);
                        ctx.lineTo(lx + 40, camY + 280);
                        ctx.lineTo(lx - 5, camY + 400);
                        ctx.lineTo(lx + 25, camY + HEIGHT);
                        ctx.stroke();
                        // 分支闪电
                        ctx.shadowBlur = 20;
                        ctx.lineWidth = 2;
                        ctx.globalAlpha = 0.4;
                        ctx.beginPath();
                        ctx.moveTo(lx + 30, camY + 80);
                        ctx.lineTo(lx + 80, camY + 130);
                        ctx.stroke();
                        ctx.beginPath();
                        ctx.moveTo(lx - 15, camY + 180);
                        ctx.lineTo(lx - 60, camY + 230);
                        ctx.stroke();
                        // 屏幕白闪
                        lightningFlash = 10;
                    }
                    if (lightningFlash > 0) {
                        ctx.globalAlpha = 0.25;
                        ctx.fillStyle = '#ffffff';
                        ctx.fillRect(camX, camY, WIDTH, HEIGHT);
                        lightningFlash--;
                    }
                    ctx.restore();
                    break;
                case 'curse':
                case 'm_spread':  // 疯狂之夜·疯狂弥漫：视觉同诅咒（紫罗兰闪电+暗紫覆盖）
                    // 诅咒天气：照搬雷电闪电特效（紫罗兰色）+ 屏幕暗紫覆盖
                    ctx.save();
                    if (Math.random() < 0.04) {
                        const lx = camX + Math.random() * WIDTH;
                        ctx.globalAlpha = 0.7;
                        ctx.strokeStyle = '#d070ff';
                        ctx.lineWidth = 4;
                        ctx.shadowColor = '#d070ff';
                        ctx.shadowBlur = 60;
                        ctx.beginPath();
                        ctx.moveTo(lx, camY);
                        ctx.lineTo(lx + 30, camY + 80);
                        ctx.lineTo(lx - 15, camY + 180);
                        ctx.lineTo(lx + 40, camY + 280);
                        ctx.lineTo(lx - 5, camY + 400);
                        ctx.lineTo(lx + 25, camY + HEIGHT);
                        ctx.stroke();
                        ctx.shadowBlur = 20;
                        ctx.lineWidth = 2;
                        ctx.globalAlpha = 0.4;
                        ctx.beginPath();
                        ctx.moveTo(lx + 30, camY + 80);
                        ctx.lineTo(lx + 80, camY + 130);
                        ctx.stroke();
                        ctx.beginPath();
                        ctx.moveTo(lx - 15, camY + 180);
                        ctx.lineTo(lx - 60, camY + 230);
                        ctx.stroke();
                        // 紫色屏幕闪烁（更暗、更邪典）
                        lightningFlash = 8;
                    }
                    if (lightningFlash > 0) {
                        ctx.globalAlpha = 0.18;
                        ctx.fillStyle = '#6a00aa';
                        ctx.fillRect(camX, camY, WIDTH, HEIGHT);
                        lightningFlash--;
                    }
                    // 暗紫色全局覆盖
                    ctx.globalAlpha = 0.06;
                    ctx.fillStyle = '#2a0040';
                    ctx.fillRect(camX, camY, WIDTH, HEIGHT);
                    ctx.restore();
                    break;
                case 'madness':
                case 'm_rampage':  // 疯狂之夜·猩红疯狂：视觉同疯狂（血雨+暗红覆盖）
                    // 疯狂天气：血雨特效 + 暗红全局覆盖
                    ctx.save();
                    ctx.strokeStyle = '#cc0022';
                    ctx.lineWidth = 1.2;
                    for (let i = 0; i < 100; i++) {
                        const rx = camX + ((i * 137 + Math.sin(t + i) * 20) % WIDTH);
                        const ry = camY + ((t * 420 + i * 61) % HEIGHT);
                        const alpha = 0.2 + Math.random() * 0.35;
                        ctx.globalAlpha = alpha;
                        ctx.beginPath();
                        ctx.moveTo(rx, ry);
                        ctx.lineTo(rx + 2, ry + 18);
                        ctx.stroke();
                    }
                    // 雨滴溅射（血滴）
                    ctx.fillStyle = '#aa0011';
                    for (let i = 0; i < 20; i++) {
                        const sx = camX + Math.random() * WIDTH;
                        const sy = camY + Math.random() * HEIGHT;
                        ctx.globalAlpha = 0.06;
                        ctx.beginPath();
                        ctx.arc(sx, sy, 2 + Math.random() * 2, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    // 暗红全局覆盖
                    ctx.globalAlpha = 0.08;
                    ctx.fillStyle = '#400008';
                    ctx.fillRect(camX, camY, WIDTH, HEIGHT);
                    ctx.restore();
                    break;
                case 'snow':
                    // 暴风雪：大雪片+旋转六角星+地面积雪
                    ctx.save();
                    for (let i = 0; i < 80; i++) {
                        const sx = camX + ((t * 25 + i * 137) % (WIDTH + 100)) - 50;
                        const sy = camY + ((t * 45 + i * 79) % HEIGHT);
                        const size = 2 + Math.random() * 5;
                        ctx.globalAlpha = 0.2 + Math.random() * 0.5;
                        // 六角雪花
                        ctx.fillStyle = '#ddeeff';
                        ctx.beginPath();
                        ctx.arc(sx, sy, size, 0, Math.PI * 2);
                        ctx.fill();
                        // 雪花光晕
                        ctx.globalAlpha *= 0.5;
                        ctx.fillStyle = '#ffffff';
                        ctx.beginPath();
                        ctx.arc(sx, sy, size * 1.8, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    // 底部积雪
                    ctx.globalAlpha = 0.12;
                    ctx.fillStyle = '#eef4ff';
                    ctx.fillRect(camX, camY + HEIGHT * 0.85, WIDTH, HEIGHT * 0.15);
                    ctx.restore();
                    break;
                case 'heat':
                    // 炎夏：热浪扭曲波纹+向上火星+底部橙色辉光
                    ctx.save();
                    // 热浪扭曲条纹
                    ctx.globalAlpha = 0.10;
                    ctx.fillStyle = '#ff4422';
                    for (let i = 0; i < 25; i++) {
                        const hx = camX + i * (WIDTH / 25);
                        const waveOffset = Math.sin(t * 4 + i * 1.3) * 15;
                        ctx.fillRect(hx, camY + waveOffset, WIDTH / 25 + 1, HEIGHT);
                    }
                    // 底部热辉光
                    const heatGrad = ctx.createLinearGradient(camX, camY + HEIGHT, camX, camY + HEIGHT * 0.6);
                    heatGrad.addColorStop(0, 'rgba(255,100,20,0.25)');
                    heatGrad.addColorStop(0.5, 'rgba(255,80,10,0.08)');
                    heatGrad.addColorStop(1, 'rgba(255,50,0,0)');
                    ctx.fillStyle = heatGrad;
                    ctx.fillRect(camX, camY, WIDTH, HEIGHT);
                    // 火星粒子向上飘
                    ctx.fillStyle = '#ff6600';
                    for (let i = 0; i < 30; i++) {
                        const fx = camX + ((i * 173 + Math.sin(t + i) * 80) % WIDTH);
                        const fy = camY + HEIGHT - ((t * 60 + i * 97) % (HEIGHT * 0.7));
                        ctx.globalAlpha = 0.15 + Math.random() * 0.25;
                        ctx.beginPath();
                        ctx.arc(fx, fy, 1.5 + Math.random() * 2, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    ctx.restore();
                    break;
                case 'fog':
                    // 迷雾：世界空间雾层（屏幕空间主雾在gameLoop中处理）
                    ctx.save();
                    ctx.globalAlpha = 0.08;
                    ctx.fillStyle = '#999';
                    ctx.fillRect(camX, camY, WIDTH, HEIGHT);
                    ctx.restore();
                    break;
                case 'storm':
                    // 风暴：快速水平风线+碎片粒子
                    ctx.save();
                    ctx.strokeStyle = '#88cca0';
                    ctx.lineWidth = 1.5;
                    for (let i = 0; i < 50; i++) {
                        const sx = camX + Math.random() * WIDTH;
                        const sy = camY + ((t * 500 + i * 113) % HEIGHT);
                        const len = 40 + Math.random() * 80;
                        ctx.globalAlpha = 0.15 + Math.random() * 0.2;
                        ctx.beginPath();
                        ctx.moveTo(sx, sy);
                        ctx.lineTo(sx + len, sy + Math.sin(t * 3 + i) * 10);
                        ctx.stroke();
                    }
                    // 碎片粒子横向飘动
                    ctx.fillStyle = '#bbddcc';
                    for (let i = 0; i < 20; i++) {
                        const fx = camX + ((t * 200 + i * 77) % (WIDTH + 60)) - 30;
                        const fy = camY + ((i * 131 + Math.sin(t * 2 + i) * 30) % HEIGHT);
                        ctx.globalAlpha = 0.2 + Math.random() * 0.3;
                        ctx.beginPath();
                        ctx.arc(fx, fy, 2 + Math.random() * 3, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    ctx.restore();
                    break;
                case 'moon':
                    // 月夜：紫蓝色调覆盖+月光光晕+四角暗角
                    ctx.save();
                    // 深紫夜色覆盖
                    ctx.globalAlpha = 0.12;
                    ctx.fillStyle = '#1a1030';
                    ctx.fillRect(camX, camY, WIDTH, HEIGHT);
                    // 月光光晕
                    const g = ctx.createRadialGradient(camX + WIDTH * 0.2, camY + 60, 60, camX + WIDTH / 2, camY + HEIGHT / 2, 600);
                    g.addColorStop(0, 'rgba(136,102,204,0.3)');
                    g.addColorStop(0.3, 'rgba(120,80,200,0.12)');
                    g.addColorStop(0.7, 'rgba(80,40,180,0.04)');
                    g.addColorStop(1, 'rgba(20,10,50,0)');
                    ctx.fillStyle = g;
                    ctx.fillRect(camX, camY, WIDTH, HEIGHT);
                    // 月亮
                    ctx.fillStyle = '#ccbbff';
                    ctx.globalAlpha = 0.5;
                    ctx.shadowColor = '#ccaaff';
                    ctx.shadowBlur = 40;
                    const mx = camX + 80;
                    const my = camY + 80;
                    ctx.beginPath();
                    ctx.arc(mx, my, 30, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.shadowBlur = 0;
                    // 星星
                    ctx.fillStyle = '#ffffff';
                    for (let i = 0; i < 25; i++) {
                        const sx = camX + ((i * 173) % WIDTH);
                        const sy = camY + ((i * 97 + 30) % (HEIGHT * 0.6));
                        const twinkle = 0.3 + Math.sin(t * 3 + i) * 0.3;
                        ctx.globalAlpha = twinkle;
                        ctx.beginPath();
                        ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    ctx.restore();
                    break;
            }
        }

        // ============================================================
        // ===== 商店系统 =====
        // ============================================================
        function earnGold(amount) {
            gameGold += amount;
        }

        function openShop() {
            if (!enableShop) return;

            // 构建商店基础框架（只构建一次）
            const grid = document.getElementById('shopGrid');
            grid.innerHTML = '';

            // 渲染buff列表
            refreshShopContent();

            document.getElementById('shopScreen').style.display = 'block';
        }

        // ===== 刷新商店内容（更新buff列表+金币显示） =====
        function refreshShopContent() {
            const hd = HERO_DEFS[selectedHeroKey];
            const buffPool = (hd.buffs && hd.buffs.length > 0) ? hd.buffs : buffOptions;

            // 更新标题
            document.getElementById('shopScreen').querySelector('h2').textContent = _t('🏪 商店');
            // 刷新金币显示
            document.getElementById('shopGoldDisplay').textContent = _t('金币: ') + gameGold;

            // 移除旧的buff按钮
            const grid = document.getElementById('shopGrid');
            const oldBuffs = grid.querySelectorAll('.shop-buff-btn');
            oldBuffs.forEach(b => b.remove());

            // 添加新的buff按钮
            for (const buff of buffPool) {
                let text = buff.text
                    .replace('一技能', hd.skills[0].name)
                    .replace('二技能', hd.skills[1].name)
                    .replace('三技能', hd.skills[2].name);
                const btn = document.createElement('button');
                btn.className = 'shop-buff-btn';
                // 金币不足时按钮置灰
                if (gameGold < 500) {
                    btn.style.opacity = '0.4';
                    btn.style.cursor = 'not-allowed';
                }
                btn.innerHTML = text + '<span class="cost">500💰</span>';
                btn.onclick = function() { buyBuffFromShop(buff); };
                grid.appendChild(btn);
            }
        }

        function buyBuffFromShop(buff) {
            if (gameGold < 500) return;
            gameGold -= 500;

            buff.apply();
            if (hero && hero.alive && hero.hp > hero.maxHp) hero.hp = hero.maxHp;

            // 购买后刷新商店（更新金币+按钮置灰状态）
            refreshShopContent();
            updateStatsDisplay();
        }

        // ============================================================
        // ===== 关闭商店：根据模式分流 =====
        // BossRush → 跳下一Boss波
        // 经典     → 正常推进波次
        // ============================================================
        function closeShop() {
            document.getElementById('shopScreen').style.display = 'none';

            if (selectedMode === 'bossRush') {
                // BossRush+商店模式：商店关闭后跳到下一个Boss波，不做正常波次推进
                showingBuff = false;
                bossUpgradeTriggered = false;
                bossDeathFxTriggered = false;
                bossRushNextBoss();
                return;
            }

            // 经典模式：正常推进波次
            showingBuff = false;
            if (wave % 3 === 0) {
                enemyBaseHp += (wave >= 72 ? 1000 : wave === 69 ? 200 : wave === 51 ? 600 : wave === 42 ? 500 : wave === 30 ? 300 : wave >= 21 ? 200 : wave >= 9 ? 150 : 100);
                enemyBaseAttack += 3;
            }
            if (wave >= 40) enemyCount += 5;
            else if (wave >= 25) enemyCount += 3;
            else if (wave >= 15) enemyCount += 2;
            else enemyCount++;
            spawnWave();
        }

        // ============================================================
        // ===== Boss Rush 模式 =====
        // ============================================================
        function bossRushStart() {
            // BossRush模式：开打前先给1次5波奖励（金币）
            // wave=0 表示还未进入第一个Boss波，等商店关闭后由 bossRushNextBoss 推进到 wave=5
            wave = 0;
            enemyCount = 8;
            enemyBaseHp = 50;
            enemyBaseAttack = 10;
            // 初始金币：5波份，用 earnGold 确保双角色等模式能吃倍数
            for (let w = 0; w < 5; w++) earnGold(450);
            // 不 spawnWave，等商店关闭后由 bossRushNextBoss 推进到第一个Boss（wave=5）
        }

        function bossRushNextBoss() {
            // Boss Rush：跳到下一个5的倍数波
            // checkWave已将wave+1（如5→6），需向上取整到下一个5的倍数（6→10, 11→15）
            const nextWave = Math.floor(wave / 5) * 5 + 5;
            wave = nextWave;
            enemyCount = 8 + Math.floor(nextWave / 10);

            // 精确同步经典模式的 HP/攻击（模拟从 wave=0 到 target wave 的逐波推进）
            enemyBaseHp = 50;
            enemyBaseAttack = 10;
            for (let w = 3; w <= nextWave; w += 3) {
                let hpInc = 100;
                if (w >= 72) hpInc = 1000;
                else if (w === 69) hpInc = 200;
                else if (w === 51) hpInc = 600;
                else if (w === 42) hpInc = 500;
                else if (w === 30) hpInc = 300;
                else if (w >= 21) hpInc = 200;
                else if (w >= 9) hpInc = 150;
                enemyBaseHp += hpInc;
                enemyBaseAttack += 3;
            }
            spawnWave();
        }

        function bossRushBatchSelect(buff) {
            document.getElementById('buffScreen').style.display = 'none';
            buff.apply();
            if (hero && hero.alive && hero.hp > hero.maxHp) hero.hp = hero.maxHp;
            bossRushBatchRewards--;
            updateStatsDisplay();

            if (bossRushBatchRewards > 0) {
                // 还有剩余奖励次数，继续显示选择
                showBuffSelection();
            } else {
                // 所有奖励选完
                showingBuff = false;
                bossUpgradeTriggered = false;
                bossDeathFxTriggered = false;
                // BossRush 打完后给 5 波金币（用 earnGold 确保公平）
                for (let i = 0; i < 5; i++) earnGold(450);
                if (enableShop) {
                    openShop();
                } else {
                    bossRushNextBoss();
                }
            }
        }

        // ============================================================
        // ===== 神器选择界面 =====
        // ============================================================
        function showArtifactScreen() {
            const grid = document.getElementById('artifactGrid');
            grid.innerHTML = '';
            for (const key in ARTIFACT_DEFS) {
                const a = ARTIFACT_DEFS[key];
                const card = document.createElement('div');
                card.className = 'artifact-card';
                card.innerHTML = '<div class="artifact-icon">' + a.icon + '</div><div class="artifact-name">' + a.name + '</div><div class="artifact-desc">' + a.desc + '</div>';
                card.onclick = function() { selectArtifactAndStart(key); };
                grid.appendChild(card);
            }
            document.getElementById('artifactScreen').style.display = 'flex';
        }

        function selectArtifactAndStart(key) {
            selectedArtifactKey = key;
            document.getElementById('artifactScreen').style.display = 'none';
            // 继续执行startGame流程
            proceedStartGame();
        }

        // ============================================================
        // ===== 模式面板渲染 =====
        // ============================================================
        // 兼容旧调用：等同于 updateNavButtons（步骤式UI）
        function updateStartBtn() { updateNavButtons(); }

        const buffOptions = [
            { id: 'hp', text: _t('最大生命加200'), apply: () => { stats.hp += 200; hero.maxHp += 200; hero.hp += 200; } },
            { id: 'attack', text: _t('普通攻击加100'), apply: () => { stats.attack += 100; } },
            { id: 'skill1', text: _t('一技能伤害加40'), apply: () => { stats.skill1 += 40; } },
            { id: 'skill2', text: _t('二技能伤害加4'), apply: () => { stats.skill2 += 4; } },
            { id: 'skill3', text: _t('三技能伤害加70'), apply: () => { stats.skill3 += 70; } },
            { id: 'crit', text: _t('暴击率提升10%'), apply: () => { addCritRate(0.1); } },
            { id: 'heal', text: _t('回满血'), apply: () => { hero.hp = hero.maxHp; } }
        ];
        let critRate = 0.2;
        let critDmgMult = 1.5;
        // ===== 伤害增加/伤害减免机制：百分比独立乘区，初始0%，仅通过掉落小球获得，每次+2% =====
        // 伤害增加：英雄造成的最终伤害 × (1 + heroDamageBonus)，无上限
        let heroDamageBonus = 0;       // 伤害增加（0=0%，1=100%，无上限）
        // 伤害减免：英雄受到的最终伤害 × (1 - heroDamageReduction)，最高95%（0.95），超出部分1:1转为伤害增加
        let heroDamageReduction = 0;   // 伤害减免（0=0%，上限0.95=95%）
        let currentHero = 'lubu';  // 当前选择的英雄key

        // ============================================================
        // ===== 新模式系统全局变量 =====
        // ============================================================
        // 模式选择
        let selectedMode = 'classic';        // 'classic' | 'bossRush' | 'curseNight'
        let enableWeather = false;           // 加入制：天气开关
        let enableShop = false;              // 加入制：商店开关
        let enableArtifact = false;          // 加入制：神器开局开关
        let selectedArtifactKey = null;      // 选中的神器ID
        let gameGold = 0;                    // 当前金币

        // Boss Rush模式
        let bossRushBatchRewards = 0;        // 批量奖励剩余次数（每波5次）
        let bossRushNeedSelect = false;      // 是否需要选批量奖励

        // 诅咒之夜模式
        let curseNightMode = false;          // 诅咒之夜模式开关
        let curseNightWeatherTimer = 0;      // 诅咒之夜天气切换计时器（每30秒=1800帧）
        let curseNightWeatherIndex = 0;      // 当前诅咒天气索引（0雷电1诅咒2疯狂）
        const CURSED_WEATHER_DEFS = [
            { id: 'thunder', name: _t('天罚雷电'), icon: '⚡', color: '#ffaa00',
              heroEffect: _t('增伤+15%，每秒流失2%HP'), enemyEffect: _t('攻击+15%'), type: 'hybrid' },
            { id: 'curse',    name: _t('诅咒弥漫'), icon: '☠️', color: '#aa44ff',
              heroEffect: _t('移速+20%'), enemyEffect: _t('攻击+50%，移速+20%'), type: 'enemy_buff' },
            { id: 'madness', name: _t('猩红疯狂'), icon: '🩸', color: '#ff0040',
              heroEffect: _t('无'), enemyEffect: _t('血量+50%，攻击+50%'), type: 'enemy_buff' }
        ];

        // 疯狂之夜模式（独立难度，与诅咒之夜互斥）
        let madnessNightMode = false;          // 疯狂之夜模式开关
        let madnessNightWeatherTimer = 0;      // 疯狂之夜天气切换计时器
        let madnessNightWeatherIndex = 0;      // 当前疯狂天气索引（0雷电1疯狂弥漫2猩红疯狂）
        let madnessBossHpDrainFrame = 0;       // 疯狂之夜Boss血量流失计时器（每60帧=1秒对所有Boss扣0.5%最大HP）
        // 疯狂之夜专属天气定义（3种，每波自动切换，不重复当前天气）
        // 注意：m_spread 和 m_rampage 是独立天气ID，避免与诅咒之夜的 'curse'/'madness' 效果冲突
        const MADNESS_WEATHER_DEFS = [
            { id: 'thunder',   name: _t('天罚雷电'), icon: '⚡', color: '#ffaa00',
              heroEffect: _t('增伤+15%，每秒流失2%HP'), enemyEffect: _t('攻击+15%'), type: 'hybrid' },
            { id: 'm_spread',  name: _t('疯狂弥漫'), icon: '🔮', color: '#ff8800',
              heroEffect: _t('移速+40%'), enemyEffect: _t('攻击+50%，移速+40%'), type: 'enemy_buff' },
            { id: 'm_rampage', name: _t('猩红疯狂'), icon: '🩸', color: '#ff0040',
              heroEffect: _t('移速+20%'), enemyEffect: _t('血量+50%，攻击+50%，移速+20%'), type: 'enemy_buff' }
        ];

        // 天气系统
        let currentWeather = 'sunny';
        let lightningFlash = 0;              // 雷电屏幕白闪计时器
        let weatherParticles = [];
        let madnessBloodRainTimer = 0;       // 疯狂天气血雨tick计时

        // 神器生效标记
        let artifactPhantomCloakActive = false;  // 幻影斗篷：移动留下残影
        let artifactSkillCastCount = 0;          // 共鸣之石：技能释放计数
        let artifactShadowCloneTimer = 0;        // 影之分身：计时器
        let artifactDoomMarkTarget = null;       // 审判之眼：标记目标
        let artifactDoomMarkTimer = 0;           // 审判之眼：倒计时

        // ===== 神器定义（12个机制级神器） =====
        const ARTIFACT_DEFS = {
            timeSand: {
                name: _t('时之沙漏'),
                icon: '⏳',
                desc: _t('所有技能CD减少25%'),
                apply: function() {
                    for (let i = 1; i < 4; i++) {
                        let baseCd = skillMaxCooldown[i];
                        if (!baseCd || baseCd === 0) {
                            const hd = HERO_DEFS[currentHero];
                            baseCd = hd.skills[i-1] ? hd.skills[i-1].cd : skillMaxCooldown[i];
                        }
                        skillMaxCooldown[i] = Math.floor(baseCd * 0.75);
                        skillCooldown[i] = Math.min(skillCooldown[i], skillMaxCooldown[i]);
                    }
                }
            },
            thornArmor: {
                name: _t('荆棘之甲'),
                icon: '🛡️',
                desc: _t('受到伤害时反弹15%给周围所有敌人'),
                apply: function() { }
            },
            undyingHeart: {
                name: _t('不灭之心'),
                icon: '❤️',
                desc: _t('首次阵亡时满血复活'),
                apply: function() { }
            },
            phantomCloak: {
                name: _t('幻影斗篷'),
                icon: '👻',
                desc: _t('移动时15%概率留下持续2秒的残影分身'),
                apply: function() { artifactPhantomCloakActive = true; }
            },
            bloodFang: {
                name: _t('嗜血之牙'),
                icon: '🦷',
                desc: _t('普攻和技能回复造成伤害的10%生命'),
                apply: function() { }
            },
            resonanceStone: {
                name: _t('共鸣之石'),
                icon: '💎',
                desc: _t('每释放3次技能，下一个技能无CD'),
                apply: function() { artifactSkillCastCount = 0; }
            },
            thunderTouch: {
                name: _t('雷电之触'),
                icon: '⚡',
                desc: _t('普攻25%概率触发连锁闪电（最多4目标）'),
                apply: function() { }
            },
            windBoots: {
                name: _t('疾风之靴'),
                icon: '👢',
                desc: _t('移速+25%'),
                apply: function() { }
            },
            ironWill: {
                name: _t('不屈之盾'),
                icon: '🛡️',
                desc: _t('开局获得35%伤害减免'),
                apply: function() { heroDamageReduction = Math.min(0.95, heroDamageReduction + 0.35); }
            },
            shadowClone: {
                name: _t('影之分身'),
                icon: '👥',
                desc: _t('每10秒召唤一个分身持续4秒'),
                apply: function() { artifactShadowCloneTimer = 600; }
            },
            doomMark: {
                name: _t('审判之眼'),
                icon: '👁️',
                desc: _t('每15秒标记最近敌人，对其伤害翻倍'),
                apply: function() { artifactDoomMarkTimer = 900; }
            },
            luckyCoin: {
                name: _t('幸运硬币'),
                icon: '🪙',
                desc: _t('暴击率+12%，拾取掉落物时10%概率双倍效果'),
                apply: function() { addCritRate(0.12); }
            }
        };

        // ===== 天气类型定义 =====
        const WEATHER_DEFS = [
            { id: 'sunny', name: _t('晴天'), icon: '☀️', color: '#ffcc00',
              heroEffect: _t('无'), enemyEffect: _t('无'), type: 'neutral' },
            { id: 'rain', name: _t('雨天'), icon: '🌧️', color: '#4488ff',
              heroEffect: _t('移速+15%，暴击率-10%'), enemyEffect: _t('移速+15%'), type: 'hero_debuff' },
            { id: 'thunder', name: _t('雷电'), icon: '⚡', color: '#ffaa00',
              heroEffect: _t('增伤+15%，每秒流失2%HP'), enemyEffect: _t('攻击+15%'), type: 'hybrid' },
            { id: 'snow', name: _t('暴雪'), icon: '❄️', color: '#aaddff',
              heroEffect: _t('移速-10%，免伤+15%'), enemyEffect: _t('移速-10%'), type: 'neutral' },
            { id: 'heat', name: _t('炎夏'), icon: '🔥', color: '#ff4422',
              heroEffect: _t('增伤+15%，生命上限-20%'), enemyEffect: _t('攻击+20%'), type: 'hybrid' },
            { id: 'fog', name: _t('迷雾'), icon: '🌫️', color: '#888888',
              heroEffect: _t('视野-50%'), enemyEffect: _t('无'), type: 'hero_debuff' },
            { id: 'storm', name: _t('风暴'), icon: '🌪️', color: '#66ccaa',
              heroEffect: _t('移速+30%'), enemyEffect: _t('移速+20%，攻击+10%'), type: 'enemy_buff' },
            { id: 'moon', name: _t('月夜'), icon: '🌙', color: '#8866cc',
              heroEffect: _t('暴击率+25%，攻击+10%'), enemyEffect: _t('无'), type: 'hero_buff' }
        ];

        // ===== 天气效果追踪变量（用于天气结束时精确移除效果） =====
        let weatherSpeedMult = 1.0;          // hero速度倍率 (storm=1.30, rain=1.15, snow=0.90)
        let weatherCritBoost = 0;            // hero暴击率增加量 (moon=0.25)
        let weatherCritOverflow = 0;         // 暴击溢出转爆伤的量 (moon可能触发)
        let weatherCritPenalty = 0;          // hero暴击率惩罚量 (rain=0.10)
        let weatherDmgBonus = 0;             // hero伤害增加 (thunder=0.15, heat=0.15, moon=0.10)
        let weatherDmgReduct = 0;            // hero伤害减免 (snow=0.15)
        let weatherHpReduceAmount = 0;       // hero血量上限降低值 (heat=20%)
        let weatherEnemySpeedMult = 1.0;     // 敌人速度倍率 (rain=1.15, snow=0.90, storm=1.20)
        let weatherEnemyAtkBoost = 0;        // 敌人攻击增强比例 (thunder=0.15, heat=0.20, storm=0.10)
        let weatherHpDrain = false;          // 每秒流失HP (thunder)
        let weatherFogActive = false;        // 迷雾激活 (fog)
        let weatherDrainFrame = 0;           // HP流失帧计数

        // ===== 暴击溢出机制：暴击率达100%后，溢出部分×1.5转为暴击伤害 =====
        // ===== 移除当前天气所有效果 =====
        function removeWeatherEffects() {
            // --- 英雄侧 ---
            weatherSpeedMult = 1.0; // 速度重置

            // 伤害加成：从heroDamageBonus中减去
            heroDamageBonus -= weatherDmgBonus;
            weatherDmgBonus = 0;

            // 伤害减免：从heroDamageReduction中减去
            heroDamageReduction = Math.max(0, heroDamageReduction - weatherDmgReduct);
            weatherDmgReduct = 0;

            // 暴击加成(月夜)：移除加到critRate的和溢出到critDmgMult的
            if (weatherCritBoost > 0) {
                critRate -= weatherCritBoost;
                if (weatherCritOverflow > 0) {
                    critDmgMult -= weatherCritOverflow;
                }
                weatherCritBoost = 0;
                weatherCritOverflow = 0;
            }
            // 暴击惩罚(雨天)：还回去
            if (weatherCritPenalty > 0) {
                critRate += weatherCritPenalty;
                weatherCritPenalty = 0;
            }

            // HP上限恢复(炎夏)
            if (weatherHpReduceAmount > 0) {
                hero.maxHp += weatherHpReduceAmount;
                hero.hp = Math.min(hero.hp, hero.maxHp);
                weatherHpReduceAmount = 0;
            }

            // --- 敌人侧 ---
            weatherEnemySpeedMult = 1.0;
            weatherEnemyAtkBoost = 0;
            weatherHpDrain = false;
            weatherFogActive = false;
            weatherDrainFrame = 0;
            // 双人联机：天气对战友同样失效
            try { if (window.__duo && window.__duo.clearWeatherOnAlly) window.__duo.clearWeatherOnAlly(); } catch (e) {}
        }

        // ===== 应用新天气效果 =====
        function applyNewWeather(w) {
            switch (w.id) {
                case 'sunny':
                    // 晴天：无任何效果
                    break;
                case 'rain':
                    weatherSpeedMult = 1.15;              // 英雄移速+15%
                    weatherCritPenalty = 0.10;            // 暴击率-10%
                    critRate = Math.max(0, critRate - 0.10);
                    weatherEnemySpeedMult = 1.15;         // 敌人移速+15%
                    break;
                case 'thunder':
                    weatherDmgBonus = 0.15;               // 英雄增伤+15%
                    heroDamageBonus += 0.15;
                    weatherHpDrain = true;                 // 每秒流失2%HP
                    weatherEnemyAtkBoost = 0.15;           // 敌人攻击+15%
                    break;
                case 'curse':
                    // 诅咒天气：我方移速+20%，敌方攻击+50%、移速+20%
                    weatherSpeedMult = 1.20;
                    weatherEnemySpeedMult = 1.20;
                    weatherEnemyAtkBoost = 0.50;
                    break;
                case 'madness':
                    // 诅咒之夜·猩红疯狂：敌方血量+50%、攻击+50%（血量在当前所有小怪/Boss生成后实时生效）
                    weatherEnemyAtkBoost = 0.50;
                    break;
                case 'm_spread':
                    // 疯狂之夜·疯狂弥漫：英雄移速+40%，敌方攻击+50%、移速+40%
                    weatherSpeedMult = 1.40;
                    weatherEnemySpeedMult = 1.40;
                    weatherEnemyAtkBoost = 0.50;
                    break;
                case 'm_rampage':
                    // 疯狂之夜·猩红疯狂：英雄移速+20%，敌方血量+50%（Enemy/Boss构造函数实时生效）、攻击+50%、移速+20%
                    weatherSpeedMult = 1.20;
                    weatherEnemySpeedMult = 1.20;
                    weatherEnemyAtkBoost = 0.50;
                    break;
                case 'snow':
                    weatherSpeedMult = 0.90;              // 英雄移速-10%
                    weatherDmgReduct = 0.15;              // 英雄免伤+15%
                    heroDamageReduction = Math.min(0.95, heroDamageReduction + 0.15);
                    weatherEnemySpeedMult = 0.90;         // 敌人移速-10%
                    break;
                case 'heat':
                    weatherDmgBonus = 0.15;               // 英雄增伤+15%
                    heroDamageBonus += 0.15;
                    weatherHpReduceAmount = Math.floor(hero.maxHp * 0.20); // HP上限-20%
                    hero.maxHp = Math.max(50, hero.maxHp - weatherHpReduceAmount);
                    hero.hp = Math.min(hero.hp, hero.maxHp);
                    weatherEnemyAtkBoost = 0.20;           // 敌人攻击+20%
                    break;
                case 'fog':
                    weatherFogActive = true;               // 视野-50%
                    break;
                case 'storm':
                    weatherSpeedMult = 1.30;              // 英雄移速+30%
                    weatherEnemySpeedMult = 1.20;         // 敌人移速+20%
                    weatherEnemyAtkBoost = 0.10;           // 敌人攻击+10%
                    break;
                case 'moon':
                    // 暴击率+25%（含溢出机制：溢出部分转爆伤）
                    if (critRate >= 1.0) {
                        weatherCritOverflow = 0.25 * 1.5;
                        critDmgMult += weatherCritOverflow;
                        weatherCritBoost = 0;
                    } else if (critRate + 0.25 > 1.0) {
                        const ov = critRate + 0.25 - 1.0;
                        weatherCritBoost = 0.25 - ov;
                        weatherCritOverflow = ov * 1.5;
                        critRate = 1.0;
                        critDmgMult += weatherCritOverflow;
                    } else {
                        weatherCritBoost = 0.25;
                        critRate += 0.25;
                    }
                    // 攻击+10%
                    weatherDmgBonus = 0.10;
                    heroDamageBonus += 0.10;
                    break;
            }
            // 双人联机：同一份天气也作用到战友身上
            try { if (window.__duo && window.__duo.applyWeatherToAlly) window.__duo.applyWeatherToAlly(w.id); } catch (e) {}
        }

        function addCritRate(amount) {
            if (critRate >= 1.0) {
                critDmgMult += amount * 1.5;
            } else if (critRate + amount > 1.0) {
                const overflow = critRate + amount - 1.0;
                critRate = 1.0;
                critDmgMult += overflow * 1.5;
            } else {
                critRate += amount;
            }
        }

        // ===== 陆逊燃烧机制核心函数：叠层 → 正在燃烧层 转换 =====
        // 设计逻辑（按用户规范）：
        //   1) 叠层（yanBurnStackLayers）：永久记录，不随时间消失，不造成伤害，无视觉特效
        //   2) 每满 5 层 → 转换为 1 个"正在燃烧层"对象 push 进 e.yanActiveBurns 数组
        //   3) 每个"正在燃烧层"对象独立计时（3秒=180帧），每秒（30帧）造成 (30 + enhYanBurnDmg) 伤害
        //   4) 时间到后该层独立消失，互不影响
        //   5) 任意时刻只要 e.yanActiveBurns.length > 0，敌人身上显示"燃烧"小字（不管几层）
        function addYanBurnStacks(e, count) {
            if (!e || !e.alive) return;
            // 安全初始化（兼容已存在的敌人对象）
            if (e.yanBurnStackLayers === undefined) e.yanBurnStackLayers = 0;
            if (!Array.isArray(e.yanActiveBurns)) e.yanActiveBurns = [];
            // 累加叠层
            e.yanBurnStackLayers += count;
            // 每 5 层转换为 1 个正在燃烧层（用 while 防止一次性叠多层）
            while (e.yanBurnStackLayers >= 5) {
                e.yanBurnStackLayers -= 5;
                // 每个正在燃烧层独立 180 帧（3秒），到时独立消失
                e.yanActiveBurns.push({ timer: 180, tick: 0 });
            }
        }

        // ===== 甄姬寒冰机制核心函数：叠层 → 冻结 转换 =====
        // 设计逻辑（按用户规范）：
        //   1) 寒冰叠层（shuangColdStacks）：永久记录，不随时间消失，不造成伤害
        //   2) 冻结期间（shuangFreezeTimer > 0）不可继续叠层（直接 return）
        //   3) 每满 5 层 → 立即冻结 2 秒（120帧），叠层归零
        //   4) 冻结解除后，从 0 开始可继续叠层
        function addShuangColdStacks(e, count) {
            if (!e || !e.alive) return;
            // 冻结期间不可继续叠层
            if (e.shuangFreezeTimer === undefined) e.shuangFreezeTimer = 0;
            if (e.shuangFreezeTimer > 0) return;
            if (e.shuangColdStacks === undefined) e.shuangColdStacks = 0;
            e.shuangColdStacks += count;
            // 满 5 层立即冻结 2 秒（120帧），叠层归零
            if (e.shuangColdStacks >= 5) {
                e.shuangFreezeTimer = 120; // 2秒冻结
                e.shuangColdStacks = 0;
                // 冻结触发特效：冰晶爆发光环 + 冻结飘字
                particles.push({ type: 'ringExpand', x: e.x, y: e.y, color: '#ffffff', maxRadius: 90, life: 30, maxLife: 30 });
                particles.push({ type: 'ringExpand', x: e.x, y: e.y, color: '#00BFFF', maxRadius: 70, life: 25, maxLife: 25 });
                particles.push({ type: 'shockExplosion', x: e.x, y: e.y, color: '#87CEEB', maxRadius: 75, life: 24, maxLife: 24 });
                // 12个冰晶碎片向四周飞溅
                for (let i = 0; i < 12; i++) {
                    const a = (i / 12) * Math.PI * 2 + Math.random() * 0.3;
                    const sp = 2 + Math.random() * 4;
                    particles.push({
                        type: 'hit', x: e.x, y: e.y,
                        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                        life: 30, maxLife: 30, color: i % 2 === 0 ? '#00BFFF' : '#ffffff', size: 5
                    });
                }
                showDamage(e.x, e.y - e.radius - 10, _t('冻结'), '#00BFFF');
            }
        }

        // ===== 新增：通用伤害处理辅助函数 =====
        function dealDamage(e, baseDmg, color, particleCount = 8) {
            if (!e || !e.alive) return;
            // 劫阶段切换无敌：2秒交接护盾期间免疫伤害，让"变身"仪式安全落地
            if (e.isJieBoss && e.jieInvuln > 0) {
                showDamage(e.x, e.y, _t('无敌'), '#ffd34d');
                if (Math.random() < 0.3) spawnHitParticles(e.x, e.y, '#ffd34d', 3);
                return;
            }
            // 妄瞳闭眼状态无敌
            if (e.isMadEye && !e.eyeOpen) {
                // 显示无敌文字（紫色）
                showDamage(e.x, e.y, _t('无敌'), '#aa00ff');
                spawnHitParticles(e.x, e.y, '#660066', 4);
                return;
            }
            const r = calcDamage(baseDmg);
            // ===== 审判之眼神器：标记目标伤害翻倍 =====
            if (artifactDoomMarkTarget && artifactDoomMarkTarget === e) {
                r.dmg = Math.floor(r.dmg * 2);
            }
            e.hp -= r.dmg;
            e.flashTime = 5;
            if (r.isCrit) showCritDamage(e.x, e.y, r.dmg, color);
            else showDamage(e.x, e.y, r.dmg, color);
            spawnHitParticles(e.x, e.y, color, particleCount);

            // ===== 嗜血之牙神器：普攻和技能回复10%伤害生命 =====
            if (selectedArtifactKey === 'bloodFang' && hero && hero.alive) {
                hero.hp = Math.min(hero.maxHp, hero.hp + Math.floor(r.dmg * 0.1));
            }

            // ===== 雷电之触神器：普攻25%概率连锁闪电（最多4目标） =====
            if (selectedArtifactKey === 'thunderTouch' && Math.random() < 0.25) {
                let chainTargets = [];
                for (const en of enemies) {
                    if (!en.alive || en === e) continue;
                    const d = Math.hypot(en.x - e.x, en.y - e.y);
                    if (d < 600) chainTargets.push({ en, d });
                }
                chainTargets.sort((a, b) => a.d - b.d);
                for (let i = 0; i < Math.min(4, chainTargets.length); i++) {
                    const t = chainTargets[i].en;
                    const cdmg = Math.floor(r.dmg * 0.6);
                    t.hp -= cdmg; t.flashTime = 5;
                    showDamage(t.x, t.y, cdmg, '#ffff00');
                    spawnHitParticles(t.x, t.y, '#ffff00', 4);
                    particles.push({ type: 'beam', x: e.x, y: e.y, dx: (t.x - e.x) / chainTargets[i].d, dy: (t.y - e.y) / chainTargets[i].d, length: chainTargets[i].d, color: '#ffff00', life: 15, maxLife: 15 });
                    if (t.hp <= 0) {
                        t.alive = false; totalKills++;
                        spawnDeathExplosion(t.x, t.y, t.color, t.isBoss);
                        maybeDropPickup(t.x, t.y, t.isBoss);
                    }
                }
            }

            if (e.hp <= 0) {
                e.alive = false;
                totalKills++;
                addCombo();
                spawnDeathExplosion(e.x, e.y, e.color, e.isBoss);
                // 劫的掉落由 JieBoss.dropRewards 统一处理（10-20个数值小球），跳过通用单球掉落
                if (!e.isJie) maybeDropPickup(e.x, e.y, e.isBoss);

                // ===== 王Boss分裂机制：1→2→4→8 最多3次分裂，每次HP-50% =====
                if (e.type === 'boss' && e.splitCount < 3) {
                    // 立即在原位置分裂为2个（HP再-50%）
                    const newHp = (e.maxHp * 0.5) / 2;  // 每个新个体HP是原maxHp的25%（分裂后还要再分裂时每次-50%）
                    const splitCount = e.splitCount + 1;
                    // 创建2个分裂体
                    for (let i = 0; i < 2; i++) {
                        const offX = (i === 0 ? -1 : 1) * 35;
                        const offY = (Math.random() - 0.5) * 20;
                        const child = new Enemy(e.x + offX, e.y + offY, 'boss');
                        child.hp = newHp;
                        child.maxHp = newHp;
                        child.splitCount = splitCount;
                        child.canSplit = splitCount < 3;
                        child.kingFamily = e.kingFamily || Date.now() + Math.random();  // 同一家族共享大血条
                        child.radius = Math.max(28, e.radius * 0.8);
                        // 分裂特效
                        for (let p = 0; p < 20; p++) {
                            particles.push({
                                x: e.x + offX, y: e.y + offY,
                                vx: (Math.random()-0.5) * 8,
                                vy: (Math.random()-0.5) * 8,
                                life: 30, maxLife: 30,
                                color: '#ff0066', size: 4
                            });
                        }
                        enemies.push(child);
                        bossRefs.push(child);
                    }
                    return;  // 不播放正常死亡特效（分裂时已播放）
                }

                if (e.isBoss) {
                    if (e.isEmperor) {
                        const otherBossAlive = bossRefs.some(b => b !== e && b.alive);
                        if (!otherBossAlive) {
                            spawnEmperorDeathEffect(e.x, e.y, e.color);
                        }
                    }
                    const anyBossAlive = bossRefs.some(b => b !== e && b.alive) ||
                                         abyssLords.some(b => b !== e && b.alive) ||
                                         bladeMasters.some(b => b !== e && b.alive) ||
                                         madEyes.some(b => b !== e && b.alive) ||
                                         youBosses.some(b => b !== e && b.alive);
                    // 王分裂体/其他非帝君Boss可能多次死亡，只有最后一个Boss死时执行肉鸽升级相关的全局效果
                    if (!anyBossAlive && !bossDeathFxTriggered) {
                        bossDeathFxTriggered = true;
                        bossAlive = false;
                        bossDeathDelay = 150;
                        // 慢动作+屏幕震动只对最后一个Boss生效（避免王分裂体依次死亡时连续触发多次）
                        if (!e.isEmperor) { triggerSlowMo(120); triggerShake(true); }
                    }
                }
            }
        }

        // ===== 新增：英雄受击辅助函数（含张飞护盾优先扣除） =====
        // 双人联机：第 4 个参数是“这次打到谁”。敌人/Boss 的索敌影子会传队友进来；
        // 不传或队友不存在时仍然打主角，单人逻辑完全不变。
        function heroAttackedBy(attacker, dmg, color, target) {
            const h = target || hero;
            // 防御性：目标未初始化时不执行
            if (!h) return;
            // 无敌时不扣血
            if (h.invincibleTime > 0) return;

            // 天气敌人攻击增强（诅咒之夜/疯狂之夜专属天气同样生效）
            if ((enableWeather || curseNightMode || madnessNightMode) && weatherEnemyAtkBoost > 0) {
                dmg = Math.floor(dmg * (1 + weatherEnemyAtkBoost));
            }

            // 伤害减免独立乘区（最高95%，含天气免伤），在护盾吸收之前应用
            // 双人联机：减伤也是各人一份，队友走自己的 damageReduction
            const tReduct = (h === hero) ? heroDamageReduction : (Number(h.damageReduction) || 0);
            let remainDmg = dmg * (1 - Math.min(0.95, tReduct));
            // 优先扣护盾
            if (h.shield > 0) {
                const shieldAbsorb = Math.min(h.shield, remainDmg);
                h.shield -= shieldAbsorb;
                remainDmg -= shieldAbsorb;
                showDamage(h.x, h.y - 15, shieldAbsorb, '#ffdd44');
            }
            // 剩余伤害扣血
            if (remainDmg > 0) {
                h.hp -= remainDmg;
                showDamage(h.x, h.y, remainDmg, color);
                triggerShake(false);

                // ===== 荆棘之甲神器：受到伤害时反弹15%给周围敌人 =====
                const tArtifact = (h === hero) ? selectedArtifactKey : (h.artifact || null);
                if (tArtifact === 'thornArmor') {
                    const reboundDmg = Math.floor(dmg * 0.15);
                    for (const en of enemies) {
                        if (!en.alive) continue;
                        const d = Math.hypot(en.x - h.x, en.y - h.y);
                        if (d < 200) {
                            en.hp -= reboundDmg; en.flashTime = 5;
                            showDamage(en.x, en.y, reboundDmg, '#884400');
                            if (en.hp <= 0) {
                                en.alive = false; totalKills++;
                                spawnDeathExplosion(en.x, en.y, en.color, en.isBoss);
                                maybeDropPickup(en.x, en.y, en.isBoss);
                            }
                        }
                    }
                }

                // ===== 疾风之靴神器：已移除无敌效果（仅保留移速+25%） =====
            }
        }

        // ===== 双人联机：大范围 AOE 同时判定两个玩家 =====
        // 单人时 coopPlayerList 只有主角，行为和原来完全一致。
        function coopPlayerList() {
            const list = [];
            try { if (typeof hero !== 'undefined' && hero) list.push(hero); } catch (e) {}
            try { const a = window.__coopHero2; if (a && a !== hero) list.push(a); } catch (e) {}
            return list;
        }
        // 圆形 AOE：以 (x,y) 为圆心、radius 为半径，两人分别判定
        function coopHitCircle(attacker, dmg, color, x, y, radius) {
            let hits = 0;
            for (const t of coopPlayerList()) {
                if (!t || !t.alive) continue;
                if (Math.hypot(t.x - x, t.y - y) <= radius + (t.radius || 0)) {
                    heroAttackedBy(attacker, dmg, color, t);
                    hits++;
                }
            }
            return hits;
        }

        // ============================================================
