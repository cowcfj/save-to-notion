import { readFileSync } from 'node:fs';
import path from 'node:path';

import { PAGE_SAVE_ACTIONS } from '../../../scripts/config/runtimeActions/pageSaveActions.js';
import { RUNTIME_ACTIONS } from '../../../scripts/config/shared/runtimeActions.js';

const messageBusPath = path.resolve(process.cwd(), '.agents/.shared/knowledge/message_bus.json');
const messageBus = JSON.parse(readFileSync(messageBusPath, 'utf8'));

const REQUIRED_ACTION_FIELDS = ['description', 'payload', 'response'];
const CORE_SAVE_ACTIONS = ['savePage', 'checkPageStatus', 'SAVE_PAGE_FROM_RAIL'];

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isObjectLike(value) {
  return value !== null && typeof value === 'object';
}

function listActions(actionsByDomain) {
  const rows = [];

  if (!isRecord(actionsByDomain)) {
    return rows;
  }

  for (const [domain, actions] of Object.entries(actionsByDomain)) {
    if (!isRecord(actions)) {
      continue;
    }

    for (const [actionName, contract] of Object.entries(actions)) {
      if (actionName.startsWith('$')) {
        continue;
      }
      rows.push({ domain, actionName, contract });
    }
  }

  return rows;
}

function collectMalformedActionDomainViolations(actionsByDomain) {
  return Object.entries(actionsByDomain)
    .filter(([, actions]) => !isRecord(actions))
    .map(([domain]) => `actions.${domain}:not_object`);
}

function collectMissingActionFieldViolations(actionPath, contract) {
  return REQUIRED_ACTION_FIELDS.filter(field => !Object.hasOwn(contract, field)).map(
    field => `${actionPath}.${field}`
  );
}

function collectActionMetadataViolations(actionPath, contract) {
  const fieldChecks = [
    {
      hasViolation: typeof contract.description !== 'string' || contract.description.trim() === '',
      violation: `${actionPath}.description:empty`,
    },
    {
      hasViolation: !isObjectLike(contract.payload),
      violation: `${actionPath}.payload:not_object`,
    },
    {
      hasViolation: !isObjectLike(contract.response),
      violation: `${actionPath}.response:not_object`,
    },
  ];

  return fieldChecks.filter(({ hasViolation }) => hasViolation).map(({ violation }) => violation);
}

function collectActionContractViolations({ domain, actionName, contract }) {
  const actionPath = `actions.${domain}.${actionName}`;

  if (!isRecord(contract)) {
    return [`${actionPath}:not_object`];
  }

  return [
    ...collectMissingActionFieldViolations(actionPath, contract),
    ...collectActionMetadataViolations(actionPath, contract),
  ];
}

function collectActionShapeViolations(actionsByDomain) {
  if (!isRecord(actionsByDomain)) {
    return ['actions:not_object'];
  }

  return [
    ...collectMalformedActionDomainViolations(actionsByDomain),
    ...listActions(actionsByDomain).flatMap(action => collectActionContractViolations(action)),
  ];
}

function collectMissingSaveActionWireValues(saveActions, runtimeValues) {
  if (!isRecord(saveActions)) {
    return ['actions.save:not_object'];
  }

  return Object.keys(saveActions)
    .filter(actionName => !actionName.startsWith('$'))
    .filter(actionName => !runtimeValues.has(actionName));
}

describe('message_bus.json runtime message contract', () => {
  test('shape validator catches missing required action fields', () => {
    const brokenActions = {
      save: {
        savePage: {
          description: 'broken fixture',
          payload: {},
        },
      },
    };

    expect(collectActionShapeViolations(brokenActions)).toContain('actions.save.savePage.response');
  });

  test('shape validator reports malformed action domain maps', () => {
    const brokenActions = {
      save: null,
    };

    expect(collectActionShapeViolations(brokenActions)).toContain('actions.save:not_object');
  });

  test('shape validator reports malformed action contracts', () => {
    const brokenActions = {
      save: {
        savePage: null,
      },
    };

    expect(collectActionShapeViolations(brokenActions)).toContain(
      'actions.save.savePage:not_object'
    );
  });

  test('shape validator reports malformed actions registry root', () => {
    expect(collectActionShapeViolations(null)).toContain('actions:not_object');
  });

  test('every action declares description, payload, and response objects', () => {
    expect(collectActionShapeViolations(messageBus.actions)).toEqual([]);
  });

  test('core save actions remain documented in message_bus.json', () => {
    for (const actionName of CORE_SAVE_ACTIONS) {
      expect(messageBus.actions.save).toHaveProperty(actionName);
    }
  });

  test('save action alignment validator catches missing runtime wire values', () => {
    const runtimeValues = new Set(['savePage']);

    expect(
      collectMissingSaveActionWireValues(
        {
          savePage: {},
          checkPageStatus: {},
        },
        runtimeValues
      )
    ).toEqual(['checkPageStatus']);
  });

  test('save action alignment validator reports malformed save action map', () => {
    expect(collectMissingSaveActionWireValues(null, new Set())).toEqual([
      'actions.save:not_object',
    ]);
  });

  test('documented save actions map to PAGE_SAVE_ACTIONS or RUNTIME_ACTIONS wire values', () => {
    const runtimeValues = new Set([
      ...Object.values(PAGE_SAVE_ACTIONS),
      ...Object.values(RUNTIME_ACTIONS),
    ]);

    expect(collectMissingSaveActionWireValues(messageBus.actions.save, runtimeValues)).toEqual([]);
  });
});
