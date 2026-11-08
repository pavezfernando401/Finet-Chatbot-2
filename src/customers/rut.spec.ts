import { extractRut, isValidRut } from './rut.js';

describe('isValidRut', () => {
  it.each(['123456785', '111111111', '760864285', '7654302K', '10000013K'])(
    'accepts %s',
    (rut) => expect(isValidRut(rut)).toBe(true),
  );

  it.each([
    ['a wrong check digit', '123456784'],
    ['a body too short', '1234565'],
    ['dots left in', '12.345.678-5'],
  ])('rejects %s', (_, rut) => expect(isValidRut(rut)).toBe(false));
});

describe('extractRut', () => {
  it.each([
    ['12.345.678-5', '123456785'],
    ['12345678-5', '123456785'],
    ['123456785', '123456785'],
    ['12.345.6785', '123456785'],
    ['7.654.302-k', '7654302K'],
    ['mi rut es 12.345.678-5, ¿qué plan tengo?', '123456785'],
    ['Mi RUT es 123456785', '123456785'],
    ['rut: 12345678-5.', '123456785'],
  ])('finds the RUT in "%s"', (text, rut) => {
    expect(extractRut(text)?.rut ?? null).toBe(rut);
  });

  it('returns the text as typed, so it can be blanked out', () => {
    expect(extractRut('soy 12.345.678-5 gracias')?.match).toBe('12.345.678-5');
  });

  it('ignores a RUT with a wrong check digit', () => {
    expect(extractRut('12.345.678-4')).toBeNull();
  });

  it('ignores a bare number inside a sentence, which may be a phone', () => {
    expect(extractRut('llámame al 123456785 por favor')).toBeNull();
  });

  it.each(['hola', '¿qué planes tienen?', 'no', '600 Mbps'])(
    'finds nothing in "%s"',
    (text) => expect(extractRut(text)).toBeNull(),
  );
});
