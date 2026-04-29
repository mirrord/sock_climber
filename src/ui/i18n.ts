/**
 * English text strings for all UI screens.
 *
 * Single source of truth for displayed copy. Provides a cheap localisation
 * hook — swap this table to translate the whole UI.
 */
export const TEXT = {
  hud: {
    distanceUnit: "m",
  },
  pause: {
    heading: "Paused",
    resume: "Resume",
    settings: "Settings",
    quit: "Quit to Title",
  },
  title: {
    heading: "Sock Climber",
    subtitle: "A vertical sock-themed climber",
    start: "Start",
    settings: "Settings",
  },
  levelSelect: {
    heading: "Select a Level",
    subtitle: "Choose where to begin your climb",
    back: "Back",
    comingSoon: "Coming Soon",
    levels: {
      1: "Level 1 — The Laundry Pile",
      2: "Level 2 — ???",
      3: "Level 3 — ???",
      4: "Level 4 — ???",
    },
  },
  gameOver: {
    heading: "Game Over",
    distance: "Distance",
    kills: "Kills",
    restart: "Play Again",
  },
  settings: {
    heading: "Settings",
    keybinds: "Keyboard",
    audio: "Audio",
    master: "Master",
    music: "Music",
    sfx: "SFX",
    muted: "Mute",
    gamepadButtons: "Gamepad Buttons",
    gamepadAxes: "Gamepad Axes",
    resetSection: "Reset to defaults",
    listening: "[press input… (Esc to cancel)]",
    unbound: "—",
    close: "Close",
  },
  patch: {
    heading: "Choose an Upgrade",
  },
} as const;
