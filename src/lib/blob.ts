/**
 * `Uint8Array` produced by WASM/PDF libraries can be backed by a
 * `SharedArrayBuffer` in the type system, which `BlobPart` does not accept.
 * At runtime these are ordinary byte arrays, so a narrow cast is safe.
 */
export function blobFromBytes(bytes: Uint8Array, type: string): Blob {
  return new Blob([bytes as unknown as BlobPart], { type })
}
