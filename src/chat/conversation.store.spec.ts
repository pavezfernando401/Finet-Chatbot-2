import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import {
  Conversation,
  ConversationStore,
  IDLE_LIMIT_MS,
} from './conversation.store.js';

const withTurns = (...contents: string[]): Conversation => ({
  turns: contents.map((content): ChatCompletionMessageParam => ({
    role: 'user',
    content,
  })),
  identity: { status: 'anonymous' },
  handedOff: false,
});

describe('ConversationStore', () => {
  let store: ConversationStore;

  beforeEach(() => {
    store = new ConversationStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keys by channel so two ways in cannot mix', () => {
    expect(ConversationStore.key('chatwoot', 1, 12)).not.toBe(
      ConversationStore.key('api', 1, 12),
    );
    expect(ConversationStore.key('chatwoot', 1, 12)).toBe('chatwoot:1:12');
  });

  it('hands out a new conversation for an unknown key', () => {
    expect(store.get('web:x')).toEqual({
      turns: [],
      identity: { status: 'new' },
      handedOff: false,
    });
  });

  it('gives back what was saved', () => {
    store.save('web:x', withTurns('hola'));

    expect(store.get('web:x')).toEqual(withTurns('hola'));
  });

  it('keeps only the last turns of a conversation', () => {
    const contents = Array.from({ length: 30 }, (_, i) => `m${i}`);
    store.save('api:1:1', withTurns(...contents));

    const { turns } = store.get('api:1:1');
    expect(turns).toHaveLength(20);
    expect(turns[0]).toEqual({ role: 'user', content: 'm10' });
  });

  it('starts over after 48 hours without activity', () => {
    vi.useFakeTimers();
    store.save('web:x', withTurns('hola'));

    vi.advanceTimersByTime(IDLE_LIMIT_MS - 1_000);
    expect(store.get('web:x').turns).toHaveLength(1);

    vi.advanceTimersByTime(2_000);
    expect(store.get('web:x')).toEqual({
      turns: [],
      identity: { status: 'new' },
      handedOff: false,
    });
  });

  it('counts each save as activity', () => {
    vi.useFakeTimers();
    store.save('web:x', withTurns('hola'));

    vi.advanceTimersByTime(IDLE_LIMIT_MS - 1_000);
    store.save('web:x', withTurns('hola', 'sigo aquí'));
    vi.advanceTimersByTime(IDLE_LIMIT_MS - 1_000);

    expect(store.get('web:x').turns).toHaveLength(2);
  });

  it('drops the least recently written conversation once full', () => {
    for (let i = 0; i < 1_001; i++) {
      store.save(ConversationStore.key('api', 1, i), withTurns('x'));
    }

    expect(store.size).toBe(1_000);
    expect(store.get(ConversationStore.key('api', 1, 0)).turns).toEqual([]);
    expect(
      store.get(ConversationStore.key('api', 1, 1_000)).turns,
    ).toHaveLength(1);
  });

  it('counts a write as recent use', () => {
    const first = ConversationStore.key('api', 1, 0);
    store.save(first, withTurns('x'));

    for (let i = 1; i < 1_000; i++) {
      store.save(ConversationStore.key('api', 1, i), withTurns('x'));
    }
    store.save(first, withTurns('x', 'y'));
    store.save(ConversationStore.key('api', 1, 1_000), withTurns('x'));

    // The touched conversation survived; the one after it went instead.
    expect(store.get(first).turns).toHaveLength(2);
    expect(store.get(ConversationStore.key('api', 1, 1)).turns).toEqual([]);
  });
});
