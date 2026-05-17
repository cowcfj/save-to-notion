/**
 * Floating Rail instance namespace
 *
 * 同一 page-origin 內的 sessionStorage 與 DOM 由 page 與所有 content scripts 共享，
 * 多個 extension instance 共存時必須以 chrome.runtime.id 作 namespace 邊界，
 * 才能避免 host id、storage key 互相覆蓋。
 */

export const RAIL_INSTANCE_ID = globalThis.chrome?.runtime?.id ?? 'unknown';
