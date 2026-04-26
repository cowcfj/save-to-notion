# Config 目錄

本檔僅提供 `scripts/config/` 的快速導覽。

完整且唯一的配置架構規格請參閱：

- `docs/specs/CONFIGURATION_ARCHITECTURE.md`

## 快速邊界

- `shared/`：跨 Content Script / Background / Options / Popup / Highlighter 可共用的 config。
- `extension/`：僅供 extension pages 與 Background 使用。
- `env/`：runtime 與 build-time 環境配置。
- `contentSafe/`：Content bundle 最小必要常量子集。
- `runtimeActions/`：Content / Highlighter / Preloader 專用 action 子集。

## 使用原則

- 新增或修改配置規則時，**MUST** 先更新 `docs/specs/CONFIGURATION_ARCHITECTURE.md`。
- 本檔 **MUST NOT** 重複維護完整規格內容，避免文檔漂移。
