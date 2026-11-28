// ============================================================
// 文件: src/background.js
// 描述: 3D 星空背景 + 开始界面光环
// 行范围: 1-246 (原 game.js)
// 注意: 本文件由原版 HTML 抽取，保持原作用域不变
// ============================================================

        // ===== GSAP 全局可用性检测（便于后续代码安全使用 gsap API） =====
        window.__hasGSAP = (typeof gsap !== 'undefined');
        // ===== 新增：Three.js 3D星空背景 =====
        let bgScene, bgCamera, bgRenderer, bgStars = [], bgShootingStars = [];
        let bgNebula;
        function init3DBackground() {
            const bgCanvas = document.getElementById('bg3d');
            try {
                if (typeof THREE === 'undefined') { console.warn('Three.js 未加载，跳过3D背景'); return; }
                bgScene = new THREE.Scene();
                bgCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
                bgCamera.position.z = 500;
                bgRenderer = new THREE.WebGLRenderer({ canvas: bgCanvas, alpha: true, antialias: true });
                bgRenderer.setSize(window.innerWidth, window.innerHeight);
                bgRenderer.setClearColor(0x000010, 1);

                // 远景星空（2600颗）
                const farGeo = new THREE.BufferGeometry();
                const farPos = [];
                for (let i = 0; i < 2600; i++) {
                    farPos.push((Math.random() - 0.5) * 3000);
                    farPos.push((Math.random() - 0.5) * 3000);
                    farPos.push((Math.random() - 0.5) * 2000 - 500);
                }
                farGeo.setAttribute('position', new THREE.Float32BufferAttribute(farPos, 3));
                const farMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.5, sizeAttenuation: true, transparent: true, opacity: 0.85 });
                const farStars = new THREE.Points(farGeo, farMat);
                bgScene.add(farStars);
                bgStars.push({ mesh: farStars, speed: 0.15 });

                // 近景星空（520颗，彩色）
                const nearGeo = new THREE.BufferGeometry();
                const nearPos = [];
                const nearColors = [];
                for (let i = 0; i < 520; i++) {
                    nearPos.push((Math.random() - 0.5) * 1800);
                    nearPos.push((Math.random() - 0.5) * 1800);
                    nearPos.push((Math.random() - 0.5) * 1000);
                    const c = new THREE.Color();
                    c.setHSL(Math.random() * 0.2 + 0.55, 0.8, 0.6);
                    nearColors.push(c.r, c.g, c.b);
                }
                nearGeo.setAttribute('position', new THREE.Float32BufferAttribute(nearPos, 3));
                nearGeo.setAttribute('color', new THREE.Float32BufferAttribute(nearColors, 3));
                const nearMat = new THREE.PointsMaterial({ size: 3, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.95 });
                const nearStars = new THREE.Points(nearGeo, nearMat);
                bgScene.add(nearStars);
                bgStars.push({ mesh: nearStars, speed: 0.4 });

                // 浮动尘埃（380颗，金色）
                const dustGeo = new THREE.BufferGeometry();
                const dustPos = [];
                for (let i = 0; i < 380; i++) {
                    dustPos.push((Math.random() - 0.5) * 1400);
                    dustPos.push((Math.random() - 0.5) * 1400);
                    dustPos.push((Math.random() - 0.5) * 600);
                }
                dustGeo.setAttribute('position', new THREE.Float32BufferAttribute(dustPos, 3));
                const dustMat = new THREE.PointsMaterial({ color: 0xffcc66, size: 2.2, sizeAttenuation: true, transparent: true, opacity: 0.5 });
                const dust = new THREE.Points(dustGeo, dustMat);
                bgScene.add(dust);
                bgStars.push({ mesh: dust, speed: 0.7 });

                // 星云球体（背景大色块）
                const nebulaGeo = new THREE.SphereGeometry(800, 32, 32);
                const nebulaMat = new THREE.MeshBasicMaterial({ color: 0x1a0a3a, transparent: true, opacity: 0.4, side: THREE.BackSide });
                bgNebula = new THREE.Mesh(nebulaGeo, nebulaMat);
                bgScene.add(bgNebula);

                window.addEventListener('resize', () => {
                    if (bgCamera && bgRenderer) {
                        bgCamera.aspect = window.innerWidth / window.innerHeight;
                        bgCamera.updateProjectionMatrix();
                        bgRenderer.setSize(window.innerWidth, window.innerHeight);
                    }
                });
                // 创建开始界面3D光环（与3D背景一同初始化）
                createStartScreenHalo();
                animate3DBackground();
            } catch (e) {
                console.warn('3D背景初始化失败：', e);
            }
        }
        function animate3DBackground() {
            requestAnimationFrame(animate3DBackground);
            if (!bgScene || !bgRenderer) return;
            for (const s of bgStars) {
                s.mesh.rotation.y += 0.0003 * s.speed;
                s.mesh.rotation.x += 0.0001 * s.speed;
            }
            if (bgNebula) bgNebula.rotation.y += 0.0002;
            if (Math.random() < 0.012 && bgShootingStars.length < 4) {
                spawnShootingStar();
            }
            for (let i = bgShootingStars.length - 1; i >= 0; i--) {
                const ss = bgShootingStars[i];
                ss.mesh.position.add(ss.vel);
                ss.life--;
                ss.mesh.material.opacity = ss.life / ss.maxLife;
                if (ss.life <= 0) {
                    bgScene.remove(ss.mesh);
                    bgShootingStars.splice(i, 1);
                }
            }
            // 更新开始界面3D光环（仅在开始界面可见时显示）
            updateStartScreenHalo();
            bgRenderer.render(bgScene, bgCamera);
        }
        function spawnShootingStar() {
            const geo = new THREE.BufferGeometry();
            const pts = [];
            const startX = (Math.random() - 0.5) * 1500;
            const startY = 400 + Math.random() * 300;
            const startZ = -200;
            pts.push(startX, startY, startZ);
            pts.push(startX - 30, startY + 15, startZ);
            pts.push(startX - 60, startY + 30, startZ);
            geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
            const mat = new THREE.LineBasicMaterial({ color: 0x88ffff, transparent: true, opacity: 1 });
            const line = new THREE.Line(geo, mat);
            bgScene.add(line);
            bgShootingStars.push({
                mesh: line,
                vel: new THREE.Vector3(-6 - Math.random() * 4, -4 - Math.random() * 2, 0),
                life: 80, maxLife: 80
            });
        }

        // ===== 开始界面3D光环（旋转的能量环+粒子簇） =====
        // 仅在开始界面显示，进入游戏后隐藏
        let startHaloGroup = null;
        let startHaloParticles = null;
        function createStartScreenHalo() {
            if (!bgScene || typeof THREE === 'undefined') return;
            if (startHaloGroup) return;  // 已创建则跳过

            try {
                startHaloGroup = new THREE.Group();
                // 创建3层旋转光环（不同半径/角度/颜色）
                const ringColors = [0x00d2ff, 0xc44dff, 0xfbbf24];
                const ringRadii = [220, 280, 340];
                for (let i = 0; i < 3; i++) {
                    const torusGeo = new THREE.TorusGeometry(ringRadii[i], 2, 8, 100);
                    const torusMat = new THREE.MeshBasicMaterial({
                        color: ringColors[i],
                        transparent: true,
                        opacity: 0.35,
                        blending: THREE.AdditiveBlending
                    });
                    const torus = new THREE.Mesh(torusGeo, torusMat);
                    torus.rotation.x = Math.PI / 2 + (i - 1) * 0.2;  // 略微倾斜
                    torus.rotation.z = i * 0.3;
                    torus.userData = { speed: 0.002 + i * 0.001, axis: i };
                    startHaloGroup.add(torus);
                }
                // 中心光球（亮蓝点）
                const coreGeo = new THREE.SphereGeometry(8, 16, 16);
                const coreMat = new THREE.MeshBasicMaterial({
                    color: 0x00d2ff,
                    transparent: true,
                    opacity: 0.9,
                    blending: THREE.AdditiveBlending
                });
                const core = new THREE.Mesh(coreGeo, coreMat);
                core.userData = { isCore: true };
                startHaloGroup.add(core);

                // 漂浮粒子簇（围绕中心旋转）
                const particleCount = 200;
                const particleGeo = new THREE.BufferGeometry();
                const particlePos = new Float32Array(particleCount * 3);
                const particleData = [];  // 存储每个粒子的运动参数
                for (let i = 0; i < particleCount; i++) {
                    const r = 200 + Math.random() * 200;
                    const theta = Math.random() * Math.PI * 2;
                    const phi = Math.random() * Math.PI;
                    particlePos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
                    particlePos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.3;  // 压扁Y轴
                    particlePos[i * 3 + 2] = r * Math.cos(phi);
                    particleData.push({
                        r: r,
                        theta: theta,
                        phi: phi,
                        speed: 0.001 + Math.random() * 0.003,
                        offset: Math.random() * Math.PI * 2
                    });
                }
                particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
                const particleMat = new THREE.PointsMaterial({
                    color: 0x88ddff,
                    size: 3,
                    sizeAttenuation: true,
                    transparent: true,
                    opacity: 0.7,
                    blending: THREE.AdditiveBlending
                });
                startHaloParticles = new THREE.Points(particleGeo, particleMat);
                startHaloParticles.userData = { data: particleData };
                startHaloGroup.add(startHaloParticles);

                // 设置位置（在屏幕上方靠后，作为标题背景装饰）
                startHaloGroup.position.set(0, 100, -200);
                bgScene.add(startHaloGroup);
            } catch (e) {
                console.warn('开始界面光环创建失败:', e);
            }
        }
        // 更新开始界面光环（每帧调用，由 animate3DBackground 调用）
        function updateStartScreenHalo() {
            if (!startHaloGroup) return;
            // 仅在开始界面可见时更新和显示
            const startScreen = document.getElementById('startScreen');
            const isVisible = startScreen && startScreen.style.display !== 'none' && !startScreen.classList.contains('fade-out');
            startHaloGroup.visible = isVisible;
            if (!isVisible) return;

            // 旋转每个环
            for (const child of startHaloGroup.children) {
                if (child.userData.speed) {
                    if (child.userData.axis === 0) child.rotation.z += child.userData.speed;
                    else if (child.userData.axis === 1) child.rotation.x += child.userData.speed;
                    else child.rotation.y += child.userData.speed;
                }
                if (child.userData.isCore) {
                    // 中心球脉冲
                    const s = 1 + Math.sin(Date.now() * 0.003) * 0.3;
                    child.scale.set(s, s, s);
                }
            }
            // 粒子围绕中心旋转
            if (startHaloParticles && startHaloParticles.userData.data) {
                const pos = startHaloParticles.geometry.attributes.position.array;
                const data = startHaloParticles.userData.data;
                const t = Date.now() * 0.001;
                for (let i = 0; i < data.length; i++) {
                    const d = data[i];
                    const angle = d.theta + t * d.speed * 10;
                    pos[i * 3]     = d.r * Math.sin(d.phi) * Math.cos(angle);
                    pos[i * 3 + 1] = d.r * Math.sin(d.phi) * Math.sin(angle) * 0.3 + Math.sin(t * 2 + d.offset) * 10;
                    pos[i * 3 + 2] = d.r * Math.cos(d.phi);
                }
                startHaloParticles.geometry.attributes.position.needsUpdate = true;
            }
            // 整组缓慢旋转
            startHaloGroup.rotation.y += 0.0008;
        }
