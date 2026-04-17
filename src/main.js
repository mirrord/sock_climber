import { ScreenManager } from './ui/ScreenManager.js';
import { MainMenuScreen } from './ui/MainMenuScreen.js';
import { LevelSelectScreen } from './ui/LevelSelectScreen.js';
import { SettingsScreen } from './ui/SettingsScreen.js';
import { PlayScreen } from './ui/PlayScreen.js';
import { LevelStore } from './level/LevelStore.js';
import { AssetManifest } from './assets/AssetManifest.js';
import { AssetStore } from './assets/AssetStore.js';
import { AssetLoader } from './assets/AssetLoader.js';

const devMode = import.meta.env.MODE !== 'production';

// Initialize asset infrastructure
const manifest = new AssetManifest();
await manifest.init();
const assetStore = new AssetStore(manifest);
const assetLoader = new AssetLoader(assetStore, manifest);

const levelStore = new LevelStore(assetStore);
const sm = new ScreenManager();

const menu = new MainMenuScreen(document.body, {
  onLevelSelect: () => sm.switchTo('levelSelect'),
  onLevelBuilder: () => sm.switchTo('levelBuilder'),
  onObjectEditor: () => sm.switchTo('objectEditor'),
  onSettings: () => sm.switchTo('settings'),
}, { devMode });

const levelSelect = new LevelSelectScreen(document.body, levelStore, {
  onPlay: (name) => sm.switchTo('play', { levelName: name }),
  onBack: () => sm.back(),
});

const settings = new SettingsScreen(document.body, {
  onBack: () => sm.back(),
});

const play = new PlayScreen(document.body, levelStore, {
  onBack: () => sm.back(),
});

sm.register('menu', menu);
sm.register('levelSelect', levelSelect);
sm.register('settings', settings);
sm.register('play', play);

if (devMode) {
  const { LevelBuilderScreen } = await import('./ui/LevelBuilderScreen.js');
  const { ObjectEditorScreen } = await import('./ui/ObjectEditorScreen.js');

  const levelBuilder = new LevelBuilderScreen(document.body, levelStore, {
    onBack: () => sm.back(),
  });
  const objectEditor = new ObjectEditorScreen(document.body, {
    onBack: () => sm.back(),
  });

  sm.register('levelBuilder', levelBuilder);
  sm.register('objectEditor', objectEditor);
}

sm.switchTo('menu');
