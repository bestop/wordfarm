(() => {
  const E = window.__wf
  if (!E || E.phase !== 'playing') return 'not playing: ' + (E && E.phase)
  E.plants.length = 0
  E.zombies.length = 0
  let pid = 9700
  const mkPlant = (type, lane, col, hp) => ({
    id: ++pid, type, lane, col, health: hp, maxHealth: hp, attackTimer: 0,
    wobble: Math.random() * 6, wobbleSeed: Math.random() * 6, hitFlash: 0,
    fuseTimer: 0, chomperState: 'idle', stateTimer: 0, biteSettled: false,
    biteTargetId: null, sunTimer: 0,
  })
  E.plants.push(
    mkPlant('sunflower', 0, 0, 2), mkPlant('shooter', 0, 1, 3), mkPlant('freezer', 0, 2, 3), mkPlant('fire', 0, 3, 3),
    mkPlant('wall', 1, 0, 8), mkPlant('cherry', 1, 2, 1),
    mkPlant('chomper', 2, 1, 4),
  )
  let zid = 98000
  const mkZ = (type, lane, progress, extra) => {
    const hp = { bucket: 6, imp: 3, football: 12, dancer: 14, king: 32 }[type]
    return Object.assign({
      id: ++zid, type, lane, progress, speed: 0.0001, health: hp, maxHealth: hp,
      state: 'walking', slowFactor: 1, slowTimer: 0, boostMult: 1, boostTimer: 0,
      wobble: Math.random() * 6, wobbleSeed: Math.random() * 6, hitFlash: 0,
      dyingTimer: 0, attackTimer: 0, summonTimer: 0, targetPlantId: null,
    }, extra || {})
  }
  // 右半场 5 类型一字排开；铁桶带受击特效+减速光环演示
  E.zombies.push(
    mkZ('bucket', 0, 0.62, { hitFlash: 160, slowTimer: 1500 }),
    mkZ('imp', 0, 0.3),
    mkZ('football', 1, 0.55),
    mkZ('dancer', 2, 0.62),
    mkZ('king', 2, 0.28),
  )
  return 'ok'
})()
