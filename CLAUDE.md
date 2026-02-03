# CLAUDE.md — Autonomous Agent Instructions

> This file is the single source of truth for any Claude agent operating on this repository.
> Read it **completely** before touching any code. Every decision you make should trace back to something in here.

-----

## 0. WHAT YOU ARE DOING AND WHY

You are an autonomous development agent on the **CLAUDE** project:
**Continuous Learning and Unified Development Environment**.

A React Native system designed to operate continuously — persisting state, healing itself, running background tasks, and staying alive even when no human is watching.

Your job is not just to write code. Your job is to **keep the system moving toward production-ready, deployable quality**, autonomously. That means you:

- Finish incomplete modules before starting new ones.
- Fix what is broken before building what is next.
- Write code that a future agent (or human) can read, understand, and extend in 5 minutes.
- Leave the repo in a state that is always one `git push` away from being useful.

-----

## 1. CORE PRINCIPLES — NON-NEGOTIABLE

Every line of code, every file, every decision runs through these four filters. In order.

### 1.1 Modular Thinking

Each module owns one job. One file does not do two things. One function does not solve two problems. If you feel a function growing past ~40 lines of logic, it is doing too much — split it.

Modules talk to each other through explicit interfaces. No reaching into another module’s internals. No `import` that skips a barrel file or index export.

### 1.2 Iterative Refinement

Do not write perfect code on the first pass. Write working code first. Then refine. If a module is incomplete, mark it clearly with a `// TODO[priority]` comment and move to the next critical path item. Come back to it.

The system should compile and run at every commit. A half-built feature that breaks the build is worse than a stub that does nothing.

### 1.3 Context-Driven Reasoning

Before you write anything, ask: what is the current state of this module? What does it depend on? What depends on it? Read the existing code in that area first. Do not assume. Check.

If two modules need to talk and there is no established pattern for how they communicate, look at how other modules already communicate in this repo. Follow that pattern. Do not invent a new one unless the existing pattern genuinely cannot serve the use case — and if you do invent one, document why.

### 1.4 Clarity Over Cleverness

If you have to be clever to make it work, you are doing it wrong. A reader who has never seen this codebase should understand what a function does by reading its name and its first 3 lines.

No one-liners that do 4 things. No ternaries nested inside ternaries. No “magic” variable names. Comments explain **why**, not **what** — the code already says what.

-----

## 2. REPOSITORY STRUCTURE — KNOW THE MAP

```
claude-continuous-system/
│
├── CLAUDE.md                        ← YOU ARE HERE. Read this first, always.
├── README.md                        ← Public-facing project overview
├── CONTRIBUTING.md                  ← Human contributor guidelines
├── package.json                     ← Dependencies, scripts, metadata
├── tsconfig.json                    ← TypeScript config (path aliases matter)
├── app.json                         ← React Native app metadata
├── index.js                         ← RN entry point (do not modify unless required)
├── config.example.js                ← Env config template (copy to config.js locally)
│
├── .github/
│   └── workflows/
│       └── ci.yml                   ← GitHub Actions CI/CD pipeline
│
├── docs/
│   ├── ARCHITECTURE.md              ← System architecture (read before changing core/)
│   └── QUICKSTART.md                ← Dev environment setup
│
└── src/
    ├── App.tsx                      ← Root component. Bootstraps the system.
    │
    ├── core/                        ← THE ENGINE. Continuous operation lives here.
    │   ├── SystemInitializer.ts     ← Startup orchestrator. Boots everything in order.
    │   ├── eventLoop/
    │   │   └── EventLoopManager.ts  ← The heartbeat. Drives all continuous tasks.
    │   ├── scheduler/
    │   │   └── TaskQueue.ts         ← Task prioritization and execution queue.
    │   └── persistence/
    │       └── PersistenceLayer.ts  ← State snapshots. Recovery. Checkpointing.
    │
    ├── services/                    ← BUSINESS LOGIC. Runs on top of core/.
    │   ├── background/
    │   │   ├── BackgroundService.ts ← Platform-specific background execution.
    │   │   └── index.ts             ← Barrel export — always import from here.
    │   ├── health/
    │   │   └── HealthMonitor.ts     ← Tracks uptime, errors, resource usage.
    │   └── state/
    │       └── systemStore.ts       ← Zustand global store. Single source of state.
    │
    ├── screens/                     ← UI. Thin. They read state, render, dispatch actions.
    │   └── HomeScreen.tsx           ← Primary dashboard view.
    │
    ├── components/                  ← Reusable UI primitives. No business logic here.
    ├── utils/                       ← Pure utility functions. No side effects.
    └── types/                       ← TypeScript interfaces and type definitions.
```

### Layer Rules (strict, do not violate)

```
screens/  →  can use  →  services/  →  can use  →  core/
   ↓                        ↓                       ↓
components/              state/                   types/
   ↓                        ↓
utils/                   utils/
```

- `core/` does **not** import from `services/` or `screens/`.
- `services/` does **not** import from `screens/`.
- `screens/` does **not** import from `core/` directly — go through `services/`.
- `utils/` imports nothing from the project except `types/`.
- `components/` imports nothing except `utils/` and `types/`.

-----

## 3. TECH STACK — VERSIONS AND WHY

|Layer               |Library                                        |Why                                                   |
|--------------------|-----------------------------------------------|------------------------------------------------------|
|Framework           |React Native 0.72+                             |Cross-platform, single codebase iOS + Android         |
|Language            |TypeScript 5.0+                                |Compile-time safety. No implicit `any`. Ever.         |
|State               |Zustand                                        |Tiny, fast, no boilerplate. One store.                |
|Persistence         |AsyncStorage                                   |Simple key-value. Sufficient for our snapshot model.  |
|Background (Android)|react-native-background-fetch + Headless JS    |Keeps the event loop alive when app is in background  |
|Background (iOS)    |react-native-background-fetch + BGTaskScheduler|iOS background modes via native module                |
|Testing             |Jest + React Native Testing Library            |Unit and integration. Every module has tests.         |
|Linting             |ESLint + Prettier                              |Enforced in CI. Do not commit code that does not pass.|
|CI/CD               |GitHub Actions                                 |Defined in `.github/workflows/ci.yml`. Do not bypass. |

-----

## 4. THE EVENT LOOP — HOW THE SYSTEM STAYS ALIVE

This is the most important architectural concept in the project. Understand it before modifying anything in `core/`.

```
┌─────────────────────────────────────────────────────┐
│                   EventLoopManager                   │
│                                                     │
│  START → processEvents() → executeTasks()           │
│              ↓                    ↓                  │
│        updateState()        checkHealth()           │
│              ↓                    ↓                  │
│        persistCheckpoint()  healIfNeeded()          │
│              ↓                                      │
│        WAIT (adaptive delay)                        │
│              ↓                                      │
│        LOOP ←───────────────────────────────────────│
└─────────────────────────────────────────────────────┘
```

The delay between iterations is **adaptive**. Under load, it tightens. Under idle, it relaxes. This is how the system stays alive without burning battery.

The loop **never** throws an unhandled exception. Every iteration is wrapped. If a step fails, it logs, records the failure in HealthMonitor, and continues. The system does not die because one task crashed.

-----

## 5. STATE MANAGEMENT RULES

All global state lives in `src/services/state/systemStore.ts` (Zustand).

Rules:

- One store. No Redux. No Context for global state. Zustand, period.
- State shape is defined in `src/types/`. The store imports types, never defines them.
- Mutations are named actions. `setState` is not called directly outside the store file.
- Derived state (computed values) live as selectors, not as stored values. Do not duplicate.
- Persistence is handled by `PersistenceLayer`, not by the store itself. The store does not know about AsyncStorage.

-----

## 6. PERSISTENCE AND RECOVERY

The system must survive being killed by the OS. This is non-negotiable for a continuous system on mobile.

How it works:

1. `PersistenceLayer` snapshots state at configurable intervals.
1. On startup, `SystemInitializer` checks for a snapshot.
1. If a snapshot exists and is valid, state is restored before the event loop starts.
1. If the snapshot is corrupt, the system boots fresh and logs a recovery event.

When you add new state that must survive restarts, you must:

- Add it to the type definitions in `types/`.
- Include it in the snapshot payload in `PersistenceLayer`.
- Write a recovery test.

Do not skip the test. Recovery is the hardest thing to get right and the easiest thing to break silently.

-----

## 7. BACKGROUND SERVICE — PLATFORM SPECIFICS

`BackgroundService` abstracts over iOS and Android differences. You write one call. It does the right thing per platform.

Do **not** write platform-specific code outside of `BackgroundService` unless absolutely necessary. If you must, gate it with `Platform.OS` and document why the abstraction was insufficient.

iOS background modes must be declared in `app.json` under `ios.infoPlist`. If you add a new background capability, add it there too.

Android foreground service types must be declared in `AndroidManifest.xml`. Same rule.

-----

## 8. TASK PRIORITY SYSTEM

Tasks scheduled through `TaskQueue` have four priority levels:

|Priority|When to use                                              |Example                          |
|--------|---------------------------------------------------------|---------------------------------|
|CRITICAL|System survival. If this fails, the system is broken.    |Health check, state persistence  |
|HIGH    |Core functionality. Important but recoverable if delayed.|Background sync, event processing|
|NORMAL  |Standard operations. Run when resources allow.           |Analytics, UI updates            |
|LOW     |Nice to have. Drop if under resource pressure.           |Cache warming, prefetch          |

When you add a new task, assign it a priority and justify it in a comment. Do not default to HIGH.

-----

## 9. HEALTH MONITOR — WHAT TO TRACK

`HealthMonitor` is the system’s black box. It records everything.

Currently tracked:

- Uptime (continuous since last crash)
- Error count and error log (last 100 errors)
- Memory pressure events
- Event loop iteration time (average and p95)
- Recovery events (how many times the system booted from a snapshot)

When you add a new failure mode, add a corresponding health metric. The dashboard reads from HealthMonitor. If it is not tracked, it does not exist.

-----

## 10. CODING STANDARDS — ENFORCED

### File naming

- Components: `PascalCase.tsx`
- Everything else: `camelCase.ts`
- Barrel files: `index.ts` — every folder in `services/` and `core/` must have one.

### Imports

- Always import from barrel files, not from individual file paths (unless you are inside the same module).
- Group imports: React first, then third-party, then internal. Blank line between groups.
- Path aliases are configured in `tsconfig.json`. Use them. Do not write `../../../` chains.

### Error handling

- Every async function that can fail must have a try/catch.
- Errors are logged via a centralized logger (do not use raw `console.log` in production code).
- Errors in the event loop are caught at the iteration level. The loop does not stop.

### Testing

- Every module in `core/` must have a corresponding `.test.ts` file.
- Every service in `services/` must have a corresponding `.test.ts` file.
- Tests live in the same directory as the code they test (co-located).
- Tests must pass before anything is considered done. No exceptions.

### Comments

- `// TODO[priority]: description` — marks unfinished work. Priority is CRITICAL, HIGH, NORMAL, or LOW.
- `// WHY: explanation` — explains a non-obvious decision. Not what the code does. Why.
- No commented-out code in commits. If it is dead, delete it.

-----

## 11. WHAT TO DO WHEN YOU START — AUTONOMOUS WORKFLOW

Follow this order. Every time. Every session.

```
1. READ this file completely. (You are doing this now.)

2. CHECK the current state of the repo.
      → Run: git status
      → Run: git log --oneline -10
      → Check for any TODO[CRITICAL] in the codebase.

3. ASSESS what is broken or incomplete.
      → Run the test suite: npm test
      → If tests fail, fix them first. Nothing else matters until tests pass.

4. PRIORITIZE.
      → CRITICAL TODOs first.
      → Broken tests second.
      → Incomplete modules third (finish what is started before starting new).
      → New features last.

5. WORK in small, committed increments.
      → One logical change per commit.
      → Commit message format: `type(scope): description`
        Types: feat, fix, chore, docs, test, refactor
        Example: `fix(eventLoop): handle null state on first iteration`

6. BEFORE you stop (or between tasks):
      → Run tests. They must pass.
      → Run linting. It must pass.
      → Leave no uncommitted changes.
      → Update any TODO comments you touched (remove if done, reprioritize if needed).
      → If you added something significant, update docs/ accordingly.
```

-----

## 12. DEPLOYMENT READINESS CHECKLIST

Before the project is tagged for a release, every item here must be true:

- [ ] All tests pass (`npm test` — zero failures).
- [ ] Linting passes (`npm run lint` — zero errors).
- [ ] No `TODO[CRITICAL]` comments remain in the codebase.
- [ ] `PersistenceLayer` recovery has been tested end-to-end (kill app, restart, verify state).
- [ ] `BackgroundService` tested on both iOS and Android simulators.
- [ ] `HealthMonitor` correctly logs errors, recovery events, and uptime.
- [ ] `EventLoopManager` runs for 10+ minutes without memory leak or crash in dev.
- [ ] `config.example.js` reflects all required configuration keys.
- [ ] `README.md` is up to date with current setup instructions.
- [ ] CI pipeline (`ci.yml`) passes on `main` branch.
- [ ] No hardcoded secrets, API keys, or test credentials in any committed file.
- [ ] `package.json` version is bumped.
- [ ] A git tag exists: `v{major}.{minor}.{patch}`.

-----

## 13. THINGS THAT WILL BREAK YOU — WARNINGS

These are known traps. Learn from them. Do not repeat them.

**1. AsyncStorage is async. Always.**
Do not assume a write is complete until the promise resolves. PersistenceLayer handles this. Do not write to AsyncStorage directly from anywhere else.

**2. The event loop runs on a timer, not on user input.**
Do not build anything that assumes a user is present. The system must behave identically whether the app is foregrounded, backgrounded, or the screen is off.

**3. iOS kills background tasks aggressively.**
Do not schedule background work that takes more than ~30 seconds per execution on iOS. If you need longer, break it into chunks and reschedule.

**4. Zustand state is in-memory. It is gone on app kill.**
Everything that needs to survive a restart goes through PersistenceLayer. Period.

**5. TypeScript strict mode is on.**
`noImplicitAny`, `strictNullChecks`, `strictFunctionTypes` — all enabled. Do not add `// @ts-ignore`. Fix the type.

**6. Tests are co-located, not in a separate **tests** folder.**
`EventLoopManager.ts` → `EventLoopManager.test.ts` in the same directory. If you put tests in the wrong place, CI will not find them.

-----

## 14. HOW TO ADD A NEW MODULE

Follow this exact sequence:

```
1. Define the types first.
      → Add interfaces/types to src/types/
      → Compile. Make sure it builds.

2. Create the module file.
      → Place it in the correct layer (core/, services/, etc.)
      → Export nothing yet. Just the skeleton.

3. Write the tests first (TDD).
      → Create ModuleName.test.ts in the same directory.
      → Write tests that will fail because the module is a skeleton.

4. Implement the module.
      → Make the tests pass.
      → Follow all coding standards from Section 10.

5. Wire it in.
      → Add to the barrel file (index.ts) in that directory.
      → Import and use wherever needed, following layer rules from Section 2.

6. Document it.
      → If it is in core/, update docs/ARCHITECTURE.md.
      → Add a TODO comment only if something is intentionally left incomplete.

7. Commit.
      → One commit. Clean message. Tests passing.
```

-----

## 15. CONTACT AND ESCALATION

If you encounter something this file does not cover, or a decision that could go multiple directions and you genuinely cannot determine which is correct:

- Leave a `// TODO[HIGH]: decision needed — <describe the choice>` comment at the exact location.
- Commit what you have (tests passing, code compiling).
- Do not block. Move to the next task.

The system keeps moving. One ambiguous decision does not stop everything else.

-----

*Last updated: 2026-02-03*
*This file is maintained alongside the codebase. If you change how the system works, update this file too.*