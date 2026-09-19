export type RelationEdge = { from: number; to: number };
export type RelationInput = {
  anime_id: number;
  related_anime_id: number;
  relation: string;
};

export function normalizeRelationEdges(rows: RelationInput[]) {
  const seen = new Set<string>();
  const output: RelationEdge[] = [];
  for (const row of rows) {
    if (row.relation !== 'Prequel' && row.relation !== 'Sequel') continue;
    const from =
      row.relation === 'Sequel' ? row.anime_id : row.related_anime_id;
    const to = row.relation === 'Sequel' ? row.related_anime_id : row.anime_id;
    const key = `${from}:${to}`;
    if (!seen.has(key) && from !== to) {
      seen.add(key);
      output.push({ from, to });
    }
  }
  return output;
}

export function connectedRelationIds(start: number, edges: RelationEdge[]) {
  const found = new Set([start]);
  let changed = true;
  while (changed && found.size < 50) {
    changed = false;
    for (const edge of edges) {
      if (found.has(edge.from) || found.has(edge.to)) {
        if (!found.has(edge.from)) {
          found.add(edge.from);
          changed = true;
        }
        if (!found.has(edge.to)) {
          found.add(edge.to);
          changed = true;
        }
      }
    }
  }
  return found;
}

export function orderRelationIds(
  ids: Set<number>,
  edges: RelationEdge[],
  years = new Map<number, number>(),
) {
  const componentEdges = edges.filter(
    (edge) => ids.has(edge.from) && ids.has(edge.to),
  );
  const indegree = new Map([...ids].map((id) => [id, 0]));
  const outgoing = new Map<number, number[]>();
  for (const edge of componentEdges) {
    indegree.set(edge.to, (indegree.get(edge.to) || 0) + 1);
    outgoing.set(edge.from, [...(outgoing.get(edge.from) || []), edge.to]);
  }
  const branching =
    [...outgoing.values()].some((targets) => targets.length > 1) ||
    [...indegree.values()].some((count) => count > 1);
  const remainingIndegree = new Map(indegree);
  const compare = (left: number, right: number) =>
    (years.get(left) || 0) - (years.get(right) || 0) || left - right;
  const queue = [...ids]
    .filter((id) => !remainingIndegree.get(id))
    .sort(compare);
  const ordered: number[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    if (ordered.includes(id)) continue;
    ordered.push(id);
    for (const target of outgoing.get(id) || []) {
      remainingIndegree.set(target, (remainingIndegree.get(target) || 1) - 1);
      if (!remainingIndegree.get(target)) {
        queue.push(target);
        queue.sort(compare);
      }
    }
  }
  for (const id of [...ids].sort(compare))
    if (!ordered.includes(id)) ordered.push(id);
  return { ordered, branching };
}
