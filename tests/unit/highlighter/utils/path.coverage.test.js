/**
 * @jest-environment jsdom
 */

import { getNodePath, parsePathFromString, getNodeByPath, isValidPathString } from '../../../../scripts/highlighter/utils/path.js';

describe('Path Utils Coverage Tests', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    describe('getNodePath', () => {
        test('should return empty string for document.body', () => {
            expect(getNodePath(document.body)).toBe('');
        });

        test('should return empty string for null', () => {
            expect(getNodePath(null)).toBe('');
        });

        test('should get path for element node', () => {
            const div = document.createElement('div');
            const paragraphElement = document.createElement('p');
            div.appendChild(paragraphElement);
            document.body.appendChild(div);

            const path = getNodePath(paragraphElement);
            expect(path).toBe('div[0]/p[0]');
        });

        test('should get path for text node', () => {
            const div = document.createElement('div');
            const textNode = document.createTextNode('Test');
            div.appendChild(textNode);
            document.body.appendChild(div);

            const path = getNodePath(textNode);
            expect(path).toBe('div[0]/text[0]');
        });

        test('should handle multiple siblings', () => {
            const div1 = document.createElement('div');
            const div2 = document.createElement('div');
            const paragraphElement = document.createElement('p');
            div2.appendChild(paragraphElement);
            document.body.appendChild(div1);
            document.body.appendChild(div2);

            const path = getNodePath(paragraphElement);
            expect(path).toBe('div[1]/p[0]');
        });

        test('should handle multiple text nodes', () => {
            const div = document.createElement('div');
            div.appendChild(document.createTextNode('First'));
            div.appendChild(document.createTextNode('Second'));
            document.body.appendChild(div);

            const path = getNodePath(div.childNodes[1]);
            expect(path).toBe('div[0]/text[1]');
        });

        test('should handle node without parent', () => {
            const orphanDiv = document.createElement('div');
            const path = getNodePath(orphanDiv);
            expect(path).toBe('');
        });
    });

    describe('parsePathFromString', () => {
        test('should parse valid path string', () => {
            const result = parsePathFromString('div[0]/p[2]/text[0]');
            expect(result).toEqual([
                { type: 'element', tag: 'div', index: 0 },
                { type: 'element', tag: 'p', index: 2 },
                { type: 'text', index: 0 }
            ]);
        });

        test('should return empty array for empty string', () => {
            const result = parsePathFromString('');
            expect(result).toEqual([]);
        });

        test('should return empty array for whitespace', () => {
            const result = parsePathFromString('   ');
            expect(result).toEqual([]);
        });

        test('should return null for non-string input', () => {
            expect(parsePathFromString(null)).toBeNull();
            expect(parsePathFromString()).toBeNull();
            expect(parsePathFromString(123)).toBeNull();
        });

        test('should return null for invalid format', () => {
            expect(parsePathFromString('invalid')).toBeNull();
            expect(parsePathFromString('div/p')).toBeNull();
            expect(parsePathFromString('div[a]')).toBeNull();
        });

        test('should skip empty steps', () => {
            const result = parsePathFromString('div[0]//p[1]');
            expect(result).toEqual([
                { type: 'element', tag: 'div', index: 0 },
                { type: 'element', tag: 'p', index: 1 }
            ]);
        });
    });

    describe('getNodeByPath', () => {
        test('should return document.body for empty array', () => {
            const node = getNodeByPath([]);
            expect(node).toBe(document.body);
        });

        test('should return document.body for null', () => {
            const node = getNodeByPath(null);
            expect(node).toBe(document.body);
        });

        test('should get node from string path', () => {
            const div = document.createElement('div');
            const paragraphElement = document.createElement('p');
            div.appendChild(paragraphElement);
            document.body.appendChild(div);

            const node = getNodeByPath('div[0]/p[0]');
            expect(node).toBe(paragraphElement);
        });

        test('should get node from path array', () => {
            const div = document.createElement('div');
            const paragraphElement = document.createElement('p');
            div.appendChild(paragraphElement);
            document.body.appendChild(div);

            const path = [
                { type: 'element', tag: 'div', index: 0 },
                { type: 'element', tag: 'p', index: 0 }
            ];

            const node = getNodeByPath(path);
            expect(node).toBe(paragraphElement);
        });

        test('should get text node from path', () => {
            const div = document.createElement('div');
            const textNode = document.createTextNode('Test');
            div.appendChild(textNode);
            document.body.appendChild(div);

            const path = [
                { type: 'element', tag: 'div', index: 0 },
                { type: 'text', index: 0 }
            ];

            const node = getNodeByPath(path);
            expect(node).toBe(textNode);
        });

        test('should trigger fuzzy matching for out of bounds index with different tag', () => {
            const div = document.createElement('div');
            document.body.appendChild(div);

            // Index 5 is out of bounds and looking for 'span' which doesn't exist
            const path = [
                { type: 'element', tag: 'span', index: 5 }
            ];

            const node = getNodeByPath(path);
            expect(node).toBeNull();
        });

        test('should fallback to tag matching when index is out of bounds', () => {
            const div1 = document.createElement('div');
            const div2 = document.createElement('div');
            document.body.appendChild(div1);
            document.body.appendChild(div2);

            // Index 5 is out of bounds, should find first div
            const path = [
                { type: 'element', tag: 'div', index: 5 }
            ];

            const node = getNodeByPath(path);
            expect(node).toBe(div1);
        });

        test('should return null for invalid string path', () => {
            const node = getNodeByPath('invalid');
            expect(node).toBeNull();
        });

        test('should return null when element has no children', () => {
            const div = document.createElement('div');
            document.body.appendChild(div);

            const path = [
                { type: 'element', tag: 'div', index: 0 },
                { type: 'element', tag: 'p', index: 0 }
            ];

            const node = getNodeByPath(path);
            expect(node).toBeNull();
        });

        test('should handle errors gracefully', () => {
            const path = [
                { type: 'element', tag: 'div', index: 0 }
            ];

            // Mock children to throw error
            Object.defineProperty(document.body, 'children', {
                get: () => {
                    throw new Error('Test error');
                },
                configurable: true
            });

            const node = getNodeByPath(path);
            expect(node).toBeNull();

            // Restore
            Object.defineProperty(document.body, 'children', {
                get: () => document.body.querySelectorAll('*'),
                configurable: true
            });
        });
    });

    describe('isValidPathString', () => {
        test('should return true for valid path', () => {
            expect(isValidPathString('div[0]/p[2]/text[0]')).toBe(true);
            expect(isValidPathString('div[0]')).toBe(true);
            expect(isValidPathString('text[5]')).toBe(true);
        });

        test('should return true for empty string', () => {
            expect(isValidPathString('')).toBe(true);
            expect(isValidPathString('   ')).toBe(true);
        });

        test('should return false for non-string input', () => {
            expect(isValidPathString(null)).toBe(false);
            expect(isValidPathString()).toBe(false);
            expect(isValidPathString(123)).toBe(false);
        });

        test('should return false for invalid format', () => {
            expect(isValidPathString('invalid')).toBe(false);
            expect(isValidPathString('div/p')).toBe(false);
            expect(isValidPathString('div[a]')).toBe(false);
            expect(isValidPathString('div[]')).toBe(false);
        });

        test('should return false for malformed steps', () => {
            expect(isValidPathString('div[0]//')).toBe(false);
            expect(isValidPathString('div[0]/')).toBe(false);
        });
    });
});
