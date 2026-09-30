export interface LanePoint { x: number; y: number }
export interface LaneRoute { id: number; points: LanePoint[]; cumulative: number[]; length: number }
export interface LaneProjection extends LanePoint { progress: number; distance: number }

/** All routes run from the player fort toward the enemy fort in authority coordinates. */
export function getLaneRoutes(count: number): LaneRoute[] {
  const xs = count === 3 ? [2.2, 6, 9.8] : count === 2 ? [3, 9] : [6];
  return xs.map((x, id) => {
    const points = [{ x: 6, y: 17.6 }, { x: 6, y: 16.4 }, { x, y: 14 }, { x, y: 6 }, { x: 6, y: 3.6 }, { x: 6, y: 2.4 }];
    const cumulative = [0];
    for (let index = 1; index < points.length; index++) cumulative.push(cumulative[index - 1] + Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y));
    return { id, points, cumulative, length: cumulative.at(-1)! };
  });
}

export function pointOnLane(route: LaneRoute, progress: number): LanePoint {
  const value = Math.max(0, Math.min(route.length, progress));
  for (let index = 1; index < route.points.length; index++) if (value <= route.cumulative[index]) {
    const from = route.points[index - 1], to = route.points[index];
    const ratio = (value - route.cumulative[index - 1]) / (route.cumulative[index] - route.cumulative[index - 1]);
    return { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio };
  }
  return { ...route.points.at(-1)! };
}

export function projectToLane(route: LaneRoute, point: LanePoint): LaneProjection {
  let selected: LaneProjection = { ...route.points[0], progress: 0, distance: Infinity };
  for (let index = 1; index < route.points.length; index++) {
    const from = route.points[index - 1], to = route.points[index];
    const dx = to.x - from.x, dy = to.y - from.y;
    const length = route.cumulative[index] - route.cumulative[index - 1];
    const ratio = Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / (length * length)));
    const x = from.x + ratio * dx, y = from.y + ratio * dy;
    const distance = Math.hypot(point.x - x, point.y - y);
    if (distance < selected.distance - 1e-7) selected = { x, y, progress: route.cumulative[index - 1] + ratio * length, distance };
  }
  return selected;
}

export function nearestLane(routes: LaneRoute[], point: LanePoint): { lane: number; projection: LaneProjection } {
  let lane = 0, projection = projectToLane(routes[0], point);
  for (let index = 1; index < routes.length; index++) {
    const candidate = projectToLane(routes[index], point);
    if (candidate.distance < projection.distance - 1e-7) { lane = index; projection = candidate; }
  }
  return { lane, projection };
}
