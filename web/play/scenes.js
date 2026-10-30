// The scenes and the games each one hosts (server/room.mjs has the same list). A scene is
// the room with the agent seated in it; its games only dress the table. build(layer)
// returns what the games need from it. sound names the scene's ambience (audio.js).
import { addOpponent } from './stage.js';
import { t } from './i18n.js';
import { buildRaft, roomOptions as raftOptions } from './casino.js';
import { buildMachine, roomOptions as machineOptions } from './roulette.js';

export const SCENES = {
  raft: {
    name: t('ui.scenes.raft'),
    games: ['blackjack', 'yacht'],
    options: raftOptions,
    sound: 'raft',
    build(stage) {
      const opp = addOpponent(stage, { body: 0x1a1014, chairColor: 0x2a0c14, eye: 0xff8ad0, chair: 'lounger' });
      const casino = buildRaft(stage);
      return { opp, casino, pv: casino.pv, screens: casino.screens }; // pv: the launch video's hooks
    },
  },
  machine: {
    name: t('ui.scenes.machine'),
    games: ['roulette'],
    options: machineOptions,
    sound: 'machine',
    build: buildMachine,
  },
};

export const GAME_NAMES = { roulette: t('ui.games.roulette.name'), blackjack: t('ui.games.blackjack.name'), yacht: t('ui.games.yacht.name') };
export const sceneOf = (game) => Object.keys(SCENES).find((s) => SCENES[s].games.includes(game));
