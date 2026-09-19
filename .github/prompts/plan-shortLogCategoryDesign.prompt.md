# Plan: Short Log Category Design

Eliminate `target:` from normal Rust log calls and derive categories automatically from `module_path` and the `logger` configuration. Configuration names and displayed names should use only the short logical names `frontend`, `tauri`, `proxy`, `agent`, `commands`, and `diff`. Unknown Rust modules should be classified as `tauri`.

## Steps

### Phase 1: Configuration Schema

1. Keep the current plural `commands` name as the canonical name. Do not treat `handlers` as an independent category; always handle it as `commands`.
2. Add a flattened `BTreeMap<String, LogLevel>` to `LoggerConfig` with `#[serde(flatten)]`, allowing additional categories through `logger.<top_level_module>: <level>`.
3. Require an additional category name to match a Rust top-level module name exactly. For example, `logger.network: debug` applies to `micro_studio_agent_lib::network::*`.
4. Normalize `handlers` as an alias of `commands` in both configuration and output. Other names such as singular `command` may be accepted as dynamic categories, but they produce no logs unless a corresponding Rust module exists; document this behavior.
5. Preserve `LoggerConfig::default()`, serialization, and comparisons with existing configurations. Because adding a flattened public field changes struct literals, review external uses and prefer `..LoggerConfig::default()`.

### Phase 2: Internal Filtering and Classification

6. Generate `target_directives` from the built-in fields and dynamic categories. Continue using crate-qualified internal targets, but do not expose them in configuration or output.
7. Map `frontend` to the literal target `frontend`, `tauri` to the crate root, `proxy`, `agent`, `commands`, `handlers`, and `diff` to crate-qualified prefixes, and dynamic categories to `crate::<category>`.
8. Do not create an independent directive for `handlers`. Filter `micro_studio_agent_lib::handlers::*` using the `commands` threshold.
9. Include dynamic category levels in `highest_configured_level`, so a dynamic `trace` category is not suppressed when all other categories are disabled.
10. Leave unknown crate modules matched by the crate-root directive, causing them to use the `tauri` threshold until a category is added.

### Phase 3: Display Format

11. Use `env_logger::Builder::format` in `build_logger` and apply a custom format containing the level and short category to both stdout and stderr loggers.
12. Derive the displayed category from `record.module_path()` without changing normal Rust log call sites.
13. Display the crate root as `tauri`, configured top-level modules by their configured names, `handlers` as `commands`, and unconfigured crate modules as `tauri`.
14. Keep `target: "frontend"` only for frontend IPC because browser-originated records do not have a Rust module path. Detect and display those records as `frontend` first.
15. Preserve the existing stdout/stderr level routing. If timestamps must remain unchanged, reproduce them explicitly in the custom formatter.

### Phase 4: Tests

16. Add unit tests for dynamic YAML parsing, internal directive generation, fallback of unknown modules to `tauri`, configured module display, `handlers` to `commands`, and frontend display.
17. Test maximum-level calculation when a dynamic category is set to `trace`, and verify that child modules match their parent category filter.
18. Test the handling of `handlers` and other aliases, then rerun existing logger configuration tests for defaults, all levels, invalid levels, and existing field comparisons.

### Phase 5: Documentation

19. Update the Logger Configuration section in `README.md`. Document that normal Rust logs omit `target:`, internal crate prefixes must not be configured, unknown modules default to `tauri`, and additional categories use the documented syntax.
20. Synchronize the old standard formatter and target descriptions in `doc/dev/AI-Agent-Extension-System-Architecture-Design-and-Implementation-Specification.md`.
21. If useful, add an English commented example for additional categories to `resources/template.config.yml` without changing its six existing values.

## Relevant Files

- `/home/bindi/work/micro-zoukei/src-tauri/src/config.rs` — Add flattened categories, generate internal directives, calculate the maximum level, implement the short-category formatter, and add classification tests.
- `/home/bindi/work/micro-zoukei/src-tauri/src/handlers.rs` — Keep `target: "frontend"` only for frontend IPC; do not change Rust business logging.
- `/home/bindi/work/micro-zoukei/src-tauri/tests/config_test.rs` — Add regression tests for dynamic categories, aliases, classification, and filtering.
- `/home/bindi/work/micro-zoukei/src-tauri/resources/template.config.yml` — Preserve existing values and optionally add a commented dynamic-category example.
- `/home/bindi/work/micro-zoukei/README.md` — Synchronize the public configuration and display contract.
- `/home/bindi/work/micro-zoukei/doc/dev/AI-Agent-Extension-System-Architecture-Design-and-Implementation-Specification.md` — Synchronize the architecture and logger design.

## Verification

1. Immediately run `cargo check` from `/home/bindi/work/micro-zoukei/src-tauri` after editing Rust files and resolve all compilation errors.
2. Run `cargo fmt --check` from the same directory as the final formatting check.
3. Run `cargo test` and ensure all existing and newly added logger category tests pass.
4. Verify that `proxy`, `agent`, and `diff` use their configured names; `handlers` displays as `commands`; unconfigured modules such as `initial_index` and `network` display as `tauri`; and frontend IPC displays as `frontend`.
5. Verify startup stdout/stderr output through the existing Tauri startup procedure: only error records go to stderr, while warning and lower levels go to stdout.

## Decisions

- Configuration and output use only short logical names.
- Crate prefixes in `target_directives` remain an internal implementation detail.
- Normal Rust logs use targetless calls such as `log::info!("...")`.
- New top-level modules belong to `tauri` until a category is added.
- A new category can be separated by adding `logger.<top_level_module>: <level>` and reusing the existing mapping and display logic.
- `commands` remains canonical, and `handlers` always maps to `commands`.
- `target: "frontend"` remains the sole exception because frontend IPC has no Rust module path.

## Further Considerations

1. Dynamic category names must match Rust top-level module names by convention. Because Rust modules cannot be enumerated at runtime, an unmatched or misspelled category cannot be detected fully automatically.
2. A custom formatter replaces the standard `env_logger` output format. Explicitly reproduce timestamps if compatibility with the previous format is required.
