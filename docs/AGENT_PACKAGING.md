# Agent Packaging

This project provides two packaging scripts:

## 1) ZIP package (clean)
Creates a clean zip with only the required files (agent + shared).

```
scripts/package_agent.ps1
```

Output:
```
dist/agent_v<AGENT_VERSION>.zip
```

## 2) Windows EXE (PyInstaller)
Builds a single-file EXE. Requires Python and PyInstaller.

```
scripts/build_agent_exe.ps1
```

Output:
```
dist/AC_Manager_Agent.exe
```

## Notes
- The ZIP excludes `agent/config.json` to avoid leaking tokens.
- Use the EXE if you want a single-file installer.
