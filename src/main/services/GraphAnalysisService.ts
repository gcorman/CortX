/**
 * Single-pass Louvain community detection on an undirected graph.
 * Pure JS, no deps. ~150 lines. Good enough for ~5k nodes.
 *
 * Returns one community id per node. Quality is roughly equivalent to
 * the multi-level Louvain for the visualization use case (we only need
 * coarse clusters, not optimal modularity).
 */

export interface CommunityResult {
  /** nodeId → communityId (renumbered 0..count-1) */
  communities: Map<string, number>
  /** Number of distinct communities */
  count: number
}

export class GraphAnalysisService {
  louvain(
    nodeIds: string[],
    edges: Array<{ source: string; target: string }>
  ): CommunityResult {
    const n = nodeIds.length
    if (n === 0) return { communities: new Map(), count: 0 }

    const idx = new Map<string, number>()
    nodeIds.forEach((id, i) => idx.set(id, i))

    const adj: Map<number, number>[] = Array.from({ length: n }, () => new Map())
    let m = 0
    for (const e of edges) {
      const a = idx.get(e.source)
      const b = idx.get(e.target)
      if (a === undefined || b === undefined || a === b) continue
      adj[a].set(b, (adj[a].get(b) ?? 0) + 1)
      adj[b].set(a, (adj[b].get(a) ?? 0) + 1)
      m += 1
    }

    if (m === 0) {
      const communities = new Map<string, number>()
      nodeIds.forEach((id, i) => communities.set(id, i))
      return { communities, count: n }
    }

    const twoM = 2 * m
    const k: number[] = adj.map((neighbors) =>
      Array.from(neighbors.values()).reduce((s, w) => s + w, 0)
    )

    const community: number[] = nodeIds.map((_, i) => i)
    const sumTot: number[] = k.slice()
    const sumIn: number[] = new Array(n).fill(0)

    let improved = true
    let iterations = 0
    const MAX_ITER = 20

    while (improved && iterations < MAX_ITER) {
      improved = false
      iterations++

      const order = nodeIds.map((_, i) => i)
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[order[i], order[j]] = [order[j], order[i]]
      }

      for (const i of order) {
        const ci = community[i]
        const weightToCommunity = new Map<number, number>()
        for (const [j, w] of adj[i]) {
          const cj = community[j]
          weightToCommunity.set(cj, (weightToCommunity.get(cj) ?? 0) + w)
        }

        // Remove i from ci
        const kiInOld = weightToCommunity.get(ci) ?? 0
        sumTot[ci] -= k[i]
        sumIn[ci] -= 2 * kiInOld

        if (!weightToCommunity.has(ci)) weightToCommunity.set(ci, 0)

        let bestC = ci
        let bestGain = -Infinity
        for (const [cTarget, kiIn] of weightToCommunity) {
          const gain =
            kiIn / m - (sumTot[cTarget] * k[i]) / (twoM * m)
          if (gain > bestGain) {
            bestGain = gain
            bestC = cTarget
          }
        }

        // Add to bestC
        const kiInNew = weightToCommunity.get(bestC) ?? 0
        community[i] = bestC
        sumTot[bestC] += k[i]
        sumIn[bestC] += 2 * kiInNew
        if (bestC !== ci) improved = true
      }
    }

    // Renumber to 0..count-1
    const remap = new Map<number, number>()
    let next = 0
    const result = new Map<string, number>()
    for (let i = 0; i < n; i++) {
      const c = community[i]
      if (!remap.has(c)) remap.set(c, next++)
      result.set(nodeIds[i], remap.get(c)!)
    }

    return { communities: result, count: next }
  }
}
