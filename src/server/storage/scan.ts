import "server-only";
import net from "node:net";
import { env } from "../env";

export type ScanResult = "CLEAN" | "INFECTED" | "NOT_SCANNED";

/** ClamAV clamd INSTREAM protocol. With MALWARE_SCANNER=none returns NOT_SCANNED (surfaced in UI). */
export async function scanBuffer(buf: Buffer): Promise<ScanResult> {
  const e = env();
  if (e.MALWARE_SCANNER === "none") return "NOT_SCANNED";
  return new Promise<ScanResult>((resolve, reject) => {
    const socket = net.createConnection({ host: e.CLAMAV_HOST, port: e.CLAMAV_PORT });
    let response = "";
    socket.setTimeout(30_000, () => socket.destroy(new Error("ClamAV timeout")));
    socket.on("connect", () => {
      socket.write("zINSTREAM\0");
      for (let i = 0; i < buf.length; i += 64 * 1024) {
        const chunk = buf.subarray(i, i + 64 * 1024);
        const size = Buffer.alloc(4);
        size.writeUInt32BE(chunk.length);
        socket.write(size);
        socket.write(chunk);
      }
      socket.write(Buffer.alloc(4));
    });
    socket.on("data", (d) => (response += d.toString()));
    socket.on("end", () => resolve(response.includes("FOUND") ? "INFECTED" : "CLEAN"));
    socket.on("error", reject);
  });
}
