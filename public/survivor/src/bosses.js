// ============================================================
// 文件: src/bosses.js
// 描述: Boss 类（AbyssLord/BladeMaster/MadEye/YouBoss）
// 行范围: 6323-9441 (原 game.js)
// 注意: 本文件由原版 HTML 抽取，保持原作用域不变
// ============================================================

// ===== 中/英文国际化词条（追加到全局 I18N_DICT） =====
Object.assign(I18N_DICT, {
    // Boss 本体标记（本土化英文）
    '冥': 'Abyss',
    '剑': 'Sword',
    '瞳': 'Eye',
    '幽': 'Star',
    // Boss 技能浮字/提示
    '无敌': 'Invincible',
    '冲': 'Charge',
    // Boss 名（本土化英文）
    '帝君': 'Emperor',
    '冥渊': 'Abyss',
    '剑圣': 'Sword Saint',
    '妄瞳': 'Mad Eye',
    '霸王': 'Overlord',
    '劫': 'Kalpa',
    ' · 第': ' · Wave ',
    '波': ' ',
    // 掉落拾取提示
    '生命恢复': 'HP Restored',
    '暴击率': 'Crit Rate',
    '暴击伤害': 'Crit Damage',
    '清屏炸弹！': 'Screen Bomb!',
    '伤害增加': 'Damage Boost',
    '伤害减免': 'Damage Reduction',
    '伤害减免（已达上限），溢出+': 'Damage Reduction (Capped), Overflow+',
    '伤害减免已满95%，+': 'Damage Reduction Maxed at 95%, +',
    '转为伤害增加': 'Converted to Damage Boost',
    '（幸运双倍！）': '(Lucky Double!)',
    '（幸运双倍伤害！）': '(Lucky Double Damage!)',
    // 掉落小球标记
    '血': 'HP',
    '暴': 'CR',
    '伤': 'CD',
    '弹': 'BMB',
    '增': 'UP',
    '减': 'DN',
    // 暴击飘字
    '暴击 -': 'Crit -',
    // 劫击败提示
    '劫已被击败！': 'Kalpa Defeated!',
    '奖励掉落': 'Rewards Dropped',
    // 劫阶段切换转场
    '劫转': 'Kalpa Shift',
    '极光': 'Aurora',
    '劫灭': 'Kalpa Doom',
    '赛博核心': 'Cyber Core',
});

        class AbyssLord {
            constructor(x, y, level = 1) {
                const cfg = BOSS_CONFIG.abyssLord;
                this._cfg = cfg; // 存储配置引用，供方法使用
                this.x = x;
                this.y = y;
                this.alive = true;
                this.type = 'abyss';
                this.abyssLevel = level;
                const hpMult = level === 2 ? cfg.levelHpMult[2] : cfg.levelHpMult[1];
                const atkMult = cfg.levelAtkMult[level - 1] || cfg.levelAtkMult[0];
                // 防御性：currentDifficulty fallback
                const diff = currentDifficulty || DIFFICULTY_CONFIG.hard;
                // ===== 血量乘以难度倍率（困难基准1.0） =====
                this.hp = enemyBaseHp * cfg.baseHpMult * hpMult * diff.hpMult;
                this.maxHp = this.hp;
                this.attack = enemyBaseAttack * cfg.attackCalc.baseMult * atkMult * cfg.attackCalc.globalMult * cfg.attackCalc.damageReduction;
                this.baseRadius = cfg.baseRadius;
                this.radius = cfg.baseRadius;
                // ===== 速度由难度配置决定（困难基准1.8） =====
                this.baseSpeed = diff.enemySpeed.boss;
                this.speed = diff.enemySpeed.boss;
                // ===== 疯狂天气：Boss血量+50%并回满 =====
                if ((enableWeather || curseNightMode || madnessNightMode) && (currentWeather === 'madness' || currentWeather === 'm_rampage')) {
                    this.maxHp = Math.floor(this.maxHp * BOSS_CONFIG.madnessWeatherHpBonus);
                    this.hp = this.maxHp;
                }
                this.color = level === 1 ? '#1a0033' : '#000000';
                this.baseColor = this.color;
                this.edgeColor = level === 2 ? '#88ccff' : '#6600cc';
                this.baseEdgeColor = this.edgeColor;
                this.label = _t('冥');
                this.isBoss = true;
                this.isAbyss = true;
                this.flashTime = 0;
                this.stunTime = 0;
                this.attackCooldown = 0;
                // 技能状态机
                this.abyssSkill = null;
                this.abyssSkillCharge = 0;
                this.abyssSkillTimer = 0;
                this.abyssSkillData = null;
                this.chargeTargetX = 0;
                this.chargeTargetY = 0;
                this.scale = 1; // 变大状态（1=正常 2=巨化）
                this.scaleTimer = 0; // 巨化剩余帧
                this.abyssEnraged = false; // 血量<30%狂暴
                this.laserHitCooldown = 0; // 激光伤害冷却
                this.flickerTimer = 0; // 闪烁特效计时
                // ===== 6技能独立CD（用户要求：技能独立进行，能一起使用）=====
                this.growCd = cfg.skills.grow.cd;         // 5秒（巨化）
                this.laserCd = cfg.skills.laser.cd;        // 4秒
                this.teleportCd = cfg.skills.teleport.cd;  // 6秒
                this.bombCd = cfg.skills.bomb.cd;          // 5秒
                this.summonEliteCd = cfg.skills.summonElite.cd; // 6秒
                this.timeFreezeCd = cfg.skills.timeFreeze.cd;   // 8秒
                this.abyssCooldown = 0;   // 已废弃：保留兼容
            }

            update() {
                const hero = coopTarget(this);
                if (!this.alive || !hero || !hero.alive) return;
                if (this.flashTime > 0) this.flashTime--;
                if (this.flickerTimer > 0) this.flickerTimer--;
                if (this.laserHitCooldown > 0) this.laserHitCooldown--;
                // 眩晕
                if (this.stunTime > 0) { this.stunTime--; return; }
                // 时空静止时所有生物不动 / 韩非雾隐：仅冻结敌方
                if (timeFrozen || heroFreezeTimer > 0) return;

                // 所有冥渊血量<30%狂暴（冷却-30%+超明显变色——亮紫粉边光+深紫黑中心+三层爆发环）
                if (!this.abyssEnraged && this.hp < this.maxHp * this._cfg.enrageHpThreshold) {
                    this.abyssEnraged = true;
                    this.color = '#0a0015';
                    this.edgeColor = '#ff66ff';
                    // 狂暴瞬间三层爆发环
                    abyssRings.push({ x: this.x, y: this.y, radius: 0, maxRadius: 400, life: 50, maxLife: 50, color: '#ff00ff', width: 12 });
                    abyssRings.push({ x: this.x, y: this.y, radius: 0, maxRadius: 300, life: 40, maxLife: 40, color: '#dd44ff', width: 8 });
                    abyssRings.push({ x: this.x, y: this.y, radius: 0, maxRadius: 200, life: 30, maxLife: 30, color: '#ff88ff', width: 5 });
                    for (let i = 0; i < 60; i++) {
                        const a = Math.random() * Math.PI * 2;
                        abyssParticles.push({
                            type: 'burst', x: this.x, y: this.y,
                            vx: Math.cos(a) * (3 + Math.random() * 8),
                            vy: Math.sin(a) * (3 + Math.random() * 8),
                            life: 50 + Math.random()*20, maxLife: 70,
                            color: ['#ff00ff','#dd44ff','#ff66ff','#ffaaff','#ffffff'][Math.floor(Math.random()*5)],
                            size: 6 + Math.random()*8
                        });
                    }
                    triggerShake(true);
                }
                const cdMult = this.abyssEnraged ? this._cfg.enrageCdMult : 1; // 狂暴时冷却-30%（速度x1.43）

                // 巨化状态倒计时
                if (this.scaleTimer > 0) {
                    this.scaleTimer--;
                    if (this.scaleTimer === 0) {
                        this.scale = 1;
                        this.radius = this.baseRadius;
                    }
                }

                // ===== 6技能独立CD倒数 =====
                this.growCd = Math.max(0, this.growCd - cdMult);
                this.laserCd = Math.max(0, this.laserCd - cdMult);
                this.teleportCd = Math.max(0, this.teleportCd - cdMult);
                this.bombCd = Math.max(0, this.bombCd - cdMult);
                this.summonEliteCd = Math.max(0, this.summonEliteCd - cdMult);
                this.timeFreezeCd = Math.max(0, this.timeFreezeCd - cdMult);

                // 始终朝着英雄方向移动（不再受距离限制）
                this.moveTowardHero(this._cfg.moveSpeedMult);

                // 正在执行技能
                if (this.abyssSkill) {
                    if (this.abyssSkillCharge > 0) {
                        this.abyssSkillCharge -= cdMult;
                        if (this.abyssSkillCharge <= 0) {
                            this.abyssSkillCharge = 0;
                            this.executeAbyssSkill();
                        }
                    }
                    this.abyssSkillTimer -= cdMult;
                    if (this.abyssSkillTimer <= 0) {
                        // 投射类技能（激光/炸弹）等数据清空再结束
                        if (this.abyssSkill === 'laser' || this.abyssSkill === 'bomb') {
                            if (!this.abyssSkillData) {
                                this.abyssSkill = null;
                            }
                        } else {
                            this.abyssSkillData = null;
                            this.abyssSkill = null;
                        }
                    }
                    // 技能执行期间仍保持普通攻击（不再return阻断）
                }

                // 普通攻击（接触时，始终可用）
                if (this.attackCooldown > 0) this.attackCooldown--;
                const dx = hero.x - this.x;
                const dy = hero.y - this.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist < this.radius + this._cfg.attackRangeExtra && this.attackCooldown <= 0 && this.abyssSkillCharge <= 0) {
                    this.attackCooldown = this._cfg.attackCooldown;
                    heroAttackedBy(this, this.attack, '#88ccff', hero);
                }
                // 碰撞分离
                const minDist = this.radius + this._cfg.pushDistanceExtra;
                if (dist < minDist && dist > 0.1) {
                    const pushX = (this.x - hero.x) / dist;
                    const pushY = (this.y - hero.y) / dist;
                    hero.x = Math.max(30, Math.min(MAP_WIDTH-30, hero.x - pushX * (minDist - dist)));
                    hero.y = Math.max(30, Math.min(MAP_HEIGHT-100, hero.y - pushY * (minDist - dist)));
                }

                // 限制位置
                this.x = Math.max(60, Math.min(MAP_WIDTH - 60, this.x));
                this.y = Math.max(60, Math.min(MAP_HEIGHT - 150, this.y));

                // 独立CD：选一个CD<=0的技能立即触发
                if (!this.abyssSkill) {
                    this.pickAbyssSkill();
                }
            }

            // 冥渊Boss移动辅助：朝英雄方向推进，遇边界反弹
            moveTowardHero(spdMult) {
                const hero = coopTarget(this);
                if (!hero || hero.hp <= 0) return;
                const dx = hero.x - this.x;
                const dy = hero.y - this.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist < 0.1) return;
                const spd = this.speed * (spdMult || 1) * ((enableWeather || curseNightMode || madnessNightMode) ? weatherEnemySpeedMult : 1);
                this.x += (dx / dist) * spd;
                this.y += (dy / dist) * spd;
                // 限制位置
                this.x = Math.max(60, Math.min(MAP_WIDTH - 60, this.x));
                this.y = Math.max(60, Math.min(MAP_HEIGHT - 150, this.y));
            }

            pickAbyssSkill() {
                const hero = coopTarget(this);
                // ===== 6技能独立CD：从所有CD<=0的技能中随机选一个 =====
                const available = [];
                if (this.growCd <= 0) available.push('grow');
                if (this.laserCd <= 0) available.push('laser');
                if (this.teleportCd <= 0) available.push('teleport');
                if (this.bombCd <= 0) available.push('bomb');
                if (this.summonEliteCd <= 0) available.push('summonElite');
                if (this.timeFreezeCd <= 0) available.push('timeFreeze');
                if (available.length === 0) return; // 没有可用技能

                const skill = available[Math.floor(Math.random() * available.length)];
                this.abyssSkill = skill;
                this.abyssSkillCharge = 120; // 2秒蓄力
                this.abyssSkillTimer = 120;
                this.abyssSkillData = {};

                // 记录蓄力开始时玩家位置（位置锁，不实时跟踪）
                this.chargeTargetX = hero.x;
                this.chargeTargetY = hero.y;

                // 释放技能后该技能CD重置
                if (skill === 'grow') this.growCd = this._cfg.skills.grow.cd;
                else if (skill === 'laser') { this.laserCd = this._cfg.skills.laser.cd; this.abyssSkillTimer = this._cfg.skills.laser.charge + this._cfg.skills.laser.extraDuration; }
                else if (skill === 'teleport') this.teleportCd = this._cfg.skills.teleport.cd;
                else if (skill === 'bomb') { this.bombCd = this._cfg.skills.bomb.cd; this.abyssSkillTimer = this._cfg.skills.bomb.charge + this._cfg.skills.bomb.extraDuration; }
                else if (skill === 'summonElite') this.summonEliteCd = this._cfg.skills.summonElite.cd;
                else if (skill === 'timeFreeze') { this.timeFreezeCd = this._cfg.skills.timeFreeze.cd; this.abyssSkillTimer = this._cfg.skills.timeFreeze.charge + this._cfg.skills.timeFreeze.extraDuration; }
            }

            executeAbyssSkill() {
                if (!this.abyssSkill) return;
                const s = this.abyssSkill;
                if (s === 'grow') this.spawnAbyssGrow();
                else if (s === 'laser') this.spawnAbyssLaser();
                else if (s === 'teleport') this.spawnAbyssTeleport();
                else if (s === 'bomb') this.spawnAbyssBomb();
                else if (s === 'summonElite') this.spawnAbyssSummonElite();
                else if (s === 'timeFreeze') this.spawnAbyssTimeFreeze();
                this.abyssSkillCharge = 0;
            }

            // ===== 技能1：虚空巨化 =====
            spawnAbyssGrow() {
                this.scale = this._cfg.skills.grow.scaleMult;
                this.radius = this.baseRadius * this._cfg.skills.grow.scaleMult;
                this.scaleTimer = this._cfg.skills.grow.scaleTimer; // 5秒（用户加强）
                // 紫黑色扩散光环
                abyssRings.push({ x: this.x, y: this.y, radius: 0, maxRadius: 200, life: 30, maxLife: 30, color: '#4a0080', width: 8 });
                // 30粒子爆发
                for (let i = 0; i < 30; i++) {
                    const a = (i / 30) * Math.PI * 2;
                    abyssParticles.push({
                        type: 'burst', x: this.x, y: this.y,
                        vx: Math.cos(a) * 5, vy: Math.sin(a) * 5,
                        life: 35, maxLife: 35, color: '#88ccff', size: 6
                    });
                }
                triggerShake(true);
            }

            // ===== 技能2：主激光+7侧黑激光 =====
            spawnAbyssLaser() {
                // 主方向朝锁定位置
                const dirX = this.chargeTargetX - this.x;
                const dirY = this.chargeTargetY - this.y;
                const len = Math.sqrt(dirX*dirX + dirY*dirY) || 1;
                const mainAngle = Math.atan2(dirY, dirX);
                // 主激光 + 7侧黑激光（左右各3个+1=7个，间隔约25.7度）
                const angles = [mainAngle];
                for (let i = 1; i <= 7; i++) {
                    const sign = (i % 2 === 0) ? 1 : -1; // 偶数右奇数左
                    const slot = Math.ceil(i / 2);
                    const offset = (Math.PI / 7) * slot * sign;
                    angles.push(mainAngle + offset);
                }
                this.abyssSkillData = {
                    type: 'laser',
                    x: this.x, y: this.y,
                    angles,
                    life: this._cfg.skills.laser.beamLife, maxLife: this._cfg.skills.laser.beamLife,
                    mainAngle,
                    isMain: (a) => Math.abs(a - mainAngle) < 0.01
                };
                // 发射粒子爆发
                for (let i = 0; i < 28; i++) {
                    const a = Math.random() * Math.PI * 2;
                    abyssParticles.push({
                        type: 'burst', x: this.x, y: this.y,
                        vx: Math.cos(a)*4, vy: Math.sin(a)*4,
                        life: 30, maxLife: 30, color: i % 2 === 0 ? '#1a0033' : '#88ccff', size: 5
                    });
                }
                triggerShake(true);
            }

            // ===== 技能3：暗影传送 =====
            spawnAbyssTeleport() {
                const hero = coopTarget(this);
                // 原地消失
                for (let i = 0; i < 25; i++) {
                    const a = Math.random() * Math.PI * 2;
                    const r = Math.random() * 60;
                    abyssParticles.push({
                        type: 'burst', x: this.x + Math.cos(a)*r, y: this.y + Math.sin(a)*r,
                        vx: Math.cos(a)*2, vy: Math.sin(a)*2,
                        life: 35, maxLife: 35, color: '#4a0080', size: 6
                    });
                }
                abyssRings.push({ x: this.x, y: this.y, radius: 0, maxRadius: 70, life: 22, maxLife: 22, color: '#88ccff', width: 5 });

                // 落点：hero附近安全距离
                const dx = this.chargeTargetX - this.x;
                const dy = this.chargeTargetY - this.y;
                const dlen = Math.sqrt(dx*dx + dy*dy) || 1;
                const safeDist = this._cfg.skills.teleport.safeDist;
                let nx = this.chargeTargetX - (dx/dlen) * safeDist;
                let ny = this.chargeTargetY - (dy/dlen) * safeDist;
                nx = Math.max(60, Math.min(MAP_WIDTH-60, nx));
                ny = Math.max(60, Math.min(MAP_HEIGHT-150, ny));
                this.x = nx; this.y = ny;

                // 落地特效
                for (let i = 0; i < 25; i++) {
                    const a = Math.random() * Math.PI * 2;
                    const r = Math.random() * 60;
                    abyssParticles.push({
                        type: 'burst', x: this.x + Math.cos(a)*r, y: this.y + Math.sin(a)*r,
                        vx: -Math.cos(a)*1.5, vy: -Math.sin(a)*1.5,
                        life: 40, maxLife: 40, color: '#88ccff', size: 6
                    });
                }
                abyssRings.push({ x: this.x, y: this.y, radius: 5, maxRadius: 90, life: 26, maxLife: 26, color: '#88ccff', width: 5 });
                // 落地伤害：只对英雄造成伤害，不误伤友方敌方（用户要求：敌方之间不能互相造成伤害）
                if (Math.abs(hero.x-this.x)<this._cfg.skills.teleport.landingDamageRange && Math.abs(hero.y-this.y)<this._cfg.skills.teleport.landingDamageRange) {
                    heroAttackedBy(this, this.attack, '#88ccff', hero);
                }
                triggerShake(true);
            }

            // ===== 技能4：暗影炸弹 =====
            spawnAbyssBomb() {
                this.abyssSkillData = {
                    type: 'bomb',
                    x: this.x, y: this.y,
                    targetX: this.chargeTargetX, targetY: this.chargeTargetY,
                    life: this._cfg.skills.bomb.bombLife, maxLife: this._cfg.skills.bomb.bombLife, progress: 0
                };
                for (let i = 0; i < 12; i++) {
                    const a = Math.random() * Math.PI * 2;
                    abyssParticles.push({
                        type: 'burst', x: this.x, y: this.y,
                        vx: Math.cos(a)*3, vy: Math.sin(a)*3,
                        life: 22, maxLife: 22, color: '#4a0080', size: 4
                    });
                }
            }

            // ===== 技能5：精英召唤 =====
            spawnAbyssSummonElite() {
                // 紫黑爆发
                for (let i = 0; i < 35; i++) {
                    const a = Math.random() * Math.PI * 2;
                    const spd = 1 + Math.random() * 6;
                    abyssParticles.push({
                        type: 'burst', x: this.x, y: this.y,
                        vx: Math.cos(a)*spd, vy: Math.sin(a)*spd,
                        life: 55, maxLife: 55, color: '#aa00ff', size: 8
                    });
                }
                abyssRings.push({ x: this.x, y: this.y, radius: 0, maxRadius: 280, life: 35, maxLife: 35, color: '#aa00ff', width: 7 });
                // 召唤1-5精英
                const count = this._cfg.skills.summonElite.minCount + Math.floor(Math.random() * (this._cfg.skills.summonElite.maxCount - this._cfg.skills.summonElite.minCount + 1));
                for (let i = 0; i < count; i++) {
                    const angle = Math.random() * Math.PI * 2;
                    const r = this.radius + this._cfg.skills.summonElite.spawnDist;
                    const ex = this.x + Math.cos(angle) * r;
                    const ey = this.y + Math.sin(angle) * r;
                    enemies.push(new Enemy(Math.max(30, Math.min(MAP_WIDTH-30, ex)), Math.max(30, Math.min(MAP_HEIGHT-100, ey)), 'elite'));
                }
                triggerShake(true);
            }

            // ===== 技能6：时空静止（全屏压迫感特效） =====
            spawnAbyssTimeFreeze() {
                // 紫黑+白色爆发（80粒子，更大更强）
                for (let i = 0; i < 80; i++) {
                    const a = (i / 80) * Math.PI * 2;
                    const sp = 4 + Math.random() * 8;
                    abyssParticles.push({
                        type: 'burst', x: this.x, y: this.y,
                        vx: Math.cos(a)*sp, vy: Math.sin(a)*sp,
                        life: 60, maxLife: 60, color: i % 3 === 0 ? '#ffffff' : (i % 3 === 1 ? '#1a0033' : '#6600cc'), size: 9
                    });
                }
                // 3层扩散光环（白→紫→黑）
                abyssRings.push({ x: this.x, y: this.y, radius: 0, maxRadius: 800, life: 50, maxLife: 50, color: '#ffffff', width: 12 });
                abyssRings.push({ x: this.x, y: this.y, radius: 0, maxRadius: 700, life: 45, maxLife: 45, color: '#6600cc', width: 10 });
                abyssRings.push({ x: this.x, y: this.y, radius: 0, maxRadius: 600, life: 40, maxLife: 40, color: '#1a0033', width: 14 });
                // 启动时空静止
                timeFrozen = true;
                timeFrozenTimer = this._cfg.skills.timeFreeze.freezeDuration; // 2秒
                timeFreezeFlashTime = this._cfg.skills.timeFreeze.flashTime;
                triggerShake(true);
            }

            // ===== 绘制冥渊Boss本体：紫色裂隙+漂浮时间符文+黑洞吸收光环 =====
            draw() {
                if (!this.alive) return;
                ctx.save();
                ctx.translate(this.x, this.y);
                const flicker = this.flickerTimer > 0 && Math.floor(this.flickerTimer / 3) % 2 === 0;
                const t = Date.now() / 200;
                const r = this.radius;
                const enrage = this.abyssEnraged;

                // 外层黑洞吸收光环（向内旋转）
                ctx.save();
                ctx.rotate(-t * 0.3);
                const blackHole = ctx.createRadialGradient(0, 0, r*0.3, 0, 0, r*2.5);
                blackHole.addColorStop(0, enrage ? 'rgba(80,0,120,0)' : 'rgba(40,0,80,0)');
                blackHole.addColorStop(0.4, enrage ? 'rgba(120,0,180,0.3)' : 'rgba(80,0,140,0.25)');
                blackHole.addColorStop(0.7, enrage ? 'rgba(60,0,100,0.4)' : 'rgba(40,0,80,0.35)');
                blackHole.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = blackHole;
                ctx.beginPath();
                ctx.arc(0, 0, r*2.5, 0, Math.PI*2);
                ctx.fill();
                ctx.restore();

                // 紫黑色旋转环
                ctx.save();
                ctx.rotate(t * 0.4);
                ctx.strokeStyle = enrage ? 'rgba(255,100,255,0.5)' : 'rgba(180,80,255,0.5)';
                ctx.lineWidth = 2;
                ctx.setLineDash([12, 6]);
                ctx.beginPath();
                ctx.arc(0, 0, r + 15, 0, Math.PI*2);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.restore();

                // 反向旋转环
                ctx.save();
                ctx.rotate(-t * 0.6);
                ctx.strokeStyle = enrage ? 'rgba(255,150,255,0.4)' : 'rgba(150,100,255,0.4)';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(0, 0, r + 25, 0, Math.PI*2);
                ctx.stroke();
                ctx.restore();

                // 漂浮时间符文（6/10个）
                const fragCount = enrage ? 10 : 6;
                const fragRot = t;
                for (let i = 0; i < fragCount; i++) {
                    const a = (i / fragCount) * Math.PI * 2 + fragRot;
                    const fr = r + 22;
                    const fx = Math.cos(a) * fr;
                    const fy = Math.sin(a) * fr;
                    ctx.save();
                    ctx.translate(fx, fy);
                    ctx.rotate(a + t);
                    // 符文三角形
                    ctx.fillStyle = enrage ? '#ff66ff' : this.edgeColor;
                    ctx.shadowColor = this.edgeColor;
                    ctx.shadowBlur = 12;
                    ctx.globalAlpha = 0.8;
                    ctx.beginPath();
                    ctx.moveTo(0, -6);
                    ctx.lineTo(10, 0);
                    ctx.lineTo(0, 6);
                    ctx.closePath();
                    ctx.fill();
                    // 内部眼
                    ctx.fillStyle = '#000';
                    ctx.beginPath();
                    ctx.arc(3, 0, 2, 0, Math.PI*2);
                    ctx.fill();
                    ctx.restore();
                }
                ctx.shadowBlur = 0;

                // 主体裂隙（黑色背景+紫色裂痕）
                const bodyGrad = ctx.createRadialGradient(0, -r*0.3, r*0.2, 0, 0, r);
                bodyGrad.addColorStop(0, flicker ? '#ffffff' : (enrage ? '#330055' : '#220044'));
                bodyGrad.addColorStop(0.5, flicker ? '#ffffff' : this.color);
                bodyGrad.addColorStop(1, flicker ? '#ffffff' : '#0a0010');
                ctx.fillStyle = bodyGrad;
                ctx.globalAlpha = 0.92;
                ctx.shadowColor = enrage ? '#ff00ff' : '#6600cc';
                ctx.shadowBlur = 35;
                ctx.beginPath();
                ctx.arc(0, 0, r, 0, Math.PI*2);
                ctx.fill();
                ctx.shadowBlur = 0;

                // 紫黑裂痕（主体上的时空裂隙）
                ctx.save();
                ctx.rotate(t * 0.2);
                ctx.strokeStyle = enrage ? 'rgba(255,100,255,0.8)' : 'rgba(180,80,255,0.8)';
                ctx.lineWidth = 2;
                for (let i = 0; i < 5; i++) {
                    const ang = (i/5)*Math.PI*2 + t*0.3;
                    ctx.beginPath();
                    ctx.moveTo(Math.cos(ang)*r*0.3, Math.sin(ang)*r*0.3);
                    ctx.lineTo(Math.cos(ang)*r*0.85, Math.sin(ang)*r*0.85);
                    ctx.stroke();
                }
                // 垂直闪电
                ctx.strokeStyle = enrage ? 'rgba(255,255,255,0.7)' : 'rgba(200,150,255,0.5)';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(0, -r*0.7);
                    for (let i = 0; i < 4; i++) {
                        ctx.lineTo((Math.random()-0.5)*8, -r*0.5 + i*r*0.3);
                    }
                ctx.lineTo(0, r*0.7);
                ctx.stroke();
                ctx.restore();

                // ===== 几何中心（无五官）：3层旋转嵌套 =====
                // 第一层：旋转八角形
                ctx.save();
                ctx.rotate(t * 0.5);
                ctx.fillStyle = enrage ? 'rgba(180, 0, 255, 0.3)' : 'rgba(120, 0, 200, 0.3)';
                ctx.strokeStyle = enrage ? 'rgba(255, 100, 255, 0.8)' : 'rgba(180, 100, 255, 0.8)';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                for (let i = 0; i < 8; i++) {
                    const a = i * Math.PI / 4;
                    const px = Math.cos(a) * r * 0.6;
                    const py = Math.sin(a) * r * 0.6;
                    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                }
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                ctx.restore();
                // 第二层：旋转六芒星
                ctx.save();
                ctx.rotate(-t * 0.7);
                ctx.fillStyle = enrage ? 'rgba(255, 50, 200, 0.4)' : 'rgba(200, 100, 255, 0.4)';
                ctx.shadowColor = enrage ? '#ff00ff' : '#aa00ff';
                ctx.shadowBlur = 18;
                for (let i = 0; i < 6; i++) {
                    const a = i * Math.PI / 3;
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45);
                    ctx.lineTo(Math.cos(a + Math.PI/6) * r * 0.18, Math.sin(a + Math.PI/6) * r * 0.18);
                    ctx.closePath();
                    ctx.fill();
                }
                ctx.restore();
                // 第三层：中心旋转核心（替代眼睛）
                ctx.save();
                ctx.rotate(t * 1.2);
                const coreR = r * 0.22;
                const coreG = ctx.createRadialGradient(0, 0, 0, 0, 0, coreR);
                coreG.addColorStop(0, enrage ? '#ffffff' : '#ffccff');
                coreG.addColorStop(0.6, enrage ? '#ff88ff' : '#cc66ff');
                coreG.addColorStop(1, enrage ? '#ff00ff' : '#6600cc');
                ctx.fillStyle = coreG;
                ctx.shadowColor = enrage ? '#ff00ff' : '#aa00ff';
                ctx.shadowBlur = 25;
                ctx.beginPath();
                ctx.arc(0, 0, coreR, 0, Math.PI*2);
                ctx.fill();
                ctx.shadowBlur = 0;
                // 4道辐射光线
                ctx.strokeStyle = enrage ? 'rgba(255, 200, 255, 0.7)' : 'rgba(220, 180, 255, 0.7)';
                ctx.lineWidth = 1.5;
                for (let i = 0; i < 4; i++) {
                    const a = i * Math.PI / 2;
                    ctx.beginPath();
                    ctx.moveTo(Math.cos(a) * coreR * 0.8, Math.sin(a) * coreR * 0.8);
                    ctx.lineTo(Math.cos(a) * coreR * 2.5, Math.sin(a) * coreR * 2.5);
                    ctx.stroke();
                }
                ctx.restore();

                // 6道帝王光芒（紫色）
                for (let i = 0; i < 6; i++) {
                    const a = i * Math.PI / 3 + t * 0.4;
                    ctx.strokeStyle = `rgba(${enrage ? '255,80,255' : '180,100,255'}, ${0.5 + Math.sin(t*2 + i) * 0.3})`;
                    ctx.lineWidth = 2;
                    ctx.shadowColor = enrage ? '#ff00ff' : '#aa00ff';
                    ctx.shadowBlur = 10;
                    ctx.beginPath();
                    ctx.moveTo(Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6);
                    ctx.lineTo(Math.cos(a) * r * 1.15, Math.sin(a) * r * 1.15);
                    ctx.stroke();
                }

                // 标签（英文更长时自适应缩小，避免溢出本体圆形）
                ctx.globalAlpha = 1;
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.shadowColor = '#000';
                ctx.shadowBlur = 6;
                let bossFontPx = 18;
                ctx.font = `bold ${bossFontPx}px sans-serif`;
                const bossLabW = ctx.measureText(this.label).width;
                const bossMaxW = r * 1.7;
                if (bossLabW > bossMaxW) bossFontPx = Math.max(9, Math.floor(bossFontPx * bossMaxW / bossLabW));
                ctx.font = `bold ${bossFontPx}px sans-serif`;
                ctx.fillText(this.label, 0, r*0.6);
                ctx.restore();

                // 血条
                const hpW = 100, hpH = 8;
                ctx.fillStyle = '#333';
                ctx.fillRect(this.x - hpW/2, this.y - this.radius - 15, hpW, hpH);
                ctx.fillStyle = enrage ? '#ff66ff' : '#88ccff';
                ctx.fillRect(this.x - hpW/2, this.y - this.radius - 15, hpW * (this.hp / this.maxHp), hpH);

                // 蓄力预警
                this.drawAbyssChargeWarning();
                // 技能特效
                this.drawAbyssSkillEffects();
            }

            // ===== 蓄力预警 =====
            drawAbyssChargeWarning() {
                if (this.abyssSkillCharge <= 0) return;
                const chargePct = 1 - (this.abyssSkillCharge / 120);
                const pulse = Math.sin(Date.now() / 80) * 0.3 + 0.7;

                ctx.save();
                if (this.abyssSkill === 'laser') {
                    // 显示全部 8 条激光预警：1主激光 + 7侧黑激光（与实际发射完全一致）
                    const dirX = this.chargeTargetX - this.x, dirY = this.chargeTargetY - this.y;
                    const len = Math.sqrt(dirX*dirX+dirY*dirY) || 1;
                    const mainAngle = Math.atan2(dirY, dirX);
                    // 8条角度：主激光 + 7条侧黑激光（左右交错分布，间隔 Math.PI/7）
                    const angles = [mainAngle];
                    for (let i = 1; i <= 7; i++) {
                        const sign = (i % 2 === 0) ? 1 : -1;
                        const slot = Math.ceil(i / 2);
                        angles.push(mainAngle + (Math.PI / 7) * slot * sign);
                    }
                    for (let i = 0; i < angles.length; i++) {
                        const ang = angles[i];
                        const isMain = i === 0;  // 第1条为主激光
                        ctx.globalAlpha = 0.15 + chargePct * 0.6;
                        if (isMain) {
                            ctx.strokeStyle = '#88ccff';
                            ctx.lineWidth = 4 + chargePct * 12;
                            ctx.shadowColor = '#88ccff';
                            ctx.shadowBlur = 30;
                        } else {
                            ctx.strokeStyle = '#1a0033';
                            ctx.lineWidth = 2 + chargePct * 8;
                            ctx.shadowColor = '#6600cc';
                            ctx.shadowBlur = 25;
                        }
                        ctx.setLineDash([10, 6]);
                        ctx.beginPath();
                        ctx.moveTo(this.x, this.y);
                        ctx.lineTo(this.x + Math.cos(ang) * 800, this.y + Math.sin(ang) * 800);
                        ctx.stroke();
                    }
                    ctx.setLineDash([]);
                } else if (this.abyssSkill === 'bomb') {
                    // 炸弹落点警告圈
                    ctx.globalAlpha = 0.2 + chargePct * 0.5;
                    ctx.strokeStyle = '#4a0080';
                    ctx.lineWidth = 2 + chargePct * 4;
                    ctx.shadowColor = '#4a0080';
                    ctx.shadowBlur = 25;
                    ctx.setLineDash([6, 6]);
                    const r = 30 + chargePct * 60;
                    ctx.beginPath();
                    ctx.arc(this.chargeTargetX, this.chargeTargetY, r, 0, Math.PI*2);
                    ctx.stroke();
                    ctx.fillStyle = `rgba(74,0,128,${0.08 + chargePct*0.15})`;
                    ctx.fill();
                    ctx.setLineDash([]);
                } else if (this.abyssSkill === 'teleport') {
                    // 传送目标处旋转方形
                    ctx.save();
                    ctx.translate(this.chargeTargetX, this.chargeTargetY);
                    ctx.rotate(Date.now() / 300);
                    ctx.globalAlpha = (0.2 + chargePct * 0.5) * pulse;
                    ctx.strokeStyle = '#88ccff';
                    ctx.lineWidth = 3 + chargePct * 3;
                    ctx.shadowColor = '#88ccff';
                    ctx.shadowBlur = 25;
                    const sz = 25 + chargePct * 25;
                    ctx.strokeRect(-sz, -sz, sz*2, sz*2);
                    ctx.strokeRect(-sz*0.7, -sz*0.7, sz*1.4, sz*1.4);
                    ctx.restore();
                } else if (this.abyssSkill === 'grow') {
                    // 巨化预警：膨胀圆
                    ctx.globalAlpha = (0.2 + chargePct * 0.5) * pulse;
                    ctx.strokeStyle = '#aa00ff';
                    ctx.lineWidth = 3 + chargePct * 4;
                    ctx.shadowColor = '#aa00ff';
                    ctx.shadowBlur = 30;
                    ctx.beginPath();
                    ctx.arc(this.x, this.y, this.radius * (1 + chargePct), 0, Math.PI*2);
                    ctx.stroke();
                } else if (this.abyssSkill === 'timeFreeze') {
                    // 时空静止预警：全屏黑白闪烁
                    ctx.globalAlpha = (0.1 + chargePct * 0.3) * pulse;
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(this.x - 500, this.y - 500, 1000, 1000);
                } else if (this.abyssSkill === 'summonElite') {
                    // 召唤预警：紫色旋转圈
                    ctx.globalAlpha = (0.2 + chargePct * 0.5) * pulse;
                    ctx.strokeStyle = '#aa00ff';
                    ctx.lineWidth = 3 + chargePct * 3;
                    ctx.shadowColor = '#aa00ff';
                    ctx.shadowBlur = 25;
                    ctx.beginPath();
                    ctx.arc(this.x, this.y, this.radius + 60 + chargePct * 30, 0, Math.PI*2);
                    ctx.stroke();
                }
                ctx.restore();
            }

            // ===== 技能执行中特效 =====
            drawAbyssSkillEffects() {
                const hero = coopTarget(this);
                if (!this.abyssSkillData) return;
                // 韩非「雾隐」期间：冥渊技能效果（视觉+伤害+life递减）完全暂停，
                // 符合"所有敌人静止"设定，避免draw()绕过update()冻结检查导致雾隐中被打中
                if (heroFreezeTimer > 0) return;

                if (this.abyssSkillData.type === 'laser') {
                    const ld = this.abyssSkillData;
                    ld.life--;
                    const lifeRatio = Math.max(0, ld.life / ld.maxLife);
                    // 主激光（粗亮青蓝）+ 7侧黑激光（细深紫）
                    for (let i = 0; i < ld.angles.length; i++) {
                        const ang = ld.angles[i];
                        const isMain = i === 0;  // 第一条是主激光
                        const dx = Math.cos(ang), dy = Math.sin(ang);
                        const endX = ld.x + dx * 1500;
                        const endY = ld.y + dy * 1500;
                        ctx.save();
                        const layers = isMain ? [
                            { color: '#88ccff', width: (this.scale * 38) * lifeRatio, blur: 80 },
                            { color: '#4488ff', width: (this.scale * 28) * lifeRatio, blur: 60 },
                            { color: '#88ccff', width: (this.scale * 18) * lifeRatio, blur: 45 },
                            { color: '#cceeff', width: (this.scale * 8) * lifeRatio, blur: 25 },
                            { color: '#ffffff', width: (this.scale * 3) * lifeRatio, blur: 12 }
                        ] : [
                            { color: '#000000', width: (this.scale * 22) * lifeRatio, blur: 50 },
                            { color: '#1a0033', width: (this.scale * 16) * lifeRatio, blur: 40 },
                            { color: '#4a0080', width: (this.scale * 10) * lifeRatio, blur: 30 },
                            { color: '#6600cc', width: (this.scale * 4) * lifeRatio, blur: 18 }
                        ];
                        for (const layer of layers) {
                            ctx.strokeStyle = layer.color;
                            ctx.lineWidth = Math.max(1, layer.width);
                            ctx.shadowColor = layer.color;
                            ctx.shadowBlur = layer.blur;
                            ctx.beginPath();
                            ctx.moveTo(ld.x, ld.y);
                            ctx.lineTo(endX, endY);
                            ctx.stroke();
                        }
                        ctx.restore();
                        // 伤害判定（双人：两人分别判定）
                        if (this.laserHitCooldown <= 0) {
                            const laserDmg = Math.floor(this.attack * (isMain ? this._cfg.skills.laser.mainDmgMult : this._cfg.skills.laser.sideDmgMult));
                            const laserColor = isMain ? '#88ccff' : '#1a0033';
                            let laserHit = false;
                            for (const t of coopPlayerList()) {
                                if (!t || !t.alive) continue;
                                const tDist = Math.abs((t.x - ld.x) * dy - (t.y - ld.y) * dx);
                                const tDot = (t.x - ld.x) * dx + (t.y - ld.y) * dy;
                                if (tDist < 18 && tDot > 0) {
                                    heroAttackedBy(this, laserDmg, laserColor, t);
                                    laserHit = true;
                                }
                            }
                            if (laserHit) this.laserHitCooldown = 30;
                        }
                        // 注：激光不对杂兵造成伤害（用户要求：敌方之间不能互相造成伤害）
                    }
                    if (ld.life <= 0) this.abyssSkillData = null;
                } else if (this.abyssSkillData.type === 'bomb') {
                    const bd = this.abyssSkillData;
                    bd.progress += 1/60;
                    const bx = bd.x + (bd.targetX - bd.x) * bd.progress;
                    const by = bd.y + (bd.targetY - bd.y) * bd.progress + Math.sin(bd.progress*Math.PI) * -80;
                    // 拖尾
                    if (Math.random() < 0.5) {
                        abyssParticles.push({
                            type: 'burst', x: bx, y: by,
                            vx: (Math.random()-0.5)*3, vy: (Math.random()-0.5)*3,
                            life: 18, maxLife: 18, color: '#4a0080', size: 4
                        });
                    }
                    // 炸弹光球（紫黑色）
                    ctx.save();
                    const bombSize = 20 * this.scale;
                    ctx.fillStyle = '#1a0033';
                    ctx.shadowColor = '#4a0080';
                    ctx.shadowBlur = 50;
                    ctx.beginPath();
                    ctx.arc(bx, by, bombSize, 0, Math.PI*2);
                    ctx.fill();
                    ctx.fillStyle = '#88ccff';
                    ctx.shadowColor = '#88ccff';
                    ctx.shadowBlur = 30;
                    ctx.beginPath();
                    ctx.arc(bx, by, bombSize * 0.6, 0, Math.PI*2);
                    ctx.fill();
                    ctx.fillStyle = '#ffffff';
                    ctx.beginPath();
                    ctx.arc(bx, by, bombSize * 0.3, 0, Math.PI*2);
                    ctx.fill();
                    ctx.restore();
                    // 落点圈（天蓝色轮廓，原紫色在暗夜背景下看不清）
                    ctx.save();
                    ctx.globalAlpha = 0.3;
                    ctx.strokeStyle = '#00CCEE';
                    ctx.lineWidth = 2;
                    ctx.shadowColor = '#00CCEE';
                    ctx.shadowBlur = 20;
                    for (let i = 1; i <= 3; i++) {
                        ctx.globalAlpha = 0.1 + i * 0.1;
                        ctx.setLineDash([4, 8 - i*2]);
                        ctx.beginPath();
                        ctx.arc(bd.targetX, bd.targetY, (30 + bd.progress * 50 + i*20) * this.scale, 0, Math.PI*2);
                        ctx.stroke();
                    }
                    ctx.setLineDash([]);
                    ctx.restore();
                    // 落地爆炸（范围翻倍：180→360）
                    if (bd.progress >= 1.0) {
                        this.abyssSkillData = null;
                        const expRadius = 360 * this.scale;
                        abyssRings.push({ x: bd.targetX, y: bd.targetY, radius: 0, maxRadius: expRadius, life: 45, maxLife: 45, color: '#4a0080', width: 10 });
                        abyssRings.push({ x: bd.targetX, y: bd.targetY, radius: 0, maxRadius: expRadius*0.6, life: 35, maxLife: 35, color: '#88ccff', width: 6 });
                        for (let i = 0; i < 90; i++) {
                            const a = Math.random() * Math.PI * 2;
                            const spd = 2 + Math.random() * 14;
                            const colors = ['#1a0033','#4a0080','#88ccff','#000000','#ffffff'];
                            abyssParticles.push({
                                type: 'burst', x: bd.targetX, y: bd.targetY,
                                vx: Math.cos(a)*spd, vy: Math.sin(a)*spd,
                                life: 35 + Math.random()*35, maxLife: 70,
                                color: colors[Math.floor(Math.random()*colors.length)],
                                size: 3 + Math.random()*10
                            });
                        }
                        const hitR = this._cfg.skills.bomb.explosionRadius * this.scale;
                        // 炸弹爆炸：对范围内的两个玩家分别判定
                        coopHitCircle(this, Math.floor(this.attack * this._cfg.skills.bomb.dmgMult), '#88ccff', bd.targetX, bd.targetY, hitR);
                        triggerShake(true);
                    }
                }
            }
        }

        class BladeMaster {
            constructor(x, y) {
                const cfg = BOSS_CONFIG.bladeMaster; this._cfg = cfg;
                this.x = x;
                this.y = y;
                this.alive = true;
                this.type = 'blademaster';
                // 防御性：currentDifficulty fallback
                const diff = currentDifficulty || DIFFICULTY_CONFIG.hard;
                // ===== 血量乘以难度倍率（困难基准1.0） =====
                this.hp = enemyBaseHp * cfg.baseHpMult * diff.hpMult;
                this.maxHp = this.hp;
                this.attack = enemyBaseAttack * cfg.attackCalc.baseMult * cfg.attackCalc.globalMult;
                this.radius = cfg.baseRadius;
                this.baseRadius = cfg.baseRadius;
                // ===== 速度由难度配置决定（困难基准1.8） =====
                this.speed = diff.enemySpeed.boss;
                // ===== 疯狂天气：Boss血量+50%并回满 =====
                if ((enableWeather || curseNightMode || madnessNightMode) && (currentWeather === 'madness' || currentWeather === 'm_rampage')) {
                    this.maxHp = Math.floor(this.maxHp * BOSS_CONFIG.madnessWeatherHpBonus);
                    this.hp = this.maxHp;
                }
                this.color = '#4488ff';
                this.baseColor = '#4488ff';
                this.edgeColor = '#88ccff';
                this.label = _t('剑');
                this.isBoss = true;
                this.isBladeMaster = true;
                this.flashTime = 0;
                this.stunTime = 0;
                this.attackCooldown = 0;
                // 技能状态机
                this.bladeSkill = null;
                this.bladeSkillCharge = 0;
                this.bladeSkillTimer = 0;
                this.bladeSkillData = null;
                this.chargeTargetX = 0;
                this.chargeTargetY = 0;
                this.chargeDirX = 0;
                this.chargeDirY = 0;
                this.bladeEnraged = false;
                this.flickerTimer = 0;
                this.rangeBoost = false;
                this.rangeBoostTimer = 0;
                // ===== 3技能独立CD（用户要求：技能独立进行，能一起使用）=====
                this.swordCd = cfg.skills.fanBlades.cd;   // 1.3秒 扇形飞剑
                this.rainCd = cfg.skills.swordRain.cd;   // 2.6秒 飞剑雨
                this.berserkCd = cfg.skills.rangeBoost.cd; // 3.9秒 狂暴
                this.bladeCooldown = 0; // 已废弃：保留兼容
            }

            update() {
                const hero = coopTarget(this);
                if (!this.alive || !hero || !hero.alive) return;
                if (this.flashTime > 0) this.flashTime--;
                if (this.flickerTimer > 0) this.flickerTimer--;
                if (this.stunTime > 0) { this.stunTime--; return; }
                if (timeFrozen || heroFreezeTimer > 0) return;

                if (!this.bladeEnraged && this.hp < this.maxHp * this._cfg.enrageHpThreshold) {
                    this.bladeEnraged = true;
                    this.color = '#ddeeff';
                    this.edgeColor = '#ffffff';
                    // 狂暴瞬间三层剑气爆发环
                    bladeRings.push({ x: this.x, y: this.y, radius: 0, maxRadius: 380, life: 45, maxLife: 45, color: '#ffffff', width: 10 });
                    bladeRings.push({ x: this.x, y: this.y, radius: 0, maxRadius: 280, life: 35, maxLife: 35, color: '#88ccff', width: 7 });
                    bladeRings.push({ x: this.x, y: this.y, radius: 0, maxRadius: 180, life: 25, maxLife: 25, color: '#4488ff', width: 5 });
                    for (let i = 0; i < 55; i++) {
                        const a = Math.random() * Math.PI * 2;
                        bladeParticles.push({
                            type: 'burst', x: this.x, y: this.y,
                            vx: Math.cos(a) * (3 + Math.random() * 8),
                            vy: Math.sin(a) * (3 + Math.random() * 8),
                            life: 45 + Math.random()*20, maxLife: 65,
                            color: ['#ffffff','#cceeff','#88ccff','#4488ff'][Math.floor(Math.random()*4)],
                            size: 5 + Math.random()*7
                        });
                    }
                    triggerShake(true);
                }
                const cdMult = this.bladeEnraged ? this._cfg.enrageCdMult : 1; // 狂暴时1.3秒→0.8秒（速度x1.625）

                // 普攻强化倒计时
                if (this.rangeBoostTimer > 0) {
                    this.rangeBoostTimer--;
                    if (this.rangeBoostTimer <= 0) {
                        this.rangeBoost = false;
                        this.radius = this.baseRadius;
                    }
                }

                // ===== 3技能独立CD倒数 =====
                this.swordCd = Math.max(0, this.swordCd - cdMult);
                this.rainCd = Math.max(0, this.rainCd - cdMult);
                this.berserkCd = Math.max(0, this.berserkCd - cdMult);

                // 正在执行技能
                if (this.bladeSkill) {
                    if (this.bladeSkillCharge > 0) {
                        this.bladeSkillCharge -= cdMult;
                        if (this.bladeSkillCharge <= 0) {
                            this.bladeSkillCharge = 0;
                            this.executeBladeSkill();
                        }
                    }
                    this.bladeSkillTimer -= cdMult;
                    if (this.bladeSkillTimer <= 0) {
                        this.bladeSkillData = null;
                        this.bladeSkill = null;
                    }
                    // 蓄力期间仍然缓慢移动（技能4传送除外）
                    if (this.bladeSkill !== 'teleport') this.moveTowardHero(this._cfg.chargeSpeedMult);
                    // 技能执行期间仍保持普通攻击（不return阻断）
                } else {
                    // 非技能期间全速追击玩家
                    this.moveTowardHero(this._cfg.moveSpeedMult);
                }

                // 普通攻击（接触伤害），技能期间与非技能期间都可用
                const dx = hero.x - this.x, dy = hero.y - this.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                const atkRange = this.radius + this._cfg.attackRangeExtra;
                if (this.attackCooldown > 0) this.attackCooldown--;
                if (dist < atkRange && this.attackCooldown <= 0 && this.bladeSkillCharge <= 0) {
                    this.attackCooldown = this.bladeEnraged ? this._cfg.attackCooldownEnraged : this._cfg.attackCooldownNormal;
                    heroAttackedBy(this, this.attack, '#4488ff', hero);
                }
                // 碰撞分离
                const minDist = this.radius + this._cfg.pushDistanceExtra;
                if (dist < minDist && dist > 0.1) {
                    const pushX = (this.x - hero.x) / dist;
                    const pushY = (this.y - hero.y) / dist;
                    hero.x = Math.max(30, Math.min(MAP_WIDTH-30, hero.x - pushX * (minDist - dist)));
                    hero.y = Math.max(30, Math.min(MAP_HEIGHT-100, hero.y - pushY * (minDist - dist)));
                }

                this.x = Math.max(40, Math.min(MAP_WIDTH - 40, this.x));
                this.y = Math.max(40, Math.min(MAP_HEIGHT - 120, this.y));

                // 独立CD：选一个CD<=0的技能立即触发
                if (!this.bladeSkill) this.pickBladeSkill();
            }

            moveTowardHero(spdMult) {
                const hero = coopTarget(this);
                const dx = hero.x - this.x, dy = hero.y - this.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist > this._cfg.chaseDistThreshold) {
                    const ws = (enableWeather || curseNightMode || madnessNightMode) ? weatherEnemySpeedMult : 1;
                    this.x += (dx/dist) * this.speed * spdMult * ws;
                    this.y += (dy/dist) * this.speed * spdMult * ws;
                }
            }

            pickBladeSkill() {
                const hero = coopTarget(this);
                // ===== 6技能独立CD：从所有CD<=0的技能中随机选一个 =====
                // 扇形飞剑、飞剑雨、普攻强化(原berserk)、传送、直剑、召唤
                const available = [];
                if (this.swordCd <= 0) available.push('fanBlades');
                if (this.rainCd <= 0) available.push('swordRain');
                if (this.berserkCd <= 0) available.push('rangeBoost');
                // 传送、直剑、召唤用 bladeCooldown 或其他 CD
                if (this.bladeCooldown <= 0) available.push('teleport', 'directBlade', 'summon');
                if (available.length === 0) return; // 没有可用技能

                const skill = available[Math.floor(Math.random() * available.length)];
                this.bladeSkill = skill;
                this.bladeSkillCharge = 120; // 2秒蓄力
                this.bladeSkillTimer = 120;
                this.bladeSkillData = {};

                this.chargeTargetX = hero.x;
                this.chargeTargetY = hero.y;
                const dx = hero.x - this.x, dy = hero.y - this.y;
                const dlen = Math.sqrt(dx*dx + dy*dy) || 1;
                this.chargeDirX = dx / dlen;
                this.chargeDirY = dy / dlen;

                if (skill === 'fanBlades') {
                    this.swordCd = this._cfg.skills.fanBlades.cd; // 重置该技能CD
                    // 8方向等距飞剑（贯穿全图）—— 不再随机
                    const angles = [];
                    for (let i = 0; i < this._cfg.skills.fanBlades.directionCount; i++) angles.push((i / this._cfg.skills.fanBlades.directionCount) * Math.PI * 2);
                    this.bladeSkillData = { angles, blades: [] };
                } else if (skill === 'swordRain') {
                    this.rainCd = this._cfg.skills.swordRain.cd;
                    // 固定15个圈（不再随机个数，不再计算地图面积）
                    const circles = [];
                    for (let i = 0; i < this._cfg.skills.swordRain.circleCount; i++) {
                        circles.push({
                            x: 80 + Math.random() * (MAP_WIDTH - 160),
                            y: 80 + Math.random() * (MAP_HEIGHT - 180),
                            r: 55 + Math.random() * 15
                        });
                    }
                    this.bladeSkillData = { circles, fallen: false };
                    this.bladeSkillTimer = 120 + 30;
                } else if (skill === 'rangeBoost') {
                    this.berserkCd = this._cfg.skills.rangeBoost.cd;
                    this.bladeSkillTimer = this._cfg.skills.rangeBoost.boostDuration; // 无投射，生效后维持
                } else if (skill === 'teleport') {
                    this.bladeCooldown = this._cfg.skills.sharedBladeCooldown;
                    this.bladeSkillData = {};
                } else if (skill === 'directBlade') {
                    this.bladeCooldown = this._cfg.skills.sharedBladeCooldown;
                    this.bladeSkillData = {};
                } else if (skill === 'summon') {
                    this.bladeCooldown = this._cfg.skills.sharedBladeCooldown;
                    const count = this._cfg.skills.summon.minCount + Math.floor(Math.random() * (this._cfg.skills.summon.maxCount - this._cfg.skills.summon.minCount + 1));
                    this.bladeSkillData = { minionCount: count };
                }
            }

            executeBladeSkill() {
                const s = this.bladeSkill;
                if (s === 'fanBlades') this.spawnFanBlades();
                else if (s === 'swordRain') this.spawnSwordRain();
                else if (s === 'rangeBoost') this.spawnRangeBoost();
                else if (s === 'teleport') this.spawnTeleport();
                else if (s === 'directBlade') this.spawnDirectBlade();
                else if (s === 'summon') this.spawnSummon();
            }

            spawnFanBlades() {
                const angles = this.bladeSkillData.angles;
                for (const a of angles) {
                    bladeParticles.push({
                        type: 'bladeProjectile',
                        x: this.x, y: this.y,
                        vx: Math.cos(a) * this._cfg.skills.fanBlades.speed, vy: Math.sin(a) * this._cfg.skills.fanBlades.speed,
                        life: this._cfg.skills.fanBlades.life, maxLife: this._cfg.skills.fanBlades.life,  // 贯穿全图（speed=14, MAP≈2000，需要>143帧）
                        angle: a, color: this.bladeEnraged ? '#ddeeff' : '#4488ff', trail: [],
                        damage: this.attack * this._cfg.skills.fanBlades.dmgMult,
                        hitCooldown: 0,
                        piercing: true  // 标记为贯穿型
                    });
                }
                bladeRings.push({ x: this.x, y: this.y, radius: 0, maxRadius: 220, life: 25, maxLife: 25, color: this.bladeEnraged ? '#ffffff' : '#4488ff', width: 6 });
                triggerShake(false);
            }

            spawnSwordRain() {
                const hero = coopTarget(this);
                this.bladeSkillData.fallen = true;
                // 每个红圈位置落地一把大剑
                for (const c of this.bladeSkillData.circles) {
                    bladeParticles.push({
                        type: 'bladeStrike',
                        x: c.x, y: c.y, radius: c.r,
                        life: 20, maxLife: 20, color: '#66aaff'
                    });
                    // 伤害判定：每个红圈对范围内的两个玩家分别判定
                    coopHitCircle(this, this.attack * this._cfg.skills.swordRain.dmgMult, '#4488ff', c.x, c.y, c.r + 20);
                }
                triggerShake(true);
            }

            spawnRangeBoost() {
                this.rangeBoost = true;
                this.rangeBoostTimer = this._cfg.skills.rangeBoost.boostDuration; // 2秒
                this.radius = this.baseRadius * this._cfg.skills.rangeBoost.radiusMult;
                bladeRings.push({ x: this.x, y: this.y, radius: 0, maxRadius: this.baseRadius * 3 + 20, life: 30, maxLife: 30, color: '#44aaff', width: 6 });
                for (let i = 0; i < 20; i++) {
                    const a = (i/20)*Math.PI*2;
                    bladeParticles.push({
                        type: 'burst', x: this.x + Math.cos(a)*this.baseRadius*3, y: this.y + Math.sin(a)*this.baseRadius*3,
                        vx: 0, vy: 0, life: 40, maxLife: 40, color: '#66aaff', size: 5
                    });
                }
                triggerShake(false);
            }

            spawnTeleport() {
                // 原地消失特效
                for (let i = 0; i < 20; i++) {
                    const a = Math.random() * Math.PI * 2;
                    bladeParticles.push({
                        type: 'burst', x: this.x, y: this.y,
                        vx: Math.cos(a)*3, vy: Math.sin(a)*3,
                        life: 25, maxLife: 25, color: '#88ccff', size: 5
                    });
                }
                bladeRings.push({ x: this.x, y: this.y, radius: 0, maxRadius: 70, life: 18, maxLife: 18, color: '#4488ff', width: 4 });
                // 传送到蓄力开始时玩家位置（保持安全距离）
                const dx = this.chargeTargetX - this.x, dy = this.chargeTargetY - this.y;
                const dlen = Math.sqrt(dx*dx + dy*dy) || 1;
                let nx = this.chargeTargetX - (dx/dlen)*60;
                let ny = this.chargeTargetY - (dy/dlen)*60;
                nx = Math.max(50, Math.min(MAP_WIDTH-50, nx));
                ny = Math.max(50, Math.min(MAP_HEIGHT-130, ny));
                this.x = nx; this.y = ny;
                // 出现特效
                bladeRings.push({ x: this.x, y: this.y, radius: 0, maxRadius: 80, life: 22, maxLife: 22, color: '#88ccff', width: 5 });
                for (let i = 0; i < 25; i++) {
                    const a = Math.random() * Math.PI * 2;
                    bladeParticles.push({
                        type: 'burst', x: this.x, y: this.y,
                        vx: Math.cos(a)*4, vy: Math.sin(a)*4,
                        life: 30, maxLife: 30, color: '#aaddff', size: 6
                    });
                }
                triggerShake(true);
            }

            spawnDirectBlade() {
                bladeParticles.push({
                    type: 'giantBlade',
                    x: this.x, y: this.y,
                    vx: this.chargeDirX * 14, vy: this.chargeDirY * 14,
                    life: 180, maxLife: 180,
                    angle: Math.atan2(this.chargeDirY, this.chargeDirX),
                    color: '#4488ff', trail: [],
                    damage: this.attack * this._cfg.skills.directBlade.dmgMult,
                    hitCooldown: 0
                });
                bladeRings.push({ x: this.x, y: this.y, radius: 0, maxRadius: 120, life: 20, maxLife: 20, color: '#66aaff', width: 5 });
                triggerShake(true);
            }

            spawnSummon() {
                const count = this.bladeSkillData.minionCount;
                for (let i = 0; i < count; i++) {
                    const a = Math.random() * Math.PI * 2;
                    const r = this.radius + 40 + Math.random() * 80;
                    const ex = this.x + Math.cos(a) * r;
                    const ey = this.y + Math.sin(a) * r;
                    const newE = new Enemy(
                        Math.max(30, Math.min(MAP_WIDTH-30, ex)),
                        Math.max(30, Math.min(MAP_HEIGHT-100, ey)),
                        'normal'
                    );
                    enemies.push(newE);
                }
                bladeRings.push({ x: this.x, y: this.y, radius: 0, maxRadius: 200, life: 28, maxLife: 28, color: '#4488ff', width: 5 });
                for (let i = 0; i < count * 3; i++) {
                    const a = Math.random() * Math.PI * 2;
                    bladeParticles.push({
                        type: 'burst', x: this.x, y: this.y,
                        vx: Math.cos(a)*4, vy: Math.sin(a)*4,
                        life: 25, maxLife: 25, color: '#88ccff', size: 4
                    });
                }
            }

            // ===== 蓄力预警绘制 =====
            drawChargeWarning() {
                if (!this.bladeSkill || this.bladeSkillCharge <= 0) return;
                const ch = this.bladeSkillCharge;
                const alpha = 0.3 + 0.4 * Math.sin(ch * 0.2);
                ctx.save();

                if (this.bladeSkill === 'fanBlades') {
                    // 6个方向弹道指示线
                    const angles = this.bladeSkillData.angles;
                    ctx.strokeStyle = `rgba(68,136,255,${alpha})`;
                    ctx.lineWidth = 3;
                    ctx.shadowColor = '#4488ff';
                    ctx.shadowBlur = 10;
                    for (const a of angles) {
                        ctx.beginPath();
                        ctx.moveTo(this.x + Math.cos(a) * 50, this.y + Math.sin(a) * 50);
                        ctx.lineTo(this.x + Math.cos(a) * 250, this.y + Math.sin(a) * 250);
                        ctx.stroke();
                    }
                } else if (this.bladeSkill === 'swordRain') {
                    // 红圈预警
                    for (const c of this.bladeSkillData.circles) {
                        ctx.strokeStyle = `rgba(255,60,60,${alpha})`;
                        ctx.fillStyle = `rgba(255,60,60,${alpha * 0.15})`;
                        ctx.lineWidth = 2;
                        ctx.beginPath();
                        ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.stroke();
                        // 十字标记
                        ctx.beginPath();
                        ctx.moveTo(c.x - 10, c.y); ctx.lineTo(c.x + 10, c.y);
                        ctx.moveTo(c.x, c.y - 10); ctx.lineTo(c.x, c.y + 10);
                        ctx.stroke();
                    }
                } else if (this.bladeSkill === 'rangeBoost') {
                    // 蓝色普攻范围圈预览
                    const r = this.baseRadius * 3;
                    ctx.strokeStyle = `rgba(68,170,255,${alpha})`;
                    ctx.fillStyle = `rgba(68,170,255,${alpha * 0.1})`;
                    ctx.lineWidth = 3;
                    ctx.shadowColor = '#44aaff';
                    ctx.shadowBlur = 15;
                    ctx.beginPath();
                    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
                } else if (this.bladeSkill === 'teleport') {
                    // 目标位置标记
                    ctx.strokeStyle = `rgba(136,204,255,${alpha})`;
                    ctx.lineWidth = 3;
                    ctx.shadowColor = '#88ccff';
                    ctx.shadowBlur = 12;
                    ctx.beginPath();
                    ctx.arc(this.chargeTargetX, this.chargeTargetY, 40, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(this.chargeTargetX - 15, this.chargeTargetY); ctx.lineTo(this.chargeTargetX + 15, this.chargeTargetY);
                    ctx.moveTo(this.chargeTargetX, this.chargeTargetY - 15); ctx.lineTo(this.chargeTargetX, this.chargeTargetY + 15);
                    ctx.stroke();
                } else if (this.bladeSkill === 'directBlade') {
                    // 方向弹道线
                    ctx.strokeStyle = `rgba(68,136,255,${alpha})`;
                    ctx.lineWidth = 4;
                    ctx.shadowColor = '#4488ff';
                    ctx.shadowBlur = 15;
                    ctx.beginPath();
                    ctx.moveTo(this.x + this.chargeDirX * 50, this.y + this.chargeDirY * 50);
                    ctx.lineTo(this.x + this.chargeDirX * 400, this.y + this.chargeDirY * 400);
                    ctx.stroke();
                }
                ctx.restore();
            }

            draw() {
                if (!this.alive) return;
                const t = Date.now() / 200;

                // 普攻强化蓝光特效
                if (this.rangeBoost) {
                    ctx.save();
                    const pulse = Math.sin(Date.now() * 0.008) * 0.3 + 0.7;
                    ctx.globalAlpha = 0.25 * pulse;
                    ctx.fillStyle = '#44aaff';
                    ctx.shadowColor = '#44aaff';
                    ctx.shadowBlur = 30;
                    ctx.beginPath();
                    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                }

                ctx.save();
                ctx.translate(this.x, this.y);
                const r = this.radius;
                const enrage = this.bladeEnraged;

                // 外层蓝色剑气光晕
                const halo = ctx.createRadialGradient(0, 0, r*0.5, 0, 0, r*2.2);
                halo.addColorStop(0, enrage ? 'rgba(255,255,255,0.4)' : 'rgba(68,170,255,0.4)');
                halo.addColorStop(0.5, enrage ? 'rgba(180,220,255,0.25)' : 'rgba(68,136,255,0.2)');
                halo.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = halo;
                ctx.beginPath();
                ctx.arc(0, 0, r*2.2, 0, Math.PI*2);
                ctx.fill();

                // 旋转剑气环
                ctx.save();
                ctx.rotate(t * 0.5);
                ctx.strokeStyle = enrage ? 'rgba(255,255,255,0.6)' : 'rgba(68,170,255,0.6)';
                ctx.lineWidth = 2;
                ctx.setLineDash([10, 5]);
                ctx.beginPath();
                ctx.arc(0, 0, r + 12, 0, Math.PI*2);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.restore();

                // 6把悬浮飞剑
                const swordCount = enrage ? 8 : 6;
                for (let i = 0; i < swordCount; i++) {
                    const a = (i/swordCount)*Math.PI*2 + t*0.4;
                    const sd = r + 22;
                    const sx = Math.cos(a) * sd;
                    const sy = Math.sin(a) * sd;
                    ctx.save();
                    ctx.translate(sx, sy);
                    ctx.rotate(a + Math.PI/2);
                    // 剑刃
                    ctx.fillStyle = enrage ? '#ffffff' : '#88ccff';
                    ctx.shadowColor = enrage ? '#ffffff' : '#4488ff';
                    ctx.shadowBlur = 12;
                    ctx.beginPath();
                    ctx.moveTo(0, -10);
                    ctx.lineTo(3, 4);
                    ctx.lineTo(0, 6);
                    ctx.lineTo(-3, 4);
                    ctx.closePath();
                    ctx.fill();
                    // 剑柄
                    ctx.fillStyle = '#888';
                    ctx.fillRect(-1.5, 4, 3, 4);
                    ctx.restore();
                }
                ctx.shadowBlur = 0;

                // 双肩剑翼（左右各3把斜向上）
                for (let side = -1; side <= 1; side += 2) {
                    for (let i = 0; i < 3; i++) {
                        const baseAng = side > 0 ? -Math.PI/4 : Math.PI - Math.PI/4;
                        const ang = baseAng + (i-1) * 0.3;
                        const ex = Math.cos(ang) * (r + 5);
                        const ey = Math.sin(ang) * (r + 5) - 8;
                        ctx.save();
                        ctx.translate(ex, ey);
                        ctx.rotate(ang);
                        ctx.fillStyle = enrage ? '#ffffff' : '#aaddff';
                        ctx.shadowColor = enrage ? '#ffffff' : '#4488ff';
                        ctx.shadowBlur = 8;
                        ctx.beginPath();
                        ctx.moveTo(0, -6);
                        ctx.lineTo(2, 3);
                        ctx.lineTo(0, 4);
                        ctx.lineTo(-2, 3);
                        ctx.closePath();
                        ctx.fill();
                        ctx.restore();
                    }
                }
                ctx.shadowBlur = 0;

                // 主体（剑身+核心）
                const bodyGrad = ctx.createRadialGradient(-r*0.3, -r*0.4, r*0.2, 0, 0, r);
                bodyGrad.addColorStop(0, enrage ? '#ffffff' : '#aaddff');
                bodyGrad.addColorStop(0.5, this.flashTime > 0 ? '#ffffff' : this.color);
                bodyGrad.addColorStop(1, enrage ? '#aaccff' : '#1a4488');
                ctx.fillStyle = bodyGrad;
                ctx.shadowColor = enrage ? '#ffffff' : this.edgeColor;
                ctx.shadowBlur = 30;
                ctx.beginPath();
                ctx.arc(0, 0, r, 0, Math.PI*2);
                ctx.fill();
                ctx.shadowBlur = 0;

                // 中心剑图标（双剑）
                ctx.fillStyle = enrage ? '#ffffff' : '#ddeeff';
                ctx.shadowColor = enrage ? '#ffffff' : '#88ccff';
                ctx.shadowBlur = 8;
                // 竖剑
                ctx.fillRect(-1.5, -r*0.5, 3, r);
                // 横剑
                ctx.fillRect(-r*0.4, -1.5, r*0.8, 3);
                // 剑柄
                ctx.fillStyle = '#888';
                ctx.fillRect(-3, -1.5, 6, 3);
                ctx.restore();

                // 血条
                this.drawHpBar();
            }

            drawHpBar() {
                const w = 80, h = 8;
                ctx.fillStyle = '#333';
                ctx.fillRect(this.x - w/2, this.y - this.radius - 20, w, h);
                ctx.fillStyle = this.bladeEnraged ? '#66aaff' : '#4488ff';
                ctx.shadowColor = this.bladeEnraged ? '#88ccff' : '#4488ff';
                ctx.shadowBlur = 8;
                ctx.fillRect(this.x - w/2, this.y - this.radius - 20, w * (this.hp / this.maxHp), h);
                ctx.shadowBlur = 0;
            }
        }

        class MadEye {
            constructor(x, y) {
                const cfg = BOSS_CONFIG.madEye; this._cfg = cfg;
                this.x = x;
                this.y = y;
                this.alive = true;
                this.type = 'madeye';
                // 防御性：currentDifficulty fallback
                const diff = currentDifficulty || DIFFICULTY_CONFIG.hard;
                // ===== 血量乘以难度倍率（困难基准1.0） =====
                this.hp = enemyBaseHp * cfg.baseHpMult * diff.hpMult;
                this.maxHp = this.hp;
                this.attack = enemyBaseAttack * cfg.attackCalc.baseMult * cfg.attackCalc.globalMult;
                this.radius = cfg.baseRadius;
                // ===== 速度由难度配置决定（困难基准1.8） =====
                this.speed = diff.enemySpeed.boss;
                // ===== 疯狂天气：Boss血量+50%并回满 =====
                if ((enableWeather || curseNightMode || madnessNightMode) && (currentWeather === 'madness' || currentWeather === 'm_rampage')) {
                    this.maxHp = Math.floor(this.maxHp * BOSS_CONFIG.madnessWeatherHpBonus);
                    this.hp = this.maxHp;
                }
                this.color = '#cc2222';
                this.label = _t('瞳');
                this.isBoss = true;
                this.isMadEye = true;
                this.flashTime = 0;
                this.stunTime = 0;
                this.attackCooldown = 0;
                // 开闭眼状态：true=睁眼(受伤可移动), false=闭眼(无敌不可移动)
                this.eyeOpen = true;
                this.eyeTimer = cfg.eyePhases.openDurations[0]; // 初始5秒睁眼（300帧）
                this.eyePhase = 0;   // 阶段计数器（0→1→2→2→2...）
                // 技能状态
                this.eyeSkill = null;
                this.eyeSkillCharge = 0;
                this.eyeSkillTimer = 0;
                this.eyeSkillData = null;
                this.chargeTargetX = 0;
                this.chargeTargetY = 0;
                this.flickerTimer = 0;
                // ===== 3技能独立CD（用户要求：技能独立进行，能一起使用）=====
                this.laserCd = cfg.skills.laser.cd;  // 睁眼2秒 激光
                this.bombCd = cfg.skills.bomb.cd;   // 2.5秒 炸弹
                this.pullCd = 180;   // 3秒 吸引
                this.eyeCooldown = 0; // 已废弃：保留兼容
            }

            update() {
                const hero = coopTarget(this);
                if (!this.alive || !hero || !hero.alive) return;
                if (this.flashTime > 0) this.flashTime--;
                if (this.flickerTimer > 0) this.flickerTimer--;
                if (this.stunTime > 0) { this.stunTime--; return; }
                if (timeFrozen || heroFreezeTimer > 0) return;

                // 开闭眼计时
                this.eyeTimer--;
                if (this.eyeTimer <= 0) {
                    this.eyeOpen = !this.eyeOpen;
                    this.eyePhase++;
                    // 间隔：初始5秒睁眼→5秒闭眼→10秒睁眼→10秒闭眼→10秒循环
                    const phaseIdx = Math.min(this.eyePhase, 3);
                    const openDurations = this._cfg.eyePhases.openDurations;
                    const closedDurations = this._cfg.eyePhases.closedDurations;
                    if (this.eyeOpen) {
                        this.eyeTimer = openDurations[Math.min(phaseIdx, 3)];
                        this.eyeCooldown = this._cfg.eyePhases.openCdBase; // 睁眼2秒CD（用户加强）
                        // 睁眼爆发特效
                        eyeRings.push({ x: this.x, y: this.y, radius: 0, maxRadius: 200, life: 25, maxLife: 25, color: '#ff2222', width: 5 });
                        for (let i = 0; i < 20; i++) {
                            const a = Math.random() * Math.PI * 2;
                            eyeParticles.push({
                                type: 'burst', x: this.x, y: this.y,
                                vx: Math.cos(a)*3, vy: Math.sin(a)*3,
                                life: 25, maxLife: 25, color: '#ff4444', size: 5
                            });
                        }
                    } else {
                        this.eyeTimer = closedDurations[Math.min(phaseIdx, 3)] || 600;
                        this.eyeCooldown = this._cfg.eyePhases.closedCdBase; // 闭眼1.5秒CD（用户加强：1.5秒=90帧）
                        // 闭眼特效（收缩光环）
                        eyeRings.push({ x: this.x, y: this.y, radius: 150, maxRadius: 150, life: 25, maxLife: 25, color: '#660000', width: 6 });
                        for (let i = 0; i < 15; i++) {
                            const a = Math.random() * Math.PI * 2;
                            eyeParticles.push({
                                type: 'burst', x: this.x + Math.cos(a)*50, y: this.y + Math.sin(a)*50,
                                vx: -Math.cos(a)*2, vy: -Math.sin(a)*2,
                                life: 20, maxLife: 20, color: '#880000', size: 4
                            });
                        }
                        // 闭眼时取消当前技能
                        this.eyeSkill = null;
                        this.eyeSkillData = null;
                        this.eyeSkillCharge = 0;
                    }
                    triggerShake(false);
                }

                const cdBase = this.eyeOpen ? this._cfg.eyePhases.openCdBase : this._cfg.eyePhases.closedCdBase;  // 睁眼2秒，闭眼1.5秒（用户加强）

                // ===== 3技能独立CD倒数（开闭眼时分别使用不同基准）=====
                if (this.eyeOpen) {
                    this.laserCd = Math.max(0, this.laserCd - 1);
                    this.bombCd = Math.max(0, this.bombCd - 1);
                    this.pullCd = Math.max(0, this.pullCd - 1);
                } else {
                    this.laserCd = Math.max(0, this.laserCd - this._cfg.eyePhases.closedCdSpeedMult);
                    this.bombCd = Math.max(0, this.bombCd - this._cfg.eyePhases.closedCdSpeedMult);
                    this.pullCd = Math.max(0, this.pullCd - this._cfg.eyePhases.closedCdSpeedMult);
                }

                // 正在执行技能
                if (this.eyeSkill) {
                    if (this.eyeSkillCharge > 0) {
                        this.eyeSkillCharge--;
                        if (this.eyeSkillCharge <= 0) {
                            this.executeEyeSkill();
                        }
                    }
                    this.eyeSkillTimer--;
                    if (this.eyeSkillTimer <= 0) {
                        this.eyeSkillData = null;
                        this.eyeSkill = null;
                    }
                    // 睁眼蓄力期间可以缓慢移动
                    if (this.eyeOpen) this.moveTowardHero(this._cfg.chargeSpeedMult);
                    // 技能执行期间仍保持普通攻击（不return阻断）
                }

                // 始终朝着英雄方向移动（不再return阻断，睁眼/闭眼均追击）
                if (this.eyeOpen) this.moveTowardHero(this._cfg.openChaseSpeedMult);
                else this.moveTowardHero(this._cfg.closedChaseSpeedMult);

                // 碰撞分离（睁眼时接触伤害）
                const dx = hero.x - this.x, dy = hero.y - this.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                const minDist = this.radius + this._cfg.pushDistanceExtra;
                if (this.eyeOpen && dist < minDist && dist > 0.1) {
                    const pushX = (this.x - hero.x) / dist;
                    const pushY = (this.y - hero.y) / dist;
                    hero.x = Math.max(30, Math.min(MAP_WIDTH-30, hero.x - pushX * (minDist - dist)));
                    hero.y = Math.max(30, Math.min(MAP_HEIGHT-100, hero.y - pushY * (minDist - dist)));
                }

                if (this.attackCooldown > 0) this.attackCooldown--;
                // 睁眼时普攻：参考帝君普攻伤害 = this.attack * 1.5
                if (this.eyeOpen && dist < this.radius + this._cfg.attackRangeExtra && this.attackCooldown <= 0 && this.eyeSkillCharge <= 0) {
                    this.attackCooldown = this._cfg.attackCooldown;
                    heroAttackedBy(this, Math.floor(this.attack * this._cfg.attackDmgMult), '#ff2222', hero);
                }

                this.x = Math.max(50, Math.min(MAP_WIDTH - 50, this.x));
                this.y = Math.max(50, Math.min(MAP_HEIGHT - 120, this.y));

                // 独立CD：选一个CD<=0的技能立即触发
                if (!this.eyeSkill) this.pickEyeSkill();
            }

            moveTowardHero(spdMult) {
                const hero = coopTarget(this);
                const dx = hero.x - this.x, dy = hero.y - this.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist > this._cfg.chaseDistThreshold) {
                    const ws = (enableWeather || curseNightMode || madnessNightMode) ? weatherEnemySpeedMult : 1;
                    this.x += (dx/dist) * this.speed * spdMult * ws;
                    this.y += (dy/dist) * this.speed * spdMult * ws;
                }
            }

            pickEyeSkill() {
                const hero = coopTarget(this);
                // ===== 独立CD：从所有CD<=0的技能中随机选一个 =====
                const available = [];
                if (this.eyeOpen) {
                    // 睁眼4技能
                    if (this.bombCd <= 0) available.push('bombs');
                    if (this.eyeCooldown <= 0) available.push('summonNormal', 'summonElite', 'summonKing');
                } else {
                    // 闭眼4技能
                    if (this.laserCd <= 0) available.push('laserRed', 'laserPurple');
                    if (this.bombCd <= 0) available.push('bombRed', 'bombPurple');
                }
                if (available.length === 0) return; // 没有可用技能

                const skill = available[Math.floor(Math.random() * available.length)];
                this.eyeSkill = skill;
                this.eyeSkillCharge = 120;
                this.eyeSkillTimer = 120;
                this.eyeSkillData = {};
                this.chargeTargetX = hero.x;
                this.chargeTargetY = hero.y;

                if (skill === 'laserRed' || skill === 'laserPurple') {
                    this.laserCd = this._cfg.skills.laser.cd; // 重置该技能CD
                    this.eyeSkillData = { angles: [] };
                    for (let i = 0; i < this._cfg.skills.laser.directionCount; i++) this.eyeSkillData.angles.push((i / this._cfg.skills.laser.directionCount) * Math.PI * 2);
                    this.eyeSkillTimer = this._cfg.skills.laser.charge + this._cfg.skills.laser.durationExtra;
                } else if (skill === 'bombs' || skill === 'bombRed' || skill === 'bombPurple') {
                    this.bombCd = this._cfg.skills.bomb.cd;
                    const positions = [{ x: this.chargeTargetX, y: this.chargeTargetY }];
                    const extraCount = this._cfg.skills.bomb.extraBombCount;
                    for (let i = 0; i < extraCount; i++) {
                        positions.push({
                            x: 80 + Math.random() * (MAP_WIDTH - 160),
                            y: 80 + Math.random() * (MAP_HEIGHT - 180)
                        });
                    }
                    this.eyeSkillData = { positions };
                    this.eyeSkillTimer = this._cfg.skills.bomb.charge + this._cfg.skills.bomb.durationExtra;
                } else if (skill === 'summonNormal') {
                    this.eyeCooldown = this._cfg.skills.summonNormal.eyeCd;
                    this.eyeSkillData = { count: this._cfg.skills.summonNormal.minCount + Math.floor(Math.random() * (this._cfg.skills.summonNormal.maxCount - this._cfg.skills.summonNormal.minCount + 1)) };
                } else if (skill === 'summonElite') {
                    this.eyeCooldown = this._cfg.skills.summonElite.eyeCd;
                    this.eyeSkillData = { count: this._cfg.skills.summonElite.count };
                } else if (skill === 'summonKing') {
                    this.eyeCooldown = this._cfg.skills.summonKing.eyeCd;
                    this.eyeSkillData = {};
                }
            }

            executeEyeSkill() {
                const s = this.eyeSkill;
                if (s === 'laserRed') this.spawnLasers('#ff2222', '#ff6666');
                else if (s === 'laserPurple') this.spawnLasers('#aa00ff', '#cc66ff');
                else if (s === 'bombs') this.spawnBombs('#ff4422', '#ff8844');
                else if (s === 'bombRed') this.spawnBombs('#ff2222', '#ff6666');
                else if (s === 'bombPurple') this.spawnBombs('#aa00ff', '#cc66ff');
                else if (s === 'summonNormal') this.spawnMinions('normal', this.eyeSkillData.count);
                else if (s === 'summonElite') this.spawnMinions('elite', this.eyeSkillData.count);
                else if (s === 'summonKing') this.spawnKing();
            }

            spawnLasers(color, edgeColor) {
                for (const a of this.eyeSkillData.angles) {
                    eyeParticles.push({
                        type: 'eyeLaser',
                        x: this.x, y: this.y,
                        dirX: Math.cos(a), dirY: Math.sin(a),
                        length: 0, maxLength: this._cfg.skills.laser.maxLength,
                        life: this._cfg.skills.laser.laserLife, maxLife: this._cfg.skills.laser.laserLife,
                        color, edgeColor
                    });
                }
                eyeRings.push({ x: this.x, y: this.y, radius: 0, maxRadius: 160, life: 22, maxLife: 22, color, width: 6 });
                triggerShake(true);
            }

            spawnBombs(color, edgeColor) {
                for (const pos of this.eyeSkillData.positions) {
                    eyeParticles.push({
                        type: 'eyeBomb',
                        x: this.x, y: this.y,
                        targetX: pos.x, targetY: pos.y,
                        progress: 0, life: this._cfg.skills.bomb.bombLife, maxLife: this._cfg.skills.bomb.bombLife,
                        color, edgeColor, exploded: false
                    });
                }
            }

            spawnMinions(type, count) {
                for (let i = 0; i < count; i++) {
                    const a = Math.random() * Math.PI * 2;
                    const r = this.radius + 50 + Math.random() * 80;
                    const ex = this.x + Math.cos(a) * r;
                    const ey = this.y + Math.sin(a) * r;
                    enemies.push(new Enemy(
                        Math.max(30, Math.min(MAP_WIDTH-30, ex)),
                        Math.max(30, Math.min(MAP_HEIGHT-100, ey)),
                        type
                    ));
                }
                eyeRings.push({ x: this.x, y: this.y, radius: 0, maxRadius: 220, life: 28, maxLife: 28, color: '#ff4444', width: 5 });
                for (let i = 0; i < 25; i++) {
                    const a = Math.random() * Math.PI * 2;
                    eyeParticles.push({
                        type: 'burst', x: this.x, y: this.y,
                        vx: Math.cos(a)*4, vy: Math.sin(a)*4,
                        life: 30, maxLife: 30, color: '#ff4444', size: 5
                    });
                }
            }

            spawnKing() {
                const kx = this.x + (Math.random() - 0.5) * 300;
                const ky = this.y + (Math.random() - 0.5) * 200;
                const king = new Enemy(
                    Math.max(50, Math.min(MAP_WIDTH-50, kx)),
                    Math.max(50, Math.min(MAP_HEIGHT-130, ky)),
                    'boss'
                );
                enemies.push(king);
                bossRefs.push(king);
                bossAlive = true; // 补上 bossAlive 标记，确保 checkWave 不会误判无boss
                eyeRings.push({ x: this.x, y: this.y, radius: 0, maxRadius: 250, life: 30, maxLife: 30, color: '#ff0066', width: 7 });
                for (let i = 0; i < 30; i++) {
                    const a = Math.random() * Math.PI * 2;
                    eyeParticles.push({
                        type: 'burst', x: this.x, y: this.y,
                        vx: Math.cos(a)*5, vy: Math.sin(a)*5,
                        life: 35, maxLife: 35, color: '#ff4488', size: 6
                    });
                }
                triggerShake(true);
            }

            drawChargeWarning() {
                if (!this.eyeSkill || this.eyeSkillCharge <= 0) return;
                const ch = this.eyeSkillCharge;
                const alpha = 0.3 + 0.4 * Math.sin(ch * 0.2);
                ctx.save();

                if (this.eyeSkill === 'laserRed') {
                    ctx.strokeStyle = `rgba(255,34,34,${alpha})`; ctx.lineWidth = 2; ctx.shadowColor = '#ff2222'; ctx.shadowBlur = 8;
                    for (const a of this.eyeSkillData.angles) {
                        ctx.beginPath();
                        ctx.moveTo(this.x + Math.cos(a)*60, this.y + Math.sin(a)*60);
                        ctx.lineTo(this.x + Math.cos(a)*500, this.y + Math.sin(a)*500);
                        ctx.stroke();
                    }
                } else if (this.eyeSkill === 'laserPurple') {
                    ctx.strokeStyle = `rgba(170,0,255,${alpha})`; ctx.lineWidth = 2; ctx.shadowColor = '#aa00ff'; ctx.shadowBlur = 8;
                    for (const a of this.eyeSkillData.angles) {
                        ctx.beginPath();
                        ctx.moveTo(this.x + Math.cos(a)*60, this.y + Math.sin(a)*60);
                        ctx.lineTo(this.x + Math.cos(a)*500, this.y + Math.sin(a)*500);
                        ctx.stroke();
                    }
                } else if (this.eyeSkill === 'bombs' || this.eyeSkill === 'bombRed' || this.eyeSkill === 'bombPurple') {
                    const c = this.eyeSkill === 'bombPurple' ? '#aa00ff' : '#ff2222';
                    ctx.strokeStyle = c.includes('aa') ? `rgba(170,0,255,${alpha})` : `rgba(255,34,34,${alpha})`;
                    ctx.fillStyle = c.includes('aa') ? `rgba(170,0,255,${alpha*0.12})` : `rgba(255,34,34,${alpha*0.12})`;
                    ctx.lineWidth = 2; ctx.shadowColor = c; ctx.shadowBlur = 8;
                    for (const pos of this.eyeSkillData.positions) {
                        ctx.beginPath(); ctx.arc(pos.x, pos.y, 45, 0, Math.PI*2); ctx.fill(); ctx.stroke();
                        ctx.beginPath(); ctx.moveTo(pos.x-10, pos.y); ctx.lineTo(pos.x+10, pos.y);
                        ctx.moveTo(pos.x, pos.y-10); ctx.lineTo(pos.x, pos.y+10); ctx.stroke();
                    }
                }
                ctx.restore();
            }

            draw() {
                if (!this.alive) return;
                ctx.save();
                ctx.translate(this.x, this.y);
                const t = Date.now() / 200;
                const r = this.radius;

                // 外层血雾光晕
                const halo = ctx.createRadialGradient(0, 0, r*0.5, 0, 0, r*2.0);
                halo.addColorStop(0, this.eyeOpen ? 'rgba(255,40,40,0.4)' : 'rgba(80,0,40,0.5)');
                halo.addColorStop(0.5, this.eyeOpen ? 'rgba(200,20,20,0.2)' : 'rgba(40,0,20,0.3)');
                halo.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = halo;
                ctx.beginPath();
                ctx.arc(0, 0, r*2.0, 0, Math.PI*2);
                ctx.fill();

                // 闭眼状态：深色眼睑+无敌护盾+眼纹X
                if (!this.eyeOpen) {
                    // 护盾环
                    const rot = t;
                    ctx.save();
                    ctx.rotate(rot);
                    ctx.strokeStyle = 'rgba(150,0,80,0.7)';
                    ctx.lineWidth = 6;
                    ctx.shadowColor = '#aa0066';
                    ctx.shadowBlur = 25;
                    ctx.setLineDash([10, 5]);
                    ctx.beginPath();
                    ctx.arc(0, 0, r + 15, 0, Math.PI*2);
                    ctx.stroke();
                    ctx.setLineDash([]);
                    ctx.restore();

                    // 6个护盾节点
                    for (let i = 0; i < 6; i++) {
                        const a = (i/6)*Math.PI*2 + t*0.5;
                        const sx = Math.cos(a) * (r + 15);
                        const sy = Math.sin(a) * (r + 15);
                        ctx.fillStyle = '#ff00aa';
                        ctx.shadowColor = '#ff00aa';
                        ctx.shadowBlur = 15;
                        ctx.beginPath();
                        ctx.arc(sx, sy, 4, 0, Math.PI*2);
                        ctx.fill();
                    }
                    ctx.shadowBlur = 0;

                    // 闭眼球体（紫黑色）
                    const bodyGrad = ctx.createRadialGradient(0, -r*0.3, r*0.2, 0, 0, r);
                    bodyGrad.addColorStop(0, '#4a0020');
                    bodyGrad.addColorStop(0.6, '#1a0008');
                    bodyGrad.addColorStop(1, '#000000');
                    ctx.fillStyle = bodyGrad;
                    ctx.shadowColor = '#660033';
                    ctx.shadowBlur = 25;
                    ctx.beginPath();
                    ctx.arc(0, 0, r, 0, Math.PI*2);
                    ctx.fill();
                    ctx.shadowBlur = 0;

                    // 上下眼睑
                    ctx.fillStyle = '#660022';
                    ctx.beginPath();
                    ctx.ellipse(0, -r*0.85, r*0.95, r*0.4, 0, Math.PI, 0, true);
                    ctx.fill();
                    ctx.beginPath();
                    ctx.ellipse(0, r*0.85, r*0.95, r*0.4, 0, 0, Math.PI, true);
                    ctx.fill();

                    // 闭眼缝
                    ctx.strokeStyle = '#220011';
                    ctx.lineWidth = 5;
                    ctx.shadowColor = '#880044';
                    ctx.shadowBlur = 12;
                    ctx.beginPath();
                    ctx.moveTo(-r*0.65, 0);
                    ctx.quadraticCurveTo(0, r*0.2, r*0.65, 0);
                    ctx.stroke();
                    // 睫毛
                    ctx.strokeStyle = '#660022';
                    ctx.lineWidth = 1.5;
                    ctx.shadowBlur = 0;
                    for (let i = 0; i < 7; i++) {
                        const a = Math.PI + (i/6)*Math.PI;
                        const ex = Math.cos(a)*r*0.95;
                        const ey = Math.sin(a)*r*0.4 - r*0.4;
                        ctx.beginPath();
                        ctx.moveTo(ex, ey);
                        ctx.lineTo(ex*1.05, ey - 6);
                        ctx.stroke();
                    }

                    // 中心X标记（无敌）
                    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
                    ctx.lineWidth = 3;
                    ctx.shadowColor = '#ff00aa';
                    ctx.shadowBlur = 10;
                    ctx.beginPath();
                    ctx.moveTo(-10, -10); ctx.lineTo(10, 10);
                    ctx.moveTo(10, -10); ctx.lineTo(-10, 10);
                    ctx.stroke();
                    ctx.shadowBlur = 0;
                } else {
                    // ===== 睁眼：巨大眼瞳+虹膜+血丝+睫毛 =====
                    // 眼白
                    ctx.fillStyle = this.flashTime > 0 ? '#ffaaaa' : '#ffdddd';
                    ctx.shadowColor = '#ff6666';
                    ctx.shadowBlur = 30;
                    ctx.beginPath();
                    ctx.arc(0, 0, r, 0, Math.PI*2);
                    ctx.fill();
                    ctx.shadowBlur = 0;

                    // 虹膜（红橙渐变）
                    const iris = ctx.createRadialGradient(0, 0, 0, 0, 0, r*0.6);
                    iris.addColorStop(0, '#ff8800');
                    iris.addColorStop(0.5, '#ff2222');
                    iris.addColorStop(1, '#aa0000');
                    ctx.fillStyle = iris;
                    ctx.beginPath();
                    ctx.arc(0, 0, r*0.6, 0, Math.PI*2);
                    ctx.fill();

                    // 瞳孔
                    ctx.fillStyle = '#000000';
                    ctx.shadowColor = '#000000';
                    ctx.shadowBlur = 15;
                    ctx.beginPath();
                    ctx.arc(0, 0, r*0.22, 0, Math.PI*2);
                    ctx.fill();
                    ctx.shadowBlur = 0;

                    // 瞳孔高光
                    ctx.fillStyle = '#ffffff';
                    ctx.beginPath();
                    ctx.arc(-r*0.08, -r*0.08, r*0.07, 0, Math.PI*2);
                    ctx.fill();

                    // 血丝（8条红色血管）
                    ctx.strokeStyle = '#aa0000';
                    ctx.lineWidth = 1.5;
                    ctx.shadowColor = '#ff0000';
                    ctx.shadowBlur = 4;
                    for (let i = 0; i < 8; i++) {
                        const a = (i/8)*Math.PI*2 + Math.sin(t+i)*0.1;
                        ctx.beginPath();
                        ctx.moveTo(Math.cos(a)*r*0.55, Math.sin(a)*r*0.55);
                        ctx.quadraticCurveTo(
                            Math.cos(a+0.2)*r*0.78, Math.sin(a+0.2)*r*0.78,
                            Math.cos(a)*r*0.94, Math.sin(a)*r*0.94
                        );
                        ctx.stroke();
                    }
                    ctx.shadowBlur = 0;

                    // 上下睫毛
                    ctx.strokeStyle = '#660022';
                    ctx.lineWidth = 2;
                    for (let side = -1; side <= 1; side += 2) {
                        for (let i = 0; i < 8; i++) {
                            const baseAng = side > 0 ? Math.PI : 0;
                            const a = baseAng + side * (i/7 - 0.5) * 0.8;
                            const ex = Math.cos(a)*r*0.95;
                            const ey = Math.sin(a)*r*0.95;
                            ctx.beginPath();
                            ctx.moveTo(ex, ey);
                            ctx.lineTo(ex*1.08, ey*1.08 + side*4);
                            ctx.stroke();
                        }
                    }
                }

                ctx.restore();
                this.drawHpBar();
            }

            drawHpBar() {
                const w = 80, h = 8;
                ctx.fillStyle = '#333';
                ctx.fillRect(this.x - w/2, this.y - this.radius - 20, w, h);
                ctx.fillStyle = '#ff3333';
                ctx.shadowColor = '#ff3333';
                ctx.shadowBlur = 8;
                ctx.fillRect(this.x - w/2, this.y - this.radius - 20, w * (this.hp / this.maxHp), h);
                ctx.shadowBlur = 0;
                if (!this.eyeOpen) {
                    ctx.fillStyle = '#8800aa';
                    ctx.font = 'bold 10px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText(_t('无敌'), this.x, this.y - this.radius - 25);
                }
            }
        }

        class YouBoss {
            constructor(x, y) {
                const cfg = BOSS_CONFIG.youBoss; this._cfg = cfg;
                this.x = x;
                this.y = y;
                this.alive = true;
                this.type = 'you';
                // 防御性：currentDifficulty fallback
                const diff = currentDifficulty || DIFFICULTY_CONFIG.hard;
                // ===== 血量乘以难度倍率（困难基准1.0） =====
                this.hp = enemyBaseHp * cfg.baseHpMult * diff.hpMult;
                this.maxHp = this.hp;
                this.attack = enemyBaseAttack * cfg.attackCalc.baseMult * cfg.attackCalc.globalMult;
                this.radius = cfg.baseRadius;
                this.baseRadius = cfg.baseRadius;
                // ===== 速度由难度配置决定（困难基准1.8） =====
                this.speed = diff.enemySpeed.boss;
                // ===== 疯狂天气：Boss血量+50%并回满 =====
                if ((enableWeather || curseNightMode || madnessNightMode) && (currentWeather === 'madness' || currentWeather === 'm_rampage')) {
                    this.maxHp = Math.floor(this.maxHp * BOSS_CONFIG.madnessWeatherHpBonus);
                    this.hp = this.maxHp;
                }
                this.color = '#ff2200';
                this.baseColor = '#ff2200';
                this.edgeColor = '#ffaa00';
                this.label = _t('幽');
                this.isBoss = true;
                this.isYou = true;
                this.flashTime = 0;
                this.stunTime = 0;
                this.attackCooldown = 0;
                this.youSkill = null;
                this.youSkillCharge = 0;
                this.youSkillTimer = 0;
                this.youSkillData = null;
                this.chargeTargetX = 0;
                this.chargeTargetY = 0;
                this.chargeDirX = 0;
                this.chargeDirY = 0;
                this.youEnraged = false;
                this.flickerTimer = 0;
                this.burnTick = 0;
                this.dashReflects = 0;
                this.dashDirX = 0;
                this.dashDirY = 0;
                this.dashHitCooldown = 0;
                // ===== 5技能独立CD（用户要求：技能独立进行，能一起使用）=====
                this.fireCd = cfg.skills.fireRain.cd;       // 2.5秒 火雨
                this.laserCd = cfg.skills.lasers.cd;      // 3秒 激光
                this.comboCd = cfg.skills.combo.cd;      // 4秒 火+激光组合
                this.frenzyCd = cfg.skills.fireAndLaser.cd;     // 6秒 狂暴
                this.chargeCd = cfg.skills.dash.cd;     // 3.3秒 冲锋
                this.youCooldown = 0;    // 已废弃：保留兼容
            }

            update() {
                const hero = coopTarget(this);
                if (!this.alive || !hero || !hero.alive) return;
                if (this.flashTime > 0) this.flashTime--;
                if (this.flickerTimer > 0) this.flickerTimer--;
                if (this.stunTime > 0) { this.stunTime--; return; }
                if (timeFrozen || heroFreezeTimer > 0) return;

                // 每秒自损1%最大生命值（60帧=1秒），最低 1 HP 防止早期永远自伤不死
                // 用户要求：第二阶段（狂暴状态）不再燃烧自身血量
                if (!this.youEnraged) {
                    this.burnTick++;
                    if (this.burnTick >= this._cfg.selfBurn.tickInterval) {
                        this.burnTick = 0;
                        const selfDmg = Math.max(1, Math.floor(this.maxHp * this._cfg.selfBurn.hpPercent));
                        this.hp -= selfDmg;
                        for (let i = 0; i < 5; i++) {
                            const a = Math.random() * Math.PI * 2;
                            youParticles.push({
                                type: 'flame',
                                x: this.x + Math.cos(a)*this.radius*0.8,
                                y: this.y + Math.sin(a)*this.radius*0.8,
                                vx: Math.cos(a)*1.5, vy: Math.sin(a)*1.5 - 1.5,
                                life: 25, maxLife: 30, size: 6
                            });
                        }
                        if (this.hp <= 0) {
                            this.hp = 0;
                            this.alive = false;
                            return;
                        }
                    }
                }

                if (!this.youEnraged && this.hp < this.maxHp * this._cfg.enrageHpThreshold) {
                    this.youEnraged = true;
                    this.color = '#ff6600';
                    this.edgeColor = '#ffff00';
                    youRings.push({ x: this.x, y: this.y, radius: 0, maxRadius: 300, life: 40, maxLife: 40, color: '#ff4400', width: 8 });
                    for (let i = 0; i < 50; i++) {
                        const a = Math.random() * Math.PI * 2;
                        youParticles.push({
                            type: 'burst', x: this.x, y: this.y,
                            vx: Math.cos(a)*(3+Math.random()*6), vy: Math.sin(a)*(3+Math.random()*6),
                            life: 45, maxLife: 45, color: i%2===0?'#ff2200':'#ffaa00', size: 7
                        });
                    }
                    triggerShake(true);
                }
                const cdMult = this.youEnraged ? this._cfg.enrageCdMult : 1; // 狂暴时1.5秒→0.7秒（速度x2.14）

                // ===== 5技能独立CD倒数 =====
                this.fireCd = Math.max(0, this.fireCd - cdMult);
                this.laserCd = Math.max(0, this.laserCd - cdMult);
                this.comboCd = Math.max(0, this.comboCd - cdMult);
                this.frenzyCd = Math.max(0, this.frenzyCd - cdMult);
                this.chargeCd = Math.max(0, this.chargeCd - cdMult);

                // 技能执行中（charge 阶段或效果阶段）
                if (this.youSkill) {
                    // 第一步：charge 倒计时（如还在蓄力）
                    if (this.youSkillCharge > 0) {
                        this.youSkillCharge -= cdMult;
                        if (this.youSkillCharge <= 0) {
                            this.youSkillCharge = 0;
                            this.executeYouSkill();  // 关键：触发 startDash / 火焰 / 激光
                        }
                    } else {
                        // 第二步：execute 之后才让 timer 倒计时（charge 阶段不消耗）
                        this.youSkillTimer -= cdMult;
                    }
                    // 第三步：dash 在 execute 后持续执行
                    if (this.youSkill === 'dash') {
                        this.performDash();
                    }
                    // 第四步：timer 倒计时结束
                    if (this.youSkillTimer <= 0) {
                        this.youSkillData = null;
                        this.youSkill = null;
                    }
                    if (this.youSkill !== 'dash') this.moveTowardHero(this._cfg.chargeSpeedMult);
                    // 技能执行期间仍保持普通攻击（不return阻断）
                } else {
                    // 幽保留普通移动（用户要求保留所有技能实现）
                    this.moveTowardHero(this._cfg.normalSpeedMult);
                }

                const dx = hero.x - this.x, dy = hero.y - this.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                const atkRange = this.radius + this._cfg.attackRangeExtra;
                if (this.attackCooldown > 0) this.attackCooldown--;
                if (dist < atkRange && this.attackCooldown <= 0 && this.youSkillCharge <= 0) {
                    this.attackCooldown = this._cfg.attackCooldown;
                    heroAttackedBy(this, this.attack, '#ff2200', hero);
                }
                const minDist = this.radius + this._cfg.pushDistanceExtra;
                if (dist < minDist && dist > 0.1) {
                    const pushX = (this.x - hero.x)/dist;
                    const pushY = (this.y - hero.y)/dist;
                    hero.x = Math.max(30, Math.min(MAP_WIDTH-30, hero.x - pushX*(minDist-dist)));
                    hero.y = Math.max(30, Math.min(MAP_HEIGHT-100, hero.y - pushY*(minDist-dist)));
                }
                this.x = Math.max(40, Math.min(MAP_WIDTH-40, this.x));
                this.y = Math.max(40, Math.min(MAP_HEIGHT-120, this.y));

                // 独立CD：选一个CD<=0的技能立即触发
                if (!this.youSkill) this.pickYouSkill();
            }

            moveTowardHero(spdMult) {
                const hero = coopTarget(this);
                const dx = hero.x - this.x, dy = hero.y - this.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist > this._cfg.chaseDistThreshold) {
                    const ws = (enableWeather || curseNightMode || madnessNightMode) ? weatherEnemySpeedMult : 1;
                    this.x += (dx/dist)*this.speed*spdMult*ws;
                    this.y += (dy/dist)*this.speed*spdMult*ws;
                }
            }

            pickYouSkill() {
                const hero = coopTarget(this);
                // ===== 5技能独立CD：从所有CD<=0的技能中随机选一个 =====
                // dash 加权多次，确保玩家能看到冲锋（避免被火雨/激光掩盖）
                const available = [];
                if (this.fireCd <= 0) available.push('fireRain', 'combo', 'fireAndLaser');
                if (this.laserCd <= 0) available.push('lasers', 'combo', 'fireAndLaser');
                if (this.frenzyCd <= 0) available.push('fireAndLaser'); // 狂暴用 frenzyCd
                if (this.chargeCd <= 0) available.push('dash', 'dash', 'dash'); // dash 加权到 3/11 ≈ 27%
                if (available.length === 0) return; // 没有可用技能

                const skill = available[Math.floor(Math.random()*available.length)];
                this.youSkill = skill;
                this.youSkillTimer = 120;
                this.youSkillData = {};
                this.chargeTargetX = hero.x;
                this.chargeTargetY = hero.y;
                const dx = hero.x - this.x, dy = hero.y - this.y;
                const dlen = Math.sqrt(dx*dx+dy*dy)||1;
                this.chargeDirX = dx/dlen;
                this.chargeDirY = dy/dlen;

                if (skill === 'fireRain') {
                    this.youSkillCharge = this._cfg.skills.fireRain.charge; // 缩短蓄力到 100 帧
                    this.fireCd = this._cfg.skills.fireRain.cd;
                    // 技能1：35个随机位置火焰（用户加强）
                    const fires = [];
                    for (let i = 0; i < this._cfg.skills.fireRain.fireCount; i++) {
                        fires.push({
                            x: 80 + Math.random()*(MAP_WIDTH-160),
                            y: 80 + Math.random()*(MAP_HEIGHT-180)
                        });
                    }
                    this.youSkillData = { fires };
                } else if (skill === 'lasers') {
                    this.youSkillCharge = this._cfg.skills.lasers.charge; // 缩短蓄力
                    this.laserCd = this._cfg.skills.lasers.cd;
                    // 技能2：10个随机方向激光（等角均分+小幅抖动，防止两束重叠）
                    const angles = [];
                    const baseRot = Math.random() * Math.PI * 2;
                    for (let i = 0; i < this._cfg.skills.lasers.directionCount; i++) {
                        angles.push(baseRot + (i / this._cfg.skills.lasers.directionCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.3);
                    }
                    this.youSkillData = { angles };
                } else if (skill === 'combo') {
                    this.youSkillCharge = this._cfg.skills.combo.charge;
                    this.comboCd = this._cfg.skills.combo.cd;
                    this.fireCd = Math.max(this.fireCd, 200);
                    this.laserCd = Math.max(this.laserCd, 220);
                    // 技能3：20个随机位置火焰 + 5个方向激光（用户加强）
                    const fires = [];
                    for (let i = 0; i < this._cfg.skills.combo.fireCount; i++) {
                        fires.push({
                            x: 80 + Math.random()*(MAP_WIDTH-160),
                            y: 80 + Math.random()*(MAP_HEIGHT-180)
                        });
                    }
                    const angles = [];
                    const baseRot2 = Math.random() * Math.PI * 2;
                    for (let i = 0; i < this._cfg.skills.combo.laserCount; i++) {
                        angles.push(baseRot2 + (i / this._cfg.skills.combo.laserCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.3);
                    }
                    this.youSkillData = { fires, angles };
                } else if (skill === 'fireAndLaser') {
                    this.youSkillCharge = this._cfg.skills.fireAndLaser.charge;
                    this.frenzyCd = this._cfg.skills.fireAndLaser.cd;
                    this.fireCd = Math.max(this.fireCd, 280);
                    this.laserCd = Math.max(this.laserCd, 300);
                    // 技能4：50个随机位置火焰 + 10个方向激光（用户加强）
                    const fires = [];
                    for (let i = 0; i < this._cfg.skills.fireAndLaser.fireCount; i++) {
                        fires.push({
                            x: 80 + Math.random()*(MAP_WIDTH-160),
                            y: 80 + Math.random()*(MAP_HEIGHT-180)
                        });
                    }
                    const angles = [];
                    const baseRot3 = Math.random() * Math.PI * 2;
                    for (let i = 0; i < this._cfg.skills.fireAndLaser.laserCount; i++) {
                        angles.push(baseRot3 + (i / this._cfg.skills.fireAndLaser.laserCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.3);
                    }
                    this.youSkillData = { fires, angles };
                } else if (skill === 'dash') {
                    this.youSkillCharge = this._cfg.skills.dash.charge; // 蓄力 80 帧（≈1.3s，更容易观察）
                    this.chargeCd = this._cfg.skills.dash.resetCd;     // CD 140 帧（≈2.3s，更频繁）
                    this.youSkillData = { reflects: 0 };
                    this.youSkillTimer = this._cfg.skills.dash.duration; // 冲刺持续 120 帧（≈2s）
                }
            }

            executeYouSkill() {
                const s = this.youSkill;
                if (s === 'fireRain') this.spawnFireRain(this.youSkillData.fires);
                else if (s === 'lasers') this.spawnLasers(this.youSkillData.angles);
                else if (s === 'combo') {
                    this.spawnFireRain(this.youSkillData.fires);
                    this.spawnLasers(this.youSkillData.angles);
                }
                else if (s === 'fireAndLaser') {
                    this.spawnFireRain(this.youSkillData.fires);
                    this.spawnLasers(this.youSkillData.angles);
                }
                else if (s === 'dash') this.startDash();
            }

            spawnFireRain(fires) {
                for (const f of fires) {
                    youParticles.push({
                        type: 'fireball',
                        x: f.x, y: -30,
                        tx: f.x, ty: f.y,
                        vx: 0, vy: 9,
                        life: this._cfg.skills.fireRain.fireballLife, maxLife: this._cfg.skills.fireRain.fireballLife,
                        color: '#ff4400', trail: [],
                        damage: this.attack * this._cfg.skills.fireRain.dmgMult,
                        hitCooldown: 0,
                        exploded: false
                    });
                }
                youRings.push({ x: this.x, y: this.y, radius: 0, maxRadius: 200, life: 25, maxLife: 25, color: '#ff3300', width: 6 });
                triggerShake(false);
            }

            spawnLasers(angles) {
                for (const a of angles) {
                    youLasers.push({
                        x: this.x, y: this.y,
                        dirX: Math.cos(a), dirY: Math.sin(a),
                        angle: a,
                        length: 0, maxLength: this._cfg.skills.lasers.maxLength,
                        life: this._cfg.skills.lasers.laserLife, maxLife: this._cfg.skills.lasers.laserLife,
                        color: '#ff0000',
                        width: this._cfg.skills.lasers.laserWidth,
                        hitCooldown: 0
                    });
                }
                youRings.push({ x: this.x, y: this.y, radius: 0, maxRadius: 150, life: 20, maxLife: 20, color: '#ff2200', width: 5 });
                triggerShake(true);
            }

            startDash() {
                const dx = this.chargeTargetX - this.x;
                const dy = this.chargeTargetY - this.y;
                const dlen = Math.sqrt(dx*dx+dy*dy)||1;
                this.dashDirX = dx/dlen;
                this.dashDirY = dy/dlen;
                this.dashReflects = 0;
                this.dashHitCooldown = 0;
                // ===== 大量爆炸粒子+冲击波 =====
                for (let i = 0; i < 50; i++) {
                    const a = Math.random()*Math.PI*2;
                    youParticles.push({
                        type: 'burst', x: this.x, y: this.y,
                        vx: Math.cos(a)*(4+Math.random()*6), vy: Math.sin(a)*(4+Math.random()*6),
                        life: 30, maxLife: 30, color: i%3===0?'#ffff00':(i%3===1?'#ff6600':'#ff2200'), size: 8
                    });
                }
                // 2 层冲击波
                youRings.push({ x: this.x, y: this.y, radius: 0, maxRadius: 200, life: 30, maxLife: 30, color: '#ff4400', width: 8 });
                youRings.push({ x: this.x, y: this.y, radius: 0, maxRadius: 350, life: 40, maxLife: 40, color: '#ffaa00', width: 4 });
                triggerShake(true);
            }

            performDash() {
                const hero = coopTarget(this);
                const speed = this._cfg.skills.dash.speed; // 提升冲刺速度
                this.x += this.dashDirX * speed;
                this.y += this.dashDirY * speed;
                // ===== 冲刺时大量火焰拖尾粒子 =====
                for (let i = 0; i < 6; i++) {
                    youParticles.push({
                        type: 'flame',
                        x: this.x + (Math.random()-0.5)*30,
                        y: this.y + (Math.random()-0.5)*30,
                        vx: -this.dashDirX*3 + (Math.random()-0.5)*2,
                        vy: -this.dashDirY*3 + (Math.random()-0.5)*2,
                        life: 30, maxLife: 30, size: 12,
                        color: Math.random()<0.5 ? '#ff6600' : '#ffaa00'
                    });
                }
                // 冲刺轨迹火焰
                youParticles.push({
                    type: 'flame',
                    x: this.x, y: this.y,
                    vx: 0, vy: 0,
                    life: 15, maxLife: 15,
                    color: '#ff4400', size: 16
                });
                let reflected = false;
                if (this.dashReflects < this._cfg.skills.dash.maxReflects) {
                    // 最多3次弹射
                    if (this.x < 40) { this.x = 40; this.dashDirX = -this.dashDirX; reflected = true; }
                    if (this.x > MAP_WIDTH-40) { this.x = MAP_WIDTH-40; this.dashDirX = -this.dashDirX; reflected = true; }
                    if (this.y < 40) { this.y = 40; this.dashDirY = -this.dashDirY; reflected = true; }
                    if (this.y > MAP_HEIGHT-120) { this.y = MAP_HEIGHT-120; this.dashDirY = -this.dashDirY; reflected = true; }
                } else {
                    // 用户要求：3次弹射后像无摩擦的台球一样继续移动
                    // 不再弹射，仅夹紧位置（沿当前方向继续）
                    if (this.x < 40) this.x = 40;
                    if (this.x > MAP_WIDTH-40) this.x = MAP_WIDTH-40;
                    if (this.y < 40) this.y = 40;
                    if (this.y > MAP_HEIGHT-120) this.y = MAP_HEIGHT-120;
                }
                if (reflected) {
                    this.dashReflects++;
                    youRings.push({ x: this.x, y: this.y, radius: 0, maxRadius: 120, life: 20, maxLife: 20, color: '#ffff00', width: 6 });
                    for (let i = 0; i < 30; i++) {
                        const a = Math.random()*Math.PI*2;
                        youParticles.push({
                            type: 'burst', x: this.x, y: this.y,
                            vx: Math.cos(a)*(3+Math.random()*5), vy: Math.sin(a)*(3+Math.random()*5),
                            life: 25, maxLife: 25, color: i%2===0?'#ffff00':'#ff6600', size: 7
                        });
                    }
                }
                if (this.dashHitCooldown > 0) this.dashHitCooldown--;
                // 冲撞判定：范围内的两个玩家都会被撞到
                if (this.dashHitCooldown <= 0) {
                    const dashHits = coopHitCircle(this, this.attack * this._cfg.skills.dash.dmgMult, '#ff4400', this.x, this.y, this.radius + 25);
                    if (dashHits > 0) this.dashHitCooldown = this._cfg.skills.dash.hitCooldown;
                }
            }

            drawChargeWarning() {
                if (!this.youSkill || this.youSkillCharge <= 0) return;
                const ch = this.youSkillCharge;
                const alpha = 0.3 + 0.4*Math.sin(ch*0.2);
                ctx.save();

                if (this.youSkill === 'fireRain' || this.youSkill === 'combo' || this.youSkill === 'fireAndLaser') {
                    for (const f of this.youSkillData.fires) {
                        ctx.strokeStyle = `rgba(255,60,0,${alpha*0.6})`;
                        ctx.lineWidth = 2;
                        ctx.setLineDash([6,6]);
                        ctx.beginPath();
                        ctx.moveTo(f.x, -20);
                        ctx.lineTo(f.x, f.y);
                        ctx.stroke();
                        ctx.setLineDash([]);
                        ctx.fillStyle = `rgba(255,80,0,${alpha*0.4})`;
                        ctx.beginPath();
                        ctx.arc(f.x, f.y, 28, 0, Math.PI*2);
                        ctx.fill();
                        ctx.strokeStyle = `rgba(255,150,0,${alpha})`;
                        ctx.lineWidth = 3;
                        ctx.beginPath();
                        ctx.arc(f.x, f.y, 30*(1-ch/120)+10, 0, Math.PI*2);
                        ctx.stroke();
                    }
                }
                if (this.youSkill === 'lasers' || this.youSkill === 'combo' || this.youSkill === 'fireAndLaser') {
                    for (const a of this.youSkillData.angles) {
                        ctx.strokeStyle = `rgba(255,0,0,${alpha})`;
                        ctx.lineWidth = 4;
                        ctx.shadowColor = '#ff0000';
                        ctx.shadowBlur = 15;
                        ctx.beginPath();
                        ctx.moveTo(this.x, this.y);
                        ctx.lineTo(this.x + Math.cos(a)*2000, this.y + Math.sin(a)*2000);
                        ctx.stroke();
                    }
                }
                if (this.youSkill === 'dash') {
                    // ===== 冲锋蓄力：超显眼的红色激光瞄准 + 脉冲目标圈 =====
                    // 1. 主光束：粗红线 + 黄色边缘
                    const pulse = 0.5 + 0.5*Math.sin(ch*0.3);
                    ctx.strokeStyle = `rgba(255,60,0,${0.5 + pulse*0.4})`;
                    ctx.lineWidth = 16;
                    ctx.shadowColor = '#ff2200';
                    ctx.shadowBlur = 30;
                    ctx.beginPath();
                    ctx.moveTo(this.x, this.y);
                    ctx.lineTo(this.chargeTargetX, this.chargeTargetY);
                    ctx.stroke();
                    // 2. 内层亮黄线
                    ctx.strokeStyle = `rgba(255,255,100,${0.7 + pulse*0.3})`;
                    ctx.lineWidth = 6;
                    ctx.shadowColor = '#ffff00';
                    ctx.shadowBlur = 15;
                    ctx.beginPath();
                    ctx.moveTo(this.x, this.y);
                    ctx.lineTo(this.chargeTargetX, this.chargeTargetY);
                    ctx.stroke();
                    // 3. 目标点：脉冲圆环+大字"冲"
                    const tgtR = 35 + pulse*10;
                    ctx.strokeStyle = `rgba(255,0,0,${0.8 + pulse*0.2})`;
                    ctx.lineWidth = 4;
                    ctx.shadowColor = '#ff0000';
                    ctx.shadowBlur = 20;
                    ctx.beginPath();
                    ctx.arc(this.chargeTargetX, this.chargeTargetY, tgtR, 0, Math.PI*2);
                    ctx.stroke();
                    // 4. 内圈填充
                    ctx.fillStyle = `rgba(255,80,0,${0.3 + pulse*0.2})`;
                    ctx.beginPath();
                    ctx.arc(this.chargeTargetX, this.chargeTargetY, tgtR-8, 0, Math.PI*2);
                    ctx.fill();
                    // 5. 目标中心大字"冲"
                    ctx.fillStyle = `rgba(255,255,255,${0.9})`;
                    ctx.shadowColor = '#ff0000';
                    ctx.shadowBlur = 15;
                    ctx.font = 'bold 28px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(_t('冲'), this.chargeTargetX, this.chargeTargetY);
                    // 6. 幽脚下蓄力光环
                    const chgRad = 40 + (1-ch/80)*60;
                    ctx.strokeStyle = `rgba(255,150,0,${0.6})`;
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.arc(this.x, this.y, chgRad, 0, Math.PI*2);
                    ctx.stroke();
                }
                ctx.restore();
            }

            draw() {
                if (!this.alive) return;
                const flicker = this.flickerTimer > 0 && this.flickerTimer % 6 < 3;
                const t = Date.now() / 200;
                ctx.save();
                ctx.translate(this.x, this.y);
                const r = this.radius;
                const enrage = this.youEnraged;

                // ====== 烈焰幽灵：常驻燃烧+火焰翅膀+尾焰+烈焰骷髅 ======

                // 1. 最外层热浪扩散
                const heatWave = ctx.createRadialGradient(0, 0, r*0.5, 0, 0, r*2.5);
                heatWave.addColorStop(0, enrage ? 'rgba(255,200,0,0.5)' : 'rgba(255,100,0,0.45)');
                heatWave.addColorStop(0.4, enrage ? 'rgba(255,80,0,0.3)' : 'rgba(200,40,0,0.25)');
                heatWave.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = heatWave;
                ctx.beginPath();
                ctx.arc(0, 0, r*2.5, 0, Math.PI*2);
                ctx.fill();

                // 2. 尾焰拖尾（向下3条火焰）
                if (!enrage) {
                    for (let i = 0; i < 3; i++) {
                        const tailY = r + i * 12 + Math.sin(t*3 + i) * 4;
                        const tailX = (i-1) * 5;
                        const tailGrad = ctx.createLinearGradient(tailX, r, tailX, tailY + 20);
                        tailGrad.addColorStop(0, 'rgba(255,200,0,0.7)');
                        tailGrad.addColorStop(0.5, 'rgba(255,100,0,0.4)');
                        tailGrad.addColorStop(1, 'rgba(200,0,0,0)');
                        ctx.fillStyle = tailGrad;
                        ctx.beginPath();
                        ctx.moveTo(tailX - 4, r);
                        ctx.quadraticCurveTo(tailX, tailY, tailX + 4, r);
                        ctx.fill();
                    }
                }

                // 3. 烈焰翅膀（左右各3片火焰羽毛）
                for (let side = -1; side <= 1; side += 2) {
                    for (let i = 0; i < 3; i++) {
                        const baseAng = side > 0 ? -Math.PI*0.7 : Math.PI*0.3;
                        const ang = baseAng + i * 0.35;
                        const wd = r * (0.8 + i * 0.4);
                        const wx = Math.cos(ang) * wd;
                        const wy = Math.sin(ang) * wd;
                        ctx.save();
                        ctx.translate(wx, wy);
                        ctx.rotate(ang + Math.PI/2);
                        // 火焰羽
                        const wingGrad = ctx.createLinearGradient(0, 0, 0, 15);
                        wingGrad.addColorStop(0, enrage ? '#ffff00' : '#ffaa00');
                        wingGrad.addColorStop(0.5, enrage ? '#ff8800' : '#ff4400');
                        wingGrad.addColorStop(1, 'rgba(200,0,0,0)');
                        ctx.fillStyle = wingGrad;
                        ctx.shadowColor = enrage ? '#ffff00' : '#ff4400';
                        ctx.shadowBlur = 12;
                        ctx.beginPath();
                        ctx.moveTo(0, 0);
                        ctx.quadraticCurveTo(5, 8, 0, 18);
                        ctx.quadraticCurveTo(-5, 8, 0, 0);
                        ctx.fill();
                        ctx.restore();
                    }
                }
                ctx.shadowBlur = 0;

                if (flicker) { ctx.globalAlpha = 0.4; }

                if (enrage) {
                    // 狂暴：纯火焰元素形态（无核心，多层火焰花瓣）
                    for (let i = 0; i < 3; i++) {
                        const tt = t + i*2;
                        ctx.save();
                        ctx.rotate(tt);
                        const g = ctx.createRadialGradient(0, 0, 5, 0, 0, r + 20 + i*8);
                        g.addColorStop(0, '#ffff00');
                        g.addColorStop(0.3, '#ff8800');
                        g.addColorStop(0.7, '#ff2200');
                        g.addColorStop(1, 'rgba(200,0,0,0)');
                        ctx.fillStyle = g;
                        ctx.beginPath();
                        const pts = 10;
                        for (let p = 0; p < pts; p++) {
                            const ang = (p/pts)*Math.PI*2;
                            const rr = r + 10 + i*6 + Math.sin(tt*2 + p*3) * 10;
                            const px = Math.cos(ang) * rr;
                            const py = Math.sin(ang) * rr;
                            if (p===0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                        }
                        ctx.closePath();
                        ctx.fill();
                        ctx.restore();
                    }
                    // 火焰骷髅眼
                    ctx.fillStyle = '#ffff00';
                    ctx.shadowColor = '#ffff00';
                    ctx.shadowBlur = 30;
                    ctx.beginPath();
                    ctx.arc(-8, -3, 5, 0, Math.PI*2);
                    ctx.arc(8, -3, 5, 0, Math.PI*2);
                    ctx.fill();
                    // 嘴
                    ctx.strokeStyle = '#ff8800';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(-8, 6);
                    for (let i = 0; i < 4; i++) {
                        ctx.lineTo(-8 + i*5 + 2.5, 3 - (i%2)*4);
                    }
                    ctx.lineTo(8, 6);
                    ctx.stroke();
                    // 中心焰心
                    ctx.fillStyle = '#ffff88';
                    ctx.shadowBlur = 40;
                    ctx.beginPath();
                    ctx.arc(0, 0, r*0.4, 0, Math.PI*2);
                    ctx.fill();
                } else {
                    // 正常：大红球+内部烈焰骷髅
                    const bg = ctx.createRadialGradient(-5, -8, 4, 0, 0, r);
                    bg.addColorStop(0, '#ff8866');
                    bg.addColorStop(0.4, '#ff3300');
                    bg.addColorStop(1, '#aa0000');
                    ctx.fillStyle = bg;
                    ctx.shadowColor = '#ff2200';
                    ctx.shadowBlur = 25;
                    ctx.beginPath();
                    ctx.arc(0, 0, r, 0, Math.PI*2);
                    ctx.fill();
                    ctx.strokeStyle = this.edgeColor;
                    ctx.lineWidth = 3;
                    ctx.stroke();
                    ctx.shadowBlur = 0;

                    // 内部烈焰滚动
                    for (let i = 0; i < 6; i++) {
                        const tt = t * 0.4 + i*1.2;
                        ctx.fillStyle = `rgba(255,${120 + Math.sin(tt)*60},0,0.6)`;
                        ctx.beginPath();
                        ctx.arc(Math.cos(tt)*r*0.5, Math.sin(tt*1.3)*r*0.5 - 5, 8 + Math.sin(tt*2)*3, 0, Math.PI*2);
                        ctx.fill();
                    }
                    // 烈焰骷髅眼
                    ctx.fillStyle = '#ffff00';
                    ctx.shadowColor = '#ffff00';
                    ctx.shadowBlur = 20;
                    ctx.beginPath();
                    ctx.arc(-7, -3, 4, 0, Math.PI*2);
                    ctx.arc(7, -3, 4, 0, Math.PI*2);
                    ctx.fill();
                    ctx.shadowBlur = 0;
                    // 嘴
                    ctx.strokeStyle = '#ff8800';
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.moveTo(-7, 6);
                    for (let i = 0; i < 3; i++) {
                        ctx.lineTo(-7 + i*5 + 2.5, 3 - (i%2)*3);
                    }
                    ctx.lineTo(7, 6);
                    ctx.stroke();
                    // 顶部火焰高光
                    ctx.fillStyle = '#ffffaa';
                    ctx.beginPath();
                    ctx.arc(-8, -10, 8, 0, Math.PI*2);
                    ctx.fill();
                }

                // 标签（英文更长时自适应缩小，避免溢出本体圆形）
                ctx.globalAlpha = 1;
                ctx.shadowBlur = 0;
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                let madEyeFontPx = 18;
                ctx.font = `bold ${madEyeFontPx}px Arial`;
                const madEyeW = ctx.measureText(this.label).width;
                const madEyeMax = r * 1.7;
                if (madEyeW > madEyeMax) madEyeFontPx = Math.max(9, Math.floor(madEyeFontPx * madEyeMax / madEyeW));
                ctx.font = `bold ${madEyeFontPx}px Arial`;
                ctx.fillText(this.label, 0, r*0.6);

                ctx.restore();
                this.drawHpBar();
            }

            drawHpBar() {
                const w = 80, h = 8;
                ctx.fillStyle = '#333';
                ctx.fillRect(this.x - w/2, this.y - this.radius - 20, w, h);
                ctx.fillStyle = this.youEnraged ? '#ff6600' : '#ff2200';
                ctx.shadowColor = ctx.fillStyle;
                ctx.shadowBlur = 8;
                ctx.fillRect(this.x - w/2, this.y - this.radius - 20, w*(this.hp/this.maxHp), h);
                ctx.shadowBlur = 0;
            }
        }

        // ============================================================
        // ===== 劫（混沌·规则系）Boss 类 =====
        // 仅终焉及以上难度出现，压在幽之后的高强度压轴Boss。
        // 本阶段只实现：贴图渲染（三阶段按血线切换）+ 缓慢移动 + 边界约束 + 普攻 + 死亡掉落。
        // 技能机制（星陨环/引力锚/镜像/星轨等）后续补充。
        // ============================================================
        class JieBoss {
            constructor(x, y) {
                const cfg = BOSS_CONFIG.jieBoss;
                this._cfg = cfg;
                this.x = x;
                this.y = y;
                this.alive = true;
                this.type = 'jie';
                this.isBoss = true;
                this.isJie = true;
                // 防御性：currentDifficulty fallback
                const diff = currentDifficulty || DIFFICULTY_CONFIG.hard;
                // ===== 血量乘以难度倍率（困难基准1.0） =====
                this.hp = enemyBaseHp * cfg.baseHpMult * diff.hpMult;
                this.maxHp = this.hp;
                this.attack = enemyBaseAttack * cfg.attackCalc.baseMult * cfg.attackCalc.globalMult;
                this.radius = cfg.baseRadius;
                this.baseRadius = cfg.baseRadius;
                // ===== 速度 = 该难度Boss速度 × 0.85（约帝君的3/5），巨物缓慢移动 =====
                this.speed = diff.enemySpeed.boss * cfg.normalSpeedMult;
                // ===== 疯狂天气：血量+50%并回满 =====
                if ((enableWeather || curseNightMode || madnessNightMode) && (currentWeather === 'madness' || currentWeather === 'm_rampage')) {
                    this.maxHp = Math.floor(this.maxHp * BOSS_CONFIG.madnessWeatherHpBonus);
                    this.hp = this.maxHp;
                }
                this.color = '#ff0044';
                this.baseColor = this.color;
                this.edgeColor = '#44ffff';
                this.label = _t('劫');
                this.flashTime = 0;
                this.stunTime = 0;
                this.attackCooldown = 0;
                // ===== 角色状态效果支持（减速/寒冰冻结，与普通敌人一致） =====
                this.slowTimer = 0;          // 减速剩余帧（鲁肃/张角/左慈减速）
                this.slowFactor = 0;         // 减速系数（0=无减速）
                this.shuangFreezeTimer = 0;  // 甄姬寒冰冻结剩余帧（>0时无法移动/攻击）
                // 当前阶段索引（0=棱镜/1=极光/2=赛博核心），根据血线切换
                this.phase = 0;
                this._lastPhase = 0;          // 上一帧阶段索引（用于检测阶段切换）
                this.jieRecover = 0;          // 阶段切换恢复期倒计时（>0时暂停调度新行动）
                this.jieInvuln = 0;           // 阶段切换无敌倒计时（>0时免疫伤害，配合金色护盾演出）
                this.isJieBoss = true;        // 标记：用于 dealDamage 识别劫的无敌状态
                // 当前使用的贴图 Image（懒加载）
                this.sprite = null;
                this.spritePath = null;
                // ===== 技能状态机（混沌·规则系） =====
                // 行动调度：每3秒(180帧)按当前阶段技能组概率抽一次行动，各行动独立进行互不干扰
                this.jieActionTimer = 0;          // 距下次行动倒计时
                this.jieActions = [];             // 当前正在进行的行动列表（互不干扰）
                this.jieWangUses = 0;             // 召唤·王boss 已用次数（最多3次）
                // 处决/终章每波仅触发一次（weight=0 由调度器特殊注入）
                this.jieExecutionsDone = 0;       // 处决已触发次数
                this.jieFinaleDone = false;       // 终章是否已触发
                this.jieLaserStorm = null;        // 焚天激光风暴状态
                this.jiePendulum = null;          // 钟摆召唤状态
            }

            // ===== 贴图懒加载：同路径只加载一次，缓存到 jieSprites =====
            getSprite(path) {
                if (!path) return null;
                if (jieSprites[path]) return jieSprites[path];
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => { jieSpritesLoaded[path] = true; };
                img.src = path;
                jieSprites[path] = img;
                return img;
            }

            // ===== 根据当前血线计算阶段索引（贴图选择 + 头顶血条变色） =====
            // phases[i].hpLow 是第 i 阶段的"下界"（0.70/0.40/0.00），阶段索引 = 血线下界不低于当前血量的个数
            // 修复：原逻辑在 70%-0% 区间一直停留在低阶段，导致 P2/P3 贴图与橙色血条不出现
            updatePhase() {
                const ratio = this.hp / this.maxHp;
                const cfg = this._cfg;
                let idx = 0;
                for (let i = 0; i < cfg.phases.length; i++) {
                    if (ratio <= cfg.phases[i].hpLow) idx = i + 1;
                }
                idx = Math.min(idx, cfg.phases.length - 1);
                this.phase = idx;
                // 阶段切换触发：进入P2/P3时全屏告示 + 2秒恢复期（给玩家明确提示与喘息）
                if (idx !== this._lastPhase) {
                    const prev = this._lastPhase;
                    this._lastPhase = idx;
                    if (idx > prev) this.onPhaseChange(idx);
                }
                // 若阶段贴图变化，切换当前贴图
                const path = cfg.phases[idx].sprite;
                if (path !== this.spritePath) {
                    this.spritePath = path;
                    this.sprite = this.getSprite(path);
                }
            }

            // ===== 阶段切换仪式：全屏告示 + 屏幕震动 + 2秒恢复期（暂停调度新行动） =====
            onPhaseChange(newIdx) {
                const hero = coopTarget(this);
                // 阶段名：P2进入"劫转·极光"，P3进入"劫灭·赛博核心"
                const names = { 1: { main: '劫转', sub: '极光' }, 2: { main: '劫灭', sub: '赛博核心' } };
                const info = names[newIdx];
                const el = document.getElementById('jiePhaseBanner');
                if (el) {
                    el.innerHTML = info ? `${_t(info.main)}<span class="phase-sub">${_t(info.sub)} · ${_t('劫')}</span>` : _t('劫');
                    el.style.display = 'block';
                    // 重置CSS动画以便重复播放
                    el.style.animation = 'none';
                    void el.offsetWidth;
                    el.style.animation = 'jie-phase-in 1.6s ease-out forwards';
                    setTimeout(() => { el.style.display = 'none'; }, 1600);
                }
                // 2秒恢复期：期间不再调度新技能，给玩家喘息与应对空间
                this.jieRecover = 120;
                // ===== 阶段结束角色瞬间回满血：让玩家满状态迎接新阶段 =====
                if (hero) hero.hp = hero.maxHp;
                try {
                    const mate = window.__coopHero2;
                    if (mate && mate.alive) mate.hp = mate.maxHp;
                } catch (e) {}
                if (heroClones) {
                    for (const c of heroClones) c.hp = c.maxHp;
                }
                // ===== 阶段交接清理：清空遗留的危险区/召唤预警/激光，让新阶段从"干净"开始 =====
                // （避免上一阶段残留的飞刃/炸弹/守卫在小怪间歇期继续威胁玩家）
                jieZones.length = 0;
                jieSummons.length = 0;
                jieLasers.length = 0;
                // 终止进行中的行动（上一阶段技能不再延续到新阶段）
                this.jieActions.length = 0;
                // ===== 交接无敌：2秒护盾，避免仪式间隙被秒，让"变身"真正安全落地 =====
                this.jieInvuln = 120;
                triggerShake(true);
            }

            update() {
                const hero = coopTarget(this);
                if (!this.alive || !hero || !hero.alive) return;
                if (this.flashTime > 0) this.flashTime--;
                if (this.jieInvuln > 0) this.jieInvuln--;   // 阶段交接无敌倒计时
                if (this.stunTime > 0) { this.stunTime--; return; }
                // 冻结机制：时空静止/韩非雾隐/左慈时间停滞时劫也停止行动（与普通敌人一致）
                if (timeFrozen || heroFreezeTimer > 0 || zhiFreezeTimer > 0) return;

                this.updatePhase();

                // ===== 劫不可普通移动：屹立地图中心，仅由"空间折跃"位移技能传送 =====
                // （原缓慢追击逻辑已移除——压轴巨物应当是"必须由玩家主动躲避其领域"的存在）
                const dx = hero.x - this.x, dy = hero.y - this.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                // 任何状态效果（减速/冻结weather慢速）都不影响劫，因为它根本不动
                // ===== 边界约束：中心始终被限制在地图内，使半径边缘不越界 =====
                this.x = Math.max(this._cfg.minX, Math.min(this._cfg.maxX, this.x));
                this.y = Math.max(this._cfg.minY, Math.min(this._cfg.maxY, this.y));

                // ===== 普攻：近身（自身半径内）才触发，巨物贴脸伤害 =====
                if (this.attackCooldown > 0) this.attackCooldown--;
                // 甄姬寒冰冻结期间无法攻击
                if (dist < this.radius && this.attackCooldown <= 0 && this.shuangFreezeTimer <= 0) {
                    this.attackCooldown = this._cfg.attackCooldown;
                    heroAttackedBy(this, this.attack, '#ff0044', hero);
                }

                // ===== 碰撞分离：英雄不可进入巨物体内，接触时被强制推出到边界外 =====
                const minDist = this.radius + this._cfg.pushDistanceExtra;
                if (dist < minDist && dist > 0.1) {
                    const pushX = (this.x - hero.x) / dist;
                    const pushY = (this.y - hero.y) / dist;
                    hero.x = Math.max(30, Math.min(MAP_WIDTH-30, hero.x - pushX * (minDist - dist)));
                    hero.y = Math.max(30, Math.min(MAP_HEIGHT-100, hero.y - pushY * (minDist - dist)));
                }

                // ===== 技能调度：每3秒抽一次行动，各行动独立进行互不干扰 =====
                this.updateJieSkills();
            }

            // ============================================================
            // ===== 三阶段技能系统（混沌·规则系，压轴Boss专属） =====
            // 机制：每 actionInterval(180帧=3秒) 按当前阶段技能组概率抽一次行动，
            //       抽到的行动加入 this.jieActions 独立推进，特效push到全局数组
            //       由 updateJieEffects()(skills.js) 统一更新+绘制+伤害判定。
            //       行动互不干扰：3秒后无论当前行动是否做完，继续做并同时进行下一次。
            // ============================================================
            getPhaseSkillPool() {
                // 根据血线返回当前阶段技能池（P1 100-70% / P2 70-40% / P3 40-0%）
                const ratio = this.hp / this.maxHp;
                if (ratio > 0.70) return BOSS_CONFIG.jieSkills.phase1;
                if (ratio > 0.40) return BOSS_CONFIG.jieSkills.phase2;
                return BOSS_CONFIG.jieSkills.phase3;
            }

            // 加权随机抽一个技能（只从 weight>0 的技能中抽；用尽的召唤王自动出池）
            pickJieSkill() {
                const pool = this.getPhaseSkillPool();
                const keys = Object.keys(pool).filter(k => {
                    if (pool[k].weight <= 0) return false;
                    // 召唤·王boss 用尽后出池，避免白白占一个行动槽
                    if (k === 'summonWang' && this.jieWangUses >= (pool[k].maxUses || 3)) return false;
                    return true;
                });
                if (keys.length === 0) return null;
                let total = 0;
                const weights = keys.map(k => { total += pool[k].weight; return pool[k].weight; });
                let roll = Math.random() * total;
                for (let i = 0; i < keys.length; i++) {
                    roll -= weights[i];
                    if (roll <= 0) return keys[i];
                }
                return keys[keys.length - 1];
            }

            updateJieSkills() {
                // 阶段切换恢复期：2秒内不再调度新行动，给玩家喘息（既有行动继续执行）
                if (this.jieRecover > 0) {
                    this.jieRecover--;
                } else {
                    // 3秒行动调度倒计时
                    this.jieActionTimer++;
                    if (this.jieActionTimer >= BOSS_CONFIG.jieSkills.actionInterval) {
                        this.jieActionTimer = 0;
                        this.triggerJieAction();
                    }
                }
                // 推进所有正在进行的行动（独立进行，互不干扰）
                for (let i = this.jieActions.length - 1; i >= 0; i--) {
                    const act = this.jieActions[i];
                    act.timer--;
                    this.stepJieAction(act);
                    if (act.timer <= 0) this.jieActions.splice(i, 1);
                }
            }

            // 触发一次行动：优先注入每波一次的处决/终章，否则按概率抽
            triggerJieAction() {
                const ratio = this.hp / this.maxHp;
                // P3：处决每波至多1次（weight=0 特殊注入）
                if (ratio <= 0.40 && this.jieExecutionsDone === 0) {
                    this.jieExecutionsDone = 1;
                    this.startJieAction('execution');
                    return;
                }
                // P3：终章在血量<25%时每波确保1次（全屏，留外侧安全岛）
                if (ratio <= 0.25 && !this.jieFinaleDone) {
                    this.jieFinaleDone = true;
                    this.startJieAction('finale');
                    return;
                }
                const sk = this.pickJieSkill();
                if (sk) this.startJieAction(sk);
            }

            // 空间折跃落点：离英雄保持安全距离(不堵死逃生路) + 限于劫可移动范围中间80%(不贴边堵路)
            pickRiftLandingPoint() {
                const hero = coopTarget(this);
                const safe = 650;                       // 与英雄最小安全距离(>劫半径600，保证英雄周围有逃生通道)
                const maxR = 1050;                      // 最大落点半径
                const minX = this._cfg.minX, maxX = this._cfg.maxX;
                const minY = this._cfg.minY, maxY = this._cfg.maxY;
                // 劫可移动范围中间80%（两侧各去掉10%）
                const cMinX = minX + (maxX - minX) * 0.1;
                const cMaxX = maxX - (maxX - minX) * 0.1;
                const cMinY = minY + (maxY - minY) * 0.1;
                const cMaxY = maxY - (maxY - minY) * 0.1;
                // 多次尝试：在英雄周围的环形带里找满足"离英雄够远 + 在地图中间80%"的落点
                for (let tries = 0; tries < 24; tries++) {
                    const a = Math.random() * Math.PI * 2;
                    const d = safe + Math.random() * (maxR - safe);
                    const x = hero.x + Math.cos(a) * d;
                    const y = hero.y + Math.sin(a) * d;
                    if (x >= cMinX && x <= cMaxX && y >= cMinY && y <= cMaxY) return { x, y };
                }
                // 兜底：朝英雄反方向尽量远，并夹紧到中间80%边界
                const a = Math.atan2(hero.y - this.y, hero.x - this.x) + Math.PI;
                return {
                    x: Math.max(cMinX, Math.min(cMaxX, hero.x + Math.cos(a) * maxR)),
                    y: Math.max(cMinY, Math.min(cMaxY, hero.y + Math.sin(a) * maxR))
                };
            }

            // 启动一个行动：根据技能类型初始化行动参数与特效
            startJieAction(sk) {
                const hero = coopTarget(this);
                const pool = this.getPhaseSkillPool();
                const cfg = pool[sk] || {};
                const act = { type: sk, timer: 0, cfg, phase: this.phase };
                if (sk === 'starmeteor' || sk === 'starmeteorChaos' || sk === 'color36') {
                    // 星陨环：扇形弹幕，自带飞行生命周期（数量已在配置中翻倍）
                    act.timer = cfg.life;
                    this.spawnStarmeteor(cfg);
                } else if (sk === 'rainbowBomb') {
                    // 彩虹炸弹：前摇1s，预判点锁定英雄当前位置，定时爆炸（8颗彩色炸弹散布）
                    act.timer = cfg.charge + 120;
                    const bombCount = cfg.bombCount || 8;
                    const centerX = hero.x, centerY = hero.y;
                    const spread = cfg.spread || 900;
                    for (let i = 0; i < bombCount; i++) {
                        const a = (i / bombCount) * Math.PI * 2 + Math.random() * 0.4;
                        const rr = 80 + Math.random() * spread;
                        const bx = Math.max(80, Math.min(MAP_WIDTH - 80, centerX + Math.cos(a) * rr));
                        const by = Math.max(80, Math.min(MAP_HEIGHT - 80, centerY + Math.sin(a) * rr));
                        const palette = ['#ff4d6d', '#ff9a3c', '#ffd93d', '#6bff62', '#4dd2ff', '#8a4dff', '#ff4dff', '#ffffff'];
                        jieZones.push({
                            type: 'rainbowBomb',
                            charge: cfg.charge - Math.floor(i * (cfg.charge / bombCount / 2)), // 前摇内按序错开
                            x: bx, y: by, radius: cfg.radius, dmg: cfg.dmg,
                            timer: Math.max(20, cfg.charge - Math.floor(i * (cfg.charge / bombCount / 2))),
                            hitCooldown: 0,
                            color: palette[i % palette.length],
                            index: i
                        });
                    }
                } else if (sk === 'pulse') {
                    // 星辰脉冲：前摇2秒后范围伤害（半径=1.6s无位移角色移速≈220）
                    act.timer = cfg.charge + 60;
                    jieZones.push({ type: 'pulse', charge: cfg.charge, x: this.x, y: this.y, radius: 0, maxRadius: cfg.radius, dmg: cfg.dmg, life: 50, maxLife: 50, hitCooldown: 0 });
                } else if (sk === 'chain') {
                    // 秩序之链：持续光链追击英雄（×2条交错）
                    act.timer = cfg.duration;
                    const chainCount = cfg.chainCount || 1;
                    for (let c = 0; c < chainCount; c++) {
                        jieLasers.push({
                            type: 'chain', x: this.x, y: this.y, angle: 0, length: 0,
                            life: cfg.duration, maxLife: cfg.duration,
                            dmgPerSec: cfg.dmgPerSec, hitCooldown: 0,
                            offset: c // 0/1 用于在绘制/判定时错开，形成缠绕
                        });
                    }
                } else if (sk === 'flyblade') {
                    // 星轨飞刃：环形飞刃扫射（双环，每环16刃=×4）
                    act.timer = cfg.life;
                    const ringCount = cfg.ringCount || 1;
                    const bladeCount = cfg.bladeCount || 8;
                    for (let k = 0; k < ringCount; k++) {
                        const a0 = Math.random() * Math.PI * 2 + k * 0.3;
                        for (let i = 0; i < bladeCount; i++) {
                            const a = a0 + (i / bladeCount) * Math.PI * 2;
                            jieParticles.push({
                                type: 'flyblade', x: this.x, y: this.y,
                                dirX: Math.cos(a), dirY: Math.sin(a), speed: cfg.speed + k * 2,
                                life: cfg.life, maxLife: cfg.life, damage: cfg.dmg, hitCooldown: 0,
                                color: k === 0 ? '#ffaa00' : '#ff44ff'
                            });
                        }
                    }
                } else if (sk === 'summonGuard') {
                    // 召唤·规则守卫：角色当前位置白光2秒后2-6精英怪
                    act.timer = cfg.charge + 40;
                    // 规则守卫：围绕劫本体边缘呈环状召唤（白光预警后从巨物域内涌出）
                    this.spawnSummonRing('elite', cfg.minCount, cfg.maxCount, cfg.charge);
                } else if (sk === 'fireDragon') {
                    // 星轨火龙：双层旋转激光（共2层，安全扇区错开相反方向）
                    act.timer = cfg.duration;
                    const ringCount = cfg.ringCount || 1;
                    for (let k = 0; k < ringCount; k++) {
                        const baseRot = Math.random() * Math.PI * 2;
                        jieLasers.push({
                            type: 'fireDragon', x: this.x, y: this.y, angle: baseRot,
                            rotateSpeed: (k % 2 === 0 ? 1 : -1) * 0.02 * (1 + k * 0.2),
                            length: 0, maxLength: 5200, width: 40 + k * 12,
                            life: cfg.duration, maxLife: cfg.duration,
                            dmgPerSec: cfg.dmgPerSec,
                            safeSector: cfg.safeSector, hitCooldown: 0,
                            colorLayer: k
                        });
                    }
                } else if (sk === 'meteorCrush') {
                    // 星陨重压：4连砸（每1秒一波，英雄位置预判）
                    act.timer = cfg.charge * (cfg.crushCount || 1) + 80;
                    const crushCount = cfg.crushCount || 1;
                    for (let k = 0; k < crushCount; k++) {
                        // 每波预测英雄当前位置，但每波错0.3秒前摇
                        jieZones.push({
                            type: 'crush', charge: cfg.charge + k * 18,
                            x: hero.x + (Math.random() - 0.5) * 300,
                            y: hero.y + (Math.random() - 0.5) * 300,
                            radius: cfg.radius, dmg: cfg.dmg,
                            timer: cfg.charge + k * 18,
                            hitCooldown: 0, wave: k
                        });
                    }
                } else if (sk === 'reverseBarrage') {
                    // 逆转之环：反转弹幕（数量×2=36）
                    act.timer = cfg.duration;
                    this.jieReverse = { count: cfg.count, dmgPerSec: cfg.dmgPerSec, life: cfg.duration, maxLife: cfg.duration, timer: 0 };
                } else if (sk === 'frenzyChain') {
                    // 疯狂连锁：贴身连击6段（翻倍）
                    act.timer = cfg.charge + cfg.hits * 40;
                    this.jieFrenzy = { charge: cfg.charge, dmgPerHit: cfg.dmgPerHit, hits: cfg.hits, hitCooldown: 0 };
                } else if (sk === 'tidalWave') {
                    // 星海潮汐：连续3波压迫
                    act.timer = cfg.duration * (cfg.waveCount || 1) + 40;
                    act._waveState = { n: 0, total: cfg.waveCount || 1, interval: Math.max(30, cfg.duration - 10) };
                } else if (sk === 'summonMinions') {
                    // 召唤·崩坏守卫：30-50普通怪，围绕劫本体呈环状涌出
                    act.timer = cfg.charge + 40;
                    this.spawnSummonRing('normal', cfg.minCount, cfg.maxCount, cfg.charge);
                } else if (sk === 'riftBlink') {
                    // 空间折跃：3连跳（每2.5秒一落点，每跳新红圈）
                    act.timer = cfg.charge * (cfg.blinkCount || 1) + 60;
                    act._blinkState = { n: 0, total: cfg.blinkCount || 1 };
                    // 第1跳立即放圈（落点远离英雄且在地图中间80%，不堵死逃生路）
                    const lp1 = this.pickRiftLandingPoint();
                    jieZones.push({
                        type: 'rift', charge: cfg.charge,
                        x: lp1.x, y: lp1.y, radius: cfg.radius, dmg: cfg.dmg,
                        timer: cfg.charge, hitCooldown: 0
                    });
                } else if (sk === 'laserStorm') {
                    // 星轨焚天：激光风暴（20束，每波换方向）
                    act.timer = cfg.duration + 40;
                    this.jieLaserStorm = { beams: [], timer: 0, dmgPerSec: cfg.dmgPerSec, life: cfg.duration, maxLife: cfg.duration, beamCount: cfg.beamCount };
                } else if (sk === 'chaosTide') {
                    // 混沌潮汐：连续4波压迫
                    act.timer = cfg.duration * (cfg.waveCount || 1) + 40;
                    act._waveState = { n: 0, total: cfg.waveCount || 1, interval: Math.max(25, cfg.duration - 15), kind: 'chaos' };
                } else if (sk === 'summonWang') {
                    // 召唤·王boss：最多3次（用后出池）——王自劫本体内现身
                    if (this.jieWangUses < cfg.maxUses) {
                        this.jieWangUses++;
                        act.timer = cfg.charge + 40;
                        jieSummons.push({ kind: 'boss', timer: cfg.charge, x: this.x, y: this.y, min: 1, max: 1 });
                    } else {
                        act.timer = 1; // 立即结束
                    }
                } else if (sk === 'pendulum') {
                    // 钟摆召唤：频率/次数翻倍（每0.25s摆动一次，共30次）——围绕劫本体刷新
                    act.timer = cfg.swingInterval * cfg.totalSwings + 150;
                    this.jiePendulum = { swing: 0, interval: cfg.swingInterval, total: cfg.totalSwings, spawnEach: cfg.spawnEach, chaos: cfg.chaos, timer: 0 };
                } else if (sk === 'execution') {
                    // 星劫·处决：5连爆炸（每0.4s一波，预判英雄位置扩散）
                    act.timer = cfg.charge + 60 + (cfg.exCount || 1) * 24;
                    act._exState = { n: 0, total: cfg.exCount || 1, charge0: cfg.charge, cfg };
                    // 第一颗：英雄当前位置
                    jieZones.push({
                        type: 'execution', charge: cfg.charge,
                        x: hero.x, y: hero.y, radius: cfg.radius, dmg: cfg.dmg,
                        timer: cfg.charge, hitCooldown: 0, wave: 0
                    });
                } else if (sk === 'finale') {
                    // 劫灭·终章：全屏（伤害减半，留外侧安全岛）
                    act.timer = cfg.charge + 80;
                    jieZones.push({ type: 'finale', charge: cfg.charge, x: this.x, y: this.y, radius: cfg.radius, dmg: cfg.dmg, timer: cfg.charge });
                } else if (sk === 'kingLaser') {
                    // 帝君式12向预判激光（beamCount已在配置中翻倍）
                    act.timer = cfg.charge + 60;
                    jieLasers.push({
                        type: 'kingLaser', x: this.x, y: this.y, charge: cfg.charge,
                        baseRot: Math.random() * Math.PI * 2, angle: 0,
                        beamCount: cfg.beamCount, length: 0, maxLength: cfg.length, width: 26,
                        dmg: cfg.dmg, life: cfg.charge + 60, maxLife: cfg.charge + 60, hitCooldown: 0
                    });
                }
                this.jieActions.push(act);
            }

            // 推进单个行动：处理跨帧的持续/蓄力逻辑
            stepJieAction(act) {
                const hero = coopTarget(this);
                const box = this;
                // 疯狂连锁：多段连击伤害（翻倍至6段）
                if (act.type === 'frenzyChain' && this.jieFrenzy) {
                    if (this.jieFrenzy.charge > 0) this.jieFrenzy.charge--;
                    else if (this.jieFrenzy.hits > 0 && this.jieFrenzy.hitCooldown <= 0) {
                        this.jieFrenzy.hits--;
                        this.jieFrenzy.hitCooldown = 40;
                        coopHitCircle(this, this.jieFrenzy.dmgPerHit, '#ff7b00', this.x, this.y, this.radius + 60);
                        // 连击特效：每段更多粒子+冲击环
                        for (let k = 0; k < 40; k++) {
                            const a = Math.random() * Math.PI * 2;
                            jieParticles.push({ type: 'burst', x: hero.x + Math.cos(a) * 40, y: hero.y + Math.sin(a) * 40, vx: Math.cos(a) * 5, vy: Math.sin(a) * 5, life: 30, maxLife: 30, color: Math.random() < 0.5 ? '#ffbb00' : '#ff4466', size: 7 });
                        }
                        jieRings.push({ type: 'ring', x: hero.x, y: hero.y, radius: 0, maxRadius: 140, life: 20, maxLife: 20, color: '#ff7b00', width: 8 });
                    }
                    if (this.jieFrenzy.hitCooldown > 0) this.jieFrenzy.hitCooldown--;
                }
                // 逆转之环：持续反转弹幕（每6帧出2个，密度翻倍）
                if (act.type === 'reverseBarrage' && this.jieReverse) {
                    this.jieReverse.timer++;
                    if (this.jieReverse.timer % 6 === 0) {
                        for (let m = 0; m < 2; m++) {
                            const a = Math.random() * Math.PI * 2;
                            const radMul = 0.4 + 0.3 * m;
                            jieParticles.push({
                                type: 'orbit', x: this.x, y: this.y, x0: this.x, y0: this.y, angle: a, rad: this.radius * radMul,
                                life: this.jieReverse.maxLife, maxLife: this.jieReverse.maxLife,
                                damage: this.jieReverse.dmgPerSec / 60, hitCooldown: 0,
                                dir: (m === 0 ? 1 : -1)
                            });
                        }
                    }
                }
                // 星轨焚天：激光风暴持续换向（更频繁换方向+双层错开）
                if (act.type === 'laserStorm' && this.jieLaserStorm) {
                    const ls = this.jieLaserStorm;
                    ls.timer++;
                    if (ls.timer % 25 === 0) {
                        const base = Math.random() * Math.PI * 2;
                        for (let layer = 0; layer < 2; layer++) {
                            for (let i = 0; i < Math.ceil(ls.beamCount / 2); i++) {
                                jieLasers.push({
                                    type: 'stormBeam', x: this.x, y: this.y,
                                    angle: base + (i / Math.ceil(ls.beamCount / 2)) * Math.PI * 2 + (Math.random() - 0.5) * 0.3 + layer * 0.15,
                                    length: 0, maxLength: 5200, width: 18 + layer * 8,
                                    dmgPerSec: ls.dmgPerSec, life: 45 + layer * 8, maxLife: 45 + layer * 8, hitCooldown: 0,
                                    colorLayer: layer
                                });
                            }
                        }
                    }
                }
                // 钟摆召唤：每interval秒一次
                if (act.type === 'pendulum' && this.jiePendulum) {
                    const pd = this.jiePendulum;
                    pd.timer++;
                    if (pd.timer >= pd.interval && pd.swing < pd.total) {
                        pd.timer = 0; pd.swing++;
                        // 钟摆刷新：围绕劫本体边缘随机一点涌出（而非贴脸英雄）
                        const a = Math.random() * Math.PI * 2;
                        const rr = this.radius * (0.9 + Math.random() * 0.5);
                        const sx = Math.max(80, Math.min(MAP_WIDTH - 80, this.x + Math.cos(a) * rr));
                        const sy = Math.max(80, Math.min(MAP_HEIGHT - 80, this.y + Math.sin(a) * rr));
                        jieSummons.push({ kind: pd.chaos ? 'chaos' : 'normal', timer: 120, x: sx, y: sy, min: pd.spawnEach, max: pd.spawnEach });
                    }
                }
                // 潮汐（星海/混沌）按间隔持续发波
                if ((act.type === 'tidalWave' || act.type === 'chaosTide') && act._waveState) {
                    const ws = act._waveState;
                    // 首波已在startJieAction推入？不，startJieAction中tidal/chaos是push了1次ring；这里根据waveState补推剩下的n-1次
                    // 重写：每到interval就再推一波
                    if (!ws._tick) ws._tick = 0;
                    ws._tick++;
                    if (ws.n < ws.total) {
                        // 第0波在启动时推
                        if (ws.n === 0) {
                            const ringType = (ws.kind === 'chaos') ? 'chaosTide' : 'tidal';
                            const cfg = act.cfg;
                            jieRings.push({ type: ringType, x: this.x, y: this.y, radius: 0, maxRadius: cfg.radius, life: cfg.duration, maxLife: cfg.duration, dmgPerSec: cfg.dmgPerSec, width: (ws.kind === 'chaos' ? 18 : 14), hitCooldown: 0 });
                            ws.n++;
                        } else if (ws._tick >= ws.interval) {
                            ws._tick = 0;
                            const ringType = (ws.kind === 'chaos') ? 'chaosTide' : 'tidal';
                            const cfg = act.cfg;
                            jieRings.push({ type: ringType, x: this.x, y: this.y, radius: 0, maxRadius: cfg.radius, life: cfg.duration, maxLife: cfg.duration, dmgPerSec: cfg.dmgPerSec, width: (ws.kind === 'chaos' ? 18 : 14), hitCooldown: 0 });
                            ws.n++;
                        }
                    }
                }
                // 空间折跃：每 charge+6 帧再推一红圈
                if (act.type === 'riftBlink' && act._blinkState) {
                    const bs = act._blinkState;
                    if (!bs._tick) bs._tick = 0;
                    bs._tick++;
                    if (bs.n + 1 < bs.total && bs._tick >= (act.cfg.charge + 12)) {
                        bs._tick = 0;
                        bs.n++;
                        const lp = this.pickRiftLandingPoint();
                        jieZones.push({
                            type: 'rift', charge: act.cfg.charge,
                            x: lp.x, y: lp.y,
                            radius: act.cfg.radius, dmg: act.cfg.dmg,
                            timer: act.cfg.charge, hitCooldown: 0
                        });
                    }
                }
                // 处决：每 24 帧再推一波扩散爆炸
                if (act.type === 'execution' && act._exState) {
                    const es = act._exState;
                    if (!es._tick) es._tick = 0;
                    es._tick++;
                    if (es.n + 1 < es.total && es._tick >= 24) {
                        es._tick = 0;
                        es.n++;
                        // 扩散：以英雄为中心环形分布
                        const exCfg = act.cfg;
                        const centerX = hero.x, centerY = hero.y;
                        const dist = 180 + es.n * 80;
                        const a = (es.n / es.total) * Math.PI * 2;
                        jieZones.push({
                            type: 'execution', charge: Math.max(30, exCfg.charge - es.n * 18),
                            x: Math.max(80, Math.min(MAP_WIDTH - 80, centerX + Math.cos(a) * dist)),
                            y: Math.max(80, Math.min(MAP_HEIGHT - 80, centerY + Math.sin(a) * dist)),
                            radius: exCfg.radius, dmg: exCfg.dmg,
                            timer: Math.max(30, exCfg.charge - es.n * 18),
                            hitCooldown: 0, wave: es.n
                        });
                    }
                }
            }

            // 星陨环：扇形弹幕（24/36枚）
            spawnStarmeteor(cfg) {
                const hero = coopTarget(this);
                const baseAngle = Math.atan2(hero.y - this.y, hero.x - this.x);
                const fan = cfg.meteorCount > 24 ? Math.PI * 2 : 0.9; // 全向(36)或扇形(24)
                for (let i = 0; i < cfg.meteorCount; i++) {
                    const a = fan === Math.PI * 2
                        ? (i / cfg.meteorCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.2
                        : baseAngle - fan / 2 + (i / (cfg.meteorCount - 1)) * fan + (Math.random() - 0.5) * 0.1;
                    jieParticles.push({
                        type: 'meteor', x: this.x, y: this.y,
                        dirX: Math.cos(a), dirY: Math.sin(a), speed: cfg.speed,
                        life: cfg.life, maxLife: cfg.life, damage: cfg.dmg,
                        color: cfg.recolored ? '#ff66cc' : '#88ddff', hitCooldown: 0
                    });
                }
                jieRings.push({ type: 'ring', x: this.x, y: this.y, radius: 0, maxRadius: this.radius * 0.5, life: 20, maxLife: 20, color: '#66ccff', width: 6 });
            }

            // 召唤·环状涌出：围绕劫本体边缘均匀分布多个召唤点，白光预警后同时涌出
            spawnSummonRing(kind, minCount, maxCount, charge) {
                const n = 6; // 6个召唤点均匀环绕劫
                const ringR = this.radius * 1.15; // 略超出劫本体边缘
                for (let i = 0; i < n; i++) {
                    const a = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
                    // 每个召唤点承担一部分数量（总数量仍为 minCount~maxCount）
                    const perMin = Math.max(1, Math.floor(minCount / n));
                    const perMax = Math.max(perMin, Math.ceil(maxCount / n));
                    const sx = Math.max(80, Math.min(MAP_WIDTH - 80, this.x + Math.cos(a) * ringR));
                    const sy = Math.max(80, Math.min(MAP_HEIGHT - 80, this.y + Math.sin(a) * ringR));
                    jieSummons.push({ kind, timer: charge, x: sx, y: sy, min: perMin, max: perMax });
                }
            }

            // ===== 死亡掉落：10-20个数值小球（复用 maybeDropPickup，Boss必掉） =====
            dropRewards() {
                const cfg = this._cfg;
                const count = cfg.pickupCountMin +
                    Math.floor(Math.random() * (cfg.pickupCountMax - cfg.pickupCountMin + 1));
                for (let i = 0; i < count; i++) {
                    // 在巨物范围内随机散布，避免全部堆在圆心
                    const a = Math.random() * Math.PI * 2;
                    const rr = Math.random() * this.radius * 0.8;
                    maybeDropPickup(this.x + Math.cos(a)*rr, this.y + Math.sin(a)*rr, true);
                }
                // ===== 击败奖励特效：金色庆祝爆发，强化"击败压轴Boss"的获得感 =====
                // 多层扩散光环（金→白）
                jieRings.push({ type: 'ring', x: this.x, y: this.y, radius: 0, maxRadius: this.radius * 1.6, life: 40, maxLife: 40, color: '#ffd34d', width: 18 });
                jieRings.push({ type: 'ring', x: this.x, y: this.y, radius: 0, maxRadius: this.radius * 2.2, life: 55, maxLife: 55, color: '#ffffff', width: 6 });
                // 金色粒子喷泉（沿巨物范围随机爆发，象征宝库倾泻）
                for (let i = 0; i < 140; i++) {
                    const a = Math.random() * Math.PI * 2;
                    const spd = 5 + Math.random() * 14;
                    jieParticles.push({
                        type: 'burst',
                        x: this.x + (Math.random() - 0.5) * this.radius * 1.4,
                        y: this.y + (Math.random() - 0.5) * this.radius * 1.4,
                        vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
                        life: 40 + Math.random() * 40, maxLife: 80,
                        color: Math.random() < 0.5 ? '#ffd34d' : (Math.random() < 0.5 ? '#ffffff' : '#ffaa00'),
                        size: 6 + Math.random() * 8
                    });
                }
                // 屏幕震动 + 击败提示（含掉落数量，确认10-20小球）
                triggerShake(true);
                const toast = document.getElementById('pickupToast');
                if (toast) {
                    toast.textContent = `${_t('劫已被击败！')} ${count} ${_t('奖励掉落')}`;
                    toast.style.display = 'block';
                    setTimeout(() => toast.style.display = 'none', 2000);
                }
            }

            // ===== 持续流泪特效：前两阶段普通清泪，第三阶段血泪 =====
            // （泪珠从巨物上半部滑落，P3 密度更高且变为血色，强化"悲怆"叙事）
            spawnTears() {
                const r = this.radius;
                const n = this.phase >= 2 ? 2 : 1;   // 第三阶段泪珠翻倍
                for (let i = 0; i < n; i++) {
                    jieParticles.push({
                        type: 'tear',
                        x: this.x + (Math.random() - 0.5) * r * 0.7,
                        y: this.y - r * (0.3 + Math.random() * 0.4), // 从上半部滑落
                        vx: (Math.random() - 0.5) * 0.6,
                        vy: 1.2 + Math.random() * 1.2,
                        life: 45 + Math.random() * 25, maxLife: 70,
                        size: 3.5 + Math.random() * 3,
                        color: this.phase >= 2 ? '#ff2a44' : '#aaddff' // 血泪 / 清泪
                    });
                }
            }

            draw() {
                if (!this.alive) return;
                const r = this.radius;
                const t = Date.now() / 200;

                ctx.save();
                ctx.translate(this.x, this.y);

                // ===== 持续流泪特效（每帧生成泪珠） =====
                this.spawnTears();

                // ===== 阶段交接无敌护盾：金色光圈 + 呼吸光晕 =====
                if (this.jieInvuln > 0) {
                    const pulse = 0.28 + Math.sin(Date.now() / 70) * 0.14;
                    ctx.strokeStyle = 'rgba(255,211,77,0.95)';
                    ctx.lineWidth = 6;
                    ctx.shadowColor = '#ffd34d'; ctx.shadowBlur = 34;
                    ctx.beginPath(); ctx.arc(0, 0, r + 18, 0, Math.PI * 2); ctx.stroke();
                    ctx.globalAlpha = pulse;
                    ctx.fillStyle = '#ffd34d';
                    ctx.beginPath(); ctx.arc(0, 0, r + 18, 0, Math.PI * 2); ctx.fill();
                    ctx.globalAlpha = 1;
                    ctx.shadowBlur = 0;
                }

                // ===== 贴图渲染：若当前阶段贴图已加载，绘制圆形贴图 =====
                const img = this.sprite;
                if (img && jieSpritesLoaded[this.spritePath]) {
                    // 受击闪白：叠加白色半透明圆形覆盖
                    if (this.flashTime > 0) {
                        ctx.globalAlpha = 0.45;
                        ctx.fillStyle = '#ffffff';
                        ctx.beginPath();
                        ctx.arc(0, 0, r, 0, Math.PI*2);
                        ctx.fill();
                        ctx.globalAlpha = 1;
                    }
                    // 贴图本体（方形图已被裁成透明背景，直接画方形即可，圆外是透明的）
                    ctx.drawImage(img, -r, -r, r*2, r*2);
                } else {
                    // 贴图未加载完成时的占位：半透明圆盘 + 边缘描边 + 图文案
                    ctx.globalAlpha = 0.35;
                    ctx.fillStyle = '#18002a';
                    ctx.beginPath();
                    ctx.arc(0, 0, r, 0, Math.PI*2);
                    ctx.fill();
                    ctx.globalAlpha = 1;
                    ctx.strokeStyle = '#ff0044';
                    ctx.lineWidth = 4;
                    ctx.shadowColor = '#ff0044';
                    ctx.shadowBlur = 30;
                    ctx.beginPath();
                    ctx.arc(0, 0, r, 0, Math.PI*2);
                    ctx.stroke();
                    ctx.shadowBlur = 0;
                }

                // ===== 阶段贴图外圈的彩色能量光环（随阶段变色，增强巨物感） =====
                const phaseColors = ['#44ffff', '#ff44ff', '#ffaa00'];
                const pc = phaseColors[Math.min(this.phase, phaseColors.length-1)];
                ctx.strokeStyle = pc;
                ctx.lineWidth = 3;
                ctx.shadowColor = pc;
                ctx.shadowBlur = 25;
                ctx.setLineDash([30, 20]);
                ctx.beginPath();
                ctx.arc(0, 0, r + 12, 0, Math.PI*2);
                ctx.stroke();
                ctx.setLineDash([]);

                // 缓慢旋转的虚线光晕（增强"规则·齿轮"感）
                ctx.save();
                ctx.rotate(t * 0.15);
                ctx.strokeStyle = 'rgba(255,255,255,0.25)';
                ctx.lineWidth = 2;
                ctx.setLineDash([60, 40]);
                ctx.beginPath();
                ctx.arc(0, 0, r * 1.08, 0, Math.PI*2);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.restore();
                ctx.shadowBlur = 0;

                ctx.restore();
                this.drawHpBar();
            }

            drawHpBar() {
                // 巨物血条：在头顶绘制宽血条（覆盖视野），随阶段变色
                const w = Math.min(900, this.radius * 1.6), h = 14;
                ctx.fillStyle = 'rgba(0,0,0,0.55)';
                ctx.fillRect(this.x - w/2, this.y - this.radius - 40, w, h);
                const phaseColors = ['#44ffff', '#ff44ff', '#ffaa00'];
                const pc = phaseColors[Math.min(this.phase, phaseColors.length-1)];
                ctx.fillStyle = pc;
                ctx.shadowColor = pc;
                ctx.shadowBlur = 12;
                ctx.fillRect(this.x - w/2, this.y - this.radius - 40, w*(this.hp/this.maxHp), h);
                ctx.shadowBlur = 0;
            }
        }


        function showDamage(x, y, dmg, color) {
            const popup = document.createElement('div');
            popup.className = 'damage-popup';
            popup.textContent = `-${Math.floor(dmg)}`;
            const containerRect = document.getElementById('gameContainer').getBoundingClientRect();
            popup.style.left = (containerRect.left + 240 + x - camX) + 'px';
            popup.style.top = (containerRect.top + y - camY) + 'px';
            popup.style.color = color;
            document.body.appendChild(popup);
            setTimeout(() => popup.remove(), 800);
        }

        function showCritDamage(x, y, dmg, color) {
            const popup = document.createElement('div');
            popup.className = 'crit-popup';
            popup.textContent = `${_t('暴击 -')}${Math.floor(dmg)}!`;
            const containerRect = document.getElementById('gameContainer').getBoundingClientRect();
            popup.style.left = (containerRect.left + 240 + x - camX - 40) + 'px';
            popup.style.top = (containerRect.top + y - camY - 20) + 'px';
            popup.style.color = color;
            document.body.appendChild(popup);
            setTimeout(() => popup.remove(), 1000);
        }

        function triggerShake(strong = false) {
            const c = document.getElementById('gameContainer');
            c.classList.remove('shake', 'shake-strong');
            void c.offsetWidth;
            c.classList.add(strong ? 'shake-strong' : 'shake');
        }

        function triggerSlowMo(frames = 120) {
            slowMoTimer = frames;
            document.getElementById('slowmoOverlay').style.display = 'block';
        }

        function addCombo() {
            combo++;
            comboTimer = COMBO_TIMEOUT;
            const el = document.getElementById('comboDisplay');
            document.getElementById('comboNum').textContent = combo;
            if (combo >= 2) {
                el.style.display = 'block';
                el.style.animation = 'none';
                void el.offsetWidth;
                el.style.animation = 'combo-pulse 0.4s ease-out';
            }
        }

        function updateCombo() {
            if (comboTimer > 0) {
                comboTimer--;
                if (comboTimer <= 0) {
                    combo = 0;
                    document.getElementById('comboDisplay').style.display = 'none';
                }
            }
        }

        function calcDamage(base) {
            const comboBonus = 1 + Math.min(combo * 0.05, 1.0);
            const isCrit = Math.random() < critRate;
            const critMul = isCrit ? critDmgMult : 1.0;
            // 肉鸽加成的伤害值提升70%（原 heroDamageBonus 整体乘以1.7）
            // 例：原本"普攻+30%"肉鸽现在等价"普攻+51%"，所有伤害计算走此函数即可生效
            const dmgBonus = 1 + heroDamageBonus * 1.7;
            return { dmg: Math.floor(base * comboBonus * critMul * dmgBonus), isCrit };
        }

        function spawnHitParticles(x, y, color, count = 8) {
            for (let i = 0; i < count; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 2 + Math.random() * 4;
                particles.push({
                    type: 'hit',
                    x: x, y: y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    life: 20 + Math.random() * 15,
                    maxLife: 35,
                    color: color,
                    size: 2 + Math.random() * 3
                });
            }
        }

        function spawnDeathExplosion(x, y, color, big = false) {
            const count = big ? 40 : 20;
            for (let i = 0; i < count; i++) {
                const angle = (i / count) * Math.PI * 2 + Math.random() * 0.3;
                const speed = (big ? 5 : 3) + Math.random() * 4;
                particles.push({
                    type: 'explosion',
                    x: x, y: y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    life: 30 + Math.random() * 20,
                    maxLife: 50,
                    color: color,
                    size: (big ? 5 : 3) + Math.random() * 4
                });
            }
            // 中心冲击波
            particles.push({
                type: 'shockwave',
                x: x, y: y,
                radius: 0,
                maxRadius: big ? 180 : 80,
                life: 25, maxLife: 25,
                color: color
            });
        }

        function spawnEmperorDeathEffect(x, y, color) {
            // 1. 3秒慢动作
            triggerSlowMo(180);
            // 2. 屏幕碎裂特效
            screenShatterTime = 90;
            screenShatterColor = color;
            // 3. 全屏震屏
            triggerShake(true);
            // 4. 60+紫红粒子爆发（多层冲击波）
            for (let i = 0; i < 60; i++) {
                const angle = (i / 60) * Math.PI * 2 + Math.random() * 0.2;
                const speed = 4 + Math.random() * 10;
                emperorParticles.push({
                    type: 'burst', x: x, y: y,
                    vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
                    life: 50 + Math.random() * 30, maxLife: 80,
                    color: i % 3 === 0 ? '#ffffff' : (i % 2 === 0 ? '#ff3300' : '#ff8800'),
                    size: 4 + Math.random() * 8
                });
            }
            // 5. 双层冲击波光环
            emperorRings.push({ x: x, y: y, radius: 0, maxRadius: 300, life: 40, maxLife: 40, color: '#ff3300', width: 12 });
            emperorRings.push({ x: x, y: y, radius: 0, maxRadius: 200, life: 30, maxLife: 30, color: '#ffffff', width: 6 });
            // 6. 屏幕碎裂放射线（10条）
            for (let i = 0; i < 10; i++) {
                const angle = (i / 10) * Math.PI * 2;
                emperorDeathEffects.push({
                    type: 'crack', x: x, y: y,
                    angle: angle, length: 0, maxLength: 400 + Math.random() * 200,
                    life: 60, maxLife: 60, color: color
                });
            }
        }

        function spawnAbyssDeathEffect(x, y) {
            // 3秒慢动作
            triggerSlowMo(180);
            // 屏幕碎裂（紫黑色）
            screenShatterTime = 90;
            screenShatterColor = '#1a0033';
            triggerShake(true);
            // 80+紫黑+白色粒子爆发
            for (let i = 0; i < 80; i++) {
                const angle = (i / 80) * Math.PI * 2 + Math.random() * 0.2;
                const speed = 3 + Math.random() * 9;
                abyssParticles.push({
                    type: 'burst', x: x, y: y,
                    vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
                    life: 60 + Math.random() * 40, maxLife: 100,
                    color: i % 4 === 0 ? '#ffffff' : (i % 3 === 0 ? '#1a0033' : '#4a0080'),
                    size: 5 + Math.random() * 10
                });
            }
            // 双层冲击波
            abyssRings.push({ x: x, y: y, radius: 0, maxRadius: 350, life: 50, maxLife: 50, color: '#1a0033', width: 14 });
            abyssRings.push({ x: x, y: y, radius: 0, maxRadius: 220, life: 35, maxLife: 35, color: '#88ccff', width: 6 });
            // 碎裂放射线（12条，紫黑色）
            for (let i = 0; i < 12; i++) {
                const angle = (i / 12) * Math.PI * 2;
                abyssDeathEffects.push({
                    type: 'crack', x: x, y: y,
                    angle: angle, length: 0, maxLength: 450 + Math.random() * 200,
                    life: 70, maxLife: 70, color: '#1a0033'
                });
            }
        }

        function drawScreenShatter() {
            if (screenShatterTime <= 0) return;
            const alpha = screenShatterTime / 90;
            ctx.save();
            // 全屏色调滤镜
            ctx.globalAlpha = alpha * 0.3;
            ctx.fillStyle = screenShatterColor;
            ctx.fillRect(camX, camY, WIDTH, HEIGHT);
            ctx.restore();
            screenShatterTime--;
        }

        function drawDeathCracks(effects) {
            for (let i = effects.length - 1; i >= 0; i--) {
                const c = effects[i];
                c.life--;
                if (c.life <= 0) { effects.splice(i, 1); continue; }
                const prog = 1 - c.life / c.maxLife;
                c.length = c.maxLength * Math.min(1, prog * 1.5);
                const alpha = c.life / c.maxLife;
                const endX = c.x + Math.cos(c.angle) * c.length;
                const endY = c.y + Math.sin(c.angle) * c.length;
                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.strokeStyle = c.color;
                ctx.lineWidth = 4 + (1 - alpha) * 3;
                ctx.shadowColor = c.color;
                ctx.shadowBlur = 20;
                ctx.beginPath();
                ctx.moveTo(c.x, c.y);
                // 锯齿状裂纹
                const segs = 6;
                for (let s = 1; s <= segs; s++) {
                    const t = s / segs;
                    const px = c.x + (endX - c.x) * t + (Math.random() - 0.5) * 15;
                    const py = c.y + (endY - c.y) * t + (Math.random() - 0.5) * 15;
                    ctx.lineTo(px, py);
                }
                ctx.stroke();
                ctx.restore();
            }
        }

        function spawnTrail() {
            if (!hero || !hero.alive) return;
            trailParticles.push({
                x: hero.x, y: hero.y,
                life: 15, maxLife: 15,
                size: 20
            });
            if (trailParticles.length > 30) trailParticles.shift();
        }

        function maybeDropPickup(x, y, isBossKill = false) {
            // 掉落几率提升30%：普通怪 0.08→0.104，Boss保持100%
            const chance = isBossKill ? 1.0 : 0.104;
            if (Math.random() < chance) {
                const types = isBossKill
                    ? ['heal', 'crit', 'critDmg', 'bomb', 'dmgUp', 'dmgDown']
                    : ['heal', 'crit', 'critDmg', 'dmgUp', 'dmgDown'];
                const t = types[Math.floor(Math.random() * types.length)];
                pickups.push({
                    x: x, y: y,
                    type: t,
                    life: 600,
                    bob: Math.random() * Math.PI * 2
                });
            }
        }

        function applyPickup(p, who) {
            // 联机：掉落归谁，回血和数值增益就落到谁身上（各人一份）
            const tgt = (who && who !== hero && who.hp != null && who.maxHp) ? who : hero;
            const isAlly = (tgt !== hero);
            const pickArtifact = isAlly ? (tgt.artifact || null) : selectedArtifactKey;
            // ===== 幸运硬币神器：10%概率触发双倍效果 =====
            const isLuckyDouble = (pickArtifact === 'luckyCoin' && Math.random() < 0.1);
            const toast = document.getElementById('pickupToast');
            let msg = '';
            if (p.type === 'heal') {
                const healBase = Math.floor(tgt.maxHp * 0.3);
                const heal = isLuckyDouble ? healBase * 2 : healBase;
                tgt.hp = Math.min(tgt.maxHp, tgt.hp + heal);
                msg = `+${heal} ${_t('生命恢复')}${isLuckyDouble ? _t('（幸运双倍！）') : ''}`;
            } else if (p.type === 'crit') {
                const critInc = isLuckyDouble ? 0.06 : 0.03;
                if (isAlly) {
                    const cur = Number(tgt.critRate) || 0;
                    if (cur >= 1.0) {
                        tgt.critDmg = (Number(tgt.critDmg) || 1.5) + critInc * 1.5;
                    } else if (cur + critInc > 1.0) {
                        tgt.critDmg = (Number(tgt.critDmg) || 1.5) + (cur + critInc - 1.0) * 1.5;
                        tgt.critRate = 1.0;
                    } else {
                        tgt.critRate = cur + critInc;
                    }
                } else {
                    addCritRate(critInc);
                }
                msg = `+${Math.floor(critInc*100)}% ${_t('暴击率')}${isLuckyDouble ? _t('（幸运双倍！）') : ''}`;
            } else if (p.type === 'critDmg') {
                const critDmgInc = isLuckyDouble ? 0.06 : 0.03;
                if (isAlly) tgt.critDmg = (Number(tgt.critDmg) || 1.5) + critDmgInc;
                else critDmgMult += critDmgInc;
                msg = `+${Math.floor(critDmgInc*100)}% ${_t('暴击伤害')}${isLuckyDouble ? _t('（幸运双倍！）') : ''}`;
            } else if (p.type === 'bomb') {
                const bombDmg = isLuckyDouble ? 1000 : 500;
                for (const e of enemies.slice()) {
                    if (e.alive && !e.isBoss && !e.isEmperor) {
                        e.hp -= bombDmg;
                        if (e.hp <= 0) {
                            e.alive = false;
                            totalKills++;
                            spawnDeathExplosion(e.x, e.y, e.color);
                        }
                    }
                }
                msg = `${_t('清屏炸弹！')}${isLuckyDouble ? _t('（幸运双倍伤害！）') : ''}`;
                triggerShake(true);
            } else if (p.type === 'dmgUp') {
                const dmgInc = isLuckyDouble ? 0.04 : 0.02;
                if (isAlly) tgt.dmgBonus = (Number(tgt.dmgBonus) || 0) + dmgInc;
                else heroDamageBonus += dmgInc;
                msg = `+${Math.floor(dmgInc*100)}% ${_t('伤害增加')}${isLuckyDouble ? _t('（幸运双倍！）') : ''}`;
            } else if (p.type === 'dmgDown') {
                const dmgDownInc = isLuckyDouble ? 0.04 : 0.02;
                if (isAlly) {
                    let cur = Number(tgt.damageReduction) || 0;
                    if (cur < 0.95) {
                        const add = Math.min(dmgDownInc, 0.95 - cur);
                        const overflow = dmgDownInc - add;
                        tgt.damageReduction = cur + add;
                        if (overflow > 0) {
                            tgt.dmgBonus = (Number(tgt.dmgBonus) || 0) + overflow;
                            msg = `+${Math.floor(add*100)}% ${_t('伤害减免（已达上限），溢出+')}${Math.floor(overflow*100)}% ${_t('伤害增加')}${isLuckyDouble ? _t('（幸运双倍！）') : ''}`;
                        } else {
                            msg = `+${Math.floor(dmgDownInc*100)}% ${_t('伤害减免')}${isLuckyDouble ? _t('（幸运双倍！）') : ''}`;
                        }
                    } else {
                        tgt.dmgBonus = (Number(tgt.dmgBonus) || 0) + dmgDownInc;
                        msg = `${_t('伤害减免已满95%，+')}${Math.floor(dmgDownInc*100)}% ${_t('转为伤害增加')}${isLuckyDouble ? _t('（幸运双倍！）') : ''}`;
                    }
                } else if (heroDamageReduction < 0.95) {
                    const add = Math.min(dmgDownInc, 0.95 - heroDamageReduction);
                    const overflow = dmgDownInc - add;
                    heroDamageReduction += add;
                    if (overflow > 0) {
                        heroDamageBonus += overflow;
                        msg = `+${Math.floor(add*100)}% ${_t('伤害减免（已达上限），溢出+')}${Math.floor(overflow*100)}% ${_t('伤害增加')}${isLuckyDouble ? _t('（幸运双倍！）') : ''}`;
                    } else {
                        msg = `+${Math.floor(dmgDownInc*100)}% ${_t('伤害减免')}${isLuckyDouble ? _t('（幸运双倍！）') : ''}`;
                    }
                } else {
                    heroDamageBonus += dmgDownInc;
                    msg = `${_t('伤害减免已满95%，+')}${Math.floor(dmgDownInc*100)}% ${_t('转为伤害增加')}${isLuckyDouble ? _t('（幸运双倍！）') : ''}`;
                }
            }
            // 幸运硬币触发双倍时额外金币粒子特效
            if (isLuckyDouble) {
                for (let i = 0; i < 15; i++) {
                    const a = (i / 15) * Math.PI * 2;
                    particles.push({
                        type: 'hit', x: tgt.x, y: tgt.y,
                        vx: Math.cos(a) * 4, vy: Math.sin(a) * 4,
                        life: 30, maxLife: 30, color: '#ffdd44', size: 5
                    });
                }
                particles.push({ type: 'ringExpand', x: tgt.x, y: tgt.y, color: '#ffdd44', maxRadius: 60, life: 20, maxLife: 20 });
            }
            // 幸运硬币触发双倍时额外金币粒子特效
            if (isLuckyDouble) {
                for (let i = 0; i < 15; i++) {
                    const a = (i / 15) * Math.PI * 2;
                    particles.push({
                        type: 'hit', x: hero.x, y: hero.y,
                        vx: Math.cos(a) * 4, vy: Math.sin(a) * 4,
                        life: 30, maxLife: 30, color: '#ffdd44', size: 5
                    });
                }
                particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#ffdd44', maxRadius: 60, life: 20, maxLife: 20 });
            }
            toast.textContent = msg;
            toast.style.display = 'block';
            setTimeout(() => toast.style.display = 'none', 1500);
        }

        function drawPickups() {
            // 终焉模式 / 诅咒之夜 / 疯狂之夜 自动拾取所有掉落小球：全图吸附，速度按距离缩放确保快速到达
            const isAutoPickup = (selectedDifficultyKey === 'end' || curseNightMode || madnessNightMode);
            for (let i = pickups.length - 1; i >= 0; i--) {
                const p = pickups[i];
                p.life--;
                p.bob += 0.1;
                const yo = Math.sin(p.bob) * 5;
                // 吸附：双人联机时朝离掉落更近的那个玩家飞，捡到后的增益仍算共享
                const _pt = (typeof coopTarget === 'function') ? coopTarget(p) : hero;
                const dx = _pt.x - p.x, dy = _pt.y - p.y;
                const d = Math.sqrt(dx*dx + dy*dy);
                if (isAutoPickup) {
                    // 终焉模式：全图自动吸附，距离越远飞得越快
                    if (d > 0) {
                        const speed = Math.max(4, d / 8);  // 最小4px/帧，远距离加速
                        p.x += (dx/d) * speed;
                        p.y += (dy/d) * speed;
                    }
                    if (d < 40) {
                        applyPickup(p, _pt);
                        pickups.splice(i, 1);
                        continue;
                    }
                } else {
                    // 其他模式：原有80px吸附+25px拾取逻辑
                    if (d < 80) {
                        p.x += (dx/d) * 4;
                        p.y += (dy/d) * 4;
                    }
                    if (d < 25) {
                        applyPickup(p, _pt);
                        pickups.splice(i, 1);
                        continue;
                    }
                }
                if (p.life <= 0) { pickups.splice(i, 1); continue; }

                const colors = { heal: '#44ff44', crit: '#ffcc00', critDmg: '#ff8800', bomb: '#ff4444', dmgUp: '#ff3366', dmgDown: '#33aaff' };
                const labels = { heal: _t('血'), crit: _t('暴'), critDmg: _t('伤'), bomb: _t('弹'), dmgUp: _t('增'), dmgDown: _t('减') };
                ctx.save();
                ctx.translate(p.x, p.y + yo);
                ctx.fillStyle = colors[p.type];
                ctx.shadowColor = colors[p.type];
                ctx.shadowBlur = 20;
                ctx.beginPath();
                ctx.arc(0, 0, 12, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 11px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(labels[p.type], 0, 0);
                // 闪烁警告（即将消失）
                if (p.life < 120 && Math.floor(p.life / 10) % 2 === 0) {
                    ctx.globalAlpha = 0.3;
                }
                ctx.restore();
            }
        }

        function drawTrailParticles() {
            // ===== 特效优化：拖尾粒子使用渐变+辉光，视觉更柔和 =====
            for (let i = trailParticles.length - 1; i >= 0; i--) {
                const t = trailParticles[i];
                t.life--;
                const alpha = Math.max(0, t.life / t.maxLife);
                ctx.save();
                ctx.globalAlpha = alpha * 0.35;
                // 外层光晕（大半径低透明度）
                ctx.fillStyle = t.color || '#ef4444';
                ctx.shadowColor = t.color || '#ef4444';
                ctx.shadowBlur = perfLevel >= 2 ? 0 : 12;
                ctx.beginPath();
                ctx.arc(t.x, t.y, Math.max(0.1, t.size * alpha * 1.3), 0, Math.PI * 2);
                ctx.fill();
                // 内层亮点（小半径高透明度，增加层次感）
                ctx.globalAlpha = alpha * 0.6;
                ctx.shadowBlur = 0;
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(t.x, t.y, Math.max(0.1, t.size * alpha * 0.5), 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                if (t.life <= 0) trailParticles.splice(i, 1);
            }
        }

        function updateBossBar() {
            const bar = document.getElementById('bossBar');
            // 过滤已死的Boss（死亡动画期间不清理，保留尸体显示血条）
            if (bossDeathDelay <= 0) {
                bossRefs = bossRefs.filter(b => b && b.alive);
            }
            if (bossAlive && bossRefs.length > 0) {
                bar.style.display = 'block';
                // 第一行血条
                const b1 = bossRefs[0];
                const row1 = document.getElementById('bossRow1');
                row1.style.display = 'block';
                document.getElementById('bossName1').textContent = getBossDisplayName(b1) + _t(' · 第') + wave + _t('波');
                const pct1 = Math.max(0, Math.min(100, b1.maxHp > 0 ? (b1.hp / b1.maxHp * 100) : 0));
                document.getElementById('bossHpFill1').style.width = pct1 + '%';
                document.getElementById('bossHpFill1').style.background = getBossColor(b1);
                document.getElementById('bossHpPct1').textContent = pct1.toFixed(1) + '%';
                // 第二行血条（仅双Boss时显示）
                const row2 = document.getElementById('bossRow2');
                if (bossRefs.length >= 2) {
                    const b2 = bossRefs[1];
                    row2.style.display = 'block';
                    document.getElementById('bossName2').textContent = getBossDisplayName(b2);
                    const pct2 = Math.max(0, Math.min(100, b2.maxHp > 0 ? (b2.hp / b2.maxHp * 100) : 0));
                    document.getElementById('bossHpFill2').style.width = pct2 + '%';
                    document.getElementById('bossHpFill2').style.background = getBossColor(b2);
                    document.getElementById('bossHpPct2').textContent = pct2.toFixed(1) + '%';
                } else {
                    row2.style.display = 'none';
                }
            } else {
                bar.style.display = 'none';
                bossAlive = false;
            }
        }

        function getBossDisplayName(b) {
            if (b.isEmperor) return _t('帝君');
            if (b.isAbyss) return _t('冥渊');
            if (b.isBladeMaster) return _t('剑圣');
            if (b.isMadEye) return _t('妄瞳');
            if (b.isYou) return _t('幽');
            if (b.isJie) return _t('劫');
            return _t('霸王');
        }

        function getBossColor(b) {
            if (b.isEmperor) return b.emperorEnraged ? '#ff6600' : '#8B0000';
            if (b.isAbyss) return b.abyssEnraged ? '#ff66ff' : '#88ccff';
            if (b.isBladeMaster) return b.bladeEnraged ? '#ffffff' : '#4488ff';
            if (b.isMadEye) return '#cc00ff';
            if (b.isYou) return b.youEnraged ? '#ffff00' : '#ff2200';
            if (b.isJie) return '#ffd34d';
            return '#ff0066';
        }

        function createGreenAoe() {
            particles.push({
                type: 'green',
                x: hero.x,
                y: hero.y,
                life: 20,
                maxLife: 20
            });
            // 关羽普攻带刀光特效
            if (currentHero === 'guanyu') {
                for (let i = 0; i < 8; i++) {
                    const angle = (i / 8) * Math.PI * 2;
                    particles.push({
                        type: 'greenSlash',
                        x: hero.x,
                        y: hero.y,
                        vx: Math.cos(angle) * 6,
                        vy: Math.sin(angle) * 6,
                        angle: angle,
                        life: 18,
                        maxLife: 18
                    });
                }
                particles.push({
                    type: 'greenSlash2',
                    x: hero.x,
                    y: hero.y,
                    life: 20,
                    maxLife: 20,
                    radius: 0
                });
            }
        }

        function drawGreenAoe(p) {
            const alpha = p.life / p.maxLife;
            ctx.save();
            ctx.globalAlpha = alpha * 0.5;
            ctx.strokeStyle = '#44ff44';
            ctx.lineWidth = 3;
            ctx.shadowColor = '#44ff44';
            ctx.shadowBlur = 15;
            
            const radius = GRID * 1.66;
            for (let i = 0; i < 4; i++) {
                const angle = (i / 4) * Math.PI * 2;
                const x = p.x + Math.cos(angle) * radius;
                const y = p.y + Math.sin(angle) * radius;
                
                ctx.beginPath();
                ctx.arc(x, y, 8, 0, Math.PI * 2);
                ctx.stroke();
                
                ctx.fillStyle = 'rgba(68,255,68,0.3)';
                ctx.fill();
            }
            
            ctx.restore();
        }

        function drawGreenSlash(p) {
            const alpha = p.life / p.maxLife;
            const dist = (p.maxLife - p.life) * 5;
            const x = p.x + Math.cos(p.angle) * dist;
            const y = p.y + Math.sin(p.angle) * dist;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = '#44ff44';
            ctx.lineWidth = 4;
            ctx.shadowColor = '#44ff44';
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.moveTo(p.x + Math.cos(p.angle) * (dist - 25), p.y + Math.sin(p.angle) * (dist - 25));
            ctx.lineTo(x, y);
            ctx.stroke();
            ctx.restore();
        }

        function drawGreenSlash2(p) {
            const alpha = p.life / p.maxLife;
            p.radius += 4;
            const rangeMult = guanYuRangeBoost > 0 ? (4 + enhGuanYuRangeMult) : 1;
            const maxR = GRID * 1.66 * rangeMult + (p.maxLife - p.life) * 3;
            ctx.save();
            ctx.globalAlpha = alpha * 0.6;
            ctx.strokeStyle = '#44ff44';
            ctx.lineWidth = 3;
            ctx.shadowColor = '#44ff44';
            ctx.shadowBlur = 20;
            ctx.beginPath();
            ctx.arc(p.x, p.y, Math.min(p.radius, maxR), 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

