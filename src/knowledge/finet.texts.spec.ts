import type { CatalogPlan } from './catalog.service.js';
import { finetContext } from './finet.texts.js';

const plan = (overrides: Partial<CatalogPlan> = {}): CatalogPlan => ({
  name: 'Fibra 600',
  type: 'internet',
  segment: 'residencial',
  speedMbps: 600,
  monthlyPrice: 19990,
  description: null,
  ...overrides,
});

const context = (plans: CatalogPlan[] | null) =>
  finetContext({
    plans,
    site: 'https://finet.cl',
    whatsapp: '+56 9 4500 2319',
  });

describe('finetContext', () => {
  it('lists each plan with its speed and its price in pesos', () => {
    expect(context([plan()])).toContain(
      '- Fibra 600 (internet, residencial): 600 Mbps, $19.990 al mes.',
    );
  });

  it('adds the description and leaves out what a plan does not have', () => {
    expect(
      context([
        plan({
          name: 'TV Básica',
          type: '',
          segment: '',
          speedMbps: null,
          monthlyPrice: 9990,
          description: 'Más de 80 canales.',
        }),
      ]),
    ).toContain('- TV Básica: $9.990 al mes. Más de 80 canales.');
  });

  it('forbids quoting plans when there is no catalog', () => {
    for (const plans of [null, []]) {
      const text = context(plans);
      expect(text).toContain('Ahora no tienes el catálogo de planes');
      expect(text).toContain('https://finet.cl/planes');
      expect(text).not.toContain('Catálogo de planes vigente');
    }
  });

  it('sends exact addresses to the coverage map instead of confirming them', () => {
    const text = context([plan()]);
    expect(text).toContain(
      'No puedes confirmar si llega a una dirección exacta',
    );
    expect(text).toContain('https://finet.cl/cobertura');
  });

  it('names the four communes with coverage, and no others', () => {
    const text = context(null);
    expect(text).toContain(
      'Cobertura: La Pintana, La Granja, La Florida y Puente Alto',
    );
    expect(text).not.toMatch(/El Bosque|San Ram[oó]n/);
  });

  it('gives the WhatsApp number', () => {
    expect(context(null)).toContain('+56 9 4500 2319');
  });
});
