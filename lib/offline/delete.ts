export async function deleteOfflineData(
  id: string,
  removeFiles: (id: string) => Promise<unknown>,
  removeMetadata: (id: string) => Promise<unknown>,
) {
  await removeFiles(id);
  await removeMetadata(id);
}
