// ============================================================
// 文件: src/heroes.js
// 描述: HERO_DEFS 英雄定义
// 行范围: 1562-4463 (原 game.js)
// 注意: 本文件由原版 HTML 抽取，保持原作用域不变
// ============================================================

        // ===== 中英文翻译词条（英文模式下由 _t() 返回英文，否则返回中文原文） =====
        Object.assign(I18N_DICT, {
            // 英雄名
            '吕布': 'Lü Bu', '赵云': 'Zhao Yun', '貂蝉': 'Diao Chan', '关羽': 'Guan Yu',
            '黄忠': 'Huang Zhong', '马超': 'Ma Chao', '诸葛亮': 'Zhuge Liang', '张飞': 'Zhang Fei',
            '周瑜': 'Zhou Yu', '吕蒙': 'Lu Meng', '墨子': 'Mo Zi', '韩非': 'Han Fei',
            '司马懿': 'Sima Yi', '典韦': 'Dian Wei', '鲁肃': 'Lu Su', '左慈': 'Zuo Ci',
            '陆逊': 'Lu Xun', '甄姬': 'Zhen Ji', '于吉': 'Yu Ji', '黄盖': 'Huang Gai',
            // 分身/幻影标签
            '影': 'Shadow',
            // 称号
            '飞将 · 力量爆发': 'Flying General · Power Burst',
            '龙胆 · 敏捷机动': 'Dragon Lance · Swift & Agile',
            '倾国 · 法术控制': 'Peerless Beauty · Spell Control',
            '武圣 · 普攻强化': 'Martial Saint · Attack Buff',
            '神射 · 远程射手': 'Divine Archer · Ranged Marksman',
            '锦马 · 闪电突击': 'Brocade Horse · Lightning Assault',
            '卧龙 · 远程法师': 'Sleeping Dragon · Ranged Mage',
            '燕人 · 重装坦克': 'Yan Man · Heavy Tank',
            '火神 · 烈焰机动': 'Fire God · Blazing Mobility',
            '白衣 · 单杀之刃': 'Plain Robe · Single-Target Blade',
            '光学 · 镜面之主': 'Optic · Mirror Master',
            '法家 · 律令裁决': 'Legalist · Law & Judgment',
            '天空之主 · 风雷掌控': 'Lord of the Sky · Wind & Thunder',
            '灰烬武者 · 牺牲觉醒': 'Ashen Warrior · Sacrifice Awakening',
            '水之法师 · 潮汐护盾': 'Water Mage · Tidal Shield',
            '时空织者 · 维度操控': 'Time Weaver · Dimensional Control',
            '烈焰之心 · 永不熄灭': 'Blazing Heart · Never Dying',
            '寒冰女皇 · 冰封万里': 'Ice Empress · Freeze Ten Thousand Miles',
            '荆棘领主 · 丛林之主': 'Thorn Lord · Jungle Master',
            '水晶主宰 · 棱镜矩阵': 'Crystal Master · Prism Matrix',
            // 技能名
            '无双横扫': 'Peerless Sweep', '霸王护体': 'Overlord Guard', '鬼神突袭': 'Ghost Assault',
            '龙胆突刺': 'Dragon Lance Thrust', '七进七出': 'Seven In, Seven Out', '百鸟朝凤': 'Hundred Birds Bow',
            '魅惑之舞': 'Charming Dance', '百花绽放': 'Hundred Blooms', '月华分身': 'Moonlight Clones',
            '青龙之威': 'Azure Dragon Wrath', '武圣护体': 'Martial Saint Guard', '过五关': 'Through Five Gates',
            '穿云箭': 'Cloud-Piercing Arrow', '百步穿杨': 'Marksman Shot', '箭雨风暴': 'Arrow Rain Storm',
            '雷霆突击': 'Thunder Assault', '西凉铁骑': 'Xiliang Heavy Cavalry', '神威万里': 'Mighty Thunder Chain',
            '神行步': 'Swift Steps', '八卦阵': 'Eight Trigram Array', '观星术': 'Astrology',
            '燕人咆哮': 'Yan Roar', '丈八蛇矛': 'Serpent Spear', '万人敌': 'One vs Ten Thousand',
            '焰冲斩': 'Flame Dash Slash', '炎突斩': 'Blaze Dash Slash', '焚影刺': 'Burning Shadow Stab',
            '疾风步': 'Gale Steps', '暗影突袭': 'Shadow Ambush', '天诛导弹': 'Heaven Strike Missile',
            '光束': 'Beam', '聚束': 'Focus Beam', '多镜面': 'Multi-Mirror',
            '雾隐': 'Fog Veil', '视线替换': 'Vision Swap', '最终审判': 'Final Judgment',
            '旋风斩': 'Whirlwind Slash', '天空之眼': 'Eye of the Sky', '天罚之雷': 'Heavenly Thunder',
            '烬突刺': 'Ember Thrust', '烬燃': 'Ember Ignition', '灰飞烟灭': 'Obliteration',
            '水柱': 'Water Pillar', '潮汐护盾': 'Tidal Shield', '深海怒涛': 'Deep Sea Rage',
            '时空裂隙': 'Time Rift', '时间停滞': 'Time Freeze', '时空崩塌': 'Time Collapse',
            '烈焰冲击': 'Blazing Impact', '焚身烈焰': 'Burning Body Flame', '永不熄灭': 'Eternal Flame',
            '寒冰箭': 'Ice Arrow', '冰封领域': 'Frozen Domain', '极地风暴': 'Polar Storm',
            '荆棘缠绕': 'Thorn Entangle', '寄生藤蔓': 'Parasitic Vines', '自然之怒': 'Nature\'s Wrath',
            '水晶折射': 'Crystal Refraction', '棱镜阵列': 'Prism Array', '棱镜爆发': 'Prism Burst',
            // 技能描述
            '范围AOE伤害': 'AOE damage in an area',
            '反伤': 'Reflect damage',
            '突进贯穿伤害': 'Dash through and damage',
            '直线穿透伤害': 'Straight-line piercing damage',
            '回血40%+短暂无敌': 'Heal 40% + brief invincibility',
            '扇形箭雨': 'Fan-shaped arrow rain',
            '眩晕敌人3秒+伤害': 'Stun enemies 3s + damage',
            '范围毒伤持续6秒': 'Area poison damage for 6s',
            '召唤3分身协助': 'Summon 3 clones to assist',
            '3秒普攻范围4倍': '4x attack range for 3s',
            '3秒无敌': 'Invincible for 3s',
            '3秒普攻翻倍+20%吸血': 'Double attack 3s + 20% lifesteal',
            '远程穿透箭': 'Ranged piercing arrow',
            '定点狙击+溅射': 'Sniper shot + splash',
            '全屏箭雨': 'Full-screen arrow rain',
            '闪电突进': 'Lightning charge',
            '召唤骑兵穿插冲锋': 'Summon cavalry to charge through',
            '全屏闪电链': 'Full-screen lightning chain',
            '加速55%持续3秒': 'Speed +55% for 3s',
            '普攻变范围2.3倍2秒': 'Attack becomes AOE 2.3x for 2s',
            '半径+200%持续3秒': 'Radius +200% for 3s',
            '范围眩晕3秒+伤害': 'Area stun 3s + damage',
            '双向左右喷射贯穿': 'Pierce both directions',
            '生命上限100%护盾3秒': 'Shield equal to max HP for 3s',
            '前方突进贯穿+1秒无敌': 'Dash forward + 1s invincibility',
            '前方突进贯穿+1秒无敌（独立冷却）': 'Dash forward + 1s invincibility (separate cooldown)',
            '移速+60%持续2秒': 'Move speed +60% for 2s',
            '锁定血量最高单体发射导弹': 'Lock on highest-HP enemy and fire missile',
            '自动锁定最近敌人发射激光，可折射1次，折射后是新段可再伤同一敌人': 'Auto-lock nearest enemy, laser can refract once; refracted segment can hit the same enemy again',
            '强化下一次激光：宽度×2': 'Next laser: width x2',
            '强化下一次激光：折射+1次': 'Next laser: +1 refraction',
            '敌方静止3秒，攻击则提前结束': 'Freeze enemies 3s; ends early if you attack',
            '回血30%+加速40% 2秒': 'Heal 30% + speed +40% for 2s',
            '全屏光束审判': 'Full-screen beam judgment',
            '周身210范围旋风AOE+击退敌人': 'Whirlwind AOE in 210 range + knockback',
            '起飞2.1秒21%加速+1.05秒无敌+350范围天雷': 'Fly 2.1s +21% speed, 1.05s invincible, 350-range thunder',
            '490范围雷电风暴2.8秒每0.5秒打击': '490-range lightning storm 2.8s, hits every 0.5s',
            '突进穿透+沿途伤害': 'Dash through + damage along the way',
            '立即进入烬燃3秒（不消耗血）': 'Enter Ember Ignition for 3s (no HP cost)',
            '回复40%血+大爆炸（烬燃状态下伤害翻倍）': 'Heal 40% + big explosion (double damage while ignited)',
            '召唤水柱眩晕1秒+伤害': 'Summon water pillar, stun 1s + damage',
            '护盾180+每秒回5%持续4秒': 'Shield 180 + heal 5%/s for 4s',
            '巨浪600范围单次伤害+减速6秒（非持续伤害）': 'Tidal wave 600-range hit + slow 6s (not DoT)',
            '全图随机传送+原地留下3秒伤害区域': 'Random teleport + leave 3s damage zone',
            '冻结所有敌人3秒': 'Freeze all enemies 3s',
            '500范围单次时空爆炸+减速6秒（非持续伤害）': '500-range time explosion + slow 6s (not DoT)',
            '圆形范围火焰伤害+叠加3层燃烧': 'Circular fire damage + stack 3 burn layers',
            '自身周围150半径3秒火焰护环，每秒50伤害+叠加1层燃烧': '150-radius fire ring 3s, 50 dmg/s + 1 burn layer',
            '全图所有敌人叠加4层燃烧': 'Stack 4 burn layers on all enemies',
            '向前后发射激光+叠加2层寒冰': 'Fire lasers forward/back + stack 2 ice layers',
            '600范围AOE（单次伤害）+叠加3层寒冰+减速3秒': '600-range AOE (single hit) + 3 ice layers + slow 3s',
            '全屏暴风雪8秒，释放瞬间造成单次伤害+叠加4层寒冰': 'Full-screen blizzard 8s, deals one hit + 4 ice layers on cast',
            '普攻伤害翻倍2秒+附加减速30%2秒': 'Double attack damage 2s + slow 30% 2s',
            '链接5个最近敌人+每秒回10%最大HP持续2秒': 'Link 5 nearest enemies, heal 10% max HP/s for 2s',
            '420范围一次伤害200': '420-range single hit dealing 200',
            '强化下次普攻：折射周围2敌人造成普攻×0.42伤害': 'Next attack refracts to 2 nearby enemies at 0.42x damage',
            '召唤5水晶棱镜炮台环绕自身3秒，每炮台独立普攻造成普攻×0.14': 'Summon 5 crystal prisms orbiting 3s, each attacks at 0.14x',
            '需棱镜阵列激活：每个棱镜255范围35伤害+眩晕128范围1.2秒': 'Requires Prism Array: each prism 255-range 35 dmg + 128-range stun 1.2s',
            // 被动
            '风之印记': 'Wind Mark',
            '每释放5次技能获得21%移速加速持续2.1秒': 'Every 5 skills cast: +21% move speed for 2.1s',
            '烬值觉醒': 'Ember Awakening',
            '普攻叠加烬值，满6次自动进入烬燃3秒（攻击+80%、移速+30%、普攻吸血+50%）': 'Attacks build ember; at 6 stacks auto-enter Ember Ignition 3s (Atk +80%, speed +30%, lifesteal +50%)',
            '时空异骸': 'Time Residue',
            '额外获得1次复活机会（首次复活时自动触发）': 'Gain 1 extra revive that triggers automatically',
            '燃烧印记': 'Burn Mark',
            '燃烧叠层永久保留，每5层转换1个独立燃烧层，每秒造成30伤害持续3秒': 'Burn stacks persist; every 5 become an independent burn layer dealing 30 dmg/s for 3s',
            '寒冰印记': 'Ice Mark',
            '命中叠加寒冰，寒冰层永久保留，满5层立即冻结目标2秒；冻结期间不可叠加，解除后从0开始': 'Hits stack ice that persists; at 5 stacks freeze 2s; no stacking while frozen, resets after',
            // skillStats 标签
            '无双横扫伤害': 'Peerless Sweep Damage', '霸王护体反伤': 'Overlord Guard Reflect',
            '鬼神突袭伤害': 'Ghost Assault Damage', '龙胆突刺伤害': 'Dragon Lance Thrust Damage',
            '七进七出回血': 'Seven In Seven Out Heal', '百鸟朝凤伤害': 'Hundred Birds Bow Damage',
            '魅惑之舞伤害': 'Charming Dance Damage', '百花绽放毒伤': 'Hundred Blooms Poison',
            '月华分身伤害': 'Moonlight Clone Damage', '青龙之威范围': 'Azure Dragon Range',
            '武圣护体时长': 'Martial Saint Guard Time', '过五关吸血': 'Through Five Gates Lifesteal',
            '穿云箭伤害': 'Cloud-Piercing Arrow Damage', '百步穿杨伤害': 'Marksman Shot Damage',
            '箭雨风暴伤害': 'Arrow Rain Storm Damage', '雷霆突击伤害': 'Thunder Assault Damage',
            '西凉铁骑伤害': 'Xiliang Cavalry Damage', '神威万里链数': 'Mighty Thunder Chain Count',
            '神行步加速': 'Swift Steps Speed', '八卦阵范围': 'Trigram Array Range', '观星术增径': 'Astrology Radius',
            '燕人咆哮伤害': 'Yan Roar Damage', '丈八蛇矛伤害': 'Serpent Spear Damage', '万人敌护盾': 'One vs Ten Thousand Shield',
            '焰冲斩伤害': 'Flame Dash Slash Damage', '炎突斩伤害': 'Blaze Dash Slash Damage',
            '焚影刺伤害': 'Burning Shadow Stab Damage', '疾风步移速': 'Gale Step Speed',
            '暗影突袭伤害': 'Shadow Ambush Damage', '天诛导弹伤害': 'Heaven Strike Missile Damage',
            '光束伤害': 'Beam Damage', '聚束宽度倍率': 'Focus Beam Width', '多镜面折射': 'Multi-Mirror Refraction',
            '雾隐持续': 'Fog Veil Duration', '视线替换回血': 'Vision Swap Heal', '最终审判伤害': 'Final Judgment Damage',
            '风之印记计数': 'Wind Mark Count', '天空之眼天雷': 'Eye of the Sky Thunder', '天罚之雷伤害': 'Heavenly Thunder Damage',
            '普攻烬值': 'Attack Ember', '烬燃状态': 'Ember State', '灰飞烟灭回血': 'Obliteration Heal', '灰飞烟灭伤害': 'Obliteration Damage',
            '激活': 'Active', '未激活': 'Inactive', '骑': 'Ride', '灰飞烟灭——焚天裂地！': 'Obliteration - Scorched Earth!',
            '潮汐护盾吸收': 'Tidal Shield Absorption', '潮汐护盾每秒回血': 'Tidal Shield Heal/s', '深海怒涛伤害': 'Deep Sea Rage Damage',
            '额外复活机会': 'Extra Revive', '时空裂隙伤害': 'Time Rift Damage', '时空崩塌伤害': 'Time Collapse Damage',
            '焚身烈焰每秒伤害': 'Immolation Flame Dmg/s', '燃烧每层每秒伤害': 'Burn Per Layer Dmg/s', '永不熄灭CD': 'Eternal Flame Cooldown',
            '寒冰层数冻结': 'Ice Stacks to Freeze', '冻结期间不可叠层': 'No Stacking While Frozen', '极地风暴持续': 'Polar Storm Duration',
            '当前藤蔓链接数': 'Current Vine Links', '寄生藤蔓每秒回血': 'Parasitic Vine Heal/s',
            '一技能折射人数': 'Skill 1 Refraction Count', '一技能折射倍率': 'Skill 1 Refraction Multiplier',
            '棱镜炮台倍率': 'Prism Turret Multiplier', '棱镜爆发每棱镜': 'Prism Burst Per Prism',
            // buffs 文案
            '最大生命加299': '+299 Max HP', '普通攻击加299': '+299 Attack', '一技能伤害加120': 'Skill 1 +120 Damage',
            '二技能反伤加12': 'Skill 2 +12 Reflect', '三技能伤害加209': 'Skill 3 +209 Damage',
            '暴击率提升15%': '+15% Crit Rate', '暴击伤害+18%': '+18% Crit Damage', '回满血': 'Full Heal',
            '最大生命加200': '+200 Max HP', '普通攻击加70': '+70 Attack', '一技能伤害加90': 'Skill 1 +90 Damage',
            '二技能回血比例+15%': 'Skill 2 Heal +15%', '三技能伤害加80': 'Skill 3 +80 Damage',
            '暴击率提升10%': '+10% Crit Rate', '暴击伤害+12%': '+12% Crit Damage',
            '最大生命加180': '+180 Max HP', '普通攻击加110': '+110 Attack', '一技能伤害加35': 'Skill 1 +35 Damage',
            '二技能毒伤加9': 'Skill 2 +9 Poison', '三技能伤害加120': 'Skill 3 +120 Damage',
            '月华分身数量+1': '+1 Moonlight Clone', '二技能持续+1.5秒': 'Skill 2 Duration +1.5s',
            '最大生命加250': '+250 Max HP', '普通攻击加120': '+120 Attack', '一技能范围+25%': 'Skill 1 Range +25%',
            '一技能持续+1秒': 'Skill 1 Duration +1s', '三技能吸血+10%': 'Skill 3 Lifesteal +10%',
            '普通攻击加90': '+90 Attack', '一技能伤害加70': 'Skill 1 +70 Damage', '二技能伤害加120': 'Skill 2 +120 Damage',
            '二技能溅射范围+50': 'Skill 2 Splash +50', '三技能伤害加60': 'Skill 3 +60 Damage',
            '一技能伤害加80': 'Skill 1 +80 Damage', '二技能伤害加96': 'Skill 2 +96 Damage', '三技能伤害加100': 'Skill 3 +100 Damage',
            '三技能连锁数+3': 'Skill 3 Chain +3',
            '最大生命加330': '+330 Max HP', '普通攻击加165': '+165 Attack', '神行步加速+7.5%': 'Swift Steps +7.5%',
            '八卦阵范围+0.3倍': 'Trigram Array +0.3x', '观星术半径+60%': 'Astrology Radius +60%',
            '最大生命加280': '+280 Max HP', '普通攻击加100': '+100 Attack', '一技能伤害加60': 'Skill 1 +60 Damage',
            '二技能伤害加180': 'Skill 2 +180 Damage', '万人敌护盾+10%': 'One vs Ten Thousand Shield +10%',
            '焰冲斩伤害+400': 'Flame Dash Slash +400', '炎突斩伤害+400': 'Blaze Dash Slash +400', '焚影刺伤害+400': 'Burning Shadow Stab +400',
            '疾风步加速+6%': 'Gale Steps +6%', '暗影突袭伤害加209': 'Shadow Ambush +209', '天诛导弹伤害加600': 'Heaven Strike Missile +600',
            '一技能伤害加165': 'Skill 1 +165 Damage', '聚束宽度倍率+0.3': 'Focus Beam Width +0.3', '多镜面折射+1次': '+1 Multi-Mirror Refraction',
            '视线替换回血比例+7%': 'Vision Swap Heal +7%', '视线替换加速比例+7%': 'Vision Swap Speed +7%', '最终审判伤害加200': 'Final Judgment +200 Damage',
            '最大生命加154': '+154 Max HP', '普通攻击加52': '+52 Attack', '旋风斩伤害+42': 'Whirlwind Slash +42',
            '天空之眼天雷+56': 'Eye of the Sky Thunder +56', '天罚之雷伤害+21': 'Heavenly Thunder +21',
            '暴击率提升7%': '+7% Crit Rate', '暴击伤害+8%': '+8% Crit Damage',
            '普通攻击加80': '+80 Attack', '烬突刺伤害+30': 'Ember Thrust +30', '烬燃持续+0.6秒': 'Ember Ignition Duration +0.6s',
            '灰飞烟灭伤害+120': 'Obliteration +120', '灰飞烟灭回血+15%': 'Obliteration Heal +15%',
            '最大生命+200': '+200 Max HP', '普攻+70': '+70 Attack', '二技能每秒回复+2%': 'Skill 2 Heal/s +2%',
            '二技能护盾+80': 'Skill 2 Shield +80', '三技能伤害+100': 'Skill 3 +100 Damage',
            '暴击率+15%': '+15% Crit Rate', '暴击伤害+20%': '+20% Crit Damage',
            '最大生命+180': '+180 Max HP', '时空裂隙伤害+60': 'Time Rift +60 Damage',
            '时空崩塌伤害+200': 'Time Collapse +200', '时空崩塌伤害+180': 'Time Collapse +180',
            '最大生命+160': '+160 Max HP', '普攻+60': '+60 Attack', '暴击率+10%': '+10% Crit Rate',
            '一技能伤害+60': 'Skill 1 +60 Damage',
            '烈焰冲击伤害+64': 'Blazing Impact +64', '焚身烈焰每秒伤害+50': 'Immolation Flame Dmg/s +50', '燃烧每一层伤害+16': 'Burn Per Layer +16 Damage',
            '最大生命+240': '+240 Max HP', '寒冰箭伤害+80': 'Ice Arrow +80', '冰封领域伤害+100': 'Frozen Domain +100',
            '极地风暴伤害+30': 'Polar Storm +30',
            '最大生命+260': '+260 Max HP', '普攻+72': '+72 Attack', '寄生藤蔓每秒回血+6%': 'Parasitic Vine Heal/s +6%',
            '最大生命+154': '+154 Max HP',
            '自然之怒伤害+200': 'Nature\'s Wrath +200', '暴击率+12%': '+12% Crit Rate', '暴击伤害+18%': '+18% Crit Damage',
            '普攻+49': '+49 Attack', '暴击率+8%': '+8% Crit Rate', '暴击伤害+11%': '+11% Crit Damage',
            '一技能折射人数+1': '+1 Refraction Count', '一技能折射倍率+0.14': 'Refraction Multiplier +0.14',
            '二技能炮台倍率+0.07': 'Prism Turret Multiplier +0.07', '三技能每棱镜伤害+42': 'Prism Burst Per Prism +42',
            // ==== 属性面板数值后缀 ====
            '倍': 'x', '次': 'x', '个': ' enemies', '普攻': 'Basic Atk',
            '属性': ' Stats', '伤害': ' DMG', '已用': 'Used', '可用': 'Available',
            '5层→冻结2秒': '5 stacks → Freeze 2s',
            '冻结解除后从0开始': 'Resets from 0 after freeze ends',
            // ==== 技能释放台词（skillText） ====
            '我已无法回头': 'I can never turn back',
            '世界是一片燃烧的泡影': 'The world is a burning illusion',
            '这一击，贯穿世界！': 'This strike pierces the world!',
            '长枪既出，万军皆寂': 'Once my spear falls out, all armies go silent',
            '生死轮回，不过一瞬': 'Life and death revolving, but a fleeting moment',
            '百鸟朝凤，万物归宗': 'Hundred birds to the phoenix; all return to the source',
            '舞姿所至，心神俱碎': 'Where my dance reaches, hearts shatter',
            '花开花落，皆是虚妄': 'Blooming and wilting are all illusions',
            '镜花水月，孰真孰幻': 'Mirror flowers, moon water—what is real?',
            '青龙偃月，一刀断魂': 'Azure Dragon blade, one stroke severs the soul',
            '忠义之躯，万法不侵': 'A body of loyalty, impervious to all arts',
            '千里单骑，天命在我': 'A lone rider of a thousand li; destiny is mine',
            '一箭既出，无物可挡': 'Once loosed, nothing can stop my arrow',
            '百步之外，生死已定': 'Beyond a hundred paces, fate is sealed',
            '箭雨倾盆，万物归寂': 'Arrow rain pours down; all falls silent',
            '雷霆所至，万物皆灭': 'Where thunder strikes, all perish',
            '铁骑穿插，踏碎山河': 'Cavalry charges through, trampling mountains and rivers',
            '天雷降世，众生皆寂': 'Heavenly thunder descends; all lives fall silent',
            '运筹帷幄，决胜千里': 'Plan in the tent, secure victory a thousand li away',
            '八卦既成，万物归阵': 'The Eight Trigrams complete; all returns to formation',
            '观天察地，洞察先机': 'Read the sky and earth; foresee every move',
            '燕人张飞在此！': 'Zhang Fei of Yan is here!',
            '丈八蛇矛，横竖皆杀！': 'Serpent Spear strikes in every direction!',
            '万人敌，铜墙铁壁！': 'One vs Ten Thousand—an iron wall!',
            '焰冲斩，风火燎原！': 'Flame Dash Slash—fire sweeps the plain!',
            '炎突斩，一击贯穿！': 'Blaze Dash Slash—one strike pierces through!',
            '焚影刺，烈焰残像！': 'Burning Shadow Stab—flaming afterimage!',
            '疾风无影！': 'Gale without a trace!',
            '暗影贯穿！': 'Shadow pierces through!',
            '天诛——灭！': 'Heaven\'s punishment—annihilation!',
            '视野内无敌人': 'No enemies in sight',
            '光束——发射！': 'Beam—fire!',
            '聚束模式。': 'Focus mode.',
            '镜面，已就位。': 'Mirrors, in position.',
            '雾隐虚空，万物凝滞': 'Fog veils the void; all things freeze',
            '明察秋毫，律法无私': 'Scrutinize every detail; the law is impartial',
            '律令既下，万物归寂': 'Once the decree falls, all returns to silence',
            '旋风斩，风卷残云': 'Whirlwind Slash—wind scatters the clouds',
            '天空之眼，俯瞰苍生': 'Eye of the Sky surveys all mortals',
            '天罚之雷，雷鸣万里': 'Heavenly thunder roars across ten thousand li',
            '烬突刺，势如破竹': 'Ember Thrust—sweeps all before it',
            '烬燃！灰烬觉醒！': 'Ember Ignition—ashes awaken!',
            '水柱冲天，破浪而出': 'A water pillar surges through the waves',
            '潮汐护盾，碧浪庇护': 'Tidal Shield—azure waves protect',
            '深海怒涛，浪涌翻天': 'Deep Sea Rage—waves overturn the sky',
            '时空裂隙，维度跳跃': 'Time Rift—dimensional leap',
            '时间停滞，万物静寂': 'Time Freeze—all becomes still',
            '时空崩塌，维度碎裂': 'Time Collapse—dimensions shatter',
            '烈焰冲击，焚尽一切': 'Blazing Impact—burns everything away',
            '焚身烈焰，烈火燎原': 'Self-Immolation Flame—fire spreads across the plain',
            '永不熄灭，万火臣服': 'Eternal Flame—all fires bow down',
            '寒冰箭，凝霜成刃': 'Ice Arrow—frost forged into blades',
            '冰封领域，万物凝结': 'Frozen Domain—all things congeal',
            '极地风暴，冰封万里': 'Polar Storm—freezes ten thousand miles',
            '荆棘缠绕，荆棘缠身': 'Thorn Whip—vines entangle',
            '寄生藤蔓，吸取生命': 'Parasitic Vines—drain their life',
            '自然之怒，丛林审判': 'Nature\'s Wrath—the jungle\'s judgment',
            '水晶折射，矩阵启动': 'Crystal Refraction—matrix online',
            '棱镜阵列，炮台就位': 'Prism Array—turrets in position',
            '棱镜阵列未激活，无法爆发！': 'Prism Array not active, cannot burst!',
            '棱镜爆发，矩阵碎裂': 'Prism Burst—matrix shatters'
        });

        // ===== 新增：6英雄定义 =====
        const HERO_DEFS = {
            lubu: {
                name: _t('吕布'), title: _t('飞将 · 力量爆发'), color: '#ff4444', icon: '吕',
                hp: 156, attack: 20,
                skills: [
                    { name: _t('无双横扫'), cd: 180, dmg: 33, desc: _t('范围AOE伤害') },
                    { name: _t('霸王护体'), cd: 300, dmg: 20, desc: _t('反伤') },
                    { name: _t('鬼神突袭'), cd: 180, dmg: 59, desc: _t('突进贯穿伤害') }
                ],
                // 技能属性显示配置：label=标签, getValue=返回显示值
                skillStats: [
                    { label: _t('无双横扫伤害'), getValue: () => stats.skill1 },
                    { label: _t('霸王护体反伤'), getValue: () => stats.skill2 },
                    { label: _t('鬼神突袭伤害'), getValue: () => stats.skill3 }
                ],
                skillImpl: {
                    1: () => {
                        skillText = { text: _t('我已无法回头'), color: '#ffffff', life: 60 };
                        for (let e of enemies.slice()) {
                            if (!e.alive) continue;
                            const dx = e.x - hero.x, dy = e.y - hero.y;
                            if (Math.sqrt(dx*dx + dy*dy) < 400) dealDamage(e, stats.skill1, '#ff4444', 10);
                        }
                        particles.push({ type: 'red', x: hero.x, y: hero.y, life: 25, maxLife: 25 });
                        // 新增：400范围多层冲击波 + 中心爆发（清晰显示攻击范围）
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#ff4444', maxRadius: 400, life: 30, maxLife: 30 });
                        particles.push({ type: 'shockExplosion', x: hero.x, y: hero.y, color: '#ff8800', maxRadius: 130, life: 22, maxLife: 22 });
                        triggerShake(false);
                    },
                    2: () => {
                        skillText = { text: _t('世界是一片燃烧的泡影'), color: '#ffcc00', life: 60 };
                        ringActive = true;
                        ringTimer = 180;
                        // 护环开启瞬间对周围敌人造成伤害
                        for (let e of enemies.slice()) {
                            if (!e.alive) continue;
                            const dx = e.x - hero.x, dy = e.y - hero.y;
                            if (Math.sqrt(dx*dx + dy*dy) < 120) {
                                dealDamage(e, stats.skill2, '#ffcc00', 8);
                            }
                        }
                        // 新增：护环开启扩散光环 + 20个火焰粒子上升
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#ffcc00', maxRadius: 160, life: 25, maxLife: 25 });
                        for (let i = 0; i < 20; i++) {
                            const a = (i / 20) * Math.PI * 2;
                            particles.push({
                                type: 'flame', x: hero.x + Math.cos(a) * 100, y: hero.y + Math.sin(a) * 100,
                                vx: Math.cos(a) * 0.5, vy: -2 - Math.random(),
                                life: 35, maxLife: 35, size: 7
                            });
                        }
                    },
                    3: () => {
                        hero.invincibleTime = 30;
                        skillText = { text: _t('这一击，贯穿世界！'), color: '#ff4444', life: 60 };
                        const dashDist = 200;
                        const oldX = hero.x;
                        hero.x = Math.max(30, Math.min(MAP_WIDTH-30, hero.x + hero.facing * dashDist));
                        for (let e of enemies.slice()) {
                            if (!e.alive) continue;
                            const minX = Math.min(oldX, hero.x), maxX = Math.max(oldX, hero.x);
                            if (e.x >= minX - 30 && e.x <= maxX + 30 && Math.abs(e.y - hero.y) < 60) {
                                dealDamage(e, stats.skill3, '#00ffff', 12);
                            }
                        }
                        particles.push({ type: 'dash', x1: oldX, x2: hero.x, y: hero.y, life: 20, maxLife: 20 });
                        // 新增：血色拖尾 + 起点终点鬼影爆发
                        particles.push({ type: 'bloodDash', x1: oldX, x2: hero.x, y: hero.y, life: 28, maxLife: 28 });
                        particles.push({ type: 'shockExplosion', x: oldX, y: hero.y, color: '#ff0000', maxRadius: 80, life: 20, maxLife: 20 });
                        particles.push({ type: 'shockExplosion', x: hero.x, y: hero.y, color: '#ff0000', maxRadius: 110, life: 25, maxLife: 25 });
                        triggerShake(true);
                    }
                },
                // ===== 吕布专属肉鸽增强（基准，全属性已强化30%，再+15%增强） =====
                buffs: [
                    { id: 'hp', text: _t('最大生命加299'), apply: () => { stats.hp += 299; hero.maxHp += 299; hero.hp += 299; } },
                    { id: 'attack', text: _t('普通攻击加299'), apply: () => { stats.attack += 299; } },
                    { id: 'skill1', text: _t('一技能伤害加120'), apply: () => { stats.skill1 += 120; } },
                    { id: 'skill2', text: _t('二技能反伤加12'), apply: () => { stats.skill2 += 12; } },
                    { id: 'skill3', text: _t('三技能伤害加209'), apply: () => { stats.skill3 += 209; } },
                    { id: 'crit', text: _t('暴击率提升15%'), apply: () => { addCritRate(0.15); } },
                    { id: 'critDmg', text: _t('暴击伤害+18%'), apply: () => { critDmgMult += 0.18; } },
                    { id: 'heal', text: _t('回满血'), apply: () => { hero.hp = hero.maxHp; } }
                ]
            },
            zhaoyun: {
                name: _t('赵云'), title: _t('龙胆 · 敏捷机动'), color: '#44aaff', icon: '赵',
                hp: 300, attack: 36,
                skills: [
                    { name: _t('龙胆突刺'), cd: 150, dmg: 120, desc: _t('直线穿透伤害') },
                    { name: _t('七进七出'), cd: 300, dmg: 0, desc: _t('回血40%+短暂无敌') },
                    { name: _t('百鸟朝凤'), cd: 210, dmg: 105, desc: _t('扇形箭雨') }
                ],
                skillStats: [
                    { label: _t('龙胆突刺伤害'), getValue: () => stats.skill1 },
                    { label: _t('七进七出回血'), getValue: () => Math.floor((0.4 + enhZhaoYunHeal) * 100) + '%' },
                    { label: _t('百鸟朝凤伤害'), getValue: () => stats.skill3 }
                ],
                skillImpl: {
                    1: () => {
                        skillText = { text: _t('长枪既出，万军皆寂'), color: '#44aaff', life: 60 };
                        for (let e of enemies.slice()) {
                            if (!e.alive) continue;
                            if (Math.abs(e.y - hero.y) < 100) dealDamage(e, stats.skill1, '#44aaff', 10);
                        }
                        particles.push({ type: 'dash', x1: camX, x2: camX + WIDTH, y: hero.y, life: 20, maxLife: 20 });
                        // 龙胆突刺强化特效：多层蓝色光柱+龙形粒子+冲击波
                        const dir = hero.facing > 0 ? 1 : -1;
                        particles.push({ type: 'beam', x: hero.x, y: hero.y, dx: dir, dy: 0, length: 500, color: '#44aaff', life: 28, maxLife: 28 });
                        particles.push({ type: 'beam', x: hero.x, y: hero.y, dx: dir, dy: 0, length: 500, color: '#88ddff', life: 20, maxLife: 20 });
                        particles.push({ type: 'beam', x: hero.x, y: hero.y, dx: dir, dy: 0, length: 500, color: '#ffffff', life: 12, maxLife: 12 });
                        particles.push({ type: 'shockExplosion', x: hero.x + dir * 250, y: hero.y, color: '#44aaff', maxRadius: 150, life: 25, maxLife: 25 });
                        particles.push({ type: 'ringExpand', x: hero.x + dir * 250, y: hero.y, color: '#88ddff', maxRadius: 200, life: 22, maxLife: 22 });
                        // 龙形粒子：沿突刺方向飞散的蓝色光点
                        for (let i = 0; i < 30; i++) {
                            const a = (Math.random() - 0.5) * 0.5; // 小角度散射
                            const sp = 10 + Math.random() * 8;
                            particles.push({
                                type: 'hit', x: hero.x, y: hero.y + (Math.random() - 0.5) * 60,
                                vx: Math.cos(a) * sp * dir, vy: Math.sin(a) * sp,
                                life: 25, maxLife: 25, color: i % 2 === 0 ? '#44aaff' : '#88ddff', size: 5
                            });
                        }
                        triggerShake(false);
                    },
                    2: () => {
                        skillText = { text: _t('生死轮回，不过一瞬'), color: '#88ddff', life: 60 };
                        const heal = Math.floor(hero.maxHp * (0.4 + enhZhaoYunHeal));
                        hero.hp = Math.min(hero.maxHp, hero.hp + heal);
                        hero.invincibleTime = 90;
                        zhaoyunShieldEffect = 90;
                        showDamage(hero.x, hero.y - 30, heal, '#44ff44');
                        // 强化治疗特效：多层治疗光环+上升光点+无敌护盾环
                        for (let i = 0; i < 20; i++) {
                            particles.push({
                                type: 'healParticle',
                                x: hero.x + (Math.random() - 0.5) * 60,
                                y: hero.y + 20 + Math.random() * 20,
                                life: 60 + Math.floor(Math.random() * 30), maxLife: 90, color: '#44ff44'
                            });
                        }
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#44ff44', maxRadius: 140, life: 35, maxLife: 35 });
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#88ddff', maxRadius: 110, life: 28, maxLife: 28 });
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#ffffff', maxRadius: 80, life: 22, maxLife: 22 });
                        // 无敌护盾粒子：环绕英雄的蓝色小龙卷
                        for (let i = 0; i < 16; i++) {
                            const a = (i / 16) * Math.PI * 2;
                            particles.push({
                                type: 'hit', x: hero.x + Math.cos(a) * 45, y: hero.y + Math.sin(a) * 45,
                                vx: -Math.sin(a) * 3, vy: Math.cos(a) * 3,
                                life: 40, maxLife: 40, color: '#88ddff', size: 5
                            });
                        }
                    },
                    3: () => {
                        skillText = { text: _t('百鸟朝凤，万物归宗'), color: '#44aaff', life: 60 };
                        for (let e of enemies.slice()) {
                            if (!e.alive) continue;
                            const dx = e.x - hero.x, dy = e.y - hero.y;
                            const dist = Math.sqrt(dx*dx + dy*dy);
                            if (dist < 400) {
                                dealDamage(e, stats.skill3, '#66ccff', 8);
                            }
                        }
                        for (let i = 0; i < 40; i++) {
                            const a = Math.random() * Math.PI * 2;
                            particles.push({
                                type: 'hit', x: hero.x, y: hero.y,
                                vx: Math.cos(a) * (8 + Math.random() * 6),
                                vy: Math.sin(a) * (8 + Math.random() * 6),
                                life: 25, maxLife: 25, color: '#66ccff', size: 4
                            });
                        }
                        // 新增：扇形箭雨（按朝向60度扇形400范围）+ 凤凰光环 + 扩散光环
                        particles.push({ type: 'sector', x: hero.x, y: hero.y, angle: hero.facing > 0 ? 0 : Math.PI, spread: Math.PI/3, maxRadius: 400, color: '#66ccff', life: 30, maxLife: 30 });
                        particles.push({ type: 'phoenix', x: hero.x, y: hero.y, maxRadius: 150, color: '#66ccff', life: 40, maxLife: 40 });
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#66ccff', maxRadius: 400, life: 30, maxLife: 30 });
                        triggerShake(true);
                    }
                },
                // ===== 赵云专属肉鸽增强（七进七出加回血不加无敌） =====
                buffs: [
                    { id: 'hp', text: _t('最大生命加200'), apply: () => { stats.hp += 200; hero.maxHp += 200; hero.hp += 200; } },
                    { id: 'attack', text: _t('普通攻击加70'), apply: () => { stats.attack += 70; } },
                    { id: 'skill1', text: _t('一技能伤害加90'), apply: () => { stats.skill1 += 90; } },
                    { id: 's2heal', text: _t('二技能回血比例+15%'), apply: () => { enhZhaoYunHeal += 0.15; } },
                    { id: 'skill3', text: _t('三技能伤害加80'), apply: () => { stats.skill3 += 80; } },
                    { id: 'crit', text: _t('暴击率提升10%'), apply: () => { addCritRate(0.1); } },
                    { id: 'critDmg', text: _t('暴击伤害+12%'), apply: () => { critDmgMult += 0.12; } },
                    { id: 'heal', text: _t('回满血'), apply: () => { hero.hp = hero.maxHp; } }
                ]
            },
            diaochan: {
                name: _t('貂蝉'), title: _t('倾国 · 法术控制'), color: '#ff66cc', icon: '貂',
                hp: 124, attack: 16,
                skills: [
                    { name: _t('魅惑之舞'), cd: 240, dmg: 39, desc: _t('眩晕敌人3秒+伤害') },
                    { name: _t('百花绽放'), cd: 300, dmg: 20, desc: _t('范围毒伤持续6秒') },
                    { name: _t('月华分身'), cd: 360, dmg: 33, desc: _t('召唤3分身协助') }
                ],
                skillStats: [
                    { label: _t('魅惑之舞伤害'), getValue: () => stats.skill1 },
                    { label: _t('百花绽放毒伤'), getValue: () => stats.skill2 },
                    { label: _t('月华分身伤害'), getValue: () => stats.skill3 }
                ],
                skillImpl: {
                    1: () => {
                        skillText = { text: _t('舞姿所至，心神俱碎'), color: '#ff66cc', life: 60 };
                        for (let e of enemies.slice()) {
                            if (!e.alive) continue;
                            const dx = e.x - hero.x, dy = e.y - hero.y;
                            if (Math.sqrt(dx*dx + dy*dy) < 350) {
                                e.stunTime = 180;
                                e.flashTime = 10;
                                dealDamage(e, stats.skill1, '#ff66cc', 8);
                                spawnHitParticles(e.x, e.y, '#ff66cc', 8);
                                // 被魅惑敌人身上升起爱心粒子
                                for (let k = 0; k < 3; k++) {
                                    particles.push({
                                        type: 'healParticle',
                                        x: e.x + (Math.random() - 0.5) * 30,
                                        y: e.y + (Math.random() - 0.5) * 30,
                                        life: 30 + Math.floor(Math.random() * 20),
                                        maxLife: 50, color: '#ff99cc'
                                    });
                                }
                            }
                        }
                        particles.push({ type: 'red', x: hero.x, y: hero.y, life: 30, maxLife: 30 });
                        // 350范围粉色魅惑光环 + 多层扩散 + 环绕爱心
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#ff66cc', maxRadius: 350, life: 35, maxLife: 35 });
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#ff99cc', maxRadius: 280, life: 28, maxLife: 28 });
                        particles.push({ type: 'shockExplosion', x: hero.x, y: hero.y, color: '#ff66cc', maxRadius: 120, life: 25, maxLife: 25 });
                        for (let i = 0; i < 18; i++) {
                            const a = (i / 18) * Math.PI * 2;
                            const r = 80 + Math.random() * 120;
                            particles.push({
                                type: 'healParticle',
                                x: hero.x + Math.cos(a) * r, y: hero.y + Math.sin(a) * r,
                                life: 55, maxLife: 55, color: i % 3 === 0 ? '#ff99cc' : '#ff66cc'
                            });
                        }
                        triggerShake(false);
                    },
                    2: () => {
                        skillText = { text: _t('花开花落，皆是虚妄'), color: '#ff88dd', life: 60 };
                        for (let i = 0; i < 3; i++) {
                            const a = (i / 3) * Math.PI * 2;
                            poisonZones.push({
                                x: hero.x + Math.cos(a) * 80, y: hero.y + Math.sin(a) * 80,
                                radius: 100, life: 360 + enhDiaoChanPoisonDuration, tick: 0
                            });
                        }
                        // 百花绽放强化特效：3个毒区位置同时绽放光环+花瓣粒子+毒雾爆发
                        for (let i = 0; i < 3; i++) {
                            const a = (i / 3) * Math.PI * 2;
                            const px = hero.x + Math.cos(a) * 80, py = hero.y + Math.sin(a) * 80;
                            particles.push({ type: 'ringExpand', x: px, y: py, color: '#ff66cc', maxRadius: 130, life: 30, maxLife: 30 });
                            particles.push({ type: 'ringExpand', x: px, y: py, color: '#ff99cc', maxRadius: 90, life: 24, maxLife: 24 });
                            particles.push({ type: 'shockExplosion', x: px, y: py, color: '#ff66cc', maxRadius: 70, life: 22, maxLife: 22 });
                            // 花瓣粒子
                            for (let j = 0; j < 12; j++) {
                                const pa = Math.random() * Math.PI * 2;
                                const sp = 1 + Math.random() * 2;
                                particles.push({
                                    type: 'hit', x: px, y: py,
                                    vx: Math.cos(pa) * sp, vy: Math.sin(pa) * sp,
                                    life: 40, maxLife: 40, color: j % 2 === 0 ? '#ff66cc' : '#ff99cc', size: 4
                                });
                            }
                        }
                        triggerShake(false);
                    },
                    3: () => {
                        skillText = { text: _t('镜花水月，孰真孰幻'), color: '#ffaadd', life: 60 };
                        // 分身数量=3+肉鸽增强；40%移速持续2秒（不随肉鸽增强）
                        const cloneCount = 3 + enhDiaoChanCloneCount;
                        spawnHeroClones(cloneCount, '#ff66cc', _t('影'));
                        diaoChanSpeedBoostTimer = 120; // 2秒40%移速
                        // 新增：月光光环（银白色扩散）+ 20个白色粒子爆发
                        particles.push({ type: 'moonlight', x: hero.x, y: hero.y, maxRadius: 180, life: 38, maxLife: 38 });
                        for (let i = 0; i < 20; i++) {
                            const a = (i / 20) * Math.PI * 2;
                            particles.push({
                                type: 'hit', x: hero.x, y: hero.y,
                                vx: Math.cos(a) * 6, vy: Math.sin(a) * 6,
                                life: 30, maxLife: 30, color: '#fff8dc', size: 4
                            });
                        }
                        triggerShake(false);
                    }
                },
                // ===== 貂蝉专属肉鸽增强（三技能+100%/分身数量+1/百花绽放持续+1.5秒） =====
                buffs: [
                    { id: 'hp', text: _t('最大生命加180'), apply: () => { stats.hp += 180; hero.maxHp += 180; hero.hp += 180; } },
                    { id: 'attack', text: _t('普通攻击加110'), apply: () => { stats.attack += 110; } },
                    { id: 'skill1', text: _t('一技能伤害加35'), apply: () => { stats.skill1 += 35; } },
                    { id: 'skill2', text: _t('二技能毒伤加9'), apply: () => { stats.skill2 += 9; } },
                    { id: 'skill3', text: _t('三技能伤害加120'), apply: () => { stats.skill3 += 120; } },
                    { id: 's3clone', text: _t('月华分身数量+1'), apply: () => { enhDiaoChanCloneCount += 1; } },
                    { id: 's2duration', text: _t('二技能持续+1.5秒'), apply: () => { enhDiaoChanPoisonDuration += 90; } },
                    { id: 'critDmg', text: _t('暴击伤害+12%'), apply: () => { critDmgMult += 0.12; } },
                    { id: 'heal', text: _t('回满血'), apply: () => { hero.hp = hero.maxHp; } }
                ]
            },
            guanyu: {
                name: _t('关羽'), title: _t('武圣 · 普攻强化'), color: '#44ff44', icon: '关',
                hp: 180, attack: 80,
                skills: [
                    { name: _t('青龙之威'), cd: 300, dmg: 0, desc: _t('3秒普攻范围4倍') },
                    { name: _t('武圣护体'), cd: 360, dmg: 0, desc: _t('3秒无敌') },
                    { name: _t('过五关'), cd: 360, dmg: 0, desc: _t('3秒普攻翻倍+20%吸血') }
                ],
                skillStats: [
                    { label: _t('青龙之威范围'), getValue: () => (4 + enhGuanYuRangeMult) + _t('倍') },
                    { label: _t('武圣护体时长'), getValue: () => '3' + _t('秒') },
                    { label: _t('过五关吸血'), getValue: () => Math.floor((0.2 + enhGuanYuLifesteal) * 100) + '%' }
                ],
                skillImpl: {
                    1: () => {
                        skillText = { text: _t('青龙偃月，一刀断魂'), color: '#44ff44', life: 60 };
                        guanYuRangeBoost = 180 + enhGuanYuRangeDuration;
                        spawnHitParticles(hero.x, hero.y, '#44ff44', 15);
                        // 新增：4倍范围持续光环（3秒，清晰显示扩大后的攻击范围）+ 扩散光环
                        const rangeMult = 4 + enhGuanYuRangeMult;
                        const auraRadius = GRID * 1.66 * rangeMult;
                        particles.push({ type: 'aura', x: hero.x, y: hero.y, radius: auraRadius, color: '#44ff44', life: 180, maxLife: 180, followHero: true });
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#44ff44', maxRadius: auraRadius, life: 30, maxLife: 30 });
                        triggerShake(false);
                    },
                    2: () => {
                        skillText = { text: _t('忠义之躯，万法不侵'), color: '#88ff88', life: 60 };
                        hero.invincibleTime = 180;
                        guanyuShieldEffect = 180;
                        spawnHitParticles(hero.x, hero.y, '#88ff88', 20);
                        // 新增：开启扩散光环
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#88ff88', maxRadius: 100, life: 25, maxLife: 25 });
                    },
                    3: () => {
                        skillText = { text: _t('千里单骑，天命在我'), color: '#44ff44', life: 60 };
                        guanYuDmgBoost = 180;
                        guanYuLifesteal = true;
                        spawnHitParticles(hero.x, hero.y, '#ff4444', 15);
                        // 新增：3秒红色战意光环（持续显示状态）+ 扩散光环
                        particles.push({ type: 'aura', x: hero.x, y: hero.y, radius: 80, color: '#ff4444', life: 180, maxLife: 180, followHero: true });
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#ff4444', maxRadius: 120, life: 28, maxLife: 28 });
                        triggerShake(true);
                    }
                },
                // ===== 关羽专属肉鸽增强（无二技能增强，转加一三技能独特机制） =====
                buffs: [
                    { id: 'hp', text: _t('最大生命加250'), apply: () => { stats.hp += 250; hero.maxHp += 250; hero.hp += 250; } },
                    { id: 'attack', text: _t('普通攻击加120'), apply: () => { stats.attack += 120; } },
                    { id: 's1range', text: _t('一技能范围+25%'), apply: () => { enhGuanYuRangeMult += 1; } },
                    { id: 's1duration', text: _t('一技能持续+1秒'), apply: () => { enhGuanYuRangeDuration += 60; } },
                    { id: 's3lifesteal', text: _t('三技能吸血+10%'), apply: () => { enhGuanYuLifesteal += 0.1; } },
                    { id: 'crit', text: _t('暴击率提升10%'), apply: () => { addCritRate(0.1); } },
                    { id: 'critDmg', text: _t('暴击伤害+12%'), apply: () => { critDmgMult += 0.12; } },
                    { id: 'heal', text: _t('回满血'), apply: () => { hero.hp = hero.maxHp; } }
                ]
            },
            huangzhong: {
                name: _t('黄忠'), title: _t('神射 · 远程射手'), color: '#ffaa00', icon: '黄',
                hp: 190, attack: 26,
                skills: [
                    { name: _t('穿云箭'), cd: 150, dmg: 90, desc: _t('远程穿透箭') },
                    { name: _t('百步穿杨'), cd: 240, dmg: 240, desc: _t('定点狙击+溅射') },
                    { name: _t('箭雨风暴'), cd: 360, dmg: 80, desc: _t('全屏箭雨') }
                ],
                skillStats: [
                    { label: _t('穿云箭伤害'), getValue: () => stats.skill1 },
                    { label: _t('百步穿杨伤害'), getValue: () => stats.skill2 },
                    { label: _t('箭雨风暴伤害'), getValue: () => stats.skill3 }
                ],
                skillImpl: {
                    1: () => {
                        skillText = { text: _t('一箭既出，无物可挡'), color: '#ffaa00', life: 60 };
                        for (let e of enemies.slice()) {
                            if (!e.alive) continue;
                            if (Math.abs(e.y - hero.y) < 70) dealDamage(e, stats.skill1, '#ffaa00', 8);
                        }
                        particles.push({ type: 'dash', x1: camX, x2: camX + WIDTH, y: hero.y, life: 15, maxLife: 15 });
                        // 穿云箭强化特效：多层金色箭矢光束+箭羽粒子+穿透冲击波
                        const dir = hero.facing > 0 ? 1 : -1;
                        particles.push({ type: 'beam', x: hero.x, y: hero.y, dx: dir, dy: 0, length: 700, color: '#ffaa00', life: 25, maxLife: 25 });
                        particles.push({ type: 'beam', x: hero.x, y: hero.y, dx: dir, dy: 0, length: 700, color: '#ffcc44', life: 18, maxLife: 18 });
                        particles.push({ type: 'beam', x: hero.x, y: hero.y, dx: dir, dy: 0, length: 700, color: '#ffffff', life: 10, maxLife: 10 });
                        particles.push({ type: 'shockExplosion', x: hero.x + dir * 350, y: hero.y, color: '#ffaa00', maxRadius: 120, life: 22, maxLife: 22 });
                        particles.push({ type: 'ringExpand', x: hero.x + dir * 350, y: hero.y, color: '#ffcc44', maxRadius: 180, life: 20, maxLife: 20 });
                        // 箭羽飞散粒子
                        for (let i = 0; i < 25; i++) {
                            const a = (Math.random() - 0.5) * 0.4;
                            const sp = 12 + Math.random() * 8;
                            particles.push({
                                type: 'hit', x: hero.x, y: hero.y + (Math.random() - 0.5) * 40,
                                vx: Math.cos(a) * sp * dir, vy: Math.sin(a) * sp,
                                life: 22, maxLife: 22, color: i % 2 === 0 ? '#ffaa00' : '#ffcc44', size: 5
                            });
                        }
                        triggerShake(false);
                    },
                    2: () => {
                        skillText = { text: _t('百步之外，生死已定'), color: '#ffcc44', life: 60 };
                        let target = null, minD = Infinity;
                        for (let e of enemies.slice()) {
                            if (!e.alive) continue;
                            const d = Math.sqrt((e.x-hero.x)**2 + (e.y-hero.y)**2);
                            if (d < minD) { minD = d; target = e; }
                        }
                        if (target) {
                            // 狙击光束：从英雄到目标的聚焦激光
                            const dx = target.x - hero.x, dy = target.y - hero.y;
                            const d = Math.sqrt(dx*dx + dy*dy);
                            const dxN = d > 0 ? dx / d : 1, dyN = d > 0 ? dy / d : 0;
                            particles.push({ type: 'beam', x: hero.x, y: hero.y, dx: dxN, dy: dyN, length: d, color: '#ffcc00', life: 18, maxLife: 18 });
                            particles.push({ type: 'beam', x: hero.x, y: hero.y, dx: dxN, dy: dyN, length: d, color: '#ffffff', life: 10, maxLife: 10 });
                            // 瞄准十字（命中前显示0.3秒，狙击感）
                            particles.push({ type: 'crosshair', x: target.x, y: target.y, life: 18, maxLife: 18 });
                            particles.push({ type: 'ringExpand', x: target.x, y: target.y, color: '#ffaa00', maxRadius: 60, life: 15, maxLife: 15 });
                            dealDamage(target, stats.skill2, '#ffcc00', 20);
                            particles.push({ type: 'dash', x1: hero.x, x2: target.x, y: hero.y, life: 10, maxLife: 10 });
                            // 命中爆炸冲击波（显示溅射范围）
                            particles.push({ type: 'shockExplosion', x: target.x, y: target.y, color: '#ffcc00', maxRadius: 100 + enhHuangZhongSplash, life: 25, maxLife: 25 });
                            particles.push({ type: 'ringExpand', x: target.x, y: target.y, color: '#ffaa00', maxRadius: 120 + enhHuangZhongSplash, life: 22, maxLife: 22 });
                            // 新增：溅射伤害（目标周围敌人受50%伤害）
                            for (let e of enemies.slice()) {
                                if (!e.alive || e === target) continue;
                                const d = Math.sqrt((e.x-target.x)**2 + (e.y-target.y)**2);
                                if (d < 80 + enhHuangZhongSplash) {
                                    dealDamage(e, Math.floor(stats.skill2 * 0.5), '#ffcc44', 6);
                                }
                            }
                            spawnHitParticles(target.x, target.y, '#ffcc00', 20);
                        }
                        triggerShake(true);
                    },
                    3: () => {
                        skillText = { text: _t('箭雨倾盆，万物归寂'), color: '#ffaa00', life: 60 };
                        for (let e of enemies.slice()) {
                            if (!e.alive) continue;
                            dealDamage(e, stats.skill3, '#ffcc44', 10);
                            spawnHitParticles(e.x, e.y - 100, '#ffcc44', 6);
                        }
                        for (let i = 0; i < 40; i++) {
                            particles.push({
                                type: 'hit', x: camX + Math.random() * WIDTH, y: camY - 20,
                                vx: 0, vy: 15 + Math.random() * 10,
                                life: 30, maxLife: 30, color: '#ffcc44', size: 3
                            });
                        }
                        // 新增：3波次箭雨（共120支箭矢，从视野上方落下，覆盖全屏）
                        for (let wave = 0; wave < 3; wave++) {
                            for (let i = 0; i < 40; i++) {
                                particles.push({
                                    type: 'arrowRain',
                                    x: camX + Math.random() * WIDTH,
                                    y: camY - 40 - wave * 80,
                                    vx: (Math.random() - 0.5) * 2,
                                    vy: 12 + Math.random() * 6,
                                    life: 50 + wave * 10, maxLife: 50 + wave * 10,
                                    color: '#ffcc44'
                                });
                            }
                        }
                        // 全屏金光扩散
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#ffaa00', maxRadius: 500, life: 30, maxLife: 30 });
                        triggerShake(true);
                    }
                },
                // ===== 黄忠专属肉鸽增强（百步穿杨溅射+50） =====
                buffs: [
                    { id: 'hp', text: _t('最大生命加200'), apply: () => { stats.hp += 200; hero.maxHp += 200; hero.hp += 200; } },
                    { id: 'attack', text: _t('普通攻击加90'), apply: () => { stats.attack += 90; } },
                    { id: 'skill1', text: _t('一技能伤害加70'), apply: () => { stats.skill1 += 70; } },
                    { id: 'skill2', text: _t('二技能伤害加120'), apply: () => { stats.skill2 += 120; } },
                    { id: 's2splash', text: _t('二技能溅射范围+50'), apply: () => { enhHuangZhongSplash += 50; } },
                    { id: 'skill3', text: _t('三技能伤害加60'), apply: () => { stats.skill3 += 60; } },
                    { id: 'crit', text: _t('暴击率提升10%'), apply: () => { addCritRate(0.1); } },
                    { id: 'critDmg', text: _t('暴击伤害+12%'), apply: () => { critDmgMult += 0.12; } },
                    { id: 'heal', text: _t('回满血'), apply: () => { hero.hp = hero.maxHp; } }
                ]
            },
            machao: {
                name: _t('马超'), title: _t('锦马 · 闪电突击'), color: '#aa66ff', icon: '马',
                hp: 285, attack: 39,
                skills: [
                    { name: _t('雷霆突击'), cd: 160, dmg: 105, desc: _t('闪电突进') },
                    { name: _t('西凉铁骑'), cd: 300, dmg: 120, desc: _t('召唤骑兵穿插冲锋') },
                    { name: _t('神威万里'), cd: 360, dmg: 135, desc: _t('全屏闪电链') }
                ],
                skillStats: [
                    { label: _t('雷霆突击伤害'), getValue: () => stats.skill1 },
                    { label: _t('西凉铁骑伤害'), getValue: () => stats.skill2 },
                    { label: _t('神威万里链数'), getValue: () => (8 + enhMaChaoChainCount) + _t('次') }
                ],
                skillImpl: {
                    1: () => {
                        skillText = { text: _t('雷霆所至，万物皆灭'), color: '#aa66ff', life: 60 };
                        const dir = hero.facing;
                        const oldX = hero.x;
                        hero.x = Math.max(30, Math.min(MAP_WIDTH-30, hero.x + dir * 200));
                        hero.invincibleTime = 20;
                        for (let e of enemies.slice()) {
                            if (!e.alive) continue;
                            const minX = Math.min(oldX, hero.x), maxX = Math.max(oldX, hero.x);
                            if (e.x >= minX - 30 && e.x <= maxX + 30 && Math.abs(e.y - hero.y) < 70) {
                                dealDamage(e, stats.skill1, '#aa66ff', 12);
                            }
                        }
                        particles.push({ type: 'dash', x1: oldX, x2: hero.x, y: hero.y, life: 20, maxLife: 20 });
                        // 新增：紫色闪电拖尾（锯齿状+分支）+ 终点爆发
                        particles.push({ type: 'lightningDash', x1: oldX, x2: hero.x, y: hero.y, life: 25, maxLife: 25 });
                        particles.push({ type: 'shockExplosion', x: hero.x, y: hero.y, color: '#aa66ff', maxRadius: 90, life: 22, maxLife: 22 });
                        triggerShake(true);
                    },
                    2: () => {
                        skillText = { text: _t('铁骑穿插，踏碎山河'), color: '#cc88ff', life: 60 };
                        // ===== 穿插铁骑：相邻行方向相反 + 出发延迟，形成交错穿插浪潮 =====
                        // 10行×2只=20只骑兵，奇数行从左冲、偶数行从右冲，相邻行方向相反形成穿插交织
                        // 每行出发延迟递增（row*5帧），形成连续冲锋浪潮而非同时出发
                        // life=360帧（速度12/帧×360=4320 > MAP_WIDTH=4000，确保穿过整个屏幕而非一半）
                        const minX = -120, maxX = MAP_WIDTH + 120;
                        const cavalryLife = 360;
                        for (let row = 0; row < 10; row++) {
                            const y = 60 + row * (MAP_HEIGHT - 120) / 9;
                            // 奇数行从左(dir=1)，偶数行从右(dir=-1)，相邻行方向相反=穿插
                            const fromLeft = (row % 2 === 0);
                            const dir = fromLeft ? 1 : -1;
                            const startX = fromLeft ? minX : maxX;
                            const startDelay = row * 5;  // 出发延迟：行号越大越晚出发，形成浪潮
                            // 每行2只骑兵（保持密度），同方向同延迟
                            cavalryCharges.push({
                                x: startX, y: y, dir: dir,
                                life: cavalryLife, tick: 0, boundMin: minX, boundMax: maxX,
                                startDelay: startDelay
                            });
                            cavalryCharges.push({
                                x: startX + (fromLeft ? 40 : -40), y: y, dir: dir,
                                life: cavalryLife, tick: 0, boundMin: minX, boundMax: maxX,
                                startDelay: startDelay
                            });
                        }
                        // 召唤瞬间紫色扩散光环（双层，增强穿插出征感）
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#aa66ff', maxRadius: 200, life: 28, maxLife: 28 });
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#cc88ff', maxRadius: 300, life: 35, maxLife: 35 });
                        triggerShake(false);
                    },
                    3: () => {
                        skillText = { text: _t('天雷降世，众生皆寂'), color: '#aa66ff', life: 60 };
                        const aliveEnemies = enemies.filter(e => e.alive);
                        let prevX = hero.x, prevY = hero.y;
                        const chainPoints = [{ x: prevX, y: prevY }];
                        for (const e of aliveEnemies.slice(0, 8 + enhMaChaoChainCount)) {
                            dealDamage(e, stats.skill3, '#cc88ff', 10);
                            chainPoints.push({ x: e.x, y: e.y });
                        }
                        lightningChains.push({ points: chainPoints, life: 25, maxLife: 25 });
                        // 新增：全屏紫色扩散光环 + 每个被击中敌人位置爆发
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#aa66ff', maxRadius: 500, life: 30, maxLife: 30 });
                        for (const e of aliveEnemies.slice(0, 8 + enhMaChaoChainCount)) {
                            particles.push({ type: 'shockExplosion', x: e.x, y: e.y, color: '#cc88ff', maxRadius: 60, life: 20, maxLife: 20 });
                        }
                        triggerShake(true);
                    }
                },
                // ===== 马超专属肉鸽增强（神威万里连锁+3） =====
                buffs: [
                    { id: 'hp', text: _t('最大生命加200'), apply: () => { stats.hp += 200; hero.maxHp += 200; hero.hp += 200; } },
                    { id: 'attack', text: _t('普通攻击加70'), apply: () => { stats.attack += 70; } },
                    { id: 'skill1', text: _t('一技能伤害加80'), apply: () => { stats.skill1 += 80; } },
                    { id: 'skill2', text: _t('二技能伤害加96'), apply: () => { stats.skill2 += 96; } },
                    { id: 'skill3', text: _t('三技能伤害加100'), apply: () => { stats.skill3 += 100; } },
                    { id: 's3chain', text: _t('三技能连锁数+3'), apply: () => { enhMaChaoChainCount += 3; } },
                    { id: 'critDmg', text: _t('暴击伤害+12%'), apply: () => { critDmgMult += 0.12; } },
                    { id: 'heal', text: _t('回满血'), apply: () => { hero.hp = hero.maxHp; } }
                ]
            },
            // ===== 新增：诸葛亮（远程法师，普攻5倍半径射程） =====
            zhugeliang: {
                name: _t('诸葛亮'), title: _t('卧龙 · 远程法师'), color: '#66ddff', icon: '诸',
                hp: 200, attack: 110, ranged: true,
                skills: [
                    { name: _t('神行步'), cd: 270, dmg: 0, desc: _t('加速55%持续3秒') },
                    { name: _t('八卦阵'), cd: 240, dmg: 0, desc: _t('普攻变范围2.3倍2秒') },
                    { name: _t('观星术'), cd: 300, dmg: 0, desc: _t('半径+200%持续3秒') }
                ],
                skillStats: [
                    { label: _t('神行步加速'), getValue: () => Math.floor((0.55 + enhZhugeLiangSpeed) * 100) + '%' },
                    { label: _t('八卦阵范围'), getValue: () => (2.3 + enhZhugeLiangAoeMult).toFixed(1) + _t('倍') },
                    { label: _t('观星术增径'), getValue: () => Math.floor((2.0 + enhZhugeLiangRadiusMult) * 100) + '%' }
                ],
                skillImpl: {
                    1: () => {
                        skillText = { text: _t('运筹帷幄，决胜千里'), color: '#66ddff', life: 60 };
                        zhugeLiangSpeedTimer = 180; // 3秒
                        // 风行特效：12个青色风粒子环绕+扩散光环
                        for (let i = 0; i < 12; i++) {
                            const a = (i / 12) * Math.PI * 2;
                            particles.push({
                                type: 'healParticle',
                                x: hero.x + Math.cos(a) * 60, y: hero.y + Math.sin(a) * 60,
                                life: 50, maxLife: 50, color: '#66ddff'
                            });
                        }
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#66ddff', maxRadius: 130, life: 28, maxLife: 28 });
                        particles.push({ type: 'aura', x: hero.x, y: hero.y, radius: 70, color: '#66ddff', life: 180, maxLife: 180, followHero: true });
                    },
                    2: () => {
                        skillText = { text: _t('八卦既成，万物归阵'), color: '#88eeff', life: 60 };
                        zhugeLiangAoeBoostTimer = 120; // 2秒
                        // 八卦阵特效：2个旋转光环+扩散光环
                        const aoeRadius = hero.radius * (2.3 + enhZhugeLiangAoeMult);
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#88eeff', maxRadius: aoeRadius, life: 30, maxLife: 30 });
                        particles.push({ type: 'aura', x: hero.x, y: hero.y, radius: aoeRadius, color: '#88eeff', life: 120, maxLife: 120, followHero: true });
                        // 8个方位八卦粒子
                        for (let i = 0; i < 8; i++) {
                            const a = (i / 8) * Math.PI * 2;
                            particles.push({
                                type: 'hit', x: hero.x + Math.cos(a) * aoeRadius * 0.7, y: hero.y + Math.sin(a) * aoeRadius * 0.7,
                                vx: 0, vy: 0, life: 35, maxLife: 35, color: '#88eeff', size: 6
                            });
                        }
                    },
                    3: () => {
                        skillText = { text: _t('观天察地，洞察先机'), color: '#aaffff', life: 60 };
                        zhugeLiangRadiusBoostTimer = 180; // 3秒
                        // 星光特效：20个白色星粒子上升+扩散光环+持续光环
                        for (let i = 0; i < 20; i++) {
                            particles.push({
                                type: 'healParticle',
                                x: hero.x + (Math.random() - 0.5) * 80,
                                y: hero.y + 20 + Math.random() * 30,
                                life: 70 + Math.floor(Math.random() * 30), maxLife: 100, color: '#aaffff'
                            });
                        }
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#aaffff', maxRadius: 150, life: 32, maxLife: 32 });
                        particles.push({ type: 'aura', x: hero.x, y: hero.y, radius: 100, color: '#aaffff', life: 180, maxLife: 180, followHero: true });
                    }
                },
                // 诸葛亮专属肉鸽池（普攻+110概率×1.4，其他常规+50%增强）
                buffs: [
                    { id: 'hp', text: _t('最大生命加330'), apply: () => { stats.hp += 330; hero.maxHp += 330; hero.hp += 330; } },
                    { id: 'attack', text: _t('普通攻击加165'), apply: () => { stats.attack += 165; } },
                    { id: 'crit', text: _t('暴击率提升15%'), apply: () => { addCritRate(0.15); } },
                    { id: 'critDmg', text: _t('暴击伤害+18%'), apply: () => { critDmgMult += 0.18; } },
                    { id: 's1speed', text: _t('神行步加速+7.5%'), apply: () => { enhZhugeLiangSpeed += 0.075; } },
                    { id: 's2aoe', text: _t('八卦阵范围+0.3倍'), apply: () => { enhZhugeLiangAoeMult += 0.3; } },
                    { id: 's3radius', text: _t('观星术半径+60%'), apply: () => { enhZhugeLiangRadiusMult += 0.6; } },
                    { id: 'heal', text: _t('回满血'), apply: () => { hero.hp = hero.maxHp; } }
                ],
                // 普攻+110概率×1.4：通过weight字段控制
                buffWeights: { attack: 1.4 }
            },
            // ===== 新增：张飞（坦克/重装战士，高血量反伤） =====
            zhangfei: {
                name: _t('张飞'), title: _t('燕人 · 重装坦克'), color: '#aaaaaa', icon: '张',
                hp: 350, attack: 60,
                skills: [
                    { name: _t('燕人咆哮'), cd: 240, dmg: 80, desc: _t('范围眩晕3秒+伤害') },
                    { name: _t('丈八蛇矛'), cd: 180, dmg: 240, desc: _t('双向左右喷射贯穿') },
                    { name: _t('万人敌'), cd: 360, dmg: 0, desc: _t('生命上限100%护盾3秒') }
                ],
                skillStats: [
                    { label: _t('燕人咆哮伤害'), getValue: () => stats.skill1 },
                    { label: _t('丈八蛇矛伤害'), getValue: () => stats.skill2 },
                    { label: _t('万人敌护盾'), getValue: () => Math.floor((1.0 + enhZhangFeiShield) * 100) + '%' }
                ],
                skillImpl: {
                    1: () => {
                        skillText = { text: _t('燕人张飞在此！'), color: '#ffaa00', life: 60 };
                        // 范围眩晕+伤害（350范围）
                        for (let e of enemies.slice()) {
                            if (!e.alive) continue;
                            const dx = e.x - hero.x, dy = e.y - hero.y;
                            if (Math.sqrt(dx*dx + dy*dy) < 350) {
                                e.stunTime = 180;
                                e.flashTime = 10;
                                dealDamage(e, stats.skill1, '#ffaa00', 10);
                            }
                        }
                        // 咆哮特效：金色冲击波+扩散光环+震屏
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#ffaa00', maxRadius: 350, life: 30, maxLife: 30 });
                        particles.push({ type: 'shockExplosion', x: hero.x, y: hero.y, color: '#ffcc44', maxRadius: 150, life: 25, maxLife: 25 });
                        for (let i = 0; i < 16; i++) {
                            const a = (i / 16) * Math.PI * 2;
                            particles.push({
                                type: 'hit', x: hero.x, y: hero.y,
                                vx: Math.cos(a) * 8, vy: Math.sin(a) * 8,
                                life: 25, maxLife: 25, color: '#ffaa00', size: 6
                            });
                        }
                        triggerShake(true);
                    },
                    2: () => {
                        skillText = { text: _t('丈八蛇矛，横竖皆杀！'), color: '#cccccc', life: 60 };
                        // 十字攻击范围：左右各500×80 + 上下各500×80
                        for (let e of enemies.slice()) {
                            if (!e.alive) continue;
                            // 左/右范围
                            const inHoriz = Math.abs(e.y - hero.y) < 80 && Math.abs(e.x - hero.x) < 530;
                            // 上/下范围
                            const inVert = Math.abs(e.x - hero.x) < 80 && Math.abs(e.y - hero.y) < 530;
                            if (inHoriz || inVert) {
                                dealDamage(e, stats.skill2, '#cccccc', 14);
                            }
                        }
                        // ===== 蛇矛十字特效：左/右/上/下 各 3层光束 =====
                        // 右向
                        particles.push({ type: 'beam', x: hero.x, y: hero.y, dx: 1, dy: 0, length: 500, color: '#cccccc', life: 28, maxLife: 28 });
                        particles.push({ type: 'beam', x: hero.x, y: hero.y, dx: 1, dy: 0, length: 500, color: '#ffffff', life: 22, maxLife: 22 });
                        particles.push({ type: 'beam', x: hero.x, y: hero.y, dx: 1, dy: 0, length: 500, color: '#dddddd', life: 32, maxLife: 32 });
                        particles.push({ type: 'dash', x1: hero.x, x2: hero.x + 500, y: hero.y, life: 24, maxLife: 24 });
                        // 左向
                        particles.push({ type: 'beam', x: hero.x, y: hero.y, dx: -1, dy: 0, length: 500, color: '#cccccc', life: 28, maxLife: 28 });
                        particles.push({ type: 'beam', x: hero.x, y: hero.y, dx: -1, dy: 0, length: 500, color: '#ffffff', life: 22, maxLife: 22 });
                        particles.push({ type: 'beam', x: hero.x, y: hero.y, dx: -1, dy: 0, length: 500, color: '#dddddd', life: 32, maxLife: 32 });
                        particles.push({ type: 'dash', x1: hero.x, x2: hero.x - 500, y: hero.y, life: 24, maxLife: 24 });
                        // 上向
                        particles.push({ type: 'beam', x: hero.x, y: hero.y, dx: 0, dy: -1, length: 500, color: '#cccccc', life: 28, maxLife: 28 });
                        particles.push({ type: 'beam', x: hero.x, y: hero.y, dx: 0, dy: -1, length: 500, color: '#ffffff', life: 22, maxLife: 22 });
                        particles.push({ type: 'beam', x: hero.x, y: hero.y, dx: 0, dy: -1, length: 500, color: '#dddddd', life: 32, maxLife: 32 });
                        particles.push({ type: 'dash', x1: hero.x, x2: hero.x, y1: hero.y, y2: hero.y - 500, life: 24, maxLife: 24 });
                        // 下向
                        particles.push({ type: 'beam', x: hero.x, y: hero.y, dx: 0, dy: 1, length: 500, color: '#cccccc', life: 28, maxLife: 28 });
                        particles.push({ type: 'beam', x: hero.x, y: hero.y, dx: 0, dy: 1, length: 500, color: '#ffffff', life: 22, maxLife: 22 });
                        particles.push({ type: 'beam', x: hero.x, y: hero.y, dx: 0, dy: 1, length: 500, color: '#dddddd', life: 32, maxLife: 32 });
                        particles.push({ type: 'dash', x1: hero.x, x2: hero.x, y1: hero.y, y2: hero.y + 500, life: 24, maxLife: 24 });
                        // 中心扩散光环+粒子
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#cccccc', maxRadius: 120, life: 26, maxLife: 26 });
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#ffffff', maxRadius: 80, life: 20, maxLife: 20 });
                        for (let i = 0; i < 20; i++) {
                            const a = (i / 20) * Math.PI * 2;
                            particles.push({
                                type: 'hit', x: hero.x, y: hero.y,
                                vx: Math.cos(a) * 6, vy: Math.sin(a) * 6,
                                life: 22, maxLife: 22, color: i % 2 === 0 ? '#cccccc' : '#ffffff', size: 5
                            });
                        }
                        triggerShake(true);
                    },
                    3: () => {
                        skillText = { text: _t('万人敌，铜墙铁壁！'), color: '#ffdd44', life: 60 };
                        // 获得生命上限100%临时护盾，持续3秒（+肉鸽增强）
                        const shieldAmount = Math.floor(hero.maxHp * (1.0 + enhZhangFeiShield));
                        hero.shield = shieldAmount;
                        zhangFeiShieldTimer = 180; // 3秒
                        // 护盾特效：金色护盾光环+多层扩散+粒子
                        particles.push({ type: 'aura', x: hero.x, y: hero.y, radius: 95, color: '#ffdd44', life: 180, maxLife: 180, followHero: true });
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#ffdd44', maxRadius: 130, life: 30, maxLife: 30 });
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#ffffaa', maxRadius: 100, life: 25, maxLife: 25 });
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#ffffff', maxRadius: 70, life: 20, maxLife: 20 });
                        // 16个金色粒子环绕
                        for (let i = 0; i < 16; i++) {
                            const a = (i / 16) * Math.PI * 2;
                            particles.push({
                                type: 'hit', x: hero.x + Math.cos(a) * 75, y: hero.y + Math.sin(a) * 75,
                                vx: 0, vy: 0, life: 50, maxLife: 50, color: '#ffdd44', size: 7
                            });
                        }
                        triggerShake(true);
                    }
                },
                // 张飞专属肉鸽池
                buffs: [
                    { id: 'hp', text: _t('最大生命加280'), apply: () => { stats.hp += 280; hero.maxHp += 280; hero.hp += 280; } },
                    { id: 'attack', text: _t('普通攻击加100'), apply: () => { stats.attack += 100; } },
                    { id: 'skill1', text: _t('一技能伤害加60'), apply: () => { stats.skill1 += 60; } },
                    { id: 'skill2', text: _t('二技能伤害加180'), apply: () => { stats.skill2 += 180; } },
                    { id: 's3shield', text: _t('万人敌护盾+10%'), apply: () => { enhZhangFeiShield += 0.1; } },
                    { id: 'crit', text: _t('暴击率提升10%'), apply: () => { addCritRate(0.1); } },
                    { id: 'critDmg', text: _t('暴击伤害+12%'), apply: () => { critDmgMult += 0.12; } },
                    { id: 'heal', text: _t('回满血'), apply: () => { hero.hp = hero.maxHp; } }
                ]
            },
            // ===== 新增：周瑜（火焰机动/三位移刺客，低血高伤连斩） =====
            zhouyu: {
                name: _t('周瑜'), title: _t('火神 · 烈焰机动'), color: '#ff7733', icon: '周',
                hp: 225, attack: 30,
                skills: [
                    { name: _t('焰冲斩'), cd: 120, dmg: 105, desc: _t('前方突进贯穿+1秒无敌') },
                    { name: _t('炎突斩'), cd: 120, dmg: 105, desc: _t('前方突进贯穿+1秒无敌') },
                    { name: _t('焚影刺'), cd: 120, dmg: 105, desc: _t('前方突进贯穿+1秒无敌（独立冷却）') }
                ],
                skillStats: [
                    { label: _t('焰冲斩伤害'), getValue: () => 105 + enhZhouyuSkill1Dmg },
                    { label: _t('炎突斩伤害'), getValue: () => 105 + enhZhouyuSkill2Dmg },
                    { label: _t('焚影刺伤害'), getValue: () => 105 + enhZhouyuSkill3Dmg }
                ],
                skillImpl: {
                    1: () => {
                        skillText = { text: _t('焰冲斩，风火燎原！'), color: '#ff5522', life: 60 };
                        hero.invincibleTime = 60; // 1秒无敌
                        const dashDist = 220;
                        const oldX = hero.x;
                        hero.x = Math.max(30, Math.min(MAP_WIDTH - 30, hero.x + hero.facing * dashDist));
                        const dmg = 105 + enhZhouyuSkill1Dmg;
                        for (let e of enemies.slice()) {
                            if (!e.alive) continue;
                            const minX = Math.min(oldX, hero.x), maxX = Math.max(oldX, hero.x);
                            if (e.x >= minX - 30 && e.x <= maxX + 30 && Math.abs(e.y - hero.y) < 70) {
                                dealDamage(e, dmg, '#ff5522', 12);
                            }
                        }
                        // 焰冲斩特效：深红火焰拖尾（沿路径25颗火焰粒子）+ 起终点爆发 + 双层光环
                        for (let i = 0; i < 25; i++) {
                            const t = i / 25;
                            particles.push({
                                type: 'flame',
                                x: oldX + (hero.x - oldX) * t + (Math.random() - 0.5) * 10,
                                y: hero.y + (Math.random() - 0.5) * 28,
                                vx: (Math.random() - 0.5) * 1.5, vy: -0.8 - Math.random() * 1.8,
                                life: 25 + Math.floor(Math.random() * 10), maxLife: 35, size: 7
                            });
                        }
                        particles.push({ type: 'shockExplosion', x: oldX, y: hero.y, color: '#ff2200', maxRadius: 90, life: 22, maxLife: 22 });
                        particles.push({ type: 'shockExplosion', x: hero.x, y: hero.y, color: '#ff5522', maxRadius: 120, life: 28, maxLife: 28 });
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#ff5522', maxRadius: 140, life: 30, maxLife: 30 });
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#ff8844', maxRadius: 95, life: 24, maxLife: 24 });
                        for (let i = 0; i < 14; i++) {
                            const a = (i / 14) * Math.PI * 2;
                            particles.push({
                                type: 'hit', x: hero.x, y: hero.y,
                                vx: Math.cos(a) * 5.5, vy: Math.sin(a) * 5.5,
                                life: 22, maxLife: 22, color: '#ff5522', size: 5
                            });
                        }
                        triggerShake(true);
                    },
                    2: () => {
                        skillText = { text: _t('炎突斩，一击贯穿！'), color: '#ffaa33', life: 60 };
                        hero.invincibleTime = 60; // 1秒无敌
                        const dashDist = 220;
                        const oldX = hero.x;
                        hero.x = Math.max(30, Math.min(MAP_WIDTH - 30, hero.x + hero.facing * dashDist));
                        const dmg = 105 + enhZhouyuSkill2Dmg;
                        for (let e of enemies.slice()) {
                            if (!e.alive) continue;
                            const minX = Math.min(oldX, hero.x), maxX = Math.max(oldX, hero.x);
                            if (e.x >= minX - 30 && e.x <= maxX + 30 && Math.abs(e.y - hero.y) < 70) {
                                dealDamage(e, dmg, '#ffaa33', 12);
                            }
                        }
                        // 炎突斩特效：橙色火焰拖尾（沿路径30颗火焰粒子）+ 起终点爆发 + 多层光环
                        for (let i = 0; i < 30; i++) {
                            const t = i / 30;
                            particles.push({
                                type: 'flame',
                                x: oldX + (hero.x - oldX) * t + (Math.random() - 0.5) * 12,
                                y: hero.y + (Math.random() - 0.5) * 30,
                                vx: (Math.random() - 0.5) * 2, vy: -1 - Math.random() * 2,
                                life: 28 + Math.floor(Math.random() * 12), maxLife: 40, size: 8
                            });
                        }
                        particles.push({ type: 'shockExplosion', x: oldX, y: hero.y, color: '#ff4400', maxRadius: 100, life: 24, maxLife: 24 });
                        particles.push({ type: 'shockExplosion', x: hero.x, y: hero.y, color: '#ffaa33', maxRadius: 140, life: 30, maxLife: 30 });
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#ff7733', maxRadius: 160, life: 32, maxLife: 32 });
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#ffcc66', maxRadius: 110, life: 26, maxLife: 26 });
                        // 终点16颗橙色粒子爆散
                        for (let i = 0; i < 16; i++) {
                            const a = (i / 16) * Math.PI * 2;
                            particles.push({
                                type: 'hit', x: hero.x, y: hero.y,
                                vx: Math.cos(a) * 6, vy: Math.sin(a) * 6,
                                life: 25, maxLife: 25, color: '#ffaa33', size: 6
                            });
                        }
                        triggerShake(true);
                    },
                    3: () => {
                        skillText = { text: _t('焚影刺，烈焰残像！'), color: '#ffcc33', life: 60 };
                        hero.invincibleTime = 60; // 1秒无敌
                        const dashDist = 220;
                        const oldX = hero.x;
                        hero.x = Math.max(30, Math.min(MAP_WIDTH - 30, hero.x + hero.facing * dashDist));
                        const dmg = 105 + enhZhouyuSkill3Dmg;
                        for (let e of enemies.slice()) {
                            if (!e.alive) continue;
                            const minX = Math.min(oldX, hero.x), maxX = Math.max(oldX, hero.x);
                            if (e.x >= minX - 30 && e.x <= maxX + 30 && Math.abs(e.y - hero.y) < 70) {
                                dealDamage(e, dmg, '#ffcc33', 12);
                            }
                        }
                        // 焚影刺特效：金色火焰拖尾（沿路径40颗火焰粒子，更密更亮）+ 起终点爆发 + 多层光环 + 残像
                        for (let i = 0; i < 40; i++) {
                            const t = i / 40;
                            particles.push({
                                type: 'flame',
                                x: oldX + (hero.x - oldX) * t + (Math.random() - 0.5) * 14,
                                y: hero.y + (Math.random() - 0.5) * 36,
                                vx: (Math.random() - 0.5) * 2.5, vy: -1.5 - Math.random() * 2.5,
                                life: 32 + Math.floor(Math.random() * 14), maxLife: 46, size: 9
                            });
                        }
                        particles.push({ type: 'shockExplosion', x: oldX, y: hero.y, color: '#ffcc00', maxRadius: 110, life: 26, maxLife: 26 });
                        particles.push({ type: 'shockExplosion', x: hero.x, y: hero.y, color: '#ffcc33', maxRadius: 150, life: 32, maxLife: 32 });
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#ffcc33', maxRadius: 180, life: 34, maxLife: 34 });
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#ffffaa', maxRadius: 130, life: 28, maxLife: 28 });
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#ffffff', maxRadius: 80, life: 22, maxLife: 22 });
                        // 终点20颗金色粒子爆散
                        for (let i = 0; i < 20; i++) {
                            const a = (i / 20) * Math.PI * 2;
                            particles.push({
                                type: 'hit', x: hero.x, y: hero.y,
                                vx: Math.cos(a) * 7, vy: Math.sin(a) * 7,
                                life: 28, maxLife: 28, color: i % 2 === 0 ? '#ffcc33' : '#ffffff', size: 7
                            });
                        }
                        // 持续金色光环（突进后残像）
                        particles.push({ type: 'aura', x: hero.x, y: hero.y, radius: 80, color: '#ffcc33', life: 90, maxLife: 90, followHero: true });
                        triggerShake(true);
                    }
                },
                // 周瑜专属肉鸽池（三个位移技能各自独立+400伤害 = +100%增强）
                buffs: [
                    { id: 'hp', text: _t('最大生命加180'), apply: () => { stats.hp += 180; hero.maxHp += 180; hero.hp += 180; } },
                    { id: 'attack', text: _t('普通攻击加110'), apply: () => { stats.attack += 110; } },
                    { id: 'crit', text: _t('暴击率提升10%'), apply: () => { addCritRate(0.1); } },
                    { id: 'critDmg', text: _t('暴击伤害+12%'), apply: () => { critDmgMult += 0.12; } },
                    { id: 's1dmg', text: _t('焰冲斩伤害+400'), apply: () => { enhZhouyuSkill1Dmg += 400; } },
                    { id: 's2dmg', text: _t('炎突斩伤害+400'), apply: () => { enhZhouyuSkill2Dmg += 400; } },
                    { id: 's3dmg', text: _t('焚影刺伤害+400'), apply: () => { enhZhouyuSkill3Dmg += 400; } },
                    { id: 'heal', text: _t('回满血'), apply: () => { hero.hp = hero.maxHp; } }
                ]
            },
            // ===== 吕蒙：对单刺客 =====
            lvmeng: {
                name: _t('吕蒙'), title: _t('白衣 · 单杀之刃'), color: '#00ccaa', icon: '蒙',
                hp: 156, attack: 20,
                skills: [
                    { name: _t('疾风步'), cd: 120, dmg: 0, desc: _t('移速+60%持续2秒') },
                    { name: _t('暗影突袭'), cd: 180, dmg: 59, desc: _t('突进贯穿伤害') },
                    { name: _t('天诛导弹'), cd: 300, dmg: 300, desc: _t('锁定血量最高单体发射导弹') }
                ],
                skillStats: [
                    { label: _t('疾风步移速'), getValue: () => Math.floor((0.6 + enhLvmengSpeed) * 100) + '%' },
                    { label: _t('暗影突袭伤害'), getValue: () => stats.skill2 },
                    { label: _t('天诛导弹伤害'), getValue: () => stats.skill3 }
                ],
                skillImpl: {
                    1: () => {
                        lvmengSpeedBoostTimer = 120;
                        skillText = { text: _t('疾风无影！'), color: '#00ffcc', life: 60 };
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#00ccaa', maxRadius: 150, life: 25, maxLife: 25 });
                        for (let i = 0; i < 20; i++) {
                            const a = Math.random() * Math.PI * 2;
                            particles.push({ type: 'burst', x: hero.x, y: hero.y, vx: Math.cos(a)*5, vy: Math.sin(a)*5, life: 25, maxLife: 25, color: '#00ffcc', size: 4 });
                        }
                    },
                    2: () => {
                        hero.invincibleTime = 30;
                        skillText = { text: _t('暗影贯穿！'), color: '#00ffcc', life: 60 };
                        const dashDist = 200;
                        const oldX = hero.x;
                        hero.x = Math.max(30, Math.min(MAP_WIDTH-30, hero.x + hero.facing * dashDist));
                        for (let e of enemies.slice()) {
                            if (!e.alive) continue;
                            const minX = Math.min(oldX, hero.x), maxX = Math.max(oldX, hero.x);
                            if (e.x >= minX - 30 && e.x <= maxX + 30 && Math.abs(e.y - hero.y) < 60) {
                                dealDamage(e, stats.skill2, '#00ffff', 12);
                            }
                        }
                        particles.push({ type: 'dash', x1: oldX, x2: hero.x, y: hero.y, life: 20, maxLife: 20 });
                        particles.push({ type: 'bloodDash', x1: oldX, x2: hero.x, y: hero.y, life: 28, maxLife: 28 });
                        particles.push({ type: 'shockExplosion', x: oldX, y: hero.y, color: '#00ccaa', maxRadius: 80, life: 20, maxLife: 20 });
                        particles.push({ type: 'shockExplosion', x: hero.x, y: hero.y, color: '#00ccaa', maxRadius: 110, life: 25, maxLife: 25 });
                        triggerShake(true);
                    },
                    3: () => {
                        skillText = { text: _t('天诛——灭！'), color: '#00ffcc', life: 60 };
                        // 找血量最高的敌人
                        let target = null;
                        let maxHp = -1;
                        const candidates = [];
                        for (const e of enemies) {
                            if (!e.alive) continue;
                            if (e.hp > maxHp) {
                                maxHp = e.hp;
                                candidates.length = 0;
                                candidates.push(e);
                            } else if (e.hp === maxHp) {
                                candidates.push(e);
                            }
                        }
                        if (candidates.length > 0) {
                            target = candidates[Math.floor(Math.random() * candidates.length)];
                            lvmengMissiles.push({
                                x: hero.x, y: hero.y - 20,
                                targetX: target.x, targetY: target.y,
                                target: target,
                                life: 120, speed: 14,
                                dmg: stats.skill3
                            });
                            // 锁定标记特效
                            particles.push({ type: 'ringExpand', x: target.x, y: target.y, color: '#ff3300', maxRadius: 60, life: 30, maxLife: 30 });
                            particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#00ffcc', maxRadius: 100, life: 20, maxLife: 20 });
                        }
                    }
                },
                // 吕蒙专属肉鸽增强（基础数值同吕布，二技能增强同吕布三技能）
                buffs: [
                    { id: 'hp', text: _t('最大生命加299'), apply: () => { stats.hp += 299; hero.maxHp += 299; hero.hp += 299; } },
                    { id: 'attack', text: _t('普通攻击加299'), apply: () => { stats.attack += 299; } },
                    { id: 's1speed', text: _t('疾风步加速+6%'), apply: () => { enhLvmengSpeed += 0.06; } },
                    { id: 'skill2', text: _t('暗影突袭伤害加209'), apply: () => { stats.skill2 += 209; } },
                    { id: 'skill3', text: _t('天诛导弹伤害加600'), apply: () => { stats.skill3 += 600; } },
                    { id: 'crit', text: _t('暴击率提升15%'), apply: () => { addCritRate(0.15); } },
                    { id: 'critDmg', text: _t('暴击伤害+18%'), apply: () => { critDmgMult += 0.18; } },
                    { id: 'heal', text: _t('回满血'), apply: () => { hero.hp = hero.maxHp; } }
                ]
            },
            // ===== 墨子：光学机关师（站桩远程，折射激光，基础数值同吕布/吕蒙） =====
            mozi: {
                name: _t('墨子'), title: _t('光学 · 镜面之主'), color: '#7DDFFF', color2: '#BBEEFF', icon: '墨',
                hp: 156, attack: 20,
                skills: [
                    { name: _t('光束'), cd: 150, dmg: 100, desc: _t('自动锁定最近敌人发射激光，可折射1次，折射后是新段可再伤同一敌人') },
                    { name: _t('聚束'), cd: 180, dmg: 0, desc: _t('强化下一次激光：宽度×2') },
                    { name: _t('多镜面'), cd: 180, dmg: 0, desc: _t('强化下一次激光：折射+1次') }
                ],
                skillStats: [
                    { label: _t('光束伤害'), getValue: () => stats.skill1 },
                    { label: _t('聚束宽度倍率'), getValue: () => (moziNextBeamWidthMult).toFixed(1) + 'x' },
                    { label: _t('多镜面折射'), getValue: () => moziNextBeamExtraBounces + _t('次') }
                ],
                skillImpl: {
                    // ===== 一技能「光束」：自动锁定最近敌人方向，发射穿透激光（穿过所有敌人），可折射，每段只伤1次但折射段是新段 =====
                    // 平衡限制：只有视野范围内(camX~camX+WIDTH, camY~camY+HEIGHT)有活着的敌人才能释放，否则无效（退回CD不消耗）
                    1: () => {
                        // 简单算法防内存：只遍历视野范围内的enemies取最近1个
                        let target = null, minD = Infinity;
                        for (const e of enemies) {
                            if (!e.alive) continue;
                            // 视野范围过滤（camX/camY为相机左上角世界坐标，WIDTH/HEIGHT为可视区域）
                            if (e.x < camX || e.x > camX + WIDTH || e.y < camY || e.y > camY + HEIGHT) continue;
                            const d = (e.x - hero.x) ** 2 + (e.y - hero.y) ** 2;
                            if (d < minD) { minD = d; target = e; }
                        }
                        // 视野内无敌人：技能无效，退回CD（useSkill已在调用前设置了CD，这里清零）
                        if (!target) {
                            skillText = { text: _t('视野内无敌人'), color: '#ff6666', life: 40 };
                            skillCooldown[1] = 0;  // 退回CD，不消耗
                            return;
                        }
                        // 计算激光方向角（锁定目标方向）
                        const ang = Math.atan2(target.y - hero.y, target.x - hero.x);
                        // ===== 激光穿过所有敌人：沿方向延伸到墙边（计算与4面墙的交点取最近） =====
                        const ux = Math.cos(ang), uy = Math.sin(ang);
                        let tWall = Infinity;
                        // 右墙
                        if (ux > 0) tWall = Math.min(tWall, (MAP_WIDTH - hero.x) / ux);
                        // 左墙
                        if (ux < 0) tWall = Math.min(tWall, (0 - hero.x) / ux);
                        // 下墙
                        if (uy > 0) tWall = Math.min(tWall, (MAP_HEIGHT - hero.y) / uy);
                        // 上墙
                        if (uy < 0) tWall = Math.min(tWall, (0 - hero.y) / uy);
                        const endX = hero.x + ux * tWall;
                        const endY = hero.y + uy * tWall;
                        moziLasers.push({
                            x1: hero.x, y1: hero.y,
                            x2: endX, y2: endY,           // 终点延伸到墙边，穿透一整行所有敌人
                            life: 42, maxLife: 42,       // 0.7秒=42帧
                            width: 40 * moziNextBeamWidthMult,
                            bouncesLeft: 1 + moziNextBeamExtraBounces,
                            hitSet: new Set(),            // 本段已伤害的敌人ID（防止同段重复伤）
                            dmg: stats.skill1,
                            color: '#7DDFFF',
                            isOrigin: true
                        });
                        skillText = { text: _t('光束——发射！'), color: '#7DDFFF', life: 60 };
                        // 发射粒子特效
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#7DDFFF', maxRadius: 90, life: 22, maxLife: 22 });
                        for (let i = 0; i < 12; i++) {
                            const a = Math.random() * Math.PI * 2;
                            particles.push({ type: 'burst', x: hero.x, y: hero.y, vx: Math.cos(a)*4, vy: Math.sin(a)*4, life: 18, maxLife: 18, color: '#BBEEFF', size: 3 });
                        }
                        // 一技能发射后，清空二/三技能的"下一次强化"状态（已消耗）
                        moziNextBeamWidthMult = 1.0;
                        moziNextBeamExtraBounces = 0;
                    },
                    // ===== 二技能「聚束」：强化下一次激光宽度×2（+强化每次+0.3） =====
                    2: () => {
                        moziNextBeamWidthMult = 2.0 + enhMoziWidthMult;
                        skillText = { text: _t('聚束模式。'), color: '#BBEEFF', life: 60 };
                        // 聚束强化特效：镜面碎片环绕+能量收缩光环
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#BBEEFF', maxRadius: 90, life: 24, maxLife: 24 });
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#7DDFFF', maxRadius: 60, life: 18, maxLife: 18 });
                        for (let i = 0; i < 8; i++) {
                            const a = (i / 8) * Math.PI * 2;
                            particles.push({
                                type: 'hit',
                                x: hero.x + Math.cos(a) * 70, y: hero.y + Math.sin(a) * 70,
                                vx: -Math.cos(a) * 2, vy: -Math.sin(a) * 2,
                                life: 30, maxLife: 30, color: i % 2 === 0 ? '#7DDFFF' : '#BBEEFF', size: 5
                            });
                        }
                    },
                    // ===== 三技能「多镜面」：强化下一次激光折射+1次（+强化每次+1） =====
                    3: () => {
                        moziNextBeamExtraBounces = 1 + enhMoziBounces;
                        skillText = { text: _t('镜面，已就位。'), color: '#7DDFFF', life: 60 };
                        // 镜面碎片环绕特效
                        for (let i = 0; i < 6; i++) {
                            const a = (i / 6) * Math.PI * 2;
                            particles.push({
                                type: 'shockExplosion',
                                x: hero.x + Math.cos(a) * 60, y: hero.y + Math.sin(a) * 60,
                                color: '#7DDFFF', maxRadius: 30, life: 25, maxLife: 25
                            });
                        }
                    }
                },
                // ===== 墨子专属肉鸽强化（8层，仿其他英雄：HP/攻击/3技能/暴击/爆伤/回血） =====
                buffs: [
                    { id: 'hp', text: _t('最大生命加299'), apply: () => { stats.hp += 299; hero.maxHp += 299; hero.hp += 299; } },
                    { id: 'attack', text: _t('普通攻击加299'), apply: () => { stats.attack += 299; } },
                    { id: 'skill1', text: _t('一技能伤害加165'), apply: () => { stats.skill1 += 165; } },
                    { id: 'skill2', text: _t('聚束宽度倍率+0.3'), apply: () => { enhMoziWidthMult += 0.3; } },
                    { id: 'skill3', text: _t('多镜面折射+1次'), apply: () => { enhMoziBounces += 1; } },
                    { id: 'crit', text: _t('暴击率提升15%'), apply: () => { addCritRate(0.15); } },
                    { id: 'critDmg', text: _t('暴击伤害+18%'), apply: () => { critDmgMult += 0.18; } },
                    { id: 'heal', text: _t('回满血'), apply: () => { hero.hp = hero.maxHp; } }
                ]
            },
            // ===== 韩非（法家·律令裁决）：灰色基调，雾隐/视线替换/最终审判 =====
            // 基础数值按赵云模板（HP 300 / 攻击 36 / 速度 2.3 困难基准）
            hanfei: {
                name: _t('韩非'), title: _t('法家 · 律令裁决'), color: '#7a7a7a', icon: '韩',
                hp: 300, attack: 36,
                skills: [
                    { name: _t('雾隐'), cd: 360, dmg: 0, desc: _t('敌方静止3秒，攻击则提前结束') },
                    { name: _t('视线替换'), cd: 300, dmg: 0, desc: _t('回血30%+加速40% 2秒') },
                    { name: _t('最终审判'), cd: 480, dmg: 200, desc: _t('全屏光束审判') }
                ],
                skillStats: [
                    { label: _t('雾隐持续'), getValue: () => '3' + _t('秒') },
                    { label: _t('视线替换回血'), getValue: () => Math.floor((0.30 + enhHanFeiHeal) * 100) + '%' },
                    { label: _t('最终审判伤害'), getValue: () => stats.skill3 + enhHanFeiJudgementDmg }
                ],
                skillImpl: {
                    // ===== 一技能 雾隐：所有敌方静止3秒（180帧），英雄攻击则提前结束 =====
                    // 与冥渊 timeFrozen 独立，互不干扰（timeFrozen 冻结所有生物，heroFreezeTimer 仅冻结敌方）
                    1: () => {
                        skillText = { text: _t('雾隐虚空，万物凝滞'), color: '#888888', life: 60 };
                        heroFreezeTimer = 180;       // 3秒 = 180帧
                        heroFogHidden = true;        // 英雄进入"隐身"形态（绘制全黑+灰色烟雾）
                        // 启动特效：60个灰色烟雾粒子环绕爆发
                        for (let i = 0; i < 60; i++) {
                            const a = (i / 60) * Math.PI * 2;
                            const sp = 2 + Math.random() * 5;
                            particles.push({
                                type: 'hit', x: hero.x, y: hero.y,
                                vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                                life: 40, maxLife: 40,
                                color: i % 2 === 0 ? '#444444' : '#888888', size: 8
                            });
                        }
                        // 3层灰色光环扩散（深→浅）
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#aaaaaa', maxRadius: 400, life: 35, maxLife: 35 });
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#666666', maxRadius: 500, life: 30, maxLife: 30 });
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#333333', maxRadius: 600, life: 25, maxLife: 25 });
                        triggerShake(false);
                    },
                    // ===== 二技能 视线替换：立即回30%生命+加速40%持续2秒（120帧） =====
                    2: () => {
                        skillText = { text: _t('明察秋毫，律法无私'), color: '#aaccff', life: 60 };
                        const healRatio = 0.30 + enhHanFeiHeal;
                        const heal = Math.floor(hero.maxHp * healRatio);
                        hero.hp = Math.min(hero.maxHp, hero.hp + heal);
                        showDamage(hero.x, hero.y - 30, heal, '#44ff44');
                        hanFeiSpeedBoostTimer = 120;  // 加速持续2秒 = 120帧
                        // 视线替换强化特效：20个青色+白色回血粒子+多层律法光环+眼睛符文
                        for (let i = 0; i < 20; i++) {
                            particles.push({
                                type: 'healParticle',
                                x: hero.x + (Math.random() - 0.5) * 60,
                                y: hero.y + 20 + Math.random() * 20,
                                life: 60 + Math.floor(Math.random() * 30), maxLife: 90,
                                color: i % 2 === 0 ? '#44ff44' : '#aaccff'
                            });
                        }
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#aaccff', maxRadius: 140, life: 35, maxLife: 35 });
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#ffffff', maxRadius: 100, life: 28, maxLife: 28 });
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#888888', maxRadius: 60, life: 22, maxLife: 22 });
                        // 眼睛/书卷符号粒子：灰色小点组成的旋转环
                        for (let i = 0; i < 12; i++) {
                            const a = (i / 12) * Math.PI * 2;
                            particles.push({
                                type: 'hit',
                                x: hero.x + Math.cos(a) * 50, y: hero.y + Math.sin(a) * 50,
                                vx: -Math.sin(a) * 3, vy: Math.cos(a) * 3,
                                life: 45, maxLife: 45, color: '#aaaaaa', size: 4
                            });
                        }
                    },
                    // ===== 三技能 最终审判：全屏光束审判（200伤害），光束特效且更大 =====
                    3: () => {
                        skillText = { text: _t('律令既下，万物归寂'), color: '#cccccc', life: 60 };
                        const dmg = stats.skill3 + enhHanFeiJudgementDmg;
                        // 全屏每个敌人降下灰色光束审判
                        for (let e of enemies.slice()) {
                            if (!e.alive) continue;
                            dealDamage(e, dmg, '#cccccc', 12);
                            // 双层光束从天而降（白色外层+灰色内层，更大尺寸）
                            particles.push({ type: 'beam', x: e.x, y: e.y - 600, dx: 0, dy: 1, length: 600, color: '#ffffff', life: 30, maxLife: 30 });
                            particles.push({ type: 'beam', x: e.x, y: e.y - 600, dx: 0, dy: 1, length: 600, color: '#888888', life: 25, maxLife: 25 });
                            spawnHitParticles(e.x, e.y, '#cccccc', 10);
                            // 命中光柱
                            particles.push({ type: 'shockExplosion', x: e.x, y: e.y, color: '#ffffff', maxRadius: 80, life: 25, maxLife: 25 });
                        }
                        // 全屏60个灰白光点闪烁（审判降临）
                        for (let i = 0; i < 60; i++) {
                            particles.push({
                                type: 'hit', x: camX + Math.random() * WIDTH, y: camY + Math.random() * HEIGHT,
                                vx: 0, vy: 0,
                                life: 30, maxLife: 30,
                                color: i % 2 === 0 ? '#ffffff' : '#888888', size: 6
                            });
                        }
                        // 3层全屏光环（白→灰→深灰，更大范围）
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#ffffff', maxRadius: 600, life: 35, maxLife: 35 });
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#aaaaaa', maxRadius: 700, life: 30, maxLife: 30 });
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#555555', maxRadius: 800, life: 25, maxLife: 25 });
                        triggerShake(true);
                    }
                },
                // ===== 韩非专属肉鸽增强（8项：HP/攻击/二技能回血/二技能加速/三技能/暴击/爆伤/回血） =====
                // 注：一技能按用户要求无后续加强
                buffs: [
                    { id: 'hp', text: _t('最大生命加200'), apply: () => { stats.hp += 200; hero.maxHp += 200; hero.hp += 200; } },
                    { id: 'attack', text: _t('普通攻击加70'), apply: () => { stats.attack += 70; } },
                    { id: 's2heal', text: _t('视线替换回血比例+7%'), apply: () => { enhHanFeiHeal += 0.07; } },
                    { id: 's2speed', text: _t('视线替换加速比例+7%'), apply: () => { enhHanFeiSpeed += 0.07; } },
                    { id: 'skill3', text: _t('最终审判伤害加200'), apply: () => { enhHanFeiJudgementDmg += 200; } },
                    { id: 'crit', text: _t('暴击率提升10%'), apply: () => { addCritRate(0.1); } },
                    { id: 'critDmg', text: _t('暴击伤害+12%'), apply: () => { critDmgMult += 0.12; } },
                    { id: 'heal', text: _t('回满血'), apply: () => { hero.hp = hero.maxHp; } }
                ]
            },
            // ===== 原创角色1：司马懿 - 天空之主·风雷掌控（风之印记叠加机制） =====
            cangqiong: {
                name: _t('司马懿'), title: _t('天空之主 · 风雷掌控'), color: '#4A90E2', icon: '司',
                hp: 154, attack: 25,  // 全方面削弱30%（原HP220/攻击36）
                ranged: true,
                skills: [
                    { name: _t('旋风斩'), cd: 180, dmg: 56, desc: _t('周身210范围旋风AOE+击退敌人') },
                    { name: _t('天空之眼'), cd: 240, dmg: 70, desc: _t('起飞2.1秒21%加速+1.05秒无敌+350范围天雷') },
                    { name: _t('天罚之雷'), cd: 240, dmg: 21, desc: _t('490范围雷电风暴2.8秒每0.5秒打击') }
                ],
                passive: { name: _t('风之印记'), desc: _t('每释放5次技能获得21%移速加速持续2.1秒') },
                skillStats: [
                    { label: _t('风之印记计数'), getValue: () => cangqiongSkillCount + '/5' },
                    { label: _t('天空之眼天雷'), getValue: () => (70 + enhCangqiongThunderStrikeDmg) + _t('伤害') },
                    { label: _t('天罚之雷伤害'), getValue: () => stats.skill3 + enhCangqiongThunderDmg }
                ],
                skillImpl: {
                    // 一技能 旋风斩：周身210范围旋风AOE+击退（原300-30%）
                    1: () => {
                        skillText = { text: _t('旋风斩，风卷残云'), color: '#4A90E2', life: 60 };
                        const dmg = stats.skill1 + enhCangqiongWhirlDmg;
                        for (let e of enemies.slice()) {
                            if (!e.alive) continue;
                            const dx = e.x - hero.x, dy = e.y - hero.y;
                            const dist = Math.sqrt(dx*dx + dy*dy);
                            if (dist < 210) {
                                dealDamage(e, dmg, '#4A90E2', 8);
                                // 击退效果（原50-30%）
                                if (dist > 0) {
                                    e.x += (dx/dist) * 35;
                                    e.y += (dy/dist) * 35;
                                }
                            }
                        }
                        // 天蓝旋风光环（3层）+ 30粒子放射
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#4A90E2', maxRadius: 210, life: 30, maxLife: 30 });
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#87CEEB', maxRadius: 175, life: 25, maxLife: 25 });
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#ffffff', maxRadius: 140, life: 20, maxLife: 20 });
                        for (let i = 0; i < 30; i++) {
                            const a = (i / 30) * Math.PI * 2;
                            const r = 50 + Math.random() * 100;
                            particles.push({
                                type: 'hit', x: hero.x + Math.cos(a) * r, y: hero.y + Math.sin(a) * r,
                                vx: Math.cos(a) * 6, vy: Math.sin(a) * 6,
                                life: 30, maxLife: 30, color: '#87CEEB', size: 6
                            });
                        }
                        triggerShake(false);
                    },
                    // 二技能 天空之眼：起飞2.1秒21%加速+1.05秒无敌+350范围天雷固定伤害（全削弱30%）
                    2: () => {
                        skillText = { text: _t('天空之眼，俯瞰苍生'), color: '#87CEEB', life: 60 };
                        cangqiongFlyingTimer = 126; // 2.1秒=126帧起飞加速（原3秒-30%）
                        hero.invincibleTime = 63; // 1.05秒=63帧无敌（原1.5秒-30%）
                        // 立即召唤天雷打击周围350范围（固定伤害70+肉鸽每次+56）
                        const thunderDmg = 70 + enhCangqiongThunderStrikeDmg;
                        for (let e of enemies.slice()) {
                            if (!e.alive) continue;
                            const dx = e.x - hero.x, dy = e.y - hero.y;
                            if (Math.sqrt(dx*dx + dy*dy) < 350) {
                                dealDamage(e, thunderDmg, '#ffff44', 10);
                            }
                        }
                        // 飞行启动特效：上升光环+30个天蓝粒子+8道天雷光柱
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#4A90E2', maxRadius: 175, life: 35, maxLife: 35 });
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#87CEEB', maxRadius: 140, life: 30, maxLife: 30 });
                        for (let i = 0; i < 30; i++) {
                            const a = (i / 30) * Math.PI * 2;
                            particles.push({
                                type: 'hit', x: hero.x, y: hero.y,
                                vx: Math.cos(a) * 5, vy: Math.sin(a) * 5 - 3,
                                life: 40, maxLife: 40, color: '#87CEEB', size: 7
                            });
                        }
                        // 8道天雷光柱（半径与范围同步缩小30%）
                        for (let i = 0; i < 8; i++) {
                            const a = (i / 8) * Math.PI * 2;
                            const r = 140;
                            particles.push({
                                type: 'beam', x: hero.x + Math.cos(a) * r, y: hero.y + Math.sin(a) * r,
                                dx: 0, dy: 1, length: 105, color: '#ffff88', life: 25, maxLife: 25
                            });
                            particles.push({
                                type: 'shockExplosion',
                                x: hero.x + Math.cos(a) * r, y: hero.y + Math.sin(a) * r,
                                color: '#ffff44', maxRadius: 42, life: 20, maxLife: 20
                            });
                        }
                        triggerShake(true);
                    },
                    // 三技能 天罚之雷：490范围雷电风暴2.8秒，每0.5秒造成伤害（原700/4秒-30%）
                    3: () => {
                        skillText = { text: _t('天罚之雷，雷鸣万里'), color: '#4A90E2', life: 60 };
                        cangqiongThunderStormTimer = 168; // 2.8秒=168帧（原4秒-30%）
                        cangqiongThunderStormTickTimer = 0;
                        // 启动特效：雷电光环+40个闪电粒子
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#4A90E2', maxRadius: 490, life: 40, maxLife: 40 });
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#ffff44', maxRadius: 420, life: 35, maxLife: 35 });
                        for (let i = 0; i < 40; i++) {
                            particles.push({
                                type: 'beam', x: camX + Math.random() * WIDTH, y: camY + Math.random() * HEIGHT,
                                dx: 0, dy: 1, length: 100 + Math.random() * 80, color: '#ffff88', life: 15, maxLife: 15
                            });
                        }
                        triggerShake(true);
                    }
                },
                buffs: [
                    { id: 'hp', text: _t('最大生命加154'), apply: () => { stats.hp += 154; hero.maxHp += 154; hero.hp += 154; } },
                    { id: 'attack', text: _t('普通攻击加52'), apply: () => { stats.attack += 52; } },
                    { id: 'skill1', text: _t('旋风斩伤害+42'), apply: () => { enhCangqiongWhirlDmg += 42; } },
                    { id: 's2thunder', text: _t('天空之眼天雷+56'), apply: () => { enhCangqiongThunderStrikeDmg += 56; } },
                    { id: 'skill3', text: _t('天罚之雷伤害+21'), apply: () => { enhCangqiongThunderDmg += 21; } },
                    { id: 'crit', text: _t('暴击率提升7%'), apply: () => { addCritRate(0.07); } },
                    { id: 'critDmg', text: _t('暴击伤害+8%'), apply: () => { critDmgMult += 0.08; } },
                    { id: 'heal', text: _t('回满血'), apply: () => { hero.hp = hero.maxHp; } }
                ]
            },
            // ===== 原创角色2：典韦 - 灰烬武者·牺牲觉醒（普攻烬值+烬燃机制） =====
            jin: {
                name: _t('典韦'), title: _t('灰烬武者 · 牺牲觉醒'), color: '#B22222', icon: '典',
                hp: 280, attack: 80,
                skills: [
                    { name: _t('烬突刺'), cd: 180, dmg: 90, desc: _t('突进穿透+沿途伤害') },
                    { name: _t('烬燃'), cd: 300, dmg: 0, desc: _t('立即进入烬燃3秒（不消耗血）') },
                    { name: _t('灰飞烟灭'), cd: 210, dmg: 120, desc: _t('回复40%血+大爆炸（烬燃状态下伤害翻倍）') }
                ],
                passive: { name: _t('烬值觉醒'), desc: _t('普攻叠加烬值，满6次自动进入烬燃3秒（攻击+80%、移速+30%、普攻吸血+50%）') },
                skillStats: [
                    { label: _t('普攻烬值'), getValue: () => jinAttackStacks + '/6' },
                    { label: _t('烬燃状态'), getValue: () => jinEmberBurnTimer > 0 ? _t('激活') : _t('未激活') },
                    { label: _t('灰飞烟灭回血'), getValue: () => Math.floor((0.4 + enhJinExplosionHeal) * 100) + '%' },
                    { label: _t('灰飞烟灭伤害'), getValue: () => stats.skill3 + enhJinExplosionDmg + (jinEmberBurnTimer > 0 ? stats.skill3 : 0) }
                ],
                skillImpl: {
                    // 一技能 烬突刺：突进+穿透伤害
                    1: () => {
                        skillText = { text: _t('烬突刺，势如破竹'), color: '#B22222', life: 60 };
                        const dmg = stats.skill1 + enhJinThrustDmg;
                        const dashDist = 300;
                        const oldX = hero.x, oldY = hero.y;
                        // 朝面向方向突进
                        hero.x = Math.max(30, Math.min(MAP_WIDTH - 30, hero.x + hero.facing * dashDist));
                        // 对路径上敌人造成伤害
                        for (let e of enemies.slice()) {
                            if (!e.alive) continue;
                            const dx = e.x - oldX, dy = e.y - hero.y;
                            if (Math.abs(dy) < 60 && dx * hero.facing > 0 && Math.abs(dx) < dashDist + 50) {
                                dealDamage(e, dmg, '#B22222', 10);
                            }
                        }
                        // 暗红突进拖尾+粒子
                        particles.push({ type: 'dash', x1: oldX, x2: hero.x, y1: hero.y, y2: hero.y, life: 25, maxLife: 25 });
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#B22222', maxRadius: 150, life: 25, maxLife: 25 });
                        particles.push({ type: 'shockExplosion', x: hero.x, y: hero.y, color: '#FF6347', maxRadius: 100, life: 22, maxLife: 22 });
                        for (let i = 0; i < 20; i++) {
                            const a = Math.random() * Math.PI * 2;
                            particles.push({
                                type: 'hit', x: hero.x, y: hero.y,
                                vx: Math.cos(a) * 5, vy: Math.sin(a) * 5,
                                life: 30, maxLife: 30, color: '#FF6347', size: 6
                            });
                        }
                        triggerShake(false);
                    },
                    // 二技能 烬燃：进入烬燃3秒（攻击+80%，移速+30%），不消耗血，刷新持续时间
                    2: () => {
                        skillText = { text: _t('烬燃！灰烬觉醒！'), color: '#FF6347', life: 60 };
                        jinEmberBurnTimer = 180 + enhJinBurnDuration; // 3秒=180帧（+肉鸽每次+36帧=0.6秒）
                        // 暗红怒焰光环+25个火焰粒子上升
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#B22222', maxRadius: 200, life: 35, maxLife: 35 });
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#FF6347', maxRadius: 150, life: 30, maxLife: 30 });
                        for (let i = 0; i < 25; i++) {
                            const a = Math.random() * Math.PI * 2;
                            particles.push({
                                type: 'flame', x: hero.x + Math.cos(a) * 50, y: hero.y + Math.sin(a) * 50,
                                vx: Math.cos(a) * 0.5, vy: -2 - Math.random() * 2,
                                life: 45, maxLife: 45, size: 9
                            });
                        }
                        triggerShake(true);
                    },
                    // 三技能 灰飞烟灭：回复40%血+大爆炸（烬燃状态下伤害翻倍）
                    3: () => {
                        const isBurning = jinEmberBurnTimer > 0;
                        skillText = { text: isBurning ? _t('灰飞烟灭——焚天裂地！') : _t('灰飞烟灭'), color: '#B22222', life: 60 };
                        // 回复40%最大HP（+肉鸽每次+15%）
                        const healRatio = Math.min(1.0, 0.4 + enhJinExplosionHeal);
                        const healAmount = Math.floor(hero.maxHp * healRatio);
                        hero.hp = Math.min(hero.maxHp, hero.hp + healAmount);
                        showDamage(hero.x, hero.y - 30, healAmount, '#44ff44');
                        let dmg = stats.skill3 + enhJinExplosionDmg;
                        if (isBurning) dmg *= 2; // 烬燃状态下伤害翻倍
                        for (let e of enemies.slice()) {
                            if (!e.alive) continue;
                            const dx = e.x - hero.x, dy = e.y - hero.y;
                            if (Math.sqrt(dx*dx + dy*dy) < 500) {
                                dealDamage(e, dmg, '#B22222', 15);
                            }
                        }
                        // 大爆炸特效：5层光环+50粒子+冲击波
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#B22222', maxRadius: 500, life: 40, maxLife: 40 });
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#FF6347', maxRadius: 400, life: 35, maxLife: 35 });
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#ffff44', maxRadius: 300, life: 30, maxLife: 30 });
                        particles.push({ type: 'shockExplosion', x: hero.x, y: hero.y, color: '#ff0000', maxRadius: 250, life: 35, maxLife: 35 });
                        particles.push({ type: 'shockExplosion', x: hero.x, y: hero.y, color: '#FF6347', maxRadius: 200, life: 30, maxLife: 30 });
                        for (let i = 0; i < 50; i++) {
                            const a = (i / 50) * Math.PI * 2;
                            const sp = 4 + Math.random() * 6;
                            particles.push({
                                type: 'hit', x: hero.x, y: hero.y,
                                vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                                life: 40, maxLife: 40, color: i % 2 === 0 ? '#FF6347' : '#ffff44', size: 8
                            });
                        }
                        triggerShake(true);
                    }
                },
                buffs: [
                    { id: 'hp', text: _t('最大生命加250'), apply: () => { stats.hp += 250; hero.maxHp += 250; hero.hp += 250; } },
                    { id: 'attack', text: _t('普通攻击加80'), apply: () => { stats.attack += 80; } },
                    { id: 'skill1', text: _t('烬突刺伤害+30'), apply: () => { enhJinThrustDmg += 30; } },
                    { id: 's2duration', text: _t('烬燃持续+0.6秒'), apply: () => { enhJinBurnDuration += 36; } },
                    { id: 'skill3', text: _t('灰飞烟灭伤害+120'), apply: () => { enhJinExplosionDmg += 120; } },
                    { id: 'skill3heal', text: _t('灰飞烟灭回血+15%'), apply: () => { enhJinExplosionHeal += 0.15; } },
                    { id: 'crit', text: _t('暴击率提升10%'), apply: () => { addCritRate(0.1); } },
                    { id: 'critDmg', text: _t('暴击伤害+12%'), apply: () => { critDmgMult += 0.12; } },
                    { id: 'heal', text: _t('回满血'), apply: () => { hero.hp = hero.maxHp; } }
                ]
            },
            // ===== 原创角色3：鲁肃 - 水之法师·潮汐护盾（护盾+持续回血） =====
            lan: {
                name: _t('鲁肃'), title: _t('水之法师 · 潮汐护盾'), color: '#1E90FF', icon: '鲁',
                hp: 200, attack: 32,
                ranged: true,
                skills: [
                    { name: _t('水柱'), cd: 180, dmg: 75, desc: _t('召唤水柱眩晕1秒+伤害') },
                    { name: _t('潮汐护盾'), cd: 240, dmg: 0, desc: _t('护盾180+每秒回5%持续4秒') },
                    { name: _t('深海怒涛'), cd: 480, dmg: 100, desc: _t('巨浪600范围单次伤害+减速6秒（非持续伤害）') }
                ],
                skillStats: [
                    { label: _t('潮汐护盾吸收'), getValue: () => 180 + enhLanShieldHp },
                    { label: _t('潮汐护盾每秒回血'), getValue: () => Math.floor((0.05 + enhLanHealPct) * 100) + '%' },
                    { label: _t('深海怒涛伤害'), getValue: () => stats.skill3 }
                ],
                skillImpl: {
                    // 一技能 水柱：召唤水柱眩晕1秒+伤害（击飞效果等同眩晕）
                    1: () => {
                        skillText = { text: _t('水柱冲天，破浪而出'), color: '#1E90FF', life: 60 };
                        // 找最近敌人位置召唤水柱
                        let target = null, minD = Infinity;
                        for (const e of enemies) {
                            if (!e.alive) continue;
                            const d = (e.x - hero.x) ** 2 + (e.y - hero.y) ** 2;
                            if (d < minD && d < 500 * 500) { minD = d; target = e; }
                        }
                        const cx = target ? target.x : hero.x + hero.facing * 200;
                        const cy = target ? target.y : hero.y;
                        for (let e of enemies.slice()) {
                            if (!e.alive) continue;
                            const dx = e.x - cx, dy = e.y - cy;
                            if (Math.sqrt(dx*dx + dy*dy) < 150) {
                                dealDamage(e, stats.skill1, '#1E90FF', 10);
                                // 击飞效果等同眩晕：眩晕1秒（60帧）无法行动
                                e.stunTime = Math.max(e.stunTime || 0, 60);
                            }
                        }
                        // 碧蓝水柱强化特效：多层冲天光柱+水花落差+冲击波
                        particles.push({ type: 'beam', x: cx, y: cy, dx: 0, dy: -1, length: 240, color: '#1E90FF', life: 35, maxLife: 35 });
                        particles.push({ type: 'beam', x: cx, y: cy, dx: 0, dy: -1, length: 210, color: '#00CED1', life: 28, maxLife: 28 });
                        particles.push({ type: 'beam', x: cx, y: cy, dx: 0, dy: -1, length: 180, color: '#ffffff', life: 18, maxLife: 18 });
                        particles.push({ type: 'ringExpand', x: cx, y: cy, color: '#1E90FF', maxRadius: 150, life: 28, maxLife: 28 });
                        particles.push({ type: 'ringExpand', x: cx, y: cy, color: '#00CED1', maxRadius: 110, life: 22, maxLife: 22 });
                        particles.push({ type: 'shockExplosion', x: cx, y: cy, color: '#00CED1', maxRadius: 120, life: 25, maxLife: 25 });
                        // 上升水泡+下落水滴
                        for (let i = 0; i < 35; i++) {
                            const a = (i / 35) * Math.PI * 2;
                            const r = 10 + Math.random() * 60;
                            const isRising = i % 3 !== 0;
                            particles.push({
                                type: 'healParticle',
                                x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r * 0.3,
                                life: 25 + Math.floor(Math.random() * 20), maxLife: 45,
                                color: isRising ? '#00CED1' : '#87CEEB'
                            });
                        }
                        for (let i = 0; i < 20; i++) {
                            const a = Math.random() * Math.PI * 2;
                            const sp = 3 + Math.random() * 5;
                            particles.push({
                                type: 'hit', x: cx, y: cy,
                                vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2,
                                life: 30, maxLife: 30, color: '#00CED1', size: 6
                            });
                        }
                        triggerShake(false);
                    },
                    // 二技能 潮汐护盾：护盾180+每秒回5%持续4秒（CD4秒）
                    2: () => {
                        skillText = { text: _t('潮汐护盾，碧浪庇护'), color: '#00CED1', life: 60 };
                        lanShieldTimer = 240; // 4秒=240帧持续
                        lanShieldAmount = 180 + enhLanShieldHp; // 基础180+肉鸽每次+80
                        lanShieldHealTickTimer = 0;
                        hero.shield = (hero.shield || 0) + lanShieldAmount;
                        // 潮汐护盾强化特效：多层水波光环+上升水泡+护盾结晶
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#1E90FF', maxRadius: 160, life: 35, maxLife: 35 });
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#00CED1', maxRadius: 120, life: 28, maxLife: 28 });
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#87CEEB', maxRadius: 80, life: 22, maxLife: 22 });
                        particles.push({ type: 'aura', x: hero.x, y: hero.y, radius: 70, color: '#00CED1', life: 240, maxLife: 240, followHero: true });
                        for (let i = 0; i < 30; i++) {
                            const a = (i / 30) * Math.PI * 2;
                            const r = 35 + Math.random() * 35;
                            particles.push({
                                type: 'healParticle',
                                x: hero.x + Math.cos(a) * r, y: hero.y + Math.sin(a) * r,
                                life: 40 + Math.floor(Math.random() * 30), maxLife: 70,
                                color: i % 2 === 0 ? '#00CED1' : '#87CEEB'
                            });
                        }
                        // 护盾开启水花爆散
                        for (let i = 0; i < 20; i++) {
                            const a = Math.random() * Math.PI * 2;
                            const sp = 3 + Math.random() * 4;
                            particles.push({
                                type: 'hit', x: hero.x, y: hero.y,
                                vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                                life: 30, maxLife: 30, color: '#00CED1', size: 6
                            });
                        }
                    },
                    // 三技能 深海怒涛：巨浪600范围单次伤害+减速6秒（基础伤害100，非持续伤害）
                    3: () => {
                        skillText = { text: _t('深海怒涛，浪涌翻天'), color: '#1E90FF', life: 60 };
                        lanTsunamiTimer = 360; // 6秒=360帧（仅视觉效果持续）
                        lanTsunamiTickTimer = 0;
                        // 立即造成一次大范围伤害+减速
                        for (let e of enemies.slice()) {
                            if (!e.alive) continue;
                            const dx = e.x - hero.x, dy = e.y - hero.y;
                            if (Math.sqrt(dx*dx + dy*dy) < 600) {
                                dealDamage(e, stats.skill3, '#1E90FF', 10);
                                if (e.slowTimer === undefined) e.slowTimer = 0;
                                e.slowTimer = Math.max(e.slowTimer, 360);
                                e.slowFactor = 0.4; // 减速40%
                            }
                        }
                        // 巨浪特效：多层水波光环+40个水花粒子
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#1E90FF', maxRadius: 600, life: 40, maxLife: 40 });
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#00CED1', maxRadius: 500, life: 35, maxLife: 35 });
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#87CEEB', maxRadius: 400, life: 30, maxLife: 30 });
                        for (let i = 0; i < 40; i++) {
                            const a = (i / 40) * Math.PI * 2;
                            const r = 100 + Math.random() * 300;
                            particles.push({
                                type: 'hit', x: hero.x + Math.cos(a) * r, y: hero.y + Math.sin(a) * r,
                                vx: Math.cos(a) * -3, vy: Math.sin(a) * -3,
                                life: 45, maxLife: 45, color: '#00CED1', size: 7
                            });
                        }
                        triggerShake(true);
                    }
                },
                buffs: [
                    { id: 'hp', text: _t('最大生命+200'), apply: () => { stats.hp += 200; hero.maxHp += 200; hero.hp += 200; } },
                    { id: 'attack', text: _t('普攻+70'), apply: () => { stats.attack += 70; } },
                    { id: 'skill1', text: _t('一技能伤害+60'), apply: () => { stats.skill1 += 60; } },
                    { id: 's2heal', text: _t('二技能每秒回复+2%'), apply: () => { enhLanHealPct += 0.02; } },
                    { id: 's2shield', text: _t('二技能护盾+80'), apply: () => { enhLanShieldHp += 80; } },
                    { id: 'skill3', text: _t('三技能伤害+100'), apply: () => { stats.skill3 += 100; } },
                    { id: 'crit', text: _t('暴击率+15%'), apply: () => { addCritRate(0.15); } },
                    { id: 'critDmg', text: _t('暴击伤害+20%'), apply: () => { critDmgMult += 0.20; } },
                    { id: 'heal', text: _t('回满血'), apply: () => { hero.hp = hero.maxHp; } }
                ]
            },
            // ===== 原创角色5：左慈 - 时空织者·维度操控（多1次复活+冻结机制） =====
            zhi: {
                name: _t('左慈'), title: _t('时空织者 · 维度操控'), color: '#9370DB', icon: '左',
                hp: 180, attack: 30,
                ranged: true,
                skills: [
                    { name: _t('时空裂隙'), cd: 180, dmg: 80, desc: _t('全图随机传送+原地留下3秒伤害区域') },
                    { name: _t('时间停滞'), cd: 360, dmg: 0, desc: _t('冻结所有敌人3秒') },
                    { name: _t('时空崩塌'), cd: 240, dmg: 150, desc: _t('500范围单次时空爆炸+减速6秒（非持续伤害）') }
                ],
                passive: { name: _t('时空异骸'), desc: _t('额外获得1次复活机会（首次复活时自动触发）') },
                skillStats: [
                    { label: _t('额外复活机会'), getValue: () => zhiExtraReviveUsed ? _t('已用') : _t('可用') },
                    { label: _t('时空裂隙伤害'), getValue: () => stats.skill1 + enhZhiRiftDmg },
                    { label: _t('时空崩塌伤害'), getValue: () => stats.skill3 + enhZhiCollapseDmg }
                ],
                skillImpl: {
                    // 一技能 时空裂隙：全图随机传送+原地留下3秒伤害区域（半径250，每秒造成80+enhZhiRiftDmg伤害）
                    // 撞到敌人没事（无视碰撞，纯随机传送）
                    1: () => {
                        skillText = { text: _t('时空裂隙，维度跳跃'), color: '#9370DB', life: 60 };
                        const oldX = hero.x, oldY = hero.y;
                        // 全图完全随机传送：x、y 各自在地图范围内随机（边缘留30像素安全带）
                        const tx = 30 + Math.random() * (MAP_WIDTH - 60);
                        const ty = 30 + Math.random() * (MAP_HEIGHT - 60);
                        hero.x = tx;
                        hero.y = ty;
                        hero.invincibleTime = 60; // 1秒=60帧无敌
                        // 在原地留下持续伤害区域
                        zhiRiftX = oldX;
                        zhiRiftY = oldY;
                        zhiRiftTimer = 180; // 3秒=180帧
                        zhiRiftTickTimer = 0;
                        // 立即造成一次伤害
                        const dmg = stats.skill1 + enhZhiRiftDmg;
                        for (let e of enemies.slice()) {
                            if (!e.alive) continue;
                            const dx = e.x - oldX, dy = e.y - oldY;
                            if (Math.sqrt(dx*dx + dy*dy) < 250) {
                                dealDamage(e, dmg, '#9370DB', 8);
                            }
                        }
                        // 紫罗兰传送特效+裂隙开启特效
                        particles.push({ type: 'dash', x1: oldX, x2: tx, y1: oldY, y2: ty, life: 25, maxLife: 25 });
                        particles.push({ type: 'ringExpand', x: oldX, y: oldY, color: '#9370DB', maxRadius: 260, life: 35, maxLife: 35 });
                        particles.push({ type: 'ringExpand', x: oldX, y: oldY, color: '#BA55D3', maxRadius: 220, life: 30, maxLife: 30 });
                        particles.push({ type: 'ringExpand', x: oldX, y: oldY, color: '#ffffff', maxRadius: 180, life: 25, maxLife: 25 });
                        particles.push({ type: 'shockExplosion', x: oldX, y: oldY, color: '#9370DB', maxRadius: 200, life: 30, maxLife: 30 });
                        particles.push({ type: 'ringExpand', x: tx, y: ty, color: '#BA55D3', maxRadius: 150, life: 30, maxLife: 30 });
                        particles.push({ type: 'shockExplosion', x: tx, y: ty, color: '#9370DB', maxRadius: 100, life: 25, maxLife: 25 });
                        for (let i = 0; i < 30; i++) {
                            const a = (i / 30) * Math.PI * 2;
                            particles.push({
                                type: 'hit', x: oldX, y: oldY,
                                vx: Math.cos(a) * 4, vy: Math.sin(a) * 4,
                                life: 35, maxLife: 35, color: i % 2 === 0 ? '#9370DB' : '#BA55D3', size: 7
                            });
                        }
                        for (let i = 0; i < 20; i++) {
                            const a = (i / 20) * Math.PI * 2;
                            particles.push({
                                type: 'hit', x: tx, y: ty,
                                vx: Math.cos(a) * 5, vy: Math.sin(a) * 5,
                                life: 30, maxLife: 30, color: '#BA55D3', size: 6
                            });
                        }
                        triggerShake(false);
                    },
                    // 二技能 时间停滞：冻结所有敌人3秒（固定180帧）
                    2: () => {
                        skillText = { text: _t('时间停滞，万物静寂'), color: '#9370DB', life: 60 };
                        zhiFreezeTimer = 180; // 3秒=180帧
                        // 全屏紫罗兰光环+40个时间粒子
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#9370DB', maxRadius: 700, life: 40, maxLife: 40 });
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#BA55D3', maxRadius: 600, life: 35, maxLife: 35 });
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#ffffff', maxRadius: 500, life: 30, maxLife: 30 });
                        for (let i = 0; i < 40; i++) {
                            const a = (i / 40) * Math.PI * 2;
                            const r = 100 + Math.random() * 300;
                            particles.push({
                                type: 'hit', x: hero.x + Math.cos(a) * r, y: hero.y + Math.sin(a) * r,
                                vx: 0, vy: 0, // 时间停滞，粒子也静止
                                life: 50, maxLife: 50, color: '#BA55D3', size: 7
                            });
                        }
                        triggerShake(true);
                    },
                    // 三技能 时空崩塌：500范围单次时空爆炸+减速6秒（CD4秒，基础伤害150，非持续伤害）
                    3: () => {
                        skillText = { text: _t('时空崩塌，维度碎裂'), color: '#9370DB', life: 60 };
                        zhiCollapseTimer = 360; // 6秒=360帧（仅视觉效果持续）
                        zhiCollapseTickTimer = 0;
                        const dmg = stats.skill3 + enhZhiCollapseDmg;
                        // 立即造成一次大范围伤害+减速
                        for (let e of enemies.slice()) {
                            if (!e.alive) continue;
                            const dx = e.x - hero.x, dy = e.y - hero.y;
                            if (Math.sqrt(dx*dx + dy*dy) < 500) {
                                dealDamage(e, dmg, '#9370DB', 12);
                                if (e.slowTimer === undefined) e.slowTimer = 0;
                                e.slowTimer = Math.max(e.slowTimer, 360);
                                e.slowFactor = 0.5; // 减速50%
                            }
                        }
                        // 时空崩塌特效：多层紫罗兰光环+50粒子+冲击波
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#9370DB', maxRadius: 500, life: 40, maxLife: 40 });
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#BA55D3', maxRadius: 400, life: 35, maxLife: 35 });
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#ffffff', maxRadius: 300, life: 30, maxLife: 30 });
                        particles.push({ type: 'shockExplosion', x: hero.x, y: hero.y, color: '#9370DB', maxRadius: 250, life: 35, maxLife: 35 });
                        for (let i = 0; i < 50; i++) {
                            const a = (i / 50) * Math.PI * 2;
                            const sp = 3 + Math.random() * 7;
                            particles.push({
                                type: 'hit', x: hero.x, y: hero.y,
                                vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                                life: 40, maxLife: 40, color: i % 2 === 0 ? '#BA55D3' : '#ffffff', size: 7
                            });
                        }
                        triggerShake(true);
                    }
                },
                buffs: [
                    { id: 'hp', text: _t('最大生命+180'), apply: () => { stats.hp += 180; hero.maxHp += 180; hero.hp += 180; } },
                    { id: 'attack', text: _t('普攻+70'), apply: () => { stats.attack += 70; } },
                    { id: 'crit', text: _t('暴击率+15%'), apply: () => { addCritRate(0.15); } },
                    { id: 'critDmg', text: _t('暴击伤害+20%'), apply: () => { critDmgMult += 0.20; } },
                    { id: 'heal', text: _t('回满血'), apply: () => { hero.hp = hero.maxHp; } },
                    { id: 'skill1', text: _t('时空裂隙伤害+60'), apply: () => { enhZhiRiftDmg += 60; } },
                    { id: 'skill3a', text: _t('时空崩塌伤害+200'), apply: () => { enhZhiCollapseDmg += 200; } },
                    { id: 'skill3b', text: _t('时空崩塌伤害+180'), apply: () => { enhZhiCollapseDmg += 180; } }
                ]
            },
            // ===== 原创角色6：陆逊 - 烈焰之心·永不熄灭（燃烧双轨制+全图燃烧） =====
            yan: {
                name: _t('陆逊'), title: _t('烈焰之心 · 永不熄灭'), color: '#FF4500', icon: '陆',
                hp: 192, attack: 30,   // 基础数值削弱20%（原HP240/攻击38）
                skills: [
                    { name: _t('烈焰冲击'), cd: 180, dmg: 52, desc: _t('圆形范围火焰伤害+叠加3层燃烧') },
                    { name: _t('焚身烈焰'), cd: 300, dmg: 50, desc: _t('自身周围150半径3秒火焰护环，每秒50伤害+叠加1层燃烧') },
                    { name: _t('永不熄灭'), cd: 300, dmg: 0, desc: _t('全图所有敌人叠加4层燃烧') }
                ],
                passive: { name: _t('燃烧印记'), desc: _t('燃烧叠层永久保留，每5层转换1个独立燃烧层，每秒造成30伤害持续3秒') },
                skillStats: [
                    { label: _t('焚身烈焰每秒伤害'), getValue: () => stats.skill2 + enhYanAuraDmg },
                    { label: _t('燃烧每层每秒伤害'), getValue: () => 30 + enhYanBurnDmg },
                    { label: _t('永不熄灭CD'), getValue: () => '5' + _t('秒') }
                ],
                skillImpl: {
                    // 一技能 烈焰冲击：圆形范围火焰伤害（半径350）+ 叠加3层燃烧
                    1: () => {
                        skillText = { text: _t('烈焰冲击，焚尽一切'), color: '#FF4500', life: 60 };
                        const dmg = stats.skill1 + enhYanSlashDmg;
                        // 圆形范围伤害：以英雄为中心350半径
                        for (let e of enemies.slice()) {
                            if (!e.alive) continue;
                            const dx = e.x - hero.x, dy = e.y - hero.y;
                            const dist = Math.sqrt(dx*dx + dy*dy);
                            if (dist < 350) {
                                dealDamage(e, dmg, '#FF4500', 8);
                                // 叠加3层燃烧叠层（不直接造成伤害，每5层转1层正在燃烧层）
                                addYanBurnStacks(e, 3);
                            }
                        }
                        // 火焰冲击波特效：橙红圆形扩散光环+25粒子
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#FF4500', maxRadius: 350, life: 30, maxLife: 30 });
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#FFD700', maxRadius: 280, life: 25, maxLife: 25 });
                        particles.push({ type: 'shockExplosion', x: hero.x, y: hero.y, color: '#FF4500', maxRadius: 300, life: 25, maxLife: 25 });
                        for (let i = 0; i < 25; i++) {
                            const a = (i / 25) * Math.PI * 2;
                            const sp = 4 + Math.random() * 5;
                            particles.push({
                                type: 'hit', x: hero.x, y: hero.y,
                                vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                                life: 25, maxLife: 25, color: i % 2 === 0 ? '#FF4500' : '#FFD700', size: 6
                            });
                        }
                        triggerShake(false);
                    },
                    // 二技能 焚身烈焰：自身周围150半径3秒火焰护环（每秒造成 40+enhYanAuraDmg 伤害 + 叠1层燃烧叠层）
                    // 设计说明：类似吕布霸王护体的环绕机制，但用火焰螺旋粒子+橙红火环视觉，与吕布金色光环明显区分
                    2: () => {
                        skillText = { text: _t('焚身烈焰，烈火燎原'), color: '#FF4500', life: 60 };
                        yanBurnAuraTimer = 180; // 3秒=180帧持续
                        yanBurnAuraTickTimer = 0;
                        // 启动特效：多层橙红护环扩散（150范围匹配）+ 强冲击波
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#FF4500', maxRadius: 180, life: 35, maxLife: 35 });
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#FF8C00', maxRadius: 150, life: 30, maxLife: 30 });
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#FFD700', maxRadius: 120, life: 25, maxLife: 25 });
                        particles.push({ type: 'shockExplosion', x: hero.x, y: hero.y, color: '#FF4500', maxRadius: 160, life: 28, maxLife: 28 });
                        particles.push({ type: 'shockExplosion', x: hero.x, y: hero.y, color: '#FFD700', maxRadius: 110, life: 24, maxLife: 24 });
                        // 中心冲天火柱
                        particles.push({ type: 'beam', x: hero.x, y: hero.y, dx: 0, dy: -1, length: 180, color: '#FF4500', life: 35, maxLife: 35 });
                        particles.push({ type: 'beam', x: hero.x, y: hero.y, dx: 0, dy: -1, length: 140, color: '#FFD700', life: 28, maxLife: 28 });
                        // 40个螺旋上升火焰粒子（橙红+金黄双色，尺寸更大）
                        for (let i = 0; i < 40; i++) {
                            const a = (i / 40) * Math.PI * 2;
                            const r = 80 + Math.random() * 50;
                            particles.push({
                                type: 'flame', x: hero.x + Math.cos(a) * r, y: hero.y + Math.sin(a) * r,
                                vx: Math.cos(a) * (1.0 + Math.random() * 0.8), vy: -3 - Math.random() * 2,
                                life: 50, maxLife: 50, size: 10
                            });
                        }
                        // 外圈爆发粒子
                        for (let i = 0; i < 30; i++) {
                            const a = Math.random() * Math.PI * 2;
                            const sp = 4 + Math.random() * 6;
                            particles.push({
                                type: 'hit', x: hero.x, y: hero.y,
                                vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                                life: 30, maxLife: 30, color: Math.random() > 0.5 ? '#FF4500' : '#FFD700', size: 7
                            });
                        }
                        triggerShake(true);
                    },
                    // 三技能 永不熄灭：全图所有敌人叠加4层燃烧叠层（CD5秒）
                    3: () => {
                        skillText = { text: _t('永不熄灭，万火臣服'), color: '#FF4500', life: 60 };
                        // 全图所有敌人叠加4层燃烧叠层，并为每个敌人附加单独点火特效
                        for (let e of enemies.slice()) {
                            if (!e.alive) continue;
                            addYanBurnStacks(e, 4);
                            // 每个被点燃的敌人爆发小火焰
                            particles.push({ type: 'shockExplosion', x: e.x, y: e.y, color: '#FF4500', maxRadius: e.radius * 2.2, life: 20, maxLife: 20 });
                            particles.push({ type: 'ringExpand', x: e.x, y: e.y, color: '#FFD700', maxRadius: e.radius * 2.8, life: 18, maxLife: 18 });
                            for (let k = 0; k < 6; k++) {
                                const a = Math.random() * Math.PI * 2;
                                const sp = 1.5 + Math.random() * 2.5;
                                particles.push({
                                    type: 'flame', x: e.x, y: e.y,
                                    vx: Math.cos(a) * sp, vy: -2 - Math.random() * 2,
                                    life: 30, maxLife: 30, size: 5 + Math.random() * 3
                                });
                            }
                        }
                        // 永不熄灭特效：橙红全屏多层光环+50粒子（无直接伤害）
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#FF4500', maxRadius: 800, life: 50, maxLife: 50 });
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#FFD700', maxRadius: 700, life: 45, maxLife: 45 });
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#ffffff', maxRadius: 600, life: 40, maxLife: 40 });
                        for (let i = 0; i < 50; i++) {
                            const a = (i / 50) * Math.PI * 2;
                            const sp = 4 + Math.random() * 8;
                            particles.push({
                                type: 'hit', x: hero.x, y: hero.y,
                                vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                                life: 45, maxLife: 45, color: i % 2 === 0 ? '#FF4500' : '#FFD700', size: 8
                            });
                        }
                        triggerShake(true);
                    }
                },
                buffs: [
                    { id: 'hp', text: _t('最大生命+160'), apply: () => { stats.hp += 160; hero.maxHp += 160; hero.hp += 160; } },
                    { id: 'attack', text: _t('普攻+60'), apply: () => { stats.attack += 60; } },
                    { id: 'crit', text: _t('暴击率+10%'), apply: () => { addCritRate(0.1); } },
                    { id: 'critDmg', text: _t('暴击伤害+12%'), apply: () => { critDmgMult += 0.12; } },
                    { id: 'skill1', text: _t('烈焰冲击伤害+64'), apply: () => { enhYanSlashDmg += 64; } },
                    { id: 'skill2', text: _t('焚身烈焰每秒伤害+50'), apply: () => { enhYanAuraDmg += 50; } },
                    { id: 'burnDmg', text: _t('燃烧每一层伤害+16'), apply: () => { enhYanBurnDmg += 16; } },
                    { id: 'heal', text: _t('回满血'), apply: () => { hero.hp = hero.maxHp; } }
                ]
            },
            // ===== 原创角色7：甄姬 - 寒冰女皇·冰封万里（寒冰累积+前后激光） =====
            shuang: {
                name: _t('甄姬'), title: _t('寒冰女皇 · 冰封万里'), color: '#00BFFF', icon: '甄',
                hp: 200, attack: 34,
                ranged: true,
                skills: [
                    { name: _t('寒冰箭'), cd: 180, dmg: 100, desc: _t('向前后发射激光+叠加2层寒冰') },
                    { name: _t('冰封领域'), cd: 300, dmg: 80, desc: _t('600范围AOE（单次伤害）+叠加3层寒冰+减速3秒') },
                    { name: _t('极地风暴'), cd: 480, dmg: 30, desc: _t('全屏暴风雪8秒，释放瞬间造成单次伤害+叠加4层寒冰') }
                ],
                passive: { name: _t('寒冰印记'), desc: _t('命中叠加寒冰，寒冰层永久保留，满5层立即冻结目标2秒；冻结期间不可叠加，解除后从0开始') },
                skillStats: [
                    { label: _t('寒冰层数冻结'), getValue: () => _t('5层→冻结2秒') },
                    { label: _t('冻结期间不可叠层'), getValue: () => _t('冻结解除后从0开始') },
                    { label: _t('极地风暴持续'), getValue: () => (8 + _t('秒')) }
                ],
                skillImpl: {
                    // 一技能 寒冰箭：向英雄前后方向各发射一道穿透激光，命中叠加2层寒冰
                    1: () => {
                        skillText = { text: _t('寒冰箭，凝霜成刃'), color: '#00BFFF', life: 60 };
                        // 甄姬伤害技能整体×1.7（用户最新要求：甄姬和伤害有关的技能提升70%）
                        const dmg = (stats.skill1 + enhShuangArrowDmg) * 1.7;
                        const laserLen = 700;        // 激光长度
                        const laserWidth = 40;       // 激光命中宽度（垂直方向）
                        // 英雄朝向（1=右, -1=左），前后各发射一道激光
                        const dirs = [hero.facing, -hero.facing];
                        for (const dir of dirs) {
                            // 弹道特效：天蓝激光（前后两道）
                            particles.push({ type: 'beam', x: hero.x, y: hero.y, dx: dir, dy: 0, length: laserLen, color: '#00BFFF', life: 18, maxLife: 18 });
                            particles.push({ type: 'beam', x: hero.x, y: hero.y, dx: dir, dy: 0, length: laserLen, color: '#ffffff', life: 14, maxLife: 14 });
                            // 命中检测：所有敌人在激光线上（x方向同侧且距离内，y方向在宽度内）
                            for (let e of enemies.slice()) {
                                if (!e.alive) continue;
                                const dx = e.x - hero.x;
                                const dy = e.y - hero.y;
                                // 必须在 dir 方向上（前向：dx*dir > 0；后向：dx*dir > 0 因为 dir 已经取反）
                                if (dx * dir <= 0) continue;
                                if (Math.abs(dx) > laserLen) continue;
                                if (Math.abs(dy) > laserWidth) continue;
                                dealDamage(e, dmg, '#00BFFF', 8);
                                // 叠加2层寒冰（addShuangColdStacks 内部自动处理冻结期间不可叠层）
                                addShuangColdStacks(e, 2);
                                // 命中冰晶爆裂特效
                                particles.push({ type: 'shockExplosion', x: e.x, y: e.y, color: '#00BFFF', maxRadius: 70, life: 20, maxLife: 20 });
                                particles.push({ type: 'ringExpand', x: e.x, y: e.y, color: '#ffffff', maxRadius: 50, life: 18, maxLife: 18 });
                            }
                        }
                        // 中心施法特效
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#00BFFF', maxRadius: 120, life: 22, maxLife: 22 });
                        triggerShake(false);
                    },
                    // 二技能 冰封领域：600范围AOE（仅在释放瞬间造成一次伤害），叠加3层寒冰+减速50% 3秒
                    2: () => {
                        skillText = { text: _t('冰封领域，万物凝结'), color: '#00BFFF', life: 60 };
                        // 甄姬伤害技能整体×1.7（用户最新要求：甄姬和伤害有关的技能提升70%）
                        const dmg = (stats.skill2 + enhShuangFieldDmg) * 1.7;
                        for (let e of enemies.slice()) {
                            if (!e.alive) continue;
                            const dx = e.x - hero.x, dy = e.y - hero.y;
                            if (Math.sqrt(dx*dx + dy*dy) < 600) {
                                dealDamage(e, dmg, '#00BFFF', 6);
                                // 叠加3层寒冰（addShuangColdStacks 内部自动处理冻结期间不可叠层）
                                addShuangColdStacks(e, 3);
                                // 减速50% 3秒
                                if (e.slowTimer === undefined) e.slowTimer = 0;
                                e.slowTimer = Math.max(e.slowTimer, 180);
                                e.slowFactor = 0.5;
                            }
                        }
                        // 冰封领域特效：3层天蓝光环+30冰晶粒子（仅视觉，无持续伤害）
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#00BFFF', maxRadius: 600, life: 40, maxLife: 40 });
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#87CEEB', maxRadius: 500, life: 35, maxLife: 35 });
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#ffffff', maxRadius: 400, life: 30, maxLife: 30 });
                        for (let i = 0; i < 30; i++) {
                            const a = (i / 30) * Math.PI * 2;
                            const sp = 3 + Math.random() * 5;
                            particles.push({
                                type: 'hit', x: hero.x, y: hero.y,
                                vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                                life: 35, maxLife: 35, color: i % 2 === 0 ? '#00BFFF' : '#ffffff', size: 6
                            });
                        }
                        triggerShake(false);
                    },
                    // 三技能 极地风暴：全屏暴风雪8秒视觉，释放瞬间造成单次伤害+叠加4层寒冰（非持续伤害）
                    3: () => {
                        skillText = { text: _t('极地风暴，冰封万里'), color: '#00BFFF', life: 60 };
                        shuangBlizzardTimer = 480; // 8秒=480帧（仅视觉效果持续）
                        shuangBlizzardTickTimer = 0;
                        // 释放瞬间：对所有敌人造成一次伤害并叠加4层寒冰
                        // 甄姬伤害技能整体×1.7（用户最新要求：甄姬和伤害有关的技能提升70%）
                        const blizzDmg = (stats.skill3 + enhShuangBlizzardDmg) * 1.7;
                        for (let e of enemies.slice()) {
                            if (!e.alive) continue;
                            dealDamage(e, blizzDmg, '#00BFFF', 6);
                            addShuangColdStacks(e, 4);
                            // 命中冰晶爆裂特效
                            particles.push({ type: 'shockExplosion', x: e.x, y: e.y, color: '#00BFFF', maxRadius: 60, life: 20, maxLife: 20 });
                            particles.push({ type: 'ringExpand', x: e.x, y: e.y, color: '#ffffff', maxRadius: 40, life: 16, maxLife: 16 });
                        }
                        // 启动特效：天蓝全屏光环+40冰晶粒子
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#00BFFF', maxRadius: 800, life: 50, maxLife: 50 });
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#ffffff', maxRadius: 700, life: 45, maxLife: 45 });
                        for (let i = 0; i < 40; i++) {
                            const a = (i / 40) * Math.PI * 2;
                            const r = 100 + Math.random() * 400;
                            particles.push({
                                type: 'hit', x: hero.x + Math.cos(a) * r, y: hero.y + Math.sin(a) * r,
                                vx: Math.cos(a) * 2, vy: Math.sin(a) * 2,
                                life: 50, maxLife: 50, color: i % 2 === 0 ? '#00BFFF' : '#ffffff', size: 7
                            });
                        }
                        triggerShake(true);
                    }
                },
                buffs: [
                    { id: 'hp', text: _t('最大生命+240'), apply: () => { stats.hp += 240; hero.maxHp += 240; hero.hp += 240; } },
                    { id: 'attack', text: _t('普攻+70'), apply: () => { stats.attack += 70; } },
                    { id: 'crit', text: _t('暴击率+15%'), apply: () => { addCritRate(0.15); } },
                    { id: 'critDmg', text: _t('暴击伤害+20%'), apply: () => { critDmgMult += 0.20; } },
                    { id: 'skill1', text: _t('寒冰箭伤害+80'), apply: () => { enhShuangArrowDmg += 80; } },
                    { id: 'skill2', text: _t('冰封领域伤害+100'), apply: () => { enhShuangFieldDmg += 100; } },
                    { id: 'skill3', text: _t('极地风暴伤害+30'), apply: () => { enhShuangBlizzardDmg += 30; } },
                    { id: 'heal', text: _t('回满血'), apply: () => { hero.hp = hero.maxHp; } }
                ]
            },
            // ===== 原创角色8：于吉 - 荆棘领主·丛林之主（远程普攻+寄生藤蔓+AOE） =====
            ji: {
                name: _t('于吉'), title: _t('荆棘领主 · 丛林之主'), color: '#228B22', icon: '于',
                ranged: true,
                hp: 260, attack: 75,  // 远程普攻英雄，普攻范围280（原400-30%）
                skills: [
                    { name: _t('荆棘缠绕'), cd: 180, dmg: 0, desc: _t('普攻伤害翻倍2秒+附加减速30%2秒') },
                    { name: _t('寄生藤蔓'), cd: 180, dmg: 0, desc: _t('链接5个最近敌人+每秒回10%最大HP持续2秒') },
                    { name: _t('自然之怒'), cd: 480, dmg: 200, desc: _t('420范围一次伤害200') }
                ],
                skillStats: [
                    { label: _t('当前藤蔓链接数'), getValue: () => jiVineLinks.length + '/5' },
                    { label: _t('寄生藤蔓每秒回血'), getValue: () => Math.round((0.10 + enhJiVineHealPct) * 100) + '%' }
                ],
                skillImpl: {
                    // 一技能 荆棘缠绕：开启2秒普攻伤害翻倍+减速30%2秒
                    // 设计说明：直接对所有敌人造成减速效果（普攻伤害翻倍通过 jiAtkBoostTimer 在普攻逻辑中检查实现）
                    1: () => {
                        skillText = { text: _t('荆棘缠绕，荆棘缠身'), color: '#228B22', life: 60 };
                        // 开启2秒普攻伤害翻倍
                        jiAtkBoostTimer = 120; // 2秒=120帧
                        // 对当前所有敌人附加减速30% 2秒（普攻命中也附加减速，但此技能直接对所有敌人施加减速效果）
                        for (let e of enemies.slice()) {
                            if (!e.alive) continue;
                            if (e.slowTimer === undefined) e.slowTimer = 0;
                            e.slowTimer = Math.max(e.slowTimer, 120);
                            e.slowFactor = 0.7; // 减速30%
                        }
                        // 荆棘缠绕强化特效：森林绿+金绿色多层光环+藤蔓螺旋+闪光
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#228B22', maxRadius: 250, life: 30, maxLife: 30 });
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#3CB371', maxRadius: 190, life: 25, maxLife: 25 });
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#FFCC44', maxRadius: 130, life: 20, maxLife: 20 });
                        particles.push({ type: 'shockExplosion', x: hero.x, y: hero.y, color: '#228B22', maxRadius: 180, life: 25, maxLife: 25 });
                        // 藤蔓螺旋粒子（向外旋转扩散）
                        for (let i = 0; i < 36; i++) {
                            const a = (i / 36) * Math.PI * 2;
                            const r = 40 + (i % 6) * 15;
                            particles.push({
                                type: 'hit', x: hero.x + Math.cos(a) * r, y: hero.y + Math.sin(a) * r,
                                vx: Math.cos(a) * 2, vy: Math.sin(a) * 2,
                                life: 35, maxLife: 35,
                                color: i % 3 === 0 ? '#FFCC44' : (i % 2 === 0 ? '#228B22' : '#3CB371'),
                                size: 5
                            });
                        }
                        triggerShake(false);
                    },
                    // 二技能 寄生藤蔓：链接5个最近敌人（少于5个全部链接），开启2秒每秒回10%最大HP（CD3秒）
                    2: () => {
                        skillText = { text: _t('寄生藤蔓，吸取生命'), color: '#228B22', life: 60 };
                        // 找到5个最近敌人（少于5个全部链接）
                        const candidates = enemies.filter(e => e.alive).map(e => ({
                            e, d: Math.sqrt((e.x - hero.x)**2 + (e.y - hero.y)**2)
                        })).sort((a, b) => a.d - b.d).slice(0, 5);
                        jiVineLinks = candidates.map(c => ({ enemy: c.e, timer: 120 })); // 链接持续2秒=120帧
                        // 开启2秒每秒回10%最大HP（"假装吸血"，无实际伤害）
                        jiVineHealTimer = 120;
                        jiVineHealTickTimer = 0;
                        // 链接特效：森林绿光环+5道藤蔓光束
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#228B22', maxRadius: 400, life: 30, maxLife: 30 });
                        for (const link of jiVineLinks) {
                            const dx = link.enemy.x - hero.x, dy = link.enemy.y - hero.y;
                            const d = Math.sqrt(dx*dx + dy*dy);
                            const dxN = d > 0 ? dx / d : 0;
                            const dyN = d > 0 ? dy / d : 0;
                            particles.push({ type: 'beam', x: hero.x, y: hero.y, dx: dxN, dy: dyN, length: d, color: '#228B22', life: 25, maxLife: 25 });
                            particles.push({ type: 'shockExplosion', x: link.enemy.x, y: link.enemy.y, color: '#3CB371', maxRadius: 60, life: 20, maxLife: 20 });
                        }
                        triggerShake(false);
                    },
                    // 三技能 自然之怒：420范围造成一次伤害200（原600-30%）
                    3: () => {
                        skillText = { text: _t('自然之怒，丛林审判'), color: '#228B22', life: 60 };
                        // 420范围一次伤害200（+肉鸽+200）
                        const dmg = stats.skill3 + enhJiFieldDmg;
                        for (let e of enemies.slice()) {
                            if (!e.alive) continue;
                            const dx = e.x - hero.x, dy = e.y - hero.y;
                            if (Math.sqrt(dx*dx + dy*dy) < 420) {
                                dealDamage(e, dmg, '#228B22', 10);
                            }
                        }
                        // 自然之怒特效：森林绿范围光环+50藤蔓粒子
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#228B22', maxRadius: 420, life: 40, maxLife: 40 });
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#3CB371', maxRadius: 500, life: 35, maxLife: 35 });
                        particles.push({ type: 'shockExplosion', x: hero.x, y: hero.y, color: '#228B22', maxRadius: 400, life: 35, maxLife: 35 });
                        for (let i = 0; i < 50; i++) {
                            const a = (i / 50) * Math.PI * 2;
                            const sp = 3 + Math.random() * 6;
                            particles.push({
                                type: 'hit', x: hero.x, y: hero.y,
                                vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                                life: 40, maxLife: 40, color: i % 2 === 0 ? '#228B22' : '#3CB371', size: 7
                            });
                        }
                        triggerShake(true);
                    }
                },
                buffs: [
                    { id: 'hp', text: _t('最大生命+260'), apply: () => { stats.hp += 260; hero.maxHp += 260; hero.hp += 260; } },
                    { id: 'attack', text: _t('普攻+72'), apply: () => { stats.attack += 72; } },
                    { id: 'skill2', text: _t('寄生藤蔓每秒回血+6%'), apply: () => { enhJiVineHealPct += 0.06; } },
                    { id: 'skill3', text: _t('自然之怒伤害+200'), apply: () => { enhJiFieldDmg += 200; } },
                    { id: 'crit', text: _t('暴击率+12%'), apply: () => { addCritRate(0.12); } },
                    { id: 'critDmg', text: _t('暴击伤害+18%'), apply: () => { critDmgMult += 0.18; } },
                    { id: 'heal', text: _t('回满血'), apply: () => { hero.hp = hero.maxHp; } }
                ]
            },
            // ===== 原创角色10：黄盖 - 水晶主宰·棱镜矩阵（普攻远程+折射+棱镜炮台+棱镜爆发） =====
            // 设计说明（削弱后）：
            //   - 普攻英雄，远程范围425（原500-15%），普攻带特效+淡青绿范围圈
            //   - 一技能普攻折射周围2敌人造成普攻*0.42（原0.6-30%）
            //   - 二技能CD5秒持续3秒召唤5棱镜炮台环绕（半径128，原150-15%），每炮台独立普攻(0.14倍率原0.2-30%，范围425)
            //   - 三技能CD5秒必须二技能开启时才能用，每个棱镜255范围35伤害+眩晕128范围1.2秒
            jing: {
                name: _t('黄盖'), title: _t('水晶主宰 · 棱镜矩阵'), color: '#00CED1', icon: '黄',
                hp: 154, attack: 56,   // 数值削弱30%（原HP220/攻击80）
                ranged: true,
                skills: [
                    { name: _t('水晶折射'), cd: 180, dmg: 0, desc: _t('强化下次普攻：折射周围2敌人造成普攻×0.42伤害') },
                    { name: _t('棱镜阵列'), cd: 300, dmg: 0, desc: _t('召唤5水晶棱镜炮台环绕自身3秒，每炮台独立普攻造成普攻×0.14') },
                    { name: _t('棱镜爆发'), cd: 300, dmg: 35, desc: _t('需棱镜阵列激活：每个棱镜255范围35伤害+眩晕128范围1.2秒') }
                ],
                skillStats: [
                    { label: _t('一技能折射人数'), getValue: () => (2 + enhJingRefractionCount) + _t('个') },
                    { label: _t('一技能折射倍率'), getValue: () => (0.42 + enhJingRefractionMult).toFixed(2) + '×' + _t('普攻') },
                    { label: _t('棱镜炮台倍率'), getValue: () => (0.14 + enhJingPrismAtkMult).toFixed(2) + '×' + _t('普攻') },
                    { label: _t('棱镜爆发每棱镜'), getValue: () => (35 + enhJingBurstDmg) + _t('伤害') }
                ],
                skillImpl: {
                    // 一技能 水晶折射：强化下次普攻，折射周围(2+enhJingRefractionCount)个敌人，造成普攻*(0.42+enhJingRefractionMult)
                    // 设计说明：通过 jingRefractionBoostTimer 开启下次普攻折射强化，在普攻命中时检查并触发折射
                    1: () => {
                        // 开启下次普攻折射强化（持续10秒内不消失，下次普攻命中即消耗）
                        jingRefractionBoostTimer = 600; // 10秒窗口期使用
                        skillText = { text: _t('水晶折射，矩阵启动'), color: '#00CED1', life: 60 };
                        // 释放特效：青绿光环 + 白光冲击 + 12个青绿/白色折射粒子向外放射
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#00CED1', maxRadius: 120, life: 22, maxLife: 22 });
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#ffffff', maxRadius: 80, life: 18, maxLife: 18 });
                        particles.push({ type: 'shockExplosion', x: hero.x, y: hero.y, color: '#00CED1', maxRadius: 90, life: 20, maxLife: 20 });
                        for (let i = 0; i < 12; i++) {
                            const a = (i / 12) * Math.PI * 2;
                            const sp = 4 + Math.random() * 3;
                            particles.push({
                                type: 'hit', x: hero.x, y: hero.y,
                                vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                                life: 22, maxLife: 22, color: i % 2 === 0 ? '#00CED1' : '#ffffff', size: 5
                            });
                        }
                    },
                    // 二技能 棱镜阵列：CD5秒持续3秒召唤5个水晶棱镜炮台环绕自身
                    // 每个炮台有自身同等的普攻范围（425），有敌人在范围内自动普攻造成普攻*0.14伤害
                    2: () => {
                        skillText = { text: _t('棱镜阵列，炮台就位'), color: '#00CED1', life: 60 };
                        jingPrisms = [];
                        jingPrismFieldActive = true;
                        // 在英雄周围128半径圆周上均匀分布5个棱镜炮台（原150-15%）
                        const count = 5;
                        const orbitRadius = 128;
                        for (let i = 0; i < count; i++) {
                            const a = (i / count) * Math.PI * 2;
                            jingPrisms.push({
                                x: hero.x + Math.cos(a) * orbitRadius,
                                y: hero.y + Math.sin(a) * orbitRadius,
                                life: 180,           // 3秒=180帧
                                attackTimer: 0,      // 普攻CD计时（与英雄普攻CD一致）
                                angle: a,            // 环绕角度（用于动态环绕）
                                baseAngle: a         // 基础角度（用于环绕运动）
                            });
                        }
                        // 棱镜阵列特效：青绿松石光环+棱镜粒子
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#00CED1', maxRadius: 250, life: 30, maxLife: 30 });
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#ffffff', maxRadius: 200, life: 25, maxLife: 25 });
                        for (const p of jingPrisms) {
                            particles.push({ type: 'shockExplosion', x: p.x, y: p.y, color: '#00CED1', maxRadius: 60, life: 22, maxLife: 22 });
                            particles.push({ type: 'ringExpand', x: p.x, y: p.y, color: '#ffffff', maxRadius: 40, life: 18, maxLife: 18 });
                        }
                        triggerShake(false);
                    },
                    // 三技能 棱镜爆发：CD5秒必须二技能开启时才能用，每个棱镜255范围35伤害+眩晕128范围1.2秒（范围-15%，数值-30%）
                    3: () => {
                        // 前置检查：必须二技能激活中才能使用
                        if (!jingPrismFieldActive || jingPrisms.length === 0) {
                            skillText = { text: _t('棱镜阵列未激活，无法爆发！'), color: '#FF6347', life: 60 };
                            // 重置三技能CD让玩家可以立即在二技能激活后使用
                            skillCooldown[3] = 0;
                            return;
                        }
                        skillText = { text: _t('棱镜爆发，矩阵碎裂'), color: '#00CED1', life: 60 };
                        const burstDmg = 35 + enhJingBurstDmg;  // 每棱镜爆炸伤害（原50-30%）
                        const burstRange = 255;                  // 爆发伤害范围（原300-15%）
                        const stunRange = 128;                   // 眩晕范围（原150-15%）
                        const stunTime = 72;                     // 眩晕1.2秒=72帧
                        // 每个棱镜引爆：255范围造成35伤害（独立计算）+ 128范围眩晕1.2秒
                        for (const p of jingPrisms) {
                            // 255范围伤害
                            for (let e of enemies.slice()) {
                                if (!e.alive) continue;
                                const dx = e.x - p.x, dy = e.y - p.y;
                                if (Math.sqrt(dx*dx + dy*dy) < burstRange) {
                                    dealDamage(e, burstDmg, '#00CED1', 8);
                                    // 128范围内额外眩晕1.2秒
                                    if (Math.sqrt(dx*dx + dy*dy) < stunRange) {
                                        e.stunTime = Math.max(e.stunTime || 0, stunTime);
                                    }
                                }
                            }
                            // 棱镜爆炸特效：255范围青绿光环+128范围白光眩晕圈
                            particles.push({ type: 'shockExplosion', x: p.x, y: p.y, color: '#00CED1', maxRadius: 255, life: 35, maxLife: 35 });
                            particles.push({ type: 'ringExpand', x: p.x, y: p.y, color: '#00CED1', maxRadius: 255, life: 40, maxLife: 40 });
                            particles.push({ type: 'ringExpand', x: p.x, y: p.y, color: '#ffffff', maxRadius: 128, life: 30, maxLife: 30 });
                            for (let i = 0; i < 15; i++) {
                                const a = (i / 15) * Math.PI * 2;
                                const sp = 5 + Math.random() * 6;
                                particles.push({
                                    type: 'hit', x: p.x, y: p.y,
                                    vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                                    life: 30, maxLife: 30, color: i % 2 === 0 ? '#00CED1' : '#ffffff', size: 7
                                });
                            }
                        }
                        // 爆发光环（缩小为255匹配新范围）
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#00CED1', maxRadius: 255, life: 50, maxLife: 50 });
                        // 清除所有棱镜（已引爆）+ 关闭棱镜阵列激活状态
                        jingPrisms = [];
                        jingPrismFieldActive = false;
                        triggerShake(true);
                    }
                },
                buffs: [
                    { id: 'hp', text: _t('最大生命+154'), apply: () => { stats.hp += 154; hero.maxHp += 154; hero.hp += 154; } },
                    { id: 'attack', text: _t('普攻+49'), apply: () => { stats.attack += 49; } },
                    { id: 'heal', text: _t('回满血'), apply: () => { hero.hp = hero.maxHp; } },
                    { id: 'crit', text: _t('暴击率+8%'), apply: () => { addCritRate(0.08); } },
                    { id: 'critDmg', text: _t('暴击伤害+11%'), apply: () => { critDmgMult += 0.11; } },
                    { id: 'skill1Count', text: _t('一技能折射人数+1'), apply: () => { enhJingRefractionCount += 1; } },
                    { id: 'skill1Mult', text: _t('一技能折射倍率+0.14'), apply: () => { enhJingRefractionMult += 0.14; } },
                    { id: 'skill2Mult', text: _t('二技能炮台倍率+0.07'), apply: () => { enhJingPrismAtkMult += 0.07; } },
                    { id: 'skill3', text: _t('三技能每棱镜伤害+42'), apply: () => { enhJingBurstDmg += 42; } }
                ]
            }
        };

        // ===== 数据驱动：从 SKILL_CONFIG 同步英雄数值 =====
        // 修改 data/skills.json 或 src/data_config.js 中的 SKILL_CONFIG.heroData
        // 即可调整英雄平衡，无需修改 HERO_DEFS 中的硬编码值
        (function applyHeroSkillConfig() {
            for (const key in HERO_DEFS) {
                const sc = SKILL_CONFIG.heroData[key];
                if (!sc) continue;
                const hd = HERO_DEFS[key];
                hd.hp = sc.hp;
                hd.attack = sc.attack;
                for (let i = 0; i < 3; i++) {
                    if (sc.skills[i] && hd.skills[i]) {
                        hd.skills[i].cd = sc.skills[i].cd;
                        hd.skills[i].dmg = sc.skills[i].dmg;
                    }
                }
            }
        })();

        // ===== 新增：英雄专属效果容器（毒区/分身/骑兵/闪电链） =====
        let poisonZones = [];
        let heroClones = [];
        let cavalryCharges = [];
        let lightningChains = [];
        let emperorParticles = [];   // 帝君技能粒子（爆发/拖尾）
        let emperorRings = [];        // 帝君技能光环（扩散/收缩）
        let guanyuShieldEffect = 0;  // 关羽二技能护盾光环帧计数
        let zhaoyunShieldEffect = 0; // 赵云二技能护盾光环帧计数
        // ===== 新增：冥渊Boss相关容器与状态 =====
        let abyssLords = [];
        let bladeMasters = [];
        let madEyes = [];
        let youBosses = [];             // 幽Boss实例数组
        let jieBosses = [];             // 劫Boss实例数组（仅终焉+难度的压轴Boss）
        // ===== 劫Boss三阶段贴图（圆形透明PNG，按血线切换） =====
        let jieSprites = {};            // { path: Image } 贴图缓存，避免重复加载
        let jieSpritesLoaded = {};      // { path: bool } 某贴图是否加载完成
        let abyssParticles = [];
        let abyssRings = [];
        let bladeParticles = [];       // 剑圣技能粒子
        let bladeRings = [];           // 剑圣技能光环
        let eyeParticles = [];         // 妄瞳技能粒子
        let eyeRings = [];             // 妄瞳技能光环
        let youParticles = [];         // 幽技能粒子/火焰弹幕
        let youRings = [];             // 幽技能光环
        let youLasers = [];            // 幽红色激光
        // ===== 劫Boss三阶段技能特效容器（混沌·规则系，压轴Boss专属） =====
        let jieParticles = [];         // 劫技能粒子（流星/星屑/爆炸/光尘）
        let jieRings = [];             // 劫技能光环（扩散/收缩/安全区）
        let jieLasers = [];            // 劫激光（旋转火龙/6向预判激光/焚天风暴）
        let jieZones = [];             // 劫区域伤害（脉冲/落点/红圈/终局全屏）
        let jieSummons = [];           // 劫召唤预警（白光2秒后出怪，含钟摆刷新标记）
        let jieHeroFreezeTimer = 0;    // 劫·规则罗盘定身英雄剩余帧（>0时英雄无法移动）
        let jiePendulums = [];         // 劫·钟摆召唤（屏幕上方摆动，每摆一次角色位置出怪）
        let timeFrozen = false;       // 时空静止状态
        let timeFrozenTimer = 0;      // 静止剩余帧
        let timeFreezeFlashTime = 0;  // 静止闪烁特效剩余帧
        let emperorDeathEffects = []; // 帝君死亡碎裂特效
        let abyssDeathEffects = [];   // 冥渊死亡消散特效
        let screenShatterTime = 0;    // 屏幕碎裂特效剩余帧
        let screenShatterColor = '#ff3300'; // 碎裂颜色（帝君红/冥渊紫黑）

        // ===== 新增：英雄分身（貂蝉月华分身） =====
        function spawnHeroClones(count, color, label) {
            heroClones = [];
            for (let i = 0; i < count; i++) {
                // 均匀环绕分布
                const baseAngle = (i / count) * Math.PI * 2;
                heroClones.push({
                    x: hero.x + Math.cos(baseAngle) * 70,
                    y: hero.y + Math.sin(baseAngle) * 70,
                    angle: baseAngle,
                    life: 360, attackTimer: 0,
                    damageTick: 0, // 每秒等同伤害计时器
                    color: color, label: label
                });
            }
        }
        function updateHeroClones() {
            for (let i = heroClones.length - 1; i >= 0; i--) {
                const c = heroClones[i];
                c.life--;
                c.angle += 0.05;
                c.x = hero.x + Math.cos(c.angle) * 70;
                c.y = hero.y + Math.sin(c.angle) * 70;
                // 原有近战攻击逻辑（保留）
                c.attackTimer--;
                if (c.attackTimer <= 0) {
                    c.attackTimer = 30;
                    for (const e of enemies.slice()) {
                        if (!e.alive) continue;
                        const d = Math.sqrt((e.x-c.x)**2 + (e.y-c.y)**2);
                        if (d < 80) dealDamage(e, stats.skill3 * 0.5, c.color, 5);
                    }
                }
                // 新增：每秒（60帧）造成等同伤害值的伤害（分身≤6时）
                if (heroClones.length <= 6) {
                    c.damageTick--;
                    if (c.damageTick <= 0) {
                        c.damageTick = 60;
                        for (const e of enemies.slice()) {
                            if (!e.alive) continue;
                            const d = Math.sqrt((e.x-c.x)**2 + (e.y-c.y)**2);
                            if (d < 80) dealDamage(e, stats.skill3, c.color, 5);
                        }
                    }
                }
                if (c.life <= 0) heroClones.splice(i, 1);
            }
            // 分身≥6时：每秒造成 stats.skill3 * 分身数 伤害（范围AOE，不画个体只画圆环）
            if (heroClones.length >= 6) {
                if (!updateHeroClones._ringTick) updateHeroClones._ringTick = 0;
                updateHeroClones._ringTick--;
                if (updateHeroClones._ringTick <= 0) {
                    updateHeroClones._ringTick = 60;
                    // 伤害 = stats.skill3 * 分身数（依赖数量）
                    const aoeDmg = stats.skill3 * heroClones.length;
                    for (const e of enemies.slice()) {
                        if (!e.alive) continue;
                        const d = Math.sqrt((e.x-hero.x)**2 + (e.y-hero.y)**2);
                        if (d < 120) dealDamage(e, aoeDmg, '#ff66cc', 8);
                    }
                }
            }
        }
        function drawHeroClones() {
            if (heroClones.length === 0) return;
            if (heroClones.length < 6) {
                // 分身≤6：每个分身单独绘制
                for (const c of heroClones) {
                    ctx.save();
                    ctx.translate(c.x, c.y);
                    // 影之分身的特效更大更明显
                    const isShadow = c.isShadowClone;
                    const radius = isShadow ? 26 : 18;
                    const blur = isShadow ? 30 : 18;
                    const alpha = isShadow ? 0.85 : 0.7;
                    // 外层光环
                    if (isShadow) {
                        ctx.globalAlpha = 0.3;
                        ctx.fillStyle = '#aa88ff';
                        ctx.shadowColor = '#aa88ff';
                        ctx.shadowBlur = 40;
                        ctx.beginPath();
                        ctx.arc(0, 0, radius + 12, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    ctx.globalAlpha = alpha;
                    ctx.fillStyle = c.color;
                    ctx.shadowColor = c.color;
                    ctx.shadowBlur = blur;
                    ctx.beginPath();
                    ctx.arc(0, 0, radius, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = '#fff';
                    ctx.font = 'bold 12px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(c.label, 0, 0);
                    ctx.restore();
                }
            } else {
                // 分身≥6：直接画成旋转圆环（避免内存限制）
                ctx.save();
                ctx.translate(hero.x, hero.y);
                const rot = Date.now() / 200;
                // 外层旋转圆环
                ctx.rotate(rot);
                ctx.globalAlpha = 0.6;
                ctx.strokeStyle = '#ff66cc';
                ctx.lineWidth = 4;
                ctx.shadowColor = '#ff66cc';
                ctx.shadowBlur = 25;
                ctx.beginPath();
                ctx.arc(0, 0, 75, 0, Math.PI * 2);
                ctx.stroke();
                // 内层反向旋转圆环
                ctx.rotate(-rot * 2);
                ctx.globalAlpha = 0.4;
                ctx.strokeStyle = '#ffaadd';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(0, 0, 60, 0, Math.PI * 2);
                ctx.stroke();
                // 圆环上的发光点（表示分身数量）
                ctx.rotate(rot * 3);
                ctx.globalAlpha = 0.9;
                ctx.fillStyle = '#fff8dc';
                ctx.shadowColor = '#fff8dc';
                ctx.shadowBlur = 20;
                const dotCount = Math.min(heroClones.length, 12);
                for (let i = 0; i < dotCount; i++) {
                    const a = (i / dotCount) * Math.PI * 2;
                    ctx.beginPath();
                    ctx.arc(Math.cos(a) * 75, Math.sin(a) * 75, 5, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
            }
        }

        // ===== 新增：毒区（貂蝉百花绽放） =====
        function drawPoisonZones() {
            for (let i = poisonZones.length - 1; i >= 0; i--) {
                const pz = poisonZones[i];
                pz.life--;
                pz.tick--;
                if (pz.tick <= 0) {
                    pz.tick = 20;
                    for (const e of enemies.slice()) {
                        if (!e.alive) continue;
                        if (Math.sqrt((e.x-pz.x)**2 + (e.y-pz.y)**2) < pz.radius) {
                            dealDamage(e, stats.skill2, '#ff66cc', 4);
                        }
                    }
                }
                const alpha = Math.min(1, pz.life / 60);
                ctx.save();
                ctx.globalAlpha = alpha * 0.4;
                const grad = ctx.createRadialGradient(pz.x, pz.y, 0, pz.x, pz.y, pz.radius);
                grad.addColorStop(0, 'rgba(255,102,204,0.8)');
                grad.addColorStop(0.5, 'rgba(180,60,180,0.5)');
                grad.addColorStop(1, 'rgba(120,0,180,0)');
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(pz.x, pz.y, pz.radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                if (pz.life <= 0) poisonZones.splice(i, 1);
            }
        }

        // ===== 新增：骑兵冲锋（马超西凉铁骑 - 穿插浪潮） =====
        function drawCavalryCharges() {
            for (let i = cavalryCharges.length - 1; i >= 0; i--) {
                const c = cavalryCharges[i];
                // 穿插延迟：未到出发时间的骑兵原地待命（闪烁脉冲指示即将冲锋）
                if (c.startDelay > 0) {
                    c.startDelay--;
                    // 待命视觉：原位脉冲光环（紫色闪烁）
                    if (c.startDelay % 8 === 0) {
                        particles.push({
                            type: 'shockExplosion',
                            x: c.x, y: c.y, color: '#cc88ff', maxRadius: 25, life: 12, maxLife: 12
                        });
                    }
                    continue;
                }
                c.life--;
                c.x += c.dir * 12;
                c.tick--;
                if (c.tick <= 0) {
                    c.tick = 5;
                    for (const e of enemies.slice()) {
                        if (!e.alive) continue;
                        // 修复：y方向范围±50→±170，确保相邻骑兵(间距~329px)覆盖重叠，全图无死角
                        if (Math.abs(e.x - c.x) < 40 && Math.abs(e.y - c.y) < 170) {
                            dealDamage(e, stats.skill2, '#cc88ff', 6);
                        }
                    }
                }
                // 新增：骑兵后方尘土粒子（每帧生成2个，增强冲锋感）
                if (Math.random() < 0.6) {
                    particles.push({
                        type: 'dust',
                        x: c.x - c.dir * 20 + (Math.random() - 0.5) * 10,
                        y: c.y + 12 + Math.random() * 6,
                        vx: -c.dir * (1 + Math.random() * 2),
                        vy: -1 - Math.random(),
                        life: 25, maxLife: 25,
                        color: 'rgba(180,150,120,0.6)', size: 5
                    });
                }
                ctx.save();
                ctx.translate(c.x, c.y);
                ctx.fillStyle = '#aa66ff';
                ctx.shadowColor = '#aa66ff';
                ctx.shadowBlur = 20;
                ctx.beginPath();
                ctx.ellipse(0, 0, 25, 15, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 14px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(_t('骑'), 0, 0);
                ctx.restore();
                if (c.life <= 0 || c.x < (c.boundMin != null ? c.boundMin : -200) || c.x > (c.boundMax != null ? c.boundMax : MAP_WIDTH + 200)) cavalryCharges.splice(i, 1);
            }
        }

        // ===== 吕蒙天诛导弹绘制与更新 =====
        function drawLvmengMissiles() {
            for (let i = lvmengMissiles.length - 1; i >= 0; i--) {
                const m = lvmengMissiles[i];
                m.life--;
                // 追踪目标（如果目标还活着就实时跟踪）
                let tx = m.targetX, ty = m.targetY;
                if (m.target && m.target.alive) { tx = m.target.x; ty = m.target.y; }
                const dx = tx - m.x, dy = ty - m.y;
                const dist = Math.sqrt(dx*dx + dy*dy) || 1;
                m.x += (dx / dist) * m.speed;
                m.y += (dy / dist) * m.speed;
                // 拖尾粒子
                if (Math.random() < 0.7) {
                    particles.push({ type: 'burst', x: m.x, y: m.y, vx: (Math.random()-0.5)*2, vy: (Math.random()-0.5)*2, life: 15, maxLife: 15, color: '#00ffcc', size: 3 });
                }
                // 绘制导弹（青绿色流线型）
                ctx.save();
                const angle = Math.atan2(dy, dx);
                ctx.translate(m.x, m.y);
                ctx.rotate(angle);
                // 外层光晕
                ctx.shadowColor = '#00ffcc';
                ctx.shadowBlur = 20;
                ctx.fillStyle = '#00ffcc';
                ctx.beginPath();
                ctx.moveTo(8, 0);
                ctx.lineTo(-6, -4);
                ctx.lineTo(-4, 0);
                ctx.lineTo(-6, 4);
                ctx.closePath();
                ctx.fill();
                // 内层亮芯
                ctx.fillStyle = '#ffffff';
                ctx.shadowBlur = 10;
                ctx.beginPath();
                ctx.moveTo(6, 0);
                ctx.lineTo(-3, -2);
                ctx.lineTo(-2, 0);
                ctx.lineTo(-3, 2);
                ctx.closePath();
                ctx.fill();
                // 尾焰
                ctx.fillStyle = 'rgba(0, 255, 200, 0.6)';
                ctx.shadowBlur = 0;
                ctx.beginPath();
                ctx.moveTo(-6, -3);
                ctx.lineTo(-12 - Math.random()*4, 0);
                ctx.lineTo(-6, 3);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
                // 命中判定
                if (dist < 30 || m.life <= 0) {
                    // 爆炸特效
                    particles.push({ type: 'shockExplosion', x: m.x, y: m.y, color: '#00ffcc', maxRadius: 100, life: 25, maxLife: 25 });
                    particles.push({ type: 'ringExpand', x: m.x, y: m.y, color: '#00ffcc', maxRadius: 80, life: 20, maxLife: 20 });
                    for (let j = 0; j < 30; j++) {
                        const a = Math.random() * Math.PI * 2;
                        const spd = 2 + Math.random() * 8;
                        particles.push({ type: 'burst', x: m.x, y: m.y, vx: Math.cos(a)*spd, vy: Math.sin(a)*spd, life: 30, maxLife: 30, color: ['#00ffcc','#ffffff','#00ccaa'][Math.floor(Math.random()*3)], size: 3+Math.random()*5 });
                    }
                    // 对目标及附近敌人造成伤害（对单为主，小范围溅射）
                    for (const e of enemies.slice()) {
                        if (!e.alive) continue;
                        const d = Math.sqrt((e.x - m.x)**2 + (e.y - m.y)**2);
                        if (d < 50) {
                            dealDamage(e, m.dmg, '#00ffcc', 15);
                        }
                    }
                    triggerShake(true);
                    lvmengMissiles.splice(i, 1);
                }
            }
        }

        // ===== 新增：黄盖棱镜实体绘制（让玩家看到5个水晶棱镜在英雄周围环绕） =====
        function drawJingPrisms() {
            if (jingPrisms.length === 0) return;
            const prismT = Date.now() / 1000;
            for (let i = 0; i < jingPrisms.length; i++) {
                const p = jingPrisms[i];
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(prismT * 1.5 + i * 0.5);  // 每个棱镜独立旋转
                // 外层光晕
                ctx.shadowColor = '#00CED1';
                ctx.shadowBlur = 18;
                // 外层菱形水晶（青绿色）
                ctx.fillStyle = '#00CED1';
                ctx.beginPath();
                ctx.moveTo(0, -14);
                ctx.lineTo(10, 0);
                ctx.lineTo(0, 14);
                ctx.lineTo(-10, 0);
                ctx.closePath();
                ctx.fill();
                // 中层亮白菱形
                ctx.fillStyle = '#ffffff';
                ctx.shadowBlur = 8;
                ctx.beginPath();
                ctx.moveTo(0, -8);
                ctx.lineTo(5, 0);
                ctx.lineTo(0, 8);
                ctx.lineTo(-5, 0);
                ctx.closePath();
                ctx.fill();
                // 中心高光点
                ctx.fillStyle = '#ffffff';
                ctx.shadowBlur = 0;
                ctx.beginPath();
                ctx.arc(0, 0, 2, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                // 棱镜到英雄的连接线（淡青绿虚线，表示棱镜归属）
                ctx.save();
                ctx.globalAlpha = 0.2;
                ctx.strokeStyle = '#00CED1';
                ctx.lineWidth = 1;
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(hero.x, hero.y);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.restore();
            }
        }

        // ===== 新增：于吉寄生藤蔓持续链接绘制 =====
        function drawJiVineLinks() {
            if (!hero || !hero.alive || jiVineLinks.length === 0) return;
            const vineT = Date.now() / 1000;
            for (let i = jiVineLinks.length - 1; i >= 0; i--) {
                const link = jiVineLinks[i];
                if (!link.enemy || !link.enemy.alive) {
                    jiVineLinks.splice(i, 1);
                    continue;
                }
                const ex = link.enemy.x, ey = link.enemy.y;
                const hx = hero.x, hy = hero.y;
                // 绘制主藤蔓（森林绿粗曲线）
                ctx.save();
                ctx.strokeStyle = '#228B22';
                ctx.lineWidth = 3;
                ctx.shadowColor = '#3CB371';
                ctx.shadowBlur = 12;
                ctx.beginPath();
                ctx.moveTo(hx, hy);
                // 中间控制点做轻微摆动，模拟藤蔓扭动
                const midX = (hx + ex) / 2 + Math.sin(vineT * 3 + i) * 15;
                const midY = (hy + ey) / 2 + Math.cos(vineT * 3 + i) * 15;
                ctx.quadraticCurveTo(midX, midY, ex, ey);
                ctx.stroke();
                // 绘制副藤蔓（浅绿细线）
                ctx.strokeStyle = '#3CB371';
                ctx.lineWidth = 1.5;
                ctx.shadowBlur = 6;
                ctx.beginPath();
                ctx.moveTo(hx, hy);
                ctx.quadraticCurveTo(midX + 8, midY - 8, ex, ey);
                ctx.stroke();
                ctx.restore();
                // 沿藤蔓流动的生命光点（表示吸血）
                const flow = (vineT * 2 + i * 0.7) % 1;
                const fx = (1 - flow) * (1 - flow) * hx + 2 * (1 - flow) * flow * midX + flow * flow * ex;
                const fy = (1 - flow) * (1 - flow) * hy + 2 * (1 - flow) * flow * midY + flow * flow * ey;
                ctx.save();
                ctx.fillStyle = '#7CFC00';
                ctx.shadowColor = '#7CFC00';
                ctx.shadowBlur = 10;
                ctx.beginPath();
                ctx.arc(fx, fy, 4, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                // 敌人端寄生节点
                ctx.save();
                ctx.fillStyle = '#228B22';
                ctx.shadowColor = '#3CB371';
                ctx.shadowBlur = 14;
                ctx.beginPath();
                ctx.arc(ex, ey, 6 + Math.sin(vineT * 5 + i) * 2, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        }

        // ===== 新增：左慈时空裂隙伤害区域绘制 =====
        function drawZhiRift() {
            if (zhiRiftTimer <= 0) return;
            const t = Date.now() / 1000;
            const rx = zhiRiftX, ry = zhiRiftY;
            ctx.save();
            // 外圈紫罗兰旋转虚线环
            ctx.strokeStyle = 'rgba(147, 112, 219, 0.7)';
            ctx.lineWidth = 2.5;
            ctx.shadowColor = '#9370DB';
            ctx.shadowBlur = 20;
            ctx.setLineDash([10, 8]);
            ctx.lineDashOffset = -t * 40;
            ctx.beginPath();
            ctx.arc(rx, ry, 250, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([6, 12]);
            ctx.lineDashOffset = t * 30;
            ctx.beginPath();
            ctx.arc(rx, ry, 210, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            // 内部紫黑径向渐变
            const grad = ctx.createRadialGradient(rx, ry, 20, rx, ry, 250);
            grad.addColorStop(0, 'rgba(75, 0, 130, 0.35)');
            grad.addColorStop(0.5, 'rgba(147, 112, 219, 0.18)');
            grad.addColorStop(1, 'rgba(147, 112, 219, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(rx, ry, 250, 0, Math.PI * 2);
            ctx.fill();
            // 中心裂隙眼
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = '#BA55D3';
            ctx.shadowBlur = 25;
            ctx.beginPath();
            ctx.arc(rx, ry, 8 + Math.sin(t * 6) * 3, 0, Math.PI * 2);
            ctx.fill();
            // 旋转的裂隙碎片
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.lineWidth = 1.5;
            for (let i = 0; i < 8; i++) {
                const a = i * Math.PI / 4 + t * 1.5;
                const r1 = 30 + Math.sin(t * 3 + i) * 5;
                const r2 = 90 + Math.cos(t * 2 + i) * 15;
                ctx.beginPath();
                ctx.moveTo(rx + Math.cos(a) * r1, ry + Math.sin(a) * r1);
                ctx.lineTo(rx + Math.cos(a) * r2, ry + Math.sin(a) * r2);
                ctx.stroke();
            }
            ctx.shadowBlur = 0;
            ctx.restore();
        }

        // ===== 新增：闪电链绘制（马超神威万里） =====
        function drawLightningChains() {
            for (let i = lightningChains.length - 1; i >= 0; i--) {
                const lc = lightningChains[i];
                lc.life--;
                const alpha = lc.life / lc.maxLife;
                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.strokeStyle = '#aa66ff';
                ctx.shadowColor = '#aa66ff';
                ctx.shadowBlur = 25;
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.moveTo(lc.points[0].x, lc.points[0].y);
                for (let j = 1; j < lc.points.length; j++) {
                    const p = lc.points[j], prev = lc.points[j-1];
                    const segments = 6;
                    for (let s = 1; s <= segments; s++) {
                        const t = s / segments;
                        const x = prev.x + (p.x - prev.x) * t + (Math.random() - 0.5) * 20;
                        const y = prev.y + (p.y - prev.y) * t + (Math.random() - 0.5) * 20;
                        ctx.lineTo(x, y);
                    }
                }
                ctx.stroke();
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2;
                ctx.stroke();
                ctx.restore();
                if (lc.life <= 0) lightningChains.splice(i, 1);
            }
        }

        // ===== 墨子激光系统：更新（折射算法+伤害判定）+ 绘制 =====
        // 折射算法：激光到达终点(x2,y2)后，若bouncesLeft>0，则按入射角=反射角
        //           在最近墙壁上反射，生成新的激光段（新段有独立hitSet，可再伤同一敌人）
        // 简单防内存：每段激光只判定一次伤害（命中即加入hitSet），life递减后销毁
        function updateMoziLasers() {
            for (let i = moziLasers.length - 1; i >= 0; i--) {
                const L = moziLasers[i];
                L.life--;
                // ===== 伤害判定：本段激光对每个未命中过的敌人判定一次 =====
                // 线段-圆碰撞检测：敌人圆心到线段(x1,y1)-(x2,y2)的距离 < 敌人半径+激光半宽
                for (const e of enemies) {
                    if (!e.alive) continue;
                    if (L.hitSet.has(e)) continue;  // 本段已伤害过，跳过
                    // 点到线段距离
                    const dx = L.x2 - L.x1, dy = L.y2 - L.y1;
                    const lenSq = dx*dx + dy*dy;
                    if (lenSq < 0.01) continue;
                    let t = ((e.x - L.x1) * dx + (e.y - L.y1) * dy) / lenSq;
                    t = Math.max(0, Math.min(1, t));
                    const px = L.x1 + t * dx, py = L.y1 + t * dy;
                    const dist = Math.hypot(e.x - px, e.y - py);
                    if (dist < e.radius + L.width / 2) {
                        dealDamage(e, L.dmg, L.color, 10);
                        L.hitSet.add(e);  // 本段不再伤此敌人
                        // 命中粒子
                        particles.push({ type: 'hit', x: e.x, y: e.y, vx: (Math.random()-0.5)*4, vy: (Math.random()-0.5)*4, life: 15, maxLife: 15, color: L.color, size: 4 });
                    }
                }
                // ===== 折射判定：激光life结束且还有折射次数时，生成新段 =====
                // 在life=0时判定折射（让本段完整显示0.7秒后再折射）
                if (L.life <= 0) {
                    if (L.bouncesLeft > 0) {
                        // 激光终点(x2,y2)已经在墙边上（一技能发射时延伸到墙）
                        // 所以直接在终点处反射：判断终点触碰哪面墙，按入射角=反射角计算反射方向
                        const dx = L.x2 - L.x1, dy = L.y2 - L.y1;
                        const len = Math.hypot(dx, dy);
                        if (len < 0.01) { moziLasers.splice(i, 1); continue; }
                        const ux = dx / len, uy = dy / len;  // 入射方向单位向量
                        // ===== 判断终点触碰哪面墙（用容差避免浮点误差） =====
                        const tol = 2;  // 容差2px
                        let normalX = 0, normalY = 0;
                        if (L.x2 >= MAP_WIDTH - tol) { normalX = -1; normalY = 0; }      // 右墙：法线向左
                        else if (L.x2 <= tol) { normalX = 1; normalY = 0; }               // 左墙：法线向右
                        else if (L.y2 >= MAP_HEIGHT - tol) { normalX = 0; normalY = -1; } // 下墙：法线向上
                        else if (L.y2 <= tol) { normalX = 0; normalY = 1; }               // 上墙：法线向下
                        // ===== 反射方向：r = d - 2*(d·n)*n =====
                        const dot = ux * normalX + uy * normalY;
                        const rx = ux - 2 * dot * normalX;
                        const ry = uy - 2 * dot * normalY;
                        // ===== 折射段从墙交点沿反射方向延伸到下一面墙 =====
                        let tWall = Infinity;
                        if (rx > 0) tWall = Math.min(tWall, (MAP_WIDTH - L.x2) / rx);
                        if (rx < 0) tWall = Math.min(tWall, (0 - L.x2) / rx);
                        if (ry > 0) tWall = Math.min(tWall, (MAP_HEIGHT - L.y2) / ry);
                        if (ry < 0) tWall = Math.min(tWall, (0 - L.y2) / ry);
                        if (tWall < Infinity && tWall > 1) {  // tWall>1避免长度为0的折射段
                            const endX = L.x2 + rx * tWall;
                            const endY = L.y2 + ry * tWall;
                            moziLasers.push({
                                x1: L.x2, y1: L.y2,           // 折射段起点=原段终点（墙交点）
                                x2: endX, y2: endY,           // 折射段终点=下一面墙
                                life: 42, maxLife: 42,        // 折射段也显示0.7秒
                                width: L.width,               // 折射后宽度不变（用户要求）
                                bouncesLeft: L.bouncesLeft - 1,
                                hitSet: new Set(),            // 新段独立hitSet，可再伤同一敌人
                                dmg: L.dmg,
                                color: L.color,
                                isOrigin: false               // 标记为折射段（折射段可继续折射）
                            });
                            // 折射点特效
                            particles.push({ type: 'shockExplosion', x: L.x2, y: L.y2, color: L.color, maxRadius: 40, life: 20, maxLife: 20 });
                        }
                    }
                    moziLasers.splice(i, 1);  // 销毁本段
                }
            }
        }

        // ===== 墨子激光绘制 =====
        function drawMoziLasers() {
            for (const L of moziLasers) {
                const alpha = Math.min(1, L.life / 15);  // 最后0.25秒淡出
                ctx.save();
                // 外层光晕（宽+模糊）
                ctx.strokeStyle = L.color + '44';
                ctx.lineWidth = L.width * 1.8;
                ctx.lineCap = 'round';
                ctx.shadowColor = L.color;
                ctx.shadowBlur = 20;
                ctx.beginPath();
                ctx.moveTo(L.x1, L.y1);
                ctx.lineTo(L.x2, L.y2);
                ctx.stroke();
                // 中层
                ctx.strokeStyle = L.color + Math.floor(alpha * 200).toString(16).padStart(2,'0');
                ctx.lineWidth = L.width;
                ctx.shadowBlur = 12;
                ctx.beginPath();
                ctx.moveTo(L.x1, L.y1);
                ctx.lineTo(L.x2, L.y2);
                ctx.stroke();
                // 内层亮芯
                ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.9})`;
                ctx.lineWidth = Math.max(2, L.width * 0.3);
                ctx.shadowBlur = 8;
                ctx.beginPath();
                ctx.moveTo(L.x1, L.y1);
                ctx.lineTo(L.x2, L.y2);
                ctx.stroke();
                ctx.restore();
            }
        }

        // ===== 6英雄Canvas头像绘制系统（不用汉字+圆圈，不用image） =====
        // 像素艺术风格绘制，每个英雄有独特外形+专属动效
        // shadeColor：将hex颜色调亮(+)或调暗(-)，percent范围-100~100
        // 皮肤系统通过此函数将皮肤颜色作用于英雄主体（而非仅外圈光晕）
        function shadeColor(hex, percent) {
            let r = parseInt(hex.slice(1, 3), 16);
            let g = parseInt(hex.slice(3, 5), 16);
            let b = parseInt(hex.slice(5, 7), 16);
            r = Math.max(0, Math.min(255, r + Math.round(r * percent / 100)));
            g = Math.max(0, Math.min(255, g + Math.round(g * percent / 100)));
            b = Math.max(0, Math.min(255, b + Math.round(b * percent / 100)));
            return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
        }

