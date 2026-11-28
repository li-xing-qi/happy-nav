// ============================================================
// 文件: src/wave.js
// 描述: spawnWave + 波次逻辑
// 行范围: 13427-13823 (原 game.js)
// 注意: 本文件由原版 HTML 抽取，保持原作用域不变
// ============================================================

// ===== 中/英文国际化词条（追加到全局 I18N_DICT） =====
Object.assign(I18N_DICT, {
    '属性': ' Stats',
    '伤害': ' Damage',
});

        function spawnWave() {
            // 诅咒之夜：每波切换一次专属天气（雷电/诅咒/疯狂）
            if (curseNightMode) {
                switchCursedWeather();
            }
            // 疯狂之夜：每波切换一次专属天气（天罚雷电/疯狂弥漫/猩红疯狂）
            if (madnessNightMode) {
                switchMadnessWeather();
            }

            enemies = [];
            abyssLords = [];
            bladeMasters = [];
            madEyes = [];
            youBosses = [];
            jieBosses = [];           // 劫Boss实例数组（终焉+难度压轴，随波次重置）
            emperorParticles = []; emperorRings = []; emperorDeathEffects = [];
            abyssParticles = []; abyssRings = []; abyssDeathEffects = [];
            bladeParticles = []; bladeRings = [];
            eyeParticles = []; eyeRings = [];
            youParticles = []; youRings = []; youLasers = [];
            bossRefs = [];
            waveTimer = 120;
            hero.invincibleTime = 60;
            bossAlive = false;
            bossUpgradeTriggered = false; // 重置防重复：新一波重新允许推 wave
            bossDeathFxTriggered = false; // 重置死亡特效标志：新一波重新允许触发 triggerSlowMo
            showingBuff = false; // 重置肉鸽选择界面
            bossDeathDelay = 0; // 重置 boss 死亡延迟

            // ===== Boss波次体系（新顺序） =====
            // 5=王, 10=帝君, 15=冥渊, 20=剑圣, 25=妄瞳, 30=幽, 35=劫(终焉+),
            // 40+每5波=50%随机任意单Boss，50%双Boss（各50%血量）
            if (wave === 5) {
                const bx = MAP_WIDTH / 2 - 200;
                const by = MAP_HEIGHT / 2;
                const boss = new Enemy(bx, by, 'boss');
                enemies.push(boss);
                bossRefs.push(boss);
                bossAlive = true;
                const minions = Math.min(3, Math.floor(wave / 5));
                for (let i = 0; i < minions; i++) {
                    enemies.push(new Enemy(80 + i * 60, 150 + Math.random() * (MAP_HEIGHT - 300), (curseNightMode || madnessNightMode) ? 'elite' : 'normal'));
                }
                // 诅咒之夜：Boss波次也额外生成Boss
                spawnCursedNightExtraBosses();
                return;
            }
            if (wave === 10) {
                spawnBossToWorld('emperor', 2);
                spawnCursedNightExtraBosses();
                return;
            }
            if (wave === 15) {
                spawnBossToWorld('abyss', 2);
                spawnCursedNightExtraBosses();
                return;
            }
            if (wave === 20) {
                spawnBossToWorld('blademaster', 1);
                spawnCursedNightExtraBosses();
                return;
            }
            if (wave === 25) {
                spawnBossToWorld('madeye', 1);
                spawnCursedNightExtraBosses();
                return;
            }
            if (wave === 30) {
                spawnBossToWorld('you', 1);
                spawnCursedNightExtraBosses();
                return;
            }
            // ===== 第35波：压轴Boss"劫"（仅终焉及以上难度出现，压在幽之后） =====
            // 巨物半径600，中心被边界约束在地图内，置于地图中心
            if (wave === 35 &&
                (currentDifficulty === DIFFICULTY_CONFIG.end || curseNightMode || madnessNightMode)) {
                const jie = new JieBoss(MAP_WIDTH / 2, MAP_HEIGHT / 2);
                enemies.push(jie);
                jieBosses.push(jie);
                bossRefs.push(jie);
                bossAlive = true;
                ensureHeroOutsideJie(jie);   // 角色刷新不得落在劫体内
                spawnCursedNightExtraBosses();
                return;
            }
            if (wave >= 35 && wave % 5 === 0) {
                const roll = Math.random();
                if (roll < 0.5) {
                    const pool = ['king', 'emperor', 'abyss', 'blademaster', 'madeye', 'you'];
                    if (currentDifficulty === DIFFICULTY_CONFIG.end || curseNightMode || madnessNightMode) pool.push('jie');
                    const pick = pool[Math.floor(Math.random() * pool.length)];
                    if (pick === 'king') {
                        const boss = new Enemy(MAP_WIDTH/2 - 200, MAP_HEIGHT/2, 'boss');
                        enemies.push(boss); bossRefs.push(boss);
                        bossAlive = true;
                        const minions = Math.min(2, Math.floor(wave / 10));
                        for (let i = 0; i < minions; i++) {
                            enemies.push(new Enemy(80 + i * 60, 150 + Math.random() * (MAP_HEIGHT - 300), (curseNightMode || madnessNightMode) ? 'elite' : 'normal'));
                        }
                    } else if (pick === 'emperor') {
                        spawnBossToWorld('emperor', 2);
                    } else if (pick === 'abyss') {
                        spawnBossToWorld('abyss', 2);
                    } else if (pick === 'blademaster') {
                        spawnBossToWorld('blademaster', 1);
                    } else if (pick === 'madeye') {
                        spawnBossToWorld('madeye', 1);
                    } else if (pick === 'you') {
                        spawnBossToWorld('you', 1);
                    } else if (pick === 'jie') {
                        spawnJieBoss(MAP_WIDTH/2, MAP_HEIGHT/2);
                    }
                } else {
                    const pool = ['king', 'emperor', 'abyss', 'blademaster', 'madeye', 'you'];
                    if (currentDifficulty === DIFFICULTY_CONFIG.end || curseNightMode || madnessNightMode) pool.push('jie');
                    const shuffled = pool.slice().sort(() => Math.random() - 0.5);
                    // 取 shuffled[0] 后从剩余中取 shuffled[1]，确保双 boss 不同
                    const picks = [shuffled[0], shuffled[1]];
                    const offsets = [{x: -350, y: 0}, {x: 350, y: 0}];
                    for (let i = 0; i < 2; i++) {
                        const k = picks[i];
                        const px = MAP_WIDTH/2 + offsets[i].x;
                        const py = MAP_HEIGHT/2 + offsets[i].y;
                        let b;
                        if (k === 'king') {
                            b = new Enemy(px, py, 'boss');
                            enemies.push(b);
                        } else if (k === 'emperor') {
                            b = new Enemy(px, py, 'emperor', 2);
                            enemies.push(b);
                        } else if (k === 'abyss') {
                            b = new AbyssLord(px, py, 2);
                            enemies.push(b); abyssLords.push(b);
                        } else if (k === 'blademaster') {
                            b = new BladeMaster(px, py);
                            enemies.push(b); bladeMasters.push(b);
                        } else if (k === 'madeye') {
                            b = new MadEye(px, py);
                            enemies.push(b); madEyes.push(b);
                        } else if (k === 'you') {
                            b = new YouBoss(px, py);
                            enemies.push(b); youBosses.push(b);
                        } else if (k === 'jie') {
                            b = spawnJieBoss(px, py);
                        }
                        // 双Boss同时出现：各50%HP；疯狂之夜下保持500%血量不减半
                        if (!madnessNightMode) {
                            b.hp = b.maxHp = Math.floor(b.maxHp * 0.5);
                        }
                        bossRefs.push(b);
                    }
                    bossAlive = true;
                    const minions = Math.min(2, Math.floor(wave / 10));
                    for (let i = 0; i < minions; i++) {
                        enemies.push(new Enemy(80 + i * 60, 150 + Math.random() * (MAP_HEIGHT - 300), (curseNightMode || madnessNightMode) ? 'elite' : 'normal'));
                    }
                }
                // 诅咒之夜：Boss波次也额外生成Boss
                spawnCursedNightExtraBosses();
                return;
            }

            // ===== 普通波次（精英替换普通怪出现，怪总数不变；boss是新增不影响小怪刷新） =====
            // 精英生成规则由当前难度配置决定（getEliteRule返回-1=固定1个, 0~1=每个小怪按概率替换）
            const eliteRule = getEliteRule(wave);
            let fixedEliteSpawned = false;  // 用于"-1"规则：固定1个精英（只替换第1个位置）
            for (let i = 0; i < enemyCount; i++) {
                let x, y, tries = 0;
                do {
                    x = 80 + Math.random() * (MAP_WIDTH - 160);
                    y = 80 + Math.random() * (MAP_HEIGHT - 160);
                    tries++;
                } while (tries < 10 && Math.hypot(x - hero.x, y - hero.y) < 280);
                let type = 'normal';
                // ===== 诅咒之夜/疯狂之夜：所有小怪强制替换成精英 =====
                if (curseNightMode || madnessNightMode) {
                    type = 'elite';
                } else {
                    // ===== 精英替换逻辑（以困难模式为基准） =====
                    if (eliteRule === -1) {
                        // 固定1个精英：替换第1个普通怪位置
                        if (!fixedEliteSpawned) {
                            type = 'elite';
                            fixedEliteSpawned = true;
                        }
                    } else if (eliteRule > 0 && Math.random() < eliteRule) {
                        // 按概率替换为精英
                        type = 'elite';
                    }
                    // 弓箭手保留：精英未替换时，20%概率变弓箭手
                    if (type === 'normal' && wave >= 5 && Math.random() < 0.2) {
                        type = 'archer';
                    }
                }
                enemies.push(new Enemy(x, y, type));
            }

            // ===== 诅咒之夜：每波额外随机Boss（1-10波1个，11+波2个不同Boss） =====
            spawnCursedNightExtraBosses();
        }

        // ===== 诅咒之夜/疯狂之夜：每波额外随机Boss（1-10波1个，11+波2个不同Boss） =====
        // 疯狂之夜额外多1个随机Boss（1-10波2个，11+波3个），所有Boss保持500%血量不减半
        function spawnCursedNightExtraBosses() {
            if (!curseNightMode && !madnessNightMode) return;
            let extraCount = (wave >= 11) ? 2 : 1;
            // 疯狂之夜：每波额外+1个随机Boss
            if (madnessNightMode) extraCount += 1;
            // 前10波不出现压轴"劫"：11波之后按正常随机池（含劫）
            const pool = (wave <= 10)
                ? ['king', 'emperor', 'abyss', 'blademaster', 'madeye', 'you']
                : ['king', 'emperor', 'abyss', 'blademaster', 'madeye', 'you', 'jie'];
            const picks = [];
            while (picks.length < extraCount) {
                const pick = pool[Math.floor(Math.random() * pool.length)];
                if (!picks.includes(pick)) picks.push(pick);
            }
            for (const kind of picks) {
                const b = spawnCursedBoss(kind);
                if (b) {
                    enemies.push(b);
                    bossRefs.push(b);
                    if (kind === 'abyss') abyssLords.push(b);
                    else if (kind === 'blademaster') bladeMasters.push(b);
                    else if (kind === 'madeye') madEyes.push(b);
                    else if (kind === 'you') youBosses.push(b);
                    else if (kind === 'jie') jieBosses.push(b);
                }
            }
            if (bossRefs.length > 0) bossAlive = true;
        }

        // ===== 诅咒之夜：在英雄周围远处生成单个Boss =====
        function spawnCursedBoss(kind) {
            // 位置：英雄周围 500~900px 远处，随机角度
            const angle = Math.random() * Math.PI * 2;
            const dist = 500 + Math.random() * 400;
            let bx = hero.x + Math.cos(angle) * dist;
            let by = hero.y + Math.sin(angle) * dist;
            // 限制在地图边界内（留 60px 边距）
            bx = Math.max(60, Math.min(MAP_WIDTH - 60, bx));
            by = Math.max(60, Math.min(MAP_HEIGHT - 60, by));

            if (kind === 'king') {
                return new Enemy(bx, by, 'boss');
            } else if (kind === 'emperor') {
                return new Enemy(bx, by, 'emperor', 1);
            } else if (kind === 'abyss') {
                return new AbyssLord(bx, by, 1);
            } else if (kind === 'blademaster') {
                return new BladeMaster(bx, by);
            } else if (kind === 'madeye') {
                return new MadEye(bx, by);
            } else if (kind === 'you') {
                return new YouBoss(bx, by);
            } else if (kind === 'jie') {
                // 劫的中心被边界约束在地图内，直接就近取合法位置
                const cfg = BOSS_CONFIG.jieBoss;
                const cx = Math.max(cfg.minX, Math.min(cfg.maxX, bx));
                const cy = Math.max(cfg.minY, Math.min(cfg.maxY, by));
                return new JieBoss(cx, cy);
            }
            return null;
        }

        // ===== 新增：生成单个Boss到世界 =====
        function spawnBossToWorld(kind, level) {
            const bx = MAP_WIDTH / 2 - 200;
            const by = MAP_HEIGHT / 2;
            if (kind === 'emperor') {
                const boss = new Enemy(bx, by, 'emperor', level);
                enemies.push(boss);
                bossRefs.push(boss);
            } else if (kind === 'abyss') {
                const boss = new AbyssLord(bx, by, level);
                enemies.push(boss);
                abyssLords.push(boss);
                bossRefs.push(boss);
            } else if (kind === 'blademaster') {
                const boss = new BladeMaster(bx, by);
                enemies.push(boss);
                bladeMasters.push(boss);
                bossRefs.push(boss);
            } else if (kind === 'madeye') {
                const boss = new MadEye(bx, by);
                enemies.push(boss);
                madEyes.push(boss);
                bossRefs.push(boss);
            } else if (kind === 'you') {
                const boss = new YouBoss(bx, by);
                enemies.push(boss);
                youBosses.push(boss);
                bossRefs.push(boss);
            } else if (kind === 'jie') {
                // 劫的中心须落在边界约束内，直接就近取合法位置生成
                const cfg = BOSS_CONFIG.jieBoss;
                const cx = Math.max(cfg.minX, Math.min(cfg.maxX, bx));
                const cy = Math.max(cfg.minY, Math.min(cfg.maxY, by));
                const boss = new JieBoss(cx, cy);
                enemies.push(boss);
                jieBosses.push(boss);
                bossRefs.push(boss);
            }
            bossAlive = true;
            const minions = Math.min(3, Math.floor(wave / 5));
            for (let i = 0; i < minions; i++) {
                enemies.push(new Enemy(80 + i * 60, 150 + Math.random() * (MAP_HEIGHT - 300), 'normal'));
            }
        }

        // ===== 新增：生成"劫"Boss到世界（随机Boss池复用） =====
        // 巨物半径600，中心被边界约束在地图内；归一化注册到 enemies/jieBosses/bossRefs
        function spawnJieBoss(x, y) {
            // 位置须落在劫的边界约束内（中心 [600,3400]×[600,2480]），否则初始化后会被拉回
            const cfg = BOSS_CONFIG.jieBoss;
            const cx = Math.max(cfg.minX, Math.min(cfg.maxX, x));
            const cy = Math.max(cfg.minY, Math.min(cfg.maxY, y));
            const boss = new JieBoss(cx, cy);
            enemies.push(boss);
            jieBosses.push(boss);
            bossRefs.push(boss);
            bossAlive = true;
            ensureHeroOutsideJie(boss);   // 角色刷新不得落在劫体内
            return boss;
        }

        // ===== 确保英雄不在劫体内：若英雄恰好落入劫的领域，就近挪到半径外安全点 =====
        function ensureHeroOutsideJie(jie) {
            if (!hero || !jie) return;
            const d = Math.hypot(hero.x - jie.x, hero.y - jie.y);
            const safe = jie.radius + 60;
            if (d < safe) {
                let nx, ny;
                if (d > 0.001) {
                    // 沿当前偏移方向推到安全距离（越界则由后续clamp兜底）
                    nx = jie.x + ((hero.x - jie.x) / d) * safe;
                    ny = jie.y + ((hero.y - jie.y) / d) * safe;
                } else {
                    // 完全在劫中心：推到正上方安全点
                    nx = jie.x;
                    ny = jie.y - safe;
                }
                hero.x = Math.max(80, Math.min(MAP_WIDTH - 80, nx));
                hero.y = Math.max(80, Math.min(MAP_HEIGHT - 100, ny));
            }
        }
        
        function updateStatsDisplay() {
            const hd = HERO_DEFS[currentHero];
            // 动态英雄标题与技能名
            document.getElementById('statHeroTitle').textContent = hd.name + _t('属性');
            // 使用 skillStats 配置显示契合的标签和值（如吸血/范围/链数等）
            if (hd.skillStats && hd.skillStats.length === 3) {
                document.getElementById('stat-s1-label').textContent = hd.skillStats[0].label;
                document.getElementById('stat-s2-label').textContent = hd.skillStats[1].label;
                document.getElementById('stat-s3-label').textContent = hd.skillStats[2].label;
                document.getElementById('stat-s1').textContent = hd.skillStats[0].getValue();
                document.getElementById('stat-s2').textContent = hd.skillStats[1].getValue();
                document.getElementById('stat-s3').textContent = hd.skillStats[2].getValue();
            } else {
                document.getElementById('stat-s1-label').textContent = hd.skills[0].name + _t('伤害');
                document.getElementById('stat-s2-label').textContent = hd.skills[1].name + _t('伤害');
                document.getElementById('stat-s3-label').textContent = hd.skills[2].name + _t('伤害');
                document.getElementById('stat-s1').textContent = stats.skill1;
                document.getElementById('stat-s2').textContent = stats.skill2;
                document.getElementById('stat-s3').textContent = stats.skill3;
            }
            document.getElementById('btn1Name').textContent = hd.skills[0].name;
            document.getElementById('btn2Name').textContent = hd.skills[1].name;
            document.getElementById('btn3Name').textContent = hd.skills[2].name;
            // 技能按钮颜色随英雄主题色
            for (let i = 1; i <= 3; i++) {
                const btn = document.getElementById('btn' + i);
                if (btn) {
                    btn.style.borderColor = hd.color;
                    const hex = hd.color.replace('#','');
                    const r = parseInt(hex.substr(0,2),16);
                    const g = parseInt(hex.substr(2,2),16);
                    const b = parseInt(hex.substr(4,2),16);
                    btn.style.background = `rgba(${r},${g},${b},0.2)`;
                }
            }
            document.getElementById('stat-hp').textContent = stats.hp;
            document.getElementById('stat-attack').textContent = stats.attack;
            document.getElementById('stat-crit').textContent = Math.floor(critRate * 100) + '%';
            document.getElementById('stat-critdmg').textContent = Math.floor(critDmgMult * 100) + '%';
            document.getElementById('stat-dmgbonus').textContent = Math.floor(heroDamageBonus * 100) + '%';
            document.getElementById('stat-dmgreduction').textContent = Math.floor(heroDamageReduction * 100) + '%';
            document.getElementById('hp').textContent = Math.max(0, Math.floor(hero?.hp || 0));
            document.getElementById('maxHp').textContent = stats.hp;
            if (HERO_DEFS[currentHero]) {
                document.getElementById('heroName').textContent = _t(HERO_DEFS[currentHero].name);
            }
            // 防御性：所有 DOM 操作先检查元素是否存在
            const waveNumEl = document.getElementById('waveNum');
            if (waveNumEl) waveNumEl.textContent = wave;
            const enemyCountEl = document.getElementById('enemyCount');
            if (enemyCountEl) enemyCountEl.textContent = enemyCount;
            const killsEl = document.getElementById('kills');
            if (killsEl) killsEl.textContent = totalKills;

            for (let i = 0; i < 4; i++) {
                const cdEl = document.getElementById('cd' + i);
                if (!cdEl) continue; // 防御性：元素不存在时跳过
                if (i > 0 && skillCooldown[i] > 0) {
                    cdEl.style.display = 'block';
                    cdEl.textContent = Math.ceil(skillCooldown[i] / 60);
                } else {
                    cdEl.style.display = 'none';
                }
            }
        }
        
        function checkWave() {
            if (bossDeathDelay > 0) { bossDeathDelay--; return; }

            const anyBossAlive = bossRefs.some(b => b && b.alive) ||
                                 abyssLords.some(a => a.alive) ||
                                 bladeMasters.some(b => b.alive) ||
                                 madEyes.some(m => m.alive) ||
                                 youBosses.some(y => y.alive) ||
                                 jieBosses.some(j => j.alive);
            if (anyBossAlive) return;

            const aliveEnemies = enemies.filter(e => e.alive && e.hp > 0);
            if (aliveEnemies.length === 0 && wave > 0 && !bossUpgradeTriggered) {
                // 诅咒之夜/疯狂之夜：每波结束自动回满血；普通模式：每5波Boss关回满
                if (curseNightMode || madnessNightMode || wave % 5 === 0) {
                    hero.hp = hero.maxHp;
                    if (heroClones) {
                        for (const c of heroClones) {
                            c.hp = c.maxHp;
                        }
                    }
                }
                // 标记本次升级已触发（防checkWave重复推进造成"升级好几次"）
                bossUpgradeTriggered = true;

                // ===== 赚钱逻辑 =====
                if (selectedMode === 'bossRush') {
                    // BossRush + 商店模式：只给金币（5波份=2250金币）+ 开商店，不弹buff选择（遵循商店模式规则）
                    // BossRush 无商店模式：保持原逻辑（5次buff选择+5波金币，金币在bossRushBatchSelect中给）
                    if (enableShop) {
                        for (let i = 0; i < 5; i++) earnGold(450);
                    } else {
                        bossRushBatchRewards = 5; // 无商店模式：5次buff选择
                    }
                } else if (enableShop) {
                    // 非BossRush商店模式：每波450金币
                    earnGold(450);
                }

                wave++;
                if (!showingBuff) {
                    showingBuff = true;
                    // ===== 流程优先级：商店模式 > BossRush批量奖励 > 经典 =====
                    // 商店模式规则：波次结束→开商店→关商店→下一波（无buff选择）
                    // BossRush+商店也遵循此规则：只开商店，不弹免费buff选择
                    if (enableShop) {
                        openShop();
                    } else if (selectedMode === 'bossRush') {
                        // BossRush无商店：5批奖励（完成后由 bossRushBatchSelect 推进）
                        showBuffSelection();
                    } else {
                        // 经典模式：正常选buff
                        showBuffSelection();
                    }
                }
                // ===== 天气切换：每波随机切换 =====
                if (enableWeather) {
                    switchWeather();
                }
                return;
            }
        }
        
        function showBuffSelection() {
            const buffContainer = document.getElementById('buffButtons');
            buffContainer.innerHTML = '';
            const hd = HERO_DEFS[currentHero];

            // 优先使用英雄专属肉鸽增强；若无则回退到通用 buffOptions
            const buffPool = (hd.buffs && hd.buffs.length > 0) ? hd.buffs : buffOptions;
            // 支持buff权重（如诸葛亮普攻+110概率×1.4）：按权重扩展池
            const weights = hd.buffWeights || {};
            let weightedPool = [];
            for (const b of buffPool) {
                const w = weights[b.id] || 1;
                for (let i = 0; i < w; i++) weightedPool.push(b);
            }
            const shuffled = [...weightedPool].sort(() => 0.5 - Math.random());
            // 去重：同id只保留一个
            const seen = new Set();
            const selectedBuffs = [];
            for (const b of shuffled) {
                if (!seen.has(b.id)) { seen.add(b.id); selectedBuffs.push(b); }
                if (selectedBuffs.length >= 4) break;
            }

            selectedBuffs.forEach((buff, index) => {
                const btn = document.createElement('button');
                btn.className = 'buff-btn';
                // 动态替换技能名为当前英雄技能名
                let text = buff.text
                    .replace('一技能', hd.skills[0].name)
                    .replace('二技能', hd.skills[1].name)
                    .replace('三技能', hd.skills[2].name);
                btn.textContent = text;
                btn.onclick = () => selectBuff(buff);
                buffContainer.appendChild(btn);
            });

            document.getElementById('buffScreen').style.display = 'block';
        }
        
        function selectBuff(buff) {
            // Boss Rush模式：批量奖励
            if (selectedMode === 'bossRush') {
                bossRushBatchSelect(buff);
                return;
            }

            document.getElementById('buffScreen').style.display = 'none';
            showingBuff = false;
            
            buff.apply();
            
            if (wave >= 40) {
                enemyCount += 5;
            } else if (wave >= 25) {
                enemyCount += 3;
            } else if (wave >= 15) {
                enemyCount += 2;
            } else {
                enemyCount++;
            }
            
            if (wave % 3 === 0) {
                let hpIncrease = 100;
                if (wave >= 72) {
                    hpIncrease = 1000;
                } else if (wave === 69) {
                    hpIncrease = 200;
                } else if (wave === 51) {
                    hpIncrease = 600;
                } else if (wave === 42) {
                    hpIncrease = 500;
                } else if (wave === 30) {
                    hpIncrease = 300;
                } else if (wave >= 21) {
                    hpIncrease = 200;
                } else if (wave >= 9) {
                    hpIncrease = 150;
                }
                enemyBaseHp += hpIncrease;
                enemyBaseAttack += 3;
            }
            
            updateStatsDisplay();
            spawnWave();
        }
        
