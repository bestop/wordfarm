(() => {
  const E = window.__wf
  if (!E || E.phase !== 'playing') return 'not playing'
  let pid = 9500
  const mkPlant = (type, lane, col, hp) => ({
    id: ++pid, type, lane, col, health: hp, maxHealth: hp, attackTimer: 0,
    wobble: Math.random() * 6, wobbleSeed: Math.random() * 6, hitFlash: 0,
    fuseTimer: 99999, chomperState: 'idle', stateTimer: 0, biteSettled: false,
    biteTargetId: null, sunTimer: 0,
  })
  E.plants.push(mkPlant('cherry', 1, 0, 1), mkPlant('wall', 2, 0, 8), mkPlant('chomper', 2, 1, 4))
  let zid = 96000
  const mkZ = (type, lane, progress, slow) => {
    const hp = { bucket: 6, imp: 3, football: 12, dancer: 14, king: 32 }[type]
    return {
      id: ++zid, type, lane, progress, speed: 0.0001, health: hp, maxHealth: hp,
      state: 'walking', slowFactor: 1, slowTimer: slow ? 1500 : 0, boostMult: 1, boostTimer: 0,
      wobble: Math.random() * 6, wobbleSeed: Math.random() * 6, hitFlash: 0,
      dyingTimer: 0, attackTimer: 0, summonTimer: 0, targetPlantId: null,
    }
  }
  E.zombies.push(mkZ('dancer', 0, 0.72), mkZ('imp', 1, 0.8, true), mkZ('football', 2, 0.68), mkZ('bucket', 0, 0.3))
  return 'ok zombies=' + E.zombies.length
})()
