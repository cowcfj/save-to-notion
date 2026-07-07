import { readFileSync } from 'node:fs';
import path from 'node:path';

const messageBusPath = path.resolve(process.cwd(), '.agents/.shared/knowledge/message_bus.json');

let messageBus = null;

export function loadMessageBusContract() {
  if (!messageBus) {
    messageBus = JSON.parse(readFileSync(messageBusPath, 'utf8'));
  }
  return messageBus;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function expectActionResponseDeclares(group, actionName, fields) {
  const contract = loadMessageBusContract();
  const actionGroup = contract.actions[group];

  if (!isRecord(actionGroup)) {
    throw new Error(`message_bus.json actions.${group} is missing`);
  }

  if (!Object.hasOwn(actionGroup, actionName)) {
    throw new Error(`message_bus.json actions.${group}.${actionName} is missing`);
  }

  const responseContract = actionGroup[actionName].response;

  if (!isRecord(responseContract)) {
    throw new Error(`message_bus.json actions.${group}.${actionName}.response must be an object`);
  }

  for (const field of fields) {
    expect(responseContract).toHaveProperty(field);
  }
}

export function expectResponseHasFields(response, fields) {
  for (const field of fields) {
    expect(response).toHaveProperty(field);
  }
}
