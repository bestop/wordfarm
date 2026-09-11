(() => {
  const E = window.__wf
  if (!E || E.phase !== 'playing') return 'engine not playing: phase=' + (E && E.phase)
  const L = E.layout
  const cell = (lane, col) => ({ x: L.left + col * L.cellW + L.cellW / 2, y: L.top + lane * L.cellH + L.cellH / 2 })
  let pid = 9000
  const mkPlant = (type, lane, col) => ({
    id: ++pid, type, lane, col, health: 3, maxHealth: 3, attackTimer: 0,
    wobble: Math.random() * 6, wobbleSeed: Math.random() * 6, hitFlash: 0,
    fuseTimer: 1200, chomperState: 'idle', stateTimer: 0, biteSettled: false,
    biteTargetId: null, sunTimer: 0,
  })
  // 7 植物全家福：lane0 向日葵/豌豆/寒冰/火焰，lane1 坚果/樱桃，lane2 食人花
  E.plants.push(
    mkPlant('sunflower', 0, 0), mkPlant('shooter', 0, 1), mkPlant('freezer', 0, 2), mkPlant('fire', 0, 3),
    mkPlant('wall', 1, 1), mkPlant('cherry', 1, 3),
    mkPlant('chomper', 2, 2),
  )
  // wall 血量 8
  const wall = E.plants[E.plants.length - 2]
  if (wall && wall.type === 'wall') { wall.health = 8; wall.maxHealth = 8 }
  // 5 僵尸类型
  let zid = 90000
  const mkZ = (type, lane, progress) => {
    const def = { bucket: 6, imp: 3, football: 12, dancer: 14, king: 32 }[type]
    return {
      id: ++zid, type, lane, progress, speed: 0.02, health: def, maxHealth: def,
      state: 'walking', slowFactor: 1, slowTimer: 0, boostMult: 1, boostTimer: 0,
      wobble: Math.random() * 6, wobbleSeed: Math.random() * 6, hitFlash: 0,
      dyingTimer: 0, attackTimer: 0, summonTimer: 0, targetPlantId: null,
    }
  }
  E.zombies.push(mkZ('bucket', 0, 0.22), mkZ('imp', 1, 0.42), mkZ('football', 1, 0.12), mkZ('dancer', 2, 0.5), mkZ('king', 2, 0.08))
  // 一颗阳光
  const p = cell(2, 0)
  E.suns.push({ id: 900001, x: p.x + 60, y: p.y - 20, value: 25, age: 800, state: 'idle', collectT: 0, fromX: p.x + 60, fromY: p.y - 20 })
  return 'ok plants=' + E.plants.length + ' zombies=' + E.zombies.length
})()
