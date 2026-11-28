// ============================================================
// 文件: src/data_config.js
// 描述: 数据驱动配置文件 —— 集中管理Boss/技能/游戏参数
// 用法: 修改 data/*.json 文件后同步到此文件即可调整平衡
// 注意: 本文件由 data/ 目录下的 JSON 文件手工同步，
//        如需自动化同步可后续加入构建步骤
// 加载顺序: 必须在 config.js / bosses.js / heroes.js 之前加载
// ============================================================

// ===== Boss 配置 =====
// 来源: data/bosses.json
const BOSS_CONFIG = {
    madnessWeatherHpBonus: 1.5,
    abyssLord: {
        baseHpMult: 30,
        attackCalc: { baseMult: 3, globalMult: 2.5, damageReduction: 0.4 },
        baseRadius: 48,
        levelHpMult: { 1: 0.72, 2: 0.88 },
        levelAtkMult: [1.3, 1.6],
        enrageHpThreshold: 0.3,
        enrageCdMult: 1.43,
        moveSpeedMult: 0.6,
        attackCooldown: 60,
        attackRangeExtra: 30,
        pushDistanceExtra: 25,
        skills: {
            grow:        { cd: 300, charge: 120, duration: 120, scaleMult: 2, scaleTimer: 300 },
            laser:       { cd: 240, charge: 120, extraDuration: 50, beamCount: 8, beamLife: 55,
                           angleInterval: 0.4488, mainDmgMult: 0.7, sideDmgMult: 0.4 },
            teleport:    { cd: 360, charge: 120, duration: 120, safeDist: 120, landingDamageRange: 80 },
            bomb:        { cd: 300, charge: 120, extraDuration: 70, bombLife: 75, explosionRadius: 240, dmgMult: 2 },
            summonElite: { cd: 360, charge: 120, duration: 120, minCount: 1, maxCount: 5, spawnDist: 50 },
            timeFreeze:  { cd: 480, charge: 120, extraDuration: 130, freezeDuration: 120, flashTime: 40 }
        }
    },
    bladeMaster: {
        baseHpMult: 26.4,
        attackCalc: { baseMult: 3, globalMult: 2.5 },
        baseRadius: 42,
        enrageHpThreshold: 0.3,
        enrageCdMult: 1.625,
        moveSpeedMult: 1.0,
        chargeSpeedMult: 0.4,
        chaseDistThreshold: 80,
        attackCooldownNormal: 60,
        attackCooldownEnraged: 40,
        attackRangeExtra: 30,
        pushDistanceExtra: 25,
        skills: {
            fanBlades:  { cd: 78,  charge: 120, durationExtra: 30,  directionCount: 8, speed: 14,
                          life: 600, dmgMult: 1.8 },
            swordRain:  { cd: 156, charge: 120, duration: 120, circleCount: 15, dmgMult: 1.8 },
            rangeBoost: { cd: 234, charge: 120, duration: 120, radiusMult: 3, boostDuration: 120 },
            sharedBladeCooldown: 120,
            directBlade: { dmgMult: 2.5 },
            summon:      { minCount: 1, maxCount: 10 }
        }
    },
    madEye: {
        baseHpMult: 14.5,
        attackCalc: { baseMult: 2.5, globalMult: 2.5 },
        baseRadius: 55,
        eyePhases: {
            openDurations: [300, 300, 600, 600],
            closedDurations: [0, 300, 600, 600],
            openCdBase: 120,
            closedCdBase: 90,
            closedCdSpeedMult: 1.33
        },
        chargeSpeedMult: 0.3,
        openChaseSpeedMult: 1.0,
        closedChaseSpeedMult: 0.5,
        chaseDistThreshold: 150,
        attackCooldown: 70,
        attackRangeExtra: 30,
        attackDmgMult: 1.5,
        pushDistanceExtra: 25,
        skills: {
            laser:        { cd: 120, charge: 120, durationExtra: 50, directionCount: 8, maxLength: 700, laserLife: 45 },
            bomb:         { cd: 150, charge: 120, durationExtra: 60, extraBombCount: 9, bombLife: 65 },
            summonNormal: { eyeCd: 180, minCount: 10, maxCount: 20 },
            summonElite:  { eyeCd: 240, count: 5 },
            summonKing:   { eyeCd: 360 }
        }
    },
    youBoss: {
        baseHpMult: 21.12,
        attackCalc: { baseMult: 3, globalMult: 2.5 },
        baseRadius: 46,
        enrageHpThreshold: 0.3,
        enrageCdMult: 2.14,
        selfBurn: { tickInterval: 60, hpPercent: 0.01 },
        chargeSpeedMult: 0.3,
        normalSpeedMult: 1.0,
        chaseDistThreshold: 70,
        attackCooldown: 50,
        attackRangeExtra: 28,
        pushDistanceExtra: 22,
        skills: {
            fireRain:     { cd: 150, charge: 100, duration: 120, fireCount: 35,
                            fireballLife: 120, dmgMult: 1.2 },
            lasers:       { cd: 180, charge: 90,  duration: 120, directionCount: 10,
                            maxLength: 2500, laserLife: 40, laserWidth: 18 },
            combo:        { cd: 240, charge: 110, fireCount: 20, laserCount: 5 },
            fireAndLaser: { cd: 360, charge: 120, fireCount: 50, laserCount: 10 },
            dash:         { cd: 200, resetCd: 140, charge: 80, duration: 120, speed: 18,
                            maxReflects: 3, hitCooldown: 25, dmgMult: 2 }
        }
    },
    // ===== 劫（混沌·规则系）Boss配置 =====
    // 仅终焉及以上难度出现，压在幽之后的高强度压轴Boss
    // 贴图：三阶段各一张圆形透明PNG（assets/ 目录），按血线切换
    jieBoss: {
            baseHpMult: 52,                       // 血量翻倍：原26→52（压轴Boss需持久战）
            attackCalc: { baseMult: 3.4, globalMult: 2.8 },  // 攻击面板 10×3.4×2.8=95
            baseRadius: 600,                      // 半径600：压制性巨物，占地图约1/6直径
            normalSpeedMult: 0.85,                // 移动缓慢（帝君boss速度2.2 × 约3/5 ≈ 1.32）
            chaseDistThreshold: 400,              // 距英雄>400才移动
            attackCooldown: 60,                   // 普攻CD 1秒，仅近身半径内触发
            attackRangeExtra: 0,                  // 普攻范围=自身半径（600）
            pushDistanceExtra: 0,                 // 巨物推挤距离
            // 阶段血线（从高到低，用于切换贴图）：P1 100-70% → P2 70-40% → P3 40-0%
            phases: [
                { hpLow: 0.70, sprite: 'assets/boss1阶段贴图.png' },   // 第一阶段·棱镜
                { hpLow: 0.40, sprite: 'assets/boss2阶段贴图.png' },   // 第二阶段·极光
                { hpLow: 0.00, sprite: 'assets/boss第三阶段图.png' }   // 第三阶段·赛博核心
            ],
            // 击败掉落：10-20个数值小球（复用 maybeDropPickup 逻辑）
            pickupCountMin: 10,
            pickupCountMax: 20,
            // 边界：中心被限制在地图内，使半径边缘不越界（半径600）
            minX: 600, maxX: 3400,                // 4000宽地图 → 中心 [600,3400]
            minY: 600, maxY: 2480                 // 3080高地图 → 中心 [600,2480]
        },
        // ===== 劫Boss三阶段技能配置（混沌·规则系，压轴Boss专属） =====
        // 攻击面板 = 10×3.4×2.8 = 95
        // 伤害规则：单发伤害不变，弹幕/激光数量全部翻倍制造压迫感
        // 前摇原则：所有技能前摇拉长，供英雄留足躲避时间（压迫但不无解）
        // 概率原则：同阶段内每个技能 weight 相等，出现概率完全一致
        // 行动调度：每3秒(180帧)按当前阶段技能组概率抽一次行动，各行动独立进行互不干扰
        jieSkills: {
            // 每阶段技能池：{ 技能名: { weight概率权重, ...参数 } }
            // 阶段以血线切换（P1 100-70% / P2 70-40% / P3 40-0%）
            phase1: {
                starmeteor:   { weight: 1, meteorCount: 96, dmg: 171, speed: 16, life: 220 },     // 星陨环·96枚扇形弹幕
                rainbowBomb:  { weight: 1, charge: 150, bombCount: 16, dmg: 171, radius: 200, spread: 1050 }, // 彩虹炸弹·前摇2.5s 16颗
                pulse:        { weight: 1, charge: 200, radius: 300, dmg: 171 },                  // 星辰脉冲·前摇3.3s范围伤害
                chain:        { weight: 1, dmgPerSec: 126, duration: 200, chainCount: 3 },        // 秩序之链·3条光链追击
                flyblade:     { weight: 1, ringCount: 3, dmg: 234, speed: 14, life: 300, bladeCount: 24 }, // 星轨飞刃·三环扫射
                summonGuard:  { weight: 1, charge: 170, minCount: 4, maxCount: 10, kind: 'elite' }, // 召唤·规则守卫 白光2.8s后4-10精英
                kingLaser:    { weight: 1, charge: 130, beamCount: 12, dmg: 119, length: 5200 }   // 帝君式12向预判激光（P1版，数量减半，早期压迫感）
            },
            phase2: {
                fireDragon:   { weight: 1, dmgPerSec: 171, duration: 200, safeSector: 0.22, ringCount: 3 }, // 星轨火龙·三层旋转激光
                meteorCrush:  { weight: 1, charge: 90, dmg: 342, radius: 320, crushCount: 6 },   // 星陨重压·6连砸
                reverseBarrage:{ weight: 1, dmgPerSec: 198, duration: 180, count: 72 },          // 逆转之环·反转弹幕
                frenzyChain:  { weight: 1, charge: 100, dmgPerHit: 126, hits: 10 },               // 疯狂连锁·贴身10段
                tidalWave:    { weight: 1, dmgPerSec: 126, duration: 150, radius: 700, waveCount: 5 }, // 星海潮汐·5波压迫
                summonMinions:{ weight: 1, charge: 130, minCount: 30, maxCount: 50, kind: 'normal' }, // 召唤·崩坏守卫 30-50普通怪
                riftBlink:    { weight: 1, charge: 260, dmg: 270, radius: 280, blinkCount: 4 }   // 空间折跃·4连跳(唯一位移技能)
            },
            phase3: {
                starmeteorChaos:{ weight: 1, meteorCount: 120, dmg: 171, speed: 20, life: 200 },  // 星陨环·乱 120枚全向
                execution:    { weight: 0,  charge: 180, dmg: 684, radius: 360, exCount: 8 },    // 星劫·处决 8连爆炸(每波1次)
                laserStorm:   { weight: 1, dmgPerSec: 270, duration: 180, beamCount: 32 },       // 星轨焚天·激光风暴 32束
                chaosTide:    { weight: 1, dmgPerSec: 216, duration: 160, radius: 820, waveCount: 6 }, // 混沌潮汐·6波压迫
                summonWang:   { weight: 1, charge: 160, maxUses: 3 },                            // 召唤·王boss 最多3次(用后出池)
                pendulum:     { weight: 1, swingInterval: 15, totalSwings: 30, spawnEach: 3, chaos: true }, // 钟摆召唤 30次/次3只
                finale:       { weight: 0,  charge: 200, dmg: 342, radius: 2400 },               // 劫灭·终章 全屏(每波1次,伤害减半,留安全岛)
                color36:      { weight: 1, meteorCount: 120, dmg: 171, speed: 22, life: 190, recolored: true }, // 星陨环换色120枚
                kingLaser:    { weight: 1, charge: 130, beamCount: 20, dmg: 119, length: 5200 },  // 帝君式20向预判激光（全屏穿透）
                riftBlink:    { weight: 1, charge: 260, dmg: 270, radius: 280, blinkCount: 4 }   // 空间折跃·4连跳(P3也具备位移，威慑+压迫)
            },
            // 通用：每3秒一次行动调度
            actionInterval: 180
        }
};

// ===== 英雄数据配置 =====
// 来源: data/skills.json
// 只包含可配置的数值部分，skillImpl（技能逻辑实现）保留在 heroes.js 中
const SKILL_CONFIG = {
    heroData: {
        lubu:       { hp: 156, attack: 20,  skills: [{ cd: 180, dmg: 33 }, { cd: 300, dmg: 20 }, { cd: 180, dmg: 59 }] },
        zhaoyun:    { hp: 300, attack: 36,  skills: [{ cd: 150, dmg: 120 },{ cd: 300, dmg: 0  }, { cd: 210, dmg: 105 }] },
        diaochan:   { hp: 124, attack: 16,  skills: [{ cd: 240, dmg: 39 }, { cd: 300, dmg: 20 }, { cd: 360, dmg: 33  }] },
        guanyu:     { hp: 180, attack: 80,  skills: [{ cd: 300, dmg: 0  }, { cd: 360, dmg: 0  }, { cd: 360, dmg: 0   }] },
        huangzhong: { hp: 190, attack: 26,  skills: [{ cd: 150, dmg: 90 }, { cd: 240, dmg: 240 },{ cd: 360, dmg: 80  }] },
        machao:     { hp: 285, attack: 39,  skills: [{ cd: 160, dmg: 105 },{ cd: 300, dmg: 120 }, { cd: 360, dmg: 135 }] },
        zhugeliang: { hp: 200, attack: 110, skills: [{ cd: 270, dmg: 0  }, { cd: 240, dmg: 0  }, { cd: 300, dmg: 0   }] },
        zhangfei:   { hp: 350, attack: 60,  skills: [{ cd: 240, dmg: 80 }, { cd: 180, dmg: 240 }, { cd: 360, dmg: 0   }] },
        zhouyu:     { hp: 225, attack: 30,  skills: [{ cd: 120, dmg: 105 },{ cd: 120, dmg: 105 }, { cd: 120, dmg: 105 }] },
        lvmeng:     { hp: 156, attack: 20,  skills: [{ cd: 120, dmg: 0  }, { cd: 180, dmg: 59 }, { cd: 300, dmg: 300 }] },
        mozi:       { hp: 156, attack: 20,  skills: [{ cd: 150, dmg: 100 },{ cd: 180, dmg: 0  }, { cd: 180, dmg: 0   }] },
        hanfei:     { hp: 300, attack: 36,  skills: [{ cd: 360, dmg: 0  }, { cd: 300, dmg: 0  }, { cd: 480, dmg: 200 }] },
        cangqiong:  { hp: 154, attack: 25,  skills: [{ cd: 180, dmg: 56 }, { cd: 240, dmg: 70 }, { cd: 240, dmg: 21  }] },
        dianwei:    { hp: 280, attack: 80,  skills: [{ cd: 180, dmg: 90 }, { cd: 300, dmg: 0  }, { cd: 210, dmg: 120 }] },
        lusu:       { hp: 200, attack: 32,  skills: [{ cd: 180, dmg: 75 }, { cd: 240, dmg: 0  }, { cd: 480, dmg: 100 }] },
        zhi:        { hp: 180, attack: 30,  skills: [{ cd: 180, dmg: 80 }, { cd: 360, dmg: 0  }, { cd: 240, dmg: 150 }] },
        luxun:      { hp: 192, attack: 30,  skills: [{ cd: 180, dmg: 52 }, { cd: 300, dmg: 50 }, { cd: 300, dmg: 0   }] },
        zhenji:     { hp: 200, attack: 34,  skills: [{ cd: 180, dmg: 100 },{ cd: 300, dmg: 80 }, { cd: 480, dmg: 30  }] },
        yuji:       { hp: 260, attack: 75,  skills: [{ cd: 180, dmg: 0  }, { cd: 180, dmg: 0  }, { cd: 480, dmg: 200 }] },
        guojia:     { hp: 154, attack: 56,  skills: [{ cd: 180, dmg: 0  }, { cd: 300, dmg: 0  }] }
    },
    baseStats: {
        hp: 100, attack: 15,
        skill1: 20, skill2: 5, skill3: 40
    },
    speed: 2.3,
    skillCooldowns: {
        initial: [0, 180, 300, 180],
        max: [0, 180, 300, 180]
    }
};

// ===== 游戏全局配置 =====
// 来源: data/game_config.json
const GAME_CONFIG = {
    canvas: { width: 1280, height: 770 },
    map: { width: 4000, height: 3080 },
    gridSize: 25,
    hero: {
        speed: 2.3,
        baseHp: 100, baseAttack: 15,
        baseSkillDamage: { skill1: 20, skill2: 5, skill3: 40 },
        baseRevives: 1,
        meleeAttackRangeMult: 1.66,
        rangedAttackRangeMult: 5
    },
    enemy: {
        baseHp: 50,
        baseAttack: 10
    },
    comboTimeout: 180,
    difficulty: {
        easy: {
            label: '简单', heroSpeed: 2.3,
            enemySpeed: { normal: 1.7, elite: 1.9, archer: 0.7, boss: 1.0 },
            hpMult: 0.45, extraRevives: 0
        },
        normal: {
            label: '普通', heroSpeed: 2.3,
            enemySpeed: { normal: 1.8, elite: 2.0, archer: 0.8, boss: 1.4 },
            hpMult: 0.75, extraRevives: 0
        },
        hard: {
            label: '困难', heroSpeed: 2.3,
            enemySpeed: { normal: 1.9, elite: 2.1, archer: 0.9, boss: 1.8 },
            hpMult: 1.0, extraRevives: 0
        },
        nightmare: {
            label: '噩梦', heroSpeed: 2.3,
            enemySpeed: { normal: 2.0, elite: 2.2, archer: 1.0, boss: 2.0 },
            hpMult: 1.5, extraRevives: 1
        },
        end: {
            label: '终焉', heroSpeed: 2.3,
            enemySpeed: { normal: 2.15, elite: 2.35, archer: 1.5, boss: 2.2 },
            hpMult: 2.0, extraRevives: 3
        },
        curse: {
            label: '诅咒之夜', heroSpeed: 2.3,
            enemySpeed: { normal: 2.15, elite: 2.35, archer: 1.5, boss: 2.2 },
            hpMult: 3.0, extraRevives: 5
        },
        madness: {
            label: '疯狂之夜', heroSpeed: 2.3,
            enemySpeed: { normal: 2.15, elite: 2.35, archer: 1.5, boss: 2.2 },
            hpMult: 5.0, extraRevives: 5
        }
    }
};
