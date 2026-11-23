export type MinecraftVersion = {
  id: string;
  type: "release" | "snapshot" | string;
  url: string;
  time: string;
  releaseTime: string;
};

type Manifest = { latest: { release: string; snapshot: string }; versions: MinecraftVersion[] };

const MANIFEST_URL = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";

export async function getMinecraftVersions(): Promise<Manifest> {
  const response = await fetch(MANIFEST_URL, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Не удалось получить список версий (${response.status})`);
  return response.json() as Promise<Manifest>;
}
