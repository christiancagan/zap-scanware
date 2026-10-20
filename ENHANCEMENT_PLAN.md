# Enhancement Plan — Multi-Format Malware Analysis

Status: **Phases 0–6 implemented** (Phase 7 native engine deferred)
Owner: Zap Scanware engineering
Related: `MALWARE_ENGINES.md` (threat-intel engines), `AGENTS.md` (architecture)

> Implementation verified by `./gradlew testDebugUnitTest assembleDebug`
> (51 unit tests, 0 failures). See §11 for the implementation log.

## 1. Objective

Move from the current split (`MalwareRepository.scanAPK` = deep APK analysis vs.
`scanGenericFile` = hash-only reputation) to a **content-aware engine that
identifies a file by its true format (magic bytes), then runs a format-specific
analyzer** for every common malware carrier — not just APKs.

Current gaps:

- `data/repository/MalwareRepository.kt` `scanGenericFile` only computes
  SHA-256 and queries feeds/Bazaar/VirusTotal.
- `core/security/APKAnalyzer.kt` understands APK metadata + raw DEX byte
  patterns only.
- No `.aab`, `.apks`/`.xapk`, PE (`.exe`/`.dll`), ELF (`.so`), script, archive,
  or macro-document analysis.
- File discovery already collects a broad extension set
  (`core/security/ApkFinder.kt` `SCAN_EXTENSIONS`) but analysis is shallow.

## 2. Target format coverage

| Class | Extensions | Analysis depth |
|---|---|---|
| Android packages | `.apk`, `.apks`, `.xapk`, `.aab` | Manifest, permissions, signer, DEX strings, bundle modules |
| Dalvik/JVM | `.dex`, `.odex`, `.cdx`, `.jar`, `.class` | String/API/opcode patterns, embedded payloads |
| Windows PE | `.exe`, `.dll`, `.sys`, `.scr`, `.msi`, `.cpl`, `.ocx` | Header, sections, imports, packer/entropy, strings |
| Linux/ELF | `.so`, `.elf`, `.bin`, `.ko` | Header, symbols, packer, suspicious imports |
| macOS (optional) | `.dmg`, Mach-O | Header/segments, embedded scripts |
| Scripts | `.js`, `.jse`, `.vbs`, `.vbe`, `.ps1`, `.bat`, `.cmd`, `.sh`, `.py`, `.hta`, `.wsf`, `.lnk` | Obfuscation, downloader/eval, encoded payloads |
| Archives/containers | `.zip`, `.rar`, `.7z`, `.tar`, `.gz`, `.cab`, `.iso` | Recursive member scan, bomb guards |
| Documents w/ macros | `.docm`, `.xlsm`, `.pptm`, `.doc`, `.xls`, `.pdf`, `.rtf`, `.one` | VBA/OLE, embedded objects, PDF JS/OpenAction |
| Generic | anything else | Hash + entropy + feed reputation |

## 3. Architecture

Pluggable dispatch layer:

```
core/analysis/
├── FileType.kt                // enum + family + extension mapping
├── FileTypeIdentifier.kt      // magic-byte sniffing (not extension trust)
├── AnalysisReport.kt          // findings, reasons, metadata
├── FileAnalyzer.kt            // interface: supports(type) + analyze(...)
├── ScanDispatcher.kt          // identifier → analyzer → report
└── analyzers/
    ├── AndroidPackageAnalyzer.kt   // wraps APKAnalyzer (Phase 0)
    └── GenericFileAnalyzer.kt      // hash/metadata fallback (Phase 0)
    // Phase 1+: AabAnalyzer, DexAnalyzer, JarAnalyzer, PeAnalyzer,
    //           ElfAnalyzer, ScriptAnalyzer, ArchiveAnalyzer, DocumentAnalyzer
```

- `MalwareRepository` calls `ScanDispatcher.dispatch(context, file)` then runs
  the existing reputation pipeline (feeds → Bazaar → VirusTotal → providers) and
  merges signals; any single malicious signal wins.
- Analyzers return `AnalysisReport(reasons, threatLevel, matchedSignatures,
  embeddedFiles, metadata)`; the dispatcher recursively scans `embeddedFiles`.
- **Never execute** anything — static-only, streaming, bounded, off-main.

## 4. Per-analyzer detail

**Android packages**
- `.aab`: parse as ZIP, read `BundleConfig.pb` (protobuf) + `base/dex/*`,
  `base/manifest/AndroidManifest.xml` (binary XML) → reuse manifest scoring.
- `.apks`/`.xapk`: ZIP of APKs → recurse into each via `AndroidPackageAnalyzer`.
- `.dex`: extend current `collectThreats` into an API/string/opcode matcher; add
  entropy to catch packed/encrypted DEX.

**PE (highest value for trojans/keyloggers)**
- Pure-Kotlin parser: DOS `MZ`, PE/COFF headers, optional header, section table,
  import/export directory, resources, digital-signature presence.
- Heuristics: per-section entropy (packed), writable+executable sections,
  `UPX`/`MPRESS`/`Themida` markers, missing signature, timestamp anomalies.
- Keylogger/dropper scoring from imports: `SetWindowsHookEx`,
  `GetAsyncKeyState`, `WriteProcessMemory`, `CreateRemoteThread`,
  `VirtualAllocEx`, `URLDownloadToFile`, `WinExec`, `ShellExecute`,
  `CryptEncrypt`.
- String extraction (ASCII + UTF-16) → URLs, IPs, registry keys, ransom notes.

**ELF** — header/section/symbol parse; packer and suspicious-symbol heuristics;
treat `.so` shipped inside APKs as a signal.

**Scripts** — tokenize and score obfuscation: `eval`, `fromCharCode`, `chr()`,
`-EncodedCommand`, `IEX`, `DownloadString`, `WScript.Shell`, `ActiveXObject`,
long base64 blobs, high-entropy strings, embedded PE/URLs, macro auto-run
(`AutoOpen`, `Document_Open`).

**Archives** — recursively dispatch members; **BombGuard** enforces max
uncompressed size (≈200 MB), max ratio (≈100:1), max entries, max depth (≈3).

**Documents** — OLE/CFB parse for `vbaProject.bin` (macro present = flagged),
embedded executables, PDF `/JS`, `/OpenAction`, `/Launch`, `/EmbeddedFile`.

## 5. Rule & signature engine

- **Magic-byte identification** table (authoritative over extension).
- **YARA-subset rule engine** in pure Kotlin: `strings` (text/hex/regex, nocase,
  wide) + condition subset (`all of them`, `any of them`, `N of them`, `not`,
  `and`/`or`, parentheses, `filesize <op> <size>`, `$id`/`$id*`/`$*`). Rules are
  delivered via feeds and a bundled baseline. Avoids native YARA/NDK APK-size
  cost; full YARA-X deferred to Phase 7.
- **`ThreatFeed` schema v2** (`core/signatures/SignatureFeedModels.kt`):
  `sha256`, `malicious_domains`, `suspicious_domains`, `dex_patterns`,
  **`yara_rules`**. The parser still accepts the legacy `…/1` schema, and merge
  stays additive (feeds can only add entries). PE-import and script indicators
  are bundled in the rule engine / analyzers rather than as separate arrays.

## 6. Data model & UI

- `DeviceFinding` (`core/security/DeviceFinding.kt`): add `fileType`,
  `threatName`, `matchedSignatures`.
- `FindingType`: add `ARCHIVE`, `SCRIPT`, `DOCUMENT`, `PE`, `ELF`.
- `ScanHistoryEntity`: add `fileType` + `threatName` → **Room migration v1→v2**
  (`data/db/MalwareShieldDatabase.kt`, currently `version = 1`).
- `FullDeviceScanner`: route every `FoundFile` through `ScanDispatcher` and
  surface real reasons.
- `ApkFinder.SCAN_EXTENSIONS`: add `.aab`, `.odex`, `.class`, `.lnk`, `.hta`,
  `.wsf`, `.one`.
- UI: result cards show file type + detection names; History type filter; update
  `GuideScreen`/`SettingsScreen` copy.

## 7. Performance, safety, privacy

- Bounded dispatcher for parallel member analysis; streaming hashing (already
  8 KB); skip files over a size cap; cache hashes by path+mtime+size.
- Hard caps on recursion, decompression, string extraction, and per-file rule
  scanning time.
- No execution, no dynamic analysis, no uploads without explicit opt-in; logs
  stay redacted (`LogRedactor`).
- Keep `MANAGE_EXTERNAL_STORAGE` optional; prefer MediaStore/SAF.

## 8. Phased roadmap

| Phase | Deliverable | Effort | Status |
|---|---|---|---|
| 0 | `FileTypeIdentifier` + `ScanDispatcher` + analyzer interface | S | done |
| 1 | Android deep coverage: `.aab`, `.apks`, `.xapk`, `.dex`/`.odex`, `.jar` | M | done |
| 2 | PE parser + packer/import/keylogger heuristics | L | done |
| 3 | Script obfuscation analyzer | M | done |
| 4 | Recursive archive + BombGuard; OLE/macro/PDF | M | done |
| 5 | YARA-subset engine + feed schema v2 + bundled rules | L | done |
| 6 | DB migration, UI surfacing, history filters, docs | M | done |
| 7 | Optional native engine (full YARA-X / ClamAV) if APK budget allows | XL | deferred |

## 9. Testing

- Unit fixtures: EICAR string, benign corpus, synthetic "keylogger" PE,
  obfuscated JS/PS1, macro-enabled doc, nested zip, zip bomb, truncated/malformed
  files (analyzers must never crash the scan).
- Property tests for parsers (bounds/offset fuzzing).
- Regression: `./gradlew assembleDebug` + `./gradlew test`.

## 10. Risks

- Pure-Kotlin PE/ELF/YARA parsing is attack surface — enforce strict bounds and
  `runCatching` per analyzer.
- Remote rule feeds are untrusted input — validate/cap before applying (already
  done for current feeds).
- APK size growth if native engines are added (defer to Phase 7).
- False positives from aggressive heuristics — keep weighted scoring + explicit
  reasons, not hard blocks.

## 11. Implementation log

### Phase 0 — format identification + dispatch
`app/src/main/java/com/malwareshield/core/analysis/`
- `FileType.kt` — `FileFamily` + `FileType` enum (Android, Dalvik/JVM, PE, ELF,
  Mach-O, script, archive, document) with extension lookup and `isExecutable`.
- `FileTypeIdentifier.kt` — magic-byte sniffing (MZ, ELF, Mach-O, ZIP, RAR, 7z,
  gzip, PDF, RTF, OLE, `dex\n`, `dey\n`, shebang) that overrides disguised
  extensions; refines ZIP containers by entry names.
- `AnalysisReport.kt`, `FileAnalyzer.kt`, `ScanDispatcher.kt` — run-all-and-merge
  pipeline; `dispatchMember()` prevents unbounded archive recursion.
- `analyzers/AndroidPackageAnalyzer.kt`, `analyzers/GenericFileAnalyzer.kt`.
- Wired into `MalwareRepository.scanGenericFile`; `FileScanResult.fileType`.

### Phase 1 — Android deep coverage
- `analyzers/DexAnalyzer.kt` — DEX/ODEX API/string scan + entropy (packing).
- `analyzers/JarAnalyzer.kt` — JAR/CLASS bytecode scan + embedded payloads.
- `analyzers/AabAnalyzer.kt` — `.aab` module DEX + binary-manifest strings.
- `analyzers/ArchivePackageAnalyzer.kt` — `.apks`/`.xapk` split-APK containers.

### Phase 2 — Windows PE
- `pe/PeParser.kt` — bounds-checked PE32/PE32+ header, sections, signature flag.
- `analyzers/PeFileAnalyzer.kt` — packer sections, writable+executable sections,
  per-section entropy, suspicious imports (keylogger/injection/downloader).

### Phase 3 — Scripts
- `analyzers/ScriptFileAnalyzer.kt` — obfuscation/execution primitives, Base64
  blobs, URLs, entropy for JS/VBS/PS1/BAT/SH/PY/HTA/LNK.

### Phase 4 — Archives & documents
- `archive/BombGuard.kt` — entry/size/ratio/entry-count limits.
- `analyzers/ArchiveAnalyzer.kt` — recursive ZIP/GZIP/TAR member analysis,
  double-extension disguise detection; RAR/7z/CAB/ISO entropy-scanned.
- `analyzers/DocumentFileAnalyzer.kt` — OOXML macros/embedded exe, OLE VBA,
  PDF active content, RTF object embedding, OneNote.

### Phase 5 — Rule engine & feeds
- `rules/YaraRule.kt` (model + matcher, hex nibble wildcards), `RuleParser.kt`,
  `RuleCondition.kt` (recursive-descent boolean/`filesize`/`N of them`),
  `RuleEngine.kt`, `BundledRules.kt` (EICAR, Android SMS/loader, script
  downloader, keylogger, injection, ransomware note, PDF JS, UPX).
- `analyzers/SignatureRuleAnalyzer.kt` — runs the engine on every file.
- `ThreatFeed` → schema `malwareshield-threat-feed/2` with `yara_rules`
  (legacy `/1` still accepted); `SignatureFeedManager` compiles feed rules into
  `RuleEngine` on load and refresh; `FeedStatus.yaraRuleCount`.

### Phase 6 — Data model, device scan, UI
- `ScanHistoryEntity` + `fileType`/`threatName`; **Room migration v1→v2**
  (`MalwareShieldDatabase.MIGRATION_1_2`, non-destructive).
- `DeviceFinding` + `fileType`/`threatName`.
- `FullDeviceScanner` now routes every file through `ScanDispatcher` and records
  real reasons/type/signature; `MalwareRepository.scanAPK` records `fileType`.
- UI: `ScanScreen` shows detected type; `DeviceScanScreen` shows type/signature;
  `HistoryScreen` shows type/signature + a filter-chip row.

### Phase 7 — deferred
Native full YARA-X / ClamAV integration is intentionally not implemented: it
would add NDK/native-code surface and materially increase APK size. Revisit only
if a native engine fits the size/permission budget. See `MALWARE_ENGINES.md`.

### Verification
```
./gradlew testDebugUnitTest assembleDebug
```
- 51 unit tests, 0 failures:
  `FileTypeIdentifierTest` (24), `RuleEngineTest` (13), `PeParserTest` (5),
  `EntropyTest` (5), `BytePatternScannerTest` (4).
- Debug APK produced at `app/build/outputs/apk/debug/zap-scanware-debug.apk`.

### New files (summary)
```
core/analysis/
├── FileType.kt, FileTypeIdentifier.kt, AnalysisReport.kt, FileAnalyzer.kt, ScanDispatcher.kt
├── analyzers/
│   ├── AndroidPackageAnalyzer.kt, ArchivePackageAnalyzer.kt, AabAnalyzer.kt
│   ├── DexAnalyzer.kt, JarAnalyzer.kt, PeFileAnalyzer.kt, ScriptFileAnalyzer.kt
│   ├── ArchiveAnalyzer.kt, DocumentFileAnalyzer.kt, SignatureRuleAnalyzer.kt
│   └── GenericFileAnalyzer.kt
├── archive/BombGuard.kt
├── pe/PeParser.kt
├── rules/
│   ├── ThreatSignatures.kt, YaraRule.kt, RuleParser.kt, RuleCondition.kt
│   ├── RuleEngine.kt, BundledRules.kt
└── util/ (BytePatternScanner.kt, Entropy.kt, StringExtractor.kt, AnalysisIo.kt)
```

