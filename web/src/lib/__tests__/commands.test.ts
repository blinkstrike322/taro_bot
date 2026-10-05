import { describe, it, expect } from 'vitest';
import { parseCommand } from '@/lib/commands';

describe('spread commands', () => {
  it('parses new spreads with question', () => {
    expect(parseCommand('taro mfd что думает он')).toEqual({ kind: 'spread', id: 'mfd', question: 'что думает он' });
    expect(parseCommand('данет менять работу')).toEqual({ kind: 'spread', id: 'yesno', question: 'менять работу' });
    expect(parseCommand('пента кто я в этом')).toEqual({ kind: 'spread', id: 'pentagram', question: 'кто я в этом' });
    expect(parseCommand('подкова что будет')).toEqual({ kind: 'spread', id: 'horseshoe', question: 'что будет' });
  });
  it('shadow: bare/prefixed = spread (клик каталога без темы обязан стартовать расклад)', () => {
    expect(parseCommand('тень')).toEqual({ kind: 'spread', id: 'shadow', question: null });
    expect(parseCommand('taro shadow')).toEqual({ kind: 'spread', id: 'shadow', question: null });
    expect(parseCommand('taro shadow-work')).toEqual({ kind: 'spread', id: 'shadow', question: null });
    expect(parseCommand('тень про смену работы')).toEqual({ kind: 'spread', id: 'shadow', question: 'про смену работы' });
  });
  it('guide switches: свои слова, полные id и явный синтаксис', () => {
    expect(parseCommand('странница')).toEqual({ kind: 'guide-set', id: 'shadow_walker' });
    expect(parseCommand('теней')).toEqual({ kind: 'guide-set', id: 'shadow_walker' });
    expect(parseCommand('taro guide shadow_walker')).toEqual({ kind: 'guide-set', id: 'shadow_walker' });
    expect(parseCommand('taro guide ruin_keeper')).toEqual({ kind: 'guide-set', id: 'ruin_keeper' });
    expect(parseCommand('руины')).toEqual({ kind: 'guide-set', id: 'ruin_keeper' });
    expect(parseCommand('искра')).toEqual({ kind: 'guide-set', id: 'spark_of_chaos' });
  });
  it('spread without question opens question mode', () => {
    expect(parseCommand('taro mfd')).toEqual({ kind: 'spread', id: 'mfd', question: null });
  });
  it('legacy ask unchanged', () => {
    expect(parseCommand('taro ask вопрос')).toEqual({ kind: 'ask', question: 'вопрос', cards: 3 });
    expect(parseCommand('taro daily')).toEqual({ kind: 'daily' });
  });
  it('latin catalog ids resolve as commands (help/каталог их рекламируют)', () => {
    expect(parseCommand('taro pentagram кто я в этой ситуации?')).toEqual({
      kind: 'spread', id: 'pentagram', question: 'кто я в этой ситуации?',
    });
    expect(parseCommand('taro horseshoe переезд в другой город')).toEqual({
      kind: 'spread', id: 'horseshoe', question: 'переезд в другой город',
    });
    expect(parseCommand('taro single суть ответа')).toEqual({
      kind: 'spread', id: 'single', question: 'суть ответа',
    });
    expect(parseCommand('taro three вопрос')).toEqual({
      kind: 'spread', id: 'three', question: 'вопрос',
    });
    expect(parseCommand('taro pentagram')).toEqual({ kind: 'spread', id: 'pentagram', question: null });
  });
  it('latin ids do not hijack legacy cases', () => {
    expect(parseCommand('taro ask1 вопрос')).toEqual({ kind: 'ask', question: 'вопрос', cards: 1 });
    expect(parseCommand('taro день')).toEqual({ kind: 'daily' });
  });
});
