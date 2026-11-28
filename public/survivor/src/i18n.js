// ============================================================
// 文件: src/i18n.js
// 描述: 中/英文国际化系统（全局，必须最先加载）
// 机制:
//   - gameLang      : 当前语言 ('zh' 或 'en')，从 localStorage 读取，默认 'zh'
//   - I18N_DICT     : 全局 中→英 字典对象（各文件用 Object.assign(I18N_DICT, {...}) 追加词条）
//   - _t(cn)        : 翻译函数，英文模式且有词条时返回英文，否则返回中文原文
//   - applyStaticText() : 翻译 HTML 静态 [data-i18n] 元素的文本
//   - applyStaticPlaceholders() : 翻译 [data-i18n-ph] 的 placeholder
//   - setGameLang(lang) : 切换语言并持久化，然后刷新页面让全部文字以新语言重渲染
// ============================================================

// 当前语言：从 localStorage 读取，默认中文
let gameLang = 'zh';
try { gameLang = (localStorage.getItem('gameLang') === 'en') ? 'en' : 'zh'; } catch (e) {}
// 英文模式给 body 加标识类，便于 CSS 微调英文文字大小/字距，避免重叠
if (gameLang === 'en') { document.documentElement.classList.add('lang-en'); }

// 全局中→英字典对象（各文件通过 Object.assign(I18N_DICT, {...}) 追加自己的词条）
const I18N_DICT = {};

// 以下为 index.html 静态 UI 词条（data-i18n 属性值即中文原文）
Object.assign(I18N_DICT, {
    '最大生命': 'Max HP',
    '普通攻击': 'Basic Attack',
    '暴击率': 'Crit Rate',
    '暴击伤害': 'Crit Damage',
    '伤害增加': 'Damage Bonus',
    '伤害减免': 'Damage Reduction',
    '操作键位': 'Controls',
    'WASD移动': 'WASD Move',
    '0普攻 1/2/3技能': '0 Basic Atk | 1/2/3 Skills',
    '已暂停': 'Paused',
    '🎨 皮肤': '🎨 Skin',
    '🖼️ 背景': '🖼️ Background',
    '🎵 音乐': '🎵 Music',
    '🌐 语言': '🌐 Language',
    '← 上一步': '← Back',
    '下一步': 'Next',
    '选择模式': 'Select Mode',
    '🔧 附加模块': '🔧 Extra Modules',
    '选择奖励': 'Choose Reward',
    '🏪 商店': '🏪 Shop',
    '关闭商店': 'Close Shop',
    '🏺 选择一件神器': '🏺 Choose an Artifact',
    '选择一件神器带入本局战斗（都是机制级改变，而非数值增强）': 'Choose one artifact to bring into this battle (mechanic-level changes, not numeric boosts)',
    '游戏结束': 'Game Over',
    '重新开始': 'Restart',
    '复活': 'Revive',
    '🎨 皮肤选择': '🎨 Skin Select',
    '✕ 关闭': '✕ Close',
    '✓ 确认保存': '✓ Save',
    '🎵 音乐设置': '🎵 Music Settings',
    '非战斗': 'Non-Battle',
    '战斗': 'Battle',
    '🎧 版权说明': '🎧 Copyright Notice',
    '🎧 版权与致谢': '🎧 Copyright & Credits',
    '🙏 致谢每一位作者': '🙏 Thanks to Every Author',
    '以下曲目均为 CC0 公有领域作品，署名仅为礼貌性致谢，非强制要求。点击作者名可跳转到 OpenGameArt 原页。': 'All tracks below are CC0 public-domain works; attribution is a courtesy, not a requirement. Click an author to open the original OpenGameArt page.',
    '🌐 语言设置': '🌐 Language Settings',
    '波次: ': 'Wave: ',
    ' | 曹操数: ': ' | Enemies: ',
    ' | 击杀: ': ' | Kills: ',
    '血量: ': ' HP: ',
    '连击 ': 'Combo ',
    '最高波次: ': 'Highest Wave: ',
    '总击杀: ': 'Total Kills: ',
    '英雄之战': 'Heroes of War',
    '暗夜星辰': 'Dark Night Star',
    '英雄属性': 'Hero Stats',
    '一技能伤害': 'Skill 1 DMG',
    '二技能伤害': 'Skill 2 DMG',
    '三技能伤害': 'Skill 3 DMG',
    '一技能': 'Skill 1',
    '二技能': 'Skill 2',
    '三技能': 'Skill 3',
    '继续游戏': 'Resume',
    '设 置': 'Settings',
    '返回主菜单': 'Main Menu',
    '或按空格键继续': 'or press Space to continue',
    '普攻': 'Basic Atk',
    '选择英雄': 'Select Hero',
    '选择难度': 'Select Difficulty',
    '独立难度 · 全精英怪 · 每波额外Boss': 'Standalone · All elites · Extra Boss each wave',
    '血量×5 · 天罚雷电/疯狂弥漫/猩红疯狂每波切换': 'HP ×5 · Divine Lightning/Madness Haze/Crimson each wave',
    '血量×3 · 雷电/诅咒/疯狂天气每波切换': 'HP ×3 · Lightning/Curse/Madness weather each wave',
    '播放模式：': 'Play Mode: ',
    '素材均按 CC0 协议筛选下载，已核对来源许可证；如对某首曲目仍有疑虑，可随时在设置中替换或移除，以确保零争端。': 'All assets were filtered by CC0 license and their source licenses verified; if you have any doubt about a track, replace or remove it anytime in settings for zero disputes.',
    '本游戏内所有音乐均下载自 OpenGameArt 等免费开源素材平台，并采用 CC0 1.0 通用公有领域奉献协议（Creative Commons Zero 1.0 Universal）授权，可自由用于任何用途，无需署名、无须授权。尽管如此，我们仍致谢每一位作者的贡献。': 'All in-game music is from free open-source asset platforms such as OpenGameArt and is licensed under the CC0 1.0 Universal Public Domain Dedication, so it may be used freely for any purpose without attribution or permission. Nonetheless, we would like to thank every author for their contributions.',
    '以下曲目均为 CC0 公有领域作品，署名以致谢作者。点击作者名可跳转到 OpenGameArt 原页。': 'All tracks below are CC0 public-domain works; attribution is used here to credit and thank the authors. Click an author to open the original OpenGameArt page.'
});

// 翻译函数：英文模式且有对应词条时返回英文，否则返回原文
function _t(cn) {
    if (gameLang === 'en' && I18N_DICT[cn]) return I18N_DICT[cn];
    return cn;
}

// 翻译 HTML 静态文字（data-i18n 属性值即中文原文）
// 使用 innerHTML：允许个别词条包含 <b> 等内联标签（如音乐版权说明），
// 所有 data-i18n 元素均为叶子节点，用 innerHTML 等价于 textContent，安全无损。
function applyStaticText() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
        const key = el.getAttribute('data-i18n');
        el.innerHTML = (gameLang === 'en' && I18N_DICT[key]) ? I18N_DICT[key] : key;
    });
}

// 翻译 placeholder 类静态文字
function applyStaticPlaceholders() {
    document.querySelectorAll('[data-i18n-ph]').forEach((el) => {
        const key = el.getAttribute('data-i18n-ph');
        el.placeholder = (gameLang === 'en' && I18N_DICT[key]) ? I18N_DICT[key] : key;
    });
}

// 切换语言：持久化后刷新页面，让所有动态文字以新语言重渲染
function setGameLang(lang) {
    gameLang = (lang === 'en') ? 'en' : 'zh';
    try { localStorage.setItem('gameLang', gameLang); } catch (e) {}
    // 刷新页面，全部文字（静态+动态）在新语言下重新初始化
    location.reload();
}

// ===== 语言设置窗口 UI =====
function openLangScreen() {
    const win = document.getElementById('langScreen');
    if (win) { win.style.display = 'flex'; updateLangOptionActive(); }
}
function closeLangScreen() {
    const win = document.getElementById('langScreen');
    if (win) win.style.display = 'none';
}
// 高亮当前语言选项
function updateLangOptionActive() {
    document.querySelectorAll('.lang-option').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.lang === gameLang);
    });
}

// 绑定语言窗口事件（脚本在 body 底部加载，DOM 元素已存在）
document.getElementById('langBtn') && document.getElementById('langBtn').addEventListener('click', openLangScreen);
document.getElementById('langCloseBtn') && document.getElementById('langCloseBtn').addEventListener('click', closeLangScreen);
document.querySelectorAll('.lang-option').forEach((btn) => {
    btn.addEventListener('click', () => setGameLang(btn.dataset.lang));
});

// DOM 就绪时应用静态文字翻译（动态文字在各文件渲染时用 _t()）
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { applyStaticText(); applyStaticPlaceholders(); });
} else {
    applyStaticText();
    applyStaticPlaceholders();
}