'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  WORD_BANK, PLANT_DEFS, PLANT_ORDER, ZOMBIE_DEFS,
  GRID_COLS, GRID_ROWS, STARTING_SUN, QUIZ_SUN_REWARD,
  QUIZ_TIME_LIMIT, QUIZ_COOLDOWN, NATURAL_SUN_INTERVAL,
  NATURAL_SUN_VALUE, ZOMBIE_SPEED_BOOST, ZOMBIE_SPEED_BOOST_DURATION,
  WAVE_CONFIGS,
} from '@/game/data';
import type { PlantType, ZombieType, Word } from '@/game/data';

// ============ Internal Types ============
type GamePhase = 'menu' | 'playing' | 'gameover' | 'victory';

interface Plant {
  id: string; type: PlantType; row: number; col: number;
  hp: number; maxHp: number; lastAttack: number; lastSun: number;
  animPhase: number;
}

interface Zombie {
  id: string; type: ZombieType; row: number; x: number;
  hp: number; maxHp: number; speed: number; baseSpeed: number;
  eating: boolean; slowed: boolean; slowTimer: number;
  lastHit: number; animPhase: number; dead: boolean; deathTimer: number;
}

interface Projectile {
  id: string; row: number; x: number; speed: number;
  damage: number; slow: boolean; active: boolean;
}

interface Sun {
  id: string; x: number; y: number; targetY: number;
  value: number; timer: number; collected: boolean;
  opacity: number; scale: number;
}

interface Explosion {
  id: string; x: number; y: number; radius: number;
  maxRadius: number; timer: number; maxTimer: number;
}

interface FloatingText {
  id: string; x: number; y: number; text: string;
  color: string; timer: number; maxTimer: number;
}

interface WordQuestion {
  word: Word; options: string[]; correctIndex: number;
  timer: number; answered: boolean; wasCorrect?: boolean;
}

interface GameState {
  phase: GamePhase;
  sun: number; score: number; wave: number;
  plants: Plant[]; zombies: Zombie[]; projectiles: Projectile[];
  suns: Sun[]; explosions: Explosion[]; floatingTexts: FloatingText[];
  selectedPlant: PlantType | null;
  currentQuiz: WordQuestion | null;
  quizCooldown: number;
  wordsAnswered: number; wordsCorrect: number;
  waveStartTime: number; waveZombiesSpawned: number;
  totalKills: number; lastTime: number;
  nextNaturalSun: number;
  zombieSpeedBoostEnd: number;
  usedWordIndices: Set<number>;
  shakeTimer: number;
  comboCount: number;
}

// ============ Helpers ============
let _idCounter = 0;
const uid = () => `e${++_idCounter}`;

const shuffle = <T,>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// ============ Component ============
export default function PvZGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const gs = useRef<GameState | null>(null);
  const rafRef = useRef<number>(0);
  const [phase, setPhase] = useState<GamePhase>('menu');
  const [uiTick, setUiTick] = useState(0);
  const forceUpdate = useCallback(() => setUiTick(t => t + 1), []);

  // Canvas dimensions
  const dims = useRef({ w: 900, h: 500, cellW: 80, cellH: 90, ox: 30, oy: 15 });

  const recalcDims = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = rect.width;
    const h = rect.height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cellW = (w * 0.9) / GRID_COLS;
    const cellH = (h * 0.95) / GRID_ROWS;
    const ox = w * 0.07;
    const oy = h * 0.025;
    dims.current = { w, h, cellW, cellH, ox, oy };
  }, []);

  // ---- Init game state ----
  const initGame = useCallback(() => {
    _idCounter = 0;
    const state: GameState = {
      phase: 'playing', sun: STARTING_SUN, score: 0, wave: 0,
      plants: [], zombies: [], projectiles: [], suns: [],
      explosions: [], floatingTexts: [],
      selectedPlant: null, currentQuiz: null, quizCooldown: 0,
      wordsAnswered: 0, wordsCorrect: 0,
      waveStartTime: Date.now(), waveZombiesSpawned: 0,
      totalKills: 0, lastTime: Date.now(),
      nextNaturalSun: Date.now() + 8000,
      zombieSpeedBoostEnd: 0, usedWordIndices: new Set(),
      shakeTimer: 0, comboCount: 0,
    };
    gs.current = state;
    setPhase('playing');
    generateQuiz(state);
    forceUpdate();
  }, [forceUpdate]);

  // ---- Generate quiz ----
  const generateQuiz = useCallback((state: GameState) => {
    // First 3 questions are always easy difficulty
    const difficultyFilter = state.wordsAnswered < 3 ? 1 : 0;
    const available = WORD_BANK.map((_, i) => i).filter(
      i => !state.usedWordIndices.has(i) && (!difficultyFilter || WORD_BANK[i].difficulty === 1)
    );
    if (available.length < 4) state.usedWordIndices.clear();
    const pool = available.length >= 4
      ? available
      : WORD_BANK.map((_, i) => i).filter(i => !difficultyFilter || WORD_BANK[i].difficulty === 1);
    const shuffled = shuffle(pool);
    const correctIdx = shuffled[0];
    const correctWord = WORD_BANK[correctIdx];
    state.usedWordIndices.add(correctIdx);
    const wrongPool = WORD_BANK.map((_, i) => i).filter(
      i => i !== correctIdx && (!difficultyFilter || WORD_BANK[i].difficulty === 1)
    );
    const wrongShuffled = shuffle(wrongPool).slice(0, 3);
    const options = shuffle([correctWord.zh, ...wrongShuffled.map(i => WORD_BANK[i].zh)]);
    state.currentQuiz = {
      word: correctWord, options,
      correctIndex: options.indexOf(correctWord.zh),
      timer: QUIZ_TIME_LIMIT, answered: false, wasCorrect: undefined,
    };
    forceUpdate();
  }, [forceUpdate]);

  // ---- Handle quiz answer ----
  const handleAnswer = useCallback((index: number) => {
    const state = gs.current;
    if (!state || !state.currentQuiz || state.currentQuiz.answered || state.phase !== 'playing') return;
    const quiz = state.currentQuiz;
    quiz.answered = true;
    const isCorrect = index === quiz.correctIndex;
    quiz.wasCorrect = isCorrect;
    state.wordsAnswered++;
    const now = Date.now();
    const { w, h } = dims.current;

    if (isCorrect) {
      state.wordsCorrect++;
      state.comboCount++;
      const reward = QUIZ_SUN_REWARD[quiz.word.difficulty];
      const comboBonus = state.comboCount >= 3 ? Math.floor(reward * 0.5) : 0;
      state.sun += reward + comboBonus;
      state.score += reward + comboBonus;
      state.floatingTexts.push({
        id: uid(), x: w / 2, y: h - 80,
        text: `+${reward + comboBonus} ☀️${comboBonus > 0 ? ' 连击x' + state.comboCount : ''}`,
        color: '#FFD700', timer: 1500, maxTimer: 1500,
      });
    } else {
      state.comboCount = 0;
      state.zombieSpeedBoostEnd = now + ZOMBIE_SPEED_BOOST_DURATION;
      state.shakeTimer = 300;
      state.floatingTexts.push({
        id: uid(), x: w / 2, y: h - 80,
        text: '答错了! 僵尸加速!', color: '#FF4444', timer: 1500, maxTimer: 1500,
      });
    }
    state.quizCooldown = QUIZ_COOLDOWN;
    forceUpdate();
  }, [forceUpdate]);

  // ---- Canvas click (plant placement) ----
  const handleCanvasClick = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const state = gs.current;
    if (!state || state.phase !== 'playing' || !state.selectedPlant) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    let clientX: number, clientY: number;
    if ('touches' in e) {
      if (e.touches.length === 0) return;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const { cellW, cellH, ox, oy } = dims.current;
    const col = Math.floor((x - ox) / cellW);
    const row = Math.floor((y - oy) / cellH);
    if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return;
    if (state.plants.some(p => p.row === row && p.col === col)) return;
    const def = PLANT_DEFS[state.selectedPlant];
    if (state.sun < def.cost) {
      state.floatingTexts.push({
        id: uid(), x, y, text: '阳光不足!', color: '#FF4444', timer: 1000, maxTimer: 1000,
      });
      return;
    }
    state.sun -= def.cost;
    const plant: Plant = {
      id: uid(), type: state.selectedPlant, row, col,
      hp: def.hp, maxHp: def.hp,
      lastAttack: Date.now(), lastSun: Date.now(), animPhase: 0,
    };
    state.plants.push(plant);

    // Cherry bomb: delayed explosion
    if (def.explosive) {
      const capturedState = state;
      const capturedPlant = plant;
      const capturedCol = col;
      const capturedRow = row;
      setTimeout(() => {
        if (capturedState.phase !== 'playing') return;
        const { ox: oX, oy: oY, cellW: cW, cellH: cH } = dims.current;
        const cx = oX + capturedCol * cW + cW / 2;
        const cy = oY + capturedRow * cH + cH / 2;
        capturedState.explosions.push({
          id: uid(), x: cx, y: cy, radius: 0,
          maxRadius: cW * 2, timer: 0, maxTimer: 600,
        });
        capturedState.zombies.forEach(z => {
          if (!z.dead && Math.abs(z.row - capturedRow) <= 1) {
            const zy = oY + z.row * cH + cH / 2;
            const dist = Math.sqrt((z.x - cx) ** 2 + (zy - cy) ** 2);
            if (dist < cW * 2.5) {
              z.hp -= 1800;
              if (z.hp <= 0) {
                z.dead = true; z.deathTimer = 500;
                capturedState.totalKills++; capturedState.score += 50;
              }
            }
          }
        });
        capturedState.plants = capturedState.plants.filter(p => p.id !== capturedPlant.id);
        forceUpdate();
      }, 500);
    }
    forceUpdate();
  }, [forceUpdate]);

  // ---- Sun click ----
  const handleSunClick = useCallback((sunId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const state = gs.current;
    if (!state) return;
    const sun = state.suns.find(s => s.id === sunId);
    if (!sun || sun.collected) return;
    sun.collected = true;
    state.sun += sun.value;
    forceUpdate();
  }, [forceUpdate]);

  // ---- Game loop ----
  const gameLoop = useCallback(() => {
    const state = gs.current;
    const canvas = canvasRef.current;
    if (!state || !canvas) return;
    if (state.phase !== 'playing') {
      // Still render one last frame
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const now = Date.now();
    const dt = Math.min(now - state.lastTime, 50);
    state.lastTime = now;
    const { w, h, cellW, cellH, ox, oy } = dims.current;
    const isBoosted = now < state.zombieSpeedBoostEnd;
    const speedMult = isBoosted ? ZOMBIE_SPEED_BOOST : 1;

    // -- Spawn wave zombies --
    const waveConfig = WAVE_CONFIGS[state.wave];
    if (waveConfig) {
      const waveElapsed = now - state.waveStartTime;
      for (let i = state.waveZombiesSpawned; i < waveConfig.zombies.length; i++) {
        if (waveElapsed >= waveConfig.zombies[i].delay) {
          state.waveZombiesSpawned = i + 1;
          const zc = waveConfig.zombies[i];
          const def = ZOMBIE_DEFS[zc.type];
          const row = zc.row ?? Math.floor(Math.random() * GRID_ROWS);
          state.zombies.push({
            id: uid(), type: zc.type, row,
            x: ox + (GRID_COLS + 0.8) * cellW,
            hp: def.hp, maxHp: def.hp, speed: def.speed, baseSpeed: def.speed,
            eating: false, slowed: false, slowTimer: 0,
            lastHit: now, animPhase: Math.random() * Math.PI * 2,
            dead: false, deathTimer: 0,
          });
        } else {
          break;
        }
      }
    }

    // -- Check wave complete --
    const allSpawned = waveConfig ? state.waveZombiesSpawned >= waveConfig.zombies.length : true;
    const allDead = state.zombies.length === 0 || state.zombies.every(z => z.dead);
    if (allSpawned && allDead && state.zombies.length > 0) {
      if (state.wave < WAVE_CONFIGS.length - 1) {
        state.wave++;
        state.waveStartTime = now;
        state.waveZombiesSpawned = 0;
        state.floatingTexts.push({
          id: uid(), x: w / 2, y: h / 2,
          text: `第 ${state.wave + 1} 波!`, color: '#FF6600', timer: 2000, maxTimer: 2000,
        });
        forceUpdate();
      } else {
        state.phase = 'victory';
        setPhase('victory');
        return;
      }
    }

    // -- Update zombies --
    let gameOver = false;
    for (const zombie of state.zombies) {
      if (zombie.dead) {
        zombie.deathTimer -= dt;
        continue;
      }
      if (zombie.slowed) {
        zombie.slowTimer -= dt;
        if (zombie.slowTimer <= 0) zombie.slowed = false;
      }
      zombie.animPhase += dt * 0.005 * (zombie.slowed ? 0.5 : 1);
      const currentSpeed = zombie.baseSpeed * speedMult * (zombie.slowed ? 0.5 : 1);
      const eatingPlant = state.plants.find(p => {
        if (p.row !== zombie.row) return false;
        const plantX = ox + p.col * cellW + cellW / 2;
        return Math.abs(zombie.x - plantX) < cellW * 0.35;
      });
      if (eatingPlant) {
        zombie.eating = true;
        if (now - zombie.lastHit > 1000) {
          zombie.lastHit = now;
          eatingPlant.hp -= 100;
          if (eatingPlant.hp <= 0) {
            state.plants = state.plants.filter(p => p.id !== eatingPlant.id);
          }
        }
      } else {
        zombie.eating = false;
        zombie.x -= currentSpeed * (dt / 1000);
      }
      if (zombie.x < ox - cellW * 0.5) {
        gameOver = true;
      }
    }
    state.zombies = state.zombies.filter(z => !(z.dead && z.deathTimer <= 0));

    if (gameOver) {
      state.phase = 'gameover';
      setPhase('gameover');
      return;
    }

    // -- Update plants --
    for (const plant of state.plants) {
      plant.animPhase += dt * 0.003;
      const def = PLANT_DEFS[plant.type];
      if (def.sunProduction && def.sunInterval && now - plant.lastSun >= def.sunInterval) {
        plant.lastSun = now;
        const px = ox + plant.col * cellW + cellW / 2;
        const py = oy + plant.row * cellH + cellH / 2;
        state.suns.push({
          id: uid(), x: px, y: py - 10,
          targetY: py + cellH * 0.3 + Math.random() * 20,
          value: def.sunProduction, timer: 8000,
          collected: false, opacity: 1, scale: 0,
        });
      }
      if (def.attack && def.attackSpeed) {
        const hasZombie = state.zombies.some(
          z => !z.dead && z.row === plant.row && z.x > ox + plant.col * cellW
        );
        if (hasZombie && now - plant.lastAttack >= def.attackSpeed) {
          plant.lastAttack = now;
          const px = ox + plant.col * cellW + cellW * 0.7;
          state.projectiles.push({
            id: uid(), row: plant.row, x: px, speed: 250,
            damage: def.attack, slow: !!def.slowEffect, active: true,
          });
          if (def.doubleShot) {
            setTimeout(() => {
              if (gs.current?.phase === 'playing') {
                gs.current.projectiles.push({
                  id: uid(), row: plant.row, x: px, speed: 250,
                  damage: def.attack, slow: false, active: true,
                });
              }
            }, 150);
          }
        }
      }
    }

    // -- Update projectiles --
    for (const proj of state.projectiles) {
      if (!proj.active) continue;
      proj.x += proj.speed * (dt / 1000);
      const hitZombie = state.zombies.find(
        z => !z.dead && z.row === proj.row && Math.abs(z.x - proj.x) < cellW * 0.25
      );
      if (hitZombie) {
        proj.active = false;
        hitZombie.hp -= proj.damage;
        if (proj.slow) { hitZombie.slowed = true; hitZombie.slowTimer = 3000; }
        if (hitZombie.hp <= 0) {
          hitZombie.dead = true; hitZombie.deathTimer = 500;
          state.totalKills++; state.score += 50;
        }
        state.floatingTexts.push({
          id: uid(), x: proj.x, y: oy + proj.row * cellH + cellH * 0.25,
          text: `-${proj.damage}`, color: proj.slow ? '#00E5FF' : '#FF6600',
          timer: 600, maxTimer: 600,
        });
      }
      if (proj.x > ox + (GRID_COLS + 1) * cellW) proj.active = false;
    }
    state.projectiles = state.projectiles.filter(p => p.active);

    // -- Update suns --
    for (const sun of state.suns) {
      if (sun.collected) {
        sun.opacity -= dt / 300;
        sun.scale += dt / 200;
        continue;
      }
      if (sun.y < sun.targetY) sun.y = Math.min(sun.y + dt * 0.05, sun.targetY);
      if (sun.scale < 1) sun.scale = Math.min(1, sun.scale + dt / 300);
      sun.timer -= dt;
    }
    state.suns = state.suns.filter(s => s.timer > 0 && s.opacity > 0);

    // -- Natural sun drops --
    if (now >= state.nextNaturalSun) {
      state.nextNaturalSun = now + NATURAL_SUN_INTERVAL;
      const sx = ox + Math.random() * (GRID_COLS * cellW);
      state.suns.push({
        id: uid(), x: sx, y: -20,
        targetY: oy + Math.random() * (GRID_ROWS * cellH),
        value: NATURAL_SUN_VALUE, timer: 10000,
        collected: false, opacity: 1, scale: 0,
      });
    }

    // -- Update effects --
    for (const exp of state.explosions) {
      exp.timer += dt;
      exp.radius = (exp.timer / exp.maxTimer) * exp.maxRadius;
    }
    state.explosions = state.explosions.filter(e => e.timer < e.maxTimer);

    for (const ft of state.floatingTexts) {
      ft.timer -= dt;
      ft.y -= dt * 0.04;
    }
    state.floatingTexts = state.floatingTexts.filter(ft => ft.timer > 0);

    // -- Update quiz --
    if (state.currentQuiz) {
      if (state.currentQuiz.answered) {
        state.quizCooldown -= dt;
        if (state.quizCooldown <= 0) generateQuiz(state);
      } else {
        state.currentQuiz.timer -= dt;
        if (state.currentQuiz.timer <= 0) {
          state.currentQuiz.answered = true;
          state.currentQuiz.wasCorrect = false;
          state.wordsAnswered++;
          state.comboCount = 0;
          state.zombieSpeedBoostEnd = now + ZOMBIE_SPEED_BOOST_DURATION;
          state.shakeTimer = 300;
          state.quizCooldown = QUIZ_COOLDOWN;
          state.floatingTexts.push({
            id: uid(), x: w / 2, y: h - 80,
            text: '⏰ 超时! 僵尸加速!', color: '#FF4444', timer: 1500, maxTimer: 1500,
          });
          forceUpdate();
        }
      }
    }

    if (state.shakeTimer > 0) state.shakeTimer -= dt;

    // ======== RENDER ========
    const dpr = window.devicePixelRatio || 1;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (state.shakeTimer > 0) {
      ctx.translate((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
    }

    // Background
    const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
    skyGrad.addColorStop(0, '#87CEEB');
    skyGrad.addColorStop(0.2, '#B0E0E6');
    skyGrad.addColorStop(0.35, '#90EE90');
    skyGrad.addColorStop(1, '#228B22');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h);

    // Grid
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        ctx.fillStyle = (r + c) % 2 === 0
          ? 'rgba(34, 139, 34, 0.35)' : 'rgba(50, 205, 50, 0.3)';
        ctx.fillRect(ox + c * cellW, oy + r * cellH, cellW, cellH);
        ctx.strokeStyle = 'rgba(0, 80, 0, 0.12)';
        ctx.lineWidth = 1;
        ctx.strokeRect(ox + c * cellW, oy + r * cellH, cellW, cellH);
      }
    }

    // House edge
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(0, oy, ox - 2, GRID_ROWS * cellH);
    ctx.fillStyle = '#A0522D';
    ctx.fillRect(2, oy + 5, ox - 6, GRID_ROWS * cellH - 10);
    const doorW = ox * 0.5;
    const doorH = cellH * 0.8;
    ctx.fillStyle = '#654321';
    ctx.fillRect(
      (ox - doorW) / 2,
      oy + (GRID_ROWS * cellH - doorH) / 2,
      doorW, doorH
    );

    // Grid hover highlight when plant selected
    if (state.selectedPlant) {
      ctx.fillStyle = 'rgba(255, 255, 0, 0.1)';
      for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
          if (!state.plants.some(p => p.row === r && p.col === c)) {
            ctx.fillRect(ox + c * cellW, oy + r * cellH, cellW, cellH);
          }
        }
      }
    }

    // Draw plants
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const plant of state.plants) {
      const def = PLANT_DEFS[plant.type];
      const px = ox + plant.col * cellW + cellW / 2;
      const py = oy + plant.row * cellH + cellH / 2;
      const bob = Math.sin(plant.animPhase) * 3;
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.beginPath();
      ctx.ellipse(px, oy + plant.row * cellH + cellH - 5, cellW * 0.22, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      // Emoji
      ctx.font = `${cellW * 0.55}px serif`;
      ctx.fillText(def.emoji, px, py + bob);
      // HP bar
      if (plant.hp < plant.maxHp) {
        const barW = cellW * 0.6;
        const barX = px - barW / 2;
        const barY = oy + plant.row * cellH + 3;
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(barX, barY, barW, 4);
        const ratio = Math.max(0, plant.hp / plant.maxHp);
        ctx.fillStyle = ratio > 0.5 ? '#4CAF50' : ratio > 0.25 ? '#FF9800' : '#F44336';
        ctx.fillRect(barX, barY, barW * ratio, 4);
      }
    }

    // Draw projectiles
    for (const proj of state.projectiles) {
      const py = oy + proj.row * cellH + cellH / 2;
      ctx.shadowColor = proj.slow ? '#00BCD4' : '#4CAF50';
      ctx.shadowBlur = proj.slow ? 8 : 5;
      ctx.fillStyle = proj.slow ? '#00E5FF' : '#76FF03';
      ctx.beginPath();
      ctx.arc(proj.x, py, Math.max(3, cellW * 0.07), 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Draw zombies
    for (const zombie of state.zombies) {
      const zy = oy + zombie.row * cellH + cellH / 2;
      const bob = zombie.eating ? 0 : Math.sin(zombie.animPhase) * 4;
      const alpha = zombie.dead ? Math.max(0, zombie.deathTimer / 500) : 1;
      ctx.globalAlpha = alpha;

      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.ellipse(zombie.x, oy + zombie.row * cellH + cellH - 5, cellW * 0.18, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      // Body
      const bColor = zombie.slowed ? '#4A90D9' : '#6B8E23';
      ctx.fillStyle = bColor;
      ctx.beginPath();
      ctx.ellipse(zombie.x, zy + bob + cellH * 0.08, cellW * 0.17, cellH * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();

      // Head
      ctx.fillStyle = zombie.slowed ? '#5BA3EC' : '#9ACD32';
      ctx.beginPath();
      ctx.arc(zombie.x, zy - cellH * 0.18 + bob, cellW * 0.15, 0, Math.PI * 2);
      ctx.fill();

      // Eyes
      ctx.fillStyle = '#FF0000';
      ctx.beginPath();
      ctx.arc(zombie.x - cellW * 0.055, zy - cellH * 0.2 + bob, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(zombie.x + cellW * 0.055, zy - cellH * 0.2 + bob, 2, 0, Math.PI * 2);
      ctx.fill();

      // Mouth
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(zombie.x, zy - cellH * 0.1 + bob, cellW * 0.05, 0, Math.PI);
      ctx.stroke();

      // Arms
      ctx.strokeStyle = bColor;
      ctx.lineWidth = 3;
      const armSwing = Math.sin(zombie.animPhase * 1.5) * 8;
      ctx.beginPath();
      ctx.moveTo(zombie.x - cellW * 0.14, zy + bob);
      ctx.lineTo(zombie.x - cellW * 0.28, zy + cellH * 0.15 + bob + armSwing);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(zombie.x + cellW * 0.14, zy + bob);
      ctx.lineTo(zombie.x + cellW * 0.32, zy - cellH * 0.05 + bob - armSwing);
      ctx.stroke();

      // Accessories
      if (zombie.type === 'cone') {
        ctx.fillStyle = '#FF8C00';
        ctx.beginPath();
        ctx.moveTo(zombie.x, zy - cellH * 0.45 + bob);
        ctx.lineTo(zombie.x - cellW * 0.11, zy - cellH * 0.22 + bob);
        ctx.lineTo(zombie.x + cellW * 0.11, zy - cellH * 0.22 + bob);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#CC7000'; ctx.lineWidth = 1; ctx.stroke();
      } else if (zombie.type === 'bucket') {
        const bw = cellW * 0.2; const bh = cellH * 0.17;
        ctx.fillStyle = '#708090';
        ctx.fillRect(zombie.x - bw / 2, zy - cellH * 0.37 + bob, bw, bh);
        ctx.strokeStyle = '#556677'; ctx.lineWidth = 1;
        ctx.strokeRect(zombie.x - bw / 2, zy - cellH * 0.37 + bob, bw, bh);
        ctx.beginPath();
        ctx.arc(zombie.x, zy - cellH * 0.37 + bob, bw * 0.4, Math.PI, 0);
        ctx.stroke();
      } else if (zombie.type === 'flag') {
        ctx.strokeStyle = '#8B4513'; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(zombie.x + cellW * 0.11, zy - cellH * 0.15 + bob);
        ctx.lineTo(zombie.x + cellW * 0.11, zy - cellH * 0.5 + bob);
        ctx.stroke();
        ctx.fillStyle = '#DC143C';
        ctx.beginPath();
        ctx.moveTo(zombie.x + cellW * 0.11, zy - cellH * 0.5 + bob);
        ctx.lineTo(zombie.x + cellW * 0.28, zy - cellH * 0.42 + bob);
        ctx.lineTo(zombie.x + cellW * 0.11, zy - cellH * 0.34 + bob);
        ctx.closePath();
        ctx.fill();
      }

      // Slowed aura
      if (zombie.slowed && !zombie.dead) {
        ctx.fillStyle = 'rgba(0, 188, 212, 0.25)';
        ctx.beginPath();
        ctx.arc(zombie.x, zy + bob, cellW * 0.22, 0, Math.PI * 2);
        ctx.fill();
      }

      // HP bar
      if (!zombie.dead && zombie.hp < zombie.maxHp) {
        const barW = cellW * 0.45;
        const barX = zombie.x - barW / 2;
        const barY = oy + zombie.row * cellH + 3;
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(barX, barY, barW, 4);
        const ratio = Math.max(0, zombie.hp / zombie.maxHp);
        ctx.fillStyle = ratio > 0.5 ? '#4CAF50' : ratio > 0.25 ? '#FF9800' : '#F44336';
        ctx.fillRect(barX, barY, barW * ratio, 4);
      }
      ctx.globalAlpha = 1;
    }

    // Explosions
    for (const exp of state.explosions) {
      const progress = exp.timer / exp.maxTimer;
      const alpha = 1 - progress;
      ctx.fillStyle = `rgba(255, 100, 0, ${alpha * 0.6})`;
      ctx.beginPath();
      ctx.arc(exp.x, exp.y, exp.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255, 200, 0, ${alpha * 0.4})`;
      ctx.beginPath();
      ctx.arc(exp.x, exp.y, exp.radius * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Suns
    for (const sun of state.suns) {
      ctx.globalAlpha = sun.collected ? Math.max(0, sun.opacity) : Math.min(1, sun.opacity);
      const s = sun.collected ? sun.scale : Math.min(1, sun.scale);
      const size = Math.max(4, cellW * 0.18 * s);
      ctx.fillStyle = 'rgba(255, 255, 0, 0.2)';
      ctx.beginPath();
      ctx.arc(sun.x, sun.y, size * 1.8, 0, Math.PI * 2);
      ctx.fill();
      const sunGrad = ctx.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, size);
      sunGrad.addColorStop(0, '#FFF176');
      sunGrad.addColorStop(0.6, '#FFD600');
      sunGrad.addColorStop(1, '#FF8F00');
      ctx.fillStyle = sunGrad;
      ctx.beginPath();
      ctx.arc(sun.x, sun.y, size, 0, Math.PI * 2);
      ctx.fill();
      if (!sun.collected && s > 0.7) {
        ctx.fillStyle = '#5D4037';
        ctx.font = `bold ${Math.max(8, size * 0.85)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(sun.value.toString(), sun.x, sun.y);
      }
      ctx.globalAlpha = 1;
    }

    // Floating texts
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const ft of state.floatingTexts) {
      const alpha = Math.min(1, ft.timer / (ft.maxTimer * 0.3));
      ctx.globalAlpha = alpha;
      ctx.fillStyle = ft.color;
      ctx.font = 'bold 15px sans-serif';
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 3;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    // Wave announcement
    if (state.waveZombiesSpawned <= 1 && waveConfig) {
      const waveElapsed = now - state.waveStartTime;
      if (waveElapsed < 2000) {
        const alpha = waveElapsed < 500
          ? waveElapsed / 500
          : waveElapsed > 1500 ? (2000 - waveElapsed) / 500 : 1;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 26px sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 4;
        ctx.fillText(`第 ${state.wave + 1} 波`, w / 2, h / 2);
        ctx.font = '15px sans-serif';
        ctx.fillText(`${waveConfig.zombies.length} 个僵尸来袭!`, w / 2, h / 2 + 28);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }
    }

    ctx.restore();
    rafRef.current = requestAnimationFrame(gameLoop);
  }, [generateQuiz, forceUpdate]);

  // ---- Effects ----
  useEffect(() => {
    if (!containerRef.current) return;
    recalcDims();
    const observer = new ResizeObserver(() => recalcDims());
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [phase, recalcDims]);

  useEffect(() => {
    if (phase === 'playing') {
      gs.current!.lastTime = Date.now();
      rafRef.current = requestAnimationFrame(gameLoop);
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, gameLoop]);

  const state = gs.current;
  const quiz = state?.currentQuiz;
  const diff = quiz?.word.difficulty ?? 1;

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden select-none" style={{ background: '#1a1a2e' }}>
      {/* ===== Start Screen ===== */}

      {phase === 'menu' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-5"
          style={{ background: 'linear-gradient(180deg, #1a472a 0%, #2d5a27 50%, #4a7c3f 100%)' }}>
          <div className="text-7xl animate-bounce">🧟</div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-yellow-300"
            style={{ textShadow: '3px 3px 0 #5D4037, 0 0 20px rgba(255,215,0,0.3)' }}>
            植物大战僵尸
          </h1>
          <p className="text-xl text-green-200 font-semibold tracking-wide">· 单词大作战 ·</p>
          <div className="mt-3 text-sm text-green-300/80 text-center space-y-1.5">
            <p>🌻 答对单词获得阳光</p>
            <p>🌱 用阳光种植植物抵御僵尸</p>
            <p>🧟 不要让僵尸到达你的房子!</p>
          </div>
          <button onClick={initGame}
            className="mt-5 px-10 py-3 bg-yellow-400 hover:bg-yellow-300 text-green-900 font-bold text-xl rounded-full
              shadow-lg hover:shadow-xl transition-all hover:scale-105 active:scale-95">
            开始游戏
          </button>
        </div>
      )}

      {/* ===== Game Screen ===== */}

      {(phase === 'playing' || phase === 'gameover' || phase === 'victory') && state && (
        <>
          {/* Top bar */}
          <div className="flex items-center justify-between px-3 py-1.5 bg-gradient-to-r from-green-900 via-green-800 to-green-900 border-b-2 border-yellow-600/50 z-10 flex-shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xl">☀️</span>
              <span className="text-yellow-300 font-bold text-lg min-w-[40px]">{state.sun}</span>
            </div>
            <div className="flex items-center gap-3 text-xs md:text-sm">
              <span className="text-yellow-200">
                波次 <span className="font-bold text-base text-white">{state.wave + 1}</span>/{WAVE_CONFIGS.length}
              </span>
              <span className="text-green-200 hidden sm:inline">
                得分: <span className="font-bold text-white">{state.score}</span>
              </span>
              <span className="text-blue-200">
                {state.wordsCorrect}/{state.wordsAnswered}
              </span>
              {state.comboCount >= 3 && (
                <span className="text-orange-300 font-bold animate-pulse">
                  🔥x{state.comboCount}
                </span>
              )}
            </div>
          </div>

          {/* Plant card bar */}
          <div className="flex items-center gap-1 px-2 py-1 bg-green-950/80 border-b border-green-700/50 overflow-x-auto flex-shrink-0 z-10">
            <button
              onClick={() => { state.selectedPlant = null; forceUpdate(); }}
              className={`flex-shrink-0 px-2 py-1 rounded-lg text-xs font-bold transition-all ${
                !state.selectedPlant
                  ? 'bg-yellow-500 text-green-900 ring-2 ring-yellow-300'
                  : 'bg-green-800 text-green-300 hover:bg-green-700'
              }`}>
              ✋
            </button>
            {PLANT_ORDER.map(ptype => {
              const def = PLANT_DEFS[ptype];
              const canAfford = state.sun >= def.cost;
              const isSelected = state.selectedPlant === ptype;
              return (
                <button key={ptype}
                  onClick={() => {
                    state.selectedPlant = isSelected ? null : ptype;
                    forceUpdate();
                  }}
                  disabled={!canAfford}
                  className={`flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-all ${
                    isSelected
                      ? 'bg-yellow-500 text-green-900 ring-2 ring-yellow-300 scale-105'
                      : canAfford
                        ? 'bg-green-800/80 text-green-200 hover:bg-green-700 hover:scale-105'
                        : 'bg-green-900/50 text-green-600/50 cursor-not-allowed'
                  }`}>
                  <span className="text-base leading-none">{def.emoji}</span>
                  <div className="text-left">
                    <div className="font-bold leading-tight text-[10px] md:text-xs">{def.name}</div>
                    <div className="text-yellow-400/80 leading-tight text-[10px]">☀️{def.cost}</div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Canvas */}
          <div ref={containerRef} className="flex-1 relative min-h-0">
            <canvas
              ref={canvasRef}
              onClick={handleCanvasClick}
              onTouchStart={(e) => { e.preventDefault(); handleCanvasClick(e); }}
              className="w-full h-full"
            />
            {/* Sun click targets */}
            {state.suns.filter(s => !s.collected).map(sun => (
              <button
                key={sun.id}
                onMouseDown={(e) => handleSunClick(sun.id, e)}
                onTouchStart={(e) => { e.preventDefault(); handleSunClick(sun.id, e as any); }}
                className="absolute rounded-full cursor-pointer z-10"
                style={{
                  left: sun.x - 20, top: sun.y - 20,
                  width: 40, height: 40,
                  background: 'transparent', border: 'none', padding: 0,
                }}
              />
            ))}
            {/* Speed boost indicator */}
            {Date.now() < state.zombieSpeedBoostEnd && (
              <div className="absolute top-1 left-1/2 -translate-x-1/2 bg-red-600/80 text-white px-3 py-0.5 rounded-full text-xs font-bold animate-pulse z-10">
                ⚡ 僵尸加速中!
              </div>
            )}
          </div>

          {/* Quiz panel */}
          {phase === 'playing' && quiz && (
            <div className={`flex-shrink-0 px-2 md:px-4 py-2 border-t-2 transition-colors z-10 ${
              quiz.answered
                ? (quiz.wasCorrect ? 'bg-green-900/90 border-green-500' : 'bg-red-900/90 border-red-500')
                : 'bg-slate-900/95 border-slate-600'
            }`}>
              <div className="max-w-xl mx-auto">
                {quiz.answered ? (
                  <div className="flex items-center justify-center gap-2 py-0.5">
                    <span className="text-base">{quiz.wasCorrect ? '✅' : '❌'}</span>
                    <span className="text-white font-bold">{quiz.word.en} = {quiz.word.zh}</span>
                    <span className="text-slate-400 text-xs">
                      下一题 {Math.max(0, Math.ceil(state.quizCooldown / 1000))}s
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          diff === 1 ? 'bg-green-700 text-green-200'
                            : diff === 2 ? 'bg-yellow-700 text-yellow-200'
                              : 'bg-red-700 text-red-200'
                        }`}>
                          {diff === 1 ? '简单' : diff === 2 ? '中等' : '困难'} +{QUIZ_SUN_REWARD[diff]}☀️
                        </span>
                        <span className="text-white font-bold text-base md:text-lg">{quiz.word.en}</span>
                      </div>
                      <span className={`text-xs ${quiz.timer < 3000 ? 'text-red-400 font-bold animate-pulse' : 'text-slate-400'}`}>
                        ⏱{Math.max(0, Math.ceil(quiz.timer / 1000))}s
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-700 rounded-full mb-1.5 overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-150 ${
                        quiz.timer < 3000 ? 'bg-red-500' : 'bg-green-500'
                      }`} style={{ width: `${(quiz.timer / QUIZ_TIME_LIMIT) * 100}%` }} />
                    </div>
                    <div className="grid grid-cols-2 gap-1 md:gap-1.5">
                      {quiz.options.map((opt, i) => (
                        <button
                          key={i}
                          onClick={() => handleAnswer(i)}
                          className="py-1.5 md:py-2 px-2 md:px-3 rounded-lg text-xs md:text-sm font-medium text-white
                            bg-slate-700/80 hover:bg-slate-600 active:bg-slate-500
                            transition-all hover:scale-[1.02] active:scale-[0.98]
                            border border-slate-600/50 hover:border-slate-500">
                          {String.fromCharCode(65 + i)}. {opt}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Game Over */}
          {phase === 'gameover' && (
            <div className="absolute inset-0 flex items-center justify-center z-30 bg-black/60 backdrop-blur-sm">
              <div className="bg-slate-900 border-2 border-red-500 rounded-2xl p-6 md:p-8 text-center max-w-sm mx-4 shadow-2xl">
                <div className="text-5xl mb-2">💀</div>
                <h2 className="text-3xl font-bold text-red-400 mb-2">游戏结束</h2>
                <div className="space-y-1 text-slate-300 text-sm mb-4">
                  <p>存活: <span className="text-white font-bold">{state.wave + 1}/{WAVE_CONFIGS.length} 波</span></p>
                  <p>消灭僵尸: <span className="text-white font-bold">{state.totalKills}</span></p>
                  <p>答题: <span className="text-white font-bold">{state.wordsCorrect}/{state.wordsAnswered}</span>
                    ({state.wordsAnswered > 0 ? Math.round(state.wordsCorrect / state.wordsAnswered * 100) : 0}%)</p>
                  <p>得分: <span className="text-yellow-400 font-bold text-xl">{state.score}</span></p>
                </div>
                <button onClick={initGame}
                  className="px-8 py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded-full
                    shadow-lg hover:shadow-xl transition-all hover:scale-105 active:scale-95">
                  再来一局
                </button>
              </div>
            </div>
          )}

          {/* Victory */}
          {phase === 'victory' && (
            <div className="absolute inset-0 flex items-center justify-center z-30 bg-black/50 backdrop-blur-sm">
              <div className="bg-slate-900 border-2 border-yellow-500 rounded-2xl p-6 md:p-8 text-center max-w-sm mx-4 shadow-2xl">
                <div className="text-5xl mb-2">🏆</div>
                <h2 className="text-3xl font-bold text-yellow-400 mb-1">胜利!</h2>
                <p className="text-green-300 text-sm mb-3">成功抵御了所有僵尸!</p>
                <div className="space-y-1 text-slate-300 text-sm mb-4">
                  <p>消灭僵尸: <span className="text-white font-bold">{state.totalKills}</span></p>
                  <p>答题: <span className="text-white font-bold">{state.wordsCorrect}/{state.wordsAnswered}</span>
                    ({state.wordsAnswered > 0 ? Math.round(state.wordsCorrect / state.wordsAnswered * 100) : 0}%)</p>
                  <p>得分: <span className="text-yellow-400 font-bold text-xl">{state.score}</span></p>
                </div>
                <button onClick={initGame}
                  className="px-8 py-2.5 bg-yellow-500 hover:bg-yellow-400 text-green-900 font-bold rounded-full
                    shadow-lg hover:shadow-xl transition-all hover:scale-105 active:scale-95">
                  再玩一次
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}