import { jest } from '@jest/globals';
import { TextDecoder, TextEncoder } from 'node:util';

globalThis.chrome ??= {};
globalThis.jest ??= jest;
globalThis.structuredClone ??= value => JSON.parse(JSON.stringify(value));
globalThis.TextDecoder ??= TextDecoder;
globalThis.TextEncoder ??= TextEncoder;
