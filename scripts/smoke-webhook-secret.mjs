import assert from 'node:assert/strict';
import handler from '../api/email/supabase-event.js';

function createResponseCollector() {
  return {
    statusCode: null,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

async function run() {
  const previousSecret = process.env.SUPABASE_WEBHOOK_SECRET;

  try {
    delete process.env.SUPABASE_WEBHOOK_SECRET;

    const missingSecretRes = createResponseCollector();
    await handler({ method: 'POST', headers: {}, body: {} }, missingSecretRes);
    assert.equal(missingSecretRes.statusCode, 500);
    assert.equal(missingSecretRes.payload?.error, 'Webhook secret is not configured.');

    process.env.SUPABASE_WEBHOOK_SECRET = 'expected-secret';

    const invalidSecretRes = createResponseCollector();
    await handler({ method: 'POST', headers: {}, body: {} }, invalidSecretRes);
    assert.equal(invalidSecretRes.statusCode, 401);
    assert.equal(invalidSecretRes.payload?.error, 'Invalid webhook secret.');

    const invalidBearerRes = createResponseCollector();
    await handler({ method: 'POST', headers: { authorization: 'Bearer wrong-secret' }, body: {} }, invalidBearerRes);
    assert.equal(invalidBearerRes.statusCode, 401);
    assert.equal(invalidBearerRes.payload?.error, 'Invalid webhook secret.');

    console.log('Webhook secret smoke check passed.');
  } finally {
    if (previousSecret === undefined) {
      delete process.env.SUPABASE_WEBHOOK_SECRET;
    } else {
      process.env.SUPABASE_WEBHOOK_SECRET = previousSecret;
    }
  }
}

run().catch((error) => {
  console.error('Webhook secret smoke check failed:', error);
  process.exit(1);
});
