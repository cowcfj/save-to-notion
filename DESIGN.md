# Design System: Save to Notion - Smart Clipper

> 本文件遵循 [Google Stitch DESIGN.md format](https://stitch.withgoogle.com/docs/design-md/overview/) 的結構，定義 Chrome extension UI 的設計語言。
> AI agents 在生成或修改任何 UI component 前，應先閱讀本文件。

---

## 1. Visual Theme & Atmosphere

Save to Notion 是一個**專注、實用的 productivity tool**。使用者通常正在閱讀網頁，並希望在兩秒內完成 clipping，因此所有視覺決策都應優先服務速度、清晰度與低干擾。

整體美學是 **clean system-native**：不使用 gradients、裝飾性 shadows 或 illustrative backgrounds。Palette 參考 macOS/iOS 與現代 web design systems（Notion、Linear、GitHub）：neutral whites、清楚的 blue interactive intent，以及克制且穩定的 spacing。

整體氣質應是**平靜、可信、精準**。UI 應像 browser 的自然延伸，而不是搶眼的第三方 widget。

### Interaction Model

本 extension 的主要使用場景是桌面 Chrome 與滑鼠/觸控板操作。設計基準是 **desktop pointer-first**：使用者正在閱讀網頁、快速 clipping 或管理標註，因此 hover、compact controls 與低視覺噪音是刻意取捨。

Baseline accessibility 仍然是必要邊界：interactive elements 必須保留可見 focus state、icon-only controls 必須有語意 label，狀態訊息應可被 assistive technology 讀取。但這不代表主流程改為 touch-first 或 keyboard-first；不應為了 keyboard-only 管理大量標註而重排 highlight card actions，或讓 destructive controls 常駐顯示。

**Key Characteristics:**
- 使用 system fonts，融入 OS context。
- Spacing 寬鬆但緊湊，每個 pixel 都應有用途。
- Interactive elements 必須清楚，主要流程保持單一 primary action 與明確 hover feedback。
- Dark mode 支援為**部分覆蓋**：Popup（[`pages/popup/popup.css`](pages/popup/popup.css)）與 Highlighter floating rail（[`scripts/highlighter/ui/styles/floatingRailStyles.js`](scripts/highlighter/ui/styles/floatingRailStyles.js)）已套用 `@media (prefers-color-scheme: dark)` 並使用 `--theme-surface-*` / `--theme-border-*` / `--theme-icon-muted-*` 雙態 token；Sidepanel 與 Options 仍為 light-only。新增需要 dark-aware 表面的元件時 **MUST** 沿用第 2 章 Theme Surfaces 的雙態 token，**MUST NOT** 寫死獨立的 dark hex。

---

## 2. Color Palette & Roles

### Primary Interactive
- **Azure Blue** (`#2563eb`) 是 canonical primary color。用於 primary CTA buttons、active navigation states、input focus rings 與 focus-visible outlines。這是 Tailwind blue-600，具備高對比、現代 web design system 的可讀性與良好 accessibility profile。
- **Azure Blue Hover** (`#1d4ed8`) 用於 hover / pressed states。

### Surfaces & Backgrounds
- **Pure White** (`#ffffff`) 是 popup、sidepanel 與 cards 的 default surface。
- **Cool Page Background** (`#f8fafc`) 是 Options page 的 full-page background（Tailwind slate-50）。
- **Subtle Surface** (`#f1f5f9`) 用於 interactive rows 與 secondary inputs 的 hover backgrounds（Tailwind slate-100）。

### Text Hierarchy
- **Text Primary** (`#1e293b`) 用於 headlines、labels 與 main content（Tailwind slate-800）。
- **Text Secondary** (`#64748b`) 用於 supporting information、descriptions 與 placeholder text（Tailwind slate-500）。
- **Text Muted** (`#94a3b8`) 用於 disabled states 與 tertiary metadata（Tailwind slate-400）。

### Borders & Dividers
- **Border Default** (`#e2e8f0`) 用於 card edges、input strokes 與 section dividers（Tailwind slate-200）。
- **Border Subtle** (`#f1f5f9`) 用於非常輕的 separation，例如 card 內部 sections。

### Status Colors
- **Success Green** (`#10b981`) 用於 saved confirmation 與 positive indicators。
- **Warning Amber** (`#f59e0b`) 用於 pending sync badge 與 unsynced state。
- **Danger Red** (`#ef4444`) 用於 destructive actions 與 error states。
- **Danger Hover** (`#dc2626`) 用於 danger buttons 的 hover state。

### Supplementary Status
- **Warning Strong** (`#eab308`，`--color-warning-strong`) 用於需要更強對比的 warning text/icon，例如 sync-pending heading。
- **Danger Light** (`#fca5a5`，`--color-danger-light`) 用於 danger 元素的 muted 變體（淡化 destructive metadata、停用態警示）。
- **Disabled** (`#94a3b8`，`--color-disabled`) 用於 disabled 控件的 background fill，與 Tailwind slate-400 對齊。

### Action Colors

Action 色獨立於 Primary Interactive，用於 Popup 與 Onboarding 的雙 CTA hierarchy（save 與 manage 兩個語意分明的動作）。語意載體在 token 名而非色值，**MUST NOT** 與 Primary Interactive 互換。

- **Action Save** (`#0a84ff`，`--color-action-save`) 是 Save 流程的 CTA 色（macOS system blue family）。Hover (`#0070e5`，`--color-action-save-hover`)。
- **Action Manage** (`#8b5cf6`，`--color-action-manage`) 是 Manage 流程的 CTA 色（violet，與 save 形成語意對比）。Hover (`#7c3aed`，`--color-action-manage-hover`)。
- **Icon On Accent** (`#ffffff`，`--color-icon-on-accent`) 用於放在 action 色背景上的 icon / glyph，確保對比。

### Brand Colors

Extension 自身品牌色，目前主要用於 onboarding 與 about author 區的視覺重點。**不應**用於 destructive 或 status indication，避免與 Status Colors 衝突。

- **Brand** (`#f47565`，`--color-brand`) — 暖珊瑚色，extension 品牌主色。
- **Brand Hover** (`#e66651`，`--color-brand-hover`)。

### Theme Surfaces (dual-mode)

Theme surface tokens 是 dark-mode-aware 的雙態 token 對組，用於 frosted-glass、半透明 overlay 與需要在 light/dark 兩種 OS scheme 下自動切換的元件背景。配合 `@media (prefers-color-scheme: dark)` 使用。

| Token | Light value | Dark value |
| --- | --- | --- |
| Theme Surface | `rgba(244, 244, 247, 0.82)`（`--theme-surface-light`） | `rgba(22, 24, 30, 0.78)`（`--theme-surface-dark`） |
| Theme Border | `rgba(0, 0, 0, 0.06)`（`--theme-border-light`） | `rgba(255, 255, 255, 0.1)`（`--theme-border-dark`） |
| Theme Icon Muted | `rgba(31, 33, 38, 0.78)`（`--theme-icon-muted-light`） | `rgba(240, 243, 247, 0.88)`（`--theme-icon-muted-dark`） |

### Highlight Palette

Highlight colors 只用於 Highlighter feature，作為 Highlighter Toolbar 與 Sidepanel 文字標註的背景或文字色。Canonical source 是 `scripts/highlighter/utils/color.js`，目前**只允許 4 色**。

| Name | Highlight bg (`COLORS`) | Text Mode color (`TEXT_COLORS`) |
| --- | --- | --- |
| Yellow | `#fff3cd` | `#d97706` (Amber 600) |
| Green | `#d4edda` | `#059669` (Emerald 600) |
| Blue | `#cce7ff` | `#2563eb` (Blue 600) |
| Red | `#f8d7da` | `#dc2626` (Red 600) |

---

## 3. Typography Rules

### Font Stack

```css
-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif,
'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol'
```

這個 stack 會在各平台渲染 system UI font（macOS 的 SF Pro、Windows 的 Segoe UI、Android / Chrome OS 的 Roboto）。除非明確批准，否則不得引入 custom web font，避免破壞 native tool aesthetic。

### Type Scale

| Role | Size | Weight | Usage |
| --- | --- | --- | --- |
| Page Title | 24px | 600 (Semi-bold) | Options page section headings |
| Section Heading | 18px | 600 | Popup title |
| Card Heading | 16px | 600 | Sidebar section title, card `h3` |
| Sub-heading | 15px | 600 | Card `h4` |
| Body | 14px | 400 | Labels、descriptions、general content |
| Small / Metadata | 13px | 400 | List item details、helper text |
| Caption | 12px | 400 | Tertiary info、footer links |
| Tag / Badge | 10-11px | 700 | Sync count badges |

### Letter Spacing

Popup action button labels 使用 `text-transform: uppercase` 與 `letter-spacing: 0.5px`。其他 context 預設使用 sentence case，不調整 letter spacing。

---

## 4. Component Stylings

### Buttons

**Primary Button**，例如 "Save to Notion"：
- Background: Azure Blue (`#2563eb`)，Hover: `#1d4ed8`。
- Text: White，13-14px，weight 500。
- Shape: `border-radius: 8px`，padding `8px 16px`。
- Hover effect: background 變深，使用輕微 `translateY(-1px)` lift 與 `box-shadow: 0 2px 4px rgba(0,0,0,0.1)`。
- Disabled: `opacity: 0.6`，`cursor: not-allowed`。

**Secondary Button**，例如 "Manage Highlights"、"Cancel"：
- Canonical default: background White，border `1px solid #e2e8f0`，text `#1e293b`。
- Canonical hover: background `#f1f5f9`。
- Popup 的 `#manage-button.secondary-action` 目前使用較淡的 blue-tinted hover treatment（`#f8fafc` / `#eef2ff`），屬已知局部差異；若未來要統一 secondary buttons，應先評估 Popup 的 visual hierarchy。

**Danger Button**，例如 "Clear All" 等 destructive actions：
- Background: `#fee2e2`，Text: `#ef4444`。
- Hover: background 加深為 `#fecaca`。

**Icon Button**，例如 Sidepanel header action icons：
- Transparent background，36x36px hit target，`border-radius: 8px`。
- Hover: `#f5f5f5` background，primary blue text。
- Disabled: `opacity: 0.4`。

**Focus Accessibility**，適用所有 interactive elements：
- `outline: 2px solid #2563eb; outline-offset: 2px`。
- Outer glow: `box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.2)`。
- Danger buttons 使用 red glow: `rgba(239, 68, 68, 0.2)`。
- Options sidebar nav item 目前使用 inset focus treatment，這是因應 sidebar active background 的局部差異。

### Cards & Containers

- White background，1px border `#e2e8f0`，`border-radius: 12px`，padding `24px`。
- Resting shadow: `0 1px 3px rgba(0,0,0,0.05)`。
- Hover: lift 到 `translateY(-2px)`，shadow `0 4px 6px -1px rgba(0,0,0,0.1)`。

### Highlight Cards

- Sidepanel highlight cards 使用 white background、1px border、`border-radius: 8px`、padding `12px`。
- 左側 color indicator bar 使用 4px width，顏色必須對應 4 種 highlight colors。
- Delete button 只在 card hover / focus-within 時顯示（`opacity: 0 -> 1`）。這是 intentional hover-reveal 設計，用來降低 repeated list 內 destructive action 的視覺噪音；不得改成常駐顯示。
- Hover 時 border 稍微加深，並出現 soft shadow。

### Confirm Dialog

Options page destructive confirmations use the native `<dialog>` primitive via `pages/options/confirmDialog.js`.

- **Container:** `.confirm-dialog` uses `--radius-lg` (`12px`), `--spacing-lg` (`24px`), `--color-bg` (`#ffffff`), `--color-text` (`#1e293b`), and a restrained shadow.
- **Message body:** `.confirm-dialog-message` uses 14px muted body text and `white-space: pre-line` so existing confirmation copy with `\n` keeps readable paragraphs.
- **Actions:** confirmation buttons reuse `.btn-primary` or `.btn-danger`; cancel uses `.btn-secondary`.
- **Irreversibility:** Destructive or irreversible actions MUST pass `danger: true`.

### Forms & Inputs

- 1px border `#e2e8f0`，`border-radius: 8px`，padding `10px`，font-size `14px`。
- Focus: border 變為 `#2563eb`，outer glow `box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1)`。
- Checkboxes: 16x16px，必須搭配 label，cursor pointer。

### Toggle Switch（滑動開關）

用於二元開關或互斥多選一設定項（radio-as-switch）。

- **二元開關範式:** 採 `<input type="checkbox" role="switch">` + CSS 範式（無障礙與測試由原生 checkbox 免費取得，`role="switch"` 提供精確語意）。首次落地於設定頁 OAuth 連接（`#oauth-connection-toggle`）。
- **互斥開關範式 (radio-as-switch):** 採 `<input type="radio" class="switch-input">`。適用於多個目標中只能啟用其中一個的互斥開關（如保存目標列表中的 Active Profile 切換）。在 `role="radio"` 的 row 容器中包裹 `<label class="switch-wrapper">`、`<input type="radio">` 與 `.switch-track` 裝飾，提供原生 radio 的互斥性與鍵盤無障礙。

- **軌道（track）:** 寬 44px、高 24px、`border-radius: 999px`
  - OFF / 未選中: `background: var(--color-disabled)`
  - ON / 已選中: `background: var(--color-success)`（#10b981）
- **滑塊（knob）:** 18px 圓、`background: var(--color-bg)`、滑動 transition
- **focus-visible:** `box-shadow: 0 0 0 3px var(--focus-ring-primary)`
- **disabled:** 降透明度 + loading 脈動（連接中態）
- **prefers-reduced-motion:** 移除 transition / 動畫

CSS 範式與結構通用於這兩種輸入類型，定義於 `styles/ui-primitives.css`（`.switch-*`），設計為可低成本複製到其他 checkbox 或 radio 設定項。

### Segmented Radio and Dot Rail Radio

Options page value selections with 2-4 mutually exclusive values use native radio inputs with custom presentation.

- Segmented radio is used for short labels and non-ordered choices such as zoom, size, and highlight style.
- Dot rail radio is used when the options have a spatial/order relationship, such as Floating Rail position.
- Boolean enable/disable controls MUST continue to use Toggle Switch rather than segmented radio.
- Disabled dependent radio groups should remain visible but subdued when controlled by a switch.

### Status Messages / Toast Bars

| State | Background | Text | Border |
| --- | --- | --- | --- |
| Success | `#dcfce7` | `#166534` | `#bbf7d0` |
| Error | `#fee2e2` | `#991b1b` | `#fecaca` |
| Warning | `#fef3c7` | `#92400e` | `#fcd34d` |

### Navigation Tabs

- Sidepanel tabs 使用 2px bottom border 作為 active indicator，active color 為 Azure Blue (`#2563eb`)。
- Active tab: font-weight `600`，text `#333`。
- Inactive tab: text `#666`，hover background `#f5f5f5`。
- Tab font size: `12px`。

---

## 5. Layout Principles

### Popup

Popup 固定寬度為 `320px`，採用 narrow vertical single-column layout。Buttons full-width stack。Body padding 是 `10px`，主要元素間距約 `12px`。設計必須能由上到下快速掃描，不能出現 horizontal scrolling，也不得加入 sidebars。

### Side Panel

Side Panel 是 full-height panel，包含 sticky header 與 scrollable content area。Horizontal padding 使用 `--panel-padding` (`16px`)。Content 以 vertical card/list 組織，常用 gap 為 `12px`。Tab bar 位於 sticky header 下方。Empty 或 loading state 必須能自然呈現，使用 centered empty state（icon + caption）。

### Options Page

Options Page 使用 full-window sidebar layout。Left sidebar 固定 `240px`。Content area 使用 `24px` top/bottom padding 與 `40px` horizontal padding，內容 max-width 為 `800px` 並置中。Sections 以 cards 組織，card 間距為 `24px`。

### Highlighter Toolbar

Highlighter Toolbar 是 Shadow DOM overlay，injected floating panel，position `fixed` 並放在 top-right（`top: 20px; right: 20px`）。寬度範圍是 `240-300px`。使用 `backdrop-filter: blur(10px)`、semi-transparent white background (`rgba(255,255,255,0.95)`) 與 frosted glass border (`rgba(0,0,0,0.08)`)。

**Critical:** Toolbar styles 全部位於 `scripts/highlighter/ui/styles/toolbarStyles.js` 的 Shadow DOM 內，不能依賴外部 CSS custom properties。需參照下方 token mapping table。

### Whitespace Strategy

- `spacing-xs`: 4px，用於 tight inline gaps，例如 icon-to-text。
- `spacing-sm`: 8px，用於 element-level gaps，例如 adjacent labels、icon buttons。
- `spacing-md`: 16px，用於 component-level gaps，例如 form groups、card sections。
- `spacing-lg`: 24px，用於 section-level gaps，例如 cards 或 major content blocks 之間。

#### Spacing Utility Classes 命名約定

為維護 HTML 結構與 Spacing Tokens 的一致性，本專案的 Spacing Utility Classes 統一採用語意化命名，並與 `--spacing-*` 變數一一對應。禁止在 HTML 中直接使用硬編碼像素值的類別（如 `mt-8`、`mb-12` 等），應統一收攏至下列標準語意類別：

Utility classes 定義於 [`styles/ui-primitives.css`](styles/ui-primitives.css)，所有載入該檔的 entry pages（popup、options、sidepanel、onboarding）皆可使用。

| Utility Class | CSS 實作 | 語意與設計用途 |
| --- | --- | --- |
| `.mt-sm` | `margin-top: var(--spacing-sm);` | 元件內部或緊鄰元素之上間距 (8px) |
| `.mt-md` | `margin-top: var(--spacing-md);` | 元件層級、卡片內部段落或表單組之上間距 (16px) |
| `.mb-sm` | `margin-bottom: var(--spacing-sm);` | 元件內部或緊鄰元素之下間距 (8px) |
| `.mb-md` | `margin-bottom: var(--spacing-md);` | 元件層級、卡片內部段落或表單組之下間距 (16px) |

---

## 6. Highlighter Shadow DOM Token Reference

Highlighter 子系統的 Shadow DOM 元件無法直接繼承外部 document root 的 CSS custom properties。為維持視覺一致性與架構可維護性，本專案採用以下策略：

1. **Toolbar 樣式**（`scripts/highlighter/ui/styles/toolbarStyles.js`）：維持 hardcoded 數值對齊（見下表）。
2. **Floating Rail 與 Toast 樣式**（`scripts/highlighter/ui/styles/{floatingRailStyles,toastStyles}.js`）：採用 **同樹 Token-Var Bridge**。即在 Shadow DOM 內建構 `:host { --<ns>-...: <value>; }` 橋接色彩變數，隨後在同樹樣式中以 `var(--<ns>-...)` 引用。自定義屬性全部於 Host 內部自我定義並局部解析，不依賴外部繼承，完美符合 Shadow DOM 隔離原則，並為 3b（`.css` 靜態遷移）做好準備。

下表將 canonical design tokens 對應到 Highlighter Toolbar 內的 hardcoded 對等值：

| Design Token (canonical) | Value | Shadow DOM Equivalent |
| --- | --- | --- |
| Primary Blue | `#2563eb` | `#2eaadc` - intentional divergence，見 Known Divergences |
| Primary Hover | `#1d4ed8` | `#2590ba` - intentional divergence |
| Save Button Blue | `#2563eb` | `#2563eb`，已於 2026-04-15 refactor 對齊 |
| Danger Red | `#ef4444` | `#ef4444` |
| Danger Hover | `#dc2626` | `#dc2626` |
| Text Primary | `#1e293b` | `#1a1a1a`，near-equivalent |
| Text Muted | `#64748b` | `#64748b` |
| Border Default | `#e2e8f0` | `#e5e7eb`，near-equivalent |
| Surface bg | `#f8fafc` | `#f8fafc` |
| Border radius md | 8px | 8px |
| Border radius lg | 12px | 12px |

---

## 7. Known Divergences

下列差異存在於主要 UI style sources。未必需要立即修正，但未來進行 UI refactor 時應依 semantic intent 判斷是要保留為 intentional divergence，還是收斂到 canonical values。

Style sources:
- `pages/popup/popup.css`
- `pages/sidepanel/sidepanel.css`
- `pages/options/options.css`
- `scripts/highlighter/ui/styles/toolbarStyles.js`

| Token | Canonical | `pages/popup/popup.css` | `pages/sidepanel/sidepanel.css` | `pages/options/options.css` | `toolbarStyles.js` |
| --- | --- | --- | --- | --- | --- |
| **Primary Blue** | `#2563eb` | `#2563eb` aligned | `#2563eb` aligned | `#2563eb` aligned (PR #555) | `#2eaadc` intentional |
| **Primary Hover** | `#1d4ed8` | `#1d4ed8` aligned | `#1d4ed8` aligned | `#1d4ed8` aligned (PR #555) | `#2590ba` intentional |
| **Text Primary** | `#1e293b` | `#1e293b` aligned | `#1e293b` aligned | `#1e293b` aligned (PR #555) | `#1a1a1a` near-equivalent |
| **Border Color** | `#e2e8f0` | local secondary controls use `#cbd5e1` | `#e2e8f0` aligned | `#e2e8f0` aligned (PR #555) | `#e5e7eb` near-equivalent |
| **Save Button Blue** | `#2563eb` | `#2563eb` aligned | N/A | N/A | `#2563eb` aligned |
| **Secondary Button** | white / `#e2e8f0` / `#1e293b` | blue-tinted exception for `#manage-button.secondary-action` | aligned for icon/load-more patterns | aligned for standard buttons | action buttons use near-equivalent neutrals |
| **Button hover lift** | `translateY(-1px)` | `translateY(-1px)` aligned | `translateY(-1px)` for load-more | `translateY(-2px)` on cards | `scale(0.96)` on active state |
| **Border radius (btn)** | `8px` | `8px` aligned | `8px` aligned | `8px` aligned | `8px` aligned |
| **Spacing tokens** | `--spacing-*` | tokens defined | tokens defined | tokens defined | hardcoded by Shadow DOM requirement |

Legend:
- `aligned` 表示符合 canonical value。
- `near-equivalent` 表示數值接近，現階段可接受。
- `intentional` 表示基於產品語意刻意保留。
- `exception` 表示需要在後續 UI refactor 中重新判斷是否收斂。

### Brand-Constrained Exceptions

下列 hex 值是受第三方品牌規範約束、**MUST NOT** 對齊到 canonical token 的例外。未來做 token alignment 時應跳過。

| Location | Hex | Reason |
| --- | --- | --- |
| `pages/options/options.css` Buy Me a Coffee 連結背景 | `#ffdd00` | Buy Me a Coffee 官方品牌色，不可變更為 design system 色 |

### Intentional Divergence: Highlighter Primary Blue

**Decision date:** 2026-04-15

Highlighter Toolbar 的 primary blue (`#2eaadc`, cyan-tinted) 刻意不同於 global Azure Blue (`#2563eb`)。

**Rationale:** Highlighter 在任意第三方網頁上以 annotation mode 運作。Cyan-tinted blue 作為模式切換的視覺信號，可降低使用者把 highlighter actions 與一般 Popup / Sidepanel interactions 混淆的風險。

**Scope of intentional divergence:**
- `.nh-btn-primary` background: `#2eaadc`，保留。
- `.nh-btn-primary:hover` background: `#2590ba`，保留。
- `.nh-color-btn.active` box-shadow: `#2eaadc` ring，保留並與 primary color 一致。
- `scripts/highlighter/ui/components/MiniIcon.js` SVG stroke: `#2eaadc`，保留。

**Already unified:**
- `.nh-btn-save` ("Save to Notion" action) 已更新為 `#2563eb`，因為語意上與 Popup Save Button 相同。

---

## 8. Non-Goals

- MUST NOT 將 Popup、Sidepanel、Options 或 Highlighter Toolbar 改造成 touch-first UI。
- MUST NOT 為純 keyboard-only 或大量標註管理流程改變目前 hover-first visual behavior。
- MUST NOT 讓 highlight card delete button 常駐顯示；hover-reveal 是保留設計。
- MUST NOT 引入 onboarding text、教學說明或大面積 explanatory UI 來補足本應由 hierarchy 與 state 表達的資訊。

---

*Last updated: 2026-05-20*
