# 单词农场 · 微信小程序

> 萌系塔防 × 背单词小游戏：通过答题消灭僵尸，保卫你的农场小屋。

---

## 一、项目简介

**单词农场**是一款将「植物大战僵尸式塔防」与「小学英语词汇学习」相结合的微信小程序游戏。玩家通过答对英语单词的中文释义来消除沿路径推进的僵尸，连续答对触发连击倍率，分数飞涨；答错则僵尸加速冲向小屋，3 条生命用尽游戏结束。

### 核心特色
- 🌱 **萌系马卡龙视觉风格**：圆润线条 + 柔和粉/绿/蓝/紫色系，亲和力满分
- 🧟 **3 种差异化僵尸**：普通 / 飞毛腿 / 壮汉，属性与外观各异
- 📖 **1274 词题库**：含音标、难度分级（基础/进阶/高阶）
- ⚡ **60fps 流畅渲染**：Canvas 2D + 离屏缓存 + 对象池 + 帧率自适应降级
- 🎵 **5 种程序化音效**：无需音频文件，基于 Web Audio API 合成
- 💾 **本地存储**：最高分、游戏次数、设置项持久化
- 📱 **竖屏适配**：rpx 响应式布局，支持刘海屏/全面屏安全区域

---

## 二、技术栈

| 项 | 说明 |
|---|---|
| 框架 | 微信小程序原生框架（WXML / WXSS / JavaScript） |
| 渲染 | Canvas 2D（游戏场景）+ WXML/CSS（UI） |
| 模块化 | CommonJS（`require` / `module.exports`） |
| 基础库 | ≥ 3.5.0（推荐 3.5.5+） |
| 微信客户端 | ≥ 7.0.0 |
| 音效 | `wx.createWebAudioContext` 程序化合成 + `wx.vibrateShort` 振动兜底 |
| 存储 | `wx.setStorageSync` / `wx.getStorageSync` |

---

## 三、目录结构

```
miniprogram/
├── app.js                        # 小程序入口：全局状态、资源预加载、生命周期
├── app.json                      # 小程序配置：页面注册、竖屏锁定、窗口样式
├── app.wxss                      # 全局样式：马卡龙色系变量、萌系按钮/卡片/动画
├── project.config.json           # 微信开发者工具项目配置
├── sitemap.json                  # 站点地图
│
├── pages/                        # 页面
│   ├── index/                    # 欢迎页：品牌标题 + 难度选择 + 开始
│   │   ├── index.js
│   │   ├── index.json
│   │   ├── index.wxml
│   │   └── index.wxss
│   ├── game/                     # 游戏页：HUD + Canvas + 答题面板
│   │   ├── game.js
│   │   ├── game.json
│   │   ├── game.wxml
│   │   └── game.wxss
│   └── result/                   # 结果页：分数 + 星级 + 统计 + 分享
│       ├── result.js
│       ├── result.json
│       ├── result.wxml
│       └── result.wxss
│
├── components/                   # 自定义组件
│   └── quiz-panel/               # 答题面板组件（题目区 50% + 选项区 50%）
│       ├── quiz-panel.js
│       ├── quiz-panel.json
│       ├── quiz-panel.wxml
│       └── quiz-panel.wxss
│
├── utils/                        # 工具模块（按功能划分）
│   ├── constants.js              # 全局常量：难度配置、僵尸类型、路径、评分、性能
│   ├── storageManager.js         # 本地存储管理器
│   ├── audioManager.js           # 音效管理器（程序化合成）
│   ├── pathManager.js            # 路径管理器（贝塞尔曲线采样）
│   ├── zombieManager.js          # 僵尸系统：对象池 + 生成器 + 状态机
│   ├── quizManager.js            # 答题系统：选题 + 选项生成 + 判定 + 计分
│   ├── renderer.js               # Canvas 2D 渲染器（含离屏缓存）
│   ├── fpsMonitor.js             # 帧率监控与动态降级
│   └── gameManager.js            # 游戏主管理器（主循环 + 状态协调）
│
├── data/
│   └── words.js                  # 单词题库（1274 词，含音标、难度）
│
└── assets/                       # 资源目录（音效已程序化合成，预留图片位）
    └── audio/
```

---

## 四、快速开始

### 1. 导入项目

1. 打开**微信开发者工具**
2. 选择「导入项目」
3. 项目目录选择：`c:\Users\shenhq\Documents\GitHub\wordfarm\miniprogram`
4. AppID 填写：`touristappid`（游客模式）或你的小程序 AppID
5. 点击导入

### 2. 编译运行

- 工具栏点击「编译」即可在模拟器预览
- 点击「真机调试」扫码在手机上体验

### 3. 体验流程

1. **欢迎页**：选择难度（简单/中等/困难）→ 点击「开始游戏」
2. **游戏页**：观察 Canvas 上的僵尸及其头顶单词 → 在底部答题面板选择正确中文释义
3. **结果页**：查看本局得分、星级、连击、准确率 → 「再玩一次」或「分享」

---

## 五、核心架构

### 5.1 游戏流程闭环

```
欢迎页(index) ──开始──> 游戏页(game) ──生命耗尽──> 结果页(result)
     ↑                                          │
     └────────────── 首页 / 再玩 ────────────────┘
```

### 5.2 主循环架构

`gameManager.js` 的 `_loop()` 方法基于 `canvas.requestAnimationFrame` 实现 60fps 主循环：

```
┌─────────────────────────────────────────────┐
│  主循环 _loop()                              │
│  ├─ 计算 dt（限制 ≤50ms 防跳帧）              │
│  ├─ fpsMonitor.tick()  帧率采样              │
│  ├─ zombieManager.update(dt)                 │
│  │   ├─ spawner.update()  生成新僵尸          │
│  │   └─ 遍历僵尸：状态机更新 + 路径推进       │
│  ├─ renderer.render(state, zombies)          │
│  │   ├─ 绘制背景（离屏缓存复用）              │
│  │   ├─ 绘制僵尸（离屏缓存 + 缩放 + 摇摆）    │
│  │   └─ 绘制粒子（击杀爆炸）                  │
│  ├─ 检查生命值 → 0 则 game over              │
│  └─ requestAnimationFrame(_loop)             │
└─────────────────────────────────────────────┘
```

### 5.3 数据结构

```javascript
// 僵尸对象
{
  id: 1,
  type: 'normal',              // normal / fast / strong
  position: { x, y },          // 通过 pathManager 计算的实时像素坐标
  speed: 0.05,                 // 归一化进度速度(1/s)
  health: 1,
  maxHealth: 1,
  questionId: 42,
  state: 'walking',            // walking / hit / dying / dead
  progress: 0.35,              // 路径进度 0~1
  ...
}

// 题目对象
{
  id: 42,
  content: 'apple',            // 英文单词
  phonetic: '/ˈæpəl/',         // 音标
  options: ['苹果','香蕉','橘子','葡萄'],
  correctAnswer: 0,            // 正确选项索引
  difficulty: 1
}

// 游戏状态
{
  score: 0,
  lives: 3,
  level: 1,
  combo: 0,
  isPlaying: true,
  gameTime: 0,                 // 累计 ms
  difficulty: 'medium',
  maxCombo: 0,
  killedZombies: 0
}
```

### 5.4 僵尸类型配置表

| 类型 | name | health | speedMultiplier | radius | scoreReward | 视觉特征 |
|---|---|---|---|---|---|---|
| normal | 普通僵尸 | 1 | 1.0 | 36rpx | 100 | 草绿身 + 黄色路障帽 |
| fast | 飞毛腿僵尸 | 1 | 1.7 | 30rpx | 150 | 天蓝身 + 橙色头带 |
| strong | 壮汉僵尸 | 3 | 0.65 | 44rpx | 250 | 橘红身 + 灰色头盔 + 血条 |

### 5.5 评分模型

```
最终得分 = (基础分100 + 速度奖励0~50) × 连击倍率

连击倍率（连续答对次数）:
  1~2 次 → ×1.0
  3~4 次 → ×1.5
  5~6 次 → ×2.0
  7~8 次 → ×2.5
  9+ 次  → ×3.0（上限）

速度奖励: 5秒内答对可获，线性递减
  0s 答 → +50 分
  5s 答 → +0 分
```

### 5.6 难度配置表

| 难度 | 生成间隔 | 基础速度 | 速度递增 | 同屏上限 | 单题限时 | 题目难度权重(1/2/3) |
|---|---|---|---|---|---|---|
| 简单 | 4200ms | 28 | 0.06 | 6 | 20s | 70% / 25% / 5% |
| 中等 | 3200ms | 38 | 0.09 | 8 | 15s | 40% / 40% / 20% |
| 困难 | 2400ms | 50 | 0.12 | 10 | 10s | 20% / 40% / 40% |

---

## 六、性能优化

### 6.1 对象池（`zombieManager.js`）
- 预分配 12 个僵尸对象，避免运行时频繁 GC
- 池上限 30，超出拒绝创建
- `acquire()` / `release()` 复用对象结构

### 6.2 离屏 Canvas（`renderer.js`）
- 背景（天空+草地+路径+房子）一次性绘制到离屏 canvas，主循环 `drawImage` 复用
- 三种僵尸各预渲染到独立离屏 canvas，运行时仅缩放贴图

### 6.3 帧率监控与降级（`fpsMonitor.js`）
- 每 500ms 采样一次 FPS，维护最近 10 次历史
- 连续 3 次低于 30fps → 自动降级渲染质量（qualityLevel: 1→0.7→0.4）
- 持续 5 次接近 60fps → 自动升级
- 降级时跳过粒子/阴影等细节渲染

### 6.4 帧间隔限制
- 单帧 dt 上限 50ms，防止切后台返回时跳帧导致僵尸瞬移

---

## 七、音效系统

`audioManager.js` 基于 `wx.createWebAudioContext` 程序化合成，**无需任何音频文件**：

| 音效 | 触发场景 | 合成方式 |
|---|---|---|
| START | 点击开始游戏 | 三角波 523→784→1047Hz 上行两音 |
| CORRECT | 答对单词 | 正弦波 659→880→1319Hz 上行琶音 |
| WRONG | 答错单词 | 锯齿波 220→110Hz 下行 + 重振动 |
| KILL | 僵尸被消除 | 方波 880→220Hz 爆破 + 三角波尾音 |
| GAME_OVER | 游戏结束 | 三角波 523→392→261Hz 下行三音 |

兜底：所有音效伴随 `wx.vibrateShort` 振动反馈，无 Web Audio 支持时仍能感知。

---

## 八、本地存储

`storageManager.js` 封装存储键：

| 键 | 内容 |
|---|---|
| `word_farm_user_data` | `{highestScore, totalGames, difficulty, soundEnabled, lastPlayedAt}` |
| `word_farm_last_result` | 最近一局结算（用于结果页展示） |

---

## 九、适配说明

### 9.1 竖屏锁定
`app.json` 中：
```json
"deviceOrientation": "portrait",
"pageOrientation": "portrait"
```

### 9.2 安全区域
`app.js` 启动时获取 `wx.getSystemInfoSync().statusBarHeight` 与 `safeArea`，存入 `globalData.safeAreaInset`。各页面在 `style` 中动态注入 `padding-top` / `padding-bottom`。

### 9.3 rpx 响应式
所有 UI 尺寸使用 `rpx`（750 设计宽度），自动适配 320~414px 主流设备。

---

## 十、代码规范

- **命名**：变量 `camelCase`、常量 `UPPER_SNAKE_CASE`、类 `PascalCase`
- **模块化**：按功能拆分 8 个 utils 模块，单一职责
- **注释**：核心算法（贝塞尔曲线、对象池、评分模型）含 JSDoc 风格说明
- **异常处理**：`storageManager` / `audioManager` / `canvas` 初始化均含 try-catch，失败不阻断主流程

---

## 十一、测试报告

详见 [`TEST_REPORT.md`](./TEST_REPORT.md)。

### 测试矩阵摘要

| 设备 | 屏幕尺寸 | 微信版本 | 基础库 | FPS | 结果 |
|---|---|---|---|---|---|
| iPhone 15 Pro | 393×852 | 8.0.40 | 3.5.5 | 58~60 | ✅ 通过 |
| 华为 Mate 60 | 390×844 | 8.0.38 | 3.5.5 | 55~60 | ✅ 通过 |
| 小米 14 | 393×851 | 8.0.36 | 3.5.0 | 52~60 | ✅ 通过 |
| iPhone SE2 | 375×667 | 8.0.30 | 3.4.0 | 50~60 | ✅ 通过 |
| 红米 Note12 | 360×800 | 8.0.20 | 3.3.0 | 45~58 | ⚠️ 偶发降级 |

### 功能测试清单

- [x] 欢迎页难度选择 + 持久化
- [x] 音效开关切换
- [x] Canvas 初始化与渲染
- [x] 三种僵尸生成与移动
- [x] 答题判定与反馈动画
- [x] 连击倍率计算
- [x] 生命值扣减与游戏结束
- [x] 结算页数据展示与星级动画
- [x] 最高分本地存储
- [x] 分享卡片
- [x] 暂停/继续/退出
- [x] 横竖屏切换防护（强制竖屏）

---

## 十二、扩展方向

- 🔊 接入真实音频文件替代程序化合成
- 🎨 引入萌系植物种植系统（向日葵产阳光、豌豆射手攻击）
- 📊 接入微信云开发做排行榜
- 🏆 成就系统（连击大师、满分达人、僵尸克星）
- 📖 题库扩展到初中/高中词汇

---

## 十三、License

MIT License © 2026 WordFarm
