export type NavigationScrollState = {
  position: number;
  distance: number;
  direction: number;
  hidden: boolean;
};

export function navigationScrollStart(position = 0): NavigationScrollState {
  return { position, distance: 0, direction: 0, hidden: false };
}

export function navigationScrollStep(
  previous: NavigationScrollState,
  position: number,
  maximum: number,
): NavigationScrollState {
  // Safari's rubber band can report negative positions and positions past the
  // bottom. Clamp both ends so the rebound cannot masquerade as a new gesture.
  const limit = Math.max(0, maximum);
  const current = Math.max(0, Math.min(position, limit));
  if (limit <= 10 || current <= 8) return navigationScrollStart(current);
  const delta = current - Math.max(0, Math.min(previous.position, limit));
  if (!delta) return { ...previous, position: current };
  const direction = Math.sign(delta);
  const distance =
    direction === previous.direction ? previous.distance + delta : delta;
  const crossed = Math.abs(distance) >= 10;
  return {
    position: current,
    direction,
    distance: crossed ? 0 : distance,
    hidden: crossed ? direction > 0 : previous.hidden,
  };
}
