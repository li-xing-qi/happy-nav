// ============================================================
// 文件: src/draw.js
// 描述: drawHeroAvatar + 绘制函数
// 行范围: 9442-13426 (原 game.js)
// 注意: 本文件由原版 HTML 抽取，保持原作用域不变
// ============================================================

// ============================================================
// 国际化：本文件玩家可见文案的词条（供 _t() 在英文模式下查询）
// 说明：draw.js 中仅有少量飘字/toast 文案，其余中文均为代码注释。
//       八卦符号(☰☱☲)与音符(♪♫♬)为纯装饰 Unicode 符号，语言无关，不翻译。
// ============================================================
Object.assign(I18N_DICT, {
    '无敌': 'INVINCIBLE',
    '战斗背景已设置！': 'Battle background set!',
    '图片加载失败': 'Image load failed',
    '已恢复默认背景': 'Restored default background',
});

        /**
         * 绘制传说皮肤通用特效（多层渐变光环+粒子+旋转纹理）
         * 在英雄主体绘制之前调用，位于英雄头像底层
         */
        function drawLegendSkinEffects(ctx, heroKey, s, t) {
            const skin = getHeroSkin(heroKey);
            if (!skin || skin.type !== 'legend' || !skin.colors || skin.colors.length < 3) return;
            const colors = skin.colors;
            const baseR = 22 * s;

            // 外层脉动渐变光环
            const pulse = 1 + Math.sin(t * 2) * 0.08;
            const g1 = ctx.createRadialGradient(0, 0, baseR * 0.4 * pulse, 0, 0, baseR * pulse);
            for (let i = 0; i < colors.length; i++) {
                g1.addColorStop(i / (colors.length - 1), colors[i] + '44');
            }
            ctx.fillStyle = g1;
            ctx.beginPath();
            ctx.arc(0, 0, baseR * pulse, 0, Math.PI * 2);
            ctx.fill();

            // 中层旋转圆环（颜色交替）
            ctx.save();
            ctx.rotate(-t * 0.8);
            ctx.lineWidth = 2.5 * s;
            for (let i = 0; i < colors.length; i++) {
                const aStart = (i / colors.length) * Math.PI * 2;
                const aEnd = ((i + 0.85) / colors.length) * Math.PI * 2;
                ctx.strokeStyle = colors[i];
                ctx.shadowColor = colors[i];
                ctx.shadowBlur = 10 * s;
                ctx.beginPath();
                ctx.arc(0, 0, baseR * 0.72, aStart, aEnd);
                ctx.stroke();
            }
            ctx.restore();

            // 内层反向旋转细环
            ctx.save();
            ctx.rotate(t * 1.2);
            ctx.lineWidth = 1 * s;
            ctx.strokeStyle = colors[1] || colors[0];
            ctx.shadowColor = colors[0];
            ctx.shadowBlur = 6 * s;
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const a = i * Math.PI / 3;
                const r = baseR * 0.5;
                if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
                else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
            }
            ctx.closePath();
            ctx.stroke();
            ctx.restore();

            // 漂浮粒子（沿光环运动）
            const particleCount = Math.max(4, colors.length * 2);
            for (let i = 0; i < particleCount; i++) {
                const a = t * 0.6 + (i / particleCount) * Math.PI * 2;
                const r = baseR * (0.55 + Math.sin(t * 3 + i) * 0.15);
                const color = colors[i % colors.length];
                ctx.fillStyle = color;
                ctx.shadowColor = color;
                ctx.shadowBlur = 8 * s;
                ctx.beginPath();
                ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 1.2 * s, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.shadowBlur = 0;
        }

        function drawHeroAvatar(ctx, x, y, heroKey, size, time) {
            if (time === undefined) time = 0;
            const t = time * 0.001;
            ctx.save();
            ctx.translate(x, y);
            const s = size / 30;  // 缩放因子（30=基础尺寸）
            const c = getHeroColor(heroKey);  // 皮肤系统：使用皮肤颜色覆盖
            const c2 = HERO_DEFS[heroKey].color2 || c;  // 第二配色（皮肤不覆盖第二配色）

            // 传说皮肤特效（在主体下方绘制）
            drawLegendSkinEffects(ctx, heroKey, s, t);

            // ===== 英雄主体绘制开始（已移除外圈圆环和地面阴影） =====

            if (heroKey === 'lubu') {
                // ===== 吕布 - 红色几何战神（无五官）：双层六边形战甲+旋转火焰核心+方天画戟十字 =====
                ctx.shadowBlur = 0;
                // 外层六边形战甲（深红金边）
                const drawHex = (cx, cy, r, fill, stroke) => {
                    ctx.beginPath();
                    for (let i = 0; i < 6; i++) {
                        const a = i * Math.PI / 3 - Math.PI / 6;
                        const x = cx + Math.cos(a) * r;
                        const y = cy + Math.sin(a) * r;
                        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                    }
                    ctx.closePath();
                    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
                    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.2 * s; ctx.stroke(); }
                };
                drawHex(0, 0, 13*s, shadeColor(c, -45), shadeColor(c, 40));
                // 内部嵌套六边形（亮红高光）
                drawHex(0, 0, 9*s, shadeColor(c, -20), null);
                // 中心旋转内核（八角星）
                const spinT = t * 2;
                ctx.save();
                ctx.rotate(spinT);
                ctx.fillStyle = shadeColor(c, 50);
                ctx.shadowColor = shadeColor(c, -10);
                ctx.shadowBlur = 12;
                for (let i = 0; i < 8; i++) {
                    const a = i * Math.PI / 4;
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(Math.cos(a) * 5*s, Math.sin(a) * 5*s);
                    ctx.lineTo(Math.cos(a + Math.PI/8) * 2*s, Math.sin(a + Math.PI/8) * 2*s);
                    ctx.closePath();
                    ctx.fill();
                }
                ctx.restore();
                // 6道辐射光芒
                for (let i = 0; i < 6; i++) {
                    const a = i * Math.PI / 3 + t * 0.5;
                    ctx.strokeStyle = `rgba(${(h=>parseInt(h.slice(1,3),16)+","+parseInt(h.slice(3,5),16)+","+parseInt(h.slice(5,7),16))(shadeColor(c,30))}, ${0.5 + Math.sin(t*3 + i) * 0.3})`;
                    ctx.lineWidth = 1.2 * s;
                    ctx.shadowColor = shadeColor(c, 20);
                    ctx.shadowBlur = 8;
                    ctx.beginPath();
                    ctx.moveTo(Math.cos(a) * 14*s, Math.sin(a) * 14*s);
                    ctx.lineTo(Math.cos(a) * 19*s, Math.sin(a) * 19*s);
                    ctx.stroke();
                }
                // 旋转火焰环（8个浮动火焰）
                for (let i = 0; i < 8; i++) {
                    const a = t * 1.5 + i * Math.PI * 2 / 8;
                    const r = 17 * s + Math.sin(t * 3 + i) * 1.5 * s;
                    const flicker = 0.6 + Math.sin(t * 6 + i * 2) * 0.3;
                    ctx.fillStyle = `rgba(${(h=>parseInt(h.slice(1,3),16)+","+parseInt(h.slice(3,5),16)+","+parseInt(h.slice(5,7),16))(shadeColor(c,10))}, ${flicker})`;
                    ctx.shadowColor = shadeColor(c, -10);
                    ctx.shadowBlur = 8;
                    ctx.beginPath();
                    ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 2 * s, 0, Math.PI * 2);
                    ctx.fill();
                }
                // 方天画戟十字（背后斜插）
                ctx.shadowBlur = 0;
                ctx.strokeStyle = '#ddd';
                ctx.lineWidth = 2 * s;
                ctx.beginPath();
                ctx.moveTo(-9*s, 9*s);
                ctx.lineTo(9*s, -9*s);
                ctx.stroke();
                // 戟刃（顶端三角）
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.moveTo(9*s, -9*s);
                ctx.lineTo(13*s, -13*s);
                ctx.lineTo(11*s, -7*s);
                ctx.closePath();
                ctx.fill();
                // 戟刃横枝
                ctx.fillStyle = '#ccc';
                ctx.beginPath();
                ctx.moveTo(5*s, -5*s);
                ctx.lineTo(9*s, -4*s);
                ctx.lineTo(7*s, -2*s);
                ctx.lineTo(3*s, -3*s);
                ctx.closePath();
                ctx.fill();
                // 中心宝石（高亮）
                ctx.fillStyle = shadeColor(c, 60);
                ctx.shadowColor = shadeColor(c, 60);
                ctx.shadowBlur = 15;
                ctx.beginPath();
                ctx.arc(0, 0, 1.5 * s, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
            } else if (heroKey === 'zhaoyun') {
                // ===== 赵云 - 银甲几何（无五官）：双层菱形+蓝色闪电核心+银枪十字 =====
                ctx.shadowBlur = 0;
                // 外层菱形银甲
                const drawDiamond = (cx, cy, r, fill, stroke) => {
                    ctx.beginPath();
                    ctx.moveTo(cx, cy - r);
                    ctx.lineTo(cx + r, cy);
                    ctx.lineTo(cx, cy + r);
                    ctx.lineTo(cx - r, cy);
                    ctx.closePath();
                    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
                    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5 * s; ctx.stroke(); }
                };
                drawDiamond(0, 0, 13*s, shadeColor(c, -20), shadeColor(c, -20));
                // 内层菱形（蓝色高光）
                drawDiamond(0, 0, 9*s, shadeColor(c, 10), null);
                // 中心旋转四角星（青色闪电核心）
                const spinT = -t * 3;
                ctx.save();
                ctx.rotate(spinT);
                ctx.fillStyle = shadeColor(c, 50);
                ctx.shadowColor = shadeColor(c, 40);
                ctx.shadowBlur = 15;
                for (let i = 0; i < 4; i++) {
                    const a = i * Math.PI / 2;
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(Math.cos(a) * 5*s, Math.sin(a) * 5*s);
                    ctx.lineTo(Math.cos(a + Math.PI/4) * 1.5*s, Math.sin(a + Math.PI/4) * 1.5*s);
                    ctx.closePath();
                    ctx.fill();
                }
                ctx.restore();
                // 8道辐射光芒（银蓝色）
                for (let i = 0; i < 8; i++) {
                    const a = i * Math.PI / 4 + t * 0.4;
                    ctx.strokeStyle = `rgba(${(h=>parseInt(h.slice(1,3),16)+","+parseInt(h.slice(3,5),16)+","+parseInt(h.slice(5,7),16))(shadeColor(c,40))}, ${0.4 + Math.sin(t*2 + i)*0.25})`;
                    ctx.lineWidth = 0.8 * s;
                    ctx.shadowColor = shadeColor(c, 30);
                    ctx.shadowBlur = 6;
                    ctx.beginPath();
                    ctx.moveTo(Math.cos(a) * 14*s, Math.sin(a) * 14*s);
                    ctx.lineTo(Math.cos(a) * 18*s, Math.sin(a) * 18*s);
                    ctx.stroke();
                }
                // 闪电粒子（5道）
                for (let i = 0; i < 5; i++) {
                    const a = t * 5 + i * Math.PI * 2 / 5;
                    ctx.strokeStyle = `rgba(${(h=>parseInt(h.slice(1,3),16)+","+parseInt(h.slice(3,5),16)+","+parseInt(h.slice(5,7),16))(shadeColor(c,20))}, ${0.9 - i * 0.15})`;
                    ctx.lineWidth = 1.5 * s;
                    ctx.beginPath();
                    const r1 = 21*s, r2 = 16*s, r3 = 11*s;
                    const a1 = a, a2 = a + 0.3, a3 = a + 0.1;
                    ctx.shadowColor = c;
                    ctx.shadowBlur = 8;
                    ctx.moveTo(Math.cos(a1) * r1, Math.sin(a1) * r1);
                    ctx.lineTo(Math.cos(a2) * r2, Math.sin(a2) * r2);
                    ctx.lineTo(Math.cos(a3) * r3, Math.sin(a3) * r3);
                    ctx.stroke();
                }
                // 能量护盾（3层脉动圆）
                for (let i = 0; i < 3; i++) {
                    const ringR = (22 + i*2) * s + Math.sin(t*2.5 + i) * 1.5 * s;
                    ctx.strokeStyle = `rgba(${(h=>parseInt(h.slice(1,3),16)+","+parseInt(h.slice(3,5),16)+","+parseInt(h.slice(5,7),16))(shadeColor(c,20))}, ${0.5 - i*0.15})`;
                    ctx.lineWidth = 0.5 * s;
                    ctx.beginPath();
                    ctx.arc(0, 0, ringR, 0, Math.PI*2);
                    ctx.stroke();
                }
                // 银枪（斜插）
                ctx.shadowBlur = 0;
                ctx.strokeStyle = '#ddd';
                ctx.lineWidth = 2 * s;
                ctx.beginPath();
                ctx.moveTo(-10*s, 10*s);
                ctx.lineTo(10*s, -10*s);
                ctx.stroke();
                // 枪头（顶端三角）
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.moveTo(10*s, -10*s);
                ctx.lineTo(15*s, -14*s);
                ctx.lineTo(13*s, -7*s);
                ctx.closePath();
                ctx.fill();
                // 枪头蓝色高光
                ctx.fillStyle = shadeColor(c, 30);
                ctx.beginPath();
                ctx.moveTo(10.5*s, -10.5*s);
                ctx.lineTo(13*s, -12*s);
                ctx.lineTo(12*s, -9*s);
                ctx.closePath();
                ctx.fill();
                // 蓝色翎子（飘动）
                ctx.strokeStyle = shadeColor(c, 40);
                ctx.lineWidth = 2 * s;
                ctx.shadowColor = shadeColor(c, 40);
                ctx.shadowBlur = 6;
                ctx.beginPath();
                const eSway = Math.sin(t * 4) * 3 * s;
                ctx.moveTo(0, 0);
                ctx.quadraticCurveTo(8*s, -7*s, 12*s + eSway, -3*s);
                ctx.stroke();
                ctx.shadowBlur = 0;
                // 中心高亮宝石
                ctx.fillStyle = shadeColor(c, 50);
                ctx.shadowColor = shadeColor(c, 40);
                ctx.shadowBlur = 12;
                ctx.beginPath();
                ctx.arc(0, 0, 1.5 * s, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
            } else if (heroKey === 'diaochan') {
                // ===== 貂蝉 - 粉色几何舞姬（无五官）：多层花瓣+旋转扇+飘带 =====
                ctx.shadowBlur = 0;
                // 飘逸丝绸身体（窄顶宽底，3层渐变）— 皮肤系统：主体使用皮肤颜色
                ctx.fillStyle = shadeColor(c, -20);
                ctx.beginPath();
                ctx.moveTo(0, -18*s);
                ctx.quadraticCurveTo(-14*s, 0, -15*s, 18*s);
                ctx.lineTo(15*s, 18*s);
                ctx.quadraticCurveTo(14*s, 0, 0, -18*s);
                ctx.fill();
                // 中层粉
                ctx.fillStyle = c;
                ctx.beginPath();
                ctx.moveTo(0, -18*s);
                ctx.quadraticCurveTo(-11*s, 0, -12*s, 16*s);
                ctx.lineTo(12*s, 16*s);
                ctx.quadraticCurveTo(11*s, 0, 0, -18*s);
                ctx.fill();
                // 裙摆蕾丝
                ctx.fillStyle = shadeColor(c, 20);
                ctx.beginPath();
                ctx.moveTo(-12*s, 12*s);
                ctx.quadraticCurveTo(0, 16*s, 12*s, 12*s);
                ctx.lineTo(12*s, 16*s);
                ctx.quadraticCurveTo(0, 20*s, -12*s, 16*s);
                ctx.closePath();
                ctx.fill();
                // 腰间玉带
                ctx.fillStyle = '#ffd700';
                ctx.fillRect(-8*s, 6*s, 16*s, 1.5*s);
                ctx.fillStyle = c;
                ctx.beginPath();
                ctx.arc(0, 7*s, 1.5*s, 0, Math.PI*2);
                ctx.fill();
                // 中心旋转五星（粉红核心）
                const spinT = t * 1.5;
                ctx.save();
                ctx.rotate(spinT);
                ctx.fillStyle = shadeColor(c, 20);
                ctx.shadowColor = c;
                ctx.shadowBlur = 14;
                for (let i = 0; i < 5; i++) {
                    const a = i * 2 * Math.PI / 5 - Math.PI / 2;
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(Math.cos(a) * 6*s, Math.sin(a) * 6*s);
                    ctx.lineTo(Math.cos(a + Math.PI/5) * 2.5*s, Math.sin(a + Math.PI/5) * 2.5*s);
                    ctx.closePath();
                    ctx.fill();
                }
                ctx.restore();
                // 6道辐射光芒（粉红）
                for (let i = 0; i < 6; i++) {
                    const a = i * Math.PI / 3 + t * 0.6;
                    ctx.strokeStyle = `rgba(${(h=>parseInt(h.slice(1,3),16)+","+parseInt(h.slice(3,5),16)+","+parseInt(h.slice(5,7),16))(shadeColor(c,10))}, ${0.5 + Math.sin(t*3 + i) * 0.3})`;
                    ctx.lineWidth = 1 * s;
                    ctx.shadowColor = c;
                    ctx.shadowBlur = 8;
                    ctx.beginPath();
                    ctx.moveTo(Math.cos(a) * 13*s, Math.sin(a) * 13*s);
                    ctx.lineTo(Math.cos(a) * 18*s, Math.sin(a) * 18*s);
                    ctx.stroke();
                }
                // 飘落花瓣（10片）
                for (let i = 0; i < 10; i++) {
                    const a = t * 0.7 + i * 1.05;
                    const r = 20 * s + (i % 3) * 3 * s;
                    const px = Math.cos(a) * r + (i % 2 === 0 ? 5*s : -5*s);
                    const py = Math.sin(a * 1.3 + i) * (16*s + i * 1.5*s) - 3*s;
                    const alpha = 0.5 + Math.sin(t * 3 + i) * 0.3;
                    ctx.fillStyle = `rgba(${(h=>parseInt(h.slice(1,3),16)+","+parseInt(h.slice(3,5),16)+","+parseInt(h.slice(5,7),16))(shadeColor(c,10))}, ${alpha})`;
                    ctx.beginPath();
                    ctx.ellipse(px, py, 2*s, 1.2*s, t + i, 0, Math.PI*2);
                    ctx.fill();
                }
                // 能量光环（粉色3层）
                for (let i = 0; i < 3; i++) {
                    const ringR = (22 + i*2) * s + Math.sin(t*1.8 + i) * 1.5 * s;
                    ctx.strokeStyle = `rgba(${(h=>parseInt(h.slice(1,3),16)+","+parseInt(h.slice(3,5),16)+","+parseInt(h.slice(5,7),16))(shadeColor(c,-10))}, ${0.5 - i*0.15})`;
                    ctx.lineWidth = 0.5 * s;
                    ctx.beginPath();
                    ctx.arc(0, 0, ringR, 0, Math.PI*2);
                    ctx.stroke();
                }
                // 飘带（动态曲线）
                ctx.shadowBlur = 0;
                ctx.strokeStyle = shadeColor(c, -25);
                ctx.lineWidth = 2.5 * s;
                ctx.beginPath();
                const dSway = Math.sin(t * 2) * 3 * s;
                ctx.moveTo(-13*s, 8*s);
                ctx.quadraticCurveTo(-18*s + dSway, 0, -16*s + dSway, -8*s);
                ctx.stroke();
                ctx.strokeStyle = c;
                ctx.lineWidth = 1.2 * s;
                ctx.beginPath();
                ctx.moveTo(-13*s, 8*s);
                ctx.quadraticCurveTo(-18*s + dSway, 0, -16*s + dSway, -8*s);
                ctx.stroke();
                // 扇子（右侧）
                ctx.fillStyle = `rgba(${(h=>parseInt(h.slice(1,3),16)+","+parseInt(h.slice(3,5),16)+","+parseInt(h.slice(5,7),16))(shadeColor(c,30))}, 0.85)`;
                ctx.beginPath();
                ctx.moveTo(11*s, 4*s);
                ctx.quadraticCurveTo(18*s, 7*s, 16*s, 16*s);
                ctx.lineTo(9*s, 13*s);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = shadeColor(c, -25);
                ctx.lineWidth = 1.2 * s;
                ctx.stroke();
                // 扇骨
                ctx.strokeStyle = shadeColor(c, -25);
                ctx.lineWidth = 0.4 * s;
                for (let i = 0; i < 5; i++) {
                    ctx.beginPath();
                    ctx.moveTo(10*s, 5*s);
                    ctx.lineTo(10.5*s + i*0.5*s, 13*s + i*0.3*s);
                    ctx.stroke();
                }
                // 中心高亮宝石
                ctx.fillStyle = shadeColor(c, 20);
                ctx.shadowColor = c;
                ctx.shadowBlur = 12;
                ctx.beginPath();
                ctx.arc(0, 0, 1.5 * s, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
            } else if (heroKey === 'guanyu') {
                // ===== 关羽 - 绿色几何战神（无五官）：五边形战甲+青龙偃月刀 + 红缨光环 =====
                ctx.shadowBlur = 0;
                // 绿袍（梯形外层）— 皮肤系统：主体使用皮肤颜色
                ctx.fillStyle = shadeColor(c, -50);
                ctx.beginPath();
                ctx.moveTo(-12*s, -7*s);
                ctx.lineTo(-16*s, 18*s);
                ctx.lineTo(16*s, 18*s);
                ctx.lineTo(12*s, -7*s);
                ctx.closePath();
                ctx.fill();
                // 中层绿
                ctx.fillStyle = '#1f6622';
                ctx.beginPath();
                ctx.moveTo(-10*s, -7*s);
                ctx.lineTo(-14*s, 16*s);
                ctx.lineTo(14*s, 16*s);
                ctx.lineTo(10*s, -7*s);
                ctx.closePath();
                ctx.fill();
                // 战甲纹理（竖纹）
                ctx.strokeStyle = shadeColor(c, -60);
                ctx.lineWidth = 0.4 * s;
                for (let i = 0; i < 5; i++) {
                    ctx.beginPath();
                    ctx.moveTo(-7*s + i*3*s, -5*s);
                    ctx.lineTo(-9*s + i*3*s, 16*s);
                    ctx.stroke();
                }
                // 金色护肩（弧线）
                ctx.fillStyle = '#cc9922';
                ctx.beginPath();
                ctx.ellipse(0, -3*s, 12*s, 4.5*s, 0, 0, Math.PI*2);
                ctx.fill();
                ctx.strokeStyle = '#aa6600';
                ctx.lineWidth = 0.5 * s;
                ctx.beginPath();
                ctx.ellipse(0, -3*s, 9*s, 3*s, 0, 0, Math.PI*2);
                ctx.stroke();
                // 护肩宝石
                ctx.fillStyle = shadeColor(c, 30);
                ctx.shadowColor = shadeColor(c, 15);
                ctx.shadowBlur = 8;
                ctx.beginPath();
                ctx.arc(0, -3*s, 1.8*s, 0, Math.PI*2);
                ctx.fill();
                ctx.shadowBlur = 0;
                // 中心旋转六叶龙形（绿色核心）
                const spinT = t * 1.2;
                ctx.save();
                ctx.rotate(spinT);
                ctx.fillStyle = shadeColor(c, 20);
                ctx.shadowColor = shadeColor(c, -20);
                ctx.shadowBlur = 14;
                for (let i = 0; i < 6; i++) {
                    const a = i * Math.PI / 3;
                    ctx.beginPath();
                    ctx.ellipse(Math.cos(a) * 3.5*s, Math.sin(a) * 3.5*s, 2.5*s, 1.2*s, a, 0, Math.PI*2);
                    ctx.fill();
                }
                ctx.restore();
                // 6道辐射光芒（金绿）
                for (let i = 0; i < 6; i++) {
                    const a = i * Math.PI / 3 + t * 0.3;
                    ctx.strokeStyle = `rgba(${(h=>parseInt(h.slice(1,3),16)+","+parseInt(h.slice(3,5),16)+","+parseInt(h.slice(5,7),16))(shadeColor(c,30))}, ${0.4 + Math.sin(t*2 + i) * 0.25})`;
                    ctx.lineWidth = 1 * s;
                    ctx.shadowColor = shadeColor(c, 30);
                    ctx.shadowBlur = 8;
                    ctx.beginPath();
                    ctx.moveTo(Math.cos(a) * 14*s, Math.sin(a) * 14*s);
                    ctx.lineTo(Math.cos(a) * 19*s, Math.sin(a) * 19*s);
                    ctx.stroke();
                }
                // 胸前金色龙纹（3道横纹）
                ctx.strokeStyle = 'rgba(255, 200, 0, 0.85)';
                ctx.lineWidth = 1.5 * s;
                for (let i = 0; i < 3; i++) {
                    ctx.beginPath();
                    const y0 = 2*s + i * 5*s;
                    ctx.moveTo(-12*s, y0);
                    ctx.quadraticCurveTo(-6*s, y0 - 3*s, 0, y0);
                    ctx.quadraticCurveTo(6*s, y0 + 3*s, 12*s, y0);
                    ctx.stroke();
                }
                // 能量护盾（绿色3层）
                for (let i = 0; i < 3; i++) {
                    const ringR = (22 + i*2) * s + Math.sin(t*2 + i) * 1.5 * s;
                    ctx.strokeStyle = `rgba(${(h=>parseInt(h.slice(1,3),16)+","+parseInt(h.slice(3,5),16)+","+parseInt(h.slice(5,7),16))(shadeColor(c,10))}, ${0.5 - i*0.15})`;
                    ctx.lineWidth = 0.5 * s;
                    ctx.beginPath();
                    ctx.arc(0, 0, ringR, 0, Math.PI*2);
                    ctx.stroke();
                }
                // 青龙偃月刀（横在右后方）
                ctx.shadowBlur = 0;
                ctx.strokeStyle = '#8B4513';
                ctx.lineWidth = 2.2 * s;
                ctx.beginPath();
                ctx.moveTo(15*s, -8*s);
                ctx.lineTo(20*s, 16*s);
                ctx.stroke();
                // 刀刃（半月形）
                ctx.fillStyle = '#aaccee';
                ctx.beginPath();
                ctx.moveTo(15*s, -10*s);
                ctx.quadraticCurveTo(26*s, 0, 20*s, 14*s);
                ctx.lineTo(15*s, 6*s);
                ctx.closePath();
                ctx.fill();
                // 刀刃高光
                ctx.fillStyle = '#ddeeff';
                ctx.beginPath();
                ctx.moveTo(17*s, -7*s);
                ctx.quadraticCurveTo(22*s, 0, 18*s, 10*s);
                ctx.lineTo(16*s, 4*s);
                ctx.closePath();
                ctx.fill();
                // 刀尖
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.moveTo(26*s, 0);
                ctx.lineTo(28*s, -2*s);
                ctx.lineTo(27*s, 2*s);
                ctx.closePath();
                ctx.fill();
                // 刀环
                ctx.strokeStyle = '#ffd700';
                ctx.lineWidth = 1 * s;
                ctx.beginPath();
                ctx.arc(17*s, -10*s, 2*s, 0, Math.PI*2);
                ctx.stroke();
                // 红缨飘动
                ctx.fillStyle = '#cc2222';
                ctx.beginPath();
                ctx.moveTo(20*s, 14*s);
                ctx.quadraticCurveTo(22*s, 18*s, 20*s, 20*s);
                ctx.quadraticCurveTo(18*s, 18*s, 20*s, 14*s);
                ctx.fill();
                // 中心高亮宝石
                ctx.fillStyle = shadeColor(c, 30);
                ctx.shadowColor = shadeColor(c, -20);
                ctx.shadowBlur = 14;
                ctx.beginPath();
                ctx.arc(0, 0, 1.5 * s, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
            } else if (heroKey === 'huangzhong') {
                // ===== 黄忠 - 黄色几何弓将（无五官）：菱形战甲+大弓+金色光芒 =====
                ctx.shadowBlur = 0;
                // 黄色战甲（梯形外层）
                ctx.fillStyle = shadeColor(c, -40);
                ctx.beginPath();
                ctx.moveTo(-11*s, -7*s);
                ctx.lineTo(-15*s, 18*s);
                ctx.lineTo(15*s, 18*s);
                ctx.lineTo(11*s, -7*s);
                ctx.closePath();
                ctx.fill();
                // 中层
                ctx.fillStyle = shadeColor(c, -20);
                ctx.beginPath();
                ctx.moveTo(-9*s, -7*s);
                ctx.lineTo(-13*s, 16*s);
                ctx.lineTo(13*s, 16*s);
                ctx.lineTo(9*s, -7*s);
                ctx.closePath();
                ctx.fill();
                // 战甲鳞片纹理
                ctx.strokeStyle = shadeColor(c, -40);
                ctx.lineWidth = 0.6 * s;
                for (let i = 0; i < 5; i++) {
                    ctx.beginPath();
                    const y = -3*s + i * 4.5*s;
                    ctx.moveTo(-12*s, y);
                    ctx.quadraticCurveTo(0, y + 1.5*s, 12*s, y);
                    ctx.stroke();
                }
                // 头盔三角顶（无脸只露尖顶）
                ctx.fillStyle = shadeColor(c, -40);
                ctx.beginPath();
                ctx.moveTo(0, -20*s);
                ctx.lineTo(-7*s, -8*s);
                ctx.lineTo(7*s, -8*s);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = shadeColor(c, 20);
                ctx.lineWidth = 1.2 * s;
                ctx.stroke();
                // 头盔金尖
                ctx.fillStyle = shadeColor(c, 20);
                ctx.beginPath();
                ctx.moveTo(0, -22*s);
                ctx.lineTo(-2*s, -20*s);
                ctx.lineTo(2*s, -20*s);
                ctx.closePath();
                ctx.fill();
                // 头盔中央宝石
                ctx.fillStyle = c;
                ctx.shadowColor = shadeColor(c, -20);
                ctx.shadowBlur = 10;
                ctx.beginPath();
                ctx.arc(0, -13*s, 1.8*s, 0, Math.PI*2);
                ctx.fill();
                ctx.shadowBlur = 0;
                // 红缨飘动
                ctx.strokeStyle = '#cc2222';
                ctx.lineWidth = 2.5 * s;
                ctx.beginPath();
                ctx.moveTo(0, -22*s);
                const ySway = Math.sin(t * 2.5) * 2 * s;
                ctx.quadraticCurveTo(4*s, -28*s, 5*s + ySway, -32*s);
                ctx.stroke();
                ctx.fillStyle = '#cc2222';
                for (let i = 0; i < 3; i++) {
                    ctx.beginPath();
                    ctx.arc(4*s + ySway*0.5 + i*0.8*s, -30*s - i*1.5*s, 1*s, 0, Math.PI*2);
                    ctx.fill();
                }
                // 中心旋转四角星（金色核心）
                const spinT = t * 1.8;
                ctx.save();
                ctx.rotate(spinT);
                ctx.fillStyle = shadeColor(c, 40);
                ctx.shadowColor = c;
                ctx.shadowBlur = 14;
                for (let i = 0; i < 4; i++) {
                    const a = i * Math.PI / 2;
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(Math.cos(a) * 5*s, Math.sin(a) * 5*s);
                    ctx.lineTo(Math.cos(a + Math.PI/4) * 1.5*s, Math.sin(a + Math.PI/4) * 1.5*s);
                    ctx.closePath();
                    ctx.fill();
                }
                ctx.restore();
                // 6道辐射光芒
                for (let i = 0; i < 6; i++) {
                    const a = i * Math.PI / 3 + t * 0.4;
                    ctx.strokeStyle = `rgba(${(h=>parseInt(h.slice(1,3),16)+","+parseInt(h.slice(3,5),16)+","+parseInt(h.slice(5,7),16))(shadeColor(c,20))}, ${0.4 + Math.sin(t*2 + i) * 0.25})`;
                    ctx.lineWidth = 1 * s;
                    ctx.shadowColor = c;
                    ctx.shadowBlur = 8;
                    ctx.beginPath();
                    ctx.moveTo(Math.cos(a) * 14*s, Math.sin(a) * 14*s);
                    ctx.lineTo(Math.cos(a) * 19*s, Math.sin(a) * 19*s);
                    ctx.stroke();
                }
                // 能量护盾（金色3层）
                for (let i = 0; i < 3; i++) {
                    const ringR = (22 + i*2) * s + Math.sin(t*2 + i) * 1.5 * s;
                    ctx.strokeStyle = `rgba(${(h=>parseInt(h.slice(1,3),16)+","+parseInt(h.slice(3,5),16)+","+parseInt(h.slice(5,7),16))(shadeColor(c,20))}, ${0.5 - i*0.15})`;
                    ctx.lineWidth = 0.5 * s;
                    ctx.beginPath();
                    ctx.arc(0, 0, ringR, 0, Math.PI*2);
                    ctx.stroke();
                }
                // 大弓（右侧）
                ctx.shadowBlur = 0;
                ctx.strokeStyle = '#5a2e0d';
                ctx.lineWidth = 3.5 * s;
                ctx.beginPath();
                ctx.moveTo(14*s, -10*s);
                ctx.quadraticCurveTo(22*s, 0, 14*s, 14*s);
                ctx.stroke();
                // 弓身高光
                ctx.strokeStyle = '#8B4513';
                ctx.lineWidth = 1.2 * s;
                ctx.beginPath();
                ctx.moveTo(14.5*s, -9*s);
                ctx.quadraticCurveTo(21*s, 0, 14.5*s, 13*s);
                ctx.stroke();
                // 弓弦
                ctx.strokeStyle = '#dddddd';
                ctx.lineWidth = 1 * s;
                ctx.beginPath();
                ctx.moveTo(14*s, -10*s);
                ctx.lineTo(14*s, 14*s);
                ctx.stroke();
                // 弓把金箍
                ctx.fillStyle = shadeColor(c, 20);
                ctx.fillRect(12.8*s, 0*s, 2.9*s, 0.8*s);
                ctx.fillRect(12.8*s, 2*s, 2.9*s, 0.8*s);
                // 弓装饰
                ctx.fillStyle = c;
                ctx.beginPath();
                ctx.arc(14*s, -10*s, 1.5*s, 0, Math.PI*2);
                ctx.arc(14*s, 14*s, 1.5*s, 0, Math.PI*2);
                ctx.fill();
                // 箭矢（5支，排列）
                ctx.strokeStyle = shadeColor(c, -40);
                ctx.lineWidth = 1 * s;
                for (let i = 0; i < 5; i++) {
                    const y = -8*s + i * 4*s;
                    ctx.beginPath();
                    ctx.moveTo(7*s, y);
                    ctx.lineTo(19*s, y);
                    ctx.stroke();
                    // 箭羽
                    ctx.fillStyle = '#cc2222';
                    ctx.beginPath();
                    ctx.moveTo(7*s, y - 0.8*s);
                    ctx.lineTo(8*s, y);
                    ctx.lineTo(7*s, y + 0.8*s);
                    ctx.lineTo(6*s, y);
                    ctx.closePath();
                    ctx.fill();
                    // 箭头
                    ctx.fillStyle = '#fff';
                    ctx.shadowColor = c;
                    ctx.shadowBlur = 4;
                    ctx.beginPath();
                    ctx.moveTo(19*s, y);
                    ctx.lineTo(22*s, y - 1.2*s);
                    ctx.lineTo(22*s, y + 1.2*s);
                    ctx.closePath();
                    ctx.fill();
                    ctx.shadowBlur = 0;
                }
                // 中心高亮宝石
                ctx.fillStyle = shadeColor(c, 40);
                ctx.shadowColor = c;
                ctx.shadowBlur = 14;
                ctx.beginPath();
                ctx.arc(0, 0, 1.5 * s, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
            } else if (heroKey === 'machao') {
                // ===== 马超 - 紫色几何骑将（无五官）：菱形战甲+紫电环绕+短枪 =====
                ctx.shadowBlur = 0;
                // 紫色战袍（梯形外层）— 皮肤系统：主体使用皮肤颜色
                ctx.fillStyle = shadeColor(c, -55);
                ctx.beginPath();
                ctx.moveTo(-12*s, -7*s);
                ctx.lineTo(-15*s, 18*s);
                ctx.lineTo(15*s, 18*s);
                ctx.lineTo(12*s, -7*s);
                ctx.closePath();
                ctx.fill();
                // 中层紫
                ctx.fillStyle = shadeColor(c, -30);
                ctx.beginPath();
                ctx.moveTo(-10*s, -7*s);
                ctx.lineTo(-13*s, 16*s);
                ctx.lineTo(13*s, 16*s);
                ctx.lineTo(10*s, -7*s);
                ctx.closePath();
                ctx.fill();
                // 战袍纹理（竖纹）
                ctx.strokeStyle = shadeColor(c, -50);
                ctx.lineWidth = 0.4 * s;
                for (let i = 0; i < 5; i++) {
                    ctx.beginPath();
                    ctx.moveTo(-7*s + i*3.5*s, -5*s);
                    ctx.lineTo(-9*s + i*3.5*s, 16*s);
                    ctx.stroke();
                }
                // 金色护肩
                ctx.fillStyle = '#ddaa44';
                ctx.beginPath();
                ctx.ellipse(0, -3*s, 11*s, 4.5*s, 0, 0, Math.PI*2);
                ctx.fill();
                // 护肩宝石
                ctx.fillStyle = shadeColor(c, 20);
                ctx.shadowColor = shadeColor(c, 10);
                ctx.shadowBlur = 10;
                ctx.beginPath();
                ctx.arc(0, -3*s, 1.8*s, 0, Math.PI*2);
                ctx.fill();
                ctx.shadowBlur = 0;
                // 中心旋转六角星（紫色核心）
                const spinT = t * 2.5;
                ctx.save();
                ctx.rotate(spinT);
                ctx.fillStyle = shadeColor(c, 30);
                ctx.shadowColor = shadeColor(c, 10);
                ctx.shadowBlur = 15;
                for (let i = 0; i < 6; i++) {
                    const a = i * Math.PI / 3;
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(Math.cos(a) * 5*s, Math.sin(a) * 5*s);
                    ctx.lineTo(Math.cos(a + Math.PI/6) * 1.5*s, Math.sin(a + Math.PI/6) * 1.5*s);
                    ctx.closePath();
                    ctx.fill();
                }
                ctx.restore();
                // 8道辐射光芒（紫）
                for (let i = 0; i < 8; i++) {
                    const a = i * Math.PI / 4 + t * 0.5;
                    ctx.strokeStyle = `rgba(${(h=>parseInt(h.slice(1,3),16)+","+parseInt(h.slice(3,5),16)+","+parseInt(h.slice(5,7),16))(shadeColor(c,20))}, ${0.4 + Math.sin(t*2 + i) * 0.25})`;
                    ctx.lineWidth = 1 * s;
                    ctx.shadowColor = shadeColor(c, 20);
                    ctx.shadowBlur = 8;
                    ctx.beginPath();
                    ctx.moveTo(Math.cos(a) * 14*s, Math.sin(a) * 14*s);
                    ctx.lineTo(Math.cos(a) * 19*s, Math.sin(a) * 19*s);
                    ctx.stroke();
                }
                // 紫色闪电环绕（6道）
                for (let i = 0; i < 6; i++) {
                    const a = t * 3.5 + i * Math.PI / 3;
                    ctx.strokeStyle = `rgba(${(h=>parseInt(h.slice(1,3),16)+","+parseInt(h.slice(3,5),16)+","+parseInt(h.slice(5,7),16))(shadeColor(c,10))}, ${0.9 - i * 0.12})`;
                    ctx.lineWidth = 1.5 * s;
                    ctx.shadowColor = shadeColor(c, 30);
                    ctx.shadowBlur = 8;
                    ctx.beginPath();
                    const r1 = 22*s, r2 = 16*s, r3 = 10*s;
                    const a1 = a, a2 = a + 0.25, a3 = a + 0.1;
                    ctx.moveTo(Math.cos(a1) * r1, Math.sin(a1) * r1);
                    ctx.lineTo(Math.cos(a2) * r2, Math.sin(a2) * r2);
                    ctx.lineTo(Math.cos(a3) * r3, Math.sin(a3) * r3);
                    ctx.stroke();
                }
                // 能量护盾（紫色3层）
                for (let i = 0; i < 3; i++) {
                    const ringR = (22 + i*2) * s + Math.sin(t*2.5 + i) * 1.5 * s;
                    ctx.strokeStyle = `rgba(${(h=>parseInt(h.slice(1,3),16)+","+parseInt(h.slice(3,5),16)+","+parseInt(h.slice(5,7),16))(shadeColor(c,-10))}, ${0.5 - i*0.15})`;
                    ctx.lineWidth = 0.5 * s;
                    ctx.beginPath();
                    ctx.arc(0, 0, ringR, 0, Math.PI*2);
                    ctx.stroke();
                }
                // 短枪（斜插）
                ctx.shadowBlur = 0;
                ctx.strokeStyle = shadeColor(c, -10);
                ctx.lineWidth = 2.5 * s;
                ctx.beginPath();
                ctx.moveTo(-13*s, -8*s);
                ctx.lineTo(13*s, 12*s);
                ctx.stroke();
                // 枪杆高光
                ctx.strokeStyle = shadeColor(c, 30);
                ctx.lineWidth = 1 * s;
                ctx.beginPath();
                ctx.moveTo(-12.5*s, -8.5*s);
                ctx.lineTo(12.5*s, 11.5*s);
                ctx.stroke();
                // 枪尖
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.moveTo(13*s, 12*s);
                ctx.lineTo(17*s, 9*s);
                ctx.lineTo(15*s, 14*s);
                ctx.closePath();
                ctx.fill();
                // 枪缨（飘动）
                ctx.fillStyle = '#ff3344';
                ctx.beginPath();
                ctx.moveTo(12*s, 11*s);
                const sp = Math.sin(t * 5) * 3 * s;
                ctx.quadraticCurveTo(15*s + sp, 16*s, 11*s + sp*1.5, 18*s);
                ctx.quadraticCurveTo(8*s, 14*s, 12*s, 11*s);
                ctx.fill();
                // 缨芯金
                ctx.fillStyle = '#ffd700';
                ctx.beginPath();
                ctx.arc(12.5*s, 12*s, 0.8*s, 0, Math.PI*2);
                ctx.fill();
                // 紫色翎子（飘动）
                ctx.strokeStyle = shadeColor(c, 20);
                ctx.lineWidth = 2.5 * s;
                ctx.beginPath();
                ctx.moveTo(0, -7*s);
                const mSway = Math.sin(t * 4.5) * 3 * s;
                ctx.quadraticCurveTo(7*s, -12*s, 12*s + mSway, -8*s);
                ctx.stroke();
                // 中心高亮宝石
                ctx.fillStyle = shadeColor(c, 50);
                ctx.shadowColor = shadeColor(c, 30);
                ctx.shadowBlur = 14;
                ctx.beginPath();
                ctx.arc(0, 0, 1.5 * s, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
            } else if (heroKey === 'zhugeliang') {
                // ===== 诸葛亮 - 青色几何法师（无五官）：白袍+八卦阵+羽扇+星象 =====
                ctx.shadowBlur = 0;
                // 白色长袍（梯形外层）— 皮肤系统：主体使用皮肤颜色
                ctx.fillStyle = shadeColor(c, -10);
                ctx.beginPath();
                ctx.moveTo(-13*s, -7*s);
                ctx.lineTo(-17*s, 20*s);
                ctx.lineTo(17*s, 20*s);
                ctx.lineTo(13*s, -7*s);
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = shadeColor(c, 40);
                ctx.beginPath();
                ctx.moveTo(-11*s, -7*s);
                ctx.lineTo(-15*s, 18*s);
                ctx.lineTo(15*s, 18*s);
                ctx.lineTo(11*s, -7*s);
                ctx.closePath();
                ctx.fill();
                // 战袍纹理
                ctx.strokeStyle = shadeColor(c, 10);
                ctx.lineWidth = 0.4 * s;
                for (let i = 0; i < 5; i++) {
                    ctx.beginPath();
                    ctx.moveTo(-7*s + i*3.5*s, -5*s);
                    ctx.lineTo(-9*s + i*3.5*s, 18*s);
                    ctx.stroke();
                }
                // 青色镶边
                ctx.strokeStyle = shadeColor(c, -30);
                ctx.lineWidth = 1.5 * s;
                ctx.beginPath();
                ctx.moveTo(-11*s, -7*s);
                ctx.lineTo(11*s, -7*s);
                ctx.stroke();
                // 胸前八卦阵
                ctx.fillStyle = shadeColor(c, 10);
                ctx.beginPath();
                ctx.arc(0, 5*s, 5*s, 0, Math.PI*2);
                ctx.fill();
                ctx.strokeStyle = shadeColor(c, -30);
                ctx.lineWidth = 0.6 * s;
                ctx.beginPath();
                ctx.arc(0, 5*s, 5*s, 0, Math.PI*2);
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(0, 5*s, 3.5*s, 0, Math.PI*2);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(0, 1*s);
                ctx.lineTo(0, 9*s);
                ctx.stroke();
                // 阴阳鱼
                ctx.fillStyle = '#1a1a1a';
                ctx.beginPath();
                ctx.arc(0, 5*s, 2*s, 0, Math.PI);
                ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.arc(0, 5*s, 2*s, Math.PI, Math.PI*2);
                ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.arc(0, 3.5*s, 0.5*s, 0, Math.PI*2);
                ctx.fill();
                ctx.fillStyle = '#1a1a1a';
                ctx.beginPath();
                ctx.arc(0, 6.5*s, 0.5*s, 0, Math.PI*2);
                ctx.fill();
                // 八卦能量环
                ctx.strokeStyle = `rgba(${(h=>parseInt(h.slice(1,3),16)+","+parseInt(h.slice(3,5),16)+","+parseInt(h.slice(5,7),16))(shadeColor(c,20))}, ${0.5 + Math.sin(t*2)*0.3})`;
                ctx.lineWidth = 0.5 * s;
                ctx.beginPath();
                ctx.arc(0, 5*s, 6*s, 0, Math.PI*2);
                ctx.stroke();
                // 纶巾冠（三角形几何冠）
                ctx.fillStyle = '#1a1a2e';
                ctx.beginPath();
                ctx.moveTo(-8*s, -13*s);
                ctx.lineTo(8*s, -13*s);
                ctx.lineTo(6*s, -9*s);
                ctx.lineTo(-6*s, -9*s);
                ctx.closePath();
                ctx.fill();
                // 金冠宝石
                ctx.fillStyle = '#ffd700';
                ctx.shadowColor = c;
                ctx.shadowBlur = 10;
                ctx.beginPath();
                ctx.arc(0, -14*s, 2*s, 0, Math.PI*2);
                ctx.fill();
                ctx.fillStyle = c;
                ctx.beginPath();
                ctx.arc(0, -14*s, 1*s, 0, Math.PI*2);
                ctx.fill();
                ctx.shadowBlur = 0;
                // 纶巾后结
                ctx.fillStyle = '#1a1a2e';
                ctx.beginPath();
                ctx.arc(0, -8*s, 1.5*s, 0, Math.PI*2);
                ctx.fill();
                // 中心旋转六角星（青色核心）
                const spinT = t * 1.3;
                ctx.save();
                ctx.rotate(spinT);
                ctx.fillStyle = shadeColor(c, 30);
                ctx.shadowColor = c;
                ctx.shadowBlur = 14;
                for (let i = 0; i < 6; i++) {
                    const a = i * Math.PI / 3;
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(Math.cos(a) * 4.5*s, Math.sin(a) * 4.5*s);
                    ctx.lineTo(Math.cos(a + Math.PI/6) * 1.2*s, Math.sin(a + Math.PI/6) * 1.2*s);
                    ctx.closePath();
                    ctx.fill();
                }
                ctx.restore();
                // 6道辐射光芒
                for (let i = 0; i < 6; i++) {
                    const a = i * Math.PI / 3 + t * 0.5;
                    ctx.strokeStyle = `rgba(${(h=>parseInt(h.slice(1,3),16)+","+parseInt(h.slice(3,5),16)+","+parseInt(h.slice(5,7),16))(shadeColor(c,30))}, ${0.4 + Math.sin(t*2 + i) * 0.25})`;
                    ctx.lineWidth = 1 * s;
                    ctx.shadowColor = c;
                    ctx.shadowBlur = 8;
                    ctx.beginPath();
                    ctx.moveTo(Math.cos(a) * 13*s, Math.sin(a) * 13*s);
                    ctx.lineTo(Math.cos(a) * 18*s, Math.sin(a) * 18*s);
                    ctx.stroke();
                }
                // 青色能量护盾（3层）
                for (let i = 0; i < 3; i++) {
                    const ringR = (22 + i*2) * s + Math.sin(t*2 + i) * 1.5 * s;
                    ctx.strokeStyle = `rgba(${(h=>parseInt(h.slice(1,3),16)+","+parseInt(h.slice(3,5),16)+","+parseInt(h.slice(5,7),16))(shadeColor(c,20))}, ${0.5 - i*0.15})`;
                    ctx.lineWidth = 0.5 * s;
                    ctx.beginPath();
                    ctx.arc(0, 0, ringR, 0, Math.PI*2);
                    ctx.stroke();
                }
                // 八卦符号环绕（8个）
                const bagua = ['☰', '☱', '☲', '☳', '☴', '☵', '☶', '☷'];
                ctx.font = `bold ${3.5*s}px "Microsoft YaHei", sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                for (let i = 0; i < 8; i++) {
                    const a = -Math.PI/2 + i * Math.PI * 2 / 8 + t * 0.3;
                    const r = 26*s;
                    const px = Math.cos(a) * r;
                    const py = Math.sin(a) * r;
                    ctx.fillStyle = `rgba(${(h=>parseInt(h.slice(1,3),16)+","+parseInt(h.slice(3,5),16)+","+parseInt(h.slice(5,7),16))(shadeColor(c,30))}, ${0.6 + Math.sin(t*2 + i)*0.3})`;
                    ctx.shadowColor = c;
                    ctx.shadowBlur = 6;
                    ctx.fillText(bagua[i], px, py);
                    ctx.shadowBlur = 0;
                }
                // 羽扇（背后）
                ctx.shadowBlur = 0;
                ctx.strokeStyle = '#8B4513';
                ctx.lineWidth = 1.5 * s;
                ctx.beginPath();
                ctx.moveTo(-12*s, 0);
                ctx.lineTo(-20*s, -8*s);
                ctx.stroke();
                // 扇面（白色几何）
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.moveTo(-20*s, -8*s);
                ctx.quadraticCurveTo(-25*s, -14*s, -23*s, -19*s);
                ctx.quadraticCurveTo(-18*s, -17*s, -13*s, -8*s);
                ctx.closePath();
                ctx.fill();
                // 扇面高光
                ctx.fillStyle = shadeColor(c, 40);
                ctx.beginPath();
                ctx.moveTo(-20*s, -8*s);
                ctx.quadraticCurveTo(-23*s, -13*s, -22*s, -17*s);
                ctx.quadraticCurveTo(-19*s, -15*s, -15*s, -9*s);
                ctx.closePath();
                ctx.fill();
                // 扇骨
                ctx.strokeStyle = shadeColor(c, -10);
                ctx.lineWidth = 0.5 * s;
                for (let i = 0; i < 5; i++) {
                    ctx.beginPath();
                    const fa = -1.2 + i * 0.2;
                    ctx.moveTo(-20*s, -8*s);
                    ctx.lineTo(-23*s + Math.cos(fa) * 2.5*s, -19*s + Math.sin(fa) * 2.5*s);
                    ctx.stroke();
                }
                // 飘动的仙气（青色）
                for (let i = 0; i < 3; i++) {
                    ctx.fillStyle = `rgba(${(h=>parseInt(h.slice(1,3),16)+","+parseInt(h.slice(3,5),16)+","+parseInt(h.slice(5,7),16))(shadeColor(c,30))}, ${0.3 - i*0.08})`;
                    ctx.beginPath();
                    ctx.ellipse(13*s + i*2*s + Math.sin(t + i)*2*s, -13*s + i*4*s + Math.cos(t + i)*2*s, 1.5*s, 1*s, 0, 0, Math.PI*2);
                    ctx.fill();
                }
                // 中心高亮宝石
                ctx.fillStyle = shadeColor(c, 30);
                ctx.shadowColor = c;
                ctx.shadowBlur = 14;
                ctx.beginPath();
                ctx.arc(0, 0, 1.5 * s, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
            } else if (heroKey === 'zhangfei') {
                // ===== 张飞 - 黑色几何重装（无五官）：黑铁八边+虎头+蛇矛+怒焰 =====
                ctx.shadowBlur = 0;
                // 黑色重甲（梯形外层）— 皮肤系统：主体使用皮肤颜色
                ctx.fillStyle = shadeColor(c, -60);
                ctx.beginPath();
                ctx.moveTo(-13*s, -7*s);
                ctx.lineTo(-17*s, 18*s);
                ctx.lineTo(17*s, 18*s);
                ctx.lineTo(13*s, -7*s);
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = shadeColor(c, -50);
                ctx.beginPath();
                ctx.moveTo(-11*s, -7*s);
                ctx.lineTo(-15*s, 16*s);
                ctx.lineTo(15*s, 16*s);
                ctx.lineTo(11*s, -7*s);
                ctx.closePath();
                ctx.fill();
                // 铁甲鳞片
                ctx.strokeStyle = shadeColor(c, -40);
                ctx.lineWidth = 0.6 * s;
                for (let i = 0; i < 5; i++) {
                    ctx.beginPath();
                    const y = -3*s + i * 3.5*s;
                    ctx.moveTo(-14*s, y);
                    ctx.quadraticCurveTo(0, y + 1.5*s, 14*s, y);
                    ctx.stroke();
                }
                // 胸前黑虎头（八边形）
                ctx.fillStyle = shadeColor(c, -40);
                ctx.beginPath();
                ctx.arc(0, 4*s, 5*s, 0, Math.PI*2);
                ctx.fill();
                ctx.fillStyle = shadeColor(c, -60);
                ctx.beginPath();
                ctx.arc(0, 4*s, 4*s, 0, Math.PI*2);
                ctx.fill();
                // 虎头金芯
                ctx.fillStyle = '#ffd700';
                ctx.beginPath();
                ctx.arc(0, 4*s, 2*s, 0, Math.PI*2);
                ctx.fill();
                ctx.fillStyle = '#ffeb88';
                ctx.beginPath();
                ctx.arc(-0.7*s, 3.3*s, 0.7*s, 0, Math.PI*2);
                ctx.fill();
                // 虎头金边
                ctx.strokeStyle = '#ffd700';
                ctx.lineWidth = 0.6 * s;
                ctx.beginPath();
                ctx.arc(0, 4*s, 5*s, 0, Math.PI*2);
                ctx.stroke();
                // 虎耳（几何三角）
                ctx.fillStyle = shadeColor(c, -40);
                ctx.beginPath();
                ctx.moveTo(-3.5*s, 1*s);
                ctx.lineTo(-2*s, -1*s);
                ctx.lineTo(-1*s, 1.5*s);
                ctx.closePath();
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(3.5*s, 1*s);
                ctx.lineTo(2*s, -1*s);
                ctx.lineTo(1*s, 1.5*s);
                ctx.closePath();
                ctx.fill();
                // 头盔（梯形，不露脸）
                ctx.fillStyle = shadeColor(c, -70);
                ctx.beginPath();
                ctx.moveTo(-9*s, -13*s);
                ctx.lineTo(9*s, -13*s);
                ctx.lineTo(7*s, -9*s);
                ctx.lineTo(-7*s, -9*s);
                ctx.closePath();
                ctx.fill();
                // 头巾金边
                ctx.strokeStyle = '#ffd700';
                ctx.lineWidth = 0.6 * s;
                ctx.beginPath();
                ctx.moveTo(-9*s, -13*s);
                ctx.lineTo(9*s, -13*s);
                ctx.stroke();
                // 头巾中心金
                ctx.fillStyle = '#ffd700';
                ctx.shadowColor = c;
                ctx.shadowBlur = 8;
                ctx.beginPath();
                ctx.arc(0, -11*s, 1.5*s, 0, Math.PI*2);
                ctx.fill();
                ctx.shadowBlur = 0;
                // 中心旋转双五角（红黑核心）
                const spinT = t * 1.5;
                ctx.save();
                ctx.rotate(spinT);
                ctx.fillStyle = shadeColor(c, 20);
                ctx.shadowColor = c;
                ctx.shadowBlur = 14;
                for (let i = 0; i < 5; i++) {
                    const a = i * 2 * Math.PI / 5 - Math.PI / 2;
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(Math.cos(a) * 5*s, Math.sin(a) * 5*s);
                    ctx.lineTo(Math.cos(a + Math.PI/5) * 2*s, Math.sin(a + Math.PI/5) * 2*s);
                    ctx.closePath();
                    ctx.fill();
                }
                ctx.restore();
                // 4道红色怒意光芒
                for (let i = 0; i < 4; i++) {
                    const a = i * Math.PI / 2 + t * 0.4;
                    ctx.strokeStyle = `rgba(${(h=>parseInt(h.slice(1,3),16)+","+parseInt(h.slice(3,5),16)+","+parseInt(h.slice(5,7),16))(shadeColor(c,20))}, ${0.4 + Math.sin(t*2 + i) * 0.25})`;
                    ctx.lineWidth = 1.2 * s;
                    ctx.shadowColor = c;
                    ctx.shadowBlur = 10;
                    ctx.beginPath();
                    ctx.moveTo(Math.cos(a) * 14*s, Math.sin(a) * 14*s);
                    ctx.lineTo(Math.cos(a) * 19*s, Math.sin(a) * 19*s);
                    ctx.stroke();
                }
                // 8道暗红能量环绕
                for (let i = 0; i < 8; i++) {
                    const a = t * 2 + i * Math.PI / 4;
                    const r = 21 * s + Math.sin(t * 3 + i) * 1.5 * s;
                    const alpha = 0.6 - i * 0.06;
                    ctx.fillStyle = `rgba(${(h=>parseInt(h.slice(1,3),16)+","+parseInt(h.slice(3,5),16)+","+parseInt(h.slice(5,7),16))(c)}, ${alpha})`;
                    ctx.shadowColor = c;
                    ctx.shadowBlur = 8;
                    ctx.beginPath();
                    ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 1.5 * s, 0, Math.PI*2);
                    ctx.fill();
                }
                // 红色怒意能量护盾（3层）
                for (let i = 0; i < 3; i++) {
                    const ringR = (22 + i*2) * s + Math.sin(t*2 + i) * 1.5 * s;
                    ctx.strokeStyle = `rgba(${(h=>parseInt(h.slice(1,3),16)+","+parseInt(h.slice(3,5),16)+","+parseInt(h.slice(5,7),16))(shadeColor(c,10))}, ${0.5 - i*0.15})`;
                    ctx.lineWidth = 0.5 * s;
                    ctx.beginPath();
                    ctx.arc(0, 0, ringR, 0, Math.PI*2);
                    ctx.stroke();
                }
                // 丈八蛇矛（斜立）
                ctx.shadowBlur = 0;
                ctx.strokeStyle = '#3a1e0d';
                ctx.lineWidth = 2.5 * s;
                ctx.beginPath();
                ctx.moveTo(-13*s, 16*s);
                ctx.lineTo(-19*s, -22*s);
                ctx.stroke();
                // 枪杆高光
                ctx.strokeStyle = '#5a2e0d';
                ctx.lineWidth = 1 * s;
                ctx.beginPath();
                ctx.moveTo(-13.5*s, 15*s);
                ctx.lineTo(-19.5*s, -21*s);
                ctx.stroke();
                // 蛇形矛头
                ctx.fillStyle = shadeColor(c, -20);
                ctx.beginPath();
                ctx.moveTo(-19*s, -22*s);
                ctx.quadraticCurveTo(-23*s, -18*s, -19*s, -14*s);
                ctx.lineTo(-17*s, -18*s);
                ctx.closePath();
                ctx.fill();
                // 矛头高光
                ctx.fillStyle = shadeColor(c, 10);
                ctx.beginPath();
                ctx.moveTo(-19*s, -22*s);
                ctx.quadraticCurveTo(-21*s, -19*s, -19*s, -16*s);
                ctx.lineTo(-18*s, -19*s);
                ctx.closePath();
                ctx.fill();
                // 矛尖
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.moveTo(-19*s, -22*s);
                ctx.lineTo(-22*s, -25*s);
                ctx.lineTo(-18*s, -24*s);
                ctx.closePath();
                ctx.fill();
                // 红缨（飘动）
                ctx.fillStyle = '#cc2222';
                ctx.beginPath();
                ctx.moveTo(-19*s, -14*s);
                ctx.quadraticCurveTo(-15*s + Math.sin(t*3)*2, -8*s, -19*s, -2*s);
                ctx.quadraticCurveTo(-22*s, -8*s, -19*s, -14*s);
                ctx.fill();
                // 中心高亮宝石
                ctx.fillStyle = shadeColor(c, 20);
                ctx.shadowColor = c;
                ctx.shadowBlur = 14;
                ctx.beginPath();
                ctx.arc(0, 0, 1.5 * s, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
            } else if (heroKey === 'zhouyu') {
                // ===== 周瑜 - 橙红几何火神（无五官）：红莲+红羽扇+火焰核心+音符 =====
                ctx.shadowBlur = 0;
                // 红色长袍（梯形外层）— 皮肤系统：主体使用皮肤颜色
                ctx.fillStyle = shadeColor(c, -40);
                ctx.beginPath();
                ctx.moveTo(-12*s, -7*s);
                ctx.lineTo(-16*s, 18*s);
                ctx.lineTo(16*s, 18*s);
                ctx.lineTo(12*s, -7*s);
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = shadeColor(c, -30);
                ctx.beginPath();
                ctx.moveTo(-10*s, -7*s);
                ctx.lineTo(-14*s, 16*s);
                ctx.lineTo(14*s, 16*s);
                ctx.lineTo(10*s, -7*s);
                ctx.closePath();
                ctx.fill();
                // 战袍纹理
                ctx.strokeStyle = shadeColor(c, -50);
                ctx.lineWidth = 0.4 * s;
                for (let i = 0; i < 5; i++) {
                    ctx.beginPath();
                    ctx.moveTo(-7*s + i*3.5*s, -5*s);
                    ctx.lineTo(-9*s + i*3.5*s, 16*s);
                    ctx.stroke();
                }
                // 金色镶边
                ctx.strokeStyle = '#ffd700';
                ctx.lineWidth = 1.5 * s;
                ctx.beginPath();
                ctx.moveTo(-10*s, -7*s);
                ctx.lineTo(10*s, -7*s);
                ctx.stroke();
                // 金色镶边装饰
                ctx.fillStyle = '#ffd700';
                for (let i = 0; i < 3; i++) {
                    ctx.beginPath();
                    ctx.arc(-7*s + i*7*s, -6*s, 0.7*s, 0, Math.PI*2);
                    ctx.fill();
                }
                // 胸前红莲火焰纹（多层）
                ctx.fillStyle = c;
                ctx.beginPath();
                ctx.moveTo(-3*s, 0);
                ctx.quadraticCurveTo(-1*s, 4*s, -2*s, 8*s);
                ctx.quadraticCurveTo(0, 6*s, 1*s, 10*s);
                ctx.quadraticCurveTo(2*s, 4*s, 3*s, 0);
                ctx.closePath();
                ctx.fill();
                // 火焰高光
                ctx.fillStyle = shadeColor(c, 30);
                ctx.beginPath();
                ctx.moveTo(-1.5*s, 1*s);
                ctx.quadraticCurveTo(-0.5*s, 3*s, -1*s, 6*s);
                ctx.quadraticCurveTo(0, 5*s, 0.5*s, 8*s);
                ctx.quadraticCurveTo(1*s, 3*s, 1.5*s, 1*s);
                ctx.closePath();
                ctx.fill();
                // 红莲中心
                ctx.fillStyle = shadeColor(c, 40);
                ctx.beginPath();
                ctx.arc(0, 5*s, 1*s, 0, Math.PI*2);
                ctx.fill();
                // 红色高冠（梯形双层）
                ctx.fillStyle = shadeColor(c, -20);
                ctx.beginPath();
                ctx.moveTo(-7*s, -14*s);
                ctx.lineTo(7*s, -14*s);
                ctx.lineTo(5*s, -10*s);
                ctx.lineTo(-5*s, -10*s);
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = shadeColor(c, -40);
                ctx.beginPath();
                ctx.moveTo(-3*s, -17*s);
                ctx.lineTo(3*s, -17*s);
                ctx.lineTo(4*s, -14*s);
                ctx.lineTo(-4*s, -14*s);
                ctx.closePath();
                ctx.fill();
                // 头冠金边
                ctx.strokeStyle = '#ffd700';
                ctx.lineWidth = 0.5 * s;
                ctx.beginPath();
                ctx.moveTo(-7*s, -14*s);
                ctx.lineTo(7*s, -14*s);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(-3*s, -17*s);
                ctx.lineTo(3*s, -17*s);
                ctx.stroke();
                // 金冠宝石（红光）
                ctx.fillStyle = '#ffd700';
                ctx.shadowColor = c;
                ctx.shadowBlur = 10;
                ctx.beginPath();
                ctx.arc(0, -16*s, 1.3*s, 0, Math.PI*2);
                ctx.fill();
                ctx.fillStyle = shadeColor(c, 20);
                ctx.beginPath();
                ctx.arc(0, -16*s, 0.7*s, 0, Math.PI*2);
                ctx.fill();
                ctx.shadowBlur = 0;
                // 头冠装饰珠
                ctx.fillStyle = '#ffd700';
                for (let i = 0; i < 3; i++) {
                    ctx.beginPath();
                    ctx.arc(-3*s + i*3*s, -12.5*s, 0.4*s, 0, Math.PI*2);
                    ctx.fill();
                }
                // 中心旋转六叶火焰（橙红核心）
                const spinT = t * 1.6;
                ctx.save();
                ctx.rotate(spinT);
                ctx.fillStyle = shadeColor(c, 30);
                ctx.shadowColor = shadeColor(c, -20);
                ctx.shadowBlur = 14;
                for (let i = 0; i < 6; i++) {
                    const a = i * Math.PI / 3;
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(Math.cos(a) * 4.5*s, Math.sin(a) * 4.5*s);
                    ctx.lineTo(Math.cos(a + Math.PI/6) * 1.2*s, Math.sin(a + Math.PI/6) * 1.2*s);
                    ctx.closePath();
                    ctx.fill();
                }
                ctx.restore();
                // 8道辐射光芒（火焰色）
                for (let i = 0; i < 8; i++) {
                    const a = i * Math.PI / 4 + t * 0.5;
                    ctx.strokeStyle = `rgba(${(h=>parseInt(h.slice(1,3),16)+","+parseInt(h.slice(3,5),16)+","+parseInt(h.slice(5,7),16))(shadeColor(c,30))}, ${0.4 + Math.sin(t*2 + i) * 0.25})`;
                    ctx.lineWidth = 1 * s;
                    ctx.shadowColor = shadeColor(c, 20);
                    ctx.shadowBlur = 8;
                    ctx.beginPath();
                    ctx.moveTo(Math.cos(a) * 13*s, Math.sin(a) * 13*s);
                    ctx.lineTo(Math.cos(a) * 18*s, Math.sin(a) * 18*s);
                    ctx.stroke();
                }
                // 火焰环绕（8个）
                for (let i = 0; i < 8; i++) {
                    const a = t * 1.8 + i * Math.PI * 2 / 8;
                    const r = 17 * s + Math.sin(t * 3 + i) * 1.5 * s;
                    const flicker = 0.5 + Math.sin(t * 5 + i * 2) * 0.3;
                    ctx.fillStyle = `rgba(${(h=>parseInt(h.slice(1,3),16)+","+parseInt(h.slice(3,5),16)+","+parseInt(h.slice(5,7),16))(c)}, ${flicker})`;
                    ctx.shadowColor = shadeColor(c, -20);
                    ctx.shadowBlur = 8;
                    ctx.beginPath();
                    ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 1.8 * s, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = `rgba(${(h=>parseInt(h.slice(1,3),16)+","+parseInt(h.slice(3,5),16)+","+parseInt(h.slice(5,7),16))(shadeColor(c,40))}, ${flicker * 0.7})`;
                    ctx.beginPath();
                    ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 1 * s, 0, Math.PI * 2);
                    ctx.fill();
                }
                // 红莲能量护盾（3层）
                for (let i = 0; i < 3; i++) {
                    const ringR = (22 + i*2) * s + Math.sin(t*2 + i) * 1.5 * s;
                    ctx.strokeStyle = `rgba(${(h=>parseInt(h.slice(1,3),16)+","+parseInt(h.slice(3,5),16)+","+parseInt(h.slice(5,7),16))(shadeColor(c,10))}, ${0.5 - i*0.15})`;
                    ctx.lineWidth = 0.5 * s;
                    ctx.beginPath();
                    ctx.arc(0, 0, ringR, 0, Math.PI*2);
                    ctx.stroke();
                }
                // 红色羽扇（背后）
                ctx.shadowBlur = 0;
                ctx.strokeStyle = '#8B4513';
                ctx.lineWidth = 1.4 * s;
                ctx.beginPath();
                ctx.moveTo(12*s, 0);
                ctx.lineTo(19*s, -7*s);
                ctx.stroke();
                // 扇面（红色）
                ctx.fillStyle = shadeColor(c, -20);
                ctx.beginPath();
                ctx.moveTo(19*s, -7*s);
                ctx.quadraticCurveTo(24*s, -13*s, 21*s, -17*s);
                ctx.quadraticCurveTo(16*s, -15*s, 12*s, -7*s);
                ctx.closePath();
                ctx.fill();
                // 扇面高光
                ctx.fillStyle = shadeColor(c, 10);
                ctx.beginPath();
                ctx.moveTo(19*s, -7*s);
                ctx.quadraticCurveTo(22*s, -12*s, 20*s, -15*s);
                ctx.quadraticCurveTo(17*s, -13*s, 14*s, -8*s);
                ctx.closePath();
                ctx.fill();
                // 扇骨
                ctx.strokeStyle = shadeColor(c, -40);
                ctx.lineWidth = 0.5 * s;
                for (let i = 0; i < 5; i++) {
                    ctx.beginPath();
                    const fa = -0.8 + i * 0.18;
                    ctx.moveTo(19*s, -7*s);
                    ctx.lineTo(22*s + Math.cos(fa) * 2.5*s, -17*s + Math.sin(fa) * 2.5*s);
                    ctx.stroke();
                }
                // 飘动的音符
                ctx.font = `bold ${4*s}px "Microsoft YaHei", sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const notes = ['♪', '♫', '♬'];
                for (let i = 0; i < 3; i++) {
                    const a = t * 1.2 + i * 2;
                    const r = 24 * s;
                    const px = Math.cos(a) * r;
                    const py = Math.sin(a * 0.8 + i) * (8*s + i * 4*s) - 5*s;
                    const alpha = 0.6 + Math.sin(t * 2 + i) * 0.3;
                    ctx.fillStyle = `rgba(${(h=>parseInt(h.slice(1,3),16)+","+parseInt(h.slice(3,5),16)+","+parseInt(h.slice(5,7),16))(shadeColor(c,40))}, ${alpha})`;
                    ctx.shadowColor = shadeColor(c, 20);
                    ctx.shadowBlur = 6;
                    ctx.fillText(notes[i], px, py);
                    ctx.shadowBlur = 0;
                }
                // 中心高亮宝石
                ctx.fillStyle = shadeColor(c, 30);
                ctx.shadowColor = shadeColor(c, -20);
                ctx.shadowBlur = 14;
                ctx.beginPath();
                ctx.arc(0, 0, 1.5 * s, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
            } else if (heroKey === 'lvmeng') {
                // ===== 吕蒙 - 青绿暗影刺客（无五官）：流线型暗甲+旋转刃核心+双匕首+暗影披风 =====
                ctx.shadowBlur = 0;
                // 暗影披风（外层三角形流动）— 皮肤系统：主体使用皮肤颜色
                ctx.fillStyle = shadeColor(c, -50);
                ctx.beginPath();
                ctx.moveTo(-14*s, -5*s);
                ctx.lineTo(-18*s, 16*s);
                ctx.lineTo(18*s, 16*s);
                ctx.lineTo(14*s, -5*s);
                ctx.closePath();
                ctx.fill();
                // 披风内层
                ctx.fillStyle = shadeColor(c, -50);
                ctx.beginPath();
                ctx.moveTo(-12*s, -5*s);
                ctx.lineTo(-15*s, 14*s);
                ctx.lineTo(15*s, 14*s);
                ctx.lineTo(12*s, -5*s);
                ctx.closePath();
                ctx.fill();
                // 披风纹理（暗影流线）
                ctx.strokeStyle = shadeColor(c, -40);
                ctx.lineWidth = 0.4 * s;
                for (let i = 0; i < 4; i++) {
                    ctx.beginPath();
                    ctx.moveTo(-8*s + i*4.5*s, -4*s);
                    ctx.lineTo(-10*s + i*4.5*s, 14*s);
                    ctx.stroke();
                }
                // 主体战甲（流线型菱形）
                ctx.fillStyle = shadeColor(c, -50);
                ctx.beginPath();
                ctx.moveTo(0, -10*s);
                ctx.lineTo(10*s, 0);
                ctx.lineTo(0, 12*s);
                ctx.lineTo(-10*s, 0);
                ctx.closePath();
                ctx.fill();
                // 战甲内层
                ctx.fillStyle = shadeColor(c, -30);
                ctx.beginPath();
                ctx.moveTo(0, -7*s);
                ctx.lineTo(7*s, 0);
                ctx.lineTo(0, 9*s);
                ctx.lineTo(-7*s, 0);
                ctx.closePath();
                ctx.fill();
                // 银色镶边
                ctx.strokeStyle = shadeColor(c, 40);
                ctx.lineWidth = 0.8 * s;
                ctx.beginPath();
                ctx.moveTo(0, -10*s);
                ctx.lineTo(10*s, 0);
                ctx.lineTo(0, 12*s);
                ctx.lineTo(-10*s, 0);
                ctx.closePath();
                ctx.stroke();
                // 中心旋转刃核心（四叶刃）
                const spinT = t * 2.5;
                ctx.save();
                ctx.rotate(spinT);
                ctx.fillStyle = c;
                ctx.shadowColor = c;
                ctx.shadowBlur = 14;
                for (let i = 0; i < 4; i++) {
                    const a = i * Math.PI / 2;
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(Math.cos(a) * 5*s, Math.sin(a) * 5*s);
                    ctx.lineTo(Math.cos(a + Math.PI/4) * 2*s, Math.sin(a + Math.PI/4) * 2*s);
                    ctx.closePath();
                    ctx.fill();
                }
                ctx.restore();
                // 中心亮宝石
                ctx.fillStyle = '#ffffff';
                ctx.shadowColor = c;
                ctx.shadowBlur = 12;
                ctx.beginPath();
                ctx.arc(0, 0, 1.5*s, 0, Math.PI*2);
                ctx.fill();
                ctx.shadowBlur = 0;
                // 双匕首（左肩+右肩）
                ctx.strokeStyle = shadeColor(c, 40);
                ctx.lineWidth = 1.5 * s;
                ctx.shadowColor = c;
                ctx.shadowBlur = 6;
                // 左匕首
                ctx.beginPath();
                ctx.moveTo(-11*s, -8*s);
                ctx.lineTo(-16*s, -14*s);
                ctx.stroke();
                ctx.fillStyle = c;
                ctx.beginPath();
                ctx.arc(-16*s, -14*s, 1*s, 0, Math.PI*2);
                ctx.fill();
                // 右匕首
                ctx.strokeStyle = shadeColor(c, 40);
                ctx.beginPath();
                ctx.moveTo(11*s, -8*s);
                ctx.lineTo(16*s, -14*s);
                ctx.stroke();
                ctx.fillStyle = c;
                ctx.beginPath();
                ctx.arc(16*s, -14*s, 1*s, 0, Math.PI*2);
                ctx.fill();
                ctx.shadowBlur = 0;
                // 头部兜帽（三角形暗影）
                ctx.fillStyle = shadeColor(c, -80);
                ctx.beginPath();
                ctx.moveTo(-8*s, -10*s);
                ctx.lineTo(0, -18*s);
                ctx.lineTo(8*s, -10*s);
                ctx.closePath();
                ctx.fill();
                // 兜帽银边
                ctx.strokeStyle = shadeColor(c, 40);
                ctx.lineWidth = 0.5 * s;
                ctx.beginPath();
                ctx.moveTo(-8*s, -10*s);
                ctx.lineTo(0, -18*s);
                ctx.lineTo(8*s, -10*s);
                ctx.stroke();
                // 兜帽顶宝石
                ctx.fillStyle = c;
                ctx.shadowColor = c;
                ctx.shadowBlur = 8;
                ctx.beginPath();
                ctx.arc(0, -18*s, 1.2*s, 0, Math.PI*2);
                ctx.fill();
                ctx.shadowBlur = 0;
                // 暗影粒子环绕（6个旋转粒子）
                for (let i = 0; i < 6; i++) {
                    const a = t * 2 + i * Math.PI / 3;
                    const r = 17 * s + Math.sin(t * 3 + i) * 1.5 * s;
                    const alpha = 0.4 + Math.sin(t * 4 + i) * 0.3;
                    ctx.fillStyle = `rgba(${(h=>parseInt(h.slice(1,3),16)+","+parseInt(h.slice(3,5),16)+","+parseInt(h.slice(5,7),16))(c)}, ${alpha})`;
                    ctx.shadowColor = c;
                    ctx.shadowBlur = 6;
                    ctx.beginPath();
                    ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 1.5 * s, 0, Math.PI * 2);
                    ctx.fill();
                }
                // 3层暗影护盾环
                for (let i = 0; i < 3; i++) {
                    const ringR = (22 + i*2) * s + Math.sin(t*2 + i) * 1.5 * s;
                    ctx.strokeStyle = `rgba(${(h=>parseInt(h.slice(1,3),16)+","+parseInt(h.slice(3,5),16)+","+parseInt(h.slice(5,7),16))(shadeColor(c,-10))}, ${0.5 - i*0.15})`;
                    ctx.lineWidth = 0.5 * s;
                    ctx.beginPath();
                    ctx.arc(0, 0, ringR, 0, Math.PI*2);
                    ctx.stroke();
                }
                ctx.shadowBlur = 0;
            } else if (heroKey === 'mozi') {
                // ===== 墨子 - 青白光学机关师（无五官）：六边形光学核心+镜面碎片环绕+机关臂甲+光学粒子 =====
                ctx.shadowBlur = 0;
                // 机关长袍（梯形）— 皮肤系统：主体使用皮肤颜色
                ctx.fillStyle = shadeColor(c, -40);
                ctx.beginPath();
                ctx.moveTo(-13*s, -4*s);
                ctx.lineTo(-16*s, 16*s);
                ctx.lineTo(16*s, 16*s);
                ctx.lineTo(13*s, -4*s);
                ctx.closePath();
                ctx.fill();
                // 长袍内层
                ctx.fillStyle = shadeColor(c, -60);
                ctx.beginPath();
                ctx.moveTo(-11*s, -4*s);
                ctx.lineTo(-13*s, 14*s);
                ctx.lineTo(13*s, 14*s);
                ctx.lineTo(11*s, -4*s);
                ctx.closePath();
                ctx.fill();
                // 长袍纹路（光学回路）
                ctx.strokeStyle = shadeColor(c, -40);
                ctx.lineWidth = 0.4 * s;
                for (let i = 0; i < 3; i++) {
                    ctx.beginPath();
                    ctx.moveTo(-9*s + i*7*s, -3*s);
                    ctx.lineTo(-11*s + i*7*s, 14*s);
                    ctx.stroke();
                }
                // 主体战甲（六边形——光学机关核心）
                ctx.fillStyle = shadeColor(c, -80);
                ctx.beginPath();
                for (let i = 0; i < 6; i++) {
                    const a = i * Math.PI / 3 - Math.PI / 2;
                    const px = Math.cos(a) * 11*s, py = Math.sin(a) * 11*s;
                    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                }
                ctx.closePath();
                ctx.fill();
                // 六边形银边
                ctx.strokeStyle = c;
                ctx.lineWidth = 0.8 * s;
                ctx.beginPath();
                for (let i = 0; i < 6; i++) {
                    const a = i * Math.PI / 3 - Math.PI / 2;
                    const px = Math.cos(a) * 11*s, py = Math.sin(a) * 11*s;
                    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                }
                ctx.closePath();
                ctx.stroke();
                // 中心旋转光学核心（六角星）
                const spinT = t * 2;
                ctx.save();
                ctx.rotate(spinT);
                ctx.fillStyle = c;
                ctx.shadowColor = c;
                ctx.shadowBlur = 16;
                for (let i = 0; i < 6; i++) {
                    const a = i * Math.PI / 3;
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(Math.cos(a) * 6*s, Math.sin(a) * 6*s);
                    ctx.lineTo(Math.cos(a + Math.PI/6) * 2.5*s, Math.sin(a + Math.PI/6) * 2.5*s);
                    ctx.closePath();
                    ctx.fill();
                }
                ctx.restore();
                // 中心亮宝石
                ctx.fillStyle = '#ffffff';
                ctx.shadowColor = c;
                ctx.shadowBlur = 14;
                ctx.beginPath();
                ctx.arc(0, 0, 1.8*s, 0, Math.PI*2);
                ctx.fill();
                ctx.shadowBlur = 0;
                // 双臂机关臂甲（左右）
                ctx.strokeStyle = c2;
                ctx.lineWidth = 1.6 * s;
                ctx.shadowColor = c;
                ctx.shadowBlur = 6;
                // 左臂
                ctx.beginPath();
                ctx.moveTo(-10*s, -2*s);
                ctx.lineTo(-15*s, 6*s);
                ctx.stroke();
                ctx.fillStyle = c;
                ctx.beginPath();
                ctx.arc(-15*s, 6*s, 1.2*s, 0, Math.PI*2);
                ctx.fill();
                // 右臂
                ctx.strokeStyle = c2;
                ctx.beginPath();
                ctx.moveTo(10*s, -2*s);
                ctx.lineTo(15*s, 6*s);
                ctx.stroke();
                ctx.fillStyle = c;
                ctx.beginPath();
                ctx.arc(15*s, 6*s, 1.2*s, 0, Math.PI*2);
                ctx.fill();
                ctx.shadowBlur = 0;
                // 头部机关冠（六边形头冠）
                ctx.fillStyle = shadeColor(c, -80);
                ctx.beginPath();
                for (let i = 0; i < 6; i++) {
                    const a = i * Math.PI / 3 - Math.PI / 2;
                    const px = Math.cos(a) * 8*s, py = Math.sin(a) * 8*s - 12*s;
                    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                }
                ctx.closePath();
                ctx.fill();
                // 头冠银边
                ctx.strokeStyle = c;
                ctx.lineWidth = 0.6 * s;
                ctx.beginPath();
                for (let i = 0; i < 6; i++) {
                    const a = i * Math.PI / 3 - Math.PI / 2;
                    const px = Math.cos(a) * 8*s, py = Math.sin(a) * 8*s - 12*s;
                    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                }
                ctx.closePath();
                ctx.stroke();
                // 头冠顶宝石
                ctx.fillStyle = c;
                ctx.shadowColor = c;
                ctx.shadowBlur = 10;
                ctx.beginPath();
                ctx.arc(0, -20*s, 1.4*s, 0, Math.PI*2);
                ctx.fill();
                ctx.shadowBlur = 0;
                // ===== 4片镜面碎片环绕（暗示折射机制） =====
                for (let i = 0; i < 4; i++) {
                    const a = t * 1.5 + i * Math.PI / 2;
                    const r = 19 * s;
                    const mx = Math.cos(a) * r, my = Math.sin(a) * r;
                    ctx.save();
                    ctx.translate(mx, my);
                    ctx.rotate(a + Math.PI/4);
                    ctx.fillStyle = `rgba(${(h=>parseInt(h.slice(1,3),16)+","+parseInt(h.slice(3,5),16)+","+parseInt(h.slice(5,7),16))(c)}, ${0.6 + Math.sin(t*3+i)*0.2})`;
                    ctx.shadowColor = c;
                    ctx.shadowBlur = 8;
                    ctx.beginPath();
                    ctx.moveTo(0, -3*s);
                    ctx.lineTo(2*s, 0);
                    ctx.lineTo(0, 3*s);
                    ctx.lineTo(-2*s, 0);
                    ctx.closePath();
                    ctx.fill();
                    ctx.restore();
                }
                // 光学粒子环绕（8个旋转光点）
                for (let i = 0; i < 8; i++) {
                    const a = t * 2.5 + i * Math.PI / 4;
                    const r = 24 * s + Math.sin(t * 3 + i) * 1.5 * s;
                    const alpha = 0.4 + Math.sin(t * 4 + i) * 0.3;
                    ctx.fillStyle = `rgba(${(h=>parseInt(h.slice(1,3),16)+","+parseInt(h.slice(3,5),16)+","+parseInt(h.slice(5,7),16))(c2)}, ${alpha})`;
                    ctx.shadowColor = c;
                    ctx.shadowBlur = 5;
                    ctx.beginPath();
                    ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 1.2 * s, 0, Math.PI * 2);
                    ctx.fill();
                }
                // 3层光学护盾环
                for (let i = 0; i < 3; i++) {
                    const ringR = (22 + i*2) * s + Math.sin(t*2 + i) * 1.5 * s;
                    ctx.strokeStyle = `rgba(${(h=>parseInt(h.slice(1,3),16)+","+parseInt(h.slice(3,5),16)+","+parseInt(h.slice(5,7),16))(c)}, ${0.5 - i*0.15})`;
                    ctx.lineWidth = 0.5 * s;
                    ctx.beginPath();
                    ctx.arc(0, 0, ringR, 0, Math.PI*2);
                    ctx.stroke();
                }
                ctx.shadowBlur = 0;
            } else if (heroKey === 'hanfei') {
                // ===== 韩非 - 灰色几何法家（无五官）：双层菱形灰甲+黑色雾气核心+律令卷轴+灰色辐射 =====
                ctx.shadowBlur = 0;
                // 外层菱形灰甲（深灰）
                const drawDiamond = (cx, cy, r, fill, stroke) => {
                    ctx.beginPath();
                    ctx.moveTo(cx, cy - r);
                    ctx.lineTo(cx + r, cy);
                    ctx.lineTo(cx, cy + r);
                    ctx.lineTo(cx - r, cy);
                    ctx.closePath();
                    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
                    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5 * s; ctx.stroke(); }
                };
                drawDiamond(0, 0, 13*s, shadeColor(c, -30), shadeColor(c, -70));
                // 内层菱形（中灰高光）
                drawDiamond(0, 0, 9*s, shadeColor(c, 5), null);
                // 中心黑色雾气核心（旋转的暗灰烟雾团 - 5层叠加圆）
                const spinT = -t * 2;
                ctx.save();
                ctx.rotate(spinT);
                for (let i = 0; i < 5; i++) {
                    const a = (i / 5) * Math.PI * 2;
                    const r = 4 * s + Math.sin(t * 3 + i) * 1 * s;
                    ctx.fillStyle = `rgba(${(h=>parseInt(h.slice(1,3),16)+","+parseInt(h.slice(3,5),16)+","+parseInt(h.slice(5,7),16))(c)}, 0.85)`;
                    ctx.shadowColor = '#000000';
                    ctx.shadowBlur = 10;
                    ctx.beginPath();
                    ctx.arc(Math.cos(a) * 2*s, Math.sin(a) * 2*s, r, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
                // 中心高亮宝石（白色律令之眼）
                ctx.fillStyle = '#ffffff';
                ctx.shadowColor = c;
                ctx.shadowBlur = 12;
                ctx.beginPath();
                ctx.arc(0, 0, 1.5 * s, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
                // 8道辐射光芒（灰色律令之光）
                for (let i = 0; i < 8; i++) {
                    const a = i * Math.PI / 4 + t * 0.4;
                    ctx.strokeStyle = `rgba(${(h=>parseInt(h.slice(1,3),16)+","+parseInt(h.slice(3,5),16)+","+parseInt(h.slice(5,7),16))(shadeColor(c,30))}, ${0.4 + Math.sin(t*2 + i)*0.25})`;
                    ctx.lineWidth = 0.8 * s;
                    ctx.shadowColor = shadeColor(c, -10);
                    ctx.shadowBlur = 6;
                    ctx.beginPath();
                    ctx.moveTo(Math.cos(a) * 14*s, Math.sin(a) * 14*s);
                    ctx.lineTo(Math.cos(a) * 18*s, Math.sin(a) * 18*s);
                    ctx.stroke();
                }
                // 灰色律令粒子（5道，环绕飘动）
                for (let i = 0; i < 5; i++) {
                    const a = t * 4 + i * Math.PI * 2 / 5;
                    ctx.strokeStyle = `rgba(${(h=>parseInt(h.slice(1,3),16)+","+parseInt(h.slice(3,5),16)+","+parseInt(h.slice(5,7),16))(c)}, ${0.9 - i * 0.15})`;
                    ctx.lineWidth = 1.5 * s;
                    ctx.beginPath();
                    const r1 = 21*s, r2 = 16*s, r3 = 11*s;
                    const a1 = a, a2 = a + 0.3, a3 = a + 0.1;
                    ctx.shadowColor = shadeColor(c, -20);
                    ctx.shadowBlur = 8;
                    ctx.moveTo(Math.cos(a1) * r1, Math.sin(a1) * r1);
                    ctx.lineTo(Math.cos(a2) * r2, Math.sin(a2) * r2);
                    ctx.lineTo(Math.cos(a3) * r3, Math.sin(a3) * r3);
                    ctx.stroke();
                }
                // 3层灰色护盾环（脉动）
                for (let i = 0; i < 3; i++) {
                    const ringR = (22 + i*2) * s + Math.sin(t*2.5 + i) * 1.5 * s;
                    ctx.strokeStyle = `rgba(${(h=>parseInt(h.slice(1,3),16)+","+parseInt(h.slice(3,5),16)+","+parseInt(h.slice(5,7),16))(shadeColor(c,-20))}, ${0.5 - i*0.15})`;
                    ctx.lineWidth = 0.5 * s;
                    ctx.beginPath();
                    ctx.arc(0, 0, ringR, 0, Math.PI*2);
                    ctx.stroke();
                }
                // 律令卷轴（斜插，灰白色）
                ctx.shadowBlur = 0;
                ctx.strokeStyle = shadeColor(c, 30);
                ctx.lineWidth = 2 * s;
                ctx.beginPath();
                ctx.moveTo(-10*s, 10*s);
                ctx.lineTo(10*s, -10*s);
                ctx.stroke();
                // 卷轴顶端（灰白三角 - 律令笔尖）
                ctx.fillStyle = shadeColor(c, 40);
                ctx.beginPath();
                ctx.moveTo(10*s, -10*s);
                ctx.lineTo(15*s, -14*s);
                ctx.lineTo(13*s, -7*s);
                ctx.closePath();
                ctx.fill();
                // 卷轴顶端灰色高光
                ctx.fillStyle = shadeColor(c, 10);
                ctx.beginPath();
                ctx.moveTo(10.5*s, -10.5*s);
                ctx.lineTo(13*s, -12*s);
                ctx.lineTo(12*s, -9*s);
                ctx.closePath();
                ctx.fill();
                // 灰色飘带（飘动 - 律令绸带）
                ctx.strokeStyle = shadeColor(c, -10);
                ctx.lineWidth = 2 * s;
                ctx.shadowColor = shadeColor(c, -10);
                ctx.shadowBlur = 6;
                ctx.beginPath();
                const eSway = Math.sin(t * 4) * 3 * s;
                ctx.moveTo(0, 0);
                ctx.quadraticCurveTo(8*s, -7*s, 12*s + eSway, -3*s);
                ctx.stroke();
                ctx.shadowBlur = 0;
            }
            // ===== 原创角色1：司马懿 - 天蓝几何天空之主（无五官）：六边形风甲+旋转风核+风翼+风印指示 =====
            else if (heroKey === 'cangqiong') {
                // ===== 司马懿 - 天空之主·风雷掌控（无五官）：天蓝流风长袍+风冠+风雷权杖+三翼风核+环绕风印 =====
                ctx.shadowBlur = 0;
                const skyWhite = '#e0f7ff';
                const thunderGold = '#ffff55';
                // 外层流风长袍（带飘逸下摆）
                ctx.fillStyle = shadeColor(c, -50);
                ctx.beginPath();
                ctx.moveTo(-15*s, -6*s);
                ctx.quadraticCurveTo(-20*s, 6*s, -16*s, 18*s);
                ctx.lineTo(16*s, 18*s);
                ctx.quadraticCurveTo(20*s, 6*s, 15*s, -6*s);
                ctx.closePath();
                ctx.fill();
                // 内层长袍
                ctx.fillStyle = shadeColor(c, -30);
                ctx.beginPath();
                ctx.moveTo(-11*s, -5*s);
                ctx.quadraticCurveTo(-14*s, 6*s, -11*s, 16*s);
                ctx.lineTo(11*s, 16*s);
                ctx.quadraticCurveTo(14*s, 6*s, 11*s, -5*s);
                ctx.closePath();
                ctx.fill();
                // 风纹飘带
                ctx.strokeStyle = shadeColor(c, 20);
                ctx.lineWidth = 0.5 * s;
                for (let i = 0; i < 4; i++) {
                    const yy = -2*s + i * 5*s;
                    ctx.beginPath();
                    ctx.moveTo(-9*s, yy);
                    ctx.quadraticCurveTo(0, yy + 2*s, 9*s, yy + Math.sin(t*3 + i)*1.5*s);
                    ctx.stroke();
                }
                // 主体风甲（倒梯形+菱形胸甲）
                ctx.fillStyle = shadeColor(c, -35);
                ctx.beginPath();
                ctx.moveTo(-11*s, -5*s);
                ctx.lineTo(-7*s, 14*s);
                ctx.lineTo(7*s, 14*s);
                ctx.lineTo(11*s, -5*s);
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = shadeColor(c, -10);
                ctx.beginPath();
                ctx.moveTo(0, -7*s);
                ctx.lineTo(8*s, 2*s);
                ctx.lineTo(0, 12*s);
                ctx.lineTo(-8*s, 2*s);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = skyWhite;
                ctx.lineWidth = 0.8 * s;
                ctx.stroke();
                // 右侧风雷权杖
                ctx.save();
                ctx.translate(14*s, 2*s);
                ctx.rotate(Math.sin(t*0.7) * 0.08);
                // 杖身
                const staffGrad = ctx.createLinearGradient(-2*s, -16*s, 2*s, 16*s);
                staffGrad.addColorStop(0, skyWhite);
                staffGrad.addColorStop(0.5, c);
                staffGrad.addColorStop(1, shadeColor(c, -30));
                ctx.fillStyle = staffGrad;
                ctx.shadowColor = c;
                ctx.shadowBlur = 10;
                ctx.beginPath();
                ctx.moveTo(-1.5*s, -18*s);
                ctx.lineTo(1.5*s, -18*s);
                ctx.lineTo(2*s, 16*s);
                ctx.lineTo(-2*s, 16*s);
                ctx.closePath();
                ctx.fill();
                // 杖顶风环
                ctx.save();
                ctx.translate(0, -18*s);
                ctx.rotate(t * 3);
                ctx.strokeStyle = thunderGold;
                ctx.lineWidth = 1.0 * s;
                ctx.beginPath();
                ctx.arc(0, 0, 4.5*s, 0, Math.PI*1.7);
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(0, 0, 2.8*s, Math.PI, Math.PI*2.7);
                ctx.stroke();
                ctx.restore();
                // 杖顶宝石
                ctx.fillStyle = thunderGold;
                ctx.beginPath();
                ctx.arc(0, -18*s, 1.6*s, 0, Math.PI*2);
                ctx.fill();
                ctx.restore();
                ctx.shadowBlur = 0;
                // 中心三翼风核（旋转）
                const spinT = t * 2.5;
                ctx.save();
                ctx.rotate(spinT);
                ctx.fillStyle = c;
                ctx.shadowColor = c;
                ctx.shadowBlur = 18;
                for (let i = 0; i < 3; i++) {
                    const a = i * Math.PI * 2 / 3;
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.quadraticCurveTo(Math.cos(a + 0.5) * 5*s, Math.sin(a + 0.5) * 5*s, Math.cos(a) * 8.5*s, Math.sin(a) * 8.5*s);
                    ctx.quadraticCurveTo(Math.cos(a - 0.3) * 3.5*s, Math.sin(a - 0.3) * 3.5*s, 0, 0);
                    ctx.fill();
                }
                ctx.restore();
                // 核心宝石
                ctx.fillStyle = '#ffffff';
                ctx.shadowColor = c;
                ctx.shadowBlur = 14;
                ctx.beginPath();
                ctx.arc(0, 0, 2.2*s, 0, Math.PI*2);
                ctx.fill();
                ctx.shadowBlur = 0;
                // 头部风冠（兜帽+三羽）
                ctx.fillStyle = shadeColor(c, -65);
                ctx.beginPath();
                ctx.moveTo(-8*s, -9*s);
                ctx.lineTo(0, -21*s);
                ctx.lineTo(8*s, -9*s);
                ctx.lineTo(5*s, -4*s);
                ctx.lineTo(-5*s, -4*s);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = skyWhite;
                ctx.lineWidth = 0.6 * s;
                ctx.stroke();
                // 风冠三羽
                ctx.fillStyle = c;
                ctx.shadowColor = c;
                ctx.shadowBlur = 12;
                for (let i = -1; i <= 1; i++) {
                    const ox = i * 3.3*s;
                    const h = 5*s + Math.sin(t * 5 + i) * 1*s;
                    ctx.beginPath();
                    ctx.moveTo(ox - 2*s, -12*s);
                    ctx.quadraticCurveTo(ox, -12*s - h * 0.6, ox, -12*s - h);
                    ctx.quadraticCurveTo(ox, -12*s - h * 0.6, ox + 2*s, -12*s);
                    ctx.closePath();
                    ctx.fill();
                }
                ctx.shadowBlur = 0;
                // 环绕风印（5个旋转符文）
                for (let i = 0; i < 5; i++) {
                    const a = t * 1.5 + i * Math.PI * 2 / 5;
                    const r = 19*s + Math.sin(t*2 + i)*1.5*s;
                    ctx.fillStyle = skyWhite;
                    ctx.shadowColor = c;
                    ctx.shadowBlur = 8;
                    ctx.save();
                    ctx.translate(Math.cos(a)*r, Math.sin(a)*r);
                    ctx.rotate(a + t);
                    ctx.beginPath();
                    for (let j = 0; j < 3; j++) {
                        const b = j * Math.PI * 2 / 3;
                        ctx.lineTo(Math.cos(b)*2*s, Math.sin(b)*2*s);
                    }
                    ctx.closePath();
                    ctx.fill();
                    ctx.restore();
                }
                ctx.shadowBlur = 0;
                // 3层旋转风环
                ctx.strokeStyle = shadeColor(c, 10);
                ctx.lineWidth = 0.5 * s;
                for (let i = 0; i < 3; i++) {
                    const a = i * (Math.PI * 2 / 3) - t * (i % 2 === 0 ? 1.5 : -1.5);
                    ctx.beginPath();
                    ctx.arc(0, 0, 16*s + i*s, a, a + Math.PI / 3);
                    ctx.stroke();
                }
                // 风之印记计数（外圈小点）
                if (cangqiongSkillCount > 0) {
                    ctx.fillStyle = thunderGold;
                    ctx.shadowColor = c;
                    ctx.shadowBlur = 8;
                    for (let i = 0; i < cangqiongSkillCount; i++) {
                        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
                        ctx.beginPath();
                        ctx.arc(Math.cos(a) * 17*s, Math.sin(a) * 17*s, 1.6*s, 0, Math.PI*2);
                        ctx.fill();
                    }
                    ctx.shadowBlur = 0;
                }
                // 飞行状态：天蓝羽翼展开
                if (cangqiongFlyingTimer > 0) {
                    ctx.strokeStyle = skyWhite;
                    ctx.lineWidth = 1.4 * s;
                    ctx.shadowColor = c;
                    ctx.shadowBlur = 18;
                    const flap = Math.sin(t * 10) * 0.35;
                    for (let side = -1; side <= 1; side += 2) {
                        for (let i = 0; i < 4; i++) {
                            ctx.beginPath();
                            ctx.moveTo(side * 3*s, -3*s + i*3*s);
                            ctx.quadraticCurveTo(
                                side * (14 + i*3)*s,
                                (-8 + i*4)*s + flap*6*s,
                                side * (20 + i*2)*s,
                                (0 + i*5)*s
                            );
                            ctx.stroke();
                        }
                    }
                    ctx.shadowBlur = 0;
                }
                // 风之印记加速光环
                if (cangqiongWindMarkTimer > 0) {
                    ctx.strokeStyle = thunderGold;
                    ctx.lineWidth = 1.6 * s;
                    ctx.shadowColor = thunderGold;
                    ctx.shadowBlur = 18;
                    ctx.setLineDash([4*s, 2*s]);
                    ctx.lineDashOffset = -t * 40;
                    ctx.beginPath();
                    ctx.arc(0, 0, 21*s + Math.sin(t*10)*2*s, 0, Math.PI*2);
                    ctx.stroke();
                    ctx.setLineDash([]);
                    ctx.shadowBlur = 0;
                }
                // 天罚之雷：金色雷电光环+闪电（风暴之眼）
                if (cangqiongThunderStormTimer > 0) {
                    const stormPulse = 1 + Math.sin(t * 10) * 0.1;
                    // 外层旋转风暴环
                    ctx.strokeStyle = thunderGold;
                    ctx.lineWidth = 2.2 * s;
                    ctx.shadowColor = thunderGold;
                    ctx.shadowBlur = 30;
                    ctx.setLineDash([4*s, 3*s]);
                    ctx.lineDashOffset = -t * 60;
                    ctx.beginPath();
                    ctx.arc(0, 0, (26*s + Math.sin(t*8)*3*s) * stormPulse, 0, Math.PI*2);
                    ctx.stroke();
                    ctx.setLineDash([2*s, 4*s]);
                    ctx.lineDashOffset = t * 45;
                    ctx.beginPath();
                    ctx.arc(0, 0, 21*s + Math.cos(t*6)*2*s, 0, Math.PI*2);
                    ctx.stroke();
                    ctx.setLineDash([]);
                    // 8道放射状闪电
                    for (let i = 0; i < 8; i++) {
                        const a = i * Math.PI / 4 + t * 3 + Math.sin(t*4 + i) * 0.15;
                        const r1 = 12 * s, r2 = 18 * s, r3 = 25 * s;
                        ctx.beginPath();
                        ctx.moveTo(Math.cos(a)*r1, Math.sin(a)*r1);
                        ctx.lineTo(Math.cos(a+0.25)*r2, Math.sin(a+0.25)*r2);
                        ctx.lineTo(Math.cos(a-0.12)*r3, Math.sin(a-0.12)*r3);
                        ctx.lineTo(Math.cos(a+0.08)*r2, Math.sin(a+0.08)*r2);
                        ctx.stroke();
                    }
                    // 中心雷核
                    ctx.fillStyle = '#ffffff';
                    ctx.beginPath();
                    ctx.arc(0, 0, (3.5*s + Math.sin(t*12)*0.8*s) * stormPulse, 0, Math.PI*2);
                    ctx.fill();
                    ctx.shadowBlur = 0;
                }
            }
            else if (heroKey === 'jin') {
                // ===== 典韦 - 灰烬武者·牺牲觉醒（无五官）：暗红烬甲+烬盔+交叉巨斧+灰烬核心+烈焰觉醒 =====
                ctx.shadowBlur = 0;
                const emberGold = '#ffaa00';
                const ashGray = '#555555';
                const emberOrange = '#ff6600';
                const isBurning = jinEmberBurnTimer > 0;
                // 外层灰烬披风（破碎下摆）
                ctx.fillStyle = shadeColor(c, -60);
                ctx.beginPath();
                ctx.moveTo(-16*s, -5*s);
                ctx.lineTo(-20*s, 18*s);
                ctx.lineTo(-13*s, 14*s);
                ctx.lineTo(-7*s, 19*s);
                ctx.lineTo(0, 14*s);
                ctx.lineTo(7*s, 19*s);
                ctx.lineTo(13*s, 14*s);
                ctx.lineTo(20*s, 18*s);
                ctx.lineTo(16*s, -5*s);
                ctx.closePath();
                ctx.fill();
                // 内层披风
                ctx.fillStyle = shadeColor(c, -45);
                ctx.beginPath();
                ctx.moveTo(-12*s, -4*s);
                ctx.lineTo(-15*s, 16*s);
                ctx.lineTo(0, 18*s);
                ctx.lineTo(15*s, 16*s);
                ctx.lineTo(12*s, -4*s);
                ctx.closePath();
                ctx.fill();
                // 披风裂纹纹理
                ctx.strokeStyle = ashGray;
                ctx.lineWidth = 0.5 * s;
                for (let i = 0; i < 5; i++) {
                    ctx.beginPath();
                    ctx.moveTo(-9*s + i*4.5*s, -2*s);
                    ctx.lineTo(-8*s + i*4.5*s, 16*s);
                    ctx.stroke();
                }
                // 躯干重甲（倒梯形+菱形胸甲）
                ctx.fillStyle = shadeColor(c, -35);
                ctx.beginPath();
                ctx.moveTo(-12*s, -5*s);
                ctx.lineTo(-8*s, 14*s);
                ctx.lineTo(8*s, 14*s);
                ctx.lineTo(12*s, -5*s);
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = shadeColor(c, -10);
                ctx.beginPath();
                ctx.moveTo(0, -7*s);
                ctx.lineTo(9*s, 2*s);
                ctx.lineTo(0, 12*s);
                ctx.lineTo(-9*s, 2*s);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = emberGold;
                ctx.lineWidth = 0.9 * s;
                ctx.stroke();
                // 交叉巨斧（背后）
                ctx.save();
                ctx.strokeStyle = ashGray;
                ctx.lineWidth = 2.4 * s;
                ctx.shadowColor = c;
                ctx.shadowBlur = 8;
                // 斧柄
                ctx.beginPath();
                ctx.moveTo(-17*s, -12*s);
                ctx.lineTo(-3*s, 4*s);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(17*s, -12*s);
                ctx.lineTo(3*s, 4*s);
                ctx.stroke();
                // 斧刃
                ctx.fillStyle = shadeColor(c, 20);
                ctx.beginPath();
                ctx.moveTo(-17*s, -12*s);
                ctx.lineTo(-23*s, -19*s);
                ctx.lineTo(-15*s, -21*s);
                ctx.closePath();
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(17*s, -12*s);
                ctx.lineTo(23*s, -19*s);
                ctx.lineTo(15*s, -21*s);
                ctx.closePath();
                ctx.fill();
                // 斧刃高光
                ctx.strokeStyle = emberGold;
                ctx.lineWidth = 0.6 * s;
                ctx.beginPath();
                ctx.moveTo(-19*s, -15*s);
                ctx.lineTo(-17*s, -19*s);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(19*s, -15*s);
                ctx.lineTo(17*s, -19*s);
                ctx.stroke();
                ctx.restore();
                ctx.shadowBlur = 0;
                // 中心灰烬核心（6刃旋转，随烬值填充）
                const emberRatio = Math.min(1, jinAttackStacks / 6);
                const coreColor = isBurning ? emberOrange : `rgb(${178 + emberRatio*77}, ${34 + emberRatio*100}, ${34})`;
                const spinT = t * 2.5;
                ctx.save();
                ctx.rotate(spinT);
                ctx.fillStyle = coreColor;
                ctx.shadowColor = coreColor;
                ctx.shadowBlur = 18;
                for (let i = 0; i < 6; i++) {
                    const a = i * Math.PI / 3;
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(Math.cos(a) * 7.5*s, Math.sin(a) * 7.5*s);
                    ctx.lineTo(Math.cos(a + Math.PI/6) * 3*s, Math.sin(a + Math.PI/6) * 3*s);
                    ctx.closePath();
                    ctx.fill();
                }
                ctx.restore();
                // 核心宝石
                ctx.fillStyle = '#ffffff';
                ctx.shadowColor = coreColor;
                ctx.shadowBlur = 14;
                ctx.beginPath();
                ctx.arc(0, 0, 2.2*s, 0, Math.PI*2);
                ctx.fill();
                ctx.shadowBlur = 0;
                // 头部烬盔（带双角+面甲）
                ctx.fillStyle = isBurning ? emberOrange : shadeColor(c, -65);
                ctx.beginPath();
                ctx.moveTo(-7*s, -9*s);
                ctx.lineTo(-10*s, -21*s);
                ctx.lineTo(-4*s, -16*s);
                ctx.lineTo(0, -20*s);
                ctx.lineTo(4*s, -16*s);
                ctx.lineTo(10*s, -21*s);
                ctx.lineTo(7*s, -9*s);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = emberGold;
                ctx.lineWidth = 0.7 * s;
                ctx.stroke();
                // 盔顶宝石
                ctx.fillStyle = emberGold;
                ctx.shadowColor = emberGold;
                ctx.shadowBlur = 10;
                ctx.beginPath();
                ctx.arc(0, -20*s, 1.5*s, 0, Math.PI*2);
                ctx.fill();
                ctx.shadowBlur = 0;
                // 灰烬粒子环绕
                for (let i = 0; i < 6; i++) {
                    const a = t * 2 + i * Math.PI / 3;
                    const r = 19*s + Math.sin(t*3 + i)*2*s;
                    ctx.fillStyle = isBurning ? emberGold : ashGray;
                    ctx.shadowColor = c;
                    ctx.shadowBlur = 6;
                    ctx.beginPath();
                    ctx.arc(Math.cos(a)*r, Math.sin(a)*r, 1.6*s, 0, Math.PI*2);
                    ctx.fill();
                }
                ctx.shadowBlur = 0;
                // 普攻烬值指示（6段弧）
                if (jinAttackStacks > 0 && !isBurning) {
                    ctx.strokeStyle = emberGold;
                    ctx.lineWidth = 1.6 * s;
                    ctx.shadowColor = c;
                    ctx.shadowBlur = 10;
                    for (let i = 0; i < jinAttackStacks; i++) {
                        const startA = -Math.PI/2 + i * (Math.PI * 2 / 6);
                        const endA = startA + Math.PI * 2 / 6;
                        ctx.beginPath();
                        ctx.arc(0, 0, 18*s, startA, endA);
                        ctx.stroke();
                    }
                    ctx.shadowBlur = 0;
                }
                // 烬燃觉醒：怒焰形态
                if (isBurning) {
                    // 外环烈焰
                    ctx.strokeStyle = emberOrange;
                    ctx.lineWidth = 2.2 * s;
                    ctx.shadowColor = '#ff4400';
                    ctx.shadowBlur = 24;
                    ctx.beginPath();
                    ctx.arc(0, 0, 18*s + Math.sin(t*8)*2*s, 0, Math.PI*2);
                    ctx.stroke();
                    ctx.strokeStyle = emberGold;
                    ctx.lineWidth = 1.4 * s;
                    ctx.beginPath();
                    ctx.arc(0, 0, 22*s + Math.sin(t*6)*1.5*s, 0, Math.PI*2);
                    ctx.stroke();
                    ctx.shadowBlur = 0;
                    // 火焰翅膀
                    ctx.strokeStyle = emberOrange;
                    ctx.lineWidth = 1.8 * s;
                    ctx.shadowColor = '#ff4400';
                    ctx.shadowBlur = 20;
                    const wingFlap = Math.sin(t * 10) * 0.4;
                    for (let side = -1; side <= 1; side += 2) {
                        for (let i = 0; i < 4; i++) {
                            ctx.beginPath();
                            ctx.moveTo(side * 4*s, -3*s + i*3.5*s);
                            ctx.quadraticCurveTo(
                                side * (16 + i*3)*s,
                                (-8 + i*5)*s + wingFlap*6*s,
                                side * (22 + i*2)*s,
                                (1 + i*6)*s
                            );
                            ctx.stroke();
                        }
                    }
                    ctx.shadowBlur = 0;
                    // 火焰粒子
                    for (let i = 0; i < 10; i++) {
                        const a = t * 5 + i * Math.PI * 2 / 10;
                        const r = 20*s + Math.sin(t*8 + i)*2*s;
                        ctx.fillStyle = i % 2 === 0 ? emberOrange : emberGold;
                        ctx.shadowColor = '#ff4400';
                        ctx.shadowBlur = 10;
                        ctx.beginPath();
                        ctx.arc(Math.cos(a)*r, Math.sin(a)*r, 2.5*s, 0, Math.PI*2);
                        ctx.fill();
                    }
                    ctx.shadowBlur = 0;
                }
            }
            else if (heroKey === 'lan') {
                // ===== 鲁肃 - 水之法师 · 潮汐护盾（无五官）：多层水流法袍+旋转潮汐核+水滴法杖+环绕水环 =====
                ctx.shadowBlur = 0;
                // 潮汐披风（外层水滴轮廓）
                ctx.fillStyle = shadeColor(c, -50);
                ctx.beginPath();
                ctx.moveTo(0, -18*s);
                ctx.bezierCurveTo(16*s, -8*s, 18*s, 8*s, 0, 18*s);
                ctx.bezierCurveTo(-18*s, 8*s, -16*s, -8*s, 0, -18*s);
                ctx.closePath();
                ctx.fill();
                // 披风内层
                ctx.fillStyle = shadeColor(c, -40);
                ctx.beginPath();
                ctx.moveTo(0, -14*s);
                ctx.bezierCurveTo(12*s, -6*s, 14*s, 6*s, 0, 15*s);
                ctx.bezierCurveTo(-14*s, 6*s, -12*s, -6*s, 0, -14*s);
                ctx.closePath();
                ctx.fill();
                // 披风水纹
                ctx.strokeStyle = shadeColor(c, 30);
                ctx.lineWidth = 0.4 * s;
                for (let i = 0; i < 3; i++) {
                    const yy = -6*s + i*6*s;
                    ctx.beginPath();
                    ctx.moveTo(-8*s, yy);
                    ctx.quadraticCurveTo(0, yy + 2*s, 8*s, yy);
                    ctx.stroke();
                }
                // 主体法袍（水滴形战甲）
                ctx.fillStyle = shadeColor(c, -35);
                ctx.beginPath();
                ctx.moveTo(0, -12*s);
                ctx.bezierCurveTo(10*s, -4*s, 10*s, 8*s, 0, 14*s);
                ctx.bezierCurveTo(-10*s, 8*s, -10*s, -4*s, 0, -12*s);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = shadeColor(c, 40);
                ctx.lineWidth = 0.8 * s;
                ctx.stroke();
                // 法袍内层
                ctx.fillStyle = shadeColor(c, -10);
                ctx.beginPath();
                ctx.moveTo(0, -9*s);
                ctx.bezierCurveTo(7*s, -2*s, 7*s, 6*s, 0, 10*s);
                ctx.bezierCurveTo(-7*s, 6*s, -7*s, -2*s, 0, -9*s);
                ctx.closePath();
                ctx.fill();
                // 右侧水滴法杖
                ctx.save();
                ctx.translate(13*s, 4*s);
                ctx.rotate(Math.sin(t) * 0.08);
                ctx.strokeStyle = shadeColor(c, 40);
                ctx.lineWidth = 1.2 * s;
                ctx.beginPath();
                ctx.moveTo(0, -12*s);
                ctx.lineTo(0, 12*s);
                ctx.stroke();
                ctx.fillStyle = c;
                ctx.shadowColor = c;
                ctx.shadowBlur = 12;
                ctx.beginPath();
                ctx.moveTo(0, -12*s);
                ctx.bezierCurveTo(4*s, -16*s, 4*s, -22*s, 0, -24*s);
                ctx.bezierCurveTo(-4*s, -22*s, -4*s, -16*s, 0, -12*s);
                ctx.closePath();
                ctx.fill();
                ctx.shadowBlur = 0;
                ctx.restore();
                // 左侧悬浮水滴道具
                ctx.save();
                ctx.translate(-13*s, 2*s);
                ctx.fillStyle = shadeColor(c, 30);
                ctx.shadowColor = c;
                ctx.shadowBlur = 8;
                ctx.beginPath();
                ctx.moveTo(0, -3*s);
                ctx.bezierCurveTo(3*s, -1*s, 3*s, 3*s, 0, 4*s);
                ctx.bezierCurveTo(-3*s, 3*s, -3*s, -1*s, 0, -3*s);
                ctx.closePath();
                ctx.fill();
                ctx.shadowBlur = 0;
                ctx.restore();
                // 中心旋转潮汐核（四叶水花）
                const coreColor = lanShieldTimer > 0 ? shadeColor(c, 20) : c;
                const spinT = t * 2;
                ctx.save();
                ctx.rotate(spinT);
                ctx.fillStyle = coreColor;
                ctx.shadowColor = coreColor;
                ctx.shadowBlur = 16;
                for (let i = 0; i < 4; i++) {
                    const a = i * Math.PI / 2;
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.quadraticCurveTo(Math.cos(a + 0.4) * 4*s, Math.sin(a + 0.4) * 4*s, Math.cos(a) * 7*s, Math.sin(a) * 7*s);
                    ctx.quadraticCurveTo(Math.cos(a - 0.4) * 4*s, Math.sin(a - 0.4) * 4*s, 0, 0);
                    ctx.fill();
                }
                ctx.restore();
                // 中心水核宝石
                ctx.fillStyle = '#ffffff';
                ctx.shadowColor = coreColor;
                ctx.shadowBlur = 14;
                ctx.beginPath();
                ctx.arc(0, 0, 2*s, 0, Math.PI*2);
                ctx.fill();
                ctx.shadowBlur = 0;
                // 头部水冠（兜帽形+水滴尖）
                ctx.fillStyle = shadeColor(c, -55);
                ctx.beginPath();
                ctx.moveTo(-8*s, -10*s);
                ctx.lineTo(0, -20*s);
                ctx.lineTo(8*s, -10*s);
                ctx.lineTo(5*s, -4*s);
                ctx.lineTo(-5*s, -4*s);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = shadeColor(c, 40);
                ctx.lineWidth = 0.5 * s;
                ctx.stroke();
                // 水冠宝石
                ctx.fillStyle = c;
                ctx.shadowColor = c;
                ctx.shadowBlur = 10;
                ctx.beginPath();
                ctx.arc(0, -20*s, 1.3*s, 0, Math.PI*2);
                ctx.fill();
                ctx.shadowBlur = 0;
                // 环绕水粒子（6个旋转水滴）
                for (let i = 0; i < 6; i++) {
                    const a = t * 2 + i * Math.PI / 3;
                    const r = 17 * s + Math.sin(t * 3 + i) * 1.5 * s;
                    ctx.fillStyle = shadeColor(c, 20);
                    ctx.shadowColor = c;
                    ctx.shadowBlur = 6;
                    ctx.beginPath();
                    ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r - 1.5*s);
                    ctx.quadraticCurveTo(Math.cos(a) * r + 1.5*s, Math.sin(a) * r + 1*s, Math.cos(a) * r, Math.sin(a) * r + 2*s);
                    ctx.quadraticCurveTo(Math.cos(a) * r - 1.5*s, Math.sin(a) * r + 1*s, Math.cos(a) * r, Math.sin(a) * r - 1.5*s);
                    ctx.fill();
                }
                ctx.shadowBlur = 0;
                // 3层潮汐环
                ctx.strokeStyle = shadeColor(c, 20);
                ctx.lineWidth = 0.5 * s;
                for (let i = 0; i < 3; i++) {
                    const a = i * (Math.PI * 2 / 3) - t * 1.5;
                    ctx.beginPath();
                    ctx.arc(0, 0, 15*s, a, a + Math.PI / 3);
                    ctx.stroke();
                }
                // 潮汐护盾状态：碧蓝护盾光环
                if (lanShieldTimer > 0) {
                    ctx.strokeStyle = shadeColor(c, 30);
                    ctx.lineWidth = 1.5 * s;
                    ctx.shadowColor = c;
                    ctx.shadowBlur = 18;
                    ctx.setLineDash([5*s, 2*s]);
                    ctx.lineDashOffset = -t * 30;
                    ctx.beginPath();
                    ctx.arc(0, 0, 20*s, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.setLineDash([]);
                    ctx.shadowBlur = 0;
                    for (let i = 0; i < 6; i++) {
                        const a = i * Math.PI / 3 + t * 2;
                        ctx.fillStyle = '#ffffff';
                        ctx.shadowColor = c;
                        ctx.shadowBlur = 8;
                        ctx.beginPath();
                        ctx.arc(Math.cos(a) * 20*s, Math.sin(a) * 20*s, 1.8*s, 0, Math.PI*2);
                        ctx.fill();
                    }
                    ctx.shadowBlur = 0;
                }
                // 深海怒涛状态：碧蓝多层海浪光环 + 浪尖水花
                if (lanTsunamiTimer > 0) {
                    const waveAlpha = Math.min(1, lanTsunamiTimer / 60);
                    ctx.globalAlpha = waveAlpha;
                    ctx.strokeStyle = c;
                    ctx.lineWidth = 2.0 * s;
                    ctx.shadowColor = '#00CED1';
                    ctx.shadowBlur = 24;
                    ctx.setLineDash([6*s, 4*s]);
                    ctx.lineDashOffset = -t * 35;
                    ctx.beginPath();
                    ctx.arc(0, 0, 26*s + Math.sin(t*4)*3*s, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.strokeStyle = '#87CEEB';
                    ctx.lineWidth = 1.4 * s;
                    ctx.setLineDash([4*s, 5*s]);
                    ctx.lineDashOffset = t * 28;
                    ctx.beginPath();
                    ctx.arc(0, 0, 30*s + Math.cos(t*3)*2*s, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.setLineDash([]);
                    ctx.shadowBlur = 0;
                    // 浪尖水滴粒子
                    for (let i = 0; i < 8; i++) {
                        const wa = (i / 8) * Math.PI * 2 + t * 1.5;
                        const wr = 28*s + Math.sin(t * 5 + i) * 2*s;
                        ctx.fillStyle = '#ffffff';
                        ctx.shadowColor = c;
                        ctx.shadowBlur = 8;
                        ctx.beginPath();
                        ctx.arc(Math.cos(wa) * wr, Math.sin(wa) * wr, 1.6*s, 0, Math.PI*2);
                        ctx.fill();
                    }
                    ctx.shadowBlur = 0;
                    ctx.globalAlpha = 1;
                }
            }
            else if (heroKey === 'zhi') {
                // ===== 左慈 - 时空织者 · 维度操控（无五官）：星芒时钟长袍+齿轮核心+维度法球+时空环 =====
                ctx.shadowBlur = 0;
                // 星芒长袍（外层六角星轮廓）
                ctx.fillStyle = shadeColor(c, -55);
                ctx.beginPath();
                for (let i = 0; i < 12; i++) {
                    const a = i * Math.PI / 6 - Math.PI / 2;
                    const r = (i % 2 === 0) ? 16*s : 9*s;
                    const px = Math.cos(a) * r;
                    const py = Math.sin(a) * r;
                    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                }
                ctx.closePath();
                ctx.fill();
                // 长袍内层
                ctx.fillStyle = shadeColor(c, -40);
                ctx.beginPath();
                for (let i = 0; i < 12; i++) {
                    const a = i * Math.PI / 6 - Math.PI / 2;
                    const r = (i % 2 === 0) ? 12*s : 7*s;
                    const px = Math.cos(a) * r;
                    const py = Math.sin(a) * r;
                    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                }
                ctx.closePath();
                ctx.fill();
                // 长袍纹路（时钟刻度线）
                ctx.strokeStyle = shadeColor(c, 30);
                ctx.lineWidth = 0.4 * s;
                for (let i = 0; i < 6; i++) {
                    const a = i * Math.PI / 3 - Math.PI / 2;
                    ctx.beginPath();
                    ctx.moveTo(Math.cos(a) * 8*s, Math.sin(a) * 8*s);
                    ctx.lineTo(Math.cos(a) * 13*s, Math.sin(a) * 13*s);
                    ctx.stroke();
                }
                // 主体战甲（八边形时钟核心）
                ctx.fillStyle = shadeColor(c, -60);
                ctx.beginPath();
                for (let i = 0; i < 8; i++) {
                    const a = i * Math.PI / 4;
                    const px = Math.cos(a) * 10*s;
                    const py = Math.sin(a) * 10*s;
                    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                }
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = shadeColor(c, 40);
                ctx.lineWidth = 0.8 * s;
                ctx.stroke();
                // 战甲内层
                ctx.fillStyle = shadeColor(c, -25);
                ctx.beginPath();
                for (let i = 0; i < 8; i++) {
                    const a = i * Math.PI / 4;
                    const px = Math.cos(a) * 7*s;
                    const py = Math.sin(a) * 7*s;
                    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                }
                ctx.closePath();
                ctx.fill();
                // 右侧维度法球（悬浮时空球）
                ctx.save();
                ctx.translate(13*s, 3*s);
                const orbPulse = 1 + Math.sin(t * 3) * 0.12;
                ctx.scale(orbPulse, orbPulse);
                ctx.fillStyle = shadeColor(c, 10);
                ctx.shadowColor = c;
                ctx.shadowBlur = 14;
                ctx.beginPath();
                ctx.arc(0, 0, 4*s, 0, Math.PI*2);
                ctx.fill();
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 0.6 * s;
                ctx.beginPath();
                ctx.arc(0, 0, 2.5*s, 0, Math.PI*2);
                ctx.stroke();
                ctx.shadowBlur = 0;
                ctx.restore();
                // 左侧时钟法杖
                ctx.save();
                ctx.translate(-13*s, 4*s);
                ctx.rotate(Math.sin(t * 0.5) * 0.1);
                ctx.strokeStyle = shadeColor(c, 40);
                ctx.lineWidth = 1.2 * s;
                ctx.beginPath();
                ctx.moveTo(0, -10*s);
                ctx.lineTo(0, 12*s);
                ctx.stroke();
                ctx.fillStyle = shadeColor(c, -20);
                ctx.beginPath();
                ctx.arc(0, -10*s, 3.5*s, 0, Math.PI*2);
                ctx.fill();
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 0.6 * s;
                ctx.beginPath();
                ctx.moveTo(0, -10*s);
                ctx.lineTo(0, -12.5*s);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(0, -10*s);
                ctx.lineTo(2*s, -9*s);
                ctx.stroke();
                ctx.shadowBlur = 0;
                ctx.restore();
                // 中心旋转齿轮核心
                const spinT = t * 1.5;
                ctx.save();
                ctx.rotate(spinT);
                ctx.fillStyle = c;
                ctx.shadowColor = shadeColor(c, 20);
                ctx.shadowBlur = 16;
                ctx.beginPath();
                for (let i = 0; i < 8; i++) {
                    const a = i * Math.PI / 4;
                    if (i === 0) ctx.moveTo(Math.cos(a) * 7*s, Math.sin(a) * 7*s);
                    else ctx.lineTo(Math.cos(a) * 7*s, Math.sin(a) * 7*s);
                }
                ctx.closePath();
                ctx.fill();
                for (let i = 0; i < 8; i++) {
                    const a = i * Math.PI / 4;
                    ctx.beginPath();
                    ctx.moveTo(Math.cos(a) * 7*s, Math.sin(a) * 7*s);
                    ctx.lineTo(Math.cos(a) * 8.5*s, Math.sin(a) * 8.5*s);
                    ctx.lineTo(Math.cos(a + 0.2) * 8.5*s, Math.sin(a + 0.2) * 8.5*s);
                    ctx.lineTo(Math.cos(a + 0.2) * 7*s, Math.sin(a + 0.2) * 7*s);
                    ctx.fill();
                }
                ctx.restore();
                // 时钟指针
                ctx.save();
                ctx.rotate(t * 0.5);
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1.0 * s;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(0, -4*s);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(3*s, 2*s);
                ctx.stroke();
                ctx.restore();
                // 中心时空宝石
                ctx.fillStyle = '#ffffff';
                ctx.shadowColor = c;
                ctx.shadowBlur = 14;
                ctx.beginPath();
                ctx.arc(0, 0, 2*s, 0, Math.PI*2);
                ctx.fill();
                ctx.shadowBlur = 0;
                // 头部时空冠（兜帽+星角）
                ctx.fillStyle = shadeColor(c, -70);
                ctx.beginPath();
                ctx.moveTo(-7*s, -10*s);
                ctx.lineTo(0, -21*s);
                ctx.lineTo(7*s, -10*s);
                ctx.lineTo(4*s, -4*s);
                ctx.lineTo(-4*s, -4*s);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = shadeColor(c, 40);
                ctx.lineWidth = 0.5 * s;
                ctx.stroke();
                // 时空冠宝石
                ctx.fillStyle = c;
                ctx.shadowColor = c;
                ctx.shadowBlur = 10;
                ctx.beginPath();
                ctx.arc(0, -21*s, 1.3*s, 0, Math.PI*2);
                ctx.fill();
                ctx.shadowBlur = 0;
                // 环绕星点（6个）
                for (let i = 0; i < 6; i++) {
                    const a = t * 1.5 + i * Math.PI / 3;
                    const r = 17 * s + Math.sin(t * 2 + i) * 1.5 * s;
                    ctx.fillStyle = '#ffffff';
                    ctx.shadowColor = c;
                    ctx.shadowBlur = 6;
                    ctx.beginPath();
                    ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 1.5*s, 0, Math.PI*2);
                    ctx.fill();
                }
                ctx.shadowBlur = 0;
                // 3层旋转时空环
                ctx.strokeStyle = c;
                ctx.lineWidth = 0.5 * s;
                for (let i = 0; i < 3; i++) {
                    const a = i * (Math.PI * 2 / 3) + t * (i % 2 === 0 ? 1.2 : -1.2);
                    ctx.beginPath();
                    ctx.arc(0, 0, 15*s, a, a + Math.PI / 3);
                    ctx.stroke();
                }
                // 额外复活机会指示（外圈圆点：未用时显示）
                if (!zhiExtraReviveUsed) {
                    ctx.fillStyle = shadeColor(c, 20);
                    ctx.shadowColor = c;
                    ctx.shadowBlur = 10;
                    ctx.beginPath();
                    ctx.arc(0, -17*s, 2*s, 0, Math.PI*2);
                    ctx.fill();
                    ctx.shadowBlur = 0;
                }
                // 时间停滞状态：紫罗兰冻结光环
                if (zhiFreezeTimer > 0) {
                    ctx.strokeStyle = c;
                    ctx.lineWidth = 1.5 * s;
                    ctx.shadowColor = shadeColor(c, 20);
                    ctx.shadowBlur = 22;
                    ctx.setLineDash([2*s, 2*s]);
                    ctx.lineDashOffset = -t * 50;
                    ctx.beginPath();
                    ctx.arc(0, 0, 21*s + Math.sin(t*4)*2*s, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.setLineDash([]);
                    ctx.shadowBlur = 0;
                    for (let i = 0; i < 6; i++) {
                        const a = i * Math.PI / 3 + t * 0.3;
                        ctx.fillStyle = '#ffffff';
                        ctx.shadowColor = shadeColor(c, 20);
                        ctx.shadowBlur = 8;
                        ctx.beginPath();
                        ctx.arc(Math.cos(a) * 19*s, Math.sin(a) * 19*s, 1.5*s, 0, Math.PI*2);
                        ctx.fill();
                    }
                    ctx.shadowBlur = 0;
                }
                // 时空崩塌状态：紫罗兰裂隙光环
                if (zhiCollapseTimer > 0) {
                    ctx.strokeStyle = shadeColor(c, 20);
                    ctx.lineWidth = 1.2 * s;
                    ctx.shadowColor = c;
                    ctx.shadowBlur = 18;
                    ctx.beginPath();
                    ctx.arc(0, 0, 23*s + Math.sin(t*7)*3*s, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.shadowBlur = 0;
                }
            }
            else if (heroKey === 'yan') {
                // ===== 陆逊 - 烈焰之心·熔火战袍+炎剑+火焰核心 =====
                ctx.shadowBlur = 0;
                const flameGold = '#FFD700';
                // 外层烈焰披风（锯齿下摆）
                ctx.fillStyle = shadeColor(c, -55);
                ctx.beginPath();
                ctx.moveTo(-13*s, -7*s);
                ctx.lineTo(-17*s, 15*s);
                ctx.lineTo(-11*s, 11*s);
                ctx.lineTo(-6*s, 16*s);
                ctx.lineTo(0, 11*s);
                ctx.lineTo(6*s, 16*s);
                ctx.lineTo(11*s, 11*s);
                ctx.lineTo(17*s, 15*s);
                ctx.lineTo(13*s, -7*s);
                ctx.closePath();
                ctx.fill();
                // 披风内层
                ctx.fillStyle = shadeColor(c, -35);
                ctx.beginPath();
                ctx.moveTo(-10*s, -5*s);
                ctx.lineTo(-13*s, 13*s);
                ctx.lineTo(0, 16*s);
                ctx.lineTo(13*s, 13*s);
                ctx.lineTo(10*s, -5*s);
                ctx.closePath();
                ctx.fill();
                // 火焰纹理
                ctx.strokeStyle = shadeColor(c, -20);
                ctx.lineWidth = 0.5 * s;
                for (let i = 0; i < 5; i++) {
                    ctx.beginPath();
                    ctx.moveTo(-7*s + i * 3.5*s, -4*s);
                    ctx.lineTo(-9*s + i * 3.5*s, 13*s);
                    ctx.stroke();
                }
                // 熔金战甲（胸甲）
                ctx.fillStyle = shadeColor(c, -25);
                ctx.beginPath();
                ctx.moveTo(0, -9*s);
                ctx.lineTo(9*s, 1*s);
                ctx.lineTo(0, 12*s);
                ctx.lineTo(-9*s, 1*s);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = flameGold;
                ctx.lineWidth = 0.9 * s;
                ctx.stroke();
                // 战甲内层
                ctx.fillStyle = shadeColor(c, -5);
                ctx.beginPath();
                ctx.moveTo(0, -6*s);
                ctx.lineTo(6*s, 1*s);
                ctx.lineTo(0, 8*s);
                ctx.lineTo(-6*s, 1*s);
                ctx.closePath();
                ctx.fill();
                // 火焰核心（旋转六瓣）
                ctx.save();
                ctx.rotate(t * 3);
                ctx.fillStyle = c;
                ctx.shadowColor = c;
                ctx.shadowBlur = 16;
                for (let i = 0; i < 6; i++) {
                    const a = i * Math.PI / 3;
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(Math.cos(a) * 6*s, Math.sin(a) * 6*s);
                    ctx.lineTo(Math.cos(a + Math.PI/6) * 2.2*s, Math.sin(a + Math.PI/6) * 2.2*s);
                    ctx.closePath();
                    ctx.fill();
                }
                ctx.restore();
                // 中心炽烈宝石
                ctx.fillStyle = '#ffffff';
                ctx.shadowColor = flameGold;
                ctx.shadowBlur = 14;
                ctx.beginPath();
                ctx.arc(0, 0, 2*s, 0, Math.PI*2);
                ctx.fill();
                ctx.shadowBlur = 0;
                // 火焰剑（右侧斜背）
                ctx.save();
                ctx.translate(13*s, 0);
                ctx.rotate(Math.PI / 8);
                const bladeGrad = ctx.createLinearGradient(0, -12*s, 0, 10*s);
                bladeGrad.addColorStop(0, flameGold);
                bladeGrad.addColorStop(0.5, c);
                bladeGrad.addColorStop(1, shadeColor(c, -30));
                ctx.fillStyle = bladeGrad;
                ctx.shadowColor = c;
                ctx.shadowBlur = 10;
                ctx.beginPath();
                ctx.moveTo(0, -14*s);
                ctx.lineTo(3*s, 9*s);
                ctx.lineTo(0, 12*s);
                ctx.lineTo(-3*s, 9*s);
                ctx.closePath();
                ctx.fill();
                // 剑格
                ctx.fillStyle = flameGold;
                ctx.fillRect(-4*s, 8*s, 8*s, 1.5*s);
                ctx.restore();
                ctx.shadowBlur = 0;
                // 火羽饰件（左侧）
                ctx.strokeStyle = flameGold;
                ctx.lineWidth = 1.2 * s;
                for (let i = 0; i < 3; i++) {
                    const a = Math.PI * 0.75 + (i - 1) * 0.25;
                    ctx.beginPath();
                    ctx.arc(-10*s, -2*s, 6*s + i*s, a, a + 1.2);
                    ctx.stroke();
                }
                // 头部兜帽
                ctx.fillStyle = shadeColor(c, -75);
                ctx.beginPath();
                ctx.moveTo(-8*s, -8*s);
                ctx.lineTo(0, -19*s);
                ctx.lineTo(8*s, -8*s);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = flameGold;
                ctx.lineWidth = 0.6 * s;
                ctx.stroke();
                // 火焰王冠（三束火舌）
                ctx.fillStyle = c;
                ctx.shadowColor = c;
                ctx.shadowBlur = 12;
                for (let i = -1; i <= 1; i++) {
                    const ox = i * 3.2*s;
                    const h = 5*s + Math.sin(t * 7 + i) * 1.5*s;
                    ctx.beginPath();
                    ctx.moveTo(ox - 2*s, -12*s);
                    ctx.quadraticCurveTo(ox, -12*s - h * 0.6, ox, -12*s - h);
                    ctx.quadraticCurveTo(ox, -12*s - h * 0.6, ox + 2*s, -12*s);
                    ctx.closePath();
                    ctx.fill();
                }
                ctx.shadowBlur = 0;
                // 旋转余烬
                for (let i = 0; i < 6; i++) {
                    const a = t * 2.5 + i * Math.PI / 3;
                    const r = 18 * s + Math.sin(t * 4 + i) * 2 * s;
                    ctx.fillStyle = flameGold;
                    ctx.shadowColor = c;
                    ctx.shadowBlur = 8;
                    ctx.beginPath();
                    ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 1.2*s, 0, Math.PI*2);
                    ctx.fill();
                }
                ctx.shadowBlur = 0;
                // 焚身烈焰状态：多层火环+飞火星+脉冲核心（更醒目）
                if (yanBurnAuraTimer > 0) {
                    const auraPulse = 1 + Math.sin(t * 8) * 0.12;
                    // 外层烈焰环（橙红，粗线，强发光）
                    ctx.strokeStyle = '#FF4500';
                    ctx.lineWidth = 2.8 * s;
                    ctx.shadowColor = '#FF4500';
                    ctx.shadowBlur = 35;
                    ctx.setLineDash([4*s, 2*s]);
                    ctx.lineDashOffset = -t * 80;
                    ctx.beginPath();
                    ctx.arc(0, 0, (26*s + Math.sin(t*6)*3*s) * auraPulse, 0, Math.PI * 2);
                    ctx.stroke();
                    // 中层金焰环（反向旋转）
                    ctx.strokeStyle = '#FF8C00';
                    ctx.lineWidth = 2.2 * s;
                    ctx.shadowColor = '#FF8C00';
                    ctx.shadowBlur = 28;
                    ctx.setLineDash([3*s, 3*s]);
                    ctx.lineDashOffset = t * 60;
                    ctx.beginPath();
                    ctx.arc(0, 0, 30*s + Math.cos(t*5)*3*s, 0, Math.PI * 2);
                    ctx.stroke();
                    // 内层炽白环
                    ctx.strokeStyle = '#FFD700';
                    ctx.lineWidth = 1.8 * s;
                    ctx.shadowColor = '#FFD700';
                    ctx.shadowBlur = 22;
                    ctx.setLineDash([2*s, 4*s]);
                    ctx.lineDashOffset = -t * 45;
                    ctx.beginPath();
                    ctx.arc(0, 0, 22*s + Math.sin(t*7)*2*s, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.setLineDash([]);
                    // 16颗旋转飞火星（更大更亮）
                    for (let i = 0; i < 16; i++) {
                        const a = i * Math.PI / 8 + t * 4;
                        const rr = 28*s + Math.sin(t*6 + i)*3*s;
                        ctx.fillStyle = i % 2 === 0 ? '#FFD700' : '#FF4500';
                        ctx.shadowColor = ctx.fillStyle;
                        ctx.shadowBlur = 12;
                        ctx.beginPath();
                        ctx.arc(Math.cos(a)*rr, Math.sin(a)*rr, 2.2*s, 0, Math.PI*2);
                        ctx.fill();
                    }
                    // 中心脉冲火核
                    ctx.fillStyle = '#FF4500';
                    ctx.shadowColor = '#FF4500';
                    ctx.shadowBlur = 25;
                    ctx.beginPath();
                    ctx.arc(0, 0, (6*s + Math.sin(t*10)*1.5*s) * auraPulse, 0, Math.PI*2);
                    ctx.fill();
                    ctx.shadowBlur = 0;
                }
            }
            else if (heroKey === 'shuang') {
                // ===== 甄姬 - 寒冰女皇·霜袍+冰晶权杖+冰雪核心 =====
                ctx.shadowBlur = 0;
                const iceWhite = '#ffffff';
                // 外层霜雪长袍（扇贝下摆）
                ctx.fillStyle = shadeColor(c, -45);
                ctx.beginPath();
                ctx.moveTo(-13*s, -6*s);
                for (let i = 0; i <= 6; i++) {
                    const x = -13*s + i * (26*s / 6);
                    const y = (i % 2 === 0) ? 15*s : 11*s;
                    ctx.lineTo(x, y);
                }
                ctx.lineTo(13*s, -6*s);
                ctx.closePath();
                ctx.fill();
                // 内层冰蓝长裙
                ctx.fillStyle = shadeColor(c, -20);
                ctx.beginPath();
                ctx.moveTo(-9*s, -5*s);
                ctx.lineTo(-11*s, 13*s);
                ctx.lineTo(0, 16*s);
                ctx.lineTo(11*s, 13*s);
                ctx.lineTo(9*s, -5*s);
                ctx.closePath();
                ctx.fill();
                // 霜纹
                ctx.strokeStyle = iceWhite;
                ctx.globalAlpha = 0.35;
                ctx.lineWidth = 0.5 * s;
                for (let i = 0; i < 5; i++) {
                    ctx.beginPath();
                    ctx.moveTo(-6*s + i * 3*s, -4*s);
                    ctx.lineTo(-8*s + i * 3*s, 13*s);
                    ctx.stroke();
                }
                ctx.globalAlpha = 1;
                // 冰晶胸甲
                ctx.fillStyle = shadeColor(c, -5);
                ctx.beginPath();
                ctx.moveTo(0, -9*s);
                ctx.lineTo(8*s, 0);
                ctx.lineTo(0, 11*s);
                ctx.lineTo(-8*s, 0);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = iceWhite;
                ctx.lineWidth = 0.9 * s;
                ctx.stroke();
                // 冰雪核心（旋转六角雪花）
                ctx.save();
                ctx.rotate(t * 1.5);
                ctx.fillStyle = iceWhite;
                ctx.shadowColor = c;
                ctx.shadowBlur = 16;
                for (let i = 0; i < 6; i++) {
                    const a = i * Math.PI / 3;
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(Math.cos(a) * 6.5*s, Math.sin(a) * 6.5*s);
                    ctx.lineTo(Math.cos(a + Math.PI/6) * 2*s, Math.sin(a + Math.PI/6) * 2*s);
                    ctx.closePath();
                    ctx.fill();
                }
                ctx.restore();
                // 中心冰魄
                ctx.fillStyle = '#e0f7ff';
                ctx.shadowColor = c;
                ctx.shadowBlur = 14;
                ctx.beginPath();
                ctx.arc(0, 0, 2*s, 0, Math.PI*2);
                ctx.fill();
                ctx.shadowBlur = 0;
                // 冰晶权杖（左侧）
                ctx.save();
                ctx.translate(-14*s, 0);
                ctx.strokeStyle = iceWhite;
                ctx.lineWidth = 1.5 * s;
                ctx.shadowColor = c;
                ctx.shadowBlur = 10;
                ctx.beginPath();
                ctx.moveTo(0, 13*s);
                ctx.lineTo(0, -13*s);
                ctx.stroke();
                // 权杖头六角雪花
                ctx.save();
                ctx.rotate(t);
                ctx.fillStyle = iceWhite;
                for (let i = 0; i < 6; i++) {
                    const a = i * Math.PI / 3;
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(Math.cos(a) * 5*s, Math.sin(a) * 5*s);
                    ctx.lineTo(Math.cos(a + Math.PI/6) * 1.8*s, Math.sin(a + Math.PI/6) * 1.8*s);
                    ctx.closePath();
                    ctx.fill();
                }
                ctx.restore();
                // 权杖顶端宝石
                ctx.fillStyle = c;
                ctx.beginPath();
                ctx.arc(0, -13*s, 2*s, 0, Math.PI*2);
                ctx.fill();
                ctx.restore();
                ctx.shadowBlur = 0;
                // 头部冰霜兜帽
                ctx.fillStyle = shadeColor(c, -65);
                ctx.beginPath();
                ctx.moveTo(-8*s, -7*s);
                ctx.lineTo(0, -19*s);
                ctx.lineTo(8*s, -7*s);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = iceWhite;
                ctx.lineWidth = 0.6 * s;
                ctx.stroke();
                // 冰晶王冠
                ctx.fillStyle = iceWhite;
                ctx.shadowColor = c;
                ctx.shadowBlur = 12;
                for (let i = -1; i <= 1; i++) {
                    const ox = i * 3.2*s;
                    const h = 5.5*s + Math.sin(t * 4 + i) * 1*s;
                    ctx.beginPath();
                    ctx.moveTo(ox - 1.8*s, -12*s);
                    ctx.lineTo(ox, -12*s - h);
                    ctx.lineTo(ox + 1.8*s, -12*s);
                    ctx.closePath();
                    ctx.fill();
                }
                ctx.shadowBlur = 0;
                // 环绕冰晶碎片
                for (let i = 0; i < 6; i++) {
                    const a = -t * 1.2 + i * Math.PI / 3;
                    const r = 18*s + Math.sin(t*3 + i)*1.5*s;
                    ctx.fillStyle = iceWhite;
                    ctx.shadowColor = c;
                    ctx.shadowBlur = 8;
                    ctx.save();
                    ctx.translate(Math.cos(a)*r, Math.sin(a)*r);
                    ctx.rotate(a + t);
                    ctx.beginPath();
                    for (let j = 0; j < 4; j++) {
                        const b = j * Math.PI / 2;
                        const rr = (j % 2 === 0) ? 2.2*s : 1*s;
                        ctx.lineTo(Math.cos(b)*rr, Math.sin(b)*rr);
                    }
                    ctx.closePath();
                    ctx.fill();
                    ctx.restore();
                }
                ctx.shadowBlur = 0;
                // 极地风暴状态：多层冰环+飘雪
                if (shuangBlizzardTimer > 0) {
                    ctx.strokeStyle = c;
                    ctx.lineWidth = 1.8 * s;
                    ctx.shadowColor = iceWhite;
                    ctx.shadowBlur = 28;
                    ctx.setLineDash([4*s, 2*s]);
                    ctx.lineDashOffset = -t * 70;
                    ctx.beginPath();
                    ctx.arc(0, 0, 22*s + Math.sin(t*4)*3*s, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.setLineDash([2*s, 3*s]);
                    ctx.lineDashOffset = t * 50;
                    ctx.beginPath();
                    ctx.arc(0, 0, 25*s + Math.cos(t*3)*2*s, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.setLineDash([]);
                    ctx.shadowBlur = 0;
                    for (let i = 0; i < 10; i++) {
                        const a = i * Math.PI * 2 / 10 + t;
                        const rr = 20*s + Math.sin(t*4 + i)*3*s;
                        ctx.fillStyle = iceWhite;
                        ctx.shadowColor = c;
                        ctx.shadowBlur = 8;
                        ctx.beginPath();
                        ctx.arc(Math.cos(a)*rr, Math.sin(a)*rr, 1.6*s, 0, Math.PI*2);
                        ctx.fill();
                    }
                    ctx.shadowBlur = 0;
                }
            }
            else if (heroKey === 'ji') {
                // ===== 于吉 - 荆棘领主 · 丛林之主（无五官）：荆棘披风+藤蔓核心+荆棘鞭+寄生环 =====
                ctx.shadowBlur = 0;
                // 荆棘披风（外层带刺叶片轮廓）
                ctx.fillStyle = shadeColor(c, -50);
                ctx.beginPath();
                for (let i = 0; i < 8; i++) {
                    const a = i * Math.PI / 4;
                    const r = (i % 2 === 0) ? 16*s : 11*s;
                    const px = Math.cos(a) * r;
                    const py = Math.sin(a) * r;
                    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                }
                ctx.closePath();
                ctx.fill();
                // 披风内层
                ctx.fillStyle = shadeColor(c, -35);
                ctx.beginPath();
                for (let i = 0; i < 8; i++) {
                    const a = i * Math.PI / 4;
                    const r = (i % 2 === 0) ? 12*s : 8*s;
                    const px = Math.cos(a) * r;
                    const py = Math.sin(a) * r;
                    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                }
                ctx.closePath();
                ctx.fill();
                // 披风纹理（叶脉）
                ctx.strokeStyle = shadeColor(c, 30);
                ctx.lineWidth = 0.4 * s;
                for (let i = 0; i < 4; i++) {
                    const a = i * Math.PI / 2;
                    ctx.beginPath();
                    ctx.moveTo(Math.cos(a) * 4*s, Math.sin(a) * 4*s);
                    ctx.quadraticCurveTo(Math.cos(a) * 9*s, Math.sin(a) * 9*s, Math.cos(a) * 13*s, Math.sin(a) * 13*s);
                    ctx.stroke();
                }
                // 主体战甲（叶子形护甲）
                ctx.fillStyle = shadeColor(c, -45);
                ctx.beginPath();
                ctx.moveTo(0, -12*s);
                ctx.bezierCurveTo(11*s, -4*s, 11*s, 8*s, 0, 15*s);
                ctx.bezierCurveTo(-11*s, 8*s, -11*s, -4*s, 0, -12*s);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = shadeColor(c, 30);
                ctx.lineWidth = 0.8 * s;
                ctx.stroke();
                // 战甲内层
                ctx.fillStyle = shadeColor(c, -15);
                ctx.beginPath();
                ctx.moveTo(0, -9*s);
                ctx.bezierCurveTo(8*s, -2*s, 8*s, 6*s, 0, 11*s);
                ctx.bezierCurveTo(-8*s, 6*s, -8*s, -2*s, 0, -9*s);
                ctx.closePath();
                ctx.fill();
                // 右侧荆棘鞭
                ctx.save();
                ctx.translate(13*s, 4*s);
                ctx.rotate(Math.sin(t) * 0.15);
                ctx.strokeStyle = shadeColor(c, 30);
                ctx.lineWidth = 1.4 * s;
                ctx.beginPath();
                ctx.moveTo(0, 10*s);
                ctx.quadraticCurveTo(3*s, 0, 0, -10*s);
                ctx.stroke();
                for (let i = 0; i < 4; i++) {
                    const ty = -8*s + i * 5*s;
                    ctx.fillStyle = shadeColor(c, 20);
                    ctx.beginPath();
                    ctx.moveTo(0, ty);
                    ctx.lineTo(3*s, ty - 1*s);
                    ctx.lineTo(0.5*s, ty + 1*s);
                    ctx.closePath();
                    ctx.fill();
                }
                ctx.shadowBlur = 0;
                ctx.restore();
                // 左侧寄生藤蔓
                ctx.save();
                ctx.translate(-13*s, 3*s);
                ctx.strokeStyle = '#3CB371';
                ctx.lineWidth = 1.0 * s;
                ctx.beginPath();
                ctx.moveTo(0, 6*s);
                ctx.quadraticCurveTo(-3*s, -2*s, 0, -8*s);
                ctx.stroke();
                for (let i = 0; i < 3; i++) {
                    const ty = -6*s + i * 5*s;
                    ctx.fillStyle = shadeColor(c, 20);
                    ctx.beginPath();
                    ctx.ellipse(-1.5*s, ty, 2*s, 1*s, -0.5, 0, Math.PI*2);
                    ctx.fill();
                }
                ctx.shadowBlur = 0;
                ctx.restore();
                // 中心旋转藤蔓核心（四叶花）
                const spinT = t * 2;
                ctx.save();
                ctx.rotate(spinT);
                ctx.fillStyle = shadeColor(c, 20);
                ctx.shadowColor = c;
                ctx.shadowBlur = 12;
                for (let i = 0; i < 4; i++) {
                    const a = i * Math.PI / 2;
                    ctx.beginPath();
                    ctx.ellipse(Math.cos(a) * 4*s, Math.sin(a) * 4*s, 5*s, 2*s, a, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
                // 中心种子宝石
                ctx.fillStyle = '#ffffff';
                ctx.shadowColor = c;
                ctx.shadowBlur = 12;
                ctx.beginPath();
                ctx.arc(0, 0, 2*s, 0, Math.PI*2);
                ctx.fill();
                ctx.shadowBlur = 0;
                // 头部荆棘冠
                ctx.fillStyle = shadeColor(c, -60);
                ctx.beginPath();
                ctx.moveTo(-8*s, -10*s);
                ctx.lineTo(-6*s, -19*s);
                ctx.lineTo(-3*s, -11*s);
                ctx.lineTo(0, -21*s);
                ctx.lineTo(3*s, -11*s);
                ctx.lineTo(6*s, -19*s);
                ctx.lineTo(8*s, -10*s);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = shadeColor(c, 30);
                ctx.lineWidth = 0.5 * s;
                ctx.stroke();
                // 荆棘冠宝石
                ctx.fillStyle = c;
                ctx.shadowColor = c;
                ctx.shadowBlur = 10;
                ctx.beginPath();
                ctx.arc(0, -21*s, 1.3*s, 0, Math.PI*2);
                ctx.fill();
                ctx.shadowBlur = 0;
                // 环绕荆棘粒子（6个）
                for (let i = 0; i < 6; i++) {
                    const a = t * 1.8 + i * Math.PI / 3;
                    const r = 17 * s + Math.sin(t * 3 + i) * 1.5 * s;
                    ctx.fillStyle = shadeColor(c, 20);
                    ctx.shadowColor = c;
                    ctx.shadowBlur = 6;
                    ctx.beginPath();
                    ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 1.5*s, 0, Math.PI*2);
                    ctx.fill();
                }
                ctx.shadowBlur = 0;
                // 3层藤蔓环
                ctx.strokeStyle = shadeColor(c, 20);
                ctx.lineWidth = 0.5 * s;
                for (let i = 0; i < 3; i++) {
                    const a = i * (Math.PI * 2 / 3) + t * 1.0;
                    ctx.beginPath();
                    ctx.arc(0, 0, 15*s, a, a + Math.PI / 3);
                    ctx.stroke();
                }
                // 一技能普攻强化状态：金绿色脉冲光环（与强化普攻金绿色特效统一）
                if (jiAtkBoostTimer > 0) {
                    const boostColor = '#FFCC44';
                    ctx.strokeStyle = boostColor;
                    ctx.lineWidth = 2.0 * s;
                    ctx.shadowColor = boostColor;
                    ctx.shadowBlur = 28;
                    ctx.setLineDash([4*s, 2*s]);
                    ctx.lineDashOffset = -t * 60;
                    ctx.beginPath();
                    ctx.arc(0, 0, 22*s + Math.sin(t*6)*3*s, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.setLineDash([]);
                    // 内层森林绿旋转环
                    ctx.strokeStyle = c;
                    ctx.lineWidth = 1.2 * s;
                    ctx.shadowColor = c;
                    ctx.shadowBlur = 15;
                    ctx.beginPath();
                    ctx.arc(0, 0, 17*s + Math.cos(t*5)*2*s, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.shadowBlur = 0;
                }
                // 寄生藤蔓链接状态：森林绿链接环
                if (jiVineLinks.length > 0) {
                    ctx.strokeStyle = shadeColor(c, 20);
                    ctx.lineWidth = 1.2 * s;
                    ctx.shadowColor = c;
                    ctx.shadowBlur = 15;
                    ctx.beginPath();
                    ctx.arc(0, 0, 19*s, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.shadowBlur = 0;
                }
            }
            else if (heroKey === 'jing') {
                // ===== 黄盖 - 水晶主宰·棱镜长袍+棱镜法杖+矩阵核心 =====
                ctx.shadowBlur = 0;
                const prismWhite = '#ffffff';
                const gold = '#FFCC44';
                // 外层棱镜长袍（菱形切片）
                ctx.fillStyle = shadeColor(c, -50);
                ctx.beginPath();
                ctx.moveTo(0, -9*s);
                ctx.lineTo(14*s, 2*s);
                ctx.lineTo(10*s, 15*s);
                ctx.lineTo(-10*s, 15*s);
                ctx.lineTo(-14*s, 2*s);
                ctx.closePath();
                ctx.fill();
                // 内层矩阵胸甲
                ctx.fillStyle = shadeColor(c, -25);
                ctx.beginPath();
                ctx.moveTo(0, -7*s);
                ctx.lineTo(9*s, 1*s);
                ctx.lineTo(0, 13*s);
                ctx.lineTo(-9*s, 1*s);
                ctx.closePath();
                ctx.fill();
                // 棱镜镶边
                ctx.strokeStyle = prismWhite;
                ctx.lineWidth = 0.9 * s;
                ctx.beginPath();
                ctx.moveTo(0, -7*s);
                ctx.lineTo(9*s, 1*s);
                ctx.lineTo(0, 13*s);
                ctx.lineTo(-9*s, 1*s);
                ctx.closePath();
                ctx.stroke();
                // 胸甲分割线
                ctx.strokeStyle = shadeColor(c, 20);
                ctx.lineWidth = 0.5 * s;
                ctx.beginPath();
                ctx.moveTo(0, -7*s);
                ctx.lineTo(0, 13*s);
                ctx.moveTo(-9*s, 1*s);
                ctx.lineTo(9*s, 1*s);
                ctx.stroke();
                // 矩阵核心（旋转八角星）
                ctx.save();
                ctx.rotate(t * 2.2);
                ctx.fillStyle = c;
                ctx.shadowColor = c;
                ctx.shadowBlur = 16;
                for (let i = 0; i < 4; i++) {
                    const a = i * Math.PI / 2;
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(Math.cos(a) * 6*s, Math.sin(a) * 6*s);
                    ctx.lineTo(Math.cos(a + Math.PI/4) * 2.2*s, Math.sin(a + Math.PI/4) * 2.2*s);
                    ctx.closePath();
                    ctx.fill();
                }
                ctx.restore();
                // 中心棱镜宝石
                ctx.fillStyle = '#ffffff';
                ctx.shadowColor = c;
                ctx.shadowBlur = 14;
                ctx.beginPath();
                ctx.arc(0, 0, 2*s, 0, Math.PI*2);
                ctx.fill();
                ctx.shadowBlur = 0;
                // 棱镜法杖（右侧）
                ctx.save();
                ctx.translate(14*s, 0);
                ctx.rotate(-Math.PI / 10);
                // 杖身
                const staffGrad = ctx.createLinearGradient(-2*s, -14*s, 2*s, 14*s);
                staffGrad.addColorStop(0, prismWhite);
                staffGrad.addColorStop(0.5, c);
                staffGrad.addColorStop(1, shadeColor(c, -30));
                ctx.fillStyle = staffGrad;
                ctx.shadowColor = c;
                ctx.shadowBlur = 10;
                ctx.beginPath();
                ctx.moveTo(-1.5*s, -16*s);
                ctx.lineTo(1.5*s, -16*s);
                ctx.lineTo(2*s, 14*s);
                ctx.lineTo(-2*s, 14*s);
                ctx.closePath();
                ctx.fill();
                // 杖头棱镜
                ctx.save();
                ctx.translate(0, -16*s);
                ctx.rotate(t);
                ctx.fillStyle = prismWhite;
                ctx.beginPath();
                ctx.moveTo(0, -5*s);
                ctx.lineTo(4*s, 0);
                ctx.lineTo(0, 5*s);
                ctx.lineTo(-4*s, 0);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = c;
                ctx.lineWidth = 0.8*s;
                ctx.stroke();
                ctx.restore();
                // 法杖顶球
                ctx.fillStyle = gold;
                ctx.beginPath();
                ctx.arc(0, -16*s, 1.6*s, 0, Math.PI*2);
                ctx.fill();
                ctx.restore();
                ctx.shadowBlur = 0;
                // 头部水晶冠
                ctx.fillStyle = shadeColor(c, -70);
                ctx.beginPath();
                ctx.moveTo(-8*s, -7*s);
                ctx.lineTo(0, -20*s);
                ctx.lineTo(8*s, -7*s);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = prismWhite;
                ctx.lineWidth = 0.6 * s;
                ctx.stroke();
                // 冠顶三棱镜
                ctx.fillStyle = c;
                ctx.shadowColor = c;
                ctx.shadowBlur = 12;
                for (let i = -1; i <= 1; i++) {
                    const ox = i * 3.3*s;
                    const h = 5*s + Math.sin(t * 5 + i) * 1*s;
                    ctx.beginPath();
                    ctx.moveTo(ox - 2*s, -12*s);
                    ctx.lineTo(ox, -12*s - h);
                    ctx.lineTo(ox + 2*s, -12*s);
                    ctx.closePath();
                    ctx.fill();
                }
                ctx.shadowBlur = 0;
                // 环绕棱镜碎片
                for (let i = 0; i < 6; i++) {
                    const a = t * 1.5 + i * Math.PI / 3;
                    const r = 18*s + Math.sin(t*3 + i)*1.5*s;
                    ctx.save();
                    ctx.translate(Math.cos(a)*r, Math.sin(a)*r);
                    ctx.rotate(-t * 2 + i);
                    ctx.fillStyle = prismWhite;
                    ctx.shadowColor = c;
                    ctx.shadowBlur = 8;
                    ctx.beginPath();
                    ctx.moveTo(0, -2*s);
                    ctx.lineTo(2*s, 0);
                    ctx.lineTo(0, 2*s);
                    ctx.lineTo(-2*s, 0);
                    ctx.closePath();
                    ctx.fill();
                    ctx.restore();
                }
                ctx.shadowBlur = 0;
                // 棱镜阵列状态：青绿光环+悬浮棱镜
                if (jingPrisms.length > 0) {
                    ctx.strokeStyle = c;
                    ctx.lineWidth = 1.6 * s;
                    ctx.shadowColor = prismWhite;
                    ctx.shadowBlur = 24;
                    ctx.setLineDash([3*s, 2*s]);
                    ctx.lineDashOffset = -t * 55;
                    ctx.beginPath();
                    ctx.arc(0, 0, 22*s + Math.sin(t*6)*2*s, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.setLineDash([]);
                    ctx.shadowBlur = 0;
                    for (let i = 0; i < 6; i++) {
                        const a = i * Math.PI / 3 + t * 1.5;
                        const rr = 20*s;
                        ctx.save();
                        ctx.translate(Math.cos(a)*rr, Math.sin(a)*rr);
                        ctx.rotate(t + i);
                        ctx.fillStyle = prismWhite;
                        ctx.shadowColor = c;
                        ctx.shadowBlur = 10;
                        ctx.beginPath();
                        ctx.moveTo(0, -2.5*s);
                        ctx.lineTo(2.2*s, 0);
                        ctx.lineTo(0, 2.5*s);
                        ctx.lineTo(-2.2*s, 0);
                        ctx.closePath();
                        ctx.fill();
                        ctx.restore();
                    }
                    ctx.shadowBlur = 0;
                }
                // 一技能水晶折射强化态：金绿色脉冲光环
                if (jingRefractionBoostTimer > 0) {
                    ctx.strokeStyle = gold;
                    ctx.lineWidth = 2 * s;
                    ctx.shadowColor = c;
                    ctx.shadowBlur = 26;
                    ctx.setLineDash([4*s, 2*s]);
                    ctx.lineDashOffset = -t * 80;
                    ctx.beginPath();
                    ctx.arc(0, 0, 25*s + Math.sin(t*8)*3*s, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.setLineDash([]);
                    ctx.shadowBlur = 0;
                }
            }

        

        // ============================================================
        // ===== 新增：冥渊之主 Boss 类 ================================
        // ============================================================
        

        // ===== 新增：暴击伤害飘字 =====

        // ===== 新增：屏幕震动 =====

        // ===== 新增：慢动作 =====

        // ===== 新增：连杀Combo =====

        // ===== 新增：伤害计算（含暴击/连杀加成） =====

        // ===== 新增：命中飞溅粒子 =====

        // ===== 新增：死亡爆炸粒子 =====

        // ===== 新增：帝君死亡增强特效（碎裂+慢动作） =====

        // ===== 新增：冥渊死亡动画特效 =====

        // ===== 新增：绘制屏幕碎裂特效 =====

        // ===== 新增：绘制帝君/冥渊死亡碎裂放射线 =====

        // ===== 新增：玩家移动拖尾 =====

        // ===== 新增：道具掉落 =====

        // ===== 新增：拖尾粒子绘制 =====

        // ============================================================
        // ===== 新增：剑圣 Boss 类（弹幕+机动+剑阵） ==================
        // ============================================================

        // ============================================================
        // ===== 新增：妄瞳 Boss 类（开闭眼机制+弹幕激光） =============
        // ============================================================

        // ===== 新增：幽 Boss 类（烈焰燃烧/火焰弹幕/激光/折射冲刺） ========

        // ===== 新增：Boss血条更新（支持双血条） =====

        

        // 关羽普攻刀光：从中心向外发射的8道绿色刀光

        // 关羽普攻刀光：绿色光环扩散
            // ===== 传说皮肤：本体多色渐变覆盖 =====
            // 使用 'color' 混合模式给本体重新上色，保留原有线条、明暗和轮廓细节，
            // 就像换了一件不同颜色的衣服。'color' 模式只替换色相，不破坏形状。
            const legendSkin = getHeroSkin(heroKey);
            if (legendSkin && legendSkin.type === 'legend' && legendSkin.colors && legendSkin.colors.length >= 3) {
                ctx.save();
                const colors = legendSkin.colors;
                // 线性渐变覆盖英雄全身，让多种颜色都可见
                const grad = ctx.createLinearGradient(-20 * s, -20 * s, 20 * s, 20 * s);
                for (let i = 0; i < colors.length; i++) {
                    grad.addColorStop(i / (colors.length - 1), colors[i]);
                }
                // color 模式：保留目标像素的亮度和透明度，只应用源颜色
                ctx.globalCompositeOperation = 'color';
                ctx.globalAlpha = 0.95;
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(0, 0, 25 * s, 0, Math.PI * 2);
                ctx.fill();
                // 叠加一层径向高光，增强金属/水晶质感
                const shine = ctx.createRadialGradient(-7 * s, -7 * s, 2 * s, 0, 0, 22 * s);
                shine.addColorStop(0, 'rgba(255,255,255,0.45)');
                shine.addColorStop(0.4, 'rgba(255,255,255,0.1)');
                shine.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.globalCompositeOperation = 'overlay';
                ctx.globalAlpha = 0.5;
                ctx.fillStyle = shine;
                ctx.beginPath();
                ctx.arc(0, 0, 22 * s, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
                ctx.globalCompositeOperation = 'source-over';
                ctx.restore();
            }

            // 修复：drawHeroAvatar 行11的 ctx.save() 必须在此 restore
            // 缺失 restore 会导致 canvas 状态栈泄漏，变换矩阵污染累积
            // 表现为：角色变小/特效消失/角色消失/小地图消失
            ctx.restore();
        }

        function drawRing() {
            if (!ringActive) return;
            
            const radius = 120;
            ringAngle += 0.12;
            
            ctx.save();
            ctx.translate(hero.x, hero.y);
            
            ctx.strokeStyle = 'rgba(255,204,0,0.6)';
            ctx.lineWidth = 6;
            ctx.shadowColor = '#ffcc00';
            ctx.shadowBlur = 25;
            ctx.beginPath();
            ctx.arc(0, 0, radius, 0, Math.PI * 2);
            ctx.stroke();
            
            ctx.restore();
            ctx.shadowBlur = 0;
            
            ctx.save();
            ctx.translate(hero.x, hero.y);
            ctx.rotate(ringAngle);
            
            for (let i = 0; i < 8; i++) {
                const angle = (i / 8) * Math.PI * 2;
                const x = Math.cos(angle) * radius;
                const y = Math.sin(angle) * radius;
                
                ctx.fillStyle = '#ffcc00';
                ctx.shadowColor = '#ffcc00';
                ctx.shadowBlur = 20;
                ctx.beginPath();
                ctx.arc(x, y, 14, 0, Math.PI * 2);
                ctx.fill();
                
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.arc(x, y, 6, 0, Math.PI * 2);
                ctx.fill();
            }
            
            ctx.restore();
            ctx.shadowBlur = 0;
            
            ctx.fillStyle = 'rgba(255,204,0,0.15)';
            ctx.beginPath();
            ctx.arc(hero.x, hero.y, radius, 0, Math.PI * 2);
            ctx.fill();
        }
        
        function updateRing() {
            if (!ringActive) return;

            ringTimer--;
            if (ringTimer <= 0) {
                ringActive = false;
                return;
            }

            const radius = 120;
            for (let e of enemies.slice()) {
                if (!e.alive) continue;
                // 取消整王AOE免疫——霸王可受AOE光环伤害
                const dx = e.x - hero.x;
                const dy = e.y - hero.y;
                if (Math.sqrt(dx*dx + dy*dy) < radius + 20) {
                    if (Math.random() < 0.1) {
                        // 妄瞳闭眼无敌
                        if (e.isMadEye && !e.eyeOpen) {
                            if (Math.random() < 0.2) showDamage(e.x, e.y, _t('无敌'), '#aa00ff');
                            continue;
                        }
                        const r = calcDamage(stats.skill2);
                        e.hp -= r.dmg;
                        e.flashTime = 4;
                        if (r.isCrit) showCritDamage(e.x, e.y, r.dmg, '#ffcc00');
                        else showDamage(e.x, e.y, r.dmg, '#ffcc00');
                        spawnHitParticles(e.x, e.y, '#ffcc00', 4);
                        if (e.hp <= 0) {
                            e.alive = false;
                            totalKills++;
                            addCombo();
                            spawnDeathExplosion(e.x, e.y, e.color, e.isBoss);
                            // 劫的掉落由 JieBoss.dropRewards 统一处理（10-20个数值小球），跳过通用单球掉落
                            if (!e.isJie) maybeDropPickup(e.x, e.y, e.isBoss);
                            if (e.isBoss) {
                                if (e.isEmperor) {
                                    const otherBossAlive = bossRefs.some(b => b !== e && b.alive);
                                    if (!otherBossAlive) spawnEmperorDeathEffect(e.x, e.y, e.color);
                                }
                                // 修复：补全 youBosses 检查 + !bossDeathFxTriggered 双标志守卫
                                // （与主路径 line 3390-3402 保持一致，防止光环击杀Boss时误判/重复触发）
                                const anyBossAlive = bossRefs.some(b => b !== e && b.alive) ||
                                                     abyssLords.some(b => b !== e && b.alive) ||
                                                     bladeMasters.some(b => b !== e && b.alive) ||
                                                     madEyes.some(b => b !== e && b.alive) ||
                                                     youBosses.some(b => b !== e && b.alive);
                                // 王分裂体/其他非帝君Boss可能多次死亡，只有最后一个Boss死时执行肉鸽升级相关的全局效果
                                if (!anyBossAlive && !bossDeathFxTriggered) {
                                    bossDeathFxTriggered = true;  // 修复：立即标记，防止重复触发
                                    bossAlive = false;
                                    bossDeathDelay = 150;
                                    // 慢动作+屏幕震动只对最后一个Boss生效（避免王分裂体依次死亡时连续触发多次）
                                    if (!e.isEmperor) { triggerSlowMo(120); triggerShake(true); }
                                }
                            }
                        }
                    }
                }
            }
        }
        
        // ===== 新增：战斗背景图预加载（支持自定义背景） =====
        let battleBgImg = null;
        let battleBgLoaded = false;
        let customBgImg = null;
        let customBgLoaded = false;
        const BG_STORAGE_KEY = 'heroWar_customBg';

        function showBgToast(msg, color) {
            const t = document.getElementById('bgToast');
            t.textContent = msg;
            t.style.color = color || '#44ff44';
            t.style.borderColor = color || '#44ff44';
            t.style.boxShadow = `0 0 20px ${color || 'rgba(68,255,68,0.5)'}`;
            t.style.display = 'block';
            setTimeout(() => { t.style.display = 'none'; }, 2000);
        }

        function loadBattleBg() {
            battleBgImg = new Image();
            battleBgImg.crossOrigin = 'anonymous';
            battleBgImg.onload = () => {
                battleBgLoaded = true;
                // Edge兼容：确保图片完全解码
                if (battleBgImg.decode) {
                    battleBgImg.decode().then(() => { battleBgLoaded = true; }).catch(() => {});
                }
            };
            battleBgImg.onerror = () => { battleBgLoaded = false; };
            // 默认背景已内嵌为 base64（自包含），不依赖外部图片
            battleBgImg.src = 'data:image/jpeg;base64,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';

            // 加载自定义背景（从 localStorage 读取 dataURL）
            try {
                const saved = localStorage.getItem(BG_STORAGE_KEY);
                if (saved) {
                    customBgImg = new Image();
                    customBgImg.onload = () => { customBgLoaded = true; };
                    customBgImg.onerror = () => { customBgLoaded = false; customBgImg = null; localStorage.removeItem(BG_STORAGE_KEY); };
                    customBgImg.src = saved;
                }
            } catch(e) {
                console.warn('读取自定义背景失败:', e);
            }
        }
        loadBattleBg();

        function setCustomBg(dataUrl) {
            customBgImg = new Image();
            customBgImg.onload = () => {
                customBgLoaded = true;
                try { localStorage.setItem(BG_STORAGE_KEY, dataUrl); } catch(e) { console.warn('保存背景失败（可能图片过大）:', e); }
                showBgToast(_t('战斗背景已设置！'), '#8b5cf6');
            };
            customBgImg.onerror = () => {
                customBgLoaded = false;
                customBgImg = null;
                showBgToast(_t('图片加载失败'), '#ff4444');
            };
            customBgImg.src = dataUrl;
        }

        function resetCustomBg() {
            customBgImg = null;
            customBgLoaded = false;
            try { localStorage.removeItem(BG_STORAGE_KEY); } catch(e) {}
            showBgToast(_t('已恢复默认背景'), '#ffcc00');
        }

        function drawMap() {
            // 优先使用自定义背景 > 默认背景图 > 纯色
            // 重要：背景预装铺满整个地图（世界坐标），相机移动时能看到不同区域
            // 注意：此函数在 gameLoop 的 ctx.translate(-camX, -camY) 之后调用，坐标均为世界坐标
            const useCustom = customBgLoaded && customBgImg;
            const useDefault = battleBgLoaded && battleBgImg && !useCustom;
            const bgImg = useCustom ? customBgImg : (useDefault ? battleBgImg : null);
            const overlayAlpha = useCustom ? 0.12 : 0.15;

            // 先画底色兜底
            ctx.fillStyle = '#0a0a1a';
            ctx.fillRect(camX, camY, WIDTH, HEIGHT);

            if (bgImg) {
                // 背景图缩放覆盖整个地图（cover模式），一张大图无拼接缝
                const imgW = bgImg.width;
                const imgH = bgImg.height;
                const scale = Math.max(MAP_WIDTH / imgW, MAP_HEIGHT / imgH);
                const drawW = imgW * scale;
                const drawH = imgH * scale;
                // 居中放置在地图上
                const offsetX = (MAP_WIDTH - drawW) / 2;
                const offsetY = (MAP_HEIGHT - drawH) / 2;
                ctx.drawImage(bgImg, offsetX, offsetY, drawW, drawH);
                // 半透明叠加层增加对比度
                ctx.fillStyle = `rgba(10,10,30,${overlayAlpha})`;
                ctx.fillRect(camX, camY, WIDTH, HEIGHT);
            }
        }

        // ===== 小地图（右上角半透明，显示整个2倍地图+视野框+敌我位置） =====
        function drawMinimap() {
            const mw = 190;
            const mh = Math.round(mw * MAP_HEIGHT / MAP_WIDTH);
            const mx = WIDTH - mw - 14;
            const my = 14;
            const sx = mw / MAP_WIDTH;
            const sy = mh / MAP_HEIGHT;

            ctx.save();
            // 半透明背景（透过它仍可见底层画面，但点本身不透明所以看得见）
            ctx.globalAlpha = 0.5;
            ctx.fillStyle = '#0a0a1a';
            ctx.fillRect(mx, my, mw, mh);
            ctx.globalAlpha = 1;

            // 边框
            ctx.strokeStyle = 'rgba(120,200,255,0.85)';
            ctx.lineWidth = 2;
            ctx.strokeRect(mx, my, mw, mh);

            // 当前视野范围小方框
            ctx.strokeStyle = '#ffee44';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(mx + camX * sx, my + camY * sy, WIDTH * sx, HEIGHT * sy);
            // 视野框内淡填充
            ctx.globalAlpha = 0.08;
            ctx.fillStyle = '#ffee44';
            ctx.fillRect(mx + camX * sx, my + camY * sy, WIDTH * sx, HEIGHT * sy);
            ctx.globalAlpha = 1;

            // 敌方点（红）/ 各类Boss点（不同颜色）
            for (const e of enemies.slice()) {
                if (!e.alive) continue;
                let dotColor = '#ff4444';
                let dotR = 2.5;
                if (e.isBoss) {
                    dotR = 4.5;
                    if (e.isEmperor) dotColor = '#ff3300';
                    else if (e.isBladeMaster) dotColor = '#4488ff';
                    else if (e.isMadEye) dotColor = '#cc00ff';
                    else if (e.isYou) dotColor = '#ff6600';
                    else if (e.isAbyss) dotColor = '#88ccff';
                    else dotColor = '#ff0066';
                }
                ctx.fillStyle = dotColor;
                ctx.shadowColor = dotColor;
                ctx.shadowBlur = e.isBoss ? 8 : 0;
                ctx.beginPath();
                ctx.arc(mx + e.x * sx, my + e.y * sy, dotR, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.shadowBlur = 0;
            // 冥渊Boss点（青蓝色）
            for (const a of abyssLords) {
                if (!a.alive) continue;
                ctx.fillStyle = '#88ccff';
                ctx.shadowColor = '#88ccff';
                ctx.shadowBlur = 8;
                ctx.beginPath();
                ctx.arc(mx + a.x * sx, my + a.y * sy, 4.5, 0, Math.PI * 2);
                ctx.fill();
            }
            // 幽Boss点（亮红橙色）
            for (const y of youBosses) {
                if (!y.alive) continue;
                ctx.fillStyle = y.youEnraged ? '#ffaa00' : '#ff4400';
                ctx.shadowColor = ctx.fillStyle;
                ctx.shadowBlur = 10;
                ctx.beginPath();
                ctx.arc(mx + y.x * sx, my + y.y * sy, 5, 0, Math.PI * 2);
                ctx.fill();
            }
            // 劫Boss点（亮金色，比幽更大以突出压轴地位）
            for (const j of jieBosses) {
                if (!j.alive) continue;
                ctx.fillStyle = '#ffd34d';
                ctx.shadowColor = '#ffd34d';
                ctx.shadowBlur = 12;
                ctx.beginPath();
                ctx.arc(mx + j.x * sx, my + j.y * sy, 6, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.shadowBlur = 0;

            // 我方点（绿）——最后绘制保证在最上层
            ctx.fillStyle = '#44ff44';
            ctx.shadowColor = '#44ff44';
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.arc(mx + hero.x * sx, my + hero.y * sy, 3.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;

            ctx.restore();
        }
        
        
        
