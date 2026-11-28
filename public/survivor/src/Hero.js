// ============================================================
// 文件: src/Hero.js
// 描述: Hero 类
// 行范围: 4464-4949 (原 game.js)
// 注意: 本文件由原版 HTML 抽取，保持原作用域不变
// ============================================================

        class Hero {
            constructor(x, y) {
                this.x = x;
                this.y = y;
                this.alive = true;
                this.hp = stats.hp;
                this.maxHp = stats.hp;
                this.facing = -1;
                this.invincibleTime = 0;
                this.rageTime = 0;
                this.radius = 20; // 英雄半径（与普通怪一致：20）
                this.shield = 0;  // 临时护盾（张飞万人敌）
            }
            
            update() {
                if (!this.alive) return;
                // 时空静止时英雄也不动（冥渊Boss的timeFrozen冻结所有人）
                if (timeFrozen) return;
                // 劫·规则罗盘定身英雄：>0时无法移动（攻城技）
                if (jieHeroFreezeTimer > 0) { jieHeroFreezeTimer--; return; }
                // 注意：左慈二技能 zhiFreezeTimer 只冻结敌人，不冻结英雄自己
                // 之前错误的 `if (zhiFreezeTimer > 0) return;` 已移除——英雄应在敌人冻结时自由移动
                // 韩非雾隐 heroFreezeTimer 也只冻结敌方，不影响英雄移动

                if (this.invincibleTime > 0) {
                    this.invincibleTime--;
                }
                // 貂蝉三技能移速增益（40%持续2秒，不随肉鸽增强）
                if (diaoChanSpeedBoostTimer > 0) diaoChanSpeedBoostTimer--;

                // 吕蒙疾风步移速增益
                if (lvmengSpeedBoostTimer > 0) lvmengSpeedBoostTimer--;

                // ===== 新增：诸葛亮/张飞/周瑜状态倒计时 =====
                if (zhugeLiangSpeedTimer > 0) zhugeLiangSpeedTimer--;
                if (zhugeLiangAoeBoostTimer > 0) zhugeLiangAoeBoostTimer--;
                if (zhugeLiangRadiusBoostTimer > 0) {
                    zhugeLiangRadiusBoostTimer--;
                    // 技能3激活：半径+200%（即3倍默认半径20=60）+肉鸽增强0.4倍
                    this.radius = 20 * (3 + enhZhugeLiangRadiusMult);
                } else {
                    this.radius = 20; // 默认半径
                }
                if (zhangFeiInvincibleTimer > 0) zhangFeiInvincibleTimer--;
                // ===== 张飞护盾倒计时 =====
                if (zhangFeiShieldTimer > 0) {
                    zhangFeiShieldTimer--;
                    if (zhangFeiShieldTimer <= 0) {
                        this.shield = 0; // 护盾到期清零
                    }
                }

                // 诸葛亮一技能加速55%（+肉鸽每次+5%）
                const zglSpeedMult = zhugeLiangSpeedTimer > 0 ? (1 + 0.55 + enhZhugeLiangSpeed) : 1;
                const lvmengSpeedMult = lvmengSpeedBoostTimer > 0 ? (1 + 0.6 + enhLvmengSpeed) : 1;
                // 韩非视线替换：加速40%（+肉鸽每次+7%）
                const hanFeiSpeedMult = hanFeiSpeedBoostTimer > 0 ? (1 + 0.4 + enhHanFeiSpeed) : 1;
                if (hanFeiSpeedBoostTimer > 0) hanFeiSpeedBoostTimer--;
                // ===== 原创角色状态递减：司马懿飞行/天罚、典韦烬燃、鲁肃潮汐/护盾/海啸、张角眩晕/审判、左慈裂隙/冻结/崩塌/回溯快照 =====
                // 司马懿：天空之眼起飞加速倒计时 + 风之印记加速倒计时 + 天罚之雷持续打击
                if (cangqiongFlyingTimer > 0) cangqiongFlyingTimer--;
                if (cangqiongWindMarkTimer > 0) cangqiongWindMarkTimer--;
                if (cangqiongThunderStormTimer > 0) {
                    cangqiongThunderStormTimer--;
                    cangqiongThunderStormTickTimer++;
                    // 每30帧（0.5秒）造成一次全屏雷电打击
                    if (cangqiongThunderStormTickTimer >= 30) {
                        cangqiongThunderStormTickTimer = 0;
                        const stormDmg = stats.skill3 + enhCangqiongThunderDmg;
                        // 收集本次被击中的敌人，用于落雷特效
                        const struckEnemies = [];
                        for (let e of enemies.slice()) {
                            if (!e.alive) continue;
                            const dx = e.x - this.x, dy = e.y - this.y;
                            if (Math.sqrt(dx*dx + dy*dy) < 490) {
                                dealDamage(e, stormDmg, '#ffff44', 5);
                                struckEnemies.push(e);
                            }
                        }
                        // 对每个被击中的敌人生成一道从天而降的落雷光束
                        for (const e of struckEnemies) {
                            particles.push({
                                type: 'beam', x: e.x, y: e.y - 250,
                                dx: 0, dy: 1, length: 280, color: '#ffff88', life: 12, maxLife: 12
                            });
                            particles.push({
                                type: 'beam', x: e.x, y: e.y - 200,
                                dx: 0, dy: 1, length: 220, color: '#ffffff', life: 8, maxLife: 8
                            });
                            particles.push({
                                type: 'shockExplosion', x: e.x, y: e.y,
                                color: '#ffff44', maxRadius: 45, life: 18, maxLife: 18
                            });
                        }
                        // 风暴中心落雷：英雄附近随机雷击
                        for (let i = 0; i < 4; i++) {
                            const rx = this.x + (Math.random() - 0.5) * 200;
                            const ry = this.y + (Math.random() - 0.5) * 200;
                            particles.push({
                                type: 'beam', x: rx, y: ry - 180,
                                dx: 0, dy: 1, length: 200, color: '#ffff88', life: 10, maxLife: 10
                            });
                        }
                        // 全屏随机雷电光柱粒子（背景氛围）
                        for (let i = 0; i < 8; i++) {
                            particles.push({
                                type: 'beam', x: camX + Math.random() * WIDTH, y: camY + Math.random() * HEIGHT,
                                dx: 0, dy: 1, length: 80 + Math.random() * 60, color: '#ffff88', life: 14, maxLife: 14
                            });
                        }
                    }
                }
                // 典韦：烬燃状态倒计时
                if (jinEmberBurnTimer > 0) jinEmberBurnTimer--;
                // 鲁肃：潮汐护盾到期清除 + 每秒回血 + 海啸持续伤害
                if (lanShieldTimer > 0) {
                    lanShieldTimer--;
                    lanShieldHealTickTimer++;
                    // 每秒（30帧）回5%最大生命+肉鸽每次+2%
                    if (lanShieldHealTickTimer >= 30) {
                        lanShieldHealTickTimer = 0;
                        const healAmount = Math.floor(this.maxHp * (0.05 + enhLanHealPct));
                        this.hp = Math.min(this.maxHp, this.hp + healAmount);
                        // 回血上升粒子
                        for (let i = 0; i < 8; i++) {
                            const a = (i / 8) * Math.PI * 2;
                            particles.push({
                                type: 'hit', x: this.x + Math.cos(a) * 30, y: this.y + Math.sin(a) * 30,
                                vx: 0, vy: -2, life: 25, maxLife: 25, color: '#00CED1', size: 6
                            });
                        }
                    }
                    if (lanShieldTimer <= 0) {
                        // 护盾到期：仅清除本技能赋予的护盾量（不清除其他来源护盾）
                        this.shield = Math.max(0, (this.shield || 0) - lanShieldAmount);
                    }
                }
                if (lanTsunamiTimer > 0) {
                    lanTsunamiTimer--;
                    // 深海怒涛：仅在释放瞬间造成一次伤害+6秒减速，持续期间仅保留视觉效果
                }
                // 左慈：冻结/崩塌/裂隙倒计时
                if (zhiFreezeTimer > 0) zhiFreezeTimer--;
                if (zhiCollapseTimer > 0) {
                    zhiCollapseTimer--;
                    // 时空崩塌：仅在释放瞬间造成一次伤害+6秒减速，持续期间仅保留视觉效果
                }
                if (zhiRiftTimer > 0) {
                    zhiRiftTimer--;
                    zhiRiftTickTimer++;
                    // 时空裂隙：每秒（30帧）对半径250内敌人造成伤害
                    if (zhiRiftTickTimer >= 30) {
                        zhiRiftTickTimer = 0;
                        const dmg = stats.skill1 + enhZhiRiftDmg;
                        for (let e of enemies.slice()) {
                            if (!e.alive) continue;
                            const dx = e.x - zhiRiftX, dy = e.y - zhiRiftY;
                            if (Math.sqrt(dx*dx + dy*dy) < 250) {
                                dealDamage(e, dmg, '#9370DB', 6);
                            }
                        }
                        // 裂隙脉冲粒子
                        for (let i = 0; i < 12; i++) {
                            const a = (i / 12) * Math.PI * 2 + (zhiRiftTimer * 0.1);
                            const r = 80 + Math.random() * 120;
                            particles.push({
                                type: 'hit', x: zhiRiftX + Math.cos(a) * r, y: zhiRiftY + Math.sin(a) * r,
                                vx: Math.cos(a) * 2, vy: Math.sin(a) * 2,
                                life: 20, maxLife: 20, color: i % 2 === 0 ? '#9370DB' : '#BA55D3', size: 5
                            });
                        }
                    }
                }
                // ===== 原创角色状态递减：陆逊光环/燃烧双轨，甄姬暴风雪，于吉藤蔓/自然之怒，黄盖棱镜 =====
                // 陆逊：焚身烈焰护环（150范围，每秒造成 50+enhYanAuraDmg 伤害 + 叠1层燃烧叠层）
                // 设计说明：类似吕布霸王护体的自身周围护环机制，但使用火焰粒子螺旋上升+橙红火环
                if (yanBurnAuraTimer > 0) {
                    yanBurnAuraTimer--;
                    yanBurnAuraTickTimer++;
                    if (yanBurnAuraTickTimer >= 30) {
                        yanBurnAuraTickTimer = 0;
                        const auraDmg = stats.skill2 + enhYanAuraDmg;
                        for (let e of enemies.slice()) {
                            if (!e.alive) continue;
                            const dx = e.x - this.x, dy = e.y - this.y;
                            if (Math.sqrt(dx*dx + dy*dy) < 150) {  // 150范围护环（类似吕布120半径）
                                dealDamage(e, auraDmg, '#FF4500', 4);
                                // 叠加1层燃烧叠层（addYanBurnStacks 内部自动每5层转1层正在燃烧）
                                addYanBurnStacks(e, 1);
                            }
                        }
                        // 火焰护环粒子：12个螺旋上升火焰粒子（与吕布8个金球旋转明显区分）
                        for (let i = 0; i < 12; i++) {
                            const a = (i / 12) * Math.PI * 2 + (yanBurnAuraTimer * 0.1);  // 随时间旋转
                            const r = 130 + Math.sin(yanBurnAuraTimer * 0.2 + i) * 15;     // 半径微浮动
                            particles.push({
                                type: 'flame',
                                x: this.x + Math.cos(a) * r,
                                y: this.y + Math.sin(a) * r,
                                vx: Math.cos(a) * 0.5, vy: -1.5 - Math.random() * 1,  // 螺旋上升
                                life: 30, maxLife: 30, size: 6
                            });
                        }
                    }
                }
                // 陆逊燃烧双轨制 - 正在燃烧层独立处理（核心机制）
                // 每个正在燃烧层独立计时 180帧(3秒)，每30帧(1秒)造成 (30 + enhYanBurnDmg) 伤害
                // 时间到后该层独立从数组中移除
                if (currentHero === 'yan') {
                    for (let e of enemies.slice()) {
                        if (!e.alive) continue;
                        if (!Array.isArray(e.yanActiveBurns) || e.yanActiveBurns.length === 0) continue;
                        // 倒序遍历便于安全移除过期层
                        for (let i = e.yanActiveBurns.length - 1; i >= 0; i--) {
                            const b = e.yanActiveBurns[i];
                            b.tick++;
                            if (b.tick >= 30) {
                                b.tick = 0;
                                // 每个正在燃烧层每秒造成 30 + enhYanBurnDmg 伤害
                                const burnDmg = 30 + enhYanBurnDmg;
                                dealDamage(e, burnDmg, '#FF4500', 2);
                            }
                            b.timer--;
                            if (b.timer <= 0) {
                                e.yanActiveBurns.splice(i, 1);
                            }
                        }
                    }
                }
                // 甄姬：极地风暴视觉持续（伤害和叠层已在释放瞬间一次性触发）
                if (shuangBlizzardTimer > 0) {
                    shuangBlizzardTimer--;
                    // 全屏飘雪粒子：每3帧生成一批，营造暴风雪氛围
                    if (shuangBlizzardTimer % 3 === 0) {
                        const camX = Math.max(0, Math.min(MAP_WIDTH - WIDTH, hero.x - WIDTH / 2));
                        const camY = Math.max(0, Math.min(MAP_HEIGHT - HEIGHT, hero.y - HEIGHT / 2));
                        for (let i = 0; i < 8; i++) {
                            particles.push({
                                type: 'hit',
                                x: camX + Math.random() * WIDTH,
                                y: camY + Math.random() * HEIGHT,
                                vx: -1 + Math.random() * 2,
                                vy: 1 + Math.random() * 2,
                                life: 40 + Math.random() * 30,
                                maxLife: 70,
                                color: Math.random() > 0.5 ? '#00BFFF' : '#ffffff',
                                size: 2 + Math.random() * 2
                            });
                        }
                    }
                }
                // 甄姬：所有敌人冻结倒计时（叠层永久不消失，冻结期间不可叠层，冻结解除后从0开始叠）
                if (currentHero === 'shuang') {
                    for (let e of enemies.slice()) {
                        if (!e.alive) continue;
                        if (e.shuangFreezeTimer > 0) e.shuangFreezeTimer--;
                    }
                }
                // 于吉：寄生藤蔓链接倒计时（仅清理过期链接，无伤害无吸血）+ 每秒回血tick + 三技能吸血倒计时 + 一技能普攻强化倒计时
                if (currentHero === 'ji') {
                    // 链接更新（仅清理过期链接，不造成伤害，回血通过 jiVineHealTimer 独立计算）
                    for (let i = jiVineLinks.length - 1; i >= 0; i--) {
                        const link = jiVineLinks[i];
                        if (!link.enemy || !link.enemy.alive) {
                            jiVineLinks.splice(i, 1);
                            continue;
                        }
                        link.timer--;
                        if (link.timer <= 0) {
                            jiVineLinks.splice(i, 1);
                        }
                    }
                    // 每秒回血tick（jiVineHealTimer > 0 时每秒回 (10%+enhJiVineHealPct) 最大HP）
                    if (jiVineHealTimer > 0) {
                        jiVineHealTimer--;
                        jiVineHealTickTimer++;
                        if (jiVineHealTickTimer >= 30) {
                            jiVineHealTickTimer = 0;
                            const heal = Math.floor(this.maxHp * (0.10 + enhJiVineHealPct));
                            this.hp = Math.min(this.maxHp, this.hp + heal);
                            showDamage(this.x, this.y - 30, '+' + heal, '#7CFC00');
                            // 治疗粒子：更亮的绿色生命粒子向上升腾
                            for (let i = 0; i < 12; i++) {
                                const a = (i / 12) * Math.PI * 2;
                                particles.push({
                                    type: 'hit', x: this.x, y: this.y,
                                    vx: Math.cos(a) * 2.5, vy: -3 - Math.random() * 2,
                                    life: 30, maxLife: 30, color: i % 2 === 0 ? '#7CFC00' : '#3CB371', size: 5
                                });
                            }
                            particles.push({ type: 'ringExpand', x: this.x, y: this.y, color: '#7CFC00', maxRadius: 100, life: 25, maxLife: 25 });
                        }
                    }
                    // 一技能普攻强化倒计时
                    if (jiAtkBoostTimer > 0) jiAtkBoostTimer--;
                }
                // 黄盖：棱镜炮台环绕自身运动 + 生命倒计时 + 普攻范围同自身(425)自动普攻造成普攻*(0.14+enhJingPrismAtkMult)
                if (currentHero === 'jing') {
                    // 若棱镜全部消失（被三技能引爆或超时），关闭激活标志
                    if (jingPrisms.length === 0 && jingPrismFieldActive) {
                        jingPrismFieldActive = false;
                    }
                    for (let i = jingPrisms.length - 1; i >= 0; i--) {
                        const p = jingPrisms[i];
                        p.life--;
                        // 环绕自身运动：角度随时间增加，半径128（原150-15%）
                        p.baseAngle += 0.04; // 环绕速度
                        p.x = this.x + Math.cos(p.baseAngle) * 128;
                        p.y = this.y + Math.sin(p.baseAngle) * 128;
                        // 普攻CD计时（与英雄普攻CD一致，约0.5秒=30帧）
                        if (p.attackTimer > 0) p.attackTimer--;
                        // 普攻范围同自身（425，原500-15%），有敌人在范围自动普攻造成普攻*(0.14+enhJingPrismAtkMult)伤害
                        if (p.attackTimer <= 0) {
                            let nearest = null, minD = Infinity;
                            for (let e of enemies.slice()) {
                                if (!e.alive) continue;
                                const d = Math.sqrt((e.x - p.x)**2 + (e.y - p.y)**2);
                                // 巨型Boss半径大：射程触碰到敌人半径边缘即可命中（425 + 敌人半径）
                                if (d < 425 + (e.radius || 0) && d < minD) { minD = d; nearest = e; }
                            }
                            if (nearest) {
                                const prismDmg = Math.floor(stats.attack * (0.14 + enhJingPrismAtkMult));
                                dealDamage(nearest, prismDmg, '#00CED1', 5);
                                // 棱镜攻击弹道（青绿光束 + 白色核心）
                                const dxN = minD > 0 ? (nearest.x - p.x) / minD : 0;
                                const dyN = minD > 0 ? (nearest.y - p.y) / minD : 0;
                                particles.push({ type: 'beam', x: p.x, y: p.y, dx: dxN, dy: dyN, length: minD, color: '#00CED1', life: 16, maxLife: 16 });
                                particles.push({ type: 'beam', x: p.x, y: p.y, dx: dxN, dy: dyN, length: minD, color: '#ffffff', life: 10, maxLife: 10 });
                                particles.push({ type: 'shockExplosion', x: nearest.x, y: nearest.y, color: '#00CED1', maxRadius: 55, life: 18, maxLife: 18 });
                                particles.push({ type: 'ringExpand', x: nearest.x, y: nearest.y, color: '#ffffff', maxRadius: 40, life: 14, maxLife: 14 });
                                p.attackTimer = 30; // 普攻CD 0.5秒
                            }
                        }
                        if (p.life <= 0) {
                            particles.push({ type: 'shockExplosion', x: p.x, y: p.y, color: '#00CED1', maxRadius: 60, life: 18, maxLife: 18 });
                            jingPrisms.splice(i, 1);
                        }
                    }
                }
                // 黄盖一技能折射强化窗口期倒计时
                if (jingRefractionBoostTimer > 0) jingRefractionBoostTimer--;
                // 司马懿天空之眼起飞+30%移速 / 风之印记激活+30%移速；典韦烬燃+30%移速
                const cangqiongSpeedMult = (cangqiongFlyingTimer > 0 || cangqiongWindMarkTimer > 0) ? 1.21 : 1;
                const jinSpeedMult = jinEmberBurnTimer > 0 ? 1.3 : 1;
                // ===== 英雄基础速度由难度配置决定（所有难度固定2.3，困难基准） =====
                const weatherMult = (enableWeather || curseNightMode || madnessNightMode) ? weatherSpeedMult : 1.0;
                const speed = currentDifficulty.heroSpeed * (diaoChanSpeedBoostTimer > 0 ? 1.4 : 1) * zglSpeedMult * lvmengSpeedMult * hanFeiSpeedMult * cangqiongSpeedMult * jinSpeedMult * (selectedArtifactKey === 'windBoots' ? 1.25 : 1) * weatherMult;
                let dx = 0, dy = 0;

                if (keys['KeyW'] || keys['ArrowUp']) dy -= speed;
                if (keys['KeyS'] || keys['ArrowDown']) dy += speed;
                if (keys['KeyA'] || keys['ArrowLeft']) {
                    dx -= speed;
                    this.facing = -1;
                }
                if (keys['KeyD'] || keys['ArrowRight']) {
                    dx += speed;
                    this.facing = 1;
                }

                if (dx !== 0 || dy !== 0) {
                    const len = Math.sqrt(dx*dx + dy*dy);
                    this.x = Math.max(30, Math.min(MAP_WIDTH-30, this.x + (dx/len)*speed));
                    this.y = Math.max(30, Math.min(MAP_HEIGHT-100, this.y + (dy/len)*speed));
                }
            }
            
            draw() {
                if (!this.alive) return;

                const hd = HERO_DEFS[currentHero];

                // ===== 远程英雄实时显示普攻射程（淡色虚线圆，使用与攻击逻辑相同的范围） =====
                if (hd.ranged) {
                    ctx.save();
                    // 范围与攻击逻辑保持一致：黄盖固定425（原500-15%），于吉固定160（原400→280→168→100→65→160），其他远程=自身半径×5
                    const zglRange = (currentHero === 'jing') ? 425 : ((currentHero === 'ji') ? 160 : (this.radius * 5));
                    const zglAoeActive = zhugeLiangAoeBoostTimer > 0;
                    // 普攻射程圈（淡色虚线，使用英雄主色淡化版）
                    ctx.globalAlpha = 0.25;
                    ctx.strokeStyle = hd.color;
                    ctx.lineWidth = 1.5;
                    ctx.setLineDash([8, 6]);
                    ctx.shadowColor = hd.color;
                    ctx.shadowBlur = 10;
                    ctx.beginPath();
                    ctx.arc(this.x, this.y, zglRange, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.setLineDash([]);
                    // 技能2激活时显示AOE范围（亮青色实线）
                    if (zglAoeActive) {
                        const aoeR = this.radius * (2.3 + enhZhugeLiangAoeMult);
                        ctx.globalAlpha = 0.5;
                        ctx.strokeStyle = '#88eeff';
                        ctx.lineWidth = 2.5;
                        ctx.shadowBlur = 15;
                        ctx.beginPath();
                        ctx.arc(this.x, this.y, aoeR, 0, Math.PI * 2);
                        ctx.stroke();
                    }
                    ctx.restore();
                }

                ctx.save();
                ctx.translate(this.x, this.y);

                // ===== 9英雄精致Canvas贴图（几何风格，不画五官） =====
                drawHeroAvatar(ctx, 0, 0, currentHero, 40, Date.now());

                // ===== 韩非雾隐：英雄全黑形态 + 灰色烟雾粒子环绕（近似隐身效果） =====
                if (heroFogHidden) {
                    const fogT = Date.now() / 100;
                    // 全黑遮盖（覆盖整个英雄区域）
                    ctx.fillStyle = '#000000';
                    ctx.beginPath();
                    ctx.arc(0, 0, 28, 0, Math.PI * 2);
                    ctx.fill();
                    // 8个灰色烟雾粒子环绕（旋转飘动）
                    for (let i = 0; i < 8; i++) {
                        const a = fogT * 0.5 + i * Math.PI / 4;
                        const r = 22 + Math.sin(fogT * 2 + i) * 4;
                        const alpha = 0.5 + Math.sin(fogT * 3 + i) * 0.3;
                        ctx.fillStyle = `rgba(120, 120, 120, ${alpha})`;
                        ctx.shadowColor = '#666666';
                        ctx.shadowBlur = 8;
                        ctx.beginPath();
                        ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 4, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    // 外层灰色光环（脉动，标识隐身中）
                    const pulse = Math.sin(fogT * 4) * 0.2 + 0.6;
                    ctx.strokeStyle = `rgba(180, 180, 180, ${pulse * 0.6})`;
                    ctx.lineWidth = 1.5;
                    ctx.shadowColor = '#888888';
                    ctx.shadowBlur = 12;
                    ctx.beginPath();
                    ctx.arc(0, 0, 32, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.shadowBlur = 0;
                }

                if (this.invincibleTime > 0) {
                    const alpha = Math.sin(this.invincibleTime * 0.3) * 0.5 + 0.5;
                    ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.arc(0, 0, 32, 0, Math.PI * 2);
                    ctx.stroke();
                }
                // ===== 张飞万人敌护盾激活时显示金色护盾光环 =====
                if (zhangFeiShieldTimer > 0 && this.shield > 0) {
                    // 双层金色光环（旋转闪烁）
                    const pulse = Math.sin(Date.now() * 0.01) * 0.3 + 0.7;
                    ctx.strokeStyle = `rgba(255, 221, 68, ${pulse})`;
                    ctx.lineWidth = 4;
                    ctx.shadowColor = '#ffdd44';
                    ctx.shadowBlur = 25;
                    ctx.beginPath();
                    ctx.arc(0, 0, 35, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.strokeStyle = `rgba(255, 255, 170, ${pulse * 0.8})`;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(0, 0, 40, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.shadowBlur = 0;
                }

                ctx.restore();

                const hpW = 60, hpH = 7;
                ctx.fillStyle = '#333';
                ctx.fillRect(this.x - hpW/2, this.y - 40, hpW, hpH);
                ctx.fillStyle = '#44ff44';
                ctx.fillRect(this.x - hpW/2, this.y - 40, hpW * (this.hp / this.maxHp), hpH);
                // ===== 护盾条显示（金色，位于血条上方） =====
                if (this.shield > 0) {
                    const shieldW = 60 * Math.min(1, this.shield / this.maxHp);
                    ctx.fillStyle = '#ffdd44';
                    ctx.fillRect(this.x - hpW/2, this.y - 48, shieldW, 5);
                    ctx.strokeStyle = '#ffaa00';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(this.x - hpW/2, this.y - 48, 60, 5);
                }
            }
        }


