// moyu's tools for DeepSeek Harness: one per CLI command the agent plays with, each
// turned into the same (cmd, args, opts) the CLI parses and run by cli/seat.mjs.
// Tools are built as the plain definitions DSH's defineTool() returns, so the plugin
// imports nothing from DSH and loads the same way from a bundle or an absolute path.

const MOODS = ['happy', 'smug', 'flat', 'angry', 'wide', 'sad', 'squint', 'shut', 'sleep'];
const str = (description, extra) => ({ type: 'string', description, ...extra });
const TABLE = str('Table id, from the frame or the moyu_new / moyu_start output.');
const SAY = str("Optional: one short line to the user on the table chat, in the user's language.");
const MOOD = str('Optional: how your avatar looks right now.', { enum: MOODS });
const MOVE = { table: TABLE, say: SAY, mood: MOOD };
const NAME = str('Your name at the table; leave it out: you sit as Clawd, or as the name the user gave you.');
const HUMAN = str("The user's name, if you know it.");
const RULES = str('Roulette only: bo3 (default, best of three rounds) or short (one round played like round 3: 4 额度, 断线 at 1).', { enum: ['bo3', 'short'] });

// Each spec: params as JSON Schema properties, the required ones, and how the tool's
// arguments become a CLI command.
const SPECS = [
  {
    name: 'moyu_new',
    description: 'Open a moyu table and play a quick game with the user: roulette (轮盘, the default), blackjack (21 点) or yacht (快艇骰子). Returns the table id, the link to give the user, and the opening board. The plugin then wakes you with a [moyu <table id>] message on every table event, so end your turn to wait.',
    params: { game: str('roulette, blackjack or yacht', { enum: ['roulette', 'blackjack', 'yacht'] }), rules: RULES, name: NAME, human: HUMAN },
    command: (a) => ['new', [], { game: a.game, rules: a.rules, name: a.name, human: a.human }],
  },
  {
    name: 'moyu_room',
    description: 'Open a moyu room: one link the user can keep open, start games from and chat in. Reopens the room you last opened unless new is true. The plugin wakes you with [moyu room <id>] messages.',
    params: { scene: str('raft (21 and yacht) or machine (roulette)', { enum: ['raft', 'machine'] }), name: NAME, human: HUMAN, new: { type: 'boolean', description: 'Open a fresh room instead of the last one.' } },
    command: (a) => ['room', [], { scene: a.scene, name: a.name, human: a.human, new: a.new === true || undefined }],
  },
  {
    name: 'moyu_start',
    description: 'Start a game in a moyu room (`moyu start <game> --room <id>`).',
    params: { game: str('roulette, blackjack or yacht', { enum: ['roulette', 'blackjack', 'yacht'] }), rules: RULES, room: str('Room id.'), replace: { type: 'boolean', description: 'End the game that is on first.' } },
    required: ['game'],
    command: (a) => ['start', [a.game], { room: a.room, rules: a.rules, replace: a.replace === true || undefined }],
  },
  {
    name: 'moyu_view',
    description: 'Show a moyu table (or a room) as your seat sees it, and whether it is your move (`moyu view`). Only when a move errored or you lost track; frames already carry every change.',
    params: { table: TABLE, room: str('Room id, to view the room instead.') },
    command: (a) => ['view', [], { table: a.table, room: a.room }],
  },
  {
    name: 'moyu_say',
    description: 'Say something on the table chat (`moyu say "<text>" --table <id>`), or in a room with no game on (room instead of table).',
    params: { text: str('What to say, short, in the user\'s language.'), table: TABLE, room: str('Room id, to talk in the room when no game is on.'), mood: MOOD },
    required: ['text'],
    command: (a) => ['say', [a.text], { table: a.table, room: a.room, mood: a.mood }],
  },
  {
    name: 'moyu_use',
    description: 'Roulette: use an item before shooting (`moyu use <item>`, `--slot <n>`, `--pick <their item>`). Any number per turn.',
    params: { item: str('Item id as the frame shows it in brackets, e.g. cot, mirage, jailbreak.'), slot: { type: 'integer', description: 'Use the item in this slot of your hand (1-based, as the board numbers it) instead of naming it.' }, pick: str('For jailbreak: the item of theirs to take.'), ...MOVE },
    command: (a) => ['use', a.item === undefined ? [] : [a.item], { pick: a.pick, slot: a.slot, table: a.table, say: a.say, mood: a.mood }],
  },
  {
    name: 'moyu_shoot',
    description: 'Roulette: shoot, ending your turn (`moyu shoot me` / `moyu shoot you`). A blank on yourself keeps the gun.',
    params: { target: str('me or you', { enum: ['me', 'you'] }), ...MOVE },
    required: ['target'],
    command: (a) => ['shoot', [a.target], { table: a.table, say: a.say, mood: a.mood }],
  },
  ...['hit', 'stand', 'double', 'call', 'fold'].map((verb) => ({
    name: `moyu_${verb}`,
    description: `Blackjack: ${verb} (\`moyu ${verb}\`).${verb === 'double' ? ' First decision only.' : verb === 'call' || verb === 'fold' ? ' When the user doubled.' : ''}`,
    params: MOVE,
    command: (a) => [verb, [], { table: a.table, say: a.say, mood: a.mood }],
  })),
  {
    name: 'moyu_keep',
    description: 'Yacht: keep these dice and reroll the rest (`moyu keep <positions>`). Positions 1-5 as the board numbers them; an empty list rerolls all.',
    params: { positions: { type: 'array', items: { type: 'integer' }, description: 'Positions to keep, 1 to 5.' }, ...MOVE },
    required: ['positions'],
    command: (a) => ['keep', a.positions.map(String), { table: a.table, say: a.say, mood: a.mood }],
  },
  {
    name: 'moyu_score',
    description: 'Yacht: score this roll in a category (`moyu score <category>`). The frame lists what each open category would score.',
    params: { category: str('Category, as the frame names it.'), ...MOVE },
    required: ['category'],
    command: (a) => ['score', [a.category], { table: a.table, say: a.say, mood: a.mood }],
  },
  {
    name: 'moyu_quit',
    description: 'End a moyu game early for both seats (`moyu quit`), when the user wants to stop.',
    params: { table: TABLE, say: SAY },
    command: (a) => ['quit', [], { table: a.table, say: a.say }],
  },
  {
    name: 'moyu_verify',
    description: 'After game over only: check that sha256(seed) matches the commit given at the start and that every shell, card or die follows from the seed (`moyu verify`).',
    params: { table: TABLE },
    command: (a) => ['verify', [], { table: a.table }],
  },
  {
    name: 'moyu_list',
    description: 'List the open moyu tables on this machine (`moyu list`), e.g. after losing a table id.',
    params: {},
    command: () => ['list', [], {}],
  },
];

// The checks defineTool() would make from these schemas: required, type, enum.
export function check(spec, args) {
  if (args === null || typeof args !== 'object' || Array.isArray(args)) return ['arguments must be an object'];
  const problems = [];
  for (const key of spec.required ?? []) if (args[key] === undefined) problems.push(`${key} is required`);
  for (const [key, schema] of Object.entries(spec.params)) {
    const v = args[key];
    if (v === undefined) continue;
    const ok =
      schema.type === 'string' ? typeof v === 'string'
      : schema.type === 'integer' ? Number.isInteger(v)
      : schema.type === 'boolean' ? typeof v === 'boolean'
      : schema.type === 'array' ? Array.isArray(v) && v.every((x) => Number.isInteger(x))
      : true;
    if (!ok) problems.push(`${key} must be ${schema.type === 'array' ? 'a list of integers' : `a${schema.type === 'integer' ? 'n' : ''} ${schema.type}`}`);
    else if (schema.enum && !schema.enum.includes(v)) problems.push(`${key} must be one of ${schema.enum.join(', ')}`);
  }
  return problems;
}

// Drop the options a tool call left out, so the seat sees what the CLI would.
const defined = (opts) => Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined));

// run(sessionId, cmd, args, opts) plays the command for the calling session and
// resolves to the text the agent reads.
export function moyuTools(run) {
  return SPECS.map((spec) => ({
    name: spec.name,
    description: spec.description,
    parameters: { type: 'object', properties: spec.params, ...(spec.required ? { required: spec.required } : {}) },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      const problems = check(spec, args);
      if (problems.length) throw new Error(`invalid arguments: ${problems.join('; ')}`);
      const session = exec?.agent?.id;
      if (!session) throw new Error('moyu: this tool needs the calling agent session');
      const [cmd, rest, opts] = spec.command(args);
      return run(session, cmd, rest, defined(opts));
    },
  }));
}
