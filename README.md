# L.o.S.A.

Windows 10/11 desktop launcher prototype, version 0.10.9.

## 0.10.9 — 3D Cosmetic Workshop
- Extended the existing cosmetic workshop with an interactive Three.js 3D preview and a simple mannequin/attachment-point system for hats, capes, pets, auras and other cosmetics.
- Added GLB model import, separate PNG/JPG/WEBP texture import, and live position, scale and rotation controls.
- Added preview animations: bobbing, spin and pulse.
- The preview keeps its WebGL scene alive while sliders are adjusted, avoiding renderer recreation during continuous editing.
- 3D model, texture and transform settings are stored inside the existing local IndexedDB cosmetic drafts; older drafts remain readable.
- GLB is supported as a self-contained model format in this stage. GLTF files with external assets, Minecraft skin/geometry-specific import, rigged animation editing, export pipelines and in-game rendering are follow-up work.
- The 3D editor is a local authoring prototype. It does not publish assets to the shop or inject cosmetics into Minecraft.

## Previous foundation
- 0.10.8 adds the live Modrinth catalogue for Java mods/modpacks and a separate Bedrock hub foundation.
- Bedrock add-on installation and Java local mod installation remain separate follow-up workflows.
- This draft is based on the 0.10.8 feature branch, does not change main, and must not be merged without the owner's approval.
