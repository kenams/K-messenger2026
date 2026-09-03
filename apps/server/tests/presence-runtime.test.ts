import { describe, expect, it } from 'vitest';
import { PresenceRuntime, visiblePresence } from '../src/presenceRuntime.js';

describe('PresenceRuntime', () => {
  it('only marks the user offline after the last socket disconnects', () => {
    const runtime = new PresenceRuntime();

    expect(runtime.connect('alice', 'socket-1')).toEqual({ firstSocket: true });
    expect(runtime.connect('alice', 'socket-2')).toEqual({ firstSocket: false });
    expect(runtime.hasConnections('alice')).toBe(true);

    expect(runtime.disconnect('alice', 'socket-1')).toEqual({ lastSocket: false });
    expect(runtime.hasConnections('alice')).toBe(true);

    expect(runtime.disconnect('alice', 'socket-2')).toEqual({ lastSocket: true });
    expect(runtime.hasConnections('alice')).toBe(false);
  });

  it('debounces repeated login events', () => {
    const runtime = new PresenceRuntime();

    expect(runtime.shouldEmitLoginEvent('alice', 100_000)).toBe(true);
    expect(runtime.shouldEmitLoginEvent('alice', 110_000)).toBe(false);
    expect(runtime.shouldEmitLoginEvent('alice', 130_001)).toBe(true);
  });

  it('never exposes invisible presence to contacts', () => {
    expect(visiblePresence('invisible')).toBe('offline');
    expect(visiblePresence('busy')).toBe('busy');
  });
});
