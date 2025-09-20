import { run, Runner } from 'graphile-worker';
import path from 'path';

async function main() {
  const runner: Runner = await run({
    connectionString: process.env.DATABASE_URL,
    taskDirectory: path.join(__dirname, 'tasks'),
    concurrency: 5,
    pollInterval: 1000
  });
  await runner.promise;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


