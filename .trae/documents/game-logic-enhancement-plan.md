# 游戏逻辑系统性优化与增强计划

## Context

当前小程序版《植物和僵尸》游戏存在以下局限：
1. **失败机制单薄**：3 条命扣完即败，僵尸到达终点直接扣命，缺乏策略性
2. **难度曲线平坦**：无限模式仅靠 speedRamp 随时间加速，无关卡节奏感
3. **角色多样性不足**：仅 3 种植物 + 3 种僵尸，策略组合有限
4. **无测试基础设施**：根目录 package.json 只有 nextjs 依赖，0 测试覆盖

本次优化目标：重构失败判定为"基地植物防线"机制、引入混合关卡推进、新增 3 种角色（樱桃炸弹/火焰射手/护甲僵尸）、从零搭建 jest 测试环境，全面提升游戏深度与可维护性。

用户已确认的 4 个架构决策：
- 失败条件：**基地植物防线**（3 道各 1 朵心形花，全破才失败）
- 新角色：**樱桃炸弹 + 火焰射手 + 护甲僵尸**（2 植物 + 1 僵尸）
- 关卡机制：**混合模式**（每 60s 关卡+1，显著提难度）
- 升级体系：**仅角色参数差异化**（不做动态升级系统）

---

## 实施方案

### 阶段 1：僵尸难度系统 + 关卡推进 + 核心数值调整

#### 1.1 constants.js — 难度配置扩展

在 `DIFFICULTY_CONFIG` 每个难度新增 `levelTime` 和 `levelRamp` 字段：

```javascript
primary: {
  // ...现有字段保留...
  levelTime: 60000,          // 每 60s 推进一关
  levelRamp: {               // 每关递增参数
    spawnIntervalMult: 0.92, // 生成间隔 ×0.92（更快）
    speedMult: 1.08,         // 速度 ×1.08
    strongProbBonus: 0.05,   // strong+armored 概率 +5%
  }
}
```

#### 1.2 constants.js — 僵尸属性调整 + 新增护甲僵尸

调整现有 3 种僵尸 HP，新增 armored：

| 僵尸 | HP（旧→新） | 速度倍率 | 攻击间隔 | 分值 | 说明 |
|---|---|---|---|---|---|
| normal | 1→**2** | 1.0x | 1000ms | 100 | 基础怪，2 发豌豆击杀 |
| fast | 1→**1** | 1.7x | 1000ms | 150 | 飞毛腿，1 发击杀但跑得快 |
| strong | 3→**5** | 0.65x | 800ms | 250 | 壮汉，需要持续输出 |
| **armored（新）** | **6** | 0.8x | 1000ms | 300 | 护甲怪，高 DPS 考验 |

在 `ZOMBIE_TYPES` 新增 armored 定义，在 `ZOMBIE_TYPE_WEIGHTS` 各难度加入 armored 权重（从 strong 中拆分）。

#### 1.3 constants.js — 新增关卡常量

```javascript
const LEVEL = {
  TIME_PER_LEVEL: 60000,     // 每关 60 秒
  MAX_LEVEL: 20,             // 软上限（超过后不再加速，保持极限）
  RAMP: {
    SPAWN_INTERVAL_MULT: 0.92,
    SPEED_MULT: 1.08,
    STRONG_PROB_BONUS: 0.05,
  }
};
```

#### 1.4 gameManager.js — 关卡推进逻辑

在 `state` 新增 `level: 1` 和 `levelTimer: 0`。在 `_loop()` 主循环中：

```javascript
// 关卡推进（混合模式）
this.state.levelTimer += dt;
if (this.state.levelTimer >= LEVEL.TIME_PER_LEVEL && this.state.level < LEVEL.MAX_LEVEL) {
  this.state.level++;
  this.state.levelTimer = 0;
  zombieManager.applyLevelRamp(this.state.level);  // 通知僵尸系统刷新参数
  // UI 反馈：关卡+1 提示
  if (this.onLevelChange) this.onLevelChange(this.state.level);
}
```

#### 1.5 zombieManager.js — 关卡递增参数

在 `ZombieSpawner` 新增 `applyLevelRamp(level)` 方法，根据 level 动态调整 `spawnInterval`、`baseSpeed`、`typeWeights`：

```javascript
applyLevelRamp(level) {
  const r = LEVEL.RAMP;
  const mult = Math.pow(r.SPAWN_INTERVAL_MULT, level - 1);
  this.spawnInterval = Math.max(1200, this._baseSpawnInterval * mult);
  this.baseSpeed = this._baseBaseSpeed * Math.pow(r.SPEED_MULT, level - 1);
  // strong+armored 概率随关卡递增
  const bonus = r.STRONG_PROB_BONUS * (level - 1);
  this.typeWeights = this._adjustWeights(bonus);
}
```

#### 1.6 constants.js — 核心数值重新校准

| 参数 | 旧值 | 新值 | 理由 |
|---|---|---|---|
| SUNLIGHT.INITIAL | 100 | **150** | 新植物 cost 更高，初始阳光需增加 |
| SUNLIGHT.REWARD_CORRECT | 25 | **30** | 答对奖励微增，鼓励答题 |
| LIVES.INITIAL | 3 | **3**（含义改为防线数） | 数值不变但语义变更 |
| COMBAT.ZOMBIE_ATTACK_DAMAGE | 1 | **1** | 不变，基地植物 HP=5 需啃 5 次 |

---

### 阶段 2：失败条件重构 — 基地植物防线

#### 2.1 constants.js — 基地植物定义

新增 `BASE_PLANT` 常量：

```javascript
const BASE_PLANT = {
  TYPE: 'heart_base',
  NAME: '心形花',
  HEALTH: 5,
  SLOT: 4,               // 最靠近房子侧的槽位
  COLORS: { body: '#F48FB1', accent: '#EC407A', glow: '#F8BBD0' }
};
```

在 `PLANT_TYPES` 新增 `heart_base` 定义（但 `PLANT_ORDER` 不含它，商店不展示）。

#### 2.2 plantManager.js — 基地植物初始化

新增 `initBasePlants()` 方法，在 `reset()` 后由 gameManager 调用：

```javascript
initBasePlants() {
  for (let lane = 0; lane < GRID.ROWS; lane++) {
    const pos = pathManager.getGridCellCenter(lane, BASE_PLANT.SLOT);
    this.plants.push({
      id: __plantIdSeed++,
      type: BASE_PLANT.TYPE,
      isBase: true,           // 标记为基地植物
      lane: lane,
      slot: BASE_PLANT.SLOT,
      x: pos.x, y: pos.y,
      health: BASE_PLANT.HEALTH,
      maxHealth: BASE_PLANT.HEALTH,
      state: 'idle',
      hitFlash: 0,
      active: true
    });
  }
}
```

修改 `placePlant()`：禁止在 slot=4 放置玩家植物（基地植物占据）。

修改 `takeDamage()`：基地植物被摧毁时触发回调 `onBaseDestroyed(lane)`。

#### 2.3 gameManager.js — 失败判定重构

```javascript
// state 中 lives → defenseLines
this.state.defenseLines = 3;  // 3 道防线

// _resolveZombiePlantCombat 中，基地植物被摧毁时：
_onBaseDestroyed(lane) {
  this.state.defenseLines--;
  if (this.onDefenseChange) this.onDefenseChange(this.state.defenseLines);
  // 全部防线突破 → 游戏结束
  if (this.state.defenseLines <= 0) {
    this._gameOver();
  }
}

// _onZombieReachEnd 改为：僵尸越过已破防线后消失（不再扣命）
_onZombieReachEnd(zombie) {
  // 防线已破，僵尸冲入房子，仅清除僵尸（不扣命）
  // 振动反馈
  wx.vibrateShort && wx.vibrateShort({ type: 'medium' });
}
```

移除 `state.lives`，新增 `state.defenseLines`。移除 `onLifeChange` 回调，新增 `onDefenseChange`。

#### 2.4 game.js + game.wxml — UI 适配

**game.wxml** L20-26 生命值区域改为防线显示：
```xml
<view class="hud-item hud-defense">
  <view class="hud-label">防线</view>
  <view class="lives-row">
    <text wx:for="{{[1,2,3]}}" wx:key="*this" class="flower {{defenseLines >= item ? 'on' : 'off'}}">🌸</text>
  </view>
</view>
```

**game.js**：
- `data.lives` → `data.defenseLines`
- `onLifeChange` → `onDefenseChange`
- 新增 `data.level` 和 `onLevelChange` 回调（HUD 显示当前关卡）

**game.wxss**：`.heart` → `.flower`，颜色从红 ❤️ 调整为粉 🌸 莫兰迪色系。

#### 2.5 renderer.js — 基地植物绘制

新增 `_drawHeartBase(plant)` 方法：
- 绘制心形花朵（复用现有 `_drawHeartShape` 工具函数）
- 粉色莫兰迪色系（`BASE_PLANT.COLORS`）
- 受击时闪烁（hitFlash 已有机制）
- HP 低于 40% 时添加裂纹效果

---

### 阶段 3：3 种新角色

#### 3.1 樱桃炸弹（cherry）— 植物·范围爆炸

**constants.js PLANT_TYPES 新增**：
```javascript
cherry: {
  type: 'cherry', name: '樱桃炸弹', emoji: '🍒',
  cost: 100, health: 1, damage: 10,
  attackInterval: 0, range: 0,        // 不发射投射物
  isExplosive: true,
  fuseTime: 2000,                     // 引信 2 秒
  blastRadius: 0.15,                  // 爆炸范围（progress 单位，≈3 槽位）
  color: '#E53935'
}
```

**plantManager.js**：
- 放置后启动 `fuseTimer`，倒计时 2 秒
- 引信结束触发 `onExplode(plant)` 回调
- gameManager 中 `_onPlantExplode`：对 blastRadius 范围内所有僵尸造成 10 点范围伤害 + 粒子爆炸效果
- 爆炸后植物消失（state='dead'）

**renderer.js `_drawCherry`**：
- 红色双圆球（两个樱桃）+ 绿色叶子 + 引信火花
- 倒计时最后 0.5 秒快速闪烁（缩放脉动）
- 引爆瞬间白色闪光 + 红色粒子爆炸

**RENDER_TOKENS 新增色系**：`C_BODY: '#E53935'`, `C_DARK: '#C62828'`, `C_LEAF: '#66BB6A'`, `C_FUSE: '#FFCA28'`

#### 3.2 火焰射手（fire）— 植物·穿透伤害

**constants.js PLANT_TYPES 新增**：
```javascript
fire: {
  type: 'fire', name: '火焰射手', emoji: '🔥',
  cost: 175, health: 3, damage: 3,
  attackInterval: 1500, range: Infinity,
  color: '#FF7043',
  projectile: { type: 'fire', speed: 280, color: '#FF5722', radius: 10,
                pierce: true, pierceMax: 3 }  // 穿透最多 3 个僵尸
}
```

**plantManager.js**：
- 修改投射物碰撞逻辑：`pierce: true` 的投射物命中后不消失，继续飞行
- 新增 `pierceCount` 字段，命中 `pierceMax` 次后消失
- 火球命中后附加"燃烧"效果（可选：2 秒内额外 1 点伤害）

**renderer.js `_drawFire`**：
- 橙红色圆头 + 火焰发射口（锯齿状）+ 顶火焰摇曳
- 火球投射物：橙红渐变 + 拖尾粒子

**RENDER_TOKENS 新增色系**：`FI_BODY: '#FF7043'`, `FI_DARK: '#D84315'`, `FI_FLAME: '#FFCA28'`, `FI_PROJ: '#FF5722'`

#### 3.3 护甲僵尸（armored）— 僵尸·高血量

**constants.js ZOMBIE_TYPES 新增**：
```javascript
armored: {
  type: 'armored', name: '护甲僵尸',
  color: '#90A4AE', accentColor: '#CFD8DC',
  baseHealth: 6, speedMultiplier: 0.8,
  radius: 40, scoreReward: 300,
  assetKey: 'zombie_armored'
}
```

**ZOMBIE_TYPE_WEIGHTS 各难度新增 armored 权重**（从 strong 中拆分）：
```javascript
primary: { normal: 0.65, fast: 0.20, strong: 0.08, armored: 0.07 },
middle:  { normal: 0.50, fast: 0.28, strong: 0.12, armored: 0.10 },
college: { normal: 0.35, fast: 0.30, strong: 0.20, armored: 0.15 }
```

**renderer.js `_renderZombieToOffscreen`**：
- 在 type 分发中新增 `armored` 分支
- 视觉：灰色金属头盔（比 strong 更大、更方）+ 胸甲板 + 铆钉细节
- 复用现有僵尸身体结构（头/眼/嘴/腮红），仅替换头饰

**RENDER_TOKENS 新增色系**：`Z_ARMOR: '#90A4AE'`, `Z_ARMOR_DARK: '#607D8B'`, `Z_RIVET: '#CFD8DC'`

#### 3.4 商店栏适配

**game.js `buildShopItems()`**：PLANT_ORDER 新增 `'cherry'`, `'fire'`，商店栏从 3 个植物扩展到 5 个（横向滚动已支持）。

**game.wxss shop-avatar**：新增 `.shop-avatar-cherry` 和 `.shop-avatar-fire` 的 CSS 头像样式（与 Canvas 绘制 1:1 对齐，遵循 RENDER_TOKENS）。

---

### 阶段 4：测试验证

#### 4.1 搭建 jest 测试环境

**package.json**（根目录）新增 devDependencies 和 test 脚本：
```json
{
  "scripts": { "test": "jest" },
  "devDependencies": { "jest": "^29.7.0" }
}
```

**jest.config.js**（新建）：
```javascript
module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/tests/setup.js'],
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  collectCoverageFrom: ['miniprogram/utils/**/*.js']
};
```

#### 4.2 Mock 基础设施

**tests/setup.js**（新建）— mock `wx` 全局对象 + Canvas 2D 上下文：
```javascript
global.wx = {
  vibrateShort: () => {},
  showToast: () => {},
  // ... 其他用到的 wx API
};
global.canvas = { requestAnimationFrame: () => 0, cancelAnimationFrame: () => {} };
```

**tests/helpers/mockPathManager.js** — mock pathManager 的坐标计算，避免依赖真实 Canvas 尺寸。

#### 4.3 单元测试用例

**tests/zombieManager.test.js**：
- 僵尸生成按权重分布（统计 1000 次生成，验证概率误差 <5%）
- 僵尸移动 progress 随 dt 递增
- takeDamage 减血 + 死亡状态转换
- 减速/加速 buff 计时衰减
- 关卡递增 applyLevelRamp 参数刷新
- 护甲僵尸 6HP 正确

**tests/plantManager.test.js**：
- 植物放置 / 越界 / 占位检测
- 基地植物初始化（3 道各 1 个）
- 基地植物被摧毁触发 onBaseDestroyed
- 樱桃炸弹引信倒计时 + 爆炸范围伤害
- 火焰射手穿透投射物命中多个僵尸
- 投射物圆形碰撞检测

**tests/gameManager.test.js**：
- 关卡推进（模拟 60s 后 level+1）
- 失败判定（3 道防线全破 → game over）
- 答对加阳光 / 答错加速僵尸
- 阳光经济（购买植物扣阳光、阳光不足拒绝）

**tests/integration.test.js**：
- 模拟完整游戏流程：initGame → start → 模拟答题 → 模拟僵尸生成 → 模拟防线被破 → game over
- 验证结算数据正确性

#### 4.4 运行测试

```bash
npm install  # 安装 jest
npm test     # 运行所有测试
```

---

## 关键文件清单

| 文件 | 修改类型 | 说明 |
|---|---|---|
| `miniprogram/utils/constants.js` | 改 | 难度配置扩展、僵尸属性调整、新角色定义、BASE_PLANT、LEVEL 常量 |
| `miniprogram/utils/gameManager.js` | 改 | 关卡推进、失败条件重构、新角色事件处理、移除 lives 改 defenseLines |
| `miniprogram/utils/zombieManager.js` | 改 | applyLevelRamp、护甲僵尸、typeWeights 动态调整 |
| `miniprogram/utils/plantManager.js` | 改 | initBasePlants、樱桃炸弹引信、火焰穿透投射物、基地植物被毁回调 |
| `miniprogram/utils/renderer.js` | 改 | _drawCherry / _drawFire / _drawHeartBase / armored 僵尸绘制、RENDER_TOKENS 新色系 |
| `miniprogram/pages/game/game.js` | 改 | lives→defenseLines、level 显示、新植物商店项、新回调绑定 |
| `miniprogram/pages/game/game.wxml` | 改 | HUD 防线显示、关卡显示 |
| `miniprogram/pages/game/game.wxss` | 改 | .flower 样式、新 shop-avatar 样式 |
| `package.json` | 改 | jest devDependency + test 脚本 |
| `jest.config.js` | 新建 | jest 配置 |
| `tests/setup.js` | 新建 | wx / Canvas mock |
| `tests/helpers/mockPathManager.js` | 新建 | pathManager mock |
| `tests/zombieManager.test.js` | 新建 | 僵尸系统单元测试 |
| `tests/plantManager.test.js` | 新建 | 植物系统单元测试 |
| `tests/gameManager.test.js` | 新建 | 游戏管理器单元测试 |
| `tests/integration.test.js` | 新建 | 集成测试 |

## 可复用的现有函数

- `renderer._drawHeartShape(ctx, x, y, size)` — 樱桃炸弹和基地植物的心形绘制
- `renderer._drawStarShape(ctx, x, y, r, points, innerRatio)` — 爆炸粒子
- `renderer._drawCuteFace(ctx, cx, cy, r, opts)` — 新角色复用统一表情系统
- `renderer._strokeW(coeff)` / `_setStroke(ctx, style, w)` — 动态描边
- `pathManager.getGridCellCenter(lane, slot)` — 基地植物定位
- `pathManager.getPosition(pathIndex, progress)` — 爆炸范围判定坐标
- `zombieManager.takeDamage(zombie, amount, opts)` — 伤害结算（已有减速支持）

## 验证方案

1. **语法检查**：`node -c` 所有修改的 JS 文件
2. **单元测试**：`npm test` 运行 jest，确保全部通过
3. **手工验证**（微信开发者工具）：
   - 开始游戏 → 确认 3 朵基地花显示在 slot=4
   - 放置樱桃炸弹 → 2 秒后爆炸 → 范围内僵尸死亡
   - 放置火焰射手 → 炮弹穿透多个僵尸
   - 护甲僵尸出现 → 6HP 需多发命中
   - 关卡推进 → 60 秒后 HUD 显示关卡+1 + 难度提升可感知
   - 僵尸啃掉 1 朵基地花 → 防线 3→2 + 该道僵尸可冲过
   - 3 朵全破 → 游戏结束 → 结算页正常
4. **视觉一致性**：新角色风格与 RENDER_TOKENS 莫兰迪色系统一
5. **性能验证**：60fps 稳定（新角色不引入渲染瓶颈）
