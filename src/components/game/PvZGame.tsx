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

// ============ Canvas Drawing Helpers ============
const R = (r: number) => Math.max(0.5, r);

// --- Plant Drawing ---
function drawPeashooter(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, anim: number) {
  const bob = Math.sin(anim) * 3;
  const tilt = Math.sin(anim * 0.7) * 0.03;
  ctx.save(); ctx.translate(x, y + s * 0.08); ctx.rotate(tilt); ctx.translate(-x, -y - s * 0.08);
  // Pot/soil base (warmer terracotta)
  const pg = ctx.createLinearGradient(x - s * 0.22, y + s * 0.38, x + s * 0.22, y + s * 0.45);
  pg.addColorStop(0, '#BCAAA4'); pg.addColorStop(0.5, '#A1887F'); pg.addColorStop(1, '#795548');
  ctx.fillStyle = pg;
  ctx.beginPath(); ctx.ellipse(x, y + s * 0.42, s * 0.22, s * 0.08, 0, 0, Math.PI * 2); ctx.fill();
  // Pot rim
  ctx.fillStyle = '#8D6E63';
  ctx.beginPath(); ctx.ellipse(x, y + s * 0.38, s * 0.2, s * 0.04, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#5D4037';
  ctx.beginPath(); ctx.ellipse(x, y + s * 0.42, s * 0.22, s * 0.05, 0, 0, Math.PI * 2); ctx.fill();
  // Thick stem
  const sg = ctx.createLinearGradient(x - s * 0.055, 0, x + s * 0.055, 0);
  sg.addColorStop(0, '#2E7D32'); sg.addColorStop(0.25, '#66BB6A'); sg.addColorStop(0.65, '#4CAF50'); sg.addColorStop(1, '#2E7D32');
  ctx.fillStyle = sg;
  ctx.beginPath(); ctx.roundRect(x - s * 0.055, y + s * 0.08, s * 0.11, s * 0.33, 5); ctx.fill();
  // Stem highlight
   ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath(); ctx.roundRect(x - s * 0.02, y + s * 0.1, s * 0.04, s * 0.28, 3); ctx.fill();
  // Left leaf (bigger, with veins)
  ctx.fillStyle = '#81C784';
  ctx.save(); ctx.translate(x - s * 0.055, y + s * 0.26); ctx.rotate(-0.5);
  ctx.beginPath(); ctx.ellipse(0, 0, s * 0.21, s * 0.07, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(46,125,50,0.35)'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(-s * 0.17, 0); ctx.lineTo(s * 0.17, 0); ctx.stroke();
  ctx.strokeStyle = 'rgba(46,125,50,0.2)'; ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(-s * 0.1, -s * 0.025); ctx.lineTo(s * 0.06, s * 0.02); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-s * 0.08, s * 0.025); ctx.lineTo(s * 0.06, -s * 0.01); ctx.stroke();
  ctx.restore();
  // Right leaf
  ctx.fillStyle = '#66BB6A';
  ctx.save(); ctx.translate(x + s * 0.055, y + s * 0.33); ctx.rotate(0.4);
  ctx.beginPath(); ctx.ellipse(0, 0, s * 0.19, s * 0.065, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(46,125,50,0.35)'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(-s * 0.15, 0); ctx.lineTo(s * 0.15, 0); ctx.stroke();
  ctx.restore();
  // Top sprout/crown leaf
  ctx.fillStyle = '#A5D6A7';
  ctx.save(); ctx.translate(x, y - s * 0.42 + bob); ctx.rotate(-0.2);
  ctx.beginPath(); ctx.ellipse(0, 0, s * 0.06, s * 0.14, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#81C784';
  ctx.save(); ctx.translate(x, y - s * 0.42 + bob); ctx.rotate(0.25);
  ctx.beginPath(); ctx.ellipse(0, 0, s * 0.05, s * 0.12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // Big round head
  const hg = ctx.createRadialGradient(x - s * 0.1, y - s * 0.2 + bob, s * 0.06, x, y - s * 0.1 + bob, s * 0.42);
  hg.addColorStop(0, '#C8E6C9'); hg.addColorStop(0.25, '#A5D6A7'); hg.addColorStop(0.55, '#66BB6A'); hg.addColorStop(0.85, '#4CAF50'); hg.addColorStop(1, '#2E7D32');
  ctx.fillStyle = hg;
  ctx.beginPath(); ctx.arc(x, y - s * 0.12 + bob, s * 0.38, 0, Math.PI * 2); ctx.fill();
  // Head highlight (larger, more obvious)
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath(); ctx.ellipse(x - s * 0.12, y - s * 0.28 + bob, s * 0.16, s * 0.13, -0.3, 0, Math.PI * 2); ctx.fill();
  // Cheek blush
  ctx.fillStyle = 'rgba(255,138,128,0.4)';
  ctx.beginPath(); ctx.ellipse(x - s * 0.25, y - s * 0.04 + bob, s * 0.08, s * 0.05, -0.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + s * 0.25, y - s * 0.04 + bob, s * 0.08, s * 0.05, 0.2, 0, Math.PI * 2); ctx.fill();
  // Big cute eyes with eyelids
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.ellipse(x - s * 0.13, y - s * 0.2 + bob, s * 0.13, s * 0.15, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + s * 0.1, y - s * 0.22 + bob, s * 0.11, s * 0.13, 0, 0, Math.PI * 2); ctx.fill();
  // Eye shine on top
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath(); ctx.ellipse(x - s * 0.15, y - s * 0.27 + bob, s * 0.06, s * 0.04, -0.3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + s * 0.08, y - s * 0.29 + bob, s * 0.05, s * 0.035, -0.3, 0, Math.PI * 2); ctx.fill();
  // Eyelids
  ctx.fillStyle = '#388E3C';
  ctx.beginPath(); ctx.ellipse(x - s * 0.13, y - s * 0.26 + bob, s * 0.14, s * 0.05, 0, 0, Math.PI); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + s * 0.1, y - s * 0.28 + bob, s * 0.12, s * 0.04, 0, 0, Math.PI); ctx.fill();
  // Irises (bigger, more expressive)
  ctx.fillStyle = '#1B5E20';
  ctx.beginPath(); ctx.arc(x - s * 0.08, y - s * 0.19 + bob, s * 0.07, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + s * 0.13, y - s * 0.21 + bob, s * 0.06, 0, Math.PI * 2); ctx.fill();
  // Pupil highlights
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x - s * 0.05, y - s * 0.22 + bob, s * 0.035, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + s * 0.16, y - s * 0.24 + bob, s * 0.028, 0, Math.PI * 2); ctx.fill();
  // Nose (tiny)
  ctx.fillStyle = '#2E7D32';
  ctx.beginPath(); ctx.ellipse(x + s * 0.02, y - s * 0.1 + bob, s * 0.02, s * 0.015, 0, 0, Math.PI * 2); ctx.fill();
  // Cute smile with teeth
  ctx.strokeStyle = '#1B5E20'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(x + s * 0.02, y - s * 0.04 + bob, s * 0.1, 0.15, Math.PI - 0.15); ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x + s * 0.02, y - s * 0.04 + bob, s * 0.1, 0.3, Math.PI - 0.3); ctx.fill();
  ctx.strokeStyle = '#1B5E20'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(x + s * 0.02, y - s * 0.04 + bob, s * 0.1, 0.3, Math.PI - 0.3); ctx.stroke();
  // Tongue
  ctx.fillStyle = '#EF9A9A';
  ctx.beginPath(); ctx.ellipse(x + s * 0.04, y + s * 0.03 + bob, s * 0.03, s * 0.02, 0.2, 0, Math.PI * 2); ctx.fill();
  // Big cannon tube (more 3D)
  const cg = ctx.createRadialGradient(x + s * 0.26, y - s * 0.14 + bob, s * 0.04, x + s * 0.38, y - s * 0.12 + bob, s * 0.2);
  cg.addColorStop(0, '#81C784'); cg.addColorStop(0.4, '#4CAF50'); cg.addColorStop(0.8, '#388E3C'); cg.addColorStop(1, '#1B5E20');
  ctx.fillStyle = cg;
  ctx.beginPath(); ctx.ellipse(x + s * 0.38, y - s * 0.12 + bob, s * 0.21, s * 0.16, 0, 0, Math.PI * 2); ctx.fill();
  // Cannon highlight stripe
   ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.beginPath(); ctx.ellipse(x + s * 0.35, y - s * 0.16 + bob, s * 0.14, s * 0.04, -0.1, 0, Math.PI * 2); ctx.fill();
  // Cannon opening with depth
  ctx.fillStyle = '#0D3B0F';
  ctx.beginPath(); ctx.arc(x + s * 0.52, y - s * 0.12 + bob, s * 0.09, 0, Math.PI * 2); ctx.fill();
  const ig = ctx.createRadialGradient(x + s * 0.5, y - s * 0.14 + bob, s * 0.02, x + s * 0.52, y - s * 0.12 + bob, s * 0.06);
  ig.addColorStop(0, '#2E7D32'); ig.addColorStop(1, '#0D3B0F');
  ctx.fillStyle = ig;
  ctx.beginPath(); ctx.arc(x + s * 0.52, y - s * 0.12 + bob, s * 0.065, 0, Math.PI * 2); ctx.fill();
  // Lip/rim
  ctx.strokeStyle = '#2E7D32'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(x + s * 0.52, y - s * 0.12 + bob, s * 0.09, 0, Math.PI * 2); ctx.stroke();
  // Muzzle energy glow (pulsing)
  const glowPulse = 0.5 + Math.sin(anim * 2) * 0.3;
  const mg = ctx.createRadialGradient(x + s * 0.52, y - s * 0.12 + bob, 0, x + s * 0.52, y - s * 0.12 + bob, s * 0.12);
  mg.addColorStop(0, `rgba(139,195,74,${glowPulse * 0.4})`); mg.addColorStop(1, 'rgba(139,195,74,0)');
  ctx.fillStyle = mg;
  ctx.beginPath(); ctx.arc(x + s * 0.52, y - s * 0.12 + bob, s * 0.12, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawWallnut(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, anim: number, hpRatio: number) {
  const bob = Math.sin(anim * 0.8) * 2;
  const sq = 1 + Math.sin(anim * 1.2) * 0.015;
  // Shadow (larger for stability)
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.beginPath(); ctx.ellipse(x, y + s * 0.52, s * 0.32, s * 0.07, 0, 0, Math.PI * 2); ctx.fill();
  // Short legs
  const legW = s * 0.06; const legH = s * 0.08;
  ctx.fillStyle = '#A0722A';
  ctx.beginPath(); ctx.roundRect(x - s * 0.14 - legW / 2, y + s * 0.4 + bob, legW, legH, 3); ctx.fill();
  ctx.beginPath(); ctx.roundRect(x + s * 0.14 - legW / 2, y + s * 0.4 + bob, legW, legH, 3); ctx.fill();
  // Feet
  ctx.fillStyle = '#8B631F';
  ctx.beginPath(); ctx.ellipse(x - s * 0.14, y + s * 0.49 + bob, s * 0.055, s * 0.03, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + s * 0.14, y + s * 0.49 + bob, s * 0.055, s * 0.03, 0, 0, Math.PI * 2); ctx.fill();
  // Big round body
  const wg = ctx.createRadialGradient(x - s * 0.12, y - s * 0.12 + bob, s * 0.1, x, y + s * 0.05 + bob, s * 0.45 * sq);
  wg.addColorStop(0, '#FFF3E0'); wg.addColorStop(0.2, '#F5E6B8'); wg.addColorStop(0.45, '#E8C96A'); wg.addColorStop(0.7, '#D4A34A'); wg.addColorStop(0.9, '#A0722A'); wg.addColorStop(1, '#6B4513');
  ctx.fillStyle = wg;
  ctx.beginPath(); ctx.ellipse(x, y + s * 0.05 + bob, s * 0.38 * sq, s * 0.44, 0, 0, Math.PI * 2); ctx.fill();
  // Warm highlight (larger)
  ctx.fillStyle = 'rgba(255,248,220,0.35)';
  ctx.beginPath(); ctx.ellipse(x - s * 0.13, y - s * 0.18 + bob, s * 0.2, s * 0.18, -0.4, 0, Math.PI * 2); ctx.fill();
  // Wood grain texture (more)
  ctx.strokeStyle = 'rgba(120,70,20,0.12)'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.arc(x + s * 0.08, y - s * 0.12 + bob, s * 0.18, 0.3, 2.0); ctx.stroke();
  ctx.beginPath(); ctx.arc(x - s * 0.1, y + s * 0.12 + bob, s * 0.14, -0.6, 1.2); ctx.stroke();
  ctx.beginPath(); ctx.arc(x + s * 0.02, y + s * 0.25 + bob, s * 0.1, 0, 1.5); ctx.stroke();
  ctx.beginPath(); ctx.arc(x - s * 0.15, y - s * 0.02 + bob, s * 0.12, -0.3, 0.8); ctx.stroke();
  // Small arms
  ctx.strokeStyle = '#A0722A'; ctx.lineWidth = s * 0.04; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - s * 0.35, y + s * 0.05 + bob);
  ctx.quadraticCurveTo(x - s * 0.44, y + s * 0.12 + bob, x - s * 0.42, y + s * 0.22 + bob); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + s * 0.35, y + s * 0.05 + bob);
  ctx.quadraticCurveTo(x + s * 0.44, y + s * 0.12 + bob, x + s * 0.42, y + s * 0.22 + bob); ctx.stroke();
  // Fists
  ctx.fillStyle = '#D4A34A';
  ctx.beginPath(); ctx.arc(x - s * 0.42, y + s * 0.22 + bob, s * 0.04, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + s * 0.42, y + s * 0.22 + bob, s * 0.04, 0, Math.PI * 2); ctx.fill();
  // Big worried eyes
  ctx.fillStyle = '#FFFDE7';
  ctx.beginPath(); ctx.ellipse(x - s * 0.12, y - s * 0.08 + bob, s * 0.11, s * 0.12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + s * 0.12, y - s * 0.08 + bob, s * 0.11, s * 0.12, 0, 0, Math.PI * 2); ctx.fill();
  // Eye outlines
  ctx.strokeStyle = 'rgba(93,64,55,0.25)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(x - s * 0.12, y - s * 0.08 + bob, s * 0.11, s * 0.12, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(x + s * 0.12, y - s * 0.08 + bob, s * 0.11, s * 0.12, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#4E342E';
  const pupilSize = hpRatio < 0.33 ? s * 0.065 : s * 0.05;
  const pupilDroop = hpRatio < 0.33 ? s * 0.015 : 0;
  ctx.beginPath(); ctx.arc(x - s * 0.1, y - s * 0.07 + bob + pupilDroop, pupilSize, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + s * 0.14, y - s * 0.07 + bob + pupilDroop, pupilSize, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x - s * 0.08, y - s * 0.09 + bob, s * 0.028, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + s * 0.16, y - s * 0.09 + bob, s * 0.028, 0, Math.PI * 2); ctx.fill();
  // Worried eyebrows (more expressive)
  ctx.strokeStyle = '#5D4037'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  const browDroop = hpRatio < 0.33 ? 0.05 : hpRatio < 0.66 ? 0.02 : 0;
  ctx.beginPath(); ctx.moveTo(x - s * 0.22, y - s * 0.2 + bob + browDroop * s); ctx.quadraticCurveTo(x - s * 0.12, y - s * 0.27 + bob, x - s * 0.02, y - s * 0.18 + bob); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + s * 0.22, y - s * 0.2 + bob + browDroop * s); ctx.quadraticCurveTo(x + s * 0.12, y - s * 0.27 + bob, x + s * 0.02, y - s * 0.18 + bob); ctx.stroke();
  // Nose
  ctx.fillStyle = '#C4993A';
  ctx.beginPath(); ctx.ellipse(x, y - s * 0.01 + bob, s * 0.025, s * 0.02, 0, 0, Math.PI * 2); ctx.fill();
  // Mouth - more worried when damaged
  if (hpRatio < 0.33) {
    ctx.fillStyle = '#3E2723';
    ctx.beginPath(); ctx.ellipse(x, y + s * 0.1 + bob, s * 0.09, s * 0.07, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#D32F2F';
    ctx.beginPath(); ctx.ellipse(x, y + s * 0.14 + bob, s * 0.045, s * 0.025, 0, 0, Math.PI * 2); ctx.fill();
    // Sweat drop
    ctx.fillStyle = 'rgba(100,181,246,0.6)';
    const sweatY = y - s * 0.28 + bob + Math.sin(anim * 3) * s * 0.02;
    ctx.beginPath(); ctx.ellipse(x + s * 0.3, sweatY, s * 0.025, s * 0.035, 0.15, 0, Math.PI * 2); ctx.fill();
  } else if (hpRatio < 0.66) {
    ctx.strokeStyle = '#5D4037'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x - s * 0.08, y + s * 0.08 + bob); ctx.quadraticCurveTo(x, y + s * 0.13 + bob, x + s * 0.08, y + s * 0.08 + bob); ctx.stroke();
  } else {
    ctx.strokeStyle = '#5D4037'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x, y + s * 0.08 + bob, s * 0.05, s * 0.04, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#5D4037';
    ctx.beginPath(); ctx.ellipse(x, y + s * 0.08 + bob, s * 0.03, s * 0.025, 0, 0, Math.PI * 2); ctx.fill();
  }
  // Blush (warmer)
  ctx.fillStyle = 'rgba(255,138,128,0.3)';
  ctx.beginPath(); ctx.ellipse(x - s * 0.27, y + bob, s * 0.065, s * 0.04, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + s * 0.27, y + bob, s * 0.065, s * 0.04, 0, 0, Math.PI * 2); ctx.fill();
  // Cracks with detail and debris
  if (hpRatio < 0.66) {
    ctx.strokeStyle = 'rgba(60,30,5,0.55)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - s * 0.1, y - s * 0.2 + bob); ctx.lineTo(x - s * 0.05, y + bob); ctx.lineTo(x - s * 0.15, y + s * 0.2 + bob); ctx.stroke();
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x - s * 0.05, y + bob); ctx.lineTo(x + s * 0.02, y - s * 0.05 + bob); ctx.stroke();
    // Debris particles
    ctx.fillStyle = 'rgba(160,114,42,0.4)';
    ctx.beginPath(); ctx.arc(x - s * 0.12, y - s * 0.22 + bob, s * 0.02, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + s * 0.04, y - s * 0.04 + bob, s * 0.015, 0, Math.PI * 2); ctx.fill();
  }
  if (hpRatio < 0.33) {
    ctx.strokeStyle = 'rgba(60,30,5,0.65)'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x + s * 0.15, y - s * 0.25 + bob); ctx.lineTo(x + s * 0.08, y - bob); ctx.lineTo(x + s * 0.2, y + s * 0.15 + bob); ctx.stroke();
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + s * 0.08, y - bob); ctx.lineTo(x - s * 0.02, y - s * 0.12 + bob); ctx.stroke();
    // More debris
    ctx.fillStyle = 'rgba(160,114,42,0.5)';
    ctx.beginPath(); ctx.arc(x + s * 0.18, y - s * 0.27 + bob, s * 0.02, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x - s * 0.14, y + s * 0.22 + bob, s * 0.018, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + s * 0.22, y + s * 0.17 + bob, s * 0.015, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(60,30,5,0.3)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.arc(x + s * 0.15, y - s * 0.25 + bob, s * 0.06, 0, 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(x - s * 0.1, y + s * 0.1 + bob, s * 0.05, -0.5, 1.8); ctx.stroke();
  }
}

function drawSnowPea(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, anim: number) {
  const bob = Math.sin(anim) * 3;
  // Icy pot base with frost rim
  const pg = ctx.createRadialGradient(x, y + s * 0.42, s * 0.05, x, y + s * 0.42, s * 0.22);
  pg.addColorStop(0, '#E0F7FA'); pg.addColorStop(0.6, '#B2EBF2'); pg.addColorStop(1, '#80DEEA');
  ctx.fillStyle = pg;
  ctx.beginPath(); ctx.ellipse(x, y + s * 0.42, s * 0.22, s * 0.08, 0, 0, Math.PI * 2); ctx.fill();
  // Frost crystals on pot rim
  ctx.strokeStyle = 'rgba(200,245,255,0.8)'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    const a = -0.8 + i * 0.4;
    const px = x + Math.cos(a) * s * 0.18;
    const py = y + s * 0.39 + Math.sin(a) * s * 0.04;
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(a + 0.5) * s * 0.03, py - s * 0.03); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(a - 0.8) * s * 0.025, py - s * 0.025); ctx.stroke();
  }
  // Frost aura glow (larger, pulsing)
  const pulse = 1 + Math.sin(anim * 2) * 0.1;
  const fg = ctx.createRadialGradient(x, y - s * 0.1 + bob, s * 0.1, x, y - s * 0.1 + bob, s * 0.62 * pulse);
  fg.addColorStop(0, 'rgba(179,229,252,0.2)'); fg.addColorStop(0.4, 'rgba(179,229,252,0.1)'); fg.addColorStop(0.7, 'rgba(129,212,250,0.04)'); fg.addColorStop(1, 'rgba(129,212,250,0)');
  ctx.fillStyle = fg;
  ctx.beginPath(); ctx.arc(x, y - s * 0.1 + bob, s * 0.62 * pulse, 0, Math.PI * 2); ctx.fill();
  // Stem
  const sg = ctx.createLinearGradient(x - s * 0.045, 0, x + s * 0.045, 0);
  sg.addColorStop(0, '#00838F'); sg.addColorStop(0.5, '#26C6DA'); sg.addColorStop(1, '#00838F');
  ctx.fillStyle = sg;
  ctx.beginPath(); ctx.roundRect(x - s * 0.05, y + s * 0.1, s * 0.1, s * 0.35, 4); ctx.fill();
  // Icy leaves with frost edge
  ctx.fillStyle = '#B2EBF2';
  ctx.save(); ctx.translate(x - s * 0.05, y + s * 0.28); ctx.rotate(-0.5);
  ctx.beginPath(); ctx.ellipse(0, 0, s * 0.18, s * 0.055, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(0, 0, s * 0.18, s * 0.055, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  ctx.save(); ctx.translate(x + s * 0.05, y + s * 0.33); ctx.rotate(0.4);
  ctx.fillStyle = '#80DEEA';
  ctx.beginPath(); ctx.ellipse(0, 0, s * 0.16, s * 0.05, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(0, 0, s * 0.16, s * 0.05, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  // Top sprout leaves (icy)
  ctx.fillStyle = '#E0F7FA';
  ctx.save(); ctx.translate(x, y - s * 0.42 + bob); ctx.rotate(-0.15);
  ctx.beginPath(); ctx.ellipse(0, 0, s * 0.05, s * 0.11, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#B2EBF2';
  ctx.save(); ctx.translate(x, y - s * 0.42 + bob); ctx.rotate(0.3);
  ctx.beginPath(); ctx.ellipse(0, 0, s * 0.04, s * 0.1, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // Ice crystal crown (more elaborate)
  ctx.strokeStyle = 'rgba(200,245,255,0.9)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI * 0.8 + i * 0.27 + Math.sin(anim * 0.5 + i) * 0.05;
    const len = s * (0.08 + Math.sin(anim + i * 1.2) * 0.03);
    const bx = x + Math.cos(a) * s * 0.33;
    const by = y - s * 0.12 + bob + Math.sin(a) * s * 0.33;
    ctx.beginPath(); ctx.moveTo(bx, by);
    ctx.lineTo(bx + Math.cos(a) * len, by + Math.sin(a) * len); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.arc(bx + Math.cos(a) * len, by + Math.sin(a) * len, s * 0.015, 0, Math.PI * 2); ctx.fill();
  }
  // Big round head (icy blue, brighter)
  const hg = ctx.createRadialGradient(x - s * 0.1, y - s * 0.2 + bob, s * 0.05, x, y - s * 0.12 + bob, s * 0.4);
  hg.addColorStop(0, '#E8F8FF'); hg.addColorStop(0.2, '#E0F7FA'); hg.addColorStop(0.45, '#B2EBF2'); hg.addColorStop(0.7, '#4DD0E1'); hg.addColorStop(1, '#00838F');
  ctx.fillStyle = hg;
  ctx.beginPath(); ctx.arc(x, y - s * 0.12 + bob, s * 0.38, 0, Math.PI * 2); ctx.fill();
  // Head highlight
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath(); ctx.ellipse(x - s * 0.1, y - s * 0.28 + bob, s * 0.15, s * 0.12, -0.3, 0, Math.PI * 2); ctx.fill();
  // Cheek blush (icy pink)
  ctx.fillStyle = 'rgba(179,229,252,0.5)';
  ctx.beginPath(); ctx.ellipse(x - s * 0.24, y - s * 0.04 + bob, s * 0.07, s * 0.045, -0.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + s * 0.24, y - s * 0.04 + bob, s * 0.07, s * 0.045, 0.2, 0, Math.PI * 2); ctx.fill();
  // Big cute eyes
  ctx.fillStyle = '#E8F8FF';
  ctx.beginPath(); ctx.ellipse(x - s * 0.12, y - s * 0.2 + bob, s * 0.12, s * 0.14, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + s * 0.1, y - s * 0.22 + bob, s * 0.1, s * 0.12, 0, 0, Math.PI * 2); ctx.fill();
  // Eye shine
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath(); ctx.ellipse(x - s * 0.14, y - s * 0.26 + bob, s * 0.055, s * 0.035, -0.3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + s * 0.08, y - s * 0.28 + bob, s * 0.045, s * 0.03, -0.3, 0, Math.PI * 2); ctx.fill();
  // Eyelids
  ctx.fillStyle = '#00ACC1';
  ctx.beginPath(); ctx.ellipse(x - s * 0.12, y - s * 0.25 + bob, s * 0.13, s * 0.045, 0, 0, Math.PI); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + s * 0.1, y - s * 0.27 + bob, s * 0.11, s * 0.035, 0, 0, Math.PI); ctx.fill();
  // Irises
  ctx.fillStyle = '#006064';
  ctx.beginPath(); ctx.arc(x - s * 0.07, y - s * 0.19 + bob, s * 0.065, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + s * 0.14, y - s * 0.21 + bob, s * 0.055, 0, Math.PI * 2); ctx.fill();
  // Pupil highlights
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x - s * 0.05, y - s * 0.21 + bob, s * 0.03, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + s * 0.16, y - s * 0.23 + bob, s * 0.025, 0, Math.PI * 2); ctx.fill();
  // Nose
  ctx.fillStyle = '#00838F';
  ctx.beginPath(); ctx.ellipse(x + s * 0.02, y - s * 0.1 + bob, s * 0.018, s * 0.012, 0, 0, Math.PI * 2); ctx.fill();
  // Smile
  ctx.strokeStyle = '#006064'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(x + s * 0.02, y - s * 0.04 + bob, s * 0.08, 0.1, Math.PI - 0.1); ctx.stroke();
  // Breath cloud (visible cold breath)
  const breathAlpha = 0.3 + Math.sin(anim * 1.5) * 0.15;
  ctx.fillStyle = `rgba(224,247,250,${breathAlpha})`;
  const breathX = x + s * 0.15 + Math.sin(anim * 0.8) * s * 0.05;
  const breathY = y - s * 0.02 + bob + Math.sin(anim * 1.2) * s * 0.02;
  ctx.beginPath(); ctx.ellipse(breathX, breathY, s * 0.08, s * 0.05, 0.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = `rgba(255,255,255,${breathAlpha * 0.7})`;
  ctx.beginPath(); ctx.ellipse(breathX + s * 0.04, breathY - s * 0.02, s * 0.04, s * 0.025, 0, 0, Math.PI * 2); ctx.fill();
  // Cannon tube (icy, more 3D)
  const cg = ctx.createRadialGradient(x + s * 0.26, y - s * 0.14 + bob, s * 0.04, x + s * 0.38, y - s * 0.12 + bob, s * 0.2);
  cg.addColorStop(0, '#B2EBF2'); cg.addColorStop(0.4, '#4DD0E1'); cg.addColorStop(0.8, '#00ACC1'); cg.addColorStop(1, '#00695C');
  ctx.fillStyle = cg;
  ctx.beginPath(); ctx.ellipse(x + s * 0.38, y - s * 0.12 + bob, s * 0.21, s * 0.16, 0, 0, Math.PI * 2); ctx.fill();
  // Cannon highlight
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath(); ctx.ellipse(x + s * 0.35, y - s * 0.16 + bob, s * 0.13, s * 0.035, -0.1, 0, Math.PI * 2); ctx.fill();
  // Cannon opening
  ctx.fillStyle = '#004D40';
  ctx.beginPath(); ctx.arc(x + s * 0.52, y - s * 0.12 + bob, s * 0.085, 0, Math.PI * 2); ctx.fill();
  const ig = ctx.createRadialGradient(x + s * 0.5, y - s * 0.14 + bob, s * 0.02, x + s * 0.52, y - s * 0.12 + bob, s * 0.06);
  ig.addColorStop(0, '#00838F'); ig.addColorStop(1, '#004D40');
  ctx.fillStyle = ig;
  ctx.beginPath(); ctx.arc(x + s * 0.52, y - s * 0.12 + bob, s * 0.065, 0, Math.PI * 2); ctx.fill();
  // Cannon rim
  ctx.strokeStyle = '#00838F'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(x + s * 0.52, y - s * 0.12 + bob, s * 0.085, 0, Math.PI * 2); ctx.stroke();
  // Ice muzzle glow
  const icePulse = 0.5 + Math.sin(anim * 2.5) * 0.3;
  const ig2 = ctx.createRadialGradient(x + s * 0.52, y - s * 0.12 + bob, 0, x + s * 0.52, y - s * 0.12 + bob, s * 0.12);
  ig2.addColorStop(0, `rgba(100,220,255,${icePulse * 0.5})`); ig2.addColorStop(1, 'rgba(100,220,255,0)');
  ctx.fillStyle = ig2;
  ctx.beginPath(); ctx.arc(x + s * 0.52, y - s * 0.12 + bob, s * 0.12, 0, Math.PI * 2); ctx.fill();
  // Frost particles (more)
  ctx.fillStyle = 'rgba(200,245,255,0.75)';
  for (let i = 0; i < 10; i++) {
    const px = x + s * 0.5 + Math.sin(anim * 1.8 + i * 0.9) * s * 0.25;
    const py = y - s * 0.15 + bob + Math.cos(anim * 1.3 + i * 1.1) * s * 0.25;
    const sz = s * 0.018 + Math.sin(anim * 3 + i) * s * 0.008;
    ctx.beginPath(); ctx.arc(px, py, sz, 0, Math.PI * 2); ctx.fill();
  }
  // Floating snowflakes around (more)
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const sx = x + Math.sin(anim * 0.7 + i * 1.6) * s * 0.55;
    const sy = y - s * 0.2 + bob + Math.cos(anim * 0.5 + i * 1.5) * s * 0.38;
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(anim * 0.5 + i);
    for (let j = 0; j < 3; j++) {
      const a = j * Math.PI / 3;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * s * 0.04, Math.sin(a) * s * 0.04); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a + Math.PI / 6) * s * 0.025, Math.sin(a + Math.PI / 6) * s * 0.025); ctx.stroke();
    }
    ctx.restore();
  }
}

function drawRepeater(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, anim: number) {
  const bob = Math.sin(anim) * 3;
  // Pot (darker, solid)
  const pg = ctx.createLinearGradient(x - s * 0.22, y + s * 0.38, x + s * 0.22, y + s * 0.45);
  pg.addColorStop(0, '#8D6E63'); pg.addColorStop(0.5, '#6D4C41'); pg.addColorStop(1, '#4E342E');
  ctx.fillStyle = pg;
  ctx.beginPath(); ctx.ellipse(x, y + s * 0.42, s * 0.22, s * 0.08, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#8D6E63';
  ctx.beginPath(); ctx.ellipse(x, y + s * 0.38, s * 0.2, s * 0.04, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3E2723';
  ctx.beginPath(); ctx.ellipse(x, y + s * 0.42, s * 0.22, s * 0.05, 0, 0, Math.PI * 2); ctx.fill();
  // Thick stem (stronger, with highlight)
  const sg = ctx.createLinearGradient(x - s * 0.065, 0, x + s * 0.065, 0);
  sg.addColorStop(0, '#1B5E20'); sg.addColorStop(0.25, '#2E7D32'); sg.addColorStop(0.65, '#388E3C'); sg.addColorStop(1, '#1B5E20');
  ctx.fillStyle = sg;
  ctx.beginPath(); ctx.roundRect(x - s * 0.065, y + s * 0.08, s * 0.13, s * 0.35, 5); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.beginPath(); ctx.roundRect(x - s * 0.02, y + s * 0.1, s * 0.04, s * 0.3, 3); ctx.fill();
  // Stronger leaves (veined)
  ctx.fillStyle = '#388E3C';
  ctx.save(); ctx.translate(x - s * 0.065, y + s * 0.26); ctx.rotate(-0.6);
  ctx.beginPath(); ctx.ellipse(0, 0, s * 0.21, s * 0.07, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(27,94,32,0.3)'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(-s * 0.17, 0); ctx.lineTo(s * 0.17, 0); ctx.stroke(); ctx.restore();
  ctx.save(); ctx.translate(x + s * 0.065, y + s * 0.32); ctx.rotate(0.5);
  ctx.fillStyle = '#2E7D32';
  ctx.beginPath(); ctx.ellipse(0, 0, s * 0.19, s * 0.065, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(27,94,32,0.3)'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(-s * 0.15, 0); ctx.lineTo(s * 0.15, 0); ctx.stroke(); ctx.restore();
  // Neck (muscular)
  ctx.fillStyle = '#2E7D32';
  ctx.beginPath(); ctx.roundRect(x - s * 0.08, y - s * 0.08, s * 0.16, s * 0.16, 4); ctx.fill();
  ctx.fillStyle = '#388E3C';
  ctx.beginPath(); ctx.arc(x - s * 0.1, y - s * 0.04, s * 0.06, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + s * 0.1, y - s * 0.04, s * 0.06, 0, Math.PI * 2); ctx.fill();
  // Big head (darker green, tougher)
  const hg = ctx.createRadialGradient(x - s * 0.08, y - s * 0.22 + bob, s * 0.05, x, y - s * 0.1 + bob, s * 0.44);
  hg.addColorStop(0, '#A5D6A7'); hg.addColorStop(0.2, '#66BB6A'); hg.addColorStop(0.45, '#43A047'); hg.addColorStop(0.75, '#2E7D32'); hg.addColorStop(1, '#1B5E20');
  ctx.fillStyle = hg;
  ctx.beginPath(); ctx.arc(x, y - s * 0.12 + bob, s * 0.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.beginPath(); ctx.ellipse(x - s * 0.1, y - s * 0.3 + bob, s * 0.14, s * 0.12, -0.3, 0, Math.PI * 2); ctx.fill();
  // Forehead vein
  ctx.strokeStyle = 'rgba(27,94,32,0.4)'; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - s * 0.08, y - s * 0.35 + bob); ctx.quadraticCurveTo(x - s * 0.12, y - s * 0.28 + bob, x - s * 0.18, y - s * 0.3 + bob); ctx.stroke();
  // Determined thick V-brows
  ctx.strokeStyle = '#0D3B0F'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - s * 0.24, y - s * 0.32 + bob); ctx.lineTo(x - s * 0.03, y - s * 0.25 + bob); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + s * 0.24, y - s * 0.32 + bob); ctx.lineTo(x + s * 0.03, y - s * 0.25 + bob); ctx.stroke();
  // Eyes
  ctx.fillStyle = '#E8F5E9';
  ctx.beginPath(); ctx.ellipse(x - s * 0.11, y - s * 0.18 + bob, s * 0.1, s * 0.08, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + s * 0.11, y - s * 0.18 + bob, s * 0.08, s * 0.07, 0, 0, Math.PI * 2); ctx.fill();
  // Heavy angry eyelids
  ctx.fillStyle = '#2E7D32';
  ctx.beginPath(); ctx.ellipse(x - s * 0.11, y - s * 0.21 + bob, s * 0.12, s * 0.045, 0.05, 0, Math.PI); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + s * 0.11, y - s * 0.21 + bob, s * 0.1, s * 0.04, -0.05, 0, Math.PI); ctx.fill();
  // Red-angry irises
  const eg1 = ctx.createRadialGradient(x - s * 0.06, y - s * 0.17 + bob, s * 0.02, x - s * 0.06, y - s * 0.17 + bob, s * 0.055);
  eg1.addColorStop(0, '#EF5350'); eg1.addColorStop(0.5, '#C62828'); eg1.addColorStop(1, '#0D3B0F');
  ctx.fillStyle = eg1;
  ctx.beginPath(); ctx.arc(x - s * 0.06, y - s * 0.17 + bob, s * 0.055, 0, Math.PI * 2); ctx.fill();
  const eg2 = ctx.createRadialGradient(x + s * 0.15, y - s * 0.17 + bob, s * 0.015, x + s * 0.15, y - s * 0.17 + bob, s * 0.045);
  eg2.addColorStop(0, '#EF5350'); eg2.addColorStop(0.5, '#C62828'); eg2.addColorStop(1, '#0D3B0F');
  ctx.fillStyle = eg2;
  ctx.beginPath(); ctx.arc(x + s * 0.15, y - s * 0.17 + bob, s * 0.045, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x - s * 0.04, y - s * 0.19 + bob, s * 0.022, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + s * 0.17, y - s * 0.19 + bob, s * 0.018, 0, Math.PI * 2); ctx.fill();
  // Wide grin with teeth lines
  ctx.strokeStyle = '#0D3B0F'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x + s * 0.02, y - s * 0.03 + bob, s * 0.12, 0, Math.PI); ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x + s * 0.02, y - s * 0.03 + bob, s * 0.12, 0.08, Math.PI - 0.08); ctx.fill();
  ctx.strokeStyle = '#0D3B0F'; ctx.lineWidth = 1;
  for (let t = -2; t <= 2; t++) { ctx.beginPath(); ctx.moveTo(x + s * 0.02 + t * s * 0.035, y - s * 0.03 + bob); ctx.lineTo(x + s * 0.02 + t * s * 0.035, y + s * 0.04 + bob); ctx.stroke(); }
  // Double cannon (3D, with highlight)
  const cg1 = ctx.createRadialGradient(x + s * 0.24, y - s * 0.24 + bob, s * 0.04, x + s * 0.36, y - s * 0.22 + bob, s * 0.18);
  cg1.addColorStop(0, '#66BB6A'); cg1.addColorStop(0.5, '#388E3C'); cg1.addColorStop(1, '#1B5E20');
  ctx.fillStyle = cg1;
  ctx.beginPath(); ctx.ellipse(x + s * 0.36, y - s * 0.2 + bob, s * 0.18, s * 0.13, -0.12, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath(); ctx.ellipse(x + s * 0.33, y - s * 0.24 + bob, s * 0.1, s * 0.03, -0.15, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#0D3B0F'; ctx.beginPath(); ctx.arc(x + s * 0.48, y - s * 0.2 + bob, s * 0.055, 0, Math.PI * 2); ctx.fill();
  const ig1 = ctx.createRadialGradient(x + s * 0.46, y - s * 0.22 + bob, s * 0.015, x + s * 0.48, y - s * 0.2 + bob, s * 0.04);
  ig1.addColorStop(0, '#2E7D32'); ig1.addColorStop(1, '#0D3B0F');
  ctx.fillStyle = ig1; ctx.beginPath(); ctx.arc(x + s * 0.48, y - s * 0.2 + bob, s * 0.04, 0, Math.PI * 2); ctx.fill();
  const cg2 = ctx.createRadialGradient(x + s * 0.26, y - s * 0.04 + bob, s * 0.04, x + s * 0.36, y - s * 0.04 + bob, s * 0.16);
  cg2.addColorStop(0, '#4CAF50'); cg2.addColorStop(0.6, '#2E7D32'); cg2.addColorStop(1, '#1B5E20');
  ctx.fillStyle = cg2;
  ctx.beginPath(); ctx.ellipse(x + s * 0.36, y - s * 0.04 + bob, s * 0.18, s * 0.13, 0.12, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath(); ctx.ellipse(x + s * 0.33, y - s * 0.08 + bob, s * 0.1, s * 0.03, 0.15, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#0D3B0F'; ctx.beginPath(); ctx.arc(x + s * 0.48, y - s * 0.04 + bob, s * 0.055, 0, Math.PI * 2); ctx.fill();
  const ig2 = ctx.createRadialGradient(x + s * 0.46, y - s * 0.06 + bob, s * 0.015, x + s * 0.48, y - s * 0.04 + bob, s * 0.04);
  ig2.addColorStop(0, '#2E7D32'); ig2.addColorStop(1, '#0D3B0F');
  ctx.fillStyle = ig2; ctx.beginPath(); ctx.arc(x + s * 0.48, y - s * 0.04 + bob, s * 0.04, 0, Math.PI * 2); ctx.fill();
  // Muzzle glow (both)
  const mP = 0.4 + Math.sin(anim * 3) * 0.25;
  const mg = ctx.createRadialGradient(x + s * 0.48, y - s * 0.2 + bob, 0, x + s * 0.48, y - s * 0.2 + bob, s * 0.1);
  mg.addColorStop(0, `rgba(139,195,74,${mP})`); mg.addColorStop(1, 'rgba(139,195,74,0)');
  ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(x + s * 0.48, y - s * 0.2 + bob, s * 0.1, 0, Math.PI * 2); ctx.fill();
  const mg2 = ctx.createRadialGradient(x + s * 0.48, y - s * 0.04 + bob, 0, x + s * 0.48, y - s * 0.04 + bob, s * 0.1);
  mg2.addColorStop(0, `rgba(139,195,74,${mP * 0.8})`); mg2.addColorStop(1, 'rgba(139,195,74,0)');
  ctx.fillStyle = mg2; ctx.beginPath(); ctx.arc(x + s * 0.48, y - s * 0.04 + bob, s * 0.1, 0, Math.PI * 2); ctx.fill();
}

function drawCherryBomb(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, anim: number) {
  const bob = Math.sin(anim * 2) * 2;
  const pulse = 1 + Math.sin(anim * 4) * 0.05;
  // Big warm glow
  const gg = ctx.createRadialGradient(x, y + bob, s * 0.1, x, y + bob, s * 0.65 * pulse);
  gg.addColorStop(0, 'rgba(255,152,0,0.18)'); gg.addColorStop(0.5, 'rgba(255,87,34,0.08)'); gg.addColorStop(1, 'rgba(255,87,34,0)');
  ctx.fillStyle = gg;
  ctx.beginPath(); ctx.arc(x, y + bob, s * 0.65 * pulse, 0, Math.PI * 2); ctx.fill();
  // Stems
  ctx.strokeStyle = '#33691E'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - s * 0.14, y - s * 0.15 + bob);
  ctx.quadraticCurveTo(x - s * 0.05, y - s * 0.5 + bob, x + s * 0.12, y - s * 0.48 + bob); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + s * 0.14, y - s * 0.15 + bob);
  ctx.quadraticCurveTo(x + s * 0.08, y - s * 0.45 + bob, x + s * 0.12, y - s * 0.48 + bob); ctx.stroke();
  // Leaf
  ctx.fillStyle = '#81C784';
  ctx.save(); ctx.translate(x + s * 0.12, y - s * 0.48 + bob); ctx.rotate(0.3);
  ctx.beginPath(); ctx.ellipse(0, 0, s * 0.15, s * 0.05, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(46,125,50,0.4)'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(-s * 0.12, 0); ctx.lineTo(s * 0.12, 0); ctx.stroke();
  ctx.restore();
  // Bigger cherries with better shading
  const cherryR = s * 0.28 * pulse;
  // Left cherry
  const lg = ctx.createRadialGradient(x - s * 0.2 - s * 0.07, y + s * 0.05 + bob - s * 0.07, s * 0.04, x - s * 0.18, y + s * 0.05 + bob, cherryR);
  lg.addColorStop(0, '#FFCDD2'); lg.addColorStop(0.3, '#EF5350'); lg.addColorStop(0.7, '#E53935'); lg.addColorStop(1, '#B71C1C');
  ctx.fillStyle = lg;
  ctx.beginPath(); ctx.arc(x - s * 0.18, y + s * 0.05 + bob, cherryR, 0, Math.PI * 2); ctx.fill();
  // Right cherry
  const rg = ctx.createRadialGradient(x + s * 0.2 - s * 0.07, y + s * 0.05 + bob - s * 0.07, s * 0.04, x + s * 0.18, y + s * 0.05 + bob, cherryR);
  rg.addColorStop(0, '#FFCDD2'); rg.addColorStop(0.3, '#EF5350'); rg.addColorStop(0.7, '#E53935'); rg.addColorStop(1, '#B71C1C');
  ctx.fillStyle = rg;
  ctx.beginPath(); ctx.arc(x + s * 0.18, y + s * 0.05 + bob, cherryR, 0, Math.PI * 2); ctx.fill();
  // Highlights
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath(); ctx.ellipse(x - s * 0.25, y - s * 0.02 + bob, s * 0.1, s * 0.06, -0.4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + s * 0.12, y - s * 0.02 + bob, s * 0.1, s * 0.06, -0.4, 0, Math.PI * 2); ctx.fill();
  // Angry faces - Left
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x - s * 0.24, y + bob, s * 0.055, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x - s * 0.12, y + bob, s * 0.055, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#B71C1C';
  ctx.beginPath(); ctx.arc(x - s * 0.23, y + bob, s * 0.035, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x - s * 0.13, y + bob, s * 0.035, 0, Math.PI * 2); ctx.fill();
  // Angry brows left
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - s * 0.3, y - s * 0.06 + bob); ctx.lineTo(x - s * 0.19, y - s * 0.02 + bob); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - s * 0.07, y - s * 0.06 + bob); ctx.lineTo(x - s * 0.17, y - s * 0.02 + bob); ctx.stroke();
  // Angry mouth left
  ctx.fillStyle = '#7f0000';
  ctx.beginPath(); ctx.ellipse(x - s * 0.18, y + s * 0.09 + bob, s * 0.05, s * 0.035, 0, 0, Math.PI * 2); ctx.fill();
  // Teeth left
  ctx.fillStyle = '#fff';
  for (let t = -1; t <= 1; t++) {
    ctx.beginPath(); ctx.roundRect(x - s * 0.18 + t * s * 0.025 - s * 0.008, y + s * 0.07 + bob, s * 0.016, s * 0.02, 1); ctx.fill();
  }
  // Right face
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x + s * 0.12, y + bob, s * 0.055, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + s * 0.24, y + bob, s * 0.055, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#B71C1C';
  ctx.beginPath(); ctx.arc(x + s * 0.13, y + bob, s * 0.035, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + s * 0.23, y + bob, s * 0.035, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(x + s * 0.07, y - s * 0.06 + bob); ctx.lineTo(x + s * 0.17, y - s * 0.02 + bob); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + s * 0.3, y - s * 0.06 + bob); ctx.lineTo(x + s * 0.19, y - s * 0.02 + bob); ctx.stroke();
  ctx.fillStyle = '#7f0000';
  ctx.beginPath(); ctx.ellipse(x + s * 0.18, y + s * 0.09 + bob, s * 0.05, s * 0.035, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff';
  for (let t = -1; t <= 1; t++) {
    ctx.beginPath(); ctx.roundRect(x + s * 0.18 + t * s * 0.025 - s * 0.008, y + s * 0.07 + bob, s * 0.016, s * 0.02, 1); ctx.fill();
  }
  // Fuse
  ctx.strokeStyle = '#FF8F00'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(x + s * 0.12, y - s * 0.48 + bob);
  ctx.quadraticCurveTo(x + s * 0.15, y - s * 0.58 + bob, x + s * 0.1, y - s * 0.65 + bob); ctx.stroke();
  // Spark (bigger, more dynamic)
  const sparkS = s * 0.07 + Math.sin(anim * 8) * s * 0.04;
  const sg = ctx.createRadialGradient(x + s * 0.1, y - s * 0.65 + bob, 0, x + s * 0.1, y - s * 0.65 + bob, sparkS * 1.5);
  sg.addColorStop(0, '#FFF9C4'); sg.addColorStop(0.3, '#FFEB3B'); sg.addColorStop(0.7, '#FF6D00'); sg.addColorStop(1, 'rgba(255,109,0,0)');
  ctx.fillStyle = sg;
  ctx.beginPath(); ctx.arc(x + s * 0.1, y - s * 0.65 + bob, sparkS * 1.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#FFEB3B';
  ctx.beginPath(); ctx.arc(x + s * 0.1, y - s * 0.65 + bob, sparkS * 0.5, 0, Math.PI * 2); ctx.fill();
  // Spark rays
  ctx.strokeStyle = 'rgba(255,235,59,0.7)'; ctx.lineWidth = 1.5;
  for (let i = 0; i < 6; i++) {
    const a = anim * 3 + i * Math.PI / 3;
    ctx.beginPath();
    ctx.moveTo(x + s * 0.1 + Math.cos(a) * sparkS * 0.6, y - s * 0.65 + bob + Math.sin(a) * sparkS * 0.6);
    ctx.lineTo(x + s * 0.1 + Math.cos(a) * sparkS * 1.8, y - s * 0.65 + bob + Math.sin(a) * sparkS * 1.8);
    ctx.stroke();
  }
  // Heat shimmer particles
  ctx.fillStyle = 'rgba(255,200,50,0.4)';
  for (let i = 0; i < 4; i++) {
    const hx = x + Math.sin(anim * 3 + i * 1.5) * s * 0.35;
    const hy = y - s * 0.3 + bob + Math.cos(anim * 2 + i * 1.8) * s * 0.25;
    ctx.beginPath(); ctx.arc(hx, hy, s * 0.015, 0, Math.PI * 2); ctx.fill();
  }
}

function drawPlant(ctx: CanvasRenderingContext2D, type: PlantType, x: number, y: number,
  cellW: number, cellH: number, animPhase: number, hpRatio: number) {
  const s = Math.min(cellW, cellH) * 0.9;
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
  const s = Math.min(cellW, cellH) * 0.95;
  const skin = slowed ? '#7BAFD4' : '#9EC05A';
  const skinDk = slowed ? '#5A8AB5' : '#7A9F3A';
  const skinLt = slowed ? '#A5D0F0' : '#C5DD7A';
  const walk = eating ? 0 : Math.sin(animPhase) * 12;
  const armSw = eating ? Math.sin(animPhase * 3) * 5 : Math.sin(animPhase * 1.5) * 16;
  const headTilt = eating ? Math.sin(animPhase * 4) * 0.07 : Math.sin(animPhase * 0.8) * 0.04;
  const bodyBob = eating ? Math.sin(animPhase * 2) * 2 : 0;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.13)';
  ctx.beginPath(); ctx.ellipse(x, zy + s * 0.48, s * 0.19, s * 0.04, 0, 0, Math.PI * 2); ctx.fill();
  // Legs (walking animation improved, with knee bend)
  ctx.fillStyle = '#5D4037';
  ctx.save(); ctx.translate(x - s * 0.08, zy + s * 0.25 + bob); ctx.rotate(walk * 0.022);
  ctx.beginPath(); ctx.roundRect(-s * 0.05, 0, s * 0.1, s * 0.2, 4); ctx.fill();
  // Knee shadow
  ctx.fillStyle = 'rgba(0,0,0,0.1)';
  ctx.beginPath(); ctx.ellipse(0, s * 0.1, s * 0.055, s * 0.025, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#5D4037';
  ctx.save(); ctx.translate(x + s * 0.08, zy + s * 0.25 + bob); ctx.rotate(-walk * 0.022);
  ctx.beginPath(); ctx.roundRect(-s * 0.05, 0, s * 0.1, s * 0.2, 4); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.1)';
  ctx.beginPath(); ctx.ellipse(0, s * 0.1, s * 0.055, s * 0.025, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // Torn pants (visible at knees)
  ctx.fillStyle = skin;
  ctx.save(); ctx.translate(x - s * 0.08, zy + s * 0.25 + bob); ctx.rotate(walk * 0.022);
  ctx.beginPath(); ctx.moveTo(-s * 0.05, s * 0.08); ctx.lineTo(-s * 0.02, s * 0.14); ctx.lineTo(-s * 0.05, s * 0.12); ctx.closePath(); ctx.fill();
  ctx.restore();
  // Shoes (with sole detail)
  ctx.fillStyle = '#4E342E';
  ctx.beginPath(); ctx.ellipse(x - s * 0.08 + walk * 0.015, zy + s * 0.47 + bob, s * 0.1, s * 0.045, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + s * 0.08 - walk * 0.015, zy + s * 0.47 + bob, s * 0.1, s * 0.045, 0, 0, Math.PI * 2); ctx.fill();
  // Soles
  ctx.fillStyle = '#3E2723';
  ctx.beginPath(); ctx.ellipse(x - s * 0.08 + walk * 0.015, zy + s * 0.485 + bob, s * 0.08, s * 0.02, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + s * 0.08 - walk * 0.015, zy + s * 0.485 + bob, s * 0.08, s * 0.02, 0, 0, Math.PI * 2); ctx.fill();

  // Body (suit jacket)
  const bg = ctx.createLinearGradient(x - s * 0.18, zy - s * 0.06 + bob + bodyBob, x + s * 0.18, zy + s * 0.28 + bob + bodyBob);
  bg.addColorStop(0, '#7B6B5D'); bg.addColorStop(0.5, '#6B5B4D'); bg.addColorStop(1, '#5B4B3D');
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.roundRect(x - s * 0.18, zy - s * 0.06 + bob + bodyBob, s * 0.36, s * 0.34, 5); ctx.fill();
  // Shirt collar visible at neck
  ctx.fillStyle = '#E8E8E8';
  ctx.beginPath(); ctx.ellipse(x, zy - s * 0.08 + bob + bodyBob, s * 0.12, s * 0.04, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#D0D0D0';
  ctx.beginPath(); ctx.ellipse(x - s * 0.04, zy - s * 0.06 + bob + bodyBob, s * 0.03, s * 0.03, -0.3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + s * 0.04, zy - s * 0.06 + bob + bodyBob, s * 0.03, s * 0.03, 0.3, 0, Math.PI * 2); ctx.fill();
  // Lapel
  ctx.fillStyle = '#5D4037';
  ctx.beginPath(); ctx.moveTo(x, zy - s * 0.06 + bob + bodyBob); ctx.lineTo(x - s * 0.06, zy + s * 0.15 + bob + bodyBob); ctx.lineTo(x, zy + s * 0.28 + bob + bodyBob); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#6D4C41';
  ctx.beginPath(); ctx.moveTo(x, zy - s * 0.06 + bob + bodyBob); ctx.lineTo(x + s * 0.06, zy + s * 0.15 + bob + bodyBob); ctx.lineTo(x, zy + s * 0.28 + bob + bodyBob); ctx.closePath(); ctx.fill();
  // Tie (bright red, wobbly)
  const tieWobble = Math.sin(animPhase * 2) * s * 0.018;
  ctx.fillStyle = '#E53935';
  ctx.beginPath(); ctx.moveTo(x - s * 0.02 + tieWobble, zy - s * 0.02 + bob + bodyBob); ctx.lineTo(x + s * 0.03 + tieWobble, zy + s * 0.12 + bob + bodyBob); ctx.lineTo(x - s * 0.02 + tieWobble, zy + s * 0.2 + bob + bodyBob); ctx.closePath(); ctx.fill();
  // Tie knot
  ctx.fillStyle = '#C62828';
  ctx.beginPath(); ctx.ellipse(x + tieWobble * 0.5, zy - s * 0.01 + bob + bodyBob, s * 0.02, s * 0.015, 0, 0, Math.PI * 2); ctx.fill();
  // Shirt tear
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.moveTo(x + s * 0.06, zy + s * 0.02 + bob + bodyBob);
  ctx.lineTo(x + s * 0.16, zy + s * 0.14 + bob + bodyBob);
  ctx.lineTo(x + s * 0.1, zy + s * 0.26 + bob + bodyBob);
  ctx.closePath(); ctx.fill();
  // Buttons
  ctx.fillStyle = '#FFD54F';
  for (let b = 0; b < 3; b++) {
    ctx.beginPath(); ctx.arc(x - s * 0.01, zy + b * s * 0.08 + bob + bodyBob + s * 0.02, s * 0.015, 0, Math.PI * 2); ctx.fill();
  }

  // Arms (thicker, with sleeve)
  ctx.strokeStyle = skin; ctx.lineWidth = s * 0.1; ctx.lineCap = 'round';
  // Left sleeve
  ctx.fillStyle = '#6B5B4D';
  ctx.beginPath(); ctx.arc(x - s * 0.18, zy + bob + bodyBob, s * 0.07, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x - s * 0.18, zy + bob + bodyBob);
  ctx.quadraticCurveTo(x - s * 0.32, zy - s * 0.08 + bob + bodyBob + armSw, x - s * 0.44, zy - s * 0.18 + bob + bodyBob + armSw);
  ctx.stroke();
  // Right sleeve
  ctx.fillStyle = '#6B5B4D';
  ctx.beginPath(); ctx.arc(x + s * 0.18, zy + bob + bodyBob, s * 0.07, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x + s * 0.18, zy + bob + bodyBob);
  ctx.quadraticCurveTo(x + s * 0.34, zy - s * 0.1 + bob + bodyBob - armSw, x + s * 0.42, zy - s * 0.22 + bob + bodyBob - armSw);
  ctx.stroke();
  // Hands (bigger)
  ctx.fillStyle = skinLt;
  ctx.beginPath(); ctx.arc(x - s * 0.44, zy - s * 0.18 + bob + bodyBob + armSw, s * 0.07, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + s * 0.42, zy - s * 0.22 + bob + bodyBob - armSw, s * 0.07, 0, Math.PI * 2); ctx.fill();
  // Fingers (more detail)
  ctx.strokeStyle = skinLt; ctx.lineWidth = 2;
  for (let f = -1; f <= 1; f++) {
    ctx.beginPath(); ctx.moveTo(x - s * 0.44, zy - s * 0.18 + bob + bodyBob + armSw);
    ctx.lineTo(x - s * 0.48 + f * s * 0.022, zy - s * 0.26 + bob + bodyBob + armSw); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + s * 0.42, zy - s * 0.22 + bob + bodyBob - armSw);
    ctx.lineTo(x + s * 0.46 + f * s * 0.022, zy - s * 0.3 + bob + bodyBob - armSw); ctx.stroke();
  }

  // Neck
  ctx.fillStyle = skinDk;
  ctx.beginPath(); ctx.roundRect(x - s * 0.06, zy - s * 0.14 + bob + bodyBob, s * 0.12, s * 0.1, 3); ctx.fill();

  // Head (bigger, rounder)
  ctx.save(); ctx.translate(x, zy - s * 0.22 + bob + bodyBob); ctx.rotate(headTilt);
  const hg = ctx.createRadialGradient(-s * 0.06, -s * 0.06, s * 0.05, 0, 0, s * 0.25);
  hg.addColorStop(0, skinLt); hg.addColorStop(0.6, skin); hg.addColorStop(1, skinDk);
  ctx.fillStyle = hg;
  ctx.beginPath(); ctx.arc(0, 0, s * 0.25, 0, Math.PI * 2); ctx.fill();
  // Ears
  ctx.fillStyle = skinDk;
  ctx.beginPath(); ctx.ellipse(-s * 0.24, s * 0.02, s * 0.04, s * 0.06, -0.3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(s * 0.24, s * 0.02, s * 0.04, s * 0.06, 0.3, 0, Math.PI * 2); ctx.fill();
  // Bald head highlight
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.beginPath(); ctx.ellipse(-s * 0.05, -s * 0.15, s * 0.12, s * 0.08, -0.2, 0, Math.PI * 2); ctx.fill();
  // Eyes (googly, bigger)
  ctx.fillStyle = '#FFF9C4';
  ctx.beginPath(); ctx.ellipse(-s * 0.09, -s * 0.04, s * 0.085, s * 0.1, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(s * 0.09, -s * 0.02, s * 0.075, s * 0.09, 0.1, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(-s * 0.09, -s * 0.04, s * 0.085, s * 0.1, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(s * 0.09, -s * 0.02, s * 0.075, s * 0.09, 0.1, 0, Math.PI * 2); ctx.stroke();
  // Red pupils
   ctx.fillStyle = '#D32F2F';
  ctx.beginPath(); ctx.arc(-s * 0.075, -s * 0.04, s * 0.048, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(s * 0.1, -s * 0.02, s * 0.04, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(-s * 0.06, -s * 0.06, s * 0.02, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(s * 0.12, -s * 0.04, s * 0.016, 0, Math.PI * 2); ctx.fill();
  // Droopy eyelids
  ctx.fillStyle = skinDk;
  ctx.beginPath(); ctx.ellipse(-s * 0.09, -s * 0.09, s * 0.09, s * 0.03, 0, 0, Math.PI); ctx.fill();
  ctx.beginPath(); ctx.ellipse(s * 0.09, -s * 0.07, s * 0.08, s * 0.025, 0.05, 0, Math.PI); ctx.fill();
  // Big open mouth
  ctx.fillStyle = '#3E2723';
  ctx.beginPath(); ctx.ellipse(s * 0.02, s * 0.1, s * 0.11, s * 0.07, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#B71C1C';
  ctx.beginPath(); ctx.ellipse(s * 0.02, s * 0.12, s * 0.07, s * 0.035, 0, 0, Math.PI * 2); ctx.fill();
  // Teeth (top)
  ctx.fillStyle = '#FFF8E1';
  const teethTop = s * 0.04;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath(); ctx.roundRect(i * s * 0.035 - s * 0.012, s * 0.045, s * 0.022, teethTop, 2); ctx.fill();
  }
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath(); ctx.roundRect(i * s * 0.035 - s * 0.01, s * 0.1, s * 0.02, teethTop * 0.7, 2); ctx.fill();
  }
  // Drool
   ctx.fillStyle = 'rgba(120,200,120,0.4)';
  ctx.beginPath();
  ctx.moveTo(s * 0.06, s * 0.16); ctx.quadraticCurveTo(s * 0.08, s * 0.22, s * 0.06 + Math.sin(animPhase * 2) * s * 0.02, s * 0.25);
  ctx.quadraticCurveTo(s * 0.04, s * 0.22, s * 0.04, s * 0.16); ctx.closePath(); ctx.fill();
  // Stubble
   ctx.fillStyle = skinDk;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath(); ctx.arc(-s * 0.05 + i * s * 0.03, s * 0.2 + (i % 2) * s * 0.012, s * 0.006, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  return { s, bob, skin };
}

function drawZombie(ctx: CanvasRenderingContext2D, zombie: Zombie, cellW: number, cellH: number, ox: number, oy: number) {
  const zy = oy + zombie.row * cellH + cellH / 2;
  const bob = zombie.eating ? 0 : Math.sin(zombie.animPhase) * 3;
  const alpha = zombie.dead ? Math.max(0, zombie.deathTimer / 500) : 1;
  ctx.globalAlpha = alpha;
  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.beginPath(); ctx.ellipse(zombie.x, oy + zombie.row * cellH + cellH - 6, cellW * 0.2, 5, 0, 0, Math.PI * 2); ctx.fill();
  const { s, bob: b } = drawZombieBase(ctx, zombie.x, zy, bob, cellW, cellH, zombie.animPhase, zombie.slowed, zombie.eating);

  // Accessories
  if (zombie.type === 'cone') {
    const cg = ctx.createLinearGradient(zombie.x - s * 0.14, zy - s * 0.6 + b, zombie.x + s * 0.14, zy - s * 0.25 + b);
    cg.addColorStop(0, '#FFB74D'); cg.addColorStop(0.5, '#FF9800'); cg.addColorStop(1, '#E65100');
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.moveTo(zombie.x, zy - s * 0.65 + b);
    ctx.lineTo(zombie.x - s * 0.17, zy - s * 0.28 + b); ctx.lineTo(zombie.x + s * 0.17, zy - s * 0.28 + b); ctx.closePath(); ctx.fill();
    // Stripes
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(zombie.x - s * 0.1, zy - s * 0.48 + b, s * 0.2, s * 0.04);
    ctx.fillRect(zombie.x - s * 0.08, zy - s * 0.39 + b, s * 0.16, s * 0.035);
    ctx.fillRect(zombie.x - s * 0.05, zy - s * 0.3 + b, s * 0.1, s * 0.03);
    // Tip
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(zombie.x, zy - s * 0.65 + b, s * 0.03, 0, Math.PI * 2); ctx.fill();
    // Scratch marks
    ctx.strokeStyle = 'rgba(180,100,30,0.5)'; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(zombie.x - s * 0.12, zy - s * 0.55 + b); ctx.lineTo(zombie.x - s * 0.06, zy - s * 0.48 + b); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(zombie.x + s * 0.08, zy - s * 0.45 + b); ctx.lineTo(zombie.x + s * 0.13, zy - s * 0.38 + b); ctx.stroke();
    // Dark edge at bottom
    ctx.strokeStyle = 'rgba(180,100,30,0.3)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(zombie.x - s * 0.17, zy - s * 0.28 + b); ctx.lineTo(zombie.x + s * 0.17, zy - s * 0.28 + b); ctx.stroke();
  } else if (zombie.type === 'bucket') {
    const bg = ctx.createLinearGradient(zombie.x - s * 0.16, zy - s * 0.55 + b, zombie.x + s * 0.16, zy - s * 0.25 + b);
    bg.addColorStop(0, '#CFD8DC'); bg.addColorStop(0.3, '#90A4AE'); bg.addColorStop(0.7, '#607D8B'); bg.addColorStop(1, '#455A64');
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.roundRect(zombie.x - s * 0.16, zy - s * 0.55 + b, s * 0.32, s * 0.32, 3); ctx.fill();
    ctx.fillStyle = '#CFD8DC'; ctx.fillRect(zombie.x - s * 0.17, zy - s * 0.55 + b, s * 0.34, s * 0.05);
    // Handle
    ctx.strokeStyle = '#78909C'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(zombie.x, zy - s * 0.55 + b, s * 0.1, Math.PI, 0); ctx.stroke();
    // Rivets (more)
    ctx.fillStyle = '#B0BEC5';
    ctx.beginPath(); ctx.arc(zombie.x - s * 0.1, zy - s * 0.38 + b, s * 0.02, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(zombie.x + s * 0.1, zy - s * 0.38 + b, s * 0.02, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(zombie.x - s * 0.1, zy - s * 0.32 + b, s * 0.015, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(zombie.x + s * 0.1, zy - s * 0.32 + b, s * 0.015, 0, Math.PI * 2); ctx.fill();
    // Rust spots
    ctx.fillStyle = 'rgba(183,130,90,0.4)';
    ctx.beginPath(); ctx.ellipse(zombie.x + s * 0.06, zy - s * 0.48 + b, s * 0.04, s * 0.03, 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(160,110,60,0.3)';
    ctx.beginPath(); ctx.ellipse(zombie.x - s * 0.08, zy - s * 0.35 + b, s * 0.035, s * 0.025, -0.2, 0, Math.PI * 2); ctx.fill();
    // Dents (more)
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(zombie.x + s * 0.04, zy - s * 0.42 + b, s * 0.04, 0, 1.5); ctx.stroke();
    ctx.beginPath(); ctx.arc(zombie.x - s * 0.06, zy - s * 0.45 + b, s * 0.03, 0.5, 1.2); ctx.stroke();
    ctx.beginPath(); ctx.arc(zombie.x + s * 0.1, zy - s * 0.32 + b, s * 0.025, 2.0, 2.0); ctx.stroke();
  } else if (zombie.type === 'flag') {
    ctx.strokeStyle = '#5D4037'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(zombie.x + s * 0.14, zy - s * 0.18 + b);
    ctx.lineTo(zombie.x + s * 0.14, zy - s * 0.68 + b); ctx.stroke();
    const wave = Math.sin(zombie.animPhase * 2) * s * 0.04;
    const wave2 = Math.sin(zombie.animPhase * 3) * s * 0.02;
    // Flag with gradient and wave
    const fg = ctx.createLinearGradient(zombie.x + s * 0.14, zy - s * 0.68 + b, zombie.x + s * 0.4, zy - s * 0.52 + b);
    fg.addColorStop(0, '#EF5350'); fg.addColorStop(0.5, '#F44336'); fg.addColorStop(1, '#C62828');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(zombie.x + s * 0.14, zy - s * 0.68 + b);
    ctx.quadraticCurveTo(zombie.x + s * 0.32 + wave, zy - s * 0.6 + b + wave2, zombie.x + s * 0.4, zy - s * 0.52 + b);
    ctx.lineTo(zombie.x + s * 0.14, zy - s * 0.42 + b);
    ctx.closePath(); ctx.fill();
    // Flag edge highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(zombie.x + s * 0.14, zy - s * 0.68 + b);
    ctx.quadraticCurveTo(zombie.x + s * 0.32 + wave, zy - s * 0.6 + b + wave2, zombie.x + s * 0.4, zy - s * 0.52 + b);
    ctx.stroke();
    // Flag text
    ctx.fillStyle = '#fff'; ctx.font = `bold ${s * 0.09}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Z', zombie.x + s * 0.25 + wave * 0.5, zy - s * 0.55 + b);
    // Skull on flag (small)
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath(); ctx.arc(zombie.x + s * 0.25 + wave * 0.5, zy - s * 0.55 + b, s * 0.02, 0, Math.PI * 2); ctx.fill();
  }

  if (zombie.slowed && !zombie.dead) {
    ctx.fillStyle = 'rgba(100,220,255,0.12)';
    ctx.beginPath(); ctx.arc(zombie.x, zy + bob, s * 0.35, 0, Math.PI * 2); ctx.fill();
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
    const w = rect.width; const h = rect.height;
    canvas.width = w * dpr; canvas.height = h * dpr;
    canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cellW = (w * 0.9) / GRID_COLS;
    const cellH = (h * 0.95) / GRID_ROWS;
    const ox = w * 0.07; const oy = h * 0.025;
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
        id: uid(), x: w / 2, y: h - 100,
        text: `+${reward + comboBonus} ${comboBonus > 0 ? ' x' + state.comboCount + '连击!' : ''}`,
        color: '#FF8F00', timer: 1500, maxTimer: 1500,
      });
    } else {
      state.comboCount = 0;
      state.zombieSpeedBoostEnd = now + ZOMBIE_SPEED_BOOST_DURATION;
      state.shakeTimer = 300;
      state.floatingTexts.push({
        id: uid(), x: w / 2, y: h - 100,
        text: '答错了! 僵尸加速!', color: '#E53935', timer: 1500, maxTimer: 1500,
      });
    }
    state.quizCooldown = QUIZ_COOLDOWN;
    forceUpdate();
  }, [forceUpdate]);

  const handleCanvasClick = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const state = gs.current;
    if (!state || state.phase !== 'playing' || !state.selectedPlant) return;
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    let cx: number, cy: number;
    if ('touches' in e) { if (!e.touches.length) return; cx = e.touches[0].clientX; cy = e.touches[0].clientY; }
    else { cx = e.clientX; cy = e.clientY; }
    const x = cx - rect.left; const y = cy - rect.top;
    const { cellW, cellH, ox, oy } = dims.current;
    const col = Math.floor((x - ox) / cellW);
    const row = Math.floor((y - oy) / cellH);
    if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return;
    if (state.plants.some(p => p.row === row && p.col === col)) return;
    const def = PLANT_DEFS[state.selectedPlant];
    if (state.sun < def.cost) {
      state.floatingTexts.push({ id: uid(), x, y, text: '阳光不足!', color: '#E53935', timer: 1000, maxTimer: 1000 });
      return;
    }
    state.sun -= def.cost;
    const plant: Plant = { id: uid(), type: state.selectedPlant, row, col, hp: def.hp, maxHp: def.hp, lastAttack: Date.now(), animPhase: Math.random() * Math.PI * 2 };
    state.plants.push(plant);
    if (def.explosive) {
      const cs = state; const cp = plant; const cc = col; const cr = row;
      setTimeout(() => {
        if (cs.phase !== 'playing') return;
        const { ox: oX, oy: oY, cellW: cW, cellH: cH } = dims.current;
        const ex = oX + cc * cW + cW / 2; const ey = oY + cr * cH + cH / 2;
        cs.explosions.push({ id: uid(), x: ex, y: ey, radius: 0, maxRadius: cW * 2, timer: 0, maxTimer: 600 });
        cs.zombies.forEach(z => {
          if (!z.dead && Math.abs(z.row - cr) <= 1) {
            const zzy = oY + z.row * cH + cH / 2;
            if (Math.sqrt((z.x - ex) ** 2 + (zzy - ey) ** 2) < cW * 2.5) {
              z.hp -= 1800;
              if (z.hp <= 0) { z.dead = true; z.deathTimer = 500; cs.totalKills++; cs.score += 50; }
            }
          }
        });
        cs.plants = cs.plants.filter(p => p.id !== cp.id);
        forceUpdate();
      }, 500);
    }
    forceUpdate();
  }, [forceUpdate]);

  // ---- Game loop ----
  const gameLoop = useCallback(() => {
    const state = gs.current; const canvas = canvasRef.current;
    if (!state || !canvas || state.phase !== 'playing') return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const now = Date.now();
    const dt = Math.min(now - state.lastTime, 50);
    state.lastTime = now;
    const { w, h, cellW, cellH, ox, oy } = dims.current;
    const isBoosted = now < state.zombieSpeedBoostEnd;
    const speedMult = isBoosted ? ZOMBIE_SPEED_BOOST : 1;

    // Spawn
    const waveConfig = WAVE_CONFIGS[state.wave];
    if (waveConfig) {
      const elapsed = now - state.waveStartTime;
      for (let i = state.waveZombiesSpawned; i < waveConfig.zombies.length; i++) {
        if (elapsed >= waveConfig.zombies[i].delay) {
          state.waveZombiesSpawned = i + 1;
          const zc = waveConfig.zombies[i]; const def = ZOMBIE_DEFS[zc.type];
          const row = zc.row ?? Math.floor(Math.random() * GRID_ROWS);
          state.zombies.push({ id: uid(), type: zc.type, row, x: ox + (GRID_COLS + 0.8) * cellW, hp: def.hp, maxHp: def.hp, speed: def.speed, baseSpeed: def.speed, eating: false, slowed: false, slowTimer: 0, lastHit: now, animPhase: Math.random() * Math.PI * 2, dead: false, deathTimer: 0 });
        } else break;
      }
    }

    // Wave check
    const allSpawned = waveConfig ? state.waveZombiesSpawned >= waveConfig.zombies.length : true;
    const allDead = state.zombies.length === 0 || state.zombies.every(z => z.dead);
    if (allSpawned && allDead && state.zombies.length > 0) {
      if (state.wave < WAVE_CONFIGS.length - 1) {
        state.wave++; state.waveStartTime = now; state.waveZombiesSpawned = 0;
        state.floatingTexts.push({ id: uid(), x: w / 2, y: h / 2, text: `第 ${state.wave + 1} 波!`, color: '#E65100', timer: 2000, maxTimer: 2000 });
        forceUpdate();
      } else { state.phase = 'victory'; setPhase('victory'); return; }
    }

    // Zombies
    let gameOver = false;
    for (const z of state.zombies) {
      if (z.dead) { z.deathTimer -= dt; continue; }
      if (z.slowed) { z.slowTimer -= dt; if (z.slowTimer <= 0) z.slowed = false; }
      z.animPhase += dt * 0.005 * (z.slowed ? 0.5 : 1);
      const spd = z.baseSpeed * speedMult * (z.slowed ? 0.5 : 1);
      const ep = state.plants.find(p => p.row === z.row && Math.abs(z.x - (ox + p.col * cellW + cellW / 2)) < cellW * 0.35);
      if (ep) {
        z.eating = true;
        if (now - z.lastHit > 1000) { z.lastHit = now; ep.hp -= 100; if (ep.hp <= 0) state.plants = state.plants.filter(p => p.id !== ep.id); }
      } else { z.eating = false; z.x -= spd * (dt / 1000); }
      if (z.x < ox - cellW * 0.5) gameOver = true;
    }
    state.zombies = state.zombies.filter(z => !(z.dead && z.deathTimer <= 0));
    if (gameOver) { state.phase = 'gameover'; setPhase('gameover'); return; }

    // Plants
    for (const p of state.plants) {
      p.animPhase += dt * 0.003;
      const d = PLANT_DEFS[p.type];
      if (d.attack && d.attackSpeed) {
        const hz = state.zombies.some(z => !z.dead && z.row === p.row && z.x > ox + p.col * cellW);
        if (hz && now - p.lastAttack >= d.attackSpeed) {
          p.lastAttack = now;
          const px = ox + p.col * cellW + cellW * 0.7;
          state.projectiles.push({ id: uid(), row: p.row, x: px, speed: 250, damage: d.attack, slow: !!d.slowEffect, active: true });
          if (d.doubleShot) { setTimeout(() => { if (gs.current?.phase === 'playing') gs.current.projectiles.push({ id: uid(), row: p.row, x: px, speed: 250, damage: d.attack, slow: false, active: true }); }, 150); }
        }
      }
    }

    // Projectiles
    for (const pr of state.projectiles) {
      if (!pr.active) continue;
      pr.x += pr.speed * (dt / 1000);
      const hz = state.zombies.find(z => !z.dead && z.row === pr.row && Math.abs(z.x - pr.x) < cellW * 0.25);
      if (hz) {
        pr.active = false; hz.hp -= pr.damage;
        if (pr.slow) { hz.slowed = true; hz.slowTimer = 3000; }
        if (hz.hp <= 0) { hz.dead = true; hz.deathTimer = 500; state.totalKills++; state.score += 50; }
        state.floatingTexts.push({ id: uid(), x: pr.x, y: oy + pr.row * cellH + cellH * 0.25, text: `-${pr.damage}`, color: pr.slow ? '#29B6F6' : '#FF6D00', timer: 600, maxTimer: 600 });
      }
      if (pr.x > ox + (GRID_COLS + 1) * cellW) pr.active = false;
    }
    state.projectiles = state.projectiles.filter(p => p.active);

    // Effects
    for (const e of state.explosions) { e.timer += dt; e.radius = (e.timer / e.maxTimer) * e.maxRadius; }
    state.explosions = state.explosions.filter(e => e.timer < e.maxTimer);
    for (const f of state.floatingTexts) { f.timer -= dt; f.y -= dt * 0.04; }
    state.floatingTexts = state.floatingTexts.filter(f => f.timer > 0);

    // Quiz
    if (state.currentQuiz) {
      if (state.currentQuiz.answered) { state.quizCooldown -= dt; if (state.quizCooldown <= 0) generateQuiz(state); }
      else {
        state.currentQuiz.timer -= dt;
        if (state.currentQuiz.timer <= 0) {
          state.currentQuiz.answered = true; state.currentQuiz.wasCorrect = false;
          state.wordsAnswered++; state.comboCount = 0;
          state.zombieSpeedBoostEnd = now + ZOMBIE_SPEED_BOOST_DURATION;
          state.shakeTimer = 300; state.quizCooldown = QUIZ_COOLDOWN;
          state.floatingTexts.push({ id: uid(), x: w / 2, y: h - 100, text: '超时! 僵尸加速!', color: '#E53935', timer: 1500, maxTimer: 1500 });
          forceUpdate();
        }
      }
    }
    if (state.shakeTimer > 0) state.shakeTimer -= dt;

    // ======== RENDER ========
    const dpr = window.devicePixelRatio || 1;
    ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (state.shakeTimer > 0) ctx.translate((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);

    // Warm bright sky background (lighter, more golden)
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#FFF8E1'); sky.addColorStop(0.08, '#FFECB3');
    sky.addColorStop(0.2, '#FFE082'); sky.addColorStop(0.4, '#C8E6C9');
    sky.addColorStop(0.6, '#A5D6A7'); sky.addColorStop(1, '#81C784');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);

    // Clouds (warm, brighter)
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.beginPath(); ctx.ellipse(w * 0.12, h * 0.05, 42, 15, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(w * 0.16, h * 0.01, 28, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(w * 0.14, h * 0.03, 22, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(w * 0.52, h * 0.07, 38, 13, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(w * 0.56, h * 0.03, 25, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(w * 0.85, h * 0.04, 32, 12, 0, 0, Math.PI * 2); ctx.fill();

    // Grid (bright warm green)
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? 'rgba(165,214,167,0.35)' : 'rgba(200,230,201,0.3)';
        ctx.fillRect(ox + c * cellW, oy + r * cellH, cellW, cellH);
        ctx.strokeStyle = 'rgba(56,142,60,0.08)'; ctx.lineWidth = 0.5;
        ctx.strokeRect(ox + c * cellW, oy + r * cellH, cellW, cellH);
      }
    }

    // House
    const hsg = ctx.createLinearGradient(0, oy, ox, oy);
    hsg.addColorStop(0, '#A1887F'); hsg.addColorStop(0.6, '#BCAAA4'); hsg.addColorStop(1, '#D7CCC8');
    ctx.fillStyle = hsg; ctx.fillRect(0, oy, ox - 2, GRID_ROWS * cellH);
    const dW = ox * 0.42; const dH = cellH * 0.7;
    const dX = (ox - dW) / 2; const dY = oy + (GRID_ROWS * cellH - dH) / 2;
    ctx.fillStyle = '#5D4037'; ctx.beginPath(); ctx.roundRect(dX, dY, dW, dH, [5, 5, 0, 0]); ctx.fill();
    ctx.fillStyle = '#FFD54F'; ctx.beginPath(); ctx.arc(dX + dW * 0.78, dY + dH * 0.55, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#BBDEFB'; const wS = ox * 0.26;
    ctx.fillRect(ox * 0.15, oy + cellH * 0.4, wS, wS);
    ctx.fillRect(ox * 0.15, oy + cellH * 2.3, wS, wS);
    ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 1.5;
    ctx.strokeRect(ox * 0.15, oy + cellH * 0.4, wS, wS);
    ctx.strokeRect(ox * 0.15, oy + cellH * 2.3, wS, wS);

    // Grid hover
    if (state.selectedPlant) {
      ctx.fillStyle = 'rgba(255,235,59,0.08)';
      for (let r = 0; r < GRID_ROWS; r++) for (let c = 0; c < GRID_COLS; c++)
        if (!state.plants.some(p => p.row === r && p.col === c)) ctx.fillRect(ox + c * cellW, oy + r * cellH, cellW, cellH);
    }

    // Plants
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const p of state.plants) {
      const px = ox + p.col * cellW + cellW / 2;
      const py = oy + p.row * cellH + cellH / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.1)';
      ctx.beginPath(); ctx.ellipse(px, oy + p.row * cellH + cellH - 5, cellW * 0.22, 5, 0, 0, Math.PI * 2); ctx.fill();
      drawPlant(ctx, p.type, px, py, cellW, cellH, p.animPhase, p.hp / p.maxHp);
      if (p.hp < p.maxHp) {
        const bW = cellW * 0.6; const bX = px - bW / 2; const bY = oy + p.row * cellH + 3;
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.roundRect(bX - 1, bY - 1, bW + 2, 6, 3); ctx.fill();
        const rat = Math.max(0, p.hp / p.maxHp);
        ctx.fillStyle = rat > 0.5 ? '#66BB6A' : rat > 0.25 ? '#FFA726' : '#EF5350';
        ctx.beginPath(); ctx.roundRect(bX, bY, bW * rat, 4, 2); ctx.fill();
      }
    }

    // Projectiles
    for (const pr of state.projectiles) {
      const py = oy + pr.row * cellH + cellH / 2;
      const ps = Math.max(4, cellW * 0.09);
      ctx.fillStyle = pr.slow ? 'rgba(100,200,255,0.25)' : 'rgba(139,195,74,0.25)';
      ctx.beginPath(); ctx.ellipse(pr.x - ps * 1.5, py, ps * 2, ps * 0.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.shadowColor = pr.slow ? '#29B6F6' : '#8BC34A'; ctx.shadowBlur = 6;
      const pg = ctx.createRadialGradient(pr.x - ps * 0.2, py - ps * 0.2, 0, pr.x, py, ps);
      if (pr.slow) { pg.addColorStop(0, '#E1F5FE'); pg.addColorStop(0.5, '#4FC3F7'); pg.addColorStop(1, '#0277BD'); }
      else { pg.addColorStop(0, '#DCEDC8'); pg.addColorStop(0.5, '#8BC34A'); pg.addColorStop(1, '#33691E'); }
      ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(pr.x, py, ps, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Zombies
    for (const z of state.zombies) {
      drawZombie(ctx, z, cellW, cellH, ox, oy);
      if (!z.dead && z.hp < z.maxHp) {
        const bW = cellW * 0.45; const bX = z.x - bW / 2; const bY = oy + z.row * cellH + 3;
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.roundRect(bX - 1, bY - 1, bW + 2, 6, 3); ctx.fill();
        const rat = Math.max(0, z.hp / z.maxHp);
        ctx.fillStyle = rat > 0.5 ? '#66BB6A' : rat > 0.25 ? '#FFA726' : '#EF5350';
        ctx.beginPath(); ctx.roundRect(bX, bY, bW * rat, 4, 2); ctx.fill();
      }
    }

    // Explosions
    for (const e of state.explosions) {
      const p = e.timer / e.maxTimer; const a = 1 - p;
      ctx.strokeStyle = `rgba(255,183,77,${a * 0.8})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = `rgba(255,111,0,${a * 0.5})`; ctx.beginPath(); ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(255,224,130,${a * 0.4})`; ctx.beginPath(); ctx.arc(e.x, e.y, e.radius * 0.5, 0, Math.PI * 2); ctx.fill();
    }

    // Floating texts
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const f of state.floatingTexts) {
      const a = Math.min(1, f.timer / (f.maxTimer * 0.3)); ctx.globalAlpha = a;
      ctx.font = 'bold 15px sans-serif';
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 3; ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
      ctx.globalAlpha = 1;
    }

    // Wave announce
    if (state.waveZombiesSpawned <= 1 && waveConfig) {
      const el = now - state.waveStartTime;
      if (el < 2500) {
        const a = el < 500 ? el / 500 : el > 2000 ? (2500 - el) / 500 : 1; ctx.globalAlpha = a;
        ctx.font = 'bold 28px sans-serif'; ctx.textAlign = 'center';
        ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 4;
        ctx.strokeText(`第 ${state.wave + 1} 波`, w / 2, h / 2 - 8);
        ctx.fillStyle = '#FFF'; ctx.fillText(`第 ${state.wave + 1} 波`, w / 2, h / 2 - 8);
        ctx.font = '15px sans-serif';
        ctx.strokeText(`${waveConfig.zombies.length} 个僵尸来袭!`, w / 2, h / 2 + 22);
        ctx.fillStyle = '#FFE082'; ctx.fillText(`${waveConfig.zombies.length} 个僵尸来袭!`, w / 2, h / 2 + 22);
        ctx.globalAlpha = 1;
      }
    }

    // Speed boost border (warm glow)
    if (isBoosted) {
      const p = 0.25 + Math.sin(now * 0.008) * 0.1;
      ctx.strokeStyle = `rgba(255,87,34,${p})`; ctx.lineWidth = 3; ctx.strokeRect(2, 2, w - 4, h - 4);
    }
    ctx.restore();
    rafRef.current = requestAnimationFrame(gameLoop);
  }, [generateQuiz, forceUpdate]);

  useEffect(() => {
    if (!containerRef.current) return;
    recalcDims();
    const obs = new ResizeObserver(() => recalcDims());
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, [phase, recalcDims]);

  useEffect(() => {
    if (phase === 'playing') { gs.current!.lastTime = Date.now(); rafRef.current = requestAnimationFrame(gameLoop); }
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, gameLoop]);

  const state = gs.current;
  const quiz = state?.currentQuiz;
  const diff = quiz?.word.difficulty ?? 1;

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden select-none" style={{ background: '#FFF8E1' }}>
      {phase === 'menu' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 relative overflow-hidden"
          style={{ background: 'linear-gradient(180deg, #FFF8E1 0%, #FFECB3 25%, #FFE082 50%, #C8E6C9 78%, #A5D6A7 100%)' }}>
          <div className="text-8xl animate-bounce" style={{ filter: 'drop-shadow(0 8px 16px rgba(255,152,0,0.25))' }}>🧟</div>
          <h1 className="text-4xl md:text-6xl font-extrabold z-10"
            style={{ color: '#E65100', textShadow: '3px 3px 0 #FFE082, 0 0 40px rgba(255,183,77,0.3)' }}>
            植物大战僵尸
          </h1>
          <p className="text-xl md:text-2xl font-semibold tracking-widest z-10" style={{ color: '#BF360C', textShadow: '0 1px 0 rgba(255,255,255,0.5)' }}>
            单词大作战
          </p>
          <div className="mt-2 text-sm md:text-base text-center space-y-2 z-10 rounded-2xl px-6 py-4"
            style={{ background: 'rgba(255,255,255,0.65)', backdropFilter: 'blur(10px)', color: '#4E342E', boxShadow: '0 4px 20px rgba(255,152,0,0.15)' }}>
            <p>📝 答对单词自动获得阳光</p>
            <p>🌱 用阳光种植植物抵御僵尸</p>
            <p>🧟 不要让僵尸到达你的房子!</p>
            <p>🔥 连续答对获得连击加成</p>
          </div>
          <button onClick={initGame}
            className="mt-4 px-12 py-3.5 font-bold text-xl rounded-2xl shadow-lg z-10 transition-all hover:scale-105 active:scale-95"
            style={{ background: 'linear-gradient(180deg, #FFCC80, #FFB74D)', color: '#4E342E', boxShadow: '0 6px 24px rgba(255,152,0,0.45)', border: '2px solid rgba(255,255,255,0.4)' }}>
            开始游戏
          </button>
        </div>
      )}

      {(phase === 'playing' || phase === 'gameover' || phase === 'victory') && state && (
        <>
          {/* HUD - bright warm amber/gold */}
          <div className="flex items-center justify-between px-3 py-1.5 relative z-10 flex-shrink-0"
            style={{ background: 'linear-gradient(180deg, #FFB74D, #FFA726)', borderBottom: '2px solid rgba(255,255,255,0.4)', boxShadow: '0 3px 12px rgba(255,152,0,0.2)' }}>
            <div className="flex items-center gap-1.5 rounded-xl px-3 py-1" style={{ background: 'rgba(255,255,255,0.5)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6)' }}>
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-lg"
                style={{ background: 'radial-gradient(circle, #FFF9C4, #FFD54F)', boxShadow: '0 0 12px rgba(255,213,79,0.6)' }}>☀️</div>
              <span className="font-extrabold text-xl tabular-nums min-w-[45px]" style={{ color: '#3E2723' }}>{state.sun}</span>
            </div>
            <div className="flex items-center gap-2.5 text-xs md:text-sm">
              <div className="rounded-lg px-2.5 py-1 text-center" style={{ background: 'rgba(255,255,255,0.5)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5)' }}>
                <div className="text-amber-800/70 text-[10px] leading-tight">波次</div>
                <div className="font-extrabold text-base leading-tight" style={{ color: '#3E2723' }}>{state.wave + 1}<span className="text-amber-800/50">/{WAVE_CONFIGS.length}</span></div>
              </div>
              <div className="rounded-lg px-2.5 py-1 text-center hidden sm:block" style={{ background: 'rgba(255,255,255,0.5)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5)' }}>
                <div className="text-amber-800/70 text-[10px] leading-tight">得分</div>
                <div className="font-bold leading-tight" style={{ color: '#3E2723' }}>{state.score}</div>
              </div>
              <div className="rounded-lg px-2.5 py-1 text-center" style={{ background: 'rgba(255,255,255,0.5)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5)' }}>
                <div className="text-amber-800/70 text-[10px] leading-tight">答题</div>
                <div className="font-bold leading-tight" style={{ color: '#3E2723' }}><span style={{ color: '#2E7D32' }}>{state.wordsCorrect}</span>/{state.wordsAnswered}</div>
              </div>
              {state.comboCount >= 3 && (
                <div className="rounded-lg px-2.5 py-1 animate-pulse" style={{ background: 'linear-gradient(135deg, #FF6F00, #E65100)', boxShadow: '0 0 12px rgba(255,111,0,0.5)' }}>
                  <div className="font-extrabold text-sm" style={{ color: '#FFF9C4' }}>🔥x{state.comboCount}</div>
                </div>
              )}
            </div>
          </div>

          {/* Card bar - bright warm cream/sand */}
          <div className="flex items-center gap-1.5 px-2 py-1.5 relative z-10 flex-shrink-0 overflow-x-auto"
            style={{ background: 'linear-gradient(180deg, #FFECB3, #FFE082)', borderBottom: '1px solid rgba(255,224,130,0.6)', boxShadow: '0 2px 8px rgba(255,152,0,0.08)' }}>
            <button onClick={() => { state.selectedPlant = null; forceUpdate(); }}
              className={`flex-shrink-0 w-10 h-12 rounded-lg text-base font-bold transition-all flex items-center justify-center ${
                !state.selectedPlant ? 'ring-2 ring-orange-400 shadow-lg' : ''}`}
              style={{ background: !state.selectedPlant ? 'linear-gradient(180deg, #FFCC80, #FFB74D)' : 'rgba(139,119,101,0.12)',
                color: !state.selectedPlant ? '#3E2723' : '#A1887F' }}>
              ✋
            </button>
            {PLANT_ORDER.map(pt => {
              const d = PLANT_DEFS[pt]; const ok = state.sun >= d.cost; const sel = state.selectedPlant === pt;
              return (
                <button key={pt} onClick={() => { state.selectedPlant = sel ? null : pt; forceUpdate(); }} disabled={!ok}
                  className={`flex-shrink-0 flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl text-xs font-medium transition-all min-w-[52px] ${
                    sel ? 'ring-2 ring-orange-400 shadow-lg scale-105' : ok ? 'hover:scale-105' : 'cursor-not-allowed'}`}
                  style={{ background: sel ? 'linear-gradient(180deg, #FFCC80, #FFB74D)' : ok ? 'rgba(255,255,255,0.55)' : 'rgba(139,119,101,0.1)',
                    color: sel ? '#3E2723' : ok ? '#3E2723' : '#BCAAA4',
                    border: ok ? '1.5px solid rgba(255,183,77,0.35)' : '1.5px solid transparent',
                    boxShadow: sel ? '0 2px 10px rgba(255,152,0,0.25)' : 'none' }}>
                  <span className="text-xl leading-none">{d.emoji}</span>
                  <span className="font-bold text-[10px] leading-tight">{d.name}</span>
                  <span className="text-[10px] leading-tight font-bold" style={{ color: ok ? '#E65100' : '#BCAAA4' }}>☀️{d.cost}</span>
                </button>
              );
            })}
          </div>

          {/* Canvas - STABLE SIZE, quiz overlays on top */}
          <div ref={containerRef} className="flex-1 relative min-h-0">
            <canvas ref={canvasRef} onClick={handleCanvasClick} onTouchStart={(e) => { e.preventDefault(); handleCanvasClick(e); }} className="w-full h-full" />
            {Date.now() < state.zombieSpeedBoostEnd && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold animate-pulse z-10"
                style={{ background: 'linear-gradient(135deg, rgba(229,57,53,0.9), rgba(255,87,34,0.9))', color: '#FFF9C4', boxShadow: '0 0 16px rgba(229,57,53,0.5)' }}>
                ⚡ 僵尸加速中!
              </div>
            )}

            {/* Quiz panel - ALWAYS present as overlay, doesn't affect canvas size */}
            {phase === 'playing' && quiz && (
              <div className="absolute bottom-0 left-0 right-0 z-20 rounded-t-2xl"
                style={{ height: '115px',
                  background: quiz.answered
                    ? (quiz.wasCorrect
                      ? 'linear-gradient(180deg, rgba(255,248,225,0.97), rgba(255,243,224,0.97))'
                      : 'linear-gradient(180deg, rgba(255,235,238,0.97), rgba(255,224,224,0.97))')
                    : 'linear-gradient(180deg, rgba(255,253,245,0.98), rgba(255,248,225,0.98))',
                  borderTop: quiz.answered
                    ? (quiz.wasCorrect ? '2px solid #A5D6A7' : '2px solid #EF9A9A')
                    : '2px solid #FFE082',
                  backdropFilter: 'blur(12px)',
                  boxShadow: '0 -4px 24px rgba(255,152,0,0.12)'
                }}>
                <div className="max-w-lg mx-auto h-full flex flex-col justify-center px-3 md:px-6">
                  {quiz.answered ? (
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-xl">{quiz.wasCorrect ? '✅' : '❌'}</span>
                      <span className="font-bold text-base" style={{ color: quiz.wasCorrect ? '#2E7D32' : '#C62828' }}>
                        {quiz.word.en} = {quiz.word.zh}
                      </span>
                      <span className="text-xs ml-2" style={{ color: '#A1887F' }}>
                        下一题 {Math.max(0, Math.ceil(state.quizCooldown / 1000))}s
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            diff === 1 ? 'text-emerald-800' : diff === 2 ? 'text-amber-800' : 'text-red-800'
                          }`} style={{
                            background: diff === 1 ? 'linear-gradient(135deg, #C8E6C9, #A5D6A7)'
                              : diff === 2 ? 'linear-gradient(135deg, #FFE082, #FFD54F)'
                              : 'linear-gradient(135deg, #FFAB91, #FF8A65)'
                          }}>
                            {diff === 1 ? '简单' : diff === 2 ? '中等' : '困难'} +{QUIZ_SUN_REWARD[diff]}☀️
                          </span>
                          <span className="font-bold text-lg md:text-xl tracking-wide" style={{ color: '#3E2723', textShadow: '0 1px 0 rgba(255,255,255,0.5)' }}>{quiz.word.en}</span>
                        </div>
                        <span className={`text-sm font-mono tabular-nums ${quiz.timer < 3000 ? 'font-bold animate-pulse' : ''}`}
                          style={{ color: quiz.timer < 3000 ? '#D32F2F' : '#A1887F' }}>
                          {Math.max(0, Math.ceil(quiz.timer / 1000))}s
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full mb-1.5 overflow-hidden" style={{ background: 'rgba(255,152,0,0.12)' }}>
                        <div className={`h-full rounded-full transition-all duration-150 ${
                          quiz.timer < 3000 ? 'bg-red-400' : 'bg-amber-400'
                        }`} style={{ width: `${(quiz.timer / QUIZ_TIME_LIMIT) * 100}%` }} />
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {quiz.options.map((opt, i) => (
                          <button key={i} onClick={() => handleAnswer(i)}
                            className="py-1.5 md:py-2 px-2 md:px-3 rounded-xl text-sm md:text-base font-medium transition-all hover:scale-[1.02] active:scale-[0.98] hover:shadow-md"
                            style={{ color: '#3E2723', background: 'rgba(255,255,255,0.8)', border: '1.5px solid rgba(255,183,77,0.3)', boxShadow: '0 1px 4px rgba(255,152,0,0.08)' }}>
                            <span className="font-bold mr-1" style={{ color: '#E65100' }}>{String.fromCharCode(65 + i)}</span>
                            {opt}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Game Over overlay */}
            {phase === 'gameover' && (
              <div className="absolute inset-0 flex items-center justify-center z-30" style={{ background: 'rgba(62,39,35,0.45)', backdropFilter: 'blur(5px)' }}>
                <div className="rounded-3xl p-8 text-center max-w-sm mx-4 shadow-2xl"
                  style={{ background: 'linear-gradient(180deg, #FFF8E1, #FFECB3)', border: '2px solid rgba(229,57,53,0.3)', boxShadow: '0 12px 40px rgba(0,0,0,0.2)' }}>
                  <div className="text-6xl mb-3">💀</div>
                  <h2 className="text-3xl font-extrabold mb-3" style={{ color: '#C62828', textShadow: '0 1px 0 rgba(255,255,255,0.5)' }}>游戏结束</h2>
                  <div className="space-y-2 text-sm mb-5">
                    {[['存活波次', `${state.wave + 1}/${WAVE_CONFIGS.length}`], ['消灭僵尸', `${state.totalKills}`],
                      ['答题正确率', `${state.wordsAnswered > 0 ? Math.round(state.wordsCorrect / state.wordsAnswered * 100) : 0}% (${state.wordsCorrect}/${state.wordsAnswered})`],
                      ['最终得分', `${state.score}`]
                    ].map(([l, v], i) => (
                      <div key={i} className="flex justify-between rounded-lg px-3 py-1.5" style={{ background: 'rgba(255,255,255,0.55)' }}>
                        <span style={{ color: '#6D4C41' }}>{l}</span>
                        <span className="font-bold" style={{ color: i === 3 ? '#E65100' : '#3E2723' }}>{v}</span>
                      </div>
                    ))}
                  </div>
                  <button onClick={initGame} className="px-10 py-3 font-bold text-lg rounded-2xl shadow-lg transition-all hover:scale-105 active:scale-95"
                    style={{ background: 'linear-gradient(180deg, #FF8A65, #EF5350)', color: '#fff', boxShadow: '0 4px 18px rgba(229,57,53,0.3)' }}>
                    再来一局
                  </button>
                </div>
              </div>
            )}

            {/* Victory overlay */}
            {phase === 'victory' && (
              <div className="absolute inset-0 flex items-center justify-center z-30" style={{ background: 'rgba(62,39,35,0.35)', backdropFilter: 'blur(5px)' }}>
                <div className="rounded-3xl p-8 text-center max-w-sm mx-4 shadow-2xl"
                  style={{ background: 'linear-gradient(180deg, #FFFDE7, #FFF8E1)', border: '2px solid rgba(255,183,77,0.5)', boxShadow: '0 12px 40px rgba(255,152,0,0.2)' }}>
                  <div className="text-6xl mb-3">🏆</div>
                  <h2 className="text-3xl font-extrabold mb-1" style={{ color: '#E65100', textShadow: '0 1px 0 rgba(255,255,255,0.5)' }}>胜利!</h2>
                  <p className="text-sm mb-4" style={{ color: '#558B2F' }}>成功抵御了所有僵尸!</p>
                  <div className="space-y-2 text-sm mb-5">
                    {[['消灭僵尸', `${state.totalKills}`],
                      ['答题正确率', `${state.wordsAnswered > 0 ? Math.round(state.wordsCorrect / state.wordsAnswered * 100) : 0}% (${state.wordsCorrect}/${state.wordsAnswered})`],
                      ['最终得分', `${state.score}`]
                    ].map(([l, v], i) => (
                      <div key={i} className="flex justify-between rounded-lg px-3 py-1.5" style={{ background: 'rgba(255,255,255,0.55)' }}>
                        <span style={{ color: '#6D4C41' }}>{l}</span>
                        <span className="font-bold" style={{ color: i === 2 ? '#E65100' : '#3E2723' }}>{v}</span>
                      </div>
                    ))}
                  </div>
                  <button onClick={initGame} className="px-10 py-3 font-bold text-lg rounded-2xl shadow-lg transition-all hover:scale-105 active:scale-95"
                    style={{ background: 'linear-gradient(180deg, #FFD54F, #FFB74D)', color: '#3E2723', boxShadow: '0 6px 24px rgba(255,152,0,0.4)', border: '2px solid rgba(255,255,255,0.4)' }}>
                    再玩一次
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}