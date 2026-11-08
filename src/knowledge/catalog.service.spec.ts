import { ConfigService } from '@nestjs/config';
import { CatalogService } from './catalog.service.js';

const config = (settings: Record<string, string>) =>
  ({ get: (key: string) => settings[key] }) as unknown as ConfigService;

const configured = () =>
  new CatalogService(config({ CLIENTES_API_URL: 'http://clientes.test/api/' }));

const respond = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  }) as Response;

const fibra600 = {
  id_plan: 1,
  nombre_comercial: ' Fibra 600 ',
  tipo_plan: 'internet',
  tipo_cliente: 'residencial',
  velocidad_mbps: 600,
  precio_mensual: 19990,
  descripcion: '',
};

describe('CatalogService', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(respond(200, [fibra600]));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('reads the public catalog and maps each plan', async () => {
    await expect(configured().plans()).resolves.toEqual([
      {
        name: 'Fibra 600',
        type: 'internet',
        segment: 'residencial',
        speedMbps: 600,
        monthlyPrice: 19990,
        description: null,
      },
    ]);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('http://clientes.test/api/landing/planes');
  });

  it('leaves out a plan without a name or a price', async () => {
    fetchMock.mockResolvedValue(
      respond(200, [
        fibra600,
        { ...fibra600, nombre_comercial: '' },
        { ...fibra600, precio_mensual: '19990' },
      ]),
    );

    expect(await configured().plans()).toHaveLength(1);
  });

  it('keeps the catalog for ten minutes', async () => {
    vi.useFakeTimers();
    const catalog = configured();

    await catalog.plans();
    vi.advanceTimersByTime(9 * 60_000);
    await catalog.plans();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2 * 60_000);
    await catalog.plans();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shares one request between callers arriving together', async () => {
    const catalog = configured();

    await Promise.all([catalog.plans(), catalog.plans()]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps quoting the last catalog for a day if finet-clientes fails', async () => {
    vi.useFakeTimers();
    const catalog = configured();
    await catalog.plans();
    fetchMock.mockResolvedValue(respond(503, {}));

    vi.advanceTimersByTime(60 * 60_000);
    expect(await catalog.plans()).toHaveLength(1);

    vi.advanceTimersByTime(24 * 60 * 60_000);
    expect(await catalog.plans()).toBeNull();
  });

  it.each([
    ['answers with an error', () => respond(500, {})],
    ['sends something that is not a list', () => respond(200, { planes: [] })],
  ])('has no catalog when finet-clientes %s', async (_, response) => {
    fetchMock.mockResolvedValue(response());

    expect(await configured().plans()).toBeNull();
  });

  it('has no catalog when finet-clientes is unreachable', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    expect(await configured().plans()).toBeNull();
  });

  it('has no catalog without CLIENTES_API_URL, and asks nobody', async () => {
    expect(await new CatalogService(config({})).plans()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
