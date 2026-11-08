/**
 * Defaults every e2e suite needs to boot AppModule. The engine client is
 * built at startup, so these have to exist; the base URL points nowhere on
 * purpose, and suites double ChatService rather than calling it.
 */
process.env.OPENAI_BASE_URL ??= 'http://localhost:1/v1';
process.env.OPENAI_API_KEY ??= 'test';
process.env.OPENAI_MODEL ??= 'test-model';
process.env.CHATWOOT_WEBHOOK_SECRET ??= 'test-webhook-secret';
process.env.API_KEY ??= 'test-api-key';
process.env.WHATSAPP_NUMBER ??= '+56 9 4500 2319';
