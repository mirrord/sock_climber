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
    subtitles: [
      "It's Laundry Time",
      "A shoe-in for Vibe Jam 2026",
      "We couldn't book Bennett Foddy",
      "Where's the other one?",
      "Try for a sub 3:00 time!",
    ],
    start: "Start",
    settings: "Settings",
    credits: "Credits",
  },
  levelSelect: {
    heading: "Select a Level",
    subtitle: "Choose where to begin your climb",
    back: "Back",
    comingSoon: "Coming Soon",
    bestDistance: "Best",
    bestDistanceNone: "—",
    levels: {
      1: "Level 1 — The Laundry Pile",
      2: "Level 2 — The Sock Drawer",
      3: "Level 3 — The Snaking Corridor",
      4: "Level 4 — The Boss Fight",
    },
  },
  gameOver: {
    heading: "Game Over",
    distance: "Distance",
    kills: "Kills",
    newRecord: "New Record!",
    restart: "Play Again",
    title: "Exit to Main Menu",
  },
  victory: {
    heading: "Boss Defeated!",
    subtitle: "You vanquished the laundry pile.",
    kills: "Enemies defeated",
    restart: "Play Again",
    title: "Quit to Title",
    credits: "Credits",
  },
  credits: {
    heading: "Credits",
    body: `Thank you for playing Sock Climber!

Director         Brice Howard
Music            Sarah Howard
Art              Mostly Brice Howard, with contributions from Sarah Howard and ChatGPT
Programming      Dane Howard & various Claudes
QA               Weena Mercator
`,
    hint: "Press any button to return to the main menu",
  },
  loadout: {
    heading: "Choose Your Loadout",
    subtitle: "Pick 3 patches before facing the boss.",
    remaining: "Picks remaining",
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
    skip: "Skip Upgrade",
  },
} as const;
