// ============================================================
// 文件: src/skills.js
// 描述: useSkill + 技能逻辑
// 行范围: 13824-14980 (原 game.js)
// 注意: 本文件由原版 HTML 抽取，保持原作用域不变
// ============================================================

// ===== 中/英文国际化词条（追加到全局 I18N_DICT） =====
Object.assign(I18N_DICT, {
    '烬燃触发！灰烬觉醒！': 'Ember Ignited! Ashes Awaken!',
    '激活了风之印记！': 'Wind Mark Activated!',
    '时 空 静 止': 'Time Frozen',
    '一切归于寂灭': 'All Fades to Nothing',
    '安': 'SAFE',
});

// ===== 新增：普攻打中"几乎完全重合"的敌人时，对重合的所有敌人一并造成伤害 =====
// （解决远程单体普攻遇到堆叠敌人时只打中一个的问题；近战普攻已是范围内AOE，无需处理）
function dealDamageToOverlapping(target, dmg, color, particleCount) {
    // 先对目标本身造成伤害
    dealDamage(target, dmg, color, particleCount);
    // 再对与目标"几乎完全重合"的其他存活敌人造成相同伤害
    for (let e of enemies.slice()) {
        if (e === target || !e.alive) continue;
        // 判定"几乎完全重合"：两敌中心距小于较小半径的一半（说明几乎叠在一起）
        const rr = Math.min(e.radius || 0, target.radius || 0);
        const thresh = Math.max(6, rr * 0.5);
        if (Math.hypot(e.x - target.x, e.y - target.y) < thresh) {
            dealDamage(e, dmg, color, particleCount);
        }
    }
}

        function useSkill(skillIndex) {
            if (!gameRunning || showingBuff) return;
            if (skillIndex > 0 && skillCooldown[skillIndex] > 0) return;

            // ===== 共鸣之石神器：每3次技能触发无CD（在CD检查之后计数） =====
            if (selectedArtifactKey === 'resonanceStone' && skillIndex > 0) {
                artifactSkillCastCount++;
                if (artifactSkillCastCount >= 3) {
                    artifactSkillCastCount = 0;
                    // 下一个技能无CD（本次已经无CD因为通过了检查，设置下次）
                    // 实际上应该在释放后清零所有CD
                    for (let i = 1; i < 4; i++) skillCooldown[i] = 0;
                }
            }

            // ===== 韩非雾隐：英雄攻击或释放技能时立即结束静止（含普攻0/技能1/2/3） =====
            // 注：此清零必须在技能实际执行前，确保"攻击则敌人静止结束恢复行动"
            if (heroFreezeTimer > 0) {
                heroFreezeTimer = 0;
                heroFogHidden = false;
            }

            const heroDef = HERO_DEFS[currentHero];
            // 关羽武圣之怒增伤
            const rageMult = (hero.rageTime && hero.rageTime > 0) ? 1.5 : 1;

            switch (skillIndex) {
                case 0:
                    // ===== 司马懿远程普攻：天蓝风刃弹道（风之印记改为技能计数，不在普攻叠加） =====
                    if (currentHero === 'cangqiong') {
                        createGreenAoe();
                        const sRange = hero.radius * 5;
                        let target = null, minD = Infinity;
                        for (let e of enemies.slice()) {
                            if (!e.alive) continue;
                            const d = Math.sqrt((e.x - hero.x)**2 + (e.y - hero.y)**2);
                            // 巨型Boss半径大：射程触碰到敌人半径边缘即可命中（sRange + 敌人半径）
                            if (d < sRange + (e.radius || 0) && d < minD) { minD = d; target = e; }
                        }
                        if (target) {
                            dealDamageToOverlapping(target, stats.attack, '#4A90E2', 8);
                            const dxNorm = minD > 0 ? (target.x - hero.x) / minD : 0;
                            const dyNorm = minD > 0 ? (target.y - hero.y) / minD : 0;
                            // 天蓝风刃弹道
                            particles.push({ type: 'beam', x: hero.x, y: hero.y, dx: dxNorm, dy: dyNorm, length: minD, color: '#4A90E2', life: 14, maxLife: 14 });
                            particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#87CEEB', maxRadius: 50, life: 16, maxLife: 16 });
                            particles.push({ type: 'shockExplosion', x: target.x, y: target.y, color: '#87CEEB', maxRadius: 70, life: 20, maxLife: 20 });
                        }
                        break;
                    }
                    // ===== 远程普攻分支（诸葛亮/澜/织 大特效） =====
                    if (heroDef.ranged) {
                        // 普攻射程 = 自身半径 × 5（技能3激活时半径翻倍）；黄盖固定425（原500-15%），于吉固定160（原400→280→168→100→65→160）
                        const zglRange = (currentHero === 'jing') ? 425 : ((currentHero === 'ji') ? 160 : (hero.radius * 5));
                        const zglAoeActive = zhugeLiangAoeBoostTimer > 0;
                        const zglAoeRadius = hero.radius * (2.3 + enhZhugeLiangAoeMult);
                        // 鲁肃涨潮相位攻击+30%（+肉鸽每次+5%）；退潮相位无加成
                        // 鲁肃涨潮攻击加成已删除（潮汐相位机制移除）
                        const lanTideAtkMult = 1;
                        createGreenAoe();
                        if (zglAoeActive) {
                            // ===== 诸葛亮技能2激活：范围AOE普攻大特效 =====
                            for (let e of enemies.slice()) {
                                if (!e.alive) continue;
                                const dx = e.x - hero.x, dy = e.y - hero.y;
                                if (Math.sqrt(dx*dx + dy*dy) < zglAoeRadius) {
                                    dealDamage(e, Math.floor(stats.attack * lanTideAtkMult), heroDef.color, 8);
                                }
                            }
                            // AOE大特效：3层光环扩散（青→白→亮青）+ 40粒子放射 + 8方位八卦光点 + 中心光柱
                            particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#88eeff', maxRadius: zglAoeRadius, life: 30, maxLife: 30 });
                            particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#ffffff', maxRadius: zglAoeRadius * 0.7, life: 25, maxLife: 25 });
                            particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#66ddff', maxRadius: zglAoeRadius * 1.1, life: 35, maxLife: 35 });
                            // 40个粒子放射
                            for (let i = 0; i < 40; i++) {
                                const a = (i / 40) * Math.PI * 2 + Math.random() * 0.2;
                                const sp = 5 + Math.random() * 4;
                                particles.push({
                                    type: 'hit', x: hero.x, y: hero.y,
                                    vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                                    life: 25, maxLife: 25, color: i % 2 === 0 ? '#88eeff' : '#ffffff', size: 6
                                });
                            }
                            // 8方位八卦光点
                            for (let i = 0; i < 8; i++) {
                                const a = (i / 8) * Math.PI * 2;
                                particles.push({
                                    type: 'shockExplosion',
                                    x: hero.x + Math.cos(a) * zglAoeRadius * 0.6,
                                    y: hero.y + Math.sin(a) * zglAoeRadius * 0.6,
                                    color: '#aaffff', maxRadius: 40, life: 22, maxLife: 22
                                });
                            }
                            // 中心光柱
                            particles.push({ type: 'beam', x: hero.x, y: hero.y, dx: 0, dy: -1, length: 120, color: '#ffffff', life: 20, maxLife: 20 });
                        } else {
                            // ===== 单体远程普攻大特效 =====
                            let target = null, minD = Infinity;
                            for (let e of enemies.slice()) {
                                if (!e.alive) continue;
                                const d = Math.sqrt((e.x - hero.x)**2 + (e.y - hero.y)**2);
                                // 巨型Boss半径大：射程触碰到敌人半径边缘即可命中（zglRange + 敌人半径）
                                if (d < zglRange + (e.radius || 0) && d < minD) { minD = d; target = e; }
                            }
                            if (target) {
                                const dxNorm = minD > 0 ? (target.x - hero.x) / minD : 0;
                                const dyNorm = minD > 0 ? (target.y - hero.y) / minD : 0;
                                // ===== 于吉远程普攻：280范围AOE荆棘藤蔓（带弹道特效+范围圈）=====
                                if (currentHero === 'ji') {
                                    const jiDmgMult = (jiAtkBoostTimer > 0 ? 2 : 1);
                                    const boostActive = jiAtkBoostTimer > 0;
                                    const fxColor = boostActive ? '#FFCC44' : '#3CB371';
                                    // 对范围内所有敌人造成伤害
                                    for (let e of enemies.slice()) {
                                        if (!e.alive) continue;
                                        const dx = e.x - hero.x, dy = e.y - hero.y;
                                        // 巨型Boss半径大：射程触碰到敌人半径边缘即可命中（zglRange + 敌人半径）
                                        if (Math.sqrt(dx*dx + dy*dy) < zglRange + (e.radius || 0)) {
                                            const dmg = Math.floor(stats.attack * jiDmgMult);
                                            dealDamage(e, dmg, heroDef.color, 10);
                                            // 一技能期间命中附加减速30%2秒
                                            if (jiAtkBoostTimer > 0) {
                                                if (e.slowTimer === undefined) e.slowTimer = 0;
                                                e.slowTimer = Math.max(e.slowTimer, 120);
                                                e.slowFactor = 0.7;
                                            }
                                            // 每个命中目标都产生荆棘爆开特效
                                            particles.push({ type: 'shockExplosion', x: e.x, y: e.y, color: fxColor, maxRadius: boostActive ? 120 : 80, life: 22, maxLife: 22 });
                                            particles.push({ type: 'ringExpand', x: e.x, y: e.y, color: fxColor, maxRadius: boostActive ? 100 : 60, life: 18, maxLife: 18 });
                                            for (let i = 0; i < (boostActive ? 12 : 8); i++) {
                                                const a = Math.random() * Math.PI * 2;
                                                const sp = 3 + Math.random() * 4;
                                                particles.push({
                                                    type: 'hit', x: e.x, y: e.y,
                                                    vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                                                    life: 20, maxLife: 20, color: fxColor, size: 5
                                                });
                                            }
                                        }
                                    }
                                    // 弹道特效：从英雄射向最近敌人的荆棘藤蔓光束
                                    particles.push({ type: 'beam', x: hero.x, y: hero.y, dx: dxNorm, dy: dyNorm, length: minD, color: '#228B22', life: 18, maxLife: 18 });
                                    particles.push({ type: 'beam', x: hero.x, y: hero.y, dx: dxNorm, dy: dyNorm, length: minD, color: fxColor, life: 14, maxLife: 14 });
                                    // 起点藤蔓光环
                                    particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#228B22', maxRadius: 90, life: 20, maxLife: 20 });
                                    particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: fxColor, maxRadius: 60, life: 16, maxLife: 16 });
                                } else {
                                    // 其他远程英雄：单体远程普攻（对几乎完全重合的敌人一并造成伤害）
                                    dealDamageToOverlapping(target, Math.floor(stats.attack * lanTideAtkMult), heroDef.color, 10);
                                    // 起点：3层光环扩散（青→白→亮青）+ 20粒子放射
                                    particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#66ddff', maxRadius: 60, life: 20, maxLife: 20 });
                                    particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#ffffff', maxRadius: 40, life: 16, maxLife: 16 });
                                    particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#aaffff', maxRadius: 80, life: 24, maxLife: 24 });
                                    for (let i = 0; i < 20; i++) {
                                        const a = (i / 20) * Math.PI * 2;
                                        particles.push({
                                            type: 'hit', x: hero.x, y: hero.y,
                                            vx: Math.cos(a) * 4, vy: Math.sin(a) * 4,
                                            life: 16, maxLife: 16, color: '#66ddff', size: 4
                                        });
                                    }
                                    // 弹道：3层光束（粗青→中白→细亮青）
                                    particles.push({ type: 'beam', x: hero.x, y: hero.y, dx: dxNorm, dy: dyNorm, length: minD, color: '#66ddff', life: 16, maxLife: 16 });
                                    particles.push({ type: 'beam', x: hero.x, y: hero.y, dx: dxNorm, dy: dyNorm, length: minD, color: '#ffffff', life: 12, maxLife: 12 });
                                    particles.push({ type: 'beam', x: hero.x, y: hero.y, dx: dxNorm, dy: dyNorm, length: minD, color: '#aaffff', life: 20, maxLife: 20 });
                                    // 命中：3层冲击波 + 30粒子爆发 + 十字光闪 + 光柱
                                    particles.push({ type: 'shockExplosion', x: target.x, y: target.y, color: '#66ddff', maxRadius: 90, life: 22, maxLife: 22 });
                                    particles.push({ type: 'shockExplosion', x: target.x, y: target.y, color: '#ffffff', maxRadius: 60, life: 18, maxLife: 18 });
                                    particles.push({ type: 'ringExpand', x: target.x, y: target.y, color: '#aaffff', maxRadius: 110, life: 26, maxLife: 26 });
                                    // 30粒子爆发
                                    for (let i = 0; i < 30; i++) {
                                        const a = Math.random() * Math.PI * 2;
                                        const sp = 3 + Math.random() * 6;
                                        particles.push({
                                            type: 'hit', x: target.x, y: target.y,
                                            vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                                            life: 22, maxLife: 22, color: i % 3 === 0 ? '#ffffff' : '#66ddff', size: 5
                                        });
                                    }
                                    // 命中光柱
                                    particles.push({ type: 'beam', x: target.x, y: target.y, dx: 0, dy: -1, length: 80, color: '#ffffff', life: 18, maxLife: 18 });
                                    // ===== 黄盖普攻大特效（普攻英雄带特效） =====
                                    // 青绿水晶射击特效：起点光环+弹道光束+命中冲击波+水晶粒子
                                    if (currentHero === 'jing') {
                                        // 起点：青绿光环扩散
                                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#00CED1', maxRadius: 80, life: 20, maxLife: 20 });
                                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#ffffff', maxRadius: 50, life: 16, maxLife: 16 });
                                        // 弹道：青绿光束（双层）
                                        const dxN = minD > 0 ? (target.x - hero.x) / minD : 0;
                                        const dyN = minD > 0 ? (target.y - hero.y) / minD : 0;
                                        particles.push({ type: 'beam', x: hero.x, y: hero.y, dx: dxN, dy: dyN, length: minD, color: '#00CED1', life: 18, maxLife: 18 });
                                        particles.push({ type: 'beam', x: hero.x, y: hero.y, dx: dxN, dy: dyN, length: minD, color: '#ffffff', life: 14, maxLife: 14 });
                                        // 命中：冲击波+水晶粒子爆裂
                                        particles.push({ type: 'shockExplosion', x: target.x, y: target.y, color: '#00CED1', maxRadius: 100, life: 22, maxLife: 22 });
                                        particles.push({ type: 'ringExpand', x: target.x, y: target.y, color: '#ffffff', maxRadius: 70, life: 18, maxLife: 18 });
                                        for (let i = 0; i < 12; i++) {
                                            const a = (i / 12) * Math.PI * 2;
                                            const sp = 3 + Math.random() * 4;
                                            particles.push({
                                                type: 'hit', x: target.x, y: target.y,
                                                vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                                                life: 20, maxLife: 20, color: i % 2 === 0 ? '#00CED1' : '#ffffff', size: 5
                                            });
                                        }
                                    }
                                    // ===== 原创角色远程普攻特效叠加 =====
                                    // 甄姬：寒冰累积 - 普攻叠加1层寒冰（addShuangColdStacks 内部自动处理冻结期间不可叠层+满5层冻结归零）
                                    if (currentHero === 'shuang') {
                                        addShuangColdStacks(target, 1);
                                    }
                                    // 黄盖：一技能水晶折射 - 普攻命中时若一技能强化窗口期内，折射周围(2+enhJingRefractionCount)个敌人
                                    // 造成普攻*(0.42+enhJingRefractionMult)伤害，触发后消耗强化状态（范围510，原600-15%）
                                    if (currentHero === 'jing' && jingRefractionBoostTimer > 0) {
                                        const refractionCount = 2 + enhJingRefractionCount;
                                        const refractionMult = 0.42 + enhJingRefractionMult;
                                        const refractionCandidates = enemies.filter(e => e.alive && e !== target).map(e => ({
                                            e, d: Math.sqrt((e.x - target.x)**2 + (e.y - target.y)**2)
                                        })).filter(t => t.d < 510).sort((a, b) => a.d - b.d).slice(0, refractionCount);
                                        for (const r of refractionCandidates) {
                                            const refDmg = Math.floor(stats.attack * refractionMult);
                                            dealDamage(r.e, refDmg, '#00CED1', 8);
                                            // 折射弹道（青绿光束 + 白色核心）
                                            const rdx = r.e.x - target.x, rdy = r.e.y - target.y;
                                            const rd = Math.sqrt(rdx*rdx + rdy*rdy);
                                            const rdxN = rd > 0 ? rdx / rd : 0;
                                            const rdyN = rd > 0 ? rdy / rd : 0;
                                            particles.push({ type: 'beam', x: target.x, y: target.y, dx: rdxN, dy: rdyN, length: rd, color: '#00CED1', life: 16, maxLife: 16 });
                                            particles.push({ type: 'beam', x: target.x, y: target.y, dx: rdxN, dy: rdyN, length: rd, color: '#ffffff', life: 10, maxLife: 10 });
                                            particles.push({ type: 'shockExplosion', x: r.e.x, y: r.e.y, color: '#00CED1', maxRadius: 75, life: 22, maxLife: 22 });
                                            particles.push({ type: 'ringExpand', x: r.e.x, y: r.e.y, color: '#ffffff', maxRadius: 50, life: 18, maxLife: 18 });
                                            // 水晶碎片粒子
                                            for (let i = 0; i < 8; i++) {
                                                const a = Math.random() * Math.PI * 2;
                                                const sp = 2 + Math.random() * 4;
                                                particles.push({
                                                    type: 'hit', x: r.e.x, y: r.e.y,
                                                    vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                                                    life: 20, maxLife: 20, color: i % 2 === 0 ? '#00CED1' : '#ffffff', size: 4
                                                });
                                            }
                                        }
                                        // 消耗强化状态
                                        jingRefractionBoostTimer = 0;
                                    }
                                }
                            }
                        }
                        break;
                    }
                    createGreenAoe();
                    const rangeMult = guanYuRangeBoost > 0 ? (4 + enhGuanYuRangeMult) : 1;
                    // 原创角色近战普攻加成：典韦烬燃攻击+80%
                    const jinEmberBurnMult = jinEmberBurnTimer > 0 ? 1.8 : 1;
                    const dmgMult = (guanYuDmgBoost > 0 ? 2 : 1) * (rageMult) * jinEmberBurnMult;
                    // 近战英雄默认普攻范围
                    const atkRadius = GRID * 1.66 * rangeMult;
                    // 典韦普攻烬值叠加：每次普攻+1层（上限6），满6次触发烬燃3秒（刷新持续时间）
                    let jinEmberTrigger = false;
                    if (currentHero === 'jin') {
                        jinAttackStacks++;
                        if (jinAttackStacks >= 6) {
                            jinEmberTrigger = true;
                            jinAttackStacks = 0; // 重置层数
                        }
                    }
                    for (let e of enemies.slice()) {
                        if (!e.alive) continue;
                        const dx = e.x - hero.x, dy = e.y - hero.y;
                        // 巨型Boss（如劫）半径大：攻击范围触碰到敌人半径边缘即可命中（atkRadius + 敌人半径）
                        if (Math.sqrt(dx*dx + dy*dy) < atkRadius + 10 + (e.radius || 0)) {
                            let dmg = stats.attack * dmgMult;
                            dealDamage(e, dmg, heroDef.color, 6);
                            if (guanYuLifesteal) {
                                const heal = Math.floor(dmg * (0.2 + enhGuanYuLifesteal));
                                hero.hp = Math.min(hero.maxHp, hero.hp + heal);
                            }
                            // 典韦烬燃状态：普攻吸血+50%（不论通过二技能还是被动触发）
                            if (currentHero === 'jin' && jinEmberBurnTimer > 0) {
                                const heal = Math.floor(dmg * 0.5);
                                hero.hp = Math.min(hero.maxHp, hero.hp + heal);
                            }
                            // ===== 典韦普攻大特效：暗红烬刃斩击 =====
                            if (currentHero === 'jin') {
                                // 烬燃状态下特效更强（橙红火焰）
                                const burnActive = jinEmberBurnTimer > 0;
                                const fxColor = burnActive ? '#FF6347' : '#B22222';
                                particles.push({ type: 'shockExplosion', x: e.x, y: e.y, color: fxColor, maxRadius: burnActive ? 120 : 80, life: 22, maxLife: 22 });
                                particles.push({ type: 'ringExpand', x: e.x, y: e.y, color: fxColor, maxRadius: burnActive ? 100 : 60, life: 18, maxLife: 18 });
                                // 烬刃斩击粒子
                                for (let i = 0; i < (burnActive ? 12 : 8); i++) {
                                    const a = Math.random() * Math.PI * 2;
                                    const sp = 3 + Math.random() * 4;
                                    particles.push({
                                        type: 'hit', x: e.x, y: e.y,
                                        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                                        life: 20, maxLife: 20, color: burnActive ? '#FF6347' : '#B22222', size: 5
                                    });
                                }
                                // 烬燃状态额外火焰粒子
                                if (burnActive) {
                                    for (let i = 0; i < 6; i++) {
                                        particles.push({
                                            type: 'flame', x: e.x + (Math.random()-0.5)*20, y: e.y,
                                            vx: (Math.random()-0.5)*2, vy: -2 - Math.random()*2,
                                            life: 30, maxLife: 30, size: 7
                                        });
                                    }
                                }
                            }
                            // ===== 原创角色近战普攻特效叠加 =====
                            // 陆逊：普攻叠加1层燃烧叠层（addYanBurnStacks 自动每5层转1层正在燃烧）
                            if (currentHero === 'yan') {
                                addYanBurnStacks(e, 1);
                            }
                        }
                    }
                    // 典韦烬燃触发：普攻满6次触发烬燃3秒（刷新持续时间）
                    if (jinEmberTrigger) {
                        jinEmberBurnTimer = 180 + enhJinBurnDuration; // 3秒=180帧（+肉鸽每次+36帧=0.6秒）
                        // 烬燃触发提示
                        skillText = { text: _t('烬燃触发！灰烬觉醒！'), color: '#FF6347', life: 80 };
                        // 触发特效：暗红怒焰光环爆发+火焰粒子
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#B22222', maxRadius: 250, life: 35, maxLife: 35 });
                        particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#FF6347', maxRadius: 200, life: 30, maxLife: 30 });
                        particles.push({ type: 'shockExplosion', x: hero.x, y: hero.y, color: '#FF6347', maxRadius: 150, life: 25, maxLife: 25 });
                        for (let i = 0; i < 30; i++) {
                            const a = (i / 30) * Math.PI * 2;
                            particles.push({
                                type: 'flame', x: hero.x + Math.cos(a) * 40, y: hero.y + Math.sin(a) * 40,
                                vx: Math.cos(a) * 1, vy: -2 - Math.random() * 2,
                                life: 40, maxLife: 40, size: 8
                            });
                        }
                        triggerShake(true);
                    }
                    break;

                case 1:
                case 2:
                case 3:
                    skillCooldown[skillIndex] = skillMaxCooldown[skillIndex];
                    if (heroDef.skillImpl[skillIndex]) {
                        heroDef.skillImpl[skillIndex]();
                    }
                    // ===== 司马懿风之印记：每释放5次技能获得21%加速2.1秒 =====
                    if (currentHero === 'cangqiong') {
                        cangqiongSkillCount++;
                        if (cangqiongSkillCount >= 5) {
                            cangqiongSkillCount = 0;
                            cangqiongWindMarkTimer = 126; // 2.1秒=126帧，21%加速（原3秒30%-30%）
                            // 激活提示
                            skillText = { text: _t('激活了风之印记！'), color: '#ffff44', life: 80 };
                            // 激活特效：金色光环爆发
                            particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#ffff44', maxRadius: 200, life: 30, maxLife: 30 });
                            particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#ffffff', maxRadius: 150, life: 25, maxLife: 25 });
                            for (let i = 0; i < 20; i++) {
                                const a = (i / 20) * Math.PI * 2;
                                particles.push({
                                    type: 'hit', x: hero.x, y: hero.y,
                                    vx: Math.cos(a) * 5, vy: Math.sin(a) * 5,
                                    life: 30, maxLife: 30, color: '#ffff44', size: 6
                                });
                            }
                        }
                    }
                    break;
            }
        }

        // ===== 帝君粒子和光环系统（update + draw 合并） =====
        function updateEmperorEffects() {
            // 更新光环
            emperorRings = emperorRings.filter(r => r.life > 0);
            for (const ring of emperorRings) {
                ring.life--;
                const prog = 1 - ring.life / ring.maxLife;
                ring.radius = ring.maxRadius * prog;
            }
            // 更新粒子
            emperorParticles = emperorParticles.filter(p => p.life > 0);
            for (const p of emperorParticles) {
                p.life--;
                p.x += p.vx;
                p.y += p.vy;
                p.vx *= 0.95;
                p.vy *= 0.95;
            }

            // 绘制光环
            for (const ring of emperorRings) {
                const alpha = ring.life / ring.maxLife;
                ctx.save();
                ctx.globalAlpha = alpha * 0.8;
                ctx.strokeStyle = ring.color;
                ctx.lineWidth = ring.width * alpha;
                ctx.shadowColor = ring.color;
                ctx.shadowBlur = 25;
                ctx.beginPath();
                ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI*2);
                ctx.stroke();
                // 内层
                ctx.globalAlpha = alpha * 0.4;
                ctx.lineWidth = ring.width * 0.5 * alpha;
                ctx.stroke();
                ctx.restore();
            }

            // 绘制粒子
            for (const p of emperorParticles) {
                const alpha = p.life / p.maxLife;
                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.fillStyle = p.color;
                ctx.shadowColor = p.color;
                ctx.shadowBlur = 12;
                ctx.beginPath();
                ctx.arc(p.x, p.y, Math.max(0.1, p.size * alpha), 0, Math.PI*2);
                ctx.fill();
                ctx.restore();
            }

            // 绘制帝君死亡碎裂放射线
            drawDeathCracks(emperorDeathEffects);
        }

        // ===== 新增：冥渊特效更新+绘制 =====
        function updateAbyssEffects() {
            // 光环
            abyssRings = abyssRings.filter(r => r.life > 0);
            for (const ring of abyssRings) {
                ring.life--;
                const prog = 1 - ring.life / ring.maxLife;
                ring.radius = ring.maxRadius * prog;
            }
            // 粒子
            abyssParticles = abyssParticles.filter(p => p.life > 0);
            for (const p of abyssParticles) {
                p.life--;
                p.x += p.vx;
                p.y += p.vy;
                p.vx *= 0.94;
                p.vy *= 0.94;
            }
            // 绘制光环
            for (const ring of abyssRings) {
                const alpha = ring.life / ring.maxLife;
                ctx.save();
                ctx.globalAlpha = alpha * 0.8;
                ctx.strokeStyle = ring.color;
                ctx.lineWidth = ring.width * alpha;
                ctx.shadowColor = ring.color;
                ctx.shadowBlur = 30;
                ctx.beginPath();
                ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI*2);
                ctx.stroke();
                ctx.globalAlpha = alpha * 0.4;
                ctx.lineWidth = ring.width * 0.5 * alpha;
                ctx.stroke();
                ctx.restore();
            }
            // 绘制粒子
            for (const p of abyssParticles) {
                const alpha = p.life / p.maxLife;
                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.fillStyle = p.color;
                ctx.shadowColor = p.color;
                ctx.shadowBlur = 15;
                ctx.beginPath();
                ctx.arc(p.x, p.y, Math.max(0.1, p.size * alpha), 0, Math.PI*2);
                ctx.fill();
                ctx.restore();
            }
            // 冥渊死亡碎裂放射线
            drawDeathCracks(abyssDeathEffects);
        }

        // ===== 新增：剑圣Boss特效更新与绘制 =====
        function updateBladeEffects() {
            // 光环
            bladeRings = bladeRings.filter(r => r.life > 0);
            for (const ring of bladeRings) {
                ring.life--;
                const prog = 1 - ring.life / ring.maxLife;
                ring.radius = ring.maxRadius * prog;
            }
            // 粒子/弹幕更新
            for (let i = bladeParticles.length - 1; i >= 0; i--) {
                const p = bladeParticles[i];
                p.life--;
                if (p.type === 'burst') {
                    p.x += p.vx; p.y += p.vy;
                    p.vx *= 0.92; p.vy *= 0.92;
                } else if (p.type === 'bladeProjectile') {
                    p.trail.push({x:p.x, y:p.y});
                    if (p.trail.length > 12) p.trail.shift();
                    p.x += p.vx; p.y += p.vy;
                    if (p.hitCooldown > 0) p.hitCooldown--;
                    if (p.x < -50 || p.x > MAP_WIDTH+50 || p.y < -50 || p.y > MAP_HEIGHT+50) {
                        p.life = 0;
                        continue;
                    }
                    const dx = hero.x - p.x, dy = hero.y - p.y;
                    if (Math.sqrt(dx*dx+dy*dy) < 25 && p.hitCooldown <= 0) {
                        p.hitCooldown = 30;
                        heroAttackedBy({attack: p.damage, color: p.color, isBladeProjectile: true}, p.damage, p.color);
                    }
                } else if (p.type === 'giantBlade') {
                    p.trail.push({x:p.x, y:p.y});
                    if (p.trail.length > 16) p.trail.shift();
                    p.x += p.vx; p.y += p.vy;
                    if (p.hitCooldown > 0) p.hitCooldown--;
                    if (p.x < -80 || p.x > MAP_WIDTH+80 || p.y < -80 || p.y > MAP_HEIGHT+80) {
                        p.life = 0;
                        continue;
                    }
                    const dx = hero.x - p.x, dy = hero.y - p.y;
                    if (Math.sqrt(dx*dx+dy*dy) < 40 && p.hitCooldown <= 0) {
                        p.hitCooldown = 30;
                        heroAttackedBy({attack: p.damage, color: p.color, isBladeProjectile: true}, p.damage, p.color);
                    }
                } else if (p.type === 'bladeStrike') {
                    // 伤害已在execute时处理，这里只做动画
                }
                if (p.life <= 0) bladeParticles.splice(i, 1);
            }

            // ===== 绘制光环 =====
            for (const ring of bladeRings) {
                const alpha = ring.life / ring.maxLife;
                ctx.save();
                ctx.globalAlpha = alpha * 0.8;
                ctx.strokeStyle = ring.color;
                ctx.lineWidth = ring.width * alpha;
                ctx.shadowColor = ring.color;
                ctx.shadowBlur = 25;
                ctx.beginPath();
                ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI*2);
                ctx.stroke();
                ctx.globalAlpha = alpha * 0.3;
                ctx.lineWidth = ring.width * 0.5 * alpha;
                ctx.stroke();
                ctx.restore();
            }
            // ===== 绘制粒子 =====
            for (const p of bladeParticles) {
                const alpha = p.life / p.maxLife;
                ctx.save();
                ctx.globalAlpha = alpha;
                if (p.type === 'burst') {
                    ctx.fillStyle = p.color;
                    ctx.shadowColor = p.color;
                    ctx.shadowBlur = 12;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, Math.max(0.1, p.size * alpha), 0, Math.PI*2);
                    ctx.fill();
                } else if (p.type === 'bladeProjectile') {
                    // 拖尾
                    for (let t = 0; t < p.trail.length; t++) {
                        const tr = p.trail[t];
                        const ta = (t/p.trail.length) * alpha * 0.5;
                        ctx.globalAlpha = ta;
                        ctx.fillStyle = p.color;
                        ctx.shadowColor = p.color;
                        ctx.shadowBlur = 10;
                        ctx.beginPath();
                        ctx.arc(tr.x, tr.y, 4*(t/p.trail.length), 0, Math.PI*2);
                        ctx.fill();
                    }
                    ctx.globalAlpha = alpha;
                    // 剑形
                    ctx.translate(p.x, p.y);
                    ctx.rotate(p.angle);
                    ctx.fillStyle = p.color;
                    ctx.shadowColor = p.color;
                    ctx.shadowBlur = 18;
                    ctx.beginPath();
                    ctx.moveTo(20, 0);
                    ctx.lineTo(-8, -5);
                    ctx.lineTo(-5, 0);
                    ctx.lineTo(-8, 5);
                    ctx.closePath();
                    ctx.fill();
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                } else if (p.type === 'giantBlade') {
                    for (let t = 0; t < p.trail.length; t++) {
                        const tr = p.trail[t];
                        const ta = (t/p.trail.length) * alpha * 0.6;
                        ctx.globalAlpha = ta;
                        ctx.fillStyle = p.color;
                        ctx.shadowColor = p.color;
                        ctx.shadowBlur = 15;
                        ctx.beginPath();
                        ctx.arc(tr.x, tr.y, 8*(t/p.trail.length), 0, Math.PI*2);
                        ctx.fill();
                    }
                    ctx.globalAlpha = alpha;
                    ctx.translate(p.x, p.y);
                    ctx.rotate(p.angle);
                    ctx.fillStyle = p.color;
                    ctx.shadowColor = '#ffffff';
                    ctx.shadowBlur = 25;
                    ctx.beginPath();
                    ctx.moveTo(35, 0);
                    ctx.lineTo(-12, -10);
                    ctx.lineTo(-8, 0);
                    ctx.lineTo(-12, 10);
                    ctx.closePath();
                    ctx.fill();
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                } else if (p.type === 'bladeStrike') {
                    // 剑雨落地效果：扩散圆环+柱形光
                    const prog = 1 - p.life/p.maxLife;
                    ctx.globalAlpha = alpha * 0.7;
                    ctx.fillStyle = p.color;
                    ctx.shadowColor = p.color;
                    ctx.shadowBlur = 20;
                    // 中心光爆
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.radius * (0.3 + prog*0.7), 0, Math.PI*2);
                    ctx.fill();
                    ctx.globalAlpha = alpha;
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.radius * prog, 0, Math.PI*2);
                    ctx.stroke();
                    // 垂直剑光
                    ctx.strokeStyle = p.color;
                    ctx.lineWidth = 4 * alpha;
                    ctx.shadowBlur = 15;
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y - p.radius - 30*(1-prog));
                    ctx.lineTo(p.x, p.y);
                    ctx.stroke();
                }
                ctx.restore();
            }

            // 绘制剑圣蓄力预警（世界空间）
            for (const bm of bladeMasters) {
                if (bm.alive) bm.drawChargeWarning();
            }
        }

        // ===== 新增：妄瞳Boss特效更新与绘制 =====
        function updateEyeEffects() {
            // 光环
            eyeRings = eyeRings.filter(r => r.life > 0);
            for (const ring of eyeRings) {
                ring.life--;
                const prog = 1 - ring.life / ring.maxLife;
                ring.radius = ring.maxRadius * prog;
            }
            // 粒子/弹幕更新
            for (let i = eyeParticles.length - 1; i >= 0; i--) {
                const p = eyeParticles[i];
                p.life--;
                if (p.type === 'burst') {
                    p.x += p.vx; p.y += p.vy;
                    p.vx *= 0.92; p.vy *= 0.92;
                } else if (p.type === 'eyeLaser') {
                    // 激光伸长
                    if (p.length < p.maxLength) p.length += 25;
                    // 多段伤害检测（每10帧检测一次）
                    if (p.life % 8 === 0) {
                        const steps = 15;
                        for (let s = 1; s <= steps; s++) {
                            const t = s / steps;
                            const cx = p.x + p.dirX * p.length * t;
                            const cy = p.y + p.dirY * p.length * t;
                            const dx = hero.x - cx, dy = hero.y - cy;
                            if (Math.sqrt(dx*dx+dy*dy) < 25) {
                            heroAttackedBy({attack: enemyBaseAttack*1.5*2.5, color: p.color}, enemyBaseAttack*1.5*2.5, p.color);
                                break;
                            }
                        }
                    }
                    // 边界
                    const endX = p.x + p.dirX * p.length;
                    const endY = p.y + p.dirY * p.length;
                    if (endX < -50 || endX > MAP_WIDTH+50 || endY < -50 || endY > MAP_HEIGHT+50) {
                        // 不截断，继续绘制
                    }
                } else if (p.type === 'eyeBomb') {
                    p.progress += 1 / 35; // 约0.6秒到达
                    if (p.progress >= 1 && !p.exploded) {
                        p.exploded = true;
                        p.life = 15; // 爆炸持续15帧
                        // 爆炸伤害
                        const dx = hero.x - p.targetX, dy = hero.y - p.targetY;
                        if (Math.sqrt(dx*dx+dy*dy) < 55) {
                            heroAttackedBy({attack: enemyBaseAttack*2*2.5, color: p.color}, enemyBaseAttack*2*2.5, p.color);
                        }
                        // 爆炸粒子
                        for (let k = 0; k < 12; k++) {
                            const a = Math.random()*Math.PI*2;
                            eyeParticles.push({
                                type:'burst', x:p.targetX, y:p.targetY,
                                vx:Math.cos(a)*(2+Math.random()*3),
                                vy:Math.sin(a)*(2+Math.random()*3),
                                life:25, maxLife:25, color:p.edgeColor, size:5
                            });
                        }
                    }
                }
                if (p.life <= 0) eyeParticles.splice(i, 1);
            }

            // ===== 绘制光环 =====
            for (const ring of eyeRings) {
                const alpha = ring.life / ring.maxLife;
                ctx.save();
                ctx.globalAlpha = alpha * 0.8;
                ctx.strokeStyle = ring.color;
                ctx.lineWidth = ring.width * alpha;
                ctx.shadowColor = ring.color;
                ctx.shadowBlur = 25;
                ctx.beginPath();
                ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI*2);
                ctx.stroke();
                ctx.globalAlpha = alpha * 0.3;
                ctx.lineWidth = ring.width * 0.5 * alpha;
                ctx.stroke();
                ctx.restore();
            }
            // ===== 绘制粒子/弹幕 =====
            for (const p of eyeParticles) {
                const alpha = p.life / p.maxLife;
                ctx.save();
                ctx.globalAlpha = alpha;
                if (p.type === 'burst') {
                    ctx.fillStyle = p.color;
                    ctx.shadowColor = p.color;
                    ctx.shadowBlur = 12;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, Math.max(0.1, p.size * alpha), 0, Math.PI*2);
                    ctx.fill();
                } else if (p.type === 'eyeLaser') {
                    ctx.strokeStyle = p.color;
                    ctx.lineWidth = 10 * alpha;
                    ctx.shadowColor = p.edgeColor;
                    ctx.shadowBlur = 30;
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y);
                    ctx.lineTo(p.x + p.dirX*p.length, p.y + p.dirY*p.length);
                    ctx.stroke();
                    ctx.strokeStyle = p.edgeColor;
                    ctx.lineWidth = 4 * alpha;
                    ctx.shadowBlur = 20;
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y);
                    ctx.lineTo(p.x + p.dirX*p.length, p.y + p.dirY*p.length);
                    ctx.stroke();
                    // 白色核心
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 2;
                    ctx.shadowBlur = 10;
                    ctx.globalAlpha = alpha * 0.8;
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y);
                    ctx.lineTo(p.x + p.dirX*p.length, p.y + p.dirY*p.length);
                    ctx.stroke();
                } else if (p.type === 'eyeBomb') {
                    if (!p.exploded) {
                        // 飞行弹道（抛物线视觉）
                        const bx = p.x + (p.targetX - p.x) * p.progress;
                        const by = p.y + (p.targetY - p.y) * p.progress;
                        // 抛物高度
                        const arcH = Math.sin(p.progress * Math.PI) * 80;
                        const drawY = by - arcH;
                        ctx.fillStyle = p.color;
                        ctx.shadowColor = p.color;
                        ctx.shadowBlur = 20;
                        ctx.beginPath();
                        ctx.arc(bx, drawY, 10, 0, Math.PI*2);
                        ctx.fill();
                        ctx.strokeStyle = p.edgeColor;
                        ctx.lineWidth = 2;
                        ctx.stroke();
                        // 瞄准点标记
                        ctx.globalAlpha = 0.3;
                        ctx.strokeStyle = p.color;
                        ctx.lineWidth = 2;
                        ctx.beginPath();
                        ctx.arc(p.targetX, p.targetY, 20 + Math.sin(Date.now()*0.01)*5, 0, Math.PI*2);
                        ctx.stroke();
                    } else {
                        // 爆炸
                        const expR = (1 - p.life/15) * 55;
                        ctx.globalAlpha = alpha * 0.6;
                        ctx.fillStyle = p.color;
                        ctx.shadowColor = p.edgeColor;
                        ctx.shadowBlur = 30;
                        ctx.beginPath();
                        ctx.arc(p.targetX, p.targetY, expR, 0, Math.PI*2);
                        ctx.fill();
                        ctx.globalAlpha = alpha;
                        ctx.strokeStyle = '#ffffff';
                        ctx.lineWidth = 3;
                        ctx.beginPath();
                        ctx.arc(p.targetX, p.targetY, expR, 0, Math.PI*2);
                        ctx.stroke();
                    }
                }
                ctx.restore();
            }

            // 绘制妄瞳蓄力预警
            for (const me of madEyes) {
                if (me.alive) me.drawChargeWarning();
            }
        }

        // ===== 新增：幽Boss特效更新与绘制 =====
        function updateYouEffects() {
            // 光环
            youRings = youRings.filter(r => r.life > 0);
            for (const ring of youRings) {
                ring.life--;
                const prog = 1 - ring.life / ring.maxLife;
                ring.radius = ring.maxRadius * prog;
            }
            // 常驻燃烧粒子（为每个存活的幽Boss生成火焰）
            for (const yb of youBosses) {
                if (!yb.alive) continue;
                const burnRate = yb.youEnraged ? 4 : 2;
                for (let i = 0; i < burnRate; i++) {
                    const a = Math.random() * Math.PI * 2;
                    const r = yb.radius * (0.6 + Math.random() * 0.5);
                    youParticles.push({
                        type: 'flame',
                        x: yb.x + Math.cos(a) * r,
                        y: yb.y + Math.sin(a) * r,
                        vx: (Math.random() - 0.5) * 2,
                        vy: -1 - Math.random() * 2,
                        life: 20 + Math.random() * 15, maxLife: 35,
                        size: 4 + Math.random() * 5
                    });
                }
            }
            // 粒子/弹幕更新
            for (let i = youParticles.length - 1; i >= 0; i--) {
                const p = youParticles[i];
                p.life--;
                if (p.type === 'burst') {
                    p.x += p.vx; p.y += p.vy;
                    p.vx *= 0.9; p.vy *= 0.9;
                } else if (p.type === 'flame') {
                    p.x += p.vx;
                    p.y += p.vy;
                    p.vy -= 0.08;
                    p.vx *= 0.96;
                    p.size *= 0.97;
                } else if (p.type === 'fireball') {
                    p.y += p.vy;
                    p.vy += 0.3;
                    if (!p.trail) p.trail = [];
                    p.trail.unshift({ x: p.x, y: p.y });
                    if (p.trail.length > 10) p.trail.pop();
                    if (p.y >= p.ty && !p.exploded) {
                        p.exploded = true;
                        p.life = 15;
                        const dx = hero.x - p.tx, dy = hero.y - p.ty;
                        if (Math.sqrt(dx*dx+dy*dy) < 50) {
                            heroAttackedBy({attack: p.damage, color: '#ff4400'}, p.damage, '#ff4400');
                        }
                        for (let k = 0; k < 15; k++) {
                            const a = Math.random()*Math.PI*2;
                            youParticles.push({
                                type:'burst', x:p.tx, y:p.ty,
                                vx:Math.cos(a)*(2+Math.random()*4),
                                vy:Math.sin(a)*(2+Math.random()*4)-1,
                                life:20+Math.random()*15, maxLife:35,
                                color:['#ff2200','#ff6600','#ffaa00','#ffff00'][Math.floor(Math.random()*4)],
                                size:4+Math.random()*6
                            });
                        }
                        youRings.push({ x: p.tx, y: p.ty, radius: 0, maxRadius: 80, life: 15, maxLife: 15, color: '#ff4400', width: 4 });
                    }
                }
                if (p.life <= 0) youParticles.splice(i, 1);
            }
            // 激光更新
            for (let i = youLasers.length - 1; i >= 0; i--) {
                const l = youLasers[i];
                l.life--;
                if (l.length < l.maxLength) l.length += 30;
                if (l.hitCooldown > 0) l.hitCooldown--;
                if (l.life % 6 === 0 && l.hitCooldown <= 0) {
                    const steps = 20;
                    for (let s = 1; s <= steps; s++) {
                        const t = s / steps;
                        const cx = l.x + l.dirX * l.length * t;
                        const cy = l.y + l.dirY * l.length * t;
                        const dx = hero.x - cx, dy = hero.y - cy;
                        if (Math.sqrt(dx*dx+dy*dy) < 28) {
                            heroAttackedBy({attack: enemyBaseAttack*2*2.5, color: '#ff0000'}, enemyBaseAttack*2*2.5, '#ff0000');
                            l.hitCooldown = 20;
                            break;
                        }
                    }
                }
                if (l.life <= 0) youLasers.splice(i, 1);
            }

            // ===== 绘制光环 =====
            for (const ring of youRings) {
                const alpha = ring.life / ring.maxLife;
                ctx.save();
                ctx.globalAlpha = alpha * 0.8;
                ctx.strokeStyle = ring.color;
                ctx.lineWidth = ring.width * alpha;
                ctx.shadowColor = ring.color;
                ctx.shadowBlur = 25;
                ctx.beginPath();
                ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI*2);
                ctx.stroke();
                ctx.globalAlpha = alpha * 0.3;
                ctx.lineWidth = ring.width * 0.5 * alpha;
                ctx.stroke();
                ctx.restore();
            }
            // ===== 绘制粒子/弹幕 =====
            for (const p of youParticles) {
                const alpha = p.life / p.maxLife;
                ctx.save();
                ctx.globalAlpha = alpha;
                if (p.type === 'burst') {
                    ctx.fillStyle = p.color;
                    ctx.shadowColor = p.color;
                    ctx.shadowBlur = 12;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, Math.max(0.1, p.size * alpha), 0, Math.PI*2);
                    ctx.fill();
                } else if (p.type === 'flame') {
                    const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
                    grad.addColorStop(0, `rgba(255,255,150,${alpha})`);
                    grad.addColorStop(0.3, `rgba(255,180,0,${alpha*0.8})`);
                    grad.addColorStop(0.7, `rgba(255,60,0,${alpha*0.6})`);
                    grad.addColorStop(1, 'rgba(200,0,0,0)');
                    ctx.fillStyle = grad;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.size, 0, Math.PI*2);
                    ctx.fill();
                } else if (p.type === 'fireball') {
                    if (!p.exploded) {
                        if (p.trail) {
                            for (let t = 1; t < p.trail.length; t++) {
                                const ta = alpha * (1 - t/p.trail.length) * 0.6;
                                ctx.globalAlpha = ta;
                                const grad = ctx.createRadialGradient(p.trail[t].x, p.trail[t].y, 0, p.trail[t].x, p.trail[t].y, 8);
                                grad.addColorStop(0, 'rgba(255,200,0,0.8)');
                                grad.addColorStop(1, 'rgba(255,50,0,0)');
                                ctx.fillStyle = grad;
                                ctx.beginPath();
                                ctx.arc(p.trail[t].x, p.trail[t].y, 8, 0, Math.PI*2);
                                ctx.fill();
                            }
                        }
                        ctx.globalAlpha = alpha;
                        ctx.fillStyle = '#ffcc00';
                        ctx.shadowColor = '#ff4400';
                        ctx.shadowBlur = 20;
                        ctx.beginPath();
                        ctx.arc(p.x, p.y, 8, 0, Math.PI*2);
                        ctx.fill();
                        ctx.fillStyle = '#ff4400';
                        ctx.beginPath();
                        ctx.arc(p.x, p.y, 12, 0, Math.PI*2);
                        ctx.fill();
                    } else {
                        const expR = (1 - p.life/15) * 60;
                        ctx.globalAlpha = alpha * 0.7;
                        const grad = ctx.createRadialGradient(p.tx, p.ty, 0, p.tx, p.ty, expR);
                        grad.addColorStop(0, 'rgba(255,255,200,0.9)');
                        grad.addColorStop(0.4, 'rgba(255,150,0,0.7)');
                        grad.addColorStop(1, 'rgba(200,0,0,0)');
                        ctx.fillStyle = grad;
                        ctx.beginPath();
                        ctx.arc(p.tx, p.ty, expR, 0, Math.PI*2);
                        ctx.fill();
                    }
                }
                ctx.restore();
            }
            // ===== 绘制激光 =====
            for (const l of youLasers) {
                const alpha = l.life / l.maxLife;
                ctx.save();
                ctx.globalAlpha = alpha;
                for (let layer = 0; layer < 5; layer++) {
                    const widths = [l.width*2.5, l.width*1.8, l.width*1.2, l.width*0.7, l.width*0.3];
                    const colors = ['#ff0000', '#ff2200', '#ff5500', '#ffaa00', '#ffffff'];
                    const blurs = [40, 30, 20, 12, 8];
                    ctx.strokeStyle = colors[layer];
                    ctx.lineWidth = widths[layer] * alpha;
                    ctx.shadowColor = colors[layer];
                    ctx.shadowBlur = blurs[layer];
                    ctx.beginPath();
                    ctx.moveTo(l.x, l.y);
                    ctx.lineTo(l.x + l.dirX*l.length, l.y + l.dirY*l.length);
                    ctx.stroke();
                }
                ctx.restore();
            }
        }

        // ============================================================
        // ===== 劫Boss三阶段技能特效：更新 + 绘制 + 伤害判定 =====
        // 由 JieBoss.updateJieSkills 生成特效对象到全局数组(jieParticles/
        // jieRings/jieLasers/jieZones/jieSummons)，本函数统一推进生命周期、
        // 绘制华丽特效并对英雄造成伤害。每帧调用一次(gameloop)。
        // ============================================================
        // 通用：画激光多层辉光（fireDragon/chain/stormBeam 复用，带colorLayer切换配色）
        function _drawJieLaserRich(l, colors /*[outer,mid,inner]*/, widthMul = 1) {
            const lr = l.life / l.maxLife;
            const ex = l.x + Math.cos(l.angle) * l.length, ey = l.y + Math.sin(l.angle) * l.length;
            const w = (l.width || 30) * widthMul;
            const layers = [
                { color: colors[0], w: w * 2.4, bl: 55 },
                { color: colors[1], w: w * 1.4, bl: 38 },
                { color: colors[2], w: w * 0.8, bl: 26 },
                { color: '#ffffff', w: w * 0.3, bl: 18 }
            ];
            for (const ly of layers) {
                ctx.strokeStyle = ly.color;
                ctx.lineWidth = Math.max(1, ly.w * lr);
                ctx.shadowColor = ly.color; ctx.shadowBlur = ly.bl;
                ctx.beginPath();
                ctx.moveTo(l.x, l.y);
                ctx.lineTo(ex, ey);
                ctx.stroke();
            }
        }
        function drawJieLaser(l, c1, c2, c3) { _drawJieLaserRich(l, [c1, c2, c3]); }

        function updateJieEffects() {
            // ---------- 0. 劫Boss常驻星尘光环（增强"压轴巨物"的华丽压迫感） ----------
            // 每帧彩色星尘上浮 + 环绕环带粒子，数量多但个体小
            for (const jb of jieBosses) {
                if (!jb.alive) continue;
                // 星尘上浮：概率提高到0.8
                for (let n = 0; n < 2; n++) {
                    if (Math.random() < 0.8) {
                        const a = Math.random() * Math.PI * 2;
                        const rr = jb.radius * (0.3 + Math.random() * 0.8);
                        jieParticles.push({
                            type: 'burst', x: jb.x + Math.cos(a) * rr, y: jb.y + Math.sin(a) * rr,
                            vx: (Math.random() - 0.5) * 1.0, vy: -1.0 - Math.random() * 1.2,
                            life: 40 + Math.random() * 30, maxLife: 70,
                            color: ['#44ffff', '#ff44ff', '#ffaa00', '#ffffff', '#66ff88', '#ff66aa'][Math.floor(Math.random() * 6)],
                            size: 3 + Math.random() * 5
                        });
                    }
                }
                // 外圈环绕粒子：每3帧喷一圈
                if (!jb._ringTick) jb._ringTick = 0;
                jb._ringTick = (jb._ringTick || 0) + 1;
                if (jb._ringTick % 3 === 0) {
                    const phaseColors = ['#44ffff', '#ff44ff', '#ffaa00'];
                    const pc = phaseColors[Math.min(jb.phase, 2)];
                    for (let i = 0; i < 10; i++) {
                        const a = (i / 10) * Math.PI * 2 + (jb._ringTick * 0.003);
                        jieParticles.push({
                            type: 'burst',
                            x: jb.x + Math.cos(a) * (jb.radius + 30 + Math.random() * 30),
                            y: jb.y + Math.sin(a) * (jb.radius + 30 + Math.random() * 30),
                            vx: Math.cos(a) * 0.8, vy: Math.sin(a) * 0.8,
                            life: 28, maxLife: 28,
                            color: pc, size: 3 + Math.random() * 3
                        });
                    }
                }
            }
            // ---------- 1. 光环 jieRings ----------
            jieRings = jieRings.filter(r => r.life > 0);
            for (const ring of jieRings) {
                ring.life--;
                const lifeRatio = ring.life / ring.maxLife;
                const prog = 1 - lifeRatio;
                ring.radius = (ring.maxRadius || 0) * prog;
                // 潮汐/混沌潮汐：扩散环对英雄造成持续伤害（每秒≈单次）
                if (ring.hitCooldown > 0) ring.hitCooldown--;
                if ((ring.type === 'tidal' || ring.type === 'chaosTide') && ring.hitCooldown <= 0) {
                    const d = Math.hypot(hero.x - ring.x, hero.y - ring.y);
                    const width = ring.width || 14;
                    if (d < ring.radius + width + 10 && d > ring.radius - width - 10) {
                        heroAttackedBy(this, Math.floor(ring.dmgPerSec / 2), ring.color || '#ff44ff');
                        ring.hitCooldown = 30;
                        triggerShake(false);
                    }
                }
                // 绘制：三层叠加（外辉光+中圈+内细圈）
                const baseColor = ring.color || '#44ffff';
                ctx.save();
                // 最外粗辉光
                ctx.globalAlpha = lifeRatio * 0.7;
                ctx.strokeStyle = baseColor;
                ctx.lineWidth = (ring.width || 6) * 2.6 * lifeRatio;
                ctx.shadowColor = baseColor; ctx.shadowBlur = 45;
                ctx.beginPath(); ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2); ctx.stroke();
                // 中圈
                ctx.globalAlpha = lifeRatio * 0.95;
                ctx.lineWidth = (ring.width || 6) * 1.3 * lifeRatio;
                ctx.shadowBlur = 25;
                ctx.beginPath(); ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2); ctx.stroke();
                // 内细亮圈
                ctx.globalAlpha = lifeRatio * 0.6;
                ctx.lineWidth = Math.max(1, (ring.width || 6) * 0.4 * lifeRatio);
                ctx.strokeStyle = '#ffffff';
                ctx.shadowBlur = 12;
                ctx.beginPath(); ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2); ctx.stroke();
                // 填充半透明
                if (ring.type === 'tidal' || ring.type === 'chaosTide') {
                    ctx.globalAlpha = lifeRatio * 0.2;
                    ctx.fillStyle = baseColor;
                    ctx.shadowBlur = 0;
                    ctx.beginPath(); ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2); ctx.fill();
                }
                ctx.restore();
            }

            // ---------- 2. 粒子 jieParticles ----------
            for (let i = jieParticles.length - 1; i >= 0; i--) {
                const p = jieParticles[i];
                p.life--;
                const a0 = p.life / p.maxLife;
                if (p.type === 'burst') {
                    p.x += p.vx; p.y += p.vy; p.vx *= 0.92; p.vy *= 0.92;
                } else if (p.type === 'meteor') {
                    // 流星弹幕：直线飞行+长拖尾（密度加强）
                    p.x += p.dirX * p.speed;
                    p.y += p.dirY * p.speed;
                    if (!p.trail) p.trail = [];
                    p.trail.unshift({ x: p.x, y: p.y });
                    if (p.trail.length > 14) p.trail.pop();
                    if (p.hitCooldown > 0) p.hitCooldown--;
                    if (p.hitCooldown <= 0 && Math.hypot(hero.x - p.x, hero.y - p.y) < 45) {
                        heroAttackedBy({ attack: p.damage, color: p.color }, p.damage, p.color);
                        p.hitCooldown = 20;
                    }
                } else if (p.type === 'flyblade') {
                    // 环形飞刃：直线扫射
                    p.x += p.dirX * p.speed;
                    p.y += p.dirY * p.speed;
                    if (p.hitCooldown > 0) p.hitCooldown--;
                    if (p.hitCooldown <= 0 && Math.hypot(hero.x - p.x, hero.y - p.y) < 40) {
                        heroAttackedBy({ attack: p.damage, color: p.color || '#ffaa00' }, p.damage, p.color || '#ffaa00');
                        p.hitCooldown = 20;
                    }
                } else if (p.type === 'orbit') {
                    // 逆转之环：绕Boss旋转（支持dir双向、双半径层）
                    p.angle += 0.06 * (p.dir || 1);
                    p.x = p.x0 + Math.cos(p.angle) * p.rad;
                    p.y = p.y0 + Math.sin(p.angle) * p.rad;
                    if (p.hitCooldown > 0) p.hitCooldown--;
                    if (p.hitCooldown <= 0 && Math.hypot(hero.x - p.x, hero.y - p.y) < 35) {
                        heroAttackedBy({ attack: p.damage, color: '#ff88ff' }, Math.floor(p.damage), '#ff88ff');
                        p.hitCooldown = 40;
                    }
                }
                if (p.life <= 0) { jieParticles.splice(i, 1); continue; }
                // 绘制（特效增强版）
                ctx.save();
                ctx.globalAlpha = Math.max(0.1, a0);
                if (p.type === 'burst') {
                    // 双圈叠加（小核心+外晕）
                    ctx.fillStyle = p.color;
                    ctx.shadowColor = p.color; ctx.shadowBlur = 22;
                    ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.1, (p.size || 3) * a0 * 1.3), 0, Math.PI * 2); ctx.fill();
                    ctx.globalAlpha = Math.max(0.05, a0 * 0.4);
                    ctx.fillStyle = '#ffffff';
                    ctx.shadowBlur = 6;
                    ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.1, (p.size || 3) * a0 * 0.55), 0, Math.PI * 2); ctx.fill();
                } else if (p.type === 'tear') {
                    // 泪珠：向下滑落 + 轻微高光，前两阶段清泪(P3血泪)
                    p.x += p.vx; p.y += p.vy; p.vy *= 1.02;
                    const sz = Math.max(0.1, (p.size || 3) * a0);
                    ctx.fillStyle = p.color;
                    ctx.shadowColor = p.color; ctx.shadowBlur = 12;
                    ctx.beginPath(); ctx.ellipse(p.x, p.y, sz * 0.75, sz, 0, 0, Math.PI * 2); ctx.fill();
                    // 泪珠高光点
                    ctx.globalAlpha = Math.max(0.1, a0 * 0.7);
                    ctx.fillStyle = '#ffffff';
                    ctx.shadowBlur = 0;
                    ctx.beginPath(); ctx.arc(p.x - sz * 0.2, p.y - sz * 0.3, sz * 0.22, 0, Math.PI * 2); ctx.fill();
                } else if (p.type === 'meteor') {
                    // 长拖尾（长度×2，每段渐变）
                    if (p.trail) for (let t = 1; t < p.trail.length; t++) {
                        ctx.globalAlpha = a0 * (1 - t / p.trail.length) * 0.75;
                        ctx.fillStyle = p.color;
                        ctx.shadowColor = p.color; ctx.shadowBlur = 14;
                        ctx.beginPath(); ctx.arc(p.trail[t].x, p.trail[t].y, 8 * (1 - t / p.trail.length), 0, Math.PI * 2); ctx.fill();
                    }
                    ctx.globalAlpha = a0;
                    // 核心：3层径向渐变
                    const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 22);
                    grad.addColorStop(0, '#ffffff');
                    grad.addColorStop(0.25, p.color);
                    grad.addColorStop(0.7, p.color);
                    grad.addColorStop(1, 'rgba(0,0,0,0)');
                    ctx.fillStyle = grad;
                    ctx.shadowColor = p.color; ctx.shadowBlur = 40;
                    ctx.beginPath(); ctx.arc(p.x, p.y, 22, 0, Math.PI * 2); ctx.fill();
                } else if (p.type === 'flyblade') {
                    // 飞刃：3层渐变线段
                    const bc = p.color || '#ffaa00';
                    ctx.strokeStyle = bc;
                    ctx.lineWidth = 9; ctx.globalAlpha = a0 * 0.55;
                    ctx.shadowColor = bc; ctx.shadowBlur = 28;
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y);
                    ctx.lineTo(p.x - p.dirX * 34, p.y - p.dirY * 34);
                    ctx.stroke();
                    ctx.lineWidth = 5; ctx.globalAlpha = a0 * 0.9;
                    ctx.shadowBlur = 18;
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y);
                    ctx.lineTo(p.x - p.dirX * 28, p.y - p.dirY * 28);
                    ctx.stroke();
                    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.globalAlpha = a0;
                    ctx.shadowBlur = 8;
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y);
                    ctx.lineTo(p.x - p.dirX * 22, p.y - p.dirY * 22);
                    ctx.stroke();
                } else if (p.type === 'orbit') {
                    // 逆转之环珠：3层光圈
                    ctx.fillStyle = '#ff44ff'; ctx.shadowColor = '#ff44ff'; ctx.shadowBlur = 28;
                    ctx.beginPath(); ctx.arc(p.x, p.y, 12, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = '#ff88ff'; ctx.shadowBlur = 14;
                    ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = '#ffffff'; ctx.shadowBlur = 6;
                    ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
                }
                ctx.restore();
            }

            // ---------- 3. 激光 jieLasers ----------
            for (let i = jieLasers.length - 1; i >= 0; i--) {
                const l = jieLasers[i];
                l.life-- ? l.life = l.life : l.life = 0;
                if (l.type === 'fireDragon') {
                    // 旋转激光火龙：支持2层（相反方向旋转），命中判定按角距离
                    l.angle += l.rotateSpeed;
                    if (l.length < l.maxLength) l.length += 150;
                    if (l.hitCooldown > 0) l.hitCooldown--;
                    const angToHero = Math.atan2(hero.y - l.y, hero.x - l.x);
                    let diff = Math.abs(normAngle(angToHero - l.angle));
                    const safeHalf = l.safeSector * Math.PI;
                    if (diff > safeHalf && l.hitCooldown <= 0) {
                        const atkCol = (l.colorLayer === 1) ? '#ff44ff' : '#ffaa00';
                        heroAttackedBy({ attack: l.dmgPerSec, color: atkCol }, Math.floor(l.dmgPerSec / 2), atkCol);
                        l.hitCooldown = 30;
                    }
                    // 配色分层
                    if ((l.colorLayer || 0) === 0) drawJieLaser(l, '#ffaa00', '#ff4400', '#fff2cc');
                    else _drawJieLaserRich(l, ['#ff44ff', '#aa00ff', '#ffc8ff']);
                } else if (l.type === 'chain') {
                    // 秩序之链：2条交错（offset=0/1 颜色切换+位置微偏移）
                    const off = l.offset || 0;
                    const dx = hero.x - l.x, dy = hero.y - l.y;
                    const dl = Math.hypot(dx, dy) || 1;
                    const baseAng = Math.atan2(dy, dx);
                    const ang = baseAng + (off === 1 ? 0.18 : -0.05);
                    const tx = l.x + Math.cos(ang) * dl, ty = l.y + Math.sin(ang) * dl;
                    l.angle = ang; l.length = dl; l._endX = tx; l._endY = ty;
                    if (l.hitCooldown > 0) l.hitCooldown--;
                    if (l.hitCooldown <= 0 && dl < 700) {
                        heroAttackedBy({ attack: l.dmgPerSec, color: off === 1 ? '#44ffff' : '#ffdd44' }, Math.floor(l.dmgPerSec / 2), off === 1 ? '#44ffff' : '#ffdd44');
                        l.hitCooldown = 30;
                    }
                    if (off === 0) drawJieLaser(l, '#ffdd44', '#ff8800', '#fff8dd');
                    else _drawJieLaserRich(l, ['#44ffff', '#0088ff', '#ddffff']);
                } else if (l.type === 'kingLaser') {
                    // 帝君式12向预判激光：蓄力期画预警线，蓄力完发射
                    if (l.charge > 0) {
                        l.charge--;
                        ctx.save();
                        for (let k = 0; k < l.beamCount; k++) {
                            const ang = (k / l.beamCount) * Math.PI * 2 + l.baseRot;
                            // 更厚的预警+双描边
                            const flash = 0.35 + 0.35 * Math.sin(l.charge * 0.25);
                            ctx.strokeStyle = `rgba(255,80,255,${flash * 0.6})`;
                            ctx.lineWidth = 9;
                            ctx.shadowColor = '#ff44ff'; ctx.shadowBlur = 26;
                            ctx.beginPath();
                            ctx.moveTo(l.x, l.y);
                            ctx.lineTo(l.x + Math.cos(ang) * l.maxLength, l.y + Math.sin(ang) * l.maxLength);
                            ctx.stroke();
                            ctx.strokeStyle = `rgba(255,255,255,${flash})`;
                            ctx.lineWidth = 3;
                            ctx.shadowBlur = 10;
                            ctx.beginPath();
                            ctx.moveTo(l.x, l.y);
                            ctx.lineTo(l.x + Math.cos(ang) * l.maxLength, l.y + Math.sin(ang) * l.maxLength);
                            ctx.stroke();
                        }
                        ctx.restore();
                    } else {
                        if (l.length < l.maxLength) l.length += 150;
                        if (l.hitCooldown > 0) l.hitCooldown--;
                        for (let k = 0; k < l.beamCount && l.hitCooldown <= 0; k++) {
                            const ang = (k / l.beamCount) * Math.PI * 2 + l.baseRot;
                            const dist = Math.abs((hero.x - l.x) * Math.sin(ang) - (hero.y - l.y) * Math.cos(ang));
                            const dot = (hero.x - l.x) * Math.cos(ang) + (hero.y - l.y) * Math.sin(ang);
                            if (dist < 24 && dot > 0) {
                                heroAttackedBy({ attack: l.dmg, color: '#ff44ff' }, l.dmg, '#ff44ff');
                                l.hitCooldown = 30;
                                break;
                            }
                        }
                        // 全部光束多层辉光
                        ctx.save();
                        ctx.globalAlpha = l.life / l.maxLife;
                        const layers = [
                            { color: '#ff44ff', w: l.width * 2.4, bl: 55 },
                            { color: '#7700ff', w: l.width * 1.4, bl: 38 },
                            { color: '#ff88ff', w: l.width * 0.85, bl: 26 },
                            { color: '#ffffff', w: l.width * 0.35, bl: 16 }
                        ];
                        for (let k = 0; k < l.beamCount; k++) {
                            const ang = (k / l.beamCount) * Math.PI * 2 + l.baseRot;
                            const ex = l.x + Math.cos(ang) * l.length, ey = l.y + Math.sin(ang) * l.length;
                            for (const ly of layers) {
                                ctx.strokeStyle = ly.color;
                                ctx.lineWidth = Math.max(1, ly.w * (l.life / l.maxLife));
                                ctx.shadowColor = ly.color; ctx.shadowBlur = ly.bl;
                                ctx.beginPath();
                                ctx.moveTo(l.x, l.y);
                                ctx.lineTo(ex, ey);
                                ctx.stroke();
                            }
                        }
                        ctx.restore();
                    }
                } else if (l.type === 'stormBeam') {
                    // 焚天风暴激光（支持2层colorLayer配色）
                    if (l.length < l.maxLength) l.length += 200;
                    if (l.hitCooldown > 0) l.hitCooldown--;
                    const dist = Math.abs((hero.x - l.x) * Math.sin(l.angle) - (hero.y - l.y) * Math.cos(l.angle));
                    const dot = (hero.x - l.x) * Math.cos(l.angle) + (hero.y - l.y) * Math.sin(l.angle);
                    if (dist < 26 && dot > 0 && l.hitCooldown <= 0) {
                        const atkCol = (l.colorLayer === 1) ? '#ffaa00' : '#ff66ff';
                        heroAttackedBy({ attack: l.dmgPerSec, color: atkCol }, Math.floor(l.dmgPerSec / 2), atkCol);
                        l.hitCooldown = 30;
                    }
                    if ((l.colorLayer || 0) === 0) drawJieLaser(l, '#ff66ff', '#9900ff', '#ffccff');
                    else _drawJieLaserRich(l, ['#ffaa00', '#ff2200', '#ffddaa']);
                }
                if (l.life <= 0) jieLasers.splice(i, 1);
            }

            // ---------- 4. 区域伤害 jieZones ----------
            for (let i = jieZones.length - 1; i >= 0; i--) {
                const z = jieZones[i];
                if (z.timer !== undefined && z.timer > 0) z.timer--;
                if (z.type === 'rainbowBomb') {
                    // 彩虹炸弹：前摇(charge)内显示预判点 + 闪烁预警色，到时爆炸
                    if (z.charge > 0) {
                        z.charge--;
                        ctx.save();
                        const col = z.color || '#ff4d6d';
                        const flash = 0.35 + 0.45 * Math.sin((z.charge + (z.index || 0) * 12) * 0.3);
                        // 外环闪烁
                        ctx.strokeStyle = col;
                        ctx.globalAlpha = flash;
                        ctx.lineWidth = 7; ctx.shadowColor = col; ctx.shadowBlur = 40;
                        ctx.beginPath(); ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2); ctx.stroke();
                        // 半透明填色
                        ctx.globalAlpha = flash * 0.35;
                        ctx.fillStyle = col;
                        ctx.beginPath(); ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2); ctx.fill();
                        // 中心预判点（瞄准十字+小实心圆）
                        ctx.globalAlpha = 1;
                        ctx.fillStyle = col; ctx.shadowBlur = 30;
                        ctx.beginPath(); ctx.arc(z.x, z.y, 12, 0, Math.PI * 2); ctx.fill();
                        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.shadowBlur = 10;
                        ctx.beginPath(); ctx.moveTo(z.x - 22, z.y); ctx.lineTo(z.x + 22, z.y); ctx.moveTo(z.x, z.y - 22); ctx.lineTo(z.x, z.y + 22); ctx.stroke();
                        // 倒计时刻度环（剩余电荷用弧显示）
                        const total0 = Math.max(1, z.timer !== undefined ? 60 : 1);
                        const p0 = 1 - Math.max(0, Math.min(1, z.charge / 60));
                        ctx.strokeStyle = '#ffffff';
                        ctx.globalAlpha = 0.9;
                        ctx.lineWidth = 5;
                        ctx.beginPath(); ctx.arc(z.x, z.y, z.radius - 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p0); ctx.stroke();
                        ctx.restore();
                    } else {
                        // 爆炸：范围伤害+超大粒子爆发
                        if (z.hitCooldown <= 0 && Math.hypot(hero.x - z.x, hero.y - z.y) < z.radius) {
                            heroAttackedBy({ attack: z.dmg, color: z.color }, z.dmg, z.color);
                            z.hitCooldown = 999;
                        }
                        // 3层冲击环+超多粒子
                        const col = z.color || '#ff4d6d';
                        jieRings.push({ type: 'ring', x: z.x, y: z.y, radius: 0, maxRadius: z.radius, life: 28, maxLife: 28, color: col, width: 14 });
                        jieRings.push({ type: 'ring', x: z.x, y: z.y, radius: 0, maxRadius: z.radius * 1.5, life: 36, maxLife: 36, color: '#ffffff', width: 6 });
                        for (let k = 0; k < 60; k++) {
                            const a = Math.random() * Math.PI * 2;
                            const spd = 4 + Math.random() * 9;
                            jieParticles.push({ type: 'burst', x: z.x, y: z.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, life: 30 + Math.random() * 20, maxLife: 50, color: Math.random() < 0.5 ? col : '#ffffff', size: 5 + Math.random() * 5 });
                        }
                        triggerShake(true);
                        jieZones.splice(i, 1);
                    }
                } else if (z.type === 'pulse') {
                    // 星辰脉冲：前摇2秒满半径预警 → 扩散圈命中伤害
                    if (z.charge > 0) {
                        z.charge--;
                        ctx.save();
                        const flash = 0.35 + 0.4 * Math.sin(z.charge * 0.15);
                        // 三层：外层淡、中层浓、中心瞄准圈
                        ctx.strokeStyle = `rgba(102,238,255,${flash})`;
                        ctx.lineWidth = 10; ctx.shadowColor = '#66eeff'; ctx.shadowBlur = 50;
                        ctx.beginPath(); ctx.arc(z.x, z.y, z.maxRadius, 0, Math.PI * 2); ctx.stroke();
                        ctx.lineWidth = 4; ctx.globalAlpha = flash * 0.9; ctx.shadowBlur = 25;
                        ctx.beginPath(); ctx.arc(z.x, z.y, z.maxRadius, 0, Math.PI * 2); ctx.stroke();
                        ctx.globalAlpha = flash * 0.25; ctx.shadowBlur = 0;
                        ctx.fillStyle = '#66eeff';
                        ctx.beginPath(); ctx.arc(z.x, z.y, z.maxRadius, 0, Math.PI * 2); ctx.fill();
                        // 中心十字预判
                        ctx.globalAlpha = 1;
                        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.shadowBlur = 15;
                        ctx.beginPath(); ctx.arc(z.x, z.y, 30, 0, Math.PI * 2); ctx.stroke();
                        ctx.beginPath(); ctx.moveTo(z.x - 38, z.y); ctx.lineTo(z.x + 38, z.y); ctx.moveTo(z.x, z.y - 38); ctx.lineTo(z.x, z.y + 38); ctx.stroke();
                        ctx.restore();
                    } else {
                        z.life--;
                        z.radius += 9;  // 扩散更快
                        if (z.hitCooldown > 0) z.hitCooldown--;
                        if (z.hitCooldown <= 0 && Math.abs(Math.hypot(hero.x - z.x, hero.y - z.y) - z.radius) < 40) {
                            heroAttackedBy({ attack: z.dmg, color: '#66eeff' }, z.dmg, '#66eeff');
                            z.hitCooldown = 30;
                        }
                        // 三层扩散环
                        ctx.save();
                        const lr = z.life / z.maxLife;
                        ctx.globalAlpha = lr;
                        ctx.strokeStyle = '#66eeff'; ctx.lineWidth = 12; ctx.shadowColor = '#66eeff'; ctx.shadowBlur = 55;
                        ctx.beginPath(); ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2); ctx.stroke();
                        ctx.strokeStyle = '#ddffff'; ctx.lineWidth = 5; ctx.shadowBlur = 20;
                        ctx.beginPath(); ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2); ctx.stroke();
                        ctx.globalAlpha = lr * 0.2;
                        ctx.fillStyle = '#66eeff'; ctx.shadowBlur = 0;
                        ctx.beginPath(); ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2); ctx.fill();
                        ctx.restore();
                        if (z.life <= 0) jieZones.splice(i, 1);
                    }
                } else if (z.type === 'crush' || z.type === 'execution' || z.type === 'rift') {
                    // 落点预警 + 爆炸（星陨重压/处决/空间折跃）
                    if (z.timer > 0) {
                        ctx.save();
                        const baseColor = z.type === 'crush' ? '#ff8800' : (z.type === 'rift' ? '#ff4444' : '#ff44ff');
                        const flash = 0.4 + 0.4 * Math.sin(z.timer * 0.25);
                        // 外双环+填色+中心瞄准
                        ctx.strokeStyle = baseColor;
                        ctx.globalAlpha = flash;
                        ctx.lineWidth = 8; ctx.shadowColor = baseColor; ctx.shadowBlur = 45;
                        ctx.beginPath(); ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2); ctx.stroke();
                        ctx.lineWidth = 3; ctx.shadowBlur = 15;
                        ctx.beginPath(); ctx.arc(z.x, z.y, z.radius * 0.65, 0, Math.PI * 2); ctx.stroke();
                        ctx.globalAlpha = flash * 0.35;
                        ctx.fillStyle = baseColor; ctx.shadowBlur = 0;
                        ctx.beginPath(); ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2); ctx.fill();
                        // 中心预判
                        ctx.globalAlpha = 1; ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 20;
                        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
                        ctx.beginPath(); ctx.arc(z.x, z.y, 18, 0, Math.PI * 2); ctx.stroke();
                        ctx.beginPath(); ctx.moveTo(z.x - 28, z.y); ctx.lineTo(z.x + 28, z.y); ctx.moveTo(z.x, z.y - 28); ctx.lineTo(z.x, z.y + 28); ctx.stroke();
                        ctx.restore();
                    } else {
                        if (z.hitCooldown <= 0 && Math.hypot(hero.x - z.x, hero.y - z.y) < z.radius) {
                            const col = z.type === 'crush' ? '#ff8800' : (z.type === 'rift' ? '#ff4444' : '#ff44ff');
                            heroAttackedBy({ attack: z.dmg, color: col }, z.dmg, col);
                            z.hitCooldown = 999;
                        }
                        const col = z.type === 'crush' ? '#ff8800' : (z.type === 'rift' ? '#ff4444' : '#ff44ff');
                        // ===== 空间折跃：爆炸落点即位移终点，劫传送到红圈中心（唯一位移技能） =====
                        if (z.type === 'rift') {
                            for (let j = 0; j < jieBosses.length; j++) {
                                const jb = jieBosses[j];
                                if (!jb || !jb.alive) continue;
                                const nx = Math.max(jb._cfg.minX, Math.min(jb._cfg.maxX, z.x));
                                const ny = Math.max(jb._cfg.minY, Math.min(jb._cfg.maxY, z.y));
                                jb.x = nx; jb.y = ny;
                                // 传送瞬间：巨物残影 + 落点冲击（视觉强调位移）
                                jieRings.push({ type: 'ring', x: nx, y: ny, radius: 0, maxRadius: jb.radius * 1.2, life: 30, maxLife: 30, color: '#ff44ff', width: 14 });
                                for (let k = 0; k < 90; k++) {
                                    const a = Math.random() * Math.PI * 2;
                                    const spd = 4 + Math.random() * 12;
                                    jieParticles.push({ type: 'burst', x: nx, y: ny, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, life: 30 + Math.random() * 30, maxLife: 60, color: Math.random() < 0.5 ? '#ff44ff' : '#ffffff', size: 7 + Math.random() * 7 });
                                }
                            }
                        }
                        // 双层冲击环+高密度粒子
                        jieRings.push({ type: 'ring', x: z.x, y: z.y, radius: 0, maxRadius: z.radius, life: 28, maxLife: 28, color: col, width: 12 });
                        jieRings.push({ type: 'ring', x: z.x, y: z.y, radius: 0, maxRadius: z.radius * 1.6, life: 40, maxLife: 40, color: '#ffffff', width: 5 });
                        for (let k = 0; k < 55; k++) {
                            const a = Math.random() * Math.PI * 2;
                            const spd = 3 + Math.random() * 10;
                            jieParticles.push({ type: 'burst', x: z.x, y: z.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, life: 25 + Math.random() * 25, maxLife: 50, color: Math.random() < 0.4 ? col : (Math.random() < 0.5 ? '#ffeebb' : '#ffffff'), size: 6 + Math.random() * 6 });
                        }
                        triggerShake(true);
                        jieZones.splice(i, 1);
                    }
                } else if (z.type === 'finale') {
                    // 劫灭·终章：全屏（伤害减半190），留Boss外侧安全岛
                    if (z.timer > 0) {
                        ctx.save();
                        const flash = 0.18 + 0.25 * Math.sin(z.timer * 0.25);
                        // 全屏压迫红光（扫光渐变）
                        const g = ctx.createRadialGradient(z.x, z.y, 200, z.x, z.y, 2600);
                        g.addColorStop(0, `rgba(255,0,60,${flash * 1.2})`);
                        g.addColorStop(0.6, `rgba(255,0,60,${flash})`);
                        g.addColorStop(1, `rgba(140,0,40,${flash * 0.7})`);
                        ctx.fillStyle = g;
                        ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
                        const sx = z.x < MAP_WIDTH / 2 ? MAP_WIDTH - 260 : 260;
                        const sy = z.y < MAP_HEIGHT / 2 ? MAP_HEIGHT - 260 : 260;
                        // 安全岛双层
                        ctx.strokeStyle = '#44ff88'; ctx.lineWidth = 10; ctx.shadowColor = '#44ff88'; ctx.shadowBlur = 45;
                        ctx.setLineDash([14, 10]);
                        ctx.beginPath(); ctx.arc(sx, sy, 170, 0, Math.PI * 2); ctx.stroke();
                        ctx.lineWidth = 4; ctx.shadowBlur = 18;
                        ctx.beginPath(); ctx.arc(sx, sy, 140, 0, Math.PI * 2); ctx.stroke();
                        ctx.setLineDash([]);
                        ctx.fillStyle = 'rgba(68,255,136,0.2)';
                        ctx.beginPath(); ctx.arc(sx, sy, 170, 0, Math.PI * 2); ctx.fill();
                        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 36px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                        ctx.shadowColor = '#44ff88'; ctx.shadowBlur = 30;
                        ctx.fillText(_t('安'), sx, sy);
                        ctx.restore();
                    } else {
                        const sx = z.x < MAP_WIDTH / 2 ? MAP_WIDTH - 260 : 260;
                        const sy = z.y < MAP_HEIGHT / 2 ? MAP_HEIGHT - 260 : 260;
                        const inSafe = Math.hypot(hero.x - sx, hero.y - sy) < 170;
                        if (!inSafe) {
                            heroAttackedBy({ attack: z.dmg, color: '#ff0044' }, z.dmg, '#ff0044');
                        }
                        ctx.save();
                        ctx.fillStyle = 'rgba(255,0,60,0.42)';
                        ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
                        ctx.restore();
                        jieRings.push({ type: 'ring', x: z.x, y: z.y, radius: 0, maxRadius: 2000, life: 36, maxLife: 36, color: '#ff0044', width: 24 });
                        jieRings.push({ type: 'ring', x: z.x, y: z.y, radius: 0, maxRadius: 2600, life: 48, maxLife: 48, color: '#ffffff', width: 6 });
                        for (let k = 0; k < 100; k++) {
                            const a = Math.random() * Math.PI * 2;
                            jieParticles.push({ type: 'burst', x: z.x + Math.cos(a) * 300, y: z.y + Math.sin(a) * 300, vx: Math.cos(a) * (4 + Math.random() * 8), vy: Math.sin(a) * (4 + Math.random() * 8), life: 30 + Math.random() * 25, maxLife: 55, color: Math.random() < 0.5 ? '#ff0044' : (Math.random() < 0.5 ? '#ff88ff' : '#ffffff'), size: 8 + Math.random() * 6 });
                        }
                        triggerShake(true);
                        jieZones.splice(i, 1);
                    }
                }
            }

            // ---------- 5. 召唤 jieSummons ----------
            for (let i = jieSummons.length - 1; i >= 0; i--) {
                const sm = jieSummons[i];
                sm.timer--;
                // 白色预警光柱
                if (sm.timer > 0) {
                    ctx.save();
                    const flash = 0.3 + 0.3 * Math.sin(sm.timer * 0.2);
                    ctx.fillStyle = `rgba(255,255,255,${flash * 0.4})`;
                    ctx.beginPath(); ctx.arc(sm.x, sm.y, 60, 0, Math.PI * 2); ctx.fill();
                    ctx.strokeStyle = `rgba(255,255,255,${flash})`;
                    ctx.lineWidth = 4; ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 25;
                    ctx.beginPath(); ctx.arc(sm.x, sm.y, 60, 0, Math.PI * 2); ctx.stroke();
                    ctx.restore();
                } else {
                    // 生成怪物
                    const count = sm.min + Math.floor(Math.random() * (sm.max - sm.min + 1));
                    for (let k = 0; k < count; k++) {
                        const kindType = sm.kind === 'chaos' ? (Math.random() < 0.5 ? 'normal' : 'elite') : sm.kind;
                        const ox = sm.x + (Math.random() - 0.5) * 80;
                        const oy = sm.y + (Math.random() - 0.5) * 80;
                        const en = new Enemy(ox, oy, kindType === 'boss' ? 'boss' : kindType);
                        enemies.push(en);
                        if (kindType === 'boss') bossRefs.push(en);
                    }
                    jieSummons.splice(i, 1);
                }
            }
        }

        // 辅助：归一化角度到 [-PI, PI]
        function normAngle(a) {
            while (a > Math.PI) a -= Math.PI * 2;
            while (a < -Math.PI) a += Math.PI * 2;
            return a;
        }

        // ===== 新增：时空静止处理 =====
        function updateTimeFreeze() {
            if (!timeFrozen) return;
            timeFrozenTimer--;
            timeFreezeFlashTime--;
            if (timeFrozenTimer <= 0) {
                // 静止结束，所有生物位置随机变换
                timeFrozen = false;
                // 收集所有生物（英雄+敌人+冥渊Boss+帝君Boss）
                const allCreatures = [hero];
                for (const e of enemies.slice()) if (e.alive) allCreatures.push(e);
                for (const a of abyssLords) if (a.alive) allCreatures.push(a);
                // 英雄新位置（避开所有敌方，距离>100）
                let tries = 0, nx, ny;
                do {
                    nx = 80 + Math.random() * (MAP_WIDTH - 160);
                    ny = 80 + Math.random() * (MAP_HEIGHT - 160);
                    tries++;
                } while (tries < 30 && allCreatures.some(c => c !== hero && Math.hypot(c.x - nx, c.y - ny) < 100));
                hero.x = nx; hero.y = ny;
                // 敌方位置随机变换
                for (const c of allCreatures) {
                    if (c === hero) continue;
                    let t2 = 0, cx, cy;
                    do {
                        cx = 80 + Math.random() * (MAP_WIDTH - 160);
                        cy = 80 + Math.random() * (MAP_HEIGHT - 160);
                        t2++;
                    } while (t2 < 20 && allCreatures.some(c2 => c2 !== c && Math.hypot(c2.x - cx, c2.y - cy) < 60));
                    c.x = cx; c.y = cy;
                }
                // 时空变换爆发特效
                for (let i = 0; i < 60; i++) {
                    const a = (i / 60) * Math.PI * 2;
                    abyssParticles.push({
                        type: 'burst', x: hero.x, y: hero.y,
                        vx: Math.cos(a)*7, vy: Math.sin(a)*7,
                        life: 40, maxLife: 40, color: i % 2 === 0 ? '#ffffff' : '#88ccff', size: 8
                    });
                }
                abyssRings.push({ x: hero.x, y: hero.y, radius: 0, maxRadius: 250, life: 30, maxLife: 30, color: '#88ccff', width: 8 });
                triggerShake(true);
            }
        }

        // ===== 新增：绘制时空静止全屏黑白压迫感特效 =====
        function drawTimeFreezeOverlay() {
            if (!timeFrozen && timeFreezeFlashTime <= 0) return;
            ctx.save();
            if (timeFrozen) {
                // 第1层：全屏深黑底（高透明度营造黑暗压迫感）
                ctx.globalAlpha = 0.65;
                ctx.fillStyle = '#000000';
                ctx.fillRect(camX, camY, WIDTH, HEIGHT);

                // 第2层：灰度模拟（白色半透明叠加，模拟去色效果）
                ctx.globalAlpha = 0.15;
                ctx.fillStyle = '#888888';
                ctx.fillRect(camX, camY, WIDTH, HEIGHT);

                // 第3层：四角紫色暗影渐变（压迫感）
                const cornerGrad = ctx.createRadialGradient(
                    camX + WIDTH/2, camY + HEIGHT/2, WIDTH * 0.2,
                    camX + WIDTH/2, camY + HEIGHT/2, WIDTH * 0.7
                );
                cornerGrad.addColorStop(0, 'rgba(102,0,204,0)');
                cornerGrad.addColorStop(0.7, 'rgba(102,0,204,0.3)');
                cornerGrad.addColorStop(1, 'rgba(26,0,51,0.85)');
                ctx.globalAlpha = 1;
                ctx.fillStyle = cornerGrad;
                ctx.fillRect(camX, camY, WIDTH, HEIGHT);

                // 第4层：脉冲紫光边框（双层呼吸效果）
                const pulse1 = Math.sin(Date.now() / 120) * 0.3 + 0.6;
                const pulse2 = Math.sin(Date.now() / 80 + 1) * 0.3 + 0.5;
                ctx.strokeStyle = `rgba(136,204,255,${pulse1})`;
                ctx.lineWidth = 10;
                ctx.shadowColor = '#88ccff';
                ctx.shadowBlur = 40;
                ctx.strokeRect(camX + 5, camY + 5, WIDTH - 10, HEIGHT - 10);
                ctx.strokeStyle = `rgba(170,0,255,${pulse2})`;
                ctx.lineWidth = 5;
                ctx.shadowColor = '#aa00ff';
                ctx.shadowBlur = 30;
                ctx.strokeRect(camX + 15, camY + 15, WIDTH - 30, HEIGHT - 30);

                // 第5层：时空裂纹（6条随机紫色裂纹从边缘向中心）
                ctx.shadowBlur = 0;
                ctx.strokeStyle = 'rgba(170,0,255,0.6)';
                ctx.lineWidth = 2;
                const crackSeed = Math.floor(Date.now() / 200);
                for (let i = 0; i < 6; i++) {
                    const angle = (i / 6) * Math.PI * 2 + crackSeed * 0.01;
                    const startX = camX + WIDTH/2 + Math.cos(angle) * WIDTH * 0.5;
                    const startY = camY + HEIGHT/2 + Math.sin(angle) * HEIGHT * 0.5;
                    const endX = camX + WIDTH/2 + Math.cos(angle) * WIDTH * 0.2;
                    const endY = camY + HEIGHT/2 + Math.sin(angle) * HEIGHT * 0.2;
                    ctx.beginPath();
                    ctx.moveTo(startX, startY);
                    // 锯齿裂纹
                    const steps = 5;
                    for (let s = 1; s <= steps; s++) {
                        const t = s / steps;
                        const px = startX + (endX - startX) * t + (Math.random() - 0.5) * 30;
                        const py = startY + (endY - startY) * t + (Math.random() - 0.5) * 30;
                        ctx.lineTo(px, py);
                    }
                    ctx.stroke();
                }

                // 第6层：中央"时空停滞"文字（大号半透明）
                ctx.globalAlpha = 0.25 + Math.sin(Date.now() / 150) * 0.1;
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 64px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.shadowColor = '#88ccff';
                ctx.shadowBlur = 20;
                ctx.fillText(_t('时 空 静 止'), camX + WIDTH/2, camY + HEIGHT/2);
                ctx.font = 'bold 20px Arial';
                ctx.globalAlpha = 0.4;
                ctx.fillText(_t('一切归于寂灭'), camX + WIDTH/2, camY + HEIGHT/2 + 50);
            }
            if (timeFreezeFlashTime > 0) {
                // 闪烁白光（触发瞬间全屏白闪）
                ctx.globalAlpha = timeFreezeFlashTime / 40 * 0.85;
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(camX, camY, WIDTH, HEIGHT);
                // 白闪期间的紫光冲击波
                if (timeFreezeFlashTime > 20) {
                    ctx.globalAlpha = (timeFreezeFlashTime - 20) / 20 * 0.6;
                    ctx.strokeStyle = '#aa00ff';
                    ctx.lineWidth = 15;
                    ctx.shadowColor = '#aa00ff';
                    ctx.shadowBlur = 50;
                    const flashR = (40 - timeFreezeFlashTime) * 30;
                    ctx.beginPath();
                    ctx.arc(camX + WIDTH/2, camY + HEIGHT/2, Math.max(0.1, flashR), 0, Math.PI * 2);
                    ctx.stroke();
                }
            }
            ctx.restore();
        }

