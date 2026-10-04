import { describe, it, expect } from 'vitest';
import { parseCommand } from '@/lib/commands';

describe('spread commands', () => {
  it('parses new spreads with question', () => {
    expect(parseCommand('taro mfd что думает он')).toEqual({ kind: 'spread', id: 'mfd', question: 'что думает он' });
    expect(parseCommand('данет менять работу')).toEqual({ kind: 'spread', id: 'yesno', question: 'менять работу' });
    expect(parseCommand('пента кто я в этом')).toEqual({ kind: 'spread', id: 'pentagram', question: 'кто я в этом' });
    expect(parseCommand('подкова что будет')).toEqual({ kind: 'spread', id: 'horseshoe', question: 'что будет' });
  });
  it('shadow: bare = guide, with text = spread', () => {
    expect(parseCommand('тень')).toEqual({ kind: 'guide-set', id: 'shadow_walker' });
    expect(parseCommand('тень про смену работы')).toEqual({ kind: 'spread', id: 'shadow', question: 'про смену работы' });
  });
  it('spread without question opens question mode', () => {
    expect(parseCommand('taro mfd')).toEqual({ kind: 'spread', id: 'mfd', question: null });
  });
  it('legacy ask unchanged', () => {
    expect(parseCommand('taro ask вопрос')).toEqual({ kind: 'ask', question: 'вопрос', cards: 3 });
    expect(parseCommand('taro daily')).toEqual({ kind: 'daily' });
  });
});
