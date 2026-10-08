import { describe, it, expect } from 'vitest';
import { parseCommand } from '../commands';

// снапшот: parseCommand возвращает Cmd-юнион; алиасы сверены
// с src/lib/commands.ts (spread-алиасы берутся из SPREADS).

describe('parseCommand — алиасы ARCANUM shell', () => {
  it('taro pentagram → spread pentagram', () => {
    expect(parseCommand('taro pentagram')).toMatchObject({ kind: 'spread', id: 'pentagram' });
  });
  it('колода → library', () => {
    expect(parseCommand('колода')).toMatchObject({ kind: 'library' });
  });
  it('cards → library', () => {
    expect(parseCommand('cards')).toMatchObject({ kind: 'library' });
  });
  it('man taro → help (бонус-фикс 3-c)', () => {
    expect(parseCommand('man taro')).toMatchObject({ kind: 'help' });
  });
  it('taro месяц → month', () => {
    expect(parseCommand('taro месяц')).toMatchObject({ kind: 'month' });
  });
  it('taro луна → moon', () => {
    expect(parseCommand('taro луна')).toMatchObject({ kind: 'moon' });
  });
  it('taro arcana 25.03.1990 → arcana с датой, не вопрос', () => {
    expect(parseCommand('taro arcana 25.03.1990')).toMatchObject({
      kind: 'arcana',
      dateArg: '25.03.1990',
      fresh: false,
    });
  });
});
