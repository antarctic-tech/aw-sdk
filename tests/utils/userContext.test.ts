import { describe, it, expect } from 'vitest';
import { userContextFromIdToken } from '../../src/utils/userContext';

function jwtWith(payload: unknown): string {
  const encode = (value: unknown) => {
    const json = typeof value === 'string' ? value : JSON.stringify(value);
    return btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  };
  return `${encode({ alg: 'none' })}.${encode(payload)}.sig`;
}

describe('userContextFromIdToken', () => {
  it('достаёт displayName из sub и avatarUrl из userImage', () => {
    const idToken = jwtWith({
      sub: 'a1b2c3d4e5f60718',
      userImage: 'https://t.me/i/userpic/320/abc.jpg',
    });

    expect(userContextFromIdToken(idToken)).toEqual({
      displayName: 'a1b2c3d4e5f60718',
      avatarUrl: 'https://t.me/i/userpic/320/abc.jpg',
    });
  });

  it('не требует userImage', () => {
    expect(userContextFromIdToken(jwtWith({ sub: 'a1b2c3d4e5f60718' }))).toEqual({
      displayName: 'a1b2c3d4e5f60718',
    });
  });

  it('возвращает {} без id_token', () => {
    expect(userContextFromIdToken()).toEqual({});
    expect(userContextFromIdToken(null)).toEqual({});
    expect(userContextFromIdToken('')).toEqual({});
  });

  it('игнорирует битый токен', () => {
    expect(userContextFromIdToken('not-a-jwt')).toEqual({});
    expect(userContextFromIdToken(jwtWith('not-json'))).toEqual({});
  });

  it('игнорирует нестроковые и пустые claims', () => {
    expect(userContextFromIdToken(jwtWith({ sub: 123, userImage: { url: 'x' } }))).toEqual({});
  });

  it('принимает только https для userImage', () => {
    expect(userContextFromIdToken(jwtWith({ userImage: 'http://t.me/i/userpic/320/abc.jpg' }))).toEqual({});
    expect(userContextFromIdToken(jwtWith({ userImage: 'javascript:alert(1)' }))).toEqual({});
    expect(userContextFromIdToken(jwtWith({ userImage: 'data:image/png;base64,aaa' }))).toEqual({});
    expect(userContextFromIdToken(jwtWith({ userImage: '/relative.png' }))).toEqual({});
  });
});
