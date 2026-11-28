// ============================================================
// 文件: src/skins.js
// 描述: 皮肤系统定义
// 行范围: 1411-1561 (原 game.js)
// 注意: 本文件由原版 HTML 抽取，保持原作用域不变
// ============================================================

// ===== 中/英文国际化词条 =====
Object.assign(I18N_DICT, {
    '原色': 'Original', '黄金': 'Gold', '暗影': 'Shadow', '冰霜': 'Frost',
    '翡翠': 'Jade', '烈白': 'Blazing White', '幽冥': 'Abyss', '青龙': 'Azure Dragon',
    '烈阳': 'Blazing Sun', '蔷薇': 'Rose', '魔神降世': 'Demon God Descends',
    '银龙': 'Silver Dragon', '赤龙': 'Crimson Dragon', '紫龙': 'Violet Dragon',
    '金龙': 'Golden Dragon', '幽影': 'Ghost Shadow', '银光': 'Silver Light',
    '翠龙': 'Emerald Dragon', '炎龙': 'Flame Dragon', '樱龙': 'Cherry Dragon',
    '龙胆神威': 'Dragon Might', '玫瑰': 'Rose', '百合': 'Lily', '碧海': 'Azure Sea',
    '薄荷': 'Mint', '金凤': 'Golden Phoenix', '暗夜': 'Dark Night', '碧波': 'Emerald Wave',
    '紫霞': 'Purple Haze', '银月': 'Silver Moon', '倾城舞蝶': 'Charming Butterfly',
    '苍龙': 'Azure Dragon', '武神': 'War God', '血战': 'Blood Battle', '暗武': 'Dark Warrior',
    '白帝': 'White Emperor', '幽武': 'Ghost Warrior', '烈武': 'Blazing Warrior',
    '桃花': 'Peach Blossom', '青武': 'Cyan Warrior', '武圣青龙': 'Saintly Azure Dragon',
    '赤焰': 'Crimson Flame', '翠羽': 'Emerald Feather', '银弓': 'Silver Bow',
    '紫雷': 'Purple Thunder', '白金': 'Platinum', '暗箭': 'Dark Arrow', '青弓': 'Cyan Bow',
    '花翎': 'Flowery Plume', '苍弓': 'Azure Bow', '神射九日': 'Sun-Slayer',
    '雷霆': 'Thunder', '寒冰': 'Ice', '血雷': 'Blood Thunder', '暗雷': 'Dark Thunder',
    '雪骑': 'Snow Rider', '幽骑': 'Ghost Rider', '烈骑': 'Blazing Rider', '樱骑': 'Cherry Rider',
    '冰骑': 'Ice Rider', '天雷银骑': 'Thunder Silver Rider', '卧龙': 'Sleeping Dragon',
    '翠玉': 'Emerald Jade', '紫微': 'Purple Star', '暗龙': 'Dark Dragon',
    '朱龙': 'Vermilion Dragon', '火龙': 'Fire Dragon', '花龙': 'Flower Dragon',
    '卧龙星陨': 'Falling Star Dragon', '青铜': 'Bronze', '玄铁': 'Dark Iron',
    '血怒': 'Blood Rage', '墨玉': 'Ink Jade', '金莽': 'Golden Serpent',
    '银蛇': 'Silver Serpent', '苍蛇': 'Azure Serpent', '花蛇': 'Flower Serpent',
    '青蛇': 'Cyan Serpent', '万夫莫敌': 'Unrivaled', '赤壁': 'Red Cliffs',
    '炎帝': 'Flame Emperor', '碧炎': 'Azure Flame', '紫焰': 'Purple Flame',
    '白焰': 'White Flame', '暗焰': 'Dark Flame', '碧焰': 'Emerald Flame',
    '花焰': 'Flower Flame', '银焰': 'Silver Flame', '赤壁炎神': 'Red Cliffs Fire God',
    '金鳞': 'Golden Scale', '银甲': 'Silver Armor', '血衣': 'Blood Robe', '暗杀': 'Assassin',
    '白甲': 'White Armor', '暗甲': 'Dark Armor', '烈甲': 'Blazing Armor', '花甲': 'Flower Armor',
    '苍甲': 'Azure Armor', '潜渊龙鳞': 'Abyss Dragon Scale', '光辉': 'Radiance',
    '霞光': 'Rosy Glow', '翠光': 'Emerald Glow', '紫光': 'Purple Glow', '暗光': 'Dark Glow',
    '朱光': 'Vermilion Glow', '火光': 'Fire Glow', '青光': 'Cyan Glow', '非攻天光': 'Celestial Light',
    '金律': 'Golden Rule', '寒律': 'Frost Rule', '血律': 'Blood Rule', '暗律': 'Dark Rule',
    '白律': 'White Rule', '翠律': 'Emerald Rule', '苍律': 'Azure Rule', '花律': 'Flower Rule',
    '青律': 'Cyan Rule', '天刑裁决': 'Heavenly Judgment', '金穹': 'Golden Sky',
    '紫穹': 'Purple Sky', '翠穹': 'Emerald Sky', '赤穹': 'Crimson Sky', '白穹': 'White Sky',
    '暗穹': 'Dark Sky', '橙穹': 'Orange Sky', '樱穹': 'Cherry Sky', '银穹': 'Silver Sky',
    '苍穹破碎': 'Broken Heavens', '金烬': 'Golden Ember', '暗烬': 'Dark Ember',
    '冰烬': 'Frost Ember', '翠烬': 'Emerald Ember', '白烬': 'White Ember', '幽烬': 'Ghost Ember',
    '青烬': 'Cyan Ember', '花烬': 'Flower Ember', '银烬': 'Silver Ember', '灰烬余晖': 'Ember Afterglow',
    '银澜': 'Silver Wave', '赤澜': 'Crimson Wave', '紫澜': 'Purple Wave', '金澜': 'Golden Wave',
    '白澜': 'White Wave', '暗澜': 'Dark Wave', '翠澜': 'Emerald Wave', '橙澜': 'Orange Wave',
    '樱澜': 'Cherry Wave', '狂澜怒涛': 'Raging Tide', '金织': 'Golden Weave',
    '翠织': 'Emerald Weave', '银织': 'Silver Weave', '赤织': 'Crimson Weave', '白织': 'White Weave',
    '暗织': 'Dark Weave', '青织': 'Cyan Weave', '橙织': 'Orange Weave', '花织': 'Flower Weave',
    '虚空织梦': 'Dream Weaver', '金焰': 'Golden Flame', '冰焰': 'Frost Flame',
    '翠焰': 'Emerald Flame', '幽焰': 'Ghost Flame', '青焰': 'Cyan Flame', '焚天业火': 'Inferno',
    '银霜': 'Silver Frost', '赤霜': 'Crimson Frost', '紫霜': 'Purple Frost', '金霜': 'Golden Frost',
    '白霜': 'White Frost', '暗霜': 'Dark Frost', '翠霜': 'Emerald Frost', '橙霜': 'Orange Frost',
    '樱霜': 'Cherry Frost', '极寒霜魄': 'Arctic Soul', '金棘': 'Golden Thorn', '暗棘': 'Dark Thorn',
    '赤棘': 'Crimson Thorn', '紫棘': 'Purple Thorn', '白棘': 'White Thorn', '幽棘': 'Ghost Thorn',
    '青棘': 'Cyan Thorn', '橙棘': 'Orange Thorn', '花棘': 'Flower Thorn', '荆棘王冠': 'Crown of Thorns',
    '金晶': 'Golden Crystal', '紫晶': 'Purple Crystal', '赤晶': 'Crimson Crystal',
    '翠晶': 'Emerald Crystal', '白晶': 'White Crystal', '暗晶': 'Dark Crystal',
    '青晶': 'Cyan Crystal', '橙晶': 'Orange Crystal', '银晶': 'Silver Crystal', '晶魄琉璃': 'Crystal Soul',
    '默认': 'Default', '金色': 'Gold', '紫色': 'Purple', '冰蓝': 'Ice Blue', '翠绿': 'Emerald',
    '白色': 'White', '黑色': 'Black', '青色': 'Cyan', '橙色': 'Orange', '粉色': 'Pink',
    '红色': 'Red', '银色': 'Silver', '深红': 'Crimson', '蓝色': 'Blue', '灰色': 'Gray',
    '绿色': 'Green', '铜色': 'Bronze', '墨绿': 'Dark Green', '深紫': 'Deep Purple',
    '深蓝': 'Deep Blue', '天蓝': 'Sky Blue', '暗红': 'Dark Red', '碧蓝': 'Azure',
    '紫罗兰': 'Violet', '森林绿': 'Forest Green', '橙红': 'Orange Red', '青绿': 'Teal',
    '海蓝': 'Sea Blue', '传说': 'Legendary'
});

        // ===== 皮肤系统定义 =====
        // ============================================================
        // 每个英雄有10款换色皮肤（1原色+9换色）+ 1款传说皮肤，key='default'为原色
        // skinOverride 存储当前每个英雄选中的皮肤ID（null=使用原色）
        const SKIN_DEFS = {
            lubu: [
                { id: 'default', name: _t('原色'), color: '#ff4444', tag: _t('默认') },
                { id: 'gold',    name: _t('黄金'), color: '#ffd700', tag: _t('金色') },
                { id: 'dark',    name: _t('暗影'), color: '#8800ff', tag: _t('紫色') },
                { id: 'ice',     name: _t('冰霜'), color: '#00ddff', tag: _t('冰蓝') },
                { id: 'emerald', name: _t('翡翠'), color: '#00ff88', tag: _t('翠绿') },
                { id: 'white',   name: _t('烈白'), color: '#f0f0f0', tag: _t('白色') },
                { id: 'abyss',   name: _t('幽冥'), color: '#1a1a2e', tag: _t('黑色') },
                { id: 'cyan',    name: _t('青龙'), color: '#00ffcc', tag: _t('青色') },
                { id: 'orange',  name: _t('烈阳'), color: '#ff8800', tag: _t('橙色') },
                { id: 'pink',    name: _t('蔷薇'), color: '#ff66aa', tag: _t('粉色') },
                { id: 'legend',  name: _t('魔神降世'), type: 'legend', colors: ["#ff0000", "#ffd700", "#8b0000", "#330000"], tag: _t('传说') }
            ],
            zhaoyun: [
                { id: 'default', name: _t('原色'), color: '#44aaff', tag: _t('默认') },
                { id: 'silver',  name: _t('银龙'), color: '#cccccc', tag: _t('银色') },
                { id: 'crimson', name: _t('赤龙'), color: '#ff3344', tag: _t('红色') },
                { id: 'violet',  name: _t('紫龙'), color: '#aa44ff', tag: _t('紫色') },
                { id: 'gold',    name: _t('金龙'), color: '#ffcc00', tag: _t('金色') },
                { id: 'dark',    name: _t('幽影'), color: '#1a1a3a', tag: _t('黑色') },
                { id: 'white',   name: _t('银光'), color: '#e8e8ff', tag: _t('白色') },
                { id: 'emerald', name: _t('翠龙'), color: '#00ff66', tag: _t('翠绿') },
                { id: 'orange',  name: _t('炎龙'), color: '#ff7700', tag: _t('橙色') },
                { id: 'pink',    name: _t('樱龙'), color: '#ff66bb', tag: _t('粉色') },
                { id: 'legend',  name: _t('龙胆神威'), type: 'legend', colors: ["#44aaff", "#cccccc", "#ffd700", "#001133"], tag: _t('传说') }
            ],
            diaochan: [
                { id: 'default', name: _t('原色'), color: '#ff66cc', tag: _t('默认') },
                { id: 'rose',    name: _t('玫瑰'), color: '#ff2266', tag: _t('深红') },
                { id: 'lily',    name: _t('百合'), color: '#ffffff', tag: _t('白色') },
                { id: 'ocean',   name: _t('碧海'), color: '#00aaff', tag: _t('海蓝') },
                { id: 'mint',    name: _t('薄荷'), color: '#44ffaa', tag: _t('薄荷') },
                { id: 'gold',    name: _t('金凤'), color: '#ffcc44', tag: _t('金色') },
                { id: 'dark',    name: _t('暗夜'), color: '#2a1a3a', tag: _t('黑色') },
                { id: 'cyan',    name: _t('碧波'), color: '#00ddcc', tag: _t('青色') },
                { id: 'violet',  name: _t('紫霞'), color: '#9944ff', tag: _t('紫色') },
                { id: 'silver',  name: _t('银月'), color: '#bbbbcc', tag: _t('银色') },
                { id: 'legend',  name: _t('倾城舞蝶'), type: 'legend', colors: ["#ff66cc", "#ff99cc", "#ffccff", "#ffffff"], tag: _t('传说') }
            ],
            guanyu: [
                { id: 'default', name: _t('原色'), color: '#44ff44', tag: _t('默认') },
                { id: 'azure',   name: _t('苍龙'), color: '#2266ff', tag: _t('蓝色') },
                { id: 'gold',    name: _t('武神'), color: '#ffcc00', tag: _t('金色') },
                { id: 'crimson', name: _t('血战'), color: '#ff2222', tag: _t('红色') },
                { id: 'shadow',  name: _t('暗武'), color: '#666666', tag: _t('灰色') },
                { id: 'white',   name: _t('白帝'), color: '#f8f8f0', tag: _t('白色') },
                { id: 'dark',    name: _t('幽武'), color: '#1a2a1a', tag: _t('黑色') },
                { id: 'orange',  name: _t('烈武'), color: '#ff8800', tag: _t('橙色') },
                { id: 'pink',    name: _t('桃花'), color: '#ff66aa', tag: _t('粉色') },
                { id: 'cyan',    name: _t('青武'), color: '#00ccaa', tag: _t('青色') },
                { id: 'legend',  name: _t('武圣青龙'), type: 'legend', colors: ["#44ff44", "#ffd700", "#ff2222", "#004400"], tag: _t('传说') }
            ],
            huangzhong: [
                { id: 'default', name: _t('原色'), color: '#ffaa00', tag: _t('默认') },
                { id: 'crimson', name: _t('赤焰'), color: '#ff4400', tag: _t('红色') },
                { id: 'emerald', name: _t('翠羽'), color: '#00cc44', tag: _t('绿色') },
                { id: 'silver',  name: _t('银弓'), color: '#aaaaaa', tag: _t('银色') },
                { id: 'violet',  name: _t('紫雷'), color: '#9933ff', tag: _t('紫色') },
                { id: 'white',   name: _t('白金'), color: '#f0f0dd', tag: _t('白色') },
                { id: 'dark',    name: _t('暗箭'), color: '#222233', tag: _t('黑色') },
                { id: 'cyan',    name: _t('青弓'), color: '#00ccdd', tag: _t('青色') },
                { id: 'pink',    name: _t('花翎'), color: '#ff66bb', tag: _t('粉色') },
                { id: 'azure',   name: _t('苍弓'), color: '#4488ff', tag: _t('蓝色') },
                { id: 'legend',  name: _t('神射九日'), type: 'legend', colors: ["#ffaa00", "#ff4400", "#ffd700", "#ffffff"], tag: _t('传说') }
            ],
            machao: [
                { id: 'default', name: _t('原色'), color: '#aa66ff', tag: _t('默认') },
                { id: 'gold',    name: _t('雷霆'), color: '#ffdd00', tag: _t('金色') },
                { id: 'ice',     name: _t('寒冰'), color: '#00ccff', tag: _t('冰蓝') },
                { id: 'crimson', name: _t('血雷'), color: '#ff0044', tag: _t('红色') },
                { id: 'dark',    name: _t('暗雷'), color: '#330066', tag: _t('深紫') },
                { id: 'white',   name: _t('雪骑'), color: '#e8e8f0', tag: _t('白色') },
                { id: 'shadow',  name: _t('幽骑'), color: '#1a1a2a', tag: _t('黑色') },
                { id: 'orange',  name: _t('烈骑'), color: '#ff7700', tag: _t('橙色') },
                { id: 'pink',    name: _t('樱骑'), color: '#ff66aa', tag: _t('粉色') },
                { id: 'cyan',    name: _t('冰骑'), color: '#00ccdd', tag: _t('青色') },
                { id: 'legend',  name: _t('天雷银骑'), type: 'legend', colors: ["#aa66ff", "#00ccff", "#ffffff", "#330066"], tag: _t('传说') }
            ],
            zhugeliang: [
                { id: 'default', name: _t('原色'), color: '#66ddff', tag: _t('默认') },
                { id: 'gold',    name: _t('卧龙'), color: '#ffcc44', tag: _t('金色') },
                { id: 'jade',    name: _t('翠玉'), color: '#00ff99', tag: _t('翠绿') },
                { id: 'violet',  name: _t('紫微'), color: '#cc66ff', tag: _t('紫色') },
                { id: 'white',   name: _t('白帝'), color: '#eeeeff', tag: _t('白色') },
                { id: 'dark',    name: _t('暗龙'), color: '#1a2a3a', tag: _t('黑色') },
                { id: 'crimson', name: _t('朱龙'), color: '#ff3344', tag: _t('红色') },
                { id: 'silver',  name: _t('银龙'), color: '#c0c0d0', tag: _t('银色') },
                { id: 'orange',  name: _t('火龙'), color: '#ff8800', tag: _t('橙色') },
                { id: 'pink',    name: _t('花龙'), color: '#ff66bb', tag: _t('粉色') },
                { id: 'legend',  name: _t('卧龙星陨'), type: 'legend', colors: ["#66ddff", "#ffffff", "#ffcc44", "#000033"], tag: _t('传说') }
            ],
            zhangfei: [
                { id: 'default', name: _t('原色'), color: '#aaaaaa', tag: _t('默认') },
                { id: 'bronze',  name: _t('青铜'), color: '#cc8844', tag: _t('铜色') },
                { id: 'dark',    name: _t('玄铁'), color: '#222222', tag: _t('黑色') },
                { id: 'crimson', name: _t('血怒'), color: '#cc2222', tag: _t('红色') },
                { id: 'emerald', name: _t('墨玉'), color: '#226644', tag: _t('墨绿') },
                { id: 'gold',    name: _t('金莽'), color: '#ccaa33', tag: _t('金色') },
                { id: 'white',   name: _t('银蛇'), color: '#d0d0d8', tag: _t('白色') },
                { id: 'azure',   name: _t('苍蛇'), color: '#3388dd', tag: _t('蓝色') },
                { id: 'pink',    name: _t('花蛇'), color: '#ff66aa', tag: _t('粉色') },
                { id: 'cyan',    name: _t('青蛇'), color: '#00ccaa', tag: _t('青色') },
                { id: 'legend',  name: _t('万夫莫敌'), type: 'legend', colors: ["#aaaaaa", "#ff0000", "#000000", "#ffcc00"], tag: _t('传说') }
            ],
            zhouyu: [
                { id: 'default', name: _t('原色'), color: '#ff7733', tag: _t('默认') },
                { id: 'crimson', name: _t('赤壁'), color: '#ff2200', tag: _t('深红') },
                { id: 'gold',    name: _t('炎帝'), color: '#ffaa00', tag: _t('金色') },
                { id: 'azure',   name: _t('碧炎'), color: '#00aaff', tag: _t('蓝色') },
                { id: 'violet',  name: _t('紫焰'), color: '#aa44ff', tag: _t('紫色') },
                { id: 'white',   name: _t('白焰'), color: '#f0e8e0', tag: _t('白色') },
                { id: 'dark',    name: _t('暗焰'), color: '#2a1a0a', tag: _t('黑色') },
                { id: 'cyan',    name: _t('碧焰'), color: '#00ccdd', tag: _t('青色') },
                { id: 'pink',    name: _t('花焰'), color: '#ff66bb', tag: _t('粉色') },
                { id: 'silver',  name: _t('银焰'), color: '#bbbccc', tag: _t('银色') },
                { id: 'legend',  name: _t('赤壁炎神'), type: 'legend', colors: ["#ff7733", "#ff0000", "#ffff00", "#330000"], tag: _t('传说') }
            ],
            lvmeng: [
                { id: 'default', name: _t('原色'), color: '#00ccaa', tag: _t('默认') },
                { id: 'gold',    name: _t('金鳞'), color: '#ffcc44', tag: _t('金色') },
                { id: 'silver',  name: _t('银甲'), color: '#aabbcc', tag: _t('银色') },
                { id: 'crimson', name: _t('血衣'), color: '#cc3322', tag: _t('红色') },
                { id: 'dark',    name: _t('暗杀'), color: '#330044', tag: _t('深紫') },
                { id: 'white',   name: _t('白甲'), color: '#e8f0e8', tag: _t('白色') },
                { id: 'shadow',  name: _t('暗甲'), color: '#1a2a1a', tag: _t('黑色') },
                { id: 'orange',  name: _t('烈甲'), color: '#ff8800', tag: _t('橙色') },
                { id: 'pink',    name: _t('花甲'), color: '#ff66bb', tag: _t('粉色') },
                { id: 'azure',   name: _t('苍甲'), color: '#4488ff', tag: _t('蓝色') },
                { id: 'legend',  name: _t('潜渊龙鳞'), type: 'legend', colors: ["#00ccaa", "#004488", "#88ddff", "#ffffff"], tag: _t('传说') }
            ],
            mozi: [
                { id: 'default', name: _t('原色'), color: '#7DDFFF', tag: _t('默认') },
                { id: 'gold',    name: _t('光辉'), color: '#FFD700', tag: _t('金色') },
                { id: 'rose',    name: _t('霞光'), color: '#FF66AA', tag: _t('粉色') },
                { id: 'jade',    name: _t('翠光'), color: '#00FF99', tag: _t('翠绿') },
                { id: 'violet',  name: _t('紫光'), color: '#BB44FF', tag: _t('紫色') },
                { id: 'dark',    name: _t('暗光'), color: '#1a1a2e', tag: _t('黑色') },
                { id: 'crimson', name: _t('朱光'), color: '#ff3344', tag: _t('红色') },
                { id: 'silver',  name: _t('银光'), color: '#c0c0d0', tag: _t('银色') },
                { id: 'orange',  name: _t('火光'), color: '#ff8800', tag: _t('橙色') },
                { id: 'cyan',    name: _t('青光'), color: '#00ccdd', tag: _t('青色') },
                { id: 'legend',  name: _t('非攻天光'), type: 'legend', colors: ["#7DDFFF", "#FFD700", "#FF66AA", "#ffffff"], tag: _t('传说') }
            ],
            hanfei: [
                { id: 'default', name: _t('原色'), color: '#7a7a7a', tag: _t('默认') },
                { id: 'gold',    name: _t('金律'), color: '#ccaa44', tag: _t('金色') },
                { id: 'ice',     name: _t('寒律'), color: '#44aaff', tag: _t('冰蓝') },
                { id: 'crimson', name: _t('血律'), color: '#aa2222', tag: _t('红色') },
                { id: 'dark',    name: _t('暗律'), color: '#1a1a3a', tag: _t('深蓝') },
                { id: 'white',   name: _t('白律'), color: '#e0e0e8', tag: _t('白色') },
                { id: 'emerald', name: _t('翠律'), color: '#22aa44', tag: _t('翠绿') },
                { id: 'azure',   name: _t('苍律'), color: '#4488ff', tag: _t('蓝色') },
                { id: 'pink',    name: _t('花律'), color: '#ff66bb', tag: _t('粉色') },
                { id: 'cyan',    name: _t('青律'), color: '#00ccaa', tag: _t('青色') },
                { id: 'legend',  name: _t('天刑裁决'), type: 'legend', colors: ['#7a7a7a', '#ffffff', '#cc2222', '#1a1a3a'], tag: _t('传说') }
            ],
            // ===== 10个新英雄皮肤（每个10款：原色+9换色）+ 1款传说皮肤 =====
            cangqiong: [
                { id: 'default', name: _t('原色'), color: '#4A90E2', tag: _t('天蓝') },
                { id: 'gold',    name: _t('金穹'), color: '#FFD700', tag: _t('金色') },
                { id: 'violet',  name: _t('紫穹'), color: '#9370DB', tag: _t('紫色') },
                { id: 'emerald', name: _t('翠穹'), color: '#00FF88', tag: _t('翠绿') },
                { id: 'crimson', name: _t('赤穹'), color: '#FF3344', tag: _t('红色') },
                { id: 'white',   name: _t('白穹'), color: '#E8E8F0', tag: _t('白色') },
                { id: 'dark',    name: _t('暗穹'), color: '#1a1a2e', tag: _t('黑色') },
                { id: 'orange',  name: _t('橙穹'), color: '#FF8800', tag: _t('橙色') },
                { id: 'pink',    name: _t('樱穹'), color: '#FF66BB', tag: _t('粉色') },
                { id: 'silver',  name: _t('银穹'), color: '#C0C0C0', tag: _t('银色') },
                { id: 'legend',  name: _t('苍穹破碎'), type: 'legend', colors: ["#4A90E2", "#FFD700", "#FF3344", "#ffffff"], tag: _t('传说') }
            ],
            jin: [
                { id: 'default', name: _t('原色'), color: '#B22222', tag: _t('暗红') },
                { id: 'gold',    name: _t('金烬'), color: '#FFAA00', tag: _t('金色') },
                { id: 'dark',    name: _t('暗烬'), color: '#4B0082', tag: _t('紫色') },
                { id: 'ice',     name: _t('冰烬'), color: '#00DDFF', tag: _t('冰蓝') },
                { id: 'emerald', name: _t('翠烬'), color: '#22AA44', tag: _t('翠绿') },
                { id: 'white',   name: _t('白烬'), color: '#E8E8E0', tag: _t('白色') },
                { id: 'shadow',  name: _t('幽烬'), color: '#1a1a1a', tag: _t('黑色') },
                { id: 'cyan',    name: _t('青烬'), color: '#00CCDD', tag: _t('青色') },
                { id: 'pink',    name: _t('花烬'), color: '#FF66BB', tag: _t('粉色') },
                { id: 'silver',  name: _t('银烬'), color: '#BBBBCC', tag: _t('银色') },
                { id: 'legend',  name: _t('灰烬余晖'), type: 'legend', colors: ["#B22222", "#FFAA00", "#4B0082", "#ffffff"], tag: _t('传说') }
            ],
            lan: [
                { id: 'default', name: _t('原色'), color: '#1E90FF', tag: _t('碧蓝') },
                { id: 'silver',  name: _t('银澜'), color: '#CCCCCC', tag: _t('银色') },
                { id: 'crimson', name: _t('赤澜'), color: '#FF3344', tag: _t('红色') },
                { id: 'violet',  name: _t('紫澜'), color: '#AA44FF', tag: _t('紫色') },
                { id: 'gold',    name: _t('金澜'), color: '#FFCC00', tag: _t('金色') },
                { id: 'white',   name: _t('白澜'), color: '#E8E8F8', tag: _t('白色') },
                { id: 'dark',    name: _t('暗澜'), color: '#1a1a2a', tag: _t('黑色') },
                { id: 'emerald', name: _t('翠澜'), color: '#00FF88', tag: _t('翠绿') },
                { id: 'orange',  name: _t('橙澜'), color: '#FF8800', tag: _t('橙色') },
                { id: 'pink',    name: _t('樱澜'), color: '#FF66BB', tag: _t('粉色') },
                { id: 'legend',  name: _t('狂澜怒涛'), type: 'legend', colors: ["#1E90FF", "#00FFFF", "#FFFFFF", "#0000FF"], tag: _t('传说') }
            ],
            zhi: [
                { id: 'default', name: _t('原色'), color: '#9370DB', tag: _t('紫罗兰') },
                { id: 'gold',    name: _t('金织'), color: '#FFCC44', tag: _t('金色') },
                { id: 'emerald', name: _t('翠织'), color: '#00FF99', tag: _t('翠绿') },
                { id: 'silver',  name: _t('银织'), color: '#C0C0C0', tag: _t('银色') },
                { id: 'crimson', name: _t('赤织'), color: '#FF2222', tag: _t('红色') },
                { id: 'white',   name: _t('白织'), color: '#E8E8F0', tag: _t('白色') },
                { id: 'dark',    name: _t('暗织'), color: '#1a1a2e', tag: _t('黑色') },
                { id: 'cyan',    name: _t('青织'), color: '#00CCDD', tag: _t('青色') },
                { id: 'orange',  name: _t('橙织'), color: '#FF8800', tag: _t('橙色') },
                { id: 'pink',    name: _t('花织'), color: '#FF66BB', tag: _t('粉色') },
                { id: 'legend',  name: _t('虚空织梦'), type: 'legend', colors: ["#9370DB", "#FF00FF", "#00FFFF", "#ffffff"], tag: _t('传说') }
            ],
            yan: [
                { id: 'default', name: _t('原色'), color: '#FF4500', tag: _t('橙红') },
                { id: 'gold',    name: _t('金焰'), color: '#FFAA00', tag: _t('金色') },
                { id: 'dark',    name: _t('暗焰'), color: '#8800FF', tag: _t('紫色') },
                { id: 'ice',     name: _t('冰焰'), color: '#00DDFF', tag: _t('冰蓝') },
                { id: 'emerald', name: _t('翠焰'), color: '#00FF88', tag: _t('翠绿') },
                { id: 'white',   name: _t('白焰'), color: '#E8E8E0', tag: _t('白色') },
                { id: 'shadow',  name: _t('幽焰'), color: '#1a1a1a', tag: _t('黑色') },
                { id: 'cyan',    name: _t('青焰'), color: '#00CCDD', tag: _t('青色') },
                { id: 'pink',    name: _t('花焰'), color: '#FF66BB', tag: _t('粉色') },
                { id: 'silver',  name: _t('银焰'), color: '#BBBBCC', tag: _t('银色') },
                { id: 'legend',  name: _t('焚天业火'), type: 'legend', colors: ["#FF4500", "#FFD700", "#FF0000", "#ffffff"], tag: _t('传说') }
            ],
            shuang: [
                { id: 'default', name: _t('原色'), color: '#00BFFF', tag: _t('天蓝') },
                { id: 'silver',  name: _t('银霜'), color: '#CCCCCC', tag: _t('银色') },
                { id: 'crimson', name: _t('赤霜'), color: '#FF3344', tag: _t('红色') },
                { id: 'violet',  name: _t('紫霜'), color: '#AA44FF', tag: _t('紫色') },
                { id: 'gold',    name: _t('金霜'), color: '#FFCC00', tag: _t('金色') },
                { id: 'white',   name: _t('白霜'), color: '#E8E8F8', tag: _t('白色') },
                { id: 'dark',    name: _t('暗霜'), color: '#1a1a2a', tag: _t('黑色') },
                { id: 'emerald', name: _t('翠霜'), color: '#00FF88', tag: _t('翠绿') },
                { id: 'orange',  name: _t('橙霜'), color: '#FF8800', tag: _t('橙色') },
                { id: 'pink',    name: _t('樱霜'), color: '#FF66BB', tag: _t('粉色') },
                { id: 'legend',  name: _t('极寒霜魄'), type: 'legend', colors: ["#00BFFF", "#FFFFFF", "#88CCFF", "#0033AA"], tag: _t('传说') }
            ],
            ji: [
                { id: 'default', name: _t('原色'), color: '#228B22', tag: _t('森林绿') },
                { id: 'gold',    name: _t('金棘'), color: '#FFCC44', tag: _t('金色') },
                { id: 'dark',    name: _t('暗棘'), color: '#4B0082', tag: _t('紫色') },
                { id: 'crimson', name: _t('赤棘'), color: '#CC2222', tag: _t('红色') },
                { id: 'violet',  name: _t('紫棘'), color: '#9933FF', tag: _t('紫色') },
                { id: 'white',   name: _t('白棘'), color: '#E8E8E0', tag: _t('白色') },
                { id: 'shadow',  name: _t('幽棘'), color: '#1a2a1a', tag: _t('黑色') },
                { id: 'cyan',    name: _t('青棘'), color: '#00CCDD', tag: _t('青色') },
                { id: 'orange',  name: _t('橙棘'), color: '#FF8800', tag: _t('橙色') },
                { id: 'pink',    name: _t('花棘'), color: '#FF66BB', tag: _t('粉色') },
                { id: 'legend',  name: _t('荆棘王冠'), type: 'legend', colors: ["#228B22", "#FFD700", "#CC2222", "#ffffff"], tag: _t('传说') }
            ],
            jing: [
                { id: 'default', name: _t('原色'), color: '#00CED1', tag: _t('青绿') },
                { id: 'gold',    name: _t('金晶'), color: '#FFCC00', tag: _t('金色') },
                { id: 'violet',  name: _t('紫晶'), color: '#BB44FF', tag: _t('紫色') },
                { id: 'crimson', name: _t('赤晶'), color: '#FF3344', tag: _t('红色') },
                { id: 'emerald', name: _t('翠晶'), color: '#00FF99', tag: _t('翠绿') },
                { id: 'white',   name: _t('白晶'), color: '#E8E8F0', tag: _t('白色') },
                { id: 'dark',    name: _t('暗晶'), color: '#1a1a2e', tag: _t('黑色') },
                { id: 'cyan',    name: _t('青晶'), color: '#00CCDD', tag: _t('青色') },
                { id: 'orange',  name: _t('橙晶'), color: '#FF8800', tag: _t('橙色') },
                { id: 'silver',  name: _t('银晶'), color: '#BBBBCC', tag: _t('银色') },
                { id: 'legend',  name: _t('晶魄琉璃'), type: 'legend', colors: ["#00CED1", "#FFCC00", "#FF3344", "#ffffff"], tag: _t('传说') }
            ]
        };

        // 皮肤状态：存储每个英雄选中的皮肤ID（null=使用原色）
        let heroSkinOverrides = {};  // { heroKey: 'skinId' }
        let skinSelectedHero = null; // 皮肤窗口中当前选中的英雄

        // ===== 皮肤系统辅助函数 =====

        /**
         * 获取英雄当前生效的皮肤对象
         * @param {string} heroKey - 英雄键名
         * @returns {object|null} 皮肤对象，未选择则返回null（使用原色）
         */
        function getHeroSkin(heroKey) {
            const skinId = heroSkinOverrides[heroKey];
            if (!skinId) return null;
            const skins = SKIN_DEFS[heroKey];
            if (!skins) return null;
            return skins.find(s => s.id === skinId) || null;
        }

        /**
         * 获取英雄当前绘制主色（兼容旧版颜色值存档）
         * @param {string} heroKey - 英雄键名
         * @returns {string} 颜色字符串
         */
        function getHeroColor(heroKey) {
            const skin = getHeroSkin(heroKey);
            if (skin) {
                if (skin.type === 'legend' && skin.colors && skin.colors.length > 0) {
                    return skin.colors[0];
                }
                return skin.color || '#ffffff';
            }
            // 兼容旧存档：如果存的是颜色字符串，尝试匹配到default或保留原值
            const saved = heroSkinOverrides[heroKey];
            if (saved && saved.startsWith && saved.startsWith('#')) {
                return saved;
            }
            return HERO_DEFS[heroKey] ? HERO_DEFS[heroKey].color : '#ffffff';
        }

        /**
         * 将旧版颜色值存档迁移为皮肤ID
         */
        function migrateSkinOverrides() {
            for (const heroKey in heroSkinOverrides) {
                const val = heroSkinOverrides[heroKey];
                if (!val || typeof val !== 'string') continue;
                // 如果已经是ID则跳过
                if (!val.startsWith('#')) continue;
                const skins = SKIN_DEFS[heroKey];
                if (!skins) {
                    delete heroSkinOverrides[heroKey];
                    continue;
                }
                const matched = skins.find(s => s.color && s.color.toLowerCase() === val.toLowerCase());
                if (matched) {
                    heroSkinOverrides[heroKey] = matched.id;
                } else {
                    // 无法匹配则回退到default
                    heroSkinOverrides[heroKey] = 'default';
                }
            }
        }
