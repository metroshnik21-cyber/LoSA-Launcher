# L.o.S.A. — Launcher of Spark Anvil

Windows 10/11 desktop launcher prototype, version 0.4.0.

## What is included
- React + TypeScript + Vite desktop UI
- Tauri 2 desktop shell
- Approved L.o.S.A. logo in the UI and Windows app icon
- GitHub Actions workflow that builds a Windows NSIS `.exe` installer
- Live official Mojang release-version catalog
- Windows Java runtime detection command
- Microsoft device-code OAuth flow with Xbox Live, XSTS, Minecraft Services and Java profile lookup
- Russian-language starter interface for Home, Play, Friends, Mods & Packs, Servers, Settings

## Build locally
Prerequisites: Node.js 20+, Rust stable, and the Windows build tools required by Tauri 2.

```bash
npm install
npm run desktop:dev
```

Create the Windows installer:

```bash
npm run desktop:build
```

The NSIS installer is produced under:
`src-tauri/target/release/bundle/nsis/`

## Build without compiling on your PC
1. Create a GitHub repository and upload the contents of this folder.
2. Open the repository's **Actions** tab.
3. Select **Build L.o.S.A. for Windows** and click **Run workflow**.
4. Download the `L-o-S-A-Windows-Installer` artifact from the completed run. It contains the `.exe` installer.

## Current implementation status
This milestone adds the Microsoft device-code login flow and Minecraft Java profile lookup. A Microsoft OAuth public Client ID must be registered and entered in Settings before sign-in can work. Tokens are held only in memory for this milestone; secure token storage, automatic Java provisioning, downloading game files, and actual game launch are not implemented yet. Friends, online lobbies, multiplayer and mod installation are planned follow-up milestones. No Minecraft game files are bundled.

Bedrock Edition is not redistributed by this project; future support should launch a legally installed copy from Microsoft Store/Xbox. Cross-play between Java and Bedrock requires a compatible server-side bridge (for example, Geyser), not just a launcher.

## Project identity
**L.o.S.A. — Launcher of Spark Anvil**  
Creator: **Spark_Anvil**


## Microsoft app registration required
Create an app registration that supports personal Microsoft accounts and public client flows. Enter its Application (client) ID in Settings. Do not add a client secret to this desktop app. Microsoft/Xbox/Minecraft service access can still be denied if the app registration lacks the required permissions or the account does not own Minecraft Java Edition.
