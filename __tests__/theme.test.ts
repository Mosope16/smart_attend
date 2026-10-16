jest.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
    select: jest.fn((dict) => dict.ios ?? dict.default),
  },
}));

import { Colors, Spacing, MaxContentWidth, Fonts, BottomTabInset } from '../src/constants/theme';

describe('theme.ts unit tests', () => {
  it('defines light and dark colors correctly', () => {
    expect(Colors.light.background).toBe('#ffffff');
    expect(Colors.dark.background).toBe('#000000');
    expect(Colors.light.text).toBe('#000000');
    expect(Colors.dark.text).toBe('#ffffff');
  });

  it('defines spacing scale constants', () => {
    expect(Spacing.half).toBe(2);
    expect(Spacing.one).toBe(4);
    expect(Spacing.two).toBe(8);
    expect(Spacing.three).toBe(16);
    expect(Spacing.four).toBe(24);
    expect(Spacing.five).toBe(32);
    expect(Spacing.six).toBe(64);
  });

  it('defines layout metrics', () => {
    expect(MaxContentWidth).toBe(800);
    expect(typeof BottomTabInset).toBe('number');
  });

  it('provides font families', () => {
    expect(Fonts).toBeDefined();
    expect(Fonts?.sans).toBeDefined();
  });
});
