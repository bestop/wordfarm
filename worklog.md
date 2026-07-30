---
Task ID: 1
Agent: main
Task: 创建植物大战僵尸背单词小游戏

Work Log:
- 初始化 Next.js 16 全栈开发环境
- 创建游戏数据文件 `/src/game/data.ts`：80+ 单词库（3个难度等级）、6种植物定义、4种僵尸定义、5波次配置、游戏常量
- 实现完整游戏组件 `/src/components/game/PvZGame.tsx`（~1060行）：
  - Canvas 渲染引擎：草坪背景、植物/僵尸/弹道/阳光/特效绘制
  - 游戏循环：requestAnimationFrame 驱动，delta time 计算
  - 植物系统：种植、攻击（豌豆/冰冻/连发）、阳光生产、樱桃炸弹爆炸
  - 僵尸系统：4种僵尸（普通/路障/铁桶/旗帜），行走动画，啃食植物，减速效果
  - 答题系统：4选1中文释义，10秒倒计时，难度分级（前3题必为简单），连击奖励
  - 阳光系统：答题获得、向日葵产生、天降阳光、点击收集
  - 5波僵尸，递增难度
  - 游戏结束/胜利界面
- 修复 Canvas 尺寸问题（ResizeObserver 依赖 phase）
- 修复 JSX 注释语法错误
- 游戏平衡调整：初始阳光200、僵尸减速、波次间隔延长、前3题简单难度
- 浏览器验证：开始画面、答题系统（sun 150→175验证）、植物种植（sun 175→100验证）、Canvas渲染

Stage Summary:
- 交付文件：`src/game/data.ts`, `src/components/game/PvZGame.tsx`, `src/app/page.tsx`
- 所有核心功能已实现并验证
- ESLint 通过，编译成功
