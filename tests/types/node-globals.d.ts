declare const process: {
  env: Record<string, string | undefined>
};

interface BufferConstructor {
  from(input: string | ArrayBuffer | ArrayBufferView): Buffer;
}

declare const Buffer: BufferConstructor & {
  prototype: Uint8Array;
};
