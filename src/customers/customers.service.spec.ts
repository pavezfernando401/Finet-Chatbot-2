import { ConfigService } from "@nestjs/config";
import { CustomersService } from "./customers.service.js";

const config = (settings: Record<string, string>) =>
  ({ get: (key: string) => settings[key] }) as unknown as ConfigService;

const configured = () =>
  new CustomersService(
    config({
      CLIENTES_API_URL: "http://clientes.test/api/",
      CLIENTES_API_KEY: "clave",
    }),
  );

const respond = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  }) as Response;

describe("CustomersService", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the RUT with the API key and maps the customer", async () => {
    fetchMock.mockResolvedValue(
      respond(200, {
        encontrado: true,
        cliente: {
          nombre_completo: "Juan Pérez",
          planes: [
            {
              nombre_comercial: "Fibra 600",
              tipo_plan: "fibra",
              velocidad_mbps: 600,
              estado_contrato: "activo",
            },
          ],
        },
      }),
    );

    const lookup = await configured().lookup("123456785");

    expect(lookup).toEqual({
      status: "found",
      customer: {
        name: "Juan Pérez",
        plans: [
          {
            name: "Fibra 600",
            type: "fibra",
            speedMbps: 600,
            contractStatus: "activo",
          },
        ],
      },
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://clientes.test/api/asistente/clientes/identificar");
    expect(init.headers).toMatchObject({ "X-Api-Key": "clave" });
    expect(JSON.parse(init.body as string)).toEqual({ rut: "123456785" });
  });

  it("says which company the customer belongs to", async () => {
    fetchMock.mockResolvedValue(
      respond(200, {
        encontrado: true,
        cliente: { nombre_completo: "Ana", id_empresa: 2, planes: null },
      }),
    );

    const lookup = await configured().lookup("123456785");

    expect(lookup).toMatchObject({ customer: { companyId: 2 } });
  });

  it("sends the portal session when there is one", async () => {
    fetchMock.mockResolvedValue(
      respond(200, { encontrado: false, cliente: null }),
    );

    await configured().lookup("123456785", "token");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      rut: "123456785",
      access_token: "token",
    });
  });

  it("keeps plans as null when finet-clientes withholds them", async () => {
    fetchMock.mockResolvedValue(
      respond(200, {
        encontrado: true,
        cliente: { nombre_completo: "Juan Pérez", planes: null },
      }),
    );

    await expect(configured().lookup("123456785")).resolves.toEqual({
      status: "found",
      customer: { name: "Juan Pérez", plans: null },
    });
  });

  it("reports a RUT that is not on record", async () => {
    fetchMock.mockResolvedValue(
      respond(200, { encontrado: false, cliente: null }),
    );

    await expect(configured().lookup("123456785")).resolves.toEqual({
      status: "not_found",
    });
  });

  it("reports unavailable when finet-clientes fails", async () => {
    fetchMock.mockResolvedValue(respond(500, {}));

    await expect(configured().lookup("123456785")).resolves.toEqual({
      status: "unavailable",
    });
  });

  it("reports unavailable when finet-clientes cannot be reached", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    await expect(configured().lookup("123456785")).resolves.toEqual({
      status: "unavailable",
    });
  });

  it("reports unavailable without calling out when not configured", async () => {
    const service = new CustomersService(config({}));

    await expect(service.lookup("123456785")).resolves.toEqual({
      status: "unavailable",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe("CU-64: account", () => {
    const debt = (overrides: Record<string, unknown> = {}) => ({
      encontrado: true,
      cliente: { nombre_completo: "Juan Pérez", rut: "123456785" },
      tiene_deuda: true,
      saldo_total: 45990,
      facturas: [
        {
          id_factura: 1,
          periodo: "Agosto 2026",
          monto: 22995,
          fecha_limite_pago: "2026-09-20",
          estado: "vencida",
          dias_vencida: 12,
          dias_para_vencer: null,
        },
      ],
      planes: [],
      detalle_disponible: true,
      informacion_completa: true,
      ...overrides,
    });

    it("reads the public debt lookup with the API key and maps it", async () => {
      fetchMock.mockResolvedValue(respond(200, debt()));

      await expect(configured().account("12345678K")).resolves.toEqual({
        status: "found",
        account: {
          balance: 45990,
          invoices: [
            {
              period: "Agosto 2026",
              amount: 22995,
              dueDate: "2026-09-20",
              status: "vencida",
              daysOverdue: 12,
              daysToDue: null,
            },
          ],
          complete: true,
        },
      });
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(
        "http://clientes.test/api/deuda-publica/rut?rut=12345678K",
      );
      expect(init.headers).toMatchObject({ "X-Api-Key": "clave" });
    });

    it("keeps the name and RUT out of what it returns", async () => {
      fetchMock.mockResolvedValue(respond(200, debt()));

      const sent = JSON.stringify(await configured().account("123456785"));
      expect(sent).not.toContain("Juan");
      expect(sent).not.toContain("123456785");
    });

    it("flags incomplete invoice data (CU-41, exception 2)", async () => {
      fetchMock.mockResolvedValue(
        respond(200, debt({ informacion_completa: false })),
      );

      const lookup = await configured().account("123456785");
      expect(lookup.status === "found" && lookup.account.complete).toBe(false);
    });

    it("reports a RUT with no records", async () => {
      fetchMock.mockResolvedValue(respond(200, { encontrado: false }));

      await expect(configured().account("123456785")).resolves.toEqual({
        status: "not_found",
      });
    });

    it.each([
      [
        "the invoices could not be read",
        respond(200, debt({ detalle_disponible: false })),
      ],
      [
        "the balance is missing",
        respond(200, debt({ saldo_total: undefined })),
      ],
      ["finet-clientes rate-limits the bot", respond(429, {})],
    ])("reports unavailable when %s", async (_, response) => {
      fetchMock.mockResolvedValue(response);

      await expect(configured().account("123456785")).resolves.toEqual({
        status: "unavailable",
      });
    });

    it("reports unavailable without calling out when not configured", async () => {
      const service = new CustomersService(config({}));

      await expect(service.account("123456785")).resolves.toEqual({
        status: "unavailable",
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
  describe("CU-66: support categories", () => {
    it("reads the categories with the API key", async () => {
      fetchMock.mockResolvedValue(
        respond(200, [
          { id_categoria: 2, nombre: "Falla de Internet" },
          { id_categoria: "x", nombre: "Rota" },
        ]),
      );

      await expect(configured().supportCategories()).resolves.toEqual([
        { id_categoria: 2, nombre: "Falla de Internet" },
      ]);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(
        "http://clientes.test/api/asistente/clientes/soporte/categorias",
      );
      expect(init.headers).toMatchObject({ "X-API-Key": "clave" });
    });

    it.each([
      ["answers with an error", () => respond(503, {})],
      ["has no categories", () => respond(200, [])],
      ["answers something else", () => respond(200, { categorias: [] })],
    ])("returns null when finet-clientes %s", async (_, response) => {
      fetchMock.mockResolvedValue(response());

      await expect(configured().supportCategories()).resolves.toBeNull();
    });

    it("stops with the turn deadline", async () => {
      fetchMock.mockImplementation(
        (_url: string, init: RequestInit) =>
          new Promise((_, reject) =>
            init.signal?.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            ),
          ),
      );
      const deadline = new AbortController();

      const pending = configured().supportCategories(deadline.signal);
      deadline.abort();
      await expect(pending).resolves.toBeNull();
    });
  });

  describe("CU-66: createSupport", () => {
    const request = {
      rut: "123456785",
      sessionId: "web:3f6c8a52-7d1e-4b9a-9c2f-5e8d1a0b7c64",
      categoryId: 2,
      description: "Sin internet desde ayer.",
      accessToken: "portal.jwt.token",
    };

    it("posts the request with the portal session and returns the ticket", async () => {
      fetchMock.mockResolvedValue(
        respond(201, { id_ticket: 124, codigo_seguimiento: "FIN-2026-000124" }),
      );

      await expect(configured().createSupport(request)).resolves.toEqual({
        status: "created",
        ticket: { id_ticket: 124, codigo_seguimiento: "FIN-2026-000124" },
      });
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("http://clientes.test/api/asistente/clientes/soporte");
      expect(init.method).toBe("POST");
      expect(init.headers).toMatchObject({ "X-API-Key": "clave" });
      expect(JSON.parse(init.body as string)).toEqual({
        rut: "123456785",
        id_sesion: "web:3f6c8a52-7d1e-4b9a-9c2f-5e8d1a0b7c64",
        id_categoria: 2,
        descripcion: "Sin internet desde ayer.",
        access_token: "portal.jwt.token",
      });
    });

    it("tells a rejected portal session apart", async () => {
      fetchMock.mockResolvedValue(respond(401, {}));

      await expect(configured().createSupport(request)).resolves.toEqual({
        status: "unauthorized",
      });
    });

    it.each([
      ["answers with an error", () => respond(503, {})],
      ["rejects the request", () => respond(400, {})],
      ["answers without a ticket", () => respond(201, { id_ticket: 1 })],
    ])("reports unavailable when finet-clientes %s", async (_, response) => {
      fetchMock.mockResolvedValue(response());

      await expect(configured().createSupport(request)).resolves.toEqual({
        status: "unavailable",
      });
    });

    it("reports unavailable without calling anyone when it is not configured", async () => {
      const service = new CustomersService(config({}));

      await expect(service.createSupport(request)).resolves.toEqual({
        status: "unavailable",
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("CU-77: escalate", () => {
    const escalation = {
      rut: "123456785",
      sessionId: "web:3f6c8a52-7d1e-4b9a-9c2f-5e8d1a0b7c64",
      channel: "web",
      history: [
        { role: "user" as const, content: "quiero dar de baja mi plan" },
        { role: "assistant" as const, content: "Puedo derivarte." },
      ],
      reason: "Quiere dar de baja su plan",
    };

    it("posts the conversation with the API key and returns the ticket", async () => {
      fetchMock.mockResolvedValue(
        respond(201, { id_ticket: 123, codigo_seguimiento: "FIN-2026-000123" }),
      );

      await expect(configured().escalate(escalation)).resolves.toEqual({
        id_ticket: 123,
        codigo_seguimiento: "FIN-2026-000123",
      });
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(
        "http://clientes.test/api/asistente/clientes/escalamientos",
      );
      expect(init.method).toBe("POST");
      expect(init.headers).toMatchObject({ "X-API-Key": "clave" });
      expect(JSON.parse(init.body as string)).toEqual({
        rut: "123456785",
        id_sesion: "web:3f6c8a52-7d1e-4b9a-9c2f-5e8d1a0b7c64",
        plataforma: "web",
        motivo: "Quiere dar de baja su plan",
        historial: [
          { rol: "user", contenido: "quiero dar de baja mi plan" },
          { rol: "assistant", contenido: "Puedo derivarte." },
        ],
      });
    });

    it("leaves the reason out when there is none", async () => {
      fetchMock.mockResolvedValue(
        respond(201, { id_ticket: 1, codigo_seguimiento: "FIN-2026-000001" }),
      );

      await configured().escalate({ ...escalation, reason: undefined });

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(init.body as string)).not.toHaveProperty("motivo");
    });

    it.each([
      ["answers with an error", () => respond(503, {})],
      ["answers without a ticket", () => respond(201, { id_ticket: 1 })],
    ])("returns null when finet-clientes %s", async (_, response) => {
      fetchMock.mockResolvedValue(response());

      await expect(configured().escalate(escalation)).resolves.toBeNull();
    });

    it("returns null when finet-clientes cannot be reached", async () => {
      fetchMock.mockRejectedValue(new TypeError("fetch failed"));

      await expect(configured().escalate(escalation)).resolves.toBeNull();
    });

    it("returns null without calling anyone when it is not configured", async () => {
      const service = new CustomersService(config({}));

      await expect(service.escalate(escalation)).resolves.toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
