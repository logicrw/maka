import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  deriveConnectionSlug,
  validateConnectionBaseUrl,
  validateSlug,
} from '../llm-connections.js';
import {
  GENERATED_MODELS_DEV_METADATA,
  GENERATED_MODELS_DEV_ZERO_COST_MODEL_IDS,
} from '../model-metadata.generated.js';
import {
  CATALOG_PROVIDER_TYPES,
  OPENCODE_FREE_DEFAULT_ENABLED_MODELS,
  PROVIDER_REGISTRY,
} from '../provider-registry.js';

describe('provider connection slug derivation contract', () => {
  it('continues through dense collisions until it finds an unused slug', () => {
    const base = deriveConnectionSlug('openai');
    const existing = [base, ...Array.from({ length: 98 }, (_, index) => `${base}-${index + 2}`)];
    const derived = deriveConnectionSlug('openai', existing);

    assert.equal(derived, 'openai-100');
    assert.ok(!existing.includes(derived));
    assert.equal(validateSlug(derived), null);
  });
});

describe('provider catalog contract — structural invariants over CATALOG_PROVIDER_TYPES', () => {
  it('exposes an endpoint source that passes the production baseUrl gate', () => {
    for (const type of CATALOG_PROVIDER_TYPES) {
      const def = PROVIDER_REGISTRY[type];
      if (def.baseUrl.trim() !== '') {
        assert.equal(
          validateConnectionBaseUrl(def.baseUrl),
          null,
          `${type} baseUrl ${def.baseUrl} must pass validateConnectionBaseUrl`,
        );
        continue;
      }
      if (def.baseUrlTemplate !== undefined) {
        const resolved = def.baseUrlTemplate.replace(/\$\{[^}]+\}/g, 'placeholder');
        assert.ok(
          resolved.trim() !== '',
          `${type} baseUrlTemplate must resolve to a non-blank URL once its placeholders are filled`,
        );
        assert.equal(
          validateConnectionBaseUrl(resolved),
          null,
          `${type} baseUrlTemplate ${def.baseUrlTemplate} must pass validateConnectionBaseUrl once its placeholders are filled`,
        );
        continue;
      }
      const isCustomConnection = def.category === 'custom';
      assert.ok(
        isCustomConnection,
        `${type} has no baseUrl, no baseUrlTemplate, and is not a custom connection — it cannot source an endpoint`,
      );
    }
  });

  // opencode-free is anonymous: a user reaches these models without an account
  // or a payment method, so anything offered here must actually be free to
  // call, and the ids Maka enables by default must stay reachable. The set is
  // derived from the snapshot, so upstream is what can break this, not an edit.
  it('offers OpenCode Free only zero-rate, active, tool-capable models, including every default-enabled id', () => {
    const offered = PROVIDER_REGISTRY['opencode-free'].fallbackModels;

    assert.ok(offered.length > 0, 'opencode-free must offer at least one model');
    for (const id of offered) {
      assert.ok(
        GENERATED_MODELS_DEV_ZERO_COST_MODEL_IDS.opencode.includes(id),
        `${id} is offered anonymously but the opencode snapshot publishes a rate for it`,
      );
      const model = GENERATED_MODELS_DEV_METADATA.opencode[id];
      assert.equal(model?.capabilities?.functionCalling, true, `${id} must be tool-capable`);
      assert.notEqual(model?.lifecycle, 'deprecated', `${id} must not be deprecated upstream`);
    }
    for (const id of OPENCODE_FREE_DEFAULT_ENABLED_MODELS) {
      assert.ok(offered.includes(id), `default-enabled ${id} must still be offered`);
    }
  });
});
