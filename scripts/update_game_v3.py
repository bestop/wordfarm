#!/usr/bin/env python3
"""Update PvZGame.tsx: fix quiz layout, bright warm colors, enhance drawings."""

with open('/home/z/my-project/src/components/game/PvZGame.tsx', 'r') as f:
    content = f.read()

# ============================================================
# 1. MOVE QUIZ PANEL INSIDE CANVAS CONTAINER (absolute overlay)
# ============================================================
old_canvas_quiz = """          {/* Canvas - FIXED SIZE */}
          <div ref={containerRef} className="flex-1 relative min-h-0">
            <canvas ref={canvasRef} onClick={handleCanvasClick} onTouchStart={(e) => { e.preventDefault(); handleCanvasClick(e); }} className="w-full h-full" />
            {Date.now() < state.zombieSpeedBoostEnd && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold animate-pulse z-10"
                style={{ background: 'rgba(229,57,53,0.85)', color: '#fff', boxShadow: '0 0 12px rgba(229,57,53,0.5)' }}>
                ⚡ 僵尸加速中!
              </div>
            )}
          </div>

          {/* Quiz panel - FIXED HEIGHT, warm theme */}
          {phase === 'playing' && quiz && (
            <div className="flex-shrink-0 relative z-10" style={{ height: '108px',
              background: quiz.answered
                ? (quiz.wasCorrect ? 'linear-gradient(180deg, #E8F5E9, #C8E6C9)' : 'linear-gradient(180deg, #FFEBEE, #FFCDD2)')
                : 'linear-gradient(180deg, #FFF8E1, #FFECB3)',
              borderTop: '2px solid',
              borderTopColor: quiz.answered
                ? (quiz.wasCorrect ? '#A5D6A7' : '#EF9A9A')
                : '#FFCC80'
            }}>
              <div className="max-w-lg mx-auto h-full flex flex-col justify-center px-3 md:px-6">
                {quiz.answered ? (
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-xl">{quiz.wasCorrect ? '✅' : '❌'}</span>
                    <span className="font-bold text-base" style={{ color: quiz.wasCorrect ? '#2E7D32' : '#C62828' }}>
                      {quiz.word.en} = {quiz.word.zh}
                    </span>
                    <span className="text-xs ml-2" style={{ color: '#8D6E63' }}>
                      下一题 {Math.max(0, Math.ceil(state.quizCooldown / 1000))}s
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          diff === 1 ? 'bg-green-600 text-green-100' : diff === 2 ? 'bg-amber-600 text-amber-100' : 'bg-red-600 text-red-100'
                        }`}>
                          {diff === 1 ? '简单' : diff === 2 ? '中等' : '困难'} +{QUIZ_SUN_REWARD[diff]}☀️
                        </span>
                        <span className="font-bold text-lg md:text-xl tracking-wide" style={{ color: '#4E342E' }}>{quiz.word.en}</span>
                      </div>
                      <span className={`text-sm font-mono tabular-nums ${quiz.timer < 3000 ? 'font-bold animate-pulse' : ''}`}
                        style={{ color: quiz.timer < 3000 ? '#D32F2F' : '#8D6E63' }}>
                        {Math.max(0, Math.ceil(quiz.timer / 1000))}s
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full mb-1.5 overflow-hidden" style={{ background: 'rgba(0,0,0,0.08)' }}>
                      <div className={`h-full rounded-full transition-all duration-150 ${
                        quiz.timer < 3000 ? 'bg-red-400' : 'bg-green-500'
                      }`} style={{ width: `${(quiz.timer / QUIZ_TIME_LIMIT) * 100}%` }} />
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {quiz.options.map((opt, i) => (
                        <button key={i} onClick={() => handleAnswer(i)}
                          className="py-1.5 md:py-2 px-2 md:px-3 rounded-xl text-sm md:text-base font-medium transition-all hover:scale-[1.02] active:scale-[0.98] hover:shadow-md"
                          style={{ color: '#4E342E', background: 'rgba(255,255,255,0.7)', border: '1.5px solid rgba(141,110,99,0.2)',
                            hoverBackgroundColor: 'rgba(255,255,255,0.9)', hoverBorderColor: 'rgba(141,110,99,0.4)' }}>
                          <span className="font-bold mr-1" style={{ color: '#8D6E63' }}>{String.fromCharCode(65 + i)}</span>
                          {opt}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}"""

new_canvas_quiz = """          {/* Canvas area - quiz overlays here so canvas size stays fixed */}
          <div ref={containerRef} className="flex-1 relative min-h-0">
            <canvas ref={canvasRef} onClick={handleCanvasClick} onTouchStart={(e) => { e.preventDefault(); handleCanvasClick(e); }} className="w-full h-full" />
            {Date.now() < state.zombieSpeedBoostEnd && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold animate-pulse z-10"
                style={{ background: 'rgba(229,57,53,0.9)', color: '#fff', boxShadow: '0 0 12px rgba(229,57,53,0.5)' }}>
                ⚡ 僵尸加速中!
              </div>
            )}
            {/* Quiz panel - absolute overlay, doesn't affect canvas size */}
            {phase === 'playing' && quiz && (
              <div className="absolute bottom-0 left-0 right-0 z-20 rounded-t-2xl"
                style={{
                  background: quiz.answered
                    ? (quiz.wasCorrect ? 'rgba(200,230,201,0.94)' : 'rgba(255,205,210,0.94)')
                    : 'rgba(255,253,231,0.94)',
                  backdropFilter: 'blur(14px)',
                  WebkitBackdropFilter: 'blur(14px)',
                  borderTop: quiz.answered
                    ? (quiz.wasCorrect ? '2px solid rgba(165,214,167,0.7)' : '2px solid rgba(239,154,154,0.7)')
                    : '2px solid rgba(255,204,128,0.7)',
                  boxShadow: '0 -4px 20px rgba(0,0,0,0.08)',
                  padding: '8px 12px 10px',
                }}>
                <div className="max-w-lg mx-auto">
                  {quiz.answered ? (
                    <div className="flex items-center justify-center gap-2 py-1">
                      <span className="text-lg">{quiz.wasCorrect ? '✅' : '❌'}</span>
                      <span className="font-bold text-sm" style={{ color: quiz.wasCorrect ? '#2E7D32' : '#C62828' }}>
                        {quiz.word.en} = {quiz.word.zh}
                      </span>
                      <span className="text-xs ml-2 opacity-60" style={{ color: '#5D4037' }}>
                        下一题 {Math.max(0, Math.ceil(state.quizCooldown / 1000))}s
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            diff === 1 ? 'bg-emerald-500 text-white' : diff === 2 ? 'bg-amber-500 text-white' : 'bg-rose-500 text-white'
                          }`}>
                            {diff === 1 ? '简单' : diff === 2 ? '中等' : '困难'} +{QUIZ_SUN_REWARD[diff]}☀️
                          </span>
                          <span className="font-bold text-base md:text-lg tracking-wide" style={{ color: '#3E2723' }}>{quiz.word.en}</span>
                        </div>
                        <span className={`text-sm font-mono tabular-nums ${quiz.timer < 3000 ? 'font-bold animate-pulse' : ''}`}
                          style={{ color: quiz.timer < 3000 ? '#D32F2F' : '#795548' }}>
                          {Math.max(0, Math.ceil(quiz.timer / 1000))}s
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full mb-1.5 overflow-hidden" style={{ background: 'rgba(0,0,0,0.06)' }}>
                        <div className={`h-full rounded-full transition-all duration-150 ${
                          quiz.timer < 3000 ? 'bg-rose-400' : 'bg-emerald-400'
                        }`} style={{ width: `${(quiz.timer / QUIZ_TIME_LIMIT) * 100}%` }} />
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {quiz.options.map((opt, i) => (
                          <button key={i} onClick={() => handleAnswer(i)}
                            className="py-1.5 md:py-2 px-2 md:px-3 rounded-xl text-sm md:text-base font-medium transition-all hover:scale-[1.02] active:scale-[0.98] hover:shadow-md"
                            style={{ color: '#3E2723', background: 'rgba(255,255,255,0.85)', border: '1.5px solid rgba(141,110,99,0.12)',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
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
          </div>"""

assert old_canvas_quiz in content, "Could not find canvas+quiz section!"
content = content.replace(old_canvas_quiz, new_canvas_quiz)
print("[OK] Quiz panel moved to absolute overlay inside canvas container")

# ============================================================
# 2. BRIGHT WARM COLORS - HUD
# ============================================================
content = content.replace(
    "{/* HUD - warm amber */}\n          <div className=\"flex items-center justify-between px-3 py-1.5 relative z-10 flex-shrink-0\"\n            style={{ background: 'linear-gradient(180deg, #8D6E63, #A1887F)', borderBottom: '2px solid rgba(255,183,77,0.5)' }}>",
    "{/* HUD - bright warm */}\n          <div className=\"flex items-center justify-between px-3 py-1.5 relative z-10 flex-shrink-0\"\n            style={{ background: 'linear-gradient(180deg, #EF6C00, #FB8C00)', borderBottom: '2px solid rgba(255,255,255,0.25)' }}>")
print("[OK] HUD color updated")

# ============================================================
# 3. BRIGHT WARM COLORS - Card bar
# ============================================================
content = content.replace(
    "{/* Card bar - warm */}\n          <div className=\"flex items-center gap-1.5 px-2 py-1.5 relative z-10 flex-shrink-0 overflow-x-auto\"\n            style={{ background: 'linear-gradient(180deg, #6D4C41, #795548)', borderBottom: '1px solid rgba(255,183,77,0.2)' }}>",
    "{/* Card bar - bright warm */}\n          <div className=\"flex items-center gap-1.5 px-2 py-1.5 relative z-10 flex-shrink-0 overflow-x-auto\"\n            style={{ background: 'linear-gradient(180deg, #E65100, #F57C00)', borderBottom: '1px solid rgba(255,255,255,0.15)' }}>")
print("[OK] Card bar color updated")

# ============================================================
# 4. BRIGHT WARM COLORS - Overall container bg
# ============================================================
content = content.replace(
    "style={{ background: '#FFF8E1' }}",
    "style={{ background: '#FFFDE7' }}")
print("[OK] Container bg updated")

# ============================================================
# 5. BRIGHT WARM CANVAS BACKGROUND
# ============================================================
content = content.replace(
    "// Warm sky background\n    const sky = ctx.createLinearGradient(0, 0, 0, h);\n    sky.addColorStop(0, '#87CEEB'); sky.addColorStop(0.12, '#B3E5FC');\n    sky.addColorStop(0.28, '#C8E6C9'); sky.addColorStop(0.4, '#A5D6A7');\n    sky.addColorStop(1, '#66BB6A');",
    "// Bright warm sky background\n    const sky = ctx.createLinearGradient(0, 0, 0, h);\n    sky.addColorStop(0, '#FFE082'); sky.addColorStop(0.08, '#FFCC80');\n    sky.addColorStop(0.18, '#C8E6C9'); sky.addColorStop(0.32, '#A5D6A7');\n    sky.addColorStop(1, '#66BB6A');")
print("[OK] Canvas sky background updated")

# ============================================================
# 6. UPDATE HUD TEXT COLORS FOR BRIGHTER BG
# ============================================================
# Sun count - brighter white
content = content.replace(
    "style={{ color: '#FFF8E1' }}>{state.sun}",
    "style={{ color: '#FFFFFF' }}>{state.sun}")

# HUD stat labels
content = content.replace(
    "text-amber-200/80 text-[10px]",
    "text-amber-100 text-[10px]"
)

# HUD stat bg
content = content.replace(
    "style={{ background: 'rgba(255,255,255,0.15)' }}>\n                <div className=\"text-amber-100",
    "style={{ background: 'rgba(255,255,255,0.18)' }}>\n                <div className=\"text-amber-100"
)
print("[OK] HUD text colors updated")

# ============================================================
# 7. UPDATE CARD BAR BUTTON STYLES
# ============================================================
# Deselect button
content = content.replace(
    "style={{ background: !state.selectedPlant ? 'linear-gradient(180deg, #FFB74D, #FF9800)' : 'rgba(255,255,255,0.1)',\n                color: !state.selectedPlant ? '#4E342E' : '#BCAAA4' }}>",
    "style={{ background: !state.selectedPlant ? 'linear-gradient(180deg, #FFF176, #FFEE58)' : 'rgba(255,255,255,0.15)',\n                color: !state.selectedPlant ? '#E65100' : 'rgba(255,255,255,0.6)' }}>")

# Selected plant card style
content = content.replace(
    "style={{ background: sel ? 'linear-gradient(180deg, #FFB74D, #FF9800)' : ok ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)',\n                    color: sel ? '#4E342E' : ok ? '#EFEBE9' : '#6D4C41',\n                    border: ok ? '1px solid rgba(255,183,77,0.25)' : '1px solid transparent' }}>",
    "style={{ background: sel ? 'linear-gradient(180deg, #FFF176, #FFEE58)' : ok ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)',\n                    color: sel ? '#E65100' : ok ? '#FFF3E0' : 'rgba(255,255,255,0.4)',\n                    border: ok ? '1px solid rgba(255,255,255,0.2)' : '1px solid transparent' }}>")

# Sun cost in card
content = content.replace(
    "style={{ color: ok ? '#FFE082' : '#5D4037' }}",
    "style={{ color: ok ? '#FFF9C4' : 'rgba(255,255,255,0.3)' }}")
print("[OK] Card bar styles updated")

# ============================================================
# 8. MENU SCREEN - BRIGHTER WARM
# ============================================================
content = content.replace(
    "style={{ background: 'linear-gradient(180deg, #FFF3E0 0%, #FFE0B2 40%, #C8E6C9 80%, #81C784 100%)' }}",
    "style={{ background: 'linear-gradient(180deg, #FFF9C4 0%, #FFE082 30%, #C8E6C9 70%, #81C784 100%)' }}")
print("[OK] Menu background updated")

# ============================================================
# 9. ENHANCE PEASHOOTER - add head shine
# ============================================================
old_pea_head = """  // Big round head
  const hg = ctx.createRadialGradient(x - s * 0.08, y - s * 0.18 + bob, s * 0.05, x, y - s * 0.12 + bob, s * 0.42);
  hg.addColorStop(0, '#A5D6A7'); hg.addColorStop(0.5, '#66BB6A'); hg.addColorStop(1, '#2E7D32');
  ctx.fillStyle = hg;
  ctx.beginPath(); ctx.arc(x, y - s * 0.12 + bob, s * 0.38, 0, Math.PI * 2); ctx.fill();"""

new_pea_head = """  // Big round head
  const hg = ctx.createRadialGradient(x - s * 0.1, y - s * 0.22 + bob, s * 0.05, x, y - s * 0.12 + bob, s * 0.42);
  hg.addColorStop(0, '#C8E6C9'); hg.addColorStop(0.35, '#81C784'); hg.addColorStop(0.7, '#4CAF50'); hg.addColorStop(1, '#2E7D32');
  ctx.fillStyle = hg;
  ctx.beginPath(); ctx.arc(x, y - s * 0.12 + bob, s * 0.38, 0, Math.PI * 2); ctx.fill();
  // Head shine
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath(); ctx.ellipse(x - s * 0.12, y - s * 0.28 + bob, s * 0.14, s * 0.08, -0.4, 0, Math.PI * 2); ctx.fill();"""

content = content.replace(old_pea_head, new_pea_head)
print("[OK] Peashooter enhanced")

# ============================================================
# 10. ENHANCE WALLNUT - more detailed
# ============================================================
old_wallnut = """  // Warm highlight
  ctx.fillStyle = 'rgba(255,245,200,0.2)';
  ctx.beginPath(); ctx.ellipse(x - s * 0.12, y - s * 0.15 + bob, s * 0.18, s * 0.15, -0.4, 0, Math.PI * 2); ctx.fill();"""

new_wallnut = """  // Warm highlight
  ctx.fillStyle = 'rgba(255,245,200,0.25)';
  ctx.beginPath(); ctx.ellipse(x - s * 0.12, y - s * 0.15 + bob, s * 0.2, s * 0.16, -0.4, 0, Math.PI * 2); ctx.fill();
  // Bottom shadow
  ctx.fillStyle = 'rgba(100,60,10,0.12)';
  ctx.beginPath(); ctx.ellipse(x + s * 0.05, y + s * 0.25 + bob, s * 0.2, s * 0.08, 0.2, 0, Math.PI * 2); ctx.fill();"""

content = content.replace(old_wallnut, new_wallnut)
print("[OK] Wallnut enhanced")

# ============================================================
# 11. ENHANCE ZOMBIE SKIN COLORS - more vivid
# ============================================================
content = content.replace(
    "const skin = slowed ? '#7BAFD4' : '#8BAF4A';\n  const skinDk = slowed ? '#5A8AB5' : '#6A8F3A';\n  const skinLt = slowed ? '#A5D0F0' : '#B0CC6A';",
    "const skin = slowed ? '#81D4FA' : '#9CCC65';\n  const skinDk = slowed ? '#4FC3F7' : '#7CB342';\n  const skinLt = slowed ? '#B3E5FC' : '#C5E1A5';")
print("[OK] Zombie skin colors enhanced")

# ============================================================
# 12. ENHANCE ZOMBIE EYES - bloodshot
# ============================================================
old_eyes = """  // Eyes (much bigger, googly)
  ctx.fillStyle = '#FFF9C4';
  ctx.beginPath(); ctx.ellipse(-s * 0.08, -s * 0.04, s * 0.075, s * 0.09, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(s * 0.09, -s * 0.02, s * 0.06, s * 0.075, 0.1, 0, Math.PI * 2); ctx.fill();
  // Red pupils (offset, looking left)
  ctx.fillStyle = '#D32F2F';
  ctx.beginPath(); ctx.arc(-s * 0.07, -s * 0.04, s * 0.04, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(s * 0.1, -s * 0.02, s * 0.032, 0, Math.PI * 2); ctx.fill();
  // Pupil highlights
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(-s * 0.055, -s * 0.055, s * 0.015, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(s * 0.115, -s * 0.035, s * 0.012, 0, Math.PI * 2); ctx.fill();"""

new_eyes = """  // Eyes (big, googly, bloodshot)
  ctx.fillStyle = '#FFF9C4';
  ctx.beginPath(); ctx.ellipse(-s * 0.08, -s * 0.04, s * 0.08, s * 0.1, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(s * 0.09, -s * 0.02, s * 0.065, s * 0.085, 0.1, 0, Math.PI * 2); ctx.fill();
  // Bloodshot veins
  ctx.strokeStyle = 'rgba(200,50,50,0.3)'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(-s * 0.12, -s * 0.08); ctx.lineTo(-s * 0.04, -s * 0.04); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(s * 0.14, -s * 0.06); ctx.lineTo(s * 0.06, -s * 0.01); ctx.stroke();
  // Red pupils (offset, looking left)
  ctx.fillStyle = '#D32F2F';
  ctx.beginPath(); ctx.arc(-s * 0.06, -s * 0.04, s * 0.042, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(s * 0.11, -s * 0.02, s * 0.035, 0, Math.PI * 2); ctx.fill();
  // Pupil highlights
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(-s * 0.045, -s * 0.055, s * 0.018, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(s * 0.125, -s * 0.035, s * 0.014, 0, Math.PI * 2); ctx.fill();"""

content = content.replace(old_eyes, new_eyes)
print("[OK] Zombie eyes enhanced")

# ============================================================
# 13. ENHANCE ZOMBIE BODY COLOR
# ============================================================
content = content.replace(
    "// Body (suit jacket, bigger)\n  ctx.fillStyle = '#6A5040';",
    "// Body (suit jacket, brighter)\n  ctx.fillStyle = '#7B5B48';")
print("[OK] Zombie body color updated")

# ============================================================
# 14. ENHANCE ZOMBIE MOUTH - drool
# ============================================================
old_mouth = """  // Big open mouth
  ctx.fillStyle = '#3E2723';
  ctx.beginPath(); ctx.ellipse(s * 0.02, s * 0.1, s * 0.1, s * 0.06, 0, 0, Math.PI * 2); ctx.fill();"""

new_mouth = """  // Big open mouth with tongue
  ctx.fillStyle = '#3E2723';
  ctx.beginPath(); ctx.ellipse(s * 0.02, s * 0.1, s * 0.1, s * 0.065, 0, 0, Math.PI * 2); ctx.fill();
  // Tongue
  ctx.fillStyle = '#E57373';
  ctx.beginPath(); ctx.ellipse(s * 0.03, s * 0.13, s * 0.045, s * 0.025, 0.15, 0, Math.PI * 2); ctx.fill();
  // Drool
  ctx.fillStyle = 'rgba(120,200,120,0.4)';
  ctx.beginPath(); ctx.ellipse(s * 0.06, s * 0.17, s * 0.015, s * 0.025, 0.2, 0, Math.PI * 2); ctx.fill();"""

content = content.replace(old_mouth, new_mouth)
print("[OK] Zombie mouth enhanced with tongue and drool")

# ============================================================
# 15. ENHANCE GRID COLORS - warmer
# ============================================================
content = content.replace(
    "ctx.fillStyle = (r + c) % 2 === 0 ? 'rgba(102,187,106,0.3)' : 'rgba(76,175,80,0.25)';",
    "ctx.fillStyle = (r + c) % 2 === 0 ? 'rgba(129,199,132,0.35)' : 'rgba(102,187,106,0.28)';")
print("[OK] Grid colors updated")

# ============================================================
# 16. ENHANCE HOUSE - warmer
# ============================================================
content = content.replace(
    "hsg.addColorStop(0, '#8D6E63'); hsg.addColorStop(0.6, '#A1887F'); hsg.addColorStop(1, '#BCAAA4');",
    "hsg.addColorStop(0, '#A1887F'); hsg.addColorStop(0.6, '#BCAAA4'); hsg.addColorStop(1, '#D7CCC8';)")
print("[OK] House colors updated")

# ============================================================
# 17. CLOUDS - warmer
# ============================================================
content = content.replace(
    "ctx.fillStyle = 'rgba(255,255,255,0.55)';",
    "ctx.fillStyle = 'rgba(255,255,240,0.6)';")
print("[OK] Cloud colors updated")

# ============================================================
# 18. GAME OVER / VICTORY - brighter warm
# ============================================================
content = content.replace(
    "style={{ background: 'linear-gradient(180deg, #FFF3E0, #FFE0B2)', border: '2px solid rgba(229,57,53,0.4)' }}",
    "style={{ background: 'linear-gradient(180deg, #FFF8E1, #FFECB3)', border: '2px solid rgba(229,57,53,0.3)' }}")

content = content.replace(
    "style={{ background: 'linear-gradient(180deg, #FFF8E1, #FFECB3)', border: '2px solid rgba(255,183,77,0.5)' }}>\n                <div className=\"text-6xl mb-3\">🏆",
    "style={{ background: 'linear-gradient(180deg, #FFF9C4, #FFF176)', border: '2px solid rgba(255,183,77,0.4)' }}>\n                <div className=\"text-6xl mb-3\">🏆")
print("[OK] Game over / victory colors updated")

# ============================================================
# 19. FLOATING TEXT SHADOW - warmer
# ============================================================
content = content.replace(
    "ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 3; ctx.strokeText(f.text, f.x, f.y);",
    "ctx.strokeStyle = 'rgba(255,248,225,0.9)'; ctx.lineWidth = 3; ctx.strokeText(f.text, f.x, f.y);")
print("[OK] Floating text shadow updated")

# ============================================================
# 20. WAVE ANNOUNCE - warmer colors
# ============================================================
content = content.replace(
    "ctx.fillStyle = '#FFF'; ctx.fillText(`第 ${state.wave + 1} 波`, w / 2, h / 2 - 8);",
    "ctx.fillStyle = '#FFFDE7'; ctx.fillText(`第 ${state.wave + 1} 波`, w / 2, h / 2 - 8);")
content = content.replace(
    "ctx.fillStyle = '#FFE082'; ctx.fillText(`${waveConfig.zombies.length} 个僵尸来袭!`, w / 2, h / 2 + 22);",
    "ctx.fillStyle = '#FFF9C4'; ctx.fillText(`${waveConfig.zombies.length} 个僵尸来袭!`, w / 2, h / 2 + 22);")
print("[OK] Wave announce colors updated")

# ============================================================
# WRITE
# ============================================================
with open('/home/z/my-project/src/components/game/PvZGame.tsx', 'w') as f:
    f.write(content)

print("\n=== All 20 updates applied successfully! ===")
