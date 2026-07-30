// ============================================// 植物大战僵尸 · 背单词游戏 - 数据定义// ============================================

// ---- 单词库 ----
export interface Word {
  en: string;
  zh: string;
  difficulty: 1 | 2 | 3;
}

export const WORD_BANK: Word[] = [
  // 简单 (difficulty 1)
  { en: 'apple', zh: '苹果', difficulty: 1 },
  { en: 'banana', zh: '香蕉', difficulty: 1 },
  { en: 'cat', zh: '猫', difficulty: 1 },
  { en: 'dog', zh: '狗', difficulty: 1 },
  { en: 'book', zh: '书', difficulty: 1 },
  { en: 'pen', zh: '钢笔', difficulty: 1 },
  { en: 'red', zh: '红色的', difficulty: 1 },
  { en: 'blue', zh: '蓝色的', difficulty: 1 },
  { en: 'happy', zh: '快乐的', difficulty: 1 },
  { en: 'sad', zh: '伤心的', difficulty: 1 },
  { en: 'water', zh: '水', difficulty: 1 },
  { en: 'food', zh: '食物', difficulty: 1 },
  { en: 'house', zh: '房子', difficulty: 1 },
  { en: 'tree', zh: '树', difficulty: 1 },
  { en: 'sun', zh: '太阳', difficulty: 1 },
  { en: 'moon', zh: '月亮', difficulty: 1 },
  { en: 'star', zh: '星星', difficulty: 1 },
  { en: 'fish', zh: '鱼', difficulty: 1 },
  { en: 'bird', zh: '鸟', difficulty: 1 },
  { en: 'flower', zh: '花', difficulty: 1 },
  { en: 'mother', zh: '母亲', difficulty: 1 },
  { en: 'father', zh: '父亲', difficulty: 1 },
  { en: 'friend', zh: '朋友', difficulty: 1 },
  { en: 'school', zh: '学校', difficulty: 1 },
  { en: 'music', zh: '音乐', difficulty: 1 },
  { en: 'dream', zh: '梦想', difficulty: 1 },
  { en: 'light', zh: '光', difficulty: 1 },
  { en: 'dark', zh: '黑暗的', difficulty: 1 },
  { en: 'rain', zh: '雨', difficulty: 1 },
  { en: 'snow', zh: '雪', difficulty: 1 },
  // 中等 (difficulty 2)
  { en: 'beautiful', zh: '美丽的', difficulty: 2 },
  { en: 'important', zh: '重要的', difficulty: 2 },
  { en: 'different', zh: '不同的', difficulty: 2 },
  { en: 'remember', zh: '记住', difficulty: 2 },
  { en: 'problem', zh: '问题', difficulty: 2 },
  { en: 'country', zh: '国家', difficulty: 2 },
  { en: 'morning', zh: '早晨', difficulty: 2 },
  { en: 'weather', zh: '天气', difficulty: 2 },
  { en: 'kitchen', zh: '厨房', difficulty: 2 },
  { en: 'promise', zh: '承诺', difficulty: 2 },
  { en: 'special', zh: '特别的', difficulty: 2 },
  { en: 'answer', zh: '回答', difficulty: 2 },
  { en: 'decide', zh: '决定', difficulty: 2 },
  { en: 'experience', zh: '经验', difficulty: 2 },
  { en: 'mountain', zh: '山', difficulty: 2 },
  { en: 'question', zh: '问题', difficulty: 2 },
  { en: 'together', zh: '一起', difficulty: 2 },
  { en: 'believe', zh: '相信', difficulty: 2 },
  { en: 'practice', zh: '练习', difficulty: 2 },
  { en: 'student', zh: '学生', difficulty: 2 },
  { en: 'teacher', zh: '老师', difficulty: 2 },
  { en: 'journey', zh: '旅程', difficulty: 2 },
  { en: 'treasure', zh: '宝藏', difficulty: 2 },
  { en: 'courage', zh: '勇气', difficulty: 2 },
  { en: 'ancient', zh: '古老的', difficulty: 2 },
  { en: 'village', zh: '村庄', difficulty: 2 },
  { en: 'library', zh: '图书馆', difficulty: 2 },
  // 困难 (difficulty 3)
  { en: 'accomplish', zh: '完成', difficulty: 3 },
  { en: 'environment', zh: '环境', difficulty: 3 },
  { en: 'extraordinary', zh: '非凡的', difficulty: 3 },
  { en: 'fundamental', zh: '基本的', difficulty: 3 },
  { en: 'imagination', zh: '想象力', difficulty: 3 },
  { en: 'opportunity', zh: '机会', difficulty: 3 },
  { en: 'particular', zh: '特定的', difficulty: 3 },
  { en: 'remarkable', zh: '显著的', difficulty: 3 },
  { en: 'significance', zh: '重要性', difficulty: 3 },
  { en: 'vulnerable', zh: '脆弱的', difficulty: 3 },
  { en: 'appreciate', zh: '欣赏', difficulty: 3 },
  { en: 'communicate', zh: '交流', difficulty: 3 },
  { en: 'demonstrate', zh: '展示', difficulty: 3 },
  { en: 'enthusiasm', zh: '热情', difficulty: 3 },
  { en: 'independence', zh: '独立', difficulty: 3 },
  { en: 'perseverance', zh: '毅力', difficulty: 3 },
  { en: 'responsibility', zh: '责任', difficulty: 3 },
  { en: 'accommodate', zh: '容纳', difficulty: 3 },
  { en: 'consequence', zh: '后果', difficulty: 3 },
  { en: 'perspective', zh: '视角', difficulty: 3 },
];

// ---- 植物定义 ----
export interface PlantDef {
  id: string;
  name: string;
  cost: number;
  hp: number;
  emoji: string;
  color: string;
  description: string;
  attack?: number;
  attackSpeed?: number;
  sunProduction?: number;
  sunInterval?: number;
  slowEffect?: number;
  doubleShot?: boolean;
  explosive?: boolean;
  explosionDamage?: number;
  explosionRange?: number;
}

export const PLANT_DEFS: Record<string, PlantDef> = {
  sunflower: {
    id: 'sunflower',
    name: '向日葵',
    cost: 50,
    hp: 100,
    emoji: '🌻',
    color: '#FFD700',
    description: '每8秒产生25阳光',
    sunProduction: 25,
    sunInterval: 8000,
  },
  peashooter: {
    id: 'peashooter',
    name: '豌豆射手',
    cost: 100,
    hp: 100,
    emoji: '🫛',
    color: '#4CAF50',
    description: '发射豌豆攻击僵尸',
    attack: 20,
    attackSpeed: 1500,
  },
  wallnut: {
    id: 'wallnut',
    name: '坚果墙',
    cost: 50,
    hp: 600,
    emoji: '🥜',
    color: '#8B6914',
    description: '高生命值阻挡僵尸',
  },
  snowpea: {
    id: 'snowpea',
    name: '寒冰射手',
    cost: 175,
    hp: 100,
    emoji: '🧊',
    color: '#00BCD4',
    description: '冰冻豌豆减速僵尸',
    attack: 20,
    attackSpeed: 1500,
    slowEffect: 0.5,
  },
  repeater: {
    id: 'repeater',
    name: '双发射手',
    cost: 200,
    hp: 100,
    emoji: '🌿',
    color: '#2E7D32',
    description: '连发两颗豌豆',
    attack: 20,
    attackSpeed: 1500,
    doubleShot: true,
  },
  cherrybomb: {
    id: 'cherrybomb',
    name: '樱桃炸弹',
    cost: 150,
    hp: 100,
    emoji: '🍒',
    color: '#F44336',
    description: '爆炸消灭周围僵尸',
    explosive: true,
    explosionDamage: 1800,
    explosionRange: 1,
  },
};

export type PlantType = keyof typeof PLANT_DEFS;
export const PLANT_ORDER: PlantType[] = ['sunflower', 'peashooter', 'wallnut', 'snowpea', 'repeater', 'cherrybomb'];

// ---- 僵尸定义 ----
export interface ZombieDef {
  id: string;
  name: string;
  hp: number;
  speed: number;
  damage: number;
  attackSpeed: number;
  color: string;
  emoji: string;
}

export const ZOMBIE_DEFS: Record<string, ZombieDef> = {
  normal: {
    id: 'normal', name: '普通僵尸', hp: 200, speed: 18, damage: 100, attackSpeed: 1000, color: '#6B8E23', emoji: '🧟',
  },
  cone: {
    id: 'cone', name: '路障僵尸', hp: 370, speed: 18, damage: 100, attackSpeed: 1000, color: '#FF8C00', emoji: '🧟',
  },
  bucket: {
    id: 'bucket', name: '铁桶僵尸', hp: 650, speed: 18, damage: 100, attackSpeed: 1000, color: '#708090', emoji: '🧟',
  },
  flag: {
    id: 'flag', name: '旗帜僵尸', hp: 200, speed: 30, damage: 100, attackSpeed: 1000, color: '#DC143C', emoji: '🚩',
  },
};

export type ZombieType = keyof typeof ZOMBIE_DEFS;

// ---- 波次配置 ----
export interface WaveConfig {
  zombies: { type: ZombieType; row?: number; delay: number }[];
}

export const WAVE_CONFIGS: WaveConfig[] = [
  // Wave 1 - 简单
  {
    zombies: [
      { type: 'normal', delay: 8000 },
      { type: 'normal', delay: 15000 },
      { type: 'normal', delay: 25000 },
    ],
  },
  // Wave 2 - 路障出现
  {
    zombies: [
      { type: 'normal', delay: 5000 },
      { type: 'normal', delay: 10000 },
      { type: 'cone', delay: 16000 },
      { type: 'normal', delay: 22000 },
      { type: 'cone', delay: 28000 },
    ],
  },
  // Wave 3 - 大量僵尸
  {
    zombies: [
      { type: 'normal', delay: 5000 },
      { type: 'cone', delay: 9000 },
      { type: 'normal', delay: 13000 },
      { type: 'normal', delay: 17000 },
      { type: 'cone', delay: 21000 },
      { type: 'bucket', delay: 26000 },
      { type: 'normal', delay: 30000 },
    ],
  },
  // Wave 4 - 铁桶大潮
  {
    zombies: [
      { type: 'cone', delay: 5000 },
      { type: 'normal', delay: 8000 },
      { type: 'bucket', delay: 12000 },
      { type: 'normal', delay: 15000 },
      { type: 'cone', delay: 19000 },
      { type: 'normal', delay: 22000 },
      { type: 'bucket', delay: 26000 },
      { type: 'cone', delay: 30000 },
      { type: 'normal', delay: 34000 },
    ],
  },
  // Wave 5 - 最终波
  {
    zombies: [
      { type: 'flag', delay: 5000 },
      { type: 'cone', delay: 8000 },
      { type: 'bucket', delay: 12000 },
      { type: 'normal', delay: 15000 },
      { type: 'cone', delay: 19000 },
      { type: 'bucket', delay: 23000 },
      { type: 'normal', delay: 27000 },
      { type: 'cone', delay: 31000 },
      { type: 'bucket', delay: 35000 },
      { type: 'cone', delay: 39000 },
      { type: 'bucket', delay: 43000 },
      { type: 'normal', delay: 47000 },
    ],
  },
];

// ---- 游戏常量 ----
export const GRID_COLS = 9;
export const GRID_ROWS = 5;
export const STARTING_SUN = 150;
export const QUIZ_SUN_REWARD: Record<number, number> = { 1: 25, 2: 50, 3: 75 };
export const QUIZ_TIME_LIMIT = 10000; // 10秒答题时间
export const QUIZ_COOLDOWN = 2000; // 答题后冷却时间
export const NATURAL_SUN_INTERVAL = 12000; // 天然阳光掉落间隔
export const NATURAL_SUN_VALUE = 25;
export const ZOMBIE_SPEED_BOOST = 1.5; // 答错题僵尸加速倍率
export const ZOMBIE_SPEED_BOOST_DURATION = 5000; // 加速持续时间
