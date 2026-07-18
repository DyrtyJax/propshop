export async function promptHidden(message: string): Promise<string> {
  const input = process.stdin;
  const output = process.stderr;
  if (!input.isTTY || !output.isTTY || typeof input.setRawMode !== "function") {
    throw new Error("An interactive terminal is required. Run this command in a terminal, or pipe the token with --token-stdin.");
  }

  output.write(message);
  input.setRawMode(true);
  input.resume();
  input.setEncoding("utf8");
  return await new Promise<string>((resolve, reject) => {
    let value = "";
    const finish = (error?: Error): void => {
      input.off("data", onData);
      input.setRawMode(false);
      input.pause();
      output.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk: string): void => {
      for (const character of chunk) {
        if (character === "\u0003") return finish(new Error("Login cancelled"));
        if (character === "\r" || character === "\n") return finish();
        if (character === "\u007f" || character === "\b") value = value.slice(0, -1);
        else if (character >= " ") value += character;
      }
    };
    input.on("data", onData);
  });
}
