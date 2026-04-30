import { Worker, NativeConnection } from "@temporalio/worker";
import * as fs from "fs";
import * as path from "path";
import { datasetActivities } from "./activities/datasetActivities";
import { agentActivities } from "./activities/agentActivities";

function loadCert(filename: string): Buffer | undefined {
  const certPath = path.join(__dirname, "../../temporal-certs", filename);
  if (fs.existsSync(certPath)) return fs.readFileSync(certPath);
  return undefined;
}

export async function startWorker(): Promise<Worker> {
  const address   = process.env.TEMPORAL_ADDRESS   ?? "localhost:7233";
  const namespace = process.env.TEMPORAL_NAMESPACE ?? "default";
  const taskQueue = process.env.TEMPORAL_TASK_QUEUE ?? "aura-x-dataset";

  const clientCert = loadCert("client.pem");
  const clientKey  = loadCert("client.key");

  const connection = await NativeConnection.connect({
    address,
    tls: clientCert && clientKey
      ? { clientCertPair: { crt: clientCert, key: clientKey } }
      : undefined,
  });

  const worker = await Worker.create({
    connection,
    namespace,
    taskQueue: taskQueue,
    workflowsPath: require.resolve("./workflows/datasetIngestion"),
    activities:    datasetActivities,
  });

  return worker;
}

export async function startAgentWorker(): Promise<Worker> {
  const address    = process.env.TEMPORAL_ADDRESS          ?? "localhost:7233";
  const namespace  = process.env.TEMPORAL_NAMESPACE        ?? "default";
  const taskQueue  = process.env.TEMPORAL_AGENT_TASK_QUEUE ?? "aura-x-agent";

  const clientCert = loadCert("client.pem");
  const clientKey  = loadCert("client.key");

  const connection = await NativeConnection.connect({
    address,
    tls: clientCert && clientKey
      ? { clientCertPair: { crt: clientCert, key: clientKey } }
      : undefined,
  });

  const worker = await Worker.create({
    connection,
    namespace,
    taskQueue: taskQueue,
    workflowsPath: require.resolve("./workflows/autonomousGeneration"),
    activities:    agentActivities,
  });

  return worker;
}
