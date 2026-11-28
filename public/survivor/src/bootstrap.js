// ============================================================
// 文件: src/bootstrap.js
// 描述: load 事件监听 + 启动
// 行范围: 16958-17035 (原 game.js)
// 注意: 本文件由原版 HTML 抽取，保持原作用域不变
// ============================================================

// ===== 中/英文国际化词条 =====
Object.assign(I18N_DICT, {
    '正在初始化画布...': 'Initializing canvas...',
    '正在加载战斗背景...': 'Loading battle background...',
    '正在构建3D星空...': 'Building 3D starfield...',
    '正在加载英雄数据...': 'Loading hero data...',
    '正在准备技能系统...': 'Preparing skill system...',
    '加载完成！': 'Loaded!'
});

        window.addEventListener('load', () => {
            // 从 localStorage 加载皮肤选择（如果有）
            try {
                const savedSkins = localStorage.getItem('heroSkinOverrides');
                if (savedSkins) {
                    heroSkinOverrides = JSON.parse(savedSkins);
                    // 迁移旧版颜色值存档为皮肤ID
                    migrateSkinOverrides();
                }
            } catch (e) {
                console.warn('加载皮肤存档失败:', e);
                heroSkinOverrides = {};
            }

            canvas = document.getElementById('gameCanvas');
            ctx = canvas.getContext('2d');
            
            // ===== 画质优化：高DPI屏幕适配 + 抗锯齿 + 图像平滑 =====
            // devicePixelRatio: 屏幕物理像素与CSS像素的比值（普通屏=1，高清屏=2，视网膜屏=3）
            // 值越大画面越清晰，但渲染压力越大（与比值的平方成正比）
            // 修复 bug：dpr 最小必须为 1。当用户浏览器 zoom < 100% 时，devicePixelRatio 会小于 1
            // （如 zoom=50% 时 dpr=0.5），导致 canvas 物理尺寸被缩小到 640x385，
            // 但 CSS 显示尺寸仍为 1280x770，游戏内容只显示在 canvas 左上角 1/4 区域。
            // 通过 Math.max(1, ...) 强制 dpr >= 1，避免内容被压缩到左上角。
            // 注意：不再调用 ctx.scale(dpr,dpr)，因为 gameLoop 每帧通过 setTransform(dpr,0,0,dpr,0,0) 统一设置变换矩阵
            dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));  // 限制范围 [1, 2]，平衡画质与性能
            canvas.width = WIDTH * dpr;
            canvas.height = HEIGHT * dpr;
            canvas.style.width = WIDTH + 'px';
            canvas.style.height = HEIGHT + 'px';
            // ctx.scale(dpr, dpr) 已移除——由 gameLoop 的 setTransform 统一管理，避免被 setTransform(1,0,0,1,0,0) 覆盖

            // 同步设置#ui的宽度和位置与canvas一致
            // 因为#ui用position:absolute,需要让父级div position:relative
            const canvasParent = canvas.parentElement;
            if (canvasParent) {
                canvasParent.style.position = 'relative';
                canvasParent.style.width = WIDTH + 'px';
                canvasParent.style.height = HEIGHT + 'px';
            }
            const ui = document.getElementById('ui');
            if (ui) {
                ui.style.width = WIDTH + 'px';
                ui.style.left = '0';
                ui.style.right = 'auto';
            }
            
            // 图像平滑质量：高质量缩放，画面更细腻
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';  // 可选值: low, medium, high

            // ===== 加载进度模拟 =====
            const loadingBar = document.getElementById('loadingBarFill');
            const loadingPercent = document.getElementById('loadingPercent');
            const loadingTip = document.getElementById('loadingTip');
            const loadingScreen = document.getElementById('loadingScreen');
            let loadProgress = 0;
            const loadSteps = [
                { p: 15, msg: _t('正在初始化画布...') },
                { p: 30, msg: _t('正在加载战斗背景...') },
                { p: 50, msg: _t('正在构建3D星空...') },
                { p: 70, msg: _t('正在加载英雄数据...') },
                { p: 85, msg: _t('正在准备技能系统...') },
                { p: 100, msg: _t('加载完成！') }
            ];
            let stepIdx = 0;
            function advanceLoad() {
                if (stepIdx >= loadSteps.length) {
                    // 隐藏加载界面，显示开始界面（选英雄+选难度）
                    loadingScreen.classList.add('fade-out');
                    setTimeout(() => {
                        loadingScreen.style.display = 'none';
                        showStartScreen();  // 加载完成后显示开始界面
                    }, 500);
                    return;
                }
                const step = loadSteps[stepIdx];
                loadingTip.textContent = step.msg;
                const target = step.p;
                const animateProgress = () => {
                    if (loadProgress < target) {
                        loadProgress = Math.min(target, loadProgress + 2);
                        loadingBar.style.width = loadProgress + '%';
                        loadingPercent.textContent = loadProgress + '%';
                        setTimeout(animateProgress, 30);
                    } else {
                        stepIdx++;
                        // 在30%时初始化3D背景，在100%时完成
                        if (step.p === 50) init3DBackground();
                        setTimeout(advanceLoad, 100);
                    }
                };
                animateProgress();
            }
            advanceLoad();

            // ===== 初始化音乐系统（默认非战斗环境，循环播放 Mirror Lake.mp3） =====
            if (typeof initMusic === 'function') {
                initMusic();
            }
        });
