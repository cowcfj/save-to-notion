import fs from 'fs';
import { JSDOM } from 'jsdom';
import { DomConverter } from './temp_DomConverter.mjs';

// Mock ImageUtils
global.ImageUtils = {
    extractImageSrc: (node) => node.src || node.getAttribute('data-src'),
    cleanImageUrl: (url) => url
};
global.Node = {
    ELEMENT_NODE: 1,
    TEXT_NODE: 3
};

// Mock Document context for URL parsing
const html = fs.readFileSync('temp_gh_docs.html', 'utf8');
const dom = new JSDOM(html);
global.document = dom.window.document;
global.window = dom.window;

const converter = new DomConverter();
const container = document.querySelector('.markdown-body');

if (container) {
    const blocks = converter.convert(container);
    console.log(`Total Blocks: ${blocks.length}`);

    // Search for block matching error signature
    let matches = 0;
    blocks.forEach((block, index) => {
        if (block.children && block.children.length > 0) {
            const firstChild = block.children[0];
            if (firstChild.type === 'code') {
                console.log(`\n!!! FOUND MATCH at Index ${index}`);
                console.log(JSON.stringify(block, null, 2));
                matches++;
            }
        }
    });
    console.log(`\nTotal Matches Found: ${matches}`);

} else {
    console.log("No .markdown-body");
}
