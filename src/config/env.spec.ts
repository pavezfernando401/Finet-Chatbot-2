import { ConfigService } from '@nestjs/config';
import { numberSetting, optionalSetting, requireSetting } from './env.js';

const config = (values: Record<string, string>) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

describe('env settings', () => {
  describe('requireSetting', () => {
    it('returns a trimmed value', () => {
      expect(requireSetting(config({ A: '  x  ' }), 'A')).toBe('x');
    });

    it('rejects a blank value the same as a missing one', () => {
      expect(() => requireSetting(config({ A: '' }), 'A')).toThrow(
        /A is not set/,
      );
      expect(() => requireSetting(config({ A: '   ' }), 'A')).toThrow(
        /A is not set/,
      );
      expect(() => requireSetting(config({}), 'A')).toThrow(/A is not set/);
    });
  });

  describe('optionalSetting', () => {
    it('treats blank as absent so it does not override a default', () => {
      expect(optionalSetting(config({ A: '' }), 'A')).toBeUndefined();
      expect(optionalSetting(config({ A: '  ' }), 'A')).toBeUndefined();
      expect(optionalSetting(config({ A: 'x' }), 'A')).toBe('x');
    });
  });

  describe('numberSetting', () => {
    it('falls back when unset or blank', () => {
      expect(numberSetting(config({}), 'A', 7)).toBe(7);
      expect(numberSetting(config({ A: '' }), 'A', 7)).toBe(7);
    });

    it('parses a number, zero included', () => {
      expect(numberSetting(config({ A: '0' }), 'A', 7)).toBe(0);
      expect(numberSetting(config({ A: '1.5' }), 'A', 7)).toBe(1.5);
    });

    it('refuses something that is not a number', () => {
      expect(() => numberSetting(config({ A: 'pronto' }), 'A', 7)).toThrow(
        /must be a number/,
      );
    });
  });
});
