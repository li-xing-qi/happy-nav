// ============================================================
// 文件: src/music.js
// 描述: 音乐系统（非战斗/战斗 双环境，循环/随机 双模式，Action Chiptunes 专属难度选曲）
// 说明:
//   - 非战斗环境: 播放 music/非战斗背景音乐 下的音乐
//   - 战斗环境:   播放 music/战斗 下的音乐（Action Chiptunes 文件夹视为一个整体，按难度选曲）
//   - 循环模式:   单曲循环；随机模式: 播完一首随机切下一首（所有文件权重相同）
//   - 空格暂停时音乐暂停，解除暂停后从当前位置继续（不重新开始）
// ============================================================

// ===== 中/英文国际化词条 =====
Object.assign(I18N_DICT, {
    '循环播放': 'Loop',
    '随机播放': 'Shuffle',
    '（按难度）': ' (by difficulty)',
    '🔊 音量': '🔊 Volume'
});

// ===== 音乐路径常量 =====
const MUSIC_BASE = 'music/';                          // 相对路径（相对 index.html），兼容 GitHub Pages 子路径部署

// 非战斗音乐文件列表（相对 music/ 的路径）
const NON_BATTLE_MUSIC = [
    '非战斗背景音乐/Mirror Lake.mp3',
    '非战斗背景音乐/awake10_megaWall.mp3',
    '非战斗背景音乐/awesomeness.wav',
    '非战斗背景音乐/the_field_of_dreams.mp3'
];

// 战斗音乐选项（5个，Action Chiptunes 文件夹作为一个整体）
const BATTLE_MUSIC_OPTIONS = [
    { type: 'folder', name: 'Action Chiptunes By Juhani Junkala', rel: '战斗/Action Chiptunes By Juhani Junkala' },
    { type: 'file',   name: 'battleThemeA.mp3',                  rel: '战斗/battleThemeA.mp3' },
    { type: 'file',   name: 'fight_for_better_future.wav',       rel: '战斗/fight_for_better_future.wav' },
    { type: 'file',   name: 'heavy_boss_battle_1_bpm200.mp3',    rel: '战斗/heavy_boss_battle_1_bpm200.mp3' },
    { type: 'file',   name: 'MonsterVania - Ghost Land.mp3',     rel: '战斗/MonsterVania - Ghost Land.mp3' }
];

// Action Chiptunes 文件夹内的3首（随机播放时全部纳入，权重相同）
const ACTION_CHIPTUNE_LEVELS = [
    'Juhani Junkala [Retro Game Music Pack] Level 1.wav',
    'Juhani Junkala [Retro Game Music Pack] Level 2.wav',
    'Juhani Junkala [Retro Game Music Pack] Level 3.wav'
];

// 战斗文件夹内所有音乐文件（随机播放使用，权重相同）
const BATTLE_ALL_FILES = [
    '战斗/Action Chiptunes By Juhani Junkala/Juhani Junkala [Retro Game Music Pack] Level 1.wav',
    '战斗/Action Chiptunes By Juhani Junkala/Juhani Junkala [Retro Game Music Pack] Level 2.wav',
    '战斗/Action Chiptunes By Juhani Junkala/Juhani Junkala [Retro Game Music Pack] Level 3.wav',
    '战斗/battleThemeA.mp3',
    '战斗/fight_for_better_future.wav',
    '战斗/heavy_boss_battle_1_bpm200.mp3',
    '战斗/MonsterVania - Ghost Land.mp3'
];

// ===== 音乐系统状态 =====
let musicMode = 'nonBattle';        // 当前音乐环境：'nonBattle'(非战斗) | 'battle'(战斗)
let musicNonBattleLoop = true;      // 非战斗：true=循环单曲, false=随机
let musicBattleLoop = true;         // 战斗：true=循环单曲, false=随机
let musicNonBattleIndex = 0;        // 非战斗当前选中音轨索引（默认0=Mirror Lake）
let musicBattleIndex = 0;           // 战斗当前选中选项索引（默认0=Action Chiptunes文件夹）
let musicCurrentAudio = null;       // 当前 Audio 元素
let musicCurrentRel = null;         // 当前实际播放的相对路径
let musicActiveTab = 'nonBattle';   // 音乐窗口当前激活的 tab
let musicVolume = 0.6;              // 当前音量（0~1），从 localStorage 读取，默认0.6
try {
    const savedVol = localStorage.getItem('musicVolume');
    if (savedVol !== null && !isNaN(parseFloat(savedVol))) {
        musicVolume = Math.max(0, Math.min(1, parseFloat(savedVol)));
    }
} catch (e) {}

// ===== 工具函数 =====

// 将相对路径转为可访问的 URL（处理空格与中文，需 URL 编码）
function musicUrl(rel) {
    return encodeURI(MUSIC_BASE + rel);
}

// 设置音量：实时调整当前音乐音量并持久化到 localStorage
function setMusicVolume(v) {
    v = Math.max(0, Math.min(1, Number(v) || 0));
    musicVolume = v;
    try { localStorage.setItem('musicVolume', String(v)); } catch (e) {}
    if (musicCurrentAudio) musicCurrentAudio.volume = v;
    const val = document.getElementById('musicVolumeValue');
    if (val) val.textContent = Math.round(v * 100) + '%';
}

// 根据当前难度决定 Action Chiptunes 播放第几首
//   简单/普通 → Level 1；困难/噩梦 → Level 2；终焉/诅咒之夜/疯狂之夜 → Level 3
function getActionChiptuneLevel() {
    const d = selectedDifficultyKey;
    if (d === 'easy' || d === 'normal') return 1;
    if (d === 'hard' || d === 'nightmare') return 2;
    // 终焉(end) / 诅咒之夜(curse) / 疯狂之夜(madness) 统一播放第3首 Level 3
    return 3;
}

// 战斗"循环模式"下实际应播放的文件（Action Chiptunes 文件夹按难度选曲）
function resolveBattleLoopRel() {
    const opt = BATTLE_MUSIC_OPTIONS[musicBattleIndex];
    if (opt.type === 'folder') {
        const lvl = getActionChiptuneLevel();
        return '战斗/Action Chiptunes By Juhani Junkala/Juhani Junkala [Retro Game Music Pack] Level ' + lvl + '.wav';
    }
    return opt.rel;
}

// 从列表中随机取一个（尽量不与 excludeRel 重复，避免连播同一首）
function randomFrom(list, excludeRel) {
    if (list.length <= 1) return list[0];
    let pick = list[Math.floor(Math.random() * list.length)];
    let guard = 0;
    while (pick === excludeRel && guard < 20) {
        pick = list[Math.floor(Math.random() * list.length)];
        guard++;
    }
    return pick;
}

// 根据当前环境/模式/选中项，计算应播放的实际文件相对路径
function resolveCurrentRel() {
    if (musicMode === 'nonBattle') {
        return musicNonBattleLoop
            ? NON_BATTLE_MUSIC[musicNonBattleIndex]
            : randomFrom(NON_BATTLE_MUSIC, musicCurrentRel);
    }
    return musicBattleLoop
        ? resolveBattleLoopRel()
        : randomFrom(BATTLE_ALL_FILES, musicCurrentRel);
}

// ===== 播放控制 =====

// 停止当前播放
function stopMusic() {
    if (musicCurrentAudio) {
        musicCurrentAudio.pause();
        musicCurrentAudio.src = '';
        musicCurrentAudio = null;
    }
    musicCurrentRel = null;
}

// 播放指定音乐（loop=true 循环单曲，false 播完随机下一首）
function playMusic(rel, loop) {
    stopMusic();
    musicCurrentRel = rel;
    musicCurrentAudio = new Audio(musicUrl(rel));
    musicCurrentAudio.loop = loop;
    musicCurrentAudio.volume = musicVolume;
    // 非循环（随机）模式：播完后自动随机下一首
    musicCurrentAudio.addEventListener('ended', () => {
        const curLoop = musicMode === 'nonBattle' ? musicNonBattleLoop : musicBattleLoop;
        if (!curLoop) {
            playMusic(resolveCurrentRel(), false);
        }
    });
    // 播放（可能被浏览器自动播放策略拦截，交由首次交互恢复）
    musicCurrentAudio.play().catch(() => { /* 等待用户手势 */ });
}

// 暂停当前音乐（保留播放位置，不重新开始）
function pauseMusic() {
    if (musicCurrentAudio && !musicCurrentAudio.paused) {
        musicCurrentAudio.pause();
    }
}

// 恢复当前音乐（从暂停位置继续；若无音频则按当前逻辑重新播放）
function resumeMusic() {
    if (!musicCurrentAudio) {
        const loop = musicMode === 'nonBattle' ? musicNonBattleLoop : musicBattleLoop;
        playMusic(resolveCurrentRel(), loop);
        return;
    }
    if (musicCurrentAudio.paused) {
        musicCurrentAudio.play().catch(() => { /* 等待用户手势 */ });
    }
}

// 切换音乐环境（非战斗 ↔ 战斗）；环境未变且正在播放则保持
function setMusicMode(mode) {
    if (mode === musicMode && musicCurrentAudio) return;
    musicMode = mode;
    const loop = mode === 'nonBattle' ? musicNonBattleLoop : musicBattleLoop;
    playMusic(resolveCurrentRel(), loop);
}

// 初始化音乐系统：默认非战斗环境，循环播放 Mirror Lake
function initMusic() {
    musicMode = 'nonBattle';
    musicNonBattleLoop = true;
    musicNonBattleIndex = 0;
    musicBattleLoop = true;
    musicBattleIndex = 0;
    musicActiveTab = 'nonBattle';
    // 尝试直接播放（可能被浏览器拦截，需等待首次交互）
    const loop = musicMode === 'nonBattle' ? musicNonBattleLoop : musicBattleLoop;
    playMusic(resolveCurrentRel(), loop);
    // 首次用户交互时若仍被拦截则恢复播放
    // 注意：游戏暂停（gamePaused=true）时不得恢复，否则会抵消空格暂停音乐的效果
    const tryResume = () => {
        if (musicCurrentAudio && musicCurrentAudio.paused && !gamePaused) {
            musicCurrentAudio.play().catch(() => {});
        }
    };
    const onPointer = () => { tryResume(); document.removeEventListener('pointerdown', onPointer); };
    const onKey = () => { tryResume(); document.removeEventListener('keydown', onKey); };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);

    // 页面切到后台/最小化/切走时暂停音乐，回到页面时恢复
    // 这样"关掉/切走游戏"后不会在后台继续响
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            pauseMusic();
        } else {
            // 回到页面时恢复；但若游戏处于空格暂停状态则保持静音
            if (typeof gamePaused === 'undefined' || !gamePaused) {
                resumeMusic();
            }
        }
    });
}

// ===== 音乐版权与作者致谢（CC0 公有领域，署名仅为礼貌性致谢，非强制） =====
const MUSIC_CREDITS = [
    { track: 'Mirror Lake',                 author: 'Joth',           url: 'https://opengameart.org/content/mirror-lake' },
    { track: 'Awake Megawall 10',           author: 'cynicmusic',     url: 'https://opengameart.org/content/awake-megawall-10' },
    { track: 'Menu Music',                  author: 'mrpoly',         url: 'https://opengameart.org/content/menu-music' },
    { track: 'The Field Of Dreams',         author: 'pauliuw',        url: 'https://opengameart.org/content/the-field-of-dreams' },
    { track: 'Action Chiptunes',            author: 'Juhani Junkala', url: 'https://opengameart.org/content/5-chiptunes-action' },
    { track: 'Battle Theme A',              author: 'cynicmusic',     url: 'https://opengameart.org/content/battle-theme-a' },
    { track: 'Fight for Better Future',     author: 'nene',           url: 'https://opengameart.org/content/fight-for-better-future-rockmetal' },
    { track: 'Heavy Boss Battle 1',         author: 'MintoDog',       url: 'https://opengameart.org/content/heavy-boss-battle-1' },
    { track: 'MonsterVania - Ghost Land',   author: 'HydroGene',      url: 'https://opengameart.org/content/monstervania-ghost-land' }
];

// ===== 音乐窗口 UI =====

// 打开音乐设置窗口
function openMusicScreen() {
    document.getElementById('musicScreen').style.display = 'flex';
    renderMusicUI();
}

// 关闭音乐设置窗口
function closeMusicScreen() {
    document.getElementById('musicScreen').style.display = 'none';
}

// 打开版权与致谢小窗口
function openMusicCreditScreen() {
    renderMusicCredits();
    document.getElementById('musicCreditScreen').style.display = 'flex';
}

// 关闭版权与致谢小窗口
function closeMusicCreditScreen() {
    document.getElementById('musicCreditScreen').style.display = 'none';
}

// 渲染致谢列表（曲目 + 作者 + OpenGameArt 链接，两行式）
function renderMusicCredits() {
    const list = document.getElementById('musicCreditList');
    if (!list) return;
    list.innerHTML = MUSIC_CREDITS.map(function(c) {
        return '<div class="music-credit-item">' +
            '<div><span class="track">🎵 ' + c.track + '</span> — ' +
            '<span class="author">' + c.author + '</span></div>' +
            '<div><a href="' + c.url + '" target="_blank" rel="noopener">OpenGameArt ↗</a></div>' +
            '</div>';
    }).join('');
}

// 切换窗口 tab（非战斗/战斗）
function onMusicTabClick(tab) {
    musicActiveTab = tab;
    renderMusicUI();
}

// 点击列表中的某个音乐
function onMusicItemClick(tab, index) {
    if (tab === 'nonBattle') {
        musicNonBattleIndex = index;
        musicNonBattleLoop = true;   // 点击具体歌曲切换到该曲循环
        if (musicMode === 'nonBattle') {
            playMusic(NON_BATTLE_MUSIC[index], true);
        }
    } else {
        musicBattleIndex = index;
        musicBattleLoop = true;
        if (musicMode === 'battle') {
            playMusic(resolveBattleLoopRel(), true);
        }
    }
    renderMusicUI();
}

// 切换播放模式（循环播放 ↔ 随机播放）
function onModeSwitch() {
    if (musicActiveTab === 'nonBattle') {
        musicNonBattleLoop = !musicNonBattleLoop;
        if (musicMode === 'nonBattle') {
            if (musicNonBattleLoop) playMusic(NON_BATTLE_MUSIC[musicNonBattleIndex], true);
            else playMusic(randomFrom(NON_BATTLE_MUSIC, musicCurrentRel), false);
        }
    } else {
        musicBattleLoop = !musicBattleLoop;
        if (musicMode === 'battle') {
            if (musicBattleLoop) playMusic(resolveBattleLoopRel(), true);
            else playMusic(randomFrom(BATTLE_ALL_FILES, musicCurrentRel), false);
        }
    }
    renderMusicUI();
}

// HTML 转义，防止文件名中的特殊字符破坏结构
function musicEscape(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// 生成单个音乐列表项（使用 button 保证可访问性）
function makeMusicItem(tab, index, name, icon, selected, tag) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'music-item' + (selected ? ' selected' : '');
    btn.dataset.tab = tab;
    btn.dataset.index = index;
    btn.innerHTML =
        '<span class="music-item-icon" aria-hidden="true">' + icon + '</span>' +
        '<span class="music-item-name">' + musicEscape(name) + '</span>' +
        (tag ? '<span class="music-item-tag">' + musicEscape(tag) + '</span>' : '');
    return btn;
}

// 渲染音乐窗口内容（tab 高亮 + 列表 + 模式开关）
function renderMusicUI() {
    // 更新 tab 高亮
    document.querySelectorAll('.music-tab').forEach(function(t) {
        t.classList.toggle('active', t.dataset.musicTab === musicActiveTab);
    });

    // 渲染列表
    const list = document.getElementById('musicList');
    list.innerHTML = '';
    if (musicActiveTab === 'nonBattle') {
        NON_BATTLE_MUSIC.forEach(function(rel, i) {
            const selected = musicNonBattleLoop && i === musicNonBattleIndex;
            const name = rel.split('/').pop();  // 只显示文件名
            list.appendChild(makeMusicItem('nonBattle', i, name, '🎶', selected, ''));
        });
    } else {
        BATTLE_MUSIC_OPTIONS.forEach(function(opt, i) {
            const selected = musicBattleLoop && i === musicBattleIndex;
            let icon = '🎶', tag = '';
            if (opt.type === 'folder') {
                icon = '📁';
                tag = 'Lv.' + getActionChiptuneLevel() + _t('（按难度）');
            }
            list.appendChild(makeMusicItem('battle', i, opt.name, icon, selected, tag));
        });
    }

    // 更新模式开关文字
    const loop = musicActiveTab === 'nonBattle' ? musicNonBattleLoop : musicBattleLoop;
    const val = document.getElementById('musicModeValue');
    if (val) val.textContent = loop ? _t('循环播放') : _t('随机播放');

    // 同步音量滑块与百分比显示
    const slider = document.getElementById('musicVolumeSlider');
    if (slider) slider.value = musicVolume;
    const vv = document.getElementById('musicVolumeValue');
    if (vv) vv.textContent = Math.round(musicVolume * 100) + '%';
}

// ===== UI 事件绑定（脚本位于 body 末尾，DOM 已就绪） =====
document.getElementById('musicBtn') && document.getElementById('musicBtn').addEventListener('click', openMusicScreen);
document.getElementById('musicCloseBtn') && document.getElementById('musicCloseBtn').addEventListener('click', closeMusicScreen);
document.getElementById('musicCreditBtn') && document.getElementById('musicCreditBtn').addEventListener('click', openMusicCreditScreen);
document.getElementById('musicCreditCloseBtn') && document.getElementById('musicCreditCloseBtn').addEventListener('click', closeMusicCreditScreen);
document.getElementById('musicModeSwitch') && document.getElementById('musicModeSwitch').addEventListener('click', onModeSwitch);
document.getElementById('musicVolumeSlider') && document.getElementById('musicVolumeSlider').addEventListener('input', function(e) {
    setMusicVolume(parseFloat(e.target.value));
});
document.querySelectorAll('.music-tab').forEach(function(tab) {
    tab.addEventListener('click', function() { onMusicTabClick(tab.dataset.musicTab); });
});
document.getElementById('musicList') && document.getElementById('musicList').addEventListener('click', function(e) {
    const item = e.target.closest('.music-item');
    if (!item) return;
    onMusicItemClick(item.dataset.tab, parseInt(item.dataset.index, 10));
});