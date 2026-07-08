import { jest } from '@jest/globals';
import { TextDecoder, TextEncoder } from 'node:util';
import { deserialize, serialize } from 'node:v8';
import cssEscapePolyfill from '../helpers/cssEscapePolyfill.cjs';

const { installCssEscapePolyfill } = cssEscapePolyfill;

globalThis.chrome ??= {};
globalThis.jest ??= jest;
globalThis.structuredClone ??= value => deserialize(serialize(value));
globalThis.TextDecoder ??= TextDecoder;
globalThis.TextEncoder ??= TextEncoder;

installCssEscapePolyfill();
