// ============================================================
// 文件: src/Enemy.js
// 描述: Enemy 类
// 行范围: 4950-6322 (原 game.js)
// 注意: 本文件由原版 HTML 抽取，保持原作用域不变
// ============================================================

// ===== 中/英文国际化词条 =====
Object.assign(I18N_DICT, {
    '帝': 'Emp',
    '王': 'Kin',
    '精': 'Eli',
    '弓': 'Arc',
    '曹操': 'enemy',
    '燃烧': 'Burn'
});

        /* ===== 双人联机：敌人/Boss 的索敌目标 =====
         * 原版所有敌人和 Boss 都直接朝全局 hero 走。这里不改那几百处引用，
         * 而是在每个 update/技能方法开头写一行 `const hero = coopTarget(this)`，
         * 把 hero 影子成「离我最近的那个玩家」，原逻辑就自动打到队友身上。
         * 队友不存在时永远返回原来的 hero，单人模式完全不受影响。 */
        function coopTarget(from) {
            const a = hero;
            const b = window.__coopHero2;
            if (!b || !b.alive) return a;
            if (!a || !a.alive) return b;
            if (!from || typeof from.x !== 'number' || typeof from.y !== 'number') return a;
            // 目标粘滞：另一个玩家要明显更近（90px）才换目标，避免两个人在旁边时来回抽搐
            if (from._coopTarget && from._coopTarget.alive) {
                const cur = from._coopTarget;
                const other = (cur === a) ? b : a;
                const dc = Math.hypot(cur.x - from.x, cur.y - from.y);
                const dot = Math.hypot(other.x - from.x, other.y - from.y);
                if (!(dot < dc - 90)) return cur;
                from._coopTarget = other;
                return other;
            }
            const da = Math.hypot(a.x - from.x, a.y - from.y);
            const db = Math.hypot(b.x - from.x, b.y - from.y);
            from._coopTarget = (db < da) ? b : a;
            return from._coopTarget;
        }

        class Enemy {
            constructor(x, y, type = 'normal', level = 1) {
                this.x = x;
                this.y = y;
                this.alive = true;
                this.type = type;
                this.attackCooldown = 0;
                this.flashTime = 0;
                this.shootCooldown = 0;
                this.bullets = [];
                this.stunTime = 0;
                // 防御性：currentDifficulty 可能在极端时序下未初始化，提供 fallback
                const diff = currentDifficulty || DIFFICULTY_CONFIG.hard;
                // ===== 甄姬寒冰机制相关字段初始化（必须为0，不能undefined） =====
                // 原因：update里检查 `this.shuangFreezeTimer <= 0` 时，undefined<=0 会返回 false，
                // 导致普通敌人/弓兵无法触发普攻和射击。必须显式初始化为0。
                this.shuangFreezeTimer = 0;  // 寒冰冻结剩余帧（0=未冻结，冻结期间不可叠层）
                this.shuangColdStacks = 0;   // 寒冰叠加层数（永久不消失，每5层立即冻结2秒后归零）
                // 陆逊燃烧等状态字段（同样需要初始化避免undefined问题）
                // 陆逊燃烧双轨制字段初始化（必须为0/空数组，避免 undefined 问题）
                this.yanBurnStackLayers = 0; // 燃烧叠层（永久记录，不随时间消失，每5层转1层正在燃烧）
                this.yanActiveBurns = [];    // 正在燃烧层数组，每个元素 { timer, tick } 独立3秒倒计时
                this.slowTimer = 0;          // 减速持续倒计时
                this.slowFactor = 0;         // 减速系数（0=无减速）

                if (type === 'emperor') {
                    // 帝君：降低45%血量后为基准
                    const hpMult = level === 2 ? 0.88 : 0.72;
                    const atkMult = [1.3, 1.6][level - 1] || 1.3;
                    this.emperorLevel = level;
                    // ===== 血量乘以难度倍率（困难基准1.0） =====
                    this.hp = enemyBaseHp * 30 * hpMult * diff.hpMult;
                    this.maxHp = this.hp;
                    this.attack = enemyBaseAttack * 3 * atkMult * 2.5;
                    this.radius = 50;
                    this.color = level === 1 ? '#8B0000' : '#5B0000';
                    this.baseColor = this.color;
                    this.label = _t('帝');
                    // ===== 速度由难度配置决定（困难基准1.8） =====
                    this.speed = diff.enemySpeed.boss;
                    this.isBoss = true;
                    this.isEmperor = true;
                    this.emperorSkill = null;
                    this.emperorSkillTimer = 0;
                    this.emperorSkillCharge = 0;
                    this.emperorSkillData = null;
                    this.emperorCooldown = 180; // 基础CD固定3秒（180帧）
                    this.emperorPhase = 0;
                    this.chargeTargetX = 0;
                    this.chargeTargetY = 0;
                    this.attackCooldown = 0; // 普攻冷却（统一字段，避免与通用 enemy attackCooldown 不一致）
                    this.emperorLaserHitTime = 0;
                    this.emperorSlashHitTime = 0;
                    this.emperorEnraged = false;
                    // ===== 6技能独立CD（用户要求：技能独立进行，能一起使用）=====
                    this.summonCd = 240;   // 4秒
                    this.laserCd = 300;    // 5秒
                    this.bombCd = 300;     // 5秒
                    this.teleportCd = 360; // 6秒
                    this.slashCd = 240;    // 4秒
                    this.eliteCd = 360;    // 6秒
                    this.emperorCooldown = 0; // 已废弃：保留兼容
                } else if (type === 'boss') {
                    // ===== 血量乘以难度倍率（困难基准1.0） =====
                    this.hp = enemyBaseHp * 10 * diff.hpMult;  // 基础HP改为10*E（原26.4*E，分裂系统基准）
                    this.maxHp = this.hp;
                    this.attack = enemyBaseAttack * 2.5 * 2.5;
                    this.radius = 42;
                    this.color = '#ff0066';
                    this.label = _t('王');
                    // ===== 速度由难度配置决定（困难基准1.8） =====
                    this.speed = diff.enemySpeed.boss;
                    this.isBoss = true;
                    // 王Boss分裂机制：1→2→4→8 最多3次分裂，每次HP-50%
                    this.splitCount = 0;  // 已分裂次数（0=未分裂，1=第一次，2=第二次，3=第三次不再分裂）
                    this.canSplit = true;
                    this.kingFamily = null;  // 所属家族ID（用于血条分组显示）
                    // 王Boss只能靠近普攻，技能仅死后分裂
                } else if (type === 'elite') {
                    // ===== 血量乘以难度倍率（困难基准1.0） =====
                    this.hp = enemyBaseHp * 3 * diff.hpMult;
                    this.maxHp = this.hp;
                    this.attack = Math.floor(enemyBaseAttack * 1.5);
                    this.radius = 26;
                    this.color = '#ff44ff';
                    this.label = _t('精');
                    // ===== 速度由难度配置决定（困难基准2.1） =====
                    this.speed = diff.enemySpeed.elite;
                    this.isElite = true;
                } else if (type === 'archer') {
                    // ===== 血量乘以难度倍率（困难基准1.0） =====
                    this.hp = enemyBaseHp * 0.6 * diff.hpMult;
                    this.maxHp = this.hp;
                    this.attack = Math.floor(enemyBaseAttack * 0.8);
                    this.radius = 18;
                    this.color = '#88ff88';
                    this.label = _t('弓');
                    // ===== 速度由难度配置决定（困难基准0.9） =====
                    this.speed = diff.enemySpeed.archer;
                    this.isArcher = true;
                    this.shootCooldown = 90;
                } else {
                    // ===== 血量乘以难度倍率（困难基准1.0） =====
                    this.hp = enemyBaseHp * diff.hpMult;
                    this.maxHp = this.hp;
                    this.attack = enemyBaseAttack;
                    this.radius = 20;
                    this.color = '#00d2ff';
                    this.label = _t('曹操');
                    // ===== 速度由难度配置决定（困难基准1.9） =====
                    this.speed = diff.enemySpeed.normal;
                }

                // ===== 疯狂天气：所有敌人血量+50%并回满（诅咒之夜·猩红疯狂 / 疯狂之夜·猩红疯狂） =====
                if ((enableWeather || curseNightMode || madnessNightMode) && (currentWeather === 'madness' || currentWeather === 'm_rampage')) {
                    this.maxHp = Math.floor(this.maxHp * 1.5);
                    this.hp = this.maxHp;
                }
            }

            update() {
                const hero = coopTarget(this);
                if (!this.alive || !hero || !hero.alive) return;
                // 三种冻结机制互不干扰，只要任一激活则敌人不动：
                // 1. timeFrozen：冥渊Boss时空静止（冻结所有人，包括英雄）
                // 2. heroFreezeTimer：韩非雾隐（仅冻结敌方，英雄攻击则提前结束）
                // 3. zhiFreezeTimer：左慈二技能时间停滞（冻结所有敌人3秒，英雄可自由移动攻击）
                if (timeFrozen || heroFreezeTimer > 0 || zhiFreezeTimer > 0) return;

                if (this.flashTime > 0) this.flashTime--;
                // 眩晕状态：不移动不攻击
                if (this.stunTime > 0) {
                    this.stunTime--;
                    return;
                }

                // 帝Boss技能系统
                if (this.isEmperor) {
                    this.updateEmperor();
                }

                const dx = hero.x - this.x;
                const dy = hero.y - this.y;
                const dist = Math.sqrt(dx*dx + dy*dy);

                // 帝Boss：不进行普通移动，但可以进行普通攻击 + 碰撞分离
                if (this.isEmperor) {
                    // 帝君普通攻击：距离小于半径+30时攻击hero
                    if (this.attackCooldown > 0) this.attackCooldown--;
                    if (this.emperorLaserHitTime > 0) this.emperorLaserHitTime--;
                    if (this.emperorSlashHitTime > 0) this.emperorSlashHitTime--;
                    // 蓄力期间仍能普攻（用户要求：技能独立进行，能一起使用，不再阻断普攻）
                    if (dist < this.radius + 30 && this.attackCooldown <= 0) {
                        this.attackCooldown = 60; // 1秒一次
                        heroAttackedBy(this, this.attack, '#ff3300', hero);
                    }
                    // 碰撞分离：避免hero卡在帝君内部
                    const minDist = this.radius + 25;
                    if (dist < minDist && dist > 0.1) {
                        const pushX = (this.x - hero.x) / dist;
                        const pushY = (this.y - hero.y) / dist;
                        // 帝君质量大，hero被推开
                        hero.x = Math.max(30, Math.min(MAP_WIDTH-30, hero.x - pushX * (minDist - dist)));
                        hero.y = Math.max(30, Math.min(MAP_HEIGHT-100, hero.y - pushY * (minDist - dist)));
                    }
                    // 限制位置
                    this.x = Math.max(50, Math.min(MAP_WIDTH - 50, this.x));
                    this.y = Math.max(50, Math.min(MAP_HEIGHT - 150, this.y));
                    return;
                }

                // 弓兵：保持距离远程射击
                if (this.isArcher) {
                    const ws = (enableWeather || curseNightMode || madnessNightMode) ? weatherEnemySpeedMult : 1;
                    // 鲁肃/张角/左慈减速：slowTimer > 0时速度×(1-slowFactor)
                    let slowMult = 1;
                    if (this.slowTimer > 0) {
                        slowMult = 1 - (this.slowFactor || 0.3);
                        this.slowTimer--;
                    }
                    // 甄姬寒冰冻结：冻结期间无法行动（不移动不射击）
                    if (this.shuangFreezeTimer > 0) slowMult = 0;
                    if (dist < 250) {
                        const safeDist = dist > 0.1 ? dist : 0.1; // 防御除零：弓兵与hero完全重合时避免NaN
                        this.x -= (dx/safeDist) * this.speed * ws * slowMult;
                        this.y -= (dy/safeDist) * this.speed * ws * slowMult;
                    } else if (dist > 350) {
                        this.x += (dx/dist) * this.speed * ws * slowMult;
                        this.y += (dy/dist) * this.speed * ws * slowMult;
                    }
                    this.shootCooldown--;
                    if (this.shootCooldown <= 0 && this.shuangFreezeTimer <= 0) {
                        this.shootCooldown = 120;
                        const sd = dist > 0.1 ? dist : 0.1; // 防御除零：射击时dist=0会导致子弹速度NaN
                        this.bullets.push({ x: this.x, y: this.y, vx: (dx/sd)*5, vy: (dy/sd)*5, life: 90 });
                    }
                } else if (dist > 40) {
                    const ws = (enableWeather || curseNightMode || madnessNightMode) ? weatherEnemySpeedMult : 1;
                    // 鲁肃/张角/左慈减速
                    let slowMult = 1;
                    if (this.slowTimer > 0) {
                        slowMult = 1 - (this.slowFactor || 0.3);
                        this.slowTimer--;
                    }
                    // 甄姬寒冰冻结：冻结期间无法移动
                    if (this.shuangFreezeTimer > 0) slowMult = 0;
                    this.x += (dx/dist) * this.speed * ws * slowMult;
                    this.y += (dy/dist) * this.speed * ws * slowMult;
                } else if (this.attackCooldown <= 0 && this.shuangFreezeTimer <= 0) {
                    // 甄姬寒冰冻结：冻结期间无法攻击
                    this.attackCooldown = this.isBoss ? 45 : 60;
                    heroAttackedBy(this, this.attack, '#ff4444', hero);
                }

                this.attackCooldown = Math.max(0, this.attackCooldown - 1);

                // 限制敌人在地图内
                this.x = Math.max(25, Math.min(MAP_WIDTH - 25, this.x));
                this.y = Math.max(25, Math.min(MAP_HEIGHT - 100, this.y));

                // 更新弓兵子弹
                for (let i = this.bullets.length - 1; i >= 0; i--) {
                    const b = this.bullets[i];
                    b.x += b.vx;
                    b.y += b.vy;
                    b.life--;
                    if (b.life <= 0) {
                        this.bullets.splice(i, 1);
                        continue;
                    }
                    if (Math.abs(b.x - hero.x) < 25 && Math.abs(b.y - hero.y) < 25) {
                        heroAttackedBy(this, this.attack, '#88ff88', hero);
                        this.bullets.splice(i, 1);
                    }
                }
            }

            // ===== 帝Boss技能系统 =====
            updateEmperor() {
                const hero = coopTarget(this);
                // 所有帝君血量<30%进入狂暴（冷却-30%，颜色变为亮红燃烧色）
                if (!this.emperorEnraged && this.hp < this.maxHp * 0.3) {
                    this.emperorEnraged = true;
                    this.color = '#ff6600';
                    this.baseColor = '#ff6600';
                    emperorRings.push({ x: this.x, y: this.y, radius: 0, maxRadius: 400, life: 50, maxLife: 50, color: '#ff0000', width: 12 });
                    emperorRings.push({ x: this.x, y: this.y, radius: 0, maxRadius: 300, life: 40, maxLife: 40, color: '#ff6600', width: 8 });
                    emperorRings.push({ x: this.x, y: this.y, radius: 0, maxRadius: 200, life: 30, maxLife: 30, color: '#ffaa00', width: 5 });
                    for (let i = 0; i < 60; i++) {
                        const a = Math.random() * Math.PI * 2;
                        emperorParticles.push({
                            type: 'burst', x: this.x, y: this.y,
                            vx: Math.cos(a) * (3 + Math.random() * 8),
                            vy: Math.sin(a) * (3 + Math.random() * 8),
                            life: 50 + Math.random()*20, maxLife: 70, color: ['#ff0000','#ff3300','#ff6600','#ffaa00','#ffff00'][Math.floor(Math.random()*5)], size: 6 + Math.random()*8
                        });
                    }
                    triggerShake(true);
                }
                const cdMult = this.emperorEnraged ? 1.43 : 1; // 狂暴时冷却-30%（速度x1.43）

                // 6技能独立CD倒数（每个技能独立计时）
                this.summonCd = Math.max(0, this.summonCd - cdMult);
                this.laserCd = Math.max(0, this.laserCd - cdMult);
                this.bombCd = Math.max(0, this.bombCd - cdMult);
                this.teleportCd = Math.max(0, this.teleportCd - cdMult);
                this.slashCd = Math.max(0, this.slashCd - cdMult);
                this.eliteCd = Math.max(0, this.eliteCd - cdMult);

                if (this.emperorSkill) {
                    // 正在执行技能
                    if (this.emperorSkillCharge > 0) {
                        this.emperorSkillCharge -= cdMult;
                        if (this.emperorSkillCharge <= 0) {
                            this.emperorSkillCharge = 0;
                            this.executeEmperorSkill();
                        }
                    }
                    this.emperorSkillTimer -= cdMult;
                    if (this.emperorSkillTimer <= 0) {
                        // 投射类技能（剑气/激光/炸弹）由自身数据管理生命周期，等数据清空再结束
                        if (this.emperorSkill === 'slash' || this.emperorSkill === 'laser' || this.emperorSkill === 'bomb') {
                            if (!this.emperorSkillData) {
                                this.emperorSkill = null;
                            }
                        } else {
                            this.emperorSkillData = null;
                            this.emperorSkill = null;
                        }
                    }
                }

                // 帝Boss缓慢游走
                const dx = hero.x - this.x;
                const dy = hero.y - this.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist > 200) {
                    const ws2 = (enableWeather || curseNightMode || madnessNightMode) ? weatherEnemySpeedMult : 1;
                    this.x += (dx/dist) * this.speed * 0.5 * ws2;
                    this.y += (dy/dist) * this.speed * 0.5 * ws2;
                }

                // 独立CD：选一个CD<=0的技能立即触发（不阻塞其他技能CD倒数）
                if (!this.emperorSkill) {
                    this.pickEmperorSkill();
                }
            }

            pickEmperorSkill() {
                const hero = coopTarget(this);
                // ===== 6技能独立CD：从所有CD<=0的技能中随机选一个 =====
                const available = [];
                if (this.summonCd <= 0) available.push('summon');
                if (this.laserCd <= 0) available.push('laser');
                if (this.bombCd <= 0) available.push('bomb');
                if (this.teleportCd <= 0) available.push('teleport');
                if (this.slashCd <= 0) available.push('slash');
                if (this.eliteCd <= 0) available.push('summonElite');
                if (available.length === 0) return; // 没有可用技能

                const skill = available[Math.floor(Math.random() * available.length)];
                this.emperorSkill = skill;
                this.emperorSkillCharge = 120; // 2秒蓄力
                this.emperorSkillTimer = 120;
                this.emperorSkillData = {};

                if (skill === 'summon') {
                    this.summonCd = 240;
                } else if (skill === 'summonElite') {
                    this.eliteCd = 360;
                } else if (skill === 'laser') {
                    this.chargeTargetX = hero.x;
                    this.chargeTargetY = hero.y;
                    this.emperorSkillCharge = 120;
                    this.emperorSkillTimer = 120 + 40;
                    this.laserCd = 300;
                } else if (skill === 'bomb') {
                    this.chargeTargetX = hero.x;
                    this.chargeTargetY = hero.y;
                    this.emperorSkillCharge = 120;
                    this.emperorSkillTimer = 120 + 60;
                    this.bombCd = 300;
                } else if (skill === 'teleport') {
                    this.chargeTargetX = hero.x;
                    this.chargeTargetY = hero.y;
                    this.emperorSkillCharge = 120;
                    this.emperorSkillTimer = 120;
                    this.teleportCd = 360;
                } else if (skill === 'slash') {
                    this.chargeTargetX = hero.x;
                    this.chargeTargetY = hero.y;
                    this.emperorSkillCharge = 120;
                    this.emperorSkillTimer = 120 + 30;
                    this.slashCd = 240;
                }
            }

            // ===== 帝君技能：独立可复用函数 ================================
            spawnEmperorSummon() {
                // 召唤光环爆发特效
                for (let i = 0; i < 20; i++) {
                    const a = (i / 20) * Math.PI * 2;
                    const spd = 2 + Math.random() * 5;
                    emperorParticles.push({
                        type: 'burst', x: this.x, y: this.y,
                        vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
                        life: 40, maxLife: 40, color: '#ff3300', size: 6
                    });
                }
                // 帝王脚下爆发圈
                emperorRings.push({ x: this.x, y: this.y, radius: 0, maxRadius: 200, life: 25, maxLife: 25, color: '#ff6600', width: 4 });

                const count = 3 + Math.floor(Math.random() * 18);
                for (let i = 0; i < count; i++) {
                    const angle = (i / count) * Math.PI * 2;
                    const r = this.radius + 40 + Math.random() * 60;
                    const ex = this.x + Math.cos(angle) * r;
                    const ey = this.y + Math.sin(angle) * r;
                    const newE = new Enemy(Math.max(30, Math.min(MAP_WIDTH-30, ex)), Math.max(30, Math.min(MAP_HEIGHT-100, ey)), 'normal');
                    enemies.push(newE);
                }
                triggerShake(true);
            }

            spawnEmperorSummonElite() {
                // 精英召唤专属紫色爆发
                for (let i = 0; i < 30; i++) {
                    const a = Math.random() * Math.PI * 2;
                    const spd = 1 + Math.random() * 6;
                    emperorParticles.push({
                        type: 'burst', x: this.x, y: this.y,
                        vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
                        life: 50, maxLife: 50, color: '#aa00ff', size: 8
                    });
                }
                emperorRings.push({ x: this.x, y: this.y, radius: 0, maxRadius: 250, life: 30, maxLife: 30, color: '#aa00ff', width: 6 });

                const count = 1 + Math.floor(Math.random() * 6);
                for (let i = 0; i < count; i++) {
                    const angle = Math.random() * Math.PI * 2;
                    const r = this.radius + 50;
                    const ex = this.x + Math.cos(angle) * r;
                    const ey = this.y + Math.sin(angle) * r;
                    const newE = new Enemy(Math.max(30, Math.min(MAP_WIDTH-30, ex)), Math.max(30, Math.min(MAP_HEIGHT-100, ey)), 'elite');
                    enemies.push(newE);
                }
                triggerShake(true);
            }

            spawnEmperorLaser() {
                const dirX = this.chargeTargetX - this.x;
                const dirY = this.chargeTargetY - this.y;
                const len = Math.sqrt(dirX*dirX + dirY*dirY) || 1;
                this.emperorSkillData = {
                    type: 'laser',
                    x: this.x, y: this.y,
                    dirX, dirY, len,
                    life: 50, maxLife: 50,
                    bounces: 0, maxBounces: 4,
                    trail: []
                };
                // 发射时粒子爆发
                for (let i = 0; i < 15; i++) {
                    const a = Math.random() * Math.PI * 2;
                    const spd = 2 + Math.random() * 6;
                    emperorParticles.push({
                        type: 'burst', x: this.x, y: this.y,
                        vx: Math.cos(a)*spd, vy: Math.sin(a)*spd,
                        life: 30, maxLife: 30, color: '#ff6600', size: 5
                    });
                }
                triggerShake(true);
            }

            spawnEmperorBomb() {
                this.emperorSkillData = {
                    type: 'bomb',
                    x: this.x, y: this.y,
                    targetX: this.chargeTargetX, targetY: this.chargeTargetY,
                    life: 70, maxLife: 70, progress: 0,
                    trail: []
                };
                // 投掷粒子
                for (let i = 0; i < 10; i++) {
                    const a = Math.random() * Math.PI * 2;
                    emperorParticles.push({
                        type: 'burst', x: this.x, y: this.y,
                        vx: Math.cos(a)*3, vy: Math.sin(a)*3,
                        life: 20, maxLife: 20, color: '#ffaa00', size: 4
                    });
                }
            }

            spawnEmperorTeleport() {
                const hero = coopTarget(this);
                // 原地消失特效
                for (let i = 0; i < 25; i++) {
                    const a = Math.random() * Math.PI * 2;
                    const r = Math.random() * 60;
                    emperorParticles.push({
                        type: 'burst',
                        x: this.x + Math.cos(a)*r, y: this.y + Math.sin(a)*r,
                        vx: Math.cos(a)*2, vy: Math.sin(a)*2,
                        life: 35, maxLife: 35, color: '#ffaa00', size: 6
                    });
                }
                emperorRings.push({ x: this.x, y: this.y, radius: 0, maxRadius: 60, life: 20, maxLife: 20, color: '#ff6600', width: 5 });

                const oldX = this.x, oldY = this.y;
                // 传送目标位置：落在hero附近但保持安全距离（避免卡在hero身上）
                const dx = this.chargeTargetX - oldX;
                const dy = this.chargeTargetY - oldY;
                const dlen = Math.sqrt(dx*dx + dy*dy) || 1;
                // 落点在hero朝帝君方向偏移120px处（hero视野内但不在hero身上）
                const safeDist = 120;
                let newX = this.chargeTargetX - (dx/dlen) * safeDist;
                let newY = this.chargeTargetY - (dy/dlen) * safeDist;
                // 夹在地图边界内
                newX = Math.max(60, Math.min(MAP_WIDTH - 60, newX));
                newY = Math.max(60, Math.min(MAP_HEIGHT - 150, newY));
                this.x = newX;
                this.y = newY;

                // 目的地出现特效
                for (let i = 0; i < 25; i++) {
                    const a = Math.random() * Math.PI * 2;
                    const r = Math.random() * 60;
                    emperorParticles.push({
                        type: 'burst',
                        x: this.x + Math.cos(a)*r, y: this.y + Math.sin(a)*r,
                        vx: -Math.cos(a)*1.5, vy: -Math.sin(a)*1.5,
                        life: 40, maxLife: 40, color: '#ffaa00', size: 6
                    });
                }
                emperorRings.push({ x: this.x, y: this.y, radius: 5, maxRadius: 80, life: 25, maxLife: 25, color: '#ff6600', width: 5 });

                // 传送伤害（目标位置，仅在落地瞬间触发）
                // 注：Boss技能只对英雄造成伤害，不误伤友方敌方（用户要求：敌方之间不能互相造成伤害）
                if (Math.abs(hero.x-this.x)<80 && Math.abs(hero.y-this.y)<80) {
                    heroAttackedBy(this, this.attack, '#ff3300', hero);
                }
                triggerShake(true);
            }

            spawnEmperorSlash() {
                const dirX = (this.chargeTargetX || this.x) - this.x;
                const dirY = (this.chargeTargetY || this.y) - this.y;
                const len = Math.sqrt(dirX*dirX + dirY*dirY) || 1;
                this.emperorSkillData = {
                    type: 'slash',
                    x: this.x, y: this.y,
                    vx: (dirX/len) * 9,
                    vy: (dirY/len) * 9,
                    life: 50, maxLife: 50,
                    halfWidth: 30, trail: []
                };
                // 发射粒子爆发
                for (let i = 0; i < 12; i++) {
                    const a = Math.random() * Math.PI * 2;
                    emperorParticles.push({
                        type: 'burst', x: this.x, y: this.y,
                        vx: Math.cos(a)*4, vy: Math.sin(a)*4,
                        life: 25, maxLife: 25, color: '#ffcc00', size: 5
                    });
                }
                triggerShake(true);
            }

            executeEmperorSkill() {
                if (!this.emperorSkill) return;
                const skill = this.emperorSkill;
                if (skill === 'summon') this.spawnEmperorSummon();
                else if (skill === 'summonElite') this.spawnEmperorSummonElite();
                else if (skill === 'laser') this.spawnEmperorLaser();
                else if (skill === 'bomb') this.spawnEmperorBomb();
                else if (skill === 'teleport') this.spawnEmperorTeleport();
                else if (skill === 'slash') this.spawnEmperorSlash();
                this.emperorSkillCharge = 0;
            }

            drawEmperorEffects() {
                const hero = coopTarget(this);
                if (!this.isEmperor || !this.emperorSkill) return;

                // 蓄力期间的超级警告效果
                if (this.emperorSkillCharge > 0) {
                    const chargePct = 1 - (this.emperorSkillCharge / 120);
                    const pulse = Math.sin(Date.now() / 80) * 0.3 + 0.7;

                    if (this.emperorSkill === 'laser') {
                        // 激光：多段旋转警告几何图形
                        ctx.save();
                        ctx.translate(this.x, this.y);
                        for (let i = 0; i < 6; i++) {
                            const angle = (i / 6) * Math.PI * 2 + Date.now() / 500;
                            ctx.save();
                            ctx.rotate(angle);
                            ctx.globalAlpha = (0.15 + chargePct * 0.4) * pulse;
                            ctx.strokeStyle = '#ff0000';
                            ctx.lineWidth = 2;
                            ctx.shadowColor = '#ff0000';
                            ctx.shadowBlur = 15;
                            ctx.strokeRect(-20 - chargePct*15, -3, 40 + chargePct*30, 6);
                            ctx.restore();
                        }
                        ctx.restore();

                        // 瞄准线：三层渐变
                        const tdx = this.chargeTargetX - this.x, tdy = this.chargeTargetY - this.y;
                        const tlen = Math.sqrt(tdx*tdx+tdy*tdy) || 1;
                        ctx.save();
                        ctx.globalAlpha = 0.15 + chargePct * 0.6;
                        // 外层
                        ctx.strokeStyle = '#ff0000';
                        ctx.lineWidth = 3 + chargePct * 18;
                        ctx.shadowColor = '#ff0000';
                        ctx.shadowBlur = 30 + chargePct * 30;
                        ctx.setLineDash([12, 8]);
                        ctx.beginPath();
                        ctx.moveTo(this.x, this.y);
                        ctx.lineTo(this.chargeTargetX, this.chargeTargetY);
                        ctx.stroke();
                        ctx.setLineDash([]);
                        // 内层亮线
                        ctx.strokeStyle = `rgba(255,${150+chargePct*100},0,${0.5+chargePct*0.5})`;
                        ctx.lineWidth = 1 + chargePct * 4;
                        ctx.shadowBlur = 10;
                        ctx.beginPath();
                        ctx.moveTo(this.x, this.y);
                        ctx.lineTo(this.chargeTargetX, this.chargeTargetY);
                        ctx.stroke();
                        ctx.restore();

                    } else if (this.emperorSkill === 'bomb') {
                        // 炸弹：多圈警告 + 旋转十字（蓄力圈已翻倍以匹配新爆炸范围）
                        ctx.save();
                        ctx.translate(this.chargeTargetX, this.chargeTargetY);
                        for (let i = 0; i < 4; i++) {
                            const angle = (i / 4) * Math.PI * 2 + Date.now() / 400;
                            ctx.save();
                            ctx.rotate(angle);
                            ctx.globalAlpha = (0.2 + chargePct * 0.5) * pulse;
                            ctx.strokeStyle = '#ff4400';
                            ctx.lineWidth = 3;
                            ctx.shadowColor = '#ff4400';
                            ctx.shadowBlur = 25;
                            ctx.strokeRect(-50 - chargePct*30, -3, 100 + chargePct*60, 6);
                            ctx.restore();
                        }
                        ctx.restore();
                        // 警告圆圈（最大半径翻倍：从80→160，匹配新范围240）
                        const radius = 50 + chargePct * 110;
                        ctx.save();
                        ctx.globalAlpha = 0.2 + chargePct * 0.55;
                        ctx.strokeStyle = '#ff4400';
                        ctx.lineWidth = 3 + chargePct * 5;
                        ctx.shadowColor = '#ff4400';
                        ctx.shadowBlur = 35;
                        ctx.setLineDash([8, 6]);
                        ctx.beginPath();
                        ctx.arc(this.chargeTargetX, this.chargeTargetY, radius, 0, Math.PI*2);
                        ctx.stroke();
                        ctx.fillStyle = `rgba(255,40,0,${0.1 + chargePct*0.2})`;
                        ctx.fill();
                        ctx.setLineDash([]);
                        ctx.restore();

                    } else if (this.emperorSkill === 'teleport') {
                        // 传送：目标处旋转方形警告
                        ctx.save();
                        ctx.translate(this.chargeTargetX, this.chargeTargetY);
                        ctx.rotate(Date.now() / 300);
                        ctx.globalAlpha = (0.2 + chargePct * 0.5) * pulse;
                        ctx.strokeStyle = '#ff6600';
                        ctx.lineWidth = 3 + chargePct * 3;
                        ctx.shadowColor = '#ff6600';
                        ctx.shadowBlur = 25;
                        const size = 25 + chargePct * 25;
                        ctx.strokeRect(-size, -size, size*2, size*2);
                        ctx.strokeRect(-size*0.7, -size*0.7, size*1.4, size*1.4);
                        ctx.restore();

                    } else if (this.emperorSkill === 'slash') {
                        // 剑气：超级弹道预览
                        const dirX = (this.chargeTargetX || this.x) - this.x;
                        const dirY = (this.chargeTargetY || this.y) - this.y;
                        const len = Math.sqrt(dirX*dirX + dirY*dirY) || 1;
                        ctx.save();
                        ctx.globalAlpha = 0.2 + chargePct * 0.6;
                        // 宽扇形区域
                        const angle = Math.atan2(dirY, dirX);
                        ctx.fillStyle = `rgba(255,80,0,${0.05 + chargePct*0.1})`;
                        ctx.beginPath();
                        ctx.moveTo(this.x, this.y);
                        ctx.arc(this.x, this.y, 500, angle - 0.15, angle + 0.15);
                        ctx.closePath();
                        ctx.fill();
                        // 中心线
                        ctx.strokeStyle = '#ff6600';
                        ctx.lineWidth = 4 + chargePct * 16;
                        ctx.shadowColor = '#ff6600';
                        ctx.shadowBlur = 30 + chargePct * 30;
                        ctx.setLineDash([10, 6]);
                        ctx.beginPath();
                        ctx.moveTo(this.x, this.y);
                        ctx.lineTo(this.x + (dirX/len)*600, this.y + (dirY/len)*600);
                        ctx.stroke();
                        ctx.setLineDash([]);
                        ctx.restore();
                    }
                }

                // 执行中的技能绘制（超帅版）
                if (this.emperorSkillData && this.emperorSkillData.type === 'laser') {
                    const ld = this.emperorSkillData;
                    // 生命周期递减（自包含，避免依赖未调用的 updateEmperorLasers）
                    ld.life--;
                    let lx = ld.x, ly = ld.y, ldx = ld.dirX, ldy = ld.dirY;
                    const lLen = Math.sqrt(ldx*ldx + ldy*ldy) || 1;
                    ldx /= lLen; ldy /= lLen;

                    // 计算反射路径
                    let segs = [{ x: lx, y: ly, dx: ldx, dy: ldy }];
                    let bounces = 0;
                    while (bounces <= ld.maxBounces && segs.length < 5) {
                        const last = segs[segs.length-1];
                        let t = 2000;
                        if (last.dx > 0) t = Math.min(t, (MAP_WIDTH - last.x) / last.dx);
                        if (last.dx < 0) t = Math.min(t, last.x / -last.dx);
                        if (last.dy > 0) t = Math.min(t, (MAP_HEIGHT - last.y) / last.dy);
                        if (last.dy < 0) t = Math.min(t, last.y / -last.dy);
                        if (t <= 0 || t > 2000) break;
                        last.hitX = last.x + last.dx * t;
                        last.hitY = last.y + last.dy * t;
                        if (bounces >= ld.maxBounces) break;
                        let ndx = last.dx, ndy = last.dy;
                        if (last.hitX <= 1 || last.hitX >= MAP_WIDTH-1) ndx = -ndx;
                        if (last.hitY <= 1 || last.hitY >= MAP_HEIGHT-1) ndy = -ndy;
                        segs.push({ x: last.hitX, y: last.hitY, dx: ndx, dy: ndy });
                        bounces++;
                    }

                    // 伤害判定：英雄与杂兵是否在激光路径上（带冷却避免每帧扣血）
                    for (const seg of segs) {
                        const endX = seg.hitX != null ? seg.hitX : (seg.x + seg.dx * 2000);
                        const endY = seg.hitY != null ? seg.hitY : (seg.y + seg.dy * 2000);
                        const segLen = Math.sqrt((endX - seg.x) ** 2 + (endY - seg.y) ** 2) || 1;
                        // 英雄（每30帧扣一次血）
                        const heroDist = Math.abs((hero.x - seg.x) * seg.dy - (hero.y - seg.y) * seg.dx);
                        const heroDot = (hero.x - seg.x) * seg.dx + (hero.y - seg.y) * seg.dy;
                        if (heroDist < 18 && heroDot > 0 && heroDot < segLen && this.emperorLaserHitTime <= 0) {
                            heroAttackedBy(this, Math.floor(this.attack * 0.5), '#ff3300', hero);
                            this.emperorLaserHitTime = 30; // 0.5秒冷却
                        }
                        // 注：激光不对杂兵造成伤害（用户要求：敌方之间不能互相造成伤害）
                    }

                    // 生命耗尽清理数据
                    if (ld.life <= 0) this.emperorSkillData = null;

                    const lifeRatio = Math.max(0, ld.life / ld.maxLife);

                    ctx.save();
                    ctx.globalAlpha = 0.9;
                    for (const seg of segs) {
                        const ex = seg.hitX || (seg.x + seg.dx * 2000);
                        const ey = seg.hitY || (seg.y + seg.dy * 2000);
                        // 5层超级激光
                        const layers = [
                            { color: '#ff0000', width: 30, blur: 80 },
                            { color: '#ff3300', width: 22, blur: 60 },
                            { color: '#ff6600', width: 15, blur: 45 },
                            { color: '#ffaa88', width: 7, blur: 25 },
                            { color: '#ffffff', width: 3, blur: 10 }
                        ];
                        for (const layer of layers) {
                            ctx.strokeStyle = layer.color;
                            ctx.lineWidth = layer.width * lifeRatio;
                            ctx.shadowColor = layer.color;
                            ctx.shadowBlur = layer.blur * lifeRatio;
                            ctx.beginPath();
                            ctx.moveTo(seg.x, seg.y);
                            ctx.lineTo(ex, ey);
                            ctx.stroke();
                        }
                    }
                    // 激光头部大光球
                    const headX = lx + ldx * 10, headY = ly + ldy * 10;
                    ctx.globalAlpha = lifeRatio;
                    ctx.fillStyle = '#ffffff';
                    ctx.shadowColor = '#ff6600';
                    ctx.shadowBlur = 50;
                    ctx.beginPath();
                    ctx.arc(headX, headY, 12, 0, Math.PI*2);
                    ctx.fill();
                    ctx.restore();

                } else if (this.emperorSkillData && this.emperorSkillData.type === 'bomb') {
                    const bd = this.emperorSkillData;
                    bd.progress += 1/60;
                    const bx = bd.x + (bd.targetX - bd.x) * bd.progress;
                    const by = bd.y + (bd.targetY - bd.y) * bd.progress + Math.sin(bd.progress*Math.PI) * -80;

                    // 拖尾粒子
                    if (Math.random() < 0.5) {
                        emperorParticles.push({
                            type: 'burst', x: bx, y: by,
                            vx: (Math.random()-0.5)*3, vy: (Math.random()-0.5)*3,
                            life: 15, maxLife: 15, color: '#ffaa00', size: 4
                        });
                    }

                    ctx.save();
                    // 超级炸弹光球
                    ctx.fillStyle = '#ff6600';
                    ctx.shadowColor = '#ff6600';
                    ctx.shadowBlur = 50;
                    ctx.beginPath();
                    ctx.arc(bx, by, 20, 0, Math.PI*2);
                    ctx.fill();
                    ctx.fillStyle = '#ffcc00';
                    ctx.shadowColor = '#ffcc00';
                    ctx.shadowBlur = 30;
                    ctx.beginPath();
                    ctx.arc(bx, by, 12, 0, Math.PI*2);
                    ctx.fill();
                    ctx.fillStyle = '#ffffff';
                    ctx.beginPath();
                    ctx.arc(bx, by, 6, 0, Math.PI*2);
                    ctx.fill();
                    ctx.restore();

                    // 落点圆圈（越来越密）
                    ctx.save();
                    ctx.globalAlpha = 0.3;
                    ctx.strokeStyle = '#ff4400';
                    ctx.lineWidth = 2;
                    ctx.shadowColor = '#ff4400';
                    ctx.shadowBlur = 20;
                    for (let i = 1; i <= 3; i++) {
                        ctx.globalAlpha = 0.1 + i * 0.1;
                        ctx.setLineDash([4, 8 - i*2]);
                        ctx.beginPath();
                        ctx.arc(bd.targetX, bd.targetY, 30 + bd.progress * 50 + i*20, 0, Math.PI*2);
                        ctx.stroke();
                    }
                    ctx.setLineDash([]);
                    ctx.restore();

                    // 炸弹落地判定
                    if (bd.progress >= 1.0) {
                        this.emperorSkillData = null;
                        // 超级爆炸（范围翻倍：180→360, 120→240）
                        emperorRings.push({ x: bd.targetX, y: bd.targetY, radius: 0, maxRadius: 360, life: 40, maxLife: 40, color: '#ff6600', width: 10 });
                        emperorRings.push({ x: bd.targetX, y: bd.targetY, radius: 0, maxRadius: 240, life: 30, maxLife: 40, color: '#ffcc00', width: 6 });
                        for (let i = 0; i < 80; i++) {
                            const a = Math.random() * Math.PI * 2;
                            const spd = 2 + Math.random() * 14;
                            const colors = ['#ff3300','#ff6600','#ffcc00','#ff0000','#ffffff'];
                            emperorParticles.push({
                                type: 'burst', x: bd.targetX, y: bd.targetY,
                                vx: Math.cos(a)*spd, vy: Math.sin(a)*spd,
                                life: 35 + Math.random()*35, maxLife: 70, color: colors[Math.floor(Math.random()*colors.length)], size: 3 + Math.random()*9
                            });
                        }
                        // 炸弹爆炸：只对英雄造成伤害，不误伤友方敌方（用户要求：敌方之间不能互相造成伤害）
                        if (Math.abs(hero.x-bd.targetX)<240 && Math.abs(hero.y-bd.targetY)<240) {
                            heroAttackedBy(this, Math.floor(this.attack * 2), '#ff4400', hero);
                        }
                        triggerShake(true);
                    }

                } else if (this.emperorSkillData && this.emperorSkillData.type === 'slash') {
                    const sd = this.emperorSkillData;
                    sd.x += sd.vx;
                    sd.y += sd.vy;
                    sd.life--;
                    const lifeRatio = Math.max(0, sd.life / sd.maxLife);

                    // 拖尾
                    if (!sd.trail) sd.trail = [];
                    sd.trail.unshift({ x: sd.x, y: sd.y });
                    if (sd.trail.length > 15) sd.trail.pop();

                    ctx.save();
                    // 拖尾渲染
                    for (let i = 1; i < sd.trail.length; i++) {
                        const alpha = (1 - i / sd.trail.length) * 0.5 * lifeRatio;
                        ctx.globalAlpha = alpha;
                        ctx.strokeStyle = '#ff6600';
                        ctx.lineWidth = (sd.trail.length - i) * 2;
                        ctx.shadowColor = '#ff6600';
                        ctx.shadowBlur = 15;
                        ctx.beginPath();
                        ctx.moveTo(sd.trail[i-1].x, sd.trail[i-1].y);
                        ctx.lineTo(sd.trail[i].x, sd.trail[i].y);
                        ctx.stroke();
                    }
                    ctx.restore();

                    ctx.save();
                    ctx.globalAlpha = 0.9 * lifeRatio;
                    // 5层剑气
                    const layers = [
                        { color: '#cc0000', width: sd.halfWidth * 2.4, blur: 60 },
                        { color: '#ff3300', width: sd.halfWidth * 1.8, blur: 45 },
                        { color: '#ff6600', width: sd.halfWidth * 1.2, blur: 35 },
                        { color: '#ffcc00', width: sd.halfWidth * 0.8, blur: 20 },
                        { color: '#ffffff', width: sd.halfWidth * 0.4, blur: 10 }
                    ];
                    for (const layer of layers) {
                        ctx.strokeStyle = layer.color;
                        ctx.lineWidth = layer.width;
                        ctx.shadowColor = layer.color;
                        ctx.shadowBlur = layer.blur;
                        ctx.lineCap = 'round';
                        ctx.beginPath();
                        ctx.moveTo(sd.x - sd.vx*3, sd.y - sd.vy*3);
                        ctx.lineTo(sd.x, sd.y);
                        ctx.stroke();
                    }
                    // 剑气头部光球
                    ctx.fillStyle = '#ffffff';
                    ctx.shadowColor = '#ffcc00';
                    ctx.shadowBlur = 40;
                    ctx.beginPath();
                    ctx.arc(sd.x, sd.y, 10, 0, Math.PI*2);
                    ctx.fill();
                    ctx.restore();

                    // 剑气伤害：只对英雄造成伤害，不误伤友方敌方（用户要求：敌方之间不能互相造成伤害）
                    if (Math.abs((hero.x-sd.x)*sd.vy-(hero.y-sd.y)*sd.vx)/Math.sqrt(sd.vx*sd.vx+sd.vy*sd.vy) < sd.halfWidth+25 && this.emperorSlashHitTime <= 0) {
                        heroAttackedBy(this, this.attack, '#ff6600', hero);
                        this.emperorSlashHitTime = 25; // 约0.4秒冷却
                    }

                    if (sd.life <= 0 || sd.x < -100 || sd.x > MAP_WIDTH+100 || sd.y < -100 || sd.y > MAP_HEIGHT+100) {
                        this.emperorSkillData = null;
                    }
                }
            }

            draw() {
                if (!this.alive) return;

                ctx.save();
                ctx.translate(this.x, this.y);

                // 受击闪白
                const flashing = this.flashTime > 0;
                const t = Date.now() / 200;
                const r = this.radius;

                if (this.isEmperor) {
                    // ===== 帝君：金色龙头+皇冠+神威光环 =====
                    this.drawEmperorAvatar(flashing, t);
                } else if (this.type === 'boss') {
                    // ===== 王：暗紫魔核+4旋转卫星+紫黑光晕 =====
                    this.drawKingAvatar(flashing, t);
                } else if (this.isElite) {
                    ctx.fillStyle = flashing ? '#ffffff' : this.color;
                    ctx.shadowColor = this.color;
                    ctx.shadowBlur = 25;
                    ctx.beginPath();
                    for (let i = 0; i < 6; i++) {
                        const a = (i/6)*Math.PI*2 + t*0.5;
                        const r = i%2===0 ? this.radius : this.radius*0.5;
                        if (i===0) ctx.moveTo(Math.cos(a)*r, Math.sin(a)*r);
                        else ctx.lineTo(Math.cos(a)*r, Math.sin(a)*r);
                    }
                    ctx.closePath();
                    ctx.fill();
                    ctx.shadowBlur = 0;
                } else if (this.isArcher) {
                    // 弓兵：盾形+箭矢
                    ctx.fillStyle = flashing ? '#ffffff' : this.color;
                    ctx.shadowColor = this.color;
                    ctx.shadowBlur = 15;
                    ctx.beginPath();
                    ctx.arc(0, 0, this.radius, 0, Math.PI*2);
                    ctx.fill();
                    ctx.fillStyle = '#224422';
                    ctx.fillRect(0, -3, this.radius+4, 6);
                    ctx.shadowBlur = 0;
                } else {
                    // 普通怪：旋转光点小球
                    ctx.fillStyle = flashing ? '#ffffff' : this.color;
                    ctx.shadowColor = this.color;
                    ctx.shadowBlur = 15;
                    ctx.beginPath();
                    ctx.arc(0, 0, this.radius, 0, Math.PI*2);
                    ctx.fill();
                    ctx.shadowBlur = 0;
                }

                // ===== 敌人状态视觉覆盖：燃烧 / 冻结 =====
                // 燃烧：橙红色半透明火焰光晕 + 边缘升腾小火苗
                if (Array.isArray(this.yanActiveBurns) && this.yanActiveBurns.length > 0) {
                    const burnIntensity = Math.min(1, this.yanActiveBurns.length * 0.25 + 0.35);
                    const fireGrad = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 1.4);
                    fireGrad.addColorStop(0, `rgba(255, 100, 0, ${0.25 * burnIntensity})`);
                    fireGrad.addColorStop(0.6, `rgba(255, 69, 0, ${0.45 * burnIntensity})`);
                    fireGrad.addColorStop(1, 'rgba(255, 69, 0, 0)');
                    ctx.fillStyle = fireGrad;
                    ctx.beginPath();
                    ctx.arc(0, 0, r * 1.4, 0, Math.PI * 2);
                    ctx.fill();
                    // 外层跳动的火焰舌
                    ctx.fillStyle = `rgba(255, 140, 0, ${0.6 * burnIntensity})`;
                    ctx.shadowColor = '#FF4500';
                    ctx.shadowBlur = 10;
                    const flameCount = this.isBoss ? 8 : (this.isElite ? 6 : 4);
                    for (let i = 0; i < flameCount; i++) {
                        const fa = (i / flameCount) * Math.PI * 2 + t * 0.5;
                        const fh = (0.6 + Math.sin(t * 4 + i) * 0.25) * r * 0.6;
                        const fw = r * 0.35;
                        ctx.beginPath();
                        ctx.moveTo(Math.cos(fa) * r, Math.sin(fa) * r);
                        ctx.quadraticCurveTo(
                            Math.cos(fa + 0.2) * (r + fw), Math.sin(fa + 0.2) * (r + fw),
                            Math.cos(fa) * (r + fh), Math.sin(fa) * (r + fh)
                        );
                        ctx.quadraticCurveTo(
                            Math.cos(fa - 0.2) * (r + fw), Math.sin(fa - 0.2) * (r + fw),
                            Math.cos(fa) * r, Math.sin(fa) * r
                        );
                        ctx.fill();
                    }
                    ctx.shadowBlur = 0;
                }
                // 冻结：冰蓝色（甄姬）/ 紫罗兰色（左慈）半透明冰壳 + 冰晶碎片
                const isZhiFrozen = zhiFreezeTimer > 0;
                const isShuangFrozen = this.shuangFreezeTimer > 0;
                if (isShuangFrozen || isZhiFrozen) {
                    const freezeColor = isShuangFrozen ? { r: 135, g: 206, b: 235, glow: '#00BFFF' } : { r: 186, g: 85, b: 211, glow: '#BA55D3' };
                    const iceAlpha = 0.45 + Math.sin(t * 3) * 0.1;
                    ctx.fillStyle = `rgba(${freezeColor.r}, ${freezeColor.g}, ${freezeColor.b}, ${iceAlpha})`;
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
                    ctx.lineWidth = 1.2;
                    ctx.shadowColor = freezeColor.glow;
                    ctx.shadowBlur = 12;
                    ctx.beginPath();
                    ctx.arc(0, 0, r * 1.15, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
                    // 冰晶刺
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
                    const iceCount = this.isBoss ? 10 : (this.isElite ? 8 : 6);
                    for (let i = 0; i < iceCount; i++) {
                        const ia = (i / iceCount) * Math.PI * 2 + t * 0.3;
                        const ir = r * (1.05 + Math.sin(t * 2 + i) * 0.08);
                        ctx.beginPath();
                        ctx.moveTo(Math.cos(ia) * r * 0.6, Math.sin(ia) * r * 0.6);
                        ctx.lineTo(Math.cos(ia + 0.08) * ir, Math.sin(ia + 0.08) * ir);
                        ctx.lineTo(Math.cos(ia - 0.08) * ir, Math.sin(ia - 0.08) * ir);
                        ctx.closePath();
                        ctx.fill();
                    }
                    ctx.shadowBlur = 0;
                }

                // 标签（放在底部避免与Boss细节冲突）
                const labelY = this.isBoss ? r * 0.55 : 0;
                ctx.fillStyle = '#fff';
                let fontPx = this.isEmperor ? 18 : (this.isBoss ? 16 : (this.isElite ? 14 : 11));
                // 普通怪：英文标签"enemy"较长，按标签实际宽度自适应缩小字号，避免溢出圆形（字放小一点）
                if (!this.isEmperor && !this.isBoss && !this.isElite) {
                    const maxW = this.radius * 1.7;
                    const w = ctx.measureText(this.label).width;
                    if (w > maxW) fontPx = Math.max(7, Math.floor(fontPx * maxW / w));
                }
                ctx.font = `bold ${fontPx}px Arial`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(this.label, 0, labelY);

                ctx.restore();

                // ===== 王Boss大血条（3分段）=====
                if (this.type === 'boss') {
                    this.drawKingBigHpBar();
                } else {
                    // 普通血条
                    const hpW = this.isBoss ? 100 : (this.isElite ? 50 : 40);
                    const hpH = this.isBoss ? 8 : 5;
                    ctx.fillStyle = '#333';
                    ctx.fillRect(this.x - hpW/2, this.y - this.radius - 15, hpW, hpH);
                    let hpColor = '#00d2ff';
                    if (this.isEmperor) hpColor = this.emperorEnraged ? '#ff0000' : '#ff3300';
                    else if (this.type === 'boss') hpColor = '#ff0066';
                    else if (this.isElite) hpColor = '#ff44ff';
                    ctx.fillStyle = hpColor;
                    ctx.fillRect(this.x - hpW/2, this.y - this.radius - 15, hpW * (this.maxHp > 0 ? this.hp / this.maxHp : 0), hpH);
                }

                // ===== 陆逊燃烧状态标签 =====
                // 任意时刻只要 e.yanActiveBurns.length > 0，显示"燃烧"小字（不管几层都只显示文字标注）
                if (Array.isArray(this.yanActiveBurns) && this.yanActiveBurns.length > 0) {
                    ctx.save();
                    ctx.font = 'bold 11px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = '#FF4500';
                    ctx.shadowColor = '#FFD700';
                    ctx.shadowBlur = 8;
                    ctx.fillText(_t('燃烧'), this.x, this.y - this.radius - 24);
                    ctx.restore();
                }
            }

            // ===== 王 Boss 专属造型：暗紫魔核+4旋转卫星+紫黑光晕 =====
            drawKingAvatar(flashing, t) {
                const r = this.radius;
                const splitFactor = Math.max(0.4, 1 - this.splitCount * 0.18);  // 分裂越多次造型越简化

                // 外层紫黑光晕
                const halo = ctx.createRadialGradient(0, 0, r*0.4, 0, 0, r*2.4);
                halo.addColorStop(0, flashing ? 'rgba(255,255,255,0.5)' : 'rgba(180,0,180,0.45)');
                halo.addColorStop(0.4, flashing ? 'rgba(220,100,220,0.3)' : 'rgba(120,0,180,0.28)');
                halo.addColorStop(0.8, 'rgba(60,0,80,0.15)');
                halo.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = halo;
                ctx.beginPath();
                ctx.arc(0, 0, r*2.4, 0, Math.PI*2);
                ctx.fill();

                // 双层旋转环（异速）
                ctx.save();
                ctx.rotate(t * 0.5);
                ctx.strokeStyle = 'rgba(255,0,180,0.7)';
                ctx.lineWidth = 2.5;
                ctx.setLineDash([10, 5]);
                ctx.beginPath();
                ctx.arc(0, 0, r + 12, 0, Math.PI*2);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.restore();

                ctx.save();
                ctx.rotate(-t * 0.7);
                ctx.strokeStyle = 'rgba(150,0,200,0.5)';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(0, 0, r + 22, 0, Math.PI*2);
                ctx.stroke();
                ctx.restore();

                // 4个旋转卫星（每卫星都是带小尖刺的小行星）
                for (let i = 0; i < 4; i++) {
                    const a = (i/4)*Math.PI*2 + t;
                    const sx = Math.cos(a) * (r + 20);
                    const sy = Math.sin(a) * (r + 20);
                    ctx.save();
                    ctx.translate(sx, sy);
                    ctx.rotate(t*2 + i);
                    // 卫星小行星（尖刺多边形）
                    const satSpikes = 5;
                    const satR = 7;
                    ctx.fillStyle = flashing ? '#ffffff' : '#cc33cc';
                    ctx.shadowColor = '#ff00aa';
                    ctx.shadowBlur = 18;
                    ctx.beginPath();
                    for (let k = 0; k < satSpikes*2; k++) {
                        const ang = (k/(satSpikes*2))*Math.PI*2;
                        const rr = k%2===0 ? satR : satR*0.55;
                        if (k===0) ctx.moveTo(Math.cos(ang)*rr, Math.sin(ang)*rr);
                        else ctx.lineTo(Math.cos(ang)*rr, Math.sin(ang)*rr);
                    }
                    ctx.closePath();
                    ctx.fill();
                    // 卫星内核
                    ctx.fillStyle = '#ff66ff';
                    ctx.beginPath();
                    ctx.arc(0, 0, 2.5, 0, Math.PI*2);
                    ctx.fill();
                    ctx.restore();
                }
                ctx.shadowBlur = 0;

                // 核心主体：8尖刺不规则紫黑色球
                ctx.save();
                ctx.rotate(t*0.4);
                const spikes = 8;
                const coreGrad = ctx.createRadialGradient(-r*0.3, -r*0.4, r*0.1, 0, 0, r*1.1);
                coreGrad.addColorStop(0, flashing ? '#ffffff' : '#aa00aa');
                coreGrad.addColorStop(0.3, flashing ? '#ffffff' : this.color);
                coreGrad.addColorStop(0.7, flashing ? '#ffffff' : '#440044');
                coreGrad.addColorStop(1, '#1a0010');
                ctx.fillStyle = coreGrad;
                ctx.shadowColor = this.color;
                ctx.shadowBlur = 40;
                ctx.beginPath();
                for (let i = 0; i < spikes*2; i++) {
                    const a = (i/(spikes*2))*Math.PI*2;
                    const rr = i%2===0 ? r : r*0.72;
                    if (i===0) ctx.moveTo(Math.cos(a)*rr, Math.sin(a)*rr);
                    else ctx.lineTo(Math.cos(a)*rr, Math.sin(a)*rr);
                }
                ctx.closePath();
                ctx.fill();
                ctx.shadowBlur = 0;

                // 核心表面能量纹路（动态旋转的紫黑裂纹）
                ctx.strokeStyle = 'rgba(255,0,180,0.6)';
                ctx.lineWidth = 1.5;
                ctx.shadowColor = '#ff00aa';
                ctx.shadowBlur = 8;
                for (let i = 0; i < 6; i++) {
                    const a = (i/6)*Math.PI*2 + t*0.5;
                    const len = r*0.4 + Math.sin(t*2 + i)*r*0.15;
                    ctx.beginPath();
                    ctx.moveTo(Math.cos(a)*r*0.2, Math.sin(a)*r*0.2);
                    ctx.quadraticCurveTo(
                        Math.cos(a+0.3)*r*0.5, Math.sin(a+0.3)*r*0.5,
                        Math.cos(a)*len, Math.sin(a)*len
                    );
                    ctx.stroke();
                }
                ctx.restore();
                ctx.shadowBlur = 0;

                // ===== 内部魔眼（3层，高光+虹膜+血丝+瞳孔，避免单点） =====
                // 眼白
                ctx.fillStyle = flashing ? '#ffffff' : '#330022';
                ctx.shadowColor = '#ff0044';
                ctx.shadowBlur = 20;
                ctx.beginPath();
                ctx.arc(0, 0, r*0.4, 0, Math.PI*2);
                ctx.fill();
                ctx.shadowBlur = 0;

                // 虹膜（红紫渐变）
                const iris = ctx.createRadialGradient(0, 0, 0, 0, 0, r*0.28);
                iris.addColorStop(0, '#ff66cc');
                iris.addColorStop(0.5, '#ff0044');
                iris.addColorStop(1, '#aa0033');
                ctx.fillStyle = iris;
                ctx.beginPath();
                ctx.arc(0, 0, r*0.28, 0, Math.PI*2);
                ctx.fill();

                // 瞳孔
                ctx.fillStyle = '#000000';
                ctx.shadowColor = '#ff0044';
                ctx.shadowBlur = 12;
                ctx.beginPath();
                ctx.arc(0, 0, r*0.13, 0, Math.PI*2);
                ctx.fill();
                ctx.shadowBlur = 0;

                // 瞳孔高光（白色小点）
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(-r*0.05, -r*0.05, r*0.04, 0, Math.PI*2);
                ctx.fill();

                // 眼周血丝（4条放射状）
                ctx.strokeStyle = '#ff0044';
                ctx.lineWidth = 1;
                ctx.globalAlpha = 0.7;
                for (let i = 0; i < 4; i++) {
                    const a = (i/4)*Math.PI*2 + t*0.3;
                    ctx.beginPath();
                    ctx.moveTo(Math.cos(a)*r*0.3, Math.sin(a)*r*0.3);
                    ctx.lineTo(Math.cos(a)*r*0.38, Math.sin(a)*r*0.38);
                    ctx.stroke();
                }
                ctx.globalAlpha = 1;
            }

            // ===== 帝君 Boss 专属造型：金色龙头+皇冠+龙鳞+神威光环 =====
            drawEmperorAvatar(flashing, t) {
                const r = this.radius;
                const enrage = this.emperorEnraged;
                // 外层神威光环
                const halo = ctx.createRadialGradient(0, 0, r*0.5, 0, 0, r*2.4);
                halo.addColorStop(0, enrage ? 'rgba(255,50,0,0.5)' : 'rgba(255,180,0,0.5)');
                halo.addColorStop(0.4, enrage ? 'rgba(255,30,0,0.3)' : 'rgba(255,80,0,0.3)');
                halo.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = halo;
                ctx.beginPath();
                ctx.arc(0, 0, r*2.4, 0, Math.PI*2);
                ctx.fill();

                // 三层光环（动态呼吸）
                for (let i = 0; i < 3; i++) {
                    ctx.strokeStyle = enrage
                        ? `rgba(255,${20+i*30},0,${0.4 - i*0.1 + Math.sin(t+i)*0.15})`
                        : `rgba(255,${100+i*30},0,${0.35 - i*0.08 + Math.sin(t*1.3+i)*0.15})`;
                    ctx.lineWidth = 3 + i;
                    ctx.beginPath();
                    ctx.arc(0, 0, r + 15 + i*15, 0, Math.PI*2);
                    ctx.stroke();
                }

                // 龙头主体（旋转的金色球体）—— 替换为纯几何：嵌套多边形+旋转龙鳞
                const body = ctx.createRadialGradient(-r*0.3, -r*0.4, r*0.2, 0, 0, r);
                body.addColorStop(0, flashing ? '#ffffff' : '#ffeb88');
                body.addColorStop(0.3, enrage ? '#ff5500' : '#ffaa00');
                body.addColorStop(0.7, enrage ? '#aa0000' : '#8B0000');
                body.addColorStop(1, enrage ? '#550000' : '#3B0000');
                ctx.fillStyle = body;
                ctx.shadowColor = enrage ? '#ff2200' : '#ffaa00';
                ctx.shadowBlur = 40;
                ctx.beginPath();
                ctx.arc(0, 0, r, 0, Math.PI*2);
                ctx.fill();
                ctx.shadowBlur = 0;

                // 龙鳞纹理
                ctx.save();
                ctx.rotate(t*0.4);
                ctx.strokeStyle = enrage ? 'rgba(255,80,0,0.4)' : 'rgba(255,200,0,0.4)';
                ctx.lineWidth = 1.5;
                for (let i = 0; i < 12; i++) {
                    const a = (i/12)*Math.PI*2;
                    ctx.beginPath();
                    ctx.arc(0, 0, r*0.7, a, a + 0.18);
                    ctx.stroke();
                }
                ctx.restore();

                // ===== 几何：3个旋转同心圆环（无五官） =====
                ctx.save();
                ctx.rotate(t * 0.6);
                ctx.strokeStyle = enrage ? 'rgba(255,200,0,0.7)' : 'rgba(255,255,150,0.7)';
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.arc(0, 0, r*0.55, 0, Math.PI*2);
                ctx.stroke();
                ctx.strokeStyle = enrage ? 'rgba(255,100,0,0.5)' : 'rgba(255,180,0,0.5)';
                ctx.lineWidth = 1.5;
                for (let i = 0; i < 6; i++) {
                    const a = i * Math.PI / 3;
                    ctx.beginPath();
                    ctx.arc(0, 0, r*0.55, a, a + 0.4);
                    ctx.stroke();
                }
                ctx.restore();

                // ===== 几何中心：旋转5芒星（替代眼睛） =====
                ctx.save();
                ctx.rotate(-t * 0.8);
                ctx.fillStyle = enrage ? '#fff5aa' : '#ffeb88';
                ctx.shadowColor = enrage ? '#ff2200' : '#ffaa00';
                ctx.shadowBlur = 18;
                for (let i = 0; i < 5; i++) {
                    const a = i * 2 * Math.PI / 5 - Math.PI / 2;
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(Math.cos(a) * r * 0.32, Math.sin(a) * r * 0.32);
                    ctx.lineTo(Math.cos(a + Math.PI/5) * r * 0.13, Math.sin(a + Math.PI/5) * r * 0.13);
                    ctx.closePath();
                    ctx.fill();
                }
                ctx.restore();
                // 中心高亮宝石
                ctx.fillStyle = enrage ? '#ffffff' : '#ffff66';
                ctx.shadowColor = enrage ? '#ff2200' : '#ffaa00';
                ctx.shadowBlur = 25;
                ctx.beginPath();
                ctx.arc(0, 0, r * 0.12, 0, Math.PI*2);
                ctx.fill();
                ctx.shadowBlur = 0;

                // 皇冠（顶部3个尖刺）—— 改为几何
                ctx.fillStyle = enrage ? '#ff3300' : '#ffd700';
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1.5;
                const crownY = -r - 5;
                for (let i = 0; i < 5; i++) {
                    const cx = (i-2) * 9;
                    const ch = i%2===0 ? 14 : 8;
                    ctx.beginPath();
                    ctx.moveTo(cx - 4, crownY);
                    ctx.lineTo(cx, crownY - ch);
                    ctx.lineTo(cx + 4, crownY);
                    ctx.closePath();
                    ctx.fill();
                    ctx.stroke();
                }
                // 皇冠中心红宝石
                ctx.fillStyle = enrage ? '#ffffff' : '#ff0000';
                ctx.shadowColor = enrage ? '#ff2200' : '#ff0000';
                ctx.shadowBlur = 12;
                ctx.beginPath();
                ctx.arc(0, crownY - 14, 2.5, 0, Math.PI*2);
                ctx.fill();
                ctx.shadowBlur = 0;

                // 6道帝王光芒（自上而下，从中心射出）
                for (let i = 0; i < 6; i++) {
                    const a = i * Math.PI / 3 + t * 0.5;
                    ctx.strokeStyle = `rgba(${enrage ? '255,80,0' : '255,200,0'}, ${0.5 + Math.sin(t*2 + i) * 0.3})`;
                    ctx.lineWidth = 2.5;
                    ctx.shadowColor = enrage ? '#ff2200' : '#ffaa00';
                    ctx.shadowBlur = 10;
                    ctx.beginPath();
                    ctx.moveTo(Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6);
                    ctx.lineTo(Math.cos(a) * r * 1.2, Math.sin(a) * r * 1.2);
                    ctx.stroke();
                }
            }

            // ===== 王Boss独立血条（每只王各画一条，不再聚合）=====
            drawKingBigHpBar() {
                if (this.hp <= 0) return;
                const anchorX = this.x;
                const anchorY = this.y + this.radius + 18;
                const barW = 64, barH = 7;
                // 黑色底
                ctx.fillStyle = 'rgba(0,0,0,0.7)';
                ctx.fillRect(anchorX - barW/2 - 1, anchorY - 1, barW + 2, barH + 2);
                ctx.fillStyle = '#1a0010';
                ctx.fillRect(anchorX - barW/2, anchorY, barW, barH);
                // 填充（按HP比例，粉红色）
                const pct = Math.max(0, Math.min(1, this.maxHp > 0 ? this.hp / this.maxHp : 0));
                ctx.fillStyle = '#ff3388';
                ctx.fillRect(anchorX - barW/2, anchorY, barW * pct, barH);
                // 边框（粉色发光）
                ctx.strokeStyle = '#ff66cc';
                ctx.lineWidth = 1;
                ctx.shadowColor = '#ff00aa';
                ctx.shadowBlur = 6;
                ctx.strokeRect(anchorX - barW/2, anchorY, barW, barH);
                ctx.shadowBlur = 0;
                // 标签
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 9px "Microsoft YaHei", sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.shadowColor = '#000';
                ctx.shadowBlur = 3;
                ctx.fillText(_t('王'), anchorX, anchorY - 6);
                // 百分比文字（显示在血条右侧）
                ctx.font = 'bold 8px "Courier New", monospace';
                ctx.fillText((pct * 100).toFixed(0) + '%', anchorX + barW/2 + 14, anchorY + barH/2);
                ctx.shadowBlur = 0;
            }
        }

