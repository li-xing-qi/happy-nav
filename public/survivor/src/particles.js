// ============================================================
// 文件: src/particles.js
// 描述: drawParticles + 粒子特效
// 行范围: 14981-15689 (原 game.js)
// 注意: 本文件由原版 HTML 抽取，保持原作用域不变
// ============================================================

        function drawParticles() {
            // ===== 流畅度优化：粒子数量上限保护 =====
            // 当粒子超过上限时，优先删除life最短的粒子，防止性能崩溃
            // 上限值根据perfLevel动态调整：perfLevel=0时800, =1时500, =2时300
            const MAX_PARTICLES = perfLevel === 0 ? 800 : (perfLevel === 1 ? 500 : 300);
            if (particles.length > MAX_PARTICLES) {
                particles.sort((a, b) => a.life - b.life);
                particles.splice(0, particles.length - MAX_PARTICLES);
            }
            
            // ===== 流畅度优化：perfLevel>=2时完全禁用shadowBlur =====
            // shadowBlur是Canvas 2D中最耗性能的操作，perfLevel=2时全部置零
            const _origShadowBlur = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'shadowBlur');
            if (perfLevel >= 2) {
                Object.defineProperty(ctx, 'shadowBlur', { get: () => 0, set: () => {}, configurable: true });
            }
            
            for (let i = particles.length - 1; i >= 0; i--) {
                const p = particles[i];
                p.life--;

                if (p.type === 'green') {
                    drawGreenAoe(p);
                } else if (p.type === 'greenSlash') {
                    drawGreenSlash(p);
                } else if (p.type === 'greenSlash2') {
                    drawGreenSlash2(p);
                } else if (p.type === 'red') {
                    const alpha = p.life / p.maxLife;
                    const size = 80 + (1 - alpha) * 100;
                    ctx.save();
                    ctx.globalAlpha = alpha * 0.6;
                    ctx.strokeStyle = '#ff4444';
                    ctx.lineWidth = 6;
                    ctx.shadowColor = '#ff4444';
                    ctx.shadowBlur = 30;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.restore();
                } else if (p.type === 'dash') {
                    const alpha = p.life / p.maxLife;
                    ctx.save();
                    ctx.globalAlpha = alpha * 0.5;
                    ctx.strokeStyle = '#00ffff';
                    ctx.lineWidth = 8;
                    ctx.shadowColor = '#00ffff';
                    ctx.shadowBlur = 25;
                    ctx.beginPath();
                    ctx.moveTo(p.x1, p.y);
                    ctx.lineTo(p.x2, p.y);
                    ctx.stroke();
                    ctx.restore();
                } else if (p.type === 'hit') {
                    p.x += p.vx;
                    p.y += p.vy;
                    p.vx *= 0.92;
                    p.vy *= 0.92;
                    const alpha = Math.max(0, p.life / p.maxLife);
                    ctx.save();
                    ctx.globalAlpha = alpha;
                    ctx.fillStyle = p.color;
                    ctx.shadowColor = p.color;
                    ctx.shadowBlur = 10;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, Math.max(0.1, p.size * alpha), 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                } else if (p.type === 'explosion') {
                    p.x += p.vx;
                    p.y += p.vy;
                    p.vx *= 0.94;
                    p.vy *= 0.94;
                    p.vy += 0.1; // 轻微重力
                    const alpha = Math.max(0, p.life / p.maxLife);
                    ctx.save();
                    ctx.globalAlpha = alpha;
                    ctx.fillStyle = p.color;
                    ctx.shadowColor = p.color;
                    ctx.shadowBlur = 15;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, Math.max(0.1, p.size * alpha), 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                } else if (p.type === 'shockwave') {
                    p.radius = p.maxRadius * (1 - p.life / p.maxLife);
                    const alpha = p.life / p.maxLife;
                    ctx.save();
                    ctx.globalAlpha = alpha * 0.7;
                    ctx.strokeStyle = p.color;
                    ctx.lineWidth = 5 * alpha;
                    ctx.shadowColor = p.color;
                    ctx.shadowBlur = 25;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.restore();
                } else if (p.type === 'flame') {
                    p.x += p.vx;
                    p.y += p.vy;
                    p.vy -= 0.05;
                    const alpha = Math.max(0, p.life / p.maxLife);
                    ctx.save();
                    ctx.globalAlpha = alpha;
                    const colors = ['#ffff00', '#ff8800', '#ff4400'];
                    ctx.fillStyle = colors[Math.floor((1 - alpha) * 3)] || '#ff4400';
                    ctx.shadowColor = '#ff8800';
                    ctx.shadowBlur = 12;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, Math.max(0.1, p.size * alpha), 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                } else if (p.type === 'ringExpand') {
                    // 多层扩散光环（AOE范围指示）
                    const alpha = p.life / p.maxLife;
                    const prog = 1 - alpha;
                    const radius = p.maxRadius * prog;
                    ctx.save();
                    for (let i = 0; i < 3; i++) {
                        const r = radius - i * 18;
                        if (r <= 0) continue;
                        ctx.globalAlpha = alpha * (0.7 - i * 0.2);
                        ctx.strokeStyle = p.color;
                        ctx.lineWidth = 5 - i;
                        ctx.shadowColor = p.color;
                        ctx.shadowBlur = 20;
                        ctx.beginPath();
                        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
                        ctx.stroke();
                    }
                    ctx.globalAlpha = alpha * 0.15;
                    ctx.fillStyle = p.color;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                } else if (p.type === 'doomCross') {
                    // 审判之眼：红色十字准星锁定标记
                    ctx.save();
                    ctx.translate(p.x, p.y);
                    ctx.globalAlpha = 0.9;
                    ctx.strokeStyle = p.color;
                    ctx.lineWidth = 3;
                    ctx.shadowColor = p.color;
                    ctx.shadowBlur = 15;
                    // 旋转的十字准星
                    const rot = Date.now() / 300;
                    ctx.rotate(rot);
                    const r = 22;
                    // 四个角的准星标记
                    for (let i = 0; i < 4; i++) {
                        ctx.rotate(Math.PI / 2);
                        ctx.beginPath();
                        ctx.moveTo(r - 6, -r);
                        ctx.lineTo(r + 6, -r);
                        ctx.lineTo(r + 6, -r + 8);
                        ctx.moveTo(r, -r + 2);
                        ctx.lineTo(r, -r + 10);
                        ctx.stroke();
                    }
                    // 中心圆点
                    ctx.fillStyle = p.color;
                    ctx.beginPath();
                    ctx.arc(0, 0, 4, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                } else if (p.type === 'beam') {
                    // 方向性光束（直线技能路径指示）
                    const alpha = p.life / p.maxLife;
                    const tipX = p.x + p.dx * p.length;
                    const tipY = p.y + p.dy * p.length;
                    ctx.save();
                    ctx.globalAlpha = alpha * 0.6;
                    ctx.strokeStyle = p.color;
                    ctx.lineWidth = 16;
                    ctx.shadowColor = p.color;
                    ctx.shadowBlur = 30;
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y);
                    ctx.lineTo(tipX, tipY);
                    ctx.stroke();
                    ctx.globalAlpha = alpha;
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 5;
                    ctx.shadowBlur = 15;
                    ctx.stroke();
                    // 箭头
                    ctx.fillStyle = p.color;
                    ctx.beginPath();
                    ctx.moveTo(tipX, tipY);
                    ctx.lineTo(tipX - p.dx * 30 + p.dy * 14, tipY - p.dy * 30 - p.dx * 14);
                    ctx.lineTo(tipX - p.dx * 30 - p.dy * 14, tipY - p.dy * 30 + p.dx * 14);
                    ctx.closePath();
                    ctx.fill();
                    ctx.restore();
                } else if (p.type === 'sector') {
                    // 扇形特效（赵云百鸟朝凤）
                    const alpha = p.life / p.maxLife;
                    const prog = 1 - alpha;
                    const radius = p.maxRadius * prog;
                    ctx.save();
                    ctx.translate(p.x, p.y);
                    ctx.rotate(p.angle);
                    ctx.globalAlpha = alpha * 0.4;
                    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(1, radius));
                    grad.addColorStop(0, p.color);
                    grad.addColorStop(1, 'rgba(0,0,0,0)');
                    ctx.fillStyle = grad;
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.arc(0, 0, Math.max(1, radius), -p.spread/2, p.spread/2);
                    ctx.closePath();
                    ctx.fill();
                    ctx.globalAlpha = alpha * 0.85;
                    ctx.strokeStyle = p.color;
                    ctx.lineWidth = 3;
                    ctx.shadowColor = p.color;
                    ctx.shadowBlur = 20;
                    ctx.stroke();
                    ctx.restore();
                } else if (p.type === 'aura') {
                    // 持续光环（关羽青龙之威/过五关 战意状态，跟随英雄）
                    const fadeIn = Math.min(1, (p.maxLife - p.life) / 20);
                    const fadeOut = Math.min(1, p.life / 30);
                    const alpha = fadeIn * fadeOut;
                    const pulse = 0.7 + Math.sin(Date.now() / 120) * 0.3;
                    const ax = p.followHero ? hero.x : p.x;
                    const ay = p.followHero ? hero.y : p.y;
                    ctx.save();
                    ctx.globalAlpha = alpha * 0.25 * pulse;
                    ctx.fillStyle = p.color;
                    ctx.shadowColor = p.color;
                    ctx.shadowBlur = 25;
                    ctx.beginPath();
                    ctx.arc(ax, ay, p.radius, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.globalAlpha = alpha * 0.8 * pulse;
                    ctx.strokeStyle = p.color;
                    ctx.lineWidth = 3;
                    ctx.shadowBlur = 20;
                    ctx.beginPath();
                    ctx.arc(ax, ay, p.radius, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.translate(ax, ay);
                    ctx.rotate(Date.now() / 250);
                    for (let i = 0; i < 6; i++) {
                        const a = (i / 6) * Math.PI * 2;
                        ctx.globalAlpha = alpha * pulse;
                        ctx.fillStyle = p.color;
                        ctx.beginPath();
                        ctx.arc(Math.cos(a) * p.radius, Math.sin(a) * p.radius, 5, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    ctx.restore();
                } else if (p.type === 'moonlight') {
                    // 月光光环（貂蝉月华分身）
                    const alpha = p.life / p.maxLife;
                    const prog = 1 - alpha;
                    const radius = p.maxRadius * prog;
                    ctx.save();
                    ctx.globalAlpha = alpha * 0.3;
                    const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, Math.max(1, radius));
                    grad.addColorStop(0, 'rgba(255,240,200,0.9)');
                    grad.addColorStop(0.5, 'rgba(200,180,255,0.4)');
                    grad.addColorStop(1, 'rgba(150,130,200,0)');
                    ctx.fillStyle = grad;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, Math.max(1, radius), 0, Math.PI * 2);
                    ctx.fill();
                    ctx.globalAlpha = alpha * 0.85;
                    ctx.strokeStyle = '#fff8dc';
                    ctx.lineWidth = 3;
                    ctx.shadowColor = '#fff8dc';
                    ctx.shadowBlur = 25;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, Math.max(1, radius), 0, Math.PI * 2);
                    ctx.stroke();
                    for (let i = 0; i < 8; i++) {
                        const a = (i / 8) * Math.PI * 2 + Date.now() / 500;
                        const r = radius * (0.6 + Math.sin(Date.now()/300 + i) * 0.2);
                        ctx.globalAlpha = alpha;
                        ctx.fillStyle = '#fffacd';
                        ctx.beginPath();
                        ctx.arc(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, 3, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    ctx.restore();
                } else if (p.type === 'arrowRain') {
                    // 多波次箭雨（黄忠箭雨风暴）
                    p.x += p.vx;
                    p.y += p.vy;
                    p.vy += 0.4;
                    const alpha = Math.max(0, p.life / p.maxLife);
                    ctx.save();
                    ctx.globalAlpha = alpha;
                    ctx.strokeStyle = p.color;
                    ctx.lineWidth = 2;
                    ctx.shadowColor = p.color;
                    ctx.shadowBlur = 8;
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y);
                    ctx.lineTo(p.x - p.vx * 2.5, p.y - p.vy * 2.5);
                    ctx.stroke();
                    ctx.fillStyle = p.color;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                } else if (p.type === 'bloodDash') {
                    // 血色拖尾（吕布鬼神突袭）
                    const alpha = p.life / p.maxLife;
                    ctx.save();
                    ctx.globalAlpha = alpha * 0.6;
                    const grad = ctx.createLinearGradient(p.x1, p.y, p.x2, p.y);
                    grad.addColorStop(0, 'rgba(120,0,0,0)');
                    grad.addColorStop(0.5, 'rgba(255,30,30,0.85)');
                    grad.addColorStop(1, 'rgba(180,0,0,0.4)');
                    ctx.strokeStyle = grad;
                    ctx.lineWidth = 22;
                    ctx.shadowColor = '#ff0000';
                    ctx.shadowBlur = 30;
                    ctx.beginPath();
                    ctx.moveTo(p.x1, p.y);
                    ctx.lineTo(p.x2, p.y);
                    ctx.stroke();
                    ctx.globalAlpha = alpha;
                    ctx.strokeStyle = '#ffbbbb';
                    ctx.lineWidth = 4;
                    ctx.shadowBlur = 15;
                    ctx.stroke();
                    ctx.restore();
                } else if (p.type === 'lightningDash') {
                    // 闪电拖尾（马超雷霆突击）
                    const alpha = p.life / p.maxLife;
                    ctx.save();
                    ctx.globalAlpha = alpha;
                    ctx.strokeStyle = '#ddbbff';
                    ctx.lineWidth = 9;
                    ctx.shadowColor = '#aa66ff';
                    ctx.shadowBlur = 30;
                    ctx.beginPath();
                    const segs = 10;
                    ctx.moveTo(p.x1, p.y);
                    for (let i = 1; i <= segs; i++) {
                        const t = i / segs;
                        const x = p.x1 + (p.x2 - p.x1) * t + (Math.random() - 0.5) * 16;
                        const y = p.y + (Math.random() - 0.5) * 16;
                        ctx.lineTo(x, y);
                    }
                    ctx.stroke();
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 3;
                    ctx.shadowBlur = 15;
                    ctx.stroke();
                    for (let i = 0; i < 3; i++) {
                        const t = (i + 1) / 4;
                        const bx = p.x1 + (p.x2 - p.x1) * t;
                        const by = p.y + (Math.random() - 0.5) * 40;
                        ctx.globalAlpha = alpha * 0.6;
                        ctx.strokeStyle = '#cc99ff';
                        ctx.lineWidth = 2;
                        ctx.beginPath();
                        ctx.moveTo(bx, by);
                        ctx.lineTo(bx + (Math.random() - 0.5) * 30, by + (Math.random() - 0.5) * 30);
                        ctx.stroke();
                    }
                    ctx.restore();
                } else if (p.type === 'crosshair') {
                    // 瞄准十字（黄忠百步穿杨）
                    const alpha = p.life / p.maxLife;
                    const prog = 1 - alpha;
                    const size = 28 + prog * 18;
                    ctx.save();
                    ctx.translate(p.x, p.y);
                    ctx.rotate(Date.now() / 300);
                    ctx.globalAlpha = alpha;
                    ctx.strokeStyle = '#ffcc00';
                    ctx.lineWidth = 2;
                    ctx.shadowColor = '#ffcc00';
                    ctx.shadowBlur = 15;
                    ctx.beginPath();
                    ctx.arc(0, 0, size, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(-size - 10, 0); ctx.lineTo(-size/2, 0);
                    ctx.moveTo(size/2, 0); ctx.lineTo(size + 10, 0);
                    ctx.moveTo(0, -size - 10); ctx.lineTo(0, -size/2);
                    ctx.moveTo(0, size/2); ctx.lineTo(0, size + 10);
                    ctx.stroke();
                    ctx.fillStyle = '#ff0000';
                    ctx.beginPath();
                    ctx.arc(0, 0, 4, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                } else if (p.type === 'healParticle') {
                    // 回血上升粒子（赵云七进七出）
                    p.y -= 1.6;
                    p.x += (Math.random() - 0.5) * 0.6;
                    const alpha = Math.max(0, p.life / p.maxLife);
                    ctx.save();
                    ctx.globalAlpha = alpha;
                    ctx.fillStyle = p.color;
                    ctx.shadowColor = p.color;
                    ctx.shadowBlur = 12;
                    ctx.fillRect(p.x - 1, p.y - 4, 2, 8);
                    ctx.fillRect(p.x - 4, p.y - 1, 8, 2);
                    ctx.restore();
                } else if (p.type === 'phoenix') {
                    // 凤凰光环（赵云百鸟朝凤）
                    const alpha = p.life / p.maxLife;
                    const prog = 1 - alpha;
                    const radius = p.maxRadius * (0.5 + prog * 0.5);
                    ctx.save();
                    ctx.translate(p.x, p.y);
                    ctx.rotate(Date.now() / 220);
                    for (let i = 0; i < 8; i++) {
                        const a = (i / 8) * Math.PI * 2;
                        ctx.save();
                        ctx.rotate(a);
                        ctx.globalAlpha = alpha * 0.7;
                        const grad = ctx.createLinearGradient(0, 0, radius, 0);
                        grad.addColorStop(0, p.color);
                        grad.addColorStop(1, 'rgba(255,255,255,0)');
                        ctx.fillStyle = grad;
                        ctx.beginPath();
                        ctx.moveTo(0, -8);
                        ctx.quadraticCurveTo(radius * 0.7, -4, radius, 0);
                        ctx.quadraticCurveTo(radius * 0.7, 4, 0, 8);
                        ctx.closePath();
                        ctx.fill();
                        ctx.restore();
                    }
                    ctx.globalAlpha = alpha * 0.5;
                    ctx.fillStyle = p.color;
                    ctx.shadowColor = p.color;
                    ctx.shadowBlur = 30;
                    ctx.beginPath();
                    ctx.arc(0, 0, radius * 0.4, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                } else if (p.type === 'dust') {
                    // 尘土粒子（马超西凉铁骑）
                    p.x += p.vx;
                    p.y += p.vy;
                    p.vy -= 0.05;
                    p.vx *= 0.95;
                    const alpha = Math.max(0, p.life / p.maxLife);
                    ctx.save();
                    ctx.globalAlpha = alpha * 0.5;
                    ctx.fillStyle = p.color;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.size * (1 + (1 - alpha)), 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                } else if (p.type === 'shockExplosion') {
                    // 冲击波爆发（吕布无双横扫/黄忠百步穿杨 命中爆发）
                    const alpha = p.life / p.maxLife;
                    const prog = 1 - alpha;
                    const radius = p.maxRadius * prog;
                    ctx.save();
                    ctx.globalAlpha = alpha * 0.7;
                    ctx.strokeStyle = p.color;
                    ctx.lineWidth = 6 * alpha;
                    ctx.shadowColor = p.color;
                    ctx.shadowBlur = 25;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, Math.max(1, radius), 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.globalAlpha = alpha * 0.3;
                    ctx.fillStyle = p.color;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, Math.max(1, radius), 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                }

                if (p.life <= 0) {
                    particles.splice(i, 1);
                }
            }
            
            // 恢复shadowBlur属性（如果之前被覆盖）
            if (perfLevel >= 2) {
                delete ctx.shadowBlur;  // 删除实例属性，恢复原型链上的默认行为
            }
        }
        
        function init() {
            const hd = HERO_DEFS[currentHero];
            stats = {
                hp: hd.hp,
                attack: hd.attack,
                skill1: hd.skills[0].dmg,
                skill2: hd.skills[1].dmg,
                skill3: hd.skills[2].dmg
            };
            skillMaxCooldown = [0, hd.skills[0].cd, hd.skills[1].cd, hd.skills[2].cd];
            hero = new Hero(MAP_WIDTH / 2, MAP_HEIGHT / 2);
            // 相机居中于英雄
            camX = Math.max(0, Math.min(MAP_WIDTH - WIDTH, hero.x - WIDTH / 2));
            camY = Math.max(0, Math.min(MAP_HEIGHT - HEIGHT, hero.y - HEIGHT / 2));
            enemies = [];
            particles = [];
            wave = 1;
            totalKills = 0;
            enemyCount = 1;
            enemyBaseHp = 50;
            enemyBaseAttack = 10;
            waveTimer = 0;
            showingBuff = false;
            ringActive = false;
            ringTimer = 0;
            guanYuRangeBoost = 0;
            guanYuDmgBoost = 0;
            guanYuLifesteal = false;
            // 重置英雄专属肉鸽增强数值
            enhZhaoYunHeal = 0;
            enhDiaoChanPoisonDuration = 0;
            enhDiaoChanCloneCount = 0;
            diaoChanSpeedBoostTimer = 0;
            enhGuanYuRangeMult = 0;
            enhGuanYuRangeDuration = 0;
            enhGuanYuLifesteal = 0;
            enhHuangZhongSplash = 0;
            enhMaChaoChainCount = 0;
            // 重置诸葛亮/张飞专属状态
            enhZhugeLiangSpeed = 0;
            enhZhugeLiangAoeMult = 0;
            enhZhugeLiangRadiusMult = 0;
            zhugeLiangSpeedTimer = 0;
            zhugeLiangAoeBoostTimer = 0;
            zhugeLiangRadiusBoostTimer = 0;
            enhZhangFeiRoarDmg = 0;
            enhZhangFeiSpearDmg = 0;
            enhZhangFeiShield = 0;
            zhangFeiInvincibleTimer = 0;
            zhangFeiShieldTimer = 0;
            // 重置周瑜专属状态
            enhZhouyuSkill1Dmg = 0;
            enhZhouyuSkill2Dmg = 0;
            enhZhouyuSkill3Dmg = 0;
            // 重置吕蒙专属状态
            lvmengSpeedBoostTimer = 0;
            enhLvmengSpeed = 0;
            lvmengMissiles = [];
            // 墨子状态重置
            moziLasers = [];
            moziNextBeamWidthMult = 1.0;
            moziNextBeamExtraBounces = 0;
            enhMoziBeamDmg = 0;
            enhMoziWidthMult = 0;
            enhMoziBounces = 0;
            // 韩非状态重置
            heroFreezeTimer = 0;
            heroFogHidden = false;
            enhHanFeiHeal = 0;
            enhHanFeiSpeed = 0;
            hanFeiSpeedBoostTimer = 0;
            enhHanFeiJudgementDmg = 0;
            // 原创角色状态重置：司马懿
            cangqiongSkillCount = 0;
            cangqiongWindMarkTimer = 0;
            cangqiongFlyingTimer = 0;
            cangqiongThunderStormTimer = 0;
            cangqiongThunderStormTickTimer = 0;
            enhCangqiongWhirlDmg = 0;
            enhCangqiongThunderStrikeDmg = 0;
            enhCangqiongThunderDmg = 0;
            // 原创角色状态重置：典韦
            jinAttackStacks = 0;
            jinEmberBurnTimer = 0;
            enhJinThrustDmg = 0;
            enhJinBurnDuration = 0;
            enhJinExplosionDmg = 0;
            enhJinExplosionHeal = 0;
            // 原创角色状态重置：鲁肃
            lanShieldTimer = 0;
            lanShieldAmount = 0;
            lanShieldHealTickTimer = 0;
            lanTsunamiTimer = 0;
            lanTsunamiTickTimer = 0;
            enhLanShieldHp = 0;
            enhLanHealPct = 0;
            // 原创角色状态重置：左慈
            zhiExtraReviveUsed = false;
            zhiFreezeTimer = 0;
            zhiCollapseTimer = 0;
            zhiCollapseTickTimer = 0;
            zhiRiftTimer = 0;
            zhiRiftX = 0;
            zhiRiftY = 0;
            zhiRiftTickTimer = 0;
            enhZhiRiftDmg = 0;
            enhZhiCollapseDmg = 0;
            // 原创角色状态重置：陆逊
            yanBurnAuraTimer = 0;
            yanBurnAuraTickTimer = 0;
            enhYanSlashDmg = 0;
            enhYanAuraDmg = 0;
            enhYanBurnDmg = 0;
            // 原创角色状态重置：甄姬
            shuangBlizzardTimer = 0;
            shuangBlizzardTickTimer = 0;
            enhShuangArrowDmg = 0;
            enhShuangFieldDmg = 0;
            enhShuangBlizzardDmg = 0;
            // 原创角色状态重置：于吉
            jiAtkBoostTimer = 0;
            jiVineLinks = [];
            jiVineHealTimer = 0;
            jiVineHealTickTimer = 0;
            enhJiVineHealPct = 0;
            enhJiFieldDmg = 0;
            // 原创角色状态重置：黄盖
            jingPrisms = [];
            jingPrismFieldActive = false;
            jingRefractionBoostTimer = 0;
            enhJingRefractionCount = 0;
            enhJingRefractionMult = 0;
            enhJingPrismAtkMult = 0;
            enhJingBurstDmg = 0;
            skillCooldown = [0, 0, 0, 0];
            // 重置新系统
            combo = 0;
            comboTimer = 0;
            critRate = 0.2;
            critDmgMult = 1.5;
            // 重置伤害增加/伤害减免（仅通过掉落小球获得，每局归零）
            heroDamageBonus = 0;
            heroDamageReduction = 0;
            slowMoTimer = 0;
            bossDeathDelay = 0;
            pickups = [];
            bossAlive = false;
            bossRefs = [];
            // 重置冥渊/时空状态
            abyssLords = [];
            bladeMasters = [];
            madEyes = [];
            youBosses = [];
            abyssParticles = [];
            abyssRings = [];
            bladeParticles = [];
            bladeRings = [];
            eyeParticles = [];
            eyeRings = [];
            youParticles = [];
            youRings = [];
            youLasers = [];
            timeFrozen = false;
            timeFrozenTimer = 0;
            timeFreezeFlashTime = 0;
            emperorDeathEffects = [];
            abyssDeathEffects = [];
            screenShatterTime = 0;
            trailParticles = [];
            // 重置英雄专属效果
            poisonZones = [];
            heroClones = [];
            cavalryCharges = [];
            lightningChains = [];
            lvmengMissiles = [];
            // 墨子状态重置
            moziLasers = [];
            moziNextBeamWidthMult = 1.0;
            moziNextBeamExtraBounces = 0;
            lvmengSpeedBoostTimer = 0;
            // 韩非状态重置
            heroFreezeTimer = 0;
            heroFogHidden = false;
            hanFeiSpeedBoostTimer = 0;
            // 神器/模式状态重置
            gameGold = 0;
            artifactPhantomCloakActive = false;
            artifactSkillCastCount = 0;
            artifactShadowCloneTimer = 0;
            artifactDoomMarkTarget = null;
            artifactDoomMarkTimer = 0;
            // 天气重置
            weatherSpeedMult = 1.0;
            weatherCritBoost = 0;
            weatherCritOverflow = 0;
            weatherCritPenalty = 0;
            weatherDmgBonus = 0;
            weatherDmgReduct = 0;
            weatherHpReduceAmount = 0;
            weatherEnemySpeedMult = 1.0;
            weatherEnemyAtkBoost = 0;
            weatherHpDrain = false;
            weatherFogActive = false;
            weatherDrainFrame = 0;
            lightningFlash = 0;
            // 英雄不灭之心标记重置
            if (hero) hero._undyingUsed = false;
            emperorParticles = [];
            emperorRings = [];
            guanyuShieldEffect = 0;
            zhaoyunShieldEffect = 0;
            document.getElementById('comboDisplay').style.display = 'none';
            document.getElementById('bossBar').style.display = 'none';
            document.getElementById('slowmoOverlay').style.display = 'none';
            document.getElementById('pickupToast').style.display = 'none';

            updateStatsDisplay();
            spawnWave();
        }
        
