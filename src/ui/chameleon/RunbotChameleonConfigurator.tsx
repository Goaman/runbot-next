import { For, createEffect, createMemo, createSignal } from "solid-js";
import { RunbotChameleonPet } from "./RunbotChameleonPet";
import atlas020 from "./final/spritesheet-020.webp";
import atlas025 from "./final/spritesheet-025.webp";
import atlas050 from "./final/spritesheet-050.webp";
import atlas075 from "./final/spritesheet-075.webp";
import atlas100 from "./final/spritesheet.webp";

export const RUNBOT_CHAMELEON_STATES = [
  { name: "idle", row: 0, frames: 6 },
  { name: "running-right", row: 1, frames: 8 },
  { name: "running-left", row: 2, frames: 8 },
  { name: "waving", row: 3, frames: 4 },
  { name: "jumping", row: 4, frames: 5 },
  { name: "failed", row: 5, frames: 8 },
  { name: "waiting", row: 6, frames: 6 },
  { name: "running", row: 7, frames: 6 },
  { name: "review", row: 8, frames: 6 }
];

export const RUNBOT_CHAMELEON_ASSETS = [
  { id: "020", label: "20% WebP", atlasUrl: atlas020, frameWidth: 38, frameHeight: 42 },
  { id: "025", label: "25% WebP", atlasUrl: atlas025, frameWidth: 48, frameHeight: 52 },
  { id: "050", label: "50% WebP", atlasUrl: atlas050, frameWidth: 96, frameHeight: 104 },
  { id: "075", label: "75% WebP", atlasUrl: atlas075, frameWidth: 144, frameHeight: 156 },
  { id: "100", label: "100% WebP", atlasUrl: atlas100, frameWidth: 192, frameHeight: 208 }
];

const defaultConfig = {
  id: "default",
  name: "Default",
  state: "idle",
  assetId: "100",
  size: 1,
  frameDelay: 140,
  flipped: true,
  paused: false,
  autoRun: false,
  runEvery: 3
};

function readStoredConfigs(storageKey) {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey));
    return Array.isArray(parsed) && parsed.length ? parsed : [{ ...defaultConfig }];
  } catch {
    return [{ ...defaultConfig }];
  }
}

export function RunbotChameleonConfigurator(props) {
  const states = () => props.states || RUNBOT_CHAMELEON_STATES;
  const assets = () => props.assets || RUNBOT_CHAMELEON_ASSETS;
  const storageKey = () => props.storageKey || "runbot-chameleon-configs";
  const activeStorageKey = () => `${storageKey()}-active`;
  const initialConfigs = readStoredConfigs(storageKey());
  const initialActiveId = localStorage.getItem(activeStorageKey()) || initialConfigs[0].id;
  const initialActiveConfig = initialConfigs.find((config) => config.id === initialActiveId) || initialConfigs[0];

  const [configs, setConfigs] = createSignal(initialConfigs);
  const [activeId, setActiveId] = createSignal(initialActiveConfig.id);
  const [copied, setCopied] = createSignal(false);

  const activeConfig = createMemo(() => {
    return configs().find((config) => config.id === activeId()) || configs()[0] || { ...defaultConfig };
  });

  const activeAsset = createMemo(() => {
    return assets().find((asset) => asset.id === activeConfig().assetId) || assets()[assets().length - 1];
  });

  const snippet = createMemo(() => `<RunbotChameleonPet
  state="${activeConfig().state}"
  atlasUrl="${activeAsset().atlasUrl}"
  frameWidth={${activeAsset().frameWidth}}
  frameHeight={${activeAsset().frameHeight}}
  size={${Number(activeConfig().size).toFixed(2)}}
  frameDelay={${activeConfig().frameDelay}}
  paused={${activeConfig().paused}}
  flipped={${activeConfig().flipped}}
  autoRun={${activeConfig().autoRun}}
  runEvery={${Number(activeConfig().runEvery).toFixed(1)}}
/>`);

  createEffect(() => {
    localStorage.setItem(storageKey(), JSON.stringify(configs()));
    localStorage.setItem(activeStorageKey(), activeId());
  });

  function updateConfig(patch) {
    setConfigs((items) => items.map((config) => {
      return config.id === activeConfig().id ? { ...config, ...patch } : config;
    }));
  }

  function createConfig() {
    const next = { ...activeConfig(), id: `config-${Date.now()}`, name: "New config" };
    setConfigs((items) => [...items, next]);
    setActiveId(next.id);
  }

  function deleteConfig() {
    if (configs().length === 1) return;
    const nextConfigs = configs().filter((config) => config.id !== activeConfig().id);
    setConfigs(nextConfigs);
    setActiveId(nextConfigs[0].id);
  }

  function resetConfigs() {
    const next = { ...defaultConfig };
    setConfigs([next]);
    setActiveId(next.id);
  }

  async function copySnippet() {
    await navigator.clipboard.writeText(snippet());
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <main class="pet-configurator">
      <section class="stage" aria-label="Pet preview">
        <RunbotChameleonPet
          state={activeConfig().state}
          atlasUrl={activeAsset().atlasUrl}
          frameWidth={activeAsset().frameWidth}
          frameHeight={activeAsset().frameHeight}
          size={activeConfig().size}
          frameDelay={activeConfig().frameDelay}
          paused={activeConfig().paused}
          flipped={activeConfig().flipped}
          autoRun={activeConfig().autoRun}
          runEvery={activeConfig().runEvery}
        />
      </section>

      <section class="panel">
        <div>
          <h1>{props.title || "Runbot Chameleon"}</h1>
          <p class="meta">
            {props.description || "Config editor for browser/Solid usage. Each config explicitly selects the atlas asset and frame size."}
          </p>
        </div>

        <div class="box">
          <div class="grid">
            <label>
              Config
              <select value={activeConfig().id} onInput={(event) => setActiveId(event.currentTarget.value)}>
                <For each={configs()}>{(config) => (
                  <option value={config.id}>{config.name}</option>
                )}</For>
              </select>
            </label>
            <label>
              Name
              <input
                type="text"
                value={activeConfig().name}
                onInput={(event) => updateConfig({ name: event.currentTarget.value || "Untitled" })}
              />
            </label>
          </div>

          <div class="grid-3">
            <button type="button" onClick={createConfig}>New</button>
            <button class="primary" type="button" onClick={() => updateConfig({ ...activeConfig() })}>Save</button>
            <button type="button" onClick={deleteConfig}>Delete</button>
          </div>
          <button type="button" onClick={resetConfigs}>Reset controls</button>
        </div>

        <div class="box">
          <div class="grid">
            <label>
              State
              <select value={activeConfig().state} onInput={(event) => updateConfig({ state: event.currentTarget.value })}>
                <For each={states()}>{(state) => (
                  <option value={state.name}>{state.name}</option>
                )}</For>
              </select>
            </label>
            <label>
              Asset
              <select value={activeConfig().assetId} onInput={(event) => updateConfig({ assetId: event.currentTarget.value })}>
                <For each={assets()}>{(asset) => (
                  <option value={asset.id}>{asset.label} ({asset.frameWidth}x{asset.frameHeight})</option>
                )}</For>
              </select>
            </label>
          </div>

          <div class="grid">
            <label>
              Size
              <input
                type="range"
                min="0.2"
                max="2"
                step="0.05"
                value={activeConfig().size}
                onInput={(event) => updateConfig({ size: Number(event.currentTarget.value) })}
              />
              <span class="readout">{Number(activeConfig().size).toFixed(2)}x</span>
            </label>
            <label>
              Frame delay
              <input
                type="range"
                min="70"
                max="420"
                step="10"
                value={activeConfig().frameDelay}
                onInput={(event) => updateConfig({ frameDelay: Number(event.currentTarget.value) })}
              />
              <span class="readout">{activeConfig().frameDelay} ms</span>
            </label>
          </div>

          <div class="grid">
            <label>
              Run every
              <input
                type="range"
                min="0.5"
                max="5"
                step="0.5"
                value={activeConfig().runEvery}
                onInput={(event) => updateConfig({ runEvery: Number(event.currentTarget.value) })}
              />
              <span class="readout">{Number(activeConfig().runEvery).toFixed(1)} sec</span>
            </label>
            <div class="grid" style={{ "align-self": "end" }}>
              <label class="check">
                <input
                  type="checkbox"
                  checked={activeConfig().flipped}
                  onInput={(event) => updateConfig({ flipped: event.currentTarget.checked })}
                />
                Flip
              </label>
              <label class="check">
                <input
                  type="checkbox"
                  checked={activeConfig().autoRun}
                  onInput={(event) => updateConfig({ autoRun: event.currentTarget.checked })}
                />
                Auto run
              </label>
            </div>
          </div>

          <button
            type="button"
            aria-pressed={activeConfig().paused}
            onClick={() => updateConfig({ paused: !activeConfig().paused })}
          >
            {activeConfig().paused ? "Play" : "Pause"}
          </button>
        </div>

        <section class="usage" aria-label="Solid usage">
          <div class="usage-head">
            <h2>Solid usage</h2>
            <button type="button" onClick={copySnippet}>{copied() ? "Copied" : "Copy"}</button>
          </div>
          <pre><code>{snippet()}</code></pre>
        </section>
      </section>
    </main>
  );
}
