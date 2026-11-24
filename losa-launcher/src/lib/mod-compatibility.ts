export type ModrinthVersionInfo = {
  id: string;
  name: string;
  version_number: string;
  game_versions: string[];
  loaders: string[];
  date_published: string;
  dependencies: {
    project_id?: string | null;
    version_id?: string | null;
    dependency_type: "required" | "optional" | "incompatible" | "embedded";
  }[];
};

export type ModCompatibilityReport = {
  compatible: boolean;
  gameSupported: boolean;
  loaderSupported: boolean;
  missingRequired: ModrinthVersionInfo["dependencies"];
  conflicts: ModrinthVersionInfo["dependencies"];
};

/** Checks a single Modrinth release against the target runtime and installed project IDs. */
export function checkModCompatibility(
  version: ModrinthVersionInfo,
  gameVersion: string,
  loader: string,
  installedProjectIds: string[],
): ModCompatibilityReport {
  const gameSupported = version.game_versions.includes(gameVersion);
  const loaderSupported = loader === "any" || version.loaders.includes(loader);
  const missingRequired = version.dependencies.filter(
    dependency => dependency.dependency_type === "required"
      && Boolean(dependency.project_id)
      && !installedProjectIds.includes(dependency.project_id as string),
  );
  const conflicts = version.dependencies.filter(
    dependency => dependency.dependency_type === "incompatible"
      && Boolean(dependency.project_id)
      && installedProjectIds.includes(dependency.project_id as string),
  );

  return {
    compatible: gameSupported && loaderSupported && conflicts.length === 0,
    gameSupported,
    loaderSupported,
    missingRequired,
    conflicts,
  };
}
