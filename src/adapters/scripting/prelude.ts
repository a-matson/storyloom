/**
 * JS source evaluated in the sandbox before the library and the hook script.
 * Everything the AI Dungeon script API offers is plain JS here: no host
 * functions, so the VM never calls back into the worker mid-run.
 *
 * `__in` is injected as a global before this runs; `__out` serialises the
 * result back out.
 */
export const PRELUDE = `
var __logs = [];
var text = __in.text, history = __in.history, storyCards = __in.storyCards, state = __in.state, info = __in.info;
var sections = __in.sections;
var worldInfo = storyCards;

function __str(v) {
  if (typeof v === 'string') return v;
  try {
    var s = JSON.stringify(v);
    return s === undefined ? String(v) : s;
  } catch (e) {
    return String(v);
  }
}
function log() {
  __logs.push(Array.prototype.map.call(arguments, __str).join(' '));
}
var console = { log: log, info: log, warn: log, error: log, debug: log };
var sandboxConsole = console;

function __cardId() {
  return 'script-' + Math.random().toString(36).slice(2, 10);
}
function addStoryCard(keys, entry, type) {
  var k = String(keys == null ? '' : keys);
  for (var i = 0; i < storyCards.length; i++) if (storyCards[i].keys === k) return false;
  storyCards.push({ id: __cardId(), keys: k, entry: String(entry == null ? '' : entry), type: String(type == null ? 'class' : type) });
  return storyCards.length - 1;
}
function updateStoryCard(index, keys, entry, type) {
  var card = storyCards[index];
  if (!card) throw new Error('updateStoryCard: no card at index ' + index);
  card.keys = String(keys == null ? '' : keys);
  card.entry = String(entry == null ? '' : entry);
  if (type != null) card.type = String(type);
}
function removeStoryCard(index) {
  if (!storyCards[index]) throw new Error('removeStoryCard: no card at index ' + index);
  storyCards.splice(index, 1);
}
var addWorldEntry = addStoryCard, updateWorldEntry = updateStoryCard, removeWorldEntry = removeStoryCard;

// JSON.stringify drops functions silently; scripts that stash one in state
// would lose it without noticing, so refuse instead. Depth caps cycles.
function __check(v, path, depth) {
  var t = typeof v;
  if (t === 'function' || t === 'symbol' || t === 'bigint') throw new Error('state is not JSON: ' + path);
  if (!v || t !== 'object') return;
  if (depth > 64) throw new Error('state is nested too deeply: ' + path);
  if (Array.isArray(v)) {
    for (var i = 0; i < v.length; i++) __check(v[i], path + '[' + i + ']', depth + 1);
    return;
  }
  for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k)) __check(v[k], path + '.' + k, depth + 1);
}

function __out(result) {
  __check(state, 'state', 0);
  __check(storyCards, 'storyCards', 0);
  __check(result, 'result', 0);
  __check(sections, 'sections', 0);
  return JSON.stringify({
    result: result === undefined ? null : result,
    state: state,
    storyCards: storyCards,
    sections: sections === undefined ? null : sections,
    logs: __logs
  });
}
`;
