import type { BattleState, UnitEntity } from './simulation.ts';
import { getLaneRoutes, pointOnLane } from './lanes.ts';

export const NETWORK_RENDER_DELAY = 150;
const MAX_SNAPSHOTS = 32;
type Snapshot = { state: BattleState; receivedAt: number };
export type BattlePresentation = { state: BattleState; visualTime: number };
type MovingEntity = { id: number; x: number; y: number };
const mix = (from: number, to: number, fraction: number) => from + (to - from) * fraction;

/** Delays only drawing coordinates. Resources, damage and visibility remain authoritative. */
export class BattleSnapshotInterpolator {
  private snapshots: Snapshot[] = [];
  private latest: BattleState | null = null;

  reset(): void { this.snapshots = []; this.latest = null; }

  push(state: BattleState, receivedAt: number): boolean {
    if (this.latest && (state.time < this.latest.time || (this.latest.result && !state.result))) return false;
    const previous = this.snapshots.at(-1);
    const arrival = Math.max(receivedAt, previous?.receivedAt ?? receivedAt);
    if (previous && arrival - previous.receivedAt > NETWORK_RENDER_DELAY) {
      // A missing packet freezes movement. Resume from that held position, without a jump.
      this.snapshots.push({ state: previous.state, receivedAt: arrival - NETWORK_RENDER_DELAY });
    }
    if (previous?.receivedAt === arrival) previous.state = state;
    else this.snapshots.push({ state, receivedAt: arrival });
    this.latest = state;
    if (this.snapshots.length > MAX_SNAPSHOTS) this.snapshots.splice(0, this.snapshots.length - MAX_SNAPSHOTS);
    return true;
  }

  sample(now: number): BattlePresentation | null {
    const latest = this.latest;
    if (!latest || !this.snapshots.length) return null;
    if (latest.result) return { state: latest, visualTime: latest.time };
    const target = now - NETWORK_RENDER_DELAY;
    while (this.snapshots.length > 1 && this.snapshots[1].receivedAt <= target) this.snapshots.shift();
    const from = this.snapshots[0];
    const to = this.snapshots[1] ?? from;
    const fraction = to.receivedAt > from.receivedAt
      ? Math.max(0, Math.min(1, (target - from.receivedAt) / (to.receivedAt - from.receivedAt))) : 0;
    const routes = latest.rules?.lanes.count ? getLaneRoutes(latest.rules.lanes.count) : [];
    const positions = <T extends MovingEntity>(key: 'units' | 'projectiles', entities: T[]): T[] => {
      const earlier = new Map(from.state[key].map((entity) => [entity.id, entity]));
      const later = new Map(to.state[key].map((entity) => [entity.id, entity]));
      let births: Map<number, MovingEntity> | undefined;
      return entities.map((entity) => {
        const start = earlier.get(entity.id);
        const end = later.get(entity.id);
        if (start && end) {
          if (key === 'units' && routes.length) {
            const a = start as UnitEntity, b = end as UnitEntity;
            if (a.lane !== null && a.lane === b.lane && !a.laneEntering && !b.laneEntering && routes[a.lane]) {
              return { ...entity, ...pointOnLane(routes[a.lane], mix(a.laneProgress, b.laneProgress, fraction)) };
            }
          }
          return { ...entity, x: mix(start.x, end.x, fraction), y: mix(start.y, end.y, fraction) };
        }
        // New entities appear immediately at their first known location until the buffer catches up.
        if (!births) {
          births = new Map();
          for (const snapshot of this.snapshots) for (const candidate of snapshot.state[key]) {
            if (!births.has(candidate.id)) births.set(candidate.id, candidate);
          }
        }
        const first = births.get(entity.id) ?? entity;
        return { ...entity, x: first.x, y: first.y };
      });
    };
    return {
      state: { ...latest, units: positions('units', latest.units), projectiles: positions('projectiles', latest.projectiles) },
      visualTime: mix(from.state.time, to.state.time, fraction),
    };
  }
}
