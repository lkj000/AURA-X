import { Client, Connection } from "@temporalio/client";
import * as fs from "fs";
import * as path from "path";

let _client: Client | null = null;

function loadCert(filename: string): Buffer | undefined {
  const certPath = path.join(__dirname, "../../temporal-certs", filename);
  if (fs.existsSync(certPath)) {
    return fs.readFileSync(certPath);
  }
  return undefined;
}

export async function getTemporalClient(): Promise<Client> {
  if (_client) return _client;

  const address  = process.env.TEMPORAL_ADDRESS  ?? "localhost:7233";
  const namespace = process.env.TEMPORAL_NAMESPACE ?? "default";

  const clientCert = loadCert("client.pem");
  const clientKey  = loadCert("client.key");

  const connection = await Connection.connect({
    address,
    tls: clientCert && clientKey
      ? { clientCertPair: { crt: clientCert, key: clientKey } }
      : undefined,
  });

  _client = new Client({ connection, namespace });
  return _client;
}
