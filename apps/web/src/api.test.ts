import { describe, it, expect } from 'vitest';
import { setToken, getToken } from './api';

describe('web api client', () => {
  it('stores auth token in memory only', () => {
    setToken('abc');
    expect(getToken()).toBe('abc');
    setToken(null);
    expect(getToken()).toBeNull();
  });
});
