// ============================================================
// 文件: src/gameloop.js
// 描述: gameLoop + init + UI 更新
// 行范围: 15690-16957 (原 game.js)
// 注意: 本文件由原版 HTML 抽取，保持原作用域不变
// ============================================================

        // ===== 中/英文翻译词条（中文 → 英文；英文模式下 _t() 返回英文，否则返回中文原文） =====
        Object.assign(I18N_DICT, {
            '设置功能开发中...': 'Settings in development...',
            '剩余复活次数: ': 'Revives remaining: ',
            '无复活次数可用': 'No revives available',
            '下一步：选择难度 →': 'Next: Choose Difficulty →',
            '下一步：选择模式 →': 'Next: Choose Mode →',
            '🚀 开始游戏': '🚀 Start Game',
            '敌人血量低，速度慢': 'Enemies low HP, slow speed',
            '敌人血量适中，速度正常': 'Enemies normal HP and speed',
            '敌人血量较高，速度较快': 'Enemies higher HP, faster speed',
            '敌人血量高，速度很快': 'Enemies high HP, very fast',
            '敌人速度可能比你快，生命值极高': 'Enemies may outrun you with extreme HP',
            '已开启': 'On',
            '未开启': 'Off',
            '🌙 诅咒之夜专属天气': '🌙 Curse Night Weather',
            '雷电/诅咒/疯狂每波切换': 'Lightning/Curse/Madness switches each wave',
            '👻 疯狂之夜专属天气': '👻 Madness Night Weather',
            '天罚雷电/疯狂弥漫/猩红疯狂每波切换': 'Divine Lightning / Madness Haze / Crimson Madness each wave',
            '🌤️ 天气': '🌤️ Weather',
            '🏪 商店': '🏪 Shop',
            '🏺 神器开局': '🏺 Artifact Start',
            '🎮 经典模式': '🎮 Classic Mode',
            '逐步推进波次，每5波Boss，每波后可选强化奖励': 'Progress through waves, a Boss every 5 waves, choose a buff after each wave',
            '⚡ Boss Rush': '⚡ Boss Rush',
            '连续Boss战，开打前与每个Boss后获得5波奖励': 'Consecutive boss battles, get 5 waves of rewards before and after each boss',
            '← 请选择一位英雄': '← Select a hero',
            '查看技能详情': 'View skill details',
            '秒': 's',
            '⚡ 被动 · ': '⚡ Passive · ',
            '🎲 随机选择中...': '🎲 Rolling...',
            '🎲 随机选择': '🎲 Random Select',
            '时空倒流！左慈特有复活触发！': 'Time Rewind! Zuo Ci unique revive triggered!',
            '请选择图片文件': 'Please select an image file',
            '图片大小不能超过5MB': 'Image size cannot exceed 5MB',
            '读取图片失败': 'Failed to read image'
        });

        // ===== 战斗暂停切换（空格键） =====
        function togglePause() {
            if (!gameRunning) return;
            gamePaused = !gamePaused;
            const overlay = document.getElementById('pauseOverlay');
            if (overlay) {
                overlay.classList.toggle('active', gamePaused);
            }
            // 音乐：暂停时暂停，恢复时从当前位置继续（不重新开始）
            if (gamePaused) {
                pauseMusic();
            } else {
                resumeMusic();
            }
        }

        // 暂停菜单：继续游戏
        function pauseContinue() {
            gamePaused = false;
            const overlay = document.getElementById('pauseOverlay');
            if (overlay) overlay.classList.remove('active');
            resumeMusic();
        }

        // 暂停菜单：设置（打开音乐设置窗口，含可拖动的音量滑条）
        function pauseSettings() {
            openMusicScreen();
        }

        // 暂停菜单：重新开始（保留当前英雄/难度选择，跳到步骤3快速重玩）
        function pauseRestart() {
            gamePaused = false;
            gameRunning = false;
            const overlay = document.getElementById('pauseOverlay');
            if (overlay) overlay.classList.remove('active');
            // 清理当前战场状态
            enemies = [];
            particles = [];
            heroClones = [];
            poisonZones = [];
            cavalryCharges = [];
            lightningChains = [];
            lvmengMissiles = [];
            moziLasers = [];
            pickups = [];
            bossRefs = [];
            bossDeathDelay = 0;
            bossDeathFxTriggered = false;
            bossUpgradeTriggered = false;
            slowMoTimer = 0;
            heroFreezeTimer = 0;
            jieHeroFreezeTimer = 0;
            jieParticles = [];
            jieRings = [];
            jieLasers = [];
            jieZones = [];
            jieSummons = [];
            heroFogHidden = false;
            timeFrozen = false;
            timeFrozenTimer = 0;
            restartToStart();
            setMusicMode('nonBattle');
        }

        // 暂停菜单：返回主菜单（完全重置，回到英雄选择界面）
        function pauseBackToMenu() {
            gamePaused = false;
            gameRunning = false;
            const overlay = document.getElementById('pauseOverlay');
            if (overlay) overlay.classList.remove('active');
            // 清理所有战场状态
            enemies = [];
            particles = [];
            heroClones = [];
            poisonZones = [];
            cavalryCharges = [];
            lightningChains = [];
            lvmengMissiles = [];
            moziLasers = [];
            pickups = [];
            bossRefs = [];
            bossDeathDelay = 0;
            bossDeathFxTriggered = false;
            bossUpgradeTriggered = false;
            slowMoTimer = 0;
            heroFreezeTimer = 0;
            jieHeroFreezeTimer = 0;
            jieParticles = [];
            jieRings = [];
            jieLasers = [];
            jieZones = [];
            jieSummons = [];
            heroFogHidden = false;
            timeFrozen = false;
            timeFrozenTimer = 0;
            skillText = null;
            showStartScreen();
            setMusicMode('nonBattle');
        }

        function gameLoop() {
            if (!gameRunning) return;
            if (!hero || !hero.alive) return; // 英雄已死亡则停止逻辑更新（防止访问已死状态）

            // ===== 流畅度优化：帧率监控 + 自适应性能降级 =====
            const now = performance.now();
            const frameDelta = now - lastFrameTime;
            lastFrameTime = now;
            frameTimes.push(frameDelta);
            if (frameTimes.length > 60) frameTimes.shift();
            // 每60帧检查一次平均帧率
            if (frameTimes.length >= 60) {
                const avgDelta = frameTimes.reduce((s, v) => s + v, 0) / frameTimes.length;
                const avgFps = 1000 / avgDelta;
                if (avgFps < 45 && perfLevel < 2) {
                    perfLevel++;  // 自动降级
                    frameTimes = [];  // 重置统计
                } else if (avgFps > 55 && perfLevel > 0) {
                    perfLevel--;  // 自动升级
                    frameTimes = [];
                }
            }

            if (showingBuff) {
                // 肉鸽界面打开中：让 bossDeathDelay 倒数（王Boss分裂后小王全死需要 2.5s）
                // 但不调 checkWave，避免每帧 wave++（肉鸽界面只在玩家点 buff 后才会消失）
                if (bossDeathDelay > 0) bossDeathDelay--;
                requestAnimationFrame(gameLoop);
                return;
            }

            // ===== 空格键暂停：冻结画面与逻辑 =====
            if (gamePaused) {
                requestAnimationFrame(gameLoop);
                return;
            }

            if (waveTimer > 0) waveTimer--;

            for (let i = 1; i < 4; i++) {
                skillCooldown[i] = Math.max(0, skillCooldown[i] - 1);
            }

            // 慢动作：每3帧才更新一次
            const skipFrame = slowMoTimer > 0;
            if (skipFrame) {
                slowMoTimer--;
                if (slowMoTimer <= 0) {
                    document.getElementById('slowmoOverlay').style.display = 'none';
                }
            }

            // 相机跟随：双人联机时取两人的中点，单人时就是主角
            const _coopMate = window.__coopHero2;
            const _camPX = (hero.x + ((_coopMate && _coopMate.alive) ? _coopMate.x : hero.x)) / 2;
            const _camPY = (hero.y + ((_coopMate && _coopMate.alive) ? _coopMate.y : hero.y)) / 2;
            camX = Math.max(0, Math.min(MAP_WIDTH - WIDTH, _camPX - WIDTH / 2));
            camY = Math.max(0, Math.min(MAP_HEIGHT - HEIGHT, _camPY - HEIGHT / 2));

            // ===== 世界空间绘制（应用相机偏移） =====
            // 修复：setTransform 必须包含 dpr 缩放，否则高清屏(dpr>1)时内容只画在左上角1/dpr²区域
            // 之前 setTransform(1,0,0,1,0,0) 重置了 bootstrap.js 中设置的 ctx.scale(dpr,dpr)，
            // 导致 canvas 物理尺寸 2560×1540(dpr=2) 时，绘制内容只到物理像素(1280,770)即左上角1/4。
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.save();
            ctx.translate(-camX, -camY);
            drawMap();
            // ===== 天气特效绘制 =====
            drawWeatherEffects();

            if (!skipFrame || Math.floor(slowMoTimer / 3) % 2 === 0) {
                hero.update();
                // 天气HP流失：雷电每秒流失2%最大HP（每60帧1次，诅咒之夜专属雷电天气同样生效）
                if ((enableWeather || curseNightMode || madnessNightMode) && weatherHpDrain && hero.alive) {
                    weatherDrainFrame++;
                    if (weatherDrainFrame >= 60) {
                        weatherDrainFrame = 0;
                        const drainAmount = Math.floor(hero.maxHp * 0.02);
                        hero.hp = Math.max(1, hero.hp - drainAmount);
                        showDamage(hero.x, hero.y - 10, drainAmount, '#ffaa00');
                    }
                }
                // ===== 疯狂之夜：所有Boss每75帧损失0.5%最大HP（不分Boss种类、不分出现原因） =====
                if (madnessNightMode) {
                    madnessBossHpDrainFrame++;
                    if (madnessBossHpDrainFrame >= 75) {
                        madnessBossHpDrainFrame = 0;
                        // 遍历所有Boss引用数组（bossRefs含王/帝君，其余4个为独立Boss类实例数组）
                        const allBossArrays = [bossRefs, abyssLords, bladeMasters, madEyes, youBosses, jieBosses];
                        for (const arr of allBossArrays) {
                            for (const b of arr) {
                                // 防御性：跳过已死亡/不存在/血量已空的Boss
                                if (!b || !b.alive || b.hp <= 0) continue;
                                const bossDrain = Math.max(1, Math.floor(b.maxHp * 0.005)); // 0.5%最大HP，最低1点
                                b.hp = Math.max(0, b.hp - bossDrain);
                                // 显示橙色伤害飘字（Boss头顶）
                                if (typeof showDamage === 'function') {
                                    showDamage(b.x, b.y - 30, bossDrain, '#ff8800');
                                }
                                // 血量归零后设置死亡标志，让checkWave()能检测到并结束波次
                                if (b.hp <= 0) {
                                    b.alive = false;
                                }
                            }
                        }
                    }
                }
                // 玩家移动拖尾
                if (keys['KeyW'] || keys['KeyA'] || keys['KeyS'] || keys['KeyD'] ||
                    keys['ArrowUp'] || keys['ArrowDown'] || keys['ArrowLeft'] || keys['ArrowRight']) {
                    if (Math.random() < 0.4) spawnTrail();
                    // ===== 幻影斗篷神器：移动时15%概率留下残影分身 =====
                    if (artifactPhantomCloakActive && Math.random() < 0.15) {
                        heroClones.push({
                            x: hero.x, y: hero.y,
                            hp: 1, maxHp: 1,
                            life: 120, maxLife: 120, // 2秒=120帧
                            color: 'rgba(200,200,255,0.4)'
                        });
                    }
                }
                // 连杀倒计时
                updateCombo();
                // 英雄专属效果更新
                if (heroClones.length > 0) updateHeroClones();
                // ===== 神器效果处理 =====
                if (artifactShadowCloneTimer > 0) {
                    artifactShadowCloneTimer--;
                    if (artifactShadowCloneTimer <= 0) {
                        // 生成分身（已移除嘲讽效果）
                        const cloneX = hero.x + (Math.random() - 0.5) * 40;
                        const cloneY = hero.y + (Math.random() - 0.5) * 40;
                        heroClones.push({ x: cloneX, y: cloneY, hp: hero.maxHp, maxHp: hero.maxHp, life: 240, maxLife: 240, color: hero_facing > 0 ? heroDef_color : heroDef_color2 || heroDef_color, isShadowClone: true });
                        // 召唤特效：大范围光环+粒子爆炸
                        for (let i = 0; i < 30; i++) {
                            const a = (i / 30) * Math.PI * 2;
                            const sp = 4 + Math.random() * 4;
                            particles.push({
                                type: 'hit', x: cloneX, y: cloneY,
                                vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                                life: 35, maxLife: 35, color: '#aa88ff', size: 7
                            });
                        }
                        particles.push({ type: 'ringExpand', x: cloneX, y: cloneY, color: '#aa88ff', maxRadius: 120, life: 30, maxLife: 30 });
                        particles.push({ type: 'ringExpand', x: cloneX, y: cloneY, color: '#ddbbff', maxRadius: 80, life: 25, maxLife: 25 });
                        // 重置计时器（10秒=600帧）
                        artifactShadowCloneTimer = 600;
                    }
                }
                if (artifactDoomMarkTimer > 0) {
                    artifactDoomMarkTimer--;
                    if (artifactDoomMarkTimer <= 0) {
                        // 标记最近敌人
                        let nearest = null, minD = Infinity;
                        for (const e of enemies) {
                            if (!e.alive) continue;
                            const d = Math.hypot(e.x - hero.x, e.y - hero.y);
                            if (d < minD) { minD = d; nearest = e; }
                        }
                        artifactDoomMarkTarget = nearest;
                        // 标记特效：红色锁定光环+粒子爆发
                        if (nearest) {
                            for (let i = 0; i < 20; i++) {
                                const a = (i / 20) * Math.PI * 2;
                                particles.push({
                                    type: 'hit', x: nearest.x, y: nearest.y,
                                    vx: Math.cos(a) * 5, vy: Math.sin(a) * 5,
                                    life: 30, maxLife: 30, color: '#ff0033', size: 6
                                });
                            }
                            particles.push({ type: 'ringExpand', x: nearest.x, y: nearest.y, color: '#ff0033', maxRadius: 80, life: 25, maxLife: 25 });
                        }
                        artifactDoomMarkTimer = 900; // 15秒重置
                    }
                }
                // 审判之眼：被标记敌人持续显示红色十字准星
                if (artifactDoomMarkTarget && artifactDoomMarkTarget.alive) {
                    particles.push({
                        type: 'doomCross', x: artifactDoomMarkTarget.x, y: artifactDoomMarkTarget.y,
                        life: 2, maxLife: 2, color: '#ff0033'
                    });
                }
                // 关羽武圣之怒倒计时
                if (hero.rageTime && hero.rageTime > 0) hero.rageTime--;
            }
            hero.draw();
            // 关羽二技能护盾光环（金绿色旋转六边形护盾）
            if (guanyuShieldEffect > 0) {
                const alpha = guanyuShieldEffect / 180;
                ctx.save();
                ctx.translate(hero.x, hero.y);
                ctx.globalAlpha = alpha * 0.7;
                ctx.strokeStyle = '#88ff88';
                ctx.lineWidth = 4;
                ctx.shadowColor = '#44ff44';
                ctx.shadowBlur = 30;
                ctx.rotate(Date.now() / 200);
                ctx.beginPath();
                for (let i = 0; i < 6; i++) {
                    const a = (i / 6) * Math.PI * 2;
                    const r = 45;
                    if (i === 0) ctx.moveTo(Math.cos(a)*r, Math.sin(a)*r);
                    else ctx.lineTo(Math.cos(a)*r, Math.sin(a)*r);
                }
                ctx.closePath();
                ctx.stroke();
                ctx.strokeStyle = '#ffcc44';
                ctx.lineWidth = 2;
                ctx.shadowBlur = 15;
                ctx.beginPath();
                for (let i = 0; i < 6; i++) {
                    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
                    const r = 55;
                    if (i === 0) ctx.moveTo(Math.cos(a)*r, Math.sin(a)*r);
                    else ctx.lineTo(Math.cos(a)*r, Math.sin(a)*r);
                }
                ctx.closePath();
                ctx.stroke();
                ctx.restore();
            }
            // 赵云二技能护盾光环（冰蓝旋转双层光环）
            if (zhaoyunShieldEffect > 0) {
                const alpha = zhaoyunShieldEffect / 90;
                ctx.save();
                ctx.translate(hero.x, hero.y);
                ctx.globalAlpha = alpha * 0.6;
                ctx.strokeStyle = '#88ddff';
                ctx.lineWidth = 3;
                ctx.shadowColor = '#44aaff';
                ctx.shadowBlur = 25;
                ctx.rotate(Date.now() / 150);
                ctx.beginPath();
                ctx.arc(0, 0, 40, 0, Math.PI * 2);
                ctx.stroke();
                ctx.rotate(-Date.now() / 200);
                ctx.beginPath();
                ctx.arc(0, 0, 55, 0, Math.PI * 2);
                ctx.stroke();
                ctx.strokeStyle = '#aaddff';
                ctx.lineWidth = 2;
                ctx.shadowBlur = 15;
                ctx.rotate(Date.now() / 300);
                ctx.beginPath();
                ctx.arc(0, 0, 65, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            }
            drawTrailParticles();

            for (let e of enemies.slice()) {
                if (waveTimer <= 0 && !skipFrame) e.update();
                e.draw();
            }

            // ===== 冥渊Boss死亡处理（update/draw已由enemies循环统一处理） =====
            for (let i = abyssLords.length - 1; i >= 0; i--) {
                const a = abyssLords[i];
                if (!a.alive) {
                    const otherBossAlive = bossRefs.some(b => b !== a && b.alive) ||
                                           abyssLords.some(b => b !== a && b.alive) ||
                                           bladeMasters.some(b => b.alive) ||
                                           madEyes.some(b => b.alive) ||
                                           youBosses.some(b => b.alive);
                    if (!otherBossAlive && !bossDeathFxTriggered) {
                        bossDeathFxTriggered = true;
                        spawnAbyssDeathEffect(a.x, a.y);
                        bossDeathDelay = 150;
                    }
                    abyssLords.splice(i, 1);
                    continue;
                }
            }
            // ===== 剑圣Boss死亡处理 =====
            for (let i = bladeMasters.length - 1; i >= 0; i--) {
                const b = bladeMasters[i];
                if (!b.alive) {
                    const otherBossAlive = bossRefs.some(bb => bb !== b && bb.alive) ||
                                           abyssLords.some(bb => bb.alive) ||
                                           bladeMasters.some(bb => bb !== b && bb.alive) ||
                                           madEyes.some(bb => bb.alive) ||
                                           youBosses.some(bb => bb.alive);
                    if (!otherBossAlive && !bossDeathFxTriggered) {
                        bossDeathFxTriggered = true;
                        bossDeathDelay = 150;
                    }
                    bladeMasters.splice(i, 1);
                    continue;
                }
            }
            // ===== 妄瞳Boss死亡处理 =====
            for (let i = madEyes.length - 1; i >= 0; i--) {
                const m = madEyes[i];
                if (!m.alive) {
                    const otherBossAlive = bossRefs.some(bb => bb !== m && bb.alive) ||
                                           abyssLords.some(bb => bb.alive) ||
                                           bladeMasters.some(bb => bb.alive) ||
                                           madEyes.some(bb => bb !== m && bb.alive) ||
                                           youBosses.some(bb => bb.alive);
                    if (!otherBossAlive && !bossDeathFxTriggered) {
                        bossDeathFxTriggered = true;
                        bossDeathDelay = 150;
                    }
                    madEyes.splice(i, 1);
                    continue;
                }
            }
            // ===== 幽Boss死亡处理 =====
            for (let i = youBosses.length - 1; i >= 0; i--) {
                const y = youBosses[i];
                if (!y.alive) {
                    const otherBossAlive = bossRefs.some(bb => bb !== y && bb.alive) ||
                                           abyssLords.some(bb => bb.alive) ||
                                           bladeMasters.some(bb => bb.alive) ||
                                           madEyes.some(bb => bb.alive) ||
                                           youBosses.some(bb => bb !== y && bb.alive);
                    if (!otherBossAlive && !bossDeathFxTriggered) {
                        bossDeathFxTriggered = true;
                        for (let j = 0; j < 50; j++) {
                            const a = Math.random() * Math.PI * 2;
                            youParticles.push({
                                type: 'burst', x: y.x, y: y.y,
                                vx: Math.cos(a)*(3+Math.random()*8), vy: Math.sin(a)*(3+Math.random()*8),
                                life: 40+Math.random()*30, maxLife: 70,
                                color: ['#ff2200','#ff6600','#ffaa00','#ffff00'][Math.floor(Math.random()*4)],
                                size: 5+Math.random()*8
                            });
                        }
                        youRings.push({ x: y.x, y: y.y, radius: 0, maxRadius: 250, life: 35, maxLife: 35, color: '#ff4400', width: 8 });
                        bossDeathDelay = 150;
                        triggerShake(true);
                    }
                    youBosses.splice(i, 1);
                    continue;
                }
            }
            // ===== 劫Boss死亡处理（掉落10-20个数值小球 + 死亡特效 + 数组清理） =====
            for (let i = jieBosses.length - 1; i >= 0; i--) {
                const j = jieBosses[i];
                if (!j.alive) {
                    // 劫的掉落由 dropRewards 统一处理（10-20个数值小球）
                    if (!j._rewardsDropped && typeof j.dropRewards === 'function') {
                        j._rewardsDropped = true;   // 防重复掉落
                        j.dropRewards();
                    }
                    const otherBossAlive = bossRefs.some(bb => bb !== j && bb.alive) ||
                                           abyssLords.some(bb => bb.alive) ||
                                           bladeMasters.some(bb => bb.alive) ||
                                           madEyes.some(bb => bb.alive) ||
                                           youBosses.some(bb => bb.alive) ||
                                           jieBosses.some(bb => bb !== j && bb.alive);
                    if (!otherBossAlive && !bossDeathFxTriggered) {
                        bossDeathFxTriggered = true;
                        bossDeathDelay = 180; // 劫死亡：3秒后再弹肉鸽/商店（先完整展示结束奖励特效）
                        triggerShake(true);
                    }
                    jieBosses.splice(i, 1);
                    continue;
                }
            }

            // ===== Boss蓄力预警绘制 =====
            for (const e of enemies.slice()) {
                if (e.isEmperor && e.drawEmperorEffects) e.drawEmperorEffects();
            }
            for (const a of abyssLords) {
                if (a.drawChargeWarning) a.drawChargeWarning();
            }
            for (const b of bladeMasters) {
                if (b.drawChargeWarning) b.drawChargeWarning();
            }
            for (const m of madEyes) {
                if (m.drawChargeWarning) m.drawChargeWarning();
            }
            for (const y of youBosses) {
                if (y.drawChargeWarning) y.drawChargeWarning();
            }

            if (!skipFrame) {
                updateRing();
                if (guanYuRangeBoost > 0) guanYuRangeBoost--;
                if (guanYuDmgBoost > 0) guanYuDmgBoost--;
                if (guanYuDmgBoost <= 0) guanYuLifesteal = false;
                if (guanyuShieldEffect > 0) guanyuShieldEffect--;
                if (zhaoyunShieldEffect > 0) zhaoyunShieldEffect--;
            }
            drawRing();
            drawParticles();
            drawPickups();
            updateEmperorEffects();
            updateAbyssEffects();
            updateBladeEffects();
            updateEyeEffects();
            updateYouEffects();
            updateJieEffects();
            // 英雄专属效果绘制
            if (heroClones.length > 0) drawHeroClones();
            if (poisonZones.length > 0) drawPoisonZones();
            if (cavalryCharges.length > 0) drawCavalryCharges();
            if (lightningChains.length > 0) drawLightningChains();
            if (lvmengMissiles.length > 0) drawLvmengMissiles();
            if (jingPrisms.length > 0) drawJingPrisms();  // 黄盖棱镜实体绘制
            if (jiVineLinks.length > 0) drawJiVineLinks(); // 于吉寄生藤蔓持续链接
            if (zhiRiftTimer > 0) drawZhiRift(); // 左慈时空裂隙伤害区域
            // ===== 墨子激光：更新+绘制 =====
            if (moziLasers.length > 0) {
                updateMoziLasers();
                drawMoziLasers();
            }

            // 结束世界空间绘制
            ctx.restore();

            // ===== 迷雾天气：屏幕空间雾化覆盖（视野-50%，诅咒之夜同理） =====
            if ((enableWeather || curseNightMode || madnessNightMode) && weatherFogActive) {
                const fogAlpha = 0.35;
                const fogRadius = 250; // 可见半径（50%视野）
                const cx = WIDTH / 2, cy = HEIGHT / 2;
                // 径向渐变：中心透明，外围浓雾
                const grad = ctx.createRadialGradient(cx, cy, fogRadius * 0.7, cx, cy, Math.max(WIDTH, HEIGHT));
                grad.addColorStop(0, 'rgba(150,155,160,0)');
                grad.addColorStop(0.4, 'rgba(150,155,160,0.1)');
                grad.addColorStop(0.7, 'rgba(140,145,150,0.35)');
                grad.addColorStop(1, 'rgba(130,135,140,0.55)');
                ctx.fillStyle = grad;
                ctx.fillRect(0, 0, WIDTH, HEIGHT);
                // 雾粒子飘动
                const tf = Date.now() / 1000;
                ctx.fillStyle = 'rgba(180,185,190,0.15)';
                for (let i = 0; i < 20; i++) {
                    const fx = ((i * 173 + tf * 30) % WIDTH);
                    const fy = ((i * 97 + tf * 15) % HEIGHT);
                    ctx.beginPath();
                    ctx.arc(fx, fy, 40 + Math.random() * 60, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            // 屏幕空间滤镜（碎裂/时空静止）
            drawScreenShatter();
            drawTimeFreezeOverlay();

            // 时空静止计时器
            if (!skipFrame) updateTimeFreeze();

            // ===== 韩非雾隐：敌方静止倒计时（仅冻结敌方，与冥渊timeFrozen独立） =====
            if (!skipFrame && heroFreezeTimer > 0) {
                heroFreezeTimer--;
                if (heroFreezeTimer <= 0) {
                    // 雾隐自然结束：解除隐身形态
                    heroFogHidden = false;
                    // 结束特效：灰色烟雾消散
                    for (let i = 0; i < 30; i++) {
                        const a = (i / 30) * Math.PI * 2;
                        const sp = 2 + Math.random() * 4;
                        particles.push({
                            type: 'hit', x: hero.x, y: hero.y,
                            vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                            life: 30, maxLife: 30,
                            color: i % 2 === 0 ? '#666666' : '#999999', size: 6
                        });
                    }
                    particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#aaaaaa', maxRadius: 200, life: 25, maxLife: 25 });
                }
            }

            // ===== 屏幕空间UI层 =====
            if (skillText) {
                skillText.life--;
                const alpha = skillText.life / 60;
                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.fillStyle = skillText.color;
                ctx.font = 'bold 22px Arial';
                ctx.textAlign = 'center';
                ctx.shadowColor = skillText.color;
                ctx.shadowBlur = 25;
                ctx.fillText(_t(skillText.text), WIDTH / 2, HEIGHT / 2 + 50);
                ctx.restore();
                if (skillText.life <= 0) {
                    skillText = null;
                }
            }

            // 小地图（右上角半透明，显示视野范围+敌我位置）
            drawMinimap();

            checkWave();

            // 清理尸体——Boss死亡动画期间不清理，等动画播完再清理
            if (bossDeathDelay <= 0) {
                enemies = enemies.filter(e => e.alive && e.hp > 0);
            }

            if (hero.hp <= 0) {
                // ===== 联机：战友还活着 → 主角先倒地待救，由战友靠近 3 秒拉起来 =====
                try {
                    if (window.__duo && typeof window.__duo.tryHeroDown === 'function' && window.__duo.tryHeroDown()) {
                        return;   // 不结算、不弹 gameOver；由 duo.js 的独立循环接管救援
                    }
                } catch (e) {}
                hero.alive = false;
                // ===== 不灭之心神器：首次阵亡满血复活 =====
                if (selectedArtifactKey === 'undyingHeart' && !hero._undyingUsed) {
                    hero._undyingUsed = true;
                    hero.alive = true;
                    hero.hp = hero.maxHp;
                    hero.invincibleTime = 60;
                    updateStatsDisplay();
                    requestAnimationFrame(gameLoop);
                    return;
                }
                gameRunning = false;
                heroReviveMaxHp = hero.maxHp;
                // 防御性：所有 DOM 操作先检查元素是否存在
                const finalWaveEl = document.getElementById('finalWave');
                if (finalWaveEl) finalWaveEl.textContent = wave;
                const finalKillsEl = document.getElementById('finalKills');
                if (finalKillsEl) finalKillsEl.textContent = totalKills;
                // 显示剩余复活次数
                const reviveInfo = document.getElementById('reviveInfo');
                const reviveBtn = document.getElementById('reviveBtn');
                if (reviveInfo) {
                    if (revivesLeft > 0) {
                        reviveInfo.textContent = `${_t('剩余复活次数: ')}${revivesLeft}`;
                        if (reviveBtn) reviveBtn.style.display = 'block';
                    } else {
                        reviveInfo.textContent = _t('无复活次数可用');
                        if (reviveBtn) reviveBtn.style.display = 'none';
                    }
                }
                const gameOverEl2 = document.getElementById('gameOver');
                if (gameOverEl2) gameOverEl2.style.display = 'block';
                // 显示复活/重新开始选项：音乐暂停（与空格暂停效果一致）
                pauseMusic();
                return;
            }

            updateStatsDisplay();
            updateBossBar();

            requestAnimationFrame(gameLoop);
        }
        
        // ===== 开始界面逻辑（全屏：左英雄 + 右难度） =====
        let selectedHeroKey = null;

        // 显示开始界面（替代旧的 showHeroSelect）
        // ===== 折叠/展开通用 =====
        function toggleSection(id) {
            const sec = document.getElementById(id);
            sec.classList.toggle('collapsed');
        }

        // ============================================================
        // ===== 步骤式 UI 流程管理 =====
        // 步骤1：选择英雄 → 步骤2：选择难度 → 步骤3：选择模式
        // 步骤3确认后 → 直接开始
        // ============================================================
        let currentStep = 1;

        // 跳转到指定步骤（1-3），同步更新面板显示、指示器、按钮
        function goToStep(n) {
            if (n < 1 || n > 3) return;
            // 记录方向：n > currentStep 为正向(next)，否则为反向(prev)
            const direction = (n > currentStep) ? 'next' : 'prev';
            currentStep = n;

            // ===== 切换步骤面板显示 =====
            for (let i = 1; i <= 3; i++) {
                const p = document.getElementById('step' + i + 'Panel');
                if (p) p.classList.toggle('active', i === n);
            }

            // ===== 更新步骤指示器 =====
            // 步骤4指示器始终隐藏（双角色模式已删除）
            const dot4 = document.getElementById('stepDot4');
            const line3 = document.getElementById('stepLine3');
            if (dot4) dot4.style.display = 'none';
            if (line3) line3.style.display = 'none';

            for (let i = 1; i <= 4; i++) {
                const dot = document.getElementById('stepDot' + i);
                if (!dot) continue;
                dot.classList.remove('active', 'done');
                if (i < n) dot.classList.add('done');
                else if (i === n) dot.classList.add('active');
            }
            for (let i = 1; i <= 3; i++) {
                const line = document.getElementById('stepLine' + i);
                if (line) line.classList.toggle('active', i < n);
            }

            // ===== 按需渲染当前步骤的内容 =====
            if (n === 1) {
                renderHeroGrid();
                renderHeroDetail();
            } else if (n === 2) {
                renderDiffRow();
                renderCurseNightSidebar();
                renderMadnessNightSidebar();
            } else if (n === 3) {
                renderSelectBody();
                renderJoinBody();
            }

            // ===== GSAP步骤切换动画 =====
            if (typeof animateStepTransition === 'function') {
                animateStepTransition(direction);
            }
            // 切换步骤后重新绑定卡片3D悬停（heroGrid只在步骤1有）
            if (n === 1 && typeof setupHeroCard3DTilt === 'function') {
                setTimeout(setupHeroCard3DTilt, 100);
            }

            updateNavButtons();
        }

        // 更新底部按钮文案、显隐、启用状态
        function updateNavButtons() {
            const prev = document.getElementById('prevStepBtn');
            const next = document.getElementById('startGameBtn');
            if (!prev || !next) return;

            prev.style.display = (currentStep === 1) ? 'none' : 'inline-block';

            // ===== 按钮文案 =====
            if (currentStep === 1) next.textContent = _t('下一步：选择难度 →');
            else if (currentStep === 2) next.textContent = _t('下一步：选择模式 →');
            else if (currentStep === 3) {
                next.textContent = _t('🚀 开始游戏');
            }

            // ===== 启用/禁用判断 =====
            let canProceed = false;
            if (currentStep === 1) canProceed = !!selectedHeroKey;
            else if (currentStep === 2) canProceed = !!selectedDifficultyKey;
            else if (currentStep === 3) canProceed = !!selectedMode;
            next.disabled = !canProceed;
            next.style.opacity = canProceed ? '1' : '0.5';
        }

        // 上一步
        function prevStep() {
            if (currentStep === 1) return;
            goToStep(currentStep - 1);
        }

        // 下一步 / 开始游戏（由按钮触发）
        function nextStepOrStart() {
            if (currentStep === 1) goToStep(2);
            else if (currentStep === 2) goToStep(3);
            else if (currentStep === 3) {
                startGame();
            }
        }

        function showStartScreen() {
            document.getElementById('startScreen').style.display = 'flex';
            document.getElementById('gameOver').style.display = 'none';
            document.getElementById('buffScreen').style.display = 'none';
            document.getElementById('shopScreen').style.display = 'none';
            document.getElementById('artifactScreen').style.display = 'none';
            document.getElementById('weatherIndicator').style.display = 'none';
            // 重置所有选择状态
            selectedHeroKey = null;
            selectedMode = 'classic';
            enableWeather = false;
            enableShop = false;
            enableArtifact = false;
            selectedArtifactKey = null;
            selectedDifficultyKey = 'hard';
            currentDifficulty = DIFFICULTY_CONFIG.hard;
            curseNightMode = false;
            curseNightWeatherTimer = 0;
            madnessNightMode = false;
            madnessNightWeatherTimer = 0;
            madnessNightWeatherIndex = 0;
            // 诅咒之夜/疯狂之夜侧边栏UI同步回未选中
            renderCurseNightSidebar();
            renderMadnessNightSidebar();
            // 跳转到步骤1（会自动渲染英雄列表并更新按钮）
            goToStep(1);
        }

        // ============================================================
        // ===== 皮肤系统逻辑 =====
        // ============================================================

        // 打开皮肤窗口
        function openSkinScreen() {
            document.getElementById('skinScreen').style.display = 'flex';
            // 默认选中第一个英雄
            if (!skinSelectedHero) skinSelectedHero = Object.keys(HERO_DEFS)[0];
            renderSkinHeroSelector();
            renderSkinGrid();
        }

        // 关闭皮肤窗口
        function closeSkinScreen() {
            document.getElementById('skinScreen').style.display = 'none';
            // 刷新英雄卡片颜色（如果选中了英雄）
            renderHeroGrid();
        }

        // 渲染英雄选择条
        function renderSkinHeroSelector() {
            const container = document.getElementById('skinHeroSelector');
            container.innerHTML = '';
            for (const key of Object.keys(HERO_DEFS)) {
                const hd = HERO_DEFS[key];
                const chip = document.createElement('div');
                chip.className = 'skin-hero-chip' + (key === skinSelectedHero ? ' selected' : '');
                chip.textContent = _t(hd.name);
                chip.onclick = () => {
                    skinSelectedHero = key;
                    renderSkinHeroSelector();
                    renderSkinGrid();
                };
                container.appendChild(chip);
            }
        }

        // 渲染皮肤网格
        function renderSkinGrid() {
            const grid = document.getElementById('skinGrid');
            const preview = document.getElementById('skinPreview');
            grid.innerHTML = '';
            if (!skinSelectedHero || !SKIN_DEFS[skinSelectedHero]) return;

            const hd = HERO_DEFS[skinSelectedHero];
            const skins = SKIN_DEFS[skinSelectedHero];
            const currentSkin = getHeroSkin(skinSelectedHero);
            const currentColor = currentSkin
                ? (currentSkin.type === 'legend' && currentSkin.colors ? currentSkin.colors[0] : (currentSkin.color || hd.color))
                : hd.color;

            // 预览：显示英雄头像（使用当前选中皮肤颜色）
            preview.innerHTML = `
                <canvas class="skin-preview-avatar" data-hero="${skinSelectedHero}" width="80" height="80" style="display:block;border-radius:50%;box-shadow:0 0 20px ${currentColor}88;"></canvas>
                <div class="skin-preview-name">${_t(hd.name)} · ${_t(hd.title)}</div>
            `;
            // 绘制英雄头像预览
            const previewCanvas = preview.querySelector('canvas.skin-preview-avatar');
            if (previewCanvas) {
                const pctx = previewCanvas.getContext('2d');
                drawHeroAvatar(pctx, 40, 40, skinSelectedHero, 70, Date.now());
            }

            // 皮肤卡片
            for (const skin of skins) {
                const card = document.createElement('div');
                const isSelected = (skin.id === 'default' && !heroSkinOverrides[skinSelectedHero]) ||
                                   (heroSkinOverrides[skinSelectedHero] === skin.id);
                const colorStyle = skin.type === 'legend' && skin.colors && skin.colors.length >= 2
                    ? `background:linear-gradient(135deg, ${skin.colors.join(', ')});box-shadow:0 0 12px ${skin.colors[0]}88, 0 0 4px ${skin.colors[skin.colors.length - 1]};`
                    : `background:${skin.color};box-shadow:0 0 10px ${skin.color}88;`;
                card.className = 'skin-card' + (isSelected ? ' selected' : '') + (skin.type === 'legend' ? ' legend' : '');
                card.innerHTML = `
                    <div class="skin-card-color" style="${colorStyle}"></div>
                    <div class="skin-card-name">${_t(skin.name)}</div>
                    <div class="skin-card-tag">${_t(skin.tag)}</div>
                `;
                card.onclick = () => selectSkin(skinSelectedHero, skin);
                grid.appendChild(card);
            }
        }

        // 选择皮肤（实时刷新英雄选择界面，让玩家立即看到效果）
        function selectSkin(heroKey, skin) {
            if (skin.id === 'default') {
                delete heroSkinOverrides[heroKey];  // 使用原色
            } else {
                heroSkinOverrides[heroKey] = skin.id;
            }
            // 持久化到 localStorage
            try {
                localStorage.setItem('heroSkinOverrides', JSON.stringify(heroSkinOverrides));
            } catch (e) {
                console.warn('保存皮肤选择失败:', e);
            }
            renderSkinGrid();
            // 实时刷新主界面的英雄卡片，让皮肤变化立即可见
            renderHeroGrid();
        }

        // 渲染难度选择列表（重设计：差异化图标+难度等级条+左侧色条）
        function renderDiffRow() {
            const row = document.getElementById('diffRow');
            if (!row) return;
            row.innerHTML = '';
            // 5档难度配置：图标/描述/等级(1-5星)/特色标签
            const order = ['easy', 'normal', 'hard', 'nightmare', 'end'];
            const diffIcons = { easy: '🌱', normal: '⚔️', hard: '🔥', nightmare: '💀', end: '👑' };
            const diffDescs = {
                easy: _t('敌人血量低，速度慢'),
                normal: _t('敌人血量适中，速度正常'),
                hard: _t('敌人血量较高，速度较快'),
                nightmare: _t('敌人血量高，速度很快'),
                end: _t('敌人速度可能比你快，生命值极高')
            };
            const diffLevels = { easy: 1, normal: 2, hard: 3, nightmare: 4, end: 5 };
            for (const key of order) {
                const d = DIFFICULTY_CONFIG[key];
                const chip = document.createElement('div');
                // 诅咒之夜/疯狂之夜作为独立难度选中时，普通难度不显示选中态并置灰（仍可点击切回普通难度）
                const isSelected = !curseNightMode && !madnessNightMode && key === selectedDifficultyKey;
                chip.className = 'diff-chip' + (isSelected ? ' selected' : '') + ((curseNightMode || madnessNightMode) ? ' disabled' : '');
                chip.setAttribute('data-diff', key);
                // 难度等级条：5星，根据难度等级填充
                let starsHtml = '';
                const lvl = diffLevels[key];
                for (let i = 1; i <= 5; i++) {
                    starsHtml += `<span class="star${i <= lvl ? ' on' : ''}">★</span>`;
                }
                chip.innerHTML = `
                    <div class="diff-name">
                        <span class="diff-emoji">${diffIcons[key] || '⚔️'}</span>
                        <span>${d.name}</span>
                        <span class="diff-level">${starsHtml}</span>
                    </div>
                    <div class="diff-desc">${diffDescs[key]}</div>
                `;
                chip.onclick = () => selectDifficulty(key);
                row.appendChild(chip);
            }
        }

        function selectDifficulty(key) {
            // 诅咒之夜/疯狂之夜作为独立难度选中/取消
            curseNightMode = (key === 'curse');
            madnessNightMode = (key === 'madness');
            selectedDifficultyKey = key;
            currentDifficulty = DIFFICULTY_CONFIG[key];
            renderDiffRow();
            renderCurseNightSidebar();
            renderMadnessNightSidebar();
            renderJoinBody();
            updateNavButtons();
        }

        function toggleCurseNightMode() {
            curseNightMode = !curseNightMode;
            // 互斥：开启诅咒之夜时关闭疯狂之夜
            if (curseNightMode && madnessNightMode) madnessNightMode = false;
            renderCurseNightSidebar();
            renderMadnessNightSidebar();
            if (curseNightMode) {
                // 开启诅咒之夜：作为独立难度选中，使用诅咒之夜专属配置
                selectedDifficultyKey = 'curse';
                currentDifficulty = DIFFICULTY_CONFIG.curse;
            } else {
                // 关闭诅咒之夜：恢复默认困难难度
                selectedDifficultyKey = 'hard';
                currentDifficulty = DIFFICULTY_CONFIG.hard;
            }
            renderDiffRow();
            renderJoinBody();
            updateNavButtons();
        }

        function renderCurseNightSidebar() {
            const sidebar = document.getElementById('curseNightSidebar');
            const badge = document.getElementById('curseNightBadge');
            if (sidebar) sidebar.classList.toggle('active', curseNightMode);
            if (badge) badge.textContent = curseNightMode ? _t('已开启') : _t('未开启');
        }

        // ===== 疯狂之夜侧边栏切换（独立难度，与诅咒之夜互斥） =====
        function toggleMadnessNightMode() {
            madnessNightMode = !madnessNightMode;
            // 互斥：开启疯狂之夜时关闭诅咒之夜
            if (madnessNightMode && curseNightMode) curseNightMode = false;
            renderMadnessNightSidebar();
            renderCurseNightSidebar();
            if (madnessNightMode) {
                // 开启疯狂之夜：作为独立难度选中，使用疯狂之夜专属配置
                selectedDifficultyKey = 'madness';
                currentDifficulty = DIFFICULTY_CONFIG.madness;
            } else {
                // 关闭疯狂之夜：恢复默认困难难度
                selectedDifficultyKey = 'hard';
                currentDifficulty = DIFFICULTY_CONFIG.hard;
            }
            renderDiffRow();
            renderJoinBody();
            updateNavButtons();
        }

        function renderMadnessNightSidebar() {
            const sidebar = document.getElementById('madnessNightSidebar');
            const badge = document.getElementById('madnessNightBadge');
            if (sidebar) sidebar.classList.toggle('active', madnessNightMode);
            if (badge) badge.textContent = madnessNightMode ? _t('已开启') : _t('未开启');
        }

        function selectGameMode(key) {
            selectedMode = key;
            renderSelectBody();
            // 步骤4指示器始终隐藏（双角色模式已删除）
            const dot4 = document.getElementById('stepDot4');
            const line3 = document.getElementById('stepLine3');
            if (dot4) dot4.style.display = 'none';
            if (line3) line3.style.display = 'none';
            updateNavButtons();
        }

        // ===== 加入制模块渲染（只显示模块名称） =====
        function renderJoinBody() {
            const body = document.getElementById('joinBody');
            if (!body) return;
            let html = '';
            // 诅咒之夜/疯狂之夜为独立难度，强制使用专属天气，天气开关隐藏
            if (curseNightMode) {
                html += `<div class="toggle-row-compact disabled" style="opacity:0.6;cursor:default;">
                    <div class="toggle-switch-sm active" style="cursor:default;"></div>
                    <div><div class="toggle-label-sm">${_t('🌙 诅咒之夜专属天气')}</div><div class="toggle-desc-sm">${_t('雷电/诅咒/疯狂每波切换')}</div></div>
                </div>`;
            } else if (madnessNightMode) {
                html += `<div class="toggle-row-compact disabled" style="opacity:0.6;cursor:default;">
                    <div class="toggle-switch-sm active" style="cursor:default;"></div>
                    <div><div class="toggle-label-sm">${_t('👻 疯狂之夜专属天气')}</div><div class="toggle-desc-sm">${_t('天罚雷电/疯狂弥漫/猩红疯狂每波切换')}</div></div>
                </div>`;
            } else {
                html += makeToggleRow('weather', _t('🌤️ 天气'), '', enableWeather, toggleJoinWeather);
            }
            html += makeToggleRow('shop', _t('🏪 商店'), '', enableShop, toggleJoinShop);
            html += makeToggleRow('artifact', _t('🏺 神器开局'), '', enableArtifact, toggleJoinArtifact);
            body.innerHTML = html;
        }

        function makeToggleRow(id, label, desc, active, handler) {
            return `<div class="toggle-row-compact" onclick="${handler.name}()" id="row_${id}">
                <div class="toggle-switch-sm${active ? ' active' : ''}" id="sw_${id}"></div>
                <div><div class="toggle-label-sm">${label}</div>${desc ? `<div class="toggle-desc-sm">${desc}</div>` : ''}</div>
            </div>`;
        }

        function toggleJoinWeather() {
            enableWeather = !enableWeather;
            updateToggleUI('weather', enableWeather);
        }
        function toggleJoinShop() {
            enableShop = !enableShop;
            updateToggleUI('shop', enableShop);
        }
        function toggleJoinArtifact() {
            enableArtifact = !enableArtifact;
            updateToggleUI('artifact', enableArtifact);
        }
        function updateToggleUI(id, active) {
            const sw = document.getElementById('sw_' + id);
            if (sw) sw.classList.toggle('active', active);
        }

        // ===== 选择制模块渲染（重设计：大卡片+图标+模式说明） =====
        function renderSelectBody() {
            const body = document.getElementById('selectBody');
            if (!body) return;
            const modes = [
                { key: 'classic', name: _t('🎮 经典模式'), icon: '🎮', desc: _t('逐步推进波次，每5波Boss，每波后可选强化奖励') },
                { key: 'bossRush', name: _t('⚡ Boss Rush'), icon: '⚡', desc: _t('连续Boss战，开打前与每个Boss后获得5波奖励') }
            ];
            let html = '';
            for (const m of modes) {
                const sel = selectedMode === m.key ? ' selected' : '';
                html += `<div class="mode-card-sm${sel}" data-icon="${m.icon}" onclick="selectGameMode('${m.key}')">
                    <span class="mode-name-sm">${m.name}</span>
                    <span class="mode-desc-sm">${m.desc}</span>
                </div>`;
            }
            body.innerHTML = html;
        }

        function renderHeroGrid() {
            const grid = document.getElementById('heroGrid');
            if (!grid) return;
            grid.innerHTML = '';
            // 步骤1：显示所有英雄供选择第一英雄
            const keysToShow = Object.keys(HERO_DEFS);
            for (const key of keysToShow) {
                const h = HERO_DEFS[key];
                const sc = getHeroColor(key);  // 皮肤系统：卡片样式也使用皮肤颜色
                const card = document.createElement('div');
                const isSelected = (key === selectedHeroKey);
                card.className = 'hero-card' + (isSelected ? ' selected' : '');
                card.style.borderColor = isSelected ? sc : '';
                const canvasSize = 140;
                const iconHtml = `<div class="hero-icon" style="background:radial-gradient(circle at 50% 45%, rgba(255,255,255,0.18), rgba(0,0,0,0.55) 70%);box-shadow:0 0 12px ${sc}aa, inset 0 0 10px rgba(0,0,0,0.4);"><canvas class="hero-portrait" data-hero="${key}" width="${canvasSize}" height="${canvasSize}"></canvas></div>`;
                card.innerHTML = `
                    ${iconHtml}
                    <div class="hero-name" style="color:${sc};">${_t(h.name)}</div>
                    <div class="hero-title">${_t(h.title)}</div>
                `;
                card.onclick = () => selectHero(key);
                grid.appendChild(card);
            }
            grid.querySelectorAll('canvas.hero-portrait').forEach(c => {
                const c2 = c.getContext('2d');
                const hw = parseInt(c.width);
                drawHeroAvatar(c2, hw/2, hw/2, c.dataset.hero, hw-5, Date.now());
            });
        }

        // 渲染英雄详情面板（步骤1）
        function renderHeroDetail() {
            const detail = document.getElementById('heroDetail');
            if (!detail) return;
            if (!selectedHeroKey) {
                detail.innerHTML = '<div class="empty-tip">' + _t('← 请选择一位英雄') + '<br>' + _t('查看技能详情') + '</div>';
                return;
            }
            const h = HERO_DEFS[selectedHeroKey];
            const sc = getHeroColor(selectedHeroKey);
            let html = `<div class="detail-hero-name" style="color:${sc};">${_t(h.name)}</div>`;
            html += `<div class="detail-hero-title">${_t(h.title)}</div>`;
            h.skills.forEach((s, i) => {
                html += `<div class="skill-card">
                    <div class="sk-name">[${i+1}] ${_t(s.name)}<span class="sk-cd">CD ${Math.ceil(s.cd/60)}${_t('秒')}</span></div>
                    <div class="sk-desc">${_t(s.desc)}</div>
                </div>`;
            });
            // 被动技能（若有）：在主动技能下方展示
            if (h.passive) {
                html += `<div class="skill-card passive-card">
                    <div class="sk-name">${_t('⚡ 被动 · ')}${_t(h.passive.name)}</div>
                    <div class="sk-desc">${_t(h.passive.desc)}</div>
                </div>`;
            }
            detail.innerHTML = html;
        }

        // 选择第一英雄（步骤1）
        function selectHero(key) {
            selectedHeroKey = key;
            renderHeroGrid();
            renderHeroDetail();
            updateNavButtons();
        }

        // ===== 随机选择英雄：选择框快速移动直到选出结果 =====
        let randomRolling = false;  // 防止重复触发
        function randomHero() {
            if (randomRolling) return;
            randomRolling = true;
            const btn = document.getElementById('randomHeroBtn');
            if (!btn) { randomRolling = false; return; }
            btn.disabled = true;
            btn.classList.add('rolling');
            btn.textContent = _t('🎲 随机选择中...');
            const keys = Object.keys(HERO_DEFS);
            const cards = document.querySelectorAll('#heroGrid .hero-card');
            // 先清除所有选中状态
            cards.forEach(c => c.classList.remove('selected', 'rolling-highlight'));
            // 滚动总时长约1.5秒，前期快速（80ms），后期减速（最后几次300ms）
            let step = 0;
            const totalSteps = 16;  // 总滚动次数
            const intervals = [];   // 每步间隔（递增：前快后慢）
            for (let i = 0; i < totalSteps; i++) {
                // 间隔从60ms线性增加到350ms
                intervals.push(60 + (350 - 60) * (i / (totalSteps - 1)));
            }
            let lastIdx = -1;
            function rollStep() {
                if (step >= totalSteps) {
                    // ===== 滚动结束：随机选出最终英雄 =====
                    const finalKey = keys[Math.floor(Math.random() * keys.length)];
                    // 移除滚动高亮
                    cards.forEach(c => c.classList.remove('rolling-highlight'));
                    // 选中最终英雄
                    selectHero(finalKey);
                    // 恢复按钮
                    randomRolling = false;
                    btn.disabled = false;
                    btn.classList.remove('rolling');
                    btn.textContent = _t('🎲 随机选择');
                    return;
                }
                // 随机高亮一个英雄（不重复上一个，视觉跳动更明显）
                let idx;
                do { idx = Math.floor(Math.random() * keys.length); } while (idx === lastIdx && keys.length > 1);
                lastIdx = idx;
                // 清除上一个高亮
                cards.forEach(c => c.classList.remove('rolling-highlight'));
                // 高亮当前
                if (cards[idx]) cards[idx].classList.add('rolling-highlight');
                step++;
                setTimeout(rollStep, intervals[step - 1]);
            }
            rollStep();
        }

        // 开始游戏（替代旧的 confirmHero）：从开始界面直接进入战斗
        function startGame() {
            if (!selectedHeroKey) return;
            currentHero = selectedHeroKey;
            document.getElementById('startScreen').style.display = 'none';
            gameRunning = true;
            showingBuff = false;
            gamePaused = false;
            const pauseOverlay = document.getElementById('pauseOverlay');
            if (pauseOverlay) pauseOverlay.classList.remove('active');

            // ===== 如果开启神器开局，先弹出神器选择 =====
            if (enableArtifact) {
                showArtifactScreen();
                return; // 选完神器后由 selectArtifactAndStart 继续
            }
            proceedStartGame();
        }

        // 实际执行游戏启动（在选完神器后调用，或直接跳过神器）
        function proceedStartGame() {
            // ===== 复活次数 = 1（基础）+ 难度额外加成（困难基准0，噩梦+1，终焉+3） =====
            revivesLeft = 1 + currentDifficulty.extraRevives;
            // ===== 左慈被动：额外+1复活机会（首次复活时触发文字提示） =====
            if (selectedHeroKey === 'zhi') {
                revivesLeft += 1;
            }

            init();

            // 正式进入战斗：切换到战斗音乐
            setMusicMode('battle');

            // 应用神器效果（必须在init之后，避免heroDamageReduction等状态被init重置为0覆盖）
            if (selectedArtifactKey && ARTIFACT_DEFS[selectedArtifactKey]) {
                ARTIFACT_DEFS[selectedArtifactKey].apply();
            }

            if (selectedMode === 'bossRush') {
                bossRushStart();
                // BossRush规则：开打前 = 1次5波奖励（金币+商店机会）；打完每个Boss = 1次5波奖励（金币+商店机会）
                if (enableShop) {
                    // 商店模式：开打前先开商店让玩家用初始金币购买
                    // showingBuff=true 让 gameLoop 跳过游戏逻辑更新（商店界面期间不更新英雄/敌人）
                    showingBuff = true;
                    openShop();
                    gameLoop(); // 启动 gameLoop（showingBuff=true 时只绘制不更新逻辑）
                    return; // 商店关闭后由 closeShop → bossRushNextBoss 推进到第一个Boss（wave=0→5）
                } else {
                    // 无商店模式：直接推进到第一个Boss（wave=0→5）
                    bossRushNextBoss();
                }
            }
            // 经典模式：init()已设置好初始状态，直接开始

            // 设置天气
            if (curseNightMode) {
                // 诅咒之夜：强制启用专属诅咒天气，每波自动切换
                enableWeather = true;
                curseNightWeatherTimer = 0;
                switchCursedWeather();
            } else if (madnessNightMode) {
                // 疯狂之夜：强制启用专属疯狂天气，每波自动切换（UI上仍显示为不可操作的专属天气）
                enableWeather = true;
                madnessNightWeatherTimer = 0;
                switchMadnessWeather();
            } else if (enableWeather) {
                switchWeather();
            } else {
                document.getElementById('weatherIndicator').style.display = 'none';
            }

            gameLoop();
        }

        // 死亡后重新开始：返回开始界面（保留英雄和难度选择，跳到步骤3快速重玩）
        // 修复：根据 project_memory 规则 "startBtn restart must skip hero selection screen"
        // 用户可点击"上一步"回到步骤1/2重新选择英雄/难度
        function restartToStart() {
            // 标记为重启场景，让 showStartScreen 保留 selectedHeroKey 和 selectedDifficultyKey
            const hadHero = !!selectedHeroKey;
            const hadDiff = !!selectedDifficultyKey;
            const prevHero = selectedHeroKey;
            const prevDiff = selectedDifficultyKey;
            const prevMode = selectedMode;
            const prevCurse = curseNightMode;
            const prevMadness = madnessNightMode;
            const prevDiffObj = currentDifficulty;
            gamePaused = false;
            const pauseOverlay = document.getElementById('pauseOverlay');
            if (pauseOverlay) pauseOverlay.classList.remove('active');
            showStartScreen();
            // 回到开始界面：恢复非战斗音乐（死亡时音乐被 pauseMusic 暂停，需切回）
            setMusicMode('nonBattle');
            // 恢复之前的选择（showStartScreen 会重置，这里补回来）
            if (hadHero) selectedHeroKey = prevHero;
            if (hadDiff) selectedDifficultyKey = prevDiff;
            if (prevMode) selectedMode = prevMode;
            // 恢复诅咒之夜独立难度状态
            if (prevCurse && prevDiff === 'curse') {
                curseNightMode = true;
                currentDifficulty = prevDiffObj;
            }
            // 恢复疯狂之夜独立难度状态
            if (prevMadness && prevDiff === 'madness') {
                madnessNightMode = true;
                currentDifficulty = prevDiffObj;
            }
            // 跳到步骤3（模式选择），用户可快速点"开始游戏"重玩
            // 如果之前没有英雄选择(理论上不会发生),则跳到步骤1
            if (hadHero && hadDiff) {
                goToStep(3);
            } else if (hadHero) {
                goToStep(2);
            } else {
                goToStep(1);
            }
        }

        // ===== 复活机制（新版）：不跳波，只回满血+1秒无敌 =====
        // 用户要求：复活不是立刻击杀所有敌人进入下一波，
        //           只是当前角色生命值回满然后短暂赋予1秒无敌，不能用复活跳波
        function revive() {
            if (revivesLeft <= 0) return;  // 无复活次数可用
            if (!hero) return;              // 防御性：hero未初始化时不执行
            const gameOverEl = document.getElementById('gameOver');
            if (gameOverEl) gameOverEl.style.display = 'none';
            revivesLeft--;                 // 消耗1次复活
            hero.alive = true;
            hero.hp = hero.maxHp;          // 回满血（用当前最大血量）
            hero.invincibleTime = 60;      // 1秒无敌（60帧）
            hero.stunTime = 0;
            hero.flashTime = 0;

            // ===== 左慈被动：首次复活时触发文字提示（特有额外复活机会） =====
            if (currentHero === 'zhi' && !zhiExtraReviveUsed) {
                zhiExtraReviveUsed = true;
                skillText = { text: _t('时空倒流！左慈特有复活触发！'), color: '#9370DB', life: 100 };
                // 紫罗兰多层光环+30粒子（与原时空回溯特效一致）
                particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#9370DB', maxRadius: 200, life: 35, maxLife: 35 });
                particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#BA55D3', maxRadius: 150, life: 30, maxLife: 30 });
                particles.push({ type: 'ringExpand', x: hero.x, y: hero.y, color: '#ffffff', maxRadius: 100, life: 25, maxLife: 25 });
                for (let i = 0; i < 30; i++) {
                    const a = (i / 30) * Math.PI * 2;
                    particles.push({
                        type: 'hit', x: hero.x, y: hero.y,
                        vx: Math.cos(a) * 5, vy: Math.sin(a) * 5,
                        life: 30, maxLife: 30, color: '#BA55D3', size: 6
                    });
                }
                triggerShake(true);
            }

            gameRunning = true;
            gamePaused = false;
            const pauseOverlay2 = document.getElementById('pauseOverlay');
            if (pauseOverlay2) pauseOverlay2.classList.remove('active');
            // ===== 不清空任何敌人，不跳波 =====
            // 只重置残留的视觉/控制状态，防止上一局效果延续
            slowMoTimer = 0;
            bossDeathDelay = 0;
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
            timeFrozen = false;
            timeFrozenTimer = 0;
            timeFreezeFlashTime = 0;
            // 左慈状态重置
            zhiRiftTimer = 0;
            zhiRiftX = 0;
            zhiRiftY = 0;
            zhiRiftTickTimer = 0;
            zhiFreezeTimer = 0;
            zhiCollapseTimer = 0;
            zhiCollapseTickTimer = 0;
            pickups = [];
            updateStatsDisplay();
            // 复活后继续战斗：音乐从暂停处恢复（死亡时已 pauseMusic，musicMode仍为battle，
            // 用 setMusicMode('battle') 会因守卫提前返回而无法恢复，故用 resumeMusic）
            resumeMusic();
            gameLoop();
        }
        
        document.addEventListener('keydown', e => {
            keys[e.code] = true;

            // 空格键：战斗中暂停/继续
            if (e.code === 'Space') {
                e.preventDefault();
                togglePause();
                return;
            }

            if (e.code === 'Numpad0' || e.code === 'Digit0') useSkill(0);
            if (e.code === 'Numpad1' || e.code === 'Digit1') useSkill(1);
            if (e.code === 'Numpad2' || e.code === 'Digit2') useSkill(2);
            if (e.code === 'Numpad3' || e.code === 'Digit3') useSkill(3);
        });
        document.addEventListener('keyup', e => keys[e.code] = false);
        document.getElementById('startGameBtn').addEventListener('click', nextStepOrStart);
        document.getElementById('prevStepBtn').addEventListener('click', prevStep);
        document.getElementById('randomHeroBtn').addEventListener('click', randomHero);
        document.getElementById('restartBtn').addEventListener('click', restartToStart);
        document.getElementById('reviveBtn').addEventListener('click', revive);
        // 暂停菜单按钮
        document.getElementById('pauseContinueBtn').addEventListener('click', pauseContinue);
        document.getElementById('pauseSettingsBtn').addEventListener('click', pauseSettings);
        document.getElementById('pauseRestartBtn').addEventListener('click', pauseRestart);
        document.getElementById('pauseBackBtn').addEventListener('click', pauseBackToMenu);
        // 商店关闭按钮
        document.getElementById('shopCloseBtn').addEventListener('click', closeShop);
        // 自定义背景按钮
        document.getElementById('bgSelectBtn').addEventListener('click', () => {
            document.getElementById('bgFileInput').click();
        });
        document.getElementById('bgFileInput').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (!file.type.startsWith('image/')) {
                showBgToast(_t('请选择图片文件'), '#ff4444');
                return;
            }
            if (file.size > 5 * 1024 * 1024) {
                showBgToast(_t('图片大小不能超过5MB'), '#ff4444');
                return;
            }
            const reader = new FileReader();
            reader.onload = (ev) => { setCustomBg(ev.target.result); };
            reader.onerror = () => { showBgToast(_t('读取图片失败'), '#ff4444'); };
            reader.readAsDataURL(file);
            e.target.value = '';
        });
        // 移除 bgResetBtn 绑定：该按钮已替换为「🌐 语言」按钮（语言逻辑在 i18n.js）

        // ===== 皮肤系统事件监听 =====
        document.getElementById('skinBtn').addEventListener('click', openSkinScreen);
        document.getElementById('skinCloseBtn').addEventListener('click', closeSkinScreen);
        document.getElementById('skinConfirmBtn').addEventListener('click', closeSkinScreen);

        // ============================================================
        // ===== GSAP 动画增强（标题入场+卡片3D悬停+按钮波纹） =====
        // ============================================================
        // GSAP安全检查：如果CDN加载失败，所有动画函数优雅降级为无操作
        const __gsap = (typeof gsap !== 'undefined') ? gsap : null;
        // 标记是否已播放过开始界面入场动画（避免每次showStartScreen都重播）
        let __startIntroPlayed = false;

        // ===== 1. 开始界面入场动画（标题+步骤指示器+底部按钮） =====
        function playStartScreenIntro() {
            if (!__gsap) return;
            const titleWrap = document.querySelector('.start-title-wrap');
            const stepIndicator = document.querySelector('.step-indicator');
            const stepStage = document.querySelector('.step-stage');
            const bottomBar = document.querySelector('.start-bottom-bar');
            // 时间线：依次入场
            const tl = __gsap.timeline();
            if (titleWrap) {
                tl.fromTo(titleWrap,
                    { opacity: 0, y: -30, scale: 0.9 },
                    { opacity: 1, y: 0, scale: 1, duration: 0.8, ease: 'back.out(1.7)' }
                );
            }
            if (stepIndicator) {
                tl.fromTo(stepIndicator,
                    { opacity: 0, y: 20 },
                    { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' },
                    '-=0.3'
                );
                // 步骤点依次弹出
                const dots = stepIndicator.querySelectorAll('.step-dot');
                dots.forEach((dot, i) => {
                    tl.fromTo(dot,
                        { opacity: 0, scale: 0.5 },
                        { opacity: 1, scale: 1, duration: 0.3, ease: 'back.out(2)' },
                        `-=0.15`
                    );
                });
            }
            if (stepStage) {
                tl.fromTo(stepStage,
                    { opacity: 0, y: 30 },
                    { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' },
                    '-=0.2'
                );
            }
            if (bottomBar) {
                tl.fromTo(bottomBar,
                    { opacity: 0, y: 20 },
                    { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' },
                    '-=0.2'
                );
            }
        }

        // ===== 2. 步骤切换增强动画（X轴滑动+缩放） =====
        function animateStepTransition(direction) {
            if (!__gsap) return;
            const activePanel = document.querySelector('.step-panel.active');
            if (!activePanel) return;
            // direction: 'next'(正向) or 'prev'(反向)
            const xOffset = direction === 'next' ? 50 : -50;
            __gsap.fromTo(activePanel,
                { opacity: 0, x: xOffset },
                { opacity: 1, x: 0, duration: 0.5, ease: 'power2.out' }
            );
            // 卡片依次入场
            const cards = activePanel.querySelectorAll('.hero-card, .diff-chip, .mode-card-sm, .toggle-row-compact');
            if (cards.length > 0) {
                __gsap.fromTo(cards,
                    { opacity: 0, y: 20, scale: 0.95 },
                    { opacity: 1, y: 0, scale: 1, duration: 0.4, stagger: 0.04, ease: 'back.out(1.4)' }
                );
            }
        }

        // ===== 3. 英雄卡片3D悬停（鼠标移动时跟随倾斜） =====
        function setupHeroCard3DTilt() {
            // 用户要求"不要斜着"：已禁用 3D 鼠标跟随倾斜效果
            // 保留函数壳以免调用点报错，但不绑定任何监听器
            return;
        }
        function __heroGridMouseMove(e) { /* 已禁用 */ }
        function __heroGridMouseLeave(e) { /* 已禁用 */ }

        // ===== 4. 按钮点击波纹效果 =====
        function setupButtonRipple() {
            const buttons = document.querySelectorAll('#startGameBtn, .skin-btn, .bg-select-btn, .bg-reset-btn, .prev-step-btn, .random-hero-btn');
            buttons.forEach(btn => {
                if (btn.dataset.rippleBound) return;
                btn.dataset.rippleBound = '1';
                btn.addEventListener('click', function(e) {
                    const rect = btn.getBoundingClientRect();
                    const ripple = document.createElement('span');
                    ripple.className = 'btn-ripple';
                    ripple.style.cssText = `
                        position: absolute;
                        top: ${e.clientY - rect.top}px;
                        left: ${e.clientX - rect.left}px;
                        width: 4px; height: 4px;
                        background: rgba(255,255,255,0.6);
                        border-radius: 50%;
                        transform: translate(-50%, -50%) scale(0);
                        pointer-events: none;
                        z-index: 10;
                    `;
                    btn.appendChild(ripple);
                    if (__gsap) {
                        __gsap.to(ripple, {
                            scale: 80,
                            opacity: 0,
                            duration: 0.6,
                            ease: 'power2.out',
                            onComplete: () => ripple.remove()
                        });
                    } else {
                        setTimeout(() => ripple.remove(), 600);
                    }
                });
            });
        }

        // ===== 5. 加载完成时触发入场动画 =====
        // 监听 showStartScreen 调用（通过 MutationObserver 监听 startScreen 显示状态）
        const __startScreenObserver = new MutationObserver((mutations) => {
            for (const m of mutations) {
                if (m.attributeName === 'style') {
                    const ss = document.getElementById('startScreen');
                    if (ss && ss.style.display === 'flex') {
                        // 开始界面显示了，触发入场动画
                        if (!__startIntroPlayed) {
                            __startIntroPlayed = true;
                            setTimeout(() => {
                                playStartScreenIntro();
                                setupHeroCard3DTilt();
                                setupButtonRipple();
                            }, 50);
                        } else {
                            // 重启场景：仅刷新卡片3D悬停和按钮波纹
                            setTimeout(() => {
                                setupHeroCard3DTilt();
                                setupButtonRipple();
                            }, 50);
                        }
                    }
                }
            }
        });
        // 等 DOM 加载完成后再开始观察
        window.addEventListener('DOMContentLoaded', () => {
            const ss = document.getElementById('startScreen');
            if (ss) {
                __startScreenObserver.observe(ss, { attributes: true, attributeFilter: ['style'] });
            }
        });

