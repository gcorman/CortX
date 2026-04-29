import type { GalaxyNode, GalaxyEdge, GalaxyCluster } from '../../../shared/types'

export interface Vec {
  x: number
  y: number
}

export interface LayoutResult {
  positions: Map<string, Vec>
  centroids: Map<number, Vec & { radius: number }>
}

/**
 * Force-directed clustered layout.
 *
 * Stars are initialized on a golden-angle spiral around their cluster centroid
 * (breaks hex-grid symmetry), then evolved with repulsion + attraction + springs.
 * Fewer iterations (90) keep the result organic — not fully converged.
 *
 * O(n²) repulsion: fine for ≤ 2 000 nodes.
 */
export function computeLayout(
  nodes: GalaxyNode[],
  edges: GalaxyEdge[],
  clusters: GalaxyCluster[],
  iterations = 90
): LayoutResult {
  if (nodes.length === 0) {
    return { positions: new Map(), centroids: new Map() }
  }

  const clusterCount = clusters.length || 1

  // ── Centroid placement ──────────────────────────────────────────────────
  // Ring radius sized so adjacent clusters don't visually merge, but not so
  // large that clusters fall off screen. Rule of thumb: R ≈ 3 × avg blob radius.
  // For 4 clusters with ~15-40 members: blob ~120px, R ~360.
  const avgMembers = nodes.length / clusterCount
  const avgBlobR = 35 + Math.sqrt(avgMembers) * 22
  const ringRadius = Math.min(480, Math.max(200, clusterCount * avgBlobR * 0.9))
  const centroids = new Map<number, Vec & { radius: number }>()

  for (let i = 0; i < clusters.length; i++) {
    const c = clusters[i]
    const angle = (i / clusterCount) * Math.PI * 2 + 0.2 * ((i % 2) - 0.5)
    const sizeRadius = 35 + Math.sqrt(c.memberIds.length) * 22
    centroids.set(c.id, {
      x: Math.cos(angle) * ringRadius,
      y: Math.sin(angle) * ringRadius,
      radius: sizeRadius
    })
  }
  if (centroids.size === 0) {
    centroids.set(0, { x: 0, y: 0, radius: 220 })
  }

  // Build per-cluster member index (needed for initialization + forces)
  const byCluster = new Map<number, string[]>()
  for (const node of nodes) {
    let arr = byCluster.get(node.clusterId)
    if (!arr) { arr = []; byCluster.set(node.clusterId, arr) }
    arr.push(node.id)
  }

  // ── Initial star positions — golden-angle spiral ─────────────────────
  const GOLDEN_ANGLE = 2.399193 // radians ≈ 137.5°
  const pos = new Map<string, Vec>()
  const vel = new Map<string, Vec>()

  for (const [clusterId, ids] of byCluster) {
    const c = centroids.get(clusterId) ?? centroids.values().next().value!
    for (let k = 0; k < ids.length; k++) {
      const phi = k * GOLDEN_ANGLE + Math.random() * 0.4  // slight jitter on angle
      const r = c.radius * 0.7 * Math.sqrt((k + 1) / ids.length)
      pos.set(ids[k], {
        x: c.x + Math.cos(phi) * r + (Math.random() - 0.5) * 15,
        y: c.y + Math.sin(phi) * r + (Math.random() - 0.5) * 15
      })
      vel.set(ids[k], { x: 0, y: 0 })
    }
  }

  const nodeList = nodes.map((n) => n.id)
  const clusterOf = new Map<string, number>()
  for (const n of nodes) clusterOf.set(n.id, n.clusterId)

  const edgeList = edges.filter((e) => pos.has(e.source) && pos.has(e.target))

  // ── Simulation ──────────────────────────────────────────────────────────
  for (let iter = 0; iter < iterations; iter++) {
    const t = iter / iterations
    // Mild cooling — stop at 0.45 so simulation stays somewhat "alive"
    const cool = 1 - 0.55 * t

    const force = new Map<string, Vec>()
    for (const id of nodeList) force.set(id, { x: 0, y: 0 })

    // 1. Cluster centroid attraction
    for (const id of nodeList) {
      const cid = clusterOf.get(id)!
      const c = centroids.get(cid)
      if (!c) continue
      const p = pos.get(id)!
      const f = force.get(id)!
      const dx = c.x - p.x
      const dy = c.y - p.y
      const d = Math.sqrt(dx * dx + dy * dy) + 0.01
      // Linear spring toward centroid — stronger outside blob to keep clusters distinct
      const k = d > c.radius ? 0.055 : 0.012
      f.x += dx * k
      f.y += dy * k
    }

    // 2. Global all-pairs repulsion + small random jitter
    for (let i = 0; i < nodeList.length; i++) {
      const idA = nodeList[i]
      const pA = pos.get(idA)!
      const fA = force.get(idA)!
      // Per-node jitter breaks lattice convergence
      fA.x += (Math.random() - 0.5) * 1.2
      fA.y += (Math.random() - 0.5) * 1.2

      for (let j = i + 1; j < nodeList.length; j++) {
        const idB = nodeList[j]
        const pB = pos.get(idB)!
        const fB = force.get(idB)!
        const dx = pA.x - pB.x
        const dy = pA.y - pB.y
        const d2 = dx * dx + dy * dy + 1
        const sameCluster = clusterOf.get(idA) === clusterOf.get(idB)
        // Stronger same-cluster repulsion → blobs spread internally
        const strength = sameCluster ? 2800 : 1200
        const mag = strength / d2
        const inv = 1 / Math.sqrt(d2)
        const fx = dx * inv * mag
        const fy = dy * inv * mag
        fA.x += fx; fA.y += fy
        fB.x -= fx; fB.y -= fy
      }
    }

    // 3. Edge springs
    for (const e of edgeList) {
      const ps = pos.get(e.source)!
      const pt = pos.get(e.target)!
      const dx = pt.x - ps.x
      const dy = pt.y - ps.y
      const d = Math.sqrt(dx * dx + dy * dy) + 0.01
      const sameCluster = clusterOf.get(e.source) === clusterOf.get(e.target)
      const restLen = sameCluster ? 50 : 120
      const kSpring = sameCluster ? 0.04 : 0.022
      const stretch = (d - restLen) * kSpring
      const fx = (dx / d) * stretch
      const fy = (dy / d) * stretch
      force.get(e.source)!.x += fx; force.get(e.source)!.y += fy
      force.get(e.target)!.x -= fx; force.get(e.target)!.y -= fy
    }

    // 4. Integrate
    for (const id of nodeList) {
      const v = vel.get(id)!
      const f = force.get(id)!
      v.x = (v.x + f.x) * 0.75 * cool
      v.y = (v.y + f.y) * 0.75 * cool
      const p = pos.get(id)!
      p.x += v.x
      p.y += v.y
    }
  }

  return { positions: pos, centroids }
}
