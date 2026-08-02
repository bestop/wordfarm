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
  lastSun?: number;
  piercing?: boolean;
  pierceHit?: Set<string>;
}

interface Zombie {
  id: string; type: ZombieType; row: number; x: number;
  hp: number; maxHp: number; speed: number; baseSpeed: number;
  eating: boolean; slowed: boolean; slowTimer: number;
  lastHit: number; animPhase: number; dead: boolean; deathTimer: number;
  armorHp?: number;
  poisonTimer?: number;
  poisonDamage?: number;
  burnTimer?: number;
  burnDamage?: number;
  lastJump?: number;
  lastSummon?: number;
  tunneling?: boolean;
  tunneled?: boolean;
  usedPole?: boolean;
  rowOrig?: number;
}

interface Projectile {
  id: string; row: number; x: number; speed: number;
  damage: number; slow: boolean; active: boolean;
  splash?: boolean; splashRange?: number;
  poison?: boolean; poisonDamage?: number; poisonDuration?: number;
  piercing?: boolean; pierceCount?: number; hitIds?: Set<string>;
  lightning?: boolean; chainCount?: number; chainedIds?: Set<string>;
  aoe?: boolean; aoeRows?: number[];
}

interface LightningBolt {
  id: string; x1: number; y1: number; x2: number; y2: number;
  timer: number; maxTimer: number;
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

interface Particle {
  x: number; y: number; vx: number; vy: number;
  size: number; color: string; alpha: number;
  life: number; maxLife: number; gravity?: number;
}

interface Pickup {
  id: string; x: number; row: number;
  type: 'sun' | 'double' | 'freeze';
  timer: number; maxTimer: number; collected: boolean;
  bobPhase: number; value: number;
}

interface GameState {
  phase: GamePhase;
  sun: number; score: number; wave: number;
  plants: Plant[]; zombies: Zombie[]; projectiles: Projectile[];
  explosions: Explosion[]; floatingTexts: FloatingText[];
  lightningBolts: LightningBolt[];
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
  particles: Particle[];
  pickups: Pickup[];
  doubleDamageEnd: number;
  screenFlash: number;
  screenFlashColor: string;
  waveCountdown: number;
  bestCombo: number;
  wrongWords: Word[];
  quizAnsweredIndex: number;
  sparkleSeed: number;
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

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  r: number | number[],
  fill: boolean, stroke: boolean
) {
  const [tl, tr, br, bl] =
    Array.isArray(r) ? [R(r[0]), R(r[1]), R(r[2]), R(r[3])] : [R(r), R(r), R(r), R(r)];
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
  ctx.lineTo(x + bl, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
  ctx.lineTo(x, y + tl);
  ctx.quadraticCurveTo(x, y, x + tl, y);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

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
  ctx.fillStyle = 'rgba(255,158,170,0.6)';
  ctx.beginPath(); ctx.ellipse(x - s * 0.25, y - s * 0.02 + bob, s * 0.09, s * 0.06, -0.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + s * 0.26, y - s * 0.02 + bob, s * 0.09, s * 0.06, 0.2, 0, Math.PI * 2); ctx.fill();
  // Bigger & more kawaii eyes — bright white sclera, large rounded iris
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath(); ctx.ellipse(x - s * 0.13, y - s * 0.2 + bob, s * 0.15, s * 0.17, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + s * 0.11, y - s * 0.22 + bob, s * 0.13, s * 0.15, 0, 0, Math.PI * 2); ctx.fill();
  // Sclera shine
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath(); ctx.ellipse(x - s * 0.17, y - s * 0.29 + bob, s * 0.065, s * 0.05, -0.3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + s * 0.09, y - s * 0.31 + bob, s * 0.055, s * 0.04, -0.3, 0, Math.PI * 2); ctx.fill();
  // Eyelids — thicker & pastel green
  ctx.fillStyle = 'rgba(85,139,47,0.55)';
  ctx.beginPath(); ctx.ellipse(x - s * 0.13, y - s * 0.29 + bob, s * 0.16, s * 0.055, 0, 0, Math.PI); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + s * 0.11, y - s * 0.31 + bob, s * 0.14, s * 0.045, 0, 0, Math.PI); ctx.fill();
  // Irises — large, round, gradient deep forest-green
  const irG = ctx.createRadialGradient(x - s * 0.07, y - s * 0.2 + bob, 0, x - s * 0.07, y - s * 0.2 + bob, s * 0.09);
  irG.addColorStop(0, '#388E3C'); irG.addColorStop(0.7, '#1B5E20'); irG.addColorStop(1, '#0D3B0F');
  ctx.fillStyle = irG;
  ctx.beginPath(); ctx.arc(x - s * 0.07, y - s * 0.2 + bob, s * 0.09, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = irG;
  ctx.beginPath(); ctx.arc(x + s * 0.145, y - s * 0.22 + bob, s * 0.08, 0, Math.PI * 2); ctx.fill();
  // Pupil highlights — two glints per eye to look shiny
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath(); ctx.arc(x - s * 0.04, y - s * 0.23 + bob, s * 0.045, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + s * 0.175, y - s * 0.25 + bob, s * 0.038, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath(); ctx.arc(x - s * 0.09, y - s * 0.16 + bob, s * 0.018, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + s * 0.12, y - s * 0.18 + bob, s * 0.014, 0, Math.PI * 2); ctx.fill();
  // Tiny pink nose-dot
  ctx.fillStyle = '#E57373';
  ctx.beginPath(); ctx.ellipse(x + s * 0.02, y - s * 0.11 + bob, s * 0.025, s * 0.018, 0, 0, Math.PI * 2); ctx.fill();
  // Cute smile — bigger arc
  ctx.strokeStyle = '#1B5E20'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(x + s * 0.02, y - s * 0.02 + bob, s * 0.12, 0.1, Math.PI - 0.1); ctx.stroke();
  // Tongue — bigger pink circle
  ctx.fillStyle = '#F48FB1';
  ctx.beginPath(); ctx.ellipse(x + s * 0.05, y + s * 0.055 + bob, s * 0.045, s * 0.03, 0.2, 0, Math.PI * 2); ctx.fill();
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

function drawThreepeater(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, anim: number) {
  const bob = Math.sin(anim) * 3;
  // Pot
  const pg = ctx.createLinearGradient(x - s * 0.22, y + s * 0.38, x + s * 0.22, y + s * 0.45);
  pg.addColorStop(0, '#BCAAA4'); pg.addColorStop(0.5, '#A1887F'); pg.addColorStop(1, '#795548');
  ctx.fillStyle = pg;
  ctx.beginPath(); ctx.ellipse(x, y + s * 0.42, s * 0.22, s * 0.08, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#8D6E63';
  ctx.beginPath(); ctx.ellipse(x, y + s * 0.38, s * 0.2, s * 0.04, 0, 0, Math.PI * 2); ctx.fill();
  // Stem
  ctx.fillStyle = '#558B2F';
  ctx.beginPath(); ctx.roundRect(x - s * 0.055, y + s * 0.05, s * 0.11, s * 0.36, 5); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath(); ctx.roundRect(x - s * 0.02, y + s * 0.08, s * 0.04, s * 0.3, 3); ctx.fill();
  // Three heads cluster (left, center, right)
  const heads: Array<[number, number, number]> = [[-s * 0.22, -s * 0.02, -0.12], [0, -s * 0.1 + bob, 0], [s * 0.22, -s * 0.02, 0.12]];
  for (const [ox2, oy2, rot] of heads) {
    const hx = x + ox2; const hy = y + oy2;
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(rot);
    const hg = ctx.createRadialGradient(-s * 0.06, -s * 0.05, s * 0.02, 0, 0, s * 0.2);
    hg.addColorStop(0, '#C5E1A5'); hg.addColorStop(0.3, '#9CCC65'); hg.addColorStop(0.7, '#7CB342'); hg.addColorStop(1, '#33691E');
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.arc(0, 0, s * 0.16, 0, Math.PI * 2); ctx.fill();
    // Eye
    ctx.fillStyle = '#FFF9C4';
    ctx.beginPath(); ctx.ellipse(s * 0.04, -s * 0.02, s * 0.055, s * 0.065, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1B5E20';
    ctx.beginPath(); ctx.arc(s * 0.05, -s * 0.02, s * 0.028, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(s * 0.055, -s * 0.025, s * 0.01, 0, Math.PI * 2); ctx.fill();
    // Mouth/barrel pointing right
    ctx.fillStyle = '#7CB342';
    ctx.beginPath(); ctx.roundRect(s * 0.1, -s * 0.03, s * 0.13, s * 0.06, 3); ctx.fill();
    ctx.fillStyle = '#33691E';
    ctx.beginPath(); ctx.arc(s * 0.24, 0, s * 0.03, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

function drawSpikeRock(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, anim: number, hpRatio: number) {
  const crackLvl = 1 - hpRatio;
  const bob = Math.sin(anim * 2) * 1.5;
  // Ground base
  ctx.fillStyle = '#4E342E';
  ctx.beginPath(); ctx.ellipse(x, y + s * 0.35, s * 0.4, s * 0.08, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#6D4C41';
  ctx.beginPath(); ctx.ellipse(x, y + s * 0.33, s * 0.38, s * 0.06, 0, 0, Math.PI * 2); ctx.fill();
  // Rock body (irregular polygon)
  const rg = ctx.createRadialGradient(x - s * 0.1, y - s * 0.05, s * 0.05, x, y + s * 0.05, s * 0.45);
  rg.addColorStop(0, '#90A4AE'); rg.addColorStop(0.4, '#78909C'); rg.addColorStop(0.8, '#546E7A'); rg.addColorStop(1, '#37474F');
  ctx.fillStyle = rg;
  ctx.beginPath();
  ctx.moveTo(x - s * 0.35, y + s * 0.2 + bob);
  ctx.lineTo(x - s * 0.28, y - s * 0.12 + bob);
  ctx.lineTo(x - s * 0.1, y - s * 0.28 + bob);
  ctx.lineTo(x + s * 0.12, y - s * 0.3 + bob);
  ctx.lineTo(x + s * 0.3, y - s * 0.08 + bob);
  ctx.lineTo(x + s * 0.38, y + s * 0.22 + bob);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#263238'; ctx.lineWidth = 1.5; ctx.stroke();
  // Spikes (sharp triangles)
  ctx.fillStyle = '#CFD8DC';
  for (let i = 0; i < 5; i++) {
    const sx = x - s * 0.25 + i * s * 0.13;
    const sy = y - s * 0.15 - (i === 2 ? s * 0.05 : 0) + bob;
    ctx.beginPath();
    ctx.moveTo(sx - s * 0.04, sy + s * 0.08);
    ctx.lineTo(sx, sy - s * 0.08);
    ctx.lineTo(sx + s * 0.04, sy + s * 0.08);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#455A64'; ctx.lineWidth = 1; ctx.stroke();
  }
  // Damage spikes flash
  const flash = Math.sin(anim * 6) * 0.5 + 0.5;
  ctx.fillStyle = 'rgba(244,67,54,' + (flash * crackLvl * 0.5) + ')';
  ctx.beginPath(); ctx.arc(x, y, s * 0.3, 0, Math.PI * 2); ctx.fill();
  // Cracks
  if (crackLvl > 0.3) {
    ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x - s * 0.2, y - s * 0.2);
    ctx.lineTo(x - s * 0.05, y); ctx.lineTo(x - s * 0.15, y + s * 0.18);
    ctx.moveTo(x + s * 0.08, y - s * 0.18);
    ctx.lineTo(x + s * 0.2, y + s * 0.05); ctx.lineTo(x + s * 0.12, y + s * 0.2);
    ctx.stroke();
  }
}

function drawPepperPult(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, anim: number) {
  const bob = Math.sin(anim * 0.9) * 3;
  const sway = Math.sin(anim * 0.6) * 0.05;
  ctx.save(); ctx.translate(x, y + s * 0.1); ctx.rotate(sway); ctx.translate(-x, -y - s * 0.1);
  // Pot
  const pg = ctx.createLinearGradient(x - s * 0.22, y + s * 0.38, x + s * 0.22, y + s * 0.45);
  pg.addColorStop(0, '#BCAAA4'); pg.addColorStop(0.5, '#A1887F'); pg.addColorStop(1, '#795548');
  ctx.fillStyle = pg;
  ctx.beginPath(); ctx.ellipse(x, y + s * 0.42, s * 0.22, s * 0.08, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#8D6E63';
  ctx.beginPath(); ctx.ellipse(x, y + s * 0.38, s * 0.2, s * 0.04, 0, 0, Math.PI * 2); ctx.fill();
  // Thick stem
  ctx.fillStyle = '#4A148C';
  ctx.beginPath(); ctx.roundRect(x - s * 0.045, y + s * 0.05, s * 0.09, s * 0.34, 4); ctx.fill();
  // Leaf
  ctx.fillStyle = '#7B1FA2';
  ctx.save(); ctx.translate(x + s * 0.05, y + s * 0.22); ctx.rotate(0.5);
  ctx.beginPath(); ctx.ellipse(0, 0, s * 0.16, s * 0.06, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  // Catapult bucket holding peppers
  ctx.save(); ctx.translate(x, y - s * 0.2 + bob);
  // Arm
  ctx.strokeStyle = '#6D4C41'; ctx.lineWidth = s * 0.05; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, s * 0.15); ctx.quadraticCurveTo(-s * 0.05, -s * 0.05, -s * 0.18, -s * 0.15); ctx.stroke();
  ctx.fillStyle = '#5D4037';
  // Bucket
  ctx.save(); ctx.translate(-s * 0.2, -s * 0.18); ctx.rotate(-0.6);
  ctx.fillStyle = '#795548';
  ctx.beginPath(); ctx.moveTo(-s * 0.12, -s * 0.05); ctx.lineTo(s * 0.12, -s * 0.05);
  ctx.lineTo(s * 0.09, s * 0.1); ctx.lineTo(-s * 0.09, s * 0.1); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#3E2723'; ctx.lineWidth = 1.5; ctx.stroke();
  // Two peppers
  const peppers: Array<[number, number, number]> = [[-s * 0.04, -s * 0.02, -0.2], [s * 0.04, -s * 0.01, 0.2]];
  for (const [px, py, pr] of peppers) {
    ctx.save(); ctx.translate(px, py); ctx.rotate(pr);
    const pgr = ctx.createLinearGradient(0, -s * 0.05, 0, s * 0.07);
    pgr.addColorStop(0, '#FF8A80'); pgr.addColorStop(0.3, '#FF5252'); pgr.addColorStop(0.7, '#E53935'); pgr.addColorStop(1, '#B71C1C');
    ctx.fillStyle = pgr;
    ctx.beginPath(); ctx.ellipse(0, 0, s * 0.03, s * 0.06, 0, 0, Math.PI * 2); ctx.fill();
    // Stem
    ctx.fillStyle = '#2E7D32';
    ctx.beginPath(); ctx.ellipse(0, -s * 0.055, s * 0.008, s * 0.015, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  ctx.restore(); ctx.restore();
  // Fire particles below catapult
  ctx.fillStyle = 'rgba(255,112,67,' + (0.3 + Math.sin(anim * 5) * 0.3) + ')';
  for (let i = 0; i < 3; i++) {
    const fx = x - s * 0.25 + Math.sin(anim * 3 + i) * s * 0.05;
    const fy = y - s * 0.28 + Math.cos(anim * 3 + i * 1.3) * s * 0.03 + bob;
    ctx.beginPath(); ctx.arc(fx, fy, s * 0.012, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawLightningReed(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, anim: number) {
  const sway = Math.sin(anim * 1.2) * 0.08;
  const flash = Math.sin(anim * 8) * 0.5 + 0.5;
  ctx.save(); ctx.translate(x, y + s * 0.1); ctx.rotate(sway); ctx.translate(-x, -y - s * 0.1);
  // Base water/pond
  ctx.fillStyle = '#311B92';
  ctx.beginPath(); ctx.ellipse(x, y + s * 0.4, s * 0.3, s * 0.07, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(103,58,183,' + (0.5 + flash * 0.3) + ')';
  ctx.beginPath(); ctx.ellipse(x, y + s * 0.38, s * 0.27, s * 0.05, 0, 0, Math.PI * 2); ctx.fill();
  // Reed stalks (3 tall)
  const stalks: Array<[number, number]> = [[-s * 0.1, s * 0.02], [0, 0], [s * 0.1, s * 0.015]];
  for (const [sx, extraH] of stalks) {
    const bx = x + sx;
    // Gradient purple stalk
    const sgg = ctx.createLinearGradient(bx - s * 0.02, 0, bx + s * 0.02, 0);
    sgg.addColorStop(0, '#4A148C'); sgg.addColorStop(0.5, '#9C27B0'); sgg.addColorStop(1, '#4A148C');
    ctx.fillStyle = sgg;
    ctx.beginPath(); ctx.roundRect(bx - s * 0.02, y + s * 0.05 - extraH, s * 0.04, s * 0.36 + extraH, 2); ctx.fill();
    // Nodes
    ctx.fillStyle = '#7B1FA2';
    for (let n = 0; n < 3; n++) {
      const ny = y + s * 0.12 + n * s * 0.1 - extraH;
      ctx.beginPath(); ctx.ellipse(bx, ny, s * 0.025, s * 0.01, 0, 0, Math.PI * 2); ctx.fill();
    }
    // Top bulb/tip glowing with electricity
    const tipY = y + s * 0.02 - extraH;
    const tg = ctx.createRadialGradient(bx, tipY, 0, bx, tipY, s * 0.06);
    tg.addColorStop(0, '#E1BEE7'); tg.addColorStop(0.3, '#CE93D8'); tg.addColorStop(0.6, '#AB47BC');
    tg.addColorStop(0.85, 'rgba(171,71,188,0.3)'); tg.addColorStop(1, 'rgba(171,71,188,0)');
    ctx.fillStyle = tg;
    ctx.beginPath(); ctx.arc(bx, tipY, s * 0.06, 0, Math.PI * 2); ctx.fill();
    // Electric arcs
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.6 + flash * 0.4) + ')';
    ctx.lineWidth = 1.2; ctx.lineCap = 'round';
    ctx.beginPath();
    let ax = bx; let ay = tipY - s * 0.04;
    for (let s2 = 0; s2 < 4; s2++) {
      ax += (Math.random() - 0.5) * s * 0.04;
      ay -= s * 0.025;
      ctx.lineTo(ax, ay);
    }
    ctx.stroke();
  }
  // Central big arc between tallest reeds
  ctx.strokeStyle = 'rgba(224,64,251,' + (0.5 + flash * 0.5) + ')';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  let ax = x - s * 0.1; let ay = y;
  ctx.moveTo(ax, ay);
  for (let s2 = 0; s2 < 5; s2++) {
    ax += s * 0.04; ay = y - s * 0.15 + (Math.random() - 0.5) * s * 0.08;
    ctx.lineTo(ax, ay);
  }
  ctx.stroke();
  // Random sparkles
  ctx.fillStyle = 'rgba(255,215,64,' + (0.5 + flash * 0.5) + ')';
  for (let i = 0; i < 4; i++) {
    const fx = x + (Math.random() - 0.5) * s * 0.5;
    const fy = y - s * 0.05 + (Math.random() - 0.5) * s * 0.2;
    ctx.beginPath(); ctx.arc(fx, fy, s * 0.01, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
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
    case 'threepeater': drawThreepeater(ctx, x, y, s, animPhase); break;
    case 'spikerock': drawSpikeRock(ctx, x, y, s, animPhase, hpRatio); break;
    case 'pepperpult': drawPepperPult(ctx, x, y, s, animPhase); break;
    case 'lightningreed': drawLightningReed(ctx, x, y, s, animPhase); break;
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
  // Eyes — Kawaii: big white sclera + large dark sparkle irises
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath(); ctx.ellipse(-s * 0.095, -s * 0.04, s * 0.095, s * 0.12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(s * 0.095, -s * 0.02, s * 0.085, s * 0.11, 0.1, 0, Math.PI * 2); ctx.fill();
  // Soft outer outline on sclera
  ctx.strokeStyle = 'rgba(62,39,35,0.15)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(-s * 0.095, -s * 0.04, s * 0.095, s * 0.12, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(s * 0.095, -s * 0.02, s * 0.085, s * 0.11, 0.1, 0, Math.PI * 2); ctx.stroke();
  // Big kawaii iris with gradient — dark brown instead of red
  const ziG = ctx.createRadialGradient(-s * 0.085, -s * 0.035, 0, -s * 0.085, -s * 0.035, s * 0.065);
  ziG.addColorStop(0, '#5D4037'); ziG.addColorStop(0.7, '#3E2723'); ziG.addColorStop(1, '#1A0E0A');
  ctx.fillStyle = ziG;
  ctx.beginPath(); ctx.arc(-s * 0.085, -s * 0.035, s * 0.06, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = ziG;
  ctx.beginPath(); ctx.arc(s * 0.105, -s * 0.015, s * 0.052, 0, Math.PI * 2); ctx.fill();
  // Dual highlights per eye for sparkle
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath(); ctx.arc(-s * 0.065, -s * 0.06, s * 0.028, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(s * 0.125, -s * 0.04, s * 0.022, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath(); ctx.arc(-s * 0.105, -s * 0.01, s * 0.014, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(s * 0.085, s * 0.01, s * 0.011, 0, Math.PI * 2); ctx.fill();
  // Soft eyelids — pastel skin instead of dark
  ctx.fillStyle = 'rgba(122,159,58,0.5)';
  ctx.beginPath(); ctx.ellipse(-s * 0.095, -s * 0.11, s * 0.105, s * 0.035, 0, 0, Math.PI); ctx.fill();
  ctx.beginPath(); ctx.ellipse(s * 0.095, -s * 0.09, s * 0.095, s * 0.03, 0.05, 0, Math.PI); ctx.fill();
  // Cheek blush — pastel pink on green skin, very cute
  ctx.fillStyle = 'rgba(255,182,193,0.55)';
  ctx.beginPath(); ctx.ellipse(-s * 0.2, s * 0.08, s * 0.055, s * 0.035, -0.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(s * 0.2, s * 0.1, s * 0.055, s * 0.035, 0.2, 0, Math.PI * 2); ctx.fill();
  // Small rounded tongue smile instead of big teeth mouth — kawaii
  ctx.fillStyle = '#3E2723';
  ctx.beginPath(); ctx.ellipse(s * 0.02, s * 0.12, s * 0.085, s * 0.055, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#F48FB1';
  ctx.beginPath(); ctx.ellipse(s * 0.03, s * 0.145, s * 0.05, s * 0.028, 0, 0, Math.PI * 2); ctx.fill();
  // Tiny cute teeth line (top only)
  ctx.fillStyle = '#FFF8E1';
  ctx.beginPath(); ctx.roundRect(-s * 0.03, s * 0.085, s * 0.015, s * 0.022, 1); ctx.fill();
  ctx.beginPath(); ctx.roundRect(-s * 0.005, s * 0.085, s * 0.015, s * 0.022, 1); ctx.fill();
  ctx.beginPath(); ctx.roundRect(s * 0.02, s * 0.085, s * 0.015, s * 0.022, 1); ctx.fill();
  // Soft stubble removed — instead tiny heart dot
  ctx.fillStyle = 'rgba(255,154,173,0.55)';
  ctx.beginPath(); ctx.arc(-s * 0.06, s * 0.2, s * 0.01, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(s * 0.05, s * 0.22, s * 0.008, 0, Math.PI * 2); ctx.fill();
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
  } else if (zombie.type === 'runner') {
    // Speed trail
    for (let t = 0; t < 3; t++) {
      ctx.fillStyle = `rgba(255,152,0,${0.25 - t * 0.07})`;
      ctx.beginPath();
      ctx.ellipse(zombie.x - s * 0.15 * (t + 1), zy + s * 0.15 + b, s * 0.12, s * 0.03, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Sneakers (red boots with white stripes)
    ctx.fillStyle = '#C62828';
    ctx.beginPath(); ctx.roundRect(zombie.x - s * 0.14, zy + s * 0.2 + b, s * 0.12, s * 0.08, 3); ctx.fill();
    ctx.beginPath(); ctx.roundRect(zombie.x + s * 0.02, zy + s * 0.2 + b, s * 0.12, s * 0.08, 3); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(zombie.x - s * 0.14, zy + s * 0.23 + b, s * 0.12, s * 0.018);
    ctx.fillRect(zombie.x + s * 0.02, zy + s * 0.23 + b, s * 0.12, s * 0.018);
    // Visor (athlete headband)
    ctx.fillStyle = '#EF6C00';
    ctx.fillRect(zombie.x - s * 0.18, zy - s * 0.42 + b, s * 0.36, s * 0.05);
    ctx.fillStyle = '#FFF3E0';
    ctx.beginPath(); ctx.ellipse(zombie.x + s * 0.18, zy - s * 0.37 + b, s * 0.04, s * 0.025, 0, 0, Math.PI * 2); ctx.fill();
    // Number on chest
    ctx.fillStyle = '#FFD54F';
    ctx.font = `bold ${s * 0.1}px sans-serif`; ctx.textAlign = 'center';
    ctx.fillText('08', zombie.x, zy - s * 0.02 + b);
  } else if (zombie.type === 'polehope') {
    if (!zombie.usedPole) {
      // Vaulting pole (long red/white)
      ctx.save();
      const poleAngle = zombie.lastJump ? -0.3 : Math.sin(zombie.animPhase) * 0.1 - 0.7;
      ctx.translate(zombie.x, zy + s * 0.05 + b); ctx.rotate(poleAngle);
      // Pole body
      ctx.strokeStyle = '#FBC02D'; ctx.lineWidth = s * 0.04; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(s * 0.65, -s * 0.5); ctx.stroke();
      // Stripes
      ctx.strokeStyle = '#C62828'; ctx.lineWidth = s * 0.04;
      ctx.setLineDash([s * 0.06, s * 0.04]);
      ctx.beginPath(); ctx.moveTo(s * 0.1, -s * 0.05); ctx.lineTo(s * 0.62, -s * 0.48); ctx.stroke();
      ctx.setLineDash([]);
      // Tip point
      ctx.fillStyle = '#37474F';
      ctx.beginPath(); ctx.arc(s * 0.66, -s * 0.5, s * 0.025, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // Leotard (vaulting uniform, blue)
    ctx.fillStyle = '#1565C0';
    ctx.beginPath(); ctx.ellipse(zombie.x, zy + s * 0.08 + b, s * 0.12, s * 0.15, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#E3F2FD';
    ctx.fillRect(zombie.x - s * 0.02, zy + s * 0.02 + b, s * 0.04, s * 0.12);
  } else if (zombie.type === 'screendoor') {
    // Screen door (in front, left side of zombie)
    const sx = zombie.x - s * 0.18;
    const doorW = s * 0.25; const doorH = s * 0.55;
    // Door frame (wood)
    const dg = ctx.createLinearGradient(sx - doorW / 2, 0, sx + doorW / 2, 0);
    dg.addColorStop(0, '#6D4C41'); dg.addColorStop(0.5, '#8D6E63'); dg.addColorStop(1, '#5D4037');
    ctx.fillStyle = dg;
    ctx.beginPath(); ctx.roundRect(sx - doorW / 2, zy - s * 0.35 + b, doorW, doorH, 2); ctx.fill();
    // Mesh screen (transparent)
    ctx.fillStyle = 'rgba(207,216,220,0.45)';
    ctx.fillRect(sx - doorW / 2 + s * 0.02, zy - s * 0.33 + b, doorW - s * 0.04, doorH - s * 0.04);
    // Grid lines
    ctx.strokeStyle = 'rgba(96,125,139,0.7)'; ctx.lineWidth = 0.7;
    for (let g = 1; g < 4; g++) {
      const gy = zy - s * 0.33 + b + (doorH - s * 0.04) * g / 4;
      ctx.beginPath(); ctx.moveTo(sx - doorW / 2 + s * 0.02, gy); ctx.lineTo(sx + doorW / 2 - s * 0.02, gy); ctx.stroke();
    }
    for (let g2 = 1; g2 < 3; g2++) {
      const gx = sx - doorW / 2 + s * 0.02 + (doorW - s * 0.04) * g2 / 3;
      ctx.beginPath(); ctx.moveTo(gx, zy - s * 0.33 + b); ctx.lineTo(gx, zy - s * 0.33 + b + doorH - s * 0.04); ctx.stroke();
    }
    // Handle
    ctx.fillStyle = '#37474F';
    ctx.beginPath(); ctx.arc(sx + doorW / 2 - s * 0.04, zy + s * 0.05 + b, s * 0.018, 0, Math.PI * 2); ctx.fill();
    // Door HP indicator (scratch marks if damaged)
    if (zombie.armorHp && zombie.armorHp < 300) {
      ctx.strokeStyle = 'rgba(20,20,20,0.6)'; ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(sx - doorW / 2 + s * 0.04, zy - s * 0.25 + b);
      ctx.lineTo(sx + doorW / 2 - s * 0.05, zy + s * 0.12 + b);
      ctx.moveTo(sx, zy - s * 0.2 + b); ctx.lineTo(sx + doorW / 3, zy + s * 0.15 + b);
      ctx.stroke();
    }
  } else if (zombie.type === 'wizard') {
    // Glow aura
    const ag = ctx.createRadialGradient(zombie.x, zy + b, 0, zombie.x, zy + b, s * 0.5);
    ag.addColorStop(0, 'rgba(186,104,200,0.4)');
    ag.addColorStop(0.5, 'rgba(123,31,162,0.15)');
    ag.addColorStop(1, 'rgba(123,31,162,0)');
    ctx.fillStyle = ag;
    ctx.beginPath(); ctx.arc(zombie.x, zy + b, s * 0.5, 0, Math.PI * 2); ctx.fill();
    // Robe (purple wizard cloak)
    const rg = ctx.createLinearGradient(zombie.x, zy + s * 0.1 + b, zombie.x, zy + s * 0.35 + b);
    rg.addColorStop(0, '#7B1FA2'); rg.addColorStop(1, '#4A148C');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.moveTo(zombie.x - s * 0.25, zy + s * 0.35 + b);
    ctx.quadraticCurveTo(zombie.x - s * 0.2, zy - s * 0.02 + b, zombie.x - s * 0.13, zy - s * 0.15 + b);
    ctx.lineTo(zombie.x + s * 0.13, zy - s * 0.15 + b);
    ctx.quadraticCurveTo(zombie.x + s * 0.2, zy - s * 0.02 + b, zombie.x + s * 0.25, zy + s * 0.35 + b);
    ctx.closePath(); ctx.fill();
    // Stars on robe
    ctx.fillStyle = '#FFEB3B';
    for (let i = 0; i < 4; i++) {
      const starX = zombie.x - s * 0.12 + (i % 2) * s * 0.22;
      const starY = zy + s * 0.05 + Math.floor(i / 2) * s * 0.15 + b;
      ctx.font = `${s * 0.07}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('★', starX, starY);
    }
    // Pointed wizard hat
    ctx.fillStyle = '#4A148C';
    ctx.beginPath();
    ctx.moveTo(zombie.x, zy - s * 0.9 + b);
    ctx.lineTo(zombie.x - s * 0.22, zy - s * 0.45 + b); ctx.lineTo(zombie.x + s * 0.22, zy - s * 0.45 + b); ctx.closePath(); ctx.fill();
    // Hat band with moon
    ctx.fillStyle = '#FFD54F'; ctx.fillRect(zombie.x - s * 0.23, zy - s * 0.46 + b, s * 0.46, s * 0.03);
    ctx.fillStyle = '#4A148C';
    ctx.beginPath(); ctx.arc(zombie.x + s * 0.12, zy - s * 0.44 + b, s * 0.015, 0, Math.PI * 2); ctx.fill();
    // Wand (raised in right hand)
    ctx.save();
    const wandWave = Math.sin(zombie.animPhase * 2) * 0.15;
    ctx.translate(zombie.x + s * 0.15, zy + s * 0.05 + b); ctx.rotate(-0.8 + wandWave);
    ctx.strokeStyle = '#5D4037'; ctx.lineWidth = s * 0.035; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -s * 0.3); ctx.stroke();
    // Wand crystal
    const cg2 = ctx.createRadialGradient(0, -s * 0.32, 0, 0, -s * 0.32, s * 0.06);
    cg2.addColorStop(0, '#F8BBD0'); cg2.addColorStop(0.5, '#E040FB'); cg2.addColorStop(1, 'rgba(224,64,251,0)');
    ctx.fillStyle = cg2;
    ctx.beginPath(); ctx.arc(0, -s * 0.32, s * 0.06, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#EA80FC';
    ctx.beginPath(); ctx.arc(0, -s * 0.32, s * 0.025, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  } else if (zombie.type === 'miner') {
    // Miner helmet with lamp
    ctx.fillStyle = '#FFC107';
    ctx.beginPath(); ctx.ellipse(zombie.x, zy - s * 0.4 + b, s * 0.18, s * 0.08, 0, Math.PI, 0); ctx.fill();
    ctx.fillRect(zombie.x - s * 0.2, zy - s * 0.4 + b, s * 0.4, s * 0.03);
    // Lamp
    const lg = ctx.createRadialGradient(zombie.x - s * 0.15, zy - s * 0.48 + b, 0, zombie.x - s * 0.15, zy - s * 0.48 + b, s * 0.08);
    lg.addColorStop(0, '#FFF176'); lg.addColorStop(0.5, '#FFD54F'); lg.addColorStop(1, 'rgba(255,213,79,0)');
    ctx.fillStyle = lg;
    ctx.beginPath(); ctx.arc(zombie.x - s * 0.15, zy - s * 0.48 + b, s * 0.08, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#795548';
    ctx.beginPath(); ctx.roundRect(zombie.x - s * 0.2, zy - s * 0.5 + b, s * 0.1, s * 0.06, 2); ctx.fill();
    // Light beam
    ctx.fillStyle = 'rgba(255,235,59,0.15)';
    ctx.beginPath();
    ctx.moveTo(zombie.x - s * 0.15, zy - s * 0.48 + b);
    ctx.lineTo(zombie.x - s * 0.7, zy - s * 0.2 + b);
    ctx.lineTo(zombie.x - s * 0.7, zy + s * 0.15 + b);
    ctx.closePath(); ctx.fill();
    // Overalls (denim blue)
    ctx.fillStyle = '#3949AB';
    ctx.beginPath(); ctx.roundRect(zombie.x - s * 0.15, zy - s * 0.02 + b, s * 0.3, s * 0.3, 3); ctx.fill();
    // Bib straps
    ctx.fillRect(zombie.x - s * 0.1, zy - s * 0.18 + b, s * 0.04, s * 0.18);
    ctx.fillRect(zombie.x + s * 0.06, zy - s * 0.18 + b, s * 0.04, s * 0.18);
    // Buttons
    ctx.fillStyle = '#FFD54F';
    ctx.beginPath(); ctx.arc(zombie.x - s * 0.08, zy - s * 0.16 + b, s * 0.015, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(zombie.x + s * 0.08, zy - s * 0.16 + b, s * 0.015, 0, Math.PI * 2); ctx.fill();
    // Pickaxe (in hand)
    ctx.save();
    ctx.translate(zombie.x + s * 0.18, zy + s * 0.1 + b);
    ctx.rotate(Math.sin(zombie.animPhase) * 0.2 + 0.6);
    // Handle
    ctx.strokeStyle = '#6D4C41'; ctx.lineWidth = s * 0.04; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(s * 0.25, -s * 0.15); ctx.stroke();
    // Pick head
    ctx.fillStyle = '#607D8B';
    ctx.beginPath();
    ctx.moveTo(s * 0.22, -s * 0.22); ctx.lineTo(s * 0.35, -s * 0.05);
    ctx.lineTo(s * 0.28, -s * 0.08); ctx.lineTo(s * 0.18, -s * 0.2); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#455A64';
    ctx.beginPath();
    ctx.moveTo(s * 0.22, -s * 0.22); ctx.lineTo(s * 0.08, -s * 0.38);
    ctx.lineTo(s * 0.15, -s * 0.28); ctx.lineTo(s * 0.28, -s * 0.18); ctx.closePath();
    ctx.fill();
    ctx.restore();
  } else if (zombie.type === 'flame') {
    // Fire aura
    const fg = ctx.createRadialGradient(zombie.x, zy + b, s * 0.1, zombie.x, zy + b, s * 0.5);
    fg.addColorStop(0, 'rgba(255,87,34,0.35)'); fg.addColorStop(0.5, 'rgba(255,152,0,0.15)'); fg.addColorStop(1, 'rgba(255,152,0,0)');
    ctx.fillStyle = fg;
    ctx.beginPath(); ctx.arc(zombie.x, zy + b, s * 0.5, 0, Math.PI * 2); ctx.fill();
    // Flames around body (dancing)
    for (let i = 0; i < 5; i++) {
      const fx = zombie.x - s * 0.18 + i * s * 0.09;
      const baseY = zy + s * 0.2 + b;
      const flameH = s * 0.15 + Math.sin(zombie.animPhase * 3 + i) * s * 0.05;
      const ffg = ctx.createLinearGradient(0, baseY, 0, baseY - flameH);
      ffg.addColorStop(0, 'rgba(255,235,59,0.9)'); ffg.addColorStop(0.5, 'rgba(255,152,0,0.8)'); ffg.addColorStop(1, 'rgba(244,67,54,0)');
      ctx.fillStyle = ffg;
      ctx.beginPath();
      ctx.moveTo(fx - s * 0.04, baseY);
      ctx.quadraticCurveTo(fx, baseY - flameH - s * 0.03, fx + s * 0.04, baseY);
      ctx.closePath(); ctx.fill();
    }
    // Asbestos suit (silver fireman)
    const sg2 = ctx.createLinearGradient(zombie.x - s * 0.18, 0, zombie.x + s * 0.18, 0);
    sg2.addColorStop(0, '#90A4AE'); sg2.addColorStop(0.5, '#CFD8DC'); sg2.addColorStop(1, '#90A4AE');
    ctx.fillStyle = sg2;
    ctx.beginPath(); ctx.roundRect(zombie.x - s * 0.18, zy - s * 0.15 + b, s * 0.36, s * 0.42, 4); ctx.fill();
    // Reflective stripes (orange)
    ctx.fillStyle = '#FF6F00';
    ctx.fillRect(zombie.x - s * 0.18, zy + s * 0.02 + b, s * 0.36, s * 0.04);
    ctx.fillRect(zombie.x - s * 0.18, zy + s * 0.18 + b, s * 0.36, s * 0.04);
    // Oxygen tank on back
    ctx.fillStyle = '#455A64';
    ctx.beginPath(); ctx.roundRect(zombie.x - s * 0.25, zy - s * 0.1 + b, s * 0.08, s * 0.3, 3); ctx.fill();
    ctx.beginPath(); ctx.roundRect(zombie.x + s * 0.17, zy - s * 0.1 + b, s * 0.08, s * 0.3, 3); ctx.fill();
    ctx.fillStyle = '#F44336';
    ctx.beginPath(); ctx.arc(zombie.x - s * 0.21, zy - s * 0.12 + b, s * 0.015, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(zombie.x + s * 0.21, zy - s * 0.12 + b, s * 0.015, 0, Math.PI * 2); ctx.fill();
    // Fire helmet (dark red)
    ctx.fillStyle = '#B71C1C';
    ctx.beginPath(); ctx.ellipse(zombie.x, zy - s * 0.42 + b, s * 0.2, s * 0.09, 0, Math.PI, 0); ctx.fill();
    ctx.fillRect(zombie.x - s * 0.22, zy - s * 0.42 + b, s * 0.44, s * 0.035);
    // Face shield
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.roundRect(zombie.x - s * 0.14, zy - s * 0.45 + b, s * 0.28, s * 0.18, 3); ctx.fill();
    ctx.strokeStyle = '#FFD54F'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(zombie.x - s * 0.14, zy - s * 0.36 + b); ctx.lineTo(zombie.x + s * 0.14, zy - s * 0.36 + b); ctx.stroke();
  }

  // Fire burn effect
  if (zombie.burnTimer && zombie.burnTimer > 0 && !zombie.dead) {
    ctx.fillStyle = 'rgba(255,112,67,0.2)';
    ctx.beginPath(); ctx.arc(zombie.x, zy + bob, s * 0.35, 0, Math.PI * 2); ctx.fill();
    // Small fire sparks
    for (let i = 0; i < 3; i++) {
      const sp = zombie.animPhase * 3 + i * 2;
      ctx.fillStyle = `rgba(255,193,7,${0.5 + Math.sin(sp) * 0.4})`;
      ctx.beginPath();
      ctx.arc(zombie.x + Math.cos(sp) * s * 0.2, zy + bob - s * 0.25 - (Math.sin(sp) * 0.5 + 0.5) * s * 0.1, s * 0.012, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Poison effect
  if (zombie.poisonTimer && zombie.poisonTimer > 0 && !zombie.dead) {
    ctx.fillStyle = 'rgba(139,195,74,0.2)';
    ctx.beginPath(); ctx.arc(zombie.x, zy + bob, s * 0.35, 0, Math.PI * 2); ctx.fill();
    // Bubbles
    for (let i = 0; i < 3; i++) {
      const sp = zombie.animPhase * 2 + i * 1.7;
      ctx.fillStyle = `rgba(174,213,129,${0.4 + Math.sin(sp) * 0.3})`;
      ctx.beginPath();
      ctx.arc(zombie.x + Math.sin(sp) * s * 0.15, zy + bob - s * 0.1 - (Math.sin(sp) * 0.5 + 0.5) * s * 0.2, s * 0.015, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (zombie.slowed && !zombie.dead) {
    ctx.fillStyle = 'rgba(100,220,255,0.12)';
    ctx.beginPath(); ctx.arc(zombie.x, zy + bob, s * 0.35, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ============ Game Effect Helpers ============
function spawnParticles(state: GameState, x: number, y: number, color: string, count: number) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 40 + Math.random() * 120;
    state.particles.push({
      x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 40,
      size: 2 + Math.random() * 4, color, alpha: 1,
      life: 500 + Math.random() * 700, maxLife: 1200,
      gravity: 100,
    });
  }
}

function spawnZombieDeathParticles(state: GameState, x: number, y: number, cellW: number) {
  const colors = ['#9EC05A', '#7BAFD4', '#5D4037', '#8D6E63', '#FFD54F'];
  for (let i = 0; i < 15; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 30 + Math.random() * 100;
    state.particles.push({
      x: x + (Math.random() - 0.5) * cellW * 0.15, y: y - cellW * 0.1,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 60,
      size: 2 + Math.random() * 4, color: colors[Math.floor(Math.random() * colors.length)],
      alpha: 1, life: 400 + Math.random() * 500, maxLife: 900,
      gravity: 150,
    });
  }
}

function trySpawnDrop(state: GameState, zombie: Zombie, cellW: number) {
  let dropChance = 0.2;
  if (zombie.type === 'cone') dropChance = 0.3;
  if (zombie.type === 'bucket') dropChance = 0.4;
  if (zombie.type === 'flag') dropChance = 0.55;
  if (Math.random() < dropChance) {
    const typeRand = Math.random();
    let type: Pickup['type'] = 'sun';
    let value = 25 + Math.floor(Math.random() * 20);
    if (zombie.type === 'bucket' || zombie.type === 'flag') value = 35 + Math.floor(Math.random() * 25);
    if (typeRand > 0.85) { type = 'double'; value = 0; }
    else if (typeRand > 0.7) { type = 'freeze'; value = 0; }
    state.pickups.push({
      id: uid(), x: zombie.x, row: zombie.row,
      type, timer: 8000, maxTimer: 8000, collected: false,
      bobPhase: Math.random() * Math.PI * 2, value,
    });
  }
}

function collectPickup(state: GameState, pk: Pickup, cellW: number, cellH: number, ox: number, oy: number) {
  pk.collected = true;
  const py = oy + pk.row * cellH + cellH / 2;
  if (pk.type === 'sun') {
    state.sun += pk.value;
    state.score += pk.value;
    state.floatingTexts.push({ id: uid(), x: pk.x, y: py, text: `+${pk.value}☀️`, color: '#FFD54F', timer: 1000, maxTimer: 1000 });
  } else if (pk.type === 'double') {
    state.doubleDamageEnd = Date.now() + 6000;
    state.floatingTexts.push({ id: uid(), x: pk.x, y: py, text: '⚡双倍伤害 6s!', color: '#FF6F00', timer: 1500, maxTimer: 1500 });
  } else if (pk.type === 'freeze') {
    state.zombies.forEach(z => { if (!z.dead) { z.slowed = true; z.slowTimer = 4000; } });
    state.floatingTexts.push({ id: uid(), x: pk.x, y: py, text: '🧊全屏冰冻 4s!', color: '#29B6F6', timer: 1500, maxTimer: 1500 });
  }
  spawnParticles(state, pk.x, py, pk.type === 'sun' ? '#FFD54F' : pk.type === 'double' ? '#FF6F00' : '#29B6F6', 15);
}

// ============ Kawaii SVG Icons ============
// 状态栏萌系图标（无 emoji，纯 SVG）
const IconSun: React.FC<{ size?: number }> = ({ size = 22 }) => (
  <svg viewBox="0 0 32 32" width={size} height={size} style={{ display: 'block' }}>
    <defs>
      <radialGradient id="isun" cx="40%" cy="38%" r="65%">
        <stop offset="0%" stopColor="#FFF9C4"/>
        <stop offset="65%" stopColor="#FFD54F"/>
        <stop offset="100%" stopColor="#F5C43C"/>
      </radialGradient>
    </defs>
    {/* 柔和光晕 */}
    <circle cx="16" cy="16" r="14" fill="#FFF3B0" opacity="0.45"/>
    {/* 射线（圆角）*/}
    <g stroke="#F5C43C" strokeWidth="2.4" strokeLinecap="round" opacity="0.85">
      <line x1="16" y1="1.5" x2="16" y2="5"/>
      <line x1="16" y1="27" x2="16" y2="30.5"/>
      <line x1="1.5" y1="16" x2="5" y2="16"/>
      <line x1="27" y1="16" x2="30.5" y2="16"/>
      <line x1="5.5" y1="5.5" x2="8" y2="8"/>
      <line x1="24" y1="24" x2="26.5" y2="26.5"/>
      <line x1="26.5" y1="5.5" x2="24" y2="8"/>
      <line x1="8" y1="24" x2="5.5" y2="26.5"/>
    </g>
    {/* 主体 */}
    <circle cx="16" cy="16" r="9" fill="url(#isun)" stroke="#FFFFFF" strokeWidth="1.8"/>
    {/* 腮红 */}
    <ellipse cx="11.5" cy="18.5" rx="2" ry="1.2" fill="#FFB6C1" opacity="0.8"/>
    <ellipse cx="20.5" cy="18.5" rx="2" ry="1.2" fill="#FFB6C1" opacity="0.8"/>
    {/* 大眼睛 */}
    <circle cx="12.5" cy="14.5" r="2.1" fill="#FFFFFF"/>
    <circle cx="19.5" cy="14.5" r="2.1" fill="#FFFFFF"/>
    <circle cx="13" cy="14.8" r="1.3" fill="#3E2723"/>
    <circle cx="20" cy="14.8" r="1.3" fill="#3E2723"/>
    <circle cx="13.6" cy="14.3" r="0.45" fill="#FFFFFF"/>
    <circle cx="20.6" cy="14.3" r="0.45" fill="#FFFFFF"/>
    {/* 微笑 */}
    <path d="M 13 18.5 Q 16 21 19 18.5" fill="none" stroke="#8B4513" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
);

const IconWave: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} style={{ display: 'block' }}>
    <defs>
      <linearGradient id="iwv" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#C7E9FF"/>
        <stop offset="100%" stopColor="#7AB8E0"/>
      </linearGradient>
    </defs>
    <path d="M 2 15 Q 6 10, 10 15 T 18 15 T 22 15 L 22 21 L 2 21 Z" fill="url(#iwv)" stroke="#FFFFFF" strokeWidth="1.4" strokeLinejoin="round"/>
    <path d="M 2 12 Q 5.5 8, 9 12 T 16 12 T 22 12" fill="none" stroke="#FFFFFF" strokeWidth="1.3" strokeLinecap="round" opacity="0.85"/>
    {/* 泡泡 */}
    <circle cx="6.5" cy="7" r="1.3" fill="#FFFFFF" opacity="0.8"/>
    <circle cx="16" cy="5.5" r="1" fill="#FFFFFF" opacity="0.75"/>
    <circle cx="12" cy="8" r="0.8" fill="#FFFFFF" opacity="0.7"/>
    {/* 小眼睛（浪的萌表情）*/}
    <circle cx="10.5" cy="15.5" r="0.9" fill="#154360"/>
    <circle cx="13.5" cy="15.5" r="0.9" fill="#154360"/>
    <circle cx="10.8" cy="15.3" r="0.3" fill="#FFFFFF"/>
    <circle cx="13.8" cy="15.3" r="0.3" fill="#FFFFFF"/>
    <path d="M 11.2 17.5 Q 12 18.2 12.8 17.5" fill="none" stroke="#154360" strokeWidth="0.6" strokeLinecap="round"/>
  </svg>
);

const IconStar: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} style={{ display: 'block' }}>
    <defs>
      <radialGradient id="ist" cx="40%" cy="35%" r="70%">
        <stop offset="0%" stopColor="#FFFDF0"/>
        <stop offset="60%" stopColor="#FFE066"/>
        <stop offset="100%" stopColor="#F5C43C"/>
      </radialGradient>
    </defs>
    <path d="M12 2.2 L 14.8 8.2 L 21.3 9.1 L 16.7 13.8 L 17.8 20.3 L 12 17.3 L 6.2 20.3 L 7.3 13.8 L 2.7 9.1 L 9.2 8.2 Z"
          fill="url(#ist)" stroke="#FFFFFF" strokeWidth="1.4" strokeLinejoin="round"/>
    {/* 表情 */}
    <ellipse cx="9.5" cy="13" rx="1.3" ry="0.8" fill="#FFB6C1" opacity="0.75"/>
    <ellipse cx="14.5" cy="13" rx="1.3" ry="0.8" fill="#FFB6C1" opacity="0.75"/>
    <circle cx="10.5" cy="11.3" r="1" fill="#5D4037"/>
    <circle cx="13.5" cy="11.3" r="1" fill="#5D4037"/>
    <circle cx="10.8" cy="11" r="0.35" fill="#FFFFFF"/>
    <circle cx="13.8" cy="11" r="0.35" fill="#FFFFFF"/>
    <path d="M 10.8 13.2 Q 12 14.3 13.2 13.2" fill="none" stroke="#5D4037" strokeWidth="0.8" strokeLinecap="round"/>
  </svg>
);

const IconQuiz: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} style={{ display: 'block' }}>
    <rect x="3" y="4" width="18" height="17" rx="4" fill="#FFFFFF" stroke="#9DD5B8" strokeWidth="1.8"/>
    <rect x="3" y="4" width="18" height="5" rx="4" fill="#B5EAD7" stroke="#FFFFFF" strokeWidth="0.8"/>
    {/* 眼睛 */}
    <circle cx="9.5" cy="14.5" r="1" fill="#1B5E20"/>
    <circle cx="14.5" cy="14.5" r="1" fill="#1B5E20"/>
    <circle cx="9.8" cy="14.2" r="0.35" fill="#FFFFFF"/>
    <circle cx="14.8" cy="14.2" r="0.35" fill="#FFFFFF"/>
    {/* 小对号答案 */}
    <path d="M 7 9 L 9.5 11 L 13 7.5" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M 10.5 17.2 Q 12 18.5 13.5 17.2" fill="none" stroke="#1B5E20" strokeWidth="0.8" strokeLinecap="round"/>
    <ellipse cx="8.5" cy="15.5" rx="1.1" ry="0.7" fill="#FFB6C1" opacity="0.6"/>
    <ellipse cx="15.5" cy="15.5" rx="1.1" ry="0.7" fill="#FFB6C1" opacity="0.6"/>
  </svg>
);

const IconPause: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} style={{ display: 'block' }}>
    <circle cx="12" cy="12" r="10.5" fill="#D4C5F9" stroke="#FFFFFF" strokeWidth="1.8"/>
    <circle cx="12" cy="12" r="10.5" fill="none" stroke="#A78BFA" strokeWidth="0.8" opacity="0.6"/>
    <rect x="8" y="7" width="3" height="10" rx="1.5" fill="#FFFFFF"/>
    <rect x="13" y="7" width="3" height="10" rx="1.5" fill="#FFFFFF"/>
    {/* 小表情 */}
    <circle cx="10" cy="5" r="0.8" fill="#5E35B1"/>
    <circle cx="14" cy="5" r="0.8" fill="#5E35B1"/>
  </svg>
);

const IconPlay: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} style={{ display: 'block' }}>
    <circle cx="12" cy="12" r="10.5" fill="#FFD1DC" stroke="#FFFFFF" strokeWidth="1.8"/>
    <circle cx="12" cy="12" r="10.5" fill="none" stroke="#F38BA8" strokeWidth="0.8" opacity="0.6"/>
    <path d="M 10 7.5 L 17.5 12 L 10 16.5 Z" fill="#FFFFFF"/>
    <circle cx="10" cy="5" r="0.8" fill="#D81B60"/>
    <circle cx="14" cy="5" r="0.8" fill="#D81B60"/>
  </svg>
);

// ====== 植物卡片 SVG 图标（纯 SVG，替代 emoji）======
const PlantIcon: Record<string, React.FC<{ size?: number }>> = {
  peashooter: ({ size = 42 }) => (
    <svg viewBox="0 0 56 56" width={size} height={size} style={{ display: 'block' }}>
      <defs>
        <radialGradient id="ppot" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#FFE8A0"/><stop offset="100%" stopColor="#D4A574"/>
        </radialGradient>
        <linearGradient id="phd" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#C5E1A5"/><stop offset="100%" stopColor="#7BC9A6"/></linearGradient>
      </defs>
      {/* 花盆 */}
      <path d="M 16 40 L 40 40 L 37 53 L 19 53 Z" fill="url(#ppot)" stroke="#FFFFFF" strokeWidth="1.6"/>
      <rect x="15" y="37" width="26" height="5" rx="2.5" fill="#BF9C72" stroke="#FFFFFF" strokeWidth="1.4"/>
      {/* 叶子（底）*/}
      <ellipse cx="20" cy="38" rx="6" ry="3" fill="#7BC9A6" transform="rotate(-20 20 38)"/>
      <ellipse cx="36" cy="38" rx="6" ry="3" fill="#7BC9A6" transform="rotate(20 36 38)"/>
      {/* 头（圆脑袋）*/}
      <circle cx="28" cy="24" r="14" fill="url(#phd)" stroke="#FFFFFF" strokeWidth="2"/>
      <circle cx="28" cy="24" r="14" fill="none" stroke="#558B2F" strokeWidth="0.8" opacity="0.6"/>
      {/* 发射炮（嘴）*/}
      <circle cx="42" cy="24" r="6" fill="#AED581" stroke="#FFFFFF" strokeWidth="1.6"/>
      <circle cx="44" cy="24" r="3" fill="#558B2F"/>
      {/* 腮红 */}
      <ellipse cx="21" cy="27" rx="2.5" ry="1.6" fill="#FFB6C1" opacity="0.7"/>
      <ellipse cx="35" cy="27" rx="2.5" ry="1.6" fill="#FFB6C1" opacity="0.7"/>
      {/* 大眼 */}
      <circle cx="24" cy="20" r="3.4" fill="#FFFFFF"/><circle cx="34" cy="20" r="3.4" fill="#FFFFFF"/>
      <circle cx="24.6" cy="20.6" r="2.1" fill="#1B5E20"/><circle cx="34.6" cy="20.6" r="2.1" fill="#1B5E20"/>
      <circle cx="25.4" cy="19.8" r="0.7" fill="#FFFFFF"/><circle cx="35.4" cy="19.8" r="0.7" fill="#FFFFFF"/>
      {/* 微笑 */}
      <path d="M 25 28 Q 28 30 31 28" fill="none" stroke="#1B5E20" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  wallnut: ({ size = 42 }) => (
    <svg viewBox="0 0 56 56" width={size} height={size} style={{ display: 'block' }}>
      <defs><radialGradient id="wal" cx="40%" cy="35%" r="70%">
        <stop offset="0%" stopColor="#FFD5A0"/><stop offset="100%" stopColor="#8D6E63"/>
      </radialGradient></defs>
      {/* 主体（圆润坚果）*/}
      <path d="M 10 30 Q 10 12, 28 12 Q 46 12, 46 30 Q 46 50, 28 50 Q 10 50, 10 30 Z"
            fill="url(#wal)" stroke="#FFFFFF" strokeWidth="2"/>
      {/* 纹路 */}
      <path d="M 28 14 Q 26 30, 28 48" fill="none" stroke="#6D4C41" strokeWidth="1.3" opacity="0.55" strokeLinecap="round"/>
      <path d="M 18 20 Q 22 30, 18 44" fill="none" stroke="#6D4C41" strokeWidth="1" opacity="0.45" strokeLinecap="round"/>
      <path d="M 38 20 Q 34 30, 38 44" fill="none" stroke="#6D4C41" strokeWidth="1" opacity="0.45" strokeLinecap="round"/>
      {/* 腮红 */}
      <ellipse cx="18" cy="36" rx="3" ry="1.8" fill="#FFB6C1" opacity="0.7"/>
      <ellipse cx="38" cy="36" rx="3" ry="1.8" fill="#FFB6C1" opacity="0.7"/>
      {/* 大眼 */}
      <circle cx="22" cy="28" r="3.6" fill="#FFFFFF"/><circle cx="34" cy="28" r="3.6" fill="#FFFFFF"/>
      <circle cx="22.6" cy="28.6" r="2.2" fill="#3E2723"/><circle cx="34.6" cy="28.6" r="2.2" fill="#3E2723"/>
      <circle cx="23.4" cy="27.8" r="0.75" fill="#FFFFFF"/><circle cx="35.4" cy="27.8" r="0.75" fill="#FFFFFF"/>
      {/* 嘴（坚毅一字）*/}
      <path d="M 23 38 Q 28 40 33 38" fill="none" stroke="#3E2723" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  ),
  snowpea: ({ size = 42 }) => (
    <svg viewBox="0 0 56 56" width={size} height={size} style={{ display: 'block' }}>
      <defs>
        <linearGradient id="snp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#B3E5FC"/><stop offset="100%" stopColor="#4FC3F7"/></linearGradient>
      </defs>
      <path d="M 16 40 L 40 40 L 37 53 L 19 53 Z" fill="#D4C4A8" stroke="#FFFFFF" strokeWidth="1.6"/>
      <rect x="15" y="37" width="26" height="5" rx="2.5" fill="#C7E9FF" stroke="#FFFFFF" strokeWidth="1.4"/>
      <ellipse cx="20" cy="38" rx="6" ry="3" fill="#7AB8E0" transform="rotate(-20 20 38)"/>
      <ellipse cx="36" cy="38" rx="6" ry="3" fill="#7AB8E0" transform="rotate(20 36 38)"/>
      <circle cx="28" cy="24" r="14" fill="url(#snp)" stroke="#FFFFFF" strokeWidth="2"/>
      {/* 雪花装饰 */}
      <g stroke="#FFFFFF" strokeWidth="0.9" strokeLinecap="round" opacity="0.75">
        <path d="M 18 14 L 16 12 M 18 14 L 20 12 M 18 14 L 18 12"/><path d="M 18 14 L 17 16 M 18 14 L 19 16"/>
        <path d="M 38 12 L 36 10 M 38 12 L 40 10 M 38 12 L 38 10"/><path d="M 38 12 L 37 14 M 38 12 L 39 14"/>
      </g>
      <circle cx="42" cy="24" r="6" fill="#4FC3F7" stroke="#FFFFFF" strokeWidth="1.6"/>
      <circle cx="44" cy="24" r="3" fill="#0277BD"/>
      <ellipse cx="21" cy="27" rx="2.5" ry="1.6" fill="#B3E5FC" opacity="0.9"/>
      <ellipse cx="35" cy="27" rx="2.5" ry="1.6" fill="#B3E5FC" opacity="0.9"/>
      <circle cx="24" cy="20" r="3.4" fill="#FFFFFF"/><circle cx="34" cy="20" r="3.4" fill="#FFFFFF"/>
      <circle cx="24.6" cy="20.6" r="2.1" fill="#01579B"/><circle cx="34.6" cy="20.6" r="2.1" fill="#01579B"/>
      <circle cx="25.4" cy="19.8" r="0.7" fill="#FFFFFF"/><circle cx="35.4" cy="19.8" r="0.7" fill="#FFFFFF"/>
      <path d="M 25 28 Q 28 30 31 28" fill="none" stroke="#01579B" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  repeater: ({ size = 42 }) => (
    <svg viewBox="0 0 56 56" width={size} height={size} style={{ display: 'block' }}>
      <defs><linearGradient id="rpt" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#A5D6A7"/><stop offset="100%" stopColor="#388E3C"/></linearGradient></defs>
      <path d="M 16 40 L 40 40 L 37 53 L 19 53 Z" fill="#D4A574" stroke="#FFFFFF" strokeWidth="1.6"/>
      <rect x="15" y="37" width="26" height="5" rx="2.5" fill="#689F38" stroke="#FFFFFF" strokeWidth="1.4"/>
      <ellipse cx="20" cy="38" rx="6" ry="3" fill="#558B2F" transform="rotate(-20 20 38)"/>
      <ellipse cx="36" cy="38" rx="6" ry="3" fill="#558B2F" transform="rotate(20 36 38)"/>
      <circle cx="28" cy="24" r="14" fill="url(#rpt)" stroke="#FFFFFF" strokeWidth="2"/>
      {/* 双炮 */}
      <circle cx="43" cy="20" r="4.8" fill="#81C784" stroke="#FFFFFF" strokeWidth="1.5"/>
      <circle cx="44.5" cy="20" r="2.3" fill="#2E7D32"/>
      <circle cx="43" cy="28" r="4.8" fill="#81C784" stroke="#FFFFFF" strokeWidth="1.5"/>
      <circle cx="44.5" cy="28" r="2.3" fill="#2E7D32"/>
      <ellipse cx="21" cy="27" rx="2.5" ry="1.6" fill="#FFB6C1" opacity="0.7"/>
      <ellipse cx="33" cy="27" rx="2.5" ry="1.6" fill="#FFB6C1" opacity="0.7"/>
      <circle cx="24" cy="20" r="3.3" fill="#FFFFFF"/><circle cx="32" cy="20" r="3.3" fill="#FFFFFF"/>
      <circle cx="24.5" cy="20.5" r="2" fill="#1B5E20"/><circle cx="32.5" cy="20.5" r="2" fill="#1B5E20"/>
      <circle cx="25.2" cy="19.7" r="0.7" fill="#FFFFFF"/><circle cx="33.2" cy="19.7" r="0.7" fill="#FFFFFF"/>
      <path d="M 25 28 Q 28 30.5 31 28" fill="none" stroke="#1B5E20" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  threepeater: ({ size = 42 }) => (
    <svg viewBox="0 0 56 56" width={size} height={size} style={{ display: 'block' }}>
      <defs><linearGradient id="tp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#C5E1A5"/><stop offset="100%" stopColor="#689F38"/></linearGradient></defs>
      <path d="M 16 40 L 40 40 L 37 53 L 19 53 Z" fill="#D4A574" stroke="#FFFFFF" strokeWidth="1.6"/>
      <rect x="15" y="37" width="26" height="5" rx="2.5" fill="#8BC34A" stroke="#FFFFFF" strokeWidth="1.4"/>
      <circle cx="28" cy="25" r="13" fill="url(#tp)" stroke="#FFFFFF" strokeWidth="2"/>
      {/* 三炮：上/中/下 */}
      <circle cx="41" cy="14" r="4.5" fill="#9CCC65" stroke="#FFFFFF" strokeWidth="1.3"/>
      <circle cx="42.5" cy="14" r="2.2" fill="#33691E"/>
      <circle cx="43" cy="25" r="4.8" fill="#9CCC65" stroke="#FFFFFF" strokeWidth="1.3"/>
      <circle cx="44.5" cy="25" r="2.3" fill="#33691E"/>
      <circle cx="41" cy="36" r="4.5" fill="#9CCC65" stroke="#FFFFFF" strokeWidth="1.3"/>
      <circle cx="42.5" cy="36" r="2.2" fill="#33691E"/>
      <ellipse cx="21" cy="28" rx="2.3" ry="1.4" fill="#FFB6C1" opacity="0.7"/>
      <ellipse cx="33" cy="28" rx="2.3" ry="1.4" fill="#FFB6C1" opacity="0.7"/>
      <circle cx="24" cy="22" r="3" fill="#FFFFFF"/><circle cx="32" cy="22" r="3" fill="#FFFFFF"/>
      <circle cx="24.4" cy="22.4" r="1.8" fill="#33691E"/><circle cx="32.4" cy="22.4" r="1.8" fill="#33691E"/>
      <circle cx="25.1" cy="21.7" r="0.6" fill="#FFFFFF"/><circle cx="33.1" cy="21.7" r="0.6" fill="#FFFFFF"/>
      <path d="M 25 30 Q 28 32 31 30" fill="none" stroke="#33691E" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  spikerock: ({ size = 42 }) => (
    <svg viewBox="0 0 56 56" width={size} height={size} style={{ display: 'block' }}>
      <defs><linearGradient id="sr" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#B0BEC5"/><stop offset="100%" stopColor="#546E7A"/></linearGradient></defs>
      {/* 石基 */}
      <ellipse cx="28" cy="48" rx="20" ry="5" fill="#455A64" opacity="0.4"/>
      <path d="M 10 46 Q 10 32, 18 30 Q 20 20, 28 20 Q 36 20, 38 30 Q 46 32, 46 46 Q 46 50, 28 50 Q 10 50, 10 46 Z"
            fill="url(#sr)" stroke="#FFFFFF" strokeWidth="1.8"/>
      {/* 尖刺（圆润）*/}
      <path d="M 18 30 Q 19 22, 22 26 Q 24 28, 20 32 Z" fill="#78909C" stroke="#FFFFFF" strokeWidth="1"/>
      <path d="M 28 20 Q 30 10, 34 18 Q 35 22, 31 24 Z" fill="#90A4AE" stroke="#FFFFFF" strokeWidth="1"/>
      <path d="M 38 30 Q 37 22, 34 26 Q 32 28, 36 32 Z" fill="#78909C" stroke="#FFFFFF" strokeWidth="1"/>
      <circle cx="23" cy="37" r="3.2" fill="#FFFFFF"/><circle cx="33" cy="37" r="3.2" fill="#FFFFFF"/>
      <circle cx="23.5" cy="37.6" r="2" fill="#263238"/><circle cx="33.5" cy="37.6" r="2" fill="#263238"/>
      <circle cx="24.2" cy="36.8" r="0.7" fill="#FFFFFF"/><circle cx="34.2" cy="36.8" r="0.7" fill="#FFFFFF"/>
      <ellipse cx="20" cy="42" rx="2.2" ry="1.3" fill="#FFB6C1" opacity="0.6"/>
      <ellipse cx="36" cy="42" rx="2.2" ry="1.3" fill="#FFB6C1" opacity="0.6"/>
      <path d="M 24.5 43.5 Q 28 45 31.5 43.5" fill="none" stroke="#263238" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  pepperpult: ({ size = 42 }) => (
    <svg viewBox="0 0 56 56" width={size} height={size} style={{ display: 'block' }}>
      <defs><linearGradient id="ppu" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#FF8A80"/><stop offset="100%" stopColor="#D50000"/></linearGradient></defs>
      {/* 辣椒主体（弯）*/}
      <path d="M 36 10 Q 44 18, 40 34 Q 36 46, 26 44 Q 14 42, 18 26 Q 22 14, 36 10 Z"
            fill="url(#ppu)" stroke="#FFFFFF" strokeWidth="1.8"/>
      {/* 蒂 */}
      <path d="M 33 9 Q 30 4, 36 2 Q 42 4, 39 10" fill="#2E7D32" stroke="#FFFFFF" strokeWidth="1"/>
      {/* 小火焰 */}
      <path d="M 22 20 Q 20 14, 24 12 Q 28 14, 26 20 Z" fill="#FFC733" opacity="0.95"/>
      <path d="M 22.5 20 Q 21.5 16, 24.5 15" fill="none" stroke="#FF8C00" strokeWidth="0.8"/>
      <circle cx="24" cy="26" r="3.4" fill="#FFFFFF"/><circle cx="34" cy="28" r="3.4" fill="#FFFFFF"/>
      <circle cx="24.5" cy="26.5" r="2.1" fill="#B71C1C"/><circle cx="34.5" cy="28.5" r="2.1" fill="#B71C1C"/>
      <circle cx="25.3" cy="25.7" r="0.7" fill="#FFFFFF"/><circle cx="35.3" cy="27.7" r="0.7" fill="#FFFFFF"/>
      <ellipse cx="20" cy="32" rx="2.4" ry="1.4" fill="#FFCDD2" opacity="0.85"/>
      <ellipse cx="38" cy="34" rx="2.4" ry="1.4" fill="#FFCDD2" opacity="0.85"/>
      <path d="M 26 35 Q 29 38 32 36" fill="none" stroke="#B71C1C" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  lightningreed: ({ size = 42 }) => (
    <svg viewBox="0 0 56 56" width={size} height={size} style={{ display: 'block' }}>
      <defs><linearGradient id="lr" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#CE93D8"/><stop offset="100%" stopColor="#7B1FA2"/></linearGradient></defs>
      {/* 芦苇杆 */}
      <path d="M 26 12 Q 24 28, 28 40 Q 24 46, 28 52" fill="none" stroke="#BA68C8" strokeWidth="5" strokeLinecap="round"/>
      {/* 头部 */}
      <ellipse cx="28" cy="14" rx="10" ry="12" fill="url(#lr)" stroke="#FFFFFF" strokeWidth="1.8"/>
      {/* 闪电 */}
      <path d="M 16 10 L 24 8 L 18 22 L 26 20 L 12 36 L 20 24 L 14 24 Z" fill="#FFEB3B" stroke="#FFFFFF" strokeWidth="0.9" opacity="0.95"/>
      <circle cx="24" cy="13" r="2.6" fill="#FFFFFF"/><circle cx="32" cy="13" r="2.6" fill="#FFFFFF"/>
      <circle cx="24.4" cy="13.4" r="1.6" fill="#4A148C"/><circle cx="32.4" cy="13.4" r="1.6" fill="#4A148C"/>
      <circle cx="24.9" cy="12.8" r="0.55" fill="#FFFFFF"/><circle cx="32.9" cy="12.8" r="0.55" fill="#FFFFFF"/>
      <ellipse cx="21.5" cy="18" rx="1.8" ry="1.1" fill="#F8BBD0" opacity="0.7"/>
      <ellipse cx="34.5" cy="18" rx="1.8" ry="1.1" fill="#F8BBD0" opacity="0.7"/>
      <path d="M 25 19 Q 28 20.5 31 19" fill="none" stroke="#4A148C" strokeWidth="1.1" strokeLinecap="round"/>
    </svg>
  ),
  cherrybomb: ({ size = 42 }) => (
    <svg viewBox="0 0 56 56" width={size} height={size} style={{ display: 'block' }}>
      <defs>
        <radialGradient id="ch1" cx="40%" cy="35%" r="70%"><stop offset="0%" stopColor="#FFCDD2"/><stop offset="100%" stopColor="#E53935"/></radialGradient>
        <radialGradient id="ch2" cx="40%" cy="35%" r="70%"><stop offset="0%" stopColor="#FF8A80"/><stop offset="100%" stopColor="#C62828"/></radialGradient>
      </defs>
      {/* 梗 */}
      <path d="M 28 8 Q 26 14, 22 16 M 28 8 Q 30 14, 34 16" fill="none" stroke="#2E7D32" strokeWidth="2.2" strokeLinecap="round"/>
      <ellipse cx="24" cy="8" rx="3" ry="1.6" fill="#2E7D32"/>
      {/* 双樱桃 */}
      <circle cx="18" cy="32" r="13" fill="url(#ch1)" stroke="#FFFFFF" strokeWidth="2"/>
      <circle cx="38" cy="34" r="13" fill="url(#ch2)" stroke="#FFFFFF" strokeWidth="2"/>
      {/* 左脸 */}
      <ellipse cx="13" cy="35" rx="2.2" ry="1.3" fill="#FFCDD2" opacity="0.8"/>
      <circle cx="15" cy="30" r="2.8" fill="#FFFFFF"/><circle cx="21" cy="30" r="2.8" fill="#FFFFFF"/>
      <circle cx="15.5" cy="30.5" r="1.7" fill="#B71C1C"/><circle cx="21.5" cy="30.5" r="1.7" fill="#B71C1C"/>
      <circle cx="16.2" cy="29.8" r="0.6" fill="#FFFFFF"/><circle cx="22.2" cy="29.8" r="0.6" fill="#FFFFFF"/>
      <path d="M 16 35 Q 18 37 20 35" fill="none" stroke="#B71C1C" strokeWidth="1.3" strokeLinecap="round"/>
      {/* 右脸 */}
      <ellipse cx="33" cy="37" rx="2.2" ry="1.3" fill="#FFCDD2" opacity="0.8"/>
      <circle cx="35" cy="32" r="2.8" fill="#FFFFFF"/><circle cx="41" cy="32" r="2.8" fill="#FFFFFF"/>
      <circle cx="35.5" cy="32.5" r="1.7" fill="#B71C1C"/><circle cx="41.5" cy="32.5" r="1.7" fill="#B71C1C"/>
      <circle cx="36.2" cy="31.8" r="0.6" fill="#FFFFFF"/><circle cx="42.2" cy="31.8" r="0.6" fill="#FFFFFF"/>
      {/* 狡黠眨眼 */}
      <path d="M 35.5 32.5 L 37.5 32.5" fill="none" stroke="#B71C1C" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
};

const FarmHeroBanner: React.FC = () => {
  return React.createElement('svg', {
    viewBox: '0 0 640 280',
    width: '100%',
    height: '100%',
    preserveAspectRatio: 'xMidYMid meet',
    style: { display: 'block', maxWidth: 760 },
    dangerouslySetInnerHTML: {
      __html: `
      <defs>
        <linearGradient id="sky-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#FFF0F5"/>
          <stop offset="45%" stop-color="#FFD6E6"/>
          <stop offset="100%" stop-color="#E7DCFF"/>
        </linearGradient>
        <linearGradient id="grass-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#D6F5E4"/>
          <stop offset="100%" stop-color="#9FDEBD"/>
        </linearGradient>
        <linearGradient id="hill-1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#FFD1DC"/><stop offset="100%" stop-color="#F8BBD0"/>
        </linearGradient>
        <linearGradient id="hill-2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#D4C5F9"/><stop offset="100%" stop-color="#B39DDB"/>
        </linearGradient>
        <linearGradient id="house-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#FFFFFF"/>
          <stop offset="100%" stop-color="#FFF0E4"/>
        </linearGradient>
        <linearGradient id="house-roof" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#FF9EB5"/>
          <stop offset="100%" stop-color="#F38BA8"/>
        </linearGradient>
        <linearGradient id="barn-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#FFB4A2"/>
          <stop offset="100%" stop-color="#E5928A"/>
        </linearGradient>
        <radialGradient id="sun-lg" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#FFF8DC"/>
          <stop offset="60%" stop-color="#FFE066"/>
          <stop offset="100%" stop-color="#F5C43C"/>
        </radialGradient>
        <filter id="fs" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="5" stdDeviation="4" flood-color="#C9A8A8" flood-opacity="0.22"/>
        </filter>
      </defs>
      <!-- 背景渐变填充整个视窗 -->
      <rect x="0" y="0" width="640" height="280" rx="36" fill="url(#sky-bg)"/>
      <!-- 云 -->
      <g opacity="0.9">
        <g transform="translate(70,52)">
          <ellipse cx="0" cy="0" rx="32" ry="14" fill="#FFFFFF"/>
          <ellipse cx="-20" cy="-3" rx="18" ry="10" fill="#FFFFFF"/>
          <ellipse cx="22" cy="-1" rx="16" ry="9" fill="#FFFFFF"/>
        </g>
        <g transform="translate(520,38)">
          <ellipse cx="0" cy="0" rx="36" ry="15" fill="#FFFFFF"/>
          <ellipse cx="-22" cy="-4" rx="18" ry="10" fill="#FFFFFF"/>
          <ellipse cx="26" cy="-2" rx="20" ry="10" fill="#FFFFFF"/>
        </g>
        <g transform="translate(310,28)">
          <ellipse cx="0" cy="0" rx="26" ry="10" fill="#FFFFFF" opacity="0.85"/>
          <ellipse cx="-15" cy="-2" rx="14" ry="8" fill="#FFFFFF" opacity="0.85"/>
          <ellipse cx="17" cy="-1" rx="15" ry="8" fill="#FFFFFF" opacity="0.85"/>
        </g>
      </g>
      <!-- 太阳 -->
      <g transform="translate(565,75)" filter="url(#fs)">
        <circle r="34" fill="#FFF3B0" opacity="0.5"/>
        <g stroke="#F5C43C" stroke-width="3" stroke-linecap="round" opacity="0.85">
          <line x1="0" y1="-46" x2="0" y2="-40"/>
          <line x1="0" y1="40" x2="0" y2="46"/>
          <line x1="-46" y1="0" x2="-40" y2="0"/>
          <line x1="40" y1="0" x2="46" y2="0"/>
          <line x1="-32" y1="-32" x2="-28" y2="-28"/>
          <line x1="28" y1="-28" x2="32" y2="-32"/>
          <line x1="-32" y1="32" x2="-28" y2="28"/>
          <line x1="28" y1="28" x2="32" y2="32"/>
        </g>
        <circle r="26" fill="url(#sun-lg)" stroke="#FFFFFF" stroke-width="3"/>
        <circle cx="-6" cy="-4" r="3" fill="#8B4513"/>
        <circle cx="7" cy="-4" r="3" fill="#8B4513"/>
        <ellipse cx="-11" cy="3" rx="4" ry="2.5" fill="#FFB6C1" opacity="0.8"/>
        <ellipse cx="12" cy="3" rx="4" ry="2.5" fill="#FFB6C1" opacity="0.8"/>
        <path d="M -5 6 Q 0 10, 6 6" fill="none" stroke="#8B4513" stroke-width="2.2" stroke-linecap="round"/>
      </g>
      <!-- 小山丘 -->
      <path d="M 0 210 Q 100 170, 210 190 Q 280 205, 380 175 Q 500 145, 640 185 L 640 280 L 0 280 Z" fill="url(#hill-2)" opacity="0.6"/>
      <path d="M 0 225 Q 140 200, 280 212 Q 420 225, 640 200 L 640 280 L 0 280 Z" fill="url(#hill-1)" opacity="0.55"/>
      <!-- 草地 -->
      <path d="M 0 230 Q 320 215, 640 230 L 640 280 L 0 280 Z" fill="url(#grass-bg)"/>
      <path d="M 0 230 Q 320 215, 640 230" fill="none" stroke="#FFFFFF" stroke-width="3" opacity="0.8"/>
      <!-- 马厩/谷仓（左） -->
      <g transform="translate(70,145)" filter="url(#fs)">
        <polygon points="-5,30 55,-8 115,30" fill="url(#house-roof)" stroke="#FFFFFF" stroke-width="2.5"/>
        <polygon points="-5,30 55,-8 115,30 108,34 -2,34" fill="#E07889" opacity="0.8"/>
        <rect x="8" y="30" width="94" height="62" rx="5" fill="url(#barn-body)" stroke="#FFFFFF" stroke-width="2.5"/>
        <rect x="40" y="50" width="30" height="42" rx="15" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="2"/>
        <path d="M 40 62 L 70 62" stroke="#D4A574" stroke-width="2"/>
        <path d="M 55 50 L 55 92" stroke="#D4A574" stroke-width="2"/>
        <circle cx="50" cy="72" r="1.6" fill="#BF8B56"/>
        <g stroke="#FFFFFF" stroke-width="2" opacity="0.7">
          <line x1="24" y1="44" x2="32" y2="52"/>
          <line x1="32" y1="44" x2="24" y2="52"/>
          <line x1="78" y1="44" x2="86" y2="52"/>
          <line x1="86" y1="44" x2="78" y2="52"/>
        </g>
        <circle cx="55" cy="15" r="7" fill="#FFF3B0" stroke="#FFFFFF" stroke-width="2"/>
        <path d="M 49 15 L 61 15 M 55 9 L 55 21" stroke="#FFFFFF" stroke-width="1.4"/>
      </g>
      <!-- 主别墅（中右） -->
      <g transform="translate(380,125)" filter="url(#fs)">
        <rect x="-8" y="42" width="148" height="70" rx="8" fill="url(#house-body)" stroke="#FFFFFF" stroke-width="3"/>
        <polygon points="-16,44 66,-12 148,44" fill="url(#house-roof)" stroke="#FFFFFF" stroke-width="3"/>
        <polygon points="-16,44 66,-12 148,44 140,49 -8,49" fill="#E07889" opacity="0.8"/>
        <rect x="20" y="0" width="14" height="28" fill="#D4C5F9" stroke="#FFFFFF" stroke-width="2"/>
        <g>
          <circle cx="21" cy="-6" r="5" fill="#FFFFFF" opacity="0.85"/>
          <circle cx="30" cy="-14" r="4" fill="#FFFFFF" opacity="0.7"/>
          <circle cx="24" cy="-22" r="3" fill="#FFFFFF" opacity="0.6"/>
        </g>
        <ellipse cx="66" cy="86" rx="15" ry="24" fill="#FFDAC1" stroke="#FFFFFF" stroke-width="2.5"/>
        <path d="M 54 82 A 12 12 0 0 1 78 82 L 78 112 L 54 112 Z" fill="#FFDAC1"/>
        <circle cx="76" cy="98" r="1.8" fill="#D4A574"/>
        <circle cx="66" cy="96" r="2" fill="#BF9C72" opacity="0.6"/>
        <path d="M 62 100 Q 66 104, 70 100" fill="none" stroke="#8D6E63" stroke-width="1.4" stroke-linecap="round"/>
        <circle cx="63" cy="98" r="0.8" fill="#8D6E63"/>
        <circle cx="69" cy="98" r="0.8" fill="#8D6E63"/>
        <g>
          <circle cx="30" cy="72" r="12" fill="#C7E9FF" stroke="#FFFFFF" stroke-width="2.5"/>
          <line x1="18" y1="72" x2="42" y2="72" stroke="#FFFFFF" stroke-width="2"/>
          <line x1="30" y1="60" x2="30" y2="84" stroke="#FFFFFF" stroke-width="2"/>
        </g>
        <g>
          <circle cx="102" cy="72" r="12" fill="#B5EAD7" stroke="#FFFFFF" stroke-width="2.5"/>
          <line x1="90" y1="72" x2="114" y2="72" stroke="#FFFFFF" stroke-width="2"/>
          <line x1="102" y1="60" x2="102" y2="84" stroke="#FFFFFF" stroke-width="2"/>
        </g>
        <ellipse cx="20" cy="88" rx="4" ry="2" fill="#FFB6C1" opacity="0.65"/>
        <ellipse cx="112" cy="88" rx="4" ry="2" fill="#FFB6C1" opacity="0.65"/>
      </g>
      <!-- 栅栏 -->
      <g opacity="0.9">
        <g transform="translate(180,215)">
          <rect x="0" y="0" width="6" height="28" rx="3" fill="#D4A574"/>
          <rect x="14" y="0" width="6" height="28" rx="3" fill="#D4A574"/>
          <rect x="28" y="0" width="6" height="28" rx="3" fill="#D4A574"/>
          <rect x="42" y="0" width="6" height="28" rx="3" fill="#D4A574"/>
          <rect x="-1" y="7" width="50" height="4" rx="2" fill="#BF9C72"/>
          <rect x="-1" y="18" width="50" height="4" rx="2" fill="#BF9C72"/>
        </g>
        <g transform="translate(440,220)">
          <rect x="0" y="0" width="6" height="22" rx="3" fill="#D4A574"/>
          <rect x="14" y="0" width="6" height="22" rx="3" fill="#D4A574"/>
          <rect x="28" y="0" width="6" height="22" rx="3" fill="#D4A574"/>
          <rect x="-1" y="5" width="36" height="3.5" rx="1.7" fill="#BF9C72"/>
          <rect x="-1" y="14" width="36" height="3.5" rx="1.7" fill="#BF9C72"/>
        </g>
      </g>
      <!-- 小绵羊 -->
      <g transform="translate(275,200)" filter="url(#fs)">
        <ellipse cx="0" cy="20" rx="3" ry="8" fill="#D4C4A8"/>
        <ellipse cx="14" cy="20" rx="3" ry="8" fill="#D4C4A8"/>
        <ellipse cx="-2" cy="5" rx="14" ry="10" fill="#FFE0CC" stroke="#FFFFFF" stroke-width="1.6"/>
        <g fill="#FFFFFF">
          <circle cx="-12" cy="6" r="6"/><circle cx="-6" cy="1" r="7"/><circle cx="2" cy="-1" r="8"/><circle cx="10" cy="2" r="7"/><circle cx="16" cy="6" r="6"/>
          <circle cx="-8" cy="12" r="6"/><circle cx="8" cy="12" r="6"/><circle cx="0" cy="13" r="7"/>
        </g>
        <ellipse cx="-13" cy="-2" rx="3.5" ry="5" fill="#FFE0CC" transform="rotate(-15 -13 -2)"/>
        <ellipse cx="12" cy="-2" rx="3.5" ry="5" fill="#FFE0CC" transform="rotate(15 12 -2)"/>
        <circle cx="-5" cy="4" r="2.2" fill="#FFFFFF"/>
        <circle cx="4" cy="4" r="2.2" fill="#FFFFFF"/>
        <circle cx="-4.3" cy="4.4" r="1.4" fill="#3E2723"/>
        <circle cx="4.7" cy="4.4" r="1.4" fill="#3E2723"/>
        <ellipse cx="-8.5" cy="8" rx="2.5" ry="1.5" fill="#FFB6C1" opacity="0.7"/>
        <ellipse cx="8.5" cy="8" rx="2.5" ry="1.5" fill="#FFB6C1" opacity="0.7"/>
        <path d="M -2.5 7.5 Q 0 9.5, 2.5 7.5" fill="none" stroke="#8D6E63" stroke-width="1.2" stroke-linecap="round"/>
      </g>
      <!-- 小僵尸角色 -->
      <g transform="translate(535,192)" filter="url(#fs)">
        <rect x="-10" y="15" width="20" height="26" rx="10" fill="#C5DD7A" stroke="#FFFFFF" stroke-width="2"/>
        <circle cx="0" cy="2" r="17" fill="#C5DD7A" stroke="#FFFFFF" stroke-width="2.5"/>
        <path d="M -12 -10 L 12 -10 L 9 -20 L -9 -20 Z" fill="#FFC733" stroke="#FFFFFF" stroke-width="2"/>
        <rect x="-13" y="-13" width="26" height="4" rx="2" fill="#F5A623"/>
        <circle cx="0" cy="-25" r="2" fill="#FFFFFF"/>
        <circle cx="-6" cy="0" r="4.2" fill="#FFFFFF"/><circle cx="6" cy="0" r="4.2" fill="#FFFFFF"/>
        <circle cx="-5.3" cy="0.5" r="2.5" fill="#5D4037"/>
        <circle cx="6.7" cy="0.5" r="2.5" fill="#5D4037"/>
        <circle cx="-4.6" cy="-0.3" r="0.9" fill="#FFFFFF"/>
        <circle cx="7.4" cy="-0.3" r="0.9" fill="#FFFFFF"/>
        <ellipse cx="-11" cy="7" rx="3" ry="1.8" fill="#FFB6C1" opacity="0.65"/>
        <ellipse cx="11" cy="7" rx="3" ry="1.8" fill="#FFB6C1" opacity="0.65"/>
        <ellipse cx="0" cy="10" rx="5.5" ry="3.2" fill="#3E2723"/>
        <ellipse cx="0.8" cy="11.5" rx="3" ry="1.7" fill="#F48FB1"/>
      </g>
      <!-- 花 左下 -->
      <g transform="translate(55,245)">
        <g>
          <circle cx="-4" cy="0" r="4" fill="#FFD1DC"/>
          <circle cx="4" cy="0" r="4" fill="#FFD1DC"/>
          <circle cx="0" cy="-4" r="4" fill="#FFD1DC"/>
          <circle cx="0" cy="4" r="4" fill="#FFD1DC"/>
          <circle cx="0" cy="0" r="3.5" fill="#FF8FA3"/>
          <circle cx="0" cy="0" r="2" fill="#FFF3B0"/>
          <rect x="-0.6" y="4" width="1.2" height="14" rx="0.6" fill="#7BC9A6"/>
          <ellipse cx="-3.5" cy="13" rx="4" ry="2" fill="#9DD5B8" transform="rotate(-25 -3.5 13)"/>
        </g>
        <g transform="translate(18,-4)">
          <circle cx="-3" cy="0" r="3" fill="#E0D1F5"/>
          <circle cx="3" cy="0" r="3" fill="#E0D1F5"/>
          <circle cx="0" cy="-3" r="3" fill="#E0D1F5"/>
          <circle cx="0" cy="3" r="3" fill="#E0D1F5"/>
          <circle cx="0" cy="0" r="2.5" fill="#B39DDB"/>
          <circle cx="0" cy="0" r="1.5" fill="#FFF3B0"/>
          <rect x="-0.5" y="3" width="1" height="12" rx="0.5" fill="#7BC9A6"/>
        </g>
      </g>
      <!-- 花 右下 -->
      <g transform="translate(340,250)">
        <g>
          <circle cx="-5" cy="0" r="5" fill="#FFE066"/>
          <circle cx="5" cy="0" r="5" fill="#FFE066"/>
          <circle cx="0" cy="-5" r="5" fill="#FFE066"/>
          <circle cx="0" cy="5" r="5" fill="#FFE066"/>
          <circle cx="0" cy="0" r="4.5" fill="#FFC733"/>
          <circle cx="0" cy="0" r="2.6" fill="#FF8FA3"/>
          <rect x="-0.8" y="5" width="1.6" height="16" rx="0.8" fill="#7BC9A6"/>
        </g>
      </g>
      <!-- 胡萝卜吉祥物 -->
      <g transform="translate(600,248)">
        <path d="M 0 0 Q -12 -2, -4 18 L 4 18 Q 12 -2, 0 0 Z" fill="#FF9E7A" stroke="#FFFFFF" stroke-width="1.5"/>
        <path d="M -5 -8 Q -7 -18, -3 -10" fill="none" stroke="#7BC9A6" stroke-width="2" stroke-linecap="round"/>
        <path d="M 0 -10 Q 0 -22, 4 -10" fill="none" stroke="#7BC9A6" stroke-width="2" stroke-linecap="round"/>
        <path d="M 5 -8 Q 8 -18, 4 -10" fill="none" stroke="#7BC9A6" stroke-width="2" stroke-linecap="round"/>
        <circle cx="-2.5" cy="3" r="1" fill="#3E2723"/>
        <circle cx="2.5" cy="3" r="1" fill="#3E2723"/>
        <path d="M -2 7 Q 0 9, 2 7" fill="none" stroke="#3E2723" stroke-width="0.8" stroke-linecap="round"/>
      </g>
      <!-- 小鸟 -->
      <g transform="translate(195,78)" opacity="0.9">
        <ellipse cx="0" cy="0" rx="10" ry="7" fill="#FFD1DC" stroke="#FFFFFF" stroke-width="1.5"/>
        <circle cx="8" cy="-3" r="6" fill="#FFD1DC" stroke="#FFFFFF" stroke-width="1.5"/>
        <polygon points="13,-3 19,-1 13,1" fill="#FFC733"/>
        <circle cx="10" cy="-4" r="1.4" fill="#3E2723"/>
        <path d="M -6 -3 Q -10 -10, -14 -2 Q -10 0, -6 -3" fill="#F48FB1"/>
        <path d="M -4 2 Q -8 7, -3 4" fill="none" stroke="#8D6E63" stroke-width="1.2" stroke-linecap="round"/>
      </g>
      <!-- 边框圆角高光 -->
      <rect x="0" y="0" width="640" height="280" rx="36" fill="none" stroke="#FFFFFF" stroke-width="5" opacity="0.9"/>
      `
    }
  });
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
      explosions: [], floatingTexts: [], lightningBolts: [],
      selectedPlant: null, currentQuiz: null, quizCooldown: 0,
      wordsAnswered: 0, wordsCorrect: 0,
      waveStartTime: Date.now() + 3000, waveZombiesSpawned: 0,
      totalKills: 0, lastTime: Date.now(),
      zombieSpeedBoostEnd: 0, usedWordIndices: new Set(),
      shakeTimer: 0, comboCount: 0,
      particles: [], pickups: [],
      doubleDamageEnd: 0, screenFlash: 0, screenFlashColor: '#fff',
      waveCountdown: 3000, bestCombo: 0,
      wrongWords: [], quizAnsweredIndex: -1,
      sparkleSeed: Math.floor(Math.random() * 1e6),
    };
    gs.current = state;
    setPhase('playing');
    generateQuiz(state);
    forceUpdate();
  }, [forceUpdate]);

  const generateQuiz = useCallback((state: GameState) => {
    const maxDiff = state.wordsAnswered < 5 ? 1 : state.wordsAnswered < 12 ? 2 : 3;
    let available = WORD_BANK.map((_, i) => i).filter(
      i => !state.usedWordIndices.has(i) && WORD_BANK[i].difficulty <= maxDiff
    );
    if (available.length < 4) { state.usedWordIndices.clear(); }
    available = WORD_BANK.map((_, i) => i).filter(
      i => !state.usedWordIndices.has(i) && WORD_BANK[i].difficulty <= maxDiff
    );
    if (available.length < 4) available = WORD_BANK.map((_, i) => i);
    const shuffled = shuffle(available);
    const correctIdx = shuffled[0];
    const correctWord = WORD_BANK[correctIdx];
    state.usedWordIndices.add(correctIdx);
    const wrongPool = WORD_BANK.map((_, i) => i).filter(
      i => i !== correctIdx && WORD_BANK[i].difficulty <= maxDiff
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
    state.quizAnsweredIndex = index;
    state.wordsAnswered++;
    const now = Date.now();
    const { w, h } = dims.current;
    if (isCorrect) {
      state.wordsCorrect++;
      state.comboCount++;
      if (state.comboCount > state.bestCombo) state.bestCombo = state.comboCount;
      const reward = QUIZ_SUN_REWARD[quiz.word.difficulty];
      const comboBonus = state.comboCount >= 3 ? Math.floor(reward * 0.5) : 0;
      state.sun += reward + comboBonus;
      state.score += reward + comboBonus;
      state.screenFlash = 200; state.screenFlashColor = 'rgba(139,195,74,0.12)';
      state.floatingTexts.push({
        id: uid(), x: w / 2, y: h - 100,
        text: `+${reward + comboBonus} ${comboBonus > 0 ? ' x' + state.comboCount + '连击!' : ''}`,
        color: '#FF8F00', timer: 1500, maxTimer: 1500,
      });
      // Combo milestone celebrations
      if (state.comboCount === 5) {
        state.floatingTexts.push({ id: uid(), x: w / 2, y: h / 2 - 30, text: '🔥 超级连击! 🔥', color: '#FF6F00', timer: 2000, maxTimer: 2000 });
        state.sun += 30; state.score += 30;
        spawnParticles(state, w / 2, h / 2, '#FFD54F', 20);
        state.screenFlash = 300; state.screenFlashColor = 'rgba(255,183,77,0.18)';
      } else if (state.comboCount === 10) {
        state.floatingTexts.push({ id: uid(), x: w / 2, y: h / 2 - 30, text: '⚡ 无敌连击!! ⚡', color: '#E65100', timer: 2500, maxTimer: 2500 });
        state.sun += 60; state.score += 60;
        spawnParticles(state, w / 2, h / 2, '#FF6F00', 25);
        spawnParticles(state, w / 2, h / 2, '#FFD54F', 20);
        state.screenFlash = 400; state.screenFlashColor = 'rgba(255,111,0,0.22)';
      } else if (state.comboCount > 10 && state.comboCount % 5 === 0) {
        state.floatingTexts.push({ id: uid(), x: w / 2, y: h / 2 - 30, text: `💥 ${state.comboCount}连击!! 💥`, color: '#D50000', timer: 2500, maxTimer: 2500 });
        state.sun += 50; state.score += 50;
        spawnParticles(state, w / 2, h / 2, '#FF1744', 20);
        spawnParticles(state, w / 2, h / 2, '#FFD54F', 20);
        state.screenFlash = 400; state.screenFlashColor = 'rgba(255,23,68,0.18)';
      }
    } else {
      state.comboCount = 0;
      state.zombieSpeedBoostEnd = now + ZOMBIE_SPEED_BOOST_DURATION;
      state.shakeTimer = 300;
      state.screenFlash = 250; state.screenFlashColor = 'rgba(229,57,53,0.18)';
      state.wrongWords.push({ en: quiz.word.en, zh: quiz.word.zh, difficulty: quiz.word.difficulty });
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
    if (!state || state.phase !== 'playing') return;
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    let cx: number, cy: number;
    if ('touches' in e) { if (!e.touches.length) return; cx = e.touches[0].clientX; cy = e.touches[0].clientY; }
    else { cx = e.clientX; cy = e.clientY; }
    const x = cx - rect.left; const y = cy - rect.top;
    const { cellW, cellH, ox, oy } = dims.current;
    // Check pickup collection first
    for (const pk of state.pickups) {
      if (pk.collected) continue;
      const pkY = oy + pk.row * cellH + cellH * 0.5;
      if (Math.abs(x - pk.x) < cellW * 0.4 && Math.abs(y - pkY) < cellH * 0.4) {
        collectPickup(state, pk, cellW, cellH, ox, oy);
        forceUpdate();
        return;
      }
    }
    if (!state.selectedPlant) return;
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
    const plant: Plant = { id: uid(), type: state.selectedPlant, row, col, hp: def.hp, maxHp: def.hp, lastAttack: 0, animPhase: Math.random() * Math.PI * 2, lastSun: Date.now() };
    state.plants.push(plant);
    spawnParticles(state, ox + col * cellW + cellW / 2, oy + row * cellH + cellH / 2, '#A5D6A7', 8);
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
              if (z.hp <= 0) { z.dead = true; z.deathTimer = 500; cs.totalKills++; cs.score += 50; spawnZombieDeathParticles(cs, z.x, oY + z.row * cH + cH / 2, cW); }
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
          state.zombies.push({
            id: uid(), type: zc.type, row, x: ox + (GRID_COLS + 0.8) * cellW,
            hp: def.hp, maxHp: def.hp, speed: def.speed, baseSpeed: def.speed,
            eating: false, slowed: false, slowTimer: 0, lastHit: now,
            animPhase: Math.random() * Math.PI * 2, dead: false, deathTimer: 0,
            armorHp: def.armorHp,
          });
        } else break;
      }
    }

    // Wave check
    const allSpawned = waveConfig ? state.waveZombiesSpawned >= waveConfig.zombies.length : true;
    const allDead = state.zombies.length === 0 || state.zombies.every(z => z.dead);
    if (allSpawned && allDead && state.zombies.length > 0) {
      if (state.wave < WAVE_CONFIGS.length - 1) {
        state.wave++; state.waveStartTime = now + 3000; state.waveZombiesSpawned = 0;
        state.waveCountdown = 3000;
        state.floatingTexts.push({ id: uid(), x: w / 2, y: h / 2, text: `第 ${state.wave + 1} 波即将来袭!`, color: '#E65100', timer: 2500, maxTimer: 2500 });
        forceUpdate();
      } else { state.phase = 'victory'; setPhase('victory'); return; }
    }

    // Zombies
    let gameOver = false;
    for (const z of state.zombies) {
      if (z.dead) { z.deathTimer -= dt; continue; }
      if (z.slowed) { z.slowTimer -= dt; if (z.slowTimer <= 0) z.slowed = false; }
      z.animPhase += dt * 0.005 * (z.slowed ? 0.5 : 1);
      // DOT
      if (z.burnTimer && z.burnTimer > 0) {
        z.burnTimer -= dt;
        const ticks = Math.max(1, Math.floor(dt / 200));
        for (let ti = 0; ti < ticks; ti++) {
          z.hp -= (z.burnDamage || 5) * (dt / 1000) * 2;
        }
      }
      if (z.poisonTimer && z.poisonTimer > 0) {
        z.poisonTimer -= dt;
        z.hp -= (z.poisonDamage || 4) * (dt / 1000);
      }
      if (z.hp <= 0) { z.dead = true; z.deathTimer = 500; state.totalKills++; state.score += 50; spawnZombieDeathParticles(state, z.x, oy + z.row * cellH + cellH / 2, cellW); trySpawnDrop(state, z, cellW); continue; }
      const def = ZOMBIE_DEFS[z.type];
      let actualSpeed = z.baseSpeed * speedMult * (z.slowed ? 0.5 : 1);
      if (def.speedMultiplier) actualSpeed *= def.speedMultiplier;
      // Wizard summon (every 9-11s, summon 1 normal zombie)
      if (z.type === 'wizard') {
        if (z.lastSummon === undefined) z.lastSummon = now - 6000;
        if (now - z.lastSummon > 10000) {
          z.lastSummon = now;
          const srow = Math.max(0, Math.min(GRID_ROWS - 1, z.row + (Math.random() < 0.5 ? 0 : (Math.random() < 0.5 ? -1 : 1))));
          state.zombies.push({
            id: uid(), type: 'normal', row: srow, x: z.x + cellW * 0.4,
            hp: ZOMBIE_DEFS.normal.hp * 0.7, maxHp: ZOMBIE_DEFS.normal.hp * 0.7,
            speed: ZOMBIE_DEFS.normal.speed, baseSpeed: ZOMBIE_DEFS.normal.speed,
            eating: false, slowed: false, slowTimer: 0, lastHit: now,
            animPhase: Math.random() * Math.PI * 2, dead: false, deathTimer: 0,
          });
          state.floatingTexts.push({ id: uid(), x: z.x, y: oy + z.row * cellH, text: '召唤!', color: '#AB47BC', timer: 1000, maxTimer: 1000 });
          spawnParticles(state, z.x, oy + z.row * cellH + cellH / 2, '#E040FB', 15);
        }
      }
      // PoleHope: jump first plant encountered (once)
      if (z.type === 'polehope' && !z.usedPole) {
        const ep = state.plants.find(p => p.row === z.row && z.x - (ox + p.col * cellW + cellW / 2) < cellW * 0.55 && z.x - (ox + p.col * cellW + cellW / 2) > -cellW * 0.2);
        if (ep) {
          z.usedPole = true; z.lastJump = now; z.eating = false;
          z.x = ox + ep.col * cellW - cellW * 0.3;
          state.floatingTexts.push({ id: uid(), x: ox + ep.col * cellW + cellW / 2, y: oy + ep.row * cellH, text: '跳!', color: '#FF9800', timer: 900, maxTimer: 900 });
        }
      }
      // Miner: digs in at col 2, re-emerges at left of same row
      if (z.type === 'miner' && !z.tunneled) {
        if (z.x <= ox + 2 * cellW + cellW * 0.5) {
          z.tunneling = true;
          z.x = ox - cellW * 0.3;
          z.tunneled = true;
          z.eating = false;
          state.floatingTexts.push({ id: uid(), x: ox + 2 * cellW + cellW / 2, y: oy + z.row * cellH, text: '潜入地下!', color: '#8D6E63', timer: 1200, maxTimer: 1200 });
          spawnParticles(state, ox + 2 * cellW + cellW / 2, oy + z.row * cellH + cellH * 0.6, '#8D6E63', 20);
        }
      }
      // Find target plant
      const ep = state.plants.find(p => p.row === z.row && Math.abs(z.x - (ox + p.col * cellW + cellW / 2)) < cellW * 0.35);
      if (ep) {
        z.eating = true;
        if (now - z.lastHit > 1000) {
          z.lastHit = now;
          // Flame zombie burn aoe on eating
          let atk = def.eatDamage || 100;
          if (z.type === 'flame') atk = 160;
          ep.hp -= atk;
          // Flame: ignite nearby plants slightly
          if (z.type === 'flame') {
            for (const p2 of state.plants) {
              if (p2 === ep) continue;
              if (Math.abs(p2.row - z.row) <= 1 && Math.abs((ox + p2.col * cellW) - z.x) < cellW * 1.2) {
                p2.hp -= 20;
                if (p2.hp <= 0) state.plants = state.plants.filter(pp => pp.id !== p2.id);
              }
            }
          }
          if (ep.hp <= 0) state.plants = state.plants.filter(p => p.id !== ep.id);
        }
      } else { z.eating = false; z.x -= actualSpeed * (dt / 1000); }
      if (z.x < ox - cellW * 0.5) gameOver = true;
    }
    state.zombies = state.zombies.filter(z => !(z.dead && z.deathTimer <= 0));
    if (gameOver) { state.phase = 'gameover'; setPhase('gameover'); return; }

    // Plants
    for (const p of state.plants) {
      p.animPhase += dt * 0.003;
      const d = PLANT_DEFS[p.type];
      // Sun producer
      if (d.sunProducer) {
        if (p.lastSun === undefined) p.lastSun = now;
        const interval = d.sunProductionInterval || 8000;
        if (now - p.lastSun >= interval) {
          p.lastSun = now;
          const amt = d.sunProductionAmount || 25;
          state.pickups.push({
            id: uid(), x: ox + p.col * cellW + cellW / 2, row: p.row,
            type: 'sun', timer: 8000, maxTimer: 8000, collected: false,
            bobPhase: Math.random() * Math.PI * 2, value: amt,
          });
        }
      }
      // Cherry bomb auto-explode after fuse
      if (p.type === 'cherrybomb') {
        if (p.lastAttack === 0) p.lastAttack = now;
        if (now - p.lastAttack >= 1200) {
          p.lastAttack = now;
          const ex = ox + p.col * cellW + cellW / 2;
          const ey = oy + p.row * cellH + cellH / 2;
          state.explosions.push({ id: uid(), x: ex, y: ey, radius: 0, maxRadius: cellW * 2, timer: 0, maxTimer: 450 });
          state.screenFlash = 250; state.screenFlashColor = 'rgba(244,67,54,0.22)'; state.shakeTimer = 300;
          for (const zz of state.zombies) {
            if (zz.dead) continue;
            if (Math.abs(zz.row - p.row) <= 1 && Math.abs(zz.x - ex) < cellW * 2.2) {
              const dmg = (d.explosionDamage || 1800) * (now < state.doubleDamageEnd ? 2 : 1);
              zz.hp -= dmg;
              if (zz.armorHp !== undefined) zz.armorHp = Math.max(0, zz.armorHp - dmg);
              state.floatingTexts.push({ id: uid(), x: zz.x, y: oy + zz.row * cellH + cellH * 0.2, text: `-${dmg}`, color: '#FF5252', timer: 700, maxTimer: 700 });
              if (zz.hp <= 0) { zz.dead = true; zz.deathTimer = 500; state.totalKills++; state.score += 50; spawnZombieDeathParticles(state, zz.x, oy + zz.row * cellH + cellH / 2, cellW); trySpawnDrop(state, zz, cellW); }
            }
          }
          state.plants = state.plants.filter(pp => pp.id !== p.id);
          spawnParticles(state, ex, ey, '#FF5252', 40);
          break;
        }
        continue;
      }
      if (d.attack && d.attackSpeed) {
        // Spikerock: close combat AoE (any zombie adjacent in row)
        if (p.type === 'spikerock') {
          const px = ox + p.col * cellW + cellW / 2;
          const nearZ = state.zombies.filter(z => !z.dead && z.row === p.row && Math.abs(z.x - px) < cellW * 0.55);
          if (nearZ.length > 0 && now - p.lastAttack >= d.attackSpeed) {
            p.lastAttack = now;
            const dmg = (d.attack ?? 0) * (now < state.doubleDamageEnd ? 2 : 1);
            for (const nz of nearZ) {
              nz.hp -= dmg;
              state.floatingTexts.push({ id: uid(), x: nz.x, y: oy + nz.row * cellH + cellH * 0.25, text: `-${dmg}刺`, color: '#607D8B', timer: 500, maxTimer: 500 });
              spawnParticles(state, nz.x, oy + nz.row * cellH + cellH / 2, '#90A4AE', 4);
              if (nz.hp <= 0) { nz.dead = true; nz.deathTimer = 500; state.totalKills++; state.score += 50; spawnZombieDeathParticles(state, nz.x, oy + nz.row * cellH + cellH / 2, cellW); trySpawnDrop(state, nz, cellW); }
            }
            // Spikerock takes slight self-damage per attack
            p.hp -= 10;
            if (p.hp <= 0) state.plants = state.plants.filter(pp => pp.id !== p.id);
          }
          continue;
        }
        // Lightning Reed: chain lightning, no projectile, targets nearby
        if (p.type === 'lightningreed') {
          const px = ox + p.col * cellW + cellW / 2;
          const targets = state.zombies.filter(z => !z.dead && Math.abs(z.row - p.row) <= 2 && z.x >= px - cellW * 0.5 && z.x <= px + cellW * 4);
          if (targets.length > 0 && now - p.lastAttack >= d.attackSpeed) {
            p.lastAttack = now;
            // Pick first (closest to house) target
            targets.sort((a, b) => a.x - b.x);
            let cur = targets[0];
            const chCount = d.chainCount || 3;
            const hitZ: Set<string> = new Set();
            let curX = px, curY = oy + p.row * cellH + cellH / 2;
            for (let ci = 0; ci < chCount; ci++) {
              if (!cur) break;
              hitZ.add(cur.id);
              const dmg = (d.attack || 20) * (1 - ci * 0.15) * (now < state.doubleDamageEnd ? 2 : 1);
              cur.hp -= dmg;
              const zy = oy + cur.row * cellH + cellH / 2;
              state.lightningBolts.push({ id: uid(), x1: curX, y1: curY, x2: cur.x, y2: zy, timer: 180, maxTimer: 180 });
              state.floatingTexts.push({ id: uid(), x: cur.x, y: zy - cellH * 0.1, text: `-${dmg}⚡`, color: '#CE93D8', timer: 500, maxTimer: 500 });
              spawnParticles(state, cur.x, zy, '#CE93D8', 5);
              curX = cur.x; curY = zy;
              if (cur.hp <= 0) { cur.dead = true; cur.deathTimer = 500; state.totalKills++; state.score += 50; spawnZombieDeathParticles(state, cur.x, oy + cur.row * cellH + cellH / 2, cellW); trySpawnDrop(state, cur, cellW); }
              // Pick next closest non-hit within radius
              let next: Zombie | undefined;
              let bestD = cellW * 3;
              for (const z2 of state.zombies) {
                if (z2.dead || hitZ.has(z2.id)) continue;
                const dist = Math.hypot(z2.x - curX, (oy + z2.row * cellH + cellH / 2) - curY);
                if (dist < bestD) { bestD = dist; next = z2; }
              }
              cur = next as Zombie;
            }
          }
          continue;
        }
        const hz = state.zombies.some(z => !z.dead && z.row === p.row && z.x > ox + p.col * cellW);
        if (hz && now - p.lastAttack >= d.attackSpeed) {
          p.lastAttack = now;
          const px = ox + p.col * cellW + cellW * 0.7;
          // Threepeater: send 3 projectiles (row-1, row, row+1 if valid)
          if (p.type === 'threepeater') {
            const rows = [p.row - 1, p.row, p.row + 1].filter(r => r >= 0 && r < GRID_ROWS);
            for (const r of rows) {
              state.projectiles.push({
                id: uid(), row: r, x: px, speed: 250, damage: d.attack ?? 0, slow: !!d.slowEffect, active: true,
              });
            }
          } else if (p.type === 'pepperpult') {
            // Pepper: splash + burn DOT (via poisonDamage/Duration fields)
            state.projectiles.push({
              id: uid(), row: p.row, x: px, speed: 320, damage: d.attack ?? 0, slow: false, active: true,
              splash: true, splashRange: cellW * 1.0,
              poison: true, poisonDamage: d.poisonDamage, poisonDuration: d.poisonDuration,
            });
          } else if (p.type === 'snowpea') {
            state.projectiles.push({
              id: uid(), row: p.row, x: px, speed: 250, damage: d.attack ?? 0, slow: true, active: true,
              piercing: !!d.piercing, pierceCount: d.pierceCount ?? 0, hitIds: new Set(),
            });
          } else {
            state.projectiles.push({
              id: uid(), row: p.row, x: px, speed: 250, damage: d.attack ?? 0, slow: !!d.slowEffect, active: true,
              piercing: !!d.piercing, pierceCount: d.pierceCount ?? 0, hitIds: new Set(),
            });
            const atk = d.attack ?? 0;
            if (d.doubleShot) { setTimeout(() => { if (gs.current?.phase === 'playing') gs.current.projectiles.push({ id: uid(), row: p.row, x: px, speed: 250, damage: atk, slow: false, active: true }); }, 150); }
          }
        }
      }
    }

    // Projectiles
    for (const pr of state.projectiles) {
      if (!pr.active) continue;
      pr.x += pr.speed * (dt / 1000);
      const hz = state.zombies.find(z => !z.dead && z.row === pr.row && Math.abs(z.x - pr.x) < cellW * 0.25 && !(pr.hitIds && pr.hitIds.has(z.id)));
      if (hz) {
        const dmg = pr.damage * (now < state.doubleDamageEnd ? 2 : 1);
        // Apply damage to armor first for screendoor
        if (hz.type === 'screendoor' && hz.armorHp && hz.armorHp > 0) {
          const absorb = Math.min(hz.armorHp, dmg * 0.8);
          hz.armorHp -= absorb;
          hz.hp -= (dmg - absorb);
        } else {
          hz.hp -= dmg;
        }
        if (pr.slow) { hz.slowed = true; hz.slowTimer = 3000; }
        // Pepper splash burn
        if (pr.splash) {
          const sx = hz.x; const sy = oy + hz.row * cellH + cellH / 2;
          const sr = pr.splashRange || cellW;
          for (const zz of state.zombies) {
            if (zz === hz || zz.dead) continue;
            if (Math.abs(zz.row - hz.row) <= 1 && Math.abs(zz.x - sx) < sr) {
              const sdmg = Math.floor(dmg * 0.55);
              if (zz.type === 'screendoor' && zz.armorHp && zz.armorHp > 0) {
                const abs2 = Math.min(zz.armorHp, sdmg * 0.8);
                zz.armorHp -= abs2; zz.hp -= (sdmg - abs2);
              } else zz.hp -= sdmg;
              state.floatingTexts.push({ id: uid(), x: zz.x, y: oy + zz.row * cellH + cellH * 0.2, text: `-${sdmg}溅`, color: '#FF6D00', timer: 500, maxTimer: 500 });
              if (zz.hp <= 0) { zz.dead = true; zz.deathTimer = 500; state.totalKills++; state.score += 50; spawnZombieDeathParticles(state, zz.x, oy + zz.row * cellH + cellH / 2, cellW); trySpawnDrop(state, zz, cellW); }
            }
          }
          // DOT on primary / splash targets (use projectile poison config if set, else burn defaults)
          if (pr.poison) {
            hz.poisonTimer = pr.poisonDuration || 4000;
            hz.poisonDamage = pr.poisonDamage || 15;
            for (const zz of state.zombies) {
              if (zz === hz || zz.dead) continue;
              if (Math.abs(zz.row - hz.row) <= 1 && Math.abs(zz.x - sx) < sr) {
                zz.poisonTimer = pr.poisonDuration || 4000;
                zz.poisonDamage = pr.poisonDamage || 15;
              }
            }
          } else {
            hz.burnTimer = 4000; hz.burnDamage = 18;
          }
          spawnParticles(state, sx, sy, '#FF6D00', 12);
          state.explosions.push({ id: uid(), x: sx, y: sy, radius: 0, maxRadius: sr * 0.7, timer: 0, maxTimer: 300 });
        }
        state.floatingTexts.push({ id: uid(), x: pr.x, y: oy + pr.row * cellH + cellH * 0.25, text: `-${dmg}`, color: now < state.doubleDamageEnd ? '#FF6F00' : pr.slow ? '#29B6F6' : '#FF6D00', timer: 600, maxTimer: 600 });
        if (hz.hp <= 0) { hz.dead = true; hz.deathTimer = 500; state.totalKills++; state.score += 50; spawnZombieDeathParticles(state, hz.x, oy + hz.row * cellH + cellH / 2, cellW); trySpawnDrop(state, hz, cellW); }
        if (pr.piercing && pr.pierceCount !== undefined) {
          (pr.hitIds || (pr.hitIds = new Set())).add(hz.id);
          pr.pierceCount--;
          if (pr.pierceCount <= 0) pr.active = false;
        } else pr.active = false;
      }
      if (pr.x > ox + (GRID_COLS + 1) * cellW) pr.active = false;
    }
    state.projectiles = state.projectiles.filter(p => p.active);

    // Lightning bolts
    for (const lb of state.lightningBolts) lb.timer -= dt;
    state.lightningBolts = state.lightningBolts.filter(l => l.timer > 0);

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
          state.screenFlash = 250; state.screenFlashColor = 'rgba(229,57,53,0.18)';
          state.floatingTexts.push({ id: uid(), x: w / 2, y: h - 100, text: '超时! 僵尸加速!', color: '#E53935', timer: 1500, maxTimer: 1500 });
          forceUpdate();
        }
      }
    }
    if (state.shakeTimer > 0) state.shakeTimer -= dt;
    // Wave countdown
    if (state.waveCountdown > 0) {
      state.waveCountdown = Math.max(0, state.waveStartTime - now);
    }
    // Pickups
    for (const pk of state.pickups) {
      if (pk.collected) continue;
      pk.timer -= dt; pk.bobPhase += dt * 0.004;
      if (pk.timer <= 0) pk.collected = true;
    }
    state.pickups = state.pickups.filter(p => !p.collected);
    // Particles
    for (const p of state.particles) {
      p.life -= dt; p.x += p.vx * (dt / 1000); p.y += p.vy * (dt / 1000);
      if (p.gravity) p.vy += p.gravity * (dt / 1000);
      p.alpha = Math.max(0, p.life / p.maxLife); p.size *= 0.997;
    }
    state.particles = state.particles.filter(p => p.life > 0 && p.size > 0.3);
    // Screen flash
    if (state.screenFlash > 0) state.screenFlash -= dt;

    // ======== RENDER (Kawaii Macaron Pastel) ========
    const dpr = window.devicePixelRatio || 1;
    ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (state.shakeTimer > 0) ctx.translate((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);

    // --- Kawaii pastel sky: cream → soft pink → lavender → mint ---
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0,    '#FFFBF4');
    sky.addColorStop(0.14, '#FFEAF0');
    sky.addColorStop(0.32, '#F6E8FF');
    sky.addColorStop(0.5,  '#E0F4EB');
    sky.addColorStop(0.7,  '#D0EFDC');
    sky.addColorStop(1,    '#B5E3C7');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);

    // Soft pastel glow orbs (ambient color clouds / bokeh)
    const bokehs = [
      { x: 0.10, y: 0.08, r: 110, c: 'rgba(255,209,220,0.55)' },
      { x: 0.60, y: 0.12, r: 130, c: 'rgba(199,233,255,0.55)' },
      { x: 0.88, y: 0.20, r: 100, c: 'rgba(255,218,193,0.5)' },
      { x: 0.35, y: 0.35, r: 90,  c: 'rgba(212,197,249,0.38)' },
    ];
    for (const b of bokehs) {
      const g = ctx.createRadialGradient(w * b.x, h * b.y, 0, w * b.x, h * b.y, b.r);
      g.addColorStop(0, b.c); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }

    // Cute sparkles (static + subtle float)
    const sparkleSeed = state.sparkleSeed ?? 0;
    for (let i = 0; i < 22; i++) {
      const sx = ((i * 131 + sparkleSeed) % 97) / 97 * w;
      const sy = (((i * 211) % 43) / 43) * (h * 0.35) + (h * 0.03);
      const twinkle = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(performance.now() / 500 + i));
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(Math.PI / 4);
      ctx.globalAlpha = 0.5 * twinkle;
      ctx.fillStyle = ['#FFD1DC', '#FFF3B0', '#C7E9FF', '#D4C5F9'][i % 4];
      ctx.fillRect(-2, -0.8, 4, 1.6);
      ctx.fillRect(-0.8, -2, 1.6, 4);
      ctx.restore();
    }

    // Kawaii fluffy clouds (rounded blob shape, layered pastels)
    const drawCloud = (cx: number, cy: number, scale: number, tint: string) => {
      ctx.save(); ctx.translate(cx, cy); ctx.scale(scale, scale);
      ctx.fillStyle = tint;
      const puff = (dx: number, dy: number, rr: number) => {
        ctx.beginPath(); ctx.arc(dx, dy, rr, 0, Math.PI * 2); ctx.fill();
      };
      puff(-26, 6, 22); puff(-10, -4, 26); puff(14, -2, 24); puff(32, 8, 20);
      puff(-2, 12, 20);  puff(18, 14, 18);
      ctx.restore();
    };
    const tT = performance.now() / 12000;
    const cloud = (baseX: number, cy: number, s: number, col: string, dir: 1 | -1 = 1) => {
      const x = (baseX + dir * tT * w * 0.05 + w * 2) % (w * 1.4) - w * 0.2;
      drawCloud(x, cy, s, col);
    };
    cloud(w * 0.18, h * 0.06, 1.0,  'rgba(255,255,255,0.92)');
    cloud(w * 0.58, h * 0.09, 0.85, 'rgba(255,241,247,0.92)');
    cloud(w * 0.88, h * 0.04, 0.95, 'rgba(240,247,255,0.95)');
    cloud(w * 0.38, h * 0.18, 0.55, 'rgba(255,250,225,0.9)');

    // Rainbow pastel stripes (very subtle, top 12%)
    const stripesTop = [
      ['rgba(255,209,220,0.38)', 0.04],
      ['rgba(255,218,193,0.32)', 0.05],
      ['rgba(255,243,176,0.30)', 0.06],
      ['rgba(181,234,215,0.30)', 0.07],
      ['rgba(199,233,255,0.32)', 0.08],
      ['rgba(212,197,249,0.30)', 0.09],
    ];
    for (let i = 0; i < stripesTop.length; i++) {
      const [c, s] = stripesTop[i] as [string, number];
      ctx.fillStyle = c;
      ctx.fillRect(0, h * (0.02 + i * 0.01), w, h * (s as number));
    }

    // Distant kawaii hills (pastel mint/lavender rolling shapes, behind lawn)
    ctx.save();
    const lawnTopY = oy - h * 0.04;
    ctx.fillStyle = '#E8FBEF';
    ctx.beginPath();
    ctx.moveTo(0, lawnTopY + h * 0.05);
    ctx.quadraticCurveTo(w * 0.15, lawnTopY - h * 0.02, w * 0.32, lawnTopY + h * 0.02);
    ctx.quadraticCurveTo(w * 0.48, lawnTopY + h * 0.06, w * 0.65, lawnTopY + h * 0.00);
    ctx.quadraticCurveTo(w * 0.82, lawnTopY - h * 0.04, w, lawnTopY + h * 0.03);
    ctx.lineTo(w, lawnTopY + h * 0.09);
    ctx.lineTo(0, lawnTopY + h * 0.09);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#F3E9FF';
    ctx.beginPath();
    ctx.moveTo(0, lawnTopY + h * 0.08);
    ctx.quadraticCurveTo(w * 0.22, lawnTopY + h * 0.01, w * 0.45, lawnTopY + h * 0.06);
    ctx.quadraticCurveTo(w * 0.70, lawnTopY + h * 0.11, w, lawnTopY + h * 0.06);
    ctx.lineTo(w, lawnTopY + h * 0.14);
    ctx.lineTo(0, lawnTopY + h * 0.14);
    ctx.closePath(); ctx.fill();
    ctx.restore();

    // --- Cute lawn tiles: alternating pastel mint / cream green, dotted texture ---
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const tx = ox + c * cellW;
        const ty = oy + r * cellH;
        const isDark = (r + c) % 2 === 0;
        const tile = ctx.createLinearGradient(tx, ty, tx, ty + cellH);
        if (isDark) { tile.addColorStop(0, '#D7F3E3'); tile.addColorStop(1, '#BFE8CC'); }
        else        { tile.addColorStop(0, '#EAFBE5'); tile.addColorStop(1, '#D4F2D2'); }
        ctx.fillStyle = tile;
        const pad = 2;
        roundRect(ctx, tx + pad, ty + pad, cellW - pad * 2, cellH - pad * 2, Math.min(cellW, cellH) * 0.18, true, false);
        // Top highlight rim
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        roundRect(ctx, tx + pad + 2, ty + pad + 2, cellW - pad * 2 - 4, (cellH - pad * 2) * 0.22, Math.min(cellW, cellH) * 0.12, true, false);
        // Grass tufts (mini dots)
        ctx.fillStyle = 'rgba(92,148,112,0.25)';
        for (let k = 0; k < 5; k++) {
          const dx = tx + 6 + ((c * 17 + k * 31 + r * 5) % (cellW - 14));
          const dy = ty + cellH - 10 + ((k + r) % 3) * 3;
          ctx.beginPath(); ctx.ellipse(dx, dy, 1.6, 2.8, -0.2 + (k % 3) * 0.2, 0, Math.PI * 2); ctx.fill();
        }
        // Subtle tile border
        ctx.strokeStyle = 'rgba(123,201,166,0.22)';
        ctx.lineWidth = 1;
        roundRect(ctx, tx + pad, ty + pad, cellW - pad * 2, cellH - pad * 2, Math.min(cellW, cellH) * 0.18, false, true);
      }
    }

    // --- Lawn shadow from house side (soft)
    const lawnOverlay = ctx.createLinearGradient(0, oy, ox + cellW * 0.8, oy);
    lawnOverlay.addColorStop(0,   'rgba(212,197,249,0.16)');
    lawnOverlay.addColorStop(0.5, 'rgba(255,209,220,0.06)');
    lawnOverlay.addColorStop(1,   'rgba(255,255,255,0)');
    ctx.fillStyle = lawnOverlay;
    ctx.fillRect(0, oy - 6, ox + cellW, GRID_ROWS * cellH + 12);

    // --- Kawaii Macaron House ---
    // 1. House side lane (left strip) - lavender → pink → cream gradient
    const hsg = ctx.createLinearGradient(0, oy, ox, oy);
    hsg.addColorStop(0,   '#F6E4FF');
    hsg.addColorStop(0.5, '#FFE7EF');
    hsg.addColorStop(1,   '#FFF6EC');
    ctx.fillStyle = hsg;
    roundRect(ctx, 0, oy - 4, Math.max(0, ox - 6), GRID_ROWS * cellH + 8, 18, true, false);

    // 2. Soft floor path dots
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (let dy = oy + 12; dy < oy + GRID_ROWS * cellH - 4; dy += 18) {
      ctx.beginPath(); ctx.arc(ox * 0.55, dy, 1.8, 0, Math.PI * 2); ctx.fill();
    }

    // 3. Main house body (round-bottom card shape)
    const dW = Math.max(56, ox * 0.5);
    const dH = Math.max(88, cellH * GRID_ROWS * 0.82);
    const dX = (ox - dW) / 2;
    const dY = oy + (GRID_ROWS * cellH - dH) / 2;
    // House body: pastel cream + pink bottom
    const bodyG = ctx.createLinearGradient(dX, dY, dX, dY + dH);
    bodyG.addColorStop(0,   '#FFFFFF');
    bodyG.addColorStop(0.55,'#FFF1E4');
    bodyG.addColorStop(1,   '#FFD6DA');
    ctx.fillStyle = bodyG;
    roundRect(ctx, dX, dY, dW, dH, [22, 22, 14, 14], true, false);
    // Thick white outer stroke (kawaii outline)
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 4;
    roundRect(ctx, dX, dY, dW, dH, [22, 22, 14, 14], false, true);
    ctx.strokeStyle = 'rgba(247,160,114,0.45)'; ctx.lineWidth = 1.5;
    roundRect(ctx, dX + 2, dY + 2, dW - 4, dH - 4, [20, 20, 13, 13], false, true);

    // 4. Roof: pink macaron wavy
    const rY = dY - dH * 0.18;
    ctx.fillStyle = '#FFB7CE';
    ctx.beginPath();
    ctx.moveTo(dX - 10, dY + 10);
    ctx.quadraticCurveTo(dX + dW * 0.10, rY - 2, dX + dW * 0.35, dY - 4);
    ctx.quadraticCurveTo(dX + dW * 0.50, rY - 10, dX + dW * 0.65, dY - 4);
    ctx.quadraticCurveTo(dX + dW * 0.90, rY - 2, dX + dW + 10, dY + 10);
    ctx.lineTo(dX + dW + 6, dY + 16);
    ctx.lineTo(dX - 6, dY + 16);
    ctx.closePath(); ctx.fill();
    // Roof frosting drip
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    for (let k = 0; k <= 10; k++) {
      const t = k / 10;
      const fx = (dX - 10) + (dW + 20) * t;
      const fy = dY + 10 + Math.sin(t * Math.PI * 3) * 2;
      const dr = 3.5 + (k % 2) * 1.5;
      ctx.moveTo(fx + dr, fy);
      ctx.arc(fx, fy, dr, 0, Math.PI, false);
    }
    ctx.fill();
    // Roof cherry on top (strawberry)
    const stX = dX + dW / 2, stY = rY - 2;
    ctx.fillStyle = '#F38BA8';
    ctx.beginPath(); ctx.ellipse(stX, stY, 7.5, 9.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.ellipse(stX - 2.5, stY - 3, 1.6, 2.4, -0.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4CAF50';
    ctx.beginPath(); ctx.ellipse(stX + 0.5, stY - 8.5, 4, 2.2, 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(stX - 1.5, stY - 9, 2.2, 1.5, -0.3, 0, Math.PI * 2); ctx.fill();
    // Seeds
    ctx.fillStyle = '#FFF3B0';
    [[-3, -1], [2, 0.5], [-0.5, 3], [3.5, 3]].forEach(([sx, sy]) => {
      ctx.beginPath(); ctx.ellipse(stX + sx, stY + sy, 0.8, 0.5, 0, 0, Math.PI * 2); ctx.fill();
    });

    // 5. Door: woody peach with golden knob
    const doorW = dW * 0.46, doorH = dH * 0.48;
    const doorX = dX + (dW - doorW) / 2, doorY = dY + dH - doorH - 10;
    const dg = ctx.createLinearGradient(doorX, doorY, doorX, doorY + doorH);
    dg.addColorStop(0, '#FFD7BA'); dg.addColorStop(1, '#FFBB94');
    ctx.fillStyle = dg;
    roundRect(ctx, doorX, doorY, doorW, doorH, [doorW * 0.45, doorW * 0.45, 8, 8], true, false);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2.2;
    roundRect(ctx, doorX, doorY, doorW, doorH, [doorW * 0.45, doorW * 0.45, 8, 8], false, true);
    ctx.strokeStyle = 'rgba(247,160,114,0.55)'; ctx.lineWidth = 1.2;
    roundRect(ctx, doorX + 2, doorY + 2, doorW - 4, doorH - 4, [doorW * 0.42, doorW * 0.42, 7, 7], false, true);
    // Door knob
    ctx.fillStyle = '#FFD54F';
    ctx.beginPath(); ctx.arc(doorX + doorW - 8, doorY + doorH / 2 + 2, 2.8, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(181,136,28,0.6)'; ctx.lineWidth = 0.8; ctx.stroke();
    // Door eyes ^_^ (small kawaii)
    ctx.fillStyle = '#7A5C4E';
    ctx.beginPath(); ctx.arc(doorX + doorW * 0.35, doorY + doorH * 0.28, 1.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(doorX + doorW * 0.65, doorY + doorH * 0.28, 1.4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#7A5C4E'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(doorX + doorW / 2, doorY + doorH * 0.42, 3.2, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();

    // 6. Windows: macaron circles w/ sky blue + plus pane + cheeks
    const winR = Math.min(14, dW * 0.16);
    const winPairs = [
      { wy: dY + dH * 0.14, tint: '#C7E9FF' },
      { wy: dY + dH * 0.54, tint: '#D4F2E1' },
    ];
    for (const pair of winPairs) {
      [-1, 1].forEach((side, si) => {
        const wx = dX + dW / 2 + side * (dW * 0.30);
        const wy = pair.wy + (si === 1 ? 6 : 0);
        // pane outer
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath(); ctx.arc(wx, wy, winR + 2, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(247,160,114,0.55)'; ctx.lineWidth = 1.4; ctx.stroke();
        // window glass
        const wg = ctx.createRadialGradient(wx - winR * 0.35, wy - winR * 0.35, 1, wx, wy, winR);
        wg.addColorStop(0, '#FFFFFF'); wg.addColorStop(1, pair.tint);
        ctx.fillStyle = wg;
        ctx.beginPath(); ctx.arc(wx, wy, winR, 0, Math.PI * 2); ctx.fill();
        // crossbars
        ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(wx - winR, wy); ctx.lineTo(wx + winR, wy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(wx, wy - winR); ctx.lineTo(wx, wy + winR); ctx.stroke();
        // shine
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath(); ctx.ellipse(wx - winR * 0.45, wy - winR * 0.45, winR * 0.22, winR * 0.14, -0.6, 0, Math.PI * 2); ctx.fill();
        // cheek blush under window
        ctx.fillStyle = 'rgba(255,154,173,0.55)';
        ctx.beginPath(); ctx.ellipse(wx + side * (winR + 5), wy + 3, 3.6, 2.2, 0, 0, Math.PI * 2); ctx.fill();
      });
    }

    // 7. Little chimney (macaron lavender) with heart smoke
    const chX = dX + dW * 0.18, chY = dY - 6;
    ctx.fillStyle = '#D4C5F9';
    roundRect(ctx, chX, chY - 20, 10, 22, 3, true, false);
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2;
    roundRect(ctx, chX, chY - 20, 10, 22, 3, false, true);
    const smokeT = performance.now() / 900;
    for (let i = 0; i < 3; i++) {
      const sr = 4 + ((smokeT + i) % 3) * 2.5;
      const sa = 0.6 - ((smokeT + i) % 3) * 0.18;
      ctx.fillStyle = `rgba(212,197,249,${Math.max(0.15, sa)})`;
      ctx.beginPath(); ctx.arc(chX + 5 - ((smokeT * 8 + i * 5) % 12), chY - 22 - (smokeT * 10 + i * 8) % 22, sr, 0, Math.PI * 2); ctx.fill();
      // Tiny heart inside smoke
      if (i === 1) {
        const hx = chX + 5 - ((smokeT * 8 + i * 5) % 12) - 1.5;
        const hy = chY - 22 - (smokeT * 10 + i * 8) % 22;
        ctx.fillStyle = `rgba(243,139,168,${Math.max(0.3, sa + 0.15)})`;
        const s = 2.2;
        ctx.beginPath();
        ctx.moveTo(hx, hy + s * 0.5);
        ctx.bezierCurveTo(hx, hy, hx - s, hy, hx - s, hy + s * 0.35);
        ctx.bezierCurveTo(hx - s, hy + s * 0.8, hx, hy + s * 1.05, hx, hy + s * 1.25);
        ctx.bezierCurveTo(hx, hy + s * 1.05, hx + s, hy + s * 0.8, hx + s, hy + s * 0.35);
        ctx.bezierCurveTo(hx + s, hy, hx, hy, hx, hy + s * 0.5);
        ctx.fill();
      }
    }

    // --- Plant hover highlight (soft ring) ---
    if (state.selectedPlant) {
      ctx.save();
      for (let r = 0; r < GRID_ROWS; r++) for (let c = 0; c < GRID_COLS; c++) {
        if (state.plants.some(p => p.row === r && p.col === c)) continue;
        const hx = ox + c * cellW, hy = oy + r * cellH;
        // Pulse ring
        const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 260 + (r + c) * 0.3);
        ctx.strokeStyle = `rgba(243,139,168,${0.55 * pulse})`;
        ctx.lineWidth = 2;
        roundRect(ctx, hx + 5, hy + 5, cellW - 10, cellH - 10, 10, false, true);
        ctx.fillStyle = `rgba(255,255,255,${0.12 * pulse})`;
        roundRect(ctx, hx + 5, hy + 5, cellW - 10, cellH - 10, 10, true, false);
      }
      ctx.restore();
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
      let trailColor: string; let coreColor1: string; let coreColor2: string; let coreColor3: string; let type = 'pea';
      if (pr.slow) { trailColor = 'rgba(100,200,255,0.25)'; coreColor1 = '#E1F5FE'; coreColor2 = '#4FC3F7'; coreColor3 = '#0277BD'; }
      else if (pr.splash) { type = 'pepper'; trailColor = 'rgba(255,112,67,0.3)'; coreColor1 = '#FFCCBC'; coreColor2 = '#FF7043'; coreColor3 = '#BF360C'; }
      else { trailColor = 'rgba(139,195,74,0.25)'; coreColor1 = '#DCEDC8'; coreColor2 = '#8BC34A'; coreColor3 = '#33691E'; }
      ctx.fillStyle = trailColor;
      ctx.beginPath(); ctx.ellipse(pr.x - ps * 1.5, py, ps * 2, ps * 0.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.shadowColor = pr.slow ? '#29B6F6' : pr.splash ? '#FF5722' : '#8BC34A'; ctx.shadowBlur = 6;
      const pg = ctx.createRadialGradient(pr.x - ps * 0.2, py - ps * 0.2, 0, pr.x, py, ps);
      pg.addColorStop(0, coreColor1); pg.addColorStop(0.5, coreColor2); pg.addColorStop(1, coreColor3);
      ctx.fillStyle = pg;
      if (type === 'pepper') {
        // Chili shaped
        ctx.save(); ctx.translate(pr.x, py); ctx.rotate(-0.4);
        ctx.beginPath(); ctx.ellipse(0, 0, ps * 1.3, ps * 0.9, 0, 0, Math.PI * 2); ctx.fill();
        // Stem
        ctx.fillStyle = '#2E7D32';
        ctx.beginPath(); ctx.ellipse(ps * 0.9, -ps * 0.3, ps * 0.25, ps * 0.15, -0.6, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      } else {
        ctx.beginPath(); ctx.arc(pr.x, py, ps, 0, Math.PI * 2); ctx.fill();
      }
      ctx.shadowBlur = 0;
    }

    // Lightning bolts
    ctx.lineCap = 'round';
    for (const lb of state.lightningBolts) {
      const a = lb.timer / lb.maxTimer;
      ctx.strokeStyle = `rgba(233,30,99,${a * 0.9})`; ctx.lineWidth = 3;
      ctx.beginPath();
      let lx = lb.x1; let ly = lb.y1;
      ctx.moveTo(lx, ly);
      const segs = 6;
      for (let i = 1; i <= segs; i++) {
        const t = i / segs;
        const nx = lb.x1 + (lb.x2 - lb.x1) * t + (Math.random() - 0.5) * cellW * 0.2;
        const ny = lb.y1 + (lb.y2 - lb.y1) * t + (Math.random() - 0.5) * cellH * 0.2;
        ctx.lineTo(nx, ny);
      }
      ctx.stroke();
      // Inner bright line
      ctx.strokeStyle = `rgba(255,243,224,${a * 0.9})`; ctx.lineWidth = 1.2;
      ctx.stroke();
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

    // Pickups
    for (const pk of state.pickups) {
      if (pk.collected) continue;
      const pkBob = Math.sin(pk.bobPhase) * 4;
      const pkY = oy + pk.row * cellH + cellH * 0.5 + pkBob;
      const pkAlpha = pk.timer < 2000 ? (0.5 + Math.sin(now * 0.01) * 0.5) : 1;
      ctx.globalAlpha = pkAlpha;
      const glow = ctx.createRadialGradient(pk.x, pkY, 0, pk.x, pkY, cellW * 0.3);
      if (pk.type === 'sun') { glow.addColorStop(0, 'rgba(255,213,79,0.5)'); glow.addColorStop(1, 'rgba(255,213,79,0)'); }
      else if (pk.type === 'double') { glow.addColorStop(0, 'rgba(255,111,0,0.5)'); glow.addColorStop(1, 'rgba(255,111,0,0)'); }
      else { glow.addColorStop(0, 'rgba(100,200,255,0.5)'); glow.addColorStop(1, 'rgba(100,200,255,0)'); }
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(pk.x, pkY, cellW * 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.font = `${Math.max(16, cellW * 0.35)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(pk.type === 'sun' ? '☀️' : pk.type === 'double' ? '⚡' : '🧊', pk.x, pkY);
      ctx.globalAlpha = 1;
    }
    // Particles
    for (const p of state.particles) {
      ctx.globalAlpha = p.alpha; ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.5, p.size), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

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
    // Double damage border
    if (now < state.doubleDamageEnd) {
      const dp = 0.3 + Math.sin(now * 0.008) * 0.15;
      ctx.strokeStyle = `rgba(255,111,0,${dp})`; ctx.lineWidth = 3; ctx.strokeRect(2, 2, w - 4, h - 4);
      ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(255,111,0,${0.7 + Math.sin(now * 0.006) * 0.3})`;
      ctx.fillText('⚡ 双倍伤害!', w / 2, 22);
    }
    // Wave countdown
    if (state.waveCountdown > 0) {
      const sec = Math.ceil(state.waveCountdown / 1000);
      const cAlpha = 0.6 + Math.sin(now * 0.008) * 0.3;
      ctx.globalAlpha = cAlpha;
      ctx.font = 'bold 40px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 4;
      ctx.strokeText(`${sec}`, w / 2, h / 2 + 15);
      ctx.fillStyle = '#FFF'; ctx.fillText(`${sec}`, w / 2, h / 2 + 15);
      ctx.font = '16px sans-serif';
      ctx.strokeText('准备防御!', w / 2, h / 2 + 45);
      ctx.fillStyle = '#FFE082'; ctx.fillText('准备防御!', w / 2, h / 2 + 45);
      ctx.globalAlpha = 1;
    }
    // Screen flash
    if (state.screenFlash > 0) {
      const flashAlpha = Math.min(1, state.screenFlash / 200);
      ctx.fillStyle = state.screenFlashColor;
      ctx.globalAlpha = flashAlpha;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
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
  const victoryAccuracy = state?.wordsAnswered ? state.wordsCorrect / state.wordsAnswered : 0;
  const victoryStars = victoryAccuracy >= 0.9 ? 3 : victoryAccuracy >= 0.7 ? 2 : victoryAccuracy >= 0.5 ? 1 : 0;

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden select-none">
      {phase === 'menu' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-5 relative overflow-hidden py-6 px-3 md:py-10 md:px-4">
          {/* Macaron floating deco (reduced, low opacity) */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="absolute select-none"
                style={{
                  left: `${(i * 97) % 100}%`,
                  top: `${(i * 53) % 100}%`,
                  fontSize: `${20 + (i % 4) * 6}px`,
                  opacity: 0.38,
                  animation: `floatBlob ${7 + (i % 5)}s ease-in-out ${i * 0.4}s infinite`,
                  filter: 'drop-shadow(0 6px 14px rgba(122,92,78,0.10))',
                }}>
                {['🌸','🍋','🌿','☁️','🍩','🍑','🫧','🍓','🌼','🍭'][i % 10]}
              </div>
            ))}
          </div>
          {/* Big soft blobs (more subtle) */}
          <div className="absolute -top-24 -left-20 w-80 h-80 rounded-full pointer-events-none" style={{ background: 'var(--macaron-pink)', filter: 'blur(80px)', opacity: 0.42 }} />
          <div className="absolute -bottom-28 -right-16 w-96 h-96 rounded-full pointer-events-none" style={{ background: 'var(--macaron-mint)', filter: 'blur(90px)', opacity: 0.4 }} />
          <div className="absolute top-1/3 right-1/4 w-60 h-60 rounded-full pointer-events-none" style={{ background: 'var(--macaron-lavender)', filter: 'blur(80px)', opacity: 0.3 }} />

          {/* ============== 农场横幅 ============== */}
          <div className="relative z-10 w-full max-w-3xl flex justify-center">
            <div className="relative w-full" style={{ filter: 'drop-shadow(0 16px 40px rgba(243,139,168,0.22))' }}>
              <FarmHeroBanner/>
              {/* 彩虹色小横幅：FARM LIFE / English Learning */}
              <div className="absolute left-1/2 top-4 -translate-x-1/2 flex items-center gap-2">
                <span className="h-0.5 w-10 rounded-full" style={{ background: 'linear-gradient(90deg, transparent, #FFFFFF)' }}/>
                <div className="rounded-full px-3.5 py-1 text-[10px] md:text-[11px] font-black tracking-[0.22em] flex items-center gap-1.5"
                  style={{
                    background: 'linear-gradient(90deg, #FFD1DC, #FFF3B0, #B5EAD7, #C7E9FF, #D4C5F9)',
                    color: '#3E2723',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), 0 4px 14px rgba(243,139,168,0.25)',
                    border: '2px solid rgba(255,255,255,0.95)',
                  }}>
                  <span>🌾</span> FARM LIFE · 快乐庄园 <span>🌾</span>
                </div>
                <span className="h-0.5 w-10 rounded-full" style={{ background: 'linear-gradient(90deg, #FFFFFF, transparent)' }}/>
              </div>
            </div>
          </div>

          {/* ============== 品牌标题区 ============== */}
          <div className="relative z-10 text-center max-w-3xl px-1 -mt-2">
            <div className="flex items-center justify-center gap-2 mb-1">
              {/* Logo 小 icon */}
              <div className="w-11 h-11 md:w-14 md:h-14 rounded-2xl flex items-center justify-center animate-float-slow"
                style={{
                  background: 'linear-gradient(145deg, #FFF6C2, #FFD1DC 60%, #D4C5F9)',
                  boxShadow: '0 6px 20px rgba(243,139,168,0.35), inset 0 2px 0 rgba(255,255,255,0.9)',
                  border: '2.5px solid rgba(255,255,255,0.95)',
                  animationDelay: '-1s',
                }}>
                <IconSun size={28}/>
              </div>
              <h1 className="text-3xl md:text-6xl font-black tracking-tight kawaii-gradient-text leading-tight"
                style={{ filter: 'drop-shadow(0 6px 16px rgba(243,139,168,0.28))' }}>
                单词农场
              </h1>
              <div className="w-11 h-11 md:w-14 md:h-14 rounded-2xl flex items-center justify-center animate-float-slow"
                style={{
                  background: 'linear-gradient(145deg, #B5EAD7, #C7E9FF 50%, #D4C5F9)',
                  boxShadow: '0 6px 20px rgba(122,201,166,0.32), inset 0 2px 0 rgba(255,255,255,0.9)',
                  border: '2.5px solid rgba(255,255,255,0.95)',
                }}>
                {(() => {
                  const S = PlantIcon.peashooter;
                  return S ? <S size={28}/> : <span>🌱</span>;
                })()}
              </div>
            </div>
            <div className="flex items-center justify-center gap-2.5 mt-0.5">
              <span className="h-0.5 flex-1 max-w-14 rounded-full" style={{ background: 'linear-gradient(90deg, transparent, var(--macaron-pink-deep))' }} />
              {/* Tag badges */}
              <span className="px-2.5 py-0.5 rounded-full text-[10px] md:text-xs font-black flex items-center gap-1"
                style={{ background: 'rgba(255,255,255,0.88)', color: 'var(--macaron-pink-deep)', border: '1.5px solid var(--macaron-pink)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.95)' }}>
                🪴 植物大战僵尸
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] md:text-xs font-black flex items-center gap-1"
                style={{ background: 'rgba(255,255,255,0.88)', color: 'var(--macaron-sky-deep)', border: '1.5px solid var(--macaron-sky)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.95)' }}>
                📖 英语背单词
              </span>
              <span className="h-0.5 flex-1 max-w-14 rounded-full" style={{ background: 'linear-gradient(90deg, var(--macaron-mint-deep), transparent)' }} />
            </div>
            {/* Tagline */}
            <p className="mt-3 text-sm md:text-xl font-bold leading-snug px-4"
              style={{ color: '#6D4C41', textShadow: '0 1px 0 rgba(255,255,255,0.9)' }}>
              🌱 种一片农场 &nbsp;·&nbsp; 背一本单词 &nbsp;·&nbsp; 守卫你的小屋 🏠
            </p>
          </div>

          {/* ============== 玩法卡片 ============== */}
          <div className="kawaii-card mt-0 px-6 py-4 md:px-7 md:py-5 max-w-xl w-full z-10">
            {[
              { iconEl: <IconQuiz size={20}/>, text: '答对单词自动获得阳光', col: 'var(--macaron-lemon)', colDeep: 'var(--macaron-lemon-deep)' },
              { iconEl: (()=>{const C=PlantIcon.peashooter;return C?<C size={22}/>:<span>🌱</span>;})(), text: '用阳光种植植物抵御僵尸', col: 'var(--macaron-mint)', colDeep: 'var(--macaron-mint-deep)' },
              { iconEl: <IconStar size={20}/>, text: '击杀僵尸可掉落增益道具', col: 'var(--macaron-sky)', colDeep: 'var(--macaron-sky-deep)' },
              { iconEl: <IconSun size={20}/>, text: '连续答对触发连击奖励加成', col: 'var(--macaron-peach)', colDeep: 'var(--macaron-peach-deep)' },
              { iconEl: <IconWave size={20}/>, text: '不要让僵尸到达你的房子!', col: 'var(--macaron-lavender)', colDeep: 'var(--macaron-lavender-deep)' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3 justify-start md:justify-center py-1.5">
                <span className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `linear-gradient(135deg, ${item.col}, #FFFFFF 140%)`, boxShadow: `inset 0 1.5px 0 rgba(255,255,255,0.85), 0 3px 0 ${item.colDeep}33` }}>
                  {item.iconEl}
                </span>
                <span className="font-black text-sm md:text-base" style={{ color: 'var(--foreground)' }}>{item.text}</span>
              </div>
            ))}
          </div>
          <button onClick={initGame}
            className="kawaii-btn kawaii-btn-primary mt-3 px-14 py-4 text-xl md:text-2xl z-10 relative group">
            <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent"
              style={{ animation: 'shine 3s ease-in-out infinite', borderRadius: 9999 }} />
            <span className="relative z-10 flex items-center gap-2.5">
              <svg viewBox="0 0 24 24" width={22} height={22} fill="none">
                <circle cx="12" cy="12" r="10.5" fill="#FFFFFF" fillOpacity="0.3"/>
                <path d="M 10 7.5 L 18.5 12 L 10 16.5 Z" fill="#FFFFFF"/>
              </svg>
              开始游戏
            </span>
          </button>
          <div className="kawaii-card-soft z-10 flex items-center gap-2 text-xs font-bold px-4 py-2 mt-0.5"
            style={{ color: 'var(--muted-foreground)' }}>
            <span className="animate-sparkle">💡</span>
            <span>先答题拿阳光，再选择植物种下，守卫庄园！</span>
          </div>
        </div>
      )}

      {(phase === 'playing' || phase === 'gameover' || phase === 'victory') && state && (
        <React.Fragment>
          {/* HUD - Macaron Pastel Style */}
          <div className="flex items-center justify-between px-3.5 py-2.5 relative z-10 flex-shrink-0"
            style={{
              background: 'linear-gradient(180deg, #FFE5EC 0%, #FFD1DC 40%, #D4C5F9 100%)',
              borderBottom: '3px solid rgba(255,255,255,0.75)',
              boxShadow:
                'inset 0 1px 0 rgba(255,255,255,0.9),' +
                '0 6px 0 rgba(255,209,220,0.55),' +
                '0 14px 32px -16px rgba(243,139,168,0.35)',
            }}>
            <div className="kawaii-badge flex items-center gap-2 px-3 py-1.5"
              style={{
                background: 'linear-gradient(135deg, #FFF6C2, #FFE99F)',
                color: '#5A4522',
              }}>
              <div className="w-9 h-9 rounded-full flex items-center justify-center relative"
                style={{ background: 'radial-gradient(circle at 30% 30%, #FFF9C4, #FFEB8A 70%, #FFD54F)', boxShadow: '0 0 14px rgba(255,213,79,0.55), inset 0 -1.5px 2px rgba(0,0,0,0.08)', border: '1.5px solid #fff' }}>
                <IconSun size={28}/>
              </div>
              <span className="font-black text-2xl tabular-nums min-w-[52px] tracking-tight" style={{ color: '#3E2723', textShadow: '0 1px 0 rgba(255,255,255,0.55)' }}>{state.sun}</span>
            </div>
            <div className="flex items-center gap-2 text-xs md:text-sm">
              {[
                { key: 'wave', label: 'WAVE', iconEl: <IconWave size={14}/>, render: () => (<><span style={{ color: '#3E2723' }}>{state.wave + 1}</span><span style={{ color: 'rgba(141,110,99,0.55)' }} className="text-sm">/{WAVE_CONFIGS.length}</span></>), col: 'var(--macaron-sky)', colDeep: 'var(--macaron-sky-deep)' },
                { key: 'score', label: 'SCORE', iconEl: <IconStar size={14}/>, render: () => <span style={{ color: '#3E2723' }}>{state.score}</span>, col: 'var(--macaron-lemon)', colDeep: 'var(--macaron-lemon-deep)', hide: 'hidden sm:block' },
                { key: 'quiz', label: 'QUIZ', iconEl: <IconQuiz size={14}/>, render: () => (<><span style={{ color: '#2E7D32' }}>{state.wordsCorrect}</span><span style={{ color: '#A1887F' }}>/</span><span style={{ color: '#3E2723' }}>{state.wordsAnswered}</span></>), col: 'var(--macaron-mint)', colDeep: 'var(--macaron-mint-deep)' },
              ].map(c => (
                <div key={c.key} className={`rounded-2xl px-3 py-2 text-center relative ${c.hide ?? ''}`}
                  style={{
                    background: `linear-gradient(180deg, #FFFFFFE8, ${c.col}88)`,
                    boxShadow: `inset 0 1.5px 0 rgba(255,255,255,0.9), 0 3px 0 ${c.colDeep}55, 0 4px 14px -8px ${c.colDeep}55`,
                    border: `2px solid rgba(255,255,255,0.85)`,
                    minWidth: '82px',
                  }}>
                  <div className="text-[9px] leading-tight font-black tracking-wider flex items-center justify-center gap-1"
                    style={{ color: c.colDeep }}>
                    {c.iconEl}<span>{c.label}</span>
                  </div>
                  <div className="font-black text-base leading-tight mt-0.5">{c.render()}</div>
                </div>
              ))}
              {state.comboCount >= 3 && (
                <div className="rounded-2xl px-3.5 py-2 relative overflow-hidden animate-bounce-in"
                  style={{
                    background: 'linear-gradient(135deg, #FFB6CE 0%, #FF90B8 50%, #F7A072 100%)',
                    backgroundSize: '200% 200%',
                    animation: 'rainbow-bg 1.5s ease infinite',
                    boxShadow: '0 0 18px rgba(243,139,168,0.55), inset 0 1.5px 0 rgba(255,255,255,0.6)',
                    border: '2px solid rgba(255,255,255,0.55)',
                  }}>
                  <div className="font-black text-base tracking-wide flex items-center gap-1" style={{ color: '#FFFFFF', textShadow: '0 1.5px 3px rgba(0,0,0,0.18)' }}>
                    <span className="animate-wiggle inline-block">🔥</span>x{state.comboCount}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ===== Plant Selection Toolbar - Macaron Pastel ===== */}
          <div className="flex items-center gap-2 px-2.5 py-2.5 flex-shrink-0 relative z-10 overflow-x-auto"
            style={{
              background: 'linear-gradient(180deg, #FFF9F2 0%, #F0FDF4 55%, #EDE9FE 100%)',
              borderBottom: '3px solid rgba(255,255,255,0.9)',
              boxShadow:
                'inset 0 1px 0 rgba(255,255,255,0.95),' +
                '0 4px 0 rgba(181,234,215,0.55),' +
                '0 10px 24px -14px rgba(123,201,166,0.35)',
            }}>
            <div className="flex items-center gap-1 flex-shrink-0">
              {PLANT_ORDER.map(type => {
                const def = PLANT_DEFS[type];
                const selected = state.selectedPlant === type;
                const canAfford = state.sun >= def.cost;
                return (
                  <button key={type}
                    onClick={() => { state.selectedPlant = selected ? null : type; forceUpdate(); }}
                    className="flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-2xl transition-all duration-200 flex-shrink-0 relative"
                    style={{
                      background: selected
                        ? 'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(255,248,225,0.95))'
                        : 'linear-gradient(180deg, rgba(255,255,255,0.55), rgba(255,255,255,0.35))',
                      border: selected
                        ? `2.5px solid ${def.color}`
                        : `1.5px solid ${canAfford ? 'rgba(255,183,77,0.3)' : 'rgba(0,0,0,0.06)'}`,
                      boxShadow: selected
                        ? `0 5px 18px ${def.color}38, inset 0 2px 0 rgba(255,255,255,0.95), inset 0 -1px 3px ${def.color}15`
                        : 'inset 0 1.5px 0 rgba(255,255,255,0.75), 0 1px 3px rgba(255,152,0,0.06)',
                      opacity: canAfford ? 1 : 0.42,
                      transform: selected ? 'translateY(-2px) scale(1.06)' : 'translateY(0) scale(1)',
                      cursor: canAfford ? 'pointer' : 'not-allowed',
                    }}>
                    {selected && (
                      <div className="absolute -top-px left-0 right-0 h-1 rounded-t-2xl" style={{ background: def.color }} />
                    )}
                    <div className="relative">
                      {PlantIcon[type]
                        ? <div style={{ filter: selected ? `drop-shadow(0 3px 6px ${def.color}70)` : 'none', transform: selected ? 'scale(1.1)' : 'scale(1)' }}>{React.createElement(PlantIcon[type], { size: 44 })}</div>
                        : <span className="text-2xl leading-none block" style={{ filter: selected ? `drop-shadow(0 3px 6px ${def.color}70)` : 'none', transform: selected ? 'scale(1.1)' : 'scale(1)' }}>{def.emoji}</span>}
                      {selected && (
                        <div className="absolute -top-1.5 -right-1.5 w-4.5 h-4.5 rounded-full flex items-center justify-center text-[9px] font-black"
                          style={{ background: def.color, color: '#fff', boxShadow: `0 2px 6px ${def.color}90`, border: '1.5px solid #fff', width: '18px', height: '18px' }}>✓</div>
                      )}
                    </div>
                    <div className="text-[10px] font-black leading-tight whitespace-nowrap tracking-tight" style={{ color: selected ? def.color : '#5D4037' }}>{def.name}</div>
                    <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md" style={{ background: canAfford ? 'rgba(255,235,59,0.2)' : 'rgba(0,0,0,0.03)' }}>
                      <IconSun size={12}/>
                      <span className="text-[11px] font-black tabular-nums" style={{ color: canAfford ? '#E65100' : '#9E9E9E' }}>{def.cost}</span>
                    </div>
                  </button>
                );
              })}
            </div>
            {state.selectedPlant && (
              <div className="flex-shrink-0 ml-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1 animate-pulse"
                style={{ background: 'linear-gradient(135deg, #C8E6C9, #A5D6A7)', color: '#1B5E20', border: '1px solid rgba(76,175,80,0.3)', boxShadow: '0 2px 6px rgba(76,175,80,0.15)' }}>
                <span>🎯</span> 点击草地种植
              </div>
            )}
            <div className="flex-shrink-0 ml-auto">
              <button onClick={() => { state.selectedPlant = null; forceUpdate(); }}
                className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-150 hover:scale-105 active:scale-95 flex items-center gap-1"
                style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.75), rgba(255,255,255,0.5))', color: '#6D4C41', border: '1.5px solid rgba(0,0,0,0.06)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9)' }}>
                ✕ 取消
              </button>
            </div>
          </div>

          {/* ===== Game Area (Canvas + Overlays) ===== */}
          <div ref={containerRef} className="relative flex-1 min-h-0">
            <canvas ref={canvasRef} onClick={handleCanvasClick}
              className="absolute inset-0 w-full h-full" style={{ cursor: state.selectedPlant ? 'crosshair' : 'default' }} />

            {/* ===== Quiz Panel - Left Side (next to the house) Macaron Style ===== */}
            {quiz && (
              <div className="absolute left-1 top-1 bottom-1 z-20 flex flex-col" style={{ width: 'calc(7% - 4px)', minWidth: '110px', maxWidth: '180px' }}>
                <div className="rounded-[26px] px-2.5 py-3.5 relative overflow-hidden flex flex-col flex-1 min-h-0 kawaii-card"
                  style={{
                    background: 'linear-gradient(170deg, #FFFFFF 0%, #FFF4FB 45%, #F4EEFF 100%)',
                    padding: '14px 10px',
                    border: '2.5px solid #FFFFFF',
                    boxShadow:
                      '0 1px 0 rgba(255,255,255,0.95) inset,' +
                      '0 -3px 0 rgba(255,220,240,0.7) inset,' +
                      '0 6px 0 rgba(212,197,249,0.55),' +
                      '0 16px 36px -16px rgba(167,139,250,0.35)',
                  }}>
                  <div className="absolute top-0 bottom-0 left-0 w-1 rounded-l-[26px]"
                    style={{ background: 'linear-gradient(180deg, #FFD1DC, #D4C5F9, #B5EAD7, #FFD1DC)', backgroundSize: '100% 300%', animation: 'rainbow-bg 4s linear infinite' }} />
                  {quiz.answered ? (
                    <div className="flex flex-col items-center justify-between gap-2 h-full animate-bounce-in">
                      <div className="flex flex-col items-center justify-center gap-2 w-full">
                        <div className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0 relative"
                          style={{
                            background: quiz.wasCorrect
                              ? 'linear-gradient(135deg, #D3F2E3, var(--macaron-mint-deep))'
                              : 'linear-gradient(135deg, #FFD8DE, #EF9A9A)',
                            boxShadow: quiz.wasCorrect
                              ? '0 4px 0 rgba(123,201,166,0.4), inset 0 2px 0 rgba(255,255,255,0.85), 0 8px 22px -10px rgba(76,175,80,0.4)'
                              : '0 4px 0 rgba(239,154,154,0.45), inset 0 2px 0 rgba(255,255,255,0.85), 0 8px 22px -10px rgba(239,83,80,0.35)',
                            border: '3px solid #FFFFFF',
                          }}>
                          <span className="text-3xl relative z-10">{quiz.wasCorrect ? '🥰' : '😵'}</span>
                          <span className="absolute -top-1 -right-1 text-xs animate-sparkle">{quiz.wasCorrect ? '✨' : '💔'}</span>
                        </div>
                        <div className="text-center w-full px-1">
                          {quiz.wasCorrect ? (
                            <div className="kawaii-badge font-black text-base" style={{ background: 'linear-gradient(135deg, #D3F2E3, #B5EAD7)', color: '#1B5E20' }}>+{QUIZ_SUN_REWARD[quiz.word.difficulty]}☀️</div>
                          ) : (
                            <div>
                              <div className="font-black text-lg" style={{ color: '#C62828' }}>答错啦</div>
                              <div className="text-[10px] font-black mt-1 px-2 py-0.5 rounded-full inline-block" style={{ background: 'linear-gradient(135deg, #FFD8DE, #FFB3BA)', color: '#B71C1C', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)' }}>⚡加速!</div>
                            </div>
                          )}
                          <div className="mt-2 pt-2 border-t border-dashed" style={{ borderColor: 'rgba(212,197,249,0.6)' }}>
                            <div className="font-black text-base mb-0.5 truncate" style={{ letterSpacing: '0.02em', color: '#3E2723' }}>{quiz.word.en}</div>
                            {quiz.word.phonetic && <div className="truncate font-semibold mb-0.5" style={{ color: 'var(--macaron-lavender-deep)', fontFamily: "'Lucida Sans Unicode','Arial Unicode MS','Segoe UI',sans-serif", fontSize: '12px' }}>{quiz.word.phonetic}</div>}
                            <div className="truncate text-sm font-bold" style={{ color: '#5D4037' }}>{quiz.word.zh}</div>
                          </div>
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-center rounded-xl px-2 py-1.5 w-full mt-auto"
                        style={{ background: 'linear-gradient(180deg, rgba(255,183,77,0.12), rgba(255,152,0,0.06))', border: '1px solid rgba(255,183,77,0.15)' }}>
                        <div className="text-[9px] font-black tracking-widest" style={{ color: '#8D6E63' }}>NEXT</div>
                        <div className="text-lg font-black tabular-nums leading-tight" style={{ color: '#E65100' }}>{Math.max(0, Math.ceil(state.quizCooldown / 1000))}s</div>
                      </div>
                    </div>
                  ) : (
                    <React.Fragment>
                      <div className="flex flex-col items-center gap-1.5 mb-2">
                        <div className="relative flex-shrink-0" style={{ width: '40px', height: '40px' }}>
                          <svg viewBox="0 0 36 36" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                            <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,152,0,0.08)" strokeWidth="3.5" />
                            <circle cx="18" cy="18" r="15.5" fill="none" stroke={quiz.timer < 3000 ? '#EF5350' : '#FFB74D'} strokeWidth="3.5" strokeLinecap="round"
                              strokeDasharray={`${2 * Math.PI * 15.5}`}
                              strokeDashoffset={`${2 * Math.PI * 15.5 * (1 - quiz.timer / QUIZ_TIME_LIMIT)}`}
                              style={{ transition: 'stroke-dashoffset 0.15s linear, stroke 0.3s', filter: quiz.timer < 3000 ? 'drop-shadow(0 0 5px rgba(239,83,80,0.55))' : 'drop-shadow(0 0 3px rgba(255,183,77,0.35))' }} />
                          </svg>
                          <span className={`absolute inset-0 flex items-center justify-center text-sm font-black tabular-nums ${quiz.timer < 3000 ? 'animate-pulse' : ''}`}
                            style={{ color: quiz.timer < 3000 ? '#D32F2F' : '#5D4037', textShadow: '0 1px 0 rgba(255,255,255,0.5)' }}>{Math.max(0, Math.ceil(quiz.timer / 1000))}</span>
                        </div>
                        <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black flex items-center gap-0.5 flex-shrink-0"
                          style={{
                            background: diff === 1 ? 'linear-gradient(135deg, #C8E6C9, #A5D6A7)' : diff === 2 ? 'linear-gradient(135deg, #FFE082, #FFD54F)' : 'linear-gradient(135deg, #FFAB91, #FF8A65)',
                            color: diff === 1 ? '#1B5E20' : diff === 2 ? '#E65100' : '#B71C1C',
                            boxShadow: diff === 1 ? '0 1.5px 5px rgba(76,175,80,0.2)' : diff === 2 ? '0 1.5px 5px rgba(255,193,7,0.25)' : '0 1.5px 5px rgba(239,83,80,0.2)',
                          }}>
                          {diff === 1 ? '🌱' : diff === 2 ? '⚡' : '🔥'}+{QUIZ_SUN_REWARD[diff]}
                        </span>
                        <div className="w-full text-center">
                          <span className="font-black tracking-wide break-all leading-tight w-full inline-block"
                            style={{
                              fontSize: quiz.word.en.length <= 6 ? '22px' : quiz.word.en.length <= 10 ? '19px' : '16px',
                              color: '#3E2723',
                              textShadow: '0 1px 0 rgba(255,255,255,0.6), 0 0 12px rgba(255,248,225,0.8)',
                              lineHeight: 1.15,
                            }}>{quiz.word.en}</span>
                          {quiz.word.phonetic && (
                            <div className="mt-1 truncate w-full font-semibold"
                              style={{
                                color: '#4A148C',
                                fontSize: quiz.word.en.length <= 8 ? '13px' : '11px',
                                fontFamily: "'Lucida Sans Unicode', 'Arial Unicode MS', 'Segoe UI', 'DejaVu Sans', sans-serif",
                                letterSpacing: '0.02em',
                                textShadow: '0 1px 0 rgba(255,255,255,0.5)',
                              }}>{quiz.word.phonetic}</div>
                          )}
                        </div>
                      </div>
                      <div className="w-full h-1 rounded-full mb-2 overflow-hidden flex-shrink-0" style={{ background: 'rgba(255,152,0,0.06)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.04)' }}>
                        <div className="h-full rounded-full transition-all duration-150"
                          style={{
                            width: `${(quiz.timer / QUIZ_TIME_LIMIT) * 100}%`,
                            background: quiz.timer < 3000
                              ? 'linear-gradient(180deg, #EF5350, #FF5252)'
                              : 'linear-gradient(180deg, #FFB74D, #FFA726, #FF9800)',
                            boxShadow: quiz.timer < 3000 ? '0 0 6px rgba(239,83,80,0.5)' : '0 0 3px rgba(255,183,77,0.3)',
                          }} />
                      </div>
                      <div className="flex flex-col gap-2 flex-1 min-h-0 overflow-y-auto pr-0.5" style={{ scrollbarWidth: 'thin', scrollbarColor: '#FFCC80 transparent' }}>
                        {quiz.options.map((opt, i) => (
                          <button key={i} onClick={() => handleAnswer(i)}
                            className="py-3.5 px-3 rounded-2xl font-black transition-all duration-150 hover:scale-[1.05] active:scale-[0.96] relative overflow-hidden group flex-shrink-0 min-h-[50px] flex items-center justify-center"
                            style={{
                              color: '#3E2723',
                              fontSize: opt.length <= 4 ? '19px' : opt.length <= 8 ? '17px' : opt.length <= 14 ? '15px' : '13px',
                              lineHeight: 1.2,
                              background: 'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(255,248,225,0.94))',
                              border: `2px solid ${['rgba(239,83,80,0.3)', 'rgba(255,152,0,0.3)', 'rgba(76,175,80,0.3)', 'rgba(66,165,245,0.3)'][i % 4]}`,
                              boxShadow: `0 3px 10px rgba(0,0,0,0.08), 0 1px 3px ${['rgba(239,83,80,0.06)', 'rgba(255,152,0,0.06)', 'rgba(76,175,80,0.06)', 'rgba(66,165,245,0.06)'][i % 4]}, inset 0 2px 0 rgba(255,255,255,0.95)`,
                            }}>
                            <span className="break-words text-center leading-snug w-full px-1">{opt}</span>
                          </button>
                        ))}
                      </div>
                    </React.Fragment>
                  )}
                </div>
              </div>
            )}

            {/* ===== Game Over Overlay - Macaron Pastel ===== */}
            {phase === 'gameover' && (
              <div className="absolute inset-0 flex items-center justify-center z-30 px-2"
                style={{ background: 'rgba(58,46,57,0.55)', backdropFilter: 'blur(14px)' }}>
                <div className="kawaii-card text-center max-w-sm w-full mx-auto overflow-hidden relative animate-bounce-in"
                  style={{ padding: 0 }}>
                  <div className="absolute inset-0 pointer-events-none"
                    style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(255,209,220,0.4), transparent 60%), radial-gradient(ellipse at 80% 100%, rgba(255,218,193,0.35), transparent 55%)' }} />
                  <div className="py-7 px-6 relative">
                    <div className="absolute top-0 left-0 right-0 h-1.5"
                      style={{ background: 'linear-gradient(90deg, #FFD1DC, #FFDAC1, #FFF3B0, #B5EAD7, #D4C5F9, #FFD1DC)', backgroundSize: '300% 100%', animation: 'rainbow-bg 4s linear infinite' }} />
                    <div className="flex justify-center mb-3 gap-3 opacity-80 text-3xl">
                      <span className="animate-wiggle inline-block" style={{ animationDelay: '0s' }}>🌸</span>
                      <span className="animate-wiggle inline-block" style={{ animationDelay: '-0.5s' }}>🍃</span>
                      <span className="animate-wiggle inline-block" style={{ animationDelay: '-1s' }}>🌸</span>
                    </div>
                    <div className="text-6xl mb-4 animate-float-slow"
                      style={{ filter: 'drop-shadow(0 10px 24px rgba(247,160,114,0.35))' }}>
                      😿
                    </div>
                    <h2 className="text-4xl font-black tracking-tight kawaii-gradient-text">
                      游戏结束
                    </h2>
                    <p className="text-base mt-2 font-bold" style={{ color: '#8D6E63' }}>
                      僵尸突破了防线... 下次一定！
                    </p>
                  </div>
                  <div className="px-5 pb-4 relative z-10">
                    <div className="grid grid-cols-2 gap-2.5 text-sm">
                      {[
                        { icon: '🌊', label: '存活波次', value: `${state.wave + 1}/${WAVE_CONFIGS.length}`, col: 'var(--macaron-sky)', colDeep: 'var(--macaron-sky-deep)' },
                        { icon: '⚔️', label: '消灭僵尸', value: `${state.totalKills}`,                   col: 'var(--macaron-pink)', colDeep: 'var(--macaron-pink-deep)' },
                        { icon: '🔥', label: '最高连击', value: `${state.bestCombo}`,                     col: 'var(--macaron-peach)', colDeep: 'var(--macaron-peach-deep)' },
                        { icon: '📝', label: '答题正确率', value: `${state.wordsAnswered > 0 ? Math.round(state.wordsCorrect / state.wordsAnswered * 100) : 0}%`, col: 'var(--macaron-mint)', colDeep: 'var(--macaron-mint-deep)' },
                      ].map((item, i) => (
                        <div key={i} className="rounded-[20px] px-3.5 py-3 flex items-center gap-3 relative overflow-hidden"
                          style={{
                            background: `linear-gradient(145deg, #FFFFFF, ${item.col}99)`,
                            boxShadow: `inset 0 1.5px 0 rgba(255,255,255,0.95), 0 3px 0 ${item.colDeep}55, 0 6px 16px -10px ${item.colDeep}66`,
                            border: '2px solid rgba(255,255,255,0.9)',
                          }}>
                          <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-lg flex-shrink-0"
                            style={{
                              background: `linear-gradient(135deg, #FFFFFF, ${item.col})`,
                              boxShadow: 'inset 0 1.5px 0 rgba(255,255,255,0.9), 0 2px 0 rgba(122,92,78,0.08)',
                              border: '1.5px solid rgba(255,255,255,0.8)',
                            }}>{item.icon}</div>
                          <div className="text-left min-w-0 flex-1">
                            <div className="text-[9px] font-black tracking-widest uppercase" style={{ color: item.colDeep }}>{item.label}</div>
                            <div className="font-black text-lg tracking-tight" style={{ color: '#3E2723' }}>{item.value}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 rounded-[20px] py-4 px-5 relative overflow-hidden"
                      style={{
                        background: 'linear-gradient(135deg, #FFF4FB, #FFF9F2, #F0FDF4)',
                        border: '2px solid rgba(255,255,255,0.9)',
                        boxShadow: 'inset 0 1.5px 0 rgba(255,255,255,0.9), 0 4px 0 rgba(255,209,220,0.5)',
                      }}>
                      <div className="absolute inset-0 opacity-60"
                        style={{ background: 'radial-gradient(circle at 15% 40%, rgba(255,209,220,0.5), transparent 55%), radial-gradient(circle at 85% 70%, rgba(212,197,249,0.4), transparent 55%)' }} />
                      <div className="relative flex items-center justify-between">
                        <div>
                          <div className="text-[10px] font-black tracking-[0.25em] kawaii-gradient-text">最终得分</div>
                          <div className="text-5xl font-black mt-0.5 tracking-tight kawaii-gradient-text"
                            style={{ filter: 'drop-shadow(0 2px 0 rgba(255,255,255,0.6))' }}>
                            {state.score}
                          </div>
                        </div>
                        <div className="text-5xl animate-wiggle inline-block" style={{ filter: 'drop-shadow(0 4px 12px rgba(122,92,78,0.15))' }}>🎀</div>
                      </div>
                    </div>
                    {state.wrongWords.length > 0 && (
                      <div className="mt-4 text-left">
                        <div className="flex items-center gap-2 mb-2.5">
                          <div className="w-8 h-8 rounded-[14px] flex items-center justify-center text-base"
                            style={{ background: 'linear-gradient(135deg, #FFD8DE, #F9B6C0)', boxShadow: '0 2px 0 rgba(249,182,192,0.55)', border: '1.5px solid #fff' }}>📖</div>
                          <span className="text-sm font-black tracking-wide" style={{ color: '#5D4037' }}>
                            错题回顾 ({state.wrongWords.length}个)
                          </span>
                        </div>
                        <div className="max-h-36 overflow-y-auto rounded-[20px] space-y-1.5 p-2"
                          style={{ background: 'linear-gradient(180deg, #FFF4FB, #F9F4FF)' }}>
                          {state.wrongWords.slice(0, 10).map((w, i) => (
                            <div key={i} className="flex items-center gap-2 rounded-2xl px-3 py-2.5 text-xs"
                              style={{ background: '#FFFFFF', border: '1.5px solid rgba(255,255,255,1)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), 0 1px 3px rgba(122,92,78,0.06)' }}>
                              <span className="font-black flex-1 truncate" style={{ color: '#3E2723', fontSize: '13px' }}>{w.en}</span>
                              <span className="font-bold truncate" style={{ color: 'var(--macaron-pink-deep)' }}>{w.zh}</span>
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black flex-shrink-0"
                                style={{
                                  background: w.difficulty === 1 ? 'linear-gradient(135deg, #D3F2E3, #B5EAD7)' :
                                              w.difficulty === 2 ? 'linear-gradient(135deg, #FFF6C2, #FFECB3)' :
                                                                 'linear-gradient(135deg, #FFE1D0, #FFC9AE)',
                                  color: w.difficulty === 1 ? '#1B5E20' : w.difficulty === 2 ? '#E65100' : '#B71C1C',
                                  border: '1.5px solid #fff',
                                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8)',
                                }}>
                                {w.difficulty === 1 ? '简单' : w.difficulty === 2 ? '中等' : '困难'}
                              </span>
                            </div>
                          ))}
                          {state.wrongWords.length > 10 && (
                            <div className="text-center text-xs py-2 font-bold" style={{ color: '#8D6E63' }}>
                              ...还有 {state.wrongWords.length - 10} 个错词，继续练习!
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="px-5 pb-6 pt-3 relative z-10">
                    <button onClick={initGame} className="kawaii-btn kawaii-btn-peach w-full py-4 text-xl">
                      <span className="flex items-center justify-center gap-2">
                        🔄 再来一局
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ===== Victory Overlay - Macaron Pastel ===== */}
            {phase === 'victory' && state && (
              <div className="absolute inset-0 flex items-center justify-center z-30 px-2"
                style={{ background: 'rgba(24,36,58,0.35)', backdropFilter: 'blur(14px)' }}>
                <div className="kawaii-card text-center max-w-sm w-full mx-auto overflow-hidden relative animate-bounce-in"
                  style={{ padding: 0 }}>
                  <div className="absolute inset-0 pointer-events-none"
                    style={{ background:
                      'radial-gradient(ellipse at 20% 0%, rgba(255,243,176,0.55), transparent 55%),' +
                      'radial-gradient(ellipse at 80% 0%, rgba(181,234,215,0.5), transparent 55%),' +
                      'radial-gradient(ellipse at 50% 100%, rgba(212,197,249,0.45), transparent 60%)'
                    }} />
                  <div className="py-7 px-6 relative">
                    <div className="absolute top-0 left-0 right-0 h-1.5"
                      style={{ background: 'linear-gradient(90deg, #FFF3B0, #FFD1DC, #B5EAD7, #C7E9FF, #D4C5F9, #FFF3B0)', backgroundSize: '300% 100%', animation: 'rainbow-bg 4s linear infinite' }} />
                    <div className="flex justify-center gap-4 mb-3">
                      {[1, 2, 3].map((i) => (
                        <span key={i} className={`text-6xl transition-all relative ${i <= victoryStars ? '' : 'opacity-20 grayscale'}`}
                          style={{
                            filter: i <= victoryStars ? 'drop-shadow(0 6px 16px rgba(245,215,110,0.65))' : 'none',
                            transform: i <= victoryStars ? `scale(1.1) rotate(${(i - 2) * 10}deg)` : 'scale(0.9)',
                          }}>
                          {i <= victoryStars ? '⭐' : '☆'}
                          {i <= victoryStars && (
                            <span className="absolute -top-1 -right-1 text-base animate-sparkle" style={{ animationDelay: `${i * 0.2}s` }}>✨</span>
                          )}
                        </span>
                      ))}
                    </div>
                    <div className="text-6xl mb-3 animate-float-slow"
                      style={{ filter: 'drop-shadow(0 8px 22px rgba(167,139,250,0.4))' }}>
                      🏆
                    </div>
                    <h2 className="text-4xl font-black tracking-tight kawaii-gradient-text"
                      style={{ filter: 'drop-shadow(0 3px 0 rgba(255,255,255,0.6))' }}>
                      胜利!
                    </h2>
                    <p className="text-base mt-2 font-black tracking-wide"
                      style={{
                        color: victoryStars >= 3 ? 'var(--macaron-mint-deep)' :
                               victoryStars >= 2 ? 'var(--macaron-lemon-deep)' : 'var(--macaron-peach-deep)',
                      }}>
                      {victoryStars >= 3 ? '🎉 完美通关!' : victoryStars >= 2 ? '✨ 表现不错!' : victoryStars >= 1 ? '💪 继续加油!' : '🌱 下次更好!'}
                    </p>
                  </div>
                  <div className="px-5 pb-4 relative z-10">
                    <div className="grid grid-cols-2 gap-2.5 text-sm">
                      {[
                        { icon: '⚔️', label: '消灭僵尸', value: `${state.totalKills}`, col: 'var(--macaron-pink)', colDeep: 'var(--macaron-pink-deep)' },
                        { icon: '🔥', label: '最高连击', value: `${state.bestCombo}`, col: 'var(--macaron-peach)', colDeep: 'var(--macaron-peach-deep)' },
                        { icon: '📝', label: '答题正确率', value: `${Math.round(victoryAccuracy * 100)}%`, col: 'var(--macaron-mint)', colDeep: 'var(--macaron-mint-deep)' },
                        { icon: '📖', label: '答对/总数', value: `${state.wordsCorrect}/${state.wordsAnswered}`, col: 'var(--macaron-sky)', colDeep: 'var(--macaron-sky-deep)' },
                      ].map((item, i) => (
                        <div key={i} className="rounded-[20px] px-3.5 py-3 flex items-center gap-3 relative overflow-hidden"
                          style={{
                            background: `linear-gradient(145deg, #FFFFFF, ${item.col}99)`,
                            boxShadow: `inset 0 1.5px 0 rgba(255,255,255,0.95), 0 3px 0 ${item.colDeep}55, 0 6px 16px -10px ${item.colDeep}66`,
                            border: '2px solid rgba(255,255,255,0.9)',
                          }}>
                          <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-lg flex-shrink-0"
                            style={{
                              background: `linear-gradient(135deg, #FFFFFF, ${item.col})`,
                              boxShadow: 'inset 0 1.5px 0 rgba(255,255,255,0.9), 0 2px 0 rgba(122,92,78,0.08)',
                              border: '1.5px solid rgba(255,255,255,0.8)',
                            }}>{item.icon}</div>
                          <div className="text-left min-w-0 flex-1">
                            <div className="text-[9px] font-black tracking-widest uppercase" style={{ color: item.colDeep }}>{item.label}</div>
                            <div className="font-black text-lg tracking-tight" style={{ color: '#3E2723' }}>{item.value}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 rounded-[20px] py-4 px-5 relative overflow-hidden"
                      style={{
                        background: 'linear-gradient(135deg, #FFF9E6, #F0FDF4, #EDE9FE)',
                        border: '2px solid rgba(255,255,255,0.9)',
                        boxShadow: 'inset 0 1.5px 0 rgba(255,255,255,0.9), 0 4px 0 rgba(181,234,215,0.55)',
                      }}>
                      <div className="absolute inset-0 opacity-70"
                        style={{ background: 'radial-gradient(circle at 85% 20%, rgba(255,243,176,0.55), transparent 55%), radial-gradient(circle at 15% 80%, rgba(199,233,255,0.45), transparent 55%)' }} />
                      <div className="relative flex items-center justify-between">
                        <div>
                          <div className="text-[10px] font-black tracking-[0.25em] kawaii-gradient-text">最终得分</div>
                          <div className="text-5xl font-black mt-0.5 tracking-tight kawaii-gradient-text"
                            style={{ filter: 'drop-shadow(0 2px 0 rgba(255,255,255,0.6))' }}>
                            {state.score}
                          </div>
                        </div>
                        <div className="text-5xl animate-sparkle" style={{ filter: 'drop-shadow(0 4px 12px rgba(122,92,78,0.15))' }}>🎖️</div>
                      </div>
                    </div>
                    {state.wrongWords.length > 0 && (
                      <div className="mt-4 text-left">
                        <div className="flex items-center gap-2 mb-2.5">
                          <div className="w-8 h-8 rounded-[14px] flex items-center justify-center text-base"
                            style={{ background: 'linear-gradient(135deg, #FFF6C2, #FFE082)', boxShadow: '0 2px 0 rgba(245,215,110,0.55)', border: '1.5px solid #fff' }}>📖</div>
                          <span className="text-sm font-black tracking-wide" style={{ color: '#5D4037' }}>
                            错题回顾 ({state.wrongWords.length}个)
                          </span>
                        </div>
                        <div className="max-h-36 overflow-y-auto rounded-[20px] space-y-1.5 p-2"
                          style={{ background: 'linear-gradient(180deg, #FFFCEB, #F1FBF4)' }}>
                          {state.wrongWords.slice(0, 10).map((w, i) => (
                            <div key={i} className="flex items-center gap-2 rounded-2xl px-3 py-2.5 text-xs"
                              style={{ background: '#FFFFFF', border: '1.5px solid rgba(255,255,255,1)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), 0 1px 3px rgba(122,92,78,0.06)' }}>
                              <span className="font-black flex-1 truncate" style={{ color: '#3E2723', fontSize: '13px' }}>{w.en}</span>
                              <span className="font-bold truncate" style={{ color: 'var(--macaron-peach-deep)' }}>{w.zh}</span>
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black flex-shrink-0"
                                style={{
                                  background: w.difficulty === 1 ? 'linear-gradient(135deg, #D3F2E3, #B5EAD7)' :
                                              w.difficulty === 2 ? 'linear-gradient(135deg, #FFF6C2, #FFECB3)' :
                                                                 'linear-gradient(135deg, #FFE1D0, #FFC9AE)',
                                  color: w.difficulty === 1 ? '#1B5E20' : w.difficulty === 2 ? '#E65100' : '#B71C1C',
                                  border: '1.5px solid #fff',
                                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8)',
                                }}>
                                {w.difficulty === 1 ? '简单' : w.difficulty === 2 ? '中等' : '困难'}
                              </span>
                            </div>
                          ))}
                          {state.wrongWords.length > 10 && (
                            <div className="text-center text-xs py-2 font-bold" style={{ color: '#8D6E63' }}>
                              ...还有 {state.wrongWords.length - 10} 个错词，继续努力！
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="px-5 pb-6 pt-3 relative z-10">
                    <button onClick={initGame} className="kawaii-btn kawaii-btn-mint w-full py-4 text-xl">
                      <span className="flex items-center justify-center gap-2">
                        🎮 再玩一次
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </React.Fragment>
      )}
    </div>
  );
}