import { createEffect, createSignal, onCleanup } from "solid-js";

const states = {
  idle: { row: 0, frames: 6 },
  "running-right": { row: 1, frames: 8 },
  "running-left": { row: 2, frames: 8 },
  waving: { row: 3, frames: 4 },
  jumping: { row: 4, frames: 5 },
  failed: { row: 5, frames: 8 },
  waiting: { row: 6, frames: 6 },
  running: { row: 7, frames: 6 },
  review: { row: 8, frames: 6 }
};

export function RunbotChameleonPet(props) {
  const [frame, setFrame] = createSignal(0);
  let animationTimer = 0;

  const frameWidth = () => props.frameWidth ?? 192;
  const frameHeight = () => props.frameHeight ?? 208;
  const size = () => props.size ?? 1;
  const frameDelay = () => Math.max(16, props.frameDelay ?? 140);
  const runEvery = () => Math.max(0, props.runEvery ?? 3) * 1000;
  const selectedState = () => props.state ?? "idle";
  const stateDef = () => states[selectedState()] || states.idle;

  createEffect(() => {
    window.clearTimeout(animationTimer);
    setFrame(0);

    if (props.paused) return;

    if (props.autoRun) {
      const playCycle = () => {
        const frames = stateDef().frames;

        const advance = (nextFrame) => {
          if (nextFrame >= frames) {
            setFrame(0);
            animationTimer = window.setTimeout(playCycle, runEvery());
            return;
          }

          setFrame(nextFrame);
          animationTimer = window.setTimeout(() => advance(nextFrame + 1), frameDelay());
        };

        advance(1);
      };

      playCycle();
      return;
    }

    const loop = () => {
      setFrame((current) => (current + 1) % stateDef().frames);
      animationTimer = window.setTimeout(loop, frameDelay());
    };

    animationTimer = window.setTimeout(loop, frameDelay());
  });

  onCleanup(() => {
    window.clearTimeout(animationTimer);
  });

  return (
    <div
      aria-hidden="true"
      style={{
        width: `${frameWidth()}px`,
        height: `${frameHeight()}px`,
        "background-image": `url("${props.atlasUrl}")`,
        "background-repeat": "no-repeat",
        "background-position": `-${frame() * frameWidth()}px -${stateDef().row * frameHeight()}px`,
        transform: `scaleX(${props.flipped === false ? 1 : -1}) scale(${size()})`,
        "transform-origin": "center",
        "image-rendering": "auto"
      }}
    />
  );
}
