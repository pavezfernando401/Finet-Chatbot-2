import { createHmac } from 'node:crypto';
import {
  INestApplication,
  ServiceUnavailableException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { ChatService } from './../src/chat/chat.service.js';
import { CustomersService } from './../src/customers/customers.service.js';
import { CatalogService } from './../src/knowledge/catalog.service.js';
import {
  engineDownText,
  HANDOFF_TOOL,
  handoffText,
  ticketFiledText,
} from './../src/messages/handoff.js';
import { RUT_REQUEST } from './../src/messages/identity.texts.js';
import { AppModule } from './../src/app.module.js';

const WEBHOOK_SECRET = 'test-webhook-secret';
const API_KEY = 'test-api-key';

/** What makes the engine double hand the customer off. */
const ASK_FOR_PERSON = 'quiero hablar con una persona';

/** What makes the engine double fail. */
const BREAK_ENGINE = 'rompe el motor';

/** Same string Chatwoot signs: `${timestamp}.${rawBody}`. */
const sign = (body: string, timestamp: string) =>
  `sha256=${createHmac('sha256', WEBHOOK_SECRET)
    .update(`${timestamp}.${body}`)
    .digest('hex')}`;

const now = () => Math.floor(Date.now() / 1000).toString();

const messageCreated = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    event: 'message_created',
    id: 42,
    content: 'hola',
    message_type: 'incoming',
    content_type: 'text',
    content_attributes: {},
    source_id: '',
    private: false,
    created_at: '2020-03-03 13:05:57 UTC',
    sender: { id: 7, name: 'Ada' },
    conversation: { display_id: 12, inbox_id: 3 },
    account: { id: 1, name: 'Finet' },
    inbox: { id: 3, name: 'Web' },
    ...overrides,
  });

describe('Messages (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    process.env.CHATWOOT_WEBHOOK_SECRET = WEBHOOK_SECRET;
    process.env.API_KEY = API_KEY;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      // Stand in for the engine and the customer records, so the suite never
      // reaches the network.
      .overrideProvider(ChatService)
      .useValue({
        complete: async (history: { content: string }[]) => {
          const last = history.at(-1)?.content;
          if (last === BREAK_ENGINE) {
            throw new ServiceUnavailableException(
              'The chat engine is unavailable',
            );
          }
          return last === ASK_FOR_PERSON
            ? { type: 'tool', name: HANDOFF_TOOL, arguments: {} }
            : { type: 'text', content: 'respuesta del motor' };
        },
      })
      .overrideProvider(CustomersService)
      .useValue({
        lookup: async () => ({
          status: 'found',
          customer: { name: 'Juan Pérez', plans: [] },
        }),
        account: async () => ({ status: 'unavailable' }),
        escalate: async () => ({
          id_ticket: 123,
          codigo_seguimiento: 'FIN-2026-000123',
        }),
      })
      .overrideProvider(CatalogService)
      .useValue({ plans: async () => null })
      .compile();

    // Same wiring as main.ts, which does not run under test.
    app = moduleFixture.createNestApplication({ rawBody: true });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /messages', () => {
    it('refuses a request with no API key', () =>
      request(app.getHttpServer())
        .post('/messages')
        .send({ accountId: 1, conversationId: 12, content: 'hola' })
        .expect(401));

    it('refuses a wrong API key', () =>
      request(app.getHttpServer())
        .post('/messages')
        .set('X-Api-Key', 'nope')
        .send({ accountId: 1, conversationId: 12, content: 'hola' })
        .expect(401));

    it('asks for the RUT, then answers with the engine', async () => {
      const send = (content: string) =>
        request(app.getHttpServer())
          .post('/messages')
          .set('X-Api-Key', API_KEY)
          .send({ accountId: 1, conversationId: 12, content })
          .expect(201);

      const first = await send('hola');
      expect(first.body).toEqual({
        accountId: 1,
        conversationId: 12,
        message: {
          content: RUT_REQUEST,
          message_type: 'outgoing',
          private: false,
          content_type: 'text',
        },
      });

      const second = await send('12.345.678-5');
      expect(second.body.message.content).toBe('respuesta del motor');
    });

    it('answers 204 after handing off', async () => {
      const send = (content: string) =>
        request(app.getHttpServer())
          .post('/messages')
          .set('X-Api-Key', API_KEY)
          .send({ accountId: 1, conversationId: 13, content });

      await send('hola').expect(201);
      await send('prefiero no darlo').expect(201);
      const handedOff = await send(ASK_FOR_PERSON).expect(201);
      expect(handedOff.body.message.content).toBe(
        handoffText('+56 9 4500 2319'),
      );

      const after = await send('¿sigues ahí?').expect(204);
      expect(after.body).toEqual({});
    });

    it('rejects a body without content', () =>
      request(app.getHttpServer())
        .post('/messages')
        .set('X-Api-Key', API_KEY)
        .send({ accountId: 1, conversationId: 12 })
        .expect(400));

    it('rejects a content type Chatwoot does not know', () =>
      request(app.getHttpServer())
        .post('/messages')
        .set('X-Api-Key', API_KEY)
        .send({
          accountId: 1,
          conversationId: 12,
          content: 'hola',
          contentType: 'carrier-pigeon',
        })
        .expect(400));

    it('rejects unknown fields', () =>
      request(app.getHttpServer())
        .post('/messages')
        .set('X-Api-Key', API_KEY)
        .send({
          accountId: 1,
          conversationId: 12,
          content: 'hola',
          role: 'admin',
        })
        .expect(400));
  });

  describe('POST /web/messages', () => {
    const SESSION = '3f6c8a52-7d1e-4b9a-9c2f-5e8d1a0b7c64';

    it('refuses a request with no API key', () =>
      request(app.getHttpServer())
        .post('/web/messages')
        .send({ sessionId: SESSION, content: 'hola' })
        .expect(401));

    it('asks for the RUT, then answers with the engine', async () => {
      const send = (content: string) =>
        request(app.getHttpServer())
          .post('/web/messages')
          .set('X-Api-Key', API_KEY)
          .send({ sessionId: SESSION, content })
          .expect(201);

      expect((await send('hola')).body).toEqual({
        content: RUT_REQUEST,
        handedOff: false,
      });
      expect((await send('12.345.678-5')).body).toEqual({
        content: 'respuesta del motor',
        handedOff: false,
      });
    });

    it('hands off, then answers with no content', async () => {
      const send = (content: string) =>
        request(app.getHttpServer())
          .post('/web/messages')
          .set('X-Api-Key', API_KEY)
          .send({ sessionId: 'b1d7e0c4-2a9f-4e63-8f15-6c3a9d2e0f87', content })
          .expect(201);

      await send('hola');
      expect((await send(ASK_FOR_PERSON)).body).toEqual({
        content: handoffText('+56 9 4500 2319'),
        handedOff: true,
      });
      expect((await send('¿sigues ahí?')).body).toEqual({
        content: null,
        handedOff: true,
      });
    });

    it('files a ticket for an identified customer (CU-77)', async () => {
      const send = (content: string) =>
        request(app.getHttpServer())
          .post('/web/messages')
          .set('X-Api-Key', API_KEY)
          .send({ sessionId: 'd4f9a2b6-8c1e-4a37-9b5d-2e7f0c3a6b18', content })
          .expect(201);

      await send('hola');
      await send('12.345.678-5');
      expect((await send(ASK_FOR_PERSON)).body).toEqual({
        content: ticketFiledText('FIN-2026-000123'),
        handedOff: true,
      });
    });

    it('hands off when the engine fails (CU-65, exception 1)', async () => {
      const send = (content: string) =>
        request(app.getHttpServer())
          .post('/web/messages')
          .set('X-Api-Key', API_KEY)
          .send({ sessionId: 'c2e8f1a3-5b7d-4f90-8a1c-3d6e9b0f2a45', content })
          .expect(201);

      await send('hola');
      expect((await send(BREAK_ENGINE)).body).toEqual({
        content: engineDownText('+56 9 4500 2319'),
        handedOff: true,
      });
      expect((await send('¿hola?')).body).toEqual({
        content: null,
        handedOff: true,
      });
    });

    it('rejects a session that is not a UUID', () =>
      request(app.getHttpServer())
        .post('/web/messages')
        .set('X-Api-Key', API_KEY)
        .send({ sessionId: '1', content: 'hola' })
        .expect(400));

    it('rejects a body without content', () =>
      request(app.getHttpServer())
        .post('/web/messages')
        .set('X-Api-Key', API_KEY)
        .send({ sessionId: SESSION })
        .expect(400));
  });

  describe('POST /webhooks/chatwoot', () => {
    const post = (body: string, timestamp = now(), signature?: string) =>
      request(app.getHttpServer())
        .post('/webhooks/chatwoot')
        .set('Content-Type', 'application/json')
        .set('X-Chatwoot-Timestamp', timestamp)
        .set('X-Chatwoot-Signature', signature ?? sign(body, timestamp))
        .send(body);

    it('accepts a correctly signed delivery', () => {
      const body = messageCreated();
      return post(body).expect(200);
    });

    it('accepts an event it has nothing to do with', () => {
      const body = JSON.stringify({ event: 'conversation_typing_on' });
      return post(body).expect(200);
    });

    it('rejects a delivery with no signature', () =>
      request(app.getHttpServer())
        .post('/webhooks/chatwoot')
        .set('Content-Type', 'application/json')
        .send(messageCreated())
        .expect(401));

    it('rejects a tampered body', () => {
      const body = messageCreated();
      const timestamp = now();
      return post(
        body.replace('hola', 'adios'),
        timestamp,
        sign(body, timestamp),
      ).expect(401);
    });

    it('rejects a signature signed without the timestamp', () => {
      const body = messageCreated();
      const bare = `sha256=${createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex')}`;
      return post(body, now(), bare).expect(401);
    });

    it('rejects a replayed delivery', () => {
      const body = messageCreated();
      const stale = (Math.floor(Date.now() / 1000) - 600).toString();
      return post(body, stale).expect(401);
    });
  });
});
