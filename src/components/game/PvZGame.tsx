'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  WORD_BANK, PLANT_DEFS, PLANT_ORDER, ZOMBIE_DEFS,
  GRID_COLS, GRID_ROWS, STARTING_SUN, QUIZ_SUN_REWARD,
  QUIZ_TIME_LIMIT, QUIZ_COOLDOWN,
  ZOMBIE_SPEED_BOOST, ZOMBIE_SPEED_BOOST_DURATION,
  WAVE_CONFIGS,
} from '@/game/data';
import type { PlantType, ZombieType, Word } from '@/game/data';

// ============ Internal Types ============
type GamePhase = 'menu' | 'playing' | 'gameover' | 'victory';

interface Plant {
  id: string; type: PlantType; row: number; col: number;
  hp: number; maxHp: number; lastAttack: number;
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
  explosions: Explosion[]; floatingTexts: FloatingText[];
  selectedPlant: PlantType | null;
  currentQuiz: WordQuestion | null;
  quizCooldown: number;
  wordsAnswered: number; wordsCorrect: number;
  waveStartTime: number; waveZombiesSpawned: number;
  totalKills: number; lastTime: number;
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

// ============ Canvas Drawing Functions ============

// --- Plant Drawing ---
function drawPeashooter(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, anim: number) {
  const bob = Math.sin(anim) * 2;
  // Stem
  ctx.fillStyle = '#2E7D32';
  ctx.beginPath();
  ctx.roundRect(x - s * 0.06, y + s * 0.15, s * 0.12, s * 0.45, 3);
  ctx.fill();
  // Leaves at base
  ctx.fillStyle = '#43A047';
  ctx.save(); ctx.translate(x - s * 0.06, y + s * 0.4);
  ctx.rotate(-0.4);
  ctx.beginPath(); ctx.ellipse(0, 0, s * 0.22, s * 0.07, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.save(); ctx.translate(x + s * 0.06, y + s * 0.42);
  ctx.rotate(0.3);
  ctx.beginPath(); ctx.ellipse(0, 0, s * 0.2, s * 0.06, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // Head
  const hg = ctx.createRadialGradient(x - s * 0.05, y - s * 0.15 + bob, s * 0.05, x, y - s * 0.1 + bob, s * 0.38);
  hg.addColorStop(0, '#81C784');
  hg.addColorStop(1, '#2E7D32');
  ctx.fillStyle = hg;
  ctx.beginPath(); ctx.arc(x, y - s * 0.1 + bob, s * 0.34, 0, Math.PI * 2); ctx.fill();
  // Cannon tube
  ctx.fillStyle = '#1B5E20';
  ctx.beginPath();
  ctx.ellipse(x + s * 0.32, y - s * 0.1 + bob, s * 0.18, s * 0.13, 0, 0, Math.PI * 2);
  ctx.fill();
  // Cannon inner
  ctx.fillStyle = '#0a2e0a';
  ctx.beginPath(); ctx.arc(x + s * 0.42, y - s * 0.1 + bob, s * 0.07, 0, Math.PI * 2); ctx.fill();
  // Eyes white
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.ellipse(x - s * 0.1, y - s * 0.22 + bob, s * 0.11, s * 0.12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + s * 0.08, y - s * 0.24 + bob, s * 0.09, s * 0.1, 0, 0, Math.PI * 2); ctx.fill();
  // Pupils
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath(); ctx.arc(x - s * 0.05, y - s * 0.22 + bob, s * 0.055, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + s * 0.12, y - s * 0.24 + bob, s * 0.045, 0, Math.PI * 2); ctx.fill();
  // Pupil highlights
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x - s * 0.03, y - s * 0.24 + bob, s * 0.02, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + s * 0.14, y - s * 0.26 + bob, s * 0.017, 0, Math.PI * 2); ctx.fill();
}

function drawWallnut(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, anim: number, hpRatio: number) {
  const bob = Math.sin(anim * 0.8) * 1.5;
  const squish = 1 + Math.sin(anim * 1.2) * 0.02;
  // Main body
  const wg = ctx.createRadialGradient(x - s * 0.1, y - s * 0.1 + bob, s * 0.1, x, y + bob, s * 0.42 * squish);
  wg.addColorStop(0, '#D4A34A');
  wg.addColorStop(0.6, '#A0722A');
  wg.addColorStop(1, '#6B4513');
  ctx.fillStyle = wg;
  ctx.beginPath();
  ctx.ellipse(x, y + s * 0.05 + bob, s * 0.35 * squish, s * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  // Texture lines
  ctx.strokeStyle = 'rgba(90,50,10,0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(x, y + bob, s * 0.2, 0.3, 1.2); ctx.stroke();
  ctx.beginPath(); ctx.arc(x + s * 0.1, y + s * 0.15 + bob, s * 0.15, -0.5, 0.8); ctx.stroke();
  // Cracks when damaged
  if (hpRatio < 0.66) {
    ctx.strokeStyle = 'rgba(50,30,5,0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - s * 0.1, y - s * 0.15 + bob);
    ctx.lineTo(x - s * 0.05, y + s * 0.05 + bob);
    ctx.lineTo(x - s * 0.15, y + s * 0.2 + bob);
    ctx.stroke();
  }
  if (hpRatio < 0.33) {
    ctx.beginPath();
    ctx.moveTo(x + s * 0.15, y - s * 0.2 + bob);
    ctx.lineTo(x + s * 0.08, y + bob);
    ctx.lineTo(x + s * 0.18, y + s * 0.15 + bob);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - s * 0.05, y + s * 0.1 + bob);
    ctx.lineTo(x + s * 0.05, y + s * 0.25 + bob);
    ctx.stroke();
  }
  // Eyes
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.ellipse(x - s * 0.1, y - s * 0.08 + bob, s * 0.07, s * 0.08, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + s * 0.1, y - s * 0.08 + bob, s * 0.07, s * 0.08, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2c1810';
  ctx.beginPath(); ctx.arc(x - s * 0.08, y - s * 0.07 + bob, s * 0.035, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + s * 0.12, y - s * 0.07 + bob, s * 0.035, 0, Math.PI * 2); ctx.fill();
  // Worried mouth
  ctx.strokeStyle = '#5D3A1A';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y + s * 0.08 + bob, s * 0.08, 0.2, Math.PI - 0.2);
  ctx.stroke();
  // Highlight
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.ellipse(x - s * 0.12, y - s * 0.2 + bob, s * 0.12, s * 0.08, -0.3, 0, Math.PI * 2);
  ctx.fill();
}

function drawSnowPea(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, anim: number) {
  const bob = Math.sin(anim) * 2;
  // Frost aura
  ctx.fillStyle = 'rgba(100,220,255,0.08)';
  ctx.beginPath(); ctx.arc(x, y + bob, s * 0.5, 0, Math.PI * 2); ctx.fill();
  // Stem
  ctx.fillStyle = '#006064';
  ctx.beginPath();
  ctx.roundRect(x - s * 0.06, y + s * 0.15, s * 0.12, s * 0.45, 3);
  ctx.fill();
  // Leaves (icy)
  ctx.fillStyle = '#4DD0E1';
  ctx.save(); ctx.translate(x - s * 0.06, y + s * 0.38);
  ctx.rotate(-0.4);
  ctx.beginPath(); ctx.ellipse(0, 0, s * 0.22, s * 0.06, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.save(); ctx.translate(x + s * 0.06, y + s * 0.4);
  ctx.rotate(0.3);
  ctx.beginPath(); ctx.ellipse(0, 0, s * 0.2, s * 0.055, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // Head
  const hg = ctx.createRadialGradient(x - s * 0.05, y - s * 0.15 + bob, s * 0.05, x, y - s * 0.1 + bob, s * 0.38);
  hg.addColorStop(0, '#B2EBF2');
  hg.addColorStop(0.5, '#00ACC1');
  hg.addColorStop(1, '#006064');
  ctx.fillStyle = hg;
  ctx.beginPath(); ctx.arc(x, y - s * 0.1 + bob, s * 0.34, 0, Math.PI * 2); ctx.fill();
  // Ice crystals on head
  ctx.strokeStyle = 'rgba(200,240,255,0.7)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) {
    const angle = -0.8 + i * 0.6 + Math.sin(anim + i) * 0.1;
    const cx = x + Math.cos(angle) * s * 0.3;
    const cy = y - s * 0.1 + bob + Math.sin(angle) * s * 0.3;
    ctx.beginPath();
    ctx.moveTo(cx - 3, cy); ctx.lineTo(cx + 3, cy);
    ctx.moveTo(cx, cy - 3); ctx.lineTo(cx, cy + 3);
    ctx.stroke();
  }
  // Cannon tube
  ctx.fillStyle = '#004D40';
  ctx.beginPath();
  ctx.ellipse(x + s * 0.32, y - s * 0.1 + bob, s * 0.18, s * 0.13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#00251a';
  ctx.beginPath(); ctx.arc(x + s * 0.42, y - s * 0.1 + bob, s * 0.07, 0, Math.PI * 2); ctx.fill();
  // Eyes
  ctx.fillStyle = '#E0F7FA';
  ctx.beginPath(); ctx.ellipse(x - s * 0.1, y - s * 0.22 + bob, s * 0.1, s * 0.11, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + s * 0.08, y - s * 0.24 + bob, s * 0.08, s * 0.09, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#006064';
  ctx.beginPath(); ctx.arc(x - s * 0.06, y - s * 0.22 + bob, s * 0.05, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + s * 0.11, y - s * 0.24 + bob, s * 0.04, 0, Math.PI * 2); ctx.fill();
  // Pupil highlights
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x - s * 0.04, y - s * 0.24 + bob, s * 0.02, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + s * 0.13, y - s * 0.26 + bob, s * 0.017, 0, Math.PI * 2); ctx.fill();
  // Frost breath particles
  ctx.fillStyle = 'rgba(200,240,255,0.5)';
  for (let i = 0; i < 4; i++) {
    const px = x + s * 0.5 + Math.sin(anim * 2 + i * 1.5) * s * 0.15;
    const py = y - s * 0.15 + bob + Math.cos(anim * 1.5 + i * 1.2) * s * 0.15;
    ctx.beginPath(); ctx.arc(px, py, s * 0.02, 0, Math.PI * 2); ctx.fill();
  }
}

function drawRepeater(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, anim: number) {
  const bob = Math.sin(anim) * 2;
  // Stem (thicker)
  ctx.fillStyle = '#1B5E20';
  ctx.beginPath();
  ctx.roundRect(x - s * 0.07, y + s * 0.15, s * 0.14, s * 0.45, 3);
  ctx.fill();
  // Leaves
  ctx.fillStyle = '#388E3C';
  ctx.save(); ctx.translate(x - s * 0.07, y + s * 0.35);
  ctx.rotate(-0.5);
  ctx.beginPath(); ctx.ellipse(0, 0, s * 0.24, s * 0.06, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.save(); ctx.translate(x + s * 0.07, y + s * 0.38);
  ctx.rotate(0.4);
  ctx.beginPath(); ctx.ellipse(0, 0, s * 0.22, s * 0.055, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // Head (slightly larger)
  const hg = ctx.createRadialGradient(x - s * 0.05, y - s * 0.15 + bob, s * 0.05, x, y - s * 0.1 + bob, s * 0.4);
  hg.addColorStop(0, '#4CAF50');
  hg.addColorStop(1, '#1B5E20');
  ctx.fillStyle = hg;
  ctx.beginPath(); ctx.arc(x, y - s * 0.1 + bob, s * 0.37, 0, Math.PI * 2); ctx.fill();
  // Double cannon tubes
  ctx.fillStyle = '#0D3B0F';
  ctx.beginPath();
  ctx.ellipse(x + s * 0.3, y - s * 0.18 + bob, s * 0.16, s * 0.11, -0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x + s * 0.3, y - s * 0.02 + bob, s * 0.16, s * 0.11, 0.15, 0, Math.PI * 2);
  ctx.fill();
  // Cannon inners
  ctx.fillStyle = '#061a06';
  ctx.beginPath(); ctx.arc(x + s * 0.4, y - s * 0.18 + bob, s * 0.06, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + s * 0.4, y - s * 0.02 + bob, s * 0.06, 0, Math.PI * 2); ctx.fill();
  // Eyes (determined)
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.ellipse(x - s * 0.1, y - s * 0.2 + bob, s * 0.1, s * 0.11, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + s * 0.08, y - s * 0.22 + bob, s * 0.08, s * 0.09, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath(); ctx.arc(x - s * 0.06, y - s * 0.2 + bob, s * 0.05, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + s * 0.11, y - s * 0.22 + bob, s * 0.04, 0, Math.PI * 2); ctx.fill();
  // Angry eyebrows
  ctx.strokeStyle = '#0D3B0F';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x - s * 0.18, y - s * 0.3 + bob); ctx.lineTo(x - s * 0.02, y - s * 0.28 + bob); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + s * 0.16, y - s * 0.3 + bob); ctx.lineTo(x + s * 0.02, y - s * 0.28 + bob); ctx.stroke();
}

function drawCherryBomb(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, anim: number) {
  const bob = Math.sin(anim * 2) * 1;
  const pulse = 1 + Math.sin(anim * 4) * 0.03;
  // Glow
  ctx.fillStyle = 'rgba(255,80,0,0.12)';
  ctx.beginPath(); ctx.arc(x, y + bob, s * 0.55 * pulse, 0, Math.PI * 2); ctx.fill();
  // Stems
  ctx.strokeStyle = '#2E7D32';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x - s * 0.12, y - s * 0.2 + bob);
  ctx.quadraticCurveTo(x, y - s * 0.55 + bob, x + s * 0.15, y - s * 0.45 + bob);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + s * 0.12, y - s * 0.2 + bob);
  ctx.quadraticCurveTo(x + s * 0.05, y - s * 0.5 + bob, x + s * 0.15, y - s * 0.45 + bob);
  ctx.stroke();
  // Leaf
  ctx.fillStyle = '#4CAF50';
  ctx.save(); ctx.translate(x + s * 0.15, y - s * 0.45 + bob);
  ctx.rotate(0.3);
  ctx.beginPath(); ctx.ellipse(0, 0, s * 0.12, s * 0.05, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // Left cherry
  const lg = ctx.createRadialGradient(x - s * 0.15 - s * 0.05, y + s * 0.05 + bob - s * 0.05, s * 0.05, x - s * 0.15, y + s * 0.05 + bob, s * 0.22 * pulse);
  lg.addColorStop(0, '#FF5252');
  lg.addColorStop(0.7, '#D32F2F');
  lg.addColorStop(1, '#B71C1C');
  ctx.fillStyle = lg;
  ctx.beginPath(); ctx.arc(x - s * 0.15, y + s * 0.05 + bob, s * 0.22 * pulse, 0, Math.PI * 2); ctx.fill();
  // Right cherry
  const rg = ctx.createRadialGradient(x + s * 0.15 - s * 0.05, y + s * 0.05 + bob - s * 0.05, s * 0.05, x + s * 0.15, y + s * 0.05 + bob, s * 0.22 * pulse);
  rg.addColorStop(0, '#FF5252');
  rg.addColorStop(0.7, '#D32F2F');
  rg.addColorStop(1, '#B71C1C');
  ctx.fillStyle = rg;
  ctx.beginPath(); ctx.arc(x + s * 0.15, y + s * 0.05 + bob, s * 0.22 * pulse, 0, Math.PI * 2); ctx.fill();
  // Angry faces on cherries
  // Left face
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x - s * 0.19, y + bob, s * 0.045, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x - s * 0.11, y + bob, s * 0.045, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath(); ctx.arc(x - s * 0.18, y + bob, s * 0.025, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x - s * 0.12, y + bob, s * 0.025, 0, Math.PI * 2); ctx.fill();
  // Angry brows left
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x - s * 0.22, y - s * 0.04 + bob); ctx.lineTo(x - s * 0.15, y - s * 0.02 + bob); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - s * 0.08, y - s * 0.04 + bob); ctx.lineTo(x - s * 0.15, y - s * 0.02 + bob); ctx.stroke();
  // Right face
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x + s * 0.11, y + bob, s * 0.045, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + s * 0.19, y + bob, s * 0.045, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath(); ctx.arc(x + s * 0.12, y + bob, s * 0.025, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + s * 0.18, y + bob, s * 0.025, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x + s * 0.08, y - s * 0.04 + bob); ctx.lineTo(x + s * 0.15, y - s * 0.02 + bob); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + s * 0.22, y - s * 0.04 + bob); ctx.lineTo(x + s * 0.15, y - s * 0.02 + bob); ctx.stroke();
  // Fuse spark
  const sparkSize = s * 0.04 + Math.sin(anim * 6) * s * 0.02;
  ctx.fillStyle = '#FFEB3B';
  ctx.beginPath(); ctx.arc(x + s * 0.15, y - s * 0.45 + bob, sparkSize, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#FF9800';
  ctx.beginPath(); ctx.arc(x + s * 0.15, y - s * 0.45 + bob, sparkSize * 0.6, 0, Math.PI * 2); ctx.fill();
  // Highlight on cherries
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath(); ctx.ellipse(x - s * 0.2, y - s * 0.02 + bob, s * 0.07, s * 0.04, -0.4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + s * 0.1, y - s * 0.02 + bob, s * 0.07, s * 0.04, -0.4, 0, Math.PI * 2); ctx.fill();
}

function drawPlant(ctx: CanvasRenderingContext2D, type: PlantType, x: number, y: number,
  cellW: number, cellH: number, animPhase: number, hpRatio: number) {
  const s = Math.min(cellW, cellH) * 0.85;
  switch (type) {
    case 'peashooter': drawPeashooter(ctx, x, y, s, animPhase); break;
    case 'wallnut': drawWallnut(ctx, x, y, s, animPhase, hpRatio); break;
    case 'snowpea': drawSnowPea(ctx, x, y, s, animPhase); break;
    case 'repeater': drawRepeater(ctx, x, y, s, animPhase); break;
    case 'cherrybomb': drawCherryBomb(ctx, x, y, s, animPhase); break;
  }
}

// --- Zombie Drawing ---
function drawZombieBase(ctx: CanvasRenderingContext2D, x: number, zy: number, bob: number,
  cellW: number, cellH: number, animPhase: number, slowed: boolean, eating: boolean) {
  const s = Math.min(cellW, cellH) * 0.85;
  const skinColor = slowed ? '#5B8DB8' : '#7A9A3A';
  const skinDark = slowed ? '#3D6A8E' : '#5A7A2A';
  const skinLight = slowed ? '#7AB0D8' : '#9ABB5A';
  const walkCycle = eating ? 0 : Math.sin(animPhase) * 6;
  const armSwing = eating ? 0 : Math.sin(animPhase * 1.5) * 10;

  // Legs
  ctx.fillStyle = '#4A4A5A';
  ctx.save(); ctx.translate(x - s * 0.08, zy + s * 0.28 + bob);
  ctx.rotate(walkCycle * 0.02);
  ctx.beginPath(); ctx.roundRect(-s * 0.05, 0, s * 0.1, s * 0.2, 3); ctx.fill();
  ctx.restore();
  ctx.save(); ctx.translate(x + s * 0.08, zy + s * 0.28 + bob);
  ctx.rotate(-walkCycle * 0.02);
  ctx.beginPath(); ctx.roundRect(-s * 0.05, 0, s * 0.1, s * 0.2, 3); ctx.fill();
  ctx.restore();

  // Shoes
  ctx.fillStyle = '#333';
  ctx.beginPath(); ctx.ellipse(x - s * 0.08 + walkCycle * 0.01, zy + s * 0.48 + bob, s * 0.08, s * 0.04, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + s * 0.08 - walkCycle * 0.01, zy + s * 0.48 + bob, s * 0.08, s * 0.04, 0, 0, Math.PI * 2); ctx.fill();

  // Body (tattered shirt)
  ctx.fillStyle = '#5A4A3A';
  ctx.beginPath();
  ctx.roundRect(x - s * 0.16, zy - s * 0.05 + bob, s * 0.32, s * 0.35, 4);
  ctx.fill();
  // Shirt tear
  ctx.fillStyle = skinColor;
  ctx.beginPath();
  ctx.moveTo(x + s * 0.05, zy + s * 0.05 + bob);
  ctx.lineTo(x + s * 0.12, zy + s * 0.15 + bob);
  ctx.lineTo(x + s * 0.08, zy + s * 0.25 + bob);
  ctx.closePath();
  ctx.fill();
  // Tie
  ctx.fillStyle = '#8B0000';
  ctx.beginPath();
  ctx.moveTo(x, zy - s * 0.02 + bob);
  ctx.lineTo(x + s * 0.04, zy + s * 0.12 + bob);
  ctx.lineTo(x, zy + s * 0.22 + bob);
  ctx.closePath();
  ctx.fill();

  // Arms (extended forward)
  ctx.strokeStyle = skinColor;
  ctx.lineWidth = s * 0.08;
  ctx.lineCap = 'round';
  // Left arm
  ctx.beginPath();
  ctx.moveTo(x - s * 0.16, zy + s * 0.02 + bob);
  ctx.quadraticCurveTo(x - s * 0.3, zy - s * 0.05 + bob + armSwing, x - s * 0.4, zy - s * 0.15 + bob + armSwing);
  ctx.stroke();
  // Right arm
  ctx.beginPath();
  ctx.moveTo(x + s * 0.16, zy + s * 0.02 + bob);
  ctx.quadraticCurveTo(x + s * 0.3, zy - s * 0.08 + bob - armSwing, x + s * 0.38, zy - s * 0.18 + bob - armSwing);
  ctx.stroke();
  // Hands
  ctx.fillStyle = skinLight;
  ctx.beginPath(); ctx.arc(x - s * 0.4, zy - s * 0.15 + bob + armSwing, s * 0.05, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + s * 0.38, zy - s * 0.18 + bob - armSwing, s * 0.05, 0, Math.PI * 2); ctx.fill();

  // Head
  const headGrad = ctx.createRadialGradient(x - s * 0.04, zy - s * 0.22 + bob, s * 0.05, x, zy - s * 0.18 + bob, s * 0.22);
  headGrad.addColorStop(0, skinLight);
  headGrad.addColorStop(1, skinDark);
  ctx.fillStyle = headGrad;
  ctx.beginPath(); ctx.arc(x, zy - s * 0.18 + bob, s * 0.2, 0, Math.PI * 2); ctx.fill();

  // Eyes (one bigger, googly)
  ctx.fillStyle = '#FFE0B2';
  ctx.beginPath(); ctx.ellipse(x - s * 0.07, zy - s * 0.22 + bob, s * 0.06, s * 0.07, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + s * 0.08, zy - s * 0.2 + bob, s * 0.05, s * 0.06, 0.1, 0, Math.PI * 2); ctx.fill();
  // Red pupils
  ctx.fillStyle = '#D32F2F';
  ctx.beginPath(); ctx.arc(x - s * 0.06, zy - s * 0.22 + bob, s * 0.03, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + s * 0.09, zy - s * 0.2 + bob, s * 0.025, 0, Math.PI * 2); ctx.fill();
  // Pupil highlights
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x - s * 0.05, zy - s * 0.23 + bob, s * 0.012, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + s * 0.1, zy - s * 0.21 + bob, s * 0.01, 0, Math.PI * 2); ctx.fill();

  // Mouth (open, showing teeth)
  ctx.fillStyle = '#2c1a0a';
  ctx.beginPath();
  ctx.ellipse(x, zy - s * 0.08 + bob, s * 0.08, s * 0.04, 0, 0, Math.PI * 2);
  ctx.fill();
  // Teeth
  ctx.fillStyle = '#E8DCC8';
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.roundRect(x + i * s * 0.028 - s * 0.01, zy - s * 0.1 + bob, s * 0.018, s * 0.025, 1);
    ctx.fill();
  }

  return { s, bob, skinColor };
}

function drawZombie(ctx: CanvasRenderingContext2D, zombie: Zombie, cellW: number, cellH: number,
  ox: number, oy: number) {
  const zy = oy + zombie.row * cellH + cellH / 2;
  const bob = zombie.eating ? 0 : Math.sin(zombie.animPhase) * 3;
  const alpha = zombie.dead ? Math.max(0, zombie.deathTimer / 500) : 1;
  ctx.globalAlpha = alpha;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(zombie.x, oy + zombie.row * cellH + cellH - 6, cellW * 0.18, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  const { s, bob: b } = drawZombieBase(ctx, zombie.x, zy, bob, cellW, cellH, zombie.animPhase, zombie.slowed, zombie.eating);

  // Accessories
  if (zombie.type === 'cone') {
    // Orange traffic cone
    const cg = ctx.createLinearGradient(zombie.x - s * 0.12, zy - s * 0.5 + b, zombie.x + s * 0.12, zy - s * 0.2 + b);
    cg.addColorStop(0, '#FF9800');
    cg.addColorStop(1, '#E65100');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.moveTo(zombie.x, zy - s * 0.52 + b);
    ctx.lineTo(zombie.x - s * 0.14, zy - s * 0.22 + b);
    ctx.lineTo(zombie.x + s * 0.14, zy - s * 0.22 + b);
    ctx.closePath();
    ctx.fill();
    // White stripes
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillRect(zombie.x - s * 0.09, zy - s * 0.38 + b, s * 0.18, s * 0.04);
    ctx.fillRect(zombie.x - s * 0.06, zy - s * 0.3 + b, s * 0.12, s * 0.03);
  } else if (zombie.type === 'bucket') {
    // Metal bucket
    const bg = ctx.createLinearGradient(zombie.x - s * 0.15, zy - s * 0.48 + b, zombie.x + s * 0.15, zy - s * 0.18 + b);
    bg.addColorStop(0, '#90A4AE');
    bg.addColorStop(0.3, '#78909C');
    bg.addColorStop(0.7, '#607D8B');
    bg.addColorStop(1, '#455A64');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(zombie.x - s * 0.14, zy - s * 0.45 + b, s * 0.28, s * 0.28, 3);
    ctx.fill();
    // Bucket rim
    ctx.fillStyle = '#B0BEC5';
    ctx.fillRect(zombie.x - s * 0.15, zy - s * 0.45 + b, s * 0.3, s * 0.04);
    // Handle
    ctx.strokeStyle = '#90A4AE'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(zombie.x, zy - s * 0.45 + b, s * 0.1, Math.PI, 0);
    ctx.stroke();
    // Rivets
    ctx.fillStyle = '#CFD8DC';
    ctx.beginPath(); ctx.arc(zombie.x - s * 0.1, zy - s * 0.3 + b, s * 0.02, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(zombie.x + s * 0.1, zy - s * 0.3 + b, s * 0.02, 0, Math.PI * 2); ctx.fill();
  } else if (zombie.type === 'flag') {
    // Flag pole
    ctx.strokeStyle = '#5D4037'; ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(zombie.x + s * 0.12, zy - s * 0.15 + b);
    ctx.lineTo(zombie.x + s * 0.12, zy - s * 0.6 + b);
    ctx.stroke();
    // Flag (waving)
    const wave = Math.sin(zombie.animPhase * 2) * s * 0.03;
    ctx.fillStyle = '#D32F2F';
    ctx.beginPath();
    ctx.moveTo(zombie.x + s * 0.12, zy - s * 0.6 + b);
    ctx.quadraticCurveTo(zombie.x + s * 0.25 + wave, zy - s * 0.55 + b, zombie.x + s * 0.32, zy - s * 0.5 + b);
    ctx.lineTo(zombie.x + s * 0.12, zy - s * 0.4 + b);
    ctx.closePath();
    ctx.fill();
    // Skull on flag
    ctx.fillStyle = '#fff';
    ctx.font = `${s * 0.1}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('☠', zombie.x + s * 0.2, zy - s * 0.48 + b);
  }

  // Slowed aura
  if (zombie.slowed && !zombie.dead) {
    ctx.fillStyle = 'rgba(0, 188, 212, 0.15)';
    ctx.beginPath(); ctx.arc(zombie.x, zy + bob, s * 0.35, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
}

// ============ Component ============
export default function PvZGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const gs = useRef<GameState | null>(null);
  const rafRef = useRef<number>(0);
  const [phase, setPhase] = useState<GamePhase>('menu');
  const [uiTick, setUiTick] = useState(0);
  const forceUpdate = useCallback(() => setUiTick(t => t + 1), []);

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

  const initGame = useCallback(() => {
    _idCounter = 0;
    const state: GameState = {
      phase: 'playing', sun: STARTING_SUN, score: 0, wave: 0,
      plants: [], zombies: [], projectiles: [],
      explosions: [], floatingTexts: [],
      selectedPlant: null, currentQuiz: null, quizCooldown: 0,
      wordsAnswered: 0, wordsCorrect: 0,
      waveStartTime: Date.now(), waveZombiesSpawned: 0,
      totalKills: 0, lastTime: Date.now(),
      zombieSpeedBoostEnd: 0, usedWordIndices: new Set(),
      shakeTimer: 0, comboCount: 0,
    };
    gs.current = state;
    setPhase('playing');
    generateQuiz(state);
    forceUpdate();
  }, [forceUpdate]);

  const generateQuiz = useCallback((state: GameState) => {
    const difficultyFilter = state.wordsAnswered < 3 ? 1 : 0;
    let available = WORD_BANK.map((_, i) => i).filter(
      i => !state.usedWordIndices.has(i) && (!difficultyFilter || WORD_BANK[i].difficulty === 1)
    );
    if (available.length < 4) { state.usedWordIndices.clear(); }
    available = WORD_BANK.map((_, i) => i).filter(
      i => !state.usedWordIndices.has(i) && (!difficultyFilter || WORD_BANK[i].difficulty === 1)
    );
    if (available.length < 4) available = WORD_BANK.map((_, i) => i);
    const shuffled = shuffle(available);
    const correctIdx = shuffled[0];
    const correctWord = WORD_BANK[correctIdx];
    state.usedWordIndices.add(correctIdx);
    const wrongPool = WORD_BANK.map((_, i) => i).filter( i => i !== correctIdx && (!difficultyFilter || WORD_BANK[i].difficulty === 1) );
    const wrongShuffled = shuffle(wrongPool).slice(0, 3);
    const options = shuffle([correctWord.zh, ...wrongShuffled.map(i => WORD_BANK[i].zh)]);
    state.currentQuiz = {
      word: correctWord, options,
      correctIndex: options.indexOf(correctWord.zh),
      timer: QUIZ_TIME_LIMIT, answered: false, wasCorrect: undefined,
    };
    forceUpdate();
  }, [forceUpdate]);

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
      lastAttack: Date.now(), animPhase: Math.random() * Math.PI * 2,
    };
    state.plants.push(plant);

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
              if (z.hp <= 0) { z.dead = true; z.deathTimer = 500; capturedState.totalKills++; capturedState.score += 50; }
            }
          }
        });
        capturedState.plants = capturedState.plants.filter(p => p.id !== capturedPlant.id);
        forceUpdate();
      }, 500);
    }
    forceUpdate();
  }, [forceUpdate]);

  // ---- Game loop ----
  const gameLoop = useCallback(() => {
    const state = gs.current;
    const canvas = canvasRef.current;
    if (!state || !canvas) return;
    if (state.phase !== 'playing') return;
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
        } else break;
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
      if (zombie.dead) { zombie.deathTimer -= dt; continue; }
      if (zombie.slowed) { zombie.slowTimer -= dt; if (zombie.slowTimer <= 0) zombie.slowed = false; }
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
          if (eatingPlant.hp <= 0) state.plants = state.plants.filter(p => p.id !== eatingPlant.id);
        }
      } else {
        zombie.eating = false;
        zombie.x -= currentSpeed * (dt / 1000);
      }
      if (zombie.x < ox - cellW * 0.5) gameOver = true;
    }
    state.zombies = state.zombies.filter(z => !(z.dead && z.deathTimer <= 0));

    if (gameOver) { state.phase = 'gameover'; setPhase('gameover'); return; }

    // -- Update plants --
    for (const plant of state.plants) {
      plant.animPhase += dt * 0.003;
      const def = PLANT_DEFS[plant.type];
      if (def.attack && def.attackSpeed) {
        const hasZombie = state.zombies.some(z => !z.dead && z.row === plant.row && z.x > ox + plant.col * cellW);
        if (hasZombie && now - plant.lastAttack >= def.attackSpeed) {
          plant.lastAttack = now;
          const px = ox + plant.col * cellW + cellW * 0.7;
          state.projectiles.push({ id: uid(), row: plant.row, x: px, speed: 250, damage: def.attack, slow: !!def.slowEffect, active: true });
          if (def.doubleShot) {
            setTimeout(() => {
              if (gs.current?.phase === 'playing') {
                gs.current.projectiles.push({ id: uid(), row: plant.row, x: px, speed: 250, damage: def.attack, slow: false, active: true });
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
      const hitZombie = state.zombies.find(z => !z.dead && z.row === proj.row && Math.abs(z.x - proj.x) < cellW * 0.25);
      if (hitZombie) {
        proj.active = false;
        hitZombie.hp -= proj.damage;
        if (proj.slow) { hitZombie.slowed = true; hitZombie.slowTimer = 3000; }
        if (hitZombie.hp <= 0) { hitZombie.dead = true; hitZombie.deathTimer = 500; state.totalKills++; state.score += 50; }
        state.floatingTexts.push({
          id: uid(), x: proj.x, y: oy + proj.row * cellH + cellH * 0.25,
          text: `-${proj.damage}`, color: proj.slow ? '#00E5FF' : '#FF6600', timer: 600, maxTimer: 600,
        });
      }
      if (proj.x > ox + (GRID_COLS + 1) * cellW) proj.active = false;
    }
    state.projectiles = state.projectiles.filter(p => p.active);

    // -- Update effects --
    for (const exp of state.explosions) { exp.timer += dt; exp.radius = (exp.timer / exp.maxTimer) * exp.maxRadius; }
    state.explosions = state.explosions.filter(e => e.timer < e.maxTimer);
    for (const ft of state.floatingTexts) { ft.timer -= dt; ft.y -= dt * 0.04; }
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

    // Background - sky
    const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
    skyGrad.addColorStop(0, '#5BA3D9');
    skyGrad.addColorStop(0.15, '#87CEEB');
    skyGrad.addColorStop(0.3, '#B0E0E6');
    skyGrad.addColorStop(0.45, '#90EE90');
    skyGrad.addColorStop(1, '#2E7D32');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h);

    // Clouds
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    const cloudY = h * 0.06;
    ctx.beginPath(); ctx.ellipse(w * 0.15, cloudY, 40, 14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(w * 0.18, cloudY - 5, 25, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(w * 0.55, cloudY + 8, 35, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(w * 0.58, cloudY + 3, 28, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(w * 0.82, cloudY - 3, 32, 11, 0, 0, Math.PI * 2); ctx.fill();

    // Grid
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const isLight = (r + c) % 2 === 0;
        ctx.fillStyle = isLight ? 'rgba(76, 175, 80, 0.35)' : 'rgba(56, 142, 60, 0.3)';
        ctx.fillRect(ox + c * cellW, oy + r * cellH, cellW, cellH);
        // Subtle grass texture
        ctx.fillStyle = isLight ? 'rgba(100, 200, 100, 0.12)' : 'rgba(60, 160, 60, 0.08)';
        for (let gi = 0; gi < 3; gi++) {
          const gx = ox + c * cellW + ((r * 7 + c * 13 + gi * 17) % 10) / 10 * cellW;
          const gy = oy + r * cellH + ((r * 11 + c * 3 + gi * 7) % 8) / 8 * cellH;
          ctx.fillRect(gx, gy, 2, 4);
        }
        ctx.strokeStyle = 'rgba(0, 80, 0, 0.08)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(ox + c * cellW, oy + r * cellH, cellW, cellH);
      }
    }

    // House edge
    const houseGrad = ctx.createLinearGradient(0, oy, ox, oy);
    houseGrad.addColorStop(0, '#6D4C2A');
    houseGrad.addColorStop(0.6, '#8B6914');
    houseGrad.addColorStop(1, '#A07830');
    ctx.fillStyle = houseGrad;
    ctx.fillRect(0, oy, ox - 2, GRID_ROWS * cellH);
    // Door
    const doorW = ox * 0.45;
    const doorH = cellH * 0.75;
    ctx.fillStyle = '#4E342E';
    const doorX = (ox - doorW) / 2;
    const doorY = oy + (GRID_ROWS * cellH - doorH) / 2;
    ctx.beginPath();
    ctx.roundRect(doorX, doorY, doorW, doorH, [6, 6, 0, 0]);
    ctx.fill();
    // Door knob
    ctx.fillStyle = '#FFD54F';
    ctx.beginPath(); ctx.arc(doorX + doorW * 0.75, doorY + doorH * 0.55, 3, 0, Math.PI * 2); ctx.fill();
    // Windows
    ctx.fillStyle = '#BBDEFB';
    const winS = ox * 0.28;
    ctx.fillRect(ox * 0.15, oy + cellH * 0.3, winS, winS);
    ctx.fillRect(ox * 0.15, oy + cellH * 2.2, winS, winS);
    // Window frames
    ctx.strokeStyle = '#5D4037'; ctx.lineWidth = 1.5;
    ctx.strokeRect(ox * 0.15, oy + cellH * 0.3, winS, winS);
    ctx.strokeRect(ox * 0.15, oy + cellH * 2.2, winS, winS);
    ctx.beginPath();
    ctx.moveTo(ox * 0.15 + winS / 2, oy + cellH * 0.3); ctx.lineTo(ox * 0.15 + winS / 2, oy + cellH * 0.3 + winS);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ox * 0.15, oy + cellH * 0.3 + winS / 2); ctx.lineTo(ox * 0.15 + winS, oy + cellH * 0.3 + winS / 2);
    ctx.stroke();

    // Grid hover when plant selected
    if (state.selectedPlant) {
      ctx.fillStyle = 'rgba(255, 255, 0, 0.08)';
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
      const px = ox + plant.col * cellW + cellW / 2;
      const py = oy + plant.row * cellH + cellH / 2;
      const hpRatio = plant.hp / plant.maxHp;
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.beginPath();
      ctx.ellipse(px, oy + plant.row * cellH + cellH - 5, cellW * 0.22, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      drawPlant(ctx, plant.type, px, py, cellW, cellH, plant.animPhase, hpRatio);
      // HP bar
      if (plant.hp < plant.maxHp) {
        const barW = cellW * 0.6;
        const barX = px - barW / 2;
        const barY = oy + plant.row * cellH + 3;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath(); ctx.roundRect(barX - 1, barY - 1, barW + 2, 6, 3); ctx.fill();
        const ratio = Math.max(0, hpRatio);
        const hpColor = ratio > 0.5 ? '#4CAF50' : ratio > 0.25 ? '#FF9800' : '#F44336';
        ctx.fillStyle = hpColor;
        ctx.beginPath(); ctx.roundRect(barX, barY, barW * ratio, 4, 2); ctx.fill();
      }
    }

    // Draw projectiles
    for (const proj of state.projectiles) {
      const py = oy + proj.row * cellH + cellH / 2;
      const pSize = Math.max(4, cellW * 0.08);
      // Trail
      ctx.fillStyle = proj.slow ? 'rgba(0,229,255,0.3)' : 'rgba(118,255,3,0.3)';
      ctx.beginPath(); ctx.ellipse(proj.x - pSize * 1.5, py, pSize * 1.8, pSize * 0.8, 0, 0, Math.PI * 2); ctx.fill();
      // Glow
      ctx.shadowColor = proj.slow ? '#00E5FF' : '#76FF03';
      ctx.shadowBlur = 8;
      // Main projectile
      const pg = ctx.createRadialGradient(proj.x - pSize * 0.2, py - pSize * 0.2, 0, proj.x, py, pSize);
      if (proj.slow) {
        pg.addColorStop(0, '#E0F7FA');
        pg.addColorStop(0.5, '#00E5FF');
        pg.addColorStop(1, '#0097A7');
      } else {
        pg.addColorStop(0, '#CCFF90');
        pg.addColorStop(0.5, '#76FF03');
        pg.addColorStop(1, '#33691E');
      }
      ctx.fillStyle = pg;
      ctx.beginPath(); ctx.arc(proj.x, py, pSize, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Draw zombies
    for (const zombie of state.zombies) {
      drawZombie(ctx, zombie, cellW, cellH, ox, oy);
      // HP bar
      if (!zombie.dead && zombie.hp < zombie.maxHp) {
        const barW = cellW * 0.45;
        const barX = zombie.x - barW / 2;
        const barY = oy + zombie.row * cellH + 3;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath(); ctx.roundRect(barX - 1, barY - 1, barW + 2, 6, 3); ctx.fill();
        const ratio = Math.max(0, zombie.hp / zombie.maxHp);
        const hpColor = ratio > 0.5 ? '#4CAF50' : ratio > 0.25 ? '#FF9800' : '#F44336';
        ctx.fillStyle = hpColor;
        ctx.beginPath(); ctx.roundRect(barX, barY, barW * ratio, 4, 2); ctx.fill();
      }
    }

    // Explosions
    for (const exp of state.explosions) {
      const progress = exp.timer / exp.maxTimer;
      const alpha = 1 - progress;
      // Outer ring
      ctx.strokeStyle = `rgba(255, 200, 0, ${alpha * 0.8})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(exp.x, exp.y, exp.radius, 0, Math.PI * 2); ctx.stroke();
      // Inner glow
      ctx.fillStyle = `rgba(255, 100, 0, ${alpha * 0.5})`;
      ctx.beginPath(); ctx.arc(exp.x, exp.y, exp.radius, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(255, 220, 50, ${alpha * 0.4})`;
      ctx.beginPath(); ctx.arc(exp.x, exp.y, exp.radius * 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(255, 255, 200, ${alpha * 0.6})`;
      ctx.beginPath(); ctx.arc(exp.x, exp.y, exp.radius * 0.2, 0, Math.PI * 2); ctx.fill();
    }

    // Floating texts
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const ft of state.floatingTexts) {
      const alpha = Math.min(1, ft.timer / (ft.maxTimer * 0.3));
      ctx.globalAlpha = alpha;
      ctx.font = 'bold 16px "Noto Sans SC", sans-serif';
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 3;
      ctx.strokeText(ft.text, ft.x, ft.y);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.globalAlpha = 1;
    }

    // Wave announcement
    if (state.waveZombiesSpawned <= 1 && waveConfig) {
      const waveElapsed = now - state.waveStartTime;
      if (waveElapsed < 2500) {
        const alpha = waveElapsed < 500 ? waveElapsed / 500 : waveElapsed > 2000 ? (2500 - waveElapsed) / 500 : 1;
        ctx.globalAlpha = alpha;
        ctx.font = 'bold 30px "Noto Sans SC", sans-serif';
        ctx.textAlign = 'center';
        ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 4;
        ctx.strokeText(`第 ${state.wave + 1} 波`, w / 2, h / 2 - 10);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(`第 ${state.wave + 1} 波`, w / 2, h / 2 - 10);
        ctx.font = '16px "Noto Sans SC", sans-serif';
        ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 3;
        ctx.strokeText(`${waveConfig.zombies.length} 个僵尸来袭!`, w / 2, h / 2 + 22);
        ctx.fillStyle = '#FFE082';
        ctx.fillText(`${waveConfig.zombies.length} 个僵尸来袭!`, w / 2, h / 2 + 22);
        ctx.globalAlpha = 1;
      }
    }

    // Speed boost border effect
    if (isBoosted) {
      const pulse = 0.3 + Math.sin(now * 0.008) * 0.15;
      ctx.strokeStyle = `rgba(255, 0, 0, ${pulse})`;
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, w - 4, h - 4);
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
        <div className="flex-1 flex flex-col items-center justify-center gap-4 relative overflow-hidden"
          style={{ background: 'linear-gradient(180deg, #1a472a 0%, #2d5a27 40%, #4a7c3f 100%)' }}>
          {/* Decorative grass */}
          <div className="absolute bottom-0 left-0 right-0 h-24" style={{ background: 'linear-gradient(0deg, #2E7D32, transparent)' }} />
          <div className="text-8xl animate-bounce drop-shadow-lg" style={{ filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.3))' }}>🧟</div>
          <h1 className="text-4xl md:text-6xl font-extrabold text-yellow-300 z-10"
            style={{ textShadow: '3px 3px 0 #5D4037, 0 0 30px rgba(255,215,0,0.4)' }}>
            植物大战僵尸
          </h1>
          <p className="text-xl md:text-2xl text-green-200 font-semibold tracking-widest z-10">
            单词大作战
          </p>
          <div className="mt-2 text-sm md:text-base text-green-300/90 text-center space-y-2 z-10 bg-black/20 rounded-xl px-6 py-3">
            <p>📝 答对单词自动获得阳光</p>
            <p>🌱 用阳光种植植物抵御僵尸</p>
            <p>🧟 不要让僵尸到达你的房子!</p>
            <p>🔥 连续答对获得连击加成</p>
          </div>
          <button onClick={initGame}
            className="mt-4 px-12 py-3.5 bg-gradient-to-b from-yellow-400 to-yellow-500 hover:from-yellow-300 hover:to-yellow-400
              text-green-900 font-bold text-xl rounded-2xl shadow-lg shadow-yellow-600/30
              hover:shadow-xl hover:shadow-yellow-500/40 transition-all hover:scale-105 active:scale-95 z-10">
            开始游戏
          </button>
        </div>
      )}

      {/* ===== Game Screen ===== */}
      {(phase === 'playing' || phase === 'gameover' || phase === 'victory') && state && (
        <>
          {/* Top HUD bar */}
          <div className="flex items-center justify-between px-3 py-1.5 relative z-10 flex-shrink-0"
            style={{ background: 'linear-gradient(180deg, rgba(20,60,20,0.95), rgba(30,80,30,0.9))', borderBottom: '2px solid rgba(255,200,0,0.3)' }}>
            {/* Sun counter */}
            <div className="flex items-center gap-1.5 bg-black/30 rounded-xl px-3 py-1">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-lg"
                style={{ background: 'radial-gradient(circle, #FFF176, #FFD600)', boxShadow: '0 0 8px rgba(255,214,0,0.5)' }}>
                ☀️
              </div>
              <span className="text-yellow-300 font-extrabold text-xl tabular-nums min-w-[45px]">{state.sun}</span>
            </div>
            {/* Stats */}
            <div className="flex items-center gap-3 text-xs md:text-sm">
              <div className="bg-black/25 rounded-lg px-2.5 py-1 text-center">
                <div className="text-yellow-200/70 text-[10px] leading-tight">波次</div>
                <div className="font-extrabold text-base text-white leading-tight">{state.wave + 1}<span className="text-yellow-200/60">/{WAVE_CONFIGS.length}</span></div>
              </div>
              <div className="bg-black/25 rounded-lg px-2.5 py-1 text-center hidden sm:block">
                <div className="text-green-200/70 text-[10px] leading-tight">得分</div>
                <div className="font-bold text-white leading-tight">{state.score}</div>
              </div>
              <div className="bg-black/25 rounded-lg px-2.5 py-1 text-center">
                <div className="text-blue-200/70 text-[10px] leading-tight">答题</div>
                <div className="font-bold text-white leading-tight"><span className="text-green-300">{state.wordsCorrect}</span>/{state.wordsAnswered}</div>
              </div>
              {state.comboCount >= 3 && (
                <div className="bg-orange-600/60 rounded-lg px-2.5 py-1 animate-pulse">
                  <div className="text-orange-200 font-extrabold text-sm">🔥x{state.comboCount}</div>
                </div>
              )}
            </div>
          </div>

          {/* Plant card bar */}
          <div className="flex items-center gap-1.5 px-2 py-1.5 relative z-10 flex-shrink-0 overflow-x-auto"
            style={{ background: 'linear-gradient(180deg, rgba(15,50,15,0.9), rgba(20,60,20,0.85))', borderBottom: '1px solid rgba(100,180,100,0.2)' }}>
            <button
              onClick={() => { state.selectedPlant = null; forceUpdate(); }}
              className={`flex-shrink-0 w-10 h-12 rounded-lg text-base font-bold transition-all flex items-center justify-center ${
                !state.selectedPlant
                  ? 'bg-yellow-500/90 text-green-900 ring-2 ring-yellow-300 shadow-lg shadow-yellow-500/30'
                  : 'bg-green-900/60 text-green-400 hover:bg-green-800/80'
              }`}>
              ✋
            </button>
            {PLANT_ORDER.map(ptype => {
              const def = PLANT_DEFS[ptype];
              const canAfford = state.sun >= def.cost;
              const isSelected = state.selectedPlant === ptype;
              return (
                <button key={ptype}
                  onClick={() => { state.selectedPlant = isSelected ? null : ptype; forceUpdate(); }}
                  disabled={!canAfford}
                  className={`flex-shrink-0 flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl text-xs font-medium transition-all min-w-[52px] ${
                    isSelected
                      ? 'bg-gradient-to-b from-yellow-400 to-yellow-500 text-green-900 ring-2 ring-yellow-300 shadow-lg shadow-yellow-500/30 scale-105'
                      : canAfford
                        ? 'bg-green-900/50 text-green-200 hover:bg-green-800/70 hover:scale-105 border border-green-700/30'
                        : 'bg-green-950/40 text-green-700/40 cursor-not-allowed border border-green-900/20'
                  }`}>
                  <span className="text-xl leading-none">{def.emoji}</span>
                  <span className="font-bold text-[10px] leading-tight">{def.name}</span>
                  <span className={`text-[10px] leading-tight font-bold ${canAfford ? 'text-yellow-300' : 'text-green-800'}`}>
                    ☀️{def.cost}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Canvas area */}
          <div ref={containerRef} className="flex-1 relative min-h-0">
            <canvas
              ref={canvasRef}
              onClick={handleCanvasClick}
              onTouchStart={(e) => { e.preventDefault(); handleCanvasClick(e); }}
              className="w-full h-full"
            />
            {/* Speed boost overlay */}
            {Date.now() < state.zombieSpeedBoostEnd && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-red-600/90 text-white px-4 py-1 rounded-full text-xs font-bold animate-pulse z-10 shadow-lg"
                style={{ boxShadow: '0 0 12px rgba(255,0,0,0.5)' }}>
                ⚡ 僵尸加速中!
              </div>
            )}
          </div>

          {/* Quiz panel */}
          {phase === 'playing' && quiz && (
            <div className={`flex-shrink-0 px-3 md:px-6 py-2.5 border-t-2 transition-colors z-10 ${
              quiz.answered
                ? (quiz.wasCorrect
                  ? 'bg-gradient-to-r from-green-900/95 to-green-800/95 border-green-500/60'
                  : 'bg-gradient-to-r from-red-900/95 to-red-800/95 border-red-500/60')
                : 'bg-gradient-to-b from-slate-900/98 to-slate-800/98 border-slate-600/50'
            }`}>
              <div className="max-w-lg mx-auto">
                {quiz.answered ? (
                  <div className="flex items-center justify-center gap-2 py-1">
                    <span className="text-xl">{quiz.wasCorrect ? '✅' : '❌'}</span>
                    <span className="text-white font-bold text-base">
                      {quiz.word.en} = {quiz.word.zh}
                    </span>
                    <span className="text-slate-400 text-xs ml-2">
                      下一题 {Math.max(0, Math.ceil(state.quizCooldown / 1000))}s
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          diff === 1 ? 'bg-green-700/80 text-green-200'
                            : diff === 2 ? 'bg-yellow-700/80 text-yellow-200'
                              : 'bg-red-700/80 text-red-200'
                        }`}>
                          {diff === 1 ? '简单' : diff === 2 ? '中等' : '困难'} +{QUIZ_SUN_REWARD[diff]}☀️
                        </span>
                        <span className="text-white font-bold text-lg md:text-xl tracking-wide">{quiz.word.en}</span>
                      </div>
                      <span className={`text-sm font-mono tabular-nums ${
                        quiz.timer < 3000 ? 'text-red-400 font-bold animate-pulse' : 'text-slate-400'
                      }`}>
                        {Math.max(0, Math.ceil(quiz.timer / 1000))}s
                      </span>
                    </div>
                    {/* Timer bar */}
                    <div className="w-full h-2 bg-slate-700/80 rounded-full mb-2 overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-150 ${
                        quiz.timer < 3000 ? 'bg-gradient-to-r from-red-600 to-red-400' : 'bg-gradient-to-r from-green-500 to-emerald-400'
                      }`} style={{ width: `${(quiz.timer / QUIZ_TIME_LIMIT) * 100}%` }} />
                    </div>
                    {/* Answer buttons */}
                    <div className="grid grid-cols-2 gap-1.5 md:gap-2">
                      {quiz.options.map((opt, i) => (
                        <button
                          key={i}
                          onClick={() => handleAnswer(i)}
                          className="py-2 md:py-2.5 px-3 md:px-4 rounded-xl text-sm md:text-base font-medium text-white
                            bg-slate-700/60 hover:bg-slate-600/80 active:bg-slate-500/80
                            transition-all hover:scale-[1.02] active:scale-[0.98]
                            border border-slate-600/40 hover:border-slate-500/60
                            hover:shadow-lg hover:shadow-black/20"
                          style={{ backdropFilter: 'blur(4px)' }}>
                          <span className="text-slate-400 mr-1.5 font-bold">{String.fromCharCode(65 + i)}</span>
                          {opt}
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
            <div className="absolute inset-0 flex items-center justify-center z-30"
              style={{ background: 'radial-gradient(circle, rgba(0,0,0,0.7), rgba(0,0,0,0.85))', backdropFilter: 'blur(4px)' }}>
              <div className="rounded-3xl p-8 text-center max-w-sm mx-4 shadow-2xl"
                style={{ background: 'linear-gradient(180deg, #1a1a2e, #16213e)', border: '2px solid rgba(244,67,54,0.5)' }}>
                <div className="text-6xl mb-3" style={{ filter: 'drop-shadow(0 4px 8px rgba(244,67,54,0.4))' }}>💀</div>
                <h2 className="text-3xl font-extrabold text-red-400 mb-3" style={{ textShadow: '0 0 20px rgba(244,67,54,0.3)' }}>
                  游戏结束
                </h2>
                <div className="space-y-2 text-slate-300 text-sm mb-5">
                  <div className="flex justify-between bg-black/20 rounded-lg px-3 py-1.5">
                    <span>存活波次</span>
                    <span className="text-white font-bold">{state.wave + 1}/{WAVE_CONFIGS.length}</span>
                  </div>
                  <div className="flex justify-between bg-black/20 rounded-lg px-3 py-1.5">
                    <span>消灭僵尸</span>
                    <span className="text-white font-bold">{state.totalKills}</span>
                  </div>
                  <div className="flex justify-between bg-black/20 rounded-lg px-3 py-1.5">
                    <span>答题正确率</span>
                    <span className="text-white font-bold">
                      {state.wordsAnswered > 0 ? Math.round(state.wordsCorrect / state.wordsAnswered * 100) : 0}%
                      <span className="text-slate-400 font-normal ml-1">({state.wordsCorrect}/{state.wordsAnswered})</span>
                    </span>
                  </div>
                  <div className="flex justify-between bg-black/20 rounded-lg px-3 py-1.5">
                    <span>最终得分</span>
                    <span className="text-yellow-400 font-extrabold text-xl">{state.score}</span>
                  </div>
                </div>
                <button onClick={initGame}
                  className="px-10 py-3 bg-gradient-to-b from-red-500 to-red-600 hover:from-red-400 hover:to-red-500
                    text-white font-bold text-lg rounded-2xl shadow-lg shadow-red-600/30
                    hover:shadow-xl transition-all hover:scale-105 active:scale-95">
                  再来一局
                </button>
              </div>
            </div>
          )}

          {/* Victory */}
          {phase === 'victory' && (
            <div className="absolute inset-0 flex items-center justify-center z-30"
              style={{ background: 'radial-gradient(circle, rgba(0,0,0,0.5), rgba(0,0,0,0.7))', backdropFilter: 'blur(4px)' }}>
              <div className="rounded-3xl p-8 text-center max-w-sm mx-4 shadow-2xl"
                style={{ background: 'linear-gradient(180deg, #1a2e1a, #162e16)', border: '2px solid rgba(255,215,0,0.5)' }}>
                <div className="text-6xl mb-3" style={{ filter: 'drop-shadow(0 4px 8px rgba(255,215,0,0.4))' }}>🏆</div>
                <h2 className="text-3xl font-extrabold text-yellow-400 mb-1" style={{ textShadow: '0 0 20px rgba(255,215,0,0.3)' }}>
                  胜利!
                </h2>
                <p className="text-green-300 text-sm mb-4">成功抵御了所有僵尸!</p>
                <div className="space-y-2 text-slate-300 text-sm mb-5">
                  <div className="flex justify-between bg-black/20 rounded-lg px-3 py-1.5">
                    <span>消灭僵尸</span>
                    <span className="text-white font-bold">{state.totalKills}</span>
                  </div>
                  <div className="flex justify-between bg-black/20 rounded-lg px-3 py-1.5">
                    <span>答题正确率</span>
                    <span className="text-white font-bold">
                      {state.wordsAnswered > 0 ? Math.round(state.wordsCorrect / state.wordsAnswered * 100) : 0}%
                      <span className="text-slate-400 font-normal ml-1">({state.wordsCorrect}/{state.wordsAnswered})</span>
                    </span>
                  </div>
                  <div className="flex justify-between bg-black/20 rounded-lg px-3 py-1.5">
                    <span>最终得分</span>
                    <span className="text-yellow-400 font-extrabold text-xl">{state.score}</span>
                  </div>
                </div>
                <button onClick={initGame}
                  className="px-10 py-3 bg-gradient-to-b from-yellow-400 to-yellow-500 hover:from-yellow-300 hover:to-yellow-400
                    text-green-900 font-bold text-lg rounded-2xl shadow-lg shadow-yellow-500/30
                    hover:shadow-xl transition-all hover:scale-105 active:scale-95">
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
